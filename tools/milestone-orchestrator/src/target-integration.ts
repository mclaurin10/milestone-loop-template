import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, realpath, rename } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  candidateIdentitiesEqual,
  candidateIdentityFrom,
  differingIdentityFields,
} from "./candidate-identity.js";
import type {
  CandidateIdentity,
  TargetIntegrateBlockedClassification,
  TargetIntegrateOperation,
} from "./contracts.js";
import { strictlyContained } from "./path-safety.js";
import { atomicWriteJson } from "./state-store.js";

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export const TARGET_INTEGRATION_FAULT_POINTS = [
  "after-intent-persisted",
  "after-pending-outcome-temporary",
  "after-pending-outcome",
  "after-outcome-pending-state",
  "after-target-update-started-state",
  "after-candidate-fetch",
  "after-target-fast-forward",
  "after-target-updated-state",
  "after-integrated-outcome-temporary",
  "after-integrated-outcome",
  "after-outcome-integrated-state",
  "after-completion-state",
] as const;
export type TargetIntegrationFaultPoint =
  (typeof TARGET_INTEGRATION_FAULT_POINTS)[number];

export interface TargetIntegrationHooks {
  readonly fault?: (
    point: TargetIntegrationFaultPoint,
    operation: TargetIntegrateOperation,
  ) => void | Promise<void>;
}

export type TargetClassification =
  | "base-ready"
  | "candidate-ready"
  | "target-branch-mismatch"
  | "target-dirty"
  | "target-index-locked"
  | "target-operation-in-progress"
  | "target-path-unsafe"
  | "target-unexpected-commit";

export interface TargetIntegrationTargetInspection {
  readonly classification: TargetClassification;
  readonly root: string;
  readonly branch: string | null;
  readonly head: string | null;
  readonly clean: boolean;
  readonly reason: string;
}

export type TargetCandidateClassification =
  "ready" | "candidate-drift" | "workspace-path-unsafe";

export interface TargetIntegrationCandidateInspection {
  readonly classification: TargetCandidateClassification;
  readonly observed: CandidateIdentity | null;
  readonly commits: readonly string[];
  readonly reason: string;
}

export type TargetOutcomeArtifactClassification =
  "absent" | "pending" | "integrated" | "conflict";

export interface TargetOutcomeInspection {
  readonly final: TargetOutcomeArtifactClassification;
  readonly temporary: TargetOutcomeArtifactClassification;
  readonly reason: string;
}

export type TargetIntegrationRecoveryClassification =
  "target-base" | "target-candidate" | TargetIntegrateBlockedClassification;

export interface TargetIntegrationRecoveryInspection {
  readonly operationId: string;
  readonly classification: TargetIntegrationRecoveryClassification;
  readonly target: TargetIntegrationTargetInspection;
  readonly candidate: TargetIntegrationCandidateInspection;
  readonly outcome: TargetOutcomeInspection;
  readonly nextSafeAction:
    | "resume-target-update"
    | "adopt-target-candidate"
    | "complete-integration"
    | "manual-reconciliation-required";
  readonly message: string;
  readonly preservedPaths: readonly string[];
}

function git(
  repository: string,
  args: readonly string[],
  options: {
    readonly allowFailure?: boolean;
    readonly readOnly?: boolean;
  } = {},
): GitResult {
  const prefix = options.readOnly ? ["--no-optional-locks"] : [];
  const result = spawnSync("git", [...prefix, "-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: options.readOnly
      ? { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
      : process.env,
  });
  if (result.error) throw result.error;
  const output = {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  if (!options.allowFailure && output.status !== 0)
    throw new Error(
      `Git command failed (${args.join(" ")}): ${output.stderr || output.stdout}`,
    );
  return output;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function safeDirectoryChain(
  root: string,
  target: string,
): Promise<{ readonly safe: boolean; readonly reason: string }> {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(target);
  if (
    lexicalRoot !== lexicalTarget &&
    !strictlyContained(lexicalRoot, lexicalTarget)
  )
    return { safe: false, reason: "Path escapes its declared root." };
  try {
    const rootMetadata = await lstat(lexicalRoot);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
      return {
        safe: false,
        reason: "Declared root is linked or not a directory.",
      };
    const realRoot = await realpath(lexicalRoot);
    if (!samePath(realRoot, lexicalRoot))
      return {
        safe: false,
        reason: "Declared root resolves through a substituted path.",
      };
    const segments = relative(lexicalRoot, lexicalTarget)
      .split(/[\\/]+/u)
      .filter(Boolean);
    let current = lexicalRoot;
    for (const segment of segments) {
      current = resolve(current, segment);
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        return {
          safe: false,
          reason: "Directory chain includes a linked or non-directory entry.",
        };
      const realCurrent = await realpath(current);
      if (
        !samePath(realCurrent, current) ||
        !strictlyContained(realRoot, realCurrent)
      )
        return {
          safe: false,
          reason: "Directory chain resolves through a substituted path.",
        };
    }
    return { safe: true, reason: "Directory chain is exact and unlinked." };
  } catch (error) {
    return {
      safe: false,
      reason: missing(error)
        ? "Required directory path is missing."
        : error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

async function safeGitDirectory(repository: string): Promise<string> {
  const root = resolve(repository);
  const rootInspection = await safeDirectoryChain(root, root);
  if (!rootInspection.safe) throw new Error(rootInspection.reason);
  const gitDirectory = resolve(root, ".git");
  const metadata = await lstat(gitDirectory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error(
      "Git metadata is linked, uses a gitfile, or is not a directory.",
    );
  const gitReal = await realpath(gitDirectory);
  if (!samePath(gitReal, gitDirectory) || !strictlyContained(root, gitReal))
    throw new Error("Git metadata resolves outside the declared repository.");
  const top = git(root, ["rev-parse", "--show-toplevel"], {
    readOnly: true,
  }).stdout;
  if (!samePath(await realpath(top), root))
    throw new Error("Git top-level does not match the declared repository.");
  const gitDirValue = git(root, ["rev-parse", "--git-dir"], {
    readOnly: true,
  }).stdout;
  const commonDirValue = git(root, ["rev-parse", "--git-common-dir"], {
    readOnly: true,
  }).stdout;
  if (
    !samePath(resolve(root, gitDirValue), gitDirectory) ||
    !samePath(resolve(root, commonDirValue), gitDirectory)
  )
    throw new Error("Repository does not own one standalone Git directory.");
  for (const entry of [
    resolve(gitDirectory, "HEAD"),
    resolve(gitDirectory, "index"),
  ]) {
    const entryMetadata = await lstat(entry);
    if (!entryMetadata.isFile() || entryMetadata.isSymbolicLink())
      throw new Error("Git HEAD or index is linked or not a regular file.");
  }
  return gitDirectory;
}

function rawDiffEntriesReadOnly(
  repository: string,
  baseCommit: string,
  headCommit: string,
): readonly string[] {
  const result = git(
    repository,
    [
      "diff",
      "--raw",
      "-z",
      "--no-renames",
      "--diff-filter=ACDMRTUXB",
      `${baseCommit}..${headCommit}`,
    ],
    { readOnly: true },
  );
  const tokens = result.stdout.split("\0").filter(Boolean);
  if (tokens.length % 2 !== 0)
    throw new Error("Candidate raw diff has unexpected framing.");
  const entries: string[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const meta = tokens[index] ?? "";
    const path = (tokens[index + 1] ?? "").replaceAll("\\", "/");
    if (!meta.startsWith(":"))
      throw new Error("Candidate raw diff record is malformed.");
    const fields = meta.slice(1).split(" ");
    if (
      fields.length < 5 ||
      [fields[0], fields[1]].some(
        (mode) => mode === "120000" || mode === "160000",
      )
    )
      throw new Error("Candidate contains a linked or gitlink change.");
    entries.push(`${meta} ${path}`);
  }
  return entries;
}

function localConfig(repository: string, key: string): string | null {
  const result = git(repository, ["config", "--local", "--get", key], {
    allowFailure: true,
    readOnly: true,
  });
  if (result.status === 1 && !result.stdout) return null;
  if (result.status !== 0)
    throw new Error(`Cannot inspect local Git configuration ${key}.`);
  return result.stdout;
}

export function planTargetIntegrateOperation(input: {
  readonly operationId: string;
  readonly inputStateGeneration: string;
  readonly inputStateRevision: number;
  readonly repositoryRoot: string;
  readonly targetBranch: string;
  readonly expectedBaseCommit: string;
  readonly workspacePath: string;
  readonly workspaceBranch: string;
  readonly candidate: CandidateIdentity;
  readonly verificationResultSha256: string;
  readonly commits: readonly string[];
  readonly outcomePath: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly attempt: number;
  readonly now: string;
}): TargetIntegrateOperation {
  const repositoryRoot = resolve(input.repositoryRoot);
  const workspacePath = resolve(input.workspacePath);
  const outcomePath = resolve(input.outcomePath);
  const suffix = createHash("sha256")
    .update(input.operationId, "utf8")
    .digest("hex")
    .slice(0, 16);
  const outcomeTemporaryPath = `${outcomePath}.target-integrate-${suffix}.tmp`;
  if (
    !strictlyContained(repositoryRoot, workspacePath) ||
    !strictlyContained(repositoryRoot, outcomePath) ||
    !strictlyContained(repositoryRoot, outcomeTemporaryPath)
  )
    throw new Error(
      "Resolved target-integrate paths are not safely contained.",
    );
  return {
    schemaVersion: "1.0.0",
    kind: "target-integrate",
    id: input.operationId,
    runId: input.runId,
    milestoneId: input.milestoneId,
    attempt: input.attempt,
    inputStateGeneration: input.inputStateGeneration,
    inputStateRevision: input.inputStateRevision,
    repositoryRoot,
    targetBranch: input.targetBranch,
    expectedBaseCommit: input.expectedBaseCommit,
    workspacePath,
    workspaceBranch: input.workspaceBranch,
    candidate: { ...input.candidate },
    verificationResultSha256: input.verificationResultSha256,
    commits: [...input.commits],
    outcomePath,
    outcomeTemporaryPath,
    phase: "intent-persisted",
    createdAt: input.now,
    updatedAt: input.now,
    completionAt: input.now,
    recoveryPolicy: "validate-adopt-or-preserve",
    diagnostic: null,
  };
}

export async function inspectTargetForIntegration(
  operation: TargetIntegrateOperation,
): Promise<TargetIntegrationTargetInspection> {
  const root = resolve(operation.repositoryRoot);
  let branch: string | null = null;
  let head: string | null = null;
  try {
    const gitDirectory = await safeGitDirectory(root);
    const indexLock = resolve(gitDirectory, "index.lock");
    if (existsSync(indexLock))
      return {
        classification: "target-index-locked",
        root,
        branch,
        head,
        clean: false,
        reason: "Target Git index.lock is present.",
      };
    branch = git(root, ["branch", "--show-current"], { readOnly: true }).stdout;
    head = git(root, ["rev-parse", "HEAD"], { readOnly: true }).stdout;
    if (branch !== operation.targetBranch)
      return {
        classification: "target-branch-mismatch",
        root,
        branch: branch || null,
        head,
        clean: false,
        reason: `Expected target branch ${operation.targetBranch}, observed ${branch || "detached"}.`,
      };
    for (const active of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-merge",
      "rebase-apply",
    ]) {
      const path = git(root, ["rev-parse", "--git-path", active], {
        readOnly: true,
      }).stdout;
      if (existsSync(resolve(root, path)))
        return {
          classification: "target-operation-in-progress",
          root,
          branch,
          head,
          clean: false,
          reason: `Target Git operation ${active} is active.`,
        };
    }
    const status = git(
      root,
      ["status", "--porcelain=v2", "--untracked-files=all"],
      { readOnly: true },
    ).stdout;
    if (status)
      return {
        classification: "target-dirty",
        root,
        branch,
        head,
        clean: false,
        reason: "Target index or working tree is not clean.",
      };
    if (head === operation.expectedBaseCommit)
      return {
        classification: "base-ready",
        root,
        branch,
        head,
        clean: true,
        reason: "Target is clean at the exact recorded base.",
      };
    if (head === operation.candidate.commit)
      return {
        classification: "candidate-ready",
        root,
        branch,
        head,
        clean: true,
        reason: "Target is clean at the exact approved candidate.",
      };
    return {
      classification: "target-unexpected-commit",
      root,
      branch,
      head,
      clean: true,
      reason: `Target HEAD ${head} is neither the recorded base nor approved candidate.`,
    };
  } catch (error) {
    return {
      classification: "target-path-unsafe",
      root,
      branch,
      head,
      clean: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function inspectTargetIntegrationCandidate(
  operation: TargetIntegrateOperation,
): Promise<TargetIntegrationCandidateInspection> {
  try {
    const parent = await safeDirectoryChain(
      operation.repositoryRoot,
      dirname(operation.workspacePath),
    );
    if (!parent.safe) throw new Error(parent.reason);
    await safeGitDirectory(operation.workspacePath);
    const branch = git(operation.workspacePath, ["branch", "--show-current"], {
      readOnly: true,
    }).stdout;
    const remotes = git(operation.workspacePath, ["remote"], {
      readOnly: true,
    }).stdout;
    if (
      branch !== operation.workspaceBranch ||
      remotes.length > 0 ||
      localConfig(operation.workspacePath, "milestone-loop.source-root") !==
        operation.repositoryRoot ||
      localConfig(operation.workspacePath, "milestone-loop.base-commit") !==
        operation.expectedBaseCommit ||
      localConfig(operation.workspacePath, "milestone-loop.branch") !==
        operation.workspaceBranch ||
      git(operation.workspacePath, ["rev-parse", "--is-shallow-repository"], {
        readOnly: true,
      }).stdout !== "false"
    )
      throw new Error(
        "Workspace branch, source markers, remotes, or clone mode do not match the isolated attempt.",
      );
    const headCommit = git(operation.workspacePath, ["rev-parse", "HEAD"], {
      readOnly: true,
    }).stdout;
    const tree = git(operation.workspacePath, ["rev-parse", "HEAD^{tree}"], {
      readOnly: true,
    }).stdout;
    const status = git(
      operation.workspacePath,
      ["status", "--porcelain=v2", "--untracked-files=all"],
      { readOnly: true },
    ).stdout;
    const ancestor = git(
      operation.workspacePath,
      ["merge-base", "--is-ancestor", operation.expectedBaseCommit, headCommit],
      { allowFailure: true, readOnly: true },
    );
    if (ancestor.status !== 0)
      throw new Error("Candidate no longer descends from the recorded base.");
    const commitsText = git(
      operation.workspacePath,
      [
        "rev-list",
        "--reverse",
        `${operation.expectedBaseCommit}..${headCommit}`,
      ],
      { readOnly: true },
    ).stdout;
    const commits = commitsText ? commitsText.split(/\r?\n/u) : [];
    const observed = candidateIdentityFrom(operation.expectedBaseCommit, {
      headCommit,
      tree,
      clean: status.length === 0,
      changedEntries: rawDiffEntriesReadOnly(
        operation.workspacePath,
        operation.expectedBaseCommit,
        headCommit,
      ),
    });
    if (
      !candidateIdentitiesEqual(observed, operation.candidate) ||
      JSON.stringify(commits) !== JSON.stringify(operation.commits)
    )
      return {
        classification: "candidate-drift",
        observed,
        commits,
        reason: `Workspace candidate changed in [${
          differingIdentityFields(operation.candidate, observed).join(", ") ||
          "commits"
        }].`,
      };
    return {
      classification: "ready",
      observed,
      commits,
      reason: "Workspace exactly matches the pinned approved candidate.",
    };
  } catch (error) {
    return {
      classification: "workspace-path-unsafe",
      observed: null,
      commits: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function targetIntegrationOutcome(
  operation: TargetIntegrateOperation,
  status: "pending" | "integrated",
) {
  return {
    schemaVersion: "1.1.0",
    operationId: operation.id,
    runId: operation.runId,
    milestoneId: operation.milestoneId,
    attempt: operation.attempt,
    status,
    targetBranch: operation.targetBranch,
    baseCommit: operation.expectedBaseCommit,
    headCommit: operation.candidate.commit,
    tree: operation.candidate.tree,
    changedEntriesDigest: operation.candidate.changedEntriesDigest,
    verificationResultSha256: operation.verificationResultSha256,
    commits: operation.commits,
    recordedAt: operation.completionAt,
  };
}

function serializedOutcome(
  operation: TargetIntegrateOperation,
  status: "pending" | "integrated",
): string {
  return `${JSON.stringify(targetIntegrationOutcome(operation, status), null, 2)}\n`;
}

async function classifyOutcomePath(
  operation: TargetIntegrateOperation,
  path: string,
): Promise<TargetOutcomeArtifactClassification> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return "conflict";
    const real = await realpath(path);
    if (
      !samePath(real, path) ||
      !strictlyContained(operation.repositoryRoot, real)
    )
      return "conflict";
    const bytes = await readFile(path, "utf8");
    if (bytes === serializedOutcome(operation, "pending")) return "pending";
    if (bytes === serializedOutcome(operation, "integrated"))
      return "integrated";
    return "conflict";
  } catch (error) {
    if (missing(error)) return "absent";
    return "conflict";
  }
}

export async function inspectTargetIntegrationOutcome(
  operation: TargetIntegrateOperation,
): Promise<TargetOutcomeInspection> {
  const parent = await safeDirectoryChain(
    operation.repositoryRoot,
    dirname(operation.outcomePath),
  );
  if (!parent.safe)
    return { final: "conflict", temporary: "conflict", reason: parent.reason };
  const [final, temporary] = await Promise.all([
    classifyOutcomePath(operation, operation.outcomePath),
    classifyOutcomePath(operation, operation.outcomeTemporaryPath),
  ]);
  const conflict = final === "conflict" || temporary === "conflict";
  return {
    final,
    temporary,
    reason: conflict
      ? "Outcome artifact or deterministic temporary file is not exact."
      : "Outcome artifact facts are exact or absent.",
  };
}

function blockedInspection(
  operation: TargetIntegrateOperation,
  classification: TargetIntegrateBlockedClassification,
  target: TargetIntegrationTargetInspection,
  candidate: TargetIntegrationCandidateInspection,
  outcome: TargetOutcomeInspection,
  message: string,
): TargetIntegrationRecoveryInspection {
  return {
    operationId: operation.id,
    classification,
    target,
    candidate,
    outcome,
    nextSafeAction: "manual-reconciliation-required",
    message,
    preservedPaths: [
      operation.repositoryRoot,
      operation.workspacePath,
      ...(outcome.final === "absent" ? [] : [operation.outcomePath]),
      ...(outcome.temporary === "absent"
        ? []
        : [operation.outcomeTemporaryPath]),
    ],
  };
}

export async function inspectTargetIntegrationOperation(
  operation: TargetIntegrateOperation,
): Promise<TargetIntegrationRecoveryInspection> {
  const [target, candidate, outcome] = await Promise.all([
    inspectTargetForIntegration(operation),
    inspectTargetIntegrationCandidate(operation),
    inspectTargetIntegrationOutcome(operation),
  ]);
  if (candidate.classification !== "ready")
    return blockedInspection(
      operation,
      candidate.classification,
      target,
      candidate,
      outcome,
      candidate.reason,
    );
  if (!["base-ready", "candidate-ready"].includes(target.classification))
    return blockedInspection(
      operation,
      target.classification as TargetIntegrateBlockedClassification,
      target,
      candidate,
      outcome,
      target.reason,
    );
  if (outcome.final === "conflict" || outcome.temporary === "conflict")
    return blockedInspection(
      operation,
      "outcome-conflict",
      target,
      candidate,
      outcome,
      outcome.reason,
    );
  if (
    target.classification === "base-ready" &&
    (operation.phase === "target-updated" ||
      operation.phase === "outcome-integrated" ||
      outcome.final === "integrated" ||
      outcome.temporary === "integrated")
  )
    return blockedInspection(
      operation,
      "state-target-inconsistent",
      target,
      candidate,
      outcome,
      "Durable state or outcome records target advancement, but target remains at the base.",
    );
  if (
    target.classification === "candidate-ready" &&
    outcome.final === "integrated" &&
    outcome.temporary === "pending"
  )
    return blockedInspection(
      operation,
      "outcome-conflict",
      target,
      candidate,
      outcome,
      "An integrated final outcome conflicts with a stale pending temporary outcome.",
    );
  const targetCandidate = target.classification === "candidate-ready";
  return {
    operationId: operation.id,
    classification: targetCandidate ? "target-candidate" : "target-base",
    target,
    candidate,
    outcome,
    nextSafeAction: targetCandidate
      ? outcome.final === "integrated" && outcome.temporary === "absent"
        ? "complete-integration"
        : "adopt-target-candidate"
      : "resume-target-update",
    message: target.reason,
    preservedPaths: [operation.repositoryRoot, operation.workspacePath],
  };
}

async function replaceWithRetry(source: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (
        attempt >= 8 ||
        !code ||
        !["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(code)
      )
        throw error;
      await delay(25 * (attempt + 1));
    }
  }
}

export async function materializeTargetIntegrationOutcome(
  operation: TargetIntegrateOperation,
  status: "pending" | "integrated",
  hooks: TargetIntegrationHooks = {},
): Promise<void> {
  const expectedClassification = status;
  let inspection = await inspectTargetIntegrationOutcome(operation);
  if (inspection.final === "conflict" || inspection.temporary === "conflict")
    throw new Error(inspection.reason);
  if (
    inspection.temporary !== "absent" &&
    inspection.temporary !== expectedClassification
  )
    throw new Error("Deterministic outcome temporary file has stale content.");
  if (inspection.temporary === expectedClassification) {
    if (
      inspection.final !== "absent" &&
      inspection.final !== expectedClassification &&
      !(status === "integrated" && inspection.final === "pending")
    )
      throw new Error("Outcome temporary and final artifacts conflict.");
    await replaceWithRetry(
      operation.outcomeTemporaryPath,
      operation.outcomePath,
    );
    await hooks.fault?.(
      status === "pending"
        ? "after-pending-outcome"
        : "after-integrated-outcome",
      operation,
    );
    inspection = await inspectTargetIntegrationOutcome(operation);
  } else if (inspection.final !== expectedClassification) {
    if (
      inspection.final !== "absent" &&
      !(status === "integrated" && inspection.final === "pending")
    )
      throw new Error("Existing outcome artifact cannot be replaced safely.");
    await atomicWriteJson(
      operation.outcomePath,
      targetIntegrationOutcome(operation, status),
      {
        temporaryPath: operation.outcomeTemporaryPath,
        beforeRename: async () =>
          hooks.fault?.(
            status === "pending"
              ? "after-pending-outcome-temporary"
              : "after-integrated-outcome-temporary",
            operation,
          ),
      },
    );
    await hooks.fault?.(
      status === "pending"
        ? "after-pending-outcome"
        : "after-integrated-outcome",
      operation,
    );
    inspection = await inspectTargetIntegrationOutcome(operation);
  }
  if (
    inspection.final !== expectedClassification ||
    inspection.temporary !== "absent"
  )
    throw new Error(
      "Outcome materialization did not publish the exact artifact.",
    );
}

export async function fetchTargetIntegrationCandidate(
  operation: TargetIntegrateOperation,
  hooks: TargetIntegrationHooks = {},
): Promise<void> {
  git(operation.repositoryRoot, [
    "fetch",
    "--no-tags",
    operation.workspacePath,
    operation.candidate.commit,
  ]);
  const fetchedTree = git(operation.repositoryRoot, [
    "rev-parse",
    `${operation.candidate.commit}^{tree}`,
  ]).stdout;
  if (fetchedTree !== operation.candidate.tree)
    throw new Error(
      "Fetched candidate tree does not match the approved identity.",
    );
  await hooks.fault?.("after-candidate-fetch", operation);
}

export async function fastForwardTargetIntegration(
  operation: TargetIntegrateOperation,
  hooks: TargetIntegrationHooks = {},
): Promise<void> {
  const before = await inspectTargetForIntegration(operation);
  if (before.classification !== "base-ready")
    throw new Error(
      `Target cannot fast-forward from classification ${before.classification}.`,
    );
  const ancestor = git(
    operation.repositoryRoot,
    [
      "merge-base",
      "--is-ancestor",
      operation.expectedBaseCommit,
      operation.candidate.commit,
    ],
    { allowFailure: true },
  );
  if (ancestor.status !== 0)
    throw new Error("Approved candidate is not a fast-forward descendant.");
  git(operation.repositoryRoot, [
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.eol=lf",
    "merge",
    "--ff-only",
    operation.candidate.commit,
  ]);
  await hooks.fault?.("after-target-fast-forward", operation);
  const after = await inspectTargetForIntegration(operation);
  if (after.classification !== "candidate-ready")
    throw new Error(
      `Target fast-forward left classification ${after.classification}.`,
    );
}
