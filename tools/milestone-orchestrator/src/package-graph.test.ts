import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildPackageGraph,
  reverseDependentPackageNames,
  workspaceOwnerForPath,
} from "./package-graph.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("runtime workspace package graph", () => {
  it("derives names, exports, exact workspace edges, and reverse dependents", async () => {
    const first = await buildPackageGraph(repositoryRoot);
    const second = await buildPackageGraph(repositoryRoot);

    expect(first).toEqual(second);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.packages).toHaveLength(2);
    expect(first.packages.map((entry) => entry.name)).toEqual(
      [...first.packages.map((entry) => entry.name)].sort(),
    );
    expect(
      first.packages.find(
        (entry) => entry.name === "@milestone-loop/orchestrator",
      ),
    ).toMatchObject({
      root: "tools/milestone-orchestrator",
      exports: { ".": "./src/index.ts" },
      workspaceDependencies: [],
    });
    expect(
      reverseDependentPackageNames(first, "@milestone-loop/orchestrator"),
    ).toEqual(["milestone-loop-template"]);
    expect(
      workspaceOwnerForPath(first, "tools/milestone-orchestrator/src/cli.ts")
        ?.name,
    ).toBe("@milestone-loop/orchestrator");
    expect(workspaceOwnerForPath(first, "docs/verification.md")).toBeNull();
  });

  it("rejects a workspace pattern that can escape the repository", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "milestone-package-graph-unsafe-"),
    );
    temporaryDirectories.push(root);
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - ../outside/*\n",
      "utf8",
    );
    await writeFile(
      join(root, "package.json"),
      '{"name":"fixture-root","private":true}\n',
      "utf8",
    );

    await expect(buildPackageGraph(root)).rejects.toThrow(/unsafe|escape/i);
  });

  it("rejects a symlinked workspace directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-package-graph-link-"));
    const external = await mkdtemp(
      join(tmpdir(), "milestone-package-graph-target-"),
    );
    temporaryDirectories.push(root, external);
    await mkdir(join(root, "packages"), { recursive: true });
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
      "utf8",
    );
    await writeFile(
      join(root, "package.json"),
      '{"name":"fixture-root","private":true}\n',
      "utf8",
    );
    await writeFile(
      join(external, "package.json"),
      '{"name":"linked-workspace","private":true}\n',
      "utf8",
    );
    await symlink(external, join(root, "packages", "linked"), "junction");

    await expect(buildPackageGraph(root)).rejects.toThrow(/symlink|unsafe/i);
  });
});
