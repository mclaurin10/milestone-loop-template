import { isDeepStrictEqual } from "node:util";

import type {
  IsolatedWorkspaceRecord,
  OrchestratorState,
  PendingOperation,
  TargetIntegrateDiagnostic,
  TargetIntegrateOperation,
  TargetIntegratePhase,
  WorkspaceCreateDiagnostic,
  WorkspaceCreateOperation,
  WorkspaceCreatePhase,
} from "./contracts.js";
import { requiredVerticalConsumerAfterCompletion } from "./milestone-state.js";
import { humanPlaytestStopReason } from "./readiness-completion.js";
import { reviewerApproves } from "./reviewer.js";

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
      operation.verificationResultSha256
  )
    throw new Error(
      `Target-integrate operation ${operation.id} does not match the pinned verification.`,
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

function withoutMutableOperationFields(operation: PendingOperation) {
  return Object.fromEntries(
    Object.entries(operation).filter(
      ([key]) => !["phase", "updatedAt", "diagnostic"].includes(key),
    ),
  );
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
    const expected =
      after.kind === "workspace-create"
        ? setWorkspaceCreateOperation(previous, after)
        : setTargetIntegrateOperation(previous, after);
    if (!isDeepStrictEqual(expected, next))
      throw new Error(
        `${after.kind} intent publication cannot include an unrelated state mutation.`,
      );
    return;
  }

  if (before !== null && after === null) {
    const expected =
      before.kind === "workspace-create"
        ? completeWorkspaceCreateOperation(previous, before.id)
        : completeTargetIntegrateOperation(previous, before.id);
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
  const phaseAllowed =
    before.kind === "workspace-create" && after.kind === "workspace-create"
      ? WORKSPACE_PHASE_TRANSITIONS[before.phase].includes(after.phase)
      : before.kind === "target-integrate" &&
        after.kind === "target-integrate" &&
        TARGET_PHASE_TRANSITIONS[before.phase].includes(after.phase);
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
  if (after.kind === "workspace-create")
    assertWorkspaceCreateContext(next, after);
  else assertTargetIntegrateContext(next, after);
}
