import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  renderWorkedExampleValidationResult,
  validateWorkedExample,
} from "./worked-example.js";

export interface WorkedExampleCliArguments {
  readonly descriptorPath: string;
}

export function parseWorkedExampleCliArguments(
  values: readonly string[],
): WorkedExampleCliArguments {
  let descriptorPath: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    if (option !== "--descriptor")
      throw new Error(
        `Unknown worked-example option: ${option ?? "(missing)"}.`,
      );
    if (descriptorPath)
      throw new Error(
        "Worked-example validation accepts exactly one --descriptor option.",
      );
    const value = values[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error("--descriptor requires one file path.");
    descriptorPath = value;
    index += 1;
  }
  if (!descriptorPath)
    throw new Error("Worked-example validation requires --descriptor <file>.");
  return { descriptorPath };
}

export function workedExampleRepositoryRoot(start = process.cwd()): string {
  const result = spawnSync(
    "git",
    ["-C", start, "rev-parse", "--show-toplevel"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot locate worked-example repository root: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return resolve(result.stdout.trim());
}

export async function runWorkedExampleCli(
  args: WorkedExampleCliArguments,
  repositoryRoot = workedExampleRepositoryRoot(),
): Promise<number> {
  const result = await validateWorkedExample({
    repositoryRoot,
    descriptorPath: resolve(process.cwd(), args.descriptorPath),
  });
  process.stdout.write(renderWorkedExampleValidationResult(result));
  return 0;
}

async function main(): Promise<number> {
  try {
    return await runWorkedExampleCli(
      parseWorkedExampleCliArguments(process.argv.slice(2)),
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
