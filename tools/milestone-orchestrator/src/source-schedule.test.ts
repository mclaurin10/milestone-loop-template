import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { trustedTestExecutionProvider } from "../test/fixtures.js";
import { loadInvariantSuiteRegistry } from "./config.js";
import {
  commissionedSourceAnchor,
  expectedSourceGeneration,
  parseSourceGeneration,
} from "./commissioning-audit.js";
import { TEST_OWNER_IDS } from "./test-ownership.js";
import {
  assertPartitionPrerequisite,
  focusedCommandTimeout,
  INVARIANT_COMMAND,
  LEGACY_TEST_COMMANDS,
  PARTITION_COMMANDS,
  PARTITION_CHECK_IDS,
  recomposeSourcePolicy,
  ROOT_PARTITION_CHECK_IDS,
  SOURCE_SCOPE_V2,
  sourceScheduleGeneration,
  SUBSUMED_TEST_IDS,
} from "./source-schedule.js";
import {
  planVerificationTier,
  tierCommandRecord,
} from "./verification-tier.js";

const root = resolve(import.meta.dirname, "../../..");
const anchor = commissionedSourceAnchor(root);
const v1 = parseSourceGeneration(anchor.generation);
const v2 = parseSourceGeneration(
  expectedSourceGeneration(anchor.generation, "v2"),
);
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});

async function plan(
  version: typeof v1,
  tier: "iteration" | "candidate" | "milestone" | "periodic",
  path = "tools/milestone-orchestrator/src/commissioning.ts",
) {
  return planVerificationTier({
    repositoryRoot: root,
    tier,
    manifest: version.manifest,
    scopePolicy: version.policy,
    scopePolicySha256: version.generation.hashes.policy,
    changedPaths: [path],
    changedPathSource: {
      kind: "fixture",
      fixtureId: `source-generation-${tier}`,
    },
    candidate: {
      baseCommit: anchor.commit,
      gitCommit: anchor.commit,
      gitTree: anchor.tree,
      workingTreeDirty: false,
    },
  });
}

describe("source schedule generation compatibility", () => {
  it("binds four canonical partition definitions to the unchanged owner order", () => {
    expect(
      PARTITION_COMMANDS.map(({ argv }) =>
        argv[1]?.slice("test:partition:".length),
      ),
    ).toEqual(TEST_OWNER_IDS);
    expect(sourceScheduleGeneration(v1.manifest, v1.policy)).toBe("v1");
    expect(sourceScheduleGeneration(v2.manifest, v2.policy)).toBe("v2");
  });

  it.each(PARTITION_CHECK_IDS)(
    "rejects an incomplete generation missing %s",
    (missing) => {
      expect(() =>
        sourceScheduleGeneration(
          {
            ...v2.manifest,
            focusedCommands: v2.manifest.focusedCommands.filter(
              ({ id }) => id !== missing,
            ),
          },
          v2.policy,
        ),
      ).toThrow(/complete generation/);
    },
  );

  it.each(["argv", "tiers", "expectedArtifactKinds"] as const)(
    "rejects a misbound partition %s",
    (key) => {
      const commands = structuredClone(v2.manifest.focusedCommands);
      const target = commands.find(({ id }) => id === PARTITION_CHECK_IDS[0])!;
      Object.assign(target, {
        [key]: key === "tiers" ? ["candidate"] : ["wrong"],
      });
      expect(() =>
        sourceScheduleGeneration(
          { ...v2.manifest, focusedCommands: commands },
          v2.policy,
        ),
      ).toThrow(/complete generation/);
    },
  );

  it("rejects mixed policy identities and tiered legacy commands", () => {
    expect(() => sourceScheduleGeneration(v2.manifest, v1.policy)).toThrow(
      /mixed/,
    );
    expect(() =>
      sourceScheduleGeneration(
        { ...v2.manifest, scopePolicyId: "arbitrary" } as typeof v2.manifest,
        v2.policy,
      ),
    ).toThrow(/Unsupported/);
    expect(() =>
      sourceScheduleGeneration(
        {
          ...v2.manifest,
          focusedCommands: [
            ...v2.manifest.focusedCommands,
            LEGACY_TEST_COMMANDS[0]!,
          ],
        },
        v2.policy,
      ),
    ).toThrow(/complete generation/);
  });

  it.each(["candidate", "milestone"] as const)(
    "recomposes %s with invariants first, four owners once, and no legacy commands",
    async (tier) => {
      const before = await plan(v1, tier);
      const after = await plan(v2, tier);
      expect(before.actualCheckIds).toContain("test-orchestrator");
      expect(after.actualCheckIds[0]).toBe("test-invariants");
      expect(
        after.commands
          .filter(({ id }) => PARTITION_CHECK_IDS.includes(id))
          .map(({ id }) => id),
      ).toEqual(PARTITION_CHECK_IDS);
      expect(
        after.actualCheckIds.filter((id) => SUBSUMED_TEST_IDS.includes(id)),
      ).toEqual([]);
      expect(
        after.actualCheckIds.filter((id) => !PARTITION_CHECK_IDS.includes(id)),
      ).toEqual(
        before.actualCheckIds.filter((id) => !SUBSUMED_TEST_IDS.includes(id)),
      );
    },
  );

  it.each(["iteration", "periodic"] as const)(
    "preserves %s command projections",
    async (tier) => {
      const before = await plan(v1, tier);
      const after = await plan(v2, tier);
      expect(after.commands).toEqual(before.commands);
      expect(after.actualCheckIds).toEqual(before.actualCheckIds);
    },
  );

  it("preserves every policy row's explicit mapping and deferred graduation", () => {
    const expectedTests: Record<string, readonly string[]> = {
      "protected-authority": ROOT_PARTITION_CHECK_IDS,
      "canonical-encoding": ROOT_PARTITION_CHECK_IDS,
      "shared-protocol": ROOT_PARTITION_CHECK_IDS,
      "persistence-codec": ROOT_PARTITION_CHECK_IDS,
      migration: ROOT_PARTITION_CHECK_IDS,
      "accepted-fixture": ROOT_PARTITION_CHECK_IDS,
      "standard-state": ROOT_PARTITION_CHECK_IDS,
      "composition-root": ROOT_PARTITION_CHECK_IDS,
      "worker-message": [],
      "package-graph": ROOT_PARTITION_CHECK_IDS,
      "browser-host": [],
      "ui-renderer": ROOT_PARTITION_CHECK_IDS,
      "domain-local-simulation": ROOT_PARTITION_CHECK_IDS,
      "orchestrator-evidence": [
        PARTITION_CHECK_IDS[0]!,
        PARTITION_CHECK_IDS[2]!,
      ],
      "documentation-only": [],
      unknown: ROOT_PARTITION_CHECK_IDS,
    };
    const policy = recomposeSourcePolicy(v1.policy);
    expect(policy.id).toBe(SOURCE_SCOPE_V2);
    for (const [trigger, checks] of Object.entries(policy.mandatoryChecks)) {
      expect(
        [...checks.filter((id) => PARTITION_CHECK_IDS.includes(id))].sort(),
      ).toEqual([...expectedTests[trigger]!].sort());
      expect(checks.filter((id) => !PARTITION_CHECK_IDS.includes(id))).toEqual(
        v1.policy.mandatoryChecks[
          trigger as keyof typeof v1.policy.mandatoryChecks
        ].filter((id) => !SUBSUMED_TEST_IDS.includes(id)),
      );
    }
    expect(
      policy.workspaceChecks["@milestone-loop/orchestrator"]?.filter((id) =>
        PARTITION_CHECK_IDS.includes(id),
      ),
    ).toEqual([PARTITION_CHECK_IDS[0], PARTITION_CHECK_IDS[2]]);
    expect(
      policy.workspaceChecks["milestone-loop-template"]?.filter((id) =>
        PARTITION_CHECK_IDS.includes(id),
      ),
    ).toEqual(ROOT_PARTITION_CHECK_IDS);
    expect(policy.graduation).toEqual(v1.policy.graduation);
    expect(policy.closureSuppressionAllowed).toBe(false);
    expect(policy.mode).toBe("shadow-only");
  });

  it("keeps broad source-v1 behavior and augments source-v2 with every owner", async () => {
    const before = await plan(v1, "candidate", "package.json");
    const after = await plan(v2, "candidate", "package.json");
    expect(before.selectedCheckIds).toContain("test-unit");
    expect(after.selectedCheckIds).not.toContain("test-unit");
    expect(after.selectedCheckIds).toEqual(
      expect.arrayContaining(PARTITION_CHECK_IDS),
    );
    expect(after.actualCheckIds).toContain("dependencies");
  });

  it("subsumes legacy recommendations only behind the validated ownership prerequisite", async () => {
    const policy = structuredClone(v2.policy);
    Object.assign(policy.mandatoryChecks, {
      "orchestrator-evidence": [
        "test-unit",
        "test-unit-fast",
        "test-unit-migrations",
        "test-orchestrator",
      ],
    });
    const after = await plan({ ...v2, policy }, "candidate");
    expect(after.selectedCheckIds).toEqual(
      expect.arrayContaining(SUBSUMED_TEST_IDS),
    );
    expect(
      after.actualCheckIds.filter((id) => SUBSUMED_TEST_IDS.includes(id)),
    ).toEqual([]);
    const registry = (await loadInvariantSuiteRegistry(root)).value;
    expect(() =>
      assertPartitionPrerequisite(v2.manifest, {
        ...registry,
        entries: registry.entries.filter(({ id }) => id !== "test-ownership"),
      }),
    ).toThrow(/production ownership/);
    expect(() =>
      assertPartitionPrerequisite(
        {
          ...v2.manifest,
          focusedCommands: v2.manifest.focusedCommands.filter(
            ({ id }) => id !== "test-invariants",
          ),
        },
        registry,
      ),
    ).toThrow(/prerequisite/);
    await expect(
      plan(
        {
          ...v2,
          manifest: {
            ...v2.manifest,
            focusedCommands: v2.manifest.focusedCommands.filter(
              ({ id }) => id !== "test-invariants",
            ),
          },
        },
        "candidate",
      ),
    ).rejects.toThrow(/complete generation/);
  });

  it.each([...PARTITION_COMMANDS, INVARIANT_COMMAND])(
    "passes the bounded timeout to the execution provider for $id",
    async (command) => {
      const directory = await mkdtemp(join(root, "artifacts/source-timeout-"));
      directories.push(directory);
      const expected = PARTITION_CHECK_IDS.includes(command.id)
        ? 3900000
        : 1200000;
      let observed: number | undefined;
      const record = await tierCommandRecord({
        repositoryRoot: directory,
        runRoot: directory,
        tier: "candidate",
        index: 0,
        command,
        telemetry: null,
        selectedCheckIds: [command.id],
        actualCheckIds: [command.id],
        candidate: {
          baseCommit: anchor.commit,
          gitCommit: anchor.commit,
          gitTree: anchor.tree,
          workingTreeDirty: false,
          changedPaths: [],
        },
        executionProvider: trustedTestExecutionProvider(
          async (executed, options) => {
            observed = options.timeoutMs;
            expect(executed.args).toEqual(command.argv.slice(1));
            return {
              id: command.id,
              displayCommand: command.argv.join(" "),
              status: "FAIL",
              exitCode: 1,
              signal: null,
              startedAt: "2026-09-04T00:00:00.000Z",
              finishedAt: "2026-09-04T00:00:00.001Z",
              durationMs: 1,
              stdoutPath: join(directory, "stdout.log"),
              stderrPath: join(directory, "stderr.log"),
              stdoutSha256: "a".repeat(64),
              stderrSha256: "b".repeat(64),
              parser: "exit-code",
              parsedArtifactPath: null,
              message: "Fixture child failed.",
              receipt: null,
              receiptAbsenceReason: "Failed fixture child.",
            };
          },
        ),
      });
      expect(observed).toBe(expected);
      expect(record.timeoutMs).toBe(expected);
      expect(record.status).toBe("FAIL");
      expect(record.receipt).toBeNull();
      expect(() =>
        focusedCommandTimeout({
          ...PARTITION_COMMANDS[0]!,
          argv: ["pnpm", "unrelated"],
        }),
      ).toThrow(/binding/);
    },
  );
});
