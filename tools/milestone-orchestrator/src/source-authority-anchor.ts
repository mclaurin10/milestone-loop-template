import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { assertNoPendingAuthorityMigration } from "./authority-publication.mjs";
import {
  inspectSourceEpochSnapshot,
  SOURCE_APPROVAL_PATH,
  SOURCE_APPROVAL_SHA256,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
  SOURCE_SNAPSHOT_ROOT_FILES,
  type SourceEpochSnapshotInspection,
} from "./source-epoch-snapshot.js";

const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const READINESS_MARKER_PATH = ".agent/readiness-profile-activated.json";

export interface SourceAuthorityAnchorInspection {
  readonly schemaVersion: "source-authority-anchor-inspection.v1";
  readonly status: "PASS";
  readonly contractId: typeof SOURCE_CONTRACT_ID;
  readonly authorityEpoch: typeof SOURCE_EPOCH;
  readonly baseCommit: string;
  readonly candidateCommit: string;
  readonly snapshot: SourceEpochSnapshotInspection;
  readonly immutableContractLockSha256: string;
  readonly immutableContractLockBytes: number;
  readonly authorityFiles: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
  readonly readinessMarkerSha256: string;
  readonly activationAuthorized: false;
  readonly completionEligible: false;
}

async function regular(root: string, path: string): Promise<Buffer> {
  const absolute = resolve(await realpath(root), path),
    info = await lstat(absolute);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    (await realpath(absolute)) !== absolute
  )
    throw new Error(
      `Source authority must be a canonical independent regular file: ${path}.`,
    );
  return readFile(absolute);
}
function snapshotMarker(root: string, commit: string): Buffer {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ])
    delete env[key];
  const git = (args: readonly string[]) => {
    const result = spawnSync("git", ["-C", root, ...args], {
      env,
      encoding: null,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new Error("Readiness snapshot Git inspection failed.");
    return result.stdout;
  };
  const entry = git(["ls-tree", commit, "--", READINESS_MARKER_PATH])
    .toString()
    .trim();
  if (
    !/^100644 blob [a-f0-9]{40}\t\.agent\/readiness-profile-activated\.json$/.test(
      entry,
    )
  )
    throw new Error(
      "Source epoch snapshot must preserve the real committed readiness marker.",
    );
  return git(["show", `${commit}:${READINESS_MARKER_PATH}`]);
}

/** Inspect a staged coherent authority projection against the settled approval.
 * This is not an active-generation reader and never authorizes publication. */
export async function inspectApprovedSourceAuthorityAnchor(input: {
  readonly repositoryRoot: string;
  readonly snapshotCommit: string;
}): Promise<SourceAuthorityAnchorInspection> {
  const root = resolve(input.repositoryRoot);
  await assertNoPendingAuthorityMigration(root);
  const snapshot = await inspectSourceEpochSnapshot(input);
  if (!snapshot.strictAncestor)
    throw new Error(
      "Source authority snapshot must be a strict ancestor of the candidate.",
    );
  if (
    hash(await regular(root, SOURCE_APPROVAL_PATH)) !== SOURCE_APPROVAL_SHA256
  )
    throw new Error(
      "Candidate source approval differs from the trusted maintainer record.",
    );
  const authorityFiles: { path: string; sha256: string; bytes: number }[] = [];
  for (const path of SOURCE_SNAPSHOT_ROOT_FILES) {
    const expected = snapshot.files.find(
      (file) => file.epoch === "source" && file.rootPath === path,
    )!;
    const bytes = await regular(root, path);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256)
      throw new Error(
        `Source authority differs from the exact approved strict-ancestor snapshot: ${path}.`,
      );
    authorityFiles.push({
      path,
      sha256: expected.sha256,
      bytes: expected.bytes,
    });
  }
  const readiness = await regular(root, READINESS_MARKER_PATH);
  if (!readiness.equals(snapshotMarker(root, input.snapshotCommit)))
    throw new Error(
      "Source authority cannot replace the permanent readiness marker.",
    );
  const lock = authorityFiles.find(
    (file) => file.path === "evals/immutable-contract-lock.json",
  )!;
  await assertNoPendingAuthorityMigration(root);
  return {
    schemaVersion: "source-authority-anchor-inspection.v1",
    status: "PASS",
    contractId: SOURCE_CONTRACT_ID,
    authorityEpoch: SOURCE_EPOCH,
    baseCommit: input.snapshotCommit,
    candidateCommit: snapshot.observedHead,
    snapshot,
    immutableContractLockSha256: lock.sha256,
    immutableContractLockBytes: lock.bytes,
    authorityFiles,
    readinessMarkerSha256: hash(readiness),
    activationAuthorized: false,
    completionEligible: false,
  };
}
