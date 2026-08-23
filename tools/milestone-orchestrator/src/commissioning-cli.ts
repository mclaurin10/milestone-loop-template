import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  commissionRepository,
  renderCommissioningResult,
} from "./commissioning.js";

export interface CommissioningCliArguments {
  readonly inputPath: string;
}

export function parseCommissioningCliArguments(
  values: readonly string[],
): CommissioningCliArguments {
  const normalizedValues = values[0] === "--" ? values.slice(1) : values;
  let inputPath: string | undefined;
  for (let index = 0; index < normalizedValues.length; index += 1) {
    const option = normalizedValues[index];
    if (option !== "--input")
      throw new Error(
        `Unknown commissioning option: ${option ?? "(missing)"}.`,
      );
    if (inputPath)
      throw new Error("Commissioning accepts exactly one --input option.");
    const value = normalizedValues[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error("--input requires one file path.");
    inputPath = value;
    index += 1;
  }
  if (!inputPath) throw new Error("Commissioning requires --input <file>.");
  return { inputPath };
}

export function commissioningRepositoryRoot(start = process.cwd()): string {
  const result = spawnSync(
    "git",
    ["-C", start, "rev-parse", "--show-toplevel"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot locate commissioning repository root: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return resolve(result.stdout.trim());
}

export async function runCommissioningCli(
  args: CommissioningCliArguments,
  repositoryRoot = commissioningRepositoryRoot(),
): Promise<number> {
  const result = await commissionRepository({
    repositoryRoot,
    inputPath: resolve(process.cwd(), args.inputPath),
  });
  process.stdout.write(renderCommissioningResult(result));
  return 0;
}

async function main(): Promise<number> {
  try {
    return await runCommissioningCli(
      parseCommissioningCliArguments(process.argv.slice(2)),
    );
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
