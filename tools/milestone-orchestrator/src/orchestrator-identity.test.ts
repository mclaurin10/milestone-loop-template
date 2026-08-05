import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexGateway } from "./codex-gateway.js";
import type {
  AuthoritativeVerificationSummary,
  CandidateIdentity,
  VerificationSummary,
} from "./contracts.js";
import { READINESS_VERIFICATION_STAGE_IDS } from "./contracts.js";
import { candidateIdentityFrom } from "./candidate-identity.js";
import {
  captureProtectedFiles,
  createIsolatedWorkspace,
  inspectAttempt,
} from "./git-isolation.js";
import { createMilestoneRecord } from "./milestone-state.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { StateStore, createInitialState } from "./state-store.js";
import { TelemetryStore } from "./telemetry-store.js";
import { validConfig, validProposal } from "../test/fixtures.js";

const NOW = "2026-08-02T18:00:00.000Z";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

function authoritativeIncrement(
  candidateCommit: string,
  copiedResultPath: string,
): AuthoritativeVerificationSummary {
  const stages = READINESS_VERIFICATION_STAGE_IDS.map((id, index) => ({
    id,
    status: index < 5 ? ("PASS" as const) : ("NOT_READY" as const),
  }));
  return {
    runId: "identity-run-identity-milestone-a1-verify",
    status: "NOT_READY",
    exitCode: 2,
    disposition: "incremental-readiness",
    profileId: "readiness",
    completionClaim: "autonomous_readiness",
    completionEligible: false,
    profileAutonomousReadinessEquivalent: true,
    autonomousReadinessEquivalent: false,
    readinessHistoryMode: "first-readiness-transition",
    candidateCommit,
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
    sourceResultPath: "artifacts/identity-run/result.json",
    copiedResultPath,
  };
}

interface ReviewingFixture {
  readonly root: string;
  readonly configPath: string;
  readonly config: ReturnType<typeof validConfig>;
  readonly baseCommit: string;
  readonly workspacePath: string;
  readonly verified: CandidateIdentity;
  readonly resultSha256: string;
  readonly runDirectory: string;
  readonly statePath: string;
}

async function reviewingFixture(options?: {
  readonly legacyUnpinnedSummary?: boolean;
}): Promise<ReviewingFixture> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-identity-orch-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Identity Fence Test");
  git(root, "config", "user.email", "identity@example.invalid");
  const config = validConfig();
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

  const workspace = await createIsolatedWorkspace({
    repositoryRoot: root,
    workspaceRoot: config.workspaceRoot,
    targetBranch: config.targetBranch,
    baseCommit,
    runId: "identity-run",
    milestoneId: "identity-milestone",
    now: NOW,
  });
  await writeFile(join(workspace.path, "change.txt"), "approved\n");
  git(workspace.path, "add", "change.txt");
  git(workspace.path, "commit", "-m", "approved change");
  const verified = candidateIdentityFrom(
    baseCommit,
    inspectAttempt(workspace.path, baseCommit),
  );

  const runDirectory = join(root, config.artifactRoot, "identity-run");
  const verificationDirectory = join(
    runDirectory,
    "milestones",
    "identity-milestone",
    "attempt-1",
    "verification",
  );
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
    authoritative: options?.legacyUnpinnedSummary
      ? null
      : authoritativeIncrement(verified.commit, copiedResultPath),
    candidate: options?.legacyUnpinnedSummary ? null : verified,
    authoritativeResultSha256: options?.legacyUnpinnedSummary
      ? null
      : resultSha256,
    changedPaths: ["change.txt"],
    artifactPaths: [join(verificationDirectory, "verification-summary.json")],
  };

  const proposal = validProposal({
    id: "identity-milestone",
    permittedPaths: ["change.txt"],
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
      id: "identity-run",
      status: "running" as const,
      startedAt: NOW,
      deadlineAt: "2026-08-03T00:00:00.000Z",
      artifactDirectory: runDirectory,
    },
    nextAllowedAction: "review" as const,
  };
  const store = new StateStore(root, config.statePath, () => NOW);
  await store.initialize(state);
  return {
    root,
    configPath,
    config,
    baseCommit,
    workspacePath: workspace.path,
    verified,
    resultSha256,
    runDirectory,
    statePath: store.path,
  };
}

function approvingGateway(fixture: {
  readonly verified: CandidateIdentity;
  readonly resultSha256: string;
}): { readonly run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async () => ({
      threadId: "fresh-reviewer-thread",
      finalResponse: JSON.stringify({
        schemaVersion: "1.1.0",
        decision: "approve",
        summary: "The pinned candidate passes independent review.",
        findings: [],
        checks: {
          acceptanceEvidence: true,
          architectureCompliance: true,
          testQuality: true,
          noSuspiciousShortcuts: true,
          noScopeReduction: true,
          regressionsHandled: true,
        },
        verifiedBaseCommit: fixture.verified.baseCommit,
        verifiedHeadCommit: fixture.verified.commit,
        verifiedTree: fixture.verified.tree,
        verificationResultSha256: fixture.resultSha256,
      }),
      usage: null,
      itemCount: 1,
    })),
  };
}

async function loadPersistedState(
  statePath: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(statePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("orchestrator candidate identity fence", () => {
  it(
    "escalates without invoking the reviewer when a clean commit lands after verification",
    { timeout: 60_000 },
    async () => {
      const fixture = await reviewingFixture();
      await writeFile(
        join(fixture.workspacePath, "injected.txt"),
        "external\n",
      );
      git(fixture.workspacePath, "add", "injected.txt");
      git(fixture.workspacePath, "commit", "-m", "external clean commit");

      const gateway = approvingGateway(fixture);
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: gateway as unknown as CodexGateway,
          now: () => new Date(NOW),
        },
      );
      const outcome = await orchestrator.run({ maximumMilestones: 1 });

      expect(gateway.run).not.toHaveBeenCalled();
      expect(outcome.state.run.status).toBe("escalated");
      const milestone = outcome.state.milestones[0];
      expect(milestone?.status).toBe("escalated");
      expect(milestone?.blockers.at(-1)?.code).toBe("CANDIDATE_IDENTITY_DRIFT");
      expect(milestone?.blockers.at(-1)?.message).toContain("review-entry");
      expect(outcome.state.repository.verifiedCommit).toBe(fixture.baseCommit);
      expect(git(fixture.root, "rev-parse", "HEAD")).toBe(fixture.baseCommit);
      const driftReport = JSON.parse(
        await readFile(
          join(
            fixture.runDirectory,
            "milestones",
            "identity-milestone",
            "attempt-1",
            "candidate-identity-drift-review-entry.json",
          ),
          "utf8",
        ),
      ) as Record<string, unknown>;
      expect(driftReport).toMatchObject({
        boundary: "review-entry",
        expected: { commit: fixture.verified.commit },
      });
    },
  );

  it(
    "escalates without invoking the reviewer when the workspace is dirtied before review",
    { timeout: 60_000 },
    async () => {
      const fixture = await reviewingFixture();
      await writeFile(join(fixture.workspacePath, "dirty.txt"), "dirty\n");

      const gateway = approvingGateway(fixture);
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: gateway as unknown as CodexGateway,
          now: () => new Date(NOW),
        },
      );
      const outcome = await orchestrator.run({ maximumMilestones: 1 });

      expect(gateway.run).not.toHaveBeenCalled();
      expect(outcome.state.run.status).toBe("escalated");
      expect(outcome.state.milestones[0]?.blockers.at(-1)?.code).toBe(
        "CANDIDATE_IDENTITY_DRIFT",
      );
      expect(git(fixture.root, "rev-parse", "HEAD")).toBe(fixture.baseCommit);
    },
  );

  it(
    "escalates when the copied authoritative result was tampered with",
    { timeout: 60_000 },
    async () => {
      const fixture = await reviewingFixture();
      await writeFile(
        join(
          fixture.runDirectory,
          "milestones",
          "identity-milestone",
          "attempt-1",
          "verification",
          "authoritative-verify-result.json",
        ),
        `${JSON.stringify({ fixture: "tampered copy" })}\n`,
      );

      const gateway = approvingGateway(fixture);
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: gateway as unknown as CodexGateway,
          now: () => new Date(NOW),
        },
      );
      const outcome = await orchestrator.run({ maximumMilestones: 1 });

      expect(gateway.run).not.toHaveBeenCalled();
      expect(outcome.state.milestones[0]?.blockers.at(-1)?.message).toContain(
        "no longer matches its recorded hash",
      );
      expect(git(fixture.root, "rev-parse", "HEAD")).toBe(fixture.baseCommit);
    },
  );

  it(
    "escalates fail-closed when persisted verification predates the identity fence",
    { timeout: 60_000 },
    async () => {
      const fixture = await reviewingFixture({ legacyUnpinnedSummary: true });
      const gateway = approvingGateway(fixture);
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: gateway as unknown as CodexGateway,
          now: () => new Date(NOW),
        },
      );
      const outcome = await orchestrator.run({ maximumMilestones: 1 });

      expect(gateway.run).not.toHaveBeenCalled();
      expect(outcome.state.milestones[0]?.blockers.at(-1)?.message).toContain(
        "predates the candidate identity fence",
      );
      expect(git(fixture.root, "rev-parse", "HEAD")).toBe(fixture.baseCommit);
    },
  );

  it(
    "completes integration and stops even when telemetry finalization fails",
    { timeout: 60_000 },
    async () => {
      const fixture = await reviewingFixture();
      const gateway = approvingGateway(fixture);
      const failingTelemetryOpen = (async (
        input: Parameters<typeof TelemetryStore.open>[0],
      ) => {
        const store = await TelemetryStore.open(input);
        Object.defineProperty(store, "beginPhase", {
          value: async () => ({
            operationId: `failing-span-${Math.random()}`,
            finish: async () => {
              throw new Error("simulated telemetry span failure");
            },
          }),
        });
        Object.defineProperty(store, "complete", {
          value: async () => {
            throw new Error("simulated telemetry completion failure");
          },
        });
        return store;
      }) as typeof TelemetryStore.open;
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: gateway as unknown as CodexGateway,
          now: () => new Date(NOW),
          telemetryStoreOpen: failingTelemetryOpen,
        },
      );
      try {
        const outcome = await orchestrator.run({ maximumMilestones: 1 });

        expect(gateway.run).toHaveBeenCalledTimes(1);
        expect(outcome.state.milestones[0]?.status).toBe("completed");
        expect(outcome.state.run.status).toBe("stopped");
        expect(outcome.state.milestones[0]?.attempts).toBe(1);
        expect(git(fixture.root, "rev-parse", "HEAD")).toBe(
          fixture.verified.commit,
        );
        const degradation = JSON.parse(
          await readFile(
            join(fixture.runDirectory, "telemetry-error.json"),
            "utf8",
          ),
        ) as Record<string, unknown>;
        expect(String(degradation["error"])).toContain(
          "simulated telemetry completion failure",
        );
      } finally {
        await orchestrator.close();
      }
    },
  );

  it(
    "resumes an unchanged reviewing milestone through review and fast-forward integration",
    { timeout: 60_000 },
    async () => {
      const fixture = await reviewingFixture();
      const gateway = approvingGateway(fixture);
      const orchestrator = await MilestoneOrchestrator.open(
        fixture.root,
        fixture.configPath,
        {
          gateway: gateway as unknown as CodexGateway,
          now: () => new Date(NOW),
        },
      );
      const outcome = await orchestrator.run({ maximumMilestones: 1 });

      expect(gateway.run).toHaveBeenCalledTimes(1);
      const milestone = outcome.state.milestones[0];
      expect(milestone?.status).toBe("completed");
      expect(milestone?.reviewerDecisions.at(-1)).toMatchObject({
        schemaVersion: "1.1.0",
        decision: "approve",
        verifiedHeadCommit: fixture.verified.commit,
        verifiedTree: fixture.verified.tree,
        verificationResultSha256: fixture.resultSha256,
        threadId: "fresh-reviewer-thread",
      });
      expect(outcome.state.repository.verifiedCommit).toBe(
        fixture.verified.commit,
      );
      expect(git(fixture.root, "rev-parse", "HEAD")).toBe(
        fixture.verified.commit,
      );
      const persisted = await loadPersistedState(fixture.statePath);
      expect(persisted["repository"]).toMatchObject({
        verifiedCommit: fixture.verified.commit,
      });
    },
  );
});
