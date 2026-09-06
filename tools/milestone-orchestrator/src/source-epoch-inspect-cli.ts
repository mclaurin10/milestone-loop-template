import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../evidence.mjs";
import { inspectSourceEpochSnapshot } from "./source-epoch-snapshot.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

const [root, commit, outputArg] = process.argv.slice(2);
assert(
  root && commit && outputArg && process.argv.length === 5,
  "Usage: source-epoch-inspect-cli.ts <repository> <exact-snapshot-commit> <fresh-output>",
);
const output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "source-epoch-inspection",
  "inert-source-snapshot",
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const inspection = await inspectSourceEpochSnapshot({
    repositoryRoot: root,
    snapshotCommit: commit,
  });
  await writeFile(
    resolve(output, "snapshot-inspection.json"),
    JSON.stringify(inspection, null, 2) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "INERT-APPROVED-SNAPSHOT",
        summary:
          "Exact real Git snapshot objects match the settled control-plane approval and original legacy authority. Inspection is read-only, completion-ineligible and authorizes no activation or state adoption.",
      },
    ],
    [
      {
        path: "snapshot-inspection.json",
        kind: "source-epoch-snapshot-inspection",
      },
    ],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(JSON.stringify(inspection) + "\n");
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
