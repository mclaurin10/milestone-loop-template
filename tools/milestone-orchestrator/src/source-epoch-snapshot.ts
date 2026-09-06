import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

export const SOURCE_EPOCH = "orch-template.v1" as const;
export const SOURCE_CONTRACT_ID =
  "milestone-loop-orchestrator-source.v1" as const;
export const SOURCE_APPROVED_DIGEST =
  "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108" as const;
export const SOURCE_APPROVAL_PATH =
  "evals/authority-revisions/ORCH-AUTH-01/approval.json" as const;
// Pin the actual record of the user's settled approval in the trusted controller.
// A candidate-selected file/path or a record's own success flag cannot grant it.
export const SOURCE_APPROVAL_SHA256 =
  "602210fabd865c1d1710032e113d7275ea81e39788ca6b76b439b07cf627bc81" as const;
export const LEGACY_AUTHORITY_BASE =
  "0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5" as const;
export const SOURCE_SNAPSHOT_PREFIX =
  "evals/authority-epochs/orch-template.v1/root" as const;
export const LEGACY_SNAPSHOT_PREFIX =
  "evals/authority-epochs/legacy-source.v1/root" as const;
export const SOURCE_SNAPSHOT_ROOT_FILES = [
  "AGENTS.md",
  "CONTRACT.md",
  "PROJECT_GOAL.md",
  "evals/ACCEPTANCE.md",
  "evals/HIDDEN_VALIDATION_PROTOCOL.md",
  "evals/acceptance-manifest.json",
  "evals/immutable-contract-lock.json",
] as const;
export const LEGACY_SNAPSHOT_ROOT_FILES = [
  "PROJECT_GOAL.md",
  "evals/ACCEPTANCE.md",
  "evals/HIDDEN_VALIDATION_PROTOCOL.md",
  "evals/acceptance-manifest.json",
  "evals/immutable-contract-lock.json",
] as const;
const trustedControllerRoot = resolve(import.meta.dirname, "../../..");
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
interface ApprovedFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly role: string;
}
interface MaintainerApproval {
  readonly approvedContentDigest: typeof SOURCE_APPROVED_DIGEST;
  readonly normativeFiles: readonly ApprovedFile[];
}

export function validateKnownSourceApproval(bytes: Buffer): MaintainerApproval {
  if (hash(bytes) !== SOURCE_APPROVAL_SHA256)
    throw new Error(
      "Source approval bytes do not match the settled maintainer/control-plane record.",
    );
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  if (
    value["status"] !== "APPROVED" ||
    value["approvedContentDigest"] !== SOURCE_APPROVED_DIGEST ||
    value["contractId"] !== SOURCE_CONTRACT_ID ||
    value["authorityEpoch"] !== SOURCE_EPOCH ||
    !Array.isArray(value["normativeFiles"])
  )
    throw new Error(
      "The known approval record does not bind this source scope and epoch.",
    );
  return value as unknown as MaintainerApproval;
}

async function controllerApproval(): Promise<MaintainerApproval> {
  const path = resolve(trustedControllerRoot, SOURCE_APPROVAL_PATH),
    info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    (await realpath(path)) !== path
  )
    throw new Error(
      "Trusted source approval must be a canonical regular file.",
    );
  return validateKnownSourceApproval(await readFile(path));
}

function git(
  root: string,
  args: readonly string[],
  accepted: readonly number[] = [0],
): { status: number; bytes: Buffer } {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ])
    delete env[key];
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: null,
    windowsHide: true,
    env,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (
    result.error ||
    result.status === null ||
    !accepted.includes(result.status)
  )
    throw new Error(
      `Source snapshot Git inspection failed: ${result.error?.message ?? result.stderr?.toString().trim() ?? String(result.status)}`,
    );
  return { status: result.status, bytes: result.stdout ?? Buffer.alloc(0) };
}
const text = (root: string, args: readonly string[]) =>
  git(root, args).bytes.toString().trim();
function exactCommit(root: string, commit: string): void {
  if (
    !/^[a-f0-9]{40}$/.test(commit) ||
    text(root, ["rev-parse", "--verify", `${commit}^{commit}`]) !== commit
  )
    throw new Error(
      "Source snapshot requires an existing exact commit, not a ref or working-tree bytes.",
    );
}
export interface SourceSnapshotFile {
  readonly epoch: "source" | "legacy";
  readonly rootPath: string;
  readonly snapshotPath: string;
  readonly gitBlob: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface SourceEpochSnapshotInspection {
  readonly schemaVersion: "source-epoch-snapshot-inspection.v1";
  readonly status: "PASS";
  readonly claimScope: "inert-authority-snapshot-inspection";
  readonly authorityEpoch: typeof SOURCE_EPOCH;
  readonly contractId: typeof SOURCE_CONTRACT_ID;
  readonly approvedContentDigest: typeof SOURCE_APPROVED_DIGEST;
  readonly approvalRecordSha256: typeof SOURCE_APPROVAL_SHA256;
  readonly snapshotCommit: string;
  readonly observedHead: string;
  readonly strictAncestor: boolean;
  readonly legacyAuthorityBase: typeof LEGACY_AUTHORITY_BASE;
  readonly files: readonly SourceSnapshotFile[];
  readonly activationAuthorized: false;
  readonly completionEligible: false;
}

/** Read-only inspection. Even a successful strict-ancestor result cannot activate
 * authority: migration still owns separate request/review/lease/intent/publication. */
export async function inspectSourceEpochSnapshot(input: {
  readonly repositoryRoot: string;
  readonly snapshotCommit: string;
}): Promise<SourceEpochSnapshotInspection> {
  const root = resolve(input.repositoryRoot),
    snapshot = input.snapshotCommit;
  const approval = await controllerApproval();
  exactCommit(root, snapshot);
  const observedHead = text(root, ["rev-parse", "HEAD"]);
  exactCommit(root, observedHead);
  if (
    git(root, ["merge-base", "--is-ancestor", snapshot, observedHead], [0, 1])
      .status !== 0
  )
    throw new Error(
      "Source snapshot is not in the current candidate's Git ancestry.",
    );
  if (
    git(
      root,
      ["merge-base", "--is-ancestor", LEGACY_AUTHORITY_BASE, snapshot],
      [0, 1],
    ).status !== 0
  )
    throw new Error(
      "Source snapshot does not preserve the original legacy authority ancestry.",
    );
  const expected = [
    ...SOURCE_SNAPSHOT_ROOT_FILES.map((rootPath) => ({
      epoch: "source" as const,
      rootPath,
      snapshotPath: SOURCE_SNAPSHOT_PREFIX + "/" + rootPath,
    })),
    ...LEGACY_SNAPSHOT_ROOT_FILES.map((rootPath) => ({
      epoch: "legacy" as const,
      rootPath,
      snapshotPath: LEGACY_SNAPSHOT_PREFIX + "/" + rootPath,
    })),
  ];
  const entries = git(root, [
    "ls-tree",
    "-rz",
    "--full-tree",
    snapshot,
    "--",
    SOURCE_SNAPSHOT_PREFIX,
    LEGACY_SNAPSHOT_PREFIX,
  ])
    .bytes.toString()
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(line);
      if (!match) throw new Error("Malformed source snapshot Git tree entry.");
      return {
        mode: match[1],
        type: match[2],
        blob: match[3]!,
        path: match[4]!,
      };
    });
  if (
    entries.length !== expected.length ||
    entries.some(
      (entry) =>
        entry.mode !== "100644" ||
        entry.type !== "blob" ||
        !expected.some((file) => file.snapshotPath === entry.path),
    )
  )
    throw new Error(
      "Source snapshot requires the exact fixed regular-file inventory; missing, extra, linked or executable entries are refused.",
    );
  const files: SourceSnapshotFile[] = [];
  for (const file of expected) {
    const entry = entries.find((e) => e.path === file.snapshotPath)!;
    const bytes = git(root, ["cat-file", "blob", entry.blob]).bytes;
    if (file.epoch === "source") {
      const approved = approval.normativeFiles.find(
        (item) => item.path === "proposed/" + file.rootPath,
      );
      if (
        !approved ||
        bytes.length !== approved.bytes ||
        hash(bytes) !== approved.sha256
      )
        throw new Error(
          `Approved source snapshot hash mismatch: ${file.rootPath}.`,
        );
    } else {
      const original = git(root, [
        "show",
        LEGACY_AUTHORITY_BASE + ":" + file.rootPath,
      ]).bytes;
      if (!bytes.equals(original))
        throw new Error(
          `Original legacy authority snapshot differs: ${file.rootPath}.`,
        );
    }
    files.push({
      ...file,
      gitBlob: entry.blob,
      bytes: bytes.length,
      sha256: hash(bytes),
    });
  }
  const sourceLock = JSON.parse(
    git(root, [
      "show",
      snapshot +
        ":" +
        SOURCE_SNAPSHOT_PREFIX +
        "/evals/immutable-contract-lock.json",
    ]).bytes.toString(),
  ) as Record<string, unknown>;
  if (
    sourceLock["schemaVersion"] !== "2.0.0" ||
    sourceLock["authorityEpoch"] !== SOURCE_EPOCH ||
    sourceLock["authoritySnapshotPrefix"] !== SOURCE_SNAPSHOT_PREFIX ||
    sourceLock["approvalRecordPath"] !== SOURCE_APPROVAL_PATH
  )
    throw new Error("Source lock epoch/scope/prefix schema is invalid.");
  const origin = sourceLock["origin"] as Record<string, unknown>;
  const legacyLock = files.find(
    (file) =>
      file.epoch === "legacy" &&
      file.rootPath === "evals/immutable-contract-lock.json",
  )!;
  if (
    origin["legacyEpoch"] !== "legacy-source.v1" ||
    origin["legacyAuthorityBaseCommit"] !== LEGACY_AUTHORITY_BASE ||
    origin["legacyLockSnapshotPath"] !==
      LEGACY_SNAPSHOT_PREFIX + "/evals/immutable-contract-lock.json" ||
    origin["legacyLockSha256"] !== legacyLock.sha256
  )
    throw new Error(
      "Source lock does not preserve its original legacy lock origin.",
    );
  return {
    schemaVersion: "source-epoch-snapshot-inspection.v1",
    status: "PASS",
    claimScope: "inert-authority-snapshot-inspection",
    authorityEpoch: SOURCE_EPOCH,
    contractId: SOURCE_CONTRACT_ID,
    approvedContentDigest: SOURCE_APPROVED_DIGEST,
    approvalRecordSha256: SOURCE_APPROVAL_SHA256,
    snapshotCommit: snapshot,
    observedHead,
    strictAncestor: snapshot !== observedHead,
    legacyAuthorityBase: LEGACY_AUTHORITY_BASE,
    files,
    activationAuthorized: false,
    completionEligible: false,
  };
}
