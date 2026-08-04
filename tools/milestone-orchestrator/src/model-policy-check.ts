import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CodexGateway } from "./codex-gateway.js";
import { SdkCodexGateway } from "./codex-gateway.js";
import { loadConfig } from "./config.js";
import {
  installedCodexSdkVersion,
  resolveAgentAssignment,
} from "./model-policy.js";
import { redactSensitiveText } from "./redaction.js";
import { atomicWriteJson } from "./state-store.js";

const LIVE_CHECK_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "purpose"],
  properties: {
    status: { type: "string", const: "ok" },
    purpose: { type: "string", const: "model-policy-live-check" },
  },
} as const;

interface GitSnapshot {
  readonly head: string;
  readonly statusSha256: string;
  readonly clean: boolean;
}

const TOOL_ITEM_TYPES = new Set([
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
]);

async function assertNoToolEvents(eventLogPath: string): Promise<void> {
  let events: unknown[];
  try {
    events = (await readFile(eventLogPath, "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  } catch (error) {
    throw new Error("Live model-policy check could not parse its event log.", {
      cause: error,
    });
  }
  const records = events.filter(
    (event): event is Record<string, unknown> =>
      typeof event === "object" && event !== null && !Array.isArray(event),
  );
  if (
    !records.some((event) => event["type"] === "thread.started") ||
    !records.some((event) => event["type"] === "turn.completed") ||
    !records.some((event) => {
      const item = event["item"];
      return (
        event["type"] === "item.completed" &&
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>)["type"] === "agent_message"
      );
    })
  )
    throw new Error("Live model-policy event evidence is incomplete.");
  if (
    records.some((event) => {
      const item = event["item"];
      return (
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item) &&
        TOOL_ITEM_TYPES.has(String((item as Record<string, unknown>)["type"]))
      );
    })
  )
    throw new Error("Live model-policy thread unexpectedly invoked a tool.");
}

function git(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Live model-policy check cannot inspect Git: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout;
}

function gitSnapshot(repositoryRoot: string): GitSnapshot {
  const status = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  return {
    head: git(repositoryRoot, ["rev-parse", "HEAD"]).trim(),
    statusSha256: createHash("sha256").update(status).digest("hex"),
    clean: status.trim().length === 0,
  };
}

export interface LiveModelPolicyCheckResult {
  readonly schemaVersion: "1.0.0";
  readonly status: "PASS";
  readonly role: "lightweight-reporting";
  readonly requestedModel: string;
  readonly requestedReasoningEffort: string;
  readonly resolvedModel: null;
  readonly resolvedReasoningEffort: null;
  readonly resolutionLimitation: string;
  readonly threadId: string;
  readonly sdkVersion: string;
  readonly overrideApplied: boolean;
  readonly overrideReason: string | null;
  readonly repositoryBefore: GitSnapshot;
  readonly repositoryAfter: GitSnapshot;
  readonly repositoryUnchanged: true;
  readonly invocationArtifactPath: string;
  readonly eventLogPath: string;
  readonly resultPath: string;
  readonly checkedAt: string;
}

export async function runLiveModelPolicyCheck(
  input: {
    readonly repositoryRoot: string;
    readonly configPath?: string;
  },
  dependencies: {
    readonly gateway?: CodexGateway;
    readonly now?: () => Date;
    readonly id?: () => string;
  } = {},
): Promise<LiveModelPolicyCheckResult> {
  const root = resolve(input.repositoryRoot);
  const config = await loadConfig(root, input.configPath);
  const now = dependencies.now ?? (() => new Date());
  const id =
    dependencies.id?.() ??
    `model-policy-live-${now()
      .toISOString()
      .replaceAll(/[^0-9]/g, "")
      .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const directory = resolve(root, config.artifactRoot, id);
  await mkdir(directory, { recursive: true });
  const eventLogPath = resolve(directory, "events.jsonl");
  const invocationArtifactPath = resolve(directory, "agent-invocation.json");
  const resultPath = resolve(directory, "live-model-policy-check.json");
  const before = gitSnapshot(root);
  const role = "lightweight-reporting" as const;
  const assignment = resolveAgentAssignment(config.agentPolicy, role);
  const gateway = dependencies.gateway ?? new SdkCodexGateway(config);
  const turn = await gateway.run({
    role,
    prompt: [
      "This is a harmless read-only model-policy integration check.",
      "Do not inspect repository files, invoke tools, access credentials, edit anything, spawn agents, or contact external services.",
      'Return exactly the requested JSON object: {"status":"ok","purpose":"model-policy-live-check"}.',
    ].join("\n"),
    workingDirectory: root,
    threadId: null,
    outputSchema: LIVE_CHECK_OUTPUT_SCHEMA,
    eventLogPath,
    timeoutMs: config.limits.codexTurnMs,
    attempt: 1,
    escalationReason: null,
  });
  await assertNoToolEvents(eventLogPath);
  let response: unknown;
  try {
    response = JSON.parse(turn.finalResponse) as unknown;
  } catch (error) {
    throw new Error("Live model-policy thread returned invalid JSON.", {
      cause: error,
    });
  }
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    (response as Record<string, unknown>)["status"] !== "ok" ||
    (response as Record<string, unknown>)["purpose"] !==
      "model-policy-live-check" ||
    Object.keys(response).length !== 2
  )
    throw new Error("Live model-policy thread returned the wrong contract.");
  let invocationEvidence: unknown;
  try {
    invocationEvidence = JSON.parse(
      await readFile(invocationArtifactPath, "utf8"),
    ) as unknown;
  } catch (error) {
    throw new Error(
      "Live model-policy check could not read its invocation artifact.",
      { cause: error },
    );
  }
  if (
    typeof invocationEvidence !== "object" ||
    invocationEvidence === null ||
    Array.isArray(invocationEvidence) ||
    (invocationEvidence as Record<string, unknown>)["schemaVersion"] !==
      "1.0.0" ||
    (invocationEvidence as Record<string, unknown>)["role"] !== role ||
    (invocationEvidence as Record<string, unknown>)["requestedModel"] !==
      assignment.model ||
    (invocationEvidence as Record<string, unknown>)[
      "requestedReasoningEffort"
    ] !== assignment.reasoningEffort ||
    (invocationEvidence as Record<string, unknown>)["resolvedModel"] !== null ||
    (invocationEvidence as Record<string, unknown>)[
      "resolvedReasoningEffort"
    ] !== null ||
    (invocationEvidence as Record<string, unknown>)["threadId"] !==
      turn.threadId ||
    (invocationEvidence as Record<string, unknown>)["attempt"] !== 1 ||
    (invocationEvidence as Record<string, unknown>)["status"] !== "completed" ||
    (invocationEvidence as Record<string, unknown>)["overrideApplied"] !==
      assignment.overrideApplied
  )
    throw new Error(
      "Live model-policy invocation artifact does not match the requested SDK path.",
    );
  const after = gitSnapshot(root);
  if (
    before.head !== after.head ||
    before.statusSha256 !== after.statusSha256 ||
    before.clean !== after.clean
  )
    throw new Error(
      "Read-only live model-policy check changed repository state.",
    );
  const result: LiveModelPolicyCheckResult = {
    schemaVersion: "1.0.0",
    status: "PASS",
    role,
    requestedModel: assignment.model,
    requestedReasoningEffort: assignment.reasoningEffort,
    resolvedModel: null,
    resolvedReasoningEffort: null,
    resolutionLimitation:
      "@openai/codex-sdk 0.146.0 thread events expose the thread ID and usage, but not resolved model or reasoning effort; the invocation artifact proves the exact requested thread options.",
    threadId: turn.threadId,
    sdkVersion: installedCodexSdkVersion(),
    overrideApplied: assignment.overrideApplied,
    overrideReason:
      assignment.overrideReason === null
        ? null
        : redactSensitiveText(assignment.overrideReason),
    repositoryBefore: before,
    repositoryAfter: after,
    repositoryUnchanged: true,
    invocationArtifactPath,
    eventLogPath,
    resultPath,
    checkedAt: now().toISOString(),
  };
  await atomicWriteJson(resultPath, result);
  return result;
}
