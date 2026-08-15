import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CommandExecutionSummary,
  OrchestratorConfig,
  TrustedContainerExecutionConfig,
  VerificationCommand,
} from "./contracts.js";
import {
  EXECUTION_PROVIDER_IDENTITY_ENV,
  LOCAL_SUPERVISOR_IMPLEMENTATION,
  TRUSTED_MOUNT_POLICY_VERSION,
  TRUSTED_RESOURCE_LIMIT_PROFILE,
  UNSAFE_MOUNT_POLICY_VERSION,
  UNSAFE_RESOURCE_LIMIT_PROFILE,
  encodeExecutionProviderIdentity,
  executionProviderIdentity,
  type ExecutionCapabilityStatus,
  type ExecutionProviderIdentity,
} from "./execution-provider-identity.js";
import {
  RUNNER_RECEIPT_ABSENCE_REASON,
  runCommand,
  type CommandRunnerOptions,
} from "./command-runner.js";
import { redactSensitiveText } from "./redaction.js";
import {
  CONTAINER_EXECUTOR_VERSION,
  createContainerCommandExecutor,
  parseContainerImageInspection,
} from "./container-executor.js";

export const EXECUTION_PROVIDER_CAPABILITY_SCHEMA_VERSION = "1.0.0" as const;
export const TRUSTED_CONTAINER_IMPLEMENTATION =
  "pinned-oci-container-executor" as const;

export interface ExecutionProviderCapabilityProbe {
  readonly implementation: () => {
    readonly available: boolean;
    readonly version: string | null;
  };
  readonly runtime: (name: "docker" | "podman") => {
    readonly available: boolean;
    readonly version: string | null;
  };
  readonly image: (
    runtime: "docker" | "podman",
    digest: string,
  ) => { readonly available: boolean };
  readonly policy: (config: TrustedContainerExecutionConfig) => {
    readonly compatible: boolean;
    readonly reason: string | null;
  };
}

export interface TrustedExecutionCapability {
  readonly schemaVersion: typeof EXECUTION_PROVIDER_CAPABILITY_SCHEMA_VERSION;
  readonly provider: "trusted-container";
  readonly status: ExecutionCapabilityStatus;
  readonly available: boolean;
  readonly capabilityId: string;
  readonly implementation: {
    readonly name: typeof TRUSTED_CONTAINER_IMPLEMENTATION;
    readonly available: boolean;
    readonly version: string | null;
  };
  readonly runtime: {
    readonly name: "docker" | "podman";
    readonly available: boolean;
    readonly version: string | null;
  };
  readonly image: {
    readonly digest: string | null;
    readonly available: boolean;
  };
  readonly policy: {
    readonly mountPolicyVersion: string;
    readonly resourceLimitProfile: string;
    readonly networkDisposition: "denied";
    readonly compatible: boolean;
    readonly reason: string | null;
  };
  readonly message: string;
}

function runtimeProbe(name: "docker" | "podman") {
  const args =
    name === "docker"
      ? ["version", "--format", "{{.Server.Version}}"]
      : ["version", "--format", "{{.Version}}"];
  const result = spawnSync(name, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    return { available: false, version: null } as const;
  const version = result.stdout.trim() || result.stderr.trim();
  return { available: true, version: version || null } as const;
}

export const defaultExecutionProviderCapabilityProbe: ExecutionProviderCapabilityProbe =
  Object.freeze({
    implementation: () => ({
      available: true,
      version: CONTAINER_EXECUTOR_VERSION,
    }),
    runtime: runtimeProbe,
    image: (runtime: "docker" | "podman", digest: string) => {
      const result = spawnSync(runtime, ["image", "inspect", digest], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      if (result.error || result.status !== 0) return { available: false };
      try {
        parseContainerImageInspection(
          Buffer.from(result.stdout, "utf8"),
          digest,
        );
        return { available: true };
      } catch {
        return { available: false };
      }
    },
    policy: (config: TrustedContainerExecutionConfig) => {
      const compatible =
        config.runtime === "docker" &&
        config.mountPolicyVersion === TRUSTED_MOUNT_POLICY_VERSION &&
        config.resourceLimitProfile === TRUSTED_RESOURCE_LIMIT_PROFILE &&
        config.networkDisposition === "denied";
      return {
        compatible,
        reason: compatible
          ? null
          : config.runtime !== "docker"
            ? "Trusted executor version 1.0.0 supports Docker Engine only; Podman policy attestation is not yet implemented."
            : `Trusted execution requires mount policy ${TRUSTED_MOUNT_POLICY_VERSION}, resource profile ${TRUSTED_RESOURCE_LIMIT_PROFILE}, and denied networking.`,
      };
    },
  });

function primaryStatus(input: {
  readonly implementationAvailable: boolean;
  readonly runtimeAvailable: boolean;
  readonly imageDigest: string | null;
  readonly imageAvailable: boolean;
  readonly policyCompatible: boolean;
}): ExecutionCapabilityStatus {
  if (!input.implementationAvailable) return "missing-implementation";
  if (!input.runtimeAvailable) return "missing-runtime";
  if (input.imageDigest === null || !input.imageAvailable)
    return "missing-pinned-image";
  if (!input.policyCompatible) return "policy-mismatch";
  return "ready";
}

function statusMessage(
  status: ExecutionCapabilityStatus,
  config: TrustedContainerExecutionConfig,
  policyReason: string | null,
): string {
  switch (status) {
    case "missing-implementation":
      return "Trusted container executor implementation is unavailable.";
    case "missing-runtime":
      return `Configured OCI runtime ${config.runtime} is unavailable.`;
    case "missing-pinned-image":
      return config.imageDigest === null
        ? "Trusted container execution requires an image pinned by sha256 digest."
        : `Pinned execution image ${config.imageDigest} is not present in the configured OCI runtime.`;
    case "policy-mismatch":
      return (
        policyReason ??
        "Trusted container policy capabilities do not match the required policy."
      );
    case "ready":
      return "The complete trusted-container capability is available.";
    default:
      return "Trusted container capability is not attested.";
  }
}

export function inspectTrustedExecutionCapability(
  config: TrustedContainerExecutionConfig,
  probe: ExecutionProviderCapabilityProbe = defaultExecutionProviderCapabilityProbe,
): TrustedExecutionCapability {
  const implementation = probe.implementation();
  const runtime = probe.runtime(config.runtime);
  const image =
    config.imageDigest !== null && runtime.available
      ? probe.image(config.runtime, config.imageDigest)
      : { available: false };
  const policy = probe.policy(config);
  const status = primaryStatus({
    implementationAvailable: implementation.available,
    runtimeAvailable: runtime.available,
    imageDigest: config.imageDigest,
    imageAvailable: image.available,
    policyCompatible: policy.compatible,
  });
  const identity = executionProviderIdentity({
    provider: "trusted-container",
    implementation: implementation.available
      ? TRUSTED_CONTAINER_IMPLEMENTATION
      : null,
    runtimeName: config.runtime,
    runtimeVersion: runtime.version,
    imageDigest: config.imageDigest,
    mountPolicyVersion: config.mountPolicyVersion,
    resourceLimitProfile: config.resourceLimitProfile,
    networkDisposition: config.networkDisposition,
    capabilityStatus: status,
    controlPlaneBound: true,
  });
  return {
    schemaVersion: EXECUTION_PROVIDER_CAPABILITY_SCHEMA_VERSION,
    provider: "trusted-container",
    status,
    available: status === "ready",
    capabilityId: identity.capabilityId,
    implementation: {
      name: TRUSTED_CONTAINER_IMPLEMENTATION,
      available: implementation.available,
      version: implementation.version,
    },
    runtime: {
      name: config.runtime,
      available: runtime.available,
      version: runtime.version,
    },
    image: { digest: config.imageDigest, available: image.available },
    policy: {
      mountPolicyVersion: config.mountPolicyVersion,
      resourceLimitProfile: config.resourceLimitProfile,
      networkDisposition: config.networkDisposition,
      compatible: policy.compatible,
      reason: policy.reason,
    },
    message: statusMessage(status, config, policy.reason),
  };
}

export type CandidateCommandExecutor = (
  command: VerificationCommand,
  options: CommandRunnerOptions,
) => Promise<CommandExecutionSummary>;

export interface CandidateExecutionProvider {
  readonly identity: ExecutionProviderIdentity;
  readonly capability: TrustedExecutionCapability | null;
  readonly execute: CandidateCommandExecutor;
}

export interface CandidateExecutionProviderDependencies {
  readonly localExecutor?: CandidateCommandExecutor;
  readonly trustedExecutor?: CandidateCommandExecutor;
  readonly capabilityProbe?: ExecutionProviderCapabilityProbe;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function unavailableResult(
  command: VerificationCommand,
  options: CommandRunnerOptions,
  identity: ExecutionProviderIdentity,
  message: string,
): Promise<CommandExecutionSummary> {
  const startedAt = new Date();
  await mkdir(options.artifactDirectory, { recursive: true });
  const stdoutPath = resolve(
    options.artifactDirectory,
    `${command.id}.stdout.log`,
  );
  const stderrPath = resolve(
    options.artifactDirectory,
    `${command.id}.stderr.log`,
  );
  const rendered = `${redactSensitiveText(message)}\n`;
  await writeFile(stdoutPath, "", "utf8");
  await writeFile(stderrPath, rendered, "utf8");
  const finishedAt = new Date();
  return {
    id: command.id,
    displayCommand: `${command.executable} ${command.args.join(" ")}`,
    status: "NOT_READY",
    exitCode: null,
    signal: null,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    stdoutPath,
    stderrPath,
    stdoutSha256: hash(""),
    stderrSha256: hash(rendered),
    parser: command.parser,
    parsedArtifactPath: null,
    message: redactSensitiveText(message),
    receipt: null,
    receiptAbsenceReason: RUNNER_RECEIPT_ABSENCE_REASON,
    executionProvider: identity,
  };
}

function withProviderEnvironment(
  options: CommandRunnerOptions,
  identity: ExecutionProviderIdentity,
): CommandRunnerOptions {
  return {
    ...options,
    extraEnvironment: {
      ...options.extraEnvironment,
      [EXECUTION_PROVIDER_IDENTITY_ENV]:
        encodeExecutionProviderIdentity(identity),
    },
  };
}

export function createCandidateExecutionProvider(
  config: OrchestratorConfig,
  dependencies: CandidateExecutionProviderDependencies = {},
): CandidateExecutionProvider {
  if (config.candidateExecution.mode === "unsafe-local-diagnostic") {
    const identity = executionProviderIdentity({
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
    });
    const executor = dependencies.localExecutor ?? runCommand;
    const provider: CandidateExecutionProvider = {
      identity,
      capability: null,
      execute: async (command, options) => {
        const result = await executor(
          command,
          withProviderEnvironment(options, identity),
        );
        return { ...result, executionProvider: identity };
      },
    };
    return Object.freeze(provider);
  }

  const capability = inspectTrustedExecutionCapability(
    config.candidateExecution.trustedContainer,
    dependencies.capabilityProbe,
  );
  const identity = executionProviderIdentity({
    provider: "trusted-container",
    implementation: capability.implementation.available
      ? TRUSTED_CONTAINER_IMPLEMENTATION
      : null,
    runtimeName: capability.runtime.name,
    runtimeVersion: capability.runtime.version,
    imageDigest: capability.image.digest,
    mountPolicyVersion: capability.policy.mountPolicyVersion,
    resourceLimitProfile: capability.policy.resourceLimitProfile,
    networkDisposition: capability.policy.networkDisposition,
    capabilityStatus: capability.status,
    controlPlaneBound: true,
  });
  const trustedExecutor =
    dependencies.trustedExecutor ??
    createContainerCommandExecutor(config.candidateExecution.trustedContainer);
  const provider: CandidateExecutionProvider = {
    identity,
    capability,
    execute: async (command, options) => {
      if (!capability.available)
        return unavailableResult(
          command,
          options,
          identity,
          capability.message,
        );
      const result = await trustedExecutor(
        command,
        withProviderEnvironment(options, identity),
      );
      return { ...result, executionProvider: identity };
    },
  };
  return Object.freeze(provider);
}
