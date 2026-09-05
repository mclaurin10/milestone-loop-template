import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CommandExecutionSummary,
  ExactVerificationIndex,
  VerificationTierCommandRecord,
} from "./contracts.js";
import {
  loadActiveVerificationManifest,
  loadConfig,
  loadInvariantSuiteRegistry,
  loadVerificationScopePolicy,
} from "./config.js";
import { createCandidateExecutionProvider } from "./execution-provider.js";
import { validateVerificationTierResult } from "./schema.js";
import {
  collectTierCandidateIdentity,
  coordinateTierOutcome,
  exactNoArgumentVerificationCommand,
  planVerificationTier,
  tierCommandRecord,
  tierIdentityDrift,
} from "./verification-tier.js";
import {
  assertVerificationManifestRegistryIdentities,
  assertVerificationManifestTargetBranch,
} from "./verification-manifest.js";
import {
  trustedTestExecutionProvider,
  trustedTestExecutionProviderIdentity,
  genericTierVerificationManifest,
  sourceV1ScopePolicyFixture,
  validConfig,
} from "../test/fixtures.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

async function genericPlanningFixture() {
  const scopePolicy = sourceV1ScopePolicyFixture(repositoryRoot);
  return {
    manifest: genericTierVerificationManifest({
      scopePolicyId: scopePolicy.value.id,
    }),
    scopePolicy,
  };
}

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
    executionProvider: trustedTestExecutionProviderIdentity(),
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
    executionProvider: trustedTestExecutionProviderIdentity(),
  };
}

describe("verification tier planning", () => {
  it("fails closed on malformed and nonexistent commissioning bases", () => {
    expect(() =>
      collectTierCandidateIdentity(repositoryRoot, "missing"),
    ).toThrow(/malformed/);
    expect(() =>
      collectTierCandidateIdentity(repositoryRoot, "f".repeat(40)),
    ).toThrow(/not an ancestor/);
  });

  it("keeps leaf UI candidates on the fast unit partition", async () => {
    const { manifest, scopePolicy } = await genericPlanningFixture();
    const plan = await planVerificationTier({
      repositoryRoot,
      tier: "candidate",
      manifest,
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
    const { manifest, scopePolicy } = await genericPlanningFixture();
    const plan = await planVerificationTier({
      repositoryRoot,
      tier: "candidate",
      manifest,
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

  it.each(["iteration", "candidate", "milestone", "periodic"] as const)(
    "constructs the %s plan from a generic manifest",
    async (tier) => {
      const { manifest, scopePolicy } = await genericPlanningFixture();
      const plan = await planVerificationTier({
        repositoryRoot,
        tier,
        manifest,
        scopePolicy: scopePolicy.value,
        scopePolicySha256: scopePolicy.sha256,
        changedPaths: ["tools/milestone-orchestrator/src/schema.ts"],
        changedPathSource: { kind: "fixture", fixtureId: `generic-${tier}` },
        candidate: {
          baseCommit: manifest.commissioning.baseCommit,
          gitCommit: "b".repeat(40),
          gitTree: "c".repeat(40),
          workingTreeDirty: false,
        },
      });
      expect(plan.actualCheckIds.length).toBeGreaterThan(0);
      if (tier === "milestone" || tier === "periodic")
        expect(plan.actualCheckIds).toContain("exact-readiness");
    },
  );

  it("constructs every source plan from the active manifest without a historical adapter", async () => {
    const [manifest, invariant, scopePolicy, config] = await Promise.all([
      loadActiveVerificationManifest(repositoryRoot),
      loadInvariantSuiteRegistry(repositoryRoot),
      loadVerificationScopePolicy(repositoryRoot),
      loadConfig(repositoryRoot),
    ]);
    assertVerificationManifestRegistryIdentities(
      manifest.value,
      invariant.value.id,
      scopePolicy.value.id,
    );
    assertVerificationManifestTargetBranch(manifest.value, config.targetBranch);
    expect(JSON.stringify(manifest.value)).not.toMatch(/d-?0?31|d-?0?32/i);
    for (const tier of [
      "iteration",
      "candidate",
      "milestone",
      "periodic",
    ] as const) {
      const plan = await planVerificationTier({
        repositoryRoot,
        tier,
        manifest: manifest.value,
        scopePolicy: scopePolicy.value,
        scopePolicySha256: scopePolicy.sha256,
        changedPaths: ["tools/milestone-orchestrator/src/commissioning.ts"],
        changedPathSource: {
          kind: "fixture",
          fixtureId: `source-active-${tier}`,
        },
        candidate: {
          baseCommit: manifest.value.commissioning.baseCommit,
          gitCommit: "b".repeat(40),
          gitTree: "c".repeat(40),
          workingTreeDirty: false,
        },
        protectedAuthorityPaths: config.protectedPaths,
      });
      expect(plan.actualCheckIds.length).toBeGreaterThan(0);
      expect(plan.actualCheckIds.includes("exact-readiness")).toBe(
        tier === "milestone" || tier === "periodic",
      );
    }
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

describe("tier focused-command classification", () => {
  const temporaryDirectories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  function tierExecution(
    overrides: Partial<CommandExecutionSummary> = {},
  ): CommandExecutionSummary {
    return {
      id: "test-invariants",
      displayCommand: "pnpm test:invariants",
      status: "FAIL",
      exitCode: 1,
      signal: null,
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1000,
      stdoutPath: "artifacts/stdout.log",
      stderrPath: "artifacts/stderr.log",
      stdoutSha256: "a".repeat(64),
      stderrSha256: "b".repeat(64),
      parser: "exit-code",
      parsedArtifactPath: null,
      message: "Command exited 1.",
      receipt: null,
      receiptAbsenceReason:
        "Receipt validation is owned by the verification caller.",
      ...overrides,
    };
  }

  async function recordFor(
    overrides: Partial<CommandExecutionSummary> = {},
  ): Promise<VerificationTierCommandRecord> {
    const runRoot = await mkdtemp(join(tmpdir(), "tier-classification-"));
    temporaryDirectories.push(runRoot);
    const execution = tierExecution({
      stdoutPath: join(runRoot, "stdout.log"),
      stderrPath: join(runRoot, "stderr.log"),
      ...overrides,
    });
    return tierCommandRecord({
      repositoryRoot: runRoot,
      tier: "candidate",
      runRoot,
      index: 0,
      command: {
        id: execution.id,
        argv: ["pnpm", "test:invariants"],
        tiers: ["candidate"],
        expectedArtifactKinds: ["orchestrator-vitest-report"],
      },
      telemetry: null,
      candidate: {
        baseCommit: "a".repeat(40),
        gitCommit: "b".repeat(40),
        gitTree: "c".repeat(40),
        workingTreeDirty: false,
        changedPaths: [],
      },
      selectedCheckIds: [execution.id],
      actualCheckIds: [execution.id],
      executionProvider: trustedTestExecutionProvider(async () => execution),
    });
  }

  it("keeps a failing focused command a product failure without a receipt", async () => {
    const record = await recordFor();
    expect(record).toMatchObject({
      status: "FAIL",
      exitCode: 1,
      failureClass: "product",
      receipt: null,
      receiptAbsenceReason:
        "The command did not pass; failing commands retain no receipt.",
      message: "Command exited 1.",
    });
    expect(
      coordinateTierOutcome({
        tier: "candidate",
        focusedCommands: [record],
        exactVerification: null,
      }),
    ).toEqual({ status: "FAIL", exitCode: 1 });
  });

  it("never passes a zero-exit focused command without a receipt", async () => {
    const record = await recordFor({
      status: "PASS",
      exitCode: 0,
      message: "passed",
    });
    expect(record).toMatchObject({
      status: "ERROR",
      failureClass: "infrastructure",
      receipt: null,
      receiptAbsenceReason:
        "Passing check test-invariants did not write its required command-owned receipt.",
    });
    expect(
      coordinateTierOutcome({
        tier: "candidate",
        focusedCommands: [record],
        exactVerification: null,
      }),
    ).toEqual({ status: "ERROR", exitCode: 3 });
  });

  it("keeps timeouts and command errors in the infrastructure lane", async () => {
    const record = await recordFor({
      status: "TIMEOUT",
      exitCode: null,
      message: "Command timed out.",
    });
    expect(record).toMatchObject({
      status: "TIMEOUT",
      failureClass: "infrastructure",
      receiptAbsenceReason:
        "The command did not pass; failing commands retain no receipt.",
    });
    expect(
      coordinateTierOutcome({
        tier: "candidate",
        focusedCommands: [record],
        exactVerification: null,
      }),
    ).toEqual({ status: "ERROR", exitCode: 3 });
  });

  it("classifies an unavailable trusted provider as infrastructure NOT_READY", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "tier-provider-unavailable-"));
    temporaryDirectories.push(runRoot);
    const provider = createCandidateExecutionProvider(validConfig(), {
      capabilityProbe: {
        implementation: () => ({ available: true, version: "1.0.0" }),
        runtime: () => ({ available: false, version: null }),
        image: () => ({ available: false }),
        policy: () => ({ compatible: true, reason: null }),
      },
    });
    const record = await tierCommandRecord({
      repositoryRoot: runRoot,
      tier: "candidate",
      runRoot,
      index: 0,
      command: {
        id: "test-invariants",
        argv: ["pnpm", "test:invariants"],
        tiers: ["candidate"],
        expectedArtifactKinds: ["orchestrator-vitest-report"],
      },
      telemetry: null,
      candidate: {
        baseCommit: "a".repeat(40),
        gitCommit: "b".repeat(40),
        gitTree: "c".repeat(40),
        workingTreeDirty: false,
        changedPaths: [],
      },
      selectedCheckIds: ["test-invariants"],
      actualCheckIds: ["test-invariants"],
      executionProvider: provider,
    });

    expect(record).toMatchObject({
      status: "NOT_READY",
      exitCode: null,
      failureClass: "infrastructure",
      executionProvider: {
        provider: "trusted-container",
        capabilityStatus: "missing-runtime",
        completionEligible: false,
      },
    });
    expect(
      coordinateTierOutcome({
        tier: "candidate",
        focusedCommands: [record],
        exactVerification: null,
      }),
    ).toEqual({ status: "ERROR", exitCode: 3 });
  });
});

describe("tier end-of-run identity", () => {
  const start = {
    gitCommit: "b".repeat(40),
    gitTree: "c".repeat(40),
    workingTreeDirty: false,
  };

  it("detects commit, tree, and cleanliness drift with exact fields", () => {
    expect(tierIdentityDrift(start, { ...start })).toEqual({
      detected: false,
      fields: [],
    });
    expect(
      tierIdentityDrift(start, { ...start, gitCommit: "f".repeat(40) }),
    ).toEqual({ detected: true, fields: ["gitCommit"] });
    expect(
      tierIdentityDrift(start, {
        gitCommit: "f".repeat(40),
        gitTree: "e".repeat(40),
        workingTreeDirty: true,
      }),
    ).toEqual({
      detected: true,
      fields: ["gitCommit", "gitTree", "workingTreeDirty"],
    });
  });

  it("requires detected drift to report ERROR exit 3 and equality otherwise", () => {
    const candidate = {
      baseCommit: "a".repeat(40),
      gitCommit: "b".repeat(40),
      gitTree: "c".repeat(40),
      workingTreeDirty: false,
    };
    const base = {
      schemaVersion: "1.2.0",
      runId: "candidate-fixture",
      tier: "candidate" as const,
      status: "PASS" as const,
      exitCode: 0 as const,
      authoritative: false,
      candidate,
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
      executionProvider: trustedTestExecutionProviderIdentity(),
      providerCompletionEligible: true,
      candidateFinal: candidate,
      identityDrift: { detected: false, fields: [] },
      reviewRequired: false,
      telemetryManifestPath: null,
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1000,
    };
    expect(validateVerificationTierResult(base).valid).toBe(true);

    const unsafeProvider = createCandidateExecutionProvider(
      validConfig({
        candidateExecution: {
          ...validConfig().candidateExecution,
          mode: "unsafe-local-diagnostic",
        },
      }),
    ).identity;
    const command = passingCommand();
    expect(
      validateVerificationTierResult({
        ...base,
        selectedCheckIds: [command.id],
        actualCheckIds: [command.id],
        fullClosureCheckIds: [command.id],
        commands: [{ ...command, executionProvider: unsafeProvider }],
      }).valid,
    ).toBe(false);

    const driftedWithoutError = {
      ...base,
      identityDrift: { detected: true, fields: ["gitCommit"] },
      candidateFinal: { ...candidate, gitCommit: "f".repeat(40) },
    };
    const driftValidation = validateVerificationTierResult(driftedWithoutError);
    expect(driftValidation.valid).toBe(false);
    expect(driftValidation.errors.join(" ")).toMatch(/ERROR exit 3/);

    const driftedError = {
      ...driftedWithoutError,
      status: "ERROR" as const,
      exitCode: 3 as const,
    };
    expect(validateVerificationTierResult(driftedError).valid).toBe(true);

    const silentDrift = {
      ...base,
      candidateFinal: { ...candidate, gitTree: "f".repeat(40) },
    };
    const silentValidation = validateVerificationTierResult(silentDrift);
    expect(silentValidation.valid).toBe(false);
    expect(silentValidation.errors.join(" ")).toMatch(
      /candidateFinal must equal candidate/,
    );
  });
});
