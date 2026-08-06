import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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

function commandDescription(args: readonly string[]): string {
  return `git ${args.join(" ")}`;
}

function runGit(
  repositoryRoot: string,
  args: readonly string[],
  options: { readonly input?: string; readonly allowFailure?: boolean } = {},
): GitResult {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    input: options.input,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    windowsHide: true,
  });
  if (result.error)
    throw new Error(
      `Could not execute ${commandDescription(args)} in ${repositoryRoot}: ${result.error.message}`,
      { cause: result.error },
    );
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
