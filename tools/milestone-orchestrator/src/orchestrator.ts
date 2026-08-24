import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { AGENT_INVOCATION_SCHEMA_VERSION, AGENT_ROLES } from "./contracts.js";
import type {
  AgentInvocationRecord,
  BlockerRecord,
  CandidatePrepareOperation,
  CandidateIdentity,
  CodexTurnResult,
  MilestoneProposal,
  MilestoneRecord,
  OrchestratorConfig,
  OrchestratorState,
  PolicyDecision,
  ProjectProfile,
  ProposalProvenance,
  ReadinessHistoryEvidence,
  RetentionApplyOperation,
  ReviewerReport,
  RunState,
  TargetIntegrateOperation,
  VerificationSummary,
  WorkerFailureRecord,
  WorkspaceCleanupOperation,
  WorkspaceCleanupReason,
  WorkspaceCreateOperation,
} from "./contracts.js";
import {
  candidateIdentitiesEqual,
  candidateIdentityFrom,
  differingIdentityFields,
} from "./candidate-identity.js";
import {
  candidatePrepareArtifactSha256,
  candidatePrepareCheckpointArtifact,
  inspectCandidatePrepareOperation,
  planCandidatePrepareOperation,
  prepareCandidateCheckpointPlan,
  type CandidatePrepareHooks,
  type CandidatePrepareRecoveryInspection,
} from "./candidate-prepare.js";
import {
  ControllerLease,
  type ControllerLeaseInspection,
  type ControllerLeaseOperation,
} from "./controller-lease.js";
import {
  type CodexGateway,
  type CodexInvocation,
  SdkCodexGateway,
} from "./codex-gateway.js";
import { measurableTokenUnits } from "./budget.js";
import {
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  loadActiveVerificationManifest,
  loadConfig,
} from "./config.js";
import {
  assertManifestProtectedPathsCovered,
  buildCanonicalProtectedSet,
  casefoldPathKey,
  enforcementProtectedPatterns,
} from "./protected-roots.js";
import { runCommand } from "./command-runner.js";
import { executionProviderIdentitiesEqual } from "./execution-provider-identity.js";
import {
  buildEvidenceRetentionPlan,
  discoverManagedEvidenceRuns,
  planManagedEvidenceRuns,
} from "./evidence-retention.js";
import {
  assertProtectedFiles,
  captureProtectedFiles,
  commitStagedChanges,
  currentVerificationProfile,
  inspectAttempt,
  inspectTarget,
  gitHead,
} from "./git-isolation.js";
import {
  advanceCandidatePrepareOperation,
  advanceTargetIntegrateOperation,
  advanceWorkspaceCleanupOperation,
  advanceWorkspaceCreateOperation,
  blockCandidatePrepareOperation,
  blockTargetIntegrateOperation,
  blockWorkspaceCleanupOperation,
  blockWorkspaceCreateOperation,
  completeCandidatePrepareOperation,
  completeTargetIntegrateOperation,
  completeWorkspaceCleanupOperation,
  completeWorkspaceCreateOperation,
  setCandidatePrepareOperation,
  setTargetIntegrateOperation,
  setWorkspaceCleanupOperation,
  setWorkspaceCreateOperation,
} from "./operation-intent.js";
import {
  createMilestoneRecord,
  assertRequiredVerticalConsumerStart,
  milestoneById,
  replaceMilestone,
  transitionMilestone,
} from "./milestone-state.js";
import {
  installedCodexSdkVersion,
  resolveAgentAssignment,
} from "./model-policy.js";
import { evaluateProposal } from "./policy.js";
import { strictlyContained } from "./path-safety.js";
import { requestPlan } from "./planner.js";
import { redactSensitiveText, redactSensitiveValue } from "./redaction.js";
import { requestReview, reviewerApproves } from "./reviewer.js";
import {
  inspectRetentionApplyOperation,
  recoverRetentionApplyOperation,
  type RetentionApplyHooks,
  type RetentionApplyRecoveryInspection,
} from "./retention-apply-operation.js";
import { authoritativeStageSetsAreConsistent } from "./readiness-completion.js";
export { humanPlaytestStopReason } from "./readiness-completion.js";
import {
  assertWorkerThreadPolicy,
  decideWorkerEscalation,
  infrastructureFailureRecord,
  promoteWorkerPolicy,
  reviewerFailureRecord,
  verificationFailureRecord,
} from "./reasoning-escalation.js";
import { decideRetry } from "./retry-policy.js";
import {
  StateStore,
  atomicWriteJson,
  createInitialState,
  type StateStoreInspection,
} from "./state-store.js";
import { verifyMilestone } from "./verifier.js";
import {
  deleteWorkspaceCleanupWorkspace,
  inspectWorkspaceCleanupOperation,
  materializeWorkspaceCleanupArchive,
  planWorkspaceCleanupOperation,
  removeWorkspaceCleanupDependencies,
  type WorkspaceCleanupHooks,
  type WorkspaceCleanupRecoveryInspection,
} from "./workspace-cleanup-operation.js";
import {
  cloneWorkspaceCreateTemporary,
  finishWorkspaceCreateTemporary,
  inspectWorkspaceCreateOperation,
  planWorkspaceCreateOperation,
  publishWorkspaceCreateTemporary,
  type WorkspaceCreateHooks,
  type WorkspaceCreateRecoveryInspection,
} from "./workspace-create.js";
import {
  fastForwardTargetIntegration,
  fetchTargetIntegrationCandidate,
  inspectTargetIntegrationOperation,
  materializeTargetIntegrationOutcome,
  planTargetIntegrateOperation,
  type TargetIntegrationHooks,
  type TargetIntegrationRecoveryInspection,
} from "./target-integration.js";
import { TelemetryStore } from "./telemetry-store.js";
import type {
  BeginTelemetryPhaseInput,
  TelemetrySpan,
} from "./telemetry-store.js";
import type {
  TelemetryCandidate,
  TelemetryStatus,
} from "./telemetry-contracts.js";

export interface OrchestratorDependencies {
  readonly gateway?: CodexGateway;
  readonly now?: () => Date;
  readonly createRunId?: () => string;
  readonly createWorkspaceOperationId?: () => string;
  readonly createCandidatePrepareOperationId?: () => string;
  readonly createTargetIntegrationOperationId?: () => string;
  readonly createWorkspaceCleanupOperationId?: () => string;
  readonly workspaceCreateHooks?: WorkspaceCreateHooks;
  readonly candidatePrepareHooks?: CandidatePrepareHooks;
  readonly targetIntegrationHooks?: TargetIntegrationHooks;
  readonly workspaceCleanupHooks?: WorkspaceCleanupHooks;
  readonly retentionApplyHooks?: RetentionApplyHooks;
  readonly evidencePlanner?: typeof planManagedEvidenceRuns;
  readonly evidenceDiscovery?: typeof discoverManagedEvidenceRuns;
  readonly telemetryStoreOpen?: typeof TelemetryStore.open;
  readonly leaseOperation?: ControllerLeaseOperation;
}

export interface OrchestratorInspection {
  readonly state: OrchestratorState | null;
  readonly stateStorage: StateStoreInspection;
  readonly targetHead: string;
  readonly targetDrift: {
    readonly storedVerifiedCommit: string;
    readonly actualHead: string;
  } | null;
  readonly pendingWorkspaceCleanups: number;
  readonly pendingOperation: {
    readonly operation:
      | WorkspaceCreateOperation
      | CandidatePrepareOperation
      | TargetIntegrateOperation
      | WorkspaceCleanupOperation
      | RetentionApplyOperation;
    readonly recovery:
      | WorkspaceCreateRecoveryInspection
      | CandidatePrepareRecoveryInspection
      | TargetIntegrationRecoveryInspection
      | WorkspaceCleanupRecoveryInspection
      | RetentionApplyRecoveryInspection;
  } | null;
  readonly protectedIntegrity:
    "verified" | "uninitialized" | { readonly driftedPaths: readonly string[] };
  readonly lease: ControllerLeaseInspection;
  readonly nextAllowedAction: OrchestratorState["nextAllowedAction"];
}

export interface RunOptions {
  readonly maximumMilestones?: number;
}

export interface RunOutcome {
  readonly state: OrchestratorState;
  readonly summaryPath: string;
  readonly stopReason: string;
}

function iso(now: () => Date): string {
  return now().toISOString();
}

function safeRunId(now: Date): string {
  return `loop-${now
    .toISOString()
    .replaceAll(/[^0-9]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function candidateWorkerTurnArtifact(
  operation: CandidatePrepareOperation,
  result: CodexTurnResult,
): unknown {
  return {
    schemaVersion: "1.0.0",
    attempt: operation.attempt,
    threadId: result.threadId,
    role: operation.workerRole,
    requestedModel: operation.workerAssignment.model,
    requestedReasoningEffort: operation.workerAssignment.reasoningEffort,
    escalationReason:
      operation.workerRole === "feature-worker-escalated"
        ? candidateMilestoneEscalationReason(operation)
        : null,
    usage: result.usage,
    itemCount: result.itemCount,
    finalResponse: redactSensitiveText(result.finalResponse),
  };
}

function candidateMilestoneEscalationReason(
  operation: CandidatePrepareOperation,
): string | null {
  return operation.workerInvocation?.escalationReason ?? null;
}

export class WorkspaceCreateInterruptedError extends Error {
  constructor(
    readonly point: string,
    options: { readonly cause: unknown },
  ) {
    super(`Workspace-create operation was interrupted at ${point}.`, options);
    this.name = "WorkspaceCreateInterruptedError";
  }
}

export class WorkspaceCreateBlockedError extends Error {
  constructor(
    readonly operationId: string,
    message: string,
  ) {
    super(`Workspace-create operation ${operationId} is blocked: ${message}`);
    this.name = "WorkspaceCreateBlockedError";
  }
}

export class CandidatePrepareInterruptedError extends Error {
  constructor(
    readonly point: string,
    options: { readonly cause: unknown },
  ) {
    super(`Candidate-prepare operation was interrupted at ${point}.`, options);
    this.name = "CandidatePrepareInterruptedError";
  }
}

export class CandidatePrepareBlockedError extends Error {
  constructor(
    readonly operationId: string,
    message: string,
  ) {
    super(`Candidate-prepare operation ${operationId} is blocked: ${message}`);
    this.name = "CandidatePrepareBlockedError";
  }
}

export class WorkspaceCleanupInterruptedError extends Error {
  constructor(
    readonly point: string,
    options: { readonly cause: unknown },
  ) {
    super(`Workspace-cleanup operation was interrupted at ${point}.`, options);
    this.name = "WorkspaceCleanupInterruptedError";
  }
}

export class WorkspaceCleanupBlockedError extends Error {
  constructor(
    readonly operationId: string,
    message: string,
  ) {
    super(`Workspace-cleanup operation ${operationId} is blocked: ${message}`);
    this.name = "WorkspaceCleanupBlockedError";
  }
}

export class TargetIntegrationInterruptedError extends Error {
  constructor(
    readonly point: string,
    options: { readonly cause: unknown },
  ) {
    super(`Target-integrate operation was interrupted at ${point}.`, options);
    this.name = "TargetIntegrationInterruptedError";
  }
}

export class TargetIntegrationBlockedError extends Error {
  constructor(
    readonly operationId: string,
    message: string,
  ) {
    super(`Target-integrate operation ${operationId} is blocked: ${message}`);
    this.name = "TargetIntegrationBlockedError";
  }
}

function telemetryCandidate(
  workingDirectory: string,
  baseCommit: string,
): TelemetryCandidate | null {
  const query = (args: readonly string[]): string | null => {
    const result = spawnSync("git", ["-C", workingDirectory, ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const commit = query(["rev-parse", "HEAD"]);
  const tree = query(["rev-parse", "HEAD^{tree}"]);
  const status = query(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (
    !/^[0-9a-f]{40}$/.test(baseCommit) ||
    !commit ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    !tree ||
    !/^[0-9a-f]{40}$/.test(tree) ||
    status === null
  )
    return null;
  return { baseCommit, commit, tree, dirty: status.length > 0 };
}

function activeRun(
  id: string,
  artifactDirectory: string,
  startedAt: Date,
  wallClockMs: number,
): RunState {
  return {
    id,
    status: "running",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    deadlineAt: new Date(startedAt.getTime() + wallClockMs).toISOString(),
    milestonesProcessed: 0,
    consecutiveInfrastructureFailures: 0,
    usage: {
      codexInvocations: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
    plannerThreadIds: [],
    agentInvocations: [],
    stopReason: null,
    artifactDirectory,
  };
}

function workerPrompt(
  project: ProjectProfile,
  milestone: MilestoneRecord,
  relevantDiff: string | null,
): string {
  const feedback = milestone.retryFeedback;
  const replacement =
    milestone.workerPolicy.activeRole === "feature-worker-escalated";
  return [
    `You are the Worker for one approved ${project.name} milestone in an isolated local clone.`,
    `Read ${project.authorityFile}, AGENTS.md, everything under .agent, relevant architecture and verification docs, then inspect the current branch before acting.`,
    "Inspect, plan, implement, run the milestone's focused tests, and document only the approved bounded milestone below. The external controller will run the declared verification commands, pnpm verify, and independent review after your turn.",
    "Do not modify any path outside permittedPaths. Do not weaken tests, edit frozen authority/evals, activate readiness unless explicitly in scope, implement unrelated features, use hidden validation, or expose/request hidden seeds.",
    "Do not spawn subagents or perform an independent review. Do not run the full pnpm verify unless it is explicitly a focused milestone test; avoid duplicating the controller's authoritative work.",
    "Use ordinary repository commands and the existing exact toolchain. Attempt to commit the finished change and leave the tree clean. If the workspace sandbox denies writes to Git metadata, do not work around it: leave only approved working-tree changes for the controller's scope-checked checkpoint. Do not push, rewrite history, merge, or contact external services.",
    `Approved milestone: ${JSON.stringify(milestone.proposal)}.`,
    replacement
      ? `This is a replacement max-reasoning worker thread. Escalation reason: ${milestone.workerPolicy.escalationReason}. Prior thread lineage: ${JSON.stringify(milestone.workerThreadLineage)}. Prior attempt summaries: ${JSON.stringify(milestone.workerPolicy.failures)}. Prior sanitized verification evidence: ${JSON.stringify(replacementVerificationEvidence(milestone))}. Prior reviewer evidence: ${JSON.stringify(milestone.reviewerDecisions)}. Relevant current diff: ${relevantDiff ?? "No committed attempt diff exists."}. Remaining machine/reviewer failures: ${feedback ?? "No additional feedback was recorded."}`
      : feedback
        ? `This is a retry in the same recorded thread and policy. Correct the failure using this machine/reviewer feedback without rewriting prior commits: ${feedback}`
        : "This is the initial attempt. Produce objective evidence for every acceptance criterion.",
    `The verified base commit is ${milestone.workspace?.baseCommit ?? "unavailable"}.`,
  ].join("\n\n");
}

function replacementVerificationEvidence(
  milestone: MilestoneRecord,
): readonly Record<string, unknown>[] {
  return milestone.verificationSummaries.map((summary) => ({
    attempt: summary.attempt,
    status: summary.status,
    disposition: summary.disposition,
    failureKind: summary.failureKind,
    summary: summary.summary,
    failedCommandCategories: summary.commands
      .filter((command) => command.status !== "PASS")
      .map((command) => ({ id: command.id, status: command.status })),
  }));
}

function replacementDiff(milestone: MilestoneRecord): string | null {
  if (
    milestone.workerPolicy.activeRole !== "feature-worker-escalated" ||
    !milestone.workspace
  )
    return null;
  const result = spawnSync(
    "git",
    [
      "-C",
      milestone.workspace.path,
      "diff",
      "--no-ext-diff",
      "--unified=3",
      `${milestone.workspace.baseCommit}..HEAD`,
      "--",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot prepare replacement-worker diff context: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  const redacted = redactSensitiveText(result.stdout);
  return redacted.length > 50_000
    ? `${redacted.slice(0, 50_000)}...[TRUNCATED]`
    : redacted || "No committed attempt diff exists.";
}

function feedbackFromVerification(summary: VerificationSummary): string {
  return redactSensitiveText(
    JSON.stringify({
      status: summary.status,
      failureKind: summary.failureKind,
      summary: summary.summary,
      commands: summary.commands.map((command) => ({
        id: command.id,
        status: command.status,
        exitCode: command.exitCode,
        message: command.message,
        stdoutPath: command.stdoutPath,
        stderrPath: command.stderrPath,
      })),
      changedPaths: summary.changedPaths,
      artifacts: summary.artifactPaths,
    }),
  );
}

function feedbackFromReview(report: ReviewerReport): string {
  return redactSensitiveText(
    JSON.stringify({
      decision: report.decision,
      summary: report.summary,
      findings: report.findings,
      checks: report.checks,
    }),
  );
}

export interface ReadinessLifecycleInspection {
  readonly profile: "bootstrap" | "readiness";
  readonly candidateHasMarker: boolean;
  readonly markerCommitAtOrBeforeBase: string | null;
  readonly markerCommitAtOrBeforeCandidate: string | null;
}

const READINESS_MARKER_PATH = ".agent/readiness-profile-activated.json";
const READINESS_FOUNDATION_STAGE_IDS = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "contract-integrity",
] as const;

function gitMarkerHistoryCommit(
  workspacePath: string,
  revision: string,
): string | null {
  const result = spawnSync(
    "git",
    [
      "-C",
      workspacePath,
      "log",
      "-1",
      "--format=%H",
      revision,
      "--",
      READINESS_MARKER_PATH,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot inspect readiness-marker Git history at ${revision}: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim() || null;
}

function candidateHasReadinessMarker(workspacePath: string): boolean {
  const result = spawnSync(
    "git",
    ["-C", workspacePath, "cat-file", "-e", `HEAD:${READINESS_MARKER_PATH}`],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status === null)
    throw new Error(
      `Cannot inspect the candidate readiness marker: ${result.error?.message ?? "Git did not return a status"}.`,
    );
  return result.status === 0;
}

export function inspectReadinessLifecycle(
  workspacePath: string,
  baseCommit: string,
): ReadinessLifecycleInspection {
  return {
    profile: currentVerificationProfile(workspacePath),
    candidateHasMarker: candidateHasReadinessMarker(workspacePath),
    markerCommitAtOrBeforeBase: gitMarkerHistoryCommit(
      workspacePath,
      baseCommit,
    ),
    markerCommitAtOrBeforeCandidate: gitMarkerHistoryCommit(
      workspacePath,
      "HEAD",
    ),
  };
}

function sameStringSequence(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function readinessHistoryEvidenceForCandidate(
  milestones: readonly MilestoneRecord[],
  lifecycle: ReadinessLifecycleInspection,
): ReadinessHistoryEvidence | undefined {
  const passingStageIds = new Set<string>();
  let readinessRecordCount = 0;
  for (const milestone of milestones) {
    if (milestone.status !== "completed") continue;
    const verification = milestone.verificationSummaries.at(-1);
    const authoritative = verification?.authoritative;
    if (!authoritative || authoritative.profileId !== "readiness") continue;
    const stageSetsAreConsistent =
      authoritativeStageSetsAreConsistent(authoritative);
    const expectedPreviousStageIds = [...passingStageIds].sort();
    const historyRecordIsConsistent =
      readinessRecordCount === 0
        ? authoritative.readinessHistoryMode === "first-readiness-transition" &&
          authoritative.previouslyPassingStageIds.length === 0
        : authoritative.readinessHistoryMode === "durable-records" &&
          sameStringSequence(
            authoritative.previouslyPassingStageIds,
            expectedPreviousStageIds,
          );
    const completionRecordIsConsistent =
      authoritative?.disposition === "completion-eligible" &&
      authoritative.status === "PASS" &&
      authoritative.exitCode === 0 &&
      authoritative.completionEligible === true &&
      authoritative.autonomousReadinessEquivalent === true &&
      stageSetsAreConsistent &&
      authoritative.notReadyStageIds.length === 0;
    const incrementalRecordIsConsistent =
      authoritative.disposition === "incremental-readiness" &&
      authoritative.status === "NOT_READY" &&
      authoritative.exitCode === 2 &&
      authoritative.completionEligible === false &&
      authoritative.autonomousReadinessEquivalent === false &&
      stageSetsAreConsistent &&
      authoritative.notReadyStageIds.length > 0;
    const recordIsUntrustworthy =
      verification?.status !== "PASS" ||
      !verification.executionProvider?.completionEligible ||
      !authoritative.executionProvider?.completionEligible ||
      !executionProviderIdentitiesEqual(
        verification.executionProvider,
        authoritative.executionProvider,
      ) ||
      verification.disposition !== authoritative.disposition ||
      verification.failureKind !== null ||
      authoritative.completionClaim !== "autonomous_readiness" ||
      authoritative.profileAutonomousReadinessEquivalent !== true ||
      !historyRecordIsConsistent ||
      (!completionRecordIsConsistent && !incrementalRecordIsConsistent) ||
      !milestone.workspace ||
      milestone.commits.at(-1) !== authoritative.candidateCommit ||
      milestone.workspace.headCommit !== authoritative.candidateCommit;
    if (recordIsUntrustworthy)
      throw new Error(
        `Cannot prove monotonic readiness history from completed milestone ${milestone.proposal.id}.`,
      );
    if (
      READINESS_FOUNDATION_STAGE_IDS.some(
        (stageId) => !authoritative.passingStageIds.includes(stageId),
      )
    )
      throw new Error(
        `Cannot prove monotonic readiness history from completed milestone ${milestone.proposal.id}.`,
      );
    for (const stageId of authoritative.passingStageIds) {
      if (typeof stageId === "string" && stageId.length > 0)
        passingStageIds.add(stageId);
    }
    readinessRecordCount += 1;
  }

  const markerHistoryExists =
    lifecycle.markerCommitAtOrBeforeCandidate !== null;
  if (lifecycle.profile === "bootstrap") {
    if (
      lifecycle.candidateHasMarker ||
      markerHistoryExists ||
      readinessRecordCount > 0
    )
      throw new Error(
        "Cannot prove the one-way readiness lifecycle for a bootstrap candidate.",
      );
    return undefined;
  }

  if (!lifecycle.candidateHasMarker || !markerHistoryExists)
    throw new Error(
      "Cannot prove readiness history because the committed candidate marker is missing.",
    );
  const firstReadinessTransition =
    lifecycle.markerCommitAtOrBeforeBase === null;
  if (readinessRecordCount === 0) {
    if (!firstReadinessTransition)
      throw new Error(
        "Cannot prove monotonic readiness history: durable controller records are missing after readiness activation.",
      );
    return {
      mode: "first-readiness-transition",
      previouslyPassingStageIds: [],
    };
  }
  if (firstReadinessTransition)
    throw new Error(
      "Cannot prove monotonic readiness history: controller records predate the first committed readiness transition.",
    );
  return {
    mode: "durable-records",
    previouslyPassingStageIds: [...passingStageIds].sort(),
  };
}

export class MilestoneOrchestrator {
  readonly repositoryRoot: string;
  readonly config: OrchestratorConfig;
  readonly store: StateStore;
  private stateValue: OrchestratorState;
  private readonly gateway: CodexGateway;
  private readonly now: () => Date;
  private readonly createRunId: () => string;
  private readonly createWorkspaceOperationId: () => string;
  private readonly createCandidatePrepareOperationId: () => string;
  private readonly createTargetIntegrationOperationId: () => string;
  private readonly createWorkspaceCleanupOperationId: () => string;
  private readonly workspaceCreateHooks: WorkspaceCreateHooks;
  private readonly candidatePrepareHooks: CandidatePrepareHooks;
  private readonly targetIntegrationHooks: TargetIntegrationHooks;
  private readonly workspaceCleanupHooks: WorkspaceCleanupHooks;
  private readonly retentionApplyHooks: RetentionApplyHooks;
  private readonly evidencePlanner: typeof planManagedEvidenceRuns;
  private readonly evidenceDiscovery: typeof discoverManagedEvidenceRuns;
  private readonly telemetryStoreOpen: typeof TelemetryStore.open;
  private readonly lease: ControllerLease;
  private telemetryValue: TelemetryStore | null = null;

  private constructor(input: {
    repositoryRoot: string;
    config: OrchestratorConfig;
    store: StateStore;
    state: OrchestratorState;
    gateway: CodexGateway;
    now: () => Date;
    createRunId: () => string;
    createWorkspaceOperationId: () => string;
    createCandidatePrepareOperationId: () => string;
    createTargetIntegrationOperationId: () => string;
    createWorkspaceCleanupOperationId: () => string;
    workspaceCreateHooks: WorkspaceCreateHooks;
    candidatePrepareHooks: CandidatePrepareHooks;
    targetIntegrationHooks: TargetIntegrationHooks;
    workspaceCleanupHooks: WorkspaceCleanupHooks;
    retentionApplyHooks: RetentionApplyHooks;
    evidencePlanner: typeof planManagedEvidenceRuns;
    evidenceDiscovery: typeof discoverManagedEvidenceRuns;
    telemetryStoreOpen: typeof TelemetryStore.open;
    lease: ControllerLease;
  }) {
    this.repositoryRoot = input.repositoryRoot;
    this.config = input.config;
    this.store = input.store;
    this.stateValue = input.state;
    this.gateway = input.gateway;
    this.now = input.now;
    this.createRunId = input.createRunId;
    this.createWorkspaceOperationId = input.createWorkspaceOperationId;
    this.createCandidatePrepareOperationId =
      input.createCandidatePrepareOperationId;
    this.createTargetIntegrationOperationId =
      input.createTargetIntegrationOperationId;
    this.createWorkspaceCleanupOperationId =
      input.createWorkspaceCleanupOperationId;
    this.workspaceCreateHooks = {
      fault: async (point, operation) => {
        if (!input.workspaceCreateHooks.fault) return;
        try {
          await input.workspaceCreateHooks.fault(point, operation);
        } catch (error) {
          throw new WorkspaceCreateInterruptedError(point, { cause: error });
        }
      },
    };
    this.candidatePrepareHooks = {
      fault: async (point, operation) => {
        if (!input.candidatePrepareHooks.fault) return;
        try {
          await input.candidatePrepareHooks.fault(point, operation);
        } catch (error) {
          throw new CandidatePrepareInterruptedError(point, { cause: error });
        }
      },
    };
    this.targetIntegrationHooks = {
      fault: async (point, operation) => {
        if (!input.targetIntegrationHooks.fault) return;
        try {
          await input.targetIntegrationHooks.fault(point, operation);
        } catch (error) {
          throw new TargetIntegrationInterruptedError(point, { cause: error });
        }
      },
    };
    this.workspaceCleanupHooks = {
      fault: async (point, operation) => {
        if (!input.workspaceCleanupHooks.fault) return;
        try {
          await input.workspaceCleanupHooks.fault(point, operation);
        } catch (error) {
          throw new WorkspaceCleanupInterruptedError(point, { cause: error });
        }
      },
    };
    this.retentionApplyHooks = input.retentionApplyHooks;
    this.evidencePlanner = input.evidencePlanner;
    this.evidenceDiscovery = input.evidenceDiscovery;
    this.telemetryStoreOpen = input.telemetryStoreOpen;
    this.lease = input.lease;
  }

  static async open(
    repositoryRoot: string,
    configPath?: string,
    dependencies: OrchestratorDependencies = {},
  ): Promise<MilestoneOrchestrator> {
    const root = resolve(repositoryRoot);
    const config = await loadConfig(root, configPath);
    if (existsSync(resolve(root, DEFAULT_VERIFICATION_MANIFEST_PATH))) {
      const manifest = await loadActiveVerificationManifest(root);
      assertManifestProtectedPathsCovered(
        manifest.value,
        buildCanonicalProtectedSet(config),
      );
    }
    const lease = await ControllerLease.acquire({
      repositoryRoot: root,
      statePath: config.statePath,
      operation: dependencies.leaseOperation ?? "run",
    });
    try {
      return await MilestoneOrchestrator.openLeased(
        root,
        config,
        lease,
        dependencies,
      );
    } catch (error) {
      await lease.release().catch(() => undefined);
      throw error;
    }
  }

  private static async openLeased(
    root: string,
    config: OrchestratorConfig,
    lease: ControllerLease,
    dependencies: OrchestratorDependencies,
  ): Promise<MilestoneOrchestrator> {
    const now = dependencies.now ?? (() => new Date());
    const store = new StateStore(root, config.statePath, () => iso(now));
    let state = await store.loadForMutation();
    const target =
      state?.pendingOperation?.kind === "target-integrate"
        ? { head: gitHead(root) }
        : inspectTarget(root, config.targetBranch);
    if (!state) {
      const discover =
        dependencies.evidenceDiscovery ?? discoverManagedEvidenceRuns;
      const [verificationRuns, controllerRuns] = await Promise.all([
        discover(resolve(root, config.evidenceRetention.artifactRoot)),
        discover(resolve(root, config.artifactRoot), "controller-run-summary"),
      ]);
      state = await store.initialize(
        createInitialState({
          repositoryRoot: root,
          targetBranch: config.targetBranch,
          verifiedCommit: target.head,
          protectedFiles: await captureProtectedFiles(
            root,
            config.protectedPaths,
          ),
          now: iso(now),
          legacyEvidenceRunIds: [
            ...new Set(
              [...verificationRuns, ...controllerRuns].map((run) => run.id),
            ),
          ],
        }),
      );
    }
    if (
      resolve(state.repository.root) !== root ||
      state.repository.targetBranch !== config.targetBranch
    )
      throw new Error(
        "Stored orchestrator repository identity does not match configuration.",
      );
    if (state.reconciliation.active)
      throw new Error(
        "Active controller reconciliation must resume before ordinary orchestration.",
      );
    const instance = new MilestoneOrchestrator({
      repositoryRoot: root,
      config,
      store,
      state,
      gateway: dependencies.gateway ?? new SdkCodexGateway(config),
      now,
      createRunId: dependencies.createRunId ?? (() => safeRunId(now())),
      createWorkspaceOperationId:
        dependencies.createWorkspaceOperationId ??
        (() => `workspace-create-${randomUUID()}`),
      createCandidatePrepareOperationId:
        dependencies.createCandidatePrepareOperationId ??
        (() => `candidate-prepare-${randomUUID()}`),
      createTargetIntegrationOperationId:
        dependencies.createTargetIntegrationOperationId ??
        (() => `target-integrate-${randomUUID()}`),
      createWorkspaceCleanupOperationId:
        dependencies.createWorkspaceCleanupOperationId ??
        (() => `workspace-cleanup-${randomUUID()}`),
      workspaceCreateHooks: dependencies.workspaceCreateHooks ?? {},
      candidatePrepareHooks: dependencies.candidatePrepareHooks ?? {},
      targetIntegrationHooks: dependencies.targetIntegrationHooks ?? {},
      workspaceCleanupHooks: dependencies.workspaceCleanupHooks ?? {},
      retentionApplyHooks: dependencies.retentionApplyHooks ?? {},
      evidencePlanner: dependencies.evidencePlanner ?? planManagedEvidenceRuns,
      evidenceDiscovery:
        dependencies.evidenceDiscovery ?? discoverManagedEvidenceRuns,
      telemetryStoreOpen:
        dependencies.telemetryStoreOpen ?? TelemetryStore.open,
      lease,
    });
    instance.assertStoredPaths();
    await instance.recoverPendingOperation();
    const canonical = enforcementProtectedPatterns(
      config,
      instance.stateValue.repository.protectedFiles,
    );
    const known = new Set(
      instance.stateValue.repository.protectedFiles.map((file) =>
        casefoldPathKey(file.path),
      ),
    );
    const missingProtectedPaths = canonical.filter(
      (path) => !known.has(casefoldPathKey(path)),
    );
    if (missingProtectedPaths.length > 0) {
      const added = await captureProtectedFiles(root, missingProtectedPaths);
      await instance.persist({
        ...instance.stateValue,
        repository: {
          ...instance.stateValue.repository,
          protectedFiles: [
            ...instance.stateValue.repository.protectedFiles,
            ...added,
          ],
        },
      });
    }
    instance.assertStoredAgentPolicies();
    await instance.reconcileTarget(
      inspectTarget(root, config.targetBranch).head,
    );
    await instance.initializeEvidenceRetention();
    await instance.reconcileTerminalWorkspaceCleanup();
    await assertProtectedFiles(
      root,
      instance.stateValue.repository.protectedFiles,
    );
    return instance;
  }

  get state(): OrchestratorState {
    return this.stateValue;
  }

  async close(): Promise<void> {
    await this.lease.release();
  }

  static async inspect(
    repositoryRoot: string,
    configPath?: string,
  ): Promise<OrchestratorInspection> {
    const root = resolve(repositoryRoot);
    const config = await loadConfig(root, configPath);
    const store = new StateStore(root, config.statePath);
    const [state, stateStorage] = await Promise.all([
      store.load(),
      store.inspect(),
    ]);
    const targetHead = gitHead(root);
    const lease = await ControllerLease.inspect(root, config.statePath);
    if (!state)
      return {
        state: null,
        stateStorage,
        targetHead,
        targetDrift: null,
        pendingWorkspaceCleanups: 0,
        pendingOperation: null,
        protectedIntegrity: "uninitialized",
        lease,
        nextAllowedAction: "plan",
      };
    const driftedPaths: string[] = [];
    for (const file of state.repository.protectedFiles) {
      const absolute = resolve(root, file.path);
      if (!existsSync(absolute)) {
        driftedPaths.push(file.path);
        continue;
      }
      const actual = createHash("sha256")
        .update(await readFile(absolute))
        .digest("hex");
      if (actual !== file.sha256) driftedPaths.push(file.path);
    }
    const pendingOperation = state.pendingOperation
      ? {
          operation: state.pendingOperation,
          recovery:
            state.pendingOperation.kind === "workspace-create"
              ? await inspectWorkspaceCreateOperation(state.pendingOperation)
              : state.pendingOperation.kind === "candidate-prepare"
                ? await inspectCandidatePrepareOperation({
                    operation: state.pendingOperation,
                    milestone: milestoneById(
                      state,
                      state.pendingOperation.milestoneId,
                    ),
                    protectedPatterns: enforcementProtectedPatterns(
                      config,
                      state.repository.protectedFiles,
                    ),
                    protectedFiles: state.repository.protectedFiles,
                  })
                : state.pendingOperation.kind === "target-integrate"
                  ? await inspectTargetIntegrationOperation(
                      state.pendingOperation,
                    )
                  : state.pendingOperation.kind === "workspace-cleanup"
                    ? await inspectWorkspaceCleanupOperation(
                        state.pendingOperation,
                      )
                    : await inspectRetentionApplyOperation(
                        state.pendingOperation,
                      ),
        }
      : null;
    return {
      state,
      stateStorage,
      targetHead,
      targetDrift:
        targetHead === state.repository.verifiedCommit
          ? null
          : {
              storedVerifiedCommit: state.repository.verifiedCommit,
              actualHead: targetHead,
            },
      pendingWorkspaceCleanups: state.milestones.filter(
        (milestone) =>
          milestone.workspace !== null &&
          (milestone.workspace.cleanup.status === "pending" ||
            milestone.workspace.cleanup.status === "failed"),
      ).length,
      pendingOperation,
      protectedIntegrity:
        driftedPaths.length === 0 ? "verified" : { driftedPaths },
      lease,
      nextAllowedAction: state.nextAllowedAction,
    };
  }

  private assertStoredPaths(): void {
    const runDirectory = this.stateValue.run.artifactDirectory;
    if (
      runDirectory &&
      !strictlyContained(
        resolve(this.repositoryRoot, this.config.artifactRoot),
        runDirectory,
      )
    )
      throw new Error(
        "Stored run artifact directory escapes its configured root.",
      );
    const workspaceRoot = resolve(
      this.repositoryRoot,
      this.config.workspaceRoot,
    );
    for (const milestone of this.stateValue.milestones) {
      if (
        milestone.workspace &&
        !strictlyContained(workspaceRoot, milestone.workspace.path)
      )
        throw new Error(
          `Stored workspace for ${milestone.proposal.id} escapes its configured root.`,
        );
      const archive = milestone.workspace?.cleanup.diagnosticArchivePath;
      if (
        archive &&
        !strictlyContained(
          resolve(this.repositoryRoot, this.config.artifactRoot),
          archive,
        )
      )
        throw new Error(
          `Stored diagnostic archive for ${milestone.proposal.id} escapes its configured root.`,
        );
    }
    const operation = this.stateValue.pendingOperation;
    if (operation?.kind === "workspace-create") {
      const planned = planWorkspaceCreateOperation({
        operationId: operation.id,
        inputStateGeneration: operation.inputStateGeneration,
        inputStateRevision: operation.inputStateRevision,
        repositoryRoot: this.repositoryRoot,
        configuredWorkspaceRoot: this.config.workspaceRoot,
        targetBranch: this.config.targetBranch,
        baseCommit: operation.baseCommit,
        runId: operation.runId,
        milestoneId: operation.milestoneId,
        attempt: operation.attempt,
        now: operation.createdAt,
      });
      if (
        operation.repositoryRoot !== planned.repositoryRoot ||
        operation.workspaceRoot !== planned.workspaceRoot ||
        operation.temporaryPath !== planned.temporaryPath ||
        operation.finalPath !== planned.finalPath ||
        operation.branch !== planned.branch
      )
        throw new Error(
          `Pending workspace-create operation ${operation.id} has non-canonical controller paths.`,
        );
    } else if (operation?.kind === "candidate-prepare") {
      const milestone = milestoneById(this.stateValue, operation.milestoneId);
      const attemptDirectory = this.attemptDirectory(milestone);
      if (
        operation.repositoryRoot !== this.repositoryRoot ||
        operation.workspaceRoot !==
          resolve(this.repositoryRoot, this.config.workspaceRoot) ||
        operation.workspacePath !== milestone.workspace?.path ||
        operation.workerEventsPath !==
          resolve(attemptDirectory, "worker-events.jsonl") ||
        operation.workerTurnPath !==
          resolve(attemptDirectory, "worker-turn.json") ||
        operation.checkpointArtifactPath !==
          resolve(attemptDirectory, "controller-checkpoint.json")
      )
        throw new Error(
          `Pending candidate-prepare operation ${operation.id} has non-canonical controller paths.`,
        );
    } else if (operation?.kind === "target-integrate") {
      if (!operation.executionProvider?.completionEligible)
        throw new Error(
          `Pending target-integrate operation ${operation.id} lacks completion-eligible execution-provider evidence.`,
        );
      const milestone = milestoneById(this.stateValue, operation.milestoneId);
      const planned = planTargetIntegrateOperation({
        operationId: operation.id,
        inputStateGeneration: operation.inputStateGeneration,
        inputStateRevision: operation.inputStateRevision,
        repositoryRoot: this.repositoryRoot,
        targetBranch: this.config.targetBranch,
        expectedBaseCommit: operation.expectedBaseCommit,
        workspacePath: operation.workspacePath,
        workspaceBranch: operation.workspaceBranch,
        candidate: operation.candidate,
        verificationResultSha256: operation.verificationResultSha256,
        executionProvider: operation.executionProvider,
        commits: operation.commits,
        outcomePath: resolve(
          this.attemptDirectory(milestone),
          "git-outcome.json",
        ),
        runId: operation.runId,
        milestoneId: operation.milestoneId,
        attempt: operation.attempt,
        now: operation.createdAt,
      });
      if (
        operation.repositoryRoot !== planned.repositoryRoot ||
        operation.workspacePath !== planned.workspacePath ||
        operation.outcomePath !== planned.outcomePath ||
        operation.outcomeTemporaryPath !== planned.outcomeTemporaryPath
      )
        throw new Error(
          `Pending target-integrate operation ${operation.id} has non-canonical controller paths.`,
        );
    } else if (operation?.kind === "workspace-cleanup") {
      const workspaceRoot = resolve(
        this.repositoryRoot,
        this.config.workspaceRoot,
      );
      const artifactRoot = resolve(
        this.repositoryRoot,
        this.config.artifactRoot,
      );
      const diagnosticArchivePath =
        operation.reason === "failed-delete-after-diagnostics" &&
        operation.runArtifactDirectory
          ? resolve(
              operation.runArtifactDirectory,
              "workspace-diagnostics",
              operation.milestoneId,
            )
          : null;
      if (
        operation.repositoryRoot !== this.repositoryRoot ||
        operation.workspaceRoot !== workspaceRoot ||
        operation.artifactRoot !== artifactRoot ||
        operation.workspacePath !==
          milestoneById(this.stateValue, operation.milestoneId).workspace
            ?.path ||
        operation.runArtifactDirectory !==
          this.stateValue.run.artifactDirectory ||
        operation.diagnosticArchivePath !== diagnosticArchivePath
      )
        throw new Error(
          `Pending workspace-cleanup operation ${operation.id} has non-canonical controller paths.`,
        );
    } else if (operation?.kind === "retention-apply") {
      const verificationRoot = resolve(
        this.repositoryRoot,
        this.config.evidenceRetention.artifactRoot,
      );
      const controllerRoot = resolve(
        this.repositoryRoot,
        this.config.artifactRoot,
      );
      const applyDirectory = resolve(
        this.repositoryRoot,
        "artifacts",
        "orchestrator",
        "retention",
        "apply",
        operation.planSha256,
      );
      if (
        operation.repositoryRoot !== this.repositoryRoot ||
        operation.verificationArtifactRoot !== verificationRoot ||
        operation.controllerArtifactRoot !== controllerRoot ||
        operation.applyDirectory !== applyDirectory ||
        operation.journalPath !== resolve(applyDirectory, "journal.jsonl") ||
        operation.resultPath !== resolve(applyDirectory, "apply-result.json")
      )
        throw new Error(
          `Pending retention-apply operation ${operation.id} has non-canonical controller paths.`,
        );
    }
    const retentionReport = this.stateValue.evidenceRetention.lastReportPath;
    const retentionControlRoot = resolve(
      this.repositoryRoot,
      "artifacts",
      "orchestrator",
      "retention",
    );
    if (
      retentionReport &&
      !strictlyContained(
        resolve(this.repositoryRoot, this.config.artifactRoot),
        retentionReport,
      ) &&
      !strictlyContained(retentionControlRoot, retentionReport)
    )
      throw new Error(
        "Stored evidence-retention report escapes its configured root.",
      );
    const reconciliationPaths = [
      ...this.stateValue.controllerHistory.map(
        (archive) => archive.rawSourceState.path,
      ),
      ...[
        ...this.stateValue.reconciliation.history,
        ...(this.stateValue.reconciliation.active
          ? [this.stateValue.reconciliation.active]
          : []),
      ].flatMap((record) => [
        record.sourceState.path,
        record.commitRange.path,
        record.protectedComparison.path,
        record.benchmark.path,
        record.artifactInventory.path,
        record.nextProposal.path,
        ...(record.focusedEvidenceIndex
          ? [record.focusedEvidenceIndex.path]
          : []),
        ...(record.exactVerification
          ? [
              record.exactVerification.path,
              record.exactVerification.exactResult.path,
            ]
          : []),
        ...(record.independentReview ? [record.independentReview.path] : []),
        ...(record.adoption ? [record.adoption.path] : []),
      ]),
    ];
    if (
      reconciliationPaths.some((path) =>
        path.startsWith(".agent/")
          ? !strictlyContained(
              this.repositoryRoot,
              resolve(this.repositoryRoot, path),
            )
          : !strictlyContained(
              resolve(this.repositoryRoot, "artifacts"),
              resolve(this.repositoryRoot, path),
            ),
      )
    )
      throw new Error("Stored reconciliation evidence escapes its owned root.");
  }

  private assertStoredAgentPolicies(): void {
    const activeId = this.stateValue.activeMilestoneId;
    if (!activeId) return;
    const milestone = milestoneById(this.stateValue, activeId);
    if (!milestone.workerThreadId) return;
    const role = milestone.workerPolicy.activeRole;
    assertWorkerThreadPolicy({
      milestone,
      role,
      assignment: resolveAgentAssignment(this.config.agentPolicy, role),
    });
  }

  private async persist(next: OrchestratorState): Promise<void> {
    this.stateValue = await this.store.save(next);
  }

  private async workspaceCreateFault(
    point: Parameters<NonNullable<WorkspaceCreateHooks["fault"]>>[0],
    operation: WorkspaceCreateOperation,
  ): Promise<void> {
    await this.workspaceCreateHooks.fault?.(point, operation);
  }

  private async advanceWorkspaceCreateTo(
    target: "clone-started" | "clone-ready" | "publish-started" | "published",
  ): Promise<void> {
    const phases = [
      "intent-persisted",
      "clone-started",
      "clone-ready",
      "publish-started",
      "published",
    ] as const;
    const targetIndex = phases.indexOf(target);
    while (this.stateValue.pendingOperation?.kind === "workspace-create") {
      const operation = this.stateValue.pendingOperation;
      if (operation.phase === "blocked")
        throw new WorkspaceCreateBlockedError(
          operation.id,
          operation.diagnostic?.message ?? "manual reconciliation is required",
        );
      const currentIndex = phases.indexOf(operation.phase);
      if (currentIndex < 0)
        throw new Error(
          `Workspace-create operation ${operation.id} has an unknown active phase.`,
        );
      if (currentIndex >= targetIndex) return;
      const nextPhase = phases[currentIndex + 1] as
        | "clone-started"
        | "clone-ready"
        | "publish-started"
        | "published"
        | undefined;
      if (!nextPhase)
        throw new Error(
          `Workspace-create operation ${operation.id} cannot advance to ${target}.`,
        );
      await this.persist(
        advanceWorkspaceCreateOperation(
          this.stateValue,
          operation.id,
          nextPhase,
          iso(this.now),
        ),
      );
      const advanced = this.stateValue.pendingOperation;
      if (!advanced || advanced.kind !== "workspace-create")
        throw new Error(
          "Workspace-create phase advance unexpectedly cleared intent.",
        );
      const faultPoint = {
        "clone-started": "after-clone-started-state",
        "clone-ready": "after-clone-ready-state",
        "publish-started": "after-publish-started-state",
        published: "after-published-state",
      }[nextPhase] as Parameters<NonNullable<WorkspaceCreateHooks["fault"]>>[0];
      await this.workspaceCreateFault(faultPoint, advanced);
    }
  }

  private async blockWorkspaceCreate(
    inspection: WorkspaceCreateRecoveryInspection,
  ): Promise<never> {
    const operation = this.stateValue.pendingOperation;
    if (!operation || operation.kind !== "workspace-create")
      throw new Error(
        "Cannot block a workspace-create operation that is absent.",
      );
    if (operation.phase === "blocked")
      throw new WorkspaceCreateBlockedError(
        operation.id,
        operation.diagnostic?.message ?? inspection.message,
      );
    if (
      ![
        "ambiguous-paths",
        "invalid-final-workspace",
        "invalid-temporary-workspace",
        "publication-conflict",
        "workspace-root-unsafe",
      ].includes(inspection.classification)
    )
      throw new Error(
        `Cannot block recoverable workspace classification ${inspection.classification}.`,
      );
    const observedAt = iso(this.now);
    await this.persist(
      blockWorkspaceCreateOperation(this.stateValue, operation.id, {
        classification: inspection.classification as
          | "ambiguous-paths"
          | "invalid-final-workspace"
          | "invalid-temporary-workspace"
          | "publication-conflict"
          | "workspace-root-unsafe",
        message: redactSensitiveText(inspection.message),
        observedAt,
        preservedPaths: inspection.preservedPaths,
        quarantinePath: null,
      }),
    );
    throw new WorkspaceCreateBlockedError(
      operation.id,
      redactSensitiveText(inspection.message),
    );
  }

  private async recoverPendingWorkspaceCreate(): Promise<void> {
    const initial = this.stateValue.pendingOperation;
    if (!initial || initial.kind !== "workspace-create") return;
    if (initial.phase === "blocked")
      throw new WorkspaceCreateBlockedError(
        initial.id,
        initial.diagnostic?.message ?? "manual reconciliation is required",
      );
    try {
      while (this.stateValue.pendingOperation?.kind === "workspace-create") {
        const operation = this.stateValue.pendingOperation;
        const inspection = await inspectWorkspaceCreateOperation(operation);
        if (
          operation.phase === "published" &&
          inspection.classification !== "final-ready"
        )
          await this.blockWorkspaceCreate({
            ...inspection,
            classification: "publication-conflict",
            nextSafeAction: "manual-reconciliation-required",
            message:
              "The recorded final publication is no longer present as the exact intended workspace.",
          });
        switch (inspection.classification) {
          case "missing":
            await this.advanceWorkspaceCreateTo("clone-started");
            await cloneWorkspaceCreateTemporary(
              this.stateValue.pendingOperation,
              this.workspaceCreateHooks,
            );
            await this.advanceWorkspaceCreateTo("clone-ready");
            break;
          case "temporary-source-clone":
            await this.advanceWorkspaceCreateTo("clone-started");
            await finishWorkspaceCreateTemporary(
              this.stateValue.pendingOperation,
            );
            await this.workspaceCreateFault(
              "after-temporary-ready",
              this.stateValue.pendingOperation,
            );
            await this.advanceWorkspaceCreateTo("clone-ready");
            break;
          case "temporary-ready":
            await this.advanceWorkspaceCreateTo("clone-ready");
            await this.advanceWorkspaceCreateTo("publish-started");
            await publishWorkspaceCreateTemporary(
              this.stateValue.pendingOperation,
              this.workspaceCreateHooks,
            );
            break;
          case "final-ready": {
            await this.advanceWorkspaceCreateTo("published");
            const published = this.stateValue.pendingOperation;
            if (!published || published.kind !== "workspace-create")
              throw new Error("Published workspace lost its durable intent.");
            await this.persist(
              completeWorkspaceCreateOperation(this.stateValue, published.id),
            );
            return;
          }
          case "ambiguous-paths":
          case "invalid-final-workspace":
          case "invalid-temporary-workspace":
          case "publication-conflict":
          case "workspace-root-unsafe":
            await this.blockWorkspaceCreate(inspection);
        }
      }
    } catch (error) {
      if (
        error instanceof WorkspaceCreateInterruptedError ||
        error instanceof WorkspaceCreateBlockedError
      )
        throw error;
      const operation = this.stateValue.pendingOperation;
      if (!operation || operation.kind !== "workspace-create") throw error;
      const inspection = await inspectWorkspaceCreateOperation(operation);
      if (
        [
          "ambiguous-paths",
          "invalid-final-workspace",
          "invalid-temporary-workspace",
          "publication-conflict",
          "workspace-root-unsafe",
        ].includes(inspection.classification)
      )
        await this.blockWorkspaceCreate(inspection);
      throw error;
    }
  }

  private async targetIntegrationFault(
    point: Parameters<NonNullable<TargetIntegrationHooks["fault"]>>[0],
    operation: TargetIntegrateOperation,
  ): Promise<void> {
    await this.targetIntegrationHooks.fault?.(point, operation);
  }

  private async advanceTargetIntegrationTo(
    target:
      | "outcome-pending"
      | "target-update-started"
      | "target-updated"
      | "outcome-integrated",
  ): Promise<void> {
    const phases = [
      "intent-persisted",
      "outcome-pending",
      "target-update-started",
      "target-updated",
      "outcome-integrated",
    ] as const;
    const targetIndex = phases.indexOf(target);
    while (this.stateValue.pendingOperation?.kind === "target-integrate") {
      const operation = this.stateValue.pendingOperation;
      if (operation.phase === "blocked")
        throw new TargetIntegrationBlockedError(
          operation.id,
          operation.diagnostic?.message ?? "manual reconciliation is required",
        );
      const currentIndex = phases.indexOf(operation.phase);
      if (currentIndex < 0)
        throw new Error(
          `Target-integrate operation ${operation.id} has an unknown active phase.`,
        );
      if (currentIndex >= targetIndex) return;
      const nextPhase = phases[currentIndex + 1] as
        | "outcome-pending"
        | "target-update-started"
        | "target-updated"
        | "outcome-integrated"
        | undefined;
      if (!nextPhase)
        throw new Error(
          `Target-integrate operation ${operation.id} cannot advance to ${target}.`,
        );
      await this.persist(
        advanceTargetIntegrateOperation(
          this.stateValue,
          operation.id,
          nextPhase,
          iso(this.now),
        ),
      );
      const advanced = this.stateValue.pendingOperation;
      if (!advanced || advanced.kind !== "target-integrate")
        throw new Error(
          "Target-integrate phase advance unexpectedly cleared intent.",
        );
      const faultPoint = {
        "outcome-pending": "after-outcome-pending-state",
        "target-update-started": "after-target-update-started-state",
        "target-updated": "after-target-updated-state",
        "outcome-integrated": "after-outcome-integrated-state",
      }[nextPhase] as Parameters<
        NonNullable<TargetIntegrationHooks["fault"]>
      >[0];
      await this.targetIntegrationFault(faultPoint, advanced);
    }
  }

  private async blockTargetIntegration(
    inspection: TargetIntegrationRecoveryInspection,
  ): Promise<never> {
    const operation = this.stateValue.pendingOperation;
    if (!operation || operation.kind !== "target-integrate")
      throw new Error(
        "Cannot block a target-integrate operation that is absent.",
      );
    if (operation.phase === "blocked")
      throw new TargetIntegrationBlockedError(
        operation.id,
        operation.diagnostic?.message ?? inspection.message,
      );
    if (
      inspection.classification === "target-base" ||
      inspection.classification === "target-candidate"
    )
      throw new Error(
        `Cannot block recoverable target classification ${inspection.classification}.`,
      );
    const observedAt = iso(this.now);
    await this.persist(
      blockTargetIntegrateOperation(this.stateValue, operation.id, {
        classification: inspection.classification,
        message: redactSensitiveText(inspection.message),
        observedAt,
        targetHead: inspection.target.head,
        preservedPaths: inspection.preservedPaths,
        quarantinePath: null,
      }),
    );
    throw new TargetIntegrationBlockedError(
      operation.id,
      redactSensitiveText(inspection.message),
    );
  }

  private async recoverPendingTargetIntegration(): Promise<void> {
    const initial = this.stateValue.pendingOperation;
    if (!initial || initial.kind !== "target-integrate") return;
    if (initial.phase === "blocked")
      throw new TargetIntegrationBlockedError(
        initial.id,
        initial.diagnostic?.message ?? "manual reconciliation is required",
      );
    try {
      while (this.stateValue.pendingOperation?.kind === "target-integrate") {
        let operation = this.stateValue.pendingOperation;
        const inspection = await inspectTargetIntegrationOperation(operation);
        if (
          inspection.classification !== "target-base" &&
          inspection.classification !== "target-candidate"
        )
          await this.blockTargetIntegration(inspection);

        await assertProtectedFiles(
          operation.workspacePath,
          this.stateValue.repository.protectedFiles,
        );
        await assertProtectedFiles(
          operation.repositoryRoot,
          this.stateValue.repository.protectedFiles,
        );

        if (operation.phase === "intent-persisted") {
          await materializeTargetIntegrationOutcome(
            operation,
            "pending",
            this.targetIntegrationHooks,
          );
          await this.advanceTargetIntegrationTo("outcome-pending");
          operation = this.stateValue
            .pendingOperation as TargetIntegrateOperation;
        }

        if (
          operation.phase === "outcome-pending" ||
          operation.phase === "target-update-started"
        ) {
          await materializeTargetIntegrationOutcome(
            operation,
            "pending",
            this.targetIntegrationHooks,
          );
          await this.advanceTargetIntegrationTo("target-update-started");
          operation = this.stateValue
            .pendingOperation as TargetIntegrateOperation;
          const target = await inspectTargetIntegrationOperation(operation);
          if (target.classification === "target-base") {
            await fetchTargetIntegrationCandidate(
              operation,
              this.targetIntegrationHooks,
            );
            await fastForwardTargetIntegration(
              operation,
              this.targetIntegrationHooks,
            );
          } else if (target.classification !== "target-candidate") {
            await this.blockTargetIntegration(target);
          }
          await this.advanceTargetIntegrationTo("target-updated");
          operation = this.stateValue
            .pendingOperation as TargetIntegrateOperation;
        }

        if (operation.phase === "target-updated") {
          const target = await inspectTargetIntegrationOperation(operation);
          if (target.classification !== "target-candidate") {
            if (target.classification === "target-base")
              await this.blockTargetIntegration({
                ...target,
                classification: "state-target-inconsistent",
                nextSafeAction: "manual-reconciliation-required",
                message:
                  "Durable integration phase says target-updated, but target remains at the base.",
              });
            await this.blockTargetIntegration(target);
          }
          await materializeTargetIntegrationOutcome(
            operation,
            "integrated",
            this.targetIntegrationHooks,
          );
          await this.advanceTargetIntegrationTo("outcome-integrated");
          operation = this.stateValue
            .pendingOperation as TargetIntegrateOperation;
        }

        if (operation.phase === "outcome-integrated") {
          const finalInspection =
            await inspectTargetIntegrationOperation(operation);
          if (finalInspection.classification !== "target-candidate")
            await this.blockTargetIntegration(finalInspection);
          await materializeTargetIntegrationOutcome(
            operation,
            "integrated",
            this.targetIntegrationHooks,
          );
          await this.persist(
            completeTargetIntegrateOperation(this.stateValue, operation.id),
          );
          await this.targetIntegrationFault(
            "after-completion-state",
            operation,
          );
          return;
        }
      }
    } catch (error) {
      if (
        error instanceof TargetIntegrationInterruptedError ||
        error instanceof TargetIntegrationBlockedError
      )
        throw error;
      const operation = this.stateValue.pendingOperation;
      if (!operation || operation.kind !== "target-integrate") throw error;
      const inspection = await inspectTargetIntegrationOperation(operation);
      if (
        inspection.classification !== "target-base" &&
        inspection.classification !== "target-candidate"
      )
        await this.blockTargetIntegration(inspection);
      throw error;
    }
  }

  private async workspaceCleanupFault(
    point: Parameters<NonNullable<WorkspaceCleanupHooks["fault"]>>[0],
    operation: WorkspaceCleanupOperation,
  ): Promise<void> {
    await this.workspaceCleanupHooks.fault?.(point, operation);
  }

  private async advanceWorkspaceCleanupPhase(
    phase: Exclude<
      WorkspaceCleanupOperation["phase"],
      "intent-persisted" | "blocked"
    >,
  ): Promise<void> {
    const operation = this.stateValue.pendingOperation;
    if (!operation || operation.kind !== "workspace-cleanup")
      throw new Error(
        "Cannot advance a workspace-cleanup operation that is absent.",
      );
    await this.persist(
      advanceWorkspaceCleanupOperation(
        this.stateValue,
        operation.id,
        phase,
        iso(this.now),
      ),
    );
    const advanced = this.stateValue.pendingOperation;
    if (!advanced || advanced.kind !== "workspace-cleanup")
      throw new Error(
        "Workspace-cleanup phase advance unexpectedly cleared intent.",
      );
    const faultPoint = {
      "dependency-removal-started": "after-dependency-removal-started-state",
      "dependencies-removed": "after-dependencies-removed-state",
      "archive-started": "after-archive-started-state",
      "archive-ready": "after-archive-ready-state",
      "workspace-delete-started": "after-workspace-delete-started-state",
      "workspace-deleted": "after-workspace-deleted-state",
    }[phase] as Parameters<NonNullable<WorkspaceCleanupHooks["fault"]>>[0];
    await this.workspaceCleanupFault(faultPoint, advanced);
  }

  private async blockWorkspaceCleanup(
    inspection: WorkspaceCleanupRecoveryInspection,
  ): Promise<never> {
    const operation = this.stateValue.pendingOperation;
    if (!operation || operation.kind !== "workspace-cleanup")
      throw new Error(
        "Cannot block a workspace-cleanup operation that is absent.",
      );
    if (operation.phase === "blocked")
      throw new WorkspaceCleanupBlockedError(
        operation.id,
        operation.diagnostic?.message ?? inspection.message,
      );
    if (inspection.nextSafeAction !== "manual-reconciliation-required")
      throw new Error(
        `Cannot block recoverable cleanup classification ${inspection.classification}.`,
      );
    const observedAt = iso(this.now);
    await this.persist(
      blockWorkspaceCleanupOperation(this.stateValue, operation.id, {
        classification: inspection.classification as Exclude<
          WorkspaceCleanupRecoveryInspection["classification"],
          | "workspace-ready"
          | "dependencies-removed"
          | "archive-incomplete"
          | "archive-ready"
          | "workspace-deleted"
        >,
        message: redactSensitiveText(inspection.message),
        observedAt,
        preservedPaths: inspection.preservedPaths,
        quarantinePath: null,
      }),
    );
    throw new WorkspaceCleanupBlockedError(
      operation.id,
      redactSensitiveText(inspection.message),
    );
  }

  private async recoverPendingWorkspaceCleanup(): Promise<void> {
    const initial = this.stateValue.pendingOperation;
    if (!initial || initial.kind !== "workspace-cleanup") return;
    if (initial.phase === "blocked")
      throw new WorkspaceCleanupBlockedError(
        initial.id,
        initial.diagnostic?.message ?? "manual reconciliation is required",
      );
    try {
      while (this.stateValue.pendingOperation?.kind === "workspace-cleanup") {
        let operation = this.stateValue.pendingOperation;
        const inspection = await inspectWorkspaceCleanupOperation(operation);
        if (inspection.nextSafeAction === "manual-reconciliation-required")
          await this.blockWorkspaceCleanup(inspection);

        switch (inspection.classification) {
          case "workspace-ready":
            if (
              operation.reason === "completed-preserve-workspace" ||
              operation.reason === "failed-preserve-workspace"
            ) {
              if (operation.phase === "intent-persisted") {
                await this.advanceWorkspaceCleanupPhase(
                  "dependency-removal-started",
                );
                operation = this.stateValue
                  .pendingOperation as WorkspaceCleanupOperation;
              }
              await removeWorkspaceCleanupDependencies(
                operation,
                this.workspaceCleanupHooks,
              );
              await this.advanceWorkspaceCleanupPhase("dependencies-removed");
              operation = this.stateValue
                .pendingOperation as WorkspaceCleanupOperation;
              await this.persist(
                completeWorkspaceCleanupOperation(
                  this.stateValue,
                  operation.id,
                ),
              );
              await this.workspaceCleanupFault(
                "after-completion-state",
                operation,
              );
              return;
            } else {
              if (operation.phase === "intent-persisted") {
                await this.advanceWorkspaceCleanupPhase(
                  "workspace-delete-started",
                );
                operation = this.stateValue
                  .pendingOperation as WorkspaceCleanupOperation;
              }
              await deleteWorkspaceCleanupWorkspace(
                operation,
                this.workspaceCleanupHooks,
              );
              await this.advanceWorkspaceCleanupPhase("workspace-deleted");
              operation = this.stateValue
                .pendingOperation as WorkspaceCleanupOperation;
              await this.persist(
                completeWorkspaceCleanupOperation(
                  this.stateValue,
                  operation.id,
                ),
              );
              await this.workspaceCleanupFault(
                "after-completion-state",
                operation,
              );
              return;
            }
          case "dependencies-removed":
            if (operation.phase === "intent-persisted") {
              await this.advanceWorkspaceCleanupPhase(
                "dependency-removal-started",
              );
              operation = this.stateValue
                .pendingOperation as WorkspaceCleanupOperation;
            }
            if (operation.phase === "dependency-removal-started")
              await this.advanceWorkspaceCleanupPhase("dependencies-removed");
            operation = this.stateValue
              .pendingOperation as WorkspaceCleanupOperation;
            await this.persist(
              completeWorkspaceCleanupOperation(this.stateValue, operation.id),
            );
            await this.workspaceCleanupFault(
              "after-completion-state",
              operation,
            );
            return;
          case "archive-incomplete":
            if (operation.phase === "intent-persisted") {
              await this.advanceWorkspaceCleanupPhase("archive-started");
              operation = this.stateValue
                .pendingOperation as WorkspaceCleanupOperation;
            }
            await materializeWorkspaceCleanupArchive(
              operation,
              this.workspaceCleanupHooks,
            );
            await this.advanceWorkspaceCleanupPhase("archive-ready");
            await this.advanceWorkspaceCleanupPhase("workspace-delete-started");
            operation = this.stateValue
              .pendingOperation as WorkspaceCleanupOperation;
            await deleteWorkspaceCleanupWorkspace(
              operation,
              this.workspaceCleanupHooks,
            );
            await this.advanceWorkspaceCleanupPhase("workspace-deleted");
            operation = this.stateValue
              .pendingOperation as WorkspaceCleanupOperation;
            await this.persist(
              completeWorkspaceCleanupOperation(this.stateValue, operation.id),
            );
            await this.workspaceCleanupFault(
              "after-completion-state",
              operation,
            );
            return;
          case "archive-ready":
            if (operation.phase === "archive-started") {
              await this.advanceWorkspaceCleanupPhase("archive-ready");
              operation = this.stateValue
                .pendingOperation as WorkspaceCleanupOperation;
            }
            if (operation.phase === "archive-ready") {
              await this.advanceWorkspaceCleanupPhase(
                "workspace-delete-started",
              );
              operation = this.stateValue
                .pendingOperation as WorkspaceCleanupOperation;
            }
            await deleteWorkspaceCleanupWorkspace(
              operation,
              this.workspaceCleanupHooks,
            );
            await this.advanceWorkspaceCleanupPhase("workspace-deleted");
            operation = this.stateValue
              .pendingOperation as WorkspaceCleanupOperation;
            await this.persist(
              completeWorkspaceCleanupOperation(this.stateValue, operation.id),
            );
            await this.workspaceCleanupFault(
              "after-completion-state",
              operation,
            );
            return;
          case "workspace-deleted":
            if (operation.phase === "workspace-delete-started")
              await this.advanceWorkspaceCleanupPhase("workspace-deleted");
            operation = this.stateValue
              .pendingOperation as WorkspaceCleanupOperation;
            await this.persist(
              completeWorkspaceCleanupOperation(this.stateValue, operation.id),
            );
            await this.workspaceCleanupFault(
              "after-completion-state",
              operation,
            );
            return;
          default:
            await this.blockWorkspaceCleanup(inspection);
        }
      }
    } catch (error) {
      if (
        error instanceof WorkspaceCleanupInterruptedError ||
        error instanceof WorkspaceCleanupBlockedError
      )
        throw error;
      const operation = this.stateValue.pendingOperation;
      if (!operation || operation.kind !== "workspace-cleanup") throw error;
      const inspection = await inspectWorkspaceCleanupOperation(operation);
      if (inspection.nextSafeAction === "manual-reconciliation-required")
        await this.blockWorkspaceCleanup(inspection);
      throw error;
    }
  }

  private async candidatePrepareFault(
    point: Parameters<NonNullable<CandidatePrepareHooks["fault"]>>[0],
    operation: CandidatePrepareOperation,
  ): Promise<void> {
    await this.candidatePrepareHooks.fault?.(point, operation);
  }

  private async blockCandidatePrepare(
    inspection: CandidatePrepareRecoveryInspection,
  ): Promise<never> {
    const operation = this.stateValue.pendingOperation;
    if (!operation || operation.kind !== "candidate-prepare")
      throw new Error(
        "Cannot block a candidate-prepare operation that is absent.",
      );
    if (operation.phase === "blocked")
      throw new CandidatePrepareBlockedError(
        operation.id,
        operation.diagnostic?.message ?? inspection.message,
      );
    if (inspection.disposition !== "manual")
      throw new Error(
        `Cannot block automatic candidate recovery ${inspection.classification}.`,
      );
    const observedAt = iso(this.now);
    await this.persist(
      blockCandidatePrepareOperation(this.stateValue, operation.id, {
        classification: inspection.classification as Exclude<
          CandidatePrepareOperation["diagnostic"],
          null
        >["classification"],
        message: inspection.message,
        observedAt,
        observedHead: inspection.observedHead,
        preservedPaths: [operation.workspacePath],
        quarantinePath: null,
      }),
    );
    throw new CandidatePrepareBlockedError(operation.id, inspection.message);
  }

  private async recoverPendingCandidatePrepare(): Promise<void> {
    while (this.stateValue.pendingOperation?.kind === "candidate-prepare") {
      let operation = this.stateValue.pendingOperation;
      const milestone = milestoneById(this.stateValue, operation.milestoneId);
      const inspection = await inspectCandidatePrepareOperation({
        operation,
        milestone,
        protectedPatterns: this.protectedPatterns(),
        protectedFiles: this.stateValue.repository.protectedFiles,
      });
      if (inspection.disposition === "manual")
        await this.blockCandidatePrepare(inspection);
      switch (inspection.nextSafeAction) {
        case "record-worker-evidence":
          await this.persist(
            advanceCandidatePrepareOperation(
              this.stateValue,
              operation.id,
              { phase: "worker-evidence-recorded" },
              iso(this.now),
            ),
          );
          operation = this.stateValue
            .pendingOperation as CandidatePrepareOperation;
          await this.candidatePrepareFault(
            "after-worker-evidence-recorded-state",
            operation,
          );
          break;
        case "prepare-checkpoint": {
          const plan = await prepareCandidateCheckpointPlan({
            operation,
            milestone,
            protectedPatterns: this.protectedPatterns(),
            protectedFiles: this.stateValue.repository.protectedFiles,
            now: iso(this.now),
          });
          await this.persist(
            advanceCandidatePrepareOperation(
              this.stateValue,
              operation.id,
              { phase: "checkpoint-prepared", plan },
              plan.preparedAt,
            ),
          );
          operation = this.stateValue
            .pendingOperation as CandidatePrepareOperation;
          await this.candidatePrepareFault(
            "after-checkpoint-prepared-state",
            operation,
          );
          break;
        }
        case "resume-checkpoint-commit": {
          const plan = operation.checkpointPlan;
          if (!plan?.commitMessage)
            throw new Error("Authorized controller commit lacks a plan.");
          commitStagedChanges(
            operation.workspacePath,
            plan.commitMessage,
            plan.preCheckpointCommit,
            plan.expectedTree,
          );
          await this.candidatePrepareFault(
            "after-checkpoint-commit",
            operation,
          );
          break;
        }
        case "adopt-checkpoint-commit": {
          if (!inspection.checkpointResult)
            throw new Error("Adoptable checkpoint result is missing.");
          await this.persist(
            advanceCandidatePrepareOperation(
              this.stateValue,
              operation.id,
              {
                phase: "checkpoint-committed",
                result: inspection.checkpointResult,
              },
              inspection.checkpointResult.committedAt,
            ),
          );
          operation = this.stateValue
            .pendingOperation as CandidatePrepareOperation;
          await this.candidatePrepareFault(
            "after-checkpoint-committed-state",
            operation,
          );
          break;
        }
        case "materialize-checkpoint-evidence":
          await atomicWriteJson(
            operation.checkpointArtifactPath,
            candidatePrepareCheckpointArtifact(operation),
          );
          await this.candidatePrepareFault(
            "after-checkpoint-artifact",
            operation,
          );
          break;
        case "record-checkpoint-evidence":
          await this.persist(
            advanceCandidatePrepareOperation(
              this.stateValue,
              operation.id,
              { phase: "checkpoint-recorded" },
              iso(this.now),
            ),
          );
          operation = this.stateValue
            .pendingOperation as CandidatePrepareOperation;
          await this.candidatePrepareFault(
            "after-checkpoint-recorded-state",
            operation,
          );
          break;
        case "complete-candidate":
          await this.persist(
            completeCandidatePrepareOperation(
              this.stateValue,
              operation.id,
              operation.updatedAt,
            ),
          );
          await this.candidatePrepareFault("after-completion-state", operation);
          return;
        case "manual-reconciliation-required":
          await this.blockCandidatePrepare(inspection);
      }
    }
  }

  private async recoverPendingOperation(): Promise<void> {
    if (this.stateValue.pendingOperation?.kind === "workspace-create")
      await this.recoverPendingWorkspaceCreate();
    else if (this.stateValue.pendingOperation?.kind === "candidate-prepare")
      await this.recoverPendingCandidatePrepare();
    else if (this.stateValue.pendingOperation?.kind === "target-integrate")
      await this.recoverPendingTargetIntegration();
    else if (this.stateValue.pendingOperation?.kind === "workspace-cleanup")
      await this.recoverPendingWorkspaceCleanup();
    else if (this.stateValue.pendingOperation?.kind === "retention-apply")
      await recoverRetentionApplyOperation({
        state: this.stateValue,
        config: this.config,
        persist: async (next) => {
          await this.persist(next);
          return this.stateValue;
        },
        now: () => iso(this.now),
        planner: this.evidencePlanner,
        hooks: this.retentionApplyHooks,
      });
  }

  private async initializeEvidenceRetention(): Promise<void> {
    if (this.stateValue.evidenceRetention.initializedAt !== null) return;
    const [verificationRuns, controllerRuns] = await Promise.all([
      this.evidenceDiscovery(
        resolve(
          this.repositoryRoot,
          this.config.evidenceRetention.artifactRoot,
        ),
      ),
      this.evidenceDiscovery(
        resolve(this.repositoryRoot, this.config.artifactRoot),
        "controller-run-summary",
      ),
    ]);
    await this.persist({
      ...this.stateValue,
      evidenceRetention: {
        ...this.stateValue.evidenceRetention,
        initializedAt: iso(this.now),
        legacyRunIds: [
          ...new Set(
            [...verificationRuns, ...controllerRuns].map((run) => run.id),
          ),
        ].sort(),
      },
    });
  }

  private cleanupReason(
    milestone: MilestoneRecord,
  ): Exclude<WorkspaceCleanupReason, "legacy-pre-policy"> {
    if (milestone.status === "completed")
      return this.config.cleanupCompletedWorkspaces
        ? "completed-delete-workspace"
        : "completed-preserve-workspace";
    if (milestone.status === "escalated")
      return this.config.preserveFailedWorkspaces
        ? "failed-preserve-workspace"
        : "failed-delete-after-diagnostics";
    throw new Error(
      `Workspace cleanup requires a terminal milestone, observed ${milestone.status}.`,
    );
  }

  private async cleanupTerminalWorkspace(
    id: string,
    forcedReason?: "failed-preserve-workspace",
  ): Promise<{
    readonly ok: boolean;
    readonly error: string | null;
  }> {
    const milestone = milestoneById(this.stateValue, id);
    const workspace = milestone.workspace;
    if (
      !workspace ||
      !["completed", "escalated"].includes(milestone.status) ||
      ["legacy-preserved", "preserved", "deleted"].includes(
        workspace.cleanup.status,
      )
    )
      return { ok: true, error: null };

    const reason =
      forcedReason ??
      (workspace.cleanup.reason &&
      workspace.cleanup.reason !== "legacy-pre-policy"
        ? workspace.cleanup.reason
        : this.cleanupReason(milestone));
    const runId = this.stateValue.run.id;
    if (!runId)
      throw new Error("Terminal workspace cleanup requires a durable run ID.");
    const generation = this.store.mutationGeneration();
    const plannedAt = iso(this.now);
    const operation = await planWorkspaceCleanupOperation({
      operationId: this.createWorkspaceCleanupOperationId(),
      inputStateGeneration: generation.objectId,
      inputStateRevision: generation.revision,
      repositoryRoot: this.repositoryRoot,
      configuredWorkspaceRoot: this.config.workspaceRoot,
      configuredArtifactRoot: this.config.artifactRoot,
      targetBranch: this.config.targetBranch,
      verifiedCommit: this.stateValue.repository.verifiedCommit,
      workspacePath: workspace.path,
      workspaceBranch: workspace.branch,
      workspaceBaseCommit: workspace.baseCommit,
      recordedHeadCommit: workspace.headCommit,
      workspaceCreatedAt: workspace.createdAt,
      reason,
      runArtifactDirectory: this.stateValue.run.artifactDirectory,
      existingRequestedAt: workspace.cleanup.requestedAt,
      existingDiagnosticArchivePath: workspace.cleanup.diagnosticArchivePath,
      runId,
      milestoneId: milestone.proposal.id,
      attempt: milestone.attempts,
      now: plannedAt,
    });
    await this.persist(
      setWorkspaceCleanupOperation(this.stateValue, operation),
    );
    await this.workspaceCleanupFault("after-intent-persisted", operation);
    await this.recoverPendingWorkspaceCleanup();
    return { ok: true, error: null };
  }

  private async recordCleanupControllerFailure(
    id: string,
    error: string,
  ): Promise<void> {
    const stoppedAt = iso(this.now);
    if (this.stateValue.run.status === "running")
      await this.persist({
        ...this.stateValue,
        run: {
          ...this.stateValue.run,
          status: "escalated",
          finishedAt: stoppedAt,
          stopReason: `Workspace cleanup failed for ${id}: ${error}`,
        },
        nextAllowedAction: "stop",
      });
    const directory = this.stateValue.run.artifactDirectory;
    if (directory) {
      await atomicWriteJson(
        resolve(directory, "workspace-cleanup-error.json"),
        {
          schemaVersion: "1.0.0",
          milestoneId: id,
          error,
          recordedAt: stoppedAt,
        },
      );
      await this.writeRunSummary();
    }
  }

  private async reconcileTerminalWorkspaceCleanup(): Promise<void> {
    for (const milestone of this.stateValue.milestones) {
      if (!["completed", "escalated"].includes(milestone.status)) continue;
      const result = await this.cleanupTerminalWorkspace(milestone.proposal.id);
      if (!result.ok && result.error)
        await this.recordCleanupControllerFailure(
          milestone.proposal.id,
          result.error,
        );
    }
  }

  // Startup never deletes evidence: it writes an approval-ready plan.
  // Deletion happens only through the hash-approved loop:retention:apply
  // command under its own controller lease.
  private async planEvidenceRetention(): Promise<void> {
    const generatedAt = iso(this.now);
    const plan = await buildEvidenceRetentionPlan({
      repositoryRoot: this.repositoryRoot,
      config: this.config,
      state: this.stateValue,
      now: generatedAt,
      planner: this.evidencePlanner,
    });
    const reportPath = resolve(
      this.runArtifactDirectory(),
      "evidence-retention.json",
    );
    await atomicWriteJson(reportPath, plan);
    await this.persist({
      ...this.stateValue,
      evidenceRetention: {
        ...this.stateValue.evidenceRetention,
        lastPrunedAt: generatedAt,
        lastReportPath: reportPath,
      },
    });
  }

  private async reconcileTarget(targetHead: string): Promise<void> {
    if (targetHead === this.stateValue.repository.verifiedCommit) return;
    throw new Error(
      `Target HEAD ${targetHead} differs from stored verified commit ${this.stateValue.repository.verifiedCommit} without a durable target-integrate operation. Explicit external reconciliation is required.`,
    );
  }

  private runArtifactDirectory(): string {
    const directory = this.stateValue.run.artifactDirectory;
    if (!directory) throw new Error("No active run artifact directory.");
    return directory;
  }

  private async telemetryStore(
    recoverInterrupted = false,
  ): Promise<TelemetryStore> {
    if (this.telemetryValue) return this.telemetryValue;
    const runId = this.stateValue.run.id;
    const directory = this.stateValue.run.artifactDirectory;
    if (!runId || !directory)
      throw new Error("Cannot initialize telemetry without an active run.");
    const store = await this.telemetryStoreOpen({
      repositoryRoot: this.repositoryRoot,
      directory: resolve(directory, "telemetry"),
      runId,
      source: "controller",
      now: this.now,
    });
    if (recoverInterrupted) await store.recoverInterruptedPhases();
    this.telemetryValue = store;
    return store;
  }

  private async recordTelemetryDegradation(
    error: unknown,
    directoryOverride?: string,
  ): Promise<void> {
    const message = redactSensitiveText(
      error instanceof Error ? error.message : String(error),
    );
    process.stderr.write(
      `[telemetry] non-semantic controller telemetry failure: ${message}\n`,
    );
    const directory =
      directoryOverride ?? this.stateValue.run.artifactDirectory;
    if (!directory) return;
    try {
      await atomicWriteJson(resolve(directory, "telemetry-error.json"), {
        schemaVersion: "1.0.0",
        status: "ERROR",
        error: message,
        recordedAt: iso(this.now),
      });
    } catch {
      // The stderr line above is the only remaining channel when even the
      // diagnostic write fails; telemetry availability must stay non-semantic.
    }
  }

  private async finishSpanBestEffort(
    span: { finish: (input: never) => Promise<unknown> } | null,
    input: unknown,
  ): Promise<void> {
    if (!span) return;
    try {
      await span.finish(input as never);
    } catch (error) {
      await this.recordTelemetryDegradation(error);
    }
  }

  private async telemetryStoreBestEffort(
    recoverInterrupted = false,
  ): Promise<TelemetryStore | null> {
    try {
      return await this.telemetryStore(recoverInterrupted);
    } catch (error) {
      await this.recordTelemetryDegradation(error);
      return null;
    }
  }

  private async beginPhaseBestEffort(
    telemetry: TelemetryStore | null,
    input: BeginTelemetryPhaseInput,
  ): Promise<TelemetrySpan | null> {
    if (!telemetry) return null;
    try {
      return await telemetry.beginPhase(input);
    } catch (error) {
      await this.recordTelemetryDegradation(error);
      return null;
    }
  }

  private async completeTelemetry(
    status: TelemetryStatus,
    reason: string | null,
  ): Promise<void> {
    try {
      const telemetry = await this.telemetryStore();
      await telemetry.complete(status, reason);
    } catch (error) {
      await this.recordTelemetryDegradation(error);
    }
  }

  private async startRun(): Promise<void> {
    inspectTarget(
      this.repositoryRoot,
      this.config.targetBranch,
      this.stateValue.repository.verifiedCommit,
    );
    if (this.stateValue.run.status === "running") {
      await this.telemetryStoreBestEffort(true);
      return;
    }
    if (this.stateValue.run.status === "escalated")
      throw new Error(
        "Orchestrator is escalated; resolve the recorded blocker first.",
      );
    const id = this.createRunId();
    const directory = resolve(
      this.repositoryRoot,
      this.config.artifactRoot,
      id,
    );
    await mkdir(directory, { recursive: true });
    const started = this.now();
    let telemetry: TelemetryStore | null = null;
    try {
      telemetry = await this.telemetryStoreOpen({
        repositoryRoot: this.repositoryRoot,
        directory: resolve(directory, "telemetry"),
        runId: id,
        source: "controller",
        now: this.now,
      });
    } catch (error) {
      await this.recordTelemetryDegradation(error, directory);
    }
    let inspectionSpan: TelemetrySpan | null = null;
    if (telemetry) {
      try {
        inspectionSpan = await telemetry.beginPhase({
          phase: "inspection",
          eventType: "controller-start",
          operationId: `${id}-inspection`,
          candidate: telemetryCandidate(
            this.repositoryRoot,
            this.stateValue.repository.verifiedCommit,
          ),
        });
      } catch (error) {
        await this.recordTelemetryDegradation(error, directory);
      }
      this.telemetryValue = telemetry;
    }
    await atomicWriteJson(
      resolve(directory, "model-policy.json"),
      redactSensitiveValue({
        schemaVersion: this.config.agentPolicy.schemaVersion,
        installedSdk: {
          package: "@openai/codex-sdk",
          version: installedCodexSdkVersion(),
        },
        policy: this.config.agentPolicy,
        effectiveAssignments: Object.fromEntries(
          AGENT_ROLES.map((role) => [
            role,
            resolveAgentAssignment(this.config.agentPolicy, role),
          ]),
        ),
        generatedAt: started.toISOString(),
      }),
    );
    await this.persist({
      ...this.stateValue,
      run: activeRun(id, directory, started, this.config.limits.wallClockMs),
    });
    try {
      await this.planEvidenceRetention();
      await this.finishSpanBestEffort(inspectionSpan, { status: "PASS" });
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      const stoppedAt = iso(this.now);
      await this.persist({
        ...this.stateValue,
        run: {
          ...this.stateValue.run,
          status: "escalated",
          finishedAt: stoppedAt,
          stopReason: `Evidence retention failed: ${message}`,
        },
        nextAllowedAction: "stop",
      });
      await atomicWriteJson(
        resolve(directory, "evidence-retention-error.json"),
        {
          schemaVersion: "1.0.0",
          error: message,
          recordedAt: stoppedAt,
        },
      );
      await this.finishSpanBestEffort(inspectionSpan, {
        status: "ERROR",
        reason: message,
      });
      await this.writeRunSummary();
      await this.completeTelemetry("ERROR", message);
      throw new Error(`Evidence retention failed: ${message}`, {
        cause: error,
      });
    }
  }

  private checkLimits(): void {
    const run = this.stateValue.run;
    if (run.status !== "running")
      throw new Error("No running orchestrator invocation.");
    if (run.deadlineAt && this.now().getTime() >= Date.parse(run.deadlineAt))
      throw new Error("Configured orchestrator wall-clock limit was reached.");
    if (run.usage.codexInvocations >= this.config.limits.codexInvocations)
      throw new Error("Configured Codex invocation limit was reached.");
    const tokens = measurableTokenUnits(run.usage);
    if (tokens >= this.config.limits.tokenBudget)
      throw new Error("Configured measurable token budget was reached.");
  }

  private phaseTimeout(configuredMs: number): number {
    const deadline = this.stateValue.run.deadlineAt;
    if (!deadline) return configuredMs;
    return Math.max(
      1,
      Math.min(configuredMs, Date.parse(deadline) - this.now().getTime()),
    );
  }

  private accountingGateway(
    candidatePrepareOperationId?: string,
  ): CodexGateway {
    return {
      run: async (invocation: CodexInvocation): Promise<CodexTurnResult> => {
        this.checkLimits();
        const candidateOperation =
          candidatePrepareOperationId === undefined
            ? null
            : this.stateValue.pendingOperation?.kind === "candidate-prepare" &&
                this.stateValue.pendingOperation.id ===
                  candidatePrepareOperationId
              ? this.stateValue.pendingOperation
              : null;
        if (candidatePrepareOperationId !== undefined && !candidateOperation)
          throw new Error(
            `Candidate-prepare operation ${candidatePrepareOperationId} is not pending.`,
          );
        const assignment = resolveAgentAssignment(
          this.config.agentPolicy,
          invocation.role,
        );
        const escalated = invocation.role === "feature-worker-escalated";
        if (escalated !== (invocation.escalationReason !== null))
          throw new Error(
            "Controller invocation role and escalation reason are inconsistent.",
          );
        const invocationId =
          candidateOperation?.agentInvocationId ??
          `${this.stateValue.run.id ?? "run"}-agent-${this.stateValue.run.agentInvocations.length + 1}`;
        const startedAt = iso(this.now);
        const record: AgentInvocationRecord = {
          schemaVersion: AGENT_INVOCATION_SCHEMA_VERSION,
          id: invocationId,
          role: invocation.role,
          requestedModel: assignment.model,
          requestedReasoningEffort: assignment.reasoningEffort,
          resolvedModel: null,
          resolvedReasoningEffort: null,
          resolutionEvidence:
            "sdk-events-do-not-expose-resolved-model-or-effort",
          threadId: invocation.threadId,
          attempt: invocation.attempt,
          escalated,
          escalationReason: invocation.escalationReason,
          overrideApplied: assignment.overrideApplied,
          overrideReason:
            assignment.overrideReason === null
              ? null
              : redactSensitiveText(assignment.overrideReason),
          status: "starting",
          startedAt,
          finishedAt: null,
          error: null,
        };
        if (candidateOperation) {
          await this.persist(
            advanceCandidatePrepareOperation(
              this.stateValue,
              candidateOperation.id,
              { phase: "worker-invocation-started", invocation: record },
              startedAt,
            ),
          );
          await this.candidatePrepareFault(
            "after-worker-invocation-started-state",
            this.stateValue.pendingOperation as CandidatePrepareOperation,
          );
        } else
          await this.persist({
            ...this.stateValue,
            run: {
              ...this.stateValue.run,
              agentInvocations: [
                ...this.stateValue.run.agentInvocations,
                record,
              ],
              usage: {
                ...this.stateValue.run.usage,
                codexInvocations:
                  this.stateValue.run.usage.codexInvocations + 1,
              },
            },
          });
        const updateRecord = async (
          update: Partial<AgentInvocationRecord>,
        ): Promise<void> => {
          if (candidatePrepareOperationId !== undefined)
            throw new Error(
              "Candidate Worker accounting must use candidate-prepare reducers.",
            );
          await this.persist({
            ...this.stateValue,
            run: {
              ...this.stateValue.run,
              agentInvocations: this.stateValue.run.agentInvocations.map(
                (entry) =>
                  entry.id === invocationId ? { ...entry, ...update } : entry,
              ),
            },
          });
        };
        const originalThreadStarted = invocation.onThreadStarted;
        try {
          const telemetry = await this.telemetryStoreBestEffort();
          const result = await this.gateway.run({
            ...invocation,
            invocationId,
            ...(telemetry ? { telemetryStore: telemetry } : {}),
            telemetryCandidate: telemetryCandidate(
              invocation.workingDirectory,
              this.stateValue.repository.verifiedCommit,
            ),
            onThreadStarted: async (threadId) => {
              if (candidatePrepareOperationId !== undefined) {
                const pending = this.stateValue.pendingOperation;
                if (
                  !pending ||
                  pending.kind !== "candidate-prepare" ||
                  pending.id !== candidatePrepareOperationId
                )
                  throw new Error(
                    "Candidate Worker thread started without matching intent.",
                  );
                if (pending.phase === "worker-invocation-started") {
                  await this.persist(
                    advanceCandidatePrepareOperation(
                      this.stateValue,
                      pending.id,
                      { phase: "worker-thread-recorded", threadId },
                      iso(this.now),
                    ),
                  );
                  await this.candidatePrepareFault(
                    "after-worker-thread-recorded-state",
                    this.stateValue
                      .pendingOperation as CandidatePrepareOperation,
                  );
                } else if (pending.workerInvocation?.threadId !== threadId)
                  throw new Error(
                    "Candidate Worker emitted an inconsistent thread identity.",
                  );
              } else await updateRecord({ threadId });
              await originalThreadStarted?.(threadId);
            },
          });
          const usage = result.usage;
          if (candidatePrepareOperationId !== undefined) {
            const pending = this.stateValue.pendingOperation;
            if (
              !pending ||
              pending.kind !== "candidate-prepare" ||
              pending.id !== candidatePrepareOperationId
            )
              throw new Error(
                "Candidate Worker completed without matching intent.",
              );
            const finishedAt = iso(this.now);
            const artifact = candidateWorkerTurnArtifact(pending, result);
            await this.persist(
              advanceCandidatePrepareOperation(
                this.stateValue,
                pending.id,
                {
                  phase: "worker-completed",
                  result: {
                    threadId: result.threadId,
                    usage: result.usage,
                    itemCount: result.itemCount,
                    finalResponseSha256: createHash("sha256")
                      .update(redactSensitiveText(result.finalResponse))
                      .digest("hex"),
                    workerTurnSha256: candidatePrepareArtifactSha256(artifact),
                    finishedAt,
                  },
                },
                finishedAt,
              ),
            );
            await this.candidatePrepareFault(
              "after-worker-completed-state",
              this.stateValue.pendingOperation as CandidatePrepareOperation,
            );
          } else
            await this.persist({
              ...this.stateValue,
              run: {
                ...this.stateValue.run,
                agentInvocations: this.stateValue.run.agentInvocations.map(
                  (entry) =>
                    entry.id === invocationId
                      ? {
                          ...entry,
                          threadId: result.threadId,
                          status: "completed" as const,
                          finishedAt: iso(this.now),
                        }
                      : entry,
                ),
                usage: {
                  codexInvocations: this.stateValue.run.usage.codexInvocations,
                  inputTokens:
                    this.stateValue.run.usage.inputTokens +
                    (usage?.inputTokens ?? 0),
                  cachedInputTokens:
                    this.stateValue.run.usage.cachedInputTokens +
                    (usage?.cachedInputTokens ?? 0),
                  outputTokens:
                    this.stateValue.run.usage.outputTokens +
                    (usage?.outputTokens ?? 0),
                  reasoningOutputTokens:
                    this.stateValue.run.usage.reasoningOutputTokens +
                    (usage?.reasoningOutputTokens ?? 0),
                },
              },
            });
          return result;
        } catch (error) {
          if (error instanceof CandidatePrepareInterruptedError) throw error;
          if (candidatePrepareOperationId !== undefined) {
            const pending = this.stateValue.pendingOperation;
            if (
              pending?.kind === "candidate-prepare" &&
              pending.id === candidatePrepareOperationId &&
              pending.phase !== "blocked"
            ) {
              const observedAt = iso(this.now);
              await this.persist(
                blockCandidatePrepareOperation(this.stateValue, pending.id, {
                  classification: "worker-outcome-ambiguous",
                  message: redactSensitiveText(
                    `Worker invocation ended without an adoptable result: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  ),
                  observedAt,
                  observedHead: gitHead(pending.workspacePath),
                  preservedPaths: [pending.workspacePath],
                  quarantinePath: null,
                }),
              );
            }
          } else
            await updateRecord({
              status: "failed",
              finishedAt: iso(this.now),
              error: redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            });
          throw error;
        }
      },
    };
  }

  private async recordPlannerThread(threadId: string): Promise<void> {
    if (this.stateValue.run.plannerThreadIds.includes(threadId)) return;
    await this.persist({
      ...this.stateValue,
      run: {
        ...this.stateValue.run,
        plannerThreadIds: [...this.stateValue.run.plannerThreadIds, threadId],
      },
    });
  }

  private async addApprovedProposal(
    proposal: MilestoneProposal,
    decision: PolicyDecision,
    artifactDirectory: string,
    provenance: Omit<ProposalProvenance, "recordedAt">,
  ): Promise<void> {
    await atomicWriteJson(
      resolve(artifactDirectory, "policy-decision.json"),
      decision,
    );
    const now = iso(this.now);
    let next: OrchestratorState = {
      ...this.stateValue,
      milestones: [
        ...this.stateValue.milestones,
        createMilestoneRecord(proposal, now, {
          ...provenance,
          recordedAt: now,
        }),
      ],
      queue: [...this.stateValue.queue, proposal.id],
    };
    await this.persist(next);
    next = transitionMilestone(
      this.stateValue,
      proposal.id,
      "ready",
      iso(this.now),
    );
    await this.persist({ ...next, nextAllowedAction: "start-milestone" });
  }

  async enqueue(
    proposal: MilestoneProposal,
    source: {
      readonly source?: "built-in-canary" | "tracked-recommissioning-plan";
      readonly sourcePath?: string;
      readonly reason?: string | null;
    } = {},
  ): Promise<PolicyDecision> {
    await this.startRun();
    const directory = resolve(
      this.runArtifactDirectory(),
      "planning",
      proposal.id,
    );
    await mkdir(directory, { recursive: true });
    await atomicWriteJson(
      resolve(directory, "planner-proposal.json"),
      proposal,
    );
    const decision = evaluateProposal(
      proposal,
      this.stateValue,
      this.config,
      currentVerificationProfile(this.repositoryRoot),
      iso(this.now),
    );
    await atomicWriteJson(resolve(directory, "policy-decision.json"), decision);
    if (decision.status === "accepted") {
      if (
        source.source === "tracked-recommissioning-plan" &&
        !source.sourcePath
      )
        throw new Error(
          "Tracked recommissioning provenance requires an exact source path.",
        );
      const sourcePath =
        source.sourcePath ?? "tools/milestone-orchestrator/src/canary.ts";
      const normalizedSourcePath = sourcePath.replaceAll("\\", "/");
      if (
        isAbsolute(sourcePath) ||
        normalizedSourcePath.split("/").includes("..") ||
        /[\r\n\0]/.test(sourcePath)
      )
        throw new Error("Proposal provenance source path is unsafe.");
      const sourceContents = await readFile(
        resolve(this.repositoryRoot, sourcePath),
      );
      await this.addApprovedProposal(proposal, decision, directory, {
        schemaVersion: "1.0.0",
        source: source.source ?? "built-in-canary",
        sourcePath: normalizedSourcePath,
        sourceSha256: createHash("sha256").update(sourceContents).digest("hex"),
        plannerThreadId: null,
        reason: source.reason ?? null,
      });
    }
    return decision;
  }

  private async planWithinRun(): Promise<MilestoneProposal | null> {
    let threadId: string | null = null;
    let feedback: PolicyDecision | null = null;
    for (
      let attempt = 1;
      attempt <= this.config.limits.plannerProposalAttempts;
      attempt += 1
    ) {
      const directory = resolve(
        this.runArtifactDirectory(),
        "planning",
        `attempt-${attempt}`,
      );
      const result = await requestPlan({
        gateway: this.accountingGateway(),
        project: this.config.project,
        state: this.stateValue,
        artifactDirectory: directory,
        timeoutMs: this.phaseTimeout(this.config.limits.codexTurnMs),
        attempt,
        priorThreadId: threadId,
        feedback,
        onThreadStarted: async (id) => this.recordPlannerThread(id),
      });
      threadId = result.threadId;
      const decision = evaluateProposal(
        result.proposal,
        this.stateValue,
        this.config,
        currentVerificationProfile(this.repositoryRoot),
        iso(this.now),
      );
      await atomicWriteJson(
        resolve(directory, "policy-decision.json"),
        decision,
      );
      if (decision.status === "accepted") {
        await this.addApprovedProposal(result.proposal, decision, directory, {
          schemaVersion: "1.0.0",
          source: "planner",
          sourcePath: null,
          sourceSha256: null,
          plannerThreadId: result.threadId,
          reason: null,
        });
        return result.proposal;
      }
      feedback = decision;
    }
    await this.escalate(
      "PLANNER_POLICY_LIMIT",
      "Planner exhausted its proposal attempts without producing a policy-compliant milestone.",
      feedback?.findings.map((finding) => finding.message) ?? [],
    );
    return null;
  }

  async planOnly(): Promise<RunOutcome> {
    await this.startRun();
    try {
      const existing = this.stateValue.queue
        .map((id) => milestoneById(this.stateValue, id))
        .find((milestone) => milestone.status === "ready");
      if (!existing) await this.planWithinRun();
    } catch (error) {
      await this.escalate(
        "PLANNER_INVOCATION_FAILURE",
        redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
        [],
      );
    }
    if (this.stateValue.run.status === "running")
      await this.stopRun(
        "One bounded milestone is ready; no worker was launched.",
      );
    return this.outcome();
  }

  private async setReviewerThread(
    milestoneId: string,
    threadId: string,
  ): Promise<void> {
    const current = milestoneById(this.stateValue, milestoneId);
    if (current.reviewerThreadIds.includes(threadId)) return;
    await this.persist(
      replaceMilestone(this.stateValue, milestoneId, (record) => ({
        ...record,
        reviewerThreadIds: [...record.reviewerThreadIds, threadId],
        timestamps: { ...record.timestamps, updatedAt: iso(this.now) },
      })),
    );
  }

  private attemptDirectory(milestone: MilestoneRecord): string {
    return resolve(
      this.runArtifactDirectory(),
      "milestones",
      milestone.proposal.id,
      `attempt-${milestone.attempts}`,
    );
  }

  private async prepareWorkspace(
    milestone: MilestoneRecord,
    stage: "workspace-setup" | "verification-reinstall" = "workspace-setup",
  ): Promise<void> {
    if (!milestone.workspace)
      throw new Error("Cannot prepare a missing workspace.");
    const directory = resolve(this.attemptDirectory(milestone), stage);
    const telemetry = await this.telemetryStoreBestEffort();
    const result = await runCommand(
      {
        id: "frozen-install",
        executable: "pnpm",
        args: [
          "install",
          "--frozen-lockfile",
          "--offline",
          "--package-import-method=copy",
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: milestone.workspace.path,
        artifactDirectory: directory,
        timeoutMs: this.phaseTimeout(this.config.limits.commandMs),
        outputLimitBytes: this.config.limits.commandOutputLimitBytes,
        killGraceMs: this.config.limits.commandKillGraceMs,
        trustedControllerCommand: true,
        ...(telemetry
          ? {
              telemetry: {
                store: telemetry,
                phase: "inspection" as const,
                candidate: telemetryCandidate(
                  milestone.workspace.path,
                  milestone.workspace.baseCommit,
                ),
                checkSetId: stage,
                selectedCheckIds: ["frozen-install"],
                actualCheckIds: ["frozen-install"],
                retryAttempt: milestone.attempts,
              },
            }
          : {}),
      },
    );
    await atomicWriteJson(resolve(directory, `${stage}.json`), result);
    if (result.status !== "PASS")
      throw new Error(`Isolated workspace setup failed: ${result.message}`);
  }

  private protectedPatterns(): readonly string[] {
    return enforcementProtectedPatterns(
      this.config,
      this.stateValue.repository.protectedFiles,
    );
  }

  private async beginAttempt(id: string): Promise<void> {
    const transitioned = transitionMilestone(
      this.stateValue,
      id,
      "running",
      iso(this.now),
    );
    await this.persist({
      ...replaceMilestone(transitioned, id, (record) => ({
        ...record,
        attempts: record.attempts + 1,
      })),
      activeMilestoneId: id,
      nextAllowedAction: "resume-worker",
    });
    let milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace) {
      const runId = this.stateValue.run.id;
      if (!runId)
        throw new Error("Workspace creation requires an active run identity.");
      const generation = this.store.mutationGeneration();
      const operation = planWorkspaceCreateOperation({
        operationId: this.createWorkspaceOperationId(),
        inputStateGeneration: generation.objectId,
        inputStateRevision: generation.revision,
        repositoryRoot: this.repositoryRoot,
        configuredWorkspaceRoot: this.config.workspaceRoot,
        targetBranch: this.config.targetBranch,
        baseCommit: this.stateValue.repository.verifiedCommit,
        runId,
        milestoneId: id,
        attempt: milestone.attempts,
        now: iso(this.now),
      });
      await this.persist(
        setWorkspaceCreateOperation(this.stateValue, operation),
      );
      await this.workspaceCreateFault("after-intent-persisted", operation);
      await this.recoverPendingWorkspaceCreate();
      milestone = milestoneById(this.stateValue, id);
    }
    await this.prepareWorkspace(milestone);
  }

  private async runWorker(id: string): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Worker milestone has no isolated workspace.");
    const existingAttempt = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    if (
      !existingAttempt.clean ||
      (existingAttempt.commits.length > 0 && milestone.retryFeedback === null)
    ) {
      const artifactPath = resolve(
        this.attemptDirectory(milestone),
        "candidate-prepare-external-change.json",
      );
      await atomicWriteJson(artifactPath, {
        schemaVersion: "1.0.0",
        classification: "external-or-ambiguous-candidate",
        milestoneId: id,
        attempt: milestone.attempts,
        candidate: candidateIdentityFrom(
          milestone.workspace.baseCommit,
          existingAttempt,
        ),
        commits: existingAttempt.commits,
        clean: existingAttempt.clean,
        retryFeedbackPresent: milestone.retryFeedback !== null,
        pendingOperation: null,
        disposition: "preserve-and-block",
        recordedAt: iso(this.now),
      });
      await this.escalate(
        "CANDIDATE_PREPARE_EXTERNAL_CHANGE",
        "Candidate workspace contains clean or dirty changes without a matching durable candidate-prepare intent. The workspace was preserved and verification was not authorized.",
        [artifactPath],
        id,
        { preserveWorkspace: true },
      );
      return;
    }
    this.checkLimits();
    const role = milestone.workerPolicy.activeRole;
    const assignment = resolveAgentAssignment(this.config.agentPolicy, role);
    if (milestone.workerThreadId) {
      assertWorkerThreadPolicy({ milestone, role, assignment });
    }
    const prompt = workerPrompt(
      this.config.project,
      milestone,
      replacementDiff(milestone),
    );
    const attemptDirectory = this.attemptDirectory(milestone);
    const generation = this.store.mutationGeneration();
    const operation = planCandidatePrepareOperation({
      operationId: this.createCandidatePrepareOperationId(),
      inputStateGeneration: generation.objectId,
      inputStateRevision: generation.revision,
      state: this.stateValue,
      milestone,
      configuredWorkspaceRoot: this.config.workspaceRoot,
      protectedPatterns: this.protectedPatterns(),
      workerPrompt: prompt,
      workerEventsPath: resolve(attemptDirectory, "worker-events.jsonl"),
      workerTurnPath: resolve(attemptDirectory, "worker-turn.json"),
      checkpointArtifactPath: resolve(
        attemptDirectory,
        "controller-checkpoint.json",
      ),
      startingCandidate: candidateIdentityFrom(
        milestone.workspace.baseCommit,
        existingAttempt,
      ),
      startingCommits: existingAttempt.commits,
      workerAssignment: assignment,
      now: iso(this.now),
    });
    await this.persist(
      setCandidatePrepareOperation(this.stateValue, operation),
    );
    await this.candidatePrepareFault("after-intent-persisted", operation);
    const turn = await this.accountingGateway(operation.id).run({
      role,
      prompt,
      workingDirectory: milestone.workspace.path,
      threadId: milestone.workerThreadId,
      eventLogPath: operation.workerEventsPath,
      timeoutMs: this.phaseTimeout(this.config.limits.codexTurnMs),
      attempt: milestone.attempts,
      escalationReason:
        role === "feature-worker-escalated"
          ? milestone.workerPolicy.escalationReason
          : null,
      telemetryPhase: "implementation",
    });
    const pending = this.stateValue.pendingOperation;
    if (
      !pending ||
      pending.kind !== "candidate-prepare" ||
      pending.id !== operation.id ||
      pending.phase !== "worker-completed" ||
      !pending.workerResult
    )
      throw new Error(
        "Worker completed without canonical candidate-prepare result state.",
      );
    const workerArtifact = candidateWorkerTurnArtifact(pending, turn);
    if (
      candidatePrepareArtifactSha256(workerArtifact) !==
      pending.workerResult.workerTurnSha256
    )
      throw new Error("Worker turn evidence changed after durable completion.");
    await atomicWriteJson(pending.workerTurnPath, workerArtifact);
    await this.candidatePrepareFault("after-worker-evidence-artifact", pending);
    await this.recoverPendingCandidatePrepare();
  }

  private async verify(id: string): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Verification has no isolated workspace.");
    // Restore lockfile-bound toolchain content between the Worker turn and
    // verification: gitignored node_modules edits are invisible to every diff
    // and hash fence, so verification must not run whatever the Worker left
    // there. Full write-denial belongs to process sandboxing (P1.1).
    await this.prepareWorkspace(milestone, "verification-reinstall");
    const telemetry = await this.telemetryStoreBestEffort();
    const verificationSpan = await this.beginPhaseBestEffort(telemetry, {
      phase: "verification",
      eventType: "milestone-verification",
      operationId: `${this.stateValue.run.id ?? "run"}-${id}-a${milestone.attempts}-verification`,
      candidate: telemetryCandidate(
        milestone.workspace.path,
        milestone.workspace.baseCommit,
      ),
    });
    const readinessHistory = readinessHistoryEvidenceForCandidate(
      this.stateValue.milestones,
      inspectReadinessLifecycle(
        milestone.workspace.path,
        milestone.workspace.baseCommit,
      ),
    );
    let summary: VerificationSummary;
    try {
      summary = await verifyMilestone({
        runId: this.stateValue.run.id ?? "run",
        proposal: milestone.proposal,
        attempt: milestone.attempts,
        workspacePath: milestone.workspace.path,
        baseCommit: milestone.workspace.baseCommit,
        config: {
          ...this.config,
          limits: {
            ...this.config.limits,
            commandMs: this.phaseTimeout(this.config.limits.commandMs),
          },
        },
        protectedFiles: this.stateValue.repository.protectedFiles,
        artifactDirectory: resolve(
          this.attemptDirectory(milestone),
          "verification",
        ),
        ...(telemetry ? { telemetry } : {}),
        ...(readinessHistory ? { readinessHistory } : {}),
      });
      const artifactMetadata = await Promise.all(
        summary.artifactPaths.map((path) => stat(path)),
      );
      await this.finishSpanBestEffort(verificationSpan, {
        status: summary.status,
        reason: summary.status === "PASS" ? null : summary.summary,
        candidate: telemetryCandidate(
          milestone.workspace.path,
          milestone.workspace.baseCommit,
        ),
        artifacts: {
          fileCount: summary.artifactPaths.length,
          totalBytes: artifactMetadata.reduce(
            (sum, metadata) => sum + metadata.size,
            0,
          ),
          manifestReferences: summary.artifactPaths.map((path) =>
            relative(this.repositoryRoot, path).replaceAll("\\", "/"),
          ),
          receiptReferences: [],
        },
        measurementAvailability: {
          artifacts: "measured",
          tests: "unparseable",
        },
      });
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      await this.finishSpanBestEffort(verificationSpan, {
        status: "ERROR",
        reason: message,
      });
      throw error;
    }
    await this.persist(
      replaceMilestone(this.stateValue, id, (record) => ({
        ...record,
        verificationSummaries: [...record.verificationSummaries, summary],
      })),
    );
    if (summary.status !== "PASS") {
      if (summary.failureKind === "policy") {
        await this.escalate(
          "DIFF_POLICY_VIOLATION",
          summary.summary,
          summary.artifactPaths,
          id,
        );
        return;
      }
      await this.retryOrEscalate(
        id,
        summary.failureKind === "infrastructure" ? "infrastructure" : "product",
        feedbackFromVerification(summary),
        verificationFailureRecord({
          proposal: milestone.proposal,
          verification: summary,
          recordedAt: iso(this.now),
        }),
      );
      return;
    }
    const verified = summary.candidate;
    if (!verified || !verified.clean)
      throw new Error(
        "PASS verification summary lacks a clean pinned candidate identity.",
      );
    let updated = replaceMilestone(this.stateValue, id, (record) => ({
      ...record,
      workspace: record.workspace
        ? { ...record.workspace, headCommit: verified.commit }
        : null,
    }));
    updated = transitionMilestone(updated, id, "reviewing", iso(this.now));
    await this.persist({
      ...updated,
      run: {
        ...updated.run,
        consecutiveInfrastructureFailures: 0,
      },
      nextAllowedAction: "review",
    });
  }

  private async escalateCandidateIdentityDrift(
    id: string,
    boundary: "review-entry" | "post-review" | "pre-integration",
    expected: CandidateIdentity | null,
    observed: CandidateIdentity | null,
    messageOverride?: string,
  ): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    const reportPath = resolve(
      this.attemptDirectory(milestone),
      `candidate-identity-drift-${boundary}.json`,
    );
    await atomicWriteJson(reportPath, {
      schemaVersion: "1.0.0",
      milestoneId: id,
      boundary,
      expected,
      observed,
      recordedAt: iso(this.now),
    });
    const fields =
      expected && observed ? differingIdentityFields(expected, observed) : [];
    const message =
      messageOverride ??
      `Candidate identity changed at ${boundary}: [${fields.join(", ")}] differ from the machine-verified candidate. Nothing was integrated.`;
    await this.escalate("CANDIDATE_IDENTITY_DRIFT", message, [reportPath], id);
  }

  private async review(id: string): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    const verification = milestone.verificationSummaries.at(-1);
    if (!milestone.workspace || !verification || verification.status !== "PASS")
      throw new Error("Review requires a verified isolated attempt.");
    const verified = verification.candidate;
    const resultSha256 = verification.authoritativeResultSha256;
    const copiedResultPath = verification.authoritative?.copiedResultPath;
    if (
      !verified ||
      !resultSha256 ||
      !copiedResultPath ||
      !verification.executionProvider?.completionEligible ||
      !verification.authoritative?.executionProvider.completionEligible ||
      !executionProviderIdentitiesEqual(
        verification.executionProvider,
        verification.authoritative.executionProvider,
      )
    ) {
      await this.escalateCandidateIdentityDrift(
        id,
        "review-entry",
        verified,
        null,
        "Persisted verification predates the candidate identity fence or lacks eligible execution-provider identity; re-verification is required before review.",
      );
      return;
    }
    const entryIdentity = candidateIdentityFrom(
      milestone.workspace.baseCommit,
      inspectAttempt(milestone.workspace.path, milestone.workspace.baseCommit),
    );
    if (!candidateIdentitiesEqual(verified, entryIdentity)) {
      await this.escalateCandidateIdentityDrift(
        id,
        "review-entry",
        verified,
        entryIdentity,
      );
      return;
    }
    const observedResultSha256 = createHash("sha256")
      .update(await readFile(copiedResultPath))
      .digest("hex");
    if (observedResultSha256 !== resultSha256) {
      await this.escalateCandidateIdentityDrift(
        id,
        "review-entry",
        verified,
        entryIdentity,
        "The copied authoritative verification result no longer matches its recorded hash.",
      );
      return;
    }
    const report = await requestReview({
      gateway: this.accountingGateway(),
      project: this.config.project,
      proposal: milestone.proposal,
      verification,
      workspacePath: milestone.workspace.path,
      verifiedCandidate: verified,
      verificationResultSha256: resultSha256,
      attempt: milestone.attempts,
      artifactDirectory: resolve(this.attemptDirectory(milestone), "review"),
      timeoutMs: this.phaseTimeout(this.config.limits.codexTurnMs),
      onThreadStarted: async (threadId) => this.setReviewerThread(id, threadId),
      now: () => iso(this.now),
    });
    await this.persist(
      replaceMilestone(this.stateValue, id, (record) => ({
        ...record,
        reviewerDecisions: [...record.reviewerDecisions, report],
      })),
    );
    if (report.decision === "escalate") {
      await this.escalate(
        "REVIEWER_ESCALATION",
        report.summary,
        report.findings.map((finding) => finding.evidence),
        id,
      );
      return;
    }
    if (!reviewerApproves(report)) {
      await this.retryOrEscalate(
        id,
        "review",
        feedbackFromReview(report),
        reviewerFailureRecord({
          report,
          attempt: milestone.attempts,
          recordedAt: iso(this.now),
        }),
      );
      return;
    }
    const postReviewInspection = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    const postReviewIdentity = candidateIdentityFrom(
      milestone.workspace.baseCommit,
      postReviewInspection,
    );
    if (!candidateIdentitiesEqual(verified, postReviewIdentity)) {
      await this.escalateCandidateIdentityDrift(
        id,
        "post-review",
        verified,
        postReviewIdentity,
      );
      return;
    }
    await this.integrate(id, verified, postReviewInspection.commits);
  }

  private async retryOrEscalate(
    id: string,
    failureKind: "product" | "infrastructure" | "review",
    feedback: string,
    failureRecord?: WorkerFailureRecord,
  ): Promise<void> {
    const current = milestoneById(this.stateValue, id);
    const recordedFailure =
      failureRecord ??
      infrastructureFailureRecord({
        attempt: current.attempts,
        summary: feedback,
        recordedAt: iso(this.now),
      });
    if (recordedFailure.kind !== failureKind)
      throw new Error(
        `Worker failure evidence kind ${recordedFailure.kind} does not match ${failureKind}.`,
      );
    let next = replaceMilestone(this.stateValue, id, (record) => ({
      ...record,
      infrastructureFailures:
        failureKind === "infrastructure"
          ? record.infrastructureFailures + 1
          : record.infrastructureFailures,
      retryFeedback: feedback,
      workerPolicy: {
        ...record.workerPolicy,
        failures: [...record.workerPolicy.failures, recordedFailure],
      },
    }));
    const consecutive =
      failureKind === "infrastructure"
        ? next.run.consecutiveInfrastructureFailures + 1
        : 0;
    next = {
      ...next,
      run: { ...next.run, consecutiveInfrastructureFailures: consecutive },
    };
    await this.persist(next);
    const decision = decideRetry({
      milestone: milestoneById(this.stateValue, id),
      config: this.config,
      failureKind,
      consecutiveInfrastructureFailures: consecutive,
    });
    if (decision.action === "escalate") {
      await this.escalate(
        failureKind === "infrastructure"
          ? "INFRASTRUCTURE_RETRY_LIMIT"
          : "MILESTONE_RETRY_LIMIT",
        decision.reason,
        [feedback],
        id,
      );
      return;
    }
    const milestone = milestoneById(this.stateValue, id);
    const workerEscalation = decideWorkerEscalation({
      state: milestone.workerPolicy,
      policy: this.config.agentPolicy,
    });
    if (workerEscalation.escalate && workerEscalation.reason) {
      await this.persist(
        replaceMilestone(this.stateValue, id, (record) =>
          promoteWorkerPolicy(
            record,
            workerEscalation.reason ?? "Worker reasoning escalation required.",
            iso(this.now),
          ),
        ),
      );
    }
    const retrying = transitionMilestone(
      this.stateValue,
      id,
      "retrying",
      iso(this.now),
    );
    await this.persist({ ...retrying, nextAllowedAction: "retry" });
  }

  private async integrate(
    id: string,
    verified: CandidateIdentity,
    commits: readonly string[],
  ): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Integration has no isolated workspace.");
    const preIntegrationIdentity = candidateIdentityFrom(
      milestone.workspace.baseCommit,
      inspectAttempt(milestone.workspace.path, milestone.workspace.baseCommit),
    );
    if (!candidateIdentitiesEqual(verified, preIntegrationIdentity)) {
      await this.escalateCandidateIdentityDrift(
        id,
        "pre-integration",
        verified,
        preIntegrationIdentity,
      );
      return;
    }
    await assertProtectedFiles(
      milestone.workspace.path,
      this.stateValue.repository.protectedFiles,
    );
    await assertProtectedFiles(
      this.repositoryRoot,
      this.stateValue.repository.protectedFiles,
    );
    const verification = milestone.verificationSummaries.at(-1);
    const verificationResultSha256 = verification?.authoritativeResultSha256;
    const runId = this.stateValue.run.id;
    if (
      !verificationResultSha256 ||
      !runId ||
      !verification?.executionProvider?.completionEligible ||
      !verification.authoritative?.executionProvider.completionEligible ||
      !executionProviderIdentitiesEqual(
        verification.executionProvider,
        verification.authoritative.executionProvider,
      )
    )
      throw new Error(
        "Target integration requires an active run, pinned verification result hash, and completion-eligible execution-provider identity.",
      );
    const outcomePath = resolve(
      this.attemptDirectory(milestone),
      "git-outcome.json",
    );
    const generation = this.store.mutationGeneration();
    const operation = planTargetIntegrateOperation({
      operationId: this.createTargetIntegrationOperationId(),
      inputStateGeneration: generation.objectId,
      inputStateRevision: generation.revision,
      repositoryRoot: this.repositoryRoot,
      targetBranch: this.config.targetBranch,
      expectedBaseCommit: this.stateValue.repository.verifiedCommit,
      workspacePath: milestone.workspace.path,
      workspaceBranch: milestone.workspace.branch,
      candidate: verified,
      verificationResultSha256,
      executionProvider: verification.executionProvider,
      commits,
      outcomePath,
      runId,
      milestoneId: id,
      attempt: milestone.attempts,
      now: iso(this.now),
    });
    await this.persist(setTargetIntegrateOperation(this.stateValue, operation));
    await this.targetIntegrationFault("after-intent-persisted", operation);
    const telemetry = await this.telemetryStoreBestEffort();
    const integrationSpan = await this.beginPhaseBestEffort(telemetry, {
      phase: "integration",
      eventType: "milestone-fast-forward",
      operationId: operation.id,
      candidate: telemetryCandidate(
        milestone.workspace.path,
        milestone.workspace.baseCommit,
      ),
    });
    try {
      await this.recoverPendingTargetIntegration();
      await this.finishSpanBestEffort(integrationSpan, {
        status: "PASS",
        candidate: telemetryCandidate(
          this.repositoryRoot,
          milestone.workspace.baseCommit,
        ),
      });
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      await this.finishSpanBestEffort(integrationSpan, {
        status: "ERROR",
        reason: message,
      });
      throw error;
    }
    const cleanup = await this.cleanupTerminalWorkspace(id);
    if (!cleanup.ok && cleanup.error) {
      await this.recordCleanupControllerFailure(id, cleanup.error);
      return;
    }
    const stopReason = this.stateValue.run.stopReason;
    if (this.stateValue.run.status === "stopped" && stopReason) {
      await this.writeRunSummary();
      await this.completeTelemetry("PASS", stopReason);
    }
  }

  private async processMilestone(id: string): Promise<void> {
    assertRequiredVerticalConsumerStart(this.stateValue, id);
    while (this.stateValue.run.status === "running") {
      this.checkLimits();
      const milestone = milestoneById(this.stateValue, id);
      switch (milestone.status) {
        case "ready":
        case "retrying":
          try {
            await this.beginAttempt(id);
          } catch (error) {
            if (this.stateValue.pendingOperation) throw error;
            await this.retryOrEscalate(
              id,
              "infrastructure",
              redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          break;
        case "running":
          try {
            await this.runWorker(id);
          } catch (error) {
            if (this.stateValue.pendingOperation) throw error;
            await this.retryOrEscalate(
              id,
              "infrastructure",
              redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          break;
        case "verifying":
          await this.verify(id);
          break;
        case "reviewing":
          try {
            await this.review(id);
          } catch (error) {
            if (this.stateValue.pendingOperation) throw error;
            await this.retryOrEscalate(
              id,
              "infrastructure",
              redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          break;
        case "completed":
        case "blocked":
        case "escalated":
          return;
        case "proposed":
          throw new Error(`Milestone ${id} was never approved as ready.`);
      }
    }
  }

  async run(options: RunOptions = {}): Promise<RunOutcome> {
    await this.startRun();
    const maximum = Math.min(
      options.maximumMilestones ?? this.config.limits.milestonesPerInvocation,
      this.config.limits.milestonesPerInvocation,
    );
    if (!Number.isSafeInteger(maximum) || maximum <= 0)
      throw new Error("maximumMilestones must be a positive integer.");
    while (
      this.stateValue.run.status === "running" &&
      this.stateValue.run.milestonesProcessed < maximum
    ) {
      try {
        this.checkLimits();
        let id = this.stateValue.activeMilestoneId;
        if (!id) {
          const requiredConsumer =
            this.stateValue.requiredNextVerticalConsumer?.consumerMilestoneId ??
            null;
          const ready = this.stateValue.queue
            .map((entry) => milestoneById(this.stateValue, entry))
            .find(
              (milestone) =>
                (requiredConsumer === null ||
                  milestone.proposal.id === requiredConsumer) &&
                [
                  "ready",
                  "running",
                  "verifying",
                  "reviewing",
                  "retrying",
                ].includes(milestone.status),
            );
          if (!ready) {
            const proposal = await this.planWithinRun();
            if (!proposal) break;
            id = proposal.id;
          } else {
            id = ready.proposal.id;
          }
        }
        await this.processMilestone(id);
      } catch (error) {
        if (this.stateValue.pendingOperation) throw error;
        await this.escalate(
          "RUN_CONTROLLER_FAILURE",
          redactSensitiveText(
            error instanceof Error ? error.message : String(error),
          ),
          [],
          this.stateValue.activeMilestoneId ?? undefined,
        );
      }
    }
    if (this.stateValue.run.status === "running")
      await this.stopRun(
        `Maximum ${maximum} milestone(s) processed for this invocation.`,
      );
    return this.outcome();
  }

  private async escalate(
    code: string,
    message: string,
    evidence: readonly string[],
    requestedMilestoneId?: string,
    options: { readonly preserveWorkspace?: boolean } = {},
  ): Promise<void> {
    const createdAt = iso(this.now);
    const blocker: BlockerRecord = {
      code,
      message: redactSensitiveText(message),
      evidence: evidence.map(redactSensitiveText),
      createdAt,
    };
    const milestoneId =
      requestedMilestoneId ?? this.stateValue.activeMilestoneId;
    let next = this.stateValue;
    if (milestoneId) {
      const milestone = milestoneById(next, milestoneId);
      if (
        milestone.status !== "escalated" &&
        milestone.status !== "completed"
      ) {
        next = replaceMilestone(next, milestoneId, (record) => ({
          ...record,
          blockers: [...record.blockers, blocker],
        }));
        next = transitionMilestone(next, milestoneId, "escalated", createdAt);
      }
    }
    next = {
      ...next,
      run: {
        ...next.run,
        status: "escalated",
        finishedAt: createdAt,
        stopReason: blocker.message,
      },
      nextAllowedAction: "stop",
    };
    await this.persist(next);
    if (this.stateValue.run.artifactDirectory)
      await atomicWriteJson(
        resolve(
          this.stateValue.run.artifactDirectory,
          "escalation-report.json",
        ),
        {
          schemaVersion: "1.0.0",
          runId: this.stateValue.run.id,
          milestoneId,
          blocker,
          nextAllowedAction: "stop",
          repository: this.stateValue.repository,
        },
      );
    if (milestoneId) {
      const cleanup = await this.cleanupTerminalWorkspace(
        milestoneId,
        options.preserveWorkspace ? "failed-preserve-workspace" : undefined,
      );
      if (!cleanup.ok && cleanup.error) {
        await this.recordCleanupControllerFailure(milestoneId, cleanup.error);
        return;
      }
    }
    await this.writeRunSummary();
    await this.completeTelemetry("ERROR", blocker.message);
  }

  private async stopRun(reason: string): Promise<void> {
    if (this.stateValue.run.status !== "running") return;
    await this.persist({
      ...this.stateValue,
      run: {
        ...this.stateValue.run,
        status: "stopped",
        finishedAt: iso(this.now),
        stopReason: reason,
      },
    });
    await this.writeRunSummary();
    await this.completeTelemetry("PASS", reason);
  }

  private async writeRunSummary(): Promise<string> {
    const directory = this.stateValue.run.artifactDirectory;
    if (!directory)
      throw new Error("Cannot summarize a run without artifacts.");
    const path = resolve(directory, "run-summary.json");
    const relevant = this.stateValue.milestones.filter(
      (milestone) =>
        milestone.timestamps.updatedAt >= (this.stateValue.run.startedAt ?? ""),
    );
    const summary = {
      schemaVersion: "1.0.0",
      run: this.stateValue.run,
      modelPolicy: {
        schemaVersion: this.config.agentPolicy.schemaVersion,
        sdk: this.config.agentPolicy.sdk,
        effectiveAssignments: Object.fromEntries(
          AGENT_ROLES.map((role) => [
            role,
            resolveAgentAssignment(this.config.agentPolicy, role),
          ]),
        ),
      },
      repository: this.stateValue.repository,
      requiredNextVerticalConsumer:
        this.stateValue.requiredNextVerticalConsumer,
      telemetry: this.telemetryValue
        ? {
            manifestPath: relative(
              this.repositoryRoot,
              this.telemetryValue.manifestPath,
            ).replaceAll("\\", "/"),
            summaryPath: relative(
              this.repositoryRoot,
              this.telemetryValue.summaryPath,
            ).replaceAll("\\", "/"),
          }
        : null,
      milestones: relevant.map((milestone) => ({
        id: milestone.proposal.id,
        proposalProvenance: milestone.proposalProvenance,
        title: milestone.proposal.title,
        status: milestone.status,
        attempts: milestone.attempts,
        threadId: milestone.workerThreadId,
        workerPolicy: milestone.workerPolicy,
        workerThreadLineage: milestone.workerThreadLineage,
        reviewerThreadIds: milestone.reviewerThreadIds,
        commits: milestone.commits,
        workspaceCleanup: milestone.workspace?.cleanup ?? null,
        verification: milestone.verificationSummaries.at(-1) ?? null,
        review: milestone.reviewerDecisions.at(-1) ?? null,
        blockers: milestone.blockers,
        nextAllowedAction: milestone.nextAllowedAction,
      })),
      stopReason: this.stateValue.run.stopReason,
      nextAllowedAction: this.stateValue.nextAllowedAction,
      generatedAt: iso(this.now),
    };
    await atomicWriteJson(path, redactSensitiveValue(summary));
    const markdownPath = resolve(directory, "run-summary.md");
    const markdown = [
      `# Orchestrator run ${this.stateValue.run.id ?? "unknown"}`,
      "",
      `Status: ${this.stateValue.run.status}`,
      `Stop reason: ${this.stateValue.run.stopReason ?? "none"}`,
      `Verified commit: ${this.stateValue.repository.verifiedCommit}`,
      `Milestones processed: ${this.stateValue.run.milestonesProcessed}`,
      `Codex invocations: ${this.stateValue.run.usage.codexInvocations}`,
      "",
      "## Agent invocations",
      "",
      ...(this.stateValue.run.agentInvocations.length === 0
        ? ["- none"]
        : this.stateValue.run.agentInvocations.map(
            (invocation) =>
              `- ${invocation.role}: ${invocation.requestedModel}/${invocation.requestedReasoningEffort}; thread=${invocation.threadId ?? "pending"}; attempt=${invocation.attempt}; escalated=${invocation.escalated}; override=${invocation.overrideApplied}; reason=${invocation.escalationReason ?? invocation.overrideReason ?? "none"}; status=${invocation.status}`,
          )),
      "",
      "## Milestones",
      "",
      ...relevant.map(
        (milestone) =>
          `- ${milestone.proposal.id}: ${milestone.status}; attempts=${milestone.attempts}; commits=${milestone.commits.join(",") || "none"}`,
      ),
      "",
    ].join("\n");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(markdownPath, redactSensitiveText(markdown), "utf8");
    return path;
  }

  private outcome(): RunOutcome {
    const directory = this.stateValue.run.artifactDirectory;
    if (!directory) throw new Error("Run produced no artifact directory.");
    return {
      state: this.stateValue,
      summaryPath: resolve(directory, "run-summary.json"),
      stopReason:
        this.stateValue.run.stopReason ?? "Run ended without a reason.",
    };
  }

  statusSummary(): unknown {
    return stateStatusSummary(this.repositoryRoot, this.stateValue);
  }
}

export function stateStatusSummary(
  repositoryRoot: string,
  state: OrchestratorState,
): unknown {
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    repository: state.repository,
    run: state.run,
    queue: state.queue,
    activeMilestoneId: state.activeMilestoneId,
    pendingOperation: state.pendingOperation,
    requiredNextVerticalConsumer: state.requiredNextVerticalConsumer,
    evidenceRetention: state.evidenceRetention,
    milestones: state.milestones.map((milestone) => ({
      id: milestone.proposal.id,
      title: milestone.proposal.title,
      status: milestone.status,
      attempts: milestone.attempts,
      workerThreadId: milestone.workerThreadId,
      workerPolicy: milestone.workerPolicy,
      workerThreadLineage: milestone.workerThreadLineage,
      nextAllowedAction: milestone.nextAllowedAction,
      workspace:
        milestone.workspace === null
          ? null
          : relative(repositoryRoot, milestone.workspace.path).replaceAll(
              "\\",
              "/",
            ),
      workspacePreserved: milestone.workspace?.preserved ?? null,
      workspaceCleanup: milestone.workspace?.cleanup ?? null,
    })),
    nextAllowedAction: state.nextAllowedAction,
  };
}
