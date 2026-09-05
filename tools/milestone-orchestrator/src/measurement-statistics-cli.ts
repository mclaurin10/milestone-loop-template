import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  commandIdentity,
  evidenceContext,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import {
  buildMeasurementStatistics,
  MEASUREMENT_MATRIX_PAIR_COUNT,
  MEASUREMENT_STATISTICS_KIND,
  MEASUREMENT_STATISTICS_NAME,
  validateMeasurementStatisticsArtifacts,
  type MeasurementStatisticsPlatform,
  type MeasurementStatisticsExpectation,
} from "./measurement-statistics.js";

const STAGE_ID = "wp6-measurement-statistics";
const COMMAND_ID = "measurement-statistics";
const GIT_ID_PATTERN = /^[a-f0-9]{40}$/u;
const SAFE_JOB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;

export interface MeasurementStatisticsCliArguments {
  readonly inputRoot: string;
  readonly platformId: MeasurementStatisticsPlatform;
  readonly sourceGithubRunId: string | null;
  readonly sourceGithubRunAttempt: number | null;
  readonly sourceGithubJob: string | null;
  readonly validateExistingPath: string | null;
}

export function parseMeasurementStatisticsCliArguments(
  values: readonly string[],
): MeasurementStatisticsCliArguments {
  const normalized = values[0] === "--" ? values.slice(1) : values;
  let inputRoot: string | undefined;
  let platformId: MeasurementStatisticsPlatform | undefined;
  let sourceGithubRunId: string | null = null;
  let sourceGithubRunAttempt: number | null = null;
  let sourceGithubJob: string | null = null;
  let validateExistingPath: string | null = null;
  const seen = new Set<string>();
  for (let index = 0; index < normalized.length; index += 1) {
    const option = normalized[index];
    if (
      option !== "--input" &&
      option !== "--platform" &&
      option !== "--source-github-run-id" &&
      option !== "--source-github-run-attempt" &&
      option !== "--source-github-job" &&
      option !== "--validate-existing"
    )
      throw new Error(
        `Unknown measurement-statistics option: ${option ?? "(missing)"}.`,
      );
    if (seen.has(option))
      throw new Error(`${option} may be supplied only once.`);
    seen.add(option);
    const value = normalized[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${option} requires one value.`);
    index += 1;
    if (option === "--input") inputRoot = value;
    else if (option === "--platform") {
      if (value !== "linux" && value !== "windows")
        throw new Error("--platform must be linux or windows.");
      platformId = value;
    } else if (option === "--source-github-run-id") {
      if (!/^[1-9][0-9]*$/u.test(value))
        throw new Error(
          "--source-github-run-id must be a canonical positive integer.",
        );
      sourceGithubRunId = value;
    } else if (option === "--source-github-run-attempt") {
      if (!/^[1-9][0-9]*$/u.test(value))
        throw new Error(
          "--source-github-run-attempt must be a canonical positive integer.",
        );
      sourceGithubRunAttempt = Number(value);
      if (!Number.isSafeInteger(sourceGithubRunAttempt))
        throw new Error(
          "--source-github-run-attempt exceeds the safe integer range.",
        );
    } else if (option === "--source-github-job") {
      if (!SAFE_JOB_PATTERN.test(value))
        throw new Error("--source-github-job must be a safe identifier.");
      sourceGithubJob = value;
    } else validateExistingPath = value;
  }
  if (!inputRoot || !platformId)
    throw new Error("Measurement statistics require --input and --platform.");
  const githubValues = [
    sourceGithubRunId,
    sourceGithubRunAttempt,
    sourceGithubJob,
  ];
  if (
    githubValues.some((value) => value !== null) &&
    githubValues.some((value) => value === null)
  )
    throw new Error(
      "GitHub source context requires run id, run attempt, and job together.",
    );
  return {
    inputRoot,
    platformId,
    sourceGithubRunId,
    sourceGithubRunAttempt,
    sourceGithubJob,
    validateExistingPath,
  };
}

export function measurementStatisticsExpectation(
  args: MeasurementStatisticsCliArguments,
  identity: { readonly gitCommit: string; readonly gitTree: string },
): MeasurementStatisticsExpectation {
  const executionContext = args.sourceGithubRunId
    ? {
        provider: "github-actions" as const,
        githubRunId: args.sourceGithubRunId,
        githubRunAttempt: args.sourceGithubRunAttempt!,
        githubJob: args.sourceGithubJob!,
      }
    : {
        provider: "local-validation" as const,
        githubRunId: null,
        githubRunAttempt: null,
        githubJob: null,
      };
  // Reproduction validates the retained identity across every lane and receipt.
  // Historical evidence belongs to its measured candidate, while the new
  // command receipt identifies the checkout doing the validation.
  return {
    platformId: args.platformId,
    pairCount: MEASUREMENT_MATRIX_PAIR_COUNT,
    ...(!args.validateExistingPath
      ? {
          candidate: { ...identity, workingTreeDirty: false as const },
          executionContext,
        }
      : args.sourceGithubRunId
        ? { executionContext }
        : {}),
  };
}

export async function runMeasurementStatisticsCli(
  values: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let args: MeasurementStatisticsCliArguments;
  try {
    args = parseMeasurementStatisticsCliArguments(values);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n` +
        "Usage: measurement-statistics-cli.ts --input <matrix-root> --platform <linux|windows> [--source-github-run-id <id> --source-github-run-attempt <n> --source-github-job <id>] [--validate-existing <statistics.json>]\n",
    );
    return 64;
  }

  const context = await evidenceContext(STAGE_ID, COMMAND_ID);
  try {
    const identity = await commandIdentity(context.repositoryRoot);
    if (
      !GIT_ID_PATTERN.test(identity.gitCommit) ||
      !GIT_ID_PATTERN.test(identity.gitTree) ||
      identity.gitStatus !== "" ||
      identity.nodeVersion !== "v24.18.0" ||
      identity.pnpmVersion !== "11.15.1"
    )
      throw new Error(
        "Measurement statistics require a clean exact-runtime candidate identity.",
      );
    const expectation = measurementStatisticsExpectation(args, {
      gitCommit: identity.gitCommit,
      gitTree: identity.gitTree,
    });
    const statisticsPath = resolve(
      context.artifactDirectory,
      MEASUREMENT_STATISTICS_NAME,
    );
    if (args.validateExistingPath) {
      const sourcePath = resolve(args.validateExistingPath);
      await validateMeasurementStatisticsArtifacts({
        statisticsPath: sourcePath,
        inputRoot: resolve(args.inputRoot),
        expectation,
      });
      await copyFile(sourcePath, statisticsPath, constants.COPYFILE_EXCL);
      await validateMeasurementStatisticsArtifacts({
        statisticsPath,
        inputRoot: resolve(args.inputRoot),
        expectation,
      });
    } else {
      await buildMeasurementStatistics({
        inputRoot: resolve(args.inputRoot),
        outputPath: statisticsPath,
        ...expectation,
      });
    }
    await writeReceipt(
      context,
      [
        {
          id: "complete-five-pair-matrix",
          summary: `Exactly five cold and five warm ${args.platformId} lane records were independently validated and paired.`,
        },
        {
          id: "deterministic-descriptive-statistics",
          summary:
            "Median, range, median absolute deviation, CPU, peak RSS, and test-count statistics were reproduced without a threshold or cold/warm comparison.",
        },
      ],
      [
        {
          path: MEASUREMENT_STATISTICS_NAME,
          kind: MEASUREMENT_STATISTICS_KIND,
        },
      ],
    );
    process.stdout.write(
      `Measurement statistics passed for ${args.platformId}: ${statisticsPath}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeManualEvidenceFailure(context, { kind: "product", message });
    process.stderr.write(`Measurement statistics failed: ${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url)
  process.exitCode = await runMeasurementStatisticsCli();
