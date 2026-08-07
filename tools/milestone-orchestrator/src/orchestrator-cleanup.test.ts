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
  integrateFastForward,
} from "./git-isolation.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { StateStore, createInitialState } from "./state-store.js";
import { validConfig, validProposal } from "../test/fixtures.js";
import { createIsolatedWorkspaceFixture } from "../test/workspace-fixture.js";

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
  const root = await mkdtemp(
    join(tmpdir(), "milestone-loop-recovery-cleanup-"),
  );
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Recovery Cleanup Test");
  git(root, "config", "user.email", "recovery@example.invalid");
  for (const path of config.protectedPaths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `${path}\n`);
  }
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ milestoneLoop: { verification: { defaultProfile: "readiness" } } })}\n`,
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

describe("canonical protected trust roots at controller startup", () => {
  it(
    "tops up missing trust-root hashes idempotently at open",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture();
      const legacyFive = [
        "PROJECT_GOAL.md",
        "evals/ACCEPTANCE.md",
        "evals/acceptance-manifest.json",
        "evals/HIDDEN_VALIDATION_PROTOCOL.md",
        "evals/immutable-contract-lock.json",
      ];
      const store = new StateStore(
        fixture.root,
        fixture.config.statePath,
        () => NOW,
      );
      await store.initialize(
        createInitialState({
          repositoryRoot: fixture.root,
          targetBranch: fixture.config.targetBranch,
          verifiedCommit: fixture.baseCommit,
          protectedFiles: await captureProtectedFiles(fixture.root, legacyFive),
          now: NOW,
        }),
      );

      const first = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );
      await first.close();
      const paths = first.state.repository.protectedFiles.map(
        (file) => file.path,
      );
      expect(paths).toEqual(
        expect.arrayContaining([
          "AGENTS.md",
          ".agent/readiness-profile-activated.json",
          "scripts/verify.mjs",
          "pnpm-lock.yaml",
          fixture.configPath,
        ]),
      );
      expect(new Set(paths).size).toBe(paths.length);

      const second = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );
      await second.close();
      expect(second.state.repository.protectedFiles).toHaveLength(paths.length);
      expect(second.state.revision).toBe(first.state.revision);
    },
  );

  it(
    "fails closed when a canonical trust root is missing from disk",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture();
      await rm(join(fixture.root, "AGENTS.md"));
      git(fixture.root, "add", "--all");
      git(fixture.root, "commit", "-m", "drop a controller trust root");
      await expect(
        MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
          now: () => new Date(NOW),
        }),
      ).rejects.toThrow(/Protected file is missing: AGENTS\.md/);
    },
  );

  it(
    "rejects a manifest requiring an unenforceable protected path before any state write",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture();
      const manifest = JSON.parse(
        await readFile(
          join(
            process.cwd(),
            ".agent",
            "completed",
            "loop-recommissioning-verification.json",
          ),
          "utf8",
        ),
      ) as { requiredProtectedPaths: string[] };
      manifest.requiredProtectedPaths = [
        ...manifest.requiredProtectedPaths,
        "docs/never-configured-protection.md",
      ];
      const manifestPath = join(
        fixture.root,
        ".agent",
        "completed",
        "loop-recommissioning-verification.json",
      );
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await expect(
        MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
          now: () => new Date(NOW),
        }),
      ).rejects.toThrow(
        /cannot enforce.*docs\/never-configured-protection\.md/,
      );
      expect(await exists(join(fixture.root, fixture.config.statePath))).toBe(
        false,
      );
    },
  );

  it(
    "captures a commissioned manifest and never opens after it disappears",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture();
      const manifestPath = join(
        fixture.root,
        ".agent",
        "completed",
        "loop-recommissioning-verification.json",
      );
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(
        manifestPath,
        await readFile(
          join(
            process.cwd(),
            ".agent",
            "completed",
            "loop-recommissioning-verification.json",
          ),
        ),
      );
      git(fixture.root, "add", "--all");
      git(fixture.root, "commit", "-m", "commission the manifest");
      const first = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );
      await first.close();
      expect(
        first.state.repository.protectedFiles.map((file) => file.path),
      ).toContain(".agent/completed/loop-recommissioning-verification.json");

      // Deleting the tracked manifest can no longer silently disable the
      // coverage assertion: the earliest fence (target cleanliness here;
      // the recorded protected hash is the backstop) refuses the open.
      await rm(manifestPath);
      await expect(
        MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
          now: () => new Date(NOW),
        }),
      ).rejects.toThrow(
        /working tree is dirty|Protected file was deleted: \.agent\/completed\/loop-recommissioning-verification\.json/,
      );
    },
  );
});

describe("post-persistence workspace lifecycle", () => {
  it(
    "preserves reviewing workspaces when target advancement lacks a durable integration operation",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture();
      const config = fixture.config;
      const workspace = await createIsolatedWorkspaceFixture({
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

      const beforeAdvance = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        { now: () => new Date(NOW) },
      );
      await beforeAdvance.close();
      expect(beforeAdvance.state.milestones[0]?.status).toBe("reviewing");
      expect(await exists(workspace.path)).toBe(true);

      integrateFastForward({
        repositoryRoot: fixture.root,
        targetBranch: config.targetBranch,
        expectedBaseCommit: fixture.baseCommit,
        workspacePath: workspace.path,
        headCommit,
        expectedTree: git(workspace.path, "rev-parse", `${headCommit}^{tree}`),
      });
      await expect(
        MilestoneOrchestrator.open(fixture.root, fixture.configPath, {
          now: () => new Date(NOW),
        }),
      ).rejects.toThrow(/without a durable target-integrate operation/);

      const preserved = await new StateStore(
        fixture.root,
        config.statePath,
      ).load();
      expect(preserved?.repository.verifiedCommit).toBe(fixture.baseCommit);
      expect(preserved?.milestones[0]).toMatchObject({
        status: "reviewing",
        workspace: { cleanup: { status: "active" } },
      });
      expect(await exists(workspace.path)).toBe(true);
    },
  );

  it(
    "archives and deletes a terminal failed workspace when preservation is disabled",
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture(
        validConfig({ preserveFailedWorkspaces: false }),
      );
      const config = fixture.config;
      const workspace = await createIsolatedWorkspaceFixture({
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
    { timeout: 30_000 },
    async () => {
      const fixture = await repositoryFixture(
        validConfig({ cleanupCompletedWorkspaces: false }),
      );
      const config = fixture.config;
      const workspace = await createIsolatedWorkspaceFixture({
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

describe("evidence retention at run start", () => {
  it(
    "writes a retention plan and never deletes historical evidence",
    { timeout: 30_000 },
    async () => {
      const config = validConfig({
        evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 0 },
      });
      const fixture = await repositoryFixture(config);
      const verificationRoot = join(fixture.root, "artifacts");
      const controllerRoot = join(
        fixture.root,
        "artifacts",
        "orchestrator",
        "runs",
      );
      await mkdir(join(verificationRoot, "old-verify-run"), {
        recursive: true,
      });
      await writeFile(
        join(verificationRoot, "old-verify-run", "result.json"),
        `${JSON.stringify({ runId: "old-verify-run", finishedAt: "2026-08-01T00:00:00.000Z" })}\n`,
      );
      await mkdir(join(controllerRoot, "old-controller-run"), {
        recursive: true,
      });
      await writeFile(
        join(controllerRoot, "old-controller-run", "run-summary.json"),
        `${JSON.stringify({ run: { id: "old-controller-run", finishedAt: "2026-08-01T00:00:00.000Z" } })}\n`,
      );

      const store = new StateStore(fixture.root, config.statePath, () => NOW);
      await store.initialize(
        createInitialState({
          repositoryRoot: fixture.root,
          targetBranch: config.targetBranch,
          verifiedCommit: fixture.baseCommit,
          protectedFiles: await captureProtectedFiles(fixture.root, [
            ...config.protectedPaths,
            fixture.configPath,
          ]),
          now: NOW,
        }),
      );

      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          now: () => new Date(NOW),
          gateway: {
            run: () => Promise.reject(new Error("planner halted by fixture")),
          },
          leaseOperation: "plan",
        },
      );
      try {
        await orchestrator.planOnly().catch(() => undefined);
      } finally {
        await orchestrator.close();
      }

      expect(await exists(join(verificationRoot, "old-verify-run"))).toBe(true);
      expect(await exists(join(controllerRoot, "old-controller-run"))).toBe(
        true,
      );

      const state = JSON.parse(
        await readFile(join(fixture.root, config.statePath), "utf8"),
      ) as {
        evidenceRetention: {
          lastPrunedAt: string | null;
          lastReportPath: string | null;
        };
      };
      expect(state.evidenceRetention.lastPrunedAt).toBe(NOW);
      const reportPath = state.evidenceRetention.lastReportPath;
      if (!reportPath) throw new Error("Retention plan path was not stored.");
      const plan = JSON.parse(await readFile(reportPath, "utf8")) as Record<
        string,
        unknown
      >;
      expect(plan).toMatchObject({
        schemaVersion: "1.1.0",
        mode: "plan",
        verificationRuns: {
          mode: "plan",
          // No artifact inventory exists in the fixture, so destructive
          // eligibility stays suspended — and even an eligible run would
          // only be listed, never deleted, at startup.
          suspended: true,
          plannedDeletions: [],
        },
        controllerRuns: { mode: "plan", plannedDeletions: [] },
      });
      expect(
        (plan["verificationRuns"] as { eligibleRunIds: string[] })
          .eligibleRunIds,
      ).toContain("old-verify-run");
    },
  );
});
