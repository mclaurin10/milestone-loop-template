import { spawn } from "node:child_process";
import { join } from "node:path";

import type { StreamCaptureReport, SupervisionReport } from "./contracts.js";

export const DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES = 67_108_864;
export const DEFAULT_COMMAND_KILL_GRACE_MS = 5_000;

const TRUNCATION_BOUNDARY_WINDOW_BYTES = 4096;
const NEWLINE = 0x0a;

export interface SupervisedStdioLike {
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  once(event: "close", listener: () => void): unknown;
  removeAllListeners(event: "data"): unknown;
  destroy(): unknown;
}

export interface SupervisedChildLike {
  readonly pid?: number | undefined;
  readonly stdout: SupervisedStdioLike | null;
  readonly stderr: SupervisedStdioLike | null;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "exit" | "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
  unref(): void;
}

export interface SupervisedSpawnOptions {
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly stdio: readonly ["ignore", "pipe", "pipe"];
  readonly windowsHide: boolean;
  readonly detached: boolean;
}

export type SpawnFunction = (
  executable: string,
  args: readonly string[],
  options: SupervisedSpawnOptions,
) => SupervisedChildLike;

export interface SuperviseOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly killGraceMs: number;
  readonly outputLimitBytes: number;
  /**
   * Test seam mirroring the verifier's `executeCommand` injection: real runs
   * always use `node:child_process.spawn`; deterministic state-machine tests
   * (drain, abandonment, event races that real processes cannot reproduce on
   * every platform) inject a scripted child instead.
   */
  readonly spawnFunction?: SpawnFunction;
}

export interface SupervisedExit {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly spawnError: Error | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly supervision: SupervisionReport;
}

/**
 * Trim a capped capture so it never ends mid-line: a secret split at the cap
 * edge must not be half-retained where redaction patterns cannot match it.
 * Retained bytes beyond the cap are cut first; the result then ends at the
 * last newline within the final boundary window, or drops the whole window
 * when no newline exists there.
 */
export function truncateAtNewlineBoundary(
  captured: readonly Buffer[],
  capBytes: number,
): { readonly data: Buffer; readonly trimmedBytes: number } {
  const joined = Buffer.concat([...captured]);
  if (joined.length <= capBytes) return { data: joined, trimmedBytes: 0 };
  const cut = joined.subarray(0, capBytes);
  const window = Math.min(TRUNCATION_BOUNDARY_WINDOW_BYTES, cut.length);
  const newlineIndex = cut.lastIndexOf(NEWLINE, cut.length - 1);
  const kept =
    newlineIndex >= cut.length - window
      ? cut.subarray(0, newlineIndex + 1)
      : cut.subarray(0, cut.length - window);
  return {
    data: Buffer.from(kept),
    trimmedBytes: joined.length - kept.length,
  };
}

interface StreamCapture {
  chunks: Buffer[];
  retainedBytes: number;
  observedBytes: number;
  truncated: boolean;
}

function captureReport(
  capture: StreamCapture,
  finalBytes: number,
  capBytes: number,
): StreamCaptureReport {
  return {
    bytesCaptured: finalBytes,
    totalBytesObserved: capture.observedBytes,
    truncated: capture.truncated,
    capBytes,
  };
}

function finalStreamData(capture: StreamCapture, capBytes: number): Buffer {
  if (!capture.truncated) return Buffer.concat(capture.chunks);
  return truncateAtNewlineBoundary(capture.chunks, capBytes).data;
}

/**
 * Run one child process under a bounded supervision contract:
 *
 * - Output is retained in memory up to `outputLimitBytes` per stream; bytes
 *   past the cap are counted but never retained, so a flood cannot exhaust
 *   controller memory. A breach terminates the process tree.
 * - Timeout and cap breach terminate the complete process tree: on Windows a
 *   force-first `taskkill /pid <pid> /T /F` while the tree is still intact
 *   (a dead root makes `/T` unable to enumerate descendants), falling back to
 *   `child.kill()`; on POSIX the child is spawned detached as a process-group
 *   leader and receives group SIGTERM, escalating to group SIGKILL after
 *   `killGraceMs`.
 * - Settle is exactly-once and hard-bounded: after the child exits, streams
 *   held open by descendants are given one `killGraceMs` drain window, then
 *   swept (POSIX group kill; unavailable on Windows once the root is dead),
 *   destroyed, and the disposition recorded. Even if every kill fails, an
 *   abandonment backstop settles within `timeoutMs + 2 x killGraceMs`.
 *
 * The returned promise never rejects; all failures are represented in the
 * resolved value. Callers own policy, redaction, artifact writes, and status
 * mapping.
 */
export function superviseCommand(
  options: SuperviseOptions,
): Promise<SupervisedExit> {
  return new Promise((resolveResult) => {
    type Phase = "running" | "terminating" | "draining" | "settled";
    let phase: Phase = "running";
    let timedOut = false;
    let outputLimitExceeded = false;
    let terminationReason: "timeout" | "output-limit" | null = null;
    let terminationInitiated = false;
    const terminationAttempted: string[] = [];
    let terminationDetail: string | null = null;
    let drainTimedOut = false;
    let drainCutoff: "output-limit" | null = null;
    let drainSweep: string | null = null;
    let spawnError: Error | null = null;
    let exitSeen = false;
    let exitCode: number | null = null;
    let exitSignal: string | null = null;
    let stdoutClosed = false;
    let stderrClosed = false;
    const duplicateSettleSignals: string[] = [];

    const stdoutCapture: StreamCapture = {
      chunks: [],
      retainedBytes: 0,
      observedBytes: 0,
      truncated: false,
    };
    const stderrCapture: StreamCapture = {
      chunks: [],
      retainedBytes: 0,
      observedBytes: 0,
      truncated: false,
    };

    let timeoutTimer: NodeJS.Timeout | null = null;
    let graceTimer: NodeJS.Timeout | null = null;
    let abandonTimer: NodeJS.Timeout | null = null;
    let drainTimer: NodeJS.Timeout | null = null;

    const clearTimers = (): void => {
      for (const timer of [timeoutTimer, graceTimer, abandonTimer, drainTimer])
        if (timer) clearTimeout(timer);
      timeoutTimer = null;
      graceTimer = null;
      abandonTimer = null;
      drainTimer = null;
    };

    const spawnChild: SpawnFunction =
      options.spawnFunction ??
      ((executable, args, spawnOptions) =>
        spawn(executable, [...args], {
          cwd: spawnOptions.cwd,
          env: spawnOptions.env,
          stdio: [...spawnOptions.stdio],
          windowsHide: spawnOptions.windowsHide,
          detached: spawnOptions.detached,
        }));
    let child: SupervisedChildLike;
    try {
      child = spawnChild(options.executable, options.args, {
        cwd: options.cwd,
        env: { ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      // A synchronous spawn throw must resolve like every other failure -
      // this promise never rejects.
      const emptyStream: StreamCaptureReport = {
        bytesCaptured: 0,
        totalBytesObserved: 0,
        truncated: false,
        capBytes: options.outputLimitBytes,
      };
      resolveResult({
        exitCode: null,
        signal: null,
        spawnError: error instanceof Error ? error : new Error(String(error)),
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        supervision: {
          timedOut: false,
          outputLimitExceeded: false,
          terminationReason: null,
          termination: null,
          streamsClosed: false,
          drainTimedOut: false,
          drainCutoff: null,
          drainSweep: null,
          stdout: emptyStream,
          stderr: emptyStream,
          duplicateSettleSignals: [],
        },
      });
      return;
    }

    const settle = (origin: string): void => {
      if (phase === "settled") {
        duplicateSettleSignals.push(origin);
        return;
      }
      phase = "settled";
      clearTimers();
      child.stdout?.removeAllListeners("data");
      child.stderr?.removeAllListeners("data");
      try {
        child.stdout?.destroy();
        child.stderr?.destroy();
      } catch {
        // Stream teardown must never block the settle.
      }
      child.unref();
      const stdoutData = finalStreamData(
        stdoutCapture,
        options.outputLimitBytes,
      );
      const stderrData = finalStreamData(
        stderrCapture,
        options.outputLimitBytes,
      );
      resolveResult({
        exitCode,
        signal: exitSignal,
        spawnError,
        stdout: stdoutData,
        stderr: stderrData,
        supervision: {
          timedOut,
          outputLimitExceeded,
          terminationReason,
          termination: terminationInitiated
            ? {
                attempted: [...terminationAttempted],
                rootExitObserved: exitSeen,
                detail: terminationDetail,
              }
            : null,
          streamsClosed: stdoutClosed && stderrClosed,
          drainTimedOut,
          drainCutoff,
          drainSweep,
          stdout: captureReport(
            stdoutCapture,
            stdoutData.length,
            options.outputLimitBytes,
          ),
          stderr: captureReport(
            stderrCapture,
            stderrData.length,
            options.outputLimitBytes,
          ),
          duplicateSettleSignals,
        },
      });
    };

    const recordDetail = (detail: string): void => {
      terminationDetail = terminationDetail
        ? `${terminationDetail}; ${detail}`
        : detail;
    };

    const killDirectChild = (origin: string): void => {
      terminationAttempted.push(`${origin}:child-kill`);
      try {
        child.kill(process.platform === "win32" ? undefined : "SIGKILL");
      } catch (error) {
        recordDetail(
          `child-kill failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    const killWindowsTree = (): void => {
      terminationAttempted.push("taskkill-tree-force");
      const taskkillPath = join(
        process.env["SystemRoot"] ?? "C:\\Windows",
        "System32",
        "taskkill.exe",
      );
      if (typeof child.pid !== "number") {
        recordDetail("taskkill skipped: child pid unavailable");
        killDirectChild("taskkill-unavailable");
        return;
      }
      try {
        const killer = spawn(
          taskkillPath,
          ["/pid", String(child.pid), "/T", "/F"],
          { stdio: "ignore", windowsHide: true },
        );
        const killerCap = setTimeout(() => {
          recordDetail("taskkill-result-unknown");
          killer.kill();
        }, 5000);
        killerCap.unref();
        killer.once("error", (error) => {
          clearTimeout(killerCap);
          recordDetail(`taskkill spawn failed: ${error.message}`);
          if (phase !== "settled" && !exitSeen)
            killDirectChild("taskkill-error");
        });
        killer.once("exit", (code) => {
          clearTimeout(killerCap);
          // 0 = terminated; 128 = no such process (already dead) - both fine.
          if (code === 0 || code === 128) {
            recordDetail(`taskkill exit ${code}`);
            return;
          }
          recordDetail(`taskkill exit ${String(code)}`);
          if (phase !== "settled" && !exitSeen)
            killDirectChild("taskkill-failed");
        });
        killer.unref();
      } catch (error) {
        recordDetail(
          `taskkill unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
        killDirectChild("taskkill-unavailable");
      }
    };

    const killPosixGroup = (signal: "SIGTERM" | "SIGKILL"): void => {
      terminationAttempted.push(`posix-group-${signal.toLowerCase()}`);
      if (typeof child.pid !== "number") {
        recordDetail(`group ${signal} skipped: child pid unavailable`);
        killDirectChild("group-unavailable");
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        const code =
          error instanceof Error && "code" in error
            ? String((error as NodeJS.ErrnoException).code)
            : String(error);
        recordDetail(`group ${signal} failed: ${code}`);
        if (code !== "ESRCH") killDirectChild("group-failed");
      }
    };

    const escalate = (): void => {
      if (phase !== "terminating") return;
      if (process.platform === "win32") {
        // taskkill already used /F; the fallback is a direct TerminateProcess.
        killDirectChild("grace-expired");
      } else {
        killPosixGroup("SIGKILL");
      }
      abandonTimer = setTimeout(() => {
        if (phase === "settled") return;
        recordDetail("termination abandoned: exit never observed");
        settle("abandon-timer");
      }, options.killGraceMs);
    };

    const initiateTermination = (reason: "timeout" | "output-limit"): void => {
      if (phase !== "running") return;
      phase = "terminating";
      terminationReason = reason;
      terminationInitiated = true;
      if (process.platform === "win32") {
        // Force-first while the tree is intact: /T walks live parent chains,
        // so killing the root first would orphan grandchildren beyond reach.
        killWindowsTree();
      } else {
        killPosixGroup("SIGTERM");
      }
      graceTimer = setTimeout(escalate, options.killGraceMs);
    };

    const sweepStragglers = (): void => {
      if (process.platform === "win32") {
        // The root is dead; taskkill /T cannot enumerate its survivors.
        drainSweep = "unavailable-win32";
        return;
      }
      if (typeof child.pid !== "number") {
        drainSweep = "unavailable-no-pid";
        return;
      }
      drainSweep = "posix-group-sigkill";
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        const code =
          error instanceof Error && "code" in error
            ? String((error as NodeJS.ErrnoException).code)
            : String(error);
        // ESRCH means the root's process group is already empty. The sweep has
        // no remaining target; every other signal failure stays explicit.
        if (code !== "ESRCH") drainSweep = `posix-group-sigkill-failed:${code}`;
      }
    };

    const onData = (
      capture: StreamCapture,
      chunk: Buffer,
      streamName: string,
    ): void => {
      capture.observedBytes += chunk.length;
      if (capture.truncated) return;
      const room = options.outputLimitBytes - capture.retainedBytes;
      if (chunk.length <= room) {
        capture.chunks.push(chunk);
        capture.retainedBytes += chunk.length;
        return;
      }
      // Retain the single overflowing chunk whole (bounded by the pipe read
      // size) so the newline-boundary trim can see past the cap edge; every
      // later chunk is counted but dropped.
      capture.chunks.push(chunk);
      capture.retainedBytes += chunk.length;
      capture.truncated = true;
      if (outputLimitExceeded) return;
      outputLimitExceeded = true;
      if (phase === "running") {
        recordDetail(
          `${streamName} exceeded ${options.outputLimitBytes} bytes`,
        );
        initiateTermination("output-limit");
        return;
      }
      if (phase === "draining") {
        // The root already exited, so there is no tree to terminate; cut the
        // drain off immediately - a breaching writer that then closes its
        // pipes must never skip the straggler sweep.
        drainCutoff = "output-limit";
        sweepStragglers();
        settle("drain-output-limit");
        return;
      }
      // Terminating already: the kill is in flight; record the breach only.
      recordDetail(
        `${streamName} exceeded ${options.outputLimitBytes} bytes during termination`,
      );
    };

    child.stdout?.on("data", (chunk: Buffer) =>
      onData(stdoutCapture, chunk, "stdout"),
    );
    child.stderr?.on("data", (chunk: Buffer) =>
      onData(stderrCapture, chunk, "stderr"),
    );

    const maybeSettleAfterExit = (origin: string): void => {
      if (!exitSeen || phase === "settled") return;
      if (stdoutClosed && stderrClosed) {
        settle(origin);
        return;
      }
      if (phase !== "draining") {
        phase = "draining";
        drainTimer = setTimeout(() => {
          if (phase === "settled") return;
          drainTimedOut = true;
          sweepStragglers();
          settle("drain-timer");
        }, options.killGraceMs);
      }
    };

    child.stdout?.once("close", () => {
      stdoutClosed = true;
      maybeSettleAfterExit("stdout-close");
    });
    child.stderr?.once("close", () => {
      stderrClosed = true;
      maybeSettleAfterExit("stderr-close");
    });

    child.once("error", (error) => {
      if (phase === "settled") return;
      spawnError = error;
      // Node emits "close" after a spawn-failure "error"; the backstop below
      // guarantees settle even if that contract is ever violated. It reuses
      // the abandon slot so settle() clears it.
      if (!abandonTimer)
        abandonTimer = setTimeout(() => {
          if (phase === "settled") return;
          exitSeen = true;
          settle("spawn-error-backstop");
        }, options.killGraceMs);
    });

    child.once("exit", (code, signal) => {
      if (phase === "settled") return;
      exitSeen = true;
      exitCode = code;
      exitSignal = signal;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      if (abandonTimer) clearTimeout(abandonTimer);
      timeoutTimer = null;
      graceTimer = null;
      abandonTimer = null;
      maybeSettleAfterExit("child-exit");
    });

    child.once("close", (code, signal) => {
      if (phase === "settled") return;
      // "close" implies exit plus fully closed stdio; adopt whichever facts
      // have not been observed yet (spawn failures skip "exit" entirely).
      exitSeen = true;
      if (exitCode === null && code !== null) exitCode = code;
      if (exitSignal === null && signal !== null) exitSignal = signal;
      stdoutClosed = true;
      stderrClosed = true;
      settle("child-close");
    });

    timeoutTimer = setTimeout(() => {
      if (phase !== "running" || exitSeen) return;
      timedOut = true;
      initiateTermination("timeout");
    }, options.timeoutMs);
  });
}
