import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  runPnpm,
  assertCommandPassed,
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
  "orch-auth-01-c5",
  "portable-retained-source-release-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  }).trim();
const temporary = await realpath(
  await mkdtemp(resolve(output, "git-evidence-")),
);
const repositoryBindings = () => ({
  head: git("rev-parse", "HEAD"),
  indexTree: git("write-tree"),
  refs: git("for-each-ref", "--format=%(refname) %(objectname)"),
  status: git("status", "--porcelain=v1", "--untracked-files=all"),
  sourceStatePresent: existsSync(
    resolve(repo, "artifacts/orchestrator/state/state.json"),
  ),
});
const bindingsBefore = repositoryBindings();
assert.equal(bindingsBefore.sourceStatePresent, false);
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  const retainedCommits = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/commits/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(retainedCommits.schemaVersion, "retained-actual-git-commits.v1");
  assert.equal(retainedCommits.files.length, 2);
  assert.equal(manifest.supportingCandidates.length, 2);
  const gitDirectory = resolve(temporary, "objects.git");
  execFileSync(
    "git",
    [
      "init",
      "--quiet",
      "--bare",
      "--initial-branch=codex/evidence",
      gitDirectory,
    ],
    { windowsHide: true, timeout: 30_000 },
  );
  const sourceObjects = await realpath(
    git("rev-parse", "--path-format=absolute", "--git-path", "objects"),
  );
  assert(!/[\r\n]/.test(sourceObjects));
  await mkdir(resolve(gitDirectory, "objects/info"), { recursive: true });
  await writeFile(
    resolve(gitDirectory, "objects/info/alternates"),
    sourceObjects.replaceAll("\\", "/") + "\n",
    { flag: "wx" },
  );
  const reconstructionEnvironment = {
    ...process.env,
    GIT_INDEX_FILE: resolve(temporary, "index"),
  };
  const cachedGit = (args: string[], bytes?: Buffer) =>
    execFileSync("git", ["--git-dir", gitDirectory, ...args], {
      env: reconstructionEnvironment,
      input: bytes,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  const observations: unknown[] = [];
  for (const [index, candidate] of manifest.supportingCandidates.entries()) {
    const commit = retainedCommits.files[index];
    assert.equal(commit.commit, candidate.commit);
    assert.equal(commit.tree, candidate.tree);
    assert.equal(commit.parent, manifest.sourceBase);
    assert.equal(commit.path, candidate.commit + ".commit");
    const commitPath = resolve(
        import.meta.dirname,
        "evidence/commits",
        commit.path,
      ),
      info = await lstat(commitPath);
    assert(info.isFile() && !info.isSymbolicLink() && info.size <= 4096);
    const bytes = await readFile(commitPath);
    assert.equal(bytes.length, commit.bytes);
    assert.equal(hash(bytes), commit.sha256);
    const objectId = createHash("sha1")
      .update(Buffer.concat([Buffer.from(`commit ${bytes.length}\0`), bytes]))
      .digest("hex");
    assert.equal(
      objectId,
      candidate.commit,
      "Recorded commit bytes do not have the original Git identity.",
    );
    const patchPath = `execution/supporting-candidate-${index + 1}.patch`,
      pin = manifest.files.find((file) => file.path === patchPath);
    assert(pin);
    const patch = await readFile(resolve(input, patchPath));
    assert.equal(patch.length, pin.bytes);
    assert.equal(hash(patch), pin.sha256);
    cachedGit(["read-tree", manifest.sourceBase]);
    cachedGit(["apply", "--cached", "--binary", "-"], patch);
    assert.equal(
      cachedGit(["write-tree"]),
      candidate.tree,
      "Recorded patch does not recreate the actual supporting tree.",
    );
    assert.equal(
      cachedGit(["hash-object", "-w", "-t", "commit", "--stdin"], bytes),
      candidate.commit,
    );
    assert.equal(
      cachedGit(["rev-parse", `${candidate.commit}^{tree}`]),
      candidate.tree,
    );
    assert.equal(
      cachedGit(["rev-parse", `${candidate.commit}^`]),
      manifest.sourceBase,
    );
    observations.push({
      commit: candidate.commit,
      tree: candidate.tree,
      parent: manifest.sourceBase,
      rawCommitSha256: commit.sha256,
      patchSha256: pin.sha256,
    });
  }
  const childOutput = resolve(output, "original-audit");
  const command = await runPnpm(
    [
      "exec",
      "tsx",
      "docs/source-release/ORCH-AUTH-01-C5/audit.ts",
      input,
      childOutput,
    ],
    {
      cwd: repo,
      timeoutMs: 300_000,
      env: {
        GIT_OBJECT_DIRECTORY: resolve(gitDirectory, "objects"),
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined,
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: undefined,
        LOOP_VERIFY_STAGE_ID: undefined,
        LOOP_VERIFY_COMMAND_ID: undefined,
      },
    },
  );
  await writeFile(resolve(output, "stdout.log"), command.stdout ?? "");
  await writeFile(resolve(output, "stderr.log"), command.stderr ?? "");
  assertCommandPassed(
    command,
    "Original retained audit with reconstructed actual Git objects",
  );
  const childReceipt = await validateCommandReceiptDirectory({
    directory: childOutput,
    expectedStageId: "orch-auth-01-c5",
    expectedCommandId: "retained-source-release-audit",
    requiredKinds: ["c5-retained-source-release-audit"],
  });
  const observed = JSON.parse(
    await readFile(resolve(childOutput, "audit.json"), "utf8"),
  );
  assert.equal(observed.status, "PASS");
  assert.equal(observed.files, 318);
  assert.equal(observed.receipts.length, 29);
  assert.equal(observed.completionEligible, false);
  await rm(temporary, { recursive: true, force: true });
  assert(!existsSync(temporary));
  const bindingsAfter = repositoryBindings();
  assert.deepEqual(
    bindingsAfter,
    bindingsBefore,
    "Portable audit changed the source repository bindings.",
  );
  await writeFile(
    resolve(output, "portable-audit.json"),
    JSON.stringify(
      {
        schemaVersion: "portable-c5-retained-audit.v1",
        status: "PASS",
        completionEligible: false,
        freshBuild: false,
        observer: await commandIdentity(repo),
        originalArchiveSha256: manifest.archive.sha256,
        restoredActualObjects: observations,
        sourceRefsCreated: false,
        sourceStateCreated: false,
        temporaryObjectsRemoved: true,
        sourceBindingsBefore: bindingsBefore,
        sourceBindingsAfter: bindingsAfter,
        childReceiptSha256: childReceipt.receiptSha256,
        childAudit: observed,
      },
      null,
      2,
    ) + "\n",
  );
  const artifacts = [
    { path: "portable-audit.json", kind: "portable-c5-retained-audit" },
    { path: "original-audit/audit.json", kind: "c5-original-retained-audit" },
    { path: "original-audit/result.json", kind: "c5-original-audit-receipt" },
  ];
  for (const name of ["stdout", "stderr"])
    if ((command[name] ?? "").length > 0)
      artifacts.push({
        path: `${name}.log`,
        kind: "portable-audit-command-log",
      });
  await writeReceipt(
    context,
    [
      {
        id: "actual-supporting-objects-reconstructed",
        summary:
          "Verified the exact retained raw commit IDs, recreated both sealed supporting trees in a temporary Git object store, and passed the unchanged 318-file/29-receipt audit without creating source refs/state.",
      },
    ],
    artifacts,
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["portable-c5-retained-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      restoredCommits: observations.length,
      originalFiles: observed.files,
      originalReceipts: observed.receipts.length,
      completionEligible: false,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
} finally {
  if (existsSync(temporary))
    await rm(temporary, { recursive: true, force: true });
}
