import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CodexGateway } from "../src/codex-gateway.js";
import {
  CANDIDATE_PREPARE_FAULT_POINTS,
  type CandidatePrepareFaultPoint,
} from "../src/candidate-prepare.js";
import { MilestoneOrchestrator } from "../src/orchestrator.js";

interface CrashWorkerMetadata {
  readonly root: string;
  readonly configPath: string;
  readonly milestoneId: string;
  readonly workspacePath: string;
  readonly crashMarkerPath: string;
  readonly faultPoint?: CandidatePrepareFaultPoint;
}

const metadataPath = process.argv[2];
if (!metadataPath)
  throw new Error("Candidate-prepare crash worker requires metadata.");

const metadata = JSON.parse(
  await (await import("node:fs/promises")).readFile(metadataPath, "utf8"),
) as CrashWorkerMetadata;

if (
  metadata.faultPoint !== undefined &&
  !CANDIDATE_PREPARE_FAULT_POINTS.includes(metadata.faultPoint)
)
  throw new Error(
    `Unknown candidate-prepare fault point ${metadata.faultPoint}.`,
  );

process.env["CANDIDATE_PREPARE_CRASH_PID"] = String(process.pid);
process.env["CANDIDATE_PREPARE_CRASH_MARKER"] = metadata.crashMarkerPath;

const gateway: CodexGateway = {
  run: async (invocation) => {
    const threadId = "candidate-prepare-baseline-thread";
    await mkdir(dirname(invocation.eventLogPath), { recursive: true });
    await writeFile(
      invocation.eventLogPath,
      [
        JSON.stringify({ type: "thread.started", thread_id: threadId }),
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "baseline-message",
            type: "agent_message",
            text: "Checkpoint the bounded baseline change.",
          },
        }),
        JSON.stringify({ type: "turn.completed", usage: {} }),
        "",
      ].join("\n"),
      "utf8",
    );
    await invocation.onThreadStarted?.(threadId);
    await writeFile(
      resolve(invocation.workingDirectory, "change.txt"),
      "authorized worker output\n",
      "utf8",
    );
    return {
      threadId,
      finalResponse: "Checkpoint the bounded baseline change.",
      usage: null,
      itemCount: 1,
    };
  },
};

const orchestrator = await MilestoneOrchestrator.open(
  metadata.root,
  metadata.configPath,
  {
    gateway,
    now: () => new Date("2026-08-23T20:00:00.000Z"),
    evidenceDiscovery: async () => [],
    ...(metadata.faultPoint === undefined
      ? {}
      : {
          candidatePrepareHooks: {
            fault: async (point) => {
              if (point !== metadata.faultPoint) return;
              await mkdir(dirname(metadata.crashMarkerPath), {
                recursive: true,
              });
              await writeFile(
                metadata.crashMarkerPath,
                `${JSON.stringify({ point, pid: process.pid })}\n`,
                "utf8",
              );
              process.exit(86);
            },
          },
        }),
  },
);

// This call is deliberately scoped to the Worker/checkpoint boundary. The
// post-commit hook terminates this process after Git advances HEAD, so normal
// return is a failed baseline setup rather than a successful test outcome.
await (
  orchestrator as unknown as {
    runWorker(id: string): Promise<void>;
  }
).runWorker(metadata.milestoneId);

await orchestrator.close();
throw new Error("Candidate-prepare crash hook did not terminate the worker.");
