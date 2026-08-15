import { resolve } from "node:path";

import {
  CONFIG_SCHEMA_VERSION,
  GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
  LEGACY_MILESTONE_SCHEMA_VERSION,
  MILESTONE_SCHEMA_VERSION,
  PREVIOUS_MILESTONE_SCHEMA_VERSION,
  REQUIRED_PROTECTED_PATHS,
  VERIFICATION_MANIFEST_SCHEMA_VERSION,
  type MilestoneProposal,
  type OrchestratorConfig,
  type OrchestratorState,
  type ReconciliationRecord,
  type VerificationManifest,
} from "../src/contracts.js";
import { createInitialState } from "../src/state-store.js";
import {
  executionProviderIdentity,
  type ExecutionProviderIdentity,
} from "../src/execution-provider-identity.js";
import type {
  CandidateCommandExecutor,
  CandidateExecutionProvider,
} from "../src/execution-provider.js";

export function trustedTestExecutionProviderIdentity(): ExecutionProviderIdentity {
  return executionProviderIdentity({
    provider: "trusted-container",
    implementation: "pinned-oci-container-executor",
    runtimeName: "docker",
    runtimeVersion: "Docker test-double 1.0.0",
    imageDigest: `sha256:${"e".repeat(64)}`,
    mountPolicyVersion: "oci-mount-policy-v1",
    resourceLimitProfile: "oci-resource-limits-v1",
    networkDisposition: "denied",
    capabilityStatus: "ready",
    controlPlaneBound: true,
  });
}

export function trustedTestExecutionProvider(
  execute: CandidateCommandExecutor,
): CandidateExecutionProvider {
  const identity = trustedTestExecutionProviderIdentity();
  return {
    identity,
    capability: null,
    execute: async (command, options) => ({
      ...(await execute(command, options)),
      executionProvider: identity,
    }),
  };
}

export function validProposal(
  overrides: Partial<MilestoneProposal> = {},
): MilestoneProposal {
  return {
    schemaVersion: MILESTONE_SCHEMA_VERSION,
    id: "tooling-milestone",
    title: "Bounded tooling milestone",
    kind: "tooling",
    objective: "Add one bounded and objectively verified tooling improvement.",
    rationale: "The improvement removes a recurring automation obstacle.",
    dependencies: [],
    permittedPaths: ["tools/demo-tooling/**"],
    exclusions: ["No product feature work.", "No frozen authority changes."],
    acceptanceCriteria: [
      {
        id: "tooling-behavior",
        description: "The bounded behavior works through its public command.",
        evidence: "A focused automated test and command result pass.",
      },
    ],
    requiredTests: ["pnpm test:orchestrator"],
    verificationCommands: [
      {
        id: "orchestrator-tests",
        executable: "pnpm",
        args: ["test:orchestrator"],
        parser: "exit-code",
        expectedArtifactKinds: ["orchestrator-vitest-report"],
      },
      {
        id: "authoritative-verification",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
        expectedArtifactKinds: [],
      },
    ],
    terminalConditions: ["All commands and independent review pass."],
    estimatedFileCount: 4,
    requiresBrowserInspection: false,
    requiresHeadlessEvaluation: false,
    hiddenValidation: { requested: false },
    verticalSlice: {
      mode: "not-applicable",
      userGoal: null,
      publicActionKinds: [],
      sharedRuleOwners: [],
      standardCompositionOwner: null,
      persistenceReplayEvidence: [],
      nodeWorkerParityEvidence: [],
      inspectableConsequence: null,
      exception: null,
    },
    ...overrides,
  };
}

// A faithful historical proposal: legacy versions required expectedArtifacts
// and their commands never carried expectedArtifactKinds; 1.0.0 additionally
// predates verticalSlice.
export function legacyProposal(
  version:
    | typeof LEGACY_MILESTONE_SCHEMA_VERSION
    | typeof PREVIOUS_MILESTONE_SCHEMA_VERSION = LEGACY_MILESTONE_SCHEMA_VERSION,
  overrides: Partial<MilestoneProposal> = {},
): MilestoneProposal {
  const current = validProposal();
  const proposal: MilestoneProposal = {
    ...current,
    schemaVersion: version,
    verificationCommands: current.verificationCommands.map(
      ({ expectedArtifactKinds: _kinds, ...command }) => command,
    ),
    expectedArtifacts: ["verification-summary.json"],
    ...overrides,
  };
  if (version === LEGACY_MILESTONE_SCHEMA_VERSION) {
    const { verticalSlice, ...withoutSlice } = proposal;
    void verticalSlice;
    return withoutSlice;
  }
  return proposal;
}

export function validFeatureProposal(
  overrides: Partial<MilestoneProposal> = {},
): MilestoneProposal {
  return validProposal({
    id: "feature-milestone",
    title: "Complete one utility footprint",
    kind: "feature",
    objective:
      "Let the user complete one utility footprint through normal public actions.",
    rationale:
      "The bounded slice connects one visible decision to deterministic shared rules.",
    permittedPaths: [
      "packages/simulation/src/utility-footprint.ts",
      "packages/persistence/src/codecs.ts",
      "apps/web/src/worker/simulation.worker.ts",
      "packages/ui/src/utility-panel.tsx",
      "tests/utility-footprint.spec.ts",
    ],
    requiredTests: [
      "pnpm test:orchestrator",
      "pnpm verify:domain-planning",
      "pnpm verify:domain-browser",
      "pnpm verify:domain-simulation",
    ],
    verificationCommands: [
      {
        id: "focused-utility",
        executable: "pnpm",
        args: ["verify:domain-planning"],
        parser: "exit-code",
        expectedArtifactKinds: ["domain-planning-report"],
      },
      {
        id: "browser-utility",
        executable: "pnpm",
        args: ["verify:domain-browser"],
        parser: "exit-code",
        expectedArtifactKinds: ["domain-browser-report"],
      },
      {
        id: "node-worker-simulation",
        executable: "pnpm",
        args: ["verify:domain-simulation"],
        parser: "exit-code",
        expectedArtifactKinds: ["domain-simulation-report"],
      },
      {
        id: "authoritative-verification",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
        expectedArtifactKinds: [],
      },
      {
        id: "orchestrator-tests",
        executable: "pnpm",
        args: ["test:orchestrator"],
        parser: "exit-code",
        expectedArtifactKinds: ["orchestrator-vitest-report"],
      },
    ],
    requiresBrowserInspection: true,
    requiresHeadlessEvaluation: true,
    verticalSlice: {
      mode: "integrated",
      userGoal: "Complete one utility footprint for the operations base.",
      publicActionKinds: ["plan-utility-footprint"],
      sharedRuleOwners: ["packages/simulation/src/utility-footprint.ts"],
      standardCompositionOwner: "apps/web/src/worker/simulation.worker.ts",
      persistenceReplayEvidence: [
        "Save/load and replay converge after the public footprint action.",
      ],
      nodeWorkerParityEvidence: [
        "Node and production Worker projections remain byte-identical.",
      ],
      inspectableConsequence: {
        readModelPaths: ["model.operations.utilities.footprints"],
        browserEvidenceRequired: true,
        description:
          "The planned footprint appears in the Standard read model and rendered utility overlay.",
      },
      exception: null,
    },
    ...overrides,
  });
}

export function validConfig(
  overrides: Partial<OrchestratorConfig> = {},
): OrchestratorConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    project: {
      name: "Example Project",
      authorityFile: "PROJECT_GOAL.md",
      verticalSpine: {
        minimumCategories: 4,
        categoryPatterns: [
          "\\bcatalog(?:ue)?s?\\b",
          "\\bcheckout\\b",
          "\\bbilling\\b",
          "\\bsearch\\b",
          "\\binventory\\b",
          "\\bshipping\\b",
          "\\baccounts?\\b",
          "\\bnotifications?\\b",
        ],
      },
    },
    targetBranch: "main",
    statePath: "artifacts/orchestrator/state/state.json",
    artifactRoot: "artifacts/orchestrator/runs",
    workspaceRoot: "artifacts/orchestrator/workspaces",
    workerSandbox: "workspace-write",
    plannerSandbox: "read-only",
    reviewerSandbox: "read-only",
    approvalPolicy: "on-request",
    networkAccessEnabled: false,
    candidateExecution: {
      mode: "trusted-container",
      trustedContainer: {
        runtime: "docker",
        imageDigest: null,
        mountPolicyVersion: "oci-mount-policy-v1",
        resourceLimitProfile: "oci-resource-limits-v1",
        networkDisposition: "denied",
      },
    },
    preserveFailedWorkspaces: true,
    cleanupCompletedWorkspaces: true,
    evidenceRetention: {
      artifactRoot: "artifacts",
      keepRecentRuns: 20,
    },
    hiddenValidationEnabled: false,
    agentPolicy: {
      schemaVersion: "1.0.0",
      sdk: {
        package: "@openai/codex-sdk",
        version: "0.146.0",
        maxEffortTransport: "thread-option-runtime-compatibility",
      },
      execution: {
        maximumConcurrentAgentInvocations: 1,
        proactiveDelegation: false,
        ultraAllowed: false,
      },
      roles: {
        planner: { model: "gpt-5.6-sol", reasoningEffort: "max" },
        "feature-worker-initial": {
          model: "gpt-5.6-sol",
          reasoningEffort: "xhigh",
        },
        "feature-worker-escalated": {
          model: "gpt-5.6-sol",
          reasoningEffort: "max",
        },
        reviewer: { model: "gpt-5.6-sol", reasoningEffort: "max" },
        "lightweight-reporting": {
          model: "gpt-5.6-terra",
          reasoningEffort: "medium",
        },
      },
      workerEscalation: {
        substantiveFailureAttempts: 2,
        repeatedAcceptanceCriterionFailures: 2,
        replacementThreadOnPolicyChange: true,
      },
      overrides: [],
    },
    limits: {
      attemptsPerMilestone: 3,
      consecutiveInfrastructureFailures: 3,
      wallClockMs: 1_000_000,
      codexInvocations: 12,
      tokenBudget: 3_000_000,
      milestonesPerInvocation: 3,
      codexTurnMs: 60_000,
      commandMs: 60_000,
      hiddenValidationCooldownMs: 604_800_000,
      plannerProposalAttempts: 2,
      maximumPermittedPaths: 12,
      maximumAcceptanceCriteria: 12,
      maximumEstimatedFiles: 30,
      commandOutputLimitBytes: 67_108_864,
      commandKillGraceMs: 5_000,
    },
    protectedPaths: [
      "PROJECT_GOAL.md",
      "AGENTS.md",
      "evals/ACCEPTANCE.md",
      "evals/acceptance-manifest.json",
      "evals/HIDDEN_VALIDATION_PROTOCOL.md",
      "evals/immutable-contract-lock.json",
      ".agent/readiness-profile-activated.json",
      "scripts/verify.mjs",
      "pnpm-lock.yaml",
      "package.json",
      "tools/milestone-orchestrator/config/invariant-suite.json",
    ],
    ...overrides,
  };
}

export function validVerificationManifest(
  overrides: Partial<VerificationManifest> = {},
): VerificationManifest {
  return {
    schemaVersion: VERIFICATION_MANIFEST_SCHEMA_VERSION,
    commissioning: {
      id: "generic-fixture-commissioning",
      targetBranch: "main",
      baseCommit: "a".repeat(40),
      profile: "readiness",
      createdAt: "2026-08-15T00:00:00.000Z",
    },
    objective: "Verify one generic commissioned repository lifecycle.",
    exclusions: ["No immutable authority or readiness semantic changes."],
    focusedCommands: [
      {
        id: "test-invariants",
        argv: ["pnpm", "test:invariants"],
        tiers: ["iteration", "candidate", "milestone"],
        expectedArtifactKinds: ["invariant-suite-report"],
      },
    ],
    requiredProtectedPaths: [...REQUIRED_PROTECTED_PATHS],
    requiredInvariantSuiteId: "generic-invariants.v1",
    scopePolicyId: "generic-scope-policy.v1",
    exactVerification: {
      argv: ["pnpm", "verify"],
      requiresNoArguments: true,
      profileSource: "package-default",
      selectedByOverride: false,
    },
    reconciliationPolicy: {
      id: "generic-reconciliation.v1",
      nextProposalPath: ".agent/next-milestone.json",
      requiredReviewChecks: [...GENERIC_RECONCILIATION_REVIEW_CHECK_IDS],
    },
    ...overrides,
  };
}

export function genericTierVerificationManifest(
  overrides: Partial<VerificationManifest> = {},
): VerificationManifest {
  const candidateAndMilestone = [
    ["test-unit-fast", "test:unit:fast"],
    ["test-orchestrator", "test:orchestrator"],
    ["format-check", "format:check"],
    ["lint", "lint"],
    ["lint-architecture", "lint:architecture"],
    ["typecheck", "typecheck"],
    ["build", "build"],
  ] as const;
  const milestoneOnly = [
    ["test-unit-migrations", "test:unit:migrations"],
    ["domain-construction-standard", "verify:domain-construction-standard"],
    ["domain-resources", "verify:domain-resources"],
    ["domain-networks", "verify:domain-networks"],
    ["domain-planning", "verify:domain-planning"],
    ["domain-entitlement", "verify:domain-entitlement"],
    ["domain-entitlement-standard", "verify:domain-entitlement-standard"],
    ["domain-development", "verify:domain-development"],
    ["domain-simulation", "verify:domain-simulation"],
    ["domain-browser", "verify:domain-browser"],
  ] as const;
  return validVerificationManifest({
    focusedCommands: [
      {
        id: "test-invariants",
        argv: ["pnpm", "test:invariants"],
        tiers: ["iteration", "candidate", "milestone"],
        expectedArtifactKinds: ["invariant-suite-report"],
      },
      ...candidateAndMilestone.map(([id, script]) => ({
        id,
        argv: ["pnpm", script],
        tiers: ["candidate", "milestone"] as const,
        expectedArtifactKinds: [`${id}-report`],
      })),
      ...milestoneOnly.map(([id, script]) => ({
        id,
        argv: ["pnpm", script],
        tiers: ["milestone"] as const,
        expectedArtifactKinds: [`${id}-report`],
      })),
    ],
    ...overrides,
  });
}

export function validState(repositoryRoot: string): OrchestratorState {
  return createInitialState({
    repositoryRoot: resolve(repositoryRoot),
    targetBranch: "main",
    verifiedCommit: "a".repeat(40),
    protectedFiles: [{ path: "PROJECT_GOAL.md", sha256: "b".repeat(64) }],
    now: "2026-08-01T00:00:00.000Z",
  });
}

export function validReconciliationRecord(
  overrides: Partial<ReconciliationRecord> = {},
): ReconciliationRecord {
  const artifact = (path: string) => ({
    path,
    sha256: "b".repeat(64),
    bytes: 100,
  });
  const now = "2026-08-04T00:00:00.000Z";
  const unavailable = {
    availability: "not-recorded" as const,
    reason: "Historical direct-loop measurement was not recorded.",
  };
  return {
    schemaVersion: "1.0.0",
    id: "reconcile-fixture",
    status: "active",
    phase: "prepared",
    sourceArchiveId: "archive-fixture",
    sourceState: artifact(
      "artifacts/orchestrator/state/history/archive-fixture/state.json",
    ),
    sourceVerifiedCommit: "a".repeat(40),
    targetBranch: "main",
    candidateRevision: "HEAD",
    candidateCommit: "c".repeat(40),
    candidateTree: "d".repeat(40),
    cleanTree: true,
    commitRange: {
      ...artifact(
        "artifacts/orchestrator/reconciliation/reconcile-fixture/commit-range.json",
      ),
      commitCount: 2,
      recordsSha256: "e".repeat(64),
    },
    protectedComparison: artifact(
      "artifacts/orchestrator/reconciliation/reconcile-fixture/protected-comparison.json",
    ),
    externalGapReason: "external-direct-loop-gap",
    historicalMeasurementAvailability: {
      planner: unavailable,
      worker: unavailable,
      reviewer: unavailable,
      attempts: unavailable,
      timings: unavailable,
      tokens: unavailable,
      threadLineage: unavailable,
    },
    focusedEvidenceIndex: null,
    exactVerification: null,
    benchmark: artifact(
      "artifacts/benchmarks/benchmark-fixture/benchmark.json",
    ),
    artifactInventory: artifact(
      "artifacts/inventory/inventory-fixture/inventory.json",
    ),
    independentReview: null,
    nextProposal: {
      ...artifact(".agent/next-milestone.json"),
      id: "complete-operations-base-utilities",
    },
    adoption: null,
    previousPhase: null,
    previousPhaseAt: null,
    currentPhaseAt: now,
    phaseTimestamps: {
      prepared: now,
      verifying: null,
      "candidate-verified": null,
      reviewing: null,
      "review-approved": null,
      adopting: null,
      "state-adopted": null,
      "queueing-next": null,
      completed: null,
      failed: null,
    },
    failure: null,
    ...overrides,
  };
}
