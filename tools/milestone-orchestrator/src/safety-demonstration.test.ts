import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { demonstrateSafety } from "./safety-demonstration.js";
import { validConfig } from "../test/fixtures.js";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
}

describe("safety demonstration evidence", () => {
  it("uses fresh durable recovery state and preserves the pinned worker lineage", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-safety-demo-"));
    directories.push(root);
    const config = validConfig();
    for (const path of config.protectedPaths) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${path}\n`, "utf8");
    }
    await writeFile(join(root, ".gitignore"), "artifacts/\n", "utf8");
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Safety Demo Test");
    git(root, "config", "user.email", "safety@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-m", "fixture");

    const input = {
      repositoryRoot: root,
      config,
      artifactDirectory: join(root, config.artifactRoot, "safety-demo"),
      now: () => "2026-08-02T00:00:00.000Z",
    };
    const first = await demonstrateSafety(input);
    const second = await demonstrateSafety(input);
    expect(first.artifactPath).not.toBe(second.artifactPath);
    for (const result of [first, second]) {
      expect(result.status).toBe("PASS");
      expect(result.scenarios[0]?.evidence).toMatchObject({
        workerThreadLineage: [
          {
            model: "gpt-5.6-sol",
            reasoningEffort: "xhigh",
          },
        ],
      });
    }
  }, 15_000);
});
