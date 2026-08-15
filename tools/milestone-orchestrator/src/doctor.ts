import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  loadConfig,
  loadVerificationManifest,
} from "./config.js";
import {
  ControllerLease,
  type ControllerLeaseInspection,
} from "./controller-lease.js";
import type { OrchestratorConfig } from "./contracts.js";
import {
  inspectTrustedExecutionCapability,
  type ExecutionProviderCapabilityProbe,
  type TrustedExecutionCapability,
} from "./execution-provider.js";
import {
  assertManifestProtectedPathsCovered,
  buildCanonicalProtectedSet,
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

export const DOCTOR_SCHEMA_VERSION = "1.7.0" as const;

type CheckStatus = "pass" | "attention";

export interface DoctorGitProbe {
  readonly clean: boolean | null;
}

export interface DoctorDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly nodeVersion?: string;
  readonly homeDirectory?: string;
  readonly gitProbe?: (repositoryRoot: string) => DoctorGitProbe;
  readonly headProbe?: (repositoryRoot: string) => string | null;
  readonly executionProviderProbe?: ExecutionProviderCapabilityProbe;
}

export interface DoctorDiagnostic {
  readonly schemaVersion: typeof DOCTOR_SCHEMA_VERSION;
  readonly diagnostic: "orchestrator-doctor";
  readonly status: "ready" | "attention";
  readonly readOnly: true;
  readonly networkCallsPerformed: 0;
  readonly checks: {
    readonly runtimePins: {
      readonly status: CheckStatus;
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
    readonly gitCleanliness: {
      readonly status: CheckStatus;
      readonly clean: boolean | null;
    };
    readonly configuration: {
      readonly status: CheckStatus;
      readonly valid: boolean;
    };
    readonly executionProvider: {
      readonly status: CheckStatus;
      readonly configuredProvider:
        "trusted-container" | "unsafe-local-diagnostic" | null;
      readonly trustedAvailable: boolean;
      readonly trustedCapability: TrustedExecutionCapability | null;
      readonly message: string;
    };
    readonly state: {
      readonly status: CheckStatus;
      readonly reference: typeof STATE_REF;
      readonly canonicalGeneration: string | null;
      readonly source:
        StateStoreInspection["source"] | "invalid" | "not-checked";
      readonly mirror:
        StateStoreInspection["mirror"] | "invalid" | "not-checked";
      readonly pendingOperation:
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
      readonly outcome:
        | "valid"
        | "missing"
        | "reconciliation-required"
        | "reconciliation-active"
        | "workspace-operation-pending"
        | "target-operation-pending"
        | "cleanup-operation-pending"
        | "retention-operation-pending"
        | "invalid-or-unreadable"
        | "not-checked";
    };
    readonly codexAuthentication: {
      readonly status: CheckStatus;
      readonly available: boolean;
      readonly source: "environment" | "local-login" | "none";
    };
    readonly protectedTrustRoots: {
      readonly status: CheckStatus;
      readonly roots: readonly {
        readonly path: string;
        readonly present: boolean;
      }[];
      readonly manifestCovered: boolean | null;
    };
    readonly controllerLease: {
      readonly status: CheckStatus;
      readonly reference: ControllerLeaseInspection["reference"];
      readonly legacyGuard:
        ControllerLeaseInspection["legacyGuard"] | "not-checked";
      readonly present: boolean;
      readonly malformed: boolean;
      readonly owner: ControllerLeaseInspection["owner"];
    };
  };
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

async function stateOutcome(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
  head: string | null,
): Promise<DoctorDiagnostic["checks"]["state"]> {
  if (!config)
    return {
      status: "attention",
      reference: STATE_REF,
      canonicalGeneration: null,
      source: "not-checked",
      mirror: "not-checked",
      pendingOperation: null,
      outcome: "not-checked",
    };
  try {
    const store = new StateStore(repositoryRoot, config.statePath);
    const [state, storage] = await Promise.all([store.load(), store.inspect()]);
    const details = {
      reference: storage.reference,
      canonicalGeneration: storage.canonicalGeneration,
      source: storage.source,
      mirror: storage.mirror,
    } as const;
    if (state?.pendingOperation) {
      if (state.pendingOperation.kind === "workspace-create") {
        const recovery = await inspectWorkspaceCreateOperation(
          state.pendingOperation,
        );
        return {
          status: "attention",
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
      if (state.pendingOperation.kind === "workspace-cleanup") {
        const recovery = await inspectWorkspaceCleanupOperation(
          state.pendingOperation,
        );
        return {
          status: "attention",
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
          status: "attention",
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
        status: "attention",
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
    if (state?.reconciliation.active)
      return {
        status: "attention",
        ...details,
        pendingOperation: null,
        outcome: "reconciliation-active",
      };
    if (state && head !== state.repository.verifiedCommit)
      return {
        status: "attention",
        ...details,
        pendingOperation: null,
        outcome: "reconciliation-required",
      };
    return {
      status: "pass",
      ...details,
      pendingOperation: null,
      outcome: state ? "valid" : "missing",
    };
  } catch {
    return {
      status: "attention",
      reference: STATE_REF,
      canonicalGeneration: null,
      source: "invalid",
      mirror: "invalid",
      pendingOperation: null,
      outcome: "invalid-or-unreadable",
    };
  }
}

async function authenticationCheck(
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
): Promise<DoctorDiagnostic["checks"]["codexAuthentication"]> {
  if (environmentValue(environment, "CODEX_API_KEY")?.trim()) {
    return { status: "pass", available: true, source: "environment" };
  }
  const configuredHome = environmentValue(environment, "CODEX_HOME")?.trim();
  const authenticationPath = join(
    configuredHome || join(homeDirectory, ".codex"),
    "auth.json",
  );
  try {
    const handle = await open(authenticationPath, "r");
    try {
      const metadata = await handle.stat();
      if (metadata.isFile() && metadata.size > 0) {
        return { status: "pass", available: true, source: "local-login" };
      }
    } finally {
      await handle.close();
    }
  } catch {
    // Availability is the only reported fact; credential contents and errors stay private.
  }
  return { status: "attention", available: false, source: "none" };
}

async function protectedTrustRootsCheck(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
): Promise<DoctorDiagnostic["checks"]["protectedTrustRoots"]> {
  if (!config) return { status: "attention", roots: [], manifestCovered: null };
  let roots: { path: string; present: boolean }[];
  try {
    roots = buildCanonicalProtectedSet(config).map((path) => ({
      path,
      present: existsSync(resolve(repositoryRoot, path)),
    }));
  } catch {
    return { status: "attention", roots: [], manifestCovered: null };
  }
  let manifestCovered: boolean | null = null;
  if (existsSync(resolve(repositoryRoot, DEFAULT_VERIFICATION_MANIFEST_PATH))) {
    try {
      const manifest = await loadVerificationManifest(repositoryRoot);
      assertManifestProtectedPathsCovered(
        manifest.value,
        buildCanonicalProtectedSet(config),
      );
      manifestCovered = true;
    } catch {
      manifestCovered = false;
    }
  }
  return {
    status:
      roots.every((root) => root.present) && manifestCovered !== false
        ? "pass"
        : "attention",
    roots,
    manifestCovered,
  };
}

async function controllerLeaseCheck(
  repositoryRoot: string,
  config: OrchestratorConfig | null,
): Promise<DoctorDiagnostic["checks"]["controllerLease"]> {
  if (!config)
    return {
      status: "attention",
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
  return {
    status: inspection.present || inspection.malformed ? "attention" : "pass",
    reference: inspection.reference,
    legacyGuard: inspection.legacyGuard,
    present: inspection.present,
    malformed: inspection.malformed,
    owner: inspection.owner,
  };
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
  const runtimePins: DoctorDiagnostic["checks"]["runtimePins"] = {
    status:
      pins.node === runningNode && pins.pnpm === runningPnpm
        ? "pass"
        : "attention",
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
  const gitCleanliness: DoctorDiagnostic["checks"]["gitCleanliness"] = {
    status: gitResult.clean === true ? "pass" : "attention",
    clean: gitResult.clean,
  };

  let config: OrchestratorConfig | null = null;
  try {
    const environmentConfigPath = environmentValue(
      environment,
      "MILESTONE_LOOP_CONFIG",
    );
    config = await loadConfig(
      repositoryRoot,
      input.configPath ?? environmentConfigPath ?? DEFAULT_CONFIG_PATH,
    );
  } catch {
    // Validation failures are summarized without echoing paths or config values.
  }
  const configuration: DoctorDiagnostic["checks"]["configuration"] = {
    status: config ? "pass" : "attention",
    valid: config !== null,
  };
  const trustedCapability = config
    ? inspectTrustedExecutionCapability(
        config.candidateExecution.trustedContainer,
        dependencies.executionProviderProbe,
      )
    : null;
  const executionProvider: DoctorDiagnostic["checks"]["executionProvider"] = {
    status:
      config?.candidateExecution.mode === "trusted-container" &&
      trustedCapability?.available === true
        ? "pass"
        : "attention",
    configuredProvider: config?.candidateExecution.mode ?? null,
    trustedAvailable: trustedCapability?.available ?? false,
    trustedCapability,
    message: !config
      ? "Execution-provider capability cannot be evaluated until configuration is valid."
      : config.candidateExecution.mode === "unsafe-local-diagnostic"
        ? "Unsafe local diagnostics are explicitly selected and cannot support completion or integration."
        : (trustedCapability?.message ??
          "Trusted execution capability is unavailable."),
  };
  const head = (dependencies.headProbe ?? defaultHeadProbe)(repositoryRoot);
  const state = await stateOutcome(repositoryRoot, config, head);
  const codexAuthentication = await authenticationCheck(
    environment,
    dependencies.homeDirectory ?? homedir(),
  );
  const protectedTrustRoots = await protectedTrustRootsCheck(
    repositoryRoot,
    config,
  );
  const controllerLease = await controllerLeaseCheck(repositoryRoot, config);
  const checks = {
    runtimePins,
    gitCleanliness,
    configuration,
    executionProvider,
    state,
    codexAuthentication,
    protectedTrustRoots,
    controllerLease,
  } as const;
  const ready = Object.values(checks).every((check) => check.status === "pass");

  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    diagnostic: "orchestrator-doctor",
    status: ready ? "ready" : "attention",
    readOnly: true,
    networkCallsPerformed: 0,
    checks,
  };
}
