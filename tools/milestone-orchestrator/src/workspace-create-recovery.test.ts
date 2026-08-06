import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { captureProtectedFiles } from "./git-isolation.js";
import type { WorkspaceCreateOperation } from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  MilestoneOrchestrator,
  WorkspaceCreateBlockedError,
  WorkspaceCreateInterruptedError,
} from "./orchestrator.js";
import { runDoctorDiagnostic } from "./doctor.js";
import { createInitialState, StateStore } from "./state-store.js";
import type { WorkspaceCreateFaultPoint } from "./workspace-create.js";
import { validConfig, validProposal } from "../test/fixtures.js";

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
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: NOW,
      GIT_COMMITTER_DATE: NOW,
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const metadata = await lstat(current);
    const path = relative(root, current).replaceAll("\\", "/") || ".";
    if (metadata.isSymbolicLink()) {
      hash.update(`link\0${path}\0`);
      continue;
    }
    if (metadata.isDirectory()) {
      hash.update(`directory\0${path}\0`);
      const children = (await readdir(current)).sort().reverse();
      for (const child of children) pending.push(resolve(current, child));
      continue;
    }
    if (metadata.isFile()) {
      hash.update(`file\0${path}\0`);
      hash.update(await readFile(current));
    }
  }
  return hash.digest("hex");
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-recover-create-"));
  temporaryDirectories.push(root);
  const config = validConfig();
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Workspace Recovery Test");
  git(root, "config", "user.email", "workspace-recovery@example.invalid");
  for (const path of config.protectedPaths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `${path}\n`);
  }
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ milestoneLoop: { verification: { defaultProfile: "readiness" } } })}\n`,
  );
  await writeFile(join(root, ".gitignore"), "artifacts/\nnode_modules/\n");
  await writeFile(join(root, "change.txt"), "base\n");
  const configPath = "orchestrator-config.json";
  await writeFile(join(root, configPath), `${JSON.stringify(config)}\n`);
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture base");
  const baseCommit = git(root, "rev-parse", "HEAD");
  const initial = createInitialState({
    repositoryRoot: root,
    targetBranch: config.targetBranch,
    verifiedCommit: baseCommit,
    protectedFiles: await captureProtectedFiles(root, [
      ...config.protectedPaths,
      configPath,
    ]),
    now: NOW,
  });
  const milestone = createMilestoneRecord(
    validProposal({
      id: "workspace-recovery",
      permittedPaths: ["change.txt"],
    }),
    NOW,
  );
  const ready = {
    ...milestone,
    status: "ready" as const,
    timestamps: {
      ...milestone.timestamps,
      readyAt: NOW,
      updatedAt: NOW,
    },
    nextAllowedAction: "start-milestone" as const,
  };
  const state = {
    ...initial,
    queue: [ready.proposal.id],
    milestones: [ready],
    nextAllowedAction: "start-milestone" as const,
  };
  const store = new StateStore(root, config.statePath, () => NOW);
  await store.initialize(state);
  return { root, config, configPath, store };
}

async function crashAtWorkspaceBoundary(
  input: Awaited<ReturnType<typeof fixture>>,
  faultPoint: WorkspaceCreateFaultPoint = "after-final-publish",
): Promise<WorkspaceCreateOperation> {
  const orchestrator = await MilestoneOrchestrator.open(
    input.root,
    input.configPath,
    {
      now: () => new Date(NOW),
      createRunId: () => "workspace-recovery-run",
      createWorkspaceOperationId: () => "workspace-create-recovery-1234",
      evidenceDiscovery: async () => [],
      workspaceCreateHooks: {
        fault: (point) => {
          if (point === faultPoint)
            throw new Error(`simulated process loss at ${faultPoint}`);
        },
      },
    },
  );
  try {
    let interruption: unknown;
    try {
      await orchestrator.run({ maximumMilestones: 1 });
    } catch (error) {
      interruption = error;
    }
    expect(
      interruption instanceof WorkspaceCreateInterruptedError,
      interruption instanceof Error
        ? interruption.message
        : String(interruption),
    ).toBe(true);
    expect(orchestrator.state.pendingOperation).toMatchObject({
      kind: "workspace-create",
    });
    const operation = orchestrator.state.pendingOperation;
    if (!operation || operation.kind !== "workspace-create")
      throw new Error("Workspace-create crash did not retain its operation.");
    return operation;
  } finally {
    await orchestrator.close();
  }
}

function normalizeRepositoryRoot(
  value: unknown,
  repositoryRoot: string,
): unknown {
  if (typeof value === "string")
    return value.replaceAll(repositoryRoot, "<repository-root>");
  if (Array.isArray(value))
    return value.map((entry) => normalizeRepositoryRoot(entry, repositoryRoot));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeRepositoryRoot(entry, repositoryRoot),
      ]),
    );
  return value;
}

describe("leased workspace-create recovery", () => {
  it(
    "converges every durable and filesystem crash boundary to one state",
    { timeout: 360_000 },
    async () => {
      const faultPoints: readonly WorkspaceCreateFaultPoint[] = [
        "after-intent-persisted",
        "after-clone-started-state",
        "after-clone-command",
        "after-temporary-ready",
        "after-clone-ready-state",
        "after-publish-started-state",
        "after-final-publish",
        "after-published-state",
      ];
      const expectedPhases: Readonly<
        Record<WorkspaceCreateFaultPoint, string>
      > = {
        "after-intent-persisted": "intent-persisted",
        "after-clone-started-state": "clone-started",
        "after-clone-command": "clone-started",
        "after-temporary-ready": "clone-started",
        "after-clone-ready-state": "clone-ready",
        "after-publish-started-state": "publish-started",
        "after-final-publish": "publish-started",
        "after-published-state": "published",
      };
      let expected: unknown;
      for (const faultPoint of faultPoints) {
        const input = await fixture();
        const operation = await crashAtWorkspaceBoundary(input, faultPoint);
        expect(operation.phase, faultPoint).toBe(expectedPhases[faultPoint]);
        const recovered = await MilestoneOrchestrator.open(
          input.root,
          input.configPath,
          { now: () => new Date(NOW), evidenceDiscovery: async () => [] },
        );
        await recovered.close();
        expect(recovered.state.pendingOperation, faultPoint).toBeNull();
        expect(
          recovered.state.milestones[0]?.workspace,
          faultPoint,
        ).toMatchObject({
          path: operation.finalPath,
          branch: operation.branch,
          baseCommit: operation.baseCommit,
        });
        const normalized = normalizeRepositoryRoot(recovered.state, input.root);
        if (expected === undefined) expected = normalized;
        else expect(normalized, faultPoint).toEqual(expected);
      }
    },
  );

  it(
    "adopts an exact published clone, clears intent atomically, and is idempotent",
    { timeout: 60_000 },
    async () => {
      const input = await fixture();
      const operation = await crashAtWorkspaceBoundary(input);
      const durableBefore = await new StateStore(
        input.root,
        input.config.statePath,
      ).load();
      expect(durableBefore?.pendingOperation?.id).toBe(operation.id);
      await expect(
        MilestoneOrchestrator.inspect(input.root, input.configPath),
      ).resolves.toMatchObject({
        pendingOperation: {
          operation: { id: operation.id, phase: "publish-started" },
          recovery: {
            classification: "final-ready",
            nextSafeAction: "adopt-final-clone",
          },
        },
      });

      const recovered = await MilestoneOrchestrator.open(
        input.root,
        input.configPath,
        { now: () => new Date(NOW), evidenceDiscovery: async () => [] },
      );
      await recovered.close();
      expect(recovered.state.pendingOperation).toBeNull();
      expect(recovered.state.milestones[0]?.workspace).toMatchObject({
        path: operation.finalPath,
        branch: operation.branch,
        baseCommit: operation.baseCommit,
        createdAt: operation.createdAt,
        cleanup: { status: "active" },
      });
      const recoveredRevision = recovered.state.revision;

      const repeated = await MilestoneOrchestrator.open(
        input.root,
        input.configPath,
        { now: () => new Date(NOW), evidenceDiscovery: async () => [] },
      );
      await repeated.close();
      expect(repeated.state.revision).toBe(recoveredRevision);
      expect(repeated.state.milestones[0]?.workspace).toEqual(
        recovered.state.milestones[0]?.workspace,
      );
    },
  );

  it(
    "keeps status and doctor byte-for-byte read-only while reporting the safe action",
    { timeout: 60_000 },
    async () => {
      const input = await fixture();
      const operation = await crashAtWorkspaceBoundary(input);
      const before = {
        stateRef: git(input.root, "rev-parse", "refs/milestone-loop/state"),
        mirror: await readFile(input.store.path, "utf8"),
        tree: await treeDigest(input.root),
      };
      const status = await MilestoneOrchestrator.inspect(
        input.root,
        input.configPath,
      );
      const doctor = await runDoctorDiagnostic(
        { repositoryRoot: input.root, configPath: input.configPath },
        {
          environment: {
            npm_config_user_agent: "pnpm/11.15.1 node/v24.18.0 win32 x64",
          },
          nodeVersion: "24.18.0",
        },
      );
      expect(status.pendingOperation?.recovery).toMatchObject({
        classification: "final-ready",
        nextSafeAction: "adopt-final-clone",
      });
      expect(doctor.checks.state).toMatchObject({
        status: "attention",
        outcome: "workspace-operation-pending",
        pendingOperation: {
          id: operation.id,
          phase: "publish-started",
          classification: "final-ready",
          nextSafeAction: "adopt-final-clone",
        },
      });
      expect({
        stateRef: git(input.root, "rev-parse", "refs/milestone-loop/state"),
        mirror: await readFile(input.store.path, "utf8"),
        tree: await treeDigest(input.root),
      }).toEqual(before);
    },
  );

  it(
    "blocks and preserves a substituted final workspace on every resume",
    { timeout: 60_000 },
    async () => {
      const input = await fixture();
      const operation = await crashAtWorkspaceBoundary(input);
      await writeFile(join(operation.finalPath, "foreign.txt"), "foreign\n");
      await expect(
        MilestoneOrchestrator.open(input.root, input.configPath, {
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        }),
      ).rejects.toBeInstanceOf(WorkspaceCreateBlockedError);
      const blocked = await new StateStore(
        input.root,
        input.config.statePath,
      ).load();
      expect(blocked?.pendingOperation).toMatchObject({
        id: operation.id,
        phase: "blocked",
        diagnostic: {
          classification: "invalid-final-workspace",
          quarantinePath: null,
        },
      });
      await expect(
        readFile(join(operation.finalPath, "foreign.txt"), "utf8"),
      ).resolves.toBe("foreign\n");
      const revision = blocked?.revision;
      await expect(
        MilestoneOrchestrator.open(input.root, input.configPath, {
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        }),
      ).rejects.toBeInstanceOf(WorkspaceCreateBlockedError);
      await expect(
        new StateStore(input.root, input.config.statePath).load(),
      ).resolves.toMatchObject({ revision });
    },
  );

  it(
    "allows only the leased recovery contender to publish completion",
    { timeout: 60_000 },
    async () => {
      const input = await fixture();
      await crashAtWorkspaceBoundary(input);
      let releaseRecovery!: () => void;
      const recoveryGate = new Promise<void>((resolveGate) => {
        releaseRecovery = resolveGate;
      });
      let signalReached!: () => void;
      const reached = new Promise<void>((resolveReached) => {
        signalReached = resolveReached;
      });
      const winnerPromise = MilestoneOrchestrator.open(
        input.root,
        input.configPath,
        {
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
          workspaceCreateHooks: {
            fault: async (point) => {
              if (point === "after-published-state") {
                signalReached();
                await recoveryGate;
              }
            },
          },
        },
      );
      await reached;
      let loserError: unknown;
      try {
        await MilestoneOrchestrator.open(input.root, input.configPath, {
          now: () => new Date(NOW),
          evidenceDiscovery: async () => [],
        });
      } catch (error) {
        loserError = error;
      } finally {
        releaseRecovery();
      }
      const winner = await winnerPromise;
      await winner.close();
      expect(loserError).toBeInstanceOf(Error);
      expect((loserError as Error).message).toMatch(
        /holds the mutation lease/i,
      );
      expect(winner.state.pendingOperation).toBeNull();
      expect(winner.state.milestones[0]?.workspace).not.toBeNull();
    },
  );
});
