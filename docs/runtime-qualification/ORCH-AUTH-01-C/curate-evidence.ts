import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  inventoryContainerArtifacts,
  publishContainerArtifacts,
} from "../../../tools/milestone-orchestrator/src/container-artifacts.js";

assert.equal(process.version, "v24.18.0");
assert.equal(
  process.argv.length,
  5,
  "Expected <development-evidence> <fresh-curated-root> <fresh-evidence-directory>.",
);
const source = resolve(process.argv[2]!);
const curated = resolve(process.argv[3]!);
const destination = resolve(process.argv[4]!);
assert(!existsSync(curated) && !existsSync(destination));
const limits = { maximumFiles: 5_000, maximumBytes: 64 * 1024 * 1024 };
const raw = resolve(curated, "raw");
await mkdir(raw, { recursive: true });
const roots = [
  "focused-1",
  "focused-final",
  "owner-final",
  "checks",
  "inspection",
  "setup",
  "discovery-windows",
  "discovery-wsl",
  "discovery-remote",
  "discovery-final-windows",
  "discovery-final-wsl",
  "discovery-final-remote",
];
for (const path of roots)
  await publishContainerArtifacts({
    sourceRoot: resolve(source, path),
    destinationRoot: resolve(raw, path),
    limits,
  });
await mkdir(resolve(raw, "entry-closeout"));
for (const name of ["result.json", "manifest.json", "closeout-report.json"])
  await writeFile(
    resolve(raw, "entry-closeout", name),
    await readFile(resolve(source, "entry-closeout", name)),
    { flag: "wx" },
  );
const inventory = await inventoryContainerArtifacts(raw, limits);
const inventoryBytes = Buffer.from(JSON.stringify(inventory, null, 2) + "\n");
await writeFile(resolve(curated, "raw-inventory.json"), inventoryBytes, {
  flag: "wx",
});
await mkdir(destination);
const archivePath = resolve(destination, "supporting-evidence.tar.gz");
execFileSync(
  "tar",
  ["-czf", archivePath, "-C", curated, "raw", "raw-inventory.json"],
  { windowsHide: true, timeout: 60_000 },
);
const archive = await readFile(archivePath);
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const manifest = {
  schemaVersion: "orch-auth-01-c-evidence.v1",
  completionEligible: false,
  inventorySha256: sha256(inventoryBytes),
  rawFiles: inventory.fileCount,
  archive: {
    file: "supporting-evidence.tar.gz",
    bytes: archive.length,
    sha256: sha256(archive),
  },
};
await writeFile(
  resolve(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { flag: "wx" },
);
process.stdout.write(JSON.stringify(manifest) + "\n");
