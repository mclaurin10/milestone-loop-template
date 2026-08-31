import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexGateway } from "./codex-gateway.js";
import {
  spawnBoundedSync,
  SYNCHRONOUS_COMMAND_TIMEOUT_MS,
} from "./bounded-spawn-sync.js";
import {
  CANDIDATE_PREPARE_FAULT_POINTS,
  inspectCandidatePrepareOperation,
  type CandidatePrepareFaultPoint,
} from "./candidate-prepare.js";
import type { MilestoneRecord, OrchestratorState } from "./contracts.js";
import { captureProtectedFiles } from "./git-isolation.js";
import { loadConfigForInspection } from "./config.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  CandidatePrepareBlockedError,
  MilestoneOrchestrator,
} from "./orchestrator.js";
import { createInitialState, StateStore } from "./state-store.js";
import { runDoctorDiagnostic } from "./doctor.js";
import { runStatusDiagnostic } from "./status.js";
import { enforcementProtectedPatterns } from "./protected-roots.js";
import { createIsolatedWorkspaceFixture } from "../test/workspace-fixture.js";
import { validConfig, validProposal } from "../test/fixtures.js";

const NOW = "2026-08-23T20:00:00.000Z";
const MILESTONE_ID = "cpb";
const CLEANUP_TIMEOUT_MS = 120_000;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
}, CLEANUP_TIMEOUT_MS);

function git(repository: string, ...args: string[]): string {
  const result = spawnBoundedSync("git", ["-C", repository, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: NOW,
      GIT_COMMITTER_DATE: NOW,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

interface RunningFixture {
  readonly root: string;
  readonly configPath: string;
  readonly statePath: string;
  readonly workspacePath: string;
  readonly baseCommit: string;
  readonly runDirectory: string;
}

async function runningFixture(
  configOverrides: Parameters<typeof validConfig>[0] = {},
): Promise<RunningFixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cpb-")));
  expect(await realpath(root)).toBe(root);
  temporaryDirectories.push(root);
  const config = validConfig(configOverrides);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Candidate Prepare Baseline");
  git(root, "config", "user.email", "candidate-prepare@example.invalid");
  for (const path of config.protectedPaths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `${path}\n`, "utf8");
  }
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ milestoneLoop: { verification: { defaultProfile: "readiness" } } })}\n`,
    "utf8",
  );
  await writeFile(
    join(root, ".gitignore"),
    "artifacts/\nnode_modules/\n",
    "utf8",
  );
  await writeFile(join(root, "change.txt"), "base\n", "utf8");
  const configPath = "orchestrator-config.json";
  await writeFile(
    join(root, configPath),
    `${JSON.stringify(config)}\n`,
    "utf8",
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture base");
  const baseCommit = git(root, "rev-parse", "HEAD");
  const workspace = await createIsolatedWorkspaceFixture({
    repositoryRoot: root,
    workspaceRoot: config.workspaceRoot,
    targetBranch: config.targetBranch,
    baseCommit,
    runId: "cpb-run",
    milestoneId: MILESTONE_ID,
    now: NOW,
  });
  const proposal = validProposal({
    id: MILESTONE_ID,
    permittedPaths: ["change.txt"],
  });
  const milestone = createMilestoneRecord(proposal, NOW);
  const running = {
    ...milestone,
    status: "running" as const,
    attempts: 1,
    workspace,
    timestamps: {
      ...milestone.timestamps,
      readyAt: NOW,
      startedAt: NOW,
      updatedAt: NOW,
    },
    nextAllowedAction: "resume-worker" as const,
  };
  const protectedFiles = await captureProtectedFiles(root, [
    ...config.protectedPaths,
    configPath,
  ]);
  const initial = createInitialState({
    repositoryRoot: root,
    targetBranch: config.targetBranch,
    verifiedCommit: baseCommit,
    protectedFiles,
    now: NOW,
  });
  const runDirectory = join(root, config.artifactRoot, "cpb-run");
  const state: OrchestratorState = {
    ...initial,
    queue: [MILESTONE_ID],
    milestones: [running],
    activeMilestoneId: MILESTONE_ID,
    run: {
      ...initial.run,
      id: "cpb-run",
      status: "running",
      startedAt: NOW,
      deadlineAt: "2026-08-24T20:00:00.000Z",
      artifactDirectory: runDirectory,
    },
    nextAllowedAction: "resume-worker",
  };
  const store = new StateStore(root, config.statePath, () => NOW);
  await store.initialize(state);
  return {
    root,
    configPath,
    statePath: config.statePath,
    workspacePath: workspace.path,
    baseCommit,
    runDirectory,
  };
}

async function loadState(fixture: RunningFixture): Promise<OrchestratorState> {
  const state = await new StateStore(
    fixture.root,
    fixture.statePath,
    () => NOW,
  ).load();
  if (!state) throw new Error("Expected initialized candidate baseline state.");
  return state;
}

async function writeBaselineObservation(
  name: string,
  value: unknown,
): Promise<void> {
  const root = process.env["CANDIDATE_PREPARE_BASELINE_EVIDENCE_ROOT"];
  if (!root) return;
  const path = resolve(root, `${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function invokeWorkerBoundary(orchestrator: MilestoneOrchestrator) {
  await (
    orchestrator as unknown as {
      runWorker(id: string): Promise<void>;
    }
  ).runWorker(MILESTONE_ID);
}

async function faultWorker(metadataPath: string): Promise<{
  readonly error: Error | undefined;
  readonly status: number | null;
  readonly stderr: string;
}> {
  const worker = resolve(
    "tools/milestone-orchestrator/test/candidate-prepare-baseline-worker.ts",
  );
  const tsx = resolve("node_modules/tsx/dist/cli.mjs");
  const child = spawn(process.execPath, [tsx, worker, metadataPath], {
    cwd: process.cwd(),
    windowsHide: true,
    timeout: 60_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let error: Error | undefined;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.once("error", (cause) => {
    error = cause;
  });
  const status = await new Promise<number | null>((resolveStatus) => {
    child.once("close", (code) => resolveStatus(code));
  });
  return { error, status, stderr };
}

async function fileSha256(path: string): Promise<string | null> {
  return await readFile(path).then(
    (bytes) => createHash("sha256").update(bytes).digest("hex"),
    (error: NodeJS.ErrnoException) =>
      error.code === "ENOENT" ? null : Promise.reject(error),
  );
}

async function candidateProjection(
  fixture: RunningFixture,
  observedState?: OrchestratorState,
) {
  const state = observedState ?? (await loadState(fixture));
  const milestone = state.milestones[0];
  return {
    pending: state.pendingOperation,
    milestoneStatus: milestone?.status,
    nextAllowedAction: state.nextAllowedAction,
    workerThreadId: milestone?.workerThreadId,
    invocationCount: state.run.agentInvocations.length,
    usage: state.run.usage,
    milestoneCommitCount: milestone?.commits.length,
    workspaceCommitCount: Number(
      git(
        fixture.workspacePath,
        "rev-list",
        "--count",
        `${fixture.baseCommit}..HEAD`,
      ),
    ),
    workspaceHead: git(fixture.workspacePath, "rev-parse", "HEAD"),
    workspaceClean:
      git(fixture.workspacePath, "status", "--porcelain=v2") === "",
    workerTurnSha256: await fileSha256(
      join(
        fixture.runDirectory,
        "milestones",
        MILESTONE_ID,
        "attempt-1",
        "worker-turn.json",
      ),
    ),
    checkpointSha256: await fileSha256(
      join(
        fixture.runDirectory,
        "milestones",
        MILESTONE_ID,
        "attempt-1",
        "controller-checkpoint.json",
      ),
    ),
  };
}

async function repositoryByteDigest(root: string): Promise<string> {
  const records: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory)).sort()) {
      const path = join(directory, entry);
      const metadata = await lstat(path);
      const relativePath = path.slice(root.length).replaceAll("\\", "/");
      if (metadata.isDirectory()) {
        records.push(`directory:${relativePath}`);
        await visit(path);
      } else {
        records.push(
          `file:${relativePath}:${createHash("sha256")
            .update(await readFile(path))
            .digest("hex")}`,
        );
      }
    }
  }
  await visit(root);
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

async function interruptCandidateAt(
  point: CandidatePrepareFaultPoint,
): Promise<RunningFixture> {
  const fixture = await runningFixture();
  const gateway: CodexGateway = {
    run: async (invocation) => {
      const threadId = "candidate-prepare-inspection-thread";
      await mkdir(dirname(invocation.eventLogPath), { recursive: true });
      await writeFile(
        invocation.eventLogPath,
        `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`,
        "utf8",
      );
      await invocation.onThreadStarted?.(threadId);
      await writeFile(
        join(invocation.workingDirectory, "change.txt"),
        "authorized worker output\n",
        "utf8",
      );
      return {
        threadId,
        finalResponse: "Checkpoint the bounded baseline change.",
        usage: null,
        itemCount: 1,
      };
    },
  };
  const orchestrator = await MilestoneOrchestrator.open(
    fixture.root,
    fixture.configPath,
    {
      gateway,
      now: () => new Date(NOW),
      evidenceDiscovery: async () => [],
      candidatePrepareHooks: {
        fault(observed) {
          if (observed === point) throw new Error(`interrupt ${point}`);
        },
      },
    },
  );
  try {
    await expect(invokeWorkerBoundary(orchestrator)).rejects.toMatchObject({
      point,
    });
  } finally {
    await orchestrator.close();
  }
  return fixture;
}

async function resumeContender(
  metadataPath: string,
  barrierPath: string,
  contenderId: string,
): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const worker = resolve(
    "tools/milestone-orchestrator/test/candidate-prepare-resume-worker.ts",
  );
  const tsx = resolve("node_modules/tsx/dist/cli.mjs");
  const child = spawn(
    process.execPath,
    [tsx, worker, metadataPath, barrierPath, contenderId],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function releaseResumeBarrier(
  barrierPath: string,
  contenderIds: readonly string[],
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (
    contenderIds.some(
      (contenderId) => !existsSync(`${barrierPath}.${contenderId}.ready`),
    )
  ) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for candidate resume contenders.");
    await delay(10);
  }
  await writeFile(barrierPath, "release\n", "utf8");
}

describe("candidate-prepare current-semantics recovery baseline", () => {
  it(
    "publishes intent before Worker mutation and completes the uninterrupted checkpoint once",
    { timeout: 60_000 },
    async () => {
      const fixture = await runningFixture();
      const observedStates: {
        beforeMutation: OrchestratorState | null;
        afterThread: OrchestratorState | null;
      } = {
        beforeMutation: null,
        afterThread: null,
      };
      const gatewayRun = vi.fn<CodexGateway["run"]>(async (invocation) => {
        observedStates.beforeMutation = await loadState(fixture);
        const threadId = "candidate-prepare-uninterrupted-thread";
        await invocation.onThreadStarted?.(threadId);
        observedStates.afterThread = await loadState(fixture);
        await writeFile(
          join(invocation.workingDirectory, "change.txt"),
          "uninterrupted authorized output\n",
          "utf8",
        );
        return {
          threadId,
          finalResponse: "Checkpoint the uninterrupted bounded change.",
          usage: {
            inputTokens: 10,
            cachedInputTokens: 2,
            outputTokens: 3,
            reasoningOutputTokens: 1,
          },
          itemCount: 1,
        };
      });
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: { run: gatewayRun },
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      try {
        await invokeWorkerBoundary(orchestrator);
        const completed = orchestrator.state;
        const checkpointPath = join(
          fixture.runDirectory,
          "milestones",
          MILESTONE_ID,
          "attempt-1",
          "controller-checkpoint.json",
        );
        const checkpoint = JSON.parse(
          await readFile(checkpointPath, "utf8"),
        ) as Record<string, unknown>;
        expect(observedStates.beforeMutation?.pendingOperation).toMatchObject({
          kind: "candidate-prepare",
          phase: "worker-invocation-started",
        });
        expect(observedStates.afterThread?.pendingOperation).toMatchObject({
          kind: "candidate-prepare",
          phase: "worker-thread-recorded",
        });
        expect(completed).toMatchObject({
          revision: 9,
          pendingOperation: null,
          nextAllowedAction: "verify",
          milestones: [
            {
              status: "verifying",
              retryFeedback: null,
              workerThreadId: "candidate-prepare-uninterrupted-thread",
            },
          ],
          run: {
            usage: {
              codexInvocations: 1,
              inputTokens: 10,
              cachedInputTokens: 2,
              outputTokens: 3,
              reasoningOutputTokens: 1,
            },
          },
        });
        expect(checkpoint).toMatchObject({
          status: "accepted",
          operationId: expect.stringMatching(/^candidate-prepare-/),
          candidate: { clean: true },
          controllerCommit: expect.stringMatching(/^[a-f0-9]{40}$/),
        });
        expect(gatewayRun).toHaveBeenCalledTimes(1);
      } finally {
        await orchestrator.close();
      }
    },
  );

  it(
    "recovers a controller checkpoint only when a matching intent survived process loss",
    { timeout: 60_000 },
    async () => {
      const fixture = await runningFixture();
      const crashMarkerPath = join(
        fixture.runDirectory,
        "baseline-control",
        "checkpoint-crash-marker.json",
      );
      const metadataPath = join(
        fixture.runDirectory,
        "baseline-control",
        "crash-worker-metadata.json",
      );
      await mkdir(dirname(metadataPath), { recursive: true });
      await writeFile(
        metadataPath,
        `${JSON.stringify({
          root: fixture.root,
          configPath: fixture.configPath,
          milestoneId: MILESTONE_ID,
          workspacePath: fixture.workspacePath,
          crashMarkerPath,
          faultPoint: "after-checkpoint-commit",
        })}\n`,
        "utf8",
      );
      const crashed = await faultWorker(metadataPath);

      const stateBeforeRestart = await loadState(fixture);
      const checkpointPath = join(
        fixture.runDirectory,
        "milestones",
        MILESTONE_ID,
        "attempt-1",
        "controller-checkpoint.json",
      );
      const checkpointAbsentBeforeRestart = await readFile(
        checkpointPath,
        "utf8",
      ).then(
        () => false,
        (error: NodeJS.ErrnoException) => error.code === "ENOENT",
      );
      const checkpointCommit = git(fixture.workspacePath, "rev-parse", "HEAD");
      const crashMarker = await readFile(crashMarkerPath, "utf8").then(
        (contents) => JSON.parse(contents) as unknown,
        (error: NodeJS.ErrnoException) =>
          error.code === "ENOENT" ? null : Promise.reject(error),
      );
      const gatewayRun = vi.fn<CodexGateway["run"]>(async (invocation) => {
        const threadId = "candidate-prepare-baseline-thread";
        await invocation.onThreadStarted?.(threadId);
        return {
          threadId,
          finalResponse: "No additional Worker mutation.",
          usage: null,
          itemCount: 1,
        };
      });
      const restarted = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: { run: gatewayRun },
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      try {
        if (restarted.state.milestones[0]?.status === "running")
          await invokeWorkerBoundary(restarted);
        const recovered = restarted.state;
        const facts = {
          child: {
            status: crashed.status,
            stderr: crashed.stderr,
          },
          crashMarker,
          baseCommit: fixture.baseCommit,
          checkpointCommit,
          workspaceClean:
            git(fixture.workspacePath, "status", "--porcelain=v2") === "",
          checkpointAbsentBeforeRestart,
          pendingOperationBeforeRestart: stateBeforeRestart.pendingOperation,
          milestoneBeforeRestart: {
            status: stateBeforeRestart.milestones[0]?.status,
            retryFeedback: stateBeforeRestart.milestones[0]?.retryFeedback,
            workerThreadId: stateBeforeRestart.milestones[0]?.workerThreadId,
          },
          milestoneStatusAfterRestart: recovered.milestones[0]?.status,
          pendingOperationAfterRestart: recovered.pendingOperation,
          workerReinvoked: gatewayRun.mock.calls.length > 0,
          autoAdoptedWithoutIntent:
            stateBeforeRestart.pendingOperation === null &&
            recovered.milestones[0]?.status === "verifying",
        };
        await writeBaselineObservation("checkpoint-crash-auto-adoption", facts);

        expect(checkpointCommit).not.toBe(fixture.baseCommit);
        expect(crashed.status, crashed.stderr).toBe(86);
        expect(crashMarker).toMatchObject({
          point: "after-checkpoint-commit",
        });
        expect(facts.workspaceClean).toBe(true);
        expect(checkpointAbsentBeforeRestart).toBe(true);
        expect(stateBeforeRestart.pendingOperation).toMatchObject({
          kind: "candidate-prepare",
        });
        expect(recovered.milestones[0]?.status).toBe("verifying");
        expect(recovered.pendingOperation).toBeNull();
        expect(gatewayRun).not.toHaveBeenCalled();
      } finally {
        await restarted.close();
      }
    },
  );

  it(
    "preserves and blocks an otherwise valid clean out-of-band descendant with no intent",
    { timeout: SYNCHRONOUS_COMMAND_TIMEOUT_MS + 30_000 },
    async () => {
      const fixture = await runningFixture({ preserveFailedWorkspaces: false });
      await writeFile(
        join(fixture.workspacePath, "change.txt"),
        "authorized worker output\n",
        "utf8",
      );
      git(fixture.workspacePath, "add", "change.txt");
      git(
        fixture.workspacePath,
        "commit",
        "-m",
        "Controller checkpoint: Bounded tooling milestone",
      );
      const externalCommit = git(fixture.workspacePath, "rev-parse", "HEAD");
      const gatewayRun = vi.fn<CodexGateway["run"]>();
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: { run: gatewayRun },
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      try {
        await invokeWorkerBoundary(orchestrator);
        const milestone = orchestrator.state.milestones[0];
        const facts = {
          baseCommit: fixture.baseCommit,
          externalCommit,
          workspaceHeadAfterController: git(
            fixture.workspacePath,
            "rev-parse",
            "HEAD",
          ),
          workspaceClean:
            git(fixture.workspacePath, "status", "--porcelain=v2") === "",
          pendingOperation: orchestrator.state.pendingOperation,
          milestoneStatus: milestone?.status,
          workspaceCleanup: milestone?.workspace?.cleanup ?? null,
          runStatus: orchestrator.state.run.status,
          blocker: milestone?.blockers.at(-1) ?? null,
          workerInvoked: gatewayRun.mock.calls.length > 0,
          reachedVerification: milestone?.status === "verifying",
        };
        await writeBaselineObservation("out-of-band-auto-adoption", facts);

        expect(facts.workspaceHeadAfterController).toBe(externalCommit);
        expect(facts.workspaceClean).toBe(true);
        expect(facts.workerInvoked).toBe(false);
        expect(facts.reachedVerification).toBe(false);
        expect(facts.blocker).toMatchObject({
          code: "CANDIDATE_PREPARE_EXTERNAL_CHANGE",
        });
        expect(facts.workspaceCleanup).toMatchObject({
          status: "preserved",
          reason: "failed-preserve-workspace",
        });
      } finally {
        await orchestrator.close();
      }
    },
  );

  it(
    "preserves and blocks a dirty out-of-band candidate with no intent",
    { timeout: 30_000 },
    async () => {
      const fixture = await runningFixture({ preserveFailedWorkspaces: false });
      await writeFile(
        join(fixture.workspacePath, "change.txt"),
        "unowned dirty output\n",
        "utf8",
      );
      const gatewayRun = vi.fn<CodexGateway["run"]>();
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: { run: gatewayRun },
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      try {
        await invokeWorkerBoundary(orchestrator);
        expect(gatewayRun).not.toHaveBeenCalled();
        expect(orchestrator.state.milestones[0]).toMatchObject({
          status: "escalated",
          blockers: [
            expect.objectContaining({
              code: "CANDIDATE_PREPARE_EXTERNAL_CHANGE",
            }),
          ],
          workspace: {
            cleanup: {
              status: "preserved",
              reason: "failed-preserve-workspace",
            },
          },
        });
        expect(
          await readFile(join(fixture.workspacePath, "change.txt"), "utf8"),
        ).toBe("unowned dirty output\n");
      } finally {
        await orchestrator.close();
      }
    },
  );

  it(
    "preserves and classifies unowned Worker evidence before verification",
    { timeout: 30_000 },
    async () => {
      const fixture = await runningFixture({ preserveFailedWorkspaces: false });
      const workerTurnPath = join(
        fixture.runDirectory,
        "milestones",
        MILESTONE_ID,
        "attempt-1",
        "worker-turn.json",
      );
      await mkdir(dirname(workerTurnPath), { recursive: true });
      const unownedBytes = '{"unowned":true}\n';
      await writeFile(workerTurnPath, unownedBytes, "utf8");
      const gatewayRun = vi.fn<CodexGateway["run"]>();
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: { run: gatewayRun },
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      try {
        await invokeWorkerBoundary(orchestrator);
        expect(gatewayRun).not.toHaveBeenCalled();
        expect(orchestrator.state.pendingOperation).toBeNull();
        expect(orchestrator.state.milestones[0]).toMatchObject({
          status: "escalated",
          workspace: {
            cleanup: {
              status: "preserved",
              reason: "failed-preserve-workspace",
            },
          },
          blockers: [
            expect.objectContaining({
              code: "CANDIDATE_PREPARE_PREFLIGHT_BLOCKED",
              message: expect.stringMatching(/^unowned-evidence:/),
            }),
          ],
        });
        expect(await readFile(workerTurnPath, "utf8")).toBe(unownedBytes);
      } finally {
        await orchestrator.close();
      }
    },
  );

  it(
    "converges or fail-closes after hard loss at every candidate boundary and remains idempotent on a second resume",
    { timeout: 1_800_000 },
    async () => {
      const matrix: unknown[] = [];
      const semanticProjection = (
        projection: Awaited<ReturnType<typeof candidateProjection>>,
      ) => ({
        pending: projection.pending,
        milestoneStatus: projection.milestoneStatus,
        nextAllowedAction: projection.nextAllowedAction,
        workerThreadId: projection.workerThreadId,
        invocationCount: projection.invocationCount,
        usage: projection.usage,
        milestoneCommitCount: projection.milestoneCommitCount,
        workspaceCommitCount: projection.workspaceCommitCount,
        workspaceClean: projection.workspaceClean,
        workerEvidencePresent: projection.workerTurnSha256 !== null,
        checkpointEvidencePresent: projection.checkpointSha256 !== null,
      });
      const uninterruptedFixture = await runningFixture();
      const uninterruptedGateway: CodexGateway = {
        run: async (invocation) => {
          const threadId = "candidate-prepare-baseline-thread";
          await mkdir(dirname(invocation.eventLogPath), { recursive: true });
          await writeFile(
            invocation.eventLogPath,
            `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`,
            "utf8",
          );
          await invocation.onThreadStarted?.(threadId);
          await writeFile(
            join(invocation.workingDirectory, "change.txt"),
            "authorized worker output\n",
            "utf8",
          );
          return {
            threadId,
            finalResponse: "Checkpoint the bounded baseline change.",
            usage: null,
            itemCount: 1,
          };
        },
      };
      const uninterrupted = await MilestoneOrchestrator.open(
        uninterruptedFixture.root,
        uninterruptedFixture.configPath,
        {
          gateway: uninterruptedGateway,
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      await invokeWorkerBoundary(uninterrupted);
      await uninterrupted.close();
      const uninterruptedSemantics = semanticProjection(
        await candidateProjection(uninterruptedFixture),
      );
      const ambiguous = new Set<CandidatePrepareFaultPoint>([
        "after-worker-invocation-started-state",
        "after-worker-thread-recorded-state",
        "after-worker-gateway-return",
      ]);

      const cases: Array<{
        readonly index: number;
        readonly point: CandidatePrepareFaultPoint;
        readonly fixture: RunningFixture;
        readonly crashMarkerPath: string;
        readonly metadataPath: string;
      }> = [];
      for (const [index, point] of CANDIDATE_PREPARE_FAULT_POINTS.entries()) {
        const fixture = await runningFixture();
        const controlDirectory = join(
          fixture.runDirectory,
          "fault-matrix",
          `${String(index + 1).padStart(2, "0")}-${point}`,
        );
        const crashMarkerPath = join(controlDirectory, "crash-marker.json");
        const metadataPath = join(controlDirectory, "metadata.json");
        await mkdir(controlDirectory, { recursive: true });
        await writeFile(
          metadataPath,
          `${JSON.stringify({
            root: fixture.root,
            configPath: fixture.configPath,
            milestoneId: MILESTONE_ID,
            workspacePath: fixture.workspacePath,
            crashMarkerPath,
            faultPoint: point,
          })}\n`,
          "utf8",
        );
        cases.push({
          index,
          point,
          fixture,
          crashMarkerPath,
          metadataPath,
        });
      }

      for (let offset = 0; offset < cases.length;) {
        const crashBatchSize = offset < 8 ? 4 : 2;
        const batch = cases.slice(offset, offset + crashBatchSize);
        const crashed = await Promise.all(
          batch.map(async (entry) => ({
            entry,
            result: await faultWorker(entry.metadataPath),
          })),
        );
        for (const { entry, result } of crashed) {
          expect(result.error, entry.point).toBeUndefined();
          expect(result.status, `${entry.point}: ${result.stderr}`).toBe(86);
          expect(
            JSON.parse(await readFile(entry.crashMarkerPath, "utf8")),
          ).toMatchObject({ point: entry.point });
        }
        offset += crashBatchSize;
      }

      const recoverCase = async (entry: (typeof cases)[number]) => {
        const { index, point, fixture } = entry;
        const crashState = await loadState(fixture);
        const gatewayRun = vi.fn<CodexGateway["run"]>(async (invocation) => {
          const threadId = "candidate-prepare-baseline-thread";
          await mkdir(dirname(invocation.eventLogPath), { recursive: true });
          await writeFile(
            invocation.eventLogPath,
            `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`,
            "utf8",
          );
          await invocation.onThreadStarted?.(threadId);
          await writeFile(
            join(invocation.workingDirectory, "change.txt"),
            "authorized worker output\n",
            "utf8",
          );
          return {
            threadId,
            finalResponse: "Checkpoint the bounded baseline change.",
            usage: null,
            itemCount: 1,
          };
        });

        if (ambiguous.has(point)) {
          await expect(
            MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
              gateway: { run: gatewayRun },
              now: () => new Date(NOW),
              evidenceDiscovery: async () => [],
            }),
          ).rejects.toBeInstanceOf(CandidatePrepareBlockedError);
          const once = await loadState(fixture);
          expect(once.pendingOperation).toMatchObject({
            kind: "candidate-prepare",
            phase: "blocked",
            diagnostic: { classification: "worker-outcome-ambiguous" },
          });
          expect(once.milestones[0]?.status).toBe("running");
          expect(gatewayRun).not.toHaveBeenCalled();
          await expect(
            MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
              gateway: { run: gatewayRun },
              now: () => new Date(NOW),
              evidenceDiscovery: async () => [],
            }),
          ).rejects.toBeInstanceOf(CandidatePrepareBlockedError);
          expect(await loadState(fixture)).toEqual(once);
          matrix.push({
            index,
            row: {
              point,
              crashPhase: crashState.pendingOperation?.phase ?? null,
              disposition: "preserved-block",
              classification: "worker-outcome-ambiguous",
            },
          });
          return;
        }

        const resumed = await MilestoneOrchestrator.open(
          fixture.root,
          fixture.configPath,
          {
            gateway: { run: gatewayRun },
            now: () => new Date(NOW),
            evidenceDiscovery: async () => [],
          },
        );
        await resumed.close();
        const once = await loadState(fixture);
        const onceProjection = await candidateProjection(fixture, once);
        expect(onceProjection).toMatchObject({
          pending: null,
          milestoneStatus: "verifying",
          nextAllowedAction: "verify",
          workerThreadId: "candidate-prepare-baseline-thread",
          invocationCount: 1,
          milestoneCommitCount: 0,
          workspaceCommitCount: 1,
          workspaceClean: true,
          workerTurnSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          checkpointSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(gatewayRun).toHaveBeenCalledTimes(
          point === "after-intent-persisted" ? 1 : 0,
        );
        expect(semanticProjection(onceProjection), point).toEqual(
          uninterruptedSemantics,
        );
        const repeated = await MilestoneOrchestrator.open(
          fixture.root,
          fixture.configPath,
          {
            gateway: { run: gatewayRun },
            now: () => new Date(NOW),
            evidenceDiscovery: async () => [],
          },
        );
        const repeatedState = repeated.state;
        await repeated.close();
        expect(repeatedState).toEqual(once);
        expect(await candidateProjection(fixture, repeatedState)).toEqual(
          onceProjection,
        );
        expect(gatewayRun).toHaveBeenCalledTimes(
          point === "after-intent-persisted" ? 1 : 0,
        );
        matrix.push({
          index,
          row: {
            point,
            crashPhase: crashState.pendingOperation?.phase ?? null,
            disposition: "automatic-convergence",
            projection: onceProjection,
          },
        });
      };

      const recoveryBatchSize = 4;
      for (let offset = 0; offset < cases.length; offset += recoveryBatchSize)
        await Promise.all(
          cases.slice(offset, offset + recoveryBatchSize).map(recoverCase),
        );
      const orderedMatrix = (
        matrix as Array<{ readonly index: number; readonly row: unknown }>
      )
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.row);

      matrix.splice(0, matrix.length, ...orderedMatrix);

      const output = process.env["CANDIDATE_PREPARE_FAULT_MATRIX_OUTPUT"];
      if (output) {
        await mkdir(dirname(resolve(output)), { recursive: true });
        await writeFile(
          resolve(output),
          `${JSON.stringify(
            {
              schemaVersion: "1.0.0",
              runtime: { node: process.version },
              uninterrupted: uninterruptedSemantics,
              matrix,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
      }
    },
  );

  it(
    "projects an exact recoverable candidate through inspection, status, and doctor without changing any repository byte",
    { timeout: 120_000 },
    async () => {
      const fixture = await interruptCandidateAt("after-intent-persisted");
      const before = await repositoryByteDigest(fixture.root);
      const inspection = await MilestoneOrchestrator.inspect(
        fixture.root,
        fixture.configPath,
      );
      expect(inspection.pendingOperation).toMatchObject({
        operation: {
          kind: "candidate-prepare",
          phase: "intent-persisted",
        },
        recovery: {
          classification: "worker-resume-ready",
          disposition: "automatic",
          nextSafeAction: "resume-worker",
          preservedPaths: [fixture.workspacePath],
        },
      });
      const doctor = await runDoctorDiagnostic({
        repositoryRoot: fixture.root,
        configPath: fixture.configPath,
      });
      expect(doctor.checks.state).toMatchObject({
        outcome: "candidate-operation-pending",
        pendingOperation: {
          kind: "candidate-prepare",
          phase: "intent-persisted",
          classification: "worker-resume-ready",
          disposition: "automatic",
          preservedPaths: [fixture.workspacePath],
          nextSafeAction: "resume-worker",
        },
      });
      const status = await runStatusDiagnostic({
        repositoryRoot: fixture.root,
        configPath: fixture.configPath,
      });
      expect(status.pendingOperation).toMatchObject({
        kind: "candidate-prepare",
        phase: "intent-persisted",
        recovery: {
          disposition: "automatic",
          classification: "worker-resume-ready",
          nextSafeAction: "resume-worker",
          preservedPaths: [fixture.workspacePath],
        },
      });
      expect(status.recovery).toMatchObject({
        disposition: "automatic",
        command: "pnpm loop:resume -- --one",
      });
      expect(await repositoryByteDigest(fixture.root)).toBe(before);
    },
  );

  it(
    "serializes synchronized resume contenders through the controller lease and canonical CAS",
    { timeout: 120_000 },
    async () => {
      const fixture = await interruptCandidateAt(
        "after-checkpoint-committed-state",
      );
      const pending = await loadState(fixture);
      expect(pending.pendingOperation).toMatchObject({
        kind: "candidate-prepare",
        phase: "checkpoint-committed",
      });
      const controlDirectory = join(fixture.runDirectory, "concurrent-resume");
      const metadataPath = join(controlDirectory, "metadata.json");
      const barrierPath = join(controlDirectory, "barrier");
      const claimPath = join(controlDirectory, "winner.txt");
      await mkdir(controlDirectory, { recursive: true });
      await writeFile(
        metadataPath,
        `${JSON.stringify({
          root: fixture.root,
          configPath: fixture.configPath,
          claimPath,
        })}\n`,
      );
      const contenderIds = ["one", "two"] as const;
      const contenders = contenderIds.map((contenderId) =>
        resumeContender(metadataPath, barrierPath, contenderId),
      );
      await releaseResumeBarrier(barrierPath, contenderIds);
      const results = await Promise.all(contenders);
      const diagnostic = JSON.stringify(results);
      expect(
        results.some((result) => result.code === 0),
        diagnostic,
      ).toBe(true);
      expect(
        results.every((result) => result.code === 0 || result.code === 1),
        diagnostic,
      ).toBe(true);
      const successful = results
        .filter((result) => result.code === 0)
        .map((result) => JSON.parse(result.stdout) as { hookCount: number });
      expect(successful.filter((result) => result.hookCount > 0)).toHaveLength(
        1,
      );
      expect((await readFile(claimPath, "utf8")).trim()).toMatch(/^(one|two)$/);

      const recovered = await loadState(fixture);
      const recoveredProjection = await candidateProjection(fixture, recovered);
      expect(recoveredProjection).toMatchObject({
        pending: null,
        milestoneStatus: "verifying",
        nextAllowedAction: "verify",
        milestoneCommitCount: 0,
        workspaceCommitCount: 1,
        workspaceClean: true,
        workerTurnSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        checkpointSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      const repeated = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: {
            run: async () => {
              throw new Error("Repeated resume must not relaunch the Worker.");
            },
          },
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        },
      );
      const repeatedState = repeated.state;
      await repeated.close();
      expect(repeatedState).toEqual(recovered);
      expect(await candidateProjection(fixture, repeatedState)).toEqual(
        recoveredProjection,
      );
    },
  );

  it(
    "fail-closes missing, substituted, drifted, unauthorized, and conflicting recovery inputs",
    { timeout: 900_000 },
    async () => {
      const inspect = async (fixture: RunningFixture) =>
        (await MilestoneOrchestrator.inspect(fixture.root, fixture.configPath))
          .pendingOperation?.recovery;

      const missing = await interruptCandidateAt("after-intent-persisted");
      await rm(missing.workspacePath, { recursive: true, force: true });
      await expect(inspect(missing)).resolves.toMatchObject({
        classification: "workspace-path-unsafe",
        disposition: "manual",
        nextSafeAction: "manual-reconciliation-required",
        preservedPaths: [missing.workspacePath],
      });

      const substituted = await interruptCandidateAt("after-intent-persisted");
      const realWorkspace = `${substituted.workspacePath}-real`;
      await rename(substituted.workspacePath, realWorkspace);
      await symlink(realWorkspace, substituted.workspacePath, "junction");
      await expect(inspect(substituted)).resolves.toMatchObject({
        classification: "workspace-path-unsafe",
        disposition: "manual",
      });

      const linkedEvidence = await interruptCandidateAt(
        "after-intent-persisted",
      );
      const linkedState = await loadState(linkedEvidence);
      const linkedOperation = linkedState.pendingOperation;
      expect(linkedOperation?.kind).toBe("candidate-prepare");
      if (!linkedOperation || linkedOperation.kind !== "candidate-prepare")
        throw new Error("Expected candidate evidence-link intent.");
      const attemptDirectory = dirname(linkedOperation.workerTurnPath);
      const outsideDirectory = join(linkedEvidence.root, "outside-evidence");
      await mkdir(dirname(attemptDirectory), { recursive: true });
      await mkdir(outsideDirectory, { recursive: true });
      await symlink(outsideDirectory, attemptDirectory, "junction");
      await expect(inspect(linkedEvidence)).resolves.toMatchObject({
        classification: "evidence-path-unsafe",
        disposition: "manual",
      });

      const identityDrift = await interruptCandidateAt(
        "after-intent-persisted",
      );
      git(
        identityDrift.workspacePath,
        "config",
        "--local",
        "milestone-loop.base-commit",
        "f".repeat(40),
      );
      await expect(inspect(identityDrift)).resolves.toMatchObject({
        classification: "workspace-identity-drift",
        disposition: "manual",
      });

      const activeGit = await interruptCandidateAt("after-intent-persisted");
      await writeFile(join(activeGit.workspacePath, ".git", "index.lock"), "");
      await expect(inspect(activeGit)).resolves.toMatchObject({
        classification: "workspace-identity-drift",
        disposition: "manual",
      });

      const unauthorized = await interruptCandidateAt("after-intent-persisted");
      await writeFile(
        join(unauthorized.workspacePath, "outside-scope.txt"),
        "unauthorized\n",
      );
      await expect(inspect(unauthorized)).resolves.toMatchObject({
        classification: "diff-policy-violation",
        disposition: "manual",
      });

      const protectedDrift = await interruptCandidateAt(
        "after-intent-persisted",
      );
      await writeFile(
        join(protectedDrift.workspacePath, "PROJECT_GOAL.md"),
        "protected drift\n",
      );
      await expect(inspect(protectedDrift)).resolves.toMatchObject({
        classification: "protected-file-drift",
        disposition: "manual",
      });

      const workerConflict = await interruptCandidateAt(
        "after-worker-completed-state",
      );
      const workerConflictState = await loadState(workerConflict);
      const workerConflictOperation = workerConflictState.pendingOperation;
      if (
        !workerConflictOperation ||
        workerConflictOperation.kind !== "candidate-prepare"
      )
        throw new Error("Expected completed Worker intent.");
      await mkdir(dirname(workerConflictOperation.workerTurnPath), {
        recursive: true,
      });
      await writeFile(
        workerConflictOperation.workerTurnPath,
        '{"substituted":true}\n',
      );
      await expect(inspect(workerConflict)).resolves.toMatchObject({
        classification: "worker-evidence-conflict",
        disposition: "manual",
      });

      const threadConflict = await interruptCandidateAt(
        "after-worker-completed-state",
      );
      const threadConflictState = await loadState(threadConflict);
      const threadConflictOperation = threadConflictState.pendingOperation;
      if (
        !threadConflictOperation ||
        threadConflictOperation.kind !== "candidate-prepare"
      )
        throw new Error("Expected completed Worker thread intent.");
      await writeFile(
        threadConflictOperation.workerEventsPath,
        `${JSON.stringify({ type: "thread.started", thread_id: "substituted-thread" })}\n`,
        "utf8",
      );
      await expect(inspect(threadConflict)).resolves.toMatchObject({
        classification: "worker-context-drift",
        disposition: "manual",
      });

      const checkpointConflict = await interruptCandidateAt(
        "after-checkpoint-committed-state",
      );
      const checkpointConflictState = await loadState(checkpointConflict);
      const checkpointConflictOperation =
        checkpointConflictState.pendingOperation;
      if (
        !checkpointConflictOperation ||
        checkpointConflictOperation.kind !== "candidate-prepare"
      )
        throw new Error("Expected committed checkpoint intent.");
      await writeFile(
        checkpointConflictOperation.checkpointArtifactPath,
        '{"substituted":true}\n',
      );
      await expect(inspect(checkpointConflict)).resolves.toMatchObject({
        classification: "checkpoint-artifact-conflict",
        disposition: "manual",
      });

      const parentDrift = await interruptCandidateAt(
        "after-checkpoint-prepared-state",
      );
      git(
        parentDrift.workspacePath,
        "commit",
        "-m",
        "Controller checkpoint: Bounded tooling milestone",
      );
      await writeFile(
        join(parentDrift.workspacePath, "change.txt"),
        "second permitted change\n",
      );
      git(parentDrift.workspacePath, "add", "change.txt");
      git(parentDrift.workspacePath, "commit", "-m", "Unexpected descendant");
      await expect(inspect(parentDrift)).resolves.toMatchObject({
        classification: "checkpoint-parent-drift",
        disposition: "manual",
      });

      const treeDrift = await interruptCandidateAt(
        "after-checkpoint-prepared-state",
      );
      git(
        treeDrift.workspacePath,
        "commit",
        "-m",
        "Controller checkpoint: Bounded tooling milestone",
      );
      await writeFile(
        join(treeDrift.workspacePath, "change.txt"),
        "different permitted tree\n",
      );
      git(treeDrift.workspacePath, "add", "change.txt");
      git(treeDrift.workspacePath, "commit", "--amend", "--no-edit");
      await expect(inspect(treeDrift)).resolves.toMatchObject({
        classification: "checkpoint-tree-drift",
        disposition: "manual",
      });

      const messageDrift = await interruptCandidateAt(
        "after-checkpoint-prepared-state",
      );
      git(messageDrift.workspacePath, "commit", "-m", "Wrong checkpoint");
      await expect(inspect(messageDrift)).resolves.toMatchObject({
        classification: "unexpected-commit",
        disposition: "manual",
      });

      const context = await interruptCandidateAt("after-intent-persisted");
      const contextState = await loadState(context);
      const contextOperation = contextState.pendingOperation;
      const contextMilestone = contextState.milestones[0];
      if (
        !contextOperation ||
        contextOperation.kind !== "candidate-prepare" ||
        !contextMilestone
      )
        throw new Error("Expected candidate context intent.");
      const config = await loadConfigForInspection(
        context.root,
        context.configPath,
      );
      const protectedPatterns = enforcementProtectedPatterns(
        config,
        contextState.repository.protectedFiles,
      );
      const contextVariants: readonly MilestoneRecord[] = [
        { ...contextMilestone, attempts: contextMilestone.attempts + 1 },
        { ...contextMilestone, retryFeedback: "changed retry" },
        {
          ...contextMilestone,
          workerPolicy: {
            ...contextMilestone.workerPolicy,
            activeRole: "feature-worker-escalated",
            escalationReason: "substituted policy",
          },
        },
        {
          ...contextMilestone,
          workerThreadId: "substituted-thread",
          workerThreadLineage: [
            {
              threadId: "substituted-thread",
              role: "feature-worker-initial",
              model: "gpt-5.6-sol",
              reasoningEffort: "xhigh",
              attempt: 1,
              startedAt: NOW,
              replacesThreadId: null,
              replacementReason: null,
            },
          ],
        },
      ];
      for (const variant of contextVariants)
        await expect(
          inspectCandidatePrepareOperation({
            operation: contextOperation,
            milestone: variant,
            protectedPatterns,
            protectedFiles: contextState.repository.protectedFiles,
          }),
        ).resolves.toMatchObject({
          classification: "worker-context-drift",
          disposition: "manual",
          nextSafeAction: "manual-reconciliation-required",
        });
    },
  );
});
