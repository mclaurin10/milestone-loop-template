import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { doctorExitCode, runDoctorDiagnostic } from "./doctor.js";
import {
  candidatePrepareProposalContractSha256,
  candidatePrepareProtectedFilesSha256,
  candidatePrepareProtectedPatternsSha256,
  candidatePrepareRetryContextSha256,
  candidatePrepareThreadLineageSha256,
  candidatePrepareWorkerPolicySha256,
} from "./candidate-prepare.js";
import type { CommissioningDoctorDiagnostic } from "./commissioning.js";
import {
  READINESS_VERIFICATION_STAGE_IDS,
  VERIFICATION_SUMMARY_SCHEMA_VERSION,
  type AuthoritativeVerificationSummary,
  type CandidatePrepareOperation,
  type MilestoneRecord,
  type VerificationSummary,
} from "./contracts.js";
import {
  inspectTrustedExecutionCapability,
  TRUSTED_CONTAINER_IMPLEMENTATION,
  type ExecutionProviderCapabilityProbe,
} from "./execution-provider.js";
import { executionProviderIdentity } from "./execution-provider-identity.js";
import {
  buildCanonicalProtectedSet,
  enforcementProtectedPatterns,
} from "./protected-roots.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  genericCommissioningTierPlans,
  validConfig,
  validProposal,
  validReconciliationRecord,
  validState,
} from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function validDoctorState(root: string) {
  const initial = validState(root);
  const authority = await readFile(join(root, "PROJECT_GOAL.md"));
  return {
    ...initial,
    repository: {
      ...initial.repository,
      protectedFiles: [
        {
          path: "PROJECT_GOAL.md",
          sha256: createHash("sha256").update(authority).digest("hex"),
        },
      ],
    },
  };
}

async function writeCompletionEligibleExactState(
  root: string,
  statePath: string,
): Promise<void> {
  const resultPath = join(root, "artifacts", "exact", "result.json");
  await writeJson(resultPath, { status: "PASS", candidateCommit: storedHead });
  const resultSha256 = createHash("sha256")
    .update(await readFile(resultPath))
    .digest("hex");
  const executionProvider = executionProviderIdentity({
    provider: "trusted-container",
    implementation: TRUSTED_CONTAINER_IMPLEMENTATION,
    runtimeName: "docker",
    runtimeVersion: "Docker test-runtime-1",
    imageDigest: pinnedImageDigest,
    mountPolicyVersion: "oci-mount-policy-v1",
    resourceLimitProfile: "oci-resource-limits-v1",
    networkDisposition: "denied",
    capabilityStatus: "ready",
    controlPlaneBound: true,
  });
  const stages = READINESS_VERIFICATION_STAGE_IDS.map((id) => ({
    id,
    status: "PASS" as const,
  }));
  const authoritative: AuthoritativeVerificationSummary = {
    runId: "doctor-exact-readiness",
    status: "PASS",
    exitCode: 0,
    disposition: "completion-eligible",
    profileId: "readiness",
    completionClaim: "autonomous_readiness",
    completionEligible: true,
    profileAutonomousReadinessEquivalent: true,
    autonomousReadinessEquivalent: true,
    readinessHistoryMode: "durable-records",
    candidateCommit: storedHead,
    requiredStageCount: stages.length,
    validatedArtifactCount: 1,
    stages,
    passingStageIds: stages.map((stage) => stage.id),
    notReadyStageIds: [],
    previouslyPassingStageIds: stages.map((stage) => stage.id),
    sourceResultPath: "artifacts/exact/result.json",
    copiedResultPath: "artifacts/exact/result.json",
    executionProvider,
  };
  const summary: VerificationSummary = {
    schemaVersion: VERIFICATION_SUMMARY_SCHEMA_VERSION,
    attempt: 1,
    status: "PASS",
    disposition: "completion-eligible",
    failureKind: null,
    summary: "Exact readiness verification passed.",
    startedAt: "2026-08-01T01:00:00.000Z",
    finishedAt: "2026-08-01T01:01:00.000Z",
    commands: [],
    authoritative,
    candidate: {
      baseCommit: "9".repeat(40),
      commit: storedHead,
      tree: "c".repeat(40),
      clean: true,
      changedEntriesDigest: "e".repeat(64),
    },
    authoritativeResultSha256: resultSha256,
    changedPaths: [],
    artifactPaths: [resultPath],
    executionProvider,
  };
  const now = "2026-08-01T01:02:00.000Z";
  const milestone = createMilestoneRecord(validProposal(), now);
  const state = await validDoctorState(root);
  await writeJson(statePath, {
    ...state,
    milestones: [
      {
        ...milestone,
        status: "completed",
        attempts: 1,
        timestamps: {
          ...milestone.timestamps,
          readyAt: now,
          startedAt: now,
          completedAt: now,
          updatedAt: now,
        },
        verificationSummaries: [summary],
        commits: [storedHead],
        nextAllowedAction: "plan",
      },
    ],
  });
}

async function repositoryFixture(
  state: "valid" | "missing" | "invalid" = "valid",
): Promise<{ readonly root: string; readonly statePath: string }> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "milestone-loop-doctor-")),
  );
  temporaryDirectories.push(root);
  const initialized = spawnSync(
    "git",
    ["-C", root, "init", "--initial-branch=fixture"],
    { encoding: "utf8", windowsHide: true },
  );
  if (initialized.status !== 0)
    throw new Error(
      `Could not initialize doctor fixture: ${initialized.stderr}`,
    );
  await writeJson(
    join(root, "tools/milestone-orchestrator/config/default.json"),
    doctorConfig(),
  );
  for (const path of buildCanonicalProtectedSet(validConfig())) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${path}\n`, "utf8");
  }
  // package.json is itself a protected trust root; the runtime-pin content
  // must land after the placeholder loop above.
  await writeJson(join(root, "package.json"), {
    engines: { node: "24.18.0" },
    packageManager: "pnpm@11.15.1",
    milestoneLoop: {
      productionBuild: {
        script: "build:production",
        outputRoots: ["dist"],
      },
    },
    scripts: { "build:production": "node tools/build-production.mjs" },
  });
  const statePath = join(root, "artifacts/orchestrator/state/state.json");
  if (state === "valid")
    await writeJson(statePath, await validDoctorState(root));
  if (state === "invalid")
    await writeJson(statePath, {
      schemaVersion: "0.0.0",
      credential: "state-secret",
    });
  return { root, statePath };
}

const pinnedEnvironment = {
  npm_config_user_agent: "pnpm/11.15.1 npm/? node/v24.18.0 win32 x64",
} satisfies NodeJS.ProcessEnv;
const storedHead = "a".repeat(40);
const pinnedImageDigest = `sha256:${"e".repeat(64)}`;

function readyCommissioningDiagnostic(): CommissioningDoctorDiagnostic {
  return {
    schemaVersion: "loop-commissioning-doctor.v2",
    diagnostic: "loop-commissioning",
    status: "PASS",
    readOnly: true,
    manifest: {
      path: ".agent/verification-manifest.json",
      bytes: 100,
      sha256: "f".repeat(64),
    },
    repository: {
      targetBranch: "main",
      baseCommit: "a".repeat(40),
      headCommit: storedHead,
      headTree: "c".repeat(40),
      profile: "readiness",
    },
    immutableContractLockSha256: "d".repeat(64),
    invariantSuiteId: "generic-invariants.v1",
    scopePolicyId: "generic-scope.v1",
    tierPlans: genericCommissioningTierPlans(),
  };
}

function doctorConfig() {
  return validConfig({
    candidateExecution: {
      mode: "trusted-container",
      trustedContainer: {
        runtime: "docker",
        imageDigest: pinnedImageDigest,
        mountPolicyVersion: "oci-mount-policy-v1",
        resourceLimitProfile: "oci-resource-limits-v1",
        networkDisposition: "denied",
      },
    },
  });
}

const readyExecutionProviderProbe: ExecutionProviderCapabilityProbe = {
  implementation: () => ({ available: true, version: "test-executor-1" }),
  runtime: () => ({ available: true, version: "Docker test-runtime-1" }),
  image: () => ({ available: true }),
  policy: () => ({ compatible: true, reason: null }),
};

describe("read-only orchestrator doctor", () => {
  it("reports a ready versioned diagnostic without reading or exposing local login contents", async () => {
    const fixture = await repositoryFixture();
    const codexHome = join(fixture.root, "codex-home");
    const authenticationPath = join(codexHome, "auth.json");
    const authenticationContents =
      '{"access_token":"never-print-this-local-secret"}\n';
    await mkdir(codexHome, { recursive: true });
    await writeFile(authenticationPath, authenticationContents, "utf8");
    const stateBefore = await readFile(fixture.statePath, "utf8");

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: { ...pinnedEnvironment, CODEX_HOME: codexHome },
        nodeVersion: "v24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic).toMatchObject({
      schemaVersion: "2.0.0",
      diagnostic: "orchestrator-doctor",
      status: "ready",
      readOnly: true,
      networkCallsPerformed: 0,
      summary: {
        blockCount: 0,
        autonomousIntegrationEligible: false,
      },
      checks: {
        runtimePins: {
          status: "pass",
          node: { configured: "24.18.0", running: "24.18.0", matches: true },
          pnpm: { configured: "11.15.1", running: "11.15.1", matches: true },
        },
        gitCleanliness: { status: "pass", clean: true },
        configuration: { status: "pass", valid: true },
        sdkCompatibility: {
          status: "pass",
          package: "@openai/codex-sdk",
          configuredVersion: "0.146.0",
          installedVersion: "0.146.0",
          matches: true,
        },
        commissioning: {
          status: "pass",
          manifest: {
            path: ".agent/verification-manifest.json",
            bytes: 100,
            sha256: "f".repeat(64),
          },
          commissioned: true,
          targetBranch: "main",
          baseCommit: "a".repeat(40),
          headCommit: storedHead,
          headTree: "c".repeat(40),
          profile: "readiness",
          immutableContractLockSha256: "d".repeat(64),
          invariantSuiteId: "generic-invariants.v1",
          scopePolicyId: "generic-scope.v1",
          tierPlans: readyCommissioningDiagnostic().tierPlans,
        },
        productionBuild: { status: "pass", configured: true },
        placeholderScripts: { status: "pass", scripts: [] },
        configuredPaths: { status: "pass" },
        executionProvider: {
          status: "pass",
          configuredProvider: "trusted-container",
          trustedAvailable: true,
          trustedCapability: inspectTrustedExecutionCapability(
            doctorConfig().candidateExecution.trustedContainer,
            readyExecutionProviderProbe,
          ),
        },
        state: {
          status: "pass",
          reference: "refs/milestone-loop/state",
          source: "legacy",
          mirror: "legacy",
          verifiedCommit: storedHead,
          protectedIntegrity: "verified",
          pendingOperation: null,
          outcome: "valid",
        },
        latestExactVerification: {
          status: "warning",
          available: false,
        },
        codexAuthentication: {
          status: "pass",
          available: true,
          source: "local-login",
        },
        protectedTrustRoots: {
          status: "pass",
          roots: buildCanonicalProtectedSet(validConfig(), [
            "tools/milestone-orchestrator/config/default.json",
          ]).map((path) => ({ path, present: true })),
          manifestCovered: null,
        },
        controllerLease: {
          status: "pass",
          reference: "refs/milestone-loop/controller-lease",
          legacyGuard: "absent",
          present: false,
          malformed: false,
          owner: null,
        },
        autonomousIntegrationEligibility: {
          status: "warning",
          eligible: false,
          reasons: ["latestExactVerification"],
        },
      },
    });
    expect(diagnostic.issues.map((issue) => issue.check)).toEqual([
      "latestExactVerification",
      "autonomousIntegrationEligibility",
    ]);
    expect(doctorExitCode(diagnostic, false)).toBe(0);
    expect(diagnostic.checks.commissioning.tierPlans).toEqual(
      genericCommissioningTierPlans(),
    );
    expect(doctorExitCode(diagnostic, true)).toBe(0);
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("never-print-this-local-secret");
    expect(serialized).not.toContain(codexHome);
    expect(await readFile(authenticationPath, "utf8")).toBe(
      authenticationContents,
    );
    expect(await readFile(fixture.statePath, "utf8")).toBe(stateBefore);
  });

  it("treats an absent state as initializable and does not create it", async () => {
    const fixture = await repositoryFixture("missing");
    const apiKey = "never-print-this-environment-secret";

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: apiKey,
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.status).toBe("ready");
    expect(diagnostic.checks.state).toMatchObject({
      status: "warning",
      code: "state-uninitialized",
      reference: "refs/milestone-loop/state",
      canonicalGeneration: null,
      source: "absent",
      mirror: "missing",
      verifiedCommit: null,
      protectedIntegrity: "uninitialized",
      pendingOperation: null,
      outcome: "missing",
    });
    expect(diagnostic.checks.codexAuthentication).toMatchObject({
      status: "pass",
      available: true,
      source: "environment",
    });
    expect(diagnostic.nextAction).toEqual({
      command: "pnpm loop:plan",
      reason:
        "Controller state is absent and can be initialized by the first plan.",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(apiKey);
    await expect(readFile(fixture.statePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports current completion-eligible readiness evidence and integration eligibility", async () => {
    const fixture = await repositoryFixture();
    await writeCompletionEligibleExactState(fixture.root, fixture.statePath);

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.status).toBe("ready");
    expect(diagnostic.summary).toEqual({
      passCount: 16,
      warningCount: 0,
      blockCount: 0,
      autonomousIntegrationEligible: true,
    });
    expect(diagnostic.issues).toEqual([]);
    expect(diagnostic.checks.latestExactVerification).toMatchObject({
      status: "pass",
      available: true,
      runId: "doctor-exact-readiness",
      resultPath: "artifacts/exact/result.json",
      resultHashMatches: true,
      profile: "readiness",
      candidateCommit: storedHead,
      current: true,
      verificationStatus: "PASS",
      completionEligible: true,
      autonomousReadinessEquivalent: true,
      providerMatchesCurrent: true,
    });
    expect(diagnostic.checks.autonomousIntegrationEligibility).toEqual({
      status: "pass",
      code: "ok",
      message:
        "The current target satisfies every autonomous-integration prerequisite.",
      remediation: null,
      command: null,
      eligible: true,
      reasons: [],
    });
    expect(diagnostic.nextAction).toEqual({
      command: "pnpm loop:plan",
      reason: "Canonical state permits planning.",
    });
    expect(doctorExitCode(diagnostic, true)).toBe(0);
  });

  it("rejects exact evidence redirected outside the repository through a linked parent", async () => {
    const fixture = await repositoryFixture();
    await writeCompletionEligibleExactState(fixture.root, fixture.statePath);
    const exactRoot = join(fixture.root, "artifacts", "exact");
    const resultContents = await readFile(join(exactRoot, "result.json"));
    const outside = await mkdtemp(join(tmpdir(), "milestone-loop-exact-link-"));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "result.json"), resultContents);
    await rm(exactRoot, { recursive: true });
    await symlink(
      outside,
      exactRoot,
      process.platform === "win32" ? "junction" : "dir",
    );

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.checks.latestExactVerification).toMatchObject({
      status: "warning",
      code: "exact-verification-artifact-invalid",
      available: true,
      resultHashMatches: false,
      providerMatchesCurrent: true,
    });
    expect(diagnostic.checks.autonomousIntegrationEligibility).toMatchObject({
      eligible: false,
      reasons: ["latestExactVerification"],
    });
  });

  it("requires exact evidence to match the active trusted-provider identity", async () => {
    const fixture = await repositoryFixture();
    await writeCompletionEligibleExactState(fixture.root, fixture.statePath);
    const changedRuntimeProbe: ExecutionProviderCapabilityProbe = {
      ...readyExecutionProviderProbe,
      runtime: () => ({
        available: true,
        version: "Docker test-runtime-2",
      }),
    };

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: changedRuntimeProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.checks.executionProvider.status).toBe("pass");
    expect(diagnostic.checks.latestExactVerification).toMatchObject({
      status: "warning",
      code: "exact-verification-provider-mismatch",
      resultHashMatches: true,
      providerMatchesCurrent: false,
    });
    expect(diagnostic.checks.autonomousIntegrationEligibility).toMatchObject({
      eligible: false,
      reasons: ["latestExactVerification"],
    });
  });

  it("reports production-build and active placeholder blockers in stable order", async () => {
    const fixture = await repositoryFixture();
    const packagePath = join(fixture.root, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      milestoneLoop: Record<string, unknown>;
      scripts: Record<string, string>;
    };
    delete packageJson.milestoneLoop["productionBuild"];
    packageJson.scripts["verify:dependencies"] =
      "node tools/placeholder-check.mjs verify:dependencies";
    await writeJson(packagePath, packageJson);

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.status).toBe("blocked");
    expect(diagnostic.checks.productionBuild).toMatchObject({
      status: "block",
      code: "production-build-invalid",
      configured: false,
    });
    expect(diagnostic.checks.placeholderScripts).toMatchObject({
      status: "block",
      code: "active-placeholder-scripts",
      scripts: ["verify:dependencies"],
    });
    expect(
      diagnostic.issues
        .filter((issue) => issue.severity === "block")
        .map((issue) => issue.check),
    ).toEqual(["productionBuild", "placeholderScripts"]);
    expect(diagnostic.nextAction).toEqual({
      command: "pnpm loop:doctor -- --strict",
      reason:
        "Manual repair is required for the earliest blocker; rerun strict Doctor afterward.",
    });
    expect(doctorExitCode(diagnostic, false)).toBe(0);
    expect(doctorExitCode(diagnostic, true)).toBe(2);
  });

  it("separates structural configuration from installed SDK compatibility", async () => {
    const fixture = await repositoryFixture();
    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        installedSdkVersionProbe: () => "0.145.0",
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.checks.configuration).toMatchObject({
      status: "pass",
      valid: true,
    });
    expect(diagnostic.checks.sdkCompatibility).toMatchObject({
      status: "block",
      code: "sdk-version-mismatch",
      configuredVersion: "0.146.0",
      installedVersion: "0.145.0",
      matches: false,
    });
    expect(diagnostic.nextAction.command).toBe(
      "pnpm install --frozen-lockfile --offline",
    );
  });

  it("blocks a configured workspace junction escape without changing either tree", async () => {
    const fixture = await repositoryFixture();
    const outside = await mkdtemp(join(tmpdir(), "milestone-loop-outside-"));
    temporaryDirectories.push(outside);
    const workspaceRoot = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "workspaces",
    );
    await mkdir(dirname(workspaceRoot), { recursive: true });
    await symlink(outside, workspaceRoot, "junction");
    const stateBefore = await readFile(fixture.statePath);

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.checks.configuredPaths).toMatchObject({
      status: "block",
      code: "configured-path-unsafe",
    });
    expect(
      diagnostic.checks.configuredPaths.paths.find(
        (entry) => entry.id === "workspaces",
      ),
    ).toMatchObject({
      exists: true,
      lexicalContained: true,
      realpathContained: false,
      kindValid: false,
    });
    expect(await readFile(fixture.statePath)).toEqual(stateBefore);
    expect(await realpath(workspaceRoot)).toBe(await realpath(outside));
  });

  it("blocks a configured path whose nearest existing ancestor is not a directory", async () => {
    const fixture = await repositoryFixture("missing");
    const controllerArtifacts = join(fixture.root, "artifacts", "orchestrator");
    await mkdir(dirname(controllerArtifacts), { recursive: true });
    await writeFile(controllerArtifacts, "wrong-kind\n", "utf8");

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: readyExecutionProviderProbe,
        commissioningProbe: async () => readyCommissioningDiagnostic(),
      },
    );

    expect(diagnostic.checks.configuredPaths).toMatchObject({
      status: "block",
      code: "configured-path-unsafe",
    });
    expect(
      diagnostic.checks.configuredPaths.paths.find(
        (entry) => entry.id === "state",
      ),
    ).toMatchObject({
      exists: false,
      nearestExistingPath: "artifacts/orchestrator",
      lexicalContained: true,
      realpathContained: true,
      kindValid: false,
    });
  });

  it.each([
    {
      name: "an OCI runtime without the trusted executor implementation",
      expectedStatus: "missing-implementation",
      probe: {
        ...readyExecutionProviderProbe,
        implementation: () => ({ available: false, version: null }),
      } satisfies ExecutionProviderCapabilityProbe,
    },
    {
      name: "a missing OCI runtime",
      expectedStatus: "missing-runtime",
      probe: {
        ...readyExecutionProviderProbe,
        runtime: () => ({ available: false, version: null }),
      } satisfies ExecutionProviderCapabilityProbe,
    },
    {
      name: "a missing pinned image",
      expectedStatus: "missing-pinned-image",
      probe: {
        ...readyExecutionProviderProbe,
        image: () => ({ available: false }),
      } satisfies ExecutionProviderCapabilityProbe,
    },
    {
      name: "an incompatible isolation policy",
      expectedStatus: "policy-mismatch",
      probe: {
        ...readyExecutionProviderProbe,
        policy: () => ({
          compatible: false,
          reason: "Test host cannot enforce the required policy.",
        }),
      } satisfies ExecutionProviderCapabilityProbe,
    },
  ])("reports a blocker for $name", async ({ expectedStatus, probe }) => {
    const fixture = await repositoryFixture();
    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
        executionProviderProbe: probe,
      },
    );

    expect(diagnostic.status).toBe("blocked");
    expect(diagnostic.checks.executionProvider).toMatchObject({
      status: "block",
      configuredProvider: "trusted-container",
      trustedAvailable: false,
      trustedCapability: { status: expectedStatus, available: false },
    });
    expect(diagnostic.checks.executionProvider.message.length).toBeGreaterThan(
      0,
    );
  });

  it("reports a missing controller trust root as a blocker", async () => {
    const fixture = await repositoryFixture();
    await rm(join(fixture.root, "scripts", "verify.mjs"));

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: { ...pinnedEnvironment, CODEX_API_KEY: "private" },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("blocked");
    expect(diagnostic.checks.protectedTrustRoots.status).toBe("block");
    expect(
      diagnostic.checks.protectedTrustRoots.roots.find(
        (root) => root.path === "scripts/verify.mjs",
      ),
    ).toEqual({
      path: "scripts/verify.mjs",
      present: false,
      regularFile: false,
      realpathContained: false,
    });
  });

  it("rejects a protected trust root redirected through a junction", async () => {
    const fixture = await repositoryFixture();
    const outside = await mkdtemp(join(tmpdir(), "milestone-loop-root-link-"));
    temporaryDirectories.push(outside);
    const protectedPath = join(fixture.root, "scripts", "verify.mjs");
    await rm(protectedPath);
    await symlink(outside, protectedPath, "junction");

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: { ...pinnedEnvironment, CODEX_API_KEY: "private" },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.checks.protectedTrustRoots.status).toBe("block");
    expect(
      diagnostic.checks.protectedTrustRoots.roots.find(
        (root) => root.path === "scripts/verify.mjs",
      ),
    ).toEqual({
      path: "scripts/verify.mjs",
      present: true,
      regularFile: false,
      realpathContained: false,
    });
  });

  it("reports dirty Git, runtime drift, invalid state, and unavailable authentication without leaking details", async () => {
    const fixture = await repositoryFixture("invalid");

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          npm_config_user_agent: "pnpm/10.33.0 npm/? node/v25.9.0 win32 x64",
        },
        nodeVersion: "v25.9.0",
        homeDirectory: fixture.root,
        gitProbe: () => ({ clean: false }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("blocked");
    expect(diagnostic.checks.runtimePins).toMatchObject({
      status: "block",
      node: { matches: false },
      pnpm: { matches: false },
    });
    expect(diagnostic.checks.gitCleanliness).toMatchObject({
      status: "block",
      clean: false,
    });
    expect(diagnostic.checks.configuration).toMatchObject({
      status: "pass",
      valid: true,
    });
    expect(diagnostic.checks.state).toMatchObject({
      status: "block",
      reference: "refs/milestone-loop/state",
      canonicalGeneration: null,
      source: "invalid",
      mirror: "invalid",
      pendingOperation: null,
      outcome: "invalid-or-unreadable",
    });
    expect(diagnostic.checks.codexAuthentication).toMatchObject({
      status: "block",
      available: false,
      source: "none",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("state-secret");
  });

  it("reports invalid configuration without attempting to interpret state", async () => {
    const fixture = await repositoryFixture();
    const configPath = join(
      fixture.root,
      "tools/milestone-orchestrator/config/default.json",
    );
    await writeJson(configPath, {
      schemaVersion: "0.0.0",
      credential: "never-print-this-config-secret",
    });

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("blocked");
    expect(diagnostic.checks.configuration).toMatchObject({
      status: "block",
      valid: false,
    });
    expect(diagnostic.checks.state).toMatchObject({
      status: "warning",
      reference: "refs/milestone-loop/state",
      canonicalGeneration: null,
      source: "not-checked",
      mirror: "not-checked",
      pendingOperation: null,
      outcome: "not-checked",
    });
    expect(diagnostic.nextAction).toEqual({
      command: "pnpm loop:doctor -- --strict",
      reason:
        "Manual repair is required for the earliest blocker; rerun strict Doctor afterward.",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(
      "never-print-this-config-secret",
    );
  });

  it("distinguishes a direct-commit gap from an active reconciliation", async () => {
    const fixture = await repositoryFixture();
    const common = {
      environment: {
        ...pinnedEnvironment,
        CODEX_API_KEY: "available-but-private",
      },
      nodeVersion: "24.18.0",
      gitProbe: () => ({ clean: true }),
    } as const;

    const gap = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      { ...common, headProbe: () => "b".repeat(40) },
    );
    expect(gap.checks.state).toMatchObject({
      status: "block",
      reference: "refs/milestone-loop/state",
      canonicalGeneration: null,
      source: "legacy",
      mirror: "legacy",
      pendingOperation: null,
      outcome: "reconciliation-required",
    });

    const baseState = await validDoctorState(fixture.root);
    const record = validReconciliationRecord();
    const activeState = {
      ...baseState,
      controllerHistory: [
        {
          schemaVersion: "1.0.0" as const,
          id: record.sourceArchiveId,
          rawSourceState: record.sourceState,
          sourceStateSchemaVersion: "1.2.0",
          sourceRevision: 7,
          priorVerifiedCommit: baseState.repository.verifiedCommit,
          priorRun: baseState.run,
          priorQueue: [],
          priorActiveMilestoneId: null,
          priorNextAllowedAction: "plan",
          archivedAt: "2026-08-04T00:00:00.000Z",
          reason: "external-integration-reconciliation" as const,
        },
      ],
      reconciliation: { active: record, history: [] },
      nextAllowedAction: "reconcile" as const,
    };
    await writeJson(fixture.statePath, activeState);
    const active = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      { ...common, headProbe: () => "b".repeat(40) },
    );
    expect(active.checks.state).toMatchObject({
      status: "block",
      reference: "refs/milestone-loop/state",
      canonicalGeneration: null,
      source: "legacy",
      mirror: "legacy",
      pendingOperation: null,
      outcome: "reconciliation-active",
    });
  });

  it("projects a candidate-prepare phase, disposition, and safe action read-only", async () => {
    const fixture = await repositoryFixture();
    const baseState = await validDoctorState(fixture.root);
    const proposal = validProposal({
      id: "doctor-candidate",
      permittedPaths: ["change.txt"],
    });
    const initialMilestone = createMilestoneRecord(
      proposal,
      "2026-08-23T20:00:00.000Z",
    );
    const workspacePath = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "workspaces",
      "doctor-candidate",
    );
    const milestone: MilestoneRecord = {
      ...initialMilestone,
      status: "running",
      attempts: 1,
      workspace: {
        isolation: "standalone-local-clone-branch",
        path: workspacePath,
        branch: "milestone-loop/doctor/candidate",
        baseCommit: baseState.repository.verifiedCommit,
        headCommit: null,
        createdAt: "2026-08-23T20:00:00.000Z",
        preserved: true,
        cleanup: {
          schemaVersion: "1.0.0",
          status: "active",
          reason: null,
          requestedAt: null,
          completedAt: null,
          nodeModulesRemovedAt: null,
          diagnosticArchivePath: null,
          error: null,
        },
      },
      timestamps: {
        ...initialMilestone.timestamps,
        readyAt: "2026-08-23T20:00:00.000Z",
        startedAt: "2026-08-23T20:00:00.000Z",
        updatedAt: "2026-08-23T20:00:00.000Z",
      },
      nextAllowedAction: "resume-worker",
    };
    const runDirectory = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "runs",
      "doctor-candidate-run",
    );
    const runningState = {
      ...baseState,
      queue: [proposal.id],
      milestones: [milestone],
      activeMilestoneId: proposal.id,
      run: {
        ...baseState.run,
        id: "doctor-candidate-run",
        status: "running" as const,
        startedAt: "2026-08-23T20:00:00.000Z",
        deadlineAt: "2026-08-24T20:00:00.000Z",
        artifactDirectory: runDirectory,
      },
      nextAllowedAction: "resume-worker" as const,
    };
    const attemptDirectory = join(
      runDirectory,
      "milestones",
      proposal.id,
      "attempt-1",
    );
    const operation: CandidatePrepareOperation = {
      schemaVersion: "1.0.0",
      kind: "candidate-prepare",
      id: "doctor-candidate-operation",
      runId: "doctor-candidate-run",
      milestoneId: proposal.id,
      attempt: 1,
      inputStateGeneration: "b".repeat(40),
      inputStateRevision: 0,
      repositoryRoot: fixture.root,
      workspaceRoot: join(
        fixture.root,
        "artifacts",
        "orchestrator",
        "workspaces",
      ),
      targetBranch: "main",
      verifiedCommit: baseState.repository.verifiedCommit,
      workspacePath,
      workspaceBranch: milestone.workspace!.branch,
      workspaceBaseCommit: baseState.repository.verifiedCommit,
      workspaceCreatedAt: milestone.workspace!.createdAt,
      workspaceCreateOperationId: "workspace-create-doctor-candidate",
      startingCandidate: {
        baseCommit: baseState.repository.verifiedCommit,
        commit: baseState.repository.verifiedCommit,
        tree: "c".repeat(40),
        clean: true,
        changedEntriesDigest: "d".repeat(64),
      },
      startingCommits: [],
      workerRole: "feature-worker-initial",
      workerAssignment: {
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
      },
      initialWorkerThreadId: null,
      initialWorkerThreadLineageSha256:
        candidatePrepareThreadLineageSha256(milestone),
      workerPolicySha256: candidatePrepareWorkerPolicySha256(milestone),
      retryFeedbackSha256: null,
      retryContextSha256: candidatePrepareRetryContextSha256(milestone),
      proposalContractSha256: candidatePrepareProposalContractSha256(milestone),
      protectedFilesSha256: candidatePrepareProtectedFilesSha256(
        baseState.repository.protectedFiles,
      ),
      protectedPatternsSha256: candidatePrepareProtectedPatternsSha256(
        enforcementProtectedPatterns(
          doctorConfig(),
          baseState.repository.protectedFiles,
        ),
      ),
      promptSha256: "e".repeat(64),
      workerEventsPath: join(attemptDirectory, "worker-events.jsonl"),
      workerTurnPath: join(attemptDirectory, "worker-turn.json"),
      checkpointArtifactPath: join(
        attemptDirectory,
        "controller-checkpoint.json",
      ),
      initialRunUsage: runningState.run.usage,
      initialAgentInvocationCount: 0,
      agentInvocationId: "doctor-candidate-run-agent-1",
      workerInvocation: null,
      workerResult: null,
      checkpointPlan: null,
      checkpointResult: null,
      checkpointArtifactSha256: null,
      phase: "intent-persisted",
      createdAt: "2026-08-23T20:00:00.000Z",
      updatedAt: "2026-08-23T20:00:00.000Z",
      recoveryPolicy: "validate-resume-adopt-or-preserve",
      diagnostic: null,
    };
    await writeJson(fixture.statePath, {
      ...runningState,
      pendingOperation: operation,
    });
    const stateBefore = await readFile(fixture.statePath);
    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );
    expect(diagnostic.checks.state).toMatchObject({
      status: "block",
      pendingOperation: {
        kind: "candidate-prepare",
        phase: "intent-persisted",
        classification: "workspace-path-unsafe",
        disposition: "manual",
        workspacePath,
        nextSafeAction: "manual-reconciliation-required",
      },
      outcome: "candidate-operation-pending",
    });
    expect(await readFile(fixture.statePath)).toEqual(stateBefore);
  });

  it("classifies retention apply without changing state, journal, or targets", async () => {
    const fixture = await repositoryFixture();
    expect(await realpath(fixture.root)).toBe(fixture.root);
    const baseState = await validDoctorState(fixture.root);
    const verificationRoot = join(fixture.root, "artifacts");
    const controllerRoot = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "runs",
    );
    const target = join(verificationRoot, "old-verification");
    await mkdir(target, { recursive: true });
    await writeJson(join(target, "result.json"), {
      schemaVersion: "1.0.0",
      runId: "old-verification",
      finishedAt: "2026-08-01T00:00:00.000Z",
    });
    await mkdir(controllerRoot, { recursive: true });
    const planSha256 = "f".repeat(64);
    const applyDirectory = join(
      fixture.root,
      "artifacts",
      "orchestrator",
      "retention",
      "apply",
      planSha256,
    );
    await writeJson(fixture.statePath, {
      ...baseState,
      pendingOperation: {
        schemaVersion: "1.0.0",
        kind: "retention-apply",
        id: `retention-apply-${planSha256}`,
        inputStateGeneration: "b".repeat(40),
        inputStateRevision: 0,
        repositoryRoot: fixture.root,
        targetBranch: "main",
        verifiedCommit: baseState.repository.verifiedCommit,
        runStatus: "idle",
        runId: null,
        retentionInitializedAt: baseState.evidenceRetention.initializedAt,
        previousLastPrunedAt: null,
        previousLastReportPath: null,
        planPath: join(
          fixture.root,
          "artifacts",
          "orchestrator",
          "retention",
          "plans",
          "plan.json",
        ),
        planSha256,
        planBytes: 100,
        planGeneratedAt: "2026-08-02T00:00:00.000Z",
        candidate: {
          commit: baseState.repository.verifiedCommit,
          tree: "c".repeat(40),
          dirty: false,
          worktreeSha256: "d".repeat(64),
        },
        keepRecentRuns: 20,
        verificationArtifactRoot: verificationRoot,
        verificationArtifactRootRealpath: await realpath(verificationRoot),
        verificationObservedRunIds: ["old-verification"],
        controllerArtifactRoot: controllerRoot,
        controllerArtifactRootRealpath: await realpath(controllerRoot),
        controllerObservedRunIds: [],
        applyDirectory,
        journalPath: join(applyDirectory, "journal.jsonl"),
        resultPath: join(applyDirectory, "apply-result.json"),
        deletions: [
          {
            ordinal: 0,
            root: "verification",
            runId: "old-verification",
            path: target,
            finishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
        phase: "intent-persisted",
        completedDeletionCount: 0,
        createdAt: "2026-08-02T01:00:00.000Z",
        updatedAt: "2026-08-02T01:00:00.000Z",
        completionAt: "2026-08-02T01:00:00.000Z",
        recoveryPolicy: "validate-resume-or-preserve",
        diagnostic: null,
      },
    });
    const authorityPath = join(fixture.root, "PROJECT_GOAL.md");
    await writeFile(authorityPath, "protected authority drift\n", "utf8");
    const [stateBefore, targetBefore, authorityBefore] = await Promise.all([
      readFile(fixture.statePath),
      readFile(join(target, "result.json")),
      readFile(authorityPath),
    ]);
    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );
    expect(diagnostic.checks.state).toMatchObject({
      status: "block",
      pendingOperation: {
        kind: "retention-apply",
        phase: "intent-persisted",
        classification: "resume-delete",
        completedDeletionCount: 0,
        deletionCount: 1,
        currentPath: target,
        nextSafeAction: "publish-delete-authorization",
      },
      outcome: "retention-operation-pending",
    });
    expect(diagnostic.checks.storedProtectedIntegrity).toMatchObject({
      status: "block",
      code: "stored-protected-drift",
      outcome: "drifted",
      driftedPaths: ["PROJECT_GOAL.md"],
    });
    const issueChecks = diagnostic.issues.map((issue) => issue.check);
    expect(issueChecks.indexOf("storedProtectedIntegrity")).toBe(
      issueChecks.indexOf("state") + 1,
    );
    const [stateAfter, targetAfter, authorityAfter] = await Promise.all([
      readFile(fixture.statePath),
      readFile(join(target, "result.json")),
      readFile(authorityPath),
    ]);
    expect(stateAfter).toEqual(stateBefore);
    expect(targetAfter).toEqual(targetBefore);
    expect(authorityAfter).toEqual(authorityBefore);
  });
});
