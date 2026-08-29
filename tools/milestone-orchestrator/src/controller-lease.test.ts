import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { ControllerLease } from "./controller-lease.js";

const STATE_PATH = "artifacts/orchestrator/state/state.json";
const LEASE_REF = ControllerLease.leaseReference();
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(
  repository: string,
  ...argsOrOptions: Array<string | { readonly input: string }>
): string {
  const maybeOptions = argsOrOptions.at(-1);
  const input =
    typeof maybeOptions === "object" ? maybeOptions.input : undefined;
  if (typeof maybeOptions === "object") argsOrOptions.pop();
  const args = argsOrOptions as string[];
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    input,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}

async function leaseFixture(): Promise<{
  root: string;
  leasePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-lease-"));
  temporaryDirectories.push(root);
  git(root, "init", "--initial-branch=fixture");
  git(root, "config", "user.name", "Lease Fixture");
  git(root, "config", "user.email", "lease@example.invalid");
  git(root, "commit", "--allow-empty", "-m", "fixture");
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

function owner(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: "2.0.0",
    token: "fixture-token",
    pid: deadPid(),
    hostname: hostname(),
    hostInstanceId: null,
    processStartedAt: "2026-08-01T00:00:00.000Z",
    acquiredAt: "2026-08-01T00:00:00.000Z",
    operation: "run",
    ...overrides,
  };
}

function writeLeaseObject(
  root: string,
  contents: string | Record<string, unknown>,
): string {
  const serialized =
    typeof contents === "string"
      ? contents
      : `${JSON.stringify(contents, null, 2)}\n`;
  const objectId = git(root, "hash-object", "-w", "--stdin", {
    input: serialized,
  });
  git(root, "update-ref", LEASE_REF, objectId);
  return objectId;
}

function readLeaseObject(root: string): {
  objectId: string;
  value: Record<string, unknown>;
} {
  const objectId = git(root, "rev-parse", "--verify", LEASE_REF);
  const value = JSON.parse(git(root, "cat-file", "blob", objectId)) as Record<
    string,
    unknown
  >;
  return { objectId, value };
}

async function writeLegacyLease(
  leasePath: string,
  value: string | Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(leasePath), { recursive: true });
  await writeFile(
    leasePath,
    typeof value === "string" ? value : `${JSON.stringify(value)}\n`,
    "utf8",
  );
}

function firstLine(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolveLine, rejectLine) => {
    let buffered = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline !== -1) resolveLine(buffered.slice(0, newline));
    });
    child.once("error", rejectLine);
    child.once("exit", () => {
      const newline = buffered.indexOf("\n");
      resolveLine(newline === -1 ? buffered : buffered.slice(0, newline));
    });
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolveClose) => {
    child.once("close", () => resolveClose());
  });
  child.kill();
  await closed;
}

async function waitForPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      await access(path);
      return;
    } catch {
      await delay(25);
    }
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

async function forcedMultiprocessRace(
  fixture: { root: string; leasePath: string },
  initialOwner: "absent" | "stale",
): Promise<void> {
  if (initialOwner === "stale") writeLeaseObject(fixture.root, owner());
  const moduleUrl = pathToFileURL(
    resolve(import.meta.dirname, "controller-lease.ts"),
  ).href;
  const barrierDirectory = join(fixture.root, "barrier");
  await mkdir(barrierDirectory);
  const scriptPath = join(fixture.root, "race-child.mjs");
  await writeFile(
    scriptPath,
    [
      `import { access, writeFile } from "node:fs/promises";`,
      `import { join } from "node:path";`,
      `import { setTimeout as delay } from "node:timers/promises";`,
      `import { ControllerLease } from ${JSON.stringify(moduleUrl)};`,
      `const [root, statePath, barrier, identity] = process.argv.slice(2);`,
      `async function wait(path) {`,
      `  for (;;) {`,
      `    try { await access(path); return; } catch { await delay(10); }`,
      `  }`,
      `}`,
      `try {`,
      `  const lease = await ControllerLease.acquire({`,
      `    repositoryRoot: root, statePath, operation: "run",`,
      `    hooks: { afterObservedExisting: async () => {`,
      `      await writeFile(join(barrier, \`observed-\${identity}\`), "observed\\n", { flag: "a" });`,
      `      await wait(join(barrier, "release"));`,
      `    } },`,
      `  });`,
      `  process.stdout.write("ACQUIRED\\n");`,
      `  await wait(join(barrier, "close"));`,
      `  await lease.release();`,
      `} catch (error) {`,
      "  process.stdout.write(`REFUSED:${error instanceof Error ? error.message : String(error)}\\n`);",
      `}`,
      ``,
    ].join("\n"),
    "utf8",
  );
  const children = ["a", "b"].map((identity) =>
    spawn(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        scriptPath,
        fixture.root,
        STATE_PATH,
        barrierDirectory,
        identity,
      ],
      { cwd: repositoryRoot, windowsHide: true },
    ),
  );
  const lines = children.map(firstLine);
  try {
    await Promise.all(
      ["a", "b"].map((identity) =>
        waitForPath(join(barrierDirectory, `observed-${identity}`)),
      ),
    );
    await writeFile(join(barrierDirectory, "release"), "release\n", "utf8");
    const firstLines = await Promise.all(lines);
    expect(firstLines.filter((line) => line === "ACQUIRED")).toHaveLength(1);
    expect(
      firstLines.filter((line) => line.startsWith("REFUSED:")),
    ).toHaveLength(1);

    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({ present: true, malformed: false });
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "canary",
      }),
    ).rejects.toThrow(/Another controller holds the mutation lease/);
  } finally {
    await writeFile(join(barrierDirectory, "close"), "close\n", "utf8");
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolveExit) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolveExit();
              return;
            }
            child.once("close", () => resolveExit());
          }),
      ),
    );
  }
  expect(await ControllerLease.inspect(fixture.root, STATE_PATH)).toMatchObject(
    { present: false, malformed: false },
  );
}

describe("controller mutation lease", () => {
  it("grants one private-ref lease and refuses a live same-host contender", async () => {
    const fixture = await leaseFixture();
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    const published = readLeaseObject(fixture.root);
    expect(published.value).toMatchObject({
      schemaVersion: "2.0.0",
      pid: process.pid,
      hostname: hostname(),
      operation: "run",
    });
    expect(git(fixture.root, "cat-file", "-t", published.objectId)).toBe(
      "blob",
    );
    expect(await readFile(fixture.leasePath, "utf8")).toContain(
      "private-ref-protocol-guard",
    );

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

  it("recovers a dead same-host owner with an expected-old update", async () => {
    const fixture = await leaseFixture();
    const staleObjectId = writeLeaseObject(fixture.root, owner());
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    expect(readLeaseObject(fixture.root).objectId).not.toBe(staleObjectId);
    await lease.release();
  });

  it("leaves only the permanent legacy guard in the state directory", async () => {
    const fixture = await leaseFixture();
    writeLeaseObject(fixture.root, owner());
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    expect(await readdir(dirname(fixture.leasePath))).toEqual([
      "controller.lease",
    ]);
    await lease.release();
    expect(await readdir(dirname(fixture.leasePath))).toEqual([
      "controller.lease",
    ]);
  });

  it("recovers its own reused pid via the recorded process start time", async () => {
    const fixture = await leaseFixture();
    writeLeaseObject(
      fixture.root,
      owner({ pid: process.pid, token: "previous-incarnation" }),
    );
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    await lease.release();
  });

  it("distinguishes an external live owner from a different incarnation reusing its pid", async () => {
    const fixture = await leaseFixture();
    const spawnedAt = new Date().toISOString();
    const child = spawn(
      process.execPath,
      ["-e", 'process.stdout.write("READY\\n"); setInterval(() => {}, 1_000);'],
      { windowsHide: true },
    );
    try {
      expect(await firstLine(child)).toBe("READY");
      if (!child.pid) throw new Error("Expected the live fixture process PID.");

      const liveObjectId = writeLeaseObject(
        fixture.root,
        owner({
          pid: child.pid,
          processStartedAt: spawnedAt,
          acquiredAt: new Date().toISOString(),
        }),
      );
      await expect(
        ControllerLease.acquire({
          repositoryRoot: fixture.root,
          statePath: STATE_PATH,
          operation: "run",
        }),
      ).rejects.toThrow(/Another controller holds the mutation lease/);
      expect(readLeaseObject(fixture.root).objectId).toBe(liveObjectId);

      const reusedObjectId = writeLeaseObject(
        fixture.root,
        owner({
          pid: child.pid,
          processStartedAt: "2000-01-01T00:00:00.000Z",
        }),
      );
      const recovered = await ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      });
      expect(readLeaseObject(fixture.root).objectId).not.toBe(reusedObjectId);
      await recovered.release();
    } finally {
      await stopChild(child);
    }
  });

  it("still refuses its own live lease within the start-time tolerance", async () => {
    const fixture = await leaseFixture();
    writeLeaseObject(
      fixture.root,
      owner({
        token: "same-incarnation",
        pid: process.pid,
        processStartedAt: new Date(
          Date.now() - process.uptime() * 1000,
        ).toISOString(),
        acquiredAt: new Date().toISOString(),
      }),
    );
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/Another controller holds the mutation lease/);
  });

  it("treats a same-hostname owner from another machine instance as cross-host", async () => {
    const fixture = await leaseFixture();
    const foreignObjectId = writeLeaseObject(
      fixture.root,
      owner({ hostInstanceId: "another-machine-instance" }),
    );
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/different host holds the mutation lease/);
    expect(readLeaseObject(fixture.root).objectId).toBe(foreignObjectId);
  });

  it("lets exactly one pair of first-time multiprocess contenders acquire", async () => {
    await forcedMultiprocessRace(await leaseFixture(), "absent");
  }, 60_000);

  it("lets exactly one pair of synchronized stale recoverers acquire", async () => {
    await forcedMultiprocessRace(await leaseFixture(), "stale");
  }, 60_000);

  it("does not let a losing stale recoverer remove a newly published winner", async () => {
    const fixture = await leaseFixture();
    writeLeaseObject(fixture.root, owner());

    let signalLoserObserved!: () => void;
    const loserObserved = new Promise<void>((resolveObserved) => {
      signalLoserObserved = resolveObserved;
    });
    let signalWinnerPublished!: () => void;
    const winnerPublished = new Promise<void>((resolvePublished) => {
      signalWinnerPublished = resolvePublished;
    });

    const winnerAttempt = ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
      hooks: {
        afterObservedExisting: () => loserObserved,
        afterPublished: () => signalWinnerPublished(),
      },
    });
    const loserAttempt = ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "plan",
      hooks: {
        afterObservedExisting: async () => {
          signalLoserObserved();
          await winnerPublished;
        },
      },
    });

    const [winnerResult, loserResult] = await Promise.allSettled([
      winnerAttempt,
      loserAttempt,
    ]);
    expect(winnerResult.status).toBe("fulfilled");
    expect(loserResult.status).toBe("rejected");
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({
      present: true,
      malformed: false,
      owner: { operation: "run" },
    });
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "canary",
      }),
    ).rejects.toThrow(/Another controller holds the mutation lease/);

    if (winnerResult.status === "fulfilled") await winnerResult.value.release();
  });

  it("never recovers an owner held on a different host", async () => {
    const fixture = await leaseFixture();
    const foreignObjectId = writeLeaseObject(
      fixture.root,
      owner({ hostname: `${hostname()}-elsewhere`, operation: "reconcile" }),
    );
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/different host holds the mutation lease/);
    expect(readLeaseObject(fixture.root).objectId).toBe(foreignObjectId);
  });

  it("refuses malformed lease blobs instead of changing their ref", async () => {
    const fixture = await leaseFixture();
    const malformedObjectId = writeLeaseObject(fixture.root, "{");
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/malformed JSON/);
    expect(readLeaseObject.bind(null, fixture.root)).toThrow();
    expect(git(fixture.root, "rev-parse", "--verify", LEASE_REF)).toBe(
      malformedObjectId,
    );
  });

  it("refuses a non-blob ref target", async () => {
    const fixture = await leaseFixture();
    const commit = git(fixture.root, "rev-parse", "HEAD");
    git(fixture.root, "update-ref", LEASE_REF, commit);
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/rather than a blob/);
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({ present: true, malformed: true, owner: null });
  });

  it("refuses a legacy lease and leaves both ownership stores untouched", async () => {
    const fixture = await leaseFixture();
    await writeLegacyLease(fixture.leasePath, owner({ token: "legacy" }));
    const before = await readFile(fixture.leasePath, "utf8");
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toThrow(/legacy or invalid controller lease/);
    expect(await readFile(fixture.leasePath, "utf8")).toBe(before);
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({ present: true, malformed: true, owner: null });
    expect(
      spawnSync("git", [
        "-C",
        fixture.root,
        "rev-parse",
        "--verify",
        "--quiet",
        LEASE_REF,
      ]).status,
    ).toBe(1);
  });

  it("releases only when the ref still names the exact owner object", async () => {
    const fixture = await leaseFixture();
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    const replacementObjectId = writeLeaseObject(
      fixture.root,
      owner({ token: "replacement-token" }),
    );
    await expect(lease.release()).rejects.toThrow(
      /ownership changed or disappeared/,
    );
    expect(git(fixture.root, "rev-parse", "--verify", LEASE_REF)).toBe(
      replacementObjectId,
    );
    git(fixture.root, "update-ref", "-d", LEASE_REF, replacementObjectId);
    await expect(lease.release()).rejects.toThrow(
      /ownership changed or disappeared/,
    );
  });

  it("inspects an unreachable legacy guard as absent without weakening acquisition", async () => {
    const fixture = await leaseFixture();
    const obstructingAncestor = join(fixture.root, "artifacts", "orchestrator");
    const ancestorContents = Buffer.from("wrong-kind\n", "utf8");
    await mkdir(dirname(obstructingAncestor), { recursive: true });
    await writeFile(obstructingAncestor, ancestorContents);
    const refsBefore = git(
      fixture.root,
      "for-each-ref",
      "--format=%(refname)",
      LEASE_REF,
    );

    expect(await ControllerLease.inspect(fixture.root, STATE_PATH)).toEqual({
      path: fixture.leasePath,
      reference: LEASE_REF,
      legacyGuard: "absent",
      present: false,
      malformed: false,
      owner: null,
    });
    await expect(
      ControllerLease.acquire({
        repositoryRoot: fixture.root,
        statePath: STATE_PATH,
        operation: "run",
      }),
    ).rejects.toMatchObject({ code: "ENOTDIR" });
    expect(await readFile(obstructingAncestor)).toEqual(ancestorContents);
    expect(
      git(fixture.root, "for-each-ref", "--format=%(refname)", LEASE_REF),
    ).toBe(refsBefore);
  });

  it("inspects present, absent, malformed, and guard states read-only", async () => {
    const fixture = await leaseFixture();
    expect(await ControllerLease.inspect(fixture.root, STATE_PATH)).toEqual({
      path: fixture.leasePath,
      reference: LEASE_REF,
      legacyGuard: "absent",
      present: false,
      malformed: false,
      owner: null,
    });
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "canary",
    });
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({
      reference: LEASE_REF,
      legacyGuard: "present",
      present: true,
      malformed: false,
      owner: {
        pid: process.pid,
        hostname: hostname(),
        operation: "canary",
      },
    });
    await lease.release();
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({
      legacyGuard: "present",
      present: false,
      malformed: false,
      owner: null,
    });
    writeLeaseObject(fixture.root, "not-json");
    expect(
      await ControllerLease.inspect(fixture.root, STATE_PATH),
    ).toMatchObject({
      present: true,
      malformed: true,
      owner: null,
    });
  });

  it("does not publish the private lease ref during a normal all-branches push", async () => {
    const fixture = await leaseFixture();
    const remote = await mkdtemp(
      join(tmpdir(), "milestone-loop-lease-remote-"),
    );
    temporaryDirectories.push(remote);
    git(remote, "init", "--bare");
    git(fixture.root, "remote", "add", "origin", remote);
    const lease = await ControllerLease.acquire({
      repositoryRoot: fixture.root,
      statePath: STATE_PATH,
      operation: "run",
    });
    git(fixture.root, "push", "origin", "--all");
    const remoteRefs = git(remote, "show-ref");
    expect(remoteRefs).toContain("refs/heads/fixture");
    expect(remoteRefs).not.toContain("refs/milestone-loop/");
    expect(git(fixture.root, "rev-parse", "--verify", LEASE_REF)).toMatch(
      /^[0-9a-f]{40,64}$/u,
    );
    await lease.release();
  });
});
