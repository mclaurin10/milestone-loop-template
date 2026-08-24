import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexGateway } from "./codex-gateway.js";
import type { OrchestratorState } from "./contracts.js";
import { captureProtectedFiles } from "./git-isolation.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { createInitialState, StateStore } from "./state-store.js";
import { createIsolatedWorkspaceFixture } from "../test/workspace-fixture.js";
import { validConfig, validProposal } from "../test/fixtures.js";

const NOW = "2026-08-23T20:00:00.000Z";
const MILESTONE_ID = "cpb";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
});

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: NOW,
      GIT_COMMITTER_DATE: NOW,
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
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
          revision: 8,
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
      const hookPath = join(
        fixture.workspacePath,
        ".git",
        "hooks",
        "post-commit",
      );
      const hook = [
        "#!/usr/bin/env node",
        'const fs = require("node:fs");',
        'const marker = process.env["CANDIDATE_PREPARE_CRASH_MARKER"];',
        'const pid = Number(process.env["CANDIDATE_PREPARE_CRASH_PID"]);',
        "if (!marker || !Number.isSafeInteger(pid) || pid <= 0) process.exit(97);",
        'fs.writeFileSync(marker, `${JSON.stringify({ boundary: "after-checkpoint-commit", pid })}\\n`);',
        'process.kill(pid, "SIGKILL");',
        "",
      ].join("\n");
      await writeFile(hookPath, hook, "utf8");
      await chmod(hookPath, 0o755);
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
        })}\n`,
        "utf8",
      );
      const worker = resolve(
        "tools/milestone-orchestrator/test/candidate-prepare-baseline-worker.ts",
      );
      const tsx = resolve("node_modules/tsx/dist/cli.mjs");
      const crashed = spawnSync(process.execPath, [tsx, worker, metadataPath], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      });
      await rm(hookPath, { force: true });

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
            signal: crashed.signal,
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
        expect(crashMarker).toMatchObject({
          boundary: "after-checkpoint-commit",
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
    { timeout: 30_000 },
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
});
