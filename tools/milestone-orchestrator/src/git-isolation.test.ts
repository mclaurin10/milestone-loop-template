import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  commitWorkingChanges,
  createIsolatedWorkspace,
  inspectAttempt,
  integrateFastForward,
  workingChangedPaths,
} from "./git-isolation.js";

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
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

describe("Git isolation", () => {
  it("keeps failed work isolated and integrates only an approved fast-forward", async () => {
    const parent = await mkdtemp(join(tmpdir(), "milestone-loop-git-"));
    temporaryDirectories.push(parent);
    const repository = join(parent, "source");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(repository));
    git(repository, "init", "-b", "main");
    git(repository, "config", "user.name", "Test User");
    git(repository, "config", "user.email", "test@example.invalid");
    await writeFile(join(repository, ".gitignore"), "artifacts/\n", "utf8");
    await writeFile(join(repository, "base.txt"), "verified\n", "utf8");
    git(repository, "add", ".gitignore", "base.txt");
    git(repository, "commit", "-m", "base");
    const base = git(repository, "rev-parse", "HEAD");

    const workspace = await createIsolatedWorkspace({
      repositoryRoot: repository,
      workspaceRoot: "artifacts/orchestrator/workspaces",
      targetBranch: "main",
      baseCommit: base,
      runId: "test-run",
      milestoneId: "git-isolation",
      now: "2026-08-01T00:00:00.000Z",
    });
    expect(git(workspace.path, "config", "--local", "core.autocrlf")).toBe(
      "false",
    );
    expect(git(workspace.path, "config", "--local", "core.eol")).toBe("lf");
    await writeFile(join(workspace.path, "base.txt"), "attempt\n", "utf8");
    expect(await readFile(join(repository, "base.txt"), "utf8")).toBe(
      "verified\n",
    );
    expect(workingChangedPaths(workspace.path)).toEqual(["base.txt"]);
    const checkpoint = commitWorkingChanges(
      workspace.path,
      "Controller checkpoint: isolated attempt",
    );
    const attempt = inspectAttempt(workspace.path, base);
    expect(attempt.headCommit).toBe(checkpoint);
    expect(attempt.clean).toBe(true);
    expect(attempt.commits).toHaveLength(1);
    expect(attempt.changedPaths).toEqual(["base.txt"]);

    const integrated = integrateFastForward({
      repositoryRoot: repository,
      targetBranch: "main",
      expectedBaseCommit: base,
      workspacePath: workspace.path,
      headCommit: attempt.headCommit,
    });
    expect(integrated).toBe(attempt.headCommit);
    expect(await readFile(join(repository, "base.txt"), "utf8")).toBe(
      "attempt\n",
    );
  }, 30_000);
});
