import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, rename } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  WorkspaceCreateBlockedClassification,
  WorkspaceCreateOperation,
} from "./contracts.js";
import { spawnBoundedSync } from "./bounded-spawn-sync.js";
import { inspectTarget } from "./git-isolation.js";
import { strictlyContained } from "./path-safety.js";

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type WorkspaceCreateFaultPoint =
  | "after-intent-persisted"
  | "after-clone-started-state"
  | "after-clone-command"
  | "after-temporary-ready"
  | "after-clone-ready-state"
  | "after-publish-started-state"
  | "after-final-publish"
  | "after-published-state";

export interface WorkspaceCreateHooks {
  readonly fault?: (
    point: WorkspaceCreateFaultPoint,
    operation: WorkspaceCreateOperation,
  ) => void | Promise<void>;
}

export type WorkspaceCandidateDisposition =
  "missing" | "source-clone" | "ready" | "invalid";

export interface WorkspaceCandidateInspection {
  readonly path: string;
  readonly disposition: WorkspaceCandidateDisposition;
  readonly reason: string;
}

export type WorkspaceCreateRecoveryClassification =
  | "missing"
  | "temporary-source-clone"
  | "temporary-ready"
  | "final-ready"
  | WorkspaceCreateBlockedClassification;

export interface WorkspaceCreateRecoveryInspection {
  readonly operationId: string;
  readonly classification: WorkspaceCreateRecoveryClassification;
  readonly temporary: WorkspaceCandidateInspection;
  readonly final: WorkspaceCandidateInspection;
  readonly nextSafeAction:
    | "resume-clone"
    | "finish-temporary-clone"
    | "publish-temporary-clone"
    | "adopt-final-clone"
    | "manual-reconciliation-required";
  readonly message: string;
  readonly preservedPaths: readonly string[];
}

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function git(
  repository: string,
  args: readonly string[],
  options: {
    readonly allowFailure?: boolean;
    readonly readOnly?: boolean;
  } = {},
): GitResult {
  const prefix = options.readOnly ? ["--no-optional-locks"] : [];
  const result = spawnBoundedSync(
    "git",
    [...prefix, "-C", repository, ...args],
    {
      env: options.readOnly
        ? { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
        : process.env,
    },
  );
  const output = {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  if (!options.allowFailure && output.status !== 0)
    throw new Error(
      `Git command failed (${args.join(" ")}): ${output.stderr || output.stdout}`,
    );
  return output;
}

function safeSegment(value: string): string {
  const segment = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!segment) throw new Error("Workspace identity has no safe path segment.");
  return segment;
}

export function planWorkspaceCreateOperation(input: {
  readonly operationId: string;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly configuredWorkspaceRoot: string;
  readonly targetBranch: string;
  readonly baseCommit: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly attempt: number;
  readonly now: string;
}): WorkspaceCreateOperation {
  const repositoryRoot = resolve(input.repositoryRoot);
  const workspaceRoot = resolve(repositoryRoot, input.configuredWorkspaceRoot);
  const run = safeSegment(input.runId);
  const milestone = safeSegment(input.milestoneId);
  const name = `${run}-${milestone}`;
  const operationSuffix = createHash("sha256")
    .update(input.operationId, "utf8")
    .digest("hex")
    .slice(0, 16);
  const temporaryPath = resolve(workspaceRoot, `.create-${operationSuffix}`);
  const finalPath = resolve(workspaceRoot, name);
  if (
    !strictlyContained(repositoryRoot, workspaceRoot) ||
    !strictlyContained(workspaceRoot, temporaryPath) ||
    !strictlyContained(workspaceRoot, finalPath) ||
    temporaryPath === finalPath
  )
    throw new Error(
      "Resolved workspace-create paths are not safely contained.",
    );
  return {
    schemaVersion: "1.0.0",
    kind: "workspace-create",
    id: input.operationId,
    runId: input.runId,
    milestoneId: input.milestoneId,
    attempt: input.attempt,
    inputStateGeneration: input.inputStateGeneration,
    inputStateRevision: input.inputStateRevision,
    repositoryRoot,
    workspaceRoot,
    targetBranch: input.targetBranch,
    baseCommit: input.baseCommit,
    branch: `milestone-loop/${run}/${milestone}`,
    temporaryPath,
    finalPath,
    phase: "intent-persisted",
    createdAt: input.now,
    updatedAt: input.now,
    recoveryPolicy: "validate-adopt-or-preserve",
    diagnostic: null,
  };
}

async function inspectDirectoryChain(
  root: string,
  target: string,
): Promise<{ readonly exists: boolean; readonly reason: string }> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (!strictlyContained(lexicalRoot, lexicalTarget))
    return { exists: false, reason: "Path escapes its configured root." };
  let rootMetadata;
  try {
    rootMetadata = await lstat(lexicalRoot);
  } catch (error) {
    return {
      exists: false,
      reason: missing(error)
        ? "Configured repository root is missing."
        : `Cannot inspect configured repository root: ${String(error)}`,
    };
  }
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    return {
      exists: false,
      reason: "Configured repository root is not a real directory.",
    };
  const realRoot = await realpath(lexicalRoot);
  const segments = relative(lexicalRoot, lexicalTarget)
    .split(/[\\/]+/u)
    .filter(Boolean);
  let current = lexicalRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (missing(error))
        return { exists: false, reason: "Contained directory is missing." };
      return {
        exists: false,
        reason: `Cannot inspect contained directory: ${String(error)}`,
      };
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      return {
        exists: false,
        reason:
          "Contained directory chain includes a linked or non-directory entry.",
      };
    const resolvedCurrent = await realpath(current);
    if (!strictlyContained(realRoot, resolvedCurrent))
      return {
        exists: false,
        reason: "Contained directory chain resolves outside its root.",
      };
  }
  return { exists: true, reason: "Directory chain is safely contained." };
}

async function ensureDirectoryChain(
  root: string,
  target: string,
): Promise<void> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (!strictlyContained(lexicalRoot, lexicalTarget))
    throw new Error("Workspace root escapes the repository.");
  const rootMetadata = await lstat(lexicalRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error("Repository root is not a real directory.");
  const realRoot = await realpath(lexicalRoot);
  const segments = relative(lexicalRoot, lexicalTarget)
    .split(/[\\/]+/u)
    .filter(Boolean);
  let current = lexicalRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      ))
        throw error;
    }
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(
        "Workspace directory chain includes a linked or non-directory entry.",
      );
    const resolvedCurrent = await realpath(current);
    if (!strictlyContained(realRoot, resolvedCurrent))
      throw new Error(
        "Workspace directory chain resolves outside the repository.",
      );
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

function configValue(repository: string, key: string): string | null {
  const result = git(repository, ["config", "--local", "--get", key], {
    allowFailure: true,
    readOnly: true,
  });
  if (result.status === 1 && !result.stdout) return null;
  if (result.status !== 0)
    throw new Error(`Cannot inspect local Git configuration ${key}.`);
  return result.stdout;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

async function remoteMatchesSource(
  repository: string,
  remote: string,
  sourceRoot: string,
): Promise<boolean> {
  const url = git(repository, ["remote", "get-url", remote], {
    readOnly: true,
  }).stdout;
  if (!isAbsolute(url)) return false;
  try {
    return samePath(await realpath(url), await realpath(sourceRoot));
  } catch {
    return false;
  }
}

async function inspectCandidate(
  operation: WorkspaceCreateOperation,
  path: string,
  final: boolean,
): Promise<WorkspaceCandidateInspection> {
  if (!(await pathExists(path)))
    return { path, disposition: "missing", reason: "Path is missing." };
  const parent = await inspectDirectoryChain(
    operation.workspaceRoot,
    dirname(path),
  );
  if (
    resolve(dirname(path)) !== resolve(operation.workspaceRoot) &&
    !parent.exists
  )
    return { path, disposition: "invalid", reason: parent.reason };
  try {
    const [rootReal, metadata] = await Promise.all([
      realpath(operation.workspaceRoot),
      lstat(path),
    ]);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      return {
        path,
        disposition: "invalid",
        reason: "Workspace entry is linked or is not a directory.",
      };
    const candidateReal = await realpath(path);
    if (!strictlyContained(rootReal, candidateReal))
      return {
        path,
        disposition: "invalid",
        reason: "Workspace entry resolves outside the workspace root.",
      };
    const gitDirectory = resolve(path, ".git");
    const gitMetadata = await lstat(gitDirectory);
    if (!gitMetadata.isDirectory() || gitMetadata.isSymbolicLink())
      return {
        path,
        disposition: "invalid",
        reason:
          "Workspace uses a gitfile, linked Git directory, or no Git directory.",
      };
    const gitReal = await realpath(gitDirectory);
    if (!strictlyContained(candidateReal, gitReal))
      return {
        path,
        disposition: "invalid",
        reason: "Workspace Git directory resolves outside the workspace.",
      };
    if (
      await pathExists(resolve(gitDirectory, "objects", "info", "alternates"))
    )
      return {
        path,
        disposition: "invalid",
        reason: "Workspace retains an alternate object database.",
      };

    const top = git(path, ["rev-parse", "--show-toplevel"], {
      readOnly: true,
    }).stdout;
    if (!samePath(await realpath(top), candidateReal))
      return {
        path,
        disposition: "invalid",
        reason: "Git top-level does not match the workspace path.",
      };
    const [gitDirValue, commonDirValue] = [
      git(path, ["rev-parse", "--git-dir"], { readOnly: true }).stdout,
      git(path, ["rev-parse", "--git-common-dir"], { readOnly: true }).stdout,
    ];
    if (
      !samePath(resolve(path, gitDirValue), gitDirectory) ||
      !samePath(resolve(path, commonDirValue), gitDirectory)
    )
      return {
        path,
        disposition: "invalid",
        reason: "Workspace is not a standalone Git repository.",
      };
    if (
      git(path, ["rev-parse", "HEAD"], { readOnly: true }).stdout !==
      operation.baseCommit
    )
      return {
        path,
        disposition: "invalid",
        reason: "Workspace HEAD does not match the recorded base commit.",
      };
    if (
      git(path, ["status", "--porcelain=v1", "--untracked-files=all"], {
        readOnly: true,
      }).stdout
    )
      return {
        path,
        disposition: "invalid",
        reason: "Workspace is not clean.",
      };
    if (
      configValue(path, "core.autocrlf") !== "false" ||
      configValue(path, "core.eol") !== "lf" ||
      git(path, ["rev-parse", "--is-shallow-repository"], {
        readOnly: true,
      }).stdout !== "false"
    )
      return {
        path,
        disposition: "invalid",
        reason: "Workspace clone configuration is not canonical.",
      };

    const branch = git(path, ["branch", "--show-current"], {
      readOnly: true,
    }).stdout;
    const remotesText = git(path, ["remote"], { readOnly: true }).stdout;
    const remotes = remotesText ? remotesText.split(/\r?\n/u) : [];
    const remoteFacts = git(
      path,
      ["config", "--local", "--name-only", "--get-regexp", "^remote\\."],
      { allowFailure: true, readOnly: true },
    );
    if (![0, 1].includes(remoteFacts.status))
      return {
        path,
        disposition: "invalid",
        reason: "Workspace remote configuration cannot be inspected.",
      };
    const markers = {
      operationId: configValue(path, "milestone-loop.operation-id"),
      sourceRoot: configValue(path, "milestone-loop.source-root"),
      baseCommit: configValue(path, "milestone-loop.base-commit"),
      branch: configValue(path, "milestone-loop.branch"),
    };
    const expectedMarkers = {
      operationId: operation.id,
      sourceRoot: operation.repositoryRoot,
      baseCommit: operation.baseCommit,
      branch: operation.branch,
    };
    if (
      Object.entries(markers).some(
        ([key, value]) =>
          value !== null &&
          value !== expectedMarkers[key as keyof typeof expectedMarkers],
      )
    )
      return {
        path,
        disposition: "invalid",
        reason:
          "Workspace controller identity markers do not match the intent.",
      };
    const markersComplete = Object.entries(expectedMarkers).every(
      ([key, value]) => markers[key as keyof typeof markers] === value,
    );
    const noRemoteFacts = remotes.length === 0 && remoteFacts.status === 1;
    if (branch === operation.branch && noRemoteFacts && markersComplete)
      return {
        path,
        disposition: "ready",
        reason: "Workspace exactly matches the recorded isolated clone.",
      };
    if (final)
      return {
        path,
        disposition: "invalid",
        reason: "Final workspace is not fully configured and remote-free.",
      };
    const originOnly =
      remotes.length === 1 &&
      remotes[0] === "origin" &&
      (await remoteMatchesSource(path, "origin", operation.repositoryRoot));
    if (
      (branch === operation.targetBranch || branch === operation.branch) &&
      ((originOnly && remoteFacts.status === 0) || noRemoteFacts)
    )
      return {
        path,
        disposition: "source-clone",
        reason:
          "Temporary clone is exact and can finish controller configuration.",
      };
    return {
      path,
      disposition: "invalid",
      reason: "Workspace branch or remote facts do not match the intent.",
    };
  } catch (error) {
    return {
      path,
      disposition: "invalid",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function inspectWorkspaceCreateOperation(
  operation: WorkspaceCreateOperation,
): Promise<WorkspaceCreateRecoveryInspection> {
  const root = await inspectDirectoryChain(
    operation.repositoryRoot,
    operation.workspaceRoot,
  );
  if (!root.exists && root.reason !== "Contained directory is missing.") {
    const missingTemporary = {
      path: operation.temporaryPath,
      disposition: "missing" as const,
      reason: "Workspace root is unsafe.",
    };
    const missingFinal = {
      path: operation.finalPath,
      disposition: "missing" as const,
      reason: "Workspace root is unsafe.",
    };
    return {
      operationId: operation.id,
      classification: "workspace-root-unsafe",
      temporary: missingTemporary,
      final: missingFinal,
      nextSafeAction: "manual-reconciliation-required",
      message: root.reason,
      preservedPaths: [],
    };
  }
  const [temporary, final] = root.exists
    ? await Promise.all([
        inspectCandidate(operation, operation.temporaryPath, false),
        inspectCandidate(operation, operation.finalPath, true),
      ])
    : [
        {
          path: operation.temporaryPath,
          disposition: "missing" as const,
          reason: "Path is missing.",
        },
        {
          path: operation.finalPath,
          disposition: "missing" as const,
          reason: "Path is missing.",
        },
      ];
  const temporaryPresent = temporary.disposition !== "missing";
  const finalPresent = final.disposition !== "missing";
  if (temporaryPresent && finalPresent)
    return {
      operationId: operation.id,
      classification: "ambiguous-paths",
      temporary,
      final,
      nextSafeAction: "manual-reconciliation-required",
      message:
        "Both temporary and final workspace paths exist; both were preserved.",
      preservedPaths: [operation.temporaryPath, operation.finalPath],
    };
  if (finalPresent)
    return final.disposition === "ready"
      ? {
          operationId: operation.id,
          classification: "final-ready",
          temporary,
          final,
          nextSafeAction: "adopt-final-clone",
          message: final.reason,
          preservedPaths: [operation.finalPath],
        }
      : {
          operationId: operation.id,
          classification: "invalid-final-workspace",
          temporary,
          final,
          nextSafeAction: "manual-reconciliation-required",
          message: final.reason,
          preservedPaths: [operation.finalPath],
        };
  if (temporaryPresent) {
    if (temporary.disposition === "source-clone")
      return {
        operationId: operation.id,
        classification: "temporary-source-clone",
        temporary,
        final,
        nextSafeAction: "finish-temporary-clone",
        message: temporary.reason,
        preservedPaths: [operation.temporaryPath],
      };
    if (temporary.disposition === "ready")
      return {
        operationId: operation.id,
        classification: "temporary-ready",
        temporary,
        final,
        nextSafeAction: "publish-temporary-clone",
        message: temporary.reason,
        preservedPaths: [operation.temporaryPath],
      };
    return {
      operationId: operation.id,
      classification: "invalid-temporary-workspace",
      temporary,
      final,
      nextSafeAction: "manual-reconciliation-required",
      message: temporary.reason,
      preservedPaths: [operation.temporaryPath],
    };
  }
  return {
    operationId: operation.id,
    classification: "missing",
    temporary,
    final,
    nextSafeAction: "resume-clone",
    message:
      "Neither recorded workspace path exists; cloning can resume safely.",
    preservedPaths: [],
  };
}

export async function finishWorkspaceCreateTemporary(
  operation: WorkspaceCreateOperation,
): Promise<void> {
  const before = await inspectCandidate(
    operation,
    operation.temporaryPath,
    false,
  );
  if (before.disposition === "ready") return;
  if (before.disposition !== "source-clone")
    throw new Error(
      `Temporary workspace cannot be finalized: ${before.reason}`,
    );
  const remotesText = git(operation.temporaryPath, ["remote"], {
    readOnly: true,
  }).stdout;
  const remotes = remotesText ? remotesText.split(/\r?\n/u) : [];
  if (
    remotes.length > 1 ||
    (remotes.length === 1 &&
      (remotes[0] !== "origin" ||
        !(await remoteMatchesSource(
          operation.temporaryPath,
          "origin",
          operation.repositoryRoot,
        ))))
  )
    throw new Error("Temporary workspace has unexpected remote facts.");
  for (const [key, value] of Object.entries({
    "core.autocrlf": "false",
    "core.eol": "lf",
    "user.name": "Milestone Orchestrator",
    "user.email": "orchestrator@local.invalid",
    "milestone-loop.operation-id": operation.id,
    "milestone-loop.source-root": operation.repositoryRoot,
    "milestone-loop.base-commit": operation.baseCommit,
    "milestone-loop.branch": operation.branch,
  }))
    git(operation.temporaryPath, ["config", "--local", key, value]);
  if (remotes[0] === "origin")
    git(operation.temporaryPath, ["remote", "remove", "origin"]);
  const branch = git(operation.temporaryPath, ["branch", "--show-current"], {
    readOnly: true,
  }).stdout;
  if (branch === operation.targetBranch)
    git(operation.temporaryPath, ["switch", "-c", operation.branch]);
  else if (branch !== operation.branch)
    throw new Error("Temporary workspace is on an unexpected branch.");
  const after = await inspectCandidate(
    operation,
    operation.temporaryPath,
    false,
  );
  if (after.disposition !== "ready")
    throw new Error(`Temporary workspace finalization failed: ${after.reason}`);
}

export async function cloneWorkspaceCreateTemporary(
  operation: WorkspaceCreateOperation,
  hooks: WorkspaceCreateHooks = {},
): Promise<void> {
  inspectTarget(
    operation.repositoryRoot,
    operation.targetBranch,
    operation.baseCommit,
  );
  const initial = await inspectWorkspaceCreateOperation(operation);
  if (initial.classification !== "missing")
    throw new Error(
      `Workspace clone cannot start from ${initial.classification}.`,
    );
  await ensureDirectoryChain(operation.repositoryRoot, operation.workspaceRoot);
  if (
    (await pathExists(operation.temporaryPath)) ||
    (await pathExists(operation.finalPath))
  )
    throw new Error("A recorded workspace path appeared before clone start.");
  const clone = spawnBoundedSync("git", [
    "clone",
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.eol=lf",
    "--local",
    "--no-hardlinks",
    "--no-tags",
    "--single-branch",
    "--branch",
    operation.targetBranch,
    operation.repositoryRoot,
    operation.temporaryPath,
  ]);
  if (clone.status !== 0)
    throw new Error(
      `Could not create temporary isolated clone: ${clone.stderr}`,
    );
  await hooks.fault?.("after-clone-command", operation);
  await finishWorkspaceCreateTemporary(operation);
  await hooks.fault?.("after-temporary-ready", operation);
}

async function noClobberRename(source: string, target: string): Promise<void> {
  if (process.platform === "win32") {
    await rename(source, target);
    return;
  }
  const args =
    process.platform === "darwin"
      ? ["-n", source, target]
      : ["--no-clobber", "--no-target-directory", source, target];
  const moved = spawnSync("mv", args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (moved.error || moved.status !== 0)
    throw new Error(
      `Atomic no-clobber workspace publication failed: ${moved.error?.message ?? moved.stderr}`,
    );
  if (await pathExists(source))
    throw new Error(
      "Final workspace path already exists; publication preserved both paths.",
    );
}

export async function publishWorkspaceCreateTemporary(
  operation: WorkspaceCreateOperation,
  hooks: WorkspaceCreateHooks = {},
): Promise<void> {
  const root = await inspectDirectoryChain(
    operation.repositoryRoot,
    operation.workspaceRoot,
  );
  if (!root.exists) throw new Error(`Workspace root is unsafe: ${root.reason}`);
  const before = await inspectWorkspaceCreateOperation(operation);
  if (before.classification !== "temporary-ready")
    throw new Error(
      `Workspace publication cannot start from ${before.classification}.`,
    );
  await noClobberRename(operation.temporaryPath, operation.finalPath);
  await hooks.fault?.("after-final-publish", operation);
  const after = await inspectWorkspaceCreateOperation(operation);
  if (after.classification !== "final-ready")
    throw new Error(
      `Published workspace failed exact validation: ${after.message}`,
    );
}
