import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CandidateIdentityMismatchError,
  assertCandidateIdentityUnchanged,
  candidateIdentitiesEqual,
  candidateIdentityFrom,
  computeChangedEntriesDigest,
  differingIdentityFields,
} from "./candidate-identity.js";
import { inspectAttempt } from "./git-isolation.js";

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
  if (result.status !== 0)
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

const IDENTITY = {
  baseCommit: "a".repeat(40),
  commit: "b".repeat(40),
  tree: "c".repeat(40),
  clean: true,
  changedEntriesDigest: "d".repeat(64),
} as const;

describe("candidate identity", () => {
  it("computes an order-independent, NUL-framed, versioned digest", () => {
    const forward = computeChangedEntriesDigest(["b entry", "a entry"]);
    const reversed = computeChangedEntriesDigest(["a entry", "b entry"]);
    expect(forward).toBe(reversed);
    expect(forward).toMatch(/^[a-f0-9]{64}$/);
    expect(computeChangedEntriesDigest(["a entry"])).not.toBe(
      computeChangedEntriesDigest(["a entry", "b entry"]),
    );
    expect(computeChangedEntriesDigest(["ab", "c"])).not.toBe(
      computeChangedEntriesDigest(["a", "bc"]),
    );
    expect(computeChangedEntriesDigest([])).not.toBe(
      computeChangedEntriesDigest([""]),
    );
  });

  it("names every differing field and throws a typed mismatch error", () => {
    const observed = {
      ...IDENTITY,
      commit: "e".repeat(40),
      clean: false,
    };
    expect(differingIdentityFields(IDENTITY, IDENTITY)).toEqual([]);
    expect(differingIdentityFields(IDENTITY, observed)).toEqual([
      "commit",
      "clean",
    ]);
    expect(candidateIdentitiesEqual(IDENTITY, IDENTITY)).toBe(true);
    expect(candidateIdentitiesEqual(IDENTITY, observed)).toBe(false);
    expect(() =>
      assertCandidateIdentityUnchanged("review-entry", IDENTITY, observed),
    ).toThrow(CandidateIdentityMismatchError);
    try {
      assertCandidateIdentityUnchanged("review-entry", IDENTITY, observed);
    } catch (error) {
      expect(error).toBeInstanceOf(CandidateIdentityMismatchError);
      if (error instanceof CandidateIdentityMismatchError) {
        expect(error.boundary).toBe("review-entry");
        expect(error.differingFields).toEqual(["commit", "clean"]);
      }
    }
    expect(() =>
      assertCandidateIdentityUnchanged("review-entry", IDENTITY, IDENTITY),
    ).not.toThrow();
  });

  it("captures tree and mode-sensitive changed entries from a real repository", async () => {
    const repository = await mkdtemp(
      join(tmpdir(), "milestone-loop-identity-"),
    );
    temporaryDirectories.push(repository);
    git(repository, "init", "-b", "main");
    git(repository, "config", "user.name", "Identity Test");
    git(repository, "config", "user.email", "identity@example.invalid");
    await writeFile(join(repository, "change.txt"), "base\n", "utf8");
    git(repository, "add", "change.txt");
    git(repository, "commit", "-m", "base");
    const base = git(repository, "rev-parse", "HEAD");

    await writeFile(join(repository, "change.txt"), "content\n", "utf8");
    git(repository, "add", "change.txt");
    git(repository, "commit", "-m", "content");
    const contentIdentity = candidateIdentityFrom(
      base,
      inspectAttempt(repository, base),
    );
    expect(contentIdentity.baseCommit).toBe(base);
    expect(contentIdentity.commit).toBe(git(repository, "rev-parse", "HEAD"));
    expect(contentIdentity.tree).toBe(
      git(repository, "rev-parse", "HEAD^{tree}"),
    );
    expect(contentIdentity.clean).toBe(true);
    expect(contentIdentity.changedEntriesDigest).toMatch(/^[a-f0-9]{64}$/);

    const recomputed = candidateIdentityFrom(
      base,
      inspectAttempt(repository, base),
    );
    expect(candidateIdentitiesEqual(contentIdentity, recomputed)).toBe(true);

    git(repository, "update-index", "--chmod=+x", "change.txt");
    git(repository, "commit", "-m", "mode only");
    await chmod(join(repository, "change.txt"), 0o755);
    const modeIdentity = candidateIdentityFrom(
      base,
      inspectAttempt(repository, base),
    );
    expect(modeIdentity.clean).toBe(true);
    expect(modeIdentity.changedEntriesDigest).not.toBe(
      contentIdentity.changedEntriesDigest,
    );
    expect(modeIdentity.tree).not.toBe(contentIdentity.tree);

    await writeFile(join(repository, "dirty.txt"), "dirty\n", "utf8");
    const dirtyIdentity = candidateIdentityFrom(
      base,
      inspectAttempt(repository, base),
    );
    expect(dirtyIdentity.clean).toBe(false);
    expect(differingIdentityFields(modeIdentity, dirtyIdentity)).toEqual([
      "clean",
    ]);
  }, 30_000);
});
