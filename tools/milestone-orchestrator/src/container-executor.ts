import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type {
  CommandExecutionSummary,
  TrustedContainerExecutionConfig,
  VerificationCommand,
} from "./contracts.js";
import {
  CONTAINER_IMAGE_CONTRACT_LABEL,
  CONTAINER_IMAGE_CONTRACT_VERSION,
  CONTAINER_IMAGE_INPUT_LABEL,
  CONTAINER_IMAGE_NODE_LABEL,
  CONTAINER_IMAGE_PNPM_LABEL,
  CONTAINER_IMAGE_USER,
  type ContainerImageInspection,
} from "./container-image.js";
import {
  assertCombinedContainerArtifactLimits,
  inventoryContainerArtifacts,
  publishContainerArtifacts,
  type ContainerArtifactInventory,
} from "./container-artifacts.js";
import {
  RUNNER_RECEIPT_ABSENCE_REASON,
  recordTelemetry,
  resolvePnpmScript,
  type CommandRunnerOptions,
} from "./command-runner.js";
import { assertSafeVerificationCommand } from "./command-policy.js";
import {
  EXECUTION_PROVIDER_IDENTITY_ENV,
  decodeExecutionProviderIdentity,
} from "./execution-provider-identity.js";
import {
  DEFAULT_COMMAND_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
  superviseCommand,
  type SupervisedExit,
} from "./process-supervisor.js";
import { redactSensitiveText, safeAgentEnvironment } from "./redaction.js";
import {
  createDisposableVerificationClone,
  type DisposableVerificationClone,
} from "./verification-clone.js";

export const CONTAINER_EXECUTOR_VERSION = "1.0.0" as const;
export const CONTAINER_EXECUTION_REPORT_SCHEMA_VERSION = "1.0.0" as const;

export const OCI_RESOURCE_LIMITS_V1 = Object.freeze({
  cpuCount: 2,
  memoryBytes: 2_147_483_648,
  pids: 256,
  nofile: 1_024,
  workspaceBytes: 1_073_741_824,
  workspaceInodes: 200_000,
  evidenceBytes: 268_435_456,
  evidenceInodes: 10_000,
  temporaryBytes: 268_435_456,
  temporaryInodes: 20_000,
  maximumArtifactFiles: 10_000,
  maximumArtifactBytes: 268_435_456,
});

const CONTROL_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;
const CONTROL_TIMEOUT_MS = 30_000;
const NODE_VERSION = "24.18.0";
const PNPM_VERSION = "11.15.1";
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const CONTAINER_ID = /^[a-f0-9]{12,64}$/;

export type OciRuntimeOperation =
  | "image-inspect"
  | "volume-preflight-workspace"
  | "volume-preflight-evidence"
  | "volume-create-workspace"
  | "volume-create-evidence"
  | "volume-inspect-workspace"
  | "volume-inspect-evidence"
  | "container-preflight"
  | "exporter-preflight"
  | "exporter-create"
  | "exporter-start"
  | "exporter-inspect"
  | "create"
  | "inspect-policy"
  | "start"
  | "inspect"
  | "artifact-preflight"
  | "copy-evidence"
  | "copy-workspace-artifacts"
  | "stop"
  | "kill"
  | "remove"
  | "confirm-removed"
  | "exporter-remove"
  | "exporter-confirm-removed"
  | "volume-remove-workspace"
  | "volume-remove-evidence"
  | "volume-confirm-removed-workspace"
  | "volume-confirm-removed-evidence"
  | "pnpm-store";

export interface OciRuntimeRequest {
  readonly operation: OciRuntimeOperation;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly killGraceMs: number;
  readonly outputLimitBytes: number;
}

export type OciRuntimeRunner = (
  request: OciRuntimeRequest,
) => Promise<SupervisedExit>;

export interface ContainerExecutorDependencies {
  readonly runRuntime?: OciRuntimeRunner;
  readonly createClone?: typeof createDisposableVerificationClone;
  readonly resolveStorePath?: (timeoutMs: number) => Promise<string>;
  readonly now?: () => Date;
  readonly monotonicNow?: () => bigint;
  readonly createId?: () => string;
}

interface LifecycleRecord {
  readonly operation: OciRuntimeOperation;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
}

interface ContainerState {
  readonly Status: string;
  readonly Running: boolean;
  readonly OOMKilled: boolean;
  readonly ExitCode: number;
  readonly Error: string;
}

interface RuntimePolicyAttestation {
  readonly schemaVersion: "1.0.0";
  readonly imageId: string;
  readonly user: typeof CONTAINER_IMAGE_USER;
  readonly networkMode: "none";
  readonly rootFilesystem: "read-only";
  readonly capabilities: "all-dropped";
  readonly noNewPrivileges: true;
  readonly privileged: false;
  readonly ipcMode: "none";
  readonly init: true;
  readonly logDriver: "none";
  readonly mountDestinations: readonly [
    "/evidence",
    "/pnpm-store/v11",
    "/source",
    "/workspace",
  ];
  readonly tmpfsDestinations: readonly ["/tmp"];
  readonly boundedVolumeDestinations: readonly ["/evidence", "/workspace"];
  readonly resources: typeof OCI_RESOURCE_LIMITS_V1;
}

interface ContainerVolumeAttestation {
  readonly schemaVersion: "1.0.0";
  readonly name: string;
  readonly kind: "workspace" | "evidence";
  readonly driver: "local";
  readonly filesystem: "tmpfs";
  readonly maximumBytes: number;
  readonly maximumInodes: number;
  readonly user: typeof CONTAINER_IMAGE_USER;
}

interface ContainerArtifactPreflight {
  readonly schemaVersion: "1.0.0";
  readonly fileCount: number;
  readonly totalBytes: number;
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function cleanId(value: string): string {
  return value
    .replaceAll(/[^a-z0-9_.-]/gi, "-")
    .toLowerCase()
    .slice(0, 24);
}

function safeMountPath(path: string, label: string): string {
  const absolute = resolve(path);
  if (/[\r\n,]/.test(absolute))
    throw new Error(
      `${label} contains characters unsupported by the fixed OCI mount policy.`,
    );
  return absolute;
}

async function assertOrdinaryMountSource(
  path: string,
  label: string,
): Promise<string> {
  const absolute = safeMountPath(path, label);
  const [actual, metadata] = await Promise.all([
    realpath(absolute),
    lstat(absolute),
  ]);
  if (
    resolve(actual) !== absolute ||
    !metadata.isDirectory() ||
    metadata.isSymbolicLink()
  )
    throw new Error(
      `${label} must be an ordinary directory with stable realpath identity.`,
    );
  return absolute;
}

function emptySupervision(outputLimitBytes: number) {
  const stream = {
    bytesCaptured: 0,
    totalBytesObserved: 0,
    truncated: false,
    capBytes: outputLimitBytes,
  };
  return {
    timedOut: false,
    outputLimitExceeded: false,
    terminationReason: null,
    termination: null,
    streamsClosed: true,
    drainTimedOut: false,
    drainCutoff: null,
    drainSweep: null,
    rootExitObserved: true,
    stdout: stream,
    stderr: stream,
    duplicateSettleSignals: [],
  } as const;
}

async function defaultRuntimeRunner(
  request: OciRuntimeRequest,
): Promise<SupervisedExit> {
  return superviseCommand({
    executable: request.executable,
    args: request.args,
    cwd: request.cwd,
    env: safeAgentEnvironment(),
    timeoutMs: request.timeoutMs,
    killGraceMs: request.killGraceMs,
    outputLimitBytes: request.outputLimitBytes,
  });
}

export async function resolveControllerPnpmStorePath(
  timeoutMs: number,
): Promise<string> {
  const pnpmScript = resolvePnpmScript();
  const executable = pnpmScript ? process.execPath : "pnpm";
  const args = pnpmScript
    ? [pnpmScript, "store", "path", "--silent"]
    : ["store", "path", "--silent"];
  const result = await superviseCommand({
    executable,
    args,
    cwd: process.cwd(),
    // This is a fixed controller-owned query with no candidate argv. HOME is
    // supplied only so pnpm resolves its real store; the resulting exact store
    // directory, not the home directory, is the sole read-only bind source.
    env: { ...safeAgentEnvironment(), HOME: homedir() },
    timeoutMs,
    killGraceMs: DEFAULT_COMMAND_KILL_GRACE_MS,
    outputLimitBytes: CONTROL_OUTPUT_LIMIT_BYTES,
  });
  if (
    result.exitCode !== 0 ||
    result.supervision.timedOut ||
    result.supervision.outputLimitExceeded
  )
    throw new Error("Could not resolve the controller's read-only pnpm store.");
  const path = result.stdout.toString("utf8").trim();
  if (!path) throw new Error("pnpm reported an empty store path.");
  return path;
}

function lifecycle(
  operation: OciRuntimeOperation,
  result: SupervisedExit,
): LifecycleRecord {
  return {
    operation,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.supervision.timedOut,
    outputLimitExceeded: result.supervision.outputLimitExceeded,
  };
}

function passed(result: SupervisedExit): boolean {
  return (
    result.spawnError === null &&
    result.exitCode === 0 &&
    !result.supervision.timedOut &&
    !result.supervision.outputLimitExceeded
  );
}

function confirmsRuntimeResourceAbsent(result: SupervisedExit): boolean {
  if (
    result.spawnError !== null ||
    result.exitCode === 0 ||
    result.supervision.timedOut ||
    result.supervision.outputLimitExceeded
  )
    return false;
  return /(?:no such (?:object|container|volume)|(?:container|volume) .* does not exist)/i.test(
    `${result.stderr.toString("utf8")}\n${result.stdout.toString("utf8")}`,
  );
}

function runtimeFailure(operation: string, result: SupervisedExit): Error {
  const detail = redactSensitiveText(
    result.stderr.toString("utf8") || result.stdout.toString("utf8"),
  )
    .replaceAll(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 2_000);
  const disposition = result.supervision.timedOut
    ? "timed out"
    : result.supervision.outputLimitExceeded
      ? "exceeded its output bound"
      : result.spawnError
        ? `could not start: ${result.spawnError.message}`
        : `exited ${result.exitCode ?? "without a status"}`;
  return new Error(
    `${operation} ${disposition}${detail ? `: ${detail}` : "."}`,
  );
}

export function parseContainerImageInspection(
  stdout: Buffer,
  expectedId: string,
): {
  readonly image: ContainerImageInspection;
  readonly inputHash: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error("OCI image inspection did not return JSON.");
  }
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  if (typeof entry !== "object" || entry === null)
    throw new Error("OCI image inspection is malformed.");
  const record = entry as Record<string, unknown>;
  const config = record["Config"];
  const labels =
    typeof config === "object" && config !== null
      ? (config as Record<string, unknown>)["Labels"]
      : null;
  const user =
    typeof config === "object" && config !== null
      ? (config as Record<string, unknown>)["User"]
      : null;
  if (
    record["Id"] !== expectedId ||
    record["Os"] !== "linux" ||
    typeof labels !== "object" ||
    labels === null ||
    user !== CONTAINER_IMAGE_USER
  )
    throw new Error(
      "OCI image identity, platform, or non-root user does not match policy.",
    );
  const labelRecord = labels as Record<string, unknown>;
  const inputHash = labelRecord[CONTAINER_IMAGE_INPUT_LABEL];
  if (
    labelRecord[CONTAINER_IMAGE_CONTRACT_LABEL] !==
      CONTAINER_IMAGE_CONTRACT_VERSION ||
    labelRecord[CONTAINER_IMAGE_NODE_LABEL] !== NODE_VERSION ||
    labelRecord[CONTAINER_IMAGE_PNPM_LABEL] !== PNPM_VERSION ||
    typeof inputHash !== "string" ||
    !HASH.test(inputHash)
  )
    throw new Error(
      "OCI image labels do not attest the required executor/toolchain inputs.",
    );
  return {
    image: {
      id: expectedId,
      user,
      labels: Object.fromEntries(
        Object.entries(labelRecord).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    },
    inputHash,
  };
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`OCI container ${label} is malformed.`);
  return value as Record<string, unknown>;
}

function emptyRuntimeCollection(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0)
  );
}

function exactStringSet(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === "string") &&
    [...value].sort().join("\0") === [...expected].sort().join("\0")
  );
}

function hasTmpfsOptions(value: unknown, expected: readonly string[]): boolean {
  if (typeof value !== "string") return false;
  const entries = value.split(",");
  const options = new Set(entries);
  return (
    entries.length === expected.length &&
    options.size === expected.length &&
    expected.every((entry) => options.has(entry))
  );
}

/**
 * Attests the runtime's interpreted container configuration before candidate
 * launch. This is deliberately independent of the argv constructor: a
 * runtime that drops, rewrites, or fails to apply a required boundary cannot
 * turn controller intent into trusted evidence.
 */
export function parseContainerPolicyInspection(
  stdout: Buffer,
  expected: {
    readonly imageId: string;
    readonly clonePath: string;
    readonly storePath: string;
    readonly workspaceVolume: string;
    readonly evidenceVolume: string;
    readonly containerName: string;
    readonly imageInputHash: string;
  },
): RuntimePolicyAttestation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error("OCI container policy inspection did not return JSON.");
  }
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const container = recordValue(entry, "policy inspection");
  const config = recordValue(container["Config"], "Config");
  const labels = recordValue(config["Labels"], "container labels");
  const host = recordValue(container["HostConfig"], "HostConfig");
  const restart = recordValue(host["RestartPolicy"], "restart policy");
  const log = recordValue(host["LogConfig"], "log configuration");
  const mounts = host["Mounts"];
  const tmpfs = recordValue(host["Tmpfs"], "tmpfs configuration");
  const security = host["SecurityOpt"];
  const securityEntries = Array.isArray(security)
    ? security.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (
    container["Image"] !== expected.imageId ||
    labels["io.milestone-loop.managed"] !== "true" ||
    labels["io.milestone-loop.execution"] !== expected.containerName ||
    labels["io.milestone-loop.image-input-sha256"] !==
      expected.imageInputHash ||
    config["User"] !== CONTAINER_IMAGE_USER ||
    config["WorkingDir"] !== "/workspace" ||
    !exactStringSet(config["Entrypoint"], ["/bin/sh"])
  )
    throw new Error(
      "OCI runtime did not apply the fixed image, user, entrypoint, or workdir policy.",
    );
  if (
    host["NetworkMode"] !== "none" ||
    host["ReadonlyRootfs"] !== true ||
    host["Privileged"] !== false ||
    host["IpcMode"] !== "none" ||
    host["Init"] !== true ||
    log["Type"] !== "none" ||
    restart["Name"] !== "no" ||
    host["AutoRemove"] !== false ||
    host["PublishAllPorts"] !== false ||
    host["PidMode"] !== "" ||
    host["UTSMode"] === "host" ||
    host["CgroupnsMode"] === "host"
  )
    throw new Error(
      "OCI runtime did not apply the fixed filesystem, IPC, logging, lifecycle, or network policy.",
    );
  if (
    !exactStringSet(host["CapDrop"], ["ALL"]) ||
    !emptyRuntimeCollection(host["CapAdd"]) ||
    securityEntries.length !== 1 ||
    !/^(?:no-new-privileges)(?:[=:]?true)?$/.test(securityEntries[0] ?? "")
  )
    throw new Error(
      `OCI runtime did not apply the fixed capability/no-new-privileges policy (CapDrop=${JSON.stringify(host["CapDrop"])}; CapAdd=${JSON.stringify(host["CapAdd"])}; SecurityOpt=${JSON.stringify(host["SecurityOpt"])}).`,
    );
  if (
    !emptyRuntimeCollection(host["Binds"]) ||
    !emptyRuntimeCollection(host["VolumesFrom"]) ||
    !emptyRuntimeCollection(host["Devices"]) ||
    !emptyRuntimeCollection(host["DeviceRequests"]) ||
    !emptyRuntimeCollection(host["PortBindings"])
  )
    throw new Error(
      "OCI runtime exposed an undeclared bind, volume, device, or port configuration.",
    );

  if (
    host["PidsLimit"] !== OCI_RESOURCE_LIMITS_V1.pids ||
    host["Memory"] !== OCI_RESOURCE_LIMITS_V1.memoryBytes ||
    host["MemorySwap"] !== OCI_RESOURCE_LIMITS_V1.memoryBytes ||
    host["NanoCpus"] !== OCI_RESOURCE_LIMITS_V1.cpuCount * 1_000_000_000
  )
    throw new Error(
      "OCI runtime did not apply the fixed CPU, memory, or PID limits.",
    );

  if (!Array.isArray(host["Ulimits"]))
    throw new Error("OCI runtime did not report fixed file/core limits.");
  const ulimits = host["Ulimits"] as unknown[];
  const hasNofile = ulimits.some((value) => {
    const entry = recordValue(value, "ulimit");
    return (
      entry["Name"] === "nofile" &&
      entry["Soft"] === OCI_RESOURCE_LIMITS_V1.nofile &&
      entry["Hard"] === OCI_RESOURCE_LIMITS_V1.nofile
    );
  });
  const hasCore = ulimits.some((value) => {
    const entry = recordValue(value, "ulimit");
    return (
      entry["Name"] === "core" && entry["Soft"] === 0 && entry["Hard"] === 0
    );
  });
  if (!hasNofile || !hasCore)
    throw new Error("OCI runtime did not apply the fixed file/core limits.");

  if (!Array.isArray(mounts) || mounts.length !== 4)
    throw new Error("OCI runtime reported an unexpected host-mount set.");
  const expectedMounts = new Map<
    string,
    {
      readonly type: "bind" | "volume";
      readonly source: string;
      readonly readOnly: boolean;
    }
  >([
    [
      "/source",
      {
        type: "bind",
        source: safeMountPath(expected.clonePath, "Verification clone"),
        readOnly: true,
      },
    ],
    [
      "/pnpm-store/v11",
      {
        type: "bind",
        source: safeMountPath(expected.storePath, "pnpm store"),
        readOnly: true,
      },
    ],
    [
      "/workspace",
      { type: "volume", source: expected.workspaceVolume, readOnly: false },
    ],
    [
      "/evidence",
      { type: "volume", source: expected.evidenceVolume, readOnly: false },
    ],
  ]);
  for (const value of mounts) {
    const mount = recordValue(value, "mount");
    const destination = mount["Target"];
    const expectation =
      typeof destination === "string"
        ? expectedMounts.get(destination)
        : undefined;
    if (
      typeof destination !== "string" ||
      expectation === undefined ||
      mount["Type"] !== expectation.type ||
      (mount["ReadOnly"] ?? false) !== expectation.readOnly ||
      mount["Source"] !== expectation.source
    )
      throw new Error(
        `OCI runtime reported an unexpected mount (destination=${String(destination)}; type=${String(mount["Type"])}; readOnly=${String(mount["ReadOnly"])}; sourceMatch=${String(mount["Source"] === expectation?.source)}).`,
      );
    if (expectation.type === "bind") {
      const bind = recordValue(mount["BindOptions"], "bind options");
      if (bind["Propagation"] !== "rprivate")
        throw new Error("OCI runtime did not apply private bind propagation.");
    } else {
      const volume = recordValue(mount["VolumeOptions"], "volume options");
      if (volume["NoCopy"] !== true)
        throw new Error("OCI runtime did not apply volume-nocopy.");
    }
    expectedMounts.delete(destination);
  }
  if (expectedMounts.size !== 0)
    throw new Error("OCI runtime omitted a required read-only host mount.");
  const actualMounts = container["Mounts"];
  if (!Array.isArray(actualMounts) || actualMounts.length !== 4)
    throw new Error("OCI runtime did not report the applied mount set.");
  const appliedMounts = new Map<
    string,
    {
      readonly type: "bind" | "volume";
      readonly source: string;
      readonly readWrite: boolean;
    }
  >([
    [
      "/source",
      {
        type: "bind",
        source: safeMountPath(expected.clonePath, "Verification clone"),
        readWrite: false,
      },
    ],
    [
      "/pnpm-store/v11",
      {
        type: "bind",
        source: safeMountPath(expected.storePath, "pnpm store"),
        readWrite: false,
      },
    ],
    [
      "/workspace",
      { type: "volume", source: expected.workspaceVolume, readWrite: true },
    ],
    [
      "/evidence",
      { type: "volume", source: expected.evidenceVolume, readWrite: true },
    ],
  ]);
  for (const value of actualMounts) {
    const mount = recordValue(value, "applied mount");
    const destination = mount["Destination"];
    const expectation =
      typeof destination === "string"
        ? appliedMounts.get(destination)
        : undefined;
    const source =
      expectation?.type === "volume" ? mount["Name"] : mount["Source"];
    if (
      typeof destination !== "string" ||
      expectation === undefined ||
      mount["Type"] !== expectation.type ||
      source !== expectation.source ||
      mount["RW"] !== expectation.readWrite
    )
      throw new Error(
        "OCI runtime applied an unexpected host or volume mount.",
      );
    appliedMounts.delete(destination);
  }
  if (appliedMounts.size !== 0)
    throw new Error("OCI runtime omitted an applied required mount.");

  const tmpfsKeys = Object.keys(tmpfs).sort();
  if (tmpfsKeys.join("\0") !== "/tmp")
    throw new Error("OCI runtime reported an unexpected tmpfs set.");
  const tmpfsExpectations: Readonly<Record<string, readonly string[]>> = {
    "/tmp": [
      "rw",
      "nosuid",
      "nodev",
      "noexec",
      `size=${OCI_RESOURCE_LIMITS_V1.temporaryBytes}`,
      `nr_inodes=${OCI_RESOURCE_LIMITS_V1.temporaryInodes}`,
      "uid=65532",
      "gid=65532",
      "mode=1777",
    ],
  };
  for (const [destination, options] of Object.entries(tmpfsExpectations))
    if (!hasTmpfsOptions(tmpfs[destination], options))
      throw new Error(
        `OCI runtime did not apply the fixed ${destination} tmpfs policy.`,
      );

  return {
    schemaVersion: "1.0.0",
    imageId: expected.imageId,
    user: CONTAINER_IMAGE_USER,
    networkMode: "none",
    rootFilesystem: "read-only",
    capabilities: "all-dropped",
    noNewPrivileges: true,
    privileged: false,
    ipcMode: "none",
    init: true,
    logDriver: "none",
    mountDestinations: [
      "/evidence",
      "/pnpm-store/v11",
      "/source",
      "/workspace",
    ],
    tmpfsDestinations: ["/tmp"],
    boundedVolumeDestinations: ["/evidence", "/workspace"],
    resources: OCI_RESOURCE_LIMITS_V1,
  };
}

function parseContainerState(stdout: Buffer): ContainerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error("OCI container state inspection did not return JSON.");
  }
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const state =
    typeof entry === "object" && entry !== null
      ? ((entry as Record<string, unknown>)["State"] ?? entry)
      : null;
  if (typeof state !== "object" || state === null)
    throw new Error("OCI container state inspection is malformed.");
  const record = state as Record<string, unknown>;
  if (
    typeof record["Status"] !== "string" ||
    typeof record["Running"] !== "boolean" ||
    typeof record["OOMKilled"] !== "boolean" ||
    typeof record["ExitCode"] !== "number" ||
    !Number.isSafeInteger(record["ExitCode"]) ||
    typeof record["Error"] !== "string"
  )
    throw new Error("OCI container state fields are malformed.");
  return record as unknown as ContainerState;
}

function boundedVolumeContract(kind: "workspace" | "evidence") {
  const workspace = kind === "workspace";
  return {
    maximumBytes: workspace
      ? OCI_RESOURCE_LIMITS_V1.workspaceBytes
      : OCI_RESOURCE_LIMITS_V1.evidenceBytes,
    maximumInodes: workspace
      ? OCI_RESOURCE_LIMITS_V1.workspaceInodes
      : OCI_RESOURCE_LIMITS_V1.evidenceInodes,
    options: [
      "nosuid",
      "nodev",
      ...(workspace ? [] : ["noexec"]),
      `size=${workspace ? OCI_RESOURCE_LIMITS_V1.workspaceBytes : OCI_RESOURCE_LIMITS_V1.evidenceBytes}`,
      `nr_inodes=${workspace ? OCI_RESOURCE_LIMITS_V1.workspaceInodes : OCI_RESOURCE_LIMITS_V1.evidenceInodes}`,
      "uid=65532",
      "gid=65532",
      "mode=0700",
    ],
  } as const;
}

function assertRuntimeResourceName(value: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(value))
    throw new Error(`${label} is not a safe OCI resource name.`);
  return value;
}

export function buildBoundedVolumeCreateArguments(input: {
  readonly name: string;
  readonly kind: "workspace" | "evidence";
  readonly executionId: string;
}): readonly string[] {
  const name = assertRuntimeResourceName(input.name, "Volume name");
  const executionId = assertRuntimeResourceName(
    input.executionId,
    "Execution ID",
  );
  const contract = boundedVolumeContract(input.kind);
  return [
    "volume",
    "create",
    "--driver",
    "local",
    "--label",
    "io.milestone-loop.managed=true",
    "--label",
    `io.milestone-loop.execution=${executionId}`,
    "--label",
    `io.milestone-loop.volume-kind=${input.kind}`,
    "--opt",
    "type=tmpfs",
    "--opt",
    "device=tmpfs",
    "--opt",
    `o=${contract.options.join(",")}`,
    name,
  ];
}

export function parseBoundedVolumeInspection(
  stdout: Buffer,
  expected: {
    readonly name: string;
    readonly kind: "workspace" | "evidence";
    readonly executionId: string;
  },
): ContainerVolumeAttestation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error("OCI bounded-volume inspection did not return JSON.");
  }
  const entry = recordValue(
    Array.isArray(parsed) ? parsed[0] : parsed,
    "bounded-volume inspection",
  );
  const labels = recordValue(entry["Labels"], "bounded-volume labels");
  const options = recordValue(entry["Options"], "bounded-volume options");
  const contract = boundedVolumeContract(expected.kind);
  if (
    entry["Name"] !== expected.name ||
    entry["Driver"] !== "local" ||
    entry["Scope"] !== "local" ||
    labels["io.milestone-loop.managed"] !== "true" ||
    labels["io.milestone-loop.execution"] !== expected.executionId ||
    labels["io.milestone-loop.volume-kind"] !== expected.kind ||
    options["type"] !== "tmpfs" ||
    options["device"] !== "tmpfs" ||
    typeof options["o"] !== "string" ||
    !exactStringSet(options["o"].split(","), contract.options)
  )
    throw new Error(
      "OCI runtime did not attest the bounded tmpfs volume contract.",
    );
  return {
    schemaVersion: "1.0.0",
    name: expected.name,
    kind: expected.kind,
    driver: "local",
    filesystem: "tmpfs",
    maximumBytes: contract.maximumBytes,
    maximumInodes: contract.maximumInodes,
    user: CONTAINER_IMAGE_USER,
  };
}

export function buildArtifactExporterCreateArguments(input: {
  readonly config: TrustedContainerExecutionConfig;
  readonly exporterName: string;
  readonly executionId: string;
  readonly workspaceVolume: string;
  readonly evidenceVolume: string;
}): readonly string[] {
  if (!input.config.imageDigest || !IMAGE_ID.test(input.config.imageDigest))
    throw new Error("Artifact exporter requires an immutable local image ID.");
  const exporterName = assertRuntimeResourceName(
    input.exporterName,
    "Exporter name",
  );
  const executionId = assertRuntimeResourceName(
    input.executionId,
    "Execution ID",
  );
  const workspaceVolume = assertRuntimeResourceName(
    input.workspaceVolume,
    "Workspace volume",
  );
  const evidenceVolume = assertRuntimeResourceName(
    input.evidenceVolume,
    "Evidence volume",
  );
  return [
    "create",
    "--pull=never",
    "--name",
    exporterName,
    "--label",
    "io.milestone-loop.managed=true",
    "--label",
    "io.milestone-loop.controller-helper=artifact-exporter",
    "--label",
    `io.milestone-loop.execution=${executionId}`,
    "--restart=no",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--user",
    CONTAINER_IMAGE_USER,
    "--pids-limit",
    "32",
    "--memory",
    String(64 * 1024 * 1024),
    "--memory-swap",
    String(64 * 1024 * 1024),
    "--cpus",
    "0.25",
    "--ulimit",
    "nofile=128:128",
    "--ulimit",
    "core=0:0",
    "--init",
    "--ipc=none",
    "--log-driver=none",
    "--workdir",
    "/tmp",
    "--mount",
    `type=volume,src=${workspaceVolume},dst=/workspace,readonly,volume-nocopy`,
    "--mount",
    `type=volume,src=${evidenceVolume},dst=/evidence,readonly,volume-nocopy`,
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=8388608,nr_inodes=1024,uid=65532,gid=65532,mode=0700",
    "--entrypoint",
    "/bin/sleep",
    input.config.imageDigest,
    "86400",
  ];
}

function mapExecutable(command: VerificationCommand): string {
  if (command.executable === "node") return "node";
  if (command.executable === "git") return "git";
  return "pnpm";
}

function fixedEnvironment(
  extra: Readonly<Record<string, string>> | undefined,
): readonly string[] {
  const values: Record<string, string> = {
    CI: "true",
    HOME: "/tmp/home",
    XDG_CACHE_HOME: "/tmp/cache",
    XDG_CONFIG_HOME: "/tmp/config",
    XDG_DATA_HOME: "/tmp/data",
    PNPM_HOME: "/tmp/pnpm-home",
    COREPACK_HOME: "/opt/corepack",
    NO_COLOR: "1",
  };
  const allowedExtraKeys = new Set([
    "LOOP_VERIFY_STAGE_ID",
    "LOOP_VERIFY_COMMAND_ID",
    "LOOP_VERIFY_COMMAND_ARTIFACT_DIR",
    "LOOP_TELEMETRY_PARENT_MANAGED",
    EXECUTION_PROVIDER_IDENTITY_ENV,
    // Controller-owned adversarial probes use deliberately unmounted paths.
    "LOOP_TEST_CANARY",
    "LOOP_TEST_TARGET",
    "LOOP_TEST_STATE",
  ]);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (!allowedExtraKeys.has(key))
      throw new Error(`Container environment entry ${key} is not allowlisted.`);
    if (/[\0\r\n]/.test(value))
      throw new Error(`Container environment entry ${key} is malformed.`);
    values[key] = value;
  }
  if ("LOOP_VERIFY_COMMAND_ARTIFACT_DIR" in values)
    values["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = "/evidence/command";
  const result: string[] = [];
  for (const [key, value] of Object.entries(values).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || value.includes("\0"))
      throw new Error(`Container environment entry ${key} is malformed.`);
    result.push("--env", `${key}=${value}`);
  }
  return result;
}

const ENTRYPOINT_SCRIPT = [
  "umask 077",
  "mkdir -p /tmp/home /tmp/cache /tmp/config /tmp/data /tmp/pnpm-home /evidence/command /workspace/artifacts",
  "cp -R --no-preserve=ownership /source/. /workspace/",
  "cd /workspace",
  'test "$(id -u)" != "0"',
  `test "$(node --version)" = "v${NODE_VERSION}"`,
  `test "$(pnpm --version)" = "${PNPM_VERSION}"`,
  "pnpm install --frozen-lockfile --offline --frozen-store --trust-lockfile --verify-store-integrity --package-import-method=copy --store-dir=/pnpm-store",
  'exec "$@"',
].join("\n");

const ARTIFACT_PREFLIGHT_SCRIPT = [
  'import { lstat, readdir } from "node:fs/promises";',
  'import { join } from "node:path";',
  'const roots = ["/evidence", "/workspace/artifacts"];',
  "let fileCount = 0;",
  "let totalBytes = 0;",
  "const directories = [];",
  "for (const root of roots) {",
  "  const metadata = await lstat(root);",
  '  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Artifact preflight root is not an ordinary directory.");',
  "  directories.push(root);",
  "}",
  "while (directories.length > 0) {",
  "  const directory = directories.pop();",
  "  for (const entry of await readdir(directory, { withFileTypes: true })) {",
  "    const path = join(directory, entry.name);",
  "    const metadata = await lstat(path);",
  '    if (entry.isSymbolicLink() || metadata.isSymbolicLink()) throw new Error("Container artifact is a symbolic link.");',
  "    if (metadata.isDirectory()) { directories.push(path); continue; }",
  '    if (!metadata.isFile()) throw new Error("Container artifact is not a regular file.");',
  '    if (metadata.nlink !== 1) throw new Error("Container artifact is a hard link.");',
  "    fileCount += 1;",
  "    totalBytes += metadata.size;",
  `    if (fileCount > ${OCI_RESOURCE_LIMITS_V1.maximumArtifactFiles}) throw new Error("Combined container artifacts exceed the file limit.");`,
  `    if (totalBytes > ${OCI_RESOURCE_LIMITS_V1.maximumArtifactBytes}) throw new Error("Combined container artifacts exceed the byte limit.");`,
  "  }",
  "}",
  'process.stdout.write(JSON.stringify({ schemaVersion: "1.0.0", fileCount, totalBytes }));',
].join("\n");

function parseContainerArtifactPreflight(
  stdout: Buffer,
): ContainerArtifactPreflight {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error("OCI artifact preflight did not return JSON.");
  }
  const record = recordValue(parsed, "artifact preflight");
  const fileCount = record["fileCount"];
  const totalBytes = record["totalBytes"];
  if (
    record["schemaVersion"] !== "1.0.0" ||
    typeof fileCount !== "number" ||
    !Number.isSafeInteger(fileCount) ||
    fileCount < 0 ||
    fileCount > OCI_RESOURCE_LIMITS_V1.maximumArtifactFiles ||
    typeof totalBytes !== "number" ||
    !Number.isSafeInteger(totalBytes) ||
    totalBytes < 0 ||
    totalBytes > OCI_RESOURCE_LIMITS_V1.maximumArtifactBytes
  )
    throw new Error("OCI artifact preflight returned invalid bounded totals.");
  return {
    schemaVersion: "1.0.0",
    fileCount,
    totalBytes,
  };
}

export function buildContainerCreateArguments(input: {
  readonly config: TrustedContainerExecutionConfig;
  readonly containerName: string;
  readonly clonePath: string;
  readonly storePath: string;
  readonly workspaceVolume: string;
  readonly evidenceVolume: string;
  readonly imageInputHash: string;
  readonly command: VerificationCommand;
  readonly extraEnvironment?: Readonly<Record<string, string>>;
  readonly killGraceMs: number;
}): readonly string[] {
  if (!input.config.imageDigest || !IMAGE_ID.test(input.config.imageDigest))
    throw new Error(
      "Trusted OCI execution requires an immutable local image ID.",
    );
  if (!HASH.test(input.imageInputHash))
    throw new Error("Trusted OCI execution requires an image-input hash.");
  const containerName = assertRuntimeResourceName(
    input.containerName,
    "Container name",
  );
  const source = safeMountPath(input.clonePath, "Verification clone");
  const store = safeMountPath(input.storePath, "pnpm store");
  const workspaceVolume = assertRuntimeResourceName(
    input.workspaceVolume,
    "Workspace volume",
  );
  const evidenceVolume = assertRuntimeResourceName(
    input.evidenceVolume,
    "Evidence volume",
  );
  const stopSeconds = Math.max(1, Math.ceil(input.killGraceMs / 1_000));
  return [
    "create",
    "--pull=never",
    "--name",
    containerName,
    "--label",
    "io.milestone-loop.managed=true",
    "--label",
    `io.milestone-loop.execution=${containerName}`,
    "--label",
    `io.milestone-loop.image-input-sha256=${input.imageInputHash}`,
    "--restart=no",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--user",
    CONTAINER_IMAGE_USER,
    "--pids-limit",
    String(OCI_RESOURCE_LIMITS_V1.pids),
    "--memory",
    String(OCI_RESOURCE_LIMITS_V1.memoryBytes),
    "--memory-swap",
    String(OCI_RESOURCE_LIMITS_V1.memoryBytes),
    "--cpus",
    String(OCI_RESOURCE_LIMITS_V1.cpuCount),
    "--ulimit",
    `nofile=${OCI_RESOURCE_LIMITS_V1.nofile}:${OCI_RESOURCE_LIMITS_V1.nofile}`,
    "--ulimit",
    "core=0:0",
    "--stop-timeout",
    String(stopSeconds),
    "--init",
    "--ipc=none",
    "--log-driver=none",
    "--workdir",
    "/workspace",
    "--mount",
    `type=bind,src=${source},dst=/source,readonly,bind-propagation=rprivate`,
    "--mount",
    `type=bind,src=${store},dst=/pnpm-store/v11,readonly,bind-propagation=rprivate`,
    "--mount",
    `type=volume,src=${workspaceVolume},dst=/workspace,volume-nocopy`,
    "--mount",
    `type=volume,src=${evidenceVolume},dst=/evidence,volume-nocopy`,
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,noexec,size=${OCI_RESOURCE_LIMITS_V1.temporaryBytes},nr_inodes=${OCI_RESOURCE_LIMITS_V1.temporaryInodes},uid=65532,gid=65532,mode=1777`,
    ...fixedEnvironment(input.extraEnvironment),
    "--entrypoint",
    "/bin/sh",
    input.config.imageDigest,
    "-eu",
    "-c",
    ENTRYPOINT_SCRIPT,
    "milestone-loop-exec",
    mapExecutable(input.command),
    ...input.command.args,
  ];
}

function candidateLog(
  data: Buffer,
  bytesCaptured: number,
  bytesObserved: number,
  truncated: boolean,
): string {
  const text = redactSensitiveText(data.toString("utf8"));
  if (!truncated) return text;
  const separator = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${separator}[output truncated: retained ${bytesCaptured} of ${bytesObserved} observed bytes]\n`;
}

export function createContainerCommandExecutor(
  config: TrustedContainerExecutionConfig,
  dependencies: ContainerExecutorDependencies = {},
) {
  const runRuntime = dependencies.runRuntime ?? defaultRuntimeRunner;
  const createClone =
    dependencies.createClone ?? createDisposableVerificationClone;
  const resolveStorePath =
    dependencies.resolveStorePath ?? resolveControllerPnpmStorePath;
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow =
    dependencies.monotonicNow ?? (() => process.hrtime.bigint());
  const createId = dependencies.createId ?? randomUUID;

  return async (
    command: VerificationCommand,
    options: CommandRunnerOptions,
  ): Promise<CommandExecutionSummary> => {
    const startedMonotonic = monotonicNow();
    const startedAt = now();
    await mkdir(options.artifactDirectory, { recursive: true });
    const stdoutPath = resolve(
      options.artifactDirectory,
      `${command.id}.stdout.log`,
    );
    const stderrPath = resolve(
      options.artifactDirectory,
      `${command.id}.stderr.log`,
    );
    const reportPath = resolve(
      options.artifactDirectory,
      `${command.id}.containment.json`,
    );
    const lifecycleRecords: LifecycleRecord[] = [];
    let clone: DisposableVerificationClone | null = null;
    let stagingRoot: string | null = null;
    let containerName: string | null = null;
    let containerId: string | null = null;
    let containerCleanupRequired = false;
    let exporterName: string | null = null;
    let exporterId: string | null = null;
    let exporterCleanupRequired = false;
    let exporterRemoved = false;
    let workspaceVolume: string | null = null;
    let evidenceVolume: string | null = null;
    let workspaceVolumeCleanupRequired = false;
    let evidenceVolumeCleanupRequired = false;
    let workspaceVolumeRemoved = false;
    let evidenceVolumeRemoved = false;
    let workspaceVolumeAttestation: ContainerVolumeAttestation | null = null;
    let evidenceVolumeAttestation: ContainerVolumeAttestation | null = null;
    let imageInputHash: string | null = null;
    let state: ContainerState | null = null;
    let runtimePolicy: RuntimePolicyAttestation | null = null;
    let startResult: SupervisedExit | null = null;
    let artifactPreflight: ContainerArtifactPreflight | null = null;
    let containerEvidenceArtifacts: ContainerArtifactInventory | null = null;
    let commandArtifacts: ContainerArtifactInventory | null = null;
    let workspaceArtifacts: ContainerArtifactInventory | null = null;
    let removed = false;
    let failure: Error | null = null;
    const runtime = config.runtime;
    const killGraceMs = options.killGraceMs ?? DEFAULT_COMMAND_KILL_GRACE_MS;
    const outputLimitBytes =
      options.outputLimitBytes ?? DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES;
    const timeoutMs = command.timeoutMs ?? options.timeoutMs;

    const invoke = async (
      operation: OciRuntimeOperation,
      args: readonly string[],
      operationTimeoutMs = CONTROL_TIMEOUT_MS,
      operationOutputLimitBytes = CONTROL_OUTPUT_LIMIT_BYTES,
    ): Promise<SupervisedExit> => {
      const result = await runRuntime({
        operation,
        executable: runtime,
        args,
        cwd: clone?.temporaryRoot ?? options.workingDirectory,
        timeoutMs: operationTimeoutMs,
        killGraceMs,
        outputLimitBytes: operationOutputLimitBytes,
      });
      lifecycleRecords.push(lifecycle(operation, result));
      return result;
    };

    try {
      assertSafeVerificationCommand(command);
      if (!config.imageDigest || !IMAGE_ID.test(config.imageDigest))
        throw new Error(
          "Trusted OCI execution requires an immutable local image ID.",
        );
      const imageResult = await invoke("image-inspect", [
        "image",
        "inspect",
        config.imageDigest,
      ]);
      if (!passed(imageResult))
        throw runtimeFailure("OCI image inspection", imageResult);
      imageInputHash = parseContainerImageInspection(
        imageResult.stdout,
        config.imageDigest,
      ).inputHash;
      const storePath = await assertOrdinaryMountSource(
        await resolveStorePath(Math.min(timeoutMs, CONTROL_TIMEOUT_MS)),
        "Controller pnpm store",
      );
      clone = await createClone({
        sourceRepository: options.workingDirectory,
        timeoutMs: Math.min(timeoutMs, CONTROL_TIMEOUT_MS),
      });
      await assertOrdinaryMountSource(
        clone.workspacePath,
        "Disposable verification clone",
      );
      stagingRoot = await realpath(
        await mkdtemp(join(tmpdir(), "milestone-loop-container-export-")),
      );
      containerName = `milestone-loop-${cleanId(command.id)}-${cleanId(createId()).slice(0, 24)}`;
      exporterName = `${containerName}-exporter`;
      workspaceVolume = `${containerName}-workspace`;
      evidenceVolume = `${containerName}-evidence`;
      for (const resource of [
        {
          operation: "container-preflight" as const,
          name: containerName,
          label: "candidate container",
        },
        {
          operation: "exporter-preflight" as const,
          name: exporterName,
          label: "artifact exporter",
        },
      ]) {
        const preflight = await invoke(resource.operation, [
          "inspect",
          resource.name,
        ]);
        if (!confirmsRuntimeResourceAbsent(preflight))
          throw new Error(`OCI ${resource.label} name is not provably unused.`);
      }
      for (const volume of [
        {
          kind: "workspace" as const,
          name: workspaceVolume,
          preflight: "volume-preflight-workspace" as const,
          create: "volume-create-workspace" as const,
          inspect: "volume-inspect-workspace" as const,
        },
        {
          kind: "evidence" as const,
          name: evidenceVolume,
          preflight: "volume-preflight-evidence" as const,
          create: "volume-create-evidence" as const,
          inspect: "volume-inspect-evidence" as const,
        },
      ]) {
        const preflight = await invoke(volume.preflight, [
          "volume",
          "inspect",
          volume.name,
        ]);
        if (!confirmsRuntimeResourceAbsent(preflight))
          throw new Error(
            `OCI ${volume.kind} volume name is not provably unused.`,
          );
        if (volume.kind === "workspace") workspaceVolumeCleanupRequired = true;
        else evidenceVolumeCleanupRequired = true;
        const createVolume = await invoke(
          volume.create,
          buildBoundedVolumeCreateArguments({
            name: volume.name,
            kind: volume.kind,
            executionId: containerName,
          }),
        );
        if (!passed(createVolume))
          throw runtimeFailure(
            `OCI ${volume.kind} volume creation`,
            createVolume,
          );
        if (createVolume.stdout.toString("utf8").trim() !== volume.name)
          throw new Error(
            `OCI runtime returned the wrong ${volume.kind} volume name.`,
          );
        const inspectVolume = await invoke(volume.inspect, [
          "volume",
          "inspect",
          volume.name,
        ]);
        if (!passed(inspectVolume))
          throw runtimeFailure(
            `OCI ${volume.kind} volume inspection`,
            inspectVolume,
          );
        const attestation = parseBoundedVolumeInspection(inspectVolume.stdout, {
          name: volume.name,
          kind: volume.kind,
          executionId: containerName,
        });
        if (volume.kind === "workspace")
          workspaceVolumeAttestation = attestation;
        else evidenceVolumeAttestation = attestation;
      }
      exporterCleanupRequired = true;
      const createExporter = await invoke(
        "exporter-create",
        buildArtifactExporterCreateArguments({
          config,
          exporterName,
          executionId: containerName,
          workspaceVolume,
          evidenceVolume,
        }),
      );
      if (!passed(createExporter))
        throw runtimeFailure("OCI artifact exporter creation", createExporter);
      exporterId = createExporter.stdout.toString("utf8").trim();
      if (!CONTAINER_ID.test(exporterId))
        throw new Error(
          "OCI runtime returned a malformed artifact-exporter ID.",
        );
      const startExporter = await invoke("exporter-start", [
        "start",
        exporterId,
      ]);
      if (!passed(startExporter))
        throw runtimeFailure("OCI artifact exporter start", startExporter);
      const inspectExporter = await invoke("exporter-inspect", [
        "inspect",
        exporterId,
      ]);
      if (!passed(inspectExporter))
        throw runtimeFailure(
          "OCI artifact exporter inspection",
          inspectExporter,
        );
      if (!parseContainerState(inspectExporter.stdout).Running)
        throw new Error(
          "OCI artifact exporter is not holding the bounded volumes.",
        );
      containerCleanupRequired = true;
      const createResult = await invoke(
        "create",
        buildContainerCreateArguments({
          config,
          containerName,
          clonePath: clone.workspacePath,
          storePath,
          workspaceVolume,
          evidenceVolume,
          imageInputHash,
          command,
          extraEnvironment: {
            ...options.extraEnvironment,
            ...(options.telemetry
              ? { LOOP_TELEMETRY_PARENT_MANAGED: "1" }
              : {}),
          },
          killGraceMs,
        }),
      );
      if (!passed(createResult))
        throw runtimeFailure("OCI container creation", createResult);
      containerId = createResult.stdout.toString("utf8").trim();
      if (!CONTAINER_ID.test(containerId))
        throw new Error("OCI runtime returned a malformed container ID.");
      const policyResult = await invoke("inspect-policy", [
        "inspect",
        containerId,
      ]);
      if (!passed(policyResult))
        throw runtimeFailure("OCI container policy inspection", policyResult);
      runtimePolicy = parseContainerPolicyInspection(policyResult.stdout, {
        imageId: config.imageDigest,
        clonePath: clone.workspacePath,
        storePath,
        workspaceVolume,
        evidenceVolume,
        containerName,
        imageInputHash,
      });
      startResult = await invoke(
        "start",
        ["start", "--attach", containerName],
        timeoutMs,
        outputLimitBytes,
      );
      if (
        startResult.supervision.timedOut ||
        startResult.supervision.outputLimitExceeded
      ) {
        const stopResult = await invoke("stop", [
          "stop",
          "--time",
          String(Math.max(1, Math.ceil(killGraceMs / 1_000))),
          containerName,
        ]);
        if (!passed(stopResult))
          await invoke("kill", ["kill", "--signal=KILL", containerName]);
      }
      let inspectResult = await invoke("inspect", ["inspect", containerName]);
      if (!passed(inspectResult))
        throw runtimeFailure("OCI container inspection", inspectResult);
      state = parseContainerState(inspectResult.stdout);
      if (
        startResult.spawnError !== null ||
        (!startResult.supervision.timedOut &&
          !startResult.supervision.outputLimitExceeded &&
          state.Status === "created")
      )
        throw runtimeFailure("OCI container start", startResult);
      if (state.Running) {
        const stopResult = await invoke("stop", [
          "stop",
          "--time",
          String(Math.max(1, Math.ceil(killGraceMs / 1_000))),
          containerName,
        ]);
        if (!passed(stopResult))
          await invoke("kill", ["kill", "--signal=KILL", containerName]);
        inspectResult = await invoke("inspect", ["inspect", containerName]);
        if (!passed(inspectResult))
          throw runtimeFailure(
            "Stopped OCI container inspection",
            inspectResult,
          );
        state = parseContainerState(inspectResult.stdout);
      }
      if (state.Running)
        throw new Error(
          "Candidate container remained alive after termination.",
        );

      const preflightResult = await invoke("artifact-preflight", [
        "exec",
        "--user",
        CONTAINER_IMAGE_USER,
        exporterId,
        "node",
        "--input-type=module",
        "--eval",
        ARTIFACT_PREFLIGHT_SCRIPT,
      ]);
      if (!passed(preflightResult))
        throw runtimeFailure("OCI artifact preflight", preflightResult);
      artifactPreflight = parseContainerArtifactPreflight(
        preflightResult.stdout,
      );

      const evidenceStaging = resolve(stagingRoot, "evidence");
      const workspaceStaging = resolve(stagingRoot, "workspace-artifacts");
      await Promise.all([
        mkdir(evidenceStaging, { recursive: true }),
        mkdir(workspaceStaging, { recursive: true }),
      ]);
      const copyEvidence = await invoke("copy-evidence", [
        "cp",
        `${exporterName}:/evidence/.`,
        evidenceStaging,
      ]);
      if (!passed(copyEvidence))
        throw runtimeFailure("OCI command-evidence export", copyEvidence);
      const copyWorkspace = await invoke("copy-workspace-artifacts", [
        "cp",
        `${exporterName}:/workspace/artifacts/.`,
        workspaceStaging,
      ]);
      if (!passed(copyWorkspace))
        throw runtimeFailure("OCI workspace-artifact export", copyWorkspace);
      const limits = {
        maximumFiles: OCI_RESOURCE_LIMITS_V1.maximumArtifactFiles,
        maximumBytes: OCI_RESOURCE_LIMITS_V1.maximumArtifactBytes,
      };
      containerEvidenceArtifacts = await inventoryContainerArtifacts(
        evidenceStaging,
        limits,
      );
      workspaceArtifacts = await inventoryContainerArtifacts(
        workspaceStaging,
        limits,
      );
      assertCombinedContainerArtifactLimits(
        [containerEvidenceArtifacts, workspaceArtifacts],
        limits,
      );
      const declaredEvidence =
        options.extraEnvironment?.["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"];
      if (declaredEvidence) {
        const commandSource = resolve(evidenceStaging, "command");
        await mkdir(commandSource, { recursive: true });
        commandArtifacts = await publishContainerArtifacts({
          sourceRoot: commandSource,
          destinationRoot: declaredEvidence,
          limits,
        });
      }
      workspaceArtifacts = await publishContainerArtifacts({
        sourceRoot: workspaceStaging,
        destinationRoot: resolve(options.workingDirectory, "artifacts"),
        limits,
      });
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      const cleanupFailure = (message: string) => {
        failure = new Error(
          failure ? `${failure.message} Cleanup: ${message}` : message,
        );
      };
      if (containerCleanupRequired && containerName) {
        const removeResult = await invoke("remove", [
          "rm",
          "--force",
          containerName,
        ]);
        const confirmResult = await invoke("confirm-removed", [
          "inspect",
          containerName,
        ]);
        removed =
          (passed(removeResult) ||
            confirmsRuntimeResourceAbsent(removeResult)) &&
          confirmsRuntimeResourceAbsent(confirmResult);
        if (!removed)
          cleanupFailure(
            "Candidate container cleanup could not be proven complete.",
          );
      }
      if (exporterCleanupRequired && exporterName) {
        const removeResult = await invoke("exporter-remove", [
          "rm",
          "--force",
          exporterName,
        ]);
        const confirmResult = await invoke("exporter-confirm-removed", [
          "inspect",
          exporterName,
        ]);
        exporterRemoved =
          (passed(removeResult) ||
            confirmsRuntimeResourceAbsent(removeResult)) &&
          confirmsRuntimeResourceAbsent(confirmResult);
        if (!exporterRemoved)
          cleanupFailure(
            "Artifact-exporter cleanup could not be proven complete.",
          );
      }
      if (workspaceVolumeCleanupRequired && workspaceVolume) {
        const removeResult = await invoke("volume-remove-workspace", [
          "volume",
          "rm",
          "--force",
          workspaceVolume,
        ]);
        const confirmResult = await invoke("volume-confirm-removed-workspace", [
          "volume",
          "inspect",
          workspaceVolume,
        ]);
        workspaceVolumeRemoved =
          (passed(removeResult) ||
            confirmsRuntimeResourceAbsent(removeResult)) &&
          confirmsRuntimeResourceAbsent(confirmResult);
        if (!workspaceVolumeRemoved)
          cleanupFailure(
            "Bounded workspace-volume cleanup could not be proven complete.",
          );
      }
      if (evidenceVolumeCleanupRequired && evidenceVolume) {
        const removeResult = await invoke("volume-remove-evidence", [
          "volume",
          "rm",
          "--force",
          evidenceVolume,
        ]);
        const confirmResult = await invoke("volume-confirm-removed-evidence", [
          "volume",
          "inspect",
          evidenceVolume,
        ]);
        evidenceVolumeRemoved =
          (passed(removeResult) ||
            confirmsRuntimeResourceAbsent(removeResult)) &&
          confirmsRuntimeResourceAbsent(confirmResult);
        if (!evidenceVolumeRemoved)
          cleanupFailure(
            "Bounded evidence-volume cleanup could not be proven complete.",
          );
      }
      if (clone) {
        try {
          await clone.cleanup();
        } catch (error) {
          cleanupFailure(
            `Disposable verification clone cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    }

    const finishedAt = now();
    const stdoutText = startResult
      ? candidateLog(
          startResult.stdout,
          startResult.supervision.stdout.bytesCaptured,
          startResult.supervision.stdout.totalBytesObserved,
          startResult.supervision.stdout.truncated,
        )
      : "";
    const stderrText = startResult
      ? candidateLog(
          startResult.stderr,
          startResult.supervision.stderr.bytesCaptured,
          startResult.supervision.stderr.totalBytesObserved,
          startResult.supervision.stderr.truncated,
        )
      : failure
        ? `${redactSensitiveText(failure.message)}\n`
        : "";
    await Promise.all([
      writeFile(stdoutPath, stdoutText, "utf8"),
      writeFile(stderrPath, stderrText, "utf8"),
    ]);

    const providerIdentity = decodeExecutionProviderIdentity(
      options.extraEnvironment?.[EXECUTION_PROVIDER_IDENTITY_ENV],
    );
    const report = {
      schemaVersion: CONTAINER_EXECUTION_REPORT_SCHEMA_VERSION,
      implementation: "pinned-oci-container-executor",
      implementationVersion: CONTAINER_EXECUTOR_VERSION,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      runtime: {
        name: runtime,
        serverVersion: providerIdentity?.runtime.version ?? null,
      },
      imageDigest: config.imageDigest,
      imageInputHash,
      capabilityId: providerIdentity?.capabilityId ?? null,
      executionProvider: providerIdentity,
      candidate: clone
        ? { commit: clone.sourceCommit, tree: clone.sourceTree }
        : null,
      container: {
        name: containerName,
        id: containerId,
        reused: false,
        state,
        removed,
      },
      artifactExporter: {
        name: exporterName,
        id: exporterId,
        reused: false,
        removed: exporterRemoved,
      },
      boundedVolumes: {
        workspace: {
          attestation: workspaceVolumeAttestation,
          removed: workspaceVolumeRemoved,
        },
        evidence: {
          attestation: evidenceVolumeAttestation,
          removed: evidenceVolumeRemoved,
        },
      },
      policy: {
        mountPolicyVersion: config.mountPolicyVersion,
        resourceLimitProfile: config.resourceLimitProfile,
        networkDisposition: config.networkDisposition,
        rootFilesystem: "read-only",
        user: CONTAINER_IMAGE_USER,
        capabilities: "all-dropped",
        noNewPrivileges: true,
        hostWritableMounts: 0,
        resources: OCI_RESOURCE_LIMITS_V1,
        runtimeAttestation: runtimePolicy,
      },
      command: {
        id: command.id,
        argvSha256: hash(JSON.stringify([command.executable, ...command.args])),
      },
      lifecycle: lifecycleRecords,
      artifacts: {
        preflight: artifactPreflight,
        containerEvidence: containerEvidenceArtifacts,
        publishedCommand: commandArtifacts,
        publishedWorkspace: workspaceArtifacts,
      },
      failure: failure ? redactSensitiveText(failure.message) : null,
    };
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(reportPath, reportText, { encoding: "utf8", flag: "wx" });
    const reportReference = {
      schemaVersion: CONTAINER_EXECUTION_REPORT_SCHEMA_VERSION,
      path: reportPath,
      sha256: hash(reportText),
      bytes: Buffer.byteLength(reportText),
    } as const;
    const status = failure
      ? "ERROR"
      : startResult?.supervision.timedOut
        ? "TIMEOUT"
        : startResult?.supervision.outputLimitExceeded
          ? "ERROR"
          : state?.ExitCode === 0 && startResult?.exitCode === 0
            ? "PASS"
            : "FAIL";
    const message = failure
      ? redactSensitiveText(failure.message)
      : status === "TIMEOUT"
        ? `Command timed out after ${timeoutMs} ms; its container was removed.`
        : startResult?.supervision.outputLimitExceeded
          ? `Command exceeded the ${outputLimitBytes}-byte per-stream output limit; its container was removed.`
          : state?.OOMKilled
            ? "Command exceeded its OCI memory limit."
            : status === "PASS"
              ? "Command exited zero inside a disposable OCI container."
              : `Command exited ${state?.ExitCode ?? startResult?.exitCode ?? "without a status"} inside a disposable OCI container.`;
    let summary: CommandExecutionSummary = {
      id: command.id,
      displayCommand: `${command.executable} ${command.args.join(" ")}`,
      status,
      exitCode: state?.ExitCode ?? startResult?.exitCode ?? null,
      signal: startResult?.signal ?? null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      stdoutPath,
      stderrPath,
      stdoutSha256: hash(stdoutText),
      stderrSha256: hash(stderrText),
      parser: command.parser,
      parsedArtifactPath: null,
      message,
      receipt: null,
      receiptAbsenceReason: RUNNER_RECEIPT_ABSENCE_REASON,
      ...(startResult ? { supervision: startResult.supervision } : {}),
      containmentReport: reportReference,
    };
    summary = await recordTelemetry(
      command,
      options,
      summary,
      startedMonotonic,
      monotonicNow(),
    );
    return summary;
  };
}

export function syntheticOciResult(
  input: {
    readonly exitCode?: number | null;
    readonly stdout?: string;
    readonly stderr?: string;
    readonly timedOut?: boolean;
    readonly outputLimitExceeded?: boolean;
  } = {},
): SupervisedExit {
  const stdout = Buffer.from(input.stdout ?? "");
  const stderr = Buffer.from(input.stderr ?? "");
  const cap = Math.max(stdout.length, stderr.length, 1_024);
  const supervision = emptySupervision(cap);
  return {
    exitCode: input.exitCode === undefined ? 0 : input.exitCode,
    signal: null,
    spawnError: null,
    stdout,
    stderr,
    supervision: {
      ...supervision,
      timedOut: input.timedOut ?? false,
      outputLimitExceeded: input.outputLimitExceeded ?? false,
      terminationReason: input.timedOut
        ? "timeout"
        : input.outputLimitExceeded
          ? "output-limit"
          : null,
      stdout: {
        ...supervision.stdout,
        bytesCaptured: stdout.length,
        totalBytesObserved: stdout.length,
        truncated: input.outputLimitExceeded ?? false,
      },
      stderr: {
        ...supervision.stderr,
        bytesCaptured: stderr.length,
        totalBytesObserved: stderr.length,
        truncated: input.outputLimitExceeded ?? false,
      },
    },
  };
}
