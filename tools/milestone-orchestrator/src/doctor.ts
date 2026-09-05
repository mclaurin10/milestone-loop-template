import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { loadProductionBuildContract } from "../../production-build.mjs";
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  loadActiveVerificationManifest,
  loadConfigForInspection,
} from "./config.js";
import {
  inspectCommissionedRepository,
  type CommissioningDoctorDiagnostic,
  type CommissioningTierPlanSummary,
} from "./commissioning.js";
import {
  inspectCandidatePrepareOperation,
  type CandidatePrepareRecoveryClassification,
} from "./candidate-prepare.js";
import {
  ControllerLease,
  type ControllerLeaseInspection,
} from "./controller-lease.js";
import type {
  ExecutionProviderIdentity,
  OrchestratorConfig,
  OrchestratorState,
  VerificationSummary,
} from "./contracts.js";
import {
  inspectTrustedExecutionCapability,
  TRUSTED_CONTAINER_IMPLEMENTATION,
  type ExecutionProviderCapabilityProbe,
  type TrustedExecutionCapability,
} from "./execution-provider.js";
import {
  executionProviderIdentitiesEqual,
  executionProviderIdentity,
  LOCAL_SUPERVISOR_IMPLEMENTATION,
  UNSAFE_MOUNT_POLICY_VERSION,
  UNSAFE_RESOURCE_LIMIT_PROFILE,
} from "./execution-provider-identity.js";
import { installedCodexSdkVersion } from "./model-policy.js";
import { strictlyContained } from "./path-safety.js";
import {
  assertManifestProtectedPathsCovered,
  buildCanonicalProtectedSet,
  enforcementProtectedPatterns,
} from "./protected-roots.js";
import { STATE_REF } from "./private-ref-store.js";
import { StateStore, type StateStoreInspection } from "./state-store.js";
import {
  inspectWorkspaceCreateOperation,
  type WorkspaceCreateRecoveryClassification,
} from "./workspace-create.js";
import {
  inspectTargetIntegrationOperation,
  type TargetIntegrationRecoveryClassification,
} from "./target-integration.js";
import {
  inspectWorkspaceCleanupOperation,
  type WorkspaceCleanupRecoveryClassification,
} from "./workspace-cleanup-operation.js";
import {
  inspectRetentionApplyOperation,
  type RetentionApplyRecoveryClassification,
} from "./retention-apply-operation.js";

export const DOCTOR_SCHEMA_VERSION = "2.0.0" as const;

export type DoctorCheckStatus = "pass" | "warning" | "block";

interface DoctorCheckBase {
  readonly status: DoctorCheckStatus;
  readonly code: string;
  readonly message: string;
  readonly remediation: string | null;
  readonly command: string | null;
}

export interface DoctorGitProbe {
  readonly clean: boolean | null;
}

interface ProductionBuildContract {
  readonly script: string;
  readonly outputRoots: readonly string[];
}

export interface DoctorDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly nodeVersion?: string;
  readonly homeDirectory?: string;
  readonly gitProbe?: (repositoryRoot: string) => DoctorGitProbe;
  readonly headProbe?: (repositoryRoot: string) => string | null;
  readonly installedSdkVersionProbe?: () => string;
  readonly productionBuildProbe?: (
    repositoryRoot: string,
  ) => Promise<ProductionBuildContract>;
  readonly executionProviderProbe?: ExecutionProviderCapabilityProbe;
  readonly commissioningProbe?: (
    repositoryRoot: string,
  ) => Promise<CommissioningDoctorDiagnostic>;
}

type DoctorPendingOperation =
  | {
      readonly id: string;
      readonly kind: "candidate-prepare";
      readonly phase: string;
      readonly classification: CandidatePrepareRecoveryClassification;
      readonly disposition: "automatic" | "manual";
      readonly workspacePath: string;
      readonly checkpointArtifactPath: string;
      readonly preservedPaths: readonly string[];
      readonly nextSafeAction: string;
    }
  | {
      readonly id: string;
      readonly kind: "workspace-create";
      readonly phase: string;
      readonly classification: WorkspaceCreateRecoveryClassification;
      readonly temporaryPath: string;
      readonly finalPath: string;
      readonly nextSafeAction: string;
    }
  | {
      readonly id: string;
      readonly kind: "target-integrate";
      readonly phase: string;
      readonly classification: TargetIntegrationRecoveryClassification;
      readonly targetClassification: string;
      readonly targetHead: string | null;
      readonly workspacePath: string;
      readonly outcomePath: string;
      readonly nextSafeAction: string;
    }
  | {
      readonly id: string;
      readonly kind: "workspace-cleanup";
      readonly phase: string;
      readonly classification: WorkspaceCleanupRecoveryClassification;
      readonly workspacePath: string;
      readonly diagnosticArchivePath: string | null;
      readonly preservedPaths: readonly string[];
      readonly nextSafeAction: string;
    }
  | {
      readonly id: string;
      readonly kind: "retention-apply";
      readonly phase: string;
      readonly classification: RetentionApplyRecoveryClassification;
      readonly completedDeletionCount: number;
      readonly deletionCount: number;
      readonly currentPath: string | null;
      readonly preservedPaths: readonly string[];
      readonly nextSafeAction: string;
    }
  | null;

interface DoctorChecks {
  readonly runtimePins: DoctorCheckBase & {
    readonly node: {
      readonly configured: string | null;
      readonly running: string;
      readonly matches: boolean;
    };
    readonly pnpm: {
      readonly configured: string | null;
      readonly running: string | null;
      readonly matches: boolean;
    };
  };
  readonly gitCleanliness: DoctorCheckBase & {
    readonly clean: boolean | null;
  };
  readonly configuration: DoctorCheckBase & {
    readonly valid: boolean;
  };
  readonly sdkCompatibility: DoctorCheckBase & {
    readonly package: "@openai/codex-sdk" | null;
    readonly configuredVersion: string | null;
    readonly installedVersion: string | null;
    readonly matches: boolean;
  };
  readonly commissioning: DoctorCheckBase & {
    readonly manifest: {
      readonly path: typeof DEFAULT_VERIFICATION_MANIFEST_PATH;
      readonly bytes: number;
      readonly sha256: string;
    } | null;
    readonly commissioned: boolean;
    readonly targetBranch: string | null;
    readonly baseCommit: string | null;
    readonly headCommit: string | null;
    readonly headTree: string | null;
    readonly profile: "bootstrap" | "readiness" | null;
    readonly immutableContractLockSha256: string | null;
    readonly invariantSuiteId: string | null;
    readonly scopePolicyId: string | null;
    readonly tierPlans: readonly CommissioningTierPlanSummary[];
  };
  readonly productionBuild: DoctorCheckBase & {
    readonly configured: boolean;
    readonly script: string | null;
    readonly outputRoots: readonly string[];
  };
  readonly placeholderScripts: DoctorCheckBase & {
    readonly scripts: readonly string[];
  };
  readonly configuredPaths: DoctorCheckBase & {
    readonly paths: readonly {
      readonly id:
        | "state"
        | "controller-artifacts"
        | "verification-artifacts"
        | "workspaces";
      readonly configuredPath: string;
      readonly expectedKind: "file-or-missing" | "directory-or-missing";
      readonly exists: boolean;
      readonly nearestExistingPath: string | null;
      readonly lexicalContained: boolean;
      readonly realpathContained: boolean;
      readonly kindValid: boolean;
    }[];
  };
  readonly executionProvider: DoctorCheckBase & {
    readonly configuredProvider:
      "trusted-container" | "unsafe-local-diagnostic" | null;
    readonly trustedAvailable: boolean;
    readonly trustedCapability: TrustedExecutionCapability | null;
    readonly identity: ExecutionProviderIdentity | null;
  };
  readonly state: DoctorCheckBase & {
    readonly reference: typeof STATE_REF;
    readonly canonicalGeneration: string | null;
    readonly source: StateStoreInspection["source"] | "invalid" | "not-checked";
    readonly mirror: StateStoreInspection["mirror"] | "invalid" | "not-checked";
    readonly verifiedCommit: string | null;
    readonly nextAllowedAction: OrchestratorState["nextAllowedAction"] | null;
    readonly protectedIntegrity:
      | "verified"
      | "uninitialized"
      | "not-checked"
      | { readonly driftedPaths: readonly string[] };
    readonly pendingOperation: DoctorPendingOperation;
    readonly outcome:
      | "valid"
      | "missing"
      | "reconciliation-required"
      | "reconciliation-active"
      | "workspace-operation-pending"
      | "candidate-operation-pending"
      | "target-operation-pending"
      | "cleanup-operation-pending"
      | "retention-operation-pending"
      | "invalid-or-unreadable"
      | "not-checked";
  };
  readonly storedProtectedIntegrity: DoctorCheckBase & {
    readonly outcome: "verified" | "uninitialized" | "not-checked" | "drifted";
    readonly driftedPaths: readonly string[];
  };
  readonly latestExactVerification: DoctorCheckBase & {
    readonly available: boolean;
    readonly runId: string | null;
    readonly resultPath: string | null;
    readonly resultSha256: string | null;
    readonly resultHashMatches: boolean | null;
    readonly profile: "bootstrap" | "readiness" | null;
    readonly candidateCommit: string | null;
    readonly current: boolean;
    readonly verificationStatus: "PASS" | "NOT_READY" | null;
    readonly completionEligible: boolean;
    readonly autonomousReadinessEquivalent: boolean;
    readonly executionProvider: ExecutionProviderIdentity | null;
    readonly providerMatchesCurrent: boolean | null;
  };
  readonly codexAuthentication: DoctorCheckBase & {
    readonly available: boolean;
    readonly source: "environment" | "local-login" | "none";
  };
  readonly protectedTrustRoots: DoctorCheckBase & {
    readonly roots: readonly {
      readonly path: string;
      readonly present: boolean;
      readonly regularFile: boolean;
      readonly realpathContained: boolean;
    }[];
    readonly manifestCovered: boolean | null;
  };
  readonly controllerLease: DoctorCheckBase & {
    readonly reference: ControllerLeaseInspection["reference"];
    readonly legacyGuard:
      ControllerLeaseInspection["legacyGuard"] | "not-checked";
    readonly present: boolean;
    readonly malformed: boolean;
    readonly owner: ControllerLeaseInspection["owner"];
  };
  readonly autonomousIntegrationEligibility: DoctorCheckBase & {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
}

export type DoctorCheckId = keyof DoctorChecks;

export interface DoctorIssue {
  readonly code: string;
  readonly check: DoctorCheckId;
  readonly severity: Exclude<DoctorCheckStatus, "pass">;
  readonly message: string;
  readonly remediation: string;
  readonly command: string | null;
}

export interface DoctorDiagnostic {
  readonly schemaVersion: typeof DOCTOR_SCHEMA_VERSION;
  readonly diagnostic: "orchestrator-doctor";
  readonly status: "ready" | "blocked";
  readonly readOnly: true;
  readonly networkCallsPerformed: 0;
  readonly summary: {
    readonly passCount: number;
    readonly warningCount: number;
    readonly blockCount: number;
    readonly autonomousIntegrationEligible: boolean;
  };
  readonly nextAction: {
    readonly command: string | null;
    readonly reason: string;
  };
  readonly issues: readonly DoctorIssue[];
  readonly checks: DoctorChecks;
}

function checkBase(
  status: DoctorCheckStatus,
  code: string,
  message: string,
  remediation: string | null = null,
  command: string | null = null,
): DoctorCheckBase {
  return { status, code, message, remediation, command };
}

async function commissioningCheck(
  repositoryRoot: string,
  probe: (repositoryRoot: string) => Promise<CommissioningDoctorDiagnostic>,
): Promise<DoctorChecks["commissioning"]> {
  try {
    const result = await probe(repositoryRoot);
    return {
      ...checkBase(
        "pass",
        "ok",
        "Active verification commissioning and every tier plan are valid.",
      ),
      manifest: result.manifest,
      commissioned: true,
      targetBranch: result.repository.targetBranch,
      baseCommit: result.repository.baseCommit,
      headCommit: result.repository.headCommit,
      headTree: result.repository.headTree,
      profile: result.repository.profile,
      immutableContractLockSha256: result.immutableContractLockSha256,
      invariantSuiteId: result.invariantSuiteId,
      scopePolicyId: result.scopePolicyId,
      tierPlans: result.tierPlans,
    };
  } catch {
    return {
      ...checkBase(
        "block",
        "commissioning-invalid",
        "Active verification commissioning is missing or invalid.",
        "Repair the adopter-owned commissioning input and run the one-shot commissioning command; never fall back to a historical manifest.",
        "pnpm loop:commission -- --input tools/milestone-orchestrator/config/source-commissioning-input.json",
      ),
      manifest: null,
      commissioned: false,
      targetBranch: null,
      baseCommit: null,
      headCommit: null,
      headTree: null,
      profile: null,
      immutableContractLockSha256: null,
      invariantSuiteId: null,
      scopePolicyId: null,
      tierPlans: [],
    };
  }
}

interface RuntimePins {
  readonly node: string | null;
  readonly pnpm: string | null;
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  requestedKey: string,
): string | undefined {
  const target = requestedKey.toUpperCase();
  return Object.entries(environment).find(
    ([key, value]) => key.toUpperCase() === target && value !== undefined,
  )?.[1];
}

function normalizeNodeVersion(value: string): string {
  return value.startsWith("v") ? value.slice(1) : value;
}

function runningPnpmVersion(environment: NodeJS.ProcessEnv): string | null {
  const userAgent = environmentValue(environment, "npm_config_user_agent");
  return /(?:^|\s)pnpm\/([^\s]+)/.exec(userAgent ?? "")?.[1] ?? null;
}

async function configuredRuntimePins(
  repositoryRoot: string,
): Promise<RuntimePins> {
  try {
    const manifest = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as {
      readonly engines?: { readonly node?: unknown };
      readonly packageManager?: unknown;
    };
    const node =
      typeof manifest.engines?.node === "string" &&
      /^\d+\.\d+\.\d+$/.test(manifest.engines.node)
        ? manifest.engines.node
        : null;
    const packageManager =
      typeof manifest.packageManager === "string"
        ? /^pnpm@(\d+\.\d+\.\d+)(?:\+.+)?$/.exec(manifest.packageManager)
        : null;
    return { node, pnpm: packageManager?.[1] ?? null };
  } catch {
    return { node: null, pnpm: null };
  }
}

function defaultGitProbe(repositoryRoot: string): DoctorGitProbe {
  const result = spawnSync(
    "git",
    [
      "--no-optional-locks",
      "-C",
      repositoryRoot,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  if (result.error || result.status !== 0) return { clean: null };
  return { clean: result.stdout.trim().length === 0 };
}

function defaultHeadProbe(repositoryRoot: string): string | null {
  const result = spawnSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  const head = result.stdout.trim();
  return /^[a-f0-9]{40}$/.test(head) ? head : null;
}

async function productionBuildCheck(
  repositoryRoot: string,
  probe: (repositoryRoot: string) => Promise<ProductionBuildContract>,
): Promise<DoctorChecks["productionBuild"]> {
  try {
    const contract = await probe(repositoryRoot);
    return {
      ...checkBase(
        "pass",
        "ok",
        "The truthful production-build contract is configured.",
      ),
      configured: true,
      script: contract.script,
      outputRoots: [...contract.outputRoots],
    };
  } catch {
    return {
      ...checkBase(
        "block",
        "production-build-invalid",
        "The truthful production-build contract is missing or invalid.",
        "Declare milestoneLoop.productionBuild with a non-recursive real script and safe non-overlapping output roots.",
      ),
      configured: false,
      script: null,
      outputRoots: [],
    };
  }
}

async function placeholderScriptsCheck(
  repositoryRoot: string,
): Promise<DoctorChecks["placeholderScripts"]> {
  try {
    const manifest = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as { readonly scripts?: unknown };
    const scripts =
      typeof manifest.scripts === "object" &&
      manifest.scripts !== null &&
      !Array.isArray(manifest.scripts)
        ? Object.entries(manifest.scripts)
            .filter(
              ([, command]) =>
                typeof command === "string" &&
                command.includes("placeholder-check.mjs"),
            )
            .map(([name]) => name)
            .sort()
        : [];
    if (scripts.length === 0)
      return {
        ...checkBase(
          "pass",
          "ok",
          "No active package script delegates to the placeholder checker.",
        ),
        scripts,
      };
    return {
      ...checkBase(
        "block",
        "active-placeholder-scripts",
        "Active placeholder-backed package scripts remain: " +
          scripts.join(", ") +
          ".",
        "Replace every listed placeholder script with a real project-owned check before readiness operation.",
      ),
      scripts,
    };
  } catch {
    return {
      ...checkBase(
        "block",
        "package-scripts-unreadable",
        "Package scripts could not be inspected.",
        "Repair package.json and rerun strict Doctor.",
      ),
      scripts: [],
    };
  }
}

interface ConfiguredPathInput {
  readonly id:
    "state" | "controller-artifacts" | "verification-artifacts" | "workspaces";
  readonly configuredPath: string;
  readonly expectedKind: "file-or-missing" | "directory-or-missing";
}

async function existingMetadata(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // POSIX uses ENOTDIR for descendants of a non-directory; keep walking to
    // that ancestor just as Windows does after reporting ENOENT.
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

async function inspectConfiguredPath(
  repositoryRoot: string,
  input: ConfiguredPathInput,
): Promise<DoctorChecks["configuredPaths"]["paths"][number]> {
  const root = resolve(repositoryRoot);
  const candidate = resolve(root, input.configuredPath);
  const lexicalContained = strictlyContained(root, candidate);
  if (!lexicalContained)
    return {
      ...input,
      exists: false,
      nearestExistingPath: null,
      lexicalContained: false,
      realpathContained: false,
      kindValid: false,
    };

  let observedExists = false;
  try {
    let current = candidate;
    let metadata = await existingMetadata(current);
    const exists = metadata !== null;
    observedExists = exists;
    while (!metadata && current !== root) {
      current = dirname(current);
      metadata = await existingMetadata(current);
    }
    if (!metadata)
      return {
        ...input,
        exists,
        nearestExistingPath: null,
        lexicalContained: true,
        realpathContained: false,
        kindValid: false,
      };
    const nearestExistingPath =
      relative(root, current).replaceAll("\\", "/") || ".";
    const linked = metadata.isSymbolicLink();
    const kindValid =
      !linked &&
      (current === candidate
        ? input.expectedKind === "directory-or-missing"
          ? metadata.isDirectory()
          : metadata.isFile()
        : metadata.isDirectory());
    const [resolvedRoot, resolvedExisting] = await Promise.all([
      realpath(root),
      realpath(current),
    ]);
    const realpathContained =
      resolvedExisting === resolvedRoot ||
      strictlyContained(resolvedRoot, resolvedExisting);
    return {
      ...input,
      exists,
      nearestExistingPath,
      lexicalContained: true,
      realpathContained,
      kindValid,
    };
  } catch {
    return {
      ...input,
      exists: observedExists,
      nearestExistingPath: null,
      lexicalContained: true,
      realpathContained: false,
      kindValid: false,
    };
  }
}

async function configuredPathsCheck(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
): Promise<DoctorChecks["configuredPaths"]> {
  if (!config)
    return {
      ...checkBase(
        "warning",
        "configured-paths-not-checked",
        "Configured roots cannot be checked until configuration is valid.",
        "Repair configuration and rerun strict Doctor.",
      ),
      paths: [],
    };
  const paths = await Promise.all(
    (
      [
        {
          id: "state",
          configuredPath: config.statePath,
          expectedKind: "file-or-missing",
        },
        {
          id: "controller-artifacts",
          configuredPath: config.artifactRoot,
          expectedKind: "directory-or-missing",
        },
        {
          id: "verification-artifacts",
          configuredPath: config.evidenceRetention.artifactRoot,
          expectedKind: "directory-or-missing",
        },
        {
          id: "workspaces",
          configuredPath: config.workspaceRoot,
          expectedKind: "directory-or-missing",
        },
      ] satisfies readonly ConfiguredPathInput[]
    ).map((input) => inspectConfiguredPath(repositoryRoot, input)),
  );
  const unsafe = paths.filter(
    (entry) =>
      !entry.lexicalContained || !entry.realpathContained || !entry.kindValid,
  );
  if (unsafe.length === 0)
    return {
      ...checkBase(
        "pass",
        "ok",
        "Configured state, artifact, and workspace paths are lexically and physically contained.",
      ),
      paths,
    };
  return {
    ...checkBase(
      "block",
      "configured-path-unsafe",
      "Unsafe configured paths: " +
        unsafe.map((entry) => entry.id).join(", ") +
        ".",
      "Repair linked, escaped, or wrong-kind configured paths without deleting suspicious content, then rerun strict Doctor.",
    ),
    paths,
  };
}

interface DoctorStateSnapshot {
  readonly state: OrchestratorState | null;
  readonly storage: StateStoreInspection | null;
  readonly invalid: boolean;
}

async function loadStateSnapshot(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
): Promise<DoctorStateSnapshot> {
  if (!config) return { state: null, storage: null, invalid: false };
  try {
    const store = new StateStore(repositoryRoot, config.statePath);
    const [state, storage] = await Promise.all([store.load(), store.inspect()]);
    return { state, storage, invalid: false };
  } catch {
    return { state: null, storage: null, invalid: true };
  }
}

async function inspectStoredProtectedIntegrity(
  repositoryRoot: string,
  state: OrchestratorState | null,
): Promise<DoctorChecks["state"]["protectedIntegrity"]> {
  if (!state) return "uninitialized";
  const root = resolve(repositoryRoot);
  const resolvedRoot = await realpath(root);
  const driftedPaths: string[] = [];
  for (const file of state.repository.protectedFiles) {
    try {
      const candidate = resolve(root, file.path);
      if (!strictlyContained(root, candidate)) {
        driftedPaths.push(file.path);
        continue;
      }
      const [metadata, resolvedCandidate] = await Promise.all([
        lstat(candidate),
        realpath(candidate),
      ]);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        !strictlyContained(resolvedRoot, resolvedCandidate)
      ) {
        driftedPaths.push(file.path);
        continue;
      }
      const contents = await readFile(resolvedCandidate);
      const actual = createHash("sha256").update(contents).digest("hex");
      if (actual !== file.sha256) driftedPaths.push(file.path);
    } catch {
      driftedPaths.push(file.path);
    }
  }
  return driftedPaths.length === 0
    ? "verified"
    : { driftedPaths: driftedPaths.sort() };
}

async function storedProtectedIntegrityCheck(
  config: OrchestratorConfig | null,
  snapshot: DoctorStateSnapshot,
  integrity: DoctorChecks["state"]["protectedIntegrity"],
): Promise<DoctorChecks["storedProtectedIntegrity"]> {
  if (!config || snapshot.invalid)
    return {
      ...checkBase(
        "warning",
        "stored-protected-integrity-not-checked",
        "Stored protected-file identities cannot be checked until canonical state is readable.",
        "Repair configuration or canonical state and rerun strict Doctor.",
      ),
      outcome: "not-checked",
      driftedPaths: [],
    };
  if (!snapshot.state)
    return {
      ...checkBase(
        "pass",
        "ok",
        "No controller state exists, so no stored protected identity can drift.",
      ),
      outcome: "uninitialized",
      driftedPaths: [],
    };
  if (integrity === "verified")
    return {
      ...checkBase(
        "pass",
        "ok",
        "Every state-owned protected-file identity matches current bytes.",
      ),
      outcome: "verified",
      driftedPaths: [],
    };
  const driftedPaths =
    typeof integrity === "object" ? integrity.driftedPaths : [];
  return {
    ...checkBase(
      "block",
      "stored-protected-drift",
      "Stored protected-file identities have drifted.",
      "Preserve the drift evidence and restore or explicitly reconcile the protected authority before continuing.",
      "pnpm loop:status",
    ),
    outcome: "drifted",
    driftedPaths,
  };
}

async function stateOutcome(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
  snapshot: DoctorStateSnapshot,
  head: string | null,
  protectedIntegrity: DoctorChecks["state"]["protectedIntegrity"],
): Promise<DoctorChecks["state"]> {
  if (!config)
    return {
      ...checkBase(
        "warning",
        "state-not-checked",
        "Controller state cannot be checked until configuration is valid.",
        "Repair configuration and rerun strict Doctor.",
      ),
      reference: STATE_REF,
      canonicalGeneration: null,
      source: "not-checked",
      mirror: "not-checked",
      verifiedCommit: null,
      nextAllowedAction: null,
      protectedIntegrity: "not-checked",
      pendingOperation: null,
      outcome: "not-checked",
    };
  if (snapshot.invalid || !snapshot.storage)
    return {
      ...checkBase(
        "block",
        "state-invalid",
        "Canonical controller state is invalid or unreadable.",
        "Preserve the state evidence and diagnose the canonical state generation before any mutating loop action.",
        "pnpm loop:status",
      ),
      reference: STATE_REF,
      canonicalGeneration: null,
      source: "invalid",
      mirror: "invalid",
      verifiedCommit: null,
      nextAllowedAction: null,
      protectedIntegrity: "not-checked",
      pendingOperation: null,
      outcome: "invalid-or-unreadable",
    };

  const state = snapshot.state;
  const details = {
    reference: snapshot.storage.reference,
    canonicalGeneration: snapshot.storage.canonicalGeneration,
    source: snapshot.storage.source,
    mirror: snapshot.storage.mirror,
    verifiedCommit: state?.repository.verifiedCommit ?? null,
    nextAllowedAction: state?.nextAllowedAction ?? null,
    protectedIntegrity,
  } as const;
  if (!state)
    return {
      ...checkBase(
        "warning",
        "state-uninitialized",
        "Controller state is absent and can be initialized by the first plan.",
        "Run one read/write-authorized planning step when ready to begin autonomous work.",
        "pnpm loop:plan",
      ),
      ...details,
      pendingOperation: null,
      outcome: "missing",
    };
  if (state.pendingOperation) {
    if (state.pendingOperation.kind === "workspace-create") {
      const recovery = await inspectWorkspaceCreateOperation(
        state.pendingOperation,
      );
      return {
        ...checkBase(
          "block",
          "workspace-operation-pending",
          "A workspace-create operation requires recovery.",
          recovery.nextSafeAction,
          "pnpm loop:resume -- --one",
        ),
        ...details,
        pendingOperation: {
          id: state.pendingOperation.id,
          kind: state.pendingOperation.kind,
          phase: state.pendingOperation.phase,
          classification: recovery.classification,
          temporaryPath: state.pendingOperation.temporaryPath,
          finalPath: state.pendingOperation.finalPath,
          nextSafeAction: recovery.nextSafeAction,
        },
        outcome: "workspace-operation-pending",
      };
    }
    if (state.pendingOperation.kind === "candidate-prepare") {
      const operation = state.pendingOperation;
      const milestone = state.milestones.find(
        (entry) => entry.proposal.id === operation.milestoneId,
      );
      if (!milestone)
        throw new Error(
          "Candidate-prepare operation names an unknown milestone.",
        );
      const recovery = await inspectCandidatePrepareOperation({
        operation,
        milestone,
        protectedPatterns: enforcementProtectedPatterns(
          config,
          state.repository.protectedFiles,
        ),
        protectedFiles: state.repository.protectedFiles,
      });
      return {
        ...checkBase(
          "block",
          "candidate-operation-pending",
          "A candidate-prepare operation requires recovery.",
          recovery.nextSafeAction,
          recovery.disposition === "automatic"
            ? "pnpm loop:resume -- --one"
            : "pnpm loop:status -- --json",
        ),
        ...details,
        pendingOperation: {
          id: operation.id,
          kind: operation.kind,
          phase: operation.phase,
          classification: recovery.classification,
          disposition: recovery.disposition,
          workspacePath: operation.workspacePath,
          checkpointArtifactPath: operation.checkpointArtifactPath,
          preservedPaths: recovery.preservedPaths,
          nextSafeAction: recovery.nextSafeAction,
        },
        outcome: "candidate-operation-pending",
      };
    }
    if (state.pendingOperation.kind === "workspace-cleanup") {
      const recovery = await inspectWorkspaceCleanupOperation(
        state.pendingOperation,
      );
      return {
        ...checkBase(
          "block",
          "cleanup-operation-pending",
          "A workspace-cleanup operation requires recovery.",
          recovery.nextSafeAction,
          "pnpm loop:resume -- --one",
        ),
        ...details,
        pendingOperation: {
          id: state.pendingOperation.id,
          kind: state.pendingOperation.kind,
          phase: state.pendingOperation.phase,
          classification: recovery.classification,
          workspacePath: state.pendingOperation.workspacePath,
          diagnosticArchivePath: state.pendingOperation.diagnosticArchivePath,
          preservedPaths: recovery.preservedPaths,
          nextSafeAction: recovery.nextSafeAction,
        },
        outcome: "cleanup-operation-pending",
      };
    }
    if (state.pendingOperation.kind === "retention-apply") {
      const recovery = await inspectRetentionApplyOperation(
        state.pendingOperation,
      );
      return {
        ...checkBase(
          "block",
          "retention-operation-pending",
          "A retention-apply operation requires recovery.",
          recovery.nextSafeAction,
          "pnpm loop:resume -- --one",
        ),
        ...details,
        pendingOperation: {
          id: state.pendingOperation.id,
          kind: state.pendingOperation.kind,
          phase: state.pendingOperation.phase,
          classification: recovery.classification,
          completedDeletionCount: recovery.completedDeletionCount,
          deletionCount: recovery.deletionCount,
          currentPath: recovery.currentDeletion?.path ?? null,
          preservedPaths: recovery.preservedPaths,
          nextSafeAction: recovery.nextSafeAction,
        },
        outcome: "retention-operation-pending",
      };
    }
    const recovery = await inspectTargetIntegrationOperation(
      state.pendingOperation,
    );
    return {
      ...checkBase(
        "block",
        "target-operation-pending",
        "A target-integrate operation requires recovery.",
        recovery.nextSafeAction,
        "pnpm loop:resume -- --one",
      ),
      ...details,
      pendingOperation: {
        id: state.pendingOperation.id,
        kind: state.pendingOperation.kind,
        phase: state.pendingOperation.phase,
        classification: recovery.classification,
        targetClassification: recovery.target.classification,
        targetHead: recovery.target.head,
        workspacePath: state.pendingOperation.workspacePath,
        outcomePath: state.pendingOperation.outcomePath,
        nextSafeAction: recovery.nextSafeAction,
      },
      outcome: "target-operation-pending",
    };
  }
  if (state.reconciliation.active)
    return {
      ...checkBase(
        "block",
        "reconciliation-active",
        "External reconciliation is active.",
        "Resume the recorded reconciliation; do not start an ordinary loop mutation.",
        "pnpm loop:reconcile-status",
      ),
      ...details,
      pendingOperation: null,
      outcome: "reconciliation-active",
    };
  if (!head || head !== state.repository.verifiedCommit)
    return {
      ...checkBase(
        "block",
        "reconciliation-required",
        "Target HEAD differs from the stored verified commit.",
        "Inspect the exact external range and begin explicit reconciliation.",
        "pnpm loop:reconcile-status",
      ),
      ...details,
      pendingOperation: null,
      outcome: "reconciliation-required",
    };
  return {
    ...checkBase(
      "pass",
      "ok",
      "Canonical controller state matches target HEAD and has no pending operation.",
    ),
    ...details,
    pendingOperation: null,
    outcome: "valid",
  };
}

async function authenticationCheck(
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
): Promise<DoctorChecks["codexAuthentication"]> {
  if (environmentValue(environment, "CODEX_API_KEY")?.trim())
    return {
      ...checkBase(
        "pass",
        "ok",
        "Codex authentication is available from the environment.",
      ),
      available: true,
      source: "environment",
    };
  const configuredHome = environmentValue(environment, "CODEX_HOME")?.trim();
  const authenticationPath = join(
    configuredHome || join(homeDirectory, ".codex"),
    "auth.json",
  );
  try {
    const handle = await open(authenticationPath, "r");
    try {
      const metadata = await handle.stat();
      if (metadata.isFile() && metadata.size > 0)
        return {
          ...checkBase(
            "pass",
            "ok",
            "Codex authentication is available from local login state.",
          ),
          available: true,
          source: "local-login",
        };
    } finally {
      await handle.close();
    }
  } catch {
    // Only availability is reported; credential contents and paths stay private.
  }
  return {
    ...checkBase(
      "block",
      "codex-authentication-unavailable",
      "Codex authentication is unavailable.",
      "Authenticate the local Codex installation or supply the supported environment credential before starting an autonomous run.",
    ),
    available: false,
    source: "none",
  };
}

async function inspectProtectedRoot(
  repositoryRoot: string,
  path: string,
): Promise<DoctorChecks["protectedTrustRoots"]["roots"][number]> {
  const root = resolve(repositoryRoot);
  const absolute = resolve(root, path);
  try {
    const [metadata, resolvedRoot, resolvedPath] = await Promise.all([
      lstat(absolute),
      realpath(root),
      realpath(absolute),
    ]);
    return {
      path,
      present: true,
      regularFile: metadata.isFile() && !metadata.isSymbolicLink(),
      realpathContained: strictlyContained(resolvedRoot, resolvedPath),
    };
  } catch {
    return {
      path,
      present: false,
      regularFile: false,
      realpathContained: false,
    };
  }
}

async function protectedTrustRootsCheck(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
): Promise<DoctorChecks["protectedTrustRoots"]> {
  if (!config)
    return {
      ...checkBase(
        "warning",
        "protected-roots-not-checked",
        "Protected trust roots cannot be checked until configuration is valid.",
        "Repair configuration and rerun strict Doctor.",
      ),
      roots: [],
      manifestCovered: null,
    };
  let roots: DoctorChecks["protectedTrustRoots"]["roots"];
  try {
    roots = await Promise.all(
      buildCanonicalProtectedSet(config).map((path) =>
        inspectProtectedRoot(repositoryRoot, path),
      ),
    );
  } catch {
    return {
      ...checkBase(
        "block",
        "protected-roots-invalid",
        "The canonical protected-root set is invalid.",
        "Repair the protected-root configuration without reducing the required floor.",
      ),
      roots: [],
      manifestCovered: null,
    };
  }
  let manifestCovered: boolean | null = null;
  if (existsSync(resolve(repositoryRoot, DEFAULT_VERIFICATION_MANIFEST_PATH))) {
    try {
      const manifest = await loadActiveVerificationManifest(repositoryRoot);
      assertManifestProtectedPathsCovered(
        manifest.value,
        buildCanonicalProtectedSet(config),
      );
      manifestCovered = true;
    } catch {
      manifestCovered = false;
    }
  }
  const valid =
    roots.every(
      (root) => root.present && root.regularFile && root.realpathContained,
    ) && manifestCovered !== false;
  return {
    ...checkBase(
      valid ? "pass" : "block",
      valid ? "ok" : "protected-roots-missing-or-uncovered",
      valid
        ? "Every canonical protected trust root is present and manifest-covered."
        : "A canonical protected trust root is missing or not covered by commissioning.",
      valid
        ? null
        : "Restore the exact protected authority or repair commissioning without reducing the protected floor.",
    ),
    roots,
    manifestCovered,
  };
}

async function controllerLeaseCheck(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
): Promise<DoctorChecks["controllerLease"]> {
  if (!config)
    return {
      ...checkBase(
        "warning",
        "lease-not-checked",
        "Controller ownership cannot be checked until configuration is valid.",
        "Repair configuration and rerun strict Doctor.",
      ),
      reference: ControllerLease.leaseReference(),
      legacyGuard: "not-checked",
      present: false,
      malformed: false,
      owner: null,
    };
  const inspection = await ControllerLease.inspect(
    repositoryRoot,
    config.statePath,
  );
  const blocked = inspection.present || inspection.malformed;
  return {
    ...checkBase(
      blocked ? "block" : "pass",
      inspection.malformed
        ? "controller-lease-malformed"
        : inspection.present
          ? "controller-lease-active"
          : "ok",
      inspection.malformed
        ? "Controller lease authority is malformed."
        : inspection.present
          ? "Another controller lease is active."
          : "No controller lease is active and the legacy guard is valid.",
      blocked
        ? "Inspect controller ownership and wait for or recover the exact owner; never delete an ambiguous lease."
        : null,
      blocked ? "pnpm loop:status" : null,
    ),
    reference: inspection.reference,
    legacyGuard: inspection.legacyGuard,
    present: inspection.present,
    malformed: inspection.malformed,
    owner: inspection.owner,
  };
}

function latestAuthoritativeSummary(
  state: OrchestratorState,
): VerificationSummary | null {
  let latest: VerificationSummary | null = null;
  for (const milestone of state.milestones)
    for (const summary of milestone.verificationSummaries)
      if (
        summary.authoritative &&
        (!latest || summary.finishedAt >= latest.finishedAt)
      )
        latest = summary;
  return latest;
}

async function latestExactVerificationCheck(
  repositoryRoot: string,
  state: OrchestratorState | null,
  head: string | null,
  currentProvider: ExecutionProviderIdentity | null,
): Promise<DoctorChecks["latestExactVerification"]> {
  const unavailable = (
    code: string,
    message: string,
    remediation: string,
  ): DoctorChecks["latestExactVerification"] => ({
    ...checkBase("warning", code, message, remediation, "pnpm verify"),
    available: false,
    runId: null,
    resultPath: null,
    resultSha256: null,
    resultHashMatches: null,
    profile: null,
    candidateCommit: null,
    current: false,
    verificationStatus: null,
    completionEligible: false,
    autonomousReadinessEquivalent: false,
    executionProvider: null,
    providerMatchesCurrent: null,
  });
  if (!state)
    return unavailable(
      "exact-verification-unavailable",
      "No state-owned exact verification is recorded.",
      "Run the package-default no-argument verifier after the repository is configured and clean.",
    );
  const summary = latestAuthoritativeSummary(state);
  const authoritative = summary?.authoritative;
  if (!summary || !authoritative)
    return unavailable(
      "exact-verification-unavailable",
      "Controller state contains no authoritative exact verification.",
      "Run the package-default no-argument verifier through the milestone loop.",
    );

  const candidateCurrent =
    head !== null &&
    authoritative.candidateCommit === head &&
    state.repository.verifiedCommit === head;
  const resultSha256 = summary.authoritativeResultSha256;
  const providerMatchesCurrent =
    currentProvider !== null &&
    executionProviderIdentitiesEqual(
      authoritative.executionProvider,
      currentProvider,
    );
  let resultHashMatches = false;
  if (resultSha256) {
    try {
      const root = resolve(repositoryRoot);
      const resultPath = resolve(root, authoritative.copiedResultPath);
      const repositoryRelative = relative(root, resultPath);
      if (
        repositoryRelative.length > 0 &&
        !isAbsolute(repositoryRelative) &&
        !repositoryRelative.split(/[\\/]/).includes("..")
      ) {
        const [metadata, resolvedRoot, resolvedResult] = await Promise.all([
          lstat(resultPath),
          realpath(root),
          realpath(resultPath),
        ]);
        if (
          metadata.isFile() &&
          !metadata.isSymbolicLink() &&
          strictlyContained(resolvedRoot, resolvedResult)
        ) {
          const contents = await readFile(resolvedResult);
          resultHashMatches =
            createHash("sha256").update(contents).digest("hex") ===
            resultSha256;
        }
      }
    } catch {
      resultHashMatches = false;
    }
  }
  const eligible =
    summary.status === "PASS" &&
    authoritative.status === "PASS" &&
    authoritative.profileId === "readiness" &&
    authoritative.completionEligible &&
    authoritative.autonomousReadinessEquivalent &&
    authoritative.executionProvider.completionEligible &&
    providerMatchesCurrent &&
    candidateCurrent &&
    resultHashMatches;
  const code = !candidateCurrent
    ? "exact-verification-stale"
    : !resultHashMatches
      ? "exact-verification-artifact-invalid"
      : !providerMatchesCurrent
        ? "exact-verification-provider-mismatch"
        : authoritative.profileId !== "readiness"
          ? "exact-verification-profile-not-readiness"
          : !authoritative.completionEligible ||
              !authoritative.autonomousReadinessEquivalent ||
              !authoritative.executionProvider.completionEligible
            ? "exact-verification-ineligible"
            : authoritative.status !== "PASS" || summary.status !== "PASS"
              ? "exact-verification-not-pass"
              : "ok";
  return {
    ...checkBase(
      eligible ? "pass" : "warning",
      code,
      eligible
        ? "The latest state-owned exact readiness verification is current, intact, and completion-eligible."
        : "The latest state-owned exact verification cannot support current autonomous integration.",
      eligible
        ? null
        : "Run a fresh package-default no-argument verifier after resolving all blockers.",
      eligible ? null : "pnpm verify",
    ),
    available: true,
    runId: authoritative.runId,
    resultPath: authoritative.copiedResultPath,
    resultSha256,
    resultHashMatches,
    profile: authoritative.profileId,
    candidateCommit: authoritative.candidateCommit,
    current: candidateCurrent,
    verificationStatus: authoritative.status,
    completionEligible: authoritative.completionEligible,
    autonomousReadinessEquivalent: authoritative.autonomousReadinessEquivalent,
    executionProvider: authoritative.executionProvider,
    providerMatchesCurrent,
  };
}

function issueList(checks: DoctorChecks): readonly DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  for (const [id, check] of Object.entries(checks) as [
    DoctorCheckId,
    DoctorCheckBase,
  ][]) {
    if (check.status === "pass") continue;
    issues.push({
      code: check.code,
      check: id,
      severity: check.status,
      message: check.message,
      remediation: check.remediation ?? "Rerun strict Doctor after repair.",
      command: check.command,
    });
  }
  return issues;
}

function defaultNextCommand(state: OrchestratorState | null): {
  readonly command: string;
  readonly reason: string;
} {
  if (!state)
    return {
      command: "pnpm loop:plan",
      reason: "Controller state is safely uninitialized.",
    };
  if (state.nextAllowedAction === "plan")
    return {
      command: "pnpm loop:plan",
      reason: "Canonical state permits planning.",
    };
  if (state.nextAllowedAction === "reconcile")
    return {
      command: "pnpm loop:reconcile-status",
      reason: "Canonical state requires reconciliation.",
    };
  if (state.nextAllowedAction === "stop")
    return {
      command: "pnpm loop:status",
      reason: "Canonical state is stopped; inspect it before another action.",
    };
  return {
    command: "pnpm loop:resume -- --one",
    reason:
      "Canonical state permits the recorded " +
      state.nextAllowedAction +
      " transition.",
  };
}

export function doctorExitCode(
  diagnostic: Pick<DoctorDiagnostic, "status">,
  strict: boolean,
): 0 | 2 {
  return strict && diagnostic.status === "blocked" ? 2 : 0;
}

export async function runDoctorDiagnostic(
  input: {
    readonly repositoryRoot: string;
    readonly configPath?: string;
  },
  dependencies: DoctorDependencies = {},
): Promise<DoctorDiagnostic> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const environment = dependencies.environment ?? process.env;
  const pins = await configuredRuntimePins(repositoryRoot);
  const runningNode = normalizeNodeVersion(
    dependencies.nodeVersion ?? process.version,
  );
  const runningPnpm = runningPnpmVersion(environment);
  const runtimeMatches = pins.node === runningNode && pins.pnpm === runningPnpm;
  const runtimePins: DoctorChecks["runtimePins"] = {
    ...checkBase(
      runtimeMatches ? "pass" : "block",
      runtimeMatches ? "ok" : "runtime-pin-mismatch",
      runtimeMatches
        ? "Running Node and pnpm exactly match package pins."
        : "Running Node or pnpm does not match the exact package pin.",
      runtimeMatches
        ? null
        : "Use the repository-pinned Node and pnpm versions before any verification or loop action.",
    ),
    node: {
      configured: pins.node,
      running: runningNode,
      matches: pins.node !== null && pins.node === runningNode,
    },
    pnpm: {
      configured: pins.pnpm,
      running: runningPnpm,
      matches: pins.pnpm !== null && pins.pnpm === runningPnpm,
    },
  };

  const gitResult = (dependencies.gitProbe ?? defaultGitProbe)(repositoryRoot);
  const gitCleanliness: DoctorChecks["gitCleanliness"] = {
    ...checkBase(
      gitResult.clean === true ? "pass" : "block",
      gitResult.clean === true
        ? "ok"
        : gitResult.clean === false
          ? "git-working-tree-dirty"
          : "git-cleanliness-unavailable",
      gitResult.clean === true
        ? "The tracked, staged, and untracked working tree is clean."
        : gitResult.clean === false
          ? "The working tree contains tracked, staged, or untracked changes."
          : "Git cleanliness could not be determined.",
      gitResult.clean === true
        ? null
        : "Inspect every path and preserve unrelated or protected user content; do not hide or clean it to obtain readiness.",
      gitResult.clean === true ? null : "git status --short --branch",
    ),
    clean: gitResult.clean,
  };

  let config: OrchestratorConfig | null = null;
  try {
    const environmentConfigPath = environmentValue(
      environment,
      "MILESTONE_LOOP_CONFIG",
    );
    config = await loadConfigForInspection(
      repositoryRoot,
      input.configPath ?? environmentConfigPath ?? DEFAULT_CONFIG_PATH,
    );
  } catch {
    // Validation failures are summarized without echoing config contents.
  }
  const configuration: DoctorChecks["configuration"] = {
    ...checkBase(
      config ? "pass" : "block",
      config ? "ok" : "configuration-invalid",
      config
        ? "Orchestrator configuration is structurally valid."
        : "Orchestrator configuration is missing or structurally invalid.",
      config
        ? null
        : "Repair the configured JSON using the strict schema and rerun Doctor.",
    ),
    valid: config !== null,
  };

  let installedSdk: string | null = null;
  if (config) {
    try {
      installedSdk = (
        dependencies.installedSdkVersionProbe ?? installedCodexSdkVersion
      )();
    } catch {
      installedSdk = null;
    }
  }
  const sdkMatches =
    config !== null &&
    installedSdk !== null &&
    installedSdk === config.agentPolicy.sdk.version;
  const sdkCompatibility: DoctorChecks["sdkCompatibility"] = {
    ...checkBase(
      !config ? "warning" : sdkMatches ? "pass" : "block",
      !config
        ? "sdk-not-checked"
        : sdkMatches
          ? "ok"
          : installedSdk
            ? "sdk-version-mismatch"
            : "sdk-unavailable",
      !config
        ? "SDK compatibility cannot be checked until configuration is valid."
        : sdkMatches
          ? "The installed Codex SDK exactly matches the configured package and version."
          : "The installed Codex SDK is unavailable or does not match the configured version.",
      !config
        ? "Repair configuration and rerun strict Doctor."
        : sdkMatches
          ? null
          : "Restore dependencies from the frozen lockfile before starting live orchestration.",
      !config || sdkMatches ? null : "pnpm install --frozen-lockfile --offline",
    ),
    package: config?.agentPolicy.sdk.package ?? null,
    configuredVersion: config?.agentPolicy.sdk.version ?? null,
    installedVersion: installedSdk,
    matches: sdkMatches,
  };

  const commissioning = await commissioningCheck(
    repositoryRoot,
    dependencies.commissioningProbe ?? inspectCommissionedRepository,
  );
  const productionBuild = await productionBuildCheck(
    repositoryRoot,
    dependencies.productionBuildProbe ?? loadProductionBuildContract,
  );
  const placeholderScripts = await placeholderScriptsCheck(repositoryRoot);
  const configuredPaths = await configuredPathsCheck(repositoryRoot, config);
  const trustedCapability =
    config?.candidateExecution.mode === "trusted-container"
      ? inspectTrustedExecutionCapability(
          config.candidateExecution.trustedContainer,
          dependencies.executionProviderProbe,
        )
      : null;
  const providerIdentity = !config
    ? null
    : config.candidateExecution.mode === "unsafe-local-diagnostic"
      ? executionProviderIdentity({
          provider: "unsafe-local-diagnostic",
          implementation: LOCAL_SUPERVISOR_IMPLEMENTATION,
          runtimeName: "node",
          runtimeVersion: process.versions.node,
          imageDigest: null,
          mountPolicyVersion: UNSAFE_MOUNT_POLICY_VERSION,
          resourceLimitProfile: UNSAFE_RESOURCE_LIMIT_PROFILE,
          networkDisposition: "host-inherited",
          capabilityStatus: "ready",
          controlPlaneBound: true,
        })
      : executionProviderIdentity({
          provider: "trusted-container",
          implementation: trustedCapability?.implementation.available
            ? TRUSTED_CONTAINER_IMPLEMENTATION
            : null,
          runtimeName:
            trustedCapability?.runtime.name ??
            config.candidateExecution.trustedContainer.runtime,
          runtimeVersion: trustedCapability?.runtime.version ?? null,
          imageDigest:
            trustedCapability?.image.digest ??
            config.candidateExecution.trustedContainer.imageDigest,
          mountPolicyVersion:
            config.candidateExecution.trustedContainer.mountPolicyVersion,
          resourceLimitProfile:
            config.candidateExecution.trustedContainer.resourceLimitProfile,
          networkDisposition:
            config.candidateExecution.trustedContainer.networkDisposition,
          capabilityStatus:
            trustedCapability?.status ?? "missing-implementation",
          controlPlaneBound: true,
        });
  const providerReady =
    config?.candidateExecution.mode === "trusted-container" &&
    trustedCapability?.available === true &&
    providerIdentity?.completionEligible === true;
  const executionProvider: DoctorChecks["executionProvider"] = {
    ...checkBase(
      !config ? "warning" : providerReady ? "pass" : "block",
      !config
        ? "execution-provider-not-checked"
        : providerReady
          ? "ok"
          : config.candidateExecution.mode === "unsafe-local-diagnostic"
            ? "unsafe-local-provider"
            : trustedCapability?.available
              ? "trusted-provider-ineligible"
              : (trustedCapability?.status ?? "trusted-provider-unavailable"),
      !config
        ? "Execution-provider capability cannot be evaluated until configuration is valid."
        : config.candidateExecution.mode === "unsafe-local-diagnostic"
          ? "Unsafe local diagnostics are selected and cannot support completion or integration."
          : trustedCapability?.available
            ? "The active trusted-provider identity is not completion-eligible."
            : (trustedCapability?.message ??
              "Trusted execution capability is unavailable."),
      !config
        ? "Repair configuration and rerun strict Doctor."
        : providerReady
          ? null
          : "Configure and start the pinned trusted-container runtime/image/policy, then rerun strict Doctor.",
    ),
    configuredProvider: config?.candidateExecution.mode ?? null,
    trustedAvailable: trustedCapability?.available ?? false,
    trustedCapability,
    identity: providerIdentity,
  };

  const head = (dependencies.headProbe ?? defaultHeadProbe)(repositoryRoot);
  const stateSnapshot = await loadStateSnapshot(repositoryRoot, config);
  const protectedIntegrity = await inspectStoredProtectedIntegrity(
    repositoryRoot,
    stateSnapshot.state,
  );
  const state = await stateOutcome(
    repositoryRoot,
    config,
    stateSnapshot,
    head,
    protectedIntegrity,
  );
  const storedProtectedIntegrity = await storedProtectedIntegrityCheck(
    config,
    stateSnapshot,
    protectedIntegrity,
  );
  const latestExactVerification = await latestExactVerificationCheck(
    repositoryRoot,
    stateSnapshot.state,
    head,
    providerIdentity,
  );
  const codexAuthentication = await authenticationCheck(
    environment,
    dependencies.homeDirectory ?? homedir(),
  );
  const protectedTrustRoots = await protectedTrustRootsCheck(
    repositoryRoot,
    config,
  );
  const controllerLease = await controllerLeaseCheck(repositoryRoot, config);

  const eligibilityReasons: string[] = [];
  const requirePass = (
    id: Exclude<
      DoctorCheckId,
      "latestExactVerification" | "autonomousIntegrationEligibility"
    >,
    check: DoctorCheckBase,
  ) => {
    if (check.status !== "pass") eligibilityReasons.push(id);
  };
  requirePass("runtimePins", runtimePins);
  requirePass("gitCleanliness", gitCleanliness);
  requirePass("configuration", configuration);
  requirePass("sdkCompatibility", sdkCompatibility);
  requirePass("commissioning", commissioning);
  requirePass("productionBuild", productionBuild);
  requirePass("placeholderScripts", placeholderScripts);
  requirePass("configuredPaths", configuredPaths);
  requirePass("executionProvider", executionProvider);
  requirePass("state", state);
  requirePass("storedProtectedIntegrity", storedProtectedIntegrity);
  requirePass("codexAuthentication", codexAuthentication);
  requirePass("protectedTrustRoots", protectedTrustRoots);
  requirePass("controllerLease", controllerLease);
  if (commissioning.profile !== "readiness")
    eligibilityReasons.push("commissioning-profile-not-readiness");
  if (!head || commissioning.headCommit !== head)
    eligibilityReasons.push("commissioning-head-not-current");
  if (
    stateSnapshot.state &&
    commissioning.targetBranch !== stateSnapshot.state.repository.targetBranch
  )
    eligibilityReasons.push("commissioning-target-branch-mismatch");
  if (latestExactVerification.status !== "pass")
    eligibilityReasons.push("latestExactVerification");
  const integrationEligible = eligibilityReasons.length === 0;
  const autonomousIntegrationEligibility: DoctorChecks["autonomousIntegrationEligibility"] =
    {
      ...checkBase(
        integrationEligible ? "pass" : "warning",
        integrationEligible ? "ok" : "autonomous-integration-ineligible",
        integrationEligible
          ? "The current target satisfies every autonomous-integration prerequisite."
          : "The current target is not eligible for autonomous integration.",
        integrationEligible
          ? null
          : "Resolve every listed blocker/warning and obtain fresh completion-eligible readiness evidence.",
      ),
      eligible: integrationEligible,
      reasons: eligibilityReasons,
    };

  const checks: DoctorChecks = {
    runtimePins,
    gitCleanliness,
    configuration,
    sdkCompatibility,
    commissioning,
    productionBuild,
    placeholderScripts,
    configuredPaths,
    executionProvider,
    state,
    storedProtectedIntegrity,
    latestExactVerification,
    codexAuthentication,
    protectedTrustRoots,
    controllerLease,
    autonomousIntegrationEligibility,
  };
  const issues = issueList(checks);
  const passCount = Object.values(checks).filter(
    (check) => check.status === "pass",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const blockCount = issues.filter(
    (issue) => issue.severity === "block",
  ).length;
  const firstBlock = issues.find((issue) => issue.severity === "block");
  const actionableWarning = issues.find(
    (issue) => issue.severity === "warning" && issue.command !== null,
  );
  const fallback = defaultNextCommand(stateSnapshot.state);
  const nextAction = firstBlock
    ? firstBlock.command
      ? {
          command: firstBlock.command,
          reason: firstBlock.message,
        }
      : {
          command: "pnpm loop:doctor -- --strict",
          reason:
            "Manual repair is required for the earliest blocker; rerun strict Doctor afterward.",
        }
    : actionableWarning
      ? {
          command: actionableWarning.command,
          reason: actionableWarning.message,
        }
      : fallback;

  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    diagnostic: "orchestrator-doctor",
    status: blockCount === 0 ? "ready" : "blocked",
    readOnly: true,
    networkCallsPerformed: 0,
    summary: {
      passCount,
      warningCount,
      blockCount,
      autonomousIntegrationEligible: integrationEligible,
    },
    nextAction,
    issues,
    checks,
  };
}
