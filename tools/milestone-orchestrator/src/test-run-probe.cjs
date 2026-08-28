"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");

const probeDirectory = process.env.MILESTONE_LOOP_TEST_RUN_PROBE_DIR;
const probeId = process.env.MILESTONE_LOOP_TEST_RUN_PROBE_ID;

if (probeDirectory && /^[a-f0-9]{64}$/.test(probeId ?? "")) {
  const startedAt = new Date().toISOString();
  const startedMonotonic = process.hrtime.bigint();
  let gitInvocationCount = 0;
  let gitWallNanoseconds = 0n;
  let processStartupSampleCount = 0;
  let processStartupNanoseconds = 0n;
  let synchronousLaunchCount = 0;
  let written = false;

  const executableText = (value) =>
    typeof value === "string" || value instanceof URL ? String(value) : "";
  const isGit = (value) =>
    /(?:^|[/\\])git(?:\.exe)?$/i.test(executableText(value));
  const recordGit = (started) => {
    gitInvocationCount += 1;
    gitWallNanoseconds += process.hrtime.bigint() - started;
  };

  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function measuredSpawn(command, args, options) {
    const started = process.hrtime.bigint();
    const child = originalSpawn.call(this, command, args, options);
    processStartupSampleCount += 1;
    processStartupNanoseconds += process.hrtime.bigint() - started;
    if (isGit(command)) {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        recordGit(started);
      };
      child.once("error", finish);
      child.once("close", finish);
    }
    return child;
  };

  const originalSpawnSync = childProcess.spawnSync;
  childProcess.spawnSync = function measuredSpawnSync(command, args, options) {
    const started = process.hrtime.bigint();
    synchronousLaunchCount += 1;
    try {
      return originalSpawnSync.call(this, command, args, options);
    } finally {
      if (isGit(command)) recordGit(started);
    }
  };

  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = function measuredExecFileSync(
    file,
    args,
    options,
  ) {
    const started = process.hrtime.bigint();
    synchronousLaunchCount += 1;
    try {
      return originalExecFileSync.call(this, file, args, options);
    } finally {
      if (isGit(file)) recordGit(started);
    }
  };

  syncBuiltinESMExports();

  process.once("exit", () => {
    if (written) return;
    written = true;
    try {
      fs.mkdirSync(probeDirectory, { recursive: true });
      const usage = process.resourceUsage();
      const finishedAt = new Date().toISOString();
      const suffix = crypto
        .createHash("sha256")
        .update(`${process.pid}\0${startedAt}\0${startedMonotonic}`)
        .digest("hex")
        .slice(0, 16);
      const name = `probe-${process.pid}-${suffix}.json`;
      const finalPath = path.resolve(probeDirectory, name);
      const temporaryPath = `${finalPath}.tmp`;
      const record = {
        schemaVersion: "1.0.0",
        probeId,
        pid: process.pid,
        ppid: process.ppid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        startedAt,
        finishedAt,
        wallNanoseconds: (
          process.hrtime.bigint() - startedMonotonic
        ).toString(),
        userCpuMicroseconds: String(usage.userCPUTime),
        systemCpuMicroseconds: String(usage.systemCPUTime),
        maxRssBytes: String(BigInt(usage.maxRSS) * 1024n),
        gitInvocationCount,
        gitWallNanoseconds: gitWallNanoseconds.toString(),
        processStartupSampleCount,
        processStartupNanoseconds: processStartupNanoseconds.toString(),
        synchronousLaunchCount,
      };
      fs.writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      fs.renameSync(temporaryPath, finalPath);
    } catch (error) {
      try {
        fs.writeSync(
          2,
          `Test-run probe finalization failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      } catch {
        // The probe is non-semantic. The producer records it as unavailable.
      }
    }
  });
}
