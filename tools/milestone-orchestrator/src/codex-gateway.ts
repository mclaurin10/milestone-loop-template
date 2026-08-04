import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  Codex,
  type ThreadEvent,
  type ThreadOptions,
  type TurnOptions,
} from "@openai/codex-sdk";

import type {
  AgentInvocationRecord,
  AgentReasoningEffort,
  AgentRole,
  CodexTurnResult,
  OrchestratorConfig,
  UsageRecord,
} from "./contracts.js";
import { AGENT_INVOCATION_SCHEMA_VERSION } from "./contracts.js";
import { resolveAgentAssignment } from "./model-policy.js";
import {
  redactSensitiveText,
  redactSensitiveValue,
  safeAgentEnvironment,
} from "./redaction.js";
import { atomicWriteJson } from "./state-store.js";
import type { TelemetryStore } from "./telemetry-store.js";
import type {
  TelemetryCandidate,
  TelemetryPhase,
} from "./telemetry-contracts.js";

interface ThreadLike {
  runStreamed(
    prompt: string,
    options?: TurnOptions,
  ): Promise<{ readonly events: AsyncGenerator<ThreadEvent> }>;
}

export interface CodexClientLike {
  startThread(options: PinnedThreadOptions): ThreadLike;
  resumeThread(id: string, options: PinnedThreadOptions): ThreadLike;
}

export type PinnedThreadOptions = Omit<
  ThreadOptions,
  "model" | "modelReasoningEffort"
> & {
  readonly model: string;
  readonly modelReasoningEffort: AgentReasoningEffort;
};

export interface CodexInvocation {
  readonly role: AgentRole;
  readonly prompt: string;
  readonly workingDirectory: string;
  readonly threadId: string | null;
  readonly outputSchema?: unknown;
  readonly eventLogPath: string;
  readonly timeoutMs: number;
  readonly attempt: number;
  readonly escalationReason: string | null;
  readonly invocationId?: string;
  readonly onThreadStarted?: (threadId: string) => void | Promise<void>;
  readonly telemetryPhase?: TelemetryPhase;
  readonly telemetryStore?: TelemetryStore;
  readonly telemetryCandidate?: TelemetryCandidate | null;
}

export interface CodexGateway {
  run(invocation: CodexInvocation): Promise<CodexTurnResult>;
}

function threadOptions(
  role: AgentRole,
  workingDirectory: string,
  config: OrchestratorConfig,
): PinnedThreadOptions {
  const assignment = resolveAgentAssignment(config.agentPolicy, role);
  const worker =
    role === "gameplay-worker-initial" || role === "gameplay-worker-escalated";
  return {
    model: assignment.model,
    modelReasoningEffort: assignment.reasoningEffort,
    workingDirectory,
    skipGitRepoCheck: false,
    sandboxMode: worker
      ? config.workerSandbox
      : role === "planner"
        ? config.plannerSandbox
        : config.reviewerSandbox,
    approvalPolicy: config.approvalPolicy,
    networkAccessEnabled: config.networkAccessEnabled,
    webSearchMode: "disabled",
  };
}

class OfficialSdkClient implements CodexClientLike {
  constructor(private readonly sdk: Codex) {}

  startThread(options: PinnedThreadOptions): ThreadLike {
    // SDK 0.146.0 forwards this string verbatim, but its published type union
    // predates the bundled CLI's audited `max` effort. Keep the cast here only.
    return this.sdk.startThread(options as ThreadOptions);
  }

  resumeThread(id: string, options: PinnedThreadOptions): ThreadLike {
    return this.sdk.resumeThread(id, options as ThreadOptions);
  }
}

function usageRecord(
  event: Extract<ThreadEvent, { type: "turn.completed" }>,
): UsageRecord {
  return {
    inputTokens: event.usage.input_tokens,
    cachedInputTokens: event.usage.cached_input_tokens,
    outputTokens: event.usage.output_tokens,
    reasoningOutputTokens: event.usage.reasoning_output_tokens,
  };
}

async function writeEvent(path: string, event: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(
    path,
    `${JSON.stringify(redactSensitiveValue(event))}\n`,
    "utf8",
  );
}

export class SdkCodexGateway implements CodexGateway {
  private readonly client: CodexClientLike;
  private activeInvocations = 0;

  constructor(
    private readonly config: OrchestratorConfig,
    client?: CodexClientLike,
  ) {
    const apiKey = process.env["CODEX_API_KEY"];
    this.client =
      client ??
      new OfficialSdkClient(
        new Codex({
          ...(apiKey ? { apiKey } : {}),
          env: safeAgentEnvironment(),
        }),
      );
  }

  async run(invocation: CodexInvocation): Promise<CodexTurnResult> {
    if (!Number.isSafeInteger(invocation.attempt) || invocation.attempt <= 0)
      throw new Error("Codex invocation attempt must be a positive integer.");
    const escalated = invocation.role === "gameplay-worker-escalated";
    if (escalated !== (invocation.escalationReason !== null))
      throw new Error(
        "Escalated worker invocations require exactly one recorded escalation reason.",
      );
    if (
      this.activeInvocations >=
      this.config.agentPolicy.execution.maximumConcurrentAgentInvocations
    )
      throw new Error(
        "Configured maximum concurrent Codex invocation count was reached.",
      );
    this.activeInvocations += 1;
    try {
      return await this.runPinnedInvocation(invocation);
    } finally {
      this.activeInvocations -= 1;
    }
  }

  private async runPinnedInvocation(
    invocation: CodexInvocation,
  ): Promise<CodexTurnResult> {
    const escalated = invocation.role === "gameplay-worker-escalated";
    const assignment = resolveAgentAssignment(
      this.config.agentPolicy,
      invocation.role,
    );
    const telemetryPhase =
      invocation.telemetryPhase ??
      (invocation.role === "planner"
        ? "planning"
        : invocation.role === "reviewer"
          ? "review"
          : invocation.role === "lightweight-reporting"
            ? "recording"
            : "implementation");
    const telemetrySpan = invocation.telemetryStore
      ? await invocation.telemetryStore.beginPhase({
          phase: telemetryPhase,
          eventType: `agent-${invocation.role}`,
          operationId:
            invocation.invocationId ??
            `agent-${invocation.role}-${invocation.attempt}-${randomUUID()}`,
          candidate: invocation.telemetryCandidate ?? null,
        })
      : null;
    let telemetryAttempted = false;
    const finishTelemetry = async (input: {
      readonly status: "PASS" | "ERROR" | "TIMEOUT";
      readonly reason: string | null;
      readonly threadId: string | null;
      readonly usage: UsageRecord | null;
    }): Promise<void> => {
      if (!telemetrySpan) return;
      telemetryAttempted = true;
      await telemetrySpan.finish({
        status: input.status,
        reason: input.reason,
        candidate: invocation.telemetryCandidate ?? null,
        agent: {
          role: invocation.role,
          threadId: input.threadId,
          requestedModel: assignment.model,
          requestedReasoningEffort: assignment.reasoningEffort,
          resolvedModel: null,
          resolvedReasoningEffort: null,
          inputTokens: input.usage?.inputTokens ?? null,
          cachedInputTokens: input.usage?.cachedInputTokens ?? null,
          outputTokens: input.usage?.outputTokens ?? null,
          reasoningOutputTokens: input.usage?.reasoningOutputTokens ?? null,
        },
        ...(input.status === "PASS"
          ? {}
          : {
              retry: {
                attempt: invocation.attempt,
                failureClassification:
                  input.status === "TIMEOUT" ? "timeout" : "infrastructure",
              },
            }),
        measurementAvailability: {
          candidate: invocation.telemetryCandidate
            ? "measured"
            : "not-applicable",
          agentThread: input.threadId ? "measured" : "sdk-unavailable",
          agentRequestedAssignment: "measured",
          agentResolvedAssignment: "sdk-unavailable",
          agentUsage: input.usage ? "measured" : "sdk-unavailable",
        },
      });
    };
    const startedAt = new Date().toISOString();
    const invocationPath = resolve(
      dirname(invocation.eventLogPath),
      "agent-invocation.json",
    );
    let invocationRecord: AgentInvocationRecord = {
      schemaVersion: AGENT_INVOCATION_SCHEMA_VERSION,
      id: invocation.invocationId ?? `agent-${randomUUID()}`,
      role: invocation.role,
      requestedModel: assignment.model,
      requestedReasoningEffort: assignment.reasoningEffort,
      resolvedModel: null,
      resolvedReasoningEffort: null,
      resolutionEvidence: "sdk-events-do-not-expose-resolved-model-or-effort",
      threadId: invocation.threadId,
      attempt: invocation.attempt,
      escalated,
      escalationReason: invocation.escalationReason,
      overrideApplied: assignment.overrideApplied,
      overrideReason:
        assignment.overrideReason === null
          ? null
          : redactSensitiveText(assignment.overrideReason),
      status: "starting",
      startedAt,
      finishedAt: null,
      error: null,
    };
    await atomicWriteJson(
      invocationPath,
      redactSensitiveValue(invocationRecord),
    );
    const options = threadOptions(
      invocation.role,
      invocation.workingDirectory,
      this.config,
    );
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), invocation.timeoutMs);
    timeout.unref();
    let threadId = invocation.threadId;
    let finalResponse = "";
    let usage: UsageRecord | null = null;
    let itemCount = 0;
    try {
      const thread = invocation.threadId
        ? this.client.resumeThread(invocation.threadId, options)
        : this.client.startThread(options);
      const streamed = await thread.runStreamed(invocation.prompt, {
        signal: abort.signal,
        ...(invocation.outputSchema === undefined
          ? {}
          : { outputSchema: invocation.outputSchema }),
      });
      for await (const event of streamed.events) {
        await writeEvent(invocation.eventLogPath, event);
        if (event.type === "thread.started") {
          threadId = event.thread_id;
          invocationRecord = { ...invocationRecord, threadId };
          await atomicWriteJson(
            invocationPath,
            redactSensitiveValue(invocationRecord),
          );
          await invocation.onThreadStarted?.(threadId);
        } else if (event.type === "item.completed") {
          itemCount += 1;
          if (event.item.type === "agent_message")
            finalResponse = event.item.text;
        } else if (event.type === "turn.completed") {
          usage = usageRecord(event);
        } else if (event.type === "turn.failed") {
          throw new Error(event.error.message);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
      if (!threadId)
        throw new Error("Codex stream ended without a thread identifier.");
      if (!finalResponse)
        throw new Error("Codex stream ended without a final agent response.");
      invocationRecord = {
        ...invocationRecord,
        threadId,
        status: "completed",
        finishedAt: new Date().toISOString(),
      };
      await atomicWriteJson(
        invocationPath,
        redactSensitiveValue(invocationRecord),
      );
      await finishTelemetry({
        status: "PASS",
        reason: null,
        threadId,
        usage,
      });
      return {
        threadId,
        finalResponse: redactSensitiveText(finalResponse),
        usage,
        itemCount,
      };
    } catch (error) {
      let message = redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      );
      if (!telemetryAttempted) {
        try {
          await finishTelemetry({
            status: abort.signal.aborted ? "TIMEOUT" : "ERROR",
            reason: message,
            threadId,
            usage,
          });
        } catch (telemetryError) {
          message = `Telemetry write failed: ${redactSensitiveText(
            telemetryError instanceof Error
              ? telemetryError.message
              : String(telemetryError),
          )}`;
        }
      }
      invocationRecord = {
        ...invocationRecord,
        threadId,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: message,
      };
      await atomicWriteJson(
        invocationPath,
        redactSensitiveValue(invocationRecord),
      );
      if (abort.signal.aborted)
        throw new Error(
          `Codex ${invocation.role} turn exceeded ${invocation.timeoutMs} ms.`,
          { cause: error },
        );
      throw new Error(
        `Pinned Codex ${invocation.role} invocation ${assignment.model}/${assignment.reasoningEffort} failed: ${message}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
