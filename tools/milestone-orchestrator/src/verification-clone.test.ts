import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDisposableVerificationClone } from "./verification-clone.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

function git(root: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || `git ${args.join(" ")} failed`,
    );
  return result.stdout.trim();
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-clone-source-"));
  roots.push(root);
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["config", "user.name", "Verification Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(root, "value.txt"), "committed\n", "utf8");
  git(root, ["add", "value.txt"]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  return root;
}

describe("disposable verification clone", () => {
  it("creates an origin-free, no-alternates exact clone and cleans it idempotently", async () => {
    const source = await repository();
    const commit = git(source, ["rev-parse", "HEAD"]);
    const clone = await createDisposableVerificationClone({
      sourceRepository: source,
      expectedCommit: commit,
      timeoutMs: 5_000,
    });
    expect(clone.sourceCommit).toBe(commit);
    expect(git(clone.workspacePath, ["rev-parse", "HEAD"])).toBe(commit);
    expect(git(clone.workspacePath, ["remote"])).toBe("");
    expect(
      existsSync(
        join(clone.workspacePath, ".git", "objects", "info", "alternates"),
      ),
    ).toBe(false);
    await writeFile(join(source, "value.txt"), "mutated-after-clone\n", "utf8");
    expect(await readFile(join(clone.workspacePath, "value.txt"), "utf8")).toBe(
      "committed\n",
    );
    await clone.cleanup();
    await clone.cleanup();
    expect(existsSync(clone.temporaryRoot)).toBe(false);
  });

  it("rejects a dirty source and a mismatched expected commit before cloning", async () => {
    const source = await repository();
    await writeFile(join(source, "untracked.txt"), "dirty\n", "utf8");
    await expect(
      createDisposableVerificationClone({
        sourceRepository: source,
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/exact clean candidate/);
    await rm(join(source, "untracked.txt"));
    await expect(
      createDisposableVerificationClone({
        sourceRepository: source,
        expectedCommit: "f".repeat(40),
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/commit mismatch/);
  });

  it("rejects a symlinked repository root before invoking Git", async () => {
    const source = await repository();
    const link = `${source}-link`;
    roots.push(link);
    const { symlink } = await import("node:fs/promises");
    await symlink(
      source,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      createDisposableVerificationClone({
        sourceRepository: link,
        timeoutMs: 500,
      }),
    ).rejects.toThrow(/ordinary directory/);
  });
});
