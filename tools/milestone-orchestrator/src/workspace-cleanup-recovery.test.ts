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
import { runDoctorDiagnostic } from "./doctor.js";
import {
  MilestoneOrchestrator,
  WorkspaceCleanupBlockedError,
} from "./orchestrator.js";
import { StateStore } from "./state-store.js";
import type { WorkspaceCleanupFaultPoint } from "./workspace-cleanup-operation.js";

interface WorkerMetadata {
  readonly root: string;
  readonly configPath: string;
  readonly statePath: string;
  readonly workspacePath: string;
  readonly diagnosticArchivePath: string;
  readonly crashMarkerPath: string;
  readonly scenario:
    "completed-delete" | "completed-preserve" | "failed-delete";
  readonly faultPoint: WorkspaceCleanupFaultPoint | null;
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

function runWorker(
  mode: "crash" | "normal",
  metadataPath: string,
  scenario: WorkerMetadata["scenario"] = "completed-delete",
  faultPoint?: WorkspaceCleanupFaultPoint,
) {
  return spawnSync(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve(
        "tools/milestone-orchestrator/test/workspace-cleanup-crash-worker.ts",
      ),
      mode,
      metadataPath,
      scenario,
      ...(faultPoint ? [faultPoint] : []),
    ],
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
): Promise<{ readonly code: number | null; readonly stderr: string }> {
  const child = spawn(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve(
        "tools/milestone-orchestrator/test/workspace-cleanup-resume-worker.ts",
      ),
      metadataPath,
      barrierPath,
      contenderId,
    ],
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

async function releaseBarrier(
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
      throw new Error("Timed out waiting for cleanup recovery contenders.");
    await delay(10);
  }
  await writeFile(barrierPath, "release\n");
}

async function byteDigest(root: string): Promise<string> {
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

async function exists(path: string): Promise<boolean> {
  return existsSync(path);
}

async function metadata(path: string): Promise<WorkerMetadata> {
  return JSON.parse(await readFile(path, "utf8")) as WorkerMetadata;
}

async function loadState(fixture: WorkerMetadata): Promise<OrchestratorState> {
  const state = await new StateStore(fixture.root, fixture.statePath).load();
  if (!state) throw new Error("Fixture controller state is absent.");
  return state;
}

function projection(state: OrchestratorState) {
  const cleanup = state.milestones[0]?.workspace?.cleanup;
  return {
    status: cleanup?.status,
    requestedAt: cleanup?.requestedAt,
    completedAt: cleanup?.completedAt,
    nodeModulesRemovedAt: cleanup?.nodeModulesRemovedAt,
    pendingOperation: state.pendingOperation?.kind ?? null,
  };
}

describe("workspace cleanup crash recovery", () => {
  it(
    "recovers deletion through canonical operation authority",
    { timeout: 120_000 },
    async () => {
      const evidenceDirectory = await mkdtemp(
        join(tmpdir(), "milestone-loop-cleanup-baseline-"),
      );
      temporaryDirectories.push(evidenceDirectory);
      const crashMetadataPath = join(evidenceDirectory, "crash.json");
      const crashed = runWorker("crash", crashMetadataPath);
      expect(crashed.error).toBeUndefined();
      expect(crashed.status, crashed.stderr).toBe(86);
      const crashFixture = await metadata(crashMetadataPath);
      temporaryDirectories.push(crashFixture.root);
      expect(existsSync(crashFixture.crashMarkerPath)).toBe(true);
      expect(existsSync(crashFixture.workspacePath)).toBe(false);

      const crashState = await loadState(crashFixture);
      expect(projection(crashState)).toEqual({
        status: "pending",
        requestedAt: "2026-08-02T18:00:00.000Z",
        completedAt: null,
        nodeModulesRemovedAt: null,
        pendingOperation: "workspace-cleanup",
      });
      expect(crashState.pendingOperation).toMatchObject({
        kind: "workspace-cleanup",
        phase: "workspace-delete-started",
        workspacePath: crashFixture.workspacePath,
        completionAt: "2026-08-02T18:00:00.000Z",
      });
      const beforeReadOnly = await byteDigest(crashFixture.root);
      const inspection = await MilestoneOrchestrator.inspect(
        crashFixture.root,
        crashFixture.configPath,
      );
      expect(inspection.pendingOperation).toMatchObject({
        operation: {
          kind: "workspace-cleanup",
          phase: "workspace-delete-started",
        },
        recovery: {
          classification: "workspace-deleted",
          nextSafeAction: "adopt-deleted-workspace",
        },
      });
      const doctor = await runDoctorDiagnostic({
        repositoryRoot: crashFixture.root,
        configPath: crashFixture.configPath,
      });
      expect(doctor.checks.state).toMatchObject({
        status: "block",
        outcome: "cleanup-operation-pending",
        pendingOperation: {
          kind: "workspace-cleanup",
          phase: "workspace-delete-started",
          classification: "workspace-deleted",
          nextSafeAction: "adopt-deleted-workspace",
        },
      });
      expect(await byteDigest(crashFixture.root)).toBe(beforeReadOnly);

      const barrierPath = join(evidenceDirectory, "resume.barrier");
      const contenderIds = ["one", "two"] as const;
      const contenderPromises = contenderIds.map((contenderId) =>
        resumeContender(crashMetadataPath, barrierPath, contenderId),
      );
      await releaseBarrier(barrierPath, contenderIds);
      const contenders = await Promise.all(contenderPromises);
      expect(contenders.some((result) => result.code === 0)).toBe(true);
      expect(
        contenders.every((result) => result.code === 0 || result.code === 1),
        JSON.stringify(contenders),
      ).toBe(true);
      const recovered = await loadState(crashFixture);
      const repeated = await MilestoneOrchestrator.open(
        crashFixture.root,
        crashFixture.configPath,
        { now: () => new Date("2026-08-02T20:00:00.000Z") },
      );
      await repeated.close();
      expect(await loadState(crashFixture)).toEqual(recovered);

      const normalMetadataPath = join(evidenceDirectory, "normal.json");
      const normalRun = runWorker("normal", normalMetadataPath);
      expect(normalRun.error).toBeUndefined();
      expect(normalRun.status, normalRun.stderr).toBe(0);
      const normalFixture = await metadata(normalMetadataPath);
      temporaryDirectories.push(normalFixture.root);
      const normal = await loadState(normalFixture);
      const normalProjection = projection(normal);
      const recoveredProjection = projection(recovered);
      expect(normalProjection).toMatchObject({
        status: "deleted",
        completedAt: "2026-08-02T18:00:00.000Z",
        pendingOperation: null,
      });
      expect(recoveredProjection).toMatchObject({
        status: "deleted",
        completedAt: "2026-08-02T18:00:00.000Z",
        pendingOperation: null,
      });
      expect(recoveredProjection).toEqual(normalProjection);

      const requestedEvidence = process.env["WP2C_CONVERGENCE_OUTPUT"];
      if (requestedEvidence) {
        await mkdir(dirname(resolve(requestedEvidence)), { recursive: true });
        await writeFile(
          resolve(requestedEvidence),
          `${JSON.stringify(
            {
              schemaVersion: "1.0.0",
              runtime: { node: process.version },
              crashPoint: "after-workspace-delete-before-completion-state",
              crashWindow: projection(crashState),
              workspaceMissing: !existsSync(crashFixture.workspacePath),
              normal: normalProjection,
              recovered: recoveredProjection,
              differingFields: Object.keys(normalProjection).filter(
                (key) =>
                  normalProjection[key as keyof typeof normalProjection] !==
                  recoveredProjection[key as keyof typeof recoveredProjection],
              ),
            },
            null,
            2,
          )}\n`,
        );
      }
    },
  );

  it(
    "converges hard process loss at every cleanup boundary",
    { timeout: 600_000 },
    async () => {
      const evidenceDirectory = await mkdtemp(
        join(tmpdir(), "milestone-loop-cleanup-fault-matrix-"),
      );
      temporaryDirectories.push(evidenceDirectory);
      const cases: readonly {
        readonly scenario: WorkerMetadata["scenario"];
        readonly point: WorkspaceCleanupFaultPoint;
      }[] = [
        { scenario: "completed-delete", point: "after-intent-persisted" },
        {
          scenario: "completed-delete",
          point: "after-workspace-delete-started-state",
        },
        { scenario: "completed-delete", point: "after-workspace-delete" },
        {
          scenario: "completed-delete",
          point: "after-workspace-deleted-state",
        },
        { scenario: "completed-delete", point: "after-completion-state" },
        {
          scenario: "completed-preserve",
          point: "after-dependency-removal-started-state",
        },
        {
          scenario: "completed-preserve",
          point: "after-node-modules-delete",
        },
        {
          scenario: "completed-preserve",
          point: "after-dependencies-removed-state",
        },
        { scenario: "failed-delete", point: "after-archive-started-state" },
        { scenario: "failed-delete", point: "after-archive-directory" },
        { scenario: "failed-delete", point: "after-archive-git-status" },
        {
          scenario: "failed-delete",
          point: "after-archive-workspace-diff",
        },
        { scenario: "failed-delete", point: "after-archive-recent-log" },
        { scenario: "failed-delete", point: "after-archive-manifest" },
        { scenario: "failed-delete", point: "after-archive-ready-state" },
      ];
      const matrix: unknown[] = [];
      for (const [index, entry] of cases.entries()) {
        const metadataPath = join(
          evidenceDirectory,
          `${String(index + 1).padStart(2, "0")}-${entry.point}.json`,
        );
        const crashed = runWorker(
          "crash",
          metadataPath,
          entry.scenario,
          entry.point,
        );
        expect(crashed.error, entry.point).toBeUndefined();
        expect(crashed.status, `${entry.point}: ${crashed.stderr}`).toBe(86);
        const fixture = await metadata(metadataPath);
        temporaryDirectories.push(fixture.root);
        expect(fixture.faultPoint).toBe(entry.point);
        expect(
          JSON.parse(await readFile(fixture.crashMarkerPath, "utf8")),
        ).toEqual({ point: entry.point });
        const crashedState = await loadState(fixture);

        const orchestrator = await MilestoneOrchestrator.open(
          fixture.root,
          fixture.configPath,
          { now: () => new Date("2026-08-02T19:00:00.000Z") },
        );
        await orchestrator.close();
        const recovered = await loadState(fixture);
        const cleanup = recovered.milestones[0]?.workspace?.cleanup;
        const preserves = entry.scenario === "completed-preserve";
        expect(recovered.pendingOperation, entry.point).toBeNull();
        expect(cleanup, entry.point).toMatchObject({
          status: preserves ? "preserved" : "deleted",
          requestedAt: "2026-08-02T18:00:00.000Z",
          completedAt: "2026-08-02T18:00:00.000Z",
          nodeModulesRemovedAt: "2026-08-02T18:00:00.000Z",
          error: null,
        });
        expect(await exists(fixture.workspacePath), entry.point).toBe(
          preserves,
        );
        if (preserves)
          expect(
            await exists(join(fixture.workspacePath, "node_modules")),
            entry.point,
          ).toBe(false);
        if (entry.scenario === "failed-delete") {
          expect(
            await exists(join(fixture.diagnosticArchivePath, "manifest.json")),
            entry.point,
          ).toBe(true);
          expect(
            await readFile(
              join(fixture.diagnosticArchivePath, "workspace.diff"),
              "utf8",
            ),
            entry.point,
          ).toContain("+failed work");
        }
        matrix.push({
          scenario: entry.scenario,
          point: entry.point,
          crashPhase: crashedState.pendingOperation?.phase ?? null,
          recoveredStatus: cleanup?.status ?? null,
        });
      }

      const requestedEvidence = process.env["WP2C_FAULT_MATRIX_OUTPUT"];
      if (requestedEvidence) {
        await mkdir(dirname(resolve(requestedEvidence)), { recursive: true });
        await writeFile(
          resolve(requestedEvidence),
          `${JSON.stringify(
            {
              schemaVersion: "1.0.0",
              runtime: { node: process.version },
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
    "durably blocks premature disappearance, workspace drift, and archive conflicts",
    { timeout: 180_000 },
    async () => {
      const evidenceDirectory = await mkdtemp(
        join(tmpdir(), "milestone-loop-cleanup-blocked-"),
      );
      temporaryDirectories.push(evidenceDirectory);

      const missingMetadataPath = join(evidenceDirectory, "missing.json");
      const missingCrash = runWorker(
        "crash",
        missingMetadataPath,
        "completed-delete",
        "after-intent-persisted",
      );
      expect(missingCrash.status, missingCrash.stderr).toBe(86);
      const missingFixture = await metadata(missingMetadataPath);
      temporaryDirectories.push(missingFixture.root);
      await rm(missingFixture.workspacePath, { recursive: true });
      await expect(
        MilestoneOrchestrator.open(
          missingFixture.root,
          missingFixture.configPath,
          { now: () => new Date("2026-08-02T19:00:00.000Z") },
        ),
      ).rejects.toBeInstanceOf(WorkspaceCleanupBlockedError);
      const missingBlocked = await loadState(missingFixture);
      expect(missingBlocked.pendingOperation).toMatchObject({
        kind: "workspace-cleanup",
        phase: "blocked",
        diagnostic: { classification: "premature-workspace-missing" },
      });
      await expect(
        MilestoneOrchestrator.open(
          missingFixture.root,
          missingFixture.configPath,
        ),
      ).rejects.toBeInstanceOf(WorkspaceCleanupBlockedError);
      expect(await loadState(missingFixture)).toEqual(missingBlocked);

      const driftMetadataPath = join(evidenceDirectory, "drift.json");
      const driftCrash = runWorker(
        "crash",
        driftMetadataPath,
        "completed-delete",
        "after-intent-persisted",
      );
      expect(driftCrash.status, driftCrash.stderr).toBe(86);
      const driftFixture = await metadata(driftMetadataPath);
      temporaryDirectories.push(driftFixture.root);
      const driftPath = join(driftFixture.workspacePath, "change.txt");
      await writeFile(driftPath, "external drift\n");
      await expect(
        MilestoneOrchestrator.open(driftFixture.root, driftFixture.configPath, {
          now: () => new Date("2026-08-02T19:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(WorkspaceCleanupBlockedError);
      const driftBlocked = await loadState(driftFixture);
      expect(driftBlocked.pendingOperation).toMatchObject({
        kind: "workspace-cleanup",
        phase: "blocked",
        diagnostic: { classification: "workspace-identity-drift" },
      });
      expect(await readFile(driftPath, "utf8")).toBe("external drift\n");

      const archiveMetadataPath = join(evidenceDirectory, "archive.json");
      const archiveCrash = runWorker(
        "crash",
        archiveMetadataPath,
        "failed-delete",
        "after-archive-started-state",
      );
      expect(archiveCrash.status, archiveCrash.stderr).toBe(86);
      const archiveFixture = await metadata(archiveMetadataPath);
      temporaryDirectories.push(archiveFixture.root);
      await mkdir(archiveFixture.diagnosticArchivePath, { recursive: true });
      const foreignPath = join(
        archiveFixture.diagnosticArchivePath,
        "foreign.txt",
      );
      await writeFile(foreignPath, "preserve me\n");
      await expect(
        MilestoneOrchestrator.open(
          archiveFixture.root,
          archiveFixture.configPath,
          { now: () => new Date("2026-08-02T19:00:00.000Z") },
        ),
      ).rejects.toBeInstanceOf(WorkspaceCleanupBlockedError);
      const archiveBlocked = await loadState(archiveFixture);
      expect(archiveBlocked.pendingOperation).toMatchObject({
        kind: "workspace-cleanup",
        phase: "blocked",
        diagnostic: { classification: "archive-conflict" },
      });
      expect(await exists(archiveFixture.workspacePath)).toBe(true);
      expect(await readFile(foreignPath, "utf8")).toBe("preserve me\n");
    },
  );
});
