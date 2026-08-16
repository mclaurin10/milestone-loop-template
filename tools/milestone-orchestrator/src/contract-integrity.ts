import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AuthorityAnchorResult } from "./authority-anchor.js";

export const CONTRACT_INTEGRITY_REPORT_SCHEMA_VERSION =
  "contract-integrity-report.v1" as const;

export const CONTRACT_INTEGRITY_OWNER_PATH =
  "tools/milestone-orchestrator/src/contract-integrity.ts" as const;

export const CONTRACT_INTEGRITY_CHECK_IDS = [
  "immutable-contract-lock-hash",
  "immutable-contract-lock-schema",
  "immutable-contract-hashes",
  "manifest-json",
  "required-validation-layers",
  "required-bot-requirements",
  "complete-normative-id-set",
  "threshold-freeze-coverage",
  "seed-and-integrity-gates",
  "authoritative-command",
  "readiness-profile-contract",
  "readiness-aggregation",
  "acceptance-prose-bot-aggregation",
] as const;

export type ContractIntegrityStatus = "PASS" | "FAIL" | "NOT_READY";

export interface ContractIntegrityCheck {
  readonly id: string;
  readonly status: ContractIntegrityStatus;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ContractIntegrityInput {
  readonly repositoryRoot: string;
  readonly validateAuthorityAnchor: (input: {
    readonly repositoryRoot: string;
    readonly baseCommit: string;
  }) => Promise<AuthorityAnchorResult>;
}

interface Threshold {
  readonly freeze?: unknown;
}

interface CompletionMetric {
  readonly id?: unknown;
  readonly thresholds?: readonly Threshold[];
}

interface BotRequirement {
  readonly id?: unknown;
  readonly threshold?: Threshold;
}

interface ValidationLayer {
  readonly id?: unknown;
  readonly required?: unknown;
}

interface SeedSet extends Threshold {
  readonly gateId?: unknown;
  readonly successGateId?: unknown;
  readonly integrityGateId?: unknown;
  readonly valuesInRepository?: unknown;
  readonly requireZeroCatastrophicIntegrityFailures?: unknown;
}

interface AcceptanceManifest {
  readonly validationLayers?: readonly ValidationLayer[];
  readonly botRequirements?: readonly BotRequirement[];
  readonly completionMetrics?: readonly CompletionMetric[];
  readonly operationalChains?: readonly unknown[];
  readonly seedSets?: Readonly<Record<string, SeedSet>> & {
    readonly benchmark?: SeedSet;
    readonly visibleDevelopment?: SeedSet;
    readonly hidden?: SeedSet;
  };
  readonly readinessGate?: {
    readonly id?: unknown;
    readonly requirements?: readonly unknown[];
    readonly aggregation?: unknown;
    readonly compensationBetweenRequirementsAllowed?: unknown;
  };
  readonly humanAcceptanceGate?: {
    readonly id?: unknown;
  };
  readonly plannedCommandSurface?: {
    readonly commands?: readonly {
      readonly id?: unknown;
      readonly plannedCommand?: unknown;
    }[];
    readonly profileContract?: {
      readonly additiveRequirementId?: unknown;
      readonly bootstrapIsAutonomousReadinessEvidence?: unknown;
      readonly requiredDefaultProfileForAutonomousReadiness?: unknown;
      readonly profileOwner?: unknown;
    };
  };
}

function check(
  id: string,
  status: ContractIntegrityStatus,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ContractIntegrityCheck {
  return { id, status, message, ...(details === undefined ? {} : { details }) };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function evaluateContractIntegrity(
  input: ContractIntegrityInput,
): Promise<readonly ContractIntegrityCheck[]> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const acceptanceManifestPath = resolve(
    repositoryRoot,
    "evals",
    "acceptance-manifest.json",
  );
  const activeVerificationManifestPath = resolve(
    repositoryRoot,
    ".agent",
    "verification-manifest.json",
  );
  const checks: ContractIntegrityCheck[] = [];
  let authorityAnchor: AuthorityAnchorResult | undefined;
  try {
    if (!existsSync(activeVerificationManifestPath))
      throw new Error(
        ".agent/verification-manifest.json is missing; authority has not been commissioned.",
      );
    const activeManifest = (await readJson(activeVerificationManifestPath)) as {
      readonly schemaVersion?: unknown;
      readonly commissioning?: { readonly baseCommit?: unknown };
    };
    const baseCommit = activeManifest?.commissioning?.baseCommit;
    if (
      activeManifest?.schemaVersion !== "verification-manifest.v2" ||
      typeof baseCommit !== "string" ||
      !/^[a-f0-9]{40}$/.test(baseCommit)
    )
      throw new Error(
        "Active verification manifest does not name a valid commissioned authority base.",
      );
    authorityAnchor = await input.validateAuthorityAnchor({
      repositoryRoot,
      baseCommit,
    });
    checks.push(
      check(
        "immutable-contract-lock-hash",
        "PASS",
        "Immutable contract lock exactly matches the commissioned strict-ancestor authority base.",
        {
          baseCommit: authorityAnchor.baseCommit,
          sha256: authorityAnchor.immutableContractLockSha256,
          bytes: authorityAnchor.immutableContractLockBytes,
        },
      ),
      check(
        "immutable-contract-lock-schema",
        "PASS",
        "Immutable contract lock has the required schema, lifecycle, and complete authority-file set.",
      ),
      check(
        "immutable-contract-hashes",
        "PASS",
        "Frozen authority bytes match both their lock hashes and commissioned Git-base bytes.",
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "immutable-contract-lock-hash",
        "FAIL",
        `Immutable authority anchor validation failed: ${errorMessage(error)}`,
      ),
    );
  }

  if (!existsSync(acceptanceManifestPath)) {
    return [
      ...checks,
      check(
        "manifest-present",
        "NOT_READY",
        "evals/acceptance-manifest.json is missing.",
      ),
    ];
  }

  let manifest: AcceptanceManifest;
  try {
    manifest = (await readJson(acceptanceManifestPath)) as AcceptanceManifest;
    checks.push(
      check("manifest-json", "PASS", "Acceptance manifest is valid JSON."),
    );
  } catch (error) {
    return [
      check(
        "manifest-json",
        "FAIL",
        `Acceptance manifest cannot be parsed: ${errorMessage(error)}`,
      ),
    ];
  }

  let baselineManifest = manifest;
  let baselineAcceptanceText: string | undefined;
  if (authorityAnchor) {
    const baselineManifestFile = authorityAnchor.authorityFiles.find(
      (file) => file.path === "evals/acceptance-manifest.json",
    );
    const baselineAcceptanceFile = authorityAnchor.authorityFiles.find(
      (file) => file.path === "evals/ACCEPTANCE.md",
    );
    try {
      if (!baselineManifestFile || !baselineAcceptanceFile)
        throw new Error(
          "Commissioned authority anchor omitted acceptance data.",
        );
      baselineManifest = JSON.parse(
        baselineManifestFile.baseContents.toString("utf8"),
      ) as AcceptanceManifest;
      baselineAcceptanceText =
        baselineAcceptanceFile.baseContents.toString("utf8");
    } catch (error) {
      checks.push(
        check(
          "commissioned-acceptance-data",
          "FAIL",
          `Commissioned acceptance data cannot be parsed: ${errorMessage(error)}`,
        ),
      );
    }
  }

  const requiredLayers = Array.isArray(manifest.validationLayers)
    ? manifest.validationLayers.filter((layer) => layer.required)
    : [];
  const layerIdList = requiredLayers.map((layer) => layer.id);
  const layerIds = new Set(layerIdList);
  const expectedLayerIds = Array.isArray(baselineManifest.validationLayers)
    ? baselineManifest.validationLayers
        .filter((layer) => layer.required)
        .map((layer) => layer.id)
    : [];
  const exactLayerSet =
    layerIdList.length === expectedLayerIds.length &&
    layerIds.size === expectedLayerIds.length &&
    expectedLayerIds.every((id) => layerIds.has(id));
  checks.push(
    check(
      "required-validation-layers",
      exactLayerSet ? "PASS" : "FAIL",
      exactLayerSet
        ? "The commissioned authority-base validation-layer IDs are present, unique, and required."
        : "The commissioned authority-base validation-layer set was changed, duplicated, or made non-required.",
    ),
  );

  const expectedBotIds = Array.isArray(baselineManifest.botRequirements)
    ? baselineManifest.botRequirements.map((requirement) => requirement.id)
    : [];
  const botIds = Array.isArray(manifest.botRequirements)
    ? manifest.botRequirements.map((requirement) => requirement.id)
    : [];
  const exactBotSet =
    botIds.length === expectedBotIds.length &&
    expectedBotIds.every((id) => botIds.includes(id));
  checks.push(
    check(
      "required-bot-requirements",
      exactBotSet ? "PASS" : "FAIL",
      exactBotSet
        ? "All commissioned authority-base bot requirements are present."
        : "The commissioned authority-base bot requirement set was changed.",
    ),
  );

  const completionMetrics = Array.isArray(manifest.completionMetrics)
    ? manifest.completionMetrics
    : [];
  const operationalChains = Array.isArray(manifest.operationalChains)
    ? manifest.operationalChains
    : [];
  const normativeIds = [
    ...completionMetrics.map((metric) => metric.id),
    ...botIds,
    ...operationalChains,
    ...[...layerIds],
    manifest.seedSets?.benchmark?.gateId,
    manifest.seedSets?.visibleDevelopment?.gateId,
    manifest.seedSets?.hidden?.successGateId,
    manifest.seedSets?.hidden?.integrityGateId,
    manifest.readinessGate?.id,
    manifest.humanAcceptanceGate?.id,
  ];
  const baselineCompletionMetrics = Array.isArray(
    baselineManifest.completionMetrics,
  )
    ? baselineManifest.completionMetrics
    : [];
  const baselineOperationalChains = Array.isArray(
    baselineManifest.operationalChains,
  )
    ? baselineManifest.operationalChains
    : [];
  const expectedNormativeIds = [
    ...baselineCompletionMetrics.map((metric) => metric.id),
    ...expectedBotIds,
    ...baselineOperationalChains,
    ...expectedLayerIds,
    baselineManifest.seedSets?.benchmark?.gateId,
    baselineManifest.seedSets?.visibleDevelopment?.gateId,
    baselineManifest.seedSets?.hidden?.successGateId,
    baselineManifest.seedSets?.hidden?.integrityGateId,
    baselineManifest.readinessGate?.id,
    baselineManifest.humanAcceptanceGate?.id,
  ];
  const normativeIdsAreComplete =
    completionMetrics.length === baselineCompletionMetrics.length &&
    operationalChains.length === baselineOperationalChains.length &&
    normativeIds.length === expectedNormativeIds.length &&
    normativeIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(normativeIds).size === normativeIds.length &&
    expectedNormativeIds.every((id) => normativeIds.includes(id));
  checks.push(
    check(
      "complete-normative-id-set",
      normativeIdsAreComplete ? "PASS" : "FAIL",
      normativeIdsAreComplete
        ? `Manifest retains the commissioned authority-base requirement counts and ${normativeIds.length} unique normative IDs.`
        : "Manifest requirement counts or unique normative IDs no longer match the commissioned authority base.",
    ),
  );

  const thresholds = [
    ...completionMetrics.flatMap((metric) =>
      Array.isArray(metric.thresholds) ? metric.thresholds : [],
    ),
    ...(Array.isArray(manifest.botRequirements)
      ? manifest.botRequirements.map((requirement) => requirement.threshold)
      : []),
    ...Object.values(manifest.seedSets ?? {})
      .filter((seedSet) => seedSet?.freeze)
      .map((seedSet) => ({ freeze: seedSet.freeze })),
  ];
  const baselineThresholds = [
    ...baselineCompletionMetrics.flatMap((metric) =>
      Array.isArray(metric.thresholds) ? metric.thresholds : [],
    ),
    ...(Array.isArray(baselineManifest.botRequirements)
      ? baselineManifest.botRequirements.map(
          (requirement) => requirement.threshold,
        )
      : []),
    ...Object.values(baselineManifest.seedSets ?? {})
      .filter((seedSet) => seedSet?.freeze)
      .map((seedSet) => ({ freeze: seedSet.freeze })),
  ];
  const thresholdClassesValid =
    thresholds.length === baselineThresholds.length &&
    thresholds.every(
      (threshold, index) =>
        threshold?.freeze === baselineThresholds[index]?.freeze &&
        ["IMMUTABLE", "CAL-1_PROVISIONAL"].includes(
          (threshold as Threshold).freeze as string,
        ),
    );
  checks.push(
    check(
      "threshold-freeze-coverage",
      thresholdClassesValid ? "PASS" : "FAIL",
      thresholdClassesValid
        ? `All ${thresholds.length} authority-base threshold objects retain their commissioned freeze classes.`
        : "Threshold count or freeze-class coverage differs from the commissioned authority base.",
    ),
  );

  const seedRulesValid =
    JSON.stringify(manifest.seedSets) ===
      JSON.stringify(baselineManifest.seedSets) &&
    manifest.seedSets?.hidden?.valuesInRepository === false &&
    manifest.seedSets?.benchmark?.requireZeroCatastrophicIntegrityFailures ===
      true &&
    manifest.seedSets?.visibleDevelopment
      ?.requireZeroCatastrophicIntegrityFailures === true &&
    manifest.seedSets?.hidden?.requireZeroCatastrophicIntegrityFailures ===
      true;
  checks.push(
    check(
      "seed-and-integrity-gates",
      seedRulesValid ? "PASS" : "FAIL",
      seedRulesValid
        ? "Benchmark, visible, hidden, custody, and zero-catastrophic-integrity seed rules match the commissioned authority base."
        : "A commissioned benchmark, visible, hidden, custody, or integrity seed rule changed.",
    ),
  );

  const plannedVerify = manifest.plannedCommandSurface?.commands?.find(
    (command) => command.id === "verify_full",
  );
  checks.push(
    check(
      "authoritative-command",
      plannedVerify?.plannedCommand === "pnpm verify" ? "PASS" : "FAIL",
      plannedVerify?.plannedCommand === "pnpm verify"
        ? "Manifest authoritative command is pnpm verify."
        : "Manifest must retain pnpm verify as verify_full.",
    ),
  );

  const profileContract = manifest.plannedCommandSurface?.profileContract;
  checks.push(
    check(
      "readiness-profile-contract",
      profileContract?.additiveRequirementId === "HARNESS-PROFILE-01" &&
        profileContract?.bootstrapIsAutonomousReadinessEvidence === false &&
        profileContract?.requiredDefaultProfileForAutonomousReadiness ===
          "readiness" &&
        profileContract?.profileOwner ===
          "package.json#milestoneLoop.verification.defaultProfile"
        ? "PASS"
        : "FAIL",
      "The manifest must reject bootstrap as readiness evidence and require the package-default readiness profile.",
    ),
  );

  const readiness = manifest.readinessGate;
  const readinessRequirements = new Set(readiness?.requirements ?? []);
  checks.push(
    check(
      "readiness-aggregation",
      readiness?.id === "AUTONOMOUS-READINESS-01" &&
        readiness?.aggregation === "all" &&
        readinessRequirements.has("all_bot_requirements_pass") &&
        readiness?.compensationBetweenRequirementsAllowed === false
        ? "PASS"
        : "FAIL",
      "Readiness must remain all-requirements, non-compensating AUTONOMOUS-READINESS-01.",
    ),
  );

  try {
    const acceptanceText = await readFile(
      resolve(repositoryRoot, "evals", "ACCEPTANCE.md"),
      "utf8",
    );
    const acceptanceProseMatchesBase =
      typeof baselineAcceptanceText === "string" &&
      acceptanceText === baselineAcceptanceText;
    checks.push(
      check(
        "acceptance-prose-bot-aggregation",
        acceptanceProseMatchesBase ? "PASS" : "FAIL",
        acceptanceProseMatchesBase
          ? "Acceptance prose exactly matches the commissioned authority-base bytes."
          : "Acceptance prose differs from the commissioned authority-base contract.",
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "acceptance-prose-readable",
        "FAIL",
        `Acceptance prose cannot be read: ${errorMessage(error)}`,
      ),
    );
  }

  return checks;
}
