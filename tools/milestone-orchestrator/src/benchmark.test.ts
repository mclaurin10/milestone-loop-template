import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BENCHMARK_BROAD_SAFE_CHECK_IDS,
  BENCHMARK_CLASS_IDS,
  BENCHMARK_WORKTREE_GIT_CONFIG,
  assertBenchmarkEnvironmentManifest,
  assertBenchmarkMatrix,
  assertLoopBenchmark,
  benchmarkPlan,
  evaluateBenchmarkCriteria,
  loadBenchmarkMatrix,
  median,
  medianAbsoluteDeviation,
  parseBenchmarkCliArguments,
  type BenchmarkCandidateIdentity,
  type BenchmarkClassResult,
  type BenchmarkComparison,
  type BenchmarkExactClosure,
  type BenchmarkRunMeasurement,
  type LoopBenchmarkResult,
} from "./benchmark.js";
import { READINESS_VERIFICATION_STAGE_IDS } from "./contracts.js";
import {
  finalizeScopeSelection,
  recommendAffectedScope,
} from "./affected-scope.js";
import {
  loadVerificationManifest,
  loadVerificationScopePolicy,
} from "./config.js";
import { buildPackageGraph } from "./package-graph.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const baseline: BenchmarkCandidateIdentity = {
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  workingTreeDirty: false,
};
const candidate: BenchmarkCandidateIdentity = {
  commit: "c".repeat(40),
  tree: "d".repeat(40),
  workingTreeDirty: false,
};
const artifact = {
  fileCount: 1,
  totalBytes: 1,
  manifestSha256: "e".repeat(64),
} as const;

function exactClosure(): BenchmarkExactClosure {
  return {
    resultSha256: "f".repeat(64),
    resultBytes: 100,
    profileId: "readiness",
    selectedByOverride: false,
    status: "NOT_READY",
    exitCode: 2,
    completionEligible: false,
    disposition: "incremental-readiness",
    stageIds: READINESS_VERIFICATION_STAGE_IDS,
    stageStatuses: READINESS_VERIFICATION_STAGE_IDS.map((_, index) =>
      index < 5 ? "PASS" : "NOT_READY",
    ),
    passCount: 5,
    notReadyCount: 10,
    failCount: 0,
    errorCount: 0,
    validatedArtifactCount: 7,
    reconstructedArtifactBytes: 700,
  };
}

function run(input: {
  side: "before" | "after";
  index: number;
  durationMs: number;
  artifactBytes: number;
  actualCheckIds: readonly string[];
  exact?: boolean;
  selectionOnly?: boolean;
}): BenchmarkRunMeasurement {
  const telemetryMeasured = input.side === "after" && !input.selectionOnly;
  const commands = input.selectionOnly
    ? []
    : input.actualCheckIds.map((id) => ({
        id,
        argv: ["pnpm", id],
        status: input.exact ? ("NOT_READY" as const) : ("PASS" as const),
        exitCode: input.exact ? 2 : 0,
        durationMs: input.durationMs,
        stdout: {
          path: `artifacts/benchmarks/fixture/${input.side}-${input.index}-${id}-stdout.log`,
          sha256: "1".repeat(64),
          bytes: 1,
        },
        stderr: {
          path: `artifacts/benchmarks/fixture/${input.side}-${input.index}-${id}-stderr.log`,
          sha256: "2".repeat(64),
          bytes: 0,
        },
        receipt: null,
        receiptAbsenceReason: "Fixture command has no retained receipt.",
        testCounts: null,
        testCountAvailability: "not-applicable" as const,
        artifacts: { ...artifact, totalBytes: input.artifactBytes },
        telemetryOverheadNanoseconds: telemetryMeasured ? "0" : null,
        telemetryAvailability: telemetryMeasured
          ? ("measured" as const)
          : ("not-applicable-before-d032" as const),
      }));
  return {
    index: input.index,
    warmup: input.index === 0,
    side: input.side,
    candidate: input.side === "before" ? baseline : candidate,
    status: input.exact ? "NOT_READY" : "PASS",
    exitCode: input.exact ? 2 : 0,
    durationMs: input.durationMs,
    selectorPlanningDurationMs: 1,
    selectedCheckIds: input.actualCheckIds,
    actualCheckIds: input.actualCheckIds,
    fullClosureCheckIds: ["test-invariants", "exact-readiness"],
    commands,
    testCounts: null,
    testCountAvailability: "not-applicable",
    artifacts: { ...artifact, totalBytes: input.artifactBytes },
    selectorDifference: {
      recommendedOnlyCheckIds: [],
      omittedFromRecommendationActualCheckIds: [],
      falseNegativeCheckIds: [],
    },
    telemetryOverheadNanoseconds: telemetryMeasured ? "0" : null,
    telemetryAvailability: input.selectionOnly
      ? "not-applicable-selection-only"
      : telemetryMeasured
        ? "measured"
        : "not-applicable-before-d032",
    exactClosure: input.exact ? exactClosure() : null,
  };
}

function comparison(input: {
  id: BenchmarkComparison["id"];
  beforeMs: number;
  afterMs: number;
  afterChecks: readonly string[];
  exact?: boolean;
}): BenchmarkComparison {
  const beforeRuns = [0, 1, 2, 3].map((index) =>
    run({
      side: "before",
      index,
      durationMs: input.beforeMs,
      artifactBytes: 1_000,
      actualCheckIds: input.exact
        ? ["exact-readiness"]
        : ["test-unit", "typecheck", "build"],
      ...(input.exact === undefined ? {} : { exact: input.exact }),
      ...(input.id === "scope-expansion" ? { selectionOnly: true } : {}),
    }),
  );
  const afterRuns = [0, 1, 2, 3].map((index) =>
    run({
      side: "after",
      index,
      durationMs: input.afterMs,
      artifactBytes: 500,
      actualCheckIds: input.afterChecks,
      ...(input.exact === undefined ? {} : { exact: input.exact }),
      ...(input.id === "scope-expansion" ? { selectionOnly: true } : {}),
    }),
  );
  return {
    id: input.id,
    beforeRuns,
    afterRuns,
    beforeStatistics: {
      measuredRunCount: 3,
      medianMs: input.beforeMs,
      medianAbsoluteDeviationMs: 0,
      medianArtifactBytes: 1_000,
    },
    afterStatistics: {
      measuredRunCount: 3,
      medianMs: input.afterMs,
      medianAbsoluteDeviationMs: 0,
      medianArtifactBytes: 500,
    },
  };
}

function passingClasses(): readonly BenchmarkClassResult[] {
  return [
    {
      id: "leaf-ui-only",
      measurement: "command-workflows",
      paths: ["packages/ui/src/index.tsx"],
      comparisons: [
        comparison({
          id: "iteration",
          beforeMs: 100_000,
          afterMs: 60_000,
          afterChecks: ["test-invariants", "test-unit-fast", "build"],
        }),
        comparison({
          id: "candidate",
          beforeMs: 200_000,
          afterMs: 100_000,
          afterChecks: ["test-invariants", "test-unit-fast", "build"],
        }),
      ],
    },
    {
      id: "domain-local-simulation",
      measurement: "command-workflows",
      paths: ["packages/simulation/src/utilities.ts"],
      comparisons: [
        comparison({
          id: "iteration",
          beforeMs: 100_000,
          afterMs: 60_000,
          afterChecks: ["test-invariants", "test-unit-fast", "typecheck"],
        }),
      ],
    },
    ...(["shared-protocol-persistence", "worker-public-message"] as const).map(
      (id) => ({
        id,
        measurement: "selection-expansion" as const,
        paths: [`benchmark/${id}.ts`],
        comparisons: [
          comparison({
            id: "scope-expansion",
            beforeMs: 1,
            afterMs: 2,
            afterChecks: BENCHMARK_BROAD_SAFE_CHECK_IDS,
          }),
        ],
      }),
    ),
    {
      id: "milestone-closure",
      measurement: "exact-closure",
      paths: [".agent/completed/loop-recommissioning-verification.json"],
      comparisons: [
        comparison({
          id: "closure",
          beforeMs: 100_000,
          afterMs: 105_000,
          afterChecks: ["exact-readiness"],
          exact: true,
        }),
      ],
    },
  ];
}

describe("loop benchmark", () => {
  it("pins LF-stable long-path-aware Git worktree settings", () => {
    expect(BENCHMARK_WORKTREE_GIT_CONFIG).toEqual([
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.eol=lf",
      "-c",
      "core.longpaths=true",
    ]);
  });

  it("loads the exact commissioned matrix and refuses weakened bounds", async () => {
    const matrix = await loadBenchmarkMatrix(repositoryRoot);
    expect(matrix.value.classes.map((entry) => entry.id)).toEqual(
      BENCHMARK_CLASS_IDS,
    );
    expect(matrix.value).toEqual(assertBenchmarkMatrix(matrix.value));
    expect(() => assertBenchmarkMatrix({ ...matrix.value, repeat: 2 })).toThrow(
      /bounds/i,
    );
    expect(() =>
      assertBenchmarkMatrix({
        ...matrix.value,
        classes: matrix.value.classes.map((entry, index) =>
          index === 0 ? { ...entry, comparisons: ["iteration"] } : entry,
        ),
      }),
    ).toThrow(/contract/i);
  });

  it("parses only explicit non-duplicated benchmark options", () => {
    expect(parseBenchmarkCliArguments([])).toEqual({ planOnly: false });
    expect(parseBenchmarkCliArguments(["--plan", "--id", "d032-test"])).toEqual(
      { planOnly: true, benchmarkId: "d032-test" },
    );
    expect(
      parseBenchmarkCliArguments([
        "--baseline",
        "a".repeat(40),
        "--candidate",
        "HEAD",
        "--warmup",
        "1",
        "--repeat",
        "3",
      ]),
    ).toEqual({
      planOnly: false,
      baselineRevision: "a".repeat(40),
      candidateRevision: "HEAD",
      warmup: 1,
      repeat: 3,
    });
    expect(() => parseBenchmarkCliArguments(["--plan", "--plan"])).toThrow(
      /only once/i,
    );
    expect(() => parseBenchmarkCliArguments(["--id", "../escape"])).toThrow(
      /unsafe/i,
    );
    expect(() => parseBenchmarkCliArguments(["--unknown"])).toThrow(/unknown/i);
    expect(() => parseBenchmarkCliArguments(["--candidate", "main"])).toThrow(
      /candidate/i,
    );
  });

  it("computes median and median absolute deviation without invented samples", () => {
    expect(median([1, 5, 3])).toBe(3);
    expect(median([1, 3, 5, 7])).toBe(4);
    expect(medianAbsoluteDeviation([10, 10, 12])).toBe(0);
    expect(() => median([])).toThrow(/finite measurements/i);
    expect(() => median([1, Number.NaN])).toThrow(/finite measurements/i);
  });

  it("validates exact pinned environment manifests and setup exclusion", () => {
    const tracked = {
      path: "package.json",
      sha256: "1".repeat(64),
      bytes: 10,
    } as const;
    const environment = {
      schemaVersion: "1.0.0",
      side: "before",
      candidate: baseline,
      nodeVersion: "v24.18.0",
      pnpmVersion: "11.15.1",
      platform: "win32",
      architecture: "x64",
      preparation: {
        worktreeIdentity: "before",
        setupStartedAt: "2026-08-04T00:00:00.000Z",
        setupFinishedAt: "2026-08-04T00:00:01.000Z",
        setupDurationMs: 1_000,
        installDurationMs: 900,
        installStatus: "PASS",
        checkoutPolicy: "lf-longpaths.v1",
        includedInCheckWallTime: false,
      },
      packageJson: tracked,
      lockfile: { ...tracked, path: "pnpm-lock.yaml" },
      protectedFiles: [{ ...tracked, path: "PROJECT_GOAL.md" }],
    } as const;
    expect(assertBenchmarkEnvironmentManifest(environment)).toEqual(
      environment,
    );
    expect(() =>
      assertBenchmarkEnvironmentManifest({
        ...environment,
        nodeVersion: "v25.0.0",
      }),
    ).toThrow(/environment manifest/i);
    expect(() =>
      assertBenchmarkEnvironmentManifest({
        ...environment,
        preparation: {
          ...environment.preparation,
          checkoutPolicy: "ambient-git-config",
        },
      }),
    ).toThrow(/environment manifest/i);
    expect(() =>
      assertBenchmarkEnvironmentManifest({
        ...environment,
        preparation: {
          ...environment.preparation,
          includedInCheckWallTime: true,
        },
      }),
    ).toThrow(/environment manifest/i);
  });

  it("binds the plan to the tracked baseline and reports dirty state honestly", async () => {
    const [plan, manifest] = await Promise.all([
      benchmarkPlan(repositoryRoot),
      loadVerificationManifest(repositoryRoot),
    ]);
    expect(plan.matrixId).toBe(manifest.value.requiredBenchmarkMatrixId);
    expect(plan.baselineCommit).toBe(manifest.value.d031BaselineCommit);
    expect(plan.classIds).toEqual(BENCHMARK_CLASS_IDS);
    expect(plan.warmup).toBe(1);
    expect(plan.repeat).toBe(3);
    expect(typeof plan.workingTreeDirty).toBe("boolean");
  });

  it("keeps narrow recommendations narrow and expands risky plus unknown paths", async () => {
    const [matrix, manifest, policy, graph] = await Promise.all([
      loadBenchmarkMatrix(repositoryRoot),
      loadVerificationManifest(repositoryRoot),
      loadVerificationScopePolicy(repositoryRoot),
      buildPackageGraph(repositoryRoot),
    ]);
    const identity = {
      baseCommit: manifest.value.d031BaselineCommit,
      gitCommit: "a".repeat(40),
      gitTree: "b".repeat(40),
      workingTreeDirty: false,
    };
    const recommendations = new Map(
      matrix.value.classes.slice(0, 4).map((entry) => {
        const recommendation = recommendAffectedScope({
          changedPaths: entry.paths,
          changedPathSource: { kind: "fixture", fixtureId: entry.id },
          candidate: identity,
          manifest: manifest.value,
          policy: policy.value,
          policySha256: policy.sha256,
          packageGraph: graph,
        });
        return [
          entry.id,
          finalizeScopeSelection(recommendation, {
            actualCheckIds: recommendation.recommendedCheckIds,
            failingActualCheckIds: [],
          }),
        ] as const;
      }),
    );
    for (const id of ["leaf-ui-only", "domain-local-simulation"] as const) {
      const selection = recommendations.get(id);
      expect(selection?.actualCheckIds).not.toContain("test-unit");
      expect(selection?.actualCheckIds).not.toContain("test-unit-migrations");
    }
    for (const id of [
      "shared-protocol-persistence",
      "worker-public-message",
    ] as const) {
      const selection = recommendations.get(id);
      for (const check of BENCHMARK_BROAD_SAFE_CHECK_IDS)
        expect(selection?.actualCheckIds, `${id}/${check}`).toContain(check);
    }
    const unknownRecommendation = recommendAffectedScope({
      changedPaths: matrix.value.unknownProbePaths,
      changedPathSource: { kind: "fixture", fixtureId: "unknown" },
      candidate: identity,
      manifest: manifest.value,
      policy: policy.value,
      policySha256: policy.sha256,
      packageGraph: graph,
    });
    expect(unknownRecommendation.unknownPaths).toEqual(
      matrix.value.unknownProbePaths,
    );
    for (const check of BENCHMARK_BROAD_SAFE_CHECK_IDS)
      expect(unknownRecommendation.recommendedCheckIds).toContain(check);
  });

  it("evaluates every material/noise/safety criterion from raw comparisons", async () => {
    const matrix = (await loadBenchmarkMatrix(repositoryRoot)).value;
    const classes = passingClasses();
    const shadowFixtureMatrix = {
      fixtureCount: 17,
      falseNegativeCheckIds: [],
      unknownPaths: [],
      deterministic: true,
    } as const;
    const unknownExpansion = {
      paths: matrix.unknownProbePaths,
      matchedUnknown: true,
      broadSafeCheckIds: BENCHMARK_BROAD_SAFE_CHECK_IDS,
      selectedCheckIds: BENCHMARK_BROAD_SAFE_CHECK_IDS,
      missingBroadCheckIds: [],
    } as const;
    const protectedComparison = {
      matched: true,
      paths: [
        {
          path: "PROJECT_GOAL.md",
          baselineSha256: "1".repeat(64),
          candidateSha256: "1".repeat(64),
          matches: true,
        },
      ],
    } as const;
    const criteria = evaluateBenchmarkCriteria({
      matrix,
      classes,
      shadowFixtureMatrix,
      unknownExpansion,
      protectedComparison,
      telemetryManifestBytes: 10,
      inventoryBytes: 10,
    });
    expect(criteria).toHaveLength(11);
    expect(criteria.every((criterion) => criterion.passed)).toBe(true);

    const tracked = {
      path: "artifacts/benchmarks/fixture/file.json",
      sha256: "2".repeat(64),
      bytes: 10,
    } as const;
    const result: LoopBenchmarkResult = {
      schemaVersion: "1.0.0",
      benchmarkId: "benchmark-fixture",
      matrix: { ...tracked, id: "d032-loop-efficiency.v1" },
      status: "PASS",
      startedAt: "2026-08-04T00:00:00.000Z",
      finishedAt: "2026-08-04T00:01:00.000Z",
      baselineManifest: tracked,
      candidateManifest: tracked,
      baseline,
      candidate,
      serial: true,
      warmupRunsPerSideAndClass: 1,
      measuredRunsPerSideAndClass: 3,
      classes,
      shadowFixtureMatrix,
      unknownExpansion,
      protectedComparison,
      telemetry: {
        manifestPath: tracked.path,
        manifestSha256: tracked.sha256,
        manifestBytes: tracked.bytes,
        overheadAvailability: "measured",
      },
      inventory: {
        referencedPath: tracked.path,
        sha256: tracked.sha256,
        bytes: tracked.bytes,
        timing: "pre-benchmark",
        postBenchmarkRefreshRequired: true,
      },
      reportingGrowth: {
        baselineManifestBytes: 10,
        candidateManifestBytes: 10,
        summaryBytes: 10,
        benchmarkJsonBytes: null,
        benchmarkJsonBytesReason: "self-referential-report-size",
      },
      criteria,
      failures: [],
    };
    expect(assertLoopBenchmark(result)).toEqual(result);
    const drifted = structuredClone(result) as unknown as {
      classes: Array<{
        comparisons: Array<{
          afterStatistics: { medianMs: number };
          afterRuns: Array<{
            exactClosure: { stageIds: string[] } | null;
          }>;
        }>;
      }>;
    };
    drifted.classes[0]!.comparisons[0]!.afterStatistics.medianMs += 1;
    expect(() => assertLoopBenchmark(drifted)).toThrow(/statistics/i);
    const reordered = structuredClone(result) as unknown as {
      classes: Array<{
        comparisons: Array<{
          afterRuns: Array<{
            exactClosure: { stageIds: string[] } | null;
          }>;
        }>;
      }>;
    };
    reordered.classes[4]!.comparisons[0]!.afterRuns[0]!.exactClosure!.stageIds =
      [...READINESS_VERIFICATION_STAGE_IDS].reverse();
    expect(() => assertLoopBenchmark(reordered)).toThrow(/comparison/i);

    const inventedCriterion = structuredClone(result) as unknown as {
      criteria: Array<{ id: string; passed: boolean; summary: string }>;
      status: "PASS" | "FAIL";
      failures: string[];
    };
    inventedCriterion.criteria[0] = {
      ...inventedCriterion.criteria[0]!,
      passed: false,
      summary: "Invented benchmark conclusion.",
    };
    inventedCriterion.status = "FAIL";
    inventedCriterion.failures = [inventedCriterion.criteria[0]!.id];
    expect(() => assertLoopBenchmark(inventedCriterion)).toThrow(
      /raw evidence/i,
    );

    const malformedSupport = structuredClone(result) as unknown as {
      unknownExpansion: { missingBroadCheckIds: string[] };
    };
    malformedSupport.unknownExpansion.missingBroadCheckIds = ["typecheck"];
    expect(() => assertLoopBenchmark(malformedSupport)).toThrow(
      /supporting evidence/i,
    );
  });
});
