import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ContractIntegrityCheck,
  ContractIntegrityStatus,
} from "./contract-integrity.js";
import { SOURCE_VERIFICATION_STAGES } from "./verification-scope.mjs";

import { assertNoPendingAuthorityMigration } from "./authority-publication.mjs";
import type { SourceEpochSnapshotInspection } from "./source-epoch-snapshot.js";
import {
  inspectSourceEpochSnapshot,
  SOURCE_APPROVAL_PATH,
  SOURCE_APPROVAL_SHA256,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
  SOURCE_SNAPSHOT_ROOT_FILES,
} from "./source-authority-generation.mjs";

const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const READINESS_MARKER_PATH = ".agent/readiness-profile-activated.json";
export const SOURCE_CONTRACT_INTEGRITY_CHECK_IDS = [
  "source-approved-anchor",
  "source-stage-coverage",
  "source-command-and-claim",
] as const;

/** Public source integrity consumption additionally requires the actual
 * committed publication. The pre-publication inspector grants no such trust. */
export async function inspectActiveSourceContractIntegrity(
  repositoryRoot: string,
) {
  const { inspectCommittedSourcePublication } =
    await import("./source-authority-records.mjs");
  const publication = await inspectCommittedSourcePublication(repositoryRoot);
  const integrity = await inspectApprovedSourceContractIntegrity({
    repositoryRoot,
    snapshotCommit: publication.context.snapshot.snapshotCommit,
  });
  return { ...integrity, activationCommit: publication.activationCommit };
}

function sourceCheck(
  id: string,
  status: ContractIntegrityStatus,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ContractIntegrityCheck {
  return { id, status, message, ...(details === undefined ? {} : { details }) };
}

/** Read-only pre-publication integrity inspection. It validates the exact
 * approved source projection and the implementation's coverage registry without
 * replacing the thirteen legacy checks or authorizing an active generation. */
export async function inspectApprovedSourceContractIntegrity(input: {
  readonly repositoryRoot: string;
  readonly snapshotCommit: string;
}) {
  const anchor = await inspectApprovedSourceAuthorityAnchor(input);
  const bytes = await readFile(
    resolve(input.repositoryRoot, "evals/acceptance-manifest.json"),
  );
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    anchor.authorityFiles.find(
      (file) => file.path === "evals/acceptance-manifest.json",
    )?.sha256
  )
    throw new Error(
      "Approved source manifest changed during integrity inspection.",
    );
  // The anchor authenticates exact approved bytes before this typed projection.
  const manifest = JSON.parse(bytes.toString("utf8")) as {
    requirements: { id: string; required: boolean }[];
    readinessGate: { id: string; claim: string };
    plannedCommandSurface: {
      commands: { plannedCommand: string }[];
      profileContract: { defaultProfile: string };
    };
    evidence: {
      candidateSupportingEvidenceCompletionEligible: boolean;
      crossScopePassInheritance: boolean;
    };
    verificationCadence: {
      candidate: { requiredFloor: string[]; ownerOrder: string[] };
      full: { freshCompleteQualificationRequired: boolean };
    };
  };
  const requiredIds = manifest.requirements
    .filter((item) => item.required)
    .map((item) => item.id);
  const gate = manifest.readinessGate.id;
  const allowed = new Set([...requiredIds, gate]);
  const mapped = SOURCE_VERIFICATION_STAGES.flatMap(
    (stage) => stage.acceptanceIds,
  );
  if (
    new Set(SOURCE_VERIFICATION_STAGES.map((stage) => stage.id)).size !==
      SOURCE_VERIFICATION_STAGES.length ||
    SOURCE_VERIFICATION_STAGES.some(
      (stage) =>
        stage.scripts.length === 0 ||
        stage.requiredArtifactKinds.length === 0 ||
        stage.acceptanceIds.length === 0,
    ) ||
    mapped.some((id) => !allowed.has(id)) ||
    [...allowed].some((id) => !mapped.includes(id))
  )
    throw new Error(
      "Source stage registry omits, duplicates, or substitutes an approved required outcome.",
    );
  if (
    manifest.plannedCommandSurface.commands.length !== 1 ||
    manifest.plannedCommandSurface.commands[0]?.plannedCommand !==
      "pnpm verify" ||
    manifest.plannedCommandSurface.profileContract.defaultProfile !==
      "readiness" ||
    manifest.readinessGate.claim !==
      "source_machine_qualified_for_human_acceptance" ||
    manifest.evidence.candidateSupportingEvidenceCompletionEligible !== false ||
    manifest.evidence.crossScopePassInheritance !== false ||
    manifest.verificationCadence.full.freshCompleteQualificationRequired !==
      true
  )
    throw new Error(
      "Source public command, cadence, or claim boundary differs from the approved contract.",
    );
  return {
    schemaVersion: "source-contract-integrity-inspection.v1",
    status: "PASS",
    claimScope: "approved-source-contract-inspection",
    activationAuthorized: false,
    completionEligible: false,
    anchor,
    checks: [
      sourceCheck(
        "source-approved-anchor",
        "PASS",
        "Seven source authority roots and the preserved readiness marker match the approved strict ancestor.",
      ),
      sourceCheck(
        "source-stage-coverage",
        "PASS",
        "Versioned source registry covers every approved required outcome and its separate source gate.",
        {
          requirementIds: requiredIds,
          stageIds: SOURCE_VERIFICATION_STAGES.map((stage) => stage.id),
        },
      ),
      sourceCheck(
        "source-command-and-claim",
        "PASS",
        "Literal pnpm verify and fresh full source qualification retain distinct candidate, source, and adopter claims.",
      ),
    ],
  } as const;
}

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
