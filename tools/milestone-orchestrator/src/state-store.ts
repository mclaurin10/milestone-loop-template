import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  LEGACY_VERIFICATION_SUMMARY_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  type OrchestratorState,
  type ProtectedFileRecord,
  type RunState,
} from "./contracts.js";
import { ensureContainedDirectory, strictlyContained } from "./path-safety.js";
import { STATE_REF } from "./private-ref-store.js";
import { assertOrchestratorState } from "./schema.js";
import { assertPendingOperationStateTransition } from "./operation-intent.js";
import {
  GitStateGenerationStore,
  type StateGeneration,
} from "./state-generation-store.js";

export interface AtomicWriteHooks {
  readonly temporaryPath?: string;
  readonly beforeRename?: (
    temporaryPath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly replaceFile?: (
    temporaryPath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly waitBeforeReplaceRetry?: (delayMs: number) => void | Promise<void>;
}

export interface StateStoreHooks extends AtomicWriteHooks {
  readonly afterObservedGeneration?: (observation: {
    readonly objectId: string | null;
    readonly revision: number;
  }) => Promise<void> | void;
  readonly beforeObjectCreation?: () => Promise<void> | void;
  readonly afterObjectCreated?: (generation: {
    readonly objectId: string;
    readonly revision: number;
  }) => Promise<void> | void;
  readonly afterReferenceUpdated?: (generation: {
    readonly objectId: string;
    readonly revision: number;
  }) => Promise<void> | void;
  readonly beforeMirrorWrite?: (
    state: OrchestratorState,
  ) => Promise<void> | void;
  readonly afterMirrorWrite?: (
    state: OrchestratorState,
  ) => Promise<void> | void;
}

export interface StateStoreInspection {
  readonly reference: typeof STATE_REF;
  readonly canonicalGeneration: string | null;
  readonly revision: number | null;
  readonly source: "canonical" | "legacy" | "absent";
  readonly mirror:
    "current" | "legacy" | "missing" | "stale-or-malformed" | "unsafe";
}

const MAX_REPLACE_RETRIES = 8;
const REPLACE_RETRY_DELAY_MS = 25;
const TRANSIENT_REPLACE_CODES = new Set([
  "EACCES",
  "EBUSY",
  "ENOTEMPTY",
  "EPERM",
]);

async function replaceFileWithRetry(
  temporaryPath: string,
  targetPath: string,
  hooks: AtomicWriteHooks,
): Promise<void> {
  const replaceFile = hooks.replaceFile ?? rename;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await replaceFile(temporaryPath, targetPath);
      return;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (
        attempt >= MAX_REPLACE_RETRIES ||
        code === undefined ||
        !TRANSIENT_REPLACE_CODES.has(code)
      )
        throw error;
      const delayMs = REPLACE_RETRY_DELAY_MS * (attempt + 1);
      if (hooks.waitBeforeReplaceRetry)
        await hooks.waitBeforeReplaceRetry(delayMs);
      else await delay(delayMs);
    }
  }
}

export class StaleStateError extends Error {
  readonly path: string;
  readonly expectedRevision: number;
  readonly actualRevision: number | null;
  readonly expectedGeneration: string | null;
  readonly actualGeneration: string | null;

  constructor(
    path: string,
    expectedRevision: number,
    actualRevision: number | null,
    expectedGeneration: string | null = null,
    actualGeneration: string | null = null,
  ) {
    super(
      actualRevision === null
        ? `Canonical controller state is missing at ${STATE_REF}; mutations must go through initialization.`
        : `Canonical controller state advanced under this process (generation ${actualGeneration ?? "unknown"}, revision ${actualRevision}; loaded generation ${expectedGeneration ?? "none"}, revision ${expectedRevision}). Another controller likely ran; re-run the command to load durable state. No merge was attempted.`,
    );
    this.name = "StaleStateError";
    this.path = path;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.expectedGeneration = expectedGeneration;
    this.actualGeneration = actualGeneration;
  }
}

export async function atomicWriteJson(
  targetPath: string,
  value: unknown,
  hooks: AtomicWriteHooks = {},
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath =
    hooks.temporaryPath ?? `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporaryPath, "wx");
  let closed = false;
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    closed = true;
    await hooks.beforeRename?.(temporaryPath, targetPath);
    await replaceFileWithRetry(temporaryPath, targetPath, hooks);
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function exclusiveWriteSerialized(
  targetPath: string,
  serialized: string,
  hooks: AtomicWriteHooks = {},
): Promise<"created" | "exists"> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporaryPath, "wx");
  let closed = false;
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    closed = true;
    await hooks.beforeRename?.(temporaryPath, targetPath);
    // link keeps wx-exclusive semantics (EEXIST when the target exists) while
    // publishing fully written, fsynced bytes - no reader can observe a
    // partially written target.
    await link(temporaryPath, targetPath);
    return "created";
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    if (
      closed &&
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    )
      return "exists";
    throw error;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
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
      schemaVersion: "1.4.0",
      milestones,
    };
  }
  if (migrated["schemaVersion"] === "1.4.0") {
    migrated = {
      ...migrated,
      schemaVersion: "1.5.0",
      pendingOperation: null,
    };
  }
  if (migrated["schemaVersion"] === "1.5.0") {
    migrated = {
      ...migrated,
      schemaVersion: "1.6.0",
    };
  }
  if (migrated["schemaVersion"] === "1.6.0") {
    migrated = {
      ...migrated,
      schemaVersion: "1.7.0",
    };
  }
  if (migrated["schemaVersion"] === "1.7.0")
    migrated = { ...migrated, schemaVersion: "1.8.0" };
  if (migrated["schemaVersion"] === "1.8.0") {
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
                !Array.isArray(summary) &&
                (summary as Record<string, unknown>)["schemaVersion"] ===
                  LEGACY_VERIFICATION_SUMMARY_SCHEMA_VERSION
                  ? {
                      ...(summary as Record<string, unknown>),
                      schemaVersion: "1.2.0",
                      executionProvider: null,
                    }
                  : summary,
              )
            : milestone["verificationSummaries"];
          return { ...milestone, verificationSummaries: summaries };
        })
      : migrated["milestones"];
    const pendingOperation =
      typeof migrated["pendingOperation"] === "object" &&
      migrated["pendingOperation"] !== null &&
      !Array.isArray(migrated["pendingOperation"]) &&
      (migrated["pendingOperation"] as Record<string, unknown>)["kind"] ===
        "target-integrate"
        ? (() => {
            const operation = migrated["pendingOperation"] as Record<
              string,
              unknown
            >;
            const observedAt =
              typeof operation["updatedAt"] === "string"
                ? operation["updatedAt"]
                : typeof operation["createdAt"] === "string"
                  ? operation["createdAt"]
                  : "1970-01-01T00:00:00.000Z";
            const preservedPaths = [
              operation["workspacePath"],
              operation["outcomePath"],
              operation["outcomeTemporaryPath"],
            ].filter((path): path is string => typeof path === "string");
            return {
              ...operation,
              executionProvider: null,
              phase: "blocked",
              diagnostic: {
                classification: "execution-provider-ineligible",
                message:
                  "Legacy target integration predates execution-provider attestation and cannot resume or adopt.",
                observedAt,
                targetHead: null,
                preservedPaths,
                quarantinePath: null,
              },
            };
          })()
        : migrated["pendingOperation"];
    const migrateReconciliationRecord = (record: unknown): unknown => {
      if (
        typeof record !== "object" ||
        record === null ||
        Array.isArray(record)
      )
        return record;
      const value = record as Record<string, unknown>;
      const exactVerification =
        typeof value["exactVerification"] === "object" &&
        value["exactVerification"] !== null &&
        !Array.isArray(value["exactVerification"])
          ? {
              ...(value["exactVerification"] as Record<string, unknown>),
              executionProvider: null,
            }
          : value["exactVerification"];
      return { ...value, exactVerification };
    };
    const reconciliation =
      typeof migrated["reconciliation"] === "object" &&
      migrated["reconciliation"] !== null &&
      !Array.isArray(migrated["reconciliation"])
        ? {
            ...(migrated["reconciliation"] as Record<string, unknown>),
            active: migrateReconciliationRecord(
              (migrated["reconciliation"] as Record<string, unknown>)["active"],
            ),
            history: Array.isArray(
              (migrated["reconciliation"] as Record<string, unknown>)[
                "history"
              ],
            )
              ? (
                  (migrated["reconciliation"] as Record<string, unknown>)[
                    "history"
                  ] as unknown[]
                ).map(migrateReconciliationRecord)
              : (migrated["reconciliation"] as Record<string, unknown>)[
                  "history"
                ],
          }
        : migrated["reconciliation"];
    migrated = {
      ...migrated,
      schemaVersion: STATE_SCHEMA_VERSION,
      milestones,
      pendingOperation,
      reconciliation,
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
    pendingOperation: null,
    nextAllowedAction: "plan",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export class StateStore {
  readonly repositoryRoot: string;
  readonly path: string;
  readonly reference = STATE_REF;
  private readonly generations: GitStateGenerationStore;
  private loadedGeneration: StateGeneration | null = null;
  private legacySourceJson: string | null = null;
  private loadedSource:
    "unloaded" | "absent" | "legacy" | "read-only-canonical" | "canonical" =
    "unloaded";

  constructor(
    repositoryRoot: string,
    relativePath: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.repositoryRoot = resolve(repositoryRoot);
    this.path = resolve(this.repositoryRoot, relativePath);
    if (!strictlyContained(this.repositoryRoot, this.path))
      throw new Error(
        `Controller state mirror escapes the repository: ${this.path}.`,
      );
    this.generations = new GitStateGenerationStore(
      this.repositoryRoot,
      migrateOrchestratorState,
    );
  }

  private assertPendingOperationLineage(generation: StateGeneration): void {
    const operation = generation.state.pendingOperation;
    if (operation === null) return;
    if (operation.inputStateRevision >= generation.state.revision)
      throw new Error(
        `Pending operation ${operation.id} is not descended from its recorded input revision.`,
      );
    let cursor = generation;
    while (cursor.state.revision > operation.inputStateRevision) {
      if (cursor.state.pendingOperation?.id !== operation.id)
        throw new Error(
          `Pending operation ${operation.id} has discontinuous state-generation history.`,
        );
      const previousId = cursor.metadata.previousGeneration;
      if (previousId === null)
        throw new Error(
          `Pending operation ${operation.id} cannot reach its recorded input generation.`,
        );
      const previous = this.generations.readGeneration(previousId);
      if (previous.objectId === operation.inputStateGeneration) {
        if (
          previous.state.revision !== operation.inputStateRevision ||
          previous.state.pendingOperation !== null
        )
          throw new Error(
            `Pending operation ${operation.id} has an invalid recorded input generation.`,
          );
        return;
      }
      cursor = previous;
    }
    throw new Error(
      `Pending operation ${operation.id} is not descended from generation ${operation.inputStateGeneration}.`,
    );
  }

  private rememberGeneration(generation: StateGeneration): OrchestratorState {
    this.assertPendingOperationLineage(generation);
    this.loadedGeneration = generation;
    this.legacySourceJson = null;
    this.loadedSource = "canonical";
    return generation.state;
  }

  private async mirrorDirectoryStatus(): Promise<
    "present" | "missing" | "unsafe"
  > {
    const directory = dirname(this.path);
    try {
      const [rootMetadata, directoryMetadata] = await Promise.all([
        lstat(this.repositoryRoot),
        directory === this.repositoryRoot
          ? lstat(this.repositoryRoot)
          : lstat(directory),
      ]);
      if (
        !rootMetadata.isDirectory() ||
        rootMetadata.isSymbolicLink() ||
        !directoryMetadata.isDirectory() ||
        directoryMetadata.isSymbolicLink()
      )
        return "unsafe";
      const [resolvedRoot, resolvedDirectory] = await Promise.all([
        realpath(this.repositoryRoot),
        realpath(directory),
      ]);
      return resolvedDirectory === resolvedRoot ||
        strictlyContained(resolvedRoot, resolvedDirectory)
        ? "present"
        : "unsafe";
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return "missing";
      throw error;
    }
  }

  private unsafeMirrorError(): Error {
    return new Error(
      `Controller state mirror at ${this.path} traverses or names an unsafe linked path.`,
    );
  }

  private async readLegacyMirror(): Promise<{
    readonly state: OrchestratorState;
    readonly raw: string;
  } | null> {
    const directoryStatus = await this.mirrorDirectoryStatus();
    if (directoryStatus === "missing") return null;
    if (directoryStatus === "unsafe") throw this.unsafeMirrorError();
    try {
      const metadata = await lstat(this.path);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new Error(
          `Legacy controller state at ${this.path} is not a regular file; refusing to import it.`,
        );
      const raw = await readFile(this.path, "utf8");
      const state = assertOrchestratorState(
        migrateOrchestratorState(JSON.parse(raw) as unknown),
      );
      return { state, raw };
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

  private async mirrorMatches(state: OrchestratorState): Promise<boolean> {
    const directoryStatus = await this.mirrorDirectoryStatus();
    if (directoryStatus === "missing") return false;
    if (directoryStatus === "unsafe") throw this.unsafeMirrorError();
    try {
      const metadata = await lstat(this.path);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw this.unsafeMirrorError();
      return (
        (await readFile(this.path, "utf8")) ===
        `${JSON.stringify(state, null, 2)}\n`
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return false;
      throw error;
    }
  }

  private async mirrorStatus(
    state: OrchestratorState,
  ): Promise<StateStoreInspection["mirror"]> {
    const directoryStatus = await this.mirrorDirectoryStatus();
    if (directoryStatus === "missing") return "missing";
    if (directoryStatus === "unsafe") return "unsafe";
    try {
      const metadata = await lstat(this.path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) return "unsafe";
      return (await readFile(this.path, "utf8")) ===
        `${JSON.stringify(state, null, 2)}\n`
        ? "current"
        : "stale-or-malformed";
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return "missing";
      throw error;
    }
  }

  private async writeMirror(
    state: OrchestratorState,
    hooks: StateStoreHooks,
  ): Promise<void> {
    if (await this.mirrorMatches(state)) return;
    const directory = dirname(this.path);
    if (directory === this.repositoryRoot) {
      const rootMetadata = await lstat(this.repositoryRoot);
      if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
        throw new Error(
          `Controller repository root is not a real directory: ${this.repositoryRoot}.`,
        );
    } else await ensureContainedDirectory(this.repositoryRoot, directory);
    await hooks.beforeMirrorWrite?.(state);
    await atomicWriteJson(this.path, state, hooks);
    await hooks.afterMirrorWrite?.(state);
  }

  private staleError(
    expectedRevision: number,
    expectedGeneration: string | null,
  ): StaleStateError {
    const actual = this.generations.readCurrent();
    return new StaleStateError(
      this.path,
      expectedRevision,
      actual?.state.revision ?? null,
      expectedGeneration,
      actual?.objectId ?? null,
    );
  }

  private async publishInitial(
    state: OrchestratorState,
    hooks: StateStoreHooks,
    legacySourceJson: string | null = null,
    repairMirror = true,
  ): Promise<OrchestratorState> {
    await hooks.afterObservedGeneration?.({
      objectId: null,
      revision: state.revision,
    });
    await hooks.beforeObjectCreation?.();
    const candidate = this.generations.createGeneration(
      state,
      null,
      legacySourceJson,
    );
    await hooks.afterObjectCreated?.({
      objectId: candidate.objectId,
      revision: state.revision,
    });
    if (!this.generations.publish(null, candidate.objectId)) {
      const winner = this.generations.readCurrent();
      if (!winner)
        throw new Error(
          `Canonical controller state at ${STATE_REF} changed during initialization and then disappeared.`,
        );
      const winnerState = this.rememberGeneration(winner);
      if (repairMirror) await this.writeMirror(winnerState, hooks);
      return winnerState;
    }
    this.rememberGeneration(candidate);
    await hooks.afterReferenceUpdated?.({
      objectId: candidate.objectId,
      revision: state.revision,
    });
    if (repairMirror) await this.writeMirror(state, hooks);
    return state;
  }

  async load(): Promise<OrchestratorState | null> {
    const canonical = this.generations.readCurrent();
    if (canonical) {
      this.assertPendingOperationLineage(canonical);
      this.loadedGeneration = null;
      this.legacySourceJson = null;
      this.loadedSource = "read-only-canonical";
      return canonical.state;
    }
    const legacy = await this.readLegacyMirror();
    this.loadedGeneration = null;
    this.legacySourceJson = legacy?.raw ?? null;
    this.loadedSource = legacy ? "legacy" : "absent";
    return legacy?.state ?? null;
  }

  async inspect(): Promise<StateStoreInspection> {
    const canonical = this.generations.readCurrent();
    if (canonical) {
      this.assertPendingOperationLineage(canonical);
      return {
        reference: STATE_REF,
        canonicalGeneration: canonical.objectId,
        revision: canonical.state.revision,
        source: "canonical",
        mirror: await this.mirrorStatus(canonical.state),
      };
    }
    const legacy = await this.readLegacyMirror();
    return legacy
      ? {
          reference: STATE_REF,
          canonicalGeneration: null,
          revision: legacy.state.revision,
          source: "legacy",
          mirror: "legacy",
        }
      : {
          reference: STATE_REF,
          canonicalGeneration: null,
          revision: null,
          source: "absent",
          mirror: "missing",
        };
  }

  async loadForMutation(
    hooks: StateStoreHooks = {},
  ): Promise<OrchestratorState | null> {
    const canonical = this.generations.readCurrent();
    if (canonical) {
      const state = this.rememberGeneration(canonical);
      await this.writeMirror(state, hooks);
      return state;
    }
    const legacy = await this.readLegacyMirror();
    if (!legacy) {
      this.loadedGeneration = null;
      this.legacySourceJson = null;
      this.loadedSource = "absent";
      return null;
    }
    return this.publishInitial(legacy.state, hooks, legacy.raw, false);
  }

  async initialize(
    state: OrchestratorState,
    hooks: StateStoreHooks = {},
  ): Promise<OrchestratorState> {
    assertOrchestratorState(state);
    if (state.pendingOperation !== null)
      throw new Error(
        "Controller state cannot initialize with a pending operation.",
      );
    const canonical = this.generations.readCurrent();
    if (canonical) {
      const existing = this.rememberGeneration(canonical);
      await this.writeMirror(existing, hooks);
      return existing;
    }
    const legacy = await this.readLegacyMirror();
    return this.publishInitial(
      legacy?.state ?? state,
      hooks,
      legacy?.raw ?? null,
      legacy === null,
    );
  }

  sourceStateBytes(): Buffer {
    if (this.loadedSource === "canonical" && this.loadedGeneration)
      return Buffer.from(
        this.loadedGeneration.legacySourceJson ??
          this.loadedGeneration.stateJson,
        "utf8",
      );
    if (this.loadedSource === "legacy" && this.legacySourceJson !== null)
      return Buffer.from(this.legacySourceJson, "utf8");
    throw new Error("Controller source state has not been loaded.");
  }

  mutationGeneration(): {
    readonly objectId: string;
    readonly revision: number;
  } {
    if (this.loadedSource !== "canonical" || !this.loadedGeneration)
      throw new Error(
        "A mutation generation is available only after initialize() or loadForMutation().",
      );
    return {
      objectId: this.loadedGeneration.objectId,
      revision: this.loadedGeneration.state.revision,
    };
  }

  async save(
    state: OrchestratorState,
    hooks: StateStoreHooks = {},
  ): Promise<OrchestratorState> {
    assertOrchestratorState(state);
    const expected = this.loadedGeneration;
    if (this.loadedSource !== "canonical" || !expected) {
      const actual = this.generations.readCurrent();
      if (!actual) throw this.staleError(state.revision, null);
      throw new Error(
        "Controller state publication requires initialize() or loadForMutation(); read-only load() never authorizes a write.",
      );
    }
    if (expected.state.revision !== state.revision)
      throw this.staleError(state.revision, expected?.objectId ?? null);
    const observedObjectId = this.generations.readReference();
    if (observedObjectId !== expected.objectId)
      throw this.staleError(state.revision, expected.objectId);
    assertPendingOperationStateTransition(
      expected.state,
      state,
      expected.objectId,
    );
    await hooks.afterObservedGeneration?.({
      objectId: expected.objectId,
      revision: expected.state.revision,
    });
    const saved: OrchestratorState = {
      ...state,
      revision: state.revision + 1,
      updatedAt: this.now(),
    };
    assertOrchestratorState(saved);
    await hooks.beforeObjectCreation?.();
    const candidate = this.generations.createGeneration(
      saved,
      expected.objectId,
    );
    await hooks.afterObjectCreated?.({
      objectId: candidate.objectId,
      revision: saved.revision,
    });
    if (!this.generations.publish(expected.objectId, candidate.objectId))
      throw this.staleError(state.revision, expected.objectId);
    this.rememberGeneration(candidate);
    await hooks.afterReferenceUpdated?.({
      objectId: candidate.objectId,
      revision: saved.revision,
    });
    await this.writeMirror(saved, hooks);
    return saved;
  }
}
