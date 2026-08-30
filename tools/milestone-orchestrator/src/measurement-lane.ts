import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { commandIdentity } from "../../evidence.mjs";
import { runCommand } from "./command-runner.js";
import type { CommandExecutionSummary } from "./contracts.js";
import { TEST_OWNER_IDS } from "./test-ownership.js";
import {
  assertTestRunReduction,
  loadValidatedTestRunSummary,
  reduceTestRunSummaries,
  TEST_RUN_REDUCTION_KIND,
  TEST_RUN_REDUCTION_NAME,
  TEST_RUN_SUMMARY_KIND,
  writeTestRunReduction,
  type TestRunCandidate,
  type TestRunCommandIdentity,
  type TestRunRole,
  type TestRunSummary,
  type TestRunSummaryExpectation,
  type ValidatedTestRunSummarySource,
} from "./test-run-summary.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

export const MEASUREMENT_LANE_SCHEMA_VERSION = "1.0.0" as const;
export const MEASUREMENT_LANE_PROTOCOL_ID =
  "milestone-loop-wp6-measurement-lane.v1" as const;
export const MEASUREMENT_COMMAND_CATALOGUE_ID =
  "milestone-loop-wp6-measured-command-set.v1" as const;
export const MEASUREMENT_LANE_RECORD_NAME =
  "measurement-lane-run.json" as const;
export const MEASUREMENT_LANE_RECORD_KIND = "measurement-lane-run" as const;
export const MEASUREMENT_LANE_CHILD_RECEIPT_KIND =
  "measurement-lane-child-receipt" as const;
export const MEASUREMENT_LANE_PAIRED_COLD_RECORD_NAME =
  "paired-cold-measurement-lane-run.json" as const;
export const MEASUREMENT_LANE_PAIRED_COLD_RECORD_KIND =
  "measurement-lane-paired-cold-run" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_ID_PATTERN = /^[a-f0-9]{40}$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;
const CHILD_TIMEOUT_MS = 75 * 60 * 1000;
const REQUIRED_NODE_VERSION = "v24.18.0";
const REQUIRED_PNPM_VERSION = "11.15.1";
const DEPENDENCY_INSTALL_COMMAND =
  "pnpm install --frozen-lockfile --package-import-method=copy" as const;
const COLD_DEFINITION =
  "First measured invocation in a fresh hosted-job checkout after the declared frozen dependency install; operating-system caches are uncontrolled and no cache-coldness claim is made." as const;
const WARM_DEFINITION =
  "Measured invocation in the identical workspace and dependency tree immediately after its paired cold invocation; operating-system caches are uncontrolled and no cache-warmness guarantee is claimed." as const;

export type MeasurementLaneClassification = "cold" | "warm";

export interface MeasurementCommandDefinition {
  readonly id: string;
  readonly script: string;
  readonly stageId: string;
  readonly commandId: string;
  readonly role: Exclude<TestRunRole, "legacy-extra">;
  readonly owner: string | null;
  readonly requiredKinds: readonly string[];
  readonly timeoutMs: number;
}

const LEGACY_COMMANDS: readonly MeasurementCommandDefinition[] = [
  {
    id: "legacy-fast",
    script: "test:unit:fast",
    stageId: "candidate-unit",
    commandId: "test:unit:fast",
    role: "legacy",
    owner: null,
    requiredKinds: [
      "fast-unit-vitest-report",
      "unit-partition-report",
      TEST_RUN_SUMMARY_KIND,
    ],
    timeoutMs: CHILD_TIMEOUT_MS,
  },
  {
    id: "legacy-migration",
    script: "test:unit:migrations",
    stageId: "migration-unit",
    commandId: "test:unit:migrations",
    role: "legacy",
    owner: null,
    requiredKinds: [
      "migration-unit-vitest-report",
      "unit-partition-report",
      TEST_RUN_SUMMARY_KIND,
    ],
    timeoutMs: CHILD_TIMEOUT_MS,
  },
  {
    id: "legacy-orchestrator",
    script: "test:orchestrator",
    stageId: "verification-tier-milestone",
    commandId: "test-orchestrator",
    role: "legacy",
    owner: null,
    requiredKinds: ["orchestrator-vitest-report", TEST_RUN_SUMMARY_KIND],
    timeoutMs: CHILD_TIMEOUT_MS,
  },
];

const PARTITION_COMMANDS: readonly MeasurementCommandDefinition[] =
  TEST_OWNER_IDS.map((owner) => ({
    id: `partition-${owner}`,
    script: `test:partition:${owner}`,
    stageId: "wp6-shadow-partition",
    commandId: `test:partition:${owner}`,
    role: "partition" as const,
    owner,
    requiredKinds: [
      "test-partition-report",
      "test-partition-vitest-report",
      TEST_RUN_SUMMARY_KIND,
    ],
    timeoutMs: CHILD_TIMEOUT_MS,
  }));

export const MEASUREMENT_COMMANDS: readonly MeasurementCommandDefinition[] = [
  ...LEGACY_COMMANDS,
  ...PARTITION_COMMANDS,
];

export interface MeasurementLaneFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface MeasurementLaneRecord {
  readonly schemaVersion: typeof MEASUREMENT_LANE_SCHEMA_VERSION;
  readonly protocolId: typeof MEASUREMENT_LANE_PROTOCOL_ID;
  readonly status: "PASS";
  readonly laneRun: {
    readonly laneRunId: string;
    readonly ordinal: number;
    readonly classification: MeasurementLaneClassification;
  };
  readonly workspaceState: {
    readonly workspaceId: string;
    readonly classificationDefinition:
      typeof COLD_DEFINITION | typeof WARM_DEFINITION;
    readonly freshCheckout: boolean;
    readonly freshFrozenInstall: boolean;
    readonly reusesPairedColdWorkspace: boolean;
    readonly operatingSystemCaches: "uncontrolled-not-claimed";
    readonly repositoryPathSha256: string;
    readonly dependencyInstall: {
      readonly command: typeof DEPENDENCY_INSTALL_COMMAND;
      readonly lockfile: MeasurementLaneFileIdentity;
      readonly modulesManifest: MeasurementLaneFileIdentity;
    };
  };
  readonly candidate: TestRunCandidate;
  readonly platform: TestRunSummary["platform"];
  readonly executionContext: {
    readonly provider: "github-actions" | "local-validation";
    readonly githubRunId: string | null;
    readonly githubRunAttempt: number | null;
    readonly githubJob: string | null;
  };
  readonly commandSet: {
    readonly catalogueId: typeof MEASUREMENT_COMMAND_CATALOGUE_ID;
    readonly catalogueSha256: string;
    readonly selectedCommandIds: readonly string[];
    readonly selectedSetSha256: string;
  };
  readonly commands: readonly {
    readonly id: string;
    readonly script: string;
    readonly stageId: string;
    readonly commandId: string;
    readonly role: Exclude<TestRunRole, "legacy-extra">;
    readonly owner: string | null;
    readonly runId: string;
    readonly artifactDirectory: string;
    readonly receipt: MeasurementLaneFileIdentity;
    readonly summary: MeasurementLaneFileIdentity & {
      readonly contentSha256: string;
    };
  }[];
  readonly reduction: MeasurementLaneFileIdentity & {
    readonly contentSha256: string;
    readonly inputCount: number;
    readonly inputSetSha256: string;
  };
  readonly pairedCold:
    | (MeasurementLaneFileIdentity & {
        readonly laneRunId: string;
        readonly contentSha256: string;
      })
    | null;
  readonly timestamps: {
    readonly startedAt: string;
    readonly finishedAt: string;
  };
  readonly nonSemantic: {
    readonly changesTestSuccess: false;
    readonly authorizesCutover: false;
    readonly benchmarkClaim: false;
  };
  readonly contentSha256: string;
}

export interface LoadedMeasurementLaneRecord {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly record: MeasurementLaneRecord;
}

export interface MeasurementLaneExecutionContext {
  readonly provider: "github-actions" | "local-validation";
  readonly githubRunId: string | null;
  readonly githubRunAttempt: number | null;
  readonly githubJob: string | null;
}

export interface MeasurementLaneWorkspaceSnapshot {
  readonly repositoryPathSha256: string;
  readonly lockfile: MeasurementLaneFileIdentity;
  readonly modulesManifest: MeasurementLaneFileIdentity;
}

export interface RunMeasurementLaneInput {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly laneRunId: string;
  readonly ordinal: number;
  readonly classification: MeasurementLaneClassification;
  readonly workspaceId: string;
  readonly selectedCommandIds: readonly string[];
  readonly pairedColdRecordPath?: string;
  readonly readIdentity?: () => Promise<TestRunCommandIdentity>;
  readonly executeCommand?: (input: {
    readonly definition: MeasurementCommandDefinition;
    readonly repositoryRoot: string;
    readonly artifactDirectory: string;
    readonly logDirectory: string;
    readonly runId: string;
    readonly environment: Readonly<Record<string, string>>;
  }) => Promise<CommandExecutionSummary>;
  readonly workspaceSnapshot?: () => Promise<MeasurementLaneWorkspaceSnapshot>;
  readonly executionContext?: () => MeasurementLaneExecutionContext;
  readonly now?: () => Date;
}

export interface RunMeasurementLaneResult {
  readonly recordPath: string;
  readonly record: MeasurementLaneRecord;
  readonly reductionPath: string;
  readonly pairedColdCopyPath: string | null;
  readonly childReceiptPaths: readonly string[];
  readonly summaryPaths: readonly string[];
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

function safePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw new Error(`${label} must be a positive safe integer.`);
  return Number(value);
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

function samePlatform(
  left: TestRunSummary["platform"],
  right: TestRunSummary["platform"],
): boolean {
  return canonicalJson(left) === canonicalJson(right);
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

function candidateFromIdentity(
  identity: TestRunCommandIdentity,
): TestRunCandidate {
  return {
    gitCommit: identity.gitCommit,
    gitTree: identity.gitTree,
    workingTreeDirty: identity.workingTreeDirty,
  };
}

function assertPinnedCleanIdentity(identity: TestRunCommandIdentity): void {
  if (
    !GIT_ID_PATTERN.test(identity.gitCommit) ||
    !GIT_ID_PATTERN.test(identity.gitTree) ||
    identity.workingTreeDirty
  )
    throw new Error(
      "Measurement lane requires one clean immutable Git candidate commit.",
    );
  if (
    identity.nodeVersion !== REQUIRED_NODE_VERSION ||
    identity.pnpmVersion !== REQUIRED_PNPM_VERSION
  )
    throw new Error(
      `Measurement lane requires Node ${REQUIRED_NODE_VERSION} and pnpm ${REQUIRED_PNPM_VERSION}; received ${identity.nodeVersion} and ${identity.pnpmVersion}.`,
    );
}

function sameIdentity(
  left: TestRunCommandIdentity,
  right: TestRunCommandIdentity,
): boolean {
  return (
    sameCandidate(left, right) &&
    left.nodeVersion === right.nodeVersion &&
    left.pnpmVersion === right.pnpmVersion
  );
}

function identityFromUnknown(value: unknown): TestRunCommandIdentity {
  if (!isRecord(value))
    throw new Error("Measurement lane command identity is malformed.");
  const workingTreeDirty =
    typeof value["workingTreeDirty"] === "boolean"
      ? value["workingTreeDirty"]
      : typeof value["gitStatus"] === "string"
        ? value["gitStatus"] !== ""
        : (() => {
            throw new Error(
              "Measurement lane command identity is missing working-tree state.",
            );
          })();
  const identity: TestRunCommandIdentity = {
    gitCommit: nonEmptyString(value["gitCommit"], "Git commit"),
    gitTree: nonEmptyString(value["gitTree"], "Git tree"),
    workingTreeDirty,
    nodeVersion: nonEmptyString(value["nodeVersion"], "Node version"),
    pnpmVersion: nonEmptyString(value["pnpmVersion"], "pnpm version"),
  };
  assertPinnedCleanIdentity(identity);
  return identity;
}

async function defaultIdentityReader(
  repositoryRoot: string,
): Promise<TestRunCommandIdentity> {
  const raw = (await commandIdentity(repositoryRoot)) as Record<
    string,
    unknown
  >;
  return identityFromUnknown({
    ...raw,
    workingTreeDirty: raw["gitStatus"] !== "",
  });
}

function contained(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.replaceAll("\\", "/").split("/").includes("..")
  );
}

async function fileIdentity(
  root: string,
  path: string,
  label: string,
): Promise<MeasurementLaneFileIdentity> {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  if (!contained(absoluteRoot, absolutePath))
    throw new Error(`${label} escapes its declared root.`);
  const realRoot = await realpath(absoluteRoot);
  const realPath = await realpath(absolutePath);
  if (!contained(realRoot, realPath))
    throw new Error(`${label} resolves outside its declared root.`);
  const metadata = await lstat(realPath);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`${label} must be a regular non-symlink file.`);
  const contents = await readFile(realPath);
  return {
    path: canonicalRelativePath(relative(absoluteRoot, absolutePath), label),
    bytes: contents.byteLength,
    sha256: sha256(contents),
  };
}

export async function collectMeasurementLaneWorkspaceSnapshot(
  repositoryRoot: string,
): Promise<MeasurementLaneWorkspaceSnapshot> {
  const root = resolve(repositoryRoot);
  const realRoot = await realpath(root);
  const normalizedRealRoot = realRoot.replaceAll("\\", "/");
  return {
    repositoryPathSha256: sha256(
      process.platform === "win32"
        ? normalizedRealRoot.toLowerCase()
        : normalizedRealRoot,
    ),
    lockfile: await fileIdentity(
      root,
      resolve(root, "pnpm-lock.yaml"),
      "Workspace lockfile",
    ),
    modulesManifest: await fileIdentity(
      root,
      resolve(root, "node_modules", ".modules.yaml"),
      "Workspace modules manifest",
    ),
  };
}

export function currentMeasurementLaneExecutionContext(
  environment: NodeJS.ProcessEnv = process.env,
): MeasurementLaneExecutionContext {
  const githubActions = environment["GITHUB_ACTIONS"] === "true";
  if (!githubActions)
    return {
      provider: "local-validation",
      githubRunId: null,
      githubRunAttempt: null,
      githubJob: null,
    };
  const runId = nonEmptyString(environment["GITHUB_RUN_ID"], "GitHub run ID");
  const runAttempt = Number(environment["GITHUB_RUN_ATTEMPT"]);
  const job = nonEmptyString(environment["GITHUB_JOB"], "GitHub job ID");
  if (
    !/^[0-9]+$/u.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt <= 0
  )
    throw new Error("GitHub Actions measurement provenance is malformed.");
  return {
    provider: "github-actions",
    githubRunId: runId,
    githubRunAttempt: runAttempt,
    githubJob: job,
  };
}

export const MEASUREMENT_COMMAND_CATALOGUE_SHA256 = sha256(
  canonicalJson({
    schemaVersion: MEASUREMENT_LANE_SCHEMA_VERSION,
    id: MEASUREMENT_COMMAND_CATALOGUE_ID,
    commands: MEASUREMENT_COMMANDS,
  }),
);

function selectedDefinitions(
  selectedCommandIds: readonly string[],
): readonly MeasurementCommandDefinition[] {
  if (selectedCommandIds.length === 0)
    throw new Error("Measurement lane requires at least one command.");
  if (new Set(selectedCommandIds).size !== selectedCommandIds.length)
    throw new Error("Measurement lane command selection contains duplicates.");
  const requested = new Set(selectedCommandIds);
  const unknown = selectedCommandIds.filter(
    (id) => !MEASUREMENT_COMMANDS.some((definition) => definition.id === id),
  );
  if (unknown.length > 0)
    throw new Error(`Unknown measurement command IDs: ${unknown.join(", ")}.`);
  return MEASUREMENT_COMMANDS.filter((definition) =>
    requested.has(definition.id),
  );
}

function selectedSetSha256(ids: readonly string[]): string {
  return sha256(`${ids.join("\n")}\n`);
}

function childRunId(laneRunId: string, commandId: string): string {
  const value = `${laneRunId}.${commandId}`;
  if (SAFE_ID_PATTERN.test(value)) return value;
  return `${laneRunId.slice(0, 110)}.${sha256(value).slice(0, 32)}`;
}

function childExpectation(
  definition: MeasurementCommandDefinition,
  runId: string,
  candidate: TestRunCandidate,
): TestRunSummaryExpectation {
  return {
    runId,
    stageId: definition.stageId,
    commandId: definition.commandId,
    role: definition.role,
    owner: definition.owner,
    candidate,
  };
}

async function defaultExecuteCommand(input: {
  readonly definition: MeasurementCommandDefinition;
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly logDirectory: string;
  readonly runId: string;
  readonly environment: Readonly<Record<string, string>>;
}): Promise<CommandExecutionSummary> {
  return runCommand(
    {
      id: input.definition.id,
      executable: "pnpm",
      args: [input.definition.script],
      parser: "exit-code",
      timeoutMs: input.definition.timeoutMs,
    },
    {
      workingDirectory: input.repositoryRoot,
      artifactDirectory: input.logDirectory,
      timeoutMs: input.definition.timeoutMs,
      trustedControllerCommand: true,
      extraEnvironment: input.environment,
    },
  );
}

function assertFileIdentity(
  value: unknown,
  label: string,
  expectedPath?: string,
): MeasurementLaneFileIdentity {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  exactKeys(value, ["path", "bytes", "sha256"], label);
  const path = canonicalRelativePath(value["path"], `${label} path`);
  if (expectedPath !== undefined && path !== expectedPath)
    throw new Error(`${label} path is not canonical for its role.`);
  const bytes = safePositiveInteger(value["bytes"], `${label} bytes`);
  if (
    typeof value["sha256"] !== "string" ||
    !SHA256_PATTERN.test(value["sha256"])
  )
    throw new Error(`${label} SHA-256 is malformed.`);
  return { path, bytes, sha256: value["sha256"] };
}

function assertCandidate(value: unknown): TestRunCandidate {
  if (!isRecord(value)) throw new Error("Lane candidate must be an object.");
  exactKeys(
    value,
    ["gitCommit", "gitTree", "workingTreeDirty"],
    "Lane candidate",
  );
  if (
    typeof value["gitCommit"] !== "string" ||
    !GIT_ID_PATTERN.test(value["gitCommit"]) ||
    typeof value["gitTree"] !== "string" ||
    !GIT_ID_PATTERN.test(value["gitTree"]) ||
    value["workingTreeDirty"] !== false
  )
    throw new Error("Lane candidate must be exact and clean.");
  return {
    gitCommit: value["gitCommit"],
    gitTree: value["gitTree"],
    workingTreeDirty: false,
  };
}

function assertPlatform(value: unknown): TestRunSummary["platform"] {
  if (!isRecord(value)) throw new Error("Lane platform must be an object.");
  exactKeys(
    value,
    ["os", "release", "arch", "endianness", "nodeVersion", "pnpmVersion"],
    "Lane platform",
  );
  const os = nonEmptyString(
    value["os"],
    "Lane operating system",
  ) as NodeJS.Platform;
  if (os !== "win32" && os !== "linux")
    throw new Error("Measurement lane supports only hosted Windows and Linux.");
  const endianness = value["endianness"];
  if (endianness !== "BE" && endianness !== "LE")
    throw new Error("Lane endianness is malformed.");
  if (
    value["nodeVersion"] !== REQUIRED_NODE_VERSION ||
    value["pnpmVersion"] !== REQUIRED_PNPM_VERSION
  )
    throw new Error("Lane platform runtime is not pinned.");
  return {
    os,
    release: nonEmptyString(value["release"], "Lane platform release"),
    arch: nonEmptyString(value["arch"], "Lane architecture"),
    endianness,
    nodeVersion: REQUIRED_NODE_VERSION,
    pnpmVersion: REQUIRED_PNPM_VERSION,
  };
}

export function assertMeasurementLaneRecord(
  value: unknown,
  expected?: {
    readonly laneRunId?: string;
    readonly ordinal?: number;
    readonly classification?: MeasurementLaneClassification;
    readonly workspaceId?: string;
    readonly selectedCommandIds?: readonly string[];
    readonly candidate?: TestRunCandidate;
  },
): MeasurementLaneRecord {
  if (!isRecord(value))
    throw new Error("Measurement lane record must be an object.");
  exactKeys(
    value,
    [
      "schemaVersion",
      "protocolId",
      "status",
      "laneRun",
      "workspaceState",
      "candidate",
      "platform",
      "executionContext",
      "commandSet",
      "commands",
      "reduction",
      "pairedCold",
      "timestamps",
      "nonSemantic",
      "contentSha256",
    ],
    "Measurement lane record",
  );
  if (
    value["schemaVersion"] !== MEASUREMENT_LANE_SCHEMA_VERSION ||
    value["protocolId"] !== MEASUREMENT_LANE_PROTOCOL_ID ||
    value["status"] !== "PASS"
  )
    throw new Error("Measurement lane protocol identity is invalid.");

  const laneRun = value["laneRun"];
  if (!isRecord(laneRun))
    throw new Error("Lane run identity must be an object.");
  exactKeys(
    laneRun,
    ["laneRunId", "ordinal", "classification"],
    "Lane run identity",
  );
  const laneRunId = nonEmptyString(laneRun["laneRunId"], "Lane run ID");
  if (!SAFE_ID_PATTERN.test(laneRunId))
    throw new Error("Lane run ID is malformed.");
  const ordinal = safePositiveInteger(laneRun["ordinal"], "Lane ordinal");
  const classification = laneRun["classification"];
  if (classification !== "cold" && classification !== "warm")
    throw new Error("Lane classification must be cold or warm.");

  const workspace = value["workspaceState"];
  if (!isRecord(workspace))
    throw new Error("Lane workspace state must be an object.");
  exactKeys(
    workspace,
    [
      "workspaceId",
      "classificationDefinition",
      "freshCheckout",
      "freshFrozenInstall",
      "reusesPairedColdWorkspace",
      "operatingSystemCaches",
      "repositoryPathSha256",
      "dependencyInstall",
    ],
    "Lane workspace state",
  );
  const workspaceId = nonEmptyString(workspace["workspaceId"], "Workspace ID");
  if (!SAFE_ID_PATTERN.test(workspaceId))
    throw new Error("Workspace ID is malformed.");
  if (
    workspace["classificationDefinition"] !==
      (classification === "cold" ? COLD_DEFINITION : WARM_DEFINITION) ||
    workspace["freshCheckout"] !== (classification === "cold") ||
    workspace["freshFrozenInstall"] !== (classification === "cold") ||
    workspace["reusesPairedColdWorkspace"] !== (classification === "warm") ||
    workspace["operatingSystemCaches"] !== "uncontrolled-not-claimed" ||
    typeof workspace["repositoryPathSha256"] !== "string" ||
    !SHA256_PATTERN.test(workspace["repositoryPathSha256"])
  )
    throw new Error(
      "Lane workspace classification declaration is contradictory.",
    );
  const dependencyInstall = workspace["dependencyInstall"];
  if (!isRecord(dependencyInstall))
    throw new Error("Lane dependency installation state must be an object.");
  exactKeys(
    dependencyInstall,
    ["command", "lockfile", "modulesManifest"],
    "Lane dependency installation state",
  );
  if (dependencyInstall["command"] !== DEPENDENCY_INSTALL_COMMAND)
    throw new Error("Lane dependency installation command is not frozen.");
  const lockfile = assertFileIdentity(
    dependencyInstall["lockfile"],
    "Lane lockfile",
    "pnpm-lock.yaml",
  );
  const modulesManifest = assertFileIdentity(
    dependencyInstall["modulesManifest"],
    "Lane modules manifest",
    "node_modules/.modules.yaml",
  );

  const candidate = assertCandidate(value["candidate"]);
  const platform = assertPlatform(value["platform"]);

  const executionContext = value["executionContext"];
  if (!isRecord(executionContext))
    throw new Error("Lane execution context must be an object.");
  exactKeys(
    executionContext,
    ["provider", "githubRunId", "githubRunAttempt", "githubJob"],
    "Lane execution context",
  );
  if (executionContext["provider"] === "github-actions") {
    if (
      typeof executionContext["githubRunId"] !== "string" ||
      !/^[0-9]+$/u.test(executionContext["githubRunId"]) ||
      safePositiveInteger(
        executionContext["githubRunAttempt"],
        "GitHub run attempt",
      ) < 1 ||
      typeof executionContext["githubJob"] !== "string" ||
      executionContext["githubJob"].length === 0
    )
      throw new Error("Hosted lane execution context is malformed.");
  } else if (
    executionContext["provider"] !== "local-validation" ||
    executionContext["githubRunId"] !== null ||
    executionContext["githubRunAttempt"] !== null ||
    executionContext["githubJob"] !== null
  )
    throw new Error("Local lane execution context is contradictory.");

  const commandSet = value["commandSet"];
  if (!isRecord(commandSet))
    throw new Error("Lane command set must be an object.");
  exactKeys(
    commandSet,
    [
      "catalogueId",
      "catalogueSha256",
      "selectedCommandIds",
      "selectedSetSha256",
    ],
    "Lane command set",
  );
  if (
    commandSet["catalogueId"] !== MEASUREMENT_COMMAND_CATALOGUE_ID ||
    commandSet["catalogueSha256"] !== MEASUREMENT_COMMAND_CATALOGUE_SHA256 ||
    !Array.isArray(commandSet["selectedCommandIds"]) ||
    commandSet["selectedCommandIds"].some((id) => typeof id !== "string")
  )
    throw new Error("Lane command catalogue identity is invalid.");
  const commandIds = commandSet["selectedCommandIds"] as string[];
  const definitions = selectedDefinitions(commandIds);
  const canonicalIds = definitions.map((definition) => definition.id);
  if (
    !sameStrings(commandIds, canonicalIds) ||
    commandSet["selectedSetSha256"] !== selectedSetSha256(commandIds)
  )
    throw new Error("Lane command selection is not canonical.");

  if (
    !Array.isArray(value["commands"]) ||
    value["commands"].length !== definitions.length
  )
    throw new Error(
      "Lane command records do not cover the selected command set.",
    );
  const commands = value["commands"].map((item, index) => {
    if (!isRecord(item))
      throw new Error(`Lane command ${index} must be an object.`);
    exactKeys(
      item,
      [
        "id",
        "script",
        "stageId",
        "commandId",
        "role",
        "owner",
        "runId",
        "artifactDirectory",
        "receipt",
        "summary",
      ],
      `Lane command ${index}`,
    );
    const definition = definitions[index];
    if (!definition) throw new Error("Lane command definition disappeared.");
    if (
      item["id"] !== definition.id ||
      item["script"] !== definition.script ||
      item["stageId"] !== definition.stageId ||
      item["commandId"] !== definition.commandId ||
      item["role"] !== definition.role ||
      item["owner"] !== definition.owner
    )
      throw new Error(
        `Lane command ${index} contradicts the measured catalogue.`,
      );
    const runId = nonEmptyString(item["runId"], `Lane command ${index} run ID`);
    if (
      !SAFE_ID_PATTERN.test(runId) ||
      runId !== childRunId(laneRunId, definition.id)
    )
      throw new Error(`Lane command ${index} run ID is not deterministic.`);
    const artifactDirectory = canonicalRelativePath(
      item["artifactDirectory"],
      `Lane command ${index} artifact directory`,
    );
    const expectedDirectory = `commands/${definition.id}`;
    if (artifactDirectory !== expectedDirectory)
      throw new Error(
        `Lane command ${index} artifact directory is not canonical.`,
      );
    const receipt = assertFileIdentity(
      item["receipt"],
      `Lane command ${index} receipt`,
      `${expectedDirectory}/result.json`,
    );
    if (!isRecord(item["summary"]))
      throw new Error(`Lane command ${index} summary must be an object.`);
    exactKeys(
      item["summary"],
      ["path", "bytes", "sha256", "contentSha256"],
      `Lane command ${index} summary`,
    );
    const summary = assertFileIdentity(
      {
        path: item["summary"]["path"],
        bytes: item["summary"]["bytes"],
        sha256: item["summary"]["sha256"],
      },
      `Lane command ${index} summary`,
      `${expectedDirectory}/test-run-summary.json`,
    );
    if (
      typeof item["summary"]["contentSha256"] !== "string" ||
      !SHA256_PATTERN.test(item["summary"]["contentSha256"])
    )
      throw new Error(
        `Lane command ${index} summary content hash is malformed.`,
      );
    return {
      id: definition.id,
      script: definition.script,
      stageId: definition.stageId,
      commandId: definition.commandId,
      role: definition.role,
      owner: definition.owner,
      runId,
      artifactDirectory,
      receipt,
      summary: {
        ...summary,
        contentSha256: item["summary"]["contentSha256"],
      },
    };
  });

  if (!isRecord(value["reduction"]))
    throw new Error("Lane reduction identity must be an object.");
  exactKeys(
    value["reduction"],
    [
      "path",
      "bytes",
      "sha256",
      "contentSha256",
      "inputCount",
      "inputSetSha256",
    ],
    "Lane reduction identity",
  );
  const reductionFile = assertFileIdentity(
    {
      path: value["reduction"]["path"],
      bytes: value["reduction"]["bytes"],
      sha256: value["reduction"]["sha256"],
    },
    "Lane reduction",
    TEST_RUN_REDUCTION_NAME,
  );
  if (
    typeof value["reduction"]["contentSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["reduction"]["contentSha256"]) ||
    value["reduction"]["inputCount"] !== definitions.length ||
    typeof value["reduction"]["inputSetSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["reduction"]["inputSetSha256"])
  )
    throw new Error("Lane reduction identity is contradictory.");

  let pairedCold: MeasurementLaneRecord["pairedCold"] = null;
  if (classification === "cold") {
    if (value["pairedCold"] !== null)
      throw new Error("Cold lane cannot declare a paired cold record.");
  } else {
    if (!isRecord(value["pairedCold"]))
      throw new Error("Warm lane requires a paired cold record.");
    exactKeys(
      value["pairedCold"],
      ["path", "bytes", "sha256", "laneRunId", "contentSha256"],
      "Paired cold identity",
    );
    const pairedFile = assertFileIdentity(
      {
        path: value["pairedCold"]["path"],
        bytes: value["pairedCold"]["bytes"],
        sha256: value["pairedCold"]["sha256"],
      },
      "Paired cold record",
      MEASUREMENT_LANE_PAIRED_COLD_RECORD_NAME,
    );
    const pairedLaneRunId = nonEmptyString(
      value["pairedCold"]["laneRunId"],
      "Paired cold lane run ID",
    );
    if (
      !SAFE_ID_PATTERN.test(pairedLaneRunId) ||
      typeof value["pairedCold"]["contentSha256"] !== "string" ||
      !SHA256_PATTERN.test(value["pairedCold"]["contentSha256"])
    )
      throw new Error("Paired cold semantic identity is malformed.");
    pairedCold = {
      ...pairedFile,
      laneRunId: pairedLaneRunId,
      contentSha256: value["pairedCold"]["contentSha256"],
    };
  }

  const timestamps = value["timestamps"];
  if (!isRecord(timestamps))
    throw new Error("Lane timestamps must be an object.");
  exactKeys(timestamps, ["startedAt", "finishedAt"], "Lane timestamps");
  const startedAt = timestamp(timestamps["startedAt"], "Lane start timestamp");
  const finishedAt = timestamp(
    timestamps["finishedAt"],
    "Lane finish timestamp",
  );
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    throw new Error("Lane timestamps are reversed.");

  const nonSemantic = value["nonSemantic"];
  if (!isRecord(nonSemantic))
    throw new Error("Lane semantic boundary must be an object.");
  exactKeys(
    nonSemantic,
    ["changesTestSuccess", "authorizesCutover", "benchmarkClaim"],
    "Lane semantic boundary",
  );
  if (
    nonSemantic["changesTestSuccess"] !== false ||
    nonSemantic["authorizesCutover"] !== false ||
    nonSemantic["benchmarkClaim"] !== false
  )
    throw new Error("Lane measurement cannot change semantic outcomes.");
  if (
    typeof value["contentSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["contentSha256"]) ||
    semanticHash(value) !== value["contentSha256"]
  )
    throw new Error("Lane content hash is invalid.");

  if (expected?.laneRunId !== undefined && laneRunId !== expected.laneRunId)
    throw new Error("Lane run ID does not match expectation.");
  if (expected?.ordinal !== undefined && ordinal !== expected.ordinal)
    throw new Error("Lane ordinal does not match expectation.");
  if (
    expected?.classification !== undefined &&
    classification !== expected.classification
  )
    throw new Error("Lane classification does not match expectation.");
  if (
    expected?.workspaceId !== undefined &&
    workspaceId !== expected.workspaceId
  )
    throw new Error("Lane workspace ID does not match expectation.");
  if (
    expected?.selectedCommandIds !== undefined &&
    !sameStrings(commandIds, expected.selectedCommandIds)
  )
    throw new Error("Lane selected command set does not match expectation.");
  if (expected?.candidate && !sameCandidate(candidate, expected.candidate))
    throw new Error("Lane candidate does not match expectation.");

  return {
    schemaVersion: MEASUREMENT_LANE_SCHEMA_VERSION,
    protocolId: MEASUREMENT_LANE_PROTOCOL_ID,
    status: "PASS",
    laneRun: { laneRunId, ordinal, classification },
    workspaceState: {
      workspaceId,
      classificationDefinition:
        classification === "cold" ? COLD_DEFINITION : WARM_DEFINITION,
      freshCheckout: classification === "cold",
      freshFrozenInstall: classification === "cold",
      reusesPairedColdWorkspace: classification === "warm",
      operatingSystemCaches: "uncontrolled-not-claimed",
      repositoryPathSha256: workspace["repositoryPathSha256"] as string,
      dependencyInstall: {
        command: DEPENDENCY_INSTALL_COMMAND,
        lockfile,
        modulesManifest,
      },
    },
    candidate,
    platform,
    executionContext:
      executionContext as unknown as MeasurementLaneRecord["executionContext"],
    commandSet: {
      catalogueId: MEASUREMENT_COMMAND_CATALOGUE_ID,
      catalogueSha256: MEASUREMENT_COMMAND_CATALOGUE_SHA256,
      selectedCommandIds: commandIds,
      selectedSetSha256: commandSet["selectedSetSha256"] as string,
    },
    commands,
    reduction: {
      ...reductionFile,
      contentSha256: value["reduction"]["contentSha256"] as string,
      inputCount: value["reduction"]["inputCount"] as number,
      inputSetSha256: value["reduction"]["inputSetSha256"] as string,
    },
    pairedCold,
    timestamps: { startedAt, finishedAt },
    nonSemantic: {
      changesTestSuccess: false,
      authorizesCutover: false,
      benchmarkClaim: false,
    },
    contentSha256: value["contentSha256"] as string,
  };
}

export async function loadMeasurementLaneRecord(input: {
  readonly path: string;
  readonly expected?: Parameters<typeof assertMeasurementLaneRecord>[1];
}): Promise<LoadedMeasurementLaneRecord> {
  const path = resolve(input.path);
  const metadata = await stat(path);
  if (!metadata.isFile())
    throw new Error("Measurement lane record is not a file.");
  const contents = await readFile(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8")) as unknown;
  } catch {
    throw new Error("Measurement lane record is malformed JSON.");
  }
  return {
    path,
    bytes: contents.byteLength,
    sha256: sha256(contents),
    record: assertMeasurementLaneRecord(parsed, input.expected),
  };
}

function pairedColdMatchesWarm(input: {
  readonly cold: MeasurementLaneRecord;
  readonly ordinal: number;
  readonly workspaceId: string;
  readonly selectedCommandIds: readonly string[];
  readonly candidate: TestRunCandidate;
  readonly workspace: MeasurementLaneWorkspaceSnapshot;
}): void {
  const cold = input.cold;
  if (
    cold.laneRun.classification !== "cold" ||
    cold.laneRun.ordinal !== input.ordinal ||
    cold.workspaceState.workspaceId !== input.workspaceId ||
    cold.workspaceState.repositoryPathSha256 !==
      input.workspace.repositoryPathSha256 ||
    canonicalJson(cold.workspaceState.dependencyInstall.lockfile) !==
      canonicalJson(input.workspace.lockfile) ||
    canonicalJson(cold.workspaceState.dependencyInstall.modulesManifest) !==
      canonicalJson(input.workspace.modulesManifest) ||
    !sameStrings(
      cold.commandSet.selectedCommandIds,
      input.selectedCommandIds,
    ) ||
    !sameCandidate(cold.candidate, input.candidate)
  )
    throw new Error(
      "Warm lane does not match its paired cold ordinal, workspace, dependency tree, command set, or candidate.",
    );
}

export async function runMeasurementLane(
  input: RunMeasurementLaneInput,
): Promise<RunMeasurementLaneResult> {
  if (!SAFE_ID_PATTERN.test(input.laneRunId))
    throw new Error("Measurement lane run ID is malformed.");
  safePositiveInteger(input.ordinal, "Measurement lane ordinal");
  if (!SAFE_ID_PATTERN.test(input.workspaceId))
    throw new Error("Measurement workspace ID is malformed.");
  if (input.classification !== "cold" && input.classification !== "warm")
    throw new Error("Measurement lane classification must be cold or warm.");
  if (
    (input.classification === "warm") !==
    (typeof input.pairedColdRecordPath === "string")
  )
    throw new Error(
      "Warm measurement lanes require one paired cold record and cold lanes forbid one.",
    );

  const definitions = selectedDefinitions(input.selectedCommandIds);
  const selectedIds = definitions.map((definition) => definition.id);
  const repositoryRoot = resolve(input.repositoryRoot);
  const artifactDirectory = resolve(input.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true });
  const startedAt = (input.now ?? (() => new Date()))().toISOString();
  const readIdentity =
    input.readIdentity ?? (() => defaultIdentityReader(repositoryRoot));
  const initialIdentity = await readIdentity();
  assertPinnedCleanIdentity(initialIdentity);
  const candidate = candidateFromIdentity(initialIdentity);
  const workspace = await (
    input.workspaceSnapshot ??
    (() => collectMeasurementLaneWorkspaceSnapshot(repositoryRoot))
  )();
  const executionContext = (
    input.executionContext ?? (() => currentMeasurementLaneExecutionContext())
  )();

  let pairedColdSource: LoadedMeasurementLaneRecord | null = null;
  let pairedColdCopyPath: string | null = null;
  if (input.classification === "warm") {
    pairedColdSource = await validateMeasurementLaneArtifacts(
      input.pairedColdRecordPath!,
    );
    assertMeasurementLaneRecord(pairedColdSource.record, {
      ordinal: input.ordinal,
      classification: "cold",
      workspaceId: input.workspaceId,
      selectedCommandIds: selectedIds,
      candidate,
    });
    pairedColdMatchesWarm({
      cold: pairedColdSource.record,
      ordinal: input.ordinal,
      workspaceId: input.workspaceId,
      selectedCommandIds: selectedIds,
      candidate,
      workspace,
    });
    pairedColdCopyPath = resolve(
      artifactDirectory,
      MEASUREMENT_LANE_PAIRED_COLD_RECORD_NAME,
    );
    await copyFile(
      pairedColdSource.path,
      pairedColdCopyPath,
      constants.COPYFILE_EXCL,
    );
  }

  const execute = input.executeCommand ?? defaultExecuteCommand;
  const sources: ValidatedTestRunSummarySource[] = [];
  const expectations: TestRunSummaryExpectation[] = [];
  const commandRecords: MeasurementLaneRecord["commands"][number][] = [];
  const childReceiptPaths: string[] = [];
  const summaryPaths: string[] = [];
  for (const definition of definitions) {
    const childDirectory = resolve(
      artifactDirectory,
      "commands",
      definition.id,
    );
    const logDirectory = resolve(
      artifactDirectory,
      "child-logs",
      definition.id,
    );
    const runId = childRunId(input.laneRunId, definition.id);
    const environment = {
      LOOP_VERIFY_STAGE_ID: definition.stageId,
      LOOP_VERIFY_COMMAND_ID: definition.commandId,
      LOOP_VERIFY_COMMAND_ARTIFACT_DIR: childDirectory,
      LOOP_VERIFY_RUN_ID: runId,
    };
    const execution = await execute({
      definition,
      repositoryRoot,
      artifactDirectory: childDirectory,
      logDirectory,
      runId,
      environment,
    });
    if (execution.status !== "PASS")
      throw new Error(
        `Measurement command ${definition.id} failed with ${execution.status} and exit ${execution.exitCode ?? "none"}: ${execution.message}. Logs: ${execution.stdoutPath}, ${execution.stderrPath}.`,
      );
    const receipt = await validateCommandReceiptDirectory({
      directory: childDirectory,
      expectedStageId: definition.stageId,
      expectedCommandId: definition.commandId,
      requiredKinds: definition.requiredKinds,
    });
    const expectation = childExpectation(definition, runId, candidate);
    const source = await loadValidatedTestRunSummary({
      receipt,
      expected: expectation,
    });
    const currentIdentity = await readIdentity();
    assertPinnedCleanIdentity(currentIdentity);
    if (!sameIdentity(initialIdentity, currentIdentity))
      throw new Error(
        `Measurement candidate or runtime changed during ${definition.id}.`,
      );
    sources.push(source);
    expectations.push(expectation);
    childReceiptPaths.push(receipt.receiptPath);
    summaryPaths.push(source.path);
    commandRecords.push({
      id: definition.id,
      script: definition.script,
      stageId: definition.stageId,
      commandId: definition.commandId,
      role: definition.role,
      owner: definition.owner,
      runId,
      artifactDirectory: `commands/${definition.id}`,
      receipt: {
        path: relative(artifactDirectory, receipt.receiptPath).replaceAll(
          "\\",
          "/",
        ),
        bytes: receipt.receiptBytes,
        sha256: receipt.receiptSha256,
      },
      summary: {
        path: relative(artifactDirectory, source.path).replaceAll("\\", "/"),
        bytes: source.bytes,
        sha256: source.sha256,
        contentSha256: source.summary.contentSha256,
      },
    });
  }

  const firstPlatform = sources[0]?.summary.platform;
  if (!firstPlatform)
    throw new Error("Measurement lane produced no summaries.");
  if (
    sources.some(
      (source) => !samePlatform(source.summary.platform, firstPlatform),
    )
  )
    throw new Error(
      "Measurement lane summaries disagree on platform provenance.",
    );
  if (
    firstPlatform.nodeVersion !== initialIdentity.nodeVersion ||
    firstPlatform.pnpmVersion !== initialIdentity.pnpmVersion
  )
    throw new Error("Measurement summary runtime contradicts lane identity.");
  if (
    pairedColdSource &&
    !samePlatform(pairedColdSource.record.platform, firstPlatform)
  )
    throw new Error("Warm lane platform differs from its paired cold lane.");

  const reduction = reduceTestRunSummaries({
    sources,
    expected: expectations,
    candidate,
    relativePath: (path) =>
      relative(artifactDirectory, path).replaceAll("\\", "/"),
  });
  const reductionPath = resolve(artifactDirectory, TEST_RUN_REDUCTION_NAME);
  await writeTestRunReduction(reductionPath, reduction);
  const reductionIdentity = await fileIdentity(
    artifactDirectory,
    reductionPath,
    "Measurement lane reduction",
  );
  const pairedColdIdentity = pairedColdCopyPath
    ? await fileIdentity(
        artifactDirectory,
        pairedColdCopyPath,
        "Paired cold measurement lane record",
      )
    : null;
  const finishedAt = (input.now ?? (() => new Date()))().toISOString();
  const base = {
    schemaVersion: MEASUREMENT_LANE_SCHEMA_VERSION,
    protocolId: MEASUREMENT_LANE_PROTOCOL_ID,
    status: "PASS" as const,
    laneRun: {
      laneRunId: input.laneRunId,
      ordinal: input.ordinal,
      classification: input.classification,
    },
    workspaceState: {
      workspaceId: input.workspaceId,
      classificationDefinition:
        input.classification === "cold" ? COLD_DEFINITION : WARM_DEFINITION,
      freshCheckout: input.classification === "cold",
      freshFrozenInstall: input.classification === "cold",
      reusesPairedColdWorkspace: input.classification === "warm",
      operatingSystemCaches: "uncontrolled-not-claimed" as const,
      repositoryPathSha256: workspace.repositoryPathSha256,
      dependencyInstall: {
        command: DEPENDENCY_INSTALL_COMMAND,
        lockfile: workspace.lockfile,
        modulesManifest: workspace.modulesManifest,
      },
    },
    candidate,
    platform: firstPlatform,
    executionContext,
    commandSet: {
      catalogueId: MEASUREMENT_COMMAND_CATALOGUE_ID,
      catalogueSha256: MEASUREMENT_COMMAND_CATALOGUE_SHA256,
      selectedCommandIds: selectedIds,
      selectedSetSha256: selectedSetSha256(selectedIds),
    },
    commands: commandRecords,
    reduction: {
      ...reductionIdentity,
      contentSha256: reduction.contentSha256,
      inputCount: reduction.inputCount,
      inputSetSha256: reduction.inputSetSha256,
    },
    pairedCold:
      pairedColdIdentity && pairedColdSource
        ? {
            ...pairedColdIdentity,
            laneRunId: pairedColdSource.record.laneRun.laneRunId,
            contentSha256: pairedColdSource.record.contentSha256,
          }
        : null,
    timestamps: { startedAt, finishedAt },
    nonSemantic: {
      changesTestSuccess: false as const,
      authorizesCutover: false as const,
      benchmarkClaim: false as const,
    },
  };
  const record = assertMeasurementLaneRecord({
    ...base,
    contentSha256: sha256(canonicalJson(base)),
  });
  const recordPath = resolve(artifactDirectory, MEASUREMENT_LANE_RECORD_NAME);
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  const reloaded = await loadMeasurementLaneRecord({
    path: recordPath,
    expected: {
      laneRunId: input.laneRunId,
      ordinal: input.ordinal,
      classification: input.classification,
      workspaceId: input.workspaceId,
      selectedCommandIds: selectedIds,
      candidate,
    },
  });
  return {
    recordPath,
    record: reloaded.record,
    reductionPath,
    pairedColdCopyPath,
    childReceiptPaths,
    summaryPaths,
  };
}

function matchesFileIdentity(
  actual: MeasurementLaneFileIdentity,
  expected: MeasurementLaneFileIdentity,
): boolean {
  return (
    actual.path === expected.path &&
    actual.bytes === expected.bytes &&
    actual.sha256 === expected.sha256
  );
}

export async function validateMeasurementLaneArtifacts(
  recordPath: string,
): Promise<LoadedMeasurementLaneRecord> {
  const loaded = await loadMeasurementLaneRecord({ path: recordPath });
  const root = resolve(loaded.path, "..");
  const sources: ValidatedTestRunSummarySource[] = [];
  const expectations: TestRunSummaryExpectation[] = [];
  for (const command of loaded.record.commands) {
    const definition = MEASUREMENT_COMMANDS.find(
      (item) => item.id === command.id,
    );
    if (!definition)
      throw new Error(`Measured command disappeared: ${command.id}.`);
    const receipt = await validateCommandReceiptDirectory({
      directory: resolve(root, command.artifactDirectory),
      expectedStageId: command.stageId,
      expectedCommandId: command.commandId,
      requiredKinds: definition.requiredKinds,
    });
    const receiptIdentity = await fileIdentity(
      root,
      receipt.receiptPath,
      "Lane child receipt",
    );
    if (!matchesFileIdentity(receiptIdentity, command.receipt))
      throw new Error(`Lane child receipt drifted for ${command.id}.`);
    const expectation = childExpectation(
      definition,
      command.runId,
      loaded.record.candidate,
    );
    const source = await loadValidatedTestRunSummary({
      receipt,
      expected: expectation,
    });
    const sourceIdentity = await fileIdentity(
      root,
      source.path,
      "Lane test-run summary",
    );
    if (
      !matchesFileIdentity(sourceIdentity, command.summary) ||
      source.summary.contentSha256 !== command.summary.contentSha256
    )
      throw new Error(`Lane summary drifted for ${command.id}.`);
    sources.push(source);
    expectations.push(expectation);
  }
  const reductionPath = resolve(root, loaded.record.reduction.path);
  const reductionIdentity = await fileIdentity(
    root,
    reductionPath,
    "Lane reduction",
  );
  if (!matchesFileIdentity(reductionIdentity, loaded.record.reduction))
    throw new Error("Lane reduction bytes or hash drifted.");
  const retainedReduction = assertTestRunReduction(
    JSON.parse(await readFile(reductionPath, "utf8")) as unknown,
  );
  const reproduced = reduceTestRunSummaries({
    sources,
    expected: expectations,
    candidate: loaded.record.candidate,
    relativePath: (path) => relative(root, path).replaceAll("\\", "/"),
  });
  if (
    canonicalJson(retainedReduction) !== canonicalJson(reproduced) ||
    retainedReduction.contentSha256 !== loaded.record.reduction.contentSha256 ||
    retainedReduction.inputSetSha256 !== loaded.record.reduction.inputSetSha256
  )
    throw new Error("Lane reduction does not reproduce from its summaries.");
  if (loaded.record.pairedCold) {
    const pairedPath = resolve(root, loaded.record.pairedCold.path);
    const pairedIdentity = await fileIdentity(
      root,
      pairedPath,
      "Paired cold lane record",
    );
    if (!matchesFileIdentity(pairedIdentity, loaded.record.pairedCold))
      throw new Error("Paired cold lane record bytes or hash drifted.");
    const paired = await loadMeasurementLaneRecord({ path: pairedPath });
    if (
      paired.record.laneRun.laneRunId !== loaded.record.pairedCold.laneRunId ||
      paired.record.contentSha256 !== loaded.record.pairedCold.contentSha256
    )
      throw new Error("Paired cold lane semantic identity drifted.");
    pairedColdMatchesWarm({
      cold: paired.record,
      ordinal: loaded.record.laneRun.ordinal,
      workspaceId: loaded.record.workspaceState.workspaceId,
      selectedCommandIds: loaded.record.commandSet.selectedCommandIds,
      candidate: loaded.record.candidate,
      workspace: {
        repositoryPathSha256: loaded.record.workspaceState.repositoryPathSha256,
        lockfile: loaded.record.workspaceState.dependencyInstall.lockfile,
        modulesManifest:
          loaded.record.workspaceState.dependencyInstall.modulesManifest,
      },
    });
    if (
      !samePlatform(paired.record.platform, loaded.record.platform) ||
      canonicalJson(paired.record.executionContext) !==
        canonicalJson(loaded.record.executionContext)
    )
      throw new Error(
        "Warm lane platform or hosted-job provenance differs from its paired cold lane.",
      );
  }
  return loaded;
}

export function measurementLaneArtifactKinds(): Readonly<{
  readonly record: typeof MEASUREMENT_LANE_RECORD_KIND;
  readonly reduction: typeof TEST_RUN_REDUCTION_KIND;
  readonly childReceipt: typeof MEASUREMENT_LANE_CHILD_RECEIPT_KIND;
  readonly summary: typeof TEST_RUN_SUMMARY_KIND;
  readonly pairedCold: typeof MEASUREMENT_LANE_PAIRED_COLD_RECORD_KIND;
}> {
  return {
    record: MEASUREMENT_LANE_RECORD_KIND,
    reduction: TEST_RUN_REDUCTION_KIND,
    childReceipt: MEASUREMENT_LANE_CHILD_RECEIPT_KIND,
    summary: TEST_RUN_SUMMARY_KIND,
    pairedCold: MEASUREMENT_LANE_PAIRED_COLD_RECORD_KIND,
  };
}
