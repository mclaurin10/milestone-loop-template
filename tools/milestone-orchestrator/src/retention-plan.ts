import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ArtifactInventory } from "./artifact-inventory.js";
import { assertArtifactRoot } from "./path-safety.js";
import { atomicWriteJson } from "./state-store.js";

export const RETENTION_SUSPENSION_REASONS = [
  "candidate-controller-mismatch",
  "active-reconciliation",
  "unresolved-escalated-history",
  "unknown-reference",
  "path-safety-defect",
] as const;

export type RetentionSuspensionReason =
  (typeof RETENTION_SUSPENSION_REASONS)[number];

export interface RetentionDryRun {
  readonly schemaVersion: "1.0.0";
  readonly inventoryId: string;
  readonly mode: "dry-run-only";
  readonly applySupported: false;
  readonly historicalManualDeletionDeferred: true;
  readonly candidateCommit: string;
  readonly controllerVerifiedCommit: string | null;
  readonly suspended: boolean;
  readonly suspensionReasons: readonly RetentionSuspensionReason[];
  readonly proposedActions: readonly {
    readonly identity: string;
    readonly path: string;
    readonly action: "eligible-future-managed-deletion";
    readonly authorized: false;
    readonly reason: "uncited-nonrecent-managed-evidence";
  }[];
  readonly preservedEntryCount: number;
  readonly generatedAt: string;
}

export function retentionSuspensionReasons(
  inventory: ArtifactInventory,
): readonly RetentionSuspensionReason[] {
  const reasons: RetentionSuspensionReason[] = [];
  if (
    inventory.controller.verifiedCommit === null ||
    inventory.controller.verifiedCommit !== inventory.candidate.gitCommit
  )
    reasons.push("candidate-controller-mismatch");
  if (inventory.activeReconciliation !== null)
    reasons.push("active-reconciliation");
  if (
    inventory.controller.runStatus === "escalated" &&
    inventory.controller.activeMilestoneId !== null
  )
    reasons.push("unresolved-escalated-history");
  if (inventory.summary.unknownProtectedCount > 0)
    reasons.push("unknown-reference");
  if (
    inventory.entries.some(
      (entry) => entry.pathSafety.disposition !== "contained",
    )
  )
    reasons.push("path-safety-defect");
  return reasons;
}

export function createRetentionDryRun(
  inventory: ArtifactInventory,
  generatedAt: string,
): RetentionDryRun {
  const suspensionReasons = retentionSuspensionReasons(inventory);
  const proposedActions = inventory.entries
    .filter((entry) => entry.classification === "eligible-future-dry-run")
    .map((entry) => ({
      identity: entry.identity,
      path: entry.path,
      action: "eligible-future-managed-deletion" as const,
      authorized: false as const,
      reason: "uncited-nonrecent-managed-evidence" as const,
    }))
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.identity.localeCompare(right.identity),
    );
  return {
    schemaVersion: "1.0.0",
    inventoryId: inventory.inventoryId,
    mode: "dry-run-only",
    applySupported: false,
    historicalManualDeletionDeferred: true,
    candidateCommit: inventory.candidate.gitCommit,
    controllerVerifiedCommit: inventory.controller.verifiedCommit,
    suspended: suspensionReasons.length > 0,
    suspensionReasons,
    proposedActions,
    preservedEntryCount: inventory.entries.length,
    generatedAt,
  };
}

export function assertRetentionDryRun(value: unknown): RetentionDryRun {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Retention dry-run must be an object.");
  const record = value as Record<string, unknown>;
  const exactKeys = [
    "schemaVersion",
    "inventoryId",
    "mode",
    "applySupported",
    "historicalManualDeletionDeferred",
    "candidateCommit",
    "controllerVerifiedCommit",
    "suspended",
    "suspensionReasons",
    "proposedActions",
    "preservedEntryCount",
    "generatedAt",
  ];
  if (
    Object.keys(record).length !== exactKeys.length ||
    exactKeys.some((key) => !(key in record)) ||
    record["schemaVersion"] !== "1.0.0" ||
    record["mode"] !== "dry-run-only" ||
    record["applySupported"] !== false ||
    record["historicalManualDeletionDeferred"] !== true ||
    typeof record["suspended"] !== "boolean" ||
    !Array.isArray(record["suspensionReasons"]) ||
    record["suspensionReasons"].some(
      (reason) =>
        !RETENTION_SUSPENSION_REASONS.includes(
          reason as RetentionSuspensionReason,
        ),
    ) ||
    !Array.isArray(record["proposedActions"]) ||
    typeof record["generatedAt"] !== "string" ||
    !Number.isFinite(Date.parse(record["generatedAt"]))
  )
    throw new Error("Retention dry-run schema is invalid.");
  return value as RetentionDryRun;
}

async function latestInventoryDirectory(
  repositoryRoot: string,
): Promise<string> {
  const inventoryRoot = resolve(repositoryRoot, "artifacts", "inventory");
  await assertArtifactRoot(inventoryRoot);
  const entries = await readdir(inventoryRoot, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(entry.name)
    )
      continue;
    const directory = resolve(inventoryRoot, entry.name);
    const manifestPath = resolve(directory, "inventory.json");
    try {
      const metadata = await lstat(manifestPath);
      if (metadata.isFile() && !metadata.isSymbolicLink())
        candidates.push(directory);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      )
        throw error;
    }
  }
  candidates.sort((left, right) => right.localeCompare(left));
  const latest = candidates[0];
  if (!latest)
    throw new Error(
      "No artifact inventory exists; run pnpm artifacts:inventory first.",
    );
  return latest;
}

async function main(): Promise<void> {
  if (process.argv.length > 2)
    throw new Error(
      "Usage: pnpm artifacts:retention:dry-run (no apply option exists).",
    );
  const repositoryRoot = resolve(
    fileURLToPath(new URL("../../..", import.meta.url)),
  );
  const directory = await latestInventoryDirectory(repositoryRoot);
  const { assertArtifactInventory, inventoryCandidate } =
    await import("./artifact-inventory.js");
  const inventory = assertArtifactInventory(
    JSON.parse(
      await readFile(resolve(directory, "inventory.json"), "utf8"),
    ) as unknown,
  );
  const current = inventoryCandidate(repositoryRoot);
  if (
    current.gitCommit !== inventory.candidate.gitCommit ||
    current.gitTree !== inventory.candidate.gitTree ||
    current.workingTreeDirty !== inventory.candidate.workingTreeDirty
  )
    throw new Error(
      "Latest artifact inventory does not match the current candidate; generate a fresh inventory first.",
    );
  const report = createRetentionDryRun(inventory, new Date().toISOString());
  await atomicWriteJson(resolve(directory, "retention-dry-run.json"), report);
  process.stdout.write(
    `Retention dry-run: ${relative(repositoryRoot, resolve(directory, "retention-dry-run.json")).replaceAll("\\", "/")}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
