import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { MilestoneOrchestrator } from "../src/orchestrator.js";

interface ResumeMetadata {
  readonly root: string;
  readonly configPath: string;
  readonly claimPath: string;
}

const [metadataPath, barrierPath, contenderId] = process.argv.slice(2);
if (!metadataPath || !barrierPath || !contenderId)
  throw new Error(
    "Candidate resume contender requires metadata, barrier, and identity.",
  );

const metadata = JSON.parse(
  await (await import("node:fs/promises")).readFile(metadataPath, "utf8"),
) as ResumeMetadata;
await writeFile(`${barrierPath}.${contenderId}.ready`, "ready\n", "utf8");
const deadline = Date.now() + 30_000;
while (!existsSync(barrierPath)) {
  if (Date.now() >= deadline)
    throw new Error("Timed out waiting for candidate resume barrier.");
  await delay(10);
}

let hookCount = 0;
const orchestrator = await MilestoneOrchestrator.open(
  metadata.root,
  metadata.configPath,
  {
    gateway: {
      run: async () => {
        throw new Error("Checkpoint recovery must not relaunch the Worker.");
      },
    },
    now: () => new Date("2026-08-23T20:00:00.000Z"),
    evidenceDiscovery: async () => [],
    candidatePrepareHooks: {
      async fault() {
        hookCount += 1;
        if (hookCount !== 1) return;
        await writeFile(metadata.claimPath, `${contenderId}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
      },
    },
  },
);
const state = orchestrator.state;
await orchestrator.close();
process.stdout.write(
  `${JSON.stringify({
    contenderId,
    hookCount,
    revision: state.revision,
    pending: state.pendingOperation?.kind ?? null,
    milestoneStatus: state.milestones[0]?.status ?? null,
  })}\n`,
);
