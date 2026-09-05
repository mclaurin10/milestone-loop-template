import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { genericCommissioningTierPlans } from "../test/fixtures.js";
import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";
import {
  loadActiveVerificationManifest,
  loadConfig,
  loadVerificationScopePolicy,
} from "./config.js";
import { VERIFICATION_TIERS } from "./contracts.js";
import {
  assertVerificationScheduleProjection,
  canonicalVerificationScheduleProjection,
  projectVerificationSchedule,
  type VerificationScheduleProjection,
} from "./schedule-projection.js";
import { planVerificationTier } from "./verification-tier.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const schema = JSON.parse(
  await readFile(
    resolve(
      import.meta.dirname,
      "../schemas/verification-schedule-projection.schema.json",
    ),
    "utf8",
  ),
) as unknown;

describe("verification schedule projection", () => {
  it("independently checks tuple positions and applies items only after the prefix", () => {
    const tupleSchema = {
      $id: "https://milestone-loop.local/fixtures/schedule-tuple",
      type: "array",
      prefixItems: [{ const: "node" }, { type: "number" }],
      items: { type: "boolean" },
    };
    for (const value of [[], ["node"], ["node", 1], ["node", 1, true, false]])
      expect(validateJsonSchema202012(tupleSchema, value).valid).toBe(true);
    for (const value of [["bash"], ["node", true], ["node", 1, 2]])
      expect(validateJsonSchema202012(tupleSchema, value).valid).toBe(false);
    expect(
      validateJsonSchema202012({ ...tupleSchema, items: false }, ["node", 1])
        .valid,
    ).toBe(true);
    expect(
      validateJsonSchema202012({ ...tupleSchema, items: false }, [
        "node",
        1,
        true,
      ]).valid,
    ).toBe(false);
    expect(
      validateJsonSchema202012({ ...tupleSchema, prefixItems: [false] }, [
        "node",
      ]).valid,
    ).toBe(false);
    expect(
      validateJsonSchema202012(
        { $id: tupleSchema.$id, type: "array", items: { type: "boolean" } },
        [true, false],
      ).valid,
    ).toBe(true);
    expect(
      validateJsonSchema202012(
        { $id: tupleSchema.$id, type: "array", items: { type: "boolean" } },
        ["node", false],
      ).valid,
    ).toBe(false);
  });

  it("fails closed on malformed tuple schemas and unsupported nested keywords", () => {
    for (const prefixItems of [
      { type: "string" },
      [],
      [null],
      [{ unevaluatedItems: false }],
    ])
      expect(() =>
        validateJsonSchema202012(
          {
            $id: "https://milestone-loop.local/fixtures/invalid-tuple",
            prefixItems,
          },
          [],
        ),
      ).toThrow();
  });

  it.each(VERIFICATION_TIERS)(
    "captures the production %s command order without candidate metadata",
    async (tier) => {
      const [manifest, config, policy] = await Promise.all([
        loadActiveVerificationManifest(repositoryRoot),
        loadConfig(repositoryRoot),
        loadVerificationScopePolicy(repositoryRoot),
      ]);
      const input = {
        repositoryRoot,
        tier,
        manifest: manifest.value,
        scopePolicy: policy.value,
        scopePolicySha256: policy.sha256,
        changedPaths: ["tools/milestone-orchestrator/src/commissioning.ts"],
        changedPathSource: {
          kind: "fixture" as const,
          fixtureId: `commissioning-${tier}`,
        },
        candidate: {
          baseCommit: "a".repeat(40),
          gitCommit: "b".repeat(40),
          gitTree: "c".repeat(40),
          workingTreeDirty: false,
        },
        protectedAuthorityPaths: config.protectedPaths,
      };
      const plan = await planVerificationTier(input);
      const projected = projectVerificationSchedule({
        tier,
        plan,
        exactVerificationArgv: manifest.value.exactVerification.argv,
      });
      expect(projected.actualCheckIds).toEqual(plan.actualCheckIds);
      expect(projected.commandCount).toBe(plan.commands.length);
      expect(
        projected.commands.filter(
          (command) => command.id !== "exact-readiness",
        ),
      ).toEqual(
        plan.commands.map(({ id, argv, expectedArtifactKinds }) => ({
          id,
          argv,
          expectedArtifactKinds,
        })),
      );
      expect(validateJsonSchema202012(schema, projected)).toMatchObject({
        valid: true,
        errors: [],
      });
      if (tier === "milestone" || tier === "periodic") {
        expect(projected.commands.at(-1)).toEqual({
          id: "exact-readiness",
          argv: ["pnpm", "verify"],
          expectedArtifactKinds: [],
        });
        expect(projected.commands).toHaveLength(projected.commandCount + 1);
      } else expect(projected.exactVerificationIncluded).toBe(false);
      if (tier === "periodic")
        expect(projected.actualCheckIds).toEqual(["exact-readiness"]);
      const changedIdentityPlan = await planVerificationTier({
        ...input,
        candidate: {
          ...input.candidate,
          gitCommit: "d".repeat(40),
          workingTreeDirty: true,
        },
      });
      expect(canonicalVerificationScheduleProjection(projected)).toBe(
        canonicalVerificationScheduleProjection(
          projectVerificationSchedule({
            tier,
            plan: changedIdentityPlan,
            exactVerificationArgv: manifest.value.exactVerification.argv,
          }),
        ),
      );
    },
  );

  it("rejects unbound, duplicate, omitted, or reordered production command definitions", () => {
    const command = {
      id: "lint",
      argv: ["pnpm", "lint"],
      tiers: ["candidate" as const],
      expectedArtifactKinds: ["lint-report"],
    };
    const other = {
      ...command,
      id: "typecheck",
      argv: ["pnpm", "typecheck"],
      expectedArtifactKinds: ["typecheck-report"],
    };
    for (const plan of [
      { actualCheckIds: [], commands: [command] },
      { actualCheckIds: ["lint"], commands: [] },
      { actualCheckIds: ["lint", "typecheck"], commands: [other, command] },
      { actualCheckIds: ["lint", "lint"], commands: [command, command] },
      { actualCheckIds: ["exact-readiness", "lint"], commands: [command] },
    ])
      expect(() =>
        projectVerificationSchedule({
          tier: "candidate",
          plan,
          exactVerificationArgv: ["pnpm", "verify"],
        }),
      ).toThrow();
  });

  it("copies definitions and preserves argv and artifact order in canonical comparisons", () => {
    const command = {
      id: "check",
      argv: ["node", "check.mjs", "--a", "--b"],
      tiers: ["candidate" as const],
      expectedArtifactKinds: ["primary", "secondary"],
    };
    const projected = projectVerificationSchedule({
      tier: "candidate",
      plan: { actualCheckIds: ["check"], commands: [command] },
      exactVerificationArgv: ["pnpm", "verify"],
    });
    const canonical = canonicalVerificationScheduleProjection(projected);
    command.argv.reverse();
    command.expectedArtifactKinds.reverse();
    expect(canonicalVerificationScheduleProjection(projected)).toBe(canonical);
    expect(
      canonicalVerificationScheduleProjection({
        ...projected,
        commands: [
          {
            ...projected.commands[0],
            argv: ["node", "check.mjs", "--b", "--a"],
          },
        ],
      }),
    ).not.toBe(canonical);
    expect(
      canonicalVerificationScheduleProjection({
        ...projected,
        commands: [
          {
            ...projected.commands[0],
            expectedArtifactKinds: ["secondary", "primary"],
          },
        ],
      }),
    ).not.toBe(canonical);
    expect(
      canonicalVerificationScheduleProjection({
        commands: projected.commands,
        actualCheckIds: projected.actualCheckIds,
        exactVerificationIncluded: false,
        commandCount: 1,
        tier: "candidate",
        schemaVersion: projected.schemaVersion,
      }),
    ).toBe(canonical);
  });

  const candidate = genericCommissioningTierPlans().find(
    (plan) => plan.tier === "candidate",
  )!;
  const malformed: readonly { id: string; value: unknown }[] = [
    { id: "unknown root field", value: { ...candidate, timeoutMs: 1 } },
    {
      id: "unknown schema version",
      value: {
        ...candidate,
        schemaVersion: "verification-schedule-projection.v99",
      },
    },
    { id: "unknown tier", value: { ...candidate, tier: "unverified" } },
    {
      id: "fractional focused count",
      value: { ...candidate, commandCount: 0.5 },
    },
    {
      id: "duplicate IDs",
      value: {
        ...candidate,
        actualCheckIds: ["test-invariants", "test-invariants"],
      },
    },
    {
      id: "unknown command field",
      value: {
        ...candidate,
        commands: [{ ...candidate.commands[0], skip: true }],
      },
    },
    {
      id: "unsafe executable",
      value: {
        ...candidate,
        commands: [{ ...candidate.commands[0], argv: ["bash", "unsafe.sh"] }],
      },
    },
    {
      id: "blank argument",
      value: {
        ...candidate,
        commands: [{ ...candidate.commands[0], argv: ["pnpm", " "] }],
      },
    },
    {
      id: "missing focused artifact kind",
      value: {
        ...candidate,
        commands: [{ ...candidate.commands[0], expectedArtifactKinds: [] }],
      },
    },
    {
      id: "duplicate artifact kinds",
      value: {
        ...candidate,
        commands: [
          {
            ...candidate.commands[0],
            expectedArtifactKinds: ["proof", "proof"],
          },
        ],
      },
    },
  ];
  it.each(malformed)(
    "rejects $id in both runtime and published schema",
    ({ value }) => {
      expect(() => assertVerificationScheduleProjection(value)).toThrow();
      expect(validateJsonSchema202012(schema, value).valid).toBe(false);
    },
  );

  it("rejects semantic count, ID, and exact-closure inconsistencies", () => {
    const periodic = genericCommissioningTierPlans().find(
      (plan) => plan.tier === "periodic",
    )!;
    const milestone = genericCommissioningTierPlans().find(
      (plan) => plan.tier === "milestone",
    )!;
    const values: unknown[] = [
      { ...candidate, commandCount: 2 },
      { ...candidate, actualCheckIds: ["different-check"] },
      { ...candidate, actualCheckIds: [] },
      { ...candidate, exactVerificationIncluded: true },
      {
        ...periodic,
        commands: [
          {
            ...periodic.commands[0],
            argv: ["pnpm", "verify", "--stage", "unit-domain"],
          },
        ],
      },
      {
        ...periodic,
        commands: [
          { ...periodic.commands[0], expectedArtifactKinds: ["substitute"] },
        ],
      },
      {
        ...milestone,
        commands: [...milestone.commands].reverse(),
        actualCheckIds: [...milestone.actualCheckIds].reverse(),
      },
      { ...milestone, tier: "periodic" },
      { ...candidate, tier: "milestone" },
    ];
    for (const value of values)
      expect(() => assertVerificationScheduleProjection(value)).toThrow();
    const reordered = {
      ...milestone,
      commands: [...milestone.commands].reverse(),
      actualCheckIds: [...milestone.actualCheckIds].reverse(),
    } satisfies VerificationScheduleProjection;
    expect(() => canonicalVerificationScheduleProjection(reordered)).toThrow(
      /final literal/,
    );
  });
});
