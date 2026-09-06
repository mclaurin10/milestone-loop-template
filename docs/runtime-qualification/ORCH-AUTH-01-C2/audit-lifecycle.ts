import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  writeJson,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { auditVmLifecycle } from "../../../tools/qualification-vm-lifecycle.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
assert.equal(process.argv.length, 4);
const [input, output] = process.argv.slice(2) as [string, string];
assert(!existsSync(resolve(output)));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(output);
const context = await evidenceContext("orch-auth-01-c2", "vm-evidence-audit");
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const json = async (path: string) =>
    JSON.parse(await readFile(resolve(input, path), "utf8"));
  const result = auditVmLifecycle(
    await json("raw/lifecycle.json"),
    await json("expectations.json"),
    await readFile(resolve(input, "raw/serial.log"), "utf8"),
    await json("raw/qmp.json"),
  );
  const producer = await validateCommandReceiptDirectory({
    directory: resolve(input),
    expectedStageId: "orch-auth-01-c2",
    expectedCommandId: "vm-lifecycle",
  });
  await writeJson(resolve(context.artifactDirectory, "audit.json"), {
    ...result,
    producerReceiptSha256: producer.receiptSha256,
    identity,
  });
  await writeReceipt(
    context,
    [
      {
        id: "received-lifecycle-independently-audited",
        summary:
          "Validated actual lifecycle observations against external expectations and checked producer-owned receipt artifacts.",
      },
    ],
    [{ path: "audit.json", kind: "vm-evidence-audit" }],
  );
  await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
