import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPnpm } from "../../evidence.mjs";
import {
  inspectSourceEpochSnapshot,
  validateKnownSourceApproval,
  SOURCE_APPROVAL_PATH,
  SOURCE_SNAPSHOT_PREFIX,
  LEGACY_SNAPSHOT_PREFIX,
  LEGACY_AUTHORITY_BASE,
  SOURCE_SNAPSHOT_ROOT_FILES,
  LEGACY_SNAPSHOT_ROOT_FILES,
} from "./source-epoch-snapshot.js";

const controller = resolve(import.meta.dirname, "../../.."),
  temporary: string[] = [];
afterEach(async () => {
  for (const root of temporary.splice(0))
    await rm(root, { recursive: true, force: true });
});
function git(root: string, args: string[], input?: Buffer): Buffer {
  const result = spawnSync("git", ["-C", root, ...args], {
    input,
    encoding: null,
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr.toString());
  return result.stdout;
}
const text = (root: string, args: string[]) =>
  git(root, args).toString().trim();
async function fixture(
  options: {
    change?: { path: string; bytes?: Buffer; mode?: string; omit?: boolean };
    extra?: boolean;
    descendant?: boolean;
    preserveLegacyAncestry?: boolean;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "source-epoch-snapshot-"));
  temporary.push(root);
  git(root, ["init", "--bare", "--initial-branch=fixture-main"]);
  git(root, ["config", "user.name", "Source Epoch Fixture"]);
  git(root, ["config", "user.email", "source-epoch@example.invalid"]);
  const objects = resolve(
    controller,
    text(controller, ["rev-parse", "--git-path", "objects"]),
  );
  await writeFile(
    join(root, "objects/info/alternates"),
    objects.replaceAll("\\", "/") + "\n",
  );
  const files = [
    ...SOURCE_SNAPSHOT_ROOT_FILES.map((path) => ({
      path: SOURCE_SNAPSHOT_PREFIX + "/" + path,
      bytes: git(controller, [
        "show",
        "HEAD:docs/proposals/ORCH-AUTH-01-r2/proposed/" + path,
      ]),
    })),
    ...LEGACY_SNAPSHOT_ROOT_FILES.map((path) => ({
      path: LEGACY_SNAPSHOT_PREFIX + "/" + path,
      bytes: git(controller, ["show", LEGACY_AUTHORITY_BASE + ":" + path]),
    })),
  ];
  if (options.extra)
    files.push({
      path: SOURCE_SNAPSHOT_PREFIX + "/UNAPPROVED.md",
      bytes: Buffer.from("unapproved\n"),
    });
  for (const file of files) {
    const change =
      options.change?.path === file.path ? options.change : undefined;
    if (change?.omit) continue;
    const blob = git(
      root,
      ["hash-object", "-w", "--stdin"],
      change?.bytes ?? file.bytes,
    )
      .toString()
      .trim();
    git(root, [
      "update-index",
      "--add",
      "--cacheinfo",
      change?.mode ?? "100644",
      blob,
      file.path,
    ]);
  }
  const tree = text(root, ["write-tree"]),
    parent = text(controller, ["rev-parse", "HEAD"]);
  const snapshot = text(root, [
    "commit-tree",
    tree,
    ...(options.preserveLegacyAncestry === false ? [] : ["-p", parent]),
    "-m",
    "inert approved snapshots",
  ]);
  const head =
    options.descendant === false
      ? snapshot
      : text(root, [
          "commit-tree",
          tree,
          "-p",
          snapshot,
          "-m",
          "candidate after snapshots",
        ]);
  git(root, ["update-ref", "refs/heads/fixture-main", head]);
  return { root, snapshot, head, tree, parent };
}
// These new cases create real Git commits and invoke the receipt-owning CLI.
// Their bounded deadline is independent of all original verification timeouts.
describe("inert approved source epoch snapshots", { timeout: 60_000 }, () => {
  it("binds exact new and legacy Git objects without granting activation", async () => {
    const f = await fixture();
    const result = await inspectSourceEpochSnapshot({
      repositoryRoot: f.root,
      snapshotCommit: f.snapshot,
    });
    expect(result).toMatchObject({
      status: "PASS",
      snapshotCommit: f.snapshot,
      observedHead: f.head,
      strictAncestor: true,
      activationAuthorized: false,
      completionEligible: false,
      claimScope: "inert-authority-snapshot-inspection",
    });
    expect(result.files).toHaveLength(12);
    expect(result.files.filter((file) => file.epoch === "legacy")).toHaveLength(
      5,
    );
    expect(
      text(f.root, [
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ]),
    ).toBe("");
  });
  it("labels same-commit inspection as non-ancestor and still refuses activation authority", async () => {
    const f = await fixture({ descendant: false });
    const result = await inspectSourceEpochSnapshot({
      repositoryRoot: f.root,
      snapshotCommit: f.snapshot,
    });
    expect(result.strictAncestor).toBe(false);
    expect(result.activationAuthorized).toBe(false);
  });
  it.each(SOURCE_SNAPSHOT_ROOT_FILES)(
    "rejects modified approved %s bytes",
    async (path) => {
      const f = await fixture({
        change: {
          path: SOURCE_SNAPSHOT_PREFIX + "/" + path,
          bytes: Buffer.from("{}\n"),
        },
      });
      await expect(
        inspectSourceEpochSnapshot({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/Approved source snapshot hash mismatch/);
    },
  );
  it("rejects replacement of original legacy lock bytes", async () => {
    const f = await fixture({
      change: {
        path: LEGACY_SNAPSHOT_PREFIX + "/evals/immutable-contract-lock.json",
        bytes: Buffer.from("{}\n"),
      },
    });
    await expect(
      inspectSourceEpochSnapshot({
        repositoryRoot: f.root,
        snapshotCommit: f.snapshot,
      }),
    ).rejects.toThrow(/Original legacy authority snapshot differs/);
  });
  it.each(["120000", "100755"])(
    "rejects unsafe snapshot Git mode %s",
    async (mode) => {
      const f = await fixture({
        change: { path: SOURCE_SNAPSHOT_PREFIX + "/PROJECT_GOAL.md", mode },
      });
      await expect(
        inspectSourceEpochSnapshot({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/exact fixed regular-file inventory/);
    },
  );
  it("rejects a missing snapshot and an extra allowlist entry", async () => {
    for (const options of [
      { change: { path: SOURCE_SNAPSHOT_PREFIX + "/AGENTS.md", omit: true } },
      { extra: true },
    ]) {
      const f = await fixture(options);
      await expect(
        inspectSourceEpochSnapshot({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/exact fixed regular-file inventory/);
    }
  });
  it("rejects a ref, nonexistent commit and unrelated snapshot", async () => {
    const f = await fixture();
    for (const commit of ["HEAD", "f".repeat(40)])
      await expect(
        inspectSourceEpochSnapshot({
          repositoryRoot: f.root,
          snapshotCommit: commit,
        }),
      ).rejects.toThrow(/exact commit|Git inspection failed/);
    const unrelated = text(f.root, [
      "commit-tree",
      f.tree,
      "-p",
      f.parent,
      "-m",
      "unrelated branch snapshots",
    ]);
    await expect(
      inspectSourceEpochSnapshot({
        repositoryRoot: f.root,
        snapshotCommit: unrelated,
      }),
    ).rejects.toThrow(/current candidate's Git ancestry/);
  });
  it("rejects snapshots disconnected from original legacy history", async () => {
    const f = await fixture({ preserveLegacyAncestry: false });
    await expect(
      inspectSourceEpochSnapshot({
        repositoryRoot: f.root,
        snapshotCommit: f.snapshot,
      }),
    ).rejects.toThrow(/original legacy authority ancestry/);
  });
  it("uses the fixed control-plane record and ignores candidate-authored approval", async () => {
    const f = await fixture();
    const path = join(f.root, SOURCE_APPROVAL_PATH);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      '{"status":"APPROVED","activationAuthorized":true}\n',
    );
    expect(() =>
      validateKnownSourceApproval(Buffer.from('{"status":"APPROVED"}')),
    ).toThrow(/settled maintainer/);
    const bytes = await readFile(resolve(controller, SOURCE_APPROVAL_PATH));
    expect(() => validateKnownSourceApproval(bytes)).not.toThrow();
    const mutated = Buffer.from(bytes);
    mutated[0] = 32;
    expect(() => validateKnownSourceApproval(mutated)).toThrow(
      /settled maintainer/,
    );
    expect(
      (
        await inspectSourceEpochSnapshot({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        })
      ).activationAuthorized,
    ).toBe(false);
  });
  it("runs the real receipt-owning CLI and rejects malformed snapshots without a PASS receipt", async () => {
    for (const valid of [true, false]) {
      const f = await fixture(valid ? {} : { extra: true }),
        output = join(f.root, "cli-evidence");
      const execution = await runPnpm(
        [
          "exec",
          "tsx",
          "tools/milestone-orchestrator/src/source-epoch-inspect-cli.ts",
          f.root,
          f.snapshot,
          output,
        ],
        { cwd: controller, timeoutMs: 60000 },
      );
      expect(execution.status, execution.stderr).toBe(valid ? 0 : 1);
      expect(existsSync(join(output, "result.json"))).toBe(valid);
      if (valid)
        expect(
          JSON.parse(
            await readFile(join(output, "snapshot-inspection.json"), "utf8"),
          ),
        ).toMatchObject({
          activationAuthorized: false,
          completionEligible: false,
        });
      expect(
        text(f.root, [
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ]),
      ).toBe("");
    }
  });
});
