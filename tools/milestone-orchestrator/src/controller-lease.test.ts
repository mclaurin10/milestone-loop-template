import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ControllerLease } from "./controller-lease.js";

const STATE_PATH = "artifacts/orchestrator/state/state.json";
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
