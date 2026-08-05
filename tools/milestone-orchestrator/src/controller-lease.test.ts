import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { ControllerLease } from "./controller-lease.js";

const STATE_PATH = "artifacts/orchestrator/state/state.json";
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function leaseFixture(): Promise<{ root: string; leasePath: string }> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-lease-"));
  temporaryDirectories.push(root);
  return { root, leasePath: ControllerLease.leasePath(root, STATE_PATH) };
}

function deadPid(): number {
  const result = spawnSync(process.execPath, ["-e", "0"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || !result.pid)
    throw new Error("Could not spawn a short-lived process for a dead PID.");
  return result.pid;
}

async function writeOwner(
  leasePath: string,
  owner: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(leasePath), { recursive: true });
  await writeFile(leasePath, `${JSON.stringify(owner)}\n`, "utf8");
}

describe("controller mutation lease", () => {
  it("grants one exclusive lease and refuses a live same-host contender", async () => {
    const fixture = await leaseFixture();
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    const owner = JSON.parse(await readFile(fixture.leasePath, "utf8")) as {
      pid: number;
      hostname: string;
      operation: string;
    };
    expect(owner.pid).toBe(process.pid);
    expect(owner.hostname).toBe(hostname());
    expect(owner.operation).toBe("run");

    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "plan",
      }),
    ).rejects.toThrow(/Another controller holds the mutation lease/);

    await lease.release();
    const reacquired = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "plan",
    });
    await reacquired.release();
  });

  it("recovers a dead same-host owner exactly once", async () => {
    const fixture = await leaseFixture();
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.0.0",
      token: "stale-token",
      pid: deadPid(),
      hostname: hostname(),
      processStartedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      operation: "run",
    });
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    await lease.release();
  });

  it("recovers atomically and leaves no temporary or quarantine files", async () => {
    const fixture = await leaseFixture();
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.0.0",
      token: "stale-token",
      pid: deadPid(),
      hostname: hostname(),
      processStartedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      operation: "run",
    });
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    expect(await readdir(dirname(fixture.leasePath))).toEqual([
      "controller.lease",
    ]);
    const owner = JSON.parse(await readFile(fixture.leasePath, "utf8")) as {
      pid: number;
    };
    expect(owner.pid).toBe(process.pid);
    await lease.release();
    expect(await readdir(dirname(fixture.leasePath))).toEqual([]);
  });

  it("recovers its own reused pid via the recorded process start time", async () => {
    const fixture = await leaseFixture();
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.1.0",
      token: "previous-incarnation",
      pid: process.pid,
      hostname: hostname(),
      processStartedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      operation: "run",
    });
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    await lease.release();
  });

  it("still refuses its own live lease within the start-time tolerance", async () => {
    const fixture = await leaseFixture();
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.1.0",
      token: "same-incarnation",
      pid: process.pid,
      hostname: hostname(),
      processStartedAt: new Date(
        Date.now() - process.uptime() * 1000,
      ).toISOString(),
      createdAt: new Date().toISOString(),
      operation: "run",
    });
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/Another controller holds the mutation lease/);
  });

  it("treats a same-hostname lease from another machine instance as cross-host", async () => {
    const fixture = await leaseFixture();
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.1.0",
      token: "twin-token",
      pid: deadPid(),
      hostname: hostname(),
      hostInstanceId: "another-machine-instance",
      processStartedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      operation: "run",
    });
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/different host holds the mutation lease/);
    expect(await readFile(fixture.leasePath, "utf8")).toContain("twin-token");
  });

  it(
    "lets exactly one racing controller recover a dead lease",
    { timeout: 60_000 },
    async () => {
      const fixture = await leaseFixture();
      await writeOwner(fixture.leasePath, {
        schemaVersion: "1.0.0",
        token: "stale-token",
        pid: deadPid(),
        hostname: hostname(),
        processStartedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
        operation: "run",
      });
      const moduleUrl = pathToFileURL(
        resolve(import.meta.dirname, "controller-lease.ts"),
      ).href;
      const scriptPath = join(fixture.root, "race-child.mjs");
      await writeFile(
        scriptPath,
        [
          `import { ControllerLease } from ${JSON.stringify(moduleUrl)};`,
          `const [root, statePath] = process.argv.slice(2);`,
          `try {`,
          `  await ControllerLease.acquire({ repositoryRoot: root, statePath, operation: "run" });`,
          `  process.stdout.write("ACQUIRED\\n");`,
          `  await new Promise((resolvePromise) => setTimeout(resolvePromise, 30000));`,
          `} catch (error) {`,
          "  process.stdout.write(`REFUSED:${error instanceof Error ? error.message : String(error)}\\n`);",
          `}`,
          ``,
        ].join("\n"),
        "utf8",
      );
      const children = [0, 1].map(() =>
        spawn(
          process.execPath,
          [
            "node_modules/tsx/dist/cli.mjs",
            scriptPath,
            fixture.root,
            STATE_PATH,
          ],
          { cwd: repositoryRoot, windowsHide: true },
        ),
      );
      try {
        const firstLines = await Promise.all(
          children.map(
            (child) =>
              new Promise<string>((resolveLine, rejectLine) => {
                let buffered = "";
                child.stdout.on("data", (chunk: Buffer) => {
                  buffered += chunk.toString("utf8");
                  const newline = buffered.indexOf("\n");
                  if (newline !== -1) resolveLine(buffered.slice(0, newline));
                });
                child.once("error", rejectLine);
                child.once("exit", () => {
                  const newline = buffered.indexOf("\n");
                  resolveLine(
                    newline === -1 ? buffered : buffered.slice(0, newline),
                  );
                });
              }),
          ),
        );
        const acquired = firstLines.filter((line) => line === "ACQUIRED");
        const refused = firstLines.filter((line) =>
          line.startsWith("REFUSED:"),
        );
        expect(acquired).toHaveLength(1);
        expect(refused).toHaveLength(1);
        expect(refused[0]).toMatch(
          /mutation lease|being recovered|Cannot acquire/,
        );
      } finally {
        for (const child of children) child.kill();
        await Promise.all(
          children.map(
            (child) =>
              new Promise((resolveExit) => child.once("close", resolveExit)),
          ),
        );
      }
    },
  );

  it("never recovers a lease held on a different host", async () => {
    const fixture = await leaseFixture();
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.0.0",
      token: "foreign-token",
      pid: deadPid(),
      hostname: `${hostname()}-elsewhere`,
      processStartedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      operation: "reconcile",
    });
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/different host holds the mutation lease/);
    expect(await readFile(fixture.leasePath, "utf8")).toContain(
      "foreign-token",
    );
  });

  it("refuses malformed lease files instead of stealing them", async () => {
    const fixture = await leaseFixture();
    await mkdir(dirname(fixture.leasePath), { recursive: true });
    await writeFile(fixture.leasePath, "{", "utf8");
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/malformed/);
  });

  it("refuses to release a lease whose ownership changed", async () => {
    const fixture = await leaseFixture();
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    await writeOwner(fixture.leasePath, {
      schemaVersion: "1.0.0",
      token: "stolen-token",
      pid: process.pid,
      hostname: hostname(),
      processStartedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      operation: "run",
    });
    await expect(lease.release()).rejects.toThrow(
      /Controller lease ownership changed/,
    );
    await rm(fixture.leasePath);
    await expect(lease.release()).resolves.toBeUndefined();
  });

  it("inspects present, absent, and malformed leases read-only", async () => {
    const fixture = await leaseFixture();
    expect(await ControllerLease.inspect(fixture.root, STATE_PATH)).toEqual({
      path: fixture.leasePath,
      present: false,
      malformed: false,
      owner: null,
    });
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "canary",
    });
    const inspection = await ControllerLease.inspect(fixture.root, STATE_PATH);
    expect(inspection).toMatchObject({
      present: true,
      malformed: false,
      owner: {
        pid: process.pid,
        hostname: hostname(),
        operation: "canary",
      },
    });
    await lease.release();
    await writeFile(fixture.leasePath, "not-json", "utf8");
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({ present: true, malformed: true, owner: null });
  });
});
