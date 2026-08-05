import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  AGENT_INVOCATION_SCHEMA_VERSION,
  AGENT_ROLES,
  READINESS_VERIFICATION_STAGE_IDS,
} from "./contracts.js";
import type {
  AgentInvocationRecord,
  AuthoritativeVerificationSummary,
  BlockerRecord,
  CandidateIdentity,
  CodexTurnResult,
  MilestoneProposal,
  MilestoneRecord,
  OrchestratorConfig,
  OrchestratorState,
  PolicyDecision,
  ProjectProfile,
  ProposalProvenance,
  ReadinessHistoryEvidence,
  ReviewerReport,
  RunState,
  VerificationSummary,
  WorkerFailureRecord,
  WorkspaceCleanupReason,
} from "./contracts.js";
import {
  candidateIdentitiesEqual,
  candidateIdentityFrom,
  differingIdentityFields,
} from "./candidate-identity.js";
import {
  type CodexGateway,
  type CodexInvocation,
  SdkCodexGateway,
} from "./codex-gateway.js";
import { measurableTokenUnits } from "./budget.js";
import { readArtifactInventoryRetentionGuard } from "./artifact-inventory.js";
import { loadConfig } from "./config.js";
import { runCommand } from "./command-runner.js";
import {
  discoverManagedEvidenceRuns,
  pruneManagedEvidenceRuns,
} from "./evidence-retention.js";
import {
  assertProtectedFiles,
  captureProtectedFiles,
  commitWorkingChanges,
  createIsolatedWorkspace,
  currentVerificationProfile,
  inspectAttempt,
  inspectTarget,
  gitHead,
  integrateFastForward,
  workingChangedPaths,
} from "./git-isolation.js";
import {
  createMilestoneRecord,
  assertRequiredVerticalConsumerStart,
  milestoneById,
  replaceMilestone,
  requiredVerticalConsumerAfterCompletion,
  transitionMilestone,
} from "./milestone-state.js";
import {
  installedCodexSdkVersion,
  resolveAgentAssignment,
} from "./model-policy.js";
import { enforceDiffPolicy, evaluateProposal } from "./policy.js";
import { strictlyContained } from "./path-safety.js";
import { requestPlan } from "./planner.js";
import { redactSensitiveText, redactSensitiveValue } from "./redaction.js";
import { requestReview, reviewerApproves } from "./reviewer.js";
import {
  assertWorkerThreadPolicy,
  decideWorkerEscalation,
  infrastructureFailureRecord,
  promoteWorkerPolicy,
  recordWorkerThreadLineage,
  reviewerFailureRecord,
  verificationFailureRecord,
} from "./reasoning-escalation.js";
import { decideRetry } from "./retry-policy.js";
import {
  StateStore,
  atomicWriteJson,
  createInitialState,
} from "./state-store.js";
import { verifyMilestone } from "./verifier.js";
import { performWorkspaceCleanup } from "./workspace-cleanup.js";
import { TelemetryStore } from "./telemetry-store.js";
import type {
  TelemetryCandidate,
  TelemetryStatus,
} from "./telemetry-contracts.js";

export interface OrchestratorDependencies {
  readonly gateway?: CodexGateway;
  readonly now?: () => Date;
  readonly createRunId?: () => string;
  readonly workspaceCleanup?: typeof performWorkspaceCleanup;
  readonly evidencePruner?: typeof pruneManagedEvidenceRuns;
  readonly evidenceDiscovery?: typeof discoverManagedEvidenceRuns;
  readonly telemetryStoreOpen?: typeof TelemetryStore.open;
}

export interface RunOptions {
  readonly maximumMilestones?: number;
}

export interface RunOutcome {
  readonly state: OrchestratorState;
  readonly summaryPath: string;
  readonly stopReason: string;
}

function iso(now: () => Date): string {
  return now().toISOString();
}

function safeRunId(now: Date): string {
  return `loop-${now
    .toISOString()
    .replaceAll(/[^0-9]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function telemetryCandidate(
  workingDirectory: string,
  baseCommit: string,
): TelemetryCandidate | null {
  const query = (args: readonly string[]): string | null => {
    const result = spawnSync("git", ["-C", workingDirectory, ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const commit = query(["rev-parse", "HEAD"]);
  const tree = query(["rev-parse", "HEAD^{tree}"]);
  const status = query(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (
    !/^[0-9a-f]{40}$/.test(baseCommit) ||
    !commit ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    !tree ||
    !/^[0-9a-f]{40}$/.test(tree) ||
    status === null
  )
    return null;
  return { baseCommit, commit, tree, dirty: status.length > 0 };
}

function activeRun(
  id: string,
  artifactDirectory: string,
  startedAt: Date,
  wallClockMs: number,
): RunState {
  return {
    id,
    status: "running",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    deadlineAt: new Date(startedAt.getTime() + wallClockMs).toISOString(),
    milestonesProcessed: 0,
    consecutiveInfrastructureFailures: 0,
    usage: {
      codexInvocations: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
    plannerThreadIds: [],
    agentInvocations: [],
    stopReason: null,
    artifactDirectory,
  };
}

function workerPrompt(
  project: ProjectProfile,
  milestone: MilestoneRecord,
  relevantDiff: string | null,
): string {
  const feedback = milestone.retryFeedback;
  const replacement =
    milestone.workerPolicy.activeRole === "feature-worker-escalated";
  return [
    `You are the Worker for one approved ${project.name} milestone in an isolated local clone.`,
    `Read ${project.authorityFile}, AGENTS.md, everything under .agent, relevant architecture and verification docs, then inspect the current branch before acting.`,
    "Inspect, plan, implement, run the milestone's focused tests, and document only the approved bounded milestone below. The external controller will run the declared verification commands, pnpm verify, and independent review after your turn.",
    "Do not modify any path outside permittedPaths. Do not weaken tests, edit frozen authority/evals, activate readiness unless explicitly in scope, implement unrelated features, use hidden validation, or expose/request hidden seeds.",
    "Do not spawn subagents or perform an independent review. Do not run the full pnpm verify unless it is explicitly a focused milestone test; avoid duplicating the controller's authoritative work.",
    "Use ordinary repository commands and the existing exact toolchain. Attempt to commit the finished change and leave the tree clean. If the workspace sandbox denies writes to Git metadata, do not work around it: leave only approved working-tree changes for the controller's scope-checked checkpoint. Do not push, rewrite history, merge, or contact external services.",
    `Approved milestone: ${JSON.stringify(milestone.proposal)}.`,
    replacement
      ? `This is a replacement max-reasoning worker thread. Escalation reason: ${milestone.workerPolicy.escalationReason}. Prior thread lineage: ${JSON.stringify(milestone.workerThreadLineage)}. Prior attempt summaries: ${JSON.stringify(milestone.workerPolicy.failures)}. Prior sanitized verification evidence: ${JSON.stringify(replacementVerificationEvidence(milestone))}. Prior reviewer evidence: ${JSON.stringify(milestone.reviewerDecisions)}. Relevant current diff: ${relevantDiff ?? "No committed attempt diff exists."}. Remaining machine/reviewer failures: ${feedback ?? "No additional feedback was recorded."}`
      : feedback
        ? `This is a retry in the same recorded thread and policy. Correct the failure using this machine/reviewer feedback without rewriting prior commits: ${feedback}`
        : "This is the initial attempt. Produce objective evidence for every acceptance criterion.",
    `The verified base commit is ${milestone.workspace?.baseCommit ?? "unavailable"}.`,
  ].join("\n\n");
}

function replacementVerificationEvidence(
  milestone: MilestoneRecord,
): readonly Record<string, unknown>[] {
  return milestone.verificationSummaries.map((summary) => ({
    attempt: summary.attempt,
    status: summary.status,
    disposition: summary.disposition,
    failureKind: summary.failureKind,
    summary: summary.summary,
    failedCommandCategories: summary.commands
      .filter((command) => command.status !== "PASS")
      .map((command) => ({ id: command.id, status: command.status })),
  }));
}

function replacementDiff(milestone: MilestoneRecord): string | null {
  if (
    milestone.workerPolicy.activeRole !== "feature-worker-escalated" ||
    !milestone.workspace
  )
    return null;
  const result = spawnSync(
    "git",
    [
      "-C",
      milestone.workspace.path,
      "diff",
      "--no-ext-diff",
      "--unified=3",
      `${milestone.workspace.baseCommit}..HEAD`,
      "--",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot prepare replacement-worker diff context: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  const redacted = redactSensitiveText(result.stdout);
  return redacted.length > 50_000
    ? `${redacted.slice(0, 50_000)}...[TRUNCATED]`
    : redacted || "No committed attempt diff exists.";
}

function feedbackFromVerification(summary: VerificationSummary): string {
  return redactSensitiveText(
    JSON.stringify({
      status: summary.status,
      failureKind: summary.failureKind,
      summary: summary.summary,
      commands: summary.commands.map((command) => ({
        id: command.id,
        status: command.status,
        exitCode: command.exitCode,
        message: command.message,
        stdoutPath: command.stdoutPath,
        stderrPath: command.stderrPath,
      })),
      changedPaths: summary.changedPaths,
      artifacts: summary.artifactPaths,
    }),
  );
}

function feedbackFromReview(report: ReviewerReport): string {
  return redactSensitiveText(
    JSON.stringify({
      decision: report.decision,
      summary: report.summary,
      findings: report.findings,
      checks: report.checks,
    }),
  );
}

function authoritativeStageSetsAreConsistent(
  authoritative: AuthoritativeVerificationSummary,
): boolean {
  if (
    authoritative.profileId !== "readiness" ||
    !Array.isArray(authoritative.stages) ||
    !Array.isArray(authoritative.passingStageIds) ||
    !Array.isArray(authoritative.notReadyStageIds) ||
    !Array.isArray(authoritative.previouslyPassingStageIds) ||
    authoritative.requiredStageCount !==
      READINESS_VERIFICATION_STAGE_IDS.length ||
    authoritative.stages.length !== READINESS_VERIFICATION_STAGE_IDS.length ||
    authoritative.stages.some(
      (stage, index) =>
        typeof stage?.id !== "string" ||
        stage.id !== READINESS_VERIFICATION_STAGE_IDS[index] ||
        (stage.status !== "PASS" && stage.status !== "NOT_READY"),
    ) ||
    (authoritative.readinessHistoryMode !== "first-readiness-transition" &&
      authoritative.readinessHistoryMode !== "durable-records")
  )
    return false;
  const stageIds = authoritative.stages.map((stage) => stage.id);
  const expectedPassing = authoritative.stages
    .filter((stage) => stage.status === "PASS")
    .map((stage) => stage.id);
  const expectedNotReady = authoritative.stages
    .filter((stage) => stage.status === "NOT_READY")
    .map((stage) => stage.id);
  const previousIds = authoritative.previouslyPassingStageIds;
  return (
    new Set(stageIds).size === stageIds.length &&
    new Set(previousIds).size === previousIds.length &&
    previousIds.every(
      (stageId) =>
        READINESS_VERIFICATION_STAGE_IDS.includes(stageId as never) &&
        expectedPassing.includes(stageId),
    ) &&
    ((authoritative.readinessHistoryMode === "first-readiness-transition" &&
      previousIds.length === 0) ||
      (authoritative.readinessHistoryMode === "durable-records" &&
        previousIds.length > 0)) &&
    authoritative.passingStageIds.length === expectedPassing.length &&
    authoritative.passingStageIds.every(
      (stageId, index) => stageId === expectedPassing[index],
    ) &&
    authoritative.notReadyStageIds.length === expectedNotReady.length &&
    authoritative.notReadyStageIds.every(
      (stageId, index) => stageId === expectedNotReady[index],
    )
  );
}

export interface ReadinessLifecycleInspection {
  readonly profile: "bootstrap" | "readiness";
  readonly candidateHasMarker: boolean;
  readonly markerCommitAtOrBeforeBase: string | null;
  readonly markerCommitAtOrBeforeCandidate: string | null;
}

const READINESS_MARKER_PATH = ".agent/readiness-profile-activated.json";
const READINESS_FOUNDATION_STAGE_IDS = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "contract-integrity",
] as const;

function gitMarkerHistoryCommit(
  workspacePath: string,
  revision: string,
): string | null {
  const result = spawnSync(
    "git",
    [
      "-C",
      workspacePath,
      "log",
      "-1",
      "--format=%H",
      revision,
      "--",
      READINESS_MARKER_PATH,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot inspect readiness-marker Git history at ${revision}: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim() || null;
}

function candidateHasReadinessMarker(workspacePath: string): boolean {
  const result = spawnSync(
    "git",
    ["-C", workspacePath, "cat-file", "-e", `HEAD:${READINESS_MARKER_PATH}`],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status === null)
    throw new Error(
      `Cannot inspect the candidate readiness marker: ${result.error?.message ?? "Git did not return a status"}.`,
    );
  return result.status === 0;
}

export function inspectReadinessLifecycle(
  workspacePath: string,
  baseCommit: string,
): ReadinessLifecycleInspection {
  return {
    profile: currentVerificationProfile(workspacePath),
    candidateHasMarker: candidateHasReadinessMarker(workspacePath),
    markerCommitAtOrBeforeBase: gitMarkerHistoryCommit(
      workspacePath,
      baseCommit,
    ),
    markerCommitAtOrBeforeCandidate: gitMarkerHistoryCommit(
      workspacePath,
      "HEAD",
    ),
  };
}

function sameStringSequence(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function readinessHistoryEvidenceForCandidate(
  milestones: readonly MilestoneRecord[],
  lifecycle: ReadinessLifecycleInspection,
): ReadinessHistoryEvidence | undefined {
  const passingStageIds = new Set<string>();
  let readinessRecordCount = 0;
  for (const milestone of milestones) {
    if (milestone.status !== "completed") continue;
    const verification = milestone.verificationSummaries.at(-1);
    const authoritative = verification?.authoritative;
    if (!authoritative || authoritative.profileId !== "readiness") continue;
    const stageSetsAreConsistent =
      authoritativeStageSetsAreConsistent(authoritative);
    const expectedPreviousStageIds = [...passingStageIds].sort();
    const historyRecordIsConsistent =
      readinessRecordCount === 0
        ? authoritative.readinessHistoryMode === "first-readiness-transition" &&
          authoritative.previouslyPassingStageIds.length === 0
        : authoritative.readinessHistoryMode === "durable-records" &&
          sameStringSequence(
            authoritative.previouslyPassingStageIds,
            expectedPreviousStageIds,
          );
    const completionRecordIsConsistent =
      authoritative?.disposition === "completion-eligible" &&
      authoritative.status === "PASS" &&
      authoritative.exitCode === 0 &&
      authoritative.completionEligible === true &&
      authoritative.autonomousReadinessEquivalent === true &&
      stageSetsAreConsistent &&
      authoritative.notReadyStageIds.length === 0;
    const incrementalRecordIsConsistent =
      authoritative.disposition === "incremental-readiness" &&
      authoritative.status === "NOT_READY" &&
      authoritative.exitCode === 2 &&
      authoritative.completionEligible === false &&
      authoritative.autonomousReadinessEquivalent === false &&
      stageSetsAreConsistent &&
      authoritative.notReadyStageIds.length > 0;
    const recordIsUntrustworthy =
      verification?.status !== "PASS" ||
      verification.disposition !== authoritative.disposition ||
      verification.failureKind !== null ||
      authoritative.completionClaim !== "autonomous_readiness" ||
      authoritative.profileAutonomousReadinessEquivalent !== true ||
      !historyRecordIsConsistent ||
      (!completionRecordIsConsistent && !incrementalRecordIsConsistent) ||
      !milestone.workspace ||
      milestone.commits.at(-1) !== authoritative.candidateCommit ||
      milestone.workspace.headCommit !== authoritative.candidateCommit;
    if (recordIsUntrustworthy)
      throw new Error(
        `Cannot prove monotonic readiness history from completed milestone ${milestone.proposal.id}.`,
      );
    if (
      READINESS_FOUNDATION_STAGE_IDS.some(
        (stageId) => !authoritative.passingStageIds.includes(stageId),
      )
    )
      throw new Error(
        `Cannot prove monotonic readiness history from completed milestone ${milestone.proposal.id}.`,
      );
    for (const stageId of authoritative.passingStageIds) {
      if (typeof stageId === "string" && stageId.length > 0)
        passingStageIds.add(stageId);
    }
    readinessRecordCount += 1;
  }

  const markerHistoryExists =
    lifecycle.markerCommitAtOrBeforeCandidate !== null;
  if (lifecycle.profile === "bootstrap") {
    if (
      lifecycle.candidateHasMarker ||
      markerHistoryExists ||
      readinessRecordCount > 0
    )
      throw new Error(
        "Cannot prove the one-way readiness lifecycle for a bootstrap candidate.",
      );
    return undefined;
  }

  if (!lifecycle.candidateHasMarker || !markerHistoryExists)
    throw new Error(
      "Cannot prove readiness history because the committed candidate marker is missing.",
    );
  const firstReadinessTransition =
    lifecycle.markerCommitAtOrBeforeBase === null;
  if (readinessRecordCount === 0) {
    if (!firstReadinessTransition)
      throw new Error(
        "Cannot prove monotonic readiness history: durable controller records are missing after readiness activation.",
      );
    return {
      mode: "first-readiness-transition",
      previouslyPassingStageIds: [],
    };
  }
  if (firstReadinessTransition)
    throw new Error(
      "Cannot prove monotonic readiness history: controller records predate the first committed readiness transition.",
    );
  return {
    mode: "durable-records",
    previouslyPassingStageIds: [...passingStageIds].sort(),
  };
}

export function humanPlaytestStopReason(
  authoritative: AuthoritativeVerificationSummary | null | undefined,
): string | null {
  if (
    authoritative?.status === "PASS" &&
    authoritative.exitCode === 0 &&
    authoritative.disposition === "completion-eligible" &&
    authoritative.profileId === "readiness" &&
    authoritative.completionClaim === "autonomous_readiness" &&
    authoritative.completionEligible === true &&
    authoritative.profileAutonomousReadinessEquivalent === true &&
    authoritative.autonomousReadinessEquivalent === true &&
    authoritativeStageSetsAreConsistent(authoritative) &&
    authoritative.notReadyStageIds.length === 0 &&
    authoritative.passingStageIds.length === authoritative.requiredStageCount
  )
    return "Final autonomous-readiness verification passed; stop for human playtesting.";
  return null;
}

export class MilestoneOrchestrator {
  readonly repositoryRoot: string;
  readonly config: OrchestratorConfig;
  readonly store: StateStore;
  private stateValue: OrchestratorState;
  private readonly gateway: CodexGateway;
  private readonly now: () => Date;
  private readonly createRunId: () => string;
  private readonly workspaceCleanup: typeof performWorkspaceCleanup;
  private readonly evidencePruner: typeof pruneManagedEvidenceRuns;
  private readonly evidenceDiscovery: typeof discoverManagedEvidenceRuns;
  private readonly telemetryStoreOpen: typeof TelemetryStore.open;
  private telemetryValue: TelemetryStore | null = null;

  private constructor(input: {
    repositoryRoot: string;
    config: OrchestratorConfig;
    store: StateStore;
    state: OrchestratorState;
    gateway: CodexGateway;
    now: () => Date;
    createRunId: () => string;
    workspaceCleanup: typeof performWorkspaceCleanup;
    evidencePruner: typeof pruneManagedEvidenceRuns;
    evidenceDiscovery: typeof discoverManagedEvidenceRuns;
    telemetryStoreOpen: typeof TelemetryStore.open;
  }) {
    this.repositoryRoot = input.repositoryRoot;
    this.config = input.config;
    this.store = input.store;
    this.stateValue = input.state;
    this.gateway = input.gateway;
    this.now = input.now;
    this.createRunId = input.createRunId;
    this.workspaceCleanup = input.workspaceCleanup;
    this.evidencePruner = input.evidencePruner;
    this.evidenceDiscovery = input.evidenceDiscovery;
    this.telemetryStoreOpen = input.telemetryStoreOpen;
  }

  static async open(
    repositoryRoot: string,
    configPath?: string,
    dependencies: OrchestratorDependencies = {},
  ): Promise<MilestoneOrchestrator> {
    const root = resolve(repositoryRoot);
    const config = await loadConfig(root, configPath);
    const now = dependencies.now ?? (() => new Date());
    const store = new StateStore(root, config.statePath, () => iso(now));
    let state = await store.load();
    const target = inspectTarget(root, config.targetBranch);
    if (!state) {
      const discover =
        dependencies.evidenceDiscovery ?? discoverManagedEvidenceRuns;
      const [verificationRuns, controllerRuns] = await Promise.all([
        discover(resolve(root, config.evidenceRetention.artifactRoot)),
        discover(resolve(root, config.artifactRoot), "controller-run-summary"),
      ]);
      state = await store.initialize(
        createInitialState({
          repositoryRoot: root,
          targetBranch: config.targetBranch,
          verifiedCommit: target.head,
          protectedFiles: await captureProtectedFiles(
            root,
            config.protectedPaths,
          ),
          now: iso(now),
          legacyEvidenceRunIds: [
            ...new Set(
              [...verificationRuns, ...controllerRuns].map((run) => run.id),
            ),
          ],
        }),
      );
    }
    if (
      resolve(state.repository.root) !== root ||
      state.repository.targetBranch !== config.targetBranch
    )
      throw new Error(
        "Stored orchestrator repository identity does not match configuration.",
      );
    if (state.reconciliation.active)
      throw new Error(
        "Active controller reconciliation must resume before ordinary orchestration.",
      );
    const instance = new MilestoneOrchestrator({
      repositoryRoot: root,
      config,
      store,
      state,
      gateway: dependencies.gateway ?? new SdkCodexGateway(config),
      now,
      createRunId: dependencies.createRunId ?? (() => safeRunId(now())),
      workspaceCleanup:
        dependencies.workspaceCleanup ?? performWorkspaceCleanup,
      evidencePruner: dependencies.evidencePruner ?? pruneManagedEvidenceRuns,
      evidenceDiscovery:
        dependencies.evidenceDiscovery ?? discoverManagedEvidenceRuns,
      telemetryStoreOpen:
        dependencies.telemetryStoreOpen ?? TelemetryStore.open,
    });
    instance.assertStoredPaths();
    instance.assertStoredAgentPolicies();
    await instance.reconcileTarget(target.head);
    await instance.initializeEvidenceRetention();
    await instance.reconcileTerminalWorkspaceCleanup();
    await assertProtectedFiles(
      root,
      instance.stateValue.repository.protectedFiles,
    );
    return instance;
  }

  get state(): OrchestratorState {
    return this.stateValue;
  }

  private assertStoredPaths(): void {
    const runDirectory = this.stateValue.run.artifactDirectory;
    if (
      runDirectory &&
      !strictlyContained(
        resolve(this.repositoryRoot, this.config.artifactRoot),
        runDirectory,
      )
    )
      throw new Error(
        "Stored run artifact directory escapes its configured root.",
      );
    const workspaceRoot = resolve(
      this.repositoryRoot,
      this.config.workspaceRoot,
    );
    for (const milestone of this.stateValue.milestones) {
      if (
        milestone.workspace &&
        !strictlyContained(workspaceRoot, milestone.workspace.path)
      )
        throw new Error(
          `Stored workspace for ${milestone.proposal.id} escapes its configured root.`,
        );
      const archive = milestone.workspace?.cleanup.diagnosticArchivePath;
      if (
        archive &&
        !strictlyContained(
          resolve(this.repositoryRoot, this.config.artifactRoot),
          archive,
        )
      )
        throw new Error(
          `Stored diagnostic archive for ${milestone.proposal.id} escapes its configured root.`,
        );
    }
    const retentionReport = this.stateValue.evidenceRetention.lastReportPath;
    if (
      retentionReport &&
      !strictlyContained(
        resolve(this.repositoryRoot, this.config.artifactRoot),
        retentionReport,
      )
    )
      throw new Error(
        "Stored evidence-retention report escapes its configured root.",
      );
    const reconciliationPaths = [
      ...this.stateValue.controllerHistory.map(
        (archive) => archive.rawSourceState.path,
      ),
      ...[
        ...this.stateValue.reconciliation.history,
        ...(this.stateValue.reconciliation.active
          ? [this.stateValue.reconciliation.active]
          : []),
      ].flatMap((record) => [
        record.sourceState.path,
        record.commitRange.path,
        record.protectedComparison.path,
        record.benchmark.path,
        record.artifactInventory.path,
        record.nextProposal.path,
        ...(record.focusedEvidenceIndex
          ? [record.focusedEvidenceIndex.path]
          : []),
        ...(record.exactVerification
          ? [
              record.exactVerification.path,
              record.exactVerification.exactResult.path,
            ]
          : []),
        ...(record.independentReview ? [record.independentReview.path] : []),
        ...(record.adoption ? [record.adoption.path] : []),
      ]),
    ];
    if (
      reconciliationPaths.some((path) =>
        path.startsWith(".agent/")
          ? !strictlyContained(
              this.repositoryRoot,
              resolve(this.repositoryRoot, path),
            )
          : !strictlyContained(
              resolve(this.repositoryRoot, "artifacts"),
              resolve(this.repositoryRoot, path),
            ),
      )
    )
      throw new Error("Stored reconciliation evidence escapes its owned root.");
  }

  private assertStoredAgentPolicies(): void {
    const activeId = this.stateValue.activeMilestoneId;
    if (!activeId) return;
    const milestone = milestoneById(this.stateValue, activeId);
    if (!milestone.workerThreadId) return;
    const role = milestone.workerPolicy.activeRole;
    assertWorkerThreadPolicy({
      milestone,
      role,
      assignment: resolveAgentAssignment(this.config.agentPolicy, role),
    });
  }

  private async persist(next: OrchestratorState): Promise<void> {
    this.stateValue = await this.store.save(next);
  }

  private async initializeEvidenceRetention(): Promise<void> {
    if (this.stateValue.evidenceRetention.initializedAt !== null) return;
    const [verificationRuns, controllerRuns] = await Promise.all([
      this.evidenceDiscovery(
        resolve(
          this.repositoryRoot,
          this.config.evidenceRetention.artifactRoot,
        ),
      ),
      this.evidenceDiscovery(
        resolve(this.repositoryRoot, this.config.artifactRoot),
        "controller-run-summary",
      ),
    ]);
    await this.persist({
      ...this.stateValue,
      evidenceRetention: {
        ...this.stateValue.evidenceRetention,
        initializedAt: iso(this.now),
        legacyRunIds: [
          ...new Set(
            [...verificationRuns, ...controllerRuns].map((run) => run.id),
          ),
        ].sort(),
      },
    });
  }

  private cleanupReason(
    milestone: MilestoneRecord,
  ): Exclude<WorkspaceCleanupReason, "legacy-pre-policy"> {
    if (milestone.status === "completed")
      return this.config.cleanupCompletedWorkspaces
        ? "completed-delete-workspace"
        : "completed-preserve-workspace";
    if (milestone.status === "escalated")
      return this.config.preserveFailedWorkspaces
        ? "failed-preserve-workspace"
        : "failed-delete-after-diagnostics";
    throw new Error(
      `Workspace cleanup requires a terminal milestone, observed ${milestone.status}.`,
    );
  }

  private async cleanupTerminalWorkspace(id: string): Promise<{
    readonly ok: boolean;
    readonly error: string | null;
  }> {
    let milestone = milestoneById(this.stateValue, id);
    const workspace = milestone.workspace;
    if (
      !workspace ||
      !["completed", "escalated"].includes(milestone.status) ||
      ["legacy-preserved", "preserved", "deleted"].includes(
        workspace.cleanup.status,
      )
    )
      return { ok: true, error: null };

    const reason =
      workspace.cleanup.reason &&
      workspace.cleanup.reason !== "legacy-pre-policy"
        ? workspace.cleanup.reason
        : this.cleanupReason(milestone);
    const requestedAt = workspace.cleanup.requestedAt ?? iso(this.now);
    const runDirectory = this.stateValue.run.artifactDirectory;
    const diagnosticArchivePath =
      reason === "failed-delete-after-diagnostics" && runDirectory
        ? (workspace.cleanup.diagnosticArchivePath ??
          resolve(runDirectory, "workspace-diagnostics", milestone.proposal.id))
        : workspace.cleanup.diagnosticArchivePath;

    await this.persist(
      replaceMilestone(this.stateValue, id, (record) => ({
        ...record,
        workspace: record.workspace
          ? {
              ...record.workspace,
              cleanup: {
                ...record.workspace.cleanup,
                status: "pending",
                reason,
                requestedAt,
                completedAt: null,
                diagnosticArchivePath,
                error: null,
              },
            }
          : null,
        timestamps: { ...record.timestamps, updatedAt: iso(this.now) },
      })),
    );
    milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Persisted cleanup intent lost its workspace record.");

    try {
      const completedAt = iso(this.now);
      const result = await this.workspaceCleanup({
        workspaceRoot: resolve(this.repositoryRoot, this.config.workspaceRoot),
        artifactRoot: resolve(this.repositoryRoot, this.config.artifactRoot),
        runArtifactDirectory: this.stateValue.run.artifactDirectory,
        workspacePath: milestone.workspace.path,
        baseCommit: milestone.workspace.baseCommit,
        milestoneId: milestone.proposal.id,
        reason,
        diagnosticArchivePath,
        now: completedAt,
      });
      await this.persist(
        replaceMilestone(this.stateValue, id, (record) => ({
          ...record,
          workspace: record.workspace
            ? {
                ...record.workspace,
                preserved: result.status === "preserved",
                cleanup: {
                  ...record.workspace.cleanup,
                  status: result.status,
                  completedAt,
                  nodeModulesRemovedAt: result.nodeModulesRemovedAt,
                  diagnosticArchivePath: result.diagnosticArchivePath,
                  error: null,
                },
              }
            : null,
          timestamps: { ...record.timestamps, updatedAt: completedAt },
        })),
      );
      return { ok: true, error: null };
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      await this.persist(
        replaceMilestone(this.stateValue, id, (record) => ({
          ...record,
          workspace: record.workspace
            ? {
                ...record.workspace,
                preserved: true,
                cleanup: {
                  ...record.workspace.cleanup,
                  status: "failed",
                  completedAt: null,
                  error: message,
                },
              }
            : null,
          timestamps: { ...record.timestamps, updatedAt: iso(this.now) },
        })),
      );
      return { ok: false, error: message };
    }
  }

  private async recordCleanupControllerFailure(
    id: string,
    error: string,
  ): Promise<void> {
    const stoppedAt = iso(this.now);
    if (this.stateValue.run.status === "running")
      await this.persist({
        ...this.stateValue,
        run: {
          ...this.stateValue.run,
          status: "escalated",
          finishedAt: stoppedAt,
          stopReason: `Workspace cleanup failed for ${id}: ${error}`,
        },
        nextAllowedAction: "stop",
      });
    const directory = this.stateValue.run.artifactDirectory;
    if (directory) {
      await atomicWriteJson(
        resolve(directory, "workspace-cleanup-error.json"),
        {
          schemaVersion: "1.0.0",
          milestoneId: id,
          error,
          recordedAt: stoppedAt,
        },
      );
      await this.writeRunSummary();
    }
  }

  private async reconcileTerminalWorkspaceCleanup(): Promise<void> {
    for (const milestone of this.stateValue.milestones) {
      if (!["completed", "escalated"].includes(milestone.status)) continue;
      const result = await this.cleanupTerminalWorkspace(milestone.proposal.id);
      if (!result.ok && result.error)
        await this.recordCleanupControllerFailure(
          milestone.proposal.id,
          result.error,
        );
    }
  }

  private async pruneEvidence(): Promise<void> {
    const generatedAt = iso(this.now);
    const candidateCommit = gitHead(this.repositoryRoot);
    const inventoryGuard = await readArtifactInventoryRetentionGuard(
      this.repositoryRoot,
      candidateCommit,
    );
    const common = {
      repositoryRoot: this.repositoryRoot,
      keepRecentRuns: this.config.evidenceRetention.keepRecentRuns,
      legacyRunIds: this.stateValue.evidenceRetention.legacyRunIds,
      durableState: this.stateValue,
      safety: {
        candidateCommit,
        activeReconciliation: inventoryGuard.activeReconciliation,
        inventoryHasUnknownReferences:
          inventoryGuard.inventoryHasUnknownReferences,
      },
      now: generatedAt,
    } as const;
    const [verificationRuns, controllerRuns] = await Promise.all([
      this.evidencePruner({
        ...common,
        artifactRoot: resolve(
          this.repositoryRoot,
          this.config.evidenceRetention.artifactRoot,
        ),
      }),
      this.evidencePruner({
        ...common,
        artifactRoot: resolve(this.repositoryRoot, this.config.artifactRoot),
        manifestKind: "controller-run-summary",
      }),
    ]);
    const report = {
      schemaVersion: "1.0.0",
      generatedAt,
      verificationRuns,
      controllerRuns,
    } as const;
    const reportPath = resolve(
      this.runArtifactDirectory(),
      "evidence-retention.json",
    );
    await atomicWriteJson(reportPath, report);
    await this.persist({
      ...this.stateValue,
      evidenceRetention: {
        ...this.stateValue.evidenceRetention,
        lastPrunedAt: generatedAt,
        lastReportPath: reportPath,
      },
    });
  }

  private async reconcileTarget(targetHead: string): Promise<void> {
    if (targetHead === this.stateValue.repository.verifiedCommit) return;
    const activeId = this.stateValue.activeMilestoneId;
    if (!activeId)
      throw new Error(
        `Unsafe target HEAD ${targetHead}; stored verified commit is ${this.stateValue.repository.verifiedCommit}.`,
      );
    const milestone = milestoneById(this.stateValue, activeId);
    const lastReview = milestone.reviewerDecisions.at(-1);
    if (
      milestone.status !== "reviewing" ||
      !lastReview ||
      !reviewerApproves(lastReview) ||
      !milestone.workspace
    )
      throw new Error(
        "Target advanced without a persisted approved integration intent.",
      );
    const attempt = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    if (attempt.headCommit !== targetHead || !attempt.clean)
      throw new Error(
        "Target and approved isolated attempt do not match during recovery.",
      );
    const pinned = milestone.verificationSummaries.at(-1);
    if (
      pinned?.status === "PASS" &&
      pinned.candidate !== null &&
      !candidateIdentitiesEqual(
        pinned.candidate,
        candidateIdentityFrom(milestone.workspace.baseCommit, attempt),
      )
    )
      throw new Error(
        "Target advanced but the workspace no longer matches the pinned verified candidate.",
      );
    await assertProtectedFiles(
      this.repositoryRoot,
      this.stateValue.repository.protectedFiles,
    );
    let recovered = replaceMilestone(this.stateValue, activeId, (record) => ({
      ...record,
      commits: attempt.commits,
      workspace: record.workspace
        ? { ...record.workspace, headCommit: targetHead }
        : null,
    }));
    recovered = transitionMilestone(
      recovered,
      activeId,
      "completed",
      iso(this.now),
    );
    recovered = {
      ...recovered,
      repository: { ...recovered.repository, verifiedCommit: targetHead },
      queue: recovered.queue.filter((id) => id !== activeId),
      activeMilestoneId: null,
      nextAllowedAction: "plan",
    };
    await this.persist(recovered);
  }

  private runArtifactDirectory(): string {
    const directory = this.stateValue.run.artifactDirectory;
    if (!directory) throw new Error("No active run artifact directory.");
    return directory;
  }

  private async telemetryStore(
    recoverInterrupted = false,
  ): Promise<TelemetryStore> {
    if (this.telemetryValue) return this.telemetryValue;
    const runId = this.stateValue.run.id;
    const directory = this.stateValue.run.artifactDirectory;
    if (!runId || !directory)
      throw new Error("Cannot initialize telemetry without an active run.");
    const store = await this.telemetryStoreOpen({
      repositoryRoot: this.repositoryRoot,
      directory: resolve(directory, "telemetry"),
      runId,
      source: "controller",
      now: this.now,
    });
    if (recoverInterrupted) await store.recoverInterruptedPhases();
    this.telemetryValue = store;
    return store;
  }

  private async completeTelemetry(
    status: TelemetryStatus,
    reason: string | null,
  ): Promise<void> {
    try {
      const telemetry = await this.telemetryStore();
      await telemetry.complete(status, reason);
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      const directory = this.stateValue.run.artifactDirectory;
      if (directory)
        await atomicWriteJson(resolve(directory, "telemetry-error.json"), {
          schemaVersion: "1.0.0",
          status: "ERROR",
          error: message,
          recordedAt: iso(this.now),
        });
      if (this.stateValue.run.status !== "escalated")
        await this.persist({
          ...this.stateValue,
          run: {
            ...this.stateValue.run,
            status: "escalated",
            finishedAt: iso(this.now),
            stopReason: `Telemetry finalization failed: ${message}`,
          },
          nextAllowedAction: "stop",
        });
      throw new Error(`Telemetry finalization failed: ${message}`, {
        cause: error,
      });
    }
  }

  private async startRun(): Promise<void> {
    inspectTarget(
      this.repositoryRoot,
      this.config.targetBranch,
      this.stateValue.repository.verifiedCommit,
    );
    if (this.stateValue.run.status === "running") {
      await this.telemetryStore(true);
      return;
    }
    if (this.stateValue.run.status === "escalated")
      throw new Error(
        "Orchestrator is escalated; resolve the recorded blocker first.",
      );
    const id = this.createRunId();
    const directory = resolve(
      this.repositoryRoot,
      this.config.artifactRoot,
      id,
    );
    await mkdir(directory, { recursive: true });
    const started = this.now();
    const telemetry = await this.telemetryStoreOpen({
      repositoryRoot: this.repositoryRoot,
      directory: resolve(directory, "telemetry"),
      runId: id,
      source: "controller",
      now: this.now,
    });
    const inspectionSpan = await telemetry.beginPhase({
      phase: "inspection",
      eventType: "controller-start",
      operationId: `${id}-inspection`,
      candidate: telemetryCandidate(
        this.repositoryRoot,
        this.stateValue.repository.verifiedCommit,
      ),
    });
    this.telemetryValue = telemetry;
    await atomicWriteJson(
      resolve(directory, "model-policy.json"),
      redactSensitiveValue({
        schemaVersion: this.config.agentPolicy.schemaVersion,
        installedSdk: {
          package: "@openai/codex-sdk",
          version: installedCodexSdkVersion(),
        },
        policy: this.config.agentPolicy,
        effectiveAssignments: Object.fromEntries(
          AGENT_ROLES.map((role) => [
            role,
            resolveAgentAssignment(this.config.agentPolicy, role),
          ]),
        ),
        generatedAt: started.toISOString(),
      }),
    );
    await this.persist({
      ...this.stateValue,
      run: activeRun(id, directory, started, this.config.limits.wallClockMs),
    });
    try {
      await this.pruneEvidence();
      await inspectionSpan.finish({ status: "PASS" });
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      const stoppedAt = iso(this.now);
      await this.persist({
        ...this.stateValue,
        run: {
          ...this.stateValue.run,
          status: "escalated",
          finishedAt: stoppedAt,
          stopReason: `Evidence retention failed: ${message}`,
        },
        nextAllowedAction: "stop",
      });
      await atomicWriteJson(
        resolve(directory, "evidence-retention-error.json"),
        {
          schemaVersion: "1.0.0",
          error: message,
          recordedAt: stoppedAt,
        },
      );
      await inspectionSpan.finish({ status: "ERROR", reason: message });
      await this.writeRunSummary();
      await this.completeTelemetry("ERROR", message);
      throw new Error(`Evidence retention failed: ${message}`, {
        cause: error,
      });
    }
  }

  private checkLimits(): void {
    const run = this.stateValue.run;
    if (run.status !== "running")
      throw new Error("No running orchestrator invocation.");
    if (run.deadlineAt && this.now().getTime() >= Date.parse(run.deadlineAt))
      throw new Error("Configured orchestrator wall-clock limit was reached.");
    if (run.usage.codexInvocations >= this.config.limits.codexInvocations)
      throw new Error("Configured Codex invocation limit was reached.");
    const tokens = measurableTokenUnits(run.usage);
    if (tokens >= this.config.limits.tokenBudget)
      throw new Error("Configured measurable token budget was reached.");
  }

  private phaseTimeout(configuredMs: number): number {
    const deadline = this.stateValue.run.deadlineAt;
    if (!deadline) return configuredMs;
    return Math.max(
      1,
      Math.min(configuredMs, Date.parse(deadline) - this.now().getTime()),
    );
  }

  private accountingGateway(): CodexGateway {
    return {
      run: async (invocation: CodexInvocation): Promise<CodexTurnResult> => {
        this.checkLimits();
        const assignment = resolveAgentAssignment(
          this.config.agentPolicy,
          invocation.role,
        );
        const escalated = invocation.role === "feature-worker-escalated";
        if (escalated !== (invocation.escalationReason !== null))
          throw new Error(
            "Controller invocation role and escalation reason are inconsistent.",
          );
        const invocationId = `${this.stateValue.run.id ?? "run"}-agent-${this.stateValue.run.agentInvocations.length + 1}`;
        const startedAt = iso(this.now);
        const record: AgentInvocationRecord = {
          schemaVersion: AGENT_INVOCATION_SCHEMA_VERSION,
          id: invocationId,
          role: invocation.role,
          requestedModel: assignment.model,
          requestedReasoningEffort: assignment.reasoningEffort,
          resolvedModel: null,
          resolvedReasoningEffort: null,
          resolutionEvidence:
            "sdk-events-do-not-expose-resolved-model-or-effort",
          threadId: invocation.threadId,
          attempt: invocation.attempt,
          escalated,
          escalationReason: invocation.escalationReason,
          overrideApplied: assignment.overrideApplied,
          overrideReason:
            assignment.overrideReason === null
              ? null
              : redactSensitiveText(assignment.overrideReason),
          status: "starting",
          startedAt,
          finishedAt: null,
          error: null,
        };
        await this.persist({
          ...this.stateValue,
          run: {
            ...this.stateValue.run,
            agentInvocations: [...this.stateValue.run.agentInvocations, record],
            usage: {
              ...this.stateValue.run.usage,
              codexInvocations: this.stateValue.run.usage.codexInvocations + 1,
            },
          },
        });
        const updateRecord = async (
          update: Partial<AgentInvocationRecord>,
        ): Promise<void> => {
          await this.persist({
            ...this.stateValue,
            run: {
              ...this.stateValue.run,
              agentInvocations: this.stateValue.run.agentInvocations.map(
                (entry) =>
                  entry.id === invocationId ? { ...entry, ...update } : entry,
              ),
            },
          });
        };
        const originalThreadStarted = invocation.onThreadStarted;
        try {
          const telemetry = await this.telemetryStore();
          const result = await this.gateway.run({
            ...invocation,
            invocationId,
            telemetryStore: telemetry,
            telemetryCandidate: telemetryCandidate(
              invocation.workingDirectory,
              this.stateValue.repository.verifiedCommit,
            ),
            onThreadStarted: async (threadId) => {
              await updateRecord({ threadId });
              await originalThreadStarted?.(threadId);
            },
          });
          const usage = result.usage;
          await this.persist({
            ...this.stateValue,
            run: {
              ...this.stateValue.run,
              agentInvocations: this.stateValue.run.agentInvocations.map(
                (entry) =>
                  entry.id === invocationId
                    ? {
                        ...entry,
                        threadId: result.threadId,
                        status: "completed" as const,
                        finishedAt: iso(this.now),
                      }
                    : entry,
              ),
              usage: {
                codexInvocations: this.stateValue.run.usage.codexInvocations,
                inputTokens:
                  this.stateValue.run.usage.inputTokens +
                  (usage?.inputTokens ?? 0),
                cachedInputTokens:
                  this.stateValue.run.usage.cachedInputTokens +
                  (usage?.cachedInputTokens ?? 0),
                outputTokens:
                  this.stateValue.run.usage.outputTokens +
                  (usage?.outputTokens ?? 0),
                reasoningOutputTokens:
                  this.stateValue.run.usage.reasoningOutputTokens +
                  (usage?.reasoningOutputTokens ?? 0),
              },
            },
          });
          return result;
        } catch (error) {
          await updateRecord({
            status: "failed",
            finishedAt: iso(this.now),
            error: redactSensitiveText(
              error instanceof Error ? error.message : String(error),
            ),
          });
          throw error;
        }
      },
    };
  }

  private async recordPlannerThread(threadId: string): Promise<void> {
    if (this.stateValue.run.plannerThreadIds.includes(threadId)) return;
    await this.persist({
      ...this.stateValue,
      run: {
        ...this.stateValue.run,
        plannerThreadIds: [...this.stateValue.run.plannerThreadIds, threadId],
      },
    });
  }

  private async addApprovedProposal(
    proposal: MilestoneProposal,
    decision: PolicyDecision,
    artifactDirectory: string,
    provenance: Omit<ProposalProvenance, "recordedAt">,
  ): Promise<void> {
    await atomicWriteJson(
      resolve(artifactDirectory, "policy-decision.json"),
      decision,
    );
    const now = iso(this.now);
    let next: OrchestratorState = {
      ...this.stateValue,
      milestones: [
        ...this.stateValue.milestones,
        createMilestoneRecord(proposal, now, {
          ...provenance,
          recordedAt: now,
        }),
      ],
      queue: [...this.stateValue.queue, proposal.id],
    };
    await this.persist(next);
    next = transitionMilestone(
      this.stateValue,
      proposal.id,
      "ready",
      iso(this.now),
    );
    await this.persist({ ...next, nextAllowedAction: "start-milestone" });
  }

  async enqueue(
    proposal: MilestoneProposal,
    source: {
      readonly source?: "built-in-canary" | "tracked-recommissioning-plan";
      readonly sourcePath?: string;
      readonly reason?: string | null;
    } = {},
  ): Promise<PolicyDecision> {
    await this.startRun();
    const directory = resolve(
      this.runArtifactDirectory(),
      "planning",
      proposal.id,
    );
    await mkdir(directory, { recursive: true });
    await atomicWriteJson(
      resolve(directory, "planner-proposal.json"),
      proposal,
    );
    const decision = evaluateProposal(
      proposal,
      this.stateValue,
      this.config,
      currentVerificationProfile(this.repositoryRoot),
      iso(this.now),
    );
    await atomicWriteJson(resolve(directory, "policy-decision.json"), decision);
    if (decision.status === "accepted") {
      if (
        source.source === "tracked-recommissioning-plan" &&
        !source.sourcePath
      )
        throw new Error(
          "Tracked recommissioning provenance requires an exact source path.",
        );
      const sourcePath =
        source.sourcePath ?? "tools/milestone-orchestrator/src/canary.ts";
      const normalizedSourcePath = sourcePath.replaceAll("\\", "/");
      if (
        isAbsolute(sourcePath) ||
        normalizedSourcePath.split("/").includes("..") ||
        /[\r\n\0]/.test(sourcePath)
      )
        throw new Error("Proposal provenance source path is unsafe.");
      const sourceContents = await readFile(
        resolve(this.repositoryRoot, sourcePath),
      );
      await this.addApprovedProposal(proposal, decision, directory, {
        schemaVersion: "1.0.0",
        source: source.source ?? "built-in-canary",
        sourcePath: normalizedSourcePath,
        sourceSha256: createHash("sha256").update(sourceContents).digest("hex"),
        plannerThreadId: null,
        reason: source.reason ?? null,
      });
    }
    return decision;
  }

  private async planWithinRun(): Promise<MilestoneProposal | null> {
    let threadId: string | null = null;
    let feedback: PolicyDecision | null = null;
    for (
      let attempt = 1;
      attempt <= this.config.limits.plannerProposalAttempts;
      attempt += 1
    ) {
      const directory = resolve(
        this.runArtifactDirectory(),
        "planning",
        `attempt-${attempt}`,
      );
      const result = await requestPlan({
        gateway: this.accountingGateway(),
        project: this.config.project,
        state: this.stateValue,
        artifactDirectory: directory,
        timeoutMs: this.phaseTimeout(this.config.limits.codexTurnMs),
        attempt,
        priorThreadId: threadId,
        feedback,
        onThreadStarted: async (id) => this.recordPlannerThread(id),
      });
      threadId = result.threadId;
      const decision = evaluateProposal(
        result.proposal,
        this.stateValue,
        this.config,
        currentVerificationProfile(this.repositoryRoot),
        iso(this.now),
      );
      await atomicWriteJson(
        resolve(directory, "policy-decision.json"),
        decision,
      );
      if (decision.status === "accepted") {
        await this.addApprovedProposal(result.proposal, decision, directory, {
          schemaVersion: "1.0.0",
          source: "planner",
          sourcePath: null,
          sourceSha256: null,
          plannerThreadId: result.threadId,
          reason: null,
        });
        return result.proposal;
      }
      feedback = decision;
    }
    await this.escalate(
      "PLANNER_POLICY_LIMIT",
      "Planner exhausted its proposal attempts without producing a policy-compliant milestone.",
      feedback?.findings.map((finding) => finding.message) ?? [],
    );
    return null;
  }

  async planOnly(): Promise<RunOutcome> {
    await this.startRun();
    try {
      const existing = this.stateValue.queue
        .map((id) => milestoneById(this.stateValue, id))
        .find((milestone) => milestone.status === "ready");
      if (!existing) await this.planWithinRun();
    } catch (error) {
      await this.escalate(
        "PLANNER_INVOCATION_FAILURE",
        redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
        [],
      );
    }
    if (this.stateValue.run.status === "running")
      await this.stopRun(
        "One bounded milestone is ready; no worker was launched.",
      );
    return this.outcome();
  }

  private async setWorkerThread(
    milestoneId: string,
    threadId: string,
    role: "feature-worker-initial" | "feature-worker-escalated",
  ): Promise<void> {
    const current = milestoneById(this.stateValue, milestoneId);
    const assignment = resolveAgentAssignment(this.config.agentPolicy, role);
    const updated = recordWorkerThreadLineage({
      milestone: current,
      threadId,
      role,
      assignment,
      now: iso(this.now),
    });
    if (updated === current) return;
    await this.persist(
      replaceMilestone(this.stateValue, milestoneId, () => updated),
    );
  }

  private async setReviewerThread(
    milestoneId: string,
    threadId: string,
  ): Promise<void> {
    const current = milestoneById(this.stateValue, milestoneId);
    if (current.reviewerThreadIds.includes(threadId)) return;
    await this.persist(
      replaceMilestone(this.stateValue, milestoneId, (record) => ({
        ...record,
        reviewerThreadIds: [...record.reviewerThreadIds, threadId],
        timestamps: { ...record.timestamps, updatedAt: iso(this.now) },
      })),
    );
  }

  private attemptDirectory(milestone: MilestoneRecord): string {
    return resolve(
      this.runArtifactDirectory(),
      "milestones",
      milestone.proposal.id,
      `attempt-${milestone.attempts}`,
    );
  }

  private async prepareWorkspace(milestone: MilestoneRecord): Promise<void> {
    if (!milestone.workspace)
      throw new Error("Cannot prepare a missing workspace.");
    const directory = resolve(
      this.attemptDirectory(milestone),
      "workspace-setup",
    );
    const telemetry = await this.telemetryStore();
    const result = await runCommand(
      {
        id: "frozen-install",
        executable: "pnpm",
        args: [
          "install",
          "--frozen-lockfile",
          "--offline",
          "--package-import-method=copy",
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: milestone.workspace.path,
        artifactDirectory: directory,
        timeoutMs: this.phaseTimeout(this.config.limits.commandMs),
        trustedControllerCommand: true,
        telemetry: {
          store: telemetry,
          phase: "inspection",
          candidate: telemetryCandidate(
            milestone.workspace.path,
            milestone.workspace.baseCommit,
          ),
          checkSetId: "workspace-setup",
          selectedCheckIds: ["frozen-install"],
          actualCheckIds: ["frozen-install"],
          retryAttempt: milestone.attempts,
        },
      },
    );
    await atomicWriteJson(resolve(directory, "workspace-setup.json"), result);
    if (result.status !== "PASS")
      throw new Error(`Isolated workspace setup failed: ${result.message}`);
  }

  private protectedPatterns(): readonly string[] {
    return [
      ...new Set([
        ...this.config.protectedPaths,
        ...this.stateValue.repository.protectedFiles.map((file) => file.path),
      ]),
    ];
  }

  private async finalizeWorkerAttempt(id: string): Promise<boolean> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Cannot checkpoint a missing worker workspace.");
    const artifactPath = resolve(
      this.attemptDirectory(milestone),
      "controller-checkpoint.json",
    );
    const before = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    const workingPaths = workingChangedPaths(milestone.workspace.path);
    const observedPaths = [
      ...new Set([...before.changedPaths, ...workingPaths]),
    ].sort();
    const initialPolicy = enforceDiffPolicy(
      observedPaths,
      milestone.proposal,
      this.protectedPatterns(),
    );
    if (!initialPolicy.allowed) {
      await atomicWriteJson(artifactPath, {
        schemaVersion: "1.0.0",
        status: "rejected",
        reason: "diff-policy",
        observedPaths,
        workingPaths,
        policy: initialPolicy,
        controllerCommit: null,
      });
      await this.escalate(
        "DIFF_POLICY_VIOLATION",
        `Worker checkpoint rejected protected=[${initialPolicy.protectedChanges.join(", ")}] out-of-scope=[${initialPolicy.outOfScopeChanges.join(", ")}].`,
        [artifactPath],
        id,
      );
      return false;
    }

    try {
      await assertProtectedFiles(
        milestone.workspace.path,
        this.stateValue.repository.protectedFiles,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await atomicWriteJson(artifactPath, {
        schemaVersion: "1.0.0",
        status: "rejected",
        reason: "protected-file-hash",
        observedPaths,
        workingPaths,
        message,
        controllerCommit: null,
      });
      await this.escalate(
        "PROTECTED_FILE_MODIFICATION",
        message,
        [artifactPath],
        id,
      );
      return false;
    }

    const controllerCommit =
      workingPaths.length === 0
        ? null
        : commitWorkingChanges(
            milestone.workspace.path,
            `Controller checkpoint: ${milestone.proposal.title}`,
          );
    const after = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    const finalPolicy = enforceDiffPolicy(
      after.changedPaths,
      milestone.proposal,
      this.protectedPatterns(),
    );
    if (!after.clean || !finalPolicy.allowed) {
      await atomicWriteJson(artifactPath, {
        schemaVersion: "1.0.0",
        status: "rejected",
        reason: !after.clean ? "checkpoint-not-clean" : "diff-policy",
        observedPaths,
        workingPaths,
        finalChangedPaths: after.changedPaths,
        policy: finalPolicy,
        controllerCommit,
      });
      await this.escalate(
        "DIFF_POLICY_VIOLATION",
        !after.clean
          ? "Controller checkpoint did not leave the isolated attempt clean."
          : `Checkpoint rejected protected=[${finalPolicy.protectedChanges.join(", ")}] out-of-scope=[${finalPolicy.outOfScopeChanges.join(", ")}].`,
        [artifactPath],
        id,
      );
      return false;
    }
    try {
      await assertProtectedFiles(
        milestone.workspace.path,
        this.stateValue.repository.protectedFiles,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await atomicWriteJson(artifactPath, {
        schemaVersion: "1.0.0",
        status: "rejected",
        reason: "protected-file-hash-after-checkpoint",
        observedPaths,
        workingPaths,
        finalChangedPaths: after.changedPaths,
        message,
        controllerCommit,
      });
      await this.escalate(
        "PROTECTED_FILE_MODIFICATION",
        message,
        [artifactPath],
        id,
      );
      return false;
    }
    await atomicWriteJson(artifactPath, {
      schemaVersion: "1.0.0",
      status: "accepted",
      reason:
        controllerCommit === null
          ? "worker-tree-already-clean"
          : "sdk-sandbox-protected-git-metadata",
      observedPaths,
      workingPaths,
      finalChangedPaths: after.changedPaths,
      commits: after.commits,
      controllerCommit,
    });
    return true;
  }

  private async beginAttempt(id: string): Promise<void> {
    const transitioned = transitionMilestone(
      this.stateValue,
      id,
      "running",
      iso(this.now),
    );
    await this.persist({
      ...replaceMilestone(transitioned, id, (record) => ({
        ...record,
        attempts: record.attempts + 1,
      })),
      activeMilestoneId: id,
      nextAllowedAction: "resume-worker",
    });
    let milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace) {
      const workspace = await createIsolatedWorkspace({
        repositoryRoot: this.repositoryRoot,
        workspaceRoot: this.config.workspaceRoot,
        targetBranch: this.config.targetBranch,
        baseCommit: this.stateValue.repository.verifiedCommit,
        runId: this.stateValue.run.id ?? "run",
        milestoneId: id,
        now: iso(this.now),
      });
      await this.persist(
        replaceMilestone(this.stateValue, id, (record) => ({
          ...record,
          workspace,
        })),
      );
      milestone = milestoneById(this.stateValue, id);
    }
    await this.prepareWorkspace(milestone);
  }

  private async runWorker(id: string): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Worker milestone has no isolated workspace.");
    const existingAttempt = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    if (
      existingAttempt.clean &&
      existingAttempt.commits.length > 0 &&
      !milestone.retryFeedback
    ) {
      const next = transitionMilestone(
        this.stateValue,
        id,
        "verifying",
        iso(this.now),
      );
      await this.persist({ ...next, nextAllowedAction: "verify" });
      return;
    }
    const role = milestone.workerPolicy.activeRole;
    const assignment = resolveAgentAssignment(this.config.agentPolicy, role);
    if (milestone.workerThreadId) {
      assertWorkerThreadPolicy({ milestone, role, assignment });
    }
    const turn = await this.accountingGateway().run({
      role,
      prompt: workerPrompt(
        this.config.project,
        milestone,
        replacementDiff(milestone),
      ),
      workingDirectory: milestone.workspace.path,
      threadId: milestone.workerThreadId,
      eventLogPath: resolve(
        this.attemptDirectory(milestone),
        "worker-events.jsonl",
      ),
      timeoutMs: this.phaseTimeout(this.config.limits.codexTurnMs),
      attempt: milestone.attempts,
      escalationReason:
        role === "feature-worker-escalated"
          ? milestone.workerPolicy.escalationReason
          : null,
      telemetryPhase: "implementation",
      onThreadStarted: async (threadId) =>
        this.setWorkerThread(id, threadId, role),
    });
    await atomicWriteJson(
      resolve(this.attemptDirectory(milestone), "worker-turn.json"),
      {
        schemaVersion: "1.0.0",
        attempt: milestone.attempts,
        threadId: turn.threadId,
        role,
        requestedModel: assignment.model,
        requestedReasoningEffort: assignment.reasoningEffort,
        escalationReason: milestone.workerPolicy.escalationReason,
        usage: turn.usage,
        itemCount: turn.itemCount,
        finalResponse: redactSensitiveText(turn.finalResponse),
      },
    );
    if (!(await this.finalizeWorkerAttempt(id))) return;
    await this.persist(
      replaceMilestone(this.stateValue, id, (record) => ({
        ...record,
        retryFeedback: null,
      })),
    );
    const next = transitionMilestone(
      this.stateValue,
      id,
      "verifying",
      iso(this.now),
    );
    await this.persist({ ...next, nextAllowedAction: "verify" });
  }

  private async verify(id: string): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Verification has no isolated workspace.");
    const telemetry = await this.telemetryStore();
    const verificationSpan = await telemetry.beginPhase({
      phase: "verification",
      eventType: "milestone-verification",
      operationId: `${this.stateValue.run.id ?? "run"}-${id}-a${milestone.attempts}-verification`,
      candidate: telemetryCandidate(
        milestone.workspace.path,
        milestone.workspace.baseCommit,
      ),
    });
    const readinessHistory = readinessHistoryEvidenceForCandidate(
      this.stateValue.milestones,
      inspectReadinessLifecycle(
        milestone.workspace.path,
        milestone.workspace.baseCommit,
      ),
    );
    let summary: VerificationSummary;
    try {
      summary = await verifyMilestone({
        runId: this.stateValue.run.id ?? "run",
        proposal: milestone.proposal,
        attempt: milestone.attempts,
        workspacePath: milestone.workspace.path,
        baseCommit: milestone.workspace.baseCommit,
        config: {
          ...this.config,
          limits: {
            ...this.config.limits,
            commandMs: this.phaseTimeout(this.config.limits.commandMs),
          },
        },
        protectedFiles: this.stateValue.repository.protectedFiles,
        artifactDirectory: resolve(
          this.attemptDirectory(milestone),
          "verification",
        ),
        telemetry,
        ...(readinessHistory ? { readinessHistory } : {}),
      });
      const artifactMetadata = await Promise.all(
        summary.artifactPaths.map((path) => stat(path)),
      );
      await verificationSpan.finish({
        status: summary.status,
        reason: summary.status === "PASS" ? null : summary.summary,
        candidate: telemetryCandidate(
          milestone.workspace.path,
          milestone.workspace.baseCommit,
        ),
        artifacts: {
          fileCount: summary.artifactPaths.length,
          totalBytes: artifactMetadata.reduce(
            (sum, metadata) => sum + metadata.size,
            0,
          ),
          manifestReferences: summary.artifactPaths.map((path) =>
            relative(this.repositoryRoot, path).replaceAll("\\", "/"),
          ),
          receiptReferences: [],
        },
        measurementAvailability: {
          artifacts: "measured",
          tests: "unparseable",
        },
      });
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      await verificationSpan.finish({ status: "ERROR", reason: message });
      throw error;
    }
    await this.persist(
      replaceMilestone(this.stateValue, id, (record) => ({
        ...record,
        verificationSummaries: [...record.verificationSummaries, summary],
      })),
    );
    if (summary.status !== "PASS") {
      if (summary.failureKind === "policy") {
        await this.escalate(
          "DIFF_POLICY_VIOLATION",
          summary.summary,
          summary.artifactPaths,
          id,
        );
        return;
      }
      await this.retryOrEscalate(
        id,
        summary.failureKind === "infrastructure" ? "infrastructure" : "product",
        feedbackFromVerification(summary),
        verificationFailureRecord({
          proposal: milestone.proposal,
          verification: summary,
          recordedAt: iso(this.now),
        }),
      );
      return;
    }
    const verified = summary.candidate;
    if (!verified || !verified.clean)
      throw new Error(
        "PASS verification summary lacks a clean pinned candidate identity.",
      );
    let updated = replaceMilestone(this.stateValue, id, (record) => ({
      ...record,
      workspace: record.workspace
        ? { ...record.workspace, headCommit: verified.commit }
        : null,
    }));
    updated = transitionMilestone(updated, id, "reviewing", iso(this.now));
    await this.persist({
      ...updated,
      run: {
        ...updated.run,
        consecutiveInfrastructureFailures: 0,
      },
      nextAllowedAction: "review",
    });
  }

  private async escalateCandidateIdentityDrift(
    id: string,
    boundary: "review-entry" | "post-review" | "pre-integration",
    expected: CandidateIdentity | null,
    observed: CandidateIdentity | null,
    messageOverride?: string,
  ): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    const reportPath = resolve(
      this.attemptDirectory(milestone),
      `candidate-identity-drift-${boundary}.json`,
    );
    await atomicWriteJson(reportPath, {
      schemaVersion: "1.0.0",
      milestoneId: id,
      boundary,
      expected,
      observed,
      recordedAt: iso(this.now),
    });
    const fields =
      expected && observed ? differingIdentityFields(expected, observed) : [];
    const message =
      messageOverride ??
      `Candidate identity changed at ${boundary}: [${fields.join(", ")}] differ from the machine-verified candidate. Nothing was integrated.`;
    await this.escalate("CANDIDATE_IDENTITY_DRIFT", message, [reportPath], id);
  }

  private async review(id: string): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    const verification = milestone.verificationSummaries.at(-1);
    if (!milestone.workspace || !verification || verification.status !== "PASS")
      throw new Error("Review requires a verified isolated attempt.");
    const verified = verification.candidate;
    const resultSha256 = verification.authoritativeResultSha256;
    const copiedResultPath = verification.authoritative?.copiedResultPath;
    if (!verified || !resultSha256 || !copiedResultPath) {
      await this.escalateCandidateIdentityDrift(
        id,
        "review-entry",
        verified,
        null,
        "Persisted verification predates the candidate identity fence; re-verification is required before review.",
      );
      return;
    }
    const entryIdentity = candidateIdentityFrom(
      milestone.workspace.baseCommit,
      inspectAttempt(milestone.workspace.path, milestone.workspace.baseCommit),
    );
    if (!candidateIdentitiesEqual(verified, entryIdentity)) {
      await this.escalateCandidateIdentityDrift(
        id,
        "review-entry",
        verified,
        entryIdentity,
      );
      return;
    }
    const observedResultSha256 = createHash("sha256")
      .update(await readFile(copiedResultPath))
      .digest("hex");
    if (observedResultSha256 !== resultSha256) {
      await this.escalateCandidateIdentityDrift(
        id,
        "review-entry",
        verified,
        entryIdentity,
        "The copied authoritative verification result no longer matches its recorded hash.",
      );
      return;
    }
    const report = await requestReview({
      gateway: this.accountingGateway(),
      project: this.config.project,
      proposal: milestone.proposal,
      verification,
      workspacePath: milestone.workspace.path,
      verifiedCandidate: verified,
      verificationResultSha256: resultSha256,
      attempt: milestone.attempts,
      artifactDirectory: resolve(this.attemptDirectory(milestone), "review"),
      timeoutMs: this.phaseTimeout(this.config.limits.codexTurnMs),
      onThreadStarted: async (threadId) => this.setReviewerThread(id, threadId),
      now: () => iso(this.now),
    });
    await this.persist(
      replaceMilestone(this.stateValue, id, (record) => ({
        ...record,
        reviewerDecisions: [...record.reviewerDecisions, report],
      })),
    );
    if (report.decision === "escalate") {
      await this.escalate(
        "REVIEWER_ESCALATION",
        report.summary,
        report.findings.map((finding) => finding.evidence),
        id,
      );
      return;
    }
    if (!reviewerApproves(report)) {
      await this.retryOrEscalate(
        id,
        "review",
        feedbackFromReview(report),
        reviewerFailureRecord({
          report,
          attempt: milestone.attempts,
          recordedAt: iso(this.now),
        }),
      );
      return;
    }
    const postReviewInspection = inspectAttempt(
      milestone.workspace.path,
      milestone.workspace.baseCommit,
    );
    const postReviewIdentity = candidateIdentityFrom(
      milestone.workspace.baseCommit,
      postReviewInspection,
    );
    if (!candidateIdentitiesEqual(verified, postReviewIdentity)) {
      await this.escalateCandidateIdentityDrift(
        id,
        "post-review",
        verified,
        postReviewIdentity,
      );
      return;
    }
    await this.integrate(id, verified, postReviewInspection.commits);
  }

  private async retryOrEscalate(
    id: string,
    failureKind: "product" | "infrastructure" | "review",
    feedback: string,
    failureRecord?: WorkerFailureRecord,
  ): Promise<void> {
    const current = milestoneById(this.stateValue, id);
    const recordedFailure =
      failureRecord ??
      infrastructureFailureRecord({
        attempt: current.attempts,
        summary: feedback,
        recordedAt: iso(this.now),
      });
    if (recordedFailure.kind !== failureKind)
      throw new Error(
        `Worker failure evidence kind ${recordedFailure.kind} does not match ${failureKind}.`,
      );
    let next = replaceMilestone(this.stateValue, id, (record) => ({
      ...record,
      infrastructureFailures:
        failureKind === "infrastructure"
          ? record.infrastructureFailures + 1
          : record.infrastructureFailures,
      retryFeedback: feedback,
      workerPolicy: {
        ...record.workerPolicy,
        failures: [...record.workerPolicy.failures, recordedFailure],
      },
    }));
    const consecutive =
      failureKind === "infrastructure"
        ? next.run.consecutiveInfrastructureFailures + 1
        : 0;
    next = {
      ...next,
      run: { ...next.run, consecutiveInfrastructureFailures: consecutive },
    };
    await this.persist(next);
    const decision = decideRetry({
      milestone: milestoneById(this.stateValue, id),
      config: this.config,
      failureKind,
      consecutiveInfrastructureFailures: consecutive,
    });
    if (decision.action === "escalate") {
      await this.escalate(
        failureKind === "infrastructure"
          ? "INFRASTRUCTURE_RETRY_LIMIT"
          : "MILESTONE_RETRY_LIMIT",
        decision.reason,
        [feedback],
        id,
      );
      return;
    }
    const milestone = milestoneById(this.stateValue, id);
    const workerEscalation = decideWorkerEscalation({
      state: milestone.workerPolicy,
      policy: this.config.agentPolicy,
    });
    if (workerEscalation.escalate && workerEscalation.reason) {
      await this.persist(
        replaceMilestone(this.stateValue, id, (record) =>
          promoteWorkerPolicy(
            record,
            workerEscalation.reason ?? "Worker reasoning escalation required.",
            iso(this.now),
          ),
        ),
      );
    }
    const retrying = transitionMilestone(
      this.stateValue,
      id,
      "retrying",
      iso(this.now),
    );
    await this.persist({ ...retrying, nextAllowedAction: "retry" });
  }

  private async integrate(
    id: string,
    verified: CandidateIdentity,
    commits: readonly string[],
  ): Promise<void> {
    const milestone = milestoneById(this.stateValue, id);
    if (!milestone.workspace)
      throw new Error("Integration has no isolated workspace.");
    const preIntegrationIdentity = candidateIdentityFrom(
      milestone.workspace.baseCommit,
      inspectAttempt(milestone.workspace.path, milestone.workspace.baseCommit),
    );
    if (!candidateIdentitiesEqual(verified, preIntegrationIdentity)) {
      await this.escalateCandidateIdentityDrift(
        id,
        "pre-integration",
        verified,
        preIntegrationIdentity,
      );
      return;
    }
    await assertProtectedFiles(
      milestone.workspace.path,
      this.stateValue.repository.protectedFiles,
    );
    await assertProtectedFiles(
      this.repositoryRoot,
      this.stateValue.repository.protectedFiles,
    );
    const outcomePath = resolve(
      this.attemptDirectory(milestone),
      "git-outcome.json",
    );
    await atomicWriteJson(outcomePath, {
      schemaVersion: "1.0.0",
      status: "pending",
      baseCommit: milestone.workspace.baseCommit,
      headCommit: verified.commit,
      commits,
    });
    const telemetry = await this.telemetryStore();
    const integrationSpan = await telemetry.beginPhase({
      phase: "integration",
      eventType: "milestone-fast-forward",
      operationId: `${this.stateValue.run.id ?? "run"}-${id}-integration`,
      candidate: telemetryCandidate(
        milestone.workspace.path,
        milestone.workspace.baseCommit,
      ),
    });
    let integrated: string;
    try {
      integrated = integrateFastForward({
        repositoryRoot: this.repositoryRoot,
        targetBranch: this.config.targetBranch,
        expectedBaseCommit: this.stateValue.repository.verifiedCommit,
        workspacePath: milestone.workspace.path,
        headCommit: verified.commit,
        expectedTree: verified.tree,
      });
      await integrationSpan.finish({
        status: "PASS",
        candidate: telemetryCandidate(
          this.repositoryRoot,
          milestone.workspace.baseCommit,
        ),
      });
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      await integrationSpan.finish({ status: "ERROR", reason: message });
      throw error;
    }
    let completed = replaceMilestone(this.stateValue, id, (record) => ({
      ...record,
      commits,
      workspace: record.workspace
        ? { ...record.workspace, headCommit: integrated }
        : null,
    }));
    completed = transitionMilestone(completed, id, "completed", iso(this.now));
    completed = {
      ...completed,
      repository: { ...completed.repository, verifiedCommit: integrated },
      queue: completed.queue.filter((entry) => entry !== id),
      activeMilestoneId: null,
      requiredNextVerticalConsumer: requiredVerticalConsumerAfterCompletion(
        completed.requiredNextVerticalConsumer,
        milestone.proposal,
      ),
      run: {
        ...completed.run,
        milestonesProcessed: completed.run.milestonesProcessed + 1,
      },
      nextAllowedAction: "plan",
    };
    await this.persist(completed);
    await atomicWriteJson(outcomePath, {
      schemaVersion: "1.0.0",
      status: "integrated",
      baseCommit: milestone.workspace.baseCommit,
      headCommit: integrated,
      commits,
      targetBranch: this.config.targetBranch,
    });
    const cleanup = await this.cleanupTerminalWorkspace(id);
    if (!cleanup.ok && cleanup.error) {
      await this.recordCleanupControllerFailure(id, cleanup.error);
      return;
    }
    const authoritative = milestone.verificationSummaries.at(-1)?.authoritative;
    const stopReason = humanPlaytestStopReason(authoritative);
    if (stopReason) await this.stopRun(stopReason);
  }

  private async processMilestone(id: string): Promise<void> {
    assertRequiredVerticalConsumerStart(this.stateValue, id);
    while (this.stateValue.run.status === "running") {
      this.checkLimits();
      const milestone = milestoneById(this.stateValue, id);
      switch (milestone.status) {
        case "ready":
        case "retrying":
          try {
            await this.beginAttempt(id);
          } catch (error) {
            await this.retryOrEscalate(
              id,
              "infrastructure",
              redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          break;
        case "running":
          try {
            await this.runWorker(id);
          } catch (error) {
            await this.retryOrEscalate(
              id,
              "infrastructure",
              redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          break;
        case "verifying":
          await this.verify(id);
          break;
        case "reviewing":
          try {
            await this.review(id);
          } catch (error) {
            await this.retryOrEscalate(
              id,
              "infrastructure",
              redactSensitiveText(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          break;
        case "completed":
        case "blocked":
        case "escalated":
          return;
        case "proposed":
          throw new Error(`Milestone ${id} was never approved as ready.`);
      }
    }
  }

  async run(options: RunOptions = {}): Promise<RunOutcome> {
    await this.startRun();
    const maximum = Math.min(
      options.maximumMilestones ?? this.config.limits.milestonesPerInvocation,
      this.config.limits.milestonesPerInvocation,
    );
    if (!Number.isSafeInteger(maximum) || maximum <= 0)
      throw new Error("maximumMilestones must be a positive integer.");
    while (
      this.stateValue.run.status === "running" &&
      this.stateValue.run.milestonesProcessed < maximum
    ) {
      try {
        this.checkLimits();
        let id = this.stateValue.activeMilestoneId;
        if (!id) {
          const requiredConsumer =
            this.stateValue.requiredNextVerticalConsumer?.consumerMilestoneId ??
            null;
          const ready = this.stateValue.queue
            .map((entry) => milestoneById(this.stateValue, entry))
            .find(
              (milestone) =>
                (requiredConsumer === null ||
                  milestone.proposal.id === requiredConsumer) &&
                [
                  "ready",
                  "running",
                  "verifying",
                  "reviewing",
                  "retrying",
                ].includes(milestone.status),
            );
          if (!ready) {
            const proposal = await this.planWithinRun();
            if (!proposal) break;
            id = proposal.id;
          } else {
            id = ready.proposal.id;
          }
        }
        await this.processMilestone(id);
      } catch (error) {
        await this.escalate(
          "RUN_CONTROLLER_FAILURE",
          redactSensitiveText(
            error instanceof Error ? error.message : String(error),
          ),
          [],
          this.stateValue.activeMilestoneId ?? undefined,
        );
      }
    }
    if (this.stateValue.run.status === "running")
      await this.stopRun(
        `Maximum ${maximum} milestone(s) processed for this invocation.`,
      );
    return this.outcome();
  }

  private async escalate(
    code: string,
    message: string,
    evidence: readonly string[],
    requestedMilestoneId?: string,
  ): Promise<void> {
    const createdAt = iso(this.now);
    const blocker: BlockerRecord = {
      code,
      message: redactSensitiveText(message),
      evidence: evidence.map(redactSensitiveText),
      createdAt,
    };
    const milestoneId =
      requestedMilestoneId ?? this.stateValue.activeMilestoneId;
    let next = this.stateValue;
    if (milestoneId) {
      const milestone = milestoneById(next, milestoneId);
      if (
        milestone.status !== "escalated" &&
        milestone.status !== "completed"
      ) {
        next = replaceMilestone(next, milestoneId, (record) => ({
          ...record,
          blockers: [...record.blockers, blocker],
        }));
        next = transitionMilestone(next, milestoneId, "escalated", createdAt);
      }
    }
    next = {
      ...next,
      run: {
        ...next.run,
        status: "escalated",
        finishedAt: createdAt,
        stopReason: blocker.message,
      },
      nextAllowedAction: "stop",
    };
    await this.persist(next);
    if (this.stateValue.run.artifactDirectory)
      await atomicWriteJson(
        resolve(
          this.stateValue.run.artifactDirectory,
          "escalation-report.json",
        ),
        {
          schemaVersion: "1.0.0",
          runId: this.stateValue.run.id,
          milestoneId,
          blocker,
          nextAllowedAction: "stop",
          repository: this.stateValue.repository,
        },
      );
    if (milestoneId) {
      const cleanup = await this.cleanupTerminalWorkspace(milestoneId);
      if (!cleanup.ok && cleanup.error) {
        await this.recordCleanupControllerFailure(milestoneId, cleanup.error);
        return;
      }
    }
    await this.writeRunSummary();
    await this.completeTelemetry("ERROR", blocker.message);
  }

  private async stopRun(reason: string): Promise<void> {
    if (this.stateValue.run.status !== "running") return;
    await this.persist({
      ...this.stateValue,
      run: {
        ...this.stateValue.run,
        status: "stopped",
        finishedAt: iso(this.now),
        stopReason: reason,
      },
    });
    await this.writeRunSummary();
    await this.completeTelemetry("PASS", reason);
  }

  private async writeRunSummary(): Promise<string> {
    const directory = this.stateValue.run.artifactDirectory;
    if (!directory)
      throw new Error("Cannot summarize a run without artifacts.");
    const path = resolve(directory, "run-summary.json");
    const relevant = this.stateValue.milestones.filter(
      (milestone) =>
        milestone.timestamps.updatedAt >= (this.stateValue.run.startedAt ?? ""),
    );
    const summary = {
      schemaVersion: "1.0.0",
      run: this.stateValue.run,
      modelPolicy: {
        schemaVersion: this.config.agentPolicy.schemaVersion,
        sdk: this.config.agentPolicy.sdk,
        effectiveAssignments: Object.fromEntries(
          AGENT_ROLES.map((role) => [
            role,
            resolveAgentAssignment(this.config.agentPolicy, role),
          ]),
        ),
      },
      repository: this.stateValue.repository,
      requiredNextVerticalConsumer:
        this.stateValue.requiredNextVerticalConsumer,
      telemetry: this.telemetryValue
        ? {
            manifestPath: relative(
              this.repositoryRoot,
              this.telemetryValue.manifestPath,
            ).replaceAll("\\", "/"),
            summaryPath: relative(
              this.repositoryRoot,
              this.telemetryValue.summaryPath,
            ).replaceAll("\\", "/"),
          }
        : null,
      milestones: relevant.map((milestone) => ({
        id: milestone.proposal.id,
        proposalProvenance: milestone.proposalProvenance,
        title: milestone.proposal.title,
        status: milestone.status,
        attempts: milestone.attempts,
        threadId: milestone.workerThreadId,
        workerPolicy: milestone.workerPolicy,
        workerThreadLineage: milestone.workerThreadLineage,
        reviewerThreadIds: milestone.reviewerThreadIds,
        commits: milestone.commits,
        workspaceCleanup: milestone.workspace?.cleanup ?? null,
        verification: milestone.verificationSummaries.at(-1) ?? null,
        review: milestone.reviewerDecisions.at(-1) ?? null,
        blockers: milestone.blockers,
        nextAllowedAction: milestone.nextAllowedAction,
      })),
      stopReason: this.stateValue.run.stopReason,
      nextAllowedAction: this.stateValue.nextAllowedAction,
      generatedAt: iso(this.now),
    };
    await atomicWriteJson(path, redactSensitiveValue(summary));
    const markdownPath = resolve(directory, "run-summary.md");
    const markdown = [
      `# Orchestrator run ${this.stateValue.run.id ?? "unknown"}`,
      "",
      `Status: ${this.stateValue.run.status}`,
      `Stop reason: ${this.stateValue.run.stopReason ?? "none"}`,
      `Verified commit: ${this.stateValue.repository.verifiedCommit}`,
      `Milestones processed: ${this.stateValue.run.milestonesProcessed}`,
      `Codex invocations: ${this.stateValue.run.usage.codexInvocations}`,
      "",
      "## Agent invocations",
      "",
      ...(this.stateValue.run.agentInvocations.length === 0
        ? ["- none"]
        : this.stateValue.run.agentInvocations.map(
            (invocation) =>
              `- ${invocation.role}: ${invocation.requestedModel}/${invocation.requestedReasoningEffort}; thread=${invocation.threadId ?? "pending"}; attempt=${invocation.attempt}; escalated=${invocation.escalated}; override=${invocation.overrideApplied}; reason=${invocation.escalationReason ?? invocation.overrideReason ?? "none"}; status=${invocation.status}`,
          )),
      "",
      "## Milestones",
      "",
      ...relevant.map(
        (milestone) =>
          `- ${milestone.proposal.id}: ${milestone.status}; attempts=${milestone.attempts}; commits=${milestone.commits.join(",") || "none"}`,
      ),
      "",
    ].join("\n");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(markdownPath, redactSensitiveText(markdown), "utf8");
    return path;
  }

  private outcome(): RunOutcome {
    const directory = this.stateValue.run.artifactDirectory;
    if (!directory) throw new Error("Run produced no artifact directory.");
    return {
      state: this.stateValue,
      summaryPath: resolve(directory, "run-summary.json"),
      stopReason:
        this.stateValue.run.stopReason ?? "Run ended without a reason.",
    };
  }

  statusSummary(): unknown {
    return {
      schemaVersion: this.stateValue.schemaVersion,
      revision: this.stateValue.revision,
      repository: this.stateValue.repository,
      run: this.stateValue.run,
      queue: this.stateValue.queue,
      activeMilestoneId: this.stateValue.activeMilestoneId,
      requiredNextVerticalConsumer:
        this.stateValue.requiredNextVerticalConsumer,
      evidenceRetention: this.stateValue.evidenceRetention,
      milestones: this.stateValue.milestones.map((milestone) => ({
        id: milestone.proposal.id,
        title: milestone.proposal.title,
        status: milestone.status,
        attempts: milestone.attempts,
        workerThreadId: milestone.workerThreadId,
        workerPolicy: milestone.workerPolicy,
        workerThreadLineage: milestone.workerThreadLineage,
        nextAllowedAction: milestone.nextAllowedAction,
        workspace:
          milestone.workspace === null
            ? null
            : relative(
                this.repositoryRoot,
                milestone.workspace.path,
              ).replaceAll("\\", "/"),
        workspacePreserved: milestone.workspace?.preserved ?? null,
        workspaceCleanup: milestone.workspace?.cleanup ?? null,
      })),
      nextAllowedAction: this.stateValue.nextAllowedAction,
    };
  }
}
