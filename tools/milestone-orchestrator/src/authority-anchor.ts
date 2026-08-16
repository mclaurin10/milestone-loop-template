import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const IMMUTABLE_CONTRACT_LOCK_PATH =
  "evals/immutable-contract-lock.json" as const;
export const IMMUTABLE_CONTRACT_LOCK_SCHEMA_VERSION = "1.0.0" as const;

export const IMMUTABLE_AUTHORITY_DEFINITIONS = [
  {
    path: "PROJECT_GOAL.md",
    changeClass: "HUMAN_REVISION_ONLY",
  },
  {
    path: "evals/ACCEPTANCE.md",
    changeClass: "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION",
  },
  {
    path: "evals/acceptance-manifest.json",
    changeClass: "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION",
  },
  {
    path: "evals/HIDDEN_VALIDATION_PROTOCOL.md",
    changeClass: "HUMAN_REVISION_ONLY",
  },
] as const;

type JsonRecord = Record<string, unknown>;
type AuthorityPath = (typeof IMMUTABLE_AUTHORITY_DEFINITIONS)[number]["path"];

interface ImmutableAuthorityEntry {
  readonly path: AuthorityPath;
  readonly changeClass:
    "HUMAN_REVISION_ONLY" | "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION";
  readonly baselineSha256: string;
  readonly activeSha256: string;
}

interface ImmutableContractLock {
  readonly schemaVersion: typeof IMMUTABLE_CONTRACT_LOCK_SCHEMA_VERSION;
  readonly calibrationTransition:
    | {
        readonly state: "open_not_started";
        readonly completedCount: 0;
        readonly maximumCount: 1;
        readonly recordPath: null;
      }
    | {
        readonly state: "calibration_frozen";
        readonly completedCount: 1;
        readonly maximumCount: 1;
        readonly recordPath: "evals/CALIBRATION_RECORD.md";
      };
  readonly files: readonly ImmutableAuthorityEntry[];
}

export interface AuthorityAnchorFile {
  readonly path: AuthorityPath;
  readonly sha256: string;
  readonly bytes: number;
  readonly baseContents: Buffer;
  readonly currentContents: Buffer;
}

export interface AuthorityAnchorResult {
  readonly baseCommit: string;
  readonly candidateCommit: string;
  readonly immutableContractLockSha256: string;
  readonly immutableContractLockBytes: number;
  readonly lock: ImmutableContractLock;
  readonly authorityFiles: readonly AuthorityAnchorFile[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    actual.every((key, index) => key === required[index])
  );
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function assertContainedPath(root: string, path: string, label: string): void {
  const contained = slash(relative(resolve(root), resolve(path)));
  if (
    contained.length === 0 ||
    isAbsolute(contained) ||
    contained.split("/").includes("..")
  )
    throw new Error(`${label} escapes the repository.`);
}

async function readCurrentRegularFile(
  repositoryRoot: string,
  repositoryPath: string,
  label: string,
): Promise<Buffer> {
  const root = resolve(repositoryRoot);
  const path = resolve(root, repositoryPath);
  assertContainedPath(root, path, label);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`${label} must be a regular non-symlink file.`);
  const [resolvedRoot, resolvedPath] = await Promise.all([
    realpath(root),
    realpath(path),
  ]);
  assertContainedPath(resolvedRoot, resolvedPath, label);
  return readFile(path);
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  acceptedStatuses: readonly number[] = [0],
): {
  readonly status: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
} {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: null,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (
    result.error ||
    result.status === null ||
    !acceptedStatuses.includes(result.status)
  ) {
    const detail =
      result.error?.message ||
      result.stderr?.toString("utf8").trim() ||
      `exit ${String(result.status)}`;
    throw new Error(
      `Authority-anchor Git inspection failed for git ${args.join(" ")}: ${detail}.`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
  };
}

function gitText(repositoryRoot: string, args: readonly string[]): string {
  return git(repositoryRoot, args).stdout.toString("utf8").trim();
}

function readBaseBlob(
  repositoryRoot: string,
  baseCommit: string,
  repositoryPath: string,
  label: string,
): Buffer {
  const result = git(
    repositoryRoot,
    ["show", `${baseCommit}:${repositoryPath}`],
    [0, 128],
  );
  if (result.status !== 0)
    throw new Error(
      `${label} is missing from commissioned authority base ${baseCommit}.`,
    );
  return result.stdout;
}

function parseLock(bytes: Buffer, label: string): ImmutableContractLock {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ["schemaVersion", "calibrationTransition", "files"]) ||
    value["schemaVersion"] !== IMMUTABLE_CONTRACT_LOCK_SCHEMA_VERSION ||
    !isRecord(value["calibrationTransition"]) ||
    !exactKeys(value["calibrationTransition"], [
      "state",
      "completedCount",
      "maximumCount",
      "recordPath",
    ]) ||
    !Array.isArray(value["files"])
  )
    throw new Error(`${label} schema is invalid.`);

  const calibration = value["calibrationTransition"];
  const open =
    calibration["state"] === "open_not_started" &&
    calibration["completedCount"] === 0 &&
    calibration["maximumCount"] === 1 &&
    calibration["recordPath"] === null;
  const frozen =
    calibration["state"] === "calibration_frozen" &&
    calibration["completedCount"] === 1 &&
    calibration["maximumCount"] === 1 &&
    calibration["recordPath"] === "evals/CALIBRATION_RECORD.md";
  if (!open && !frozen)
    throw new Error(`${label} calibration lifecycle is invalid.`);

  const expectedClasses = new Map(
    IMMUTABLE_AUTHORITY_DEFINITIONS.map((entry) => [
      entry.path,
      entry.changeClass,
    ]),
  );
  const seen = new Set<string>();
  for (const entry of value["files"]) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, [
        "path",
        "changeClass",
        "baselineSha256",
        "activeSha256",
      ]) ||
      typeof entry["path"] !== "string" ||
      seen.has(entry["path"]) ||
      entry["changeClass"] !==
        expectedClasses.get(entry["path"] as AuthorityPath) ||
      typeof entry["baselineSha256"] !== "string" ||
      typeof entry["activeSha256"] !== "string" ||
      !/^[a-f0-9]{64}$/u.test(entry["baselineSha256"]) ||
      !/^[a-f0-9]{64}$/u.test(entry["activeSha256"]) ||
      (open && entry["baselineSha256"] !== entry["activeSha256"]) ||
      (entry["changeClass"] === "HUMAN_REVISION_ONLY" &&
        entry["baselineSha256"] !== entry["activeSha256"])
    )
      throw new Error(`${label} contains an invalid authority entry.`);
    seen.add(entry["path"]);
  }
  if (
    seen.size !== IMMUTABLE_AUTHORITY_DEFINITIONS.length ||
    IMMUTABLE_AUTHORITY_DEFINITIONS.some((entry) => !seen.has(entry.path))
  )
    throw new Error(`${label} authority path set is incomplete.`);
  return value as unknown as ImmutableContractLock;
}

function assertStrictAncestor(
  repositoryRoot: string,
  baseCommit: string,
  candidateCommit: string,
): void {
  if (!/^[a-f0-9]{40}$/u.test(baseCommit))
    throw new Error("Commissioned authority base commit is malformed.");
  const resolved = git(
    repositoryRoot,
    ["rev-parse", "--verify", `${baseCommit}^{commit}`],
    [0, 128],
  );
  if (
    resolved.status !== 0 ||
    resolved.stdout.toString("utf8").trim() !== baseCommit
  )
    throw new Error(
      "Commissioned authority base is missing or is not an exact commit identity.",
    );
  if (baseCommit === candidateCommit)
    throw new Error(
      "Commissioned authority base must be a strict ancestor of the candidate.",
    );
  const ancestor = git(
    repositoryRoot,
    ["merge-base", "--is-ancestor", baseCommit, candidateCommit],
    [0, 1],
  );
  if (ancestor.status !== 0)
    throw new Error(
      "Commissioned authority base is not an ancestor of the candidate.",
    );
}

export async function validateCommissionedAuthorityAnchor(input: {
  readonly repositoryRoot: string;
  readonly baseCommit: string;
  readonly expectedImmutableContractLockSha256?: string;
}): Promise<AuthorityAnchorResult> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const candidateCommit = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/u.test(candidateCommit))
    throw new Error("Authority anchor requires a canonical SHA-1 HEAD commit.");
  assertStrictAncestor(repositoryRoot, input.baseCommit, candidateCommit);

  const currentLockBytes = await readCurrentRegularFile(
    repositoryRoot,
    IMMUTABLE_CONTRACT_LOCK_PATH,
    "Immutable contract lock",
  );
  const baseLockBytes = readBaseBlob(
    repositoryRoot,
    input.baseCommit,
    IMMUTABLE_CONTRACT_LOCK_PATH,
    "Immutable contract lock",
  );
  const lockSha256 = sha256(currentLockBytes);
  if (
    input.expectedImmutableContractLockSha256 !== undefined &&
    lockSha256 !== input.expectedImmutableContractLockSha256
  )
    throw new Error(
      "Immutable contract lock does not match the explicit commissioning input hash.",
    );
  if (!currentLockBytes.equals(baseLockBytes))
    throw new Error(
      "Immutable contract lock differs from the commissioned strict-ancestor authority base.",
    );

  const currentLock = parseLock(currentLockBytes, "Immutable contract lock");
  parseLock(baseLockBytes, "Base immutable contract lock");
  const currentEntries = new Map(
    currentLock.files.map((entry) => [entry.path, entry]),
  );
  const authorityFiles: AuthorityAnchorFile[] = [];
  for (const definition of IMMUTABLE_AUTHORITY_DEFINITIONS) {
    const entry = currentEntries.get(definition.path);
    if (!entry)
      throw new Error(
        `Immutable contract lock omits authority ${definition.path}.`,
      );
    const [currentContents, baseContents] = await Promise.all([
      readCurrentRegularFile(
        repositoryRoot,
        definition.path,
        `Immutable authority ${definition.path}`,
      ),
      Promise.resolve(
        readBaseBlob(
          repositoryRoot,
          input.baseCommit,
          definition.path,
          `Immutable authority ${definition.path}`,
        ),
      ),
    ]);
    const currentSha256 = sha256(currentContents);
    const baseSha256 = sha256(baseContents);
    if (currentSha256 !== entry.activeSha256)
      throw new Error(`Immutable authority hash mismatch: ${definition.path}.`);
    if (
      baseSha256 !== entry.activeSha256 ||
      !currentContents.equals(baseContents)
    )
      throw new Error(
        `Immutable authority ${definition.path} differs from the commissioned strict-ancestor base.`,
      );
    authorityFiles.push({
      path: definition.path,
      sha256: currentSha256,
      bytes: currentContents.byteLength,
      baseContents,
      currentContents,
    });
  }

  if (currentLock.calibrationTransition.state === "calibration_frozen") {
    const [currentRecord, baseRecord] = await Promise.all([
      readCurrentRegularFile(
        repositoryRoot,
        currentLock.calibrationTransition.recordPath,
        "Calibration record",
      ),
      Promise.resolve(
        readBaseBlob(
          repositoryRoot,
          input.baseCommit,
          currentLock.calibrationTransition.recordPath,
          "Calibration record",
        ),
      ),
    ]);
    if (!currentRecord.equals(baseRecord))
      throw new Error(
        "Calibration record differs from the commissioned strict-ancestor base.",
      );
  }

  return {
    baseCommit: input.baseCommit,
    candidateCommit,
    immutableContractLockSha256: lockSha256,
    immutableContractLockBytes: currentLockBytes.byteLength,
    lock: currentLock,
    authorityFiles,
  };
}
