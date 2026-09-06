import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  lstat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
const original = resolve("artifacts/orch-auth-01-c2"),
  destination = resolve(process.argv[2]!);
assert(!existsSync(destination));
await mkdir(resolve(destination, "raw"), { recursive: true });
const raw = resolve(destination, "raw");
async function copy(source: string, target: string) {
  const stat = await lstat(source);
  assert(stat.isFile() && !stat.isSymbolicLink());
  await mkdir(dirname(target), { recursive: true });
  if (existsSync(target)) {
    assert.deepEqual(await readFile(source), await readFile(target));
    return;
  }
  await copyFile(source, target);
}
const receipts = [
  ["entry-closeout", "orch-auth-01-c", "host-discovery-closeout"],
  ["focused-final", "orch-auth-01-c2", "vm-lifecycle-focused"],
  ["owner-final", "wp6-shadow-partition", "test:partition:repository-tooling"],
  ["checks/typecheck", "typecheck", "typecheck"],
  ["checks/lint", "format-lint", "lint"],
  ["checks/format-check", "format-lint", "format:check"],
  ["checks/test-invariants", "invariant-suite", "test:invariants"],
  ...[
    "protected-integrity",
    "test-ownership",
    "orchestrator-schema-integrity",
    "orchestrator-policy-integrity",
    "fail-closed-evidence",
  ].map((id) => [
    `checks/test-invariants/entries/${id}`,
    "invariant-suite",
    id,
  ]),
  ["lifecycle-final", "orch-auth-01-c2", "vm-lifecycle"],
  [
    "provenance-boundaries",
    "orch-auth-01-c2",
    "provenance-and-linux-boundaries",
  ],
  ["independent-cleanup", "orch-auth-01-c2", "independent-cleanup-observation"],
  ["lifecycle-independent-audit", "orch-auth-01-c2", "vm-evidence-audit"],
];
for (const [path] of receipts) {
  const root = resolve(original, path!);
  const receipt = JSON.parse(
    await readFile(resolve(root, "result.json"), "utf8"),
  );
  for (const name of [
    "result.json",
    "manifest.json",
    ...receipt.artifacts.map((artifact: any) => artifact.path),
  ]) {
    assert(!name.startsWith("/") && !name.split("/").includes(".."));
    const input = resolve(root, name);
    if (existsSync(input)) await copy(input, resolve(raw, path!, name));
    else throw new Error("Missing receipt file " + input);
  }
}
for (const name of ["stdout.log", "stderr.log", "raw/qemu.stderr"]) {
  await copy(
    resolve(original, "lifecycle-final", name),
    resolve(raw, "lifecycle-final", name),
  );
}
async function tree(source: string, target: string) {
  await mkdir(target, { recursive: true });
  for (const name of await readdir(source)) {
    assert(name !== ".git");
    const input = resolve(source, name),
      stat = await lstat(input);
    assert(!stat.isSymbolicLink());
    if (stat.isDirectory()) await tree(input, resolve(target, name));
    else await copy(input, resolve(target, name));
  }
}
for (const path of [
  "setup",
  "lifecycle-pilot",
  "focused-initial",
  "checks/build",
  "tamper-audit",
])
  await tree(resolve(original, path), resolve(raw, path));
for (const name of [
  "entry-archive-members.txt",
  "wsl-tools-inspection.json",
  "apt-list-inspection.json",
  "apt-simulation.log",
  "prepare-inputs.log",
  "freeze-inputs-r3.log",
  "preparation-diagnostics.json",
  "windows-observation.json",
  "build-observation.json",
  "tamper-observation.json",
  "tamper-console.log",
  "collector-before-package-path-fix.mjs",
  "collector-before-doc-link-fix.mjs",
  "collector-pilot.mjs",
  "outer-pilot.ts",
  "capture-source.mjs",
])
  await copy(resolve(original, name), resolve(raw, "inspection", name));
await copy(
  resolve(original, "tampered-lifecycle/raw/serial.log"),
  resolve(raw, "tamper-audit/mutated-serial.log"),
);
const preparation =
  "\\\\wsl.localhost\\Ubuntu\\home\\duncan\\oc2-1_hj5pul\\preparation";
for (const name of await readdir(preparation)) {
  if (
    name.endsWith(".stdout") ||
    name.endsWith(".stderr") ||
    name.endsWith("-elf.json") ||
    name === "root.txt"
  )
    await copy(
      resolve(preparation, name),
      resolve(raw, "preparation-observations", name),
    );
}
await writeFile(
  resolve(raw, "supporting-receipts.json"),
  JSON.stringify(receipts, null, 2) + "\n",
);
const inventory = await inventoryContainerArtifacts(raw, {
  maximumFiles: 5000,
  maximumBytes: 64 * 1024 * 1024,
});
await writeFile(
  resolve(destination, "raw-inventory.json"),
  JSON.stringify(inventory, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({ files: inventory.fileCount, receipts: receipts.length }) +
    "\n",
);
