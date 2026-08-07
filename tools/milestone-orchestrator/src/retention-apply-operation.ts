import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  type FileHandle,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import type {
  OrchestratorConfig,
  OrchestratorState,
  RetentionApplyBlockedClassification,
  RetentionApplyDeletion,
  RetentionApplyOperation,
  RetentionApplyRootName,
} from "./contracts.js";
import {
  assertEvidenceRetentionPlan,
  buildEvidenceRetentionPlan,
  captureRetentionCandidate,
  type EvidenceRetentionPlan,
  type EvidenceRetentionReport,
  type RetentionCandidate,
  type planManagedEvidenceRuns,
} from "./evidence-retention.js";
import {
  advanceRetentionApplyOperation,
  assertRetentionApplyContext,
  blockRetentionApplyOperation,
  completeRetentionApplyOperation,
  setRetentionApplyOperation,
} from "./operation-intent.js";
import {
  assertExistingContainedPath,
  removeContainedPath,
  strictlyContained,
} from "./path-safety.js";
import { type StateStore } from "./state-store.js";

export interface EvidenceRetentionApplyResult {
  readonly schemaVersion: "1.1.0";
  readonly operationId: string;
  readonly planPath: string;
  readonly planSha256: string;
  readonly applyDirectory: string;
  readonly journalPath: string;
  readonly deleted: readonly {
    readonly root: RetentionApplyRootName;
    readonly id: string;
    readonly path: string;
  }[];
  readonly skippedJournaledRunIds: readonly string[];
  readonly finishedAt: string;
}

export type RetentionApplyFaultPoint =
  | "after-intent-persisted"
  | "after-deletion-started-state"
  | "after-journal-deleting"
  | "after-run-deleted"
  | "after-journal-deleted"
  | "after-deletion-finished-state"
  | "after-result-written"
  | "after-result-state"
  | "after-completion-state";

export interface RetentionApplyHooks {
  readonly fault?: (
    point: RetentionApplyFaultPoint,
    operation: RetentionApplyOperation,
  ) => Promise<void> | void;
}

export type RetentionApplyRecoveryClassification =
  | "resume-delete"
  | "adopt-authorized-missing"
  | "repair-journal-prefix"
  | "materialize-result"
  | "complete-state"
  | RetentionApplyBlockedClassification;

export interface RetentionApplyRecoveryInspection {
  readonly operationId: string;
  readonly classification: RetentionApplyRecoveryClassification;
  readonly completedDeletionCount: number;
  readonly deletionCount: number;
  readonly currentDeletion: RetentionApplyDeletion | null;
  readonly preservedPaths: readonly string[];
  readonly nextSafeAction: string;
  readonly message: string;
}

export class RetentionApplyBlockedError extends Error {
  constructor(
    readonly operationId: string,
    message: string,
  ) {
    super(`Retention-apply operation ${operationId} is blocked: ${message}`);
    this.name = "RetentionApplyBlockedError";
  }
}

class RetentionRecoveryIssue extends Error {
  constructor(
    readonly classification: RetentionApplyBlockedClassification,
    message: string,
    readonly preservedPaths: readonly string[],
  ) {
    super(message);
    this.name = "RetentionRecoveryIssue";
  }
}

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function sameCandidate(
  left: RetentionCandidate,
  right: RetentionCandidate,
): boolean {
  return (
    left.commit === right.commit &&
    left.tree === right.tree &&
    left.dirty === right.dirty &&
    left.worktreeSha256 === right.worktreeSha256
  );
}

async function inspectRoot(
  repositoryRoot: string,
  configuredRoot: string,
  expectedRealpath: string,
): Promise<void> {
  if (!strictlyContained(repositoryRoot, configuredRoot))
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      `Retention root escapes the repository: ${configuredRoot}.`,
      [],
    );
  try {
    const metadata = await lstat(configuredRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new RetentionRecoveryIssue(
        "retention-root-unsafe",
        `Retention root is not a real directory: ${configuredRoot}.`,
        [configuredRoot],
      );
    const observed = await realpath(configuredRoot);
    if (observed !== expectedRealpath)
      throw new RetentionRecoveryIssue(
        "retention-root-unsafe",
        `Retention root moved (${expectedRealpath} -> ${observed}).`,
        [configuredRoot],
      );
  } catch (error) {
    if (error instanceof RetentionRecoveryIssue) throw error;
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      `Retention root cannot be inspected: ${configuredRoot}.`,
      missing(error) ? [] : [configuredRoot],
    );
  }
}

type DeletionInspection = "exact" | "missing" | "unsafe" | "identity-drift";

async function inspectDeletion(
  operation: RetentionApplyOperation,
  deletion: RetentionApplyDeletion,
): Promise<DeletionInspection> {
  const root =
    deletion.root === "verification"
      ? operation.verificationArtifactRoot
      : operation.controllerArtifactRoot;
  if (resolve(deletion.path) !== resolve(root, deletion.runId)) return "unsafe";
  try {
    const metadata = await lstat(deletion.path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return "unsafe";
    await assertExistingContainedPath(root, deletion.path);
    const manifestPath = resolve(
      deletion.path,
      deletion.root === "verification" ? "result.json" : "run-summary.json",
    );
    const manifestMetadata = await lstat(manifestPath);
    if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink())
      return "identity-drift";
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return "identity-drift";
    const manifest = parsed as Record<string, unknown>;
    const run =
      deletion.root === "controller" &&
      typeof manifest["run"] === "object" &&
      manifest["run"] !== null &&
      !Array.isArray(manifest["run"])
        ? (manifest["run"] as Record<string, unknown>)
        : manifest;
    const id = deletion.root === "verification" ? manifest["runId"] : run["id"];
    return id === deletion.runId && run["finishedAt"] === deletion.finishedAt
      ? "exact"
      : "identity-drift";
  } catch (error) {
    if (missing(error)) return "missing";
    if (error instanceof SyntaxError) return "identity-drift";
    return "unsafe";
  }
}

async function ensureSafeDirectoryChain(
  repositoryRoot: string,
  directory: string,
): Promise<void> {
  if (!strictlyContained(repositoryRoot, directory))
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      `Retention apply directory escapes the repository: ${directory}.`,
      [],
    );
  const repositoryMetadata = await lstat(repositoryRoot);
  if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink())
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      "Repository root is not a real directory.",
      [],
    );
  let current = repositoryRoot;
  for (const segment of relative(repositoryRoot, directory).split(sep)) {
    current = resolve(current, segment);
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new RetentionRecoveryIssue(
          "retention-root-unsafe",
          `Retention apply path contains a non-directory entry: ${current}.`,
          [current],
        );
    } catch (error) {
      if (!missing(error)) throw error;
      await mkdir(current);
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new RetentionRecoveryIssue(
          "retention-root-unsafe",
          `Retention apply path could not be created safely: ${current}.`,
          [current],
        );
    }
  }
}

interface RetentionJournalEntry {
  readonly schemaVersion: "1.0.0";
  readonly operationId: string;
  readonly planSha256: string;
  readonly event: "deleting" | "deleted";
  readonly ordinal: number;
  readonly root: RetentionApplyRootName;
  readonly runId: string;
  readonly path: string;
  readonly at: string;
}

interface RetentionJournalIdentity {
  readonly id: string;
  readonly planSha256: string;
  readonly createdAt: string;
  readonly completionAt: string;
}

function journalEntry(
  operation: RetentionJournalIdentity,
  deletion: RetentionApplyDeletion,
  event: RetentionJournalEntry["event"],
): RetentionJournalEntry {
  return {
    schemaVersion: "1.0.0",
    operationId: operation.id,
    planSha256: operation.planSha256,
    event,
    ordinal: deletion.ordinal,
    root: deletion.root,
    runId: deletion.runId,
    path: deletion.path,
    at: event === "deleting" ? operation.createdAt : operation.completionAt,
  };
}

function journalBytes(
  operation: RetentionJournalIdentity & {
    readonly deletions: readonly RetentionApplyDeletion[];
  },
  completedCount: number,
  currentEvent?: RetentionJournalEntry["event"],
): Buffer {
  const entries: RetentionJournalEntry[] = [];
  for (let index = 0; index < completedCount; index += 1) {
    const deletion = operation.deletions[index]!;
    entries.push(
      journalEntry(operation, deletion, "deleting"),
      journalEntry(operation, deletion, "deleted"),
    );
  }
  if (currentEvent) {
    const deletion = operation.deletions[completedCount]!;
    entries.push(journalEntry(operation, deletion, "deleting"));
    if (currentEvent === "deleted")
      entries.push(journalEntry(operation, deletion, "deleted"));
  }
  return Buffer.from(
    entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
    "utf8",
  );
}

async function writeAll(handle: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
    );
    if (bytesWritten === 0)
      throw new Error("A retention evidence write made no progress.");
    offset += bytesWritten;
  }
}

async function assertSafeDirectoryChain(
  repositoryRoot: string,
  directory: string,
): Promise<void> {
  if (!strictlyContained(repositoryRoot, directory))
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      `Retention apply directory escapes the repository: ${directory}.`,
      [],
    );
  const rootMetadata = await lstat(repositoryRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      "Repository root is not a real directory.",
      [],
    );
  let current = repositoryRoot;
  for (const segment of relative(repositoryRoot, directory).split(sep)) {
    current = resolve(current, segment);
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new RetentionRecoveryIssue(
          "retention-root-unsafe",
          `Retention apply path contains a non-directory entry: ${current}.`,
          [current],
        );
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
  }
}

async function optionalRegularFile(path: string): Promise<Buffer | null> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error(`Expected a real regular file: ${path}.`);
    return await readFile(path);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

function journalBounds(operation: RetentionApplyOperation): {
  readonly desired: Buffer;
  readonly maximum: Buffer;
} {
  if (operation.phase === "deletion-started")
    return {
      desired: journalBytes(
        operation,
        operation.completedDeletionCount,
        "deleting",
      ),
      maximum: journalBytes(
        operation,
        operation.completedDeletionCount,
        "deleted",
      ),
    };
  const exact = journalBytes(operation, operation.completedDeletionCount);
  return { desired: exact, maximum: exact };
}

async function journalPrefixStatus(
  operation: RetentionApplyOperation,
): Promise<"exact" | "prefix" | "ahead" | "conflict"> {
  let actual: Buffer;
  try {
    actual =
      (await optionalRegularFile(operation.journalPath)) ?? Buffer.alloc(0);
  } catch {
    return "conflict";
  }
  const { desired, maximum } = journalBounds(operation);
  if (!maximum.subarray(0, actual.length).equals(actual)) return "conflict";
  if (actual.length === desired.length) return "exact";
  return actual.length < desired.length ? "prefix" : "ahead";
}

async function convergeJournal(
  operation: RetentionApplyOperation,
  desired: Buffer,
  maximum: Buffer = desired,
): Promise<void> {
  let actual: Buffer;
  try {
    actual =
      (await optionalRegularFile(operation.journalPath)) ?? Buffer.alloc(0);
  } catch (_error) {
    throw new RetentionRecoveryIssue(
      "journal-conflict",
      `Retention journal is not a regular file: ${operation.journalPath}.`,
      [operation.journalPath],
    );
  }
  if (!maximum.subarray(0, actual.length).equals(actual))
    throw new RetentionRecoveryIssue(
      "journal-conflict",
      "Retention journal is not an exact operation-derived prefix.",
      [operation.journalPath],
    );
  if (actual.length >= desired.length) return;
  if (!desired.subarray(0, actual.length).equals(actual))
    throw new RetentionRecoveryIssue(
      "journal-conflict",
      "Retention journal diverges before the next canonical append.",
      [operation.journalPath],
    );
  await ensureSafeDirectoryChain(
    operation.repositoryRoot,
    dirname(operation.journalPath),
  );
  const handle = await open(operation.journalPath, "a");
  try {
    await writeAll(handle, desired.subarray(actual.length));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function retentionResult(
  operation: RetentionApplyOperation,
): EvidenceRetentionApplyResult {
  return {
    schemaVersion: "1.1.0",
    operationId: operation.id,
    planPath: operation.planPath,
    planSha256: operation.planSha256,
    applyDirectory: operation.applyDirectory,
    journalPath: operation.journalPath,
    deleted: operation.deletions.map((deletion) => ({
      root: deletion.root,
      id: deletion.runId,
      path: deletion.path,
    })),
    skippedJournaledRunIds: [],
    finishedAt: operation.completionAt,
  };
}

function resultBytes(operation: RetentionApplyOperation): Buffer {
  return Buffer.from(
    `${JSON.stringify(retentionResult(operation), null, 2)}\n`,
  );
}

async function resultStatus(
  operation: RetentionApplyOperation,
): Promise<"missing" | "exact" | "conflict"> {
  try {
    const actual = await optionalRegularFile(operation.resultPath);
    if (actual === null) return "missing";
    return actual.equals(resultBytes(operation)) ? "exact" : "conflict";
  } catch {
    return "conflict";
  }
}

async function materializeResult(
  operation: RetentionApplyOperation,
): Promise<void> {
  const status = await resultStatus(operation);
  if (status === "exact") return;
  if (status === "conflict")
    throw new RetentionRecoveryIssue(
      "result-conflict",
      "Retention result path conflicts with the exact operation result.",
      [operation.resultPath],
    );
  await ensureSafeDirectoryChain(
    operation.repositoryRoot,
    dirname(operation.resultPath),
  );
  let handle;
  try {
    handle = await open(operation.resultPath, "wx");
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    ))
      throw error;
    if ((await resultStatus(operation)) === "exact") return;
    throw new RetentionRecoveryIssue(
      "result-conflict",
      "Retention result appeared with conflicting bytes.",
      [operation.resultPath],
    );
  }
  try {
    await writeAll(handle, resultBytes(operation));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function sectionFor(
  plan: EvidenceRetentionPlan,
  root: RetentionApplyRootName,
): EvidenceRetentionReport {
  return root === "verification" ? plan.verificationRuns : plan.controllerRuns;
}

function exactPlannedDeletion(
  section: EvidenceRetentionReport,
  deletion: RetentionApplyDeletion,
): boolean {
  return section.plannedDeletions.some(
    (entry) =>
      entry.id === deletion.runId &&
      resolve(entry.path) === resolve(deletion.path) &&
      entry.finishedAt === deletion.finishedAt,
  );
}

async function assertOperationRoots(
  operation: RetentionApplyOperation,
): Promise<void> {
  const expectedApplyDirectory = resolve(
    operation.repositoryRoot,
    "artifacts",
    "orchestrator",
    "retention",
    "apply",
    operation.planSha256,
  );
  if (
    operation.id !== `retention-apply-${operation.planSha256}` ||
    operation.applyDirectory !== expectedApplyDirectory ||
    operation.journalPath !==
      resolve(expectedApplyDirectory, "journal.jsonl") ||
    operation.resultPath !==
      resolve(expectedApplyDirectory, "apply-result.json")
  )
    throw new RetentionRecoveryIssue(
      "retention-root-unsafe",
      "Retention operation identity or apply paths are non-canonical.",
      [],
    );
  await Promise.all([
    inspectRoot(
      operation.repositoryRoot,
      operation.verificationArtifactRoot,
      operation.verificationArtifactRootRealpath,
    ),
    inspectRoot(
      operation.repositoryRoot,
      operation.controllerArtifactRoot,
      operation.controllerArtifactRootRealpath,
    ),
  ]);
  await assertSafeDirectoryChain(
    operation.repositoryRoot,
    operation.applyDirectory,
  );
}

async function assertRecoveryWorld(input: {
  readonly operation: RetentionApplyOperation;
  readonly state: OrchestratorState;
  readonly config: OrchestratorConfig;
  readonly now: string;
  readonly planner?: typeof planManagedEvidenceRuns;
}): Promise<void> {
  const operation = input.operation;
  const verificationRoot = resolve(
    operation.repositoryRoot,
    input.config.evidenceRetention.artifactRoot,
  );
  const controllerRoot = resolve(
    operation.repositoryRoot,
    input.config.artifactRoot,
  );
  if (
    input.config.evidenceRetention.keepRecentRuns !==
      operation.keepRecentRuns ||
    verificationRoot !== operation.verificationArtifactRoot ||
    controllerRoot !== operation.controllerArtifactRoot
  )
    throw new RetentionRecoveryIssue(
      "config-drift",
      "Retention configuration changed after approval.",
      [],
    );
  const candidate = captureRetentionCandidate(operation.repositoryRoot);
  if (!sameCandidate(candidate, operation.candidate))
    throw new RetentionRecoveryIssue(
      "candidate-drift",
      "Repository candidate bytes changed after retention approval.",
      [],
    );
  await assertOperationRoots(operation);
  const projectedState: OrchestratorState = {
    ...input.state,
    pendingOperation: null,
  };
  const fresh = await buildEvidenceRetentionPlan({
    repositoryRoot: operation.repositoryRoot,
    config: input.config,
    state: projectedState,
    now: input.now,
    ...(input.planner ? { planner: input.planner } : {}),
  });
  for (const root of ["verification", "controller"] as const) {
    const section = sectionFor(fresh, root);
    if (section.suspended)
      throw new RetentionRecoveryIssue(
        "eligibility-drift",
        `Retention suspension appeared on ${root}: ${section.suspensionReasons.join(", ")}.`,
        [],
      );
    const originalObserved =
      root === "verification"
        ? operation.verificationObservedRunIds
        : operation.controllerObservedRunIds;
    const authorizedMissing = new Set(
      operation.deletions
        .filter(
          (deletion) =>
            deletion.root === root &&
            (deletion.ordinal < operation.completedDeletionCount ||
              (operation.phase === "deletion-started" &&
                deletion.ordinal === operation.completedDeletionCount)),
        )
        .map((deletion) => deletion.runId),
    );
    for (const id of originalObserved)
      if (!section.observedRunIds.includes(id) && !authorizedMissing.has(id))
        throw new RetentionRecoveryIssue(
          "eligibility-drift",
          `Unapproved evidence disappearance changed the ${root} inventory: ${id}.`,
          [],
        );
  }
  for (
    let index = operation.completedDeletionCount;
    index < operation.deletions.length;
    index += 1
  ) {
    const deletion = operation.deletions[index]!;
    const observed = await inspectDeletion(operation, deletion);
    const authorizedMissing =
      operation.phase === "deletion-started" &&
      index === operation.completedDeletionCount &&
      observed === "missing";
    if (observed === "unsafe" || observed === "identity-drift")
      throw new RetentionRecoveryIssue(
        "run-path-unsafe",
        `Retention target no longer has its exact approved identity: ${deletion.path}.`,
        [deletion.path],
      );
    if (observed === "missing" && !authorizedMissing)
      throw new RetentionRecoveryIssue(
        "premature-run-missing",
        `Retention target disappeared before canonical delete authorization: ${deletion.path}.`,
        [],
      );
    if (!authorizedMissing) {
      const section = sectionFor(fresh, deletion.root);
      if (
        section.citedRunIds.includes(deletion.runId) ||
        (!exactPlannedDeletion(section, deletion) &&
          !section.recentRunIds.includes(deletion.runId))
      )
        throw new RetentionRecoveryIssue(
          "eligibility-drift",
          `Retention target is no longer eligible: ${deletion.root}:${deletion.runId}.`,
          [deletion.path],
        );
    }
  }
}

function operationDeletions(
  plan: EvidenceRetentionPlan,
): RetentionApplyDeletion[] {
  const deletions: RetentionApplyDeletion[] = [];
  for (const [root, section] of [
    ["verification", plan.verificationRuns],
    ["controller", plan.controllerRuns],
  ] as const)
    for (const deletion of section.plannedDeletions)
      deletions.push({
        ordinal: deletions.length,
        root,
        runId: deletion.id,
        path: resolve(deletion.path),
        finishedAt: deletion.finishedAt,
      });
  return deletions;
}

export async function planRetentionApplyOperation(input: {
  readonly repositoryRoot: string;
  readonly planPath: string;
  readonly expectedSha256: string;
  readonly config: OrchestratorConfig;
  readonly state: OrchestratorState;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly now: string;
  readonly planner?: typeof planManagedEvidenceRuns;
}): Promise<RetentionApplyOperation> {
  if (input.state.pendingOperation !== null)
    throw new Error(
      `Retention apply cannot start while operation ${input.state.pendingOperation.id} is pending.`,
    );
  if (input.state.reconciliation.active !== null)
    throw new Error(
      "Retention apply refuses while a controller reconciliation is active; nothing was deleted.",
    );
  if (input.state.run.status === "running")
    throw new Error(
      "Retention apply refuses while a controller run is active; nothing was deleted.",
    );
  if (input.state.run.status === "escalated")
    throw new Error(
      "Retention apply refuses while escalated controller history is unresolved; nothing was deleted.",
    );
  if (input.state.evidenceRetention.initializedAt === null)
    throw new Error("Retention apply requires initialized retention state.");
  const planBytes = await readFile(input.planPath);
  const planSha256 = createHash("sha256").update(planBytes).digest("hex");
  const expected = input.expectedSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected) || planSha256 !== expected)
    throw new Error(
      `Retention plan hash mismatch: the approved token ${expected} does not match the plan file (${planSha256}); nothing was deleted.`,
    );
  const plan = assertEvidenceRetentionPlan(
    JSON.parse(planBytes.toString("utf8")) as unknown,
  );
  if (
    plan.controller.verifiedCommit !== input.state.repository.verifiedCommit ||
    plan.controller.runStatus !== input.state.run.status ||
    plan.controller.runId !== input.state.run.id
  )
    throw new Error(
      "Retention apply refused: controller state advanced since approval; re-plan and re-approve.",
    );
  if (
    plan.config.keepRecentRuns !== input.config.evidenceRetention.keepRecentRuns
  )
    throw new Error(
      "Retention apply refused: configuration changed; re-plan and re-approve.",
    );
  const candidate = captureRetentionCandidate(input.repositoryRoot);
  if (!sameCandidate(candidate, plan.candidate))
    throw new Error(
      "Retention apply refused: repository candidate bytes advanced since approval; re-plan and re-approve.",
    );
  const fresh = await buildEvidenceRetentionPlan({
    repositoryRoot: input.repositoryRoot,
    config: input.config,
    state: input.state,
    now: input.now,
    ...(input.planner ? { planner: input.planner } : {}),
  });
  const verificationRoot = resolve(
    input.repositoryRoot,
    input.config.evidenceRetention.artifactRoot,
  );
  const controllerRoot = resolve(
    input.repositoryRoot,
    input.config.artifactRoot,
  );
  for (const [root, planned, current, configuredRoot] of [
    [
      "verification",
      plan.verificationRuns,
      fresh.verificationRuns,
      verificationRoot,
    ],
    ["controller", plan.controllerRuns, fresh.controllerRuns, controllerRoot],
  ] as const) {
    if (
      resolve(planned.artifactRoot) !== configuredRoot ||
      planned.artifactRootRealpath !== current.artifactRootRealpath ||
      current.suspended
    )
      throw new Error(
        `Retention apply refused: ${root} root or suspension state diverged; re-plan and re-approve.`,
      );
    for (const deletion of planned.plannedDeletions)
      if (
        !current.plannedDeletions.some(
          (entry) =>
            entry.id === deletion.id &&
            resolve(entry.path) === resolve(deletion.path) &&
            entry.finishedAt === deletion.finishedAt,
        )
      )
        throw new Error(
          `Retention apply refused: exact target is no longer eligible: ${root}:${deletion.id}; re-plan and re-approve.`,
        );
  }
  const deletions = operationDeletions(plan);
  const applyDirectory = resolve(
    input.repositoryRoot,
    "artifacts",
    "orchestrator",
    "retention",
    "apply",
    expected,
  );
  const operation: RetentionApplyOperation = {
    schemaVersion: "1.0.0",
    kind: "retention-apply",
    id: `retention-apply-${expected}`,
    inputStateGeneration: input.inputStateGeneration,
    inputStateRevision: input.inputStateRevision,
    repositoryRoot: resolve(input.repositoryRoot),
    targetBranch: input.state.repository.targetBranch,
    verifiedCommit: input.state.repository.verifiedCommit,
    runStatus: input.state.run.status,
    runId: input.state.run.id,
    retentionInitializedAt: input.state.evidenceRetention.initializedAt,
    previousLastPrunedAt: input.state.evidenceRetention.lastPrunedAt,
    previousLastReportPath: input.state.evidenceRetention.lastReportPath,
    planPath: resolve(input.planPath),
    planSha256: expected,
    planBytes: planBytes.length,
    planGeneratedAt: plan.generatedAt,
    candidate: plan.candidate,
    keepRecentRuns: plan.config.keepRecentRuns,
    verificationArtifactRoot: verificationRoot,
    verificationArtifactRootRealpath:
      plan.verificationRuns.artifactRootRealpath,
    verificationObservedRunIds: plan.verificationRuns.observedRunIds,
    controllerArtifactRoot: controllerRoot,
    controllerArtifactRootRealpath: plan.controllerRuns.artifactRootRealpath,
    controllerObservedRunIds: plan.controllerRuns.observedRunIds,
    applyDirectory,
    journalPath: resolve(applyDirectory, "journal.jsonl"),
    resultPath: resolve(applyDirectory, "apply-result.json"),
    deletions,
    phase: "intent-persisted",
    completedDeletionCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
    completionAt: input.now,
    recoveryPolicy: "validate-resume-or-preserve",
    diagnostic: null,
  };
  await assertOperationRoots(operation);
  for (const deletion of deletions) {
    const inspection = await inspectDeletion(operation, deletion);
    if (inspection !== "exact")
      throw new Error(
        `Retention apply refused: target failed exact preflight (${inspection}): ${deletion.path}; nothing was deleted.`,
      );
  }
  return operation;
}

export async function inspectRetentionApplyOperation(
  operation: RetentionApplyOperation,
): Promise<RetentionApplyRecoveryInspection> {
  if (operation.phase === "blocked")
    return {
      operationId: operation.id,
      classification: operation.diagnostic!.classification,
      completedDeletionCount: operation.completedDeletionCount,
      deletionCount: operation.deletions.length,
      currentDeletion: null,
      preservedPaths: operation.diagnostic!.preservedPaths,
      nextSafeAction: "manual-reconciliation-required",
      message: operation.diagnostic!.message,
    };
  try {
    await assertOperationRoots(operation);
    const journal = await journalPrefixStatus(operation);
    if (journal === "conflict")
      throw new RetentionRecoveryIssue(
        "journal-conflict",
        "Retention journal conflicts with the canonical operation sequence.",
        [operation.journalPath],
      );
    const result = await resultStatus(operation);
    if (result === "conflict")
      throw new RetentionRecoveryIssue(
        "result-conflict",
        "Retention result conflicts with the canonical operation result.",
        [operation.resultPath],
      );
    if (
      result === "exact" &&
      operation.completedDeletionCount < operation.deletions.length
    )
      throw new RetentionRecoveryIssue(
        "result-conflict",
        "Retention result exists before all canonical deletions completed.",
        [operation.resultPath],
      );
    for (let index = 0; index < operation.deletions.length; index += 1) {
      const deletion = operation.deletions[index]!;
      const target = await inspectDeletion(operation, deletion);
      if (index < operation.completedDeletionCount && target !== "missing")
        throw new RetentionRecoveryIssue(
          "eligibility-drift",
          "A canonically deleted evidence path reappeared.",
          [deletion.path],
        );
      if (index > operation.completedDeletionCount && target !== "exact")
        throw new RetentionRecoveryIssue(
          target === "missing" ? "premature-run-missing" : "run-path-unsafe",
          "A future retention target no longer has its approved identity.",
          target === "missing" ? [] : [deletion.path],
        );
      if (
        index === operation.completedDeletionCount &&
        operation.phase !== "deletion-started" &&
        index < operation.deletions.length &&
        target !== "exact"
      )
        throw new RetentionRecoveryIssue(
          target === "missing" ? "premature-run-missing" : "run-path-unsafe",
          "The next retention target no longer has its approved identity.",
          target === "missing" ? [] : [deletion.path],
        );
    }
    const current =
      operation.deletions[operation.completedDeletionCount] ?? null;
    if (operation.phase === "result-written")
      return {
        operationId: operation.id,
        classification: "complete-state",
        completedDeletionCount: operation.completedDeletionCount,
        deletionCount: operation.deletions.length,
        currentDeletion: null,
        preservedPaths: [operation.resultPath, operation.journalPath],
        nextSafeAction: "complete-retention-state",
        message: "Exact retention result is ready for canonical completion.",
      };
    if (operation.completedDeletionCount === operation.deletions.length)
      return {
        operationId: operation.id,
        classification: "materialize-result",
        completedDeletionCount: operation.completedDeletionCount,
        deletionCount: operation.deletions.length,
        currentDeletion: null,
        preservedPaths: result === "exact" ? [operation.resultPath] : [],
        nextSafeAction: "materialize-exact-result",
        message:
          "All approved deletions are canonical; materialize the result.",
      };
    const target = current
      ? await inspectDeletion(operation, current)
      : "missing";
    const classification =
      operation.phase === "deletion-started" && target === "missing"
        ? "adopt-authorized-missing"
        : journal !== "exact"
          ? "repair-journal-prefix"
          : "resume-delete";
    return {
      operationId: operation.id,
      classification,
      completedDeletionCount: operation.completedDeletionCount,
      deletionCount: operation.deletions.length,
      currentDeletion: current,
      preservedPaths: current && target === "exact" ? [current.path] : [],
      nextSafeAction:
        operation.phase === "deletion-started"
          ? "finish-authorized-deletion"
          : "publish-delete-authorization",
      message: "Retention apply can resume from canonical state.",
    };
  } catch (error) {
    const issue =
      error instanceof RetentionRecoveryIssue
        ? error
        : new RetentionRecoveryIssue(
            "run-path-unsafe",
            error instanceof Error ? error.message : String(error),
            [],
          );
    return {
      operationId: operation.id,
      classification: issue.classification,
      completedDeletionCount: operation.completedDeletionCount,
      deletionCount: operation.deletions.length,
      currentDeletion:
        operation.deletions[operation.completedDeletionCount] ?? null,
      preservedPaths: issue.preservedPaths,
      nextSafeAction: "manual-reconciliation-required",
      message: issue.message,
    };
  }
}

export async function recoverRetentionApplyOperation(input: {
  readonly state: OrchestratorState;
  readonly config: OrchestratorConfig;
  readonly persist: (next: OrchestratorState) => Promise<OrchestratorState>;
  readonly now: () => string;
  readonly planner?: typeof planManagedEvidenceRuns;
  readonly hooks?: RetentionApplyHooks;
}): Promise<{
  readonly state: OrchestratorState;
  readonly result: EvidenceRetentionApplyResult;
}> {
  let state = input.state;
  const block = async (issue: RetentionRecoveryIssue): Promise<never> => {
    const operation = state.pendingOperation;
    if (!operation || operation.kind !== "retention-apply") throw issue;
    state = await input.persist(
      blockRetentionApplyOperation(state, operation.id, {
        classification: issue.classification,
        message: issue.message,
        observedAt: input.now(),
        preservedPaths: issue.preservedPaths,
        quarantinePath: null,
      }),
    );
    throw new RetentionApplyBlockedError(operation.id, issue.message);
  };
  while (state.pendingOperation?.kind === "retention-apply") {
    const operation = state.pendingOperation;
    if (operation.phase === "blocked")
      throw new RetentionApplyBlockedError(
        operation.id,
        operation.diagnostic?.message ?? "manual reconciliation is required",
      );
    try {
      assertRetentionApplyContext(state, operation);
      await assertRecoveryWorld({
        operation,
        state,
        config: input.config,
        now: input.now(),
        ...(input.planner ? { planner: input.planner } : {}),
      });
      const inspection = await inspectRetentionApplyOperation(operation);
      if (
        [
          "candidate-drift",
          "config-drift",
          "eligibility-drift",
          "journal-conflict",
          "premature-run-missing",
          "result-conflict",
          "retention-root-unsafe",
          "run-path-unsafe",
        ].includes(inspection.classification)
      )
        await block(
          new RetentionRecoveryIssue(
            inspection.classification as RetentionApplyBlockedClassification,
            inspection.message,
            inspection.preservedPaths,
          ),
        );
      if (operation.phase === "intent-persisted") {
        if (operation.deletions.length === 0) {
          await materializeResult(operation);
          await input.hooks?.fault?.("after-result-written", operation);
          state = await input.persist(
            advanceRetentionApplyOperation(
              state,
              operation.id,
              "result-written",
              0,
              operation.completionAt,
            ),
          );
          await input.hooks?.fault?.(
            "after-result-state",
            state.pendingOperation as RetentionApplyOperation,
          );
          continue;
        }
        state = await input.persist(
          advanceRetentionApplyOperation(
            state,
            operation.id,
            "deletion-started",
            0,
            operation.createdAt,
          ),
        );
        await input.hooks?.fault?.(
          "after-deletion-started-state",
          state.pendingOperation as RetentionApplyOperation,
        );
        continue;
      }
      if (operation.phase === "deletion-finished") {
        await convergeJournal(
          operation,
          journalBytes(operation, operation.completedDeletionCount),
        );
        if (operation.completedDeletionCount < operation.deletions.length) {
          state = await input.persist(
            advanceRetentionApplyOperation(
              state,
              operation.id,
              "deletion-started",
              operation.completedDeletionCount,
              operation.updatedAt,
            ),
          );
          await input.hooks?.fault?.(
            "after-deletion-started-state",
            state.pendingOperation as RetentionApplyOperation,
          );
          continue;
        }
        await materializeResult(operation);
        await input.hooks?.fault?.("after-result-written", operation);
        state = await input.persist(
          advanceRetentionApplyOperation(
            state,
            operation.id,
            "result-written",
            operation.completedDeletionCount,
            operation.completionAt,
          ),
        );
        await input.hooks?.fault?.(
          "after-result-state",
          state.pendingOperation as RetentionApplyOperation,
        );
        continue;
      }
      if (operation.phase === "deletion-started") {
        const deletion = operation.deletions[operation.completedDeletionCount]!;
        const deleting = journalBytes(
          operation,
          operation.completedDeletionCount,
          "deleting",
        );
        const deleted = journalBytes(
          operation,
          operation.completedDeletionCount,
          "deleted",
        );
        await convergeJournal(operation, deleting, deleted);
        await input.hooks?.fault?.("after-journal-deleting", operation);
        const target = await inspectDeletion(operation, deletion);
        if (target === "exact") {
          const containmentRoot =
            deletion.root === "verification"
              ? operation.verificationArtifactRoot
              : operation.controllerArtifactRoot;
          await removeContainedPath(containmentRoot, deletion.path);
          await input.hooks?.fault?.("after-run-deleted", operation);
        } else if (target !== "missing") {
          await block(
            new RetentionRecoveryIssue(
              "run-path-unsafe",
              `Authorized retention target is no longer exact: ${deletion.path}.`,
              [deletion.path],
            ),
          );
        }
        await convergeJournal(operation, deleted);
        await input.hooks?.fault?.("after-journal-deleted", operation);
        state = await input.persist(
          advanceRetentionApplyOperation(
            state,
            operation.id,
            "deletion-finished",
            operation.completedDeletionCount + 1,
            operation.completionAt,
          ),
        );
        await input.hooks?.fault?.(
          "after-deletion-finished-state",
          state.pendingOperation as RetentionApplyOperation,
        );
        continue;
      }
      if (operation.phase === "result-written") {
        await convergeJournal(
          operation,
          journalBytes(operation, operation.completedDeletionCount),
        );
        await materializeResult(operation);
        const result = retentionResult(operation);
        state = await input.persist(
          completeRetentionApplyOperation(state, operation.id),
        );
        await input.hooks?.fault?.("after-completion-state", operation);
        return { state, result };
      }
    } catch (error) {
      if (
        error instanceof RetentionApplyBlockedError ||
        !(state.pendingOperation?.kind === "retention-apply")
      )
        throw error;
      if (error instanceof RetentionRecoveryIssue) await block(error);
      throw error;
    }
  }
  throw new Error("Retention apply recovery lost its pending operation.");
}

export async function applyEvidenceRetentionPlan(input: {
  readonly repositoryRoot: string;
  readonly planPath: string;
  readonly expectedSha256: string;
  readonly config: OrchestratorConfig;
  readonly store: StateStore;
  readonly now: string;
  readonly planner?: typeof planManagedEvidenceRuns;
  readonly hooks?: RetentionApplyHooks;
}): Promise<EvidenceRetentionApplyResult> {
  let state = await input.store.loadForMutation();
  if (!state)
    throw new Error("Retention apply requires initialized controller state.");
  const expectedSha256 = input.expectedSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha256))
    throw new Error("Retention apply requires a 64-character SHA-256 token.");
  const completedDirectory = resolve(
    input.repositoryRoot,
    "artifacts",
    "orchestrator",
    "retention",
    "apply",
    expectedSha256,
  );
  const completedResultPath = resolve(completedDirectory, "apply-result.json");
  if (
    state.pendingOperation === null &&
    state.evidenceRetention.lastReportPath === completedResultPath
  ) {
    const planBytes = await readFile(input.planPath);
    if (createHash("sha256").update(planBytes).digest("hex") !== expectedSha256)
      throw new Error(
        "Completed retention retry does not match the approved plan bytes.",
      );
    const plan = assertEvidenceRetentionPlan(
      JSON.parse(planBytes.toString("utf8")) as unknown,
    );
    const finishedAt = state.evidenceRetention.lastPrunedAt;
    if (finishedAt === null)
      throw new Error(
        "Completed retention state is missing its canonical completion time.",
      );
    const operationId = `retention-apply-${expectedSha256}`;
    const journalPath = resolve(completedDirectory, "journal.jsonl");
    const deletions = operationDeletions(plan);
    const expectedResult: EvidenceRetentionApplyResult = {
      schemaVersion: "1.1.0",
      operationId,
      planPath: resolve(input.planPath),
      planSha256: expectedSha256,
      applyDirectory: completedDirectory,
      journalPath,
      deleted: deletions.map((deletion) => ({
        root: deletion.root,
        id: deletion.runId,
        path: deletion.path,
      })),
      skippedJournaledRunIds: [],
      finishedAt,
    };
    await assertSafeDirectoryChain(input.repositoryRoot, completedDirectory);
    const [actualResult, actualJournal] = await Promise.all([
      optionalRegularFile(completedResultPath),
      optionalRegularFile(journalPath),
    ]);
    const expectedResultBytes = Buffer.from(
      `${JSON.stringify(expectedResult, null, 2)}\n`,
    );
    const expectedJournalBytes = journalBytes(
      {
        id: operationId,
        planSha256: expectedSha256,
        createdAt: finishedAt,
        completionAt: finishedAt,
        deletions,
      },
      deletions.length,
    );
    if (
      actualResult === null ||
      !actualResult.equals(expectedResultBytes) ||
      !(actualJournal ?? Buffer.alloc(0)).equals(expectedJournalBytes)
    )
      throw new Error(
        "Completed retention evidence conflicts with the exact approved result or journal.",
      );
    return expectedResult;
  }
  const persist = async (
    next: OrchestratorState,
  ): Promise<OrchestratorState> => {
    state = await input.store.save(next);
    return state;
  };
  if (state.pendingOperation?.kind === "retention-apply") {
    if (
      state.pendingOperation.planPath !== resolve(input.planPath) ||
      state.pendingOperation.planSha256 !== expectedSha256
    )
      throw new Error(
        `Retention apply ${state.pendingOperation.id} is already pending with a different approval.`,
      );
  } else {
    const generation = input.store.mutationGeneration();
    const operation = await planRetentionApplyOperation({
      repositoryRoot: input.repositoryRoot,
      planPath: resolve(input.planPath),
      expectedSha256: input.expectedSha256,
      config: input.config,
      state,
      inputStateGeneration: generation.objectId,
      inputStateRevision: generation.revision,
      now: input.now,
      ...(input.planner ? { planner: input.planner } : {}),
    });
    state = await persist(setRetentionApplyOperation(state, operation));
    await input.hooks?.fault?.("after-intent-persisted", operation);
  }
  return (
    await recoverRetentionApplyOperation({
      state,
      config: input.config,
      persist,
      now: () => input.now,
      ...(input.planner ? { planner: input.planner } : {}),
      ...(input.hooks ? { hooks: input.hooks } : {}),
    })
  ).result;
}
