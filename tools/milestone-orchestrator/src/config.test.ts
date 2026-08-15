import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  HISTORICAL_VERIFICATION_MANIFEST_PATH,
  loadConfig,
} from "./config.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { validConfig } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("orchestrator configuration migration", () => {
  it.each(["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"])(
    "migrates %s to 1.6.0 without granting unsafe execution",
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
      delete legacy["candidateExecution"];
      await writeFile(path, `${JSON.stringify(legacy, null, 2)}\n`);

      const loaded = await loadConfig(root, path);
      expect(loaded).toEqual({
        ...current,
        schemaVersion: "1.6.0",
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
        candidateExecution: {
          mode: "trusted-container",
          trustedContainer: {
            runtime: "docker",
            imageDigest: null,
            mountPolicyVersion: "oci-mount-policy-v1",
            resourceLimitProfile: "oci-resource-limits-v1",
            networkDisposition: "denied",
          },
        },
        protectedPaths: buildCanonicalProtectedSet(current, [
          "legacy-config.json",
        ]),
      });
    },
  );

  it("selects trusted-container by default and requires an explicit current config for unsafe local diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-config-"));
    temporaryDirectories.push(root);
    const trustedPath = join(root, "trusted-config.json");
    const unsafePath = join(root, "unsafe-config.json");
    await writeFile(trustedPath, `${JSON.stringify(validConfig(), null, 2)}\n`);
    await writeFile(
      unsafePath,
      `${JSON.stringify(
        validConfig({
          candidateExecution: {
            ...validConfig().candidateExecution,
            mode: "unsafe-local-diagnostic",
          },
        }),
        null,
        2,
      )}\n`,
    );
    expect((await loadConfig(root, trustedPath)).candidateExecution.mode).toBe(
      "trusted-container",
    );
    expect((await loadConfig(root, unsafePath)).candidateExecution.mode).toBe(
      "unsafe-local-diagnostic",
    );
  });

  it("rejects unknown root fields in the strict current config", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-config-"));
    temporaryDirectories.push(root);
    const path = join(root, "unknown-config.json");
    await writeFile(
      path,
      `${JSON.stringify({ ...validConfig(), candidateOverride: true }, null, 2)}\n`,
    );
    await expect(loadConfig(root, path)).rejects.toThrow(
      /unknown or missing root fields/,
    );
  });

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

  it("protects active and retained historical manifest paths independently", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-config-"));
    temporaryDirectories.push(root);
    const path = join(root, "current-config.json");
    await writeFile(path, `${JSON.stringify(validConfig(), null, 2)}\n`);
    for (const manifestPath of [
      DEFAULT_VERIFICATION_MANIFEST_PATH,
      HISTORICAL_VERIFICATION_MANIFEST_PATH,
    ]) {
      const absolute = join(root, ...manifestPath.split("/"));
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "{}\n", "utf8");
    }
    const config = await loadConfig(root, path);
    expect(config.protectedPaths).toEqual(
      expect.arrayContaining([
        DEFAULT_VERIFICATION_MANIFEST_PATH,
        HISTORICAL_VERIFICATION_MANIFEST_PATH,
      ]),
    );
  });
});
