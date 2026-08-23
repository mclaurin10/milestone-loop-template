import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  auditBootstrapVerification,
  type ProofFileIdentity,
} from "../src/adopter-package-proof.js";

export const FRESH_ADOPTER_CI_SMOKE_SCHEMA_VERSION =
  "fresh-adopter-ci-smoke.v2" as const;

const EXPECTED_NODE_VERSION = "v24.18.0";
const EXPECTED_PNPM_VERSION = "11.15.1";
const COMMISSIONING_INPUT_PATH =
  "tools/milestone-orchestrator/config/commissioning-input.json";
const ACTIVE_MANIFEST_PATH = ".agent/verification-manifest.json";
const MANIFEST_COMMIT_MESSAGE = "activate bootstrap verification manifest";
const READINESS_MARKER_PATH = ".agent/readiness-profile-activated.json";
const CONFIG_SCHEMA_PATH =
  "tools/milestone-orchestrator/schemas/orchestrator-config.schema.json";
const POLICY_SCHEMA_PATH =
  "tools/milestone-orchestrator/schemas/model-policy.schema.json";

export const FRESH_ADOPTER_QUICKSTART_COMMAND_IDS = [
  "template-create",
  "install",
  "commission",
  "manifest-add",
  "manifest-commit",
  "no-argument-verify",
] as const;

type JsonRecord = Record<string, unknown>;
type QuickstartCommandId =
  (typeof FRESH_ADOPTER_QUICKSTART_COMMAND_IDS)[number];
type QuickstartCommandScope = "source-checkout" | "generated-repository";

export interface FreshAdopterSmokeArguments {
  readonly definitionPath: string;
  readonly outputPath: string;
}

export interface FreshAdopterQuickstartCommand {
  readonly id: QuickstartCommandId;
  readonly scope: QuickstartCommandScope;
  readonly argv: readonly string[];
  readonly displayArgv: readonly string[];
}

export interface FreshAdopterCommandLedgerEntry {
  readonly order: number;
  readonly id: QuickstartCommandId;
  readonly scope: QuickstartCommandScope;
  readonly argv: readonly string[];
  readonly status: "PASS";
  readonly exitCode: 0;
  readonly durationMs: number;
}

export interface GeneratedRepositoryObservation {
  readonly branch: string;
  readonly commitCount: number;
  readonly status: string;
  readonly defaultProfile: string;
  readonly packageManager: string;
  readonly readinessMarkerTree: boolean;
  readonly readinessMarkerHistory: boolean;
  readonly configuredUserName: string;
  readonly configuredUserEmail: string;
  readonly manifestCommit: {
    readonly commit: string;
    readonly tree: string;
    readonly subject: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: string;
    readonly committerName: string;
    readonly committerEmail: string;
    readonly committerDate: string;
  };
}

interface CommandCapture {
  readonly id: string;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface PnpmInvocation {
  readonly executable: string;
  readonly prefixArguments: readonly string[];
}

export interface SourcePnpmStoreInvocation {
  readonly id: "pnpm-store-path";
  readonly args: readonly ["store", "path"];
  readonly cwd: string;
}

export type SourcePnpmStoreRunner = (
  invocation: SourcePnpmStoreInvocation,
) => Promise<Pick<CommandCapture, "stdout">>;

export interface FreshAdopterTemporaryRootDependencies {
  readonly createTemporaryRoot?: (prefix: string) => Promise<string>;
  readonly canonicalizeTemporaryRoot?: (path: string) => Promise<string>;
}

export async function createCanonicalFreshAdopterTemporaryRoot(
  dependencies: FreshAdopterTemporaryRootDependencies = {},
): Promise<string> {
  const createTemporaryRoot = dependencies.createTemporaryRoot ?? mkdtemp;
  const canonicalizeTemporaryRoot =
    dependencies.canonicalizeTemporaryRoot ?? realpath;
  return canonicalizeTemporaryRoot(
    await createTemporaryRoot(join(tmpdir(), "fresh-adopter-ci-")),
  );
}

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): JsonRecord {
  assertion(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} must be an object.`,
  );
  return value as JsonRecord;
}

function stringValue(value: unknown, label: string): string {
  assertion(
    typeof value === "string" && value.length > 0,
    `${label} must be a nonempty string.`,
  );
  return value;
}

function integer(value: unknown, label: string): number {
  assertion(
    Number.isSafeInteger(value) && (value as number) >= 0,
    `${label} must be a nonnegative safe integer.`,
  );
  return value as number;
}

function exact(value: unknown, expected: unknown, label: string): void {
  assertion(
    value === expected,
    `${label} must equal ${JSON.stringify(expected)}, got ${JSON.stringify(value)}.`,
  );
}

function exactStringArray(
  value: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  assertion(
    value.length === expected.length &&
      value.every((entry, index) => entry === expected[index]),
    `${label} must equal ${JSON.stringify(expected)}, got ${JSON.stringify(value)}.`,
  );
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}

function containedPath(root: string, value: string, label: string): string {
  assertion(
    value.length > 0 && !isAbsolute(value) && !value.includes("\0"),
    `${label} must be a nonempty relative path.`,
  );
  const absolute = resolve(root, value);
  const contained = relative(root, absolute);
  assertion(
    contained.length > 0 &&
      !contained.startsWith("..") &&
      !isAbsolute(contained) &&
      !contained.split(sep).includes(".."),
    `${label} escapes its root.`,
  );
  return absolute;
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
}

async function regularFileIdentity(
  root: string,
  path: string,
  kind: string,
): Promise<ProofFileIdentity> {
  const absolute = containedPath(root, path, `${kind} path`);
  const metadata = await lstat(absolute);
  assertion(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${kind} must be a regular non-symlink file: ${path}.`,
  );
  const contents = await readFile(absolute);
  return {
    path: slash(path),
    kind,
    bytes: contents.byteLength,
    sha256: sha256(contents),
  };
}

export function parseFreshAdopterSmokeArguments(
  values: readonly string[],
): FreshAdopterSmokeArguments {
  let definitionPath: string | undefined;
  let outputPath: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    assertion(
      option === "--definition" || option === "--output",
      `Unknown fresh-adopter CI smoke option: ${option ?? "(missing)"}.`,
    );
    const value = values[index + 1];
    assertion(
      value !== undefined && value.length > 0 && !value.startsWith("--"),
      `${option} requires one path.`,
    );
    index += 1;
    if (option === "--definition") {
      assertion(
        definitionPath === undefined,
        "--definition may be supplied only once.",
      );
      definitionPath = value;
    } else {
      assertion(
        outputPath === undefined,
        "--output may be supplied only once.",
      );
      outputPath = value;
    }
  }
  assertion(
    definitionPath !== undefined && outputPath !== undefined,
    "Fresh-adopter CI smoke requires --definition <file> and --output <absent-artifacts-directory>.",
  );
  return { definitionPath, outputPath };
}

function runCommand(
  id: string,
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): CommandCapture {
  const started = Date.now();
  const result = spawnSync(executable, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    id,
    durationMs: Date.now() - started,
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr:
      result.stderr ??
      (result.error ? `${result.error.name}: ${result.error.message}\n` : ""),
  };
}

async function writeCapture(
  outputRoot: string,
  capture: CommandCapture,
): Promise<void> {
  const logRoot = resolve(outputRoot, "logs");
  await mkdir(logRoot, { recursive: true });
  await Promise.all([
    writeFile(resolve(logRoot, `${capture.id}.stdout.log`), capture.stdout, {
      encoding: "utf8",
      flag: "wx",
    }),
    writeFile(resolve(logRoot, `${capture.id}.stderr.log`), capture.stderr, {
      encoding: "utf8",
      flag: "wx",
    }),
  ]);
}

function commandFailure(capture: CommandCapture): Error {
  const detail = (capture.stderr || capture.stdout)
    .replaceAll(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, 2_000);
  return new Error(
    `${capture.id} failed with exit ${capture.exitCode}${detail ? `: ${detail}` : "."}`,
  );
}

async function runChecked(
  outputRoot: string,
  id: string,
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): Promise<CommandCapture> {
  const capture = runCommand(id, executable, args, options);
  await writeCapture(outputRoot, capture);
  if (capture.exitCode !== 0) throw commandFailure(capture);
  return capture;
}

function git(repositoryRoot: string, args: readonly string[]): string {
  const result = runCommand("git", "git", ["-C", repositoryRoot, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (result.exitCode !== 0) throw commandFailure(result);
  return result.stdout.trim();
}

function absolutePnpmStorePath(value: string): string {
  assertion(
    value.length > 0 && isAbsolute(value),
    "pnpm store path must be one absolute path.",
  );
  return resolve(value);
}

export function parsePnpmStorePath(stdout: string): string {
  const paths = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  assertion(
    paths.length === 1,
    "pnpm store path must emit exactly one non-empty path.",
  );
  return absolutePnpmStorePath(paths[0]!);
}

export async function resolveSourcePnpmStorePath(
  sourceRoot: string,
  run: SourcePnpmStoreRunner,
): Promise<string> {
  const capture = await run({
    id: "pnpm-store-path",
    args: ["store", "path"],
    cwd: sourceRoot,
  });
  return parsePnpmStorePath(capture.stdout);
}

export function generatedOfflineInstallArguments(
  sourceStorePath: string,
): readonly string[] {
  return [
    "install",
    "--offline",
    "--frozen-lockfile",
    "--package-import-method=copy",
    "--store-dir",
    absolutePnpmStorePath(sourceStorePath),
  ];
}

export function generatedRepositoryEnvironment(
  sourceStorePath: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...baseEnvironment };
  for (const key of Object.keys(environment)) {
    if (
      key.toLowerCase() === "ci" ||
      key.toLowerCase() === "npm_config_store_dir" ||
      key.toLowerCase() === "pnpm_config_store_dir"
    )
      delete environment[key];
  }
  return {
    ...environment,
    CI: "true",
    pnpm_config_store_dir: absolutePnpmStorePath(sourceStorePath),
  };
}

function pnpmInvocation(): PnpmInvocation {
  const value = process.env["npm_execpath"];
  if (value !== undefined && isAbsolute(value) && existsSync(value))
    return { executable: process.execPath, prefixArguments: [resolve(value)] };

  const corepackPath = resolve(
    dirname(process.execPath),
    process.platform === "win32" ? "corepack.cmd" : "corepack",
  );
  assertion(
    existsSync(corepackPath),
    "Fresh-adopter CI smoke requires the Corepack executable distributed with pinned Node.",
  );
  if (process.platform === "win32")
    return {
      executable: process.env["ComSpec"] ?? "cmd.exe",
      prefixArguments: ["/d", "/s", "/c", corepackPath, "pnpm"],
    };
  return { executable: corepackPath, prefixArguments: ["pnpm"] };
}

async function runPnpm(
  outputRoot: string,
  id: string,
  pnpm: PnpmInvocation,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = 600_000,
): Promise<CommandCapture> {
  return runChecked(
    outputRoot,
    id,
    pnpm.executable,
    [...pnpm.prefixArguments, ...args],
    { cwd, env, timeoutMs },
  );
}

function parseStructuredOutput(stdout: string, label: string): JsonRecord {
  const start = stdout.indexOf("{");
  assertion(start >= 0, `${label} emitted no JSON object.`);
  try {
    return record(JSON.parse(stdout.slice(start)), label);
  } catch (error) {
    throw new Error(
      `${label} emitted malformed JSON: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
}

function expectedQuickstartCommands(input: {
  readonly definitionPath: string;
  readonly definitionDisplayPath: string;
  readonly repositoryRoot: string;
  readonly sourceStorePath: string;
}): readonly FreshAdopterQuickstartCommand[] {
  const installArguments = generatedOfflineInstallArguments(
    input.sourceStorePath,
  );
  return [
    {
      id: "template-create",
      scope: "source-checkout",
      argv: [
        "pnpm",
        "loop:template:create",
        "--",
        "--definition",
        input.definitionPath,
        "--output",
        input.repositoryRoot,
      ],
      displayArgv: [
        "pnpm",
        "loop:template:create",
        "--",
        "--definition",
        slash(input.definitionDisplayPath),
        "--output",
        "<generated-repository>",
      ],
    },
    {
      id: "install",
      scope: "generated-repository",
      argv: ["pnpm", ...installArguments],
      displayArgv: [
        "pnpm",
        "install",
        "--offline",
        "--frozen-lockfile",
        "--package-import-method=copy",
        "--store-dir",
        "<source-pnpm-store>",
      ],
    },
    {
      id: "commission",
      scope: "generated-repository",
      argv: [
        "pnpm",
        "loop:commission",
        "--",
        "--input",
        COMMISSIONING_INPUT_PATH,
      ],
      displayArgv: [
        "pnpm",
        "loop:commission",
        "--",
        "--input",
        COMMISSIONING_INPUT_PATH,
      ],
    },
    {
      id: "manifest-add",
      scope: "generated-repository",
      argv: ["git", "add", ACTIVE_MANIFEST_PATH],
      displayArgv: ["git", "add", ACTIVE_MANIFEST_PATH],
    },
    {
      id: "manifest-commit",
      scope: "generated-repository",
      argv: ["git", "commit", "-m", MANIFEST_COMMIT_MESSAGE],
      displayArgv: ["git", "commit", "-m", MANIFEST_COMMIT_MESSAGE],
    },
    {
      id: "no-argument-verify",
      scope: "generated-repository",
      argv: ["pnpm", "verify"],
      displayArgv: ["pnpm", "verify"],
    },
  ];
}

export function assertFreshAdopterQuickstartPlan(
  commands: readonly FreshAdopterQuickstartCommand[],
  input: {
    readonly definitionPath: string;
    readonly definitionDisplayPath: string;
    readonly repositoryRoot: string;
    readonly sourceStorePath: string;
  },
): void {
  const expected = expectedQuickstartCommands(input);
  exact(
    commands.length,
    FRESH_ADOPTER_QUICKSTART_COMMAND_IDS.length,
    "quickstart command count",
  );
  for (const [index, expectedCommand] of expected.entries()) {
    const command = commands[index];
    assertion(command !== undefined, `quickstart command ${index + 1} exists`);
    exact(command.id, expectedCommand.id, `quickstart[${index}].id`);
    exact(command.scope, expectedCommand.scope, `quickstart[${index}].scope`);
    exactStringArray(
      command.argv,
      expectedCommand.argv,
      `quickstart[${index}].argv`,
    );
    exactStringArray(
      command.displayArgv,
      expectedCommand.displayArgv,
      `quickstart[${index}].displayArgv`,
    );
  }
  const verifyCommands = commands.filter(
    (command) => command.argv[0] === "pnpm" && command.argv[1] === "verify",
  );
  exact(verifyCommands.length, 1, "no-argument verify command count");
  exact(
    verifyCommands[0]?.scope,
    "generated-repository",
    "no-argument verify command scope",
  );
  exactStringArray(
    verifyCommands[0]?.argv ?? [],
    ["pnpm", "verify"],
    "literal no-argument verify argv",
  );
  assertion(
    !commands.some(
      (command) =>
        command.scope === "source-checkout" &&
        command.argv[0] === "pnpm" &&
        command.argv[1] === "verify",
    ),
    "Fresh-adopter quickstart may not invoke source no-argument pnpm verify.",
  );
}

export function createFreshAdopterQuickstartPlan(input: {
  readonly definitionPath: string;
  readonly definitionDisplayPath: string;
  readonly repositoryRoot: string;
  readonly sourceStorePath: string;
}): readonly FreshAdopterQuickstartCommand[] {
  const commands = expectedQuickstartCommands(input);
  assertFreshAdopterQuickstartPlan(commands, input);
  return commands;
}

export function createFreshAdopterCommandLedger(
  commands: readonly FreshAdopterQuickstartCommand[],
  captures: readonly CommandCapture[],
): readonly FreshAdopterCommandLedgerEntry[] {
  exact(captures.length, commands.length, "quickstart capture count");
  const ledger = commands.map((command, index) => {
    const capture = captures[index];
    assertion(capture !== undefined, `quickstart capture ${index + 1} exists`);
    exact(capture.id, command.id, `quickstart capture ${index + 1} id`);
    exact(capture.exitCode, 0, `${command.id} exit code`);
    return {
      order: index + 1,
      id: command.id,
      scope: command.scope,
      argv: command.displayArgv,
      status: "PASS" as const,
      exitCode: 0 as const,
      durationMs: capture.durationMs,
    };
  });
  assertFreshAdopterCommandLedger(ledger, commands);
  return ledger;
}

export function assertFreshAdopterCommandLedger(
  ledger: readonly FreshAdopterCommandLedgerEntry[],
  commands: readonly FreshAdopterQuickstartCommand[],
): void {
  exact(ledger.length, commands.length, "quickstart ledger count");
  for (const [index, command] of commands.entries()) {
    const entry = ledger[index];
    assertion(entry !== undefined, `quickstart ledger ${index + 1} exists`);
    exact(entry.order, index + 1, `quickstart ledger ${index}.order`);
    exact(entry.id, command.id, `quickstart ledger ${index}.id`);
    exact(entry.scope, command.scope, `quickstart ledger ${index}.scope`);
    exactStringArray(entry.argv, command.displayArgv, `ledger ${index}.argv`);
    exact(entry.status, "PASS", `quickstart ledger ${index}.status`);
    exact(entry.exitCode, 0, `quickstart ledger ${index}.exitCode`);
    integer(entry.durationMs, `quickstart ledger ${index}.durationMs`);
  }
}

async function auditCommissioningPublication(
  repositoryRoot: string,
  stdout: string,
): Promise<ProofFileIdentity> {
  const commissioning = parseStructuredOutput(stdout, "commissioning result");
  exact(
    commissioning["schemaVersion"],
    "loop-commissioning-result.v1",
    "commissioning.schemaVersion",
  );
  exact(commissioning["status"], "PASS", "commissioning.status");
  const generatedFiles = commissioning["generatedFiles"];
  assertion(
    Array.isArray(generatedFiles),
    "commissioning.generatedFiles must be an array.",
  );
  exact(generatedFiles.length, 1, "commissioning generated file count");
  const declaration = record(
    generatedFiles[0],
    "commissioning.generatedFiles[0]",
  );
  exact(
    declaration["path"],
    ACTIVE_MANIFEST_PATH,
    "commissioning manifest path",
  );
  const identity = await regularFileIdentity(
    repositoryRoot,
    ACTIVE_MANIFEST_PATH,
    "verification-manifest",
  );
  exact(declaration["bytes"], identity.bytes, "commissioning manifest bytes");
  exact(
    declaration["sha256"],
    identity.sha256,
    "commissioning manifest sha256",
  );
  const untracked = git(repositoryRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean)
    .map(slash);
  exactStringArray(
    untracked,
    [ACTIVE_MANIFEST_PATH],
    "commissioning untracked surface",
  );
  exact(git(repositoryRoot, ["diff", "--name-only"]), "", "tracked diff");
  exact(
    git(repositoryRoot, ["diff", "--cached", "--name-only"]),
    "",
    "staged diff",
  );
  return identity;
}

export function assertGeneratedRepositoryObservation(
  observation: GeneratedRepositoryObservation,
  expected: {
    readonly branch: string;
    readonly userName: string;
    readonly userEmail: string;
    readonly commitTimestamp: string;
  },
): void {
  exact(observation.branch, expected.branch, "generated branch");
  exact(observation.commitCount, 3, "generated commit count");
  exact(observation.status, "", "generated Git status");
  exact(observation.defaultProfile, "bootstrap", "generated default profile");
  exact(
    observation.packageManager,
    `pnpm@${EXPECTED_PNPM_VERSION}`,
    "generated package manager",
  );
  exact(
    observation.readinessMarkerTree,
    false,
    "generated readiness marker tree",
  );
  exact(
    observation.readinessMarkerHistory,
    false,
    "generated readiness marker history",
  );
  exact(
    observation.configuredUserName,
    expected.userName,
    "generated configured Git user name",
  );
  exact(
    observation.configuredUserEmail,
    expected.userEmail,
    "generated configured Git user email",
  );
  exact(
    observation.manifestCommit.subject,
    MANIFEST_COMMIT_MESSAGE,
    "manifest commit subject",
  );
  exact(
    observation.manifestCommit.authorName,
    expected.userName,
    "manifest commit author name",
  );
  exact(
    observation.manifestCommit.authorEmail,
    expected.userEmail,
    "manifest commit author email",
  );
  exact(
    observation.manifestCommit.committerName,
    expected.userName,
    "manifest commit committer name",
  );
  exact(
    observation.manifestCommit.committerEmail,
    expected.userEmail,
    "manifest commit committer email",
  );
  exact(
    Date.parse(observation.manifestCommit.authorDate),
    Date.parse(expected.commitTimestamp),
    "manifest commit author timestamp",
  );
  exact(
    Date.parse(observation.manifestCommit.committerDate),
    Date.parse(expected.commitTimestamp),
    "manifest commit committer timestamp",
  );
  assertion(
    /^[0-9a-f]{40}$/u.test(observation.manifestCommit.commit) &&
      /^[0-9a-f]{40}$/u.test(observation.manifestCommit.tree),
    "Manifest commit and tree must be full Git object IDs.",
  );
}

async function observeGeneratedRepository(
  repositoryRoot: string,
): Promise<GeneratedRepositoryObservation> {
  const packageJson = record(
    await readJson(
      resolve(repositoryRoot, "package.json"),
      "generated package",
    ),
    "generated package",
  );
  const verification = record(
    record(packageJson["milestoneLoop"], "generated milestoneLoop")[
      "verification"
    ],
    "generated verification",
  );
  const commitFields = git(repositoryRoot, [
    "log",
    "-1",
    "--format=%H%x00%T%x00%s%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI",
  ]).split("\0");
  exact(commitFields.length, 9, "manifest commit field count");
  return {
    branch: git(repositoryRoot, ["branch", "--show-current"]),
    commitCount: Number(git(repositoryRoot, ["rev-list", "--count", "HEAD"])),
    status: git(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]),
    defaultProfile: stringValue(
      verification["defaultProfile"],
      "generated default profile",
    ),
    packageManager: stringValue(
      packageJson["packageManager"],
      "generated package manager",
    ),
    readinessMarkerTree: existsSync(
      resolve(repositoryRoot, READINESS_MARKER_PATH),
    ),
    readinessMarkerHistory:
      git(repositoryRoot, [
        "log",
        "--all",
        "--format=%H",
        "--",
        READINESS_MARKER_PATH,
      ]).length > 0,
    configuredUserName: git(repositoryRoot, ["config", "--get", "user.name"]),
    configuredUserEmail: git(repositoryRoot, ["config", "--get", "user.email"]),
    manifestCommit: {
      commit: commitFields[0] ?? "",
      tree: commitFields[1] ?? "",
      subject: commitFields[2] ?? "",
      authorName: commitFields[3] ?? "",
      authorEmail: commitFields[4] ?? "",
      authorDate: commitFields[5] ?? "",
      committerName: commitFields[6] ?? "",
      committerEmail: commitFields[7] ?? "",
      committerDate: commitFields[8] ?? "",
    },
  };
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  assertion(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${label} must be a regular non-symlink file.`,
  );
}

async function verificationDirectories(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const artifactRoot = resolve(repositoryRoot, "artifacts");
  if (!existsSync(artifactRoot)) return [];
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("verify-"))
    .map((entry) => entry.name)
    .sort();
}

async function regularFileInventory(
  root: string,
): Promise<readonly ProofFileIdentity[]> {
  const inventory: ProofFileIdentity[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const metadata = await lstat(absolute);
      assertion(
        !metadata.isSymbolicLink(),
        `Retained verification evidence contains a symbolic link: ${slash(relative(root, absolute))}.`,
      );
      if (metadata.isDirectory()) await walk(absolute);
      else {
        assertion(
          metadata.isFile(),
          `Retained verification evidence contains a special file: ${slash(relative(root, absolute))}.`,
        );
        const contents = await readFile(absolute);
        inventory.push({
          path: slash(relative(root, absolute)),
          kind: "retained-verification-file",
          bytes: contents.byteLength,
          sha256: sha256(contents),
        });
      }
    }
  }
  await walk(root);
  assertion(inventory.length > 0, "Verification evidence inventory is empty.");
  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

function assertMatchingInventory(
  source: readonly ProofFileIdentity[],
  retained: readonly ProofFileIdentity[],
): void {
  exact(retained.length, source.length, "retained verification file count");
  for (const [index, expected] of source.entries()) {
    const actual = retained[index];
    assertion(actual !== undefined, `retained evidence file ${index} exists`);
    exact(actual.path, expected.path, `retained evidence ${index}.path`);
    exact(actual.bytes, expected.bytes, `retained evidence ${index}.bytes`);
    exact(actual.sha256, expected.sha256, `retained evidence ${index}.sha256`);
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

export async function runFreshAdopterCiSmoke(
  args: FreshAdopterSmokeArguments,
): Promise<JsonRecord> {
  assertion(
    process.version === EXPECTED_NODE_VERSION,
    `Fresh-adopter CI smoke requires Node ${EXPECTED_NODE_VERSION}, got ${process.version}.`,
  );
  const sourceRoot = resolve(import.meta.dirname, "../../..");
  const definitionPath = resolve(sourceRoot, args.definitionPath);
  await assertRegularFile(definitionPath, "Adopter definition");
  const definition = record(
    await readJson(definitionPath, "adopter definition"),
    "adopter definition",
  );
  const definitionProject = record(
    definition["project"],
    "adopter definition project",
  );
  const definitionGit = record(definition["git"], "adopter definition git");
  const expectedBranch = stringValue(
    definitionProject["targetBranch"],
    "adopter target branch",
  );
  const expectedUserName = stringValue(
    definitionGit["userName"],
    "adopter Git user name",
  );
  const expectedUserEmail = stringValue(
    definitionGit["userEmail"],
    "adopter Git user email",
  );
  const definitionTimestamp = stringValue(
    definitionGit["timestamp"],
    "adopter Git timestamp",
  );
  const commitTimestamp = new Date(
    Date.parse(definitionTimestamp) + 2 * 60_000,
  ).toISOString();

  const outputRoot = resolve(sourceRoot, args.outputPath);
  const outputRelative = slash(relative(sourceRoot, outputRoot));
  assertion(
    outputRelative.startsWith("artifacts/") &&
      !isAbsolute(outputRelative) &&
      !outputRelative.split("/").includes(".."),
    "Fresh-adopter CI smoke output must be a repository-relative artifacts/ directory.",
  );
  assertion(
    !existsSync(outputRoot),
    `Fresh-adopter CI smoke output already exists: ${outputRelative}.`,
  );
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });

  const startedAt = new Date();
  const sourceBefore = {
    head: git(sourceRoot, ["rev-parse", "HEAD"]),
    tree: git(sourceRoot, ["rev-parse", "HEAD^{tree}"]),
    status: git(sourceRoot, [
      "status",
      "--porcelain=v2",
      "--untracked-files=all",
    ]),
  };
  const pnpm = pnpmInvocation();
  const versionCapture = await runPnpm(
    outputRoot,
    "pnpm-version",
    pnpm,
    ["--version"],
    sourceRoot,
    process.env,
  );
  exact(
    versionCapture.stdout.trim(),
    EXPECTED_PNPM_VERSION,
    "fresh-adopter smoke pnpm version",
  );
  const sourceStorePath = await resolveSourcePnpmStorePath(
    sourceRoot,
    async (invocation) =>
      runPnpm(
        outputRoot,
        invocation.id,
        pnpm,
        invocation.args,
        invocation.cwd,
        process.env,
      ),
  );
  const sourceStoreMetadata = await lstat(sourceStorePath);
  assertion(
    sourceStoreMetadata.isDirectory(),
    "Resolved pnpm store path must be an existing directory.",
  );

  const temporaryRoot = await createCanonicalFreshAdopterTemporaryRoot();
  const repositoryRoot = resolve(temporaryRoot, "repository");
  const commands = createFreshAdopterQuickstartPlan({
    definitionPath,
    definitionDisplayPath: args.definitionPath,
    repositoryRoot,
    sourceStorePath,
  });
  let primaryError: Error | null = null;
  let result: JsonRecord | null = null;
  try {
    const captures: CommandCapture[] = [];
    const createCommand = commands[0]!;
    const createCapture = await runPnpm(
      outputRoot,
      createCommand.id,
      pnpm,
      createCommand.argv.slice(1),
      sourceRoot,
      process.env,
      600_000,
    );
    captures.push(createCapture);
    const packageResult = parseStructuredOutput(
      createCapture.stdout,
      "adopter package creator",
    );

    const childEnvironment = generatedRepositoryEnvironment(sourceStorePath);
    const installCommand = commands[1]!;
    captures.push(
      await runPnpm(
        outputRoot,
        installCommand.id,
        pnpm,
        installCommand.argv.slice(1),
        repositoryRoot,
        childEnvironment,
        900_000,
      ),
    );

    const commissionCommand = commands[2]!;
    const commissionCapture = await runPnpm(
      outputRoot,
      commissionCommand.id,
      pnpm,
      commissionCommand.argv.slice(1),
      repositoryRoot,
      childEnvironment,
      600_000,
    );
    captures.push(commissionCapture);
    const manifestIdentity = await auditCommissioningPublication(
      repositoryRoot,
      commissionCapture.stdout,
    );

    const addCommand = commands[3]!;
    captures.push(
      await runChecked(
        outputRoot,
        addCommand.id,
        "git",
        ["-C", repositoryRoot, ...addCommand.argv.slice(1)],
        { cwd: repositoryRoot, env: childEnvironment },
      ),
    );
    const commitCommand = commands[4]!;
    const commitEnvironment = {
      ...childEnvironment,
      GIT_AUTHOR_DATE: commitTimestamp,
      GIT_COMMITTER_DATE: commitTimestamp,
    };
    captures.push(
      await runChecked(
        outputRoot,
        commitCommand.id,
        "git",
        ["-C", repositoryRoot, ...commitCommand.argv.slice(1)],
        { cwd: repositoryRoot, env: commitEnvironment },
      ),
    );

    const repositoryObservation =
      await observeGeneratedRepository(repositoryRoot);
    assertGeneratedRepositoryObservation(repositoryObservation, {
      branch: expectedBranch,
      userName: expectedUserName,
      userEmail: expectedUserEmail,
      commitTimestamp,
    });
    await Promise.all([
      assertRegularFile(
        resolve(repositoryRoot, CONFIG_SCHEMA_PATH),
        "Config schema",
      ),
      assertRegularFile(
        resolve(repositoryRoot, POLICY_SCHEMA_PATH),
        "Policy schema",
      ),
    ]);
    exact(
      (await verificationDirectories(repositoryRoot)).length,
      0,
      "pre-verification run directory count",
    );

    const verifyCommand = commands[5]!;
    captures.push(
      await runPnpm(
        outputRoot,
        verifyCommand.id,
        pnpm,
        verifyCommand.argv.slice(1),
        repositoryRoot,
        childEnvironment,
        1_800_000,
      ),
    );
    const verifyDirectories = await verificationDirectories(repositoryRoot);
    exact(
      verifyDirectories.length,
      1,
      "generated no-argument verification run directory count",
    );
    const verificationRoot = resolve(
      repositoryRoot,
      "artifacts",
      verifyDirectories[0] ?? "",
    );
    const retainedVerificationRoot = resolve(outputRoot, "verification");
    await cp(verificationRoot, retainedVerificationRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const [sourceVerificationInventory, retainedVerificationInventory] =
      await Promise.all([
        regularFileInventory(verificationRoot),
        regularFileInventory(retainedVerificationRoot),
      ]);
    assertMatchingInventory(
      sourceVerificationInventory,
      retainedVerificationInventory,
    );

    const candidateCommit = repositoryObservation.manifestCommit.commit;
    const candidateTree = repositoryObservation.manifestCommit.tree;
    const verificationAudit = await auditBootstrapVerification({
      repositoryRoot,
      verificationRoot: retainedVerificationRoot,
      expectedCommit: candidateCommit,
      expectedTree: candidateTree,
    });
    await writeJson(resolve(outputRoot, "receipt-audit.json"), {
      schemaVersion: "fresh-adopter-ci-receipt-audit.v2",
      status: "PASS",
      candidateCommit,
      candidateTree,
      stageCount: verificationAudit.stageCount,
      receiptCount: verificationAudit.receiptCount,
      artifactCount: verificationAudit.artifactCount,
      artifactBytes: verificationAudit.artifactBytes,
      testCount: verificationAudit.testCount,
      retainedFileCount: retainedVerificationInventory.length,
      retainedBytes: retainedVerificationInventory.reduce(
        (total, entry) => total + entry.bytes,
        0,
      ),
      inventory: verificationAudit.inventory,
      retainedInventory: retainedVerificationInventory,
    });

    const commandLedger = createFreshAdopterCommandLedger(commands, captures);
    result = {
      schemaVersion: FRESH_ADOPTER_CI_SMOKE_SCHEMA_VERSION,
      status: "PASS",
      completionClaim: "bootstrap_complete",
      completionEligible: false,
      autonomousReadinessEquivalent: false,
      distinction:
        "Generated-repository bootstrap completion only; this CI smoke is not autonomous readiness and does not verify the readiness source checkout.",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      platform: {
        os: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        pnpmVersion: versionCapture.stdout.trim(),
      },
      source: {
        commit: sourceBefore.head,
        tree: sourceBefore.tree,
        trackedIdentityUnchanged: true,
        noArgumentVerifyInvocations: 0,
      },
      project: packageResult["project"],
      commissioning: {
        invocationCount: 1,
        generatedFileCount: 1,
        manifest: manifestIdentity,
      },
      generatedRepository: {
        commit: candidateCommit,
        tree: candidateTree,
        branch: repositoryObservation.branch,
        commitCount: repositoryObservation.commitCount,
        clean: true,
        defaultProfile: repositoryObservation.defaultProfile,
        readinessMarkerTree: repositoryObservation.readinessMarkerTree,
        readinessMarkerHistory: repositoryObservation.readinessMarkerHistory,
        schemas: [CONFIG_SCHEMA_PATH, POLICY_SCHEMA_PATH],
        manifestCommit: repositoryObservation.manifestCommit,
      },
      commandLedger,
      verificationAudit: {
        status: "PASS",
        invocation: ["pnpm", "verify"],
        invocationCount: 1,
        runId: verificationAudit.runId,
        resultPath: "verification/result.json",
        resultBytes: verificationAudit.resultBytes,
        resultSha256: verificationAudit.resultSha256,
        stageCount: verificationAudit.stageCount,
        receiptCount: verificationAudit.receiptCount,
        artifactCount: verificationAudit.artifactCount,
        artifactBytes: verificationAudit.artifactBytes,
        testCount: verificationAudit.testCount,
        retainedFileCount: retainedVerificationInventory.length,
        retainedBytes: retainedVerificationInventory.reduce(
          (total, entry) => total + entry.bytes,
          0,
        ),
      },
      browser: {
        screenshotPath: `verification/${verificationAudit.screenshot.path}`,
        screenshotBytes: verificationAudit.screenshot.bytes,
        screenshotSha256: verificationAudit.screenshot.sha256,
        diagnosticsClean: true,
      },
      redundantStandaloneCommands: {
        removed: ["pnpm typecheck", "pnpm test:unit"],
        replacement:
          "The shared bootstrap audit requires the generated verifier's typecheck and bootstrap-tests receipts and artifacts, so the same production boundaries are not launched twice.",
      },
      retained: {
        verificationRoot: "verification",
        receiptAuditPath: "receipt-audit.json",
        commandLogRoot: "logs",
      },
    };
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  } finally {
    try {
      await rm(temporaryRoot, { recursive: true, force: false });
    } catch (error) {
      const cleanupError = new Error(
        `Fresh-adopter temporary cleanup failed: ${error instanceof Error ? error.message : String(error)}.`,
        { cause: error },
      );
      primaryError = primaryError
        ? new Error(`${primaryError.message} ${cleanupError.message}`, {
            cause: primaryError,
          })
        : cleanupError;
    }
    const sourceAfter = {
      head: git(sourceRoot, ["rev-parse", "HEAD"]),
      tree: git(sourceRoot, ["rev-parse", "HEAD^{tree}"]),
      status: git(sourceRoot, [
        "status",
        "--porcelain=v2",
        "--untracked-files=all",
      ]),
    };
    if (
      sourceAfter.head !== sourceBefore.head ||
      sourceAfter.tree !== sourceBefore.tree ||
      sourceAfter.status !== sourceBefore.status
    )
      primaryError = new Error(
        "Fresh-adopter CI smoke mutated the source repository identity.",
        primaryError ? { cause: primaryError } : undefined,
      );
  }

  if (primaryError) throw primaryError;
  assertion(result !== null, "Fresh-adopter CI smoke produced no result.");
  await writeJson(resolve(outputRoot, "smoke-result.json"), result);
  return result;
}

async function main(): Promise<number> {
  try {
    const result = await runFreshAdopterCiSmoke(
      parseFreshAdopterSmokeArguments(process.argv.slice(2)),
    );
    const audit = record(result["verificationAudit"], "verificationAudit");
    process.stdout.write(
      `Fresh-adopter CI smoke proved bootstrap with ${audit["receiptCount"]} audited receipts and retained browser evidence.\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
