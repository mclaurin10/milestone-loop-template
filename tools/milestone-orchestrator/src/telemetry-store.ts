import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { strictlyContained } from "./path-safety.js";
import { redactSensitiveText, redactSensitiveValue } from "./redaction.js";
import { atomicWriteJson } from "./state-store.js";
import {
  TELEMETRY_AVAILABILITY,
  TELEMETRY_PHASES,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_STATUSES,
  assertTelemetryEvent,
  redactTelemetryArgv,
  telemetryAvailability,
} from "./telemetry-contracts.js";
import type {
  TelemetryActivePhase,
  TelemetryAgent,
  TelemetryArtifacts,
  TelemetryAvailability,
  TelemetryBaselineComparison,
  TelemetryCandidate,
  TelemetryCommand,
  TelemetryEvent,
  TelemetryFailureClassification,
  TelemetryManifest,
  TelemetryManifestEvent,
  TelemetryMeasurementAvailability,
  TelemetryPhase,
  TelemetryRetry,
  TelemetrySource,
  TelemetryStatus,
  TelemetrySummary,
  TelemetryTestCounts,
} from "./telemetry-contracts.js";

type JsonWriter = typeof atomicWriteJson;

export interface TelemetryStoreOptions {
  readonly repositoryRoot: string;
  readonly directory: string;
  readonly runId: string;
  readonly source: TelemetrySource;
  readonly now?: () => Date;
  readonly hrtime?: () => bigint;
  readonly writeJson?: JsonWriter;
}

export interface TelemetryEventDetails {
  readonly status: TelemetryStatus | null;
  readonly reason?: string | null;
  readonly candidate?: TelemetryCandidate | null;
  readonly command?: TelemetryCommand | null;
  readonly tests?: TelemetryTestCounts | null;
  readonly artifacts?: TelemetryArtifacts | null;
  readonly retry?: TelemetryRetry | null;
  readonly agent?: TelemetryAgent | null;
  readonly baselineComparison?: TelemetryBaselineComparison | null;
  readonly measurementAvailability?: Partial<TelemetryMeasurementAvailability>;
}

export interface BeginTelemetryPhaseInput {
  readonly phase: TelemetryPhase;
  readonly eventType: string;
  readonly operationId?: string;
  readonly candidate?: TelemetryCandidate | null;
  readonly measurementAvailability?: Partial<TelemetryMeasurementAvailability>;
}

export interface FinishTelemetryPhaseInput extends TelemetryEventDetails {
  readonly eventType?: string;
}

export interface CommandTelemetryMeasurement {
  readonly operationId?: string;
  readonly phase?: TelemetryPhase;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationNanoseconds: string;
  readonly commandId: string;
  readonly argv: readonly string[];
  readonly checkSetId?: string | null;
  readonly selectedCheckIds?: readonly string[];
  readonly actualCheckIds?: readonly string[];
  readonly status: TelemetryStatus;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly candidate?: TelemetryCandidate | null;
  readonly tests?: TelemetryTestCounts | null;
  readonly artifacts?: TelemetryArtifacts | null;
  readonly retryAttempt?: number | null;
  readonly failureClassification?: TelemetryFailureClassification | null;
  readonly reason?: string | null;
}

export interface TelemetrySpan {
  readonly operationId: string;
  finish(input: FinishTelemetryPhaseInput): Promise<TelemetryEvent>;
}

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function safeRunId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))
    throw new Error("Telemetry run ID contains unsafe characters.");
  return value;
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function relativePath(root: string, path: string): string {
  const result = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
  if (
    result.length === 0 ||
    isAbsolute(result) ||
    result.split("/").includes("..")
  )
    throw new Error(`Telemetry reference escapes the repository: ${path}.`);
  return result;
}

function payloadAvailability(
  input: TelemetryEventDetails,
  duration: TelemetryAvailability,
): TelemetryMeasurementAvailability {
  const agent = input.agent ?? null;
  return telemetryAvailability("not-applicable", {
    durationNanoseconds: duration,
    candidate: input.candidate ? "measured" : "not-applicable",
    command: input.command ? "measured" : "not-applicable",
    tests: input.tests ? "measured" : "not-applicable",
    artifacts: input.artifacts ? "measured" : "not-applicable",
    retry: input.retry ? "measured" : "not-applicable",
    agentThread: agent?.threadId ? "measured" : "not-applicable",
    agentRequestedAssignment:
      agent?.requestedModel && agent.requestedReasoningEffort
        ? "measured"
        : "not-applicable",
    agentResolvedAssignment:
      agent?.resolvedModel && agent.resolvedReasoningEffort
        ? "measured"
        : agent
          ? "sdk-unavailable"
          : "not-applicable",
    agentUsage:
      agent?.inputTokens !== null &&
      agent?.inputTokens !== undefined &&
      agent.cachedInputTokens !== null &&
      agent.outputTokens !== null &&
      agent.reasoningOutputTokens !== null
        ? "measured"
        : agent
          ? "sdk-unavailable"
          : "not-applicable",
    baselineComparison: input.baselineComparison
      ? "measured"
      : "not-applicable",
    ...input.measurementAvailability,
  });
}

function phaseCounts(): Record<TelemetryPhase, number> {
  return Object.fromEntries(
    TELEMETRY_PHASES.map((phase) => [phase, 0]),
  ) as Record<TelemetryPhase, number>;
}

function statusCounts(): Record<TelemetryStatus, number> {
  return Object.fromEntries(
    TELEMETRY_STATUSES.map((status) => [status, 0]),
  ) as Record<TelemetryStatus, number>;
}

function availabilityCounts(): Record<TelemetryAvailability, number> {
  return Object.fromEntries(
    TELEMETRY_AVAILABILITY.map((reason) => [reason, 0]),
  ) as Record<TelemetryAvailability, number>;
}

async function ensureSafeDirectory(
  repositoryRoot: string,
  requestedDirectory: string,
): Promise<string> {
  const root = resolve(repositoryRoot);
  const artifactRoot = resolve(root, "artifacts");
  const directory = resolve(requestedDirectory);
  if (!strictlyContained(artifactRoot, directory))
    throw new Error("Telemetry directory must be inside repository artifacts.");
  await mkdir(artifactRoot, { recursive: true });
  const artifactMetadata = await lstat(artifactRoot);
  if (!artifactMetadata.isDirectory() || artifactMetadata.isSymbolicLink())
    throw new Error("Telemetry artifact root must be a non-symlink directory.");
  let cursor = artifactRoot;
  for (const part of relative(artifactRoot, directory).split(/[\\/]/)) {
    if (!part) continue;
    cursor = resolve(cursor, part);
    try {
      const metadata = await lstat(cursor);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error(
          `Telemetry path component must be a non-symlink directory: ${cursor}.`,
        );
    } catch (error) {
      if (!missing(error)) throw error;
      await mkdir(cursor);
    }
  }
  const [resolvedArtifacts, resolvedDirectory] = await Promise.all([
    realpath(artifactRoot),
    realpath(directory),
  ]);
  if (!strictlyContained(resolvedArtifacts, resolvedDirectory))
    throw new Error(
      "Telemetry directory resolves outside repository artifacts.",
    );
  return directory;
}

function activePhases(
  events: readonly TelemetryEvent[],
): TelemetryActivePhase[] {
  const active = new Map<string, TelemetryActivePhase>();
  for (const event of events) {
    if (event.status === null && event.eventType.endsWith("-started")) {
      active.set(event.operationId, {
        operationId: event.operationId,
        eventId: event.eventId,
        phase: event.phase,
        startedAt: event.startedAt,
      });
    } else if (event.status !== null) {
      active.delete(event.operationId);
    }
  }
  return [...active.values()].sort((left, right) =>
    left.operationId.localeCompare(right.operationId),
  );
}

export class TelemetryStore {
  readonly repositoryRoot: string;
  readonly directory: string;
  readonly runId: string;
  readonly source: TelemetrySource;
  readonly manifestPath: string;
  readonly summaryPath: string;
  private readonly eventsDirectory: string;
  private readonly now: () => Date;
  private readonly hrtime: () => bigint;
  private readonly writeJson: JsonWriter;
  private readonly openedMonotonic: bigint;
  private readonly openedExisting: boolean;
  private manifestValue: TelemetryManifest;
  private eventsValue: TelemetryEvent[];

  private constructor(input: {
    readonly repositoryRoot: string;
    readonly directory: string;
    readonly runId: string;
    readonly source: TelemetrySource;
    readonly now: () => Date;
    readonly hrtime: () => bigint;
    readonly writeJson: JsonWriter;
    readonly manifest: TelemetryManifest;
    readonly events: readonly TelemetryEvent[];
    readonly openedExisting: boolean;
  }) {
    this.repositoryRoot = input.repositoryRoot;
    this.directory = input.directory;
    this.runId = input.runId;
    this.source = input.source;
    this.manifestPath = resolve(input.directory, "manifest.json");
    this.summaryPath = resolve(input.directory, "summary.json");
    this.eventsDirectory = resolve(input.directory, "events");
    this.now = input.now;
    this.hrtime = input.hrtime;
    this.writeJson = input.writeJson;
    this.manifestValue = input.manifest;
    this.eventsValue = [...input.events];
    this.openedExisting = input.openedExisting;
    this.openedMonotonic = input.hrtime();
  }

  static async open(options: TelemetryStoreOptions): Promise<TelemetryStore> {
    const repositoryRoot = resolve(options.repositoryRoot);
    const runId = safeRunId(options.runId);
    const directory = await ensureSafeDirectory(
      repositoryRoot,
      options.directory,
    );
    const eventsDirectory = resolve(directory, "events");
    await mkdir(eventsDirectory, { recursive: true });
    const entries = await readdir(eventsDirectory, { withFileTypes: true });
    const eventFiles: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        throw new Error(
          `Telemetry event path cannot be a symlink: ${entry.name}.`,
        );
      if (entry.isFile() && /^\d{6}\.json$/.test(entry.name))
        eventFiles.push(entry.name);
    }
    eventFiles.sort();
    const events: TelemetryEvent[] = [];
    const manifestEvents: TelemetryManifestEvent[] = [];
    let priorHash: string | null = null;
    for (const [index, name] of eventFiles.entries()) {
      const expectedSequence = index + 1;
      if (name !== `${String(expectedSequence).padStart(6, "0")}.json`)
        throw new Error("Telemetry event sequence contains a gap.");
      const path = resolve(eventsDirectory, name);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new Error(`Telemetry event must be a regular file: ${name}.`);
      const contents = await readFile(path);
      const event = assertTelemetryEvent(
        JSON.parse(contents.toString("utf8")) as unknown,
      );
      if (
        event.sequence !== expectedSequence ||
        event.runId !== runId ||
        event.source !== options.source ||
        event.previousEventSha256 !== priorHash
      )
        throw new Error(`Telemetry event chain is invalid at ${name}.`);
      const eventHash = sha256(contents);
      events.push(event);
      manifestEvents.push({
        sequence: expectedSequence,
        path: `events/${name}`,
        bytes: contents.byteLength,
        sha256: eventHash,
        previousEventSha256: priorHash,
      });
      priorHash = eventHash;
    }

    const manifestPath = resolve(directory, "manifest.json");
    let existing: TelemetryManifest | null = null;
    try {
      const metadata = await lstat(manifestPath);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw new Error("Telemetry manifest must be a regular file.");
      existing = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as TelemetryManifest;
      if (
        existing.schemaVersion !== TELEMETRY_SCHEMA_VERSION ||
        existing.runId !== runId ||
        existing.source !== options.source ||
        existing.events.some(
          (entry, index) =>
            manifestEvents[index]?.sha256 !== entry.sha256 ||
            manifestEvents[index]?.path !== entry.path,
        ) ||
        existing.events.length > manifestEvents.length
      )
        throw new Error("Telemetry manifest does not match its event chain.");
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const now = options.now ?? (() => new Date());
    const createdAt = existing?.createdAt ?? now().toISOString();
    const manifest: TelemetryManifest = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      runId,
      source: options.source,
      status:
        existing && existing.events.length === manifestEvents.length
          ? existing.status
          : "active",
      createdAt,
      updatedAt: now().toISOString(),
      eventCount: manifestEvents.length,
      events: manifestEvents,
      chainHeadSha256: priorHash,
      activePhases: activePhases(events),
      summaryPath:
        existing && existing.events.length === manifestEvents.length
          ? existing.summaryPath
          : null,
    };
    const store = new TelemetryStore({
      repositoryRoot,
      directory,
      runId,
      source: options.source,
      now,
      hrtime: options.hrtime ?? (() => process.hrtime.bigint()),
      writeJson: options.writeJson ?? atomicWriteJson,
      manifest,
      events,
      openedExisting: existing !== null || events.length > 0,
    });
    await store.writeManifest();
    return store;
  }

  get manifest(): TelemetryManifest {
    return this.manifestValue;
  }

  get events(): readonly TelemetryEvent[] {
    return this.eventsValue;
  }

  repositoryRelativeManifestPath(): string {
    return relativePath(this.repositoryRoot, this.manifestPath);
  }

  private async writeManifest(): Promise<void> {
    await this.writeJson(this.manifestPath, this.manifestValue);
  }

  private async appendEvent(input: {
    readonly operationId: string;
    readonly eventType: string;
    readonly phase: TelemetryPhase;
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly durationNanoseconds: string | null;
    readonly details: TelemetryEventDetails;
  }): Promise<TelemetryEvent> {
    if (this.manifestValue.status === "completed")
      throw new Error("Cannot append telemetry to a completed run.");
    const sequence = this.eventsValue.length + 1;
    const previousEventSha256 = this.manifestValue.chainHeadSha256;
    const event: TelemetryEvent = {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventId: `${this.runId}-${String(sequence).padStart(6, "0")}-${randomUUID()}`,
      runId: this.runId,
      source: this.source,
      sequence,
      previousEventSha256,
      operationId: input.operationId,
      eventType: input.eventType,
      phase: input.phase,
      status: input.details.status,
      reason:
        input.details.reason === undefined || input.details.reason === null
          ? null
          : redactSensitiveText(input.details.reason),
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationNanoseconds: input.durationNanoseconds,
      candidate: input.details.candidate ?? null,
      command:
        input.details.command === undefined || input.details.command === null
          ? null
          : {
              ...input.details.command,
              argv: redactTelemetryArgv(input.details.command.argv),
            },
      tests: input.details.tests ?? null,
      artifacts: input.details.artifacts ?? null,
      retry: input.details.retry ?? null,
      agent: input.details.agent ?? null,
      baselineComparison: input.details.baselineComparison ?? null,
      measurementAvailability: payloadAvailability(
        input.details,
        input.durationNanoseconds === null ? "interrupted" : "measured",
      ),
    };
    const redacted = redactSensitiveValue(event) as TelemetryEvent;
    assertTelemetryEvent(redacted);
    const name = `${String(sequence).padStart(6, "0")}.json`;
    const path = resolve(this.eventsDirectory, name);
    try {
      await lstat(path);
      throw new Error(`Telemetry event path already exists: ${name}.`);
    } catch (error) {
      if (!missing(error)) throw error;
    }
    await this.writeJson(path, redacted);
    const contents = await readFile(path);
    const eventHash = sha256(contents);
    const manifestEntry: TelemetryManifestEvent = {
      sequence,
      path: `events/${name}`,
      bytes: contents.byteLength,
      sha256: eventHash,
      previousEventSha256,
    };
    this.eventsValue = [...this.eventsValue, redacted];
    this.manifestValue = {
      ...this.manifestValue,
      status: "active",
      updatedAt: this.now().toISOString(),
      eventCount: sequence,
      events: [...this.manifestValue.events, manifestEntry],
      chainHeadSha256: eventHash,
      activePhases: activePhases(this.eventsValue),
      summaryPath: null,
    };
    await this.writeManifest();
    return redacted;
  }

  async beginPhase(input: BeginTelemetryPhaseInput): Promise<TelemetrySpan> {
    const operationId = input.operationId ?? `operation-${randomUUID()}`;
    const startedAt = this.now().toISOString();
    const startedMonotonic = this.hrtime();
    await this.appendEvent({
      operationId,
      eventType: `${input.eventType}-started`,
      phase: input.phase,
      startedAt,
      finishedAt: null,
      durationNanoseconds: null,
      details: {
        status: null,
        candidate: input.candidate ?? null,
        measurementAvailability: {
          durationNanoseconds: "not-applicable",
          ...(input.candidate
            ? { candidate: "measured" as const }
            : { candidate: "not-applicable" as const }),
          ...input.measurementAvailability,
        },
      },
    });
    let finished = false;
    return {
      operationId,
      finish: async (finishInput) => {
        if (finished)
          throw new Error(
            `Telemetry operation ${operationId} already finished.`,
          );
        const finishedAt = this.now().toISOString();
        const durationNanoseconds = (
          this.hrtime() - startedMonotonic
        ).toString();
        const event = await this.appendEvent({
          operationId,
          eventType: finishInput.eventType ?? `${input.eventType}-completed`,
          phase: input.phase,
          startedAt,
          finishedAt,
          durationNanoseconds,
          details: finishInput,
        });
        finished = true;
        return event;
      },
    };
  }

  async recordCommand(
    input: CommandTelemetryMeasurement,
  ): Promise<TelemetryEvent> {
    const retry: TelemetryRetry | null =
      input.retryAttempt &&
      input.status !== "PASS" &&
      input.status !== "NOT_READY"
        ? {
            attempt: input.retryAttempt,
            failureClassification: input.failureClassification ?? "unknown",
          }
        : null;
    return this.appendEvent({
      operationId: input.operationId ?? `command-${randomUUID()}`,
      eventType: "command-completed",
      phase: input.phase ?? "verification",
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationNanoseconds: input.durationNanoseconds,
      details: {
        status: input.status,
        reason: input.reason ?? null,
        candidate: input.candidate ?? null,
        command: {
          id: input.commandId,
          argv: input.argv,
          checkSetId: input.checkSetId ?? null,
          selectedCheckIds: input.selectedCheckIds ?? [input.commandId],
          actualCheckIds: input.actualCheckIds ?? [input.commandId],
          exitCode: input.exitCode,
          signal: input.signal,
        },
        tests: input.tests ?? null,
        artifacts: input.artifacts ?? null,
        retry,
        measurementAvailability: {
          candidate: input.candidate ? "measured" : "not-applicable",
          tests: input.tests ? "measured" : "not-applicable",
          artifacts: input.artifacts ? "measured" : "not-applicable",
          retry: retry ? "measured" : "not-applicable",
        },
      },
    });
  }

  async recoverInterruptedPhases(): Promise<number> {
    const interrupted = [...this.manifestValue.activePhases];
    for (const phase of interrupted) {
      await this.appendEvent({
        operationId: phase.operationId,
        eventType: "phase-recovered",
        phase: phase.phase,
        startedAt: phase.startedAt,
        finishedAt: this.now().toISOString(),
        durationNanoseconds: null,
        details: {
          status: "ABORTED",
          reason: "process-interrupted",
          measurementAvailability: telemetryAvailability("interrupted"),
        },
      });
    }
    return interrupted.length;
  }

  private buildSummary(status: TelemetryStatus): TelemetrySummary {
    const phases = phaseCounts();
    const statuses = statusCounts();
    const availability = availabilityCounts();
    let commandCount = 0;
    let testSuites = 0;
    let tests = 0;
    let measuredTestEvents = 0;
    let artifactFiles = 0;
    let artifactBytes = 0;
    for (const event of this.eventsValue) {
      phases[event.phase] += 1;
      if (event.status) statuses[event.status] += 1;
      if (event.command) commandCount += 1;
      if (event.tests) {
        testSuites += event.tests.suites.total;
        tests += event.tests.tests.total;
        measuredTestEvents += 1;
      }
      if (event.artifacts) {
        artifactFiles += event.artifacts.fileCount;
        artifactBytes += event.artifacts.totalBytes;
      }
      for (const reason of Object.values(
        event.measurementAvailability,
      ) as TelemetryAvailability[])
        availability[reason] += 1;
    }
    const completion = [...this.eventsValue]
      .reverse()
      .find((event) => event.eventType === "run-completed");
    return {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      runId: this.runId,
      source: this.source,
      status,
      eventCount: this.eventsValue.length,
      measuredDurationNanoseconds: completion?.durationNanoseconds ?? null,
      phaseEventCounts: phases,
      statusEventCounts: statuses,
      commandCount,
      testSuites: measuredTestEvents > 0 ? testSuites : null,
      tests: measuredTestEvents > 0 ? tests : null,
      artifactFiles,
      artifactBytes,
      availabilityCounts: availability,
      manifestPath: "manifest.json",
      generatedAt: this.now().toISOString(),
    };
  }

  async complete(
    status: TelemetryStatus,
    reason: string | null = null,
  ): Promise<TelemetrySummary> {
    if (this.manifestValue.status === "completed") {
      return JSON.parse(
        await readFile(this.summaryPath, "utf8"),
      ) as TelemetrySummary;
    }
    if (this.manifestValue.activePhases.length > 0)
      throw new Error(
        `Cannot complete telemetry with unfinished phases: ${this.manifestValue.activePhases
          .map((phase) => phase.operationId)
          .join(", ")}.`,
      );
    const durationNanoseconds = this.openedExisting
      ? null
      : (this.hrtime() - this.openedMonotonic).toString();
    await this.appendEvent({
      operationId: `${this.runId}-run`,
      eventType: "run-completed",
      phase: "recording",
      startedAt: this.manifestValue.createdAt,
      finishedAt: this.now().toISOString(),
      durationNanoseconds,
      details: {
        status,
        reason,
        measurementAvailability: {
          durationNanoseconds: durationNanoseconds ? "measured" : "interrupted",
        },
      },
    });
    const summary = this.buildSummary(status);
    await this.writeJson(this.summaryPath, summary);
    this.manifestValue = {
      ...this.manifestValue,
      status: status === "ERROR" ? "error" : "completed",
      updatedAt: this.now().toISOString(),
      summaryPath: "summary.json",
    };
    await this.writeManifest();
    return summary;
  }
}
