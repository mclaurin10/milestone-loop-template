import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildHistoricalTelemetryReport,
  distribution,
} from "./telemetry-report.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(root: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(`Fixture Git failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function fixtureRepository(): Promise<{
  readonly root: string;
  readonly commits: readonly [string, string, string];
}> {
  const root = await mkdtemp(join(tmpdir(), "ski-loop-report-"));
  temporaryDirectories.push(root);
  git(root, ["init"]);
  const data = (value: string): string =>
    `data ${Buffer.byteLength(value)}\n${value}`;
  const identity =
    "Telemetry Test <telemetry@example.invalid> 1700000000 +0000";
  const stream = [
    "blob",
    "mark :1",
    data("export const one = 1;\n"),
    "commit refs/heads/main",
    "mark :10",
    `author ${identity}`,
    `committer ${identity}`,
    data("First product increment\n"),
    "M 100644 :1 packages/simulation/src/one.ts",
    "",
    "blob",
    "mark :2",
    data("record\n"),
    "commit refs/heads/main",
    "mark :11",
    `author ${identity}`,
    `committer ${identity}`,
    data("Record increment\n"),
    "M 100644 :2 docs/record.md",
    "",
    "blob",
    "mark :3",
    data("export const check = true;\n"),
    "commit refs/heads/main",
    "mark :12",
    `author ${identity}`,
    `committer ${identity}`,
    data("Add tool\n"),
    "M 100644 :3 tools/check.mjs",
    "",
    "done",
    "",
  ].join("\n");
  const imported = spawnSync(
    "git",
    ["-C", root, "fast-import", "--quiet", "--done"],
    {
      encoding: "utf8",
      input: stream,
      windowsHide: true,
    },
  );
  if (imported.status !== 0)
    throw new Error(`Fixture Git fast-import failed: ${imported.stderr}`);
  const commits = git(root, ["rev-list", "--reverse", "refs/heads/main"]).split(
    /\r?\n/,
  );
  if (commits.length !== 3)
    throw new Error("Fixture Git did not create exactly three commits.");
  const [first, second, third] = commits;
  if (!first || !second || !third)
    throw new Error("Fixture Git commit identity is unavailable.");
  return { root, commits: [first, second, third] };
}

async function writeVerificationResult(input: {
  readonly root: string;
  readonly runId: string;
  readonly commit: string;
  readonly durationMs: number;
  readonly testCount: number;
  readonly corruptArtifactHash?: boolean;
}): Promise<void> {
  const run = join(input.root, "artifacts", input.runId);
  const command = join(run, "stages", "unit-domain", "01-test-unit");
  await mkdir(command, { recursive: true });
  const report = {
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: input.testCount,
    numPassedTests: input.testCount,
    numFailedTests: 0,
    numPendingTests: 0,
  };
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = join(command, "test-report.json");
  await writeFile(reportPath, reportText, "utf8");
  const reportHash = createHash("sha256").update(reportText).digest("hex");
  await writeFile(
    join(command, "result.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      status: "PASS",
      artifacts: [
        {
          path: "test-report.json",
          kind: "vitest-report",
          bytes: Buffer.byteLength(reportText),
          sha256: reportHash,
        },
      ],
    })}\n`,
    "utf8",
  );
  const tree = git(input.root, ["rev-parse", `${input.commit}^{tree}`]);
  const artifactPath = "stages/unit-domain/01-test-unit/test-report.json";
  const result = {
    schemaVersion: "2.0.0",
    runId: input.runId,
    status: "NOT_READY",
    exitCode: 2,
    startedAt: "2026-08-03T00:00:00.000Z",
    finishedAt: "2026-08-03T00:00:01.000Z",
    durationMs: input.durationMs,
    invocation: ["node", "scripts/verify.mjs"],
    profile: {
      id: "readiness",
      configuredDefault: "readiness",
      selectedByOverride: false,
    },
    candidate: {
      gitCommit: input.commit,
      gitTree: tree,
      workingTreeDirty: false,
    },
    stages: [
      {
        id: "unit-domain",
        status: "NOT_READY",
        commands: [
          {
            script: "test:unit",
            status: "PASS",
            exitCode: 0,
            signal: null,
            durationMs: input.durationMs / 2,
            log: "logs/unit.log",
            evidence: {
              receipt: "stages/unit-domain/01-test-unit/result.json",
              valid: true,
              artifacts: [
                {
                  path: artifactPath,
                  kind: "vitest-report",
                  bytes: Buffer.byteLength(reportText),
                  sha256: input.corruptArtifactHash
                    ? "0".repeat(64)
                    : reportHash,
                },
              ],
            },
          },
          {
            script: "test:domain",
            status: "NOT_READY",
            exitCode: null,
            signal: null,
            durationMs: 0,
            log: null,
            evidence: null,
          },
        ],
      },
    ],
  };
  await writeFile(
    join(run, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
}

describe("historical telemetry reconstruction", () => {
  it("computes p50, p95, MAD, command, artifact, and change-class metrics", async () => {
    const fixture = await fixtureRepository();
    const [first, second, third] = fixture.commits;
    await writeVerificationResult({
      root: fixture.root,
      runId: "verify-001",
      commit: first,
      durationMs: 100,
      testCount: 2,
    });
    await writeVerificationResult({
      root: fixture.root,
      runId: "verify-002",
      commit: second,
      durationMs: 200,
      testCount: 3,
    });
    await writeVerificationResult({
      root: fixture.root,
      runId: "verify-003",
      commit: third,
      durationMs: 100,
      testCount: 4,
    });
    const output = join(
      fixture.root,
      "artifacts",
      "loop-telemetry",
      "baselines",
      "fixture",
    );
    const result = await buildHistoricalTelemetryReport({
      repositoryRoot: fixture.root,
      fromCommit: first,
      throughCommit: third,
      outputDirectory: output,
      now: () => new Date("2026-08-03T01:00:00.000Z"),
    });
    expect(result.report.observations).toHaveLength(3);
    expect(result.report.metrics.exactResultDurationMs).toEqual({
      count: 3,
      minimum: 100,
      maximum: 200,
      p50: 100,
      p95: 200,
      medianAbsoluteDeviation: 0,
    });
    expect(result.report.metrics.commandDurationMs["test:unit"]).toMatchObject({
      count: 3,
      p50: 50,
      p95: 100,
    });
    expect(
      result.report.metrics.changeClassDurationMs["governance-record"],
    ).toMatchObject({ count: 1, p50: 200 });
    expect(result.report.observations[0]).toMatchObject({
      tests: { suites: 1, tests: 2 },
      artifactCount: 1,
      unavailable: {
        planningDuration: "outside-controller",
        agentUsage: "not-recorded",
      },
    });
    expect(
      result.report.sources.every((source) => source.sha256.length === 64),
    ).toBe(true);
    await expect(readFile(result.reportPath, "utf8")).resolves.toContain(
      '"baselineId": "d015-d030-retained-v1"',
    );
  });

  it("fails rather than normalizing a corrupt retained artifact declaration", async () => {
    const fixture = await fixtureRepository();
    const [first, , third] = fixture.commits;
    await writeVerificationResult({
      root: fixture.root,
      runId: "verify-corrupt",
      commit: first,
      durationMs: 100,
      testCount: 1,
      corruptArtifactHash: true,
    });
    await expect(
      buildHistoricalTelemetryReport({
        repositoryRoot: fixture.root,
        fromCommit: first,
        throughCommit: third,
      }),
    ).rejects.toThrow(/artifact declaration is invalid/);
  });

  it("handles empty distributions without inventing zeroes", () => {
    expect(distribution([])).toEqual({
      count: 0,
      minimum: null,
      maximum: null,
      p50: null,
      p95: null,
      medianAbsoluteDeviation: null,
    });
  });
});
