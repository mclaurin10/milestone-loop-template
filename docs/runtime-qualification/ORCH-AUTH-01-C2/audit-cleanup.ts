import assert from "node:assert/strict";
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
import { sha256 } from "../../../tools/qualification-vm-lifecycle.mjs";
import { superviseCommand } from "../../../tools/milestone-orchestrator/src/process-supervisor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
assert.equal(process.argv.length, 4);
const [evidence, output] = process.argv.slice(2) as [string, string];
assert(!existsSync(resolve(output)));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(output);
const context = await evidenceContext(
  "orch-auth-01-c2",
  "independent-cleanup-observation",
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const inputs = [];
  for (const name of ["lifecycle-pilot", "lifecycle-final"]) {
    const path = resolve(evidence, name, "raw/lifecycle.json"),
      bytes = await readFile(path),
      record = JSON.parse(bytes.toString());
    assert.match(
      record.directory,
      /^\/home\/duncan\/oc2-[A-Za-z0-9_-]+\/guest-[A-Za-z0-9_-]+$/,
    );
    assert(Number.isSafeInteger(record.process.pid) && record.process.pid > 1);
    inputs.push({
      name,
      pid: record.process.pid,
      directory: record.directory,
      reportSha256: sha256(bytes),
    });
  }
  await validateCommandReceiptDirectory({
    directory: resolve(evidence, "lifecycle-final"),
    expectedStageId: "orch-auth-01-c2",
    expectedCommandId: "vm-lifecycle",
  });
  const script = `import fs from 'node:fs/promises';\nconst inputs=JSON.parse(Buffer.from(process.argv[1],'base64url'));\nconst results=[];\nfor(const item of inputs){let processAbsent=false;try{process.kill(item.pid,0);}catch(e){if(e.code!=='ESRCH')throw e;processAbsent=true;}let directoryAbsent=false;try{await fs.lstat(item.directory);}catch(e){if(e.code!=='ENOENT')throw e;directoryAbsent=true;}results.push({...item,processAbsent,directoryAbsent});}\nprocess.stdout.write(JSON.stringify({at:new Date().toISOString(),platform:process.platform,nodeVersion:process.version,uid:process.getuid(),results})+'\\n');\n`;
  await writeFile(resolve(context.artifactDirectory, "observer.mjs"), script);
  const args = [
    "-d",
    "Ubuntu",
    "--exec",
    "/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node",
    "--input-type=module",
    "-e",
    script,
    Buffer.from(JSON.stringify(inputs)).toString("base64url"),
  ];
  const result = await superviseCommand({
    executable: "wsl.exe",
    args,
    cwd: context.repositoryRoot,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    ),
    timeoutMs: 30000,
    killGraceMs: 5000,
    outputLimitBytes: 1048576,
  });
  await writeJson(resolve(context.artifactDirectory, "execution.json"), {
    identity,
    args,
    exitCode: result.exitCode,
    spawnError: result.spawnError?.message ?? null,
    supervision: result.supervision,
  });
  await writeFile(
    resolve(context.artifactDirectory, "stdout.log"),
    result.stdout,
  );
  await writeFile(
    resolve(context.artifactDirectory, "stderr.log"),
    result.stderr,
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.spawnError, null);
  assert.equal(result.supervision.timedOut, false);
  assert.equal(result.supervision.outputLimitExceeded, false);
  const observation = JSON.parse(result.stdout.toString());
  assert.equal(observation.platform, "linux");
  assert.equal(observation.nodeVersion, "v24.18.0");
  assert.equal(observation.uid, 1000);
  assert.deepEqual(
    observation.results,
    inputs.map((input) => ({
      ...input,
      processAbsent: true,
      directoryAbsent: true,
    })),
  );
  await writeJson(
    resolve(context.artifactDirectory, "cleanup-observation.json"),
    {
      ...observation,
      hostQualification: "NOT_READY",
      completionEligible: false,
    },
  );
  await writeReceipt(
    context,
    [
      {
        id: "fresh-post-lifecycle-os-observation",
        summary:
          "A separate native Linux process confirmed both recorded QEMU PIDs and both disposable guest directories absent after their lifecycle commands; no cleanup or host authorization was inferred from this observation.",
      },
    ],
    [
      { path: "observer.mjs", kind: "cleanup-observer-source" },
      { path: "execution.json", kind: "cleanup-observer-execution" },
      { path: "stdout.log", kind: "cleanup-observer-raw" },
      { path: "cleanup-observation.json", kind: "cleanup-observation" },
    ],
  );
  await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      observations: inputs.length,
      completionEligible: false,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
