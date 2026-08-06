import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { candidateIdentityFrom } from "./candidate-identity.js";
import { inspectAttempt } from "./git-isolation.js";
import {
  fastForwardTargetIntegration,
  fetchTargetIntegrationCandidate,
  inspectTargetForIntegration,
  inspectTargetIntegrationOperation,
  materializeTargetIntegrationOutcome,
  planTargetIntegrateOperation,
  targetIntegrationOutcome,
} from "./target-integration.js";
import { createIsolatedWorkspaceFixture } from "../test/workspace-fixture.js";

const NOW = "2026-08-06T00:00:00.000Z";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
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
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-target-action-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Target Integration Test");
  git(root, "config", "user.email", "target@example.invalid");
  await writeFile(join(root, ".gitignore"), "artifacts/\n");
  await writeFile(join(root, "base.txt"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  const baseCommit = git(root, "rev-parse", "HEAD");
  const workspace = await createIsolatedWorkspaceFixture({
    repositoryRoot: root,
    workspaceRoot: "artifacts/workspaces",
    targetBranch: "main",
    baseCommit,
    runId: "target-run",
    milestoneId: "target-milestone",
    now: NOW,
  });
  await writeFile(join(workspace.path, "base.txt"), "candidate\n");
  git(workspace.path, "add", "base.txt");
  git(workspace.path, "commit", "-m", "candidate");
  const attempt = inspectAttempt(workspace.path, baseCommit);
  const candidate = candidateIdentityFrom(baseCommit, attempt);
  const outcomePath = resolve(
    root,
    "artifacts/runs/target-run/attempt-1/git-outcome.json",
  );
  await mkdir(dirname(outcomePath), { recursive: true });
  const operation = planTargetIntegrateOperation({
    operationId: "target-integrate-action-1234",
    inputStateGeneration: "a".repeat(40),
    inputStateRevision: 7,
    repositoryRoot: root,
    targetBranch: "main",
    expectedBaseCommit: baseCommit,
    workspacePath: workspace.path,
    workspaceBranch: workspace.branch,
    candidate,
    verificationResultSha256: "b".repeat(64),
    commits: attempt.commits,
    outcomePath,
    runId: "target-run",
    milestoneId: "target-milestone",
    attempt: 1,
    now: NOW,
  });
  return { root, workspace, operation };
}

describe("target integration classification and action", () => {
  it(
    "classifies the exact base, fetches, and fast-forwards only the pinned candidate",
    { timeout: 60_000 },
    async () => {
      const input = await fixture();
      await expect(
        inspectTargetIntegrationOperation(input.operation),
      ).resolves.toMatchObject({
        classification: "target-base",
        target: { classification: "base-ready" },
        candidate: { classification: "ready" },
        outcome: { final: "absent", temporary: "absent" },
        nextSafeAction: "resume-target-update",
      });
      const points: string[] = [];
      const hooks = {
        fault: (point: string) => {
          points.push(point);
        },
      };
      await materializeTargetIntegrationOutcome(
        input.operation,
        "pending",
        hooks,
      );
      await fetchTargetIntegrationCandidate(input.operation, hooks);
      await fastForwardTargetIntegration(input.operation, hooks);
      await materializeTargetIntegrationOutcome(
        input.operation,
        "integrated",
        hooks,
      );
      expect(points).toEqual([
        "after-pending-outcome-temporary",
        "after-pending-outcome",
        "after-candidate-fetch",
        "after-target-fast-forward",
        "after-integrated-outcome-temporary",
        "after-integrated-outcome",
      ]);
      await expect(
        inspectTargetIntegrationOperation({
          ...input.operation,
          phase: "outcome-integrated",
        }),
      ).resolves.toMatchObject({
        classification: "target-candidate",
        target: { classification: "candidate-ready" },
        outcome: { final: "integrated", temporary: "absent" },
        nextSafeAction: "complete-integration",
      });
      expect(await readFile(join(input.root, "base.txt"), "utf8")).toBe(
        "candidate\n",
      );
    },
  );

  it(
    "adopts exact interrupted outcome temporaries and rejects conflicting bytes",
    { timeout: 60_000 },
    async () => {
      const input = await fixture();
      await writeFile(
        input.operation.outcomeTemporaryPath,
        `${JSON.stringify(
          targetIntegrationOutcome(input.operation, "pending"),
          null,
          2,
        )}\n`,
      );
      await materializeTargetIntegrationOutcome(input.operation, "pending");
      await expect(
        readFile(input.operation.outcomePath, "utf8"),
      ).resolves.toContain('"status": "pending"');
      await writeFile(
        input.operation.outcomeTemporaryPath,
        `${JSON.stringify(
          targetIntegrationOutcome(input.operation, "integrated"),
          null,
          2,
        )}\n`,
      );
      await materializeTargetIntegrationOutcome(input.operation, "integrated");
      await expect(
        readFile(input.operation.outcomePath, "utf8"),
      ).resolves.toContain('"status": "integrated"');
      await writeFile(input.operation.outcomePath, "foreign\n");
      await expect(
        inspectTargetIntegrationOperation(input.operation),
      ).resolves.toMatchObject({
        classification: "outcome-conflict",
        outcome: { final: "conflict" },
        nextSafeAction: "manual-reconciliation-required",
      });
    },
  );

  it(
    "fails closed for dirty, locked, unexpected, drifted, and substituted identities",
    { timeout: 90_000 },
    async () => {
      const input = await fixture();
      await expect(
        inspectTargetIntegrationOperation({
          ...input.operation,
          phase: "target-updated",
        }),
      ).resolves.toMatchObject({
        classification: "state-target-inconsistent",
      });

      await writeFile(join(input.root, "foreign.txt"), "dirty\n");
      await expect(
        inspectTargetForIntegration(input.operation),
      ).resolves.toMatchObject({ classification: "target-dirty" });
      await unlink(join(input.root, "foreign.txt"));

      await writeFile(join(input.root, ".git", "index.lock"), "locked\n");
      await expect(
        inspectTargetForIntegration(input.operation),
      ).resolves.toMatchObject({ classification: "target-index-locked" });
      await unlink(join(input.root, ".git", "index.lock"));

      git(input.root, "switch", "-c", "unexpected-branch");
      await expect(
        inspectTargetForIntegration(input.operation),
      ).resolves.toMatchObject({ classification: "target-branch-mismatch" });
      git(input.root, "switch", "main");

      await writeFile(
        join(input.root, ".git", "MERGE_HEAD"),
        `${input.operation.candidate.commit}\n`,
      );
      await expect(
        inspectTargetForIntegration(input.operation),
      ).resolves.toMatchObject({
        classification: "target-operation-in-progress",
      });
      await unlink(join(input.root, ".git", "MERGE_HEAD"));

      await writeFile(join(input.root, "external.txt"), "external\n");
      git(input.root, "add", "external.txt");
      git(input.root, "commit", "-m", "unexpected target commit");
      await expect(
        inspectTargetForIntegration(input.operation),
      ).resolves.toMatchObject({
        classification: "target-unexpected-commit",
      });

      await writeFile(join(input.workspace.path, "late.txt"), "late\n");
      git(input.workspace.path, "add", "late.txt");
      git(input.workspace.path, "commit", "-m", "candidate drift");
      await expect(
        inspectTargetIntegrationOperation(input.operation),
      ).resolves.toMatchObject({ classification: "candidate-drift" });

      const missingWorkspace = {
        ...input.operation,
        workspacePath: resolve(input.root, "artifacts/workspaces/missing"),
      };
      await expect(
        inspectTargetIntegrationOperation(missingWorkspace),
      ).resolves.toMatchObject({ classification: "workspace-path-unsafe" });

      const gitDirectory = join(input.root, ".git");
      const movedGitDirectory = join(input.root, ".git-real");
      await rename(gitDirectory, movedGitDirectory);
      await writeFile(gitDirectory, "gitdir: .git-real\n");
      await expect(
        inspectTargetForIntegration(input.operation),
      ).resolves.toMatchObject({ classification: "target-path-unsafe" });
    },
  );
});
