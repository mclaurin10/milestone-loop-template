import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { validConfig } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("orchestrator configuration migration", () => {
  it.each(["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"])(
    "migrates %s to 1.5.0 without changing policy facts",
    async (schemaVersion) => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-config-"));
      temporaryDirectories.push(root);
      const path = join(root, "legacy-config.json");
      const current = validConfig();
      const legacyLimits = { ...current.limits } as Record<string, unknown>;
      // Configs before 1.5.0 never carried the supervision limits.
      delete legacyLimits["commandOutputLimitBytes"];
      delete legacyLimits["commandKillGraceMs"];
      const legacy = {
        ...current,
        schemaVersion,
        limits: legacyLimits,
        protectedPaths: [
          "PROJECT_GOAL.md",
          "evals/ACCEPTANCE.md",
          "evals/acceptance-manifest.json",
          "evals/HIDDEN_VALIDATION_PROTOCOL.md",
          "evals/immutable-contract-lock.json",
        ],
      } as Record<string, unknown>;
      if (schemaVersion === "1.0.0") delete legacy["evidenceRetention"];
      delete legacy["project"];
      await writeFile(path, `${JSON.stringify(legacy, null, 2)}\n`);

      const loaded = await loadConfig(root, path);
      expect(loaded).toEqual({
        ...current,
        schemaVersion: "1.5.0",
        evidenceRetention: current.evidenceRetention,
        limits: {
          ...current.limits,
          commandOutputLimitBytes: 67_108_864,
          commandKillGraceMs: 5_000,
        },
        project: {
          name: "Example Project",
          authorityFile: "PROJECT_GOAL.md",
          verticalSpine: {
            minimumCategories: 4,
            categoryPatterns: [],
          },
        },
        protectedPaths: buildCanonicalProtectedSet(current, [
          "legacy-config.json",
        ]),
      });
    },
  );

  it("rejects a current-version config that drops a controller trust root", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-config-"));
    temporaryDirectories.push(root);
    const path = join(root, "stripped-config.json");
    const stripped = {
      ...validConfig(),
      protectedPaths: validConfig().protectedPaths.filter(
        (entry) => entry !== "scripts/verify.mjs",
      ),
    };
    await writeFile(path, `${JSON.stringify(stripped, null, 2)}\n`);
    await expect(loadConfig(root, path)).rejects.toThrow(
      /omits mandatory frozen authority/,
    );
  });
});
