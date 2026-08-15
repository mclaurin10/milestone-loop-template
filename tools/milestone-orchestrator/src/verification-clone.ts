import { existsSync } from "node:fs";
import { lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { safeAgentEnvironment } from "./redaction.js";
import { superviseCommand } from "./process-supervisor.js";

export const VERIFICATION_CLONE_SCHEMA_VERSION = "1.0.0" as const;

const GIT_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;
const GIT_KILL_GRACE_MS = 500;

export interface VerificationCloneProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
}

export type VerificationCloneProcessRunner = (
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
) => Promise<VerificationCloneProcessResult>;

export interface DisposableVerificationClone {
  readonly schemaVersion: typeof VERIFICATION_CLONE_SCHEMA_VERSION;
  readonly temporaryRoot: string;
  readonly workspacePath: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  cleanup(): Promise<void>;
}

export interface CreateVerificationCloneOptions {
  readonly sourceRepository: string;
  readonly expectedCommit?: string;
  readonly timeoutMs?: number;
  readonly temporaryParent?: string;
  readonly runProcess?: VerificationCloneProcessRunner;
}

function nullGitConfigPath(): string {
  return process.platform === "win32" ? "NUL" : "/dev/null";
}

async function defaultProcessRunner(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<VerificationCloneProcessResult> {
  const result = await superviseCommand({
    executable,
    args,
    cwd,
    env: {
      ...safeAgentEnvironment(),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: nullGitConfigPath(),
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
    timeoutMs,
    killGraceMs: GIT_KILL_GRACE_MS,
    outputLimitBytes: GIT_OUTPUT_LIMIT_BYTES,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    timedOut: result.supervision.timedOut,
    outputLimitExceeded: result.supervision.outputLimitExceeded,
  };
}

function oneLine(value: string): string {
  return value
    .replaceAll(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 2_000);
}

async function runGit(
  runner: VerificationCloneProcessRunner,
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
  label: string,
): Promise<string> {
  const result = await runner("git", args, cwd, timeoutMs);
  if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) {
    const reason = result.timedOut
      ? "timed out"
      : result.outputLimitExceeded
        ? "exceeded its output bound"
        : `exited ${result.exitCode ?? "without a status"}`;
    const detail = oneLine(result.stderr || result.stdout);
    throw new Error(`${label} ${reason}${detail ? `: ${detail}` : "."}`);
  }
  return result.stdout.trim();
}

async function assertOrdinaryDirectory(path: string, label: string) {
  const [resolvedPath, metadata] = await Promise.all([
    realpath(path),
    lstat(path),
  ]);
  if (
    resolve(resolvedPath) !== resolve(path) ||
    !metadata.isDirectory() ||
    metadata.isSymbolicLink()
  )
    throw new Error(
      `${label} must be an ordinary directory with stable realpath identity.`,
    );
}

function assertObjectId(value: string, label: string): string {
  if (!/^[a-f0-9]{40,64}$/.test(value))
    throw new Error(`${label} is not a Git object ID.`);
  return value;
}

async function assertPrivateObjectDatabase(
  workspacePath: string,
): Promise<void> {
  const objectRoot = join(workspacePath, ".git", "objects");
  await assertOrdinaryDirectory(
    objectRoot,
    "Verification clone object database",
  );
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink())
        throw new Error(
          "Disposable verification clone object database contains a link.",
        );
      if (metadata.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!metadata.isFile() || metadata.nlink !== 1)
        throw new Error(
          "Disposable verification clone object database is not privately materialized.",
        );
    }
  };
  await visit(objectRoot);
}

export async function createDisposableVerificationClone(
  options: CreateVerificationCloneOptions,
): Promise<DisposableVerificationClone> {
  const sourceRepository = resolve(options.sourceRepository);
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("Verification-clone timeout must be a positive integer.");
  await assertOrdinaryDirectory(sourceRepository, "Candidate repository");
  const runner = options.runProcess ?? defaultProcessRunner;
  const topLevel = resolve(
    await runGit(
      runner,
      sourceRepository,
      ["rev-parse", "--show-toplevel"],
      timeoutMs,
      "Candidate root inspection",
    ),
  );
  if (topLevel !== sourceRepository)
    throw new Error(
      `Candidate repository root mismatch: expected ${sourceRepository}, observed ${topLevel}.`,
    );
  const status = await runGit(
    runner,
    sourceRepository,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    timeoutMs,
    "Candidate cleanliness inspection",
  );
  if (status.length > 0)
    throw new Error(
      "Disposable verification requires an exact clean candidate commit.",
    );
  const sourceCommit = assertObjectId(
    await runGit(
      runner,
      sourceRepository,
      ["rev-parse", "HEAD"],
      timeoutMs,
      "Candidate commit inspection",
    ),
    "Candidate commit",
  );
  if (options.expectedCommit && sourceCommit !== options.expectedCommit)
    throw new Error(
      `Candidate commit mismatch: expected ${options.expectedCommit}, observed ${sourceCommit}.`,
    );
  const sourceTree = assertObjectId(
    await runGit(
      runner,
      sourceRepository,
      ["rev-parse", "HEAD^{tree}"],
      timeoutMs,
      "Candidate tree inspection",
    ),
    "Candidate tree",
  );

  const temporaryParent = resolve(options.temporaryParent ?? tmpdir());
  await assertOrdinaryDirectory(
    temporaryParent,
    "Verification temporary parent",
  );
  const temporaryRoot = await mkdtemp(
    join(temporaryParent, "milestone-loop-verification-"),
  );
  const workspacePath = join(temporaryRoot, "workspace");
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(temporaryRoot, { recursive: true, force: true });
  };

  try {
    await assertOrdinaryDirectory(temporaryRoot, "Verification temporary root");
    await runGit(
      runner,
      temporaryRoot,
      [
        "clone",
        "--quiet",
        "--no-local",
        "--no-hardlinks",
        "--no-checkout",
        "--",
        sourceRepository,
        workspacePath,
      ],
      timeoutMs,
      "Disposable verification clone",
    );
    await assertOrdinaryDirectory(
      workspacePath,
      "Disposable verification workspace",
    );
    await runGit(
      runner,
      workspacePath,
      ["checkout", "--quiet", "--detach", "--force", sourceCommit],
      timeoutMs,
      "Disposable verification checkout",
    );
    await runGit(
      runner,
      workspacePath,
      ["remote", "remove", "origin"],
      timeoutMs,
      "Disposable verification remote removal",
    );
    const [clonedCommit, clonedTree, clonedStatus] = await Promise.all([
      runGit(
        runner,
        workspacePath,
        ["rev-parse", "HEAD"],
        timeoutMs,
        "Clone commit inspection",
      ),
      runGit(
        runner,
        workspacePath,
        ["rev-parse", "HEAD^{tree}"],
        timeoutMs,
        "Clone tree inspection",
      ),
      runGit(
        runner,
        workspacePath,
        ["status", "--porcelain=v1", "--untracked-files=all"],
        timeoutMs,
        "Clone cleanliness inspection",
      ),
    ]);
    if (
      clonedCommit !== sourceCommit ||
      clonedTree !== sourceTree ||
      clonedStatus.length > 0
    )
      throw new Error(
        "Disposable verification clone does not match the exact clean candidate.",
      );
    if (
      existsSync(join(workspacePath, ".git", "objects", "info", "alternates"))
    )
      throw new Error(
        "Disposable verification clone must not borrow an object database.",
      );
    await assertPrivateObjectDatabase(workspacePath);
    return Object.freeze({
      schemaVersion: VERIFICATION_CLONE_SCHEMA_VERSION,
      temporaryRoot,
      workspacePath,
      sourceCommit,
      sourceTree,
      cleanup,
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}
