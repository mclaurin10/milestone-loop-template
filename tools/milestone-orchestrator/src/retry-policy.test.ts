import { describe, expect, it } from "vitest";

import type { MilestoneRecord } from "./contracts.js";
import { decideRetry, recoveryAction } from "./retry-policy.js";
import { validConfig, validProposal } from "../test/fixtures.js";

function milestone(
  attempts: number,
  status: MilestoneRecord["status"] = "verifying",
): MilestoneRecord {
  return {
    proposal: validProposal(),
    proposalProvenance: {
      schemaVersion: "1.0.0",
      source: "legacy-unrecorded",
      sourcePath: null,
      sourceSha256: null,
      plannerThreadId: null,
      recordedAt: "2026-08-01T00:00:00.000Z",
      reason: "State schema predates proposal provenance.",
    },
    status,
    attempts,
    infrastructureFailures: 0,
    workerThreadId: "worker-thread",
    workerThreadLineage: [
      {
        threadId: "worker-thread",
        role: "gameplay-worker-initial",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        startedAt: "2026-08-01T00:00:00.000Z",
        attempt: 1,
        replacesThreadId: null,
        replacementReason: null,
      },
    ],
    workerPolicy: {
      activeRole: "gameplay-worker-initial",
      escalated: false,
      escalationReason: null,
      escalatedAt: null,
      failures: [],
    },
    reviewerThreadIds: [],
    timestamps: {
      proposedAt: "2026-08-01T00:00:00.000Z",
      readyAt: "2026-08-01T00:00:00.000Z",
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    verificationSummaries: [],
    reviewerDecisions: [],
    commits: [],
    blockers: [],
    workspace: null,
    retryFeedback: null,
    nextAllowedAction: "verify",
  };
}

describe("retry and recovery policy", () => {
  it("retries ordinary failures with the same worker thread", () => {
    expect(
      decideRetry({
        milestone: milestone(1),
        config: validConfig(),
        failureKind: "product",
        consecutiveInfrastructureFailures: 0,
      }),
    ).toMatchObject({ action: "retry", nextAllowedAction: "retry" });
  });

  it("stops at attempt and infrastructure limits", () => {
    expect(
      decideRetry({
        milestone: milestone(3),
        config: validConfig(),
        failureKind: "product",
        consecutiveInfrastructureFailures: 0,
      }).action,
    ).toBe("escalate");
    expect(
      decideRetry({
        milestone: milestone(1),
        config: validConfig(),
        failureKind: "infrastructure",
        consecutiveInfrastructureFailures: 3,
      }).action,
    ).toBe("escalate");
  });

  it("recovers interrupted phases without restarting completed work", () => {
    expect(recoveryAction(milestone(1, "running"))).toBe("resume-worker");
    expect(
      recoveryAction({
        ...milestone(2, "running"),
        workerThreadId: null,
        workerPolicy: {
          ...milestone(2).workerPolicy,
          activeRole: "gameplay-worker-escalated",
          escalated: true,
          escalationReason: "Two substantive attempts failed.",
          escalatedAt: "2026-08-01T00:00:00.000Z",
        },
      }),
    ).toBe("resume-worker");
    expect(recoveryAction(milestone(1, "verifying"))).toBe("verify");
    expect(recoveryAction(milestone(1, "reviewing"))).toBe("review");
  });
});
