import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { validConfig } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("orchestrator configuration migration", () => {
  it.each(["1.0.0", "1.1.0", "1.2.0"])(
    "migrates %s to 1.3.0 without changing policy facts",
    async (schemaVersion) => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-config-"));
      temporaryDirectories.push(root);
      const path = join(root, "legacy-config.json");
      const current = validConfig();
      const legacy = {
        ...current,
        schemaVersion,
      } as Record<string, unknown>;
      if (schemaVersion === "1.0.0") delete legacy["evidenceRetention"];
      delete legacy["project"];
      await writeFile(path, `${JSON.stringify(legacy, null, 2)}\n`);

      const loaded = await loadConfig(root, path);
      expect(loaded).toEqual({
        ...current,
        schemaVersion: "1.3.0",
        evidenceRetention: current.evidenceRetention,
        project: {
          name: "Example Project",
          authorityFile: "PROJECT_GOAL.md",
          verticalSpine: {
            minimumCategories: 4,
            categoryPatterns: [],
          },
        },
        protectedPaths: [...current.protectedPaths, "legacy-config.json"],
      });
    },
  );
});
