import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { assertActiveAuthorityPublication } from "../../../tools/milestone-orchestrator/src/authority-publication.mjs";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "c6a-authority-fixture-repair",
  "retained-fixture-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const gitBytes = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    windowsHide: true,
    timeout: 30_000,
  });
const git = (...args: string[]) =>
  gitBytes(...args)
    .toString("utf8")
    .trim();
const sourcePath = (name: string) =>
  name
    .replaceAll("\\", "/")
    .slice(name.replaceAll("\\", "/").indexOf("/tools/") + 1);
const identities = (report) =>
  report.testResults
    .flatMap((file) =>
      file.assertionResults.map(
        (test) => `${sourcePath(file.name)}#${test.fullName}`,
      ),
    )
    .sort();
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.sourceBase, "6ae4efb808652e24d565cf5562c0611aac5ed25a");
  assert.equal(await assertActiveAuthorityPublication(repo), "legacy");
  const before = {
    head: git("rev-parse", "HEAD"),
    index: git("write-tree"),
    status: git("status", "--porcelain=v2"),
    refs: git(
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      "refs/milestone-loop/",
    ),
  };
  assert.equal(before.refs, "");
  assert(!existsSync(resolve(repo, "artifacts/orchestrator/state/state.json")));
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(input, path))) {
      const child = path ? path + "/" + name : name,
        absolute = resolve(input, child),
        info = await lstat(absolute);
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) await walk(child);
      else {
        assert(info.isFile() && info.size <= 20_000_000);
        const bytes = await readFile(absolute);
        files.push({ path: child, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await walk();
  const order = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), manifest.files.sort(order));
  for (const pin of [...manifest.implementation, ...manifest.activeGeneration])
    assert.equal(
      hash(await readFile(resolve(repo, pin.path))),
      pin.sha256,
      pin.path,
    );
  for (const pin of manifest.activeGeneration)
    assert.equal(
      hash(gitBytes("show", `${manifest.sourceBase}:${pin.path}`)),
      pin.sha256,
      `Unchanged authority/runtime: ${pin.path}`,
    );

  const projection = await read("vm-1/input/projection.json");
  assert.equal(projection.sourceBase, manifest.sourceBase);
  assert.equal(
    projection.sourceBaseTree,
    git("rev-parse", manifest.sourceBase + "^{tree}"),
  );
  assert.equal(projection.paths.length, 10);
  assert.equal(new Set(projection.paths).size, 10);
  // Reconstruct exactly the single fixture write permitted in each file. Whole
  // remaining source equality preserves every original assertion and deadline.
  for (const path of projection.paths) {
    const prior = gitBytes("show", `${manifest.sourceBase}:${path}`)
      .toString("utf8")
      .replaceAll("\r", "")
      .trimEnd();
    const lines = prior.split("\n");
    const index = lines.findIndex((line) =>
      /await writeFile\((join\(root, path\)|absolute|path), `\$\{(path|file)\}\\n`/.test(
        line,
      ),
    );
    assert(index >= 0, path);
    const old = lines[index],
      indent = old.match(/^\s*/)![0];
    const expression = old.includes("join(root, path)")
      ? "join(root, path)"
      : old.includes("(absolute")
        ? "absolute"
        : "path";
    const name = path.includes("deterministic-operations") ? "file" : "path";
    const replacement = [
      indent + "await writeFile(",
      indent + "  " + expression + ",",
      indent + "  " + name + ' === "evals/immutable-contract-lock.json"',
      indent + '    ? \'{"schemaVersion":"1.0.0"}\\n\'',
      ...(name === "file"
        ? [
            indent + '    : file === "package.json"',
            indent + '      ? "{}\\n"',
            indent + "      : `${file}\\n`,",
          ]
        : [indent + "    : `${path}\\n`,"]),
      ...(old.includes('"utf8"') ? [indent + '  "utf8",'] : []),
      indent + ");",
    ];
    lines.splice(index, 1, ...replacement);
    assert.equal(
      (await readFile(resolve(repo, path), "utf8"))
        .replaceAll("\r", "")
        .trimEnd(),
      lines.join("\n"),
      `Fixture-only correction: ${path}`,
    );
  }
  assert.equal(
    hash(await readFile(resolve(input, "vm-1/input/source.patch"))),
    projection.inputs["source.patch"].sha256,
  );
  const temporary = await mkdtemp(resolve(output, "projection-"));
  try {
    const isolatedGit = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000,
        env: { ...process.env, GIT_INDEX_FILE: resolve(temporary, "index") },
      });
    isolatedGit("read-tree", manifest.sourceBase);
    isolatedGit(
      "apply",
      "--cached",
      "--binary",
      resolve(input, "vm-1/input/source.patch"),
    );
    assert.equal(isolatedGit("write-tree").trim(), projection.projectedTree);
    for (const path of projection.paths)
      assert.equal(
        hash(gitBytes("show", `${projection.projectedTree}:${path}`)),
        hash(await readFile(resolve(repo, path))),
      );
  } finally {
    assert(
      dirname(temporary) === output &&
        !(await lstat(temporary)).isSymbolicLink(),
    );
    for (const name of await readdir(temporary)) {
      assert(["index", "index.lock"].includes(name));
      const path = resolve(temporary, name),
        info = await lstat(path);
      assert(info.isFile() && !info.isSymbolicLink());
      await unlink(path);
    }
    await rmdir(temporary);
  }
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const value = await read(file.path);
    if (value.schemaVersion !== "1.0.0" || typeof value.stageId !== "string")
      continue;
    const checked = await validateCommandReceiptDirectory({
      directory: resolve(input, dirname(file.path)),
      expectedStageId: value.stageId,
      expectedCommandId: value.commandId,
    });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
  }
  for (const command of [
    "typecheck-1",
    "lint-1",
    "format-1",
    "invariants-1",
    "hosted-audit-2",
    "vm-1/oci-audit-2",
    "vm-2/oci-audit",
    "vm-2/host-audit",
    "vm-2/guest/artifacts/fixture-unit",
  ])
    assert(
      receipts.some((receipt) => receipt.path === `${command}/result.json`),
      command,
    );
  const hosted = await read("hosted-audit-2/audit.json");
  assert.equal(hosted.hostedCommit, manifest.sourceBase);
  assert.equal(hosted.receipts.length, 33);
  assert.equal(hosted.failedCaseIdentities.length, 59);
  const linux = await read(
      "hosted/controller-linux/orchestrator/orchestrator-report.json",
    ),
    windows = await read(
      "hosted/controller-windows/orchestrator/orchestrator-report.json",
    );
  assert.deepEqual(identities(linux), identities(windows));
  for (const report of [linux, windows]) {
    assert.equal(report.numTotalTests, 869);
    assert.equal(report.numPassedTests, 810);
    assert.equal(report.numFailedTests, 59);
    assert.equal(report.numPendingTests, 0);
  }
  const failedUnit = await read(
    "vm-1/guest/artifacts/fixture-unit/test-report.json",
  );
  assert.equal(failedUnit.numTotalTests, 1043);
  assert.equal(failedUnit.numPassedTests, 1042);
  assert.equal(failedUnit.numFailedTests, 1);
  assert.equal(failedUnit.numPendingTests, 0);
  assert.equal(
    (await read("vm-1/guest/artifacts/fixture-unit/manifest.json")).status,
    "ERROR",
  );
  const failedUnitCases = failedUnit.testResults.flatMap((file) =>
    file.assertionResults
      .filter((test) => test.status === "failed")
      .map((test) => ({
        path: sourcePath(file.name),
        name: test.fullName,
        messages: test.failureMessages,
      })),
  );
  assert.equal(failedUnitCases.length, 1);
  assert.equal(
    failedUnitCases[0].path,
    "tools/milestone-orchestrator/src/test-partitions.test.ts",
  );
  assert.match(
    failedUnitCases[0].name,
    /^WP6 integration-level omission mutation /,
  );
  assert(
    failedUnitCases[0].messages.some(
      (message) =>
        message.includes("ENOENT") &&
        message.includes("test-run-summary-reduction.json"),
    ),
  );
  const unit = await read("vm-2/guest/artifacts/fixture-unit/test-report.json");
  assert.equal(unit.numTotalTests, 1043);
  assert.equal(unit.success, true);
  assert.equal(unit.numFailedTests, 0);
  assert.equal(unit.numPendingTests, 0);
  assert.equal(unit.numPassedTests, unit.numTotalTests);
  const unitManifest = await read(
    "vm-2/guest/artifacts/fixture-unit/manifest.json",
  );
  const unitMeasurement = assertTestRunSummary(
    await read("vm-2/guest/artifacts/fixture-unit/test-run-summary.json"),
    {
      runId: unitManifest.manifestId,
      stageId: "bootstrap-tests",
      commandId: "test:unit",
      role: "legacy",
      owner: null,
      candidate: {
        gitCommit: manifest.sourceBase,
        gitTree: projection.projectedTree,
        workingTreeDirty: true,
      },
    },
  );
  assert.equal(unitMeasurement.platform.os, "linux");
  assert.equal(unitMeasurement.platform.nodeVersion, "v24.18.0");
  assert.equal(unitMeasurement.platform.pnpmVersion, "11.15.1");
  assert.deepEqual(unitMeasurement.reports, [
    await describeVitestReport({
      artifactDirectory: resolve(input, "vm-2/guest/artifacts/fixture-unit"),
      reportPath: resolve(
        input,
        "vm-2/guest/artifacts/fixture-unit/test-report.json",
      ),
    }),
  ]);
  const clockSamples = (
    await readFile(
      resolve(input, "vm-2/guest/guest/fixture-clock-samples.jsonl"),
      "utf8",
    )
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(clockSamples.length > 1 && clockSamples.length < 50_000);
  for (const [index, sample] of clockSamples.entries()) {
    assert(BigInt(sample.monotonicBefore) <= BigInt(sample.monotonicAfter));
    if (index > 0) {
      assert(
        BigInt(sample.monotonicBefore) >=
          BigInt(clockSamples[index - 1].monotonicAfter),
      );
      assert(
        BigInt(sample.epochNanoseconds) >=
          BigInt(clockSamples[index - 1].epochNanoseconds),
      );
    }
  }
  assert(
    unit.testResults.every((file) =>
      file.assertionResults.every((test) => test.status === "passed"),
    ),
  );
  const all = identities(unit);
  assert.deepEqual(all, identities(failedUnit));
  assert.equal(all.length, unit.numTotalTests);
  const identityMultiplicities = [...new Set(all)]
    .map((identity) => ({
      identity,
      count: all.filter((value) => value === identity).length,
    }))
    .filter(({ count }) => count > 1);
  assert.deepEqual(identityMultiplicities, [
    {
      identity:
        "tools/qualification-host-discovery.test.mjs#launch-free qualification host discovery refuses unsafe or unbounded PATH input (linux)",
      count: 3,
    },
  ]);
  assert.equal(new Set(all).size, 1041);
  assert.equal(
    hash(
      await readFile(
        resolve(repo, "tools/qualification-host-discovery.test.mjs"),
      ),
    ),
    hash(
      gitBytes(
        "show",
        `${manifest.sourceBase}:tools/qualification-host-discovery.test.mjs`,
      ),
    ),
  );
  const priorAuditManifest = await read("prior-audit-1/input-manifest.json");
  const priorAuditorPin = priorAuditManifest.implementation.find(
    (pin) => pin.path === "docs/ci-regressions/authority-fixture-json/audit.ts",
  );
  assert.equal(
    hash(await readFile(resolve(input, "prior-audit-1/executed-audit.ts"))),
    priorAuditorPin.sha256,
  );
  for (const priorFile of priorAuditManifest.files)
    assert.deepEqual(
      files.find((file) => file.path === priorFile.path),
      priorFile,
    );
  assert.match(
    (await read("retained-audit-1/manifest.json")).failureClassification
      .message,
    /1041 !== 1043/,
  );
  for (const identity of identities(linux))
    assert(all.includes(identity), `Original controller case: ${identity}`);
  const affectedPaths = linux.testResults
    .filter((file) =>
      file.assertionResults.some((test) => test.status === "failed"),
    )
    .map((file) => sourcePath(file.name));
  assert.equal(affectedPaths.length, 10);
  const affected = {
    testResults: unit.testResults.filter((file) =>
      affectedPaths.includes(sourcePath(file.name)),
    ),
  };
  assert.equal(identities(affected).length, 67);
  assert(
    failedUnit.testResults
      .filter((file) => affectedPaths.includes(sourcePath(file.name)))
      .every((file) =>
        file.assertionResults.every((test) => test.status === "passed"),
      ),
  );
  const reproduction = await read("reproduce-native-1/vitest-report.json");
  assert.equal(reproduction.numTotalTests, 11);
  assert.equal(reproduction.numFailedTests, 4);
  for (const name of [
    "reproduce-native-1",
    "status-diagnostic-1",
    "native-baseline-diagnostic-1",
    "hosted-audit-1",
    "vm-1/oci-audit",
    "vm-1/guest/artifacts/fixture-unit",
  ])
    assert(
      !existsSync(resolve(input, name, "result.json")),
      `Non-passing observation: ${name}`,
    );
  const diagnostic = await read("status-diagnostic-1/vitest-report.json");
  assert.equal(diagnostic.numPassedTests, 1);
  assert.equal(diagnostic.numPendingTests, 8);
  const native = await read("affected-native-1/vitest-report.json");
  assert.deepEqual(identities(native), identities(affected));
  assert.equal(native.numTotalTests, 67);
  assert.equal(native.numPassedTests, 62);
  assert.equal(native.numFailedTests, 5);
  assert.equal(native.numPendingTests, 0);
  if (native.numFailedTests > 0)
    assert(!existsSync(resolve(input, "affected-native-1/result.json")));
  const nativeStderr = await readFile(
    resolve(input, "affected-native-1/stderr.log"),
    "utf8",
  );
  for (const deadline of [5000, 15000, 60000, 600000])
    assert(nativeStderr.includes(`Test timed out in ${deadline}ms.`));
  const nativeFailureIdentities = identities({
    testResults: native.testResults.map((file) => ({
      ...file,
      assertionResults: file.assertionResults.filter(
        (test) => test.status === "failed",
      ),
    })),
  });
  const baselineNative = await read(
    "native-baseline-diagnostic-1/vitest-report.json",
  );
  const baselineExecution = await read(
    "native-baseline-diagnostic-1/child-execution.json",
  );
  assert.equal(
    baselineExecution.identity.gitCommit,
    "dba20a6f3669f4fbfe04161c01524e2059f8277b",
  );
  assert.equal(baselineExecution.identity.nodeVersion, "v24.18.0");
  assert.equal(baselineExecution.identity.pnpmVersion, "11.15.1");
  const baselineExecutedIdentities = identities({
    testResults: baselineNative.testResults.map((file) => ({
      ...file,
      assertionResults: file.assertionResults.filter((test) =>
        ["passed", "failed"].includes(test.status),
      ),
    })),
  });
  assert.deepEqual(baselineExecutedIdentities, nativeFailureIdentities);
  assert.equal(baselineNative.numTotalTests, 39);
  assert.equal(baselineNative.numPassedTests, 2);
  assert.equal(baselineNative.numFailedTests, 3);
  assert.equal(baselineNative.numPendingTests, 34);
  const baselineInputs = await read("native-baseline-diagnostic-1/inputs.json");
  assert.equal(baselineInputs.commit, baselineExecution.identity.gitCommit);
  assert.deepEqual(baselineInputs.trackedDiff, []);
  assert.deepEqual(baselineInputs.privateRefs, []);
  assert.equal(baselineInputs.statePresent, false);
  for (const pin of baselineInputs.files.filter((pin) =>
    pin.path.startsWith("tools/"),
  ))
    assert.equal(
      hash(gitBytes("show", `${baselineInputs.commit}:${pin.path}`)),
      pin.sha256,
      pin.path,
    );
  const baselineStderr = await readFile(
    resolve(input, "native-baseline-diagnostic-1/stderr.log"),
    "utf8",
  );
  assert(
    baselineStderr.includes("ENOTEMPTY") &&
      baselineStderr.includes("Hook timed out in 10000ms."),
  );
  for (const file of baselineNative.testResults) {
    const path = sourcePath(file.name);
    assert.equal(
      hash(
        gitBytes("show", `dba20a6f3669f4fbfe04161c01524e2059f8277b:${path}`),
      ),
      hash(gitBytes("show", `${manifest.sourceBase}:${path}`)),
      `Original baseline assertions and fixture: ${path}`,
    );
  }
  for (const name of ["vm-1", "vm-2"]) {
    const host = await read(`${name}/host/host.json`);
    assert.equal(
      host.status,
      name === "vm-1" ? "ERROR" : "OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT",
    );
    assert.equal(host.binding.sourceCommit, manifest.sourceBase);
    assert.equal(host.binding.sourceTree, projection.sourceBaseTree);
    for (const field of [
      "cleanupVerified",
      "directoryAbsent",
      "pidAbsent",
      "cgroupAbsent",
    ])
      assert.equal(host[field], true);
    assert.equal(
      hash(await readFile(resolve(input, `${name}/host/executed-host.py`))),
      "e3e8fd910030f5fe0e7d831960ce4c6ac6cfa51908405b4a8a2702f29ac29c9c",
    );
    const execution = await read(`${name}/guest/guest/fixture-unit.json`);
    assert.equal(execution.exitCode, name === "vm-1" ? 1 : 0);
    assert.deepEqual(execution.argv, ["/opt/bin/pnpm", "test:unit"]);
    assert.equal(execution.uid, 1000);
    assert.equal(execution.timedOut, false);
    assert.equal(
      (
        await readFile(
          resolve(input, `${name}/guest/guest/fixture-projected-tree.stdout`),
          "utf8",
        )
      ).trim(),
      projection.projectedTree,
    );
  }
  const config = await read("vm-2/guest/guest/fixture-pnpm-config.json");
  const configBytes = await readFile(
    resolve(input, "vm-2/guest/guest/fixture-pnpm-config.yaml"),
  );
  assert.equal(config.path, "/home/qualifier/.config/pnpm/config.yaml");
  assert.equal(config.sourceFilesChanged, false);
  assert.equal(
    configBytes.toString("utf8"),
    "enableGlobalVirtualStore: false\n",
  );
  assert.equal(hash(configBytes), config.sha256);
  const strictPreflight = await readFile(
    resolve(input, "omission-diagnostic-linux-5/strict-preflight.stdout.log"),
    "utf8",
  );
  assert.match(strictPreflight, /ERR_PNPM_VERIFY_DEPS_BEFORE_RUN/);
  assert.match(strictPreflight, /enableGlobalVirtualStore setting has changed/);
  const configuredOmission = await read(
    "omission-diagnostic-linux-6/observation.json",
  );
  assert.equal(configuredOmission.exitCode, 1);
  assert.equal(configuredOmission.manifestStatus, "FAIL");
  assert.equal(configuredOmission.reductionPresent, true);
  assert.equal(configuredOmission.passReceiptPresent, false);
  assert.match(
    configuredOmission.failureClassification.message,
    /the production semantic comparator rejected exactly that missing identity/,
  );
  const beforeOmission = await read(
    "vm-2/guest/guest/fixture-omission-before.json",
  );
  assert.equal(beforeOmission.exitCode, 1);
  assert.equal(
    (await read("vm-2/guest/artifacts/fixture-omission-before/manifest.json"))
      .status,
    "ERROR",
  );
  assert.match(
    await readFile(
      resolve(
        input,
        "vm-2/guest/artifacts/fixture-omission-before/logs/omission-mutation-vitest.stdout.log",
      ),
      "utf8",
    ),
    /ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY/,
  );
  assert(
    !existsSync(
      resolve(
        input,
        "vm-2/guest/artifacts/fixture-omission-before/test-run-summary-reduction.json",
      ),
    ),
  );
  assert(
    !existsSync(
      resolve(
        input,
        "vm-2/guest/artifacts/fixture-omission-before/result.json",
      ),
    ),
  );
  const after = {
    head: git("rev-parse", "HEAD"),
    index: git("write-tree"),
    status: git("status", "--porcelain=v2"),
    refs: git(
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      "refs/milestone-loop/",
    ),
  };
  assert.deepEqual(after, before);
  assert(!existsSync(resolve(repo, "artifacts/orchestrator/state/state.json")));
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "authority-fixture-retained-audit.v1",
        status: "PASS",
        completionEligible: false,
        authorityGeneration: "legacy-source.v1",
        observer: await commandIdentity(repo),
        sourceBase: manifest.sourceBase,
        projection,
        files: files.length,
        receipts,
        originalAffectedCases: 67,
        originalControllerCases: 869,
        unitTests: unit.numTotalTests,
        distinctUnitNames: 1041,
        identityMultiplicities,
        earlierUnit: { passed: 1042, failed: 1, failedUnitCases },
        guestPnpmConfig: config,
        independentlyValidatedUnitMeasurement: {
          contentSha256: unitMeasurement.contentSha256,
          reports: unitMeasurement.reports,
          clockSampleCount: clockSamples.length,
          completionEligible: false,
        },
        native: {
          passed: native.numPassedTests,
          failed: native.numFailedTests,
        },
        nativeSelectedPreReaderDiagnostic: {
          passed: baselineNative.numPassedTests,
          failed: baselineNative.numFailedTests,
          skipped: baselineNative.numPendingTests,
          executedIdentities: baselineExecutedIdentities,
          completionEligible: false,
        },
        hostedControllerOutcome: "FAIL",
        sourceStateAbsent: true,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "retained-fixture-repair",
        summary:
          "Rehashed retained evidence, independently validated owned receipts/artifacts, reconstructed the exact tested fixture projection, proved all original assertions/deadlines unchanged, reconciled actual native and hosted failures with complete Linux unit execution, and preserved live authority/state.",
      },
    ],
    [{ path: "audit.json", kind: "authority-fixture-retained-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
      unitTests: unit.numTotalTests,
      receiptSha256: checked.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
