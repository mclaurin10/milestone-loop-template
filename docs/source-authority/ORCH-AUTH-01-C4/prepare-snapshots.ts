import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  validateKnownSourceApproval,
  SOURCE_APPROVAL_PATH,
  SOURCE_SNAPSHOT_PREFIX,
  LEGACY_SNAPSHOT_PREFIX,
  LEGACY_AUTHORITY_BASE,
  SOURCE_SNAPSHOT_ROOT_FILES,
  LEGACY_SNAPSHOT_ROOT_FILES,
} from "../../../tools/milestone-orchestrator/src/source-epoch-snapshot.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
const [outputArg] = process.argv.slice(2);
assert(outputArg && process.argv.length === 3);
const repo = resolve(import.meta.dirname, "../../.."),
  output = resolve(outputArg);
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "source-epoch-preparation",
  "prepare-inert-files",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
try {
  const approval = validateKnownSourceApproval(
    await readFile(resolve(repo, SOURCE_APPROVAL_PATH)),
  );
  const before = await Promise.all(
    SOURCE_SNAPSHOT_ROOT_FILES.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(repo, path))),
    })),
  );
  for (const prefix of [SOURCE_SNAPSHOT_PREFIX, LEGACY_SNAPSHOT_PREFIX])
    assert(
      !existsSync(resolve(repo, prefix)),
      "Do not replace existing inert authority snapshots.",
    );
  const files = [];
  for (const [epoch, prefix, paths] of [
    ["source", SOURCE_SNAPSHOT_PREFIX, SOURCE_SNAPSHOT_ROOT_FILES],
    ["legacy", LEGACY_SNAPSHOT_PREFIX, LEGACY_SNAPSHOT_ROOT_FILES],
  ] as const) {
    for (const path of paths) {
      const from =
        epoch === "source"
          ? "HEAD:docs/proposals/ORCH-AUTH-01-r2/proposed/" + path
          : LEGACY_AUTHORITY_BASE + ":" + path;
      const bytes = execFileSync("git", ["-C", repo, "show", from], {
        windowsHide: true,
      });
      if (epoch === "source") {
        const approved = approval.normativeFiles.find(
          (file) => file.path === "proposed/" + path,
        )!;
        assert.equal(bytes.length, approved.bytes);
        assert.equal(hash(bytes), approved.sha256);
      }
      const destination = resolve(repo, prefix, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });
      assert((await readFile(destination)).equals(bytes));
      files.push({
        epoch,
        path: prefix + "/" + path,
        origin: from,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }
  }
  const after = await Promise.all(
    SOURCE_SNAPSHOT_ROOT_FILES.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(repo, path))),
    })),
  );
  assert.deepEqual(after, before);
  await writeFile(
    resolve(output, "preparation-report.json"),
    JSON.stringify(
      {
        status: "PREPARED_UNCOMMITTED",
        files,
        activeAuthorities: after,
        activationAuthorized: false,
        completionEligible: false,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "EXACT-INERT-COPIES",
        summary:
          "Prepared exact approved source and original legacy snapshot files from committed Git objects, re-read their bytes, and observed live authority hashes unchanged. No snapshot commit or activation is asserted.",
      },
    ],
    [{ path: "preparation-report.json", kind: "inert-snapshot-preparation" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  console.log(
    JSON.stringify({
      status: "PREPARED_UNCOMMITTED",
      files: files.length,
      activationAuthorized: false,
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
