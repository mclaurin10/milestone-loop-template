import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import {
  EXACT_RUNTIME_WORKFLOW_PATH,
  validateExactRuntimeWorkflow,
} from "../ci/exact-runtime-workflow-contract.js";
import { loadInvariantSuiteRegistry } from "./config.js";
import { runCommand } from "./command-runner.js";
import { discoverUnitTestFiles } from "./invariant-suite.js";

export const DEFAULT_TEST_OWNERSHIP_PATH =
  "tools/milestone-orchestrator/config/test-ownership.json" as const;
export const TEST_OWNERSHIP_REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_OWNERSHIP_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_OWNERSHIP_ID = "milestone-loop-test-ownership.v1" as const;

export const TEST_OWNER_IDS = [
  "controller-runtime",
  "repository-tooling",
  "adopter-template",
  "trusted-container-fixture",
] as const;

export type TestOwnerId = (typeof TEST_OWNER_IDS)[number];

const TEST_OWNER_DESCRIPTIONS: Readonly<Record<TestOwnerId, string>> = {
  "controller-runtime":
    "Controller, verification, state, lifecycle, and evidence implementation tests.",
  "repository-tooling":
    "Repository-root evidence tooling not selected by the orchestrator-only command.",
  "adopter-template":
    "Bootstrap adopter source tests exercised in place and after package generation.",
  "trusted-container-fixture":
    "The isolated OCI candidate test exercised by the real trusted-container matrix.",
};

const OWNER_ID_SET = new Set<string>(TEST_OWNER_IDS);
const VITEST_CONFIG_BASENAME = /^vitest\.config\.(?:[cm]?[jt]s)$/u;

const REQUIRED_ROOT_SCRIPTS = {
  "test:unit": "tsx tools/run-tool-evidence.mjs test",
  "test:invariants":
    "tsx tools/milestone-orchestrator/src/verification-cli.ts invariants",
  "test:unit:fast":
    "tsx tools/milestone-orchestrator/src/verification-cli.ts fast-unit",
  "test:unit:migrations":
    "tsx tools/milestone-orchestrator/src/verification-cli.ts migration-unit",
  "test:orchestrator": "tsx tools/run-tool-evidence.mjs orchestrator",
  "test:oci-container":
    "tsx tools/milestone-orchestrator/src/container-executor.oci.ts",
} as const;

const REQUIRED_COMMISSIONED_TEST_COMMANDS = [
  "test-invariants",
  "test-unit-fast",
  "test-unit-migrations",
  "test-orchestrator",
] as const;

export interface TestOwnershipDiagnostic {
  readonly code: string;
  readonly path: string | null;
  readonly message: string;
}

export interface TestOwnershipOwnerReport {
  readonly id: TestOwnerId;
  readonly description: string;
  readonly count: number;
  readonly files: readonly string[];
}

export interface TestOwnershipValidation {
  readonly status: "PASS" | "FAIL";
  readonly discoveredFiles: readonly string[];
  readonly owners: readonly TestOwnershipOwnerReport[];
  readonly diagnostics: readonly TestOwnershipDiagnostic[];
}

export interface DiscoverySurfaceReport {
  readonly id: string;
  readonly configPath: string;
  readonly root: string;
  readonly filters: readonly string[];
  readonly repeatCount: 2;
  readonly files: readonly string[];
}

export interface TestOwnershipReport {
  readonly schemaVersion: typeof TEST_OWNERSHIP_REPORT_SCHEMA_VERSION;
  readonly status: "PASS" | "FAIL";
  readonly catalogue: {
    readonly id: string | null;
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
  readonly discovery: {
    readonly authority: "vitest-list";
    readonly repeated: true;
    readonly configPaths: readonly string[];
    readonly sources: readonly DiscoverySurfaceReport[];
    readonly uniqueFileCount: number;
    readonly files: readonly string[];
  };
  readonly entryPoints: {
    readonly packageScripts: readonly string[];
    readonly commissionedCommands: readonly string[];
    readonly exactRuntimeWorkflowPath: string;
    readonly candidatePartitionFiles: readonly string[];
    readonly invariantVitestFiles: readonly string[];
    readonly orchestratorFiles: readonly string[];
  };
  readonly owners: readonly TestOwnershipOwnerReport[];
  readonly diagnostics: readonly TestOwnershipDiagnostic[];
}

interface TrackedOwnershipCatalogue {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly value: unknown;
}

interface RepeatedDiscoveryResult {
  readonly files: readonly string[];
  readonly diagnostics: readonly TestOwnershipDiagnostic[];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareStrings);
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

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return sameStrings(
    Object.keys(value).sort(compareStrings),
    [...expected].sort(compareStrings),
  );
}

function diagnostic(
  code: string,
  message: string,
  path: string | null = null,
): TestOwnershipDiagnostic {
  return { code, path, message };
}

function sortDiagnostics(
  diagnostics: readonly TestOwnershipDiagnostic[],
): readonly TestOwnershipDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const code = compareStrings(left.code, right.code);
    if (code !== 0) return code;
    const path = compareStrings(left.path ?? "", right.path ?? "");
    return path !== 0 ? path : compareStrings(left.message, right.message);
  });
}

function summarizePaths(paths: readonly string[]): string {
  const sorted = sortedUnique(paths);
  const displayed = sorted.slice(0, 5);
  return `${displayed.join(", ")}${sorted.length > displayed.length ? ` (+${sorted.length - displayed.length} more)` : ""}`;
}

function normalizedRelativePath(value: string): string | null {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\r") ||
    value.includes("\n")
  )
    return null;
  const slash = value.replaceAll("\\", "/");
  if (slash.startsWith("/") || /^[A-Za-z]:\//u.test(slash) || isAbsolute(slash))
    return null;
  const segments = slash.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  )
    return null;
  return segments.join("/");
}

function addCaseCollisionDiagnostics(
  values: readonly string[],
  code: string,
  subject: string,
  diagnostics: TestOwnershipDiagnostic[],
): void {
  const byCasefold = new Map<string, Set<string>>();
  for (const value of values) {
    const key = value.toLowerCase();
    const spellings = byCasefold.get(key) ?? new Set<string>();
    spellings.add(value);
    byCasefold.set(key, spellings);
  }
  for (const spellings of byCasefold.values()) {
    if (spellings.size < 2) continue;
    const paths = [...spellings].sort(compareStrings);
    diagnostics.push(
      diagnostic(
        code,
        `${subject} has case-ambiguous spellings: ${paths.join(", ")}. Use one exact repository path.`,
        paths[0] ?? null,
      ),
    );
  }
}

export function validateRepeatedDiscovery(
  surfaceId: string,
  passes: readonly (readonly string[])[],
): RepeatedDiscoveryResult {
  const diagnostics: TestOwnershipDiagnostic[] = [];
  if (passes.length !== 2)
    diagnostics.push(
      diagnostic(
        "NONDETERMINISTIC_DISCOVERY",
        `Discovery ${surfaceId} must run exactly twice; observed ${passes.length} passes.`,
      ),
    );
  const normalizedPasses = passes.map((pass, passIndex) => {
    const normalized: string[] = [];
    const exact = new Set<string>();
    for (const raw of pass) {
      const path = normalizedRelativePath(raw);
      if (!path || path !== raw) {
        diagnostics.push(
          diagnostic(
            "AMBIGUOUS_DISCOVERY_PATH",
            `Discovery ${surfaceId} pass ${passIndex + 1} returned non-canonical path ${JSON.stringify(raw)}. Use repository-relative forward-slash paths.`,
            path,
          ),
        );
        continue;
      }
      if (exact.has(path))
        diagnostics.push(
          diagnostic(
            "AMBIGUOUS_DISCOVERY",
            `Discovery ${surfaceId} pass ${passIndex + 1} returned ${path} more than once. Remove the ambiguous discovery entry.`,
            path,
          ),
        );
      exact.add(path);
      normalized.push(path);
    }
    addCaseCollisionDiagnostics(
      normalized,
      "AMBIGUOUS_DISCOVERY",
      `Discovery ${surfaceId} pass ${passIndex + 1}`,
      diagnostics,
    );
    return sortedUnique(normalized);
  });
  const first = normalizedPasses[0] ?? [];
  const second = normalizedPasses[1] ?? [];
  if (!sameStrings(first, second)) {
    const firstOnly = first.filter((path) => !second.includes(path));
    const secondOnly = second.filter((path) => !first.includes(path));
    diagnostics.push(
      diagnostic(
        "NONDETERMINISTIC_DISCOVERY",
        `Discovery ${surfaceId} changed between repeated runs; first-only=[${summarizePaths(firstOnly)}], second-only=[${summarizePaths(secondOnly)}]. Stabilize Vitest discovery.`,
      ),
    );
  }
  return { files: first, diagnostics: sortDiagnostics(diagnostics) };
}

export function validateTestOwnership(
  discoveredInput: readonly string[],
  declaration: unknown,
): TestOwnershipValidation {
  const diagnostics: TestOwnershipDiagnostic[] = [];
  const discovered: string[] = [];
  const discoveredSet = new Set<string>();
  for (const raw of discoveredInput) {
    const path = normalizedRelativePath(raw);
    if (!path || path !== raw) {
      diagnostics.push(
        diagnostic(
          "AMBIGUOUS_DISCOVERY_PATH",
          `Discovered test path ${JSON.stringify(raw)} is not canonical. Discovery must emit repository-relative forward-slash paths.`,
          path,
        ),
      );
      continue;
    }
    if (discoveredSet.has(path))
      diagnostics.push(
        diagnostic(
          "AMBIGUOUS_DISCOVERY",
          `Discovered test ${path} appears more than once. Remove the ambiguous discovery entry.`,
          path,
        ),
      );
    discoveredSet.add(path);
    discovered.push(path);
  }
  const discoveredFiles = sortedUnique(discovered);
  addCaseCollisionDiagnostics(
    discoveredFiles,
    "AMBIGUOUS_DISCOVERY",
    "Discovered test universe",
    diagnostics,
  );

  const assignments = new Map<string, Set<TestOwnerId>>();
  const declaredCanonicalPaths: string[] = [];
  const ownerFiles = new Map<TestOwnerId, string[]>(
    TEST_OWNER_IDS.map((id) => [id, []]),
  );
  const seenOwnerIds: string[] = [];

  if (
    typeof declaration !== "object" ||
    declaration === null ||
    Array.isArray(declaration)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_CATALOGUE",
        "Ownership catalogue must be an object with schemaVersion, id, and owners.",
      ),
    );
  } else {
    const root = declaration as Record<string, unknown>;
    if (!exactObjectKeys(root, ["schemaVersion", "id", "owners"]))
      diagnostics.push(
        diagnostic(
          "INVALID_CATALOGUE",
          "Ownership catalogue root keys must be exactly schemaVersion, id, and owners.",
        ),
      );
    if (root["schemaVersion"] !== TEST_OWNERSHIP_SCHEMA_VERSION)
      diagnostics.push(
        diagnostic(
          "INVALID_CATALOGUE",
          `Ownership catalogue schemaVersion must be ${TEST_OWNERSHIP_SCHEMA_VERSION}.`,
        ),
      );
    if (root["id"] !== TEST_OWNERSHIP_ID)
      diagnostics.push(
        diagnostic(
          "INVALID_CATALOGUE",
          `Ownership catalogue id must be ${TEST_OWNERSHIP_ID}.`,
        ),
      );
    const owners = root["owners"];
    if (!Array.isArray(owners))
      diagnostics.push(
        diagnostic(
          "INVALID_CATALOGUE",
          "Ownership catalogue owners must be an array.",
        ),
      );
    else {
      const ownerBlockCounts = new Map<string, number>();
      for (const [ownerIndex, rawOwner] of owners.entries()) {
        if (
          typeof rawOwner !== "object" ||
          rawOwner === null ||
          Array.isArray(rawOwner)
        ) {
          diagnostics.push(
            diagnostic(
              "INVALID_CATALOGUE",
              `Ownership catalogue owners[${ownerIndex}] must be an object.`,
            ),
          );
          continue;
        }
        const owner = rawOwner as Record<string, unknown>;
        if (!exactObjectKeys(owner, ["id", "files"]))
          diagnostics.push(
            diagnostic(
              "INVALID_CATALOGUE",
              `Ownership catalogue owners[${ownerIndex}] keys must be exactly id and files.`,
            ),
          );
        const rawId = owner["id"];
        if (typeof rawId !== "string" || rawId.length === 0) {
          diagnostics.push(
            diagnostic(
              "INVALID_OWNER",
              `Ownership catalogue owners[${ownerIndex}] needs a nonempty allowlisted id.`,
            ),
          );
          continue;
        }
        seenOwnerIds.push(rawId);
        ownerBlockCounts.set(rawId, (ownerBlockCounts.get(rawId) ?? 0) + 1);
        const known = OWNER_ID_SET.has(rawId);
        if (!known)
          diagnostics.push(
            diagnostic(
              "INVALID_OWNER",
              `Unknown test owner ${rawId}; use one of: ${TEST_OWNER_IDS.join(", ")}.`,
              rawId,
            ),
          );
        const files = owner["files"];
        if (!Array.isArray(files)) {
          diagnostics.push(
            diagnostic(
              "INVALID_CATALOGUE",
              `Ownership catalogue owner ${rawId} files must be an array.`,
              rawId,
            ),
          );
          continue;
        }
        if (files.some((file) => typeof file !== "string")) {
          diagnostics.push(
            diagnostic(
              "INVALID_CATALOGUE",
              `Ownership catalogue owner ${rawId} files must contain only strings.`,
              rawId,
            ),
          );
          continue;
        }
        const stringFiles = files as string[];
        if (!sameStrings(stringFiles, [...stringFiles].sort(compareStrings)))
          diagnostics.push(
            diagnostic(
              "NONCANONICAL_CATALOGUE_ORDER",
              `Ownership catalogue files for ${rawId} are not sorted. Sort them by repository path.`,
              rawId,
            ),
          );
        const seenFiles = new Set<string>();
        for (const rawPath of stringFiles) {
          const path = normalizedRelativePath(rawPath);
          if (!path || path !== rawPath) {
            diagnostics.push(
              diagnostic(
                "INVALID_CATALOGUE_PATH",
                `Ownership path ${JSON.stringify(rawPath)} is not canonical. Use a repository-relative forward-slash path.`,
                path,
              ),
            );
            continue;
          }
          declaredCanonicalPaths.push(path);
          if (seenFiles.has(path))
            diagnostics.push(
              diagnostic(
                "DUPLICATE_CATALOGUE_ENTRY",
                `Owner ${rawId} lists ${path} more than once. Keep one entry.`,
                path,
              ),
            );
          seenFiles.add(path);
          if (!known) continue;
          const id = rawId as TestOwnerId;
          ownerFiles.get(id)?.push(path);
          const fileOwners = assignments.get(path) ?? new Set<TestOwnerId>();
          fileOwners.add(id);
          assignments.set(path, fileOwners);
        }
      }
      for (const [id, count] of ownerBlockCounts) {
        if (count > 1)
          diagnostics.push(
            diagnostic(
              "DUPLICATE_OWNER_BLOCK",
              `Owner ${id} has ${count} catalogue blocks. Merge them into one block.`,
              id,
            ),
          );
      }
      for (const id of TEST_OWNER_IDS) {
        if (!ownerBlockCounts.has(id))
          diagnostics.push(
            diagnostic(
              "MISSING_OWNER",
              `Ownership catalogue is missing required owner ${id}. Add its canonical block.`,
              id,
            ),
          );
      }
      if (!sameStrings(seenOwnerIds, [...TEST_OWNER_IDS]))
        diagnostics.push(
          diagnostic(
            "NONCANONICAL_OWNER_ORDER",
            `Ownership blocks must appear exactly once in this order: ${TEST_OWNER_IDS.join(", ")}.`,
          ),
        );
    }
  }

  addCaseCollisionDiagnostics(
    declaredCanonicalPaths,
    "AMBIGUOUS_CATALOGUE_PATH",
    "Ownership catalogue",
    diagnostics,
  );

  for (const path of discoveredFiles) {
    const fileOwners = assignments.get(path) ?? new Set<TestOwnerId>();
    if (fileOwners.size === 0)
      diagnostics.push(
        diagnostic(
          "UNCLASSIFIED_TEST",
          `Discovered test ${path} has no valid owner. Add it to exactly one ownership block.`,
          path,
        ),
      );
    else if (fileOwners.size > 1) {
      const ids = [...fileOwners].sort(compareStrings);
      diagnostics.push(
        diagnostic(
          "MULTIPLE_OWNERS",
          `Discovered test ${path} has multiple owners: ${ids.join(", ")}. Keep exactly one.`,
          path,
        ),
      );
    }
  }
  for (const [path, fileOwners] of assignments) {
    if (discoveredSet.has(path)) continue;
    diagnostics.push(
      diagnostic(
        "STALE_CATALOGUE_ENTRY",
        `Catalogue test ${path} owned by ${[...fileOwners].sort(compareStrings).join(", ")} is not discovered. Remove or correct the stale path.`,
        path,
      ),
    );
  }

  const owners: TestOwnershipOwnerReport[] = TEST_OWNER_IDS.map((id) => {
    const files = sortedUnique(ownerFiles.get(id) ?? []);
    return {
      id,
      description: TEST_OWNER_DESCRIPTIONS[id],
      count: files.length,
      files,
    };
  });
  const sortedDiagnostics = sortDiagnostics(diagnostics);
  return {
    status: sortedDiagnostics.length === 0 ? "PASS" : "FAIL",
    discoveredFiles,
    owners,
    diagnostics: sortedDiagnostics,
  };
}

async function loadOwnershipCatalogue(
  repositoryRoot: string,
): Promise<TrackedOwnershipCatalogue> {
  const root = resolve(repositoryRoot);
  const absolute = resolve(root, DEFAULT_TEST_OWNERSHIP_PATH);
  const repositoryRelative = relative(root, absolute).replaceAll("\\", "/");
  if (repositoryRelative !== DEFAULT_TEST_OWNERSHIP_PATH)
    throw new Error(
      "Test ownership catalogue path does not resolve canonically.",
    );
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Test ownership catalogue must be a regular non-symlink file: ${DEFAULT_TEST_OWNERSHIP_PATH}.`,
    );
  const [resolvedRoot, resolvedFile] = await Promise.all([
    realpath(root),
    realpath(absolute),
  ]);
  const resolvedRelative = relative(resolvedRoot, resolvedFile).replaceAll(
    "\\",
    "/",
  );
  if (resolvedRelative !== DEFAULT_TEST_OWNERSHIP_PATH)
    throw new Error(
      "Test ownership catalogue resolves outside its canonical path.",
    );
  const bytes = await readFile(absolute);
  return {
    path: DEFAULT_TEST_OWNERSHIP_PATH,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
    value: JSON.parse(bytes.toString("utf8")) as unknown,
  };
}

function repositoryPaths(repositoryRoot: string): readonly string[] {
  const result = spawnSync(
    "git",
    [
      "-C",
      repositoryRoot,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot enumerate repository paths for Vitest configs: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  const paths: string[] = [];
  for (const raw of result.stdout.split("\0")) {
    if (raw.length === 0) continue;
    const path = normalizedRelativePath(raw);
    if (!path)
      throw new Error(
        `Git returned non-canonical repository path ${JSON.stringify(raw)}.`,
      );
    paths.push(path);
  }
  return sortedUnique(paths);
}

async function discoverVitestConfigPaths(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const paths = repositoryPaths(repositoryRoot).filter((path) =>
    VITEST_CONFIG_BASENAME.test(basename(path)),
  );
  if (!paths.includes("vitest.config.ts"))
    throw new Error(
      "Root vitest.config.ts is missing from repository discovery.",
    );
  const diagnostics: TestOwnershipDiagnostic[] = [];
  addCaseCollisionDiagnostics(
    paths,
    "AMBIGUOUS_CONFIG_PATH",
    "Vitest config discovery",
    diagnostics,
  );
  if (diagnostics.length > 0) throw new Error(diagnostics[0]?.message);
  for (const path of paths) {
    const metadata = await lstat(resolve(repositoryRoot, path));
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error(
        `Vitest config must be a regular non-symlink file: ${path}.`,
      );
  }
  return paths;
}

async function normalizeVitestListOutput(
  repositoryRoot: string,
  output: string,
  surfaceId: string,
): Promise<readonly string[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch (error) {
    throw new Error(
      `Vitest discovery ${surfaceId} did not emit JSON: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed))
    throw new Error(`Vitest discovery ${surfaceId} did not emit an array.`);
  const root = resolve(repositoryRoot);
  const resolvedRoot = await realpath(root);
  const files: string[] = [];
  for (const [index, row] of parsed.entries()) {
    if (
      typeof row !== "object" ||
      row === null ||
      Array.isArray(row) ||
      typeof (row as Record<string, unknown>)["file"] !== "string"
    )
      throw new Error(
        `Vitest discovery ${surfaceId} row ${index} lacks a file path.`,
      );
    const raw = (row as { readonly file: string }).file;
    if (!isAbsolute(raw))
      throw new Error(
        `Vitest discovery ${surfaceId} returned a non-absolute file path: ${raw}.`,
      );
    const absolute = resolve(raw);
    const repositoryRelative = relative(root, absolute).replaceAll("\\", "/");
    const path = normalizedRelativePath(repositoryRelative);
    if (!path)
      throw new Error(
        `Vitest discovery ${surfaceId} returned a file outside the repository: ${raw}.`,
      );
    const metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error(
        `Vitest discovery ${surfaceId} returned a non-regular or linked file: ${path}.`,
      );
    const resolvedFile = await realpath(absolute);
    const resolvedRelative = relative(resolvedRoot, resolvedFile).replaceAll(
      "\\",
      "/",
    );
    if (resolvedRelative !== path)
      throw new Error(
        `Vitest discovery ${surfaceId} returned an ambiguous real path for ${path}.`,
      );
    files.push(path);
  }
  return files;
}

async function runVitestDiscoveryPass(input: {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly commandId: string;
  readonly surfaceId: string;
  readonly configPath: string;
  readonly filters: readonly string[];
}): Promise<readonly string[]> {
  const configRoot = dirname(input.configPath).replaceAll("\\", "/");
  const root = configRoot === "." ? "." : configRoot;
  const command = await runCommand(
    {
      id: input.commandId,
      executable: "pnpm",
      args: [
        "exec",
        "vitest",
        "list",
        ...input.filters,
        "--root",
        root,
        "--config",
        basename(input.configPath),
        "--filesOnly",
        "--json",
        "--no-color",
      ],
      parser: "exit-code",
    },
    {
      workingDirectory: input.repositoryRoot,
      artifactDirectory: input.artifactDirectory,
      timeoutMs: 120_000,
      trustedControllerCommand: true,
    },
  );
  if (command.status !== "PASS")
    throw new Error(
      `Vitest discovery ${input.surfaceId} failed (${command.status}); inspect ${command.stderrPath}.`,
    );
  return normalizeVitestListOutput(
    input.repositoryRoot,
    await readFile(command.stdoutPath, "utf8"),
    input.surfaceId,
  );
}

async function discoverSurface(input: {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly ordinal: number;
  readonly id: string;
  readonly configPath: string;
  readonly filters?: readonly string[];
}): Promise<{
  readonly report: DiscoverySurfaceReport;
  readonly diagnostics: readonly TestOwnershipDiagnostic[];
}> {
  const filters = input.filters ?? [];
  const passes: (readonly string[])[] = [];
  for (const pass of [1, 2] as const)
    passes.push(
      await runVitestDiscoveryPass({
        repositoryRoot: input.repositoryRoot,
        artifactDirectory: input.artifactDirectory,
        commandId: `ownership-discovery-${String(input.ordinal).padStart(2, "0")}-${pass}`,
        surfaceId: input.id,
        configPath: input.configPath,
        filters,
      }),
    );
  const repeated = validateRepeatedDiscovery(input.id, passes);
  const configRoot = dirname(input.configPath).replaceAll("\\", "/");
  return {
    report: {
      id: input.id,
      configPath: input.configPath,
      root: configRoot === "." ? "." : configRoot,
      filters,
      repeatCount: 2,
      files: repeated.files,
    },
    diagnostics: repeated.diagnostics,
  };
}

async function validateEntrypointContracts(input: {
  readonly repositoryRoot: string;
  readonly rootFiles: readonly string[];
  readonly universe: readonly string[];
  readonly orchestratorFiles: readonly string[];
}): Promise<{
  readonly diagnostics: readonly TestOwnershipDiagnostic[];
  readonly packageScripts: readonly string[];
  readonly commissionedCommands: readonly string[];
  readonly candidatePartitionFiles: readonly string[];
  readonly invariantVitestFiles: readonly string[];
}> {
  const diagnostics: TestOwnershipDiagnostic[] = [];
  const packageJson = JSON.parse(
    await readFile(resolve(input.repositoryRoot, "package.json"), "utf8"),
  ) as { readonly scripts?: Readonly<Record<string, unknown>> };
  for (const [id, expected] of Object.entries(REQUIRED_ROOT_SCRIPTS)) {
    const actual = packageJson.scripts?.[id];
    if (actual !== expected)
      diagnostics.push(
        diagnostic(
          "ENTRYPOINT_CONTRACT_DRIFT",
          `package.json script ${id} must remain ${JSON.stringify(expected)} during WP6a; observed ${JSON.stringify(actual)}.`,
          "package.json",
        ),
      );
  }
  const ociPackage = JSON.parse(
    await readFile(
      resolve(input.repositoryRoot, "fixtures/oci-candidate/package.json"),
      "utf8",
    ),
  ) as { readonly scripts?: Readonly<Record<string, unknown>> };
  const expectedOciSmoke =
    "vitest run --config vitest.config.ts --reporter=json --outputFile=artifacts/vitest-report.json";
  if (ociPackage.scripts?.["test:smoke"] !== expectedOciSmoke)
    diagnostics.push(
      diagnostic(
        "ENTRYPOINT_CONTRACT_DRIFT",
        `OCI fixture test:smoke must remain ${JSON.stringify(expectedOciSmoke)} during WP6a.`,
        "fixtures/oci-candidate/package.json",
      ),
    );

  try {
    await validateExactRuntimeWorkflow(
      await readFile(
        resolve(input.repositoryRoot, EXACT_RUNTIME_WORKFLOW_PATH),
        "utf8",
      ),
    );
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "ENTRYPOINT_CONTRACT_DRIFT",
        `Exact-runtime workflow contract failed: ${error instanceof Error ? error.message : String(error)}`,
        EXACT_RUNTIME_WORKFLOW_PATH,
      ),
    );
  }

  const activeManifest = JSON.parse(
    await readFile(
      resolve(input.repositoryRoot, ".agent/verification-manifest.json"),
      "utf8",
    ),
  ) as {
    readonly focusedCommands?: readonly {
      readonly id?: unknown;
      readonly argv?: unknown;
    }[];
  };
  const commissionedCommands = (activeManifest.focusedCommands ?? [])
    .filter(
      (command): command is { readonly id: string; readonly argv?: unknown } =>
        typeof command.id === "string" &&
        REQUIRED_COMMISSIONED_TEST_COMMANDS.includes(
          command.id as (typeof REQUIRED_COMMISSIONED_TEST_COMMANDS)[number],
        ),
    )
    .map((command) => command.id)
    .sort(compareStrings);
  const expectedCommissionedCommands = [
    ...REQUIRED_COMMISSIONED_TEST_COMMANDS,
  ].sort(compareStrings);
  if (!sameStrings(commissionedCommands, expectedCommissionedCommands))
    diagnostics.push(
      diagnostic(
        "ENTRYPOINT_CONTRACT_DRIFT",
        `Active commissioned test commands must be ${expectedCommissionedCommands.join(", ")}; observed ${commissionedCommands.join(", ")}.`,
        ".agent/verification-manifest.json",
      ),
    );

  const candidatePartitionFiles = await discoverUnitTestFiles(
    input.repositoryRoot,
  );
  if (!sameStrings(candidatePartitionFiles, input.rootFiles)) {
    const candidateOnly = candidatePartitionFiles.filter(
      (path) => !input.rootFiles.includes(path),
    );
    const vitestOnly = input.rootFiles.filter(
      (path) => !candidatePartitionFiles.includes(path),
    );
    diagnostics.push(
      diagnostic(
        "CANDIDATE_DISCOVERY_DRIFT",
        `Candidate partition discovery differs from root Vitest discovery; candidate-only=[${summarizePaths(candidateOnly)}], vitest-only=[${summarizePaths(vitestOnly)}]. Reconcile discovery before changing executors.`,
      ),
    );
  }

  const invariantRegistry = await loadInvariantSuiteRegistry(
    input.repositoryRoot,
  );
  const invariantVitestFiles: string[] = [];
  for (const entry of invariantRegistry.value.entries) {
    const argv = entry.argv;
    if (
      argv[0] !== "pnpm" ||
      argv[1] !== "exec" ||
      argv[2] !== "vitest" ||
      argv[3] !== "run"
    )
      continue;
    for (const value of argv.slice(4)) {
      if (value.startsWith("--")) continue;
      invariantVitestFiles.push(value);
    }
  }
  for (const path of sortedUnique(invariantVitestFiles)) {
    if (!input.universe.includes(path))
      diagnostics.push(
        diagnostic(
          "INVARIANT_DISCOVERY_DRIFT",
          `Invariant test ${path} is outside the discovered test universe. Correct the invariant entry or Vitest config.`,
          path,
        ),
      );
  }
  for (const path of input.orchestratorFiles) {
    if (!input.rootFiles.includes(path))
      diagnostics.push(
        diagnostic(
          "ORCHESTRATOR_DISCOVERY_DRIFT",
          `Orchestrator command discovers ${path}, which root test:unit does not discover. Reconcile the command filters.`,
          path,
        ),
      );
  }

  return {
    diagnostics: sortDiagnostics(diagnostics),
    packageScripts: Object.keys(REQUIRED_ROOT_SCRIPTS).sort(compareStrings),
    commissionedCommands,
    candidatePartitionFiles,
    invariantVitestFiles: sortedUnique(invariantVitestFiles),
  };
}

export function formatTestOwnershipFailure(
  diagnostics: readonly TestOwnershipDiagnostic[],
): string {
  const sorted = sortDiagnostics(diagnostics);
  return [
    `Test ownership gate failed with ${sorted.length} diagnostic${sorted.length === 1 ? "" : "s"}:`,
    ...sorted.map(
      (item) =>
        `- ${item.code}${item.path ? ` ${item.path}` : ""}: ${item.message}`,
    ),
  ].join("\n");
}

export async function evaluateRepositoryTestOwnership(input: {
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
}): Promise<TestOwnershipReport> {
  const catalogue = await loadOwnershipCatalogue(input.repositoryRoot);
  const configPaths = await discoverVitestConfigPaths(input.repositoryRoot);
  const sources: DiscoverySurfaceReport[] = [];
  const discoveryDiagnostics: TestOwnershipDiagnostic[] = [];
  let ordinal = 1;
  for (const configPath of configPaths) {
    const surface = await discoverSurface({
      repositoryRoot: input.repositoryRoot,
      artifactDirectory: input.artifactDirectory,
      ordinal,
      id: `config:${configPath}`,
      configPath,
    });
    ordinal += 1;
    sources.push(surface.report);
    discoveryDiagnostics.push(...surface.diagnostics);
  }
  const rootSource = sources.find(
    (source) =>
      source.configPath === "vitest.config.ts" && source.filters.length === 0,
  );
  if (!rootSource) throw new Error("Root Vitest discovery surface is missing.");
  const orchestratorSurface = await discoverSurface({
    repositoryRoot: input.repositoryRoot,
    artifactDirectory: input.artifactDirectory,
    ordinal,
    id: "command:test:orchestrator",
    configPath: "vitest.config.ts",
    filters: ["tools/milestone-orchestrator"],
  });
  discoveryDiagnostics.push(...orchestratorSurface.diagnostics);

  const universe = sortedUnique(sources.flatMap((source) => source.files));
  addCaseCollisionDiagnostics(
    universe,
    "AMBIGUOUS_DISCOVERY",
    "Combined Vitest discovery",
    discoveryDiagnostics,
  );
  const entryPoints = await validateEntrypointContracts({
    repositoryRoot: input.repositoryRoot,
    rootFiles: rootSource.files,
    universe,
    orchestratorFiles: orchestratorSurface.report.files,
  });
  const ownership = validateTestOwnership(universe, catalogue.value);
  const diagnostics = sortDiagnostics([
    ...discoveryDiagnostics,
    ...entryPoints.diagnostics,
    ...ownership.diagnostics,
  ]);
  const catalogueId =
    typeof catalogue.value === "object" &&
    catalogue.value !== null &&
    !Array.isArray(catalogue.value) &&
    typeof (catalogue.value as Record<string, unknown>)["id"] === "string"
      ? ((catalogue.value as Record<string, unknown>)["id"] as string)
      : null;
  return {
    schemaVersion: TEST_OWNERSHIP_REPORT_SCHEMA_VERSION,
    status: diagnostics.length === 0 ? "PASS" : "FAIL",
    catalogue: {
      id: catalogueId,
      path: catalogue.path,
      sha256: catalogue.sha256,
      bytes: catalogue.bytes,
    },
    discovery: {
      authority: "vitest-list",
      repeated: true,
      configPaths,
      sources,
      uniqueFileCount: universe.length,
      files: universe,
    },
    entryPoints: {
      packageScripts: entryPoints.packageScripts,
      commissionedCommands: entryPoints.commissionedCommands,
      exactRuntimeWorkflowPath: EXACT_RUNTIME_WORKFLOW_PATH,
      candidatePartitionFiles: entryPoints.candidatePartitionFiles,
      invariantVitestFiles: entryPoints.invariantVitestFiles,
      orchestratorFiles: orchestratorSurface.report.files,
    },
    owners: ownership.owners,
    diagnostics,
  };
}
