import { spawnSync } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { DEFAULT_CONFIG_PATH, loadConfig } from "./config.js";
import type { OrchestratorConfig } from "./contracts.js";
import { StateStore } from "./state-store.js";

export const DOCTOR_SCHEMA_VERSION = "1.0.0" as const;

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
    readonly state: {
      readonly status: CheckStatus;
      readonly outcome:
        | "valid"
        | "missing"
        | "reconciliation-required"
        | "reconciliation-active"
        | "invalid-or-unreadable"
        | "not-checked";
    };
    readonly codexAuthentication: {
      readonly status: CheckStatus;
      readonly available: boolean;
      readonly source: "environment" | "local-login" | "none";
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
    ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
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
  if (!config) return { status: "attention", outcome: "not-checked" };
  try {
    const state = await new StateStore(repositoryRoot, config.statePath).load();
    if (state?.reconciliation.active)
      return { status: "attention", outcome: "reconciliation-active" };
    if (state && head !== state.repository.verifiedCommit)
      return { status: "attention", outcome: "reconciliation-required" };
    return {
      status: "pass",
      outcome: state ? "valid" : "missing",
    };
  } catch {
    return { status: "attention", outcome: "invalid-or-unreadable" };
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
  const head = (dependencies.headProbe ?? defaultHeadProbe)(repositoryRoot);
  const state = await stateOutcome(repositoryRoot, config, head);
  const codexAuthentication = await authenticationCheck(
    environment,
    dependencies.homeDirectory ?? homedir(),
  );
  const checks = {
    runtimePins,
    gitCleanliness,
    configuration,
    state,
    codexAuthentication,
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
