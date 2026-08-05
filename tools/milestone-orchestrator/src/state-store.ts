import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  STATE_SCHEMA_VERSION,
  type OrchestratorState,
  type ProtectedFileRecord,
  type RunState,
} from "./contracts.js";
import { assertOrchestratorState } from "./schema.js";

export interface AtomicWriteHooks {
  readonly beforeRename?: (
    temporaryPath: string,
    targetPath: string,
  ) => void | Promise<void>;
}

export async function atomicWriteJson(
  targetPath: string,
  value: unknown,
  hooks: AtomicWriteHooks = {},
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporaryPath, "wx");
  let closed = false;
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    closed = true;
    await hooks.beforeRename?.(temporaryPath, targetPath);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function emptyUsage() {
  return {
    codexInvocations: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  } as const;
}

export function createIdleRun(): RunState {
  return {
    id: null,
    status: "idle",
    startedAt: null,
    finishedAt: null,
    deadlineAt: null,
    milestonesProcessed: 0,
    consecutiveInfrastructureFailures: 0,
    usage: emptyUsage(),
    plannerThreadIds: [],
    agentInvocations: [],
    stopReason: null,
    artifactDirectory: null,
  };
}

function legacyProposalProvenance(
  milestone: Record<string, unknown>,
): Record<string, unknown> {
  const existing = milestone["proposalProvenance"];
  if (
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing)
  )
    return existing as Record<string, unknown>;
  const timestamps = milestone["timestamps"];
  const proposedAt =
    typeof timestamps === "object" &&
    timestamps !== null &&
    !Array.isArray(timestamps) &&
    typeof (timestamps as Record<string, unknown>)["proposedAt"] === "string"
      ? (timestamps as Record<string, unknown>)["proposedAt"]
      : "1970-01-01T00:00:00.000Z";
  return {
    schemaVersion: "1.0.0",
    source: "legacy-unrecorded",
    sourcePath: null,
    sourceSha256: null,
    plannerThreadId: null,
    recordedAt: proposedAt,
    reason: "State schema predates proposal provenance.",
  };
}

export function migrateOrchestratorState(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  let migrated = value as Record<string, unknown>;
  if (migrated["schemaVersion"] === "1.0.0") {
    const run = migrated["run"] as Record<string, unknown> | undefined;
    const milestones = Array.isArray(migrated["milestones"])
      ? migrated["milestones"].map((entry) => {
          if (
            typeof entry !== "object" ||
            entry === null ||
            Array.isArray(entry)
          )
            return entry;
          const milestone = entry as Record<string, unknown>;
          const threadId =
            typeof milestone["workerThreadId"] === "string"
              ? milestone["workerThreadId"]
              : null;
          const timestamps = milestone["timestamps"] as
            Record<string, unknown> | undefined;
          const attempt =
            typeof milestone["attempts"] === "number" &&
            Number.isSafeInteger(milestone["attempts"]) &&
            milestone["attempts"] > 0
              ? milestone["attempts"]
              : 1;
          return {
            ...milestone,
            workerThreadLineage:
              threadId === null
                ? []
                : [
                    {
                      threadId,
                      role: "feature-worker-initial",
                      model: "legacy-unrecorded",
                      reasoningEffort: "legacy-unrecorded",
                      startedAt:
                        typeof timestamps?.["startedAt"] === "string"
                          ? timestamps["startedAt"]
                          : typeof timestamps?.["proposedAt"] === "string"
                            ? timestamps["proposedAt"]
                            : "1970-01-01T00:00:00.000Z",
                      attempt,
                      replacesThreadId: null,
                      replacementReason: null,
                    },
                  ],
            workerPolicy: {
              activeRole: "feature-worker-initial",
              escalated: false,
              escalationReason: null,
              escalatedAt: null,
              failures: [],
            },
          };
        })
      : migrated["milestones"];
    migrated = {
      ...migrated,
      schemaVersion: "1.1.0",
      milestones,
      run:
        run === undefined
          ? run
          : {
              ...run,
              agentInvocations: [],
            },
    };
  }

  if (migrated["schemaVersion"] === "1.1.0") {
    const milestones = Array.isArray(migrated["milestones"])
      ? migrated["milestones"].map((entry) => {
          if (
            typeof entry !== "object" ||
            entry === null ||
            Array.isArray(entry)
          )
            return entry;
          const milestone = entry as Record<string, unknown>;
          const workspace = milestone["workspace"];
          return {
            ...milestone,
            proposalProvenance: legacyProposalProvenance(milestone),
            workspace:
              typeof workspace === "object" &&
              workspace !== null &&
              !Array.isArray(workspace)
                ? {
                    ...(workspace as Record<string, unknown>),
                    cleanup: {
                      schemaVersion: "1.0.0",
                      status: "legacy-preserved",
                      reason: "legacy-pre-policy",
                      requestedAt: null,
                      completedAt: null,
                      nodeModulesRemovedAt: null,
                      diagnosticArchivePath: null,
                      error: null,
                    },
                  }
                : workspace,
          };
        })
      : migrated["milestones"];
    migrated = {
      ...migrated,
      schemaVersion: "1.2.0",
      milestones,
      evidenceRetention: {
        schemaVersion: "1.0.0",
        initializedAt: null,
        legacyRunIds: [],
        lastPrunedAt: null,
        lastReportPath: null,
      },
      requiredNextVerticalConsumer: null,
    };
  }
  if (migrated["schemaVersion"] === "1.2.0") {
    const milestones = Array.isArray(migrated["milestones"])
      ? migrated["milestones"].map((entry) => {
          if (
            typeof entry !== "object" ||
            entry === null ||
            Array.isArray(entry)
          )
            return entry;
          const milestone = entry as Record<string, unknown>;
          return {
            ...milestone,
            proposalProvenance: legacyProposalProvenance(milestone),
          };
        })
      : migrated["milestones"];
    migrated = {
      ...migrated,
      schemaVersion: "1.3.0",
      milestones,
      requiredNextVerticalConsumer:
        "requiredNextVerticalConsumer" in migrated
          ? migrated["requiredNextVerticalConsumer"]
          : null,
      controllerHistory: [],
      reconciliation: { active: null, history: [] },
    };
  }
  if (migrated["schemaVersion"] === "1.3.0") {
    const milestones = Array.isArray(migrated["milestones"])
      ? migrated["milestones"].map((entry) => {
          if (
            typeof entry !== "object" ||
            entry === null ||
            Array.isArray(entry)
          )
            return entry;
          const milestone = entry as Record<string, unknown>;
          const summaries = Array.isArray(milestone["verificationSummaries"])
            ? milestone["verificationSummaries"].map((summary) =>
                typeof summary === "object" &&
                summary !== null &&
                !Array.isArray(summary)
                  ? {
                      ...(summary as Record<string, unknown>),
                      schemaVersion: "1.1.0",
                      candidate: null,
                      authoritativeResultSha256: null,
                    }
                  : summary,
              )
            : milestone["verificationSummaries"];
          return { ...milestone, verificationSummaries: summaries };
        })
      : migrated["milestones"];
    migrated = {
      ...migrated,
      schemaVersion: STATE_SCHEMA_VERSION,
      milestones,
    };
  }
  return migrated;
}

export function createInitialState(input: {
  readonly repositoryRoot: string;
  readonly targetBranch: string;
  readonly verifiedCommit: string;
  readonly protectedFiles: readonly ProtectedFileRecord[];
  readonly now: string;
  readonly legacyEvidenceRunIds?: readonly string[];
}): OrchestratorState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision: 0,
    repository: {
      root: resolve(input.repositoryRoot),
      targetBranch: input.targetBranch,
      verifiedCommit: input.verifiedCommit,
      protectedFiles: input.protectedFiles,
    },
    queue: [],
    milestones: [],
    activeMilestoneId: null,
    requiredNextVerticalConsumer: null,
    run: createIdleRun(),
    hiddenValidation: {
      lastCheckpointAt: null,
      lastMilestoneId: null,
    },
    evidenceRetention: {
      schemaVersion: "1.0.0",
      initializedAt: input.now,
      legacyRunIds: [...(input.legacyEvidenceRunIds ?? [])].sort(),
      lastPrunedAt: null,
      lastReportPath: null,
    },
    controllerHistory: [],
    reconciliation: { active: null, history: [] },
    nextAllowedAction: "plan",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export class StateStore {
  readonly path: string;

  constructor(
    repositoryRoot: string,
    relativePath: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.path = resolve(repositoryRoot, relativePath);
  }

  async load(): Promise<OrchestratorState | null> {
    try {
      return assertOrchestratorState(
        migrateOrchestratorState(
          JSON.parse(await readFile(this.path, "utf8")) as unknown,
        ),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return null;
      throw error;
    }
  }

  async initialize(state: OrchestratorState): Promise<OrchestratorState> {
    const existing = await this.load();
    if (existing) return existing;
    assertOrchestratorState(state);
    await atomicWriteJson(this.path, state);
    return state;
  }

  async save(state: OrchestratorState): Promise<OrchestratorState> {
    assertOrchestratorState(state);
    const saved: OrchestratorState = {
      ...state,
      revision: state.revision + 1,
      updatedAt: this.now(),
    };
    assertOrchestratorState(saved);
    await atomicWriteJson(this.path, saved);
    return saved;
  }
}
