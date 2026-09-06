import childProcess from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { isAbsolute, resolve } from "node:path";
import assert from "node:assert/strict";

// Diagnostic observation only. Original Git argv, return values, exceptions and
// test deadlines remain untouched. Each Node process owns a bounded event file.
const directory = process.env.C6A_GIT_DIAGNOSTIC_DIR;
assert(directory && isAbsolute(directory));
mkdirSync(directory, { recursive: true });
const path = resolve(directory, `git-process-${process.pid}.jsonl`);
let initialized = false,
  bytes = 0;
function record(event) {
  if (!initialized) {
    writeFileSync(path, "", { flag: "wx" });
    initialized = true;
  }
  const line =
    JSON.stringify({
      observedAt: new Date().toISOString(),
      pid: process.pid,
      ...event,
    }) + "\n";
  bytes += Buffer.byteLength(line);
  assert(bytes <= 2 * 1024 * 1024, "Git diagnostic event bound exceeded");
  appendFileSync(path, line);
}
for (const method of ["spawnSync", "execFileSync"]) {
  const original = childProcess[method];
  childProcess[method] = function (command, args, options) {
    if (!/(?:^|[/\\])git(?:\.exe)?$/i.test(command))
      return original.apply(this, arguments);
    const start = process.hrtime.bigint();
    let status = null;
    try {
      const result = original.apply(this, arguments);
      status = method === "spawnSync" ? result.status : 0;
      return result;
    } catch (error) {
      status = error.status ?? null;
      throw error;
    } finally {
      record({
        method,
        argv: [command, ...args],
        cwd: options?.cwd ?? null,
        status,
        elapsedMs: Number(process.hrtime.bigint() - start) / 1e6,
      });
    }
  };
}
syncBuiltinESMExports();
