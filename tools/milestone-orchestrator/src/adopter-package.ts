import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { format as formatWithPrettier } from "prettier";

import { assertCommissioningInput } from "./commissioning.js";
import {
  COMMISSIONING_INPUT_SCHEMA_VERSION,
  GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
  SCOPE_TRIGGER_CLASSES,
  type CommissioningInput,
  type FocusedVerificationCommand,
  type OrchestratorConfig,
} from "./contracts.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import {
  assertInvariantSuiteRegistry,
  assertOrchestratorConfig,
  assertSlowSuiteRegistry,
  assertVerificationScopePolicy,
} from "./schema.js";

export const ADOPTER_PACKAGE_DEFINITION_SCHEMA_VERSION =
  "milestone-loop-adopter-package.v1" as const;
export const ADOPTER_PACKAGE_RESULT_SCHEMA_VERSION =
  "milestone-loop-adopter-package-result.v1" as const;

const CONFIG_PATH = "tools/milestone-orchestrator/config/default.json" as const;
const INVARIANT_PATH =
  "tools/milestone-orchestrator/config/invariant-suite.json" as const;
const SCOPE_PATH =
  "tools/milestone-orchestrator/config/verification-scope-policy.json" as const;
const SLOW_SUITE_PATH =
  "tools/milestone-orchestrator/config/slow-suite-registry.json" as const;
const COMMISSIONING_INPUT_PATH =
  "tools/milestone-orchestrator/config/commissioning-input.json" as const;
const ACTIVE_MANIFEST_PATH = ".agent/verification-manifest.json" as const;
const IMMUTABLE_LOCK_PATH = "evals/immutable-contract-lock.json" as const;

const runtimeRootFiles = [
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "eslint.config.mjs",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/verify.mjs",
  "scripts/verify.ps1",
  "tools/evidence.mjs",
  "tools/production-build.mjs",
  "tools/run-tool-evidence.mjs",
  "tools/workspace-typecheck.mjs",
  "tools/milestone-orchestrator/ci/exact-runtime-workflow-contract.ts",
  "tools/milestone-orchestrator/package.json",
  "tools/milestone-orchestrator/schemas/model-policy.schema.json",
  "tools/milestone-orchestrator/schemas/orchestrator-config.schema.json",
  "tools/milestone-orchestrator/src/test-run-probe.cjs",
  "tools/milestone-orchestrator/tsconfig.json",
  "tsconfig.base.json",
] as const;

const excludedRuntimeSourceFiles = new Set([
  "adopter-package.ts",
  "adopter-package-cli.ts",
  "adopter-package-proof.ts",
  "adopter-package-proof-cli.ts",
]);

type JsonRecord = Record<string, unknown>;

export interface AdopterPackageDefinition {
  readonly schemaVersion: typeof ADOPTER_PACKAGE_DEFINITION_SCHEMA_VERSION;
  readonly project: {
    readonly name: string;
    readonly packageName: string;
    readonly targetBranch: string;
  };
  readonly git: {
    readonly userName: string;
    readonly userEmail: string;
    readonly timestamp: string;
  };
  readonly authority: {
    readonly projectGoalPath: string;
    readonly acceptanceProsePath: string;
    readonly acceptanceManifestPath: string;
    readonly hiddenValidationProtocolPath: string;
  };
  readonly identifiers: {
    readonly commissioningId: string;
    readonly invariantSuiteId: string;
    readonly scopePolicyId: string;
    readonly slowSuiteRegistryId: string;
    readonly reconciliationPolicyId: string;
  };
}

export interface AdopterPackageResult {
  readonly schemaVersion: typeof ADOPTER_PACKAGE_RESULT_SCHEMA_VERSION;
  readonly status: "PASS";
  readonly outputRoot: string;
  readonly project: {
    readonly name: string;
    readonly packageName: string;
    readonly targetBranch: string;
    readonly profile: "bootstrap";
  };
  readonly git: {
    readonly authorityBaseCommit: string;
    readonly commissioningInputCommit: string;
    readonly tree: string;
    readonly branch: string;
    readonly commitCount: 2;
    readonly clean: true;
  };
  readonly generated: {
    readonly immutableContractLockSha256: string;
    readonly commissioningInputPath: typeof COMMISSIONING_INPUT_PATH;
    readonly commissioningInputSha256: string;
    readonly activeManifestPresent: false;
    readonly readinessMarkerPresent: false;
  };
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    actual.every((key, index) => key === required[index])
  );
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !isAbsolute(value) &&
    !/^[A-Za-z]:/u.test(value) &&
    !value.includes("\\") &&
    !value.split("/").some((segment) => segment === "" || segment === "..") &&
    !/[\0\r\n*?]/u.test(value)
  );
}

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  );
}

function canonicalTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  input?: {
    readonly timestamp?: string;
    readonly acceptedStatuses?: readonly number[];
  },
): {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const acceptedStatuses = input?.acceptedStatuses ?? [0];
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: "0",
      ...(input?.timestamp
        ? {
            GIT_AUTHOR_DATE: input.timestamp,
            GIT_COMMITTER_DATE: input.timestamp,
          }
        : {}),
    },
  });
  if (
    result.error ||
    result.status === null ||
    !acceptedStatuses.includes(result.status)
  ) {
    const detail =
      result.error?.message ||
      result.stderr.trim() ||
      `exit ${String(result.status)}`;
    throw new Error(
      `Adopter package Git command failed for git ${args.join(" ")}: ${detail}.`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gitText(repositoryRoot: string, args: readonly string[]): string {
  return git(repositoryRoot, args).stdout.trim();
}

function validateBranchName(branch: string): void {
  const result = spawnSync("git", ["check-ref-format", "--branch", branch], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.stdout.trim() !== branch)
    throw new Error(`Adopter target branch is invalid: ${branch}.`);
}

function assertNoSourceIdentity(value: string, label: string): void {
  if (
    /d-?0?31|d-?0?32|ski[ -]?tycoon|milestone-loop-template|example project/iu.test(
      value,
    )
  )
    throw new Error(`${label} contains a source-project identity.`);
}

export function assertAdopterPackageDefinition(
  value: unknown,
): AdopterPackageDefinition {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "project",
      "git",
      "authority",
      "identifiers",
    ]) ||
    value["schemaVersion"] !== ADOPTER_PACKAGE_DEFINITION_SCHEMA_VERSION
  )
    throw new Error(
      `Adopter package definition must be strict ${ADOPTER_PACKAGE_DEFINITION_SCHEMA_VERSION}.`,
    );
  const project = value["project"];
  const gitIdentity = value["git"];
  const authority = value["authority"];
  const identifiers = value["identifiers"];
  if (
    !isRecord(project) ||
    !exactKeys(project, ["name", "packageName", "targetBranch"]) ||
    !nonemptyString(project["name"]) ||
    typeof project["packageName"] !== "string" ||
    !/^[a-z0-9](?:[a-z0-9._-]{0,212}[a-z0-9])?$/u.test(
      project["packageName"],
    ) ||
    !nonemptyString(project["targetBranch"])
  )
    throw new Error("Adopter package project identity is invalid.");
  validateBranchName(project["targetBranch"]);
  assertNoSourceIdentity(project["name"], "Adopter project name");
  assertNoSourceIdentity(project["packageName"], "Adopter package name");

  if (
    !isRecord(gitIdentity) ||
    !exactKeys(gitIdentity, ["userName", "userEmail", "timestamp"]) ||
    !nonemptyString(gitIdentity["userName"]) ||
    typeof gitIdentity["userEmail"] !== "string" ||
    !/^[^\s@]+@[^\s@]+$/u.test(gitIdentity["userEmail"]) ||
    !canonicalTimestamp(gitIdentity["timestamp"])
  )
    throw new Error("Adopter package Git identity is invalid.");

  const authorityKeys = [
    "projectGoalPath",
    "acceptanceProsePath",
    "acceptanceManifestPath",
    "hiddenValidationProtocolPath",
  ] as const;
  if (
    !isRecord(authority) ||
    !exactKeys(authority, authorityKeys) ||
    authorityKeys.some((key) => !safeRelativePath(authority[key])) ||
    new Set(authorityKeys.map((key) => authority[key])).size !==
      authorityKeys.length
  )
    throw new Error("Adopter authority source paths are invalid.");

  const identifierKeys = [
    "commissioningId",
    "invariantSuiteId",
    "scopePolicyId",
    "slowSuiteRegistryId",
    "reconciliationPolicyId",
  ] as const;
  if (
    !isRecord(identifiers) ||
    !exactKeys(identifiers, identifierKeys) ||
    identifierKeys.some((key) => !identifier(identifiers[key])) ||
    new Set(identifierKeys.map((key) => identifiers[key])).size !==
      identifierKeys.length
  )
    throw new Error("Adopter package identifiers are invalid or duplicated.");
  for (const key of identifierKeys)
    assertNoSourceIdentity(
      String(identifiers[key]),
      `Adopter identifier ${key}`,
    );

  return value as unknown as AdopterPackageDefinition;
}

async function readStrictDefinition(path: string): Promise<{
  readonly definition: AdopterPackageDefinition;
  readonly directory: string;
}> {
  const absolute = resolve(path);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      "Adopter package definition must be a regular non-symlink file.",
    );
  const directory = await realpath(dirname(absolute));
  const resolved = await realpath(absolute);
  const contained = relative(directory, resolved);
  if (!contained || contained.startsWith("..") || isAbsolute(contained))
    throw new Error(
      "Adopter package definition escapes its containing directory.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse((await readFile(absolute)).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Adopter package definition is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
  return { definition: assertAdopterPackageDefinition(parsed), directory };
}

async function readDefinitionFile(
  definitionDirectory: string,
  relativePath: string,
  label: string,
): Promise<Buffer> {
  const absolute = resolve(definitionDirectory, relativePath);
  const contained = slash(relative(definitionDirectory, absolute));
  if (
    !contained ||
    contained.startsWith("..") ||
    isAbsolute(contained) ||
    contained !== relativePath
  )
    throw new Error(`${label} path escapes the definition directory.`);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`${label} must be a regular non-symlink file.`);
  const resolved = await realpath(absolute);
  const realContained = slash(relative(definitionDirectory, resolved));
  if (
    !realContained ||
    realContained.startsWith("..") ||
    isAbsolute(realContained)
  )
    throw new Error(`${label} resolves outside the definition directory.`);
  return readFile(absolute);
}

async function writeBytes(
  outputRoot: string,
  repositoryPath: string,
  contents: Buffer | string,
): Promise<void> {
  const destination = resolve(outputRoot, repositoryPath);
  const contained = slash(relative(outputRoot, destination));
  if (!contained || contained.startsWith("..") || isAbsolute(contained))
    throw new Error(
      `Generated path escapes the adopter package: ${repositoryPath}.`,
    );
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, { flag: "wx" });
}

async function writeJson(
  outputRoot: string,
  repositoryPath: string,
  value: unknown,
): Promise<void> {
  await writeBytes(
    outputRoot,
    repositoryPath,
    await formattedJson(value, repositoryPath),
  );
}

async function formattedJson(
  value: unknown,
  filepath: string,
): Promise<string> {
  return formatWithPrettier(JSON.stringify(value), { filepath });
}

async function copyRepositoryFile(
  sourceRoot: string,
  outputRoot: string,
  repositoryPath: string,
): Promise<void> {
  const source = resolve(sourceRoot, repositoryPath);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Reusable runtime path is not a regular file: ${repositoryPath}.`,
    );
  const destination = resolve(outputRoot, repositoryPath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination, 0);
}

async function walkRegularFiles(root: string): Promise<readonly string[]> {
  const results: string[] = [];
  const ignoredDirectories = new Set([
    ".git",
    ".tools",
    "artifacts",
    "dist",
    "node_modules",
  ]);
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      if (entry.isSymbolicLink())
        throw new Error(`Reusable template contains a symbolic link: ${path}.`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) results.push(slash(relative(root, path)));
      else
        throw new Error(
          `Reusable template contains an unsupported path: ${path}.`,
        );
    }
  }
  await visit(root);
  return results;
}

async function copyReusableRuntime(
  sourceRoot: string,
  outputRoot: string,
): Promise<void> {
  for (const path of runtimeRootFiles)
    await copyRepositoryFile(sourceRoot, outputRoot, path);

  const runtimeSourceRoot = resolve(
    sourceRoot,
    "tools/milestone-orchestrator/src",
  );
  for (const relativePath of await walkRegularFiles(runtimeSourceRoot)) {
    if (
      !relativePath.endsWith(".ts") ||
      relativePath.endsWith(".test.ts") ||
      excludedRuntimeSourceFiles.has(relativePath)
    )
      continue;
    await copyRepositoryFile(
      sourceRoot,
      outputRoot,
      `tools/milestone-orchestrator/src/${relativePath}`,
    );
  }

  const ociFixtureRoot = resolve(sourceRoot, "fixtures/oci-candidate");
  for (const relativePath of await walkRegularFiles(ociFixtureRoot))
    await copyRepositoryFile(
      sourceRoot,
      outputRoot,
      `fixtures/oci-candidate/${relativePath}`,
    );
}

async function copyScaffoldAssets(
  sourceRoot: string,
  outputRoot: string,
): Promise<void> {
  const scaffoldRoot = resolve(
    sourceRoot,
    "tools/milestone-orchestrator/template/bootstrap-adopter/scaffold",
  );
  for (const relativePath of await walkRegularFiles(scaffoldRoot)) {
    const source = resolve(scaffoldRoot, relativePath);
    const destination = resolve(outputRoot, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    if (existsSync(destination))
      await writeFile(destination, await readFile(source));
    else await copyFile(source, destination, 0);
  }
}

function packageScripts(): Record<string, string> {
  return {
    verify: "node scripts/verify.mjs",
    "verify:dependencies": "node tools/bootstrap-evidence.mjs dependencies",
    format: "prettier --write app scripts tools *.mjs *.json *.yaml",
    "format:check": "node tools/bootstrap-evidence.mjs format",
    lint: "node tools/bootstrap-evidence.mjs lint",
    "lint:architecture": "node tools/bootstrap-evidence.mjs architecture",
    typecheck: "node tools/bootstrap-evidence.mjs typecheck",
    build: "tsx tools/run-tool-evidence.mjs build",
    "build:production": "node tools/bootstrap-build.mjs",
    "test:unit": "node tools/bootstrap-evidence.mjs test",
    "test:orchestrator": "node tools/bootstrap-evidence.mjs test",
    "test:invariants":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts invariants",
    "test:unit:fast":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts fast-unit",
    "test:unit:migrations":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts migration-unit",
    "verify:bootstrap:simulation":
      "node tools/bootstrap-evidence.mjs simulation",
    "verify:bootstrap:persistence":
      "node tools/bootstrap-evidence.mjs persistence",
    "verify:bootstrap:browser": "node tools/bootstrap-evidence.mjs browser",
    "verify:iteration":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts iteration",
    "verify:candidate":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts candidate",
    "verify:milestone":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts milestone",
    "verify:periodic":
      "tsx tools/milestone-orchestrator/src/verification-cli.ts periodic",
    "loop:commission":
      "tsx tools/milestone-orchestrator/src/commissioning-cli.ts",
    "loop:status": "tsx tools/milestone-orchestrator/src/cli.ts status",
    "loop:doctor": "tsx tools/milestone-orchestrator/src/cli.ts doctor",
    "loop:plan": "tsx tools/milestone-orchestrator/src/cli.ts plan",
    "loop:run": "tsx tools/milestone-orchestrator/src/cli.ts run",
    "loop:resume": "tsx tools/milestone-orchestrator/src/cli.ts resume",
  };
}

function focusedCommands(): readonly FocusedVerificationCommand[] {
  return [
    {
      id: "test-invariants",
      argv: ["pnpm", "test:invariants"],
      tiers: ["iteration", "candidate", "milestone"],
      expectedArtifactKinds: ["invariant-suite-report"],
    },
    {
      id: "format-check",
      argv: ["pnpm", "format:check"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["format-report"],
    },
    {
      id: "lint",
      argv: ["pnpm", "lint"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["lint-report"],
    },
    {
      id: "lint-architecture",
      argv: ["pnpm", "lint:architecture"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["architecture-report"],
    },
    {
      id: "typecheck",
      argv: ["pnpm", "typecheck"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["typecheck-report"],
    },
    {
      id: "build",
      argv: ["pnpm", "build"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["build-report"],
    },
    {
      id: "bootstrap-unit",
      argv: ["pnpm", "test:unit"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["vitest-report"],
    },
    {
      id: "bootstrap-simulation",
      argv: ["pnpm", "verify:bootstrap:simulation"],
      tiers: ["milestone"],
      expectedArtifactKinds: [
        "node-checkpoints",
        "worker-checkpoints",
        "user-action-log",
        "replay-report",
        "parity-report",
      ],
    },
    {
      id: "bootstrap-persistence",
      argv: ["pnpm", "verify:bootstrap:persistence"],
      tiers: ["milestone"],
      expectedArtifactKinds: ["save-envelope", "save-roundtrip-report"],
    },
    {
      id: "bootstrap-browser",
      argv: ["pnpm", "verify:bootstrap:browser"],
      tiers: ["milestone"],
      expectedArtifactKinds: [
        "playwright-report",
        "screenshot",
        "browser-diagnostics",
        "visual-review",
      ],
    },
  ];
}

function generatedInvariantRegistry(definition: AdopterPackageDefinition) {
  return assertInvariantSuiteRegistry({
    schemaVersion: "1.0.0",
    id: definition.identifiers.invariantSuiteId,
    warmRuntimeTargetMs: 60_000,
    serial: true,
    entries: [
      {
        id: "protected-integrity",
        ownerPaths: [
          "PROJECT_GOAL.md",
          "evals/",
          "scripts/verify.mjs",
          "tools/milestone-orchestrator/src/contract-integrity.ts",
        ],
        triggerPaths: [
          "PROJECT_GOAL.md",
          "AGENTS.md",
          "evals/",
          ".agent/",
          "scripts/verify.mjs",
          "tools/milestone-orchestrator/src/contract-integrity.ts",
        ],
        argv: [
          "node",
          "node_modules/tsx/dist/cli.mjs",
          "tools/milestone-orchestrator/src/verification-cli.ts",
          "contract-integrity",
        ],
        expectedArtifactKinds: ["contract-integrity-report"],
      },
      {
        id: "bootstrap-kernel-parity",
        ownerPaths: ["app/kernel.mjs"],
        triggerPaths: ["app/"],
        testFile: "app/kernel.test.ts",
        testTitle: "replays user actions deterministically",
        argv: [
          "pnpm",
          "exec",
          "vitest",
          "run",
          "app/kernel.test.ts",
          "--fileParallelism=false",
        ],
        expectedArtifactKinds: ["invariant-vitest-report"],
      },
    ],
  });
}

function generatedScopePolicy(definition: AdopterPackageDefinition) {
  return assertVerificationScopePolicy({
    schemaVersion: "1.0.0",
    id: definition.identifiers.scopePolicyId,
    mode: "shadow-only",
    unknownDisposition: "fail-broad",
    closureSuppressionAllowed: false,
    browserHostScriptPatterns: ["^tools/bootstrap-evidence\\.mjs$"],
    triggerClasses: [...SCOPE_TRIGGER_CLASSES],
    broadTriggerClasses: ["protected-authority", "package-graph", "unknown"],
    mandatoryChecks: Object.fromEntries(
      SCOPE_TRIGGER_CLASSES.map((trigger) => [trigger, ["test-invariants"]]),
    ),
    workspaceChecks: {
      [definition.project.packageName]: ["test-invariants"],
      "@milestone-loop/orchestrator": ["test-invariants"],
    },
    graduation: {
      deferred: true,
      minimumComparisons: 30,
      minimumExamplesPerTrigger: 3,
      requiresZeroFalseNegatives: true,
      requiresZeroUnknowns: true,
      requiresDeterministicRecommendations: true,
      requiresMeasuredSavingsAboveNoise: true,
      requiresNoClosureRegression: true,
      requiresIndependentReview: true,
      requiresExplicitPolicyChange: true,
    },
  });
}

async function generatedConfig(
  sourceRoot: string,
  definition: AdopterPackageDefinition,
): Promise<OrchestratorConfig> {
  const template = JSON.parse(
    await readFile(
      resolve(sourceRoot, "tools/milestone-orchestrator/config/default.json"),
      "utf8",
    ),
  ) as JsonRecord;
  template["project"] = {
    name: definition.project.name,
    authorityFile: "PROJECT_GOAL.md",
    verticalSpine: { minimumCategories: 4, categoryPatterns: [] },
  };
  template["targetBranch"] = definition.project.targetBranch;
  template["protectedPaths"] = [
    "PROJECT_GOAL.md",
    "AGENTS.md",
    "evals/ACCEPTANCE.md",
    "evals/acceptance-manifest.json",
    "evals/HIDDEN_VALIDATION_PROTOCOL.md",
    IMMUTABLE_LOCK_PATH,
    ".agent/readiness-profile-activated.json",
    "scripts/verify.mjs",
    "pnpm-lock.yaml",
    "package.json",
    CONFIG_PATH,
    INVARIANT_PATH,
    SCOPE_PATH,
    COMMISSIONING_INPUT_PATH,
    ACTIVE_MANIFEST_PATH,
  ];
  return assertOrchestratorConfig(template);
}

async function createImmutableLock(outputRoot: string): Promise<string> {
  const definitions = [
    ["PROJECT_GOAL.md", "HUMAN_REVISION_ONLY"],
    ["evals/ACCEPTANCE.md", "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION"],
    [
      "evals/acceptance-manifest.json",
      "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION",
    ],
    ["evals/HIDDEN_VALIDATION_PROTOCOL.md", "HUMAN_REVISION_ONLY"],
  ] as const;
  const files = await Promise.all(
    definitions.map(async ([path, changeClass]) => {
      const digest = sha256(await readFile(resolve(outputRoot, path)));
      return {
        path,
        changeClass,
        baselineSha256: digest,
        activeSha256: digest,
      };
    }),
  );
  const lock = {
    schemaVersion: "1.0.0",
    calibrationTransition: {
      state: "open_not_started",
      completedCount: 0,
      maximumCount: 1,
      recordPath: null,
    },
    files,
  };
  const bytes = await formattedJson(lock, IMMUTABLE_LOCK_PATH);
  await writeBytes(outputRoot, IMMUTABLE_LOCK_PATH, bytes);
  return sha256(bytes);
}

function commissioningInput(input: {
  readonly definition: AdopterPackageDefinition;
  readonly config: OrchestratorConfig;
  readonly baseCommit: string;
  readonly lockSha256: string;
}): CommissioningInput {
  const requiredProtectedPaths = buildCanonicalProtectedSet(input.config, [
    CONFIG_PATH,
    INVARIANT_PATH,
    SCOPE_PATH,
    COMMISSIONING_INPUT_PATH,
    ACTIVE_MANIFEST_PATH,
  ]);
  return assertCommissioningInput({
    schemaVersion: COMMISSIONING_INPUT_SCHEMA_VERSION,
    commissioning: {
      id: input.definition.identifiers.commissioningId,
      targetBranch: input.definition.project.targetBranch,
      baseCommit: input.baseCommit,
      profile: "bootstrap",
    },
    sources: {
      configPath: CONFIG_PATH,
      invariantSuitePath: INVARIANT_PATH,
      scopePolicyPath: SCOPE_PATH,
      immutableContractLockPath: IMMUTABLE_LOCK_PATH,
      immutableContractLockSha256: input.lockSha256,
    },
    objective:
      "Commission the adopter-owned technical scaffold for truthful bootstrap verification.",
    exclusions: [
      "Bootstrap is not autonomous readiness and does not authorize product-domain breadth.",
    ],
    focusedCommands: focusedCommands(),
    requiredProtectedPaths,
    requiredInvariantSuiteId: input.definition.identifiers.invariantSuiteId,
    scopePolicyId: input.definition.identifiers.scopePolicyId,
    exactVerification: {
      argv: ["pnpm", "verify"],
      requiresNoArguments: true,
      profileSource: "package-default",
      selectedByOverride: false,
    },
    reconciliationPolicy: {
      id: input.definition.identifiers.reconciliationPolicyId,
      nextProposalPath: ".agent/next-milestone.json",
      requiredReviewChecks: [...GENERIC_RECONCILIATION_REVIEW_CHECK_IDS],
    },
    output: { verificationManifestPath: ACTIVE_MANIFEST_PATH },
  });
}

async function trackedInventory(outputRoot: string): Promise<
  readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[]
> {
  const paths = git(outputRoot, ["ls-files", "-z"])
    .stdout.split("\0")
    .filter(Boolean)
    .sort();
  return Promise.all(
    paths.map(async (path) => {
      const contents = await readFile(resolve(outputRoot, path));
      return {
        path: slash(path),
        bytes: contents.byteLength,
        sha256: sha256(contents),
      };
    }),
  );
}

export async function createAdopterPackage(input: {
  readonly definitionPath: string;
  readonly outputPath: string;
}): Promise<AdopterPackageResult> {
  const sourceRoot = resolve(import.meta.dirname, "../../..");
  const loaded = await readStrictDefinition(input.definitionPath);
  const { definition } = loaded;
  const outputRoot = resolve(input.outputPath);
  if (existsSync(outputRoot))
    throw new Error(`Adopter package output already exists: ${outputRoot}.`);
  const outputParent = await realpath(dirname(outputRoot));
  const parentMetadata = await lstat(outputParent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink())
    throw new Error("Adopter package output parent must be a real directory.");
  await mkdir(outputRoot, { recursive: false });

  await copyReusableRuntime(sourceRoot, outputRoot);
  await copyScaffoldAssets(sourceRoot, outputRoot);

  const authoritySources = [
    [definition.authority.projectGoalPath, "PROJECT_GOAL.md", "Project goal"],
    [
      definition.authority.acceptanceProsePath,
      "evals/ACCEPTANCE.md",
      "Acceptance prose",
    ],
    [
      definition.authority.acceptanceManifestPath,
      "evals/acceptance-manifest.json",
      "Acceptance manifest",
    ],
    [
      definition.authority.hiddenValidationProtocolPath,
      "evals/HIDDEN_VALIDATION_PROTOCOL.md",
      "Hidden validation protocol",
    ],
  ] as const;
  for (const [sourcePath, destinationPath, label] of authoritySources) {
    const contents = await readDefinitionFile(
      loaded.directory,
      sourcePath,
      label,
    );
    assertNoSourceIdentity(contents.toString("utf8"), label);
    await writeBytes(outputRoot, destinationPath, contents);
  }

  const sourcePackage = JSON.parse(
    await readFile(resolve(sourceRoot, "package.json"), "utf8"),
  ) as JsonRecord;
  const packageJson = {
    name: definition.project.packageName,
    version: "0.0.0",
    private: true,
    type: "module",
    description: `${definition.project.name} deterministic bootstrap scaffold`,
    engines: { node: "24.18.0" },
    packageManager: "pnpm@11.15.1",
    milestoneLoop: {
      verification: { defaultProfile: "bootstrap" },
      productionBuild: { script: "build:production", outputRoots: ["dist"] },
    },
    scripts: packageScripts(),
    devDependencies: sourcePackage["devDependencies"],
  };
  await writeJson(outputRoot, "package.json", packageJson);

  const config = await generatedConfig(sourceRoot, definition);
  const invariant = generatedInvariantRegistry(definition);
  const scope = generatedScopePolicy(definition);
  const slowSuite = assertSlowSuiteRegistry({
    schemaVersion: "1.0.0",
    id: definition.identifiers.slowSuiteRegistryId,
    files: ["app/save-migration.test.ts"],
  });
  await Promise.all([
    writeJson(outputRoot, CONFIG_PATH, config),
    writeJson(outputRoot, INVARIANT_PATH, invariant),
    writeJson(outputRoot, SCOPE_PATH, scope),
    writeJson(outputRoot, SLOW_SUITE_PATH, slowSuite),
  ]);
  const lockSha256 = await createImmutableLock(outputRoot);

  git(outputRoot, [
    "init",
    `--initial-branch=${definition.project.targetBranch}`,
  ]);
  git(outputRoot, ["config", "user.name", definition.git.userName]);
  git(outputRoot, ["config", "user.email", definition.git.userEmail]);
  git(outputRoot, ["config", "commit.gpgsign", "false"]);
  git(outputRoot, ["add", "."]);
  git(outputRoot, ["commit", "-m", "freeze adopter authority and scaffold"], {
    timestamp: definition.git.timestamp,
  });
  const baseCommit = gitText(outputRoot, ["rev-parse", "HEAD"]);

  const generatedInput = commissioningInput({
    definition,
    config,
    baseCommit,
    lockSha256,
  });
  await writeJson(outputRoot, COMMISSIONING_INPUT_PATH, generatedInput);
  git(outputRoot, ["add", COMMISSIONING_INPUT_PATH]);
  git(outputRoot, ["commit", "-m", "add adopter commissioning input"], {
    timestamp: definition.git.timestamp,
  });

  const commissioningInputCommit = gitText(outputRoot, ["rev-parse", "HEAD"]);
  const tree = gitText(outputRoot, ["rev-parse", "HEAD^{tree}"]);
  const branch = gitText(outputRoot, ["branch", "--show-current"]);
  const status = git(outputRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).stdout;
  const commitCount = Number(
    gitText(outputRoot, ["rev-list", "--count", "HEAD"]),
  );
  const markerHistory = git(outputRoot, [
    "log",
    "--all",
    "--format=%H",
    "--",
    ".agent/readiness-profile-activated.json",
  ]).stdout.trim();
  if (
    branch !== definition.project.targetBranch ||
    status !== "" ||
    commitCount !== 2 ||
    markerHistory !== "" ||
    existsSync(
      resolve(outputRoot, ".agent/readiness-profile-activated.json"),
    ) ||
    existsSync(resolve(outputRoot, ACTIVE_MANIFEST_PATH))
  )
    throw new Error(
      "Generated adopter Git/bootstrap lifecycle is inconsistent.",
    );

  const inputBytes = await readFile(
    resolve(outputRoot, COMMISSIONING_INPUT_PATH),
  );
  const files = await trackedInventory(outputRoot);
  return {
    schemaVersion: ADOPTER_PACKAGE_RESULT_SCHEMA_VERSION,
    status: "PASS",
    outputRoot,
    project: {
      name: definition.project.name,
      packageName: definition.project.packageName,
      targetBranch: definition.project.targetBranch,
      profile: "bootstrap",
    },
    git: {
      authorityBaseCommit: baseCommit,
      commissioningInputCommit,
      tree,
      branch,
      commitCount: 2,
      clean: true,
    },
    generated: {
      immutableContractLockSha256: lockSha256,
      commissioningInputPath: COMMISSIONING_INPUT_PATH,
      commissioningInputSha256: sha256(inputBytes),
      activeManifestPresent: false,
      readinessMarkerPresent: false,
    },
    files,
  };
}
