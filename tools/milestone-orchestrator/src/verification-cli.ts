import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { VerificationTier } from "./contracts.js";
import {
  runInvariantSuite,
  runUnitPartition,
  VerificationCheckFailure,
} from "./invariant-suite.js";
import { runVerificationTier } from "./verification-tier.js";

export type VerificationCliMode =
  "invariants" | "fast-unit" | "migration-unit" | VerificationTier;

export interface VerificationCliArguments {
  readonly mode: VerificationCliMode;
  readonly manifestPath?: string;
  readonly baseCommit?: string;
  readonly requireClean: boolean;
  readonly focusedCheckIds: readonly string[];
}

const MODES = new Set<VerificationCliMode>([
  "invariants",
  "fast-unit",
  "migration-unit",
  "iteration",
  "candidate",
  "milestone",
  "periodic",
]);

export function parseVerificationCliArguments(
  values: readonly string[],
): VerificationCliArguments {
  const [modeValue, ...options] = values;
  if (!modeValue || !MODES.has(modeValue as VerificationCliMode))
    throw new Error(`Unknown verification mode: ${modeValue ?? "(missing)"}.`);
  const mode = modeValue as VerificationCliMode;
  let manifestPath: string | undefined;
  let baseCommit: string | undefined;
  let requireClean = false;
  const focusedCheckIds: string[] = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--require-clean") {
      requireClean = true;
      continue;
    }
    if (
      option === "--manifest" ||
      option === "--base" ||
      option === "--focused"
    ) {
      const value = options[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${option} requires one non-empty value.`);
      index += 1;
      if (option === "--manifest") manifestPath = value;
      else if (option === "--base") baseCommit = value;
      else focusedCheckIds.push(value);
      continue;
    }
    throw new Error(`Unknown verification option: ${option ?? "(missing)"}.`);
  }
  if (
    (mode === "invariants" ||
      mode === "fast-unit" ||
      mode === "migration-unit") &&
    (manifestPath || baseCommit || requireClean || focusedCheckIds.length > 0)
  )
    throw new Error(`${mode} does not accept tier options.`);
  if (focusedCheckIds.length > 0 && mode !== "iteration")
    throw new Error(
      "Explicit --focused checks are allowed only for iteration verification.",
    );
  return {
    mode,
    ...(manifestPath ? { manifestPath } : {}),
    ...(baseCommit ? { baseCommit } : {}),
    requireClean,
    focusedCheckIds: [...new Set(focusedCheckIds)],
  };
}

export function verificationRepositoryRoot(start = process.cwd()): string {
  const result = spawnSync(
    "git",
    ["-C", start, "rev-parse", "--show-toplevel"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot locate repository root: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return resolve(result.stdout.trim());
}

export async function runVerificationCli(
  args: VerificationCliArguments,
  repositoryRoot = verificationRepositoryRoot(),
): Promise<number> {
  if (args.mode === "invariants") {
    const result = await runInvariantSuite(repositoryRoot);
    process.stdout.write(
      `Invariant suite passed ${result.commandCount} commands in ${result.durationMs} ms.\n`,
    );
    return 0;
  }
  if (args.mode === "fast-unit" || args.mode === "migration-unit") {
    const kind = args.mode === "fast-unit" ? "fast" : "migration";
    const result = await runUnitPartition(repositoryRoot, kind);
    process.stdout.write(
      `${kind} unit partition passed ${result.counts.tests.passed} tests.\n`,
    );
    return 0;
  }
  const result = await runVerificationTier({
    repositoryRoot,
    tier: args.mode,
    requireClean: args.requireClean,
    ...(args.manifestPath ? { manifestPath: args.manifestPath } : {}),
    ...(args.baseCommit ? { baseCommit: args.baseCommit } : {}),
    ...(args.focusedCheckIds.length > 0
      ? { focusedCheckIds: args.focusedCheckIds }
      : {}),
  });
  return result.exitCode;
}

async function main(): Promise<number> {
  try {
    return await runVerificationCli(
      parseVerificationCliArguments(process.argv.slice(2)),
    );
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    return error instanceof VerificationCheckFailure ? 1 : 3;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
