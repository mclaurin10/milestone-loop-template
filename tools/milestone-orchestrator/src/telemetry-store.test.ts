import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertTelemetryEvent } from "./telemetry-contracts.js";
import { TelemetryStore } from "./telemetry-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function temporaryRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-telemetry-"));
  temporaryDirectories.push(root);
  return root;
}

function clock(): { readonly now: () => Date; readonly hrtime: () => bigint } {
  let wall = Date.parse("2026-08-03T00:00:00.000Z");
  let monotonic = 1_000_000n;
  return {
    now: () => new Date((wall += 10)),
    hrtime: () => (monotonic += 100n),
  };
}

describe("machine-owned telemetry store", () => {
  it("writes an atomic ordered hash chain and preserves measured zeros", async () => {
    const repositoryRoot = await temporaryRepository();
    const timing = clock();
    const directory = join(
      repositoryRoot,
      "artifacts",
      "loop-telemetry",
      "direct",
      "direct-test",
    );
    const store = await TelemetryStore.open({
      repositoryRoot,
      directory,
      runId: "direct-test",
      source: "direct",
      ...timing,
    });
    await store.recordCommand({
      commandId: "unit",
      argv: ["pnpm", "test", "--token", "do-not-store-this"],
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:00.010Z",
      durationNanoseconds: "0",
      status: "PASS",
      exitCode: 0,
      signal: null,
      tests: {
        suites: { total: 0, passed: 0, failed: 0, skipped: 0 },
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      },
      artifacts: {
        fileCount: 0,
        totalBytes: 0,
        manifestReferences: [],
        receiptReferences: [],
      },
    });
    const summary = await store.complete("PASS");
    expect(summary).toMatchObject({
      status: "PASS",
      commandCount: 1,
      testSuites: 0,
      tests: 0,
      artifactFiles: 0,
      artifactBytes: 0,
    });
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    ) as {
      status: string;
      eventCount: number;
      chainHeadSha256: string;
      events: Array<{
        path: string;
        sha256: string;
        previousEventSha256: string | null;
      }>;
    };
    expect(manifest.status).toBe("completed");
    expect(manifest.eventCount).toBe(2);
    let previous: string | null = null;
    for (const entry of manifest.events) {
      expect(entry.previousEventSha256).toBe(previous);
      const contents = await readFile(join(directory, entry.path));
      const actual = createHash("sha256").update(contents).digest("hex");
      expect(entry.sha256).toBe(actual);
      previous = actual;
      expect(
        assertTelemetryEvent(JSON.parse(contents.toString("utf8")) as unknown),
      ).toBeTruthy();
    }
    expect(manifest.chainHeadSha256).toBe(previous);
    const commandEvent = await readFile(
      join(directory, "events", "000001.json"),
      "utf8",
    );
    expect(commandEvent).not.toContain("do-not-store-this");
    expect(commandEvent).toContain("[REDACTED]");
    expect(await readdir(join(directory, "events"))).toEqual([
      "000001.json",
      "000002.json",
    ]);
  });

  it("recovers an unfinished phase without deriving a wall-clock duration", async () => {
    const repositoryRoot = await temporaryRepository();
    const directory = join(
      repositoryRoot,
      "artifacts",
      "orchestrator",
      "runs",
      "controller-test",
      "telemetry",
    );
    const first = await TelemetryStore.open({
      repositoryRoot,
      directory,
      runId: "controller-test",
      source: "controller",
      ...clock(),
    });
    await first.beginPhase({
      phase: "implementation",
      eventType: "worker",
      operationId: "worker-attempt-1",
    });

    const second = await TelemetryStore.open({
      repositoryRoot,
      directory,
      runId: "controller-test",
      source: "controller",
      ...clock(),
    });
    await expect(second.recoverInterruptedPhases()).resolves.toBe(1);
    expect(second.manifest.activePhases).toEqual([]);
    const recovery = second.events.at(-1);
    expect(recovery).toMatchObject({
      operationId: "worker-attempt-1",
      eventType: "phase-recovered",
      phase: "implementation",
      status: "ABORTED",
      reason: "process-interrupted",
      durationNanoseconds: null,
    });
    expect(recovery?.measurementAvailability.durationNanoseconds).toBe(
      "interrupted",
    );
  });

  it("rebuilds a manifest prefix after interruption between event and manifest writes", async () => {
    const repositoryRoot = await temporaryRepository();
    const directory = join(
      repositoryRoot,
      "artifacts",
      "loop-telemetry",
      "direct",
      "interrupted-write",
    );
    let writes = 0;
    const { atomicWriteJson } = await import("./state-store.js");
    const interrupted = await TelemetryStore.open({
      repositoryRoot,
      directory,
      runId: "interrupted-write",
      source: "direct",
      writeJson: async (path, value, hooks) => {
        writes += 1;
        if (writes === 3) throw new Error("simulated manifest interruption");
        await atomicWriteJson(path, value, hooks);
      },
    });
    await expect(
      interrupted.recordCommand({
        commandId: "interrupted-command",
        argv: ["pnpm", "test"],
        startedAt: "2026-08-03T00:00:00.000Z",
        finishedAt: "2026-08-03T00:00:00.001Z",
        durationNanoseconds: "1",
        status: "PASS",
        exitCode: 0,
        signal: null,
      }),
    ).rejects.toThrow(/manifest interruption/);
    const recovered = await TelemetryStore.open({
      repositoryRoot,
      directory,
      runId: "interrupted-write",
      source: "direct",
    });
    expect(recovered.manifest).toMatchObject({
      eventCount: 1,
      status: "active",
    });
    expect(recovered.events[0]).toMatchObject({
      command: { id: "interrupted-command" },
      status: "PASS",
    });
  });

  it("rejects a telemetry directory that traverses a junction", async () => {
    const repositoryRoot = await temporaryRepository();
    const outside = await temporaryRepository();
    const artifactRoot = resolve(repositoryRoot, "artifacts");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(artifactRoot, { recursive: true });
    await symlink(outside, join(artifactRoot, "escape"), "junction");
    await expect(
      TelemetryStore.open({
        repositoryRoot,
        directory: join(artifactRoot, "escape", "run"),
        runId: "unsafe-run",
        source: "direct",
      }),
    ).rejects.toThrow(/non-symlink|outside repository artifacts/);
  });

  it("proves product packages cannot import telemetry tooling", async () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../..");
    const packageRoot = join(repositoryRoot, "packages");
    const violations: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
          const source = await readFile(path, "utf8");
          if (
            /(?:from\s+|import\s*\()["'][^"']*(?:loop-telemetry|telemetry-(?:store|contracts|report))/.test(
              source,
            )
          )
            violations.push(path);
        }
      }
    };
    await visit(packageRoot);
    expect(violations).toEqual([]);
  });

  it("ships the strict versioned telemetry JSON Schema", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, "..", "schemas", "telemetry.schema.json"),
        "utf8",
      ),
    ) as { $schema?: string; properties?: Record<string, unknown> };
    expect(schema.$schema).toContain("2020-12");
    expect(schema.properties).toHaveProperty("measurementAvailability");
  });
});
