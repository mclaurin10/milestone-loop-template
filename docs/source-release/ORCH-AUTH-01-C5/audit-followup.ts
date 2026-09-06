import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../../tools/evidence.mjs";
import {
  releaseHash,
  inspectReleaseArchive,
} from "../../../tools/source-release-archive.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c5",
  "portable-followup-audit",
);
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/portable-followup/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.schemaVersion, "c5-portable-followup-evidence.v1");
  assert.equal(manifest.authorityGeneration, "legacy-source.v1");
  assert.equal(manifest.completionEligible, false);
  assert.equal(
    releaseHash(
      await readFile(resolve(import.meta.dirname, "portable-audit.ts")),
    ),
    manifest.portableImplementationSha256,
  );
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(input, path))) {
      const child = path ? path + "/" + name : name;
      const info = await lstat(resolve(input, child));
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) await walk(child);
      else {
        assert(info.isFile() && info.nlink === 1);
        const bytes = await readFile(resolve(input, child));
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
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const receipt = await read(file.path);
    assert.equal(receipt.status, "PASS");
    const validated = await validateCommandReceiptDirectory({
      directory: resolve(input, dirname(file.path)),
      expectedStageId: receipt.stageId,
      expectedCommandId: receipt.commandId,
      requiredKinds: receipt.artifacts.map((artifact) => artifact.kind),
    });
    receipts.push({ path: file.path, sha256: validated.receiptSha256 });
  }
  assert.equal(receipts.length, 6);
  const source = { commit: manifest.sourceCommit, tree: manifest.sourceTree };
  const build = await read("c5-postcommit-build/build-report.json");
  assert.equal(build.status, "PASS");
  assert.deepEqual(build.source, source);
  assert.deepEqual(build.runtime, {
    nodeVersion: "v24.18.0",
    pnpmVersion: "11.15.1",
  });
  assert.equal(build.command.exitCode, 0);
  const consumer = await read(
    "c5-postcommit-build/source-release/consumer.json",
  );
  assert.equal(consumer.status, "PASS");
  assert.deepEqual(consumer.source, source);
  assert.equal(consumer.completionEligible, false);
  assert.equal(consumer.completeBuildQualification, false);
  assert.equal(consumer.generated.commitCount, 2);
  assert.equal(consumer.generated.defaultProfile, "bootstrap");
  assert.equal(consumer.generated.sourceContractAbsent, true);
  assert.equal(consumer.generated.controllerStateAbsent, true);
  assert(consumer.captures.every((capture) => capture.exitCode === 0));
  const archive = await readFile(
    resolve(input, "c5-postcommit-build/source-release/release.tar.gz"),
  );
  assert.equal(releaseHash(archive), consumer.releaseArchiveSha256);
  const policy = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../../../tools/source-release-policy.json"),
      "utf8",
    ),
  );
  const release = await read(
    "c5-postcommit-build/source-release/release-manifest.json",
  );
  const archiveFiles = inspectReleaseArchive(
    archive,
    release.payload.files,
    policy,
  );
  assert.equal(archiveFiles.length, 173);
  const dependencies = await read("c5-postcommit-dependencies/report.json");
  const architecture = await read("c5-postcommit-architecture/report.json");
  assert.equal(dependencies.status, "PASS");
  assert.equal(architecture.status, "PASS");
  assert.equal(dependencies.completionEligible, false);
  assert.equal(dependencies.nodeVersion, "v24.18.0");
  assert.equal(dependencies.pnpmVersion, "11.15.1");
  const portable = await read("c5-portable-audit-fixed/portable-audit.json");
  assert.equal(portable.status, "PASS");
  assert.equal(portable.observer.gitCommit, source.commit);
  assert.equal(portable.freshBuild, false);
  assert.equal(portable.childAudit.files, 318);
  assert.equal(portable.childAudit.receipts.length, 29);
  assert.equal(portable.restoredActualObjects.length, 2);
  assert.equal(portable.sourceRefsCreated, false);
  assert.equal(portable.sourceStateCreated, false);
  assert.equal(portable.temporaryObjectsRemoved, true);
  assert.deepEqual(portable.sourceBindingsBefore, portable.sourceBindingsAfter);
  for (const failed of ["c5-postcommit-audit", "c5-portable-corrupt-object"]) {
    assert(!existsSync(resolve(input, failed, "result.json")));
  }
  assert(
    !existsSync(resolve(input, "c5-portable-corrupt-object/original-audit")),
  );
  assert.match(
    await readFile(resolve(input, "postcommit-audit.stderr.log"), "utf8"),
    /fatal: path 'PROJECT_GOAL.md' exists on disk, but not in '6dd6463cf630176783c084dda4537386021045bd'/,
  );
  assert.match(
    await readFile(
      resolve(input, "portable-corrupt-object.stderr.log"),
      "utf8",
    ),
    /7f3bf7ed701d6782c0b739b1e01be83c1f2ebd9c7ead400bb9f9102cfa8d1320/,
  );
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "c5-portable-followup-audit.v1",
        status: "PASS",
        completionEligible: false,
        observer: await commandIdentity(
          resolve(import.meta.dirname, "../../.."),
        ),
        source,
        files: files.length,
        receipts,
        archiveSha256: releaseHash(archive),
        retainedRealPostcommitBuild: true,
        freshBuild: false,
        prototypeObserverWasDirty: portable.observer.gitStatus !== "",
        intendedAuditFailuresRetained: true,
        sourceStateCreated: false,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "retained-postcommit-and-portability-observations",
        summary:
          "Rehashed all retained observations and independently validated six receipts, the actual committed build and consumer, unchanged portable-audit repository bindings, and both genuine failures without PASS receipts.",
      },
    ],
    [{ path: "audit.json", kind: "c5-portable-followup-audit" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["c5-portable-followup-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
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
