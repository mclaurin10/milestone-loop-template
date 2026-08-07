import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ControllerLease } from "./controller-lease.js";
import {
  buildEvidenceRetentionPlan,
  planManagedEvidenceRuns,
} from "./evidence-retention.js";
import { captureProtectedFiles } from "./git-isolation.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { applyEvidenceRetentionPlan } from "./retention-apply-operation.js";
import {
  StateStore,
  atomicWriteJson,
  createInitialState,
} from "./state-store.js";
import { validConfig } from "../test/fixtures.js";

const NOW = "2026-08-02T18:00:00.000Z";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return false;
    throw error;
  }
}

async function writeVerificationRun(
  root: string,
  id: string,
  finishedAt: string,
): Promise<void> {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await atomicWriteJson(join(directory, "result.json"), {
    schemaVersion: "1.0.0",
    runId: id,
    finishedAt,
  });
}

async function writeControllerRun(
  root: string,
  id: string,
  finishedAt: string,
): Promise<void> {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await atomicWriteJson(join(directory, "run-summary.json"), {
    schemaVersion: "1.0.0",
    run: { id, finishedAt },
  });
}

const trustedPlanner: typeof planManagedEvidenceRuns = async (input) =>
  planManagedEvidenceRuns({
    ...input,
    safety: { ...input.safety, inventoryHasUnknownReferences: false },
  });

describe("retention-apply orchestrator startup recovery", () => {
  it(
    "recovers the canonical deletion before protected-root top-up",
    { timeout: 60_000 },
    async () => {
      const root = await mkdtemp(
        join(tmpdir(), "milestone-loop-retention-startup-"),
      );
      temporaryDirectories.push(root);
      const config = validConfig({
        evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 1 },
      });
      git(root, "init", "-b", "main");
      git(root, "config", "user.name", "Retention Startup Test");
      git(root, "config", "user.email", "retention-startup@example.invalid");
      for (const path of config.protectedPaths) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), `${path}\n`);
      }
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ milestoneLoop: { verification: { defaultProfile: "readiness" } } })}\n`,
      );
      await writeFile(join(root, ".gitignore"), "artifacts/\nnode_modules/\n");
      await writeFile(join(root, "record.md"), "Cited evidence: cited-run\n");
      const configPath = "orchestrator-config.json";
      await writeFile(join(root, configPath), `${JSON.stringify(config)}\n`);
      git(root, "add", ".");
      git(root, "commit", "-m", "retention startup fixture");
      const baseCommit = git(root, "rev-parse", "HEAD");

      const verificationRoot = join(root, "artifacts");
      const controllerRoot = join(root, "artifacts", "orchestrator", "runs");
      await Promise.all([
        writeVerificationRun(
          verificationRoot,
          "cited-run",
          "2026-08-01T00:00:00.000Z",
        ),
        writeVerificationRun(
          verificationRoot,
          "prune-run",
          "2026-08-01T01:00:00.000Z",
        ),
        writeVerificationRun(
          verificationRoot,
          "recent-run",
          "2026-08-01T02:00:00.000Z",
        ),
        writeControllerRun(
          controllerRoot,
          "old-controller-run",
          "2026-08-01T00:00:00.000Z",
        ),
        writeControllerRun(
          controllerRoot,
          "recent-controller-run",
          "2026-08-01T02:00:00.000Z",
        ),
      ]);
      const legacyProtectedPaths = [
        "PROJECT_GOAL.md",
        "evals/ACCEPTANCE.md",
        "evals/acceptance-manifest.json",
        "evals/HIDDEN_VALIDATION_PROTOCOL.md",
        "evals/immutable-contract-lock.json",
      ];
      const state = createInitialState({
        repositoryRoot: root,
        targetBranch: config.targetBranch,
        verifiedCommit: baseCommit,
        protectedFiles: await captureProtectedFiles(root, legacyProtectedPaths),
        now: NOW,
      });
      const plan = await buildEvidenceRetentionPlan({
        repositoryRoot: root,
        config,
        state,
        now: NOW,
        planner: trustedPlanner,
      });
      const planPath = join(
        root,
        "artifacts",
        "orchestrator",
        "retention",
        "plans",
        "startup-fixture",
        "plan.json",
      );
      await mkdir(dirname(planPath), { recursive: true });
      const planBytes = `${JSON.stringify(plan, null, 2)}\n`;
      await writeFile(planPath, planBytes);
      const planSha256 = createHash("sha256").update(planBytes).digest("hex");
      const store = new StateStore(root, config.statePath, () => NOW);
      await store.initialize(state);

      const lease = await ControllerLease.acquire({
        repositoryRoot: root,
        statePath: config.statePath,
        operation: "retention-apply",
      });
      try {
        await expect(
          applyEvidenceRetentionPlan({
            repositoryRoot: root,
            planPath,
            expectedSha256: planSha256,
            config,
            store,
            now: NOW,
            planner: trustedPlanner,
            hooks: {
              fault: (point) => {
                if (point === "after-run-deleted")
                  throw new Error("simulated startup handoff");
              },
            },
          }),
        ).rejects.toThrow(/simulated startup handoff/);
      } finally {
        await lease.release();
      }
      expect((await store.load())?.pendingOperation).toMatchObject({
        kind: "retention-apply",
        phase: "deletion-started",
        completedDeletionCount: 0,
      });

      const orchestrator = await MilestoneOrchestrator.open(root, configPath, {
        now: () => new Date(NOW),
        evidencePlanner: trustedPlanner,
      });
      try {
        expect(orchestrator.state.pendingOperation).toBeNull();
        expect(orchestrator.state.evidenceRetention.lastReportPath).toBe(
          join(
            root,
            "artifacts",
            "orchestrator",
            "retention",
            "apply",
            planSha256,
            "apply-result.json",
          ),
        );
        expect(
          orchestrator.state.repository.protectedFiles.map(
            (entry) => entry.path,
          ),
        ).toEqual(expect.arrayContaining(["AGENTS.md", "scripts/verify.mjs"]));
      } finally {
        await orchestrator.close();
      }
      expect(await exists(join(verificationRoot, "prune-run"))).toBe(false);
      expect(await exists(join(controllerRoot, "old-controller-run"))).toBe(
        false,
      );
      expect(await exists(join(verificationRoot, "recent-run"))).toBe(true);
      expect(await exists(join(controllerRoot, "recent-controller-run"))).toBe(
        true,
      );
    },
  );
});
