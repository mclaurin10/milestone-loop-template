import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  superviseCommand,
  truncateAtNewlineBoundary,
} from "./process-supervisor.js";
import type {
  SupervisedChildLike,
  SupervisedExit,
  SupervisedStdioLike,
  SuperviseOptions,
} from "./process-supervisor.js";

const temporaryDirectories: string[] = [];
const spawnedPidFiles: string[] = [];

function testEnvironment(
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined) base[key] = value;
  return { ...base, ...extra };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function pollUntil(
  predicate: () => boolean,
  deadlineMs: number,
  intervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function readPidFile(path: string): Promise<number> {
  const reachable = await pollUntil(() => existsSync(path), 10_000);
  expect(reachable).toBe(true);
  const raw = await readFile(path, "utf8");
  const pid = Number.parseInt(raw.trim(), 10);
  expect(Number.isSafeInteger(pid)).toBe(true);
  return pid;
}

function killPidBestEffort(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already dead or inaccessible - the sweep is best effort.
  }
}

afterEach(async () => {
  for (const pidFile of spawnedPidFiles.splice(0)) {
    if (!existsSync(pidFile)) continue;
    try {
      const pid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
      if (Number.isSafeInteger(pid)) killPidBestEffort(pid);
    } catch {
      // Fixture cleanup must never fail the suite.
    }
  }
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function scratchDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function nodeFixture(
  script: string,
  overrides: Partial<{
    timeoutMs: number;
    killGraceMs: number;
    outputLimitBytes: number;
    env: Record<string, string>;
    cwd: string;
  }> = {},
): Promise<SupervisedExit> {
  return superviseCommand({
    executable: process.execPath,
    args: ["-e", script],
    cwd: overrides.cwd ?? process.cwd(),
    env: testEnvironment(overrides.env ?? {}),
    timeoutMs: overrides.timeoutMs ?? 30_000,
    killGraceMs: overrides.killGraceMs ?? 2_000,
    outputLimitBytes: overrides.outputLimitBytes ?? 1_048_576,
  });
}

describe("truncateAtNewlineBoundary", () => {
  it("returns input below the cap untouched", () => {
    const result = truncateAtNewlineBoundary(
      [Buffer.from("alpha\nbeta\n")],
      1024,
    );
    expect(result.data.toString("utf8")).toBe("alpha\nbeta\n");
    expect(result.trimmedBytes).toBe(0);
  });

  it("returns input exactly at the cap untouched", () => {
    const exact = Buffer.alloc(256, "x");
    const result = truncateAtNewlineBoundary([exact], 256);
    expect(result.data.length).toBe(256);
    expect(result.trimmedBytes).toBe(0);
  });

  it("cuts back to the last newline inside the boundary window", () => {
    const line = `${"a".repeat(99)}\n`;
    const data = Buffer.from(line.repeat(100));
    const result = truncateAtNewlineBoundary([data], 5_050);
    expect(result.data.length).toBe(5_000);
    expect(result.data[result.data.length - 1]).toBe(0x0a);
    expect(result.trimmedBytes).toBe(data.length - 5_000);
  });

  it("drops the whole boundary window when it holds no newline", () => {
    const data = Buffer.alloc(10_000, "z");
    const result = truncateAtNewlineBoundary([data], 8_192);
    expect(result.data.length).toBe(8_192 - 4_096);
    expect(result.trimmedBytes).toBe(10_000 - 4_096);
  });

  it("handles the cap straddling multiple chunks", () => {
    const chunks = [
      Buffer.from(`${"a".repeat(499)}\n`),
      Buffer.from(`${"b".repeat(499)}\n`),
      Buffer.from(`${"c".repeat(499)}\n`),
    ];
    const result = truncateAtNewlineBoundary(chunks, 1_200);
    expect(result.data.length).toBe(1_000);
    expect(result.data[999]).toBe(0x0a);
    expect(result.data[998]).toBe("b".charCodeAt(0));
  });
});

describe("bounded process supervision", () => {
  it("captures a normal completion with closed streams and no termination", async () => {
    const result = await nodeFixture(
      "process.stdout.write('hello supervisor\\n'); process.exit(0);",
    );
    expect(result.exitCode).toBe(0);
    expect(result.spawnError).toBeNull();
    expect(result.stdout.toString("utf8")).toBe("hello supervisor\n");
    expect(result.supervision).toMatchObject({
      timedOut: false,
      outputLimitExceeded: false,
      terminationReason: null,
      termination: null,
      streamsClosed: true,
      drainTimedOut: false,
      drainSweep: null,
      duplicateSettleSignals: [],
    });
    expect(result.supervision.stdout.truncated).toBe(false);
    expect(result.supervision.stdout.totalBytesObserved).toBe(
      "hello supervisor\n".length,
    );
  }, 20_000);

  it("reports a spawn failure without hanging", async () => {
    const result = await superviseCommand({
      executable: join(
        tmpdir(),
        "definitely-not-a-real-binary-milestone-loop.exe",
      ),
      args: [],
      cwd: process.cwd(),
      env: testEnvironment(),
      timeoutMs: 5_000,
      killGraceMs: 1_000,
      outputLimitBytes: 65_536,
    });
    expect(result.spawnError).not.toBeNull();
    expect(result.supervision.terminationReason).toBeNull();
  }, 20_000);

  it("preserves timeout semantics with a durable termination record", async () => {
    const startedAt = Date.now();
    const result = await nodeFixture(
      "setTimeout(() => process.exit(0), 30000);",
      { timeoutMs: 500, killGraceMs: 1_000 },
    );
    expect(result.supervision.timedOut).toBe(true);
    expect(result.supervision.terminationReason).toBe("timeout");
    expect(result.supervision.termination).not.toBeNull();
    expect(result.supervision.termination?.succeeded).toBe(true);
    if (process.platform === "win32") {
      expect(result.supervision.termination?.attempted[0]).toBe(
        "taskkill-tree-force",
      );
      expect(result.signal).toBeNull();
    } else {
      expect(result.supervision.termination?.attempted[0]).toBe(
        "posix-group-sigterm",
      );
    }
    expect(Date.now() - startedAt).toBeLessThan(15_000);
    expect(result.supervision.duplicateSettleSignals).toEqual([]);
  }, 20_000);

  it("kills the whole intact tree on an output-limit breach", async () => {
    const directory = await scratchDirectory("milestone-loop-supervisor-tree-");
    const pidFile = join(directory, "grandchild.pid");
    spawnedPidFiles.push(pidFile);
    // detached: a non-detached grandchild would die with its Node parent via
    // libuv's kill-on-close job object on Windows, which would make this test
    // pass without taskkill /T proving anything. A detached grandchild
    // escapes the job object, so only the intact-tree taskkill can reap it.
    const script = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const pidFile = process.env.LOOP_TEST_PIDFILE;",
      "const g = spawn(process.execPath, ['-e', \"require('fs').writeFileSync(process.env.LOOP_TEST_PIDFILE, String(process.pid)); setInterval(() => {}, 1000);\"], { stdio: 'ignore', env: process.env, detached: true });",
      "g.unref();",
      "const flood = () => { const line = 'x'.repeat(8191) + '\\n'; setInterval(() => { for (let i = 0; i < 64; i += 1) process.stdout.write(line); }, 5); };",
      "const wait = () => { if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').length > 0) flood(); else setTimeout(wait, 25); };",
      "wait();",
    ].join(" ");
    const resultPromise = nodeFixture(script, {
      timeoutMs: 30_000,
      killGraceMs: 2_000,
      outputLimitBytes: 262_144,
      env: { LOOP_TEST_PIDFILE: pidFile },
    });
    const grandchildPid = await readPidFile(pidFile);
    const result = await resultPromise;
    expect(result.supervision.outputLimitExceeded).toBe(true);
    expect(result.supervision.terminationReason).toBe("output-limit");
    expect(result.supervision.stdout.truncated).toBe(true);
    expect(result.supervision.stdout.bytesCaptured).toBeLessThanOrEqual(
      262_144,
    );
    expect(result.supervision.stdout.totalBytesObserved).toBeGreaterThan(
      262_144,
    );
    expect(result.stdout.length).toBe(result.supervision.stdout.bytesCaptured);
    expect(result.stdout[result.stdout.length - 1]).toBe(0x0a);
    const grandchildDead = await pollUntil(
      () => !isProcessAlive(grandchildPid),
      5_000,
    );
    expect(grandchildDead).toBe(true);
    expect(result.supervision.duplicateSettleSignals).toEqual([]);
  }, 45_000);

  it("settles within the drain window when a detached grandchild holds the inherited pipes", async () => {
    const directory = await scratchDirectory(
      "milestone-loop-supervisor-drain-",
    );
    const pidFile = join(directory, "holder.pid");
    spawnedPidFiles.push(pidFile);
    // Probed platform fact (Node 24.18.0 / win32, 2026-08-07): a non-detached
    // grandchild dies with its Node parent via libuv's kill-on-close job
    // object and the supervisor-side pipe closes with it. A detached
    // grandchild escapes the job object, survives the parent, and holds the
    // inherited pipe open indefinitely - the exact CR-02 hang the previous
    // runner could never settle from.
    const script = [
      "const { spawn } = require('node:child_process');",
      "const holder = spawn(process.execPath, ['-e', \"require('fs').writeFileSync(process.env.LOOP_TEST_PIDFILE, String(process.pid)); setTimeout(() => {}, 60000);\"], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env, detached: true });",
      "holder.unref();",
      "holder.once('spawn', () => setTimeout(() => process.exit(0), 100));",
    ].join(" ");
    const startedAt = Date.now();
    const result = await nodeFixture(script, {
      timeoutMs: 30_000,
      killGraceMs: 1_500,
      env: { LOOP_TEST_PIDFILE: pidFile },
    });
    const elapsed = Date.now() - startedAt;
    const holderPid = await readPidFile(pidFile);
    expect(result.exitCode).toBe(0);
    expect(result.supervision.terminationReason).toBeNull();
    expect(result.supervision.streamsClosed).toBe(false);
    expect(result.supervision.drainTimedOut).toBe(true);
    if (process.platform === "win32") {
      expect(result.supervision.drainSweep).toBe("unavailable-win32");
      // The fully detached holder survives on Windows (documented residual:
      // a dead root leaves taskkill /T nothing to walk); afterEach reaps it.
      expect(isProcessAlive(holderPid)).toBe(true);
    } else {
      // WP5: first real execution of the POSIX drain sweep is Linux CI. A
      // setsid-detached holder escapes the direct child's process group, so
      // only the sweep attempt itself is asserted here.
      expect(result.supervision.drainSweep).toBe("posix-group-sigkill");
    }
    expect(elapsed).toBeLessThan(15_000);
  }, 30_000);

  it("never settles twice under racing timeout, cap breach, and exit", async () => {
    for (let round = 0; round < 5; round += 1) {
      const result = await nodeFixture(
        "const line = 'y'.repeat(4095) + '\\n'; setInterval(() => { for (let i = 0; i < 16; i += 1) process.stdout.write(line); }, 1);",
        { timeoutMs: 300, killGraceMs: 300, outputLimitBytes: 4_096 },
      );
      expect(result.supervision.duplicateSettleSignals).toEqual([]);
      expect(["timeout", "output-limit"]).toContain(
        result.supervision.terminationReason,
      );
    }
  }, 45_000);

  // WP5: the SIGTERM-ignoring escalation path has never executed on this
  // Windows host; Linux CI must prove it before any cross-platform claim.
  it.skipIf(process.platform === "win32")(
    "escalates a SIGTERM-ignoring child to a group SIGKILL",
    async () => {
      const startedAt = Date.now();
      const result = await nodeFixture(
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
        { timeoutMs: 500, killGraceMs: 1_000 },
      );
      expect(result.supervision.timedOut).toBe(true);
      expect(result.supervision.termination?.attempted).toContain(
        "posix-group-sigkill",
      );
      expect(result.supervision.termination?.succeeded).toBe(true);
      expect(Date.now() - startedAt).toBeLessThan(10_000);
    },
    20_000,
  );

  // WP5: POSIX group ownership of grandchildren is unproven until Linux CI.
  it.skipIf(process.platform === "win32")(
    "group-kills a grandchild on timeout",
    async () => {
      const directory = await scratchDirectory(
        "milestone-loop-supervisor-group-",
      );
      const pidFile = join(directory, "grandchild.pid");
      spawnedPidFiles.push(pidFile);
      const script = [
        "const { spawn } = require('node:child_process');",
        "spawn(process.execPath, ['-e', \"require('fs').writeFileSync(process.env.LOOP_TEST_PIDFILE, String(process.pid)); setInterval(() => {}, 1000);\"], { stdio: 'ignore', env: process.env });",
        "setInterval(() => {}, 1000);",
      ].join(" ");
      const resultPromise = nodeFixture(script, {
        timeoutMs: 1_000,
        killGraceMs: 1_000,
        env: { LOOP_TEST_PIDFILE: pidFile },
      });
      const grandchildPid = await readPidFile(pidFile);
      const result = await resultPromise;
      expect(result.supervision.timedOut).toBe(true);
      const grandchildDead = await pollUntil(
        () => !isProcessAlive(grandchildPid),
        5_000,
      );
      expect(grandchildDead).toBe(true);
    },
    30_000,
  );
});

class FakeStdio implements SupervisedStdioLike {
  destroyed = false;
  private dataListeners: ((chunk: Buffer) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  on(_event: "data", listener: (chunk: Buffer) => void): this {
    this.dataListeners.push(listener);
    return this;
  }

  once(_event: "close", listener: () => void): this {
    this.closeListeners.push(listener);
    return this;
  }

  removeAllListeners(_event: "data"): this {
    this.dataListeners = [];
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    return this;
  }

  emitData(chunk: Buffer): void {
    for (const listener of [...this.dataListeners]) listener(chunk);
  }

  emitClose(): void {
    for (const listener of this.closeListeners.splice(0)) listener();
  }
}

type FakeChildListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

class FakeChild implements SupervisedChildLike {
  // A pid no live process can hold, so platform kill probes fail closed.
  readonly pid = 2_147_483_647;
  readonly stdout = new FakeStdio();
  readonly stderr = new FakeStdio();
  readonly killSignals: (NodeJS.Signals | number | undefined)[] = [];
  private readonly listeners = new Map<string, FakeChildListener[]>();

  once(event: string, listener: (...args: never[]) => unknown): this {
    const queue = this.listeners.get(event) ?? [];
    queue.push(listener as unknown as FakeChildListener);
    this.listeners.set(event, queue);
    return this;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(signal);
    return true;
  }

  unref(): void {}

  emit(
    event: "exit" | "close",
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    for (const listener of (this.listeners.get(event) ?? []).splice(0))
      listener(code, signal);
  }
}

function superviseFake(
  child: FakeChild,
  overrides: Partial<SuperviseOptions> = {},
): Promise<SupervisedExit> {
  return superviseCommand({
    executable: "fake-executable",
    args: [],
    cwd: process.cwd(),
    env: {},
    timeoutMs: overrides.timeoutMs ?? 10_000,
    killGraceMs: overrides.killGraceMs ?? 100,
    outputLimitBytes: overrides.outputLimitBytes ?? 65_536,
    spawnFunction: () => child,
  });
}

describe("deterministic supervision state machine (scripted child)", () => {
  it("drains and sweeps when the child exits but streams never close", async () => {
    const child = new FakeChild();
    const resultPromise = superviseFake(child, { killGraceMs: 100 });
    child.stdout.emitData(Buffer.from("partial output\n"));
    child.emit("exit", 0, null);
    const result = await resultPromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toBe("partial output\n");
    expect(result.supervision.streamsClosed).toBe(false);
    expect(result.supervision.drainTimedOut).toBe(true);
    if (process.platform === "win32") {
      expect(result.supervision.drainSweep).toBe("unavailable-win32");
    } else {
      expect(result.supervision.drainSweep).toMatch(/^posix-group-sigkill/);
    }
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
    expect(result.supervision.duplicateSettleSignals).toEqual([]);
  }, 15_000);

  it("abandons a child whose exit is never observed within the hard bound", async () => {
    const child = new FakeChild();
    const startedAt = Date.now();
    const result = await superviseFake(child, {
      timeoutMs: 100,
      killGraceMs: 150,
    });
    expect(result.supervision.timedOut).toBe(true);
    expect(result.supervision.terminationReason).toBe("timeout");
    expect(result.supervision.termination?.succeeded).toBe(false);
    expect(result.supervision.termination?.detail).toContain(
      "termination abandoned: exit never observed",
    );
    expect(result.exitCode).toBeNull();
    // Hard settle bound: timeout + 2 x grace, plus scheduler slack.
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    expect(result.supervision.duplicateSettleSignals).toEqual([]);
  }, 15_000);

  it("settles exactly once when late events fire after completion", async () => {
    const child = new FakeChild();
    const resultPromise = superviseFake(child);
    child.stdout.emitData(Buffer.from("line\n"));
    child.emit("exit", 0, null);
    child.stdout.emitClose();
    child.stderr.emitClose();
    const result = await resultPromise;
    expect(result.supervision.streamsClosed).toBe(true);
    expect(result.supervision.drainTimedOut).toBe(false);
    child.emit("close", 0, null);
    child.emit("exit", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(result.supervision.duplicateSettleSignals).toEqual([]);
  }, 15_000);

  it("truncates a scripted flood at the newline boundary and terminates", async () => {
    const child = new FakeChild();
    const resultPromise = superviseFake(child, {
      outputLimitBytes: 1_024,
      killGraceMs: 100,
    });
    const line = `${"f".repeat(255)}\n`;
    child.stdout.emitData(Buffer.from(line.repeat(3)));
    // Overflowing chunk: pushes the stream past the 1 KiB cap mid-line.
    child.stdout.emitData(Buffer.from("g".repeat(600)));
    child.stdout.emitData(Buffer.from("dropped entirely"));
    child.emit("exit", 1, null);
    child.stdout.emitClose();
    child.stderr.emitClose();
    const result = await resultPromise;
    expect(result.supervision.outputLimitExceeded).toBe(true);
    expect(result.supervision.terminationReason).toBe("output-limit");
    expect(result.supervision.stdout.truncated).toBe(true);
    expect(result.supervision.stdout.totalBytesObserved).toBe(
      3 * 256 + 600 + "dropped entirely".length,
    );
    // The retained capture ends at the last full line under the cap.
    expect(result.stdout.toString("utf8")).toBe(line.repeat(3));
    expect(result.supervision.stdout.bytesCaptured).toBe(768);
  }, 15_000);
});
