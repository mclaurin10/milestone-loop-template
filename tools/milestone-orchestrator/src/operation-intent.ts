import { isDeepStrictEqual } from "node:util";

import type {
  AgentInvocationRecord,
  CandidatePrepareCheckpointPlan,
  CandidatePrepareCheckpointResult,
  CandidatePrepareDiagnostic,
  CandidatePrepareOperation,
  CandidatePreparePhase,
  CandidatePrepareWorkerResult,
  IsolatedWorkspaceRecord,
  OrchestratorState,
  PendingOperation,
  RetentionApplyDiagnostic,
  RetentionApplyOperation,
  RetentionApplyPhase,
  TargetIntegrateDiagnostic,
  TargetIntegrateOperation,
  TargetIntegratePhase,
  WorkspaceCreateDiagnostic,
  WorkspaceCreateOperation,
  WorkspaceCreatePhase,
  WorkspaceCleanupDiagnostic,
  WorkspaceCleanupOperation,
  WorkspaceCleanupPhase,
} from "./contracts.js";
import {
  candidatePrepareArtifactSha256,
  candidatePrepareCheckpointArtifact,
  candidatePrepareProposalContractSha256,
  candidatePrepareProtectedFilesSha256,
  candidatePrepareRetryContextSha256,
  candidatePrepareThreadLineageSha256,
  candidatePrepareWorkerPolicySha256,
} from "./candidate-prepare.js";
import { requiredVerticalConsumerAfterCompletion } from "./milestone-state.js";
import { humanPlaytestStopReason } from "./readiness-completion.js";
import { reviewerApproves } from "./reviewer.js";
import {
  executionProviderIdentitiesEqual,
  isExecutionProviderIdentity,
} from "./execution-provider-identity.js";
import { recordWorkerThreadLineage } from "./reasoning-escalation.js";

const WORKSPACE_PHASE_TRANSITIONS: Readonly<
  Record<WorkspaceCreatePhase, readonly WorkspaceCreatePhase[]>
> = {
  "intent-persisted": ["clone-started", "blocked"],
  "clone-started": ["clone-ready", "blocked"],
  "clone-ready": ["publish-started", "blocked"],
  "publish-started": ["published", "blocked"],
  published: ["blocked"],
  blocked: [],
};

const TARGET_PHASE_TRANSITIONS: Readonly<
  Record<TargetIntegratePhase, readonly TargetIntegratePhase[]>
> = {
  "intent-persisted": ["outcome-pending", "blocked"],
  "outcome-pending": ["target-update-started", "blocked"],
  "target-update-started": ["target-updated", "blocked"],
  "target-updated": ["outcome-integrated", "blocked"],
  "outcome-integrated": ["blocked"],
  blocked: [],
};

const CANDIDATE_PHASE_TRANSITIONS: Readonly<
  Record<CandidatePreparePhase, readonly CandidatePreparePhase[]>
> = {
  "intent-persisted": ["worker-invocation-started", "blocked"],
  "worker-invocation-started": [
    "worker-thread-recorded",
    "worker-completed",
    "blocked",
  ],
  "worker-thread-recorded": ["worker-completed", "blocked"],
  "worker-completed": [
    "worker-evidence-recorded",
    "checkpoint-prepared",
    "blocked",
  ],
  "worker-evidence-recorded": ["checkpoint-prepared", "blocked"],
  "checkpoint-prepared": ["checkpoint-committed", "blocked"],
  "checkpoint-committed": ["checkpoint-recorded", "blocked"],
  "checkpoint-recorded": ["blocked"],
  blocked: [],
};

const CLEANUP_PHASE_TRANSITIONS: Readonly<
  Record<WorkspaceCleanupPhase, readonly WorkspaceCleanupPhase[]>
> = {
  "intent-persisted": [
    "dependency-removal-started",
    "archive-started",
    "workspace-delete-started",
    "blocked",
  ],
  "dependency-removal-started": ["dependencies-removed", "blocked"],
  "dependencies-removed": ["blocked"],
  "archive-started": ["archive-ready", "blocked"],
  "archive-ready": ["workspace-delete-started", "blocked"],
  "workspace-delete-started": ["workspace-deleted", "blocked"],
  "workspace-deleted": ["blocked"],
  blocked: [],
};

function retentionPhaseTransitionAllowed(
  before: RetentionApplyOperation,
  after: RetentionApplyOperation,
): boolean {
  if (after.phase === "blocked")
    return (
      before.phase !== "blocked" &&
      after.completedDeletionCount === before.completedDeletionCount
    );
  if (before.phase === "intent-persisted" && before.deletions.length > 0)
    return (
      after.phase === "deletion-started" && after.completedDeletionCount === 0
    );
  if (before.phase === "intent-persisted" && before.deletions.length === 0)
    return (
      after.phase === "result-written" && after.completedDeletionCount === 0
    );
  if (before.phase === "deletion-started")
    return (
      after.phase === "deletion-finished" &&
      after.completedDeletionCount === before.completedDeletionCount + 1
    );
  if (
    before.phase === "deletion-finished" &&
    before.completedDeletionCount < before.deletions.length
  )
    return (
      after.phase === "deletion-started" &&
      after.completedDeletionCount === before.completedDeletionCount
    );
  if (
    before.phase === "deletion-finished" &&
    before.completedDeletionCount === before.deletions.length
  )
    return (
      after.phase === "result-written" &&
      after.completedDeletionCount === before.completedDeletionCount
    );
  return false;
}

function milestoneForOperation(
  state: OrchestratorState,
  operation: WorkspaceCreateOperation,
) {
  const milestone = state.milestones.find(
    (entry) => entry.proposal.id === operation.milestoneId,
  );
  if (!milestone)
    throw new Error(
      `Workspace-create operation ${operation.id} names an unknown milestone.`,
    );
  return milestone;
}

export function assertWorkspaceCreateContext(
  state: OrchestratorState,
  operation: WorkspaceCreateOperation,
): void {
  const milestone = milestoneForOperation(state, operation);
  if (
    state.activeMilestoneId !== operation.milestoneId ||
    state.run.id === null ||
    state.run.id !== operation.runId ||
    milestone.status !== "running" ||
    milestone.attempts !== operation.attempt ||
    milestone.workspace !== null ||
    state.nextAllowedAction !== "resume-worker" ||
    milestone.nextAllowedAction !== "resume-worker"
  )
    throw new Error(
      `Workspace-create operation ${operation.id} does not match the active attempt.`,
    );
  if (
    state.repository.root !== operation.repositoryRoot ||
    state.repository.targetBranch !== operation.targetBranch ||
    state.repository.verifiedCommit !== operation.baseCommit
  )
    throw new Error(
      `Workspace-create operation ${operation.id} does not match repository identity.`,
    );
  if (operation.inputStateRevision > state.revision)
    throw new Error(
      `Workspace-create operation ${operation.id} names a future input revision.`,
    );
}

export function setWorkspaceCreateOperation(
  state: OrchestratorState,
  operation: WorkspaceCreateOperation,
): OrchestratorState {
  if (state.pendingOperation !== null)
    throw new Error(
      `Cannot start workspace-create operation ${operation.id}; operation ${state.pendingOperation.id} is already pending.`,
    );
  if (operation.phase !== "intent-persisted" || operation.diagnostic !== null)
    throw new Error(
      "A new workspace-create operation must begin at intent-persisted.",
    );
  if (operation.inputStateRevision !== state.revision)
    throw new Error(
      `Workspace-create operation ${operation.id} is not bound to input revision ${state.revision}.`,
    );
  assertWorkspaceCreateContext(state, operation);
  return { ...state, pendingOperation: operation };
}

export function advanceWorkspaceCreateOperation(
  state: OrchestratorState,
  operationId: string,
  phase: Exclude<WorkspaceCreatePhase, "intent-persisted" | "blocked">,
  updatedAt: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "workspace-create" ||
    operation.id !== operationId
  )
    throw new Error(
      `Workspace-create operation ${operationId} is not pending.`,
    );
  if (!WORKSPACE_PHASE_TRANSITIONS[operation.phase].includes(phase))
    throw new Error(
      `Workspace-create operation ${operationId} cannot advance from ${operation.phase} to ${phase}.`,
    );
  assertWorkspaceCreateContext(state, operation);
  return {
    ...state,
    pendingOperation: { ...operation, phase, updatedAt, diagnostic: null },
  };
}

export function blockWorkspaceCreateOperation(
  state: OrchestratorState,
  operationId: string,
  diagnostic: WorkspaceCreateDiagnostic,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "workspace-create" ||
    operation.id !== operationId
  )
    throw new Error(
      `Workspace-create operation ${operationId} is not pending.`,
    );
  if (operation.phase === "blocked")
    throw new Error(
      `Workspace-create operation ${operationId} is already blocked.`,
    );
  assertWorkspaceCreateContext(state, operation);
  return {
    ...state,
    pendingOperation: {
      ...operation,
      phase: "blocked",
      updatedAt: diagnostic.observedAt,
      diagnostic,
    },
  };
}

export function workspaceRecordFromOperation(
  operation: WorkspaceCreateOperation,
): IsolatedWorkspaceRecord {
  return {
    isolation: "standalone-local-clone-branch",
    path: operation.finalPath,
    branch: operation.branch,
    baseCommit: operation.baseCommit,
    headCommit: null,
    createdAt: operation.createdAt,
    preserved: true,
    cleanup: {
      schemaVersion: "1.0.0",
      status: "active",
      reason: null,
      requestedAt: null,
      completedAt: null,
      nodeModulesRemovedAt: null,
      diagnosticArchivePath: null,
      error: null,
    },
  };
}

export function completeWorkspaceCreateOperation(
  state: OrchestratorState,
  operationId: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "workspace-create" ||
    operation.id !== operationId
  )
    throw new Error(
      `Workspace-create operation ${operationId} is not pending.`,
    );
  if (operation.phase !== "published")
    throw new Error(
      `Workspace-create operation ${operationId} cannot complete from ${operation.phase}.`,
    );
  assertWorkspaceCreateContext(state, operation);
  const workspace = workspaceRecordFromOperation(operation);
  return {
    ...state,
    milestones: state.milestones.map((milestone) =>
      milestone.proposal.id === operation.milestoneId
        ? { ...milestone, workspace }
        : milestone,
    ),
    pendingOperation: null,
  };
}

function candidateMilestoneForOperation(
  state: OrchestratorState,
  operation: CandidatePrepareOperation,
) {
  const milestone = state.milestones.find(
    (entry) => entry.proposal.id === operation.milestoneId,
  );
  if (!milestone)
    throw new Error(
      `Candidate-prepare operation ${operation.id} names an unknown milestone.`,
    );
  return milestone;
}

function usageAfterCandidateWorker(operation: CandidatePrepareOperation) {
  const usage = operation.workerResult?.usage;
  return {
    codexInvocations: operation.initialRunUsage.codexInvocations + 1,
    inputTokens:
      operation.initialRunUsage.inputTokens + (usage?.inputTokens ?? 0),
    cachedInputTokens:
      operation.initialRunUsage.cachedInputTokens +
      (usage?.cachedInputTokens ?? 0),
    outputTokens:
      operation.initialRunUsage.outputTokens + (usage?.outputTokens ?? 0),
    reasoningOutputTokens:
      operation.initialRunUsage.reasoningOutputTokens +
      (usage?.reasoningOutputTokens ?? 0),
  };
}

export function assertCandidatePrepareContext(
  state: OrchestratorState,
  operation: CandidatePrepareOperation,
): void {
  const milestone = candidateMilestoneForOperation(state, operation);
  const workspace = milestone.workspace;
  if (
    state.activeMilestoneId !== operation.milestoneId ||
    state.run.id !== operation.runId ||
    state.run.status !== "running" ||
    milestone.status !== "running" ||
    milestone.attempts !== operation.attempt ||
    state.nextAllowedAction !== "resume-worker" ||
    milestone.nextAllowedAction !== "resume-worker" ||
    !workspace
  )
    throw new Error(
      `Candidate-prepare operation ${operation.id} does not match the active Worker attempt.`,
    );
  if (
    state.repository.root !== operation.repositoryRoot ||
    state.repository.targetBranch !== operation.targetBranch ||
    state.repository.verifiedCommit !== operation.verifiedCommit ||
    workspace.path !== operation.workspacePath ||
    workspace.branch !== operation.workspaceBranch ||
    workspace.baseCommit !== operation.workspaceBaseCommit ||
    workspace.createdAt !== operation.workspaceCreatedAt ||
    operation.workspaceBaseCommit !== operation.verifiedCommit
  )
    throw new Error(
      `Candidate-prepare operation ${operation.id} does not match repository and workspace identity.`,
    );
  if (
    milestone.workerPolicy.activeRole !== operation.workerRole ||
    candidatePrepareWorkerPolicySha256(milestone) !==
      operation.workerPolicySha256 ||
    candidatePrepareRetryContextSha256(milestone) !==
      operation.retryContextSha256 ||
    candidatePrepareProposalContractSha256(milestone) !==
      operation.proposalContractSha256 ||
    candidatePrepareProtectedFilesSha256(state.repository.protectedFiles) !==
      operation.protectedFilesSha256
  )
    throw new Error(
      `Candidate-prepare operation ${operation.id} has stale Worker or policy context.`,
    );
  if (operation.inputStateRevision > state.revision)
    throw new Error(
      `Candidate-prepare operation ${operation.id} names a future input revision.`,
    );
  if (operation.workerInvocation === null) {
    if (
      state.run.agentInvocations.length !==
        operation.initialAgentInvocationCount ||
      !isDeepStrictEqual(state.run.usage, operation.initialRunUsage) ||
      milestone.workerThreadId !== operation.initialWorkerThreadId ||
      candidatePrepareThreadLineageSha256(milestone) !==
        operation.initialWorkerThreadLineageSha256
    )
      throw new Error(
        `Candidate-prepare operation ${operation.id} has pre-invocation accounting drift.`,
      );
    return;
  }
  if (
    state.run.agentInvocations.length !==
      operation.initialAgentInvocationCount + 1 ||
    !isDeepStrictEqual(
      state.run.agentInvocations.at(-1),
      operation.workerInvocation,
    ) ||
    !isDeepStrictEqual(state.run.usage, usageAfterCandidateWorker(operation))
  )
    throw new Error(
      `Candidate-prepare operation ${operation.id} has invocation accounting drift.`,
    );
  const threadId = operation.workerInvocation.threadId;
  if (threadId !== null) {
    const lineage = milestone.workerThreadLineage.at(-1);
    if (
      milestone.workerThreadId !== threadId ||
      !lineage ||
      lineage.threadId !== threadId ||
      lineage.role !== operation.workerRole ||
      lineage.model !== operation.workerAssignment.model ||
      lineage.reasoningEffort !== operation.workerAssignment.reasoningEffort
    )
      throw new Error(
        `Candidate-prepare operation ${operation.id} has Worker thread-lineage drift.`,
      );
  }
}

export function setCandidatePrepareOperation(
  state: OrchestratorState,
  operation: CandidatePrepareOperation,
): OrchestratorState {
  if (state.pendingOperation !== null)
    throw new Error(
      `Cannot start candidate-prepare operation ${operation.id}; operation ${state.pendingOperation.id} is already pending.`,
    );
  if (
    operation.phase !== "intent-persisted" ||
    operation.workerInvocation !== null ||
    operation.workerResult !== null ||
    operation.checkpointPlan !== null ||
    operation.checkpointResult !== null ||
    operation.checkpointArtifactSha256 !== null ||
    operation.diagnostic !== null
  )
    throw new Error(
      "A new candidate-prepare operation must begin at intent-persisted.",
    );
  if (operation.inputStateRevision !== state.revision)
    throw new Error(
      `Candidate-prepare operation ${operation.id} is not bound to input revision ${state.revision}.`,
    );
  assertCandidatePrepareContext(state, operation);
  return { ...state, pendingOperation: operation };
}

export type CandidatePrepareAdvancement =
  | {
      readonly phase: "worker-invocation-started";
      readonly invocation: AgentInvocationRecord;
    }
  | { readonly phase: "worker-thread-recorded"; readonly threadId: string }
  | {
      readonly phase: "worker-completed";
      readonly result: CandidatePrepareWorkerResult;
    }
  | { readonly phase: "worker-evidence-recorded" }
  | {
      readonly phase: "checkpoint-prepared";
      readonly plan: CandidatePrepareCheckpointPlan;
    }
  | {
      readonly phase: "checkpoint-committed";
      readonly result: CandidatePrepareCheckpointResult;
    }
  | { readonly phase: "checkpoint-recorded" };

export function advanceCandidatePrepareOperation(
  state: OrchestratorState,
  operationId: string,
  advancement: CandidatePrepareAdvancement,
  updatedAt: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "candidate-prepare" ||
    operation.id !== operationId
  )
    throw new Error(
      `Candidate-prepare operation ${operationId} is not pending.`,
    );
  if (!CANDIDATE_PHASE_TRANSITIONS[operation.phase].includes(advancement.phase))
    throw new Error(
      `Candidate-prepare operation ${operationId} cannot advance from ${operation.phase} to ${advancement.phase}.`,
    );
  assertCandidatePrepareContext(state, operation);
  let next = state;
  let advanced: CandidatePrepareOperation;
  switch (advancement.phase) {
    case "worker-invocation-started": {
      const invocation = advancement.invocation;
      if (
        invocation.id !== operation.agentInvocationId ||
        invocation.role !== operation.workerRole ||
        invocation.requestedModel !== operation.workerAssignment.model ||
        invocation.requestedReasoningEffort !==
          operation.workerAssignment.reasoningEffort ||
        invocation.threadId !== operation.initialWorkerThreadId ||
        invocation.attempt !== operation.attempt ||
        invocation.status !== "starting" ||
        invocation.finishedAt !== null ||
        invocation.error !== null
      )
        throw new Error(
          `Candidate-prepare operation ${operationId} received an inconsistent Worker invocation.`,
        );
      advanced = {
        ...operation,
        workerInvocation: invocation,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      next = {
        ...state,
        run: {
          ...state.run,
          agentInvocations: [...state.run.agentInvocations, invocation],
          usage: usageAfterCandidateWorker(advanced),
        },
      };
      break;
    }
    case "worker-thread-recorded": {
      if (!operation.workerInvocation)
        throw new Error("Worker invocation is missing before thread start.");
      if (
        operation.workerInvocation.threadId !== null &&
        operation.workerInvocation.threadId !== advancement.threadId
      )
        throw new Error("Worker thread identity changed during invocation.");
      const invocation = {
        ...operation.workerInvocation,
        threadId: advancement.threadId,
      };
      const milestone = candidateMilestoneForOperation(state, operation);
      const updatedMilestone = recordWorkerThreadLineage({
        milestone,
        threadId: advancement.threadId,
        role: operation.workerRole,
        assignment: operation.workerAssignment,
        now: updatedAt,
      });
      advanced = {
        ...operation,
        workerInvocation: invocation,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      next = {
        ...state,
        milestones: state.milestones.map((entry) =>
          entry.proposal.id === operation.milestoneId
            ? updatedMilestone
            : entry,
        ),
        run: {
          ...state.run,
          agentInvocations: state.run.agentInvocations.map((entry) =>
            entry.id === invocation.id ? invocation : entry,
          ),
        },
      };
      break;
    }
    case "worker-completed": {
      if (!operation.workerInvocation)
        throw new Error("Worker invocation is missing before completion.");
      const result = advancement.result;
      const existingThreadId = operation.workerInvocation.threadId;
      if (
        (existingThreadId !== null && existingThreadId !== result.threadId) ||
        (operation.initialWorkerThreadId !== null &&
          operation.initialWorkerThreadId !== result.threadId)
      )
        throw new Error("Worker completion thread does not match intent.");
      const invocation: AgentInvocationRecord = {
        ...operation.workerInvocation,
        threadId: result.threadId,
        status: "completed",
        finishedAt: result.finishedAt,
        error: null,
      };
      const milestone = candidateMilestoneForOperation(state, operation);
      const updatedMilestone = recordWorkerThreadLineage({
        milestone,
        threadId: result.threadId,
        role: operation.workerRole,
        assignment: operation.workerAssignment,
        now: result.finishedAt,
      });
      advanced = {
        ...operation,
        workerInvocation: invocation,
        workerResult: result,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      next = {
        ...state,
        milestones: state.milestones.map((entry) =>
          entry.proposal.id === operation.milestoneId
            ? updatedMilestone
            : entry,
        ),
        run: {
          ...state.run,
          agentInvocations: state.run.agentInvocations.map((entry) =>
            entry.id === invocation.id ? invocation : entry,
          ),
          usage: usageAfterCandidateWorker(advanced),
        },
      };
      break;
    }
    case "worker-evidence-recorded":
      advanced = {
        ...operation,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      break;
    case "checkpoint-prepared":
      advanced = {
        ...operation,
        checkpointPlan: advancement.plan,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      break;
    case "checkpoint-committed": {
      const withResult: CandidatePrepareOperation = {
        ...operation,
        checkpointResult: advancement.result,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      advanced = {
        ...withResult,
        checkpointArtifactSha256: candidatePrepareArtifactSha256(
          candidatePrepareCheckpointArtifact(withResult),
        ),
      };
      break;
    }
    case "checkpoint-recorded":
      advanced = {
        ...operation,
        phase: advancement.phase,
        updatedAt,
        diagnostic: null,
      };
      break;
  }
  next = { ...next, pendingOperation: advanced };
  assertCandidatePrepareContext(next, advanced);
  return next;
}

export function blockCandidatePrepareOperation(
  state: OrchestratorState,
  operationId: string,
  diagnostic: CandidatePrepareDiagnostic,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "candidate-prepare" ||
    operation.id !== operationId
  )
    throw new Error(
      `Candidate-prepare operation ${operationId} is not pending.`,
    );
  if (operation.phase === "blocked")
    throw new Error(
      `Candidate-prepare operation ${operationId} is already blocked.`,
    );
  assertCandidatePrepareContext(state, operation);
  return {
    ...state,
    pendingOperation: {
      ...operation,
      phase: "blocked",
      updatedAt: diagnostic.observedAt,
      diagnostic,
    },
  };
}

export function completeCandidatePrepareOperation(
  state: OrchestratorState,
  operationId: string,
  completedAt: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "candidate-prepare" ||
    operation.id !== operationId
  )
    throw new Error(
      `Candidate-prepare operation ${operationId} is not pending.`,
    );
  if (
    operation.phase !== "checkpoint-recorded" ||
    !operation.checkpointResult ||
    !operation.checkpointArtifactSha256
  )
    throw new Error(
      `Candidate-prepare operation ${operationId} cannot complete from ${operation.phase}.`,
    );
  assertCandidatePrepareContext(state, operation);
  const milestones = state.milestones.map((milestone) => {
    if (milestone.proposal.id !== operation.milestoneId) return milestone;
    if (milestone.status !== "running")
      throw new Error("Candidate completion requires a running milestone.");
    return {
      ...milestone,
      status: "verifying" as const,
      retryFeedback: null,
      nextAllowedAction: "verify" as const,
      timestamps: {
        ...milestone.timestamps,
        updatedAt: completedAt,
      },
    };
  });
  return {
    ...state,
    milestones,
    pendingOperation: null,
    nextAllowedAction: "verify",
  };
}

function targetMilestoneForOperation(
  state: OrchestratorState,
  operation: TargetIntegrateOperation,
) {
  const milestone = state.milestones.find(
    (entry) => entry.proposal.id === operation.milestoneId,
  );
  if (!milestone)
    throw new Error(
      `Target-integrate operation ${operation.id} names an unknown milestone.`,
    );
  return milestone;
}

export function assertTargetIntegrateContext(
  state: OrchestratorState,
  operation: TargetIntegrateOperation,
): void {
  const milestone = targetMilestoneForOperation(state, operation);
  const verification = milestone.verificationSummaries.at(-1);
  const review = milestone.reviewerDecisions.at(-1);
  if (
    state.activeMilestoneId !== operation.milestoneId ||
    state.run.id === null ||
    state.run.id !== operation.runId ||
    state.run.status !== "running" ||
    milestone.status !== "reviewing" ||
    milestone.attempts !== operation.attempt ||
    milestone.nextAllowedAction !== "review" ||
    state.nextAllowedAction !== "review" ||
    !milestone.workspace ||
    milestone.workspace.path !== operation.workspacePath ||
    milestone.workspace.branch !== operation.workspaceBranch ||
    milestone.workspace.baseCommit !== operation.expectedBaseCommit ||
    milestone.workspace.headCommit !== operation.candidate.commit
  )
    throw new Error(
      `Target-integrate operation ${operation.id} does not match the active approved attempt.`,
    );
  if (
    state.repository.root !== operation.repositoryRoot ||
    state.repository.targetBranch !== operation.targetBranch ||
    state.repository.verifiedCommit !== operation.expectedBaseCommit ||
    operation.candidate.baseCommit !== operation.expectedBaseCommit ||
    operation.candidate.clean !== true
  )
    throw new Error(
      `Target-integrate operation ${operation.id} does not match repository identity.`,
    );
  if (
    verification?.status !== "PASS" ||
    verification.candidate === null ||
    !isDeepStrictEqual(verification.candidate, operation.candidate) ||
    verification.authoritativeResultSha256 !==
      operation.verificationResultSha256 ||
    !isExecutionProviderIdentity(verification.executionProvider) ||
    !verification.executionProvider.completionEligible ||
    !isExecutionProviderIdentity(operation.executionProvider) ||
    !operation.executionProvider.completionEligible ||
    !executionProviderIdentitiesEqual(
      verification.executionProvider,
      operation.executionProvider,
    )
  )
    throw new Error(
      `Target-integrate operation ${operation.id} does not match the pinned verification and execution-provider identity.`,
    );
  if (
    !review ||
    review.schemaVersion !== "1.1.0" ||
    !reviewerApproves(review) ||
    review.verifiedBaseCommit !== operation.expectedBaseCommit ||
    review.verifiedHeadCommit !== operation.candidate.commit ||
    review.verifiedTree !== operation.candidate.tree ||
    review.verificationResultSha256 !== operation.verificationResultSha256 ||
    review.attempt !== operation.attempt
  )
    throw new Error(
      `Target-integrate operation ${operation.id} does not match the independent approval.`,
    );
  if (
    operation.commits.length === 0 ||
    operation.commits.at(-1) !== operation.candidate.commit ||
    new Set(operation.commits).size !== operation.commits.length
  )
    throw new Error(
      `Target-integrate operation ${operation.id} has an invalid commit list.`,
    );
  if (operation.inputStateRevision > state.revision)
    throw new Error(
      `Target-integrate operation ${operation.id} names a future input revision.`,
    );
}

export function setTargetIntegrateOperation(
  state: OrchestratorState,
  operation: TargetIntegrateOperation,
): OrchestratorState {
  if (state.pendingOperation !== null)
    throw new Error(
      `Cannot start target-integrate operation ${operation.id}; operation ${state.pendingOperation.id} is already pending.`,
    );
  if (operation.phase !== "intent-persisted" || operation.diagnostic !== null)
    throw new Error(
      "A new target-integrate operation must begin at intent-persisted.",
    );
  if (operation.inputStateRevision !== state.revision)
    throw new Error(
      `Target-integrate operation ${operation.id} is not bound to input revision ${state.revision}.`,
    );
  assertTargetIntegrateContext(state, operation);
  return { ...state, pendingOperation: operation };
}

export function advanceTargetIntegrateOperation(
  state: OrchestratorState,
  operationId: string,
  phase: Exclude<TargetIntegratePhase, "intent-persisted" | "blocked">,
  updatedAt: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "target-integrate" ||
    operation.id !== operationId
  )
    throw new Error(
      `Target-integrate operation ${operationId} is not pending.`,
    );
  if (!TARGET_PHASE_TRANSITIONS[operation.phase].includes(phase))
    throw new Error(
      `Target-integrate operation ${operationId} cannot advance from ${operation.phase} to ${phase}.`,
    );
  assertTargetIntegrateContext(state, operation);
  return {
    ...state,
    pendingOperation: { ...operation, phase, updatedAt, diagnostic: null },
  };
}

export function blockTargetIntegrateOperation(
  state: OrchestratorState,
  operationId: string,
  diagnostic: TargetIntegrateDiagnostic,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "target-integrate" ||
    operation.id !== operationId
  )
    throw new Error(
      `Target-integrate operation ${operationId} is not pending.`,
    );
  if (operation.phase === "blocked")
    throw new Error(
      `Target-integrate operation ${operationId} is already blocked.`,
    );
  assertTargetIntegrateContext(state, operation);
  return {
    ...state,
    pendingOperation: {
      ...operation,
      phase: "blocked",
      updatedAt: diagnostic.observedAt,
      diagnostic,
    },
  };
}

export function completeTargetIntegrateOperation(
  state: OrchestratorState,
  operationId: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "target-integrate" ||
    operation.id !== operationId
  )
    throw new Error(
      `Target-integrate operation ${operationId} is not pending.`,
    );
  if (operation.phase !== "outcome-integrated")
    throw new Error(
      `Target-integrate operation ${operationId} cannot complete from ${operation.phase}.`,
    );
  assertTargetIntegrateContext(state, operation);
  const milestone = targetMilestoneForOperation(state, operation);
  const authoritative = milestone.verificationSummaries.at(-1)?.authoritative;
  const stopReason = humanPlaytestStopReason(authoritative);
  const completedMilestone = {
    ...milestone,
    status: "completed" as const,
    commits: operation.commits,
    workspace: milestone.workspace
      ? { ...milestone.workspace, headCommit: operation.candidate.commit }
      : null,
    nextAllowedAction: "plan" as const,
    timestamps: {
      ...milestone.timestamps,
      completedAt: operation.completionAt,
      updatedAt: operation.completionAt,
    },
  };
  return {
    ...state,
    repository: {
      ...state.repository,
      verifiedCommit: operation.candidate.commit,
    },
    milestones: state.milestones.map((entry) =>
      entry.proposal.id === operation.milestoneId ? completedMilestone : entry,
    ),
    queue: state.queue.filter((entry) => entry !== operation.milestoneId),
    activeMilestoneId: null,
    requiredNextVerticalConsumer: requiredVerticalConsumerAfterCompletion(
      state.requiredNextVerticalConsumer,
      milestone.proposal,
    ),
    run: {
      ...state.run,
      status: stopReason ? "stopped" : state.run.status,
      finishedAt: stopReason ? operation.completionAt : state.run.finishedAt,
      stopReason: stopReason ?? state.run.stopReason,
      milestonesProcessed: state.run.milestonesProcessed + 1,
    },
    pendingOperation: null,
    nextAllowedAction: "plan",
  };
}

function cleanupMilestoneForOperation(
  state: OrchestratorState,
  operation: WorkspaceCleanupOperation,
) {
  const milestone = state.milestones.find(
    (entry) => entry.proposal.id === operation.milestoneId,
  );
  if (!milestone)
    throw new Error(
      `Workspace-cleanup operation ${operation.id} names an unknown milestone.`,
    );
  return milestone;
}

export function assertWorkspaceCleanupContext(
  state: OrchestratorState,
  operation: WorkspaceCleanupOperation,
): void {
  const milestone = cleanupMilestoneForOperation(state, operation);
  const workspace = milestone.workspace;
  if (
    state.run.id === null ||
    state.run.id !== operation.runId ||
    state.run.artifactDirectory !== operation.runArtifactDirectory ||
    milestone.attempts !== operation.attempt ||
    !workspace ||
    workspace.path !== operation.workspacePath ||
    workspace.branch !== operation.workspaceBranch ||
    workspace.baseCommit !== operation.workspaceBaseCommit ||
    workspace.headCommit !== operation.recordedHeadCommit ||
    workspace.createdAt !== operation.workspaceCreatedAt ||
    !["active", "pending", "failed"].includes(workspace.cleanup.status)
  )
    throw new Error(
      `Workspace-cleanup operation ${operation.id} does not match its terminal milestone.`,
    );
  const completedReason =
    operation.reason === "completed-delete-workspace" ||
    operation.reason === "completed-preserve-workspace";
  const failedReason =
    operation.reason === "failed-delete-after-diagnostics" ||
    operation.reason === "failed-preserve-workspace";
  if (
    (milestone.status === "completed" && !completedReason) ||
    (milestone.status === "escalated" && !failedReason) ||
    (milestone.status !== "completed" && milestone.status !== "escalated")
  )
    throw new Error(
      `Workspace-cleanup operation ${operation.id} does not match terminal policy.`,
    );
  if (
    state.repository.root !== operation.repositoryRoot ||
    state.repository.targetBranch !== operation.targetBranch ||
    state.repository.verifiedCommit !== operation.verifiedCommit
  )
    throw new Error(
      `Workspace-cleanup operation ${operation.id} does not match repository identity.`,
    );
  const previousReason = workspace.cleanup.reason;
  if (
    previousReason !== null &&
    previousReason !== "legacy-pre-policy" &&
    previousReason !== operation.reason
  )
    throw new Error(
      `Workspace-cleanup operation ${operation.id} changes persisted cleanup policy.`,
    );
  if (
    workspace.cleanup.requestedAt !== null &&
    workspace.cleanup.requestedAt !== operation.requestedAt
  )
    throw new Error(
      `Workspace-cleanup operation ${operation.id} changes the persisted request time.`,
    );
  const requiresArchive =
    operation.reason === "failed-delete-after-diagnostics";
  if (
    requiresArchive !== (operation.diagnosticArchivePath !== null) ||
    requiresArchive !== (operation.diagnosticFiles.length === 3)
  )
    throw new Error(
      `Workspace-cleanup operation ${operation.id} has inconsistent diagnostic evidence.`,
    );
  if (operation.inputStateRevision > state.revision)
    throw new Error(
      `Workspace-cleanup operation ${operation.id} names a future input revision.`,
    );
}

function cleanupIntentRecord(
  state: OrchestratorState,
  operation: WorkspaceCleanupOperation,
): OrchestratorState {
  return {
    ...state,
    milestones: state.milestones.map((milestone) =>
      milestone.proposal.id === operation.milestoneId
        ? {
            ...milestone,
            workspace: milestone.workspace
              ? {
                  ...milestone.workspace,
                  preserved: true,
                  cleanup: {
                    ...milestone.workspace.cleanup,
                    status: "pending" as const,
                    reason: operation.reason,
                    requestedAt: operation.requestedAt,
                    completedAt: null,
                    nodeModulesRemovedAt: null,
                    diagnosticArchivePath: operation.diagnosticArchivePath,
                    error: null,
                  },
                }
              : null,
            timestamps: {
              ...milestone.timestamps,
              updatedAt: operation.createdAt,
            },
          }
        : milestone,
    ),
    pendingOperation: operation,
  };
}

export function setWorkspaceCleanupOperation(
  state: OrchestratorState,
  operation: WorkspaceCleanupOperation,
): OrchestratorState {
  if (state.pendingOperation !== null)
    throw new Error(
      `Cannot start workspace-cleanup operation ${operation.id}; operation ${state.pendingOperation.id} is already pending.`,
    );
  if (operation.phase !== "intent-persisted" || operation.diagnostic !== null)
    throw new Error(
      "A new workspace-cleanup operation must begin at intent-persisted.",
    );
  if (operation.inputStateRevision !== state.revision)
    throw new Error(
      `Workspace-cleanup operation ${operation.id} is not bound to input revision ${state.revision}.`,
    );
  assertWorkspaceCleanupContext(state, operation);
  return cleanupIntentRecord(state, operation);
}

export function advanceWorkspaceCleanupOperation(
  state: OrchestratorState,
  operationId: string,
  phase: Exclude<WorkspaceCleanupPhase, "intent-persisted" | "blocked">,
  updatedAt: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "workspace-cleanup" ||
    operation.id !== operationId
  )
    throw new Error(
      `Workspace-cleanup operation ${operationId} is not pending.`,
    );
  if (!CLEANUP_PHASE_TRANSITIONS[operation.phase].includes(phase))
    throw new Error(
      `Workspace-cleanup operation ${operationId} cannot advance from ${operation.phase} to ${phase}.`,
    );
  assertWorkspaceCleanupContext(state, operation);
  return {
    ...state,
    pendingOperation: { ...operation, phase, updatedAt, diagnostic: null },
  };
}

export function blockWorkspaceCleanupOperation(
  state: OrchestratorState,
  operationId: string,
  diagnostic: WorkspaceCleanupDiagnostic,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "workspace-cleanup" ||
    operation.id !== operationId
  )
    throw new Error(
      `Workspace-cleanup operation ${operationId} is not pending.`,
    );
  if (operation.phase === "blocked")
    throw new Error(
      `Workspace-cleanup operation ${operationId} is already blocked.`,
    );
  assertWorkspaceCleanupContext(state, operation);
  return {
    ...state,
    pendingOperation: {
      ...operation,
      phase: "blocked",
      updatedAt: diagnostic.observedAt,
      diagnostic,
    },
  };
}

export function completeWorkspaceCleanupOperation(
  state: OrchestratorState,
  operationId: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "workspace-cleanup" ||
    operation.id !== operationId
  )
    throw new Error(
      `Workspace-cleanup operation ${operationId} is not pending.`,
    );
  const deleting =
    operation.reason === "completed-delete-workspace" ||
    operation.reason === "failed-delete-after-diagnostics";
  const expectedPhase = deleting ? "workspace-deleted" : "dependencies-removed";
  if (operation.phase !== expectedPhase)
    throw new Error(
      `Workspace-cleanup operation ${operationId} cannot complete from ${operation.phase}.`,
    );
  assertWorkspaceCleanupContext(state, operation);
  return {
    ...state,
    milestones: state.milestones.map((milestone) =>
      milestone.proposal.id === operation.milestoneId
        ? {
            ...milestone,
            workspace: milestone.workspace
              ? {
                  ...milestone.workspace,
                  preserved: !deleting,
                  cleanup: {
                    ...milestone.workspace.cleanup,
                    status: deleting
                      ? ("deleted" as const)
                      : ("preserved" as const),
                    reason: operation.reason,
                    requestedAt: operation.requestedAt,
                    completedAt: operation.completionAt,
                    nodeModulesRemovedAt: operation.completionAt,
                    diagnosticArchivePath: operation.diagnosticArchivePath,
                    error: null,
                  },
                }
              : null,
            timestamps: {
              ...milestone.timestamps,
              updatedAt: operation.completionAt,
            },
          }
        : milestone,
    ),
    pendingOperation: null,
  };
}

export function assertRetentionApplyContext(
  state: OrchestratorState,
  operation: RetentionApplyOperation,
): void {
  if (
    state.repository.root !== operation.repositoryRoot ||
    state.repository.targetBranch !== operation.targetBranch ||
    state.repository.verifiedCommit !== operation.verifiedCommit
  )
    throw new Error(
      `Retention-apply operation ${operation.id} does not match repository identity.`,
    );
  if (
    state.run.status !== operation.runStatus ||
    state.run.id !== operation.runId ||
    operation.runStatus === "running" ||
    operation.runStatus === "escalated" ||
    state.reconciliation.active !== null
  )
    throw new Error(
      `Retention-apply operation ${operation.id} does not match an inactive controller.`,
    );
  if (
    state.evidenceRetention.initializedAt !==
      operation.retentionInitializedAt ||
    state.evidenceRetention.lastPrunedAt !== operation.previousLastPrunedAt ||
    state.evidenceRetention.lastReportPath !== operation.previousLastReportPath
  )
    throw new Error(
      `Retention-apply operation ${operation.id} does not match retention state.`,
    );
  if (operation.inputStateRevision > state.revision)
    throw new Error(
      `Retention-apply operation ${operation.id} names a future input revision.`,
    );
}

export function setRetentionApplyOperation(
  state: OrchestratorState,
  operation: RetentionApplyOperation,
): OrchestratorState {
  if (state.pendingOperation !== null)
    throw new Error(
      `Cannot start retention-apply operation ${operation.id}; operation ${state.pendingOperation.id} is already pending.`,
    );
  if (
    operation.phase !== "intent-persisted" ||
    operation.completedDeletionCount !== 0 ||
    operation.diagnostic !== null
  )
    throw new Error(
      "A new retention-apply operation must begin at intent-persisted.",
    );
  if (operation.inputStateRevision !== state.revision)
    throw new Error(
      `Retention-apply operation ${operation.id} is not bound to input revision ${state.revision}.`,
    );
  assertRetentionApplyContext(state, operation);
  return { ...state, pendingOperation: operation };
}

export function advanceRetentionApplyOperation(
  state: OrchestratorState,
  operationId: string,
  phase: Exclude<RetentionApplyPhase, "intent-persisted" | "blocked">,
  completedDeletionCount: number,
  updatedAt: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "retention-apply" ||
    operation.id !== operationId
  )
    throw new Error(`Retention-apply operation ${operationId} is not pending.`);
  const advanced: RetentionApplyOperation = {
    ...operation,
    phase,
    completedDeletionCount,
    updatedAt,
    diagnostic: null,
  };
  if (!retentionPhaseTransitionAllowed(operation, advanced))
    throw new Error(
      `Retention-apply operation ${operationId} cannot advance from ${operation.phase}/${operation.completedDeletionCount} to ${phase}/${completedDeletionCount}.`,
    );
  assertRetentionApplyContext(state, operation);
  return { ...state, pendingOperation: advanced };
}

export function blockRetentionApplyOperation(
  state: OrchestratorState,
  operationId: string,
  diagnostic: RetentionApplyDiagnostic,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "retention-apply" ||
    operation.id !== operationId
  )
    throw new Error(`Retention-apply operation ${operationId} is not pending.`);
  if (operation.phase === "blocked")
    throw new Error(
      `Retention-apply operation ${operationId} is already blocked.`,
    );
  assertRetentionApplyContext(state, operation);
  return {
    ...state,
    pendingOperation: {
      ...operation,
      phase: "blocked",
      updatedAt: diagnostic.observedAt,
      diagnostic,
    },
  };
}

export function completeRetentionApplyOperation(
  state: OrchestratorState,
  operationId: string,
): OrchestratorState {
  const operation = state.pendingOperation;
  if (
    !operation ||
    operation.kind !== "retention-apply" ||
    operation.id !== operationId
  )
    throw new Error(`Retention-apply operation ${operationId} is not pending.`);
  if (
    operation.phase !== "result-written" ||
    operation.completedDeletionCount !== operation.deletions.length
  )
    throw new Error(
      `Retention-apply operation ${operationId} cannot complete from ${operation.phase}/${operation.completedDeletionCount}.`,
    );
  assertRetentionApplyContext(state, operation);
  return {
    ...state,
    evidenceRetention: {
      ...state.evidenceRetention,
      lastPrunedAt: operation.completionAt,
      lastReportPath: operation.resultPath,
    },
    pendingOperation: null,
  };
}

function setPendingOperation(
  state: OrchestratorState,
  operation: PendingOperation,
): OrchestratorState {
  switch (operation.kind) {
    case "workspace-create":
      return setWorkspaceCreateOperation(state, operation);
    case "candidate-prepare":
      return setCandidatePrepareOperation(state, operation);
    case "target-integrate":
      return setTargetIntegrateOperation(state, operation);
    case "workspace-cleanup":
      return setWorkspaceCleanupOperation(state, operation);
    case "retention-apply":
      return setRetentionApplyOperation(state, operation);
  }
}

function completePendingOperation(
  state: OrchestratorState,
  operation: PendingOperation,
): OrchestratorState {
  switch (operation.kind) {
    case "workspace-create":
      return completeWorkspaceCreateOperation(state, operation.id);
    case "candidate-prepare":
      return completeCandidatePrepareOperation(
        state,
        operation.id,
        operation.updatedAt,
      );
    case "target-integrate":
      return completeTargetIntegrateOperation(state, operation.id);
    case "workspace-cleanup":
      return completeWorkspaceCleanupOperation(state, operation.id);
    case "retention-apply":
      return completeRetentionApplyOperation(state, operation.id);
  }
}

function phaseTransitionAllowed(
  before: PendingOperation,
  after: PendingOperation,
): boolean {
  if (before.kind !== after.kind) return false;
  switch (before.kind) {
    case "workspace-create":
      return (
        after.kind === "workspace-create" &&
        WORKSPACE_PHASE_TRANSITIONS[before.phase].includes(after.phase)
      );
    case "candidate-prepare":
      return (
        after.kind === "candidate-prepare" &&
        CANDIDATE_PHASE_TRANSITIONS[before.phase].includes(after.phase)
      );
    case "target-integrate":
      return (
        after.kind === "target-integrate" &&
        TARGET_PHASE_TRANSITIONS[before.phase].includes(after.phase)
      );
    case "workspace-cleanup":
      return (
        after.kind === "workspace-cleanup" &&
        CLEANUP_PHASE_TRANSITIONS[before.phase].includes(after.phase)
      );
    case "retention-apply":
      return (
        after.kind === "retention-apply" &&
        retentionPhaseTransitionAllowed(before, after)
      );
  }
}

function assertPendingOperationContext(
  state: OrchestratorState,
  operation: PendingOperation,
): void {
  switch (operation.kind) {
    case "workspace-create":
      assertWorkspaceCreateContext(state, operation);
      return;
    case "candidate-prepare":
      assertCandidatePrepareContext(state, operation);
      return;
    case "target-integrate":
      assertTargetIntegrateContext(state, operation);
      return;
    case "workspace-cleanup":
      assertWorkspaceCleanupContext(state, operation);
      return;
    case "retention-apply":
      assertRetentionApplyContext(state, operation);
  }
}

function withoutMutableOperationFields(operation: PendingOperation) {
  return Object.fromEntries(
    Object.entries(operation).filter(
      ([key]) =>
        ![
          "phase",
          "completedDeletionCount",
          "updatedAt",
          "diagnostic",
        ].includes(key),
    ),
  );
}

function expectedCandidatePrepareTransition(
  state: OrchestratorState,
  before: CandidatePrepareOperation,
  after: CandidatePrepareOperation,
): OrchestratorState {
  if (after.phase === "blocked") {
    if (!after.diagnostic)
      throw new Error(
        "A blocked candidate-prepare operation needs a diagnostic.",
      );
    return blockCandidatePrepareOperation(state, before.id, after.diagnostic);
  }
  switch (after.phase) {
    case "worker-invocation-started":
      if (!after.workerInvocation)
        throw new Error("Candidate Worker invocation evidence is missing.");
      return advanceCandidatePrepareOperation(
        state,
        before.id,
        {
          phase: after.phase,
          invocation: after.workerInvocation,
        },
        after.updatedAt,
      );
    case "worker-thread-recorded":
      if (!after.workerInvocation?.threadId)
        throw new Error("Candidate Worker thread identity is missing.");
      return advanceCandidatePrepareOperation(
        state,
        before.id,
        { phase: after.phase, threadId: after.workerInvocation.threadId },
        after.updatedAt,
      );
    case "worker-completed":
      if (!after.workerResult)
        throw new Error("Candidate Worker result is missing.");
      return advanceCandidatePrepareOperation(
        state,
        before.id,
        { phase: after.phase, result: after.workerResult },
        after.updatedAt,
      );
    case "worker-evidence-recorded":
    case "checkpoint-recorded":
      return advanceCandidatePrepareOperation(
        state,
        before.id,
        { phase: after.phase },
        after.updatedAt,
      );
    case "checkpoint-prepared":
      if (!after.checkpointPlan)
        throw new Error("Candidate checkpoint plan is missing.");
      return advanceCandidatePrepareOperation(
        state,
        before.id,
        { phase: after.phase, plan: after.checkpointPlan },
        after.updatedAt,
      );
    case "checkpoint-committed":
      if (!after.checkpointResult)
        throw new Error("Candidate checkpoint result is missing.");
      return advanceCandidatePrepareOperation(
        state,
        before.id,
        { phase: after.phase, result: after.checkpointResult },
        after.updatedAt,
      );
    case "intent-persisted":
      throw new Error("Candidate-prepare intent cannot be republished.");
  }
}

export function assertPendingOperationStateTransition(
  previous: OrchestratorState,
  next: OrchestratorState,
  expectedInputGeneration: string,
): void {
  const before = previous.pendingOperation;
  const after = next.pendingOperation;
  if (before === null && after === null) return;

  if (before === null && after !== null) {
    if (after.inputStateGeneration !== expectedInputGeneration)
      throw new Error(
        `Pending operation ${after.id} is not bound to canonical generation ${expectedInputGeneration}.`,
      );
    const expected = setPendingOperation(previous, after);
    if (!isDeepStrictEqual(expected, next))
      throw new Error(
        `${after.kind} intent publication cannot include an unrelated state mutation.`,
      );
    return;
  }

  if (before !== null && after === null) {
    const expected = completePendingOperation(previous, before);
    if (!isDeepStrictEqual(expected, next))
      throw new Error(
        `${before.kind} completion must use the canonical completion reducer.`,
      );
    return;
  }

  if (!before || !after || before.id !== after.id || before.kind !== after.kind)
    throw new Error(
      "A pending operation cannot be replaced by another operation.",
    );
  if (before.kind === "candidate-prepare") {
    if (after.kind !== "candidate-prepare")
      throw new Error("A candidate-prepare operation cannot change kind.");
    const expected = expectedCandidatePrepareTransition(
      previous,
      before,
      after,
    );
    if (!isDeepStrictEqual(expected, next))
      throw new Error(
        `candidate-prepare operation ${before.id} must use its canonical reducer.`,
      );
    return;
  }
  const phaseAllowed = phaseTransitionAllowed(before, after);
  if (
    !isDeepStrictEqual(
      withoutMutableOperationFields(before),
      withoutMutableOperationFields(after),
    ) ||
    !phaseAllowed ||
    after.updatedAt < before.updatedAt ||
    (after.phase === "blocked") !== (after.diagnostic !== null)
  )
    throw new Error(
      `${before.kind} operation ${before.id} has an invalid phase transition.`,
    );
  const expected = { ...previous, pendingOperation: after };
  if (!isDeepStrictEqual(expected, next))
    throw new Error(
      `A pending ${before.kind} operation exclusively owns state mutation.`,
    );
  assertPendingOperationContext(next, after);
}
