import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runCommand } from "./command-runner.js";
import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";
import {
  assertTestRunReduction,
  assertTestRunSummary,
  beginTestRunMeasurement,
  describeVitestReport,
  loadValidatedTestRunSummary,
  reduceTestRunSummaries,
  TEST_RUN_SUMMARY_KIND,
  type TestRunCandidate,
  type TestRunRole,
  type TestRunSummaryExpectation,
  type ValidatedTestRunSummarySource,
} from "./test-run-summary.js";

const candidate: TestRunCandidate = {
  gitCommit: "a".repeat(40),
  gitTree: "b".repeat(40),
  workingTreeDirty: false,
};

const summarySchema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../schemas/test-run-summary.schema.json"),
    "utf8",
  ),
) as unknown;
const reductionSchema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../schemas/test-run-reduction.schema.json"),
    "utf8",
  ),
) as unknown;

const roots: string[] = [];

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

function rawVitestReport(duration: number | null = 2.5): unknown {
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
        name: "tools/example.test.ts",
        status: "passed",
        assertionResults: [
          {
            fullName: "example passes",
            status: "passed",
            failureMessages: [],
            ...(duration === null ? {} : { duration }),
          },
        ],
      },
    ],
  };
}

async function summaryFixture(input: {
  readonly runId: string;
  readonly stageId: string;
  readonly commandId: string;
  readonly role?: TestRunRole;
  readonly owner?: string | null;
}): Promise<{
  readonly root: string;
  readonly source: ValidatedTestRunSummarySource;
  readonly expected: TestRunSummaryExpectation;
}> {
  const root = await mkdtemp(join(tmpdir(), "test-run-summary-"));
  roots.push(root);
  const reportPath = resolve(root, "vitest-report.json");
  await writeFile(
    reportPath,
    `${JSON.stringify(rawVitestReport(), null, 2)}\n`,
    "utf8",
  );
  const role = input.role ?? "legacy";
  const owner = input.owner ?? null;
  let monotonic = 0n;
  let timestampIndex = 0;
  const session = await beginTestRunMeasurement({
    artifactDirectory: root,
    runId: input.runId,
    stageId: input.stageId,
    commandId: input.commandId,
    role,
    owner,
    identity: {
      ...candidate,
      nodeVersion: "v24.18.0",
      pnpmVersion: "11.15.1",
    },
    now: () =>
      new Date(
        timestampIndex++ === 0
          ? "2026-08-28T12:00:00.000Z"
          : "2026-08-28T12:00:01.000Z",
      ),
    hrtime: () => {
      monotonic += 10n;
      return monotonic;
    },
  });
  session.markSetupFinished();
  session.observeProcessStartup(7n);
  const finished = await session.finish([
    await describeVitestReport({ artifactDirectory: root, reportPath }),
  ]);
  const contents = await readFile(finished.path);
  const metadata = await stat(finished.path);
  const expected = {
    runId: input.runId,
    stageId: input.stageId,
    commandId: input.commandId,
    role,
    owner,
    candidate,
  };
  return {
    root,
    expected,
    source: {
      path: finished.path,
      bytes: metadata.size,
      sha256: createHash("sha256").update(contents).digest("hex"),
      summary: assertTestRunSummary(finished.summary, expected),
    },
  };
}

describe("WP6 compact test-run summary contract", () => {
  it("distinguishes all required boundaries and explicit unavailable resources", async () => {
    const fixture = await summaryFixture({
      runId: "summary-contract",
      stageId: "candidate-unit",
      commandId: "test:unit:fast",
    });

    expect(fixture.source.summary).toMatchObject({
      units: {
        duration: "nanoseconds",
        cpu: "microseconds",
        memory: "bytes",
      },
      measurements: {
        wallTime: { availability: "measured", sampleCount: 1 },
        setupTime: { availability: "measured", sampleCount: 1 },
        gitFixtureTime: {
          availability: "unavailable",
          reason: "no-instrumented-node-process-records",
        },
        processStartupTime: {
          availability: "measured",
          nanoseconds: "7",
        },
        testBodyTime: {
          availability: "measured",
          nanoseconds: "2500000",
        },
        cpuTime: { availability: "unavailable" },
        peakRss: { availability: "unavailable" },
      },
      nonSemantic: {
        changesTestSuccess: false,
        authorizesCutover: false,
        benchmarkClaim: false,
      },
    });
    expect(fixture.source.summary.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      validateJsonSchema202012(summarySchema, fixture.source.summary),
    ).toEqual({ valid: true, errors: [] });
  });

  it("fails closed on missing, malformed, and contradictory summary fields", async () => {
    const fixture = await summaryFixture({
      runId: "summary-mutations",
      stageId: "candidate-unit",
      commandId: "test:unit:fast",
    });
    const missing = structuredClone(
      fixture.source.summary,
    ) as unknown as Record<string, unknown>;
    delete missing["protocolId"];
    expect(() => assertTestRunSummary(missing)).toThrow(
      /unexpected or missing fields/u,
    );

    const malformed = {
      ...structuredClone(fixture.source.summary),
      unexpected: true,
    };
    expect(() => assertTestRunSummary(malformed)).toThrow(
      /unexpected or missing fields/u,
    );
    expect(validateJsonSchema202012(summarySchema, malformed).valid).toBe(
      false,
    );

    const contradictory = structuredClone(
      fixture.source.summary,
    ) as unknown as {
      measurements: {
        wallTime: { nanoseconds: string };
        setupTime: { nanoseconds: string };
      };
    };
    contradictory.measurements.setupTime.nanoseconds = (
      BigInt(contradictory.measurements.wallTime.nanoseconds) + 1n
    ).toString();
    expect(() => assertTestRunSummary(contradictory)).toThrow(
      /Setup time cannot exceed/u,
    );
  });

  it("rejects stale run identity and candidate or command mismatches", async () => {
    const fixture = await summaryFixture({
      runId: "current-run",
      stageId: "candidate-unit",
      commandId: "test:unit:fast",
    });
    expect(() =>
      assertTestRunSummary(fixture.source.summary, {
        ...fixture.expected,
        runId: "prior-run",
      }),
    ).toThrow(/Stale test-run summary/u);
    expect(() =>
      assertTestRunSummary(fixture.source.summary, {
        ...fixture.expected,
        commandId: "test:unit:migrations",
      }),
    ).toThrow(/command identity is mismatched/u);
    expect(() =>
      assertTestRunSummary(fixture.source.summary, {
        ...fixture.expected,
        candidate: { ...candidate, gitTree: "c".repeat(40) },
      }),
    ).toThrow(/candidate identity is mismatched/u);
  });

  it("revalidates receipt-bound bytes and rejects absent, malformed, or changed summaries", async () => {
    const fixture = await summaryFixture({
      runId: "receipt-bound",
      stageId: "candidate-unit",
      commandId: "test:unit:fast",
    });
    await expect(
      loadValidatedTestRunSummary({
        receipt: { artifacts: [] },
        expected: fixture.expected,
      }),
    ).rejects.toThrow(/exactly one validated test-run-summary/u);

    const malformedPath = resolve(fixture.root, "malformed-summary.json");
    await writeFile(malformedPath, "{\n", "utf8");
    const malformedContents = await readFile(malformedPath);
    await expect(
      loadValidatedTestRunSummary({
        receipt: {
          artifacts: [
            {
              path: malformedPath,
              kind: TEST_RUN_SUMMARY_KIND,
              bytes: malformedContents.byteLength,
              sha256: createHash("sha256")
                .update(malformedContents)
                .digest("hex"),
            },
          ],
        },
        expected: fixture.expected,
      }),
    ).rejects.toThrow(/artifact is malformed/u);

    await writeFile(fixture.source.path, "{}\n", "utf8");
    await expect(
      loadValidatedTestRunSummary({
        receipt: {
          artifacts: [
            {
              path: fixture.source.path,
              kind: TEST_RUN_SUMMARY_KIND,
              bytes: fixture.source.bytes,
              sha256: fixture.source.sha256,
            },
          ],
        },
        expected: fixture.expected,
      }),
    ).rejects.toThrow(/stale or hash-mismatched/u);
  });
});

describe("WP6 deterministic summary-only reducer", () => {
  it("is byte-semantic deterministic under input ordering", async () => {
    const left = await summaryFixture({
      runId: "run-left",
      stageId: "candidate-unit",
      commandId: "test:unit:fast",
    });
    const right = await summaryFixture({
      runId: "run-right",
      stageId: "wp6-shadow-partition",
      commandId: "test:partition:controller-runtime",
      role: "partition",
      owner: "controller-runtime",
    });
    const root = resolve(left.root, "..");
    const reduce = (
      sources: readonly ValidatedTestRunSummarySource[],
      expected: readonly TestRunSummaryExpectation[],
    ) =>
      reduceTestRunSummaries({
        sources,
        expected,
        candidate,
        relativePath: (path) => relative(root, path).replaceAll("\\", "/"),
      });
    const forward = reduce(
      [left.source, right.source],
      [left.expected, right.expected],
    );
    const reverse = reduce(
      [right.source, left.source],
      [right.expected, left.expected],
    );

    expect(reverse).toEqual(forward);
    expect(assertTestRunReduction(forward)).toEqual(forward);
    expect(validateJsonSchema202012(reductionSchema, forward)).toEqual({
      valid: true,
      errors: [],
    });
    expect(forward.inputs.map((item) => item.commandId)).toEqual([
      "test:unit:fast",
      "test:partition:controller-runtime",
    ]);
    expect(forward.nonSemantic.authorizesCutover).toBe(false);
  });

  it("rejects missing, unexpected, duplicate, and identity-mismatched input", async () => {
    const left = await summaryFixture({
      runId: "set-left",
      stageId: "candidate-unit",
      commandId: "test:unit:fast",
    });
    const right = await summaryFixture({
      runId: "set-right",
      stageId: "migration-unit",
      commandId: "test:unit:migrations",
    });
    const reduce = (
      sources: readonly ValidatedTestRunSummarySource[],
      expected: readonly TestRunSummaryExpectation[],
    ) =>
      reduceTestRunSummaries({
        sources,
        expected,
        candidate,
        relativePath: (path) =>
          relative(resolve(left.root, ".."), path).replaceAll("\\", "/"),
      });

    expect(() =>
      reduce([left.source], [left.expected, right.expected]),
    ).toThrow(/incomplete or unexpected.*missing=/u);
    expect(() => reduce([left.source, right.source], [left.expected])).toThrow(
      /incomplete or unexpected.*unexpected=/u,
    );
    expect(() => reduce([left.source, left.source], [left.expected])).toThrow(
      /Duplicate test-run summary identity/u,
    );
    expect(() =>
      reduce(
        [
          {
            ...left.source,
            summary: {
              ...left.source.summary,
              run: { ...left.source.summary.run, runId: "stale-copy" },
            },
          },
        ],
        [left.expected],
      ),
    ).toThrow(/incomplete or unexpected/u);
  });
});

describe("WP6 real process probe", () => {
  it("marks a persistent incomplete process record unavailable without changing passing test semantics", async () => {
    const root = await mkdtemp(join(tmpdir(), "test-run-probe-incomplete-"));
    roots.push(root);
    const reportPath = resolve(root, "vitest-report.json");
    await writeFile(
      reportPath,
      `${JSON.stringify(rawVitestReport(), null, 2)}\n`,
      "utf8",
    );
    const session = await beginTestRunMeasurement({
      artifactDirectory: root,
      runId: "probe-incomplete",
      stageId: "probe-fixture",
      commandId: "probe-fixture",
      role: "legacy",
      owner: null,
      identity: {
        ...candidate,
        nodeVersion: process.version,
        pnpmVersion: "11.15.1",
      },
    });
    session.markSetupFinished();
    session.observeProcessStartup(11n);
    const probeDirectory =
      session.probeEnvironment["MILESTONE_LOOP_TEST_RUN_PROBE_DIR"];
    if (!probeDirectory) throw new Error("Probe directory was not exposed.");
    await writeFile(
      resolve(probeDirectory, `probe-1-${"c".repeat(16)}.json.tmp`),
      "",
      "utf8",
    );

    const { summary } = await session.finish([
      await describeVitestReport({ artifactDirectory: root, reportPath }),
    ]);

    expect(summary.status).toBe("PASS");
    expect(summary.measurements.wallTime.availability).toBe("measured");
    expect(summary.measurements.testBodyTime.availability).toBe("measured");
    for (const measurement of [
      summary.measurements.gitFixtureTime,
      summary.measurements.processStartupTime,
      summary.measurements.cpuTime,
      summary.measurements.peakRss,
    ])
      expect(measurement).toMatchObject({
        availability: "unavailable",
        reason: "incomplete-instrumented-node-process-records",
      });
    expect(summary.probe).toEqual({
      availability: "unavailable",
      processCount: 0,
      synchronousLaunchCount: 0,
      recordsSha256: null,
      reason: "incomplete-instrumented-node-process-records",
    });
    expect(validateJsonSchema202012(summarySchema, summary)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("measures Git work, process startup, CPU, and peak RSS without changing command status", async () => {
    const root = await mkdtemp(join(tmpdir(), "test-run-probe-"));
    roots.push(root);
    const reportPath = resolve(root, "vitest-report.json");
    await writeFile(
      reportPath,
      `${JSON.stringify(rawVitestReport(), null, 2)}\n`,
      "utf8",
    );
    const session = await beginTestRunMeasurement({
      artifactDirectory: root,
      runId: "probe-integration",
      stageId: "probe-fixture",
      commandId: "probe-fixture",
      role: "legacy",
      owner: null,
      identity: {
        ...candidate,
        nodeVersion: process.version,
        pnpmVersion: "11.15.1",
      },
    });
    session.markSetupFinished();
    const command = await runCommand(
      {
        id: "probe-child",
        executable: "node",
        args: [
          "-e",
          "require('node:child_process').spawnSync('git', ['--version'], { stdio: 'ignore' });",
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: resolve("."),
        artifactDirectory: resolve(root, "logs"),
        timeoutMs: 30_000,
        trustedControllerCommand: true,
        extraEnvironment: session.probeEnvironment,
        processStartupObserver: (nanoseconds) =>
          session.observeProcessStartup(nanoseconds),
      },
    );
    expect(command.status).toBe("PASS");
    const { summary } = await session.finish([
      await describeVitestReport({ artifactDirectory: root, reportPath }),
    ]);

    expect(summary.measurements.gitFixtureTime).toMatchObject({
      availability: "measured",
      sampleCount: 1,
    });
    expect(
      BigInt(summary.measurements.gitFixtureTime.nanoseconds ?? "0"),
    ).toBeGreaterThan(0n);
    expect(summary.measurements.processStartupTime.availability).toBe(
      "measured",
    );
    expect(summary.measurements.cpuTime).toMatchObject({
      availability: "measured",
      processCount: 1,
    });
    expect(BigInt(summary.measurements.peakRss.bytes ?? "0")).toBeGreaterThan(
      0n,
    );
  });
});
