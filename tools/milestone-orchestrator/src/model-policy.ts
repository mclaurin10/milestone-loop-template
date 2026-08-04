import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AGENT_MODELS,
  AGENT_POLICY_SCHEMA_VERSION,
  AGENT_REASONING_EFFORTS,
  AGENT_ROLES,
  type AgentAssignment,
  type AgentModelPolicy,
  type AgentPolicyOverride,
  type AgentRole,
} from "./contracts.js";

export const PINNED_CODEX_SDK_VERSION = "0.146.0" as const;

const REQUIRED_DEFAULTS: Readonly<Record<AgentRole, AgentAssignment>> = {
  planner: { model: "gpt-5.6-sol", reasoningEffort: "max" },
  "feature-worker-initial": {
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
  },
  "feature-worker-escalated": {
    model: "gpt-5.6-sol",
    reasoningEffort: "max",
  },
  reviewer: { model: "gpt-5.6-sol", reasoningEffort: "max" },
  "lightweight-reporting": {
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  },
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function assignmentErrors(value: unknown, label: string): readonly string[] {
  if (!record(value)) return [`${label} must be an assignment object.`];
  const errors: string[] = [];
  if (!AGENT_MODELS.includes(value["model"] as never))
    errors.push(`${label} uses unsupported model ${String(value["model"])}.`);
  if (value["reasoningEffort"] === "ultra")
    errors.push(`${label} may not use Ultra reasoning.`);
  else if (!AGENT_REASONING_EFFORTS.includes(value["reasoningEffort"] as never))
    errors.push(
      `${label} uses unsupported reasoning effort ${String(value["reasoningEffort"])}.`,
    );
  return errors;
}

export function validateAgentModelPolicy(value: unknown): readonly string[] {
  if (!record(value)) return ["agentPolicy must be an object."];
  const errors: string[] = [];
  if (
    !onlyKeys(value, [
      "schemaVersion",
      "sdk",
      "execution",
      "roles",
      "workerEscalation",
      "overrides",
    ])
  )
    errors.push("agentPolicy has unknown fields.");
  if (value["schemaVersion"] !== AGENT_POLICY_SCHEMA_VERSION)
    errors.push(
      `agentPolicy schemaVersion must be ${AGENT_POLICY_SCHEMA_VERSION}.`,
    );

  const sdk = value["sdk"];
  if (
    !record(sdk) ||
    !onlyKeys(sdk, ["package", "version", "maxEffortTransport"]) ||
    sdk["package"] !== "@openai/codex-sdk" ||
    sdk["version"] !== PINNED_CODEX_SDK_VERSION ||
    sdk["maxEffortTransport"] !== "thread-option-runtime-compatibility"
  )
    errors.push(
      `agentPolicy SDK compatibility must pin @openai/codex-sdk ${PINNED_CODEX_SDK_VERSION} and the audited max-effort thread transport.`,
    );

  const execution = value["execution"];
  if (
    !record(execution) ||
    !onlyKeys(execution, [
      "maximumConcurrentAgentInvocations",
      "proactiveDelegation",
      "ultraAllowed",
    ]) ||
    execution["maximumConcurrentAgentInvocations"] !== 1 ||
    execution["proactiveDelegation"] !== false ||
    execution["ultraAllowed"] !== false
  )
    errors.push(
      "agentPolicy must enforce one concurrent invocation, no proactive delegation, and no Ultra reasoning.",
    );

  const roles = value["roles"];
  if (!record(roles) || !onlyKeys(roles, AGENT_ROLES)) {
    errors.push("agentPolicy roles must define exactly every supported role.");
  } else {
    for (const role of AGENT_ROLES) {
      if (
        record(roles[role]) &&
        !onlyKeys(roles[role], ["model", "reasoningEffort"])
      )
        errors.push(
          `agentPolicy role ${role} must contain only model and reasoningEffort.`,
        );
      errors.push(...assignmentErrors(roles[role], `agentPolicy role ${role}`));
      if (record(roles[role])) {
        const required = REQUIRED_DEFAULTS[role];
        if (
          roles[role]["model"] !== required.model ||
          roles[role]["reasoningEffort"] !== required.reasoningEffort
        )
          errors.push(
            `agentPolicy role ${role} must retain the required default ${required.model}/${required.reasoningEffort}; use an explicit override instead.`,
          );
      }
    }
  }

  const escalation = value["workerEscalation"];
  if (
    !record(escalation) ||
    !onlyKeys(escalation, [
      "substantiveFailureAttempts",
      "repeatedAcceptanceCriterionFailures",
      "replacementThreadOnPolicyChange",
    ]) ||
    escalation["substantiveFailureAttempts"] !== 2 ||
    escalation["repeatedAcceptanceCriterionFailures"] !== 2 ||
    escalation["replacementThreadOnPolicyChange"] !== true
  )
    errors.push(
      "agentPolicy worker escalation must use two substantive/repeated failures and replacement on policy change.",
    );

  const overrides = value["overrides"];
  if (!Array.isArray(overrides)) {
    errors.push("agentPolicy overrides must be an array.");
  } else {
    const seen = new Set<string>();
    overrides.forEach((entry, index) => {
      const label = `agentPolicy override ${index}`;
      if (
        !record(entry) ||
        !onlyKeys(entry, ["role", "model", "reasoningEffort", "reason"])
      ) {
        errors.push(`${label} is malformed.`);
        return;
      }
      if (!AGENT_ROLES.includes(entry["role"] as never))
        errors.push(`${label} uses unsupported role ${String(entry["role"])}.`);
      if (typeof entry["reason"] !== "string" || !entry["reason"].trim())
        errors.push(`${label} requires a nonempty reason.`);
      errors.push(...assignmentErrors(entry, label));
      const role = String(entry["role"]);
      if (seen.has(role)) errors.push(`${label} duplicates role ${role}.`);
      seen.add(role);
    });
  }
  return errors;
}

export function assertAgentModelPolicy(value: unknown): AgentModelPolicy {
  const errors = validateAgentModelPolicy(value);
  if (errors.length > 0)
    throw new Error(`Invalid agent model policy: ${errors.join(" ")}`);
  return value as AgentModelPolicy;
}

export interface ResolvedAgentAssignment extends AgentAssignment {
  readonly overrideApplied: boolean;
  readonly overrideReason: string | null;
}

export function resolveAgentAssignment(
  policy: AgentModelPolicy,
  role: AgentRole,
): ResolvedAgentAssignment {
  const override = policy.overrides.find((entry) => entry.role === role);
  const assignment = override ?? policy.roles[role];
  if (!assignment)
    throw new Error(`No validated model assignment exists for role ${role}.`);
  return {
    model: assignment.model,
    reasoningEffort: assignment.reasoningEffort,
    overrideApplied: override !== undefined,
    overrideReason: override?.reason ?? null,
  };
}

function findPackageManifest(start: string): string {
  let directory = dirname(start);
  while (true) {
    const candidate = resolve(directory, "package.json");
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
        readonly name?: unknown;
      };
      if (parsed.name === "@openai/codex-sdk") return candidate;
    } catch {
      // Continue toward the filesystem root.
    }
    const parent = resolve(directory, "..");
    if (parent === directory)
      throw new Error(
        "Could not locate the installed @openai/codex-sdk manifest.",
      );
    directory = parent;
  }
}

export function installedCodexSdkVersion(): string {
  let entry: string;
  try {
    entry = fileURLToPath(import.meta.resolve("@openai/codex-sdk"));
  } catch (error) {
    throw new Error(
      "Installed @openai/codex-sdk is unavailable; live orchestration cannot start.",
      { cause: error },
    );
  }
  const manifest = JSON.parse(
    readFileSync(findPackageManifest(entry), "utf8"),
  ) as { readonly version?: unknown };
  if (typeof manifest.version !== "string" || !manifest.version)
    throw new Error("Installed @openai/codex-sdk has no readable version.");
  return manifest.version;
}

export function assertInstalledSdkCompatibility(
  policy: AgentModelPolicy,
): void {
  const installed = installedCodexSdkVersion();
  if (installed !== policy.sdk.version)
    throw new Error(
      `Installed @openai/codex-sdk ${installed} is incompatible with policy pin ${policy.sdk.version}.`,
    );
}

export function configuredOverrides(
  policy: AgentModelPolicy,
): readonly AgentPolicyOverride[] {
  return policy.overrides;
}
