import { strictEqual } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { captureProtectedFiles } from "../src/git-isolation.js";
import { createMilestoneRecord } from "../src/milestone-state.js";
import { MilestoneOrchestrator } from "../src/orchestrator.js";
import { StateStore, createInitialState } from "../src/state-store.js";
import {
  WORKSPACE_CLEANUP_FAULT_POINTS,
  type WorkspaceCleanupFaultPoint,
} from "../src/workspace-cleanup-operation.js";
import { validConfig, validProposal } from "./fixtures.js";
import { createIsolatedWorkspaceFixture } from "./workspace-fixture.js";

const NOW = "2026-08-02T18:00:00.000Z";

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const [mode, metadataPath, requestedScenario, requestedFaultPoint] =
    process.argv.slice(2);
  if ((mode !== "crash" && mode !== "normal") || !metadataPath)
    throw new Error("Expected mode (crash|normal) and metadata path.");
  const scenario =
    (requestedScenario as
      | "completed-delete"
      | "completed-preserve"
      | "failed-delete"
      | undefined) ?? "completed-delete";
  if (
    scenario !== "completed-delete" &&
    scenario !== "completed-preserve" &&
    scenario !== "failed-delete"
  )
    throw new Error(`Unknown workspace cleanup scenario ${scenario}.`);
  const defaultPoint: WorkspaceCleanupFaultPoint =
    scenario === "completed-preserve"
      ? "after-node-modules-delete"
      : "after-workspace-delete";
  const faultPoint =
    mode === "normal"
      ? null
      : ((requestedFaultPoint ?? defaultPoint) as WorkspaceCleanupFaultPoint);
  if (
    faultPoint !== null &&
    !WORKSPACE_CLEANUP_FAULT_POINTS.includes(faultPoint)
  )
    throw new Error(`Unknown workspace cleanup fault point ${faultPoint}.`);

  const root = await realpath(
    await mkdtemp(join(tmpdir(), "milestone-loop-cleanup-crash-")),
  );
  strictEqual(await realpath(root), root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Workspace Cleanup Crash Test");
  git(root, "config", "user.email", "cleanup-crash@example.invalid");
  const config = validConfig({
    cleanupCompletedWorkspaces: scenario !== "completed-preserve",
    preserveFailedWorkspaces: scenario !== "failed-delete",
  });
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
  git(root, "commit", "-m", "cleanup crash fixture base");
  const baseCommit = git(root, "rev-parse", "HEAD");

  const runId = "workspace-cleanup-run";
  const milestoneId = "workspace-cleanup-milestone";
  const workspace = await createIsolatedWorkspaceFixture({
    repositoryRoot: root,
    workspaceRoot: config.workspaceRoot,
    targetBranch: config.targetBranch,
    baseCommit,
    runId,
    milestoneId,
    now: NOW,
  });
  await mkdir(join(workspace.path, "node_modules", "copied-package"), {
    recursive: true,
  });
  await writeFile(
    join(workspace.path, "node_modules", "copied-package", "index.js"),
    "export {};\n",
  );
  if (scenario === "failed-delete") {
    await writeFile(join(workspace.path, "change.txt"), "failed work\n");
    await writeFile(join(workspace.path, "untracked.txt"), "diagnostic\n");
  }
  const runDirectory = join(root, config.artifactRoot, runId);
  await mkdir(runDirectory, { recursive: true });
  const proposal = validProposal({ id: milestoneId });
  const milestone = createMilestoneRecord(proposal, NOW);
  const completed = {
    ...milestone,
    status:
      scenario === "failed-delete"
        ? ("escalated" as const)
        : ("completed" as const),
    attempts: 1,
    workspace: {
      ...workspace,
      headCommit: scenario === "failed-delete" ? null : baseCommit,
    },
    timestamps: {
      ...milestone.timestamps,
      startedAt: NOW,
      completedAt: NOW,
      updatedAt: NOW,
    },
    nextAllowedAction:
      scenario === "failed-delete" ? ("stop" as const) : ("plan" as const),
  };
  const initial = createInitialState({
    repositoryRoot: root,
    targetBranch: config.targetBranch,
    verifiedCommit: baseCommit,
    protectedFiles: await captureProtectedFiles(root, [
      ...config.protectedPaths,
      configPath,
    ]),
    now: NOW,
    legacyEvidenceRunIds: [],
  });
  const state = {
    ...initial,
    milestones: [completed],
    run: {
      ...initial.run,
      id: runId,
      status:
        scenario === "failed-delete"
          ? ("escalated" as const)
          : ("running" as const),
      startedAt: NOW,
      finishedAt: scenario === "failed-delete" ? NOW : null,
      deadlineAt: "2026-08-03T00:00:00.000Z",
      stopReason:
        scenario === "failed-delete" ? "Fixture milestone failed." : null,
      artifactDirectory: runDirectory,
    },
    nextAllowedAction:
      scenario === "failed-delete" ? ("stop" as const) : ("plan" as const),
  };
  const store = new StateStore(root, config.statePath, () => NOW);
  await store.initialize(state);

  const crashMarkerPath = `${metadataPath}.crashed`;
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        root,
        configPath,
        statePath: config.statePath,
        workspacePath: workspace.path,
        diagnosticArchivePath: join(
          runDirectory,
          "workspace-diagnostics",
          milestoneId,
        ),
        crashMarkerPath,
        scenario,
        faultPoint,
      },
      null,
      2,
    )}\n`,
  );

  const orchestrator = await MilestoneOrchestrator.open(root, configPath, {
    now: () => new Date(NOW),
    workspaceCleanupHooks:
      mode === "normal"
        ? {}
        : {
            fault: (point) => {
              if (point !== faultPoint) return;
              writeFileSync(
                crashMarkerPath,
                `${JSON.stringify({ point: faultPoint })}\n`,
              );
              process.exit(86);
            },
          },
  });
  await orchestrator.close();
}

await main();
