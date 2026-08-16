import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommissioningDoctorDiagnostic } from "./commissioning.js";
import {
  READINESS_VERIFICATION_STAGE_IDS,
  VERIFICATION_SUMMARY_SCHEMA_VERSION,
  WORKSPACE_CLEANUP_SCHEMA_VERSION,
  type AuthoritativeVerificationSummary,
  type OrchestratorState,
  type VerificationSummary,
} from "./contracts.js";
import { runDoctorDiagnostic, type DoctorDiagnostic } from "./doctor.js";
import { executionProviderIdentity } from "./execution-provider-identity.js";
import { TRUSTED_CONTAINER_IMPLEMENTATION } from "./execution-provider.js";
import { createMilestoneRecord } from "./milestone-state.js";
import type { OrchestratorInspection } from "./orchestrator.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { StateStore } from "./state-store.js";
import {
  classifyTargetRelation,
  runStatusDiagnostic,
  STATUS_SCHEMA_VERSION,
} from "./status.js";
import {
  planWorkspaceCreateOperation,
  type WorkspaceCreateRecoveryInspection,
} from "./workspace-create.js";
import {
  validConfig,
  validProposal,
  validReconciliationRecord,
  validState,
} from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(
  repositoryRoot: string,
  ...args: string[]
): {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function gitOk(repositoryRoot: string, ...args: string[]): string {
  const result = git(repositoryRoot, ...args);
  if (result.status !== 0)
    throw new Error(
      `Git failed (${args.join(" ")}): ${result.stderr || result.stdout}`,
    );
  return result.stdout;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function gitFixture(): Promise<{
  readonly root: string;
  readonly base: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-status-git-"));
  temporaryDirectories.push(root);
  gitOk(root, "init", "--initial-branch=main");
  gitOk(root, "config", "user.name", "Status Test");
  gitOk(root, "config", "user.email", "status@example.invalid");
  await writeFile(join(root, "seed.txt"), "base\n", "utf8");
  gitOk(root, "add", ".");
  gitOk(root, "commit", "-m", "base");
  return { root, base: gitOk(root, "rev-parse", "HEAD") };
}

async function operationalFixture(): Promise<{
  readonly root: string;
  readonly head: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-status-readonly-"));
  temporaryDirectories.push(root);
  const config = validConfig({ targetBranch: "main" });
  for (const path of buildCanonicalProtectedSet(config)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${path}\n`, "utf8");
  }
  await writeJson(
    join(root, "tools/milestone-orchestrator/config/default.json"),
    config,
  );
  await writeJson(join(root, "package.json"), {
    engines: { node: "24.18.0" },
    packageManager: "pnpm@11.15.1",
    milestoneLoop: {
      verification: { defaultProfile: "readiness" },
      productionBuild: {
        script: "build:production",
        outputRoots: ["dist"],
      },
    },
    scripts: { "build:production": "node tools/build-production.mjs" },
  });
  await writeFile(join(root, ".gitignore"), "artifacts/\n", "utf8");
  gitOk(root, "init", "--initial-branch=main");
  gitOk(root, "config", "user.name", "Status Test");
  gitOk(root, "config", "user.email", "status@example.invalid");
  gitOk(root, "add", ".");
  gitOk(root, "commit", "-m", "fixture");
  return { root, head: gitOk(root, "rev-parse", "HEAD") };
}

function treeInventory(root: string): readonly string[] {
  const visit = (directory: string): string[] =>
    readdirSync(directory)
      .sort()
      .flatMap((name) => {
        if (directory === root && name === ".git") return [];
        const path = join(directory, name);
        const metadata = lstatSync(path);
        const relativePath = path.slice(root.length + 1).replaceAll("\\", "/");
        if (metadata.isDirectory()) return visit(path);
        const contents = readFileSync(path);
        return [
          `${relativePath}:${metadata.size}:${createHash("sha256")
            .update(contents)
            .digest("hex")}`,
        ];
      });
  return visit(root);
}

function readyCommissioning(head: string): CommissioningDoctorDiagnostic {
  return {
    schemaVersion: "loop-commissioning-doctor.v1",
    diagnostic: "loop-commissioning",
    status: "PASS",
    readOnly: true,
    manifest: {
      path: ".agent/verification-manifest.json",
      bytes: 512,
      sha256: "1".repeat(64),
    },
    repository: {
      targetBranch: "main",
      baseCommit: head,
      headCommit: head,
      headTree: "2".repeat(40),
      profile: "readiness",
    },
    immutableContractLockSha256: "3".repeat(64),
    invariantSuiteId: "status-invariants.v1",
    scopePolicyId: "status-scope.v1",
    tierPlans: ["iteration", "candidate", "milestone", "periodic"].map(
      (tier) => ({
        tier: tier as "iteration" | "candidate" | "milestone" | "periodic",
        commandCount: 2,
        exactVerificationIncluded: tier === "milestone" || tier === "periodic",
      }),
    ),
  };
}

const providerIdentity = executionProviderIdentity({
  provider: "trusted-container",
  implementation: TRUSTED_CONTAINER_IMPLEMENTATION,
  runtimeName: "docker",
  runtimeVersion: "Docker status-fixture",
  imageDigest: `sha256:${"4".repeat(64)}`,
  mountPolicyVersion: "oci-mount-policy-v1",
  resourceLimitProfile: "oci-resource-limits-v1",
  networkDisposition: "denied",
  capabilityStatus: "ready",
  controlPlaneBound: true,
});

async function baseDoctor(
  root: string,
  head: string,
): Promise<DoctorDiagnostic> {
  return runDoctorDiagnostic(
    { repositoryRoot: root },
    {
      environment: {
        npm_config_user_agent: "pnpm/11.15.1 node/v24.18.0 win32 x64",
        CODEX_API_KEY: "redacted-test-value",
      },
      nodeVersion: "24.18.0",
      installedSdkVersionProbe: () => validConfig().agentPolicy.sdk.version,
      commissioningProbe: async () => readyCommissioning(head),
      productionBuildProbe: async () => ({
        script: "build:production",
        outputRoots: ["dist"],
      }),
      gitProbe: () => ({ clean: true }),
      headProbe: () => head,
    },
  );
}

function projectedDoctor(input: {
  readonly base: DoctorDiagnostic;
  readonly head: string;
  readonly generation: string | null;
  readonly exact?: VerificationSummary;
  readonly nextAction?: { readonly command: string; readonly reason: string };
}): DoctorDiagnostic {
  const commissioning = readyCommissioning(input.head);
  const authoritative = input.exact?.authoritative ?? null;
  const statePresent = input.generation !== null;
  return {
    ...input.base,
    status: "ready",
    summary: {
      passCount: 16,
      warningCount: authoritative ? 0 : 1,
      blockCount: 0,
      autonomousIntegrationEligible: authoritative !== null,
    },
    nextAction: input.nextAction ?? {
      command: "pnpm loop:plan",
      reason: "Canonical state permits planning.",
    },
    issues: [],
    checks: {
      ...input.base.checks,
      commissioning: {
        ...input.base.checks.commissioning,
        status: "pass",
        code: "ok",
        message: "Commissioning is valid.",
        remediation: null,
        command: null,
        manifest: commissioning.manifest,
        commissioned: true,
        targetBranch: commissioning.repository.targetBranch,
        baseCommit: commissioning.repository.baseCommit,
        headCommit: commissioning.repository.headCommit,
        headTree: commissioning.repository.headTree,
        profile: commissioning.repository.profile,
        immutableContractLockSha256: commissioning.immutableContractLockSha256,
        invariantSuiteId: commissioning.invariantSuiteId,
        scopePolicyId: commissioning.scopePolicyId,
        tierPlans: commissioning.tierPlans,
      },
      state: {
        ...input.base.checks.state,
        status: statePresent ? "pass" : "warning",
        code: statePresent ? "ok" : "state-uninitialized",
        message: statePresent ? "State is valid." : "State is uninitialized.",
        remediation: statePresent ? null : "Run one planning step.",
        command: statePresent ? null : "pnpm loop:plan",
        canonicalGeneration: input.generation,
        source: statePresent ? "canonical" : "absent",
        mirror: statePresent ? "current" : "missing",
        verifiedCommit: statePresent ? input.head : null,
        nextAllowedAction: "plan",
        protectedIntegrity: statePresent ? "verified" : "uninitialized",
        pendingOperation: null,
        outcome: statePresent ? "valid" : "missing",
      },
      latestExactVerification: {
        ...input.base.checks.latestExactVerification,
        status: authoritative ? "pass" : "warning",
        code: authoritative ? "ok" : "exact-verification-unavailable",
        message: authoritative
          ? "Exact verification is current."
          : "No exact verification is recorded.",
        remediation: authoritative ? null : "Run the exact verifier.",
        command: authoritative ? null : "pnpm verify",
        available: authoritative !== null,
        runId: authoritative?.runId ?? null,
        resultPath: authoritative?.copiedResultPath ?? null,
        resultSha256: input.exact?.authoritativeResultSha256 ?? null,
        resultHashMatches: authoritative ? true : null,
        profile: authoritative?.profileId ?? null,
        candidateCommit: authoritative?.candidateCommit ?? null,
        current: authoritative !== null,
        verificationStatus: authoritative?.status ?? null,
        completionEligible: authoritative?.completionEligible ?? false,
        autonomousReadinessEquivalent:
          authoritative?.autonomousReadinessEquivalent ?? false,
        executionProvider: authoritative?.executionProvider ?? null,
        providerMatchesCurrent: authoritative ? true : null,
      },
      executionProvider: {
        ...input.base.checks.executionProvider,
        status: "pass",
        code: "ok",
        message: "Trusted execution is available.",
        remediation: null,
        command: null,
        configuredProvider: "trusted-container",
        trustedAvailable: true,
        identity: providerIdentity,
      },
      controllerLease: {
        ...input.base.checks.controllerLease,
        status: "pass",
        code: "ok",
        message: "No controller lease is active.",
        remediation: null,
        command: null,
        legacyGuard: "absent",
        present: false,
        malformed: false,
        owner: null,
      },
      autonomousIntegrationEligibility: {
        ...input.base.checks.autonomousIntegrationEligibility,
        status: authoritative ? "pass" : "warning",
        code: authoritative ? "ok" : "autonomous-integration-ineligible",
        message: authoritative
          ? "Autonomous integration is eligible."
          : "Autonomous integration is ineligible.",
        remediation: authoritative ? null : "Obtain exact evidence.",
        command: null,
        eligible: authoritative !== null,
        reasons: authoritative ? [] : ["latestExactVerification"],
      },
    },
  };
}

function inspection(
  state: OrchestratorState | null,
  head: string,
  generation: string | null,
  pendingOperation: OrchestratorInspection["pendingOperation"] = null,
): OrchestratorInspection {
  return {
    state,
    stateStorage: {
      reference: "refs/milestone-loop/state",
      canonicalGeneration: generation,
      revision: state?.revision ?? null,
      source: state ? "canonical" : "absent",
      mirror: state ? "current" : "missing",
    },
    targetHead: head,
    targetDrift:
      state && state.repository.verifiedCommit !== head
        ? {
            storedVerifiedCommit: state.repository.verifiedCommit,
            actualHead: head,
          }
        : null,
    pendingWorkspaceCleanups: 0,
    pendingOperation,
    protectedIntegrity: state ? "verified" : "uninitialized",
    lease: {
      path: join("artifacts", "orchestrator", "state", "controller.lease"),
      reference: "refs/milestone-loop/controller-lease",
      legacyGuard: "absent",
      present: false,
      malformed: false,
      owner: null,
    },
    nextAllowedAction: state?.nextAllowedAction ?? "plan",
  };
}

function exactSummary(head: string): VerificationSummary {
  const stages = READINESS_VERIFICATION_STAGE_IDS.map((id) => ({
    id,
    status: "PASS" as const,
  }));
  const authoritative: AuthoritativeVerificationSummary = {
    runId: "status-exact-run",
    status: "PASS",
    exitCode: 0,
    disposition: "completion-eligible",
    profileId: "readiness",
    completionClaim: "autonomous_readiness",
    completionEligible: true,
    profileAutonomousReadinessEquivalent: true,
    autonomousReadinessEquivalent: true,
    readinessHistoryMode: "durable-records",
    candidateCommit: head,
    requiredStageCount: stages.length,
    validatedArtifactCount: 1,
    stages,
    passingStageIds: stages.map((stage) => stage.id),
    notReadyStageIds: [],
    previouslyPassingStageIds: stages.map((stage) => stage.id),
    sourceResultPath: "artifacts/exact/source-result.json",
    copiedResultPath: "artifacts/exact/result.json",
    executionProvider: providerIdentity,
  };
  return {
    schemaVersion: VERIFICATION_SUMMARY_SCHEMA_VERSION,
    attempt: 2,
    status: "PASS",
    disposition: "completion-eligible",
    failureKind: null,
    summary: "Exact status fixture passed.",
    startedAt: "2026-08-16T01:00:00.000Z",
    finishedAt: "2026-08-16T01:01:00.000Z",
    commands: [],
    authoritative,
    candidate: {
      baseCommit: head,
      commit: head,
      tree: "5".repeat(40),
      clean: true,
      changedEntriesDigest: "6".repeat(64),
    },
    authoritativeResultSha256: "7".repeat(64),
    changedPaths: [],
    artifactPaths: ["artifacts/exact/result.json"],
    executionProvider: providerIdentity,
  };
}

function completedState(
  root: string,
  head: string,
): {
  readonly state: OrchestratorState;
  readonly summary: VerificationSummary;
} {
  const summary = exactSummary(head);
  const milestone = createMilestoneRecord(
    validProposal({ id: "status-completed", title: "Status completed" }),
    "2026-08-16T00:00:00.000Z",
  );
  return {
    summary,
    state: {
      ...validState(root),
      repository: {
        ...validState(root).repository,
        targetBranch: "main",
        verifiedCommit: head,
      },
      milestones: [
        {
          ...milestone,
          status: "completed",
          attempts: 2,
          timestamps: {
            ...milestone.timestamps,
            readyAt: "2026-08-16T00:00:00.000Z",
            startedAt: "2026-08-16T00:00:01.000Z",
            completedAt: "2026-08-16T01:02:00.000Z",
            updatedAt: "2026-08-16T01:02:00.000Z",
          },
          verificationSummaries: [summary],
          commits: [head],
          workspace: {
            isolation: "standalone-local-clone-branch",
            path: join(root, "artifacts", "workspaces", "status-completed"),
            branch: "loop/status-completed",
            baseCommit: head,
            headCommit: head,
            createdAt: "2026-08-16T00:00:01.000Z",
            preserved: true,
            cleanup: {
              schemaVersion: WORKSPACE_CLEANUP_SCHEMA_VERSION,
              status: "failed",
              reason: "failed-preserve-workspace",
              requestedAt: "2026-08-16T01:02:00.000Z",
              completedAt: null,
              nodeModulesRemovedAt: null,
              diagnosticArchivePath:
                "artifacts/orchestrator/failed/status-completed",
              error: "preserved diagnostic fixture",
            },
          },
          nextAllowedAction: "plan",
        },
      ],
      nextAllowedAction: "plan",
    },
  };
}

describe("status target relation", () => {
  it("classifies current, target-ahead, target-behind, divergent, uninitialized, and unavailable history", async () => {
    const { root, base } = await gitFixture();
    await writeFile(join(root, "seed.txt"), "target ahead\n", "utf8");
    gitOk(root, "add", ".");
    gitOk(root, "commit", "-m", "target ahead");
    const ahead = gitOk(root, "rev-parse", "HEAD");

    gitOk(root, "switch", "--create", "verified-side", base);
    await writeFile(join(root, "verified.txt"), "verified side\n", "utf8");
    gitOk(root, "add", ".");
    gitOk(root, "commit", "-m", "verified side");
    const divergentVerified = gitOk(root, "rev-parse", "HEAD");

    expect(classifyTargetRelation(root, base, base)).toBe("current");
    expect(classifyTargetRelation(root, ahead, base)).toBe("ahead");
    expect(classifyTargetRelation(root, base, ahead)).toBe("behind");
    expect(classifyTargetRelation(root, ahead, divergentVerified)).toBe(
      "divergent",
    );
    expect(classifyTargetRelation(root, ahead, null)).toBe("uninitialized");
    expect(classifyTargetRelation(root, ahead, "f".repeat(40))).toBe(
      "unavailable",
    );
  });
});

describe("expanded status diagnostic", () => {
  it("projects commissioning, state-owned exact evidence, eligibility, latest milestone, and deferred cleanup", async () => {
    const { root, head } = await operationalFixture();
    const generation = "8".repeat(40);
    const { state, summary } = completedState(root, head);
    const doctor = projectedDoctor({
      base: await baseDoctor(root, head),
      head,
      generation,
      exact: summary,
    });
    const result = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe: async () => doctor,
        inspectionProbe: async () => inspection(state, head, generation),
        configuredTargetBranchProbe: async () => "main",
      },
    );

    expect(result).toMatchObject({
      schemaVersion: STATUS_SCHEMA_VERSION,
      diagnostic: "orchestrator-status",
      readOnly: true,
      networkCallsPerformed: 0,
      snapshot: {
        consistency: "stable",
        attempts: 1,
        canonicalGeneration: generation,
      },
      commissioning: {
        valid: true,
        record: {
          manifest: { sha256: "1".repeat(64) },
          targetBranch: "main",
          profile: "readiness",
          invariantSuiteId: "status-invariants.v1",
        },
      },
      profile: "readiness",
      target: {
        branch: "main",
        head,
        verifiedCommit: head,
        relation: "current",
      },
      controller: { available: true, initialized: true },
      latestCompletedMilestone: {
        id: "status-completed",
        completedAt: "2026-08-16T01:02:00.000Z",
        attempts: 2,
        commits: [head],
      },
      latestExactVerification: {
        available: true,
        runId: "status-exact-run",
        resultSha256: "7".repeat(64),
        resultHashMatches: true,
        profile: "readiness",
        current: true,
        completionEligible: true,
        providerMatchesCurrent: true,
        stateRecord: {
          milestoneId: "status-completed",
          attempt: 2,
          finishedAt: "2026-08-16T01:01:00.000Z",
        },
        stateRecordMatches: true,
      },
      trustedExecution: {
        configuredProvider: "trusted-container",
        available: true,
        completionEligible: true,
        identity: providerIdentity,
      },
      autonomousIntegration: { eligible: true, reasons: [] },
      recovery: { disposition: "none" },
      nextAction: { command: "pnpm loop:plan" },
    });
    expect(result.operational.issues).toEqual([]);
    expect(result.deferred.workspaceCleanups).toEqual([
      expect.objectContaining({
        milestoneId: "status-completed",
        workspace: "artifacts/workspaces/status-completed",
        cleanup: expect.objectContaining({ status: "failed" }),
      }),
    ]);
  });

  it("normalizes resumable and blocked pending side effects", async () => {
    const { root, head } = await operationalFixture();
    const generation = "9".repeat(40);
    const base = await baseDoctor(root, head);
    const doctor = projectedDoctor({ base, head, generation });
    const operation = planWorkspaceCreateOperation({
      operationId: "status-workspace-operation",
      inputStateGeneration: generation,
      inputStateRevision: 0,
      repositoryRoot: root,
      configuredWorkspaceRoot: "artifacts/workspaces",
      targetBranch: "main",
      baseCommit: head,
      runId: "status-run",
      milestoneId: "status-milestone",
      attempt: 1,
      now: "2026-08-16T02:00:00.000Z",
    });
    const state = {
      ...validState(root),
      repository: {
        ...validState(root).repository,
        targetBranch: "main",
        verifiedCommit: head,
      },
      pendingOperation: operation,
      nextAllowedAction: "resume-worker" as const,
    };
    const recoverableRecovery: WorkspaceCreateRecoveryInspection = {
      operationId: operation.id,
      classification: "missing",
      temporary: {
        path: operation.temporaryPath,
        disposition: "missing",
        reason: "missing",
      },
      final: {
        path: operation.finalPath,
        disposition: "missing",
        reason: "missing",
      },
      nextSafeAction: "resume-clone",
      message: "Clone can resume from canonical intent.",
      preservedPaths: [],
    };
    const recoverable: OrchestratorInspection["pendingOperation"] = {
      operation,
      recovery: recoverableRecovery,
    };
    const automatic = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe: async () => doctor,
        inspectionProbe: async () =>
          inspection(state, head, generation, recoverable),
        configuredTargetBranchProbe: async () => "main",
      },
    );
    expect(automatic.pendingOperation).toMatchObject({
      id: operation.id,
      kind: "workspace-create",
      recovery: {
        disposition: "automatic",
        classification: "missing",
        nextSafeAction: "resume-clone",
      },
    });
    expect(automatic.recovery).toMatchObject({
      disposition: "automatic",
      command: "pnpm loop:resume -- --one",
    });

    const blockedInspection: OrchestratorInspection["pendingOperation"] = {
      operation,
      recovery: {
        ...recoverableRecovery,
        classification: "ambiguous-paths",
        nextSafeAction: "manual-reconciliation-required",
        message: "Both recorded paths exist and were preserved.",
        preservedPaths: [operation.temporaryPath, operation.finalPath],
      },
    };
    const blocked = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe: async () => doctor,
        inspectionProbe: async () =>
          inspection(state, head, generation, blockedInspection),
        configuredTargetBranchProbe: async () => "main",
      },
    );
    expect(blocked.pendingOperation?.recovery).toMatchObject({
      disposition: "blocked",
      classification: "ambiguous-paths",
      preservedPaths: [operation.temporaryPath, operation.finalPath],
    });
    expect(blocked.recovery).toMatchObject({
      disposition: "blocked",
      command: "pnpm loop:status -- --json",
    });
  });

  it("keeps active reconciliation in the common schema and classifies it as external recovery", async () => {
    const { root, head } = await operationalFixture();
    const generation = "a".repeat(40);
    const record = validReconciliationRecord({
      sourceVerifiedCommit: head,
      targetBranch: "main",
      externalGapReason:
        "external gap Authorization: Bearer status-secret sk-proj-1234567890",
    });
    const state: OrchestratorState = {
      ...validState(root),
      repository: {
        ...validState(root).repository,
        targetBranch: "main",
        verifiedCommit: head,
      },
      reconciliation: { active: record, history: [] },
      nextAllowedAction: "reconcile",
    };
    const doctor = projectedDoctor({
      base: await baseDoctor(root, head),
      head,
      generation,
      nextAction: {
        command: "pnpm loop:reconcile-status",
        reason: "External reconciliation is active.",
      },
    });
    const result = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe: async () => doctor,
        inspectionProbe: async () => inspection(state, head, generation),
        configuredTargetBranchProbe: async () => "main",
      },
    );

    expect(result.diagnostic).toBe("orchestrator-status");
    expect(result.recovery).toMatchObject({
      disposition: "external",
      command: "pnpm loop:reconcile-status",
    });
    expect(result.deferred.reconciliation).toMatchObject({
      active: { id: record.id, status: "active", phase: "prepared" },
      latest: { id: record.id, status: "active", phase: "prepared" },
    });
  });

  it("routes CLI status around an active reconciliation without opening its controller", async () => {
    const { root, head } = await operationalFixture();
    const config = validConfig({ targetBranch: "main" });
    const store = new StateStore(
      root,
      config.statePath,
      () => "2026-08-16T03:00:00.000Z",
    );
    await store.initialize({
      ...validState(root),
      repository: {
        ...validState(root).repository,
        targetBranch: "main",
        verifiedCommit: head,
      },
    });
    const current = await store.loadForMutation();
    if (!current) throw new Error("Expected initialized status state.");
    const record = validReconciliationRecord({
      sourceVerifiedCommit: head,
      targetBranch: "main",
      externalGapReason:
        "external gap Authorization: Bearer status-secret sk-proj-1234567890",
    });
    await store.save({
      ...current,
      controllerHistory: [
        {
          schemaVersion: "1.0.0",
          id: record.sourceArchiveId,
          rawSourceState: record.sourceState,
          sourceStateSchemaVersion: current.schemaVersion,
          sourceRevision: current.revision,
          priorVerifiedCommit: head,
          priorRun: { ...current.run },
          priorQueue: current.queue,
          priorActiveMilestoneId: current.activeMilestoneId,
          priorNextAllowedAction: current.nextAllowedAction,
          archivedAt: "2026-08-16T03:00:00.000Z",
          reason: "external-integration-reconciliation",
        },
      ],
      reconciliation: { active: record, history: [] },
      nextAllowedAction: "reconcile",
    });
    const statePath = join(root, config.statePath);
    const before = {
      mirror: await readFile(statePath, "utf8"),
      stateRef: gitOk(root, "rev-parse", "refs/milestone-loop/state"),
      refs: gitOk(root, "for-each-ref", "--format=%(refname) %(objectname)"),
      status: gitOk(root, "status", "--porcelain=v1", "--untracked-files=all"),
    };
    const command = spawnSync(
      process.execPath,
      [
        join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
        join(process.cwd(), "tools/milestone-orchestrator/src/cli.ts"),
        "status",
        "--",
        "--json",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_user_agent: "pnpm/11.15.1 node/v24.18.0 win32 x64",
        },
        windowsHide: true,
      },
    );
    expect(command.error).toBeUndefined();
    expect(command.status, command.stderr).toBe(0);
    const output = JSON.parse(command.stdout) as Record<string, unknown>;
    expect(output).toMatchObject({
      schemaVersion: STATUS_SCHEMA_VERSION,
      diagnostic: "orchestrator-status",
      readOnly: true,
      recovery: {
        disposition: "external",
        command: "pnpm loop:reconcile-status",
      },
      deferred: {
        reconciliation: {
          active: { id: record.id, phase: "prepared", status: "active" },
        },
      },
    });
    expect(command.stdout).not.toContain("status-secret");
    expect(command.stdout).not.toContain("sk-proj-1234567890");
    expect({
      mirror: await readFile(statePath, "utf8"),
      stateRef: gitOk(root, "rev-parse", "refs/milestone-loop/state"),
      refs: gitOk(root, "for-each-ref", "--format=%(refname) %(objectname)"),
      status: gitOk(root, "status", "--porcelain=v1", "--untracked-files=all"),
    }).toEqual(before);
  }, 20_000);

  it("reports a live lease and classifies target-ahead history as external", async () => {
    const { root, head: verifiedCommit } = await operationalFixture();
    await writeFile(
      join(root, "external.txt"),
      "external target work\n",
      "utf8",
    );
    gitOk(root, "add", ".");
    gitOk(root, "commit", "-m", "external target work");
    const targetHead = gitOk(root, "rev-parse", "HEAD");
    const generation = "d".repeat(40);
    const base = projectedDoctor({
      base: await baseDoctor(root, targetHead),
      head: targetHead,
      generation,
    });
    const doctor: DoctorDiagnostic = {
      ...base,
      checks: {
        ...base.checks,
        controllerLease: {
          ...base.checks.controllerLease,
          status: "block",
          code: "controller-lease-active",
          message: "Another controller lease is active.",
          remediation: "Inspect the exact owner.",
          command: "pnpm loop:status",
          present: true,
          malformed: false,
          owner: {
            pid: 4242,
            hostname: "status-host",
            operation: "run",
            createdAt: "2026-08-16T04:00:00.000Z",
          },
        },
      },
    };
    const state: OrchestratorState = {
      ...validState(root),
      repository: {
        ...validState(root).repository,
        targetBranch: "main",
        verifiedCommit,
      },
    };
    const result = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe: async () => doctor,
        inspectionProbe: async () => inspection(state, targetHead, generation),
        configuredTargetBranchProbe: async () => "main",
      },
    );
    expect(result.target).toMatchObject({
      head: targetHead,
      verifiedCommit,
      relation: "ahead",
    });
    expect(result.lease).toMatchObject({
      status: "block",
      code: "controller-lease-active",
      present: true,
      owner: { pid: 4242, operation: "run" },
    });
    expect(result.recovery).toMatchObject({
      disposition: "external",
      command: "pnpm loop:reconcile-status",
    });
  });

  it("retries a changed canonical generation and refuses to present mixed state", async () => {
    const { root, head } = await operationalFixture();
    const doctor = projectedDoctor({
      base: await baseDoctor(root, head),
      head,
      generation: "b".repeat(40),
    });
    const state = completedState(root, head).state;
    const doctorProbe = vi.fn(async () => doctor);
    const inspectionProbe = vi.fn(async () =>
      inspection(state, head, "c".repeat(40)),
    );
    const result = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe,
        inspectionProbe,
        configuredTargetBranchProbe: async () => "main",
      },
    );

    expect(doctorProbe).toHaveBeenCalledTimes(2);
    expect(inspectionProbe).toHaveBeenCalledTimes(2);
    expect(result.snapshot).toMatchObject({
      consistency: "changed-during-inspection",
      attempts: 2,
    });
    expect(result.controller).toMatchObject({
      available: false,
      initialized: null,
      state: { state: "unavailable" },
    });
    expect(result.latestCompletedMilestone).toBeNull();
    expect(result.nextAction).toEqual({
      command: "pnpm loop:status -- --json",
      reason:
        "Canonical state or target identity changed during status inspection; rerun status for one stable generation.",
    });
    expect(result.recovery.disposition).toBe("blocked");
    expect(result.autonomousIntegration).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["statusSnapshotConsistency"]),
    });
  });

  it("also rejects a target branch that advances between Doctor and status sampling", async () => {
    const { root, head } = await operationalFixture();
    const generation = "e".repeat(40);
    const doctor = projectedDoctor({
      base: await baseDoctor(root, head),
      head,
      generation,
    });
    const state: OrchestratorState = {
      ...validState(root),
      repository: {
        ...validState(root).repository,
        targetBranch: "main",
        verifiedCommit: head,
      },
    };
    await writeFile(
      join(root, "advanced.txt"),
      "advanced during status\n",
      "utf8",
    );
    gitOk(root, "add", ".");
    gitOk(root, "commit", "-m", "advance during status");

    const result = await runStatusDiagnostic(
      { repositoryRoot: root },
      {
        doctorProbe: async () => doctor,
        inspectionProbe: async () => inspection(state, head, generation),
        configuredTargetBranchProbe: async () => "main",
      },
    );
    expect(result.snapshot).toMatchObject({
      consistency: "changed-during-inspection",
      attempts: 2,
    });
    expect(result.controller.available).toBe(false);
    expect(result.nextAction.command).toBe("pnpm loop:status -- --json");
  });

  it("uses the real read-only authorities without creating state, refs, paths, or working-tree changes", async () => {
    const { root, head } = await operationalFixture();
    const statePath = join(root, "artifacts/orchestrator/state/state.json");
    const before = {
      head: gitOk(root, "rev-parse", "HEAD"),
      tree: gitOk(root, "write-tree"),
      status: gitOk(root, "status", "--porcelain=v1", "--untracked-files=all"),
      refs: gitOk(root, "for-each-ref", "--format=%(refname) %(objectname)"),
      inventory: treeInventory(root),
      statePath: existsSync(statePath),
    };

    const result = await runStatusDiagnostic({ repositoryRoot: root });

    const after = {
      head: gitOk(root, "rev-parse", "HEAD"),
      tree: gitOk(root, "write-tree"),
      status: gitOk(root, "status", "--porcelain=v1", "--untracked-files=all"),
      refs: gitOk(root, "for-each-ref", "--format=%(refname) %(objectname)"),
      inventory: treeInventory(root),
      statePath: existsSync(statePath),
    };
    expect(result).toMatchObject({
      schemaVersion: "1.0.0",
      diagnostic: "orchestrator-status",
      readOnly: true,
      snapshot: { consistency: "stable" },
      target: {
        branch: "main",
        head,
        verifiedCommit: null,
        relation: "uninitialized",
      },
      controller: {
        available: true,
        initialized: false,
        state: { state: "uninitialized" },
      },
      pendingOperation: null,
      recovery: { disposition: "none" },
    });
    expect(after).toEqual(before);
    expect(readFileSync(join(root, "package.json"), "utf8")).not.toContain(
      "redacted-test-value",
    );
  });
});
