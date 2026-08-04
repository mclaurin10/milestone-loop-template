import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";

import {
  READINESS_VERIFICATION_STAGE_IDS,
  type VerificationCommand,
  type VerificationManifest,
  type VerificationTestCounts,
} from "./contracts.js";
import {
  buildScopeCheckCatalogue,
  finalizeScopeSelection,
  orderScopeCheckIds,
  recommendAffectedScope,
  scopeSelectionBytes,
  type AffectedScopeRecommendation,
  type ScopeCheckDefinition,
  type ScopeCheckCatalogue,
  type ScopeSelectionResult,
} from "./affected-scope.js";
import {
  loadConfig,
  loadVerificationManifest,
  loadVerificationScopePolicy,
} from "./config.js";
import { resolvePnpmScript, runCommand } from "./command-runner.js";
import { assertArtifactInventory } from "./artifact-inventory.js";
import { parseVitestCounts } from "./invariant-suite.js";
import {
  inspectReadinessLifecycle,
  readinessHistoryEvidenceForCandidate,
} from "./orchestrator.js";
import { buildPackageGraph, canonicalJson } from "./package-graph.js";
import type { PackageGraphSnapshot } from "./package-graph.js";
import { atomicWriteJson, StateStore } from "./state-store.js";
import { TelemetryStore } from "./telemetry-store.js";
import { planVerificationTier } from "./verification-tier.js";
import {
  parseAuthoritativeVerification,
  validateCommandReceiptDirectory,
} from "./verifier.js";

export const BENCHMARK_SCHEMA_VERSION = "1.0.0" as const;
export const DEFAULT_BENCHMARK_MATRIX_PATH =
  "tools/milestone-orchestrator/config/benchmark-matrix.json";

export const BENCHMARK_WORKTREE_GIT_CONFIG = [
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.eol=lf",
  "-c",
  "core.longpaths=true",
] as const;

export const BENCHMARK_CLASS_IDS = [
  "leaf-ui-only",
  "domain-local-simulation",
  "shared-protocol-persistence",
  "worker-public-message",
  "milestone-closure",
] as const;
export type BenchmarkClassId = (typeof BENCHMARK_CLASS_IDS)[number];

export const BENCHMARK_COMPARISON_IDS = [
  "iteration",
  "candidate",
  "scope-expansion",
  "closure",
] as const;
export type BenchmarkComparisonId = (typeof BENCHMARK_COMPARISON_IDS)[number];

export const BENCHMARK_CRITERION_IDS = [
  "leaf-iteration-material-improvement",
  "domain-iteration-material-improvement",
  "leaf-candidate-material-improvement",
  "narrow-runs-exclude-full-and-migration-units",
  "narrow-runs-reduce-artifact-bytes",
  "risky-and-unknown-paths-expand-broad",
  "exact-closure-integrity",
  "exact-closure-runtime-within-noise",
  "shadow-fixtures-have-zero-false-negatives",
  "protected-hashes-match",
  "telemetry-and-inventory-growth-disclosed",
] as const;

const COMMISSIONED_BENCHMARK_THRESHOLDS = {
  minimumImprovementMs: 10_000,
  noiseMultiplier: 2,
  maximumClosureRegressionMs: 15_000,
} as const;

export type BenchmarkMeasurement =
  "command-workflows" | "selection-expansion" | "exact-closure";

export interface BenchmarkMatrixClass {
  readonly id: BenchmarkClassId;
  readonly measurement: BenchmarkMeasurement;
  readonly comparisons: readonly BenchmarkComparisonId[];
  readonly paths: readonly string[];
  readonly mustExclude: readonly string[];
}

export interface BenchmarkMatrix {
  readonly schemaVersion: "1.0.0";
  readonly id: "d032-loop-efficiency.v1";
  readonly serial: true;
  readonly warmup: 1;
  readonly repeat: 3;
  readonly thresholds: typeof COMMISSIONED_BENCHMARK_THRESHOLDS;
  readonly unknownProbePaths: readonly string[];
  readonly historical: {
    readonly fullSafeCheckIds: readonly string[];
    readonly iterationCheckIdsByClass: Readonly<
      Partial<Record<BenchmarkClassId, readonly string[]>>
    >;
  };
  readonly classes: readonly BenchmarkMatrixClass[];
}

export interface BenchmarkTrackedFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface BenchmarkCandidateIdentity {
  readonly commit: string;
  readonly tree: string;
  readonly workingTreeDirty: false;
}

export interface BenchmarkEnvironmentManifest {
  readonly schemaVersion: "1.0.0";
  readonly side: "before" | "after";
  readonly candidate: BenchmarkCandidateIdentity;
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly platform: string;
  readonly architecture: string;
  readonly preparation: {
    readonly worktreeIdentity: string;
    readonly setupStartedAt: string;
    readonly setupFinishedAt: string;
    readonly setupDurationMs: number;
    readonly installDurationMs: number;
    readonly installStatus: "PASS";
    readonly checkoutPolicy: "lf-longpaths.v1";
    readonly includedInCheckWallTime: false;
  };
  readonly packageJson: BenchmarkTrackedFile;
  readonly lockfile: BenchmarkTrackedFile;
  readonly protectedFiles: readonly BenchmarkTrackedFile[];
}

export interface BenchmarkArtifactMeasurement {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly manifestSha256: string;
}

export interface BenchmarkCommandMeasurement {
  readonly id: string;
  readonly argv: readonly string[];
  readonly status: "PASS" | "NOT_READY";
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdout: BenchmarkTrackedFile;
  readonly stderr: BenchmarkTrackedFile;
  readonly receipt: Omit<BenchmarkTrackedFile, "path"> | null;
  readonly receiptAbsenceReason: string | null;
  readonly testCounts: VerificationTestCounts | null;
  readonly testCountAvailability:
    "measured" | "not-recorded-baseline-command" | "not-applicable";
  readonly artifacts: BenchmarkArtifactMeasurement;
  readonly telemetryOverheadNanoseconds: string | null;
  readonly telemetryAvailability: "measured" | "not-applicable-before-d032";
}

export interface BenchmarkExactClosure {
  readonly resultSha256: string;
  readonly resultBytes: number;
  readonly profileId: "readiness";
  readonly selectedByOverride: false;
  readonly status: "NOT_READY";
  readonly exitCode: 2;
  readonly completionEligible: false;
  readonly disposition: "incremental-readiness";
  readonly stageIds: readonly string[];
  readonly stageStatuses: readonly ("PASS" | "NOT_READY")[];
  readonly passCount: 5;
  readonly notReadyCount: 10;
  readonly failCount: 0;
  readonly errorCount: 0;
  readonly validatedArtifactCount: number;
  readonly reconstructedArtifactBytes: number;
}

export interface BenchmarkRunMeasurement {
  readonly index: number;
  readonly warmup: boolean;
  readonly side: "before" | "after";
  readonly candidate: BenchmarkCandidateIdentity;
  readonly status: "PASS" | "NOT_READY";
  readonly exitCode: 0 | 2;
  readonly durationMs: number;
  readonly selectorPlanningDurationMs: number;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
  readonly fullClosureCheckIds: readonly string[];
  readonly commands: readonly BenchmarkCommandMeasurement[];
  readonly testCounts: VerificationTestCounts | null;
  readonly testCountAvailability: "measured" | "not-applicable";
  readonly artifacts: BenchmarkArtifactMeasurement;
  readonly selectorDifference: {
    readonly recommendedOnlyCheckIds: readonly string[];
    readonly omittedFromRecommendationActualCheckIds: readonly string[];
    readonly falseNegativeCheckIds: readonly string[];
  };
  readonly telemetryOverheadNanoseconds: string | null;
  readonly telemetryAvailability:
    "measured" | "not-applicable-before-d032" | "not-applicable-selection-only";
  readonly exactClosure: BenchmarkExactClosure | null;
}

export interface BenchmarkStatistics {
  readonly measuredRunCount: 3;
  readonly medianMs: number;
  readonly medianAbsoluteDeviationMs: number;
  readonly medianArtifactBytes: number;
}

export interface BenchmarkComparison {
  readonly id: BenchmarkComparisonId;
  readonly beforeRuns: readonly BenchmarkRunMeasurement[];
  readonly afterRuns: readonly BenchmarkRunMeasurement[];
  readonly beforeStatistics: BenchmarkStatistics;
  readonly afterStatistics: BenchmarkStatistics;
}

export interface BenchmarkClassResult {
  readonly id: BenchmarkClassId;
  readonly measurement: BenchmarkMeasurement;
  readonly paths: readonly string[];
  readonly comparisons: readonly BenchmarkComparison[];
}

export interface BenchmarkCriterion {
  readonly id: string;
  readonly passed: boolean;
  readonly summary: string;
}

export interface LoopBenchmarkResult {
  readonly schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  readonly benchmarkId: string;
  readonly matrix: BenchmarkTrackedFile & {
    readonly id: "d032-loop-efficiency.v1";
  };
  readonly status: "PASS" | "FAIL";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly baselineManifest: BenchmarkTrackedFile;
  readonly candidateManifest: BenchmarkTrackedFile;
  readonly baseline: BenchmarkCandidateIdentity;
  readonly candidate: BenchmarkCandidateIdentity;
  readonly serial: true;
  readonly warmupRunsPerSideAndClass: 1;
  readonly measuredRunsPerSideAndClass: 3;
  readonly classes: readonly BenchmarkClassResult[];
  readonly shadowFixtureMatrix: {
    readonly fixtureCount: number;
    readonly falseNegativeCheckIds: readonly string[];
    readonly unknownPaths: readonly string[];
    readonly deterministic: boolean;
  };
  readonly unknownExpansion: {
    readonly paths: readonly string[];
    readonly matchedUnknown: true;
    readonly broadSafeCheckIds: readonly string[];
    readonly selectedCheckIds: readonly string[];
    readonly missingBroadCheckIds: readonly string[];
  };
  readonly protectedComparison: {
    readonly matched: boolean;
    readonly paths: readonly {
      readonly path: string;
      readonly baselineSha256: string;
      readonly candidateSha256: string;
      readonly matches: boolean;
    }[];
  };
  readonly telemetry: {
    readonly manifestPath: string;
    readonly manifestSha256: string;
    readonly manifestBytes: number;
    readonly overheadAvailability: "measured";
  };
  readonly inventory: {
    readonly referencedPath: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly timing: "pre-benchmark";
    readonly postBenchmarkRefreshRequired: true;
  };
  readonly reportingGrowth: {
    readonly baselineManifestBytes: number;
    readonly candidateManifestBytes: number;
    readonly summaryBytes: number;
    readonly benchmarkJsonBytes: null;
    readonly benchmarkJsonBytesReason: "self-referential-report-size";
  };
  readonly criteria: readonly BenchmarkCriterion[];
  readonly failures: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return (
    actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index])
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function uniqueStrings(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(nonEmptyString) &&
    new Set(value).size === value.length
  );
}

function safeRepositoryPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    normalized === value &&
    !isAbsolute(value) &&
    value.length > 0 &&
    !value.split("/").includes("..") &&
    !value.split("/").includes("")
  );
}

function sha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function commit(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function expectedClassContract(id: BenchmarkClassId): {
  readonly measurement: BenchmarkMeasurement;
  readonly comparisons: readonly BenchmarkComparisonId[];
} {
  if (id === "leaf-ui-only")
    return {
      measurement: "command-workflows",
      comparisons: ["iteration", "candidate"],
    };
  if (id === "domain-local-simulation")
    return {
      measurement: "command-workflows",
      comparisons: ["iteration"],
    };
  if (id === "milestone-closure")
    return { measurement: "exact-closure", comparisons: ["closure"] };
  return {
    measurement: "selection-expansion",
    comparisons: ["scope-expansion"],
  };
}

export function assertBenchmarkMatrix(value: unknown): BenchmarkMatrix {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "id",
      "serial",
      "warmup",
      "repeat",
      "thresholds",
      "unknownProbePaths",
      "historical",
      "classes",
    ]) ||
    value["schemaVersion"] !== "1.0.0" ||
    value["id"] !== "d032-loop-efficiency.v1" ||
    value["serial"] !== true ||
    value["warmup"] !== 1 ||
    value["repeat"] !== 3 ||
    !isRecord(value["thresholds"]) ||
    !exactKeys(value["thresholds"], [
      "minimumImprovementMs",
      "noiseMultiplier",
      "maximumClosureRegressionMs",
    ]) ||
    value["thresholds"]["minimumImprovementMs"] !== 10_000 ||
    value["thresholds"]["noiseMultiplier"] !== 2 ||
    value["thresholds"]["maximumClosureRegressionMs"] !== 15_000 ||
    !uniqueStrings(value["unknownProbePaths"]) ||
    value["unknownProbePaths"].some((path) => !safeRepositoryPath(path)) ||
    !Array.isArray(value["classes"]) ||
    value["classes"].length !== BENCHMARK_CLASS_IDS.length
  )
    throw new Error(
      "Benchmark matrix is malformed or weakens commissioned bounds.",
    );
  for (const [index, raw] of value["classes"].entries()) {
    const id = BENCHMARK_CLASS_IDS[index];
    if (
      !id ||
      !isRecord(raw) ||
      !exactKeys(raw, [
        "id",
        "measurement",
        "comparisons",
        "paths",
        "mustExclude",
      ]) ||
      raw["id"] !== id ||
      !uniqueStrings(raw["paths"]) ||
      raw["paths"].some((path) => !safeRepositoryPath(path)) ||
      !uniqueStrings(raw["mustExclude"]) ||
      raw["mustExclude"].some(
        (path) => !safeRepositoryPath(path.replace(/\/$/u, "sentinel")),
      ) ||
      raw["paths"].some((path) =>
        (raw["mustExclude"] as readonly string[]).some((prefix: string) =>
          path.startsWith(prefix),
        ),
      )
    )
      throw new Error(`Benchmark class ${id} is malformed.`);
    const expected = expectedClassContract(id);
    if (
      raw["measurement"] !== expected.measurement ||
      !Array.isArray(raw["comparisons"]) ||
      raw["comparisons"].length !== expected.comparisons.length ||
      raw["comparisons"].some(
        (comparison, comparisonIndex) =>
          comparison !== expected.comparisons[comparisonIndex],
      )
    )
      throw new Error(
        `Benchmark class ${id} changes its measurement contract.`,
      );
  }
  const historical = value["historical"];
  if (
    !isRecord(historical) ||
    !exactKeys(historical, ["fullSafeCheckIds", "iterationCheckIdsByClass"]) ||
    !uniqueStrings(historical["fullSafeCheckIds"]) ||
    historical["fullSafeCheckIds"].length === 0 ||
    !isRecord(historical["iterationCheckIdsByClass"]) ||
    Object.entries(historical["iterationCheckIdsByClass"]).some(
      ([classId, ids]) =>
        !(BENCHMARK_CLASS_IDS as readonly string[]).includes(classId) ||
        !uniqueStrings(ids) ||
        ids.length === 0,
    )
  )
    throw new Error("Benchmark matrix historical check-id sets are malformed.");
  return value as unknown as BenchmarkMatrix;
}

export interface LoadedBenchmarkMatrix {
  readonly path: string;
  readonly absolutePath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly value: BenchmarkMatrix;
}

export async function loadBenchmarkMatrix(
  repositoryRoot: string,
  requestedPath = DEFAULT_BENCHMARK_MATRIX_PATH,
): Promise<LoadedBenchmarkMatrix> {
  const root = await realpath(resolve(repositoryRoot));
  const path = resolve(root, requestedPath);
  const repositoryRelative = relative(root, path).replaceAll("\\", "/");
  if (!safeRepositoryPath(repositoryRelative))
    throw new Error("Benchmark matrix escapes the repository.");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("Benchmark matrix must be a regular non-symlink file.");
  const resolvedPath = await realpath(path);
  const resolvedRelative = relative(root, resolvedPath).replaceAll("\\", "/");
  if (!safeRepositoryPath(resolvedRelative))
    throw new Error("Benchmark matrix resolves outside the repository.");
  const contents = await readFile(path);
  return {
    path: repositoryRelative,
    absolutePath: path,
    sha256: createHash("sha256").update(contents).digest("hex"),
    bytes: contents.byteLength,
    value: assertBenchmarkMatrix(JSON.parse(contents.toString("utf8"))),
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value)))
    throw new Error("Median requires finite measurements.");
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? (ordered[middle] as number)
    : ((ordered[middle - 1] as number) + (ordered[middle] as number)) / 2;
}

export function medianAbsoluteDeviation(values: readonly number[]): number {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function benchmarkStatistics(
  runs: readonly BenchmarkRunMeasurement[],
): BenchmarkStatistics {
  const measured = runs.filter((run) => !run.warmup);
  if (measured.length !== 3)
    throw new Error(
      "Benchmark statistics require exactly three measured runs.",
    );
  return {
    measuredRunCount: 3,
    medianMs: median(measured.map((run) => run.durationMs)),
    medianAbsoluteDeviationMs: medianAbsoluteDeviation(
      measured.map((run) => run.durationMs),
    ),
    medianArtifactBytes: median(
      measured.map((run) => run.artifacts.totalBytes),
    ),
  };
}

function validTrackedFile(value: unknown): value is BenchmarkTrackedFile {
  return (
    isRecord(value) &&
    exactKeys(value, ["path", "sha256", "bytes"]) &&
    nonEmptyString(value["path"]) &&
    safeRepositoryPath(value["path"]) &&
    sha(value["sha256"]) &&
    nonnegativeInteger(value["bytes"])
  );
}

function validCandidate(value: unknown): value is BenchmarkCandidateIdentity {
  return (
    isRecord(value) &&
    exactKeys(value, ["commit", "tree", "workingTreeDirty"]) &&
    commit(value["commit"]) &&
    commit(value["tree"]) &&
    value["workingTreeDirty"] === false
  );
}

export function assertBenchmarkEnvironmentManifest(
  value: unknown,
): BenchmarkEnvironmentManifest {
  const malformed = (): never => {
    throw new Error("Benchmark environment manifest is malformed.");
  };
  if (!isRecord(value)) malformed();
  const record = value as Record<string, unknown>;
  if (
    !exactKeys(record, [
      "schemaVersion",
      "side",
      "candidate",
      "nodeVersion",
      "pnpmVersion",
      "platform",
      "architecture",
      "preparation",
      "packageJson",
      "lockfile",
      "protectedFiles",
    ])
  )
    malformed();
  if (
    record["schemaVersion"] !== "1.0.0" ||
    (record["side"] !== "before" && record["side"] !== "after") ||
    record["nodeVersion"] !== "v24.18.0" ||
    record["pnpmVersion"] !== "11.15.1" ||
    !nonEmptyString(record["platform"]) ||
    !nonEmptyString(record["architecture"])
  )
    malformed();
  if (!validCandidate(record["candidate"])) malformed();
  const preparationValue = record["preparation"];
  if (!isRecord(preparationValue)) malformed();
  const preparation = preparationValue as Record<string, unknown>;
  if (
    !exactKeys(preparation, [
      "worktreeIdentity",
      "setupStartedAt",
      "setupFinishedAt",
      "setupDurationMs",
      "installDurationMs",
      "installStatus",
      "checkoutPolicy",
      "includedInCheckWallTime",
    ])
  )
    malformed();
  const startedAt = preparation["setupStartedAt"];
  const finishedAt = preparation["setupFinishedAt"];
  const setupDurationMs = preparation["setupDurationMs"];
  const installDurationMs = preparation["installDurationMs"];
  if (
    preparation["worktreeIdentity"] !== record["side"] ||
    !timestamp(startedAt) ||
    !timestamp(finishedAt) ||
    Date.parse(finishedAt) < Date.parse(startedAt) ||
    !nonnegativeInteger(setupDurationMs) ||
    !nonnegativeInteger(installDurationMs)
  )
    malformed();
  const measuredSetupDurationMs = setupDurationMs as number;
  const measuredInstallDurationMs = installDurationMs as number;
  if (
    measuredSetupDurationMs < measuredInstallDurationMs ||
    preparation["installStatus"] !== "PASS" ||
    preparation["checkoutPolicy"] !== "lf-longpaths.v1" ||
    preparation["includedInCheckWallTime"] !== false
  )
    malformed();
  const packageJson = record["packageJson"];
  const lockfile = record["lockfile"];
  if (
    !validTrackedFile(packageJson) ||
    packageJson.path !== "package.json" ||
    !validTrackedFile(lockfile) ||
    lockfile.path !== "pnpm-lock.yaml"
  )
    malformed();
  const protectedFilesValue = record["protectedFiles"];
  if (!Array.isArray(protectedFilesValue) || protectedFilesValue.length === 0)
    malformed();
  const protectedFiles = protectedFilesValue as unknown[];
  const protectedPaths = new Set<string>();
  for (const file of protectedFiles) {
    if (!validTrackedFile(file)) malformed();
    const trackedFile = file as BenchmarkTrackedFile;
    if (protectedPaths.has(trackedFile.path)) malformed();
    protectedPaths.add(trackedFile.path);
  }
  return value as unknown as BenchmarkEnvironmentManifest;
}

function validArtifactMeasurement(
  value: unknown,
): value is BenchmarkArtifactMeasurement {
  return (
    isRecord(value) &&
    exactKeys(value, ["fileCount", "totalBytes", "manifestSha256"]) &&
    nonnegativeInteger(value["fileCount"]) &&
    nonnegativeInteger(value["totalBytes"]) &&
    sha(value["manifestSha256"])
  );
}

function validTestCounts(value: unknown): value is VerificationTestCounts {
  if (!isRecord(value) || !exactKeys(value, ["suites", "tests"])) return false;
  for (const groupName of ["suites", "tests"] as const) {
    const group = value[groupName];
    if (
      !isRecord(group) ||
      !exactKeys(group, ["total", "passed", "failed", "skipped"]) ||
      !Object.values(group).every(nonnegativeInteger) ||
      group["total"] !==
        Number(group["passed"]) +
          Number(group["failed"]) +
          Number(group["skipped"])
    )
      return false;
  }
  return true;
}

function validExactClosure(value: unknown): value is BenchmarkExactClosure {
  if (!(
    isRecord(value) &&
    exactKeys(value, [
      "resultSha256",
      "resultBytes",
      "profileId",
      "selectedByOverride",
      "status",
      "exitCode",
      "completionEligible",
      "disposition",
      "stageIds",
      "stageStatuses",
      "passCount",
      "notReadyCount",
      "failCount",
      "errorCount",
      "validatedArtifactCount",
      "reconstructedArtifactBytes",
    ]) &&
    sha(value["resultSha256"]) &&
    nonnegativeInteger(value["resultBytes"]) &&
    value["resultBytes"] > 0 &&
    value["profileId"] === "readiness" &&
    value["selectedByOverride"] === false &&
    value["status"] === "NOT_READY" &&
    value["exitCode"] === 2 &&
    value["completionEligible"] === false &&
    value["disposition"] === "incremental-readiness" &&
    uniqueStrings(value["stageIds"]) &&
    value["stageIds"].length === READINESS_VERIFICATION_STAGE_IDS.length &&
    value["stageIds"].every(
      (id, index) => id === READINESS_VERIFICATION_STAGE_IDS[index],
    ) &&
    Array.isArray(value["stageStatuses"]) &&
    value["stageStatuses"].length === READINESS_VERIFICATION_STAGE_IDS.length &&
    value["stageStatuses"].every(
      (status) => status === "PASS" || status === "NOT_READY",
    ) &&
    value["passCount"] === 5 &&
    value["notReadyCount"] === 10 &&
    value["failCount"] === 0 &&
    value["errorCount"] === 0 &&
    nonnegativeInteger(value["validatedArtifactCount"]) &&
    value["validatedArtifactCount"] > 0 &&
    nonnegativeInteger(value["reconstructedArtifactBytes"]) &&
    value["reconstructedArtifactBytes"] > 0
  ))
    return false;
  const statuses = value["stageStatuses"] as readonly ("PASS" | "NOT_READY")[];
  return (
    statuses.filter((status) => status === "PASS").length ===
      value["passCount"] &&
    statuses.filter((status) => status === "NOT_READY").length ===
      value["notReadyCount"]
  );
}

function validCommandMeasurement(
  value: unknown,
): value is BenchmarkCommandMeasurement {
  if (!(
    isRecord(value) &&
    exactKeys(value, [
      "id",
      "argv",
      "status",
      "exitCode",
      "durationMs",
      "stdout",
      "stderr",
      "receipt",
      "receiptAbsenceReason",
      "testCounts",
      "testCountAvailability",
      "artifacts",
      "telemetryOverheadNanoseconds",
      "telemetryAvailability",
    ]) &&
    nonEmptyString(value["id"]) &&
    uniqueStrings(value["argv"]) &&
    (value["status"] === "PASS" || value["status"] === "NOT_READY") &&
    nonnegativeInteger(value["exitCode"]) &&
    nonnegativeInteger(value["durationMs"]) &&
    validTrackedFile(value["stdout"]) &&
    validTrackedFile(value["stderr"]) &&
    (value["receipt"] === null ||
      (isRecord(value["receipt"]) &&
        exactKeys(value["receipt"], ["sha256", "bytes"]) &&
        sha(value["receipt"]["sha256"]) &&
        nonnegativeInteger(value["receipt"]["bytes"]))) &&
    (value["receiptAbsenceReason"] === null ||
      nonEmptyString(value["receiptAbsenceReason"])) &&
    (value["testCounts"] === null || validTestCounts(value["testCounts"])) &&
    ["measured", "not-recorded-baseline-command", "not-applicable"].includes(
      String(value["testCountAvailability"]),
    ) &&
    validArtifactMeasurement(value["artifacts"]) &&
    (value["telemetryOverheadNanoseconds"] === null ||
      (typeof value["telemetryOverheadNanoseconds"] === "string" &&
        /^\d+$/u.test(value["telemetryOverheadNanoseconds"]))) &&
    ["measured", "not-applicable-before-d032"].includes(
      String(value["telemetryAvailability"]),
    )
  ))
    return false;
  return (
    (value["status"] === "PASS"
      ? value["exitCode"] === 0
      : value["exitCode"] === 2) &&
    (value["receipt"] === null) !== (value["receiptAbsenceReason"] === null) &&
    (value["testCounts"] === null) ===
      (value["testCountAvailability"] !== "measured") &&
    (value["telemetryOverheadNanoseconds"] === null) ===
      (value["telemetryAvailability"] !== "measured")
  );
}

function validRun(
  value: unknown,
  side: "before" | "after",
  index: number,
): value is BenchmarkRunMeasurement {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "index",
      "warmup",
      "side",
      "candidate",
      "status",
      "exitCode",
      "durationMs",
      "selectorPlanningDurationMs",
      "selectedCheckIds",
      "actualCheckIds",
      "fullClosureCheckIds",
      "commands",
      "testCounts",
      "testCountAvailability",
      "artifacts",
      "selectorDifference",
      "telemetryOverheadNanoseconds",
      "telemetryAvailability",
      "exactClosure",
    ]) ||
    value["index"] !== index ||
    value["warmup"] !== (index === 0) ||
    value["side"] !== side ||
    !validCandidate(value["candidate"]) ||
    (value["status"] !== "PASS" && value["status"] !== "NOT_READY") ||
    (value["exitCode"] !== 0 && value["exitCode"] !== 2) ||
    !nonnegativeInteger(value["durationMs"]) ||
    !nonnegativeInteger(value["selectorPlanningDurationMs"]) ||
    !uniqueStrings(value["selectedCheckIds"]) ||
    !uniqueStrings(value["actualCheckIds"]) ||
    !uniqueStrings(value["fullClosureCheckIds"]) ||
    !Array.isArray(value["commands"]) ||
    !value["commands"].every(validCommandMeasurement) ||
    (value["testCounts"] !== null && !validTestCounts(value["testCounts"])) ||
    !["measured", "not-applicable"].includes(
      String(value["testCountAvailability"]),
    ) ||
    !validArtifactMeasurement(value["artifacts"]) ||
    !isRecord(value["selectorDifference"]) ||
    !exactKeys(value["selectorDifference"], [
      "recommendedOnlyCheckIds",
      "omittedFromRecommendationActualCheckIds",
      "falseNegativeCheckIds",
    ]) ||
    !uniqueStrings(value["selectorDifference"]["recommendedOnlyCheckIds"]) ||
    !uniqueStrings(
      value["selectorDifference"]["omittedFromRecommendationActualCheckIds"],
    ) ||
    !uniqueStrings(value["selectorDifference"]["falseNegativeCheckIds"]) ||
    (value["telemetryOverheadNanoseconds"] !== null &&
      (typeof value["telemetryOverheadNanoseconds"] !== "string" ||
        !/^\d+$/u.test(value["telemetryOverheadNanoseconds"]))) ||
    ![
      "measured",
      "not-applicable-before-d032",
      "not-applicable-selection-only",
    ].includes(String(value["telemetryAvailability"])) ||
    (value["exactClosure"] !== null &&
      !validExactClosure(value["exactClosure"]))
  )
    return false;
  return (
    (value["status"] === "PASS"
      ? value["exitCode"] === 0
      : value["exitCode"] === 2) &&
    (value["actualCheckIds"].length === value["commands"].length ||
      value["commands"].length === 0 ||
      value["exactClosure"] !== null)
  );
}

function validStatistics(value: unknown): value is BenchmarkStatistics {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "measuredRunCount",
      "medianMs",
      "medianAbsoluteDeviationMs",
      "medianArtifactBytes",
    ]) &&
    value["measuredRunCount"] === 3 &&
    Object.entries(value)
      .filter(([key]) => key !== "measuredRunCount")
      .every(
        ([, item]) =>
          typeof item === "number" && Number.isFinite(item) && item >= 0,
      )
  );
}

function sameStatistics(
  actual: BenchmarkStatistics,
  expected: BenchmarkStatistics,
): boolean {
  return (
    actual.measuredRunCount === expected.measuredRunCount &&
    actual.medianMs === expected.medianMs &&
    actual.medianAbsoluteDeviationMs === expected.medianAbsoluteDeviationMs &&
    actual.medianArtifactBytes === expected.medianArtifactBytes
  );
}

function findComparison(
  classes: readonly BenchmarkClassResult[],
  classId: BenchmarkClassId,
  comparisonId: BenchmarkComparisonId,
): BenchmarkComparison {
  const comparison = classes
    .find((entry) => entry.id === classId)
    ?.comparisons.find((entry) => entry.id === comparisonId);
  if (!comparison)
    throw new Error(
      `Benchmark comparison is missing: ${classId}/${comparisonId}.`,
    );
  return comparison;
}

function validShadowFixtureMatrix(
  value: unknown,
): value is LoopBenchmarkResult["shadowFixtureMatrix"] {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "fixtureCount",
      "falseNegativeCheckIds",
      "unknownPaths",
      "deterministic",
    ]) &&
    nonnegativeInteger(value["fixtureCount"]) &&
    value["fixtureCount"] > 0 &&
    uniqueStrings(value["falseNegativeCheckIds"]) &&
    uniqueStrings(value["unknownPaths"]) &&
    value["unknownPaths"].every(safeRepositoryPath) &&
    typeof value["deterministic"] === "boolean"
  );
}

function validUnknownExpansion(
  value: unknown,
): value is LoopBenchmarkResult["unknownExpansion"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "paths",
      "matchedUnknown",
      "broadSafeCheckIds",
      "selectedCheckIds",
      "missingBroadCheckIds",
    ]) ||
    !uniqueStrings(value["paths"]) ||
    value["paths"].length === 0 ||
    !value["paths"].every(safeRepositoryPath) ||
    value["matchedUnknown"] !== true ||
    !uniqueStrings(value["broadSafeCheckIds"]) ||
    !uniqueStrings(value["selectedCheckIds"]) ||
    !uniqueStrings(value["missingBroadCheckIds"])
  )
    return false;
  const broad = value["broadSafeCheckIds"];
  const selected = value["selectedCheckIds"];
  const missing = value["missingBroadCheckIds"];
  return (
    broad.length === BENCHMARK_BROAD_SAFE_CHECK_IDS.length &&
    broad.every((id, index) => id === BENCHMARK_BROAD_SAFE_CHECK_IDS[index]) &&
    missing.length === broad.filter((id) => !selected.includes(id)).length &&
    missing.every(
      (id, index) =>
        id === broad.filter((entry) => !selected.includes(entry))[index],
    )
  );
}

function validProtectedComparison(
  value: unknown,
): value is LoopBenchmarkResult["protectedComparison"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["matched", "paths"]) ||
    typeof value["matched"] !== "boolean" ||
    !Array.isArray(value["paths"]) ||
    value["paths"].length === 0
  )
    return false;
  const seen = new Set<string>();
  for (const entry of value["paths"]) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, [
        "path",
        "baselineSha256",
        "candidateSha256",
        "matches",
      ]) ||
      !nonEmptyString(entry["path"]) ||
      !safeRepositoryPath(entry["path"]) ||
      seen.has(entry["path"]) ||
      !sha(entry["baselineSha256"]) ||
      !sha(entry["candidateSha256"]) ||
      typeof entry["matches"] !== "boolean" ||
      entry["matches"] !==
        (entry["baselineSha256"] === entry["candidateSha256"])
    )
      return false;
    seen.add(entry["path"]);
  }
  return (
    value["matched"] ===
    value["paths"].every(
      (entry) => isRecord(entry) && entry["matches"] === true,
    )
  );
}

function validTelemetryReference(
  value: unknown,
): value is LoopBenchmarkResult["telemetry"] {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "manifestPath",
      "manifestSha256",
      "manifestBytes",
      "overheadAvailability",
    ]) &&
    nonEmptyString(value["manifestPath"]) &&
    safeRepositoryPath(value["manifestPath"]) &&
    sha(value["manifestSha256"]) &&
    nonnegativeInteger(value["manifestBytes"]) &&
    value["manifestBytes"] > 0 &&
    value["overheadAvailability"] === "measured"
  );
}

function validInventoryReference(
  value: unknown,
): value is LoopBenchmarkResult["inventory"] {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "referencedPath",
      "sha256",
      "bytes",
      "timing",
      "postBenchmarkRefreshRequired",
    ]) &&
    nonEmptyString(value["referencedPath"]) &&
    safeRepositoryPath(value["referencedPath"]) &&
    sha(value["sha256"]) &&
    nonnegativeInteger(value["bytes"]) &&
    value["bytes"] > 0 &&
    value["timing"] === "pre-benchmark" &&
    value["postBenchmarkRefreshRequired"] === true
  );
}

function validReportingGrowth(
  value: unknown,
): value is LoopBenchmarkResult["reportingGrowth"] {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "baselineManifestBytes",
      "candidateManifestBytes",
      "summaryBytes",
      "benchmarkJsonBytes",
      "benchmarkJsonBytesReason",
    ]) &&
    nonnegativeInteger(value["baselineManifestBytes"]) &&
    value["baselineManifestBytes"] > 0 &&
    nonnegativeInteger(value["candidateManifestBytes"]) &&
    value["candidateManifestBytes"] > 0 &&
    nonnegativeInteger(value["summaryBytes"]) &&
    value["summaryBytes"] > 0 &&
    value["benchmarkJsonBytes"] === null &&
    value["benchmarkJsonBytesReason"] === "self-referential-report-size"
  );
}

export function evaluateBenchmarkCriteria(input: {
  readonly matrix: Pick<BenchmarkMatrix, "thresholds">;
  readonly classes: readonly BenchmarkClassResult[];
  readonly shadowFixtureMatrix: LoopBenchmarkResult["shadowFixtureMatrix"];
  readonly unknownExpansion: LoopBenchmarkResult["unknownExpansion"];
  readonly protectedComparison: LoopBenchmarkResult["protectedComparison"];
  readonly telemetryManifestBytes: number;
  readonly inventoryBytes: number;
}): readonly BenchmarkCriterion[] {
  const leafIteration = findComparison(
    input.classes,
    "leaf-ui-only",
    "iteration",
  );
  const leafCandidate = findComparison(
    input.classes,
    "leaf-ui-only",
    "candidate",
  );
  const domainIteration = findComparison(
    input.classes,
    "domain-local-simulation",
    "iteration",
  );
  const closure = findComparison(input.classes, "milestone-closure", "closure");
  const material = (comparison: BenchmarkComparison): boolean => {
    const improvement =
      comparison.beforeStatistics.medianMs -
      comparison.afterStatistics.medianMs;
    const noise =
      input.matrix.thresholds.noiseMultiplier *
      Math.max(
        comparison.beforeStatistics.medianAbsoluteDeviationMs,
        comparison.afterStatistics.medianAbsoluteDeviationMs,
      );
    return (
      improvement > input.matrix.thresholds.minimumImprovementMs &&
      improvement > noise
    );
  };
  const narrowed = [leafIteration, leafCandidate, domainIteration].every(
    (comparison) =>
      comparison.afterRuns.every(
        (run) =>
          !run.actualCheckIds.includes("test-unit") &&
          !run.actualCheckIds.includes("test-unit-migrations"),
      ),
  );
  const fewerArtifacts = [leafIteration, leafCandidate, domainIteration].every(
    (comparison) =>
      comparison.afterStatistics.medianArtifactBytes <
      comparison.beforeStatistics.medianArtifactBytes,
  );
  const broadMinimum = input.unknownExpansion.broadSafeCheckIds;
  const broadClasses = [
    findComparison(
      input.classes,
      "shared-protocol-persistence",
      "scope-expansion",
    ),
    findComparison(input.classes, "worker-public-message", "scope-expansion"),
  ];
  const riskyBroad =
    input.unknownExpansion.missingBroadCheckIds.length === 0 &&
    broadClasses.every((comparison) =>
      comparison.afterRuns.every((run) =>
        broadMinimum.every((id) => run.actualCheckIds.includes(id)),
      ),
    );
  const closureIntegrity = [...closure.beforeRuns, ...closure.afterRuns].every(
    (run) => validExactClosure(run.exactClosure),
  );
  const closureRegression =
    closure.afterStatistics.medianMs - closure.beforeStatistics.medianMs;
  const closureLimit = Math.max(
    input.matrix.thresholds.maximumClosureRegressionMs,
    input.matrix.thresholds.noiseMultiplier *
      closure.beforeStatistics.medianAbsoluteDeviationMs,
  );
  return [
    {
      id: "leaf-iteration-material-improvement",
      passed: material(leafIteration),
      summary: `Leaf iteration changed by ${leafIteration.beforeStatistics.medianMs - leafIteration.afterStatistics.medianMs} ms against its noise-adjusted floor.`,
    },
    {
      id: "domain-iteration-material-improvement",
      passed: material(domainIteration),
      summary: `Domain iteration changed by ${domainIteration.beforeStatistics.medianMs - domainIteration.afterStatistics.medianMs} ms against its noise-adjusted floor.`,
    },
    {
      id: "leaf-candidate-material-improvement",
      passed: material(leafCandidate),
      summary: `Leaf candidate validation changed by ${leafCandidate.beforeStatistics.medianMs - leafCandidate.afterStatistics.medianMs} ms against its noise-adjusted floor.`,
    },
    {
      id: "narrow-runs-exclude-full-and-migration-units",
      passed: narrowed,
      summary:
        "Narrow after-workflows must not invoke complete or migration unit suites.",
    },
    {
      id: "narrow-runs-reduce-artifact-bytes",
      passed: fewerArtifacts,
      summary:
        "Every narrow after-workflow must produce fewer median evidence bytes than its historical safe equivalent.",
    },
    {
      id: "risky-and-unknown-paths-expand-broad",
      passed: riskyBroad,
      summary:
        "Shared protocol, persistence, Worker-message, and unknown probes must contain the broad safe check floor.",
    },
    {
      id: "exact-closure-integrity",
      passed: closureIntegrity,
      summary:
        "Every final-candidate closure run must reconstruct canonical readiness evidence and the 5/10 NOT_READY disposition.",
    },
    {
      id: "exact-closure-runtime-within-noise",
      passed: closureRegression <= closureLimit,
      summary: `Closure regression was ${closureRegression} ms against an allowed ${closureLimit} ms.`,
    },
    {
      id: "shadow-fixtures-have-zero-false-negatives",
      passed:
        input.shadowFixtureMatrix.deterministic &&
        input.shadowFixtureMatrix.falseNegativeCheckIds.length === 0 &&
        input.shadowFixtureMatrix.unknownPaths.length === 0,
      summary: `${input.shadowFixtureMatrix.fixtureCount} shadow fixtures must be deterministic with zero misses or unknown paths.`,
    },
    {
      id: "protected-hashes-match",
      passed: input.protectedComparison.matched,
      summary:
        "Every protected file must retain its exact pre-efficiency SHA-256.",
    },
    {
      id: "telemetry-and-inventory-growth-disclosed",
      passed: input.telemetryManifestBytes > 0 && input.inventoryBytes > 0,
      summary:
        "Benchmark telemetry and the pre-benchmark inventory are size/hash referenced; a post-benchmark inventory refresh remains mandatory.",
    },
  ];
}

export function assertLoopBenchmark(value: unknown): LoopBenchmarkResult {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "benchmarkId",
      "matrix",
      "status",
      "startedAt",
      "finishedAt",
      "baselineManifest",
      "candidateManifest",
      "baseline",
      "candidate",
      "serial",
      "warmupRunsPerSideAndClass",
      "measuredRunsPerSideAndClass",
      "classes",
      "shadowFixtureMatrix",
      "unknownExpansion",
      "protectedComparison",
      "telemetry",
      "inventory",
      "reportingGrowth",
      "criteria",
      "failures",
    ]) ||
    value["schemaVersion"] !== BENCHMARK_SCHEMA_VERSION ||
    !nonEmptyString(value["benchmarkId"]) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u.test(value["benchmarkId"]) ||
    !isRecord(value["matrix"]) ||
    !exactKeys(value["matrix"], ["path", "sha256", "bytes", "id"]) ||
    value["matrix"]["id"] !== "d032-loop-efficiency.v1" ||
    !validTrackedFile({
      path: value["matrix"]["path"],
      sha256: value["matrix"]["sha256"],
      bytes: value["matrix"]["bytes"],
    }) ||
    (value["status"] !== "PASS" && value["status"] !== "FAIL") ||
    !timestamp(value["startedAt"]) ||
    !timestamp(value["finishedAt"]) ||
    Date.parse(value["finishedAt"]) < Date.parse(value["startedAt"]) ||
    !validTrackedFile(value["baselineManifest"]) ||
    !validTrackedFile(value["candidateManifest"]) ||
    !validCandidate(value["baseline"]) ||
    !validCandidate(value["candidate"]) ||
    value["serial"] !== true ||
    value["warmupRunsPerSideAndClass"] !== 1 ||
    value["measuredRunsPerSideAndClass"] !== 3 ||
    !Array.isArray(value["classes"]) ||
    value["classes"].length !== BENCHMARK_CLASS_IDS.length
  )
    throw new Error("Loop benchmark result is malformed.");
  for (const [classIndex, rawClass] of value["classes"].entries()) {
    const classId = BENCHMARK_CLASS_IDS[classIndex];
    if (
      !classId ||
      !isRecord(rawClass) ||
      !exactKeys(rawClass, ["id", "measurement", "paths", "comparisons"]) ||
      rawClass["id"] !== classId ||
      !uniqueStrings(rawClass["paths"]) ||
      !Array.isArray(rawClass["comparisons"])
    )
      throw new Error(`Loop benchmark class ${classId} is malformed.`);
    const expected = expectedClassContract(classId);
    if (
      rawClass["measurement"] !== expected.measurement ||
      rawClass["comparisons"].length !== expected.comparisons.length
    )
      throw new Error(`Loop benchmark class ${classId} changed contract.`);
    for (const [comparisonIndex, rawComparison] of rawClass[
      "comparisons"
    ].entries()) {
      if (
        !isRecord(rawComparison) ||
        !exactKeys(rawComparison, [
          "id",
          "beforeRuns",
          "afterRuns",
          "beforeStatistics",
          "afterStatistics",
        ]) ||
        rawComparison["id"] !== expected.comparisons[comparisonIndex] ||
        !Array.isArray(rawComparison["beforeRuns"]) ||
        !Array.isArray(rawComparison["afterRuns"]) ||
        rawComparison["beforeRuns"].length !== 4 ||
        rawComparison["afterRuns"].length !== 4 ||
        !rawComparison["beforeRuns"].every((run, index) =>
          validRun(run, "before", index),
        ) ||
        !rawComparison["afterRuns"].every((run, index) =>
          validRun(run, "after", index),
        ) ||
        !validStatistics(rawComparison["beforeStatistics"]) ||
        !validStatistics(rawComparison["afterStatistics"])
      )
        throw new Error(
          `Loop benchmark comparison ${classId}/${expected.comparisons[comparisonIndex] ?? "missing"} is malformed.`,
        );
      const typed = rawComparison as unknown as BenchmarkComparison;
      if (
        !sameStatistics(
          typed.beforeStatistics,
          benchmarkStatistics(typed.beforeRuns),
        ) ||
        !sameStatistics(
          typed.afterStatistics,
          benchmarkStatistics(typed.afterRuns),
        )
      )
        throw new Error("Loop benchmark statistics do not match raw runs.");
      for (const run of [...typed.beforeRuns, ...typed.afterRuns]) {
        const expectedCandidate =
          run.side === "before"
            ? (value["baseline"] as BenchmarkCandidateIdentity)
            : (value["candidate"] as BenchmarkCandidateIdentity);
        if (
          run.candidate.commit !== expectedCandidate.commit ||
          run.candidate.tree !== expectedCandidate.tree ||
          run.candidate.workingTreeDirty !== expectedCandidate.workingTreeDirty
        )
          throw new Error("Loop benchmark run candidate identity drifted.");
        if (
          rawClass["measurement"] === "command-workflows" &&
          (run.commands.length === 0 ||
            run.exactClosure !== null ||
            run.commands.some(
              (command, index) => command.id !== run.actualCheckIds[index],
            ))
        )
          throw new Error("Loop benchmark command workflow is inconsistent.");
        if (
          rawClass["measurement"] === "selection-expansion" &&
          (run.commands.length !== 0 ||
            run.exactClosure !== null ||
            run.telemetryAvailability !== "not-applicable-selection-only")
        )
          throw new Error("Loop benchmark selection-only run is inconsistent.");
        if (
          rawClass["measurement"] === "exact-closure" &&
          (run.commands.length !== 1 ||
            run.commands[0]?.id !== "exact-readiness" ||
            run.selectedCheckIds.length !== 1 ||
            run.selectedCheckIds[0] !== "exact-readiness" ||
            run.actualCheckIds.length !== 1 ||
            run.actualCheckIds[0] !== "exact-readiness" ||
            !validExactClosure(run.exactClosure))
        )
          throw new Error("Loop benchmark exact closure is inconsistent.");
      }
    }
  }
  const result = value as unknown as LoopBenchmarkResult;
  if (
    !Array.isArray(result.criteria) ||
    result.criteria.length === 0 ||
    result.criteria.some(
      (criterion) =>
        !isRecord(criterion) ||
        !exactKeys(criterion, ["id", "passed", "summary"]) ||
        !nonEmptyString(criterion["id"]) ||
        typeof criterion["passed"] !== "boolean" ||
        !nonEmptyString(criterion["summary"]),
    ) ||
    result.criteria.length !== BENCHMARK_CRITERION_IDS.length ||
    result.criteria.some(
      (criterion, index) => criterion.id !== BENCHMARK_CRITERION_IDS[index],
    ) ||
    !uniqueStrings(result.failures)
  )
    throw new Error("Loop benchmark criteria are malformed or inconsistent.");
  if (
    !validShadowFixtureMatrix(result.shadowFixtureMatrix) ||
    !validUnknownExpansion(result.unknownExpansion) ||
    !validProtectedComparison(result.protectedComparison) ||
    !validTelemetryReference(result.telemetry) ||
    !validInventoryReference(result.inventory) ||
    !validReportingGrowth(result.reportingGrowth)
  )
    throw new Error("Loop benchmark supporting evidence is malformed.");
  const recomputedCriteria = evaluateBenchmarkCriteria({
    matrix: { thresholds: COMMISSIONED_BENCHMARK_THRESHOLDS },
    classes: result.classes,
    shadowFixtureMatrix: result.shadowFixtureMatrix,
    unknownExpansion: result.unknownExpansion,
    protectedComparison: result.protectedComparison,
    telemetryManifestBytes: result.telemetry.manifestBytes,
    inventoryBytes: result.inventory.bytes,
  });
  if (
    recomputedCriteria.length !== result.criteria.length ||
    recomputedCriteria.some(
      (criterion, index) =>
        criterion.id !== result.criteria[index]?.id ||
        criterion.passed !== result.criteria[index]?.passed ||
        criterion.summary !== result.criteria[index]?.summary,
    )
  )
    throw new Error("Loop benchmark criteria do not match raw evidence.");
  const expectedFailures = recomputedCriteria
    .filter((criterion) => !criterion.passed)
    .map((criterion) => criterion.id);
  if (
    result.failures.length !== expectedFailures.length ||
    result.failures.some(
      (failure, index) => failure !== expectedFailures[index],
    ) ||
    result.status !== (expectedFailures.length === 0 ? "PASS" : "FAIL")
  )
    throw new Error("Loop benchmark status does not match its criteria.");
  return result;
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function gitText(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync(
    "git",
    [...BENCHMARK_WORKTREE_GIT_CONFIG, "-C", repositoryRoot, ...args],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

function gitStatusClean(repositoryRoot: string): boolean {
  return (
    gitText(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]) === ""
  );
}

function repositoryRoot(start = process.cwd()): string {
  return resolve(gitText(start, ["rev-parse", "--show-toplevel"]));
}

function currentPnpmVersion(repositoryRoot: string): string {
  const pnpmPath = resolvePnpmScript();
  if (!pnpmPath)
    throw new Error("Cannot resolve the pinned pnpm JavaScript entry.");
  const result = spawnSync(process.execPath, [pnpmPath, "--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot resolve pnpm version: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

async function regularFileIdentity(
  path: string,
  repositoryPath: string,
): Promise<BenchmarkTrackedFile> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Benchmark input must be a regular file: ${repositoryPath}.`,
    );
  const contents = await readFile(path);
  return {
    path: slash(repositoryPath),
    sha256: sha256(contents),
    bytes: contents.byteLength,
  };
}

async function retainedFileReference(
  root: string,
  path: string,
): Promise<BenchmarkTrackedFile> {
  const absoluteRoot = await realpath(resolve(root));
  const absolute = resolve(absoluteRoot, path);
  const repositoryRelative = slash(relative(absoluteRoot, absolute));
  if (!safeRepositoryPath(repositoryRelative))
    throw new Error(`Benchmark artifact escapes its root: ${path}.`);
  const resolved = await realpath(absolute);
  if (!safeRepositoryPath(slash(relative(absoluteRoot, resolved))))
    throw new Error(`Benchmark artifact resolves outside its root: ${path}.`);
  return regularFileIdentity(absolute, repositoryRelative);
}

interface SnapshotFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

async function snapshotFiles(root: string): Promise<readonly SnapshotFile[]> {
  if (!existsSync(root)) return [];
  const absoluteRoot = await realpath(root);
  const files: SnapshotFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Benchmark artifact tree contains a symlink: ${path}.`);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile())
        throw new Error(
          `Benchmark artifact tree contains a non-file: ${path}.`,
        );
      const relativePath = slash(relative(absoluteRoot, path));
      if (!safeRepositoryPath(relativePath))
        throw new Error(`Benchmark artifact escapes its tree: ${path}.`);
      const contents = await readFile(path);
      files.push({
        path: relativePath,
        bytes: contents.byteLength,
        sha256: sha256(contents),
      });
    }
  };
  await visit(absoluteRoot);
  return files;
}

function artifactMeasurement(
  files: readonly SnapshotFile[],
): BenchmarkArtifactMeasurement {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    manifestSha256: sha256(canonicalJson(files)),
  };
}

function combineArtifactMeasurements(
  measurements: readonly BenchmarkArtifactMeasurement[],
): BenchmarkArtifactMeasurement {
  return {
    fileCount: measurements.reduce(
      (sum, measurement) => sum + measurement.fileCount,
      0,
    ),
    totalBytes: measurements.reduce(
      (sum, measurement) => sum + measurement.totalBytes,
      0,
    ),
    manifestSha256: sha256(canonicalJson(measurements)),
  };
}

function combineTestCounts(
  counts: readonly VerificationTestCounts[],
): VerificationTestCounts | null {
  if (counts.length === 0) return null;
  const total = (
    group: "suites" | "tests",
    field: "total" | "passed" | "failed" | "skipped",
  ): number => counts.reduce((sum, item) => sum + item[group][field], 0);
  return {
    suites: {
      total: total("suites", "total"),
      passed: total("suites", "passed"),
      failed: total("suites", "failed"),
      skipped: total("suites", "skipped"),
    },
    tests: {
      total: total("tests", "total"),
      passed: total("tests", "passed"),
      failed: total("tests", "failed"),
      skipped: total("tests", "skipped"),
    },
  };
}

interface PreparedWorktree {
  readonly side: "before" | "after";
  readonly path: string;
  readonly identity: BenchmarkCandidateIdentity;
  readonly manifest: BenchmarkEnvironmentManifest;
}

async function benchmarkTemporaryParent(): Promise<string> {
  const ordinary = resolve(tmpdir());
  if (process.platform !== "win32") return ordinary;
  const shortWindowsParent = resolve(parse(ordinary).root, "Temp");
  try {
    const metadata = await lstat(shortWindowsParent);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return ordinary;
    const resolved = await realpath(shortWindowsParent);
    return resolve(resolved) === shortWindowsParent
      ? shortWindowsParent
      : ordinary;
  } catch {
    return ordinary;
  }
}

function normalizedWorktreePath(path: string): string {
  const normalized = slash(resolve(path));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function registeredWorktreePaths(repositoryRoot: string): Set<string> {
  const result = spawnSync(
    "git",
    [
      ...BENCHMARK_WORKTREE_GIT_CONFIG,
      "-C",
      repositoryRoot,
      "worktree",
      "list",
      "--porcelain",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot inspect benchmark worktrees: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return new Set(
    result.stdout
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => normalizedWorktreePath(line.slice("worktree ".length))),
  );
}

function assertLfStableCheckout(path: string, side: "before" | "after"): void {
  const result = spawnSync(
    "git",
    [...BENCHMARK_WORKTREE_GIT_CONFIG, "-C", path, "ls-files", "--eol"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot inspect ${side} benchmark checkout line endings: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  const crlfPaths = result.stdout
    .split(/\r?\n/u)
    .filter((line) => /\bw\/crlf\b/u.test(line));
  if (crlfPaths.length > 0)
    throw new Error(
      `${side} benchmark checkout is not LF-stable (${crlfPaths.length} CRLF paths).`,
    );
}

async function prepareWorktree(input: {
  readonly repositoryRoot: string;
  readonly temporaryRoot: string;
  readonly outputRoot: string;
  readonly side: "before" | "after";
  readonly revision: string;
  readonly manifest: VerificationManifest;
  readonly pnpmVersion: string;
}): Promise<PreparedWorktree> {
  const startedAt = new Date();
  const startedMonotonic = process.hrtime.bigint();
  const path = resolve(input.temporaryRoot, input.side);
  const add = spawnSync(
    "git",
    [
      ...BENCHMARK_WORKTREE_GIT_CONFIG,
      "-C",
      input.repositoryRoot,
      "worktree",
      "add",
      "--detach",
      path,
      input.revision,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (add.error || add.status !== 0)
    throw new Error(
      `Cannot create ${input.side} benchmark worktree: ${add.error?.message ?? add.stderr.trim()}.`,
    );
  assertLfStableCheckout(path, input.side);
  const commitId = gitText(path, ["rev-parse", "HEAD"]);
  const tree = gitText(path, ["rev-parse", "HEAD^{tree}"]);
  const install = await runCommand(
    {
      id: `benchmark-prepare-${input.side}`,
      executable: "pnpm",
      args: ["install", "--offline", "--frozen-lockfile"],
      parser: "exit-code",
      timeoutMs: 20 * 60 * 1000,
    },
    {
      workingDirectory: path,
      artifactDirectory: resolve(input.outputRoot, "preparation", input.side),
      timeoutMs: 20 * 60 * 1000,
      trustedControllerCommand: true,
    },
  );
  if (install.status !== "PASS" || install.exitCode !== 0)
    throw new Error(
      `${input.side} dependency preparation failed: ${install.message}.`,
    );
  if (!gitStatusClean(path))
    throw new Error(`${input.side} benchmark worktree is dirty after setup.`);
  const protectedFiles = await Promise.all(
    input.manifest.requiredProtectedPaths.map((repositoryPath) =>
      regularFileIdentity(resolve(path, repositoryPath), repositoryPath),
    ),
  );
  const finishedAt = new Date();
  const identity: BenchmarkCandidateIdentity = {
    commit: commitId,
    tree,
    workingTreeDirty: false,
  };
  const environmentManifest: BenchmarkEnvironmentManifest = {
    schemaVersion: "1.0.0",
    side: input.side,
    candidate: identity,
    nodeVersion: process.version,
    pnpmVersion: input.pnpmVersion,
    platform: process.platform,
    architecture: process.arch,
    preparation: {
      worktreeIdentity: basename(path),
      setupStartedAt: startedAt.toISOString(),
      setupFinishedAt: finishedAt.toISOString(),
      setupDurationMs: Number(
        (process.hrtime.bigint() - startedMonotonic) / 1_000_000n,
      ),
      installDurationMs: install.durationMs,
      installStatus: "PASS",
      checkoutPolicy: "lf-longpaths.v1",
      includedInCheckWallTime: false,
    },
    packageJson: await regularFileIdentity(
      resolve(path, "package.json"),
      "package.json",
    ),
    lockfile: await regularFileIdentity(
      resolve(path, "pnpm-lock.yaml"),
      "pnpm-lock.yaml",
    ),
    protectedFiles,
  };
  return {
    side: input.side,
    path,
    identity,
    manifest: assertBenchmarkEnvironmentManifest(environmentManifest),
  };
}

async function removeWorktrees(
  repositoryRoot: string,
  temporaryRoot: string,
  temporaryParent: string,
  worktrees: readonly PreparedWorktree[],
): Promise<void> {
  const resolvedTemporary = resolve(temporaryRoot);
  const resolvedParent = resolve(temporaryParent);
  const ownedRoot = slash(relative(resolvedParent, resolvedTemporary));
  if (
    !safeRepositoryPath(ownedRoot) ||
    !basename(resolvedTemporary).startsWith("stb-")
  )
    throw new Error("Refusing to remove an unowned benchmark temporary root.");
  const paths = new Set(worktrees.map((worktree) => resolve(worktree.path)));
  for (const side of ["before", "after"] as const) {
    const path = resolve(resolvedTemporary, side);
    if (existsSync(path)) paths.add(path);
  }
  for (const path of paths) {
    const owned = slash(relative(resolvedTemporary, path));
    if (!safeRepositoryPath(owned))
      throw new Error("Refusing to remove an unowned benchmark worktree.");
    if (
      registeredWorktreePaths(repositoryRoot).has(normalizedWorktreePath(path))
    ) {
      const removed = spawnSync(
        "git",
        [
          ...BENCHMARK_WORKTREE_GIT_CONFIG,
          "-C",
          repositoryRoot,
          "worktree",
          "remove",
          "--force",
          path,
        ],
        { encoding: "utf8", windowsHide: true },
      );
      if (removed.error || removed.status !== 0)
        throw new Error(
          `Cannot remove benchmark worktree ${owned}: ${removed.error?.message ?? removed.stderr.trim()}.`,
        );
    } else if (existsSync(path))
      await rm(path, { recursive: true, force: true });
  }
  await rm(resolvedTemporary, { recursive: true, force: true });
}

async function latestInventoryReference(
  repositoryRoot: string,
  candidate: BenchmarkCandidateIdentity,
): Promise<BenchmarkTrackedFile> {
  const inventoryRoot = resolve(repositoryRoot, "artifacts", "inventory");
  const entries = await readdir(inventoryRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  for (const directory of directories) {
    const path = resolve(inventoryRoot, directory, "inventory.json");
    try {
      const contents = await readFile(path);
      const inventory = assertArtifactInventory(
        JSON.parse(contents.toString("utf8")),
      );
      if (
        inventory.candidate.gitCommit !== candidate.commit ||
        inventory.candidate.gitTree !== candidate.tree ||
        inventory.candidate.workingTreeDirty
      )
        continue;
      return retainedFileReference(repositoryRoot, path);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        continue;
      throw error;
    }
  }
  throw new Error(
    "No strict artifact inventory exists for the exact clean benchmark candidate.",
  );
}

export const BENCHMARK_BROAD_SAFE_CHECK_IDS = [
  "test-invariants",
  "test-unit",
  "test-orchestrator",
  "typecheck",
  "build",
] as const;

interface SelectorPlan {
  readonly durationMs: number;
  readonly recommendation: AffectedScopeRecommendation;
  readonly iterationSelection: ScopeSelectionResult;
  readonly candidateSelection: ScopeSelectionResult;
}

async function selectorPlan(input: {
  readonly worktree: PreparedWorktree;
  readonly paths: readonly string[];
  readonly fixtureId: string;
  readonly manifest: VerificationManifest;
  readonly policy: Awaited<ReturnType<typeof loadVerificationScopePolicy>>;
}): Promise<SelectorPlan> {
  const started = process.hrtime.bigint();
  const candidatePlan = await planVerificationTier({
    repositoryRoot: input.worktree.path,
    tier: "candidate",
    manifest: input.manifest,
    scopePolicy: input.policy.value,
    scopePolicySha256: input.policy.sha256,
    changedPaths: input.paths,
    changedPathSource: { kind: "fixture", fixtureId: input.fixtureId },
    candidate: {
      baseCommit: input.manifest.d031BaselineCommit,
      gitCommit: input.worktree.identity.commit,
      gitTree: input.worktree.identity.tree,
      workingTreeDirty: false,
    },
  });
  const recommendation = candidatePlan.scopeRecommendation;
  const iterationSelection = finalizeScopeSelection(recommendation, {
    actualCheckIds: recommendation.recommendedCheckIds,
    failingActualCheckIds: [],
  });
  return {
    durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
    recommendation,
    iterationSelection,
    candidateSelection: candidatePlan.scopeSelection,
  };
}

function historicalSelection(input: {
  readonly paths: readonly string[];
  readonly candidate: BenchmarkCandidateIdentity;
  readonly actualCheckIds: readonly string[];
  readonly fullClosureCheckIds: readonly string[];
  readonly packageGraph: PackageGraphSnapshot;
}): ScopeSelectionResult {
  return {
    schemaVersion: "1.0.0",
    mode: "shadow-only",
    authoritative: false,
    closureSuppressionAllowed: false,
    graduationDeferred: true,
    scopeDisposition: "shadow-recommendation",
    changedPathSource: {
      kind: "fixture",
      fixtureId: "historical-pre-d032-safe-workflow",
    },
    changedPaths: input.paths,
    candidate: {
      baseCommit: input.candidate.commit,
      gitCommit: input.candidate.commit,
      gitTree: input.candidate.tree,
      workingTreeDirty: false,
    },
    policyId: "pre-d032-manual-safe-workflow",
    policySha256: sha256("pre-d032-manual-safe-workflow"),
    checkCatalogueSha256: sha256("pre-d032-manual-safe-workflow-catalogue"),
    packageGraph: input.packageGraph,
    classifications: [],
    matchedTriggerClasses: [],
    unknownPaths: [],
    recommendedCheckIds: input.actualCheckIds,
    fullClosureCheckIds: input.fullClosureCheckIds,
    actualCheckIds: input.actualCheckIds,
    omittedFromRecommendationActualCheckIds: [],
    recommendedOnlyCheckIds: [],
    failingActualCheckIds: [],
    falseNegativeCheckIds: [],
  };
}

interface FixtureMatrixResult {
  readonly fixtureCount: number;
  readonly falseNegativeCheckIds: readonly string[];
  readonly unknownPaths: readonly string[];
  readonly deterministic: boolean;
}

async function evaluateShadowFixtureMatrix(input: {
  readonly worktree: PreparedWorktree;
  readonly manifest: VerificationManifest;
  readonly policy: Awaited<ReturnType<typeof loadVerificationScopePolicy>>;
}): Promise<FixtureMatrixResult> {
  const fixtureRoot = resolve(
    input.worktree.path,
    "tools",
    "milestone-orchestrator",
    "test",
    "scope-fixtures",
  );
  const entries = (await readdir(fixtureRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const graph = await buildPackageGraph(input.worktree.path);
  const falseNegatives = new Set<string>();
  const unexpectedUnknowns = new Set<string>();
  let deterministic = true;
  for (const name of entries) {
    const raw = JSON.parse(
      await readFile(resolve(fixtureRoot, name), "utf8"),
    ) as unknown;
    if (
      !isRecord(raw) ||
      raw["schemaVersion"] !== "1.0.0" ||
      !nonEmptyString(raw["id"]) ||
      !uniqueStrings(raw["changedPaths"]) ||
      !uniqueStrings(raw["expectedUnknownPaths"]) ||
      !uniqueStrings(raw["mandatoryExpectedCheckIds"])
    )
      throw new Error(`Scope fixture is malformed: ${name}.`);
    const recommendationInput = {
      changedPaths: raw["changedPaths"],
      changedPathSource: {
        kind: "fixture" as const,
        fixtureId: raw["id"],
      },
      candidate: {
        baseCommit: input.manifest.d031BaselineCommit,
        gitCommit: input.worktree.identity.commit,
        gitTree: input.worktree.identity.tree,
        workingTreeDirty: false,
      },
      manifest: input.manifest,
      policy: input.policy.value,
      policySha256: input.policy.sha256,
      packageGraph: graph,
    };
    const first = recommendAffectedScope(recommendationInput);
    const second = recommendAffectedScope(recommendationInput);
    deterministic &&=
      scopeSelectionBytes(first) === scopeSelectionBytes(second);
    const selection = finalizeScopeSelection(first, {
      actualCheckIds: first.recommendedCheckIds,
      failingActualCheckIds: [],
      mandatoryExpectedCheckIds: raw["mandatoryExpectedCheckIds"],
    });
    for (const id of selection.falseNegativeCheckIds) falseNegatives.add(id);
    const expectedUnknowns = new Set(raw["expectedUnknownPaths"]);
    for (const path of selection.unknownPaths)
      if (!expectedUnknowns.has(path)) unexpectedUnknowns.add(path);
    for (const path of expectedUnknowns)
      if (!selection.unknownPaths.includes(path)) unexpectedUnknowns.add(path);
  }
  return {
    fixtureCount: entries.length,
    falseNegativeCheckIds: [...falseNegatives].sort(),
    unknownPaths: [...unexpectedUnknowns].sort(),
    deterministic,
  };
}

async function unknownExpansion(input: {
  readonly worktree: PreparedWorktree;
  readonly paths: readonly string[];
  readonly manifest: VerificationManifest;
  readonly policy: Awaited<ReturnType<typeof loadVerificationScopePolicy>>;
}): Promise<LoopBenchmarkResult["unknownExpansion"]> {
  const plan = await selectorPlan({
    worktree: input.worktree,
    paths: input.paths,
    fixtureId: "benchmark-unknown-expansion",
    manifest: input.manifest,
    policy: input.policy,
  });
  const selected = plan.candidateSelection.actualCheckIds;
  if (plan.recommendation.unknownPaths.length === 0)
    throw new Error("Benchmark unknown probe did not classify as unknown.");
  return {
    paths: input.paths,
    matchedUnknown: true,
    broadSafeCheckIds: BENCHMARK_BROAD_SAFE_CHECK_IDS,
    selectedCheckIds: selected,
    missingBroadCheckIds: BENCHMARK_BROAD_SAFE_CHECK_IDS.filter(
      (id) => !selected.includes(id),
    ),
  } as LoopBenchmarkResult["unknownExpansion"];
}

function commandDefinition(
  catalogue: ScopeCheckCatalogue,
  id: string,
): ScopeCheckDefinition {
  const definition = catalogue.entries.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Benchmark references unknown check ${id}.`);
  return definition;
}

function verificationCommand(
  definition: ScopeCheckDefinition,
): VerificationCommand {
  const [executable, ...args] = definition.argv;
  if (executable !== "pnpm" && executable !== "node" && executable !== "git")
    throw new Error(
      `Benchmark check ${definition.id} has an unsafe executable.`,
    );
  return {
    id: definition.id,
    executable,
    args,
    parser: "exit-code",
    timeoutMs: 20 * 60 * 1000,
  };
}

async function countsFromReceiptArtifacts(
  artifacts: readonly { readonly path: string; readonly kind: string }[],
): Promise<VerificationTestCounts | null> {
  const counts: VerificationTestCounts[] = [];
  for (const artifact of artifacts) {
    if (!artifact.kind.includes("vitest-report")) continue;
    const parsed = parseVitestCounts(
      JSON.parse(await readFile(artifact.path, "utf8")) as unknown,
    );
    if (parsed) counts.push(parsed);
  }
  return combineTestCounts(counts);
}

interface TelemetryProxy {
  readonly store: Pick<TelemetryStore, "recordCommand">;
  readonly overhead: () => bigint;
}

function measuredTelemetryProxy(store: TelemetryStore): TelemetryProxy {
  let overhead = 0n;
  return {
    store: {
      recordCommand: async (measurement) => {
        const started = process.hrtime.bigint();
        const event = await store.recordCommand(measurement);
        overhead += process.hrtime.bigint() - started;
        return event;
      },
    },
    overhead: () => overhead,
  };
}

async function executeCheck(input: {
  readonly mainRepositoryRoot: string;
  readonly outputRoot: string;
  readonly benchmarkId: string;
  readonly worktree: PreparedWorktree;
  readonly classId: BenchmarkClassId;
  readonly runIndex: number;
  readonly definition: ScopeCheckDefinition;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
  readonly telemetry: TelemetryStore;
}): Promise<BenchmarkCommandMeasurement> {
  const evidenceRoot = resolve(
    input.worktree.path,
    "artifacts",
    "benchmark-command-evidence",
    input.benchmarkId,
    input.classId,
    input.worktree.side,
    `run-${input.runIndex}`,
    input.definition.id,
  );
  const logRoot = resolve(
    input.outputRoot,
    "logs",
    input.classId,
    input.worktree.side,
    `run-${input.runIndex}`,
    input.definition.id,
  );
  const telemetryProxy =
    input.worktree.side === "after"
      ? measuredTelemetryProxy(input.telemetry)
      : null;
  const execution = await runCommand(verificationCommand(input.definition), {
    workingDirectory: input.worktree.path,
    artifactDirectory: logRoot,
    timeoutMs: 20 * 60 * 1000,
    extraEnvironment: {
      LOOP_VERIFY_STAGE_ID: "loop-benchmark",
      LOOP_VERIFY_COMMAND_ID: input.definition.id,
      LOOP_VERIFY_COMMAND_ARTIFACT_DIR: evidenceRoot,
    },
    ...(telemetryProxy
      ? {
          telemetry: {
            store: telemetryProxy.store,
            phase: "verification" as const,
            candidate: {
              baseCommit: input.worktree.identity.commit,
              commit: input.worktree.identity.commit,
              tree: input.worktree.identity.tree,
              dirty: false,
            },
            checkSetId: `loop-benchmark-${input.classId}`,
            selectedCheckIds: input.selectedCheckIds,
            actualCheckIds: input.actualCheckIds,
          },
        }
      : {}),
  });
  if (execution.status !== "PASS" || execution.exitCode !== 0)
    throw new Error(
      `Benchmark check ${input.definition.id} failed on ${input.worktree.side}: ${execution.message}.`,
    );
  const artifactFiles = await snapshotFiles(evidenceRoot);
  const receiptPath = resolve(evidenceRoot, "result.json");
  let receipt: BenchmarkCommandMeasurement["receipt"] = null;
  let receiptAbsenceReason: string | null = null;
  let testCounts: VerificationTestCounts | null = null;
  if (existsSync(receiptPath)) {
    const validated = await validateCommandReceiptDirectory({
      directory: evidenceRoot,
      expectedStageId: "loop-benchmark",
      expectedCommandId: input.definition.id,
      requiredKinds: input.definition.expectedArtifactKinds,
    });
    receipt = {
      sha256: validated.receiptSha256,
      bytes: validated.receiptBytes,
    };
    testCounts = await countsFromReceiptArtifacts(validated.artifacts);
  } else if (
    input.worktree.side === "after" &&
    input.definition.expectedArtifactKinds.length > 0
  ) {
    throw new Error(
      `After benchmark check ${input.definition.id} omitted its required receipt.`,
    );
  } else {
    receiptAbsenceReason =
      input.worktree.side === "before"
        ? "The pre-D032 command did not own a benchmark-compatible receipt."
        : "The command contract declares no required command-owned artifact kind.";
  }
  const stdout = await retainedFileReference(
    input.mainRepositoryRoot,
    execution.stdoutPath,
  );
  const stderr = await retainedFileReference(
    input.mainRepositoryRoot,
    execution.stderrPath,
  );
  return {
    id: input.definition.id,
    argv: input.definition.argv,
    status: "PASS",
    exitCode: 0,
    durationMs: execution.durationMs,
    stdout,
    stderr,
    receipt,
    receiptAbsenceReason,
    testCounts,
    testCountAvailability: testCounts
      ? "measured"
      : input.worktree.side === "before"
        ? "not-recorded-baseline-command"
        : "not-applicable",
    artifacts: artifactMeasurement(artifactFiles),
    telemetryOverheadNanoseconds: telemetryProxy
      ? telemetryProxy.overhead().toString()
      : null,
    telemetryAvailability: telemetryProxy
      ? "measured"
      : "not-applicable-before-d032",
  };
}

function reconstructedArtifactBytes(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value["stages"])) return 0;
  return value["stages"].reduce((stageSum: number, stage: unknown) => {
    if (!isRecord(stage) || !Array.isArray(stage["commands"])) return stageSum;
    return (
      stageSum +
      stage["commands"].reduce((commandSum: number, command: unknown) => {
        if (!isRecord(command) || !isRecord(command["evidence"]))
          return commandSum;
        const artifacts = command["evidence"]["artifacts"];
        if (!Array.isArray(artifacts)) return commandSum;
        return (
          commandSum +
          artifacts.reduce(
            (artifactSum: number, artifact: unknown) =>
              artifactSum +
              (isRecord(artifact) && nonnegativeInteger(artifact["bytes"])
                ? artifact["bytes"]
                : 0),
            0,
          )
        );
      }, 0)
    );
  }, 0);
}

async function exactResultTestCounts(
  resultRoot: string,
  value: unknown,
): Promise<VerificationTestCounts | null> {
  if (!isRecord(value) || !Array.isArray(value["stages"])) return null;
  const counts: VerificationTestCounts[] = [];
  for (const stage of value["stages"]) {
    if (!isRecord(stage) || !Array.isArray(stage["commands"])) continue;
    for (const command of stage["commands"]) {
      if (!isRecord(command) || !isRecord(command["evidence"])) continue;
      const artifacts = command["evidence"]["artifacts"];
      if (!Array.isArray(artifacts)) continue;
      for (const artifact of artifacts) {
        if (
          !isRecord(artifact) ||
          !nonEmptyString(artifact["path"]) ||
          !nonEmptyString(artifact["kind"]) ||
          !artifact["kind"].includes("vitest-report") ||
          !safeRepositoryPath(artifact["path"])
        )
          continue;
        const path = resolve(resultRoot, artifact["path"]);
        const parsed = parseVitestCounts(
          JSON.parse(await readFile(path, "utf8")) as unknown,
        );
        if (parsed) counts.push(parsed);
      }
    }
  }
  return combineTestCounts(counts);
}

async function executeExactClosure(input: {
  readonly mainRepositoryRoot: string;
  readonly outputRoot: string;
  readonly manifest: VerificationManifest;
  readonly worktree: PreparedWorktree;
  readonly runIndex: number;
  readonly telemetry: TelemetryStore;
  readonly fullClosureCheckIds: readonly string[];
}): Promise<BenchmarkRunMeasurement> {
  const logRoot = resolve(
    input.outputRoot,
    "logs",
    "milestone-closure",
    input.worktree.side,
    `run-${input.runIndex}`,
  );
  const telemetryProxy =
    input.worktree.side === "after"
      ? measuredTelemetryProxy(input.telemetry)
      : null;
  const execution = await runCommand(
    {
      id: "exact-readiness",
      executable: "pnpm",
      args: ["verify"],
      parser: "pnpm-verify",
      timeoutMs: 20 * 60 * 1000,
    },
    {
      workingDirectory: input.worktree.path,
      artifactDirectory: logRoot,
      timeoutMs: 20 * 60 * 1000,
      ...(telemetryProxy
        ? {
            telemetry: {
              store: telemetryProxy.store,
              phase: "verification" as const,
              candidate: {
                baseCommit: input.manifest.d031BaselineCommit,
                commit: input.worktree.identity.commit,
                tree: input.worktree.identity.tree,
                dirty: false,
              },
              checkSetId: "loop-benchmark-exact-readiness",
              selectedCheckIds: ["exact-readiness"],
              actualCheckIds: ["exact-readiness"],
            },
          }
        : {}),
    },
  );
  if (execution.exitCode !== 2 || execution.signal !== null)
    throw new Error(
      `Benchmark exact closure did not preserve exit 2 on ${input.worktree.side}: ${execution.message}.`,
    );
  const stdoutText = await readFile(execution.stdoutPath, "utf8");
  const matches = [
    ...stdoutText.matchAll(
      /^\[VERIFY\] result (artifacts[/\\][^\r\n]+[/\\]result\.json)$/gmu,
    ),
  ];
  const reportedPath = matches.at(-1)?.[1];
  if (!reportedPath)
    throw new Error("Benchmark exact closure did not report result.json.");
  const resultPath = resolve(input.worktree.path, reportedPath);
  const resultRoot = dirname(resultPath);
  const resultContents = await readFile(resultPath);
  const raw = JSON.parse(resultContents.toString("utf8")) as unknown;
  if (!isRecord(raw) || !nonEmptyString(raw["runId"]))
    throw new Error("Benchmark exact closure result lacks a run ID.");
  const config = await loadConfig(input.mainRepositoryRoot);
  const state = await new StateStore(
    input.mainRepositoryRoot,
    config.statePath,
  ).load();
  if (!state)
    throw new Error(
      "Benchmark cannot validate exact closure without controller history.",
    );
  const history = readinessHistoryEvidenceForCandidate(
    state.milestones,
    inspectReadinessLifecycle(
      input.worktree.path,
      input.manifest.d031BaselineCommit,
    ),
  );
  if (!history)
    throw new Error(
      "Benchmark exact closure did not resolve readiness history.",
    );
  const summary = await parseAuthoritativeVerification({
    workspacePath: input.worktree.path,
    expectedCommit: input.worktree.identity.commit,
    expectedTree: input.worktree.identity.tree,
    expectedRunId: raw["runId"],
    observedExitCode: 2,
    resultPath,
    copiedResultPath: resolve(resultRoot, "benchmark-copied-result.json"),
    readinessHistory: history,
  });
  if (
    summary.status !== "NOT_READY" ||
    summary.exitCode !== 2 ||
    summary.disposition !== "incremental-readiness" ||
    summary.profileId !== "readiness" ||
    summary.completionEligible ||
    summary.passingStageIds.length !== 5 ||
    summary.notReadyStageIds.length !== 10
  )
    throw new Error(
      "Benchmark exact closure changed the expected readiness floor.",
    );
  const profile = raw["profile"];
  if (!isRecord(profile) || profile["selectedByOverride"] !== false)
    throw new Error("Benchmark exact closure used a profile override.");
  const statuses = summary.stages.map((stage) => stage.status);
  const exact: BenchmarkExactClosure = {
    resultSha256: sha256(resultContents),
    resultBytes: resultContents.byteLength,
    profileId: "readiness",
    selectedByOverride: false,
    status: "NOT_READY",
    exitCode: 2,
    completionEligible: false,
    disposition: "incremental-readiness",
    stageIds: summary.stages.map((stage) => stage.id),
    stageStatuses: statuses,
    passCount: 5,
    notReadyCount: 10,
    failCount: 0,
    errorCount: 0,
    validatedArtifactCount: summary.validatedArtifactCount,
    reconstructedArtifactBytes: reconstructedArtifactBytes(raw),
  };
  if (!validExactClosure(exact))
    throw new Error("Benchmark exact closure summary is malformed.");
  const artifacts = artifactMeasurement(await snapshotFiles(resultRoot));
  const testCounts = await exactResultTestCounts(resultRoot, raw);
  const command: BenchmarkCommandMeasurement = {
    id: "exact-readiness",
    argv: ["pnpm", "verify"],
    status: "NOT_READY",
    exitCode: 2,
    durationMs: execution.durationMs,
    stdout: await retainedFileReference(
      input.mainRepositoryRoot,
      execution.stdoutPath,
    ),
    stderr: await retainedFileReference(
      input.mainRepositoryRoot,
      execution.stderrPath,
    ),
    receipt: null,
    receiptAbsenceReason:
      "Exact closure authority is the independently reconstructed readiness result tree.",
    testCounts,
    testCountAvailability: testCounts ? "measured" : "not-applicable",
    artifacts,
    telemetryOverheadNanoseconds: telemetryProxy
      ? telemetryProxy.overhead().toString()
      : null,
    telemetryAvailability: telemetryProxy
      ? "measured"
      : "not-applicable-before-d032",
  };
  return {
    index: input.runIndex,
    warmup: input.runIndex === 0,
    side: input.worktree.side,
    candidate: input.worktree.identity,
    status: "NOT_READY",
    exitCode: 2,
    durationMs: execution.durationMs,
    selectorPlanningDurationMs: 0,
    selectedCheckIds: ["exact-readiness"],
    actualCheckIds: ["exact-readiness"],
    fullClosureCheckIds: input.fullClosureCheckIds,
    commands: [command],
    testCounts,
    testCountAvailability: testCounts ? "measured" : "not-applicable",
    artifacts,
    selectorDifference: {
      recommendedOnlyCheckIds: [],
      omittedFromRecommendationActualCheckIds: [],
      falseNegativeCheckIds: [],
    },
    telemetryOverheadNanoseconds: command.telemetryOverheadNanoseconds,
    telemetryAvailability: telemetryProxy
      ? "measured"
      : "not-applicable-before-d032",
    exactClosure: exact,
  };
}

function deriveCommandRun(input: {
  readonly worktree: PreparedWorktree;
  readonly index: number;
  readonly planningDurationMs: number;
  readonly selection: ScopeSelectionResult;
  readonly checkIds: readonly string[];
  readonly executed: ReadonlyMap<string, BenchmarkCommandMeasurement>;
}): BenchmarkRunMeasurement {
  const commands = input.checkIds.map((id) => {
    const command = input.executed.get(id);
    if (!command)
      throw new Error(`Benchmark did not execute selected check ${id}.`);
    return command;
  });
  const counts = combineTestCounts(
    commands.flatMap((command) =>
      command.testCounts ? [command.testCounts] : [],
    ),
  );
  const telemetry = commands.reduce(
    (sum, command) => sum + BigInt(command.telemetryOverheadNanoseconds ?? "0"),
    0n,
  );
  return {
    index: input.index,
    warmup: input.index === 0,
    side: input.worktree.side,
    candidate: input.worktree.identity,
    status: "PASS",
    exitCode: 0,
    durationMs: commands.reduce((sum, command) => sum + command.durationMs, 0),
    selectorPlanningDurationMs: input.planningDurationMs,
    selectedCheckIds: input.selection.recommendedCheckIds,
    actualCheckIds: input.checkIds,
    fullClosureCheckIds: input.selection.fullClosureCheckIds,
    commands,
    testCounts: counts,
    testCountAvailability: counts ? "measured" : "not-applicable",
    artifacts: combineArtifactMeasurements(
      commands.map((command) => command.artifacts),
    ),
    selectorDifference: {
      recommendedOnlyCheckIds: input.selection.recommendedOnlyCheckIds,
      omittedFromRecommendationActualCheckIds:
        input.selection.omittedFromRecommendationActualCheckIds,
      falseNegativeCheckIds: input.selection.falseNegativeCheckIds,
    },
    telemetryOverheadNanoseconds:
      input.worktree.side === "after" ? telemetry.toString() : null,
    telemetryAvailability:
      input.worktree.side === "after"
        ? "measured"
        : "not-applicable-before-d032",
    exactClosure: null,
  };
}

function selectionOnlyRun(input: {
  readonly worktree: PreparedWorktree;
  readonly index: number;
  readonly durationMs: number;
  readonly selection: ScopeSelectionResult;
}): BenchmarkRunMeasurement {
  const bytes = Buffer.byteLength(scopeSelectionBytes(input.selection));
  return {
    index: input.index,
    warmup: input.index === 0,
    side: input.worktree.side,
    candidate: input.worktree.identity,
    status: "PASS",
    exitCode: 0,
    durationMs: input.durationMs,
    selectorPlanningDurationMs: input.durationMs,
    selectedCheckIds: input.selection.recommendedCheckIds,
    actualCheckIds: input.selection.actualCheckIds,
    fullClosureCheckIds: input.selection.fullClosureCheckIds,
    commands: [],
    testCounts: null,
    testCountAvailability: "not-applicable",
    artifacts: {
      fileCount: 1,
      totalBytes: bytes,
      manifestSha256: sha256(scopeSelectionBytes(input.selection)),
    },
    selectorDifference: {
      recommendedOnlyCheckIds: input.selection.recommendedOnlyCheckIds,
      omittedFromRecommendationActualCheckIds:
        input.selection.omittedFromRecommendationActualCheckIds,
      falseNegativeCheckIds: input.selection.falseNegativeCheckIds,
    },
    telemetryOverheadNanoseconds: null,
    telemetryAvailability: "not-applicable-selection-only",
    exactClosure: null,
  };
}

function classComparison(
  id: BenchmarkComparisonId,
  beforeRuns: readonly BenchmarkRunMeasurement[],
  afterRuns: readonly BenchmarkRunMeasurement[],
): BenchmarkComparison {
  return {
    id,
    beforeRuns,
    afterRuns,
    beforeStatistics: benchmarkStatistics(beforeRuns),
    afterStatistics: benchmarkStatistics(afterRuns),
  };
}

function historicalCheckIds(
  matrix: BenchmarkMatrix,
  classId: BenchmarkClassId,
  comparisonId: BenchmarkComparisonId,
): readonly string[] {
  if (comparisonId === "iteration")
    return (
      matrix.historical.iterationCheckIdsByClass[classId] ??
      matrix.historical.fullSafeCheckIds
    );
  return matrix.historical.fullSafeCheckIds;
}

function afterSelection(
  plan: SelectorPlan,
  comparisonId: BenchmarkComparisonId,
): ScopeSelectionResult {
  return comparisonId === "iteration"
    ? plan.iterationSelection
    : plan.candidateSelection;
}

async function runCommandWorkflowClass(input: {
  readonly repositoryRoot: string;
  readonly outputRoot: string;
  readonly benchmarkId: string;
  readonly matrix: BenchmarkMatrix;
  readonly matrixClass: BenchmarkMatrixClass;
  readonly before: PreparedWorktree;
  readonly after: PreparedWorktree;
  readonly manifest: VerificationManifest;
  readonly policy: Awaited<ReturnType<typeof loadVerificationScopePolicy>>;
  readonly catalogue: ScopeCheckCatalogue;
  readonly telemetry: TelemetryStore;
}): Promise<BenchmarkClassResult> {
  const runs = new Map<
    BenchmarkComparisonId,
    { before: BenchmarkRunMeasurement[]; after: BenchmarkRunMeasurement[] }
  >(
    input.matrixClass.comparisons.map((comparison) => [
      comparison,
      { before: [], after: [] },
    ]),
  );
  for (let index = 0; index < 4; index += 1) {
    const plan = await selectorPlan({
      worktree: input.after,
      paths: input.matrixClass.paths,
      fixtureId: `benchmark-${input.matrixClass.id}-${index}`,
      manifest: input.manifest,
      policy: input.policy,
    });
    for (const worktree of [input.before, input.after]) {
      const checkSets = new Map<BenchmarkComparisonId, readonly string[]>();
      const selections = new Map<BenchmarkComparisonId, ScopeSelectionResult>();
      for (const comparison of input.matrixClass.comparisons) {
        const selection =
          worktree.side === "after"
            ? afterSelection(plan, comparison)
            : historicalSelection({
                paths: input.matrixClass.paths,
                candidate: worktree.identity,
                actualCheckIds: orderScopeCheckIds(
                  historicalCheckIds(
                    input.matrix,
                    input.matrixClass.id,
                    comparison,
                  ),
                  input.catalogue,
                ),
                fullClosureCheckIds: plan.recommendation.fullClosureCheckIds,
                packageGraph: plan.recommendation.packageGraph,
              });
        const ids =
          worktree.side === "after"
            ? comparison === "iteration"
              ? plan.iterationSelection.actualCheckIds
              : plan.candidateSelection.actualCheckIds
            : selection.actualCheckIds;
        selections.set(comparison, selection);
        checkSets.set(comparison, ids);
      }
      const union = orderScopeCheckIds(
        [
          ...new Set(
            [...checkSets.values()].flatMap((checkIds) => [...checkIds]),
          ),
        ],
        input.catalogue,
      );
      const executed = new Map<string, BenchmarkCommandMeasurement>();
      process.stdout.write(
        `[BENCH] ${input.matrixClass.id} ${worktree.side} run ${index} (${index === 0 ? "warm-up" : "measured"}) executing ${union.length} checks.\n`,
      );
      for (const id of union) {
        const measurement = await executeCheck({
          mainRepositoryRoot: input.repositoryRoot,
          outputRoot: input.outputRoot,
          benchmarkId: input.benchmarkId,
          worktree,
          classId: input.matrixClass.id,
          runIndex: index,
          definition: commandDefinition(input.catalogue, id),
          selectedCheckIds: [
            ...new Set(
              [...selections.values()].flatMap((selection) => [
                ...selection.recommendedCheckIds,
              ]),
            ),
          ],
          actualCheckIds: union,
          telemetry: input.telemetry,
        });
        executed.set(id, measurement);
        process.stdout.write(
          `[BENCH] ${input.matrixClass.id} ${worktree.side} run ${index} ${id} ${measurement.durationMs} ms.\n`,
        );
      }
      for (const comparison of input.matrixClass.comparisons) {
        const bucket = runs.get(comparison);
        const selection = selections.get(comparison);
        const checkIds = checkSets.get(comparison);
        if (!bucket || !selection || !checkIds)
          throw new Error("Benchmark command workflow lost a comparison plan.");
        bucket[worktree.side].push(
          deriveCommandRun({
            worktree,
            index,
            planningDurationMs: worktree.side === "after" ? plan.durationMs : 0,
            selection,
            checkIds,
            executed,
          }),
        );
      }
    }
  }
  return {
    id: input.matrixClass.id,
    measurement: input.matrixClass.measurement,
    paths: input.matrixClass.paths,
    comparisons: input.matrixClass.comparisons.map((id) => {
      const bucket = runs.get(id);
      if (!bucket) throw new Error(`Benchmark class lost comparison ${id}.`);
      return classComparison(id, bucket.before, bucket.after);
    }),
  };
}

async function runSelectionExpansionClass(input: {
  readonly matrix: BenchmarkMatrix;
  readonly matrixClass: BenchmarkMatrixClass;
  readonly before: PreparedWorktree;
  readonly after: PreparedWorktree;
  readonly manifest: VerificationManifest;
  readonly policy: Awaited<ReturnType<typeof loadVerificationScopePolicy>>;
}): Promise<BenchmarkClassResult> {
  const beforeRuns: BenchmarkRunMeasurement[] = [];
  const afterRuns: BenchmarkRunMeasurement[] = [];
  for (let index = 0; index < 4; index += 1) {
    const after = await selectorPlan({
      worktree: input.after,
      paths: input.matrixClass.paths,
      fixtureId: `benchmark-${input.matrixClass.id}-${index}`,
      manifest: input.manifest,
      policy: input.policy,
    });
    const beforeStarted = process.hrtime.bigint();
    const beforeSelection = historicalSelection({
      paths: input.matrixClass.paths,
      candidate: input.before.identity,
      actualCheckIds: orderScopeCheckIds(
        input.matrix.historical.fullSafeCheckIds,
        buildScopeCheckCatalogue(input.manifest),
      ),
      fullClosureCheckIds: after.recommendation.fullClosureCheckIds,
      packageGraph: after.recommendation.packageGraph,
    });
    const beforeDuration = Number(
      (process.hrtime.bigint() - beforeStarted) / 1_000_000n,
    );
    beforeRuns.push(
      selectionOnlyRun({
        worktree: input.before,
        index,
        durationMs: beforeDuration,
        selection: beforeSelection,
      }),
    );
    afterRuns.push(
      selectionOnlyRun({
        worktree: input.after,
        index,
        durationMs: after.durationMs,
        selection: after.candidateSelection,
      }),
    );
    process.stdout.write(
      `[BENCH] ${input.matrixClass.id} selection run ${index} recommended ${after.recommendation.recommendedCheckIds.length} checks in ${after.durationMs} ms.\n`,
    );
  }
  return {
    id: input.matrixClass.id,
    measurement: input.matrixClass.measurement,
    paths: input.matrixClass.paths,
    comparisons: [classComparison("scope-expansion", beforeRuns, afterRuns)],
  };
}

async function runClosureClass(input: {
  readonly repositoryRoot: string;
  readonly outputRoot: string;
  readonly matrixClass: BenchmarkMatrixClass;
  readonly before: PreparedWorktree;
  readonly after: PreparedWorktree;
  readonly manifest: VerificationManifest;
  readonly telemetry: TelemetryStore;
  readonly fullClosureCheckIds: readonly string[];
}): Promise<BenchmarkClassResult> {
  const beforeRuns: BenchmarkRunMeasurement[] = [];
  const afterRuns: BenchmarkRunMeasurement[] = [];
  for (let index = 0; index < 4; index += 1) {
    for (const worktree of [input.before, input.after]) {
      process.stdout.write(
        `[BENCH] milestone-closure ${worktree.side} run ${index} (${index === 0 ? "warm-up" : "measured"}) starting exact pnpm verify.\n`,
      );
      const run = await executeExactClosure({
        mainRepositoryRoot: input.repositoryRoot,
        outputRoot: input.outputRoot,
        manifest: input.manifest,
        worktree,
        runIndex: index,
        telemetry: input.telemetry,
        fullClosureCheckIds: input.fullClosureCheckIds,
      });
      (worktree.side === "before" ? beforeRuns : afterRuns).push(run);
      process.stdout.write(
        `[BENCH] milestone-closure ${worktree.side} run ${index} completed valid NOT_READY in ${run.durationMs} ms.\n`,
      );
    }
  }
  return {
    id: input.matrixClass.id,
    measurement: input.matrixClass.measurement,
    paths: input.matrixClass.paths,
    comparisons: [classComparison("closure", beforeRuns, afterRuns)],
  };
}

function protectedComparison(
  baseline: BenchmarkEnvironmentManifest,
  candidate: BenchmarkEnvironmentManifest,
): LoopBenchmarkResult["protectedComparison"] {
  const candidateByPath = new Map(
    candidate.protectedFiles.map((file) => [file.path, file]),
  );
  const paths = baseline.protectedFiles.map((file) => {
    const after = candidateByPath.get(file.path);
    if (!after)
      throw new Error(
        `Candidate manifest omitted protected file ${file.path}.`,
      );
    return {
      path: file.path,
      baselineSha256: file.sha256,
      candidateSha256: after.sha256,
      matches: file.sha256 === after.sha256,
    };
  });
  return { matched: paths.every((path) => path.matches), paths };
}

function renderBenchmarkSummary(
  result: Omit<LoopBenchmarkResult, "reportingGrowth">,
): string {
  const rows = result.classes.flatMap((benchmarkClass) =>
    benchmarkClass.comparisons.map((comparison) => {
      const difference =
        comparison.beforeStatistics.medianMs -
        comparison.afterStatistics.medianMs;
      return `| ${benchmarkClass.id} | ${comparison.id} | ${comparison.beforeStatistics.medianMs} | ${comparison.afterStatistics.medianMs} | ${difference} | ${comparison.beforeStatistics.medianAbsoluteDeviationMs} / ${comparison.afterStatistics.medianAbsoluteDeviationMs} |`;
    }),
  );
  return `${[
    `# Loop benchmark ${result.benchmarkId}`,
    "",
    `Status: **${result.status}**`,
    "",
    `Baseline: \`${result.baseline.commit}\` / \`${result.baseline.tree}\``,
    `Candidate: \`${result.candidate.commit}\` / \`${result.candidate.tree}\``,
    "",
    "Setup/install time is recorded in the environment manifests and excluded from every check-set wall measurement. Selection-expansion classes measure repeated shadow planning only; they do not claim that affected-scope suppression is active.",
    "",
    "| Class | Comparison | Before median ms | After median ms | Improvement ms | Before/after MAD ms |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    "## Criteria",
    "",
    ...result.criteria.map(
      (criterion) =>
        `- ${criterion.passed ? "PASS" : "FAIL"} \`${criterion.id}\`: ${criterion.summary}`,
    ),
    "",
    `Shadow fixtures: ${result.shadowFixtureMatrix.fixtureCount}; false negatives: ${result.shadowFixtureMatrix.falseNegativeCheckIds.length}; unexpected unknowns: ${result.shadowFixtureMatrix.unknownPaths.length}.`,
    `Protected hashes match: ${String(result.protectedComparison.matched)}.`,
    `Inventory reference is pre-benchmark and must be refreshed after these artifacts: \`${result.inventory.referencedPath}\`.`,
    "",
  ].join("\n")}\n`;
}

export interface BenchmarkCliArguments {
  readonly benchmarkId?: string;
  readonly baselineRevision?: string;
  readonly candidateRevision?: string;
  readonly warmup?: number;
  readonly repeat?: number;
  readonly planOnly: boolean;
}

export function parseBenchmarkCliArguments(
  values: readonly string[],
): BenchmarkCliArguments {
  let benchmarkId: string | undefined;
  let baselineRevision: string | undefined;
  let candidateRevision: string | undefined;
  let warmup: number | undefined;
  let repeat: number | undefined;
  let planOnly = false;
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--plan") {
      if (seen.has(value)) throw new Error("--plan may be supplied only once.");
      seen.add(value);
      planOnly = true;
      continue;
    }
    if (
      value === "--id" ||
      value === "--baseline" ||
      value === "--candidate" ||
      value === "--warmup" ||
      value === "--repeat"
    ) {
      if (seen.has(value))
        throw new Error(`${value} may be supplied only once.`);
      seen.add(value);
      const optionValue = values[index + 1];
      if (!optionValue || optionValue.startsWith("--"))
        throw new Error(`${value} requires one value.`);
      if (value === "--id") {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u.test(optionValue))
          throw new Error("Benchmark ID is unsafe.");
        benchmarkId = optionValue;
      } else if (value === "--baseline") {
        if (!commit(optionValue))
          throw new Error("Benchmark baseline must be an exact commit ID.");
        baselineRevision = optionValue;
      } else if (value === "--candidate") {
        if (optionValue !== "HEAD" && !commit(optionValue))
          throw new Error(
            "Benchmark candidate must be HEAD or an exact commit ID.",
          );
        candidateRevision = optionValue;
      } else {
        if (!/^\d+$/u.test(optionValue))
          throw new Error(`${value} must be a nonnegative integer.`);
        const count = Number(optionValue);
        if (!Number.isSafeInteger(count))
          throw new Error(`${value} is outside the safe integer range.`);
        if (value === "--warmup") warmup = count;
        else repeat = count;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown benchmark option: ${value ?? "(missing)"}.`);
  }
  return {
    ...(benchmarkId ? { benchmarkId } : {}),
    ...(baselineRevision ? { baselineRevision } : {}),
    ...(candidateRevision ? { candidateRevision } : {}),
    ...(warmup === undefined ? {} : { warmup }),
    ...(repeat === undefined ? {} : { repeat }),
    planOnly,
  };
}

function assertRequestedBenchmarkBoundary(
  args: BenchmarkCliArguments,
  plan: Awaited<ReturnType<typeof benchmarkPlan>>,
): void {
  if (
    args.baselineRevision !== undefined &&
    args.baselineRevision !== plan.baselineCommit
  )
    throw new Error(
      "Requested baseline differs from the commissioned D-031 commit.",
    );
  if (
    args.candidateRevision !== undefined &&
    args.candidateRevision !== "HEAD" &&
    args.candidateRevision !== plan.candidateCommit
  )
    throw new Error("Requested candidate differs from exact HEAD.");
  if (args.warmup !== undefined && args.warmup !== plan.warmup)
    throw new Error("Requested warm-up count weakens the commissioned matrix.");
  if (args.repeat !== undefined && args.repeat !== plan.repeat)
    throw new Error("Requested repeat count weakens the commissioned matrix.");
}

export async function benchmarkPlan(
  repositoryRootPath = repositoryRoot(),
): Promise<{
  readonly matrixId: string;
  readonly baselineCommit: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly workingTreeDirty: boolean;
  readonly classIds: readonly BenchmarkClassId[];
  readonly warmup: number;
  readonly repeat: number;
}> {
  const root = resolve(repositoryRootPath);
  const [matrix, manifest] = await Promise.all([
    loadBenchmarkMatrix(root),
    loadVerificationManifest(root),
  ]);
  if (matrix.value.id !== manifest.value.requiredBenchmarkMatrixId)
    throw new Error(
      "Verification manifest references a different benchmark matrix.",
    );
  return {
    matrixId: matrix.value.id,
    baselineCommit: manifest.value.d031BaselineCommit,
    candidateCommit: gitText(root, ["rev-parse", "HEAD"]),
    candidateTree: gitText(root, ["rev-parse", "HEAD^{tree}"]),
    workingTreeDirty: !gitStatusClean(root),
    classIds: matrix.value.classes.map((entry) => entry.id),
    warmup: matrix.value.warmup,
    repeat: matrix.value.repeat,
  };
}

function benchmarkId(now = new Date()): string {
  return `loop-benchmark-${now
    .toISOString()
    .replaceAll(/[^0-9]/gu, "")}-${process.pid}-${randomUUID().slice(0, 8)}`;
}

export async function runLoopBenchmark(
  input: {
    readonly repositoryRoot?: string;
    readonly benchmarkId?: string;
    readonly baselineRevision?: string;
    readonly candidateRevision?: string;
    readonly warmup?: number;
    readonly repeat?: number;
  } = {},
): Promise<LoopBenchmarkResult> {
  const root = resolve(input.repositoryRoot ?? repositoryRoot());
  if (!gitStatusClean(root))
    throw new Error(
      "Loop benchmark requires an exact clean candidate worktree.",
    );
  const startedAt = new Date();
  const id = input.benchmarkId ?? benchmarkId(startedAt);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u.test(id))
    throw new Error("Benchmark ID is unsafe.");
  const outputRoot = resolve(root, "artifacts", "benchmarks", id);
  await mkdir(resolve(root, "artifacts", "benchmarks"), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const [matrix, manifest] = await Promise.all([
    loadBenchmarkMatrix(root),
    loadVerificationManifest(root),
  ]);
  if (matrix.value.id !== manifest.value.requiredBenchmarkMatrixId)
    throw new Error(
      "Verification manifest references a different benchmark matrix.",
    );
  const requestedPlan = {
    matrixId: matrix.value.id,
    baselineCommit: manifest.value.d031BaselineCommit,
    candidateCommit: gitText(root, ["rev-parse", "HEAD"]),
    candidateTree: gitText(root, ["rev-parse", "HEAD^{tree}"]),
    workingTreeDirty: false,
    classIds: matrix.value.classes.map((entry) => entry.id),
    warmup: matrix.value.warmup,
    repeat: matrix.value.repeat,
  } satisfies Awaited<ReturnType<typeof benchmarkPlan>>;
  assertRequestedBenchmarkBoundary(
    {
      ...(input.benchmarkId ? { benchmarkId: input.benchmarkId } : {}),
      ...(input.baselineRevision
        ? { baselineRevision: input.baselineRevision }
        : {}),
      ...(input.candidateRevision
        ? { candidateRevision: input.candidateRevision }
        : {}),
      ...(input.warmup === undefined ? {} : { warmup: input.warmup }),
      ...(input.repeat === undefined ? {} : { repeat: input.repeat }),
      planOnly: false,
    },
    requestedPlan,
  );
  for (const matrixClass of matrix.value.classes) {
    for (const path of matrixClass.paths) {
      if (matrixClass.id === "milestone-closure") continue;
      const metadata = await lstat(resolve(root, path));
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new Error(
          `Benchmark path is not a regular tracked file: ${path}.`,
        );
    }
  }
  const candidateCommit = gitText(root, ["rev-parse", "HEAD"]);
  const candidateTree = gitText(root, ["rev-parse", "HEAD^{tree}"]);
  const candidateIdentity: BenchmarkCandidateIdentity = {
    commit: candidateCommit,
    tree: candidateTree,
    workingTreeDirty: false,
  };
  const inventory = await latestInventoryReference(root, candidateIdentity);
  const ancestor = spawnSync(
    "git",
    [
      "-C",
      root,
      "merge-base",
      "--is-ancestor",
      manifest.value.d031BaselineCommit,
      candidateCommit,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (ancestor.error || ancestor.status !== 0)
    throw new Error(
      "D-031 benchmark baseline is not an ancestor of candidate.",
    );
  const pnpmVersion = currentPnpmVersion(root);
  const temporaryParent = await benchmarkTemporaryParent();
  const temporaryRoot = await mkdtemp(
    join(temporaryParent, `stb-${process.pid}-`),
  );
  const worktrees: PreparedWorktree[] = [];
  const telemetry = await TelemetryStore.open({
    repositoryRoot: root,
    directory: resolve(root, "artifacts", "loop-telemetry", "direct", id),
    runId: id,
    source: "direct",
  });
  let benchmarkClasses: readonly BenchmarkClassResult[];
  let fixtures: FixtureMatrixResult;
  let unknown: LoopBenchmarkResult["unknownExpansion"];
  let baselineManifestReference: BenchmarkTrackedFile;
  let candidateManifestReference: BenchmarkTrackedFile;
  let before: PreparedWorktree;
  let after: PreparedWorktree;
  try {
    before = await prepareWorktree({
      repositoryRoot: root,
      temporaryRoot,
      outputRoot,
      side: "before",
      revision: manifest.value.d031BaselineCommit,
      manifest: manifest.value,
      pnpmVersion,
    });
    worktrees.push(before);
    after = await prepareWorktree({
      repositoryRoot: root,
      temporaryRoot,
      outputRoot,
      side: "after",
      revision: candidateCommit,
      manifest: manifest.value,
      pnpmVersion,
    });
    worktrees.push(after);
    if (
      after.identity.commit !== candidateCommit ||
      after.identity.tree !== candidateTree
    )
      throw new Error("Detached candidate worktree identity drifted.");
    if (
      before.manifest.lockfile.sha256 !== after.manifest.lockfile.sha256 ||
      before.manifest.lockfile.bytes !== after.manifest.lockfile.bytes
    )
      throw new Error(
        "Benchmark commits do not use the exact same dependency lock.",
      );
    await atomicWriteJson(
      resolve(outputRoot, "baseline-manifest.json"),
      before.manifest,
    );
    await atomicWriteJson(
      resolve(outputRoot, "candidate-manifest.json"),
      after.manifest,
    );
    baselineManifestReference = await retainedFileReference(
      root,
      resolve(outputRoot, "baseline-manifest.json"),
    );
    candidateManifestReference = await retainedFileReference(
      root,
      resolve(outputRoot, "candidate-manifest.json"),
    );
    const policy = await loadVerificationScopePolicy(after.path);
    const catalogue = buildScopeCheckCatalogue(manifest.value);
    const fullClosureCheckIds = orderScopeCheckIds(
      [
        ...manifest.value.focusedCommands
          .filter((command) => command.tiers.includes("milestone"))
          .map((command) => command.id),
        "exact-readiness",
      ],
      catalogue,
    );
    fixtures = await evaluateShadowFixtureMatrix({
      worktree: after,
      manifest: manifest.value,
      policy,
    });
    unknown = await unknownExpansion({
      worktree: after,
      paths: matrix.value.unknownProbePaths,
      manifest: manifest.value,
      policy,
    });
    const classes: BenchmarkClassResult[] = [];
    for (const matrixClass of matrix.value.classes) {
      if (matrixClass.measurement === "command-workflows") {
        classes.push(
          await runCommandWorkflowClass({
            repositoryRoot: root,
            outputRoot,
            benchmarkId: id,
            matrix: matrix.value,
            matrixClass,
            before,
            after,
            manifest: manifest.value,
            policy,
            catalogue,
            telemetry,
          }),
        );
      } else if (matrixClass.measurement === "selection-expansion") {
        classes.push(
          await runSelectionExpansionClass({
            matrix: matrix.value,
            matrixClass,
            before,
            after,
            manifest: manifest.value,
            policy,
          }),
        );
      } else {
        classes.push(
          await runClosureClass({
            repositoryRoot: root,
            outputRoot,
            matrixClass,
            before,
            after,
            manifest: manifest.value,
            telemetry,
            fullClosureCheckIds,
          }),
        );
      }
    }
    benchmarkClasses = classes;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await telemetry.complete("ERROR", reason);
    } catch {
      // Retain the original benchmark boundary error.
    }
    await atomicWriteJson(resolve(outputRoot, "benchmark-error.json"), {
      schemaVersion: "1.0.0",
      benchmarkId: id,
      status: "ERROR",
      reason,
      candidateCommit,
      candidateTree,
    });
    throw error;
  } finally {
    await removeWorktrees(root, temporaryRoot, temporaryParent, worktrees);
  }
  const protectedHashes = protectedComparison(before.manifest, after.manifest);
  const provisionalCriteria = evaluateBenchmarkCriteria({
    matrix: matrix.value,
    classes: benchmarkClasses,
    shadowFixtureMatrix: fixtures,
    unknownExpansion: unknown,
    protectedComparison: protectedHashes,
    telemetryManifestBytes: 1,
    inventoryBytes: inventory.bytes,
  });
  const failures = provisionalCriteria
    .filter((criterion) => !criterion.passed)
    .map((criterion) => criterion.id);
  const status = failures.length === 0 ? "PASS" : "FAIL";
  await telemetry.complete(status);
  const telemetryReference = await retainedFileReference(
    root,
    resolve(root, telemetry.repositoryRelativeManifestPath()),
  );
  const criteria = evaluateBenchmarkCriteria({
    matrix: matrix.value,
    classes: benchmarkClasses,
    shadowFixtureMatrix: fixtures,
    unknownExpansion: unknown,
    protectedComparison: protectedHashes,
    telemetryManifestBytes: telemetryReference.bytes,
    inventoryBytes: inventory.bytes,
  });
  const finishedAt = new Date();
  const resultWithoutGrowth = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    benchmarkId: id,
    matrix: {
      path: matrix.path,
      sha256: matrix.sha256,
      bytes: matrix.bytes,
      id: matrix.value.id,
    },
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    baselineManifest: baselineManifestReference,
    candidateManifest: candidateManifestReference,
    baseline: before.identity,
    candidate: after.identity,
    serial: true,
    warmupRunsPerSideAndClass: 1,
    measuredRunsPerSideAndClass: 3,
    classes: benchmarkClasses,
    shadowFixtureMatrix: fixtures,
    unknownExpansion: unknown,
    protectedComparison: protectedHashes,
    telemetry: {
      manifestPath: telemetryReference.path,
      manifestSha256: telemetryReference.sha256,
      manifestBytes: telemetryReference.bytes,
      overheadAvailability: "measured" as const,
    },
    inventory: {
      referencedPath: inventory.path,
      sha256: inventory.sha256,
      bytes: inventory.bytes,
      timing: "pre-benchmark" as const,
      postBenchmarkRefreshRequired: true as const,
    },
    criteria,
    failures: criteria
      .filter((criterion) => !criterion.passed)
      .map((criterion) => criterion.id),
  } satisfies Omit<LoopBenchmarkResult, "reportingGrowth">;
  const summary = renderBenchmarkSummary(resultWithoutGrowth);
  await writeFile(resolve(outputRoot, "benchmark-summary.md"), summary, "utf8");
  const summaryReference = await retainedFileReference(
    root,
    resolve(outputRoot, "benchmark-summary.md"),
  );
  const result: LoopBenchmarkResult = {
    ...resultWithoutGrowth,
    reportingGrowth: {
      baselineManifestBytes: baselineManifestReference.bytes,
      candidateManifestBytes: candidateManifestReference.bytes,
      summaryBytes: summaryReference.bytes,
      benchmarkJsonBytes: null,
      benchmarkJsonBytesReason: "self-referential-report-size",
    },
  };
  assertLoopBenchmark(result);
  await atomicWriteJson(resolve(outputRoot, "benchmark.json"), result);
  process.stdout.write(
    `[BENCH] ${status} result: ${slash(relative(root, resolve(outputRoot, "benchmark.json")))}\n`,
  );
  return result;
}

async function main(): Promise<number> {
  try {
    const args = parseBenchmarkCliArguments(process.argv.slice(2));
    if (args.planOnly) {
      const plan = await benchmarkPlan();
      assertRequestedBenchmarkBoundary(args, plan);
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }
    const result = await runLoopBenchmark({
      ...(args.benchmarkId ? { benchmarkId: args.benchmarkId } : {}),
      ...(args.baselineRevision
        ? { baselineRevision: args.baselineRevision }
        : {}),
      ...(args.candidateRevision
        ? { candidateRevision: args.candidateRevision }
        : {}),
      ...(args.warmup === undefined ? {} : { warmup: args.warmup }),
      ...(args.repeat === undefined ? {} : { repeat: args.repeat }),
    });
    return result.status === "PASS" ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    return 3;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
