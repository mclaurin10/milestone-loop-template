import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import type { CodexGateway } from "../src/codex-gateway.js";
import {
  READINESS_VERIFICATION_STAGE_IDS,
  type AuthoritativeVerificationSummary,
  type VerificationSummary,
} from "../src/contracts.js";
import { candidateIdentityFrom } from "../src/candidate-identity.js";
import { captureProtectedFiles, inspectAttempt } from "../src/git-isolation.js";
import { createMilestoneRecord } from "../src/milestone-state.js";
import { MilestoneOrchestrator } from "../src/orchestrator.js";
import { StateStore, createInitialState } from "../src/state-store.js";
import {
  TARGET_INTEGRATION_FAULT_POINTS,
  type TargetIntegrationFaultPoint,
} from "../src/target-integration.js";
import { validConfig, validFeatureProposal } from "./fixtures.js";
import { createIsolatedWorkspaceFixture } from "./workspace-fixture.js";

const NOW = "2026-08-02T18:00:00.000Z";

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const [mode, metadataPath, requestedFaultPoint] = process.argv.slice(2);
  if (
    (mode !== "crash" && mode !== "normal" && mode !== "completion") ||
    !metadataPath
  )
    throw new Error(
      "Expected mode (crash|normal|completion) and metadata path.",
    );
  const faultPoint =
    mode === "normal"
      ? null
      : ((requestedFaultPoint ??
          (mode === "crash"
            ? "after-target-fast-forward"
            : "after-completion-state")) as TargetIntegrationFaultPoint);
  if (
    faultPoint !== null &&
    !TARGET_INTEGRATION_FAULT_POINTS.includes(faultPoint)
  )
    throw new Error(`Unknown target integration fault point ${faultPoint}.`);

  const root = await mkdtemp(join(tmpdir(), "milestone-loop-target-crash-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Target Integration Crash Test");
  git(root, "config", "user.email", "target-integration@example.invalid");
  const config = validConfig({ cleanupCompletedWorkspaces: true });
  for (const path of config.protectedPaths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `${path}\n`);
  }
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ milestoneLoop: { verification: { defaultProfile: "readiness" } } })}\n`,
  );
  await writeFile(join(root, ".gitignore"), "artifacts/\nnode_modules/\n");
  await writeFile(join(root, "change.txt"), "base\n");
  const configPath = "orchestrator-config.json";
  await writeFile(join(root, configPath), `${JSON.stringify(config)}\n`);
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture base");
  const baseCommit = git(root, "rev-parse", "HEAD");

  const runId = "target-integration-run";
  const milestoneId = "target-integration-source";
  const workspace = await createIsolatedWorkspaceFixture({
    repositoryRoot: root,
    workspaceRoot: config.workspaceRoot,
    targetBranch: config.targetBranch,
    baseCommit,
    runId,
    milestoneId,
    now: NOW,
  });
  await writeFile(join(workspace.path, "change.txt"), "approved\n");
  git(workspace.path, "add", "change.txt");
  git(workspace.path, "commit", "-m", "approved change");
  const verified = candidateIdentityFrom(
    baseCommit,
    inspectAttempt(workspace.path, baseCommit),
  );

  const runDirectory = join(root, config.artifactRoot, runId);
  const attemptDirectory = join(
    runDirectory,
    "milestones",
    milestoneId,
    "attempt-1",
  );
  const verificationDirectory = join(attemptDirectory, "verification");
  await mkdir(verificationDirectory, { recursive: true });
  const copiedResultPath = join(
    verificationDirectory,
    "authoritative-verify-result.json",
  );
  await writeFile(
    copiedResultPath,
    `${JSON.stringify({ fixture: "authoritative verify result copy" })}\n`,
  );
  const resultSha256 = createHash("sha256")
    .update(await readFile(copiedResultPath))
    .digest("hex");
  const stages = READINESS_VERIFICATION_STAGE_IDS.map((id, index) => ({
    id,
    status: index < 5 ? ("PASS" as const) : ("NOT_READY" as const),
  }));
  const authoritative: AuthoritativeVerificationSummary = {
    runId: `${runId}-${milestoneId}-a1-verify`,
    status: "NOT_READY",
    exitCode: 2,
    disposition: "incremental-readiness",
    profileId: "readiness",
    completionClaim: "autonomous_readiness",
    completionEligible: false,
    profileAutonomousReadinessEquivalent: true,
    autonomousReadinessEquivalent: false,
    readinessHistoryMode: "first-readiness-transition",
    candidateCommit: verified.commit,
    requiredStageCount: READINESS_VERIFICATION_STAGE_IDS.length,
    validatedArtifactCount: 5,
    stages,
    passingStageIds: stages
      .filter((stage) => stage.status === "PASS")
      .map((stage) => stage.id),
    notReadyStageIds: stages
      .filter((stage) => stage.status === "NOT_READY")
      .map((stage) => stage.id),
    previouslyPassingStageIds: [],
    sourceResultPath: "artifacts/target-integration-run/result.json",
    copiedResultPath,
  };
  const summary: VerificationSummary = {
    schemaVersion: "1.1.0",
    attempt: 1,
    status: "PASS",
    disposition: "incremental-readiness",
    failureKind: null,
    summary: "Focused milestone checks passed.",
    startedAt: NOW,
    finishedAt: NOW,
    commands: [],
    authoritative,
    candidate: verified,
    authoritativeResultSha256: resultSha256,
    changedPaths: ["change.txt"],
    artifactPaths: [join(verificationDirectory, "verification-summary.json")],
  };
  const proposal = validFeatureProposal({
    id: milestoneId,
    permittedPaths: ["change.txt"],
    verticalSlice: {
      mode: "exception",
      userGoal: null,
      publicActionKinds: [],
      sharedRuleOwners: [],
      standardCompositionOwner: null,
      persistenceReplayEvidence: [],
      nodeWorkerParityEvidence: [],
      inspectableConsequence: null,
      exception: {
        kind: "kernel-only",
        justification: "Exercise exact post-integration bookkeeping.",
        immediateConsumerMilestoneId: "target-integration-consumer",
        consumerContract:
          "Consume the target integration source through one public action.",
      },
    },
  });
  const milestone = createMilestoneRecord(proposal, NOW);
  const reviewing = {
    ...milestone,
    status: "reviewing" as const,
    attempts: 1,
    verificationSummaries: [summary],
    workspace: { ...workspace, headCommit: verified.commit },
    timestamps: { ...milestone.timestamps, startedAt: NOW, updatedAt: NOW },
    nextAllowedAction: "review" as const,
  };
  const protectedFiles = await captureProtectedFiles(root, [
    ...config.protectedPaths,
    configPath,
  ]);
  const initial = createInitialState({
    repositoryRoot: root,
    targetBranch: config.targetBranch,
    verifiedCommit: baseCommit,
    protectedFiles,
    now: NOW,
    legacyEvidenceRunIds: [],
  });
  const state = {
    ...initial,
    queue: [proposal.id],
    milestones: [reviewing],
    activeMilestoneId: proposal.id,
    run: {
      ...initial.run,
      id: runId,
      status: "running" as const,
      startedAt: NOW,
      deadlineAt: "2026-08-03T00:00:00.000Z",
      artifactDirectory: runDirectory,
    },
    nextAllowedAction: "review" as const,
  };
  const store = new StateStore(root, config.statePath, () => NOW);
  await store.initialize(state);

  const crashMarkerPath = `${metadataPath}.crashed`;
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        root,
        configPath,
        statePath: config.statePath,
        baseCommit,
        candidateCommit: verified.commit,
        workspacePath: workspace.path,
        outcomePath: join(attemptDirectory, "git-outcome.json"),
        crashMarkerPath,
        faultPoint,
      },
      null,
      2,
    )}\n`,
  );

  const gateway: CodexGateway = {
    run: async () => ({
      threadId: "target-integration-reviewer",
      finalResponse: JSON.stringify({
        schemaVersion: "1.1.0",
        decision: "approve",
        summary: "The exact candidate is approved.",
        findings: [],
        checks: {
          acceptanceEvidence: true,
          architectureCompliance: true,
          testQuality: true,
          noSuspiciousShortcuts: true,
          noScopeReduction: true,
          regressionsHandled: true,
        },
        verifiedBaseCommit: verified.baseCommit,
        verifiedHeadCommit: verified.commit,
        verifiedTree: verified.tree,
        verificationResultSha256: resultSha256,
      }),
      usage: null,
      itemCount: 1,
    }),
  };

  const orchestrator = await MilestoneOrchestrator.open(root, configPath, {
    gateway,
    now: () => new Date(NOW),
    targetIntegrationHooks:
      faultPoint !== null
        ? {
            fault: (point) => {
              if (point !== faultPoint) return;
              writeFileSync(
                crashMarkerPath,
                `${JSON.stringify({ point: faultPoint })}\n`,
              );
              process.exit(mode === "crash" ? 86 : 87);
            },
          }
        : {},
  });
  try {
    await orchestrator.run({ maximumMilestones: 1 });
  } finally {
    await orchestrator.close();
  }
}

await main();
