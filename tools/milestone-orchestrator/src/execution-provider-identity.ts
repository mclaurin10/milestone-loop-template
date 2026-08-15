import { createHash } from "node:crypto";

export const EXECUTION_PROVIDER_IDENTITY_SCHEMA_VERSION = "1.0.0" as const;
export const EXECUTION_PROVIDER_IDENTITY_ENV =
  "MILESTONE_LOOP_EXECUTION_PROVIDER_IDENTITY" as const;

export const EXECUTION_MODES = [
  "trusted-container",
  "unsafe-local-diagnostic",
] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const EXECUTION_CAPABILITY_STATUSES = [
  "ready",
  "missing-implementation",
  "missing-runtime",
  "missing-pinned-image",
  "policy-mismatch",
  "unattested",
  "invalid-configuration",
] as const;
export type ExecutionCapabilityStatus =
  (typeof EXECUTION_CAPABILITY_STATUSES)[number];

export const TRUSTED_MOUNT_POLICY_VERSION = "oci-mount-policy-v1" as const;
export const TRUSTED_RESOURCE_LIMIT_PROFILE = "oci-resource-limits-v1" as const;
export const UNSAFE_MOUNT_POLICY_VERSION = "uncontained-host-v1" as const;
export const UNSAFE_RESOURCE_LIMIT_PROFILE = "bounded-supervisor-v1" as const;
export const LOCAL_SUPERVISOR_IMPLEMENTATION =
  "shared-bounded-process-supervisor" as const;

export interface ExecutionProviderIdentity {
  readonly schemaVersion: typeof EXECUTION_PROVIDER_IDENTITY_SCHEMA_VERSION;
  readonly provider: ExecutionMode;
  readonly implementation: string | null;
  readonly runtime: {
    readonly name: string | null;
    readonly version: string | null;
  };
  readonly imageDigest: string | null;
  readonly mountPolicyVersion: string;
  readonly resourceLimitProfile: string;
  readonly networkDisposition: "denied" | "host-inherited";
  readonly capabilityId: string;
  readonly capabilityStatus: ExecutionCapabilityStatus;
  readonly controlPlaneBound: boolean;
  readonly completionEligible: boolean;
}

interface IdentityFacts {
  readonly provider: ExecutionMode;
  readonly implementation: string | null;
  readonly runtimeName: string | null;
  readonly runtimeVersion: string | null;
  readonly imageDigest: string | null;
  readonly mountPolicyVersion: string;
  readonly resourceLimitProfile: string;
  readonly networkDisposition: "denied" | "host-inherited";
  readonly capabilityStatus: ExecutionCapabilityStatus;
}

function capabilityId(facts: IdentityFacts): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: EXECUTION_PROVIDER_IDENTITY_SCHEMA_VERSION,
        provider: facts.provider,
        implementation: facts.implementation,
        runtime: {
          name: facts.runtimeName,
          version: facts.runtimeVersion,
        },
        imageDigest: facts.imageDigest,
        mountPolicyVersion: facts.mountPolicyVersion,
        resourceLimitProfile: facts.resourceLimitProfile,
        networkDisposition: facts.networkDisposition,
        capabilityStatus: facts.capabilityStatus,
      }),
    )
    .digest("hex");
}

function eligible(facts: IdentityFacts, controlPlaneBound: boolean): boolean {
  return (
    controlPlaneBound &&
    facts.provider === "trusted-container" &&
    facts.capabilityStatus === "ready" &&
    facts.implementation !== null &&
    facts.runtimeName !== null &&
    facts.runtimeVersion !== null &&
    facts.imageDigest !== null &&
    facts.mountPolicyVersion === TRUSTED_MOUNT_POLICY_VERSION &&
    facts.resourceLimitProfile === TRUSTED_RESOURCE_LIMIT_PROFILE &&
    facts.networkDisposition === "denied"
  );
}

export function executionProviderIdentity(
  facts: IdentityFacts & { readonly controlPlaneBound: boolean },
): ExecutionProviderIdentity {
  const identity: ExecutionProviderIdentity = {
    schemaVersion: EXECUTION_PROVIDER_IDENTITY_SCHEMA_VERSION,
    provider: facts.provider,
    implementation: facts.implementation,
    runtime: { name: facts.runtimeName, version: facts.runtimeVersion },
    imageDigest: facts.imageDigest,
    mountPolicyVersion: facts.mountPolicyVersion,
    resourceLimitProfile: facts.resourceLimitProfile,
    networkDisposition: facts.networkDisposition,
    capabilityId: capabilityId(facts),
    capabilityStatus: facts.capabilityStatus,
    controlPlaneBound: facts.controlPlaneBound,
    completionEligible: eligible(facts, facts.controlPlaneBound),
  };
  return Object.freeze({
    ...identity,
    runtime: Object.freeze(identity.runtime),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isExecutionProviderIdentity(
  value: unknown,
): value is ExecutionProviderIdentity {
  if (!isRecord(value)) return false;
  const keys = [
    "schemaVersion",
    "provider",
    "implementation",
    "runtime",
    "imageDigest",
    "mountPolicyVersion",
    "resourceLimitProfile",
    "networkDisposition",
    "capabilityId",
    "capabilityStatus",
    "controlPlaneBound",
    "completionEligible",
  ] as const;
  const runtime = value["runtime"];
  if (
    !hasOnlyKeys(value, keys) ||
    keys.some((key) => !(key in value)) ||
    value["schemaVersion"] !== EXECUTION_PROVIDER_IDENTITY_SCHEMA_VERSION ||
    !EXECUTION_MODES.includes(value["provider"] as never) ||
    (value["implementation"] !== null &&
      (typeof value["implementation"] !== "string" ||
        value["implementation"].length === 0)) ||
    !isRecord(runtime) ||
    !hasOnlyKeys(runtime, ["name", "version"]) ||
    !("name" in runtime) ||
    !("version" in runtime) ||
    (runtime["name"] !== null &&
      (typeof runtime["name"] !== "string" || runtime["name"].length === 0)) ||
    (runtime["version"] !== null &&
      (typeof runtime["version"] !== "string" ||
        runtime["version"].length === 0)) ||
    (value["imageDigest"] !== null &&
      (typeof value["imageDigest"] !== "string" ||
        !/^sha256:[a-f0-9]{64}$/.test(value["imageDigest"]))) ||
    typeof value["mountPolicyVersion"] !== "string" ||
    value["mountPolicyVersion"].length === 0 ||
    typeof value["resourceLimitProfile"] !== "string" ||
    value["resourceLimitProfile"].length === 0 ||
    !["denied", "host-inherited"].includes(
      String(value["networkDisposition"]),
    ) ||
    typeof value["capabilityId"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(value["capabilityId"]) ||
    !EXECUTION_CAPABILITY_STATUSES.includes(
      value["capabilityStatus"] as never,
    ) ||
    typeof value["controlPlaneBound"] !== "boolean" ||
    typeof value["completionEligible"] !== "boolean"
  )
    return false;
  const facts: IdentityFacts = {
    provider: value["provider"] as ExecutionMode,
    implementation: value["implementation"] as string | null,
    runtimeName: runtime["name"] as string | null,
    runtimeVersion: runtime["version"] as string | null,
    imageDigest: value["imageDigest"] as string | null,
    mountPolicyVersion: value["mountPolicyVersion"] as string,
    resourceLimitProfile: value["resourceLimitProfile"] as string,
    networkDisposition: value["networkDisposition"] as
      "denied" | "host-inherited",
    capabilityStatus: value["capabilityStatus"] as ExecutionCapabilityStatus,
  };
  return (
    value["capabilityId"] === capabilityId(facts) &&
    value["completionEligible"] ===
      eligible(facts, value["controlPlaneBound"] as boolean)
  );
}

export function assertExecutionProviderIdentity(
  value: unknown,
): ExecutionProviderIdentity {
  if (!isExecutionProviderIdentity(value))
    throw new Error("Execution-provider identity is missing or malformed.");
  return value;
}

export function executionProviderIdentitiesEqual(
  left: ExecutionProviderIdentity | null | undefined,
  right: ExecutionProviderIdentity | null | undefined,
): boolean {
  return (
    isExecutionProviderIdentity(left) &&
    isExecutionProviderIdentity(right) &&
    left.schemaVersion === right.schemaVersion &&
    left.provider === right.provider &&
    left.implementation === right.implementation &&
    left.runtime.name === right.runtime.name &&
    left.runtime.version === right.runtime.version &&
    left.imageDigest === right.imageDigest &&
    left.mountPolicyVersion === right.mountPolicyVersion &&
    left.resourceLimitProfile === right.resourceLimitProfile &&
    left.networkDisposition === right.networkDisposition &&
    left.capabilityId === right.capabilityId &&
    left.capabilityStatus === right.capabilityStatus &&
    left.controlPlaneBound === right.controlPlaneBound &&
    left.completionEligible === right.completionEligible
  );
}

export function encodeExecutionProviderIdentity(
  identity: ExecutionProviderIdentity,
): string {
  return JSON.stringify(assertExecutionProviderIdentity(identity));
}

export function decodeExecutionProviderIdentity(
  serialized: string | undefined,
): ExecutionProviderIdentity | null {
  if (!serialized) return null;
  try {
    return assertExecutionProviderIdentity(JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
}

export function unattestedExecutionProviderIdentity(
  value: unknown,
  nodeVersion: string,
): ExecutionProviderIdentity {
  if (!isRecord(value))
    return executionProviderIdentity({
      provider: "trusted-container",
      implementation: null,
      runtimeName: null,
      runtimeVersion: null,
      imageDigest: null,
      mountPolicyVersion: "invalid-configuration",
      resourceLimitProfile: "invalid-configuration",
      networkDisposition: "denied",
      capabilityStatus: "invalid-configuration",
      controlPlaneBound: false,
    });
  const execution = value["candidateExecution"];
  if (!isRecord(execution))
    return unattestedExecutionProviderIdentity(null, nodeVersion);
  const trusted = execution["trustedContainer"];
  const mode = execution["mode"];
  if (
    !EXECUTION_MODES.includes(mode as never) ||
    !isRecord(trusted) ||
    typeof trusted["runtime"] !== "string" ||
    (trusted["imageDigest"] !== null &&
      typeof trusted["imageDigest"] !== "string") ||
    typeof trusted["mountPolicyVersion"] !== "string" ||
    typeof trusted["resourceLimitProfile"] !== "string"
  )
    return unattestedExecutionProviderIdentity(null, nodeVersion);
  return executionProviderIdentity({
    provider: mode as ExecutionMode,
    implementation:
      mode === "unsafe-local-diagnostic"
        ? LOCAL_SUPERVISOR_IMPLEMENTATION
        : null,
    runtimeName:
      mode === "unsafe-local-diagnostic"
        ? "node"
        : (trusted["runtime"] as string),
    runtimeVersion: mode === "unsafe-local-diagnostic" ? nodeVersion : null,
    imageDigest:
      mode === "unsafe-local-diagnostic"
        ? null
        : (trusted["imageDigest"] as string | null),
    mountPolicyVersion:
      mode === "unsafe-local-diagnostic"
        ? UNSAFE_MOUNT_POLICY_VERSION
        : (trusted["mountPolicyVersion"] as string),
    resourceLimitProfile:
      mode === "unsafe-local-diagnostic"
        ? UNSAFE_RESOURCE_LIMIT_PROFILE
        : (trusted["resourceLimitProfile"] as string),
    networkDisposition:
      mode === "unsafe-local-diagnostic" ? "host-inherited" : "denied",
    capabilityStatus: "unattested",
    controlPlaneBound: false,
  });
}
