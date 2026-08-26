import { resolve } from "node:path";

import { spawnBoundedSync } from "./bounded-spawn-sync.js";

export const CONTROLLER_LEASE_REF =
  "refs/milestone-loop/controller-lease" as const;
export const STATE_REF = "refs/milestone-loop/state" as const;

export type MilestoneLoopPrivateRef =
  typeof CONTROLLER_LEASE_REF | typeof STATE_REF;

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitTreeEntry {
  readonly mode: string;
  readonly type: string;
  readonly objectId: string;
  readonly name: string;
}

export interface GitCommitObject {
  readonly objectId: string;
  readonly treeObjectId: string;
  readonly parentObjectIds: readonly string[];
  readonly author: string;
  readonly committer: string;
  readonly message: string;
  readonly entries: readonly GitTreeEntry[];
}

function commandDescription(args: readonly string[]): string {
  return `git ${args.join(" ")}`;
}

function runGit(
  repositoryRoot: string,
  args: readonly string[],
  options: {
    readonly input?: string;
    readonly allowFailure?: boolean;
    readonly environment?: NodeJS.ProcessEnv;
  } = {},
): GitResult {
  const result = spawnBoundedSync("git", ["-C", repositoryRoot, ...args], {
    env: options.environment
      ? { ...process.env, ...options.environment }
      : process.env,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    ...(options.input === undefined ? {} : { input: options.input }),
  });
  const status = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (status !== 0 && !options.allowFailure) {
    const detail = stderr.trim() || stdout.trim() || `exit ${status}`;
    throw new Error(
      `${commandDescription(args)} failed in ${repositoryRoot}: ${detail}`,
    );
  }
  return { status, stdout, stderr };
}

function validateObjectId(value: string, description: string): string {
  const objectId = value.trim();
  if (!OBJECT_ID_PATTERN.test(objectId))
    throw new Error(`${description} returned an invalid Git object ID.`);
  return objectId;
}

function failedGitCommand(
  repositoryRoot: string,
  args: readonly string[],
  result: GitResult,
): Error {
  const detail =
    result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
  return new Error(
    `${commandDescription(args)} failed in ${repositoryRoot}: ${detail}`,
  );
}

/**
 * A fixed, repository-private Git ref with expected-old publication.
 *
 * Only controller-owned ref names are accepted. Candidate data can be stored
 * in objects, but it can never select a ref name or bypass the expected-old
 * comparison.
 */
export class GitPrivateRefStore {
  readonly repositoryRoot: string;

  constructor(
    repositoryRoot: string,
    readonly reference: MilestoneLoopPrivateRef,
  ) {
    this.repositoryRoot = resolve(repositoryRoot);
  }

  readReference(): string | null {
    const args = ["rev-parse", "--verify", "--quiet", this.reference] as const;
    const result = runGit(this.repositoryRoot, args, { allowFailure: true });
    if (result.status === 1 && result.stdout.trim() === "") return null;
    if (result.status !== 0)
      throw failedGitCommand(this.repositoryRoot, args, result);
    return validateObjectId(result.stdout, commandDescription(args));
  }

  writeBlob(contents: string): string {
    const args = ["hash-object", "-w", "--stdin"] as const;
    const result = runGit(this.repositoryRoot, args, { input: contents });
    return validateObjectId(result.stdout, commandDescription(args));
  }

  readBlob(objectId: string): string {
    validateObjectId(objectId, "private-ref object ID");
    const typeArgs = ["cat-file", "-t", objectId] as const;
    const type = runGit(this.repositoryRoot, typeArgs).stdout.trim();
    if (type !== "blob")
      throw new Error(
        `Private ref ${this.reference} points to ${objectId}, which is a ${type || "missing object"} rather than a blob.`,
      );
    return runGit(this.repositoryRoot, ["cat-file", "blob", objectId]).stdout;
  }

  writeTree(entries: readonly GitTreeEntry[]): string {
    const serialized = entries
      .map((entry) => {
        if (
          entry.mode !== "100644" ||
          entry.type !== "blob" ||
          !["legacy-state.json", "metadata.json", "state.json"].includes(
            entry.name,
          )
        )
          throw new Error("Refusing an unsupported private state-tree entry.");
        validateObjectId(entry.objectId, "private state-tree object ID");
        return `${entry.mode} ${entry.type} ${entry.objectId}\t${entry.name}\n`;
      })
      .join("");
    const args = ["mktree"] as const;
    const result = runGit(this.repositoryRoot, args, { input: serialized });
    return validateObjectId(result.stdout, commandDescription(args));
  }

  writeCommit(input: {
    readonly treeObjectId: string;
    readonly parentObjectId: string | null;
    readonly timestamp: string;
    readonly message: string;
  }): string {
    validateObjectId(input.treeObjectId, "private state-tree object ID");
    if (input.parentObjectId !== null)
      validateObjectId(input.parentObjectId, "private state parent object ID");
    if (!Number.isFinite(Date.parse(input.timestamp)))
      throw new Error("Private state commit timestamp is invalid.");
    const args = ["commit-tree", input.treeObjectId];
    if (input.parentObjectId !== null) args.push("-p", input.parentObjectId);
    const result = runGit(this.repositoryRoot, args, {
      input: `${input.message.trimEnd()}\n`,
      environment: {
        GIT_AUTHOR_NAME: "Milestone Loop",
        GIT_AUTHOR_EMAIL: "milestone-loop@example.invalid",
        GIT_AUTHOR_DATE: input.timestamp,
        GIT_COMMITTER_NAME: "Milestone Loop",
        GIT_COMMITTER_EMAIL: "milestone-loop@example.invalid",
        GIT_COMMITTER_DATE: input.timestamp,
        LC_ALL: "C",
      },
    });
    return validateObjectId(result.stdout, commandDescription(args));
  }

  readCommit(objectId: string): GitCommitObject {
    validateObjectId(objectId, "private state commit object ID");
    const type = runGit(this.repositoryRoot, [
      "cat-file",
      "-t",
      objectId,
    ]).stdout.trim();
    if (type !== "commit")
      throw new Error(
        `Private ref ${this.reference} points to ${objectId}, which is a ${type || "missing object"} rather than a commit.`,
      );
    const rawCommit = runGit(this.repositoryRoot, [
      "cat-file",
      "commit",
      objectId,
    ]).stdout;
    const separator = rawCommit.indexOf("\n\n");
    if (separator === -1)
      throw new Error(
        `Private state commit ${objectId} has an invalid header boundary.`,
      );
    const headerLines = rawCommit.slice(0, separator).split("\n");
    const linesWithPrefix = (prefix: string) =>
      headerLines.filter((line) => line.startsWith(prefix));
    const treeLines = linesWithPrefix("tree ");
    const parentLines = linesWithPrefix("parent ");
    const authorLines = linesWithPrefix("author ");
    const committerLines = linesWithPrefix("committer ");
    if (
      treeLines.length !== 1 ||
      authorLines.length !== 1 ||
      committerLines.length !== 1 ||
      headerLines.some(
        (line) =>
          !line.startsWith("tree ") &&
          !line.startsWith("parent ") &&
          !line.startsWith("author ") &&
          !line.startsWith("committer "),
      )
    )
      throw new Error(`Private state commit ${objectId} has invalid headers.`);
    const treeObjectId = validateObjectId(
      treeLines[0]!.slice("tree ".length),
      `private state commit ${objectId} tree`,
    );
    const parentObjectIds = parentLines.map((line) =>
      validateObjectId(
        line.slice("parent ".length),
        `private state commit ${objectId} parent`,
      ),
    );
    const rawEntries = runGit(this.repositoryRoot, [
      "ls-tree",
      "-z",
      objectId,
    ]).stdout;
    const entries = rawEntries
      .split("\0")
      .filter((entry) => entry.length > 0)
      .map((entry): GitTreeEntry => {
        const match =
          /^(\d{6}) ([a-z]+) ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/u.exec(entry);
        if (!match)
          throw new Error(
            `Private state commit ${objectId} has a malformed tree entry.`,
          );
        return {
          mode: match[1]!,
          type: match[2]!,
          objectId: match[3]!,
          name: match[4]!,
        };
      });
    return {
      objectId,
      treeObjectId,
      parentObjectIds,
      author: authorLines[0]!.slice("author ".length),
      committer: committerLines[0]!.slice("committer ".length),
      message: rawCommit.slice(separator + 2),
      entries,
    };
  }

  readCommitFile(
    commitObjectId: string,
    path: "legacy-state.json" | "metadata.json" | "state.json",
  ): string {
    validateObjectId(commitObjectId, "private state commit object ID");
    return runGit(this.repositoryRoot, [
      "cat-file",
      "blob",
      `${commitObjectId}:${path}`,
    ]).stdout;
  }

  compareAndSwap(
    expectedObjectId: string | null,
    newObjectId: string,
  ): boolean {
    validateObjectId(newObjectId, "new private-ref object ID");
    if (expectedObjectId !== null)
      validateObjectId(expectedObjectId, "expected private-ref object ID");
    const expected = expectedObjectId ?? "0".repeat(newObjectId.length);
    const args = [
      "update-ref",
      "--no-deref",
      this.reference,
      newObjectId,
      expected,
    ] as const;
    const result = runGit(this.repositoryRoot, args, { allowFailure: true });
    if (result.status === 0) return true;
    const observedAfterFailure = this.readReference();
    if (observedAfterFailure !== expectedObjectId) return false;
    throw failedGitCommand(this.repositoryRoot, args, result);
  }

  deleteIfMatches(expectedObjectId: string): boolean {
    validateObjectId(expectedObjectId, "expected private-ref object ID");
    if (this.readReference() !== expectedObjectId) return false;
    const args = [
      "update-ref",
      "--no-deref",
      "-d",
      this.reference,
      expectedObjectId,
    ] as const;
    const result = runGit(this.repositoryRoot, args, { allowFailure: true });
    if (result.status === 0) return true;
    const observedAfterFailure = this.readReference();
    if (observedAfterFailure !== expectedObjectId) return false;
    throw failedGitCommand(this.repositoryRoot, args, result);
  }
}
