import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  releaseHash,
  extractReleaseArchive,
} from "../../../tools/source-release-archive.mjs";
import { createCommittedReleasePayload } from "../../../tools/source-release-command.mjs";
import { inspectSourceReleaseOutputs } from "../../../tools/source-release-evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { inspectSourceEpochSnapshot } from "../../../tools/milestone-orchestrator/src/source-epoch-snapshot.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c5",
  "retained-source-release-audit",
);
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  }).trim();
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
        assert(info.isFile() && info.nlink === 1);
        const bytes = await readFile(absolute);
        files.push({
          path: child,
          bytes: bytes.length,
          sha256: releaseHash(bytes),
        });
      }
    }
  }
  await walk();
  const order = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), manifest.files.sort(order));
  for (const pin of [...manifest.implementation, ...manifest.activeGeneration])
    assert.equal(
      releaseHash(await readFile(resolve(repo, pin.path))),
      pin.sha256,
      pin.path,
    );
  const originalPackage = JSON.parse(
    git("show", manifest.sourceBase + ":package.json"),
  );
  const pkg = JSON.parse(await readFile(resolve(repo, "package.json"), "utf8"));
  for (const [name, argv] of Object.entries(originalPackage.scripts))
    assert.equal(pkg.scripts[name], argv, "Original argv: " + name);
  assert.equal(pkg.milestoneLoop.verification.defaultProfile, "readiness");
  assert.equal(pkg.milestoneLoop.verification.contractId, undefined);
  assert.equal(
    git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/"),
    "",
  );
  assert(!existsSync(resolve(repo, "artifacts/orchestrator/state/state.json")));

  const failed = await read("development/focused-1/vitest-report.json");
  assert.equal(failed.numTotalTests, 78);
  assert.equal(failed.numFailedTests, 5);
  assert(!existsSync(resolve(input, "development/focused-1/result.json")));
  const final = await read("candidate-2/focused/vitest-report.json");
  assert.equal(final.numTotalTests, 79);
  assert.equal(final.numPassedTests, 79);
  assert.equal(final.numFailedTests, 0);
  assert.equal(final.numPendingTests, 0);
  assert(
    final.testResults.every((file) =>
      file.assertionResults.every((test) => test.status === "passed"),
    ),
  );
  const execution = await read("candidate-2/focused/execution.json");
  assert.equal(
    execution.identity.gitCommit,
    manifest.supportingCandidates[1].commit,
  );
  assert.equal(
    execution.identity.gitTree,
    manifest.supportingCandidates[1].tree,
  );
  assert.equal(execution.identity.gitStatus, "");
  assert.equal(execution.identity.nodeVersion, "v24.18.0");
  assert.equal(execution.identity.pnpmVersion, "11.15.1");
  assert(!existsSync(resolve(input, "candidate-1/dependencies/result.json")));
  const dependency = await read("candidate-2/dependencies/report.json");
  assert.equal(dependency.status, "PASS");
  assert.equal(dependency.completionEligible, false);
  assert.equal(dependency.nodeVersion, "v24.18.0");
  assert.equal(dependency.pnpmVersion, "11.15.1");
  assert.deepEqual(dependency.independentReference, {
    isolated: true,
    frozen: true,
    offline: true,
    importMethod: "copy",
  });
  assert(
    dependency.packages.length > 100 &&
      dependency.packages.some(
        (pkg) => pkg.present && pkg.name === "tsx" && pkg.version === "4.23.1",
      ),
  );
  assert(dependency.captures.every((capture) => capture.exitCode === 0));
  assert.deepEqual(
    dependency.captures.map((capture) => capture.id),
    [
      "exact-pnpm",
      "store-path",
      "store-integrity",
      "installed-graph",
      "reference-install",
      "reference-graph",
    ],
  );

  const temporary = await realpath(
    await mkdtemp(resolve(output, "reconstructed-release-")),
  );
  const builds: unknown[] = [];
  try {
    for (const [index, candidate] of manifest.supportingCandidates.entries()) {
      assert.equal(candidate.authorityGeneration, "legacy-source.v1");
      for (const pin of manifest.activeGeneration) {
        const bytes = execFileSync(
          "git",
          ["-C", repo, "show", `${candidate.commit}:${pin.path}`],
          { windowsHide: true, timeout: 30_000 },
        );
        assert.equal(
          releaseHash(bytes),
          pin.sha256,
          `Supporting candidate authority: ${pin.path}`,
        );
      }
      assert.equal(
        git("rev-parse", `${candidate.commit}^{tree}`),
        candidate.tree,
      );
      const policy = JSON.parse(
        git("show", `${candidate.commit}:tools/source-release-policy.json`),
      );
      const recreated = await createCommittedReleasePayload(
        repo,
        { commit: candidate.commit, tree: candidate.tree },
        policy,
      );
      const buildRoot = resolve(input, `candidate-${index + 1}/build`),
        report = await read(`candidate-${index + 1}/build/build-report.json`);
      assert.deepEqual(report.source, {
        commit: candidate.commit,
        tree: candidate.tree,
      });
      const archive = await readFile(
        resolve(buildRoot, "source-release/release.tar.gz"),
      );
      assert(
        recreated.archive.equals(archive),
        "Retained release differs from actual committed Git bytes.",
      );
      const workspace = resolve(temporary, String(index)),
        dist = resolve(workspace, "dist");
      await mkdir(dist, { recursive: true });
      await extractReleaseArchive(
        archive,
        recreated.manifest.payload.files,
        recreated.manifest.limits,
        resolve(dist, "payload"),
      );
      for (const file of files.filter((file) =>
        file.path.startsWith(`candidate-${index + 1}/build/source-release/`),
      )) {
        const path = file.path.slice(
            `candidate-${index + 1}/build/source-release/`.length,
          ),
          target = resolve(dist, path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(resolve(input, file.path), target);
      }
      const inspected = await inspectSourceReleaseOutputs({
        report,
        workspace,
      });
      const python = await read(
        `candidate-${index + 1}/tar-inspection/inspection.json`,
      );
      assert.equal(python.status, "PASS");
      assert.equal(python.freshBuild, false);
      assert.equal(python.completionEligible, false);
      assert.deepEqual(python.source, report.source);
      assert.deepEqual(python.files, inspected.manifest.payload.files);
      assert.deepEqual(python.archive, inspected.manifest.archive);
      assert.equal(python.reader, "Python standard-library tarfile");
      builds.push({
        source: report.source,
        archive: inspected.manifest.archive,
        payloadFiles: inspected.manifest.payload.fileCount,
        consumer: inspected.consumer.generated,
        actualBuildRuntime: report.runtime,
        observerPlatform: python.observerPlatform,
      });
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const value = await read(file.path);
    const receipt = await validateCommandReceiptDirectory({
      directory: resolve(input, dirname(file.path)),
      expectedStageId: value.stageId,
      expectedCommandId: value.commandId,
    });
    receipts.push({ path: file.path, sha256: receipt.receiptSha256 });
  }
  assert.equal(receipts.length, manifest.receiptCount);
  const snapshot = await inspectSourceEpochSnapshot({
    repositoryRoot: repo,
    snapshotCommit: manifest.sourceBase,
  });
  assert.equal(snapshot.activationAuthorized, false);
  const result = {
    schemaVersion: "c5-retained-source-release-audit.v1",
    status: "PASS",
    completionEligible: false,
    freshBuild: false,
    sourceActivation: false,
    claimScope: "retained-supporting-build-and-check-evidence",
    observer: await commandIdentity(repo),
    files: files.length,
    receipts,
    builds,
    inertSnapshot: snapshot,
    historicalWp6e: {
      commit: "e590e38c32de2b5baa7423f66bbd8a0230b61839",
      status: "BLOCKED",
    },
  };
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "retained-release-and-checks-audited",
        summary:
          "Rehashed every retained file/receipt, recreated the actual committed portable bytes, checked independently decoded tar inventories and complete original/new regression and dependency observations without granting source readiness.",
      },
    ],
    [{ path: "audit.json", kind: "c5-retained-source-release-audit" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["c5-retained-source-release-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      files: files.length,
      receipts: receipts.length,
      completionEligible: false,
      snapshotStrictAncestor: snapshot.strictAncestor,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
