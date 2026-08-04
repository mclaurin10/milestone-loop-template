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
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceCleanupReason } from "./contracts.js";
import { performWorkspaceCleanup } from "./workspace-cleanup.js";

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

async function fixture(): Promise<{
  readonly root: string;
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly runDirectory: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "ski-loop-cleanup-"));
  temporaryDirectories.push(root);
  const workspaceRoot = join(root, "workspaces");
  const artifactRoot = join(root, "runs");
  const runDirectory = join(artifactRoot, "run-1");
  await Promise.all([
    mkdir(workspaceRoot, { recursive: true }),
    mkdir(runDirectory, { recursive: true }),
  ]);
  return { root, workspaceRoot, artifactRoot, runDirectory };
}

async function workspace(
  workspaceRoot: string,
  name: string,
): Promise<{ readonly path: string; readonly baseCommit: string }> {
  const path = join(workspaceRoot, name);
  await mkdir(path, { recursive: true });
  git(path, "init", "-b", "main");
  git(path, "config", "user.name", "Cleanup Test");
  git(path, "config", "user.email", "cleanup@example.invalid");
  await writeFile(join(path, "tracked.txt"), "base\n");
  git(path, "add", "tracked.txt");
  git(path, "commit", "-m", "base");
  return { path, baseCommit: git(path, "rev-parse", "HEAD") };
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

describe("terminal workspace cleanup", () => {
  it.each<WorkspaceCleanupReason>([
    "completed-preserve-workspace",
    "failed-preserve-workspace",
  ])("removes only reproducible dependencies for %s", async (reason) => {
    const paths = await fixture();
    const isolated = await workspace(paths.workspaceRoot, reason);
    await mkdir(join(isolated.path, "node_modules", "package"), {
      recursive: true,
    });
    await writeFile(
      join(isolated.path, "node_modules", "package", "index.js"),
      "export {};",
    );

    const result = await performWorkspaceCleanup({
      workspaceRoot: paths.workspaceRoot,
      artifactRoot: paths.artifactRoot,
      runArtifactDirectory: paths.runDirectory,
      workspacePath: isolated.path,
      baseCommit: isolated.baseCommit,
      milestoneId: "preserved-milestone",
      reason: reason as Exclude<WorkspaceCleanupReason, "legacy-pre-policy">,
      diagnosticArchivePath: null,
      now: NOW,
    });

    expect(result).toEqual({
      status: "preserved",
      nodeModulesRemovedAt: NOW,
      diagnosticArchivePath: null,
    });
    expect(await exists(isolated.path)).toBe(true);
    expect(await exists(join(isolated.path, "node_modules"))).toBe(false);
    expect(await readFile(join(isolated.path, "tracked.txt"), "utf8")).toBe(
      "base\n",
    );
  });

  it("archives failed-workspace diagnostics before deleting the clone", async () => {
    const paths = await fixture();
    const isolated = await workspace(paths.workspaceRoot, "failed");
    await writeFile(join(isolated.path, "tracked.txt"), "changed\n");
    await writeFile(join(isolated.path, "untracked.txt"), "diagnostic\n");
    await mkdir(join(isolated.path, "node_modules"));
    const archive = join(
      paths.runDirectory,
      "workspace-diagnostics",
      "failed-milestone",
    );

    const result = await performWorkspaceCleanup({
      workspaceRoot: paths.workspaceRoot,
      artifactRoot: paths.artifactRoot,
      runArtifactDirectory: paths.runDirectory,
      workspacePath: isolated.path,
      baseCommit: isolated.baseCommit,
      milestoneId: "failed-milestone",
      reason: "failed-delete-after-diagnostics",
      diagnosticArchivePath: archive,
      now: NOW,
    });

    expect(result.status).toBe("deleted");
    expect(result.diagnosticArchivePath).toBe(archive);
    expect(await exists(isolated.path)).toBe(false);
    expect(await readFile(join(archive, "workspace.diff"), "utf8")).toContain(
      "+changed",
    );
    expect(await readFile(join(archive, "git-status.txt"), "utf8")).toContain(
      "untracked.txt",
    );
    expect(
      JSON.parse(await readFile(join(archive, "manifest.json"), "utf8")),
    ).toMatchObject({
      milestoneId: "failed-milestone",
      baseCommit: isolated.baseCommit,
    });
    await expect(
      performWorkspaceCleanup({
        workspaceRoot: paths.workspaceRoot,
        artifactRoot: paths.artifactRoot,
        runArtifactDirectory: paths.runDirectory,
        workspacePath: isolated.path,
        baseCommit: isolated.baseCommit,
        milestoneId: "failed-milestone",
        reason: "failed-delete-after-diagnostics",
        diagnosticArchivePath: archive,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      status: "deleted",
      diagnosticArchivePath: archive,
    });
  });

  it("deletes a completed workspace without requiring diagnostics", async () => {
    const paths = await fixture();
    const isolated = await workspace(paths.workspaceRoot, "completed");
    await mkdir(join(isolated.path, "node_modules"));

    await expect(
      performWorkspaceCleanup({
        workspaceRoot: paths.workspaceRoot,
        artifactRoot: paths.artifactRoot,
        runArtifactDirectory: paths.runDirectory,
        workspacePath: isolated.path,
        baseCommit: isolated.baseCommit,
        milestoneId: "completed-milestone",
        reason: "completed-delete-workspace",
        diagnosticArchivePath: null,
        now: NOW,
      }),
    ).resolves.toMatchObject({ status: "deleted" });
    expect(await exists(isolated.path)).toBe(false);
  });

  it("finalizes a pending completed cleanup after the workspace is already gone", async () => {
    const paths = await fixture();
    const missingWorkspace = join(paths.workspaceRoot, "already-deleted");

    await expect(
      performWorkspaceCleanup({
        workspaceRoot: paths.workspaceRoot,
        artifactRoot: paths.artifactRoot,
        runArtifactDirectory: paths.runDirectory,
        workspacePath: missingWorkspace,
        baseCommit: "a".repeat(40),
        milestoneId: "completed-milestone",
        reason: "completed-delete-workspace",
        diagnosticArchivePath: null,
        now: NOW,
      }),
    ).resolves.toEqual({
      status: "deleted",
      nodeModulesRemovedAt: NOW,
      diagnosticArchivePath: null,
    });
  });
});
