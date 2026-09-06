import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectApprovedSourceAuthorityAnchor } from "./source-authority-anchor.js";
import {
  assertActiveAuthorityPublication,
  AUTHORITY_MIGRATION_PENDING_PATH,
  SOURCE_CONTRACT_ID,
} from "./authority-publication.mjs";
import {
  SOURCE_APPROVAL_PATH,
  SOURCE_SNAPSHOT_PREFIX,
  SOURCE_SNAPSHOT_ROOT_FILES,
} from "./source-epoch-snapshot.js";

const controller = resolve(import.meta.dirname, "../../.."),
  roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function git(root: string, args: string[], input?: Buffer): Buffer {
  const result = spawnSync("git", ["-C", root, ...args], {
    input,
    encoding: null,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr.toString());
  return result.stdout;
}
const text = (root: string, args: string[]) =>
  git(root, args).toString().trim();
async function put(root: string, path: string, value: string | Buffer) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "source-authority-anchor-")),
  );
  roots.push(root);
  git(root, ["init", "--initial-branch=fixture"]);
  git(root, ["config", "user.name", "Source Anchor Fixture"]);
  git(root, ["config", "user.email", "source-anchor@example.invalid"]);
  const sourceObjects = text(controller, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "objects",
  ]);
  await put(
    root,
    ".git/objects/info/alternates",
    sourceObjects.replaceAll("\\", "/") + "\n",
  );
  const head = text(controller, ["rev-parse", "HEAD"]);
  const snapshot = text(controller, [
    "log",
    "--reverse",
    "--format=%H",
    "--diff-filter=A",
    "HEAD",
    "--",
    SOURCE_SNAPSHOT_PREFIX + "/PROJECT_GOAL.md",
  ]).split("\n")[0]!;
  git(root, ["read-tree", head]);
  git(root, ["update-ref", "refs/heads/fixture", head]);
  for (const path of SOURCE_SNAPSHOT_ROOT_FILES)
    await put(
      root,
      path,
      git(root, ["show", `${snapshot}:${SOURCE_SNAPSHOT_PREFIX}/${path}`]),
    );
  for (const path of [
    SOURCE_APPROVAL_PATH,
    ".agent/readiness-profile-activated.json",
  ])
    await put(root, path, git(root, ["show", `${snapshot}:${path}`]));
  return { root, snapshot, head };
}
describe(
  "approved version-2 source authority anchor inspection",
  { timeout: 60_000 },
  () => {
    it("checks all seven exact approved roots and strict ancestor provenance without activating authority", async () => {
      const f = await fixture(),
        before = text(f.root, [
          "for-each-ref",
          "--format=%(refname) %(objectname)",
        ]);
      const inspected = await inspectApprovedSourceAuthorityAnchor({
        repositoryRoot: f.root,
        snapshotCommit: f.snapshot,
      });
      expect(inspected).toMatchObject({
        status: "PASS",
        contractId: SOURCE_CONTRACT_ID,
        authorityEpoch: "orch-template.v1",
        activationAuthorized: false,
        completionEligible: false,
        candidateCommit: f.head,
      });
      expect(inspected.authorityFiles.map((file) => file.path)).toEqual([
        ...SOURCE_SNAPSHOT_ROOT_FILES,
      ]);
      expect(inspected.immutableContractLockSha256).toBe(
        "b6ffe83401af6cecfede9756f414abef5a7162ba773f892b6feeaa1d6ee336e2",
      );
      expect(
        text(f.root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
      ).toBe(before);
      expect(
        existsSync(join(f.root, "artifacts/orchestrator/state/state.json")),
      ).toBe(false);
    });
    it.each([...SOURCE_SNAPSHOT_ROOT_FILES])(
      "rejects drift of approved root %s",
      async (path) => {
        const f = await fixture();
        await put(f.root, path, "unapproved bytes\n");
        await expect(
          inspectApprovedSourceAuthorityAnchor({
            repositoryRoot: f.root,
            snapshotCommit: f.snapshot,
          }),
        ).rejects.toThrow(/differs from the exact approved/);
      },
    );
    it("rejects candidate-authored approval and a replaced readiness marker", async () => {
      const f = await fixture(),
        original = await readFile(join(f.root, SOURCE_APPROVAL_PATH));
      await put(f.root, SOURCE_APPROVAL_PATH, '{"status":"APPROVED"}');
      await expect(
        inspectApprovedSourceAuthorityAnchor({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/trusted maintainer record/);
      await put(f.root, SOURCE_APPROVAL_PATH, original);
      await put(f.root, ".agent/readiness-profile-activated.json", "{}");
      await expect(
        inspectApprovedSourceAuthorityAnchor({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/permanent readiness marker/);
    });
    it("rejects a current-head snapshot even with exact matching working bytes", async () => {
      const f = await fixture();
      git(f.root, ["update-ref", "refs/heads/fixture", f.snapshot]);
      await expect(
        inspectApprovedSourceAuthorityAnchor({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/strict ancestor/);
    });
    it("rejects a missing snapshot and a ref in place of an exact commit", async () => {
      const f = await fixture();
      for (const snapshotCommit of ["f".repeat(40), "HEAD"])
        await expect(
          inspectApprovedSourceAuthorityAnchor({
            repositoryRoot: f.root,
            snapshotCommit,
          }),
        ).rejects.toThrow(/exact commit|Git inspection/);
    });
    it("rejects an independent-file violation and a pending publication before inspection", async () => {
      const f = await fixture();
      await link(join(f.root, "PROJECT_GOAL.md"), join(f.root, "linked-goal"));
      await expect(
        inspectApprovedSourceAuthorityAnchor({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/independent regular file/);
      await put(f.root, AUTHORITY_MIGRATION_PENDING_PATH, "malformed");
      await expect(
        inspectApprovedSourceAuthorityAnchor({
          repositoryRoot: f.root,
          snapshotCommit: f.snapshot,
        }),
      ).rejects.toThrow(/publication is pending/);
    });
    it("does not turn a passing approved projection into active source authorization", async () => {
      const f = await fixture();
      await inspectApprovedSourceAuthorityAnchor({
        repositoryRoot: f.root,
        snapshotCommit: f.snapshot,
      });
      await put(
        f.root,
        "package.json",
        JSON.stringify({
          milestoneLoop: {
            verification: {
              contractId: SOURCE_CONTRACT_ID,
              defaultProfile: "readiness",
            },
          },
        }),
      );
      await put(
        f.root,
        ".agent/verification-manifest.json",
        JSON.stringify({ commissioning: { id: SOURCE_CONTRACT_ID } }),
      );
      await expect(assertActiveAuthorityPublication(f.root)).rejects.toThrow(
        /not activated/,
      );
    });
  },
);
