import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  captureProtectedFiles,
  createIsolatedWorkspace,
  integrateFastForward,
} from "./git-isolation.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { StateStore, createInitialState } from "./state-store.js";
import { performWorkspaceCleanup } from "./workspace-cleanup.js";
import { validConfig, validProposal } from "../test/fixtures.js";

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

async function repositoryFixture(config = validConfig()): Promise<{
  readonly root: string;
  readonly configPath: string;
  readonly config: ReturnType<typeof validConfig>;
  readonly baseCommit: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "ski-loop-recovery-cleanup-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Recovery Cleanup Test");
  git(root, "config", "user.email", "recovery@example.invalid");
  await mkdir(join(root, "evals"), { recursive: true });
  for (const path of [
    "SKI_TYCOON_GOAL.md",
    "evals/ACCEPTANCE.md",
    "evals/acceptance-manifest.json",
    "evals/HIDDEN_VALIDATION_PROTOCOL.md",
    "evals/immutable-contract-lock.json",
  ])
    await writeFile(join(root, path), `${path}\n`);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ skiTycoon: { verification: { defaultProfile: "readiness" } } })}\n`,
  );
  await writeFile(join(root, ".gitignore"), "artifacts/\nnode_modules/\n");
  await writeFile(join(root, "change.txt"), "base\n");
  const configPath = "orchestrator-config.json";
  await writeFile(join(root, configPath), `${JSON.stringify(config)}\n`);
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture base");
  return {
    root,
    configPath,
    config,
    baseCommit: git(root, "rev-parse", "HEAD"),
  };
}

describe("post-persistence workspace lifecycle", () => {
  it(
    "keeps reviewing workspaces and cleans only after target recovery is durably completed",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture();
      const config = fixture.config;
      const workspace = await createIsolatedWorkspace({
        repositoryRoot: fixture.root,
        workspaceRoot: config.workspaceRoot,
        targetBranch: config.targetBranch,
        baseCommit: fixture.baseCommit,
        runId: "recovery-run",
        milestoneId: "cleanup-milestone",
        now: NOW,
      });
      await writeFile(join(workspace.path, "change.txt"), "approved\n");
      git(workspace.path, "add", "change.txt");
      git(workspace.path, "commit", "-m", "approved change");
      await mkdir(join(workspace.path, "node_modules", "copied-package"), {
        recursive: true,
      });
      const headCommit = git(workspace.path, "rev-parse", "HEAD");
      const runDirectory = join(
        fixture.root,
        config.artifactRoot,
        "recovery-run",
      );
      await mkdir(runDirectory, { recursive: true });
      const protectedFiles = await captureProtectedFiles(fixture.root, [
        ...config.protectedPaths,
        fixture.configPath,
      ]);
      const initial = createInitialState({
        repositoryRoot: fixture.root,
        targetBranch: config.targetBranch,
        verifiedCommit: fixture.baseCommit,
        protectedFiles,
        now: NOW,
        legacyEvidenceRunIds: [],
      });
      const proposal = validProposal({
        id: "cleanup-milestone",
        permittedPaths: ["change.txt"],
      });
      const milestone = createMilestoneRecord(proposal, NOW);
      const reviewing = {
        ...milestone,
        status: "reviewing" as const,
        attempts: 1,
        reviewerDecisions: [
          {
            schemaVersion: "1.0.0" as const,
            decision: "approve" as const,
            summary: "Approved exact recovery candidate.",
            findings: [],
            checks: {
              acceptanceEvidence: true,
              architectureCompliance: true,
              testQuality: true,
              noSuspiciousShortcuts: true,
              noScopeReduction: true,
              regressionsHandled: true,
            },
            reviewedAt: NOW,
          },
        ],
        workspace: { ...workspace, headCommit },
        timestamps: {
          ...milestone.timestamps,
          startedAt: NOW,
          updatedAt: NOW,
        },
        nextAllowedAction: "review" as const,
      };
      const state = {
        ...initial,
        queue: [proposal.id],
        milestones: [reviewing],
        activeMilestoneId: proposal.id,
        run: {
          ...initial.run,
          id: "recovery-run",
          status: "running" as const,
          startedAt: NOW,
          deadlineAt: "2026-08-03T00:00:00.000Z",
          artifactDirectory: runDirectory,
        },
        nextAllowedAction: "review" as const,
      };
      const store = new StateStore(fixture.root, config.statePath, () => NOW);
      await store.initialize(state);

      let cleanupCalls = 0;
      const cleanup = async (
        input: Parameters<typeof performWorkspaceCleanup>[0],
      ) => {
        cleanupCalls += 1;
        const persisted = JSON.parse(await readFile(store.path, "utf8")) as {
          repository: { verifiedCommit: string };
          milestones: Array<{
            status: string;
            workspace: { cleanup: { status: string } };
          }>;
        };
        expect(persisted.repository.verifiedCommit).toBe(headCommit);
        expect(persisted.milestones[0]).toMatchObject({
          status: "completed",
          workspace: { cleanup: { status: "pending" } },
        });
        expect(await exists(workspace.path)).toBe(true);
        return performWorkspaceCleanup(input);
      };

      const beforeAdvance = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { workspaceCleanup: cleanup, now: () => new Date(NOW) },
      );
      expect(beforeAdvance.state.milestones[0]?.status).toBe("reviewing");
      expect(cleanupCalls).toBe(0);
      expect(await exists(workspace.path)).toBe(true);

      integrateFastForward({
        repositoryRoot: fixture.root,
        targetBranch: config.targetBranch,
        expectedBaseCommit: fixture.baseCommit,
        workspacePath: workspace.path,
        headCommit,
      });
      const recovered = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { workspaceCleanup: cleanup, now: () => new Date(NOW) },
      );

      expect(cleanupCalls).toBe(1);
      expect(recovered.state.repository.verifiedCommit).toBe(headCommit);
      expect(recovered.state.milestones[0]).toMatchObject({
        status: "completed",
        workspace: {
          preserved: false,
          cleanup: {
            status: "deleted",
            reason: "completed-delete-workspace",
            nodeModulesRemovedAt: NOW,
          },
        },
      });
      expect(await exists(workspace.path)).toBe(false);
    },
  );

  it(
    "archives and deletes a terminal failed workspace when preservation is disabled",
    { timeout: 15_000 },
    async () => {
      const fixture = await repositoryFixture(
        validConfig({ preserveFailedWorkspaces: false }),
      );
      const config = fixture.config;
      const workspace = await createIsolatedWorkspace({
        repositoryRoot: fixture.root,
        workspaceRoot: config.workspaceRoot,
        targetBranch: config.targetBranch,
        baseCommit: fixture.baseCommit,
        runId: "failed-run",
        milestoneId: "failed-milestone",
        now: NOW,
      });
      await writeFile(join(workspace.path, "change.txt"), "failed work\n");
      await mkdir(join(workspace.path, "node_modules", "copied-package"), {
        recursive: true,
      });
      const runDirectory = join(
        fixture.root,
        config.artifactRoot,
        "failed-run",
      );
      await mkdir(runDirectory, { recursive: true });
      const protectedFiles = await captureProtectedFiles(fixture.root, [
        ...config.protectedPaths,
        fixture.configPath,
      ]);
      const initial = createInitialState({
        repositoryRoot: fixture.root,
        targetBranch: config.targetBranch,
        verifiedCommit: fixture.baseCommit,
        protectedFiles,
        now: NOW,
      });
      const proposal = validProposal({ id: "failed-milestone" });
      const milestone = createMilestoneRecord(proposal, NOW);
      const failed = {
        ...milestone,
        status: "escalated" as const,
        attempts: 1,
        workspace,
        timestamps: { ...milestone.timestamps, startedAt: NOW, updatedAt: NOW },
        nextAllowedAction: "stop" as const,
      };
      const state = {
        ...initial,
        queue: [proposal.id],
        milestones: [failed],
        activeMilestoneId: proposal.id,
        run: {
          ...initial.run,
          id: "failed-run",
          status: "escalated" as const,
          startedAt: NOW,
          finishedAt: NOW,
          deadlineAt: "2026-08-03T00:00:00.000Z",
          stopReason: "Milestone failed.",
          artifactDirectory: runDirectory,
        },
        nextAllowedAction: "stop" as const,
      };
      const store = new StateStore(fixture.root, config.statePath, () => NOW);
      await store.initialize(state);

      const opened = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );
      const archive = join(runDirectory, "workspace-diagnostics", proposal.id);

      expect(opened.state.milestones[0]).toMatchObject({
        status: "escalated",
        workspace: {
          preserved: false,
          cleanup: {
            status: "deleted",
            reason: "failed-delete-after-diagnostics",
            diagnosticArchivePath: archive,
          },
        },
      });
      expect(await exists(workspace.path)).toBe(false);
      expect(await readFile(join(archive, "workspace.diff"), "utf8")).toContain(
        "+failed work",
      );
    },
  );

  it(
    "snapshots pre-policy verification evidence as an undeletable legacy baseline",
    { timeout: 15_000 },
    async () => {
      const fixture = await repositoryFixture();
      const config = fixture.config;
      const historicalRun = join(
        fixture.root,
        config.evidenceRetention.artifactRoot,
        "historical-run",
      );
      await mkdir(historicalRun, { recursive: true });
      await writeFile(
        join(historicalRun, "result.json"),
        `${JSON.stringify({
          runId: "historical-run",
          finishedAt: "2026-08-01T00:00:00.000Z",
        })}\n`,
      );
      const historicalControllerRun = join(
        fixture.root,
        config.artifactRoot,
        "historical-controller-run",
      );
      await mkdir(historicalControllerRun, { recursive: true });
      await writeFile(
        join(historicalControllerRun, "run-summary.json"),
        `${JSON.stringify({
          run: {
            id: "historical-controller-run",
            finishedAt: "2026-08-01T01:00:00.000Z",
          },
        })}\n`,
      );
      const protectedFiles = await captureProtectedFiles(fixture.root, [
        ...config.protectedPaths,
        fixture.configPath,
      ]);
      const legacy = JSON.parse(
        JSON.stringify(
          createInitialState({
            repositoryRoot: fixture.root,
            targetBranch: config.targetBranch,
            verifiedCommit: fixture.baseCommit,
            protectedFiles,
            now: NOW,
          }),
        ),
      ) as Record<string, unknown>;
      legacy["schemaVersion"] = "1.1.0";
      delete legacy["evidenceRetention"];
      const store = new StateStore(fixture.root, config.statePath, () => NOW);
      await mkdir(dirname(store.path), { recursive: true });
      await writeFile(store.path, `${JSON.stringify(legacy)}\n`);

      const opened = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );

      expect(opened.state.evidenceRetention).toMatchObject({
        initializedAt: NOW,
        legacyRunIds: ["historical-controller-run", "historical-run"],
        lastPrunedAt: null,
      });
      expect(await exists(historicalRun)).toBe(true);
      expect(await exists(historicalControllerRun)).toBe(true);
    },
  );

  it(
    "removes node_modules from completed workspaces even when clone deletion is disabled",
    { timeout: 15_000 },
    async () => {
      const fixture = await repositoryFixture(
        validConfig({ cleanupCompletedWorkspaces: false }),
      );
      const config = fixture.config;
      const workspace = await createIsolatedWorkspace({
        repositoryRoot: fixture.root,
        workspaceRoot: config.workspaceRoot,
        targetBranch: config.targetBranch,
        baseCommit: fixture.baseCommit,
        runId: "preserved-complete-run",
        milestoneId: "preserved-complete",
        now: NOW,
      });
      await mkdir(join(workspace.path, "node_modules", "copied-package"), {
        recursive: true,
      });
      const runDirectory = join(
        fixture.root,
        config.artifactRoot,
        "preserved-complete-run",
      );
      await mkdir(runDirectory, { recursive: true });
      const initial = createInitialState({
        repositoryRoot: fixture.root,
        targetBranch: config.targetBranch,
        verifiedCommit: fixture.baseCommit,
        protectedFiles: await captureProtectedFiles(fixture.root, [
          ...config.protectedPaths,
          fixture.configPath,
        ]),
        now: NOW,
      });
      const proposal = validProposal({ id: "preserved-complete" });
      const milestone = createMilestoneRecord(proposal, NOW);
      const completed = {
        ...milestone,
        status: "completed" as const,
        attempts: 1,
        workspace: { ...workspace, headCommit: fixture.baseCommit },
        timestamps: {
          ...milestone.timestamps,
          startedAt: NOW,
          completedAt: NOW,
          updatedAt: NOW,
        },
        nextAllowedAction: "stop" as const,
      };
      const state = {
        ...initial,
        milestones: [completed],
        run: {
          ...initial.run,
          id: "preserved-complete-run",
          status: "stopped" as const,
          startedAt: NOW,
          finishedAt: NOW,
          deadlineAt: "2026-08-03T00:00:00.000Z",
          stopReason: "Completed milestone was retained by policy.",
          artifactDirectory: runDirectory,
        },
      };
      const store = new StateStore(fixture.root, config.statePath, () => NOW);
      await store.initialize(state);

      const opened = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );

      expect(opened.state.milestones[0]?.workspace).toMatchObject({
        preserved: true,
        cleanup: {
          status: "preserved",
          reason: "completed-preserve-workspace",
        },
      });
      expect(await exists(workspace.path)).toBe(true);
      expect(await exists(join(workspace.path, "node_modules"))).toBe(false);
    },
  );
});
