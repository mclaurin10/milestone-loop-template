import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  IsolatedWorkspaceRecord,
  ProtectedFileRecord,
} from "./contracts.js";
import { strictlyContained } from "./path-safety.js";

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runGit(
  repository: string,
  args: readonly string[],
  allowFailure = false,
): GitResult {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  const output = {
    status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  if (!allowFailure && status !== 0)
    throw new Error(
      `Git command failed (${args.join(" ")}): ${output.stderr || output.stdout}`,
    );
  return output;
}

function runGitPathList(
  repository: string,
  args: readonly string[],
): readonly string[] {
  const result = spawnSync("git", ["-C", repository, ...args, "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0)
    throw new Error(
      `Git command failed (${args.join(" ")}): ${result.stderr || result.stdout}`,
    );
  return result.stdout
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => path.replaceAll("\\", "/"));
}

export interface TargetInspection {
  readonly root: string;
  readonly branch: string;
  readonly head: string;
  readonly clean: boolean;
}

export function inspectTarget(
  repositoryRoot: string,
  expectedBranch: string,
  expectedHead?: string,
): TargetInspection {
  const topLevel = resolve(
    runGit(repositoryRoot, ["rev-parse", "--show-toplevel"]).stdout,
  );
  if (topLevel !== resolve(repositoryRoot))
    throw new Error(
      `Unsafe Git root: expected ${resolve(repositoryRoot)}, observed ${topLevel}.`,
    );
  const branch = runGit(repositoryRoot, ["branch", "--show-current"]).stdout;
  const head = runGit(repositoryRoot, ["rev-parse", "HEAD"]).stdout;
  const status = runGit(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).stdout;
  if (branch !== expectedBranch)
    throw new Error(
      `Unsafe target branch: expected ${expectedBranch}, observed ${branch || "detached"}.`,
    );
  if (expectedHead && head !== expectedHead)
    throw new Error(`Target HEAD advanced from ${expectedHead} to ${head}.`);
  if (status.length > 0)
    throw new Error("Unsafe target Git state: working tree is dirty.");
  for (const operation of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
  ]) {
    const gitPath = runGit(repositoryRoot, [
      "rev-parse",
      "--git-path",
      operation,
    ]).stdout;
    if (existsSync(resolve(repositoryRoot, gitPath)))
      throw new Error(`Unsafe target Git state: ${operation} is active.`);
  }
  return { root: topLevel, branch, head, clean: true };
}

export async function captureProtectedFiles(
  repositoryRoot: string,
  protectedPaths: readonly string[],
): Promise<readonly ProtectedFileRecord[]> {
  const records: ProtectedFileRecord[] = [];
  for (const path of protectedPaths) {
    const absolute = resolve(repositoryRoot, path);
    if (!existsSync(absolute))
      throw new Error(`Protected file is missing: ${path}.`);
    records.push({
      path: path.replaceAll("\\", "/"),
      sha256: createHash("sha256")
        .update(await readFile(absolute))
        .digest("hex"),
    });
  }
  return records;
}

export async function assertProtectedFiles(
  repositoryRoot: string,
  expected: readonly ProtectedFileRecord[],
): Promise<void> {
  for (const file of expected) {
    const absolute = resolve(repositoryRoot, file.path);
    if (!existsSync(absolute))
      throw new Error(`Protected file was deleted: ${file.path}.`);
    const actual = createHash("sha256")
      .update(await readFile(absolute))
      .digest("hex");
    if (actual !== file.sha256)
      throw new Error(`Protected file changed: ${file.path}.`);
  }
}

function safeBranchSegment(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createIsolatedWorkspace(input: {
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly targetBranch: string;
  readonly baseCommit: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly now: string;
}): Promise<IsolatedWorkspaceRecord> {
  inspectTarget(input.repositoryRoot, input.targetBranch, input.baseCommit);
  const workspaceRoot = resolve(input.repositoryRoot, input.workspaceRoot);
  const name = `${safeBranchSegment(input.runId)}-${safeBranchSegment(input.milestoneId)}`;
  const workspacePath = resolve(workspaceRoot, name);
  if (!strictlyContained(workspaceRoot, workspacePath))
    throw new Error(
      "Resolved isolated workspace is outside its configured root.",
    );
  if (existsSync(workspacePath))
    throw new Error(`Isolated workspace already exists: ${workspacePath}.`);
  await mkdir(dirname(workspacePath), { recursive: true });
  const clone = spawnSync(
    "git",
    [
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
      input.targetBranch,
      resolve(input.repositoryRoot),
      workspacePath,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  );
  if (clone.error || clone.status !== 0)
    throw new Error(
      `Could not create isolated local clone: ${clone.error?.message ?? clone.stderr}`,
    );
  runGit(workspacePath, ["remote", "remove", "origin"]);
  runGit(workspacePath, ["config", "core.autocrlf", "false"]);
  runGit(workspacePath, ["config", "core.eol", "lf"]);
  const branch = `ski-loop/${safeBranchSegment(input.runId)}/${safeBranchSegment(input.milestoneId)}`;
  runGit(workspacePath, ["switch", "-c", branch]);
  const userName = runGit(workspacePath, ["config", "user.name"], true).stdout;
  const userEmail = runGit(
    workspacePath,
    ["config", "user.email"],
    true,
  ).stdout;
  if (!userName)
    runGit(workspacePath, ["config", "user.name", "Ski Tycoon Orchestrator"]);
  if (!userEmail)
    runGit(workspacePath, [
      "config",
      "user.email",
      "orchestrator@local.invalid",
    ]);
  const head = runGit(workspacePath, ["rev-parse", "HEAD"]).stdout;
  if (head !== input.baseCommit)
    throw new Error(
      `Isolated clone started at ${head}, expected ${input.baseCommit}.`,
    );
  return {
    isolation: "standalone-local-clone-branch",
    path: workspacePath,
    branch,
    baseCommit: input.baseCommit,
    headCommit: null,
    createdAt: input.now,
    preserved: true,
    cleanup: {
      schemaVersion: "1.0.0",
      status: "active",
      reason: null,
      requestedAt: null,
      completedAt: null,
      nodeModulesRemovedAt: null,
      diagnosticArchivePath: null,
      error: null,
    },
  };
}

export interface AttemptInspection {
  readonly headCommit: string;
  readonly commits: readonly string[];
  readonly changedPaths: readonly string[];
  readonly clean: boolean;
}

export function workingChangedPaths(workspacePath: string): readonly string[] {
  return [
    ...new Set([
      ...runGitPathList(workspacePath, [
        "diff",
        "--name-only",
        "--diff-filter=ACDMRTUXB",
      ]),
      ...runGitPathList(workspacePath, [
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACDMRTUXB",
      ]),
      ...runGitPathList(workspacePath, [
        "ls-files",
        "--others",
        "--exclude-standard",
      ]),
    ]),
  ].sort();
}

export function commitWorkingChanges(
  workspacePath: string,
  requestedMessage: string,
): string {
  const paths = workingChangedPaths(workspacePath);
  if (paths.length === 0)
    throw new Error("Cannot checkpoint an empty worker tree.");
  const message = requestedMessage.replaceAll(/[\r\n\t]+/g, " ").trim();
  if (!message) throw new Error("Controller commit message cannot be empty.");
  runGit(workspacePath, ["add", "--all"]);
  const staged = runGitPathList(workspacePath, [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
  ]);
  if (staged.length === 0)
    throw new Error("Worker changes produced no staged Git content.");
  runGit(workspacePath, ["commit", "-m", message]);
  return runGit(workspacePath, ["rev-parse", "HEAD"]).stdout;
}

export function inspectAttempt(
  workspacePath: string,
  baseCommit: string,
): AttemptInspection {
  const status = runGit(workspacePath, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).stdout;
  const headCommit = runGit(workspacePath, ["rev-parse", "HEAD"]).stdout;
  const ancestor = runGit(
    workspacePath,
    ["merge-base", "--is-ancestor", baseCommit, headCommit],
    true,
  );
  if (ancestor.status !== 0)
    throw new Error(
      "Attempt history does not descend from its verified base commit.",
    );
  const commitsText = runGit(workspacePath, [
    "rev-list",
    "--reverse",
    `${baseCommit}..${headCommit}`,
  ]).stdout;
  const changedPaths = runGitPathList(workspacePath, [
    "diff",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    `${baseCommit}..${headCommit}`,
  ]);
  return {
    headCommit,
    commits: commitsText ? commitsText.split(/\r?\n/) : [],
    changedPaths,
    clean: status.length === 0,
  };
}

export function integrateFastForward(input: {
  readonly repositoryRoot: string;
  readonly targetBranch: string;
  readonly expectedBaseCommit: string;
  readonly workspacePath: string;
  readonly headCommit: string;
}): string {
  inspectTarget(
    input.repositoryRoot,
    input.targetBranch,
    input.expectedBaseCommit,
  );
  const attempt = inspectAttempt(input.workspacePath, input.expectedBaseCommit);
  if (!attempt.clean || attempt.headCommit !== input.headCommit)
    throw new Error("Attempt changed after approval or is not clean.");
  runGit(input.repositoryRoot, [
    "fetch",
    "--no-tags",
    input.workspacePath,
    input.headCommit,
  ]);
  const ancestor = runGit(
    input.repositoryRoot,
    ["merge-base", "--is-ancestor", input.expectedBaseCommit, input.headCommit],
    true,
  );
  if (ancestor.status !== 0)
    throw new Error(
      "Approved attempt is not a fast-forward descendant of target.",
    );
  runGit(input.repositoryRoot, [
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.eol=lf",
    "merge",
    "--ff-only",
    input.headCommit,
  ]);
  const final = inspectTarget(
    input.repositoryRoot,
    input.targetBranch,
    input.headCommit,
  );
  return final.head;
}

export function gitHead(repositoryRoot: string): string {
  return runGit(repositoryRoot, ["rev-parse", "HEAD"]).stdout;
}

export function currentVerificationProfile(
  repositoryRoot: string,
): "bootstrap" | "readiness" {
  const output = runGit(repositoryRoot, ["show", "HEAD:package.json"]);
  const packageJson = JSON.parse(output.stdout) as {
    skiTycoon?: { verification?: { defaultProfile?: unknown } };
  };
  const profile = packageJson.skiTycoon?.verification?.defaultProfile;
  if (profile !== "bootstrap" && profile !== "readiness")
    throw new Error("Target package.json has an invalid verification profile.");
  return profile;
}
