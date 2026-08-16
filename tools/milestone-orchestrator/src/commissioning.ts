import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants, existsSync } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_INVARIANT_SUITE_PATH,
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  DEFAULT_VERIFICATION_SCOPE_POLICY_PATH,
  loadActiveVerificationManifest,
  loadConfig,
  loadInvariantSuiteRegistry,
  loadPackageDefaultVerificationProfile,
  loadVerificationManifest,
  loadVerificationScopePolicy,
} from "./config.js";
import {
  IMMUTABLE_CONTRACT_LOCK_PATH,
  validateCommissionedAuthorityAnchor,
} from "./authority-anchor.js";
import {
  COMMISSIONING_INPUT_SCHEMA_VERSION,
  GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
  VERIFICATION_MANIFEST_SCHEMA_VERSION,
  VERIFICATION_TIERS,
  type CommissioningInput,
  type VerificationManifest,
  type VerificationProfile,
  type VerificationTier,
} from "./contracts.js";
import { inspectReadinessLifecycle } from "./orchestrator.js";
import {
  assertManifestProtectedPathsCovered,
  buildCanonicalProtectedSet,
  casefoldPathKey,
} from "./protected-roots.js";
import { assertVerificationManifest } from "./schema.js";
import {
  assertVerificationManifestRegistryIdentities,
  assertVerificationManifestTargetBranch,
  resolveVerificationManifestProfile,
} from "./verification-manifest.js";
import { planVerificationTier } from "./verification-tier.js";

export const COMMISSIONING_RESULT_SCHEMA_VERSION =
  "loop-commissioning-result.v1" as const;
export const COMMISSIONING_DOCTOR_SCHEMA_VERSION =
  "loop-commissioning-doctor.v1" as const;
export { IMMUTABLE_CONTRACT_LOCK_PATH } from "./authority-anchor.js";

const READINESS_MARKER_PATH =
  ".agent/readiness-profile-activated.json" as const;
const COMMISSIONING_TEMP_PATH =
  ".agent/.verification-manifest.json.commissioning.tmp" as const;

type JsonRecord = Record<string, unknown>;

interface GitIdentity {
  readonly headCommit: string;
  readonly headTree: string;
  readonly currentBranch: string;
}

interface CommissioningContext {
  readonly input: CommissioningInput;
  readonly inputPath: string;
  readonly inputBytes: number;
  readonly inputSha256: string;
  readonly manifest: VerificationManifest;
  readonly manifestBytes: Buffer;
  readonly manifestSha256: string;
  readonly identity: GitIdentity;
  readonly immutableContractLockSha256: string;
  readonly tierPlans: readonly CommissioningTierPlanSummary[];
}

export interface CommissioningTierPlanSummary {
  readonly tier: VerificationTier;
  readonly commandCount: number;
  readonly exactVerificationIncluded: boolean;
}

export interface CommissioningDoctorDiagnostic {
  readonly schemaVersion: typeof COMMISSIONING_DOCTOR_SCHEMA_VERSION;
  readonly diagnostic: "loop-commissioning";
  readonly status: "PASS";
  readonly readOnly: true;
  readonly manifest: {
    readonly path: typeof DEFAULT_VERIFICATION_MANIFEST_PATH;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly repository: {
    readonly targetBranch: string;
    readonly baseCommit: string;
    readonly headCommit: string;
    readonly headTree: string;
    readonly profile: VerificationProfile;
  };
  readonly immutableContractLockSha256: string;
  readonly invariantSuiteId: string;
  readonly scopePolicyId: string;
  readonly tierPlans: readonly CommissioningTierPlanSummary[];
}

export interface CommissioningResult {
  readonly schemaVersion: typeof COMMISSIONING_RESULT_SCHEMA_VERSION;
  readonly status: "PASS";
  readonly input: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly repository: {
    readonly targetBranch: string;
    readonly baseCommit: string;
    readonly headCommit: string;
    readonly headTree: string;
    readonly profile: VerificationProfile;
  };
  readonly generatedFiles: readonly {
    readonly path: typeof DEFAULT_VERIFICATION_MANIFEST_PATH;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly postGenerationDoctor: CommissioningDoctorDiagnostic;
}

export interface CommissioningDependencies {
  readonly writeStagedFile?: (path: string, contents: Buffer) => Promise<void>;
  readonly afterStagedValidation?: () => void | Promise<void>;
  readonly beforePublication?: () => void | Promise<void>;
  readonly afterPublication?: () => void | Promise<void>;
  readonly postPublicationDoctor?: (
    repositoryRoot: string,
  ) => Promise<CommissioningDoctorDiagnostic>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    keys.length === required.length &&
    keys.every((key, index) => key === required[index])
  );
}

function sha256(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function repositoryRelativePath(repositoryRoot: string, path: string): string {
  const result = slash(relative(resolve(repositoryRoot), resolve(path)));
  if (
    result.length === 0 ||
    isAbsolute(result) ||
    result.split("/").includes("..")
  )
    throw new Error(`Commissioning path escapes the repository: ${path}.`);
  return result;
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  acceptedStatuses: readonly number[] = [0],
): {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
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
      result.stderr.trim() ||
      `exit ${String(result.status)}`;
    throw new Error(
      `Commissioning Git inspection failed for git ${args.join(" ")}: ${detail}.`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gitText(repositoryRoot: string, args: readonly string[]): string {
  return git(repositoryRoot, args).stdout.trim();
}

function currentGitIdentity(repositoryRoot: string): GitIdentity {
  const branchResult = git(
    repositoryRoot,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    [0, 1, 128],
  );
  const currentBranch = branchResult.stdout.trim();
  if (!currentBranch)
    throw new Error("Commissioning requires an attached target branch.");
  const headCommit = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  const headTree = gitText(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  if (!/^[a-f0-9]{40}$/u.test(headCommit) || !/^[a-f0-9]{40}$/u.test(headTree))
    throw new Error("Commissioning requires canonical SHA-1 commit identity.");
  return { currentBranch, headCommit, headTree };
}

function statusEntries(repositoryRoot: string): readonly string[] {
  const output = git(repositoryRoot, [
    "--no-optional-locks",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]).stdout;
  return output.split("\0").filter(Boolean);
}

function assertCleanRepository(repositoryRoot: string): void {
  const entries = statusEntries(repositoryRoot);
  if (entries.length > 0)
    throw new Error(
      `Commissioning requires a clean tracked and untracked working tree; found ${entries.length} changed path(s).`,
    );
}

function assertOnlyStagedTemporaryPath(repositoryRoot: string): void {
  const entries = statusEntries(repositoryRoot);
  const expected = `?? ${COMMISSIONING_TEMP_PATH}`;
  if (entries.length !== 1 || entries[0] !== expected)
    throw new Error(
      "Commissioning candidate changed after inspection; publication is refused.",
    );
}

async function readRegularFile(path: string, label: string): Promise<Buffer> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`${label} must be a regular non-symlink file.`);
  return readFile(path);
}

async function readContainedRegularFile(
  repositoryRoot: string,
  repositoryPath: string,
  label: string,
): Promise<Buffer> {
  const absolute = resolve(repositoryRoot, repositoryPath);
  if (
    repositoryRelativePath(repositoryRoot, absolute) !== slash(repositoryPath)
  )
    throw new Error(`${label} path is unsafe.`);
  const [resolvedRoot, resolvedPath] = await Promise.all([
    realpath(repositoryRoot),
    realpath(absolute),
  ]);
  repositoryRelativePath(resolvedRoot, resolvedPath);
  return readRegularFile(absolute, label);
}

function canonicalManifestBytes(manifest: VerificationManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function assertCommissioningInput(value: unknown): CommissioningInput {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "commissioning",
      "sources",
      "objective",
      "exclusions",
      "focusedCommands",
      "requiredProtectedPaths",
      "requiredInvariantSuiteId",
      "scopePolicyId",
      "exactVerification",
      "reconciliationPolicy",
      "output",
    ]) ||
    value["schemaVersion"] !== COMMISSIONING_INPUT_SCHEMA_VERSION
  )
    throw new Error(
      "Commissioning input root is not strict loop-commissioning-input.v1.",
    );

  const commissioning = value["commissioning"];
  const sources = value["sources"];
  const output = value["output"];
  if (
    !isRecord(commissioning) ||
    !exactKeys(commissioning, ["id", "targetBranch", "baseCommit", "profile"])
  )
    throw new Error("Commissioning identity input is malformed.");
  if (
    !isRecord(sources) ||
    !exactKeys(sources, [
      "configPath",
      "invariantSuitePath",
      "scopePolicyPath",
      "immutableContractLockPath",
      "immutableContractLockSha256",
    ]) ||
    sources["configPath"] !== DEFAULT_CONFIG_PATH ||
    sources["invariantSuitePath"] !== DEFAULT_INVARIANT_SUITE_PATH ||
    sources["scopePolicyPath"] !== DEFAULT_VERIFICATION_SCOPE_POLICY_PATH ||
    sources["immutableContractLockPath"] !== IMMUTABLE_CONTRACT_LOCK_PATH ||
    typeof sources["immutableContractLockSha256"] !== "string" ||
    !/^[a-f0-9]{64}$/u.test(sources["immutableContractLockSha256"])
  )
    throw new Error(
      "Commissioning source paths or immutable-lock identity are invalid.",
    );
  if (
    !isRecord(output) ||
    !exactKeys(output, ["verificationManifestPath"]) ||
    output["verificationManifestPath"] !== DEFAULT_VERIFICATION_MANIFEST_PATH
  )
    throw new Error(
      "Commissioning output must be the canonical active manifest path.",
    );

  const manifestCandidate = {
    schemaVersion: VERIFICATION_MANIFEST_SCHEMA_VERSION,
    commissioning: {
      id: commissioning["id"],
      targetBranch: commissioning["targetBranch"],
      baseCommit: commissioning["baseCommit"],
      profile: commissioning["profile"],
      createdAt: "2000-01-01T00:00:00.000Z",
    },
    objective: value["objective"],
    exclusions: value["exclusions"],
    focusedCommands: value["focusedCommands"],
    requiredProtectedPaths: value["requiredProtectedPaths"],
    requiredInvariantSuiteId: value["requiredInvariantSuiteId"],
    scopePolicyId: value["scopePolicyId"],
    exactVerification: value["exactVerification"],
    reconciliationPolicy: value["reconciliationPolicy"],
  };
  assertVerificationManifest(manifestCandidate);
  return value as unknown as CommissioningInput;
}

async function loadCommissioningInput(
  repositoryRoot: string,
  path: string,
): Promise<{
  readonly value: CommissioningInput;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}> {
  const absolute = resolve(path);
  const repositoryPath = repositoryRelativePath(repositoryRoot, absolute);
  const tracked = git(
    repositoryRoot,
    ["ls-files", "--error-unmatch", "--", repositoryPath],
    [0, 1],
  );
  if (tracked.status !== 0)
    throw new Error(
      "Commissioning input must be a tracked file inside the repository.",
    );
  const contents = await readContainedRegularFile(
    repositoryRoot,
    repositoryPath,
    "Commissioning input",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Commissioning input is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
  return {
    value: assertCommissioningInput(parsed),
    path: absolute,
    bytes: contents.byteLength,
    sha256: sha256(contents),
  };
}

function assertStrictAncestor(
  repositoryRoot: string,
  baseCommit: string,
  descendant: string,
): void {
  if (!/^[a-f0-9]{40}$/u.test(baseCommit))
    throw new Error("Commissioning base commit is malformed.");
  const resolved = git(
    repositoryRoot,
    ["rev-parse", "--verify", `${baseCommit}^{commit}`],
    [0, 128],
  );
  if (resolved.status !== 0 || resolved.stdout.trim() !== baseCommit)
    throw new Error(
      "Commissioning base commit is missing or is not an exact commit identity.",
    );
  if (baseCommit === descendant)
    throw new Error(
      "Commissioning base must be a strict ancestor of the candidate HEAD.",
    );
  const ancestor = git(
    repositoryRoot,
    ["merge-base", "--is-ancestor", baseCommit, descendant],
    [0, 1],
  );
  if (ancestor.status !== 0)
    throw new Error(
      "Commissioning base commit is not an ancestor of candidate HEAD.",
    );
}

function commitTimestamp(repositoryRoot: string, commit: string): string {
  const timestamp = gitText(repositoryRoot, [
    "show",
    "-s",
    "--format=%cI",
    commit,
  ]);
  if (!Number.isFinite(Date.parse(timestamp)))
    throw new Error(
      "Commissioning base commit has no canonical Git timestamp.",
    );
  return new Date(timestamp).toISOString();
}

function assertGitBranchName(repositoryRoot: string, branch: string): void {
  const checked = git(
    repositoryRoot,
    ["check-ref-format", "--branch", branch],
    [0, 1, 128],
  );
  if (checked.status !== 0 || checked.stdout.trim() !== branch)
    throw new Error(`Commissioning target branch is invalid: ${branch}.`);
}

async function assertReadinessLifecycle(
  repositoryRoot: string,
  baseCommit: string,
  profile: VerificationProfile,
): Promise<void> {
  const lifecycle = inspectReadinessLifecycle(repositoryRoot, baseCommit);
  if (lifecycle.profile !== profile)
    throw new Error(
      `Commissioning profile ${profile} does not match package-default profile ${lifecycle.profile}.`,
    );
  if (profile === "bootstrap") {
    if (
      lifecycle.candidateHasMarker ||
      lifecycle.markerCommitAtOrBeforeBase !== null ||
      lifecycle.markerCommitAtOrBeforeCandidate !== null ||
      existsSync(resolve(repositoryRoot, READINESS_MARKER_PATH))
    )
      throw new Error(
        "Bootstrap commissioning is incompatible with readiness-marker tree or history.",
      );
    return;
  }
  if (
    !lifecycle.candidateHasMarker ||
    lifecycle.markerCommitAtOrBeforeBase === null ||
    lifecycle.markerCommitAtOrBeforeCandidate === null
  )
    throw new Error(
      "Readiness commissioning requires a valid permanent marker committed at or before the commissioning base.",
    );
  const markerBytes = await readContainedRegularFile(
    repositoryRoot,
    READINESS_MARKER_PATH,
    "Readiness marker",
  );
  let marker: unknown;
  try {
    marker = JSON.parse(markerBytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("Readiness marker is not valid JSON.");
  }
  if (
    !isRecord(marker) ||
    !exactKeys(marker, [
      "schemaVersion",
      "state",
      "previousState",
      "activatedDate",
      "reason",
    ]) ||
    marker["schemaVersion"] !== "1.0.0" ||
    marker["state"] !== "readiness" ||
    marker["previousState"] !== "bootstrap" ||
    typeof marker["activatedDate"] !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(marker["activatedDate"]) ||
    typeof marker["reason"] !== "string" ||
    marker["reason"].trim().length === 0
  )
    throw new Error("Readiness marker is malformed.");
}

async function validateImmutableContractLock(
  repositoryRoot: string,
  baseCommit: string,
  expectedSha256?: string,
): Promise<string> {
  const anchor = await validateCommissionedAuthorityAnchor({
    repositoryRoot,
    baseCommit,
    ...(expectedSha256 === undefined
      ? {}
      : { expectedImmutableContractLockSha256: expectedSha256 }),
  });
  return anchor.immutableContractLockSha256;
}

async function assertFocusedPackageCommands(
  repositoryRoot: string,
  manifest: VerificationManifest,
): Promise<void> {
  const packageBytes = await readContainedRegularFile(
    repositoryRoot,
    "package.json",
    "Package manifest",
  );
  const parsed = JSON.parse(packageBytes.toString("utf8")) as unknown;
  const scripts =
    isRecord(parsed) && isRecord(parsed["scripts"]) ? parsed["scripts"] : {};
  for (const command of manifest.focusedCommands) {
    if (command.argv[0] !== "pnpm") continue;
    const first = command.argv[1];
    if (first === "exec") continue;
    const script = first === "run" ? command.argv[2] : first;
    if (
      !script ||
      typeof scripts[script] !== "string" ||
      scripts[script].trim().length === 0
    )
      throw new Error(
        `Commissioning focused command ${command.id} references missing package script ${script ?? "(missing)"}.`,
      );
  }
}

function assertCanonicalProtectedFloor(
  manifest: VerificationManifest,
  canonicalProtectedPaths: readonly string[],
): void {
  assertManifestProtectedPathsCovered(manifest, canonicalProtectedPaths);
  const required = new Set(
    manifest.requiredProtectedPaths.map(casefoldPathKey),
  );
  const omitted = canonicalProtectedPaths.filter(
    (path) => !required.has(casefoldPathKey(path)),
  );
  if (omitted.length > 0)
    throw new Error(
      `Commissioning manifest omits canonical protected paths: [${omitted.join(", ")}].`,
    );
}

async function constructTierPlans(input: {
  readonly repositoryRoot: string;
  readonly manifest: VerificationManifest;
  readonly scopePolicy: Awaited<ReturnType<typeof loadVerificationScopePolicy>>;
  readonly protectedPaths: readonly string[];
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly headTree: string;
  readonly workingTreeDirty: boolean;
}): Promise<readonly CommissioningTierPlanSummary[]> {
  const results: CommissioningTierPlanSummary[] = [];
  for (const tier of VERIFICATION_TIERS) {
    const plan = await planVerificationTier({
      repositoryRoot: input.repositoryRoot,
      tier,
      manifest: input.manifest,
      scopePolicy: input.scopePolicy.value,
      scopePolicySha256: input.scopePolicy.sha256,
      changedPaths: ["tools/milestone-orchestrator/src/commissioning.ts"],
      changedPathSource: {
        kind: "fixture",
        fixtureId: `commissioning-${tier}`,
      },
      candidate: {
        baseCommit: input.baseCommit,
        gitCommit: input.headCommit,
        gitTree: input.headTree,
        workingTreeDirty: input.workingTreeDirty,
      },
      protectedAuthorityPaths: input.protectedPaths,
    });
    results.push({
      tier,
      commandCount: plan.commands.length,
      exactVerificationIncluded:
        plan.actualCheckIds.includes("exact-readiness"),
    });
  }
  return results;
}

function manifestFromInput(
  input: CommissioningInput,
  createdAt: string,
): VerificationManifest {
  return assertVerificationManifest({
    schemaVersion: VERIFICATION_MANIFEST_SCHEMA_VERSION,
    commissioning: {
      id: input.commissioning.id,
      targetBranch: input.commissioning.targetBranch,
      baseCommit: input.commissioning.baseCommit,
      profile: input.commissioning.profile,
      createdAt,
    },
    objective: input.objective,
    exclusions: input.exclusions,
    focusedCommands: input.focusedCommands,
    requiredProtectedPaths: input.requiredProtectedPaths,
    requiredInvariantSuiteId: input.requiredInvariantSuiteId,
    scopePolicyId: input.scopePolicyId,
    exactVerification: input.exactVerification,
    reconciliationPolicy: input.reconciliationPolicy,
  });
}

async function inspectPreCommissioning(
  repositoryRoot: string,
  inputPath: string,
): Promise<CommissioningContext> {
  if (existsSync(resolve(repositoryRoot, DEFAULT_VERIFICATION_MANIFEST_PATH)))
    throw new Error(
      "Repository is already commissioned; recommissioning is refused.",
    );
  assertCleanRepository(repositoryRoot);
  const loadedInput = await loadCommissioningInput(repositoryRoot, inputPath);
  const identity = currentGitIdentity(repositoryRoot);
  assertGitBranchName(
    repositoryRoot,
    loadedInput.value.commissioning.targetBranch,
  );
  if (identity.currentBranch !== loadedInput.value.commissioning.targetBranch)
    throw new Error(
      `Commissioning must run on target branch ${loadedInput.value.commissioning.targetBranch}; current branch is ${identity.currentBranch}.`,
    );
  assertStrictAncestor(
    repositoryRoot,
    loadedInput.value.commissioning.baseCommit,
    identity.headCommit,
  );

  const [config, invariant, scopePolicy, packageProfile] = await Promise.all([
    loadConfig(repositoryRoot, loadedInput.value.sources.configPath),
    loadInvariantSuiteRegistry(
      repositoryRoot,
      loadedInput.value.sources.invariantSuitePath,
    ),
    loadVerificationScopePolicy(
      repositoryRoot,
      loadedInput.value.sources.scopePolicyPath,
    ),
    loadPackageDefaultVerificationProfile(repositoryRoot),
  ]);
  if (config.targetBranch !== loadedInput.value.commissioning.targetBranch)
    throw new Error(
      `Commissioning target branch ${loadedInput.value.commissioning.targetBranch} does not match configured target branch ${config.targetBranch}.`,
    );
  if (config.project.authorityFile !== "PROJECT_GOAL.md")
    throw new Error(
      "Commissioning requires PROJECT_GOAL.md as the frozen project authority file.",
    );
  if (packageProfile.value !== loadedInput.value.commissioning.profile)
    throw new Error(
      `Commissioning profile ${loadedInput.value.commissioning.profile} does not match package-default profile ${packageProfile.value}.`,
    );
  await assertReadinessLifecycle(
    repositoryRoot,
    loadedInput.value.commissioning.baseCommit,
    loadedInput.value.commissioning.profile,
  );
  const immutableContractLockSha256 = await validateImmutableContractLock(
    repositoryRoot,
    loadedInput.value.commissioning.baseCommit,
    loadedInput.value.sources.immutableContractLockSha256,
  );
  const manifest = manifestFromInput(
    loadedInput.value,
    commitTimestamp(repositoryRoot, loadedInput.value.commissioning.baseCommit),
  );
  assertVerificationManifestRegistryIdentities(
    manifest,
    invariant.value.id,
    scopePolicy.value.id,
  );
  assertVerificationManifestTargetBranch(manifest, config.targetBranch);
  resolveVerificationManifestProfile(manifest, packageProfile.value);
  const canonicalProtectedPaths = buildCanonicalProtectedSet(config, [
    DEFAULT_VERIFICATION_MANIFEST_PATH,
  ]);
  assertCanonicalProtectedFloor(manifest, canonicalProtectedPaths);
  await assertFocusedPackageCommands(repositoryRoot, manifest);
  const tierPlans = await constructTierPlans({
    repositoryRoot,
    manifest,
    scopePolicy,
    protectedPaths: canonicalProtectedPaths,
    baseCommit: manifest.commissioning.baseCommit,
    headCommit: identity.headCommit,
    headTree: identity.headTree,
    workingTreeDirty: false,
  });
  const manifestBytes = canonicalManifestBytes(manifest);
  return {
    input: loadedInput.value,
    inputPath: loadedInput.path,
    inputBytes: loadedInput.bytes,
    inputSha256: loadedInput.sha256,
    manifest,
    manifestBytes,
    manifestSha256: sha256(manifestBytes),
    identity,
    immutableContractLockSha256,
    tierPlans,
  };
}

async function defaultWriteStagedFile(
  path: string,
  contents: Buffer,
): Promise<void> {
  const handle = await open(
    path,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeOwnedPath(path: string): Promise<void> {
  await rm(path, { force: true });
}

async function rollbackPublishedManifest(
  path: string,
  expectedSha256: string,
  expectedIdentity: { readonly dev: number; readonly ino: number },
): Promise<void> {
  try {
    const metadata = await lstat(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.dev !== expectedIdentity.dev ||
      metadata.ino !== expectedIdentity.ino
    )
      return;
    const contents = await readFile(path);
    if (sha256(contents) !== expectedSha256) return;
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function inspectCommissionedRepository(
  repositoryRootPath: string,
): Promise<CommissioningDoctorDiagnostic> {
  const repositoryRoot = resolve(repositoryRootPath);
  const identity = currentGitIdentity(repositoryRoot);
  const [manifest, config, invariant, scopePolicy, packageProfile] =
    await Promise.all([
      loadActiveVerificationManifest(repositoryRoot),
      loadConfig(repositoryRoot),
      loadInvariantSuiteRegistry(repositoryRoot),
      loadVerificationScopePolicy(repositoryRoot),
      loadPackageDefaultVerificationProfile(repositoryRoot),
    ]);
  assertGitBranchName(
    repositoryRoot,
    manifest.value.commissioning.targetBranch,
  );
  if (identity.currentBranch !== manifest.value.commissioning.targetBranch)
    throw new Error(
      `Commissioning doctor must run on target branch ${manifest.value.commissioning.targetBranch}; current branch is ${identity.currentBranch}.`,
    );
  git(repositoryRoot, [
    "show-ref",
    "--verify",
    `refs/heads/${manifest.value.commissioning.targetBranch}`,
  ]);
  const targetHead = gitText(repositoryRoot, [
    "rev-parse",
    `refs/heads/${manifest.value.commissioning.targetBranch}`,
  ]);
  assertStrictAncestor(
    repositoryRoot,
    manifest.value.commissioning.baseCommit,
    targetHead,
  );
  assertVerificationManifestTargetBranch(manifest.value, config.targetBranch);
  assertVerificationManifestRegistryIdentities(
    manifest.value,
    invariant.value.id,
    scopePolicy.value.id,
  );
  resolveVerificationManifestProfile(manifest.value, packageProfile.value);
  await assertReadinessLifecycle(
    repositoryRoot,
    manifest.value.commissioning.baseCommit,
    manifest.value.commissioning.profile,
  );
  const immutableContractLockSha256 = await validateImmutableContractLock(
    repositoryRoot,
    manifest.value.commissioning.baseCommit,
  );
  const canonicalProtectedPaths = buildCanonicalProtectedSet(config);
  assertCanonicalProtectedFloor(manifest.value, canonicalProtectedPaths);
  await assertFocusedPackageCommands(repositoryRoot, manifest.value);
  const tierPlans = await constructTierPlans({
    repositoryRoot,
    manifest: manifest.value,
    scopePolicy,
    protectedPaths: canonicalProtectedPaths,
    baseCommit: manifest.value.commissioning.baseCommit,
    headCommit: identity.headCommit,
    headTree: identity.headTree,
    workingTreeDirty: statusEntries(repositoryRoot).length > 0,
  });
  return {
    schemaVersion: COMMISSIONING_DOCTOR_SCHEMA_VERSION,
    diagnostic: "loop-commissioning",
    status: "PASS",
    readOnly: true,
    manifest: {
      path: DEFAULT_VERIFICATION_MANIFEST_PATH,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
    },
    repository: {
      targetBranch: manifest.value.commissioning.targetBranch,
      baseCommit: manifest.value.commissioning.baseCommit,
      headCommit: identity.headCommit,
      headTree: identity.headTree,
      profile: manifest.value.commissioning.profile,
    },
    immutableContractLockSha256,
    invariantSuiteId: invariant.value.id,
    scopePolicyId: scopePolicy.value.id,
    tierPlans,
  };
}

export async function commissionRepository(input: {
  readonly repositoryRoot: string;
  readonly inputPath: string;
  readonly dependencies?: CommissioningDependencies;
}): Promise<CommissioningResult> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const context = await inspectPreCommissioning(
    repositoryRoot,
    input.inputPath,
  );
  const outputPath = resolve(
    repositoryRoot,
    DEFAULT_VERIFICATION_MANIFEST_PATH,
  );
  const temporaryPath = resolve(repositoryRoot, COMMISSIONING_TEMP_PATH);
  repositoryRelativePath(repositoryRoot, outputPath);
  repositoryRelativePath(repositoryRoot, temporaryPath);
  if (existsSync(temporaryPath))
    throw new Error(
      `Commissioning temporary output already exists: ${COMMISSIONING_TEMP_PATH}.`,
    );
  await mkdir(dirname(temporaryPath), { recursive: true });

  let published = false;
  let publishedIdentity: { readonly dev: number; readonly ino: number } | null =
    null;
  try {
    await (input.dependencies?.writeStagedFile ?? defaultWriteStagedFile)(
      temporaryPath,
      context.manifestBytes,
    );
    const staged = await readRegularFile(
      temporaryPath,
      "Staged verification manifest",
    );
    if (
      staged.byteLength !== context.manifestBytes.byteLength ||
      sha256(staged) !== context.manifestSha256 ||
      !staged.equals(context.manifestBytes)
    )
      throw new Error(
        "Staged verification manifest bytes are incomplete or changed.",
      );
    const stagedLoaded = await loadVerificationManifest(
      repositoryRoot,
      COMMISSIONING_TEMP_PATH,
    );
    if (stagedLoaded.sha256 !== context.manifestSha256)
      throw new Error("Staged verification manifest identity is inconsistent.");
    await input.dependencies?.afterStagedValidation?.();

    const rechecked = currentGitIdentity(repositoryRoot);
    if (
      rechecked.headCommit !== context.identity.headCommit ||
      rechecked.headTree !== context.identity.headTree ||
      rechecked.currentBranch !== context.identity.currentBranch
    )
      throw new Error(
        "Commissioning Git identity changed after validation; publication is refused.",
      );
    assertOnlyStagedTemporaryPath(repositoryRoot);
    if (existsSync(outputPath))
      throw new Error("Repository became commissioned before publication.");
    await input.dependencies?.beforePublication?.();
    if (existsSync(outputPath))
      throw new Error(
        "Active verification manifest publication would clobber an existing path.",
      );

    const stagedPublicationMetadata = await lstat(temporaryPath);
    publishedIdentity = {
      dev: stagedPublicationMetadata.dev,
      ino: stagedPublicationMetadata.ino,
    };
    await link(temporaryPath, outputPath);
    published = true;
    const publishedMetadata = await lstat(outputPath);
    if (
      publishedMetadata.dev !== publishedIdentity.dev ||
      publishedMetadata.ino !== publishedIdentity.ino
    )
      throw new Error(
        "Published verification manifest identity is inconsistent.",
      );
    await unlink(temporaryPath);
    await input.dependencies?.afterPublication?.();
    const doctor = await (
      input.dependencies?.postPublicationDoctor ?? inspectCommissionedRepository
    )(repositoryRoot);
    if (
      doctor.manifest.bytes !== context.manifestBytes.byteLength ||
      doctor.manifest.sha256 !== context.manifestSha256
    )
      throw new Error(
        "Post-generation doctor did not validate the exact published manifest.",
      );
    return {
      schemaVersion: COMMISSIONING_RESULT_SCHEMA_VERSION,
      status: "PASS",
      input: {
        path: context.inputPath,
        bytes: context.inputBytes,
        sha256: context.inputSha256,
      },
      repository: {
        targetBranch: context.manifest.commissioning.targetBranch,
        baseCommit: context.manifest.commissioning.baseCommit,
        headCommit: context.identity.headCommit,
        headTree: context.identity.headTree,
        profile: context.manifest.commissioning.profile,
      },
      generatedFiles: [
        {
          path: DEFAULT_VERIFICATION_MANIFEST_PATH,
          bytes: context.manifestBytes.byteLength,
          sha256: context.manifestSha256,
        },
      ],
      postGenerationDoctor: doctor,
    };
  } catch (error) {
    if (published && publishedIdentity)
      await rollbackPublishedManifest(
        outputPath,
        context.manifestSha256,
        publishedIdentity,
      );
    throw error;
  } finally {
    await removeOwnedPath(temporaryPath);
  }
}

export function renderCommissioningResult(result: CommissioningResult): string {
  const generated = result.generatedFiles
    .map(
      (file) =>
        `[commission] generated ${file.path} bytes=${file.bytes} sha256=${file.sha256}`,
    )
    .join("\n");
  return `${generated}\n${JSON.stringify(result, null, 2)}\n`;
}

export function genericCommissioningReconciliationChecks(): readonly string[] {
  return [...GENERIC_RECONCILIATION_REVIEW_CHECK_IDS];
}
