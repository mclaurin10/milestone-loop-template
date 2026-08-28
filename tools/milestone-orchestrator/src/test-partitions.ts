import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import {
  artifactDeclaration,
  commandIdentity,
  evidenceContext,
  writeJson,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import { runCommand } from "./command-runner.js";
import {
  evaluateRepositoryTestOwnership,
  formatTestOwnershipFailure,
  TEST_OWNER_IDS,
  type TestOwnerId,
  type TestOwnershipReport,
} from "./test-ownership.js";
import {
  validateCommandReceiptDirectory,
  type ValidatedCommandReceipt,
} from "./verifier.js";
import {
  beginTestRunMeasurement,
  describeVitestReport,
  loadValidatedTestRunSummary,
  reduceTestRunSummaries,
  TEST_RUN_REDUCTION_KIND,
  TEST_RUN_REDUCTION_NAME,
  TEST_RUN_SUMMARY_KIND,
  TEST_RUN_SUMMARY_NAME,
  writeTestRunReduction,
  type TestRunCandidate,
  type TestRunCommandIdentity,
  type TestRunMeasurementSession,
  type TestRunRole,
  type TestRunSummaryExpectation,
  type ValidatedTestRunSummarySource,
} from "./test-run-summary.js";

export const TEST_PARTITION_REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_PARTITION_PROOF_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_PARTITION_SHADOW_SCHEMA_VERSION = "1.0.0" as const;

const PARTITION_STAGE_ID = "wp6-shadow-partition";
const SHADOW_STAGE_ID = "wp6-shadow";
const SHADOW_COMMAND_ID = "test:partitions:shadow";
const PARTITION_RAW_KIND = "test-partition-vitest-report";
const PARTITION_REPORT_KIND = "test-partition-report";
const SHADOW_PROOF_KIND = "test-partition-shadow-proof";
const CHILD_RECEIPT_KIND = "test-partition-child-receipt";
const LEGACY_RAW_KIND = "test-partition-shadow-legacy-vitest-report";
const OMISSION_MUTATION_PROOF_KIND = "test-partition-omission-mutation-proof";
const COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
const AGGREGATE_CHILD_TIMEOUT_MS = 75 * 60 * 1000;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareStrings);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function inventorySha256(values: readonly string[]): string {
  return sha256(`${values.join("\n")}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeName(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9._-]/gu, "-");
}

export function normalizeRepositoryPath(value: string): string {
  const slash = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  const parts = slash.split("/");
  if (
    slash.length === 0 ||
    slash.startsWith("/") ||
    /^[A-Za-z]:\//u.test(slash) ||
    parts.some((part) => part === "" || part === "." || part === "..")
  )
    throw new Error(`Repository path is not canonical and relative: ${value}`);
  return parts.join("/");
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export interface PartitionMembership {
  readonly owner: string;
  readonly files: readonly string[];
}

export interface PartitionMembershipDiagnostic {
  readonly code:
    | "DUPLICATE_PARTITION_OWNER"
    | "DUPLICATE_PARTITION_MEMBER"
    | "MULTIPLY_SELECTED_FILE"
    | "MISSING_DISCOVERED_FILE"
    | "UNEXPECTED_PARTITION_FILE";
  readonly owner: string | null;
  readonly path: string | null;
  readonly message: string;
}

export interface PartitionMembershipProof {
  readonly schemaVersion: typeof TEST_PARTITION_PROOF_SCHEMA_VERSION;
  readonly status: "PASS" | "FAIL";
  readonly universe: {
    readonly fileCount: number;
    readonly sha256: string;
    readonly files: readonly string[];
  };
  readonly partitions: readonly {
    readonly owner: string;
    readonly fileCount: number;
    readonly sha256: string;
    readonly files: readonly string[];
  }[];
  readonly pairwiseIntersections: readonly {
    readonly leftOwner: string;
    readonly rightOwner: string;
    readonly count: number;
    readonly files: readonly string[];
  }[];
  readonly union: {
    readonly fileCount: number;
    readonly sha256: string;
    readonly files: readonly string[];
    readonly missing: readonly string[];
    readonly unexpected: readonly string[];
    readonly equalsUniverse: boolean;
  };
  readonly diagnostics: readonly PartitionMembershipDiagnostic[];
}

export function provePartitionMembership(
  discoveredUniverse: readonly string[],
  inputPartitions: readonly PartitionMembership[],
): PartitionMembershipProof {
  const universe = sortedUnique(
    discoveredUniverse.map((path) => normalizeRepositoryPath(path)),
  );
  const diagnostics: PartitionMembershipDiagnostic[] = [];
  const ownerCounts = new Map<string, number>();
  const partitions = inputPartitions
    .map((partition) => {
      ownerCounts.set(
        partition.owner,
        (ownerCounts.get(partition.owner) ?? 0) + 1,
      );
      const normalized = partition.files.map((path) =>
        normalizeRepositoryPath(path),
      );
      const counts = new Map<string, number>();
      for (const path of normalized)
        counts.set(path, (counts.get(path) ?? 0) + 1);
      for (const [path, count] of [...counts.entries()].sort(
        ([left], [right]) => compareStrings(left, right),
      )) {
        if (count > 1)
          diagnostics.push({
            code: "DUPLICATE_PARTITION_MEMBER",
            owner: partition.owner,
            path,
            message: `${partition.owner} selects ${path} ${count} times.`,
          });
      }
      const files = sortedUnique(normalized);
      return {
        owner: partition.owner,
        fileCount: files.length,
        sha256: inventorySha256(files),
        files,
      };
    })
    .sort((left, right) => compareStrings(left.owner, right.owner));

  for (const [owner, count] of [...ownerCounts.entries()].sort(
    ([left], [right]) => compareStrings(left, right),
  )) {
    if (count > 1)
      diagnostics.push({
        code: "DUPLICATE_PARTITION_OWNER",
        owner,
        path: null,
        message: `Partition owner ${owner} is declared ${count} times.`,
      });
  }

  const pairwiseIntersections: {
    leftOwner: string;
    rightOwner: string;
    count: number;
    files: readonly string[];
  }[] = [];
  for (let leftIndex = 0; leftIndex < partitions.length; leftIndex += 1) {
    const left = partitions[leftIndex];
    if (!left) continue;
    const leftSet = new Set(left.files);
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < partitions.length;
      rightIndex += 1
    ) {
      const right = partitions[rightIndex];
      if (!right) continue;
      const files = right.files.filter((path) => leftSet.has(path));
      pairwiseIntersections.push({
        leftOwner: left.owner,
        rightOwner: right.owner,
        count: files.length,
        files,
      });
      for (const path of files)
        diagnostics.push({
          code: "MULTIPLY_SELECTED_FILE",
          owner: null,
          path,
          message: `${path} is selected by both ${left.owner} and ${right.owner}.`,
        });
    }
  }

  const unionFiles = sortedUnique(
    partitions.flatMap((partition) => partition.files),
  );
  const universeSet = new Set(universe);
  const unionSet = new Set(unionFiles);
  const missing = universe.filter((path) => !unionSet.has(path));
  const unexpected = unionFiles.filter((path) => !universeSet.has(path));
  for (const path of missing)
    diagnostics.push({
      code: "MISSING_DISCOVERED_FILE",
      owner: null,
      path,
      message: `${path} is discovered but absent from every executable partition.`,
    });
  for (const path of unexpected)
    diagnostics.push({
      code: "UNEXPECTED_PARTITION_FILE",
      owner: null,
      path,
      message: `${path} is selected by a partition but absent from discovery.`,
    });

  diagnostics.sort((left, right) =>
    compareStrings(
      `${left.code}\0${left.owner ?? ""}\0${left.path ?? ""}\0${left.message}`,
      `${right.code}\0${right.owner ?? ""}\0${right.path ?? ""}\0${right.message}`,
    ),
  );
  return {
    schemaVersion: TEST_PARTITION_PROOF_SCHEMA_VERSION,
    status: diagnostics.length === 0 ? "PASS" : "FAIL",
    universe: {
      fileCount: universe.length,
      sha256: inventorySha256(universe),
      files: universe,
    },
    partitions,
    pairwiseIntersections,
    union: {
      fileCount: unionFiles.length,
      sha256: inventorySha256(unionFiles),
      files: unionFiles,
      missing,
      unexpected,
      equalsUniverse: sameStrings(universe, unionFiles),
    },
    diagnostics,
  };
}

export interface PartitionConfigAssignment {
  readonly configPath: string;
  readonly files: readonly string[];
}

function configDirectory(configPath: string): string {
  const directory = dirname(configPath).replaceAll("\\", "/");
  return directory === "." ? "" : directory;
}

function containmentDepth(configPath: string, file: string): number {
  const directory = configDirectory(configPath);
  if (directory.length === 0) return 0;
  if (file === directory || file.startsWith(`${directory}/`))
    return directory.split("/").length;
  return -1;
}

export function assignFilesToDiscoveredConfigs(
  report: Pick<TestOwnershipReport, "discovery">,
  files: readonly string[],
): readonly PartitionConfigAssignment[] {
  const grouped = new Map<string, string[]>();
  for (const requested of files) {
    const file = normalizeRepositoryPath(requested);
    const candidates = report.discovery.sources
      .filter((source) => source.files.includes(file))
      .map((source) => ({
        configPath: normalizeRepositoryPath(source.configPath),
        depth: containmentDepth(source.configPath, file),
      }))
      .filter((candidate) => candidate.depth >= 0)
      .sort(
        (left, right) =>
          right.depth - left.depth ||
          compareStrings(left.configPath, right.configPath),
      );
    const selected = candidates[0];
    if (!selected)
      throw new Error(
        `No independently discovered Vitest config can execute ${file}.`,
      );
    const group = grouped.get(selected.configPath) ?? [];
    group.push(file);
    grouped.set(selected.configPath, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([configPath, selectedFiles]) => ({
      configPath,
      files: sortedUnique(selectedFiles),
    }));
}

export interface SemanticTestObservation {
  readonly source: string;
  readonly file: string;
  readonly testId: string;
  readonly identity: string;
  readonly disposition: string;
  readonly failureOutcome: readonly string[];
}

export interface NormalizedVitestReport {
  readonly source: string;
  readonly files: readonly string[];
  readonly observations: readonly SemanticTestObservation[];
  readonly counts: {
    readonly files: number;
    readonly tests: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly semanticSha256: string;
}

function normalizedAbsolutePrefix(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/$/u, "");
}

export function normalizeReportedTestFile(
  repositoryRoot: string,
  value: string,
): string {
  let candidate = value;
  if (candidate.startsWith("file://")) {
    try {
      candidate = new URL(candidate).pathname;
      if (/^\/[A-Za-z]:\//u.test(candidate)) candidate = candidate.slice(1);
    } catch {
      throw new Error(`Vitest reported an invalid file URL: ${value}`);
    }
  }
  const slash = normalizedAbsolutePrefix(candidate);
  const root = normalizedAbsolutePrefix(resolve(repositoryRoot));
  const windowsAbsolute = /^[A-Za-z]:\//u.test(slash);
  const absolute =
    isAbsolute(candidate) || windowsAbsolute || slash.startsWith("/");
  let relativePath: string;
  if (absolute) {
    const foldedSlash = windowsAbsolute ? slash.toLowerCase() : slash;
    const foldedRoot = /^[A-Za-z]:\//u.test(root) ? root.toLowerCase() : root;
    if (!foldedSlash.startsWith(`${foldedRoot}/`))
      throw new Error(`Vitest report path escapes the repository: ${value}`);
    relativePath = slash.slice(root.length + 1);
  } else {
    relativePath = slash;
  }
  return normalizeRepositoryPath(relativePath);
}

function normalizeFailureText(repositoryRoot: string, value: string): string {
  const slash = value.replaceAll("\\", "/");
  const root = normalizedAbsolutePrefix(resolve(repositoryRoot));
  const foldedRoot = /^[A-Za-z]:\//u.test(root) ? root.toLowerCase() : root;
  if (/^[A-Za-z]:\//u.test(root)) {
    const lower = slash.toLowerCase();
    let output = "";
    let cursor = 0;
    let index = lower.indexOf(foldedRoot, cursor);
    while (index >= 0) {
      output += `${slash.slice(cursor, index)}<repo>`;
      cursor = index + root.length;
      index = lower.indexOf(foldedRoot, cursor);
    }
    return `${output}${slash.slice(cursor)}`.replaceAll("\r\n", "\n").trim();
  }
  return slash.replaceAll(root, "<repo>").replaceAll("\r\n", "\n").trim();
}

function semanticKey(observation: SemanticTestObservation): string {
  return JSON.stringify({
    testId: observation.testId,
    disposition: observation.disposition,
    failureOutcome: observation.failureOutcome,
  });
}

export function normalizeVitestReport(
  repositoryRoot: string,
  source: string,
  value: unknown,
): NormalizedVitestReport {
  if (!isRecord(value) || !Array.isArray(value["testResults"]))
    throw new Error(`${source} is not a Vitest JSON report.`);
  const observations: SemanticTestObservation[] = [];
  const files: string[] = [];
  for (const [resultIndex, resultValue] of value["testResults"].entries()) {
    if (!isRecord(resultValue) || typeof resultValue["name"] !== "string")
      throw new Error(`${source} testResults[${resultIndex}] is malformed.`);
    const file = normalizeReportedTestFile(repositoryRoot, resultValue["name"]);
    files.push(file);
    const assertions = resultValue["assertionResults"];
    if (!Array.isArray(assertions))
      throw new Error(
        `${source} testResults[${resultIndex}].assertionResults is malformed.`,
      );
    if (assertions.length === 0 && resultValue["status"] !== "passed") {
      const disposition =
        typeof resultValue["status"] === "string"
          ? resultValue["status"]
          : "failed";
      const failureOutcome =
        typeof resultValue["message"] === "string" &&
        resultValue["message"].trim() !== ""
          ? [normalizeFailureText(repositoryRoot, resultValue["message"])]
          : [];
      observations.push({
        source,
        file,
        identity: "<suite setup>",
        testId: `${file}::<suite setup>`,
        disposition,
        failureOutcome,
      });
    }
    for (const [assertionIndex, assertionValue] of assertions.entries()) {
      if (!isRecord(assertionValue))
        throw new Error(
          `${source} assertion ${resultIndex}:${assertionIndex} is malformed.`,
        );
      const identity =
        typeof assertionValue["fullName"] === "string" &&
        assertionValue["fullName"].trim() !== ""
          ? assertionValue["fullName"]
          : typeof assertionValue["title"] === "string" &&
              assertionValue["title"].trim() !== ""
            ? assertionValue["title"]
            : null;
      if (!identity || typeof assertionValue["status"] !== "string")
        throw new Error(
          `${source} assertion ${resultIndex}:${assertionIndex} lacks identity or disposition.`,
        );
      const failureMessages = assertionValue["failureMessages"];
      if (
        !Array.isArray(failureMessages) ||
        failureMessages.some((message) => typeof message !== "string")
      )
        throw new Error(
          `${source} assertion ${resultIndex}:${assertionIndex} has invalid failure output.`,
        );
      const failureOutcome = (failureMessages as string[])
        .map((message) => normalizeFailureText(repositoryRoot, message))
        .sort(compareStrings);
      observations.push({
        source,
        file,
        identity,
        testId: `${file}::${identity}`,
        disposition: assertionValue["status"],
        failureOutcome,
      });
    }
  }
  observations.sort((left, right) =>
    compareStrings(
      `${left.testId}\0${left.source}\0${semanticKey(left)}`,
      `${right.testId}\0${right.source}\0${semanticKey(right)}`,
    ),
  );
  const reportedTotal = value["numTotalTests"];
  if (
    !Number.isSafeInteger(reportedTotal) ||
    Number(reportedTotal) !== observations.length
  )
    throw new Error(
      `${source} normalized ${observations.length} tests but Vitest reported ${String(reportedTotal)}.`,
    );
  const count = (key: string): number => {
    const candidate = value[key];
    if (!Number.isSafeInteger(candidate) || Number(candidate) < 0)
      throw new Error(`${source} has invalid ${key}.`);
    return Number(candidate);
  };
  if (value["success"] !== true)
    throw new Error(`${source} does not report success: true.`);
  const totalSuites = count("numTotalTestSuites");
  const passedSuites = count("numPassedTestSuites");
  const failedSuites = count("numFailedTestSuites");
  const pendingSuites = count("numPendingTestSuites");
  const totalTests = count("numTotalTests");
  const passedTests = count("numPassedTests");
  const failedTests = count("numFailedTests");
  const pendingTests = count("numPendingTests");
  const todoTests = count("numTodoTests");
  if (totalSuites !== passedSuites + failedSuites + pendingSuites)
    throw new Error(
      `${source} has contradictory suite totals: total=${totalSuites}, passed=${passedSuites}, failed=${failedSuites}, pending=${pendingSuites}.`,
    );
  if (totalTests !== passedTests + failedTests + pendingTests + todoTests)
    throw new Error(
      `${source} has contradictory test totals: total=${totalTests}, passed=${passedTests}, failed=${failedTests}, pending=${pendingTests}, todo=${todoTests}.`,
    );
  if (
    failedSuites !== 0 ||
    pendingSuites !== 0 ||
    failedTests !== 0 ||
    pendingTests !== 0 ||
    todoTests !== 0
  )
    throw new Error(
      `${source} is not all-passing: failedSuites=${failedSuites}, pendingSuites=${pendingSuites}, failedTests=${failedTests}, pendingTests=${pendingTests}, todoTests=${todoTests}.`,
    );
  const nonPassingObservations = observations.filter(
    (observation) => observation.disposition !== "passed",
  );
  if (nonPassingObservations.length > 0)
    throw new Error(
      `${source} contains ${nonPassingObservations.length} non-passing normalized test disposition(s).`,
    );
  return {
    source,
    files: sortedUnique(files),
    observations,
    counts: {
      files: sortedUnique(files).length,
      tests: observations.length,
      passed: passedTests,
      failed: failedTests,
      skipped: pendingTests,
    },
    semanticSha256: sha256(
      `${observations.map((item) => semanticKey(item)).join("\n")}\n`,
    ),
  };
}

export interface ShadowSemanticComparison {
  readonly status: "PASS" | "FAIL";
  readonly legacy: {
    readonly observationCount: number;
    readonly uniqueTestCount: number;
    readonly duplicateObservationCount: number;
    readonly semanticSha256: string;
  };
  readonly partitions: {
    readonly observationCount: number;
    readonly uniqueTestCount: number;
    readonly semanticSha256: string;
  };
  readonly legacyConflicts: readonly {
    readonly testId: string;
    readonly outcomes: readonly string[];
  }[];
  readonly multiplySelectedTests: readonly {
    readonly testId: string;
    readonly count: number;
    readonly sources: readonly string[];
  }[];
  readonly missingTests: readonly string[];
  readonly unexpectedTests: readonly string[];
  readonly outcomeMismatches: readonly {
    readonly testId: string;
    readonly legacy: {
      readonly disposition: string;
      readonly failureOutcome: readonly string[];
    };
    readonly partition: {
      readonly disposition: string;
      readonly failureOutcome: readonly string[];
    };
  }[];
}

function groupObservations(
  observations: readonly SemanticTestObservation[],
): Map<string, SemanticTestObservation[]> {
  const grouped = new Map<string, SemanticTestObservation[]>();
  for (const observation of observations) {
    const values = grouped.get(observation.testId) ?? [];
    values.push(observation);
    grouped.set(observation.testId, values);
  }
  return grouped;
}

function normalizedOutcome(observation: SemanticTestObservation): string {
  return JSON.stringify({
    disposition: observation.disposition,
    failureOutcome: observation.failureOutcome,
  });
}

function semanticInventorySha256(
  observations: readonly SemanticTestObservation[],
): string {
  return sha256(
    `${observations
      .map((observation) => semanticKey(observation))
      .sort(compareStrings)
      .join("\n")}\n`,
  );
}

export function compareShadowSemantics(
  legacyObservations: readonly SemanticTestObservation[],
  partitionObservations: readonly SemanticTestObservation[],
): ShadowSemanticComparison {
  const legacyGroups = groupObservations(legacyObservations);
  const partitionGroups = groupObservations(partitionObservations);
  const legacyConflicts: {
    testId: string;
    outcomes: readonly string[];
  }[] = [];
  const multiplySelectedTests: {
    testId: string;
    count: number;
    sources: readonly string[];
  }[] = [];
  const legacyUnique = new Map<string, SemanticTestObservation>();
  const partitionUnique = new Map<string, SemanticTestObservation>();

  for (const [testId, observations] of [...legacyGroups.entries()].sort(
    ([left], [right]) => compareStrings(left, right),
  )) {
    const outcomes = sortedUnique(observations.map(normalizedOutcome));
    if (outcomes.length > 1) legacyConflicts.push({ testId, outcomes });
    const first = observations[0];
    if (first) legacyUnique.set(testId, first);
  }
  for (const [testId, observations] of [...partitionGroups.entries()].sort(
    ([left], [right]) => compareStrings(left, right),
  )) {
    if (observations.length > 1)
      multiplySelectedTests.push({
        testId,
        count: observations.length,
        sources: sortedUnique(observations.map((item) => item.source)),
      });
    const first = observations[0];
    if (first) partitionUnique.set(testId, first);
  }

  const legacyIds = [...legacyUnique.keys()].sort(compareStrings);
  const partitionIds = [...partitionUnique.keys()].sort(compareStrings);
  const legacyIdSet = new Set(legacyIds);
  const partitionIdSet = new Set(partitionIds);
  const missingTests = legacyIds.filter(
    (testId) => !partitionIdSet.has(testId),
  );
  const unexpectedTests = partitionIds.filter(
    (testId) => !legacyIdSet.has(testId),
  );
  const outcomeMismatches: {
    testId: string;
    legacy: { disposition: string; failureOutcome: readonly string[] };
    partition: { disposition: string; failureOutcome: readonly string[] };
  }[] = [];
  for (const testId of legacyIds) {
    const legacy = legacyUnique.get(testId);
    const partition = partitionUnique.get(testId);
    if (!legacy || !partition) continue;
    if (normalizedOutcome(legacy) !== normalizedOutcome(partition))
      outcomeMismatches.push({
        testId,
        legacy: {
          disposition: legacy.disposition,
          failureOutcome: legacy.failureOutcome,
        },
        partition: {
          disposition: partition.disposition,
          failureOutcome: partition.failureOutcome,
        },
      });
  }

  const legacyNormalized = [...legacyUnique.values()].sort((left, right) =>
    compareStrings(left.testId, right.testId),
  );
  const partitionNormalized = [...partitionUnique.values()].sort(
    (left, right) => compareStrings(left.testId, right.testId),
  );
  const status =
    legacyConflicts.length === 0 &&
    multiplySelectedTests.length === 0 &&
    missingTests.length === 0 &&
    unexpectedTests.length === 0 &&
    outcomeMismatches.length === 0
      ? "PASS"
      : "FAIL";
  return {
    status,
    legacy: {
      observationCount: legacyObservations.length,
      uniqueTestCount: legacyUnique.size,
      duplicateObservationCount: legacyObservations.length - legacyUnique.size,
      semanticSha256: semanticInventorySha256(legacyNormalized),
    },
    partitions: {
      observationCount: partitionObservations.length,
      uniqueTestCount: partitionUnique.size,
      semanticSha256: semanticInventorySha256(partitionNormalized),
    },
    legacyConflicts,
    multiplySelectedTests,
    missingTests,
    unexpectedTests,
    outcomeMismatches,
  };
}

export class AggregateChildFailure extends Error {
  readonly childId: string;
  readonly exitCode: number;

  constructor(childId: string, exitCode: number | null, message: string) {
    const propagated =
      Number.isSafeInteger(exitCode) && Number(exitCode) !== 0
        ? Number(exitCode)
        : 1;
    super(`${childId} failed with exit code ${propagated}: ${message}`);
    this.name = "AggregateChildFailure";
    this.childId = childId;
    this.exitCode = propagated;
  }
}

export interface AggregateChildDefinition {
  readonly id: string;
}

export interface AggregateChildResult {
  readonly status: "PASS" | "NOT_READY" | "FAIL" | "ERROR" | "TIMEOUT";
  readonly exitCode: number | null;
  readonly message: string;
}

export async function executeAggregateChildren<
  Definition extends AggregateChildDefinition,
  Result extends AggregateChildResult,
>(
  children: readonly Definition[],
  execute: (child: Definition) => Promise<Result>,
): Promise<readonly Result[]> {
  const results: Result[] = [];
  for (const child of children) {
    const result = await execute(child);
    results.push(result);
    if (result.status !== "PASS")
      throw new AggregateChildFailure(
        child.id,
        result.exitCode,
        result.message,
      );
  }
  return results;
}

function requirePassingOwnership(report: TestOwnershipReport): void {
  if (report.status !== "PASS")
    throw new Error(formatTestOwnershipFailure(report.diagnostics));
}

function canonicalMembershipProof(
  report: TestOwnershipReport,
): PartitionMembershipProof {
  const proof = provePartitionMembership(
    report.discovery.files,
    report.owners.map((owner) => ({ owner: owner.id, files: owner.files })),
  );
  if (proof.status !== "PASS")
    throw new Error(
      `Executable partition membership proof failed: ${proof.diagnostics
        .map((item) => item.code)
        .join(", ")}.`,
    );
  const actualOwners = proof.partitions.map((partition) => partition.owner);
  const expectedOwners = [...TEST_OWNER_IDS].sort(compareStrings);
  if (!sameStrings(actualOwners, expectedOwners))
    throw new Error(
      `Executable partition owners drifted: expected ${expectedOwners.join(", ")}; received ${actualOwners.join(", ")}.`,
    );
  return proof;
}

function ownerFromValue(value: string): TestOwnerId {
  if (!(TEST_OWNER_IDS as readonly string[]).includes(value))
    throw new Error(
      `Unknown test partition owner ${value}; expected one of ${TEST_OWNER_IDS.join(", ")}.`,
    );
  return value as TestOwnerId;
}

interface VitestExecution {
  readonly source: string;
  readonly configPath: string;
  readonly selectedFiles: readonly string[];
  readonly rawReportPath: string;
  readonly normalized: NormalizedVitestReport;
}

async function runVitestAssignments(input: {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly artifactPrefix: string;
  readonly sourcePrefix: string;
  readonly assignments: readonly PartitionConfigAssignment[];
  readonly measurement?: TestRunMeasurementSession;
}): Promise<readonly VitestExecution[]> {
  const executions: VitestExecution[] = [];
  await mkdir(resolve(input.artifactDirectory, "logs"), { recursive: true });
  for (const [index, assignment] of input.assignments.entries()) {
    const ordinal = String(index + 1).padStart(2, "0");
    const source = `${input.sourcePrefix}:${assignment.configPath}`;
    const reportName = `${input.artifactPrefix}-vitest-report-${ordinal}.json`;
    const reportPath = resolve(input.artifactDirectory, reportName);
    const rootDirectory = configDirectory(assignment.configPath);
    const invocationFiles = assignment.files.map((file) =>
      rootDirectory.length === 0
        ? file
        : file.slice(`${rootDirectory}/`.length),
    );
    const command = await runCommand(
      {
        id: `${safeName(input.artifactPrefix)}-vitest-${ordinal}`,
        executable: "pnpm",
        args: [
          "exec",
          "vitest",
          "run",
          "--root",
          rootDirectory.length === 0 ? "." : rootDirectory,
          "--config",
          basename(assignment.configPath),
          ...invocationFiles,
          "--fileParallelism=false",
          "--reporter=json",
          `--outputFile=${reportPath}`,
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: input.repositoryRoot,
        artifactDirectory: resolve(input.artifactDirectory, "logs"),
        timeoutMs: COMMAND_TIMEOUT_MS,
        trustedControllerCommand: true,
        ...(input.measurement
          ? {
              extraEnvironment: input.measurement.probeEnvironment,
              processStartupObserver: (nanoseconds: bigint) =>
                input.measurement?.observeProcessStartup(nanoseconds),
            }
          : {}),
      },
    );
    if (command.status !== "PASS")
      throw new AggregateChildFailure(
        command.id,
        command.exitCode,
        `${command.message} Logs: ${command.stdoutPath}, ${command.stderrPath}.`,
      );
    const normalized = normalizeVitestReport(
      input.repositoryRoot,
      source,
      JSON.parse(await readFile(reportPath, "utf8")) as unknown,
    );
    if (!sameStrings(normalized.files, assignment.files))
      throw new Error(
        `${source} executed [${normalized.files.join(", ")}] instead of selected [${assignment.files.join(", ")}].`,
      );
    executions.push({
      source,
      configPath: assignment.configPath,
      selectedFiles: assignment.files,
      rawReportPath: reportPath,
      normalized,
    });
  }
  return executions;
}

function candidateFromIdentity(identity: Record<string, unknown>): {
  readonly gitCommit: string | null;
  readonly gitTree: string | null;
  readonly workingTreeDirty: boolean;
  readonly nodeVersion: string | null;
  readonly pnpmVersion: string | null;
} {
  return {
    gitCommit:
      typeof identity["gitCommit"] === "string" ? identity["gitCommit"] : null,
    gitTree:
      typeof identity["gitTree"] === "string" ? identity["gitTree"] : null,
    workingTreeDirty: identity["gitStatus"] !== "",
    nodeVersion:
      typeof identity["nodeVersion"] === "string"
        ? identity["nodeVersion"]
        : null,
    pnpmVersion:
      typeof identity["pnpmVersion"] === "string"
        ? identity["pnpmVersion"]
        : null,
  };
}

function sameCandidate(
  left: ReturnType<typeof candidateFromIdentity>,
  right: ReturnType<typeof candidateFromIdentity>,
): boolean {
  return (
    left.gitCommit === right.gitCommit &&
    left.gitTree === right.gitTree &&
    left.workingTreeDirty === right.workingTreeDirty &&
    left.nodeVersion === right.nodeVersion &&
    left.pnpmVersion === right.pnpmVersion
  );
}

function requiredMeasurementIdentity(
  value: ReturnType<typeof candidateFromIdentity>,
): TestRunCommandIdentity {
  if (
    !value.gitCommit ||
    !/^[a-f0-9]{40}$/u.test(value.gitCommit) ||
    !value.gitTree ||
    !/^[a-f0-9]{40}$/u.test(value.gitTree) ||
    !value.nodeVersion ||
    !value.pnpmVersion
  )
    throw new Error(
      "Test-run measurement requires exact Git, Node, and pnpm identity.",
    );
  return {
    gitCommit: value.gitCommit,
    gitTree: value.gitTree,
    workingTreeDirty: value.workingTreeDirty,
    nodeVersion: value.nodeVersion,
    pnpmVersion: value.pnpmVersion,
  };
}

function measurementCandidate(
  value: ReturnType<typeof candidateFromIdentity>,
): TestRunCandidate {
  const identity = requiredMeasurementIdentity(value);
  return {
    gitCommit: identity.gitCommit,
    gitTree: identity.gitTree,
    workingTreeDirty: identity.workingTreeDirty,
  };
}

async function failureManifest(
  context: Awaited<ReturnType<typeof evidenceContext>>,
  fileName: string,
  kind: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const path = resolve(context.artifactDirectory, fileName);
  if (!existsSync(path))
    await writeJson(path, {
      schemaVersion: "1.0.0",
      status: "FAIL",
      message,
    });
  const declaration = await artifactDeclaration(
    context.artifactDirectory,
    path,
    kind,
  );
  await writeManualEvidenceFailure(context, {
    kind: error instanceof AggregateChildFailure ? "product" : "infrastructure",
    message,
    artifacts: [declaration],
  });
}

export async function runOwnedPartitionCli(
  ownerValue: string,
): Promise<number> {
  const owner = ownerFromValue(ownerValue);
  const context = await evidenceContext(
    PARTITION_STAGE_ID,
    `test:partition:${owner}`,
  );
  const reportName = "test-partition-report.json";
  try {
    const initialCandidate = candidateFromIdentity(
      (await commandIdentity(context.repositoryRoot)) as Record<
        string,
        unknown
      >,
    );
    const measurement = await beginTestRunMeasurement({
      artifactDirectory: context.artifactDirectory,
      runId:
        process.env["LOOP_VERIFY_RUN_ID"] ?? context.manualEvidence.manifestId,
      stageId: context.stageId,
      commandId: context.commandId,
      role: "partition",
      owner,
      identity: requiredMeasurementIdentity(initialCandidate),
    });
    const ownership = await evaluateRepositoryTestOwnership({
      repositoryRoot: context.repositoryRoot,
      artifactDirectory: resolve(context.artifactDirectory, "discovery-logs"),
    });
    requirePassingOwnership(ownership);
    const membership = canonicalMembershipProof(ownership);
    const selected = membership.partitions.find(
      (partition) => partition.owner === owner,
    );
    if (!selected)
      throw new Error(`Validated ownership has no ${owner} partition.`);
    const assignments = assignFilesToDiscoveredConfigs(
      ownership,
      selected.files,
    );
    measurement.markSetupFinished();
    const executions = await runVitestAssignments({
      repositoryRoot: context.repositoryRoot,
      artifactDirectory: context.artifactDirectory,
      artifactPrefix: safeName(owner),
      sourcePrefix: `partition:${owner}`,
      assignments,
      measurement,
    });
    const executedFiles = sortedUnique(
      executions.flatMap((execution) => execution.normalized.files),
    );
    if (!sameStrings(executedFiles, selected.files))
      throw new Error(
        `${owner} executed file inventory differs from its canonical membership.`,
      );
    const observations = executions.flatMap(
      (execution) => execution.normalized.observations,
    );
    const candidate = candidateFromIdentity(
      (await commandIdentity(context.repositoryRoot)) as Record<
        string,
        unknown
      >,
    );
    if (!sameCandidate(initialCandidate, candidate))
      throw new Error(
        "Partition candidate commit, tree, cleanliness, or runtime changed during execution.",
      );
    await measurement.finish(
      await Promise.all(
        executions.map((execution) =>
          describeVitestReport({
            artifactDirectory: context.artifactDirectory,
            reportPath: execution.rawReportPath,
          }),
        ),
      ),
    );
    await writeJson(resolve(context.artifactDirectory, reportName), {
      schemaVersion: TEST_PARTITION_REPORT_SCHEMA_VERSION,
      status: "PASS",
      candidate,
      ownershipDeclaration: ownership.catalogue,
      discoveredUniverse: membership.universe,
      owner,
      fileCount: selected.fileCount,
      membershipSha256: selected.sha256,
      files: selected.files,
      configAssignments: assignments,
      execution: {
        fileCount: executedFiles.length,
        testCount: observations.length,
        semanticSha256: semanticInventorySha256(observations),
        reports: executions.map((execution) => ({
          configPath: execution.configPath,
          path: relative(
            context.artifactDirectory,
            execution.rawReportPath,
          ).replaceAll("\\", "/"),
          fileCount: execution.normalized.counts.files,
          testCount: execution.normalized.counts.tests,
          passed: execution.normalized.counts.passed,
          failed: execution.normalized.counts.failed,
          skipped: execution.normalized.counts.skipped,
          semanticSha256: execution.normalized.semanticSha256,
        })),
      },
    });
    await writeReceipt(
      context,
      [
        {
          id: "canonical-owner-selection",
          summary: `${owner} selected its ${selected.fileCount} normalized files directly from ownership declaration ${ownership.catalogue.id ?? "(missing id)"}.`,
        },
        {
          id: "partition-executed-once",
          summary: `${owner} executed ${executedFiles.length} files and ${observations.length} tests through ${assignments.length} independently discovered Vitest config assignment(s).`,
        },
      ],
      [
        { path: reportName, kind: PARTITION_REPORT_KIND },
        ...executions.map((execution) => ({
          path: relative(
            context.artifactDirectory,
            execution.rawReportPath,
          ).replaceAll("\\", "/"),
          kind: PARTITION_RAW_KIND,
        })),
        { path: TEST_RUN_SUMMARY_NAME, kind: TEST_RUN_SUMMARY_KIND },
      ],
    );
    process.stdout.write(
      `${owner} partition passed ${observations.length} tests across ${selected.fileCount} files.\n`,
    );
    return 0;
  } catch (error) {
    await failureManifest(context, reportName, PARTITION_REPORT_KIND, error);
    process.stderr.write(
      `Test partition ${owner} failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return error instanceof AggregateChildFailure ? error.exitCode : 1;
  }
}

interface EvidenceChildDefinition extends AggregateChildDefinition {
  readonly script: string;
  readonly stageId: string;
  readonly commandId: string;
  readonly directory: string;
  readonly requiredKinds: readonly string[];
  readonly rawKinds: readonly string[];
  readonly summaryRole: Exclude<TestRunRole, "legacy-extra">;
  readonly summaryOwner: string | null;
}

interface EvidenceChildResult extends AggregateChildResult {
  readonly definition: EvidenceChildDefinition;
  readonly directory: string;
  readonly receipt: ValidatedCommandReceipt | null;
}

function childRunId(definition: EvidenceChildDefinition): string {
  return `wp6-shadow-${safeName(definition.id)}`;
}

function childSummaryExpectation(
  definition: EvidenceChildDefinition,
  candidate: TestRunCandidate,
): TestRunSummaryExpectation {
  return {
    runId: childRunId(definition),
    stageId: definition.stageId,
    commandId: definition.commandId,
    role: definition.summaryRole,
    owner: definition.summaryOwner,
    candidate,
  };
}

async function runEvidenceChild(input: {
  readonly repositoryRoot: string;
  readonly aggregateArtifactDirectory: string;
  readonly definition: EvidenceChildDefinition;
}): Promise<EvidenceChildResult> {
  const definition = input.definition;
  const directory = resolve(
    input.aggregateArtifactDirectory,
    definition.directory,
  );
  const runtimeDirectory = resolve(
    input.aggregateArtifactDirectory,
    "runtime",
    safeName(definition.id),
  );
  await mkdir(directory, { recursive: true });
  await mkdir(runtimeDirectory, { recursive: true });
  const command = await runCommand(
    {
      id: definition.id,
      executable: "pnpm",
      args: [definition.script],
      parser: "exit-code",
    },
    {
      workingDirectory: input.repositoryRoot,
      artifactDirectory: resolve(
        input.aggregateArtifactDirectory,
        "child-logs",
      ),
      timeoutMs: AGGREGATE_CHILD_TIMEOUT_MS,
      trustedControllerCommand: true,
      extraEnvironment: {
        LOOP_VERIFY_STAGE_ID: definition.stageId,
        LOOP_VERIFY_COMMAND_ID: definition.commandId,
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: directory,
        LOOP_VERIFY_RUN_ID: childRunId(definition),
        LOOP_TELEMETRY_PARENT_MANAGED: "1",
        MILESTONE_LOOP_TELEMETRY_RUN_ID: childRunId(definition),
        TEMP: runtimeDirectory,
        TMP: runtimeDirectory,
      },
    },
  );
  if (command.status !== "PASS")
    return {
      status: command.status,
      exitCode: command.exitCode,
      message: `${command.message} Logs: ${command.stdoutPath}, ${command.stderrPath}.`,
      definition,
      directory,
      receipt: null,
    };
  try {
    const receipt = await validateCommandReceiptDirectory({
      directory,
      expectedStageId: definition.stageId,
      expectedCommandId: definition.commandId,
      requiredKinds: definition.requiredKinds,
    });
    return {
      status: "PASS",
      exitCode: 0,
      message: `${definition.script} passed with a validated command-owned receipt.`,
      definition,
      directory,
      receipt,
    };
  } catch (error) {
    return {
      status: "ERROR",
      exitCode: 1,
      message: error instanceof Error ? error.message : String(error),
      definition,
      directory,
      receipt: null,
    };
  }
}

function requiredReceipt(result: EvidenceChildResult): ValidatedCommandReceipt {
  if (!result.receipt)
    throw new Error(`${result.definition.id} has no validated receipt.`);
  return result.receipt;
}

async function validatedChildSummary(
  result: EvidenceChildResult,
  candidate: TestRunCandidate,
): Promise<ValidatedTestRunSummarySource> {
  return loadValidatedTestRunSummary({
    receipt: requiredReceipt(result),
    expected: childSummaryExpectation(result.definition, candidate),
  });
}

async function normalizedChildRawReports(
  repositoryRoot: string,
  result: EvidenceChildResult,
): Promise<readonly NormalizedVitestReport[]> {
  const receipt = requiredReceipt(result);
  const rawArtifacts = receipt.artifacts.filter((artifact) =>
    result.definition.rawKinds.includes(artifact.kind),
  );
  if (rawArtifacts.length === 0)
    throw new Error(
      `${result.definition.id} has no declared raw Vitest report.`,
    );
  const reports: NormalizedVitestReport[] = [];
  for (const [index, artifact] of rawArtifacts.entries())
    reports.push(
      normalizeVitestReport(
        repositoryRoot,
        `${result.definition.id}:${String(index + 1).padStart(2, "0")}`,
        JSON.parse(await readFile(artifact.path, "utf8")) as unknown,
      ),
    );
  return reports;
}

function receiptProof(
  aggregateArtifactDirectory: string,
  result: EvidenceChildResult,
): {
  readonly id: string;
  readonly script: string;
  readonly receiptPath: string;
  readonly receiptSha256: string;
  readonly receiptBytes: number;
  readonly artifactCount: number;
  readonly artifactBytes: number;
  readonly artifactKinds: readonly string[];
} {
  const receipt = requiredReceipt(result);
  return {
    id: result.definition.id,
    script: result.definition.script,
    receiptPath: relative(
      aggregateArtifactDirectory,
      receipt.receiptPath,
    ).replaceAll("\\", "/"),
    receiptSha256: receipt.receiptSha256,
    receiptBytes: receipt.receiptBytes,
    artifactCount: receipt.artifactCount,
    artifactBytes: receipt.artifactBytes,
    artifactKinds: [...receipt.kinds].sort(compareStrings),
  };
}

async function assertPartitionChildReport(input: {
  readonly result: EvidenceChildResult;
  readonly owner: string;
  readonly expectedFiles: readonly string[];
}): Promise<void> {
  const receipt = requiredReceipt(input.result);
  const reports = receipt.artifacts.filter(
    (artifact) => artifact.kind === PARTITION_REPORT_KIND,
  );
  if (reports.length !== 1)
    throw new Error(
      `${input.result.definition.id} must own exactly one ${PARTITION_REPORT_KIND}.`,
    );
  const value = JSON.parse(await readFile(reports[0]!.path, "utf8")) as unknown;
  if (
    !isRecord(value) ||
    value["schemaVersion"] !== TEST_PARTITION_REPORT_SCHEMA_VERSION ||
    value["status"] !== "PASS" ||
    value["owner"] !== input.owner ||
    !Array.isArray(value["files"]) ||
    value["files"].some((file) => typeof file !== "string") ||
    !sameStrings(value["files"] as string[], input.expectedFiles)
  )
    throw new Error(
      `${input.result.definition.id} selection report does not match canonical ${input.owner} membership.`,
    );
}

function rawReportProof(
  aggregateArtifactDirectory: string,
  execution: VitestExecution,
): {
  readonly source: string;
  readonly configPath: string;
  readonly path: string;
  readonly selectedFileCount: number;
  readonly executedFileCount: number;
  readonly testCount: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly semanticSha256: string;
} {
  return {
    source: execution.source,
    configPath: execution.configPath,
    path: relative(
      aggregateArtifactDirectory,
      execution.rawReportPath,
    ).replaceAll("\\", "/"),
    selectedFileCount: execution.selectedFiles.length,
    executedFileCount: execution.normalized.counts.files,
    testCount: execution.normalized.counts.tests,
    passed: execution.normalized.counts.passed,
    failed: execution.normalized.counts.failed,
    skipped: execution.normalized.counts.skipped,
    semanticSha256: execution.normalized.semanticSha256,
  };
}

function assertPinnedCleanCandidate(
  candidate: ReturnType<typeof candidateFromIdentity>,
): void {
  if (
    !candidate.gitCommit ||
    !/^[a-f0-9]{40}$/u.test(candidate.gitCommit) ||
    !candidate.gitTree ||
    !/^[a-f0-9]{40}$/u.test(candidate.gitTree) ||
    candidate.workingTreeDirty
  )
    throw new Error(
      "Shadow equivalence requires one clean immutable Git candidate commit.",
    );
  if (
    candidate.nodeVersion !== "v24.18.0" ||
    candidate.pnpmVersion !== "11.15.1"
  )
    throw new Error(
      `Shadow equivalence requires Node v24.18.0 and pnpm 11.15.1; received ${candidate.nodeVersion ?? "unknown"} and ${candidate.pnpmVersion ?? "unknown"}.`,
    );
}

const LEGACY_CHILDREN: readonly Omit<EvidenceChildDefinition, "directory">[] = [
  {
    id: "legacy-fast",
    script: "test:unit:fast",
    stageId: "candidate-unit",
    commandId: "test:unit:fast",
    requiredKinds: [
      "fast-unit-vitest-report",
      "unit-partition-report",
      TEST_RUN_SUMMARY_KIND,
    ],
    rawKinds: ["fast-unit-vitest-report"],
    summaryRole: "legacy",
    summaryOwner: null,
  },
  {
    id: "legacy-migration",
    script: "test:unit:migrations",
    stageId: "migration-unit",
    commandId: "test:unit:migrations",
    requiredKinds: [
      "migration-unit-vitest-report",
      "unit-partition-report",
      TEST_RUN_SUMMARY_KIND,
    ],
    rawKinds: ["migration-unit-vitest-report"],
    summaryRole: "legacy",
    summaryOwner: null,
  },
  {
    id: "legacy-orchestrator",
    script: "test:orchestrator",
    stageId: "verification-tier-milestone",
    commandId: "test-orchestrator",
    requiredKinds: ["orchestrator-vitest-report", TEST_RUN_SUMMARY_KIND],
    rawKinds: ["orchestrator-vitest-report"],
    summaryRole: "legacy",
    summaryOwner: null,
  },
];

export async function runPartitionShadowCli(): Promise<number> {
  const context = await evidenceContext(SHADOW_STAGE_ID, SHADOW_COMMAND_ID);
  const proofName = "test-partition-shadow-proof.json";
  const proofPath = resolve(context.artifactDirectory, proofName);
  try {
    const initialCandidate = candidateFromIdentity(
      (await commandIdentity(context.repositoryRoot)) as Record<
        string,
        unknown
      >,
    );
    assertPinnedCleanCandidate(initialCandidate);
    const exactMeasurementCandidate = measurementCandidate(initialCandidate);
    const ownership = await evaluateRepositoryTestOwnership({
      repositoryRoot: context.repositoryRoot,
      artifactDirectory: resolve(context.artifactDirectory, "discovery-logs"),
    });
    requirePassingOwnership(ownership);
    const membership = canonicalMembershipProof(ownership);

    const legacyDefinitions: EvidenceChildDefinition[] = LEGACY_CHILDREN.map(
      (definition) => ({
        ...definition,
        directory: `legacy/${definition.id}`,
      }),
    );
    const legacyChildren = await executeAggregateChildren(
      legacyDefinitions,
      async (definition) =>
        runEvidenceChild({
          repositoryRoot: context.repositoryRoot,
          aggregateArtifactDirectory: context.artifactDirectory,
          definition,
        }),
    );
    const legacyReports = (
      await Promise.all(
        legacyChildren.map((child) =>
          normalizedChildRawReports(context.repositoryRoot, child),
        ),
      )
    ).flat();

    const candidateFiles = sortedUnique(
      ownership.entryPoints.candidatePartitionFiles,
    );
    const candidateFileSet = new Set(candidateFiles);
    const extraLegacyFiles = membership.universe.files.filter(
      (file) => !candidateFileSet.has(file),
    );
    const extraArtifactDirectory = resolve(
      context.artifactDirectory,
      "legacy",
      "extra",
    );
    const extraExpectation: TestRunSummaryExpectation | null =
      extraLegacyFiles.length > 0
        ? {
            runId: "wp6-shadow-legacy-extra",
            stageId: SHADOW_STAGE_ID,
            commandId: "test:partitions:shadow:legacy-extra",
            role: "legacy-extra",
            owner: null,
            candidate: exactMeasurementCandidate,
          }
        : null;
    const extraMeasurement = extraExpectation
      ? await beginTestRunMeasurement({
          artifactDirectory: extraArtifactDirectory,
          runId: extraExpectation.runId,
          stageId: extraExpectation.stageId,
          commandId: extraExpectation.commandId,
          role: extraExpectation.role,
          owner: extraExpectation.owner,
          identity: requiredMeasurementIdentity(initialCandidate),
        })
      : null;
    const extraLegacyAssignments = assignFilesToDiscoveredConfigs(
      ownership,
      extraLegacyFiles,
    );
    extraMeasurement?.markSetupFinished();
    const extraLegacyExecutions = await runVitestAssignments({
      repositoryRoot: context.repositoryRoot,
      artifactDirectory: extraArtifactDirectory,
      artifactPrefix: "legacy-extra",
      sourcePrefix: "legacy-extra",
      assignments: extraLegacyAssignments,
      ...(extraMeasurement ? { measurement: extraMeasurement } : {}),
    });
    let extraSummarySource: ValidatedTestRunSummarySource | null = null;
    if (extraMeasurement && extraExpectation) {
      const finished = await extraMeasurement.finish(
        await Promise.all(
          extraLegacyExecutions.map((execution) =>
            describeVitestReport({
              artifactDirectory: extraArtifactDirectory,
              reportPath: execution.rawReportPath,
            }),
          ),
        ),
      );
      const declaration = await artifactDeclaration(
        extraArtifactDirectory,
        finished.path,
        TEST_RUN_SUMMARY_KIND,
      );
      extraSummarySource = {
        path: finished.path,
        bytes: declaration.bytes,
        sha256: declaration.sha256,
        summary: finished.summary,
      };
    }
    const allLegacyReports = [
      ...legacyReports,
      ...extraLegacyExecutions.map((execution) => execution.normalized),
    ];
    const legacyFiles = sortedUnique(
      allLegacyReports.flatMap((report) => report.files),
    );
    if (!sameStrings(legacyFiles, membership.universe.files))
      throw new Error(
        "Deduplicated legacy execution does not cover the complete discovered universe.",
      );

    const partitionDefinitions: EvidenceChildDefinition[] =
      membership.partitions.map((partition) => ({
        id: `partition-${partition.owner}`,
        script: `test:partition:${partition.owner}`,
        stageId: PARTITION_STAGE_ID,
        commandId: `test:partition:${partition.owner}`,
        directory: `partitions/${partition.owner}`,
        requiredKinds: [
          PARTITION_REPORT_KIND,
          PARTITION_RAW_KIND,
          TEST_RUN_SUMMARY_KIND,
        ],
        rawKinds: [PARTITION_RAW_KIND],
        summaryRole: "partition",
        summaryOwner: partition.owner,
      }));
    const partitionChildren = await executeAggregateChildren(
      partitionDefinitions,
      async (definition) =>
        runEvidenceChild({
          repositoryRoot: context.repositoryRoot,
          aggregateArtifactDirectory: context.artifactDirectory,
          definition,
        }),
    );
    for (const child of partitionChildren) {
      const owner = child.definition.commandId.replace(/^test:partition:/u, "");
      const expected = membership.partitions.find(
        (partition) => partition.owner === owner,
      );
      if (!expected)
        throw new Error(`Unexpected partition child owner ${owner}.`);
      await assertPartitionChildReport({
        result: child,
        owner,
        expectedFiles: expected.files,
      });
    }
    const partitionReports = (
      await Promise.all(
        partitionChildren.map((child) =>
          normalizedChildRawReports(context.repositoryRoot, child),
        ),
      )
    ).flat();
    const partitionFiles = sortedUnique(
      partitionReports.flatMap((report) => report.files),
    );
    if (!sameStrings(partitionFiles, membership.universe.files))
      throw new Error(
        "Executed partition file union does not equal the discovered universe.",
      );

    const semanticComparison = compareShadowSemantics(
      allLegacyReports.flatMap((report) => report.observations),
      partitionReports.flatMap((report) => report.observations),
    );
    const finalCandidate = candidateFromIdentity(
      (await commandIdentity(context.repositoryRoot)) as Record<
        string,
        unknown
      >,
    );
    assertPinnedCleanCandidate(finalCandidate);
    if (!sameCandidate(initialCandidate, finalCandidate))
      throw new Error(
        "Candidate commit, tree, cleanliness, or runtime changed during shadow execution.",
      );

    const allChildResults = [...legacyChildren, ...partitionChildren];
    const childSummarySources = await Promise.all(
      allChildResults.map((child) =>
        validatedChildSummary(child, exactMeasurementCandidate),
      ),
    );
    const summarySources = [
      ...childSummarySources,
      ...(extraSummarySource ? [extraSummarySource] : []),
    ];
    const summaryExpectations = [
      ...allChildResults.map((child) =>
        childSummaryExpectation(child.definition, exactMeasurementCandidate),
      ),
      ...(extraExpectation ? [extraExpectation] : []),
    ];
    const reduction = reduceTestRunSummaries({
      sources: summarySources,
      expected: summaryExpectations,
      candidate: exactMeasurementCandidate,
      relativePath: (path) =>
        relative(context.artifactDirectory, path).replaceAll("\\", "/"),
    });
    const reductionPath = resolve(
      context.artifactDirectory,
      TEST_RUN_REDUCTION_NAME,
    );
    await writeTestRunReduction(reductionPath, reduction);
    const reductionDeclaration = await artifactDeclaration(
      context.artifactDirectory,
      reductionPath,
      TEST_RUN_REDUCTION_KIND,
    );

    const status = semanticComparison.status;
    await writeJson(proofPath, {
      schemaVersion: TEST_PARTITION_SHADOW_SCHEMA_VERSION,
      status,
      candidate: initialCandidate,
      ownershipDeclaration: ownership.catalogue,
      discoveredUniverse: membership.universe,
      partitions: membership.partitions,
      pairwiseIntersections: membership.pairwiseIntersections,
      union: membership.union,
      execution: {
        legacy: {
          childReceipts: legacyChildren.map((child) =>
            receiptProof(context.artifactDirectory, child),
          ),
          extraReports: extraLegacyExecutions.map((execution) =>
            rawReportProof(context.artifactDirectory, execution),
          ),
          fileCount: legacyFiles.length,
          filesSha256: inventorySha256(legacyFiles),
        },
        partitions: {
          childReceipts: partitionChildren.map((child) =>
            receiptProof(context.artifactDirectory, child),
          ),
          fileCount: partitionFiles.length,
          filesSha256: inventorySha256(partitionFiles),
        },
      },
      measurementReduction: {
        path: reductionDeclaration.path,
        bytes: reductionDeclaration.bytes,
        sha256: reductionDeclaration.sha256,
        contentSha256: reduction.contentSha256,
        inputCount: reduction.inputCount,
        nonSemantic: reduction.nonSemantic,
      },
      shadowComparison: semanticComparison,
    });
    if (status !== "PASS")
      throw new Error(
        `Shadow semantic equivalence failed: missing=${semanticComparison.missingTests.length}, unexpected=${semanticComparison.unexpectedTests.length}, multiplySelected=${semanticComparison.multiplySelectedTests.length}, mismatched=${semanticComparison.outcomeMismatches.length}, legacyConflicts=${semanticComparison.legacyConflicts.length}.`,
      );

    const legacyRawPaths = [
      ...legacyChildren.flatMap((child) =>
        requiredReceipt(child)
          .artifacts.filter((artifact) =>
            child.definition.rawKinds.includes(artifact.kind),
          )
          .map((artifact) => artifact.path),
      ),
      ...extraLegacyExecutions.map((execution) => execution.rawReportPath),
    ];
    await writeReceipt(
      context,
      [
        {
          id: "partition-membership-disjoint-and-complete",
          summary: `${membership.partitions.length} executable owner partitions form an exact ${membership.universe.fileCount}-file union with ${membership.pairwiseIntersections.length} empty pairwise intersections.`,
        },
        {
          id: "child-receipts-validated",
          summary: `Validated ${allChildResults.length} genuine legacy/partition child receipts and their declared raw reports.`,
        },
        {
          id: "same-commit-shadow-equivalence",
          summary: `Deduplicated ${semanticComparison.legacy.observationCount} legacy observations to ${semanticComparison.legacy.uniqueTestCount} stable tests and matched every normalized partition outcome on commit ${initialCandidate.gitCommit}.`,
        },
        {
          id: "compact-measurement-summaries-reduced",
          summary: `Validated and deterministically reduced ${reduction.inputCount} command-owned compact summaries without changing test success or authorizing cutover.`,
        },
      ],
      [
        { path: proofName, kind: SHADOW_PROOF_KIND },
        {
          path: TEST_RUN_REDUCTION_NAME,
          kind: TEST_RUN_REDUCTION_KIND,
        },
        ...(extraSummarySource
          ? [
              {
                path: relative(
                  context.artifactDirectory,
                  extraSummarySource.path,
                ).replaceAll("\\", "/"),
                kind: TEST_RUN_SUMMARY_KIND,
              },
            ]
          : []),
        ...allChildResults.map((child) => ({
          path: relative(
            context.artifactDirectory,
            requiredReceipt(child).receiptPath,
          ).replaceAll("\\", "/"),
          kind: CHILD_RECEIPT_KIND,
        })),
        ...legacyRawPaths.map((path) => ({
          path: relative(context.artifactDirectory, path).replaceAll("\\", "/"),
          kind: LEGACY_RAW_KIND,
        })),
      ],
    );
    process.stdout.write(
      `WP6 shadow equivalence passed ${semanticComparison.partitions.uniqueTestCount} unique tests across ${membership.universe.fileCount} disjoint files.\n`,
    );
    return 0;
  } catch (error) {
    await failureManifest(context, proofName, SHADOW_PROOF_KIND, error);
    process.stderr.write(
      `WP6 partition shadow failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return error instanceof AggregateChildFailure ? error.exitCode : 1;
  }
}

export async function runPartitionOmissionMutationCli(): Promise<number> {
  const context = await evidenceContext(
    "wp6-shadow-omission-mutation",
    "test:partitions:shadow:omission-mutation",
  );
  const proofName = "test-partition-omission-mutation-proof.json";
  const proofPath = resolve(context.artifactDirectory, proofName);
  try {
    if (process.env["MILESTONE_LOOP_TEST_OMISSION_MUTATION"] !== "1")
      throw new Error(
        "The omission-mutation command is a test-only fail-closed integration surface.",
      );
    const fixtureDirectory = resolve(
      context.artifactDirectory,
      "omission-fixture",
    );
    await mkdir(fixtureDirectory, { recursive: true });
    const configPath = resolve(fixtureDirectory, "vitest.config.mjs");
    const testPath = resolve(fixtureDirectory, "representative.test.js");
    await writeFile(
      configPath,
      [
        "export default {",
        "  test: {",
        '    environment: "node",',
        "    globals: true,",
        '    include: ["representative.test.js"],',
        "    passWithNoTests: false,",
        "  },",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      testPath,
      [
        'describe("omission integration fixture", () => {',
        '  it("representative kept", () => expect(true).toBe(true));',
        '  it("representative omitted by mutation", () => expect(true).toBe(true));',
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const legacyReportPath = resolve(
      context.artifactDirectory,
      "legacy-vitest-report.json",
    );
    const command = await runCommand(
      {
        id: "omission-mutation-vitest",
        executable: "pnpm",
        args: [
          "exec",
          "vitest",
          "run",
          "--root",
          fixtureDirectory,
          "--config",
          "vitest.config.mjs",
          "representative.test.js",
          "--fileParallelism=false",
          "--reporter=json",
          `--outputFile=${legacyReportPath}`,
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: context.repositoryRoot,
        artifactDirectory: resolve(context.artifactDirectory, "logs"),
        timeoutMs: 60_000,
        trustedControllerCommand: true,
      },
    );
    if (command.status !== "PASS")
      throw new AggregateChildFailure(
        command.id,
        command.exitCode,
        `${command.message} Logs: ${command.stdoutPath}, ${command.stderrPath}.`,
      );
    const legacyValue = JSON.parse(
      await readFile(legacyReportPath, "utf8"),
    ) as Record<string, unknown>;
    const legacy = normalizeVitestReport(
      fixtureDirectory,
      "omission-mutation:legacy",
      legacyValue,
    );
    const mutatedValue = structuredClone(legacyValue);
    const results = mutatedValue["testResults"];
    if (!Array.isArray(results) || !isRecord(results[0]))
      throw new Error("Omission fixture report has no mutable test result.");
    const assertions = results[0]["assertionResults"];
    if (!Array.isArray(assertions))
      throw new Error("Omission fixture report has no assertion surface.");
    const omittedIndex = assertions.findIndex(
      (assertion) =>
        isRecord(assertion) &&
        typeof assertion["fullName"] === "string" &&
        assertion["fullName"].includes("representative omitted by mutation"),
    );
    if (omittedIndex < 0)
      throw new Error("Representative omission identity was not executed.");
    const omittedAssertion = assertions[omittedIndex];
    assertions.splice(omittedIndex, 1);
    for (const key of ["numTotalTests", "numPassedTests"] as const) {
      const value = mutatedValue[key];
      if (!Number.isSafeInteger(value) || Number(value) < 1)
        throw new Error(`Omission fixture ${key} cannot be decremented.`);
      mutatedValue[key] = Number(value) - 1;
    }
    const partitionReportPath = resolve(
      context.artifactDirectory,
      "partition-omitted-vitest-report.json",
    );
    await writeJson(partitionReportPath, mutatedValue);
    const partition = normalizeVitestReport(
      fixtureDirectory,
      "omission-mutation:partition",
      mutatedValue,
    );
    const comparison = compareShadowSemantics(
      legacy.observations,
      partition.observations,
    );
    const omittedTestId = isRecord(omittedAssertion)
      ? legacy.observations.find(
          (observation) =>
            observation.identity === omittedAssertion["fullName"],
        )?.testId
      : undefined;
    if (
      !omittedTestId ||
      comparison.status !== "FAIL" ||
      !sameStrings(comparison.missingTests, [omittedTestId]) ||
      comparison.unexpectedTests.length !== 0
    )
      throw new Error(
        "Integration omission mutation did not produce exactly one missing semantic identity.",
      );
    await writeJson(proofPath, {
      schemaVersion: "1.0.0",
      status: "FAIL",
      expectedFailure: "missing-semantic-test-identity",
      mutation: {
        kind: "remove-executed-assertion-from-partition-report",
        omittedTestId,
        legacyTestCount: legacy.counts.tests,
        partitionTestCount: partition.counts.tests,
      },
      reports: {
        legacy: rawReportProof(context.artifactDirectory, {
          source: legacy.source,
          configPath: relative(
            context.artifactDirectory,
            configPath,
          ).replaceAll("\\", "/"),
          selectedFiles: legacy.files,
          rawReportPath: legacyReportPath,
          normalized: legacy,
        }),
        partition: rawReportProof(context.artifactDirectory, {
          source: partition.source,
          configPath: relative(
            context.artifactDirectory,
            configPath,
          ).replaceAll("\\", "/"),
          selectedFiles: partition.files,
          rawReportPath: partitionReportPath,
          normalized: partition,
        }),
      },
      shadowComparison: comparison,
    });
    const artifactInputs = [
      [proofPath, OMISSION_MUTATION_PROOF_KIND],
      [legacyReportPath, LEGACY_RAW_KIND],
      [partitionReportPath, PARTITION_RAW_KIND],
      [configPath, "test-partition-omission-fixture-config"],
      [testPath, "test-partition-omission-fixture-source"],
    ] as const;
    const artifacts = await Promise.all(
      artifactInputs.map(([path, kind]) =>
        artifactDeclaration(context.artifactDirectory, path, kind),
      ),
    );
    await writeManualEvidenceFailure(context, {
      status: "FAIL",
      kind: "product",
      message: `Expected omission mutation removed ${omittedTestId}; the aggregate rejected the missing semantic identity and issued no PASS receipt.`,
      artifacts,
    });
    process.stderr.write(
      `WP6 omission mutation failed closed on missing semantic identity ${omittedTestId}.\n`,
    );
    return 1;
  } catch (error) {
    await failureManifest(
      context,
      proofName,
      OMISSION_MUTATION_PROOF_KIND,
      error,
    );
    process.stderr.write(
      `WP6 omission mutation fixture failed unexpectedly: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
