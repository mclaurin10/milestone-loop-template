import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";
import type { CommandExecutionSummary } from "./contracts.js";
import { parseMeasurementLaneCliArguments } from "./measurement-lane-cli.js";
import {
  collectMeasurementLaneWorkspaceSnapshot,
  loadMeasurementLaneRecord,
  MEASUREMENT_LANE_PAIRED_COLD_RECORD_NAME,
  MEASUREMENT_LANE_RECORD_NAME,
  runMeasurementLane,
  validateMeasurementLaneArtifacts,
  type RunMeasurementLaneInput,
} from "./measurement-lane.js";
import {
  beginTestRunMeasurement,
  describeVitestReport,
  TEST_RUN_SUMMARY_KIND,
  type TestRunCommandIdentity,
} from "./test-run-summary.js";

const laneSchema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../schemas/measurement-lane-run.schema.json"),
    "utf8",
  ),
) as unknown;

const identity: TestRunCommandIdentity = {
  gitCommit: "a".repeat(40),
  gitTree: "b".repeat(40),
  workingTreeDirty: false,
  nodeVersion: "v24.18.0",
  pnpmVersion: "11.15.1",
};

const roots: string[] = [];

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

function sha256(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function rawVitestReport(): unknown {
  return {
    success: true,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: "tools/measurement-fixture.test.ts",
        status: "passed",
        assertionResults: [
          {
            fullName: "measurement fixture passes",
            status: "passed",
            failureMessages: [],
            duration: 1,
          },
        ],
      },
    ],
  };
}

async function workspaceFixture(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "measurement-lane-"));
  roots.push(root);
  await mkdir(resolve(root, "node_modules", ".pnpm"), { recursive: true });
  await writeFile(resolve(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(
    resolve(root, "node_modules", ".modules.yaml"),
    "packageManager: pnpm@11.15.1\n",
  );
  await writeFile(
    resolve(root, "node_modules", ".pnpm", "lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );
  return root;
}

function fixtureClock(): () => Date {
  let index = 0;
  return () =>
    new Date(
      index++ === 0 ? "2026-08-30T12:00:00.000Z" : "2026-08-30T12:00:01.000Z",
    );
}

function passingExecutor(input?: {
  readonly omitReceipt?: boolean;
  readonly mutateSummaryAfterReceipt?: boolean;
}): NonNullable<RunMeasurementLaneInput["executeCommand"]> {
  return async (command): Promise<CommandExecutionSummary> => {
    await mkdir(command.artifactDirectory, { recursive: true });
    await mkdir(command.logDirectory, { recursive: true });
    const reportPath = resolve(command.artifactDirectory, "vitest-report.json");
    await writeFile(
      reportPath,
      `${JSON.stringify(rawVitestReport(), null, 2)}\n`,
    );
    let monotonic = 0n;
    let timestampIndex = 0;
    const session = await beginTestRunMeasurement({
      artifactDirectory: command.artifactDirectory,
      runId: command.runId,
      stageId: command.definition.stageId,
      commandId: command.definition.commandId,
      role: command.definition.role,
      owner: command.definition.owner,
      identity,
      now: () =>
        new Date(
          timestampIndex++ === 0
            ? "2026-08-30T12:00:00.000Z"
            : "2026-08-30T12:00:01.000Z",
        ),
      hrtime: () => {
        monotonic += 10n;
        return monotonic;
      },
    });
    session.markSetupFinished();
    session.observeProcessStartup(1n);
    const summary = await session.finish([
      await describeVitestReport({
        artifactDirectory: command.artifactDirectory,
        reportPath,
      }),
    ]);

    if (!input?.omitReceipt) {
      const artifacts: {
        path: string;
        kind: string;
        bytes: number;
        sha256: string;
      }[] = [];
      for (const [index, kind] of command.definition.requiredKinds.entries()) {
        const path =
          kind === TEST_RUN_SUMMARY_KIND
            ? summary.path
            : resolve(command.artifactDirectory, `artifact-${index}.json`);
        if (kind !== TEST_RUN_SUMMARY_KIND)
          await writeFile(
            path,
            `${JSON.stringify({ status: "PASS", kind })}\n`,
          );
        const contents = await readFile(path);
        const metadata = await stat(path);
        artifacts.push({
          path: relative(command.artifactDirectory, path).replaceAll("\\", "/"),
          kind,
          bytes: metadata.size,
          sha256: sha256(contents),
        });
      }
      await writeFile(
        resolve(command.artifactDirectory, "result.json"),
        `${JSON.stringify(
          {
            schemaVersion: "1.0.0",
            stageId: command.definition.stageId,
            commandId: command.definition.commandId,
            status: "PASS",
            checks: [
              {
                id: "fixture-command",
                status: "PASS",
                summary: "Fixture exercised the command evidence boundary.",
              },
            ],
            artifacts,
          },
          null,
          2,
        )}\n`,
      );
      if (input?.mutateSummaryAfterReceipt)
        await writeFile(summary.path, "{}\n", "utf8");
    }

    const stdoutPath = resolve(command.logDirectory, "stdout.log");
    const stderrPath = resolve(command.logDirectory, "stderr.log");
    await writeFile(stdoutPath, "fixture command passed\n");
    await writeFile(stderrPath, "fixture command had no errors\n");
    return {
      id: command.definition.id,
      displayCommand: `pnpm ${command.definition.script}`,
      status: "PASS",
      exitCode: 0,
      signal: null,
      startedAt: "2026-08-30T12:00:00.000Z",
      finishedAt: "2026-08-30T12:00:01.000Z",
      durationMs: 1000,
      stdoutPath,
      stderrPath,
      stdoutSha256: sha256(await readFile(stdoutPath)),
      stderrSha256: sha256(await readFile(stderrPath)),
      parser: "exit-code",
      parsedArtifactPath: null,
      message: "Fixture command passed.",
      receipt: null,
      receiptAbsenceReason: null,
    };
  };
}

async function runFixtureLane(input: {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly laneRunId: string;
  readonly classification?: "cold" | "warm";
  readonly pairedColdRecordPath?: string;
  readonly selectedCommandIds?: readonly string[];
  readonly readIdentity?: RunMeasurementLaneInput["readIdentity"];
  readonly executeCommand?: RunMeasurementLaneInput["executeCommand"];
  readonly workspaceSnapshot?: RunMeasurementLaneInput["workspaceSnapshot"];
}) {
  return runMeasurementLane({
    repositoryRoot: input.repositoryRoot,
    artifactDirectory: input.artifactDirectory,
    laneRunId: input.laneRunId,
    ordinal: 1,
    classification: input.classification ?? "cold",
    workspaceId: "hosted-job-1",
    selectedCommandIds: input.selectedCommandIds ?? [
      "partition-controller-runtime",
      "legacy-fast",
    ],
    ...(input.pairedColdRecordPath
      ? { pairedColdRecordPath: input.pairedColdRecordPath }
      : {}),
    readIdentity: input.readIdentity ?? (async () => identity),
    executeCommand: input.executeCommand ?? passingExecutor(),
    ...(input.workspaceSnapshot
      ? { workspaceSnapshot: input.workspaceSnapshot }
      : {}),
    executionContext: () => ({
      provider: "local-validation",
      githubRunId: null,
      githubRunAttempt: null,
      githubJob: null,
    }),
    now: fixtureClock(),
  });
}

describe("WP6 measurement-lane runner", () => {
  it("records a schema-valid cold repetition and independently reproduces it", async () => {
    const root = await workspaceFixture();
    const result = await runFixtureLane({
      repositoryRoot: root,
      artifactDirectory: resolve(root, "cold"),
      laneRunId: "cold-1",
    });

    expect(result.record.commandSet.selectedCommandIds).toEqual([
      "legacy-fast",
      "partition-controller-runtime",
    ]);
    expect(result.record.reduction.inputCount).toBe(2);
    expect(result.record.nonSemantic).toEqual({
      changesTestSuccess: false,
      authorizesCutover: false,
      benchmarkClaim: false,
    });
    expect(validateJsonSchema202012(laneSchema, result.record)).toEqual({
      valid: true,
      errors: [],
    });
    await expect(
      validateMeasurementLaneArtifacts(result.recordPath),
    ).resolves.toMatchObject({ record: { status: "PASS" } });
  });

  it("binds a warm repetition to the same cold workspace, candidate, and command set", async () => {
    const root = await workspaceFixture();
    const cold = await runFixtureLane({
      repositoryRoot: root,
      artifactDirectory: resolve(root, "cold"),
      laneRunId: "cold-pair",
      selectedCommandIds: ["legacy-orchestrator"],
    });
    const warm = await runFixtureLane({
      repositoryRoot: root,
      artifactDirectory: resolve(root, "warm"),
      laneRunId: "warm-pair",
      classification: "warm",
      pairedColdRecordPath: cold.recordPath,
      selectedCommandIds: ["legacy-orchestrator"],
    });

    expect(warm.record.pairedCold).toMatchObject({
      path: MEASUREMENT_LANE_PAIRED_COLD_RECORD_NAME,
      laneRunId: "cold-pair",
      contentSha256: cold.record.contentSha256,
    });
    expect(
      await readFile(
        resolve(
          warm.recordPath,
          "..",
          MEASUREMENT_LANE_PAIRED_COLD_RECORD_NAME,
        ),
      ),
    ).toEqual(await readFile(cold.recordPath));
    await expect(
      validateMeasurementLaneArtifacts(warm.recordPath),
    ).resolves.toMatchObject({
      record: { laneRun: { classification: "warm" } },
    });
  });

  it("fails closed on missing receipts, stale summaries, and candidate drift", async () => {
    const missingRoot = await workspaceFixture();
    const missingDirectory = resolve(missingRoot, "missing-receipt");
    await expect(
      runFixtureLane({
        repositoryRoot: missingRoot,
        artifactDirectory: missingDirectory,
        laneRunId: "missing-receipt",
        selectedCommandIds: ["legacy-fast"],
        executeCommand: passingExecutor({ omitReceipt: true }),
      }),
    ).rejects.toThrow(/receipt is missing/u);
    await expect(
      stat(resolve(missingDirectory, MEASUREMENT_LANE_RECORD_NAME)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const staleRoot = await workspaceFixture();
    await expect(
      runFixtureLane({
        repositoryRoot: staleRoot,
        artifactDirectory: resolve(staleRoot, "stale-summary"),
        laneRunId: "stale-summary",
        selectedCommandIds: ["legacy-fast"],
        executeCommand: passingExecutor({ mutateSummaryAfterReceipt: true }),
      }),
    ).rejects.toThrow(/failed size or hash validation/u);

    const driftRoot = await workspaceFixture();
    let identityReads = 0;
    await expect(
      runFixtureLane({
        repositoryRoot: driftRoot,
        artifactDirectory: resolve(driftRoot, "candidate-drift"),
        laneRunId: "candidate-drift",
        selectedCommandIds: ["legacy-fast"],
        readIdentity: async () => ({
          ...identity,
          gitCommit:
            identityReads++ === 0 ? identity.gitCommit : "c".repeat(40),
        }),
      }),
    ).rejects.toThrow(/candidate or runtime changed/u);
  });

  it("ignores volatile modules metadata but rejects virtual-store dependency drift", async () => {
    const root = await workspaceFixture();
    const cold = await runFixtureLane({
      repositoryRoot: root,
      artifactDirectory: resolve(root, "cold-mismatch"),
      laneRunId: "cold-mismatch",
      selectedCommandIds: ["legacy-fast"],
    });
    await writeFile(
      resolve(root, "node_modules", ".modules.yaml"),
      "packageManager: pnpm@11.15.1\nprunedAt: rewritten\n",
    );
    await expect(
      runFixtureLane({
        repositoryRoot: root,
        artifactDirectory: resolve(root, "warm-volatile-manifest"),
        laneRunId: "warm-volatile-manifest",
        classification: "warm",
        pairedColdRecordPath: cold.recordPath,
        selectedCommandIds: ["legacy-fast"],
      }),
    ).resolves.toMatchObject({
      record: { laneRun: { classification: "warm" } },
    });

    const driftRoot = await workspaceFixture();
    const driftCold = await runFixtureLane({
      repositoryRoot: driftRoot,
      artifactDirectory: resolve(driftRoot, "cold-dependency-drift"),
      laneRunId: "cold-dependency-drift",
      selectedCommandIds: ["legacy-fast"],
    });
    const snapshot = await collectMeasurementLaneWorkspaceSnapshot(driftRoot);

    await expect(
      runFixtureLane({
        repositoryRoot: driftRoot,
        artifactDirectory: resolve(driftRoot, "warm-dependency-drift"),
        laneRunId: "warm-dependency-drift",
        classification: "warm",
        pairedColdRecordPath: driftCold.recordPath,
        selectedCommandIds: ["legacy-fast"],
        workspaceSnapshot: async () => ({
          ...snapshot,
          virtualStoreLockfile: {
            ...snapshot.virtualStoreLockfile,
            sha256: "c".repeat(64),
          },
        }),
      }),
    ).rejects.toThrow(/does not match its paired cold/u);
  });

  it("rejects retained record and child-artifact mutations", async () => {
    const recordRoot = await workspaceFixture();
    const recordResult = await runFixtureLane({
      repositoryRoot: recordRoot,
      artifactDirectory: resolve(recordRoot, "record-mutation"),
      laneRunId: "record-mutation",
      selectedCommandIds: ["legacy-fast"],
    });
    const record = JSON.parse(
      await readFile(recordResult.recordPath, "utf8"),
    ) as {
      nonSemantic: { benchmarkClaim: boolean };
    };
    record.nonSemantic.benchmarkClaim = true;
    await writeFile(
      recordResult.recordPath,
      `${JSON.stringify(record, null, 2)}\n`,
    );
    await expect(
      loadMeasurementLaneRecord({ path: recordResult.recordPath }),
    ).rejects.toThrow(/cannot change semantic outcomes/u);

    const artifactRoot = await workspaceFixture();
    const artifactResult = await runFixtureLane({
      repositoryRoot: artifactRoot,
      artifactDirectory: resolve(artifactRoot, "artifact-mutation"),
      laneRunId: "artifact-mutation",
      selectedCommandIds: ["legacy-fast"],
    });
    await writeFile(artifactResult.summaryPaths[0]!, "{}\n");
    await expect(
      validateMeasurementLaneArtifacts(artifactResult.recordPath),
    ).rejects.toThrow(/failed size or hash validation/u);
  });
});

describe("WP6 measurement-lane CLI contract", () => {
  it("requires an explicit cold/warm pairing and rejects duplicate selections", () => {
    expect(
      parseMeasurementLaneCliArguments([
        "--lane-run-id",
        "warm-1",
        "--ordinal",
        "1",
        "--classification",
        "warm",
        "--workspace-id",
        "job-1",
        "--command",
        "legacy-fast",
        "--paired-cold-record",
        "cold/measurement-lane-run.json",
      ]),
    ).toMatchObject({ classification: "warm", ordinal: 1 });
    expect(() =>
      parseMeasurementLaneCliArguments([
        "--lane-run-id",
        "warm-1",
        "--ordinal",
        "1",
        "--classification",
        "warm",
        "--workspace-id",
        "job-1",
        "--command",
        "legacy-fast",
      ]),
    ).toThrow(/require --paired-cold-record/u);
    expect(() =>
      parseMeasurementLaneCliArguments([
        "--lane-run-id",
        "cold-1",
        "--ordinal",
        "1",
        "--classification",
        "cold",
        "--workspace-id",
        "job-1",
        "--command",
        "legacy-fast",
        "--command",
        "legacy-fast",
      ]),
    ).toThrow(/must be unique/u);
  });
});
