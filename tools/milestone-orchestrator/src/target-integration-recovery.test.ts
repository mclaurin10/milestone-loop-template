import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

import type { OrchestratorState } from "./contracts.js";
import { gitHead } from "./git-isolation.js";
import {
  MilestoneOrchestrator,
  TargetIntegrationBlockedError,
} from "./orchestrator.js";
import { StateStore } from "./state-store.js";
import { runDoctorDiagnostic } from "./doctor.js";
import {
  TARGET_INTEGRATION_FAULT_POINTS,
  type TargetIntegrationFaultPoint,
} from "./target-integration.js";

interface WorkerMetadata {
  readonly root: string;
  readonly configPath: string;
  readonly statePath: string;
  readonly baseCommit: string;
  readonly candidateCommit: string;
  readonly workspacePath: string;
  readonly outcomePath: string;
  readonly crashMarkerPath: string;
  readonly faultPoint: TargetIntegrationFaultPoint | null;
}

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
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

function runWorker(
  mode: "crash" | "normal" | "completion",
  metadataPath: string,
  faultPoint?: TargetIntegrationFaultPoint,
) {
  const worker = resolve(
    "tools/milestone-orchestrator/test/target-integration-crash-worker.ts",
  );
  const tsx = resolve("node_modules/tsx/dist/cli.mjs");
  return spawnSync(
    process.execPath,
    [tsx, worker, mode, metadataPath, ...(faultPoint ? [faultPoint] : [])],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    },
  );
}

async function resumeContender(
  metadataPath: string,
  barrierPath: string,
  contenderId: string,
): Promise<{
  readonly code: number | null;
  readonly stderr: string;
}> {
  const worker = resolve(
    "tools/milestone-orchestrator/test/target-integration-resume-worker.ts",
  );
  const tsx = resolve("node_modules/tsx/dist/cli.mjs");
  const child = spawn(
    process.execPath,
    [tsx, worker, metadataPath, barrierPath, contenderId],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stderr }));
  });
}

async function releaseContenderBarrier(
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
      throw new Error("Timed out waiting for target recovery contenders.");
    await delay(10);
  }
  await writeFile(barrierPath, "release\n");
}

async function metadata(path: string): Promise<WorkerMetadata> {
  return JSON.parse(await readFile(path, "utf8")) as WorkerMetadata;
}

async function loadState(fixture: WorkerMetadata): Promise<OrchestratorState> {
  const state = await new StateStore(fixture.root, fixture.statePath).load();
  if (!state) throw new Error("Fixture controller state is absent.");
  return state;
}

async function outcomeStatus(path: string): Promise<string> {
  const outcome = JSON.parse(await readFile(path, "utf8")) as {
    status: string;
  };
  return outcome.status;
}

async function outcomeStatusOrAbsent(path: string): Promise<string> {
  return existsSync(path) ? outcomeStatus(path) : "absent";
}

async function byteDigest(root: string): Promise<string> {
  const records: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory)).sort()) {
      const path = join(directory, entry);
      const metadata = await lstat(path);
      const relative = path.slice(root.length).replaceAll("\\", "/");
      if (metadata.isDirectory()) {
        records.push(`directory:${relative}`);
        await visit(path);
      } else {
        records.push(
          `file:${relative}:${createHash("sha256")
            .update(await readFile(path))
            .digest("hex")}`,
        );
      }
    }
  }
  await visit(root);
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

function semanticProjection(
  state: OrchestratorState,
  fixture: WorkerMetadata,
  outcome: string,
) {
  const milestone = state.milestones[0];
  return {
    repositoryVerifiedCandidate:
      state.repository.verifiedCommit === fixture.candidateCommit,
    targetAtCandidate: gitHead(fixture.root) === fixture.candidateCommit,
    milestoneStatus: milestone?.status,
    milestoneCommitCount: milestone?.commits.length,
    workspaceHeadIsCandidate:
      milestone?.workspace?.headCommit === fixture.candidateCommit,
    cleanupStatus: milestone?.workspace?.cleanup.status,
    queue: state.queue,
    activeMilestoneId: state.activeMilestoneId,
    requiredNextVerticalConsumer: state.requiredNextVerticalConsumer,
    milestonesProcessed: state.run.milestonesProcessed,
    runStatus: state.run.status,
    runFinished: state.run.finishedAt !== null,
    runHasStopReason: state.run.stopReason !== null,
    nextAllowedAction: state.nextAllowedAction,
    outcomeStatus: outcome,
  };
}

function differingFields(
  normal: ReturnType<typeof semanticProjection>,
  recovered: ReturnType<typeof semanticProjection>,
): readonly string[] {
  return Object.keys(normal).filter(
    (key) =>
      JSON.stringify(normal[key as keyof typeof normal]) !==
      JSON.stringify(recovered[key as keyof typeof recovered]),
  );
}

describe("target integration crash recovery", () => {
  it(
    "converges post-fast-forward process loss through the canonical reducer",
    // Real crash-worker convergence measured 90.9s (2026-08-06 baseline
    // aggregate) to 122.4s (2026-08-07 aggregates) on the supported Windows
    // host; the prior 120s budget left no headroom on a loaded host. The
    // assertions are unchanged - this is duration budget only.
    { timeout: 300_000 },
    async () => {
      const evidenceDirectory = await mkdtemp(
        join(tmpdir(), "milestone-loop-target-baseline-"),
      );
      temporaryDirectories.push(evidenceDirectory);
      const crashMetadataPath = join(evidenceDirectory, "crash.json");
      const crashed = runWorker("crash", crashMetadataPath);
      expect(crashed.error).toBeUndefined();
      expect(crashed.status, crashed.stderr).toBe(86);
      const crashFixture = await metadata(crashMetadataPath);
      temporaryDirectories.push(crashFixture.root);
      expect(existsSync(crashFixture.crashMarkerPath)).toBe(true);

      const crashState = await loadState(crashFixture);
      const pendingOutcome = await outcomeStatus(crashFixture.outcomePath);
      expect(gitHead(crashFixture.root)).toBe(crashFixture.candidateCommit);
      expect(crashState.repository.verifiedCommit).toBe(
        crashFixture.baseCommit,
      );
      expect(crashState.milestones[0]?.status).toBe("reviewing");
      expect(crashState.run.milestonesProcessed).toBe(0);
      expect(pendingOutcome).toBe("pending");
      expect(crashState.pendingOperation).toMatchObject({
        kind: "target-integrate",
        phase: "target-update-started",
      });

      const beforeReadOnly = await byteDigest(crashFixture.root);
      const inspection = await MilestoneOrchestrator.inspect(
        crashFixture.root,
        crashFixture.configPath,
      );
      expect(inspection.pendingOperation).toMatchObject({
        operation: {
          kind: "target-integrate",
          phase: "target-update-started",
        },
        recovery: {
          classification: "target-candidate",
          nextSafeAction: "adopt-target-candidate",
          target: { classification: "candidate-ready" },
        },
      });
      const doctor = await runDoctorDiagnostic({
        repositoryRoot: crashFixture.root,
        configPath: crashFixture.configPath,
      });
      expect(doctor.checks.state).toMatchObject({
        status: "attention",
        outcome: "target-operation-pending",
        pendingOperation: {
          kind: "target-integrate",
          phase: "target-update-started",
          classification: "target-candidate",
          targetClassification: "candidate-ready",
          nextSafeAction: "adopt-target-candidate",
        },
      });
      expect(await byteDigest(crashFixture.root)).toBe(beforeReadOnly);

      const contenderBarrier = join(evidenceDirectory, "resume.barrier");
      const contenderIds = ["one", "two"] as const;
      const contenderPromises = contenderIds.map((contenderId) =>
        resumeContender(crashMetadataPath, contenderBarrier, contenderId),
      );
      await releaseContenderBarrier(contenderBarrier, contenderIds);
      const contenders = await Promise.all(contenderPromises);
      const contenderDiagnostic = JSON.stringify(contenders);
      expect(
        contenders.some((result) => result.code === 0),
        contenderDiagnostic,
      ).toBe(true);
      expect(
        contenders.every((result) => result.code === 0 || result.code === 1),
        contenderDiagnostic,
      ).toBe(true);
      const recovered = await loadState(crashFixture);
      const repeatedOrchestrator = await MilestoneOrchestrator.open(
        crashFixture.root,
        crashFixture.configPath,
        { now: () => new Date("2026-08-02T18:00:00.000Z") },
      );
      await repeatedOrchestrator.close();
      expect(await loadState(crashFixture)).toEqual(recovered);

      const normalMetadataPath = join(evidenceDirectory, "completion.json");
      const uninterrupted = runWorker("completion", normalMetadataPath);
      expect(uninterrupted.error).toBeUndefined();
      expect(uninterrupted.status, uninterrupted.stderr).toBe(87);
      const normalFixture = await metadata(normalMetadataPath);
      temporaryDirectories.push(normalFixture.root);
      const normalOrchestrator = await MilestoneOrchestrator.open(
        normalFixture.root,
        normalFixture.configPath,
        { now: () => new Date("2026-08-02T18:00:00.000Z") },
      );
      await normalOrchestrator.close();
      const normal = await loadState(normalFixture);

      const normalProjection = semanticProjection(
        normal,
        normalFixture,
        await outcomeStatus(normalFixture.outcomePath),
      );
      const recoveredProjection = semanticProjection(
        recovered,
        crashFixture,
        await outcomeStatus(crashFixture.outcomePath),
      );
      const diff = differingFields(normalProjection, recoveredProjection);
      expect(diff).toEqual([]);
      expect(recoveredProjection).toMatchObject({
        repositoryVerifiedCandidate: true,
        targetAtCandidate: true,
        milestoneStatus: "completed",
        milestoneCommitCount: 1,
        workspaceHeadIsCandidate: true,
        cleanupStatus: "deleted",
        queue: [],
        activeMilestoneId: null,
        milestonesProcessed: 1,
        runStatus: "running",
        runFinished: false,
        runHasStopReason: false,
        nextAllowedAction: "plan",
        outcomeStatus: "integrated",
      });
      expect(recoveredProjection.requiredNextVerticalConsumer).toMatchObject({
        sourceMilestoneId: "target-integration-source",
        consumerMilestoneId: "target-integration-consumer",
      });

      const requestedEvidence = process.env["WP2B_BASELINE_OUTPUT"];
      if (requestedEvidence) {
        await mkdir(dirname(resolve(requestedEvidence)), { recursive: true });
        await writeFile(
          resolve(requestedEvidence),
          `${JSON.stringify(
            {
              schemaVersion: "1.0.0",
              crashPoint: "after-integrate-fast-forward-before-state-save",
              crashWindow: {
                targetHead: crashFixture.candidateCommit,
                canonicalVerifiedCommit: crashState.repository.verifiedCommit,
                milestoneStatus: crashState.milestones[0]?.status,
                milestonesProcessed: crashState.run.milestonesProcessed,
                outcomeStatus: pendingOutcome,
              },
              canonicalCompletion: normalProjection,
              recovered: recoveredProjection,
              differingFields: diff,
            },
            null,
            2,
          )}\n`,
        );
      }
    },
  );

  it(
    "converges hard process loss at every remaining durable boundary",
    { timeout: 600_000 },
    async () => {
      const evidenceDirectory = await mkdtemp(
        join(tmpdir(), "milestone-loop-target-fault-matrix-"),
      );
      temporaryDirectories.push(evidenceDirectory);
      const coveredByConvergenceCase = new Set<TargetIntegrationFaultPoint>([
        "after-target-fast-forward",
        "after-completion-state",
      ]);
      const points = TARGET_INTEGRATION_FAULT_POINTS.filter(
        (point) => !coveredByConvergenceCase.has(point),
      );
      const matrix: unknown[] = [];

      for (const [index, point] of points.entries()) {
        const metadataPath = join(
          evidenceDirectory,
          `${String(index + 1).padStart(2, "0")}-${point}.json`,
        );
        const crashed = runWorker("crash", metadataPath, point);
        expect(crashed.error, point).toBeUndefined();
        expect(crashed.status, `${point}: ${crashed.stderr}`).toBe(86);
        const fixture = await metadata(metadataPath);
        temporaryDirectories.push(fixture.root);
        expect(fixture.faultPoint).toBe(point);
        expect(
          JSON.parse(await readFile(fixture.crashMarkerPath, "utf8")),
        ).toEqual({ point });
        const crashedState = await loadState(fixture);
        const crashedTarget = gitHead(fixture.root);
        const crashedOutcome = await outcomeStatusOrAbsent(fixture.outcomePath);

        const orchestrator = await MilestoneOrchestrator.open(
          fixture.root,
          fixture.configPath,
          { now: () => new Date("2026-08-02T18:00:00.000Z") },
        );
        await orchestrator.close();
        const recovered = await loadState(fixture);
        const recoveredProjection = semanticProjection(
          recovered,
          fixture,
          await outcomeStatus(fixture.outcomePath),
        );
        expect(recoveredProjection, point).toMatchObject({
          repositoryVerifiedCandidate: true,
          targetAtCandidate: true,
          milestoneStatus: "completed",
          milestoneCommitCount: 1,
          workspaceHeadIsCandidate: true,
          cleanupStatus: "deleted",
          queue: [],
          activeMilestoneId: null,
          requiredNextVerticalConsumer: {
            sourceMilestoneId: "target-integration-source",
            consumerMilestoneId: "target-integration-consumer",
          },
          milestonesProcessed: 1,
          runStatus: "running",
          runFinished: false,
          runHasStopReason: false,
          nextAllowedAction: "plan",
          outcomeStatus: "integrated",
        });
        expect(recovered.pendingOperation, point).toBeNull();
        matrix.push({
          point,
          crash: {
            pendingPhase: crashedState.pendingOperation?.phase ?? null,
            target: crashedTarget === fixture.baseCommit ? "base" : "candidate",
            outcome: crashedOutcome,
          },
          recovered: recoveredProjection,
        });
      }

      const requestedEvidence = process.env["WP2B_FAULT_MATRIX_OUTPUT"];
      if (requestedEvidence) {
        await mkdir(dirname(resolve(requestedEvidence)), { recursive: true });
        await writeFile(
          resolve(requestedEvidence),
          `${JSON.stringify(
            {
              schemaVersion: "1.0.0",
              runtime: { node: process.version },
              separatelyCoveredPoints: [...coveredByConvergenceCase],
              matrix,
            },
            null,
            2,
          )}\n`,
        );
      }
    },
  );

  it(
    "durably blocks a dirty target and leaves target and workspace content untouched",
    { timeout: 120_000 },
    async () => {
      const evidenceDirectory = await mkdtemp(
        join(tmpdir(), "milestone-loop-target-blocked-"),
      );
      temporaryDirectories.push(evidenceDirectory);
      const metadataPath = join(evidenceDirectory, "dirty-target.json");
      const crashed = runWorker(
        "crash",
        metadataPath,
        "after-intent-persisted",
      );
      expect(crashed.error).toBeUndefined();
      expect(crashed.status, crashed.stderr).toBe(86);
      const fixture = await metadata(metadataPath);
      temporaryDirectories.push(fixture.root);
      const targetPath = join(fixture.root, "change.txt");
      const workspacePath = join(fixture.workspacePath, "change.txt");
      await writeFile(targetPath, "external dirty content\n");
      const targetBefore = await readFile(targetPath, "utf8");
      const workspaceBefore = await readFile(workspacePath, "utf8");
      const headBefore = gitHead(fixture.root);

      await expect(
        MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
          now: () => new Date("2026-08-02T18:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(TargetIntegrationBlockedError);
      const blocked = await loadState(fixture);
      expect(blocked.pendingOperation).toMatchObject({
        kind: "target-integrate",
        phase: "blocked",
        diagnostic: {
          classification: "target-dirty",
          targetHead: fixture.baseCommit,
        },
      });
      expect(gitHead(fixture.root)).toBe(headBefore);
      expect(await readFile(targetPath, "utf8")).toBe(targetBefore);
      expect(await readFile(workspacePath, "utf8")).toBe(workspaceBefore);

      const canonicalStateBeforeRepeatedOpen = git(
        fixture.root,
        "rev-parse",
        "refs/milestone-loop/state",
      );
      const outcomeBeforeRepeatedOpen = await readFile(
        fixture.outcomePath,
        "utf8",
      ).catch(() => null);
      await expect(
        MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
          now: () => new Date("2026-08-02T18:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(TargetIntegrationBlockedError);
      expect(await loadState(fixture)).toEqual(blocked);
      expect(git(fixture.root, "rev-parse", "refs/milestone-loop/state")).toBe(
        canonicalStateBeforeRepeatedOpen,
      );
      expect(
        await readFile(fixture.outcomePath, "utf8").catch(() => null),
      ).toBe(outcomeBeforeRepeatedOpen);
      expect(gitHead(fixture.root)).toBe(headBefore);
      expect(await readFile(targetPath, "utf8")).toBe(targetBefore);
      expect(await readFile(workspacePath, "utf8")).toBe(workspaceBefore);
    },
  );
});
