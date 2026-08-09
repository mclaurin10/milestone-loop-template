import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { describeResult, runPnpm } from "../../evidence.mjs";
import {
  DEFAULT_COMMAND_KILL_GRACE_MS as CONTRACT_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES as CONTRACT_OUTPUT_LIMIT_BYTES,
} from "./contracts.js";
import {
  DEFAULT_COMMAND_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
} from "./process-supervisor.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("evidence command supervision", () => {
  it("keeps one plain-Node-loadable owner for the supervisor defaults", async () => {
    expect(DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES).toBe(67_108_864);
    expect(DEFAULT_COMMAND_KILL_GRACE_MS).toBe(5_000);
    expect(CONTRACT_OUTPUT_LIMIT_BYTES).toBe(
      DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
    );
    expect(CONTRACT_KILL_GRACE_MS).toBe(DEFAULT_COMMAND_KILL_GRACE_MS);

    const moduleUrl = pathToFileURL(
      resolve(
        repositoryRoot,
        "tools/milestone-orchestrator/src/process-supervisor.ts",
      ),
    ).href;
    const imported = spawnSync(
      process.execPath,
      [
        "-e",
        `import(${JSON.stringify(moduleUrl)}).then((module) => { if (typeof module.superviseCommand !== "function") process.exitCode = 1; });`,
      ],
      { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
    );
    expect(imported.error).toBeUndefined();
    expect(imported.status, imported.stderr).toBe(0);
  });

  it("redacts retained output before exposing a normal result", async () => {
    const secret = "super-secret-evidence-value";
    const bearer = "bearer-secret-evidence-value";
    const result = await runPnpm(
      [
        "exec",
        "node",
        "-e",
        `process.stdout.write(${JSON.stringify(`CODEX_TOKEN=${secret}\n`)}); process.stderr.write(${JSON.stringify(`Authorization: Bearer ${bearer}\n`)});`,
      ],
      { timeoutMs: 30_000, killGraceMs: 500, outputLimitBytes: 4_096 },
    );

    expect(result.error).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CODEX_TOKEN=[REDACTED]");
    expect(result.stderr).toContain("Authorization: Bearer [REDACTED]");
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(bearer);
    expect(result.supervision).toMatchObject({
      timedOut: false,
      outputLimitExceeded: false,
      termination: null,
      streamsClosed: true,
      drainTimedOut: false,
      drainCutoff: null,
    });
    expect(describeResult(result).supervision).toEqual(result.supervision);
  });

  it("fails closed with a bounded marker when output breaches the cap", async () => {
    const result = await runPnpm(
      [
        "exec",
        "node",
        "-e",
        'process.stdout.write("bounded-line\\n".repeat(4096)); setInterval(() => {}, 1000);',
      ],
      { timeoutMs: 30_000, killGraceMs: 500, outputLimitBytes: 256 },
    );

    expect(result.error?.message).toContain("output limit");
    expect(result.supervision.outputLimitExceeded).toBe(true);
    expect(result.supervision.terminationReason).toBe("output-limit");
    expect(result.supervision.termination).toMatchObject({
      rootExitObserved: true,
    });
    expect(result.stdout).toMatch(
      /\[output truncated: retained \d+ of \d+ observed bytes\]\n$/u,
    );
    expect(Buffer.byteLength(result.stdout)).toBeLessThan(1_024);
  });

  it("maps a supervised timeout to a non-passing result", async () => {
    const result = await runPnpm(
      ["exec", "node", "-e", "setInterval(() => {}, 1000);"],
      { timeoutMs: 100, killGraceMs: 500, outputLimitBytes: 4_096 },
    );

    expect(result.error?.message).toContain("timed out after 100 ms");
    expect(result.supervision).toMatchObject({
      timedOut: true,
      outputLimitExceeded: false,
      terminationReason: "timeout",
      termination: { rootExitObserved: true },
    });
  });

  it("leaves no direct production spawn layer in either converted owner", async () => {
    for (const path of ["scripts/verify.mjs", "tools/evidence.mjs"]) {
      const source = await readFile(resolve(repositoryRoot, path), "utf8");
      expect(source).not.toMatch(/\bspawnSync\s*\(|\bspawn\s*\(/u);
      expect(source).toContain("superviseCommand");
    }
  });
});
