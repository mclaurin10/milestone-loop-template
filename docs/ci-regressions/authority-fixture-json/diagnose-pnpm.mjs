import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { safeAgentEnvironment } from "/home/duncan/c6a-_6e4w_cd/repo/tools/milestone-orchestrator/src/redaction.ts";

const repo = "/home/duncan/c6a-_6e4w_cd/repo";
const output =
  "/mnt/c/Dev/loop-extraction/milestone-loop-template/artifacts/wp6e-authority-fixture-repair-20260906/omission-diagnostic-linux-5";
const node = "/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node";
const pnpm = "/home/duncan/oa1-CKn8x9/pnpm/node_modules/pnpm/bin/pnpm.mjs";
const pins = new Map([
  [node, "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c"],
  [pnpm, "ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd"],
]);
for (const [path, expected] of pins) {
  if (
    createHash("sha256").update(readFileSync(path)).digest("hex") !== expected
  )
    throw new Error(`Runtime mismatch: ${path}`);
}
mkdirSync(output);
writeFileSync(
  `${output}/executed-observer.mjs`,
  readFileSync(import.meta.filename),
);
const env = safeAgentEnvironment({
  ...process.env,
  PATH: `/home/duncan/c6a-_6e4w_cd/bin:${node.slice(0, node.lastIndexOf("/"))}:/usr/bin:/bin`,
});
const commands = [
  [
    "strict-preflight",
    [
      "--config.verify-deps-before-run=error",
      "exec",
      "vitest",
      "run",
      "--root",
      `${repo}/artifacts/omission-diagnostic-20260906-3/omission-fixture`,
      "--config",
      "vitest.config.mjs",
      "representative.test.js",
      "--fileParallelism=false",
      "--reporter=json",
      `--outputFile=${output}/report.json`,
    ],
  ],
  ["store-dir", ["config", "get", "store-dir"]],
  ["store-path", ["store", "path", "--silent"]],
];
const observations = [];
for (const [name, args] of commands) {
  const result = spawnSync(node, [pnpm, ...args], {
    cwd: repo,
    env,
    timeout: 90_000,
    encoding: "utf8",
  });
  writeFileSync(`${output}/${name}.stdout.log`, result.stdout ?? "");
  writeFileSync(`${output}/${name}.stderr.log`, result.stderr ?? "");
  observations.push({
    name,
    argv: [node, pnpm, ...args],
    cwd: repo,
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
  });
}
const modules = JSON.parse(
  readFileSync(`${repo}/node_modules/.modules.yaml`, "utf8"),
);
const observation = {
  schemaVersion: "pnpm-strict-preflight-diagnostic.v1",
  completionEligible: false,
  configuredInstalledStore: modules.storeDir,
  commands: observations,
};
writeFileSync(
  `${output}/observation.json`,
  `${JSON.stringify(observation, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(observation)}\n`);
