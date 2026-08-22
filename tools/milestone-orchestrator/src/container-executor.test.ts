import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrustedContainerExecutionConfig } from "./contracts.js";
import {
  CONTAINER_EXECUTION_REPORT_SCHEMA_VERSION,
  OCI_RESOURCE_LIMITS_V1,
  buildArtifactExporterCreateArguments,
  buildBoundedVolumeCreateArguments,
  buildContainerCreateArguments,
  createContainerCommandExecutor,
  parseBoundedVolumeInspection,
  parseContainerPolicyInspection,
  syntheticOciResult,
  type OciRuntimeOperation,
  type OciRuntimeRequest,
} from "./container-executor.js";
import {
  CONTAINER_IMAGE_CONTRACT_LABEL,
  CONTAINER_IMAGE_INPUT_LABEL,
  CONTAINER_IMAGE_NODE_LABEL,
  CONTAINER_IMAGE_PNPM_LABEL,
} from "./container-image.js";
import {
  EXECUTION_PROVIDER_IDENTITY_ENV,
  encodeExecutionProviderIdentity,
  executionProviderIdentity,
} from "./execution-provider-identity.js";
import type { DisposableVerificationClone } from "./verification-clone.js";

const roots: string[] = [];
const imageId = `sha256:${"a".repeat(64)}`;
const imageInputHash = "b".repeat(64);
const containerId = "c".repeat(64);
const providerIdentity = executionProviderIdentity({
  provider: "trusted-container",
  implementation: "pinned-oci-container-executor",
  runtimeName: "docker",
  runtimeVersion: "29.1.3",
  imageDigest: imageId,
  mountPolicyVersion: "oci-mount-policy-v1",
  resourceLimitProfile: "oci-resource-limits-v1",
  networkDisposition: "denied",
  capabilityStatus: "ready",
  controlPlaneBound: true,
});

afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const config: TrustedContainerExecutionConfig = {
  runtime: "docker",
  imageDigest: imageId,
  mountPolicyVersion: "oci-mount-policy-v1",
  resourceLimitProfile: "oci-resource-limits-v1",
  networkDisposition: "denied",
};

function imageInspection() {
  return JSON.stringify([
    {
      Id: imageId,
      Os: "linux",
      Config: {
        User: "65532:65532",
        Labels: {
          [CONTAINER_IMAGE_CONTRACT_LABEL]: "1.0.0",
          [CONTAINER_IMAGE_INPUT_LABEL]: imageInputHash,
          [CONTAINER_IMAGE_NODE_LABEL]: "24.18.0",
          [CONTAINER_IMAGE_PNPM_LABEL]: "11.15.1",
        },
      },
    },
  ]);
}

function stoppedState(exitCode = 0, status = "exited", running = false) {
  return JSON.stringify([
    {
      State: {
        Status: status,
        Running: running,
        OOMKilled: false,
        ExitCode: exitCode,
        Error: "",
      },
    },
  ]);
}

function policyInspection(
  clonePath: string,
  storePath: string,
  workspaceVolume: string,
  evidenceVolume: string,
  networkMode = "none",
  containerName = "milestone-loop-check",
) {
  return JSON.stringify([
    {
      Image: imageId,
      Config: {
        User: "65532:65532",
        WorkingDir: "/workspace",
        Entrypoint: ["/bin/sh"],
        Labels: {
          "io.milestone-loop.managed": "true",
          "io.milestone-loop.execution": containerName,
          "io.milestone-loop.image-input-sha256": imageInputHash,
        },
      },
      Mounts: [
        {
          Type: "bind",
          Source: resolve(clonePath),
          Destination: "/source",
          RW: false,
        },
        {
          Type: "bind",
          Source: resolve(storePath),
          Destination: "/pnpm-store/v11",
          RW: false,
        },
        {
          Type: "volume",
          Name: workspaceVolume,
          Destination: "/workspace",
          RW: true,
        },
        {
          Type: "volume",
          Name: evidenceVolume,
          Destination: "/evidence",
          RW: true,
        },
      ],
      HostConfig: {
        NetworkMode: networkMode,
        ReadonlyRootfs: true,
        Privileged: false,
        IpcMode: "none",
        Init: true,
        LogConfig: { Type: "none", Config: {} },
        RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
        AutoRemove: false,
        PublishAllPorts: false,
        PidMode: "",
        UTSMode: "",
        CgroupnsMode: "private",
        CapDrop: ["ALL"],
        CapAdd: null,
        SecurityOpt: ["no-new-privileges=true"],
        Binds: null,
        VolumesFrom: null,
        Devices: [],
        DeviceRequests: null,
        PortBindings: {},
        PidsLimit: OCI_RESOURCE_LIMITS_V1.pids,
        Memory: OCI_RESOURCE_LIMITS_V1.memoryBytes,
        MemorySwap: OCI_RESOURCE_LIMITS_V1.memoryBytes,
        NanoCpus: OCI_RESOURCE_LIMITS_V1.cpuCount * 1_000_000_000,
        Ulimits: [
          {
            Name: "nofile",
            Soft: OCI_RESOURCE_LIMITS_V1.nofile,
            Hard: OCI_RESOURCE_LIMITS_V1.nofile,
          },
          { Name: "core", Soft: 0, Hard: 0 },
        ],
        Mounts: [
          {
            Type: "bind",
            Source: resolve(clonePath),
            Target: "/source",
            ReadOnly: true,
            BindOptions: { Propagation: "rprivate" },
          },
          {
            Type: "bind",
            Source: resolve(storePath),
            Target: "/pnpm-store/v11",
            ReadOnly: true,
            BindOptions: { Propagation: "rprivate" },
          },
          {
            Type: "volume",
            Source: workspaceVolume,
            Target: "/workspace",
            ReadOnly: false,
            VolumeOptions: { NoCopy: true },
          },
          {
            Type: "volume",
            Source: evidenceVolume,
            Target: "/evidence",
            ReadOnly: false,
            VolumeOptions: { NoCopy: true },
          },
        ],
        Tmpfs: {
          "/tmp": `rw,nosuid,nodev,noexec,size=${OCI_RESOURCE_LIMITS_V1.temporaryBytes},nr_inodes=${OCI_RESOURCE_LIMITS_V1.temporaryInodes},uid=65532,gid=65532,mode=1777`,
        },
      },
    },
  ]);
}

function volumeInspection(
  name: string,
  kind: "workspace" | "evidence",
  executionId: string,
) {
  const workspace = kind === "workspace";
  const options = [
    "nosuid",
    "nodev",
    ...(workspace ? [] : ["noexec"]),
    `size=${workspace ? OCI_RESOURCE_LIMITS_V1.workspaceBytes : OCI_RESOURCE_LIMITS_V1.evidenceBytes}`,
    `nr_inodes=${workspace ? OCI_RESOURCE_LIMITS_V1.workspaceInodes : OCI_RESOURCE_LIMITS_V1.evidenceInodes}`,
    "uid=65532",
    "gid=65532",
    "mode=0700",
  ];
  return JSON.stringify([
    {
      Name: name,
      Driver: "local",
      Scope: "local",
      Labels: {
        "io.milestone-loop.managed": "true",
        "io.milestone-loop.execution": executionId,
        "io.milestone-loop.volume-kind": kind,
      },
      Options: { type: "tmpfs", device: "tmpfs", o: options.join(",") },
    },
  ]);
}

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "milestone-loop-container-test-")),
  );
  roots.push(root);
  const working = join(root, "candidate");
  const cloneRoot = join(root, "clone-root");
  const cloneWorkspace = join(cloneRoot, "workspace");
  const store = join(root, "store");
  await Promise.all([
    mkdir(working, { recursive: true }),
    mkdir(cloneWorkspace, { recursive: true }),
    mkdir(store, { recursive: true }),
  ]);
  const cleanup = vi.fn(async () => undefined);
  const clone: DisposableVerificationClone = {
    schemaVersion: "1.0.0",
    temporaryRoot: cloneRoot,
    workspacePath: cloneWorkspace,
    sourceCommit: "d".repeat(40),
    sourceTree: "e".repeat(40),
    cleanup,
  };
  return { root, working, cloneWorkspace, store, clone, cleanup };
}

function scriptedRuntime(input: {
  readonly clonePath: string;
  readonly storePath: string;
  readonly onCopyEvidence?: (destination: string) => Promise<void>;
  readonly create?: ReturnType<typeof syntheticOciResult>;
  readonly start?: ReturnType<typeof syntheticOciResult>;
  readonly stateExitCode?: number;
  readonly stateStatus?: string;
  readonly invalidCleanupProof?: boolean;
  readonly policyNetworkMode?: string;
  readonly wrongWorkspaceVolumeOutput?: boolean;
  readonly artifactPreflight?: ReturnType<typeof syntheticOciResult>;
}) {
  const requests: OciRuntimeRequest[] = [];
  const volumes = new Map<
    "workspace" | "evidence",
    { name: string; executionId: string }
  >();
  let candidateName = "";
  const runner = vi.fn(async (request: OciRuntimeRequest) => {
    requests.push(request);
    switch (request.operation) {
      case "image-inspect":
        return syntheticOciResult({ stdout: imageInspection() });
      case "container-preflight":
      case "exporter-preflight":
        return syntheticOciResult({ exitCode: 1, stderr: "No such container" });
      case "volume-preflight-workspace":
      case "volume-preflight-evidence":
        return syntheticOciResult({ exitCode: 1, stderr: "No such volume" });
      case "volume-create-workspace":
      case "volume-create-evidence": {
        const kind = request.operation.endsWith("workspace")
          ? "workspace"
          : "evidence";
        const name = request.args.at(-1) ?? "";
        const executionLabel = request.args.find((entry) =>
          entry.startsWith("io.milestone-loop.execution="),
        );
        volumes.set(kind, {
          name,
          executionId: executionLabel?.split("=").slice(1).join("=") ?? "",
        });
        return syntheticOciResult({
          stdout:
            input.wrongWorkspaceVolumeOutput && kind === "workspace"
              ? "unexpected-volume\n"
              : `${name}\n`,
        });
      }
      case "volume-inspect-workspace":
      case "volume-inspect-evidence": {
        const kind = request.operation.endsWith("workspace")
          ? "workspace"
          : "evidence";
        const volume = volumes.get(kind);
        if (!volume) throw new Error(`Missing scripted ${kind} volume.`);
        return syntheticOciResult({
          stdout: volumeInspection(volume.name, kind, volume.executionId),
        });
      }
      case "exporter-create":
        return syntheticOciResult({ stdout: `${"f".repeat(64)}\n` });
      case "exporter-start":
        return syntheticOciResult({ stdout: "exporter\n" });
      case "exporter-inspect":
        return syntheticOciResult({ stdout: stoppedState(0, "running", true) });
      case "create": {
        const nameIndex = request.args.indexOf("--name");
        candidateName = request.args[nameIndex + 1] ?? "";
        return (
          input.create ?? syntheticOciResult({ stdout: `${containerId}\n` })
        );
      }
      case "inspect-policy":
        return syntheticOciResult({
          stdout: policyInspection(
            input.clonePath,
            input.storePath,
            volumes.get("workspace")?.name ?? "",
            volumes.get("evidence")?.name ?? "",
            input.policyNetworkMode,
            candidateName,
          ),
        });
      case "start":
        return (
          input.start ?? syntheticOciResult({ stdout: "contained-output\n" })
        );
      case "inspect":
        return syntheticOciResult({
          stdout: stoppedState(input.stateExitCode ?? 0, input.stateStatus),
        });
      case "artifact-preflight":
        return (
          input.artifactPreflight ??
          syntheticOciResult({
            stdout: JSON.stringify({
              schemaVersion: "1.0.0",
              fileCount: 1,
              totalBytes: 3,
            }),
          })
        );
      case "copy-evidence": {
        const destination = request.args.at(-1) ?? "";
        if (input.onCopyEvidence) await input.onCopyEvidence(destination);
        return syntheticOciResult();
      }
      case "copy-workspace-artifacts":
      case "stop":
      case "kill":
      case "remove":
      case "exporter-remove":
      case "volume-remove-workspace":
      case "volume-remove-evidence":
        return syntheticOciResult();
      case "confirm-removed":
        return syntheticOciResult({
          exitCode: 1,
          stderr: input.invalidCleanupProof
            ? "runtime endpoint unavailable"
            : "No such container",
        });
      case "exporter-confirm-removed":
        return syntheticOciResult({ exitCode: 1, stderr: "No such container" });
      case "volume-confirm-removed-workspace":
      case "volume-confirm-removed-evidence":
        return syntheticOciResult({ exitCode: 1, stderr: "No such volume" });
      default:
        throw new Error(`Unexpected operation ${request.operation}`);
    }
  });
  return { runner, requests };
}

describe("OCI container executor", () => {
  it("constructs the complete fixed policy without host home, target, state, socket, or network mounts", () => {
    const workspaceVolume = "milestone-loop-check-workspace";
    const evidenceVolume = "milestone-loop-check-evidence";
    const args = buildContainerCreateArguments({
      config,
      containerName: "milestone-loop-check-1",
      clonePath: "/controller/clone",
      storePath: "/controller/store",
      workspaceVolume,
      evidenceVolume,
      imageInputHash,
      command: {
        id: "check",
        executable: "pnpm",
        args: ["test:unit"],
        parser: "exit-code",
      },
      extraEnvironment: {
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: "/host/never-visible",
      },
      killGraceMs: 1_500,
    });
    const joined = args.join("\n");
    for (const required of [
      "--pull=never",
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges=true",
      "--user\n65532:65532",
      `--pids-limit\n${OCI_RESOURCE_LIMITS_V1.pids}`,
      `--memory\n${OCI_RESOURCE_LIMITS_V1.memoryBytes}`,
      "--init",
      "--ipc=none",
      "--log-driver=none",
      `src=${resolve("/controller/clone")},dst=/source,readonly`,
      `src=${resolve("/controller/store")},dst=/pnpm-store/v11,readonly`,
      "--frozen-store",
      "--trust-lockfile",
      "--verify-store-integrity",
      "--package-import-method=copy",
      "--store-dir=/pnpm-store",
      `type=volume,src=${workspaceVolume},dst=/workspace,volume-nocopy`,
      `type=volume,src=${evidenceVolume},dst=/evidence,volume-nocopy`,
      "LOOP_VERIFY_COMMAND_ARTIFACT_DIR=/evidence/command",
      imageId,
    ])
      expect(joined).toContain(required);
    for (const prohibited of [
      "/host/never-visible",
      "/home/",
      "USERPROFILE",
      "CODEX_HOME",
      "docker.sock",
      "--privileged",
      "--network=host",
    ])
      expect(joined).not.toContain(prohibited);
    expect(() =>
      buildContainerCreateArguments({
        config,
        containerName: "milestone-loop-check-override",
        clonePath: "/controller/clone",
        storePath: "/controller/store",
        workspaceVolume,
        evidenceVolume,
        imageInputHash,
        command: {
          id: "check",
          executable: "pnpm",
          args: ["test:unit"],
          parser: "exit-code",
        },
        extraEnvironment: { HOME: "/host/home", CODEX_TOKEN: "secret" },
        killGraceMs: 1_500,
      }),
    ).toThrow(/not allowlisted/);
    expect(
      parseContainerPolicyInspection(
        Buffer.from(
          policyInspection(
            "/controller/clone",
            "/controller/store",
            workspaceVolume,
            evidenceVolume,
          ),
        ),
        {
          imageId,
          clonePath: "/controller/clone",
          storePath: "/controller/store",
          workspaceVolume,
          evidenceVolume,
          containerName: "milestone-loop-check",
          imageInputHash,
        },
      ),
    ).toMatchObject({
      networkMode: "none",
      rootFilesystem: "read-only",
      capabilities: "all-dropped",
      noNewPrivileges: true,
    });
    const volumeArgs = buildBoundedVolumeCreateArguments({
      name: workspaceVolume,
      kind: "workspace",
      executionId: "milestone-loop-check",
    });
    expect(volumeArgs.join("\n")).toContain(
      `o=nosuid,nodev,size=${OCI_RESOURCE_LIMITS_V1.workspaceBytes},nr_inodes=${OCI_RESOURCE_LIMITS_V1.workspaceInodes},uid=65532,gid=65532,mode=0700`,
    );
    expect(
      parseBoundedVolumeInspection(
        Buffer.from(
          volumeInspection(
            workspaceVolume,
            "workspace",
            "milestone-loop-check",
          ),
        ),
        {
          name: workspaceVolume,
          kind: "workspace",
          executionId: "milestone-loop-check",
        },
      ),
    ).toMatchObject({ filesystem: "tmpfs", maximumBytes: 1_073_741_824 });
    const exporter = buildArtifactExporterCreateArguments({
      config,
      exporterName: "milestone-loop-check-exporter",
      executionId: "milestone-loop-check",
      workspaceVolume,
      evidenceVolume,
    }).join("\n");
    expect(exporter).toContain(
      `src=${workspaceVolume},dst=/workspace,readonly`,
    );
    expect(exporter).toContain(`src=${evidenceVolume},dst=/evidence,readonly`);
    expect(exporter).not.toContain("/controller/clone");
  });

  it("uses a fresh clone/container, exports only declared artifacts, records containment, and proves cleanup", async () => {
    const data = await fixture();
    expect(await realpath(data.root)).toBe(data.root);
    const evidenceDestination = join(data.root, "controller-evidence");
    let evidenceStagingRootIsCanonical: boolean | null = null;
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      onCopyEvidence: async (destination) => {
        evidenceStagingRootIsCanonical =
          resolve(await realpath(destination)) === resolve(destination);
        await mkdir(join(destination, "command"), { recursive: true });
        await writeFile(join(destination, "command", "result.json"), "{}\n");
      },
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "01234567-89ab-cdef-0123-456789abcdef",
    });
    const result = await executor(
      {
        id: "focused",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "logs"),
        timeoutMs: 250,
        outputLimitBytes: 1_024,
        killGraceMs: 25,
        extraEnvironment: {
          LOOP_VERIFY_STAGE_ID: "stage",
          LOOP_VERIFY_COMMAND_ID: "focused",
          LOOP_VERIFY_COMMAND_ARTIFACT_DIR: evidenceDestination,
          [EXECUTION_PROVIDER_IDENTITY_ENV]:
            encodeExecutionProviderIdentity(providerIdentity),
        },
      },
    );
    expect(evidenceStagingRootIsCanonical).toBe(true);
    expect(result).toMatchObject({
      status: "PASS",
      exitCode: 0,
      containmentReport: {
        schemaVersion: CONTAINER_EXECUTION_REPORT_SCHEMA_VERSION,
      },
    });
    expect(
      await readFile(join(evidenceDestination, "result.json"), "utf8"),
    ).toBe("{}\n");
    expect(await readFile(result.stdoutPath, "utf8")).toBe(
      "contained-output\n",
    );
    const report = JSON.parse(
      await readFile(result.containmentReport?.path ?? "", "utf8"),
    ) as Record<string, unknown>;
    expect(report).toMatchObject({
      schemaVersion: "1.0.0",
      runtime: { name: "docker", serverVersion: "29.1.3" },
      imageDigest: imageId,
      imageInputHash,
      capabilityId: providerIdentity.capabilityId,
      executionProvider: providerIdentity,
      container: { reused: false, removed: true },
      artifactExporter: { reused: false, removed: true },
      boundedVolumes: {
        workspace: { removed: true },
        evidence: { removed: true },
      },
      policy: {
        networkDisposition: "denied",
        rootFilesystem: "read-only",
        hostWritableMounts: 0,
        runtimeAttestation: {
          networkMode: "none",
          capabilities: "all-dropped",
        },
      },
      artifacts: { preflight: { fileCount: 1, totalBytes: 3 } },
    });
    const create = runtime.requests.find(
      (entry) => entry.operation === "create",
    );
    expect(create?.args.join("\n")).toContain(data.cloneWorkspace);
    expect(create?.args.join("\n")).not.toContain(data.working);
    expect(runtime.requests.map((entry) => entry.operation)).toEqual([
      "image-inspect",
      "container-preflight",
      "exporter-preflight",
      "volume-preflight-workspace",
      "volume-create-workspace",
      "volume-inspect-workspace",
      "volume-preflight-evidence",
      "volume-create-evidence",
      "volume-inspect-evidence",
      "exporter-create",
      "exporter-start",
      "exporter-inspect",
      "create",
      "inspect-policy",
      "start",
      "inspect",
      "artifact-preflight",
      "copy-evidence",
      "copy-workspace-artifacts",
      "remove",
      "confirm-removed",
      "exporter-remove",
      "exporter-confirm-removed",
      "volume-remove-workspace",
      "volume-confirm-removed-workspace",
      "volume-remove-evidence",
      "volume-confirm-removed-evidence",
    ] satisfies OciRuntimeOperation[]);
    expect(data.cleanup).toHaveBeenCalledOnce();
  });

  it("stops and removes a timed-out container without falling through to a passing result", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      start: syntheticOciResult({ timedOut: true }),
      stateExitCode: 137,
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "timeout-fixture",
    });
    const result = await executor(
      {
        id: "timeout",
        executable: "node",
        args: ["tools/hang.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "timeout-logs"),
        timeoutMs: 10,
        outputLimitBytes: 64,
        killGraceMs: 5,
      },
    );
    expect(result.status).toBe("TIMEOUT");
    expect(result.message).toMatch(/container was removed/);
    expect(runtime.requests.map((entry) => entry.operation)).toContain("stop");
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "confirm-removed",
    );
    expect(runtime.requests.map((entry) => entry.operation).slice(-2)).toEqual([
      "volume-remove-evidence",
      "volume-confirm-removed-evidence",
    ]);
    expect(data.cleanup).toHaveBeenCalledOnce();
  });

  it("retains a Docker start failure instead of obscuring it with artifact-copy errors", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      start: syntheticOciResult({
        exitCode: 125,
        stderr: "unknown start flag",
      }),
      stateExitCode: 0,
      stateStatus: "created",
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "start-error-fixture",
    });
    const result = await executor(
      {
        id: "start-error",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "start-error-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(
      /container start exited 125.*unknown start flag/,
    );
    expect(runtime.requests.map((entry) => entry.operation)).not.toContain(
      "copy-evidence",
    );
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "confirm-removed",
    );
    expect(runtime.requests.map((entry) => entry.operation).slice(-2)).toEqual([
      "volume-remove-evidence",
      "volume-confirm-removed-evidence",
    ]);
  });

  it("cleans a candidate when creation times out after the daemon may have accepted it", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      create: syntheticOciResult({ timedOut: true }),
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "create-timeout-fixture",
    });
    const result = await executor(
      {
        id: "create-timeout",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "create-timeout-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/container creation timed out/);
    expect(runtime.requests.map((entry) => entry.operation)).not.toContain(
      "start",
    );
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "remove",
    );
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "confirm-removed",
    );
    expect(data.cleanup).toHaveBeenCalledOnce();
  });

  it("refuses candidate launch when runtime policy inspection deviates from the fixed boundary", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      policyNetworkMode: "host",
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "policy-fixture",
    });
    const result = await executor(
      {
        id: "policy",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "policy-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/did not apply the fixed/);
    expect(runtime.requests.map((entry) => entry.operation)).not.toContain(
      "start",
    );
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "confirm-removed",
    );
    expect(runtime.requests.map((entry) => entry.operation).slice(-2)).toEqual([
      "volume-remove-evidence",
      "volume-confirm-removed-evidence",
    ]);
  });

  it("does not accept an ambiguous runtime error as cleanup proof", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      invalidCleanupProof: true,
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "cleanup-fixture",
    });
    const result = await executor(
      {
        id: "cleanup",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "cleanup-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/cleanup could not be proven/);
  });

  it("rejects artifact limits before copying container data to the host", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      artifactPreflight: syntheticOciResult({
        exitCode: 1,
        stderr: "Combined container artifacts exceed the byte limit.",
      }),
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "artifact-preflight-fixture",
    });
    const result = await executor(
      {
        id: "artifact-preflight",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "artifact-preflight-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/artifact preflight.*byte limit/i);
    expect(runtime.requests.map((entry) => entry.operation)).not.toContain(
      "copy-evidence",
    );
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "confirm-removed",
    );
  });

  it("cleans a volume when successful creation returns malformed identity output", async () => {
    const data = await fixture();
    const runtime = scriptedRuntime({
      clonePath: data.cloneWorkspace,
      storePath: data.store,
      wrongWorkspaceVolumeOutput: true,
    });
    const executor = createContainerCommandExecutor(config, {
      runRuntime: runtime.runner,
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
      createId: () => "volume-output-fixture",
    });
    const result = await executor(
      {
        id: "volume-output",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "volume-output-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/wrong workspace volume name/);
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "volume-remove-workspace",
    );
    expect(runtime.requests.map((entry) => entry.operation)).toContain(
      "volume-confirm-removed-workspace",
    );
    expect(data.cleanup).toHaveBeenCalledOnce();
  });

  it("fails closed when immutable image attestation is absent", async () => {
    const data = await fixture();
    const requests: OciRuntimeOperation[] = [];
    const executor = createContainerCommandExecutor(config, {
      runRuntime: async (request) => {
        requests.push(request.operation);
        if (request.operation === "image-inspect")
          return syntheticOciResult({ stdout: "[]" });
        throw new Error("candidate lifecycle must not start");
      },
      createClone: vi.fn(async () => data.clone),
      resolveStorePath: vi.fn(async () => data.store),
    });
    const result = await executor(
      {
        id: "attestation",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: data.working,
        artifactDirectory: join(data.root, "attestation-logs"),
        timeoutMs: 25,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/inspection is malformed/);
    expect(requests).toEqual(["image-inspect"]);
    expect(data.cleanup).not.toHaveBeenCalled();
    expect(existsSync(result.containmentReport?.path ?? "")).toBe(true);
  });
});
