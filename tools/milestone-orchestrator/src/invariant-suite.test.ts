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
      "architecture-ownership",
      "canonical-encoding",
      "fixed-tick-action-neutrality",
      "save-replay-smoke-integrity",
      "standard-origin-neutrality",
      "node-worker-technical-parity",
      "public-protocol-compatibility",
      "fail-closed-evidence",
    ]);
    expect(
      tracked.value.entries.find(
        (entry) => entry.id === "standard-origin-neutrality",
      ),
    ).toMatchObject({
      testFile: "packages/simulation/src/authorization.test.ts",
      testTitle:
        "is chunk deterministic and gives human, bot, and replay callers identical economics",
    });
    expect(
      tracked.value.entries.find(
        (entry) => entry.id === "node-worker-technical-parity",
      )?.ownerPaths,
    ).toEqual([
      "apps/web/src/worker/simulation.worker.ts",
      "apps/headless/src/smoke.ts",
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
