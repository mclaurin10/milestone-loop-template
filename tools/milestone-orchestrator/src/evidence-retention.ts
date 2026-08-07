import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  OrchestratorConfig,
  OrchestratorState,
  RetentionCandidateIdentity,
} from "./contracts.js";
import { readArtifactInventoryRetentionGuard } from "./artifact-inventory.js";
import { assertExistingContainedPath } from "./path-safety.js";

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

export type RetentionCandidate = RetentionCandidateIdentity;

function gitCandidateOutput(
  repositoryRoot: string,
  args: readonly string[],
): Buffer {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "buffer",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot capture the retention candidate identity (git ${args.join(" ")}): ${result.error?.message ?? result.stderr.toString("utf8").trim()}.`,
    );
  return result.stdout;
}

function retentionWorktreeFingerprint(repositoryRoot: string): {
  readonly dirty: boolean;
  readonly worktreeSha256: string;
} {
  const status = gitCandidateOutput(repositoryRoot, [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
  ]);
  const diff = gitCandidateOutput(repositoryRoot, [
    "diff",
    "--binary",
    "--no-ext-diff",
    "--full-index",
    "HEAD",
    "--",
  ]);
  const untrackedOutput = gitCandidateOutput(repositoryRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const untracked = untrackedOutput
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0)
    .sort();
  const hash = createHash("sha256")
    .update("retention-candidate-v1\0")
    .update(status)
    .update("\0diff\0")
    .update(diff);
  for (const path of untracked) {
    const absolute = resolve(repositoryRoot, path);
    const metadata = lstatSync(absolute);
    hash.update("\0untracked\0").update(path).update("\0");
    if (metadata.isSymbolicLink())
      hash.update("symlink\0").update(readlinkSync(absolute));
    else if (metadata.isFile())
      hash.update("file\0").update(readFileSync(absolute));
    else hash.update(`other:${metadata.mode}\0`);
  }
  return {
    dirty: status.length > 0,
    worktreeSha256: hash.digest("hex"),
  };
}

export function captureRetentionCandidate(
  repositoryRoot: string,
): RetentionCandidate {
  const commit = gitCandidateOutput(repositoryRoot, ["rev-parse", "HEAD"])
    .toString("utf8")
    .trim();
  const tree = gitCandidateOutput(repositoryRoot, ["rev-parse", "HEAD^{tree}"])
    .toString("utf8")
    .trim();
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^[0-9a-f]{40}$/.test(tree))
    throw new Error("Retention candidate identity is malformed.");
  return { commit, tree, ...retentionWorktreeFingerprint(repositoryRoot) };
}

export interface EvidenceRetentionPlan {
  readonly schemaVersion: "1.2.0";
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
    schemaVersion: "1.2.0",
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function runIdArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && safeRunId(entry)) &&
    new Set(value).size === value.length
  );
}

function validPlanSection(
  value: unknown,
  expected: {
    readonly manifestKind: EvidenceManifestKind;
    readonly generatedAt: string;
    readonly keepRecentRuns: number;
  },
): value is EvidenceRetentionReport {
  if (!record(value)) return false;
  const keys = [
    "schemaVersion",
    "mode",
    "artifactRoot",
    "artifactRootRealpath",
    "manifestKind",
    "keepRecentRuns",
    "observedRunIds",
    "legacyRunIds",
    "citedRunIds",
    "recentRunIds",
    "eligibleRunIds",
    "plannedDeletions",
    "suspended",
    "suspensionReasons",
    "generatedAt",
  ] as const;
  if (
    !onlyKeys(value, keys) ||
    value["schemaVersion"] !== "1.1.0" ||
    value["mode"] !== "plan" ||
    typeof value["artifactRoot"] !== "string" ||
    typeof value["artifactRootRealpath"] !== "string" ||
    value["manifestKind"] !== expected.manifestKind ||
    value["keepRecentRuns"] !== expected.keepRecentRuns ||
    value["generatedAt"] !== expected.generatedAt ||
    !runIdArray(value["observedRunIds"]) ||
    !runIdArray(value["legacyRunIds"]) ||
    !runIdArray(value["citedRunIds"]) ||
    !runIdArray(value["recentRunIds"]) ||
    !runIdArray(value["eligibleRunIds"]) ||
    typeof value["suspended"] !== "boolean" ||
    !Array.isArray(value["suspensionReasons"]) ||
    value["suspensionReasons"].some(
      (reason) =>
        ![
          "candidate-controller-mismatch",
          "active-reconciliation",
          "unresolved-escalated-history",
          "unknown-reference",
        ].includes(String(reason)),
    ) ||
    new Set(value["suspensionReasons"]).size !==
      value["suspensionReasons"].length ||
    value["suspended"] !== value["suspensionReasons"].length > 0 ||
    !Array.isArray(value["plannedDeletions"])
  )
    return false;
  const observedRunIds = value["observedRunIds"] as string[];
  const legacyRunIds = value["legacyRunIds"] as string[];
  const citedRunIds = value["citedRunIds"] as string[];
  const recentRunIds = value["recentRunIds"] as string[];
  const eligibleRunIds = value["eligibleRunIds"] as string[];
  const observed = new Set(observedRunIds);
  if (
    [...legacyRunIds, ...citedRunIds, ...recentRunIds, ...eligibleRunIds].some(
      (id) => !observed.has(id),
    ) ||
    eligibleRunIds.some(
      (id) =>
        legacyRunIds.includes(id) ||
        citedRunIds.includes(id) ||
        recentRunIds.includes(id),
    )
  )
    return false;
  for (const deletion of value["plannedDeletions"]) {
    if (
      !record(deletion) ||
      !onlyKeys(deletion, ["id", "path", "finishedAt"]) ||
      typeof deletion["id"] !== "string" ||
      !safeRunId(deletion["id"]) ||
      typeof deletion["path"] !== "string" ||
      resolve(deletion["path"]) !==
        resolve(value["artifactRoot"], deletion["id"]) ||
      !timestamp(deletion["finishedAt"])
    )
      return false;
  }
  const plannedIds = value["plannedDeletions"].map((deletion) =>
    String((deletion as Record<string, unknown>)["id"]),
  );
  return value["suspended"]
    ? plannedIds.length === 0
    : JSON.stringify(plannedIds) === JSON.stringify(eligibleRunIds);
}

export function assertEvidenceRetentionPlan(
  value: unknown,
): EvidenceRetentionPlan {
  if (!record(value)) throw new Error("Retention plan is not an object.");
  const candidate = value["candidate"];
  const controller = value["controller"];
  const config = value["config"];
  if (
    !onlyKeys(value, [
      "schemaVersion",
      "mode",
      "generatedAt",
      "candidate",
      "controller",
      "config",
      "verificationRuns",
      "controllerRuns",
    ]) ||
    value["schemaVersion"] !== "1.2.0" ||
    value["mode"] !== "plan" ||
    !timestamp(value["generatedAt"]) ||
    !record(candidate) ||
    !onlyKeys(candidate, ["commit", "tree", "dirty", "worktreeSha256"]) ||
    !/^[a-f0-9]{40}$/.test(String(candidate["commit"])) ||
    !/^[a-f0-9]{40}$/.test(String(candidate["tree"])) ||
    typeof candidate["dirty"] !== "boolean" ||
    !/^[a-f0-9]{64}$/.test(String(candidate["worktreeSha256"])) ||
    !record(controller) ||
    !onlyKeys(controller, ["verifiedCommit", "runStatus", "runId"]) ||
    !/^[a-f0-9]{40}$/.test(String(controller["verifiedCommit"])) ||
    !["idle", "running", "stopped", "escalated"].includes(
      String(controller["runStatus"]),
    ) ||
    (controller["runId"] !== null && typeof controller["runId"] !== "string") ||
    !record(config) ||
    !onlyKeys(config, ["keepRecentRuns"]) ||
    !Number.isSafeInteger(config["keepRecentRuns"]) ||
    Number(config["keepRecentRuns"]) < 0 ||
    !validPlanSection(value["verificationRuns"], {
      manifestKind: "verification-result",
      generatedAt: value["generatedAt"],
      keepRecentRuns: Number(config["keepRecentRuns"]),
    }) ||
    !validPlanSection(value["controllerRuns"], {
      manifestKind: "controller-run-summary",
      generatedAt: value["generatedAt"],
      keepRecentRuns: Number(config["keepRecentRuns"]),
    })
  )
    throw new Error(
      "Retention plan is not a canonical mode:plan 1.2.0 envelope; regenerate it with loop:retention:plan.",
    );
  return value as unknown as EvidenceRetentionPlan;
}
