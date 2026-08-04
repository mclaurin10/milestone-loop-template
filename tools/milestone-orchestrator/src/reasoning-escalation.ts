import type {
  AgentAssignment,
  AgentModelPolicy,
  MilestoneRecord,
  MilestoneProposal,
  ReviewerReport,
  VerificationSummary,
  WorkerFailureRecord,
  WorkerPolicyState,
} from "./contracts.js";
import { redactSensitiveText } from "./redaction.js";

export interface WorkerEscalationDecision {
  readonly escalate: boolean;
  readonly reason: string | null;
}

type WorkerRole = "gameplay-worker-initial" | "gameplay-worker-escalated";

export function assertWorkerThreadPolicy(input: {
  readonly milestone: MilestoneRecord;
  readonly role: WorkerRole;
  readonly assignment: AgentAssignment;
}): void {
  if (!input.milestone.workerThreadId) return;
  const recorded = input.milestone.workerThreadLineage.at(-1);
  if (
    !recorded ||
    recorded.threadId !== input.milestone.workerThreadId ||
    recorded.role !== input.role ||
    recorded.model !== input.assignment.model ||
    recorded.reasoningEffort !== input.assignment.reasoningEffort
  )
    throw new Error(
      "Stored worker thread cannot resume under a different model policy.",
    );
}

export function recordWorkerThreadLineage(input: {
  readonly milestone: MilestoneRecord;
  readonly threadId: string;
  readonly role: WorkerRole;
  readonly assignment: AgentAssignment;
  readonly now: string;
}): MilestoneRecord {
  const { milestone, threadId, role, assignment } = input;
  if (milestone.workerPolicy.activeRole !== role)
    throw new Error(
      `Worker role changed during thread start: expected ${milestone.workerPolicy.activeRole}, observed ${role}.`,
    );
  if (milestone.workerThreadId === threadId) {
    assertWorkerThreadPolicy({ milestone, role, assignment });
    return milestone;
  }
  if (milestone.workerThreadId)
    throw new Error("Worker thread identity changed within one policy role.");
  const previous = milestone.workerThreadLineage.at(-1) ?? null;
  if (role === "gameplay-worker-escalated" && !previous)
    throw new Error(
      "Escalated worker replacement has no prior thread lineage.",
    );
  return {
    ...milestone,
    workerThreadId: threadId,
    workerThreadLineage: [
      ...milestone.workerThreadLineage,
      {
        threadId,
        role,
        model: assignment.model,
        reasoningEffort: assignment.reasoningEffort,
        startedAt: input.now,
        attempt: milestone.attempts,
        replacesThreadId:
          role === "gameplay-worker-escalated"
            ? (previous?.threadId ?? null)
            : null,
        replacementReason:
          role === "gameplay-worker-escalated"
            ? milestone.workerPolicy.escalationReason
            : null,
      },
    ],
    timestamps: { ...milestone.timestamps, updatedAt: input.now },
  };
}

export function promoteWorkerPolicy(
  milestone: MilestoneRecord,
  reason: string,
  now: string,
): MilestoneRecord {
  if (milestone.workerPolicy.escalated) return milestone;
  if (!milestone.workerThreadLineage.at(-1))
    throw new Error("Cannot promote a worker before an initial thread exists.");
  return {
    ...milestone,
    workerThreadId: null,
    workerPolicy: {
      ...milestone.workerPolicy,
      activeRole: "gameplay-worker-escalated",
      escalated: true,
      escalationReason: reason,
      escalatedAt: now,
    },
    timestamps: { ...milestone.timestamps, updatedAt: now },
  };
}

function boundedSummary(value: string): string {
  const redacted = redactSensitiveText(value).trim();
  return redacted.slice(0, 4_000) || "No additional failure summary.";
}

export function failedAcceptanceCriteria(
  proposal: MilestoneProposal,
  verification: VerificationSummary,
): readonly string[] {
  const evidence = [
    verification.summary,
    ...verification.commands
      .filter((command) => command.status !== "PASS")
      .flatMap((command) => [command.id, command.message]),
  ].join("\n");
  return proposal.acceptanceCriteria
    .map((criterion) => criterion.id)
    .filter((id) => evidence.includes(id));
}

export function verificationFailureRecord(input: {
  readonly proposal: MilestoneProposal;
  readonly verification: VerificationSummary;
  readonly recordedAt: string;
}): WorkerFailureRecord {
  return {
    attempt: input.verification.attempt,
    kind:
      input.verification.failureKind === "infrastructure"
        ? "infrastructure"
        : "product",
    acceptanceCriterionIds: failedAcceptanceCriteria(
      input.proposal,
      input.verification,
    ),
    significantArchitecturalCorrection: false,
    deeperCrossSystemReasoning: false,
    evidenceSummary: boundedSummary(input.verification.summary),
    recordedAt: input.recordedAt,
  };
}

export function reviewerFailureRecord(input: {
  readonly report: ReviewerReport;
  readonly attempt: number;
  readonly recordedAt: string;
}): WorkerFailureRecord {
  const significantArchitecturalCorrection =
    input.report.decision !== "approve" &&
    (!input.report.checks.architectureCompliance ||
      input.report.findings.some(
        (finding) =>
          ["high", "critical"].includes(finding.severity) &&
          /arch(?:itecture|itectural)?/i.test(
            `${finding.code} ${finding.message}`,
          ),
      ));
  const deeperCrossSystemReasoning = input.report.findings.some(
    (finding) =>
      ["high", "critical"].includes(finding.severity) &&
      finding.code === "CROSS_SYSTEM_REASONING_REQUIRED",
  );
  return {
    attempt: input.attempt,
    kind: "review",
    acceptanceCriterionIds: [],
    significantArchitecturalCorrection,
    deeperCrossSystemReasoning,
    evidenceSummary: boundedSummary(input.report.summary),
    recordedAt: input.recordedAt,
  };
}

export function infrastructureFailureRecord(input: {
  readonly attempt: number;
  readonly summary: string;
  readonly recordedAt: string;
}): WorkerFailureRecord {
  return {
    attempt: Math.max(1, input.attempt),
    kind: "infrastructure",
    acceptanceCriterionIds: [],
    significantArchitecturalCorrection: false,
    deeperCrossSystemReasoning: false,
    evidenceSummary: boundedSummary(input.summary),
    recordedAt: input.recordedAt,
  };
}

export function decideWorkerEscalation(input: {
  readonly state: WorkerPolicyState;
  readonly policy: AgentModelPolicy;
}): WorkerEscalationDecision {
  if (input.state.escalated)
    return { escalate: false, reason: input.state.escalationReason };
  const substantive = input.state.failures.filter(
    (failure) => failure.kind !== "infrastructure",
  );
  if (substantive.some((failure) => failure.significantArchitecturalCorrection))
    return {
      escalate: true,
      reason:
        "Independent review requires significant architectural correction.",
    };
  if (substantive.some((failure) => failure.deeperCrossSystemReasoning))
    return {
      escalate: true,
      reason: "Independent evidence requires deeper cross-system reasoning.",
    };

  const criterionCounts = new Map<string, number>();
  for (const failure of substantive)
    for (const criterionId of failure.acceptanceCriterionIds)
      criterionCounts.set(
        criterionId,
        (criterionCounts.get(criterionId) ?? 0) + 1,
      );
  const repeated = [...criterionCounts.entries()].find(
    ([, count]) =>
      count >=
      input.policy.workerEscalation.repeatedAcceptanceCriterionFailures,
  );
  if (repeated)
    return {
      escalate: true,
      reason: `Acceptance criterion ${repeated[0]} failed ${repeated[1]} times.`,
    };
  if (
    new Set(substantive.map((failure) => failure.attempt)).size >=
    input.policy.workerEscalation.substantiveFailureAttempts
  )
    return {
      escalate: true,
      reason: `Two substantive implementation attempts failed (${[
        ...new Set(substantive.map((failure) => failure.attempt)),
      ].join(", ")}).`,
    };
  return { escalate: false, reason: null };
}
