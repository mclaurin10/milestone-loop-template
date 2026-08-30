import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  evidenceContext,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import {
  MEASUREMENT_LANE_CHILD_RECEIPT_KIND,
  MEASUREMENT_LANE_PAIRED_COLD_RECORD_KIND,
  MEASUREMENT_LANE_RECORD_KIND,
  MEASUREMENT_LANE_RECORD_NAME,
  runMeasurementLane,
  validateMeasurementLaneArtifacts,
  type MeasurementLaneClassification,
} from "./measurement-lane.js";
import {
  TEST_RUN_REDUCTION_KIND,
  TEST_RUN_REDUCTION_NAME,
  TEST_RUN_SUMMARY_KIND,
} from "./test-run-summary.js";

const STAGE_ID = "wp6-measurement-lane";
const COMMAND_ID = "measurement-lane";
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;

export interface MeasurementLaneCliArguments {
  readonly laneRunId: string;
  readonly ordinal: number;
  readonly classification: MeasurementLaneClassification;
  readonly workspaceId: string;
  readonly commandIds: readonly string[];
  readonly pairedColdRecordPath: string | null;
}

export function parseMeasurementLaneCliArguments(
  values: readonly string[],
): MeasurementLaneCliArguments {
  const normalized = values[0] === "--" ? values.slice(1) : values;
  let laneRunId: string | undefined;
  let ordinal: number | undefined;
  let classification: MeasurementLaneClassification | undefined;
  let workspaceId: string | undefined;
  let pairedColdRecordPath: string | null = null;
  const commandIds: string[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const option = normalized[index];
    if (
      option !== "--lane-run-id" &&
      option !== "--ordinal" &&
      option !== "--classification" &&
      option !== "--workspace-id" &&
      option !== "--command" &&
      option !== "--paired-cold-record"
    )
      throw new Error(
        `Unknown measurement-lane option: ${option ?? "(missing)"}.`,
      );
    const value = normalized[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${option} requires one value.`);
    index += 1;
    if (option === "--lane-run-id") {
      if (laneRunId)
        throw new Error("--lane-run-id may be supplied only once.");
      laneRunId = value;
    } else if (option === "--ordinal") {
      if (ordinal !== undefined)
        throw new Error("--ordinal may be supplied only once.");
      if (!/^[1-9][0-9]*$/u.test(value))
        throw new Error("--ordinal must be a canonical positive integer.");
      ordinal = Number(value);
      if (!Number.isSafeInteger(ordinal))
        throw new Error("--ordinal exceeds the safe integer range.");
    } else if (option === "--classification") {
      if (classification)
        throw new Error("--classification may be supplied only once.");
      if (value !== "cold" && value !== "warm")
        throw new Error("--classification must be cold or warm.");
      classification = value;
    } else if (option === "--workspace-id") {
      if (workspaceId)
        throw new Error("--workspace-id may be supplied only once.");
      workspaceId = value;
    } else if (option === "--command") {
      commandIds.push(value);
    } else {
      if (pairedColdRecordPath)
        throw new Error("--paired-cold-record may be supplied only once.");
      pairedColdRecordPath = value;
    }
  }
  if (
    !laneRunId ||
    ordinal === undefined ||
    !classification ||
    !workspaceId ||
    commandIds.length === 0
  )
    throw new Error(
      "Measurement lane requires --lane-run-id, --ordinal, --classification, --workspace-id, and at least one --command.",
    );
  if (!SAFE_ID_PATTERN.test(laneRunId) || !SAFE_ID_PATTERN.test(workspaceId))
    throw new Error("Lane-run and workspace IDs must be safe identifiers.");
  if (commandIds.some((id) => !SAFE_ID_PATTERN.test(id)))
    throw new Error("Every --command value must be a safe identifier.");
  if (new Set(commandIds).size !== commandIds.length)
    throw new Error("--command values must be unique.");
  if ((classification === "warm") !== (pairedColdRecordPath !== null))
    throw new Error(
      "Warm lanes require --paired-cold-record and cold lanes forbid it.",
    );
  return {
    laneRunId,
    ordinal,
    classification,
    workspaceId,
    commandIds,
    pairedColdRecordPath,
  };
}

export async function runMeasurementLaneCli(
  values: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let args: MeasurementLaneCliArguments;
  try {
    args = parseMeasurementLaneCliArguments(values);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n` +
        "Usage: measurement-lane-cli.ts --lane-run-id <id> --ordinal <n> --classification <cold|warm> --workspace-id <id> --command <catalogue-id> [--command <catalogue-id> ...] [--paired-cold-record <path>]\n",
    );
    return 64;
  }

  const context = await evidenceContext(STAGE_ID, COMMAND_ID);
  try {
    const result = await runMeasurementLane({
      repositoryRoot: context.repositoryRoot,
      artifactDirectory: context.artifactDirectory,
      laneRunId: args.laneRunId,
      ordinal: args.ordinal,
      classification: args.classification,
      workspaceId: args.workspaceId,
      selectedCommandIds: args.commandIds,
      ...(args.pairedColdRecordPath
        ? { pairedColdRecordPath: resolve(args.pairedColdRecordPath) }
        : {}),
    });
    await validateMeasurementLaneArtifacts(result.recordPath);
    await writeReceipt(
      context,
      [
        {
          id: "declared-measured-command-set",
          summary: `${result.record.commandSet.selectedCommandIds.length} declared measured command(s) emitted receipt-validated compact summaries.`,
        },
        {
          id: "non-semantic-lane-reduction",
          summary: `The ${args.classification} repetition produced one reproducible non-semantic reduction bound to ordinal ${args.ordinal}.`,
        },
        {
          id: "cold-warm-workspace-binding",
          summary:
            args.classification === "cold"
              ? "The cold record declares a fresh checkout/frozen-install workspace boundary without an operating-system cache claim."
              : "The warm record hash-binds its validated paired cold record and identical workspace/dependency state.",
        },
      ],
      [
        {
          path: MEASUREMENT_LANE_RECORD_NAME,
          kind: MEASUREMENT_LANE_RECORD_KIND,
        },
        { path: TEST_RUN_REDUCTION_NAME, kind: TEST_RUN_REDUCTION_KIND },
        ...result.childReceiptPaths.map((path) => ({
          path: resolve(path),
          kind: MEASUREMENT_LANE_CHILD_RECEIPT_KIND,
        })),
        ...result.summaryPaths.map((path) => ({
          path: resolve(path),
          kind: TEST_RUN_SUMMARY_KIND,
        })),
        ...(result.pairedColdCopyPath
          ? [
              {
                path: result.pairedColdCopyPath,
                kind: MEASUREMENT_LANE_PAIRED_COLD_RECORD_KIND,
              },
            ]
          : []),
      ],
    );
    process.stdout.write(
      `Measurement lane ${args.laneRunId} passed ${args.classification} ordinal ${args.ordinal} for ${result.record.commands.length} command(s).\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeManualEvidenceFailure(context, {
      kind: "product",
      message,
    });
    process.stderr.write(`Measurement lane failed: ${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url)
  process.exitCode = await runMeasurementLaneCli();
