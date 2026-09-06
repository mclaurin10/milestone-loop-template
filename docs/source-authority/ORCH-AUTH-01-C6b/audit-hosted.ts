import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";

const [inputArg, commit, runId, outputArg] = process.argv.slice(2);
assert(
  inputArg &&
    commit &&
    /^[a-f0-9]{40}$/.test(commit) &&
    runId &&
    /^\d+$/.test(runId) &&
    outputArg &&
    process.argv.length === 6,
);
const input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c6b",
  "hosted-observation-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
try {
  const jobs = (await read("jobs.json")).jobs;
  const names = [
    "Controller (linux)",
    "Controller (windows)",
    "Fresh adopter smoke (linux)",
    "Fresh adopter smoke (windows)",
    "Trusted container (Linux Docker)",
  ];
  assert.deepEqual(jobs.map((job) => job.name).sort(), [...names].sort());
  for (const job of jobs) {
    assert.equal(job.status, "completed");
    assert.equal(job.run_id, Number(runId));
    assert.equal(job.head_sha, commit);
    assert(
      ["success", "failure", "timed_out", "cancelled"].includes(job.conclusion),
    );
  }
  const artifacts = (await read("artifacts.json")).artifacts;
  assert.equal(artifacts.length, 5);
  assert.deepEqual(
    artifacts.map((a) => a.name).sort(),
    [
      "controller-linux",
      "controller-windows",
      "fresh-adopter-linux",
      "fresh-adopter-windows",
      "trusted-container-linux",
    ]
      .map((name) => name + "-" + commit)
      .sort(),
  );
  assert.equal(new Set(artifacts.map((a) => a.id)).size, 5);
  const receipts: { path: string; sha256: string }[] = [];
  async function walk(path: string) {
    const absolute = resolve(input, path),
      info = await lstat(absolute);
    assert(!info.isSymbolicLink());
    if (info.isDirectory()) {
      for (const name of await readdir(absolute)) await walk(path + "/" + name);
    } else {
      assert(info.isFile() && info.size <= 20_000_000);
      if (!path.endsWith("/result.json")) return;
      const value = await read(path);
      if (value.schemaVersion !== "1.0.0" || typeof value.stageId !== "string")
        return;
      const checked = await validateCommandReceiptDirectory({
        directory: dirname(absolute),
        expectedStageId: value.stageId,
        expectedCommandId: value.commandId,
      });
      receipts.push({ path, sha256: checked.receiptSha256 });
    }
  }
  const observations = [];
  for (const artifact of artifacts) {
    assert.equal(artifact.workflow_run.id, Number(runId));
    assert.equal(artifact.workflow_run.head_sha, commit);
    const stem = artifact.name.replace("-" + commit, "");
    assert.equal(artifact.name, stem + "-" + commit);
    assert(
      /^(controller|fresh-adopter|trusted-container)-(linux|windows)$/.test(
        stem,
      ),
    );
    const bytes = await readFile(resolve(input, stem + ".zip"));
    assert.equal(bytes.length, artifact.size_in_bytes);
    assert.equal("sha256:" + hash(bytes), artifact.digest);
    const toolchain = await read(stem + "/toolchain.json");
    assert.equal(toolchain.status, "PASS");
    assert.equal(toolchain.github.sha, commit);
    assert.equal(toolchain.github.runId, runId);
    assert.equal(toolchain.observed.nodeVersion, "v24.18.0");
    assert.equal(toolchain.observed.pnpmVersion, "11.15.1");
    assert.equal(
      toolchain.observed.platform,
      stem.endsWith("windows") ? "win32" : "linux",
    );
    const jobName = stem.startsWith("controller-")
      ? `Controller (${stem.slice(11)})`
      : stem.startsWith("fresh-adopter-")
        ? `Fresh adopter smoke (${stem.slice(14)})`
        : "Trusted container (Linux Docker)";
    const job = jobs.find((entry) => entry.name === jobName);
    assert(job);
    const before = receipts.length;
    await walk(stem);
    const ownedReceipts = receipts.length - before;
    if (stem.startsWith("controller-")) {
      const suites = [];
      for (const [directory, file] of [
        ["orchestrator", "orchestrator-report.json"],
        ["unit", "test-report.json"],
      ]) {
        if (!existsSync(resolve(input, stem, directory!, file!))) {
          assert.notEqual(job.conclusion, "success");
          suites.push({ directory, outcome: "NOT_EXECUTED" });
          continue;
        }
        const report = await read(`${stem}/${directory}/${file}`);
        const cases = report.testResults.flatMap(
          (entry) => entry.assertionResults,
        );
        assert.equal(cases.length, report.numTotalTests);
        assert.equal(
          cases.filter((entry) => entry.status === "passed").length,
          report.numPassedTests,
        );
        assert.equal(
          cases.filter((entry) => entry.status === "failed").length,
          report.numFailedTests,
        );
        const passing =
          report.success &&
          cases.every((entry) => entry.status === "passed") &&
          report.numPendingTests === 0;
        if (passing) {
          const summary = assertTestRunSummary(
            await read(`${stem}/${directory}/test-run-summary.json`),
          );
          const descriptor = await describeVitestReport({
            artifactDirectory: resolve(input, stem, directory!),
            reportPath: resolve(input, stem, directory!, file!),
          });
          assert.deepEqual(summary.reports, [descriptor]);
          assert(existsSync(resolve(input, stem, directory!, "result.json")));
        } else {
          assert.notEqual(job.conclusion, "success");
          assert(!existsSync(resolve(input, stem, directory!, "result.json")));
        }
        suites.push({
          directory,
          outcome: passing ? "PASS" : "FAIL",
          total: report.numTotalTests,
          passed: report.numPassedTests,
          failed: report.numFailedTests,
          skipped: report.numPendingTests,
        });
      }
      if (job.conclusion === "success") assert.equal(ownedReceipts, 11);
      observations.push({
        name: stem,
        jobId: job.id,
        conclusion: job.conclusion,
        suites,
        ownedReceipts,
      });
    } else if (stem.startsWith("fresh-adopter-")) {
      assert.equal(job.conclusion, "success");
      assert.equal(ownedReceipts, 10);
      const aggregate = await read(stem + "/smoke/verification/result.json");
      assert.equal(aggregate.schemaVersion, "2.1.0");
      assert.equal(aggregate.status, "PASS");
      assert.equal(aggregate.profile.id, "bootstrap");
      assert.equal(aggregate.completion.eligible, false);
      assert.equal(aggregate.stages.length, 9);
      assert(aggregate.stages.every((stage) => stage.status === "PASS"));
      observations.push({
        name: stem,
        jobId: job.id,
        conclusion: job.conclusion,
        ownedReceipts,
        completionEligible: false,
      });
    } else {
      assert.equal(job.conclusion, "success");
      assert.equal(ownedReceipts, 1);
      const matrix = await read(stem + "/matrix/result.json");
      assert.equal(matrix.status, "PASS");
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
            stem,
            declared.path.slice("artifacts/ci/trusted-container/".length),
          ),
        );
        assert.equal(raw.length, declared.bytes);
        assert.equal(hash(raw), declared.sha256);
      }
      observations.push({
        name: stem,
        jobId: job.id,
        conclusion: job.conclusion,
        ownedReceipts,
        cases: matrix.cases.map((entry) => ({
          id: entry.id,
          status: entry.status,
        })),
      });
    }
  }
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "source-hosted-observation-audit.v1",
        status: "PASS",
        completionEligible: false,
        observer: await commandIdentity(context.repositoryRoot),
        hostedCommit: commit,
        workflowRunId: runId,
        observations,
        receipts,
        artifacts,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "exact-hosted-observations",
        summary:
          "Rehashed all five exact-commit archives, independently validated their child receipts and artifact bytes, and retained actual hosted outcomes without substituting them for candidate or source qualification.",
      },
    ],
    [{ path: "audit.json", kind: "hosted-observation-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["hosted-observation-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      archives: 5,
      childReceipts: receipts.length,
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
