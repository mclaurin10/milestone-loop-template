import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { requestReview, reviewerApproves } from "./reviewer.js";
import type { CodexGateway } from "./codex-gateway.js";
import type {
  CandidateIdentity,
  ReviewerReport,
  VerificationSummary,
} from "./contracts.js";
import { validProposal } from "../test/fixtures.js";

function report(overrides: Partial<ReviewerReport> = {}): ReviewerReport {
  return {
    schemaVersion: "1.0.0",
    decision: "approve",
    summary: "The diff and evidence satisfy the milestone.",
    findings: [],
    checks: {
      acceptanceEvidence: true,
      architectureCompliance: true,
      testQuality: true,
      noSuspiciousShortcuts: true,
      noScopeReduction: true,
      regressionsHandled: true,
    },
    ...overrides,
  };
}

describe("independent reviewer decision", () => {
  it("accepts only an unqualified approval", () => {
    expect(reviewerApproves(report())).toBe(true);
    expect(reviewerApproves(report({ decision: "reject" }))).toBe(false);
    expect(
      reviewerApproves(
        report({ checks: { ...report().checks, testQuality: false } }),
      ),
    ).toBe(false);
    expect(
      reviewerApproves(
        report({
          findings: [
            {
              code: "SHORTCUT",
              severity: "high",
              message: "Evidence is asserted rather than generated.",
              evidence: "verification-summary.json",
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

const VERIFIED: CandidateIdentity = {
  baseCommit: "a".repeat(40),
  commit: "b".repeat(40),
  tree: "c".repeat(40),
  clean: true,
  changedEntriesDigest: "d".repeat(64),
};
const RESULT_SHA256 = "e".repeat(64);

function verificationSummary(): VerificationSummary {
  return {
    schemaVersion: "1.1.0",
    attempt: 1,
    status: "PASS",
    disposition: "incremental-readiness",
    failureKind: null,
    summary: "Fixture verification summary.",
    startedAt: "2026-08-05T00:00:00.000Z",
    finishedAt: "2026-08-05T00:00:01.000Z",
    commands: [],
    authoritative: null,
    candidate: VERIFIED,
    authoritativeResultSha256: RESULT_SHA256,
    changedPaths: [],
    artifactPaths: [],
  };
}

function reviewerEcho(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: "1.1.0",
    decision: "approve",
    summary: "The pinned candidate passes independent review.",
    findings: [],
    checks: {
      acceptanceEvidence: true,
      architectureCompliance: true,
      testQuality: true,
      noSuspiciousShortcuts: true,
      noScopeReduction: true,
      regressionsHandled: true,
    },
    verifiedBaseCommit: VERIFIED.baseCommit,
    verifiedHeadCommit: VERIFIED.commit,
    verifiedTree: VERIFIED.tree,
    verificationResultSha256: RESULT_SHA256,
    ...overrides,
  };
}

function fakeGateway(
  response: Record<string, unknown>,
  prompts: string[] = [],
): CodexGateway {
  return {
    run: async (invocation) => {
      prompts.push(invocation.prompt);
      return {
        threadId: "reviewer-thread-1",
        finalResponse: JSON.stringify(response),
        usage: null,
        itemCount: 1,
      };
    },
  };
}

async function runRequestReview(
  response: Record<string, unknown>,
  prompts: string[] = [],
): Promise<{ report: ReviewerReport; artifactDirectory: string }> {
  const artifactDirectory = await mkdtemp(
    join(tmpdir(), "milestone-loop-review-"),
  );
  temporaryDirectories.push(artifactDirectory);
  const report = await requestReview({
    gateway: fakeGateway(response, prompts),
    project: {
      name: "Example Project",
      authorityFile: "PROJECT_GOAL.md",
      verticalSpine: { minimumCategories: 4, categoryPatterns: [] },
    },
    proposal: validProposal(),
    verification: verificationSummary(),
    workspacePath: artifactDirectory,
    verifiedCandidate: VERIFIED,
    verificationResultSha256: RESULT_SHA256,
    attempt: 1,
    artifactDirectory,
    timeoutMs: 1000,
    now: () => "2026-08-05T00:00:02.000Z",
  });
  return { report, artifactDirectory };
}

describe("pinned identity review requests", () => {
  it("pins the verified candidate in the prompt and persists the echoed report", async () => {
    const prompts: string[] = [];
    const { report, artifactDirectory } = await runRequestReview(
      reviewerEcho(),
      prompts,
    );
    expect(prompts[0]).toContain(VERIFIED.commit);
    expect(prompts[0]).toContain(VERIFIED.tree);
    expect(prompts[0]).toContain(RESULT_SHA256);
    expect(report).toMatchObject({
      schemaVersion: "1.1.0",
      decision: "approve",
      verifiedBaseCommit: VERIFIED.baseCommit,
      verifiedHeadCommit: VERIFIED.commit,
      verifiedTree: VERIFIED.tree,
      verificationResultSha256: RESULT_SHA256,
      attempt: 1,
      threadId: "reviewer-thread-1",
      reviewedAt: "2026-08-05T00:00:02.000Z",
    });
    const persisted = JSON.parse(
      await readFile(join(artifactDirectory, "reviewer-report.json"), "utf8"),
    ) as ReviewerReport;
    expect(persisted).toEqual(report);
  });

  it("rejects a reviewer echo outside the pinned verified candidate", async () => {
    await expect(
      runRequestReview(reviewerEcho({ verifiedHeadCommit: "f".repeat(40) })),
    ).rejects.toThrow(
      "Reviewer returned identities outside the pinned verified candidate.",
    );
    await expect(
      runRequestReview(
        reviewerEcho({ verificationResultSha256: "0".repeat(64) }),
      ),
    ).rejects.toThrow(
      "Reviewer returned identities outside the pinned verified candidate.",
    );
  });

  it("rejects reviewer output missing the identity echo", async () => {
    const missing = reviewerEcho();
    delete missing["verifiedTree"];
    await expect(runRequestReview(missing)).rejects.toThrow(
      "Invalid reviewer report",
    );
    await expect(
      runRequestReview(reviewerEcho({ schemaVersion: "1.0.0" })),
    ).rejects.toThrow("Invalid reviewer report");
  });
});
