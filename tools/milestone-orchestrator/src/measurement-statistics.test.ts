import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";
import { runCommand } from "./command-runner.js";
import type { CommandExecutionSummary } from "./contracts.js";
import { parseMeasurementStatisticsCliArguments } from "./measurement-statistics-cli.js";
import {
  buildMeasurementStatistics,
  calculateMeasurementIntegerDistribution,
  validateMeasurementStatisticsArtifacts,
  type MeasurementStatisticsRecord,
} from "./measurement-statistics.js";
import {
  runMeasurementLane,
  type RunMeasurementLaneInput,
} from "./measurement-lane.js";
import {
  beginTestRunMeasurement,
  describeVitestReport,
  TEST_RUN_SUMMARY_KIND,
  TEST_RUN_SUMMARY_NAME,
  type TestRunCommandIdentity,
} from "./test-run-summary.js";

const statisticsSchema = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../schemas/measurement-statistics.schema.json",
    ),
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

const candidate = {
  gitCommit: identity.gitCommit,
  gitTree: identity.gitTree,
  workingTreeDirty: false as const,
};

const localExecutionContext = {
  provider: "local-validation" as const,
  githubRunId: null,
  githubRunAttempt: null,
  githubJob: null,
};

const roots: string[] = [];
let fixtureRoot: string;
let matrixRoot: string;
let statisticsPath: string;
let statisticsRecord: MeasurementStatisticsRecord;

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
        name: "tools/measurement-statistics-fixture.test.ts",
        status: "passed",
        assertionResults: [
          {
            fullName: "measurement statistics fixture passes",
            status: "passed",
            failureMessages: [],
            duration: 1,
          },
        ],
      },
    ],
  };
}

function measuredExecutor(): NonNullable<
  RunMeasurementLaneInput["executeCommand"]
> {
  return async (command): Promise<CommandExecutionSummary> => {
    await mkdir(command.artifactDirectory, { recursive: true });
    await mkdir(command.logDirectory, { recursive: true });
    const reportPath = resolve(command.artifactDirectory, "vitest-report.json");
    await writeFile(
      reportPath,
      `${JSON.stringify(rawVitestReport(), null, 2)}\n`,
    );
    const measurement = await beginTestRunMeasurement({
      artifactDirectory: command.artifactDirectory,
      runId: command.runId,
      stageId: command.definition.stageId,
      commandId: command.definition.commandId,
      role: command.definition.role,
      owner: command.definition.owner,
      identity,
    });
    measurement.markSetupFinished();
    const execution = await runCommand(
      {
        id: command.definition.id,
        executable: "node",
        args: [
          "-e",
          "require('node:child_process').spawnSync('git', ['--version'], { stdio: 'ignore' });",
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: command.repositoryRoot,
        artifactDirectory: command.logDirectory,
        timeoutMs: 30_000,
        trustedControllerCommand: true,
        extraEnvironment: {
          ...command.environment,
          ...measurement.probeEnvironment,
        },
        processStartupObserver: (nanoseconds) =>
          measurement.observeProcessStartup(nanoseconds),
      },
    );
    if (execution.status !== "PASS")
      throw new Error(`Statistics fixture child failed: ${execution.message}`);
    const summary = await measurement.finish([
      await describeVitestReport({
        artifactDirectory: command.artifactDirectory,
        reportPath,
      }),
    ]);
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
        await writeFile(path, `${JSON.stringify({ status: "PASS", kind })}\n`);
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
              id: "measured-fixture-command",
              status: "PASS",
              summary: "Fixture child exercised the production probe boundary.",
            },
          ],
          artifacts,
        },
        null,
        2,
      )}\n`,
    );
    return execution;
  };
}

function laneClock(
  ordinal: number,
  classification: "cold" | "warm",
): () => Date {
  let tick = 0;
  const seconds = ordinal * 4 + (classification === "warm" ? 2 : 0);
  return () => new Date(Date.UTC(2026, 7, 30, 12, 0, seconds + tick++));
}

async function createMatrixFixture(): Promise<void> {
  fixtureRoot = await mkdtemp(resolve(tmpdir(), "measurement-statistics-"));
  roots.push(fixtureRoot);
  matrixRoot = resolve(fixtureRoot, "matrix");
  await mkdir(matrixRoot, { recursive: true });
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const repositoryRoot = resolve(
      fixtureRoot,
      "repositories",
      String(ordinal),
    );
    await mkdir(resolve(repositoryRoot, "node_modules"), { recursive: true });
    await writeFile(
      resolve(repositoryRoot, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    await writeFile(
      resolve(repositoryRoot, "node_modules", ".modules.yaml"),
      "packageManager: pnpm@11.15.1\n",
    );
    const coldDirectory = resolve(
      matrixRoot,
      "windows",
      String(ordinal),
      "cold",
    );
    const warmDirectory = resolve(
      matrixRoot,
      "windows",
      String(ordinal),
      "warm",
    );
    const common = {
      repositoryRoot,
      ordinal,
      workspaceId: `windows-job-${ordinal}`,
      selectedCommandIds: ["legacy-fast"],
      readIdentity: async () => identity,
      executeCommand: measuredExecutor(),
      executionContext: () => localExecutionContext,
    };
    const cold = await runMeasurementLane({
      ...common,
      artifactDirectory: coldDirectory,
      laneRunId: `windows-cold-${ordinal}`,
      classification: "cold",
      now: laneClock(ordinal, "cold"),
    });
    await runMeasurementLane({
      ...common,
      artifactDirectory: warmDirectory,
      laneRunId: `windows-warm-${ordinal}`,
      classification: "warm",
      pairedColdRecordPath: cold.recordPath,
      now: laneClock(ordinal, "warm"),
    });
  }
  const outputRoot = resolve(fixtureRoot, "output");
  await mkdir(outputRoot, { recursive: true });
  statisticsPath = resolve(outputRoot, "measurement-statistics.json");
  statisticsRecord = await buildMeasurementStatistics({
    inputRoot: matrixRoot,
    outputPath: statisticsPath,
    platformId: "windows",
    pairCount: 5,
    selectedCommandIds: ["legacy-fast"],
    candidate,
    executionContext: localExecutionContext,
  });
}

async function copiedMatrix(name: string): Promise<string> {
  const destination = resolve(fixtureRoot, name);
  await cp(matrixRoot, destination, { recursive: true, errorOnExist: true });
  return destination;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

beforeAll(createMatrixFixture, 120_000);

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe("WP6 deterministic measurement statistics", () => {
  it("computes exact odd-sample median, range, and median absolute deviation", () => {
    expect(
      calculateMeasurementIntegerDistribution(
        ["1", "2", "4", "8", "16"],
        "nanoseconds",
        "fixture",
      ),
    ).toEqual({
      unit: "nanoseconds",
      sampleCount: 5,
      minimum: "1",
      maximum: "16",
      range: "15",
      median: "4",
      medianAbsoluteDeviation: "3",
    });
    expect(() =>
      calculateMeasurementIntegerDistribution(
        ["1", "2"],
        "nanoseconds",
        "fixture",
      ),
    ).toThrow(/positive odd sample count/u);
  });

  it("builds and independently reproduces a schema-valid complete five-pair record", async () => {
    expect(
      validateJsonSchema202012(statisticsSchema, statisticsRecord),
    ).toEqual({
      valid: true,
      errors: [],
    });
    expect(statisticsRecord.matrix).toMatchObject({
      pairCount: 5,
      coldCount: 5,
      warmCount: 5,
      recordCount: 10,
    });
    expect(statisticsRecord.commands).toHaveLength(1);
    expect(statisticsRecord.commands[0]?.cold.sampleCount).toBe(5);
    expect(statisticsRecord.commands[0]?.warm.sampleCount).toBe(5);
    expect(statisticsRecord.nonSemantic).toEqual({
      changesTestSuccess: false,
      authorizesCutover: false,
      benchmarkClaim: false,
      comparesClassifications: false,
    });
    await expect(
      validateMeasurementStatisticsArtifacts({
        statisticsPath,
        inputRoot: matrixRoot,
        expectation: {
          platformId: "windows",
          pairCount: 5,
          selectedCommandIds: ["legacy-fast"],
          candidate,
          executionContext: localExecutionContext,
        },
      }),
    ).resolves.toEqual(statisticsRecord);
  });

  it("rejects a missing pair and a stale command summary", async () => {
    const missing = await copiedMatrix("missing-pair");
    await rm(resolve(missing, "windows", "5", "warm"), {
      recursive: true,
      force: true,
    });
    await expect(
      buildMeasurementStatistics({
        inputRoot: missing,
        outputPath: resolve(fixtureRoot, "missing-statistics.json"),
        platformId: "windows",
        selectedCommandIds: ["legacy-fast"],
      }),
    ).rejects.toThrow(/requires 10 lane records/u);

    const stale = await copiedMatrix("stale-summary");
    await writeFile(
      resolve(
        stale,
        "windows",
        "1",
        "cold",
        "commands",
        "legacy-fast",
        TEST_RUN_SUMMARY_NAME,
      ),
      "{}\n",
    );
    await expect(
      buildMeasurementStatistics({
        inputRoot: stale,
        outputPath: resolve(fixtureRoot, "stale-statistics.json"),
        platformId: "windows",
        selectedCommandIds: ["legacy-fast"],
      }),
    ).rejects.toThrow(/hash mismatch|summary/u);
  });

  it("rejects candidate, execution-context, and recomputed-statistics drift", async () => {
    await expect(
      validateMeasurementStatisticsArtifacts({
        statisticsPath,
        inputRoot: matrixRoot,
        expectation: {
          platformId: "windows",
          selectedCommandIds: ["legacy-fast"],
          candidate: { ...candidate, gitTree: "c".repeat(40) },
        },
      }),
    ).rejects.toThrow(/candidate differs/u);
    await expect(
      validateMeasurementStatisticsArtifacts({
        statisticsPath,
        inputRoot: matrixRoot,
        expectation: {
          platformId: "windows",
          selectedCommandIds: ["legacy-fast"],
          executionContext: {
            provider: "github-actions",
            githubRunId: "1",
            githubRunAttempt: 1,
            githubJob: "measure",
          },
        },
      }),
    ).rejects.toThrow(/execution context differs/u);

    const mutation = structuredClone(statisticsRecord) as unknown as Record<
      string,
      unknown
    >;
    const commands = mutation["commands"] as Record<string, unknown>[];
    const cold = commands[0]!["cold"] as Record<string, unknown>;
    const durations = cold["durationNanoseconds"] as Record<string, unknown>;
    const wall = durations["wallTime"] as Record<string, unknown>;
    wall["median"] = (BigInt(wall["median"] as string) + 1n).toString();
    delete mutation["contentSha256"];
    mutation["contentSha256"] = sha256(canonicalJson(mutation));
    const mutationPath = resolve(fixtureRoot, "mutated-statistics.json");
    await writeFile(mutationPath, `${JSON.stringify(mutation, null, 2)}\n`);
    await expect(
      validateMeasurementStatisticsArtifacts({
        statisticsPath: mutationPath,
        inputRoot: matrixRoot,
        expectation: {
          platformId: "windows",
          selectedCommandIds: ["legacy-fast"],
        },
      }),
    ).rejects.toThrow(/do not reproduce/u);
  });

  it("parses complete source provenance and rejects partial or unsafe CLI input", () => {
    expect(
      parseMeasurementStatisticsCliArguments([
        "--input",
        "matrix",
        "--platform",
        "linux",
        "--source-github-run-id",
        "123",
        "--source-github-run-attempt",
        "2",
        "--source-github-job",
        "measure",
      ]),
    ).toMatchObject({
      inputRoot: "matrix",
      platformId: "linux",
      sourceGithubRunId: "123",
      sourceGithubRunAttempt: 2,
      sourceGithubJob: "measure",
    });
    expect(() =>
      parseMeasurementStatisticsCliArguments([
        "--input",
        "matrix",
        "--platform",
        "linux",
        "--source-github-run-id",
        "123",
      ]),
    ).toThrow(/requires run id, run attempt, and job together/u);
    expect(() =>
      parseMeasurementStatisticsCliArguments([
        "--input",
        "matrix",
        "--platform",
        "other",
      ]),
    ).toThrow(/linux or windows/u);
  });

  it("pins a dispatch-only five-pair workflow without changing exact-runtime CI", () => {
    const workflow = readFileSync(
      resolve(".github/workflows/wp6-measurement-matrix.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/on:\s*\n\s*workflow_dispatch:\s*\n/u);
    expect(workflow).not.toMatch(/^\s*(?:push|pull_request):/mu);
    expect(workflow.match(/^\s+ordinal: [1-5]$/gmu)).toHaveLength(10);
    expect(workflow).toContain("ubuntu-24.04");
    expect(workflow).toContain("windows-2022");
    expect(workflow).toContain('node-version: "24.18.0"');
    expect(workflow).toContain("corepack prepare pnpm@11.15.1 --activate");
    expect(workflow).toContain(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    );
    expect(workflow).toContain(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
    expect(workflow).toContain(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    );
    expect(workflow).toContain(
      "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    );
    expect(workflow.indexOf("Run cold repetition")).toBeLessThan(
      workflow.indexOf("Run immediately paired warm repetition"),
    );
    for (const commandId of [
      "legacy-fast",
      "legacy-migration",
      "legacy-orchestrator",
      "partition-controller-runtime",
      "partition-repository-tooling",
      "partition-adopter-template",
      "partition-trusted-container-fixture",
    ])
      expect(
        workflow.match(new RegExp(`--command ${commandId}`, "gu")),
      ).toHaveLength(2);
    expect(workflow).toContain("--paired-cold-record");
    expect(workflow).toContain("needs: measure");
    expect(workflow).not.toContain("loop:benchmark");

    const protectedWorkflow = readFileSync(
      resolve(".github/workflows/exact-runtime-ci.yml"),
    );
    expect(sha256(protectedWorkflow)).toBe(
      "9dc35e44aacd35e3058895cccc89c43de9ff535ad20a0552c9b8a80b23cb19bf",
    );
  });
});
