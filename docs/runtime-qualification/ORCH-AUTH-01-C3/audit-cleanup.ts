import assert from "node:assert/strict";
import { readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { dockerHostSha256 } from "../../../tools/qualification-docker-host.mjs";
import { superviseCommand } from "../../../tools/milestone-orchestrator/src/process-supervisor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [linuxRoot, outputArg] = process.argv.slice(2);
assert(linuxRoot && outputArg && process.argv.length === 4);
assert.match(linuxRoot, /^\/home\/duncan\/oc3-[A-Za-z0-9_-]+$/);
assert.equal(process.platform, "win32");
const inputRoot = "\\\\wsl.localhost\\Ubuntu" + linuxRoot.replaceAll("/", "\\");
const output = resolve(outputArg);
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-c3-cleanup-audit",
  "independent-native-cleanup",
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const inputs = [];
  for (const name of (await readdir(inputRoot))
    .filter((name) => /^observation-[a-f0-9-]{36}$/.test(name))
    .sort()) {
    const path = resolve(inputRoot, name, "host.json");
    const metadata = await lstat(path);
    assert(metadata.isFile() && !metadata.isSymbolicLink());
    const bytes = await readFile(path),
      report = JSON.parse(bytes.toString());
    assert.equal(report.unit, `orch-c3-${report.binding.runId}.service`);
    assert.equal(
      report.directory,
      `${linuxRoot}/guest-${report.binding.runId}`,
    );
    assert.equal(report.cleanupVerified, true);
    let pid = report.hostBefore?.pid ?? null;
    if (pid === null) {
      try {
        pid = Number(
          (
            await readFile(resolve(inputRoot, name, "main-pid.stdout"), "utf8")
          ).trim(),
        );
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    assert(pid === null || (Number.isSafeInteger(pid) && pid > 1));
    inputs.push({
      name,
      pid,
      startStat: report.hostBefore?.startStat ?? null,
      unit: report.unit,
      directory: report.directory,
      reportSha256: dockerHostSha256(bytes),
    });
  }
  assert(inputs.length > 0);
  const script = `import fs from 'node:fs/promises';
const inputs=JSON.parse(Buffer.from(process.argv[1],'base64url'));
const absent=async path=>{try{await fs.lstat(path);return false;}catch(e){if(e.code!=='ENOENT')throw e;return true;}};
const start=value=>value.slice(value.lastIndexOf(')')+2).split(' ')[19];
const results=[];
for(const item of inputs){
  let processIdentityAbsent=null, observedStat=null, observedCgroup=null;
  if(item.pid!==null){
    try{observedStat=await fs.readFile('/proc/'+item.pid+'/stat','utf8');observedCgroup=await fs.readFile('/proc/'+item.pid+'/cgroup','utf8');processIdentityAbsent=(item.startStat!==null&&start(observedStat)!==start(item.startStat))||!observedCgroup.includes('/'+item.unit);}
    catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;processIdentityAbsent=true;}
  }
  results.push({...item,processIdentityAbsent,observedStat,observedCgroup,directoryAbsent:await absent(item.directory),cgroupAbsent:await absent('/sys/fs/cgroup/system.slice/'+item.unit)});
}
process.stdout.write(JSON.stringify({at:new Date().toISOString(),platform:process.platform,nodeVersion:process.version,uid:process.getuid(),bootId:(await fs.readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),pidNamespace:await fs.readlink('/proc/self/ns/pid'),results})+'\\n');
`;
  await writeFile(resolve(output, "observer.mjs"), script);
  await writeFile(
    resolve(output, "inputs.json"),
    JSON.stringify(inputs, null, 2) + "\n",
  );
  const argv = [
    "-d",
    "Ubuntu",
    "--exec",
    "/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node",
    "--input-type=module",
    "-e",
    script,
    Buffer.from(JSON.stringify(inputs)).toString("base64url"),
  ];
  const execution = await superviseCommand({
    executable: "wsl.exe",
    args: argv,
    cwd: context.repositoryRoot,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    timeoutMs: 30_000,
    killGraceMs: 5000,
    outputLimitBytes: 1048576,
  });
  await writeFile(resolve(output, "stdout.log"), execution.stdout);
  await writeFile(resolve(output, "stderr.log"), execution.stderr);
  await writeFile(
    resolve(output, "execution.json"),
    JSON.stringify(
      {
        identity,
        argv,
        exitCode: execution.exitCode,
        spawnError: execution.spawnError?.message ?? null,
        supervision: execution.supervision,
      },
      null,
      2,
    ) + "\n",
  );
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.spawnError, null);
  assert.equal(execution.supervision.timedOut, false);
  assert.equal(execution.supervision.outputLimitExceeded, false);
  const observation = JSON.parse(execution.stdout.toString());
  assert.equal(observation.platform, "linux");
  assert.equal(observation.nodeVersion, "v24.18.0");
  assert.equal(observation.uid, 1000);
  assert.equal(observation.results.length, inputs.length);
  for (const [index, result] of observation.results.entries()) {
    const {
      processIdentityAbsent,
      observedStat: _observedStat,
      observedCgroup: _observedCgroup,
      directoryAbsent,
      cgroupAbsent,
      ...input
    } = result;
    assert.deepEqual(input, inputs[index]);
    assert.equal(processIdentityAbsent, input.pid === null ? null : true);
    assert.equal(directoryAbsent, true);
    assert.equal(cgroupAbsent, true);
  }
  const checks = [
    {
      id: "FRESH-NATIVE-CLEANUP",
      summary:
        "A separate native Linux process observed every recorded task cgroup and guest directory absent and every recorded process identity absent; missing early PID observations remain explicitly null.",
    },
  ];
  await writeFile(
    resolve(output, "cleanup-observation.json"),
    JSON.stringify(
      { ...observation, completionEligible: false, hostAdmission: false },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(context, checks, [
    { path: "observer.mjs", kind: "cleanup-observer-source" },
    { path: "inputs.json", kind: "cleanup-observer-inputs" },
    { path: "execution.json", kind: "cleanup-observer-execution" },
    { path: "stdout.log", kind: "cleanup-observer-raw" },
    { path: "cleanup-observation.json", kind: "cleanup-observation" },
  ]);
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      observations: inputs.length,
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
