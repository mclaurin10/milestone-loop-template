import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  ArtifactClassification,
  ArtifactInventory,
  ArtifactInventoryEntry,
} from "./artifact-inventory.js";
import {
  assertRetentionDryRun,
  createRetentionDryRun,
} from "./retention-plan.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function entry(
  identity: string,
  classification: ArtifactClassification,
  disposition: ArtifactInventoryEntry["pathSafety"]["disposition"] = "contained",
): ArtifactInventoryEntry {
  return {
    identity,
    stageId: "test",
    commandId: "test",
    candidate: null,
    status: "PASS",
    path: `artifacts/${identity}`,
    manifest: {
      kind: "verification-result",
      version: "2.0.0",
      path: `artifacts/${identity}/result.json`,
    },
    receipt: null,
    fileCount: 1,
    totalBytes: 10,
    durableTrackedCitations: [],
    durableControllerStateReferences: [],
    activeReconciliationReference: null,
    classification,
    pathSafety: {
      lexicalContained: true,
      realpathContained: true,
      artifactRootSymlink: false,
      entrySymlink: disposition !== "contained",
      disposition,
      symlinkPaths: disposition === "contained" ? [] : ["unsafe-link"],
    },
  };
}

function inventory(
  entries: readonly ArtifactInventoryEntry[],
  overrides: Partial<ArtifactInventory> = {},
): ArtifactInventory {
  const classificationCounts = Object.fromEntries(
    [
      "active-state",
      "cited-tracked",
      "exact-accepted",
      "failed-diagnostic-cited",
      "recent-managed",
      "representative-failure",
      "legacy-preserved-workspace",
      "legacy-unmanaged-manual",
      "eligible-future-dry-run",
      "unknown-protected",
    ].map((classification) => [
      classification,
      entries.filter((item) => item.classification === classification).length,
    ]),
  ) as ArtifactInventory["summary"]["classificationCounts"];
  return {
    schemaVersion: "1.0.0",
    inventoryId: "retention-fixture",
    artifactRoot: "artifacts",
    candidate: {
      gitCommit: "b".repeat(40),
      gitTree: "c".repeat(40),
      workingTreeDirty: false,
    },
    controller: {
      statePath: "artifacts/orchestrator/state/state.json",
      stateSha256: "d".repeat(64),
      verifiedCommit: "a".repeat(40),
      runStatus: "escalated",
      activeMilestoneId: "unresolved-milestone",
    },
    activeReconciliation: {
      id: "reconcile-one",
      path: "artifacts/orchestrator/reconciliation/reconcile-one.json",
      status: "pending",
    },
    entries,
    summary: {
      entryCount: entries.length,
      fileCount: entries.length,
      totalBytes: entries.length * 10,
      classificationCounts,
      legacyWorkspaceCount: classificationCounts["legacy-preserved-workspace"],
      unknownProtectedCount: classificationCounts["unknown-protected"],
    },
    createdAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("dry-run-only artifact retention planning", () => {
  it("reports every suspension condition and never authorizes an action", () => {
    const source = inventory([
      entry("eligible", "eligible-future-dry-run"),
      entry("unknown", "unknown-protected", "contains-symlink"),
    ]);

    const report = createRetentionDryRun(source, "2026-08-04T01:00:00.000Z");

    expect(report).toMatchObject({
      mode: "dry-run-only",
      applySupported: false,
      historicalManualDeletionDeferred: true,
      suspended: true,
      suspensionReasons: [
        "candidate-controller-mismatch",
        "active-reconciliation",
        "unresolved-escalated-history",
        "unknown-reference",
        "path-safety-defect",
      ],
      proposedActions: [
        {
          identity: "eligible",
          action: "eligible-future-managed-deletion",
          authorized: false,
        },
      ],
      preservedEntryCount: 2,
    });
    expect(() => assertRetentionDryRun(report)).not.toThrow();
    expect(createRetentionDryRun(source, report.generatedAt)).toEqual(report);
  });

  it("does not mutate even safely eligible evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "ski-retention-plan-"));
    temporaryDirectories.push(root);
    const evidence = join(root, "artifacts", "eligible", "result.json");
    await mkdir(join(root, "artifacts", "eligible"), { recursive: true });
    await writeFile(evidence, "preserve me\n");
    const eligible = entry("eligible", "eligible-future-dry-run");
    const source = inventory([eligible], {
      candidate: {
        gitCommit: "a".repeat(40),
        gitTree: "c".repeat(40),
        workingTreeDirty: false,
      },
      controller: {
        statePath: "artifacts/orchestrator/state/state.json",
        stateSha256: "d".repeat(64),
        verifiedCommit: "a".repeat(40),
        runStatus: "idle",
        activeMilestoneId: null,
      },
      activeReconciliation: null,
    });

    const before = await readFile(evidence, "utf8");
    const report = createRetentionDryRun(source, "2026-08-04T02:00:00.000Z");
    const after = await readFile(evidence, "utf8");

    expect(report).toMatchObject({
      suspended: false,
      suspensionReasons: [],
      proposedActions: [{ authorized: false }],
    });
    expect(after).toBe(before);
  });
});
