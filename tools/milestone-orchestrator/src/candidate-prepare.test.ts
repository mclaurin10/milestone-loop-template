import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  candidatePrepareArtifactSha256,
  candidatePrepareProposalContractSha256,
  candidatePrepareProtectedFilesSha256,
  candidatePrepareProtectedPatternsSha256,
  candidatePrepareRetryContextSha256,
  candidatePrepareThreadLineageSha256,
  candidatePrepareWorkerPolicySha256,
} from "./candidate-prepare.js";
import type {
  AgentInvocationRecord,
  CandidatePrepareOperation,
  MilestoneRecord,
  OrchestratorState,
} from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  advanceCandidatePrepareOperation,
  assertPendingOperationStateTransition,
  blockCandidatePrepareOperation,
  completeCandidatePrepareOperation,
  setCandidatePrepareOperation,
} from "./operation-intent.js";
import { assertOrchestratorState } from "./schema.js";
import { validProposal, validState } from "../test/fixtures.js";

const NOW = "2026-08-23T20:00:00.000Z";
const GENERATION = "c".repeat(40);

function fixture(): {
  readonly state: OrchestratorState;
  readonly operation: CandidatePrepareOperation;
} {
  const root = resolve(process.cwd(), "candidate-prepare-unit-fixture");
  const proposal = validProposal({
    id: "candidate-prepare-unit",
    permittedPaths: ["change.txt"],
  });
  const initialMilestone = createMilestoneRecord(proposal, NOW);
  const workspacePath = resolve(
    root,
    "artifacts/orchestrator/workspaces/run-candidate-prepare-unit",
  );
  const workspace = {
    isolation: "standalone-local-clone-branch" as const,
    path: workspacePath,
    branch: "milestone-loop/run/candidate-prepare-unit",
    baseCommit: "a".repeat(40),
    headCommit: null,
    createdAt: NOW,
    preserved: true,
    cleanup: {
      schemaVersion: "1.0.0" as const,
      status: "active" as const,
      reason: null,
      requestedAt: null,
      completedAt: null,
      nodeModulesRemovedAt: null,
      diagnosticArchivePath: null,
      error: null,
    },
  };
  const milestone: MilestoneRecord = {
    ...initialMilestone,
    status: "running",
    attempts: 1,
    workspace,
    timestamps: {
      ...initialMilestone.timestamps,
      readyAt: NOW,
      startedAt: NOW,
      updatedAt: NOW,
    },
    nextAllowedAction: "resume-worker",
  };
  const base = validState(root);
  const state: OrchestratorState = {
    ...base,
    queue: [proposal.id],
    milestones: [milestone],
    activeMilestoneId: proposal.id,
    run: {
      ...base.run,
      id: "candidate-run",
      status: "running",
      startedAt: NOW,
      deadlineAt: "2026-08-24T20:00:00.000Z",
      artifactDirectory: resolve(
        root,
        "artifacts/orchestrator/runs/candidate-run",
      ),
    },
    nextAllowedAction: "resume-worker",
  };
  const attemptDirectory = resolve(
    state.run.artifactDirectory!,
    "milestones",
    proposal.id,
    "attempt-1",
  );
  const candidate = {
    baseCommit: workspace.baseCommit,
    commit: workspace.baseCommit,
    tree: "d".repeat(40),
    clean: true,
    changedEntriesDigest: "e".repeat(64),
  };
  const operation: CandidatePrepareOperation = {
    schemaVersion: "1.0.0",
    kind: "candidate-prepare",
    id: "candidate-prepare-unit-operation",
    runId: "candidate-run",
    milestoneId: proposal.id,
    attempt: 1,
    inputStateGeneration: GENERATION,
    inputStateRevision: 0,
    repositoryRoot: root,
    workspaceRoot: resolve(root, "artifacts/orchestrator/workspaces"),
    targetBranch: "main",
    verifiedCommit: workspace.baseCommit,
    workspacePath,
    workspaceBranch: workspace.branch,
    workspaceBaseCommit: workspace.baseCommit,
    workspaceCreatedAt: workspace.createdAt,
    workspaceCreateOperationId: "workspace-create-unit",
    startingCandidate: candidate,
    startingCommits: [],
    workerRole: "feature-worker-initial",
    workerAssignment: { model: "gpt-5.6-sol", reasoningEffort: "xhigh" },
    initialWorkerThreadId: null,
    initialWorkerThreadLineageSha256:
      candidatePrepareThreadLineageSha256(milestone),
    workerPolicySha256: candidatePrepareWorkerPolicySha256(milestone),
    retryFeedbackSha256: null,
    retryContextSha256: candidatePrepareRetryContextSha256(milestone),
    proposalContractSha256: candidatePrepareProposalContractSha256(milestone),
    protectedFilesSha256: candidatePrepareProtectedFilesSha256(
      state.repository.protectedFiles,
    ),
    protectedPatternsSha256: candidatePrepareProtectedPatternsSha256([
      "PROJECT_GOAL.md",
    ]),
    promptSha256: "f".repeat(64),
    workerEventsPath: resolve(attemptDirectory, "worker-events.jsonl"),
    workerTurnPath: resolve(attemptDirectory, "worker-turn.json"),
    checkpointArtifactPath: resolve(
      attemptDirectory,
      "controller-checkpoint.json",
    ),
    initialRunUsage: state.run.usage,
    initialAgentInvocationCount: 0,
    agentInvocationId: "candidate-run-agent-1",
    workerInvocation: null,
    workerResult: null,
    checkpointPlan: null,
    checkpointResult: null,
    checkpointArtifactSha256: null,
    phase: "intent-persisted",
    createdAt: NOW,
    updatedAt: NOW,
    recoveryPolicy: "validate-resume-adopt-or-preserve",
    diagnostic: null,
  };
  return { state, operation };
}

function invocation(): AgentInvocationRecord {
  return {
    schemaVersion: "1.0.0",
    id: "candidate-run-agent-1",
    role: "feature-worker-initial",
    requestedModel: "gpt-5.6-sol",
    requestedReasoningEffort: "xhigh",
    resolvedModel: null,
    resolvedReasoningEffort: null,
    resolutionEvidence: "sdk-events-do-not-expose-resolved-model-or-effort",
    threadId: null,
    attempt: 1,
    escalated: false,
    escalationReason: null,
    overrideApplied: false,
    overrideReason: null,
    status: "starting",
    startedAt: NOW,
    finishedAt: null,
    error: null,
  };
}

describe("candidate-prepare canonical reducers", () => {
  it("owns invocation, lineage, checkpoint, evidence, and completion state", () => {
    const { state, operation } = fixture();
    let next = setCandidatePrepareOperation(state, operation);
    assertOrchestratorState(next);
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      { phase: "worker-invocation-started", invocation: invocation() },
      NOW,
    );
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      {
        phase: "worker-thread-recorded",
        threadId: "candidate-thread",
      },
      NOW,
    );
    const workerArtifact = {
      schemaVersion: "1.0.0",
      threadId: "candidate-thread",
    };
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      {
        phase: "worker-completed",
        result: {
          threadId: "candidate-thread",
          usage: {
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 3,
            reasoningOutputTokens: 1,
          },
          itemCount: 1,
          finalResponseSha256: "1".repeat(64),
          workerTurnSha256: candidatePrepareArtifactSha256(workerArtifact),
          finishedAt: NOW,
        },
      },
      NOW,
    );
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      { phase: "worker-evidence-recorded" },
      NOW,
    );
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      {
        phase: "checkpoint-prepared",
        plan: {
          preCheckpointCommit: operation.workspaceBaseCommit,
          expectedTree: "2".repeat(40),
          commitMessage: "Controller checkpoint: unit",
          controllerCommitRequired: true,
          observedPaths: ["change.txt"],
          workingPaths: ["change.txt"],
          preparedAt: NOW,
        },
      },
      NOW,
    );
    const checkpointCommit = "3".repeat(40);
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      {
        phase: "checkpoint-committed",
        result: {
          candidate: {
            ...operation.startingCandidate,
            commit: checkpointCommit,
            tree: "2".repeat(40),
            changedEntriesDigest: "4".repeat(64),
          },
          commits: [checkpointCommit],
          finalChangedPaths: ["change.txt"],
          controllerCommit: checkpointCommit,
          committedAt: NOW,
        },
      },
      NOW,
    );
    expect(next.pendingOperation).toMatchObject({
      kind: "candidate-prepare",
      phase: "checkpoint-committed",
      checkpointArtifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    next = advanceCandidatePrepareOperation(
      next,
      operation.id,
      { phase: "checkpoint-recorded" },
      NOW,
    );
    assertOrchestratorState(next);
    const completed = completeCandidatePrepareOperation(
      next,
      operation.id,
      NOW,
    );
    expect(completed.pendingOperation).toBeNull();
    expect(completed.nextAllowedAction).toBe("verify");
    expect(completed.milestones[0]).toMatchObject({
      status: "verifying",
      retryFeedback: null,
      nextAllowedAction: "verify",
      workerThreadId: "candidate-thread",
    });
    expect(completed.run.usage).toEqual({
      codexInvocations: 1,
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 3,
      reasoningOutputTokens: 1,
    });
  });

  it("blocks without clearing evidence and rejects unrelated pending mutation", () => {
    const { state, operation } = fixture();
    const pending = setCandidatePrepareOperation(state, operation);
    const blocked = blockCandidatePrepareOperation(pending, operation.id, {
      classification: "worker-outcome-ambiguous",
      message: "Worker outcome cannot be attributed exactly.",
      observedAt: NOW,
      observedHead: operation.startingCandidate.commit,
      preservedPaths: [operation.workspacePath],
      quarantinePath: null,
    });
    expect(blocked.pendingOperation).toMatchObject({
      kind: "candidate-prepare",
      phase: "blocked",
      diagnostic: { classification: "worker-outcome-ambiguous" },
    });
    expect(() =>
      assertPendingOperationStateTransition(
        pending,
        { ...blocked, queue: [...blocked.queue, "unrelated"] },
        GENERATION,
      ),
    ).toThrow(/canonical reducer/);
  });

  it("rejects malformed candidate intent topology through the state schema", () => {
    const { state, operation } = fixture();
    const pending = setCandidatePrepareOperation(state, operation);
    expect(() =>
      assertOrchestratorState({
        ...pending,
        pendingOperation: {
          ...operation,
          checkpointArtifactPath: operation.workerTurnPath,
        },
      }),
    ).toThrow(/pending operation is invalid/);
  });
});
