import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { proveFreshAdopterBootstrap } from "./adopter-package-proof.js";

export interface AdopterPackageProofCliArguments {
  readonly definitionPath: string;
  readonly artifactDirectory: string;
}

export function parseAdopterPackageProofCliArguments(
  values: readonly string[],
): AdopterPackageProofCliArguments {
  let definitionPath: string | undefined;
  let artifactDirectory: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    if (option !== "--definition" && option !== "--artifact-dir")
      throw new Error(
        `Unknown fresh-adopter proof option: ${option ?? "(missing)"}.`,
      );
    const value = values[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${option} requires one path.`);
    index += 1;
    if (option === "--definition") {
      if (definitionPath)
        throw new Error("--definition may be supplied only once.");
      definitionPath = value;
    } else {
      if (artifactDirectory)
        throw new Error("--artifact-dir may be supplied only once.");
      artifactDirectory = value;
    }
  }
  if (!definitionPath || !artifactDirectory)
    throw new Error(
      "Fresh-adopter proof requires --definition <file> and --artifact-dir <absent-directory>.",
    );
  return { definitionPath, artifactDirectory };
}

async function main(): Promise<number> {
  try {
    const args = parseAdopterPackageProofCliArguments(process.argv.slice(2));
    const result = await proveFreshAdopterBootstrap({
      definitionPath: resolve(args.definitionPath),
      artifactDirectory: resolve(args.artifactDirectory),
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
