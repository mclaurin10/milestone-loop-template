import { delimiter, join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HIDDEN_FEEDBACK_CATEGORIES,
  redactSensitiveText,
  redactSensitiveValue,
  safeAgentEnvironment,
  sanitizeHiddenValidationReceipt,
} from "./redaction.js";

describe("sensitive output and hidden feedback", () => {
  it("redacts common credentials in text and structured keys", () => {
    const text = redactSensitiveText(
      "Authorization: Bearer secret-value CODEX_API_KEY=abc123 sk-proj-1234567890",
    );
    expect(text).not.toContain("secret-value");
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("sk-proj");
    expect(
      redactSensitiveValue({
        apiKey: "value",
        nested: { token: "t" },
        inputTokens: 42,
        tokenBudget: 600_000,
      }),
    ).toEqual({
      apiKey: "[REDACTED]",
      nested: { token: "[REDACTED]" },
      inputTokens: 42,
      tokenBudget: 600_000,
    });
  });

  it("passes only a safe environment allowlist to Codex", () => {
    const safe = safeAgentEnvironment({
      PATH: "C:/tools",
      USERPROFILE: "C:/Users/test",
      CODEX_API_KEY: "secret",
      GITHUB_TOKEN: "secret-two",
    });
    expect(safe).toEqual({ PATH: "C:/tools", USERPROFILE: "C:/Users/test" });
  });

  it("removes inherited dependency bins from the agent PATH", () => {
    const toolchain = join("toolchain", "bin");
    const safe = safeAgentEnvironment({
      PATH: [
        join("repository", "node_modules", ".bin"),
        toolchain,
        `${join("elsewhere", "node_modules", ".bin")}${sep}`,
      ].join(delimiter),
      CODEX_API_KEY: "must-not-be-copied",
    });
    expect(safe["PATH"]).toBe(toolchain);
    expect(safe).not.toHaveProperty("CODEX_API_KEY");
  });

  it("accepts only aggregate allowlisted hidden categories", () => {
    const categories = Object.fromEntries(
      HIDDEN_FEEDBACK_CATEGORIES.map((category) => [
        category,
        { status: "pass", failedRuns: 0 },
      ]),
    );
    expect(
      sanitizeHiddenValidationReceipt({
        protocolVersion: "1.0.0",
        hiddenSetId: "hidden.v1",
        custodyCommitmentId: "opaque",
        milestoneId: "HV-01",
        candidate: "a".repeat(40),
        eligibility: "eligible",
        runs: { attempted: 20, completed: 20 },
        seedSuccess: { successful: 20, total: 20, rate: 1, pass: true },
        catastrophicIntegrity: { affectedRuns: 0, pass: true },
        categories,
        overall: "pass",
        severity: "none",
        receiptTimestamp: "custodian-issued",
        signature: "opaque-signature",
      }),
    ).toMatchObject({ categories });
    expect(() =>
      sanitizeHiddenValidationReceipt({
        categories,
        perSeedResults: [{ seed: "forbidden" }],
      }),
    ).toThrow(/prohibited fields/);
  });
});
