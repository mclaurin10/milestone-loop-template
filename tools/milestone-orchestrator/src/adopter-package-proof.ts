import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  assertAdopterPackageDefinition,
  createAdopterPackage,
  type AdopterPackageResult,
} from "./adopter-package.js";

export const ADOPTER_PACKAGE_PROOF_SCHEMA_VERSION =
  "fresh-adopter-bootstrap-proof.v1" as const;

const COMMISSIONING_INPUT_PATH =
  "tools/milestone-orchestrator/config/commissioning-input.json" as const;
const ACTIVE_MANIFEST_PATH = ".agent/verification-manifest.json" as const;
const READINESS_MARKER_PATH =
  ".agent/readiness-profile-activated.json" as const;
const EXPECTED_BOOTSTRAP_STAGES = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "bootstrap-tests",
  "bootstrap-simulation",
  "bootstrap-persistence",
  "bootstrap-browser",
  "contract-integrity",
] as const;
const ACTIVE_IDENTITY_PATHS = [
  "PROJECT_GOAL.md",
  "evals/ACCEPTANCE.md",
  "evals/acceptance-manifest.json",
  "evals/HIDDEN_VALIDATION_PROTOCOL.md",
  "evals/immutable-contract-lock.json",
  "package.json",
  "pnpm-workspace.yaml",
  "tools/milestone-orchestrator/config/default.json",
  "tools/milestone-orchestrator/config/invariant-suite.json",
  "tools/milestone-orchestrator/config/verification-scope-policy.json",
  "tools/milestone-orchestrator/config/slow-suite-registry.json",
  COMMISSIONING_INPUT_PATH,
  ACTIVE_MANIFEST_PATH,
  "app/index.html",
  "app/kernel.mjs",
  "app/main.mjs",
  "app/worker.mjs",
] as const;

type JsonRecord = Record<string, unknown>;

export interface ProofFileIdentity {
  readonly path: string;
  readonly kind: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface BootstrapVerificationAudit {
  readonly runId: string;
  readonly resultBytes: number;
  readonly resultSha256: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly stageCount: number;
  readonly receiptCount: number;
  readonly artifactCount: number;
  readonly artifactBytes: number;
  readonly testCount: number;
  readonly screenshot: ProofFileIdentity;
  readonly inventory: readonly ProofFileIdentity[];
}

export interface AdopterPackageProofResult {
  readonly schemaVersion: typeof ADOPTER_PACKAGE_PROOF_SCHEMA_VERSION;
  readonly status: "PASS";
  readonly project: AdopterPackageResult["project"];
  readonly package: {
    readonly authorityBaseCommit: string;
    readonly commissioningInputCommit: string;
    readonly preCommissionTree: string;
    readonly immutableContractLockSha256: string;
    readonly commissioningInputSha256: string;
    readonly initialTrackedFileCount: number;
    readonly finalTrackedFileCount: number;
  };
  readonly commissioning: {
    readonly status: "PASS";
    readonly generatedFileCount: number;
    readonly manifestSha256: string;
  };
  readonly git: {
    readonly branch: string;
    readonly commitCount: 3;
    readonly candidateCommit: string;
    readonly candidateTree: string;
    readonly clean: true;
    readonly readinessMarkerTree: false;
    readonly readinessMarkerHistory: false;
  };
  readonly verification: {
    readonly invocation: readonly ["pnpm", "verify"];
    readonly status: "PASS";
    readonly profile: "bootstrap";
    readonly completionClaim: "bootstrap_complete";
    readonly completionEligible: false;
    readonly autonomousReadinessEquivalent: false;
    readonly stageCount: number;
    readonly receiptCount: number;
    readonly artifactCount: number;
    readonly artifactBytes: number;
    readonly testCount: number;
    readonly resultPath: "verification/result.json";
    readonly resultBytes: number;
    readonly resultSha256: string;
  };
  readonly browser: {
    readonly screenshotPath: string;
    readonly screenshotBytes: number;
    readonly screenshotSha256: string;
    readonly diagnosticsClean: true;
    readonly independentInspectionRequired: true;
  };
  readonly identityBoundary: {
    readonly status: "PASS";
    readonly activeFileCount: number;
    readonly retainedTextFileCount: number;
    readonly prohibitedNeedleCount: number;
  };
  readonly retained: {
    readonly packageInventoryPath: "package-inventory.json";
    readonly receiptAuditPath: "receipt-audit.json";
    readonly gitHistoryPath: "git-history.json";
    readonly activeSurfaceRoot: "package-active-surface";
    readonly verificationRoot: "verification";
  };
}

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} must be a nonempty string.`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(`${label} must be a nonnegative safe integer.`);
  return value as number;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected)
    throw new Error(`${label} must equal ${JSON.stringify(expected)}.`);
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

function containedPath(
  root: string,
  repositoryPath: string,
  label: string,
): string {
  if (
    !repositoryPath ||
    isAbsolute(repositoryPath) ||
    repositoryPath.includes("\0")
  )
    throw new Error(`${label} must be a nonempty relative path.`);
  const absolute = resolve(root, repositoryPath);
  const contained = relative(root, absolute);
  if (
    !contained ||
    contained.startsWith("..") ||
    isAbsolute(contained) ||
    contained.split(sep).includes("..")
  )
    throw new Error(`${label} escapes its evidence root.`);
  return absolute;
}

async function fileIdentity(
  root: string,
  repositoryPath: string,
  kind: string,
): Promise<ProofFileIdentity> {
  const absolute = containedPath(root, repositoryPath, `${kind} path`);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`${kind} must be a regular non-symlink file.`);
  const contents = await readFile(absolute);
  return {
    path: slash(repositoryPath),
    kind,
    bytes: contents.byteLength,
    sha256: sha256(contents),
  };
}

function assertFileDeclaration(
  value: unknown,
  label: string,
): { path: string; kind: string; bytes: number; sha256: string } {
  const declaration = record(value, label);
  return {
    path: string(declaration["path"], `${label}.path`),
    kind: string(declaration["kind"], `${label}.kind`),
    bytes: integer(declaration["bytes"], `${label}.bytes`),
    sha256: string(declaration["sha256"], `${label}.sha256`),
  };
}

function sameDeclaration(
  left: { path: string; kind: string; bytes: number; sha256: string },
  right: { path: string; kind: string; bytes: number; sha256: string },
): boolean {
  return (
    slash(left.path) === slash(right.path) &&
    left.kind === right.kind &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256
  );
}

export async function auditBootstrapVerification(input: {
  readonly repositoryRoot: string;
  readonly verificationRoot: string;
  readonly expectedCommit: string;
  readonly expectedTree: string;
}): Promise<BootstrapVerificationAudit> {
  const resultPath = resolve(input.verificationRoot, "result.json");
  const resultContents = await readFile(resultPath);
  const result = record(
    JSON.parse(resultContents.toString("utf8")),
    "bootstrap verifier result",
  );
  exact(result["schemaVersion"], "2.1.0", "result.schemaVersion");
  exact(result["status"], "PASS", "result.status");
  exact(result["exitCode"], 0, "result.exitCode");
  const invocation = array(result["invocation"], "result.invocation");
  if (
    invocation.length !== 2 ||
    invocation[0] !== "node" ||
    invocation[1] !== "scripts/verify.mjs"
  )
    throw new Error(
      "Verifier result does not prove literal package-default execution.",
    );

  const profile = record(result["profile"], "result.profile");
  exact(profile["id"], "bootstrap", "result.profile.id");
  exact(
    profile["configuredDefault"],
    "bootstrap",
    "result.profile.configuredDefault",
  );
  exact(
    profile["selectedByOverride"],
    false,
    "result.profile.selectedByOverride",
  );
  exact(
    profile["autonomousReadinessEquivalent"],
    false,
    "result.profile.autonomousReadinessEquivalent",
  );
  const completion = record(result["completion"], "result.completion");
  exact(completion["claim"], "bootstrap_complete", "result.completion.claim");
  exact(completion["eligible"], false, "result.completion.eligible");

  for (const key of ["candidate", "candidateFinal"] as const) {
    const candidate = record(result[key], `result.${key}`);
    exact(
      candidate["gitCommit"],
      input.expectedCommit,
      `result.${key}.gitCommit`,
    );
    exact(candidate["gitTree"], input.expectedTree, `result.${key}.gitTree`);
    exact(
      candidate["workingTreeDirty"],
      false,
      `result.${key}.workingTreeDirty`,
    );
    exact(candidate["nodeVersion"], "v24.18.0", `result.${key}.nodeVersion`);
    exact(candidate["pnpmVersion"], "11.15.1", `result.${key}.pnpmVersion`);
    exact(
      candidate["readinessActivationMarkerSha256"],
      null,
      `result.${key}.readinessActivationMarkerSha256`,
    );
  }
  const identityDrift = record(result["identityDrift"], "result.identityDrift");
  exact(identityDrift["detected"], false, "result.identityDrift.detected");

  const summary = record(result["summary"], "result.summary");
  exact(
    summary["requiredStageCount"],
    EXPECTED_BOOTSTRAP_STAGES.length,
    "result.summary.requiredStageCount",
  );
  const stageCounts = record(
    summary["stageCounts"],
    "result.summary.stageCounts",
  );
  exact(
    stageCounts["PASS"],
    EXPECTED_BOOTSTRAP_STAGES.length,
    "stageCounts.PASS",
  );
  for (const key of ["FAIL", "NOT_READY", "ERROR"])
    exact(stageCounts[key], 0, `stageCounts.${key}`);

  const stages = array(result["stages"], "result.stages");
  if (stages.length !== EXPECTED_BOOTSTRAP_STAGES.length)
    throw new Error("Bootstrap result has an unexpected stage count.");
  const seenStages = new Set<string>();
  const inventory: ProofFileIdentity[] = [];
  let receiptCount = 0;
  let artifactCount = 0;
  let artifactBytes = 0;
  let testCount = 0;
  let screenshot: ProofFileIdentity | undefined;

  for (const [stageIndex, stageValue] of stages.entries()) {
    const stage = record(stageValue, `result.stages[${stageIndex}]`);
    const stageId = string(stage["id"], `result.stages[${stageIndex}].id`);
    if (!EXPECTED_BOOTSTRAP_STAGES.includes(stageId as never))
      throw new Error(`Unexpected bootstrap stage: ${stageId}.`);
    if (seenStages.has(stageId))
      throw new Error(`Duplicate bootstrap stage: ${stageId}.`);
    seenStages.add(stageId);
    exact(stage["required"], true, `${stageId}.required`);
    exact(stage["status"], "PASS", `${stageId}.status`);

    const commands = array(stage["commands"], `${stageId}.commands`);
    if (stageId === "contract-integrity") {
      if (commands.length !== 0)
        throw new Error("Contract-integrity must remain an in-process stage.");
      continue;
    }
    if (commands.length === 0)
      throw new Error(`${stageId} has no receipt-owning command.`);

    for (const [commandIndex, commandValue] of commands.entries()) {
      const label = `${stageId}.commands[${commandIndex}]`;
      const command = record(commandValue, label);
      exact(command["status"], "PASS", `${label}.status`);
      exact(command["exitCode"], 0, `${label}.exitCode`);
      const evidence = record(command["evidence"], `${label}.evidence`);
      exact(evidence["valid"], true, `${label}.evidence.valid`);
      const receiptPath = string(
        evidence["receipt"],
        `${label}.evidence.receipt`,
      );
      const receiptIdentity = await fileIdentity(
        input.verificationRoot,
        receiptPath,
        "command-receipt",
      );
      inventory.push(receiptIdentity);
      receiptCount += 1;
      const receipt = record(
        await readJson(
          resolve(input.verificationRoot, receiptPath),
          `${label} receipt`,
        ),
        `${label} receipt`,
      );
      exact(
        receipt["schemaVersion"],
        "1.0.0",
        `${label}.receipt.schemaVersion`,
      );
      exact(receipt["stageId"], stageId, `${label}.receipt.stageId`);
      exact(receipt["status"], "PASS", `${label}.receipt.status`);
      const receiptChecks = array(receipt["checks"], `${label}.receipt.checks`);
      if (receiptChecks.length === 0)
        throw new Error(`${label} receipt has no exercised check.`);
      for (const [checkIndex, checkValue] of receiptChecks.entries())
        exact(
          record(checkValue, `${label}.receipt.checks[${checkIndex}]`)[
            "status"
          ],
          "PASS",
          `${label}.receipt.checks[${checkIndex}].status`,
        );

      const receiptDirectory = dirname(
        resolve(input.verificationRoot, receiptPath),
      );
      const receiptArtifacts = array(
        receipt["artifacts"],
        `${label}.receipt.artifacts`,
      ).map((value, index) =>
        assertFileDeclaration(value, `${label}.receipt.artifacts[${index}]`),
      );
      const evidenceArtifacts = array(
        evidence["artifacts"],
        `${label}.evidence.artifacts`,
      ).map((value, index) =>
        assertFileDeclaration(value, `${label}.evidence.artifacts[${index}]`),
      );
      if (receiptArtifacts.length !== evidenceArtifacts.length)
        throw new Error(`${label} receipt/result artifact counts differ.`);

      for (const declaration of receiptArtifacts) {
        const actual = await fileIdentity(
          receiptDirectory,
          declaration.path,
          declaration.kind,
        );
        if (!sameDeclaration(actual, declaration))
          throw new Error(
            `${label} artifact identity mismatch: ${declaration.path}.`,
          );
        const verifyRelative = slash(
          relative(
            input.verificationRoot,
            resolve(receiptDirectory, declaration.path),
          ),
        );
        const resultDeclaration = evidenceArtifacts.find(
          (candidate) => slash(candidate.path) === verifyRelative,
        );
        if (
          !resultDeclaration ||
          !sameDeclaration(
            { ...actual, path: verifyRelative },
            resultDeclaration,
          )
        )
          throw new Error(
            `${label} result did not independently match ${declaration.path}.`,
          );
        const retainedIdentity = { ...actual, path: verifyRelative };
        inventory.push(retainedIdentity);
        artifactCount += 1;
        artifactBytes += actual.bytes;
        if (actual.kind === "screenshot") screenshot = retainedIdentity;
        if (actual.kind === "vitest-report") {
          const testReport = record(
            await readJson(
              resolve(receiptDirectory, declaration.path),
              "Vitest report",
            ),
            "Vitest report",
          );
          exact(testReport["numFailedTests"], 0, "Vitest numFailedTests");
          testCount = integer(
            testReport["numPassedTests"],
            "Vitest numPassedTests",
          );
          if (testCount < 4)
            throw new Error("Vitest report proves fewer than four tests.");
        }
        if (actual.kind === "browser-diagnostics") {
          const diagnostics = record(
            await readJson(
              resolve(receiptDirectory, declaration.path),
              "browser diagnostics",
            ),
            "browser diagnostics",
          );
          exact(diagnostics["status"], "PASS", "browser diagnostics status");
          for (const key of ["consoleErrors", "pageErrors", "requestFailures"])
            if (
              array(diagnostics[key], `browser diagnostics ${key}`).length !== 0
            )
              throw new Error(`Browser diagnostics contain ${key}.`);
        }
        if (actual.kind === "visual-review")
          exact(
            record(
              await readJson(
                resolve(receiptDirectory, declaration.path),
                "visual review",
              ),
              "visual review",
            )["status"],
            "PASS",
            "visual review status",
          );
      }

      const manifestRelative = slash(
        join(slash(dirname(receiptPath)), "manifest.json"),
      );
      const manifestIdentity = await fileIdentity(
        input.verificationRoot,
        manifestRelative,
        "command-manifest",
      );
      inventory.push(manifestIdentity);
      const manifest = record(
        await readJson(
          resolve(input.verificationRoot, manifestRelative),
          `${label} manifest`,
        ),
        `${label} manifest`,
      );
      exact(manifest["status"], "PASS", `${label}.manifest.status`);
      const manifestCandidate = record(
        manifest["candidate"],
        `${label}.manifest.candidate`,
      );
      exact(
        manifestCandidate["gitCommit"],
        input.expectedCommit,
        `${label}.manifest.commit`,
      );
      exact(
        manifestCandidate["gitTree"],
        input.expectedTree,
        `${label}.manifest.tree`,
      );
      exact(
        manifestCandidate["workingTreeDirty"],
        false,
        `${label}.manifest.dirty`,
      );
      const manifestReceipt = record(
        manifest["receipt"],
        `${label}.manifest.receipt`,
      );
      exact(
        manifestReceipt["path"],
        basename(receiptPath),
        `${label}.manifest.receipt.path`,
      );
      exact(
        manifestReceipt["bytes"],
        receiptIdentity.bytes,
        `${label}.manifest.receipt.bytes`,
      );
      exact(
        manifestReceipt["sha256"],
        receiptIdentity.sha256,
        `${label}.manifest.receipt.sha256`,
      );
    }
  }

  if (seenStages.size !== EXPECTED_BOOTSTRAP_STAGES.length)
    throw new Error("Bootstrap result omitted a required stage.");
  if (!screenshot || screenshot.bytes < 1_000)
    throw new Error("Bootstrap proof lacks a substantive browser screenshot.");

  return {
    runId: string(result["runId"], "result.runId"),
    resultBytes: resultContents.byteLength,
    resultSha256: sha256(resultContents),
    candidateCommit: input.expectedCommit,
    candidateTree: input.expectedTree,
    stageCount: stages.length,
    receiptCount,
    artifactCount,
    artifactBytes,
    testCount,
    screenshot,
    inventory: inventory.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

interface CommandCapture {
  readonly id: string;
  readonly argv: readonly string[];
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(
  id: string,
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): CommandCapture {
  const started = Date.now();
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const capture = {
    id,
    argv: [command, ...args],
    exitCode: result.status ?? -1,
    durationMs: Date.now() - started,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
  if (result.error || result.status !== 0)
    throw new Error(
      `${id} failed: ${(result.error?.message ?? capture.stderr.trim()) || `exit ${capture.exitCode}`}`,
    );
  return capture;
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string {
  return run("git", "git", ["-C", repositoryRoot, ...args], {
    cwd: repositoryRoot,
    ...(env ? { env } : {}),
  }).stdout.trim();
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function writeCapture(
  artifactDirectory: string,
  capture: CommandCapture,
): Promise<void> {
  const logRoot = resolve(artifactDirectory, "logs");
  await mkdir(logRoot, { recursive: true });
  await Promise.all([
    writeFile(resolve(logRoot, `${capture.id}.stdout.log`), capture.stdout, {
      flag: "wx",
    }),
    writeFile(resolve(logRoot, `${capture.id}.stderr.log`), capture.stderr, {
      flag: "wx",
    }),
  ]);
}

async function nodeShim(root: string): Promise<string> {
  const runtimeRoot = resolve(root, "runtime");
  await mkdir(runtimeRoot, { recursive: true });
  const destination = resolve(runtimeRoot, basename(process.execPath));
  try {
    await link(process.execPath, destination);
  } catch {
    await copyFile(process.execPath, destination, 0);
  }
  return destination;
}

function childEnvironment(nodePath: string): NodeJS.ProcessEnv {
  const result = { ...process.env };
  const pathKey =
    Object.keys(result).find((key) => key.toLowerCase() === "path") ?? "PATH";
  result[pathKey] = `${dirname(nodePath)}${delimiter}${result[pathKey] ?? ""}`;
  return result;
}

function pnpmEntrypoint(): string {
  const value = process.env["npm_execpath"];
  if (!value || !isAbsolute(value) || !existsSync(value))
    throw new Error(
      "Fresh-adopter proof must be launched through the pinned pnpm package script.",
    );
  return resolve(value);
}

function runPnpm(
  id: string,
  nodePath: string,
  pnpmPath: string,
  args: readonly string[],
  repositoryRoot: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = 600_000,
): CommandCapture {
  return run(id, nodePath, [pnpmPath, ...args], {
    cwd: repositoryRoot,
    env,
    timeoutMs,
  });
}

async function trackedInventory(
  repositoryRoot: string,
): Promise<readonly ProofFileIdentity[]> {
  const paths = git(repositoryRoot, ["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
  return Promise.all(
    paths.map((path) => fileIdentity(repositoryRoot, path, "tracked-file")),
  );
}

async function copyActiveSurface(
  repositoryRoot: string,
  artifactDirectory: string,
): Promise<void> {
  const destinationRoot = resolve(artifactDirectory, "package-active-surface");
  for (const path of ACTIVE_IDENTITY_PATHS) {
    const destination = resolve(destinationRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(repositoryRoot, path), destination, 0);
  }
}

async function sourceIdentityNeedles(
  sourceRoot: string,
): Promise<readonly string[]> {
  const packageJson = record(
    await readJson(resolve(sourceRoot, "package.json"), "source package"),
    "source package",
  );
  const config = record(
    await readJson(
      resolve(sourceRoot, "tools/milestone-orchestrator/config/default.json"),
      "source config",
    ),
    "source config",
  );
  const project = record(config["project"], "source config project");
  const manifest = record(
    await readJson(
      resolve(sourceRoot, ".agent/verification-manifest.json"),
      "source manifest",
    ),
    "source manifest",
  );
  const commissioning = record(
    manifest["commissioning"],
    "source commissioning",
  );
  const registries = await Promise.all(
    [
      "tools/milestone-orchestrator/config/invariant-suite.json",
      "tools/milestone-orchestrator/config/verification-scope-policy.json",
      "tools/milestone-orchestrator/config/slow-suite-registry.json",
    ].map(async (path) =>
      string(
        record(await readJson(resolve(sourceRoot, path), path), path)["id"],
        `${path}.id`,
      ),
    ),
  );
  const candidates = [
    "D-031",
    "D-032",
    "Ski Tycoon",
    string(packageJson["name"], "source package name"),
    string(project["name"], "source project name"),
    string(commissioning["id"], "source commissioning id"),
    ...registries,
    git(sourceRoot, ["rev-parse", "HEAD"]),
  ];
  return [...new Set(candidates.map((value) => value.toLowerCase()))];
}

async function textFiles(root: string): Promise<readonly string[]> {
  const results: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (
        entry.isFile() &&
        /\.(?:json|log|md|txt|mjs|ts|yaml|yml)$/iu.test(entry.name)
      )
        results.push(absolute);
    }
  }
  await walk(root);
  return results.sort();
}

async function assertNoIdentityLeak(
  roots: readonly string[],
  needles: readonly string[],
): Promise<number> {
  let count = 0;
  for (const root of roots) {
    for (const path of await textFiles(root)) {
      count += 1;
      const contents = (await readFile(path, "utf8")).toLowerCase();
      const leaked = needles.find((needle) => contents.includes(needle));
      if (leaked)
        throw new Error(
          `Adopter active/retained identity scan failed at ${slash(relative(root, path))}.`,
        );
    }
  }
  return count;
}

function parseCommissioningResult(stdout: string): JsonRecord {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("Commissioning emitted no structured result.");
  const value = record(JSON.parse(stdout.slice(start)), "commissioning result");
  exact(
    value["schemaVersion"],
    "loop-commissioning-result.v1",
    "commissioning schema",
  );
  exact(value["status"], "PASS", "commissioning status");
  return value;
}

async function assertAbsentOutput(path: string): Promise<void> {
  if (existsSync(path))
    throw new Error(`Proof artifact directory already exists: ${path}.`);
  const parent = await realpath(dirname(path));
  const metadata = await lstat(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("Proof artifact parent must be a real directory.");
}

export async function proveFreshAdopterBootstrap(input: {
  readonly definitionPath: string;
  readonly artifactDirectory: string;
}): Promise<AdopterPackageProofResult> {
  if (process.version !== "v24.18.0")
    throw new Error(
      `Fresh-adopter proof requires Node v24.18.0, got ${process.version}.`,
    );
  const sourceRoot = resolve(import.meta.dirname, "../../..");
  const sourceStatusBefore = git(sourceRoot, [
    "status",
    "--porcelain=v2",
    "--untracked-files=all",
  ]);
  const sourceHeadBefore = git(sourceRoot, ["rev-parse", "HEAD"]);
  const protectedPath = resolve(
    sourceRoot,
    "Implementation-ready improvement plan 8-5-26.txt",
  );
  const protectedBefore = await readFile(protectedPath);
  const artifactDirectory = resolve(input.artifactDirectory);
  await assertAbsentOutput(artifactDirectory);
  await mkdir(artifactDirectory, { recursive: false });

  const temporaryRoot = await mkdtemp(join(tmpdir(), "fresh-adopter-proof-"));
  const repositoryRoot = resolve(temporaryRoot, "repository");
  const childNode = await nodeShim(temporaryRoot);
  const pnpmPath = pnpmEntrypoint();
  const env = childEnvironment(childNode);
  const definition = assertAdopterPackageDefinition(
    await readJson(resolve(input.definitionPath), "adopter package definition"),
  );
  const packageResult = await createAdopterPackage({
    definitionPath: resolve(input.definitionPath),
    outputPath: repositoryRoot,
  });

  const versionCapture = runPnpm(
    "pnpm-version",
    childNode,
    pnpmPath,
    ["--version"],
    repositoryRoot,
    env,
  );
  exact(versionCapture.stdout.trim(), "11.15.1", "proof pnpm version");
  await writeCapture(artifactDirectory, versionCapture);
  const installCapture = runPnpm(
    "offline-install",
    childNode,
    pnpmPath,
    [
      "install",
      "--offline",
      "--frozen-lockfile",
      "--package-import-method=copy",
    ],
    repositoryRoot,
    env,
  );
  await writeCapture(artifactDirectory, installCapture);

  const commissionCapture = runPnpm(
    "commission",
    childNode,
    pnpmPath,
    ["run", "loop:commission", "--input", COMMISSIONING_INPUT_PATH],
    repositoryRoot,
    env,
  );
  await writeCapture(artifactDirectory, commissionCapture);
  const commission = parseCommissioningResult(commissionCapture.stdout);
  const generatedFiles = array(
    commission["generatedFiles"],
    "commission.generatedFiles",
  );
  if (generatedFiles.length !== 1)
    throw new Error("Commissioning must generate exactly the active manifest.");
  const generatedManifest = record(
    generatedFiles[0],
    "commission.generatedFiles[0]",
  );
  exact(
    generatedManifest["path"],
    ACTIVE_MANIFEST_PATH,
    "commission manifest path",
  );
  const manifestIdentity = await fileIdentity(
    repositoryRoot,
    ACTIVE_MANIFEST_PATH,
    "active-manifest",
  );
  exact(
    generatedManifest["bytes"],
    manifestIdentity.bytes,
    "commission manifest bytes",
  );
  exact(
    generatedManifest["sha256"],
    manifestIdentity.sha256,
    "commission manifest sha256",
  );

  const untracked = git(repositoryRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  if (
    untracked.length !== 1 ||
    slash(untracked[0] ?? "") !== ACTIVE_MANIFEST_PATH
  )
    throw new Error("Commissioning produced an unexpected untracked surface.");
  if (
    git(repositoryRoot, ["diff", "--name-only"]) ||
    git(repositoryRoot, ["diff", "--cached", "--name-only"])
  )
    throw new Error("Commissioning changed tracked package files.");
  git(repositoryRoot, ["add", "--", ACTIVE_MANIFEST_PATH]);
  const commitTimestamp = new Date(
    Date.parse(definition.git.timestamp) + 2 * 60_000,
  ).toISOString();
  const commitEnv = {
    ...env,
    GIT_AUTHOR_DATE: commitTimestamp,
    GIT_COMMITTER_DATE: commitTimestamp,
  };
  git(
    repositoryRoot,
    ["commit", "-m", "activate bootstrap verification manifest"],
    commitEnv,
  );
  const candidateCommit = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const candidateTree = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const branch = git(repositoryRoot, ["branch", "--show-current"]);
  exact(branch, definition.project.targetBranch, "proof branch");
  exact(
    Number(git(repositoryRoot, ["rev-list", "--count", "HEAD"])),
    3,
    "proof commit count",
  );
  if (
    git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"])
  )
    throw new Error("Commissioned proof repository is not clean.");
  if (existsSync(resolve(repositoryRoot, READINESS_MARKER_PATH)))
    throw new Error("Readiness marker exists in the bootstrap tree.");
  if (
    git(repositoryRoot, [
      "log",
      "--all",
      "--format=%H",
      "--",
      READINESS_MARKER_PATH,
    ])
  )
    throw new Error("Readiness marker exists in bootstrap history.");

  const verifyCapture = runPnpm(
    "no-argument-verify",
    childNode,
    pnpmPath,
    ["verify"],
    repositoryRoot,
    env,
    1_800_000,
  );
  await writeCapture(artifactDirectory, verifyCapture);
  const verifyDirectories = (
    await readdir(resolve(repositoryRoot, "artifacts"), {
      withFileTypes: true,
    })
  ).filter((entry) => entry.isDirectory() && entry.name.startsWith("verify-"));
  if (verifyDirectories.length !== 1)
    throw new Error(
      "No-argument verifier did not create exactly one run directory.",
    );
  const verificationRoot = resolve(
    repositoryRoot,
    "artifacts",
    verifyDirectories[0]?.name ?? "",
  );
  const audit = await auditBootstrapVerification({
    repositoryRoot,
    verificationRoot,
    expectedCommit: candidateCommit,
    expectedTree: candidateTree,
  });

  const verificationDestination = resolve(artifactDirectory, "verification");
  await cp(verificationRoot, verificationDestination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await copyActiveSurface(repositoryRoot, artifactDirectory);
  const finalInventory = await trackedInventory(repositoryRoot);
  await writeJson(resolve(artifactDirectory, "package-inventory.json"), {
    schemaVersion: "fresh-adopter-package-inventory.v1",
    initial: packageResult.files,
    final: finalInventory,
  });
  await writeJson(resolve(artifactDirectory, "receipt-audit.json"), {
    schemaVersion: "fresh-adopter-receipt-audit.v1",
    status: "PASS",
    receiptCount: audit.receiptCount,
    artifactCount: audit.artifactCount,
    artifactBytes: audit.artifactBytes,
    inventory: audit.inventory,
  });
  const history = git(repositoryRoot, [
    "log",
    "--reverse",
    "--format=%H%x09%T%x09%s",
  ]).split("\n");
  await writeJson(resolve(artifactDirectory, "git-history.json"), {
    schemaVersion: "fresh-adopter-git-history.v1",
    branch,
    commitCount: history.length,
    entries: history.map((line) => {
      const [commit, tree, subject] = line.split("\t");
      return { commit, tree, subject };
    }),
    clean: true,
    readinessMarkerTree: false,
    readinessMarkerHistory: false,
  });

  const needles = await sourceIdentityNeedles(sourceRoot);
  const retainedTextFileCount = await assertNoIdentityLeak(
    [artifactDirectory],
    needles,
  );
  const result: AdopterPackageProofResult = {
    schemaVersion: ADOPTER_PACKAGE_PROOF_SCHEMA_VERSION,
    status: "PASS",
    project: packageResult.project,
    package: {
      authorityBaseCommit: packageResult.git.authorityBaseCommit,
      commissioningInputCommit: packageResult.git.commissioningInputCommit,
      preCommissionTree: packageResult.git.tree,
      immutableContractLockSha256:
        packageResult.generated.immutableContractLockSha256,
      commissioningInputSha256:
        packageResult.generated.commissioningInputSha256,
      initialTrackedFileCount: packageResult.files.length,
      finalTrackedFileCount: finalInventory.length,
    },
    commissioning: {
      status: "PASS",
      generatedFileCount: generatedFiles.length,
      manifestSha256: manifestIdentity.sha256,
    },
    git: {
      branch,
      commitCount: 3,
      candidateCommit,
      candidateTree,
      clean: true,
      readinessMarkerTree: false,
      readinessMarkerHistory: false,
    },
    verification: {
      invocation: ["pnpm", "verify"],
      status: "PASS",
      profile: "bootstrap",
      completionClaim: "bootstrap_complete",
      completionEligible: false,
      autonomousReadinessEquivalent: false,
      stageCount: audit.stageCount,
      receiptCount: audit.receiptCount,
      artifactCount: audit.artifactCount,
      artifactBytes: audit.artifactBytes,
      testCount: audit.testCount,
      resultPath: "verification/result.json",
      resultBytes: audit.resultBytes,
      resultSha256: audit.resultSha256,
    },
    browser: {
      screenshotPath: `verification/${audit.screenshot.path}`,
      screenshotBytes: audit.screenshot.bytes,
      screenshotSha256: audit.screenshot.sha256,
      diagnosticsClean: true,
      independentInspectionRequired: true,
    },
    identityBoundary: {
      status: "PASS",
      activeFileCount: ACTIVE_IDENTITY_PATHS.length,
      retainedTextFileCount,
      prohibitedNeedleCount: needles.length,
    },
    retained: {
      packageInventoryPath: "package-inventory.json",
      receiptAuditPath: "receipt-audit.json",
      gitHistoryPath: "git-history.json",
      activeSurfaceRoot: "package-active-surface",
      verificationRoot: "verification",
    },
  };
  const resultText = `${JSON.stringify(result, null, 2)}\n`;
  const leaked = needles.find((needle) =>
    resultText.toLowerCase().includes(needle),
  );
  if (leaked) throw new Error("Proof summary contains a source identity.");
  await writeFile(resolve(artifactDirectory, "proof-result.json"), resultText, {
    flag: "wx",
  });

  const sourceStatusAfter = git(sourceRoot, [
    "status",
    "--porcelain=v2",
    "--untracked-files=all",
  ]);
  const sourceHeadAfter = git(sourceRoot, ["rev-parse", "HEAD"]);
  const protectedAfter = await readFile(protectedPath);
  if (
    sourceStatusAfter !== sourceStatusBefore ||
    sourceHeadAfter !== sourceHeadBefore ||
    !protectedAfter.equals(protectedBefore)
  )
    throw new Error(
      "Fresh-adopter proof mutated the source repository boundary.",
    );
  const proofMetadata = await stat(
    resolve(artifactDirectory, "proof-result.json"),
  );
  if (!proofMetadata.isFile() || proofMetadata.size === 0)
    throw new Error("Fresh-adopter proof summary was not retained.");
  await rm(temporaryRoot, { recursive: true, force: false });
  return result;
}
