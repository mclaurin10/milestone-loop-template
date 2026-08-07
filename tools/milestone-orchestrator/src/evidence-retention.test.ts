import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { OrchestratorState } from "./contracts.js";
import {
  buildEvidenceRetentionPlan,
  discoverManagedEvidenceRuns,
  planManagedEvidenceRuns,
  type EvidenceRetentionPlan,
} from "./evidence-retention.js";
import { applyEvidenceRetentionPlan } from "./retention-apply-operation.js";
import { StateStore } from "./state-store.js";
import {
  validConfig,
  validReconciliationRecord,
  validState,
} from "../test/fixtures.js";

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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return false;
    throw error;
  }
}

async function createRun(
  artifactRoot: string,
  id: string,
  finishedAt: string,
): Promise<void> {
  const directory = join(artifactRoot, id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "result.json"),
    `${JSON.stringify({ runId: id, finishedAt })}\n`,
  );
}

async function createControllerRun(
  artifactRoot: string,
  id: string,
  finishedAt: string,
): Promise<void> {
  const directory = join(artifactRoot, id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "run-summary.json"),
    `${JSON.stringify({ run: { id, finishedAt } })}\n`,
  );
}

// Real-git fixtures run slowly under full-suite parallel load; the budget
// mirrors the reconciliation describe.
describe(
  "verification evidence retention planning",
  { timeout: 60_000 },
  () => {
    it("plans deletions without deleting anything", async () => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-retention-"));
      temporaryDirectories.push(root);
      git(root, "init", "-b", "main");
      git(root, "config", "user.name", "Retention Test");
      git(root, "config", "user.email", "retention@example.invalid");
      await mkdir(join(root, ".agent"), { recursive: true });
      await writeFile(
        join(root, ".agent", "record.md"),
        "Baseline evidence: cited-run\n",
      );
      git(root, "add", ".agent/record.md");
      git(root, "commit", "-m", "record cited evidence");

      const artifactRoot = join(root, "artifacts");
      await Promise.all([
        createRun(artifactRoot, "legacy-run", "2026-08-01T00:00:00.000Z"),
        createRun(artifactRoot, "cited-run", "2026-08-01T01:00:00.000Z"),
        createRun(artifactRoot, "durable-run", "2026-08-01T02:00:00.000Z"),
        createRun(artifactRoot, "prune-run", "2026-08-01T03:00:00.000Z"),
        createRun(artifactRoot, "recent-run", "2026-08-01T04:00:00.000Z"),
        mkdir(join(artifactRoot, "manual"), { recursive: true }),
      ]);
      const baseState = validState(root);
      const state = {
        ...baseState,
        run: { ...baseState.run, id: "durable-run" },
      };

      const report = await planManagedEvidenceRuns({
        repositoryRoot: root,
        artifactRoot,
        keepRecentRuns: 1,
        legacyRunIds: ["legacy-run"],
        durableState: state,
        safety: {
          candidateCommit: state.repository.verifiedCommit,
          activeReconciliation: false,
          inventoryHasUnknownReferences: false,
        },
        now: "2026-08-02T00:00:00.000Z",
      });

      expect(report).toMatchObject({
        schemaVersion: "1.1.0",
        mode: "plan",
        recentRunIds: ["recent-run"],
        citedRunIds: ["cited-run", "durable-run"],
        eligibleRunIds: ["prune-run"],
        plannedDeletions: [
          {
            id: "prune-run",
            path: join(artifactRoot, "prune-run"),
            finishedAt: "2026-08-01T03:00:00.000Z",
          },
        ],
        suspended: false,
      });
      for (const id of [
        "legacy-run",
        "cited-run",
        "durable-run",
        "prune-run",
        "recent-run",
        "manual",
      ])
        expect(await exists(join(artifactRoot, id))).toBe(true);
    });

    it("produces byte-identical plans for identical inputs", async () => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-retention-"));
      temporaryDirectories.push(root);
      git(root, "init", "-b", "main");
      git(root, "config", "user.name", "Retention Test");
      git(root, "config", "user.email", "retention@example.invalid");
      await writeFile(join(root, "record.md"), "Determinism fixture.\n");
      git(root, "add", "record.md");
      git(root, "commit", "-m", "determinism fixture");
      const artifactRoot = join(root, "artifacts");
      await createRun(artifactRoot, "run-one", "2026-08-01T00:00:00.000Z");
      await createRun(artifactRoot, "run-two", "2026-08-01T01:00:00.000Z");
      const input = {
        repositoryRoot: root,
        artifactRoot,
        keepRecentRuns: 1,
        legacyRunIds: [],
        durableState: validState(root),
        safety: {
          candidateCommit: validState(root).repository.verifiedCommit,
          activeReconciliation: false,
          inventoryHasUnknownReferences: false,
        },
        now: "2026-08-02T00:00:00.000Z",
      } as const;

      const [first, second] = await Promise.all([
        planManagedEvidenceRuns(input),
        planManagedEvidenceRuns(input),
      ]);
      const firstBytes = JSON.stringify(first, null, 2);
      const secondBytes = JSON.stringify(second, null, 2);
      expect(firstBytes).toBe(secondBytes);
      expect(createHash("sha256").update(firstBytes).digest("hex")).toBe(
        createHash("sha256").update(secondBytes).digest("hex"),
      );
    });

    it("treats malformed and unmanifested directories as unmanaged", async () => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-retention-"));
      temporaryDirectories.push(root);
      const artifactRoot = join(root, "artifacts");
      await mkdir(join(artifactRoot, "malformed"), { recursive: true });
      await writeFile(join(artifactRoot, "malformed", "result.json"), "{");
      await mkdir(join(artifactRoot, "no-result"));

      await expect(discoverManagedEvidenceRuns(artifactRoot)).resolves.toEqual(
        [],
      );
      expect(await exists(join(artifactRoot, "malformed"))).toBe(true);
      expect(await exists(join(artifactRoot, "no-result"))).toBe(true);
    });

    it("plans the same bounded policy for completed controller run trees", async () => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-retention-"));
      temporaryDirectories.push(root);
      git(root, "init", "-b", "main");
      git(root, "config", "user.name", "Retention Test");
      git(root, "config", "user.email", "retention@example.invalid");
      await writeFile(join(root, "record.md"), "No cited controller runs.\n");
      git(root, "add", "record.md");
      git(root, "commit", "-m", "controller retention fixture");
      const artifactRoot = join(root, "artifacts", "orchestrator", "runs");
      await Promise.all([
        createControllerRun(
          artifactRoot,
          "old-controller-run",
          "2026-08-01T00:00:00.000Z",
        ),
        createControllerRun(
          artifactRoot,
          "recent-controller-run",
          "2026-08-02T00:00:00.000Z",
        ),
      ]);

      const report = await planManagedEvidenceRuns({
        repositoryRoot: root,
        artifactRoot,
        keepRecentRuns: 1,
        legacyRunIds: [],
        durableState: validState(root),
        safety: {
          candidateCommit: validState(root).repository.verifiedCommit,
          activeReconciliation: false,
          inventoryHasUnknownReferences: false,
        },
        now: "2026-08-02T01:00:00.000Z",
        manifestKind: "controller-run-summary",
      });

      expect(report.manifestKind).toBe("controller-run-summary");
      expect(report.plannedDeletions).toEqual([
        {
          id: "old-controller-run",
          path: join(artifactRoot, "old-controller-run"),
          finishedAt: "2026-08-01T00:00:00.000Z",
        },
      ]);
      expect(await exists(join(artifactRoot, "old-controller-run"))).toBe(true);
      expect(await exists(join(artifactRoot, "recent-controller-run"))).toBe(
        true,
      );
    });

    it("suspends planning when candidate, reconciliation, escalation, or inventory references are unresolved", async () => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-retention-"));
      temporaryDirectories.push(root);
      git(root, "init", "-b", "main");
      git(root, "config", "user.name", "Retention Test");
      git(root, "config", "user.email", "retention@example.invalid");
      await writeFile(
        join(root, "record.md"),
        "Retention suspension fixture.\n",
      );
      git(root, "add", "record.md");
      git(root, "commit", "-m", "retention suspension fixture");
      const artifactRoot = join(root, "artifacts");
      await createRun(artifactRoot, "would-delete", "2026-08-01T00:00:00.000Z");
      const base = validState(root);
      const state = {
        ...base,
        run: { ...base.run, status: "escalated" as const },
      };

      const report = await planManagedEvidenceRuns({
        repositoryRoot: root,
        artifactRoot,
        keepRecentRuns: 0,
        legacyRunIds: [],
        durableState: state,
        safety: {
          candidateCommit: "b".repeat(40),
          activeReconciliation: true,
          inventoryHasUnknownReferences: true,
        },
        now: "2026-08-02T00:00:00.000Z",
      });

      expect(report).toMatchObject({
        suspended: true,
        eligibleRunIds: ["would-delete"],
        plannedDeletions: [],
        suspensionReasons: [
          "candidate-controller-mismatch",
          "active-reconciliation",
          "unresolved-escalated-history",
          "unknown-reference",
        ],
      });
      expect(await exists(join(artifactRoot, "would-delete"))).toBe(true);
    });
  },
);

describe("approval-bound retention apply", { timeout: 60_000 }, () => {
  // Fixtures have no artifact inventory, which fail-closes planning with
  // unknown-reference. The planner seam keeps every other production rule
  // live while granting the fixture a current inventory.
  const trustedPlanner: typeof planManagedEvidenceRuns = async (input) =>
    planManagedEvidenceRuns({
      ...input,
      safety: { ...input.safety, inventoryHasUnknownReferences: false },
    });

  interface ApplyFixture {
    readonly root: string;
    readonly config: ReturnType<typeof validConfig>;
    readonly state: OrchestratorState;
    readonly store: StateStore;
    readonly plan: EvidenceRetentionPlan;
    readonly planPath: string;
    readonly sha256: string;
    readonly verificationRoot: string;
    readonly controllerRoot: string;
  }

  async function applyFixture(): Promise<ApplyFixture> {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-apply-"));
    temporaryDirectories.push(root);
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Retention Apply Test");
    git(root, "config", "user.email", "retention@example.invalid");
    await writeFile(join(root, ".gitignore"), "artifacts/\n");
    await writeFile(join(root, "record.md"), "Baseline evidence: cited-run\n");
    git(root, "add", ".gitignore", "record.md");
    git(root, "commit", "-m", "apply fixture base");

    const verificationRoot = join(root, "artifacts");
    const controllerRoot = join(root, "artifacts", "orchestrator", "runs");
    await Promise.all([
      createRun(verificationRoot, "cited-run", "2026-08-01T00:00:00.000Z"),
      createRun(verificationRoot, "prune-run", "2026-08-01T01:00:00.000Z"),
      createRun(verificationRoot, "recent-run", "2026-08-01T02:00:00.000Z"),
      createControllerRun(
        controllerRoot,
        "old-controller-run",
        "2026-08-01T00:00:00.000Z",
      ),
      createControllerRun(
        controllerRoot,
        "recent-controller-run",
        "2026-08-01T02:00:00.000Z",
      ),
    ]);

    const config = validConfig({
      evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 1 },
    });
    const base = validState(root);
    const state: OrchestratorState = {
      ...base,
      repository: {
        ...base.repository,
        verifiedCommit: git(root, "rev-parse", "HEAD"),
      },
    };

    const plan = await buildEvidenceRetentionPlan({
      repositoryRoot: root,
      config,
      state,
      now: "2026-08-02T00:00:00.000Z",
      planner: trustedPlanner,
    });
    const planPath = join(
      root,
      "artifacts",
      "orchestrator",
      "retention",
      "plans",
      "fixture",
      "plan.json",
    );
    await mkdir(join(planPath, ".."), { recursive: true });
    const planBytes = `${JSON.stringify(plan, null, 2)}\n`;
    await writeFile(planPath, planBytes, "utf8");
    const store = new StateStore(
      root,
      config.statePath,
      () => "2026-08-02T01:00:00.000Z",
    );
    await store.initialize(state);
    return {
      root,
      config,
      state,
      store,
      plan,
      planPath,
      sha256: createHash("sha256").update(planBytes).digest("hex"),
      verificationRoot,
      controllerRoot,
    };
  }

  it("deletes exactly the approved plan under a matching world", async () => {
    const fixture = await applyFixture();
    expect(fixture.plan.verificationRuns.plannedDeletions).toHaveLength(1);
    expect(fixture.plan.controllerRuns.plannedDeletions).toHaveLength(1);

    const result = await applyEvidenceRetentionPlan({
      repositoryRoot: fixture.root,
      planPath: fixture.planPath,
      expectedSha256: fixture.sha256,
      config: fixture.config,
      store: fixture.store,
      now: "2026-08-02T01:00:00.000Z",
      planner: trustedPlanner,
    });

    expect(result.deleted).toEqual([
      {
        root: "verification",
        id: "prune-run",
        path: join(fixture.verificationRoot, "prune-run"),
      },
      {
        root: "controller",
        id: "old-controller-run",
        path: join(fixture.controllerRoot, "old-controller-run"),
      },
    ]);
    expect(await exists(join(fixture.verificationRoot, "prune-run"))).toBe(
      false,
    );
    expect(
      await exists(join(fixture.controllerRoot, "old-controller-run")),
    ).toBe(false);
    for (const survivor of ["cited-run", "recent-run"])
      expect(await exists(join(fixture.verificationRoot, survivor))).toBe(true);
    expect(
      await exists(join(fixture.controllerRoot, "recent-controller-run")),
    ).toBe(true);

    const journal = (await readFile(result.journalPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(journal).toEqual([
      expect.objectContaining({ event: "deleting", runId: "prune-run" }),
      expect.objectContaining({ event: "deleted", runId: "prune-run" }),
      expect.objectContaining({
        event: "deleting",
        runId: "old-controller-run",
      }),
      expect.objectContaining({
        event: "deleted",
        runId: "old-controller-run",
      }),
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(result.applyDirectory, "apply-result.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ planSha256: fixture.sha256 });
    const [completedState, journalBefore] = await Promise.all([
      fixture.store.load(),
      readFile(result.journalPath),
    ]);
    const repeated = await applyEvidenceRetentionPlan({
      repositoryRoot: fixture.root,
      planPath: fixture.planPath,
      expectedSha256: fixture.sha256,
      config: fixture.config,
      store: fixture.store,
      now: "2026-08-02T02:00:00.000Z",
      planner: trustedPlanner,
    });
    expect(repeated).toEqual(result);
    expect((await fixture.store.load())?.revision).toBe(
      completedState?.revision,
    );
    expect(await readFile(result.journalPath)).toEqual(journalBefore);

    const resultPath = join(result.applyDirectory, "apply-result.json");
    await writeFile(
      resultPath,
      `${JSON.stringify({ ...result, deleted: [] }, null, 2)}\n`,
      "utf8",
    );
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T03:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/exact approved result or journal/);
    expect((await fixture.store.load())?.revision).toBe(
      completedState?.revision,
    );
  });

  async function expectNothingDeleted(fixture: ApplyFixture): Promise<void> {
    for (const survivor of ["cited-run", "prune-run", "recent-run"])
      expect(await exists(join(fixture.verificationRoot, survivor))).toBe(true);
    for (const survivor of ["old-controller-run", "recent-controller-run"])
      expect(await exists(join(fixture.controllerRoot, survivor))).toBe(true);
  }

  it("refuses a wrong approval hash", async () => {
    const fixture = await applyFixture();
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: "0".repeat(64),
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/hash mismatch/);
    await expectNothingDeleted(fixture);
  });

  it("refuses when the repository candidate advanced", async () => {
    const fixture = await applyFixture();
    await writeFile(join(fixture.root, "advance.md"), "advanced\n");
    git(fixture.root, "add", "advance.md");
    git(fixture.root, "commit", "-m", "advance the candidate");
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/candidate bytes advanced/);
    await expectNothingDeleted(fixture);
  });

  it("refuses when already-dirty tracked bytes change without changing status", async () => {
    const fixture = await applyFixture();
    await writeFile(
      join(fixture.root, "record.md"),
      "Baseline evidence: cited-run\nDirty version one.\n",
    );
    const plan = await buildEvidenceRetentionPlan({
      repositoryRoot: fixture.root,
      config: fixture.config,
      state: fixture.state,
      now: "2026-08-02T00:30:00.000Z",
      planner: trustedPlanner,
    });
    const bytes = `${JSON.stringify(plan, null, 2)}\n`;
    await writeFile(fixture.planPath, bytes, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(
      join(fixture.root, "record.md"),
      "Baseline evidence: cited-run\nDirty version two.\n",
    );
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/candidate bytes advanced/);
    await expectNothingDeleted(fixture);
  });

  it("rejects a hash-approved plan with a non-canonical deletion path", async () => {
    const fixture = await applyFixture();
    const malformed = structuredClone(fixture.plan) as unknown as {
      verificationRuns: {
        plannedDeletions: { id: string; path: string; finishedAt: string }[];
      };
    };
    malformed.verificationRuns.plannedDeletions[0]!.path = join(
      fixture.verificationRoot,
      "recent-run",
    );
    const bytes = `${JSON.stringify(malformed, null, 2)}\n`;
    await writeFile(fixture.planPath, bytes, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/canonical mode:plan 1\.2\.0/);
    await expectNothingDeleted(fixture);
  });

  it("refuses when a planned run became cited", async () => {
    const fixture = await applyFixture();
    await fixture.store.save({
      ...fixture.state,
      evidenceRetention: {
        ...fixture.state.evidenceRetention,
        legacyRunIds: ["prune-run"],
      },
    });
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(
      /exact target is no longer eligible.*verification:prune-run/,
    );
    await expectNothingDeleted(fixture);
  });

  it("refuses when a planned run became recent", async () => {
    const fixture = await applyFixture();
    await rm(join(fixture.verificationRoot, "recent-run"), {
      recursive: true,
      force: true,
    });
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(
      /exact target is no longer eligible.*verification:prune-run/,
    );
    expect(await exists(join(fixture.verificationRoot, "prune-run"))).toBe(
      true,
    );
  });

  it("refuses when a planned run is missing without a journal record", async () => {
    const fixture = await applyFixture();
    await rm(join(fixture.verificationRoot, "prune-run"), {
      recursive: true,
      force: true,
    });
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(
      /exact target is no longer eligible.*verification:prune-run/,
    );
    expect(
      await exists(join(fixture.controllerRoot, "old-controller-run")),
    ).toBe(true);
  });

  it("refuses when suspension appeared after approval", async () => {
    const fixture = await applyFixture();
    await fixture.store.save({
      ...fixture.state,
      run: {
        ...fixture.state.run,
        id: "escalated-run",
        status: "escalated",
        startedAt: "2026-08-01T23:00:00.000Z",
        finishedAt: "2026-08-02T00:00:00.000Z",
        stopReason: "Escalated history is unresolved.",
        artifactDirectory: join(fixture.controllerRoot, "escalated-run"),
      },
      nextAllowedAction: "stop",
    });
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/escalated controller history is unresolved/);
    await expectNothingDeleted(fixture);
  });

  it("refuses while a reconciliation is active or a run is live", async () => {
    const fixture = await applyFixture();
    const reconciliation = validReconciliationRecord();
    const reconciling: OrchestratorState = {
      ...fixture.state,
      controllerHistory: [
        {
          schemaVersion: "1.0.0",
          id: reconciliation.sourceArchiveId,
          rawSourceState: reconciliation.sourceState,
          sourceStateSchemaVersion: "1.2.0",
          sourceRevision: fixture.state.revision,
          priorVerifiedCommit: fixture.state.repository.verifiedCommit,
          priorRun: structuredClone(fixture.state.run) as unknown as Readonly<
            Record<string, unknown>
          >,
          priorQueue: fixture.state.queue,
          priorActiveMilestoneId: fixture.state.activeMilestoneId,
          priorNextAllowedAction: fixture.state.nextAllowedAction,
          archivedAt: "2026-08-04T00:00:00.000Z",
          reason: "external-integration-reconciliation",
        },
      ],
      reconciliation: { active: reconciliation, history: [] },
      nextAllowedAction: "reconcile",
    };
    await fixture.store.save(reconciling);
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/reconciliation is active/);

    const liveFixture = await applyFixture();
    await liveFixture.store.save({
      ...liveFixture.state,
      run: {
        ...liveFixture.state.run,
        id: "live-run",
        status: "running",
        startedAt: "2026-08-02T00:30:00.000Z",
        deadlineAt: "2026-08-03T00:30:00.000Z",
        artifactDirectory: join(liveFixture.controllerRoot, "live-run"),
      },
      nextAllowedAction: "plan",
    });
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: liveFixture.root,
        planPath: liveFixture.planPath,
        expectedSha256: liveFixture.sha256,
        config: liveFixture.config,
        store: liveFixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/run is active/);
    await expectNothingDeleted(fixture);
    await expectNothingDeleted(liveFixture);
  });

  it("refuses when the retention configuration changed", async () => {
    const fixture = await applyFixture();
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: validConfig({
          evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 2 },
        }),
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/configuration changed/);
    await expectNothingDeleted(fixture);
  });

  it("rejects a forged journal that has no canonical delete authorization", async () => {
    const fixture = await applyFixture();
    const applyDirectory = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "retention",
      "apply",
      fixture.sha256,
    );
    const journalPath = join(applyDirectory, "journal.jsonl");
    await mkdir(applyDirectory, { recursive: true });
    await writeFile(
      journalPath,
      `${JSON.stringify({
        event: "deleting",
        root: "verification",
        runId: "prune-run",
        path: join(fixture.verificationRoot, "prune-run"),
        at: "2026-08-02T00:30:00.000Z",
      })}\n`,
      "utf8",
    );
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/journal.*conflict/i);
    await expectNothingDeleted(fixture);
    const blocked = await fixture.store.load();
    expect(blocked?.pendingOperation).toMatchObject({
      kind: "retention-apply",
      phase: "blocked",
      diagnostic: { classification: "journal-conflict" },
    });
  });

  it("blocks and preserves a conflicting result before the remaining deletion", async () => {
    const fixture = await applyFixture();
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
        hooks: {
          fault: (point) => {
            if (point === "after-deletion-finished-state")
              throw new Error("simulated result-boundary loss");
          },
        },
      }),
    ).rejects.toThrow(/simulated result-boundary loss/);
    const interrupted = await fixture.store.load();
    const operation = interrupted?.pendingOperation;
    if (!operation || operation.kind !== "retention-apply")
      throw new Error("Expected a pending retention operation.");
    await writeFile(operation.resultPath, "{}\n", "utf8");

    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T02:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/result.*conflict/i);
    expect(
      await exists(join(fixture.controllerRoot, "old-controller-run")),
    ).toBe(true);
    expect(await readFile(operation.resultPath, "utf8")).toBe("{}\n");
    expect((await fixture.store.load())?.pendingOperation).toMatchObject({
      kind: "retention-apply",
      phase: "blocked",
      completedDeletionCount: 1,
      diagnostic: { classification: "result-conflict" },
    });
  });

  it("resumes canonical delete-started state through a torn journal suffix", async () => {
    const fixture = await applyFixture();
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        store: fixture.store,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
        hooks: {
          fault: (point) => {
            if (point === "after-journal-deleting")
              throw new Error("simulated hard loss");
          },
        },
      }),
    ).rejects.toThrow(/simulated hard loss/);
    const interrupted = await fixture.store.load();
    const operation = interrupted?.pendingOperation;
    expect(operation).toMatchObject({
      kind: "retention-apply",
      phase: "deletion-started",
      completedDeletionCount: 0,
    });
    if (!operation || operation.kind !== "retention-apply")
      throw new Error("Expected a pending retention operation.");
    const deletion = operation.deletions[0]!;
    const tornLine = `${JSON.stringify({
      schemaVersion: "1.0.0",
      operationId: operation.id,
      planSha256: operation.planSha256,
      event: "deleted",
      ordinal: deletion.ordinal,
      root: deletion.root,
      runId: deletion.runId,
      path: deletion.path,
      at: operation.completionAt,
    })}\n`;
    await appendFile(operation.journalPath, tornLine.slice(0, 23), "utf8");

    const result = await applyEvidenceRetentionPlan({
      repositoryRoot: fixture.root,
      planPath: fixture.planPath,
      expectedSha256: fixture.sha256,
      config: fixture.config,
      store: fixture.store,
      now: "2026-08-02T02:00:00.000Z",
      planner: trustedPlanner,
    });
    expect(result.deleted.map((entry) => entry.id).sort()).toEqual([
      "old-controller-run",
      "prune-run",
    ]);
    const journal = (await readFile(result.journalPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(journal).toHaveLength(4);
    expect(journal.map((entry) => entry["event"])).toEqual([
      "deleting",
      "deleted",
      "deleting",
      "deleted",
    ]);
    expect((await fixture.store.load())?.pendingOperation).toBeNull();
  });
});
