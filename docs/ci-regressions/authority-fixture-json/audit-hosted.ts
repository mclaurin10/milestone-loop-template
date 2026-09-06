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

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "c6a-authority-fixture-repair",
  "hosted-observation-audit",
);
const commit = "6ae4efb808652e24d565cf5562c0611aac5ed25a";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
try {
  const jobs = (await read("jobs.json")).jobs;
  const expectedJobs = [
    [101460565462, "Fresh adopter smoke (windows)", "success"],
    [101460565539, "Controller (linux)", "failure"],
    [101460565542, "Controller (windows)", "failure"],
    [101460565573, "Trusted container (Linux Docker)", "success"],
    [101460565651, "Fresh adopter smoke (linux)", "success"],
  ];
  assert.deepEqual(
    jobs.map((job) => [job.id, job.name, job.conclusion]).sort(),
    expectedJobs.sort(),
  );
  for (const job of jobs) {
    assert.equal(job.status, "completed");
    assert.equal(job.run_id, 34023606616);
    assert.equal(job.head_sha, commit);
  }
  const artifacts = (await read("artifacts.json")).artifacts;
  assert.equal(artifacts.length, 5);
  assert.deepEqual(
    artifacts.map((a) => a.id).sort(),
    [9986613023, 9986377511, 9986344577, 9986341515, 9986335460].sort(),
  );
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
  const failureSets: string[][] = [],
    observations = [];
  for (const artifact of artifacts) {
    assert.equal(artifact.workflow_run.id, 34023606616);
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
    assert.equal(toolchain.github.runId, "34023606616");
    assert.equal(toolchain.observed.nodeVersion, "v24.18.0");
    assert.equal(toolchain.observed.pnpmVersion, "11.15.1");
    assert.equal(
      toolchain.observed.platform,
      stem.endsWith("windows") ? "win32" : "linux",
    );
    const before = receipts.length;
    await walk(stem);
    const ownedReceipts = receipts.length - before;
    if (stem.startsWith("controller-")) {
      assert.equal(ownedReceipts, 6);
      const report = await read(
        stem + "/orchestrator/orchestrator-report.json",
      );
      assert.equal(report.success, false);
      assert.equal(report.numTotalTests, 869);
      assert.equal(report.numPassedTests, 810);
      assert.equal(report.numFailedTests, 59);
      assert.equal(report.numPendingTests, 0);
      const cases = report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          file: file.name.slice(
            file.name.indexOf("tools/milestone-orchestrator/"),
          ),
          ...test,
        })),
      );
      assert.equal(cases.length, 869);
      const failed = cases.filter((test) => test.status === "failed");
      assert.equal(failed.length, 59);
      assert.equal(new Set(failed.map((test) => test.file)).size, 10);
      assert(failed.every((test) => test.failureMessages.length > 0));
      const invalidJson = failed.filter((test) =>
        /not valid JSON/.test(test.failureMessages.join("\n")),
      );
      assert.equal(invalidJson.length, 56);
      failureSets.push(
        failed.map((test) => `${test.file}#${test.fullName}`).sort(),
      );
      assert(!existsSync(resolve(input, stem + "/orchestrator/result.json")));
      assert(!existsSync(resolve(input, stem + "/unit")));
      const manifest = await read(stem + "/orchestrator/manifest.json");
      assert.equal(manifest.status, "ERROR");
      observations.push({
        name: stem,
        outcome: "FAIL",
        tests: 869,
        passed: 810,
        failed: 59,
        unit: "NOT_EXECUTED",
        ownedReceipts,
      });
    } else if (stem.startsWith("fresh-adopter-")) {
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
        outcome: "PASS",
        profile: "bootstrap",
        completionEligible: false,
        ownedReceipts,
      });
    } else {
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
        outcome: "PASS",
        cases: matrix.cases.map((entry) => ({
          id: entry.id,
          status: entry.status,
        })),
        ownedReceipts,
      });
    }
  }
  assert.equal(receipts.length, 33);
  assert.equal(failureSets.length, 2);
  assert.deepEqual(failureSets[0], failureSets[1]);
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "c6a-hosted-observation-audit.v1",
        status: "PASS",
        completionEligible: false,
        authorityGeneration: "legacy-source.v1",
        observer: await commandIdentity(context.repositoryRoot),
        hostedCommit: commit,
        workflowRunId: 34023606616,
        observations,
        failedCaseIdentities: failureSets[0],
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
          "Rehashed all five exact-commit provider archives, independently validated 33 real child receipts and artifacts, and reconciled the same 59 failed controller cases on Linux and native Windows. Controller and unit verification remain non-passing.",
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
      childReceipts: 33,
      controllerFailuresPerPlatform: 59,
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
