import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "wp6e-host-discovery-path",
  "retained-regression-audit",
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
        assert(info.isFile());
        const bytes = await readFile(absolute);
        files.push({ path: child, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await walk();
  const order = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), manifest.files.sort(order));
  for (const pin of manifest.implementation)
    assert.equal(
      hash(await readFile(resolve(repo, pin.path))),
      pin.sha256,
      pin.path,
    );
  const old = execFileSync(
    "git",
    [
      "-C",
      repo,
      "show",
      manifest.sourceBase + ":tools/qualification-host-discovery.test.mjs",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  const expected = old
    .replace("  readFile,\n", "  readFile,\n  realpath,\n")
    .replace(
      'await mkdtemp(join(tmpdir(), "host-discovery-"))',
      'await realpath(await mkdtemp(join(tmpdir(), "host-discovery-")))',
    );
  assert.equal(
    await readFile(
      resolve(repo, "tools/qualification-host-discovery.test.mjs"),
      "utf8",
    ),
    expected,
  );
  const oldScanner = execFileSync(
    "git",
    [
      "-C",
      repo,
      "show",
      manifest.sourceBase + ":tools/qualification-host-discovery.mjs",
    ],
    { windowsHide: true, timeout: 30_000 },
  );
  assert.equal(
    hash(
      await readFile(resolve(repo, "tools/qualification-host-discovery.mjs")),
    ),
    hash(oldScanner),
  );
  const local = await read("discovery-alias-baseline/vitest-report.json"),
    hosted = await read("hosted/hosted-repair-windows-unit-report.json"),
    fixed = await read(
      "discovery-alias-tooling-fixed/repository-tooling-vitest-report-01.json",
    );
  assert.equal(local.numTotalTests, 40);
  assert.equal(local.numFailedTests, 8);
  assert.equal(local.numPassedTests, 32);
  assert.equal(hosted.numTotalTests, 937);
  assert.equal(hosted.numFailedTests, 8);
  assert.equal(hosted.numPassedTests, 929);
  const failures = (report) =>
    report.testResults
      .flatMap((file) =>
        file.assertionResults
          .filter((test) => test.status !== "passed")
          .map((test) => test.fullName),
      )
      .sort();
  assert.deepEqual(failures(local), failures(hosted));
  assert(!existsSync(resolve(input, "discovery-alias-baseline/result.json")));
  assert.equal(fixed.numTotalTests, 128);
  assert.equal(fixed.numPassedTests, 128);
  assert.equal(fixed.numFailedTests, 0);
  assert.equal(fixed.numPendingTests, 0);
  assert(
    fixed.testResults.every((file) =>
      file.assertionResults.every((test) => test.status === "passed"),
    ),
  );
  const cohort = await read("hosted/hosted-repair-jobs-progress-5.json"),
    artifacts = await read("hosted/hosted-repair-artifacts-final.json");
  assert.equal(cohort.jobs.length, 5);
  assert(cohort.jobs.every((job) => job.status === "completed"));
  assert.equal(
    cohort.jobs.filter((job) => job.conclusion === "success").length,
    4,
  );
  assert.equal(
    cohort.jobs.find((job) => job.id === 101429410993).conclusion,
    "failure",
  );
  assert.equal(artifacts.length, 5);
  for (const artifact of artifacts) {
    assert.equal(
      artifact.workflow_run.head_sha,
      "827ebbf27b98fb1e2a3ea97cb5c1c0100618818d",
    );
    const bytes = await readFile(
      resolve(input, `hosted/hosted-repair-${artifact.id}.zip`),
    );
    assert.equal(bytes.length, artifact.size_in_bytes);
    assert.equal("sha256:" + hash(bytes), artifact.digest);
  }
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const value = await read(file.path),
      checked = await validateCommandReceiptDirectory({
        directory: resolve(input, dirname(file.path)),
        expectedStageId: value.stageId,
        expectedCommandId: value.commandId,
      });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
  }
  assert.equal(receipts.length, manifest.receiptCount);
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "host-discovery-path-audit.v1",
        status: "PASS",
        completionEligible: false,
        observer: await commandIdentity(repo),
        fileCount: files.length,
        receipts,
        originalHostedCohort: "FAIL",
        exactMatchedFailures: failures(local),
        fixedTests: 128,
        productionScannerChanged: false,
        originalAssertionsChanged: false,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "exact-alias-repair-audited",
        summary:
          "Verified all retained bytes/receipts, exact eight hosted/local failure identities, 128 corrected cases and only canonicalization of the owned fixture with every original assertion unchanged.",
      },
    ],
    [{ path: "audit.json", kind: "host-discovery-path-audit" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["host-discovery-path-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      files: files.length,
      receipts: receipts.length,
      fixedTests: 128,
      completionEligible: false,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
