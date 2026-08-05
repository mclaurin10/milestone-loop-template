import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { resolve } from "node:path";

import type { OrchestratorConfig, OrchestratorState } from "./contracts.js";
import { readArtifactInventoryRetentionGuard } from "./artifact-inventory.js";
import {
  assertExistingContainedPath,
  removeContainedPath,
} from "./path-safety.js";
import { atomicWriteJson } from "./state-store.js";

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

export interface PlannedEvidenceDeletion {
  readonly id: string;
  readonly path: string;
  readonly finishedAt: string;
}

export interface EvidenceRetentionReport {
  readonly schemaVersion: "1.1.0";
  readonly mode: "plan";
  readonly artifactRoot: string;
  readonly artifactRootRealpath: string;
  readonly manifestKind: EvidenceManifestKind;
  readonly keepRecentRuns: number;
  readonly observedRunIds: readonly string[];
  readonly legacyRunIds: readonly string[];
  readonly citedRunIds: readonly string[];
  readonly recentRunIds: readonly string[];
  readonly eligibleRunIds: readonly string[];
  readonly plannedDeletions: readonly PlannedEvidenceDeletion[];
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

// Planning never deletes: it reports what a hash-approved
// applyEvidenceRetentionPlan run would remove.
export async function planManagedEvidenceRuns(input: {
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
  const eligibleRuns = eligible.filter(
    (run) => !recent.has(run.id) && !cited.has(run.id),
  );
  return {
    schemaVersion: "1.1.0",
    mode: "plan",
    artifactRoot: resolve(input.artifactRoot),
    artifactRootRealpath: await realpath(resolve(input.artifactRoot)),
    manifestKind,
    keepRecentRuns: input.keepRecentRuns,
    observedRunIds: observedIds,
    legacyRunIds: [...legacy].sort(),
    citedRunIds: [...cited].sort(),
    recentRunIds: [...recent],
    eligibleRunIds: eligibleRuns.map((run) => run.id),
    plannedDeletions: suspended
      ? []
      : eligibleRuns.map((run) => ({
          id: run.id,
          path: run.path,
          finishedAt: run.finishedAt,
        })),
    suspended,
    suspensionReasons,
    generatedAt: input.now,
  };
}

export interface RetentionCandidate {
  readonly commit: string;
  readonly tree: string;
  readonly dirty: boolean;
}

export function captureRetentionCandidate(
  repositoryRoot: string,
): RetentionCandidate {
  const output = (args: readonly string[]): string => {
    const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `Cannot capture the retention candidate identity (git ${args.join(" ")}): ${result.error?.message ?? result.stderr.trim()}.`,
      );
    return result.stdout;
  };
  const commit = output(["rev-parse", "HEAD"]).trim();
  const tree = output(["rev-parse", "HEAD^{tree}"]).trim();
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^[0-9a-f]{40}$/.test(tree))
    throw new Error("Retention candidate identity is malformed.");
  const status = output(["status", "--porcelain=v1", "--untracked-files=all"]);
  return { commit, tree, dirty: status.trim().length > 0 };
}

export interface EvidenceRetentionPlan {
  readonly schemaVersion: "1.1.0";
  readonly mode: "plan";
  readonly generatedAt: string;
  readonly candidate: RetentionCandidate;
  readonly controller: {
    readonly verifiedCommit: string;
    readonly runStatus: OrchestratorState["run"]["status"];
    readonly runId: string | null;
  };
  readonly config: { readonly keepRecentRuns: number };
  readonly verificationRuns: EvidenceRetentionReport;
  readonly controllerRuns: EvidenceRetentionReport;
}

// One plan shape for every producer: controller startup (written as the
// run's evidence-retention.json), the retention-plan CLI, and the fresh
// re-plan retention-apply compares against.
export async function buildEvidenceRetentionPlan(input: {
  readonly repositoryRoot: string;
  readonly config: OrchestratorConfig;
  readonly state: OrchestratorState;
  readonly now: string;
  readonly planner?: typeof planManagedEvidenceRuns;
}): Promise<EvidenceRetentionPlan> {
  const planner = input.planner ?? planManagedEvidenceRuns;
  const candidate = captureRetentionCandidate(input.repositoryRoot);
  const inventoryGuard = await readArtifactInventoryRetentionGuard(
    input.repositoryRoot,
    candidate.commit,
  );
  const common = {
    repositoryRoot: input.repositoryRoot,
    keepRecentRuns: input.config.evidenceRetention.keepRecentRuns,
    legacyRunIds: input.state.evidenceRetention.legacyRunIds,
    durableState: input.state,
    safety: {
      candidateCommit: candidate.commit,
      activeReconciliation: inventoryGuard.activeReconciliation,
      inventoryHasUnknownReferences:
        inventoryGuard.inventoryHasUnknownReferences,
    },
    now: input.now,
  } as const;
  const [verificationRuns, controllerRuns] = await Promise.all([
    planner({
      ...common,
      artifactRoot: resolve(
        input.repositoryRoot,
        input.config.evidenceRetention.artifactRoot,
      ),
    }),
    planner({
      ...common,
      artifactRoot: resolve(input.repositoryRoot, input.config.artifactRoot),
      manifestKind: "controller-run-summary",
    }),
  ]);
  return {
    schemaVersion: "1.1.0",
    mode: "plan",
    generatedAt: input.now,
    candidate,
    controller: {
      verifiedCommit: input.state.repository.verifiedCommit,
      runStatus: input.state.run.status,
      runId: input.state.run.id,
    },
    config: { keepRecentRuns: input.config.evidenceRetention.keepRecentRuns },
    verificationRuns,
    controllerRuns,
  };
}

function validPlannedDeletion(
  value: unknown,
): value is PlannedEvidenceDeletion {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)["id"] === "string" &&
    typeof (value as Record<string, unknown>)["path"] === "string" &&
    typeof (value as Record<string, unknown>)["finishedAt"] === "string"
  );
}

function validPlanSection(value: unknown): value is EvidenceRetentionReport {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    record["schemaVersion"] === "1.1.0" &&
    record["mode"] === "plan" &&
    typeof record["artifactRoot"] === "string" &&
    typeof record["artifactRootRealpath"] === "string" &&
    typeof record["suspended"] === "boolean" &&
    Array.isArray(record["observedRunIds"]) &&
    Array.isArray(record["citedRunIds"]) &&
    Array.isArray(record["recentRunIds"]) &&
    Array.isArray(record["suspensionReasons"]) &&
    Array.isArray(record["plannedDeletions"]) &&
    record["plannedDeletions"].every(validPlannedDeletion)
  );
}

export function assertEvidenceRetentionPlan(
  value: unknown,
): EvidenceRetentionPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Retention plan is not an object.");
  const record = value as Record<string, unknown>;
  const candidate = record["candidate"] as Record<string, unknown> | null;
  const config = record["config"] as Record<string, unknown> | null;
  if (
    record["schemaVersion"] !== "1.1.0" ||
    record["mode"] !== "plan" ||
    typeof record["generatedAt"] !== "string" ||
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate["commit"] !== "string" ||
    typeof candidate["tree"] !== "string" ||
    typeof candidate["dirty"] !== "boolean" ||
    typeof config !== "object" ||
    config === null ||
    !Number.isSafeInteger(config["keepRecentRuns"]) ||
    !validPlanSection(record["verificationRuns"]) ||
    !validPlanSection(record["controllerRuns"])
  )
    throw new Error(
      "Retention plan is not a valid mode:plan 1.1.0 envelope; regenerate it with loop:retention:plan.",
    );
  return value as EvidenceRetentionPlan;
}

type RetentionRootName = "verification" | "controller";

interface RetentionJournalEntry {
  readonly event: "deleting" | "deleted";
  readonly root: RetentionRootName;
  readonly runId: string;
  readonly path: string;
  readonly at: string;
}

async function readRetentionJournal(
  journalPath: string,
): Promise<readonly RetentionJournalEntry[]> {
  let contents: string;
  try {
    contents = await readFile(journalPath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return [];
    throw error;
  }
  const lines = contents.split(/\r?\n/).filter((line) => line.trim() !== "");
  const entries: RetentionJournalEntry[] = [];
  for (const [index, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (
        (parsed["event"] !== "deleting" && parsed["event"] !== "deleted") ||
        (parsed["root"] !== "verification" &&
          parsed["root"] !== "controller") ||
        typeof parsed["runId"] !== "string" ||
        typeof parsed["path"] !== "string" ||
        typeof parsed["at"] !== "string"
      )
        throw new Error("Journal entry shape is invalid.");
      entries.push(parsed as unknown as RetentionJournalEntry);
    } catch (error) {
      // Only a torn final line from an interrupted append is tolerated.
      if (index === lines.length - 1) break;
      throw new Error(
        `Retention apply journal is corrupted at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  return entries;
}

export interface EvidenceRetentionApplyResult {
  readonly schemaVersion: "1.0.0";
  readonly planPath: string;
  readonly planSha256: string;
  readonly applyDirectory: string;
  readonly journalPath: string;
  readonly deleted: readonly {
    readonly root: RetentionRootName;
    readonly id: string;
    readonly path: string;
  }[];
  readonly skippedJournaledRunIds: readonly string[];
  readonly finishedAt: string;
}

// Deletion happens only here: the operator approves an exact plan file by
// hash, every fence re-checks the world it described, and any divergence
// refuses the whole plan before anything is removed.
export async function applyEvidenceRetentionPlan(input: {
  readonly repositoryRoot: string;
  readonly planPath: string;
  readonly expectedSha256: string;
  readonly config: OrchestratorConfig;
  readonly state: OrchestratorState;
  readonly now: string;
  readonly planner?: typeof planManagedEvidenceRuns;
}): Promise<EvidenceRetentionApplyResult> {
  const planBytes = await readFile(input.planPath);
  const planSha256 = createHash("sha256").update(planBytes).digest("hex");
  const expected = input.expectedSha256.toLowerCase();
  if (planSha256 !== expected)
    throw new Error(
      `Retention plan hash mismatch: the approved token ${expected} does not match the plan file (${planSha256}); nothing was deleted.`,
    );
  const plan = assertEvidenceRetentionPlan(
    JSON.parse(planBytes.toString("utf8")),
  );
  if (input.state.reconciliation.active !== null)
    throw new Error(
      "Retention apply refuses while a controller reconciliation is active; nothing was deleted.",
    );
  if (input.state.run.status === "running")
    throw new Error(
      "Retention apply refuses while a controller run is active; nothing was deleted.",
    );
  if (
    input.config.evidenceRetention.keepRecentRuns !== plan.config.keepRecentRuns
  )
    throw new Error(
      `Retention apply refused: config-changed (keepRecentRuns is now ${input.config.evidenceRetention.keepRecentRuns}, the plan was approved at ${plan.config.keepRecentRuns}); re-plan and re-approve.`,
    );
  const candidate = captureRetentionCandidate(input.repositoryRoot);
  if (
    candidate.commit !== plan.candidate.commit ||
    candidate.tree !== plan.candidate.tree ||
    candidate.dirty !== plan.candidate.dirty
  )
    throw new Error(
      "Retention apply refused: the repository candidate advanced since the plan was approved; re-plan and re-approve.",
    );
  const fresh = await buildEvidenceRetentionPlan({
    repositoryRoot: input.repositoryRoot,
    config: input.config,
    state: input.state,
    now: input.now,
    ...(input.planner ? { planner: input.planner } : {}),
  });
  const applyDirectory = resolve(
    input.repositoryRoot,
    "artifacts",
    "orchestrator",
    "retention",
    "apply",
    expected.slice(0, 16),
  );
  const journalPath = resolve(applyDirectory, "journal.jsonl");
  const journal = await readRetentionJournal(journalPath);
  const journaled = (event: RetentionJournalEntry["event"]): Set<string> =>
    new Set(
      journal
        .filter((entry) => entry.event === event)
        .map((entry) => `${entry.root}:${entry.runId}`),
    );
  const journaledDeleting = journaled("deleting");
  const journaledDeleted = journaled("deleted");

  const sections: readonly {
    readonly root: RetentionRootName;
    readonly planned: EvidenceRetentionReport;
    readonly current: EvidenceRetentionReport;
    readonly containmentRoot: string;
  }[] = [
    {
      root: "verification",
      planned: plan.verificationRuns,
      current: fresh.verificationRuns,
      containmentRoot: resolve(
        input.repositoryRoot,
        input.config.evidenceRetention.artifactRoot,
      ),
    },
    {
      root: "controller",
      planned: plan.controllerRuns,
      current: fresh.controllerRuns,
      containmentRoot: resolve(input.repositoryRoot, input.config.artifactRoot),
    },
  ];

  const refusals: string[] = [];
  const skipped: string[] = [];
  const deletions: {
    readonly root: RetentionRootName;
    readonly containmentRoot: string;
    readonly planned: PlannedEvidenceDeletion;
  }[] = [];
  for (const section of sections) {
    if (
      section.current.artifactRootRealpath !==
      section.planned.artifactRootRealpath
    )
      refusals.push(
        `${section.root} artifact root moved (${section.planned.artifactRootRealpath} -> ${section.current.artifactRootRealpath})`,
      );
    if (section.current.suspended)
      refusals.push(
        `suspension-appeared on the ${section.root} root: ${section.current.suspensionReasons.join(", ")}`,
      );
  }
  if (refusals.length === 0)
    for (const section of sections) {
      for (const planned of section.planned.plannedDeletions) {
        const key = `${section.root}:${planned.id}`;
        if (journaledDeleted.has(key)) {
          skipped.push(key);
          continue;
        }
        if (section.current.citedRunIds.includes(planned.id)) {
          refusals.push(`run-became-cited: ${key}`);
          continue;
        }
        if (section.current.recentRunIds.includes(planned.id)) {
          refusals.push(`run-became-recent: ${key}`);
          continue;
        }
        if (!section.current.observedRunIds.includes(planned.id)) {
          if (journaledDeleting.has(key)) {
            // An interrupted deletion is resumed, not refused.
            deletions.push({
              root: section.root,
              containmentRoot: section.containmentRoot,
              planned,
            });
            continue;
          }
          refusals.push(`run-missing: ${key}`);
          continue;
        }
        if (
          !section.current.plannedDeletions.some(
            (entry) => entry.id === planned.id,
          )
        ) {
          refusals.push(`run-no-longer-eligible: ${key}`);
          continue;
        }
        deletions.push({
          root: section.root,
          containmentRoot: section.containmentRoot,
          planned,
        });
      }
    }
  if (refusals.length > 0)
    throw new Error(
      `Retention apply refused; nothing was deleted. The world diverged from the approved plan: ${refusals.join("; ")}. Re-plan and re-approve.`,
    );

  await mkdir(applyDirectory, { recursive: true });
  const deleted: { root: RetentionRootName; id: string; path: string }[] = [];
  for (const deletion of deletions) {
    const entry = {
      root: deletion.root,
      runId: deletion.planned.id,
      path: deletion.planned.path,
      at: input.now,
    };
    await appendFile(
      journalPath,
      `${JSON.stringify({ event: "deleting", ...entry })}\n`,
      "utf8",
    );
    await removeContainedPath(deletion.containmentRoot, deletion.planned.path);
    await appendFile(
      journalPath,
      `${JSON.stringify({ event: "deleted", ...entry })}\n`,
      "utf8",
    );
    deleted.push({
      root: deletion.root,
      id: deletion.planned.id,
      path: deletion.planned.path,
    });
  }
  const result: EvidenceRetentionApplyResult = {
    schemaVersion: "1.0.0",
    planPath: resolve(input.planPath),
    planSha256,
    applyDirectory,
    journalPath,
    deleted,
    skippedJournaledRunIds: skipped.sort(),
    finishedAt: input.now,
  };
  await atomicWriteJson(resolve(applyDirectory, "apply-result.json"), result);
  return result;
}
