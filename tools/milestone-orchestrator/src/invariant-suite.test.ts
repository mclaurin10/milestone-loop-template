import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadInvariantSuiteRegistry, loadSlowSuiteRegistry } from "./config.js";
import {
  buildUnitTestPartition,
  validateInvariantRegistryOwnership,
} from "./invariant-suite.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("always-run invariant registry", () => {
  it("pins every commissioned invariant identity and its exact owner", async () => {
    const tracked = await loadInvariantSuiteRegistry(repositoryRoot);
    await validateInvariantRegistryOwnership(repositoryRoot, tracked.value);

    expect(tracked.value.serial).toBe(true);
    expect(tracked.value.warmRuntimeTargetMs).toBe(60_000);
    expect(tracked.value.entries.map((entry) => entry.id)).toEqual([
      "protected-integrity",
      "orchestrator-schema-integrity",
      "orchestrator-policy-integrity",
      "fail-closed-evidence",
    ]);
    expect(
      tracked.value.entries.find(
        (entry) => entry.id === "protected-integrity",
      )?.ownerPaths,
    ).toEqual(["PROJECT_GOAL.md", "evals/", "scripts/verify.mjs"]);
    expect(
      tracked.value.entries.find(
        (entry) => entry.id === "fail-closed-evidence",
      )?.ownerPaths,
    ).toEqual([
      "tools/milestone-orchestrator/src/verifier.ts",
      "tools/evidence.mjs",
    ]);

    const bytes = await readFile(tracked.absolutePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      tracked.sha256,
    );
  });
});

describe("unit-suite partition", () => {
  it("is a complete disjoint partition of full Vitest discovery", async () => {
    const [partition, registry] = await Promise.all([
      buildUnitTestPartition(repositoryRoot),
      loadSlowSuiteRegistry(repositoryRoot),
    ]);
    expect(partition.migrationFiles).toEqual([...registry.value.files].sort());
    expect(
      partition.fastFiles.filter((path) =>
        partition.migrationFiles.includes(path),
      ),
    ).toEqual([]);
    expect(
      [...partition.fastFiles, ...partition.migrationFiles].sort(),
    ).toEqual(partition.discoveredFiles);
    expect(new Set(partition.discoveredFiles).size).toBe(
      partition.discoveredFiles.length,
    );
  });
});
