import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { check, format } from "prettier";

import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";
import { amendCommissionedRepository } from "./commissioning-amendment.js";
import {
  AMENDMENT_DECISION,
  AMENDMENT_LEDGER_PATH,
  AMENDMENT_PATHS,
  AMENDMENT_PENDING_PATH,
  amendmentEntryHash,
  amendmentGit,
  amendmentHash,
  amendmentJson,
  assertAmendmentDescriptor,
  expectedSourceGeneration,
  inspectSourceAmendmentAudit,
  readAmendmentFile,
  type AmendmentDescriptor,
  type AmendmentLedger,
} from "./commissioning-audit.js";
import { inspectCommissionedRepository } from "./commissioning.js";
import { parseAmendmentCliArguments } from "./commissioning-cli.js";
import { loadActiveVerificationManifest, loadConfig } from "./config.js";
import { ControllerLease } from "./controller-lease.js";

const sourceRoot = resolve(import.meta.dirname, "../../..");
// Frozen pre-amendment compatibility fixture: it has every partition script,
// the original v1 generation, and the approved decision, with no amendment.
const PRE_AMENDMENT_COMMIT = "da8f6c93450dca352895722b6b40c72193b0c2d7";
const DESCRIPTOR = "tools/milestone-orchestrator/config/wp6e-amendment.json";
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});

async function textFile(
  root: string,
  path: string,
  text: string,
): Promise<void> {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), text, "utf8");
}

function commit(root: string, message: string): void {
  amendmentGit(root, "add", "--all");
  amendmentGit(
    root,
    "-c",
    "user.name=Amendment Fixture",
    "-c",
    "user.email=amendment@example.invalid",
    "commit",
    "-m",
    message,
  );
}

async function descriptorFor(
  root: string,
  version: "v1" | "v2",
): Promise<AmendmentDescriptor> {
  const audit = await inspectSourceAmendmentAudit(root);
  const next = expectedSourceGeneration(audit.anchor.generation, version);
  return {
    schemaVersion: "verification-manifest-amendment-request.v1",
    paths: AMENDMENT_PATHS,
    expected: {
      hashes: audit.generation.hashes,
      chainTip: audit.ledger?.entries.at(-1)?.contentSha256 ?? null,
    },
    proposed: { input: next.files.input, policy: next.files.policy },
    decisionHeading: AMENDMENT_DECISION,
  };
}

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "amend-"));
  directories.push(directory);
  const root = join(directory, "r");
  execFileSync(
    "git",
    ["clone", "--quiet", "--no-hardlinks", "--local", sourceRoot, root],
    { windowsHide: true, stdio: "pipe" },
  );
  amendmentGit(root, "checkout", "-B", "master", PRE_AMENDMENT_COMMIT);
  await textFile(
    root,
    DESCRIPTOR,
    amendmentJson(await descriptorFor(root, "v2")),
  );
  commit(root, "Prepare source-v2 amendment fixture");
  return root;
}

async function apply(
  root: string,
  extra: Partial<Parameters<typeof amendCommissionedRepository>[0]> = {},
) {
  return amendCommissionedRepository({
    repositoryRoot: root,
    descriptorPath: DESCRIPTOR,
    ...extra,
  });
}

describe("Git-anchored source commissioning amendments", () => {
  it("refuses formatting-only amendments without adding a ledger entry", async () => {
    const root = await fixture();
    await apply(root);
    commit(root, "Publish original-layout source-v2 fixture");
    const before = await inspectSourceAmendmentAudit(root);
    const descriptor = await descriptorFor(root, "v2");
    const proposed = {
      input: await format(descriptor.proposed.input, { parser: "json" }),
      policy: await format(descriptor.proposed.policy, { parser: "json" }),
    };
    expect(proposed.input).not.toBe(before.generation.files.input);
    await textFile(
      root,
      DESCRIPTOR,
      amendmentJson({ ...descriptor, proposed }),
    );
    commit(root, "Prepare formatting-only amendment fixture");
    await expect(apply(root)).rejects.toThrow(/no-op/u);
    const after = await inspectSourceAmendmentAudit(root);
    expect(after.generation).toEqual(before.generation);
    expect(after.ledgerText).toBe(before.ledgerText);
    expect(await readAmendmentFile(root, AMENDMENT_PENDING_PATH)).toBeNull();
  }, 30_000);

  it("publishes formatter-compliant descriptor bytes without changing the approved content", async () => {
    const root = await fixture();
    const descriptor = await descriptorFor(root, "v2");
    const options = { parser: "json" } as const;
    const proposed = {
      input: await format(descriptor.proposed.input, options),
      policy: await format(descriptor.proposed.policy, options),
    };
    expect(proposed).not.toEqual(descriptor.proposed);
    await textFile(
      root,
      DESCRIPTOR,
      amendmentJson({ ...descriptor, proposed }),
    );
    commit(root, "Prepare formatted source-v2 descriptor");
    const result = await apply(root);
    expect(result.status).toBe("PASS");
    for (const key of ["input", "policy"] as const) {
      const bytes = await readFile(resolve(root, AMENDMENT_PATHS[key]), "utf8");
      expect(bytes).toBe(proposed[key]);
      expect(await check(bytes, options)).toBe(true);
      expect(JSON.parse(bytes)).toEqual(JSON.parse(descriptor.proposed[key]));
    }
    commit(root, "Publish formatted coherent generation");
    expect((await inspectCommissionedRepository(root)).status).toBe("PASS");
  }, 30_000);

  it("applies a committed descriptor to clean v1 and reverses by extending the ledger", async () => {
    const root = await fixture();
    const before = await inspectSourceAmendmentAudit(root);
    const first = await apply(root);
    expect(first.status).toBe("PASS");
    expect(first.completionEligible).toBe(false);
    expect(first.doctor.scopePolicyId).toBe(
      "milestone-loop-shadow-scope-policy.v2",
    );
    expect(
      first.diff.map(({ tier, added, removed }) => ({
        tier,
        added: added.length,
        removed: removed.length,
      })),
    ).toEqual([
      { tier: "iteration", added: 0, removed: 0 },
      { tier: "candidate", added: 4, removed: 2 },
      { tier: "milestone", added: 4, removed: 3 },
      { tier: "periodic", added: 0, removed: 0 },
    ]);
    expect(await readAmendmentFile(root, AMENDMENT_PENDING_PATH)).toBeNull();
    commit(root, "Publish coherent source-v2 generation");
    const firstLedger = await readFile(
      resolve(root, AMENDMENT_LEDGER_PATH),
      "utf8",
    );
    const ledgerSchema = JSON.parse(
      await readFile(
        resolve(
          sourceRoot,
          "tools/milestone-orchestrator/schemas/commissioning-amendment-ledger.schema.json",
        ),
        "utf8",
      ),
    ) as unknown;
    const schemaResult = validateJsonSchema202012(
      ledgerSchema,
      JSON.parse(firstLedger) as unknown,
    );
    expect(schemaResult.errors).toEqual([]);
    expect(schemaResult.valid).toBe(true);
    await textFile(
      root,
      DESCRIPTOR,
      amendmentJson(await descriptorFor(root, "v1")),
    );
    commit(root, "Prepare audited reverse amendment");
    const reversed = await apply(root);
    expect(reversed.doctor.scopePolicyId).toBe(
      "milestone-loop-shadow-scope-policy.v1",
    );
    const after = await inspectSourceAmendmentAudit(root);
    expect(after.generation).toEqual(before.generation);
    expect(after.ledger?.entries).toHaveLength(2);
    expect(after.ledger?.entries[0]).toEqual(
      (JSON.parse(firstLedger) as AmendmentLedger).entries[0],
    );
    commit(root, "Publish audited reverse generation");
    await expect(inspectCommissionedRepository(root)).resolves.toMatchObject({
      status: "PASS",
    });
  }, 60000);

  it("rejects unknown descriptor fields, output paths, and malformed CLI options", async () => {
    const root = await fixture();
    const descriptor = await descriptorFor(root, "v2");
    const schema = JSON.parse(
      await readFile(
        resolve(
          sourceRoot,
          "tools/milestone-orchestrator/schemas/commissioning-amendment-request.schema.json",
        ),
        "utf8",
      ),
    ) as unknown;
    expect(validateJsonSchema202012(schema, descriptor).valid).toBe(true);
    for (const mutation of [
      { ...descriptor, manifest: "injected" },
      { ...descriptor, paths: { ...descriptor.paths, input: "../outside" } },
      { ...descriptor, expected: { ...descriptor.expected, surprise: true } },
    ]) {
      expect(() => assertAmendmentDescriptor(mutation)).toThrow();
      expect(validateJsonSchema202012(schema, mutation).valid).toBe(false);
    }
    expect(
      parseAmendmentCliArguments([
        "--",
        "--descriptor",
        DESCRIPTOR,
        "--resume",
      ]),
    ).toEqual({ mode: "amend", descriptorPath: DESCRIPTOR, resume: true });
    for (const args of [
      [],
      ["--descriptor"],
      ["--descriptor", DESCRIPTOR, "--descriptor", DESCRIPTOR],
      ["--resume", "--resume"],
      ["--input", DESCRIPTOR],
    ])
      expect(() => parseAmendmentCliArguments(args)).toThrow();
  }, 30000);

  it.each([
    "dirty",
    "stale",
    "no-op",
    "identity",
    "missing-script",
    "substituted-invariant",
    "omitted-ownership",
    "wrong-branch",
  ])(
    "refuses a %s start without changing the active generation",
    async (mutation) => {
      const root = await fixture();
      const before = await inspectSourceAmendmentAudit(root);
      if (mutation === "dirty")
        await textFile(root, "unrelated.txt", "Keep this user change.\n");
      else if (mutation === "wrong-branch")
        amendmentGit(root, "checkout", "-b", "codex/other");
      else if (mutation === "omitted-ownership") {
        const path = "tools/milestone-orchestrator/config/invariant-suite.json";
        const registry = JSON.parse(
          await readFile(resolve(root, path), "utf8"),
        ) as { entries: { id: string }[] };
        registry.entries = registry.entries.filter(
          ({ id }) => id !== "test-ownership",
        );
        await textFile(root, path, amendmentJson(registry));
        commit(root, "Omitted production ownership invariant mutation");
      } else if (
        mutation === "missing-script" ||
        mutation === "substituted-invariant"
      ) {
        const pkg = JSON.parse(
          await readFile(resolve(root, "package.json"), "utf8"),
        ) as { scripts: Record<string, string> };
        if (mutation === "missing-script")
          delete pkg.scripts["test:partition:controller-runtime"];
        else pkg.scripts["test:invariants"] = "node untrusted-substitute.mjs";
        await textFile(root, "package.json", amendmentJson(pkg));
        commit(root, "Missing partition script mutation");
      } else {
        let descriptor = await descriptorFor(
          root,
          mutation === "no-op" ? "v1" : "v2",
        );
        if (mutation === "stale")
          descriptor = {
            ...descriptor,
            expected: { ...descriptor.expected, chainTip: "f".repeat(64) },
          };
        if (mutation === "identity") {
          const proposed = JSON.parse(descriptor.proposed.input) as {
            objective: string;
          };
          proposed.objective = "An unauthorized different objective";
          descriptor = {
            ...descriptor,
            proposed: {
              ...descriptor.proposed,
              input: amendmentJson(proposed),
            },
          };
        }
        await textFile(root, DESCRIPTOR, amendmentJson(descriptor));
        commit(root, `Prepare ${mutation} rejection`);
      }
      await expect(apply(root)).rejects.toThrow();
      for (const key of ["input", "policy", "manifest"] as const)
        expect(
          await readFile(resolve(root, AMENDMENT_PATHS[key]), "utf8"),
        ).toBe(before.generation.files[key]);
      expect(await readAmendmentFile(root, AMENDMENT_LEDGER_PATH)).toBeNull();
      expect(await readAmendmentFile(root, AMENDMENT_PENDING_PATH)).toBeNull();
    },
    30000,
  );

  const boundaries = [
    "intent",
    ...Object.values(AMENDMENT_PATHS).flatMap((path) => [
      `before:${path}`,
      `staged:${path}`,
      `after:${path}`,
    ]),
    `before:${AMENDMENT_LEDGER_PATH}`,
    `staged:${AMENDMENT_LEDGER_PATH}`,
    `after:${AMENDMENT_LEDGER_PATH}`,
    "finalized",
  ];
  it.each(boundaries)(
    "recovers exact prior/new bytes after interruption at %s",
    async (boundary) => {
      const root = await fixture();
      const interrupt = (point: string) => {
        if (point === boundary)
          throw new Error(`Injected interruption at ${point}`);
      };
      await expect(
        apply(root, {
          hooks: {
            afterIntent: () => interrupt("intent"),
            beforeReplace: (path) => interrupt(`before:${path}`),
            afterReplace: (path) => interrupt(`after:${path}`),
            afterStagedFile: (path) => interrupt(`staged:${path}`),
            afterFinalization: () => interrupt("finalized"),
          },
        }),
      ).rejects.toThrow(/Injected interruption/);
      if (boundary !== "finalized") {
        await expect(inspectCommissionedRepository(root)).rejects.toThrow(
          /incomplete/,
        );
        await expect(loadActiveVerificationManifest(root)).rejects.toThrow(
          /incomplete/,
        );
        const config = await loadConfig(root);
        await expect(
          ControllerLease.acquire({
            repositoryRoot: root,
            statePath: config.statePath,
            operation: "run",
          }),
        ).rejects.toThrow(/incomplete/);
        await expect(apply(root)).rejects.toThrow(/pending/);
      }
      const completed = await apply(root, { resume: true });
      expect(completed.status).toBe("PASS");
      expect(completed.resumed).toBe(true);
      expect(
        (await inspectSourceAmendmentAudit(root)).ledger?.entries,
      ).toHaveLength(1);
    },
    60000,
  );

  it("preserves foreign changes and resumes only after exact recorded bytes are restored", async () => {
    const root = await fixture();
    await expect(
      apply(root, {
        hooks: {
          afterIntent: () => {
            throw new Error("Injected interruption");
          },
        },
      }),
    ).rejects.toThrow(/Injected/);
    const prior = await readFile(resolve(root, AMENDMENT_PATHS.policy), "utf8");
    await textFile(root, AMENDMENT_PATHS.policy, "foreign edit\n");
    await expect(apply(root, { resume: true })).rejects.toThrow(
      /Foreign change/,
    );
    expect(await readFile(resolve(root, AMENDMENT_PATHS.policy), "utf8")).toBe(
      "foreign edit\n",
    );
    await textFile(root, AMENDMENT_PATHS.policy, prior);
    await expect(apply(root, { resume: true })).resolves.toMatchObject({
      status: "PASS",
    });
  }, 60000);

  it("serializes concurrent starts through the existing controller lease", async () => {
    const root = await fixture();
    let entered!: () => void;
    let proceed!: () => void;
    const ready = new Promise<void>((done) => {
      entered = done;
    });
    const release = new Promise<void>((done) => {
      proceed = done;
    });
    const first = apply(root, {
      hooks: {
        afterIntent: async () => {
          entered();
          await release;
        },
      },
    });
    await ready;
    try {
      await expect(apply(root, { resume: true })).rejects.toThrow(
        /holds the mutation lease/,
      );
    } finally {
      proceed();
    }
    await expect(first).resolves.toMatchObject({ status: "PASS" });
    expect(
      (await inspectSourceAmendmentAudit(root)).ledger?.entries,
    ).toHaveLength(1);
  }, 60000);

  it.each(["input", "policy", "manifest", "coordinated"])(
    "rejects unamended %s drift against the original Git blobs",
    async (mutation) => {
      const root = await fixture();
      const descriptor = await descriptorFor(root, "v2");
      const audit = await inspectSourceAmendmentAudit(root);
      const next = expectedSourceGeneration(audit.anchor.generation, "v2");
      const keys =
        mutation === "coordinated"
          ? (["input", "policy", "manifest"] as const)
          : [mutation as keyof typeof AMENDMENT_PATHS];
      for (const key of keys)
        await textFile(root, AMENDMENT_PATHS[key], next.files[key]);
      expect(descriptor.expected.chainTip).toBeNull();
      await expect(inspectCommissionedRepository(root)).rejects.toThrow();
      await expect(loadActiveVerificationManifest(root)).rejects.toThrow();
    },
    30000,
  );

  it.each(["delete", "truncate", "rewrite", "committed-delete"])(
    "rejects ledger %s after activation even when the active files match each other",
    async (mutation) => {
      const root = await fixture();
      await apply(root);
      commit(root, "Publish the first amendment");
      if (mutation === "delete" || mutation === "committed-delete") {
        await unlink(resolve(root, AMENDMENT_LEDGER_PATH));
        if (mutation === "committed-delete")
          commit(root, "Invalid ledger deletion mutation");
      } else {
        const ledger = JSON.parse(
          await readFile(resolve(root, AMENDMENT_LEDGER_PATH), "utf8"),
        ) as AmendmentLedger;
        if (mutation === "truncate") Object.assign(ledger, { entries: [] });
        else {
          const first = ledger.entries[0]!;
          Object.assign(first, { descriptorSha256: "f".repeat(64) });
          Object.assign(first, { contentSha256: amendmentEntryHash(first) });
        }
        await textFile(root, AMENDMENT_LEDGER_PATH, amendmentJson(ledger));
      }
      await expect(inspectCommissionedRepository(root)).rejects.toThrow();
    },
    60000,
  );

  it("refuses a changed descriptor or HEAD during recovery", async () => {
    const root = await fixture();
    await expect(
      apply(root, {
        hooks: {
          afterIntent: () => {
            throw new Error("Injected interruption");
          },
        },
      }),
    ).rejects.toThrow(/Injected/);
    const bytes = await readFile(resolve(root, DESCRIPTOR), "utf8");
    await textFile(root, DESCRIPTOR, `${bytes}\n`);
    await expect(apply(root, { resume: true })).rejects.toThrow(
      /committed and unchanged/,
    );
    await textFile(root, DESCRIPTOR, bytes);
    amendmentGit(
      root,
      "-c",
      "user.name=Amendment Fixture",
      "-c",
      "user.email=amendment@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "Change HEAD during publication",
    );
    await expect(apply(root, { resume: true })).rejects.toThrow(
      /does not match/,
    );
    expect(
      amendmentHash((await readAmendmentFile(root, AMENDMENT_PENDING_PATH))!),
    ).toMatch(/^[a-f0-9]{64}$/u);
  }, 60000);
});
