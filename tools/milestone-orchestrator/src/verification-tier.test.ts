import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  ExactVerificationIndex,
  VerificationTierCommandRecord,
} from "./contracts.js";
import {
  loadVerificationManifest,
  loadVerificationScopePolicy,
} from "./config.js";
import { validateVerificationTierResult } from "./schema.js";
import {
  coordinateTierOutcome,
  exactNoArgumentVerificationCommand,
  planVerificationTier,
} from "./verification-tier.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

function passingCommand(): VerificationTierCommandRecord {
  return {
    id: "test-invariants",
    argv: ["pnpm", "test:invariants"],
    status: "PASS",
    exitCode: 0,
    signal: null,
    startedAt: "2026-08-03T00:00:00.000Z",
    finishedAt: "2026-08-03T00:00:01.000Z",
    durationMs: 1000,
    stdoutPath: "artifacts/stdout.log",
    stderrPath: "artifacts/stderr.log",
    receipt: null,
    receiptAbsenceReason: "fixture",
    artifactCount: 0,
    artifactBytes: 0,
    testCounts: null,
    failureClass: null,
    message: "passed",
  };
}

function exactNotReady(): ExactVerificationIndex {
  return {
    invokedWithNoArguments: true,
    resultPath: "artifacts/exact/result.json",
    resultSha256: "a".repeat(64),
    status: "NOT_READY",
    exitCode: 2,
    disposition: "incremental-readiness",
    profileId: "readiness",
    selectedByOverride: false,
    candidateCommit: "b".repeat(40),
    candidateTree: "c".repeat(40),
  };
}

describe("verification tier planning", () => {
  it("keeps leaf UI candidates on the fast unit partition", async () => {
    const [manifest, scopePolicy] = await Promise.all([
      loadVerificationManifest(repositoryRoot),
      loadVerificationScopePolicy(repositoryRoot),
    ]);
    const plan = await planVerificationTier({
      repositoryRoot,
      tier: "candidate",
      manifest: manifest.value,
      scopePolicy: scopePolicy.value,
      scopePolicySha256: scopePolicy.sha256,
      changedPaths: ["packages/ui/src/index.tsx"],
      changedPathSource: { kind: "fixture", fixtureId: "leaf-ui" },
      candidate: {
        baseCommit: "a".repeat(40),
        gitCommit: "b".repeat(40),
        gitTree: "c".repeat(40),
        workingTreeDirty: false,
      },
    });

    expect(plan.actualCheckIds).toContain("test-unit-fast");
    expect(plan.actualCheckIds).not.toContain("test-unit");
    expect(plan.actualCheckIds).toContain("build");
  });

  it.each([
    "packages/protocol/src/authorization.ts",
    "packages/persistence/src/index.ts",
    "unclassified/new-boundary.bin",
  ])("fails broad for high-risk candidate path %s", async (path) => {
    const [manifest, scopePolicy] = await Promise.all([
      loadVerificationManifest(repositoryRoot),
      loadVerificationScopePolicy(repositoryRoot),
    ]);
    const plan = await planVerificationTier({
      repositoryRoot,
      tier: "candidate",
      manifest: manifest.value,
      scopePolicy: scopePolicy.value,
      scopePolicySha256: scopePolicy.sha256,
      changedPaths: [path],
      changedPathSource: { kind: "fixture", fixtureId: "broad-path" },
      candidate: {
        baseCommit: "a".repeat(40),
        gitCommit: "b".repeat(40),
        gitTree: "c".repeat(40),
        workingTreeDirty: false,
      },
    });

    expect(plan.actualCheckIds).toContain("test-unit");
    expect(plan.actualCheckIds).not.toContain("test-unit-fast");
    expect(plan.actualCheckIds).not.toContain("test-unit-migrations");
  });

  it("uses only literal no-argument pnpm verify for exact closure", () => {
    expect(exactNoArgumentVerificationCommand()).toEqual({
      id: "exact-readiness",
      executable: "pnpm",
      args: ["verify"],
      parser: "pnpm-verify",
    });
  });
});

describe("non-authoritative tier outcomes", () => {
  it("preserves exact readiness NOT_READY as milestone exit 2", () => {
    expect(
      coordinateTierOutcome({
        tier: "milestone",
        focusedCommands: [passingCommand()],
        exactVerification: exactNotReady(),
      }),
    ).toEqual({ status: "NOT_READY", exitCode: 2 });
  });

  it("never allows candidate checks to manufacture NOT_READY or authority", () => {
    expect(
      coordinateTierOutcome({
        tier: "candidate",
        focusedCommands: [passingCommand()],
        exactVerification: null,
      }),
    ).toEqual({ status: "PASS", exitCode: 0 });

    const validation = validateVerificationTierResult({
      schemaVersion: "1.0.0",
      runId: "candidate-fixture",
      tier: "candidate",
      status: "PASS",
      exitCode: 0,
      authoritative: true,
      candidate: {
        baseCommit: "a".repeat(40),
        gitCommit: "b".repeat(40),
        gitTree: "c".repeat(40),
        workingTreeDirty: false,
      },
      changedPaths: [],
      invariantSuiteId: "fixture",
      invariantSuiteSha256: "d".repeat(64),
      scopePolicySha256: "e".repeat(64),
      shadowSelectionPath: null,
      selectedCheckIds: [],
      actualCheckIds: [],
      fullClosureCheckIds: [],
      commands: [],
      exactVerification: null,
      reviewRequired: false,
      telemetryManifestPath: null,
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1000,
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/authority/i);
  });

  it("classifies malformed exact evidence as infrastructure exit 3", () => {
    expect(
      coordinateTierOutcome({
        tier: "periodic",
        focusedCommands: [],
        exactVerification: null,
        exactFailureClass: "infrastructure",
      }),
    ).toEqual({ status: "ERROR", exitCode: 3 });
  });
});
