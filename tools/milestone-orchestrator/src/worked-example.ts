import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import {
  buildScopeCheckCatalogue,
  orderScopeCheckIds,
} from "./affected-scope.js";
import { assertBenchmarkMatrix, type BenchmarkMatrix } from "./benchmark.js";
import type {
  InvariantSuiteRegistry,
  LegacyVerificationManifest,
  OrchestratorConfig,
  SlowSuiteRegistry,
  VerificationScopePolicy,
} from "./contracts.js";
import {
  buildCanonicalProtectedSet,
  assertManifestProtectedPathsCovered,
} from "./protected-roots.js";
import {
  assertInvariantSuiteRegistry,
  assertLegacyVerificationManifest,
  assertOrchestratorConfig,
  assertSlowSuiteRegistry,
  assertVerificationScopePolicy,
} from "./schema.js";

export const WORKED_EXAMPLE_SCHEMA_VERSION = "worked-example.v1" as const;
export const WORKED_EXAMPLE_VALIDATION_SCHEMA_VERSION =
  "worked-example-validation.v1" as const;

export const WORKED_EXAMPLE_FILE_ROLES = [
  "documentation",
  "benchmark-matrix",
  "orchestrator-config",
  "invariant-suite",
  "legacy-verification-manifest",
  "slow-suite-registry",
  "verification-scope-policy",
] as const;

export type WorkedExampleFileRole = (typeof WORKED_EXAMPLE_FILE_ROLES)[number];

export const WORKED_EXAMPLE_PROVENANCE_DISPOSITIONS = [
  "template-documentation",
  "source-snapshot",
  "maintained-compatibility-adapter",
] as const;

export type WorkedExampleProvenanceDisposition =
  (typeof WORKED_EXAMPLE_PROVENANCE_DISPOSITIONS)[number];

export interface WorkedExampleFileDescriptor {
  readonly path: string;
  readonly role: WorkedExampleFileRole;
  readonly provenance: WorkedExampleProvenanceDisposition;
  readonly bytes: number;
  readonly sha256: string;
}

export interface WorkedExampleDescriptor {
  readonly schemaVersion: typeof WORKED_EXAMPLE_SCHEMA_VERSION;
  readonly id: string;
  readonly source: {
    readonly projectName: string;
    readonly sourceCommit: string;
    readonly templateIntroductionCommit: string;
  };
  readonly semantics: {
    readonly disposition: "historical-worked-example";
    readonly manifestSchema: "verification-manifest.v1";
    readonly activeRuntimeEligible: false;
    readonly implicitFallbackAllowed: false;
    readonly commissioningAllowed: false;
    readonly executionAllowed: false;
  };
  readonly links: {
    readonly documentationPath: string;
    readonly benchmarkMatrixPath: string;
    readonly configPath: string;
    readonly invariantSuitePath: string;
    readonly legacyVerificationManifestPath: string;
    readonly slowSuiteRegistryPath: string;
    readonly scopePolicyPath: string;
  };
  readonly identities: {
    readonly legacyMilestoneId: string;
    readonly benchmarkMatrixId: string;
    readonly invariantSuiteId: string;
    readonly slowSuiteRegistryId: string;
    readonly scopePolicyId: string;
  };
  readonly files: readonly WorkedExampleFileDescriptor[];
}

export interface WorkedExampleValidationResult {
  readonly schemaVersion: typeof WORKED_EXAMPLE_VALIDATION_SCHEMA_VERSION;
  readonly status: "PASS";
  readonly descriptor: {
    readonly id: string;
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly semantics: WorkedExampleDescriptor["semantics"];
  readonly files: readonly WorkedExampleFileDescriptor[];
}

interface LoadedFile {
  readonly path: string;
  readonly absolutePath: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly contents: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function safeIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u.test(value)
  );
}

function commitId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function safeDirectFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u.test(value)
  );
}

function assertFileDescriptor(value: unknown): WorkedExampleFileDescriptor {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["path", "role", "provenance", "bytes", "sha256"]) ||
    !safeDirectFileName(value["path"]) ||
    !WORKED_EXAMPLE_FILE_ROLES.includes(
      value["role"] as WorkedExampleFileRole,
    ) ||
    !WORKED_EXAMPLE_PROVENANCE_DISPOSITIONS.includes(
      value["provenance"] as WorkedExampleProvenanceDisposition,
    ) ||
    !Number.isSafeInteger(value["bytes"]) ||
    (value["bytes"] as number) <= 0 ||
    !sha256(value["sha256"])
  )
    throw new Error("Worked-example file descriptor is invalid.");
  return value as unknown as WorkedExampleFileDescriptor;
}

export function assertWorkedExampleDescriptor(
  value: unknown,
): WorkedExampleDescriptor {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "id",
      "source",
      "semantics",
      "links",
      "identities",
      "files",
    ]) ||
    value["schemaVersion"] !== WORKED_EXAMPLE_SCHEMA_VERSION ||
    !safeIdentifier(value["id"])
  )
    throw new Error("Worked-example descriptor root is invalid.");

  const source = value["source"];
  if (
    !isRecord(source) ||
    !exactKeys(source, [
      "projectName",
      "sourceCommit",
      "templateIntroductionCommit",
    ]) ||
    typeof source["projectName"] !== "string" ||
    source["projectName"].trim().length === 0 ||
    !commitId(source["sourceCommit"]) ||
    !commitId(source["templateIntroductionCommit"])
  )
    throw new Error("Worked-example source provenance is invalid.");

  const semantics = value["semantics"];
  if (
    !isRecord(semantics) ||
    !exactKeys(semantics, [
      "disposition",
      "manifestSchema",
      "activeRuntimeEligible",
      "implicitFallbackAllowed",
      "commissioningAllowed",
      "executionAllowed",
    ]) ||
    semantics["disposition"] !== "historical-worked-example" ||
    semantics["manifestSchema"] !== "verification-manifest.v1" ||
    semantics["activeRuntimeEligible"] !== false ||
    semantics["implicitFallbackAllowed"] !== false ||
    semantics["commissioningAllowed"] !== false ||
    semantics["executionAllowed"] !== false
  )
    throw new Error(
      "Worked-example semantics must remain historical, legacy-only, inactive, and non-executable.",
    );

  const links = value["links"];
  const linkKeys = [
    "documentationPath",
    "benchmarkMatrixPath",
    "configPath",
    "invariantSuitePath",
    "legacyVerificationManifestPath",
    "slowSuiteRegistryPath",
    "scopePolicyPath",
  ] as const;
  if (
    !isRecord(links) ||
    !exactKeys(links, linkKeys) ||
    linkKeys.some((key) => !safeDirectFileName(links[key]))
  )
    throw new Error("Worked-example links are invalid or escape the package.");

  const identities = value["identities"];
  const identityKeys = [
    "legacyMilestoneId",
    "benchmarkMatrixId",
    "invariantSuiteId",
    "slowSuiteRegistryId",
    "scopePolicyId",
  ] as const;
  if (
    !isRecord(identities) ||
    !exactKeys(identities, identityKeys) ||
    identityKeys.some((key) => !safeIdentifier(identities[key]))
  )
    throw new Error("Worked-example linked identities are invalid.");

  if (!Array.isArray(value["files"]))
    throw new Error("Worked-example files must be an array.");
  const files = value["files"].map(assertFileDescriptor);
  if (files.length !== WORKED_EXAMPLE_FILE_ROLES.length)
    throw new Error(
      "Worked-example descriptor must enumerate every file role.",
    );
  const paths = files.map((file) => file.path);
  const roles = files.map((file) => file.role);
  if (
    new Set(paths).size !== paths.length ||
    new Set(roles).size !== roles.length ||
    !WORKED_EXAMPLE_FILE_ROLES.every((role) => roles.includes(role))
  )
    throw new Error("Worked-example paths and roles must be exact and unique.");
  if (paths.some((path, index) => index > 0 && path < paths[index - 1]!))
    throw new Error("Worked-example files must use canonical path order.");

  const pathByRole = new Map(files.map((file) => [file.role, file.path]));
  const expectedLinks = new Map<WorkedExampleFileRole, string>([
    ["documentation", links["documentationPath"] as string],
    ["benchmark-matrix", links["benchmarkMatrixPath"] as string],
    ["orchestrator-config", links["configPath"] as string],
    ["invariant-suite", links["invariantSuitePath"] as string],
    [
      "legacy-verification-manifest",
      links["legacyVerificationManifestPath"] as string,
    ],
    ["slow-suite-registry", links["slowSuiteRegistryPath"] as string],
    ["verification-scope-policy", links["scopePolicyPath"] as string],
  ]);
  for (const [role, path] of expectedLinks)
    if (pathByRole.get(role) !== path)
      throw new Error(
        `Worked-example link for ${role} does not match its file.`,
      );

  return value as unknown as WorkedExampleDescriptor;
}

function repositoryRelativePath(root: string, path: string): string {
  const repositoryRelative = relative(root, path).replaceAll("\\", "/");
  if (
    repositoryRelative.length === 0 ||
    isAbsolute(repositoryRelative) ||
    repositoryRelative.split("/").includes("..")
  )
    throw new Error(`Worked-example path escapes the repository: ${path}.`);
  return repositoryRelative;
}

async function loadContainedFile(
  repositoryRoot: string,
  requestedPath: string,
): Promise<LoadedFile> {
  const absolutePath = resolve(repositoryRoot, requestedPath);
  const path = repositoryRelativePath(repositoryRoot, absolutePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Worked-example path must be a regular non-symlink file: ${path}.`,
    );
  const resolvedPath = await realpath(absolutePath);
  repositoryRelativePath(await realpath(repositoryRoot), resolvedPath);
  const contents = await readFile(absolutePath);
  return {
    path,
    absolutePath,
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
    contents,
  };
}

function assertTrackedFiles(
  repositoryRoot: string,
  paths: readonly string[],
): void {
  const result = spawnSync(
    "git",
    ["-C", repositoryRoot, "ls-files", "--error-unmatch", "--", ...paths],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Worked-example descriptor and payloads must all be tracked files: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  const tracked = new Set(
    result.stdout
      .split(/\r?\n/u)
      .filter((path) => path.length > 0)
      .map((path) => path.replaceAll("\\", "/")),
  );
  const missing = paths.filter((path) => !tracked.has(path));
  if (missing.length > 0)
    throw new Error(
      `Worked-example files are not tracked: ${missing.join(", ")}.`,
    );
}

function parseJson(file: LoadedFile): unknown {
  try {
    return JSON.parse(file.contents.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Worked-example JSON is invalid at ${file.path}: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
}

function fileByRole(
  descriptor: WorkedExampleDescriptor,
  loadedByPath: ReadonlyMap<string, LoadedFile>,
  role: WorkedExampleFileRole,
): LoadedFile {
  const reference = descriptor.files.find((file) => file.role === role);
  const loaded = reference ? loadedByPath.get(reference.path) : undefined;
  if (!reference || !loaded)
    throw new Error(`Worked-example file role ${role} was not loaded.`);
  return loaded;
}

function assertKnownCheckIds(input: {
  readonly manifest: LegacyVerificationManifest;
  readonly policy: VerificationScopePolicy;
  readonly benchmark: BenchmarkMatrix;
}): void {
  const catalogue = buildScopeCheckCatalogue(input.manifest);
  for (const ids of Object.values(input.policy.mandatoryChecks))
    orderScopeCheckIds(ids, catalogue);
  for (const ids of Object.values(input.policy.workspaceChecks))
    orderScopeCheckIds(ids, catalogue);
  orderScopeCheckIds(input.benchmark.historical.fullSafeCheckIds, catalogue);
  for (const ids of Object.values(
    input.benchmark.historical.iterationCheckIdsByClass,
  ))
    orderScopeCheckIds(ids, catalogue);
}

function assertCrossFileContract(input: {
  readonly descriptor: WorkedExampleDescriptor;
  readonly config: OrchestratorConfig;
  readonly invariantSuite: InvariantSuiteRegistry;
  readonly legacyManifest: LegacyVerificationManifest;
  readonly slowSuiteRegistry: SlowSuiteRegistry;
  readonly scopePolicy: VerificationScopePolicy;
  readonly benchmarkMatrix: BenchmarkMatrix;
}): void {
  const { descriptor } = input;
  if (input.config.project.name !== descriptor.source.projectName)
    throw new Error(
      "Worked-example project name does not match descriptor provenance.",
    );
  if (
    input.legacyManifest.milestoneId !== descriptor.identities.legacyMilestoneId
  )
    throw new Error("Worked-example legacy milestone identity drifted.");
  if (
    input.legacyManifest.requiredInvariantSuiteId !==
      descriptor.identities.invariantSuiteId ||
    input.invariantSuite.id !== descriptor.identities.invariantSuiteId
  )
    throw new Error("Worked-example invariant-suite identity drifted.");
  if (
    input.legacyManifest.requiredBenchmarkMatrixId !==
      descriptor.identities.benchmarkMatrixId ||
    input.benchmarkMatrix.id !== descriptor.identities.benchmarkMatrixId
  )
    throw new Error("Worked-example benchmark-matrix identity drifted.");
  if (input.scopePolicy.id !== descriptor.identities.scopePolicyId)
    throw new Error("Worked-example scope-policy identity drifted.");
  if (input.slowSuiteRegistry.id !== descriptor.identities.slowSuiteRegistryId)
    throw new Error("Worked-example slow-suite identity drifted.");
  assertManifestProtectedPathsCovered(
    input.legacyManifest,
    buildCanonicalProtectedSet(input.config),
  );
  assertKnownCheckIds({
    manifest: input.legacyManifest,
    policy: input.scopePolicy,
    benchmark: input.benchmarkMatrix,
  });
}

export async function validateWorkedExample(input: {
  readonly repositoryRoot: string;
  readonly descriptorPath: string;
}): Promise<WorkedExampleValidationResult> {
  const repositoryRoot = await realpath(resolve(input.repositoryRoot));
  const descriptorFile = await loadContainedFile(
    repositoryRoot,
    input.descriptorPath,
  );
  const descriptor = assertWorkedExampleDescriptor(parseJson(descriptorFile));
  const packageDirectory = dirname(descriptorFile.absolutePath);
  const actualEntries = (
    await readdir(packageDirectory, { withFileTypes: true })
  )
    .map((entry) => entry.name)
    .sort();
  const expectedEntries = [
    basename(descriptorFile.absolutePath),
    ...descriptor.files.map((file) => file.path),
  ].sort();
  if (
    actualEntries.length !== expectedEntries.length ||
    actualEntries.some((entry, index) => entry !== expectedEntries[index])
  )
    throw new Error(
      `Worked-example package file set is not exact. Expected ${expectedEntries.join(", ")}; received ${actualEntries.join(", ")}.`,
    );

  const loadedFiles: LoadedFile[] = [];
  for (const reference of descriptor.files) {
    const loaded = await loadContainedFile(
      repositoryRoot,
      resolve(packageDirectory, reference.path),
    );
    if (loaded.bytes !== reference.bytes || loaded.sha256 !== reference.sha256)
      throw new Error(
        `Worked-example payload identity drifted for ${reference.path}: expected ${reference.bytes}/${reference.sha256}, received ${loaded.bytes}/${loaded.sha256}.`,
      );
    loadedFiles.push(loaded);
  }
  assertTrackedFiles(repositoryRoot, [
    descriptorFile.path,
    ...loadedFiles.map((file) => file.path),
  ]);

  const loadedByFileName = new Map(
    loadedFiles.map((file) => [basename(file.path), file]),
  );
  const config = assertOrchestratorConfig(
    parseJson(fileByRole(descriptor, loadedByFileName, "orchestrator-config")),
  );
  const invariantSuite = assertInvariantSuiteRegistry(
    parseJson(fileByRole(descriptor, loadedByFileName, "invariant-suite")),
  );
  const legacyManifest = assertLegacyVerificationManifest(
    parseJson(
      fileByRole(descriptor, loadedByFileName, "legacy-verification-manifest"),
    ),
  );
  const slowSuiteRegistry = assertSlowSuiteRegistry(
    parseJson(fileByRole(descriptor, loadedByFileName, "slow-suite-registry")),
  );
  const scopePolicy = assertVerificationScopePolicy(
    parseJson(
      fileByRole(descriptor, loadedByFileName, "verification-scope-policy"),
    ),
  );
  const benchmarkMatrix = assertBenchmarkMatrix(
    parseJson(fileByRole(descriptor, loadedByFileName, "benchmark-matrix")),
  );
  assertCrossFileContract({
    descriptor,
    config,
    invariantSuite,
    legacyManifest,
    slowSuiteRegistry,
    scopePolicy,
    benchmarkMatrix,
  });

  return {
    schemaVersion: WORKED_EXAMPLE_VALIDATION_SCHEMA_VERSION,
    status: "PASS",
    descriptor: {
      id: descriptor.id,
      path: descriptorFile.path,
      bytes: descriptorFile.bytes,
      sha256: descriptorFile.sha256,
    },
    semantics: descriptor.semantics,
    files: descriptor.files.map((file) => ({ ...file })),
  };
}

export function renderWorkedExampleValidationResult(
  result: WorkedExampleValidationResult,
): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
