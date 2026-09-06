import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  writeJson,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  auditVmLifecycle,
  sha256,
  VM_AUTHORITY_DIGEST,
} from "../../../tools/qualification-vm-lifecycle.mjs";
import { captureOciControllerSource } from "../../../tools/milestone-orchestrator/src/container-executor-source.js";
import { superviseCommand } from "../../../tools/milestone-orchestrator/src/process-supervisor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
assert.equal(
  process.argv.length,
  4,
  "Expected prepared Linux task root and fresh evidence output.",
);
const [root, output] = process.argv.slice(2) as [string, string];
assert.match(root, /^\/home\/duncan\/oc2-[A-Za-z0-9_-]+$/);
assert(!existsSync(resolve(output)));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(output);
const context = await evidenceContext("orch-auth-01-c2", "vm-lifecycle");
const nativeNode = "/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node";
const native = (path: string) =>
  `\\\\wsl.localhost\\Ubuntu${path.replaceAll("/", "\\")}`;
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const git = async (args: readonly string[]) =>
    execFileSync("git", [...args], {
      cwd: context.repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    }).trim();
  const source = await captureOciControllerSource(git);
  const frozen = JSON.parse(
    await readFile(native(`${root}/frozen-inputs.json`), "utf8"),
  );
  const binding = {
    authorityDigest: VM_AUTHORITY_DIGEST,
    purpose: "candidate-support",
    runId: randomUUID(),
    nonce: randomBytes(32).toString("hex"),
    sourceCommit: source.head,
    sourceTree: source.candidateTree,
  };
  const collector = await readFile(
    resolve(context.repositoryRoot, "tools/qualification-vm-lifecycle.mjs"),
  );
  const expected = {
    ...frozen,
    binding,
    collectorSha256: sha256(collector),
    launcherKernel: "6.6.87.2-microsoft-standard-WSL2",
  };
  const collectorPath = `${root}/collector-${binding.runId}.mjs`,
    inputPath = `${root}/expectation-${binding.runId}.json`,
    rawPath = `${root}/observation-${binding.runId}`;
  await writeFile(native(collectorPath), collector, { flag: "wx" });
  await writeFile(native(inputPath), JSON.stringify(expected, null, 2) + "\n", {
    flag: "wx",
  });
  await writeJson(
    resolve(context.artifactDirectory, "expectations.json"),
    expected,
  );
  await writeJson(resolve(context.artifactDirectory, "dispatch.json"), {
    source,
    identity,
    expectedSha256: sha256(await readFile(native(inputPath))),
    collectorPath,
    rawPath,
    nativeNode,
    commandCount: 1,
    purpose: "candidate-support",
    scope:
      "Trusted diagnostic VM lifecycle only; no controller or Docker dispatch.",
  });
  const execution = await superviseCommand({
    executable: "wsl.exe",
    args: [
      "-d",
      "Ubuntu",
      "--exec",
      nativeNode,
      collectorPath,
      inputPath,
      rawPath,
    ],
    cwd: context.repositoryRoot,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    ),
    timeoutMs: 350000,
    killGraceMs: 5000,
    outputLimitBytes: 2097152,
  });
  await writeFile(
    resolve(context.artifactDirectory, "stdout.log"),
    execution.stdout,
  );
  await writeFile(
    resolve(context.artifactDirectory, "stderr.log"),
    execution.stderr,
  );
  await writeJson(resolve(context.artifactDirectory, "execution.json"), {
    exitCode: execution.exitCode,
    signal: execution.signal,
    spawnError: execution.spawnError?.message ?? null,
    supervision: execution.supervision,
  });
  const rawOutput = resolve(context.artifactDirectory, "raw");
  await mkdir(rawOutput);
  if (existsSync(native(rawPath))) {
    const names = await readdir(native(rawPath));
    assert(names.length < 30);
    for (const name of names) {
      assert.match(name, /^[a-zA-Z0-9_.-]+$/);
      const path = native(`${rawPath}/${name}`),
        stat = await lstat(path);
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.size < 4194304);
      await copyFile(path, resolve(rawOutput, name));
    }
  }
  assert.equal(execution.exitCode, 0, execution.stderr.toString());
  assert.equal(execution.spawnError, null);
  assert.equal(execution.supervision.timedOut, false);
  assert.equal(execution.supervision.outputLimitExceeded, false);
  const report = JSON.parse(
    await readFile(resolve(rawOutput, "lifecycle.json"), "utf8"),
  );
  const result = auditVmLifecycle(
    report,
    expected,
    await readFile(resolve(rawOutput, "serial.log"), "utf8"),
    JSON.parse(await readFile(resolve(rawOutput, "qmp.json"), "utf8")),
  );
  await writeJson(resolve(context.artifactDirectory, "audit.json"), {
    ...result,
    runId: binding.runId,
    source,
    guest: report.guest.bootId,
    durationMs: report.process.durationMs,
  });
  const artifacts = [
    { path: "expectations.json", kind: "vm-outer-expectations" },
    { path: "dispatch.json", kind: "vm-dispatch" },
    { path: "execution.json", kind: "vm-native-execution" },
    { path: "audit.json", kind: "vm-lifecycle-audit" },
    ...(await readdir(rawOutput))
      .filter((name) => name !== "qemu.stderr")
      .map((name) => ({ path: `raw/${name}`, kind: "vm-raw-observation" })),
  ];
  await writeReceipt(
    context,
    [
      {
        id: "actual-vm-lifecycle-observed",
        summary:
          "Native Linux QEMU boot, guest/QMP observations, immutable input checks and owned cleanup independently validated; no host/controller qualification granted.",
      },
    ],
    artifacts,
  );
  await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      ...result,
      runId: binding.runId,
      durationMs: report.process.durationMs,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
