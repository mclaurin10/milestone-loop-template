import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { captureOciControllerSource } from "./container-executor-source.js";

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

async function createRepository(): Promise<string> {
  const repository = await mkdtemp(
    join(tmpdir(), "milestone-loop-oci-source-"),
  );
  temporaryDirectories.push(repository);
  git(repository, "init", "-b", "main");
  git(repository, "config", "user.name", "OCI Source Test");
  git(repository, "config", "user.email", "oci-source@example.invalid");
  git(repository, "config", "core.autocrlf", "false");
  await writeFile(join(repository, "tracked.txt"), "base\n", "utf8");
  git(repository, "add", "tracked.txt");
  git(repository, "commit", "-m", "base");
  return repository;
}

function capture(repository: string) {
  return captureOciControllerSource(async (args) => git(repository, ...args));
}

describe("OCI controller source identity", () => {
  it("binds a clean checkout to the committed HEAD tree", async () => {
    const repository = await createRepository();
    await writeFile(join(repository, "unrelated.txt"), "untracked\n", "utf8");

    const identity = await capture(repository);

    expect(identity).toEqual({
      mode: "committed-head",
      head: git(repository, "rev-parse", "HEAD"),
      headTree: git(repository, "rev-parse", "HEAD^{tree}"),
      candidateTree: git(repository, "rev-parse", "HEAD^{tree}"),
      stagedPathCount: 0,
      stagedPathsSha256: createHash("sha256").update("").digest("hex"),
    });
  });

  it("binds a frozen staged candidate to the exact index tree", async () => {
    const repository = await createRepository();
    const headTree = git(repository, "rev-parse", "HEAD^{tree}");
    await writeFile(join(repository, "tracked.txt"), "candidate\n", "utf8");
    git(repository, "add", "tracked.txt");

    const identity = await capture(repository);

    expect(identity).toMatchObject({
      mode: "frozen-index",
      head: git(repository, "rev-parse", "HEAD"),
      headTree,
      candidateTree: git(repository, "write-tree"),
      stagedPathCount: 1,
      stagedPathsSha256: createHash("sha256")
        .update("tracked.txt")
        .digest("hex"),
    });
    expect(identity.candidateTree).not.toBe(headTree);
  });

  it("rejects an unstaged tracked candidate change", async () => {
    const repository = await createRepository();
    await writeFile(join(repository, "tracked.txt"), "dirty\n", "utf8");

    await expect(capture(repository)).rejects.toThrow(
      "every tracked candidate change to be staged and frozen",
    );
  });
});
