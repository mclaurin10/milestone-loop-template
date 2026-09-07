import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import {
  assertActiveAuthorityPublication,
  SOURCE_AUTHORITY_REQUEST_PATH,
} from "../../../tools/milestone-orchestrator/src/authority-publication.mjs";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";
import { inspectFrozenInputs } from "./inspect-frozen-inputs.js";
import { inspectDependencyRepair } from "./inspect-dependency-repair.js";
import { inspectRevisedInput } from "./inspect-revised-input.js";
import { inspectPrecommitReports } from "./inspect-precommit-reports.js";
import { inspectLinuxPrecommit } from "./inspect-linux-precommit.js";
import { inspectSourceDependencyCaptures } from "../../../tools/milestone-orchestrator/src/source-authority-audit-reports.mjs";
import {
  SOURCE_AUDIT_COMMANDS,
  sourceHistoricalFiles,
} from "../../../tools/milestone-orchestrator/src/source-authority-evidence.mjs";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repository = resolve(import.meta.dirname, "../../..");
const input = await realpath(resolve(inputArg));
const output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c6e",
  "source-publication-retained-audit",
);
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 128 * 1024 * 1024,
  });
const base = "fc2419d8bdfc3658fe76edf2b543b38051b359f1";
type Pin = { path: string; bytes: number; sha256: string };
type RawCase = {
  fullName: string;
  status: string;
  failureMessages: string[];
  ancestorTitles: string[];
  title: string;
};
type RawFile = { name: string; status: string; assertionResults: RawCase[] };
const portablePath = (path: string) => {
  const normalized = path.replaceAll("\\", "/");
  const anchors = ["/tools/", "/fixtures/"];
  const anchor = anchors.find((value) => normalized.includes(value));
  assert(anchor, "Unrecognized test report path: " + path);
  return normalized.slice(normalized.indexOf(anchor) + 1);
};
const identities = (raw: { testResults: RawFile[] }) =>
  raw.testResults.flatMap((file) =>
    file.assertionResults.map(
      (test) => portablePath(file.name) + "\0" + test.fullName,
    ),
  );
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.schemaVersion, "source-publication-retention.v1");
  assert.equal(manifest.sourceBase, base);
  assert.equal(manifest.completionEligible, false);
  const files: Pin[] = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(input, path))) {
      const child = path ? path + "/" + name : name;
      const absolute = resolve(input, child);
      const info = await lstat(absolute);
      assert(!info.isSymbolicLink() && (await realpath(absolute)) === absolute);
      if (info.isDirectory()) await walk(child);
      else {
        assert(info.isFile() && info.size <= 20_000_000);
        const content = await readFile(absolute);
        files.push({
          path: child,
          bytes: content.length,
          sha256: hash(content),
        });
      }
    }
  }
  await walk();
  const order = (a: Pin, b: Pin) => a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), [...manifest.files].sort(order));
  assert(files.reduce((sum, file) => sum + file.bytes, 0) <= 64_000_000);
  const operationalPaths = [
    ".agent/current-exec-plan.md",
    "docs/autonomy-log.md",
    "docs/decision-log.md",
  ];
  assert.deepEqual(
    manifest.operationalRecords.map(
      (record: { sourcePath: string }) => record.sourcePath,
    ),
    operationalPaths,
  );
  for (const record of manifest.operationalRecords as {
    sourcePath: string;
    retained: Pin;
  }[]) {
    assert.equal(
      record.retained.path,
      "operational-records/" + record.sourcePath,
    );
    assert.deepEqual(
      files.find((file) => file.path === record.retained.path),
      record.retained,
    );
    assert(
      !manifest.implementation.some(
        (pin: Pin) => pin.path === record.sourcePath,
      ),
    );
    assert(
      !manifest.activeGeneration.some(
        (pin: Pin) => pin.path === record.sourcePath,
      ),
    );
  }
  for (const pin of [
    ...manifest.implementation,
    ...manifest.activeGeneration,
  ] as Pin[]) {
    assert(!isAbsolute(pin.path) && !pin.path.split(/[\\/]/).includes(".."));
    const content = await readFile(resolve(repository, pin.path));
    assert.equal(content.length, pin.bytes, pin.path);
    assert.equal(hash(content), pin.sha256, pin.path);
  }
  for (const pin of manifest.activeGeneration as Pin[])
    assert.equal(
      hash(git("show", `${base}:${pin.path}`)),
      pin.sha256,
      pin.path,
    );
  assert.equal(await assertActiveAuthorityPublication(repository), "legacy");
  assert(!existsSync(resolve(repository, SOURCE_AUTHORITY_REQUEST_PATH)));
  assert(
    !existsSync(resolve(repository, "artifacts/orchestrator/state/state.json")),
  );
  assert.equal(
    git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/")
      .toString()
      .trim(),
    "",
  );
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const value = await read(file.path);
    if (value.schemaVersion !== "1.0.0" || typeof value.stageId !== "string")
      continue;
    const checked = await validateCommandReceiptDirectory({
      directory: dirname(resolve(input, file.path)),
      expectedStageId: value.stageId,
      expectedCommandId: value.commandId,
    });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
  }
  const requireReceipt = (path: string) => {
    const value = receipts.find((receipt) => receipt.path === path);
    assert(value, "Missing independently validated receipt: " + path);
    return value;
  };
  const retainedErrors = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/manifest.json"),
  )) {
    const value = await read(file.path);
    if (
      value.schemaVersion !== "1.0.0" ||
      typeof value.stageId !== "string" ||
      typeof value.commandId !== "string" ||
      value.status !== "ERROR"
    )
      continue;
    assert.equal(value.receipt, null, file.path);
    assert(value.failureClassification, file.path);
    const resultPath = resolve(input, dirname(file.path), "result.json");
    if (existsSync(resultPath)) {
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      assert.notEqual(result.status, "PASS", file.path);
    }
    retainedErrors.push({
      path: file.path,
      sha256: file.sha256,
      stageId: value.stageId,
      commandId: value.commandId,
      failureClassification: value.failureClassification,
    });
  }
  for (const name of [
    "publication-focused-14",
    "publication-focused-15",
    "recovery-publication-focused-1",
    "recovery-integration-audit-1",
    "frozen-text-checkout-1",
    "precommit",
    "lifecycle-focused-2",
    "source-consumers-1",
    "reader-focused-12",
    "typecheck-26",
    "lint-15",
    "architecture-focused-4",
    "audit-reader-retained-1",
    "hosted-fc2419d-audit-1",
    "dependency-repair-focused-audit-1",
    "revised-input-audit-1",
    "retention-tools-static-3",
    "revised-input-audit-2",
    "retention-tools-static-4",
    "dependency-repair-native-copy-1",
    "namespace-probe-audit-1",
    "namespace-probe-audit-2",
    "retention-tools-static-5",
    "six-source-report-audit-1",
    "cache-runtime-namespace-audit-1",
    "cache-runtime-report-audit-1",
    "unborn-scope-focused-6",
    "typecheck-28",
    "lint-17",
    "linux-namespace-probe-audit-3",
    "invalid-native-retry-audit-1",
    "unborn-publication-focused-3",
    "retention-tools-static-7",
    "retention-tools-static-8",
    "retention-tools-static-9",
    "retention-tools-static-10",
  ])
    requireReceipt(name + "/result.json");
  const failedRuns = [];
  const finalStatic = await read("retention-tools-static-10/report.json");
  assert.equal(finalStatic.completionEligible, false);
  assert.equal(finalStatic.retainedAuditExecuted, false);
  assert.deepEqual(
    finalStatic.commands.map((command: { id: string }) => command.id),
    ["lint", "format", "native-syntax-0", "native-syntax-1", "native-syntax-2"],
  );
  const checkedDocPins = finalStatic.pins.filter((pin: Pin) =>
    pin.path.startsWith("docs/source-authority/ORCH-AUTH-01-C6e/"),
  );
  assert.equal(checkedDocPins.length, 9);
  for (const pin of checkedDocPins as Pin[])
    assert.deepEqual(
      manifest.implementation.find(
        (candidate: Pin) => candidate.path === pin.path,
      ),
      pin,
    );
  for (const [index, relativePath] of [
    "launcher/executed-driver.mjs",
    "executed-runner.ts",
    "executed-reporter.mjs",
  ].entries()) {
    const extension = relativePath.endsWith(".ts") ? "ts" : "mjs";
    assert.deepEqual(
      await readFile(
        resolve(
          input,
          "retention-tools-static-10/native-tool-" + index + "." + extension,
        ),
      ),
      await readFile(
        resolve(input, "unborn-publication-focused-3", relativePath),
      ),
    );
  }
  for (const [name, passed, failed] of [
    ["lifecycle-baseline-1", 6, 3],
    ["publication-focused-11", 54, 1],
    ["publication-focused-13", 63, 3],
    ["recovery-consumer-baseline-1", 0, 5],
    ["recovery-consumer-baseline-2", 89, 1],
    ["unborn-scope-baseline-1", 47, 2],
    ["unborn-scope-focused-1", 99, 13],
    ["unborn-scope-focused-2", 111, 3],
    ["unborn-scope-focused-3", 107, 7],
    ["unborn-scope-focused-4", 112, 2],
    ["unborn-scope-focused-5", 113, 1],
  ] as const) {
    assert(!existsSync(resolve(input, name, "result.json")), name);
    const raw = await read(name + "/vitest-report.json");
    assert.equal(raw.numPassedTests, passed, name);
    assert.equal(raw.numFailedTests, failed, name);
    assert.equal(raw.numTotalTests, passed + failed, name);
    assert.equal(raw.numPendingTests, 0, name);
    assert.equal(raw.success, false, name);
    const rawManifest = await read(name + "/manifest.json");
    assert.equal(rawManifest.status, "ERROR", name);
    assert.equal(rawManifest.receipt, null, name);
    failedRuns.push({
      name,
      passed,
      failed,
      failureClassification: rawManifest.failureClassification,
    });
  }
  const baseline = await read(
    "recovery-consumer-baseline-2/vitest-report.json",
  );
  const baselineFailures: RawCase[] = baseline.testResults
    .flatMap((file: RawFile) => file.assertionResults)
    .filter((test: RawCase) => test.status === "failed");
  assert.equal(baselineFailures.length, 1);
  assert(baselineFailures[0]!.fullName.includes("focused=true"));
  assert(
    baselineFailures[0]!.failureMessages
      .join("\n")
      .includes("full-source-qualification"),
  );
  const focused = await read(
    "recovery-publication-focused-1/vitest-report.json",
  );
  assert.equal(focused.numTotalTests, 203);
  assert.equal(focused.numPassedTests, 203);
  assert.equal(focused.numFailedTests, 0);
  assert.equal(focused.numPendingTests, 0);
  assert.equal(focused.numTodoTests, 0);
  assert.equal(focused.testResults.length, 9);
  assert.equal(focused.success, true);
  const focusedIds = identities(focused);
  assert.equal(new Set(focusedIds).size, 203);
  const prior = await read("publication-focused-15/vitest-report.json");
  assert.equal(prior.numPassedTests, 107);
  for (const identity of identities(prior))
    assert(focusedIds.includes(identity), identity);
  const summary = assertTestRunSummary(
    await read("recovery-publication-focused-1/test-run-summary.json"),
  );
  assert.deepEqual(summary.reports, [
    await describeVitestReport({
      artifactDirectory: resolve(input, "recovery-publication-focused-1"),
      reportPath: resolve(
        input,
        "recovery-publication-focused-1/vitest-report.json",
      ),
    }),
  ]);
  const liveAudit = await read("recovery-integration-audit-1/report.json");
  assert.equal(liveAudit.tests, 203);
  assert.equal(liveAudit.inputObservation.files, 650);
  assert.equal(liveAudit.completionEligible, false);
  for (const key of [
    "actualImplementationAudit",
    "sdkServiceReview",
    "actualMigration",
    "sourceStateAdopted",
    "candidateExecution",
  ])
    assert.equal(liveAudit[key], false);
  const nativeLines = (
    await readFile(
      resolve(input, "recovery-publication-focused-1/stdout.log"),
      "utf8",
    )
  )
    .split(/\r?\n/)
    .filter((line) =>
      line.startsWith(
        '{"schemaVersion":"synthetic-publication-native-consumer-observation.v1"',
      ),
    );
  assert.equal(nativeLines.length, 2);
  for (const line of nativeLines) {
    const native = JSON.parse(line);
    assert.equal(native.execution.exitCode, 1);
    assert.equal(native.execution.signal, null);
    assert.equal(native.execution.spawnError, null);
    assert.equal(native.execution.supervision.timedOut, false);
    assert.equal(native.execution.supervision.streamsClosed, true);
    const runId = native.argv[native.argv.indexOf("--run-id") + 1];
    for (const file of native.files) {
      const bytes = Buffer.from(file.contentsBase64, "base64");
      assert.equal(bytes.length, file.bytes);
      assert.equal(hash(bytes), file.sha256);
    }
    const result = native.files.find(
      (file: Pin) => file.path === "artifacts/" + runId + "/result.json",
    );
    assert(result);
    const value = JSON.parse(
      Buffer.from(result.contentsBase64, "base64").toString(),
    );
    assert.equal(value.status, "FAIL");
    assert.equal(value.completion.eligible, false);
    const isFocused = native.argv.includes("--stage");
    assert.equal(
      value.scope.purpose,
      isFocused ? "candidate-support" : "full-source-qualification",
    );
    assert.equal(value.scope.qualifierRun === null, isFocused);
  }
  const frozen = await inspectFrozenInputs({
    repository,
    retainedRoot: input,
    scratch: resolve(output, "frozen-reconstruction"),
    subjectDirectory: resolve(input, "precommit-vm-1/input"),
  });
  const revisedMetadata = await read(
    "precommit-revised-source-input-1/source.json",
  );
  const revisedInput = await inspectRevisedInput({
    repository,
    originalDirectory: resolve(input, "precommit-vm-1/input"),
    revisedDirectory: resolve(input, "precommit-revised-source-input-1"),
    scratch: resolve(output, "revised-input"),
    originalCommit: frozen.isolatedPrecommitInputCommit,
    originalTree: frozen.reconstructedTree,
    expectedPins: revisedMetadata.pins,
    expectedChanges: (await read("dependency-repair-linux-1/source-delta.json"))
      .changes,
  });
  const dependencyRepair = await inspectDependencyRepair(
    repository,
    input,
    sourceHistoricalFiles(
      resolve(output, "revised-input/revised.git"),
      revisedInput.source.commit,
      revisedMetadata.pins.map((pin: Pin) => pin.path),
    ),
  );
  assert.deepEqual(dependencyRepair.pins, revisedMetadata.pins);
  const unbornMetadata = await read("precommit/subject/source.json");
  const unbornFrozen = await read("unborn-regression-inputs-6/inputs.json");
  const unbornInput = await inspectRevisedInput({
    repository,
    originalDirectory: resolve(input, "precommit-revised-source-input-1"),
    revisedDirectory: resolve(input, "precommit/subject"),
    scratch: resolve(output, "unborn-input"),
    originalCommit: revisedInput.source.commit,
    originalTree: revisedInput.source.tree,
    expectedPins: unbornFrozen.pins,
    expectedChanges: unbornMetadata.changes,
    transition: "unborn",
  });
  const unbornFiles = sourceHistoricalFiles(
    resolve(output, "unborn-input/revised.git"),
    unbornInput.source.commit,
    unbornFrozen.pins.map((pin: Pin) => pin.path),
  );
  for (const pin of unbornFrozen.pins as Pin[]) {
    const bytes = await readFile(resolve(repository, pin.path));
    assert.equal(bytes.length, pin.bytes, pin.path);
    assert.equal(hash(bytes), pin.sha256, pin.path);
    assert.deepEqual(bytes, unbornFiles.get(pin.path), pin.path);
  }
  const priorTests = sourceHistoricalFiles(
    resolve(output, "unborn-input/revised.git"),
    revisedInput.source.commit,
    [
      "tools/milestone-orchestrator/src/verification-scope.test.ts",
      "tools/milestone-orchestrator/src/state-generation-store.test.ts",
    ],
  );
  for (const [path, marker] of [
    [
      "tools/milestone-orchestrator/src/verification-scope.test.ts",
      'describe("source verifier dispatch correlation"',
    ],
    [
      "tools/milestone-orchestrator/src/state-generation-store.test.ts",
      '    "roots complete current and previous generations through commit ancestry"',
    ],
  ] as const) {
    const before = priorTests.get(path)!.toString();
    const after = unbornFiles.get(path)!.toString();
    assert(before.includes(marker) && after.includes(marker));
    assert.equal(
      after.slice(after.indexOf(marker)),
      before.slice(before.indexOf(marker)),
      path,
    );
  }
  const unbornRaw = await read("unborn-scope-focused-6/vitest-report.json");
  assert.equal(unbornRaw.numTotalTests, 130);
  assert.equal(unbornRaw.numPassedTests, 130);
  assert.equal(unbornRaw.numFailedTests, 0);
  assert.equal(unbornRaw.numPendingTests, 0);
  assert.equal(unbornRaw.numTodoTests, 0);
  assert.equal(unbornRaw.success, true);
  const unbornIdentitySet = new Set(identities(unbornRaw));
  assert.equal(unbornIdentitySet.size, 130);
  for (const identity of identities(
    await read("unborn-scope-focused-5/vitest-report.json"),
  ))
    assert(unbornIdentitySet.has(identity), identity);
  const nativeFirst = await read(
    "unborn-publication-focused-1/child-execution.json",
  );
  const nativeFirstRaw = await read(
    "unborn-publication-focused-1/vitest-report.json",
  );
  const nativeFirstManifest = await read(
    "unborn-publication-focused-1/manifest.json",
  );
  assert.equal(nativeFirst.identity.gitCommit, base);
  assert.notEqual(nativeFirst.identity.gitStatus, "");
  assert.notEqual(nativeFirst.exitCode, 0);
  assert.equal(nativeFirstManifest.status, "ERROR");
  assert.equal(nativeFirstManifest.receipt, null);
  assert(
    !existsSync(resolve(input, "unborn-publication-focused-1/result.json")),
  );
  assert.equal(nativeFirstRaw.success, false);
  assert.equal(nativeFirstRaw.numTotalTests, 266);
  assert.equal(nativeFirstRaw.numPassedTests, 258);
  assert.equal(nativeFirstRaw.numFailedTests, 8);
  assert.equal(nativeFirstRaw.numPendingTests, 0);
  assert.equal(nativeFirstRaw.numTodoTests, 0);
  assert.equal(nativeFirst.supervision.timedOut, false);
  assert.equal(nativeFirst.supervision.outputLimitExceeded, false);
  assert.equal(nativeFirst.supervision.streamsClosed, true);
  const nativeFirstStderr = await readFile(
    resolve(input, "unborn-publication-focused-1/stderr.log"),
    "utf8",
  );
  assert.equal((nativeFirstStderr.match(/^ FAIL {2}/gm) ?? []).length, 8);
  assert.equal(
    (nativeFirstStderr.match(/^Error: Test timed out in 180000ms\.$/gm) ?? [])
      .length,
    3,
  );
  assert.equal(
    (nativeFirstStderr.match(/^Error: Hook timed out in 180000ms\.$/gm) ?? [])
      .length,
    2,
  );
  assert.equal(
    (
      nativeFirstStderr.match(
        /^Controller lease release failed after an operation error:/gm,
      ) ?? []
    ).length,
    5,
  );
  const nativeFirstFailures = nativeFirstRaw.testResults.flatMap(
    (file: RawFile) =>
      file.assertionResults
        .filter((test) => test.status === "failed")
        .map((test) => ({
          path: portablePath(file.name),
          name: test.fullName,
          failureMessages: test.failureMessages,
        })),
  );
  assert.equal(nativeFirstFailures.length, nativeFirstRaw.numFailedTests);
  assert(
    nativeFirstFailures.every(
      (test: RawCase) => test.failureMessages.length > 0,
    ),
  );
  failedRuns.push({
    name: "unborn-publication-focused-1",
    passed: nativeFirstRaw.numPassedTests,
    failed: nativeFirstRaw.numFailedTests,
    failureClassification: nativeFirstManifest.failureClassification,
    failures: nativeFirstFailures,
  });
  const invalidPrefix = "unborn-publication-focused-2";
  const invalidRead = (path: string) => read(invalidPrefix + "/" + path);
  const invalidChild = await invalidRead("child-execution.json");
  const invalidLauncher = await invalidRead("launcher/execution.json");
  const invalidManifest = await invalidRead("manifest.json");
  const invalidBefore = await invalidRead("input-before.json");
  const invalidAfter = await invalidRead("input-after.json");
  assert.equal(invalidManifest.status, "ERROR");
  assert.equal(invalidManifest.receipt, null);
  for (const path of ["result.json", "vitest-report.json"])
    assert(!existsSync(resolve(input, invalidPrefix, path)));
  assert.deepEqual(invalidBefore.identity, invalidAfter.identity);
  assert.deepEqual(invalidBefore.pins, invalidAfter.pins);
  assert.equal(invalidBefore.completionEligible, false);
  assert.equal(invalidAfter.completionEligible, false);
  assert(
    Date.parse(invalidAfter.observedAt) > Date.parse(invalidBefore.observedAt),
  );
  assert.deepEqual(invalidBefore.pins, unbornFrozen.pins);
  assert.equal(invalidBefore.identity.gitCommit, unbornInput.source.commit);
  assert.equal(invalidBefore.identity.gitTree, unbornInput.source.tree);
  assert.equal(invalidBefore.identity.gitStatus, "");
  assert.deepEqual(invalidChild.identity, invalidBefore.identity);
  assert.deepEqual(invalidLauncher.before, invalidBefore.identity);
  assert.deepEqual(invalidLauncher.after, invalidBefore.identity);
  for (const execution of [invalidChild, invalidLauncher]) {
    assert.equal(execution.exitCode, 1);
    assert.equal(execution.signal, null);
    assert.equal(execution.supervision.timedOut, false);
    assert.equal(execution.supervision.outputLimitExceeded, false);
    assert.equal(execution.supervision.streamsClosed, true);
    assert.equal(execution.supervision.drainTimedOut, false);
  }
  const invalidProgress = (
    await readFile(resolve(input, invalidPrefix, "progress.jsonl"), "utf8")
  )
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(invalidProgress[0].event, "run-start");
  assert.equal(invalidProgress[0].modules, 10);
  assert(
    !invalidProgress.some((event) =>
      ["run-end", "module-end"].includes(event.event),
    ),
  );
  const partialCases = invalidProgress.filter(
    (event) => event.event === "case-end",
  );
  assert.equal(partialCases.length, 10);
  assert.equal(
    partialCases.filter((event) => event.state === "passed").length,
    4,
  );
  const partialFailures = partialCases.filter(
    (event) => event.state === "failed",
  );
  assert.equal(partialFailures.length, 6);
  for (const event of partialFailures) {
    assert.equal(event.errors.length, 1);
    assert(
      event.errors[0].message.includes(
        "+ 'orch-auth-01-c6b'\n- 'source-authority-review'",
      ),
    );
  }
  const invalidDriver = await readFile(
    resolve(input, invalidPrefix, "launcher/executed-driver.mjs"),
    "utf8",
  );
  assert(invalidDriver.includes("LOOP_VERIFY_STAGE_ID: 'orch-auth-01-c6b'"));
  assert(
    invalidDriver.includes("LOOP_VERIFY_COMMAND_ID: 'source-scope-focused'"),
  );
  const invalidCollection = await invalidRead("launcher/collection.json");
  assert.equal(invalidCollection.copied.length, 21);
  assert.equal(invalidCollection.copiedBytes, 226935);
  assert.equal(invalidCollection.receiptBytesRewritten, false);
  assert.equal(
    new Set(invalidCollection.copied.map((pin: Pin) => pin.path)).size,
    21,
  );
  assert.equal(
    invalidCollection.copied.reduce(
      (sum: number, pin: Pin) => sum + pin.bytes,
      0,
    ),
    invalidCollection.copiedBytes,
  );
  for (const pin of invalidCollection.copied as Pin[]) {
    assert(!isAbsolute(pin.path) && !pin.path.split(/[\\/]/).includes(".."));
    const bytes = await readFile(resolve(input, invalidPrefix, pin.path));
    assert.equal(bytes.length, pin.bytes);
    assert.equal(hash(bytes), pin.sha256);
  }
  const invalidStop = await invalidRead("termination/scope-observation.json");
  assert.equal(invalidStop.schemaVersion, "owned-native-stop-observation.v1");
  assert.equal(invalidStop.target, 12336);
  assert.equal(invalidStop.exitCode, 0);
  assert.deepEqual(invalidStop.argv.slice(1), ["/PID", "12336", "/T", "/F"]);
  assert.deepEqual(invalidStop.remaining, []);
  assert.equal(invalidStop.verificationClaim, false);
  assert.equal(invalidStop.completionEligible, false);
  const stopStdout = await readFile(
    resolve(input, invalidPrefix, "termination/stdout.log"),
    "utf8",
  );
  const terminated = [
    ...stopStdout.matchAll(
      /SUCCESS: The process with PID (\d+) \(child process of PID (\d+)\) has been terminated\./g,
    ),
  ].map((match) => ({ pid: Number(match[1]), parent: Number(match[2]) }));
  assert.equal(terminated.length, 8);
  assert.deepEqual(invalidStop.acknowledged, terminated);
  assert.equal(new Set(terminated.map((entry) => entry.pid)).size, 8);
  assert.equal(invalidStop.collectorDefect.beforeCount, 153);
  assert.equal(invalidStop.collectorDefect.afterCount, 145);
  for (const excluded of invalidStop.excludedRawInventory) {
    assert(
      excluded.preservedAt.includes(
        "retention-draft\\overbroad-stop-inventory\\",
      ),
    );
    assert(
      !existsSync(
        resolve(input, invalidPrefix, "termination", excluded.originalName),
      ),
    );
  }
  failedRuns.push({
    name: invalidPrefix,
    passed: 4,
    failed: 6,
    partial: true,
    failureClassification: invalidManifest.failureClassification,
    interpretation:
      "Outer receipt identity overrides invalidated nested review evidence; stopped after ten partial cases. No full-suite result.",
    stopObservation: invalidStop,
  });
  const invalidAudit = await read("invalid-native-retry-audit-1/report.json");
  assert.equal(invalidAudit.fullSuiteVerified, false);
  assert.equal(invalidAudit.newTestsExecuted, false);
  assert.equal(invalidAudit.completionEligible, false);
  assert.deepEqual(invalidAudit.observation, failedRuns.at(-1));
  for (const pin of invalidAudit.pins as Pin[])
    assert.deepEqual(
      manifest.files.find((file: Pin) => file.path === pin.path),
      pin,
    );
  const nativePrefix = "unborn-publication-focused-3";
  const nativeRead = (path: string) => read(nativePrefix + "/" + path);
  const nativeLauncher = await nativeRead("launcher/execution.json");
  const nativeChild = await nativeRead("child-execution.json");
  const nativeBefore = await nativeRead("input-before.json");
  const nativeAfter = await nativeRead("input-after.json");
  const nativeSource = await nativeRead("expected-source.json");
  const nativeRaw = await nativeRead("vitest-report.json");
  const expectedNativeFiles = (
    await read("dependency-repair-focused-1/execution.json")
  ).argv.slice(5);
  assert.equal(expectedNativeFiles.length, 10);
  assert.deepEqual(nativeLauncher.files, expectedNativeFiles);
  assert.deepEqual(nativeChild.files, expectedNativeFiles);
  assert.deepEqual(nativeFirst.files, expectedNativeFiles);
  assert.deepEqual(invalidChild.files, expectedNativeFiles);
  assert.deepEqual(invalidLauncher.files, expectedNativeFiles);
  assert.deepEqual(nativeSource, unbornMetadata);
  assert.deepEqual(nativeBefore.identity, nativeAfter.identity);
  assert.deepEqual(nativeBefore.pins, unbornFrozen.pins);
  assert.deepEqual(nativeAfter.pins, unbornFrozen.pins);
  assert.equal(nativeBefore.identity.gitCommit, unbornInput.source.commit);
  assert.equal(nativeBefore.identity.gitTree, unbornInput.source.tree);
  assert.equal(nativeBefore.identity.gitStatus, "");
  assert.equal(nativeBefore.identity.nodeVersion, "v24.18.0");
  assert.equal(nativeBefore.identity.pnpmVersion, "11.15.1");
  assert.deepEqual(nativeChild.identity, nativeBefore.identity);
  assert.deepEqual(nativeLauncher.before, nativeBefore.identity);
  assert.deepEqual(nativeLauncher.after, nativeBefore.identity);
  for (const execution of [nativeChild, nativeLauncher]) {
    assert.equal(execution.exitCode, 0);
    assert.equal(execution.signal, null);
    assert.equal(execution.supervision.timedOut, false);
    assert.equal(execution.supervision.outputLimitExceeded, false);
    assert.equal(execution.supervision.streamsClosed, true);
    assert.equal(execution.supervision.drainTimedOut, false);
  }
  assert.equal(nativeLauncher.originalInnerTimeoutMs, 5_400_000);
  assert.equal(nativeLauncher.outerTimeoutMs, 5_520_000);
  assert.equal(nativeLauncher.error, null);
  assert.equal(nativeLauncher.receiptIdentityOverridesAbsent, true);
  assert.equal(
    nativeLauncher.precedingInvalidExecutionSha256,
    hash(
      await readFile(resolve(input, invalidPrefix, "launcher/execution.json")),
    ),
  );
  assert.equal(
    nativeLauncher.precedingStopObservationSha256,
    hash(
      await readFile(
        resolve(input, invalidPrefix, "termination/scope-observation.json"),
      ),
    ),
  );
  assert(
    Date.parse(nativeLauncher.startedAt) > Date.parse(invalidStop.observedAt),
  );
  const priorLinuxLaunch = await read(
    "precommit/linux/verify-launch/execution.json",
  );
  assert(
    Date.parse(nativeLauncher.startedAt) >=
      Number(BigInt(priorLinuxLaunch.startedEpochNanoseconds) / 1_000_000n) +
        priorLinuxLaunch.durationMs,
  );
  assert.equal(
    nativeLauncher.precedingLinuxCollectionSha256,
    hash(await readFile(resolve(input, "precommit/linux/collection.json"))),
  );
  assert.equal(
    nativeLauncher.precedingNativeExecutionSha256,
    hash(
      await readFile(
        resolve(input, "unborn-publication-focused-1/child-execution.json"),
      ),
    ),
  );
  const firstProgress = (
    await readFile(
      resolve(input, "unborn-publication-focused-1/progress.jsonl"),
      "utf8",
    )
  )
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(firstProgress.at(-1).event, "run-end");
  assert(
    Date.parse(nativeLauncher.startedAt) >
      Date.parse(firstProgress.at(-1).observedAt),
  );
  assert.deepEqual(nativeChild.argv, [
    "pnpm",
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.config.ts",
    ...expectedNativeFiles,
    "--fileParallelism=false",
    "--reporter=verbose",
    "--reporter=json",
    "--reporter=./artifacts/c6e-native-retry-tools/runtime/progress-reporter.mjs",
    "--outputFile=" + nativeLauncher.commandOutput + "\\vitest-report.json",
  ]);
  assert.equal(
    hash(await readFile(resolve(input, nativePrefix, "executed-runner.ts"))),
    "deeb26dd22e94b8210197a1ae83b400bb878c3933f02d8b79cd4fc918c09924d",
  );
  assert.equal(
    hash(await readFile(resolve(input, nativePrefix, "executed-reporter.mjs"))),
    "423d3687ac7cf70fb75db863d9aba99a3c926cd6544a029ac80f1be5e38740c9",
  );
  assert.equal(nativeRaw.success, true);
  assert.equal(nativeRaw.numTotalTests, 266);
  assert.equal(nativeRaw.numPassedTests, 266);
  assert.equal(nativeRaw.numFailedTests, 0);
  assert.equal(nativeRaw.numPendingTests, 0);
  assert.equal(nativeRaw.numTodoTests, 0);
  assert.deepEqual(
    nativeRaw.testResults
      .map((file: RawFile) => portablePath(file.name))
      .sort(),
    [...expectedNativeFiles].sort(),
  );
  assert(
    nativeRaw.testResults.every((file: RawFile) =>
      file.assertionResults.every((test) => test.status === "passed"),
    ),
  );
  const nativeIds = identities(nativeRaw);
  assert.equal(new Set(nativeIds).size, 266);
  assert.deepEqual(
    [...identities(nativeFirstRaw)].sort(),
    [...nativeIds].sort(),
  );
  for (const identity of identities(
    await read("dependency-repair-focused-1/command/vitest-report.json"),
  ))
    assert(nativeIds.includes(identity), identity);
  const nativeSummary = assertTestRunSummary(
    await nativeRead("test-run-summary.json"),
  );
  assert.deepEqual(nativeSummary.candidate, {
    gitCommit: unbornInput.source.commit,
    gitTree: unbornInput.source.tree,
    workingTreeDirty: false,
  });
  assert.equal(nativeSummary.platform.os, "win32");
  assert.deepEqual(nativeSummary.reports, [
    await describeVitestReport({
      artifactDirectory: resolve(input, nativePrefix),
      reportPath: resolve(input, nativePrefix, "vitest-report.json"),
    }),
  ]);
  const nativeProgress = (
    await readFile(resolve(input, nativePrefix, "progress.jsonl"), "utf8")
  )
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(nativeProgress[0].event, "run-start");
  assert.equal(nativeProgress[0].modules, 10);
  assert.equal(nativeProgress.at(-1).event, "run-end");
  assert.equal(nativeProgress.at(-1).unhandledErrors, 0);
  const nativeProgressCases = nativeProgress.filter(
    (value) => value.event === "case-end",
  );
  assert(
    nativeProgressCases.every(
      (value) => value.state === "passed" && value.errors.length === 0,
    ),
  );
  const nativeProgressNames = nativeRaw.testResults.flatMap((file: RawFile) =>
    file.assertionResults.map(
      (test) =>
        portablePath(file.name) +
        "\0" +
        [...test.ancestorTitles, test.title].join(" > "),
    ),
  );
  assert.deepEqual(
    nativeProgressCases.map((value) => value.path + "\0" + value.name).sort(),
    nativeProgressNames.sort(),
  );
  const nativeCollection = await nativeRead("launcher/collection.json");
  assert.equal(nativeCollection.receiptBytesRewritten, false);
  assert.equal(
    new Set(nativeCollection.copied.map((pin: Pin) => pin.path)).size,
    nativeCollection.copied.length,
  );
  assert.equal(
    nativeCollection.copied.reduce(
      (total: number, pin: Pin) => total + pin.bytes,
      0,
    ),
    nativeCollection.copiedBytes,
  );
  for (const pin of nativeCollection.copied as Pin[]) {
    assert(!isAbsolute(pin.path) && !pin.path.split(/[\\/]/).includes(".."));
    const bytes = await readFile(resolve(input, nativePrefix, pin.path));
    assert.equal(bytes.length, pin.bytes);
    assert.equal(hash(bytes), pin.sha256);
  }
  const nativePublication = {
    source: unbornInput.source,
    platform: nativeSummary.platform,
    tests: nativeIds.length,
    firstAttemptFailures: nativeFirstFailures,
    receiptSha256: requireReceipt(nativePrefix + "/result.json").sha256,
    completionEligible: false,
    nativeWorkflowQualification: false,
  };
  assert.equal(
    frozen.inputObservationSha256,
    liveAudit.inputObservation.sha256,
  );
  const parent = await read(
    "transition-cleanup-postcommit/postcommit-observation.json",
  );
  assert.equal(parent.candidate.gitCommit, base);
  assert.equal(parent.candidate.gitStatus, "");
  for (const pin of parent.receipts)
    assert.equal(
      requireReceipt(
        "transition-cleanup-postcommit/postcommit-" + pin.name + "/result.json",
      ).sha256,
      pin.sha256,
    );
  const hosted = await read("hosted-fc2419d-audit-1/audit.json");
  assert.equal(hosted.hostedCommit, base);
  assert.equal(hosted.workflowRunId, "34047573294");
  assert.equal(hosted.observations.length, 5);
  assert(
    hosted.observations.every(
      (job: { conclusion: string }) => job.conclusion === "success",
    ),
  );
  assert.equal(
    hosted.observations.reduce(
      (total: number, job: { ownedReceipts: number }) =>
        total + job.ownedReceipts,
      0,
    ),
    43,
  );
  // Final precommit observations are populated only by the clean owned checkout.
  // These mandatory paths are intentionally absent until the real checks run.
  const precommit = await read("precommit/observation.json");
  assert.equal(precommit.source.commit, unbornInput.source.commit);
  assert.equal(precommit.source.tree, unbornInput.source.tree);
  assert.equal(precommit.completionEligible, false);
  assert.equal(precommit.source.status, "");
  assert.equal(precommit.source.branch, "refs/heads/master");
  const firstSix = await read("six-source-report-audit-1/report.json");
  assert.deepEqual(firstSix.source, revisedInput.source);
  assert.equal(firstSix.productionReportMeanings, true);
  assert.equal(firstSix.actualImplementationAudit, false);
  assert.equal(firstSix.completionEligible, false);
  assert.deepEqual(
    firstSix.commands.map((row: { id: string }) => row.id),
    [
      "typecheck",
      "lint",
      "format",
      "architecture",
      "dependencies",
      "invariants",
    ],
  );
  for (const row of firstSix.commands)
    assert.equal(
      row.receiptSha256,
      requireReceipt("precommit-linux-3/commands/" + row.id + "/result.json")
        .sha256,
    );
  const nativeFailure = await read("dependency-repair-native-1/manifest.json");
  assert.equal(nativeFailure.status, "ERROR");
  assert.equal(nativeFailure.receipt, null);
  assert(!existsSync(resolve(input, "dependency-repair-native-1/result.json")));
  assert.match(
    nativeFailure.failureClassification.message,
    /not an independent ordinary copy: bin\/eslint.js/,
  );
  assert.equal(
    (await read("dependency-repair-native-1/independent-file-observation.json"))
      .nlink,
    19,
  );
  const nativeCopy = await read("dependency-repair-native-copy-1/report.json");
  assert.deepEqual(nativeCopy.source, revisedInput.source);
  assert.equal(nativeCopy.platform, "win32");
  assert.equal(nativeCopy.packages, 192);
  assert.equal(nativeCopy.presentPackages, 138);
  for (const key of [
    "sourceQualification",
    "nativeWorkflowQualification",
    "completionEligible",
  ])
    assert.equal(nativeCopy[key], false);
  assert.equal(nativeCopy.commands.length, 2);
  assert.deepEqual(nativeCopy.commands[0].argv, [
    "pnpm",
    "--config.verify-deps-before-run=error",
    "install",
    "--frozen-lockfile",
    "--offline",
    "--package-import-method=copy",
  ]);
  assert.deepEqual(nativeCopy.commands[1].argv, [
    "pnpm",
    "--config.verify-deps-before-run=error",
    "verify:source-dependencies",
  ]);
  for (const command of nativeCopy.commands) {
    assert.equal(command.exitCode, 0);
    assert.equal(command.signal, null);
    assert.equal(command.error, null);
    assert.equal(command.supervision.timedOut, false);
    assert.equal(command.supervision.streamsClosed, true);
  }
  const nativeReceipt = await read(
    "dependency-repair-native-copy-1/command/result.json",
  );
  assert.equal(
    requireReceipt("dependency-repair-native-copy-1/command/result.json")
      .sha256,
    nativeCopy.dependencyReceiptSha256,
  );
  const nativeArtifacts = new Map();
  for (const pin of nativeReceipt.artifacts) {
    nativeArtifacts.set(pin.path, {
      ...pin,
      contents: await readFile(
        resolve(input, "dependency-repair-native-copy-1/command", pin.path),
      ),
    });
  }
  const nativeReport = await read(
    "dependency-repair-native-copy-1/command/report.json",
  );
  assert.equal(nativeReport.schemaVersion, "source-dependencies-report.v2");
  inspectSourceDependencyCaptures(nativeReport, nativeArtifacts);
  assert.deepEqual(
    precommit.reportMeanings,
    await inspectPrecommitReports({
      gitRepository: resolve(output, "unborn-input/revised.git"),
      commandRoot: resolve(input, "precommit"),
      source: {
        commit: unbornInput.source.commit,
        tree: unbornInput.source.tree,
      },
    }),
  );
  const failedHost = await read("precommit-vm-1/host/host.json");
  const failedExpected = await read("precommit-vm-1/expected.json");
  assert.deepEqual(failedHost.binding, failedExpected.binding);
  assert.equal(
    failedHost.binding.sourceCommit,
    frozen.isolatedPrecommitInputCommit,
  );
  assert.equal(failedHost.binding.sourceTree, frozen.reconstructedTree);
  assert.equal(failedHost.status, "ERROR");
  assert.equal(failedHost.cleanupVerified, true);
  assert(!existsSync(resolve(input, "precommit-vm-1/host-audit/result.json")));
  assert(
    !existsSync(
      resolve(input, "precommit-vm-1/guest/guest/precommit-observation.json"),
    ),
  );
  const failedExecution = await read(
    "precommit-vm-1/guest/guest/precommit-dependencies.json",
  );
  assert.deepEqual(failedExecution.argv, [
    "/opt/bin/pnpm",
    "--config.verify-deps-before-run=error",
    "verify:source-dependencies",
  ]);
  assert.equal(failedExecution.exitCode, 1);
  assert.equal(failedExecution.timedOut, false);
  const failedDependency = await read(
    "precommit-vm-1/guest/artifacts/c6e-precommit/dependencies/manifest.json",
  );
  assert.equal(failedDependency.status, "ERROR");
  assert.equal(failedDependency.receipt, null);
  assert.match(
    failedDependency.failureClassification.message,
    /\/work\/\.pnpm-store\/v11/,
  );
  assert.match(
    failedDependency.failureClassification.message,
    /\/home\/qualifier\/\.local\/share\/pnpm\/store\/v11/,
  );
  for (const name of ["typecheck", "lint", "format", "architecture"])
    requireReceipt(
      "precommit-vm-1/guest/artifacts/c6e-precommit/" + name + "/result.json",
    );
  for (const name of [
    "dependencies",
    "invariants",
    "orchestrator",
    "unit",
    "build",
  ])
    assert(
      !existsSync(
        resolve(
          input,
          "precommit-vm-1/guest/artifacts/c6e-precommit",
          name,
          "result.json",
        ),
      ),
    );
  for (const name of ["invariants", "orchestrator", "unit", "build"])
    assert(
      !existsSync(
        resolve(
          input,
          "precommit-vm-1/guest/guest",
          "precommit-" + name + ".json",
        ),
      ),
    );
  requireReceipt("precommit-vm-1/oci-audit/result.json");
  requireReceipt("precommit-vm-1/cleanup-audit/result.json");
  const cleanup = await read(
    "precommit-vm-1/cleanup-audit/cleanup-observation.json",
  );
  assert.equal(cleanup.results.length, 1);
  assert.equal(
    cleanup.results[0].reportSha256,
    hash(await readFile(resolve(input, "precommit-vm-1/host/host.json"))),
  );
  for (const field of [
    "directoryAbsent",
    "cgroupAbsent",
    "processIdentityAbsent",
  ])
    assert.equal(cleanup.results[0][field], true);
  failedRuns.push({
    name: "precommit-vm-1",
    passed: 4,
    failed: 1,
    failureClassification: failedDependency.failureClassification,
  });
  const secondHost = await read("precommit-vm-2/host/host.json");
  assert.equal(secondHost.status, "ERROR");
  assert.equal(secondHost.cleanupVerified, true);
  assert.equal(
    secondHost.binding.sourceCommit,
    frozen.isolatedPrecommitInputCommit,
  );
  assert.equal(secondHost.binding.sourceTree, frozen.reconstructedTree);
  assert.deepEqual(
    secondHost.binding,
    (await read("precommit-vm-2/expected.json")).binding,
  );
  const secondDependency = await read(
    "precommit-vm-2/guest/artifacts/c6e-precommit/dependencies/manifest.json",
  );
  assert.equal(secondDependency.status, "ERROR");
  assert.equal(secondDependency.receipt, null);
  assert.match(secondDependency.failureClassification.message, /bin\/esbuild/);
  assert.match(secondDependency.failureClassification.message, /9350/);
  assert.match(secondDependency.failureClassification.message, /11407472/);
  assert.equal(
    (
      await readFile(
        resolve(
          input,
          "precommit-vm-2/guest/artifacts/c6e-precommit/dependencies/store-path.stdout.log",
        ),
        "utf8",
      )
    ).trim(),
    "/home/qualifier/.local/share/pnpm/store/v11",
  );
  const secondExecution = await read(
    "precommit-vm-2/guest/guest/precommit-dependencies.json",
  );
  assert.deepEqual(secondExecution.argv, failedExecution.argv);
  assert.equal(secondExecution.exitCode, 1);
  assert.equal(secondExecution.timedOut, false);
  for (const name of ["typecheck", "lint", "format", "architecture"])
    requireReceipt(
      "precommit-vm-2/guest/artifacts/c6e-precommit/" + name + "/result.json",
    );
  for (const name of [
    "dependencies",
    "invariants",
    "orchestrator",
    "unit",
    "build",
  ])
    assert(
      !existsSync(
        resolve(
          input,
          "precommit-vm-2/guest/artifacts/c6e-precommit",
          name,
          "result.json",
        ),
      ),
    );
  for (const name of ["invariants", "orchestrator", "unit", "build"])
    assert(
      !existsSync(
        resolve(
          input,
          "precommit-vm-2/guest/guest",
          "precommit-" + name + ".json",
        ),
      ),
    );
  assert(!existsSync(resolve(input, "precommit-vm-2/host-audit/result.json")));
  assert(
    !existsSync(
      resolve(input, "precommit-vm-2/guest/guest/precommit-observation.json"),
    ),
  );
  requireReceipt("precommit-vm-2/oci-audit/result.json");
  requireReceipt("precommit-vm-2/cleanup-audit/result.json");
  const secondCleanup = await read(
    "precommit-vm-2/cleanup-audit/cleanup-observation.json",
  );
  assert.equal(secondCleanup.results.length, 1);
  assert.equal(
    secondCleanup.results[0].reportSha256,
    hash(await readFile(resolve(input, "precommit-vm-2/host/host.json"))),
  );
  for (const field of [
    "directoryAbsent",
    "cgroupAbsent",
    "processIdentityAbsent",
  ])
    assert.equal(secondCleanup.results[0][field], true);
  failedRuns.push({
    name: "precommit-vm-2",
    passed: 4,
    failed: 1,
    failureClassification: secondDependency.failureClassification,
  });
  const thirdHost = await read("precommit-vm-3/host/host.json");
  assert.equal(thirdHost.status, "ERROR");
  assert.equal(thirdHost.cleanupVerified, true);
  assert.equal(
    thirdHost.binding.sourceCommit,
    frozen.isolatedPrecommitInputCommit,
  );
  assert.equal(thirdHost.binding.sourceTree, frozen.reconstructedTree);
  assert.deepEqual(
    thirdHost.binding,
    (await read("precommit-vm-3/expected.json")).binding,
  );
  const thirdDependency = await read(
    "precommit-vm-3/guest/artifacts/c6e-precommit/dependencies/manifest.json",
  );
  assert.equal(thirdDependency.status, "ERROR");
  assert.equal(thirdDependency.receipt, null);
  assert.match(
    thirdDependency.failureClassification.message,
    /store-integrity failed with exit 1/,
  );
  const thirdExecution = await read(
    "precommit-vm-3/guest/guest/precommit-dependencies.json",
  );
  assert.deepEqual(thirdExecution.argv, failedExecution.argv);
  assert.equal(thirdExecution.exitCode, 1);
  assert.equal(thirdExecution.timedOut, false);
  for (const name of ["typecheck", "lint", "format", "architecture"])
    requireReceipt(
      "precommit-vm-3/guest/artifacts/c6e-precommit/" + name + "/result.json",
    );
  for (const name of [
    "dependencies",
    "invariants",
    "orchestrator",
    "unit",
    "build",
  ])
    assert(
      !existsSync(
        resolve(
          input,
          "precommit-vm-3/guest/artifacts/c6e-precommit",
          name,
          "result.json",
        ),
      ),
    );
  for (const name of ["invariants", "orchestrator", "unit", "build"])
    assert(
      !existsSync(
        resolve(
          input,
          "precommit-vm-3/guest/guest",
          "precommit-" + name + ".json",
        ),
      ),
    );
  assert(!existsSync(resolve(input, "precommit-vm-3/host-audit/result.json")));
  assert(
    !existsSync(
      resolve(input, "precommit-vm-3/guest/guest/precommit-observation.json"),
    ),
  );
  requireReceipt("precommit-vm-3/oci-audit/result.json");
  requireReceipt("precommit-vm-3/cleanup-audit/result.json");
  const thirdCleanup = await read(
    "precommit-vm-3/cleanup-audit/cleanup-observation.json",
  );
  assert.equal(thirdCleanup.results.length, 1);
  assert.equal(
    thirdCleanup.results[0].reportSha256,
    hash(await readFile(resolve(input, "precommit-vm-3/host/host.json"))),
  );
  for (const field of [
    "directoryAbsent",
    "cgroupAbsent",
    "processIdentityAbsent",
  ])
    assert.equal(thirdCleanup.results[0][field], true);
  failedRuns.push({
    name: "precommit-vm-3",
    passed: 4,
    failed: 1,
    failureClassification: thirdDependency.failureClassification,
  });
  const fourthHost = await read("precommit-vm-4/host/host.json");
  assert.equal(fourthHost.status, "ERROR");
  assert.equal(fourthHost.durationMs, 1815930);
  assert.match(fourthHost.failure, /Host lifecycle deadline exceeded/);
  assert.equal(fourthHost.binding.sourceCommit, revisedInput.source.commit);
  assert.equal(fourthHost.binding.sourceTree, revisedInput.source.tree);
  assert.deepEqual(fourthHost.inputHashesBefore, fourthHost.inputHashesAfter);
  assert.equal(
    (await read("precommit-vm-4/collect-execution.json")).exitCode,
    1,
  );
  assert.match(
    await readFile(resolve(input, "precommit-vm-4/collect.stderr.log"), "utf8"),
    /FileNotFoundError.*guest-evidence\.tar\.gz/s,
  );
  for (const path of [
    "guest",
    "oci-audit/result.json",
    "host-audit/result.json",
  ])
    assert(!existsSync(resolve(input, "precommit-vm-4", path)));
  requireReceipt("precommit-vm-4/cleanup-audit/result.json");
  const fourthCleanup = await read(
    "precommit-vm-4/cleanup-audit/cleanup-observation.json",
  );
  assert.equal(fourthCleanup.results.length, 1);
  assert.equal(
    fourthCleanup.results[0].reportSha256,
    hash(await readFile(resolve(input, "precommit-vm-4/host/host.json"))),
  );
  for (const key of [
    "processIdentityAbsent",
    "directoryAbsent",
    "cgroupAbsent",
  ])
    assert.equal(fourthCleanup.results[0][key], true);
  failedRuns.push({
    name: "precommit-vm-4",
    status: "ERROR",
    failure: fourthHost.failure,
    rawChildEvidence: "UNAVAILABLE",
    independentCleanup: true,
  });
  const firstProbe = await read(
    "precommit-linux-1/probe-launch/execution.json",
  );
  assert.equal(firstProbe.exitCode, 1);
  assert.equal(firstProbe.cgroupAbsent, true);
  assert.match(
    await readFile(
      resolve(input, "precommit-linux-1/probe-launch/stderr.log"),
      "utf8",
    ),
    /Address family not supported by protocol/,
  );
  assert(!existsSync(resolve(input, "precommit-linux-1/verify-launch")));
  failedRuns.push({
    name: "precommit-linux-1",
    status: "ERROR",
    boundary: "namespace-interface-probe",
    sourceCommands: "NOT_RUN",
  });
  const detached = await read("precommit-linux-2/collection.json");
  assert.equal(detached.executionExitCode, 1);
  assert.equal(detached.pinsUnchanged, true);
  assert.equal(detached.sourceStateAbsent, true);
  assert.equal(detached.gitAfter[2].exitCode, 1);
  assert.equal(detached.gitAfter[2].stdout, "");
  assert.deepEqual(detached.gitAfter[2].argv.slice(-3), [
    "symbolic-ref",
    "--quiet",
    "HEAD",
  ]);
  assert.equal(
    (await read("precommit-linux-2/verify-launch/execution.json")).cgroupAbsent,
    true,
  );
  assert.equal(
    (await read("precommit-linux-2/verify/completed-commands.json")).length,
    5,
  );
  const detachedOwnership = await read(
    "precommit-linux-2/commands/invariants/entries/test-ownership/test-ownership-report.json",
  );
  assert.equal(detachedOwnership.status, "FAIL");
  assert.match(JSON.stringify(detachedOwnership), /ENTRYPOINT_CONTRACT_DRIFT/);
  assert.match(JSON.stringify(detachedOwnership), /symbolic-ref/);
  for (const name of [
    "typecheck",
    "lint",
    "format",
    "architecture",
    "dependencies",
  ])
    requireReceipt("precommit-linux-2/commands/" + name + "/result.json");
  for (const path of [
    "verify/observation.json",
    "commands/invariants/result.json",
    "commands/orchestrator",
    "commands/unit",
    "commands/build",
  ])
    assert(!existsSync(resolve(input, "precommit-linux-2", path)));
  failedRuns.push({
    name: "precommit-linux-2",
    status: "ERROR",
    boundary: "ENTRYPOINT_CONTRACT_DRIFT",
    cause: "detached-input-checkout",
    completedSourceCommands: 5,
  });
  const controllerFailure = await read(
    "precommit-linux-3/commands/orchestrator/orchestrator-report.json",
  );
  assert.equal(controllerFailure.numTotalTests, 1066);
  assert.equal(controllerFailure.numPassedTests, 1024);
  assert.equal(controllerFailure.numFailedTests, 42);
  assert.equal(controllerFailure.numPendingTests, 0);
  assert.equal(controllerFailure.numTodoTests, 0);
  assert.equal(controllerFailure.success, false);
  const failureCollection = await read("precommit-linux-3/collection.json");
  assert.deepEqual(failureCollection.source, revisedInput.source);
  assert.equal(failureCollection.executionExitCode, 1);
  assert.equal(failureCollection.pinsUnchanged, true);
  assert.deepEqual(failureCollection.pins, revisedMetadata.pins);
  const failureLaunch = await read(
    "precommit-linux-3/verify-launch/execution.json",
  );
  assert.equal(failureLaunch.exitCode, 1);
  assert.equal(failureLaunch.cgroupAbsent, true);
  assert.match(failureLaunch.unitAfter.stdout, /^MainPID=0$/m);
  const failureExecution = await read(
    "precommit-linux-3/verify/orchestrator.execution.json",
  );
  assert.equal(failureExecution.exitCode, 1);
  assert.equal(failureExecution.timedOut, false);
  assert.equal(failureExecution.outputLimitExceeded, false);
  assert.equal(failureExecution.durationMs, 1207072);
  assert.equal(
    (await read("precommit-linux-3/verify/completed-commands.json")).length,
    6,
  );
  for (const path of [
    "commands/orchestrator/result.json",
    "commands/unit",
    "commands/build",
    "verify/observation.json",
  ])
    assert(!existsSync(resolve(input, "precommit-linux-3", path)));
  const failureCounts = controllerFailure.testResults
    .map((file: RawFile) => ({
      path: portablePath(file.name),
      failed: file.assertionResults.filter((test) => test.status === "failed")
        .length,
    }))
    .filter((row: { failed: number }) => row.failed > 0)
    .sort((a: { path: string }, b: { path: string }) =>
      a.path.localeCompare(b.path),
    );
  assert.deepEqual(failureCounts, [
    {
      path: "tools/milestone-orchestrator/src/candidate-package-runtime.test.ts",
      failed: 1,
    },
    { path: "tools/milestone-orchestrator/src/doctor.test.ts", failed: 19 },
    {
      path: "tools/milestone-orchestrator/src/operation-intent.test.ts",
      failed: 1,
    },
    {
      path: "tools/milestone-orchestrator/src/safety-demonstration.test.ts",
      failed: 1,
    },
    {
      path: "tools/milestone-orchestrator/src/state-store.test.ts",
      failed: 20,
    },
  ]);
  failedRuns.push({
    name: "precommit-linux-3",
    passed: 1024,
    failed: 42,
    failureCounts,
    rootUnit: "NOT_RUN",
    build: "NOT_RUN",
  });
  const cached = await read("cache-runtime-report-audit-1/report.json");
  assert.deepEqual(cached.source, revisedInput.source);
  assert.equal(cached.verifiedInputPins, 331);
  assert.equal(cached.originalTestUnchanged, true);
  assert.equal(cached.actualCandidate, false);
  assert.equal(cached.actualImplementationAudit, false);
  assert.equal(cached.sourceQualification, false);
  assert.equal(cached.completionEligible, false);
  assert.equal(
    cached.receiptSha256,
    requireReceipt(
      "cache-runtime-diagnostic-1/commands/candidate-runtime/result.json",
    ).sha256,
  );
  const cachedRaw = await read(
    "cache-runtime-diagnostic-1/commands/candidate-runtime/vitest-report.json",
  );
  assert.equal(cachedRaw.numTotalTests, 1);
  assert.equal(cachedRaw.numPassedTests, 1);
  assert.equal(cachedRaw.success, true);
  assert.equal(
    cachedRaw.testResults[0].assertionResults[0].fullName,
    cached.caseName,
  );
  assert.equal(
    hash(
      await readFile(
        resolve(
          input,
          "cache-runtime-report-audit-1/owned-account-config.yaml",
        ),
      ),
    ),
    cached.ownedAccountConfigSha256,
  );
  const oldHost = await read("precommit-oci-vm-1/host/host.json");
  assert.equal(oldHost.binding.sourceCommit, revisedInput.source.commit);
  assert.equal(oldHost.binding.sourceTree, revisedInput.source.tree);
  assert.equal(oldHost.status, "OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT");
  for (const name of ["host-audit", "oci-audit", "cleanup-audit"])
    requireReceipt("precommit-oci-vm-1/" + name + "/result.json");
  const actualHost = await read("precommit/vm/host/host.json");
  assert.equal(actualHost.status, "OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT");
  assert.equal(actualHost.binding.sourceCommit, unbornInput.source.commit);
  assert.equal(actualHost.binding.sourceTree, unbornInput.source.tree);
  assert.equal(actualHost.binding.activeAuthorityEpoch, "legacy-source.v1");
  assert.equal(actualHost.controllerDispatched, false);
  assert.equal(actualHost.completionEligible, false);
  assert.deepEqual(actualHost.inputHashesBefore, actualHost.inputHashesAfter);
  const hostAudit = await read("precommit/vm/host-audit/host-audit.json");
  assert.equal(hostAudit.status, "PASS");
  assert.equal(hostAudit.claimScope, "one-disposable-linux-host-lifecycle");
  assert.deepEqual(hostAudit.binding, actualHost.binding);
  for (const key of ["completionEligible", "sourceReadiness", "nativeWindows"])
    assert.equal(hostAudit[key], false);
  for (const [name, inventory] of [
    ["host", hostAudit.hostInventory],
    ["guest", hostAudit.guestInventory],
  ]) {
    assert.equal(inventory.fileCount, inventory.files.length);
    let bytes = 0;
    for (const pin of inventory.files as Pin[]) {
      assert(!isAbsolute(pin.path) && !pin.path.split(/[\\/]/).includes(".."));
      const content = await readFile(
        resolve(input, "precommit/vm", name, pin.path),
      );
      assert.equal(content.length, pin.bytes, pin.path);
      assert.equal(hash(content), pin.sha256, pin.path);
      bytes += content.length;
    }
    assert.equal(bytes, inventory.totalBytes);
  }
  const hostEvents = await read("precommit/vm/host/events.json");
  const sourceEvents = hostEvents.filter(
    (row: { value?: { kind?: string } }) =>
      row.value?.kind === "source-input-verified",
  );
  assert.equal(sourceEvents.length, 1);
  assert.equal(sourceEvents[0].value.sourceCommit, unbornInput.source.commit);
  assert.equal(sourceEvents[0].value.sourceTree, unbornInput.source.tree);
  assert.equal(sourceEvents[0].value.sourceChecksDispatched, false);
  assert.equal(sourceEvents[0].value.pins, 331);
  const installed = await read("precommit/vm/guest/guest/source-install.json");
  assert.deepEqual(installed.argv, [
    "/opt/bin/pnpm",
    "install",
    "--frozen-lockfile",
    "--offline",
    "--package-import-method",
    "copy",
  ]);
  assert.equal(installed.exitCode, 0);
  assert.equal(installed.uid, 1000);
  assert.equal(installed.timedOut, false);
  const config = await readFile(
    resolve(input, "precommit/vm/guest/guest/precommit-pnpm-config.yaml"),
  );
  assert.equal(
    config.toString(),
    "enableGlobalVirtualStore: false\nstoreDir: /home/qualifier/.local/share/pnpm/store\n",
  );
  assert.equal(
    hash(config),
    (await read("precommit/vm/guest/guest/precommit-pnpm-config.json")).sha256,
  );
  const linuxChecks = await inspectLinuxPrecommit({
    directory: resolve(input, "precommit/linux"),
    source: unbornInput.source,
    pins: (await read("precommit/subject/source.json")).pins,
  });
  assert.deepEqual(precommit.linuxChecks, linuxChecks);
  const actualCommands = [
    ...SOURCE_AUDIT_COMMANDS,
    { id: "orchestrator", argv: ["pnpm", "test:orchestrator"] },
  ];
  assert.equal(precommit.commands.length, 9);
  assert.equal(precommit.receipts.length, 9);
  for (const check of actualCommands) {
    const raw = await read(
      "precommit/linux/verify/" + check.id + ".execution.json",
    );
    assert.deepEqual(
      precommit.commands.find(
        (command: { name: string }) => command.name === check.id,
      ),
      raw,
    );
    const pin = precommit.receipts.find(
      (receipt: { id: string }) => receipt.id === check.id,
    );
    assert(pin);
    assert.equal(
      requireReceipt("precommit/" + check.id + "/result.json").sha256,
      pin.sha256,
    );
    assert.deepEqual(pin.execution, raw);
  }
  for (const audit of precommit.audits)
    assert.equal(
      requireReceipt("precommit/vm/" + audit.name + "/result.json").sha256,
      audit.sha256,
    );
  assert.deepEqual(
    precommit.audits.map((audit: { name: string }) => audit.name).sort(),
    ["cleanup-audit", "host-audit", "oci-audit"],
  );
  for (const name of [
    "typecheck",
    "lint",
    "format",
    "architecture",
    "dependencies",
    "invariants",
    "orchestrator",
    "unit",
    "build",
  ]) {
    requireReceipt("precommit/" + name + "/result.json");
    const manual = await read("precommit/" + name + "/manifest.json");
    assert.equal(manual.candidate.gitCommit, precommit.source.commit, name);
    assert.equal(manual.candidate.gitTree, precommit.source.tree, name);
    assert.equal(manual.candidate.workingTreeDirty, false, name);
  }
  const unit = await read("precommit/unit/test-report.json");
  const controller = await read(
    "precommit/orchestrator/orchestrator-report.json",
  );
  assert.equal(controller.success, true);
  assert.equal(controller.numTotalTests, 1076);
  assert.equal(controller.numPassedTests, 1076);
  const controllerIds = new Set(identities(controller));
  assert.equal(controllerIds.size, 1076);
  for (const identity of identities(controllerFailure))
    assert(controllerIds.has(identity), identity);
  for (const identity of unbornIdentitySet)
    assert(controllerIds.has(identity), identity);
  assert.equal(unit.success, true);
  assert.equal(unit.numPassedTests, unit.numTotalTests);
  assert.equal(unit.numFailedTests, 0);
  assert.equal(unit.numPendingTests, 0);
  assert.equal(unit.numTodoTests, 0);
  const unitIds = identities(unit);
  for (const identity of nativeIds)
    assert(unitIds.includes(identity), identity);
  assert.equal(new Set(unitIds).size, unit.numTotalTests);
  assert.equal(unit.testResults.length, 101);
  const parentUnit = await read(
    "hosted-fc2419d/controller-linux/unit/test-report.json",
  );
  assert.equal(parentUnit.numPassedTests, 1124);
  for (const identity of identities(parentUnit))
    assert(
      unitIds.includes(identity),
      "Parent identity disappeared: " + identity,
    );
  for (const identity of focusedIds)
    assert(
      unitIds.includes(identity),
      "Focused identity missing from root suite: " + identity,
    );
  for (const identity of identities(
    await read("dependency-repair-focused-1/command/vitest-report.json"),
  ))
    assert(
      unitIds.includes(identity),
      "Revised focused identity missing from root suite: " + identity,
    );
  const report = {
    schemaVersion: "source-publication-retained-audit.v1",
    status: "PASS",
    sourceBase: base,
    observer: await commandIdentity(repository),
    rawFiles: files.length,
    operationalRecords: manifest.operationalRecords,
    receipts,
    retainedErrors,
    frozen,
    dependencyRepair,
    nativeCopy,
    revisedInput,
    unbornInput,
    nativePublication,
    failedRuns,
    focusedTests: 203,
    preservedPriorFocusedTests: 107,
    precommit,
    rootTests: unit.numTotalTests,
    preservedParentRootTests: 1124,
    parentHostedRun: hosted.workflowRunId,
    completionEligible: false,
    sourceAuthorityActivated: false,
    sourceStateAdopted: false,
    actualImplementationAudit: false,
    sdkServiceReview: false,
    actualCandidate: "NOT_RUN",
    historicalWP6e: "BLOCKED_AT_e590e38c32de2b5baa7423f66bbd8a0230b61839",
  };
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "retained-publication-and-source-boundaries",
        summary:
          "Independently checked every retained file and receipt artifact, reconstructed the frozen inputs, preserved failed and non-completion results, reconciled raw identities, and verified clean precommit observations separately from parent hosted evidence.",
      },
    ],
    [{ path: "audit.json", kind: "source-publication-retained-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["source-publication-retained-audit"],
  });
  console.log(
    JSON.stringify({
      rawFiles: files.length,
      receipts: receipts.length,
      rootTests: unit.numTotalTests,
      receiptSha256: checked.receiptSha256,
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.stack : String(error),
  });
  throw error;
}
