import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  atomicWriteJson,
  migrateOrchestratorState,
  StaleStateError,
  StateStore,
} from "./state-store.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { GitPrivateRefStore } from "./private-ref-store.js";
import { legacyProposal, validProposal, validState } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];
const STATE_REF = "refs/milestone-loop/state";
const repositoryRoot = resolve(import.meta.dirname, "../../..");

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "milestone-loop-state-"));
  temporaryDirectories.push(directory);
  const initialized = spawnSync(
    "git",
    ["-C", directory, "init", "--initial-branch=fixture"],
    { encoding: "utf8", windowsHide: true },
  );
  if (initialized.status !== 0)
    throw new Error(
      `Could not initialize state fixture: ${initialized.stderr}`,
    );
  return directory;
}

function stateRef(directory: string): string | null {
  const result = spawnSync(
    "git",
    ["-C", directory, "rev-parse", "--verify", "--quiet", STATE_REF],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status === 1) return null;
  if (result.status !== 0)
    throw new Error(`Could not read state ref: ${result.stderr}`);
  return result.stdout.trim();
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

describe("atomic state persistence", () => {
  it("validates and round trips versioned state with monotonic revision", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(
      directory,
      "artifacts/orchestrator/state/state.json",
      () => "2026-08-01T00:00:01.000Z",
    );
    const initial = await store.initialize(validState(directory));
    expect(initial.revision).toBe(0);
    const saved = await store.save(initial);
    expect(saved.revision).toBe(1);
    await expect(store.load()).resolves.toEqual(saved);
  });

  it("rejects a stale concurrent writer and keeps the first update durable", async () => {
    const directory = await temporaryDirectory();
    const relativePath = "artifacts/orchestrator/state/state.json";
    const first = new StateStore(
      directory,
      relativePath,
      () => "2026-08-05T00:00:01.000Z",
    );
    const second = new StateStore(
      directory,
      relativePath,
      () => "2026-08-05T00:00:02.000Z",
    );
    await first.initialize(validState(directory));
    const loadedByFirst = await first.loadForMutation();
    const loadedBySecond = await second.loadForMutation();
    if (!loadedByFirst || !loadedBySecond)
      throw new Error("Both writers must load the initialized state.");

    const firstSaved = await first.save({
      ...loadedByFirst,
      nextAllowedAction: "start-milestone",
    });
    expect(firstSaved.revision).toBe(1);

    await expect(
      second.save({ ...loadedBySecond, nextAllowedAction: "stop" }),
    ).rejects.toThrow(StaleStateError);
    await expect(
      second.save({ ...loadedBySecond, nextAllowedAction: "stop" }),
    ).rejects.toThrow(/No merge was attempted/);

    const durable = await first.load();
    expect(durable?.revision).toBe(1);
    expect(durable?.nextAllowedAction).toBe("start-milestone");

    const refreshed = await second.loadForMutation();
    if (!refreshed) throw new Error("Durable state must reload.");
    const secondSaved = await second.save({
      ...refreshed,
      nextAllowedAction: "stop",
    });
    expect(secondSaved.revision).toBe(2);
  }, 20_000);

  it("allows exactly one writer released after the same generation observation", async () => {
    const directory = await temporaryDirectory();
    const relativePath = "artifacts/orchestrator/state/state.json";
    const first = new StateStore(directory, relativePath);
    const second = new StateStore(directory, relativePath);
    await first.initialize(validState(directory));
    const firstState = await first.loadForMutation();
    const secondState = await second.loadForMutation();
    if (!firstState || !secondState)
      throw new Error("Both writers must observe the initial generation.");

    let observedCount = 0;
    let releaseWriters!: () => void;
    const writersReleased = new Promise<void>((resolveWriters) => {
      releaseWriters = resolveWriters;
    });
    const afterObservedGeneration = async () => {
      observedCount += 1;
      if (observedCount === 2) releaseWriters();
      await writersReleased;
    };
    const outcomes = await Promise.allSettled([
      first.save(
        { ...firstState, nextAllowedAction: "start-milestone" },
        { afterObservedGeneration },
      ),
      second.save(
        { ...secondState, nextAllowedAction: "stop" },
        { afterObservedGeneration },
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
  });

  it("allows exactly one barrier-synchronized multiprocess writer", async () => {
    const directory = await temporaryDirectory();
    const relativePath = "artifacts/orchestrator/state/state.json";
    await new StateStore(directory, relativePath).initialize(
      validState(directory),
    );
    const barrier = join(directory, "barrier");
    await mkdir(barrier);
    const scriptPath = join(directory, "state-race-child.mjs");
    const moduleUrl = pathToFileURL(
      resolve(import.meta.dirname, "state-store.ts"),
    ).href;
    await writeFile(
      scriptPath,
      [
        `import { access, writeFile } from "node:fs/promises";`,
        `import { join } from "node:path";`,
        `import { setTimeout as delay } from "node:timers/promises";`,
        `import { StateStore } from ${JSON.stringify(moduleUrl)};`,
        `const [root, relativePath, barrier, identity] = process.argv.slice(2);`,
        `async function wait(path) {`,
        `  for (;;) {`,
        `    try { await access(path); return; } catch { await delay(10); }`,
        `  }`,
        `}`,
        `try {`,
        `  const store = new StateStore(root, relativePath, () => "2026-08-05T00:00:01.000Z");`,
        `  const state = await store.loadForMutation();`,
        `  if (!state) throw new Error("missing state");`,
        `  await store.save({ ...state, nextAllowedAction: identity === "a" ? "stop" : "start-milestone" }, {`,
        `    afterObservedGeneration: async () => {`,
        `      await writeFile(join(barrier, \`observed-\${identity}\`), "observed\\n", { flag: "a" });`,
        `      await wait(join(barrier, "release"));`,
        `    },`,
        `  });`,
        `  process.stdout.write("SAVED\\n");`,
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
          directory,
          relativePath,
          barrier,
          identity,
        ],
        { cwd: repositoryRoot, windowsHide: true },
      ),
    );
    const lines = children.map(firstLine);
    await Promise.all(
      ["a", "b"].map((identity) =>
        waitForPath(join(barrier, `observed-${identity}`)),
      ),
    );
    await writeFile(join(barrier, "release"), "release\n", "utf8");
    const outcomes = await Promise.all(lines);
    expect(outcomes.filter((line) => line === "SAVED")).toHaveLength(1);
    const refused = outcomes.filter((line) => line.startsWith("REFUSED:"));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/Canonical controller state advanced/);
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
    await expect(
      new StateStore(directory, relativePath).load(),
    ).resolves.toMatchObject({ revision: 1 });
  }, 60_000);

  it("keeps canonical state across save crash boundaries and repairs its mirror", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const initial = await store.initialize(validState(directory));
    const initialRef = stateRef(directory);
    const initialMirror = await readFile(store.path, "utf8");

    await expect(
      store.save(
        { ...initial, nextAllowedAction: "start-milestone" },
        {
          afterObjectCreated() {
            throw new Error("crash before ref");
          },
        },
      ),
    ).rejects.toThrow(/crash before ref/);
    expect(stateRef(directory)).toBe(initialRef);
    expect(await readFile(store.path, "utf8")).toBe(initialMirror);

    await expect(
      store.save(
        { ...initial, nextAllowedAction: "start-milestone" },
        {
          afterReferenceUpdated() {
            throw new Error("crash after ref");
          },
        },
      ),
    ).rejects.toThrow(/crash after ref/);
    expect(stateRef(directory)).not.toBe(initialRef);
    expect(await readFile(store.path, "utf8")).toBe(initialMirror);

    const restarted = new StateStore(directory, "state.json");
    await expect(restarted.load()).resolves.toMatchObject({
      revision: 1,
      nextAllowedAction: "start-milestone",
    });
    expect(await readFile(store.path, "utf8")).toBe(initialMirror);
    await restarted.loadForMutation();
    expect(JSON.parse(await readFile(store.path, "utf8"))).toMatchObject({
      revision: 1,
      nextAllowedAction: "start-milestone",
    });
  });

  it("imports valid legacy bytes once and never lets a mirror override the ref", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const legacyState = validState(directory);
    const legacyBytes = `  ${JSON.stringify(legacyState)}\n`;
    await writeFile(store.path, legacyBytes, "utf8");

    await expect(store.load()).resolves.toEqual(legacyState);
    expect(stateRef(directory)).toBeNull();
    expect(await readFile(store.path, "utf8")).toBe(legacyBytes);
    await expect(store.loadForMutation()).resolves.toEqual(legacyState);
    const importedRef = stateRef(directory);
    expect(importedRef).toMatch(/^[0-9a-f]{40,64}$/u);
    expect(store.sourceStateBytes().toString("utf8")).toBe(legacyBytes);

    const falseMirror = {
      ...legacyState,
      nextAllowedAction: "stop" as const,
    };
    await writeFile(store.path, `${JSON.stringify(falseMirror)}\n`, "utf8");
    const restarted = new StateStore(directory, "state.json");
    await expect(restarted.load()).resolves.toEqual(legacyState);
    expect(stateRef(directory)).toBe(importedRef);
    expect(JSON.parse(await readFile(store.path, "utf8"))).toMatchObject({
      nextAllowedAction: "stop",
    });
    await restarted.loadForMutation();
    expect(stateRef(directory)).toBe(importedRef);
    expect(JSON.parse(await readFile(store.path, "utf8"))).toMatchObject({
      nextAllowedAction: legacyState.nextAllowedAction,
    });
    expect(restarted.sourceStateBytes().toString("utf8")).toBe(legacyBytes);
  });

  it("keeps read-only loads mutation-free for missing and malformed mirrors", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const canonical = await store.initialize(validState(directory));
    const canonicalRef = stateRef(directory);

    await rm(store.path);
    const missingMirrorReader = new StateStore(directory, "state.json");
    await expect(missingMirrorReader.load()).resolves.toEqual(canonical);
    await expect(readFile(store.path, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(stateRef(directory)).toBe(canonicalRef);
    await missingMirrorReader.loadForMutation();
    expect(JSON.parse(await readFile(store.path, "utf8"))).toEqual(canonical);

    await writeFile(store.path, "{", "utf8");
    const malformedMirrorReader = new StateStore(directory, "state.json");
    await expect(malformedMirrorReader.load()).resolves.toEqual(canonical);
    expect(await readFile(store.path, "utf8")).toBe("{");
    expect(stateRef(directory)).toBe(canonicalRef);
    await malformedMirrorReader.loadForMutation();
    expect(JSON.parse(await readFile(store.path, "utf8"))).toEqual(canonical);
  });

  it("never authorizes state publication through the read-only load API", async () => {
    const directory = await temporaryDirectory();
    const initial = await new StateStore(directory, "state.json").initialize(
      validState(directory),
    );
    const canonicalRef = stateRef(directory);
    const mirrorBytes = await readFile(join(directory, "state.json"), "utf8");
    const reader = new StateStore(directory, "state.json");
    const observed = await reader.load();
    if (!observed) throw new Error("Canonical state must be readable.");

    await expect(
      reader.save({ ...observed, nextAllowedAction: "stop" }),
    ).rejects.toThrow(/read-only load\(\) never authorizes a write/);
    expect(stateRef(directory)).toBe(canonicalRef);
    expect(await readFile(join(directory, "state.json"), "utf8")).toBe(
      mirrorBytes,
    );
    await expect(
      new StateStore(directory, "state.json").load(),
    ).resolves.toEqual(initial);
  });

  it("rejects linked mirror paths without reading or repairing outside the repository", async () => {
    const directory = await temporaryDirectory();
    const outside = await mkdtemp(join(tmpdir(), "milestone-loop-outside-"));
    temporaryDirectories.push(outside);
    const outsideStatePath = join(outside, "state.json");
    const outsideBytes = `${JSON.stringify(validState(directory))}\n`;
    await writeFile(outsideStatePath, outsideBytes, "utf8");
    await symlink(outside, join(directory, "linked"), "junction");

    const linkedLegacy = new StateStore(directory, "linked/state.json");
    await expect(linkedLegacy.load()).rejects.toThrow(/unsafe linked path/);
    expect(stateRef(directory)).toBeNull();
    expect(await readFile(outsideStatePath, "utf8")).toBe(outsideBytes);

    const canonical = await new StateStore(directory, "state.json").initialize(
      validState(directory),
    );
    const linkedCanonical = new StateStore(directory, "linked/state.json");
    await expect(linkedCanonical.load()).resolves.toEqual(canonical);
    await expect(linkedCanonical.inspect()).resolves.toMatchObject({
      source: "canonical",
      mirror: "unsafe",
    });
    await expect(linkedCanonical.loadForMutation()).rejects.toThrow(
      /unsafe linked path/,
    );
    expect(await readFile(outsideStatePath, "utf8")).toBe(outsideBytes);
  });

  it("rejects a mirror path that lexically escapes the repository", async () => {
    const directory = await temporaryDirectory();
    expect(() => new StateStore(directory, "../state.json")).toThrow(
      /mirror escapes the repository/,
    );
  });

  it("never falls back to a valid mirror when the canonical ref is malformed", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const mirrorBytes = `${JSON.stringify(validState(directory))}\n`;
    await writeFile(store.path, mirrorBytes, "utf8");
    const blob = spawnSync(
      "git",
      ["-C", directory, "hash-object", "-w", "--stdin"],
      { encoding: "utf8", input: "not a state commit\n", windowsHide: true },
    );
    expect(blob.status, blob.stderr).toBe(0);
    const update = spawnSync(
      "git",
      ["-C", directory, "update-ref", STATE_REF, blob.stdout.trim()],
      { encoding: "utf8", windowsHide: true },
    );
    expect(update.status, update.stderr).toBe(0);

    await expect(store.load()).rejects.toThrow(/rather than a commit/);
    await expect(store.loadForMutation()).rejects.toThrow(
      /rather than a commit/,
    );
    expect(await readFile(store.path, "utf8")).toBe(mirrorBytes);
  });

  it("rejects saving over missing durable state", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    await expect(store.save(validState(directory))).rejects.toThrow(
      /mutations must go through initialization/,
    );
  });

  it("initializes exclusively, returns the winner, and repairs its mirror", async () => {
    const directory = await temporaryDirectory();
    const relativePath = "state.json";
    const winner = new StateStore(directory, relativePath);
    const loser = new StateStore(directory, relativePath);
    const winnerState = validState(directory);
    const initialized = await winner.initialize(winnerState);
    expect(initialized.revision).toBe(0);

    const loserState = {
      ...validState(directory),
      nextAllowedAction: "stop" as const,
    };
    const observed = await loser.initialize(loserState);
    expect(observed.nextAllowedAction).toBe(winnerState.nextAllowedAction);
    expect(JSON.parse(await readFile(winner.path, "utf8"))).toMatchObject({
      nextAllowedAction: winnerState.nextAllowedAction,
    });

    await writeFile(winner.path, '{"schemaVersion":"0.0.0"}\n', "utf8");
    const readOnly = new StateStore(directory, relativePath);
    await expect(readOnly.load()).resolves.toMatchObject({
      nextAllowedAction: winnerState.nextAllowedAction,
    });
    expect(await readFile(winner.path, "utf8")).toBe(
      '{"schemaVersion":"0.0.0"}\n',
    );
    await expect(loser.initialize(loserState)).resolves.toMatchObject({
      nextAllowedAction: winnerState.nextAllowedAction,
    });
    expect(JSON.parse(await readFile(winner.path, "utf8"))).toMatchObject({
      nextAllowedAction: winnerState.nextAllowedAction,
    });
  });

  it("recovers every initialization crash boundary from the canonical ref", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    await expect(
      store.initialize(validState(directory), {
        beforeObjectCreation() {
          throw new Error("before object");
        },
      }),
    ).rejects.toThrow(/before object/);
    expect(stateRef(directory)).toBeNull();
    await expect(readFile(store.path, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      store.initialize(validState(directory), {
        afterObjectCreated() {
          throw new Error("after object");
        },
      }),
    ).rejects.toThrow(/after object/);
    expect(stateRef(directory)).toBeNull();
    await expect(readFile(store.path, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      store.initialize(validState(directory), {
        afterReferenceUpdated() {
          throw new Error("after ref");
        },
      }),
    ).rejects.toThrow(/after ref/);
    expect(stateRef(directory)).toMatch(/^[0-9a-f]{40,64}$/u);
    await expect(readFile(store.path, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    const restarted = new StateStore(directory, "state.json");
    await expect(restarted.load()).resolves.toMatchObject({ revision: 0 });
    await expect(readFile(store.path, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(restarted.loadForMutation()).resolves.toMatchObject({
      revision: 0,
    });
    expect(JSON.parse(await readFile(store.path, "utf8"))).toMatchObject({
      revision: 0,
    });
  });

  it("leaves the prior durable file intact when replacement is interrupted", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "state.json");
    await writeFile(target, '{"generation":"old"}\n', "utf8");
    await expect(
      atomicWriteJson(
        target,
        { generation: "new" },
        {
          beforeRename() {
            throw new Error("injected interruption");
          },
        },
      ),
    ).rejects.toThrow(/injected interruption/);
    expect(await readFile(target, "utf8")).toBe('{"generation":"old"}\n');
    expect(
      (await readdir(directory)).filter((name) => name.includes(".tmp-")),
    ).toEqual([]);
  });

  it("retries transient replacement contention before publishing", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "state.json");
    await writeFile(target, '{"generation":"old"}\n', "utf8");
    let attempts = 0;
    const retryDelays: number[] = [];

    await atomicWriteJson(
      target,
      { generation: "new" },
      {
        async replaceFile(temporaryPath, targetPath) {
          attempts += 1;
          if (attempts < 3) {
            throw Object.assign(new Error("simulated scanner contention"), {
              code: "EPERM",
            });
          }
          await rename(temporaryPath, targetPath);
        },
        waitBeforeReplaceRetry(delayMs) {
          retryDelays.push(delayMs);
        },
      },
    );

    expect(attempts).toBe(3);
    expect(retryDelays).toEqual([25, 50]);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
      generation: "new",
    });
    expect(
      (await readdir(directory)).filter((name) => name.includes(".tmp-")),
    ).toEqual([]);
  });

  it("fails closed after bounded persistent replacement contention", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "state.json");
    await writeFile(target, '{"generation":"old"}\n', "utf8");
    let attempts = 0;

    await expect(
      atomicWriteJson(
        target,
        { generation: "new" },
        {
          replaceFile() {
            attempts += 1;
            throw Object.assign(new Error("persistent access denial"), {
              code: "EPERM",
            });
          },
          waitBeforeReplaceRetry() {},
        },
      ),
    ).rejects.toThrow(/persistent access denial/);

    expect(attempts).toBe(9);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
      generation: "old",
    });
    expect(
      (await readdir(directory)).filter((name) => name.includes(".tmp-")),
    ).toEqual([]);
  });

  it("rejects malformed stored state rather than guessing a recovery", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const malformed = '{"schemaVersion":"0.0.0"}\n';
    await writeFile(store.path, malformed, "utf8");
    await expect(store.load()).rejects.toThrow(/Invalid orchestrator state/);
    await expect(store.loadForMutation()).rejects.toThrow(
      /Invalid orchestrator state/,
    );
    expect(stateRef(directory)).toBeNull();
    expect(await readFile(store.path, "utf8")).toBe(malformed);
  });

  it("virtually reads a canonical 1.4 generation and durably upgrades on the next CAS save", async () => {
    const directory = await temporaryDirectory();
    const prior = JSON.parse(JSON.stringify(validState(directory))) as Record<
      string,
      unknown
    >;
    prior["schemaVersion"] = "1.4.0";
    delete prior["pendingOperation"];
    const stateJson = `${JSON.stringify(prior, null, 2)}\n`;
    const stateSha256 = createHash("sha256")
      .update(stateJson, "utf8")
      .digest("hex");
    const refs = new GitPrivateRefStore(directory, STATE_REF);
    const metadataJson = `${JSON.stringify(
      {
        schemaVersion: "1.0.0",
        revision: 0,
        stateSha256,
        legacySourceSha256: null,
        previousGeneration: null,
      },
      null,
      2,
    )}\n`;
    const tree = refs.writeTree([
      {
        mode: "100644",
        type: "blob",
        objectId: refs.writeBlob(metadataJson),
        name: "metadata.json",
      },
      {
        mode: "100644",
        type: "blob",
        objectId: refs.writeBlob(stateJson),
        name: "state.json",
      },
    ]);
    const priorGeneration = refs.writeCommit({
      treeObjectId: tree,
      parentObjectId: null,
      timestamp: String(prior["updatedAt"]),
      message: `milestone-loop state revision 0\n\nstate-sha256: ${stateSha256}\n`,
    });
    expect(refs.compareAndSwap(null, priorGeneration)).toBe(true);

    const readOnly = new StateStore(directory, "state.json");
    await expect(readOnly.load()).resolves.toMatchObject({
      schemaVersion: "1.7.0",
      revision: 0,
      pendingOperation: null,
    });
    expect(stateRef(directory)).toBe(priorGeneration);

    const mutable = new StateStore(directory, "state.json");
    const migrated = await mutable.loadForMutation();
    expect(migrated).not.toBeNull();
    const saved = await mutable.save(migrated!);
    expect(saved).toMatchObject({
      schemaVersion: "1.7.0",
      revision: 1,
      pendingOperation: null,
    });
    expect(stateRef(directory)).not.toBe(priorGeneration);
    expect(
      spawnSync(
        "git",
        ["-C", directory, "rev-parse", `${stateRef(directory)}^`],
        { encoding: "utf8", windowsHide: true },
      ).stdout.trim(),
    ).toBe(priorGeneration);
  });

  it("preserves an existing 1.5 pending operation while advancing only the schema", () => {
    const prior = {
      ...validState(resolve(process.cwd(), "state-migration-fixture")),
      schemaVersion: "1.5.0",
      pendingOperation: {
        kind: "workspace-create",
        id: "preserved-operation",
        phase: "clone-started",
      },
    };
    expect(migrateOrchestratorState(prior)).toEqual({
      ...prior,
      schemaVersion: "1.7.0",
    });
  });

  it("preserves an existing 1.6 pending operation while advancing to 1.7", () => {
    const prior = {
      ...validState(resolve(process.cwd(), "state-1.6-migration-fixture")),
      schemaVersion: "1.6.0",
      pendingOperation: {
        kind: "target-integrate",
        id: "preserved-target-operation",
        phase: "target-update-started",
      },
    };
    expect(migrateOrchestratorState(prior)).toEqual({
      ...prior,
      schemaVersion: "1.7.0",
    });
  });

  it("migrates the prior state schema without losing recoverable controller state", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const legacy = JSON.parse(JSON.stringify(validState(directory))) as Record<
      string,
      unknown
    >;
    const milestone = createMilestoneRecord(
      legacyProposal("1.0.0"),
      "2026-08-01T00:00:00.000Z",
    );
    const historicalMilestone = { ...milestone } as Record<string, unknown>;
    delete historicalMilestone["proposalProvenance"];
    legacy["milestones"] = [
      {
        ...historicalMilestone,
        status: "completed",
        attempts: 1,
        workerThreadId: "pre-policy-thread",
        timestamps: {
          ...milestone.timestamps,
          startedAt: "2026-08-01T00:00:01.000Z",
          completedAt: "2026-08-01T00:00:02.000Z",
        },
        nextAllowedAction: "plan",
      },
    ];
    legacy["schemaVersion"] = "1.0.0";
    delete (legacy["run"] as Record<string, unknown>)["agentInvocations"];
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");
    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: "1.7.0",
      pendingOperation: null,
      run: { agentInvocations: [] },
      evidenceRetention: {
        schemaVersion: "1.0.0",
        initializedAt: null,
        legacyRunIds: [],
      },
      requiredNextVerticalConsumer: null,
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
      milestones: [
        {
          proposalProvenance: {
            source: "legacy-unrecorded",
            sourcePath: null,
            sourceSha256: null,
            plannerThreadId: null,
            recordedAt: "2026-08-01T00:00:00.000Z",
            reason: "State schema predates proposal provenance.",
          },
          workerThreadLineage: [
            {
              threadId: "pre-policy-thread",
              model: "legacy-unrecorded",
              reasoningEffort: "legacy-unrecorded",
            },
          ],
        },
      ],
    });
  });

  it("grandfathers pre-cleanup workspaces and evidence as legacy-preserved", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const legacy = JSON.parse(JSON.stringify(validState(directory))) as Record<
      string,
      unknown
    >;
    const milestone = createMilestoneRecord(
      legacyProposal("1.0.0"),
      "2026-08-01T00:00:00.000Z",
    );
    const historicalMilestone = { ...milestone } as Record<string, unknown>;
    delete historicalMilestone["proposalProvenance"];
    legacy["schemaVersion"] = "1.1.0";
    delete legacy["evidenceRetention"];
    legacy["milestones"] = [
      {
        ...historicalMilestone,
        status: "completed",
        workspace: {
          isolation: "standalone-local-clone-branch",
          path: join(directory, "artifacts", "workspaces", "legacy"),
          branch: "milestone-loop/legacy/workspace",
          baseCommit: "a".repeat(40),
          headCommit: "b".repeat(40),
          createdAt: "2026-08-01T00:00:00.000Z",
          preserved: true,
        },
        timestamps: {
          ...milestone.timestamps,
          completedAt: "2026-08-01T00:00:02.000Z",
        },
        nextAllowedAction: "stop",
      },
    ];
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: "1.7.0",
      pendingOperation: null,
      evidenceRetention: {
        initializedAt: null,
        legacyRunIds: [],
      },
      requiredNextVerticalConsumer: null,
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
      milestones: [
        {
          proposalProvenance: {
            source: "legacy-unrecorded",
            recordedAt: "2026-08-01T00:00:00.000Z",
            reason: "State schema predates proposal provenance.",
          },
          workspace: {
            preserved: true,
            cleanup: {
              status: "legacy-preserved",
              reason: "legacy-pre-policy",
            },
          },
        },
      ],
    });
  });

  it("migrates 1.2 state without changing prior controller facts or accepting injected reconciliation history", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const current = validState(directory);
    const legacy = JSON.parse(JSON.stringify(current)) as Record<
      string,
      unknown
    >;
    legacy["schemaVersion"] = "1.2.0";
    legacy["run"] = {
      ...(legacy["run"] as Record<string, unknown>),
      status: "stopped",
      finishedAt: "2026-08-01T00:00:02.000Z",
      stopReason: "truthful-prior-stop",
    };
    legacy["controllerHistory"] = [{ fabricated: true }];
    legacy["reconciliation"] = { active: { fabricated: true }, history: [] };
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: "1.7.0",
      pendingOperation: null,
      revision: current.revision,
      repository: current.repository,
      queue: current.queue,
      milestones: current.milestones,
      run: {
        status: "stopped",
        finishedAt: "2026-08-01T00:00:02.000Z",
        stopReason: "truthful-prior-stop",
      },
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
    });
  });

  it("migrates 1.3 state by marking prior verification summaries as unpinned", async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory, "state.json");
    const current = validState(directory);
    const milestone = JSON.parse(
      JSON.stringify(
        createMilestoneRecord(validProposal(), "2026-08-01T00:00:00.000Z"),
      ),
    ) as Record<string, unknown>;
    const legacySummary = {
      schemaVersion: "1.0.0",
      attempt: 1,
      status: "PASS",
      disposition: "incremental-readiness",
      failureKind: null,
      summary: "Pre-fence verification evidence.",
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:00:01.000Z",
      commands: [],
      authoritative: null,
      changedPaths: ["tools/example.ts"],
      artifactPaths: ["verification/verification-summary.json"],
    };
    milestone["verificationSummaries"] = [legacySummary];
    const legacy = JSON.parse(JSON.stringify(current)) as Record<
      string,
      unknown
    >;
    legacy["schemaVersion"] = "1.3.0";
    legacy["milestones"] = [milestone];
    legacy["queue"] = [
      (milestone["proposal"] as Record<string, unknown>)["id"],
    ];
    await writeFile(store.path, `${JSON.stringify(legacy)}\n`, "utf8");

    const migrated = await store.load();
    expect(migrated).toMatchObject({
      schemaVersion: "1.7.0",
      pendingOperation: null,
    });
    const summaries = migrated?.milestones[0]?.verificationSummaries;
    expect(summaries).toHaveLength(1);
    expect(summaries?.[0]).toMatchObject({
      schemaVersion: "1.1.0",
      attempt: 1,
      status: "PASS",
      summary: "Pre-fence verification evidence.",
      candidate: null,
      authoritativeResultSha256: null,
      changedPaths: ["tools/example.ts"],
    });
  });
});
