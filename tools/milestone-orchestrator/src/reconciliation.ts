import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  RECONCILIATION_PHASES,
  type ControllerBoundaryArchive,
  type DurableArtifactReference,
  type MilestoneProposal,
  type OrchestratorConfig,
  type ProjectProfile,
  type OrchestratorState,
  type ReconciliationPhase,
  type ReconciliationRecord,
  type ReconciliationReview,
  type VerificationTierResult,
} from "./contracts.js";
import {
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  loadConfig,
  loadVerificationManifest,
} from "./config.js";
import { runCommand } from "./command-runner.js";
import { assertArtifactInventory } from "./artifact-inventory.js";
import {
  assertBenchmarkEnvironmentManifest,
  assertBenchmarkMatrix,
  assertLoopBenchmark,
} from "./benchmark.js";
import type { CodexGateway } from "./codex-gateway.js";
import { SdkCodexGateway } from "./codex-gateway.js";
import { ControllerLease } from "./controller-lease.js";
import { ensureContainedDirectory } from "./path-safety.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { currentVerificationProfile } from "./git-isolation.js";
import { evaluateProposal } from "./policy.js";
import {
  assertManifestProtectedPathsCovered,
  buildCanonicalProtectedSet,
  casefoldPathKey,
} from "./protected-roots.js";
import {
  reconciliationReviewApproves,
  requestReconciliationReview,
} from "./reconciliation-reviewer.js";
import { assertMilestoneProposal, assertOrchestratorState } from "./schema.js";
import {
  StateStore,
  atomicWriteJson,
  createIdleRun,
  migrateOrchestratorState,
} from "./state-store.js";
import { assertReconciliationTransition } from "./transitions.js";
import { redactSensitiveText } from "./redaction.js";
import {
  validateReconciliationMilestoneTier,
  type ValidatedReconciliationMilestoneTier,
} from "./verifier.js";

const RECONCILIATION_ROOT = "artifacts/orchestrator/reconciliation";
const CONTROLLER_HISTORY_ROOT = "artifacts/orchestrator/state/history";

export interface ReconciliationCommitRecord {
  readonly sha: string;
  readonly tree: string;
  readonly parents: readonly string[];
  readonly subject: string;
  readonly committedAt: string;
  readonly changedPathCount: number;
  readonly additions: number;
  readonly deletions: number;
  readonly protectedPathOverlap: readonly string[];
  readonly exactEvidenceCitations: readonly string[];
}

export interface ReconciliationCommitRangeManifest {
  readonly schemaVersion: "1.0.0";
  readonly reconciliationId: string;
  readonly sourceVerifiedCommit: string;
  readonly candidateCommit: string;
  readonly commitCount: number;
  readonly records: readonly ReconciliationCommitRecord[];
  readonly recordsSha256: string;
}

export interface ReconciliationStatusSummary {
  readonly schemaVersion: "1.0.0";
  readonly readOnly: true;
  readonly repositoryVerifiedCommit: string;
  readonly active: ReconciliationRecord | null;
  readonly latest: ReconciliationRecord | null;
  readonly controllerArchiveCount: number;
  readonly nextAllowedAction: OrchestratorState["nextAllowedAction"];
}

export class ReconciliationInterruption extends Error {
  constructor(phase: ReconciliationPhase) {
    super(`Injected interruption after reconciliation phase ${phase}.`);
    this.name = "ReconciliationInterruption";
  }
}

class CandidateDriftError extends Error {
  constructor() {
    super("The reconciliation candidate changed before adoption.");
    this.name = "CandidateDriftError";
  }
}

export interface ReconciliationDependencies {
  readonly now?: () => Date;
  readonly createId?: (
    sourceVerifiedCommit: string,
    candidateCommit: string,
  ) => string;
  readonly gateway?: CodexGateway;
  readonly executeMilestoneTier?: (input: {
    readonly repositoryRoot: string;
    readonly artifactDirectory: string;
    readonly manifestPath: string;
    readonly timeoutMs: number;
  }) => Promise<string>;
  readonly supportingArtifacts?: (input: {
    readonly repositoryRoot: string;
    readonly candidateCommit: string;
    readonly candidateTree: string;
  }) => Promise<{
    readonly benchmark: DurableArtifactReference;
    readonly inventory: DurableArtifactReference;
  }>;
  readonly review?: (input: {
    readonly gateway: CodexGateway;
    readonly project: ProjectProfile;
    readonly record: ReconciliationRecord;
    readonly workspacePath: string;
    readonly artifactDirectory: string;
    readonly timeoutMs: number;
    readonly d031BaseCommit: string;
    readonly d031CandidateCommit: string;
    readonly now?: () => string;
  }) => Promise<ReconciliationReview>;
  readonly afterPhasePersisted?: (
    phase: ReconciliationPhase,
  ) => void | Promise<void>;
}

export interface ReconciliationInvocation {
  readonly candidate: string;
  readonly nextProposalPath: string;
  readonly reason: string;
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function hash(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  options: { readonly allowNoMatch?: boolean } = {},
): string {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (
    options.allowNoMatch &&
    result.status === 1 &&
    !result.error &&
    result.stderr.trim().length === 0
  )
    return "";
  if (result.error || result.status !== 0)
    throw new Error(
      `Git reconciliation inspection failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

function safeRelative(repositoryRoot: string, path: string): string {
  const absolute = isAbsolute(path)
    ? resolve(path)
    : resolve(repositoryRoot, path);
  const value = slash(relative(resolve(repositoryRoot), absolute));
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value.split("/").includes("..")
  )
    throw new Error("Reconciliation artifact escapes the repository.");
  return value;
}

async function regularContainedFile(
  repositoryRoot: string,
  path: string,
): Promise<Buffer> {
  const root = await realpath(resolve(repositoryRoot));
  const absolute = resolve(repositoryRoot, path);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("Reconciliation evidence must be a regular file.");
  const resolved = await realpath(absolute);
  const rel = slash(relative(root, resolved));
  if (rel.length === 0 || isAbsolute(rel) || rel.split("/").includes(".."))
    throw new Error("Reconciliation evidence resolves outside the repository.");
  return readFile(absolute);
}

async function artifactReference(
  repositoryRoot: string,
  path: string,
): Promise<DurableArtifactReference> {
  const absolute = resolve(repositoryRoot, path);
  const contents = await regularContainedFile(repositoryRoot, absolute);
  return {
    path: safeRelative(repositoryRoot, absolute),
    sha256: hash(contents),
    bytes: contents.byteLength,
  };
}

async function validateReference(
  repositoryRoot: string,
  reference: DurableArtifactReference,
): Promise<void> {
  const actual = await artifactReference(repositoryRoot, reference.path);
  if (
    actual.path !== reference.path ||
    actual.sha256 !== reference.sha256 ||
    actual.bytes !== reference.bytes
  )
    throw new Error(`Reconciliation evidence drifted: ${reference.path}.`);
}

function durableReference(
  reference: DurableArtifactReference,
): DurableArtifactReference {
  return {
    path: reference.path,
    sha256: reference.sha256,
    bytes: reference.bytes,
  };
}

async function writeJsonArtifact(
  repositoryRoot: string,
  path: string,
  value: unknown,
): Promise<DurableArtifactReference> {
  const absolute = resolve(repositoryRoot, path);
  await ensureContainedDirectory(repositoryRoot, dirname(absolute));
  safeRelative(repositoryRoot, absolute);
  await atomicWriteJson(absolute, value);
  return artifactReference(repositoryRoot, absolute);
}

function candidateIdentity(
  repositoryRoot: string,
  revision: string,
): { readonly commit: string; readonly tree: string; readonly clean: true } {
  const commit = git(repositoryRoot, ["rev-parse", "--verify", revision]);
  const head = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const tree = git(repositoryRoot, ["rev-parse", `${commit}^{tree}`]);
  const status = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (
    !/^[a-f0-9]{40}$/.test(commit) ||
    !/^[a-f0-9]{40}$/.test(tree) ||
    commit !== head ||
    status.length > 0
  )
    throw new Error(
      "Reconciliation candidate must resolve to exact clean HEAD.",
    );
  return { commit, tree, clean: true };
}

function assertCandidateUnchanged(
  repositoryRoot: string,
  record: ReconciliationRecord,
): void {
  let current:
    | { readonly commit: string; readonly tree: string; readonly clean: true }
    | undefined;
  try {
    current = candidateIdentity(repositoryRoot, record.candidateRevision);
  } catch {
    throw new CandidateDriftError();
  }
  if (
    current.commit !== record.candidateCommit ||
    current.tree !== record.candidateTree
  )
    throw new CandidateDriftError();
}

function commitMetadata(
  repositoryRoot: string,
  commit: string,
): {
  readonly tree: string;
  readonly parents: readonly string[];
  readonly subject: string;
  readonly committedAt: string;
} {
  const output = git(repositoryRoot, [
    "show",
    "-s",
    "--format=%T%x00%P%x00%s%x00%cI",
    commit,
  ]);
  const [tree, parents = "", subject = "", committedAt = ""] =
    output.split("\0");
  if (
    !/^[a-f0-9]{40}$/.test(tree ?? "") ||
    !Number.isFinite(Date.parse(committedAt))
  )
    throw new Error(`Commit metadata is malformed for ${commit}.`);
  return {
    tree: tree ?? "",
    parents: parents.length > 0 ? parents.split(" ") : [],
    subject,
    committedAt,
  };
}

function commitStats(
  repositoryRoot: string,
  commit: string,
): {
  readonly paths: readonly string[];
  readonly additions: number;
  readonly deletions: number;
} {
  const paths = git(repositoryRoot, [
    "show",
    "--format=",
    "--name-only",
    "--first-parent",
    commit,
  ])
    .split(/\r?\n/u)
    .map((path) => slash(path.trim()))
    .filter(Boolean);
  const summary = git(repositoryRoot, [
    "show",
    "--format=",
    "--shortstat",
    "--first-parent",
    commit,
  ]);
  const additions = Number(/(\d+) insertion/u.exec(summary)?.[1] ?? 0);
  const deletions = Number(/(\d+) deletion/u.exec(summary)?.[1] ?? 0);
  return {
    paths: [...new Set(paths)].sort(),
    additions,
    deletions,
  };
}

function evidenceCitations(
  repositoryRoot: string,
  candidate: string,
  commit: string,
): readonly string[] {
  const result = git(
    repositoryRoot,
    ["grep", "-F", "-l", commit, candidate, "--", ".agent", "docs"],
    { allowNoMatch: true },
  );
  return result
    .split(/\r?\n/u)
    .map((path) => {
      const value = slash(path.trim());
      return value.startsWith(`${candidate}:`)
        ? value.slice(candidate.length + 1)
        : value;
    })
    .filter(Boolean)
    .sort();
}

function overlapsProtectedPath(
  path: string,
  protectedPaths: readonly string[],
): boolean {
  const candidate = casefoldPathKey(path);
  return protectedPaths.some((protectedPath) => {
    const folded = casefoldPathKey(protectedPath);
    return candidate === folded || candidate.startsWith(`${folded}/`);
  });
}

export function createCommitRangeManifest(input: {
  readonly repositoryRoot: string;
  readonly reconciliationId: string;
  readonly sourceVerifiedCommit: string;
  readonly candidateCommit: string;
  readonly protectedPaths: readonly string[];
}): ReconciliationCommitRangeManifest {
  const ancestor = spawnSync(
    "git",
    [
      "-C",
      input.repositoryRoot,
      "merge-base",
      "--is-ancestor",
      input.sourceVerifiedCommit,
      input.candidateCommit,
    ],
    { windowsHide: true },
  );
  if (ancestor.error || ancestor.status !== 0)
    throw new Error(
      "Stored verified commit is not an ancestor of the reconciliation candidate.",
    );
  const commits = git(input.repositoryRoot, [
    "rev-list",
    "--reverse",
    "--topo-order",
    `${input.sourceVerifiedCommit}..${input.candidateCommit}`,
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  if (commits.length === 0 || new Set(commits).size !== commits.length)
    throw new Error("Reconciliation commit range is empty or duplicated.");
  const seen = new Set<string>([input.sourceVerifiedCommit]);
  const records = commits.map((commit) => {
    const metadata = commitMetadata(input.repositoryRoot, commit);
    for (const parent of metadata.parents) {
      if (seen.has(parent)) continue;
      const priorAncestor = spawnSync(
        "git",
        [
          "-C",
          input.repositoryRoot,
          "merge-base",
          "--is-ancestor",
          parent,
          input.sourceVerifiedCommit,
        ],
        { windowsHide: true },
      );
      if (priorAncestor.error || priorAncestor.status !== 0)
        throw new Error(
          `Commit range parent ${parent} is discontinuous at ${commit}.`,
        );
    }
    const stats = commitStats(input.repositoryRoot, commit);
    const record: ReconciliationCommitRecord = {
      sha: commit,
      tree: metadata.tree,
      parents: metadata.parents,
      subject: metadata.subject,
      committedAt: metadata.committedAt,
      changedPathCount: stats.paths.length,
      additions: stats.additions,
      deletions: stats.deletions,
      protectedPathOverlap: stats.paths.filter((path) =>
        overlapsProtectedPath(path, input.protectedPaths),
      ),
      exactEvidenceCitations: evidenceCitations(
        input.repositoryRoot,
        input.candidateCommit,
        commit,
      ),
    };
    seen.add(commit);
    return record;
  });
  if (records.at(-1)?.sha !== input.candidateCommit)
    throw new Error("Commit range does not terminate at the exact candidate.");
  return {
    schemaVersion: "1.0.0",
    reconciliationId: input.reconciliationId,
    sourceVerifiedCommit: input.sourceVerifiedCommit,
    candidateCommit: input.candidateCommit,
    commitCount: records.length,
    records,
    recordsSha256: hash(JSON.stringify(records)),
  };
}

async function archiveRawControllerState(input: {
  readonly repositoryRoot: string;
  readonly rawContents: Buffer;
  readonly rawState: Record<string, unknown>;
  readonly archivedAt: string;
}): Promise<ControllerBoundaryArchive> {
  const sourceHash = hash(input.rawContents);
  const revision = input.rawState["revision"];
  const repository = input.rawState["repository"];
  const run = input.rawState["run"];
  const queue = input.rawState["queue"];
  if (
    !Number.isSafeInteger(revision) ||
    !repository ||
    typeof repository !== "object" ||
    Array.isArray(repository) ||
    !run ||
    typeof run !== "object" ||
    Array.isArray(run) ||
    !Array.isArray(queue) ||
    queue.some((value) => typeof value !== "string") ||
    typeof (repository as Record<string, unknown>)["verifiedCommit"] !==
      "string" ||
    !/^[a-f0-9]{40}$/.test(
      String((repository as Record<string, unknown>)["verifiedCommit"]),
    ) ||
    typeof input.rawState["schemaVersion"] !== "string" ||
    typeof input.rawState["nextAllowedAction"] !== "string"
  )
    throw new Error("Raw controller state cannot be truthfully archived.");
  const id = `controller-${String(revision)}-${sourceHash.slice(0, 16)}`;
  const directory = resolve(input.repositoryRoot, CONTROLLER_HISTORY_ROOT, id);
  const statePath = resolve(directory, "state.json");
  await ensureContainedDirectory(input.repositoryRoot, directory);
  try {
    const handle = await open(statePath, "wx");
    try {
      await handle.writeFile(input.rawContents);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw error;
    const existing = await regularContainedFile(
      input.repositoryRoot,
      statePath,
    );
    if (!existing.equals(input.rawContents))
      throw new Error("Existing controller archive does not match raw state.", {
        cause: error,
      });
  }
  const retained = await regularContainedFile(input.repositoryRoot, statePath);
  if (
    hash(retained) !== sourceHash ||
    retained.byteLength !== input.rawContents.byteLength
  )
    throw new Error("Controller archive hash verification failed.");
  return {
    schemaVersion: "1.0.0",
    id,
    rawSourceState: {
      path: safeRelative(input.repositoryRoot, statePath),
      sha256: sourceHash,
      bytes: input.rawContents.byteLength,
    },
    sourceStateSchemaVersion: input.rawState["schemaVersion"],
    sourceRevision: Number(revision),
    priorVerifiedCommit: String(
      (repository as Record<string, unknown>)["verifiedCommit"],
    ),
    priorRun: structuredClone(run as Record<string, unknown>),
    priorQueue: [...queue],
    priorActiveMilestoneId:
      typeof input.rawState["activeMilestoneId"] === "string"
        ? input.rawState["activeMilestoneId"]
        : null,
    priorNextAllowedAction: input.rawState["nextAllowedAction"],
    archivedAt: input.archivedAt,
    reason: "external-integration-reconciliation",
  };
}

function emptyPhaseTimestamps(now: string) {
  return Object.fromEntries(
    RECONCILIATION_PHASES.map((phase) => [
      phase,
      phase === "prepared" ? now : null,
    ]),
  ) as ReconciliationRecord["phaseTimestamps"];
}

function historicalAvailability() {
  const reason =
    "Direct external-loop work predates controller-owned measurement and was not recorded; reconciliation does not infer it.";
  return {
    planner: { availability: "not-recorded", reason },
    worker: { availability: "not-recorded", reason },
    reviewer: { availability: "not-recorded", reason },
    attempts: { availability: "not-recorded", reason },
    timings: { availability: "not-recorded", reason },
    tokens: { availability: "not-recorded", reason },
    threadLineage: { availability: "not-recorded", reason },
  } as const;
}

function transitionRecord(
  record: ReconciliationRecord,
  phase: ReconciliationPhase,
  now: string,
  patch: Partial<ReconciliationRecord> = {},
): ReconciliationRecord {
  assertReconciliationTransition(record.phase, phase);
  return {
    ...record,
    ...patch,
    phase,
    previousPhase: record.phase,
    previousPhaseAt: record.currentPhaseAt,
    currentPhaseAt: now,
    phaseTimestamps: { ...record.phaseTimestamps, [phase]: now },
  };
}

async function latestJsonArtifact(
  repositoryRoot: string,
  root: string,
  filename: string,
  validate: (value: unknown) => void,
): Promise<DurableArtifactReference> {
  const absoluteRoot = resolve(repositoryRoot, root);
  const rootMetadata = await lstat(absoluteRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error(`Reconciliation artifact root is unsafe: ${root}.`);
  const directories = (await readdir(absoluteRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  for (const directory of directories) {
    const path = resolve(absoluteRoot, directory, filename);
    try {
      const contents = await regularContainedFile(repositoryRoot, path);
      const value = JSON.parse(contents.toString("utf8")) as unknown;
      validate(value);
      return {
        path: safeRelative(repositoryRoot, path),
        sha256: hash(contents),
        bytes: contents.byteLength,
      };
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error instanceof Error &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT")
      )
        continue;
      throw error;
    }
  }
  throw new Error(`No valid ${filename} exists under ${root}.`);
}

async function defaultSupportingArtifacts(input: {
  readonly repositoryRoot: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
}): Promise<{
  readonly benchmark: DurableArtifactReference;
  readonly inventory: DurableArtifactReference;
}> {
  const benchmark = await latestJsonArtifact(
    input.repositoryRoot,
    "artifacts/benchmarks",
    "benchmark.json",
    (value) => {
      const parsed = assertLoopBenchmark(value);
      if (
        parsed.status !== "PASS" ||
        parsed.candidate.commit !== input.candidateCommit ||
        parsed.candidate.tree !== input.candidateTree ||
        parsed.candidate.workingTreeDirty
      )
        throw new Error(
          "Reconciliation benchmark is not a passing exact-candidate result.",
        );
    },
  );
  const benchmarkResult = assertLoopBenchmark(
    JSON.parse(
      (
        await regularContainedFile(
          input.repositoryRoot,
          resolve(input.repositoryRoot, benchmark.path),
        )
      ).toString("utf8"),
    ),
  );
  const baselineManifestReference = benchmarkResult.baselineManifest;
  const candidateManifestReference = benchmarkResult.candidateManifest;
  await Promise.all([
    validateReference(input.repositoryRoot, baselineManifestReference),
    validateReference(input.repositoryRoot, candidateManifestReference),
    validateReference(input.repositoryRoot, {
      path: benchmarkResult.matrix.path,
      sha256: benchmarkResult.matrix.sha256,
      bytes: benchmarkResult.matrix.bytes,
    }),
    validateReference(input.repositoryRoot, {
      path: benchmarkResult.telemetry.manifestPath,
      sha256: benchmarkResult.telemetry.manifestSha256,
      bytes: benchmarkResult.telemetry.manifestBytes,
    }),
    validateReference(input.repositoryRoot, {
      path: benchmarkResult.inventory.referencedPath,
      sha256: benchmarkResult.inventory.sha256,
      bytes: benchmarkResult.inventory.bytes,
    }),
  ]);
  const baselineManifest = assertBenchmarkEnvironmentManifest(
    JSON.parse(
      (
        await regularContainedFile(
          input.repositoryRoot,
          resolve(input.repositoryRoot, baselineManifestReference.path),
        )
      ).toString("utf8"),
    ),
  );
  const candidateManifest = assertBenchmarkEnvironmentManifest(
    JSON.parse(
      (
        await regularContainedFile(
          input.repositoryRoot,
          resolve(input.repositoryRoot, candidateManifestReference.path),
        )
      ).toString("utf8"),
    ),
  );
  const matrix = assertBenchmarkMatrix(
    JSON.parse(
      (
        await regularContainedFile(
          input.repositoryRoot,
          resolve(input.repositoryRoot, benchmarkResult.matrix.path),
        )
      ).toString("utf8"),
    ),
  );
  const preBenchmarkInventory = assertArtifactInventory(
    JSON.parse(
      (
        await regularContainedFile(
          input.repositoryRoot,
          resolve(
            input.repositoryRoot,
            benchmarkResult.inventory.referencedPath,
          ),
        )
      ).toString("utf8"),
    ),
  );
  if (
    baselineManifest.side !== "before" ||
    candidateManifest.side !== "after" ||
    baselineManifest.candidate.commit !== benchmarkResult.baseline.commit ||
    baselineManifest.candidate.tree !== benchmarkResult.baseline.tree ||
    candidateManifest.candidate.commit !== benchmarkResult.candidate.commit ||
    candidateManifest.candidate.tree !== benchmarkResult.candidate.tree ||
    baselineManifest.lockfile.sha256 !== candidateManifest.lockfile.sha256 ||
    baselineManifest.lockfile.bytes !== candidateManifest.lockfile.bytes ||
    matrix.id !== benchmarkResult.matrix.id ||
    preBenchmarkInventory.candidate.gitCommit !== input.candidateCommit ||
    preBenchmarkInventory.candidate.gitTree !== input.candidateTree ||
    preBenchmarkInventory.candidate.workingTreeDirty
  )
    throw new Error(
      "Reconciliation benchmark supporting manifests do not bind the exact paired boundary.",
    );
  const candidateProtected = new Map(
    candidateManifest.protectedFiles.map((file) => [file.path, file]),
  );
  if (
    baselineManifest.protectedFiles.length !==
      benchmarkResult.protectedComparison.paths.length ||
    candidateManifest.protectedFiles.length !==
      baselineManifest.protectedFiles.length ||
    benchmarkResult.protectedComparison.paths.some((entry, index) => {
      const before = baselineManifest.protectedFiles[index];
      const after = candidateProtected.get(entry.path);
      if (!before || !after) return true;
      return (
        before.path !== entry.path ||
        before.sha256 !== entry.baselineSha256 ||
        after.sha256 !== entry.candidateSha256 ||
        entry.matches !== (before.sha256 === after.sha256)
      );
    })
  )
    throw new Error(
      "Reconciliation benchmark protected comparison does not match its environment manifests.",
    );
  const inventory = await latestJsonArtifact(
    input.repositoryRoot,
    "artifacts/inventory",
    "inventory.json",
    (value) => {
      const parsed = assertArtifactInventory(value);
      if (
        parsed.candidate.gitCommit !== input.candidateCommit ||
        parsed.candidate.gitTree !== input.candidateTree ||
        parsed.candidate.workingTreeDirty
      )
        throw new Error(
          "Reconciliation inventory is not bound to the exact clean candidate.",
        );
    },
  );
  return { benchmark, inventory };
}

async function trackedNextProposal(input: {
  readonly repositoryRoot: string;
  readonly path: string;
}): Promise<{
  readonly proposal: MilestoneProposal;
  readonly reference: ReconciliationRecord["nextProposal"];
}> {
  const contents = await regularContainedFile(input.repositoryRoot, input.path);
  const proposal = assertMilestoneProposal(
    JSON.parse(contents.toString("utf8")) as unknown,
  );
  if (proposal.schemaVersion !== "1.1.0")
    throw new Error("Next reconciliation proposal must use schema 1.1.0.");
  return {
    proposal,
    reference: {
      path: safeRelative(input.repositoryRoot, input.path),
      sha256: hash(contents),
      bytes: contents.byteLength,
      id: proposal.id,
    },
  };
}

async function protectedComparison(input: {
  readonly repositoryRoot: string;
  readonly candidateCommit: string;
  readonly protectedFiles: OrchestratorState["repository"]["protectedFiles"];
  readonly commitRange: ReconciliationCommitRangeManifest;
  readonly outputPath: string;
}): Promise<DurableArtifactReference> {
  const files = input.protectedFiles.map((stored) => {
    const result = spawnSync(
      "git",
      [
        "-C",
        input.repositoryRoot,
        "show",
        `${input.candidateCommit}:${stored.path}`,
      ],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    );
    const candidateSha256 =
      !result.error && result.status === 0 ? hash(result.stdout) : null;
    return {
      path: stored.path,
      storedSha256: stored.sha256,
      candidateSha256,
      matches: candidateSha256 === stored.sha256,
    };
  });
  const rangeOverlaps = input.commitRange.records.flatMap((record) =>
    record.protectedPathOverlap.map((path) => ({ commit: record.sha, path })),
  );
  if (files.some((file) => !file.matches) || rangeOverlaps.length > 0)
    throw new Error("Protected files changed across the reconciliation range.");
  return writeJsonArtifact(input.repositoryRoot, input.outputPath, {
    schemaVersion: "1.0.0",
    candidateCommit: input.candidateCommit,
    files,
    rangeOverlaps,
    status: "PASS",
  });
}

async function defaultMilestoneTier(input: {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly manifestPath: string;
  readonly timeoutMs: number;
}): Promise<string> {
  await ensureContainedDirectory(input.repositoryRoot, input.artifactDirectory);
  const result = await runCommand(
    {
      id: "reconciliation-milestone-tier",
      executable: "pnpm",
      args: ["verify:milestone", "--", "--manifest", input.manifestPath],
      parser: "exit-code",
      timeoutMs: input.timeoutMs,
    },
    {
      workingDirectory: input.repositoryRoot,
      artifactDirectory: resolve(input.artifactDirectory, "milestone-command"),
      timeoutMs: input.timeoutMs,
    },
  );
  if (result.exitCode !== 2 || result.signal !== null)
    throw new Error(
      `Milestone tier did not preserve expected exit 2: ${result.message}`,
    );
  const stdout = await readFile(result.stdoutPath, "utf8");
  const match =
    /Verification tier result:\s*(artifacts\/verification-tiers\/[^\r\n]+\/tier-result\.json)/u.exec(
      slash(stdout),
    );
  if (!match?.[1])
    throw new Error("Milestone tier did not report its result path.");
  return match[1];
}

export class ReconciliationController {
  readonly repositoryRoot: string;
  readonly config: OrchestratorConfig;
  readonly store: StateStore;
  private stateValue: OrchestratorState;
  private readonly now: () => Date;
  private readonly createId: NonNullable<
    ReconciliationDependencies["createId"]
  >;
  private readonly gateway: CodexGateway;
  private readonly executeMilestoneTier: NonNullable<
    ReconciliationDependencies["executeMilestoneTier"]
  >;
  private readonly supportingArtifacts: NonNullable<
    ReconciliationDependencies["supportingArtifacts"]
  >;
  private readonly review: NonNullable<ReconciliationDependencies["review"]>;
  private readonly afterPhasePersisted:
    ReconciliationDependencies["afterPhasePersisted"] | undefined;

  private constructor(input: {
    readonly repositoryRoot: string;
    readonly config: OrchestratorConfig;
    readonly store: StateStore;
    readonly state: OrchestratorState;
    readonly dependencies: ReconciliationDependencies;
  }) {
    this.repositoryRoot = input.repositoryRoot;
    this.config = input.config;
    this.store = input.store;
    this.stateValue = input.state;
    this.now = input.dependencies.now ?? (() => new Date());
    this.createId =
      input.dependencies.createId ??
      ((source, candidate) =>
        `reconcile-${source.slice(0, 12)}-${candidate.slice(0, 12)}`);
    this.gateway =
      input.dependencies.gateway ?? new SdkCodexGateway(input.config);
    this.executeMilestoneTier =
      input.dependencies.executeMilestoneTier ?? defaultMilestoneTier;
    this.supportingArtifacts =
      input.dependencies.supportingArtifacts ?? defaultSupportingArtifacts;
    this.review = input.dependencies.review ?? requestReconciliationReview;
    this.afterPhasePersisted = input.dependencies.afterPhasePersisted;
  }

  static async open(
    repositoryRoot: string,
    configPath?: string,
    dependencies: ReconciliationDependencies = {},
  ): Promise<ReconciliationController> {
    const controller = await ReconciliationController.openIfPresent(
      repositoryRoot,
      configPath,
      dependencies,
    );
    if (!controller)
      throw new Error(
        "Reconciliation cannot initialize over missing controller state.",
      );
    return controller;
  }

  static async openIfPresent(
    repositoryRoot: string,
    configPath?: string,
    dependencies: ReconciliationDependencies = {},
  ): Promise<ReconciliationController | null> {
    const root = resolve(repositoryRoot);
    const config = await loadConfig(root, configPath);
    const store = new StateStore(root, config.statePath, () =>
      (dependencies.now ?? (() => new Date()))().toISOString(),
    );
    const state = await store.load();
    if (!state) return null;
    return new ReconciliationController({
      repositoryRoot: root,
      config,
      store,
      state,
      dependencies,
    });
  }

  get state(): OrchestratorState {
    return this.stateValue;
  }

  status(): ReconciliationStatusSummary {
    return {
      schemaVersion: "1.0.0",
      readOnly: true,
      repositoryVerifiedCommit: this.stateValue.repository.verifiedCommit,
      active: this.stateValue.reconciliation.active,
      latest:
        this.stateValue.reconciliation.active ??
        this.stateValue.reconciliation.history.at(-1) ??
        null,
      controllerArchiveCount: this.stateValue.controllerHistory.length,
      nextAllowedAction: this.stateValue.nextAllowedAction,
    };
  }

  private async persist(next: OrchestratorState): Promise<void> {
    this.stateValue = await this.store.save(next);
  }

  private active(): ReconciliationRecord {
    const active = this.stateValue.reconciliation.active;
    if (!active) throw new Error("No active reconciliation exists.");
    return active;
  }

  private async persistActive(record: ReconciliationRecord): Promise<void> {
    await this.persist({
      ...this.stateValue,
      reconciliation: { ...this.stateValue.reconciliation, active: record },
      nextAllowedAction: "reconcile",
    });
    await this.afterPhasePersisted?.(record.phase);
  }

  private async prepare(invocation: ReconciliationInvocation): Promise<void> {
    const proposalPath = safeRelative(
      this.repositoryRoot,
      invocation.nextProposalPath,
    );
    if (this.stateValue.reconciliation.active) {
      const active = this.stateValue.reconciliation.active;
      if (
        active.candidateRevision !== invocation.candidate ||
        active.nextProposal.path !== proposalPath ||
        active.externalGapReason !== invocation.reason
      )
        throw new Error(
          "Active reconciliation arguments do not match the repeated command.",
        );
      return;
    }
    if (!invocation.reason.trim())
      throw new Error(
        "Reconciliation requires a truthful external-gap reason.",
      );
    const verificationManifest = await loadVerificationManifest(
      this.repositoryRoot,
    );
    if (proposalPath !== verificationManifest.value.nextProposalPath)
      throw new Error(
        "Reconciliation next proposal does not match the tracked recommissioning manifest.",
      );
    assertManifestProtectedPathsCovered(
      verificationManifest.value,
      buildCanonicalProtectedSet(this.config),
    );
    const rawContents = await regularContainedFile(
      this.repositoryRoot,
      this.store.path,
    );
    const rawState = JSON.parse(rawContents.toString("utf8")) as unknown;
    if (
      typeof rawState !== "object" ||
      rawState === null ||
      Array.isArray(rawState)
    )
      throw new Error("Raw controller state is malformed.");
    const now = this.now().toISOString();
    const archive = await archiveRawControllerState({
      repositoryRoot: this.repositoryRoot,
      rawContents,
      rawState: rawState as Record<string, unknown>,
      archivedAt: now,
    });
    const migrated = assertOrchestratorState(
      migrateOrchestratorState(rawState),
    );
    if (migrated.repository.verifiedCommit !== archive.priorVerifiedCommit)
      throw new Error("Migrated state changed the source verified commit.");
    const candidate = candidateIdentity(
      this.repositoryRoot,
      invocation.candidate,
    );
    const idSuffix = `-${archive.sourceRevision}-${archive.rawSourceState.sha256.slice(0, 8)}`;
    const id = `${this.createId(
      archive.priorVerifiedCommit,
      candidate.commit,
    ).slice(0, 192 - idSuffix.length)}${idSuffix}`;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(id))
      throw new Error("Reconciliation ID is unsafe.");
    const directory = resolve(this.repositoryRoot, RECONCILIATION_ROOT, id);
    await ensureContainedDirectory(this.repositoryRoot, directory);
    const range = createCommitRangeManifest({
      repositoryRoot: this.repositoryRoot,
      reconciliationId: id,
      sourceVerifiedCommit: archive.priorVerifiedCommit,
      candidateCommit: candidate.commit,
      protectedPaths: buildCanonicalProtectedSet(
        this.config,
        migrated.repository.protectedFiles.map((file) => file.path),
      ),
    });
    const rangeReference = await writeJsonArtifact(
      this.repositoryRoot,
      resolve(directory, "commit-range.json"),
      range,
    );
    const comparison = await protectedComparison({
      repositoryRoot: this.repositoryRoot,
      candidateCommit: candidate.commit,
      protectedFiles: migrated.repository.protectedFiles,
      commitRange: range,
      outputPath: resolve(directory, "protected-comparison.json"),
    });
    const next = await trackedNextProposal({
      repositoryRoot: this.repositoryRoot,
      path: proposalPath,
    });
    const { benchmark, inventory } = await this.supportingArtifacts({
      repositoryRoot: this.repositoryRoot,
      candidateCommit: candidate.commit,
      candidateTree: candidate.tree,
    });
    const record: ReconciliationRecord = {
      schemaVersion: "1.0.0",
      id,
      status: "active",
      phase: "prepared",
      sourceArchiveId: archive.id,
      sourceState: archive.rawSourceState,
      sourceVerifiedCommit: archive.priorVerifiedCommit,
      targetBranch: migrated.repository.targetBranch,
      candidateRevision: invocation.candidate,
      candidateCommit: candidate.commit,
      candidateTree: candidate.tree,
      cleanTree: true,
      commitRange: {
        ...rangeReference,
        commitCount: range.commitCount,
        recordsSha256: range.recordsSha256,
      },
      protectedComparison: comparison,
      externalGapReason: invocation.reason,
      historicalMeasurementAvailability: historicalAvailability(),
      focusedEvidenceIndex: null,
      exactVerification: null,
      benchmark,
      artifactInventory: inventory,
      independentReview: null,
      nextProposal: next.reference,
      adoption: null,
      previousPhase: null,
      previousPhaseAt: null,
      currentPhaseAt: now,
      phaseTimestamps: emptyPhaseTimestamps(now),
      failure: null,
    };
    assertCandidateUnchanged(this.repositoryRoot, record);
    this.stateValue = migrated;
    await this.persist({
      ...migrated,
      controllerHistory: [
        ...migrated.controllerHistory.filter(
          (entry) => entry.id !== archive.id,
        ),
        archive,
      ],
      reconciliation: { ...migrated.reconciliation, active: record },
      nextAllowedAction: "reconcile",
    });
    await this.afterPhasePersisted?.("prepared");
  }

  private async verify(): Promise<void> {
    let record = this.active();
    assertCandidateUnchanged(this.repositoryRoot, record);
    if (record.phase === "prepared") {
      const verifying = transitionRecord(
        record,
        "verifying",
        this.now().toISOString(),
      );
      await this.persistActive(verifying);
      record = this.active();
    } else if (record.phase !== "verifying") {
      throw new Error(`Cannot verify reconciliation from ${record.phase}.`);
    }
    const manifest = await loadVerificationManifest(
      this.repositoryRoot,
      DEFAULT_VERIFICATION_MANIFEST_PATH,
    );
    const artifactDirectory = resolve(
      this.repositoryRoot,
      RECONCILIATION_ROOT,
      record.id,
    );
    const resultPath = await this.executeMilestoneTier({
      repositoryRoot: this.repositoryRoot,
      artifactDirectory,
      manifestPath: manifest.path,
      timeoutMs: this.config.limits.commandMs,
    });
    const validated = await validateReconciliationMilestoneTier({
      repositoryRoot: this.repositoryRoot,
      tierResultPath: resultPath,
      candidateCommit: record.candidateCommit,
      candidateTree: record.candidateTree,
      requiredFocusedCommands: manifest.value.focusedCommands
        .filter((command) => command.tiers.includes("milestone"))
        .map((command) => ({
          id: command.id,
          argv: command.argv,
          expectedArtifactKinds: command.expectedArtifactKinds,
        })),
    });
    const indexReference = await this.writeFocusedEvidenceIndex(
      record.id,
      validated,
    );
    assertCandidateUnchanged(this.repositoryRoot, record);
    await this.persistActive(
      transitionRecord(
        this.active(),
        "candidate-verified",
        this.now().toISOString(),
        {
          focusedEvidenceIndex: indexReference,
          exactVerification: {
            ...validated.tierResult,
            runId: validated.exactRunId,
            status: "NOT_READY",
            exitCode: 2,
            disposition: "incremental-readiness",
            exactResult: validated.exactResult,
          },
        },
      ),
    );
  }

  private async writeFocusedEvidenceIndex(
    reconciliationId: string,
    validated: ValidatedReconciliationMilestoneTier,
  ): Promise<DurableArtifactReference> {
    const result: VerificationTierResult = validated.result;
    return writeJsonArtifact(
      this.repositoryRoot,
      resolve(
        this.repositoryRoot,
        RECONCILIATION_ROOT,
        reconciliationId,
        "focused-evidence-index.json",
      ),
      {
        schemaVersion: "1.0.0",
        runId: result.runId,
        candidate: result.candidate,
        tierResult: validated.tierResult,
        commands: result.commands.map((command) => ({
          id: command.id,
          argv: command.argv,
          status: command.status,
          exitCode: command.exitCode,
          receipt: command.receipt,
          receiptAbsenceReason: command.receiptAbsenceReason,
          artifactCount: command.artifactCount,
          artifactBytes: command.artifactBytes,
        })),
        exactResult: validated.exactResult,
      },
    );
  }

  private async independentlyReview(): Promise<void> {
    let record = this.active();
    assertCandidateUnchanged(this.repositoryRoot, record);
    if (!record.exactVerification || !record.focusedEvidenceIndex)
      throw new Error(
        "Reconciliation review requires verified candidate evidence.",
      );
    await Promise.all([
      validateReference(this.repositoryRoot, record.commitRange),
      validateReference(this.repositoryRoot, record.protectedComparison),
      validateReference(this.repositoryRoot, record.focusedEvidenceIndex),
      validateReference(this.repositoryRoot, record.exactVerification),
      validateReference(
        this.repositoryRoot,
        record.exactVerification.exactResult,
      ),
      validateReference(this.repositoryRoot, record.benchmark),
      validateReference(this.repositoryRoot, record.artifactInventory),
      validateReference(this.repositoryRoot, record.nextProposal),
    ]);
    if (record.phase === "candidate-verified") {
      const reviewing = transitionRecord(
        record,
        "reviewing",
        this.now().toISOString(),
      );
      await this.persistActive(reviewing);
      record = this.active();
    } else if (record.phase !== "reviewing") {
      throw new Error(`Cannot review reconciliation from ${record.phase}.`);
    }
    const manifest = await loadVerificationManifest(this.repositoryRoot);
    await ensureContainedDirectory(
      this.repositoryRoot,
      resolve(this.repositoryRoot, RECONCILIATION_ROOT, record.id),
    );
    const report = await this.review({
      gateway: this.gateway,
      project: this.config.project,
      record,
      workspacePath: this.repositoryRoot,
      artifactDirectory: resolve(
        this.repositoryRoot,
        RECONCILIATION_ROOT,
        record.id,
      ),
      timeoutMs: this.config.limits.codexTurnMs,
      d031BaseCommit: manifest.value.baseCommit,
      d031CandidateCommit: manifest.value.d031BaselineCommit,
      now: () => this.now().toISOString(),
    });
    const reportReference = await artifactReference(
      this.repositoryRoot,
      resolve(
        this.repositoryRoot,
        RECONCILIATION_ROOT,
        record.id,
        "reviewer-report.json",
      ),
    );
    const reviewed: ReconciliationRecord = {
      ...this.active(),
      independentReview: {
        ...reportReference,
        decision: report.decision,
        threadId: report.threadId,
      },
    };
    await this.persist({
      ...this.stateValue,
      reconciliation: {
        ...this.stateValue.reconciliation,
        active: reviewed,
      },
      nextAllowedAction: "reconcile",
    });
    if (!reconciliationReviewApproves(report))
      throw new Error("Independent reconciliation review rejected adoption.");
    assertCandidateUnchanged(this.repositoryRoot, record);
    await this.persistActive(
      transitionRecord(
        this.active(),
        "review-approved",
        this.now().toISOString(),
        { independentReview: reviewed.independentReview },
      ),
    );
  }

  private async adopt(): Promise<void> {
    let record = this.active();
    assertCandidateUnchanged(this.repositoryRoot, record);
    if (
      !record.exactVerification ||
      !record.focusedEvidenceIndex ||
      !record.independentReview ||
      record.independentReview.decision !== "approve"
    )
      throw new Error("Reconciliation adoption lacks approved exact evidence.");
    if (record.phase === "review-approved") {
      const adopting = transitionRecord(
        record,
        "adopting",
        this.now().toISOString(),
      );
      await this.persistActive(adopting);
      record = this.active();
    } else if (record.phase !== "adopting") {
      throw new Error(`Cannot adopt reconciliation from ${record.phase}.`);
    }
    const adopting = record;
    await Promise.all([
      validateReference(this.repositoryRoot, adopting.sourceState),
      validateReference(this.repositoryRoot, adopting.commitRange),
      validateReference(this.repositoryRoot, adopting.protectedComparison),
      validateReference(this.repositoryRoot, adopting.focusedEvidenceIndex!),
      validateReference(this.repositoryRoot, adopting.exactVerification!),
      validateReference(
        this.repositoryRoot,
        adopting.exactVerification!.exactResult,
      ),
      validateReference(this.repositoryRoot, adopting.independentReview!),
      validateReference(this.repositoryRoot, adopting.benchmark),
      validateReference(this.repositoryRoot, adopting.artifactInventory),
      validateReference(this.repositoryRoot, adopting.nextProposal),
    ]);
    assertCandidateUnchanged(this.repositoryRoot, adopting);
    const archive = this.stateValue.controllerHistory.find(
      (entry) => entry.id === adopting.sourceArchiveId,
    );
    if (
      !archive ||
      archive.rawSourceState.path !== adopting.sourceState.path ||
      archive.priorVerifiedCommit !== adopting.sourceVerifiedCommit
    )
      throw new Error(
        "Reconciliation adoption cannot recover the exact prior controller boundary.",
      );
    const adoptionReference = await writeJsonArtifact(
      this.repositoryRoot,
      resolve(
        this.repositoryRoot,
        RECONCILIATION_ROOT,
        adopting.id,
        "adoption.json",
      ),
      {
        schemaVersion: "1.0.0",
        reconciliationId: adopting.id,
        sourceState: adopting.sourceState,
        sourceVerifiedCommit: adopting.sourceVerifiedCommit,
        candidateCommit: adopting.candidateCommit,
        candidateTree: adopting.candidateTree,
        priorRun: archive.priorRun,
        priorQueue: archive.priorQueue,
        priorActiveMilestoneId: archive.priorActiveMilestoneId,
        priorNextAllowedAction: archive.priorNextAllowedAction,
        adoptedAt: this.now().toISOString(),
      },
    );
    const stateAdopted = transitionRecord(
      this.active(),
      "state-adopted",
      this.now().toISOString(),
      { adoption: adoptionReference },
    );
    await this.persist({
      ...this.stateValue,
      repository: {
        ...this.stateValue.repository,
        verifiedCommit: adopting.candidateCommit,
      },
      queue: [],
      activeMilestoneId: null,
      run: createIdleRun(),
      reconciliation: {
        ...this.stateValue.reconciliation,
        active: stateAdopted,
      },
      nextAllowedAction: "reconcile",
    });
    await this.afterPhasePersisted?.("state-adopted");
  }

  private async queueNext(): Promise<void> {
    const record = this.active();
    if (record.phase === "state-adopted")
      await this.persistActive(
        transitionRecord(record, "queueing-next", this.now().toISOString()),
      );
    const queueing = this.active();
    await validateReference(this.repositoryRoot, queueing.nextProposal);
    const next = await trackedNextProposal({
      repositoryRoot: this.repositoryRoot,
      path: queueing.nextProposal.path,
    });
    if (
      next.reference.sha256 !== queueing.nextProposal.sha256 ||
      next.proposal.id !== queueing.nextProposal.id
    )
      throw new Error(
        "Next proposal changed after reconciliation preparation.",
      );
    const existing = this.stateValue.milestones.find(
      (milestone) => milestone.proposal.id === next.proposal.id,
    );
    if (existing)
      throw new Error(
        "Reconciliation next proposal already exists in controller history.",
      );
    const decision = evaluateProposal(
      next.proposal,
      this.stateValue,
      this.config,
      currentVerificationProfile(this.repositoryRoot),
      this.now().toISOString(),
    );
    if (decision.status !== "accepted")
      throw new Error(
        `Next proposal policy rejected queueing: ${decision.findings.map((finding) => finding.message).join(" ")}`,
      );
    const milestones = [
      ...this.stateValue.milestones,
      createMilestoneRecord(next.proposal, this.now().toISOString(), {
        schemaVersion: "1.0.0",
        source: "tracked-recommissioning-plan",
        sourcePath: next.reference.path,
        sourceSha256: next.reference.sha256,
        plannerThreadId: null,
        recordedAt: this.now().toISOString(),
        reason:
          "Queued by completed external-integration reconciliation without planner invocation.",
      }),
    ];
    const completed = transitionRecord(
      queueing,
      "completed",
      this.now().toISOString(),
      { status: "completed", failure: null },
    );
    await this.persist({
      ...this.stateValue,
      milestones,
      queue: [next.proposal.id],
      activeMilestoneId: null,
      reconciliation: {
        active: null,
        history: [...this.stateValue.reconciliation.history, completed],
      },
      nextAllowedAction: "start-milestone",
    });
    await this.afterPhasePersisted?.("completed");
  }

  private async resetForCandidateDrift(): Promise<void> {
    const record = this.active();
    if (["state-adopted", "queueing-next"].includes(record.phase))
      throw new Error(
        "Candidate drift cannot reset a reconciliation after state adoption.",
      );
    const candidate = candidateIdentity(
      this.repositoryRoot,
      record.candidateRevision,
    );
    const range = createCommitRangeManifest({
      repositoryRoot: this.repositoryRoot,
      reconciliationId: record.id,
      sourceVerifiedCommit: record.sourceVerifiedCommit,
      candidateCommit: candidate.commit,
      protectedPaths: this.stateValue.repository.protectedFiles.map(
        (file) => file.path,
      ),
    });
    const directory = resolve(
      this.repositoryRoot,
      RECONCILIATION_ROOT,
      record.id,
    );
    const rangeReference = await writeJsonArtifact(
      this.repositoryRoot,
      resolve(directory, "commit-range.json"),
      range,
    );
    const comparison = await protectedComparison({
      repositoryRoot: this.repositoryRoot,
      candidateCommit: candidate.commit,
      protectedFiles: this.stateValue.repository.protectedFiles,
      commitRange: range,
      outputPath: resolve(directory, "protected-comparison.json"),
    });
    const verificationManifest = await loadVerificationManifest(
      this.repositoryRoot,
    );
    if (
      verificationManifest.value.nextProposalPath !== record.nextProposal.path
    )
      throw new Error(
        "Candidate drift changed the tracked next-proposal boundary.",
      );
    const next = await trackedNextProposal({
      repositoryRoot: this.repositoryRoot,
      path: record.nextProposal.path,
    });
    const now = this.now().toISOString();
    const reset: ReconciliationRecord = {
      ...record,
      phase: "prepared",
      candidateCommit: candidate.commit,
      candidateTree: candidate.tree,
      commitRange: {
        ...rangeReference,
        commitCount: range.commitCount,
        recordsSha256: range.recordsSha256,
      },
      protectedComparison: comparison,
      nextProposal: next.reference,
      focusedEvidenceIndex: null,
      exactVerification: null,
      independentReview: null,
      adoption: null,
      previousPhase: record.phase,
      previousPhaseAt: record.currentPhaseAt,
      currentPhaseAt: now,
      phaseTimestamps: emptyPhaseTimestamps(now),
      failure: null,
    };
    assertCandidateUnchanged(this.repositoryRoot, reset);
    await this.persistActive(reset);
  }

  private async fail(
    error: unknown,
    classification: NonNullable<
      ReconciliationRecord["failure"]
    >["classification"],
  ): Promise<void> {
    const active = this.stateValue.reconciliation.active;
    if (!active) return;
    if (["state-adopted", "queueing-next"].includes(active.phase)) return;
    const now = this.now().toISOString();
    const failed = transitionRecord(active, "failed", now, {
      status: "failed",
      failure: {
        classification,
        message: redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
        evidence: [
          durableReference(active.sourceState),
          durableReference(active.commitRange),
          durableReference(active.protectedComparison),
          durableReference(active.benchmark),
          durableReference(active.artifactInventory),
          durableReference(active.nextProposal),
          ...(active.focusedEvidenceIndex
            ? [durableReference(active.focusedEvidenceIndex)]
            : []),
          ...(active.exactVerification
            ? [
                durableReference(active.exactVerification),
                durableReference(active.exactVerification.exactResult),
              ]
            : []),
          ...(active.independentReview
            ? [durableReference(active.independentReview)]
            : []),
          ...(active.adoption ? [durableReference(active.adoption)] : []),
        ],
      },
    });
    await this.persist({
      ...this.stateValue,
      reconciliation: {
        active: null,
        history: [...this.stateValue.reconciliation.history, failed],
      },
      nextAllowedAction: "reconcile",
    });
  }

  async run(
    invocation?: ReconciliationInvocation,
  ): Promise<ReconciliationStatusSummary> {
    const lock = await ControllerLease.acquire({
      repositoryRoot: this.repositoryRoot,
      statePath: this.config.statePath,
      operation: "reconcile",
    });
    try {
      const fresh = await this.store.load();
      if (!fresh)
        throw new Error(
          "Durable controller state disappeared before reconciliation could start.",
        );
      this.stateValue = fresh;
      if (invocation && !this.stateValue.reconciliation.active) {
        const proposalPath = safeRelative(
          this.repositoryRoot,
          invocation.nextProposalPath,
        );
        const current = candidateIdentity(
          this.repositoryRoot,
          invocation.candidate,
        );
        const completed = this.stateValue.reconciliation.history.find(
          (record) =>
            record.status === "completed" &&
            record.candidateCommit === current.commit &&
            record.candidateTree === current.tree &&
            record.nextProposal.path === proposalPath &&
            record.externalGapReason === invocation.reason,
        );
        if (completed) return this.status();
      }
      if (invocation) await this.prepare(invocation);
      else if (!this.stateValue.reconciliation.active)
        throw new Error("No active reconciliation exists to resume.");
      while (this.stateValue.reconciliation.active) {
        switch (this.active().phase) {
          case "prepared":
          case "verifying":
            await this.verify();
            break;
          case "candidate-verified":
          case "reviewing":
            await this.independentlyReview();
            break;
          case "review-approved":
          case "adopting":
            await this.adopt();
            break;
          case "state-adopted":
          case "queueing-next":
            await this.queueNext();
            break;
          case "completed":
          case "failed":
            throw new Error(
              "Terminal reconciliation cannot remain in the active slot.",
            );
        }
      }
      return this.status();
    } catch (error) {
      if (error instanceof ReconciliationInterruption) throw error;
      if (error instanceof CandidateDriftError) {
        await this.resetForCandidateDrift();
        throw error;
      }
      const classification =
        this.stateValue.reconciliation.active?.phase === "reviewing"
          ? "review"
          : error instanceof SyntaxError
            ? "infrastructure"
            : "policy";
      await this.fail(error, classification);
      throw error;
    } finally {
      await lock.release();
    }
  }
}

export async function hasActiveReconciliation(
  repositoryRoot: string,
  configPath?: string,
): Promise<boolean> {
  const controller = await ReconciliationController.open(
    repositoryRoot,
    configPath,
  );
  return controller.state.reconciliation.active !== null;
}
