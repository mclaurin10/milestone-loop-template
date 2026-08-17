import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const FRESH_ADOPTER_CI_SMOKE_SCHEMA_VERSION =
  "fresh-adopter-ci-smoke.v1" as const;

const EXPECTED_NODE_VERSION = "v24.18.0";
const EXPECTED_PNPM_VERSION = "11.15.1";
const READINESS_MARKER_PATH = ".agent/readiness-profile-activated.json";
const CONFIG_SCHEMA_PATH =
  "tools/milestone-orchestrator/schemas/orchestrator-config.schema.json";
const POLICY_SCHEMA_PATH =
  "tools/milestone-orchestrator/schemas/model-policy.schema.json";

type JsonRecord = Record<string, unknown>;

export interface FreshAdopterSmokeArguments {
  readonly definitionPath: string;
  readonly outputPath: string;
}

export interface AuditedCommandEvidence {
  readonly stageId: string;
  readonly commandId: string;
  readonly receipt: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly manifest: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly artifacts: readonly {
    readonly path: string;
    readonly kind: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly tests: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  } | null;
}

interface CommandCapture {
  readonly id: string;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
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
): Promise<{ path: string; kind: string; bytes: number; sha256: string }> {
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
  });
  if (result.exitCode !== 0) throw commandFailure(result);
  return result.stdout.trim();
}

interface PnpmInvocation {
  readonly executable: string;
  readonly prefixArguments: readonly string[];
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
    {
      cwd,
      env,
      timeoutMs,
    },
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

export async function auditCommandEvidence(input: {
  readonly evidenceRoot: string;
  readonly displayRoot: string;
  readonly expectedStageId: string;
  readonly expectedCommandId: string;
  readonly expectedCommit: string;
  readonly expectedTree: string;
  readonly expectVitest: boolean;
}): Promise<AuditedCommandEvidence> {
  const receiptPath = resolve(input.evidenceRoot, "result.json");
  const receiptContents = await readFile(receiptPath);
  const receipt = record(
    JSON.parse(receiptContents.toString("utf8")),
    `${input.expectedCommandId} receipt`,
  );
  exact(receipt["schemaVersion"], "1.0.0", "receipt.schemaVersion");
  exact(receipt["stageId"], input.expectedStageId, "receipt.stageId");
  exact(receipt["commandId"], input.expectedCommandId, "receipt.commandId");
  exact(receipt["status"], "PASS", "receipt.status");
  assertion(
    Array.isArray(receipt["checks"]),
    "receipt.checks must be an array.",
  );
  const checks = receipt["checks"];
  assertion(checks.length > 0, "receipt.checks must not be empty.");
  for (const [index, check] of checks.entries())
    exact(
      record(check, `receipt.checks[${index}]`)["status"],
      "PASS",
      `receipt.checks[${index}].status`,
    );

  assertion(
    Array.isArray(receipt["artifacts"]),
    "receipt.artifacts must be an array.",
  );
  const artifactValues = receipt["artifacts"];
  assertion(artifactValues.length > 0, "receipt.artifacts must not be empty.");
  const artifacts = [];
  let testReport: JsonRecord | null = null;
  for (const [index, value] of artifactValues.entries()) {
    const declaration = record(value, `receipt.artifacts[${index}]`);
    const path = stringValue(
      declaration["path"],
      `receipt.artifacts[${index}].path`,
    );
    const kind = stringValue(
      declaration["kind"],
      `receipt.artifacts[${index}].kind`,
    );
    const actual = await regularFileIdentity(input.evidenceRoot, path, kind);
    exact(
      declaration["bytes"],
      actual.bytes,
      `receipt.artifacts[${index}].bytes`,
    );
    exact(
      declaration["sha256"],
      actual.sha256,
      `receipt.artifacts[${index}].sha256`,
    );
    const parsed = record(
      await readJson(resolve(input.evidenceRoot, path), `${kind} artifact`),
      `${kind} artifact`,
    );
    if (kind === "vitest-report") testReport = parsed;
    else exact(parsed["status"], "PASS", `${kind}.status`);
    artifacts.push(actual);
  }

  const manifestContents = await readFile(
    resolve(input.evidenceRoot, "manifest.json"),
  );
  const manifest = record(
    JSON.parse(manifestContents.toString("utf8")),
    `${input.expectedCommandId} manifest`,
  );
  exact(manifest["schemaVersion"], "1.0.0", "manifest.schemaVersion");
  exact(manifest["stageId"], input.expectedStageId, "manifest.stageId");
  exact(manifest["commandId"], input.expectedCommandId, "manifest.commandId");
  exact(manifest["status"], "PASS", "manifest.status");
  const candidate = record(manifest["candidate"], "manifest.candidate");
  exact(candidate["gitCommit"], input.expectedCommit, "candidate.gitCommit");
  exact(candidate["gitTree"], input.expectedTree, "candidate.gitTree");
  exact(candidate["workingTreeDirty"], false, "candidate.workingTreeDirty");
  const manifestReceipt = record(manifest["receipt"], "manifest.receipt");
  exact(manifestReceipt["path"], "result.json", "manifest.receipt.path");
  exact(
    manifestReceipt["bytes"],
    receiptContents.byteLength,
    "manifest.receipt.bytes",
  );
  exact(
    manifestReceipt["sha256"],
    sha256(receiptContents),
    "manifest.receipt.sha256",
  );

  let tests: AuditedCommandEvidence["tests"] = null;
  if (input.expectVitest) {
    assertion(testReport !== null, "Unit evidence omitted its Vitest report.");
    tests = {
      total: integer(testReport["numTotalTests"], "vitest.numTotalTests"),
      passed: integer(testReport["numPassedTests"], "vitest.numPassedTests"),
      failed: integer(testReport["numFailedTests"], "vitest.numFailedTests"),
      skipped: integer(testReport["numPendingTests"], "vitest.numPendingTests"),
    };
    exact(tests.failed, 0, "vitest failed tests");
    exact(tests.skipped, 0, "vitest skipped tests");
    assertion(
      tests.passed >= 4,
      "Fresh adopter smoke ran fewer than four tests.",
    );
    exact(tests.total, tests.passed, "vitest total/passed parity");
  } else {
    assertion(
      testReport === null,
      "Non-test evidence declared a Vitest report.",
    );
  }

  const receiptDisplayPath = slash(
    relative(input.displayRoot, resolve(input.evidenceRoot, "result.json")),
  );
  const manifestDisplayPath = slash(
    relative(input.displayRoot, resolve(input.evidenceRoot, "manifest.json")),
  );
  return {
    stageId: input.expectedStageId,
    commandId: input.expectedCommandId,
    receipt: {
      path: receiptDisplayPath,
      bytes: receiptContents.byteLength,
      sha256: sha256(receiptContents),
    },
    manifest: {
      path: manifestDisplayPath,
      bytes: manifestContents.byteLength,
      sha256: sha256(manifestContents),
    },
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      path: slash(
        relative(input.displayRoot, resolve(input.evidenceRoot, artifact.path)),
      ),
    })),
    tests,
  };
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  assertion(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${label} must be a regular non-symlink file.`,
  );
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

  const temporaryRoot = await mkdtemp(join(tmpdir(), "fresh-adopter-ci-"));
  const repositoryRoot = resolve(temporaryRoot, "repository");
  let primaryError: Error | null = null;
  let result: JsonRecord | null = null;
  try {
    const createCapture = await runPnpm(
      outputRoot,
      "create-package",
      pnpm,
      [
        "run",
        "loop:template:create",
        "--definition",
        definitionPath,
        "--output",
        repositoryRoot,
      ],
      sourceRoot,
      process.env,
      600_000,
    );
    const packageResult = parseStructuredOutput(
      createCapture.stdout,
      "adopter package creator",
    );

    const childEnvironment = { ...process.env, CI: "true" };
    await runPnpm(
      outputRoot,
      "install",
      pnpm,
      [
        "install",
        "--offline",
        "--frozen-lockfile",
        "--package-import-method=copy",
      ],
      repositoryRoot,
      childEnvironment,
      900_000,
    );

    const candidateCommit = git(repositoryRoot, ["rev-parse", "HEAD"]);
    const candidateTree = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
    const typecheckRoot = resolve(outputRoot, "evidence", "typecheck");
    const unitRoot = resolve(outputRoot, "evidence", "test-unit");
    await runPnpm(
      outputRoot,
      "typecheck",
      pnpm,
      ["typecheck"],
      repositoryRoot,
      {
        ...childEnvironment,
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: typecheckRoot,
      },
      600_000,
    );
    await runPnpm(
      outputRoot,
      "test-unit",
      pnpm,
      ["test:unit"],
      repositoryRoot,
      {
        ...childEnvironment,
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: unitRoot,
      },
      900_000,
    );

    const [typecheck, unit] = await Promise.all([
      auditCommandEvidence({
        evidenceRoot: typecheckRoot,
        displayRoot: outputRoot,
        expectedStageId: "typecheck",
        expectedCommandId: "typecheck",
        expectedCommit: candidateCommit,
        expectedTree: candidateTree,
        expectVitest: false,
      }),
      auditCommandEvidence({
        evidenceRoot: unitRoot,
        displayRoot: outputRoot,
        expectedStageId: "bootstrap-tests",
        expectedCommandId: "test:unit",
        expectedCommit: candidateCommit,
        expectedTree: candidateTree,
        expectVitest: true,
      }),
    ]);

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
    exact(
      verification["defaultProfile"],
      "bootstrap",
      "generated default profile",
    );
    exact(
      packageJson["packageManager"],
      `pnpm@${EXPECTED_PNPM_VERSION}`,
      "generated package manager",
    );
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
    assertion(
      !existsSync(resolve(repositoryRoot, READINESS_MARKER_PATH)),
      "Fresh adopter smoke unexpectedly contains the readiness marker.",
    );
    exact(
      git(repositoryRoot, [
        "log",
        "--all",
        "--format=%H",
        "--",
        READINESS_MARKER_PATH,
      ]),
      "",
      "fresh adopter readiness-marker history",
    );
    exact(
      Number(git(repositoryRoot, ["rev-list", "--count", "HEAD"])),
      2,
      "fresh adopter commit count",
    );
    exact(
      git(repositoryRoot, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]),
      "",
      "fresh adopter Git status",
    );

    const receipts = [typecheck, unit];
    result = {
      schemaVersion: FRESH_ADOPTER_CI_SMOKE_SCHEMA_VERSION,
      status: "PASS",
      completionEligible: false,
      autonomousReadinessEquivalent: false,
      distinction:
        "CI smoke only; this does not run no-argument verification or replace the retained WP4d bootstrap proof.",
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
      },
      project: packageResult["project"],
      generatedRepository: {
        commit: candidateCommit,
        tree: candidateTree,
        commitCount: 2,
        clean: true,
        defaultProfile: "bootstrap",
        readinessMarkerTree: false,
        readinessMarkerHistory: false,
        schemas: [CONFIG_SCHEMA_PATH, POLICY_SCHEMA_PATH],
      },
      commands: [
        {
          id: createCapture.id,
          durationMs: createCapture.durationMs,
          exitCode: createCapture.exitCode,
        },
        {
          id: "install",
          status: "PASS",
        },
        {
          id: "typecheck",
          status: "PASS",
        },
        {
          id: "test-unit",
          status: "PASS",
        },
      ],
      receiptAudit: {
        status: "PASS",
        receiptCount: receipts.length,
        artifactCount: receipts.reduce(
          (total, receipt) => total + receipt.artifacts.length,
          0,
        ),
        artifactBytes: receipts.reduce(
          (total, receipt) =>
            total +
            receipt.artifacts.reduce(
              (subtotal, artifact) => subtotal + artifact.bytes,
              0,
            ),
          0,
        ),
        tests: unit.tests,
        receipts,
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
  await writeFile(
    resolve(outputRoot, "smoke-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return result;
}

async function main(): Promise<number> {
  try {
    const result = await runFreshAdopterCiSmoke(
      parseFreshAdopterSmokeArguments(process.argv.slice(2)),
    );
    process.stdout.write(
      `Fresh-adopter CI smoke passed ${record(result["receiptAudit"], "receiptAudit")["receiptCount"]} receipt-owning checks.\n`,
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
