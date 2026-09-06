import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
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
import { inspectSourceEpochSnapshot } from "../../../tools/milestone-orchestrator/src/source-epoch-snapshot.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c6a",
  "retained-reader-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
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
  for (const pin of manifest.activeGeneration) {
    const old = execFileSync(
      "git",
      ["-C", repo, "show", `${manifest.sourceBase}:${pin.path}`],
      { windowsHide: true, timeout: 30_000 },
    );
    assert.equal(
      hash(old),
      pin.sha256,
      `Unchanged active generation: ${pin.path}`,
    );
  }
  assert.equal(await assertActiveAuthorityPublication(repo), "legacy");
  const snapshot = await inspectSourceEpochSnapshot({
    repositoryRoot: repo,
    snapshotCommit: "91cbd3eb75ec771cfa1f315fe2641488e361c9e0",
  });
  assert.equal(snapshot.strictAncestor, true);
  const passedReport = (report) => {
    assert.equal(report.success, true);
    assert(report.numTotalTests > 0);
    assert.equal(report.numPassedTests, report.numTotalTests);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    assert(
      report.testResults.every((file) =>
        file.assertionResults.every((test) => test.status === "passed"),
      ),
    );
  };
  const initial = await read("affected-1/vitest-report.json");
  assert.equal(initial.numTotalTests, 226);
  assert.equal(initial.numFailedTests, 23);
  for (const directory of [
    "affected-1",
    "affected-final",
    "typecheck-1",
    "lint-1",
  ])
    assert(!existsSync(resolve(input, directory, "result.json")));
  const boundaries = await read("final-boundaries/vitest-report.json"),
    affected = await read(
      "vm-1/guest/artifacts/c6a-complete/vitest-report.json",
    );
  assert.equal(
    (await read("affected-final/vitest-report.json")).numFailedTests,
    10,
  );
  const doctorState = await read("doctor-state-final/vitest-report.json");
  passedReport(doctorState);
  assert.equal(doctorState.numTotalTests, 52);
  passedReport(boundaries);
  passedReport(affected);
  assert.equal(boundaries.numTotalTests, 56);
  assert.equal(affected.numTotalTests, 282);
  const caseIdentities = (file) =>
    file.assertionResults.map((test) => test.fullName).sort();
  const sourcePath = (name: string) =>
    name
      .replaceAll("\\", "/")
      .slice(name.replaceAll("\\", "/").indexOf("/tools/") + 1);
  assert.equal(affected.testResults.length, 16);
  for (const file of affected.testResults) {
    const prior = [...initial.testResults, ...boundaries.testResults].find(
      (previous) => sourcePath(previous.name) === sourcePath(file.name),
    );
    assert(
      prior,
      `The rerun must retain an original affected suite: ${file.name}`,
    );
    assert.deepEqual(caseIdentities(file), caseIdentities(prior));
  }
  for (const name of [
    "final-boundaries",
    "vm-1/guest/artifacts/c6a-complete",
  ]) {
    const execution = await read(`${name}/execution.json`);
    assert.equal(execution.identity.gitCommit, manifest.sourceBase);
    assert.equal(execution.identity.nodeVersion, "v24.18.0");
    assert.equal(execution.identity.pnpmVersion, "11.15.1");
    assert.notEqual(execution.identity.gitStatus, "");
  }
  for (const [name, failures] of [
    ["baseline", 3],
    ["no-checkout", 3],
    ["git-diagnostic", 3],
    ["direct-git", 1],
  ] as const) {
    const directory = `baseline/c6a-amendment-${name}`;
    const report = await read(`${directory}/vitest-report.json`);
    assert.equal(report.numTotalTests, 37);
    assert.equal(report.numFailedTests, failures);
    assert.equal(report.numPendingTests, 34);
    assert(!existsSync(resolve(input, directory, "result.json")));
    const execution = await read(`${directory}/execution.json`);
    assert.equal(execution.identity.gitCommit, manifest.sourceBase);
    assert(
      execution.before.some(
        (pin) =>
          pin.path.endsWith("/authority-publication.mjs") &&
          pin.absent === true,
      ),
    );
    assert.deepEqual(execution.before, execution.after);
  }
  assert.equal((await read("linux/focused.json")).exitCode, 1);
  assert.match(
    await readFile(resolve(input, "linux/focused.stderr.log"), "utf8"),
    /esbuild EACCES/,
  );
  // Raw test success never overrides a failed production measurement boundary.
  const failedLinux = await read("linux-2/affected-complete/manifest.json");
  assert.equal((await read("linux-2/focused.json")).exitCode, 1);
  assert.equal(failedLinux.status, "ERROR");
  assert.equal(failedLinux.receipt, null);
  assert.equal(
    failedLinux.failureClassification.message,
    "Probe timestamps are contradictory.",
  );
  assert(!existsSync(resolve(input, "linux-2/affected-complete/result.json")));
  passedReport(await read("linux-2/affected-complete/vitest-report.json"));
  assert.equal(
    (await read("linux-2/affected-complete/child-execution.json")).exitCode,
    0,
  );
  const failedProbes = files.filter(
    (file) =>
      file.path.startsWith("linux-2/affected-complete/.test-run-probe/") &&
      file.path.endsWith(".json"),
  );
  assert.equal(failedProbes.length, 55);
  const contradictory = [];
  for (const file of failedProbes) {
    const probe = await read(file.path);
    if (Date.parse(probe.finishedAt) < Date.parse(probe.startedAt))
      contradictory.push(probe);
  }
  assert.equal(contradictory.length, 1);
  assert.equal(contradictory[0].pid, 13577);
  assert.equal(contradictory[0].wallNanoseconds, "767001031");
  const clock = await read("linux-3/clock-observation.json");
  assert.equal(clock.exitCode, 1);
  assert.equal(clock.claimScope, "Linux-development-only");
  assert.equal(
    clock.runnerSha256,
    hash(await readFile(resolve(input, "linux-3/runner.py"))),
  );
  assert.equal(
    hash(await readFile(resolve(input, "linux-3/runner.py"))),
    hash(await readFile(resolve(input, "linux-2/runner.py"))),
  );
  const clockSamples = (
    await readFile(resolve(input, "linux-3/clock-samples.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(clockSamples.length > 1);
  const clockDiscontinuities = [];
  for (let index = 0; index < clockSamples.length; index++) {
    const sample = clockSamples[index];
    assert(BigInt(sample.monotonicAfter) >= BigInt(sample.monotonicBefore));
    if (index === 0) continue;
    const prior = clockSamples[index - 1];
    const elapsed =
      BigInt(sample.monotonicBefore) - BigInt(prior.monotonicBefore);
    assert(elapsed >= 0n);
    const difference =
      BigInt(sample.epochNanoseconds) -
      BigInt(prior.epochNanoseconds) -
      elapsed;
    if (difference < -100_000_000n || difference > 100_000_000n)
      clockDiscontinuities.push({
        index,
        differenceNanoseconds: difference.toString(),
      });
  }
  const projection = await read("linux-3/projection.json"),
    projectionInput = await read("linux-3/input/projection.json"),
    linuxExecution = await read(
      "vm-1/guest/artifacts/c6a-complete/execution.json",
    );
  assert.equal((await read("linux-3/focused.json")).exitCode, 1);
  const repeatedFailure = await read("linux-3/affected-complete/manifest.json");
  assert.equal(repeatedFailure.status, "ERROR");
  assert.equal(repeatedFailure.receipt, null);
  assert.equal(
    repeatedFailure.failureClassification.message,
    "Probe timestamps are contradictory.",
  );
  assert(!existsSync(resolve(input, "linux-3/affected-complete/result.json")));
  passedReport(await read("linux-3/affected-complete/vitest-report.json"));
  assert(clockDiscontinuities.length > 0);
  const guestCommand = await read("vm-1/guest/guest/reader-focused.json");
  assert.equal(guestCommand.exitCode, 0);
  assert.equal(guestCommand.timedOut, false);
  assert.equal(guestCommand.uid, 1000);
  const guestInput = await read("vm-1/guest/guest/input-manifest.json");
  assert.equal(
    guestInput.files.find((file) => file.path === "source.patch").sha256,
    projectionInput.inputs["source.patch"].sha256,
  );
  const host = await read("vm-1/host/host.json");
  assert.equal(host.binding.sourceCommit, manifest.sourceBase);
  assert.equal(host.status, "OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT");
  for (const field of [
    "cleanupVerified",
    "pidAbsent",
    "cgroupAbsent",
    "directoryAbsent",
  ])
    assert.equal(host[field], true);
  assert.equal(
    hash(await readFile(resolve(input, "vm-1/host/executed-host.py"))),
    "e3e8fd910030f5fe0e7d831960ce4c6ac6cfa51908405b4a8a2702f29ac29c9c",
  );
  const guestClocks = (
    await readFile(
      resolve(input, "vm-1/guest/guest/reader-clock-samples.jsonl"),
      "utf8",
    )
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(guestClocks.length > 1);
  for (let index = 1; index < guestClocks.length; index++) {
    assert(
      BigInt(guestClocks[index].epochNanoseconds) >=
        BigInt(guestClocks[index - 1].epochNanoseconds),
    );
    assert(
      BigInt(guestClocks[index].monotonicBefore) >=
        BigInt(guestClocks[index - 1].monotonicAfter),
    );
  }
  assert.deepEqual(
    projectionInput,
    await read("linux-2/input/projection.json"),
  );
  assert.equal(projection.claimScope, "Linux-development-only");
  assert.equal(projection.sourceBase, manifest.sourceBase);
  assert.equal(linuxExecution.identity.gitTree, projection.projectedTree);
  assert.equal(projection.projectedTree, projectionInput.projectedTree);
  assert.equal(
    hash(await readFile(resolve(input, "linux-3/input/source.patch"))),
    projectionInput.inputs["source.patch"].sha256,
  );
  const temporary = await mkdtemp(resolve(output, "projection-index-"));
  try {
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000,
        env: { ...process.env, GIT_INDEX_FILE: resolve(temporary, "index") },
      });
    git("read-tree", manifest.sourceBase);
    git(
      "apply",
      "--cached",
      "--binary",
      resolve(input, "linux-3/input/source.patch"),
    );
    assert.equal(git("write-tree").trim(), projection.projectedTree);
    for (const pin of manifest.implementation.filter((pin) =>
      /^(scripts|tools)\//.test(pin.path),
    )) {
      const blob = execFileSync(
        "git",
        ["-C", repo, "show", `${projection.projectedTree}:${pin.path}`],
        { windowsHide: true, timeout: 30_000 },
      );
      assert.equal(
        hash(blob),
        pin.sha256,
        `Actual Linux-tested runtime or test: ${pin.path}`,
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
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
    "typecheck-4",
    "lint-3",
    "format-2",
    "architecture-1",
    "invariants-1",
    "vm-1/oci-audit",
    "vm-1/host-audit",
  ])
    assert(
      receipts.some((receipt) => receipt.path === `${command}/result.json`),
    );
  const jobs = (await read("hosted/jobs.json")).jobs;
  assert.equal(jobs.length, 5);
  assert(
    jobs.every(
      (job) => job.status === "completed" && job.conclusion === "success",
    ),
  );
  assert.deepEqual(
    jobs.map((job) => job.id).sort(),
    [
      101439508398, 101439508521, 101439508555, 101439508558, 101439508659,
    ].sort(),
  );
  const artifacts = await read("hosted/artifacts.json");
  assert.equal(artifacts.length, 5);
  const hosted = [];
  for (const artifact of artifacts) {
    assert.equal(artifact.workflow_run.id, 34015911019);
    assert.equal(
      artifact.workflow_run.head_sha,
      "42871f66ae1711821703f16bcb97cca18b5ccf3a",
    );
    const bytes = await readFile(resolve(input, `hosted/${artifact.id}.zip`));
    assert.equal(bytes.length, artifact.size_in_bytes);
    assert.equal("sha256:" + hash(bytes), artifact.digest);
    const prefix = `hosted/extracted-${artifact.id}/`;
    const owned = receipts.filter((receipt) => receipt.path.startsWith(prefix));
    if (artifact.name.startsWith("controller-")) {
      assert.equal(owned.length, 11);
      const unit = await read(prefix + "unit/test-report.json"),
        controller = await read(
          prefix + "orchestrator/orchestrator-report.json",
        );
      passedReport(unit);
      passedReport(controller);
      assert.equal(unit.numTotalTests, 954);
      assert.equal(controller.numTotalTests, 826);
      hosted.push({
        name: artifact.name,
        unitTests: unit.numTotalTests,
        controllerTests: controller.numTotalTests,
        ownedReceipts: owned.length,
      });
    } else if (artifact.name.startsWith("fresh-adopter-")) {
      assert.equal(owned.length, 10);
      const aggregate = await read(prefix + "smoke/verification/result.json");
      assert.equal(aggregate.schemaVersion, "2.1.0");
      assert.equal(aggregate.status, "PASS");
      assert.equal(aggregate.profile.id, "bootstrap");
      assert.equal(aggregate.completion.eligible, false);
      assert.equal(aggregate.stages.length, 9);
      assert(aggregate.stages.every((stage) => stage.status === "PASS"));
      hosted.push({
        name: artifact.name,
        profile: "bootstrap",
        completionEligible: false,
        ownedReceipts: owned.length,
      });
    } else {
      assert(artifact.name.startsWith("trusted-container-"));
      assert.equal(owned.length, 1);
      const matrix = await read(prefix + "matrix/result.json");
      assert.equal(matrix.status, "PASS");
      assert.equal(matrix.cases.length, 6);
      assert.deepEqual(
        matrix.cases.map((entry) => [entry.id, entry.status]),
        [
          ["normal", "PASS"],
          ["boundary", "PASS"],
          ["artifact-link", "ERROR"],
          ["artifact-quota", "ERROR"],
          ["output-flood", "ERROR"],
          ["hang", "TIMEOUT"],
        ],
      );
      for (const entry of matrix.cases) {
        const declared = entry.containmentReport;
        assert(
          declared.path.startsWith("artifacts/ci/trusted-container/matrix/"),
        );
        const raw = await readFile(
          resolve(
            input,
            prefix +
              declared.path.slice("artifacts/ci/trusted-container/".length),
          ),
        );
        assert.equal(raw.length, declared.bytes);
        assert.equal(hash(raw), declared.sha256);
      }
      hosted.push({
        name: artifact.name,
        cases: matrix.cases.map((entry) => ({
          id: entry.id,
          status: entry.status,
        })),
        ownedReceipts: owned.length,
      });
    }
  }
  const identity = await commandIdentity(repo);
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "c6a-reader-audit.v1",
        status: "PASS",
        claimScope: manifest.claimScope,
        completionEligible: false,
        activationAuthorized: false,
        observer: identity,
        files: files.length,
        receipts,
        initialAffectedFailures: 23,
        boundaryTests: boundaries.numTotalTests,
        affectedTests: affected.numTotalTests,
        failedLinuxMeasurement: {
          status: failedLinux.status,
          retainedProbeRecords: failedProbes.length,
          contradictoryProbe: contradictory[0],
        },
        wslClockObservation: {
          samples: clockSamples.length,
          discontinuities: clockDiscontinuities,
          claimScope: "read-only-observation-no-runtime-qualification",
        },
        guestClockSamples: guestClocks.length,
        snapshot,
        hosted,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "retained-readers-and-hosted-cohort",
        summary:
          "Rehashed the exact retained bytes and real command receipts, checked original failures and passing corrected reports, all five exact-commit hosted artifacts, unchanged legacy authority and strict inert snapshot ancestry. No activation, candidate or readiness claim.",
      },
    ],
    [{ path: "audit.json", kind: "source-reader-audit" }],
  );
  const receipt = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
      boundaryTests: boundaries.numTotalTests,
      affectedTests: affected.numTotalTests,
      hostedJobs: hosted.length,
      receiptSha256: receipt.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
