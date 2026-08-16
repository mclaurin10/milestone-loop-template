import { describe, expect, it } from "vitest";

import { assertCommandArguments, parseArguments } from "./cli.js";

describe("loop CLI reconciliation arguments", () => {
  it("parses the exact reconciliation invocation", () => {
    const parsed = parseArguments([
      "reconcile",
      "--",
      "--candidate",
      "HEAD",
      "--next-proposal",
      ".agent/next-milestone.json",
      "--reason",
      "external-direct-loop-gap",
      "--json",
    ]);

    expect(() => assertCommandArguments(parsed)).not.toThrow();
    expect(parsed).toMatchObject({
      command: "reconcile",
      candidate: "HEAD",
      nextProposalPath: ".agent/next-milestone.json",
      reason: "external-direct-loop-gap",
      json: true,
    });
  });

  it("requires the complete pinned range arguments", () => {
    expect(() =>
      assertCommandArguments(
        parseArguments(["reconcile", "--candidate", "HEAD"]),
      ),
    ).toThrow(/requires --candidate, --next-proposal, and --reason/);
  });

  it("rejects reconciliation range arguments on ordinary commands", () => {
    expect(() =>
      assertCommandArguments(parseArguments(["resume", "--candidate", "HEAD"])),
    ).toThrow(/does not accept --candidate/);
    expect(() =>
      assertCommandArguments(
        parseArguments(["reconcile-status", "--reason", "mutation"]),
      ),
    ).toThrow(/does not accept --candidate/);
  });

  it("rejects unknown commands before any repository operation", () => {
    expect(() =>
      assertCommandArguments(parseArguments(["reconciliate"])),
    ).toThrow(/Unknown loop command reconciliate/);
  });
});

describe("loop CLI retention arguments", () => {
  const sha = "a".repeat(64);

  it("parses the exact retention-apply invocation", () => {
    const parsed = parseArguments([
      "retention-apply",
      "--",
      "--plan",
      "artifacts/orchestrator/retention/plans/x/plan.json",
      "--sha256",
      sha,
    ]);
    expect(() => assertCommandArguments(parsed)).not.toThrow();
    expect(parsed).toMatchObject({
      command: "retention-apply",
      plan: "artifacts/orchestrator/retention/plans/x/plan.json",
      sha256: sha,
    });
  });

  it("accepts a bare retention-plan invocation", () => {
    expect(() =>
      assertCommandArguments(parseArguments(["retention-plan"])),
    ).not.toThrow();
  });

  it("requires both the plan path and the approval hash", () => {
    expect(() =>
      assertCommandArguments(
        parseArguments(["retention-apply", "--plan", "plan.json"]),
      ),
    ).toThrow(/requires --plan and --sha256/);
    expect(() =>
      assertCommandArguments(
        parseArguments([
          "retention-apply",
          "--plan",
          "plan.json",
          "--sha256",
          "not-a-hash",
        ]),
      ),
    ).toThrow(/64-character hex digest/);
  });

  it("rejects retention flags on ordinary commands", () => {
    expect(() =>
      assertCommandArguments(
        parseArguments(["retention-plan", "--sha256", sha]),
      ),
    ).toThrow(/does not accept --plan or --sha256/);
    expect(() =>
      assertCommandArguments(parseArguments(["run", "--plan", "plan.json"])),
    ).toThrow(/does not accept --plan or --sha256/);
  });
});

describe("loop CLI strict Doctor arguments", () => {
  it("accepts strict mode only for Doctor", () => {
    const doctor = parseArguments(["doctor", "--", "--strict", "--json"]);
    expect(() => assertCommandArguments(doctor)).not.toThrow();
    expect(doctor).toMatchObject({
      command: "doctor",
      strict: true,
      json: true,
    });

    expect(() =>
      assertCommandArguments(parseArguments(["status", "--strict"])),
    ).toThrow(/status does not accept --strict/);
  });
});
