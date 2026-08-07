import { isAbsolute } from "node:path";

import {
  AGENT_INVOCATION_SCHEMA_VERSION,
  AGENT_MODELS,
  AGENT_REASONING_EFFORTS,
  AGENT_ROLES,
  CONFIG_SCHEMA_VERSION,
  EVIDENCE_RETENTION_SCHEMA_VERSION,
  LEGACY_MILESTONE_SCHEMA_VERSION,
  MILESTONE_SCHEMA_VERSION,
  PREVIOUS_MILESTONE_SCHEMA_VERSION,
  MILESTONE_STATUSES,
  NEXT_ACTIONS,
  OPERATION_INTENT_SCHEMA_VERSION,
  RECONCILIATION_PHASES,
  RECONCILIATION_REVIEW_CHECK_IDS,
  RECONCILIATION_REVIEW_SCHEMA_VERSION,
  RECONCILIATION_SCHEMA_VERSION,
  REVIEW_LEGACY_SCHEMA_VERSION,
  REVIEW_SCHEMA_VERSION,
  REQUIRED_PROTECTED_PATHS,
  SCOPE_TRIGGER_CLASSES,
  STATE_SCHEMA_VERSION,
  TARGET_INTEGRATE_PHASES,
  VERIFICATION_MANIFEST_SCHEMA_VERSION,
  VERIFICATION_SUMMARY_SCHEMA_VERSION,
  VERIFICATION_TIERS,
  VERIFICATION_TIER_SCHEMA_VERSION,
  WORKSPACE_CLEANUP_PHASES,
  WORKSPACE_CLEANUP_SCHEMA_VERSION,
  WORKSPACE_CREATE_PHASES,
  type InvariantSuiteRegistry,
  type MilestoneProposal,
  type OrchestratorConfig,
  type OrchestratorState,
  type ReconciliationRecord,
  type ReconciliationReview,
  type ReviewerReport,
  type SlowSuiteRegistry,
  type VerificationManifest,
  type VerificationScopePolicy,
  type VerificationTierResult,
} from "./contracts.js";
import { validateAgentModelPolicy } from "./model-policy.js";
import { strictlyContained } from "./path-safety.js";

export interface ValidationResult<T> {
  readonly valid: boolean;
  readonly value: T | null;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown, minimum = 0): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.every(nonEmptyString) &&
    new Set(value).size === value.length
  );
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function timestampOrNull(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

function safeRelativePath(value: unknown): value is string {
  if (!nonEmptyString(value) || isAbsolute(value) || /[\r\n\0]/.test(value))
    return false;
  const segments = value
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  return segments.length > 0 && !segments.includes("..");
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validWorkspaceCleanup(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "status",
      "reason",
      "requestedAt",
      "completedAt",
      "nodeModulesRemovedAt",
      "diagnosticArchivePath",
      "error",
    ]) ||
    value["schemaVersion"] !== WORKSPACE_CLEANUP_SCHEMA_VERSION ||
    ![
      "active",
      "legacy-preserved",
      "pending",
      "preserved",
      "deleted",
      "failed",
    ].includes(String(value["status"])) ||
    ![
      null,
      "legacy-pre-policy",
      "completed-delete-workspace",
      "completed-preserve-workspace",
      "failed-delete-after-diagnostics",
      "failed-preserve-workspace",
    ].includes(value["reason"] as never) ||
    !timestampOrNull(value["requestedAt"]) ||
    !timestampOrNull(value["completedAt"]) ||
    !timestampOrNull(value["nodeModulesRemovedAt"]) ||
    (value["diagnosticArchivePath"] !== null &&
      (!nonEmptyString(value["diagnosticArchivePath"]) ||
        !isAbsolute(value["diagnosticArchivePath"]))) ||
    (value["error"] !== null && !nonEmptyString(value["error"]))
  )
    return false;

  const status = value["status"];
  const reason = value["reason"];
  if (status === "active")
    return (
      reason === null &&
      value["requestedAt"] === null &&
      value["completedAt"] === null &&
      value["nodeModulesRemovedAt"] === null &&
      value["diagnosticArchivePath"] === null &&
      value["error"] === null
    );
  if (status === "legacy-preserved")
    return (
      reason === "legacy-pre-policy" &&
      value["requestedAt"] === null &&
      value["completedAt"] === null &&
      value["nodeModulesRemovedAt"] === null &&
      value["diagnosticArchivePath"] === null &&
      value["error"] === null
    );
  if (reason === null || reason === "legacy-pre-policy") return false;
  if (status === "pending")
    return (
      value["requestedAt"] !== null &&
      value["completedAt"] === null &&
      value["error"] === null
    );
  if (status === "failed")
    return (
      value["requestedAt"] !== null &&
      value["completedAt"] === null &&
      value["error"] !== null
    );
  const deleting =
    reason === "completed-delete-workspace" ||
    reason === "failed-delete-after-diagnostics";
  const preserved =
    reason === "completed-preserve-workspace" ||
    reason === "failed-preserve-workspace";
  return (
    value["requestedAt"] !== null &&
    value["completedAt"] !== null &&
    value["nodeModulesRemovedAt"] !== null &&
    value["error"] === null &&
    ((status === "deleted" && deleting) ||
      (status === "preserved" && preserved)) &&
    (reason === "failed-delete-after-diagnostics") ===
      (value["diagnosticArchivePath"] !== null)
  );
}

function validWorkspaceCreateOperation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "kind",
      "id",
      "runId",
      "milestoneId",
      "attempt",
      "inputStateGeneration",
      "inputStateRevision",
      "repositoryRoot",
      "workspaceRoot",
      "targetBranch",
      "baseCommit",
      "branch",
      "temporaryPath",
      "finalPath",
      "phase",
      "createdAt",
      "updatedAt",
      "recoveryPolicy",
      "diagnostic",
    ]) ||
    value["schemaVersion"] !== OPERATION_INTENT_SCHEMA_VERSION ||
    value["kind"] !== "workspace-create" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(value["id"])) ||
    !nonEmptyString(value["runId"]) ||
    !nonEmptyString(value["milestoneId"]) ||
    !positiveInteger(value["attempt"]) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(
      String(value["inputStateGeneration"]),
    ) ||
    !nonnegativeInteger(value["inputStateRevision"]) ||
    !nonEmptyString(value["repositoryRoot"]) ||
    !isAbsolute(value["repositoryRoot"]) ||
    !nonEmptyString(value["workspaceRoot"]) ||
    !isAbsolute(value["workspaceRoot"]) ||
    !nonEmptyString(value["targetBranch"]) ||
    !/^[a-f0-9]{40}$/.test(String(value["baseCommit"])) ||
    !nonEmptyString(value["branch"]) ||
    !nonEmptyString(value["temporaryPath"]) ||
    !isAbsolute(value["temporaryPath"]) ||
    !nonEmptyString(value["finalPath"]) ||
    !isAbsolute(value["finalPath"]) ||
    value["temporaryPath"] === value["finalPath"] ||
    !strictlyContained(value["repositoryRoot"], value["workspaceRoot"]) ||
    !strictlyContained(value["workspaceRoot"], value["temporaryPath"]) ||
    !strictlyContained(value["workspaceRoot"], value["finalPath"]) ||
    !WORKSPACE_CREATE_PHASES.includes(value["phase"] as never) ||
    !timestampOrNull(value["createdAt"]) ||
    value["createdAt"] === null ||
    !timestampOrNull(value["updatedAt"]) ||
    value["updatedAt"] === null ||
    String(value["updatedAt"]) < String(value["createdAt"]) ||
    value["recoveryPolicy"] !== "validate-adopt-or-preserve"
  )
    return false;

  const diagnostic = value["diagnostic"];
  if ((value["phase"] === "blocked") !== (diagnostic !== null)) return false;
  if (diagnostic === null) return true;
  if (
    !isRecord(diagnostic) ||
    !hasOnlyKeys(diagnostic, [
      "classification",
      "message",
      "observedAt",
      "preservedPaths",
      "quarantinePath",
    ]) ||
    ![
      "ambiguous-paths",
      "invalid-final-workspace",
      "invalid-temporary-workspace",
      "publication-conflict",
      "workspace-root-unsafe",
    ].includes(String(diagnostic["classification"])) ||
    !nonEmptyString(diagnostic["message"]) ||
    !timestampOrNull(diagnostic["observedAt"]) ||
    diagnostic["observedAt"] === null ||
    !stringArray(
      diagnostic["preservedPaths"],
      diagnostic["classification"] === "workspace-root-unsafe" ||
        diagnostic["classification"] === "publication-conflict"
        ? 0
        : 1,
    ) ||
    diagnostic["preservedPaths"].some(
      (path) => path !== value["temporaryPath"] && path !== value["finalPath"],
    ) ||
    diagnostic["quarantinePath"] !== null
  )
    return false;
  return value["updatedAt"] === diagnostic["observedAt"];
}

function validTargetIntegrateOperation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "kind",
      "id",
      "runId",
      "milestoneId",
      "attempt",
      "inputStateGeneration",
      "inputStateRevision",
      "repositoryRoot",
      "targetBranch",
      "expectedBaseCommit",
      "workspacePath",
      "workspaceBranch",
      "candidate",
      "verificationResultSha256",
      "commits",
      "outcomePath",
      "outcomeTemporaryPath",
      "phase",
      "createdAt",
      "updatedAt",
      "completionAt",
      "recoveryPolicy",
      "diagnostic",
    ]) ||
    value["schemaVersion"] !== OPERATION_INTENT_SCHEMA_VERSION ||
    value["kind"] !== "target-integrate" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(value["id"])) ||
    !nonEmptyString(value["runId"]) ||
    !nonEmptyString(value["milestoneId"]) ||
    !positiveInteger(value["attempt"]) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(
      String(value["inputStateGeneration"]),
    ) ||
    !nonnegativeInteger(value["inputStateRevision"]) ||
    !nonEmptyString(value["repositoryRoot"]) ||
    !isAbsolute(value["repositoryRoot"]) ||
    !nonEmptyString(value["targetBranch"]) ||
    !commitId(value["expectedBaseCommit"]) ||
    !nonEmptyString(value["workspacePath"]) ||
    !isAbsolute(value["workspacePath"]) ||
    !strictlyContained(value["repositoryRoot"], value["workspacePath"]) ||
    !nonEmptyString(value["workspaceBranch"]) ||
    !validCandidateIdentity(value["candidate"]) ||
    (value["candidate"] as Record<string, unknown>)["baseCommit"] !==
      value["expectedBaseCommit"] ||
    (value["candidate"] as Record<string, unknown>)["clean"] !== true ||
    !sha256(value["verificationResultSha256"]) ||
    !stringArray(value["commits"], 1) ||
    value["commits"].some((commit) => !commitId(commit)) ||
    value["commits"].at(-1) !==
      (value["candidate"] as Record<string, unknown>)["commit"] ||
    !nonEmptyString(value["outcomePath"]) ||
    !isAbsolute(value["outcomePath"]) ||
    !strictlyContained(value["repositoryRoot"], value["outcomePath"]) ||
    !nonEmptyString(value["outcomeTemporaryPath"]) ||
    !isAbsolute(value["outcomeTemporaryPath"]) ||
    !strictlyContained(
      value["repositoryRoot"],
      value["outcomeTemporaryPath"],
    ) ||
    value["outcomeTemporaryPath"] === value["outcomePath"] ||
    !TARGET_INTEGRATE_PHASES.includes(value["phase"] as never) ||
    !timestampOrNull(value["createdAt"]) ||
    value["createdAt"] === null ||
    !timestampOrNull(value["updatedAt"]) ||
    value["updatedAt"] === null ||
    !timestampOrNull(value["completionAt"]) ||
    value["completionAt"] === null ||
    String(value["updatedAt"]) < String(value["createdAt"]) ||
    String(value["completionAt"]) < String(value["createdAt"]) ||
    value["recoveryPolicy"] !== "validate-adopt-or-preserve"
  )
    return false;

  const diagnostic = value["diagnostic"];
  if ((value["phase"] === "blocked") !== (diagnostic !== null)) return false;
  if (diagnostic === null) return true;
  if (
    !isRecord(diagnostic) ||
    !hasOnlyKeys(diagnostic, [
      "classification",
      "message",
      "observedAt",
      "targetHead",
      "preservedPaths",
      "quarantinePath",
    ]) ||
    ![
      "candidate-drift",
      "outcome-conflict",
      "state-target-inconsistent",
      "target-branch-mismatch",
      "target-dirty",
      "target-index-locked",
      "target-operation-in-progress",
      "target-path-unsafe",
      "target-unexpected-commit",
      "workspace-path-unsafe",
    ].includes(String(diagnostic["classification"])) ||
    !nonEmptyString(diagnostic["message"]) ||
    !timestampOrNull(diagnostic["observedAt"]) ||
    diagnostic["observedAt"] === null ||
    (diagnostic["targetHead"] !== null &&
      !commitId(diagnostic["targetHead"])) ||
    !stringArray(diagnostic["preservedPaths"]) ||
    diagnostic["quarantinePath"] !== null
  )
    return false;
  return value["updatedAt"] === diagnostic["observedAt"];
}

function validWorkspaceCleanupOperation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "kind",
      "id",
      "runId",
      "milestoneId",
      "attempt",
      "inputStateGeneration",
      "inputStateRevision",
      "repositoryRoot",
      "workspaceRoot",
      "artifactRoot",
      "targetBranch",
      "verifiedCommit",
      "workspacePath",
      "workspaceBranch",
      "workspaceBaseCommit",
      "recordedHeadCommit",
      "observedHeadCommit",
      "workspaceCreatedAt",
      "workspaceCreateOperationId",
      "workspaceStatusSha256",
      "reason",
      "runArtifactDirectory",
      "diagnosticArchivePath",
      "diagnosticFiles",
      "phase",
      "createdAt",
      "updatedAt",
      "requestedAt",
      "completionAt",
      "recoveryPolicy",
      "diagnostic",
    ]) ||
    value["schemaVersion"] !== OPERATION_INTENT_SCHEMA_VERSION ||
    value["kind"] !== "workspace-cleanup" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(value["id"])) ||
    !nonEmptyString(value["runId"]) ||
    !nonEmptyString(value["milestoneId"]) ||
    !positiveInteger(value["attempt"]) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(
      String(value["inputStateGeneration"]),
    ) ||
    !nonnegativeInteger(value["inputStateRevision"]) ||
    !nonEmptyString(value["repositoryRoot"]) ||
    !isAbsolute(value["repositoryRoot"]) ||
    !nonEmptyString(value["workspaceRoot"]) ||
    !isAbsolute(value["workspaceRoot"]) ||
    !strictlyContained(value["repositoryRoot"], value["workspaceRoot"]) ||
    !nonEmptyString(value["artifactRoot"]) ||
    !isAbsolute(value["artifactRoot"]) ||
    !strictlyContained(value["repositoryRoot"], value["artifactRoot"]) ||
    !nonEmptyString(value["targetBranch"]) ||
    !commitId(value["verifiedCommit"]) ||
    !nonEmptyString(value["workspacePath"]) ||
    !isAbsolute(value["workspacePath"]) ||
    !strictlyContained(value["workspaceRoot"], value["workspacePath"]) ||
    !nonEmptyString(value["workspaceBranch"]) ||
    !commitId(value["workspaceBaseCommit"]) ||
    (value["recordedHeadCommit"] !== null &&
      !commitId(value["recordedHeadCommit"])) ||
    !commitId(value["observedHeadCommit"]) ||
    !timestampOrNull(value["workspaceCreatedAt"]) ||
    value["workspaceCreatedAt"] === null ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(
      String(value["workspaceCreateOperationId"]),
    ) ||
    !sha256(value["workspaceStatusSha256"]) ||
    ![
      "completed-delete-workspace",
      "completed-preserve-workspace",
      "failed-delete-after-diagnostics",
      "failed-preserve-workspace",
    ].includes(String(value["reason"])) ||
    (value["runArtifactDirectory"] !== null &&
      (!nonEmptyString(value["runArtifactDirectory"]) ||
        !isAbsolute(value["runArtifactDirectory"]) ||
        !strictlyContained(
          value["artifactRoot"],
          value["runArtifactDirectory"],
        ))) ||
    (value["diagnosticArchivePath"] !== null &&
      (!nonEmptyString(value["diagnosticArchivePath"]) ||
        !isAbsolute(value["diagnosticArchivePath"]) ||
        value["runArtifactDirectory"] === null ||
        !strictlyContained(
          value["runArtifactDirectory"],
          value["diagnosticArchivePath"],
        ))) ||
    !Array.isArray(value["diagnosticFiles"]) ||
    value["diagnosticFiles"].some(
      (file) =>
        !isRecord(file) ||
        !hasOnlyKeys(file, ["name", "sha256", "bytes"]) ||
        !["git-status.txt", "workspace.diff", "recent-git-log.txt"].includes(
          String(file["name"]),
        ) ||
        !sha256(file["sha256"]) ||
        !nonnegativeInteger(file["bytes"]),
    ) ||
    new Set(
      value["diagnosticFiles"].map((file) =>
        isRecord(file) ? file["name"] : null,
      ),
    ).size !== value["diagnosticFiles"].length ||
    !WORKSPACE_CLEANUP_PHASES.includes(value["phase"] as never) ||
    !timestampOrNull(value["createdAt"]) ||
    value["createdAt"] === null ||
    !timestampOrNull(value["updatedAt"]) ||
    value["updatedAt"] === null ||
    !timestampOrNull(value["requestedAt"]) ||
    value["requestedAt"] === null ||
    !timestampOrNull(value["completionAt"]) ||
    value["completionAt"] === null ||
    String(value["updatedAt"]) < String(value["createdAt"]) ||
    String(value["completionAt"]) < String(value["createdAt"]) ||
    String(value["completionAt"]) < String(value["requestedAt"]) ||
    value["recoveryPolicy"] !== "validate-adopt-or-preserve"
  )
    return false;

  const reason = value["reason"];
  const phase = value["phase"];
  const requiresArchive = reason === "failed-delete-after-diagnostics";
  if (
    requiresArchive !== (value["diagnosticArchivePath"] !== null) ||
    requiresArchive !== (value["diagnosticFiles"].length === 3)
  )
    return false;
  if (
    (reason === "completed-preserve-workspace" ||
      reason === "failed-preserve-workspace") &&
    ![
      "intent-persisted",
      "dependency-removal-started",
      "dependencies-removed",
      "blocked",
    ].includes(String(phase))
  )
    return false;
  if (
    reason === "completed-delete-workspace" &&
    ![
      "intent-persisted",
      "workspace-delete-started",
      "workspace-deleted",
      "blocked",
    ].includes(String(phase))
  )
    return false;
  if (
    requiresArchive &&
    ![
      "intent-persisted",
      "archive-started",
      "archive-ready",
      "workspace-delete-started",
      "workspace-deleted",
      "blocked",
    ].includes(String(phase))
  )
    return false;

  const diagnostic = value["diagnostic"];
  if ((phase === "blocked") !== (diagnostic !== null)) return false;
  if (diagnostic === null) return true;
  if (
    !isRecord(diagnostic) ||
    !hasOnlyKeys(diagnostic, [
      "classification",
      "message",
      "observedAt",
      "preservedPaths",
      "quarantinePath",
    ]) ||
    ![
      "archive-conflict",
      "archive-root-unsafe",
      "diagnostic-source-drift",
      "premature-workspace-missing",
      "state-workspace-inconsistent",
      "workspace-identity-drift",
      "workspace-root-unsafe",
    ].includes(String(diagnostic["classification"])) ||
    !nonEmptyString(diagnostic["message"]) ||
    !timestampOrNull(diagnostic["observedAt"]) ||
    diagnostic["observedAt"] === null ||
    !stringArray(diagnostic["preservedPaths"]) ||
    diagnostic["preservedPaths"].some(
      (path) =>
        path !== value["workspacePath"] &&
        path !== value["diagnosticArchivePath"],
    ) ||
    diagnostic["quarantinePath"] !== null
  )
    return false;
  return value["updatedAt"] === diagnostic["observedAt"];
}

function validProposalProvenance(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "source",
      "sourcePath",
      "sourceSha256",
      "plannerThreadId",
      "recordedAt",
      "reason",
    ]) ||
    value["schemaVersion"] !== "1.0.0" ||
    ![
      "planner",
      "tracked-recommissioning-plan",
      "built-in-canary",
      "legacy-unrecorded",
    ].includes(String(value["source"])) ||
    (value["sourcePath"] !== null && !safeRelativePath(value["sourcePath"])) ||
    (value["sourceSha256"] !== null &&
      !/^[a-f0-9]{64}$/.test(String(value["sourceSha256"]))) ||
    (value["plannerThreadId"] !== null &&
      !nonEmptyString(value["plannerThreadId"])) ||
    !timestampOrNull(value["recordedAt"]) ||
    value["recordedAt"] === null ||
    (value["reason"] !== null && !nonEmptyString(value["reason"]))
  )
    return false;
  if (value["source"] === "planner")
    return (
      value["sourcePath"] === null &&
      value["sourceSha256"] === null &&
      value["plannerThreadId"] !== null
    );
  if (value["source"] === "legacy-unrecorded")
    return (
      value["sourcePath"] === null &&
      value["sourceSha256"] === null &&
      value["plannerThreadId"] === null &&
      value["reason"] === "State schema predates proposal provenance."
    );
  return (
    value["sourcePath"] !== null &&
    value["sourceSha256"] !== null &&
    value["plannerThreadId"] === null
  );
}

function validAgentInvocation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "role",
      "requestedModel",
      "requestedReasoningEffort",
      "resolvedModel",
      "resolvedReasoningEffort",
      "resolutionEvidence",
      "threadId",
      "attempt",
      "escalated",
      "escalationReason",
      "overrideApplied",
      "overrideReason",
      "status",
      "startedAt",
      "finishedAt",
      "error",
    ]) ||
    value["schemaVersion"] !== AGENT_INVOCATION_SCHEMA_VERSION ||
    !nonEmptyString(value["id"]) ||
    !AGENT_ROLES.includes(value["role"] as never) ||
    !AGENT_MODELS.includes(value["requestedModel"] as never) ||
    !AGENT_REASONING_EFFORTS.includes(
      value["requestedReasoningEffort"] as never,
    ) ||
    (value["resolvedModel"] !== null &&
      !nonEmptyString(value["resolvedModel"])) ||
    (value["resolvedReasoningEffort"] !== null &&
      !nonEmptyString(value["resolvedReasoningEffort"])) ||
    value["resolutionEvidence"] !==
      "sdk-events-do-not-expose-resolved-model-or-effort" ||
    (value["threadId"] !== null && !nonEmptyString(value["threadId"])) ||
    !positiveInteger(value["attempt"]) ||
    typeof value["escalated"] !== "boolean" ||
    (value["escalationReason"] !== null &&
      !nonEmptyString(value["escalationReason"])) ||
    typeof value["overrideApplied"] !== "boolean" ||
    (value["overrideReason"] !== null &&
      !nonEmptyString(value["overrideReason"])) ||
    !["starting", "completed", "failed"].includes(String(value["status"])) ||
    !timestampOrNull(value["startedAt"]) ||
    value["startedAt"] === null ||
    !timestampOrNull(value["finishedAt"]) ||
    (value["error"] !== null && !nonEmptyString(value["error"]))
  )
    return false;
  return (
    (value["role"] === "feature-worker-escalated") === value["escalated"] &&
    value["escalated"] === (value["escalationReason"] !== null) &&
    value["overrideApplied"] === (value["overrideReason"] !== null) &&
    (value["status"] === "starting") === (value["finishedAt"] === null) &&
    (value["status"] === "failed") === (value["error"] !== null)
  );
}

function validWorkerPolicy(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "activeRole",
      "escalated",
      "escalationReason",
      "escalatedAt",
      "failures",
    ]) ||
    !["feature-worker-initial", "feature-worker-escalated"].includes(
      String(value["activeRole"]),
    ) ||
    typeof value["escalated"] !== "boolean" ||
    (value["escalationReason"] !== null &&
      !nonEmptyString(value["escalationReason"])) ||
    !timestampOrNull(value["escalatedAt"]) ||
    !Array.isArray(value["failures"])
  )
    return false;
  if (
    value["failures"].some(
      (failure) =>
        !isRecord(failure) ||
        !hasOnlyKeys(failure, [
          "attempt",
          "kind",
          "acceptanceCriterionIds",
          "significantArchitecturalCorrection",
          "deeperCrossSystemReasoning",
          "evidenceSummary",
          "recordedAt",
        ]) ||
        !positiveInteger(failure["attempt"]) ||
        !["product", "infrastructure", "review"].includes(
          String(failure["kind"]),
        ) ||
        !stringArray(failure["acceptanceCriterionIds"]) ||
        typeof failure["significantArchitecturalCorrection"] !== "boolean" ||
        typeof failure["deeperCrossSystemReasoning"] !== "boolean" ||
        !nonEmptyString(failure["evidenceSummary"]) ||
        !timestampOrNull(failure["recordedAt"]) ||
        failure["recordedAt"] === null,
    )
  )
    return false;
  return (
    value["escalated"] ===
      (value["activeRole"] === "feature-worker-escalated") &&
    value["escalated"] === (value["escalationReason"] !== null) &&
    value["escalated"] === (value["escalatedAt"] !== null)
  );
}

function validWorkerLineage(value: unknown): boolean {
  if (
    !Array.isArray(value) ||
    value.length > 2 ||
    !value.every(
      (entry) =>
        isRecord(entry) &&
        hasOnlyKeys(entry, [
          "threadId",
          "role",
          "model",
          "reasoningEffort",
          "startedAt",
          "attempt",
          "replacesThreadId",
          "replacementReason",
        ]) &&
        nonEmptyString(entry["threadId"]) &&
        ["feature-worker-initial", "feature-worker-escalated"].includes(
          String(entry["role"]),
        ) &&
        (entry["model"] === "legacy-unrecorded" ||
          AGENT_MODELS.includes(entry["model"] as never)) &&
        (entry["reasoningEffort"] === "legacy-unrecorded" ||
          AGENT_REASONING_EFFORTS.includes(
            entry["reasoningEffort"] as never,
          )) &&
        (entry["model"] === "legacy-unrecorded") ===
          (entry["reasoningEffort"] === "legacy-unrecorded") &&
        timestampOrNull(entry["startedAt"]) &&
        entry["startedAt"] !== null &&
        positiveInteger(entry["attempt"]) &&
        (entry["replacesThreadId"] === null ||
          nonEmptyString(entry["replacesThreadId"])) &&
        (entry["replacementReason"] === null ||
          nonEmptyString(entry["replacementReason"])) &&
        (entry["replacesThreadId"] === null) ===
          (entry["replacementReason"] === null),
    ) ||
    new Set(value.filter(isRecord).map((entry) => String(entry["threadId"])))
      .size !== value.length
  )
    return false;
  const entries = value as readonly Record<string, unknown>[];
  const initial = entries[0];
  if (
    initial &&
    (initial["role"] !== "feature-worker-initial" ||
      initial["replacesThreadId"] !== null)
  )
    return false;
  const replacement = entries[1];
  return (
    !replacement ||
    (replacement["role"] === "feature-worker-escalated" &&
      replacement["model"] !== "legacy-unrecorded" &&
      replacement["replacesThreadId"] === initial?.["threadId"] &&
      Number(replacement["attempt"]) > Number(initial?.["attempt"]))
  );
}

export function validateMilestoneProposal(
  value: unknown,
  options: { readonly allowLegacy?: boolean } = {},
): ValidationResult<MilestoneProposal> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      value: null,
      errors: ["Milestone must be an object."],
    };
  }
  const baseKeys = [
    "schemaVersion",
    "id",
    "title",
    "kind",
    "objective",
    "rationale",
    "dependencies",
    "permittedPaths",
    "exclusions",
    "acceptanceCriteria",
    "requiredTests",
    "verificationCommands",
    "terminalConditions",
    "estimatedFileCount",
    "requiresBrowserInspection",
    "requiresHeadlessEvaluation",
    "hiddenValidation",
  ] as const;
  const version = value["schemaVersion"];
  const isOriginalLegacy = version === LEGACY_MILESTONE_SCHEMA_VERSION;
  const legacy =
    isOriginalLegacy || version === PREVIOUS_MILESTONE_SCHEMA_VERSION;
  const requiredKeys = [
    ...baseKeys,
    ...(legacy ? (["expectedArtifacts"] as const) : []),
    ...(isOriginalLegacy ? [] : (["verticalSlice"] as const)),
  ];
  if (!hasOnlyKeys(value, requiredKeys))
    errors.push("Milestone has unknown fields.");
  if (version !== MILESTONE_SCHEMA_VERSION && !legacy)
    errors.push(
      `Milestone schemaVersion must be ${MILESTONE_SCHEMA_VERSION}${options.allowLegacy ? ` or historical ${LEGACY_MILESTONE_SCHEMA_VERSION}/${PREVIOUS_MILESTONE_SCHEMA_VERSION}` : ""}.`,
    );
  else if (legacy && !options.allowLegacy)
    errors.push(
      `New milestone proposals must use schemaVersion ${MILESTONE_SCHEMA_VERSION}; ${String(version)} is historical-state-only.`,
    );
  if (
    typeof value["id"] !== "string" ||
    !/^[a-z][a-z0-9-]{2,63}$/.test(value["id"])
  )
    errors.push("Milestone id must be stable lowercase kebab-case.");
  if (!nonEmptyString(value["title"]) || value["title"].length > 120)
    errors.push("Milestone title must be 1-120 nonblank characters.");
  if (
    ![
      "tooling",
      "verification",
      "lifecycle",
      "feature",
      "documentation",
    ].includes(String(value["kind"]))
  )
    errors.push("Milestone kind is invalid.");
  if (!nonEmptyString(value["objective"]) || value["objective"].length < 10)
    errors.push("Milestone objective must be specific.");
  if (!nonEmptyString(value["rationale"]) || value["rationale"].length < 10)
    errors.push("Milestone rationale must be specific.");
  if (!stringArray(value["dependencies"]))
    errors.push("Milestone dependencies must be unique strings.");
  if (!stringArray(value["permittedPaths"], 1))
    errors.push("Milestone permittedPaths must be nonempty unique strings.");
  if (!stringArray(value["exclusions"], 2))
    errors.push("Milestone needs at least two explicit exclusions.");
  if (!stringArray(value["requiredTests"], 1))
    errors.push("Milestone requiredTests must be nonempty unique strings.");
  if (legacy) {
    if (!stringArray(value["expectedArtifacts"], 1))
      errors.push(
        "Milestone expectedArtifacts must be nonempty unique strings.",
      );
  } else if (value["expectedArtifacts"] !== undefined) {
    errors.push(
      `Milestone expectedArtifacts was removed at schema ${MILESTONE_SCHEMA_VERSION}; declare per-command expectedArtifactKinds instead.`,
    );
  }
  if (!stringArray(value["terminalConditions"], 1))
    errors.push(
      "Milestone terminalConditions must be nonempty unique strings.",
    );
  if (!positiveInteger(value["estimatedFileCount"]))
    errors.push("Milestone estimatedFileCount must be a positive integer.");
  if (typeof value["requiresBrowserInspection"] !== "boolean")
    errors.push("requiresBrowserInspection must be boolean.");
  if (typeof value["requiresHeadlessEvaluation"] !== "boolean")
    errors.push("requiresHeadlessEvaluation must be boolean.");

  const criteria = value["acceptanceCriteria"];
  if (!Array.isArray(criteria) || criteria.length === 0) {
    errors.push("Milestone acceptanceCriteria must be nonempty.");
  } else {
    const ids: string[] = [];
    for (const criterion of criteria) {
      if (
        !isRecord(criterion) ||
        !hasOnlyKeys(criterion, ["id", "description", "evidence"]) ||
        !nonEmptyString(criterion["id"]) ||
        !nonEmptyString(criterion["description"]) ||
        !nonEmptyString(criterion["evidence"])
      ) {
        errors.push(
          "Each acceptance criterion needs id, description, and evidence.",
        );
      } else {
        ids.push(criterion["id"]);
      }
    }
    if (new Set(ids).size !== ids.length)
      errors.push("Acceptance criterion IDs must be unique.");
  }

  const commands = value["verificationCommands"];
  if (!Array.isArray(commands) || commands.length === 0) {
    errors.push("Milestone verificationCommands must be nonempty.");
  } else {
    const commandKeys = legacy
      ? ["id", "executable", "args", "parser", "timeoutMs"]
      : [
          "id",
          "executable",
          "args",
          "parser",
          "expectedArtifactKinds",
          "timeoutMs",
        ];
    const ids: string[] = [];
    for (const command of commands) {
      if (
        !isRecord(command) ||
        !hasOnlyKeys(command, commandKeys) ||
        !nonEmptyString(command["id"]) ||
        !["pnpm", "node", "git"].includes(String(command["executable"])) ||
        !Array.isArray(command["args"]) ||
        !command["args"].every((argument) => typeof argument === "string") ||
        !["exit-code", "pnpm-verify"].includes(String(command["parser"])) ||
        (command["timeoutMs"] !== undefined &&
          !positiveInteger(command["timeoutMs"]))
      ) {
        errors.push(
          "Each verification command must use the versioned argv schema.",
        );
      } else if (
        !legacy &&
        !(command["parser"] === "pnpm-verify"
          ? Array.isArray(command["expectedArtifactKinds"]) &&
            command["expectedArtifactKinds"].length === 0
          : stringArray(command["expectedArtifactKinds"], 1))
      ) {
        errors.push(
          "Each verification command must declare expectedArtifactKinds: nonempty unique kinds for exit-code commands and exactly [] for pnpm-verify.",
        );
      } else {
        ids.push(command["id"]);
      }
    }
    if (new Set(ids).size !== ids.length)
      errors.push("Verification command IDs must be unique.");
  }

  const hidden = value["hiddenValidation"];
  if (
    !isRecord(hidden) ||
    !hasOnlyKeys(hidden, ["requested", "checkpointId"]) ||
    typeof hidden["requested"] !== "boolean" ||
    (hidden["requested"] && !nonEmptyString(hidden["checkpointId"])) ||
    (!hidden["requested"] && hidden["checkpointId"] !== undefined)
  ) {
    errors.push(
      "hiddenValidation must declare requested and only a required checkpointId.",
    );
  }

  if (!isOriginalLegacy) {
    const vertical = value["verticalSlice"];
    if (
      !isRecord(vertical) ||
      !hasOnlyKeys(vertical, [
        "mode",
        "userGoal",
        "publicActionKinds",
        "sharedRuleOwners",
        "standardCompositionOwner",
        "persistenceReplayEvidence",
        "nodeWorkerParityEvidence",
        "inspectableConsequence",
        "exception",
      ]) ||
      !["not-applicable", "integrated", "exception"].includes(
        String(vertical?.["mode"]),
      ) ||
      (vertical?.["userGoal"] !== null &&
        !nonEmptyString(vertical?.["userGoal"])) ||
      !stringArray(vertical?.["publicActionKinds"]) ||
      !stringArray(vertical?.["sharedRuleOwners"]) ||
      (Array.isArray(vertical?.["sharedRuleOwners"]) &&
        vertical["sharedRuleOwners"].some((path) => !safeRelativePath(path))) ||
      (vertical?.["standardCompositionOwner"] !== null &&
        !safeRelativePath(vertical?.["standardCompositionOwner"])) ||
      !stringArray(vertical?.["persistenceReplayEvidence"]) ||
      !stringArray(vertical?.["nodeWorkerParityEvidence"])
    )
      errors.push("Milestone verticalSlice contract is malformed.");
    if (isRecord(vertical)) {
      const consequence = vertical["inspectableConsequence"];
      if (
        consequence !== null &&
        (!isRecord(consequence) ||
          !hasOnlyKeys(consequence, [
            "readModelPaths",
            "browserEvidenceRequired",
            "description",
          ]) ||
          !stringArray(consequence["readModelPaths"]) ||
          typeof consequence["browserEvidenceRequired"] !== "boolean" ||
          !nonEmptyString(consequence["description"]))
      )
        errors.push("Milestone inspectable consequence is malformed.");
      const exception = vertical["exception"];
      if (
        exception !== null &&
        (!isRecord(exception) ||
          !hasOnlyKeys(exception, [
            "kind",
            "justification",
            "immediateConsumerMilestoneId",
            "consumerContract",
          ]) ||
          ![
            "kernel-only",
            "fixture-only",
            "migration-only",
            "preview-only",
          ].includes(String(exception["kind"])) ||
          !nonEmptyString(exception["justification"]) ||
          !nonEmptyString(exception["immediateConsumerMilestoneId"]) ||
          !/^[a-z][a-z0-9-]{2,63}$/.test(
            String(exception["immediateConsumerMilestoneId"]),
          ) ||
          !nonEmptyString(exception["consumerContract"]))
      )
        errors.push("Milestone vertical exception is malformed.");
      if (
        vertical["mode"] === "not-applicable" &&
        (vertical["userGoal"] !== null ||
          (Array.isArray(vertical["publicActionKinds"]) &&
            vertical["publicActionKinds"].length > 0) ||
          (Array.isArray(vertical["sharedRuleOwners"]) &&
            vertical["sharedRuleOwners"].length > 0) ||
          vertical["standardCompositionOwner"] !== null ||
          (Array.isArray(vertical["persistenceReplayEvidence"]) &&
            vertical["persistenceReplayEvidence"].length > 0) ||
          (Array.isArray(vertical["nodeWorkerParityEvidence"]) &&
            vertical["nodeWorkerParityEvidence"].length > 0) ||
          vertical["inspectableConsequence"] !== null ||
          vertical["exception"] !== null)
      )
        errors.push(
          "A not-applicable verticalSlice must not carry feature or exception claims.",
        );
    }
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? (value as unknown as MilestoneProposal) : null,
    errors,
  };
}

export function assertMilestoneProposal(value: unknown): MilestoneProposal {
  const result = validateMilestoneProposal(value);
  if (!result.valid || !result.value)
    throw new Error(`Invalid milestone proposal: ${result.errors.join(" ")}`);
  return result.value;
}

function validCandidateIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "baseCommit",
      "commit",
      "tree",
      "clean",
      "changedEntriesDigest",
    ]) &&
    commitId(value["baseCommit"]) &&
    commitId(value["commit"]) &&
    commitId(value["tree"]) &&
    typeof value["clean"] === "boolean" &&
    sha256(value["changedEntriesDigest"])
  );
}

function validVerificationSummaryEnvelope(value: unknown): boolean {
  return (
    isRecord(value) &&
    value["schemaVersion"] === VERIFICATION_SUMMARY_SCHEMA_VERSION &&
    (value["candidate"] === null ||
      validCandidateIdentity(value["candidate"])) &&
    (value["authoritativeResultSha256"] === null ||
      sha256(value["authoritativeResultSha256"]))
  );
}

export function validateReviewerReport(
  value: unknown,
  options: { readonly allowLegacy?: boolean } = {},
): ValidationResult<ReviewerReport> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, value: null, errors: ["Review must be an object."] };
  }
  if (
    !hasOnlyKeys(value, [
      "schemaVersion",
      "decision",
      "summary",
      "findings",
      "checks",
      "verifiedBaseCommit",
      "verifiedHeadCommit",
      "verifiedTree",
      "verificationResultSha256",
      "attempt",
      "threadId",
      "reviewedAt",
    ])
  )
    errors.push("Review has unknown fields.");
  const legacy = value["schemaVersion"] === REVIEW_LEGACY_SCHEMA_VERSION;
  if (
    value["schemaVersion"] !== REVIEW_SCHEMA_VERSION &&
    !(legacy && options.allowLegacy === true)
  )
    errors.push(`Review schemaVersion must be ${REVIEW_SCHEMA_VERSION}.`);
  if (legacy && options.allowLegacy === true) {
    if (
      value["verifiedBaseCommit"] !== undefined ||
      value["verifiedHeadCommit"] !== undefined ||
      value["verifiedTree"] !== undefined ||
      value["verificationResultSha256"] !== undefined
    )
      errors.push(
        "Legacy review cannot carry verified-candidate identity fields.",
      );
  } else {
    if (
      !commitId(value["verifiedBaseCommit"]) ||
      !commitId(value["verifiedHeadCommit"]) ||
      !commitId(value["verifiedTree"])
    )
      errors.push("Review verified-candidate identity commits are invalid.");
    if (!sha256(value["verificationResultSha256"]))
      errors.push("Review verificationResultSha256 is invalid.");
  }
  if (!["approve", "reject", "escalate"].includes(String(value["decision"])))
    errors.push("Review decision is invalid.");
  if (!nonEmptyString(value["summary"]))
    errors.push("Review summary is required.");
  if (!Array.isArray(value["findings"])) {
    errors.push("Review findings must be an array.");
  } else {
    for (const finding of value["findings"]) {
      if (
        !isRecord(finding) ||
        !hasOnlyKeys(finding, ["code", "severity", "message", "evidence"]) ||
        !nonEmptyString(finding["code"]) ||
        !["low", "medium", "high", "critical"].includes(
          String(finding["severity"]),
        ) ||
        !nonEmptyString(finding["message"]) ||
        !nonEmptyString(finding["evidence"])
      )
        errors.push("Review finding is malformed.");
    }
  }
  const checks = value["checks"];
  const checkKeys = [
    "acceptanceEvidence",
    "architectureCompliance",
    "testQuality",
    "noSuspiciousShortcuts",
    "noScopeReduction",
    "regressionsHandled",
  ];
  if (
    !isRecord(checks) ||
    !hasOnlyKeys(checks, checkKeys) ||
    checkKeys.some((key) => typeof checks[key] !== "boolean")
  )
    errors.push("Review checks are incomplete or malformed.");
  if (value["attempt"] !== undefined && !positiveInteger(value["attempt"]))
    errors.push("Review attempt is invalid.");
  if (value["threadId"] !== undefined && !nonEmptyString(value["threadId"]))
    errors.push("Review threadId is invalid.");
  if (
    value["reviewedAt"] !== undefined &&
    !timestampOrNull(value["reviewedAt"])
  )
    errors.push("Review reviewedAt is invalid.");
  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? (value as unknown as ReviewerReport) : null,
    errors,
  };
}

export function assertReviewerReport(
  value: unknown,
  options: { readonly allowLegacy?: boolean } = {},
): ReviewerReport {
  const result = validateReviewerReport(value, options);
  if (!result.valid || !result.value)
    throw new Error(`Invalid reviewer report: ${result.errors.join(" ")}`);
  return result.value;
}

export function validateReconciliationReview(
  value: unknown,
): ValidationResult<ReconciliationReview> {
  const errors: string[] = [];
  const keys = [
    "schemaVersion",
    "reconciliationId",
    "sourceVerifiedCommit",
    "candidateCommit",
    "candidateTree",
    "commitRangeManifestSha256",
    "decision",
    "summary",
    "findings",
    "checks",
    "threadId",
    "reviewedAt",
  ] as const;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, keys) ||
    keys.some((key) => !(key in value))
  )
    return validation(value, ["Reconciliation review shape is invalid."]);
  if (
    value["schemaVersion"] !== RECONCILIATION_REVIEW_SCHEMA_VERSION ||
    !nonEmptyString(value["reconciliationId"]) ||
    !commitId(value["sourceVerifiedCommit"]) ||
    !commitId(value["candidateCommit"]) ||
    !commitId(value["candidateTree"]) ||
    !sha256(value["commitRangeManifestSha256"]) ||
    !["approve", "reject", "escalate"].includes(String(value["decision"])) ||
    !nonEmptyString(value["summary"]) ||
    !nonEmptyString(value["threadId"]) ||
    !timestampOrNull(value["reviewedAt"]) ||
    value["reviewedAt"] === null
  )
    errors.push("Reconciliation review identity is invalid.");
  if (
    !Array.isArray(value["findings"]) ||
    value["findings"].some(
      (finding) =>
        !isRecord(finding) ||
        !hasOnlyKeys(finding, ["severity", "code", "message", "path"]) ||
        !["low", "medium", "high", "critical"].includes(
          String(finding["severity"]),
        ) ||
        !nonEmptyString(finding["code"]) ||
        !nonEmptyString(finding["message"]) ||
        (finding["path"] !== null && !safeRelativePath(finding["path"])),
    )
  )
    errors.push("Reconciliation review findings are invalid.");
  const checks = value["checks"];
  if (
    !isRecord(checks) ||
    !hasOnlyKeys(checks, RECONCILIATION_REVIEW_CHECK_IDS) ||
    RECONCILIATION_REVIEW_CHECK_IDS.some(
      (check) => !(check in checks) || typeof checks[check] !== "boolean",
    )
  )
    errors.push("Reconciliation review checks are invalid.");
  return validation(value, errors);
}

export function assertReconciliationReview(
  value: unknown,
): ReconciliationReview {
  const result = validateReconciliationReview(value);
  if (!result.valid || !result.value)
    throw new Error(
      `Invalid reconciliation review: ${result.errors.join(" ")}`,
    );
  return result.value;
}

function validArtifactReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["path", "sha256", "bytes"]) &&
    ["path", "sha256", "bytes"].every((key) => key in value) &&
    safeRelativePath(value["path"]) &&
    sha256(value["sha256"]) &&
    positiveInteger(value["bytes"])
  );
}

function validControllerArchive(value: unknown): boolean {
  const keys = [
    "schemaVersion",
    "id",
    "rawSourceState",
    "sourceStateSchemaVersion",
    "sourceRevision",
    "priorVerifiedCommit",
    "priorRun",
    "priorQueue",
    "priorActiveMilestoneId",
    "priorNextAllowedAction",
    "archivedAt",
    "reason",
  ] as const;
  return (
    isRecord(value) &&
    hasOnlyKeys(value, keys) &&
    keys.every((key) => key in value) &&
    value["schemaVersion"] === "1.0.0" &&
    nonEmptyString(value["id"]) &&
    validArtifactReference(value["rawSourceState"]) &&
    nonEmptyString(value["sourceStateSchemaVersion"]) &&
    nonnegativeInteger(value["sourceRevision"]) &&
    commitId(value["priorVerifiedCommit"]) &&
    isRecord(value["priorRun"]) &&
    stringArray(value["priorQueue"]) &&
    (value["priorActiveMilestoneId"] === null ||
      nonEmptyString(value["priorActiveMilestoneId"])) &&
    nonEmptyString(value["priorNextAllowedAction"]) &&
    timestampOrNull(value["archivedAt"]) &&
    value["archivedAt"] !== null &&
    value["reason"] === "external-integration-reconciliation"
  );
}

function validHistoricalAvailability(value: unknown): boolean {
  const keys = [
    "planner",
    "worker",
    "reviewer",
    "attempts",
    "timings",
    "tokens",
    "threadLineage",
  ] as const;
  return (
    isRecord(value) &&
    hasOnlyKeys(value, keys) &&
    keys.every(
      (key) =>
        isRecord(value[key]) &&
        hasOnlyKeys(value[key], ["availability", "reason"]) &&
        value[key]["availability"] === "not-recorded" &&
        nonEmptyString(value[key]["reason"]),
    )
  );
}

function validReconciliationRecord(
  value: unknown,
): value is ReconciliationRecord {
  const keys = [
    "schemaVersion",
    "id",
    "status",
    "phase",
    "sourceArchiveId",
    "sourceState",
    "sourceVerifiedCommit",
    "targetBranch",
    "candidateRevision",
    "candidateCommit",
    "candidateTree",
    "cleanTree",
    "commitRange",
    "protectedComparison",
    "externalGapReason",
    "historicalMeasurementAvailability",
    "focusedEvidenceIndex",
    "exactVerification",
    "benchmark",
    "artifactInventory",
    "independentReview",
    "nextProposal",
    "adoption",
    "previousPhase",
    "previousPhaseAt",
    "currentPhaseAt",
    "phaseTimestamps",
    "failure",
  ] as const;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, keys) ||
    keys.some((key) => !(key in value)) ||
    value["schemaVersion"] !== RECONCILIATION_SCHEMA_VERSION ||
    !nonEmptyString(value["id"]) ||
    !["active", "completed", "failed"].includes(String(value["status"])) ||
    !RECONCILIATION_PHASES.includes(value["phase"] as never) ||
    !nonEmptyString(value["sourceArchiveId"]) ||
    !validArtifactReference(value["sourceState"]) ||
    !commitId(value["sourceVerifiedCommit"]) ||
    !nonEmptyString(value["targetBranch"]) ||
    !nonEmptyString(value["candidateRevision"]) ||
    !commitId(value["candidateCommit"]) ||
    !commitId(value["candidateTree"]) ||
    value["cleanTree"] !== true ||
    !validArtifactReference(value["protectedComparison"]) ||
    !nonEmptyString(value["externalGapReason"]) ||
    !validHistoricalAvailability(value["historicalMeasurementAvailability"]) ||
    !(
      value["focusedEvidenceIndex"] === null ||
      validArtifactReference(value["focusedEvidenceIndex"])
    ) ||
    !validArtifactReference(value["benchmark"]) ||
    !validArtifactReference(value["artifactInventory"]) ||
    !(
      value["adoption"] === null || validArtifactReference(value["adoption"])
    ) ||
    !(
      value["previousPhase"] === null ||
      RECONCILIATION_PHASES.includes(value["previousPhase"] as never)
    ) ||
    !timestampOrNull(value["previousPhaseAt"]) ||
    !timestampOrNull(value["currentPhaseAt"]) ||
    value["currentPhaseAt"] === null
  )
    return false;
  const range = value["commitRange"];
  if (
    !isRecord(range) ||
    !hasOnlyKeys(range, [
      "path",
      "sha256",
      "bytes",
      "commitCount",
      "recordsSha256",
    ]) ||
    !safeRelativePath(range["path"]) ||
    !sha256(range["sha256"]) ||
    !positiveInteger(range["bytes"]) ||
    !positiveInteger(range["commitCount"]) ||
    !sha256(range["recordsSha256"])
  )
    return false;
  const verification = value["exactVerification"];
  if (
    verification !== null &&
    (!isRecord(verification) ||
      !hasOnlyKeys(verification, [
        "path",
        "sha256",
        "bytes",
        "runId",
        "status",
        "exitCode",
        "disposition",
        "exactResult",
      ]) ||
      !safeRelativePath(verification["path"]) ||
      !sha256(verification["sha256"]) ||
      !positiveInteger(verification["bytes"]) ||
      !nonEmptyString(verification["runId"]) ||
      verification["status"] !== "NOT_READY" ||
      verification["exitCode"] !== 2 ||
      verification["disposition"] !== "incremental-readiness" ||
      !validArtifactReference(verification["exactResult"]))
  )
    return false;
  const review = value["independentReview"];
  if (
    review !== null &&
    (!isRecord(review) ||
      !hasOnlyKeys(review, [
        "path",
        "sha256",
        "bytes",
        "decision",
        "threadId",
      ]) ||
      !safeRelativePath(review["path"]) ||
      !sha256(review["sha256"]) ||
      !positiveInteger(review["bytes"]) ||
      !["approve", "reject", "escalate"].includes(String(review["decision"])) ||
      !nonEmptyString(review["threadId"]))
  )
    return false;
  const next = value["nextProposal"];
  if (
    !isRecord(next) ||
    !hasOnlyKeys(next, ["path", "sha256", "bytes", "id"]) ||
    !safeRelativePath(next["path"]) ||
    !sha256(next["sha256"]) ||
    !positiveInteger(next["bytes"]) ||
    !nonEmptyString(next["id"])
  )
    return false;
  const phaseTimestamps = value["phaseTimestamps"];
  if (
    !isRecord(phaseTimestamps) ||
    !hasOnlyKeys(phaseTimestamps, RECONCILIATION_PHASES) ||
    RECONCILIATION_PHASES.some(
      (phase) =>
        !(phase in phaseTimestamps) || !timestampOrNull(phaseTimestamps[phase]),
    ) ||
    phaseTimestamps[value["phase"] as keyof typeof phaseTimestamps] !==
      value["currentPhaseAt"]
  )
    return false;
  const failure = value["failure"];
  if (
    failure !== null &&
    (!isRecord(failure) ||
      !hasOnlyKeys(failure, ["classification", "message", "evidence"]) ||
      !["product", "infrastructure", "policy", "review"].includes(
        String(failure["classification"]),
      ) ||
      !nonEmptyString(failure["message"]) ||
      !Array.isArray(failure["evidence"]) ||
      failure["evidence"].some(
        (reference) => !validArtifactReference(reference),
      ))
  )
    return false;
  return (
    (value["status"] === "completed" && value["phase"] === "completed") ||
    (value["status"] === "failed" && value["phase"] === "failed") ||
    value["status"] === "active"
  );
}

function validRegexSourceArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (typeof entry !== "string" || entry.length === 0) return false;
      try {
        new RegExp(entry, "i");
        return true;
      } catch {
        return false;
      }
    })
  );
}

export function validateOrchestratorConfig(
  value: unknown,
): ValidationResult<OrchestratorConfig> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, value: null, errors: ["Config must be an object."] };
  }
  if (value["schemaVersion"] !== CONFIG_SCHEMA_VERSION)
    errors.push(`Config schemaVersion must be ${CONFIG_SCHEMA_VERSION}.`);
  const project = value["project"];
  if (
    !isRecord(project) ||
    !hasOnlyKeys(project, ["name", "authorityFile", "verticalSpine"]) ||
    !nonEmptyString(project["name"]) ||
    !safeRelativePath(project["authorityFile"]) ||
    !isRecord(project["verticalSpine"]) ||
    !hasOnlyKeys(project["verticalSpine"], [
      "minimumCategories",
      "categoryPatterns",
    ]) ||
    !positiveInteger(project["verticalSpine"]["minimumCategories"]) ||
    !validRegexSourceArray(project["verticalSpine"]["categoryPatterns"])
  )
    errors.push("Project profile configuration is malformed.");
  if (!nonEmptyString(value["targetBranch"]))
    errors.push("targetBranch is required.");
  for (const key of ["statePath", "artifactRoot", "workspaceRoot"] as const) {
    if (!safeRelativePath(value[key]))
      errors.push(
        `${key} must be a nonempty traversal-free repository-relative path.`,
      );
  }
  if (value["workerSandbox"] !== "workspace-write")
    errors.push("Worker sandbox must be workspace-write.");
  if (
    value["plannerSandbox"] !== "read-only" ||
    value["reviewerSandbox"] !== "read-only"
  )
    errors.push("Planner and reviewer sandboxes must be read-only.");
  if (value["approvalPolicy"] !== "on-request")
    errors.push("Approval policy must be on-request.");
  if (value["networkAccessEnabled"] !== false)
    errors.push("Default Codex network access must be disabled.");
  if (
    typeof value["preserveFailedWorkspaces"] !== "boolean" ||
    typeof value["cleanupCompletedWorkspaces"] !== "boolean" ||
    typeof value["hiddenValidationEnabled"] !== "boolean"
  )
    errors.push("Boolean safety configuration is malformed.");
  const evidenceRetention = value["evidenceRetention"];
  if (
    !isRecord(evidenceRetention) ||
    !hasOnlyKeys(evidenceRetention, ["artifactRoot", "keepRecentRuns"]) ||
    !safeRelativePath(evidenceRetention["artifactRoot"]) ||
    !nonnegativeInteger(evidenceRetention["keepRecentRuns"])
  )
    errors.push("Evidence retention configuration is malformed.");
  errors.push(...validateAgentModelPolicy(value["agentPolicy"]));
  const protectedPaths = value["protectedPaths"];
  if (!stringArray(protectedPaths, 1))
    errors.push("protectedPaths must be a nonempty unique string list.");
  else {
    if (
      protectedPaths.some(
        (path) => !safeRelativePath(path) || /[*?]/.test(path),
      )
    )
      errors.push(
        "protectedPaths must contain traversal-free exact file paths.",
      );
    if (
      REQUIRED_PROTECTED_PATHS.some(
        (required) => !protectedPaths.includes(required),
      )
    )
      errors.push("protectedPaths omits mandatory frozen authority.");
    if (
      isRecord(project) &&
      typeof project["authorityFile"] === "string" &&
      !protectedPaths.includes(project["authorityFile"])
    )
      errors.push("protectedPaths omits the project authority file.");
  }
  const limits = value["limits"];
  const limitKeys = [
    "attemptsPerMilestone",
    "consecutiveInfrastructureFailures",
    "wallClockMs",
    "codexInvocations",
    "tokenBudget",
    "milestonesPerInvocation",
    "codexTurnMs",
    "commandMs",
    "hiddenValidationCooldownMs",
    "plannerProposalAttempts",
    "maximumPermittedPaths",
    "maximumAcceptanceCriteria",
    "maximumEstimatedFiles",
  ];
  if (
    !isRecord(limits) ||
    !hasOnlyKeys(limits, limitKeys) ||
    limitKeys.some((key) => !positiveInteger(limits[key]))
  )
    errors.push("Every configured limit must be a positive integer.");
  return {
    valid: errors.length === 0,
    value:
      errors.length === 0 ? (value as unknown as OrchestratorConfig) : null,
    errors,
  };
}

export function assertOrchestratorConfig(value: unknown): OrchestratorConfig {
  const result = validateOrchestratorConfig(value);
  if (!result.valid || !result.value)
    throw new Error(`Invalid orchestrator config: ${result.errors.join(" ")}`);
  return result.value;
}

export function validateOrchestratorState(
  value: unknown,
): ValidationResult<OrchestratorState> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, value: null, errors: ["State must be an object."] };
  }
  if (
    !hasOnlyKeys(value, [
      "schemaVersion",
      "revision",
      "repository",
      "queue",
      "milestones",
      "activeMilestoneId",
      "requiredNextVerticalConsumer",
      "run",
      "hiddenValidation",
      "evidenceRetention",
      "controllerHistory",
      "reconciliation",
      "pendingOperation",
      "nextAllowedAction",
      "createdAt",
      "updatedAt",
    ])
  )
    errors.push("State has unknown fields.");
  if (value["schemaVersion"] !== STATE_SCHEMA_VERSION)
    errors.push(`State schemaVersion must be ${STATE_SCHEMA_VERSION}.`);
  if (!nonnegativeInteger(value["revision"]))
    errors.push("State revision is invalid.");
  if (!timestampOrNull(value["createdAt"]) || value["createdAt"] === null)
    errors.push("State createdAt is invalid.");
  if (!timestampOrNull(value["updatedAt"]) || value["updatedAt"] === null)
    errors.push("State updatedAt is invalid.");
  if (!NEXT_ACTIONS.includes(value["nextAllowedAction"] as never))
    errors.push("State nextAllowedAction is invalid.");

  const repository = value["repository"];
  if (
    !isRecord(repository) ||
    !hasOnlyKeys(repository, [
      "root",
      "targetBranch",
      "verifiedCommit",
      "protectedFiles",
    ]) ||
    !nonEmptyString(repository["root"]) ||
    !isAbsolute(repository["root"]) ||
    !nonEmptyString(repository["targetBranch"]) ||
    !/^[a-f0-9]{40}$/.test(String(repository["verifiedCommit"])) ||
    !Array.isArray(repository["protectedFiles"]) ||
    repository["protectedFiles"].some(
      (file) =>
        !isRecord(file) ||
        !nonEmptyString(file["path"]) ||
        !/^[a-f0-9]{64}$/.test(String(file["sha256"])),
    )
  )
    errors.push("State repository identity or protected file set is invalid.");

  const milestones = value["milestones"];
  const milestoneIds: string[] = [];
  const milestoneStatuses = new Map<string, unknown>();
  if (!Array.isArray(milestones)) {
    errors.push("State milestones must be an array.");
  } else {
    for (const milestone of milestones) {
      if (!isRecord(milestone)) {
        errors.push("Milestone record is malformed.");
        continue;
      }
      const proposalResult = validateMilestoneProposal(milestone["proposal"], {
        allowLegacy: true,
      });
      if (!proposalResult.valid || !proposalResult.value) {
        errors.push(
          ...proposalResult.errors.map((error) => `State milestone: ${error}`),
        );
        continue;
      }
      milestoneIds.push(proposalResult.value.id);
      milestoneStatuses.set(proposalResult.value.id, milestone["status"]);
      if (!validProposalProvenance(milestone["proposalProvenance"]))
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid proposal provenance.`,
        );
      if (!MILESTONE_STATUSES.includes(milestone["status"] as never))
        errors.push(`Milestone ${proposalResult.value.id} has invalid status.`);
      if (
        !nonnegativeInteger(milestone["attempts"]) ||
        !nonnegativeInteger(milestone["infrastructureFailures"])
      )
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid counters.`,
        );
      if (
        milestone["workerThreadId"] !== null &&
        !nonEmptyString(milestone["workerThreadId"])
      )
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid worker thread ID.`,
        );
      if (!validWorkerLineage(milestone["workerThreadLineage"]))
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid worker thread lineage.`,
        );
      if (!validWorkerPolicy(milestone["workerPolicy"]))
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid worker model policy state.`,
        );
      if (
        validWorkerLineage(milestone["workerThreadLineage"]) &&
        validWorkerPolicy(milestone["workerPolicy"])
      ) {
        const lineage = milestone["workerThreadLineage"] as readonly Record<
          string,
          unknown
        >[];
        const workerPolicy = milestone["workerPolicy"] as Record<
          string,
          unknown
        >;
        const escalated = workerPolicy["escalated"] === true;
        if (
          (!escalated &&
            lineage.some(
              (entry) => entry["role"] === "feature-worker-escalated",
            )) ||
          (escalated && lineage.length === 0) ||
          (milestone["workerThreadId"] !== null &&
            lineage.at(-1)?.["role"] !== workerPolicy["activeRole"])
        )
          errors.push(
            `Milestone ${proposalResult.value.id} has inconsistent worker policy lineage.`,
          );
      }
      if (
        Array.isArray(milestone["workerThreadLineage"]) &&
        milestone["workerThreadId"] !==
          (
            milestone["workerThreadLineage"].at(-1) as
              Record<string, unknown> | undefined
          )?.["threadId"] &&
        milestone["workerThreadId"] !== null
      )
        errors.push(
          `Milestone ${proposalResult.value.id} active worker thread is absent from lineage.`,
        );
      if (!stringArray(milestone["reviewerThreadIds"]))
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid reviewer thread IDs.`,
        );
      const commits = milestone["commits"];
      if (
        !stringArray(commits) ||
        commits.some((commit) => !/^[a-f0-9]{40}$/.test(commit))
      )
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid commits.`,
        );
      if (!NEXT_ACTIONS.includes(milestone["nextAllowedAction"] as never))
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid next action.`,
        );
      if (
        !Array.isArray(milestone["verificationSummaries"]) ||
        milestone["verificationSummaries"].some(
          (summary) => !validVerificationSummaryEnvelope(summary),
        )
      )
        errors.push(
          `Milestone ${proposalResult.value.id} lacks verification summaries.`,
        );
      if (
        !Array.isArray(milestone["reviewerDecisions"]) ||
        milestone["reviewerDecisions"].some(
          (report) =>
            !validateReviewerReport(report, { allowLegacy: true }).valid,
        )
      )
        errors.push(
          `Milestone ${proposalResult.value.id} lacks reviewer decisions.`,
        );
      if (!Array.isArray(milestone["blockers"]))
        errors.push(
          `Milestone ${proposalResult.value.id} lacks blocker records.`,
        );
      const workspace = milestone["workspace"];
      if (
        workspace !== null &&
        (!isRecord(workspace) ||
          workspace["isolation"] !== "standalone-local-clone-branch" ||
          !nonEmptyString(workspace["path"]) ||
          !isAbsolute(workspace["path"]) ||
          !nonEmptyString(workspace["branch"]) ||
          !/^[a-f0-9]{40}$/.test(String(workspace["baseCommit"])) ||
          (workspace["headCommit"] !== null &&
            !/^[a-f0-9]{40}$/.test(String(workspace["headCommit"]))) ||
          !timestampOrNull(workspace["createdAt"]) ||
          workspace["createdAt"] === null ||
          typeof workspace["preserved"] !== "boolean" ||
          !validWorkspaceCleanup(workspace["cleanup"]) ||
          (isRecord(workspace["cleanup"]) &&
            ((workspace["cleanup"]["status"] === "deleted" &&
              workspace["preserved"] !== false) ||
              (workspace["cleanup"]["status"] !== "deleted" &&
                workspace["preserved"] !== true))))
      )
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid workspace state.`,
        );
      if (
        milestone["retryFeedback"] !== null &&
        !nonEmptyString(milestone["retryFeedback"])
      )
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid retry feedback.`,
        );
      const timestamps = milestone["timestamps"];
      if (
        !isRecord(timestamps) ||
        !timestampOrNull(timestamps["proposedAt"]) ||
        timestamps["proposedAt"] === null ||
        !timestampOrNull(timestamps["readyAt"]) ||
        !timestampOrNull(timestamps["startedAt"]) ||
        !timestampOrNull(timestamps["completedAt"]) ||
        !timestampOrNull(timestamps["updatedAt"]) ||
        timestamps["updatedAt"] === null
      )
        errors.push(
          `Milestone ${proposalResult.value.id} has invalid timestamps.`,
        );
    }
  }
  if (new Set(milestoneIds).size !== milestoneIds.length)
    errors.push("State milestone IDs must be unique.");
  if (!stringArray(value["queue"])) {
    errors.push("State queue must contain unique milestone IDs.");
  } else if (value["queue"].some((id) => !milestoneIds.includes(id))) {
    errors.push("State queue references an unknown milestone.");
  }
  if (
    value["activeMilestoneId"] !== null &&
    (!nonEmptyString(value["activeMilestoneId"]) ||
      !milestoneIds.includes(value["activeMilestoneId"]))
  )
    errors.push("State activeMilestoneId is invalid.");

  const requiredConsumer = value["requiredNextVerticalConsumer"];
  if (
    requiredConsumer !== null &&
    (!isRecord(requiredConsumer) ||
      !hasOnlyKeys(requiredConsumer, [
        "sourceMilestoneId",
        "consumerMilestoneId",
        "consumerContractSha256",
      ]) ||
      !nonEmptyString(requiredConsumer["sourceMilestoneId"]) ||
      !nonEmptyString(requiredConsumer["consumerMilestoneId"]) ||
      requiredConsumer["sourceMilestoneId"] ===
        requiredConsumer["consumerMilestoneId"] ||
      !/^[a-f0-9]{64}$/.test(
        String(requiredConsumer["consumerContractSha256"]),
      ) ||
      !milestoneIds.includes(String(requiredConsumer["sourceMilestoneId"])) ||
      milestoneStatuses.get(String(requiredConsumer["sourceMilestoneId"])) !==
        "completed" ||
      milestoneStatuses.get(String(requiredConsumer["consumerMilestoneId"])) ===
        "completed" ||
      (value["activeMilestoneId"] !== null &&
        value["activeMilestoneId"] !== requiredConsumer["consumerMilestoneId"]))
  )
    errors.push("State required vertical consumer record is invalid.");

  const run = value["run"];
  if (
    !isRecord(run) ||
    !["idle", "running", "stopped", "escalated"].includes(
      String(run["status"]),
    ) ||
    !timestampOrNull(run["startedAt"]) ||
    !timestampOrNull(run["finishedAt"]) ||
    !timestampOrNull(run["deadlineAt"]) ||
    !nonnegativeInteger(run["milestonesProcessed"]) ||
    !nonnegativeInteger(run["consecutiveInfrastructureFailures"]) ||
    !stringArray(run["plannerThreadIds"]) ||
    !Array.isArray(run["agentInvocations"]) ||
    run["agentInvocations"].some((entry) => !validAgentInvocation(entry)) ||
    (run["id"] !== null && !nonEmptyString(run["id"])) ||
    (run["stopReason"] !== null && !nonEmptyString(run["stopReason"])) ||
    (run["artifactDirectory"] !== null &&
      !nonEmptyString(run["artifactDirectory"]))
  )
    errors.push("State run record is invalid.");
  else {
    const usage = run["usage"];
    if (
      !isRecord(usage) ||
      [
        "codexInvocations",
        "inputTokens",
        "cachedInputTokens",
        "outputTokens",
        "reasoningOutputTokens",
      ].some((key) => !nonnegativeInteger(usage[key]))
    )
      errors.push("State run usage is invalid.");
  }

  const hidden = value["hiddenValidation"];
  if (
    !isRecord(hidden) ||
    !timestampOrNull(hidden["lastCheckpointAt"]) ||
    (hidden["lastMilestoneId"] !== null &&
      !nonEmptyString(hidden["lastMilestoneId"]))
  )
    errors.push("State hidden-validation checkpoint record is invalid.");

  const retention = value["evidenceRetention"];
  if (
    !isRecord(retention) ||
    !hasOnlyKeys(retention, [
      "schemaVersion",
      "initializedAt",
      "legacyRunIds",
      "lastPrunedAt",
      "lastReportPath",
    ]) ||
    retention["schemaVersion"] !== EVIDENCE_RETENTION_SCHEMA_VERSION ||
    !timestampOrNull(retention["initializedAt"]) ||
    !stringArray(retention["legacyRunIds"]) ||
    retention["legacyRunIds"].some(
      (id) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id),
    ) ||
    !timestampOrNull(retention["lastPrunedAt"]) ||
    (retention["lastReportPath"] !== null &&
      (!nonEmptyString(retention["lastReportPath"]) ||
        !isAbsolute(retention["lastReportPath"]))) ||
    (retention["initializedAt"] === null &&
      (retention["legacyRunIds"].length > 0 ||
        retention["lastPrunedAt"] !== null ||
        retention["lastReportPath"] !== null))
  )
    errors.push("State evidence-retention record is invalid.");

  const controllerHistory = value["controllerHistory"];
  const archiveIds = new Set<string>();
  if (
    !Array.isArray(controllerHistory) ||
    controllerHistory.some((archive) => !validControllerArchive(archive))
  ) {
    errors.push("State controller boundary history is invalid.");
  } else {
    for (const archive of controllerHistory) {
      const id = String((archive as Record<string, unknown>)["id"]);
      if (archiveIds.has(id))
        errors.push("State controller boundary archive IDs must be unique.");
      archiveIds.add(id);
    }
  }

  const reconciliation = value["reconciliation"];
  if (
    !isRecord(reconciliation) ||
    !hasOnlyKeys(reconciliation, ["active", "history"]) ||
    !("active" in reconciliation) ||
    !("history" in reconciliation) ||
    !Array.isArray(reconciliation["history"]) ||
    reconciliation["history"].some(
      (record) =>
        !validReconciliationRecord(record) || record.status === "active",
    ) ||
    !(
      reconciliation["active"] === null ||
      (validReconciliationRecord(reconciliation["active"]) &&
        reconciliation["active"].status === "active")
    )
  ) {
    errors.push("State reconciliation record is invalid.");
  } else {
    const records = [
      ...reconciliation["history"],
      ...(reconciliation["active"] ? [reconciliation["active"]] : []),
    ] as ReconciliationRecord[];
    if (new Set(records.map((record) => record.id)).size !== records.length)
      errors.push("State reconciliation IDs must be unique.");
    if (
      records.some(
        (record) =>
          !archiveIds.has(record.sourceArchiveId) ||
          record.sourceState.path !==
            (
              controllerHistory as unknown as {
                id: string;
                rawSourceState: { path: string };
              }[]
            ).find((archive) => archive.id === record.sourceArchiveId)
              ?.rawSourceState.path,
      )
    )
      errors.push("State reconciliation source archive reference is invalid.");
    if (
      reconciliation["active"] !== null &&
      value["nextAllowedAction"] !== "reconcile"
    )
      errors.push(
        "An active reconciliation must exclusively own the next action.",
      );
  }

  const pendingOperation = value["pendingOperation"];
  if (
    pendingOperation !== null &&
    !validWorkspaceCreateOperation(pendingOperation) &&
    !validTargetIntegrateOperation(pendingOperation) &&
    !validWorkspaceCleanupOperation(pendingOperation)
  ) {
    errors.push("State pending operation is invalid.");
  } else if (isRecord(pendingOperation)) {
    const milestone = Array.isArray(milestones)
      ? milestones.find(
          (entry) =>
            isRecord(entry) &&
            isRecord(entry["proposal"]) &&
            entry["proposal"]["id"] === pendingOperation["milestoneId"],
        )
      : undefined;
    const commonMismatch =
      !isRecord(milestone) ||
      milestone["attempts"] !== pendingOperation["attempt"] ||
      !isRecord(repository) ||
      repository["root"] !== pendingOperation["repositoryRoot"] ||
      repository["targetBranch"] !== pendingOperation["targetBranch"] ||
      !isRecord(run) ||
      run["id"] !== pendingOperation["runId"] ||
      Number(pendingOperation["inputStateRevision"]) >
        Number(value["revision"]);
    if (commonMismatch) {
      errors.push("State pending operation does not match its active attempt.");
    } else if (pendingOperation["kind"] === "workspace-create") {
      if (
        value["activeMilestoneId"] !== pendingOperation["milestoneId"] ||
        milestone["status"] !== "running" ||
        milestone["workspace"] !== null ||
        milestone["nextAllowedAction"] !== "resume-worker" ||
        value["nextAllowedAction"] !== "resume-worker" ||
        repository["verifiedCommit"] !== pendingOperation["baseCommit"]
      )
        errors.push(
          "State workspace-create operation does not match its active attempt.",
        );
    } else if (pendingOperation["kind"] === "target-integrate") {
      const workspace = milestone["workspace"];
      const summaries = milestone["verificationSummaries"];
      const reviews = milestone["reviewerDecisions"];
      const verification = Array.isArray(summaries) ? summaries.at(-1) : null;
      const review = Array.isArray(reviews) ? reviews.at(-1) : null;
      const candidate = pendingOperation["candidate"];
      const checks = isRecord(review) ? review["checks"] : null;
      const findings = isRecord(review) ? review["findings"] : null;
      if (
        value["activeMilestoneId"] !== pendingOperation["milestoneId"] ||
        milestone["status"] !== "reviewing" ||
        milestone["nextAllowedAction"] !== "review" ||
        value["nextAllowedAction"] !== "review" ||
        run["status"] !== "running" ||
        repository["verifiedCommit"] !==
          pendingOperation["expectedBaseCommit"] ||
        !isRecord(workspace) ||
        workspace["path"] !== pendingOperation["workspacePath"] ||
        workspace["branch"] !== pendingOperation["workspaceBranch"] ||
        workspace["baseCommit"] !== pendingOperation["expectedBaseCommit"] ||
        !isRecord(candidate) ||
        workspace["headCommit"] !== candidate["commit"] ||
        !isRecord(verification) ||
        verification["status"] !== "PASS" ||
        JSON.stringify(verification["candidate"]) !==
          JSON.stringify(candidate) ||
        verification["authoritativeResultSha256"] !==
          pendingOperation["verificationResultSha256"] ||
        !isRecord(review) ||
        review["schemaVersion"] !== REVIEW_SCHEMA_VERSION ||
        review["decision"] !== "approve" ||
        !isRecord(checks) ||
        Object.values(checks).some((check) => check !== true) ||
        !Array.isArray(findings) ||
        findings.some(
          (finding) =>
            isRecord(finding) &&
            (finding["severity"] === "high" ||
              finding["severity"] === "critical"),
        ) ||
        review["verifiedBaseCommit"] !==
          pendingOperation["expectedBaseCommit"] ||
        review["verifiedHeadCommit"] !== candidate["commit"] ||
        review["verifiedTree"] !== candidate["tree"] ||
        review["verificationResultSha256"] !==
          pendingOperation["verificationResultSha256"] ||
        review["attempt"] !== pendingOperation["attempt"]
      )
        errors.push(
          "State target-integrate operation does not match its approved attempt.",
        );
    } else if (pendingOperation["kind"] === "workspace-cleanup") {
      const workspace = milestone["workspace"];
      const cleanup = isRecord(workspace) ? workspace["cleanup"] : null;
      const reason = pendingOperation["reason"];
      const completedReason =
        reason === "completed-delete-workspace" ||
        reason === "completed-preserve-workspace";
      const failedReason =
        reason === "failed-delete-after-diagnostics" ||
        reason === "failed-preserve-workspace";
      if (
        (milestone["status"] === "completed" && !completedReason) ||
        (milestone["status"] === "escalated" && !failedReason) ||
        (milestone["status"] !== "completed" &&
          milestone["status"] !== "escalated") ||
        !isRecord(workspace) ||
        workspace["path"] !== pendingOperation["workspacePath"] ||
        workspace["branch"] !== pendingOperation["workspaceBranch"] ||
        workspace["baseCommit"] !== pendingOperation["workspaceBaseCommit"] ||
        workspace["headCommit"] !== pendingOperation["recordedHeadCommit"] ||
        workspace["createdAt"] !== pendingOperation["workspaceCreatedAt"] ||
        !isRecord(cleanup) ||
        cleanup["status"] !== "pending" ||
        cleanup["reason"] !== reason ||
        cleanup["requestedAt"] !== pendingOperation["requestedAt"] ||
        cleanup["completedAt"] !== null ||
        cleanup["nodeModulesRemovedAt"] !== null ||
        cleanup["diagnosticArchivePath"] !==
          pendingOperation["diagnosticArchivePath"] ||
        cleanup["error"] !== null ||
        repository["verifiedCommit"] !== pendingOperation["verifiedCommit"] ||
        run["artifactDirectory"] !== pendingOperation["runArtifactDirectory"]
      )
        errors.push(
          "State workspace-cleanup operation does not match its terminal workspace.",
        );
    }
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? (value as unknown as OrchestratorState) : null,
    errors,
  };
}

export function assertOrchestratorState(value: unknown): OrchestratorState {
  const result = validateOrchestratorState(value);
  if (!result.valid || !result.value)
    throw new Error(`Invalid orchestrator state: ${result.errors.join(" ")}`);
  return result.value;
}

function validation<T>(
  value: unknown,
  errors: readonly string[],
): ValidationResult<T> {
  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? (value as T) : null,
    errors,
  };
}

function commitId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function validateVerificationManifest(
  value: unknown,
): ValidationResult<VerificationManifest> {
  const errors: string[] = [];
  if (!isRecord(value))
    return validation(value, ["Manifest must be an object."]);
  const requiredKeys = [
    "schemaVersion",
    "milestoneId",
    "objective",
    "exclusions",
    "baseCommit",
    "d031BaselineCommit",
    "focusedCommands",
    "requiredProtectedPaths",
    "requiredInvariantSuiteId",
    "requiredBenchmarkMatrixId",
    "requiredReconciliationReviewChecks",
    "expectedArtifactKinds",
    "authorityChanges",
    "nextProposalPath",
    "finalExactVerification",
  ] as const;
  if (
    !hasOnlyKeys(value, requiredKeys) ||
    requiredKeys.some((key) => !(key in value))
  )
    errors.push("Manifest keys do not match verification-manifest.v1.");
  if (value["schemaVersion"] !== VERIFICATION_MANIFEST_SCHEMA_VERSION)
    errors.push("Manifest schemaVersion is invalid.");
  if (value["milestoneId"] !== "d032-loop-efficiency-recommissioning")
    errors.push("Manifest milestoneId is invalid.");
  if (
    !nonEmptyString(value["objective"]) ||
    !stringArray(value["exclusions"], 1)
  )
    errors.push("Manifest objective or exclusions are invalid.");
  if (!commitId(value["baseCommit"]) || !commitId(value["d031BaselineCommit"]))
    errors.push("Manifest commit identities are invalid.");
  for (const key of [
    "requiredProtectedPaths",
    "requiredReconciliationReviewChecks",
    "expectedArtifactKinds",
  ] as const) {
    if (!stringArray(value[key], 1)) errors.push(`Manifest ${key} is invalid.`);
  }
  if (
    Array.isArray(value["requiredReconciliationReviewChecks"]) &&
    (value["requiredReconciliationReviewChecks"].length !==
      RECONCILIATION_REVIEW_CHECK_IDS.length ||
      value["requiredReconciliationReviewChecks"].some(
        (check, index) => check !== RECONCILIATION_REVIEW_CHECK_IDS[index],
      ))
  )
    errors.push(
      "Manifest reconciliation-review checks do not match the commissioned review surface.",
    );
  if (
    !nonEmptyString(value["requiredInvariantSuiteId"]) ||
    !nonEmptyString(value["requiredBenchmarkMatrixId"])
  )
    errors.push("Manifest registry identities are invalid.");
  if (value["nextProposalPath"] !== ".agent/next-milestone.json")
    errors.push("Manifest next-proposal path is invalid.");

  const commands = value["focusedCommands"];
  if (!Array.isArray(commands) || commands.length === 0) {
    errors.push("Manifest focusedCommands must be non-empty.");
  } else {
    const ids = new Set<string>();
    for (const command of commands) {
      if (
        !isRecord(command) ||
        !hasOnlyKeys(command, [
          "id",
          "argv",
          "tiers",
          "expectedArtifactKinds",
        ]) ||
        !nonEmptyString(command["id"]) ||
        ids.has(String(command["id"])) ||
        !stringArray(command["argv"], 2) ||
        !["pnpm", "node", "git"].includes(String(command["argv"]?.[0])) ||
        !stringArray(command["tiers"], 1) ||
        command["tiers"].some(
          (tier) =>
            tier === "periodic" || !VERIFICATION_TIERS.includes(tier as never),
        ) ||
        !stringArray(command["expectedArtifactKinds"], 1)
      ) {
        errors.push("Manifest contains an invalid focused command.");
        continue;
      }
      ids.add(command["id"]);
    }
  }

  const authority = value["authorityChanges"];
  if (
    !isRecord(authority) ||
    !hasOnlyKeys(authority, [
      "readinessStagesChanged",
      "acceptanceChanged",
      "defaultProfileChanged",
      "exactVerifyCommandChanged",
    ]) ||
    Object.values(authority).some((changed) => changed !== false)
  )
    errors.push("Manifest attempts to change an authoritative boundary.");

  const exact = value["finalExactVerification"];
  if (
    !isRecord(exact) ||
    !hasOnlyKeys(exact, [
      "argv",
      "requiresNoArguments",
      "profileId",
      "selectedByOverride",
    ]) ||
    !Array.isArray(exact["argv"]) ||
    exact["argv"].length !== 2 ||
    exact["argv"][0] !== "pnpm" ||
    exact["argv"][1] !== "verify" ||
    exact["requiresNoArguments"] !== true ||
    exact["profileId"] !== "readiness" ||
    exact["selectedByOverride"] !== false
  )
    errors.push(
      "Manifest exact verification must be literal no-argument pnpm verify.",
    );

  return validation(value, errors);
}

export function assertVerificationManifest(
  value: unknown,
): VerificationManifest {
  const result = validateVerificationManifest(value);
  if (!result.valid || !result.value)
    throw new Error(
      `Invalid verification manifest: ${result.errors.join(" ")}`,
    );
  return result.value;
}

export function validateInvariantSuiteRegistry(
  value: unknown,
): ValidationResult<InvariantSuiteRegistry> {
  const errors: string[] = [];
  if (!isRecord(value))
    return validation(value, ["Invariant registry must be an object."]);
  if (
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "warmRuntimeTargetMs",
      "serial",
      "entries",
    ]) ||
    value["schemaVersion"] !== "1.0.0" ||
    !nonEmptyString(value["id"]) ||
    !positiveInteger(value["warmRuntimeTargetMs"]) ||
    value["serial"] !== true ||
    !Array.isArray(value["entries"]) ||
    value["entries"].length === 0
  )
    errors.push("Invariant registry header is invalid.");
  const ids = new Set<string>();
  for (const entry of Array.isArray(value["entries"]) ? value["entries"] : []) {
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, [
        "id",
        "ownerPaths",
        "triggerPaths",
        "testFile",
        "testTitle",
        "argv",
        "expectedArtifactKinds",
      ]) ||
      !nonEmptyString(entry["id"]) ||
      ids.has(String(entry["id"])) ||
      !stringArray(entry["ownerPaths"], 1) ||
      entry["ownerPaths"].some((path) => !safeRelativePath(path)) ||
      !stringArray(entry["triggerPaths"], 1) ||
      entry["triggerPaths"].some((path) => !safeRelativePath(path)) ||
      !stringArray(entry["argv"], 2) ||
      !["pnpm", "node", "git"].includes(String(entry["argv"]?.[0])) ||
      !stringArray(entry["expectedArtifactKinds"], 1) ||
      (entry["testFile"] === undefined) !==
        (entry["testTitle"] === undefined) ||
      (entry["testFile"] !== undefined &&
        (!safeRelativePath(entry["testFile"]) ||
          !nonEmptyString(entry["testTitle"])))
    ) {
      errors.push("Invariant registry contains an invalid entry.");
      continue;
    }
    ids.add(entry["id"]);
  }
  return validation(value, errors);
}

export function assertInvariantSuiteRegistry(
  value: unknown,
): InvariantSuiteRegistry {
  const result = validateInvariantSuiteRegistry(value);
  if (!result.valid || !result.value)
    throw new Error(
      `Invalid invariant suite registry: ${result.errors.join(" ")}`,
    );
  return result.value;
}

export function validateSlowSuiteRegistry(
  value: unknown,
): ValidationResult<SlowSuiteRegistry> {
  const errors: string[] = [];
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["schemaVersion", "id", "files"]) ||
    value["schemaVersion"] !== "1.0.0" ||
    !nonEmptyString(value["id"]) ||
    !stringArray(value["files"], 1) ||
    value["files"].some(
      (path) => !safeRelativePath(path) || !path.endsWith(".test.ts"),
    )
  )
    errors.push("Slow-suite registry is invalid.");
  return validation(value, errors);
}

export function assertSlowSuiteRegistry(value: unknown): SlowSuiteRegistry {
  const result = validateSlowSuiteRegistry(value);
  if (!result.valid || !result.value)
    throw new Error(`Invalid slow-suite registry: ${result.errors.join(" ")}`);
  return result.value;
}

export function validateVerificationScopePolicy(
  value: unknown,
): ValidationResult<VerificationScopePolicy> {
  const errors: string[] = [];
  if (!isRecord(value))
    return validation(value, ["Verification scope policy must be an object."]);
  const triggerClasses = value["triggerClasses"];
  const broad = value["broadTriggerClasses"];
  const checks = value["mandatoryChecks"];
  const workspaceChecks = value["workspaceChecks"];
  const graduation = value["graduation"];
  if (
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "mode",
      "unknownDisposition",
      "closureSuppressionAllowed",
      "browserHostScriptPatterns",
      "triggerClasses",
      "broadTriggerClasses",
      "mandatoryChecks",
      "workspaceChecks",
      "graduation",
    ]) ||
    value["schemaVersion"] !== "1.0.0" ||
    !nonEmptyString(value["id"]) ||
    value["mode"] !== "shadow-only" ||
    value["unknownDisposition"] !== "fail-broad" ||
    value["closureSuppressionAllowed"] !== false ||
    !validRegexSourceArray(value["browserHostScriptPatterns"]) ||
    !stringArray(triggerClasses, SCOPE_TRIGGER_CLASSES.length) ||
    triggerClasses.length !== SCOPE_TRIGGER_CLASSES.length ||
    triggerClasses.some(
      (item, index) => item !== SCOPE_TRIGGER_CLASSES[index],
    ) ||
    !stringArray(broad, 1) ||
    broad.some((item) => !triggerClasses.includes(item)) ||
    !isRecord(checks) ||
    !hasOnlyKeys(checks, SCOPE_TRIGGER_CLASSES) ||
    triggerClasses.some((item) => !stringArray(checks[item], 1)) ||
    !isRecord(workspaceChecks) ||
    Object.keys(workspaceChecks).length === 0 ||
    Object.entries(workspaceChecks).some(
      ([name, mappedChecks]) =>
        !nonEmptyString(name) || !stringArray(mappedChecks, 1),
    )
  )
    errors.push(
      "Verification scope policy header or trigger mapping is invalid.",
    );
  if (
    !isRecord(graduation) ||
    !hasOnlyKeys(graduation, [
      "deferred",
      "minimumComparisons",
      "minimumExamplesPerTrigger",
      "requiresZeroFalseNegatives",
      "requiresZeroUnknowns",
      "requiresDeterministicRecommendations",
      "requiresMeasuredSavingsAboveNoise",
      "requiresNoClosureRegression",
      "requiresIndependentReview",
      "requiresExplicitPolicyChange",
    ]) ||
    graduation["deferred"] !== true ||
    !positiveInteger(graduation["minimumComparisons"]) ||
    !positiveInteger(graduation["minimumExamplesPerTrigger"]) ||
    graduation["requiresZeroFalseNegatives"] !== true ||
    graduation["requiresZeroUnknowns"] !== true ||
    graduation["requiresDeterministicRecommendations"] !== true ||
    graduation["requiresMeasuredSavingsAboveNoise"] !== true ||
    graduation["requiresNoClosureRegression"] !== true ||
    graduation["requiresIndependentReview"] !== true ||
    graduation["requiresExplicitPolicyChange"] !== true
  )
    errors.push(
      "Verification scope policy graduation remains insufficiently guarded.",
    );
  return validation(value, errors);
}

export function assertVerificationScopePolicy(
  value: unknown,
): VerificationScopePolicy {
  const result = validateVerificationScopePolicy(value);
  if (!result.valid || !result.value)
    throw new Error(
      `Invalid verification scope policy: ${result.errors.join(" ")}`,
    );
  return result.value;
}

export function validateVerificationTierResult(
  value: unknown,
): ValidationResult<VerificationTierResult> {
  const errors: string[] = [];
  if (!isRecord(value))
    return validation(value, ["Verification tier result must be an object."]);
  const resultKeys = [
    "schemaVersion",
    "runId",
    "tier",
    "status",
    "exitCode",
    "authoritative",
    "candidate",
    "changedPaths",
    "invariantSuiteId",
    "invariantSuiteSha256",
    "scopePolicySha256",
    "shadowSelectionPath",
    "selectedCheckIds",
    "actualCheckIds",
    "fullClosureCheckIds",
    "commands",
    "exactVerification",
    "candidateFinal",
    "identityDrift",
    "reviewRequired",
    "telemetryManifestPath",
    "startedAt",
    "finishedAt",
    "durationMs",
  ] as const;
  const candidate = value["candidate"];
  const candidateFinal = value["candidateFinal"];
  const identityDrift = value["identityDrift"];
  const validStatus = ["PASS", "NOT_READY", "FAIL", "ERROR"].includes(
    String(value["status"]),
  );
  const candidateShape = (record: unknown): record is Record<string, unknown> =>
    isRecord(record) &&
    hasOnlyKeys(record, [
      "baseCommit",
      "gitCommit",
      "gitTree",
      "workingTreeDirty",
    ]) &&
    commitId(record["baseCommit"]) &&
    commitId(record["gitCommit"]) &&
    commitId(record["gitTree"]) &&
    typeof record["workingTreeDirty"] === "boolean";
  if (
    !hasOnlyKeys(value, resultKeys) ||
    resultKeys.some((key) => !(key in value)) ||
    value["schemaVersion"] !== VERIFICATION_TIER_SCHEMA_VERSION ||
    !nonEmptyString(value["runId"]) ||
    !VERIFICATION_TIERS.includes(value["tier"] as never) ||
    !validStatus ||
    ![0, 1, 2, 3].includes(Number(value["exitCode"])) ||
    value["authoritative"] !== false ||
    !candidateShape(candidate) ||
    !candidateShape(candidateFinal) ||
    !isRecord(identityDrift) ||
    !hasOnlyKeys(identityDrift, ["detected", "fields"]) ||
    typeof identityDrift["detected"] !== "boolean" ||
    !stringArray(identityDrift["fields"]) ||
    (identityDrift["detected"] === false &&
      (identityDrift["fields"] as readonly string[]).length !== 0) ||
    (identityDrift["detected"] === true &&
      (identityDrift["fields"] as readonly string[]).length === 0) ||
    !stringArray(value["changedPaths"]) ||
    !nonEmptyString(value["invariantSuiteId"]) ||
    !sha256(value["invariantSuiteSha256"]) ||
    !sha256(value["scopePolicySha256"]) ||
    !stringArray(value["selectedCheckIds"]) ||
    !stringArray(value["actualCheckIds"]) ||
    !stringArray(value["fullClosureCheckIds"]) ||
    !Array.isArray(value["commands"]) ||
    (value["shadowSelectionPath"] !== null &&
      !nonEmptyString(value["shadowSelectionPath"])) ||
    (value["telemetryManifestPath"] !== null &&
      !nonEmptyString(value["telemetryManifestPath"])) ||
    typeof value["reviewRequired"] !== "boolean" ||
    !timestampOrNull(value["startedAt"]) ||
    value["startedAt"] === null ||
    !timestampOrNull(value["finishedAt"]) ||
    value["finishedAt"] === null ||
    !nonnegativeInteger(value["durationMs"])
  )
    errors.push("Verification tier result is malformed or claims authority.");
  const expectedExit =
    value["status"] === "PASS"
      ? 0
      : value["status"] === "NOT_READY"
        ? 2
        : value["status"] === "FAIL"
          ? 1
          : 3;
  if (value["exitCode"] !== expectedExit)
    errors.push("Verification tier status and exit code disagree.");
  if (
    (value["tier"] === "iteration" || value["tier"] === "candidate") &&
    (value["status"] === "NOT_READY" || value["exitCode"] === 2)
  )
    errors.push(
      "Iteration and candidate tiers cannot report NOT_READY exit 2.",
    );
  if (value["reviewRequired"] !== (value["tier"] === "milestone"))
    errors.push("Only milestone verification can require independent review.");
  if (
    isRecord(identityDrift) &&
    identityDrift["detected"] === true &&
    (value["status"] !== "ERROR" || value["exitCode"] !== 3)
  )
    errors.push(
      "Tier candidate identity drift must report status ERROR exit 3.",
    );
  if (
    isRecord(identityDrift) &&
    identityDrift["detected"] === false &&
    isRecord(candidate) &&
    isRecord(candidateFinal) &&
    ["baseCommit", "gitCommit", "gitTree", "workingTreeDirty"].some(
      (key) => candidate[key] !== candidateFinal[key],
    )
  )
    errors.push(
      "Tier candidateFinal must equal candidate when no drift is reported.",
    );

  const countsValid = (counts: unknown): boolean =>
    isRecord(counts) &&
    hasOnlyKeys(counts, ["total", "passed", "failed", "skipped"]) &&
    ["total", "passed", "failed", "skipped"].every((key) =>
      nonnegativeInteger(counts[key]),
    );
  const commandIds = new Set<string>();
  for (const command of Array.isArray(value["commands"])
    ? value["commands"]
    : []) {
    const commandKeys = [
      "id",
      "argv",
      "status",
      "exitCode",
      "signal",
      "startedAt",
      "finishedAt",
      "durationMs",
      "stdoutPath",
      "stderrPath",
      "receipt",
      "receiptAbsenceReason",
      "artifactCount",
      "artifactBytes",
      "testCounts",
      "failureClass",
      "message",
    ] as const;
    if (!isRecord(command)) {
      errors.push("Verification tier contains a non-object command record.");
      continue;
    }
    const receipt = command["receipt"];
    const testCounts = command["testCounts"];
    const validReceipt =
      receipt === null ||
      (isRecord(receipt) &&
        hasOnlyKeys(receipt, ["path", "sha256", "bytes"]) &&
        nonEmptyString(receipt["path"]) &&
        sha256(receipt["sha256"]) &&
        positiveInteger(receipt["bytes"]));
    const validTestCounts =
      testCounts === null ||
      (isRecord(testCounts) &&
        hasOnlyKeys(testCounts, ["suites", "tests"]) &&
        countsValid(testCounts["suites"]) &&
        countsValid(testCounts["tests"]));
    if (
      !hasOnlyKeys(command, commandKeys) ||
      commandKeys.some((key) => !(key in command)) ||
      !nonEmptyString(command["id"]) ||
      commandIds.has(String(command["id"])) ||
      !stringArray(command["argv"], 2) ||
      !["PASS", "NOT_READY", "FAIL", "ERROR", "TIMEOUT"].includes(
        String(command["status"]),
      ) ||
      (command["exitCode"] !== null &&
        !Number.isSafeInteger(command["exitCode"])) ||
      (command["signal"] !== null && !nonEmptyString(command["signal"])) ||
      !timestampOrNull(command["startedAt"]) ||
      command["startedAt"] === null ||
      !timestampOrNull(command["finishedAt"]) ||
      command["finishedAt"] === null ||
      !nonnegativeInteger(command["durationMs"]) ||
      !nonEmptyString(command["stdoutPath"]) ||
      !nonEmptyString(command["stderrPath"]) ||
      !validReceipt ||
      !validTestCounts ||
      !nonnegativeInteger(command["artifactCount"]) ||
      !nonnegativeInteger(command["artifactBytes"]) ||
      ![null, "product", "infrastructure"].includes(
        command["failureClass"] as never,
      ) ||
      !nonEmptyString(command["message"]) ||
      (receipt === null && !nonEmptyString(command["receiptAbsenceReason"])) ||
      (receipt !== null && command["receiptAbsenceReason"] !== null)
    ) {
      errors.push("Verification tier contains a malformed command record.");
      continue;
    }
    commandIds.add(command["id"]);
  }

  const exact = value["exactVerification"];
  if (exact !== null) {
    const exactKeys = [
      "invokedWithNoArguments",
      "resultPath",
      "resultSha256",
      "status",
      "exitCode",
      "disposition",
      "profileId",
      "selectedByOverride",
      "candidateCommit",
      "candidateTree",
    ] as const;
    if (
      !isRecord(exact) ||
      !hasOnlyKeys(exact, exactKeys) ||
      exactKeys.some((key) => !(key in exact)) ||
      exact["invokedWithNoArguments"] !== true ||
      !nonEmptyString(exact["resultPath"]) ||
      !sha256(exact["resultSha256"]) ||
      (exact["status"] !== "PASS" && exact["status"] !== "NOT_READY") ||
      exact["exitCode"] !== (exact["status"] === "PASS" ? 0 : 2) ||
      exact["disposition"] !==
        (exact["status"] === "PASS"
          ? "completion-eligible"
          : "incremental-readiness") ||
      exact["profileId"] !== "readiness" ||
      exact["selectedByOverride"] !== false ||
      !commitId(exact["candidateCommit"]) ||
      !commitId(exact["candidateTree"]) ||
      (isRecord(candidate) &&
        (exact["candidateCommit"] !== candidate["gitCommit"] ||
          exact["candidateTree"] !== candidate["gitTree"]))
    )
      errors.push("Verification tier exact-readiness index is malformed.");
  }
  if (
    value["status"] === "NOT_READY" &&
    (!isRecord(exact) || exact["status"] !== "NOT_READY")
  )
    errors.push("Tier NOT_READY must be linked to exact readiness NOT_READY.");
  return validation(value, errors);
}

export function assertVerificationTierResult(
  value: unknown,
): VerificationTierResult {
  const result = validateVerificationTierResult(value);
  if (!result.valid || !result.value)
    throw new Error(
      `Invalid verification tier result: ${result.errors.join(" ")}`,
    );
  return result.value;
}
