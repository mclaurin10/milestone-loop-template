import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const retainedRoot = resolve(inputArg),
  root = resolve(retainedRoot, "raw"),
  output = resolve(outputArg);
assert(!existsSync(output), "Audit output must be fresh.");
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "wp6e-ci-inventory",
  "retained-regression-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
try {
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(path = "") {
    for (const entry of await readdir(resolve(retainedRoot, path))) {
      const relative = path ? path + "/" + entry : entry;
      const absolute = resolve(retainedRoot, relative),
        info = await lstat(absolute);
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) await walk(relative);
      else {
        assert(info.isFile());
        const bytes = await readFile(absolute);
        files.push({
          path: relative,
          bytes: bytes.length,
          sha256: hash(bytes),
        });
      }
    }
  }
  await walk();
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.sourceBase, "c9675791714fa23554277496078263744da8b26c");
  assert.deepEqual(
    files,
    manifest.files.sort((a, b) => a.path.localeCompare(b.path)),
  );
  const read = async (path: string) =>
    JSON.parse(await readFile(resolve(root, path), "utf8"));
  const baseline = await read("baseline-focused/vitest-report.json");
  assert.equal(baseline.numTotalTests, 9);
  assert.equal(baseline.numFailedTests, 1);
  assert.equal(baseline.numPassedTests, 8);
  const failed = baseline.testResults
    .flatMap((file) => file.assertionResults)
    .filter((test) => test.status === "failed");
  assert.equal(failed.length, 1);
  assert.match(failed[0].fullName, /canonical tracked catalogue/);
  assert.match(failed[0].failureMessages.join("\n"), /83/);
  assert.match(failed[0].failureMessages.join("\n"), /84/);
  assert(!existsSync(resolve(root, "baseline-focused/result.json")));
  const fixed = await read("fixed-focused/vitest-report.json");
  assert.equal(fixed.numTotalTests, 9);
  assert.equal(fixed.numPassedTests, 9);
  assert.equal(fixed.numFailedTests, 0);
  assert.equal(fixed.numPendingTests, 0);
  const aliasBaseline = await read("windows-alias-baseline/vitest-report.json");
  assert.equal(aliasBaseline.numTotalTests, 25);
  assert.equal(aliasBaseline.numFailedTests, 25);
  assert(
    aliasBaseline.testResults
      .flatMap((file) => file.assertionResults)
      .every(
        (test) =>
          test.status === "failed" &&
          /ordinary directory with stable realpath identity/.test(
            test.failureMessages.join("\n"),
          ),
      ),
  );
  assert(!existsSync(resolve(root, "windows-alias-baseline/result.json")));
  const aliasFixed = await read("windows-alias-fixed/vitest-report.json");
  assert.equal(aliasFixed.numTotalTests, 42);
  assert.equal(aliasFixed.numPassedTests, 42);
  assert.equal(aliasFixed.numFailedTests, 0);
  assert.equal(aliasFixed.numPendingTests, 0);
  const ownership = await read(
    "invariants/entries/test-ownership/test-ownership-report.json",
  );
  assert.equal(ownership.status, "PASS");
  assert.deepEqual(
    ownership.owners.map((owner) => [owner.id, owner.count]),
    [
      ["controller-runtime", 84],
      ["repository-tooling", 4],
      ["adopter-template", 2],
      ["trusted-container-fixture", 1],
    ],
  );
  assert.equal(ownership.discovery.uniqueFileCount, 91);
  assert.equal(ownership.discovery.files.length, 91);
  assert.equal(new Set(ownership.discovery.files).size, 91);
  const invariant = await read("invariants/invariant-suite-report.json");
  assert.equal(invariant.status, "PASS");
  assert.equal(invariant.commands.length, 5);
  assert(
    invariant.commands.every(
      (command) => command.status === "PASS" && command.exitCode === 0,
    ),
  );
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const receipt = JSON.parse(
      await readFile(resolve(retainedRoot, file.path), "utf8"),
    );
    const checked = await validateCommandReceiptDirectory({
      directory: resolve(retainedRoot, dirname(file.path)),
      expectedStageId: receipt.stageId,
      expectedCommandId: receipt.commandId,
    });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
  }
  assert.equal(receipts.length, 14);
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "ci-inventory-regression-audit.v1",
        status: "PASS",
        claimScope: "retained-local-regression-evidence",
        completionEligible: false,
        baseline: { tests: 9, failed: 1, passReceipt: false },
        fixed: { tests: 9, failed: 0 },
        aliasedWindowsBaseline: { tests: 25, failed: 25, passReceipt: false },
        aliasedWindowsFixed: { tests: 42, failed: 0 },
        invariantEntries: 5,
        invariantDurationMs: invariant.durationMs,
        invariantRuntimeTargetMet: invariant.runtimeTargetMet,
        files,
        receipts,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "RETAINED-CATALOGUE-REGRESSION",
        summary:
          "Raw evidence reproduces the stale catalogue assertion and all 25 Windows fixture setup refusals. The corrected 42-case focused suite passes under the aliased Windows TEMP path, the real invariant discovers 91 files, and all supporting receipts/artifacts validate. Hosted and readiness outcomes remain separate.",
      },
    ],
    [{ path: "audit.json", kind: "ci-inventory-regression-audit" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
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
