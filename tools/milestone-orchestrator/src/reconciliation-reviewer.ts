import { resolve } from "node:path";

import type {
  ProjectProfile,
  ReconciliationRecord,
  ReconciliationReview,
} from "./contracts.js";
import { RECONCILIATION_REVIEW_OUTPUT_SCHEMA } from "./agent-schemas.js";
import type { CodexGateway } from "./codex-gateway.js";
import { structuredReviewApproves } from "./reviewer.js";
import { assertReconciliationReview } from "./schema.js";
import { atomicWriteJson } from "./state-store.js";

export function reconciliationReviewApproves(
  review: ReconciliationReview,
): boolean {
  return structuredReviewApproves(review);
}

function reconciliationReviewPrompt(input: {
  readonly project: ProjectProfile;
  readonly record: ReconciliationRecord;
  readonly d031BaseCommit: string;
  readonly d031CandidateCommit: string;
}): string {
  const record = input.record;
  return [
    `You are the fresh independent read-only reviewer for an external controller-boundary reconciliation of ${input.project.name}. You did not implement the range and must not modify any repository or artifact.`,
    `Read ${input.project.authorityFile}, AGENTS.md, the active execution plan, architecture/verification records, the exact commit-range manifest, focused-evidence index, benchmark, inventory, next proposal, and actual committed diffs. Do not trust implementation prose as evidence.`,
    `Review exact external range ${record.sourceVerifiedCommit}..${record.candidateCommit}, tree ${record.candidateTree}, reconciliation ${record.id}, and commit-range manifest SHA-256 ${record.commitRange.sha256}.`,
    `Explicitly review D-031 sub-boundary ${input.d031BaseCommit}..${input.d031CandidateCommit} and its fresh-process, original-version migration, corruption, persistence/replay, public-action causality, and production Worker-parity closure evidence.`,
    "Explicitly assess complete lineage; protected integrity; absence of fabricated planner/worker/reviewer/attempt/timing/token/thread history; D-031 scope and migration integrity; command-owned evidence; verification-tier non-authority; invariant quality; selector shadow-only enforcement; telemetry non-semantic behavior; artifact containment/non-deletion; state migration/recovery; vertical milestone policy; and dependency-valid next-proposal shape.",
    "Any missing evidence, false check, high/critical finding, scope reduction, or suspicious shortcut requires reject or escalate. Return only the requested structured object; repeat every pinned identity exactly.",
  ].join("\n\n");
}

export async function requestReconciliationReview(input: {
  readonly gateway: CodexGateway;
  readonly project: ProjectProfile;
  readonly record: ReconciliationRecord;
  readonly workspacePath: string;
  readonly artifactDirectory: string;
  readonly timeoutMs: number;
  readonly d031BaseCommit: string;
  readonly d031CandidateCommit: string;
  readonly now?: () => string;
}): Promise<ReconciliationReview> {
  const turn = await input.gateway.run({
    role: "reviewer",
    prompt: reconciliationReviewPrompt(input),
    workingDirectory: input.workspacePath,
    threadId: null,
    outputSchema: RECONCILIATION_REVIEW_OUTPUT_SCHEMA,
    eventLogPath: resolve(
      input.artifactDirectory,
      "reconciliation-reviewer-events.jsonl",
    ),
    timeoutMs: input.timeoutMs,
    attempt: 1,
    escalationReason: null,
    telemetryPhase: "review",
  });
  const parsed = JSON.parse(turn.finalResponse) as Record<string, unknown>;
  const review = assertReconciliationReview({
    ...parsed,
    threadId: turn.threadId,
    reviewedAt: (input.now ?? (() => new Date().toISOString()))(),
  });
  if (
    review.reconciliationId !== input.record.id ||
    review.sourceVerifiedCommit !== input.record.sourceVerifiedCommit ||
    review.candidateCommit !== input.record.candidateCommit ||
    review.candidateTree !== input.record.candidateTree ||
    review.commitRangeManifestSha256 !== input.record.commitRange.sha256
  )
    throw new Error(
      "Reconciliation reviewer returned identities outside the pinned range.",
    );
  await atomicWriteJson(
    resolve(input.artifactDirectory, "reviewer-report.json"),
    review,
  );
  return review;
}
