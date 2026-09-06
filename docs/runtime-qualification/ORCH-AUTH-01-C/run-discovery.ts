import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  evidenceContext,
  commandIdentity,
  writeJson,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  APPROVED_AUTHORITY_DIGEST,
  HOST_DISCOVERY_LIMITS,
  HOST_DISCOVERY_NAMES,
  auditHostDiscovery,
} from "../../../tools/qualification-host-discovery.mjs";
import { captureOciControllerSource } from "../../../tools/milestone-orchestrator/src/container-executor-source.js";
import { superviseCommand } from "../../../tools/milestone-orchestrator/src/process-supervisor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

assert.equal(
  process.argv.length,
  7,
  "Expected <route> <native-node-path> <scanner-path> <observed-kernel> <fresh-output>.",
);
const [route, nodePath, scannerPath, kernelRelease, output] =
  process.argv.slice(2) as [string, string, string, string, string];
assert(["native-windows", "wsl-ubuntu", "ssh-codex-lab"].includes(route));
assert(!existsSync(resolve(output)), "Discovery output must be fresh.");
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(output);
const context = await evidenceContext(
  "orch-auth-01-c",
  `host-discovery-${route}`,
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const git = async (args: readonly string[]) =>
    execFileSync("git", [...args], {
      cwd: context.repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    }).trim();
  const source = await captureOciControllerSource(git);
  const sha256 = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const scanner = await readFile(
    resolve(context.repositoryRoot, "tools/qualification-host-discovery.mjs"),
  );
  const binding = {
    purpose: "candidate-support",
    runId: randomUUID(),
    nonce: randomBytes(32).toString("hex"),
    route,
    sourceCommit: source.head,
    sourceTree: source.candidateTree,
    authorityDigest: APPROVED_AUTHORITY_DIGEST,
    scannerSha256: sha256(scanner),
  };
  const argv = [
    nodePath,
    scannerPath,
    "--binding-base64",
    Buffer.from(JSON.stringify(binding)).toString("base64url"),
  ];
  const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  let executable: string;
  let args: string[];
  if (route === "native-windows") {
    assert.equal(process.platform, "win32");
    assert.equal(resolve(nodePath), process.execPath);
    assert.equal(
      resolve(scannerPath),
      resolve(context.repositoryRoot, "tools/qualification-host-discovery.mjs"),
    );
    executable = nodePath;
    args = argv.slice(1);
  } else if (route === "wsl-ubuntu") {
    executable = "wsl.exe";
    args = ["-d", "Ubuntu", "--exec", ...argv];
  } else {
    executable = "ssh";
    args = [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=5",
      "codex.lab",
      argv.map(shellQuote).join(" "),
    ];
  }
  const dispatch = {
    binding,
    platform: route === "native-windows" ? "win32" : "linux",
    kernelRelease,
    executable,
    args,
    selectedNames: HOST_DISCOVERY_NAMES,
    commandCount: 1,
    source,
    identity,
    transportScope:
      "Known route inspection only; no host isolation or execution authorization is asserted.",
  };
  await writeJson(
    resolve(context.artifactDirectory, "dispatch.json"),
    dispatch,
  );
  const started = performance.now();
  const execution = await superviseCommand({
    executable,
    args,
    cwd: context.repositoryRoot,
    env: process.env,
    timeoutMs: 30_000,
    killGraceMs: 2_000,
    outputLimitBytes: HOST_DISCOVERY_LIMITS.reportBytes,
  });
  await writeFile(
    resolve(context.artifactDirectory, "host-report.json"),
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
    durationMs: Math.round(performance.now() - started),
  });
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.spawnError, null);
  assert.equal(execution.supervision.timedOut, false);
  assert.equal(execution.supervision.outputLimitExceeded, false);
  assert.equal(execution.stderr.length, 0);
  const expected = {
    binding,
    platform: dispatch.platform,
    kernelRelease,
    reportSha256: sha256(execution.stdout),
  };
  await writeJson(
    resolve(context.artifactDirectory, "expectations.json"),
    expected,
  );
  const report = auditHostDiscovery(execution.stdout, expected);
  // Re-read retained bytes, not only the in-memory capture.
  auditHostDiscovery(
    await readFile(resolve(context.artifactDirectory, "host-report.json")),
    expected,
  );
  await writeJson(resolve(context.artifactDirectory, "audit-report.json"), {
    schemaVersion: "qualification-host-discovery-audit.v1",
    status: "PASS",
    observationOnly: true,
    binding,
    reportSha256: expected.reportSha256,
    controller: report.controller,
    launchersInspected: report.launchers.length,
    qualification: report.qualification,
    completion: report.completion,
  });
  await writeReceipt(
    context,
    [
      {
        id: "real-launch-free-discovery-audited",
        summary:
          "Executed the pinned metadata scanner on the selected route and independently checked captured and retained bytes, platform, coverage and explicit NOT_READY limits. No launcher or controller was executed.",
      },
    ],
    [
      { path: "dispatch.json", kind: "host-discovery-dispatch" },
      { path: "host-report.json", kind: "host-discovery-observations" },
      { path: "execution.json", kind: "host-discovery-execution" },
      { path: "expectations.json", kind: "host-discovery-expectations" },
      { path: "audit-report.json", kind: "host-discovery-audit" },
    ],
  );
  const receipt = await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["host-discovery-observations", "host-discovery-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      route,
      qualification: report.qualification.status,
      receipt: receipt.receiptPath,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
