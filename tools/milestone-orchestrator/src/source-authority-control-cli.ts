import assert from "node:assert/strict";
import {
  auditSourceAuthorityImplementation,
  reviewSourceAuthorityRequest,
} from "./source-authority-control.js";
const [mode, first, second, ...extra] = process.argv.slice(2);
assert(extra.length === 0, "Unexpected source authority arguments.");
if (mode === "audit") {
  assert(
    first && second,
    "Usage: source-authority-control-cli.ts audit <exact-snapshot-commit> <fresh-artifacts-output>",
  );
  const receipt = await auditSourceAuthorityImplementation({
    snapshotCommit: first,
    artifactDirectory: second,
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      receiptPath: receipt.receiptPath,
      sha256: receipt.receiptSha256,
      completionEligible: false,
    }) + "\n",
  );
} else if (mode === "review") {
  assert(
    first && !second,
    "Usage: source-authority-control-cli.ts review <fresh-artifacts-output>",
  );
  const { receipt } = await reviewSourceAuthorityRequest({
    artifactDirectory: first,
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      receiptPath: receipt.receiptPath,
      sha256: receipt.receiptSha256,
      completionEligible: false,
    }) + "\n",
  );
} else
  throw new Error("Unknown source authority mode; expected audit or review.");
