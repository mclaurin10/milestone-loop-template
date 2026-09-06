import { SOURCE_CONTRACT_ID, SOURCE_EPOCH } from "./authority-publication.mjs";

export const LEGACY_AGGREGATE_SCHEMA_VERSION = "2.1.0";
export const SOURCE_AGGREGATE_SCHEMA_VERSION = "3.0.0";
export const LEGACY_TIER_SCHEMA_VERSION = "1.2.0";
export const SOURCE_TIER_SCHEMA_VERSION = "2.0.0";
export const SOURCE_VERIFICATION_CLAIM_SCOPE = "orchestrator-template";

const versions = Object.freeze({
  aggregate: Object.freeze({
    legacy: LEGACY_AGGREGATE_SCHEMA_VERSION,
    source: SOURCE_AGGREGATE_SCHEMA_VERSION,
  }),
  tier: Object.freeze({
    legacy: LEGACY_TIER_SCHEMA_VERSION,
    source: SOURCE_TIER_SCHEMA_VERSION,
  }),
});
const identityKeys = ["gitCommit", "gitTree", "workingTreeDirty"];
const qualifierKeys = ["runId", "nonce", "identitySha256"];
const scopeKeys = [
  "contractId",
  "authorityEpoch",
  "claimScope",
  "purpose",
  "sourceCandidate",
  "fixtureCandidates",
  "qualifierRun",
];
const gitId = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identifier = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value);
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value, keys, label) {
  if (
    !object(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error(`${label} has unknown or missing fields.`);
}
function candidate(value, label) {
  exact(value, identityKeys, label);
  if (
    !gitId(value.gitCommit) ||
    !gitId(value.gitTree) ||
    typeof value.workingTreeDirty !== "boolean"
  )
    throw new Error(`${label} is not a complete source/fixture Git identity.`);
}
function sameCandidate(left, right) {
  return (
    object(left) &&
    object(right) &&
    identityKeys.every((key) => left[key] === right[key])
  );
}
function qualifier(value) {
  exact(value, qualifierKeys, "Source qualifier run");
  if (
    !identifier(value.runId) ||
    !digest(value.nonce) ||
    !digest(value.identitySha256)
  )
    throw new Error("Source qualifier run identity is malformed.");
}

/** Validate scope before the caller reads status/completion. Expected scope and
 * identities belong to the trusted caller, never to a result or CLI override.
 * This only validates an envelope; it does not authenticate a qualifier or
 * establish any stage, host, migration, or readiness outcome. */
export function assertVerificationResultScope(value, expected) {
  if (
    !object(expected) ||
    !Object.hasOwn(versions, expected.kind) ||
    !["legacy", "source"].includes(expected.scope)
  )
    throw new Error(
      "A trusted expected verification kind and scope are required.",
    );
  if (!object(value))
    throw new Error("Verification scope requires a result object.");
  if (value.schemaVersion !== versions[expected.kind][expected.scope])
    throw new Error("Unknown or cross-scope verification result schema.");
  // A legacy result cannot acquire source semantics by adding scope fields.
  if (expected.scope === "legacy") {
    if (["scope", ...scopeKeys].some((key) => Object.hasOwn(value, key)))
      throw new Error(
        "Source scope fields cannot be attached to a legacy result.",
      );
    return null;
  }
  const scope = value.scope;
  exact(scope, scopeKeys, "Source verification scope");
  if (
    scope.contractId !== SOURCE_CONTRACT_ID ||
    scope.authorityEpoch !== SOURCE_EPOCH ||
    scope.claimScope !== SOURCE_VERIFICATION_CLAIM_SCOPE
  )
    throw new Error("Unknown or mixed source contract, epoch, or claim scope.");
  if (
    !["candidate-support", "full-source-qualification"].includes(scope.purpose)
  )
    throw new Error("Unknown source verification purpose.");
  if (expected.purpose !== scope.purpose)
    throw new Error(
      "Source verification purpose differs from the trusted dispatch.",
    );
  candidate(scope.sourceCandidate, "Source candidate");
  candidate(expected.sourceCandidate, "Expected source candidate");
  if (
    !sameCandidate(scope.sourceCandidate, expected.sourceCandidate) ||
    !sameCandidate(scope.sourceCandidate, value.candidate)
  )
    throw new Error(
      "Source scope candidate differs from the actual expected/result identity.",
    );
  if (!Array.isArray(scope.fixtureCandidates))
    throw new Error("Source fixture candidates must be an explicit array.");
  const seen = new Set();
  for (const fixture of scope.fixtureCandidates) {
    exact(
      fixture,
      ["id", "contractId", "authorityEpoch", "candidate"],
      "Source fixture reference",
    );
    if (
      !identifier(fixture.id) ||
      seen.has(fixture.id) ||
      !identifier(fixture.contractId) ||
      fixture.contractId === SOURCE_CONTRACT_ID ||
      (fixture.authorityEpoch !== null &&
        !identifier(fixture.authorityEpoch)) ||
      fixture.authorityEpoch === SOURCE_EPOCH
    )
      throw new Error(
        "Source fixture identity is duplicated, malformed, or imports source authority.",
      );
    candidate(fixture.candidate, "Fixture candidate");
    seen.add(fixture.id);
  }
  if (scope.qualifierRun !== null) qualifier(scope.qualifierRun);
  if (!Object.hasOwn(expected, "qualifierRun"))
    throw new Error(
      "The trusted dispatch must explicitly bind qualifier presence or absence.",
    );
  if (expected.qualifierRun !== null) qualifier(expected.qualifierRun);
  if (
    (scope.qualifierRun === null) !== (expected.qualifierRun === null) ||
    (scope.qualifierRun !== null &&
      qualifierKeys.some(
        (key) => scope.qualifierRun[key] !== expected.qualifierRun[key],
      ))
  )
    throw new Error(
      "Source qualifier identity differs from the independently observed dispatch.",
    );
  if (
    !Array.isArray(expected.fixtureCandidates) ||
    scope.fixtureCandidates.length !== expected.fixtureCandidates.length ||
    scope.fixtureCandidates.some((fixture, index) => {
      const expectedFixture = expected.fixtureCandidates[index];
      return (
        !object(expectedFixture) ||
        Object.keys(expectedFixture).length !== 4 ||
        fixture.id !== expectedFixture.id ||
        fixture.contractId !== expectedFixture.contractId ||
        fixture.authorityEpoch !== expectedFixture.authorityEpoch ||
        !sameCandidate(fixture.candidate, expectedFixture.candidate)
      );
    })
  )
    throw new Error(
      "Source fixture inventory differs from the trusted dispatch.",
    );
  return scope;
}

function freeze(value) {
  for (const item of Object.values(value))
    if (object(item) || Array.isArray(item)) freeze(item);
  return Object.freeze(value);
}
// This registry is metadata, not an implementation or completion claim. Missing
// real command producers remain NOT_READY at the verifier's existing boundary.
/** @type {ReadonlyArray<{readonly id: string, readonly name: string,
 * readonly scripts: readonly string[], readonly requiredArtifactKinds: readonly string[],
 * readonly acceptanceIds: readonly string[], readonly timeoutMs: number, readonly kind?: string}>} */
export const SOURCE_VERIFICATION_STAGES = freeze([
  {
    id: "environment",
    name: "Source dependency integrity",
    scripts: ["verify:source-dependencies"],
    requiredArtifactKinds: ["source-dependencies-report"],
    acceptanceIds: ["ORCH-STATIC-01"],
    timeoutMs: 300_000,
  },
  {
    id: "contract-integrity",
    name: "Approved source authority integrity",
    kind: "source-contract",
    scripts: ["test:invariants"],
    requiredArtifactKinds: ["invariant-suite-report"],
    acceptanceIds: ["ORCH-STATIC-01", "ORCH-VERIFY-01"],
    timeoutMs: 300_000,
  },
  {
    id: "format-lint",
    name: "Source formatting, lint and architecture",
    scripts: ["format:check", "lint", "lint:source-architecture"],
    requiredArtifactKinds: [
      "format-report",
      "lint-report",
      "source-architecture-report",
    ],
    acceptanceIds: ["ORCH-STATIC-01"],
    timeoutMs: 300_000,
  },
  {
    id: "typecheck",
    name: "Strict source type checking",
    scripts: ["typecheck"],
    requiredArtifactKinds: ["typecheck-report"],
    acceptanceIds: ["ORCH-STATIC-01"],
    timeoutMs: 300_000,
  },
  {
    id: "production-build",
    name: "Consumed source distribution",
    scripts: ["build"],
    requiredArtifactKinds: [
      "build-report",
      "source-release-archive",
      "source-release-manifest",
      "source-release-consumer",
    ],
    acceptanceIds: ["ORCH-BUILD-01"],
    timeoutMs: 300_000,
  },
  {
    id: "unit",
    name: "Complete source regression suite",
    scripts: ["test:unit"],
    requiredArtifactKinds: ["vitest-report", "test-run-summary"],
    acceptanceIds: ["ORCH-STATIC-01"],
    timeoutMs: 90 * 60 * 1000,
  },
  {
    id: "orchestration-domain",
    name: "Public orchestration workflows",
    scripts: ["test:orchestration-domain"],
    requiredArtifactKinds: ["orchestration-workflow-report"],
    acceptanceIds: [
      "ORCH-PLAN-01",
      "ORCH-VERIFY-01",
      "ORCH-REVIEW-01",
      "ORCH-STATE-01",
      "ORCH-RECOVERY-01",
      "ORCH-RECONCILE-01",
      "ORCH-RETENTION-01",
      "ORCH-CONTAIN-01",
    ],
    timeoutMs: 90 * 60 * 1000,
  },
  {
    id: "orchestration-parity",
    name: "Canonical orchestration parity",
    scripts: ["verify:source-parity"],
    requiredArtifactKinds: ["orchestration-parity-report"],
    acceptanceIds: ["ORCH-STATE-01"],
    timeoutMs: 90 * 60 * 1000,
  },
  {
    id: "adopter-bootstrap",
    name: "Generated adopter bootstrap qualification",
    scripts: ["verify:adopter-bootstrap"],
    requiredArtifactKinds: ["adopter-package-report", "bootstrap-result-index"],
    acceptanceIds: ["ORCH-ADOPT-01"],
    timeoutMs: 90 * 60 * 1000,
  },
  {
    id: "resource-bounds",
    name: "Actual source execution resource bounds",
    scripts: ["verify:source-bounds"],
    requiredArtifactKinds: ["source-resource-bounds-report"],
    acceptanceIds: ["ORCH-BOUNDS-01"],
    timeoutMs: 90 * 60 * 1000,
  },
  {
    id: "source-acceptance",
    name: "Complete source qualification aggregation",
    scripts: ["verify:source-acceptance"],
    requiredArtifactKinds: ["source-acceptance-report"],
    acceptanceIds: ["ORCH-AUTONOMOUS-READINESS-01"],
    timeoutMs: 90 * 60 * 1000,
  },
]);
export const SOURCE_VERIFICATION_STAGE_IDS = Object.freeze(
  SOURCE_VERIFICATION_STAGES.map(({ id }) => id),
);
