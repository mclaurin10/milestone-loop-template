import { resolve } from "node:path";

import type {
  MilestoneProposal,
  ReviewerReport,
  VerificationSummary,
} from "./contracts.js";
import { REVIEW_OUTPUT_SCHEMA } from "./agent-schemas.js";
import type { CodexGateway } from "./codex-gateway.js";
import { assertReviewerReport } from "./schema.js";
import { atomicWriteJson } from "./state-store.js";

export function structuredReviewApproves(report: {
  readonly decision: "approve" | "reject" | "escalate";
  readonly checks: object;
  readonly findings: readonly {
    readonly severity: "low" | "medium" | "high" | "critical";
  }[];
}): boolean {
  return (
    report.decision === "approve" &&
    Object.values(report.checks).every((value) => value === true) &&
    report.findings.every(
      (finding) =>
        finding.severity !== "high" && finding.severity !== "critical",
    )
  );
}

export function reviewerApproves(report: ReviewerReport): boolean {
  return structuredReviewApproves(report);
}

function reviewPrompt(
  proposal: MilestoneProposal,
  baseCommit: string,
  headCommit: string,
  verification: VerificationSummary,
): string {
  return [
    "You are an independent, read-only reviewer. You did not implement this milestone and must not modify the repository.",
    "Read SKI_TYCOON_GOAL.md, AGENTS.md, the approved proposal, architecture documentation, and the actual committed diff.",
    `Review the exact range ${baseCommit}..${headCommit}.`,
    `Approved proposal: ${JSON.stringify(proposal)}.`,
    `Machine verification summary: ${JSON.stringify(verification)}.`,
    "Check acceptance evidence, architectural compliance, test quality, suspicious shortcuts, scope reduction, protected-test weakening, and unhandled regressions.",
    "Do not trust the worker's prose as evidence. A high/critical finding, any false check, or missing trustworthy evidence requires reject or escalate.",
    "Return only the structured review object requested by the output schema.",
  ].join("\n\n");
}

export async function requestReview(input: {
  readonly gateway: CodexGateway;
  readonly proposal: MilestoneProposal;
  readonly verification: VerificationSummary;
  readonly workspacePath: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly attempt: number;
  readonly artifactDirectory: string;
  readonly timeoutMs: number;
  readonly onThreadStarted?: (threadId: string) => void | Promise<void>;
  readonly now?: () => string;
}): Promise<ReviewerReport> {
  const turn = await input.gateway.run({
    role: "reviewer",
    prompt: reviewPrompt(
      input.proposal,
      input.baseCommit,
      input.headCommit,
      input.verification,
    ),
    workingDirectory: input.workspacePath,
    threadId: null,
    outputSchema: REVIEW_OUTPUT_SCHEMA,
    eventLogPath: resolve(input.artifactDirectory, "reviewer-events.jsonl"),
    timeoutMs: input.timeoutMs,
    attempt: input.attempt,
    escalationReason: null,
    telemetryPhase: "review",
    ...(input.onThreadStarted
      ? { onThreadStarted: input.onThreadStarted }
      : {}),
  });
  const parsed = assertReviewerReport(
    JSON.parse(turn.finalResponse) as unknown,
  );
  const report: ReviewerReport = {
    ...parsed,
    attempt: input.attempt,
    threadId: turn.threadId,
    reviewedAt: (input.now ?? (() => new Date().toISOString()))(),
  };
  await atomicWriteJson(
    resolve(input.artifactDirectory, "reviewer-report.json"),
    report,
  );
  return report;
}
