import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createAdopterPackage } from "./adopter-package.js";

export interface AdopterPackageCliArguments {
  readonly definitionPath: string;
  readonly outputPath: string;
}

export function parseAdopterPackageCliArguments(
  values: readonly string[],
): AdopterPackageCliArguments {
  const normalizedValues = values[0] === "--" ? values.slice(1) : values;
  let definitionPath: string | undefined;
  let outputPath: string | undefined;
  for (let index = 0; index < normalizedValues.length; index += 1) {
    const option = normalizedValues[index];
    if (option !== "--definition" && option !== "--output")
      throw new Error(
        `Unknown adopter package option: ${option ?? "(missing)"}.`,
      );
    const value = normalizedValues[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${option} requires one path.`);
    index += 1;
    if (option === "--definition") {
      if (definitionPath)
        throw new Error("--definition may be supplied only once.");
      definitionPath = value;
    } else {
      if (outputPath) throw new Error("--output may be supplied only once.");
      outputPath = value;
    }
  }
  if (!definitionPath || !outputPath)
    throw new Error(
      "Adopter package creation requires --definition <file> and --output <absent-directory>.",
    );
  return { definitionPath, outputPath };
}

async function main(): Promise<number> {
  try {
    const args = parseAdopterPackageCliArguments(process.argv.slice(2));
    const result = await createAdopterPackage({
      definitionPath: resolve(args.definitionPath),
      outputPath: resolve(args.outputPath),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
