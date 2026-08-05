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
  applyEvidenceRetentionPlan,
  buildEvidenceRetentionPlan,
  discoverManagedEvidenceRuns,
  planManagedEvidenceRuns,
  type EvidenceRetentionPlan,
} from "./evidence-retention.js";
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
    await writeFile(join(root, "record.md"), "Baseline evidence: cited-run\n");
    git(root, "add", "record.md");
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
    const planPath = join(root, "retention-plan.json");
    const planBytes = `${JSON.stringify(plan, null, 2)}\n`;
    await writeFile(planPath, planBytes, "utf8");
    return {
      root,
      config,
      state,
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
      state: fixture.state,
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
        state: fixture.state,
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
        state: fixture.state,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/candidate advanced/);
    await expectNothingDeleted(fixture);
  });

  it("refuses when a planned run became cited", async () => {
    const fixture = await applyFixture();
    const cited: OrchestratorState = {
      ...fixture.state,
      run: { ...fixture.state.run, id: "prune-run" },
    };
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        state: cited,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/run-became-cited: verification:prune-run/);
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
        state: fixture.state,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/run-became-recent: verification:prune-run/);
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
        state: fixture.state,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/run-missing: verification:prune-run/);
    expect(
      await exists(join(fixture.controllerRoot, "old-controller-run")),
    ).toBe(true);
  });

  it("refuses when suspension appeared after approval", async () => {
    const fixture = await applyFixture();
    const escalated: OrchestratorState = {
      ...fixture.state,
      run: { ...fixture.state.run, status: "escalated" },
    };
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        state: escalated,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/suspension-appeared.*unresolved-escalated-history/);
    await expectNothingDeleted(fixture);
  });

  it("refuses while a reconciliation is active or a run is live", async () => {
    const fixture = await applyFixture();
    const reconciling: OrchestratorState = {
      ...fixture.state,
      reconciliation: { active: validReconciliationRecord(), history: [] },
    };
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        state: reconciling,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/reconciliation is active/);

    const running: OrchestratorState = {
      ...fixture.state,
      run: { ...fixture.state.run, status: "running" },
    };
    await expect(
      applyEvidenceRetentionPlan({
        repositoryRoot: fixture.root,
        planPath: fixture.planPath,
        expectedSha256: fixture.sha256,
        config: fixture.config,
        state: running,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/run is active/);
    await expectNothingDeleted(fixture);
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
        state: fixture.state,
        now: "2026-08-02T01:00:00.000Z",
        planner: trustedPlanner,
      }),
    ).rejects.toThrow(/config-changed/);
    await expectNothingDeleted(fixture);
  });

  it("resumes an interrupted apply idempotently and tolerates a torn journal tail", async () => {
    const fixture = await applyFixture();
    const applyDirectory = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "retention",
      "apply",
      fixture.sha256.slice(0, 16),
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
    await rm(join(fixture.verificationRoot, "prune-run"), {
      recursive: true,
      force: true,
    });

    const first = await applyEvidenceRetentionPlan({
      repositoryRoot: fixture.root,
      planPath: fixture.planPath,
      expectedSha256: fixture.sha256,
      config: fixture.config,
      state: fixture.state,
      now: "2026-08-02T01:00:00.000Z",
      planner: trustedPlanner,
    });
    expect(first.deleted.map((entry) => entry.id).sort()).toEqual([
      "old-controller-run",
      "prune-run",
    ]);
    expect(
      await exists(join(fixture.controllerRoot, "old-controller-run")),
    ).toBe(false);

    await appendFile(journalPath, '{"event":"del', "utf8");
    const second = await applyEvidenceRetentionPlan({
      repositoryRoot: fixture.root,
      planPath: fixture.planPath,
      expectedSha256: fixture.sha256,
      config: fixture.config,
      state: fixture.state,
      now: "2026-08-02T02:00:00.000Z",
      planner: trustedPlanner,
    });
    expect(second.deleted).toEqual([]);
    expect(second.skippedJournaledRunIds).toEqual([
      "controller:old-controller-run",
      "verification:prune-run",
    ]);
  });
});
