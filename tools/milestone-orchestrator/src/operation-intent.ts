import { isDeepStrictEqual } from "node:util";

import type {
  IsolatedWorkspaceRecord,
  OrchestratorState,
  WorkspaceCreateDiagnostic,
  WorkspaceCreateOperation,
  WorkspaceCreatePhase,
} from "./contracts.js";

const PHASE_TRANSITIONS: Readonly<
  Record<WorkspaceCreatePhase, readonly WorkspaceCreatePhase[]>
> = {
  "intent-persisted": ["clone-started", "blocked"],
  "clone-started": ["clone-ready", "blocked"],
  "clone-ready": ["publish-started", "blocked"],
  "publish-started": ["published", "blocked"],
  published: ["blocked"],
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
  if (!operation || operation.id !== operationId)
    throw new Error(
      `Workspace-create operation ${operationId} is not pending.`,
    );
  if (!PHASE_TRANSITIONS[operation.phase].includes(phase))
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
  if (!operation || operation.id !== operationId)
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
  if (!operation || operation.id !== operationId)
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

function withoutMutableOperationFields(operation: WorkspaceCreateOperation) {
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
        `Workspace-create operation ${after.id} is not bound to canonical generation ${expectedInputGeneration}.`,
      );
    const expected = setWorkspaceCreateOperation(previous, after);
    if (!isDeepStrictEqual(expected, next))
      throw new Error(
        "Workspace-create intent publication cannot include an unrelated state mutation.",
      );
    return;
  }

  if (before !== null && after === null) {
    const expected = completeWorkspaceCreateOperation(previous, before.id);
    if (!isDeepStrictEqual(expected, next))
      throw new Error(
        "Workspace-create completion must use the canonical completion reducer.",
      );
    return;
  }

  if (!before || !after || before.id !== after.id)
    throw new Error(
      "A pending workspace-create operation cannot be replaced by another operation.",
    );
  if (
    !isDeepStrictEqual(
      withoutMutableOperationFields(before),
      withoutMutableOperationFields(after),
    ) ||
    !PHASE_TRANSITIONS[before.phase].includes(after.phase) ||
    after.updatedAt < before.updatedAt ||
    (after.phase === "blocked") !== (after.diagnostic !== null)
  )
    throw new Error(
      `Workspace-create operation ${before.id} has an invalid phase transition.`,
    );
  const expected = { ...previous, pendingOperation: after };
  if (!isDeepStrictEqual(expected, next))
    throw new Error(
      "A pending workspace-create operation exclusively owns state mutation.",
    );
  assertWorkspaceCreateContext(next, after);
}
