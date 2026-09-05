import type {
  FocusedVerificationCommand,
  InvariantSuiteRegistry,
  VerificationCommandManifest,
  VerificationScopePolicy,
} from "./contracts.js";
import { canonicalJson } from "./package-graph.js";

export const SOURCE_COMMISSIONING_ID = "milestone-loop-template-source.v1";
export const SOURCE_SCOPE_V1 = "milestone-loop-shadow-scope-policy.v1";
export const SOURCE_SCOPE_V2 = "milestone-loop-shadow-scope-policy.v2";
export const PARTITION_TIMEOUT_MS = 65 * 60 * 1000;
export const FOCUSED_TIMEOUT_MS = 20 * 60 * 1000;

export const INVARIANT_COMMAND: FocusedVerificationCommand = {
  id: "test-invariants",
  argv: ["pnpm", "test:invariants"],
  tiers: ["iteration", "candidate", "milestone"],
  expectedArtifactKinds: ["invariant-suite-report"],
};

export const LEGACY_TEST_COMMANDS: readonly FocusedVerificationCommand[] = [
  {
    id: "test-unit-fast",
    argv: ["pnpm", "test:unit:fast"],
    tiers: ["candidate", "milestone"],
    expectedArtifactKinds: ["fast-unit-vitest-report", "unit-partition-report"],
  },
  {
    id: "test-unit-migrations",
    argv: ["pnpm", "test:unit:migrations"],
    tiers: ["milestone"],
    expectedArtifactKinds: [
      "migration-unit-vitest-report",
      "unit-partition-report",
    ],
  },
  {
    id: "test-orchestrator",
    argv: ["pnpm", "test:orchestrator"],
    tiers: ["candidate", "milestone"],
    expectedArtifactKinds: ["orchestrator-vitest-report"],
  },
];

export const PARTITION_COMMANDS: readonly FocusedVerificationCommand[] = [
  "controller-runtime",
  "repository-tooling",
  "adopter-template",
  "trusted-container-fixture",
].map((owner) => ({
  id: `test-partition-${owner}`,
  argv: ["pnpm", `test:partition:${owner}`],
  tiers: ["candidate", "milestone"],
  expectedArtifactKinds: [
    "test-partition-report",
    "test-partition-vitest-report",
    "test-run-summary",
  ],
}));

export const PARTITION_CHECK_IDS = PARTITION_COMMANDS.map(({ id }) => id);
export const ROOT_PARTITION_CHECK_IDS = PARTITION_CHECK_IDS.slice(0, 3);
export const SUBSUMED_TEST_IDS = [
  "test-unit",
  ...LEGACY_TEST_COMMANDS.map(({ id }) => id),
];

export function sourceScheduleGeneration(
  manifest: VerificationCommandManifest,
  policy?: VerificationScopePolicy,
): "v1" | "v2" | null {
  const identity = manifest as VerificationCommandManifest & {
    readonly commissioning?: { readonly id?: string };
    readonly scopePolicyId?: string;
  };
  if (identity.commissioning?.id !== SOURCE_COMMISSIONING_ID) {
    if (policy?.id === SOURCE_SCOPE_V2)
      throw new Error(
        "Source v2 policy requires the commissioned source schedule.",
      );
    return null;
  }
  const generation =
    identity.scopePolicyId === SOURCE_SCOPE_V1
      ? "v1"
      : identity.scopePolicyId === SOURCE_SCOPE_V2
        ? "v2"
        : null;
  if (!generation || (policy && policy.id !== identity.scopePolicyId))
    throw new Error("Unsupported or mixed source schedule generation.");
  const expected = [
    INVARIANT_COMMAND,
    ...(generation === "v1" ? LEGACY_TEST_COMMANDS : PARTITION_COMMANDS),
  ];
  const testCommands = manifest.focusedCommands.filter(({ id }) =>
    id.startsWith("test-"),
  );
  if (
    testCommands.length !== expected.length ||
    expected.some(
      (command) =>
        canonicalJson(
          testCommands.find(({ id }) => id === command.id) ?? null,
        ) !== canonicalJson(command),
    )
  )
    throw new Error(
      "Source schedule test command definitions do not match a complete generation.",
    );
  return generation;
}

export function assertPartitionPrerequisite(
  manifest: VerificationCommandManifest,
  registry: InvariantSuiteRegistry,
): void {
  const invariant = manifest.focusedCommands.find(
    ({ id }) => id === "test-invariants",
  );
  if (canonicalJson(invariant ?? null) !== canonicalJson(INVARIANT_COMMAND))
    throw new Error(
      "Owner partitions require the canonical invariant prerequisite first.",
    );
  const ownership = registry.entries.filter(
    ({ id }) => id === "test-ownership",
  );
  if (
    ownership.length !== 1 ||
    canonicalJson(ownership[0]?.argv ?? null) !==
      canonicalJson([
        "node",
        "node_modules/tsx/dist/cli.mjs",
        "tools/milestone-orchestrator/src/test-ownership-cli.ts",
      ]) ||
    canonicalJson(ownership[0]?.expectedArtifactKinds ?? null) !==
      canonicalJson(["test-ownership-report"]) ||
    registry.serial !== true
  )
    throw new Error(
      "Owner partitions require the production ownership invariant.",
    );
}

export function focusedCommandTimeout(command: {
  readonly id: string;
  readonly argv: readonly string[];
  readonly expectedArtifactKinds: readonly string[];
}): number {
  const canonical = PARTITION_COMMANDS.find(({ id }) => id === command.id);
  if (!canonical) return FOCUSED_TIMEOUT_MS;
  if (
    canonicalJson(command.argv) !== canonicalJson(canonical.argv) ||
    canonicalJson(command.expectedArtifactKinds) !==
      canonicalJson(canonical.expectedArtifactKinds)
  )
    throw new Error(
      "Partition timeout requires the canonical owner command binding.",
    );
  return PARTITION_TIMEOUT_MS;
}

export function recomposeSourceCommands(
  prior: readonly FocusedVerificationCommand[],
): readonly FocusedVerificationCommand[] {
  const retained = prior.filter(({ id }) => !SUBSUMED_TEST_IDS.includes(id));
  const build = retained.findIndex(({ id }) => id === "build");
  if (build < 0) throw new Error("Source schedule is missing build.");
  return [
    ...retained.slice(0, build + 1),
    ...PARTITION_COMMANDS,
    ...retained.slice(build + 1),
  ];
}

export function recomposeSourcePolicy(
  prior: VerificationScopePolicy,
): VerificationScopePolicy {
  if (prior.id !== SOURCE_SCOPE_V1)
    throw new Error("Policy recomposition requires source v1.");
  const replacements: Readonly<Record<string, readonly string[]>> = {
    "test-unit": ROOT_PARTITION_CHECK_IDS,
    "test-unit-fast": ROOT_PARTITION_CHECK_IDS,
    "test-unit-migrations": PARTITION_CHECK_IDS.slice(0, 1),
    "test-orchestrator": [PARTITION_CHECK_IDS[0]!, PARTITION_CHECK_IDS[2]!],
  };
  const rows = (value: Readonly<Record<string, readonly string[]>>) =>
    Object.fromEntries(
      Object.entries(value).map(([key, checks]) => [
        key,
        [...new Set(checks.flatMap((id) => replacements[id] ?? [id]))],
      ]),
    );
  return {
    ...prior,
    id: SOURCE_SCOPE_V2,
    mandatoryChecks: rows(
      prior.mandatoryChecks,
    ) as unknown as VerificationScopePolicy["mandatoryChecks"],
    workspaceChecks: rows(prior.workspaceChecks),
  };
}
