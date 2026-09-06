import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../evidence.mjs";
import {
  prepareSourceAuthorityTransition,
  inspectSourceAuthorityRequestForReview,
} from "./source-authority-transition.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

const [first, second, outputArg] = process.argv.slice(2);
assert(
  first && second && outputArg && process.argv.length === 5,
  "Usage: source-authority-transition-cli.ts <clean-repository> <exact-snapshot-commit> <fresh-artifacts-output>, or --request <clean-repository> <fresh-artifacts-output>",
);
const requestMode = first === "--request",
  root = requestMode ? second : first;
const controller = resolve(import.meta.dirname, "../../.."),
  output = resolve(outputArg);
assert(!existsSync(output), "Transition evidence output must be absent.");
const outputPath = relative(controller, output).replaceAll("\\", "/");
assert(
  outputPath.startsWith("artifacts/") && !outputPath.split("/").includes(".."),
  "Transition inspection writes only a fresh artifact directory in its controller workspace.",
);
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "source-authority-transition",
  requestMode
    ? "source-request-binding-inspection"
    : "source-transition-inspection",
);
try {
  const observer = await commandIdentity(controller);
  assert.equal(observer.nodeVersion, "v24.18.0");
  assert.equal(observer.pnpmVersion, "11.15.1");
  const projection = requestMode
    ? await inspectSourceAuthorityRequestForReview({ repositoryRoot: root })
    : await prepareSourceAuthorityTransition({
        repositoryRoot: root,
        snapshotCommit: second,
      });
  const { files, ...inspection } = projection;
  const artifacts = [
    {
      path: "transition-inspection.json",
      kind: requestMode
        ? "source-authority-request-binding-inspection"
        : "source-authority-transition-inspection",
    },
  ];
  for (const file of files) {
    const path = "proposed-root/" + file.path;
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await writeFile(resolve(output, path), file.contents, { flag: "wx" });
    artifacts.push({ path, kind: "source-authority-proposed-file" });
  }
  await writeFile(
    resolve(output, "transition-inspection.json"),
    JSON.stringify({ ...inspection, observer }, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeReceipt(
    context,
    [
      {
        id: "exact-source-transition-projection",
        summary:
          "Read-only inspection authenticated the approved strict ancestor and existing legacy ledger, and reproduced the exact twelve-file transition proposal or separately committed request binding. It authenticates neither implementation-audit success nor independent review, and authorizes no publication, readiness, lease or state adoption.",
      },
    ],
    artifacts,
  );
  const receipt = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: [
      requestMode
        ? "source-authority-request-binding-inspection"
        : "source-authority-transition-inspection",
      "source-authority-proposed-file",
    ],
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      source: projection.subject.implementation,
      subjectSha256: projection.subjectSha256,
      outputs: files.length,
      receiptSha256: receipt.receiptSha256,
      publicationAuthorized: false,
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
