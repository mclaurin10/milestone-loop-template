import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverManagedEvidenceRuns,
  pruneManagedEvidenceRuns,
} from "./evidence-retention.js";
import { validState } from "../test/fixtures.js";

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

describe("verification evidence retention", () => {
  it("keeps recent, legacy, durable-state, and committed-record run IDs", async () => {
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

    const report = await pruneManagedEvidenceRuns({
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

    expect(report.recentRunIds).toEqual(["recent-run"]);
    expect(report.citedRunIds).toEqual(["cited-run", "durable-run"]);
    expect(report.deletedRunIds).toEqual(["prune-run"]);
    for (const id of [
      "legacy-run",
      "cited-run",
      "durable-run",
      "recent-run",
      "manual",
    ])
      expect(await exists(join(artifactRoot, id))).toBe(true);
    expect(await exists(join(artifactRoot, "prune-run"))).toBe(false);
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

  it("applies the same bounded policy to completed controller run trees", async () => {
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

    const report = await pruneManagedEvidenceRuns({
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
    expect(report.deletedRunIds).toEqual(["old-controller-run"]);
    expect(await exists(join(artifactRoot, "old-controller-run"))).toBe(false);
    expect(await exists(join(artifactRoot, "recent-controller-run"))).toBe(
      true,
    );
  });

  it("suspends deletion when candidate, reconciliation, escalation, or inventory references are unresolved", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-retention-"));
    temporaryDirectories.push(root);
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Retention Test");
    git(root, "config", "user.email", "retention@example.invalid");
    await writeFile(join(root, "record.md"), "Retention suspension fixture.\n");
    git(root, "add", "record.md");
    git(root, "commit", "-m", "retention suspension fixture");
    const artifactRoot = join(root, "artifacts");
    await createRun(artifactRoot, "would-delete", "2026-08-01T00:00:00.000Z");
    const base = validState(root);
    const state = {
      ...base,
      run: { ...base.run, status: "escalated" as const },
    };

    const report = await pruneManagedEvidenceRuns({
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
      deletedRunIds: [],
      suspensionReasons: [
        "candidate-controller-mismatch",
        "active-reconciliation",
        "unresolved-escalated-history",
        "unknown-reference",
      ],
    });
    expect(await exists(join(artifactRoot, "would-delete"))).toBe(true);
  });
});
