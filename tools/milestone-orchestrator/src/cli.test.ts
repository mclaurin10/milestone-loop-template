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
