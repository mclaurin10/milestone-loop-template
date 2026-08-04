import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateMilestoneProposal,
  validateOrchestratorConfig,
  validateOrchestratorState,
  validateReconciliationReview,
  validateReviewerReport,
} from "./schema.js";
import { RECONCILIATION_REVIEW_CHECK_IDS } from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  validConfig,
  validProposal,
  validReconciliationRecord,
  validState,
} from "../test/fixtures.js";

describe("versioned orchestrator schemas", () => {
  it("accepts a complete bounded milestone and rejects missing objective evidence", () => {
    expect(validateMilestoneProposal(validProposal())).toMatchObject({
      valid: true,
      errors: [],
    });
    const invalid = {
      ...validProposal(),
      acceptanceCriteria: [
        { id: "missing-evidence", description: "No evidence field." },
      ],
    };
    expect(validateMilestoneProposal(invalid)).toMatchObject({ valid: false });
    const historical = {
      ...validProposal(),
      schemaVersion: "1.0.0",
    } as Record<string, unknown>;
    delete historical["verticalSlice"];
    expect(validateMilestoneProposal(historical)).toMatchObject({
      valid: false,
    });
    expect(
      validateMilestoneProposal(historical, { allowLegacy: true }),
    ).toMatchObject({ valid: true });
  });

  it("rejects unsafe sandbox and approval configuration", () => {
    expect(validateOrchestratorConfig(validConfig())).toMatchObject({
      valid: true,
    });
    expect(
      validateOrchestratorConfig({
        ...validConfig(),
        workerSandbox: "danger-full-access",
        approvalPolicy: "never",
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateOrchestratorConfig({
        ...validConfig(),
        evidenceRetention: {
          artifactRoot: ".",
          keepRecentRuns: 20,
        },
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateOrchestratorConfig({
        ...validConfig(),
        protectedPaths: ["PROJECT_GOAL.md"],
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateOrchestratorConfig({
        ...validConfig(),
        workspaceRoot: "../outside",
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateOrchestratorConfig({
        ...validConfig(),
        evidenceRetention: {
          artifactRoot: "../outside",
          keepRecentRuns: -1,
        },
      }),
    ).toMatchObject({ valid: false });
    const config = validConfig();
    expect(
      validateOrchestratorConfig({
        ...config,
        agentPolicy: {
          ...config.agentPolicy,
          overrides: [
            {
              role: "planner",
              model: "gpt-5.6-sol",
              reasoningEffort: "ultra",
              reason: "Ultra must remain forbidden.",
            },
          ],
        },
      }),
    ).toMatchObject({ valid: false });
  });

  it("validates state topology and reviewer decisions", () => {
    expect(validateOrchestratorState(validState(process.cwd()))).toMatchObject({
      valid: true,
    });
    expect(
      validateReviewerReport({
        schemaVersion: "1.0.0",
        decision: "approve",
        summary: "The bounded diff and evidence pass review.",
        findings: [],
        checks: {
          acceptanceEvidence: true,
          architectureCompliance: true,
          testQuality: true,
          noSuspiciousShortcuts: true,
          noScopeReduction: true,
          regressionsHandled: true,
        },
      }),
    ).toMatchObject({ valid: true });
    expect(
      validateOrchestratorState({
        ...validState(process.cwd()),
        unexpected: true,
      }),
    ).toMatchObject({ valid: false });

    const reconciliationRecord = validReconciliationRecord();
    const reconciliationState = validState(process.cwd());
    const withActiveReconciliation = {
      ...reconciliationState,
      controllerHistory: [
        {
          schemaVersion: "1.0.0",
          id: reconciliationRecord.sourceArchiveId,
          rawSourceState: reconciliationRecord.sourceState,
          sourceStateSchemaVersion: "1.2.0",
          sourceRevision: 4,
          priorVerifiedCommit: reconciliationState.repository.verifiedCommit,
          priorRun: reconciliationState.run,
          priorQueue: reconciliationState.queue,
          priorActiveMilestoneId: reconciliationState.activeMilestoneId,
          priorNextAllowedAction: reconciliationState.nextAllowedAction,
          archivedAt: "2026-08-04T00:00:00.000Z",
          reason: "external-integration-reconciliation",
        },
      ],
      reconciliation: { active: reconciliationRecord, history: [] },
      nextAllowedAction: "reconcile",
    };
    expect(validateOrchestratorState(withActiveReconciliation)).toMatchObject({
      valid: true,
    });
    expect(
      validateOrchestratorState({
        ...withActiveReconciliation,
        reconciliation: {
          active: {
            ...reconciliationRecord,
            nextProposal: {
              ...reconciliationRecord.nextProposal,
              path: "../outside.json",
            },
          },
          history: [],
        },
      }),
    ).toMatchObject({ valid: false });

    const checks = Object.fromEntries(
      RECONCILIATION_REVIEW_CHECK_IDS.map((check) => [check, true]),
    );
    const reconciliationReview = {
      schemaVersion: "1.0.0",
      reconciliationId: reconciliationRecord.id,
      sourceVerifiedCommit: reconciliationRecord.sourceVerifiedCommit,
      candidateCommit: reconciliationRecord.candidateCommit,
      candidateTree: reconciliationRecord.candidateTree,
      commitRangeManifestSha256: reconciliationRecord.commitRange.sha256,
      decision: "approve",
      summary: "Every exact reconciliation check passes.",
      findings: [],
      checks,
      threadId: "fresh-review-thread",
      reviewedAt: "2026-08-04T00:00:00.000Z",
    };
    expect(validateReconciliationReview(reconciliationReview)).toMatchObject({
      valid: true,
    });
    const missingCheck = structuredClone(reconciliationReview);
    delete (missingCheck.checks as Record<string, boolean>)[
      "stateMigrationAndRecovery"
    ];
    expect(validateReconciliationReview(missingCheck)).toMatchObject({
      valid: false,
    });
    expect(
      validateReviewerReport({
        schemaVersion: "1.0.0",
        decision: "approve",
        summary: "Unexpected fields must fail closed.",
        findings: [],
        checks: {
          acceptanceEvidence: true,
          architectureCompliance: true,
          testQuality: true,
          noSuspiciousShortcuts: true,
          noScopeReduction: true,
          regressionsHandled: true,
        },
        unexpected: true,
      }),
    ).toMatchObject({ valid: false });

    const state = validState(process.cwd());
    const milestone = createMilestoneRecord(
      validProposal(),
      "2026-08-02T00:00:00.000Z",
    );
    expect(
      validateOrchestratorState({
        ...state,
        milestones: [milestone],
        requiredNextVerticalConsumer: {
          sourceMilestoneId: milestone.proposal.id,
          consumerMilestoneId: "required-integrated-consumer",
          consumerContractSha256: "a".repeat(64),
        },
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateOrchestratorState({
        ...state,
        milestones: [
          {
            ...milestone,
            attempts: 2,
            workerThreadId: "replacement-thread",
            workerThreadLineage: [
              {
                threadId: "initial-thread",
                role: "feature-worker-initial",
                model: "gpt-5.6-sol",
                reasoningEffort: "xhigh",
                startedAt: "2026-08-02T00:00:01.000Z",
                attempt: 1,
                replacesThreadId: null,
                replacementReason: null,
              },
              {
                threadId: "replacement-thread",
                role: "feature-worker-escalated",
                model: "gpt-5.6-sol",
                reasoningEffort: "max",
                startedAt: "2026-08-02T00:00:02.000Z",
                attempt: 2,
                replacesThreadId: "wrong-thread",
                replacementReason: "Invalid lineage fixture.",
              },
            ],
            workerPolicy: {
              activeRole: "feature-worker-escalated",
              escalated: true,
              escalationReason: "Invalid lineage fixture.",
              escalatedAt: "2026-08-02T00:00:02.000Z",
              failures: [],
            },
          },
        ],
        activeMilestoneId: milestone.proposal.id,
      }),
    ).toMatchObject({ valid: false });
  });

  it("ships parseable versioned JSON Schema artifacts", async () => {
    for (const file of [
      "milestone.schema.json",
      "model-policy.schema.json",
      "state.schema.json",
      "review.schema.json",
      "manual-evidence-manifest.schema.json",
      "artifact-inventory.schema.json",
      "reconciliation.schema.json",
      "reconciliation-review.schema.json",
    ]) {
      const schema = JSON.parse(
        await readFile(
          resolve(
            process.cwd(),
            "tools",
            "milestone-orchestrator",
            "schemas",
            file,
          ),
          "utf8",
        ),
      ) as { $id?: string; $schema?: string };
      expect(schema.$schema).toContain("2020-12");
      expect(schema.$id).toContain(
        file === "state.schema.json"
          ? "1.3.0"
          : file === "milestone.schema.json"
            ? "1.1.0"
            : "1.0.0",
      );
    }
  });
});
