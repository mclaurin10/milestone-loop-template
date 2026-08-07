import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  OrchestratorState,
  TargetIntegrateOperation,
  WorkspaceCreateOperation,
  WorkspaceCleanupOperation,
} from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  advanceTargetIntegrateOperation,
  advanceWorkspaceCleanupOperation,
  advanceWorkspaceCreateOperation,
  assertPendingOperationStateTransition,
  blockTargetIntegrateOperation,
  blockWorkspaceCleanupOperation,
  blockWorkspaceCreateOperation,
  completeTargetIntegrateOperation,
  completeWorkspaceCleanupOperation,
  completeWorkspaceCreateOperation,
  setTargetIntegrateOperation,
  setWorkspaceCleanupOperation,
  setWorkspaceCreateOperation,
} from "./operation-intent.js";
import { validateOrchestratorState } from "./schema.js";
import { StateStore } from "./state-store.js";
import {
  validFeatureProposal,
  validProposal,
  validState,
} from "../test/fixtures.js";
import { planTargetIntegrateOperation } from "./target-integration.js";

const NOW = "2026-08-06T00:00:00.000Z";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-operation-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  return root;
}

function activeState(root: string): OrchestratorState {
  const initial = validState(root);
  const milestone = createMilestoneRecord(
    validProposal({ id: "workspace-intent" }),
    NOW,
  );
  return {
    ...initial,
    queue: [milestone.proposal.id],
    milestones: [
      {
        ...milestone,
        status: "running",
        attempts: 1,
        timestamps: {
          ...milestone.timestamps,
          startedAt: NOW,
          updatedAt: NOW,
        },
        nextAllowedAction: "resume-worker",
      },
    ],
    activeMilestoneId: milestone.proposal.id,
    run: {
      ...initial.run,
      id: "workspace-run",
      status: "running",
      startedAt: NOW,
      deadlineAt: "2026-08-07T00:00:00.000Z",
    },
    nextAllowedAction: "resume-worker",
  };
}

function operation(
  state: OrchestratorState,
  root: string,
  inputStateGeneration = "c".repeat(40),
): WorkspaceCreateOperation {
  const workspaceRoot = resolve(root, "artifacts", "workspaces");
  return {
    schemaVersion: "1.0.0",
    kind: "workspace-create",
    id: "workspace-create-12345678",
    runId: "workspace-run",
    milestoneId: "workspace-intent",
    attempt: 1,
    inputStateGeneration,
    inputStateRevision: state.revision,
    repositoryRoot: resolve(root),
    workspaceRoot,
    targetBranch: "main",
    baseCommit: "a".repeat(40),
    branch: "milestone-loop/workspace-run/workspace-intent",
    temporaryPath: resolve(
      workspaceRoot,
      ".workspace-run-workspace-intent.workspace-create-12345678",
    ),
    finalPath: resolve(workspaceRoot, "workspace-run-workspace-intent"),
    phase: "intent-persisted",
    createdAt: NOW,
    updatedAt: NOW,
    recoveryPolicy: "validate-adopt-or-preserve",
    diagnostic: null,
  };
}

function approvedIntegrationState(root: string): {
  readonly state: OrchestratorState;
  readonly operation: TargetIntegrateOperation;
} {
  const initial = validState(root);
  const candidate = {
    baseCommit: "a".repeat(40),
    commit: "c".repeat(40),
    tree: "d".repeat(40),
    clean: true,
    changedEntriesDigest: "e".repeat(64),
  } as const;
  const verificationResultSha256 = "f".repeat(64);
  const proposal = validFeatureProposal({
    id: "target-intent",
    verticalSlice: {
      mode: "exception",
      userGoal: null,
      publicActionKinds: [],
      sharedRuleOwners: [],
      standardCompositionOwner: null,
      persistenceReplayEvidence: [],
      nodeWorkerParityEvidence: [],
      inspectableConsequence: null,
      exception: {
        kind: "kernel-only",
        justification: "Exercise completion bookkeeping.",
        immediateConsumerMilestoneId: "target-consumer",
        consumerContract: "Consume the target intent through a public action.",
      },
    },
  });
  const milestone = createMilestoneRecord(proposal, NOW);
  const workspacePath = resolve(root, "artifacts", "workspaces", "target");
  const workspaceBranch = "milestone-loop/target-run/target-intent";
  const state: OrchestratorState = {
    ...initial,
    queue: [proposal.id],
    milestones: [
      {
        ...milestone,
        status: "reviewing",
        attempts: 1,
        verificationSummaries: [
          {
            schemaVersion: "1.1.0",
            attempt: 1,
            status: "PASS",
            disposition: "incremental-readiness",
            failureKind: null,
            summary: "Candidate is pinned.",
            startedAt: NOW,
            finishedAt: NOW,
            commands: [],
            authoritative: null,
            candidate,
            authoritativeResultSha256: verificationResultSha256,
            changedPaths: ["change.txt"],
            artifactPaths: ["verification-summary.json"],
          },
        ],
        reviewerDecisions: [
          {
            schemaVersion: "1.1.0",
            decision: "approve",
            summary: "Exact candidate approved.",
            findings: [],
            checks: {
              acceptanceEvidence: true,
              architectureCompliance: true,
              testQuality: true,
              noSuspiciousShortcuts: true,
              noScopeReduction: true,
              regressionsHandled: true,
            },
            verifiedBaseCommit: candidate.baseCommit,
            verifiedHeadCommit: candidate.commit,
            verifiedTree: candidate.tree,
            verificationResultSha256,
            attempt: 1,
            threadId: "target-reviewer",
            reviewedAt: NOW,
          },
        ],
        workspace: {
          isolation: "standalone-local-clone-branch",
          path: workspacePath,
          branch: workspaceBranch,
          baseCommit: candidate.baseCommit,
          headCommit: candidate.commit,
          createdAt: NOW,
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
        },
        timestamps: {
          ...milestone.timestamps,
          startedAt: NOW,
          updatedAt: NOW,
        },
        nextAllowedAction: "review",
      },
    ],
    activeMilestoneId: proposal.id,
    run: {
      ...initial.run,
      id: "target-run",
      status: "running",
      startedAt: NOW,
      deadlineAt: "2026-08-07T00:00:00.000Z",
    },
    nextAllowedAction: "review",
  };
  return {
    state,
    operation: planTargetIntegrateOperation({
      operationId: "target-integrate-12345678",
      inputStateGeneration: "b".repeat(40),
      inputStateRevision: state.revision,
      repositoryRoot: root,
      targetBranch: "main",
      expectedBaseCommit: candidate.baseCommit,
      workspacePath,
      workspaceBranch,
      candidate,
      verificationResultSha256,
      commits: [candidate.commit],
      outcomePath: resolve(root, "artifacts", "runs", "git-outcome.json"),
      runId: "target-run",
      milestoneId: proposal.id,
      attempt: 1,
      now: NOW,
    }),
  };
}

function terminalCleanupState(root: string): {
  readonly state: OrchestratorState;
  readonly operation: WorkspaceCleanupOperation;
} {
  const initial = validState(root);
  const proposal = validProposal({ id: "cleanup-intent" });
  const milestone = createMilestoneRecord(proposal, NOW);
  const workspacePath = resolve(
    root,
    "artifacts",
    "workspaces",
    "cleanup-run-cleanup-intent",
  );
  const workspaceBranch = "milestone-loop/cleanup-run/cleanup-intent";
  const runArtifactDirectory = resolve(
    root,
    "artifacts",
    "orchestrator",
    "runs",
    "cleanup-run",
  );
  const state: OrchestratorState = {
    ...initial,
    milestones: [
      {
        ...milestone,
        status: "completed",
        attempts: 1,
        workspace: {
          isolation: "standalone-local-clone-branch",
          path: workspacePath,
          branch: workspaceBranch,
          baseCommit: "a".repeat(40),
          headCommit: "c".repeat(40),
          createdAt: NOW,
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
        },
        timestamps: {
          ...milestone.timestamps,
          startedAt: NOW,
          completedAt: NOW,
          updatedAt: NOW,
        },
        nextAllowedAction: "plan",
      },
    ],
    run: {
      ...initial.run,
      id: "cleanup-run",
      status: "running",
      startedAt: NOW,
      deadlineAt: "2026-08-07T00:00:00.000Z",
      artifactDirectory: runArtifactDirectory,
    },
    nextAllowedAction: "plan",
  };
  return {
    state,
    operation: {
      schemaVersion: "1.0.0",
      kind: "workspace-cleanup",
      id: "workspace-cleanup-12345678",
      runId: "cleanup-run",
      milestoneId: proposal.id,
      attempt: 1,
      inputStateGeneration: "b".repeat(40),
      inputStateRevision: state.revision,
      repositoryRoot: resolve(root),
      workspaceRoot: resolve(root, "artifacts", "workspaces"),
      artifactRoot: resolve(root, "artifacts", "orchestrator", "runs"),
      targetBranch: "main",
      verifiedCommit: "a".repeat(40),
      workspacePath,
      workspaceBranch,
      workspaceBaseCommit: "a".repeat(40),
      recordedHeadCommit: "c".repeat(40),
      observedHeadCommit: "c".repeat(40),
      workspaceCreatedAt: NOW,
      workspaceCreateOperationId: "workspace-create-source",
      workspaceStatusSha256: "d".repeat(64),
      reason: "completed-delete-workspace",
      runArtifactDirectory,
      diagnosticArchivePath: null,
      diagnosticFiles: [],
      phase: "intent-persisted",
      createdAt: NOW,
      updatedAt: NOW,
      requestedAt: NOW,
      completionAt: NOW,
      recoveryPolicy: "validate-adopt-or-preserve",
      diagnostic: null,
    },
  };
}

describe("workspace-create operation intent", () => {
  it("sets, advances, and clears only through the canonical reducers", () => {
    const root = resolve(process.cwd(), "operation-fixture");
    const state = activeState(root);
    const intent = operation(state, root);
    let next = setWorkspaceCreateOperation(state, intent);
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
    next = advanceWorkspaceCreateOperation(
      next,
      intent.id,
      "clone-started",
      NOW,
    );
    next = advanceWorkspaceCreateOperation(next, intent.id, "clone-ready", NOW);
    next = advanceWorkspaceCreateOperation(
      next,
      intent.id,
      "publish-started",
      NOW,
    );
    next = advanceWorkspaceCreateOperation(next, intent.id, "published", NOW);
    next = completeWorkspaceCreateOperation(next, intent.id);
    expect(next.pendingOperation).toBeNull();
    expect(next.milestones[0]?.workspace).toMatchObject({
      path: intent.finalPath,
      branch: intent.branch,
      baseCommit: intent.baseCommit,
      createdAt: intent.createdAt,
      cleanup: { status: "active" },
    });
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
  });

  it("persists an explicit blocked disposition without clearing evidence", () => {
    const root = resolve(process.cwd(), "operation-fixture");
    const state = activeState(root);
    const intent = operation(state, root);
    const blocked = blockWorkspaceCreateOperation(
      setWorkspaceCreateOperation(state, intent),
      intent.id,
      {
        classification: "invalid-temporary-workspace",
        message: "Temporary path is not the exact intended clone.",
        observedAt: NOW,
        preservedPaths: [intent.temporaryPath],
        quarantinePath: null,
      },
    );
    expect(blocked.pendingOperation).toMatchObject({
      phase: "blocked",
      diagnostic: {
        classification: "invalid-temporary-workspace",
        preservedPaths: [intent.temporaryPath],
      },
    });
    expect(() => completeWorkspaceCreateOperation(blocked, intent.id)).toThrow(
      /cannot complete from blocked/,
    );
    expect(validateOrchestratorState(blocked)).toMatchObject({ valid: true });
  });

  it(
    "binds intent to the exact canonical generation and fences unrelated saves",
    { timeout: 30_000 },
    async () => {
      const root = await repository();
      const store = new StateStore(root, "artifacts/state.json", () => NOW);
      await store.initialize(validState(root));
      const running = await store.save(activeState(root));
      const generation = store.mutationGeneration();
      expect(generation.revision).toBe(running.revision);

      const wrong = operation(running, root, "d".repeat(40));
      await expect(
        store.save(setWorkspaceCreateOperation(running, wrong)),
      ).rejects.toThrow(/not bound to canonical generation/);

      const intent = operation(running, root, generation.objectId);
      const pending = await store.save(
        setWorkspaceCreateOperation(running, intent),
      );
      expect(pending.pendingOperation?.inputStateGeneration).toBe(
        generation.objectId,
      );
      await expect(store.save({ ...pending, queue: [] })).rejects.toThrow(
        /invalid phase transition|exclusively owns state mutation/,
      );

      const cloneStarted = await store.save(
        advanceWorkspaceCreateOperation(
          pending,
          intent.id,
          "clone-started",
          NOW,
        ),
      );
      const reopened = new StateStore(root, "artifacts/state.json", () => NOW);
      await expect(reopened.loadForMutation()).resolves.toEqual(cloneStarted);
    },
  );
});

describe("target-integrate operation intent", () => {
  it("owns every phase and all semantic completion fields in one reducer", () => {
    const root = resolve(process.cwd(), "target-operation-fixture");
    const fixture = approvedIntegrationState(root);
    let next = setTargetIntegrateOperation(fixture.state, fixture.operation);
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
    next = advanceTargetIntegrateOperation(
      next,
      fixture.operation.id,
      "outcome-pending",
      NOW,
    );
    next = advanceTargetIntegrateOperation(
      next,
      fixture.operation.id,
      "target-update-started",
      NOW,
    );
    next = advanceTargetIntegrateOperation(
      next,
      fixture.operation.id,
      "target-updated",
      NOW,
    );
    next = advanceTargetIntegrateOperation(
      next,
      fixture.operation.id,
      "outcome-integrated",
      NOW,
    );
    next = completeTargetIntegrateOperation(next, fixture.operation.id);
    expect(next).toMatchObject({
      repository: { verifiedCommit: fixture.operation.candidate.commit },
      queue: [],
      activeMilestoneId: null,
      run: { status: "running", milestonesProcessed: 1 },
      pendingOperation: null,
      nextAllowedAction: "plan",
      milestones: [
        {
          status: "completed",
          commits: fixture.operation.commits,
          workspace: { headCommit: fixture.operation.candidate.commit },
          timestamps: { completedAt: fixture.operation.completionAt },
        },
      ],
      requiredNextVerticalConsumer: {
        sourceMilestoneId: "target-intent",
        consumerMilestoneId: "target-consumer",
      },
    });
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
  });

  it("blocks without mutating the approved attempt or target identity", () => {
    const root = resolve(process.cwd(), "target-operation-fixture");
    const fixture = approvedIntegrationState(root);
    const pending = setTargetIntegrateOperation(
      fixture.state,
      fixture.operation,
    );
    const blocked = blockTargetIntegrateOperation(
      pending,
      fixture.operation.id,
      {
        classification: "target-dirty",
        message: "Target working tree is dirty.",
        observedAt: NOW,
        targetHead: fixture.operation.expectedBaseCommit,
        preservedPaths: [fixture.operation.repositoryRoot],
        quarantinePath: null,
      },
    );
    expect(blocked.pendingOperation).toMatchObject({
      kind: "target-integrate",
      phase: "blocked",
      diagnostic: { classification: "target-dirty" },
    });
    expect(blocked.repository).toEqual(fixture.state.repository);
    expect(blocked.milestones).toEqual(fixture.state.milestones);
    expect(validateOrchestratorState(blocked)).toMatchObject({ valid: true });
  });
});

describe("workspace-cleanup operation intent", () => {
  it("owns intent publication, destructive phases, and semantic completion", () => {
    const fixture = terminalCleanupState(
      resolve(process.cwd(), "cleanup-operation-fixture"),
    );
    let next = setWorkspaceCleanupOperation(fixture.state, fixture.operation);
    expect(next.milestones[0]?.workspace?.cleanup).toMatchObject({
      status: "pending",
      reason: "completed-delete-workspace",
      requestedAt: NOW,
    });
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
    next = advanceWorkspaceCleanupOperation(
      next,
      fixture.operation.id,
      "workspace-delete-started",
      NOW,
    );
    next = advanceWorkspaceCleanupOperation(
      next,
      fixture.operation.id,
      "workspace-deleted",
      NOW,
    );
    next = completeWorkspaceCleanupOperation(next, fixture.operation.id);
    expect(next).toMatchObject({
      pendingOperation: null,
      milestones: [
        {
          workspace: {
            preserved: false,
            cleanup: {
              status: "deleted",
              completedAt: NOW,
              nodeModulesRemovedAt: NOW,
            },
          },
        },
      ],
    });
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
  });

  it("durably blocks ambiguity and fences unrelated state mutation", () => {
    const fixture = terminalCleanupState(
      resolve(process.cwd(), "cleanup-operation-fixture"),
    );
    const pending = setWorkspaceCleanupOperation(
      fixture.state,
      fixture.operation,
    );
    const advanced = advanceWorkspaceCleanupOperation(
      pending,
      fixture.operation.id,
      "workspace-delete-started",
      NOW,
    );
    expect(() =>
      assertPendingOperationStateTransition(
        pending,
        { ...advanced, queue: ["cleanup-intent"] },
        fixture.operation.inputStateGeneration,
      ),
    ).toThrow(/exclusively owns state mutation/);
    const blocked = blockWorkspaceCleanupOperation(
      pending,
      fixture.operation.id,
      {
        classification: "premature-workspace-missing",
        message: "Workspace disappeared before deletion was authorized.",
        observedAt: NOW,
        preservedPaths: [],
        quarantinePath: null,
      },
    );
    expect(blocked.pendingOperation).toMatchObject({
      kind: "workspace-cleanup",
      phase: "blocked",
      diagnostic: { classification: "premature-workspace-missing" },
    });
    expect(blocked.milestones[0]?.workspace?.cleanup.status).toBe("pending");
    expect(validateOrchestratorState(blocked)).toMatchObject({ valid: true });
  });
});
