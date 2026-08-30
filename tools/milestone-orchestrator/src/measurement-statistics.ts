import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  MEASUREMENT_COMMANDS,
  MEASUREMENT_COMMAND_CATALOGUE_ID,
  MEASUREMENT_COMMAND_CATALOGUE_SHA256,
  MEASUREMENT_LANE_RECORD_NAME,
  validateMeasurementLaneArtifacts,
  type LoadedMeasurementLaneRecord,
  type MeasurementLaneClassification,
  type MeasurementLaneRecord,
} from "./measurement-lane.js";
import {
  assertTestRunSummary,
  type TestRunCandidate,
  type TestRunSummary,
} from "./test-run-summary.js";

export const MEASUREMENT_STATISTICS_SCHEMA_VERSION = "1.0.0" as const;
export const MEASUREMENT_STATISTICS_PROTOCOL_ID =
  "milestone-loop-wp6-measurement-statistics.v1" as const;
export const MEASUREMENT_STATISTICS_NAME =
  "measurement-statistics.json" as const;
export const MEASUREMENT_STATISTICS_KIND = "measurement-statistics" as const;
export const MEASUREMENT_MATRIX_PAIR_COUNT = 5 as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

export type MeasurementStatisticsPlatform = "linux" | "windows";
export type MeasurementStatisticUnit =
  "nanoseconds" | "microseconds" | "bytes" | "count";

export interface MeasurementIntegerDistribution {
  readonly unit: MeasurementStatisticUnit;
  readonly sampleCount: number;
  readonly minimum: string;
  readonly maximum: string;
  readonly range: string;
  readonly median: string;
  readonly medianAbsoluteDeviation: string;
}

export interface MeasurementClassificationStatistics {
  readonly sampleCount: number;
  readonly measurementAvailability: "all-required-measurements-observed";
  readonly durationNanoseconds: {
    readonly wallTime: MeasurementIntegerDistribution;
    readonly setupTime: MeasurementIntegerDistribution;
    readonly gitFixtureTime: MeasurementIntegerDistribution;
    readonly processStartupTime: MeasurementIntegerDistribution;
    readonly testBodyTime: MeasurementIntegerDistribution;
  };
  readonly cpuTotalMicroseconds: MeasurementIntegerDistribution;
  readonly peakRssBytes: MeasurementIntegerDistribution;
  readonly testCounts: {
    readonly files: MeasurementIntegerDistribution;
    readonly tests: MeasurementIntegerDistribution;
    readonly passed: MeasurementIntegerDistribution;
    readonly failed: MeasurementIntegerDistribution;
    readonly skipped: MeasurementIntegerDistribution;
  };
}

export interface MeasurementStatisticsRecord {
  readonly schemaVersion: typeof MEASUREMENT_STATISTICS_SCHEMA_VERSION;
  readonly protocolId: typeof MEASUREMENT_STATISTICS_PROTOCOL_ID;
  readonly status: "PASS";
  readonly platformId: MeasurementStatisticsPlatform;
  readonly candidate: TestRunCandidate;
  readonly executionContext: MeasurementLaneRecord["executionContext"];
  readonly commandSet: {
    readonly catalogueId: typeof MEASUREMENT_COMMAND_CATALOGUE_ID;
    readonly catalogueSha256: string;
    readonly selectedCommandIds: readonly string[];
  };
  readonly matrix: {
    readonly pairCount: number;
    readonly coldCount: number;
    readonly warmCount: number;
    readonly recordCount: number;
    readonly ordinalSetSha256: string;
    readonly recordSetSha256: string;
  };
  readonly platformVariants: readonly TestRunSummary["platform"][];
  readonly inputs: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly contentSha256: string;
    readonly classification: MeasurementLaneClassification;
    readonly ordinal: number;
    readonly laneRunId: string;
    readonly workspaceId: string;
    readonly repositoryPathSha256: string;
    readonly reductionContentSha256: string;
  }[];
  readonly commands: readonly {
    readonly id: string;
    readonly script: string;
    readonly stageId: string;
    readonly commandId: string;
    readonly role: "legacy" | "partition";
    readonly owner: string | null;
    readonly cold: MeasurementClassificationStatistics;
    readonly warm: MeasurementClassificationStatistics;
  }[];
  readonly sourceWindow: {
    readonly earliestStartedAt: string;
    readonly latestFinishedAt: string;
  };
  readonly nonSemantic: {
    readonly changesTestSuccess: false;
    readonly authorizesCutover: false;
    readonly benchmarkClaim: false;
    readonly comparesClassifications: false;
  };
  readonly contentSha256: string;
}

export interface MeasurementStatisticsExpectation {
  readonly platformId: MeasurementStatisticsPlatform;
  readonly pairCount?: number;
  readonly selectedCommandIds?: readonly string[];
  readonly candidate?: TestRunCandidate;
  readonly executionContext?: MeasurementLaneRecord["executionContext"];
}

export interface BuildMeasurementStatisticsInput extends MeasurementStatisticsExpectation {
  readonly inputRoot: string;
  readonly outputPath: string;
}

interface LoadedMatrixLane extends LoadedMeasurementLaneRecord {
  readonly relativePath: string;
  readonly summaries: ReadonlyMap<string, TestRunSummary>;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
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

function canonicalRelativePath(root: string, path: string): string {
  const value = relative(root, path).replaceAll("\\", "/");
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  )
    throw new Error("Measurement statistics input path escapes its root.");
  return value;
}

async function discoverLaneRecords(
  inputRoot: string,
): Promise<readonly string[]> {
  const root = resolve(inputRoot);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error(
      "Measurement statistics input root must be a real directory.",
    );
  const realRoot = await realpath(root);
  const paths: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Measurement statistics input contains a symlink: ${entry.name}.`,
        );
      if (entry.isDirectory()) {
        await visit(path);
      } else if (
        entry.isFile() &&
        entry.name === MEASUREMENT_LANE_RECORD_NAME
      ) {
        const realPath = await realpath(path);
        canonicalRelativePath(realRoot, realPath);
        paths.push(path);
      }
    }
  };
  await visit(root);
  return paths.sort(compareStrings);
}

function canonicalCommandIds(ids: readonly string[]): readonly string[] {
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    throw new Error("Statistics command selection is empty or duplicated.");
  const requested = new Set(ids);
  const definitions = MEASUREMENT_COMMANDS.filter((item) =>
    requested.has(item.id),
  );
  if (definitions.length !== ids.length)
    throw new Error(
      "Statistics command selection contains an unknown command.",
    );
  const canonical = definitions.map((item) => item.id);
  if (canonical.some((id, index) => id !== ids[index]))
    throw new Error("Statistics command selection is not canonical.");
  return canonical;
}

function platformOs(
  platformId: MeasurementStatisticsPlatform,
): NodeJS.Platform {
  return platformId === "windows" ? "win32" : "linux";
}

function ordinalSetSha256(pairCount: number): string {
  return sha256(
    `${Array.from({ length: pairCount }, (_, index) => index + 1).join("\n")}\n`,
  );
}

export function calculateMeasurementIntegerDistribution(
  values: readonly (string | number)[],
  unit: MeasurementStatisticUnit,
  label: string,
): MeasurementIntegerDistribution {
  if (values.length === 0 || values.length % 2 === 0)
    throw new Error(`${label} requires a positive odd sample count.`);
  const parsed = values.map((value) => {
    const text = String(value);
    if (!DECIMAL_PATTERN.test(text))
      throw new Error(
        `${label} contains a non-canonical non-negative integer.`,
      );
    return BigInt(text);
  });
  parsed.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(parsed.length / 2);
  const median = parsed[middle]!;
  const deviations = parsed
    .map((value) => (value >= median ? value - median : median - value))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const minimum = parsed[0]!;
  const maximum = parsed.at(-1)!;
  return {
    unit,
    sampleCount: parsed.length,
    minimum: minimum.toString(),
    maximum: maximum.toString(),
    range: (maximum - minimum).toString(),
    median: median.toString(),
    medianAbsoluteDeviation: deviations[middle]!.toString(),
  };
}

function requiredDuration(
  summaries: readonly TestRunSummary[],
  key:
    | "wallTime"
    | "setupTime"
    | "gitFixtureTime"
    | "processStartupTime"
    | "testBodyTime",
): readonly string[] {
  return summaries.map((summary) => {
    const measurement = summary.measurements[key];
    if (
      measurement.availability !== "measured" ||
      measurement.nanoseconds === null
    )
      throw new Error(
        `Statistics require measured ${key} for every repetition.`,
      );
    return measurement.nanoseconds;
  });
}

function classificationStatistics(
  summaries: readonly TestRunSummary[],
): MeasurementClassificationStatistics {
  const cpu = summaries.map((summary) => {
    const measurement = summary.measurements.cpuTime;
    if (
      measurement.availability !== "measured" ||
      measurement.totalMicroseconds === null
    )
      throw new Error("Statistics require measured CPU for every repetition.");
    return measurement.totalMicroseconds;
  });
  const rss = summaries.map((summary) => {
    const measurement = summary.measurements.peakRss;
    if (measurement.availability !== "measured" || measurement.bytes === null)
      throw new Error(
        "Statistics require measured peak RSS for every repetition.",
      );
    return measurement.bytes;
  });
  const counts = <Key extends keyof TestRunSummary["testCounts"]>(key: Key) =>
    summaries.map((summary) => summary.testCounts[key]);
  return {
    sampleCount: summaries.length,
    measurementAvailability: "all-required-measurements-observed",
    durationNanoseconds: {
      wallTime: calculateMeasurementIntegerDistribution(
        requiredDuration(summaries, "wallTime"),
        "nanoseconds",
        "Wall-time statistics",
      ),
      setupTime: calculateMeasurementIntegerDistribution(
        requiredDuration(summaries, "setupTime"),
        "nanoseconds",
        "Setup-time statistics",
      ),
      gitFixtureTime: calculateMeasurementIntegerDistribution(
        requiredDuration(summaries, "gitFixtureTime"),
        "nanoseconds",
        "Git-fixture statistics",
      ),
      processStartupTime: calculateMeasurementIntegerDistribution(
        requiredDuration(summaries, "processStartupTime"),
        "nanoseconds",
        "Process-startup statistics",
      ),
      testBodyTime: calculateMeasurementIntegerDistribution(
        requiredDuration(summaries, "testBodyTime"),
        "nanoseconds",
        "Test-body statistics",
      ),
    },
    cpuTotalMicroseconds: calculateMeasurementIntegerDistribution(
      cpu,
      "microseconds",
      "CPU statistics",
    ),
    peakRssBytes: calculateMeasurementIntegerDistribution(
      rss,
      "bytes",
      "Peak-RSS statistics",
    ),
    testCounts: {
      files: calculateMeasurementIntegerDistribution(
        counts("files"),
        "count",
        "File-count statistics",
      ),
      tests: calculateMeasurementIntegerDistribution(
        counts("tests"),
        "count",
        "Test-count statistics",
      ),
      passed: calculateMeasurementIntegerDistribution(
        counts("passed"),
        "count",
        "Passed-count statistics",
      ),
      failed: calculateMeasurementIntegerDistribution(
        counts("failed"),
        "count",
        "Failed-count statistics",
      ),
      skipped: calculateMeasurementIntegerDistribution(
        counts("skipped"),
        "count",
        "Skipped-count statistics",
      ),
    },
  };
}

async function loadMatrixLane(
  inputRoot: string,
  path: string,
): Promise<LoadedMatrixLane> {
  const loaded = await validateMeasurementLaneArtifacts(path);
  const summaries = new Map<string, TestRunSummary>();
  const root = resolve(loaded.path, "..");
  for (const command of loaded.record.commands) {
    const summaryPath = resolve(root, command.summary.path);
    const summary = assertTestRunSummary(
      JSON.parse(await readFile(summaryPath, "utf8")) as unknown,
      {
        runId: command.runId,
        stageId: command.stageId,
        commandId: command.commandId,
        role: command.role,
        owner: command.owner,
        candidate: loaded.record.candidate,
      },
    );
    summaries.set(command.id, summary);
  }
  return {
    ...loaded,
    relativePath: canonicalRelativePath(resolve(inputRoot), loaded.path),
    summaries,
  };
}

function sameExecutionContext(
  left: MeasurementLaneRecord["executionContext"],
  right: MeasurementLaneRecord["executionContext"],
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

async function createMeasurementStatistics(input: {
  readonly inputRoot: string;
  readonly expectation: MeasurementStatisticsExpectation;
}): Promise<MeasurementStatisticsRecord> {
  const pairCount =
    input.expectation.pairCount ?? MEASUREMENT_MATRIX_PAIR_COUNT;
  if (!Number.isSafeInteger(pairCount) || pairCount < 5 || pairCount % 2 === 0)
    throw new Error(
      "Measurement statistics require an odd pair count of at least five.",
    );
  const selectedCommandIds = canonicalCommandIds(
    input.expectation.selectedCommandIds ??
      MEASUREMENT_COMMANDS.map((definition) => definition.id),
  );
  const paths = await discoverLaneRecords(input.inputRoot);
  if (paths.length !== pairCount * 2)
    throw new Error(
      `Measurement matrix requires ${pairCount * 2} lane records; received ${paths.length}.`,
    );
  const lanes: LoadedMatrixLane[] = [];
  for (const path of paths)
    lanes.push(await loadMatrixLane(resolve(input.inputRoot), path));

  const first = lanes[0];
  if (!first) throw new Error("Measurement matrix is empty.");
  const candidate = first.record.candidate;
  const executionContext = first.record.executionContext;
  if (candidate.workingTreeDirty)
    throw new Error("Measurement statistics require a clean candidate.");
  if (
    input.expectation.candidate &&
    !sameCandidate(candidate, input.expectation.candidate)
  )
    throw new Error("Measurement matrix candidate differs from expectation.");
  if (
    input.expectation.executionContext &&
    !sameExecutionContext(executionContext, input.expectation.executionContext)
  )
    throw new Error(
      "Measurement matrix execution context differs from expectation.",
    );

  const expectedOs = platformOs(input.expectation.platformId);
  const seen = new Set<string>();
  const laneRunIds = new Set<string>();
  const laneByKey = new Map<string, LoadedMatrixLane>();
  for (const lane of lanes) {
    const record = lane.record;
    const key = `${record.laneRun.classification}:${record.laneRun.ordinal}`;
    if (seen.has(key))
      throw new Error(`Duplicate measurement matrix lane: ${key}.`);
    seen.add(key);
    if (laneRunIds.has(record.laneRun.laneRunId))
      throw new Error(
        `Duplicate measurement matrix lane-run ID: ${record.laneRun.laneRunId}.`,
      );
    laneRunIds.add(record.laneRun.laneRunId);
    laneByKey.set(key, lane);
    if (
      record.laneRun.ordinal > pairCount ||
      !sameCandidate(record.candidate, candidate) ||
      record.platform.os !== expectedOs ||
      !sameExecutionContext(record.executionContext, executionContext) ||
      record.commandSet.catalogueId !== MEASUREMENT_COMMAND_CATALOGUE_ID ||
      record.commandSet.catalogueSha256 !==
        MEASUREMENT_COMMAND_CATALOGUE_SHA256 ||
      canonicalJson(record.commandSet.selectedCommandIds) !==
        canonicalJson(selectedCommandIds)
    )
      throw new Error(
        "Measurement matrix lane contradicts its candidate, platform, provenance, ordinal, or command set.",
      );
  }

  for (let ordinal = 1; ordinal <= pairCount; ordinal += 1) {
    const cold = laneByKey.get(`cold:${ordinal}`);
    const warm = laneByKey.get(`warm:${ordinal}`);
    if (!cold || !warm)
      throw new Error(
        `Measurement matrix is missing cold/warm ordinal ${ordinal}.`,
      );
    const pairedCold = warm.record.pairedCold;
    if (
      cold.record.workspaceState.workspaceId !==
        warm.record.workspaceState.workspaceId ||
      !pairedCold ||
      pairedCold.laneRunId !== cold.record.laneRun.laneRunId ||
      pairedCold.contentSha256 !== cold.record.contentSha256
    )
      throw new Error(
        `Measurement matrix cold/warm pair ${ordinal} is not bound.`,
      );
  }
  const workspaceIds = Array.from(
    { length: pairCount },
    (_, index) =>
      laneByKey.get(`cold:${index + 1}`)!.record.workspaceState.workspaceId,
  );
  if (new Set(workspaceIds).size !== pairCount)
    throw new Error(
      "Measurement matrix cold repetitions do not have unique workspace IDs.",
    );

  const sortedLanes = [...lanes].sort((left, right) => {
    const ordinal = left.record.laneRun.ordinal - right.record.laneRun.ordinal;
    if (ordinal !== 0) return ordinal;
    return left.record.laneRun.classification === "cold" ? -1 : 1;
  });
  const inputs = sortedLanes.map((lane) => ({
    path: lane.relativePath,
    bytes: lane.bytes,
    sha256: lane.sha256,
    contentSha256: lane.record.contentSha256,
    classification: lane.record.laneRun.classification,
    ordinal: lane.record.laneRun.ordinal,
    laneRunId: lane.record.laneRun.laneRunId,
    workspaceId: lane.record.workspaceState.workspaceId,
    repositoryPathSha256: lane.record.workspaceState.repositoryPathSha256,
    reductionContentSha256: lane.record.reduction.contentSha256,
  }));
  const platformVariants = [
    ...new Map(
      lanes.map((lane) => [
        canonicalJson(lane.record.platform),
        lane.record.platform,
      ]),
    ).values(),
  ].sort((left, right) =>
    compareStrings(canonicalJson(left), canonicalJson(right)),
  );
  const commands = selectedCommandIds.map((id) => {
    const definition = MEASUREMENT_COMMANDS.find((item) => item.id === id)!;
    const summaries = (classification: MeasurementLaneClassification) =>
      Array.from({ length: pairCount }, (_, index) => {
        const summary = laneByKey
          .get(`${classification}:${index + 1}`)!
          .summaries.get(id);
        if (!summary)
          throw new Error(`Measurement matrix lane is missing summary ${id}.`);
        return summary;
      });
    return {
      id: definition.id,
      script: definition.script,
      stageId: definition.stageId,
      commandId: definition.commandId,
      role: definition.role,
      owner: definition.owner,
      cold: classificationStatistics(summaries("cold")),
      warm: classificationStatistics(summaries("warm")),
    };
  });
  const started = lanes
    .map((lane) => lane.record.timestamps.startedAt)
    .sort(compareStrings)[0]!;
  const finished = lanes
    .map((lane) => lane.record.timestamps.finishedAt)
    .sort(compareStrings)
    .at(-1)!;
  const recordSetSha256 = sha256(
    `${inputs
      .map(
        (item) =>
          `${item.classification}\0${item.ordinal}\0${item.sha256}\0${item.contentSha256}`,
      )
      .join("\n")}\n`,
  );
  const base = {
    schemaVersion: MEASUREMENT_STATISTICS_SCHEMA_VERSION,
    protocolId: MEASUREMENT_STATISTICS_PROTOCOL_ID,
    status: "PASS" as const,
    platformId: input.expectation.platformId,
    candidate,
    executionContext,
    commandSet: {
      catalogueId: MEASUREMENT_COMMAND_CATALOGUE_ID,
      catalogueSha256: MEASUREMENT_COMMAND_CATALOGUE_SHA256,
      selectedCommandIds,
    },
    matrix: {
      pairCount,
      coldCount: pairCount,
      warmCount: pairCount,
      recordCount: pairCount * 2,
      ordinalSetSha256: ordinalSetSha256(pairCount),
      recordSetSha256,
    },
    platformVariants,
    inputs,
    commands,
    sourceWindow: {
      earliestStartedAt: started,
      latestFinishedAt: finished,
    },
    nonSemantic: {
      changesTestSuccess: false as const,
      authorizesCutover: false as const,
      benchmarkClaim: false as const,
      comparesClassifications: false as const,
    },
  };
  return {
    ...base,
    contentSha256: sha256(canonicalJson(base)),
  };
}

export function assertMeasurementStatisticsRecord(
  value: unknown,
): MeasurementStatisticsRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Measurement statistics record must be an object.");
  const record = value as Record<string, unknown>;
  if (
    record["schemaVersion"] !== MEASUREMENT_STATISTICS_SCHEMA_VERSION ||
    record["protocolId"] !== MEASUREMENT_STATISTICS_PROTOCOL_ID ||
    record["status"] !== "PASS" ||
    typeof record["contentSha256"] !== "string" ||
    !SHA256_PATTERN.test(record["contentSha256"]) ||
    semanticHash(record) !== record["contentSha256"]
  )
    throw new Error(
      "Measurement statistics identity or content hash is invalid.",
    );
  return value as MeasurementStatisticsRecord;
}

export async function buildMeasurementStatistics(
  input: BuildMeasurementStatisticsInput,
): Promise<MeasurementStatisticsRecord> {
  const record = await createMeasurementStatistics({
    inputRoot: resolve(input.inputRoot),
    expectation: input,
  });
  const outputPath = resolve(input.outputPath);
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await validateMeasurementStatisticsArtifacts({
    statisticsPath: outputPath,
    inputRoot: input.inputRoot,
    expectation: input,
  });
  return record;
}

export async function validateMeasurementStatisticsArtifacts(input: {
  readonly statisticsPath: string;
  readonly inputRoot: string;
  readonly expectation: MeasurementStatisticsExpectation;
}): Promise<MeasurementStatisticsRecord> {
  const path = resolve(input.statisticsPath);
  const metadata = await stat(path);
  if (!metadata.isFile())
    throw new Error("Measurement statistics artifact is not a file.");
  let retained: unknown;
  try {
    retained = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new Error("Measurement statistics artifact is malformed JSON.");
  }
  assertMeasurementStatisticsRecord(retained);
  const reproduced = await createMeasurementStatistics({
    inputRoot: resolve(input.inputRoot),
    expectation: input.expectation,
  });
  if (canonicalJson(retained) !== canonicalJson(reproduced))
    throw new Error(
      "Measurement statistics do not reproduce from independently validated lane artifacts.",
    );
  return reproduced;
}
