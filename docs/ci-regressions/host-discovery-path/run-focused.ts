import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  runPnpm,
  assertCommandPassed,
  writeReceipt,
  writeManualEvidenceFailure,
  FULL_SUITE_EVIDENCE_TIMEOUT_MS,
} from "../../../tools/evidence.mjs";
import {
  beginTestRunMeasurement,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const files = process.argv.slice(2).map((name) => name);
assert(files.length > 0);
const context = await evidenceContext(
  "wp6e-host-discovery-path",
  "host-discovery-regression",
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const measurement = await beginTestRunMeasurement({
    artifactDirectory: context.artifactDirectory,
    runId: context.manualEvidence.manifestId,
    stageId: context.stageId,
    commandId: context.commandId,
    role: "legacy",
    owner: null,
    identity: {
      gitCommit: identity.gitCommit,
      gitTree: identity.gitTree,
      workingTreeDirty: identity.gitStatus !== "",
      nodeVersion: identity.nodeVersion,
      pnpmVersion: identity.pnpmVersion,
    },
  });
  const rawPath = resolve(context.artifactDirectory, "vitest-report.json");
  const argv = [
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.config.ts",
    ...files,
    "--fileParallelism=false",
    "--reporter=verbose",
    "--reporter=json",
    `--outputFile=${rawPath}`,
  ];
  measurement.markSetupFinished();
  const result = await runPnpm(argv, {
    timeoutMs: FULL_SUITE_EVIDENCE_TIMEOUT_MS,
    env: measurement.probeEnvironment,
    processStartupObserver: (value) => measurement.observeProcessStartup(value),
  });
  const artifacts = [
    {
      path: "vitest-report.json",
      kind: "host-discovery-regression-vitest-report",
    },
    { path: "test-run-summary.json", kind: "test-run-summary" },
    { path: "execution.json", kind: "host-discovery-regression-execution" },
  ];
  for (const name of ["stdout", "stderr"] as const) {
    const bytes = result[name] ?? "";
    await writeFile(resolve(context.artifactDirectory, `${name}.log`), bytes);
    if (bytes.length)
      artifacts.push({
        path: `${name}.log`,
        kind: `host-discovery-regression-${name}`,
      });
  }
  assertCommandPassed(result, "Host discovery fixture regression");
  const raw = JSON.parse(await readFile(rawPath, "utf8"));
  assert(raw.numTotalTests > 0);
  assert.equal(raw.numPassedTests, raw.numTotalTests);
  assert.equal(raw.numFailedTests, 0);
  assert.equal(raw.numPendingTests, 0);
  assert.deepEqual(
    raw.testResults
      .map((file) =>
        relative(context.repositoryRoot, file.name).replaceAll("\\", "/"),
      )
      .sort(),
    [...files].sort(),
  );
  assert(
    raw.testResults.every((file) =>
      file.assertionResults.every((test) => test.status === "passed"),
    ),
  );
  await measurement.finish([
    await describeVitestReport({
      artifactDirectory: context.artifactDirectory,
      reportPath: rawPath,
    }),
  ]);
  await writeFile(
    resolve(context.artifactDirectory, "execution.json"),
    JSON.stringify(
      {
        schemaVersion: "host-discovery-regression-execution.v1",
        completionEligible: false,
        identity,
        argv: ["pnpm", ...argv],
        tests: raw.numTotalTests,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "focused-regressions-executed",
        summary:
          "Every requested test file executed completely, with no failed or skipped tests, using the production measurement probe and original deadlines.",
      },
    ],
    artifacts,
  );
  const receipt = await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: artifacts.slice(0, 3).map(({ kind }) => kind),
  });
  process.stdout.write(
    JSON.stringify({
      tests: raw.numTotalTests,
      receipt: receipt.receiptPath,
      sha256: receipt.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
