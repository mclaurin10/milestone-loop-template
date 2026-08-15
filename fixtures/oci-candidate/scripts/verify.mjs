import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      result.stderr || result.stdout || String(result.error),
    );
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

await mkdir("artifacts", { recursive: true });
const stages = [];
for (const [id, args] of [
  ["build", ["run", "build"]],
  ["typecheck", ["run", "typecheck"]],
  ["vitest", ["run", "test:smoke"]],
]) {
  run("pnpm", args);
  stages.push({ id, status: "PASS" });
}
const commit = run("git", ["rev-parse", "HEAD"]);
const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
const files = ["artifacts/build-report.json", "artifacts/vitest-report.json"];
const artifacts = [];
for (const path of files) {
  const bytes = await readFile(path);
  artifacts.push({
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const result = {
  schemaVersion: "1.0.0",
  status: "PASS",
  runtime: { node: process.version, pnpm: run("pnpm", ["--version"]) },
  candidate: { commit, tree },
  stages,
  artifacts,
};
await writeFile(
  "artifacts/oci-fixture-result.json",
  `${JSON.stringify(result, null, 2)}\n`,
);
const evidenceDirectory = process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR;
const stageId = process.env.LOOP_VERIFY_STAGE_ID;
const commandId = process.env.LOOP_VERIFY_COMMAND_ID;
if (evidenceDirectory && stageId && commandId) {
  await mkdir(evidenceDirectory, { recursive: true });
  const proof = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  await writeFile(`${evidenceDirectory}/aggregate-proof.json`, proof);
  const receipt = {
    schemaVersion: "1.0.0",
    stageId,
    commandId,
    status: "PASS",
    checks: [
      {
        id: "oci-fixture-aggregate",
        status: "PASS",
        summary:
          "Build, typecheck, Vitest, and read-only Git completed in one aggregate.",
      },
    ],
    artifacts: [
      {
        path: "aggregate-proof.json",
        kind: "oci-fixture-aggregate",
        bytes: proof.length,
        sha256: createHash("sha256").update(proof).digest("hex"),
      },
    ],
  };
  await writeFile(
    `${evidenceDirectory}/result.json`,
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
process.stdout.write("OCI fixture aggregate passed.\n");
