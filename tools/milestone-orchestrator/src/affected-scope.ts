import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import {
  SCOPE_TRIGGER_CLASSES,
  type ScopeTriggerClass,
  type VerificationManifest,
  type VerificationScopePolicy,
  type VerificationTier,
} from "./contracts.js";
import {
  canonicalJson,
  reverseDependentPackageNames,
  workspaceOwnerForPath,
  type PackageGraphSnapshot,
} from "./package-graph.js";

export const SCOPE_SELECTION_SCHEMA_VERSION = "1.0.0" as const;

export interface ScopeCheckDefinition {
  readonly id: string;
  readonly argv: readonly string[];
  readonly tiers: readonly VerificationTier[];
  readonly expectedArtifactKinds: readonly string[];
}

export interface ScopeCheckCatalogue {
  readonly schemaVersion: "1.0.0";
  readonly entries: readonly ScopeCheckDefinition[];
  readonly sha256: string;
}

export type ChangedPathSource =
  | {
      readonly kind: "git-range-and-working-tree";
      readonly baseCommit: string;
      readonly headCommit: string;
    }
  | { readonly kind: "fixture"; readonly fixtureId: string }
  | { readonly kind: "proposal"; readonly milestoneId: string };

export interface ScopeCandidateIdentity {
  readonly baseCommit: string;
  readonly gitCommit: string;
  readonly gitTree: string;
  readonly workingTreeDirty: boolean;
}

export interface ScopePathClassification {
  readonly path: string;
  readonly triggerClasses: readonly ScopeTriggerClass[];
  readonly workspacePackage: string | null;
  readonly reverseDependentPackages: readonly string[];
}

interface ScopeSelectionCommon {
  readonly schemaVersion: typeof SCOPE_SELECTION_SCHEMA_VERSION;
  readonly mode: "shadow-only";
  readonly authoritative: false;
  readonly closureSuppressionAllowed: false;
  readonly graduationDeferred: true;
  readonly scopeDisposition: "shadow-recommendation" | "governance-required";
  readonly changedPathSource: ChangedPathSource;
  readonly changedPaths: readonly string[];
  readonly candidate: ScopeCandidateIdentity;
  readonly policyId: string;
  readonly policySha256: string;
  readonly checkCatalogueSha256: string;
  readonly packageGraph: PackageGraphSnapshot;
  readonly classifications: readonly ScopePathClassification[];
  readonly matchedTriggerClasses: readonly ScopeTriggerClass[];
  readonly unknownPaths: readonly string[];
  readonly recommendedCheckIds: readonly string[];
  readonly fullClosureCheckIds: readonly string[];
}

export type AffectedScopeRecommendation = ScopeSelectionCommon;

export interface ScopeSelectionResult extends ScopeSelectionCommon {
  readonly actualCheckIds: readonly string[];
  readonly omittedFromRecommendationActualCheckIds: readonly string[];
  readonly recommendedOnlyCheckIds: readonly string[];
  readonly failingActualCheckIds: readonly string[];
  readonly falseNegativeCheckIds: readonly string[];
}

const AUXILIARY_CHECKS: readonly ScopeCheckDefinition[] = [
  {
    id: "dependencies",
    argv: ["pnpm", "verify:dependencies"],
    tiers: [],
    expectedArtifactKinds: ["dependency-report"],
  },
  {
    id: "test-unit",
    argv: ["pnpm", "test:unit"],
    tiers: [],
    expectedArtifactKinds: ["vitest-report"],
  },
  {
    id: "exact-readiness",
    argv: ["pnpm", "verify"],
    tiers: ["milestone", "periodic"],
    expectedArtifactKinds: [],
  },
];

const CHECK_ORDER_PREFIX = [
  "test-invariants",
  "dependencies",
  "format-check",
  "lint",
  "lint-architecture",
  "typecheck",
  "build",
  "test-unit",
  "test-unit-fast",
  "test-unit-migrations",
  "test-orchestrator",
] as const;

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function normalizeChangedPath(path: string): string {
  const normalized = slash(path);
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    isAbsolute(normalized) ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    normalized.split("/").includes("")
  )
    throw new Error(`Affected-scope path is unsafe: ${path}.`);
  return normalized;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0) &&
    new Set(value).size === value.length
  );
}

function commit(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function sha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function buildScopeCheckCatalogue(
  manifest: VerificationManifest,
): ScopeCheckCatalogue {
  const byId = new Map<string, ScopeCheckDefinition>();
  for (const command of [...manifest.focusedCommands, ...AUXILIARY_CHECKS]) {
    if (byId.has(command.id))
      throw new Error(`Scope check catalogue repeats ${command.id}.`);
    byId.set(command.id, {
      id: command.id,
      argv: [...command.argv],
      tiers: [...command.tiers],
      expectedArtifactKinds: [...command.expectedArtifactKinds],
    });
  }
  const entries = [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const unsigned = { schemaVersion: "1.0.0" as const, entries };
  return { ...unsigned, sha256: hashCanonical(unsigned) };
}

export function orderScopeCheckIds(
  ids: Iterable<string>,
  catalogue: ScopeCheckCatalogue,
): readonly string[] {
  const selected = new Set(ids);
  const manifestOrder = catalogue.entries
    .map((entry) => entry.id)
    .filter((id) => id !== "exact-readiness");
  const order = [...CHECK_ORDER_PREFIX, ...manifestOrder, "exact-readiness"];
  const result = [...new Set(order)].filter((id) => selected.has(id));
  const unknown = [...selected].filter(
    (id) => !catalogue.entries.some((entry) => entry.id === id),
  );
  if (unknown.length > 0)
    throw new Error(
      `Affected-scope policy references unknown check IDs: ${unknown.sort().join(", ")}.`,
    );
  return result;
}

export function classifyAffectedPath(
  path: string,
  protectedPaths: readonly string[],
): readonly ScopeTriggerClass[] {
  const normalized = normalizeChangedPath(path);
  const classes = new Set<ScopeTriggerClass>();
  if (
    protectedPaths.some(
      (protectedPath) =>
        normalized === slash(protectedPath) ||
        normalized.startsWith(`${slash(protectedPath)}/`),
    )
  )
    classes.add("protected-authority");
  if (normalized.startsWith("packages/foundation/"))
    classes.add("canonical-encoding");
  if (normalized.startsWith("packages/protocol/"))
    classes.add("shared-protocol");
  if (normalized.startsWith("packages/persistence/"))
    classes.add("persistence-codec");
  if (
    (normalized.startsWith("packages/persistence/") ||
      normalized.startsWith("tests/fixtures/")) &&
    /(?:^|[/_.-])migrat(?:e|ion|ions|ed|ing)?(?:[/_.-]|$)/i.test(normalized)
  )
    classes.add("migration");
  if (
    normalized.startsWith("tests/fixtures/") ||
    (normalized.startsWith("packages/persistence/") &&
      /(?:^|[/_.-])fixtures?(?:[/_.-]|$)/i.test(normalized))
  )
    classes.add("accepted-fixture");
  if (
    (normalized.startsWith("packages/") ||
      normalized.startsWith("apps/headless/")) &&
    /(?:^|[/_.-])standard(?:[/_.-]|$)/i.test(normalized)
  )
    classes.add("standard-state");
  if (
    [
      "packages/simulation/src/authorization.ts",
      "apps/headless/src/authorization.ts",
      "apps/web/src/worker/simulation.worker.ts",
    ].includes(normalized)
  )
    classes.add("composition-root");
  if (normalized.includes("/worker/") || normalized.includes("worker."))
    classes.add("worker-message");
  if (
    normalized === "package.json" ||
    normalized === "pnpm-lock.yaml" ||
    normalized === "pnpm-workspace.yaml" ||
    normalized.startsWith("tsconfig") ||
    normalized.endsWith("/package.json")
  )
    classes.add("package-graph");
  if (
    /(?:^|\/)(?:playwright|vite)(?:\.|\/)/i.test(normalized) ||
    normalized === "playwright.config.ts" ||
    normalized === "tools/browser-verifier-lease.mjs" ||
    /^tools\/verify-(?:authorization|calendar|development|finance|standard-utility-construction|standard-utility-entitlement|utility-entitlement|utility-planning|valley|bootstrap-browser)\.mjs$/.test(
      normalized,
    )
  )
    classes.add("browser-host");
  if (
    normalized.startsWith("packages/ui/") ||
    normalized.startsWith("packages/renderer/") ||
    (normalized.startsWith("apps/web/") && !normalized.includes("/worker/"))
  )
    classes.add("ui-renderer");
  if (normalized.startsWith("packages/simulation/"))
    classes.add("domain-local-simulation");
  if (
    normalized.startsWith("tools/") ||
    normalized.startsWith(".agent/") ||
    normalized === "vitest.config.ts" ||
    normalized === "eslint.config.mjs"
  )
    classes.add("orchestrator-evidence");
  if (
    /(?:^|\/)(?:README|AGENTS|SKI_TYCOON_GOAL)\.md$/i.test(normalized) ||
    normalized.startsWith("docs/") ||
    normalized.endsWith(".md")
  )
    classes.add("documentation-only");
  if (classes.size === 0) classes.add("unknown");
  return [...classes].sort();
}

function validatePolicyAndGraph(
  policy: VerificationScopePolicy,
  catalogue: ScopeCheckCatalogue,
  graph: PackageGraphSnapshot,
): void {
  if (
    policy.triggerClasses.length !== SCOPE_TRIGGER_CLASSES.length ||
    policy.triggerClasses.some(
      (entry, index) => entry !== SCOPE_TRIGGER_CLASSES[index],
    )
  )
    throw new Error("Affected-scope policy trigger classes are not exact.");
  for (const trigger of SCOPE_TRIGGER_CLASSES)
    orderScopeCheckIds(policy.mandatoryChecks[trigger], catalogue);
  const packageNames = graph.packages.map((entry) => entry.name).sort();
  const mappedNames = Object.keys(policy.workspaceChecks).sort();
  if (
    packageNames.length !== mappedNames.length ||
    packageNames.some((name, index) => name !== mappedNames[index])
  )
    throw new Error(
      "Affected-scope workspace check mapping does not match the runtime package graph.",
    );
  for (const checks of Object.values(policy.workspaceChecks))
    orderScopeCheckIds(checks, catalogue);
}

export function recommendAffectedScope(input: {
  readonly changedPaths: readonly string[];
  readonly changedPathSource: ChangedPathSource;
  readonly candidate: ScopeCandidateIdentity;
  readonly manifest: VerificationManifest;
  readonly policy: VerificationScopePolicy;
  readonly policySha256: string;
  readonly packageGraph: PackageGraphSnapshot;
}): AffectedScopeRecommendation {
  if (!sha(input.policySha256))
    throw new Error("Affected-scope policy hash is malformed.");
  const catalogue = buildScopeCheckCatalogue(input.manifest);
  validatePolicyAndGraph(input.policy, catalogue, input.packageGraph);
  const changedPaths = [
    ...new Set(input.changedPaths.map(normalizeChangedPath)),
  ].sort();
  const classifications: ScopePathClassification[] = changedPaths.map(
    (path) => {
      const triggerClasses = classifyAffectedPath(
        path,
        input.manifest.requiredProtectedPaths,
      );
      const owner = workspaceOwnerForPath(input.packageGraph, path);
      const reverseDependentPackages =
        owner && triggerClasses.includes("shared-protocol")
          ? reverseDependentPackageNames(input.packageGraph, owner.name)
          : [];
      return {
        path,
        triggerClasses,
        workspacePackage: owner?.name ?? null,
        reverseDependentPackages,
      };
    },
  );
  const matchedTriggerClasses = [
    ...new Set(classifications.flatMap((entry) => entry.triggerClasses)),
  ].sort();
  const unknownPaths = classifications
    .filter((entry) => entry.triggerClasses.includes("unknown"))
    .map((entry) => entry.path);
  if (
    input.changedPathSource.kind === "proposal" &&
    matchedTriggerClasses.includes("protected-authority")
  )
    throw new Error(
      "Ordinary proposal scope cannot change protected authority; explicit governance handling is required.",
    );
  const recommended = new Set<string>(["test-invariants"]);
  for (const trigger of matchedTriggerClasses)
    for (const check of input.policy.mandatoryChecks[trigger])
      recommended.add(check);
  for (const classification of classifications) {
    if (!classification.triggerClasses.includes("shared-protocol")) continue;
    const packages = [
      ...(classification.workspacePackage
        ? [classification.workspacePackage]
        : []),
      ...classification.reverseDependentPackages,
    ];
    for (const packageName of packages)
      for (const check of input.policy.workspaceChecks[packageName] ?? [])
        recommended.add(check);
  }
  if (
    matchedTriggerClasses.some((trigger) =>
      input.policy.broadTriggerClasses.includes(trigger),
    )
  ) {
    for (const entry of catalogue.entries)
      if (entry.tiers.includes("candidate")) recommended.add(entry.id);
    recommended.add("test-unit");
  }
  const fullClosureCheckIds = orderScopeCheckIds(
    [
      ...input.manifest.focusedCommands
        .filter((command) => command.tiers.includes("milestone"))
        .map((command) => command.id),
      "exact-readiness",
    ],
    catalogue,
  );
  return {
    schemaVersion: SCOPE_SELECTION_SCHEMA_VERSION,
    mode: "shadow-only",
    authoritative: false,
    closureSuppressionAllowed: false,
    graduationDeferred: true,
    scopeDisposition: matchedTriggerClasses.includes("protected-authority")
      ? "governance-required"
      : "shadow-recommendation",
    changedPathSource: input.changedPathSource,
    changedPaths,
    candidate: {
      baseCommit: input.candidate.baseCommit,
      gitCommit: input.candidate.gitCommit,
      gitTree: input.candidate.gitTree,
      workingTreeDirty: input.candidate.workingTreeDirty,
    },
    policyId: input.policy.id,
    policySha256: input.policySha256,
    checkCatalogueSha256: catalogue.sha256,
    packageGraph: input.packageGraph,
    classifications,
    matchedTriggerClasses,
    unknownPaths,
    recommendedCheckIds: orderScopeCheckIds(recommended, catalogue),
    fullClosureCheckIds,
  };
}

export function finalizeScopeSelection(
  recommendation: AffectedScopeRecommendation,
  input: {
    readonly actualCheckIds: readonly string[];
    readonly failingActualCheckIds: readonly string[];
    readonly mandatoryExpectedCheckIds?: readonly string[];
  },
): ScopeSelectionResult {
  const actualCheckIds = [...new Set(input.actualCheckIds)];
  const failingActualCheckIds = [...new Set(input.failingActualCheckIds)];
  if (failingActualCheckIds.some((id) => !actualCheckIds.includes(id)))
    throw new Error(
      "Affected-scope failing checks must be a subset of actual checks.",
    );
  const omitted = actualCheckIds.filter(
    (id) => !recommendation.recommendedCheckIds.includes(id),
  );
  const recommendedOnly = recommendation.recommendedCheckIds.filter(
    (id) => !actualCheckIds.includes(id),
  );
  const falseNegatives = new Set(
    failingActualCheckIds.filter((id) => omitted.includes(id)),
  );
  for (const expected of input.mandatoryExpectedCheckIds ?? [])
    if (!recommendation.recommendedCheckIds.includes(expected))
      falseNegatives.add(expected);
  return {
    ...recommendation,
    actualCheckIds,
    omittedFromRecommendationActualCheckIds: omitted,
    recommendedOnlyCheckIds: recommendedOnly,
    failingActualCheckIds,
    falseNegativeCheckIds: [...falseNegatives].sort(),
  };
}

export function scopeSelectionBytes(
  selection: AffectedScopeRecommendation | ScopeSelectionResult,
): string {
  return `${canonicalJson(selection)}\n`;
}

export function validateScopeSelection(value: unknown): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  const input = record(value);
  const keys = [
    "schemaVersion",
    "mode",
    "authoritative",
    "closureSuppressionAllowed",
    "graduationDeferred",
    "scopeDisposition",
    "changedPathSource",
    "changedPaths",
    "candidate",
    "policyId",
    "policySha256",
    "checkCatalogueSha256",
    "packageGraph",
    "classifications",
    "matchedTriggerClasses",
    "unknownPaths",
    "recommendedCheckIds",
    "fullClosureCheckIds",
    "actualCheckIds",
    "omittedFromRecommendationActualCheckIds",
    "recommendedOnlyCheckIds",
    "failingActualCheckIds",
    "falseNegativeCheckIds",
  ] as const;
  if (!input || !exactKeys(input, keys))
    return { valid: false, errors: ["Scope selection keys are not strict."] };
  if (
    input["schemaVersion"] !== SCOPE_SELECTION_SCHEMA_VERSION ||
    input["mode"] !== "shadow-only" ||
    input["authoritative"] !== false ||
    input["closureSuppressionAllowed"] !== false ||
    input["graduationDeferred"] !== true ||
    !["shadow-recommendation", "governance-required"].includes(
      String(input["scopeDisposition"]),
    ) ||
    typeof input["policyId"] !== "string" ||
    !input["policyId"] ||
    !sha(input["policySha256"]) ||
    !sha(input["checkCatalogueSha256"])
  )
    errors.push("Scope selection authority or identity header is malformed.");
  const source = record(input["changedPathSource"]);
  const sourceKind = source?.["kind"];
  const validSource =
    sourceKind === "git-range-and-working-tree"
      ? Boolean(
          source &&
          exactKeys(source, ["kind", "baseCommit", "headCommit"]) &&
          commit(source["baseCommit"]) &&
          commit(source["headCommit"]),
        )
      : sourceKind === "fixture"
        ? Boolean(
            source &&
            exactKeys(source, ["kind", "fixtureId"]) &&
            typeof source["fixtureId"] === "string" &&
            source["fixtureId"].length > 0,
          )
        : sourceKind === "proposal"
          ? Boolean(
              source &&
              exactKeys(source, ["kind", "milestoneId"]) &&
              typeof source["milestoneId"] === "string" &&
              source["milestoneId"].length > 0,
            )
          : false;
  if (!validSource)
    errors.push("Scope selection changed-path source is malformed.");
  const candidate = record(input["candidate"]);
  if (
    !candidate ||
    !exactKeys(candidate, [
      "baseCommit",
      "gitCommit",
      "gitTree",
      "workingTreeDirty",
    ]) ||
    !commit(candidate["baseCommit"]) ||
    !commit(candidate["gitCommit"]) ||
    !commit(candidate["gitTree"]) ||
    typeof candidate["workingTreeDirty"] !== "boolean"
  )
    errors.push("Scope selection candidate is malformed.");
  const arrayKeys = [
    "changedPaths",
    "matchedTriggerClasses",
    "unknownPaths",
    "recommendedCheckIds",
    "fullClosureCheckIds",
    "actualCheckIds",
    "omittedFromRecommendationActualCheckIds",
    "recommendedOnlyCheckIds",
    "failingActualCheckIds",
    "falseNegativeCheckIds",
  ] as const;
  if (arrayKeys.some((key) => !stringArray(input[key])))
    errors.push("Scope selection set fields are malformed.");
  const changedPaths = stringArray(input["changedPaths"])
    ? input["changedPaths"]
    : [];
  try {
    if (
      changedPaths.some((path) => normalizeChangedPath(path) !== path) ||
      canonicalJson(changedPaths) !== canonicalJson([...changedPaths].sort())
    )
      errors.push("Scope selection changed paths are not canonical.");
  } catch {
    errors.push("Scope selection changed paths are unsafe.");
  }
  const actual = stringArray(input["actualCheckIds"])
    ? input["actualCheckIds"]
    : [];
  const recommended = stringArray(input["recommendedCheckIds"])
    ? input["recommendedCheckIds"]
    : [];
  const expectedOmitted = actual.filter((id) => !recommended.includes(id));
  const expectedRecommendedOnly = recommended.filter(
    (id) => !actual.includes(id),
  );
  if (
    canonicalJson(input["omittedFromRecommendationActualCheckIds"]) !==
      canonicalJson(expectedOmitted) ||
    canonicalJson(input["recommendedOnlyCheckIds"]) !==
      canonicalJson(expectedRecommendedOnly)
  )
    errors.push("Scope selection comparison sets are inconsistent.");
  if (
    stringArray(input["failingActualCheckIds"]) &&
    input["failingActualCheckIds"].some((id) => !actual.includes(id))
  )
    errors.push("Scope selection failing checks are not actual checks.");
  const graph = record(input["packageGraph"]);
  if (
    !graph ||
    !exactKeys(graph, [
      "schemaVersion",
      "workspaceManifest",
      "packages",
      "edges",
      "sha256",
    ]) ||
    graph["schemaVersion"] !== "1.0.0" ||
    !Array.isArray(graph["packages"]) ||
    !Array.isArray(graph["edges"]) ||
    !sha(graph["sha256"])
  )
    errors.push("Scope selection package graph is malformed.");
  else {
    const { sha256: declared, ...unsigned } = graph;
    if (declared !== hashCanonical(unsigned))
      errors.push("Scope selection package graph hash is invalid.");
  }
  const classifications = input["classifications"];
  if (!Array.isArray(classifications))
    errors.push("Scope selection classifications are malformed.");
  else {
    const classifiedPaths: string[] = [];
    const matched = new Set<string>();
    const unknown: string[] = [];
    for (const value of classifications) {
      const classification = record(value);
      if (
        !classification ||
        !exactKeys(classification, [
          "path",
          "triggerClasses",
          "workspacePackage",
          "reverseDependentPackages",
        ]) ||
        typeof classification["path"] !== "string" ||
        !stringArray(classification["triggerClasses"]) ||
        classification["triggerClasses"].length === 0 ||
        classification["triggerClasses"].some(
          (trigger) => !SCOPE_TRIGGER_CLASSES.includes(trigger as never),
        ) ||
        (classification["workspacePackage"] !== null &&
          (typeof classification["workspacePackage"] !== "string" ||
            classification["workspacePackage"].length === 0)) ||
        !stringArray(classification["reverseDependentPackages"])
      ) {
        errors.push("Scope selection contains a malformed classification.");
        continue;
      }
      classifiedPaths.push(classification["path"]);
      for (const trigger of classification["triggerClasses"])
        matched.add(trigger);
      if (classification["triggerClasses"].includes("unknown"))
        unknown.push(classification["path"]);
    }
    if (canonicalJson(classifiedPaths) !== canonicalJson(changedPaths))
      errors.push("Scope selection classification paths do not match changes.");
    if (
      canonicalJson(input["matchedTriggerClasses"]) !==
      canonicalJson([...matched].sort())
    )
      errors.push("Scope selection matched trigger set is inconsistent.");
    if (canonicalJson(input["unknownPaths"]) !== canonicalJson(unknown))
      errors.push("Scope selection unknown path set is inconsistent.");
    const governanceRequired = matched.has("protected-authority");
    if (
      input["scopeDisposition"] !==
      (governanceRequired ? "governance-required" : "shadow-recommendation")
    )
      errors.push("Scope selection governance disposition is inconsistent.");
  }
  if (
    stringArray(input["failingActualCheckIds"]) &&
    stringArray(input["falseNegativeCheckIds"])
  ) {
    const failingActualCheckIds = input["failingActualCheckIds"];
    const falseNegativeCheckIds = input["falseNegativeCheckIds"];
    const requiredFalseNegatives = failingActualCheckIds.filter((id) =>
      expectedOmitted.includes(id),
    );
    if (
      requiredFalseNegatives.some((id) => !falseNegativeCheckIds.includes(id))
    )
      errors.push("Scope selection omits a measured false negative.");
  }
  if (
    stringArray(input["fullClosureCheckIds"]) &&
    !input["fullClosureCheckIds"].includes("exact-readiness")
  )
    errors.push("Scope selection full closure omits exact readiness.");
  return { valid: errors.length === 0, errors };
}

export function assertScopeSelection(
  value: unknown,
): asserts value is ScopeSelectionResult {
  const validation = validateScopeSelection(value);
  if (!validation.valid)
    throw new Error(`Invalid scope selection: ${validation.errors.join(" ")}`);
}
