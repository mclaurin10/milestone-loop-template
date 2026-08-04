import { describe, expect, it } from "vitest";

import { reviewerApproves } from "./reviewer.js";
import type { ReviewerReport } from "./contracts.js";

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
