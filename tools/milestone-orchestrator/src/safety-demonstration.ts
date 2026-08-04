import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { MilestoneRecord, OrchestratorConfig } from "./contracts.js";
import { canaryMilestone } from "./canary.js";
import {
  createMilestoneRecord,
  transitionMilestone,
} from "./milestone-state.js";
import { enforceDiffPolicy } from "./policy.js";
import { recoveryAction, decideRetry } from "./retry-policy.js";
import {
  StateStore,
  createInitialState,
  atomicWriteJson,
} from "./state-store.js";
import { captureProtectedFiles, gitHead } from "./git-isolation.js";

export interface SafetyDemonstrationResult {
  readonly schemaVersion: "1.0.0";
  readonly status: "PASS";
  readonly generatedAt: string;
  readonly scenarios: readonly {
    readonly id: string;
    readonly status: "PASS";
    readonly evidence: unknown;
  }[];
  readonly artifactPath: string;
}

export async function demonstrateSafety(input: {
  readonly repositoryRoot: string;
  readonly config: OrchestratorConfig;
  readonly artifactDirectory: string;
  readonly now?: () => string;
}): Promise<SafetyDemonstrationResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const generatedAt = now();
  const artifactSuffix = `${generatedAt.replaceAll(/[^0-9]/g, "").slice(0, 17)}-${randomUUID().slice(0, 8)}`;
  const proposal = canaryMilestone();
  const canaryPath = fileURLToPath(new URL("./canary.ts", import.meta.url));
  const record = createMilestoneRecord(proposal, generatedAt, {
    schemaVersion: "1.0.0",
    source: "built-in-canary",
    sourcePath: "tools/milestone-orchestrator/src/canary.ts",
    sourceSha256: createHash("sha256")
      .update(await readFile(canaryPath))
      .digest("hex"),
    plannerThreadId: null,
    recordedAt: generatedAt,
    reason: null,
  });
  let state = createInitialState({
    repositoryRoot: input.repositoryRoot,
    targetBranch: input.config.targetBranch,
    verifiedCommit: gitHead(input.repositoryRoot),
    protectedFiles: await captureProtectedFiles(
      input.repositoryRoot,
      input.config.protectedPaths,
    ),
    now: now(),
  });
  state = {
    ...state,
    milestones: [record],
    queue: [proposal.id],
    activeMilestoneId: proposal.id,
  };
  state = transitionMilestone(state, proposal.id, "ready", now());
  state = transitionMilestone(state, proposal.id, "running", now());
  state = {
    ...state,
    milestones: state.milestones.map((milestone) => ({
      ...milestone,
      attempts: 1,
      workerThreadId: "mock-worker-thread-persisted",
      workerThreadLineage: [
        {
          threadId: "mock-worker-thread-persisted",
          role: "gameplay-worker-initial",
          model: "gpt-5.6-sol",
          reasoningEffort: "xhigh",
          startedAt: now(),
          attempt: 1,
          replacesThreadId: null,
          replacementReason: null,
        },
      ],
      retryFeedback:
        "Injected verification failure: focused test exited 1; inspect command evidence.",
    })),
    nextAllowedAction: "resume-worker",
  };
  const interruptedRelative = `${input.config.artifactRoot.replaceAll("\\", "/")}/safety-demonstration/interrupted-state-${artifactSuffix}.json`;
  const interruptedStore = new StateStore(
    input.repositoryRoot,
    interruptedRelative,
    now,
  );
  await interruptedStore.initialize(state);
  const restarted = await new StateStore(
    input.repositoryRoot,
    interruptedRelative,
    now,
  ).load();
  if (!restarted)
    throw new Error("Interrupted state did not survive process restart.");
  const restartedMilestone = restarted.milestones[0];
  if (!restartedMilestone)
    throw new Error("Interrupted state lost its active milestone.");

  const retry = decideRetry({
    milestone: restartedMilestone,
    config: input.config,
    failureKind: "product",
    consecutiveInfrastructureFailures: 0,
  });
  const recoveredLineage = restartedMilestone.workerThreadLineage.at(-1);
  if (
    retry.action !== "retry" ||
    restartedMilestone.workerThreadId !== "mock-worker-thread-persisted" ||
    recoveredLineage?.model !== "gpt-5.6-sol" ||
    recoveredLineage.reasoningEffort !== "xhigh" ||
    !restartedMilestone.retryFeedback
  )
    throw new Error(
      "Injected verification failure did not retain same-thread retry feedback.",
    );
  if (recoveryAction(restartedMilestone) !== "resume-worker")
    throw new Error(
      "Interrupted running state did not recover to resume-worker.",
    );

  const atLimit: MilestoneRecord = {
    ...restartedMilestone,
    attempts: input.config.limits.attemptsPerMilestone,
  };
  const stopped = decideRetry({
    milestone: atLimit,
    config: input.config,
    failureKind: "product",
    consecutiveInfrastructureFailures: 0,
  });
  if (stopped.action !== "escalate")
    throw new Error("Retry limit did not stop the synthetic milestone.");

  const protectedDiff = enforceDiffPolicy(
    ["SKI_TYCOON_GOAL.md"],
    proposal,
    input.config.protectedPaths,
  );
  if (protectedDiff.allowed || protectedDiff.protectedChanges.length !== 1)
    throw new Error("Protected-file injection was not rejected.");

  const artifactPath = resolve(
    input.artifactDirectory,
    `safety-demonstration-${artifactSuffix}.json`,
  );
  const result: SafetyDemonstrationResult = {
    schemaVersion: "1.0.0",
    status: "PASS",
    generatedAt,
    scenarios: [
      {
        id: "verification-failure-same-thread-retry",
        status: "PASS",
        evidence: {
          decision: retry,
          workerThreadId: restartedMilestone.workerThreadId,
          workerThreadLineage: restartedMilestone.workerThreadLineage,
          feedbackPersisted: true,
        },
      },
      {
        id: "interrupted-run-recovery",
        status: "PASS",
        evidence: {
          reloadedRevision: restarted.revision,
          recoveryAction: recoveryAction(restartedMilestone),
          persistedStatePath: interruptedStore.path,
        },
      },
      {
        id: "retry-limit-stop",
        status: "PASS",
        evidence: stopped,
      },
      {
        id: "protected-file-rejection",
        status: "PASS",
        evidence: protectedDiff,
      },
    ],
    artifactPath,
  };
  await atomicWriteJson(artifactPath, result);
  return result;
}
