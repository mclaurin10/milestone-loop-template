export const LEGACY_MILESTONE_SCHEMA_VERSION = "1.0.0" as const;
export const MILESTONE_SCHEMA_VERSION = "1.1.0" as const;
export const STATE_SCHEMA_VERSION = "1.3.0" as const;
export const CONFIG_SCHEMA_VERSION = "1.3.0" as const;
export const REVIEW_SCHEMA_VERSION = "1.0.0" as const;
export const RECONCILIATION_SCHEMA_VERSION = "1.0.0" as const;
export const RECONCILIATION_REVIEW_SCHEMA_VERSION = "1.0.0" as const;
export const CONTROLLER_ARCHIVE_SCHEMA_VERSION = "1.0.0" as const;
export const AGENT_POLICY_SCHEMA_VERSION = "1.0.0" as const;
export const AGENT_INVOCATION_SCHEMA_VERSION = "1.0.0" as const;
export const WORKSPACE_CLEANUP_SCHEMA_VERSION = "1.0.0" as const;
export const EVIDENCE_RETENTION_SCHEMA_VERSION = "1.0.0" as const;
export const VERIFICATION_TIER_SCHEMA_VERSION = "1.0.0" as const;
export const VERIFICATION_MANIFEST_SCHEMA_VERSION =
  "verification-manifest.v1" as const;

export const AGENT_ROLES = [
  "planner",
  "feature-worker-initial",
  "feature-worker-escalated",
  "reviewer",
  "lightweight-reporting",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra"] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export const AGENT_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type AgentReasoningEffort = (typeof AGENT_REASONING_EFFORTS)[number];

export interface AgentAssignment {
  readonly model: AgentModel;
  readonly reasoningEffort: AgentReasoningEffort;
}

export interface AgentPolicyOverride extends AgentAssignment {
  readonly role: AgentRole;
  readonly reason: string;
}

export interface AgentModelPolicy {
  readonly schemaVersion: typeof AGENT_POLICY_SCHEMA_VERSION;
  readonly sdk: {
    readonly package: "@openai/codex-sdk";
    readonly version: "0.146.0";
    readonly maxEffortTransport: "thread-option-runtime-compatibility";
  };
  readonly execution: {
    readonly maximumConcurrentAgentInvocations: 1;
    readonly proactiveDelegation: false;
    readonly ultraAllowed: false;
  };
  readonly roles: {
    readonly planner: AgentAssignment;
    readonly "feature-worker-initial": AgentAssignment;
    readonly "feature-worker-escalated": AgentAssignment;
    readonly reviewer: AgentAssignment;
    readonly "lightweight-reporting": AgentAssignment;
  };
  readonly workerEscalation: {
    readonly substantiveFailureAttempts: 2;
    readonly repeatedAcceptanceCriterionFailures: 2;
    readonly replacementThreadOnPolicyChange: true;
  };
  readonly overrides: readonly AgentPolicyOverride[];
}

export interface AgentInvocationRecord {
  readonly schemaVersion: typeof AGENT_INVOCATION_SCHEMA_VERSION;
  readonly id: string;
  readonly role: AgentRole;
  readonly requestedModel: AgentModel;
  readonly requestedReasoningEffort: AgentReasoningEffort;
  readonly resolvedModel: string | null;
  readonly resolvedReasoningEffort: string | null;
  readonly resolutionEvidence: "sdk-events-do-not-expose-resolved-model-or-effort";
  readonly threadId: string | null;
  readonly attempt: number;
  readonly escalated: boolean;
  readonly escalationReason: string | null;
  readonly overrideApplied: boolean;
  readonly overrideReason: string | null;
  readonly status: "starting" | "completed" | "failed";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly error: string | null;
}

export const BOOTSTRAP_VERIFICATION_STAGE_IDS = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "bootstrap-tests",
  "bootstrap-simulation",
  "bootstrap-persistence",
  "bootstrap-browser",
  "contract-integrity",
] as const;

export const READINESS_VERIFICATION_STAGE_IDS = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "unit-domain",
  "determinism-replay",
  "save-load",
  "headless-scenarios",
  "bot-playtesting",
  "browser-interaction",
  "playwright-evidence",
  "browser-diagnostics",
  "performance",
  "acceptance-manifest",
  "contract-integrity",
] as const;

export const REQUIRED_PROTECTED_PATHS = [
  "evals/ACCEPTANCE.md",
  "evals/acceptance-manifest.json",
  "evals/HIDDEN_VALIDATION_PROTOCOL.md",
  "evals/immutable-contract-lock.json",
] as const;

export const MILESTONE_STATUSES = [
  "proposed",
  "ready",
  "running",
  "verifying",
  "reviewing",
  "retrying",
  "completed",
  "blocked",
  "escalated",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const NEXT_ACTIONS = [
  "plan",
  "start-milestone",
  "resume-worker",
  "verify",
  "review",
  "integrate",
  "retry",
  "reconcile",
  "stop",
] as const;
export type NextAllowedAction = (typeof NEXT_ACTIONS)[number];

export type MilestoneKind =
  "tooling" | "verification" | "lifecycle" | "feature" | "documentation";

export interface AcceptanceCriterion {
  readonly id: string;
  readonly description: string;
  readonly evidence: string;
}

export type VerificationParser = "exit-code" | "pnpm-verify";

export interface VerificationCommand {
  readonly id: string;
  readonly executable: "pnpm" | "node" | "git";
  readonly args: readonly string[];
  readonly parser: VerificationParser;
  readonly timeoutMs?: number;
}

export const VERIFICATION_TIERS = [
  "iteration",
  "candidate",
  "milestone",
  "periodic",
] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

export interface FocusedVerificationCommand {
  readonly id: string;
  readonly argv: readonly string[];
  readonly tiers: readonly Exclude<VerificationTier, "periodic">[];
  readonly expectedArtifactKinds: readonly string[];
}

export interface VerificationManifest {
  readonly schemaVersion: typeof VERIFICATION_MANIFEST_SCHEMA_VERSION;
  readonly milestoneId: "d032-loop-efficiency-recommissioning";
  readonly objective: string;
  readonly exclusions: readonly string[];
  readonly baseCommit: string;
  readonly d031BaselineCommit: string;
  readonly focusedCommands: readonly FocusedVerificationCommand[];
  readonly requiredProtectedPaths: readonly string[];
  readonly requiredInvariantSuiteId: string;
  readonly requiredBenchmarkMatrixId: string;
  readonly requiredReconciliationReviewChecks: readonly string[];
  readonly expectedArtifactKinds: readonly string[];
  readonly authorityChanges: {
    readonly readinessStagesChanged: false;
    readonly acceptanceChanged: false;
    readonly defaultProfileChanged: false;
    readonly exactVerifyCommandChanged: false;
  };
  readonly nextProposalPath: ".agent/next-milestone.json";
  readonly finalExactVerification: {
    readonly argv: readonly ["pnpm", "verify"];
    readonly requiresNoArguments: true;
    readonly profileId: "readiness";
    readonly selectedByOverride: false;
  };
}

export interface InvariantSuiteEntry {
  readonly id: string;
  readonly ownerPaths: readonly string[];
  readonly triggerPaths: readonly string[];
  readonly testFile?: string;
  readonly testTitle?: string;
  readonly argv: readonly string[];
  readonly expectedArtifactKinds: readonly string[];
}

export interface InvariantSuiteRegistry {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly warmRuntimeTargetMs: number;
  readonly serial: true;
  readonly entries: readonly InvariantSuiteEntry[];
}

export interface SlowSuiteRegistry {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly files: readonly string[];
}

export const SCOPE_TRIGGER_CLASSES = [
  "protected-authority",
  "canonical-encoding",
  "shared-protocol",
  "persistence-codec",
  "migration",
  "accepted-fixture",
  "standard-state",
  "composition-root",
  "worker-message",
  "package-graph",
  "browser-host",
  "ui-renderer",
  "domain-local-simulation",
  "orchestrator-evidence",
  "documentation-only",
  "unknown",
] as const;
export type ScopeTriggerClass = (typeof SCOPE_TRIGGER_CLASSES)[number];

export interface VerificationScopePolicy {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly mode: "shadow-only";
  readonly unknownDisposition: "fail-broad";
  readonly closureSuppressionAllowed: false;
  readonly browserHostScriptPatterns: readonly string[];
  readonly triggerClasses: readonly ScopeTriggerClass[];
  readonly broadTriggerClasses: readonly ScopeTriggerClass[];
  readonly mandatoryChecks: Readonly<
    Record<ScopeTriggerClass, readonly string[]>
  >;
  readonly workspaceChecks: Readonly<Record<string, readonly string[]>>;
  readonly graduation: {
    readonly deferred: true;
    readonly minimumComparisons: number;
    readonly minimumExamplesPerTrigger: number;
    readonly requiresZeroFalseNegatives: true;
    readonly requiresZeroUnknowns: true;
    readonly requiresDeterministicRecommendations: true;
    readonly requiresMeasuredSavingsAboveNoise: true;
    readonly requiresNoClosureRegression: true;
    readonly requiresIndependentReview: true;
    readonly requiresExplicitPolicyChange: true;
  };
}

export interface UnitTestPartition {
  readonly registryId: string;
  readonly discoveredFiles: readonly string[];
  readonly fastFiles: readonly string[];
  readonly migrationFiles: readonly string[];
}

export interface VerificationReceiptReference {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface VerificationTestCounts {
  readonly suites: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly tests: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
}

export interface VerificationTierCommandRecord {
  readonly id: string;
  readonly argv: readonly string[];
  readonly status: "PASS" | "NOT_READY" | "FAIL" | "ERROR" | "TIMEOUT";
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly receipt: VerificationReceiptReference | null;
  readonly receiptAbsenceReason: string | null;
  readonly artifactCount: number;
  readonly artifactBytes: number;
  readonly testCounts: VerificationTestCounts | null;
  readonly failureClass: "product" | "infrastructure" | null;
  readonly message: string;
}

export interface ExactVerificationIndex {
  readonly invokedWithNoArguments: true;
  readonly resultPath: string;
  readonly resultSha256: string;
  readonly status: "PASS" | "NOT_READY";
  readonly exitCode: 0 | 2;
  readonly disposition: AuthoritativeVerificationDisposition;
  readonly profileId: "readiness";
  readonly selectedByOverride: false;
  readonly candidateCommit: string;
  readonly candidateTree: string;
}

export interface VerificationTierResult {
  readonly schemaVersion: typeof VERIFICATION_TIER_SCHEMA_VERSION;
  readonly runId: string;
  readonly tier: VerificationTier;
  readonly status: "PASS" | "NOT_READY" | "FAIL" | "ERROR";
  readonly exitCode: 0 | 1 | 2 | 3;
  readonly authoritative: false;
  readonly candidate: {
    readonly baseCommit: string;
    readonly gitCommit: string;
    readonly gitTree: string;
    readonly workingTreeDirty: boolean;
  };
  readonly changedPaths: readonly string[];
  readonly invariantSuiteId: string;
  readonly invariantSuiteSha256: string;
  readonly scopePolicySha256: string;
  readonly shadowSelectionPath: string | null;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
  readonly fullClosureCheckIds: readonly string[];
  readonly commands: readonly VerificationTierCommandRecord[];
  readonly exactVerification: ExactVerificationIndex | null;
  readonly reviewRequired: boolean;
  readonly telemetryManifestPath: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

export interface HiddenValidationRequest {
  readonly requested: boolean;
  readonly checkpointId?: string;
}

export type VerticalSliceMode = "not-applicable" | "integrated" | "exception";
export type VerticalSliceExceptionKind =
  "kernel-only" | "fixture-only" | "migration-only" | "preview-only";

export interface VerticalSliceContract {
  readonly mode: VerticalSliceMode;
  readonly userGoal: string | null;
  readonly publicActionKinds: readonly string[];
  readonly sharedRuleOwners: readonly string[];
  readonly standardCompositionOwner: string | null;
  readonly persistenceReplayEvidence: readonly string[];
  readonly nodeWorkerParityEvidence: readonly string[];
  readonly inspectableConsequence: {
    readonly readModelPaths: readonly string[];
    readonly browserEvidenceRequired: boolean;
    readonly description: string;
  } | null;
  readonly exception: {
    readonly kind: VerticalSliceExceptionKind;
    readonly justification: string;
    readonly immediateConsumerMilestoneId: string;
    readonly consumerContract: string;
  } | null;
}

export interface MilestoneProposal {
  readonly schemaVersion:
    typeof LEGACY_MILESTONE_SCHEMA_VERSION | typeof MILESTONE_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly kind: MilestoneKind;
  readonly objective: string;
  readonly rationale: string;
  readonly dependencies: readonly string[];
  readonly permittedPaths: readonly string[];
  readonly exclusions: readonly string[];
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly requiredTests: readonly string[];
  readonly verificationCommands: readonly VerificationCommand[];
  readonly expectedArtifacts: readonly string[];
  readonly terminalConditions: readonly string[];
  readonly estimatedFileCount: number;
  readonly requiresBrowserInspection: boolean;
  readonly requiresHeadlessEvaluation: boolean;
  readonly hiddenValidation: HiddenValidationRequest;
  readonly verticalSlice?: VerticalSliceContract;
}

export type ProposalProvenanceSource =
  | "planner"
  | "tracked-recommissioning-plan"
  | "built-in-canary"
  | "legacy-unrecorded";

export interface ProposalProvenance {
  readonly schemaVersion: "1.0.0";
  readonly source: ProposalProvenanceSource;
  readonly sourcePath: string | null;
  readonly sourceSha256: string | null;
  readonly plannerThreadId: string | null;
  readonly recordedAt: string;
  readonly reason: string | null;
}

export interface RequiredNextVerticalConsumer {
  readonly sourceMilestoneId: string;
  readonly consumerMilestoneId: string;
  readonly consumerContractSha256: string;
}

export interface PolicyFinding {
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
}

export interface PolicyDecision {
  readonly schemaVersion: "1.0.0";
  readonly status: "accepted" | "rejected";
  readonly milestoneId: string | null;
  readonly decidedAt: string;
  readonly findings: readonly PolicyFinding[];
}

export interface CommandExecutionSummary {
  readonly id: string;
  readonly displayCommand: string;
  readonly status: "PASS" | "NOT_READY" | "FAIL" | "ERROR" | "TIMEOUT";
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly parser: VerificationParser;
  readonly parsedArtifactPath: string | null;
  readonly message: string;
}

export type AuthoritativeVerificationDisposition =
  "completion-eligible" | "incremental-readiness";

export type ReadinessHistoryMode =
  "not-applicable" | "first-readiness-transition" | "durable-records";

export interface ReadinessHistoryEvidence {
  readonly mode: Exclude<ReadinessHistoryMode, "not-applicable">;
  readonly previouslyPassingStageIds: readonly string[];
}

export interface AuthoritativeStageSummary {
  readonly id: string;
  readonly status: "PASS" | "NOT_READY";
}

export interface AuthoritativeVerificationSummary {
  readonly runId: string;
  readonly status: "PASS" | "NOT_READY";
  readonly exitCode: 0 | 2;
  readonly disposition: AuthoritativeVerificationDisposition;
  readonly profileId: "bootstrap" | "readiness";
  readonly completionClaim: "bootstrap_complete" | "autonomous_readiness";
  readonly completionEligible: boolean;
  readonly profileAutonomousReadinessEquivalent: boolean;
  readonly autonomousReadinessEquivalent: boolean;
  readonly readinessHistoryMode: ReadinessHistoryMode;
  readonly candidateCommit: string;
  readonly requiredStageCount: number;
  readonly validatedArtifactCount: number;
  readonly stages: readonly AuthoritativeStageSummary[];
  readonly passingStageIds: readonly string[];
  readonly notReadyStageIds: readonly string[];
  readonly previouslyPassingStageIds: readonly string[];
  readonly sourceResultPath: string;
  readonly copiedResultPath: string;
}

export type VerificationDisposition =
  AuthoritativeVerificationDisposition | "rejected";

export interface VerificationSummary {
  readonly schemaVersion: "1.0.0";
  readonly attempt: number;
  readonly status: "PASS" | "FAIL" | "ERROR";
  readonly disposition: VerificationDisposition;
  readonly failureKind: "product" | "infrastructure" | "policy" | null;
  readonly summary: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly commands: readonly CommandExecutionSummary[];
  readonly authoritative: AuthoritativeVerificationSummary | null;
  readonly changedPaths: readonly string[];
  readonly artifactPaths: readonly string[];
}

export interface ReviewFinding {
  readonly code: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly message: string;
  readonly evidence: string;
}

export interface ReviewerChecks {
  readonly acceptanceEvidence: boolean;
  readonly architectureCompliance: boolean;
  readonly testQuality: boolean;
  readonly noSuspiciousShortcuts: boolean;
  readonly noScopeReduction: boolean;
  readonly regressionsHandled: boolean;
}

export interface ReviewerReport {
  readonly schemaVersion: typeof REVIEW_SCHEMA_VERSION;
  readonly decision: "approve" | "reject" | "escalate";
  readonly summary: string;
  readonly findings: readonly ReviewFinding[];
  readonly checks: ReviewerChecks;
  readonly attempt?: number;
  readonly threadId?: string;
  readonly reviewedAt?: string;
}

export interface BlockerRecord {
  readonly code: string;
  readonly message: string;
  readonly evidence: readonly string[];
  readonly createdAt: string;
}

export interface IsolatedWorkspaceRecord {
  readonly isolation: "standalone-local-clone-branch";
  readonly path: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly headCommit: string | null;
  readonly createdAt: string;
  readonly preserved: boolean;
  readonly cleanup: WorkspaceCleanupRecord;
}

export type WorkspaceCleanupReason =
  | "legacy-pre-policy"
  | "completed-delete-workspace"
  | "completed-preserve-workspace"
  | "failed-delete-after-diagnostics"
  | "failed-preserve-workspace";

export interface WorkspaceCleanupRecord {
  readonly schemaVersion: typeof WORKSPACE_CLEANUP_SCHEMA_VERSION;
  readonly status:
    | "active"
    | "legacy-preserved"
    | "pending"
    | "preserved"
    | "deleted"
    | "failed";
  readonly reason: WorkspaceCleanupReason | null;
  readonly requestedAt: string | null;
  readonly completedAt: string | null;
  readonly nodeModulesRemovedAt: string | null;
  readonly diagnosticArchivePath: string | null;
  readonly error: string | null;
}

export interface MilestoneTimestamps {
  readonly proposedAt: string;
  readonly readyAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

export interface MilestoneRecord {
  readonly proposal: MilestoneProposal;
  readonly proposalProvenance: ProposalProvenance;
  readonly status: MilestoneStatus;
  readonly attempts: number;
  readonly infrastructureFailures: number;
  readonly workerThreadId: string | null;
  readonly workerThreadLineage: readonly WorkerThreadLineageRecord[];
  readonly workerPolicy: WorkerPolicyState;
  readonly reviewerThreadIds: readonly string[];
  readonly timestamps: MilestoneTimestamps;
  readonly verificationSummaries: readonly VerificationSummary[];
  readonly reviewerDecisions: readonly ReviewerReport[];
  readonly commits: readonly string[];
  readonly blockers: readonly BlockerRecord[];
  readonly workspace: IsolatedWorkspaceRecord | null;
  readonly retryFeedback: string | null;
  readonly nextAllowedAction: NextAllowedAction;
}

export interface WorkerFailureRecord {
  readonly attempt: number;
  readonly kind: "product" | "infrastructure" | "review";
  readonly acceptanceCriterionIds: readonly string[];
  readonly significantArchitecturalCorrection: boolean;
  readonly deeperCrossSystemReasoning: boolean;
  readonly evidenceSummary: string;
  readonly recordedAt: string;
}

export interface WorkerPolicyState {
  readonly activeRole: "feature-worker-initial" | "feature-worker-escalated";
  readonly escalated: boolean;
  readonly escalationReason: string | null;
  readonly escalatedAt: string | null;
  readonly failures: readonly WorkerFailureRecord[];
}

export interface WorkerThreadLineageRecord {
  readonly threadId: string;
  readonly role: "feature-worker-initial" | "feature-worker-escalated";
  readonly model: AgentModel | "legacy-unrecorded";
  readonly reasoningEffort: AgentReasoningEffort | "legacy-unrecorded";
  readonly startedAt: string;
  readonly attempt: number;
  readonly replacesThreadId: string | null;
  readonly replacementReason: string | null;
}

export interface ProtectedFileRecord {
  readonly path: string;
  readonly sha256: string;
}

export interface RepositoryState {
  readonly root: string;
  readonly targetBranch: string;
  readonly verifiedCommit: string;
  readonly protectedFiles: readonly ProtectedFileRecord[];
}

export interface RunUsage {
  readonly codexInvocations: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
}

export interface RunState {
  readonly id: string | null;
  readonly status: "idle" | "running" | "stopped" | "escalated";
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly deadlineAt: string | null;
  readonly milestonesProcessed: number;
  readonly consecutiveInfrastructureFailures: number;
  readonly usage: RunUsage;
  readonly plannerThreadIds: readonly string[];
  readonly agentInvocations: readonly AgentInvocationRecord[];
  readonly stopReason: string | null;
  readonly artifactDirectory: string | null;
}

export interface HiddenValidationState {
  readonly lastCheckpointAt: string | null;
  readonly lastMilestoneId: string | null;
}

export interface EvidenceRetentionState {
  readonly schemaVersion: typeof EVIDENCE_RETENTION_SCHEMA_VERSION;
  readonly initializedAt: string | null;
  readonly legacyRunIds: readonly string[];
  readonly lastPrunedAt: string | null;
  readonly lastReportPath: string | null;
}

export interface DurableArtifactReference {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ControllerBoundaryArchive {
  readonly schemaVersion: typeof CONTROLLER_ARCHIVE_SCHEMA_VERSION;
  readonly id: string;
  readonly rawSourceState: DurableArtifactReference;
  readonly sourceStateSchemaVersion: string;
  readonly sourceRevision: number;
  readonly priorVerifiedCommit: string;
  readonly priorRun: Readonly<Record<string, unknown>>;
  readonly priorQueue: readonly string[];
  readonly priorActiveMilestoneId: string | null;
  readonly priorNextAllowedAction: string;
  readonly archivedAt: string;
  readonly reason: "external-integration-reconciliation";
}

export const RECONCILIATION_PHASES = [
  "prepared",
  "verifying",
  "candidate-verified",
  "reviewing",
  "review-approved",
  "adopting",
  "state-adopted",
  "queueing-next",
  "completed",
  "failed",
] as const;
export type ReconciliationPhase = (typeof RECONCILIATION_PHASES)[number];

export interface HistoricalMeasurementAvailability {
  readonly availability: "not-recorded";
  readonly reason: string;
}

export interface ReconciliationHistoricalMeasurementAvailability {
  readonly planner: HistoricalMeasurementAvailability;
  readonly worker: HistoricalMeasurementAvailability;
  readonly reviewer: HistoricalMeasurementAvailability;
  readonly attempts: HistoricalMeasurementAvailability;
  readonly timings: HistoricalMeasurementAvailability;
  readonly tokens: HistoricalMeasurementAvailability;
  readonly threadLineage: HistoricalMeasurementAvailability;
}

export interface ReconciliationCommitRangeReference extends DurableArtifactReference {
  readonly commitCount: number;
  readonly recordsSha256: string;
}

export interface ReconciliationVerificationReference extends DurableArtifactReference {
  readonly runId: string;
  readonly status: "NOT_READY";
  readonly exitCode: 2;
  readonly disposition: "incremental-readiness";
  readonly exactResult: DurableArtifactReference;
}

export interface ReconciliationReviewReference extends DurableArtifactReference {
  readonly decision: "approve" | "reject" | "escalate";
  readonly threadId: string;
}

export interface ReconciliationNextProposalReference extends DurableArtifactReference {
  readonly id: string;
}

export interface ReconciliationFailure {
  readonly classification: "product" | "infrastructure" | "policy" | "review";
  readonly message: string;
  readonly evidence: readonly DurableArtifactReference[];
}

export type ReconciliationPhaseTimestamps = Readonly<
  Record<ReconciliationPhase, string | null>
>;

export interface ReconciliationRecord {
  readonly schemaVersion: typeof RECONCILIATION_SCHEMA_VERSION;
  readonly id: string;
  readonly status: "active" | "completed" | "failed";
  readonly phase: ReconciliationPhase;
  readonly sourceArchiveId: string;
  readonly sourceState: DurableArtifactReference;
  readonly sourceVerifiedCommit: string;
  readonly targetBranch: string;
  readonly candidateRevision: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly cleanTree: true;
  readonly commitRange: ReconciliationCommitRangeReference;
  readonly protectedComparison: DurableArtifactReference;
  readonly externalGapReason: string;
  readonly historicalMeasurementAvailability: ReconciliationHistoricalMeasurementAvailability;
  readonly focusedEvidenceIndex: DurableArtifactReference | null;
  readonly exactVerification: ReconciliationVerificationReference | null;
  readonly benchmark: DurableArtifactReference;
  readonly artifactInventory: DurableArtifactReference;
  readonly independentReview: ReconciliationReviewReference | null;
  readonly nextProposal: ReconciliationNextProposalReference;
  readonly adoption: DurableArtifactReference | null;
  readonly previousPhase: ReconciliationPhase | null;
  readonly previousPhaseAt: string | null;
  readonly currentPhaseAt: string;
  readonly phaseTimestamps: ReconciliationPhaseTimestamps;
  readonly failure: ReconciliationFailure | null;
}

export const RECONCILIATION_REVIEW_CHECK_IDS = [
  "completeCommitLineage",
  "protectedIntegrity",
  "noFabricatedHistory",
  "d031ScopeCompliance",
  "d031MigrationIntegrity",
  "d031NodeWorkerParity",
  "commandOwnedEvidenceValidity",
  "verificationTierNonAuthority",
  "invariantSuiteQuality",
  "selectorShadowOnlyEnforcement",
  "telemetryNonSemanticBehavior",
  "artifactContainmentAndNonDeletion",
  "stateMigrationAndRecovery",
  "verticalMilestonePolicy",
  "dependencyValidNextProposal",
  "noScopeReductionOrSuspiciousShortcut",
] as const;
export type ReconciliationReviewCheckId =
  (typeof RECONCILIATION_REVIEW_CHECK_IDS)[number];

export interface ReconciliationReviewFinding {
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
}

export interface ReconciliationReview {
  readonly schemaVersion: typeof RECONCILIATION_REVIEW_SCHEMA_VERSION;
  readonly reconciliationId: string;
  readonly sourceVerifiedCommit: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly commitRangeManifestSha256: string;
  readonly decision: "approve" | "reject" | "escalate";
  readonly summary: string;
  readonly findings: readonly ReconciliationReviewFinding[];
  readonly checks: Readonly<Record<ReconciliationReviewCheckId, boolean>>;
  readonly threadId: string;
  readonly reviewedAt: string;
}

export interface OrchestratorState {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION;
  readonly revision: number;
  readonly repository: RepositoryState;
  readonly queue: readonly string[];
  readonly milestones: readonly MilestoneRecord[];
  readonly activeMilestoneId: string | null;
  readonly requiredNextVerticalConsumer: RequiredNextVerticalConsumer | null;
  readonly run: RunState;
  readonly hiddenValidation: HiddenValidationState;
  readonly evidenceRetention: EvidenceRetentionState;
  readonly controllerHistory: readonly ControllerBoundaryArchive[];
  readonly reconciliation: {
    readonly active: ReconciliationRecord | null;
    readonly history: readonly ReconciliationRecord[];
  };
  readonly nextAllowedAction: NextAllowedAction;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrchestratorLimits {
  readonly attemptsPerMilestone: number;
  readonly consecutiveInfrastructureFailures: number;
  readonly wallClockMs: number;
  readonly codexInvocations: number;
  readonly tokenBudget: number;
  readonly milestonesPerInvocation: number;
  readonly codexTurnMs: number;
  readonly commandMs: number;
  readonly hiddenValidationCooldownMs: number;
  readonly plannerProposalAttempts: number;
  readonly maximumPermittedPaths: number;
  readonly maximumAcceptanceCriteria: number;
  readonly maximumEstimatedFiles: number;
}

export interface ProjectProfile {
  readonly name: string;
  readonly authorityFile: string;
  readonly verticalSpine: {
    readonly minimumCategories: number;
    readonly categoryPatterns: readonly string[];
  };
}

export interface OrchestratorConfig {
  readonly schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  readonly project: ProjectProfile;
  readonly targetBranch: string;
  readonly statePath: string;
  readonly artifactRoot: string;
  readonly workspaceRoot: string;
  readonly workerSandbox: "workspace-write";
  readonly plannerSandbox: "read-only";
  readonly reviewerSandbox: "read-only";
  readonly approvalPolicy: "on-request";
  readonly networkAccessEnabled: false;
  readonly preserveFailedWorkspaces: boolean;
  readonly cleanupCompletedWorkspaces: boolean;
  readonly evidenceRetention: {
    readonly artifactRoot: string;
    readonly keepRecentRuns: number;
  };
  readonly hiddenValidationEnabled: boolean;
  readonly agentPolicy: AgentModelPolicy;
  readonly limits: OrchestratorLimits;
  readonly protectedPaths: readonly string[];
}

export interface UsageRecord {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
}

export interface CodexTurnResult {
  readonly threadId: string;
  readonly finalResponse: string;
  readonly usage: UsageRecord | null;
  readonly itemCount: number;
}
