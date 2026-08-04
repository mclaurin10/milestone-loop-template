import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ThreadEvent, TurnOptions } from "@openai/codex-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SdkCodexGateway,
  type CodexClientLike,
  type PinnedThreadOptions,
} from "./codex-gateway.js";
import { validConfig } from "../test/fixtures.js";
import { TelemetryStore } from "./telemetry-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function events(): AsyncGenerator<ThreadEvent> {
  return (async function* generate() {
    yield { type: "thread.started", thread_id: "thread-123" };
    yield { type: "turn.started" };
    yield {
      type: "item.completed",
      item: { id: "message", type: "agent_message", text: "completed" },
    };
    yield {
      type: "turn.completed",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 2,
        cache_write_input_tokens: 0,
        output_tokens: 3,
        reasoning_output_tokens: 1,
      },
    };
  })();
}

describe("Codex SDK gateway", () => {
  it("records measured usage without prompts, responses, or invented resolution fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-sdk-telemetry-"));
    temporaryDirectories.push(root);
    const telemetry = await TelemetryStore.open({
      repositoryRoot: root,
      directory: join(
        root,
        "artifacts",
        "orchestrator",
        "runs",
        "sdk-run",
        "telemetry",
      ),
      runId: "sdk-run",
      source: "controller",
    });
    const client: CodexClientLike = {
      startThread: vi.fn(() => ({
        runStreamed: async () => ({ events: events() }),
      })),
      resumeThread: vi.fn(),
    };
    const gateway = new SdkCodexGateway(validConfig(), client);
    await gateway.run({
      role: "planner",
      prompt: "super-secret-prompt-must-not-enter-telemetry",
      workingDirectory: root,
      threadId: null,
      eventLogPath: join(root, "events.jsonl"),
      timeoutMs: 10_000,
      attempt: 1,
      escalationReason: null,
      telemetryPhase: "planning",
      telemetryStore: telemetry,
    });
    await telemetry.complete("PASS");
    const serialized = telemetry.events
      .map((event) => JSON.stringify(event))
      .join("\n");
    expect(serialized).not.toContain(
      "super-secret-prompt-must-not-enter-telemetry",
    );
    expect(telemetry.events[1]).toMatchObject({
      phase: "planning",
      status: "PASS",
      agent: {
        role: "planner",
        threadId: "thread-123",
        requestedModel: "gpt-5.6-sol",
        requestedReasoningEffort: "max",
        resolvedModel: null,
        resolvedReasoningEffort: null,
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 3,
        reasoningOutputTokens: 1,
      },
      measurementAvailability: {
        agentThread: "measured",
        agentRequestedAssignment: "measured",
        agentResolvedAssignment: "sdk-unavailable",
        agentUsage: "measured",
      },
    });
  });

  it("starts a workspace-write worker, persists its ID, and resumes that ID", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-sdk-"));
    temporaryDirectories.push(root);
    const runStreamed = vi.fn(
      async (_prompt: string, _options?: TurnOptions) => ({ events: events() }),
    );
    const startThread = vi.fn((_options: PinnedThreadOptions) => ({
      runStreamed,
    }));
    const resumeThread = vi.fn(
      (_id: string, _options: PinnedThreadOptions) => ({
        runStreamed,
      }),
    );
    const client: CodexClientLike = { startThread, resumeThread };
    const gateway = new SdkCodexGateway(validConfig(), client);
    const onStarted = vi.fn(async (_id: string) => undefined);
    const first = await gateway.run({
      role: "feature-worker-initial",
      prompt: "Make a bounded change.",
      workingDirectory: root,
      threadId: null,
      eventLogPath: join(root, "first.jsonl"),
      timeoutMs: 10_000,
      attempt: 1,
      escalationReason: null,
      onThreadStarted: onStarted,
    });
    expect(first).toMatchObject({
      threadId: "thread-123",
      finalResponse: "completed",
      usage: { inputTokens: 10, outputTokens: 3 },
    });
    expect(onStarted).toHaveBeenCalledWith("thread-123");
    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDirectory: root,
        sandboxMode: "workspace-write",
        approvalPolicy: "on-request",
        networkAccessEnabled: false,
        model: "gpt-5.6-sol",
        modelReasoningEffort: "xhigh",
      }),
    );

    await gateway.run({
      role: "feature-worker-initial",
      prompt: "Address verification feedback.",
      workingDirectory: root,
      threadId: first.threadId,
      eventLogPath: join(root, "second.jsonl"),
      timeoutMs: 10_000,
      attempt: 2,
      escalationReason: null,
    });
    expect(resumeThread).toHaveBeenCalledWith(
      "thread-123",
      expect.objectContaining({
        sandboxMode: "workspace-write",
        model: "gpt-5.6-sol",
        modelReasoningEffort: "xhigh",
      }),
    );
    expect(await readFile(join(root, "first.jsonl"), "utf8")).toContain(
      '"type":"thread.started"',
    );
  });

  it("uses a fresh read-only thread for a reviewer", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-review-sdk-"));
    temporaryDirectories.push(root);
    const client: CodexClientLike = {
      startThread: vi.fn((options: PinnedThreadOptions) => {
        expect(options).toMatchObject({
          sandboxMode: "read-only",
          model: "gpt-5.6-sol",
          modelReasoningEffort: "max",
        });
        return { runStreamed: async () => ({ events: events() }) };
      }),
      resumeThread: vi.fn(),
    };
    const gateway = new SdkCodexGateway(validConfig(), client);
    await gateway.run({
      role: "reviewer",
      prompt: "Review independently.",
      workingDirectory: root,
      threadId: null,
      eventLogPath: join(root, "review.jsonl"),
      timeoutMs: 10_000,
      attempt: 1,
      escalationReason: null,
      outputSchema: { type: "object" },
    });
    expect(client.startThread).toHaveBeenCalledOnce();
    expect(client.resumeThread).not.toHaveBeenCalled();
  });

  it.each([
    ["planner", "gpt-5.6-sol", "max", null],
    ["feature-worker-initial", "gpt-5.6-sol", "xhigh", null],
    [
      "feature-worker-escalated",
      "gpt-5.6-sol",
      "max",
      "Two substantive implementation attempts failed.",
    ],
    ["reviewer", "gpt-5.6-sol", "max", null],
    ["lightweight-reporting", "gpt-5.6-terra", "medium", null],
  ] as const)(
    "pins %s to %s/%s and records invocation evidence",
    async (role, model, effort, escalationReason) => {
      const root = await mkdtemp(join(tmpdir(), "milestone-loop-role-sdk-"));
      temporaryDirectories.push(root);
      let observed: PinnedThreadOptions | null = null;
      const client: CodexClientLike = {
        startThread: vi.fn((options: PinnedThreadOptions) => {
          observed = options;
          return { runStreamed: async () => ({ events: events() }) };
        }),
        resumeThread: vi.fn(),
      };
      const gateway = new SdkCodexGateway(validConfig(), client);
      await gateway.run({
        role,
        prompt: "Perform only the harmless bounded role check.",
        workingDirectory: root,
        threadId: null,
        eventLogPath: join(root, "events.jsonl"),
        timeoutMs: 10_000,
        attempt: 1,
        escalationReason,
      });
      expect(observed).toMatchObject({
        model,
        modelReasoningEffort: effort,
      });
      const invocation = JSON.parse(
        await readFile(join(root, "agent-invocation.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(invocation).toMatchObject({
        role,
        requestedModel: model,
        requestedReasoningEffort: effort,
        resolvedModel: null,
        resolvedReasoningEffort: null,
        status: "completed",
      });
    },
  );

  it("applies and logs only a validated explicit override", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-override-sdk-"));
    temporaryDirectories.push(root);
    const base = validConfig();
    const config = validConfig({
      agentPolicy: {
        ...base.agentPolicy,
        overrides: [
          {
            role: "lightweight-reporting",
            model: "gpt-5.6-sol",
            reasoningEffort: "high",
            reason:
              "Bounded diagnostic comparison approved; CODEX_API_KEY=never-log-this-value.",
          },
        ],
      },
    });
    const startThread = vi.fn((_options: PinnedThreadOptions) => ({
      runStreamed: async () => ({ events: events() }),
    }));
    const gateway = new SdkCodexGateway(config, {
      startThread,
      resumeThread: vi.fn(),
    });
    await gateway.run({
      role: "lightweight-reporting",
      prompt: "Read-only check.",
      workingDirectory: root,
      threadId: null,
      eventLogPath: join(root, "events.jsonl"),
      timeoutMs: 10_000,
      attempt: 1,
      escalationReason: null,
    });
    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-sol",
        modelReasoningEffort: "high",
      }),
    );
    expect(
      JSON.parse(await readFile(join(root, "agent-invocation.json"), "utf8")),
    ).toMatchObject({
      overrideApplied: true,
      overrideReason:
        "Bounded diagnostic comparison approved; CODEX_API_KEY=[REDACTED]",
    });
  });

  it("enforces deliberately sequential agent execution", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "milestone-loop-sequential-sdk-"),
    );
    temporaryDirectories.push(root);
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const client: CodexClientLike = {
      startThread: vi.fn(() => ({
        runStreamed: async () => ({
          events: (async function* waitForRelease() {
            await gate;
            yield* events();
          })(),
        }),
      })),
      resumeThread: vi.fn(),
    };
    const gateway = new SdkCodexGateway(validConfig(), client);
    const first = gateway.run({
      role: "lightweight-reporting",
      prompt: "First read-only check.",
      workingDirectory: root,
      threadId: null,
      eventLogPath: join(root, "first", "events.jsonl"),
      timeoutMs: 10_000,
      attempt: 1,
      escalationReason: null,
    });
    await Promise.resolve();
    await expect(
      gateway.run({
        role: "lightweight-reporting",
        prompt: "Second read-only check.",
        workingDirectory: root,
        threadId: null,
        eventLogPath: join(root, "second", "events.jsonl"),
        timeoutMs: 10_000,
        attempt: 1,
        escalationReason: null,
      }),
    ).rejects.toThrow(/maximum concurrent/);
    release();
    await expect(first).resolves.toMatchObject({
      threadId: "thread-123",
    });
  });

  it("fails clearly and preserves evidence when a pinned assignment is rejected", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-rejected-sdk-"));
    temporaryDirectories.push(root);
    const client: CodexClientLike = {
      startThread: vi.fn(() => ({
        runStreamed: async () => ({
          events: (async function* rejected(): AsyncGenerator<ThreadEvent> {
            yield { type: "thread.started", thread_id: "rejected-thread" };
            yield { type: "turn.started" };
            yield {
              type: "turn.failed",
              error: { message: "requested model is unavailable" },
            };
          })(),
        }),
      })),
      resumeThread: vi.fn(),
    };
    const gateway = new SdkCodexGateway(validConfig(), client);
    await expect(
      gateway.run({
        role: "planner",
        prompt: "Plan read-only.",
        workingDirectory: root,
        threadId: null,
        eventLogPath: join(root, "events.jsonl"),
        timeoutMs: 10_000,
        attempt: 1,
        escalationReason: null,
      }),
    ).rejects.toThrow(
      /Pinned Codex planner invocation gpt-5\.6-sol\/max failed.*unavailable/,
    );
    expect(
      JSON.parse(await readFile(join(root, "agent-invocation.json"), "utf8")),
    ).toMatchObject({
      requestedModel: "gpt-5.6-sol",
      requestedReasoningEffort: "max",
      threadId: "rejected-thread",
      status: "failed",
      error: "requested model is unavailable",
    });
  });
});
