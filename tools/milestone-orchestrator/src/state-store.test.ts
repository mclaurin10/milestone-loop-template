import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { atomicWriteJson, StateStore } from "./state-store.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { validProposal, validState } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ski-loop-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("atomic state persistence", () => {
  it("validates and round trips versioned state with monotonic revision", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(
      directory,
      "artifacts/orchestrator/state/state.json",
      () => "2026-08-01T00:00:01.000Z",
    );
    const initial = await store.initialize(validState(directory));
    expect(initial.revision).toBe(0);
    const saved = await store.save(initial);
    expect(saved.revision).toBe(1);
    await expect(store.load()).resolves.toEqual(saved);
  });

  it("leaves the prior durable file intact when replacement is interrupted", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "state.json");
    await writeFile(target, '{"generation":"old"}\n', "utf8");
    await expect(
      atomicWriteJson(
        target,
        { generation: "new" },
        {
          beforeRename() {
            throw new Error("injected interruption");
          },
        },
      ),
    ).rejects.toThrow(/injected interruption/);
    expect(await readFile(target, "utf8")).toBe('{"generation":"old"}\n');
    expect(
      (await readdir(directory)).filter((name) => name.includes(".tmp-")),
    ).toEqual([]);
  });

  it("rejects malformed stored state rather than guessing a recovery", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    await writeFile(store.path, '{"schemaVersion":"0.0.0"}\n', "utf8");
    await expect(store.load()).rejects.toThrow(/Invalid orchestrator state/);
  });

  it("migrates the prior state schema without losing recoverable controller state", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const legacy = JSON.parse(JSON.stringify(validState(directory))) as Record<
      string,
      unknown
    >;
    const milestone = createMilestoneRecord(
      validProposal(),
      "2026-08-01T00:00:00.000Z",
    );
    const historicalMilestone = { ...milestone } as Record<string, unknown>;
    delete historicalMilestone["proposalProvenance"];
    const historicalProposal: Record<string, unknown> = {
      ...(historicalMilestone["proposal"] as Record<string, unknown>),
      schemaVersion: "1.0.0",
    };
    delete historicalProposal["verticalSlice"];
    historicalMilestone["proposal"] = historicalProposal;
    legacy["milestones"] = [
      {
        ...historicalMilestone,
        status: "completed",
        attempts: 1,
        workerThreadId: "pre-policy-thread",
        timestamps: {
          ...milestone.timestamps,
          startedAt: "2026-08-01T00:00:01.000Z",
          completedAt: "2026-08-01T00:00:02.000Z",
        },
        nextAllowedAction: "plan",
      },
    ];
    legacy["schemaVersion"] = "1.0.0";
    delete (legacy["run"] as Record<string, unknown>)["agentInvocations"];
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");
    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: "1.3.0",
      run: { agentInvocations: [] },
      evidenceRetention: {
        schemaVersion: "1.0.0",
        initializedAt: null,
        legacyRunIds: [],
      },
      requiredNextVerticalConsumer: null,
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
      milestones: [
        {
          proposalProvenance: {
            source: "legacy-unrecorded",
            sourcePath: null,
            sourceSha256: null,
            plannerThreadId: null,
            recordedAt: "2026-08-01T00:00:00.000Z",
            reason: "State schema predates proposal provenance.",
          },
          workerThreadLineage: [
            {
              threadId: "pre-policy-thread",
              model: "legacy-unrecorded",
              reasoningEffort: "legacy-unrecorded",
            },
          ],
        },
      ],
    });
  });

  it("grandfathers pre-cleanup workspaces and evidence as legacy-preserved", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const legacy = JSON.parse(JSON.stringify(validState(directory))) as Record<
      string,
      unknown
    >;
    const milestone = createMilestoneRecord(
      validProposal(),
      "2026-08-01T00:00:00.000Z",
    );
    const historicalMilestone = { ...milestone } as Record<string, unknown>;
    delete historicalMilestone["proposalProvenance"];
    const historicalProposal: Record<string, unknown> = {
      ...(historicalMilestone["proposal"] as Record<string, unknown>),
      schemaVersion: "1.0.0",
    };
    delete historicalProposal["verticalSlice"];
    historicalMilestone["proposal"] = historicalProposal;
    legacy["schemaVersion"] = "1.1.0";
    delete legacy["evidenceRetention"];
    legacy["milestones"] = [
      {
        ...historicalMilestone,
        status: "completed",
        workspace: {
          isolation: "standalone-local-clone-branch",
          path: join(directory, "artifacts", "workspaces", "legacy"),
          branch: "ski-loop/legacy/workspace",
          baseCommit: "a".repeat(40),
          headCommit: "b".repeat(40),
          createdAt: "2026-08-01T00:00:00.000Z",
          preserved: true,
        },
        timestamps: {
          ...milestone.timestamps,
          completedAt: "2026-08-01T00:00:02.000Z",
        },
        nextAllowedAction: "stop",
      },
    ];
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: "1.3.0",
      evidenceRetention: {
        initializedAt: null,
        legacyRunIds: [],
      },
      requiredNextVerticalConsumer: null,
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
      milestones: [
        {
          proposalProvenance: {
            source: "legacy-unrecorded",
            recordedAt: "2026-08-01T00:00:00.000Z",
            reason: "State schema predates proposal provenance.",
          },
          workspace: {
            preserved: true,
            cleanup: {
              status: "legacy-preserved",
              reason: "legacy-pre-policy",
            },
          },
        },
      ],
    });
  });

  it("migrates 1.2 state without changing prior controller facts or accepting injected reconciliation history", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const current = validState(directory);
    const legacy = JSON.parse(JSON.stringify(current)) as Record<
      string,
      unknown
    >;
    legacy["schemaVersion"] = "1.2.0";
    legacy["run"] = {
      ...(legacy["run"] as Record<string, unknown>),
      status: "stopped",
      finishedAt: "2026-08-01T00:00:02.000Z",
      stopReason: "truthful-prior-stop",
    };
    legacy["controllerHistory"] = [{ fabricated: true }];
    legacy["reconciliation"] = { active: { fabricated: true }, history: [] };
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: "1.3.0",
      revision: current.revision,
      repository: current.repository,
      queue: current.queue,
      milestones: current.milestones,
      run: {
        status: "stopped",
        finishedAt: "2026-08-01T00:00:02.000Z",
        stopReason: "truthful-prior-stop",
      },
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
    });
  });
});
