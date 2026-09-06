import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { inspectSourceEpochSnapshot } from "../../../tools/milestone-orchestrator/src/source-epoch-snapshot.js";

const [inputArg, outputArg, commit] = process.argv.slice(2);
assert(
  inputArg &&
    outputArg &&
    (process.argv.length === 4 || process.argv.length === 5),
);
const root = resolve(inputArg),
  output = resolve(outputArg),
  repo = resolve(import.meta.dirname, "../../..");
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c4",
  "retained-inert-snapshot-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
try {
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(root, path))) {
      const relative = path ? path + "/" + name : name,
        absolute = resolve(root, relative),
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
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  const order = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), manifest.files.sort(order));
  assert.equal(files.length, 98);
  for (const pin of manifest.implementation)
    assert.equal(
      hash(await readFile(resolve(repo, pin.path))),
      pin.sha256,
      pin.path,
    );
  const read = async (path: string) =>
    JSON.parse(await readFile(resolve(root, path), "utf8"));
  const initial = await read("focused-1/vitest-report.json");
  assert.equal(initial.numTotalTests, 21);
  assert.equal(initial.numFailedTests, 12);
  assert(!existsSync(resolve(root, "focused-1/result.json")));
  assert(!existsSync(resolve(root, "typecheck-1/result.json")));
  const fixed = await read("focused-2/vitest-report.json");
  assert.equal(fixed.numTotalTests, 30);
  assert.equal(fixed.numPassedTests, 30);
  assert.equal(fixed.numFailedTests, 0);
  assert.equal(fixed.numPendingTests, 0);
  assert(
    fixed.testResults.every((file) =>
      file.assertionResults.every((test) => test.status === "passed"),
    ),
  );
  const execution = await read("focused-2/execution.json");
  assert.equal(execution.identity.gitCommit, manifest.sourceBase);
  assert.equal(execution.identity.gitTree, manifest.testedIndex);
  assert.equal(execution.identity.nodeVersion, "v24.18.0");
  assert.equal(execution.identity.pnpmVersion, "11.15.1");
  const preparation = await read(
    "snapshot-preparation/preparation-report.json",
  );
  assert.equal(preparation.status, "PREPARED_UNCOMMITTED");
  assert.equal(preparation.files.length, 12);
  assert.equal(preparation.activationAuthorized, false);
  for (const file of [...preparation.files, ...preparation.activeAuthorities])
    assert.equal(
      hash(await readFile(resolve(repo, file.path))),
      file.sha256,
      file.path,
    );
  const ownership = await read(
    "invariants-1/entries/test-ownership/test-ownership-report.json",
  );
  assert.equal(ownership.status, "PASS");
  assert.equal(ownership.discovery.uniqueFileCount, 92);
  assert.deepEqual(
    ownership.owners.map((owner) => [owner.id, owner.count]),
    [
      ["controller-runtime", 85],
      ["repository-tooling", 4],
      ["adopter-template", 2],
      ["trusted-container-fixture", 1],
    ],
  );
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const receipt = await read(file.path);
    const checked = await validateCommandReceiptDirectory({
      directory: resolve(root, dirname(file.path)),
      expectedStageId: receipt.stageId,
      expectedCommandId: receipt.commandId,
    });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
  }
  assert.equal(receipts.length, 11);
  // Reconstruct the actual staged supporting tree; no commit or branch is created.
  const temporary = await mkdtemp(resolve(context.artifactDirectory, "index-"));
  let reconstructed: string;
  try {
    const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, "index") };
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], {
        env,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
      });
    git("read-tree", manifest.sourceBase);
    git("apply", "--cached", "--binary", resolve(root, "tested-source.patch"));
    reconstructed = git("write-tree").trim();
    assert.equal(reconstructed, manifest.testedIndex);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const snapshot = commit
    ? await inspectSourceEpochSnapshot({
        repositoryRoot: repo,
        snapshotCommit: commit,
      })
    : null;
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "source-epoch-inert-audit.v1",
        status: "PASS",
        claimScope: "inert-snapshot-supporting-evidence",
        completionEligible: false,
        activationAuthorized: false,
        reconstructedTestedIndex: reconstructed,
        files,
        receipts,
        snapshot,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "INERT-SNAPSHOT-SUPPORT",
        summary:
          "Exact retained files, eleven real command receipts/artifacts, 30 passed cases, unchanged live authorities and reconstructed supporting Git tree validate. Any supplied committed snapshot is independently inspected; no activation, candidate or readiness claim is granted.",
      },
    ],
    [{ path: "audit.json", kind: "source-epoch-inert-audit" }],
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
      snapshotCommit: snapshot?.snapshotCommit ?? null,
      completionEligible: false,
      activationAuthorized: false,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
