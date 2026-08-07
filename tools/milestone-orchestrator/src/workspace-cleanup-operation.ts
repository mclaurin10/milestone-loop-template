import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import type {
  WorkspaceCleanupBlockedClassification,
  WorkspaceCleanupDiagnosticFile,
  WorkspaceCleanupOperation,
  WorkspaceCleanupReason,
} from "./contracts.js";
import { removeContainedPath, strictlyContained } from "./path-safety.js";
import { redactSensitiveText } from "./redaction.js";

export const WORKSPACE_CLEANUP_FAULT_POINTS = [
  "after-intent-persisted",
  "after-dependency-removal-started-state",
  "after-node-modules-delete",
  "after-dependencies-removed-state",
  "after-archive-started-state",
  "after-archive-directory",
  "after-archive-git-status",
  "after-archive-workspace-diff",
  "after-archive-recent-log",
  "after-archive-manifest",
  "after-archive-ready-state",
  "after-workspace-delete-started-state",
  "after-workspace-delete",
  "after-workspace-deleted-state",
  "after-completion-state",
] as const;
export type WorkspaceCleanupFaultPoint =
  (typeof WORKSPACE_CLEANUP_FAULT_POINTS)[number];

export interface WorkspaceCleanupHooks {
  readonly fault?: (
    point: WorkspaceCleanupFaultPoint,
    operation: WorkspaceCleanupOperation,
  ) => void | Promise<void>;
}

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface WorkspaceIdentity {
  readonly observedHeadCommit: string;
  readonly workspaceCreateOperationId: string;
  readonly workspaceStatusSha256: string;
  readonly status: string;
}

export interface WorkspaceCleanupPathInspection {
  readonly disposition: "ready" | "missing" | "invalid";
  readonly reason: string;
  readonly dependenciesPresent: boolean;
  readonly identity: WorkspaceIdentity | null;
}

export interface WorkspaceCleanupArchiveInspection {
  readonly disposition:
    | "not-required"
    | "missing"
    | "partial-exact"
    | "ready"
    | "conflict"
    | "unsafe";
  readonly reason: string;
  readonly presentFiles: readonly string[];
}

export type WorkspaceCleanupRecoveryClassification =
  | "workspace-ready"
  | "dependencies-removed"
  | "archive-incomplete"
  | "archive-ready"
  | "workspace-deleted"
  | WorkspaceCleanupBlockedClassification;

export interface WorkspaceCleanupRecoveryInspection {
  readonly operationId: string;
  readonly classification: WorkspaceCleanupRecoveryClassification;
  readonly workspace: WorkspaceCleanupPathInspection;
  readonly archive: WorkspaceCleanupArchiveInspection;
  readonly nextSafeAction:
    | "remove-reproducible-dependencies"
    | "adopt-removed-dependencies"
    | "materialize-diagnostic-archive"
    | "begin-workspace-delete"
    | "delete-workspace"
    | "adopt-deleted-workspace"
    | "manual-reconciliation-required";
  readonly message: string;
  readonly preservedPaths: readonly string[];
}

interface DiagnosticPayload {
  readonly name: WorkspaceCleanupDiagnosticFile["name"];
  readonly bytes: Buffer;
  readonly sha256: string;
}

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
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

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(
  repository: string,
  args: readonly string[],
  allowFailure = false,
): GitResult {
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", repository, ...args],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  if (result.error) throw result.error;
  const output = {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  if (!allowFailure && output.status !== 0)
    throw new Error(
      `Git cleanup inspection failed (${args.join(" ")}): ${output.stderr.trim() || output.stdout.trim()}`,
    );
  return output;
}

function gitConfig(repository: string, key: string): string | null {
  const result = git(repository, ["config", "--local", "--get", key], true);
  if (result.status === 1 && result.stdout.trim() === "") return null;
  if (result.status !== 0)
    throw new Error(`Cannot inspect workspace Git configuration ${key}.`);
  return result.stdout.trim();
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

async function inspectDirectoryChain(
  root: string,
  target: string,
): Promise<{
  readonly disposition: "ready" | "missing" | "unsafe";
  readonly reason: string;
}> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (
    lexicalTarget !== lexicalRoot &&
    !strictlyContained(lexicalRoot, lexicalTarget)
  )
    return {
      disposition: "unsafe",
      reason: "Path escapes its configured root.",
    };
  let rootMetadata;
  try {
    rootMetadata = await lstat(lexicalRoot);
  } catch (error) {
    return {
      disposition: missing(error) ? "missing" : "unsafe",
      reason: missing(error)
        ? "Configured root is missing."
        : `Cannot inspect configured root: ${String(error)}`,
    };
  }
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    return {
      disposition: "unsafe",
      reason: "Configured root is linked or is not a directory.",
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
        return { disposition: "missing", reason: "Contained path is missing." };
      return {
        disposition: "unsafe",
        reason: `Cannot inspect contained path: ${String(error)}`,
      };
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      return {
        disposition: "unsafe",
        reason:
          "Contained directory chain includes a linked or non-directory entry.",
      };
    const resolvedCurrent = await realpath(current);
    if (
      resolvedCurrent !== realRoot &&
      !strictlyContained(realRoot, resolvedCurrent)
    )
      return {
        disposition: "unsafe",
        reason: "Contained directory chain resolves outside its root.",
      };
  }
  return {
    disposition: "ready",
    reason: "Directory chain is safely contained.",
  };
}

async function ensureContainedDirectoryChain(
  root: string,
  target: string,
): Promise<void> {
  const rootInspection = await inspectDirectoryChain(root, root);
  if (rootInspection.disposition !== "ready")
    throw new Error(
      `Configured directory root is unsafe: ${rootInspection.reason}`,
    );
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (!strictlyContained(lexicalRoot, lexicalTarget))
    throw new Error(
      "Directory publication target escapes its configured root.",
    );
  const realRoot = await realpath(lexicalRoot);
  let current = lexicalRoot;
  for (const segment of relative(lexicalRoot, lexicalTarget)
    .split(/[\\/]+/u)
    .filter(Boolean)) {
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
      throw new Error("Directory publication chain contains a linked entry.");
    const resolvedCurrent = await realpath(current);
    if (!strictlyContained(realRoot, resolvedCurrent))
      throw new Error("Directory publication chain resolves outside its root.");
  }
}

async function inspectWorkspace(input: {
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly workspacePath: string;
  readonly workspaceBranch: string;
  readonly workspaceBaseCommit: string;
  readonly recordedHeadCommit: string | null;
  readonly allowRecordedHeadDivergence: boolean;
  readonly observedHeadCommit?: string;
  readonly workspaceCreateOperationId?: string;
  readonly workspaceStatusSha256?: string;
}): Promise<WorkspaceCleanupPathInspection> {
  const root = await inspectDirectoryChain(
    input.repositoryRoot,
    input.workspaceRoot,
  );
  if (root.disposition !== "ready")
    return {
      disposition: root.disposition === "missing" ? "invalid" : "invalid",
      reason: `Workspace root is unsafe: ${root.reason}`,
      dependenciesPresent: false,
      identity: null,
    };
  const chain = await inspectDirectoryChain(
    input.workspaceRoot,
    input.workspacePath,
  );
  if (chain.disposition === "missing")
    return {
      disposition: "missing",
      reason: "Recorded workspace path is missing.",
      dependenciesPresent: false,
      identity: null,
    };
  if (chain.disposition === "unsafe")
    return {
      disposition: "invalid",
      reason: chain.reason,
      dependenciesPresent: false,
      identity: null,
    };
  try {
    const workspaceReal = await realpath(input.workspacePath);
    const gitDirectory = resolve(input.workspacePath, ".git");
    const gitMetadata = await lstat(gitDirectory);
    if (!gitMetadata.isDirectory() || gitMetadata.isSymbolicLink())
      throw new Error(
        "Workspace uses a gitfile, linked Git directory, or no Git directory.",
      );
    const gitReal = await realpath(gitDirectory);
    if (!strictlyContained(workspaceReal, gitReal))
      throw new Error(
        "Workspace Git directory resolves outside the workspace.",
      );
    if (
      (await pathExists(
        resolve(gitDirectory, "objects", "info", "alternates"),
      )) ||
      git(input.workspacePath, [
        "rev-parse",
        "--is-shallow-repository",
      ]).stdout.trim() !== "false"
    )
      throw new Error("Workspace uses alternate or shallow object storage.");
    const top = git(input.workspacePath, [
      "rev-parse",
      "--show-toplevel",
    ]).stdout.trim();
    const gitDirValue = git(input.workspacePath, [
      "rev-parse",
      "--git-dir",
    ]).stdout.trim();
    const commonDirValue = git(input.workspacePath, [
      "rev-parse",
      "--git-common-dir",
    ]).stdout.trim();
    if (
      !samePath(await realpath(top), workspaceReal) ||
      !samePath(resolve(input.workspacePath, gitDirValue), gitDirectory) ||
      !samePath(resolve(input.workspacePath, commonDirValue), gitDirectory)
    )
      throw new Error("Workspace is not a standalone Git repository.");
    const branch = git(input.workspacePath, [
      "branch",
      "--show-current",
    ]).stdout.trim();
    if (branch !== input.workspaceBranch)
      throw new Error("Workspace branch differs from the cleanup intent.");
    const observedHeadCommit = git(input.workspacePath, [
      "rev-parse",
      "HEAD",
    ]).stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(observedHeadCommit))
      throw new Error("Workspace HEAD is malformed.");
    if (
      !input.allowRecordedHeadDivergence &&
      input.recordedHeadCommit !== null &&
      observedHeadCommit !== input.recordedHeadCommit
    )
      throw new Error(
        "Workspace HEAD differs from the terminal milestone record.",
      );
    const ancestor = git(
      input.workspacePath,
      [
        "merge-base",
        "--is-ancestor",
        input.workspaceBaseCommit,
        observedHeadCommit,
      ],
      true,
    );
    if (ancestor.status !== 0)
      throw new Error(
        "Workspace base is not an ancestor of its observed HEAD.",
      );
    const remotes = git(input.workspacePath, ["remote"]).stdout.trim();
    const remoteFacts = git(
      input.workspacePath,
      ["config", "--local", "--name-only", "--get-regexp", "^remote\\."],
      true,
    );
    if (remotes !== "" || remoteFacts.status !== 1)
      throw new Error("Workspace is not remote-free.");
    if (
      gitConfig(input.workspacePath, "core.autocrlf") !== "false" ||
      gitConfig(input.workspacePath, "core.eol") !== "lf" ||
      gitConfig(input.workspacePath, "milestone-loop.source-root") !==
        input.repositoryRoot ||
      gitConfig(input.workspacePath, "milestone-loop.base-commit") !==
        input.workspaceBaseCommit ||
      gitConfig(input.workspacePath, "milestone-loop.branch") !==
        input.workspaceBranch
    )
      throw new Error(
        "Workspace controller identity markers are inconsistent.",
      );
    const workspaceCreateOperationId = gitConfig(
      input.workspacePath,
      "milestone-loop.operation-id",
    );
    if (
      !workspaceCreateOperationId ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(workspaceCreateOperationId)
    )
      throw new Error(
        "Workspace creation operation marker is missing or invalid.",
      );
    const status = git(input.workspacePath, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]).stdout;
    const workspaceStatusSha256 = sha256(status);
    if (
      input.observedHeadCommit !== undefined &&
      observedHeadCommit !== input.observedHeadCommit
    )
      throw new Error(
        "Workspace HEAD drifted after cleanup intent publication.",
      );
    if (
      input.workspaceCreateOperationId !== undefined &&
      workspaceCreateOperationId !== input.workspaceCreateOperationId
    )
      throw new Error("Workspace creation identity was substituted.");
    if (
      input.workspaceStatusSha256 !== undefined &&
      workspaceStatusSha256 !== input.workspaceStatusSha256
    )
      throw new Error(
        "Workspace status drifted after cleanup intent publication.",
      );

    const nodeModules = resolve(input.workspacePath, "node_modules");
    let dependenciesPresent = false;
    try {
      const dependencyMetadata = await lstat(nodeModules);
      if (
        !dependencyMetadata.isDirectory() ||
        dependencyMetadata.isSymbolicLink() ||
        !strictlyContained(workspaceReal, await realpath(nodeModules))
      )
        throw new Error("Workspace dependency directory is linked or unsafe.");
      dependenciesPresent = true;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    return {
      disposition: "ready",
      reason: "Workspace exactly matches the cleanup intent.",
      dependenciesPresent,
      identity: {
        observedHeadCommit,
        workspaceCreateOperationId,
        workspaceStatusSha256,
        status,
      },
    };
  } catch (error) {
    return {
      disposition: "invalid",
      reason: error instanceof Error ? error.message : String(error),
      dependenciesPresent: false,
      identity: null,
    };
  }
}

function captureDiagnosticPayload(input: {
  readonly workspacePath: string;
  readonly workspaceBaseCommit: string;
}): readonly DiagnosticPayload[] {
  const values: readonly {
    readonly name: DiagnosticPayload["name"];
    readonly args: readonly string[];
  }[] = [
    {
      name: "git-status.txt",
      args: ["status", "--porcelain=v1", "--untracked-files=all"],
    },
    {
      name: "workspace.diff",
      args: [
        "diff",
        "--binary",
        "--no-ext-diff",
        input.workspaceBaseCommit,
        "--",
      ],
    },
    {
      name: "recent-git-log.txt",
      args: [
        "log",
        "--max-count=25",
        "--date=iso-strict",
        "--pretty=format:%H%x09%ad%x09%s",
      ],
    },
  ];
  return values.map(({ name, args }) => {
    const bytes = Buffer.from(
      redactSensitiveText(git(input.workspacePath, args).stdout),
      "utf8",
    );
    return { name, bytes, sha256: sha256(bytes) };
  });
}

function diagnosticDescriptors(
  payload: readonly DiagnosticPayload[],
): readonly WorkspaceCleanupDiagnosticFile[] {
  return payload.map((file) => ({
    name: file.name,
    sha256: file.sha256,
    bytes: file.bytes.byteLength,
  }));
}

function descriptorsEqual(
  left: readonly WorkspaceCleanupDiagnosticFile[],
  right: readonly WorkspaceCleanupDiagnosticFile[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function planWorkspaceCleanupOperation(input: {
  readonly operationId: string;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly configuredWorkspaceRoot: string;
  readonly configuredArtifactRoot: string;
  readonly targetBranch: string;
  readonly verifiedCommit: string;
  readonly workspacePath: string;
  readonly workspaceBranch: string;
  readonly workspaceBaseCommit: string;
  readonly recordedHeadCommit: string | null;
  readonly workspaceCreatedAt: string;
  readonly reason: Exclude<WorkspaceCleanupReason, "legacy-pre-policy">;
  readonly runArtifactDirectory: string | null;
  readonly existingRequestedAt: string | null;
  readonly existingDiagnosticArchivePath: string | null;
  readonly runId: string;
  readonly milestoneId: string;
  readonly attempt: number;
  readonly now: string;
}): Promise<WorkspaceCleanupOperation> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const workspaceRoot = resolve(repositoryRoot, input.configuredWorkspaceRoot);
  const artifactRoot = resolve(repositoryRoot, input.configuredArtifactRoot);
  const runArtifactDirectory = input.runArtifactDirectory
    ? resolve(input.runArtifactDirectory)
    : null;
  const diagnosticArchivePath =
    input.reason === "failed-delete-after-diagnostics"
      ? runArtifactDirectory
        ? resolve(
            runArtifactDirectory,
            "workspace-diagnostics",
            input.milestoneId,
          )
        : null
      : null;
  if (
    !strictlyContained(repositoryRoot, workspaceRoot) ||
    !strictlyContained(workspaceRoot, input.workspacePath) ||
    !strictlyContained(repositoryRoot, artifactRoot) ||
    (runArtifactDirectory !== null &&
      !strictlyContained(artifactRoot, runArtifactDirectory)) ||
    (diagnosticArchivePath !== null &&
      (runArtifactDirectory === null ||
        !strictlyContained(runArtifactDirectory, diagnosticArchivePath)))
  )
    throw new Error(
      "Resolved workspace-cleanup paths are not safely contained.",
    );
  if (
    input.existingDiagnosticArchivePath !== null &&
    resolve(input.existingDiagnosticArchivePath) !== diagnosticArchivePath
  )
    throw new Error(
      "Persisted cleanup diagnostic path is not the canonical controller path.",
    );
  const workspace = await inspectWorkspace({
    repositoryRoot,
    workspaceRoot,
    workspacePath: resolve(input.workspacePath),
    workspaceBranch: input.workspaceBranch,
    workspaceBaseCommit: input.workspaceBaseCommit,
    recordedHeadCommit: input.recordedHeadCommit,
    allowRecordedHeadDivergence:
      input.reason === "failed-delete-after-diagnostics" ||
      input.reason === "failed-preserve-workspace",
  });
  if (workspace.disposition !== "ready" || !workspace.identity)
    throw new Error(`Cannot plan workspace cleanup: ${workspace.reason}`);
  const payload =
    input.reason === "failed-delete-after-diagnostics"
      ? captureDiagnosticPayload({
          workspacePath: resolve(input.workspacePath),
          workspaceBaseCommit: input.workspaceBaseCommit,
        })
      : [];
  return {
    schemaVersion: "1.0.0",
    kind: "workspace-cleanup",
    id: input.operationId,
    runId: input.runId,
    milestoneId: input.milestoneId,
    attempt: input.attempt,
    inputStateGeneration: input.inputStateGeneration,
    inputStateRevision: input.inputStateRevision,
    repositoryRoot,
    workspaceRoot,
    artifactRoot,
    targetBranch: input.targetBranch,
    verifiedCommit: input.verifiedCommit,
    workspacePath: resolve(input.workspacePath),
    workspaceBranch: input.workspaceBranch,
    workspaceBaseCommit: input.workspaceBaseCommit,
    recordedHeadCommit: input.recordedHeadCommit,
    observedHeadCommit: workspace.identity.observedHeadCommit,
    workspaceCreatedAt: input.workspaceCreatedAt,
    workspaceCreateOperationId: workspace.identity.workspaceCreateOperationId,
    workspaceStatusSha256: workspace.identity.workspaceStatusSha256,
    reason: input.reason,
    runArtifactDirectory,
    diagnosticArchivePath,
    diagnosticFiles: diagnosticDescriptors(payload),
    phase: "intent-persisted",
    createdAt: input.now,
    updatedAt: input.now,
    requestedAt: input.existingRequestedAt ?? input.now,
    completionAt: input.now,
    recoveryPolicy: "validate-adopt-or-preserve",
    diagnostic: null,
  };
}

function diagnosticManifestBytes(operation: WorkspaceCleanupOperation): Buffer {
  return Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: "1.1.0",
        operationId: operation.id,
        milestoneId: operation.milestoneId,
        workspacePath: operation.workspacePath,
        baseCommit: operation.workspaceBaseCommit,
        observedHeadCommit: operation.observedHeadCommit,
        capturedAt: operation.createdAt,
        files: operation.diagnosticFiles,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function inspectArchive(
  operation: WorkspaceCleanupOperation,
): Promise<WorkspaceCleanupArchiveInspection> {
  if (!operation.diagnosticArchivePath)
    return {
      disposition: "not-required",
      reason: "Cleanup policy does not require a diagnostic archive.",
      presentFiles: [],
    };
  if (!operation.runArtifactDirectory)
    return {
      disposition: "unsafe",
      reason: "Diagnostic cleanup has no run artifact directory.",
      presentFiles: [],
    };
  const run = await inspectDirectoryChain(
    operation.artifactRoot,
    operation.runArtifactDirectory,
  );
  if (run.disposition !== "ready")
    return {
      disposition: "unsafe",
      reason: `Run artifact root is unsafe: ${run.reason}`,
      presentFiles: [],
    };
  const archive = await inspectDirectoryChain(
    operation.runArtifactDirectory,
    operation.diagnosticArchivePath,
  );
  if (archive.disposition === "missing")
    return {
      disposition: "missing",
      reason: "Diagnostic archive has not been created.",
      presentFiles: [],
    };
  if (archive.disposition === "unsafe")
    return {
      disposition: "unsafe",
      reason: archive.reason,
      presentFiles: [],
    };
  try {
    const expected = new Map<
      string,
      { readonly sha256: string; readonly bytes: number }
    >(operation.diagnosticFiles.map((file) => [file.name, file]));
    const manifest = diagnosticManifestBytes(operation);
    expected.set("manifest.json", {
      sha256: sha256(manifest),
      bytes: manifest.byteLength,
    });
    const entries = (await readdir(operation.diagnosticArchivePath)).sort();
    if (entries.some((entry) => !expected.has(entry)))
      return {
        disposition: "conflict",
        reason: "Diagnostic archive contains an unexpected entry.",
        presentFiles: entries,
      };
    for (const entry of entries) {
      const path = resolve(operation.diagnosticArchivePath, entry);
      const metadata = await lstat(path);
      const identity = expected.get(entry);
      if (
        !identity ||
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size !== identity.bytes ||
        sha256(await readFile(path)) !== identity.sha256
      )
        return {
          disposition: "conflict",
          reason: `Diagnostic archive entry ${entry} conflicts with the intent.`,
          presentFiles: entries,
        };
    }
    return entries.length === expected.size
      ? {
          disposition: "ready",
          reason: "Diagnostic archive exactly matches the cleanup intent.",
          presentFiles: entries,
        }
      : {
          disposition: "partial-exact",
          reason: "Diagnostic archive is an exact resumable prefix.",
          presentFiles: entries,
        };
  } catch (error) {
    return {
      disposition: "conflict",
      reason: error instanceof Error ? error.message : String(error),
      presentFiles: [],
    };
  }
}

function blockedInspection(
  operation: WorkspaceCleanupOperation,
  workspace: WorkspaceCleanupPathInspection,
  archive: WorkspaceCleanupArchiveInspection,
  classification: WorkspaceCleanupBlockedClassification,
  message: string,
): WorkspaceCleanupRecoveryInspection {
  return {
    operationId: operation.id,
    classification,
    workspace,
    archive,
    nextSafeAction: "manual-reconciliation-required",
    message,
    preservedPaths: [
      ...(workspace.disposition === "missing" ? [] : [operation.workspacePath]),
      ...(operation.diagnosticArchivePath && archive.disposition !== "missing"
        ? [operation.diagnosticArchivePath]
        : []),
    ],
  };
}

export async function inspectWorkspaceCleanupOperation(
  operation: WorkspaceCleanupOperation,
): Promise<WorkspaceCleanupRecoveryInspection> {
  const workspace = await inspectWorkspace({
    repositoryRoot: operation.repositoryRoot,
    workspaceRoot: operation.workspaceRoot,
    workspacePath: operation.workspacePath,
    workspaceBranch: operation.workspaceBranch,
    workspaceBaseCommit: operation.workspaceBaseCommit,
    recordedHeadCommit: operation.recordedHeadCommit,
    allowRecordedHeadDivergence:
      operation.reason === "failed-delete-after-diagnostics" ||
      operation.reason === "failed-preserve-workspace",
    observedHeadCommit: operation.observedHeadCommit,
    workspaceCreateOperationId: operation.workspaceCreateOperationId,
    workspaceStatusSha256: operation.workspaceStatusSha256,
  });
  const archive = await inspectArchive(operation);
  if (operation.phase === "blocked" && operation.diagnostic)
    return blockedInspection(
      operation,
      workspace,
      archive,
      operation.diagnostic.classification,
      operation.diagnostic.message,
    );
  if (workspace.disposition === "invalid")
    return blockedInspection(
      operation,
      workspace,
      archive,
      workspace.reason.includes("root") || workspace.reason.includes("chain")
        ? "workspace-root-unsafe"
        : "workspace-identity-drift",
      workspace.reason,
    );
  if (archive.disposition === "unsafe")
    return blockedInspection(
      operation,
      workspace,
      archive,
      "archive-root-unsafe",
      archive.reason,
    );
  if (archive.disposition === "conflict")
    return blockedInspection(
      operation,
      workspace,
      archive,
      "archive-conflict",
      archive.reason,
    );

  const preserving =
    operation.reason === "completed-preserve-workspace" ||
    operation.reason === "failed-preserve-workspace";
  const requiresArchive =
    operation.reason === "failed-delete-after-diagnostics";
  if (workspace.disposition === "missing") {
    if (
      preserving ||
      (operation.phase !== "workspace-delete-started" &&
        operation.phase !== "workspace-deleted")
    )
      return blockedInspection(
        operation,
        workspace,
        archive,
        "premature-workspace-missing",
        "Workspace disappeared before a durable delete-started phase.",
      );
    if (requiresArchive && archive.disposition !== "ready")
      return blockedInspection(
        operation,
        workspace,
        archive,
        "archive-conflict",
        "Workspace is missing before its exact diagnostic archive is complete.",
      );
    return {
      operationId: operation.id,
      classification: "workspace-deleted",
      workspace,
      archive,
      nextSafeAction: "adopt-deleted-workspace",
      message: "Durably authorized workspace deletion is externally complete.",
      preservedPaths:
        operation.diagnosticArchivePath && archive.disposition === "ready"
          ? [operation.diagnosticArchivePath]
          : [],
    };
  }

  if (operation.phase === "workspace-deleted")
    return blockedInspection(
      operation,
      workspace,
      archive,
      "state-workspace-inconsistent",
      "Durable cleanup phase says workspace-deleted, but the workspace exists.",
    );
  if (preserving) {
    const removed = !workspace.dependenciesPresent;
    if (operation.phase === "dependencies-removed" && !removed)
      return blockedInspection(
        operation,
        workspace,
        archive,
        "state-workspace-inconsistent",
        "Durable cleanup phase says dependencies-removed, but node_modules exists.",
      );
    return {
      operationId: operation.id,
      classification: removed ? "dependencies-removed" : "workspace-ready",
      workspace,
      archive,
      nextSafeAction: removed
        ? "adopt-removed-dependencies"
        : "remove-reproducible-dependencies",
      message: removed
        ? "Reproducible dependencies are already absent."
        : "Exact workspace is ready for dependency removal.",
      preservedPaths: [operation.workspacePath],
    };
  }
  if (!requiresArchive)
    return {
      operationId: operation.id,
      classification: "workspace-ready",
      workspace,
      archive,
      nextSafeAction:
        operation.phase === "workspace-delete-started"
          ? "delete-workspace"
          : "begin-workspace-delete",
      message: "Exact completed workspace is ready for deletion.",
      preservedPaths: [operation.workspacePath],
    };

  const currentPayload = captureDiagnosticPayload({
    workspacePath: operation.workspacePath,
    workspaceBaseCommit: operation.workspaceBaseCommit,
  });
  if (
    !descriptorsEqual(
      diagnosticDescriptors(currentPayload),
      operation.diagnosticFiles,
    )
  )
    return blockedInspection(
      operation,
      workspace,
      archive,
      "diagnostic-source-drift",
      "Failed-workspace diagnostic bytes drifted after intent publication.",
    );
  if (
    operation.phase === "intent-persisted" &&
    archive.disposition !== "missing"
  )
    return blockedInspection(
      operation,
      workspace,
      archive,
      "archive-conflict",
      "A diagnostic archive existed before the durable archive-started phase.",
    );
  if (
    ["archive-ready", "workspace-delete-started"].includes(operation.phase) &&
    archive.disposition !== "ready"
  )
    return blockedInspection(
      operation,
      workspace,
      archive,
      "state-workspace-inconsistent",
      "Durable cleanup phase requires a complete diagnostic archive.",
    );
  if (archive.disposition === "ready")
    return {
      operationId: operation.id,
      classification: "archive-ready",
      workspace,
      archive,
      nextSafeAction:
        operation.phase === "workspace-delete-started"
          ? "delete-workspace"
          : "begin-workspace-delete",
      message: "Exact diagnostic archive is durable before workspace deletion.",
      preservedPaths: [
        operation.workspacePath,
        operation.diagnosticArchivePath!,
      ],
    };
  return {
    operationId: operation.id,
    classification: "archive-incomplete",
    workspace,
    archive,
    nextSafeAction: "materialize-diagnostic-archive",
    message: "Diagnostic archive can resume from exact pinned bytes.",
    preservedPaths: [
      operation.workspacePath,
      ...(archive.disposition === "partial-exact"
        ? [operation.diagnosticArchivePath!]
        : []),
    ],
  };
}

async function writeExactFile(path: string, bytes: Buffer): Promise<void> {
  try {
    await writeFile(path, bytes, { flag: "wx" });
    return;
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    ))
      throw error;
  }
  const metadata = await lstat(path);
  const existing = await readFile(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !existing.equals(bytes)
  )
    throw new Error(`Cleanup artifact conflicts with pinned bytes: ${path}.`);
}

export async function materializeWorkspaceCleanupArchive(
  operation: WorkspaceCleanupOperation,
  hooks: WorkspaceCleanupHooks = {},
): Promise<void> {
  if (
    operation.reason !== "failed-delete-after-diagnostics" ||
    operation.phase !== "archive-started" ||
    !operation.diagnosticArchivePath ||
    !operation.runArtifactDirectory
  )
    throw new Error(
      "Workspace cleanup archive is not in archive-started phase.",
    );
  const workspace = await inspectWorkspace({
    repositoryRoot: operation.repositoryRoot,
    workspaceRoot: operation.workspaceRoot,
    workspacePath: operation.workspacePath,
    workspaceBranch: operation.workspaceBranch,
    workspaceBaseCommit: operation.workspaceBaseCommit,
    recordedHeadCommit: operation.recordedHeadCommit,
    allowRecordedHeadDivergence: true,
    observedHeadCommit: operation.observedHeadCommit,
    workspaceCreateOperationId: operation.workspaceCreateOperationId,
    workspaceStatusSha256: operation.workspaceStatusSha256,
  });
  if (workspace.disposition !== "ready")
    throw new Error(
      `Workspace cleanup archive source is not exact: ${workspace.reason}`,
    );
  const before = await inspectArchive(operation);
  if (before.disposition === "ready") return;
  if (
    before.disposition !== "missing" &&
    before.disposition !== "partial-exact"
  )
    throw new Error(
      `Workspace cleanup archive is not resumable: ${before.reason}`,
    );
  const payload = captureDiagnosticPayload({
    workspacePath: operation.workspacePath,
    workspaceBaseCommit: operation.workspaceBaseCommit,
  });
  if (
    !descriptorsEqual(diagnosticDescriptors(payload), operation.diagnosticFiles)
  )
    throw new Error(
      "Failed-workspace diagnostic source no longer matches intent.",
    );
  if (!(await pathExists(operation.diagnosticArchivePath))) {
    await ensureContainedDirectoryChain(
      operation.runArtifactDirectory,
      dirname(operation.diagnosticArchivePath),
    );
    await mkdir(operation.diagnosticArchivePath);
    await hooks.fault?.("after-archive-directory", operation);
  }
  const points: Readonly<
    Record<DiagnosticPayload["name"], WorkspaceCleanupFaultPoint>
  > = {
    "git-status.txt": "after-archive-git-status",
    "workspace.diff": "after-archive-workspace-diff",
    "recent-git-log.txt": "after-archive-recent-log",
  };
  for (const file of payload) {
    await writeExactFile(
      resolve(operation.diagnosticArchivePath, file.name),
      file.bytes,
    );
    await hooks.fault?.(points[file.name], operation);
  }
  await writeExactFile(
    resolve(operation.diagnosticArchivePath, "manifest.json"),
    diagnosticManifestBytes(operation),
  );
  await hooks.fault?.("after-archive-manifest", operation);
  const after = await inspectArchive(operation);
  if (after.disposition !== "ready")
    throw new Error(
      `Materialized cleanup archive failed exact validation: ${after.reason}`,
    );
}

export async function removeWorkspaceCleanupDependencies(
  operation: WorkspaceCleanupOperation,
  hooks: WorkspaceCleanupHooks = {},
): Promise<void> {
  if (operation.phase !== "dependency-removal-started")
    throw new Error("Dependency cleanup is not durably authorized.");
  const workspace = await inspectWorkspace({
    repositoryRoot: operation.repositoryRoot,
    workspaceRoot: operation.workspaceRoot,
    workspacePath: operation.workspacePath,
    workspaceBranch: operation.workspaceBranch,
    workspaceBaseCommit: operation.workspaceBaseCommit,
    recordedHeadCommit: operation.recordedHeadCommit,
    allowRecordedHeadDivergence:
      operation.reason === "failed-preserve-workspace",
    observedHeadCommit: operation.observedHeadCommit,
    workspaceCreateOperationId: operation.workspaceCreateOperationId,
    workspaceStatusSha256: operation.workspaceStatusSha256,
  });
  if (workspace.disposition !== "ready")
    throw new Error(
      `Workspace dependency cleanup refused: ${workspace.reason}`,
    );
  await removeContainedPath(
    operation.workspacePath,
    resolve(operation.workspacePath, "node_modules"),
  );
  await hooks.fault?.("after-node-modules-delete", operation);
}

export async function deleteWorkspaceCleanupWorkspace(
  operation: WorkspaceCleanupOperation,
  hooks: WorkspaceCleanupHooks = {},
): Promise<void> {
  if (operation.phase !== "workspace-delete-started")
    throw new Error("Workspace deletion is not durably authorized.");
  const inspection = await inspectWorkspaceCleanupOperation(operation);
  if (
    inspection.classification !== "workspace-ready" &&
    inspection.classification !== "archive-ready" &&
    inspection.classification !== "workspace-deleted"
  )
    throw new Error(
      `Workspace deletion refused from ${inspection.classification}: ${inspection.message}`,
    );
  if (inspection.classification !== "workspace-deleted")
    await removeContainedPath(operation.workspaceRoot, operation.workspacePath);
  await hooks.fault?.("after-workspace-delete", operation);
}
