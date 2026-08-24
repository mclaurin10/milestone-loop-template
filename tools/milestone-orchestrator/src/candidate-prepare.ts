import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  candidateIdentitiesEqual,
  candidateIdentityFrom,
} from "./candidate-identity.js";
import type {
  CandidatePrepareBlockedClassification,
  CandidatePrepareCheckpointPlan,
  CandidatePrepareCheckpointResult,
  CandidatePrepareOperation,
  MilestoneRecord,
  OrchestratorState,
  ProtectedFileRecord,
} from "./contracts.js";
import {
  assertProtectedFiles,
  inspectAttempt,
  stageWorkingChanges,
  workingChangedPaths,
} from "./git-isolation.js";
import { canonicalJson } from "./package-graph.js";
import { strictlyContained } from "./path-safety.js";
import { enforceDiffPolicy } from "./policy.js";

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export const CANDIDATE_PREPARE_FAULT_POINTS = [
  "after-intent-persisted",
  "after-worker-invocation-started-state",
  "after-worker-thread-recorded-state",
  "after-worker-gateway-return",
  "after-worker-completed-state",
  "before-worker-evidence-publish",
  "after-worker-evidence-artifact",
  "after-worker-evidence-recorded-state",
  "after-checkpoint-staging",
  "after-checkpoint-prepared-state",
  "after-checkpoint-commit",
  "after-checkpoint-committed-state",
  "before-checkpoint-evidence-publish",
  "after-checkpoint-artifact",
  "after-checkpoint-recorded-state",
  "after-completion-state",
] as const;
export type CandidatePrepareFaultPoint =
  (typeof CANDIDATE_PREPARE_FAULT_POINTS)[number];

export interface CandidatePrepareHooks {
  readonly fault?: (
    point: CandidatePrepareFaultPoint,
    operation: CandidatePrepareOperation,
  ) => void | Promise<void>;
}

export type CandidatePreparePreflightClassification =
  "evidence-path-unsafe" | "unowned-evidence";

export class CandidatePreparePreflightBlockedError extends Error {
  constructor(
    readonly classification: CandidatePreparePreflightClassification,
    message: string,
    readonly preservedPaths: readonly string[],
  ) {
    super(message);
    this.name = "CandidatePreparePreflightBlockedError";
  }
}

export type CandidatePrepareRecoveryClassification =
  | "worker-resume-ready"
  | "worker-evidence-missing"
  | "worker-evidence-ready"
  | "checkpoint-plan-ready"
  | "checkpoint-commit-ready"
  | "checkpoint-commit-adoptable"
  | "checkpoint-evidence-missing"
  | "checkpoint-evidence-ready"
  | "candidate-completion-ready"
  | CandidatePrepareBlockedClassification;

export interface CandidatePrepareRecoveryInspection {
  readonly operationId: string;
  readonly classification: CandidatePrepareRecoveryClassification;
  readonly disposition: "automatic" | "manual";
  readonly nextSafeAction:
    | "resume-worker"
    | "materialize-worker-evidence"
    | "record-worker-evidence"
    | "prepare-checkpoint"
    | "resume-checkpoint-commit"
    | "adopt-checkpoint-commit"
    | "materialize-checkpoint-evidence"
    | "record-checkpoint-evidence"
    | "complete-candidate"
    | "manual-reconciliation-required";
  readonly message: string;
  readonly observedHead: string | null;
  readonly preservedPaths: readonly string[];
  readonly checkpointResult: CandidatePrepareCheckpointResult | null;
}

function git(
  repository: string,
  args: readonly string[],
  allowFailure = false,
): GitResult {
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", repository, ...args],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  if (result.error) throw result.error;
  const output = {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  if (!allowFailure && output.status !== 0)
    throw new Error(
      `Git command failed (${args.join(" ")}): ${output.stderr || output.stdout}`,
    );
  return output;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function candidatePrepareContextSha256(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function candidatePrepareArtifactBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function candidatePrepareArtifactSha256(value: unknown): string {
  return sha256(candidatePrepareArtifactBytes(value));
}

export function candidatePrepareWorkerTurnArtifact(
  operation: CandidatePrepareOperation,
): unknown {
  const result = operation.workerResult;
  if (!result || result.finalResponse === null)
    throw new Error(
      "Candidate Worker evidence requires a canonical Worker response.",
    );
  return {
    schemaVersion: "1.0.0",
    attempt: operation.attempt,
    threadId: result.threadId,
    role: operation.workerRole,
    requestedModel: operation.workerAssignment.model,
    requestedReasoningEffort: operation.workerAssignment.reasoningEffort,
    escalationReason:
      operation.workerRole === "feature-worker-escalated"
        ? (operation.workerInvocation?.escalationReason ?? null)
        : null,
    usage: result.usage,
    itemCount: result.itemCount,
    finalResponse: result.finalResponse,
  };
}

export function candidatePrepareProposalContractSha256(
  milestone: MilestoneRecord,
): string {
  return candidatePrepareContextSha256(milestone.proposal);
}

export function candidatePrepareProtectedFilesSha256(
  files: readonly ProtectedFileRecord[],
): string {
  return candidatePrepareContextSha256(files);
}

export function candidatePrepareProtectedPatternsSha256(
  patterns: readonly string[],
): string {
  return candidatePrepareContextSha256([...patterns]);
}

export function candidatePrepareRetryContextSha256(
  milestone: MilestoneRecord,
): string {
  return candidatePrepareContextSha256({
    attempts: milestone.attempts,
    commits: milestone.commits,
    retryFeedback: milestone.retryFeedback,
    verificationCount: milestone.verificationSummaries.length,
    reviewCount: milestone.reviewerDecisions.length,
    failures: milestone.workerPolicy.failures,
  });
}

export function candidatePrepareWorkerPolicySha256(
  milestone: MilestoneRecord,
): string {
  return candidatePrepareContextSha256(milestone.workerPolicy);
}

export function candidatePrepareThreadLineageSha256(
  milestone: MilestoneRecord,
): string {
  return candidatePrepareContextSha256(milestone.workerThreadLineage);
}

const candidateWorkspaceConfigKeys = [
  "milestone-loop.source-root",
  "milestone-loop.base-commit",
  "milestone-loop.branch",
  "milestone-loop.operation-id",
  "core.autocrlf",
  "core.eol",
] as const;

function localConfig(repository: string, key: string): string | null {
  const result = git(repository, ["config", "--local", "--get", key], true);
  if (result.status === 1 && !result.stdout) return null;
  if (result.status !== 0)
    throw new Error(`Cannot inspect local Git configuration ${key}.`);
  return result.stdout;
}

function localCandidateWorkspaceConfig(
  repository: string,
): ReadonlyMap<string, string> {
  const pattern = `^(${candidateWorkspaceConfigKeys
    .map((key) => key.replaceAll(".", "\\."))
    .join("|")})$`;
  const result = git(
    repository,
    ["config", "--local", "--get-regexp", pattern],
    true,
  );
  if (result.status !== 0 && !(result.status === 1 && !result.stdout))
    throw new Error("Cannot inspect local candidate workspace configuration.");
  const values = new Map<string, string[]>();
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line) continue;
    const separator = line.search(/\s/u);
    if (separator <= 0)
      throw new Error("Candidate workspace configuration is malformed.");
    const key = line.slice(0, separator).toLowerCase();
    const value = line.slice(separator + 1);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  if (candidateWorkspaceConfigKeys.some((key) => values.get(key)?.length !== 1))
    throw new Error(
      "Candidate workspace configuration markers are missing or duplicated.",
    );
  return new Map(
    candidateWorkspaceConfigKeys.map((key) => [key, values.get(key)![0]!]),
  );
}

export async function planCandidatePrepareOperation(input: {
  readonly operationId: string;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly state: OrchestratorState;
  readonly milestone: MilestoneRecord;
  readonly configuredWorkspaceRoot: string;
  readonly protectedPatterns: readonly string[];
  readonly workerPrompt: string;
  readonly workerEventsPath: string;
  readonly workerTurnPath: string;
  readonly checkpointArtifactPath: string;
  readonly startingCandidate: CandidatePrepareOperation["startingCandidate"];
  readonly startingCommits: readonly string[];
  readonly workerAssignment: CandidatePrepareOperation["workerAssignment"];
  readonly now: string;
}): Promise<CandidatePrepareOperation> {
  const { state, milestone } = input;
  const workspace = milestone.workspace;
  if (!workspace || !state.run.id)
    throw new Error(
      "Candidate preparation requires an active run and isolated workspace.",
    );
  const repositoryRoot = resolve(state.repository.root);
  const workspaceRoot = resolve(repositoryRoot, input.configuredWorkspaceRoot);
  const workspacePath = resolve(workspace.path);
  if (
    !strictlyContained(repositoryRoot, workspaceRoot) ||
    !strictlyContained(workspaceRoot, workspacePath)
  )
    throw new Error("Candidate-prepare workspace paths are not contained.");
  const attemptRoot = resolve(input.workerTurnPath, "..");
  for (const path of [
    input.workerEventsPath,
    input.workerTurnPath,
    input.checkpointArtifactPath,
  ]) {
    if (!strictlyContained(repositoryRoot, resolve(path)))
      throw new Error(
        "Candidate-prepare evidence path escapes the repository.",
      );
  }
  if (
    resolve(input.workerEventsPath) !==
      resolve(attemptRoot, "worker-events.jsonl") ||
    resolve(input.workerTurnPath) !==
      resolve(attemptRoot, "worker-turn.json") ||
    resolve(input.checkpointArtifactPath) !==
      resolve(attemptRoot, "controller-checkpoint.json")
  )
    throw new Error("Candidate-prepare evidence paths are non-canonical.");
  try {
    await safeDirectoryChainAllowMissing(repositoryRoot, attemptRoot);
  } catch (error) {
    throw new CandidatePreparePreflightBlockedError(
      "evidence-path-unsafe",
      error instanceof Error ? error.message : String(error),
      [attemptRoot, workspacePath],
    );
  }
  for (const path of [
    input.workerEventsPath,
    input.workerTurnPath,
    input.checkpointArtifactPath,
  ]) {
    try {
      await assertEvidencePath(repositoryRoot, path);
    } catch (error) {
      throw new CandidatePreparePreflightBlockedError(
        "evidence-path-unsafe",
        error instanceof Error ? error.message : String(error),
        [resolve(path), workspacePath],
      );
    }
    if (existsSync(path))
      throw new CandidatePreparePreflightBlockedError(
        "unowned-evidence",
        `Candidate-prepare evidence path already exists without an intent: ${resolve(path)}.`,
        [resolve(path), workspacePath],
      );
  }
  const workspaceCreateOperationId = localConfig(
    workspacePath,
    "milestone-loop.operation-id",
  );
  if (
    !workspaceCreateOperationId ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(workspaceCreateOperationId)
  )
    throw new Error("Workspace creation operation marker is missing.");
  const retryFeedbackSha256 =
    milestone.retryFeedback === null ? null : sha256(milestone.retryFeedback);
  const initialAgentInvocationCount = state.run.agentInvocations.length;
  return {
    schemaVersion: "1.0.0",
    kind: "candidate-prepare",
    id: input.operationId,
    runId: state.run.id,
    milestoneId: milestone.proposal.id,
    attempt: milestone.attempts,
    inputStateGeneration: input.inputStateGeneration,
    inputStateRevision: input.inputStateRevision,
    repositoryRoot,
    workspaceRoot,
    targetBranch: state.repository.targetBranch,
    verifiedCommit: state.repository.verifiedCommit,
    workspacePath,
    workspaceBranch: workspace.branch,
    workspaceBaseCommit: workspace.baseCommit,
    workspaceCreatedAt: workspace.createdAt,
    workspaceCreateOperationId,
    startingCandidate: input.startingCandidate,
    startingCommits: [...input.startingCommits],
    workerRole: milestone.workerPolicy.activeRole,
    workerAssignment: {
      model: input.workerAssignment.model,
      reasoningEffort: input.workerAssignment.reasoningEffort,
    },
    initialWorkerThreadId: milestone.workerThreadId,
    initialWorkerThreadLineageSha256:
      candidatePrepareThreadLineageSha256(milestone),
    workerPolicySha256: candidatePrepareWorkerPolicySha256(milestone),
    retryFeedbackSha256,
    retryContextSha256: candidatePrepareRetryContextSha256(milestone),
    proposalContractSha256: candidatePrepareProposalContractSha256(milestone),
    protectedFilesSha256: candidatePrepareProtectedFilesSha256(
      state.repository.protectedFiles,
    ),
    protectedPatternsSha256: candidatePrepareProtectedPatternsSha256(
      input.protectedPatterns,
    ),
    promptSha256: sha256(input.workerPrompt),
    workerEventsPath: resolve(input.workerEventsPath),
    workerTurnPath: resolve(input.workerTurnPath),
    checkpointArtifactPath: resolve(input.checkpointArtifactPath),
    initialRunUsage: state.run.usage,
    initialAgentInvocationCount,
    agentInvocationId: `${state.run.id}-agent-${initialAgentInvocationCount + 1}`,
    workerInvocation: null,
    workerResult: null,
    checkpointPlan: null,
    checkpointResult: null,
    checkpointArtifactSha256: null,
    phase: "intent-persisted",
    createdAt: input.now,
    updatedAt: input.now,
    recoveryPolicy: "validate-resume-adopt-or-preserve",
    diagnostic: null,
  };
}

async function safeDirectoryChain(root: string, target: string): Promise<void> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (!strictlyContained(lexicalRoot, lexicalTarget))
    throw new Error("Workspace path escapes its configured root.");
  const rootMetadata = await lstat(lexicalRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error("Workspace root is linked or is not a directory.");
  const realRoot = await realpath(lexicalRoot);
  if (!samePath(realRoot, lexicalRoot))
    throw new Error("Workspace root resolves through a substituted path.");
  const segments = relative(lexicalRoot, lexicalTarget)
    .split(/[\\/]+/u)
    .filter(Boolean);
  let current = lexicalRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(
        "Workspace directory chain contains a linked or non-directory entry.",
      );
    const resolved = await realpath(current);
    if (!samePath(resolved, current) || !strictlyContained(realRoot, resolved))
      throw new Error("Workspace directory chain resolves outside its root.");
  }
}

async function safeDirectoryChainAllowMissing(
  root: string,
  target: string,
): Promise<void> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (!strictlyContained(lexicalRoot, lexicalTarget))
    throw new Error("Candidate evidence path escapes the repository.");
  const rootMetadata = await lstat(lexicalRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error("Candidate evidence root is linked or is not a directory.");
  const realRoot = await realpath(lexicalRoot);
  if (!samePath(realRoot, lexicalRoot))
    throw new Error("Candidate evidence root resolves through substitution.");
  let current = lexicalRoot;
  for (const segment of relative(lexicalRoot, lexicalTarget)
    .split(/[\\/]+/u)
    .filter(Boolean)) {
    current = resolve(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return;
      throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(
        "Candidate evidence directory chain is linked or is not a directory.",
      );
    const resolved = await realpath(current);
    if (!samePath(resolved, current) || !strictlyContained(realRoot, resolved))
      throw new Error(
        "Candidate evidence directory resolves outside its root.",
      );
  }
}

async function assertEvidencePath(root: string, target: string): Promise<void> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (!strictlyContained(lexicalRoot, lexicalTarget))
    throw new Error("Candidate evidence path escapes the repository.");
  await safeDirectoryChainAllowMissing(lexicalRoot, dirname(lexicalTarget));
  if (!existsSync(lexicalTarget)) return;
  const metadata = await lstat(lexicalTarget);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("Candidate evidence path is linked or is not a file.");
  const resolved = await realpath(lexicalTarget);
  if (
    !samePath(resolved, lexicalTarget) ||
    !strictlyContained(lexicalRoot, resolved)
  )
    throw new Error("Candidate evidence path resolves outside the repository.");
}

export async function assertCandidatePrepareEvidencePaths(
  operation: CandidatePrepareOperation,
): Promise<void> {
  const attemptRoot = dirname(operation.workerTurnPath);
  if (
    operation.workerEventsPath !==
      resolve(attemptRoot, "worker-events.jsonl") ||
    operation.workerTurnPath !== resolve(attemptRoot, "worker-turn.json") ||
    operation.checkpointArtifactPath !==
      resolve(attemptRoot, "controller-checkpoint.json")
  )
    throw new Error("Candidate evidence paths are non-canonical.");
  for (const path of [
    operation.workerEventsPath,
    operation.workerTurnPath,
    operation.checkpointArtifactPath,
  ])
    await assertEvidencePath(operation.repositoryRoot, path);
}

async function assertWorkspaceIdentity(
  operation: CandidatePrepareOperation,
): Promise<void> {
  await safeDirectoryChain(operation.workspaceRoot, operation.workspacePath);
  const gitDirectory = resolve(operation.workspacePath, ".git");
  const gitMetadata = await lstat(gitDirectory);
  if (!gitMetadata.isDirectory() || gitMetadata.isSymbolicLink())
    throw new Error("Workspace Git metadata is linked or uses a gitfile.");
  const gitReal = await realpath(gitDirectory);
  if (
    !samePath(gitReal, gitDirectory) ||
    !strictlyContained(operation.workspacePath, gitReal)
  )
    throw new Error("Workspace Git metadata resolves outside the workspace.");
  const identity = git(operation.workspacePath, [
    "rev-parse",
    "--show-toplevel",
    "--git-dir",
    "--git-common-dir",
    "--abbrev-ref",
    "HEAD",
  ]).stdout.split(/\r?\n/u);
  if (identity.length !== 4)
    throw new Error("Workspace Git identity output is malformed.");
  const [top, gitDir, commonDir, branch] = identity;
  if (
    !top ||
    !gitDir ||
    !commonDir ||
    !branch ||
    !samePath(top, operation.workspacePath) ||
    !samePath(resolve(operation.workspacePath, gitDir), gitDirectory) ||
    !samePath(resolve(operation.workspacePath, commonDir), gitDirectory)
  )
    throw new Error("Workspace does not own one standalone Git directory.");
  const config = localCandidateWorkspaceConfig(operation.workspacePath);
  if (
    branch !== operation.workspaceBranch ||
    config.get("milestone-loop.source-root") !== operation.repositoryRoot ||
    config.get("milestone-loop.base-commit") !==
      operation.workspaceBaseCommit ||
    config.get("milestone-loop.branch") !== operation.workspaceBranch ||
    config.get("milestone-loop.operation-id") !==
      operation.workspaceCreateOperationId ||
    config.get("core.autocrlf") !== "false" ||
    config.get("core.eol") !== "lf"
  )
    throw new Error("Workspace controller identity markers are inconsistent.");
  if (git(operation.workspacePath, ["remote"]).stdout !== "")
    throw new Error("Candidate workspace is not remote-free.");
  for (const marker of [
    "index.lock",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
  ]) {
    if (existsSync(resolve(gitDirectory, marker)))
      throw new Error(`Workspace Git operation ${marker} is active.`);
  }
}

function blocked(
  operation: CandidatePrepareOperation,
  classification: CandidatePrepareBlockedClassification,
  message: string,
  observedHead: string | null,
  preservedPaths: readonly string[] = [operation.workspacePath],
): CandidatePrepareRecoveryInspection {
  return {
    operationId: operation.id,
    classification,
    disposition: "manual",
    nextSafeAction: "manual-reconciliation-required",
    message,
    observedHead,
    preservedPaths: [...new Set(preservedPaths)],
    checkpointResult: null,
  };
}

function automatic(
  operation: CandidatePrepareOperation,
  input: Pick<
    CandidatePrepareRecoveryInspection,
    "classification" | "nextSafeAction" | "message" | "observedHead"
  > & { readonly checkpointResult?: CandidatePrepareCheckpointResult | null },
): CandidatePrepareRecoveryInspection {
  return {
    operationId: operation.id,
    disposition: "automatic",
    preservedPaths: [operation.workspacePath],
    checkpointResult: input.checkpointResult ?? null,
    ...input,
  };
}

async function artifactHash(
  operation: CandidatePrepareOperation,
  path: string,
): Promise<string | null> {
  await assertEvidencePath(operation.repositoryRoot, path);
  if (!existsSync(path)) return null;
  return sha256(await readFile(path));
}

async function workerEventThreadIds(
  operation: CandidatePrepareOperation,
  path: string,
): Promise<readonly string[]> {
  await assertEvidencePath(operation.repositoryRoot, path);
  if (!existsSync(path)) return [];
  const ids: string[] = [];
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as unknown;
    if (
      typeof event === "object" &&
      event !== null &&
      !Array.isArray(event) &&
      (event as Record<string, unknown>)["type"] === "thread.started"
    ) {
      const threadId = (event as Record<string, unknown>)["thread_id"];
      if (typeof threadId !== "string" || threadId.length === 0)
        throw new Error("Worker event log has a malformed thread identity.");
      ids.push(threadId);
    }
  }
  return [...new Set(ids)];
}

function resultFromWorkspace(
  operation: CandidatePrepareOperation,
  committedAt: string,
): CandidatePrepareCheckpointResult {
  const attempt = inspectAttempt(
    operation.workspacePath,
    operation.workspaceBaseCommit,
  );
  return {
    candidate: candidateIdentityFrom(operation.workspaceBaseCommit, attempt),
    commits: attempt.commits,
    finalChangedPaths: attempt.changedPaths,
    controllerCommit:
      operation.checkpointPlan?.controllerCommitRequired === true
        ? attempt.headCommit
        : null,
    committedAt,
  };
}

export function candidatePrepareCheckpointArtifact(
  operation: CandidatePrepareOperation,
): unknown {
  if (
    !operation.workerResult ||
    !operation.checkpointPlan ||
    !operation.checkpointResult
  )
    throw new Error(
      "Candidate checkpoint evidence requires Worker, plan, and result state.",
    );
  return {
    schemaVersion: "1.0.0",
    status: "accepted",
    operationId: operation.id,
    runId: operation.runId,
    milestoneId: operation.milestoneId,
    attempt: operation.attempt,
    workerTurnSha256: operation.workerResult.workerTurnSha256,
    startingCandidate: operation.startingCandidate,
    observedPaths: operation.checkpointPlan.observedPaths,
    workingPaths: operation.checkpointPlan.workingPaths,
    finalChangedPaths: operation.checkpointResult.finalChangedPaths,
    commits: operation.checkpointResult.commits,
    candidate: operation.checkpointResult.candidate,
    controllerCommit: operation.checkpointResult.controllerCommit,
    reason: operation.checkpointPlan.controllerCommitRequired
      ? "sdk-sandbox-protected-git-metadata"
      : "worker-tree-already-clean",
  };
}

export async function prepareCandidateCheckpointPlan(input: {
  readonly operation: CandidatePrepareOperation;
  readonly milestone: MilestoneRecord;
  readonly protectedPatterns: readonly string[];
  readonly protectedFiles: readonly ProtectedFileRecord[];
  readonly now: string;
}): Promise<CandidatePrepareCheckpointPlan> {
  const { operation, milestone } = input;
  await assertWorkspaceIdentity(operation);
  await assertProtectedFiles(operation.workspacePath, input.protectedFiles);
  const before = inspectAttempt(
    operation.workspacePath,
    operation.workspaceBaseCommit,
  );
  const workingPaths = workingChangedPaths(operation.workspacePath);
  const observedPaths = [
    ...new Set([...before.changedPaths, ...workingPaths]),
  ].sort();
  const policy = enforceDiffPolicy(
    observedPaths,
    milestone.proposal,
    input.protectedPatterns,
  );
  if (!policy.allowed)
    throw new Error(
      `Candidate diff is unauthorized protected=[${policy.protectedChanges.join(", ")}] out-of-scope=[${policy.outOfScopeChanges.join(", ")}].`,
    );
  const message = `Controller checkpoint: ${milestone.proposal.title}`
    .replaceAll(/[\r\n\t]+/g, " ")
    .trim();
  const staged =
    workingPaths.length === 0
      ? null
      : stageWorkingChanges(operation.workspacePath);
  return {
    preCheckpointCommit: before.headCommit,
    expectedTree: staged?.tree ?? before.tree,
    commitMessage: staged ? message : null,
    controllerCommitRequired: staged !== null,
    observedPaths,
    workingPaths,
    preparedAt: input.now,
  };
}

export async function inspectCandidatePrepareOperation(input: {
  readonly operation: CandidatePrepareOperation;
  readonly milestone: MilestoneRecord;
  readonly workerPrompt?: string;
  readonly protectedPatterns: readonly string[];
  readonly protectedFiles: readonly ProtectedFileRecord[];
}): Promise<CandidatePrepareRecoveryInspection> {
  const { operation, milestone } = input;
  if (operation.phase === "blocked")
    return blocked(
      operation,
      operation.diagnostic?.classification ?? "candidate-drift",
      operation.diagnostic?.message ?? "Candidate preparation is blocked.",
      operation.diagnostic?.observedHead ?? null,
    );
  try {
    await assertWorkspaceIdentity(operation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof Error && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    return blocked(
      operation,
      code === "ENOENT" || /escapes|linked|substituted|outside/u.test(message)
        ? "workspace-path-unsafe"
        : "workspace-identity-drift",
      message,
      null,
    );
  }
  try {
    await assertCandidatePrepareEvidencePaths(operation);
  } catch (error) {
    return blocked(
      operation,
      "evidence-path-unsafe",
      error instanceof Error ? error.message : String(error),
      null,
      [
        operation.workspacePath,
        operation.workerEventsPath,
        operation.workerTurnPath,
        operation.checkpointArtifactPath,
      ],
    );
  }
  let attempt;
  try {
    attempt = inspectAttempt(
      operation.workspacePath,
      operation.workspaceBaseCommit,
    );
  } catch (error) {
    return blocked(
      operation,
      "candidate-drift",
      error instanceof Error ? error.message : String(error),
      null,
    );
  }
  const observedHead = attempt.headCommit;
  if (
    candidatePrepareProposalContractSha256(milestone) !==
      operation.proposalContractSha256 ||
    candidatePrepareProtectedFilesSha256(input.protectedFiles) !==
      operation.protectedFilesSha256 ||
    candidatePrepareProtectedPatternsSha256(input.protectedPatterns) !==
      operation.protectedPatternsSha256 ||
    (input.workerPrompt !== undefined &&
      sha256(input.workerPrompt) !== operation.promptSha256) ||
    candidatePrepareWorkerPolicySha256(milestone) !==
      operation.workerPolicySha256 ||
    candidatePrepareRetryContextSha256(milestone) !==
      operation.retryContextSha256
  )
    return blocked(
      operation,
      "worker-context-drift",
      "Canonical proposal, policy, retry, or protected-path context changed.",
      observedHead,
    );
  const invocationThreadId = operation.workerInvocation?.threadId ?? null;
  if (invocationThreadId === null) {
    if (
      milestone.workerThreadId !== operation.initialWorkerThreadId ||
      candidatePrepareThreadLineageSha256(milestone) !==
        operation.initialWorkerThreadLineageSha256
    )
      return blocked(
        operation,
        "worker-context-drift",
        "Worker thread lineage changed before a canonical thread identity was recorded.",
        observedHead,
      );
  } else {
    const lineage = milestone.workerThreadLineage.at(-1);
    if (
      milestone.workerThreadId !== invocationThreadId ||
      !lineage ||
      lineage.threadId !== invocationThreadId ||
      lineage.role !== operation.workerRole ||
      lineage.model !== operation.workerAssignment.model ||
      lineage.reasoningEffort !== operation.workerAssignment.reasoningEffort
    )
      return blocked(
        operation,
        "worker-context-drift",
        "Worker invocation and canonical thread lineage are inconsistent.",
        observedHead,
      );
  }
  const startAncestor = git(
    operation.workspacePath,
    [
      "merge-base",
      "--is-ancestor",
      operation.startingCandidate.commit,
      observedHead,
    ],
    true,
  );
  if (startAncestor.status !== 0)
    return blocked(
      operation,
      "unexpected-commit",
      "Candidate no longer descends from the intent-bound starting commit.",
      observedHead,
    );
  try {
    await assertProtectedFiles(operation.workspacePath, input.protectedFiles);
  } catch (error) {
    return blocked(
      operation,
      "protected-file-drift",
      error instanceof Error ? error.message : String(error),
      observedHead,
    );
  }
  let workingPaths: readonly string[];
  try {
    workingPaths = workingChangedPaths(operation.workspacePath);
  } catch (error) {
    return blocked(
      operation,
      "candidate-drift",
      error instanceof Error ? error.message : String(error),
      observedHead,
    );
  }
  const policy = enforceDiffPolicy(
    [...new Set([...attempt.changedPaths, ...workingPaths])].sort(),
    milestone.proposal,
    input.protectedPatterns,
  );
  if (!policy.allowed)
    return blocked(
      operation,
      "diff-policy-violation",
      `Candidate diff is unauthorized protected=[${policy.protectedChanges.join(", ")}] out-of-scope=[${policy.outOfScopeChanges.join(", ")}].`,
      observedHead,
    );

  if (operation.phase === "intent-persisted") {
    const observedCandidate = candidateIdentityFrom(
      operation.workspaceBaseCommit,
      attempt,
    );
    if (
      candidateIdentitiesEqual(
        operation.startingCandidate,
        observedCandidate,
      ) &&
      canonicalJson(operation.startingCommits) ===
        canonicalJson(attempt.commits)
    )
      return automatic(operation, {
        classification: "worker-resume-ready",
        nextSafeAction: "resume-worker",
        message:
          "Exact intent-bound candidate is unchanged and the Worker gateway has not been entered.",
        observedHead,
      });
    return blocked(
      operation,
      "candidate-drift",
      "Candidate changed after intent publication but before authorized Worker launch.",
      observedHead,
    );
  }

  if (
    operation.phase === "worker-invocation-started" ||
    operation.phase === "worker-thread-recorded"
  )
    return blocked(
      operation,
      "worker-outcome-ambiguous",
      "Controller stopped before durable Worker completion; candidate output is ambiguous and preserved.",
      observedHead,
    );

  if (!operation.workerResult)
    return blocked(
      operation,
      "worker-context-drift",
      "Candidate phase requires a durable Worker result.",
      observedHead,
    );
  try {
    const eventThreadIds = await workerEventThreadIds(
      operation,
      operation.workerEventsPath,
    );
    if (
      eventThreadIds.some(
        (threadId) => threadId !== operation.workerResult?.threadId,
      )
    )
      return blocked(
        operation,
        "worker-context-drift",
        "Worker event evidence names a thread outside the canonical invocation.",
        observedHead,
        [operation.workspacePath, operation.workerEventsPath],
      );
  } catch (error) {
    return blocked(
      operation,
      "worker-evidence-conflict",
      error instanceof Error ? error.message : String(error),
      observedHead,
      [operation.workspacePath, operation.workerEventsPath],
    );
  }
  let workerArtifactHash: string | null;
  try {
    workerArtifactHash = await artifactHash(
      operation,
      operation.workerTurnPath,
    );
  } catch (error) {
    return blocked(
      operation,
      "worker-evidence-conflict",
      error instanceof Error ? error.message : String(error),
      observedHead,
      [operation.workspacePath, operation.workerTurnPath],
    );
  }
  if (operation.phase === "worker-completed") {
    if (operation.workerResult.finalResponse === null)
      return blocked(
        operation,
        "legacy-worker-evidence-unrecoverable",
        "Legacy canonical Worker completion lacks the response bytes required to reproduce derived evidence.",
        observedHead,
        [operation.workspacePath, operation.workerTurnPath],
      );
    if (workerArtifactHash === null)
      return automatic(operation, {
        classification: "worker-evidence-missing",
        nextSafeAction: "materialize-worker-evidence",
        message:
          "Canonical Worker completion is exact; derived Worker evidence may be materialized.",
        observedHead,
      });
    if (workerArtifactHash === operation.workerResult.workerTurnSha256)
      return automatic(operation, {
        classification: "worker-evidence-ready",
        nextSafeAction: "record-worker-evidence",
        message: "Exact derived Worker evidence is ready to record.",
        observedHead,
      });
    return blocked(
      operation,
      "worker-evidence-conflict",
      "Worker turn artifact does not match the intent-bound hash.",
      observedHead,
      [
        operation.workspacePath,
        operation.workerEventsPath,
        operation.workerTurnPath,
      ],
    );
  }
  if (workerArtifactHash !== operation.workerResult.workerTurnSha256)
    return blocked(
      operation,
      "worker-evidence-conflict",
      "Worker turn artifact is missing or conflicts with canonical state.",
      observedHead,
      [
        operation.workspacePath,
        operation.workerEventsPath,
        operation.workerTurnPath,
      ],
    );
  if (operation.phase === "worker-evidence-recorded")
    return automatic(operation, {
      classification: "checkpoint-plan-ready",
      nextSafeAction: "prepare-checkpoint",
      message:
        "Worker evidence and candidate context are exact; checkpoint planning may resume.",
      observedHead,
    });

  const plan = operation.checkpointPlan;
  if (!plan)
    return blocked(
      operation,
      "checkpoint-tree-drift",
      "Candidate phase requires a durable checkpoint plan.",
      observedHead,
    );
  if (operation.phase === "checkpoint-prepared") {
    if (!plan.controllerCommitRequired) {
      if (
        attempt.clean &&
        observedHead === plan.preCheckpointCommit &&
        attempt.tree === plan.expectedTree
      )
        return automatic(operation, {
          classification: "checkpoint-commit-adoptable",
          nextSafeAction: "adopt-checkpoint-commit",
          message: "Intent-authorized clean Worker commit is exact.",
          observedHead,
          checkpointResult: resultFromWorkspace(operation, plan.preparedAt),
        });
      return blocked(
        operation,
        "checkpoint-tree-drift",
        "No-commit checkpoint no longer matches its exact clean commit and tree.",
        observedHead,
      );
    }
    if (observedHead === plan.preCheckpointCommit) {
      const stagedTree = git(operation.workspacePath, ["write-tree"]).stdout;
      const unstaged = git(operation.workspacePath, ["diff", "--quiet"], true);
      const staged = git(
        operation.workspacePath,
        ["diff", "--cached", "--quiet"],
        true,
      );
      if (
        stagedTree === plan.expectedTree &&
        unstaged.status === 0 &&
        staged.status === 1
      )
        return automatic(operation, {
          classification: "checkpoint-commit-ready",
          nextSafeAction: "resume-checkpoint-commit",
          message:
            "Exact staged checkpoint is ready for the authorized controller commit.",
          observedHead,
        });
      return blocked(
        operation,
        "checkpoint-tree-drift",
        "Staged candidate no longer matches the intent-bound checkpoint tree.",
        observedHead,
      );
    }
    const parents = git(operation.workspacePath, [
      "show",
      "-s",
      "--format=%P",
      observedHead,
    ]).stdout;
    const tree = git(operation.workspacePath, [
      "show",
      "-s",
      "--format=%T",
      observedHead,
    ]).stdout;
    const message = git(operation.workspacePath, [
      "show",
      "-s",
      "--format=%B",
      observedHead,
    ]).stdout;
    if (
      attempt.clean &&
      parents === plan.preCheckpointCommit &&
      tree === plan.expectedTree &&
      message === plan.commitMessage
    )
      return automatic(operation, {
        classification: "checkpoint-commit-adoptable",
        nextSafeAction: "adopt-checkpoint-commit",
        message:
          "Exact intent-authorized controller checkpoint commit may be adopted.",
        observedHead,
        checkpointResult: resultFromWorkspace(operation, plan.preparedAt),
      });
    return blocked(
      operation,
      parents !== plan.preCheckpointCommit
        ? "checkpoint-parent-drift"
        : tree !== plan.expectedTree
          ? "checkpoint-tree-drift"
          : "unexpected-commit",
      "Workspace commit does not exactly match the authorized checkpoint parent, tree, and message.",
      observedHead,
    );
  }

  const result = operation.checkpointResult;
  if (!result)
    return blocked(
      operation,
      "checkpoint-tree-drift",
      "Candidate phase requires a durable checkpoint result.",
      observedHead,
    );
  const observedCandidate = candidateIdentityFrom(
    operation.workspaceBaseCommit,
    attempt,
  );
  if (
    !attempt.clean ||
    !candidateIdentitiesEqual(result.candidate, observedCandidate) ||
    canonicalJson(result.commits) !== canonicalJson(attempt.commits) ||
    canonicalJson(result.finalChangedPaths) !==
      canonicalJson(attempt.changedPaths) ||
    (plan.controllerCommitRequired
      ? result.controllerCommit !== observedHead
      : result.controllerCommit !== null)
  )
    return blocked(
      operation,
      "candidate-drift",
      "Workspace no longer matches the canonical checkpoint result.",
      observedHead,
    );
  if (!operation.checkpointArtifactSha256)
    return blocked(
      operation,
      "checkpoint-artifact-conflict",
      "Checkpoint result lacks an expected derived-artifact hash.",
      observedHead,
      [operation.workspacePath, operation.checkpointArtifactPath],
    );
  let checkpointHash: string | null;
  try {
    checkpointHash = await artifactHash(
      operation,
      operation.checkpointArtifactPath,
    );
  } catch (error) {
    return blocked(
      operation,
      "checkpoint-artifact-conflict",
      error instanceof Error ? error.message : String(error),
      observedHead,
      [operation.workspacePath, operation.checkpointArtifactPath],
    );
  }
  if (operation.phase === "checkpoint-committed") {
    if (checkpointHash === null)
      return automatic(operation, {
        classification: "checkpoint-evidence-missing",
        nextSafeAction: "materialize-checkpoint-evidence",
        message:
          "Exact checkpoint result is durable; derived evidence may be materialized.",
        observedHead,
      });
    if (checkpointHash === operation.checkpointArtifactSha256)
      return automatic(operation, {
        classification: "checkpoint-evidence-ready",
        nextSafeAction: "record-checkpoint-evidence",
        message: "Exact checkpoint evidence is ready to record.",
        observedHead,
      });
    return blocked(
      operation,
      "checkpoint-artifact-conflict",
      "Checkpoint artifact conflicts with canonical candidate state.",
      observedHead,
      [operation.workspacePath, operation.checkpointArtifactPath],
    );
  }
  if (
    operation.phase === "checkpoint-recorded" &&
    checkpointHash === operation.checkpointArtifactSha256
  )
    return automatic(operation, {
      classification: "candidate-completion-ready",
      nextSafeAction: "complete-candidate",
      message:
        "Candidate checkpoint and derived evidence are exact; verification may begin.",
      observedHead,
    });
  return blocked(
    operation,
    "checkpoint-artifact-conflict",
    "Recorded checkpoint evidence is missing or conflicts with canonical state.",
    observedHead,
    [operation.workspacePath, operation.checkpointArtifactPath],
  );
}
