import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommandExecutionSummary } from "./contracts.js";
import {
  EXECUTION_PROVIDER_IDENTITY_ENV,
  decodeExecutionProviderIdentity,
  executionProviderIdentity,
} from "./execution-provider-identity.js";
import {
  createCandidateExecutionProvider,
  type ExecutionProviderCapabilityProbe,
} from "./execution-provider.js";
import { validConfig } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function summary(
  root: string,
  overrides: Partial<CommandExecutionSummary> = {},
): CommandExecutionSummary {
  return {
    id: "candidate-check",
    displayCommand: "node tools/check.mjs",
    status: "PASS",
    exitCode: 0,
    signal: null,
    startedAt: "2026-08-14T00:00:00.000Z",
    finishedAt: "2026-08-14T00:00:00.001Z",
    durationMs: 1,
    stdoutPath: resolve(root, "stdout.log"),
    stderrPath: resolve(root, "stderr.log"),
    stdoutSha256: "a".repeat(64),
    stderrSha256: "b".repeat(64),
    parser: "exit-code",
    parsedArtifactPath: null,
    message: "Command exited zero.",
    receipt: null,
    receiptAbsenceReason: "Receipt validation is caller-owned.",
    ...overrides,
  };
}

const readyProbe: ExecutionProviderCapabilityProbe = {
  implementation: () => ({ available: true, version: "test-double-v1" }),
  runtime: () => ({ available: true, version: "Docker 99.0.0" }),
  image: () => ({ available: true }),
  policy: () => ({ compatible: true, reason: null }),
};

describe("candidate execution provider", () => {
  it("defaults to trusted-container and fails closed before any candidate executor is called", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-provider-"));
    temporaryDirectories.push(root);
    const candidateTrap = vi.fn(async () => summary(root));
    const provider = createCandidateExecutionProvider(validConfig(), {
      localExecutor: candidateTrap,
    });

    const first = await provider.execute(
      {
        id: "candidate-check",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: root,
        artifactDirectory: resolve(root, "artifacts-first"),
        timeoutMs: 1_000,
      },
    );
    const second = await provider.execute(
      {
        id: "candidate-check",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: root,
        artifactDirectory: resolve(root, "artifacts-second"),
        timeoutMs: 1_000,
      },
    );

    expect(candidateTrap).not.toHaveBeenCalled();
    expect(first.status).toBe("NOT_READY");
    expect(first.exitCode).toBeNull();
    expect(first.executionProvider).toMatchObject({
      provider: "trusted-container",
      implementation: null,
      capabilityStatus: "missing-implementation",
      controlPlaneBound: true,
      completionEligible: false,
    });
    expect(await readFile(first.stderrPath, "utf8")).toMatch(
      /not implemented in WP3c/,
    );
    expect({
      status: second.status,
      message: second.message,
      identity: second.executionProvider,
    }).toEqual({
      status: first.status,
      message: first.message,
      identity: first.executionProvider,
    });
  });

  it("does not fall back locally when runtime, image, and policy probes pass but implementation is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-provider-"));
    temporaryDirectories.push(root);
    const localTrap = vi.fn(async () => summary(root));
    const config = validConfig({
      candidateExecution: {
        mode: "trusted-container",
        trustedContainer: {
          ...validConfig().candidateExecution.trustedContainer,
          imageDigest: `sha256:${"c".repeat(64)}`,
        },
      },
    });
    const provider = createCandidateExecutionProvider(config, {
      localExecutor: localTrap,
      capabilityProbe: {
        ...readyProbe,
        implementation: () => ({ available: false, version: null }),
      },
    });
    const result = await provider.execute(
      {
        id: "candidate-check",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: root,
        artifactDirectory: resolve(root, "artifacts"),
        timeoutMs: 1_000,
      },
    );
    expect(localTrap).not.toHaveBeenCalled();
    expect(result.executionProvider?.capabilityStatus).toBe(
      "missing-implementation",
    );
  });

  it("runs explicit unsafe-local diagnostics through the shared bounded supervisor", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-provider-"));
    temporaryDirectories.push(root);
    await mkdir(resolve(root, "tools"));
    await writeFile(
      resolve(root, "tools", "check.mjs"),
      'process.stdout.write("bounded-local\\n");\n',
      "utf8",
    );
    const config = validConfig({
      candidateExecution: {
        ...validConfig().candidateExecution,
        mode: "unsafe-local-diagnostic",
      },
    });
    const provider = createCandidateExecutionProvider(config);
    const result = await provider.execute(
      {
        id: "candidate-check",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: root,
        artifactDirectory: resolve(root, "artifacts"),
        timeoutMs: 2_000,
        outputLimitBytes: 1_024,
        killGraceMs: 100,
      },
    );
    expect(result.status).toBe("PASS");
    expect(result.supervision).toMatchObject({
      timedOut: false,
      outputLimitExceeded: false,
      streamsClosed: true,
    });
    expect(result.executionProvider).toMatchObject({
      provider: "unsafe-local-diagnostic",
      imageDigest: null,
      networkDisposition: "host-inherited",
      completionEligible: false,
    });
  });

  it("binds a simulated trusted executor result to controller identity and overrides candidate-supplied identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-provider-"));
    temporaryDirectories.push(root);
    const config = validConfig({
      candidateExecution: {
        mode: "trusted-container",
        trustedContainer: {
          ...validConfig().candidateExecution.trustedContainer,
          imageDigest: `sha256:${"d".repeat(64)}`,
        },
      },
    });
    const tampered = executionProviderIdentity({
      provider: "unsafe-local-diagnostic",
      implementation: "candidate-value",
      runtimeName: "node",
      runtimeVersion: "0.0.0",
      imageDigest: null,
      mountPolicyVersion: "candidate-value",
      resourceLimitProfile: "candidate-value",
      networkDisposition: "host-inherited",
      capabilityStatus: "unattested",
      controlPlaneBound: false,
    });
    const trustedExecutor = vi.fn(async (_command, options) => {
      const encoded =
        options.extraEnvironment?.[EXECUTION_PROVIDER_IDENTITY_ENV];
      expect(decodeExecutionProviderIdentity(encoded)).toEqual(
        provider.identity,
      );
      return summary(root, { executionProvider: tampered });
    });
    const provider = createCandidateExecutionProvider(config, {
      trustedExecutor,
      capabilityProbe: readyProbe,
    });
    const result = await provider.execute(
      {
        id: "candidate-check",
        executable: "node",
        args: ["tools/check.mjs"],
        parser: "exit-code",
      },
      {
        workingDirectory: root,
        artifactDirectory: resolve(root, "artifacts"),
        timeoutMs: 1_000,
        extraEnvironment: {
          [EXECUTION_PROVIDER_IDENTITY_ENV]: "candidate-tampering",
        },
      },
    );
    expect(trustedExecutor).toHaveBeenCalledOnce();
    expect(result.executionProvider).toEqual(provider.identity);
    expect(result.executionProvider).toMatchObject({
      provider: "trusted-container",
      capabilityStatus: "ready",
      completionEligible: true,
    });
  });
});
