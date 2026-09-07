import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { SOURCE_AUTHORITY_REQUEST_PATH } from "./authority-publication.mjs";
import { SOURCE_PUBLICATION_EVIDENCE_PREFIX } from "./source-authority-generation.mjs";
import { reviewSourceAuthorityRequest } from "./source-authority-review.js";
import { publishSourceAuthority } from "./source-authority-publication.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

const root = await realpath(resolve(import.meta.dirname, "../../.."));
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
assert(
  (args.length === 2 || args.length === 4) &&
    args[0] === "--request" &&
    args[1] === SOURCE_AUTHORITY_REQUEST_PATH &&
    (args.length === 2 || args[2] === "--artifacts"),
  "Usage: pnpm loop:authority:migrate -- --request .agent/authority-requests/ORCH-AUTH-01/request.json [--artifacts <fresh-contained-artifacts-directory>]",
);
const output = resolve(
  root,
  args[3] ?? "artifacts/source-authority-migrate-" + randomUUID(),
);
const outputRelative = relative(root, output).replaceAll("\\", "/");
assert(
  outputRelative.startsWith("artifacts/") &&
    !outputRelative.split("/").includes("..") &&
    !existsSync(output),
  "Migration requires fresh contained reviewer artifacts; existing observations are preserved.",
);

const review = await reviewSourceAuthorityRequest({
  repositoryRoot: root,
  artifactDirectory: output,
});
const result = await publishSourceAuthority({
  repositoryRoot: root,
  request: {
    commit: review.binding.requestCommit,
    sha256: review.binding.requestSha256,
  },
  reviewPermit: review.permit,
});
const receipt = await validateCommandReceiptDirectory({
  directory: resolve(root, SOURCE_PUBLICATION_EVIDENCE_PREFIX),
  expectedStageId: "source-authority-publication",
  expectedCommandId: "loop:authority:migrate",
  requiredKinds: [
    "source-authority-publication",
    "source-authority-publication-intent",
    "source-authority-publication-events",
    "source-authority-publication-runtime",
  ],
});
process.stdout.write(
  JSON.stringify({
    status: "PASS",
    request: result.result.request,
    resumed: result.result.resumed,
    receiptPath: receipt.receiptPath,
    receiptSha256: receipt.receiptSha256,
    completionEligible: false,
    commitRequired: true,
    sourceStateAdopted: false,
  }) + "\n",
);
