import type { MilestoneProposal } from "./contracts.js";

export const CANARY_MILESTONE_ID = "stage1-orchestrator-doctor-canary";

export function canaryMilestone(): MilestoneProposal {
  return {
    schemaVersion: "1.1.0",
    id: CANARY_MILESTONE_ID,
    title: "Add a read-only orchestrator doctor diagnostic",
    kind: "tooling",
    objective:
      "Add a read-only loop:doctor diagnostic that reports local orchestrator prerequisites without exposing sensitive values.",
    rationale:
      "A small diagnostic is a harmless, relevant canary that exercises the real autonomous loop and improves operator recovery.",
    dependencies: [],
    permittedPaths: [
      "package.json",
      "tools/milestone-orchestrator/src/cli.ts",
      "tools/milestone-orchestrator/src/index.ts",
      "tools/milestone-orchestrator/src/doctor.ts",
      "tools/milestone-orchestrator/src/doctor.test.ts",
      "docs/orchestrator.md",
    ],
    exclusions: [
      "No product feature work or readiness-profile activation.",
      "No frozen goal, acceptance, hidden-validation, dependency, or verification-contract changes.",
      "No network calls, credential validation calls, or secret values in diagnostic output.",
    ],
    acceptanceCriteria: [
      {
        id: "doctor-command",
        description:
          "pnpm loop:doctor emits a versioned JSON diagnostic covering runtime pins, Git cleanliness, config validation, state readability, and local Codex authentication availability without printing secrets.",
        evidence:
          "A focused mocked/file-system test plus a successful command result validates the diagnostic contract.",
      },
      {
        id: "bounded-canary",
        description:
          "The committed diff stays within the approved diagnostic paths and does not begin product feature work.",
        evidence:
          "Diff policy, protected hashes, authoritative pnpm verify, and independent review all pass.",
      },
    ],
    requiredTests: [
      "pnpm test:orchestrator",
      "pnpm loop:doctor",
      "pnpm verify",
    ],
    verificationCommands: [
      {
        id: "orchestrator-tests",
        executable: "pnpm",
        args: ["test:orchestrator"],
        parser: "exit-code",
      },
      {
        id: "doctor-diagnostic",
        executable: "pnpm",
        args: ["loop:doctor"],
        parser: "exit-code",
      },
      {
        id: "authoritative-verification",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
      },
    ],
    expectedArtifacts: [
      "verification/verification-summary.json",
      "review/reviewer-report.json",
      "git-outcome.json",
      "run-summary.json",
    ],
    terminalConditions: [
      "All focused and authoritative commands pass from the exact committed isolated candidate.",
      "A separate read-only Codex reviewer approves the diff and evidence.",
      "The approved commit fast-forwards the clean target and durable state records completion.",
    ],
    estimatedFileCount: 6,
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
  };
}
