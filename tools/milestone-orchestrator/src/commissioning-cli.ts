import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  commissionRepository,
  renderCommissioningResult,
} from "./commissioning.js";
import { amendCommissionedRepository } from "./commissioning-amendment.js";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../evidence.mjs";

export interface CommissioningCliArguments {
  readonly inputPath: string;
}

export interface AmendmentCliArguments {
  readonly mode: "amend";
  readonly descriptorPath: string;
  readonly resume: boolean;
}

export function parseAmendmentCliArguments(
  values: readonly string[],
): AmendmentCliArguments {
  const args = values[0] === "--" ? values.slice(1) : values;
  let descriptorPath: string | undefined;
  let resume = false;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--resume" && !resume) resume = true;
    else if (option === "--descriptor" && !descriptorPath) {
      descriptorPath = args[++index];
      if (!descriptorPath || descriptorPath.startsWith("--"))
        throw new Error("--descriptor requires one file path.");
    } else throw new Error(`Unknown or repeated amendment option: ${option}.`);
  }
  if (!descriptorPath)
    throw new Error("Amendment requires --descriptor <file>.");
  return { mode: "amend", descriptorPath, resume };
}

export async function runAmendmentCli(
  args: AmendmentCliArguments,
  repositoryRoot = commissioningRepositoryRoot(),
): Promise<number> {
  const context = await evidenceContext(
    "commissioning-amendment",
    "loop:commission:amend",
  );
  try {
    const result = await amendCommissionedRepository({
      repositoryRoot,
      descriptorPath: args.descriptorPath,
      resume: args.resume,
    });
    await writeFile(
      resolve(context.artifactDirectory, "amendment-report.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { flag: "wx" },
    );
    await writeReceipt(
      context,
      [
        {
          id: "git-anchored-generation",
          summary:
            "The complete input, policy, manifest, descriptor, and append-only Git-anchored generation passed production validation.",
        },
        {
          id: "publication-complete",
          summary:
            "Every staged byte is published, the pending operation is absent, and commissioning Doctor passed.",
        },
      ],
      [
        {
          path: "amendment-report.json",
          kind: "commissioning-amendment-report",
        },
      ],
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeManualEvidenceFailure(context, { kind: "product", message });
    process.stderr.write(`Commissioning amendment failed: ${message}\n`);
    return 1;
  }
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
    if (process.argv[2] === "amend")
      return await runAmendmentCli(
        parseAmendmentCliArguments(process.argv.slice(3)),
      );
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
