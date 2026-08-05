import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePnpmScript, runCommand } from "./command-runner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
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
