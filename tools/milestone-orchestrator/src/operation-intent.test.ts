import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  OrchestratorState,
  WorkspaceCreateOperation,
} from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  advanceWorkspaceCreateOperation,
  blockWorkspaceCreateOperation,
  completeWorkspaceCreateOperation,
  setWorkspaceCreateOperation,
} from "./operation-intent.js";
import { validateOrchestratorState } from "./schema.js";
import { StateStore } from "./state-store.js";
import { validProposal, validState } from "../test/fixtures.js";

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

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-operation-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  return root;
}

function activeState(root: string): OrchestratorState {
  const initial = validState(root);
  const milestone = createMilestoneRecord(
    validProposal({ id: "workspace-intent" }),
    NOW,
  );
  return {
    ...initial,
    queue: [milestone.proposal.id],
    milestones: [
      {
        ...milestone,
        status: "running",
        attempts: 1,
        timestamps: {
          ...milestone.timestamps,
          startedAt: NOW,
          updatedAt: NOW,
        },
        nextAllowedAction: "resume-worker",
      },
    ],
    activeMilestoneId: milestone.proposal.id,
    run: {
      ...initial.run,
      id: "workspace-run",
      status: "running",
      startedAt: NOW,
      deadlineAt: "2026-08-07T00:00:00.000Z",
    },
    nextAllowedAction: "resume-worker",
  };
}

function operation(
  state: OrchestratorState,
  root: string,
  inputStateGeneration = "c".repeat(40),
): WorkspaceCreateOperation {
  const workspaceRoot = resolve(root, "artifacts", "workspaces");
  return {
    schemaVersion: "1.0.0",
    kind: "workspace-create",
    id: "workspace-create-12345678",
    runId: "workspace-run",
    milestoneId: "workspace-intent",
    attempt: 1,
    inputStateGeneration,
    inputStateRevision: state.revision,
    repositoryRoot: resolve(root),
    workspaceRoot,
    targetBranch: "main",
    baseCommit: "a".repeat(40),
    branch: "milestone-loop/workspace-run/workspace-intent",
    temporaryPath: resolve(
      workspaceRoot,
      ".workspace-run-workspace-intent.workspace-create-12345678",
    ),
    finalPath: resolve(workspaceRoot, "workspace-run-workspace-intent"),
    phase: "intent-persisted",
    createdAt: NOW,
    updatedAt: NOW,
    recoveryPolicy: "validate-adopt-or-preserve",
    diagnostic: null,
  };
}

describe("workspace-create operation intent", () => {
  it("sets, advances, and clears only through the canonical reducers", () => {
    const root = resolve(process.cwd(), "operation-fixture");
    const state = activeState(root);
    const intent = operation(state, root);
    let next = setWorkspaceCreateOperation(state, intent);
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
    next = advanceWorkspaceCreateOperation(
      next,
      intent.id,
      "clone-started",
      NOW,
    );
    next = advanceWorkspaceCreateOperation(next, intent.id, "clone-ready", NOW);
    next = advanceWorkspaceCreateOperation(
      next,
      intent.id,
      "publish-started",
      NOW,
    );
    next = advanceWorkspaceCreateOperation(next, intent.id, "published", NOW);
    next = completeWorkspaceCreateOperation(next, intent.id);
    expect(next.pendingOperation).toBeNull();
    expect(next.milestones[0]?.workspace).toMatchObject({
      path: intent.finalPath,
      branch: intent.branch,
      baseCommit: intent.baseCommit,
      createdAt: intent.createdAt,
      cleanup: { status: "active" },
    });
    expect(validateOrchestratorState(next)).toMatchObject({ valid: true });
  });

  it("persists an explicit blocked disposition without clearing evidence", () => {
    const root = resolve(process.cwd(), "operation-fixture");
    const state = activeState(root);
    const intent = operation(state, root);
    const blocked = blockWorkspaceCreateOperation(
      setWorkspaceCreateOperation(state, intent),
      intent.id,
      {
        classification: "invalid-temporary-workspace",
        message: "Temporary path is not the exact intended clone.",
        observedAt: NOW,
        preservedPaths: [intent.temporaryPath],
        quarantinePath: null,
      },
    );
    expect(blocked.pendingOperation).toMatchObject({
      phase: "blocked",
      diagnostic: {
        classification: "invalid-temporary-workspace",
        preservedPaths: [intent.temporaryPath],
      },
    });
    expect(() => completeWorkspaceCreateOperation(blocked, intent.id)).toThrow(
      /cannot complete from blocked/,
    );
    expect(validateOrchestratorState(blocked)).toMatchObject({ valid: true });
  });

  it(
    "binds intent to the exact canonical generation and fences unrelated saves",
    { timeout: 30_000 },
    async () => {
      const root = await repository();
      const store = new StateStore(root, "artifacts/state.json", () => NOW);
      await store.initialize(validState(root));
      const running = await store.save(activeState(root));
      const generation = store.mutationGeneration();
      expect(generation.revision).toBe(running.revision);

      const wrong = operation(running, root, "d".repeat(40));
      await expect(
        store.save(setWorkspaceCreateOperation(running, wrong)),
      ).rejects.toThrow(/not bound to canonical generation/);

      const intent = operation(running, root, generation.objectId);
      const pending = await store.save(
        setWorkspaceCreateOperation(running, intent),
      );
      expect(pending.pendingOperation?.inputStateGeneration).toBe(
        generation.objectId,
      );
      await expect(store.save({ ...pending, queue: [] })).rejects.toThrow(
        /invalid phase transition|exclusively owns state mutation/,
      );

      const cloneStarted = await store.save(
        advanceWorkspaceCreateOperation(
          pending,
          intent.id,
          "clone-started",
          NOW,
        ),
      );
      const reopened = new StateStore(root, "artifacts/state.json", () => NOW);
      await expect(reopened.loadForMutation()).resolves.toEqual(cloneStarted);
    },
  );
});
