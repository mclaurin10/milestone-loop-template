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
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  WorkspaceCleanupOperation,
  WorkspaceCleanupReason,
} from "./contracts.js";
import {
  deleteWorkspaceCleanupWorkspace,
  inspectWorkspaceCleanupOperation,
  materializeWorkspaceCleanupArchive,
  planWorkspaceCleanupOperation,
  removeWorkspaceCleanupDependencies,
} from "./workspace-cleanup-operation.js";
import { createIsolatedWorkspaceFixture } from "../test/workspace-fixture.js";

const NOW = "2026-08-02T18:00:00.000Z";
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

async function fixture(
  reason: Exclude<WorkspaceCleanupReason, "legacy-pre-policy">,
): Promise<{
  readonly root: string;
  readonly operation: WorkspaceCleanupOperation;
}> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-cleanup-unit-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Cleanup Operation Test");
  git(root, "config", "user.email", "cleanup-operation@example.invalid");
  await writeFile(join(root, "tracked.txt"), "base\n");
  await writeFile(join(root, ".gitignore"), "node_modules/\n");
  git(root, "add", "tracked.txt", ".gitignore");
  git(root, "commit", "-m", "cleanup fixture base");
  const baseCommit = git(root, "rev-parse", "HEAD");
  const workspace = await createIsolatedWorkspaceFixture({
    repositoryRoot: root,
    workspaceRoot: "artifacts/workspaces",
    targetBranch: "main",
    baseCommit,
    runId: "cleanup-run",
    milestoneId: "cleanup-milestone",
    now: NOW,
  });
  await mkdir(join(workspace.path, "node_modules", "package"), {
    recursive: true,
  });
  await writeFile(
    join(workspace.path, "node_modules", "package", "index.js"),
    "export {};\n",
  );
  if (reason.startsWith("failed-")) {
    await writeFile(join(workspace.path, "tracked.txt"), "failed work\n");
    await writeFile(join(workspace.path, "untracked.txt"), "diagnostic\n");
    git(workspace.path, "add", "tracked.txt");
    git(workspace.path, "commit", "-m", "failed candidate drift");
    await writeFile(
      join(workspace.path, "tracked.txt"),
      "failed work\npending\n",
    );
  }
  const runArtifactDirectory = resolve(
    root,
    "artifacts/orchestrator/runs/cleanup-run",
  );
  await mkdir(runArtifactDirectory, { recursive: true });
  return {
    root,
    operation: await planWorkspaceCleanupOperation({
      operationId: "workspace-cleanup-unit",
      inputStateGeneration: "a".repeat(40),
      inputStateRevision: 0,
      repositoryRoot: root,
      configuredWorkspaceRoot: "artifacts/workspaces",
      configuredArtifactRoot: "artifacts/orchestrator/runs",
      targetBranch: "main",
      verifiedCommit: baseCommit,
      workspacePath: workspace.path,
      workspaceBranch: workspace.branch,
      workspaceBaseCommit: workspace.baseCommit,
      recordedHeadCommit: baseCommit,
      workspaceCreatedAt: workspace.createdAt,
      reason,
      runArtifactDirectory,
      existingRequestedAt: null,
      existingDiagnosticArchivePath: null,
      runId: "cleanup-run",
      milestoneId: "cleanup-milestone",
      attempt: 1,
      now: NOW,
    }),
  };
}

describe("recoverable terminal workspace cleanup", () => {
  it.each([
    "completed-preserve-workspace",
    "failed-preserve-workspace",
  ] as const)(
    "removes only reproducible dependencies for %s",
    async (reason) => {
      const { operation } = await fixture(reason);
      expect(await inspectWorkspaceCleanupOperation(operation)).toMatchObject({
        classification: "workspace-ready",
        nextSafeAction: "remove-reproducible-dependencies",
      });
      const started = {
        ...operation,
        phase: "dependency-removal-started" as const,
      };
      await removeWorkspaceCleanupDependencies(started);
      expect(await inspectWorkspaceCleanupOperation(started)).toMatchObject({
        classification: "dependencies-removed",
        nextSafeAction: "adopt-removed-dependencies",
      });
      expect(await exists(operation.workspacePath)).toBe(true);
      expect(await exists(join(operation.workspacePath, "node_modules"))).toBe(
        false,
      );
    },
    30_000,
  );

  it("materializes exact failed diagnostics before deleting the workspace", async () => {
    const { operation } = await fixture("failed-delete-after-diagnostics");
    const archiveStarted = { ...operation, phase: "archive-started" as const };
    await materializeWorkspaceCleanupArchive(archiveStarted);
    expect(
      await inspectWorkspaceCleanupOperation(archiveStarted),
    ).toMatchObject({
      classification: "archive-ready",
      nextSafeAction: "begin-workspace-delete",
    });
    const manifest = JSON.parse(
      await readFile(
        join(operation.diagnosticArchivePath!, "manifest.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: "1.1.0",
      operationId: operation.id,
      milestoneId: operation.milestoneId,
      files: operation.diagnosticFiles,
    });
    expect(
      await readFile(
        join(operation.diagnosticArchivePath!, "workspace.diff"),
        "utf8",
      ),
    ).toContain("+failed work");
    const deleteStarted = {
      ...archiveStarted,
      phase: "workspace-delete-started" as const,
    };
    await deleteWorkspaceCleanupWorkspace(deleteStarted);
    expect(await inspectWorkspaceCleanupOperation(deleteStarted)).toMatchObject(
      {
        classification: "workspace-deleted",
        nextSafeAction: "adopt-deleted-workspace",
      },
    );
  }, 30_000);

  it("deletes an exact completed workspace only after durable authorization", async () => {
    const { operation } = await fixture("completed-delete-workspace");
    const started = {
      ...operation,
      phase: "workspace-delete-started" as const,
    };
    await deleteWorkspaceCleanupWorkspace(started);
    expect(await inspectWorkspaceCleanupOperation(started)).toMatchObject({
      classification: "workspace-deleted",
    });
    expect(await exists(operation.workspacePath)).toBe(false);
  }, 30_000);

  it("classifies premature disappearance and archive conflicts without deleting", async () => {
    const completed = await fixture("completed-delete-workspace");
    await rm(completed.operation.workspacePath, { recursive: true });
    expect(
      await inspectWorkspaceCleanupOperation(completed.operation),
    ).toMatchObject({
      classification: "premature-workspace-missing",
      nextSafeAction: "manual-reconciliation-required",
    });

    const failed = await fixture("failed-delete-after-diagnostics");
    const archiveStarted = {
      ...failed.operation,
      phase: "archive-started" as const,
    };
    await mkdir(failed.operation.diagnosticArchivePath!, { recursive: true });
    await writeFile(
      join(failed.operation.diagnosticArchivePath!, "foreign.txt"),
      "foreign\n",
    );
    expect(
      await inspectWorkspaceCleanupOperation(archiveStarted),
    ).toMatchObject({
      classification: "archive-conflict",
      nextSafeAction: "manual-reconciliation-required",
    });
    expect(await exists(failed.operation.workspacePath)).toBe(true);
  }, 30_000);

  it("blocks diagnostic source drift even when the Git status shape is unchanged", async () => {
    const { operation } = await fixture("failed-delete-after-diagnostics");
    await writeFile(
      join(operation.workspacePath, "tracked.txt"),
      "failed work\nother\n",
    );
    expect(await inspectWorkspaceCleanupOperation(operation)).toMatchObject({
      classification: "diagnostic-source-drift",
      nextSafeAction: "manual-reconciliation-required",
      preservedPaths: [operation.workspacePath],
    });
    expect(await exists(operation.workspacePath)).toBe(true);
    expect(await exists(operation.diagnosticArchivePath!)).toBe(false);
  }, 30_000);
});
