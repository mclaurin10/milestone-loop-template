import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { RECONCILIATION_REVIEW_CHECK_IDS } from "./contracts.js";
import type { CodexGateway } from "./codex-gateway.js";
import {
  reconciliationReviewApproves,
  requestReconciliationReview,
} from "./reconciliation-reviewer.js";
import { validConfig, validReconciliationRecord } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function reviewDraft(overrides: Record<string, unknown> = {}) {
  const record = validReconciliationRecord();
  return {
    schemaVersion: "1.0.0",
    reconciliationId: record.id,
    sourceVerifiedCommit: record.sourceVerifiedCommit,
    candidateCommit: record.candidateCommit,
    candidateTree: record.candidateTree,
    commitRangeManifestSha256: record.commitRange.sha256,
    decision: "approve",
    summary: "The exact range and every required reconciliation check pass.",
    findings: [],
    checks: Object.fromEntries(
      RECONCILIATION_REVIEW_CHECK_IDS.map((check) => [check, true]),
    ),
    ...overrides,
  };
}

function gateway(finalResponse: unknown): CodexGateway {
  return {
    run: vi.fn(async () => ({
      threadId: "fresh-review-thread",
      finalResponse: JSON.stringify(finalResponse),
      usage: null,
      itemCount: 1,
    })),
  } as unknown as CodexGateway;
}

describe("independent reconciliation review", () => {
  it("pins a fresh read-only review to the exact range and persists approval", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-reconcile-review-"),
    );
    temporaryDirectories.push(directory);
    const record = validReconciliationRecord();

    const report = await requestReconciliationReview({
      gateway: gateway(reviewDraft()),
      project: validConfig().project,
      record,
      workspacePath: process.cwd(),
      artifactDirectory: directory,
      timeoutMs: 60_000,
      d031BaseCommit: "1".repeat(40),
      d031CandidateCommit: "2".repeat(40),
      now: () => "2026-08-04T00:00:01.000Z",
    });

    expect(reconciliationReviewApproves(report)).toBe(true);
    expect(report).toMatchObject({
      reconciliationId: record.id,
      threadId: "fresh-review-thread",
      reviewedAt: "2026-08-04T00:00:01.000Z",
    });
    expect(
      JSON.parse(
        await readFile(join(directory, "reviewer-report.json"), "utf8"),
      ),
    ).toEqual(report);
  });

  it("rejects reviewer identity drift and any false required check", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-reconcile-review-"),
    );
    temporaryDirectories.push(directory);
    const record = validReconciliationRecord();
    await expect(
      requestReconciliationReview({
        gateway: gateway(reviewDraft({ candidateCommit: "f".repeat(40) })),
        project: validConfig().project,
        record,
        workspacePath: process.cwd(),
        artifactDirectory: directory,
        timeoutMs: 60_000,
        d031BaseCommit: "1".repeat(40),
        d031CandidateCommit: "2".repeat(40),
      }),
    ).rejects.toThrow(/identities outside the pinned range/);

    const rejected = {
      ...reviewDraft(),
      checks: {
        ...(reviewDraft().checks as Record<string, boolean>),
        stateMigrationAndRecovery: false,
      },
    };
    const report = {
      ...rejected,
      threadId: "fresh-review-thread",
      reviewedAt: "2026-08-04T00:00:01.000Z",
    } as unknown as Parameters<typeof reconciliationReviewApproves>[0];
    expect(reconciliationReviewApproves(report)).toBe(false);
  });
});
