import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTAINER_IMAGE_CONTRACT_LABEL,
  CONTAINER_IMAGE_INPUT_LABEL,
  CONTAINER_IMAGE_NODE_LABEL,
  CONTAINER_IMAGE_PNPM_LABEL,
  CONTAINER_IMAGE_USER,
  ContainerImageBuilder,
  containerImageInputHash,
  type ContainerImageInspection,
  type ContainerImageRuntime,
} from "./container-image.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-image-"));
  roots.push(root);
  const dockerfilePath = join(root, "Dockerfile");
  await writeFile(
    dockerfilePath,
    "ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\n",
    "utf8",
  );
  return {
    contextDirectory: root,
    dockerfilePath,
    baseImage: `node@sha256:${"a".repeat(64)}`,
    nodeVersion: "24.18.0",
    pnpmVersion: "11.15.1",
  };
}

function inspection(inputHash: string): ContainerImageInspection {
  return {
    id: `sha256:${"b".repeat(64)}`,
    user: CONTAINER_IMAGE_USER,
    labels: {
      [CONTAINER_IMAGE_INPUT_LABEL]: inputHash,
      [CONTAINER_IMAGE_NODE_LABEL]: "24.18.0",
      [CONTAINER_IMAGE_PNPM_LABEL]: "11.15.1",
      [CONTAINER_IMAGE_CONTRACT_LABEL]: "1.0.0",
    },
  };
}

describe("container image identity and cache", () => {
  it("binds the hash to pinned base, toolchain pins, and exact input bytes", async () => {
    const input = await fixture();
    const first = await containerImageInputHash(input);
    await writeFile(
      input.dockerfilePath,
      "ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\nUSER 1\n",
      "utf8",
    );
    const changedFile = await containerImageInputHash(input);
    const changedBase = await containerImageInputHash({
      ...input,
      baseImage: `node@sha256:${"c".repeat(64)}`,
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(changedFile).not.toBe(first);
    expect(changedBase).not.toBe(changedFile);
    await expect(
      containerImageInputHash({ ...input, baseImage: "node:24.18.0" }),
    ).rejects.toThrow(/pinned/);
  });

  it("builds once for concurrent unchanged inputs and returns one immutable image ID", async () => {
    const input = await fixture();
    let current: ContainerImageInspection | null = null;
    const runtime: ContainerImageRuntime = {
      inspect: vi.fn(async () => current),
      build: vi.fn(async (request) => {
        current = inspection(request.inputHash);
      }),
    };
    const builder = new ContainerImageBuilder(runtime);
    const [first, second] = await Promise.all([
      builder.ensure(input, 250),
      builder.ensure(input, 250),
    ]);
    expect(runtime.build).toHaveBeenCalledOnce();
    expect(first.imageId).toBe(`sha256:${"b".repeat(64)}`);
    expect(second.imageId).toBe(first.imageId);
    expect((await builder.ensure(input, 250)).reused).toBe(true);
    expect(runtime.build).toHaveBeenCalledOnce();
  });

  it("rejects a cached or built image whose labels, user, or ID do not attest the inputs", async () => {
    const input = await fixture();
    const runtime: ContainerImageRuntime = {
      inspect: vi.fn(async () => ({
        ...inspection("0".repeat(64)),
        user: "root",
      })),
      build: vi.fn(async () => undefined),
    };
    await expect(
      new ContainerImageBuilder(runtime).ensure(input, 250),
    ).rejects.toThrow(/non-root user|label/);
    expect(runtime.build).not.toHaveBeenCalled();
  });
});
