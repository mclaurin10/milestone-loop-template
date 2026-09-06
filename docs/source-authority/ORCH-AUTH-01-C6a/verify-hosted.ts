import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(
    repo,
    "artifacts/wp6e-continuation-20260906/hosted-discovery-repair-artifacts",
  );
const context = await evidenceContext(
  "orch-auth-01-c6a",
  "hosted-child-receipts",
);
try {
  const artifacts = JSON.parse(
    await readFile(resolve(input, "metadata-final.json"), "utf8"),
  );
  assert.equal(artifacts.length, 5);
  const receipts = [];
  async function walk(path: string) {
    const absolute = resolve(input, path),
      info = await lstat(absolute);
    assert(!info.isSymbolicLink());
    if (info.isDirectory()) {
      for (const name of await readdir(absolute)) await walk(path + "/" + name);
    } else if (path.endsWith("/result.json")) {
      const value = JSON.parse(await readFile(absolute, "utf8"));
      if (value.schemaVersion !== "1.0.0" || typeof value.stageId !== "string")
        return;
      const checked = await validateCommandReceiptDirectory({
        directory: resolve(absolute, ".."),
        expectedStageId: value.stageId,
        expectedCommandId: value.commandId,
      });
      receipts.push({ path, sha256: checked.receiptSha256 });
    }
  }
  for (const artifact of artifacts) {
    assert.equal(artifact.workflow_run.id, 34015911019);
    assert.equal(
      artifact.workflow_run.head_sha,
      "42871f66ae1711821703f16bcb97cca18b5ccf3a",
    );
    const bytes = await readFile(resolve(input, `${artifact.id}.zip`));
    assert.equal(bytes.length, artifact.size_in_bytes);
    assert.equal(
      "sha256:" + createHash("sha256").update(bytes).digest("hex"),
      artifact.digest,
    );
    await walk(`extracted-${artifact.id}`);
  }
  assert.equal(receipts.length, 43);
  await writeFile(
    resolve(context.artifactDirectory, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "hosted-child-receipt-audit.v1",
        status: "PASS",
        completionEligible: false,
        observer: await commandIdentity(repo),
        hostedCommit: "42871f66ae1711821703f16bcb97cca18b5ccf3a",
        workflowRunId: 34015911019,
        artifacts,
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
        id: "hosted-artifacts-and-child-receipts",
        summary:
          "Rehashed all five exact-commit provider archives and independently validated all 43 command-owned receipts and their declared artifacts. Aggregate bootstrap and OCI interpretations remain separately audited.",
      },
    ],
    [{ path: "audit.json", kind: "hosted-child-receipt-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      archives: artifacts.length,
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
