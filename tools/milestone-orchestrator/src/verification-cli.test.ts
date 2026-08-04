import { describe, expect, it } from "vitest";

import { parseVerificationCliArguments } from "./verification-cli.js";

describe("verification tier CLI", () => {
  it("parses an exact candidate request without rewriting argv", () => {
    expect(
      parseVerificationCliArguments([
        "candidate",
        "--manifest",
        ".agent/completed/loop-recommissioning-verification.json",
        "--base",
        "a".repeat(40),
        "--require-clean",
      ]),
    ).toEqual({
      mode: "candidate",
      manifestPath: ".agent/completed/loop-recommissioning-verification.json",
      baseCommit: "a".repeat(40),
      requireClean: true,
      focusedCheckIds: [],
    });
  });

  it("allows explicit focused checks only for dirty iteration work", () => {
    expect(
      parseVerificationCliArguments([
        "iteration",
        "--focused",
        "domain-simulation",
      ]).focusedCheckIds,
    ).toEqual(["domain-simulation"]);
    expect(() =>
      parseVerificationCliArguments([
        "candidate",
        "--focused",
        "domain-simulation",
      ]),
    ).toThrow(/only for iteration/i);
  });

  const malformedCases: readonly { readonly args: readonly string[] }[] = [
    { args: [] },
    { args: ["candidate", "--unknown"] },
    { args: ["iteration", "--base"] },
    { args: ["fast-unit", "--require-clean"] },
  ];

  it.each(malformedCases)("rejects malformed arguments %#", ({ args }) => {
    expect(() => parseVerificationCliArguments(args)).toThrow();
  });
});
