import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { ControllerLease } from "../src/controller-lease.js";
import {
  buildEvidenceRetentionPlan,
  planManagedEvidenceRuns,
} from "../src/evidence-retention.js";
import {
  applyEvidenceRetentionPlan,
  type RetentionApplyFaultPoint,
} from "../src/retention-apply-operation.js";
import { StateStore, atomicWriteJson } from "../src/state-store.js";
import { validConfig, validState } from "./fixtures.js";

const NOW = "2026-08-02T01:00:00.000Z";

interface WorkerMetadata {
  readonly root: string;
  readonly planPath: string;
  readonly sha256: string;
}

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-02T00:00:00.000Z",
      GIT_COMMITTER_DATE: "2026-08-02T00:00:00.000Z",
    },
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function createVerificationRun(
  root: string,
  id: string,
  finishedAt: string,
): Promise<void> {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await atomicWriteJson(join(directory, "result.json"), {
    schemaVersion: "1.0.0",
    runId: id,
    finishedAt,
  });
}

async function createControllerRun(
  root: string,
  id: string,
  finishedAt: string,
): Promise<void> {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await atomicWriteJson(join(directory, "run-summary.json"), {
    schemaVersion: "1.0.0",
    run: { id, finishedAt },
  });
}

const trustedPlanner: typeof planManagedEvidenceRuns = async (input) =>
  planManagedEvidenceRuns({
    ...input,
    safety: { ...input.safety, inventoryHasUnknownReferences: false },
  });

async function prepare(metadataPath: string): Promise<void> {
  const root = resolve(dirname(metadataPath), "repository");
  await mkdir(root, { recursive: true });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Retention Crash Worker");
  git(root, "config", "user.email", "retention-crash@example.invalid");
  await writeFile(join(root, ".gitignore"), "artifacts/\n");
  await writeFile(join(root, "record.md"), "Cited evidence: cited-run\n");
  git(root, "add", ".gitignore", "record.md");
  git(root, "commit", "-m", "retention crash fixture");
  const verificationRoot = join(root, "artifacts");
  const controllerRoot = join(root, "artifacts", "orchestrator", "runs");
  await Promise.all([
    createVerificationRun(
      verificationRoot,
      "cited-run",
      "2026-08-01T00:00:00.000Z",
    ),
    createVerificationRun(
      verificationRoot,
      "prune-run",
      "2026-08-01T01:00:00.000Z",
    ),
    createVerificationRun(
      verificationRoot,
      "recent-run",
      "2026-08-01T02:00:00.000Z",
    ),
    createControllerRun(
      controllerRoot,
      "old-controller-run",
      "2026-08-01T00:00:00.000Z",
    ),
    createControllerRun(
      controllerRoot,
      "recent-controller-run",
      "2026-08-01T02:00:00.000Z",
    ),
  ]);
  const config = validConfig({
    evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 1 },
  });
  const base = validState(root);
  const state = {
    ...base,
    repository: {
      ...base.repository,
      verifiedCommit: git(root, "rev-parse", "HEAD"),
    },
  };
  const plan = await buildEvidenceRetentionPlan({
    repositoryRoot: root,
    config,
    state,
    now: "2026-08-02T00:00:00.000Z",
    planner: trustedPlanner,
  });
  const planPath = join(
    root,
    "artifacts",
    "orchestrator",
    "retention",
    "plans",
    "crash-fixture",
    "plan.json",
  );
  await mkdir(dirname(planPath), { recursive: true });
  const planBytes = `${JSON.stringify(plan, null, 2)}\n`;
  await writeFile(planPath, planBytes);
  const store = new StateStore(root, config.statePath, () => NOW);
  await store.initialize(state);
  await atomicWriteJson(metadataPath, {
    root,
    planPath,
    sha256: createHash("sha256").update(planBytes).digest("hex"),
  } satisfies WorkerMetadata);
}

async function apply(
  metadataPath: string,
  faultPoint: RetentionApplyFaultPoint | null,
): Promise<void> {
  const metadata = JSON.parse(
    await readFile(metadataPath, "utf8"),
  ) as WorkerMetadata;
  const config = validConfig({
    evidenceRetention: { artifactRoot: "artifacts", keepRecentRuns: 1 },
  });
  const lease = await ControllerLease.acquire({
    repositoryRoot: metadata.root,
    statePath: config.statePath,
    operation: "retention-apply",
  });
  try {
    const store = new StateStore(metadata.root, config.statePath, () => NOW);
    await applyEvidenceRetentionPlan({
      repositoryRoot: metadata.root,
      planPath: metadata.planPath,
      expectedSha256: metadata.sha256,
      config,
      store,
      now: NOW,
      planner: trustedPlanner,
      ...(faultPoint
        ? {
            hooks: {
              fault: (point: RetentionApplyFaultPoint) => {
                if (point === faultPoint) process.exit(86);
              },
            },
          }
        : {}),
    });
  } finally {
    await lease.release();
  }
}

async function main(): Promise<void> {
  const [mode, metadataPath, faultPoint] = process.argv.slice(2);
  if (!metadataPath) throw new Error("Expected a metadata path.");
  if (mode === "prepare") await prepare(metadataPath);
  else if (mode === "apply")
    await apply(
      metadataPath,
      (faultPoint as RetentionApplyFaultPoint | undefined) ?? null,
    );
  else throw new Error("Expected prepare or apply mode.");
}

await main();
