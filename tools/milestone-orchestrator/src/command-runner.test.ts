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
    const directory = await mkdtemp(join(tmpdir(), "milestone-loop-corepack-pnpm-"));
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
  it("turns a telemetry persistence failure into an ERROR result", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "milestone-loop-command-telemetry-"),
    );
    temporaryDirectories.push(directory);
    const recordCommand = vi.fn(async () => {
      throw new Error("simulated telemetry disk failure");
    });
    const result = await runCommand(
      {
        id: "telemetry-failure",
        executable: "node",
        args: ["-e", "process.exit(0)"],
        parser: "exit-code",
      },
      {
        workingDirectory: directory,
        artifactDirectory: join(directory, "evidence"),
        timeoutMs: 10_000,
        trustedControllerCommand: true,
        telemetry: { store: { recordCommand } },
      },
    );
    expect(result).toMatchObject({
      status: "ERROR",
      exitCode: 0,
      message:
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
});
