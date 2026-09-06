import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { expect, it } from "vitest";

import { runCommand } from "./command-runner.js";
import { safeAgentEnvironment } from "./redaction.js";

const repository = resolve(import.meta.dirname, "../../..");
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

it("consumes the CI-installed package graph through the unchanged sanitized child with strict dependency verification", async () => {
  const fixture = await realpath(
    await mkdtemp(resolve(tmpdir(), "candidate-package-runtime-")),
  );
  try {
    for (const path of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tools/milestone-orchestrator/package.json",
    ]) {
      await mkdir(dirname(resolve(fixture, path)), { recursive: true });
      await copyFile(resolve(repository, path), resolve(fixture, path));
    }
    expect(
      safeAgentEnvironment({ ...process.env, CI: "1" })["CI"],
    ).toBeUndefined();
    const install = await runCommand(
      {
        id: "install-under-ci",
        executable: "pnpm",
        args: [
          "install",
          "--offline",
          "--frozen-lockfile",
          "--ignore-scripts",
          "--package-import-method=copy",
        ],
        parser: "exit-code",
      },
      {
        workingDirectory: fixture,
        artifactDirectory: resolve(fixture, "probe/install"),
        timeoutMs: 120_000,
        trustedControllerCommand: true,
        extraEnvironment: { CI: "1" },
      },
    );
    expect(
      install.status,
      JSON.stringify({
        exitCode: install.exitCode,
        stderr: await readFile(install.stderrPath, "utf8"),
        stdout: await readFile(install.stdoutPath, "utf8"),
      }),
    ).toBe("PASS");
    expect(install.exitCode).toBe(0);
    const paths = [
      "node_modules/.modules.yaml",
      "node_modules/.pnpm/lock.yaml",
    ];
    const before = await Promise.all(
      paths.map(async (path) => digest(await readFile(resolve(fixture, path)))),
    );
    for (const ci of [false, true]) {
      const consumed = await runCommand(
        {
          id: ci ? "strict-child-with-ci" : "strict-sanitized-child",
          executable: "pnpm",
          args: [
            "--config.verify-deps-before-run=error",
            "exec",
            "node",
            "--input-type=module",
            "-e",
            "import ts from 'typescript'; process.stdout.write(JSON.stringify({version:ts.version,ci:process.env.CI??null}));",
          ],
          parser: "exit-code",
        },
        {
          workingDirectory: fixture,
          artifactDirectory: resolve(
            fixture,
            ci ? "probe/with-ci" : "probe/sanitized",
          ),
          timeoutMs: 30_000,
          trustedControllerCommand: true,
          ...(ci ? { extraEnvironment: { CI: "1" } } : {}),
        },
      );
      expect(
        consumed.status,
        JSON.stringify({
          exitCode: consumed.exitCode,
          stderr: await readFile(consumed.stderrPath, "utf8"),
          stdout: await readFile(consumed.stdoutPath, "utf8"),
        }),
      ).toBe("PASS");
      expect(consumed.exitCode).toBe(0);
      expect(JSON.parse(await readFile(consumed.stdoutPath, "utf8"))).toEqual({
        version: "5.9.3",
        ci: ci ? "1" : null,
      });
      expect(
        await Promise.all(
          paths.map(async (path) =>
            digest(await readFile(resolve(fixture, path))),
          ),
        ),
      ).toEqual(before);
    }
    expect(
      await readFile(resolve(fixture, "pnpm-workspace.yaml"), "utf8"),
    ).toMatch(/^enableGlobalVirtualStore: false$/m);
  } finally {
    // This exact mkdtemp root is owned by this test; no shared pnpm config is changed.
    await rm(fixture, { recursive: true, force: true });
  }
}, 180_000);
