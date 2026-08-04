import { redactSensitiveText, redactSensitiveValue } from "./redaction.js";

export const TELEMETRY_SCHEMA_VERSION = "1.0.0" as const;

export const TELEMETRY_SOURCES = ["controller", "direct"] as const;
export type TelemetrySource = (typeof TELEMETRY_SOURCES)[number];

export const TELEMETRY_PHASES = [
  "inspection",
  "planning",
  "implementation",
  "verification",
  "review",
  "recording",
  "integration",
  "reconciliation",
] as const;
export type TelemetryPhase = (typeof TELEMETRY_PHASES)[number];

export const TELEMETRY_STATUSES = [
  "PASS",
  "NOT_READY",
  "FAIL",
  "ERROR",
  "TIMEOUT",
  "ABORTED",
] as const;
export type TelemetryStatus = (typeof TELEMETRY_STATUSES)[number];

export const TELEMETRY_AVAILABILITY = [
  "measured",
  "sdk-unavailable",
  "outside-controller",
  "not-applicable",
  "interrupted",
  "unparseable",
  "not-recorded",
] as const;
export type TelemetryAvailability = (typeof TELEMETRY_AVAILABILITY)[number];

export const TELEMETRY_FAILURE_CLASSIFICATIONS = [
  "product",
  "infrastructure",
  "policy",
  "evidence",
  "timeout",
  "unknown",
] as const;
export type TelemetryFailureClassification =
  (typeof TELEMETRY_FAILURE_CLASSIFICATIONS)[number];

export interface TelemetryCandidate {
  readonly baseCommit: string | null;
  readonly commit: string | null;
  readonly tree: string | null;
  readonly dirty: boolean;
}

export interface TelemetryCommand {
  readonly id: string;
  readonly argv: readonly string[];
  readonly checkSetId: string | null;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
  readonly exitCode: number | null;
  readonly signal: string | null;
}

export interface TelemetryTestCounts {
  readonly suites: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly tests: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
}

export interface TelemetryArtifacts {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly manifestReferences: readonly string[];
  readonly receiptReferences: readonly string[];
}

export interface TelemetryRetry {
  readonly attempt: number;
  readonly failureClassification: TelemetryFailureClassification;
}

export interface TelemetryAgent {
  readonly role: string;
  readonly threadId: string | null;
  readonly requestedModel: string | null;
  readonly requestedReasoningEffort: string | null;
  readonly resolvedModel: string | null;
  readonly resolvedReasoningEffort: string | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningOutputTokens: number | null;
}

export interface TelemetryBaselineComparison {
  readonly baselineId: string;
  readonly changeClass: string;
  readonly durationDeltaNanoseconds: string | null;
  readonly artifactBytesDelta: number | null;
}

export interface TelemetryMeasurementAvailability {
  readonly durationNanoseconds: TelemetryAvailability;
  readonly candidate: TelemetryAvailability;
  readonly command: TelemetryAvailability;
  readonly tests: TelemetryAvailability;
  readonly artifacts: TelemetryAvailability;
  readonly retry: TelemetryAvailability;
  readonly agentThread: TelemetryAvailability;
  readonly agentRequestedAssignment: TelemetryAvailability;
  readonly agentResolvedAssignment: TelemetryAvailability;
  readonly agentUsage: TelemetryAvailability;
  readonly baselineComparison: TelemetryAvailability;
}

export interface TelemetryEvent {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly eventId: string;
  readonly runId: string;
  readonly source: TelemetrySource;
  readonly sequence: number;
  readonly previousEventSha256: string | null;
  readonly operationId: string;
  readonly eventType: string;
  readonly phase: TelemetryPhase;
  readonly status: TelemetryStatus | null;
  readonly reason: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationNanoseconds: string | null;
  readonly candidate: TelemetryCandidate | null;
  readonly command: TelemetryCommand | null;
  readonly tests: TelemetryTestCounts | null;
  readonly artifacts: TelemetryArtifacts | null;
  readonly retry: TelemetryRetry | null;
  readonly agent: TelemetryAgent | null;
  readonly baselineComparison: TelemetryBaselineComparison | null;
  readonly measurementAvailability: TelemetryMeasurementAvailability;
}

export interface TelemetryManifestEvent {
  readonly sequence: number;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly previousEventSha256: string | null;
}

export interface TelemetryActivePhase {
  readonly operationId: string;
  readonly eventId: string;
  readonly phase: TelemetryPhase;
  readonly startedAt: string;
}

export interface TelemetryManifest {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly runId: string;
  readonly source: TelemetrySource;
  readonly status: "active" | "completed" | "error";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly eventCount: number;
  readonly events: readonly TelemetryManifestEvent[];
  readonly chainHeadSha256: string | null;
  readonly activePhases: readonly TelemetryActivePhase[];
  readonly summaryPath: "summary.json" | null;
}

export interface TelemetrySummary {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly runId: string;
  readonly source: TelemetrySource;
  readonly status: TelemetryStatus;
  readonly eventCount: number;
  readonly measuredDurationNanoseconds: string | null;
  readonly phaseEventCounts: Readonly<Record<TelemetryPhase, number>>;
  readonly statusEventCounts: Readonly<Record<TelemetryStatus, number>>;
  readonly commandCount: number;
  readonly testSuites: number | null;
  readonly tests: number | null;
  readonly artifactFiles: number;
  readonly artifactBytes: number;
  readonly availabilityCounts: Readonly<Record<TelemetryAvailability, number>>;
  readonly manifestPath: "manifest.json";
  readonly generatedAt: string;
}

const OPTIONAL_MEASUREMENT_KEYS = [
  "durationNanoseconds",
  "candidate",
  "command",
  "tests",
  "artifacts",
  "retry",
  "agentThread",
  "agentRequestedAssignment",
  "agentResolvedAssignment",
  "agentUsage",
  "baselineComparison",
] as const;

export function telemetryAvailability(
  fallback: TelemetryAvailability = "not-applicable",
  overrides: Partial<TelemetryMeasurementAvailability> = {},
): TelemetryMeasurementAvailability {
  return Object.fromEntries(
    OPTIONAL_MEASUREMENT_KEYS.map((key) => [key, overrides[key] ?? fallback]),
  ) as unknown as TelemetryMeasurementAvailability;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  )
    throw new Error(`${label} has unexpected or missing fields.`);
}

function text(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function safeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error(`${label} must be a non-negative safe integer.`);
  return Number(value);
}

function nullableCommit(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value))
    throw new Error(`${label} must be a lowercase forty-character Git ID.`);
  return value;
}

function decimalNanoseconds(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value))
    throw new Error(`${label} must be a non-negative decimal string.`);
  return value;
}

function isoTimestamp(
  value: unknown,
  label: string,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  const parsed = text(value, label);
  if (!parsed || !Number.isFinite(Date.parse(parsed)))
    throw new Error(`${label} must be an ISO timestamp.`);
  return parsed;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  )
    throw new Error(`${label} must be an array of non-empty strings.`);
  return value;
}

function availability(value: unknown, label: string): TelemetryAvailability {
  if (!TELEMETRY_AVAILABILITY.includes(value as TelemetryAvailability))
    throw new Error(`${label} has an unsupported availability reason.`);
  return value as TelemetryAvailability;
}

function validateCounts(value: unknown, label: string): void {
  const input = record(value, label);
  exactKeys(input, ["total", "passed", "failed", "skipped"], label);
  const total = safeCount(input["total"], `${label}.total`);
  const passed = safeCount(input["passed"], `${label}.passed`);
  const failed = safeCount(input["failed"], `${label}.failed`);
  const skipped = safeCount(input["skipped"], `${label}.skipped`);
  if (passed + failed + skipped !== total)
    throw new Error(`${label} counts do not sum to total.`);
}

function assertMeasuredPair(
  availabilityValue: TelemetryAvailability,
  value: unknown,
  label: string,
): void {
  if ((availabilityValue === "measured") !== (value !== null))
    throw new Error(`${label} and its availability classification disagree.`);
}

export function assertTelemetryEvent(value: unknown): TelemetryEvent {
  const input = record(value, "Telemetry event");
  exactKeys(
    input,
    [
      "schemaVersion",
      "eventId",
      "runId",
      "source",
      "sequence",
      "previousEventSha256",
      "operationId",
      "eventType",
      "phase",
      "status",
      "reason",
      "startedAt",
      "finishedAt",
      "durationNanoseconds",
      "candidate",
      "command",
      "tests",
      "artifacts",
      "retry",
      "agent",
      "baselineComparison",
      "measurementAvailability",
    ],
    "Telemetry event",
  );
  if (input["schemaVersion"] !== TELEMETRY_SCHEMA_VERSION)
    throw new Error("Telemetry event schema version is unsupported.");
  text(input["eventId"], "Telemetry event ID");
  text(input["runId"], "Telemetry run ID");
  if (!TELEMETRY_SOURCES.includes(input["source"] as TelemetrySource))
    throw new Error("Telemetry source is unsupported.");
  if (!Number.isSafeInteger(input["sequence"]) || Number(input["sequence"]) < 1)
    throw new Error("Telemetry sequence must be a positive safe integer.");
  if (
    input["previousEventSha256"] !== null &&
    (typeof input["previousEventSha256"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(input["previousEventSha256"]))
  )
    throw new Error("Telemetry previous-event hash is malformed.");
  text(input["operationId"], "Telemetry operation ID");
  text(input["eventType"], "Telemetry event type");
  if (!TELEMETRY_PHASES.includes(input["phase"] as TelemetryPhase))
    throw new Error("Telemetry phase is unsupported.");
  if (
    input["status"] !== null &&
    !TELEMETRY_STATUSES.includes(input["status"] as TelemetryStatus)
  )
    throw new Error("Telemetry status is unsupported.");
  text(input["reason"], "Telemetry reason", true);
  isoTimestamp(input["startedAt"], "Telemetry start time");
  isoTimestamp(input["finishedAt"], "Telemetry finish time", true);
  decimalNanoseconds(
    input["durationNanoseconds"],
    "Telemetry monotonic duration",
  );

  if (input["candidate"] !== null) {
    const candidate = record(input["candidate"], "Telemetry candidate");
    exactKeys(
      candidate,
      ["baseCommit", "commit", "tree", "dirty"],
      "Telemetry candidate",
    );
    nullableCommit(candidate["baseCommit"], "Telemetry base commit");
    nullableCommit(candidate["commit"], "Telemetry commit");
    nullableCommit(candidate["tree"], "Telemetry tree");
    if (typeof candidate["dirty"] !== "boolean")
      throw new Error("Telemetry dirty state must be boolean.");
  }
  if (input["command"] !== null) {
    const command = record(input["command"], "Telemetry command");
    exactKeys(
      command,
      [
        "id",
        "argv",
        "checkSetId",
        "selectedCheckIds",
        "actualCheckIds",
        "exitCode",
        "signal",
      ],
      "Telemetry command",
    );
    text(command["id"], "Telemetry command ID");
    stringArray(command["argv"], "Telemetry command argv");
    text(command["checkSetId"], "Telemetry check-set ID", true);
    stringArray(command["selectedCheckIds"], "Selected telemetry checks");
    stringArray(command["actualCheckIds"], "Actual telemetry checks");
    if (
      command["exitCode"] !== null &&
      !Number.isSafeInteger(command["exitCode"])
    )
      throw new Error("Telemetry exit code must be an integer or null.");
    text(command["signal"], "Telemetry signal", true);
  }
  if (input["tests"] !== null) {
    const tests = record(input["tests"], "Telemetry test counts");
    exactKeys(tests, ["suites", "tests"], "Telemetry test counts");
    validateCounts(tests["suites"], "Telemetry suite counts");
    validateCounts(tests["tests"], "Telemetry test counts");
  }
  if (input["artifacts"] !== null) {
    const artifacts = record(input["artifacts"], "Telemetry artifacts");
    exactKeys(
      artifacts,
      ["fileCount", "totalBytes", "manifestReferences", "receiptReferences"],
      "Telemetry artifacts",
    );
    safeCount(artifacts["fileCount"], "Telemetry artifact file count");
    safeCount(artifacts["totalBytes"], "Telemetry artifact bytes");
    stringArray(
      artifacts["manifestReferences"],
      "Telemetry manifest references",
    );
    stringArray(artifacts["receiptReferences"], "Telemetry receipt references");
  }
  if (input["retry"] !== null) {
    const retry = record(input["retry"], "Telemetry retry");
    exactKeys(retry, ["attempt", "failureClassification"], "Telemetry retry");
    if (!Number.isSafeInteger(retry["attempt"]) || Number(retry["attempt"]) < 1)
      throw new Error("Telemetry retry attempt must be positive.");
    if (
      !TELEMETRY_FAILURE_CLASSIFICATIONS.includes(
        retry["failureClassification"] as TelemetryFailureClassification,
      )
    )
      throw new Error("Telemetry failure classification is unsupported.");
  }
  if (input["agent"] !== null) {
    const agent = record(input["agent"], "Telemetry agent");
    exactKeys(
      agent,
      [
        "role",
        "threadId",
        "requestedModel",
        "requestedReasoningEffort",
        "resolvedModel",
        "resolvedReasoningEffort",
        "inputTokens",
        "cachedInputTokens",
        "outputTokens",
        "reasoningOutputTokens",
      ],
      "Telemetry agent",
    );
    text(agent["role"], "Telemetry agent role");
    for (const key of [
      "threadId",
      "requestedModel",
      "requestedReasoningEffort",
      "resolvedModel",
      "resolvedReasoningEffort",
    ])
      text(agent[key], `Telemetry agent ${key}`, true);
    for (const key of [
      "inputTokens",
      "cachedInputTokens",
      "outputTokens",
      "reasoningOutputTokens",
    ]) {
      if (agent[key] !== null) safeCount(agent[key], `Telemetry agent ${key}`);
    }
  }
  if (input["baselineComparison"] !== null) {
    const baseline = record(
      input["baselineComparison"],
      "Telemetry baseline comparison",
    );
    exactKeys(
      baseline,
      [
        "baselineId",
        "changeClass",
        "durationDeltaNanoseconds",
        "artifactBytesDelta",
      ],
      "Telemetry baseline comparison",
    );
    text(baseline["baselineId"], "Telemetry baseline ID");
    text(baseline["changeClass"], "Telemetry change class");
    if (
      baseline["durationDeltaNanoseconds"] !== null &&
      (typeof baseline["durationDeltaNanoseconds"] !== "string" ||
        !/^-?(?:0|[1-9][0-9]*)$/.test(baseline["durationDeltaNanoseconds"]))
    )
      throw new Error("Telemetry duration delta is malformed.");
    if (
      baseline["artifactBytesDelta"] !== null &&
      !Number.isSafeInteger(baseline["artifactBytesDelta"])
    )
      throw new Error("Telemetry artifact-byte delta must be an integer.");
  }

  const availabilityInput = record(
    input["measurementAvailability"],
    "Telemetry measurement availability",
  );
  exactKeys(
    availabilityInput,
    OPTIONAL_MEASUREMENT_KEYS,
    "Telemetry measurement availability",
  );
  const classifications = Object.fromEntries(
    OPTIONAL_MEASUREMENT_KEYS.map((key) => [
      key,
      availability(availabilityInput[key], `Telemetry availability ${key}`),
    ]),
  ) as unknown as TelemetryMeasurementAvailability;
  assertMeasuredPair(
    classifications.durationNanoseconds,
    input["durationNanoseconds"],
    "Telemetry duration",
  );
  for (const key of [
    "candidate",
    "command",
    "tests",
    "artifacts",
    "retry",
    "baselineComparison",
  ] as const)
    assertMeasuredPair(classifications[key], input[key], `Telemetry ${key}`);
  const agent = input["agent"] as Record<string, unknown> | null;
  if (agent === null) {
    if (
      classifications.agentThread === "measured" ||
      classifications.agentRequestedAssignment === "measured" ||
      classifications.agentResolvedAssignment === "measured" ||
      classifications.agentUsage === "measured"
    )
      throw new Error("Telemetry agent availability requires an agent record.");
  } else {
    assertMeasuredPair(
      classifications.agentThread,
      agent["threadId"],
      "Telemetry agent thread",
    );
    const requested =
      agent["requestedModel"] !== null &&
      agent["requestedReasoningEffort"] !== null
        ? agent
        : null;
    assertMeasuredPair(
      classifications.agentRequestedAssignment,
      requested,
      "Telemetry requested agent assignment",
    );
    const resolved =
      agent["resolvedModel"] !== null &&
      agent["resolvedReasoningEffort"] !== null
        ? agent
        : null;
    assertMeasuredPair(
      classifications.agentResolvedAssignment,
      resolved,
      "Telemetry resolved agent assignment",
    );
    const tokens =
      agent["inputTokens"] !== null &&
      agent["cachedInputTokens"] !== null &&
      agent["outputTokens"] !== null &&
      agent["reasoningOutputTokens"] !== null
        ? agent
        : null;
    assertMeasuredPair(
      classifications.agentUsage,
      tokens,
      "Telemetry agent tokens",
    );
  }
  return input as unknown as TelemetryEvent;
}

export function redactTelemetryArgv(
  argv: readonly string[],
): readonly string[] {
  const result: string[] = [];
  let redactNext = false;
  for (const raw of argv) {
    const value = redactSensitiveText(raw);
    if (redactNext) {
      result.push("[REDACTED]");
      redactNext = false;
      continue;
    }
    if (
      /^--?(?:api[-_]?key|token|secret|password|credential|prompt|hidden[-_]?seed)$/i.test(
        value,
      )
    ) {
      result.push(value);
      redactNext = true;
      continue;
    }
    if (
      /^--?(?:api[-_]?key|token|secret|password|credential|prompt|hidden[-_]?seed)=/i.test(
        value,
      )
    ) {
      result.push(`${value.slice(0, value.indexOf("=") + 1)}[REDACTED]`);
      continue;
    }
    result.push(value);
  }
  return redactSensitiveValue(result) as readonly string[];
}
