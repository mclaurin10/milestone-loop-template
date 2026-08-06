import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { MilestoneOrchestrator } from "../src/orchestrator.js";

interface Metadata {
  readonly root: string;
  readonly configPath: string;
}

const [metadataPath, barrierPath, contenderId] = process.argv.slice(2);
if (!metadataPath) throw new Error("Expected fixture metadata path.");
if (barrierPath && contenderId) {
  await writeFile(`${barrierPath}.${contenderId}.ready`, `${process.pid}\n`);
  while (!existsSync(barrierPath)) await delay(10);
}
const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Metadata;
const orchestrator = await MilestoneOrchestrator.open(
  metadata.root,
  metadata.configPath,
  { now: () => new Date("2026-08-02T18:00:00.000Z") },
);
await orchestrator.close();
