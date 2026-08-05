import { resolve } from "node:path";

import {
  CONFIG_SCHEMA_VERSION,
  MILESTONE_SCHEMA_VERSION,
  type MilestoneProposal,
  type OrchestratorConfig,
  type OrchestratorState,
  type ReconciliationRecord,
} from "../src/contracts.js";
import { createInitialState } from "../src/state-store.js";

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
    permittedPaths: ["tools/milestone-orchestrator/**"],
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
      },
      {
        id: "authoritative-verification",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
      },
    ],
    expectedArtifacts: ["verification-summary.json"],
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
      },
      {
        id: "browser-utility",
        executable: "pnpm",
        args: ["verify:domain-browser"],
        parser: "exit-code",
      },
      {
        id: "node-worker-simulation",
        executable: "pnpm",
        args: ["verify:domain-simulation"],
        parser: "exit-code",
      },
      {
        id: "authoritative-verification",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
      },
      {
        id: "orchestrator-tests",
        executable: "pnpm",
        args: ["test:orchestrator"],
        parser: "exit-code",
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
    ],
    ...overrides,
  };
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
