import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cloneWorkspaceCreateTemporary,
  finishWorkspaceCreateTemporary,
  inspectWorkspaceCreateOperation,
  planWorkspaceCreateOperation,
  publishWorkspaceCreateTemporary,
} from "./workspace-create.js";

const NOW = "2026-08-06T00:00:00.000Z";
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

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "milestone-loop-workspace-"));
  temporaryDirectories.push(parent);
  const repositoryRoot = join(parent, "source");
  await mkdir(repositoryRoot);
  git(repositoryRoot, "init", "-b", "main");
  git(repositoryRoot, "config", "user.name", "Workspace Test");
  git(repositoryRoot, "config", "user.email", "workspace@example.invalid");
  await writeFile(join(repositoryRoot, ".gitignore"), "artifacts/\n");
  await writeFile(join(repositoryRoot, "base.txt"), "base\n");
  git(repositoryRoot, "add", ".gitignore", "base.txt");
  git(repositoryRoot, "commit", "-m", "base");
  const operation = planWorkspaceCreateOperation({
    operationId: "workspace-create-12345678",
    inputStateGeneration: "c".repeat(40),
    inputStateRevision: 7,
    repositoryRoot,
    configuredWorkspaceRoot: "artifacts/orchestrator/workspaces",
    targetBranch: "main",
    baseCommit: git(repositoryRoot, "rev-parse", "HEAD"),
    runId: "workspace-run",
    milestoneId: "workspace-milestone",
    attempt: 1,
    now: NOW,
  });
  return { parent, repositoryRoot, operation };
}

describe("recoverable workspace creation", () => {
  it(
    "plans without filesystem effects and publishes an exact remote-free clone",
    { timeout: 30_000 },
    async () => {
      const { operation } = await fixture();
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({
        classification: "missing",
        nextSafeAction: "resume-clone",
      });
      await cloneWorkspaceCreateTemporary(operation);
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({
        classification: "temporary-ready",
        temporary: { disposition: "ready" },
      });
      expect(git(operation.temporaryPath, "remote")).toBe("");
      expect(
        git(
          operation.temporaryPath,
          "config",
          "--local",
          "milestone-loop.operation-id",
        ),
      ).toBe(operation.id);
      await publishWorkspaceCreateTemporary(operation);
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({
        classification: "final-ready",
        final: { disposition: "ready" },
        nextSafeAction: "adopt-final-clone",
      });
    },
  );

  it(
    "resumes a crash after clone and adopts a crash after final publication",
    { timeout: 30_000 },
    async () => {
      const { operation } = await fixture();
      await expect(
        cloneWorkspaceCreateTemporary(operation, {
          fault: (point) => {
            if (point === "after-clone-command")
              throw new Error("simulated crash after clone");
          },
        }),
      ).rejects.toThrow("simulated crash after clone");
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({
        classification: "temporary-source-clone",
        nextSafeAction: "finish-temporary-clone",
      });
      await finishWorkspaceCreateTemporary(operation);
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({ classification: "temporary-ready" });
      await expect(
        publishWorkspaceCreateTemporary(operation, {
          fault: (point) => {
            if (point === "after-final-publish")
              throw new Error("simulated crash after publish");
          },
        }),
      ).rejects.toThrow("simulated crash after publish");
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({
        classification: "final-ready",
        nextSafeAction: "adopt-final-clone",
      });
    },
  );

  it(
    "preserves dirty, wrong-remote, substituted, and conflicting paths",
    { timeout: 30_000 },
    async () => {
      const first = await fixture();
      await cloneWorkspaceCreateTemporary(first.operation);
      await writeFile(
        join(first.operation.temporaryPath, "dirty.txt"),
        "dirty\n",
      );
      await expect(
        inspectWorkspaceCreateOperation(first.operation),
      ).resolves.toMatchObject({
        classification: "invalid-temporary-workspace",
        preservedPaths: [first.operation.temporaryPath],
      });

      const second = await fixture();
      await cloneWorkspaceCreateTemporary(second.operation);
      git(
        second.operation.temporaryPath,
        "remote",
        "add",
        "unexpected",
        second.repositoryRoot,
      );
      await expect(
        inspectWorkspaceCreateOperation(second.operation),
      ).resolves.toMatchObject({
        classification: "invalid-temporary-workspace",
      });

      const third = await fixture();
      await mkdir(dirname(third.operation.temporaryPath), { recursive: true });
      await mkdir(third.operation.temporaryPath);
      await writeFile(
        join(third.operation.temporaryPath, "foreign.txt"),
        "foreign\n",
      );
      await expect(
        inspectWorkspaceCreateOperation(third.operation),
      ).resolves.toMatchObject({
        classification: "invalid-temporary-workspace",
      });

      const fourth = await fixture();
      await cloneWorkspaceCreateTemporary(fourth.operation);
      await mkdir(fourth.operation.finalPath);
      await expect(
        inspectWorkspaceCreateOperation(fourth.operation),
      ).resolves.toMatchObject({
        classification: "ambiguous-paths",
        preservedPaths: [
          fourth.operation.temporaryPath,
          fourth.operation.finalPath,
        ],
      });
      await expect(
        publishWorkspaceCreateTemporary(fourth.operation),
      ).rejects.toThrow(/ambiguous-paths/);
    },
  );

  it.runIf(process.platform === "win32")(
    "rejects a junction workspace root without following it",
    { timeout: 30_000 },
    async () => {
      const { parent, operation } = await fixture();
      const outside = join(parent, "outside-workspaces");
      await mkdir(outside);
      await mkdir(dirname(operation.workspaceRoot), { recursive: true });
      await symlink(outside, operation.workspaceRoot, "junction");
      await expect(
        inspectWorkspaceCreateOperation(operation),
      ).resolves.toMatchObject({
        classification: "workspace-root-unsafe",
        nextSafeAction: "manual-reconciliation-required",
      });
      await expect(cloneWorkspaceCreateTemporary(operation)).rejects.toThrow(
        /workspace-root-unsafe/,
      );
    },
  );

  it(
    "rejects wrong base, wrong branch, and gitfile substitution",
    { timeout: 30_000 },
    async () => {
      const wrongBase = await fixture();
      await cloneWorkspaceCreateTemporary(wrongBase.operation);
      git(
        wrongBase.operation.temporaryPath,
        "commit",
        "--allow-empty",
        "-m",
        "unexpected commit",
      );
      await expect(
        inspectWorkspaceCreateOperation(wrongBase.operation),
      ).resolves.toMatchObject({
        classification: "invalid-temporary-workspace",
      });

      const wrongBranch = await fixture();
      await cloneWorkspaceCreateTemporary(wrongBranch.operation);
      git(wrongBranch.operation.temporaryPath, "switch", "-c", "unexpected");
      await expect(
        inspectWorkspaceCreateOperation(wrongBranch.operation),
      ).resolves.toMatchObject({
        classification: "invalid-temporary-workspace",
      });

      const gitfile = await fixture();
      await cloneWorkspaceCreateTemporary(gitfile.operation);
      await rename(
        join(gitfile.operation.temporaryPath, ".git"),
        join(gitfile.operation.temporaryPath, ".git-real"),
      );
      await writeFile(
        join(gitfile.operation.temporaryPath, ".git"),
        "gitdir: .git-real\n",
      );
      await expect(
        inspectWorkspaceCreateOperation(gitfile.operation),
      ).resolves.toMatchObject({
        classification: "invalid-temporary-workspace",
      });
    },
  );
});
