import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
export const SOURCE_CONTRACT_ID = "milestone-loop-orchestrator-source.v1";
export const SOURCE_EPOCH = "orch-template.v1";
export const AUTHORITY_MIGRATION_PENDING_PATH =
  ".agent/.source-authority-migration.pending.json";
export const SOURCE_AUTHORITY_PUBLICATION_PATH =
  ".agent/completed/source-authority-epochs.json";
export const SOURCE_AUTHORITY_REQUEST_PATH =
  ".agent/authority-requests/ORCH-AUTH-01/request.json";
/** Presence is the fence. A malformed file, directory, or dangling link is not
 * evidence that publication finished. This function never follows the intent. */
export async function assertNoPendingAuthorityMigration(root) {
  try {
    await lstat(resolve(root, AUTHORITY_MIGRATION_PENDING_PATH));
  } catch (error) {
    if (error.code === "ENOENT") {
      // A linked .agent parent (including a dangling junction) must not hide
      // an intent from readers or redirect a later publisher.
      try {
        const parent = await lstat(resolve(root, ".agent"));
        if (!parent.isDirectory() || parent.isSymbolicLink())
          throw new Error(
            "Authority publication directory is not a regular contained directory.",
            { cause: error },
          );
      } catch (parentError) {
        if (parentError.code !== "ENOENT") throw parentError;
      }
      return;
    }
    throw error;
  }
  throw new Error(
    "Source authority migration publication is pending; resume the exact recorded request before using authority, verification, planning, or state.",
  );
}
async function optionalJson(root, path) {
  const canonicalRoot = await realpath(root),
    absolute = resolve(canonicalRoot, path);
  try {
    const info = await lstat(absolute);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (await realpath(absolute)) !== absolute
    )
      throw new Error(
        `Authority scope input is not a canonical regular file: ${path}.`,
      );
    const value = JSON.parse(await readFile(absolute, "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`Authority scope input schema is invalid: ${path}.`);
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}
/** Classify explicit scope signals; an inert snapshot or approval is no signal.
 * Legacy projects may have their own commissioning IDs and lack source files. */
export function classifyAuthorityScope(input) {
  if (
    input.packageContractId !== undefined &&
    input.packageContractId !== SOURCE_CONTRACT_ID
  )
    throw new Error(
      "Unknown verification contract scope; a worker cannot select a contract.",
    );
  if (
    input.lockSchemaVersion !== undefined &&
    input.lockSchemaVersion !== "1.0.0" &&
    input.lockSchemaVersion !== "2.0.0"
  )
    throw new Error(
      "Immutable contract lock schema is invalid or unsupported.",
    );
  if (
    input.lockAuthorityEpoch !== undefined &&
    input.lockAuthorityEpoch !== SOURCE_EPOCH
  )
    throw new Error("Unknown authority epoch.");
  const sourceSignals = [
    input.packageContractId === SOURCE_CONTRACT_ID,
    input.lockSchemaVersion === "2.0.0",
    input.lockAuthorityEpoch === SOURCE_EPOCH,
    input.commissioningId === SOURCE_CONTRACT_ID,
  ];
  if (!sourceSignals.some(Boolean) && !input.publicationPresent)
    return "legacy";
  if (!sourceSignals.every(Boolean))
    throw new Error(
      "Mixed source/legacy authority, contract, or commissioning generation.",
    );
  return "source";
}
/** Normal consumers cannot adopt staged source bytes. The next generation
 * reader must prove the committed request/review/publication before replacing
 * this refusal; no caller override or candidate-authored success flag exists. */
export async function assertActiveAuthorityPublication(root) {
  await assertNoPendingAuthorityMigration(root);
  const [pkg, lock, manifest, publication] = await Promise.all([
    optionalJson(root, "package.json"),
    optionalJson(root, "evals/immutable-contract-lock.json"),
    optionalJson(root, ".agent/verification-manifest.json"),
    optionalJson(root, SOURCE_AUTHORITY_PUBLICATION_PATH),
  ]);
  const verification = record(record(pkg?.["milestoneLoop"])?.["verification"]);
  const scope = classifyAuthorityScope({
    packageContractId: verification?.["contractId"],
    lockSchemaVersion: lock?.["schemaVersion"],
    lockAuthorityEpoch: lock?.["authorityEpoch"],
    commissioningId: record(manifest?.["commissioning"])?.["id"],
    publicationPresent: publication !== null,
  });
  await assertNoPendingAuthorityMigration(root);
  if (scope === "source")
    throw new Error(
      "Source authority is not activated: complete committed request/review/publication validation is required; approval or matching staged bytes cannot activate it.",
    );
  return "legacy";
}
