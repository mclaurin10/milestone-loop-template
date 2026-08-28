import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { arch, endianness, platform, release } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const TEST_RUN_SUMMARY_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_RUN_REDUCTION_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_RUN_MEASUREMENT_PROTOCOL_ID =
  "milestone-loop-test-run-measurement.v1" as const;
export const TEST_RUN_SUMMARY_KIND = "test-run-summary" as const;
export const TEST_RUN_REDUCTION_KIND = "test-run-summary-reduction" as const;
export const TEST_RUN_SUMMARY_NAME = "test-run-summary.json" as const;
export const TEST_RUN_REDUCTION_NAME =
  "test-run-summary-reduction.json" as const;

const PROBE_SCHEMA_VERSION = "1.0.0" as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_ID_PATTERN = /^[a-f0-9]{40}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;
const COMPLETE_PROBE_RECORD_PATTERN = /^probe-[0-9]+-[a-f0-9]{16}\.json$/u;
const INCOMPLETE_PROBE_RECORD_PATTERN =
  /^probe-[0-9]+-[a-f0-9]{16}\.json\.tmp$/u;
const INCOMPLETE_PROBE_REASON =
  "incomplete-instrumented-node-process-records" as const;
const PROBE_SETTLE_ATTEMPTS = 20;
const PROBE_SETTLE_DELAY_MS = 25;
const PROBE_PATH = resolve(import.meta.dirname, "test-run-probe.cjs");

export type TestRunRole = "legacy" | "partition" | "legacy-extra";
export type MeasurementAvailability =
  "measured" | "unavailable" | "not-applicable";

export interface TestRunCandidate {
  readonly gitCommit: string;
  readonly gitTree: string;
  readonly workingTreeDirty: boolean;
}

export interface TestRunCommandIdentity extends TestRunCandidate {
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
}

export interface TestRunReportSummary {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly fileCount: number;
  readonly testCount: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly testBodyNanoseconds: string | null;
  readonly testBodyAvailability: "measured" | "report-field-unavailable";
}

export interface DurationMeasurement {
  readonly availability: MeasurementAvailability;
  readonly nanoseconds: string | null;
  readonly sampleCount: number;
  readonly reason: string | null;
}

export interface CpuMeasurement {
  readonly availability: MeasurementAvailability;
  readonly userMicroseconds: string | null;
  readonly systemMicroseconds: string | null;
  readonly totalMicroseconds: string | null;
  readonly processCount: number;
  readonly reason: string | null;
}

export interface RssMeasurement {
  readonly availability: MeasurementAvailability;
  readonly bytes: string | null;
  readonly processCount: number;
  readonly aggregation: "maximum-instrumented-process-peak";
  readonly reason: string | null;
}

export interface TestRunSummary {
  readonly schemaVersion: typeof TEST_RUN_SUMMARY_SCHEMA_VERSION;
  readonly protocolId: typeof TEST_RUN_MEASUREMENT_PROTOCOL_ID;
  readonly status: "PASS";
  readonly run: {
    readonly runId: string;
    readonly stageId: string;
    readonly commandId: string;
    readonly role: TestRunRole;
    readonly owner: string | null;
  };
  readonly candidate: TestRunCandidate;
  readonly platform: {
    readonly os: NodeJS.Platform;
    readonly release: string;
    readonly arch: string;
    readonly endianness: "BE" | "LE";
    readonly nodeVersion: string;
    readonly pnpmVersion: string;
  };
  readonly timestamps: {
    readonly startedAt: string;
    readonly finishedAt: string;
  };
  readonly boundaries: {
    readonly wallTime: string;
    readonly setupTime: string;
    readonly gitFixtureTime: string;
    readonly processStartupTime: string;
    readonly testBodyTime: string;
    readonly cpuTime: string;
    readonly peakRss: string;
    readonly relationship: string;
  };
  readonly units: {
    readonly duration: "nanoseconds";
    readonly cpu: "microseconds";
    readonly memory: "bytes";
  };
  readonly reports: readonly TestRunReportSummary[];
  readonly reportSetSha256: string;
  readonly testCounts: {
    readonly files: number;
    readonly tests: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly measurements: {
    readonly wallTime: DurationMeasurement;
    readonly setupTime: DurationMeasurement;
    readonly gitFixtureTime: DurationMeasurement;
    readonly processStartupTime: DurationMeasurement;
    readonly testBodyTime: DurationMeasurement;
    readonly cpuTime: CpuMeasurement;
    readonly peakRss: RssMeasurement;
  };
  readonly probe: {
    readonly availability: "measured" | "unavailable";
    readonly processCount: number;
    readonly synchronousLaunchCount: number;
    readonly recordsSha256: string | null;
    readonly reason: string | null;
  };
  readonly nonSemantic: {
    readonly changesTestSuccess: false;
    readonly authorizesCutover: false;
    readonly benchmarkClaim: false;
  };
  readonly contentSha256: string;
}

interface ProbeRecord {
  readonly schemaVersion: typeof PROBE_SCHEMA_VERSION;
  readonly probeId: string;
  readonly pid: number;
  readonly ppid: number;
  readonly platform: string;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly wallNanoseconds: string;
  readonly userCpuMicroseconds: string;
  readonly systemCpuMicroseconds: string;
  readonly maxRssBytes: string;
  readonly gitInvocationCount: number;
  readonly gitWallNanoseconds: string;
  readonly processStartupSampleCount: number;
  readonly processStartupNanoseconds: string;
  readonly synchronousLaunchCount: number;
}

export interface TestRunSummaryExpectation {
  readonly runId: string;
  readonly stageId: string;
  readonly commandId: string;
  readonly role: TestRunRole;
  readonly owner: string | null;
  readonly candidate: TestRunCandidate;
}

export interface ValidatedTestRunSummarySource {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly summary: TestRunSummary;
}

export interface TestRunReduction {
  readonly schemaVersion: typeof TEST_RUN_REDUCTION_SCHEMA_VERSION;
  readonly protocolId: typeof TEST_RUN_MEASUREMENT_PROTOCOL_ID;
  readonly status: "PASS";
  readonly candidate: TestRunCandidate;
  readonly inputCount: number;
  readonly inputSetSha256: string;
  readonly inputs: readonly {
    readonly runId: string;
    readonly stageId: string;
    readonly commandId: string;
    readonly role: TestRunRole;
    readonly owner: string | null;
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly contentSha256: string;
  }[];
  readonly platforms: readonly TestRunSummary["platform"][];
  readonly observedTestCounts: TestRunSummary["testCounts"];
  readonly measurements: {
    readonly wallTime: ReducedDurationMeasurement;
    readonly setupTime: ReducedDurationMeasurement;
    readonly gitFixtureTime: ReducedDurationMeasurement;
    readonly processStartupTime: ReducedDurationMeasurement;
    readonly testBodyTime: ReducedDurationMeasurement;
    readonly cpuTime: {
      readonly measuredCount: number;
      readonly unavailableCount: number;
      readonly notApplicableCount: number;
      readonly userMicroseconds: string;
      readonly systemMicroseconds: string;
      readonly totalMicroseconds: string;
      readonly dispositions: readonly MeasurementDispositionCount[];
    };
    readonly peakRss: {
      readonly measuredCount: number;
      readonly unavailableCount: number;
      readonly notApplicableCount: number;
      readonly maximumBytes: string | null;
      readonly aggregation: "maximum-of-summary-process-peaks";
      readonly dispositions: readonly MeasurementDispositionCount[];
    };
  };
  readonly nonSemantic: {
    readonly changesTestSuccess: false;
    readonly authorizesCutover: false;
    readonly benchmarkClaim: false;
  };
  readonly contentSha256: string;
}

export interface MeasurementDispositionCount {
  readonly availability: MeasurementAvailability;
  readonly reason: string | null;
  readonly count: number;
}

export interface ReducedDurationMeasurement {
  readonly measuredCount: number;
  readonly unavailableCount: number;
  readonly notApplicableCount: number;
  readonly totalNanoseconds: string;
  readonly sampleCount: number;
  readonly dispositions: readonly MeasurementDispositionCount[];
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareStrings);
  const sortedExpected = [...expected].sort(compareStrings);
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  )
    throw new Error(`${label} has unexpected or missing fields.`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new Error("Canonical JSON cannot encode undefined values.");
  return serialized;
}

function semanticHash(value: Record<string, unknown>): string {
  const content = { ...value };
  delete content["contentSha256"];
  return sha256(canonicalJson(content));
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function safeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error(`${label} must be a non-negative safe integer.`);
  return Number(value);
}

function decimal(value: unknown, label: string): string {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value))
    throw new Error(`${label} must be a non-negative decimal string.`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  const text = nonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(text)))
    throw new Error(`${label} must be an ISO timestamp.`);
  return text;
}

function canonicalRelativePath(value: unknown, label: string): string {
  const text = nonEmptyString(value, label).replaceAll("\\", "/");
  if (
    text.startsWith("/") ||
    /^[A-Za-z]:\//u.test(text) ||
    text.split("/").some((part) => part === "" || part === "." || part === "..")
  )
    throw new Error(`${label} must be a canonical relative path.`);
  return text;
}

function candidate(value: unknown, label: string): TestRunCandidate {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  exactKeys(value, ["gitCommit", "gitTree", "workingTreeDirty"], label);
  if (
    typeof value["gitCommit"] !== "string" ||
    !GIT_ID_PATTERN.test(value["gitCommit"]) ||
    typeof value["gitTree"] !== "string" ||
    !GIT_ID_PATTERN.test(value["gitTree"]) ||
    typeof value["workingTreeDirty"] !== "boolean"
  )
    throw new Error(`${label} is invalid.`);
  return value as unknown as TestRunCandidate;
}

function sameCandidate(
  left: TestRunCandidate,
  right: TestRunCandidate,
): boolean {
  return (
    left.gitCommit === right.gitCommit &&
    left.gitTree === right.gitTree &&
    left.workingTreeDirty === right.workingTreeDirty
  );
}

function availability(value: unknown, label: string): MeasurementAvailability {
  if (
    !new Set(["measured", "unavailable", "not-applicable"]).has(value as string)
  )
    throw new Error(`${label} has an unsupported availability disposition.`);
  return value as MeasurementAvailability;
}

function validateDuration(value: unknown, label: string): DurationMeasurement {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  exactKeys(
    value,
    ["availability", "nanoseconds", "sampleCount", "reason"],
    label,
  );
  const disposition = availability(
    value["availability"],
    `${label}.availability`,
  );
  const sampleCount = safeCount(value["sampleCount"], `${label}.sampleCount`);
  if (disposition === "measured") {
    decimal(value["nanoseconds"], `${label}.nanoseconds`);
    if (value["reason"] !== null)
      throw new Error(
        `${label} measured values cannot have an unavailable reason.`,
      );
  } else {
    if (value["nanoseconds"] !== null || sampleCount !== 0)
      throw new Error(
        `${label} unavailable values cannot contain measurements.`,
      );
    nonEmptyString(value["reason"], `${label}.reason`);
  }
  return value as unknown as DurationMeasurement;
}

function validateCpu(value: unknown): CpuMeasurement {
  if (!isRecord(value)) throw new Error("CPU measurement must be an object.");
  exactKeys(
    value,
    [
      "availability",
      "userMicroseconds",
      "systemMicroseconds",
      "totalMicroseconds",
      "processCount",
      "reason",
    ],
    "CPU measurement",
  );
  const disposition = availability(value["availability"], "CPU availability");
  const processCount = safeCount(value["processCount"], "CPU process count");
  if (disposition === "measured") {
    const user = BigInt(decimal(value["userMicroseconds"], "CPU user time"));
    const system = BigInt(
      decimal(value["systemMicroseconds"], "CPU system time"),
    );
    const total = BigInt(decimal(value["totalMicroseconds"], "CPU total time"));
    if (
      user + system !== total ||
      processCount === 0 ||
      value["reason"] !== null
    )
      throw new Error(
        "CPU measurement totals or process coverage are contradictory.",
      );
  } else if (
    value["userMicroseconds"] !== null ||
    value["systemMicroseconds"] !== null ||
    value["totalMicroseconds"] !== null ||
    processCount !== 0 ||
    typeof value["reason"] !== "string" ||
    value["reason"].length === 0
  )
    throw new Error(
      "Unavailable CPU measurement contains contradictory values.",
    );
  return value as unknown as CpuMeasurement;
}

function validateRss(value: unknown): RssMeasurement {
  if (!isRecord(value))
    throw new Error("Peak RSS measurement must be an object.");
  exactKeys(
    value,
    ["availability", "bytes", "processCount", "aggregation", "reason"],
    "Peak RSS measurement",
  );
  const disposition = availability(
    value["availability"],
    "Peak RSS availability",
  );
  const processCount = safeCount(
    value["processCount"],
    "Peak RSS process count",
  );
  if (value["aggregation"] !== "maximum-instrumented-process-peak")
    throw new Error("Peak RSS aggregation is unsupported.");
  if (disposition === "measured") {
    decimal(value["bytes"], "Peak RSS bytes");
    if (processCount === 0 || value["reason"] !== null)
      throw new Error("Peak RSS process coverage is contradictory.");
  } else if (
    value["bytes"] !== null ||
    processCount !== 0 ||
    typeof value["reason"] !== "string" ||
    value["reason"].length === 0
  )
    throw new Error("Unavailable peak RSS contains contradictory values.");
  return value as unknown as RssMeasurement;
}

function reportSetHash(reports: readonly TestRunReportSummary[]): string {
  return sha256(
    `${reports
      .map((report) =>
        canonicalJson({
          path: report.path,
          bytes: report.bytes,
          sha256: report.sha256,
          fileCount: report.fileCount,
          testCount: report.testCount,
          passed: report.passed,
          failed: report.failed,
          skipped: report.skipped,
          testBodyNanoseconds: report.testBodyNanoseconds,
          testBodyAvailability: report.testBodyAvailability,
        }),
      )
      .join("\n")}\n`,
  );
}

function validateReport(value: unknown, label: string): TestRunReportSummary {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  exactKeys(
    value,
    [
      "path",
      "bytes",
      "sha256",
      "fileCount",
      "testCount",
      "passed",
      "failed",
      "skipped",
      "testBodyNanoseconds",
      "testBodyAvailability",
    ],
    label,
  );
  canonicalRelativePath(value["path"], `${label}.path`);
  const bytes = safeCount(value["bytes"], `${label}.bytes`);
  if (
    bytes === 0 ||
    typeof value["sha256"] !== "string" ||
    !SHA256_PATTERN.test(value["sha256"])
  )
    throw new Error(`${label} byte/hash identity is invalid.`);
  const files = safeCount(value["fileCount"], `${label}.fileCount`);
  const tests = safeCount(value["testCount"], `${label}.testCount`);
  const passed = safeCount(value["passed"], `${label}.passed`);
  const failed = safeCount(value["failed"], `${label}.failed`);
  const skipped = safeCount(value["skipped"], `${label}.skipped`);
  if (files === 0 || tests === 0 || passed + failed + skipped !== tests)
    throw new Error(`${label} contains contradictory test counts.`);
  if (value["testBodyAvailability"] === "measured") {
    decimal(value["testBodyNanoseconds"], `${label}.testBodyNanoseconds`);
  } else if (
    value["testBodyAvailability"] !== "report-field-unavailable" ||
    value["testBodyNanoseconds"] !== null
  )
    throw new Error(`${label} has contradictory test-body availability.`);
  return value as unknown as TestRunReportSummary;
}

export function assertTestRunSummary(
  value: unknown,
  expected?: TestRunSummaryExpectation,
): TestRunSummary {
  if (!isRecord(value)) throw new Error("Test-run summary must be an object.");
  exactKeys(
    value,
    [
      "schemaVersion",
      "protocolId",
      "status",
      "run",
      "candidate",
      "platform",
      "timestamps",
      "boundaries",
      "units",
      "reports",
      "reportSetSha256",
      "testCounts",
      "measurements",
      "probe",
      "nonSemantic",
      "contentSha256",
    ],
    "Test-run summary",
  );
  if (
    value["schemaVersion"] !== TEST_RUN_SUMMARY_SCHEMA_VERSION ||
    value["protocolId"] !== TEST_RUN_MEASUREMENT_PROTOCOL_ID ||
    value["status"] !== "PASS"
  )
    throw new Error("Test-run summary schema, protocol, or status is invalid.");

  const run = value["run"];
  if (!isRecord(run)) throw new Error("Test-run identity must be an object.");
  exactKeys(
    run,
    ["runId", "stageId", "commandId", "role", "owner"],
    "Test-run identity",
  );
  const runId = nonEmptyString(run["runId"], "Test-run ID");
  if (!RUN_ID_PATTERN.test(runId)) throw new Error("Test-run ID is malformed.");
  nonEmptyString(run["stageId"], "Test-run stage ID");
  nonEmptyString(run["commandId"], "Test-run command ID");
  if (
    !new Set<TestRunRole>(["legacy", "partition", "legacy-extra"]).has(
      run["role"] as TestRunRole,
    )
  )
    throw new Error("Test-run role is unsupported.");
  if (!(
    run["owner"] === null ||
    (typeof run["owner"] === "string" && run["owner"].length > 0)
  ))
    throw new Error("Test-run owner is invalid.");
  if ((run["role"] === "partition") !== (run["owner"] !== null))
    throw new Error("Only partition summaries can declare an owner.");

  candidate(value["candidate"], "Test-run candidate");
  const provenance = value["platform"];
  if (!isRecord(provenance))
    throw new Error("Test-run platform must be an object.");
  exactKeys(
    provenance,
    ["os", "release", "arch", "endianness", "nodeVersion", "pnpmVersion"],
    "Test-run platform",
  );
  for (const key of ["os", "release", "arch", "nodeVersion", "pnpmVersion"])
    nonEmptyString(provenance[key], `Test-run platform ${key}`);
  if (provenance["endianness"] !== "BE" && provenance["endianness"] !== "LE")
    throw new Error("Test-run platform endianness is invalid.");

  const times = value["timestamps"];
  if (!isRecord(times))
    throw new Error("Test-run timestamps must be an object.");
  exactKeys(times, ["startedAt", "finishedAt"], "Test-run timestamps");
  const startedAt = timestamp(times["startedAt"], "Test-run start");
  const finishedAt = timestamp(times["finishedAt"], "Test-run finish");
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    throw new Error("Test-run timestamps are contradictory.");

  const boundaries = value["boundaries"];
  if (!isRecord(boundaries))
    throw new Error("Measurement boundaries must be an object.");
  exactKeys(
    boundaries,
    [
      "wallTime",
      "setupTime",
      "gitFixtureTime",
      "processStartupTime",
      "testBodyTime",
      "cpuTime",
      "peakRss",
      "relationship",
    ],
    "Measurement boundaries",
  );
  for (const [key, boundary] of Object.entries(boundaries))
    nonEmptyString(boundary, `Measurement boundary ${key}`);

  const units = value["units"];
  if (!isRecord(units)) throw new Error("Measurement units must be an object.");
  exactKeys(units, ["duration", "cpu", "memory"], "Measurement units");
  if (
    units["duration"] !== "nanoseconds" ||
    units["cpu"] !== "microseconds" ||
    units["memory"] !== "bytes"
  )
    throw new Error("Measurement units are unsupported.");

  if (!Array.isArray(value["reports"]) || value["reports"].length === 0)
    throw new Error("Test-run summary requires at least one report.");
  const reports = value["reports"].map((item, index) =>
    validateReport(item, `Test-run report ${index}`),
  );
  const sortedReports = [...reports].sort((left, right) =>
    compareStrings(left.path, right.path),
  );
  if (
    reports.some((item, index) => item.path !== sortedReports[index]?.path) ||
    new Set(reports.map((item) => item.path)).size !== reports.length
  )
    throw new Error(
      "Test-run reports must be unique and deterministically ordered.",
    );
  if (value["reportSetSha256"] !== reportSetHash(reports))
    throw new Error("Test-run report-set hash is invalid.");

  const counts = value["testCounts"];
  if (!isRecord(counts)) throw new Error("Test-run counts must be an object.");
  exactKeys(
    counts,
    ["files", "tests", "passed", "failed", "skipped"],
    "Test-run counts",
  );
  const expectedCounts = {
    files: reports.reduce((sum, item) => sum + item.fileCount, 0),
    tests: reports.reduce((sum, item) => sum + item.testCount, 0),
    passed: reports.reduce((sum, item) => sum + item.passed, 0),
    failed: reports.reduce((sum, item) => sum + item.failed, 0),
    skipped: reports.reduce((sum, item) => sum + item.skipped, 0),
  };
  for (const [key, expectedValue] of Object.entries(expectedCounts))
    if (safeCount(counts[key], `Test-run count ${key}`) !== expectedValue)
      throw new Error("Test-run aggregate counts contradict report inputs.");
  if (
    expectedCounts.failed !== 0 ||
    expectedCounts.skipped !== 0 ||
    expectedCounts.passed !== expectedCounts.tests
  )
    throw new Error(
      "A passing test-run summary must describe all-passing reports.",
    );

  const measurements = value["measurements"];
  if (!isRecord(measurements))
    throw new Error("Test-run measurements must be an object.");
  exactKeys(
    measurements,
    [
      "wallTime",
      "setupTime",
      "gitFixtureTime",
      "processStartupTime",
      "testBodyTime",
      "cpuTime",
      "peakRss",
    ],
    "Test-run measurements",
  );
  const wall = validateDuration(
    measurements["wallTime"],
    "Wall-time measurement",
  );
  const setup = validateDuration(
    measurements["setupTime"],
    "Setup-time measurement",
  );
  validateDuration(measurements["gitFixtureTime"], "Git-fixture measurement");
  validateDuration(
    measurements["processStartupTime"],
    "Process-startup measurement",
  );
  validateDuration(measurements["testBodyTime"], "Test-body measurement");
  validateCpu(measurements["cpuTime"]);
  validateRss(measurements["peakRss"]);
  if (wall.availability !== "measured" || setup.availability !== "measured")
    throw new Error("Wall and setup time must always be measured.");
  if (BigInt(setup.nanoseconds ?? "0") > BigInt(wall.nanoseconds ?? "0"))
    throw new Error("Setup time cannot exceed the measured run wall time.");

  const probe = value["probe"];
  if (!isRecord(probe)) throw new Error("Test-run probe must be an object.");
  exactKeys(
    probe,
    [
      "availability",
      "processCount",
      "synchronousLaunchCount",
      "recordsSha256",
      "reason",
    ],
    "Test-run probe",
  );
  const processCount = safeCount(probe["processCount"], "Probe process count");
  safeCount(probe["synchronousLaunchCount"], "Probe synchronous launch count");
  if (probe["availability"] === "measured") {
    if (
      processCount === 0 ||
      typeof probe["recordsSha256"] !== "string" ||
      !SHA256_PATTERN.test(probe["recordsSha256"]) ||
      probe["reason"] !== null
    )
      throw new Error("Measured probe identity is contradictory.");
  } else if (
    probe["availability"] !== "unavailable" ||
    processCount !== 0 ||
    probe["recordsSha256"] !== null ||
    typeof probe["reason"] !== "string" ||
    probe["reason"].length === 0
  )
    throw new Error("Unavailable probe identity is contradictory.");

  const nonSemantic = value["nonSemantic"];
  if (!isRecord(nonSemantic))
    throw new Error("Test-run semantic boundary must be an object.");
  exactKeys(
    nonSemantic,
    ["changesTestSuccess", "authorizesCutover", "benchmarkClaim"],
    "Test-run semantic boundary",
  );
  if (
    nonSemantic["changesTestSuccess"] !== false ||
    nonSemantic["authorizesCutover"] !== false ||
    nonSemantic["benchmarkClaim"] !== false
  )
    throw new Error(
      "Test-run metrics cannot change semantics or authorize cutover.",
    );

  if (
    typeof value["contentSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["contentSha256"]) ||
    semanticHash(value) !== value["contentSha256"]
  )
    throw new Error("Test-run summary content hash is invalid.");

  const summary = value as unknown as TestRunSummary;
  if (expected) {
    if (summary.run.runId !== expected.runId)
      throw new Error(
        `Stale test-run summary: expected run ${expected.runId}; received ${summary.run.runId}.`,
      );
    if (
      summary.run.stageId !== expected.stageId ||
      summary.run.commandId !== expected.commandId ||
      summary.run.role !== expected.role ||
      summary.run.owner !== expected.owner
    )
      throw new Error("Test-run summary command identity is mismatched.");
    if (!sameCandidate(summary.candidate, expected.candidate))
      throw new Error("Test-run summary candidate identity is mismatched.");
  }
  return summary;
}

function requireCommandIdentity(value: TestRunCommandIdentity): void {
  candidate(
    {
      gitCommit: value.gitCommit,
      gitTree: value.gitTree,
      workingTreeDirty: value.workingTreeDirty,
    },
    "Measurement command identity",
  );
  nonEmptyString(value.nodeVersion, "Measurement Node version");
  nonEmptyString(value.pnpmVersion, "Measurement pnpm version");
}

function probeRecord(value: unknown, expectedProbeId: string): ProbeRecord {
  if (!isRecord(value))
    throw new Error("Test-run probe record must be an object.");
  exactKeys(
    value,
    [
      "schemaVersion",
      "probeId",
      "pid",
      "ppid",
      "platform",
      "arch",
      "nodeVersion",
      "startedAt",
      "finishedAt",
      "wallNanoseconds",
      "userCpuMicroseconds",
      "systemCpuMicroseconds",
      "maxRssBytes",
      "gitInvocationCount",
      "gitWallNanoseconds",
      "processStartupSampleCount",
      "processStartupNanoseconds",
      "synchronousLaunchCount",
    ],
    "Test-run probe record",
  );
  if (
    value["schemaVersion"] !== PROBE_SCHEMA_VERSION ||
    value["probeId"] !== expectedProbeId
  )
    throw new Error("Test-run probe schema or identity is mismatched.");
  safeCount(value["pid"], "Probe PID");
  safeCount(value["ppid"], "Probe parent PID");
  for (const key of ["platform", "arch", "nodeVersion"])
    nonEmptyString(value[key], `Probe ${key}`);
  const startedAt = timestamp(value["startedAt"], "Probe start");
  const finishedAt = timestamp(value["finishedAt"], "Probe finish");
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    throw new Error("Probe timestamps are contradictory.");
  for (const key of [
    "wallNanoseconds",
    "userCpuMicroseconds",
    "systemCpuMicroseconds",
    "maxRssBytes",
    "gitWallNanoseconds",
    "processStartupNanoseconds",
  ])
    decimal(value[key], `Probe ${key}`);
  for (const key of [
    "gitInvocationCount",
    "processStartupSampleCount",
    "synchronousLaunchCount",
  ])
    safeCount(value[key], `Probe ${key}`);
  return value as unknown as ProbeRecord;
}

function probeNodeOptions(existing: string | undefined): string {
  const normalized = PROBE_PATH.replaceAll("\\", "/");
  const required = `--require=${JSON.stringify(normalized)}`;
  return existing && existing.trim().length > 0
    ? `${existing.trim()} ${required}`
    : required;
}

async function settledProbeFiles(probeDirectory: string) {
  let entries = (await readdir(probeDirectory, { withFileTypes: true })).sort(
    (left, right) => compareStrings(left.name, right.name),
  );
  for (let attempt = 1; attempt < PROBE_SETTLE_ATTEMPTS; attempt += 1) {
    const hasIncompleteEntry = entries.some(
      (entry) =>
        entry.isFile() &&
        !entry.isSymbolicLink() &&
        INCOMPLETE_PROBE_RECORD_PATTERN.test(entry.name),
    );
    if (!hasIncompleteEntry) return entries;
    await delay(PROBE_SETTLE_DELAY_MS);
    entries = (await readdir(probeDirectory, { withFileTypes: true })).sort(
      (left, right) => compareStrings(left.name, right.name),
    );
  }
  return entries;
}

async function containedRegularFile(root: string, path: string): Promise<void> {
  const containment = relative(root, path);
  if (!containment || containment.startsWith("..") || isAbsolute(containment))
    throw new Error(`Measurement path escapes its root: ${path}.`);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`Measurement input must be a regular file: ${path}.`);
}

export async function describeVitestReport(input: {
  readonly artifactDirectory: string;
  readonly reportPath: string;
}): Promise<TestRunReportSummary> {
  const artifactDirectory = resolve(input.artifactDirectory);
  const reportPath = resolve(input.reportPath);
  await containedRegularFile(artifactDirectory, reportPath);
  const contents = await readFile(reportPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8")) as unknown;
  } catch {
    throw new Error(`Vitest measurement report is malformed: ${reportPath}.`);
  }
  if (
    !isRecord(parsed) ||
    parsed["success"] !== true ||
    !Array.isArray(parsed["testResults"])
  )
    throw new Error(
      `Vitest measurement report is not a passing JSON report: ${reportPath}.`,
    );
  const count = (key: string): number =>
    safeCount(parsed[key], `Vitest ${key}`);
  const totalSuites = count("numTotalTestSuites");
  const passedSuites = count("numPassedTestSuites");
  const failedSuites = count("numFailedTestSuites");
  const pendingSuites = count("numPendingTestSuites");
  const totalTests = count("numTotalTests");
  const passedTests = count("numPassedTests");
  const failedTests = count("numFailedTests");
  const pendingTests = count("numPendingTests");
  const todoTests = count("numTodoTests");
  if (
    totalSuites !== passedSuites + failedSuites + pendingSuites ||
    totalTests !== passedTests + failedTests + pendingTests + todoTests ||
    failedSuites !== 0 ||
    pendingSuites !== 0 ||
    failedTests !== 0 ||
    pendingTests !== 0 ||
    todoTests !== 0
  )
    throw new Error(
      "Vitest measurement report has contradictory or non-passing counters.",
    );
  const files = new Set<string>();
  let durationAvailable = true;
  let testBodyNanoseconds = 0n;
  let assertionCount = 0;
  for (const [resultIndex, result] of parsed["testResults"].entries()) {
    if (
      !isRecord(result) ||
      typeof result["name"] !== "string" ||
      !Array.isArray(result["assertionResults"])
    )
      throw new Error(`Vitest measurement result ${resultIndex} is malformed.`);
    files.add(result["name"]);
    for (const [assertionIndex, assertion] of result[
      "assertionResults"
    ].entries()) {
      if (!isRecord(assertion))
        throw new Error(
          `Vitest measurement assertion ${resultIndex}:${assertionIndex} is malformed.`,
        );
      assertionCount += 1;
      const duration = assertion["duration"];
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration < 0
      ) {
        durationAvailable = false;
        continue;
      }
      const nanoseconds = Math.round(duration * 1_000_000);
      if (!Number.isSafeInteger(nanoseconds) || nanoseconds < 0)
        throw new Error(
          "Vitest assertion duration cannot be represented in nanoseconds.",
        );
      testBodyNanoseconds += BigInt(nanoseconds);
    }
  }
  if (assertionCount !== totalTests)
    throw new Error(
      "Vitest measurement assertion count contradicts total tests.",
    );
  return {
    path: relative(artifactDirectory, reportPath).replaceAll("\\", "/"),
    bytes: contents.byteLength,
    sha256: sha256(contents),
    fileCount: files.size,
    testCount: totalTests,
    passed: passedTests,
    failed: failedTests,
    skipped: pendingTests + todoTests,
    testBodyNanoseconds: durationAvailable
      ? testBodyNanoseconds.toString()
      : null,
    testBodyAvailability: durationAvailable
      ? "measured"
      : "report-field-unavailable",
  };
}

export interface TestRunMeasurementSession {
  readonly probeEnvironment: Readonly<Record<string, string>>;
  markSetupFinished(): void;
  observeProcessStartup(nanoseconds: bigint | string): void;
  finish(reports: readonly TestRunReportSummary[]): Promise<{
    readonly path: string;
    readonly summary: TestRunSummary;
  }>;
}

export async function beginTestRunMeasurement(input: {
  readonly artifactDirectory: string;
  readonly runId: string;
  readonly stageId: string;
  readonly commandId: string;
  readonly role: TestRunRole;
  readonly owner: string | null;
  readonly identity: TestRunCommandIdentity;
  readonly now?: () => Date;
  readonly hrtime?: () => bigint;
}): Promise<TestRunMeasurementSession> {
  requireCommandIdentity(input.identity);
  if (!RUN_ID_PATTERN.test(input.runId))
    throw new Error(`Measurement run ID is malformed: ${input.runId}.`);
  if ((input.role === "partition") !== (input.owner !== null))
    throw new Error(
      "Only partition measurement sessions can declare an owner.",
    );
  const artifactDirectory = resolve(input.artifactDirectory);
  const now = input.now ?? (() => new Date());
  const hrtime = input.hrtime ?? (() => process.hrtime.bigint());
  const startedAt = now().toISOString();
  const startedMonotonic = hrtime();
  const probeId = sha256(
    `${input.runId}\0${input.stageId}\0${input.commandId}\0${startedAt}\0${process.pid}`,
  );
  const probeDirectory = resolve(artifactDirectory, ".test-run-probe", probeId);
  await mkdir(probeDirectory, { recursive: true });
  let setupFinishedMonotonic: bigint | null = null;
  let finished = false;
  const startupSamples: bigint[] = [];

  return {
    probeEnvironment: {
      MILESTONE_LOOP_TEST_RUN_PROBE_DIR: probeDirectory,
      MILESTONE_LOOP_TEST_RUN_PROBE_ID: probeId,
      NODE_OPTIONS: probeNodeOptions(process.env["NODE_OPTIONS"]),
    },
    markSetupFinished(): void {
      if (setupFinishedMonotonic !== null)
        throw new Error("Measurement setup boundary was already closed.");
      setupFinishedMonotonic = hrtime();
    },
    observeProcessStartup(nanoseconds: bigint | string): void {
      const value =
        typeof nanoseconds === "bigint"
          ? nanoseconds
          : BigInt(decimal(nanoseconds, "Process startup duration"));
      if (value < 0n)
        throw new Error("Process startup duration cannot be negative.");
      startupSamples.push(value);
    },
    async finish(
      reportInputs,
    ): Promise<{ path: string; summary: TestRunSummary }> {
      if (finished)
        throw new Error("Measurement session was already finished.");
      if (setupFinishedMonotonic === null)
        throw new Error("Measurement setup boundary was never closed.");
      if (reportInputs.length === 0)
        throw new Error(
          "Measurement session requires at least one Vitest report.",
        );
      const reports = [...reportInputs].sort((left, right) =>
        compareStrings(left.path, right.path),
      );
      if (new Set(reports.map((item) => item.path)).size !== reports.length)
        throw new Error("Measurement report paths must be unique.");
      for (const [index, report] of reports.entries())
        validateReport(report, `Measurement report ${index}`);

      const probeFiles = await settledProbeFiles(probeDirectory);
      const records: ProbeRecord[] = [];
      const recordContents: Buffer[] = [];
      let incompleteRecordCount = 0;
      for (const entry of probeFiles) {
        if (
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          INCOMPLETE_PROBE_RECORD_PATTERN.test(entry.name)
        ) {
          incompleteRecordCount += 1;
          continue;
        }
        if (
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          !COMPLETE_PROBE_RECORD_PATTERN.test(entry.name)
        )
          throw new Error(
            `Unexpected or incomplete test-run probe entry: ${entry.name}.`,
          );
        const path = resolve(probeDirectory, entry.name);
        await containedRegularFile(probeDirectory, path);
        const contents = await readFile(path);
        let parsed: unknown;
        try {
          parsed = JSON.parse(contents.toString("utf8")) as unknown;
        } catch {
          throw new Error(`Malformed test-run probe record: ${entry.name}.`);
        }
        records.push(probeRecord(parsed, probeId));
        recordContents.push(contents);
      }
      const recordsSha256 =
        records.length === 0
          ? null
          : sha256(
              `${recordContents.map((contents) => sha256(contents)).join("\n")}\n`,
            );
      const probeComplete = incompleteRecordCount === 0;
      const probeMeasured = probeComplete && records.length > 0;
      const unavailableProbeReason = probeComplete
        ? "no-instrumented-node-process-records"
        : INCOMPLETE_PROBE_REASON;
      const gitInvocationCount = records.reduce(
        (sum, item) => sum + item.gitInvocationCount,
        0,
      );
      const gitNanoseconds = records.reduce(
        (sum, item) => sum + BigInt(item.gitWallNanoseconds),
        0n,
      );
      const probeStartupSamples = records.reduce(
        (sum, item) => sum + item.processStartupSampleCount,
        0,
      );
      const probeStartupNanoseconds = records.reduce(
        (sum, item) => sum + BigInt(item.processStartupNanoseconds),
        0n,
      );
      const synchronousLaunchCount = records.reduce(
        (sum, item) => sum + item.synchronousLaunchCount,
        0,
      );
      const userCpu = records.reduce(
        (sum, item) => sum + BigInt(item.userCpuMicroseconds),
        0n,
      );
      const systemCpu = records.reduce(
        (sum, item) => sum + BigInt(item.systemCpuMicroseconds),
        0n,
      );
      const peakRss = records.reduce<bigint | null>((maximum, item) => {
        const value = BigInt(item.maxRssBytes);
        return maximum === null || value > maximum ? value : maximum;
      }, null);
      const parentStartupNanoseconds = startupSamples.reduce(
        (sum, item) => sum + item,
        0n,
      );
      const testBodyMeasured = reports.every(
        (item) => item.testBodyAvailability === "measured",
      );
      const testBodyNanoseconds = reports.reduce(
        (sum, item) => sum + BigInt(item.testBodyNanoseconds ?? "0"),
        0n,
      );
      const finishedMonotonic = hrtime();
      const finishedAt = now().toISOString();
      const wallNanoseconds = finishedMonotonic - startedMonotonic;
      const setupNanoseconds = setupFinishedMonotonic - startedMonotonic;
      if (
        wallNanoseconds < 0n ||
        setupNanoseconds < 0n ||
        setupNanoseconds > wallNanoseconds
      )
        throw new Error("Measurement monotonic boundaries are contradictory.");

      const base = {
        schemaVersion: TEST_RUN_SUMMARY_SCHEMA_VERSION,
        protocolId: TEST_RUN_MEASUREMENT_PROTOCOL_ID,
        status: "PASS" as const,
        run: {
          runId: input.runId,
          stageId: input.stageId,
          commandId: input.commandId,
          role: input.role,
          owner: input.owner,
        },
        candidate: {
          gitCommit: input.identity.gitCommit,
          gitTree: input.identity.gitTree,
          workingTreeDirty: input.identity.workingTreeDirty,
        },
        platform: {
          os: platform(),
          release: release(),
          arch: arch(),
          endianness: endianness(),
          nodeVersion: input.identity.nodeVersion,
          pnpmVersion: input.identity.pnpmVersion,
        },
        timestamps: { startedAt, finishedAt },
        boundaries: {
          wallTime:
            "Monotonic time from summary-session creation through report and probe reduction, before summary persistence.",
          setupTime:
            "Monotonic time from summary-session creation to the explicit boundary immediately before the measured Vitest command sequence.",
          gitFixtureTime:
            "Sum of elapsed child_process call time for Git executables observed by the preload probe in instrumented Node processes; overlapping calls are not de-overlapped.",
          processStartupTime:
            "Sum of synchronous node:child_process.spawn call latency through ChildProcess handle return at the parent supervisor and instrumented Node processes; spawnSync execution is counted but has no startup duration sample.",
          testBodyTime:
            "Sum of Vitest JSON assertionResults[].duration values rounded from reported milliseconds to nanoseconds; unreported suite/global setup is excluded.",
          cpuTime:
            "Sum of process.resourceUsage user and system CPU microseconds for instrumented Node processes that exited normally and published a probe record.",
          peakRss:
            "Maximum process.resourceUsage maxRSS across instrumented Node processes, converted from kibibytes to bytes; this is not an aggregate concurrent process-tree peak.",
          relationship:
            "Measurements are independently observed and intentionally non-additive; Git, startup, and test-body intervals may overlap wall/setup categories.",
        },
        units: {
          duration: "nanoseconds" as const,
          cpu: "microseconds" as const,
          memory: "bytes" as const,
        },
        reports,
        reportSetSha256: reportSetHash(reports),
        testCounts: {
          files: reports.reduce((sum, item) => sum + item.fileCount, 0),
          tests: reports.reduce((sum, item) => sum + item.testCount, 0),
          passed: reports.reduce((sum, item) => sum + item.passed, 0),
          failed: reports.reduce((sum, item) => sum + item.failed, 0),
          skipped: reports.reduce((sum, item) => sum + item.skipped, 0),
        },
        measurements: {
          wallTime: {
            availability: "measured" as const,
            nanoseconds: wallNanoseconds.toString(),
            sampleCount: 1,
            reason: null,
          },
          setupTime: {
            availability: "measured" as const,
            nanoseconds: setupNanoseconds.toString(),
            sampleCount: 1,
            reason: null,
          },
          gitFixtureTime: probeMeasured
            ? {
                availability: "measured" as const,
                nanoseconds: gitNanoseconds.toString(),
                sampleCount: gitInvocationCount,
                reason: null,
              }
            : {
                availability: "unavailable" as const,
                nanoseconds: null,
                sampleCount: 0,
                reason: unavailableProbeReason,
              },
          processStartupTime:
            probeComplete && startupSamples.length + probeStartupSamples > 0
              ? {
                  availability: "measured" as const,
                  nanoseconds: (
                    parentStartupNanoseconds + probeStartupNanoseconds
                  ).toString(),
                  sampleCount: startupSamples.length + probeStartupSamples,
                  reason: null,
                }
              : {
                  availability: "unavailable" as const,
                  nanoseconds: null,
                  sampleCount: 0,
                  reason: probeComplete
                    ? "no-asynchronous-spawn-latency-samples"
                    : INCOMPLETE_PROBE_REASON,
                },
          testBodyTime: testBodyMeasured
            ? {
                availability: "measured" as const,
                nanoseconds: testBodyNanoseconds.toString(),
                sampleCount: reports.reduce(
                  (sum, item) => sum + item.testCount,
                  0,
                ),
                reason: null,
              }
            : {
                availability: "unavailable" as const,
                nanoseconds: null,
                sampleCount: 0,
                reason: "vitest-assertion-duration-field-unavailable",
              },
          cpuTime: probeMeasured
            ? {
                availability: "measured" as const,
                userMicroseconds: userCpu.toString(),
                systemMicroseconds: systemCpu.toString(),
                totalMicroseconds: (userCpu + systemCpu).toString(),
                processCount: records.length,
                reason: null,
              }
            : {
                availability: "unavailable" as const,
                userMicroseconds: null,
                systemMicroseconds: null,
                totalMicroseconds: null,
                processCount: 0,
                reason: unavailableProbeReason,
              },
          peakRss:
            probeMeasured && peakRss !== null
              ? {
                  availability: "measured" as const,
                  bytes: peakRss.toString(),
                  processCount: records.length,
                  aggregation: "maximum-instrumented-process-peak" as const,
                  reason: null,
                }
              : {
                  availability: "unavailable" as const,
                  bytes: null,
                  processCount: 0,
                  aggregation: "maximum-instrumented-process-peak" as const,
                  reason: unavailableProbeReason,
                },
        },
        probe: probeMeasured
          ? {
              availability: "measured" as const,
              processCount: records.length,
              synchronousLaunchCount,
              recordsSha256,
              reason: null,
            }
          : {
              availability: "unavailable" as const,
              processCount: 0,
              synchronousLaunchCount: 0,
              recordsSha256: null,
              reason: unavailableProbeReason,
            },
        nonSemantic: {
          changesTestSuccess: false as const,
          authorizesCutover: false as const,
          benchmarkClaim: false as const,
        },
      };
      const summary = assertTestRunSummary({
        ...base,
        contentSha256: sha256(canonicalJson(base)),
      });
      const path = resolve(artifactDirectory, TEST_RUN_SUMMARY_NAME);
      await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      assertTestRunSummary(
        JSON.parse(await readFile(path, "utf8")) as unknown,
        {
          runId: input.runId,
          stageId: input.stageId,
          commandId: input.commandId,
          role: input.role,
          owner: input.owner,
          candidate: base.candidate,
        },
      );
      await rm(probeDirectory, {
        recursive: true,
        force: true,
      });
      finished = true;
      return { path, summary };
    },
  };
}

export async function loadValidatedTestRunSummary(input: {
  readonly receipt: {
    readonly artifacts: readonly {
      readonly path: string;
      readonly kind: string;
      readonly bytes: number;
      readonly sha256: string;
    }[];
  };
  readonly expected: TestRunSummaryExpectation;
}): Promise<ValidatedTestRunSummarySource> {
  const artifacts = input.receipt.artifacts.filter(
    (artifact) => artifact.kind === TEST_RUN_SUMMARY_KIND,
  );
  if (artifacts.length !== 1)
    throw new Error(
      `Expected exactly one validated ${TEST_RUN_SUMMARY_KIND} artifact for ${input.expected.commandId}; received ${artifacts.length}.`,
    );
  const artifact = artifacts[0];
  if (!artifact) throw new Error("Validated summary artifact disappeared.");
  const metadata = await stat(artifact.path);
  const contents = await readFile(artifact.path);
  if (
    !metadata.isFile() ||
    metadata.size !== artifact.bytes ||
    contents.byteLength !== artifact.bytes ||
    sha256(contents) !== artifact.sha256
  )
    throw new Error(
      `Validated test-run summary artifact is stale or hash-mismatched for ${input.expected.commandId}.`,
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8")) as unknown;
  } catch {
    throw new Error(
      `Validated test-run summary artifact is malformed for ${input.expected.commandId}.`,
    );
  }
  return {
    path: artifact.path,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    summary: assertTestRunSummary(parsed, input.expected),
  };
}

function identityKey(
  value: Pick<TestRunSummaryExpectation, "runId" | "stageId" | "commandId">,
): string {
  return `${value.stageId}\0${value.commandId}\0${value.runId}`;
}

function dispositionCounts(
  values: readonly {
    availability: MeasurementAvailability;
    reason: string | null;
  }[],
): readonly MeasurementDispositionCount[] {
  const counts = new Map<string, MeasurementDispositionCount>();
  for (const value of values) {
    const key = `${value.availability}\0${value.reason ?? ""}`;
    const current = counts.get(key);
    counts.set(key, {
      availability: value.availability,
      reason: value.reason,
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((left, right) =>
    compareStrings(
      `${left.availability}\0${left.reason ?? ""}`,
      `${right.availability}\0${right.reason ?? ""}`,
    ),
  );
}

function reduceDuration(
  summaries: readonly TestRunSummary[],
  key:
    | "wallTime"
    | "setupTime"
    | "gitFixtureTime"
    | "processStartupTime"
    | "testBodyTime",
): ReducedDurationMeasurement {
  const values = summaries.map((summary) => summary.measurements[key]);
  return {
    measuredCount: values.filter((value) => value.availability === "measured")
      .length,
    unavailableCount: values.filter(
      (value) => value.availability === "unavailable",
    ).length,
    notApplicableCount: values.filter(
      (value) => value.availability === "not-applicable",
    ).length,
    totalNanoseconds: values
      .reduce((sum, value) => sum + BigInt(value.nanoseconds ?? "0"), 0n)
      .toString(),
    sampleCount: values.reduce((sum, value) => sum + value.sampleCount, 0),
    dispositions: dispositionCounts(values),
  };
}

export function reduceTestRunSummaries(input: {
  readonly sources: readonly ValidatedTestRunSummarySource[];
  readonly expected: readonly TestRunSummaryExpectation[];
  readonly candidate: TestRunCandidate;
  readonly relativePath: (absolutePath: string) => string;
}): TestRunReduction {
  candidate(input.candidate, "Reduction candidate");
  const expectedByKey = new Map<string, TestRunSummaryExpectation>();
  for (const expectation of input.expected) {
    const key = identityKey(expectation);
    if (expectedByKey.has(key))
      throw new Error(`Duplicate expected test-run summary identity: ${key}.`);
    expectedByKey.set(key, expectation);
  }
  const sourceByKey = new Map<string, ValidatedTestRunSummarySource>();
  for (const source of input.sources) {
    if (
      !SHA256_PATTERN.test(source.sha256) ||
      !Number.isSafeInteger(source.bytes) ||
      source.bytes <= 0
    )
      throw new Error("Reducer source byte/hash identity is invalid.");
    const key = identityKey(source.summary.run);
    if (sourceByKey.has(key))
      throw new Error(`Duplicate test-run summary identity: ${key}.`);
    sourceByKey.set(key, source);
  }
  const missing = [...expectedByKey.keys()]
    .filter((key) => !sourceByKey.has(key))
    .sort(compareStrings);
  const unexpected = [...sourceByKey.keys()]
    .filter((key) => !expectedByKey.has(key))
    .sort(compareStrings);
  if (missing.length > 0 || unexpected.length > 0)
    throw new Error(
      `Test-run summary set is incomplete or unexpected: missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}].`,
    );
  const sources = [...input.sources].sort((left, right) =>
    compareStrings(
      identityKey(left.summary.run),
      identityKey(right.summary.run),
    ),
  );
  for (const source of sources) {
    const expectation = expectedByKey.get(identityKey(source.summary.run));
    if (!expectation) throw new Error("Reducer expectation disappeared.");
    assertTestRunSummary(source.summary, expectation);
    if (!sameCandidate(source.summary.candidate, input.candidate))
      throw new Error("Reducer source candidate identity is mismatched.");
  }
  const summaries = sources.map((source) => source.summary);
  const inputs = sources.map((source) => ({
    runId: source.summary.run.runId,
    stageId: source.summary.run.stageId,
    commandId: source.summary.run.commandId,
    role: source.summary.run.role,
    owner: source.summary.run.owner,
    path: canonicalRelativePath(
      input.relativePath(source.path),
      "Reducer source path",
    ),
    bytes: source.bytes,
    sha256: source.sha256,
    contentSha256: source.summary.contentSha256,
  }));
  const platforms = [
    ...new Map(
      summaries.map((summary) => [
        canonicalJson(summary.platform),
        summary.platform,
      ]),
    ).entries(),
  ]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([, value]) => value);
  const cpuValues = summaries.map((summary) => summary.measurements.cpuTime);
  const rssValues = summaries.map((summary) => summary.measurements.peakRss);
  const measuredRss = rssValues
    .filter((value) => value.availability === "measured")
    .map((value) => BigInt(value.bytes ?? "0"));
  const base = {
    schemaVersion: TEST_RUN_REDUCTION_SCHEMA_VERSION,
    protocolId: TEST_RUN_MEASUREMENT_PROTOCOL_ID,
    status: "PASS" as const,
    candidate: input.candidate,
    inputCount: inputs.length,
    inputSetSha256: sha256(
      `${inputs
        .map(
          (item) =>
            `${item.stageId}\0${item.commandId}\0${item.runId}\0${item.path}\0${item.bytes}\0${item.sha256}\0${item.contentSha256}`,
        )
        .join("\n")}\n`,
    ),
    inputs,
    platforms,
    observedTestCounts: {
      files: summaries.reduce((sum, item) => sum + item.testCounts.files, 0),
      tests: summaries.reduce((sum, item) => sum + item.testCounts.tests, 0),
      passed: summaries.reduce((sum, item) => sum + item.testCounts.passed, 0),
      failed: summaries.reduce((sum, item) => sum + item.testCounts.failed, 0),
      skipped: summaries.reduce(
        (sum, item) => sum + item.testCounts.skipped,
        0,
      ),
    },
    measurements: {
      wallTime: reduceDuration(summaries, "wallTime"),
      setupTime: reduceDuration(summaries, "setupTime"),
      gitFixtureTime: reduceDuration(summaries, "gitFixtureTime"),
      processStartupTime: reduceDuration(summaries, "processStartupTime"),
      testBodyTime: reduceDuration(summaries, "testBodyTime"),
      cpuTime: {
        measuredCount: cpuValues.filter(
          (value) => value.availability === "measured",
        ).length,
        unavailableCount: cpuValues.filter(
          (value) => value.availability === "unavailable",
        ).length,
        notApplicableCount: cpuValues.filter(
          (value) => value.availability === "not-applicable",
        ).length,
        userMicroseconds: cpuValues
          .reduce(
            (sum, value) => sum + BigInt(value.userMicroseconds ?? "0"),
            0n,
          )
          .toString(),
        systemMicroseconds: cpuValues
          .reduce(
            (sum, value) => sum + BigInt(value.systemMicroseconds ?? "0"),
            0n,
          )
          .toString(),
        totalMicroseconds: cpuValues
          .reduce(
            (sum, value) => sum + BigInt(value.totalMicroseconds ?? "0"),
            0n,
          )
          .toString(),
        dispositions: dispositionCounts(cpuValues),
      },
      peakRss: {
        measuredCount: rssValues.filter(
          (value) => value.availability === "measured",
        ).length,
        unavailableCount: rssValues.filter(
          (value) => value.availability === "unavailable",
        ).length,
        notApplicableCount: rssValues.filter(
          (value) => value.availability === "not-applicable",
        ).length,
        maximumBytes:
          measuredRss.length === 0
            ? null
            : measuredRss
                .reduce((maximum, value) => (value > maximum ? value : maximum))
                .toString(),
        aggregation: "maximum-of-summary-process-peaks" as const,
        dispositions: dispositionCounts(rssValues),
      },
    },
    nonSemantic: {
      changesTestSuccess: false as const,
      authorizesCutover: false as const,
      benchmarkClaim: false as const,
    },
  };
  return assertTestRunReduction({
    ...base,
    contentSha256: sha256(canonicalJson(base)),
  });
}

function validateDispositionCounts(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  let prior = "";
  for (const [index, item] of value.entries()) {
    if (!isRecord(item))
      throw new Error(`${label}[${index}] must be an object.`);
    exactKeys(item, ["availability", "reason", "count"], `${label}[${index}]`);
    const disposition = availability(
      item["availability"],
      `${label}[${index}].availability`,
    );
    if (!(
      item["reason"] === null ||
      (typeof item["reason"] === "string" && item["reason"].length > 0)
    ))
      throw new Error(`${label}[${index}] reason is invalid.`);
    if (disposition === "measured" && item["reason"] !== null)
      throw new Error(
        `${label}[${index}] measured disposition cannot have a reason.`,
      );
    if (safeCount(item["count"], `${label}[${index}].count`) === 0)
      throw new Error(`${label}[${index}] count must be positive.`);
    const key = `${disposition}\0${item["reason"] ?? ""}`;
    if (index > 0 && compareStrings(prior, key) >= 0)
      throw new Error(`${label} must be unique and deterministically ordered.`);
    prior = key;
  }
}

export function assertTestRunReduction(value: unknown): TestRunReduction {
  if (!isRecord(value))
    throw new Error("Test-run reduction must be an object.");
  exactKeys(
    value,
    [
      "schemaVersion",
      "protocolId",
      "status",
      "candidate",
      "inputCount",
      "inputSetSha256",
      "inputs",
      "platforms",
      "observedTestCounts",
      "measurements",
      "nonSemantic",
      "contentSha256",
    ],
    "Test-run reduction",
  );
  if (
    value["schemaVersion"] !== TEST_RUN_REDUCTION_SCHEMA_VERSION ||
    value["protocolId"] !== TEST_RUN_MEASUREMENT_PROTOCOL_ID ||
    value["status"] !== "PASS"
  )
    throw new Error(
      "Test-run reduction schema, protocol, or status is invalid.",
    );
  candidate(value["candidate"], "Reduction candidate");
  const inputCount = safeCount(value["inputCount"], "Reduction input count");
  if (
    inputCount === 0 ||
    typeof value["inputSetSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["inputSetSha256"]) ||
    !Array.isArray(value["inputs"]) ||
    value["inputs"].length !== inputCount
  )
    throw new Error("Reduction input set identity is invalid.");
  let priorIdentity = "";
  const computedInputLines: string[] = [];
  for (const [index, item] of value["inputs"].entries()) {
    if (!isRecord(item))
      throw new Error(`Reduction input ${index} must be an object.`);
    exactKeys(
      item,
      [
        "runId",
        "stageId",
        "commandId",
        "role",
        "owner",
        "path",
        "bytes",
        "sha256",
        "contentSha256",
      ],
      `Reduction input ${index}`,
    );
    const runId = nonEmptyString(
      item["runId"],
      `Reduction input ${index} run ID`,
    );
    const stageId = nonEmptyString(
      item["stageId"],
      `Reduction input ${index} stage ID`,
    );
    const commandId = nonEmptyString(
      item["commandId"],
      `Reduction input ${index} command ID`,
    );
    if (
      !new Set<TestRunRole>(["legacy", "partition", "legacy-extra"]).has(
        item["role"] as TestRunRole,
      )
    )
      throw new Error(`Reduction input ${index} role is invalid.`);
    if (!(
      item["owner"] === null ||
      (typeof item["owner"] === "string" && item["owner"].length > 0)
    ))
      throw new Error(`Reduction input ${index} owner is invalid.`);
    const path = canonicalRelativePath(
      item["path"],
      `Reduction input ${index} path`,
    );
    const bytes = safeCount(item["bytes"], `Reduction input ${index} bytes`);
    if (
      bytes === 0 ||
      typeof item["sha256"] !== "string" ||
      !SHA256_PATTERN.test(item["sha256"]) ||
      typeof item["contentSha256"] !== "string" ||
      !SHA256_PATTERN.test(item["contentSha256"])
    )
      throw new Error(`Reduction input ${index} hashes are invalid.`);
    const identity = `${stageId}\0${commandId}\0${runId}`;
    if (index > 0 && compareStrings(priorIdentity, identity) >= 0)
      throw new Error(
        "Reduction inputs must be unique and deterministically ordered.",
      );
    priorIdentity = identity;
    computedInputLines.push(
      `${stageId}\0${commandId}\0${runId}\0${path}\0${bytes}\0${item["sha256"]}\0${item["contentSha256"]}`,
    );
  }
  if (value["inputSetSha256"] !== sha256(`${computedInputLines.join("\n")}\n`))
    throw new Error("Reduction input-set hash is contradictory.");
  if (!Array.isArray(value["platforms"]) || value["platforms"].length === 0)
    throw new Error("Reduction requires platform provenance.");
  const platformKeys: string[] = [];
  for (const [index, item] of value["platforms"].entries()) {
    if (!isRecord(item))
      throw new Error(`Reduction platform ${index} must be an object.`);
    exactKeys(
      item,
      ["os", "release", "arch", "endianness", "nodeVersion", "pnpmVersion"],
      `Reduction platform ${index}`,
    );
    for (const key of ["os", "release", "arch", "nodeVersion", "pnpmVersion"])
      nonEmptyString(item[key], `Reduction platform ${index} ${key}`);
    if (item["endianness"] !== "BE" && item["endianness"] !== "LE")
      throw new Error(`Reduction platform ${index} endianness is invalid.`);
    platformKeys.push(canonicalJson(item));
  }
  if (
    platformKeys.some(
      (item, index) =>
        index > 0 && compareStrings(platformKeys[index - 1] ?? "", item) >= 0,
    )
  )
    throw new Error(
      "Reduction platforms must be unique and deterministically ordered.",
    );
  const counts = value["observedTestCounts"];
  if (!isRecord(counts))
    throw new Error("Reduction test counts must be an object.");
  exactKeys(
    counts,
    ["files", "tests", "passed", "failed", "skipped"],
    "Reduction test counts",
  );
  const tests = safeCount(counts["tests"], "Reduction tests");
  const passed = safeCount(counts["passed"], "Reduction passed tests");
  const failed = safeCount(counts["failed"], "Reduction failed tests");
  const skipped = safeCount(counts["skipped"], "Reduction skipped tests");
  safeCount(counts["files"], "Reduction files");
  if (
    tests === 0 ||
    passed + failed + skipped !== tests ||
    failed !== 0 ||
    skipped !== 0
  )
    throw new Error("Reduction observed test counts are contradictory.");
  const measurements = value["measurements"];
  if (!isRecord(measurements))
    throw new Error("Reduction measurements must be an object.");
  exactKeys(
    measurements,
    [
      "wallTime",
      "setupTime",
      "gitFixtureTime",
      "processStartupTime",
      "testBodyTime",
      "cpuTime",
      "peakRss",
    ],
    "Reduction measurements",
  );
  for (const key of [
    "wallTime",
    "setupTime",
    "gitFixtureTime",
    "processStartupTime",
    "testBodyTime",
  ]) {
    const metric = measurements[key];
    if (!isRecord(metric))
      throw new Error(`Reduction ${key} must be an object.`);
    exactKeys(
      metric,
      [
        "measuredCount",
        "unavailableCount",
        "notApplicableCount",
        "totalNanoseconds",
        "sampleCount",
        "dispositions",
      ],
      `Reduction ${key}`,
    );
    const classified =
      safeCount(metric["measuredCount"], `Reduction ${key} measured`) +
      safeCount(metric["unavailableCount"], `Reduction ${key} unavailable`) +
      safeCount(
        metric["notApplicableCount"],
        `Reduction ${key} not-applicable`,
      );
    if (classified !== inputCount)
      throw new Error(`Reduction ${key} dispositions contradict input count.`);
    decimal(metric["totalNanoseconds"], `Reduction ${key} total`);
    safeCount(metric["sampleCount"], `Reduction ${key} samples`);
    validateDispositionCounts(
      metric["dispositions"],
      `Reduction ${key} dispositions`,
    );
  }
  const cpu = measurements["cpuTime"];
  if (!isRecord(cpu))
    throw new Error("Reduction CPU measurement must be an object.");
  exactKeys(
    cpu,
    [
      "measuredCount",
      "unavailableCount",
      "notApplicableCount",
      "userMicroseconds",
      "systemMicroseconds",
      "totalMicroseconds",
      "dispositions",
    ],
    "Reduction CPU measurement",
  );
  if (
    safeCount(cpu["measuredCount"], "Reduction CPU measured") +
      safeCount(cpu["unavailableCount"], "Reduction CPU unavailable") +
      safeCount(cpu["notApplicableCount"], "Reduction CPU not-applicable") !==
    inputCount
  )
    throw new Error("Reduction CPU dispositions contradict input count.");
  const user = BigInt(decimal(cpu["userMicroseconds"], "Reduction CPU user"));
  const system = BigInt(
    decimal(cpu["systemMicroseconds"], "Reduction CPU system"),
  );
  if (
    user + system !==
    BigInt(decimal(cpu["totalMicroseconds"], "Reduction CPU total"))
  )
    throw new Error("Reduction CPU totals are contradictory.");
  validateDispositionCounts(cpu["dispositions"], "Reduction CPU dispositions");
  const rss = measurements["peakRss"];
  if (!isRecord(rss))
    throw new Error("Reduction RSS measurement must be an object.");
  exactKeys(
    rss,
    [
      "measuredCount",
      "unavailableCount",
      "notApplicableCount",
      "maximumBytes",
      "aggregation",
      "dispositions",
    ],
    "Reduction RSS measurement",
  );
  const rssMeasured = safeCount(rss["measuredCount"], "Reduction RSS measured");
  if (
    rssMeasured +
      safeCount(rss["unavailableCount"], "Reduction RSS unavailable") +
      safeCount(rss["notApplicableCount"], "Reduction RSS not-applicable") !==
      inputCount ||
    rss["aggregation"] !== "maximum-of-summary-process-peaks"
  )
    throw new Error("Reduction RSS disposition or aggregation is invalid.");
  if ((rssMeasured === 0) !== (rss["maximumBytes"] === null))
    throw new Error("Reduction RSS maximum contradicts availability.");
  if (rss["maximumBytes"] !== null)
    decimal(rss["maximumBytes"], "Reduction RSS maximum");
  validateDispositionCounts(rss["dispositions"], "Reduction RSS dispositions");
  const nonSemantic = value["nonSemantic"];
  if (!isRecord(nonSemantic))
    throw new Error("Reduction semantic boundary must be an object.");
  exactKeys(
    nonSemantic,
    ["changesTestSuccess", "authorizesCutover", "benchmarkClaim"],
    "Reduction semantic boundary",
  );
  if (
    nonSemantic["changesTestSuccess"] !== false ||
    nonSemantic["authorizesCutover"] !== false ||
    nonSemantic["benchmarkClaim"] !== false
  )
    throw new Error(
      "Reduction cannot change test semantics or authorize cutover.",
    );
  if (
    typeof value["contentSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["contentSha256"]) ||
    semanticHash(value) !== value["contentSha256"]
  )
    throw new Error("Test-run reduction content hash is invalid.");
  return value as unknown as TestRunReduction;
}

export async function writeTestRunReduction(
  path: string,
  reduction: TestRunReduction,
): Promise<void> {
  assertTestRunReduction(reduction);
  await writeFile(path, `${JSON.stringify(reduction, null, 2)}\n`, "utf8");
  assertTestRunReduction(JSON.parse(await readFile(path, "utf8")) as unknown);
}
