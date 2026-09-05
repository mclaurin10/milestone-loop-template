import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  finalizeScopeSelection,
  recommendAffectedScope,
  scopeSelectionBytes,
  validateScopeSelection,
} from "./affected-scope.js";
import { loadHistoricalVerificationManifest } from "./config.js";
import { sourceV1ScopePolicyFixture } from "../test/fixtures.js";
import { buildPackageGraph } from "./package-graph.js";
import { planVerificationTier } from "./verification-tier.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(
  import.meta.dirname,
  "..",
  "test",
  "scope-fixtures",
);
const candidate = {
  baseCommit: "a".repeat(40),
  gitCommit: "b".repeat(40),
  gitTree: "c".repeat(40),
  workingTreeDirty: false,
} as const;

interface ScopeFixture {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly changedPaths: readonly string[];
  readonly expectedTriggerClasses: readonly string[];
  readonly expectedUnknownPaths: readonly string[];
  readonly mandatoryExpectedCheckIds: readonly string[];
}

async function setup() {
  const [manifest, policy, graph] = await Promise.all([
    loadHistoricalVerificationManifest(repositoryRoot, "source-benchmark"),
    sourceV1ScopePolicyFixture(repositoryRoot),
    buildPackageGraph(repositoryRoot),
  ]);
  return { manifest, policy, graph };
}

describe("shadow affected-scope selection", () => {
  it("covers every semantic trigger fixture without a false negative", async () => {
    const { manifest, policy, graph } = await setup();
    const files = (await readdir(fixtureRoot))
      .filter((path) => path.endsWith(".json"))
      .sort();
    expect(files).toHaveLength(17);
    expect(policy.value.graduation).toMatchObject({
      deferred: true,
      minimumComparisons: 30,
      minimumExamplesPerTrigger: 3,
      requiresZeroFalseNegatives: true,
      requiresZeroUnknowns: true,
      requiresDeterministicRecommendations: true,
      requiresMeasuredSavingsAboveNoise: true,
      requiresNoClosureRegression: true,
      requiresIndependentReview: true,
      requiresExplicitPolicyChange: true,
    });
    const covered = new Set<string>();

    for (const file of files) {
      const fixture = JSON.parse(
        await readFile(resolve(fixtureRoot, file), "utf8"),
      ) as ScopeFixture;
      const recommendation = recommendAffectedScope({
        changedPaths: fixture.changedPaths,
        changedPathSource: { kind: "fixture", fixtureId: fixture.id },
        candidate,
        manifest: manifest.value,
        policy: policy.value,
        policySha256: policy.sha256,
        packageGraph: graph,
      });
      const selection = finalizeScopeSelection(recommendation, {
        actualCheckIds: recommendation.recommendedCheckIds,
        failingActualCheckIds: [],
        mandatoryExpectedCheckIds: fixture.mandatoryExpectedCheckIds,
      });
      fixture.expectedTriggerClasses.forEach((entry) => covered.add(entry));
      expect(selection.matchedTriggerClasses, fixture.id).toEqual(
        fixture.expectedTriggerClasses,
      );
      expect(selection.unknownPaths, fixture.id).toEqual(
        fixture.expectedUnknownPaths,
      );
      expect(selection.recommendedCheckIds, fixture.id).toEqual(
        expect.arrayContaining([...fixture.mandatoryExpectedCheckIds]),
      );
      expect(selection.falseNegativeCheckIds, fixture.id).toEqual([]);
      expect(validateScopeSelection(selection), fixture.id).toEqual({
        valid: true,
        errors: [],
      });
    }

    expect([...covered].sort()).toEqual(
      [...policy.value.triggerClasses].sort(),
    );
  });

  it("uses reverse dependents for shared protocol and stays deterministic", async () => {
    const { manifest, policy, graph } = await setup();
    const tierCandidate = {
      ...candidate,
      changedPaths: ["packages/protocol/src/authorization.ts"],
    };
    const input = {
      changedPaths: ["packages/protocol/src/authorization.ts"],
      changedPathSource: {
        kind: "fixture" as const,
        fixtureId: "protocol-determinism",
      },
      candidate: tierCandidate,
      manifest: manifest.value,
      policy: policy.value,
      policySha256: policy.sha256,
      packageGraph: graph,
    };
    const first = recommendAffectedScope(input);
    const second = recommendAffectedScope(input);

    expect(scopeSelectionBytes(first)).toEqual(scopeSelectionBytes(second));
    expect(first.candidate).toEqual(candidate);
    expect(first.classifications[0]?.reverseDependentPackages).toEqual([]);
    expect(first.recommendedCheckIds).toEqual(
      expect.arrayContaining([
        "test-invariants",
        "test-unit",
        "typecheck",
        "build",
      ]),
    );
  });

  it("reports actual failures omitted by a recommendation as false negatives", async () => {
    const { manifest, policy, graph } = await setup();
    const recommendation = recommendAffectedScope({
      changedPaths: ["packages/ui/src/panel.tsx"],
      changedPathSource: { kind: "fixture", fixtureId: "false-negative" },
      candidate,
      manifest: manifest.value,
      policy: policy.value,
      policySha256: policy.sha256,
      packageGraph: graph,
    });
    const selection = finalizeScopeSelection(recommendation, {
      actualCheckIds: [...recommendation.recommendedCheckIds, "format-check"],
      failingActualCheckIds: ["format-check"],
      mandatoryExpectedCheckIds: [],
    });

    expect(selection.omittedFromRecommendationActualCheckIds).toContain(
      "format-check",
    );
    expect(selection.falseNegativeCheckIds).toEqual(["format-check"]);
  });

  it("rejects protected authority in ordinary proposal scope", async () => {
    const { manifest, policy, graph } = await setup();
    expect(() =>
      recommendAffectedScope({
        changedPaths: ["PROJECT_GOAL.md"],
        changedPathSource: { kind: "proposal", milestoneId: "ordinary-work" },
        candidate,
        manifest: manifest.value,
        policy: policy.value,
        policySha256: policy.sha256,
        packageGraph: graph,
      }),
    ).toThrow(/explicit governance/i);
  });

  it("keeps candidate execution broader than leaf recommendations and never suppresses closure", async () => {
    const { manifest, policy } = await setup();
    const leaf = await planVerificationTier({
      repositoryRoot,
      tier: "candidate",
      manifest: manifest.value,
      scopePolicy: policy.value,
      scopePolicySha256: policy.sha256,
      changedPaths: ["packages/ui/src/index.tsx"],
      changedPathSource: { kind: "fixture", fixtureId: "leaf-ui-plan" },
      candidate,
    });
    expect(leaf.scopeSelection.recommendedCheckIds).not.toContain(
      "format-check",
    );
    expect(leaf.actualCheckIds).toContain("format-check");
    expect(
      leaf.scopeSelection.omittedFromRecommendationActualCheckIds,
    ).toContain("format-check");
    expect(leaf.actualCheckIds).toEqual([
      "test-invariants",
      "format-check",
      "lint",
      "lint-architecture",
      "typecheck",
      "build",
      "test-unit-fast",
      "test-orchestrator",
    ]);

    const milestone = await planVerificationTier({
      repositoryRoot,
      tier: "milestone",
      manifest: manifest.value,
      scopePolicy: policy.value,
      scopePolicySha256: policy.sha256,
      changedPaths: ["docs/verification.md"],
      changedPathSource: { kind: "fixture", fixtureId: "closure-plan" },
      candidate,
    });
    expect(milestone.actualCheckIds).toEqual(milestone.fullClosureCheckIds);
    expect(milestone.actualCheckIds.at(-1)).toBe("exact-readiness");
  });

  it("ships a strict parseable scope-selection JSON schema", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(
          repositoryRoot,
          "tools/milestone-orchestrator/schemas/scope-selection.schema.json",
        ),
        "utf8",
      ),
    ) as { $schema?: string; $id?: string; additionalProperties?: boolean };
    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toContain("1.0.0");
    expect(schema.additionalProperties).toBe(false);
  });
});
