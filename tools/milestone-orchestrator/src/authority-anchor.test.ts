import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  IMMUTABLE_AUTHORITY_DEFINITIONS,
  IMMUTABLE_CONTRACT_LOCK_PATH,
  validateCommissionedAuthorityAnchor,
} from "./authority-anchor.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function sha256(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeText(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root: string, ...args: readonly string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-15T18:00:00.000Z",
      GIT_COMMITTER_DATE: "2026-08-15T18:00:00.000Z",
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Fixture git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

async function writeAuthority(root: string, suffix = "base"): Promise<string> {
  await Promise.all([
    writeText(join(root, "PROJECT_GOAL.md"), `# Fixture Goal ${suffix}\n`),
    writeText(
      join(root, "evals/ACCEPTANCE.md"),
      `# Fixture Acceptance ${suffix}\n`,
    ),
    writeJson(join(root, "evals/acceptance-manifest.json"), {
      schemaVersion: "fixture.v1",
      title: `Fixture acceptance ${suffix}`,
    }),
    writeText(
      join(root, "evals/HIDDEN_VALIDATION_PROTOCOL.md"),
      `# Fixture Hidden Protocol ${suffix}\n`,
    ),
  ]);
  const files = await Promise.all(
    IMMUTABLE_AUTHORITY_DEFINITIONS.map(async (definition) => {
      const digest = sha256(await readFile(join(root, definition.path)));
      return {
        path: definition.path,
        changeClass: definition.changeClass,
        baselineSha256: digest,
        activeSha256: digest,
      };
    }),
  );
  const lock = {
    schemaVersion: "1.0.0",
    calibrationTransition: {
      state: "open_not_started",
      completedCount: 0,
      maximumCount: 1,
      recordPath: null,
    },
    files,
  };
  const bytes = `${JSON.stringify(lock, null, 2)}\n`;
  await writeText(join(root, IMMUTABLE_CONTRACT_LOCK_PATH), bytes);
  return sha256(bytes);
}

async function repositoryFixture(
  input: {
    readonly candidateCommit?: boolean;
  } = {},
): Promise<{
  readonly root: string;
  readonly baseCommit: string;
  readonly candidateCommit: string;
  readonly lockSha256: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "authority-anchor-"));
  temporaryDirectories.push(root);
  git(root, "init", "--initial-branch=fixture-main");
  git(root, "config", "user.name", "Authority Fixture");
  git(root, "config", "user.email", "authority@example.invalid");
  const lockSha256 = await writeAuthority(root);
  await writeText(join(root, "package.json"), '{"private":true}\n');
  git(root, "add", ".");
  git(root, "commit", "-m", "freeze fixture authority");
  const baseCommit = git(root, "rev-parse", "HEAD");
  if (input.candidateCommit !== false) {
    await writeText(join(root, "commissioning-input.json"), "{}\n");
    git(root, "add", "commissioning-input.json");
    git(root, "commit", "-m", "add commissioning input");
  }
  return {
    root,
    baseCommit,
    candidateCommit: git(root, "rev-parse", "HEAD"),
    lockSha256,
  };
}

describe("commissioned authority anchor", () => {
  it("binds the exact current lock and authority bytes to a strict Git base", async () => {
    const fixture = await repositoryFixture();
    const result = await validateCommissionedAuthorityAnchor({
      repositoryRoot: fixture.root,
      baseCommit: fixture.baseCommit,
      expectedImmutableContractLockSha256: fixture.lockSha256,
    });

    expect(result).toMatchObject({
      baseCommit: fixture.baseCommit,
      candidateCommit: fixture.candidateCommit,
      immutableContractLockSha256: fixture.lockSha256,
    });
    expect(result.authorityFiles.map((file) => file.path)).toEqual(
      IMMUTABLE_AUTHORITY_DEFINITIONS.map((entry) => entry.path),
    );
    expect(
      result.authorityFiles.every((file) =>
        file.currentContents.equals(file.baseContents),
      ),
    ).toBe(true);
  });

  it("rejects explicit input hash drift and current authority drift", async () => {
    const fixture = await repositoryFixture();
    await expect(
      validateCommissionedAuthorityAnchor({
        repositoryRoot: fixture.root,
        baseCommit: fixture.baseCommit,
        expectedImmutableContractLockSha256: "0".repeat(64),
      }),
    ).rejects.toThrow(/explicit commissioning input hash/);

    await writeText(
      join(fixture.root, "PROJECT_GOAL.md"),
      "# Unreviewed authority drift\n",
    );
    await expect(
      validateCommissionedAuthorityAnchor({
        repositoryRoot: fixture.root,
        baseCommit: fixture.baseCommit,
      }),
    ).rejects.toThrow(/authority hash mismatch: PROJECT_GOAL\.md/);
  });

  it("rejects a regenerated lock and authority that differ from the base", async () => {
    const fixture = await repositoryFixture();
    await writeAuthority(fixture.root, "replacement");
    git(fixture.root, "add", "PROJECT_GOAL.md", "evals");
    git(fixture.root, "commit", "-m", "replace frozen authority");

    await expect(
      validateCommissionedAuthorityAnchor({
        repositoryRoot: fixture.root,
        baseCommit: fixture.baseCommit,
      }),
    ).rejects.toThrow(/lock differs from the commissioned strict-ancestor/);
  });

  it("rejects a missing, non-ancestor, or non-strict authority base", async () => {
    const fixture = await repositoryFixture();
    await expect(
      validateCommissionedAuthorityAnchor({
        repositoryRoot: fixture.root,
        baseCommit: "f".repeat(40),
      }),
    ).rejects.toThrow(/base is missing/);

    const sameCommit = await repositoryFixture({ candidateCommit: false });
    await expect(
      validateCommissionedAuthorityAnchor({
        repositoryRoot: sameCommit.root,
        baseCommit: sameCommit.baseCommit,
      }),
    ).rejects.toThrow(/strict ancestor/);

    const unrelated = git(
      fixture.root,
      "commit-tree",
      "HEAD^{tree}",
      "-m",
      "other",
    );
    await expect(
      validateCommissionedAuthorityAnchor({
        repositoryRoot: fixture.root,
        baseCommit: unrelated,
      }),
    ).rejects.toThrow(/not an ancestor/);
  });
});
