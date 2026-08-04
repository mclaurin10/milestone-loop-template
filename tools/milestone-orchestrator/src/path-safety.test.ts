import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertArtifactRoot,
  inspectContainedTree,
  removeContainedPath,
  strictlyContained,
} from "./path-safety.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ski-loop-path-safety-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("strict cleanup containment", () => {
  it("rejects root equality and lexical escape without deleting either path", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "root");
    const outside = join(parent, "outside");
    await Promise.all([mkdir(root), mkdir(outside)]);
    await writeFile(join(outside, "keep.txt"), "keep");

    expect(strictlyContained(root, root)).toBe(false);
    expect(strictlyContained(root, outside)).toBe(false);
    await expect(removeContainedPath(root, root)).rejects.toThrow(
      /outside configured root/,
    );
    await expect(removeContainedPath(root, outside)).rejects.toThrow(
      /outside configured root/,
    );
    await expect(
      removeContainedPath(
        join(parent, "missing-root"),
        join(parent, "missing-root", "child"),
      ),
    ).rejects.toThrow(/cleanup root does not exist/);
    await expect(
      writeFile(join(outside, "still-here.txt"), "yes"),
    ).resolves.toBe(undefined);
  });

  it("rejects a junction-prefix real-path escape", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "root");
    const outside = join(parent, "outside");
    const payload = join(outside, "payload");
    await Promise.all([mkdir(root), mkdir(payload, { recursive: true })]);
    await writeFile(join(payload, "keep.txt"), "keep");
    await symlink(outside, join(root, "escape"), "junction");

    await expect(
      removeContainedPath(root, join(root, "escape", "payload")),
    ).rejects.toThrow(/real-path escape/);
    await expect(
      writeFile(join(payload, "still-here.txt"), "yes"),
    ).resolves.toBe(undefined);
  });

  it("removes a contained tree without following a nested junction", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "root");
    const run = join(root, "managed-run");
    const outside = join(parent, "outside");
    await Promise.all([
      mkdir(run, { recursive: true }),
      mkdir(outside, { recursive: true }),
    ]);
    await writeFile(join(outside, "keep.txt"), "keep");
    await symlink(outside, join(run, "outside-link"), "junction");

    await expect(removeContainedPath(root, run)).resolves.toBe("removed");
    await expect(
      writeFile(join(outside, "still-here.txt"), "yes"),
    ).resolves.toBe(undefined);
  });

  it("rejects a symlink artifact root", async () => {
    const parent = await temporaryDirectory();
    const realRoot = join(parent, "real-root");
    const linkedRoot = join(parent, "linked-root");
    await mkdir(realRoot);
    await symlink(realRoot, linkedRoot, "junction");

    await expect(assertArtifactRoot(linkedRoot)).rejects.toThrow(
      /Artifact root cannot be a symlink/,
    );
  });

  it("counts regular contained files without following nested links", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "artifacts");
    const run = join(root, "run");
    const outside = join(parent, "outside");
    await Promise.all([
      mkdir(join(run, "nested"), { recursive: true }),
      mkdir(outside, { recursive: true }),
    ]);
    await writeFile(join(run, "result.json"), "1234");
    await writeFile(join(run, "nested", "report.json"), "12");
    await writeFile(join(outside, "secret.txt"), "not-counted");
    await symlink(outside, join(run, "nested", "outside-link"), "junction");

    await expect(inspectContainedTree(root, run)).resolves.toMatchObject({
      disposition: "contains-symlink",
      entrySymlink: true,
      fileCount: 2,
      totalBytes: 6,
      symlinkPaths: ["nested/outside-link"],
    });
    await expect(inspectContainedTree(root, outside)).rejects.toThrow(
      /outside configured root/,
    );
  });
});
