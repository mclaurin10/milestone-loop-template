import { describe, expect, it } from "vitest";

import type { WorkerFailureRecord, WorkerPolicyState } from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  assertWorkerThreadPolicy,
  decideWorkerEscalation,
  promoteWorkerPolicy,
  recordWorkerThreadLineage,
} from "./reasoning-escalation.js";
import { validConfig, validProposal } from "../test/fixtures.js";

const NOW = "2026-08-02T00:00:00.000Z";

function failure(
  attempt: number,
  kind: WorkerFailureRecord["kind"],
  overrides: Partial<WorkerFailureRecord> = {},
): WorkerFailureRecord {
  return {
    attempt,
    kind,
    acceptanceCriterionIds: [],
    significantArchitecturalCorrection: false,
    deeperCrossSystemReasoning: false,
    evidenceSummary: `${kind} failure`,
    recordedAt: NOW,
    ...overrides,
  };
}

function state(failures: readonly WorkerFailureRecord[]): WorkerPolicyState {
  return {
    activeRole: "feature-worker-initial",
    escalated: false,
    escalationReason: null,
    escalatedAt: null,
    failures,
  };
}

describe("worker reasoning escalation", () => {
  const policy = validConfig().agentPolicy;

  it("promotes after two substantive failed implementation attempts", () => {
    expect(
      decideWorkerEscalation({
        state: state([failure(1, "product"), failure(2, "product")]),
        policy,
      }),
    ).toMatchObject({ escalate: true });
  });

  it("promotes repeated acceptance-criterion and architectural evidence", () => {
    expect(
      decideWorkerEscalation({
        state: state([
          failure(1, "product", { acceptanceCriterionIds: ["SAVE-01"] }),
          failure(1, "review", { acceptanceCriterionIds: ["SAVE-01"] }),
        ]),
        policy,
      }).reason,
    ).toContain("SAVE-01");
    expect(
      decideWorkerEscalation({
        state: state([
          failure(1, "review", {
            significantArchitecturalCorrection: true,
          }),
        ]),
        policy,
      }).reason,
    ).toContain("architectural correction");
  });

  it("promotes explicit cross-system evidence", () => {
    expect(
      decideWorkerEscalation({
        state: state([
          failure(1, "review", { deeperCrossSystemReasoning: true }),
        ]),
        policy,
      }).reason,
    ).toContain("cross-system");
  });

  it("never raises reasoning for transient infrastructure failures", () => {
    expect(
      decideWorkerEscalation({
        state: state([
          failure(1, "infrastructure"),
          failure(2, "infrastructure"),
          failure(3, "infrastructure"),
        ]),
        policy,
      }),
    ).toEqual({ escalate: false, reason: null });
  });

  it("preserves replacement-thread lineage and rejects policy drift on resume", () => {
    const initial = {
      ...createMilestoneRecord(validProposal(), NOW),
      attempts: 1,
    };
    const withInitialThread = recordWorkerThreadLineage({
      milestone: initial,
      threadId: "initial-thread",
      role: "feature-worker-initial",
      assignment: {
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
      },
      now: NOW,
    });
    expect(() =>
      assertWorkerThreadPolicy({
        milestone: withInitialThread,
        role: "feature-worker-initial",
        assignment: {
          model: "gpt-5.6-sol",
          reasoningEffort: "max",
        },
      }),
    ).toThrow(/different model policy/);
    expect(() =>
      assertWorkerThreadPolicy({
        milestone: {
          ...withInitialThread,
          workerThreadLineage: [
            {
              ...withInitialThread.workerThreadLineage[0]!,
              model: "legacy-unrecorded",
              reasoningEffort: "legacy-unrecorded",
            },
          ],
        },
        role: "feature-worker-initial",
        assignment: {
          model: "gpt-5.6-sol",
          reasoningEffort: "xhigh",
        },
      }),
    ).toThrow(/different model policy/);

    const promoted = {
      ...promoteWorkerPolicy(
        withInitialThread,
        "Two substantive implementation attempts failed.",
        NOW,
      ),
      attempts: 2,
    };
    const replacement = recordWorkerThreadLineage({
      milestone: promoted,
      threadId: "max-thread",
      role: "feature-worker-escalated",
      assignment: { model: "gpt-5.6-sol", reasoningEffort: "max" },
      now: NOW,
    });
    expect(replacement.workerThreadId).toBe("max-thread");
    expect(replacement.workerThreadLineage).toEqual([
      expect.objectContaining({
        threadId: "initial-thread",
        role: "feature-worker-initial",
        reasoningEffort: "xhigh",
        replacesThreadId: null,
      }),
      expect.objectContaining({
        threadId: "max-thread",
        role: "feature-worker-escalated",
        reasoningEffort: "max",
        replacesThreadId: "initial-thread",
        replacementReason: "Two substantive implementation attempts failed.",
      }),
    ]);
  });
});
