export const LEGACY_MILESTONE_SCHEMA_VERSION = "1.0.0" as const;
export const PREVIOUS_MILESTONE_SCHEMA_VERSION = "1.1.0" as const;
export const MILESTONE_SCHEMA_VERSION = "1.2.0" as const;
export const STATE_SCHEMA_VERSION = "1.9.0" as const;
export const CONFIG_SCHEMA_VERSION = "1.6.0" as const;
export const REVIEW_LEGACY_SCHEMA_VERSION = "1.0.0" as const;
export const REVIEW_SCHEMA_VERSION = "1.1.0" as const;
export const LEGACY_VERIFICATION_SUMMARY_SCHEMA_VERSION = "1.1.0" as const;
export const VERIFICATION_SUMMARY_SCHEMA_VERSION = "1.2.0" as const;
export const RECONCILIATION_SCHEMA_VERSION = "1.0.0" as const;
export const RECONCILIATION_REVIEW_SCHEMA_VERSION = "1.0.0" as const;
export const CONTROLLER_ARCHIVE_SCHEMA_VERSION = "1.0.0" as const;
export const AGENT_POLICY_SCHEMA_VERSION = "1.0.0" as const;
export const AGENT_INVOCATION_SCHEMA_VERSION = "1.0.0" as const;
export const WORKSPACE_CLEANUP_SCHEMA_VERSION = "1.0.0" as const;
export const OPERATION_INTENT_SCHEMA_VERSION = "1.0.0" as const;
export const EVIDENCE_RETENTION_SCHEMA_VERSION = "1.0.0" as const;
export const VERIFICATION_TIER_SCHEMA_VERSION = "1.2.0" as const;
export const LEGACY_VERIFICATION_MANIFEST_SCHEMA_VERSION =
  "verification-manifest.v1" as const;
export const VERIFICATION_MANIFEST_SCHEMA_VERSION =
  "verification-manifest.v2" as const;
export const COMMISSIONING_INPUT_SCHEMA_VERSION =
  "loop-commissioning-input.v1" as const;

export {
  DEFAULT_COMMAND_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
} from "./process-supervisor.js";
export type { ExecutionProviderIdentity } from "./execution-provider-identity.js";
import type {
  ExecutionMode,
  ExecutionProviderIdentity,
} from "./execution-provider-identity.js";

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

export const CONTROLLER_TRUST_ROOT_PATHS = [
  "AGENTS.md",
  ".agent/readiness-profile-activated.json",
  "scripts/verify.mjs",
  "pnpm-lock.yaml",
  "package.json",
  "tools/milestone-orchestrator/config/invariant-suite.json",
] as const;

// Directory subtrees whose entire contents are verifier-equivalent: the
// controller runs from the target checkout, so a permitted edit anywhere in
// its source or config is enforced on the next run. Subtrees are enforced at
// the proposal/diff boundary (any changed path under them is a protected
// change, including newly created files); the per-file hash baseline covers
// only literal protected paths.
export const CONTROLLER_TRUST_ROOT_SUBTREES = [
  "tools/milestone-orchestrator",
] as const;

// Verification manifests are protected while present: loadConfig appends both
// the active commissioning path and the retained source-history path to the
// enforced protected set, so editing or deleting either trips the diff fence
// and the recorded hash baseline.

export const REQUIRED_PROTECTED_PATHS = [
  "evals/ACCEPTANCE.md",
  "evals/acceptance-manifest.json",
  "evals/HIDDEN_VALIDATION_PROTOCOL.md",
  "evals/immutable-contract-lock.json",
  ...CONTROLLER_TRUST_ROOT_PATHS,
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
  // Required at milestone schema 1.2.0 (nonempty for exit-code, exactly []
  // for pnpm-verify); absent only on persisted legacy proposals.
  readonly expectedArtifactKinds?: readonly string[];
  readonly timeoutMs?: number;
}

export const VERIFICATION_TIERS = [
  "iteration",
  "candidate",
  "milestone",
  "periodic",
] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

export const VERIFICATION_PROFILES = ["bootstrap", "readiness"] as const;
export type VerificationProfile = (typeof VERIFICATION_PROFILES)[number];

export const GENERIC_RECONCILIATION_REVIEW_CHECK_IDS = [
  "completeCommitLineage",
  "protectedIntegrity",
  "noFabricatedHistory",
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
export type GenericReconciliationReviewCheckId =
  (typeof GENERIC_RECONCILIATION_REVIEW_CHECK_IDS)[number];

export interface FocusedVerificationCommand {
  readonly id: string;
  readonly argv: readonly string[];
  readonly tiers: readonly Exclude<VerificationTier, "periodic">[];
  readonly expectedArtifactKinds: readonly string[];
}

export interface VerificationCommandManifest {
  readonly focusedCommands: readonly FocusedVerificationCommand[];
  readonly requiredProtectedPaths: readonly string[];
}

export interface LegacyVerificationManifest extends VerificationCommandManifest {
  readonly schemaVersion: typeof LEGACY_VERIFICATION_MANIFEST_SCHEMA_VERSION;
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

export interface VerificationManifest extends VerificationCommandManifest {
  readonly schemaVersion: typeof VERIFICATION_MANIFEST_SCHEMA_VERSION;
  readonly commissioning: {
    readonly id: string;
    readonly targetBranch: string;
    readonly baseCommit: string;
    readonly profile: VerificationProfile;
    readonly createdAt: string;
  };
  readonly objective: string;
  readonly exclusions: readonly string[];
  readonly requiredProtectedPaths: readonly string[];
  readonly requiredInvariantSuiteId: string;
  readonly scopePolicyId: string;
  readonly exactVerification: {
    readonly argv: readonly ["pnpm", "verify"];
    readonly requiresNoArguments: true;
    readonly profileSource: "package-default";
    readonly selectedByOverride: false;
  };
  readonly reconciliationPolicy: {
    readonly id: string;
    readonly nextProposalPath: string;
    readonly requiredReviewChecks: readonly string[];
  };
}

export interface CommissioningInput {
  readonly schemaVersion: typeof COMMISSIONING_INPUT_SCHEMA_VERSION;
  readonly commissioning: {
    readonly id: string;
    readonly targetBranch: string;
    readonly baseCommit: string;
    readonly profile: VerificationProfile;
  };
  readonly sources: {
    readonly configPath: string;
    readonly invariantSuitePath: string;
    readonly scopePolicyPath: string;
    readonly immutableContractLockPath: string;
    readonly immutableContractLockSha256: string;
  };
  readonly objective: string;
  readonly exclusions: readonly string[];
  readonly focusedCommands: readonly FocusedVerificationCommand[];
  readonly requiredProtectedPaths: readonly string[];
  readonly requiredInvariantSuiteId: string;
  readonly scopePolicyId: string;
  readonly exactVerification: VerificationManifest["exactVerification"];
  readonly reconciliationPolicy: VerificationManifest["reconciliationPolicy"];
  readonly output: {
    readonly verificationManifestPath: string;
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
  readonly executionProvider: ExecutionProviderIdentity;
}

export interface ExactVerificationIndex {
  readonly invokedWithNoArguments: true;
  readonly resultPath: string;
  readonly resultSha256: string;
  readonly status: "PASS" | "NOT_READY";
  readonly exitCode: 0 | 2;
  readonly disposition: AuthoritativeVerificationDisposition;
  readonly profileId: VerificationProfile;
  readonly selectedByOverride: false;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly executionProvider: ExecutionProviderIdentity;
}

export interface VerificationTierResult {
  readonly schemaVersion: typeof VERIFICATION_TIER_SCHEMA_VERSION;
  readonly runId: string;
  readonly tier: VerificationTier;
  readonly status: "PASS" | "NOT_READY" | "FAIL" | "ERROR";
  readonly exitCode: 0 | 1 | 2 | 3;
  readonly authoritative: false;
  readonly executionProvider: ExecutionProviderIdentity;
  readonly providerCompletionEligible: boolean;
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
  readonly candidateFinal: {
    readonly baseCommit: string;
    readonly gitCommit: string;
    readonly gitTree: string;
    readonly workingTreeDirty: boolean;
  };
  readonly identityDrift: {
    readonly detected: boolean;
    readonly fields: readonly string[];
  };
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
    | typeof LEGACY_MILESTONE_SCHEMA_VERSION
    | typeof PREVIOUS_MILESTONE_SCHEMA_VERSION
    | typeof MILESTONE_SCHEMA_VERSION;
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
  // Required on legacy proposals (1.0.0 / 1.1.0); removed at 1.2.0 — its
  // values named controller-produced files a command could never prove.
  readonly expectedArtifacts?: readonly string[];
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

export interface StreamCaptureReport {
  readonly bytesCaptured: number;
  readonly totalBytesObserved: number;
  readonly truncated: boolean;
  readonly capBytes: number;
}

export interface SupervisionTerminationReport {
  readonly attempted: readonly string[];
  /**
   * Whether the direct child's exit was observed after termination was
   * initiated. This proves only root death - descendants may survive a
   * failed tree kill; per-attempt outcomes live in `detail`.
   */
  readonly rootExitObserved: boolean;
  readonly detail: string | null;
}

export interface SupervisionReport {
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
  readonly terminationReason: "timeout" | "output-limit" | null;
  readonly termination: SupervisionTerminationReport | null;
  readonly streamsClosed: boolean;
  readonly drainTimedOut: boolean;
  /**
   * Set when a per-stream cap breach arrived while draining after the root
   * had already exited: the drain was cut off immediately, stragglers were
   * swept where the platform allows, and the command settled.
   */
  readonly drainCutoff: "output-limit" | null;
  readonly drainSweep: string | null;
  readonly stdout: StreamCaptureReport;
  readonly stderr: StreamCaptureReport;
  readonly duplicateSettleSignals: readonly string[];
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
  readonly receipt: VerificationReceiptReference | null;
  readonly receiptAbsenceReason: string | null;
  readonly telemetryError?: string;
  readonly supervision?: SupervisionReport;
  readonly executionProvider?: ExecutionProviderIdentity | null;
  readonly containmentReport?: {
    readonly schemaVersion: "1.0.0";
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  } | null;
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
  readonly executionProvider: ExecutionProviderIdentity;
}

export type VerificationDisposition =
  AuthoritativeVerificationDisposition | "rejected";

export interface CandidateIdentity {
  readonly baseCommit: string;
  readonly commit: string;
  readonly tree: string;
  readonly clean: boolean;
  readonly changedEntriesDigest: string;
}

export interface VerificationSummary {
  readonly schemaVersion: typeof VERIFICATION_SUMMARY_SCHEMA_VERSION;
  readonly attempt: number;
  readonly status: "PASS" | "FAIL" | "ERROR";
  readonly disposition: VerificationDisposition;
  readonly failureKind: "product" | "infrastructure" | "policy" | null;
  readonly summary: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly commands: readonly CommandExecutionSummary[];
  readonly authoritative: AuthoritativeVerificationSummary | null;
  readonly candidate: CandidateIdentity | null;
  readonly authoritativeResultSha256: string | null;
  readonly changedPaths: readonly string[];
  readonly artifactPaths: readonly string[];
  readonly executionProvider: ExecutionProviderIdentity | null;
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
  readonly schemaVersion:
    typeof REVIEW_LEGACY_SCHEMA_VERSION | typeof REVIEW_SCHEMA_VERSION;
  readonly decision: "approve" | "reject" | "escalate";
  readonly summary: string;
  readonly findings: readonly ReviewFinding[];
  readonly checks: ReviewerChecks;
  readonly verifiedBaseCommit?: string;
  readonly verifiedHeadCommit?: string;
  readonly verifiedTree?: string;
  readonly verificationResultSha256?: string;
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

export const WORKSPACE_CREATE_PHASES = [
  "intent-persisted",
  "clone-started",
  "clone-ready",
  "publish-started",
  "published",
  "blocked",
] as const;
export type WorkspaceCreatePhase = (typeof WORKSPACE_CREATE_PHASES)[number];

export type WorkspaceCreateBlockedClassification =
  | "ambiguous-paths"
  | "invalid-final-workspace"
  | "invalid-temporary-workspace"
  | "publication-conflict"
  | "workspace-root-unsafe";

export interface WorkspaceCreateDiagnostic {
  readonly classification: WorkspaceCreateBlockedClassification;
  readonly message: string;
  readonly observedAt: string;
  readonly preservedPaths: readonly string[];
  readonly quarantinePath: null;
}

export interface WorkspaceCreateOperation {
  readonly schemaVersion: typeof OPERATION_INTENT_SCHEMA_VERSION;
  readonly kind: "workspace-create";
  readonly id: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly attempt: number;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly targetBranch: string;
  readonly baseCommit: string;
  readonly branch: string;
  readonly temporaryPath: string;
  readonly finalPath: string;
  readonly phase: WorkspaceCreatePhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recoveryPolicy: "validate-adopt-or-preserve";
  readonly diagnostic: WorkspaceCreateDiagnostic | null;
}

export const TARGET_INTEGRATE_PHASES = [
  "intent-persisted",
  "outcome-pending",
  "target-update-started",
  "target-updated",
  "outcome-integrated",
  "blocked",
] as const;
export type TargetIntegratePhase = (typeof TARGET_INTEGRATE_PHASES)[number];

export type TargetIntegrateBlockedClassification =
  | "candidate-drift"
  | "execution-provider-ineligible"
  | "outcome-conflict"
  | "state-target-inconsistent"
  | "target-branch-mismatch"
  | "target-dirty"
  | "target-index-locked"
  | "target-operation-in-progress"
  | "target-path-unsafe"
  | "target-unexpected-commit"
  | "workspace-path-unsafe";

export interface TargetIntegrateDiagnostic {
  readonly classification: TargetIntegrateBlockedClassification;
  readonly message: string;
  readonly observedAt: string;
  readonly targetHead: string | null;
  readonly preservedPaths: readonly string[];
  readonly quarantinePath: null;
}

export interface TargetIntegrateOperation {
  readonly schemaVersion: typeof OPERATION_INTENT_SCHEMA_VERSION;
  readonly kind: "target-integrate";
  readonly id: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly attempt: number;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly targetBranch: string;
  readonly expectedBaseCommit: string;
  readonly workspacePath: string;
  readonly workspaceBranch: string;
  readonly candidate: CandidateIdentity;
  readonly verificationResultSha256: string;
  readonly executionProvider: ExecutionProviderIdentity | null;
  readonly commits: readonly string[];
  readonly outcomePath: string;
  readonly outcomeTemporaryPath: string;
  readonly phase: TargetIntegratePhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completionAt: string;
  readonly recoveryPolicy: "validate-adopt-or-preserve";
  readonly diagnostic: TargetIntegrateDiagnostic | null;
}

export const WORKSPACE_CLEANUP_PHASES = [
  "intent-persisted",
  "dependency-removal-started",
  "dependencies-removed",
  "archive-started",
  "archive-ready",
  "workspace-delete-started",
  "workspace-deleted",
  "blocked",
] as const;
export type WorkspaceCleanupPhase = (typeof WORKSPACE_CLEANUP_PHASES)[number];

export type WorkspaceCleanupBlockedClassification =
  | "archive-conflict"
  | "archive-root-unsafe"
  | "diagnostic-source-drift"
  | "premature-workspace-missing"
  | "state-workspace-inconsistent"
  | "workspace-identity-drift"
  | "workspace-root-unsafe";

export interface WorkspaceCleanupDiagnostic {
  readonly classification: WorkspaceCleanupBlockedClassification;
  readonly message: string;
  readonly observedAt: string;
  readonly preservedPaths: readonly string[];
  readonly quarantinePath: null;
}

export interface WorkspaceCleanupDiagnosticFile {
  readonly name: "git-status.txt" | "workspace.diff" | "recent-git-log.txt";
  readonly sha256: string;
  readonly bytes: number;
}

export interface WorkspaceCleanupOperation {
  readonly schemaVersion: typeof OPERATION_INTENT_SCHEMA_VERSION;
  readonly kind: "workspace-cleanup";
  readonly id: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly attempt: number;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly targetBranch: string;
  readonly verifiedCommit: string;
  readonly workspacePath: string;
  readonly workspaceBranch: string;
  readonly workspaceBaseCommit: string;
  readonly recordedHeadCommit: string | null;
  readonly observedHeadCommit: string;
  readonly workspaceCreatedAt: string;
  readonly workspaceCreateOperationId: string;
  readonly workspaceStatusSha256: string;
  readonly reason: Exclude<WorkspaceCleanupReason, "legacy-pre-policy">;
  readonly runArtifactDirectory: string | null;
  readonly diagnosticArchivePath: string | null;
  readonly diagnosticFiles: readonly WorkspaceCleanupDiagnosticFile[];
  readonly phase: WorkspaceCleanupPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly requestedAt: string;
  readonly completionAt: string;
  readonly recoveryPolicy: "validate-adopt-or-preserve";
  readonly diagnostic: WorkspaceCleanupDiagnostic | null;
}

export const RETENTION_APPLY_PHASES = [
  "intent-persisted",
  "deletion-started",
  "deletion-finished",
  "result-written",
  "blocked",
] as const;
export type RetentionApplyPhase = (typeof RETENTION_APPLY_PHASES)[number];

export type RetentionApplyRootName = "verification" | "controller";

export interface RetentionCandidateIdentity {
  readonly commit: string;
  readonly tree: string;
  readonly dirty: boolean;
  readonly worktreeSha256: string;
}

export interface RetentionApplyDeletion {
  readonly ordinal: number;
  readonly root: RetentionApplyRootName;
  readonly runId: string;
  readonly path: string;
  readonly finishedAt: string;
}

export type RetentionApplyBlockedClassification =
  | "candidate-drift"
  | "config-drift"
  | "eligibility-drift"
  | "journal-conflict"
  | "premature-run-missing"
  | "result-conflict"
  | "retention-root-unsafe"
  | "run-path-unsafe";

export interface RetentionApplyDiagnostic {
  readonly classification: RetentionApplyBlockedClassification;
  readonly message: string;
  readonly observedAt: string;
  readonly preservedPaths: readonly string[];
  readonly quarantinePath: null;
}

export interface RetentionApplyOperation {
  readonly schemaVersion: typeof OPERATION_INTENT_SCHEMA_VERSION;
  readonly kind: "retention-apply";
  readonly id: string;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly targetBranch: string;
  readonly verifiedCommit: string;
  readonly runStatus: OrchestratorState["run"]["status"];
  readonly runId: string | null;
  readonly retentionInitializedAt: string;
  readonly previousLastPrunedAt: string | null;
  readonly previousLastReportPath: string | null;
  readonly planPath: string;
  readonly planSha256: string;
  readonly planBytes: number;
  readonly planGeneratedAt: string;
  readonly candidate: RetentionCandidateIdentity;
  readonly keepRecentRuns: number;
  readonly verificationArtifactRoot: string;
  readonly verificationArtifactRootRealpath: string;
  readonly verificationObservedRunIds: readonly string[];
  readonly controllerArtifactRoot: string;
  readonly controllerArtifactRootRealpath: string;
  readonly controllerObservedRunIds: readonly string[];
  readonly applyDirectory: string;
  readonly journalPath: string;
  readonly resultPath: string;
  readonly deletions: readonly RetentionApplyDeletion[];
  readonly phase: RetentionApplyPhase;
  readonly completedDeletionCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completionAt: string;
  readonly recoveryPolicy: "validate-resume-or-preserve";
  readonly diagnostic: RetentionApplyDiagnostic | null;
}

export type PendingOperation =
  | WorkspaceCreateOperation
  | TargetIntegrateOperation
  | WorkspaceCleanupOperation
  | RetentionApplyOperation;

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
  readonly executionProvider: ExecutionProviderIdentity | null;
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
  readonly pendingOperation: PendingOperation | null;
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
  readonly commandOutputLimitBytes: number;
  readonly commandKillGraceMs: number;
}

export interface ProjectProfile {
  readonly name: string;
  readonly authorityFile: string;
  readonly verticalSpine: {
    readonly minimumCategories: number;
    readonly categoryPatterns: readonly string[];
  };
}

export interface TrustedContainerExecutionConfig {
  readonly runtime: "docker" | "podman";
  readonly imageDigest: string | null;
  readonly mountPolicyVersion: string;
  readonly resourceLimitProfile: string;
  readonly networkDisposition: "denied";
}

export interface CandidateExecutionConfig {
  readonly mode: ExecutionMode;
  readonly trustedContainer: TrustedContainerExecutionConfig;
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
  readonly candidateExecution: CandidateExecutionConfig;
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
