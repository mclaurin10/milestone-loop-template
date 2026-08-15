import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const CONTAINER_IMAGE_CONTRACT_VERSION = "1.0.0" as const;
export const CONTAINER_IMAGE_INPUT_LABEL =
  "io.milestone-loop.image-input-sha256" as const;
export const CONTAINER_IMAGE_NODE_LABEL =
  "io.milestone-loop.node-version" as const;
export const CONTAINER_IMAGE_PNPM_LABEL =
  "io.milestone-loop.pnpm-version" as const;
export const CONTAINER_IMAGE_CONTRACT_LABEL =
  "io.milestone-loop.image-contract" as const;
export const CONTAINER_IMAGE_USER = "65532:65532" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const PINNED_IMAGE = /^[^\s@]+@sha256:[a-f0-9]{64}$/;

export interface ContainerImageInputs {
  readonly contextDirectory: string;
  readonly dockerfilePath: string;
  readonly baseImage: string;
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly additionalInputPaths?: readonly string[];
}

export interface ContainerImageInspection {
  readonly id: string;
  readonly user: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface ContainerImageBuildRequest {
  readonly contextDirectory: string;
  readonly dockerfilePath: string;
  readonly tag: string;
  readonly baseImage: string;
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly inputHash: string;
  readonly timeoutMs: number;
}

export interface ContainerImageRuntime {
  inspect(
    reference: string,
    timeoutMs: number,
  ): Promise<ContainerImageInspection | null>;
  build(request: ContainerImageBuildRequest): Promise<void>;
}

export interface ResolvedContainerImage {
  readonly schemaVersion: typeof CONTAINER_IMAGE_CONTRACT_VERSION;
  readonly imageId: string;
  readonly tag: string;
  readonly inputHash: string;
  readonly reused: boolean;
}

function normalizedVersion(value: string, name: string): string {
  const normalized = value.replace(/^v/, "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(normalized))
    throw new Error(`${name} must be an exact semantic version.`);
  return normalized;
}

function normalizedInputs(input: ContainerImageInputs) {
  if (!PINNED_IMAGE.test(input.baseImage))
    throw new Error(
      "Container base image must be pinned by registry sha256 digest.",
    );
  return {
    contextDirectory: resolve(input.contextDirectory),
    dockerfilePath: resolve(input.dockerfilePath),
    baseImage: input.baseImage,
    nodeVersion: normalizedVersion(input.nodeVersion, "Node version"),
    pnpmVersion: normalizedVersion(input.pnpmVersion, "pnpm version"),
    additionalInputPaths: [...(input.additionalInputPaths ?? [])]
      .map((path) => resolve(path))
      .sort(),
  };
}

export async function containerImageInputHash(
  input: ContainerImageInputs,
): Promise<string> {
  const normalized = normalizedInputs(input);
  const files = [normalized.dockerfilePath, ...normalized.additionalInputPaths];
  const fileInputs = await Promise.all(
    files.map(async (path) => {
      const relativePath = relative(
        normalized.contextDirectory,
        path,
      ).replaceAll("\\", "/");
      if (
        relativePath.length === 0 ||
        relativePath === ".." ||
        relativePath.startsWith("../")
      )
        throw new Error(
          "Container image inputs must stay inside the build context.",
        );
      return {
        path: relativePath,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      };
    }),
  );
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: CONTAINER_IMAGE_CONTRACT_VERSION,
        baseImage: normalized.baseImage,
        nodeVersion: normalized.nodeVersion,
        pnpmVersion: normalized.pnpmVersion,
        files: fileInputs,
      }),
    )
    .digest("hex");
}

function expectedLabels(
  inputHash: string,
  nodeVersion: string,
  pnpmVersion: string,
): Readonly<Record<string, string>> {
  return {
    [CONTAINER_IMAGE_INPUT_LABEL]: inputHash,
    [CONTAINER_IMAGE_NODE_LABEL]: nodeVersion,
    [CONTAINER_IMAGE_PNPM_LABEL]: pnpmVersion,
    [CONTAINER_IMAGE_CONTRACT_LABEL]: CONTAINER_IMAGE_CONTRACT_VERSION,
  };
}

function assertMatchingInspection(
  inspection: ContainerImageInspection | null,
  inputHash: string,
  nodeVersion: string,
  pnpmVersion: string,
): ContainerImageInspection | null {
  if (inspection === null) return null;
  if (!IMAGE_ID.test(inspection.id))
    throw new Error(
      "Container image inspection returned a non-immutable image ID.",
    );
  if (inspection.user !== CONTAINER_IMAGE_USER)
    throw new Error(
      `Container image must declare non-root user ${CONTAINER_IMAGE_USER}.`,
    );
  for (const [key, expected] of Object.entries(
    expectedLabels(inputHash, nodeVersion, pnpmVersion),
  )) {
    if (inspection.labels[key] !== expected)
      throw new Error(
        `Container image label ${key} does not match its input contract.`,
      );
  }
  return inspection;
}

export class ContainerImageBuilder {
  readonly #runtime: ContainerImageRuntime;
  readonly #pending = new Map<string, Promise<ResolvedContainerImage>>();

  constructor(runtime: ContainerImageRuntime) {
    this.#runtime = runtime;
  }

  async ensure(
    input: ContainerImageInputs,
    timeoutMs = 10 * 60_000,
  ): Promise<ResolvedContainerImage> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
      throw new Error(
        "Container image build timeout must be a positive integer.",
      );
    const normalized = normalizedInputs(input);
    const inputHash = await containerImageInputHash(input);
    if (!SHA256.test(inputHash))
      throw new Error("Container image input hash is malformed.");
    const tag = `milestone-loop-executor:${inputHash.slice(0, 32)}`;
    const existing = assertMatchingInspection(
      await this.#runtime.inspect(tag, Math.min(timeoutMs, 10_000)),
      inputHash,
      normalized.nodeVersion,
      normalized.pnpmVersion,
    );
    if (existing)
      return {
        schemaVersion: CONTAINER_IMAGE_CONTRACT_VERSION,
        imageId: existing.id,
        tag,
        inputHash,
        reused: true,
      };

    const pending = this.#pending.get(inputHash);
    if (pending) return pending;
    const build = (async (): Promise<ResolvedContainerImage> => {
      await this.#runtime.build({
        contextDirectory: normalized.contextDirectory,
        dockerfilePath: normalized.dockerfilePath,
        tag,
        baseImage: normalized.baseImage,
        nodeVersion: normalized.nodeVersion,
        pnpmVersion: normalized.pnpmVersion,
        inputHash,
        timeoutMs,
      });
      const inspected = assertMatchingInspection(
        await this.#runtime.inspect(tag, Math.min(timeoutMs, 10_000)),
        inputHash,
        normalized.nodeVersion,
        normalized.pnpmVersion,
      );
      if (!inspected)
        throw new Error(
          "Container image build completed without an inspectable image.",
        );
      return {
        schemaVersion: CONTAINER_IMAGE_CONTRACT_VERSION,
        imageId: inspected.id,
        tag,
        inputHash,
        reused: false,
      };
    })();
    this.#pending.set(inputHash, build);
    try {
      return await build;
    } finally {
      this.#pending.delete(inputHash);
    }
  }
}
