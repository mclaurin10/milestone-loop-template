import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RetentionApplyFaultPoint } from "./retention-apply-operation.js";
import { StateStore, atomicWriteJson } from "./state-store.js";
import { validConfig } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
});

function worker(
  mode: "prepare" | "apply",
  metadataPath: string,
  faultPoint?: RetentionApplyFaultPoint,
) {
  return spawnSync(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve(
        "tools/milestone-orchestrator/test/retention-apply-crash-worker.ts",
      ),
      mode,
      metadataPath,
      ...(faultPoint ? [faultPoint] : []),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 90_000,
      windowsHide: true,
    },
  );
}

async function contender(metadataPath: string): Promise<{
  readonly code: number | null;
  readonly stderr: string;
}> {
  const child = spawn(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve(
        "tools/milestone-orchestrator/test/retention-apply-crash-worker.ts",
      ),
      "apply",
      metadataPath,
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number | null>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("exit", resolveCode);
  });
  return { code, stderr };
}

interface WorkerMetadata {
  readonly root: string;
  readonly planPath: string;
  readonly sha256: string;
}

interface FinalSnapshot {
  readonly stateSha256: string;
  readonly journalSha256: string;
  readonly resultSha256: string;
  readonly revision: number;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalize(value: unknown, root: string, planSha256: string): unknown {
  if (typeof value === "string")
    return value
      .replaceAll(root, "<ROOT>")
      .replaceAll(planSha256, "<PLAN_SHA256>");
  if (Array.isArray(value))
    return value.map((entry) => normalize(entry, root, planSha256));
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalize(entry, root, planSha256),
      ]),
    );
  return value;
}

async function snapshot(metadataPath: string): Promise<FinalSnapshot> {
  const metadata = JSON.parse(
    await readFile(metadataPath, "utf8"),
  ) as WorkerMetadata;
  const config = validConfig({
    evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 1 },
  });
  const state = await new StateStore(metadata.root, config.statePath).load();
  if (!state) throw new Error("Expected final canonical state.");
  const applyDirectory = join(
    metadata.root,
    "artifacts",
    "orchestrator",
    "retention",
    "apply",
    metadata.sha256,
  );
  const [journal, result] = await Promise.all([
    readFile(join(applyDirectory, "journal.jsonl")),
    readFile(join(applyDirectory, "apply-result.json")),
  ]);
  for (const removed of [
    join(metadata.root, "artifacts", "prune-run"),
    join(
      metadata.root,
      "artifacts",
      "orchestrator",
      "runs",
      "old-controller-run",
    ),
  ])
    await expect(stat(removed)).rejects.toThrow();
  expect(state.pendingOperation).toBeNull();
  expect(state.evidenceRetention.lastReportPath).toBe(
    join(applyDirectory, "apply-result.json"),
  );
  const normalizedState = normalize(state, metadata.root, metadata.sha256);
  const normalizedJournal = normalize(
    (journal.toString("utf8").trim().split("\n") as string[]).map(
      (line) => JSON.parse(line) as unknown,
    ),
    metadata.root,
    metadata.sha256,
  );
  const normalizedResult = normalize(
    JSON.parse(result.toString("utf8")) as unknown,
    metadata.root,
    metadata.sha256,
  );
  return {
    stateSha256: sha256(Buffer.from(JSON.stringify(normalizedState))),
    journalSha256: sha256(Buffer.from(JSON.stringify(normalizedJournal))),
    resultSha256: sha256(Buffer.from(JSON.stringify(normalizedResult))),
    revision: state.revision,
  };
}

async function preparedFixture(label: string): Promise<string> {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), `milestone-loop-retention-${label}-`)),
  );
  expect(await realpath(directory)).toBe(directory);
  temporaryDirectories.push(directory);
  const metadataPath = join(directory, "metadata.json");
  const prepared = worker("prepare", metadataPath);
  expect(prepared.status, prepared.stderr).toBe(0);
  return metadataPath;
}

describe("retention-apply hard-loss recovery", { timeout: 600_000 }, () => {
  it("converges every declared canonical and destructive boundary", async () => {
    const normalMetadata = await preparedFixture("normal");
    const normal = worker("apply", normalMetadata);
    expect(normal.status, normal.stderr).toBe(0);
    const expected = await snapshot(normalMetadata);
    const points: readonly RetentionApplyFaultPoint[] = [
      "after-intent-persisted",
      "after-deletion-started-state",
      "after-journal-deleting",
      "after-run-deleted",
      "after-journal-deleted",
      "after-deletion-finished-state",
      "after-result-written",
      "after-result-state",
      "after-completion-state",
    ];
    const results: {
      point: RetentionApplyFaultPoint;
      snapshot: FinalSnapshot;
    }[] = [];
    for (const point of points) {
      const metadataPath = await preparedFixture(point);
      const crashed = worker("apply", metadataPath, point);
      expect(crashed.status, crashed.stderr).toBe(86);
      const resumed = worker("apply", metadataPath);
      expect(resumed.status, resumed.stderr).toBe(0);
      const recovered = await snapshot(metadataPath);
      expect(recovered).toEqual(expected);
      results.push({ point, snapshot: recovered });
    }
    const evidencePath = resolve(
      "artifacts",
      "manual",
      "wp2d-retention-apply",
      "fault-matrix.json",
    );
    await atomicWriteJson(evidencePath, {
      schemaVersion: "1.0.0",
      runtime: process.version,
      faultPoints: results,
      uninterrupted: expected,
    });
  });

  it("serializes synchronized recovery contenders through the controller lease", async () => {
    const metadataPath = await preparedFixture("contenders");
    const crashed = worker("apply", metadataPath, "after-run-deleted");
    expect(crashed.status, crashed.stderr).toBe(86);
    const outcomes = await Promise.all([
      contender(metadataPath),
      contender(metadataPath),
    ]);
    expect(outcomes.some((outcome) => outcome.code === 0)).toBe(true);
    for (const outcome of outcomes)
      if (outcome.code !== 0)
        expect(outcome.stderr).toMatch(/mutation lease|already active/i);
    const final = await snapshot(metadataPath);
    expect(final.revision).toBe(7);
  });
});
