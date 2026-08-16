import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

import { DEFAULT_CONFIG_PATH, loadConfigForInspection } from "./config.js";
import type {
  ExecutionProviderIdentity,
  MilestoneRecord,
  OrchestratorState,
  ReconciliationRecord,
  VerificationSummary,
  WorkspaceCleanupRecord,
} from "./contracts.js";
import {
  runDoctorDiagnostic,
  type DoctorDiagnostic,
  type DoctorIssue,
} from "./doctor.js";
import {
  MilestoneOrchestrator,
  stateStatusSummary,
  type OrchestratorInspection,
} from "./orchestrator.js";

export const STATUS_SCHEMA_VERSION = "1.0.0" as const;

export type TargetRelation =
  | "current"
  | "ahead"
  | "behind"
  | "divergent"
  | "uninitialized"
  | "unavailable";

export type RecoveryDisposition = "none" | "automatic" | "blocked" | "external";

export interface StatusDependencies {
  readonly doctorProbe?: (input: {
    readonly repositoryRoot: string;
    readonly configPath?: string;
  }) => Promise<DoctorDiagnostic>;
  readonly inspectionProbe?: (
    repositoryRoot: string,
    configPath?: string,
  ) => Promise<OrchestratorInspection>;
  readonly configuredTargetBranchProbe?: (
    repositoryRoot: string,
    configPath?: string,
  ) => Promise<string | null>;
  readonly targetHeadProbe?: (
    repositoryRoot: string,
    targetBranch: string,
  ) => string | null;
  readonly targetRelationProbe?: (
    repositoryRoot: string,
    targetHead: string | null,
    verifiedCommit: string | null,
  ) => TargetRelation;
}

interface StatusPendingOperation {
  readonly id: string;
  readonly kind:
    | "workspace-create"
    | "target-integrate"
    | "workspace-cleanup"
    | "retention-apply";
  readonly phase: string;
  readonly recovery: {
    readonly disposition: "automatic" | "blocked";
    readonly classification: string;
    readonly nextSafeAction: string;
    readonly message: string;
    readonly preservedPaths: readonly string[];
  };
}

interface StatusCommissioning {
  readonly status: "pass" | "warning" | "block";
  readonly code: string;
  readonly valid: boolean;
  readonly message: string;
  readonly remediation: string | null;
  readonly record: {
    readonly manifest: {
      readonly path: string;
      readonly bytes: number;
      readonly sha256: string;
    };
    readonly targetBranch: string;
    readonly baseCommit: string;
    readonly headCommit: string;
    readonly headTree: string;
    readonly profile: "bootstrap" | "readiness";
    readonly immutableContractLockSha256: string;
    readonly invariantSuiteId: string;
    readonly scopePolicyId: string;
    readonly tierPlans: readonly {
      readonly tier: "iteration" | "candidate" | "milestone" | "periodic";
      readonly commandCount: number;
      readonly exactVerificationIncluded: boolean;
    }[];
  } | null;
}

interface StatusLatestCompletedMilestone {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string;
  readonly attempts: number;
  readonly commits: readonly string[];
}

interface StatusExactStateRecord {
  readonly milestoneId: string;
  readonly attempt: number;
  readonly finishedAt: string;
}

interface StatusReconciliation {
  readonly id: string;
  readonly status: ReconciliationRecord["status"];
  readonly phase: ReconciliationRecord["phase"];
  readonly sourceVerifiedCommit: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly externalGapReason: string;
  readonly currentPhaseAt: string;
  readonly failure: ReconciliationRecord["failure"];
}

interface SnapshotResult {
  readonly doctor: DoctorDiagnostic;
  readonly inspection: OrchestratorInspection | null;
  readonly consistency: "stable" | "unavailable" | "changed-during-inspection";
  readonly attempts: number;
  readonly configuredTargetBranch: string | null;
  readonly targetBranch: string | null;
  readonly targetHead: string | null;
}

export interface StatusDiagnostic {
  readonly schemaVersion: typeof STATUS_SCHEMA_VERSION;
  readonly diagnostic: "orchestrator-status";
  readonly readOnly: true;
  readonly networkCallsPerformed: 0;
  readonly snapshot: {
    readonly consistency: SnapshotResult["consistency"];
    readonly attempts: number;
    readonly canonicalGeneration: string | null;
  };
  readonly operational: {
    readonly status: DoctorDiagnostic["status"];
    readonly summary: DoctorDiagnostic["summary"];
    readonly issues: readonly DoctorIssue[];
  };
  readonly commissioning: StatusCommissioning;
  readonly profile: "bootstrap" | "readiness" | null;
  readonly target: {
    readonly branch: string | null;
    readonly branchSources: {
      readonly configured: string | null;
      readonly commissioned: string | null;
      readonly state: string | null;
    };
    readonly head: string | null;
    readonly checkoutHead: string | null;
    readonly checkoutMatchesTarget: boolean | null;
    readonly verifiedCommit: string | null;
    readonly relation: TargetRelation;
    readonly relationMeaning: string;
  };
  readonly controller: {
    readonly available: boolean;
    readonly initialized: boolean | null;
    readonly stateStorage:
      | OrchestratorInspection["stateStorage"]
      | {
          readonly reference: string;
          readonly canonicalGeneration: string | null;
          readonly revision: null;
          readonly source: string;
          readonly mirror: string;
        };
    readonly protectedIntegrity:
      | OrchestratorInspection["protectedIntegrity"]
      | DoctorDiagnostic["checks"]["state"]["protectedIntegrity"];
    readonly state: unknown;
    readonly nextAllowedAction: OrchestratorState["nextAllowedAction"] | null;
  };
  readonly lease: {
    readonly status: "pass" | "warning" | "block";
    readonly code: string;
    readonly message: string;
    readonly reference: string;
    readonly legacyGuard: string;
    readonly present: boolean;
    readonly malformed: boolean;
    readonly owner: DoctorDiagnostic["checks"]["controllerLease"]["owner"];
  };
  readonly pendingOperation: StatusPendingOperation | null;
  readonly recovery: {
    readonly disposition: RecoveryDisposition;
    readonly reason: string;
    readonly command: string | null;
  };
  readonly latestCompletedMilestone: StatusLatestCompletedMilestone | null;
  readonly latestExactVerification: {
    readonly status: "pass" | "warning" | "block";
    readonly code: string;
    readonly message: string;
    readonly available: boolean;
    readonly runId: string | null;
    readonly resultPath: string | null;
    readonly resultSha256: string | null;
    readonly resultHashMatches: boolean | null;
    readonly profile: "bootstrap" | "readiness" | null;
    readonly candidateCommit: string | null;
    readonly current: boolean;
    readonly verificationStatus: "PASS" | "NOT_READY" | null;
    readonly completionEligible: boolean;
    readonly autonomousReadinessEquivalent: boolean;
    readonly executionProvider: ExecutionProviderIdentity | null;
    readonly providerMatchesCurrent: boolean | null;
    readonly stateRecord: StatusExactStateRecord | null;
    readonly stateRecordMatches: boolean | null;
  };
  readonly trustedExecution: {
    readonly status: "pass" | "warning" | "block";
    readonly code: string;
    readonly configuredProvider:
      "trusted-container" | "unsafe-local-diagnostic" | null;
    readonly available: boolean;
    readonly completionEligible: boolean;
    readonly identity: ExecutionProviderIdentity | null;
  };
  readonly autonomousIntegration: {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
  readonly deferred: {
    readonly workspaceCleanups: readonly {
      readonly milestoneId: string;
      readonly workspace: string;
      readonly cleanup: WorkspaceCleanupRecord;
    }[];
    readonly reconciliation: {
      readonly active: StatusReconciliation | null;
      readonly latest: StatusReconciliation | null;
    };
  };
  readonly nextAction: {
    readonly command: string | null;
    readonly reason: string;
  };
}

function runGit(
  repositoryRoot: string,
  args: readonly string[],
): { readonly status: number | null; readonly stdout: string } {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    windowsHide: true,
  });
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout.trim(),
  };
}

function commitExists(repositoryRoot: string, commit: string): boolean {
  return (
    runGit(repositoryRoot, ["cat-file", "-e", `${commit}^{commit}`]).status ===
    0
  );
}

function isAncestor(
  repositoryRoot: string,
  ancestor: string,
  descendant: string,
): boolean | null {
  const status = runGit(repositoryRoot, [
    "merge-base",
    "--is-ancestor",
    ancestor,
    descendant,
  ]).status;
  return status === 0 ? true : status === 1 ? false : null;
}

export function classifyTargetRelation(
  repositoryRoot: string,
  targetHead: string | null,
  verifiedCommit: string | null,
): TargetRelation {
  if (verifiedCommit === null) return "uninitialized";
  if (targetHead === null) return "unavailable";
  if (targetHead === verifiedCommit) return "current";
  if (
    !commitExists(repositoryRoot, targetHead) ||
    !commitExists(repositoryRoot, verifiedCommit)
  )
    return "unavailable";
  const targetDescendsFromVerified = isAncestor(
    repositoryRoot,
    verifiedCommit,
    targetHead,
  );
  if (targetDescendsFromVerified === null) return "unavailable";
  if (targetDescendsFromVerified) return "ahead";
  const verifiedDescendsFromTarget = isAncestor(
    repositoryRoot,
    targetHead,
    verifiedCommit,
  );
  if (verifiedDescendsFromTarget === null) return "unavailable";
  return verifiedDescendsFromTarget ? "behind" : "divergent";
}

function relationMeaning(relation: TargetRelation): string {
  switch (relation) {
    case "current":
      return "Target branch HEAD equals the canonical stored verified commit.";
    case "ahead":
      return "Target branch HEAD descends from the stored verified commit.";
    case "behind":
      return "The stored verified commit descends from target branch HEAD.";
    case "divergent":
      return "Target branch HEAD and the stored verified commit have diverged.";
    case "uninitialized":
      return "Canonical controller state has no stored verified commit yet.";
    case "unavailable":
      return "Git ancestry could not be established from the available objects.";
  }
}

async function configuredTargetBranch(
  repositoryRoot: string,
  configPath?: string,
): Promise<string | null> {
  try {
    return (
      await loadConfigForInspection(
        repositoryRoot,
        configPath ??
          process.env["MILESTONE_LOOP_CONFIG"] ??
          DEFAULT_CONFIG_PATH,
      )
    ).targetBranch;
  } catch {
    return null;
  }
}

function targetBranchHead(
  repositoryRoot: string,
  targetBranch: string,
): string | null {
  const validation = runGit(repositoryRoot, [
    "check-ref-format",
    "--branch",
    targetBranch,
  ]);
  if (validation.status !== 0) return null;
  const result = runGit(repositoryRoot, [
    "rev-parse",
    "--verify",
    `refs/heads/${targetBranch}^{commit}`,
  ]);
  return result.status === 0 ? result.stdout : null;
}

function snapshotConsistency(
  doctor: DoctorDiagnostic,
  inspection: OrchestratorInspection | null,
  targetBranch: string | null,
  targetHead: string | null,
): SnapshotResult["consistency"] {
  if (!inspection) return "unavailable";
  if (
    doctor.checks.state.source === "invalid" ||
    doctor.checks.state.source === "not-checked"
  )
    return "unavailable";
  if (
    doctor.checks.state.canonicalGeneration !==
    inspection.stateStorage.canonicalGeneration
  )
    return "changed-during-inspection";
  const commissioned = doctor.checks.commissioning;
  const stateBranch = inspection.state?.repository.targetBranch ?? null;
  const alignedCommissioning =
    commissioned.status === "pass" &&
    commissioned.targetBranch !== null &&
    (stateBranch === null || stateBranch === commissioned.targetBranch) &&
    targetBranch === commissioned.targetBranch;
  if (alignedCommissioning) {
    if (targetHead === null) return "unavailable";
    if (
      commissioned.headCommit !== targetHead ||
      inspection.targetHead !== targetHead
    )
      return "changed-during-inspection";
  }
  return "stable";
}

async function captureSnapshot(
  repositoryRoot: string,
  configPath: string | undefined,
  dependencies: StatusDependencies,
): Promise<SnapshotResult> {
  const doctorProbe = dependencies.doctorProbe ?? runDoctorDiagnostic;
  const inspectionProbe =
    dependencies.inspectionProbe ?? MilestoneOrchestrator.inspect;
  const configuredBranchProbe =
    dependencies.configuredTargetBranchProbe ?? configuredTargetBranch;
  const headProbe = dependencies.targetHeadProbe ?? targetBranchHead;
  let last: SnapshotResult | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const input = {
      repositoryRoot,
      ...(configPath ? { configPath } : {}),
    };
    const doctor = await doctorProbe(input);
    let inspection: OrchestratorInspection | null = null;
    try {
      inspection = await inspectionProbe(repositoryRoot, configPath);
    } catch {
      // Doctor remains the fail-closed diagnostic when detailed state cannot load.
    }
    const configuredBranch = await configuredBranchProbe(
      repositoryRoot,
      configPath,
    );
    const commissionedBranch = doctor.checks.commissioning.targetBranch;
    const stateBranch = inspection?.state?.repository.targetBranch ?? null;
    const targetBranch =
      stateBranch ?? commissionedBranch ?? configuredBranch ?? null;
    const targetHead = targetBranch
      ? headProbe(repositoryRoot, targetBranch)
      : null;
    const consistency = snapshotConsistency(
      doctor,
      inspection,
      targetBranch,
      targetHead,
    );
    last = {
      doctor,
      inspection,
      consistency,
      attempts: attempt,
      configuredTargetBranch: configuredBranch,
      targetBranch,
      targetHead,
    };
    if (consistency !== "changed-during-inspection") return last;
  }
  return last!;
}

function commissioningProjection(
  doctor: DoctorDiagnostic,
): StatusCommissioning {
  const check = doctor.checks.commissioning;
  const complete =
    check.status === "pass" &&
    check.commissioned &&
    check.manifest !== null &&
    check.targetBranch !== null &&
    check.baseCommit !== null &&
    check.headCommit !== null &&
    check.headTree !== null &&
    check.profile !== null &&
    check.immutableContractLockSha256 !== null &&
    check.invariantSuiteId !== null &&
    check.scopePolicyId !== null;
  return {
    status: check.status,
    code: check.code,
    valid: complete,
    message: check.message,
    remediation: check.remediation,
    record: complete
      ? {
          manifest: check.manifest!,
          targetBranch: check.targetBranch!,
          baseCommit: check.baseCommit!,
          headCommit: check.headCommit!,
          headTree: check.headTree!,
          profile: check.profile!,
          immutableContractLockSha256: check.immutableContractLockSha256!,
          invariantSuiteId: check.invariantSuiteId!,
          scopePolicyId: check.scopePolicyId!,
          tierPlans: check.tierPlans,
        }
      : null,
  };
}

function pendingOperationProjection(
  inspection: OrchestratorInspection | null,
  doctor: DoctorDiagnostic,
): StatusPendingOperation | null {
  const inspected = inspection?.pendingOperation;
  if (inspected) {
    const { operation, recovery } = inspected;
    return {
      id: operation.id,
      kind: operation.kind,
      phase: operation.phase,
      recovery: {
        disposition:
          recovery.nextSafeAction === "manual-reconciliation-required"
            ? "blocked"
            : "automatic",
        classification: recovery.classification,
        nextSafeAction: recovery.nextSafeAction,
        message: recovery.message,
        preservedPaths: recovery.preservedPaths,
      },
    };
  }
  const fallback = doctor.checks.state.pendingOperation;
  if (!fallback) return null;
  return {
    id: fallback.id,
    kind: fallback.kind,
    phase: fallback.phase,
    recovery: {
      disposition:
        fallback.nextSafeAction === "manual-reconciliation-required"
          ? "blocked"
          : "automatic",
      classification: fallback.classification,
      nextSafeAction: fallback.nextSafeAction,
      message:
        doctor.checks.state.remediation ??
        "Inspect the canonical pending operation before recovery.",
      preservedPaths:
        "preservedPaths" in fallback ? fallback.preservedPaths : [],
    },
  };
}

function recoveryProjection(
  state: OrchestratorState | null,
  pendingOperation: StatusPendingOperation | null,
  targetRelation: TargetRelation,
  doctor: DoctorDiagnostic,
): StatusDiagnostic["recovery"] {
  if (pendingOperation)
    return {
      disposition: pendingOperation.recovery.disposition,
      reason: pendingOperation.recovery.message,
      command:
        pendingOperation.recovery.disposition === "automatic"
          ? "pnpm loop:resume -- --one"
          : "pnpm loop:status -- --json",
    };
  if (state?.reconciliation.active)
    return {
      disposition: "external",
      reason: "A durable external reconciliation is active.",
      command: "pnpm loop:reconcile-status",
    };
  if (["ahead", "behind", "divergent"].includes(targetRelation))
    return {
      disposition: "external",
      reason:
        "Target branch history differs from the canonical stored verified commit.",
      command: "pnpm loop:reconcile-status",
    };
  if (
    doctor.checks.state.outcome === "invalid-or-unreadable" ||
    targetRelation === "unavailable"
  )
    return {
      disposition: "blocked",
      reason:
        "Canonical state or Git ancestry is unavailable for safe recovery classification.",
      command: "pnpm loop:status -- --json",
    };
  return {
    disposition: "none",
    reason:
      state === null
        ? "Controller state is safely uninitialized."
        : "No pending or external recovery is recorded.",
    command: null,
  };
}

function latestCompletedMilestone(
  state: OrchestratorState | null,
): StatusLatestCompletedMilestone | null {
  let latest: MilestoneRecord | null = null;
  for (const milestone of state?.milestones ?? []) {
    if (milestone.status !== "completed" || !milestone.timestamps.completedAt)
      continue;
    if (
      !latest ||
      milestone.timestamps.completedAt >= latest.timestamps.completedAt!
    )
      latest = milestone;
  }
  if (!latest?.timestamps.completedAt) return null;
  return {
    id: latest.proposal.id,
    title: latest.proposal.title,
    completedAt: latest.timestamps.completedAt,
    attempts: latest.attempts,
    commits: latest.commits,
  };
}

function exactStateRecord(
  state: OrchestratorState | null,
  runId: string | null,
): StatusExactStateRecord | null {
  if (!runId) return null;
  let matched: {
    readonly milestone: MilestoneRecord;
    readonly summary: VerificationSummary;
  } | null = null;
  for (const milestone of state?.milestones ?? [])
    for (const summary of milestone.verificationSummaries)
      if (
        summary.authoritative?.runId === runId &&
        (!matched || summary.finishedAt >= matched.summary.finishedAt)
      )
        matched = { milestone, summary };
  if (!matched) return null;
  return {
    milestoneId: matched.milestone.proposal.id,
    attempt: matched.summary.attempt,
    finishedAt: matched.summary.finishedAt,
  };
}

function relativeWorkspace(repositoryRoot: string, path: string): string {
  const result = relative(repositoryRoot, path).replaceAll("\\", "/");
  return result.length > 0 && !isAbsolute(result) && !result.startsWith("../")
    ? result
    : path;
}

function deferredWorkspaceCleanups(
  repositoryRoot: string,
  state: OrchestratorState | null,
): StatusDiagnostic["deferred"]["workspaceCleanups"] {
  return (state?.milestones ?? []).flatMap((milestone) => {
    const workspace = milestone.workspace;
    if (!workspace || !["pending", "failed"].includes(workspace.cleanup.status))
      return [];
    return [
      {
        milestoneId: milestone.proposal.id,
        workspace: relativeWorkspace(repositoryRoot, workspace.path),
        cleanup: workspace.cleanup,
      },
    ];
  });
}

function reconciliationProjection(
  record: ReconciliationRecord | null,
): StatusReconciliation | null {
  if (!record) return null;
  return {
    id: record.id,
    status: record.status,
    phase: record.phase,
    sourceVerifiedCommit: record.sourceVerifiedCommit,
    candidateCommit: record.candidateCommit,
    candidateTree: record.candidateTree,
    externalGapReason: record.externalGapReason,
    currentPhaseAt: record.currentPhaseAt,
    failure: record.failure,
  };
}

export async function runStatusDiagnostic(
  input: {
    readonly repositoryRoot: string;
    readonly configPath?: string;
  },
  dependencies: StatusDependencies = {},
): Promise<StatusDiagnostic> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const snapshot = await captureSnapshot(
    repositoryRoot,
    input.configPath,
    dependencies,
  );
  const { doctor } = snapshot;
  const inspection =
    snapshot.consistency === "stable" ? snapshot.inspection : null;
  const state = inspection?.state ?? null;
  const commissioning = commissioningProjection(doctor);
  const configuredBranch = snapshot.configuredTargetBranch;
  const commissionedBranch = commissioning.record?.targetBranch ?? null;
  const stateBranch = state?.repository.targetBranch ?? null;
  const targetBranch = snapshot.targetBranch;
  const targetHead = snapshot.targetHead;
  const verifiedCommit =
    state?.repository.verifiedCommit ?? doctor.checks.state.verifiedCommit;
  const relation = (dependencies.targetRelationProbe ?? classifyTargetRelation)(
    repositoryRoot,
    targetHead,
    verifiedCommit,
  );
  const pendingOperation = pendingOperationProjection(inspection, doctor);
  const recovery =
    snapshot.consistency === "changed-during-inspection"
      ? {
          disposition: "blocked" as const,
          reason:
            "Canonical state or target identity changed during status inspection.",
          command: "pnpm loop:status -- --json",
        }
      : recoveryProjection(state, pendingOperation, relation, doctor);
  const exact = doctor.checks.latestExactVerification;
  const exactRecord = exactStateRecord(state, exact.runId);
  const provider = doctor.checks.executionProvider;
  const lease = doctor.checks.controllerLease;
  const activeReconciliation = state?.reconciliation.active ?? null;
  const latestReconciliation =
    activeReconciliation ?? state?.reconciliation.history.at(-1) ?? null;
  const stableNextAction =
    snapshot.consistency === "changed-during-inspection"
      ? {
          command: "pnpm loop:status -- --json",
          reason:
            "Canonical state or target identity changed during status inspection; rerun status for one stable generation.",
        }
      : doctor.nextAction;
  const integrationSnapshotStable = snapshot.consistency === "stable";
  const integrationReasons = integrationSnapshotStable
    ? doctor.checks.autonomousIntegrationEligibility.reasons
    : [
        ...doctor.checks.autonomousIntegrationEligibility.reasons,
        "statusSnapshotConsistency",
      ];
  const fallbackStorage = {
    reference: doctor.checks.state.reference,
    canonicalGeneration: doctor.checks.state.canonicalGeneration,
    revision: null,
    source: doctor.checks.state.source,
    mirror: doctor.checks.state.mirror,
  } as const;

  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    diagnostic: "orchestrator-status",
    readOnly: true,
    networkCallsPerformed: 0,
    snapshot: {
      consistency: snapshot.consistency,
      attempts: snapshot.attempts,
      canonicalGeneration:
        inspection?.stateStorage.canonicalGeneration ??
        doctor.checks.state.canonicalGeneration,
    },
    operational: {
      status: doctor.status,
      summary: {
        ...doctor.summary,
        autonomousIntegrationEligible:
          integrationSnapshotStable &&
          doctor.summary.autonomousIntegrationEligible,
      },
      issues: doctor.issues,
    },
    commissioning,
    profile: commissioning.record?.profile ?? null,
    target: {
      branch: targetBranch,
      branchSources: {
        configured: configuredBranch,
        commissioned: commissionedBranch,
        state: stateBranch,
      },
      head: targetHead,
      checkoutHead: inspection?.targetHead ?? null,
      checkoutMatchesTarget:
        inspection && targetHead ? inspection.targetHead === targetHead : null,
      verifiedCommit,
      relation,
      relationMeaning: relationMeaning(relation),
    },
    controller: {
      available: inspection !== null,
      initialized: inspection
        ? state !== null
        : doctor.checks.state.source === "absent"
          ? false
          : null,
      stateStorage: inspection?.stateStorage ?? fallbackStorage,
      protectedIntegrity:
        inspection?.protectedIntegrity ??
        doctor.checks.state.protectedIntegrity,
      state: inspection
        ? state
          ? stateStatusSummary(repositoryRoot, state)
          : { state: "uninitialized" }
        : { state: "unavailable" },
      nextAllowedAction:
        inspection?.nextAllowedAction ??
        state?.nextAllowedAction ??
        doctor.checks.state.nextAllowedAction,
    },
    lease: {
      status: lease.status,
      code: lease.code,
      message: lease.message,
      reference: lease.reference,
      legacyGuard: lease.legacyGuard,
      present: lease.present,
      malformed: lease.malformed,
      owner: lease.owner,
    },
    pendingOperation,
    recovery,
    latestCompletedMilestone: latestCompletedMilestone(state),
    latestExactVerification: {
      status: exact.status,
      code: exact.code,
      message: exact.message,
      available: exact.available,
      runId: exact.runId,
      resultPath: exact.resultPath,
      resultSha256: exact.resultSha256,
      resultHashMatches: exact.resultHashMatches,
      profile: exact.profile,
      candidateCommit: exact.candidateCommit,
      current: integrationSnapshotStable && exact.current,
      verificationStatus: exact.verificationStatus,
      completionEligible: exact.completionEligible,
      autonomousReadinessEquivalent: exact.autonomousReadinessEquivalent,
      executionProvider: exact.executionProvider,
      providerMatchesCurrent: exact.providerMatchesCurrent,
      stateRecord: exactRecord,
      stateRecordMatches:
        exact.available && integrationSnapshotStable
          ? exactRecord !== null
          : exact.available
            ? false
            : null,
    },
    trustedExecution: {
      status: provider.status,
      code: provider.code,
      configuredProvider: provider.configuredProvider,
      available: provider.trustedAvailable,
      completionEligible:
        provider.status === "pass" &&
        provider.identity?.completionEligible === true,
      identity: provider.identity,
    },
    autonomousIntegration: {
      eligible:
        integrationSnapshotStable &&
        doctor.checks.autonomousIntegrationEligibility.eligible,
      reasons: integrationReasons,
    },
    deferred: {
      workspaceCleanups: deferredWorkspaceCleanups(repositoryRoot, state),
      reconciliation: {
        active: reconciliationProjection(activeReconciliation),
        latest: reconciliationProjection(latestReconciliation),
      },
    },
    nextAction: stableNextAction,
  };
}
