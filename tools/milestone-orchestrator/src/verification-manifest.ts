import {
  GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
  REQUIRED_PROTECTED_PATHS,
  VERIFICATION_MANIFEST_SCHEMA_VERSION,
  type LegacyVerificationManifest,
  type VerificationManifest,
  type VerificationProfile,
} from "./contracts.js";
import { assertVerificationManifest } from "./schema.js";

export function resolveVerificationManifestProfile(
  manifest: VerificationManifest,
  packageDefaultProfile: VerificationProfile,
): VerificationProfile {
  if (manifest.commissioning.profile !== packageDefaultProfile)
    throw new Error(
      `Verification manifest profile ${manifest.commissioning.profile} does not match package-default profile ${packageDefaultProfile}.`,
    );
  return packageDefaultProfile;
}

export function assertVerificationManifestRegistryIdentities(
  manifest: VerificationManifest,
  invariantSuiteId: string,
  scopePolicyId: string,
): void {
  if (manifest.requiredInvariantSuiteId !== invariantSuiteId)
    throw new Error(
      "Verification manifest references a different invariant suite.",
    );
  if (manifest.scopePolicyId !== scopePolicyId)
    throw new Error(
      "Verification manifest references a different scope policy.",
    );
}

export function assertVerificationManifestTargetBranch(
  manifest: VerificationManifest,
  configuredTargetBranch: string,
): void {
  if (manifest.commissioning.targetBranch !== configuredTargetBranch)
    throw new Error(
      `Verification manifest target branch ${manifest.commissioning.targetBranch} does not match configured target branch ${configuredTargetBranch}.`,
    );
}

export function adaptHistoricalVerificationManifest(input: {
  readonly manifest: LegacyVerificationManifest;
  readonly targetBranch: string;
  readonly invariantSuiteId: string;
  readonly scopePolicyId: string;
  readonly historicalRecordCommittedAt: string;
}): VerificationManifest {
  const requiredProtectedPaths = [...input.manifest.requiredProtectedPaths];
  for (const requiredPath of REQUIRED_PROTECTED_PATHS) {
    if (
      !requiredProtectedPaths.some(
        (path) => path.toLowerCase() === requiredPath.toLowerCase(),
      )
    )
      requiredProtectedPaths.push(requiredPath);
  }
  const genericChecks = new Set<string>(
    GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
  );
  const projectChecks =
    input.manifest.requiredReconciliationReviewChecks.filter(
      (check) => !genericChecks.has(check),
    );
  return assertVerificationManifest({
    schemaVersion: VERIFICATION_MANIFEST_SCHEMA_VERSION,
    commissioning: {
      id: "historical-source-manifest-adapter",
      targetBranch: input.targetBranch,
      baseCommit: input.manifest.d031BaselineCommit,
      profile: input.manifest.finalExactVerification.profileId,
      createdAt: input.historicalRecordCommittedAt,
    },
    objective: input.manifest.objective,
    exclusions: input.manifest.exclusions,
    focusedCommands: input.manifest.focusedCommands,
    requiredProtectedPaths,
    requiredInvariantSuiteId: input.invariantSuiteId,
    scopePolicyId: input.scopePolicyId,
    exactVerification: {
      argv: ["pnpm", "verify"],
      requiresNoArguments: true,
      profileSource: "package-default",
      selectedByOverride: false,
    },
    reconciliationPolicy: {
      id: "historical-source-reconciliation.v1",
      nextProposalPath: input.manifest.nextProposalPath,
      requiredReviewChecks: [
        ...GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
        ...projectChecks,
      ],
    },
  });
}
