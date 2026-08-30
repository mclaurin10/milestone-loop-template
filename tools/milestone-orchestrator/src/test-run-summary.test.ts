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
  writeTestRunReduction,
  type TestRunCandidate,
  type TestRunReduction,
  type TestRunRole,
  type TestRunSummary,
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
  readonly instrumentedChild?: "node" | "git";
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
  if (input.instrumentedChild) {
    const command = await runCommand(
      {
        id: `summary-${input.runId}`,
        executable: "node",
        args: [
          "-e",
          input.instrumentedChild === "git"
            ? "require('node:child_process').spawnSync('git', ['--version'], { stdio: 'ignore' });"
            : "process.exit(0);",
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
    if (command.status !== "PASS")
      throw new Error(
        `Instrumented summary fixture failed: ${command.status}.`,
      );
  } else {
    session.observeProcessStartup(7n);
  }
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

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new Error("Test canonical JSON cannot encode undefined values.");
  return serialized;
}

function refreshContentHash(value: { contentSha256: string }): void {
  const content = structuredClone(value) as unknown as Record<string, unknown>;
  delete content["contentSha256"];
  value.contentSha256 = createHash("sha256")
    .update(canonicalJson(content))
    .digest("hex");
}

async function writeSummaryMutation(input: {
  readonly fixture: Awaited<ReturnType<typeof summaryFixture>>;
  readonly name: string;
  readonly mutate: (summary: Mutable<TestRunSummary>) => void;
}): Promise<ValidatedTestRunSummarySource> {
  const summary = structuredClone(
    input.fixture.source.summary,
  ) as Mutable<TestRunSummary>;
  input.mutate(summary);
  refreshContentHash(summary);
  const path = resolve(input.fixture.root, `${input.name}.json`);
  const contents = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(path, contents);
  return {
    path,
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
    summary,
  };
}

async function expectSummaryMutationRejected(input: {
  readonly fixture: Awaited<ReturnType<typeof summaryFixture>>;
  readonly name: string;
  readonly mutate: (summary: Mutable<TestRunSummary>) => void;
  readonly message: RegExp;
}): Promise<void> {
  const source = await writeSummaryMutation(input);
  await expect(
    loadValidatedTestRunSummary({
      receipt: {
        artifacts: [
          {
            path: source.path,
            kind: TEST_RUN_SUMMARY_KIND,
            bytes: source.bytes,
            sha256: source.sha256,
          },
        ],
      },
      expected: input.fixture.expected,
    }),
  ).rejects.toThrow(input.message);
  expect(() =>
    reduceTestRunSummaries({
      sources: [source],
      expected: [input.fixture.expected],
      candidate,
      relativePath: (path) =>
        relative(input.fixture.root, path).replaceAll("\\", "/"),
    }),
  ).toThrow(input.message);
}

async function loadFixtureSource(
  fixture: Awaited<ReturnType<typeof summaryFixture>>,
): Promise<ValidatedTestRunSummarySource> {
  return loadValidatedTestRunSummary({
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
  });
}

function reduceFixtures(
  fixtures: readonly Awaited<ReturnType<typeof summaryFixture>>[],
): TestRunReduction {
  return reduceTestRunSummaries({
    sources: fixtures.map((fixture) => fixture.source),
    expected: fixtures.map((fixture) => fixture.expected),
    candidate,
    relativePath: (path) => relative(tmpdir(), path).replaceAll("\\", "/"),
  });
}

async function expectReductionMutationRejected(input: {
  readonly reduction: TestRunReduction;
  readonly root: string;
  readonly name: string;
  readonly mutate: (reduction: Mutable<TestRunReduction>) => void;
  readonly message: RegExp;
}): Promise<void> {
  const reduction = structuredClone(
    input.reduction,
  ) as Mutable<TestRunReduction>;
  input.mutate(reduction);
  refreshContentHash(reduction);
  const path = resolve(input.root, `${input.name}.json`);
  await expect(writeTestRunReduction(path, reduction)).rejects.toThrow(
    input.message,
  );
  await writeFile(path, `${JSON.stringify(reduction, null, 2)}\n`, "utf8");
  const reloaded = JSON.parse(await readFile(path, "utf8")) as unknown;
  expect(() => assertTestRunReduction(reloaded)).toThrow(input.message);
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
          availability: "unavailable",
          reason: "no-instrumented-node-process-records",
        },
        testBodyTime: {
          availability: "unavailable",
          reason: "no-instrumented-node-process-records",
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

  it("accepts truthful unavailable and zero-Git producer boundaries through load and reduction", async () => {
    const unavailable = await summaryFixture({
      runId: "summary-boundary-unavailable",
      stageId: "candidate-unit",
      commandId: "test:unit:unavailable-boundary",
    });
    const zeroGit = await summaryFixture({
      runId: "summary-boundary-zero-git",
      stageId: "candidate-unit",
      commandId: "test:unit:zero-git-boundary",
      instrumentedChild: "node",
    });
    const unavailableSource = await loadFixtureSource(unavailable);
    const zeroGitSource = await loadFixtureSource(zeroGit);

    expect(unavailableSource.summary.probe).toMatchObject({
      availability: "unavailable",
      processCount: 0,
      synchronousLaunchCount: 0,
    });
    for (const measurement of [
      unavailableSource.summary.measurements.gitFixtureTime,
      unavailableSource.summary.measurements.processStartupTime,
      unavailableSource.summary.measurements.testBodyTime,
      unavailableSource.summary.measurements.cpuTime,
      unavailableSource.summary.measurements.peakRss,
    ])
      expect(measurement.availability).toBe("unavailable");

    expect(zeroGitSource.summary.measurements.gitFixtureTime).toEqual({
      availability: "measured",
      nanoseconds: "0",
      sampleCount: 0,
      reason: null,
    });
    expect(zeroGitSource.summary.measurements.processStartupTime).toMatchObject(
      { availability: "measured", sampleCount: 1 },
    );
    expect(zeroGitSource.summary.measurements.testBodyTime).toMatchObject({
      availability: "measured",
      sampleCount: 1,
    });
    expect(zeroGitSource.summary.measurements.cpuTime.processCount).toBe(
      zeroGitSource.summary.probe.processCount,
    );
    expect(zeroGitSource.summary.measurements.peakRss.processCount).toBe(
      zeroGitSource.summary.probe.processCount,
    );

    for (const [fixture, source] of [
      [unavailable, unavailableSource],
      [zeroGit, zeroGitSource],
    ] as const)
      expect(() =>
        reduceTestRunSummaries({
          sources: [source],
          expected: [fixture.expected],
          candidate,
          relativePath: (path) =>
            relative(fixture.root, path).replaceAll("\\", "/"),
        }),
      ).not.toThrow();
  });

  it("rejects false measured-duration sample coverage through load and reduction", async () => {
    const fixture = await summaryFixture({
      runId: "summary-duration-contradictions",
      stageId: "candidate-unit",
      commandId: "test:unit:duration-contradictions",
    });

    await expectSummaryMutationRejected({
      fixture,
      name: "wall-zero-samples",
      mutate: (summary) => {
        summary.measurements.wallTime.sampleCount = 0;
      },
      message: /Wall-time measured values require at least one sample/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "setup-zero-samples",
      mutate: (summary) => {
        summary.measurements.setupTime.sampleCount = 0;
      },
      message: /Setup-time measured values require at least one sample/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "startup-zero-samples",
      mutate: (summary) => {
        summary.measurements.processStartupTime = {
          availability: "measured",
          nanoseconds: "1",
          sampleCount: 0,
          reason: null,
        };
      },
      message: /Process-startup measured values require at least one sample/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "test-body-zero-samples",
      mutate: (summary) => {
        summary.measurements.testBodyTime = {
          availability: "measured",
          nanoseconds: "1",
          sampleCount: 0,
          reason: null,
        };
      },
      message: /Test-body measured values require at least one sample/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "git-zero-samples-nonzero-time",
      mutate: (summary) => {
        summary.measurements.gitFixtureTime = {
          availability: "measured",
          nanoseconds: "1",
          sampleCount: 0,
          reason: null,
        };
      },
      message: /Git-fixture time with zero samples must be zero/u,
    });
  });

  it("rejects unavailable-probe measurement contradictions through load and reduction", async () => {
    const fixture = await summaryFixture({
      runId: "summary-unavailable-probe-contradictions",
      stageId: "candidate-unit",
      commandId: "test:unit:unavailable-probe-contradictions",
    });

    await expectSummaryMutationRejected({
      fixture,
      name: "unavailable-probe-sync-launch",
      mutate: (summary) => {
        summary.probe.synchronousLaunchCount = 1;
      },
      message: /Unavailable probe identity is contradictory/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "unavailable-probe-measured-git",
      mutate: (summary) => {
        summary.measurements.gitFixtureTime = {
          availability: "measured",
          nanoseconds: "0",
          sampleCount: 0,
          reason: null,
        };
      },
      message:
        /Unavailable probe cannot support measured observations: gitFixtureTime/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "unavailable-probe-measured-startup",
      mutate: (summary) => {
        summary.measurements.processStartupTime = {
          availability: "measured",
          nanoseconds: "1",
          sampleCount: 1,
          reason: null,
        };
      },
      message:
        /Unavailable probe cannot support measured observations: processStartupTime/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "unavailable-probe-measured-test-body",
      mutate: (summary) => {
        summary.measurements.testBodyTime = {
          availability: "measured",
          nanoseconds: "1",
          sampleCount: 1,
          reason: null,
        };
      },
      message:
        /Unavailable probe cannot support measured observations: testBodyTime/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "unavailable-probe-measured-cpu",
      mutate: (summary) => {
        summary.measurements.cpuTime = {
          availability: "measured",
          userMicroseconds: "0",
          systemMicroseconds: "0",
          totalMicroseconds: "0",
          processCount: 1,
          reason: null,
        };
      },
      message:
        /Unavailable probe cannot support measured observations: cpuTime/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "unavailable-probe-measured-rss",
      mutate: (summary) => {
        summary.measurements.peakRss = {
          availability: "measured",
          bytes: "0",
          processCount: 1,
          aggregation: "maximum-instrumented-process-peak",
          reason: null,
        };
      },
      message:
        /Unavailable probe cannot support measured observations: peakRss/u,
    });
  });

  it("rejects CPU and RSS coverage that differs from the measured probe", async () => {
    const fixture = await summaryFixture({
      runId: "summary-process-coverage",
      stageId: "candidate-unit",
      commandId: "test:unit:process-coverage",
      instrumentedChild: "node",
    });

    await expectSummaryMutationRejected({
      fixture,
      name: "cpu-process-coverage",
      mutate: (summary) => {
        summary.measurements.cpuTime.processCount =
          summary.probe.processCount + 1;
      },
      message: /CPU process coverage contradicts the measured probe/u,
    });
    await expectSummaryMutationRejected({
      fixture,
      name: "rss-process-coverage",
      mutate: (summary) => {
        summary.measurements.peakRss.processCount =
          summary.probe.processCount + 1;
      },
      message: /Peak RSS process coverage contradicts the measured probe/u,
    });
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

  it("writes, reloads, and accepts producer-consistent reduction boundaries", async () => {
    const unavailable = await summaryFixture({
      runId: "reduction-boundary-unavailable",
      stageId: "candidate-unit",
      commandId: "test:unit:reduction-unavailable",
    });
    const measured = await summaryFixture({
      runId: "reduction-boundary-measured",
      stageId: "candidate-unit",
      commandId: "test:unit:reduction-measured",
      instrumentedChild: "node",
    });
    const allUnavailable = reduceFixtures([unavailable]);
    const mixed = reduceFixtures([unavailable, measured]);
    const path = resolve(unavailable.root, "accepted-reduction.json");

    expect(allUnavailable.measurements.gitFixtureTime).toMatchObject({
      measuredCount: 0,
      unavailableCount: 1,
      totalNanoseconds: "0",
      sampleCount: 0,
    });
    expect(allUnavailable.measurements.cpuTime).toMatchObject({
      measuredCount: 0,
      userMicroseconds: "0",
      systemMicroseconds: "0",
      totalMicroseconds: "0",
    });
    expect(mixed.measurements.gitFixtureTime).toMatchObject({
      measuredCount: 1,
      unavailableCount: 1,
      totalNanoseconds: "0",
      sampleCount: 0,
    });
    await writeTestRunReduction(path, mixed);
    const reloaded = JSON.parse(await readFile(path, "utf8")) as unknown;
    expect(assertTestRunReduction(reloaded)).toEqual(mixed);
    expect(validateJsonSchema202012(reductionSchema, reloaded)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects disposition rows that contradict counters or input count", async () => {
    const fixture = await summaryFixture({
      runId: "reduction-disposition-contradictions",
      stageId: "candidate-unit",
      commandId: "test:unit:reduction-dispositions",
    });
    const reduction = reduceFixtures([fixture]);

    await expectReductionMutationRejected({
      reduction,
      root: fixture.root,
      name: "duration-disposition-availability",
      mutate: (value) => {
        const row = value.measurements.wallTime.dispositions[0];
        if (!row) throw new Error("Duration disposition fixture disappeared.");
        row.availability = "unavailable";
        row.reason = "mutated-disposition";
      },
      message:
        /Reduction wallTime dispositions contradict counters or input count/u,
    });
    await expectReductionMutationRejected({
      reduction,
      root: fixture.root,
      name: "cpu-disposition-count",
      mutate: (value) => {
        const row = value.measurements.cpuTime.dispositions[0];
        if (!row) throw new Error("CPU disposition fixture disappeared.");
        row.count = 2;
      },
      message: /Reduction CPU dispositions contradict counters or input count/u,
    });
    await expectReductionMutationRejected({
      reduction,
      root: fixture.root,
      name: "rss-disposition-count",
      mutate: (value) => {
        const row = value.measurements.peakRss.dispositions[0];
        if (!row) throw new Error("RSS disposition fixture disappeared.");
        row.count = 2;
      },
      message: /Reduction RSS dispositions contradict counters or input count/u,
    });
  });

  it("rejects nonzero aggregates with zero measured inputs", async () => {
    const fixture = await summaryFixture({
      runId: "reduction-zero-measured-contradictions",
      stageId: "candidate-unit",
      commandId: "test:unit:reduction-zero-measured",
    });
    const reduction = reduceFixtures([fixture]);

    await expectReductionMutationRejected({
      reduction,
      root: fixture.root,
      name: "duration-zero-measured-total",
      mutate: (value) => {
        value.measurements.gitFixtureTime.totalNanoseconds = "1";
      },
      message:
        /Reduction gitFixtureTime totals contradict zero measured inputs/u,
    });
    await expectReductionMutationRejected({
      reduction,
      root: fixture.root,
      name: "duration-zero-measured-samples",
      mutate: (value) => {
        value.measurements.gitFixtureTime.sampleCount = 1;
      },
      message:
        /Reduction gitFixtureTime totals contradict zero measured inputs/u,
    });
    await expectReductionMutationRejected({
      reduction,
      root: fixture.root,
      name: "cpu-zero-measured-total",
      mutate: (value) => {
        value.measurements.cpuTime.userMicroseconds = "1";
        value.measurements.cpuTime.totalMicroseconds = "1";
      },
      message: /Reduction CPU totals contradict zero measured inputs/u,
    });
  });

  it("rejects reduction owners that contradict legacy and partition roles", async () => {
    const legacy = await summaryFixture({
      runId: "reduction-owner-legacy",
      stageId: "candidate-unit",
      commandId: "test:unit:reduction-owner-legacy",
    });
    const legacyExtra = await summaryFixture({
      runId: "reduction-owner-legacy-extra",
      stageId: "candidate-unit",
      commandId: "test:unit:reduction-owner-legacy-extra",
      role: "legacy-extra",
      owner: null,
    });
    const partition = await summaryFixture({
      runId: "reduction-owner-partition",
      stageId: "wp6-shadow-partition",
      commandId: "test:partition:controller-runtime",
      role: "partition",
      owner: "controller-runtime",
    });

    for (const [fixture, name] of [
      [legacy, "legacy-owner"],
      [legacyExtra, "legacy-extra-owner"],
    ] as const) {
      const reduction = reduceFixtures([fixture]);
      await expectReductionMutationRejected({
        reduction,
        root: fixture.root,
        name,
        mutate: (value) => {
          const reductionInput = value.inputs[0];
          if (!reductionInput)
            throw new Error("Reduction input fixture disappeared.");
          reductionInput.owner = "controller-runtime";
        },
        message: /Reduction input 0 owner contradicts its role/u,
      });
    }

    const partitionReduction = reduceFixtures([partition]);
    await expectReductionMutationRejected({
      reduction: partitionReduction,
      root: partition.root,
      name: "partition-owner",
      mutate: (value) => {
        const reductionInput = value.inputs[0];
        if (!reductionInput)
          throw new Error("Reduction input fixture disappeared.");
        reductionInput.owner = null;
      },
      message: /Reduction input 0 owner contradicts its role/u,
    });
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
    for (const measurement of [
      summary.measurements.gitFixtureTime,
      summary.measurements.processStartupTime,
      summary.measurements.testBodyTime,
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
