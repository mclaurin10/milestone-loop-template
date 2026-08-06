import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  READINESS_VERIFICATION_STAGE_IDS,
  RECONCILIATION_PHASES,
  RECONCILIATION_REVIEW_CHECK_IDS,
  type OrchestratorState,
  type ReconciliationPhase,
  type ReconciliationReview,
} from "./contracts.js";
import {
  createCommitRangeManifest,
  ReconciliationController,
  ReconciliationInterruption,
  type ReconciliationDependencies,
} from "./reconciliation.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { createInitialState } from "./state-store.js";
import { validConfig, validFeatureProposal } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(repositoryRoot: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function fixtureArtifactReference(root: string, path: string) {
  const contents = await readFile(path);
  return {
    path: relative(root, path).replaceAll("\\", "/"),
    sha256: sha256(contents),
    bytes: contents.byteLength,
  };
}

interface Fixture {
  readonly root: string;
  readonly configPath: string;
  readonly sourceCommit: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly rawState: Buffer;
}

async function fixtureRepository(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "milestone-reconciliation-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Reconciliation Test");
  git(root, "config", "user.email", "reconciliation@example.invalid");
  await Promise.all([
    mkdir(join(root, ".agent", "completed"), { recursive: true }),
    mkdir(join(root, "docs"), { recursive: true }),
  ]);
  await writeFile(join(root, ".gitignore"), "artifacts/\n");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "reconciliation-fixture",
        private: true,
        milestoneLoop: { verification: { defaultProfile: "readiness" } },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "PROJECT_GOAL.md"), "Frozen test goal.\n");
  await writeFile(join(root, "docs", "history.md"), "Tracked history.\n");
  await writeFile(
    join(root, ".agent", "completed", "loop-recommissioning-verification.json"),
    await readFile(
      resolve(".agent", "completed", "loop-recommissioning-verification.json"),
    ),
  );
  const configPath = join(root, "orchestrator-config.json");
  await writeFile(configPath, `${JSON.stringify(validConfig(), null, 2)}\n`);
  // Every canonical trust root must exist on disk: the leased reconciliation
  // run backfills their hashes into the protected baseline fail-closed.
  const canonicalPlaceholders: string[] = [];
  for (const path of buildCanonicalProtectedSet(validConfig())) {
    const absolute = join(root, ...path.split("/"));
    if (existsSync(absolute)) continue;
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${path}\n`, "utf8");
    canonicalPlaceholders.push(path);
  }
  git(
    root,
    "add",
    ".gitignore",
    "package.json",
    "PROJECT_GOAL.md",
    "docs/history.md",
    ".agent/completed/loop-recommissioning-verification.json",
    "orchestrator-config.json",
    ...canonicalPlaceholders,
  );
  git(root, "commit", "-m", "source boundary");
  const sourceCommit = git(root, "rev-parse", "HEAD");
  const goal = await readFile(join(root, "PROJECT_GOAL.md"));
  const state = createInitialState({
    repositoryRoot: root,
    targetBranch: "main",
    verifiedCommit: sourceCommit,
    protectedFiles: [{ path: "PROJECT_GOAL.md", sha256: sha256(goal) }],
    now: "2026-08-04T00:00:00.000Z",
  });
  const legacy = structuredClone(state) as unknown as Record<string, unknown>;
  legacy["schemaVersion"] = "1.1.0";
  delete legacy["evidenceRetention"];
  delete legacy["requiredNextVerticalConsumer"];
  delete legacy["controllerHistory"];
  delete legacy["reconciliation"];
  const statePath = join(
    root,
    "artifacts",
    "orchestrator",
    "state",
    "state.json",
  );
  await mkdir(resolve(statePath, ".."), { recursive: true });
  const rawState = Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`);
  await writeFile(statePath, rawState);

  const proposal = validFeatureProposal({
    id: "complete-operations-base-utilities",
    title: "Complete the operations base utility foothold",
  });
  await writeFile(
    join(root, ".agent", "next-milestone.json"),
    `${JSON.stringify(proposal, null, 2)}\n`,
  );
  await writeFile(join(root, "external-work.txt"), "direct work one\n");
  git(root, "add", ".agent/next-milestone.json", "external-work.txt");
  git(root, "commit", "-m", "external direct work one");
  const firstExternalCommit = git(root, "rev-parse", "HEAD");
  await writeFile(
    join(root, "docs", "history.md"),
    `Tracked history cites ${firstExternalCommit}.\n`,
  );
  await writeFile(join(root, "external-work.txt"), "direct work two\n");
  git(root, "add", "docs/history.md", "external-work.txt");
  git(root, "commit", "-m", "external direct work two");

  await Promise.all([
    mkdir(join(root, "artifacts", "benchmarks", "benchmark-fixture"), {
      recursive: true,
    }),
    mkdir(join(root, "artifacts", "inventory", "inventory-fixture"), {
      recursive: true,
    }),
  ]);
  await writeFile(
    join(
      root,
      "artifacts",
      "benchmarks",
      "benchmark-fixture",
      "benchmark.json",
    ),
    '{"schemaVersion":"1.0.0","status":"PASS"}\n',
  );
  await writeFile(
    join(root, "artifacts", "inventory", "inventory-fixture", "inventory.json"),
    '{"schemaVersion":"1.0.0","status":"read-only"}\n',
  );
  return {
    root,
    configPath,
    sourceCommit,
    candidateCommit: git(root, "rev-parse", "HEAD"),
    candidateTree: git(root, "rev-parse", "HEAD^{tree}"),
    rawState,
  };
}

function exactCommandRecord() {
  return {
    id: "exact-readiness",
    argv: ["pnpm", "verify"],
    status: "NOT_READY",
    exitCode: 2,
    signal: null,
    startedAt: "2026-08-04T00:00:00.000Z",
    finishedAt: "2026-08-04T00:00:01.000Z",
    durationMs: 1000,
    stdoutPath: "artifacts/logs/exact-readiness.stdout.log",
    stderrPath: "artifacts/logs/exact-readiness.stderr.log",
    receipt: null,
    receiptAbsenceReason: "Exact readiness evidence is indexed separately.",
    artifactCount: 0,
    artifactBytes: 0,
    testCounts: null,
    failureClass: null,
    message: "Exact readiness remains NOT_READY.",
  } as const;
}

async function focusedCommandRecord(
  fixture: Fixture,
  command: {
    readonly id: string;
    readonly argv: readonly string[];
    readonly expectedArtifactKinds: readonly string[];
  },
  index: number,
) {
  const evidenceDirectory = join(
    fixture.root,
    "artifacts",
    "verification-tiers",
    "verification-tier-milestone-fixture",
    "commands",
    `${String(index + 1).padStart(2, "0")}-${command.id}`,
    "evidence",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  const kinds =
    command.expectedArtifactKinds.length > 0
      ? command.expectedArtifactKinds
      : ["fixture-command-evidence"];
  const artifacts = [];
  for (const [artifactIndex, kind] of kinds.entries()) {
    const path = `artifact-${String(artifactIndex + 1).padStart(2, "0")}.json`;
    const contents = `${JSON.stringify({ status: "PASS", kind })}\n`;
    await writeFile(join(evidenceDirectory, path), contents);
    artifacts.push({
      path,
      kind,
      bytes: Buffer.byteLength(contents),
      sha256: sha256(contents),
    });
  }
  const receipt = {
    schemaVersion: "1.0.0",
    stageId: "verification-tier-milestone",
    commandId: command.id,
    status: "PASS",
    checks: [
      {
        id: `${command.id}-fixture-check`,
        status: "PASS",
        summary: "Fixture command crossed its evidence boundary.",
      },
    ],
    artifacts,
  };
  const receiptContents = `${JSON.stringify(receipt, null, 2)}\n`;
  const receiptPath = join(evidenceDirectory, "result.json");
  await writeFile(receiptPath, receiptContents);
  return {
    id: command.id,
    argv: command.argv,
    status: "PASS" as const,
    exitCode: 0 as const,
    signal: null,
    startedAt: "2026-08-04T00:00:00.000Z",
    finishedAt: "2026-08-04T00:00:01.000Z",
    durationMs: 1000,
    stdoutPath: `artifacts/logs/${command.id}.stdout.log`,
    stderrPath: `artifacts/logs/${command.id}.stderr.log`,
    receipt: {
      path: relative(fixture.root, receiptPath).replaceAll("\\", "/"),
      sha256: sha256(receiptContents),
      bytes: Buffer.byteLength(receiptContents),
    },
    receiptAbsenceReason: null,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    testCounts: null,
    failureClass: null,
    message: "Focused command passed.",
  };
}

async function writeMilestoneTier(fixture: Fixture): Promise<string> {
  const runId = "reconciliation-milestone-fixture";
  const exactDirectory = join(fixture.root, "artifacts", runId);
  await mkdir(exactDirectory, { recursive: true });
  const stages = READINESS_VERIFICATION_STAGE_IDS.map((id, index) => ({
    id,
    status: index < 5 ? "PASS" : "NOT_READY",
  }));
  const exactCandidate = {
    gitCommit: git(fixture.root, "rev-parse", "HEAD"),
    gitTree: git(fixture.root, "rev-parse", "HEAD^{tree}"),
    workingTreeDirty: false,
  };
  const exact = {
    schemaVersion: "2.1.0",
    runId,
    status: "NOT_READY",
    exitCode: 2,
    invocation: ["node", "scripts/verify.mjs"],
    profile: {
      id: "readiness",
      configuredDefault: "readiness",
      selectedByOverride: false,
    },
    completion: {
      claim: "autonomous_readiness",
      eligible: false,
      reasons: ["verification_status_not_pass"],
    },
    candidate: exactCandidate,
    candidateFinal: exactCandidate,
    identityDrift: { detected: false, fields: [] },
    summary: {
      stageCounts: { PASS: 5, NOT_READY: 10, FAIL: 0, ERROR: 0 },
      requiredStageCount: 15,
    },
    stages,
  };
  const exactPath = join(exactDirectory, "result.json");
  const exactText = `${JSON.stringify(exact, null, 2)}\n`;
  await writeFile(exactPath, exactText);
  const tierDirectory = join(
    fixture.root,
    "artifacts",
    "verification-tiers",
    "verification-tier-milestone-fixture",
  );
  await mkdir(tierDirectory, { recursive: true });
  const exactRelative =
    "artifacts/reconciliation-milestone-fixture/result.json";
  const verificationManifest = JSON.parse(
    await readFile(
      join(
        fixture.root,
        ".agent",
        "completed",
        "loop-recommissioning-verification.json",
      ),
      "utf8",
    ),
  ) as {
    focusedCommands: {
      id: string;
      argv: string[];
      tiers: string[];
      expectedArtifactKinds: string[];
    }[];
  };
  const requiredCommands = verificationManifest.focusedCommands.filter(
    (command) => command.tiers.includes("milestone"),
  );
  const requiredIds = requiredCommands.map((command) => command.id);
  const commandRecords = [];
  for (const [index, command] of requiredCommands.entries())
    commandRecords.push(await focusedCommandRecord(fixture, command, index));
  const tierCandidate = {
    baseCommit: fixture.sourceCommit,
    gitCommit: exact.candidate.gitCommit,
    gitTree: exact.candidate.gitTree,
    workingTreeDirty: false,
  };
  const tier = {
    schemaVersion: "1.1.0",
    runId: "verification-tier-milestone-fixture",
    tier: "milestone",
    status: "NOT_READY",
    exitCode: 2,
    authoritative: false,
    candidate: tierCandidate,
    changedPaths: ["external-work.txt"],
    invariantSuiteId: "fixture-invariants",
    invariantSuiteSha256: "a".repeat(64),
    scopePolicySha256: "b".repeat(64),
    shadowSelectionPath: null,
    selectedCheckIds: requiredIds,
    actualCheckIds: requiredIds,
    fullClosureCheckIds: requiredIds,
    commands: [...commandRecords, exactCommandRecord()],
    exactVerification: {
      invokedWithNoArguments: true,
      resultPath: exactRelative,
      resultSha256: sha256(exactText),
      status: "NOT_READY",
      exitCode: 2,
      disposition: "incremental-readiness",
      profileId: "readiness",
      selectedByOverride: false,
      candidateCommit: exact.candidate.gitCommit,
      candidateTree: exact.candidate.gitTree,
    },
    candidateFinal: tierCandidate,
    identityDrift: { detected: false, fields: [] },
    reviewRequired: true,
    telemetryManifestPath: null,
    startedAt: "2026-08-04T00:00:00.000Z",
    finishedAt: "2026-08-04T00:00:02.000Z",
    durationMs: 2000,
  };
  const tierPath = join(tierDirectory, "tier-result.json");
  await writeFile(tierPath, `${JSON.stringify(tier, null, 2)}\n`);
  return "artifacts/verification-tiers/verification-tier-milestone-fixture/tier-result.json";
}

function approvedReview(
  record: Parameters<NonNullable<ReconciliationDependencies["review"]>>[0],
): ReconciliationReview {
  return {
    schemaVersion: "1.0.0",
    reconciliationId: record.record.id,
    sourceVerifiedCommit: record.record.sourceVerifiedCommit,
    candidateCommit: record.record.candidateCommit,
    candidateTree: record.record.candidateTree,
    commitRangeManifestSha256: record.record.commitRange.sha256,
    decision: "approve",
    summary: "Every required exact-range reconciliation check passes.",
    findings: [],
    checks: Object.fromEntries(
      RECONCILIATION_REVIEW_CHECK_IDS.map((check) => [check, true]),
    ) as ReconciliationReview["checks"],
    threadId: "fresh-reconciliation-reviewer",
    reviewedAt: "2026-08-04T00:00:10.000Z",
  };
}

function dependencies(
  fixture: Fixture,
  input: {
    readonly interruptAfter?: ReconciliationPhase;
    readonly rejectReview?: boolean;
  } = {},
) {
  return {
    now: (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 7, 4, 0, 0, tick++));
    })(),
    executeMilestoneTier: () => writeMilestoneTier(fixture),
    supportingArtifacts: async () => ({
      benchmark: await fixtureArtifactReference(
        fixture.root,
        join(
          fixture.root,
          "artifacts",
          "benchmarks",
          "benchmark-fixture",
          "benchmark.json",
        ),
      ),
      inventory: await fixtureArtifactReference(
        fixture.root,
        join(
          fixture.root,
          "artifacts",
          "inventory",
          "inventory-fixture",
          "inventory.json",
        ),
      ),
    }),
    review: async (reviewInput: Parameters<typeof approvedReview>[0]) => {
      const report = {
        ...approvedReview(reviewInput),
        ...(input.rejectReview
          ? {
              decision: "reject" as const,
              summary: "Injected independent rejection.",
              checks: {
                ...approvedReview(reviewInput).checks,
                stateMigrationAndRecovery: false,
              },
            }
          : {}),
      };
      await writeFile(
        join(reviewInput.artifactDirectory, "reviewer-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    },
    ...(input.interruptAfter
      ? {
          afterPhasePersisted(phase: ReconciliationPhase) {
            if (phase === input.interruptAfter)
              throw new ReconciliationInterruption(phase);
          },
        }
      : {}),
  };
}

const invocation = {
  candidate: "HEAD",
  nextProposalPath: ".agent/next-milestone.json",
  reason: "external-direct-loop-gap",
} as const;

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
    return null;
  } catch (error) {
    return error;
  }
}

async function runHappyLifecycleScenario() {
  const fixture = await fixtureRepository();
  const manifest = createCommitRangeManifest({
    repositoryRoot: fixture.root,
    reconciliationId: "range-fixture",
    sourceVerifiedCommit: fixture.sourceCommit,
    candidateCommit: fixture.candidateCommit,
    protectedPaths: ["PROJECT_GOAL.md"],
  });

  const invalid = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    dependencies(fixture),
  );
  const invalidError = await captureError(() =>
    invalid.run({ ...invocation, nextProposalPath: "docs/history.md" }),
  );
  const invalidState = structuredClone(invalid.state);
  const rawStateAfterInvalid = await readFile(
    join(fixture.root, "artifacts", "orchestrator", "state", "state.json"),
  );

  const phaseErrors = new Map<ReconciliationPhase, unknown>();
  const phaseStates = new Map<ReconciliationPhase, OrchestratorState>();
  const resumablePhases = RECONCILIATION_PHASES.filter(
    (phase) => phase !== "failed",
  ) as ReconciliationPhase[];
  for (const phase of resumablePhases) {
    const controller = await ReconciliationController.open(
      fixture.root,
      fixture.configPath,
      dependencies(fixture, { interruptAfter: phase }),
    );
    const error = await captureError(() => controller.run(invocation));
    if (!(error instanceof ReconciliationInterruption))
      throw new Error(
        `Expected a durable reconciliation interruption after ${phase}.`,
      );
    phaseErrors.set(phase, error);
    phaseStates.set(phase, structuredClone(controller.state));
  }

  const repeated = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    dependencies(fixture),
  );
  const repeatedStatus = await repeated.run({
    ...invocation,
    nextProposalPath: resolve(fixture.root, ".agent", "next-milestone.json"),
  });
  return {
    fixture,
    manifest,
    invalidError,
    invalidState,
    rawStateAfterInvalid,
    phaseErrors,
    phaseStates,
    repeatedStatus,
    finalState: structuredClone(repeated.state),
  };
}

async function runFailureRecoveryScenario() {
  const fixture = await fixtureRepository();
  const baseDependencies = dependencies(fixture);
  const missingReceipt = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    {
      ...baseDependencies,
      executeMilestoneTier: async () => {
        const tierPath = await writeMilestoneTier(fixture);
        const tier = JSON.parse(
          await readFile(resolve(fixture.root, tierPath), "utf8"),
        ) as {
          commands: { receipt: { path: string } | null }[];
        };
        const receiptPath = tier.commands[0]?.receipt?.path;
        if (!receiptPath) throw new Error("Fixture receipt is missing.");
        await rm(resolve(fixture.root, receiptPath), { force: true });
        return tierPath;
      },
    },
  );
  const missingReceiptError = await captureError(() =>
    missingReceipt.run(invocation),
  );
  const missingReceiptState = structuredClone(missingReceipt.state);

  const interrupted = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    dependencies(fixture, { interruptAfter: "candidate-verified" }),
  );
  const candidateVerifiedError = await captureError(() =>
    interrupted.run(invocation),
  );
  if (!(candidateVerifiedError instanceof ReconciliationInterruption))
    throw new Error(
      "Expected a durable candidate-verified interruption before drift.",
    );
  const candidateVerifiedState = structuredClone(interrupted.state);

  await writeFile(join(fixture.root, "candidate-drift.txt"), "new commit\n");
  git(fixture.root, "add", "candidate-drift.txt");
  git(fixture.root, "commit", "-m", "candidate drift");
  const driftedCandidateCommit = git(fixture.root, "rev-parse", "HEAD");
  const resumed = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    dependencies(fixture),
  );
  const driftError = await captureError(() => resumed.run(invocation));
  const driftState = structuredClone(resumed.state);

  const rejected = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    dependencies(fixture, { rejectReview: true }),
  );
  const reviewError = await captureError(() => rejected.run(invocation));
  const reviewRejectedState = structuredClone(rejected.state);

  const retry = await ReconciliationController.open(
    fixture.root,
    fixture.configPath,
    dependencies(fixture),
  );
  const retryStatus = await retry.run(invocation);
  return {
    fixture,
    missingReceiptError,
    missingReceiptState,
    candidateVerifiedError,
    candidateVerifiedState,
    driftedCandidateCommit,
    driftError,
    driftState,
    reviewError,
    reviewRejectedState,
    retryStatus,
    retryState: structuredClone(retry.state),
  };
}

let happyLifecyclePromise:
  ReturnType<typeof runHappyLifecycleScenario> | undefined;
let failureRecoveryPromise:
  ReturnType<typeof runFailureRecoveryScenario> | undefined;

function happyLifecycleScenario() {
  happyLifecyclePromise ??= runHappyLifecycleScenario();
  return happyLifecyclePromise;
}

function failureRecoveryScenario() {
  failureRecoveryPromise ??= runFailureRecoveryScenario();
  return failureRecoveryPromise;
}

describe("controller-boundary reconciliation", { timeout: 60_000 }, () => {
  it("records the complete continuous external commit range with exact metadata and citations", async () => {
    const { fixture, manifest } = await happyLifecycleScenario();

    expect(manifest.commitCount).toBe(2);
    expect(manifest.records.at(-1)).toMatchObject({
      sha: fixture.candidateCommit,
      tree: fixture.candidateTree,
      protectedPathOverlap: [],
    });
    expect(manifest.records[0]?.exactEvidenceCitations).toEqual([
      "docs/history.md",
    ]);
    expect(manifest.recordsSha256).toBe(
      sha256(JSON.stringify(manifest.records)),
    );
  });

  it("archives raw state before mutation, adopts only after approval, and queues without an invented planner", async () => {
    const { fixture, finalState, repeatedStatus } =
      await happyLifecycleScenario();

    expect(repeatedStatus.active).toBeNull();
    expect(finalState).toMatchObject({
      schemaVersion: "1.6.0",
      repository: { verifiedCommit: fixture.candidateCommit },
      queue: ["complete-operations-base-utilities"],
      activeMilestoneId: null,
      run: { status: "idle", usage: { codexInvocations: 0 } },
      reconciliation: { active: null },
      nextAllowedAction: "start-milestone",
    });
    const completed = finalState.reconciliation.history.at(-1);
    expect(completed).toMatchObject({
      status: "completed",
      phase: "completed",
    });
    const archive = finalState.controllerHistory.at(-1);
    expect(archive).toBeDefined();
    expect(
      await readFile(resolve(fixture.root, archive?.rawSourceState.path ?? "")),
    ).toEqual(fixture.rawState);
    expect(archive?.rawSourceState.sha256).toBe(sha256(fixture.rawState));
    const adoption = JSON.parse(
      await readFile(
        resolve(fixture.root, completed?.adoption?.path ?? ""),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(adoption).toMatchObject({
      priorRun: archive?.priorRun,
      priorQueue: archive?.priorQueue,
      priorActiveMilestoneId: archive?.priorActiveMilestoneId,
      priorNextAllowedAction: archive?.priorNextAllowedAction,
    });
    const queued = finalState.milestones.at(-1);
    expect(queued).toMatchObject({
      attempts: 0,
      commits: [],
      proposalProvenance: {
        source: "tracked-recommissioning-plan",
        plannerThreadId: null,
      },
    });
    expect(repeatedStatus).toMatchObject({
      active: null,
      nextAllowedAction: "start-milestone",
    });
    expect(finalState.controllerHistory).toHaveLength(1);
    expect(finalState.reconciliation.history).toHaveLength(1);
  });

  it("rejects a next proposal outside the tracked recommissioning manifest without mutating state", async () => {
    const { fixture, invalidError, invalidState, rawStateAfterInvalid } =
      await happyLifecycleScenario();
    expect(invalidError).toBeInstanceOf(Error);
    expect((invalidError as Error).message).toMatch(
      /tracked recommissioning manifest/,
    );
    expect(invalidState.controllerHistory).toEqual([]);
    expect(invalidState.reconciliation).toEqual({
      active: null,
      history: [],
    });
    expect(rawStateAfterInvalid).toEqual(fixture.rawState);
  });

  it.each(
    RECONCILIATION_PHASES.filter(
      (phase) => phase !== "failed",
    ) as ReconciliationPhase[],
  )("resumes idempotently after interruption at %s", async (phase) => {
    const { phaseErrors, phaseStates, finalState } =
      await happyLifecycleScenario();
    const error = phaseErrors.get(phase);
    const state = phaseStates.get(phase);
    expect(error).toBeInstanceOf(ReconciliationInterruption);
    expect((error as Error).message).toContain(`phase ${phase}`);
    expect(state).toBeDefined();
    if (phase === "completed") {
      expect(state?.reconciliation.active).toBeNull();
      expect(state?.reconciliation.history.at(-1)).toMatchObject({
        status: "completed",
        phase: "completed",
      });
    } else {
      expect(state?.reconciliation.active?.phase).toBe(phase);
    }
    expect(finalState.controllerHistory).toHaveLength(1);
    expect(finalState.reconciliation.history).toHaveLength(1);
    expect(finalState.nextAllowedAction).toBe("start-milestone");
  });

  it("keeps the old verified commit authoritative when review rejects", async () => {
    const {
      fixture,
      reviewError,
      reviewRejectedState,
      retryStatus,
      retryState,
      driftedCandidateCommit,
    } = await failureRecoveryScenario();
    expect(reviewError).toBeInstanceOf(Error);
    expect((reviewError as Error).message).toMatch(/review rejected adoption/);
    expect(reviewRejectedState.repository.verifiedCommit).toBe(
      fixture.sourceCommit,
    );
    expect(reviewRejectedState.reconciliation.active).toBeNull();
    expect(reviewRejectedState.reconciliation.history.at(-1)).toMatchObject({
      status: "failed",
      phase: "failed",
      independentReview: { decision: "reject" },
      failure: { classification: "review" },
    });
    const failed = reviewRejectedState.reconciliation.history.at(-1);
    expect(failed?.failure?.evidence.map((entry) => entry.path)).toContain(
      failed?.independentReview?.path,
    );
    expect(reviewRejectedState.nextAllowedAction).toBe("reconcile");
    expect(retryStatus).toMatchObject({
      active: null,
      nextAllowedAction: "start-milestone",
    });
    expect(retryState.repository.verifiedCommit).toBe(driftedCandidateCommit);
    expect(retryState.reconciliation.history).toHaveLength(
      reviewRejectedState.reconciliation.history.length + 1,
    );
    expect(
      new Set(retryState.reconciliation.history.map((record) => record.id))
        .size,
    ).toBe(retryState.reconciliation.history.length);
    expect(retryState.controllerHistory).toHaveLength(
      reviewRejectedState.controllerHistory.length + 1,
    );
  });

  it("rejects a missing focused command receipt before independent review", async () => {
    const { fixture, missingReceiptError, missingReceiptState } =
      await failureRecoveryScenario();
    expect(missingReceiptError).toBeInstanceOf(Error);
    expect((missingReceiptError as Error).message).toMatch(
      /evidence receipt is missing/,
    );
    expect(missingReceiptState.repository.verifiedCommit).toBe(
      fixture.sourceCommit,
    );
    expect(missingReceiptState.reconciliation.history.at(-1)).toMatchObject({
      status: "failed",
      phase: "failed",
      failure: { classification: "policy" },
    });
  });

  it("invalidates pre-adoption evidence and returns to prepared on clean candidate drift", async () => {
    const {
      fixture,
      candidateVerifiedError,
      candidateVerifiedState,
      driftedCandidateCommit,
      driftError,
      driftState,
    } = await failureRecoveryScenario();
    expect(candidateVerifiedError).toBeInstanceOf(ReconciliationInterruption);
    expect(candidateVerifiedState.reconciliation.active?.phase).toBe(
      "candidate-verified",
    );
    expect(driftError).toBeInstanceOf(Error);
    expect((driftError as Error).message).toMatch(/candidate changed/);
    expect(driftState.repository.verifiedCommit).toBe(fixture.sourceCommit);
    expect(driftState.reconciliation.active).toMatchObject({
      phase: "prepared",
      candidateCommit: driftedCandidateCommit,
      focusedEvidenceIndex: null,
      exactVerification: null,
      independentReview: null,
    });
  });
});
