import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePnpmScript, runCommand } from "./command-runner.js";

const temporaryDirectories: string[] = [];

// Windows releases directory handles asynchronously after a child process is
// terminated; retry the transient codes the production stores retry.
async function removeDirectoryWithRetry(directory: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (
        attempt >= 8 ||
        !code ||
        !["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(code)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

async function waitForProcessDeath(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await removeDirectoryWithRetry(directory);
});

describe("safe pnpm launcher resolution", () => {
  it("accepts Corepack's pnpm.mjs entry from npm_execpath", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-corepack-pnpm-"),
    );
    temporaryDirectories.push(directory);
    const script = join(directory, "pnpm.mjs");
    await writeFile(script, "process.exit(0);\n", "utf8");
    expect(resolvePnpmScript({ npm_execpath: script, PATH: "" })).toBe(script);
  });

  it("finds the pnpm JavaScript entry from PATH when npm_execpath is absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "milestone-loop-pnpm-"));
    temporaryDirectories.push(directory);
    const script = join(directory, "node_modules", "pnpm", "bin", "pnpm.cjs");
    await mkdir(join(directory, "node_modules", "pnpm", "bin"), {
      recursive: true,
    });
    await writeFile(script, "process.exit(0);\n", "utf8");
    expect(resolvePnpmScript({ PATH: `${directory}${delimiter}unused` })).toBe(
      script,
    );
  });
});

describe("command telemetry", () => {
  async function runWithFailingTelemetry(
    script: string,
    failure = "simulated telemetry disk failure",
  ) {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-command-telemetry-"),
    );
    temporaryDirectories.push(directory);
    const recordCommand = vi.fn(async () => {
      throw new Error(failure);
    });
    const result = await runCommand(
      {
        id: "telemetry-failure",
        executable: "node",
        args: ["-e", script],
        parser: "exit-code",
        ...(script.includes("setTimeout") ? { timeoutMs: 500 } : {}),
      },
      {
        workingDirectory: directory,
        artifactDirectory: join(directory, "evidence"),
        timeoutMs: 10_000,
        trustedControllerCommand: true,
        telemetry: { store: { recordCommand } },
      },
    );
    return { result, recordCommand };
  }

  it("preserves a PASS result when telemetry persistence fails", async () => {
    const { result, recordCommand } =
      await runWithFailingTelemetry("process.exit(0)");
    expect(result).toMatchObject({
      status: "PASS",
      exitCode: 0,
      message: "Command exited zero.",
      telemetryError:
        "Telemetry write failed for telemetry-failure: simulated telemetry disk failure",
    });
    expect(recordCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "telemetry-failure",
        status: "PASS",
        durationNanoseconds: expect.stringMatching(/^[0-9]+$/),
      }),
    );
  });

  it("preserves FAIL and TIMEOUT results when telemetry persistence fails", async () => {
    const failed = await runWithFailingTelemetry("process.exit(2)");
    expect(failed.result).toMatchObject({
      status: "FAIL",
      exitCode: 2,
      telemetryError: expect.stringContaining("Telemetry write failed"),
    });
    const timedOut = await runWithFailingTelemetry(
      "setTimeout(() => process.exit(0), 30000)",
    );
    expect(timedOut.result).toMatchObject({
      status: "TIMEOUT",
      telemetryError: expect.stringContaining("Telemetry write failed"),
    });
  }, 20_000);

  it("redacts secrets from the telemetry diagnostic", async () => {
    const { result } = await runWithFailingTelemetry(
      "process.exit(0)",
      "disk full for CODEX_TOKEN=super-secret-credential-value",
    );
    expect(result.status).toBe("PASS");
    expect(result.telemetryError).not.toContain(
      "super-secret-credential-value",
    );
  });
});

describe("bounded supervised execution", () => {
  it("records supervision facts on an ordinary passing command", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-command-supervised-"),
    );
    temporaryDirectories.push(directory);
    const result = await runCommand(
      {
        id: "supervised-pass",
        executable: "node",
        args: ["-e", "process.stdout.write('ok'); process.exit(0);"],
        parser: "exit-code",
      },
      {
        workingDirectory: directory,
        artifactDirectory: join(directory, "evidence"),
        timeoutMs: 10_000,
        trustedControllerCommand: true,
      },
    );
    expect(result.status).toBe("PASS");
    expect(result.supervision).toMatchObject({
      timedOut: false,
      outputLimitExceeded: false,
      terminationReason: null,
      streamsClosed: true,
    });
  }, 20_000);

  it("bounds, redacts, and fails closed on an output flood", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-command-flood-"),
    );
    temporaryDirectories.push(directory);
    const floodScript =
      "const line = 'FAKE_TOKEN=super-secret-flood-value-' + 'x'.repeat(80) + '\\n';" +
      "setInterval(() => { for (let i = 0; i < 128; i += 1) process.stdout.write(line); }, 1);";
    const result = await runCommand(
      {
        id: "output-flood",
        executable: "node",
        args: ["-e", floodScript],
        parser: "exit-code",
      },
      {
        workingDirectory: directory,
        artifactDirectory: join(directory, "evidence"),
        timeoutMs: 30_000,
        outputLimitBytes: 65_536,
        killGraceMs: 1_000,
        trustedControllerCommand: true,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toContain("65536-byte per-stream output limit");
    expect(result.supervision?.outputLimitExceeded).toBe(true);
    expect(result.supervision?.terminationReason).toBe("output-limit");
    expect(result.supervision?.stdout.truncated).toBe(true);
    const written = await readFile(result.stdoutPath);
    expect(written.length).toBeLessThanOrEqual(65_536 + 256);
    expect(createHash("sha256").update(written).digest("hex")).toBe(
      result.stdoutSha256,
    );
    const text = written.toString("utf8");
    expect(text).toContain("[output truncated: retained");
    expect(text).not.toContain("super-secret-flood-value");
    expect(text).toContain("FAKE_TOKEN=[REDACTED]");
  }, 45_000);

  it("cuts off a descendant that floods the inherited pipe after exit", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-command-drain-flood-"),
    );
    temporaryDirectories.push(directory);
    const pidFile = join(directory, "holder.pid");
    // The detached holder polls for its parent's death, so the flood starts
    // strictly after the runner has entered the post-exit drain phase.
    const holderScript =
      "require('fs').writeFileSync(process.env.LOOP_TEST_PIDFILE, String(process.pid));" +
      "const parentPid = Number(process.env.LOOP_TEST_PARENT_PID);" +
      "const flood = () => setInterval(() => { const line = 'd'.repeat(1023) + '\\n'; for (let i = 0; i < 32; i += 1) process.stdout.write(line); }, 5);" +
      "const watch = setInterval(() => { try { process.kill(parentPid, 0); } catch { clearInterval(watch); flood(); } }, 50);";
    const parentScript =
      "const { spawn } = require('node:child_process');" +
      `const holder = spawn(process.execPath, ['-e', ${JSON.stringify(holderScript)}], { stdio: ['ignore', 'inherit', 'inherit'], detached: true, env: { ...process.env, LOOP_TEST_PARENT_PID: String(process.pid) } });` +
      "holder.unref();" +
      "holder.once('spawn', () => setTimeout(() => process.exit(0), 100));";
    let holderPid: number | null = null;
    try {
      const result = await runCommand(
        {
          id: "drain-flood",
          executable: "node",
          args: ["-e", parentScript],
          parser: "exit-code",
        },
        {
          workingDirectory: directory,
          artifactDirectory: join(directory, "evidence"),
          timeoutMs: 30_000,
          outputLimitBytes: 16_384,
          killGraceMs: 8_000,
          extraEnvironment: { LOOP_TEST_PIDFILE: pidFile },
          trustedControllerCommand: true,
        },
      );
      holderPid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
      expect(result.exitCode).toBe(0);
      expect(result.status).toBe("ERROR");
      expect(result.message).toContain("while draining after exit");
      expect(result.supervision?.outputLimitExceeded).toBe(true);
      expect(result.supervision?.terminationReason).toBeNull();
      expect(result.supervision?.drainCutoff).toBe("output-limit");
      expect(result.supervision?.drainTimedOut).toBe(false);
      const written = await readFile(result.stdoutPath);
      expect(written.length).toBeLessThanOrEqual(16_384 + 256);
    } finally {
      if (holderPid === null && existsSync(pidFile))
        holderPid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
      if (holderPid !== null && Number.isSafeInteger(holderPid)) {
        try {
          process.kill(holderPid, "SIGKILL");
        } catch {
          // Already dead (POSIX sweep) or inaccessible - cleanup only.
        }
        // The holder's working directory is the temp dir; wait for it to
        // actually die so removal cannot race its handle release.
        await waitForProcessDeath(holderPid);
      }
    }
  }, 45_000);
});

describe("command artifact persistence", () => {
  it("settles with a fail-closed ERROR summary when artifact writes fail", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-command-artifacts-"),
    );
    temporaryDirectories.push(directory);
    const artifactDirectory = join(directory, "evidence");
    // A directory squatting on the stdout log path makes the close-handler
    // writeFile fail after the child has already exited zero.
    await mkdir(join(artifactDirectory, "artifact-crash.stdout.log"), {
      recursive: true,
    });
    const recordCommand = vi.fn(async () => undefined as never);
    const result = await runCommand(
      {
        id: "artifact-crash",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        parser: "exit-code",
      },
      {
        workingDirectory: directory,
        artifactDirectory,
        timeoutMs: 10_000,
        trustedControllerCommand: true,
        telemetry: { store: { recordCommand } },
      },
    );
    expect(result).toMatchObject({
      status: "ERROR",
      exitCode: 0,
      message: expect.stringContaining(
        "Command artifacts could not be persisted:",
      ),
    });
    expect(recordCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "artifact-crash",
        status: "ERROR",
        failureClassification: "infrastructure",
      }),
    );
  }, 20_000);
});
