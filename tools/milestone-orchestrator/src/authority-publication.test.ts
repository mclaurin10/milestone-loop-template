import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertActiveAuthorityPublication,
  assertNoPendingAuthorityMigration,
  classifyAuthorityScope,
  AUTHORITY_MIGRATION_PENDING_PATH,
  SOURCE_AUTHORITY_PUBLICATION_PATH,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
} from "./authority-publication.mjs";
import { validateCommissionedAuthorityAnchor } from "./authority-anchor.js";
import {
  loadActiveVerificationManifest,
  loadConfigForInspection,
  loadVerificationManifest,
} from "./config.js";
import { assertNoPendingAmendment } from "./commissioning-audit.js";
import { ControllerLease } from "./controller-lease.js";
import { createInitialState, StateStore } from "./state-store.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function git(root: string, ...args: string[]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}
async function text(root: string, path: string, value: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "authority-publication-")),
  );
  roots.push(root);
  git(root, "init", "--initial-branch=fixture");
  git(root, "config", "user.name", "Publication Fixture");
  git(root, "config", "user.email", "publication@example.invalid");
  await text(root, "package.json", '{"private":true}\n');
  await text(root, ".gitignore", "artifacts/\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "legacy fixture");
  const state = createInitialState({
    repositoryRoot: root,
    targetBranch: "fixture",
    verifiedCommit: git(root, "rev-parse", "HEAD"),
    protectedFiles: [],
    now: "2026-09-06T00:00:00.000Z",
  });
  return {
    root,
    state,
    store: new StateStore(root, "artifacts/state/state.json"),
  };
}
const legacySignals = {
  packageContractId: undefined,
  lockSchemaVersion: "1.0.0",
  lockAuthorityEpoch: undefined,
  commissioningId: "adopter-fixture.v1",
  publicationPresent: false,
};
const sourceSignals = {
  packageContractId: SOURCE_CONTRACT_ID,
  lockSchemaVersion: "2.0.0",
  lockAuthorityEpoch: SOURCE_EPOCH,
  commissioningId: SOURCE_CONTRACT_ID,
  publicationPresent: false,
};

describe("shared authority publication fence", { timeout: 60_000 }, () => {
  it("keeps unrelated legacy/adopter identity executable without importing source approval", async () => {
    const f = await fixture();
    expect(classifyAuthorityScope(legacySignals)).toBe("legacy");
    expect(await assertActiveAuthorityPublication(f.root)).toBe("legacy");
    expect(await f.store.load()).toBeNull();
    expect(
      git(
        f.root,
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ),
    ).toBe("");
    expect(
      existsSync(
        join(f.root, "evals/authority-revisions/ORCH-AUTH-01/approval.json"),
      ),
    ).toBe(false);
  });
  it.each(["future-contract", "", null, 7])(
    "rejects an unknown explicit contract %j",
    (id) => {
      expect(() =>
        classifyAuthorityScope({ ...legacySignals, packageContractId: id }),
      ).toThrow(/Unknown verification contract/);
    },
  );
  it.each([
    "packageContractId",
    "lockSchemaVersion",
    "lockAuthorityEpoch",
    "commissioningId",
  ] as const)("rejects mixed scope when %s is missing", (key) => {
    expect(() =>
      classifyAuthorityScope({ ...sourceSignals, [key]: undefined }),
    ).toThrow(/Mixed source\/legacy/);
  });
  it("rejects unknown lock/epoch and publication artifacts under legacy scope", () => {
    expect(() =>
      classifyAuthorityScope({ ...legacySignals, lockSchemaVersion: "3.0.0" }),
    ).toThrow(/schema is invalid/);
    expect(() =>
      classifyAuthorityScope({
        ...sourceSignals,
        lockAuthorityEpoch: "unknown.v1",
      }),
    ).toThrow(/Unknown authority epoch/);
    expect(() =>
      classifyAuthorityScope({ ...legacySignals, publicationPresent: true }),
    ).toThrow(/Mixed source\/legacy/);
  });
  it("does not accept a source publication's own approval flag", async () => {
    const f = await fixture();
    await text(
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
    await text(
      f.root,
      "evals/immutable-contract-lock.json",
      JSON.stringify({ schemaVersion: "2.0.0", authorityEpoch: SOURCE_EPOCH }),
    );
    await text(
      f.root,
      ".agent/verification-manifest.json",
      JSON.stringify({ commissioning: { id: SOURCE_CONTRACT_ID } }),
    );
    await text(
      f.root,
      SOURCE_AUTHORITY_PUBLICATION_PATH,
      '{"status":"PASS","approved":true}',
    );
    await expect(assertActiveAuthorityPublication(f.root)).rejects.toThrow(
      /not activated/,
    );
    await expect(f.store.initialize(f.state)).rejects.toThrow(/not activated/);
    expect(
      git(
        f.root,
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ),
    ).toBe("");
  });
  const consumers = [
    [
      "authority",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        validateCommissionedAuthorityAnchor({
          repositoryRoot: f.root,
          baseCommit: f.state.repository.verifiedCommit,
        }),
    ],
    [
      "active manifest",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        loadActiveVerificationManifest(f.root),
    ],
    [
      "raw manifest",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        loadVerificationManifest(f.root),
    ],
    [
      "configuration / Doctor",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        loadConfigForInspection(f.root),
    ],
    [
      "amendment",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        assertNoPendingAmendment(f.root),
    ],
    [
      "lease",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        ControllerLease.acquire({
          repositoryRoot: f.root,
          statePath: "artifacts/state/state.json",
          operation: "run",
        }),
    ],
    [
      "amendment lease",
      (f: Awaited<ReturnType<typeof fixture>>) =>
        ControllerLease.acquire({
          repositoryRoot: f.root,
          statePath: "artifacts/state/state.json",
          operation: "commission-amend",
        }),
    ],
    ["state read", (f: Awaited<ReturnType<typeof fixture>>) => f.store.load()],
    [
      "state inspection",
      (f: Awaited<ReturnType<typeof fixture>>) => f.store.inspect(),
    ],
    [
      "state mutation load",
      (f: Awaited<ReturnType<typeof fixture>>) => f.store.loadForMutation(),
    ],
    [
      "state initialization",
      (f: Awaited<ReturnType<typeof fixture>>) => f.store.initialize(f.state),
    ],
    [
      "state save",
      (f: Awaited<ReturnType<typeof fixture>>) => f.store.save(f.state),
    ],
  ] as const;
  it.each(consumers)(
    "refuses pending publication before %s can act",
    async (_label, consume) => {
      const f = await fixture();
      await text(
        f.root,
        AUTHORITY_MIGRATION_PENDING_PATH,
        "{malformed and still pending\n",
      );
      const before = git(
        f.root,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      );
      await expect(consume(f)).rejects.toThrow(/publication is pending/);
      expect(
        git(f.root, "status", "--porcelain=v1", "--untracked-files=all"),
      ).toBe(before);
      expect(
        git(
          f.root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      expect(existsSync(join(f.root, "artifacts/state/state.json"))).toBe(
        false,
      );
    },
  );
  it("refuses directory and dangling-junction intents without following them", async () => {
    const f = await fixture();
    const target = join(f.root, "owned-link-target"),
      intent = join(f.root, AUTHORITY_MIGRATION_PENDING_PATH);
    await mkdir(target);
    await mkdir(dirname(intent));
    await symlink(target, intent, "junction");
    await rm(target, { recursive: true });
    await expect(assertNoPendingAuthorityMigration(f.root)).rejects.toThrow(
      /publication is pending/,
    );
    await rm(intent, { force: true });
    await mkdir(intent);
    await expect(assertNoPendingAuthorityMigration(f.root)).rejects.toThrow(
      /publication is pending/,
    );
  });
  it("rejects a linked publication parent even when no intent is visible", async () => {
    const f = await fixture(),
      target = join(f.root, "owned-parent-target");
    await mkdir(target);
    await symlink(target, join(f.root, ".agent"), "junction");
    await expect(assertNoPendingAuthorityMigration(f.root)).rejects.toThrow(
      /publication directory/,
    );
  });
  it("rechecks an intent appearing after initial state object creation before the reference write", async () => {
    const f = await fixture();
    let reached = false;
    await expect(
      f.store.initialize(f.state, {
        afterObjectCreated: async () => {
          reached = true;
          await text(f.root, AUTHORITY_MIGRATION_PENDING_PATH, "{}");
        },
      }),
    ).rejects.toThrow(/publication is pending/);
    expect(reached).toBe(true);
    expect(
      git(
        f.root,
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ),
    ).toBe("");
  });
  it("rechecks an intent before publishing a state successor and preserves the previous generation", async () => {
    const f = await fixture(),
      current = await f.store.initialize(f.state);
    const before = git(f.root, "rev-parse", "refs/milestone-loop/state"),
      mirror = await readFile(f.store.path);
    let reached = false;
    await expect(
      f.store.save(current, {
        afterObjectCreated: async () => {
          reached = true;
          await text(f.root, AUTHORITY_MIGRATION_PENDING_PATH, "{}");
        },
      }),
    ).rejects.toThrow(/publication is pending/);
    expect(reached).toBe(true);
    expect(git(f.root, "rev-parse", "refs/milestone-loop/state")).toBe(before);
    expect(await readFile(f.store.path)).toEqual(mirror);
  });
  it("refuses a late intent before lease acquisition writes its private reference", async () => {
    const f = await fixture();
    let reached = false;
    await expect(
      ControllerLease.acquire({
        repositoryRoot: f.root,
        statePath: "artifacts/state/state.json",
        operation: "run",
        hooks: {
          afterObservedExisting: async () => {
            reached = true;
            await text(f.root, AUTHORITY_MIGRATION_PENDING_PATH, "{}");
          },
        },
      }),
    ).rejects.toThrow(/publication is pending/);
    expect(reached).toBe(true);
    expect(
      git(
        f.root,
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ),
    ).toBe("");
  });
  it("refuses a late intent at the state mirror rename boundary", async () => {
    const f = await fixture(),
      current = await f.store.initialize(f.state),
      before = await readFile(f.store.path);
    let reached = false;
    await expect(
      f.store.save(current, {
        beforeRename: async () => {
          reached = true;
          await text(f.root, AUTHORITY_MIGRATION_PENDING_PATH, "{}");
        },
      }),
    ).rejects.toThrow(/publication is pending/);
    expect(reached).toBe(true);
    expect(await readFile(f.store.path)).toEqual(before);
  });
  it("rejects pending publication through the actual native Node verification entrypoint with no PASS result", async () => {
    const f = await fixture(),
      controller = resolve(import.meta.dirname, "../../..");
    for (const path of [
      "scripts/verify.mjs",
      "tools/milestone-orchestrator/src/authority-anchor.ts",
      "tools/milestone-orchestrator/src/authority-publication.mjs",
      "tools/milestone-orchestrator/src/verification-scope.mjs",
      "tools/milestone-orchestrator/src/contract-integrity.ts",
      "tools/milestone-orchestrator/src/process-supervisor.ts",
      "tools/milestone-orchestrator/src/execution-provider-identity.ts",
    ]) {
      await mkdir(dirname(join(f.root, path)), { recursive: true });
      await copyFile(join(controller, path), join(f.root, path));
    }
    await text(f.root, AUTHORITY_MIGRATION_PENDING_PATH, "{unparseable");
    const command = spawnSync(
      process.execPath,
      [
        "scripts/verify.mjs",
        "--stage",
        "contract-integrity",
        "--run-id",
        "pending-authority",
      ],
      { cwd: f.root, encoding: "utf8", windowsHide: true, timeout: 30_000 },
    );
    expect(command.error).toBeUndefined();
    expect(command.status).toBe(3);
    expect(command.stderr).toContain(
      "Source authority migration publication is pending",
    );
    expect(command.stdout).not.toContain("[PASS]");
    expect(
      existsSync(join(f.root, "artifacts/pending-authority/result.json")),
    ).toBe(false);
  });
});
