import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { evidenceContext, writeJson, writeReceipt } from "../../evidence.mjs";
import type {
  InvariantSuiteRegistry,
  UnitTestPartition,
  VerificationCommand,
  VerificationTestCounts,
} from "./contracts.js";
import { loadInvariantSuiteRegistry, loadSlowSuiteRegistry } from "./config.js";
import { runCommand } from "./command-runner.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

export class VerificationCheckFailure extends Error {}

function commandFromArgv(
  id: string,
  argv: readonly string[],
): VerificationCommand {
  const [executable, ...args] = argv;
  if (
    (executable !== "pnpm" && executable !== "node" && executable !== "git") ||
    args.length === 0
  )
    throw new Error(`Invariant ${id} has unsafe or incomplete argv.`);
  if (executable === "pnpm" && args[0] === "exec" && args[1] === "vitest")
    return {
      id,
      executable: "node",
      args: ["node_modules/vitest/vitest.mjs", ...args.slice(2)],
      parser: "exit-code",
    };
  if (executable === "pnpm" && args[0] === "verify" && args[1] === "--")
    return {
      id,
      executable: "node",
      args: ["scripts/verify.mjs", ...args.slice(2)],
      parser: "exit-code",
    };
  if (executable === "pnpm" && args[0] === "typecheck")
    return {
      id,
      executable: "node",
      args: [
        "node_modules/tsx/dist/cli.mjs",
        "tools/run-tool-evidence.mjs",
        "typecheck",
      ],
      parser: "exit-code",
    };
  return { id, executable, args, parser: "exit-code" };
}

export async function validateInvariantRegistryOwnership(
  repositoryRoot: string,
  registry: InvariantSuiteRegistry,
): Promise<void> {
  for (const entry of registry.entries) {
    for (const ownerPath of entry.ownerPaths) {
      const absolute = resolve(repositoryRoot, ownerPath);
      if (!existsSync(absolute))
        throw new Error(
          `Invariant ${entry.id} owner path does not exist: ${ownerPath}.`,
        );
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink())
        throw new Error(
          `Invariant ${entry.id} owner path cannot be a symlink: ${ownerPath}.`,
        );
    }
    if (entry.testFile && entry.testTitle) {
      const testPath = resolve(repositoryRoot, entry.testFile);
      const source = await readFile(testPath, "utf8");
      if (!source.includes(entry.testTitle))
        throw new Error(
          `Invariant ${entry.id} exact test title is missing from ${entry.testFile}.`,
        );
    }
  }
}

export interface InvariantSuiteRunResult {
  readonly registryId: string;
  readonly registrySha256: string;
  readonly reportPath: string;
  readonly durationMs: number;
  readonly runtimeTargetMet: boolean;
  readonly commandCount: number;
}

export async function runInvariantSuite(
  repositoryRoot: string,
): Promise<InvariantSuiteRunResult> {
  const tracked = await loadInvariantSuiteRegistry(repositoryRoot);
  await validateInvariantRegistryOwnership(repositoryRoot, tracked.value);
  const context = await evidenceContext("invariant-suite", "test:invariants");
  const startedAt = new Date();
  const commands = [];
  let failed = false;
  for (const entry of tracked.value.entries) {
    const evidenceDirectory = resolve(
      context.artifactDirectory,
      "entries",
      entry.id,
    );
    const command = await runCommand(commandFromArgv(entry.id, entry.argv), {
      workingDirectory: repositoryRoot,
      artifactDirectory: resolve(context.artifactDirectory, "logs"),
      timeoutMs: 10 * 60 * 1000,
      trustedControllerCommand: true,
      extraEnvironment: {
        LOOP_VERIFY_STAGE_ID: "invariant-suite",
        LOOP_VERIFY_COMMAND_ID: entry.id,
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: evidenceDirectory,
      },
    });
    let receipt = null;
    let receiptAbsenceReason: string | null = null;
    try {
      if (existsSync(resolve(evidenceDirectory, "result.json"))) {
        receipt = await validateCommandReceiptDirectory({
          directory: evidenceDirectory,
          expectedStageId: "invariant-suite",
          expectedCommandId: entry.id,
          requiredKinds: entry.expectedArtifactKinds,
        });
      } else if (entry.expectedArtifactKinds.length > 0) {
        throw new Error(
          `Invariant ${entry.id} did not write its required command-owned receipt.`,
        );
      } else {
        receiptAbsenceReason =
          "Invariant command contract declares no command-owned artifact kinds.";
      }
    } catch (error) {
      failed = true;
      receiptAbsenceReason =
        error instanceof Error ? error.message : String(error);
    }
    if (command.status !== "PASS") failed = true;
    commands.push({
      id: entry.id,
      argv: entry.argv,
      status: command.status,
      exitCode: command.exitCode,
      signal: command.signal,
      startedAt: command.startedAt,
      finishedAt: command.finishedAt,
      durationMs: command.durationMs,
      stdoutPath: command.stdoutPath,
      stderrPath: command.stderrPath,
      receipt,
      receiptAbsenceReason,
      message: command.message,
    });
    if (failed) break;
  }
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const reportPath = resolve(
    context.artifactDirectory,
    "invariant-suite-report.json",
  );
  await writeJson(reportPath, {
    schemaVersion: "1.0.0",
    status: failed ? "FAIL" : "PASS",
    registry: {
      id: tracked.value.id,
      path: tracked.path,
      sha256: tracked.sha256,
      bytes: tracked.bytes,
    },
    serial: true,
    warmRuntimeTargetMs: tracked.value.warmRuntimeTargetMs,
    runtimeTargetMet: durationMs <= tracked.value.warmRuntimeTargetMs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    commands,
  });
  if (failed)
    throw new VerificationCheckFailure(
      `Invariant suite failed; diagnostic report retained at ${reportPath}.`,
    );
  await writeReceipt(
    context,
    [
      {
        id: "registry-ownership",
        summary: `Validated all ${tracked.value.entries.length} configured invariant identities and owner paths.`,
      },
      {
        id: "serial-invariant-execution",
        summary: `All ${commands.length} invariant commands passed serially in ${durationMs} ms.`,
      },
      {
        id: "runtime-target-recorded",
        summary: `The measured 60-second warm target was ${durationMs <= tracked.value.warmRuntimeTargetMs ? "met" : "missed without dropping coverage"}.`,
      },
    ],
    [{ path: "invariant-suite-report.json", kind: "invariant-suite-report" }],
  );
  return {
    registryId: tracked.value.id,
    registrySha256: tracked.sha256,
    reportPath,
    durationMs,
    runtimeTargetMet: durationMs <= tracked.value.warmRuntimeTargetMs,
    commandCount: commands.length,
  };
}

async function walkFiles(directory: string): Promise<readonly string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Unit-test discovery refuses symlinked path: ${path}.`);
    if (entry.isDirectory()) result.push(...(await walkFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export async function discoverUnitTestFiles(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const roots = [
    { path: "packages", suffix: ".test.ts" },
    { path: "apps/headless", suffix: ".test.ts" },
    { path: "tools/milestone-orchestrator", suffix: ".test.ts" },
    { path: "tools", suffix: ".test.mjs" },
  ] as const;
  const files = new Set<string>();
  for (const root of roots) {
    const absoluteRoot = resolve(repositoryRoot, root.path);
    for (const path of await walkFiles(absoluteRoot)) {
      if (path.endsWith(root.suffix))
        files.add(slash(relative(repositoryRoot, path)));
    }
  }
  return [...files].sort();
}

export async function buildUnitTestPartition(
  repositoryRoot: string,
): Promise<UnitTestPartition> {
  const [registry, discoveredFiles] = await Promise.all([
    loadSlowSuiteRegistry(repositoryRoot),
    discoverUnitTestFiles(repositoryRoot),
  ]);
  const discovered = new Set(discoveredFiles);
  const missing = registry.value.files.filter((path) => !discovered.has(path));
  if (missing.length > 0)
    throw new VerificationCheckFailure(
      `Slow-suite registry files are absent from full Vitest discovery: ${missing.join(", ")}.`,
    );
  const migrationFiles = [...registry.value.files].sort();
  const migration = new Set(migrationFiles);
  const fastFiles = discoveredFiles.filter((path) => !migration.has(path));
  if (
    fastFiles.some((path) => migration.has(path)) ||
    new Set([...fastFiles, ...migrationFiles]).size !==
      discoveredFiles.length ||
    [...fastFiles, ...migrationFiles].some((path) => !discovered.has(path))
  )
    throw new Error(
      "Fast and migration unit partitions are not an exact disjoint union.",
    );
  return {
    registryId: registry.value.id,
    discoveredFiles,
    fastFiles,
    migrationFiles,
  };
}

export function parseVitestCounts(
  value: unknown,
): VerificationTestCounts | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const report = value as Record<string, unknown>;
  const count = (key: string): number | null =>
    Number.isSafeInteger(report[key]) && Number(report[key]) >= 0
      ? Number(report[key])
      : null;
  const suites = {
    total: count("numTotalTestSuites"),
    passed: count("numPassedTestSuites"),
    failed: count("numFailedTestSuites"),
    skipped: count("numPendingTestSuites"),
  };
  const tests = {
    total: count("numTotalTests"),
    passed: count("numPassedTests"),
    failed: count("numFailedTests"),
    skipped: count("numPendingTests"),
  };
  if (
    [...Object.values(suites), ...Object.values(tests)].some(
      (item) => item === null,
    )
  )
    return null;
  return {
    suites: suites as VerificationTestCounts["suites"],
    tests: tests as VerificationTestCounts["tests"],
  };
}

export async function runUnitPartition(
  repositoryRoot: string,
  kind: "fast" | "migration",
): Promise<{
  readonly reportPath: string;
  readonly counts: VerificationTestCounts;
}> {
  const partition = await buildUnitTestPartition(repositoryRoot);
  const context = await evidenceContext(
    kind === "fast" ? "candidate-unit" : "migration-unit",
    kind === "fast" ? "test:unit:fast" : "test:unit:migrations",
  );
  const files =
    kind === "fast" ? partition.fastFiles : partition.migrationFiles;
  const reportName = `${kind === "fast" ? "fast-unit" : "migration-unit"}-vitest-report.json`;
  const reportPath = resolve(context.artifactDirectory, reportName);
  const partitionPath = resolve(
    context.artifactDirectory,
    "unit-partition-report.json",
  );
  await writeJson(partitionPath, {
    schemaVersion: "1.0.0",
    status: "PASS",
    ...partition,
    selectedPartition: kind,
    selectedFiles: files,
  });
  const command = await runCommand(
    {
      id: `${kind}-unit-vitest`,
      executable: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.config.ts",
        ...files,
        "--fileParallelism=false",
        "--reporter=json",
        `--outputFile=${reportPath}`,
      ],
      parser: "exit-code",
    },
    {
      workingDirectory: repositoryRoot,
      artifactDirectory: resolve(context.artifactDirectory, "logs"),
      timeoutMs: 20 * 60 * 1000,
      trustedControllerCommand: true,
    },
  );
  if (command.status !== "PASS")
    throw new VerificationCheckFailure(
      `${kind} unit partition failed: ${command.message} Logs: ${command.stdoutPath}, ${command.stderrPath}.`,
    );
  const counts = parseVitestCounts(
    JSON.parse(await readFile(reportPath, "utf8")) as unknown,
  );
  if (!counts)
    throw new Error(
      `${kind} unit Vitest report does not contain valid test counts.`,
    );
  await writeReceipt(
    context,
    [
      {
        id: "partition-is-disjoint-and-complete",
        summary: `${partition.fastFiles.length} fast plus ${partition.migrationFiles.length} migration files exactly equal ${partition.discoveredFiles.length} discovered unit files.`,
      },
      {
        id: `${kind}-unit-suite-passed`,
        summary: `${counts.suites.passed} suites and ${counts.tests.passed} tests passed in the ${kind} partition.`,
      },
    ],
    [
      {
        path: reportName,
        kind:
          kind === "fast"
            ? "fast-unit-vitest-report"
            : "migration-unit-vitest-report",
      },
      { path: "unit-partition-report.json", kind: "unit-partition-report" },
    ],
  );
  return { reportPath, counts };
}
