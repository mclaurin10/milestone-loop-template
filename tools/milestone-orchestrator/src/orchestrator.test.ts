import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { READINESS_VERIFICATION_STAGE_IDS } from "./contracts.js";
import type {
  AuthoritativeVerificationSummary,
  MilestoneProposal,
  MilestoneRecord,
  VerificationSummary,
} from "./contracts.js";
import { createMilestoneRecord } from "./milestone-state.js";
import {
  humanPlaytestStopReason,
  inspectReadinessLifecycle,
  readinessHistoryEvidenceForCandidate,
} from "./orchestrator.js";

const NOW = "2026-08-01T00:00:00.000Z";
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

function authoritative(
  input: {
    notReadyStageIds?: readonly string[];
    overrides?: Partial<AuthoritativeVerificationSummary>;
  } = {},
): AuthoritativeVerificationSummary {
  const candidateCommit = "a".repeat(40);
  const notReady = new Set(input.notReadyStageIds ?? []);
  const stages = READINESS_VERIFICATION_STAGE_IDS.map((id) => ({
    id,
    status: notReady.has(id) ? ("NOT_READY" as const) : ("PASS" as const),
  }));
  const passingStageIds = stages
    .filter((stage) => stage.status === "PASS")
    .map((stage) => stage.id);
  const notReadyStageIds = stages
    .filter((stage) => stage.status === "NOT_READY")
    .map((stage) => stage.id);
  const isPass = notReadyStageIds.length === 0;
  return {
    runId: "readiness-result",
    status: isPass ? "PASS" : "NOT_READY",
    exitCode: isPass ? 0 : 2,
    disposition: isPass ? "completion-eligible" : "incremental-readiness",
    profileId: "readiness",
    completionClaim: "autonomous_readiness",
    completionEligible: isPass,
    profileAutonomousReadinessEquivalent: true,
    autonomousReadinessEquivalent: isPass,
    readinessHistoryMode: "first-readiness-transition",
    candidateCommit,
    requiredStageCount: READINESS_VERIFICATION_STAGE_IDS.length,
    validatedArtifactCount: 20,
    stages,
    passingStageIds,
    notReadyStageIds,
    previouslyPassingStageIds: [],
    sourceResultPath: "artifacts/readiness-result/result.json",
    copiedResultPath: "verification/authoritative-verify-result.json",
    ...input.overrides,
  };
}

function proposal(id: string): MilestoneProposal {
  return {
    schemaVersion: "1.0.0",
    id,
    title: "Readiness increment",
    kind: "tooling",
    objective: "Advance one bounded readiness increment.",
    rationale: "Retain monotonic exact-candidate evidence.",
    dependencies: [],
    permittedPaths: ["tools/example.ts"],
    exclusions: ["No scope reduction.", "No hidden validation."],
    acceptanceCriteria: [
      {
        id: "TEST-01",
        description: "The bounded increment is verified.",
        evidence: "Machine verification summary.",
      },
    ],
    requiredTests: ["pnpm test:example"],
    verificationCommands: [
      {
        id: "authoritative",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
      },
    ],
    expectedArtifacts: ["verification/verification-summary.json"],
    terminalConditions: ["Stop on unsafe evidence."],
    estimatedFileCount: 1,
    requiresBrowserInspection: false,
    requiresHeadlessEvaluation: false,
    hiddenValidation: { requested: false },
  };
}

function verification(
  evidence: AuthoritativeVerificationSummary,
): VerificationSummary {
  return {
    schemaVersion: "1.0.0",
    attempt: 1,
    status: "PASS",
    disposition: evidence.disposition,
    failureKind: null,
    summary: "Bounded milestone evidence accepted.",
    startedAt: NOW,
    finishedAt: NOW,
    commands: [],
    authoritative: evidence,
    changedPaths: ["tools/example.ts"],
    artifactPaths: ["verification/verification-summary.json"],
  };
}

function completedMilestone(
  id: string,
  evidence: AuthoritativeVerificationSummary,
): MilestoneRecord {
  const base = createMilestoneRecord(proposal(id), NOW);
  return {
    ...base,
    status: "completed",
    verificationSummaries: [verification(evidence)],
    commits: [evidence.candidateCommit],
    workspace: {
      isolation: "standalone-local-clone-branch",
      path: "C:/isolated/readiness-increment",
      branch: `ski-loop/test/${id}`,
      baseCommit: "b".repeat(40),
      headCommit: evidence.candidateCommit,
      createdAt: NOW,
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
    nextAllowedAction: "plan",
  };
}

const FIRST_TRANSITION = {
  profile: "readiness" as const,
  candidateHasMarker: true,
  markerCommitAtOrBeforeBase: null,
  markerCommitAtOrBeforeCandidate: "1".repeat(40),
};

const ESTABLISHED_READINESS = {
  profile: "readiness" as const,
  candidateHasMarker: true,
  markerCommitAtOrBeforeBase: "1".repeat(40),
  markerCommitAtOrBeforeCandidate: "1".repeat(40),
};

describe("post-integration readiness stop decision", () => {
  it("requests human playtesting only for exact eligible full-registry readiness PASS", () => {
    expect(humanPlaytestStopReason(authoritative())).toBe(
      "Final autonomous-readiness verification passed; stop for human playtesting.",
    );

    const incremental = authoritative({
      notReadyStageIds: ["save-load", "headless-scenarios"],
    });
    expect(humanPlaytestStopReason(incremental)).toBeNull();
    expect(
      humanPlaytestStopReason(
        authoritative({
          overrides: {
            completionEligible: false,
            autonomousReadinessEquivalent: false,
          },
        }),
      ),
    ).toBeNull();

    expect(
      humanPlaytestStopReason(
        authoritative({
          overrides: {
            requiredStageCount: 2,
            stages: [
              { id: "environment", status: "PASS" },
              { id: "contract-integrity", status: "PASS" },
            ],
            passingStageIds: ["environment", "contract-integrity"],
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("durable monotonic readiness history", () => {
  it("allows an empty floor only for the first marker-introducing candidate", () => {
    expect(readinessHistoryEvidenceForCandidate([], FIRST_TRANSITION)).toEqual({
      mode: "first-readiness-transition",
      previouslyPassingStageIds: [],
    });
    expect(() =>
      readinessHistoryEvidenceForCandidate([], ESTABLISHED_READINESS),
    ).toThrow(/records are missing after readiness activation/);
    expect(() =>
      readinessHistoryEvidenceForCandidate([], {
        ...FIRST_TRANSITION,
        candidateHasMarker: false,
      }),
    ).toThrow(/candidate marker is missing/);
  });

  it("reconstructs an exact chained floor from completed candidate records", () => {
    const firstEvidence = authoritative({
      notReadyStageIds: [
        "determinism-replay",
        "save-load",
        "headless-scenarios",
        "bot-playtesting",
        "browser-interaction",
        "playwright-evidence",
        "browser-diagnostics",
        "performance",
        "acceptance-manifest",
      ],
    });
    const first = completedMilestone("first", firstEvidence);
    const mismatched = {
      ...completedMilestone("mismatched", firstEvidence),
      commits: ["c".repeat(40)],
    };
    const incomplete = {
      ...completedMilestone("incomplete", firstEvidence),
      status: "reviewing" as const,
    };
    const bootstrap = completedMilestone(
      "bootstrap",
      authoritative({
        overrides: {
          profileId: "bootstrap",
          completionClaim: "bootstrap_complete",
          profileAutonomousReadinessEquivalent: false,
          autonomousReadinessEquivalent: false,
          readinessHistoryMode: "not-applicable",
        },
      }),
    );

    expect(
      readinessHistoryEvidenceForCandidate(
        [incomplete, bootstrap, first],
        ESTABLISHED_READINESS,
      ),
    ).toEqual({
      mode: "durable-records",
      previouslyPassingStageIds: [
        "contract-integrity",
        "environment",
        "format-lint",
        "production-build",
        "typecheck",
        "unit-domain",
      ],
    });
    expect(() =>
      readinessHistoryEvidenceForCandidate([mismatched], ESTABLISHED_READINESS),
    ).toThrow(/Cannot prove monotonic readiness history/);
  });

  it("rejects missing links and partial readiness registries", () => {
    const firstEvidence = authoritative({
      notReadyStageIds: ["save-load", "headless-scenarios"],
    });
    const previousFloor = [...firstEvidence.passingStageIds].sort();
    const laterEvidence = authoritative({
      notReadyStageIds: ["headless-scenarios"],
      overrides: {
        readinessHistoryMode: "durable-records",
        previouslyPassingStageIds: previousFloor,
      },
    });
    const laterWithoutFirst = completedMilestone("later", laterEvidence);
    expect(() =>
      readinessHistoryEvidenceForCandidate(
        [laterWithoutFirst],
        ESTABLISHED_READINESS,
      ),
    ).toThrow(/Cannot prove monotonic readiness history/);

    const partialEvidence = authoritative({
      overrides: {
        requiredStageCount: 5,
        stages: [
          { id: "environment", status: "PASS" },
          { id: "format-lint", status: "PASS" },
          { id: "typecheck", status: "PASS" },
          { id: "production-build", status: "PASS" },
          { id: "contract-integrity", status: "PASS" },
        ],
        passingStageIds: [
          "environment",
          "format-lint",
          "typecheck",
          "production-build",
          "contract-integrity",
        ],
      },
    });
    expect(() =>
      readinessHistoryEvidenceForCandidate(
        [completedMilestone("partial", partialEvidence)],
        ESTABLISHED_READINESS,
      ),
    ).toThrow(/Cannot prove monotonic readiness history/);
  });

  it("derives first versus established readiness from committed Git history", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ski-loop-history-"));
    temporaryDirectories.push(workspace);
    git(workspace, "init", "-b", "main");
    git(workspace, "config", "user.name", "Orchestrator Test");
    git(workspace, "config", "user.email", "orchestrator@example.invalid");
    await writeFile(
      join(workspace, "package.json"),
      `${JSON.stringify({ skiTycoon: { verification: { defaultProfile: "bootstrap" } } })}\n`,
      "utf8",
    );
    git(workspace, "add", "package.json");
    git(workspace, "commit", "-m", "bootstrap");
    const bootstrapCommit = git(workspace, "rev-parse", "HEAD");
    expect(inspectReadinessLifecycle(workspace, bootstrapCommit)).toEqual({
      profile: "bootstrap",
      candidateHasMarker: false,
      markerCommitAtOrBeforeBase: null,
      markerCommitAtOrBeforeCandidate: null,
    });

    await mkdir(join(workspace, ".agent"), { recursive: true });
    await writeFile(
      join(workspace, ".agent", "readiness-profile-activated.json"),
      '{"schemaVersion":"1.0.0"}\n',
      "utf8",
    );
    await writeFile(
      join(workspace, "package.json"),
      `${JSON.stringify({ skiTycoon: { verification: { defaultProfile: "readiness" } } })}\n`,
      "utf8",
    );
    git(
      workspace,
      "add",
      ".agent/readiness-profile-activated.json",
      "package.json",
    );
    git(workspace, "commit", "-m", "activate readiness");
    const transitionCommit = git(workspace, "rev-parse", "HEAD");
    const first = inspectReadinessLifecycle(workspace, bootstrapCommit);
    expect(first).toMatchObject({
      profile: "readiness",
      candidateHasMarker: true,
      markerCommitAtOrBeforeBase: null,
      markerCommitAtOrBeforeCandidate: transitionCommit,
    });

    await writeFile(join(workspace, "increment.txt"), "next\n", "utf8");
    git(workspace, "add", "increment.txt");
    git(workspace, "commit", "-m", "next readiness increment");
    expect(
      inspectReadinessLifecycle(workspace, transitionCommit),
    ).toMatchObject({
      profile: "readiness",
      candidateHasMarker: true,
      markerCommitAtOrBeforeBase: transitionCommit,
      markerCommitAtOrBeforeCandidate: transitionCommit,
    });
  }, 15_000);
});
