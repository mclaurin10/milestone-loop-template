import { spawnSync } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceCleanupReason } from "./contracts.js";
import {
  assertExistingContainedPath,
  removeContainedPath,
  strictlyContained,
} from "./path-safety.js";
import { redactSensitiveText } from "./redaction.js";
import { atomicWriteJson } from "./state-store.js";

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

function git(workspace: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", workspace, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot archive failed-workspace diagnostics (${args.join(" ")}): ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return redactSensitiveText(result.stdout);
}

async function archiveFailedWorkspace(input: {
  readonly artifactRoot: string;
  readonly runArtifactDirectory: string;
  readonly diagnosticArchivePath: string;
  readonly workspaceRoot: string;
  readonly workspacePath: string;
  readonly baseCommit: string;
  readonly milestoneId: string;
  readonly capturedAt: string;
}): Promise<void> {
  if (
    !strictlyContained(input.artifactRoot, input.runArtifactDirectory) ||
    !strictlyContained(input.runArtifactDirectory, input.diagnosticArchivePath)
  )
    throw new Error(
      "Diagnostic archive path escapes controller evidence roots.",
    );
  await assertExistingContainedPath(
    input.artifactRoot,
    input.runArtifactDirectory,
  );
  await assertExistingContainedPath(input.workspaceRoot, input.workspacePath);
  await mkdir(input.diagnosticArchivePath, { recursive: true });
  await assertExistingContainedPath(
    input.artifactRoot,
    input.diagnosticArchivePath,
  );

  const status = git(input.workspacePath, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const diff = git(input.workspacePath, [
    "diff",
    "--binary",
    "--no-ext-diff",
    input.baseCommit,
    "--",
  ]);
  const recentLog = git(input.workspacePath, [
    "log",
    "--max-count=25",
    "--date=iso-strict",
    "--pretty=format:%H%x09%ad%x09%s",
  ]);
  await Promise.all([
    writeFile(resolve(input.diagnosticArchivePath, "git-status.txt"), status),
    writeFile(resolve(input.diagnosticArchivePath, "workspace.diff"), diff),
    writeFile(
      resolve(input.diagnosticArchivePath, "recent-git-log.txt"),
      recentLog,
    ),
  ]);
  await atomicWriteJson(resolve(input.diagnosticArchivePath, "manifest.json"), {
    schemaVersion: "1.0.0",
    milestoneId: input.milestoneId,
    workspacePath: input.workspacePath,
    baseCommit: input.baseCommit,
    capturedAt: input.capturedAt,
    files: ["git-status.txt", "workspace.diff", "recent-git-log.txt"],
  });
}

export interface WorkspaceCleanupExecution {
  readonly status: "preserved" | "deleted";
  readonly nodeModulesRemovedAt: string;
  readonly diagnosticArchivePath: string | null;
}

export async function performWorkspaceCleanup(input: {
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly runArtifactDirectory: string | null;
  readonly workspacePath: string;
  readonly baseCommit: string;
  readonly milestoneId: string;
  readonly reason: Exclude<WorkspaceCleanupReason, "legacy-pre-policy">;
  readonly diagnosticArchivePath: string | null;
  readonly now: string;
}): Promise<WorkspaceCleanupExecution> {
  const deleteWorkspace =
    input.reason === "completed-delete-workspace" ||
    input.reason === "failed-delete-after-diagnostics";
  const workspaceExists = await exists(input.workspacePath);

  if (!deleteWorkspace) {
    if (!workspaceExists)
      throw new Error("Cannot preserve a terminal workspace that is missing.");
    await assertExistingContainedPath(input.workspaceRoot, input.workspacePath);
    await removeContainedPath(
      input.workspaceRoot,
      resolve(input.workspacePath, "node_modules"),
    );
    return {
      status: "preserved",
      nodeModulesRemovedAt: input.now,
      diagnosticArchivePath: null,
    };
  }

  if (input.reason === "failed-delete-after-diagnostics") {
    if (!input.runArtifactDirectory || !input.diagnosticArchivePath)
      throw new Error(
        "Failed-workspace deletion requires a durable diagnostic archive path.",
      );
    if (
      !strictlyContained(input.artifactRoot, input.runArtifactDirectory) ||
      !strictlyContained(
        input.runArtifactDirectory,
        input.diagnosticArchivePath,
      )
    )
      throw new Error(
        "Diagnostic archive path escapes controller evidence roots.",
      );
    await assertExistingContainedPath(
      input.artifactRoot,
      input.runArtifactDirectory,
    );
    const manifestPath = resolve(input.diagnosticArchivePath, "manifest.json");
    if (workspaceExists) {
      await archiveFailedWorkspace({
        artifactRoot: input.artifactRoot,
        runArtifactDirectory: input.runArtifactDirectory,
        diagnosticArchivePath: input.diagnosticArchivePath,
        workspaceRoot: input.workspaceRoot,
        workspacePath: input.workspacePath,
        baseCommit: input.baseCommit,
        milestoneId: input.milestoneId,
        capturedAt: input.now,
      });
    } else {
      if (!(await exists(manifestPath)))
        throw new Error(
          "Failed workspace disappeared before diagnostics were durably archived.",
        );
      await assertExistingContainedPath(
        input.artifactRoot,
        input.diagnosticArchivePath,
      );
      const manifest = await lstat(manifestPath);
      if (!manifest.isFile() || manifest.isSymbolicLink())
        throw new Error("Failed-workspace diagnostic manifest is not a file.");
    }
  }

  await removeContainedPath(input.workspaceRoot, input.workspacePath);
  return {
    status: "deleted",
    nodeModulesRemovedAt: input.now,
    diagnosticArchivePath: input.diagnosticArchivePath,
  };
}
