import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { OrchestratorState } from "./contracts.js";
import {
  assertExistingContainedPath,
  removeContainedPath,
} from "./path-safety.js";

export interface ManagedEvidenceRun {
  readonly id: string;
  readonly path: string;
  readonly finishedAt: string;
  readonly finishedAtMs: number;
}

export type EvidenceManifestKind =
  "verification-result" | "controller-run-summary";

function safeRunId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

export async function discoverManagedEvidenceRuns(
  artifactRoot: string,
  manifestKind: EvidenceManifestKind = "verification-result",
): Promise<readonly ManagedEvidenceRun[]> {
  await mkdir(artifactRoot, { recursive: true });
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  const runs: ManagedEvidenceRun[] = [];
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !safeRunId(entry.name)
    )
      continue;
    const path = resolve(artifactRoot, entry.name);
    const resultPath = resolve(
      path,
      manifestKind === "verification-result"
        ? "result.json"
        : "run-summary.json",
    );
    try {
      const stat = await lstat(resultPath);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      await assertExistingContainedPath(artifactRoot, path);
      const result = JSON.parse(await readFile(resultPath, "utf8")) as unknown;
      if (
        typeof result !== "object" ||
        result === null ||
        Array.isArray(result)
      )
        continue;
      const record = result as Record<string, unknown>;
      const run =
        manifestKind === "controller-run-summary" &&
        typeof record["run"] === "object" &&
        record["run"] !== null &&
        !Array.isArray(record["run"])
          ? (record["run"] as Record<string, unknown>)
          : record;
      const finishedAt = run["finishedAt"];
      if (
        (manifestKind === "verification-result"
          ? record["runId"]
          : run["id"]) !== entry.name ||
        typeof finishedAt !== "string" ||
        !Number.isFinite(Date.parse(finishedAt))
      )
        continue;
      runs.push({
        id: entry.name,
        path,
        finishedAt,
        finishedAtMs: Date.parse(finishedAt),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return runs.sort(
    (left, right) =>
      right.finishedAtMs - left.finishedAtMs || left.id.localeCompare(right.id),
  );
}

function trackedReferences(
  repositoryRoot: string,
  runIds: readonly string[],
): ReadonlySet<string> {
  const referenced = new Set<string>();
  for (let offset = 0; offset < runIds.length; offset += 40) {
    const batch = runIds.slice(offset, offset + 40);
    if (batch.length === 0) continue;
    const result = spawnSync(
      "git",
      [
        "-C",
        repositoryRoot,
        "grep",
        "-I",
        "-h",
        "-o",
        "-F",
        ...batch.flatMap((id) => ["-e", id]),
        "HEAD",
        "--",
      ],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
    );
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw new Error(
        `Cannot inspect committed evidence references: ${result.error?.message ?? result.stderr.trim()}.`,
      );
    for (const match of result.stdout.split(/\r?\n/))
      if (batch.includes(match)) referenced.add(match);
  }
  return referenced;
}

export interface EvidenceRetentionReport {
  readonly schemaVersion: "1.0.0";
  readonly artifactRoot: string;
  readonly manifestKind: EvidenceManifestKind;
  readonly keepRecentRuns: number;
  readonly observedRunIds: readonly string[];
  readonly legacyRunIds: readonly string[];
  readonly citedRunIds: readonly string[];
  readonly recentRunIds: readonly string[];
  readonly eligibleRunIds: readonly string[];
  readonly deletedRunIds: readonly string[];
  readonly suspended: boolean;
  readonly suspensionReasons: readonly (
    | "candidate-controller-mismatch"
    | "active-reconciliation"
    | "unresolved-escalated-history"
    | "unknown-reference"
  )[];
  readonly generatedAt: string;
}

export interface DestructiveRetentionSafety {
  readonly candidateCommit: string;
  readonly activeReconciliation: boolean;
  readonly inventoryHasUnknownReferences: boolean;
}

export function destructiveRetentionSuspensionReasons(input: {
  readonly durableState: OrchestratorState;
  readonly safety: DestructiveRetentionSafety;
}): EvidenceRetentionReport["suspensionReasons"] {
  const reasons: EvidenceRetentionReport["suspensionReasons"][number][] = [];
  if (
    input.safety.candidateCommit !==
    input.durableState.repository.verifiedCommit
  )
    reasons.push("candidate-controller-mismatch");
  if (input.safety.activeReconciliation) reasons.push("active-reconciliation");
  if (input.durableState.run.status === "escalated")
    reasons.push("unresolved-escalated-history");
  if (input.safety.inventoryHasUnknownReferences)
    reasons.push("unknown-reference");
  return reasons;
}

export async function pruneManagedEvidenceRuns(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly keepRecentRuns: number;
  readonly legacyRunIds: readonly string[];
  readonly durableState: OrchestratorState;
  readonly safety: DestructiveRetentionSafety;
  readonly now: string;
  readonly manifestKind?: EvidenceManifestKind;
}): Promise<EvidenceRetentionReport> {
  if (!Number.isSafeInteger(input.keepRecentRuns) || input.keepRecentRuns < 0)
    throw new Error("Evidence retention count must be a nonnegative integer.");
  const manifestKind = input.manifestKind ?? "verification-result";
  const runs = await discoverManagedEvidenceRuns(
    input.artifactRoot,
    manifestKind,
  );
  const observedIds = runs.map((run) => run.id);
  const legacy = new Set(
    input.legacyRunIds.filter((id) => observedIds.includes(id)),
  );
  const durable = JSON.stringify(input.durableState);
  const cited = new Set([
    ...trackedReferences(input.repositoryRoot, observedIds),
    ...observedIds.filter((id) => durable.includes(id)),
  ]);
  const eligible = runs.filter((run) => !legacy.has(run.id));
  const recent = new Set(
    eligible.slice(0, input.keepRecentRuns).map((run) => run.id),
  );
  const suspensionReasons = destructiveRetentionSuspensionReasons(input);
  const suspended = suspensionReasons.length > 0;
  const eligibleRunIds = eligible
    .filter((run) => !recent.has(run.id) && !cited.has(run.id))
    .map((run) => run.id);
  const deleted: string[] = [];
  for (const run of suspended ? [] : eligible) {
    if (recent.has(run.id) || cited.has(run.id)) continue;
    await removeContainedPath(input.artifactRoot, run.path);
    deleted.push(run.id);
  }
  return {
    schemaVersion: "1.0.0",
    artifactRoot: resolve(input.artifactRoot),
    manifestKind,
    keepRecentRuns: input.keepRecentRuns,
    observedRunIds: observedIds,
    legacyRunIds: [...legacy].sort(),
    citedRunIds: [...cited].sort(),
    recentRunIds: [...recent],
    eligibleRunIds,
    deletedRunIds: deleted,
    suspended,
    suspensionReasons,
    generatedAt: input.now,
  };
}
