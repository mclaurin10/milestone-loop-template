import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { OrchestratorState } from "./contracts.js";
import {
  GitPrivateRefStore,
  STATE_REF,
  type GitTreeEntry,
} from "./private-ref-store.js";
import { assertOrchestratorState } from "./schema.js";

const METADATA_KEYS = [
  "legacySourceSha256",
  "previousGeneration",
  "revision",
  "schemaVersion",
  "stateSha256",
] as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const COMMIT_IDENTITY = "Milestone Loop <milestone-loop@example.invalid>";

interface StateGenerationMetadata {
  readonly schemaVersion: "1.0.0";
  readonly revision: number;
  readonly stateSha256: string;
  readonly legacySourceSha256: string | null;
  readonly previousGeneration: string | null;
}

export interface StateGeneration {
  readonly objectId: string;
  readonly state: OrchestratorState;
  readonly stateJson: string;
  readonly legacySourceJson: string | null;
  readonly metadata: StateGenerationMetadata;
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function commitIdentity(timestamp: string): string {
  return `${COMMIT_IDENTITY} ${Math.floor(Date.parse(timestamp) / 1000)} +0000`;
}

function commitMessage(revision: number, stateSha256: string): string {
  return `milestone-loop state revision ${revision}\n\nstate-sha256: ${stateSha256}\n`;
}

function parseMetadata(
  raw: string,
  generationObjectId: string,
): StateGenerationMetadata {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `State generation ${generationObjectId} has malformed metadata JSON.`,
      { cause: error },
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `State generation ${generationObjectId} has malformed metadata.`,
    );
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== METADATA_KEYS.length ||
    keys.some((key, index) => key !== METADATA_KEYS[index]) ||
    record["schemaVersion"] !== "1.0.0" ||
    !Number.isSafeInteger(record["revision"]) ||
    Number(record["revision"]) < 0 ||
    typeof record["stateSha256"] !== "string" ||
    !SHA256_PATTERN.test(record["stateSha256"]) ||
    !(
      record["legacySourceSha256"] === null ||
      (typeof record["legacySourceSha256"] === "string" &&
        SHA256_PATTERN.test(record["legacySourceSha256"]))
    ) ||
    !(
      record["previousGeneration"] === null ||
      (typeof record["previousGeneration"] === "string" &&
        OBJECT_ID_PATTERN.test(record["previousGeneration"]))
    )
  )
    throw new Error(
      `State generation ${generationObjectId} has malformed metadata.`,
    );
  return record as unknown as StateGenerationMetadata;
}

function assertExactTree(
  entries: readonly GitTreeEntry[],
  generationObjectId: string,
  hasLegacySource: boolean,
): void {
  const expectedNames = hasLegacySource
    ? ["legacy-state.json", "metadata.json", "state.json"]
    : ["metadata.json", "state.json"];
  if (
    entries.length !== expectedNames.length ||
    entries.some(
      (entry, index) =>
        entry.mode !== "100644" ||
        entry.type !== "blob" ||
        entry.name !== expectedNames[index],
    )
  )
    throw new Error(
      `State generation ${generationObjectId} has an invalid canonical tree.`,
    );
}

export class GitStateGenerationStore {
  readonly repositoryRoot: string;
  readonly reference = STATE_REF;
  private readonly refs: GitPrivateRefStore;

  constructor(
    repositoryRoot: string,
    private readonly migrateState: (value: unknown) => unknown = (value) =>
      value,
  ) {
    this.repositoryRoot = resolve(repositoryRoot);
    this.refs = new GitPrivateRefStore(this.repositoryRoot, STATE_REF);
  }

  readReference(): string | null {
    return this.refs.readReference();
  }

  createGeneration(
    state: OrchestratorState,
    previousGeneration: string | null,
    legacySourceJson: string | null = null,
  ): StateGeneration {
    assertOrchestratorState(state);
    const stateJson = serializeJson(state);
    const metadata: StateGenerationMetadata = {
      schemaVersion: "1.0.0",
      revision: state.revision,
      stateSha256: sha256(stateJson),
      legacySourceSha256:
        legacySourceJson === null ? null : sha256(legacySourceJson),
      previousGeneration,
    };
    const metadataObjectId = this.refs.writeBlob(serializeJson(metadata));
    const stateObjectId = this.refs.writeBlob(stateJson);
    const treeEntries: GitTreeEntry[] = [
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
    ];
    if (legacySourceJson !== null)
      treeEntries.unshift({
        mode: "100644",
        type: "blob",
        objectId: this.refs.writeBlob(legacySourceJson),
        name: "legacy-state.json",
      });
    const treeObjectId = this.refs.writeTree(treeEntries);
    const objectId = this.refs.writeCommit({
      treeObjectId,
      parentObjectId: previousGeneration,
      timestamp: state.updatedAt,
      message: commitMessage(state.revision, metadata.stateSha256),
    });
    return { objectId, state, stateJson, legacySourceJson, metadata };
  }

  readGeneration(objectId: string, validatePrevious = true): StateGeneration {
    const commit = this.refs.readCommit(objectId);
    const metadata = parseMetadata(
      this.refs.readCommitFile(objectId, "metadata.json"),
      objectId,
    );
    assertExactTree(
      commit.entries,
      objectId,
      metadata.legacySourceSha256 !== null,
    );
    const stateJson = this.refs.readCommitFile(objectId, "state.json");
    if (sha256(stateJson) !== metadata.stateSha256)
      throw new Error(
        `State generation ${objectId} does not match its recorded state hash.`,
      );
    const legacySourceJson =
      metadata.legacySourceSha256 === null
        ? null
        : this.refs.readCommitFile(objectId, "legacy-state.json");
    if (
      legacySourceJson !== null &&
      sha256(legacySourceJson) !== metadata.legacySourceSha256
    )
      throw new Error(
        `State generation ${objectId} does not match its recorded legacy source hash.`,
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(stateJson) as unknown;
    } catch (error) {
      throw new Error(
        `State generation ${objectId} has malformed state JSON.`,
        {
          cause: error,
        },
      );
    }
    const state = assertOrchestratorState(this.migrateState(parsed));
    if (state.revision !== metadata.revision)
      throw new Error(
        `State generation ${objectId} revision does not match its metadata.`,
      );
    const expectedIdentity = commitIdentity(state.updatedAt);
    if (
      commit.author !== expectedIdentity ||
      commit.committer !== expectedIdentity
    )
      throw new Error(
        `State generation ${objectId} does not use the canonical controller identity and timestamp.`,
      );
    if (
      commit.message !== commitMessage(metadata.revision, metadata.stateSha256)
    )
      throw new Error(
        `State generation ${objectId} does not use the canonical state commit message.`,
      );
    const expectedParents =
      metadata.previousGeneration === null ? [] : [metadata.previousGeneration];
    if (
      commit.parentObjectIds.length !== expectedParents.length ||
      commit.parentObjectIds.some(
        (parent, index) => parent !== expectedParents[index],
      )
    )
      throw new Error(
        `State generation ${objectId} parent does not match its metadata.`,
      );
    if (metadata.previousGeneration !== null && validatePrevious) {
      const previous = this.readGeneration(metadata.previousGeneration, false);
      if (state.revision !== previous.state.revision + 1)
        throw new Error(
          `State generation ${objectId} is not the exact revision successor of ${metadata.previousGeneration}.`,
        );
    }
    return { objectId, state, stateJson, legacySourceJson, metadata };
  }

  readCurrent(): StateGeneration | null {
    const objectId = this.readReference();
    return objectId === null ? null : this.readGeneration(objectId);
  }

  publish(expectedGeneration: string | null, newGeneration: string): boolean {
    return this.refs.compareAndSwap(expectedGeneration, newGeneration);
  }
}
