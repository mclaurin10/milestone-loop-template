import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { strictlyContained } from "./path-safety.js";
import { redactSensitiveText } from "./redaction.js";
import { atomicWriteJson } from "./state-store.js";
import { TelemetryStore } from "./telemetry-store.js";
import type { TelemetryAvailability } from "./telemetry-contracts.js";

export const HISTORICAL_BASELINE_ID = "d015-d030-retained-v1" as const;
export const HISTORICAL_FROM_COMMIT =
  "33a03a15fe64cfc556815b83c4a373aa0a0e16db" as const;
export const HISTORICAL_THROUGH_COMMIT =
  "41f14e8c5d11f3b5c3329a94413dcd24c7622cd1" as const;

interface SourceRecord {
  readonly path: string;
  readonly kind: "result" | "receipt" | "artifact";
  readonly bytes: number;
  readonly sha256: string;
}

interface HistoricalCommandObservation {
  readonly id: string;
  readonly status: string;
  readonly durationMs: number | null;
  readonly durationAvailability: TelemetryAvailability;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly receiptPath: string | null;
}

interface HistoricalObservation {
  readonly runId: string;
  readonly sourceResultPath: string;
  readonly status: string;
  readonly exactNoArgument: boolean;
  readonly configuredDefaultProfile: boolean;
  readonly selectedByOverride: boolean;
  readonly candidate: {
    readonly commit: string;
    readonly tree: string | null;
    readonly dirty: boolean;
  };
  readonly changeClass: string;
  readonly durationMs: number | null;
  readonly durationAvailability: TelemetryAvailability;
  readonly commands: readonly HistoricalCommandObservation[];
  readonly tests: {
    readonly suites: number;
    readonly passedSuites: number;
    readonly failedSuites: number;
    readonly skippedSuites: number;
    readonly tests: number;
    readonly passedTests: number;
    readonly failedTests: number;
    readonly skippedTests: number;
  } | null;
  readonly artifactCount: number;
  readonly artifactBytes: number;
  readonly unavailable: {
    readonly inspectionDuration: "not-recorded";
    readonly planningDuration: "outside-controller";
    readonly implementationDuration: "outside-controller";
    readonly reviewDuration: "outside-controller";
    readonly integrationDuration: "outside-controller";
    readonly retryClassification: "not-recorded";
    readonly agentUsage: "not-recorded";
  };
}

export interface DistributionStatistics {
  readonly count: number;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly medianAbsoluteDeviation: number | null;
}

export interface HistoricalTelemetryReport {
  readonly schemaVersion: "1.0.0";
  readonly baselineId: typeof HISTORICAL_BASELINE_ID;
  readonly boundary: {
    readonly fromCommit: string;
    readonly throughCommit: string;
  };
  readonly sourceRoot: string;
  readonly sources: readonly SourceRecord[];
  readonly observations: readonly HistoricalObservation[];
  readonly metrics: {
    readonly exactResultDurationMs: DistributionStatistics;
    readonly cleanDefaultNoArgumentDurationMs: DistributionStatistics;
    readonly commandDurationMs: Readonly<
      Record<string, DistributionStatistics>
    >;
    readonly changeClassDurationMs: Readonly<
      Record<string, DistributionStatistics>
    >;
    readonly artifactCount: DistributionStatistics;
    readonly artifactBytes: DistributionStatistics;
  };
  readonly generatedAt: string;
}

function hash(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower === undefined || upper === undefined
    ? null
    : (lower + upper) / 2;
}

export function distribution(
  values: readonly number[],
): DistributionStatistics {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .toSorted((left, right) => left - right);
  const p50 = median(sorted);
  const p95Index =
    sorted.length === 0 ? -1 : Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const deviations =
    p50 === null
      ? []
      : sorted
          .map((value) => Math.abs(value - p50))
          .toSorted((left, right) => left - right);
  return {
    count: sorted.length,
    minimum: sorted[0] ?? null,
    maximum: sorted.at(-1) ?? null,
    p50,
    p95: p95Index < 0 ? null : (sorted[p95Index] ?? null),
    medianAbsoluteDeviation: median(deviations),
  };
}

function safeRelative(root: string, path: string): string {
  const value = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value.split("/").includes("..")
  )
    throw new Error(`Historical telemetry source escapes its root: ${path}.`);
  return value;
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  allowNonzero = false,
): string | null {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && !allowNonzero))
    throw new Error(
      `Historical telemetry Git query failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitWithInput(
  repositoryRoot: string,
  args: readonly string[],
  input: string,
): string {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    input,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Historical telemetry Git query failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout;
}

function commitsInRange(
  repositoryRoot: string,
  fromCommit: string,
  throughCommit: string,
): ReadonlySet<string> {
  if (
    git(
      repositoryRoot,
      ["merge-base", "--is-ancestor", fromCommit, throughCommit],
      true,
    ) === null
  )
    throw new Error("Historical telemetry boundary commits are not ordered.");
  const descendants =
    git(repositoryRoot, [
      "rev-list",
      "--ancestry-path",
      `${fromCommit}..${throughCommit}`,
    ]) ?? "";
  return new Set([
    fromCommit,
    ...descendants.split(/\r?\n/).filter((commit) => commit.length > 0),
  ]);
}

function classifyPaths(paths: readonly string[]): string {
  if (paths.length === 0) return "empty-change";
  if (
    paths.every(
      (path) => path.startsWith("docs/") || path.startsWith(".agent/"),
    )
  )
    return "governance-record";
  const product = paths.some(
    (path) =>
      path.startsWith("packages/") ||
      path.startsWith("apps/") ||
      path.startsWith("tests/e2e/") ||
      path.startsWith("tests/parity/"),
  );
  const tooling = paths.some(
    (path) =>
      path.startsWith("tools/") ||
      path === "package.json" ||
      path.endsWith(".config.ts") ||
      path.endsWith(".config.mjs"),
  );
  if (product && tooling) return "vertical-product";
  if (product) return "product-implementation";
  if (tooling) return "tooling";
  return "mixed-record";
}

function classifyCommits(
  repositoryRoot: string,
  commits: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const output = gitWithInput(
    repositoryRoot,
    [
      "diff-tree",
      "--stdin",
      "--root",
      "--name-only",
      "-r",
      "--no-renames",
      "-z",
      "--format=%x00%H%x00",
    ],
    `${[...commits].join("\n")}\n`,
  );
  const markers = [...output.matchAll(/\0([0-9a-f]{40})\0\0\n/g)];
  if (markers.length !== commits.size)
    throw new Error(
      "Historical telemetry could not classify the complete commit range.",
    );
  const result = new Map<string, string>();
  for (const [index, marker] of markers.entries()) {
    const commit = marker[1];
    const markerIndex = marker.index;
    if (!commit || markerIndex === undefined)
      throw new Error(
        "Historical telemetry commit classification is malformed.",
      );
    const nextIndex = markers[index + 1]?.index ?? output.length;
    const paths = output
      .slice(markerIndex + marker[0].length, nextIndex)
      .split("\0")
      .filter((path) => path.length > 0);
    result.set(commit, classifyPaths(paths));
  }
  return result;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function nullableInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function parseVitestCounts(value: unknown): HistoricalObservation["tests"] {
  const input = record(value);
  if (!input) return null;
  const numeric = (key: string): number | null => {
    const value = input[key];
    return Number.isSafeInteger(value) && Number(value) >= 0
      ? Number(value)
      : null;
  };
  const tests = numeric("numTotalTests");
  const passedTests = numeric("numPassedTests");
  const failedTests = numeric("numFailedTests");
  const skippedTests = numeric("numPendingTests");
  const suites = numeric("numTotalTestSuites");
  const passedSuites = numeric("numPassedTestSuites");
  const failedSuites = numeric("numFailedTestSuites");
  const skippedSuites = numeric("numPendingTestSuites");
  if (
    [
      tests,
      passedTests,
      failedTests,
      skippedTests,
      suites,
      passedSuites,
      failedSuites,
      skippedSuites,
    ].some((entry) => entry === null)
  )
    return null;
  return {
    suites: suites ?? 0,
    passedSuites: passedSuites ?? 0,
    failedSuites: failedSuites ?? 0,
    skippedSuites: skippedSuites ?? 0,
    tests: tests ?? 0,
    passedTests: passedTests ?? 0,
    failedTests: failedTests ?? 0,
    skippedTests: skippedTests ?? 0,
  };
}

async function sourceRecord(
  repositoryRoot: string,
  path: string,
  kind: SourceRecord["kind"],
): Promise<SourceRecord> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Historical telemetry source is not a regular file: ${path}.`,
    );
  const contents = await readFile(path);
  return {
    path: safeRelative(repositoryRoot, path),
    kind,
    bytes: contents.byteLength,
    sha256: hash(contents),
  };
}

async function inspectResult(input: {
  readonly repositoryRoot: string;
  readonly resultPath: string;
  readonly allowedCommits: ReadonlySet<string>;
  readonly changeClasses: ReadonlyMap<string, string>;
  readonly sources: Map<string, SourceRecord>;
}): Promise<HistoricalObservation | null> {
  const resultSource = await sourceRecord(
    input.repositoryRoot,
    input.resultPath,
    "result",
  );
  const parsed = record(
    JSON.parse(await readFile(input.resultPath, "utf8")) as unknown,
  );
  const candidate = record(parsed?.["candidate"]);
  const commit = candidate?.["gitCommit"];
  if (
    typeof commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    !input.allowedCommits.has(commit)
  )
    return null;
  input.sources.set(resultSource.path, resultSource);
  const resultDirectory = resolve(input.resultPath, "..");
  const commands: HistoricalCommandObservation[] = [];
  let artifactCount = 0;
  let artifactBytes = 0;
  let testCounts: HistoricalObservation["tests"] = null;
  const stages = Array.isArray(parsed?.["stages"]) ? parsed["stages"] : [];
  for (const stageValue of stages) {
    const stage = record(stageValue);
    const stageCommands = Array.isArray(stage?.["commands"])
      ? stage["commands"]
      : [];
    for (const commandValue of stageCommands) {
      const command = record(commandValue);
      if (!command || typeof command["script"] !== "string") continue;
      const executed =
        command["exitCode"] !== null ||
        command["signal"] !== null ||
        typeof command["log"] === "string" ||
        command["evidence"] !== null;
      const duration = executed ? finiteDuration(command["durationMs"]) : null;
      const evidence = record(command["evidence"]);
      const receiptRelative =
        evidence && typeof evidence["receipt"] === "string"
          ? evidence["receipt"]
          : null;
      if (receiptRelative) {
        const receiptPath = resolve(resultDirectory, receiptRelative);
        if (!strictlyContained(resultDirectory, receiptPath))
          throw new Error("Historical receipt escapes its verification run.");
        const receipt = await sourceRecord(
          input.repositoryRoot,
          receiptPath,
          "receipt",
        );
        input.sources.set(receipt.path, receipt);
      }
      const declarations = Array.isArray(evidence?.["artifacts"])
        ? evidence["artifacts"]
        : [];
      for (const declarationValue of declarations) {
        const declaration = record(declarationValue);
        if (!declaration || typeof declaration["path"] !== "string") continue;
        const artifactPath = resolve(resultDirectory, declaration["path"]);
        if (!strictlyContained(resultDirectory, artifactPath))
          throw new Error("Historical artifact escapes its verification run.");
        const source = await sourceRecord(
          input.repositoryRoot,
          artifactPath,
          "artifact",
        );
        if (
          declaration["bytes"] !== source.bytes ||
          declaration["sha256"] !== source.sha256
        )
          throw new Error(
            `Historical artifact declaration is invalid: ${source.path}.`,
          );
        input.sources.set(source.path, source);
        artifactCount += 1;
        artifactBytes += source.bytes;
        if (declaration["kind"] === "vitest-report") {
          const counts = parseVitestCounts(
            JSON.parse(await readFile(artifactPath, "utf8")) as unknown,
          );
          if (counts) testCounts = counts;
        }
      }
      commands.push({
        id: command["script"],
        status:
          typeof command["status"] === "string"
            ? command["status"]
            : "unparseable",
        durationMs: duration,
        durationAvailability: duration === null ? "not-applicable" : "measured",
        exitCode: nullableInteger(command["exitCode"]),
        signal:
          typeof command["signal"] === "string" ? command["signal"] : null,
        receiptPath: receiptRelative,
      });
    }
  }
  const profile = record(parsed?.["profile"]);
  const invocation = parsed?.["invocation"];
  const durationMs = finiteDuration(parsed?.["durationMs"]);
  return {
    runId:
      typeof parsed?.["runId"] === "string"
        ? parsed["runId"]
        : resultSource.path,
    sourceResultPath: resultSource.path,
    status:
      typeof parsed?.["status"] === "string" ? parsed["status"] : "unparseable",
    exactNoArgument:
      Array.isArray(invocation) &&
      invocation.length === 2 &&
      invocation[0] === "node" &&
      invocation[1] === "scripts/verify.mjs",
    configuredDefaultProfile:
      profile?.["id"] === "readiness" &&
      profile["configuredDefault"] === "readiness",
    selectedByOverride: profile?.["selectedByOverride"] === true,
    candidate: {
      commit,
      tree:
        typeof candidate?.["gitTree"] === "string"
          ? candidate["gitTree"]
          : null,
      dirty: candidate?.["workingTreeDirty"] === true,
    },
    changeClass:
      input.changeClasses.get(commit) ??
      (() => {
        throw new Error(
          `Historical telemetry change class is unavailable for ${commit}.`,
        );
      })(),
    durationMs,
    durationAvailability: durationMs === null ? "unparseable" : "measured",
    commands,
    tests: testCounts,
    artifactCount,
    artifactBytes,
    unavailable: {
      inspectionDuration: "not-recorded",
      planningDuration: "outside-controller",
      implementationDuration: "outside-controller",
      reviewDuration: "outside-controller",
      integrationDuration: "outside-controller",
      retryClassification: "not-recorded",
      agentUsage: "not-recorded",
    },
  };
}

function groupedStatistics(
  values: readonly { readonly key: string; readonly value: number }[],
): Readonly<Record<string, DistributionStatistics>> {
  const groups = new Map<string, number[]>();
  for (const entry of values) {
    const current = groups.get(entry.key) ?? [];
    current.push(entry.value);
    groups.set(entry.key, current);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, group]) => [key, distribution(group)]),
  );
}

export async function buildHistoricalTelemetryReport(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot?: string;
  readonly outputDirectory?: string;
  readonly fromCommit?: string;
  readonly throughCommit?: string;
  readonly now?: () => Date;
}): Promise<{
  readonly report: HistoricalTelemetryReport;
  readonly reportPath: string;
  readonly summaryPath: string;
}> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const artifactRoot = resolve(
    input.artifactRoot ?? resolve(repositoryRoot, "artifacts"),
  );
  const metadata = await lstat(artifactRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("Historical telemetry artifact root is unsafe.");
  const fromCommit = input.fromCommit ?? HISTORICAL_FROM_COMMIT;
  const throughCommit = input.throughCommit ?? HISTORICAL_THROUGH_COMMIT;
  for (const commit of [fromCommit, throughCommit]) {
    if (!/^[0-9a-f]{40}$/.test(commit))
      throw new Error("Historical telemetry boundary commit is malformed.");
    git(repositoryRoot, ["cat-file", "-e", `${commit}^{commit}`]);
  }
  const allowedCommits = commitsInRange(
    repositoryRoot,
    fromCommit,
    throughCommit,
  );
  const changeClasses = classifyCommits(repositoryRoot, allowedCommits);
  const sources = new Map<string, SourceRecord>();
  const observations: HistoricalObservation[] = [];
  for (const entry of await readdir(artifactRoot, { withFileTypes: true })) {
    if (!entry.name.startsWith("verify-")) continue;
    if (entry.isSymbolicLink())
      throw new Error(
        `Historical verification run cannot be a symlink: ${entry.name}.`,
      );
    if (!entry.isDirectory()) continue;
    const resultPath = resolve(artifactRoot, entry.name, "result.json");
    try {
      const observation = await inspectResult({
        repositoryRoot,
        resultPath,
        allowedCommits,
        changeClasses,
        sources,
      });
      if (observation) observations.push(observation);
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
  observations.sort((left, right) => left.runId.localeCompare(right.runId));
  if (observations.length === 0)
    throw new Error(
      "No retained D-015 through D-030 verification results were found.",
    );
  const measured = observations.filter(
    (entry): entry is HistoricalObservation & { durationMs: number } =>
      entry.durationMs !== null,
  );
  const canonical = measured.filter(
    (entry) =>
      entry.exactNoArgument &&
      entry.configuredDefaultProfile &&
      !entry.selectedByOverride &&
      !entry.candidate.dirty,
  );
  const commandValues = observations.flatMap((entry) =>
    entry.commands.flatMap((command) =>
      command.durationMs === null
        ? []
        : [{ key: command.id, value: command.durationMs }],
    ),
  );
  const now = input.now ?? (() => new Date());
  const report: HistoricalTelemetryReport = {
    schemaVersion: "1.0.0",
    baselineId: HISTORICAL_BASELINE_ID,
    boundary: { fromCommit, throughCommit },
    sourceRoot: safeRelative(repositoryRoot, artifactRoot),
    sources: [...sources.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    observations,
    metrics: {
      exactResultDurationMs: distribution(
        measured.map((entry) => entry.durationMs),
      ),
      cleanDefaultNoArgumentDurationMs: distribution(
        canonical.map((entry) => entry.durationMs),
      ),
      commandDurationMs: groupedStatistics(commandValues),
      changeClassDurationMs: groupedStatistics(
        measured.map((entry) => ({
          key: entry.changeClass,
          value: entry.durationMs,
        })),
      ),
      artifactCount: distribution(
        observations.map((entry) => entry.artifactCount),
      ),
      artifactBytes: distribution(
        observations.map((entry) => entry.artifactBytes),
      ),
    },
    generatedAt: now().toISOString(),
  };
  const outputDirectory = resolve(
    input.outputDirectory ??
      resolve(
        artifactRoot,
        "loop-telemetry",
        "baselines",
        HISTORICAL_BASELINE_ID,
      ),
  );
  if (!strictlyContained(artifactRoot, outputDirectory))
    throw new Error("Historical telemetry output escapes the artifact root.");
  await mkdir(outputDirectory, { recursive: true });
  const reportPath = resolve(outputDirectory, "baseline.json");
  const summaryPath = resolve(outputDirectory, "baseline-summary.md");
  await atomicWriteJson(reportPath, report);
  const metric = report.metrics.cleanDefaultNoArgumentDurationMs;
  const markdown = [
    `# Historical loop telemetry ${report.baselineId}`,
    "",
    `Boundary: ${fromCommit} through ${throughCommit}`,
    `Retained results: ${report.observations.length}`,
    `Hashed sources: ${report.sources.length}`,
    `Clean default no-argument duration p50/p95/MAD: ${metric.p50 ?? "unavailable"}/${metric.p95 ?? "unavailable"}/${metric.medianAbsoluteDeviation ?? "unavailable"} ms`,
    "",
    "Historical planner, worker, reviewer, integration, retry-classification, and agent-usage fields are not inferred from prose. They remain explicitly outside-controller or not-recorded.",
    "",
  ].join("\n");
  await writeFile(summaryPath, redactSensitiveText(markdown), "utf8");
  return { report, reportPath, summaryPath };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`Telemetry report option ${name} requires a value.`);
  return value;
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(process.cwd());
  const runId = `telemetry-report-${new Date()
    .toISOString()
    .replaceAll(/[^0-9]/g, "")}-${process.pid}`;
  const telemetry = await TelemetryStore.open({
    repositoryRoot,
    directory: resolve(
      repositoryRoot,
      "artifacts",
      "loop-telemetry",
      "direct",
      runId,
    ),
    runId,
    source: "direct",
  });
  const span = await telemetry.beginPhase({
    phase: "recording",
    eventType: "historical-telemetry-report",
  });
  try {
    const fromCommit = option("--from");
    const throughCommit = option("--through");
    const outputDirectory = option("--output");
    const result = await buildHistoricalTelemetryReport({
      repositoryRoot,
      ...(fromCommit ? { fromCommit } : {}),
      ...(throughCommit ? { throughCommit } : {}),
      ...(outputDirectory
        ? { outputDirectory: resolve(repositoryRoot, outputDirectory) }
        : {}),
    });
    const sources = await Promise.all(
      [result.reportPath, result.summaryPath].map(async (path) => {
        const contents = await readFile(path);
        return { path, bytes: contents.byteLength };
      }),
    );
    await span.finish({
      status: "PASS",
      artifacts: {
        fileCount: sources.length,
        totalBytes: sources.reduce((sum, entry) => sum + entry.bytes, 0),
        manifestReferences: [
          safeRelative(repositoryRoot, result.reportPath),
          safeRelative(repositoryRoot, result.summaryPath),
        ],
        receiptReferences: [],
      },
    });
    await telemetry.complete("PASS");
    process.stdout.write(
      `Historical telemetry report: ${safeRelative(repositoryRoot, result.reportPath)}\n`,
    );
  } catch (error) {
    const message = redactSensitiveText(
      error instanceof Error ? error.message : String(error),
    );
    await span.finish({ status: "ERROR", reason: message });
    await telemetry.complete("ERROR", message);
    throw error;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
