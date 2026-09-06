import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  runPnpm,
  assertCommandPassed,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

// Deliberately selected diagnostic cases, never a passing complete-suite claim.
// The original test bodies and their 30/30/60-second deadlines remain in place.
const file = "tools/milestone-orchestrator/src/commissioning-amendment.test.ts";
const names = [
  "refuses formatting-only amendments without adding a ledger entry",
  "publishes formatter-compliant descriptor bytes without changing the approved content",
  "applies a committed descriptor to clean v1 and reverses by extending the ledger",
].map((name) => "Git-anchored source commissioning amendments " + name);
const context = await evidenceContext(
  "orch-auth-01-c6a",
  "selected-amendment-deadlines",
);
const pins = async () => {
  const files = [
    file,
    "tools/milestone-orchestrator/src/authority-publication.mjs",
    "tools/milestone-orchestrator/src/authority-anchor.ts",
    "tools/milestone-orchestrator/src/commissioning-audit.ts",
    "tools/milestone-orchestrator/src/commissioning.ts",
    "tools/milestone-orchestrator/src/config.ts",
    "tools/milestone-orchestrator/src/controller-lease.ts",
  ];
  const result = [];
  for (const path of files) {
    const absolute = resolve(context.repositoryRoot, path);
    if (!existsSync(absolute)) {
      result.push({ path, absent: true });
      continue;
    }
    const bytes = await readFile(absolute);
    result.push({
      path,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return result;
};
try {
  const identity = await commandIdentity(context.repositoryRoot),
    before = await pins();
  const argv = [
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.config.ts",
    file,
    "--fileParallelism=false",
    "--testNamePattern=^(?:" + names.join("|") + ")$",
    "--reporter=verbose",
    "--reporter=json",
    "--reporter=./docs/source-authority/ORCH-AUTH-01-C6a/progress-reporter.mjs",
    "--outputFile=" + resolve(context.artifactDirectory, "vitest-report.json"),
  ];
  const child = await runPnpm(argv, {
    timeoutMs: 5 * 60 * 1000,
    env: {
      C6A_FOCUSED_PROGRESS: resolve(
        context.artifactDirectory,
        "progress.jsonl",
      ),
    },
  });
  for (const stream of ["stdout", "stderr"] as const)
    await writeFile(
      resolve(context.artifactDirectory, `${stream}.log`),
      child[stream] ?? "",
    );
  const after = await pins();
  await writeFile(
    resolve(context.artifactDirectory, "execution.json"),
    JSON.stringify(
      {
        schemaVersion: "selected-amendment-diagnostic.v1",
        claimScope: "three-explicit-cases-only",
        completionEligible: false,
        identity,
        argv: ["pnpm", ...argv],
        selectedNames: names,
        before,
        after,
        exitCode: child.status,
        signal: child.signal,
        supervision: child.supervision ?? null,
      },
      null,
      2,
    ) + "\n",
  );
  assert.deepEqual(after, before);
  assertCommandPassed(child, "Selected amendment deadline cases");
  const raw = JSON.parse(
    await readFile(
      resolve(context.artifactDirectory, "vitest-report.json"),
      "utf8",
    ),
  );
  assert.equal(raw.testResults.length, 1);
  assert.equal(raw.numFailedTests, 0);
  assert.equal(raw.numPassedTests, 3);
  const selected = raw.testResults[0].assertionResults.filter((test) =>
    names.includes(test.fullName),
  );
  assert.deepEqual(
    selected.map((test) => test.fullName).sort(),
    [...names].sort(),
  );
  assert(selected.every((test) => test.status === "passed"));
  assert(
    raw.testResults[0].assertionResults
      .filter((test) => !names.includes(test.fullName))
      .every((test) => test.status === "skipped"),
  );
  const artifacts = [
    "vitest-report.json",
    "execution.json",
    "progress.jsonl",
    "stdout.log",
  ].map((path) => ({
    path,
    kind: "selected-amendment-" + path.replaceAll(".", "-"),
  }));
  if ((child.stderr ?? "").length)
    artifacts.push({ path: "stderr.log", kind: "selected-amendment-stderr" });
  await writeReceipt(
    context,
    [
      {
        id: "three-original-deadlines",
        summary:
          "Only the three explicitly selected original amendment cases passed their unchanged 30/30/60-second deadlines; unselected cases remain visibly skipped and this is not full-suite evidence.",
      },
    ],
    artifacts,
  );
  const receipt = await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      selectedTests: 3,
      fullSuite: false,
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
