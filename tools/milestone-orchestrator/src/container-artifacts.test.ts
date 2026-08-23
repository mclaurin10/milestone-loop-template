import {
  access,
  link,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCombinedContainerArtifactLimits,
  inventoryContainerArtifacts,
  publishContainerArtifacts,
} from "./container-artifacts.js";

const roots: string[] = [];
const limits = { maximumFiles: 4, maximumBytes: 32 };

afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function root(prefix: string): Promise<string> {
  const value = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  expect(await realpath(value)).toBe(value);
  roots.push(value);
  return value;
}

describe("container artifact export", () => {
  it("publishes bounded regular files exclusively and retains exact size/hash inventory", async () => {
    const source = await root("milestone-loop-export-source-");
    const destination = await root("milestone-loop-export-destination-");
    await mkdir(join(source, "nested"));
    await writeFile(join(source, "nested", "result.json"), '{"ok":true}\n');
    const inventory = await publishContainerArtifacts({
      sourceRoot: source,
      destinationRoot: destination,
      limits,
    });
    expect(inventory).toMatchObject({ fileCount: 1, totalBytes: 12 });
    expect(inventory.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await readFile(join(destination, "nested", "result.json"), "utf8"),
    ).toBe('{"ok":true}\n');
    await expect(
      publishContainerArtifacts({
        sourceRoot: source,
        destinationRoot: destination,
        limits,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("rejects links and enforces independent file-count and byte quotas", async () => {
    const source = await root("milestone-loop-export-source-");
    await mkdir(join(source, "target"));
    await writeFile(join(source, "target", "value"), "value");
    await symlink(
      join(source, "target"),
      join(source, "link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(inventoryContainerArtifacts(source, limits)).rejects.toThrow(
      /symbolic link/,
    );
    await rm(join(source, "link"));
    await rm(join(source, "target"), { recursive: true });
    await writeFile(join(source, "hardlink-source"), "linked");
    await link(join(source, "hardlink-source"), join(source, "hardlink-copy"));
    await expect(inventoryContainerArtifacts(source, limits)).rejects.toThrow(
      /hard link/,
    );
    await Promise.all([
      rm(join(source, "hardlink-source")),
      rm(join(source, "hardlink-copy")),
    ]);
    await writeFile(join(source, "large"), "x".repeat(33));
    await expect(inventoryContainerArtifacts(source, limits)).rejects.toThrow(
      /byte limit/,
    );
    await rm(join(source, "large"));
    for (let index = 0; index < 5; index += 1)
      await writeFile(join(source, `file-${index}`), "");
    await expect(inventoryContainerArtifacts(source, limits)).rejects.toThrow(
      /file limit/,
    );
  });

  it("rejects a substituted destination parent before publishing", async () => {
    const source = await root("milestone-loop-export-source-");
    const destination = await root("milestone-loop-export-destination-");
    const outside = await root("milestone-loop-export-outside-");
    await mkdir(join(source, "nested"));
    await writeFile(join(source, "nested", "result.json"), "evidence\n");
    await symlink(
      outside,
      join(destination, "nested"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      publishContainerArtifacts({
        sourceRoot: source,
        destinationRoot: destination,
        limits,
      }),
    ).rejects.toThrow(/destination parent/);
  });

  it("does not create a missing destination through a linked ancestor", async () => {
    const source = await root("milestone-loop-export-source-");
    const anchor = await root("milestone-loop-export-anchor-");
    const outside = await root("milestone-loop-export-outside-");
    await writeFile(join(source, "result.json"), "evidence\n");
    await symlink(
      outside,
      join(anchor, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      publishContainerArtifacts({
        sourceRoot: source,
        destinationRoot: join(anchor, "linked", "new-destination"),
        limits,
      }),
    ).rejects.toThrow(/destination path/);
    await expect(
      access(join(outside, "new-destination")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("enforces file and byte limits across all exported roots", () => {
    const inventory = (fileCount: number, totalBytes: number) => ({
      schemaVersion: "1.0.0" as const,
      fileCount,
      totalBytes,
      files: [],
    });
    expect(() =>
      assertCombinedContainerArtifactLimits(
        [inventory(2, 16), inventory(2, 16)],
        limits,
      ),
    ).not.toThrow();
    expect(() =>
      assertCombinedContainerArtifactLimits(
        [inventory(3, 16), inventory(2, 16)],
        limits,
      ),
    ).toThrow(/Combined.*file limit/);
    expect(() =>
      assertCombinedContainerArtifactLimits(
        [inventory(2, 17), inventory(2, 16)],
        limits,
      ),
    ).toThrow(/Combined.*byte limit/);
  });
});
