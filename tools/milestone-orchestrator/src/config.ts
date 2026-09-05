import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  DEFAULT_COMMAND_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
  REQUIRED_PROTECTED_PATHS,
} from "./contracts.js";
import {
  TRUSTED_MOUNT_POLICY_VERSION,
  TRUSTED_RESOURCE_LIMIT_PROFILE,
} from "./execution-provider-identity.js";
import type {
  InvariantSuiteRegistry,
  LegacyVerificationManifest,
  OrchestratorConfig,
  SlowSuiteRegistry,
  VerificationManifest,
  VerificationProfile,
  VerificationScopePolicy,
} from "./contracts.js";
import { assertInstalledSdkCompatibility } from "./model-policy.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import {
  assertInvariantSuiteRegistry,
  assertLegacyVerificationManifest,
  assertOrchestratorConfig,
  assertSlowSuiteRegistry,
  assertVerificationManifest,
  assertVerificationScopePolicy,
} from "./schema.js";
import { resolveVerificationManifestProfile } from "./verification-manifest.js";

export const DEFAULT_CONFIG_PATH =
  "tools/milestone-orchestrator/config/default.json";
export const DEFAULT_VERIFICATION_MANIFEST_PATH =
  ".agent/verification-manifest.json";
export const HISTORICAL_VERIFICATION_MANIFEST_PATH =
  ".agent/completed/loop-recommissioning-verification.json";
export const SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH =
  "examples/ski-tycoon/loop-recommissioning-verification.json";
export const DEFAULT_INVARIANT_SUITE_PATH =
  "tools/milestone-orchestrator/config/invariant-suite.json";
export const DEFAULT_SLOW_SUITE_REGISTRY_PATH =
  "tools/milestone-orchestrator/config/slow-suite-registry.json";
export const DEFAULT_VERIFICATION_SCOPE_POLICY_PATH =
  "tools/milestone-orchestrator/config/verification-scope-policy.json";

export interface TrackedJson<T> {
  readonly path: string;
  readonly absolutePath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly value: T;
}

async function loadTrackedJson<T>(
  repositoryRoot: string,
  requestedPath: string,
  validate: (value: unknown) => T,
): Promise<TrackedJson<T>> {
  const root = resolve(repositoryRoot);
  const path = resolve(root, requestedPath);
  const repositoryRelative = relative(root, path).replaceAll("\\", "/");
  if (
    repositoryRelative.length === 0 ||
    isAbsolute(repositoryRelative) ||
    repositoryRelative.split("/").includes("..")
  )
    throw new Error(
      `Tracked configuration escapes the repository: ${requestedPath}.`,
    );
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Tracked configuration must be a regular non-symlink file: ${repositoryRelative}.`,
    );
  const resolvedRoot = await realpath(root);
  const resolvedPath = await realpath(path);
  const resolvedRelative = relative(resolvedRoot, resolvedPath).replaceAll(
    "\\",
    "/",
  );
  if (
    resolvedRelative.length === 0 ||
    isAbsolute(resolvedRelative) ||
    resolvedRelative.split("/").includes("..")
  )
    throw new Error(
      `Tracked configuration resolves outside the repository: ${repositoryRelative}.`,
    );
  const contents = await readFile(path);
  const parsed = JSON.parse(contents.toString("utf8")) as unknown;
  return {
    path: repositoryRelative,
    absolutePath: path,
    sha256: createHash("sha256").update(contents).digest("hex"),
    bytes: contents.byteLength,
    value: validate(parsed),
  };
}

export function loadVerificationManifest(
  repositoryRoot: string,
  requestedPath = DEFAULT_VERIFICATION_MANIFEST_PATH,
): Promise<TrackedJson<VerificationManifest>> {
  return loadTrackedJson(
    repositoryRoot,
    requestedPath,
    assertVerificationManifest,
  );
}

function assertPackageDefaultVerificationProfile(
  value: unknown,
): VerificationProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("package.json must be an object.");
  const milestoneLoop = (value as Record<string, unknown>)["milestoneLoop"];
  if (
    typeof milestoneLoop !== "object" ||
    milestoneLoop === null ||
    Array.isArray(milestoneLoop)
  )
    throw new Error(
      "package.json does not declare milestoneLoop.verification.defaultProfile.",
    );
  const verification = (milestoneLoop as Record<string, unknown>)[
    "verification"
  ];
  if (
    typeof verification !== "object" ||
    verification === null ||
    Array.isArray(verification)
  )
    throw new Error(
      "package.json does not declare milestoneLoop.verification.defaultProfile.",
    );
  const profile = (verification as Record<string, unknown>)["defaultProfile"];
  if (profile !== "bootstrap" && profile !== "readiness")
    throw new Error(
      "package.json milestoneLoop.verification.defaultProfile must be bootstrap or readiness.",
    );
  return profile;
}

export function loadPackageDefaultVerificationProfile(
  repositoryRoot: string,
): Promise<TrackedJson<VerificationProfile>> {
  return loadTrackedJson(
    repositoryRoot,
    "package.json",
    assertPackageDefaultVerificationProfile,
  );
}

export async function loadActiveVerificationManifest(
  repositoryRoot: string,
  requestedPath = DEFAULT_VERIFICATION_MANIFEST_PATH,
): Promise<
  TrackedJson<VerificationManifest> & {
    readonly packageDefaultProfile: VerificationProfile;
  }
> {
  const { assertActiveCommissioningAudit } =
    await import("./commissioning-audit.js");
  if (existsSync(resolve(repositoryRoot, ".git")))
    await assertActiveCommissioningAudit(repositoryRoot);
  const [manifest, packageProfile] = await Promise.all([
    loadVerificationManifest(repositoryRoot, requestedPath),
    loadPackageDefaultVerificationProfile(repositoryRoot),
  ]);
  return {
    ...manifest,
    packageDefaultProfile: resolveVerificationManifestProfile(
      manifest.value,
      packageProfile.value,
    ),
  };
}

export type HistoricalVerificationManifestContext =
  "source-benchmark" | "source-reconciliation" | "ski-tycoon-worked-example";

export async function loadHistoricalVerificationManifest(
  repositoryRoot: string,
  context: HistoricalVerificationManifestContext,
  requestedPath?: string,
): Promise<
  TrackedJson<LegacyVerificationManifest> & {
    readonly historicalRecordCommittedAt: string;
  }
> {
  const allowedPath =
    context === "ski-tycoon-worked-example"
      ? SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH
      : HISTORICAL_VERIFICATION_MANIFEST_PATH;
  const requested = requestedPath ?? allowedPath;
  const repositoryRelative = relative(
    resolve(repositoryRoot),
    resolve(repositoryRoot, requested),
  ).replaceAll("\\", "/");
  if (repositoryRelative !== allowedPath)
    throw new Error(
      `Historical verification manifest context ${context} permits only ${allowedPath}.`,
    );
  const tracked = await loadTrackedJson(
    repositoryRoot,
    repositoryRelative,
    assertLegacyVerificationManifest,
  );
  const commitTime = spawnSync(
    "git",
    [
      "-C",
      resolve(repositoryRoot),
      "log",
      "-1",
      "--format=%cI",
      "--",
      repositoryRelative,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const rawTimestamp =
    typeof commitTime.stdout === "string" ? commitTime.stdout.trim() : "";
  if (
    commitTime.error ||
    commitTime.status !== 0 ||
    !Number.isFinite(Date.parse(rawTimestamp))
  )
    throw new Error(
      `Historical verification manifest lacks a committed record timestamp: ${repositoryRelative}.`,
    );
  return {
    ...tracked,
    historicalRecordCommittedAt: new Date(rawTimestamp).toISOString(),
  };
}

export function loadInvariantSuiteRegistry(
  repositoryRoot: string,
  requestedPath = DEFAULT_INVARIANT_SUITE_PATH,
): Promise<TrackedJson<InvariantSuiteRegistry>> {
  return loadTrackedJson(
    repositoryRoot,
    requestedPath,
    assertInvariantSuiteRegistry,
  );
}

export function loadSlowSuiteRegistry(
  repositoryRoot: string,
  requestedPath = DEFAULT_SLOW_SUITE_REGISTRY_PATH,
): Promise<TrackedJson<SlowSuiteRegistry>> {
  return loadTrackedJson(
    repositoryRoot,
    requestedPath,
    assertSlowSuiteRegistry,
  );
}

export function loadVerificationScopePolicy(
  repositoryRoot: string,
  requestedPath = DEFAULT_VERIFICATION_SCOPE_POLICY_PATH,
): Promise<TrackedJson<VerificationScopePolicy>> {
  return loadTrackedJson(
    repositoryRoot,
    requestedPath,
    assertVerificationScopePolicy,
  );
}

function migrateConfig(value: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"].includes(
      String((value as Record<string, unknown>)["schemaVersion"]),
    )
  )
    return value;
  const legacy = value as Record<string, unknown>;
  const legacyProtectedPaths = Array.isArray(legacy["protectedPaths"])
    ? legacy["protectedPaths"].filter(
        (path): path is string => typeof path === "string",
      )
    : [];
  const legacyLimits =
    typeof legacy["limits"] === "object" &&
    legacy["limits"] !== null &&
    !Array.isArray(legacy["limits"])
      ? (legacy["limits"] as Record<string, unknown>)
      : {};
  return {
    ...legacy,
    schemaVersion: "1.6.0",
    evidenceRetention:
      legacy["schemaVersion"] === "1.0.0"
        ? {
            artifactRoot: "artifacts",
            keepRecentRuns: 20,
          }
        : legacy["evidenceRetention"],
    project: legacy["project"] ?? {
      name: "Example Project",
      authorityFile: "PROJECT_GOAL.md",
      verticalSpine: {
        minimumCategories: 4,
        categoryPatterns: [],
      },
    },
    limits: {
      commandOutputLimitBytes: DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
      commandKillGraceMs: DEFAULT_COMMAND_KILL_GRACE_MS,
      ...legacyLimits,
    },
    candidateExecution: {
      mode: "trusted-container",
      trustedContainer: {
        runtime: "docker",
        imageDigest: null,
        mountPolicyVersion: TRUSTED_MOUNT_POLICY_VERSION,
        resourceLimitProfile: TRUSTED_RESOURCE_LIMIT_PROFILE,
        networkDisposition: "denied",
      },
    },
    protectedPaths: [
      ...new Set([...legacyProtectedPaths, ...REQUIRED_PROTECTED_PATHS]),
    ],
  };
}

export async function loadConfigForInspection(
  repositoryRoot: string,
  requestedPath?: string,
): Promise<OrchestratorConfig> {
  const path = resolve(
    repositoryRoot,
    requestedPath ??
      process.env["MILESTONE_LOOP_CONFIG"] ??
      DEFAULT_CONFIG_PATH,
  );
  const parsed = migrateConfig(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
  const config = assertOrchestratorConfig(parsed);
  const sourcePath = relative(resolve(repositoryRoot), path).replaceAll(
    "\\",
    "/",
  );
  const sourceIsInsideRepository =
    sourcePath.length > 0 &&
    !isAbsolute(sourcePath) &&
    !sourcePath.split("/").includes("..");
  // A commissioned verification manifest is a verifier-equivalent input:
  // once it exists it joins the enforced protected set, so editing or
  // deleting it trips the diff fence and the recorded hash baseline.
  const commissionedManifestPaths = [
    DEFAULT_VERIFICATION_MANIFEST_PATH,
    HISTORICAL_VERIFICATION_MANIFEST_PATH,
  ].filter((path) => existsSync(resolve(repositoryRoot, path)));
  return {
    ...config,
    protectedPaths: buildCanonicalProtectedSet(config, [
      ...(sourceIsInsideRepository ? [sourcePath] : []),
      ...commissionedManifestPaths,
    ]),
  };
}

export async function loadConfig(
  repositoryRoot: string,
  requestedPath?: string,
): Promise<OrchestratorConfig> {
  const config = await loadConfigForInspection(repositoryRoot, requestedPath);
  assertInstalledSdkCompatibility(config.agentPolicy);
  return config;
}
