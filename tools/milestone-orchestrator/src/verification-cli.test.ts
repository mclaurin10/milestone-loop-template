import { describe, expect, it } from "vitest";

import { parseVerificationCliArguments } from "./verification-cli.js";

describe("verification tier CLI", () => {
  it("parses an exact candidate request without rewriting argv", () => {
    expect(
      parseVerificationCliArguments([
        "candidate",
        "--manifest",
        ".agent/verification-manifest.json",
        "--base",
        "a".repeat(40),
        "--require-clean",
      ]),
    ).toEqual({
      mode: "candidate",
      manifestPath: ".agent/verification-manifest.json",
      baseCommit: "a".repeat(40),
      requireClean: true,
      focusedCheckIds: [],
    });
  });

  it("requires an explicit source-reconciliation context for the historical manifest", () => {
    expect(
      parseVerificationCliArguments([
        "milestone",
        "--manifest",
        ".agent/completed/loop-recommissioning-verification.json",
        "--historical-source-reconciliation",
      ]),
    ).toEqual({
      mode: "milestone",
      manifestPath: ".agent/completed/loop-recommissioning-verification.json",
      requireClean: false,
      focusedCheckIds: [],
      historicalManifestContext: "source-reconciliation",
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
    { args: ["candidate", "--historical-source-reconciliation"] },
    {
      args: ["milestone", "--historical-source-reconciliation"],
    },
  ];

  it.each(malformedCases)("rejects malformed arguments %#", ({ args }) => {
    expect(() => parseVerificationCliArguments(args)).toThrow();
  });
});
