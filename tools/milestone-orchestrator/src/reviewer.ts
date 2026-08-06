import { resolve } from "node:path";

import type {
  CandidateIdentity,
  MilestoneProposal,
  ProjectProfile,
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
  project: ProjectProfile,
  proposal: MilestoneProposal,
  verified: CandidateIdentity,
  verificationResultSha256: string,
  verification: VerificationSummary,
): string {
  return [
    "You are an independent, read-only reviewer. You did not implement this milestone and must not modify the repository.",
    `Read ${project.authorityFile}, AGENTS.md, the approved proposal, architecture documentation, and the actual committed diff.`,
    `Review the exact range ${verified.baseCommit}..${verified.commit}.`,
    `Pinned machine-verified candidate: base commit ${verified.baseCommit}, head commit ${verified.commit}, tree ${verified.tree}, authoritative verification result sha256 ${verificationResultSha256}.`,
    `Approved proposal: ${JSON.stringify(proposal)}.`,
    `Machine verification summary: ${JSON.stringify(verification)}.`,
    "Check acceptance evidence, architectural compliance, test quality, suspicious shortcuts, scope reduction, protected-test weakening, and unhandled regressions.",
    "Do not trust the worker's prose as evidence. A high/critical finding, any false check, or missing trustworthy evidence requires reject or escalate.",
    "Return only the structured review object requested by the output schema; repeat every pinned identity field exactly as given.",
  ].join("\n\n");
}

export async function requestReview(input: {
  readonly gateway: CodexGateway;
  readonly project: ProjectProfile;
  readonly proposal: MilestoneProposal;
  readonly verification: VerificationSummary;
  readonly workspacePath: string;
  readonly verifiedCandidate: CandidateIdentity;
  readonly verificationResultSha256: string;
  readonly attempt: number;
  readonly artifactDirectory: string;
  readonly timeoutMs: number;
  readonly onThreadStarted?: (threadId: string) => void | Promise<void>;
  readonly now?: () => string;
}): Promise<ReviewerReport> {
  const turn = await input.gateway.run({
    role: "reviewer",
    prompt: reviewPrompt(
      input.project,
      input.proposal,
      input.verifiedCandidate,
      input.verificationResultSha256,
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
  if (
    parsed.verifiedBaseCommit !== input.verifiedCandidate.baseCommit ||
    parsed.verifiedHeadCommit !== input.verifiedCandidate.commit ||
    parsed.verifiedTree !== input.verifiedCandidate.tree ||
    parsed.verificationResultSha256 !== input.verificationResultSha256
  )
    throw new Error(
      "Reviewer returned identities outside the pinned verified candidate.",
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
