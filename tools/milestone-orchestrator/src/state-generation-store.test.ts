import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GitPrivateRefStore, STATE_REF } from "./private-ref-store.js";
import { GitStateGenerationStore } from "./state-generation-store.js";
import { validState } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(
  repository: string,
  args: readonly string[],
  input?: string,
  environment?: NodeJS.ProcessEnv,
): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    env: environment ? { ...process.env, ...environment } : process.env,
    input,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}

async function repositoryFixture(bare = false): Promise<string> {
  const root = await mkdtemp(
    join(tmpdir(), bare ? "milestone-state-bare-" : "milestone-state-git-"),
  );
  temporaryDirectories.push(root);
  git(root, ["init", ...(bare ? ["--bare"] : ["--initial-branch=fixture"])]);
  if (!bare) {
    git(root, ["config", "user.name", "State Fixture"]);
    git(root, ["config", "user.email", "state@example.invalid"]);
    git(root, ["commit", "--allow-empty", "-m", "fixture"]);
  }
  return root;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function writeRawGeneration(input: {
  readonly root: string;
  readonly state: unknown;
  readonly metadata: Record<string, unknown>;
  readonly parent?: string | null;
  readonly message?: string;
}): string {
  const refs = new GitPrivateRefStore(input.root, STATE_REF);
  const metadataObjectId = refs.writeBlob(serialize(input.metadata));
  const stateObjectId = refs.writeBlob(serialize(input.state));
  const treeObjectId = refs.writeTree([
    {
      mode: "100644",
      type: "blob",
      objectId: metadataObjectId,
      name: "metadata.json",
    },
    {
      mode: "100644",
      type: "blob",
      objectId: stateObjectId,
      name: "state.json",
    },
  ]);
  return refs.writeCommit({
    treeObjectId,
    parentObjectId: input.parent ?? null,
    timestamp:
      typeof input.state === "object" &&
      input.state !== null &&
      "updatedAt" in input.state &&
      typeof input.state.updatedAt === "string"
        ? input.state.updatedAt
        : "2026-08-05T00:00:00.000Z",
    message:
      input.message ??
      `milestone-loop state revision ${String(input.metadata["revision"])}\n\nstate-sha256: ${String(input.metadata["stateSha256"])}`,
  });
}

describe("canonical Git state generations", () => {
  it("roots complete current and previous generations through commit ancestry", async () => {
    const root = await repositoryFixture();
    const store = new GitStateGenerationStore(root);
    const firstState = validState(root);
    const first = store.createGeneration(firstState, null);
    expect(store.publish(null, first.objectId)).toBe(true);
    const secondState = {
      ...firstState,
      revision: 1,
      nextAllowedAction: "stop" as const,
      updatedAt: "2026-08-05T00:00:01.000Z",
    };
    const second = store.createGeneration(secondState, first.objectId);
    expect(store.publish(first.objectId, second.objectId)).toBe(true);

    expect(store.readCurrent()).toEqual(second);
    expect(store.readGeneration(first.objectId).state).toEqual(firstState);
    expect(
      git(root, ["rev-list", "--parents", "-n", "1", second.objectId]),
    ).toBe(`${second.objectId} ${first.objectId}`);
    expect(git(root, ["cat-file", "-t", first.objectId])).toBe("commit");
  });

  it("refuses a non-commit canonical ref target", async () => {
    const root = await repositoryFixture();
    const refs = new GitPrivateRefStore(root, STATE_REF);
    const blob = refs.writeBlob("not a state generation\n");
    git(root, ["update-ref", STATE_REF, blob]);
    expect(() => new GitStateGenerationStore(root).readCurrent()).toThrow(
      /rather than a commit/,
    );
    expect(git(root, ["rev-parse", "--verify", STATE_REF])).toBe(blob);
  });

  it("refuses extra tree entries", async () => {
    const root = await repositoryFixture();
    const refs = new GitPrivateRefStore(root, STATE_REF);
    const state = validState(root);
    const stateJson = serialize(state);
    const metadata = {
      schemaVersion: "1.0.0",
      revision: 0,
      stateSha256: sha256(stateJson),
      legacySourceSha256: null,
      previousGeneration: null,
    };
    const metadataObject = refs.writeBlob(serialize(metadata));
    const stateObject = refs.writeBlob(stateJson);
    const extraObject = refs.writeBlob("unexpected\n");
    const tree = git(
      root,
      ["mktree"],
      [
        `100644 blob ${extraObject}\textra.txt`,
        `100644 blob ${metadataObject}\tmetadata.json`,
        `100644 blob ${stateObject}\tstate.json`,
        "",
      ].join("\n"),
    );
    const commit = refs.writeCommit({
      treeObjectId: tree,
      parentObjectId: null,
      timestamp: state.updatedAt,
      message: "invalid tree",
    });
    git(root, ["update-ref", STATE_REF, commit]);
    expect(() => new GitStateGenerationStore(root).readCurrent()).toThrow(
      /invalid canonical tree/,
    );
  });

  it.each([
    {
      name: "state hash",
      metadata: (_stateJson: string) => ({
        schemaVersion: "1.0.0",
        revision: 0,
        stateSha256: "0".repeat(64),
        legacySourceSha256: null,
        previousGeneration: null,
      }),
      expected: /recorded state hash/,
    },
    {
      name: "revision",
      metadata: (stateJson: string) => ({
        schemaVersion: "1.0.0",
        revision: 1,
        stateSha256: sha256(stateJson),
        legacySourceSha256: null,
        previousGeneration: null,
      }),
      expected: /revision does not match/,
    },
  ])("refuses mismatched $name metadata", async ({ metadata, expected }) => {
    const root = await repositoryFixture();
    const state = validState(root);
    const commit = writeRawGeneration({
      root,
      state,
      metadata: metadata(serialize(state)),
    });
    git(root, ["update-ref", STATE_REF, commit]);
    expect(() => new GitStateGenerationStore(root).readCurrent()).toThrow(
      expected,
    );
  });

  it("refuses a commit parent that disagrees with metadata", async () => {
    const root = await repositoryFixture();
    const generations = new GitStateGenerationStore(root);
    const first = generations.createGeneration(validState(root), null);
    const secondState = {
      ...validState(root),
      revision: 1,
      updatedAt: "2026-08-05T00:00:01.000Z",
    };
    const secondJson = serialize(secondState);
    const malformed = writeRawGeneration({
      root,
      state: secondState,
      parent: first.objectId,
      metadata: {
        schemaVersion: "1.0.0",
        revision: 1,
        stateSha256: sha256(secondJson),
        legacySourceSha256: null,
        previousGeneration: null,
      },
    });
    git(root, ["update-ref", STATE_REF, malformed]);
    expect(() => generations.readCurrent()).toThrow(/parent does not match/);
  });

  it("validates the immediately previous rooted generation", async () => {
    const root = await repositoryFixture();
    const generations = new GitStateGenerationStore(root);
    const firstState = validState(root);
    const malformedPrevious = writeRawGeneration({
      root,
      state: firstState,
      metadata: {
        schemaVersion: "1.0.0",
        revision: 0,
        stateSha256: "0".repeat(64),
        legacySourceSha256: null,
        previousGeneration: null,
      },
    });
    const secondState = {
      ...firstState,
      revision: 1,
      updatedAt: "2026-08-05T00:00:01.000Z",
    };
    const secondJson = serialize(secondState);
    const current = writeRawGeneration({
      root,
      state: secondState,
      parent: malformedPrevious,
      metadata: {
        schemaVersion: "1.0.0",
        revision: 1,
        stateSha256: sha256(secondJson),
        legacySourceSha256: null,
        previousGeneration: malformedPrevious,
      },
    });
    git(root, ["update-ref", STATE_REF, current]);
    expect(() => generations.readCurrent()).toThrow(/recorded state hash/);
  });

  it("refuses a current generation that skips its predecessor revision", async () => {
    const root = await repositoryFixture();
    const generations = new GitStateGenerationStore(root);
    const firstState = validState(root);
    const first = generations.createGeneration(firstState, null);
    const skippedState = {
      ...firstState,
      revision: 2,
      updatedAt: "2026-08-05T00:00:02.000Z",
    };
    const skippedJson = serialize(skippedState);
    const skipped = writeRawGeneration({
      root,
      state: skippedState,
      parent: first.objectId,
      metadata: {
        schemaVersion: "1.0.0",
        revision: 2,
        stateSha256: sha256(skippedJson),
        legacySourceSha256: null,
        previousGeneration: first.objectId,
      },
    });
    git(root, ["update-ref", STATE_REF, skipped]);

    expect(() => generations.readCurrent()).toThrow(
      /not the exact revision successor/,
    );
  });

  it("refuses invalid canonical state even when its metadata hash agrees", async () => {
    const root = await repositoryFixture();
    const invalidState = { schemaVersion: "0.0.0", revision: 0 };
    const stateJson = serialize(invalidState);
    const commit = writeRawGeneration({
      root,
      state: invalidState,
      metadata: {
        schemaVersion: "1.0.0",
        revision: 0,
        stateSha256: sha256(stateJson),
        legacySourceSha256: null,
        previousGeneration: null,
      },
    });
    git(root, ["update-ref", STATE_REF, commit]);
    expect(() => new GitStateGenerationStore(root).readCurrent()).toThrow(
      /Invalid orchestrator state/,
    );
  });

  it("refuses a generation rewritten with a non-controller identity", async () => {
    const root = await repositoryFixture();
    const generations = new GitStateGenerationStore(root);
    const state = validState(root);
    const canonical = generations.createGeneration(state, null);
    const tree = git(root, ["show", "-s", "--format=%T", canonical.objectId]);
    const rewritten = git(
      root,
      ["commit-tree", tree],
      `milestone-loop state revision 0\n\nstate-sha256: ${canonical.metadata.stateSha256}\n`,
      {
        GIT_AUTHOR_NAME: "Untrusted Writer",
        GIT_AUTHOR_EMAIL: "writer@example.invalid",
        GIT_AUTHOR_DATE: state.updatedAt,
        GIT_COMMITTER_NAME: "Untrusted Writer",
        GIT_COMMITTER_EMAIL: "writer@example.invalid",
        GIT_COMMITTER_DATE: state.updatedAt,
      },
    );
    git(root, ["update-ref", STATE_REF, rewritten]);

    expect(() => generations.readCurrent()).toThrow(
      /canonical controller identity and timestamp/,
    );
  });

  it("refuses a generation with a non-canonical commit message", async () => {
    const root = await repositoryFixture();
    const state = validState(root);
    const stateJson = serialize(state);
    const malformed = writeRawGeneration({
      root,
      state,
      metadata: {
        schemaVersion: "1.0.0",
        revision: 0,
        stateSha256: sha256(stateJson),
        legacySourceSha256: null,
        previousGeneration: null,
      },
      message: "plausible but non-canonical state",
    });
    git(root, ["update-ref", STATE_REF, malformed]);

    expect(() => new GitStateGenerationStore(root).readCurrent()).toThrow(
      /canonical state commit message/,
    );
  });

  it("does not publish the private state ref during a normal all-branches push", async () => {
    const root = await repositoryFixture();
    const remote = await repositoryFixture(true);
    const generations = new GitStateGenerationStore(root);
    const generation = generations.createGeneration(validState(root), null);
    expect(generations.publish(null, generation.objectId)).toBe(true);
    git(root, ["remote", "add", "origin", remote]);
    git(root, ["push", "origin", "--all"]);
    const remoteRefs = git(remote, ["show-ref"]);
    expect(remoteRefs).toContain("refs/heads/fixture");
    expect(remoteRefs).not.toContain("refs/milestone-loop/");
    expect(git(root, ["rev-parse", "--verify", STATE_REF])).toBe(
      generation.objectId,
    );
  });
});
