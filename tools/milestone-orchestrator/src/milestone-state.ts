import { createHash } from "node:crypto";

import type {
  MilestoneRecord,
  MilestoneStatus,
  OrchestratorState,
  ProposalProvenance,
  RequiredNextVerticalConsumer,
} from "./contracts.js";
import { assertTransition, nextActionForStatus } from "./transitions.js";

export function createMilestoneRecord(
  proposal: MilestoneRecord["proposal"],
  now: string,
  proposalProvenance: ProposalProvenance = {
    schemaVersion: "1.0.0",
    source: "legacy-unrecorded",
    sourcePath: null,
    sourceSha256: null,
    plannerThreadId: null,
    recordedAt: now,
    reason: "State schema predates proposal provenance.",
  },
): MilestoneRecord {
  return {
    proposal,
    proposalProvenance,
    status: "proposed",
    attempts: 0,
    infrastructureFailures: 0,
    workerThreadId: null,
    workerThreadLineage: [],
    workerPolicy: {
      activeRole: "gameplay-worker-initial",
      escalated: false,
      escalationReason: null,
      escalatedAt: null,
      failures: [],
    },
    reviewerThreadIds: [],
    timestamps: {
      proposedAt: now,
      readyAt: null,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    },
    verificationSummaries: [],
    reviewerDecisions: [],
    commits: [],
    blockers: [],
    workspace: null,
    retryFeedback: null,
    nextAllowedAction: "plan",
  };
}

export function requiredVerticalConsumerAfterCompletion(
  current: RequiredNextVerticalConsumer | null,
  proposal: MilestoneRecord["proposal"],
): RequiredNextVerticalConsumer | null {
  const vertical = proposal.verticalSlice;
  if (vertical?.mode === "exception") {
    if (!vertical.exception)
      throw new Error(
        `Exception milestone ${proposal.id} has no immediate-consumer contract.`,
      );
    return {
      sourceMilestoneId: proposal.id,
      consumerMilestoneId: vertical.exception.immediateConsumerMilestoneId,
      consumerContractSha256: createHash("sha256")
        .update(vertical.exception.consumerContract)
        .digest("hex"),
    };
  }
  return current?.consumerMilestoneId === proposal.id ? null : current;
}

export function assertRequiredVerticalConsumerStart(
  state: OrchestratorState,
  milestoneId: string,
): void {
  const required = state.requiredNextVerticalConsumer;
  if (required && required.consumerMilestoneId !== milestoneId)
    throw new Error(
      `Milestone ${required.consumerMilestoneId} must immediately consume ${required.sourceMilestoneId} before ${milestoneId} may start.`,
    );
}

export function replaceMilestone(
  state: OrchestratorState,
  id: string,
  update: (record: MilestoneRecord) => MilestoneRecord,
): OrchestratorState {
  let found = false;
  const milestones = state.milestones.map((milestone) => {
    if (milestone.proposal.id !== id) return milestone;
    found = true;
    return update(milestone);
  });
  if (!found) throw new Error(`Unknown milestone ${id}.`);
  return { ...state, milestones };
}

export function transitionMilestone(
  state: OrchestratorState,
  id: string,
  status: MilestoneStatus,
  now: string,
): OrchestratorState {
  return replaceMilestone(state, id, (record) => {
    assertTransition(record.status, status);
    return {
      ...record,
      status,
      nextAllowedAction: nextActionForStatus(status),
      timestamps: {
        ...record.timestamps,
        readyAt: status === "ready" ? now : record.timestamps.readyAt,
        startedAt:
          status === "running" && !record.timestamps.startedAt
            ? now
            : record.timestamps.startedAt,
        completedAt:
          status === "completed" ? now : record.timestamps.completedAt,
        updatedAt: now,
      },
    };
  });
}

export function milestoneById(
  state: OrchestratorState,
  id: string,
): MilestoneRecord {
  const milestone = state.milestones.find((entry) => entry.proposal.id === id);
  if (!milestone) throw new Error(`Unknown milestone ${id}.`);
  return milestone;
}
