import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadInvariantSuiteRegistry, loadSlowSuiteRegistry } from "./config.js";
import {
  buildUnitTestPartition,
  commandFromArgv,
  invariantEntryReceipt,
  validateInvariantRegistryOwnership,
} from "./invariant-suite.js";
import { validateInvariantSuiteRegistry } from "./schema.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("always-run invariant registry", () => {
  it("pins every commissioned invariant identity and its exact owner", async () => {
    const tracked = await loadInvariantSuiteRegistry(repositoryRoot);
    await validateInvariantRegistryOwnership(repositoryRoot, tracked.value);

    expect(tracked.value.serial).toBe(true);
    expect(tracked.value.warmRuntimeTargetMs).toBe(60_000);
    expect(tracked.value.entries.map((entry) => entry.id)).toEqual([
      "protected-integrity",
      "test-ownership",
      "orchestrator-schema-integrity",
      "orchestrator-policy-integrity",
      "fail-closed-evidence",
    ]);
    expect(
      tracked.value.entries.find((entry) => entry.id === "protected-integrity")
        ?.ownerPaths,
    ).toEqual([
      "PROJECT_GOAL.md",
      "evals/",
      "scripts/verify.mjs",
      "tools/milestone-orchestrator/src/contract-integrity.ts",
    ]);
    expect(
      tracked.value.entries.find((entry) => entry.id === "protected-integrity"),
    ).toMatchObject({
      argv: [
        "node",
        "node_modules/tsx/dist/cli.mjs",
        "tools/milestone-orchestrator/src/verification-cli.ts",
        "contract-integrity",
      ],
      expectedArtifactKinds: ["contract-integrity-report"],
    });
    expect(
      tracked.value.entries.find((entry) => entry.id === "fail-closed-evidence")
        ?.ownerPaths,
    ).toEqual([
      "tools/milestone-orchestrator/src/verifier.ts",
      "tools/evidence.mjs",
    ]);

    const bytes = await readFile(tracked.absolutePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      tracked.sha256,
    );
  });

  it("declares nonempty receipt kinds for every entry and rejects empty ones", async () => {
    const tracked = await loadInvariantSuiteRegistry(repositoryRoot);
    for (const entry of tracked.value.entries)
      expect(entry.expectedArtifactKinds.length).toBeGreaterThan(0);

    const raw = JSON.parse(
      await readFile(tracked.absolutePath, "utf8"),
    ) as Record<string, unknown> & {
      entries: { expectedArtifactKinds: string[] }[];
    };
    expect(validateInvariantSuiteRegistry(raw)).toMatchObject({ valid: true });
    const first = raw.entries[0];
    if (!first) throw new Error("Registry fixture lost its entries.");
    first.expectedArtifactKinds = [];
    expect(validateInvariantSuiteRegistry(raw)).toMatchObject({
      valid: false,
    });
  });
});

describe("invariant receipt wrappers", () => {
  const temporaryDirectories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  function runWrapper(
    args: readonly string[],
    artifactDirectory: string,
  ): SpawnSyncReturns<string> {
    return spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "tools/run-tool-evidence.mjs", ...args],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...process.env,
          LOOP_VERIFY_STAGE_ID: "invariant-suite",
          LOOP_VERIFY_COMMAND_ID: "wrapper-fixture",
          LOOP_VERIFY_COMMAND_ARTIFACT_DIR: artifactDirectory,
          LOOP_TELEMETRY_PARENT_MANAGED: "1",
        },
      },
    );
  }

  it("routes vitest and focused-verify invariants through receipt wrappers", () => {
    expect(
      commandFromArgv("protected-integrity", [
        "node",
        "node_modules/tsx/dist/cli.mjs",
        "tools/milestone-orchestrator/src/verification-cli.ts",
        "contract-integrity",
      ]),
    ).toEqual({
      id: "protected-integrity",
      executable: "node",
      args: [
        "node_modules/tsx/dist/cli.mjs",
        "tools/milestone-orchestrator/src/verification-cli.ts",
        "contract-integrity",
      ],
      parser: "exit-code",
    });
    expect(
      commandFromArgv("schema-invariant", [
        "pnpm",
        "exec",
        "vitest",
        "run",
        "tools/milestone-orchestrator/src/schema.test.ts",
        "--fileParallelism=false",
      ]),
    ).toEqual({
      id: "schema-invariant",
      executable: "node",
      args: [
        "node_modules/tsx/dist/cli.mjs",
        "tools/run-tool-evidence.mjs",
        "invariant-vitest",
        "tools/milestone-orchestrator/src/schema.test.ts",
        "--fileParallelism=false",
      ],
      parser: "exit-code",
    });
    expect(
      commandFromArgv("protected-integrity", [
        "pnpm",
        "verify",
        "--",
        "--stage",
        "contract-integrity",
      ]),
    ).toEqual({
      id: "protected-integrity",
      executable: "node",
      args: [
        "node_modules/tsx/dist/cli.mjs",
        "tools/run-tool-evidence.mjs",
        "focused-verify",
        "--stage",
        "contract-integrity",
      ],
      parser: "exit-code",
    });
    expect(
      commandFromArgv("typecheck-invariant", ["pnpm", "typecheck"]),
    ).toMatchObject({ executable: "node" });
    expect(
      commandFromArgv("passthrough", ["pnpm", "verify:bootstrap:simulation"]),
    ).toEqual({
      id: "passthrough",
      executable: "pnpm",
      args: ["verify:bootstrap:simulation"],
      parser: "exit-code",
    });
    expect(() =>
      commandFromArgv("bad-vitest", ["pnpm", "exec", "vitest", "watch"]),
    ).toThrow(/pnpm exec vitest run/);
    expect(() =>
      commandFromArgv("bad-verify", ["pnpm", "verify", "--", "--profile"]),
    ).toThrow(/--stage/);
    expect(() => commandFromArgv("unsafe", ["npx", "vitest"])).toThrow(
      /unsafe or incomplete argv/,
    );
  });

  it("refuses invariant-vitest runs whose target files are invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wrapper-fixture-"));
    temporaryDirectories.push(directory);
    const missing = runWrapper(
      ["invariant-vitest", "tools/does-not-exist.test.ts"],
      directory,
    );
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("does not exist");
    expect(existsSync(join(directory, "result.json"))).toBe(false);

    const wrongSuffix = runWrapper(
      ["invariant-vitest", "tools/evidence.mjs"],
      directory,
    );
    expect(wrongSuffix.status).not.toBe(0);
    expect(wrongSuffix.stderr).toContain(".test.ts");
    expect(existsSync(join(directory, "result.json"))).toBe(false);
  }, 30_000);

  it("refuses invariant-vitest escapes and unsanctioned flags", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wrapper-fixture-"));
    temporaryDirectories.push(directory);
    const escape = runWrapper(
      ["invariant-vitest", "../outside.test.ts"],
      directory,
    );
    expect(escape.status).not.toBe(0);
    expect(escape.stderr).toContain("escapes the repository");
    expect(existsSync(join(directory, "result.json"))).toBe(false);

    const flag = runWrapper(
      [
        "invariant-vitest",
        "--config=rogue.config.ts",
        "tools/milestone-orchestrator/src/schema.test.ts",
      ],
      directory,
    );
    expect(flag.status).not.toBe(0);
    expect(flag.stderr).toContain("unsanctioned vitest flags");
    expect(existsSync(join(directory, "result.json"))).toBe(false);
  }, 30_000);

  it("refuses focused-verify runs without an exact --stage argument", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wrapper-fixture-"));
    temporaryDirectories.push(directory);
    const result = runWrapper(["focused-verify", "--profile", "x"], directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--stage <id>");
    expect(existsSync(join(directory, "result.json"))).toBe(false);
  }, 30_000);
});

describe("invariant receipt classification", () => {
  const temporaryDirectories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function evidenceDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "invariant-receipt-"));
    temporaryDirectories.push(directory);
    return directory;
  }

  it("keeps a failing invariant a product failure, not a receipt violation", async () => {
    expect(
      await invariantEntryReceipt({
        evidenceDirectory: await evidenceDirectory(),
        entryId: "fixture-invariant",
        expectedArtifactKinds: ["orchestrator-vitest-report"],
        commandStatus: "FAIL",
      }),
    ).toEqual({
      receipt: null,
      receiptAbsenceReason:
        "The command did not pass; failing commands retain no receipt.",
      receiptFailure: false,
    });
  });

  it("still fails a passing invariant that wrote no receipt", async () => {
    expect(
      await invariantEntryReceipt({
        evidenceDirectory: await evidenceDirectory(),
        entryId: "fixture-invariant",
        expectedArtifactKinds: ["orchestrator-vitest-report"],
        commandStatus: "PASS",
      }),
    ).toEqual({
      receipt: null,
      receiptAbsenceReason:
        "Invariant fixture-invariant did not write its required command-owned receipt.",
      receiptFailure: true,
    });
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
