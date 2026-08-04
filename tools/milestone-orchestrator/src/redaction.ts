import { delimiter } from "node:path";

const REDACTED = "[REDACTED]";

const sensitiveKeyPattern =
  /(?:api[_-]?key|token|secret|password|passwd|authorization|credential|cookie|private[_-]?key)/i;

const numericUsageKeyPattern =
  /^(?:inputTokens|cachedInputTokens|outputTokens|reasoningOutputTokens|tokenBudget|codexInvocations)$/i;

const textPatterns: readonly [RegExp, string][] = [
  [
    /(\b(?:authorization|proxy-authorization)\s*:\s*bearer\s+)[^\s,;]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b(?:sk|sess|pat|ghp|github_pat)-[A-Za-z0-9_-]{8,}\b/g, REDACTED],
  [
    /(\b[A-Za-z][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)[A-Za-z0-9_]*\s*=\s*)[^\s]+/gi,
    `$1${REDACTED}`,
  ],
  [/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
];

export function redactSensitiveText(value: string): string {
  return textPatterns.reduce(
    (redacted, [pattern, replacement]) =>
      redacted.replace(pattern, replacement),
    value,
  );
}

export function redactSensitiveValue(
  value: unknown,
  key = "",
  depth = 0,
): unknown {
  if (
    sensitiveKeyPattern.test(key) &&
    !(typeof value === "number" && numericUsageKeyPattern.test(key))
  )
    return REDACTED;
  if (depth > 16) return "[TRUNCATED_DEPTH]";
  if (typeof value === "string") {
    const redacted = redactSensitiveText(value);
    return redacted.length > 50_000
      ? `${redacted.slice(0, 50_000)}...[TRUNCATED]`
      : redacted;
  }
  if (Array.isArray(value))
    return value.map((entry) => redactSensitiveValue(entry, key, depth + 1));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        redactSensitiveValue(child, childKey, depth + 1),
      ]),
    );
  }
  return value;
}

export function safeAgentEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const allowed = new Set([
    "ALLUSERSPROFILE",
    "APPDATA",
    "CODEX_HOME",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LANG",
    "LOCALAPPDATA",
    "NO_COLOR",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TERM",
    "TMP",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
  ]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || !allowed.has(key.toUpperCase())) continue;
    result[key] =
      key.toUpperCase() === "PATH"
        ? value
            .split(delimiter)
            .filter(
              (entry) =>
                entry.length > 0 &&
                !/[\\/]node_modules[\\/]\.bin[\\/]?$/i.test(entry),
            )
            .join(delimiter)
        : value;
  }
  return result;
}

export const HIDDEN_FEEDBACK_CATEGORIES = [
  "financial_health",
  "scale_and_demand",
  "guest_satisfaction",
  "breadth_and_diversity",
  "seasonal_resilience",
  "reliability_and_flow",
  "safety_and_preparedness",
  "environmental_performance",
  "accessibility",
  "community_and_workforce",
  "browser_and_headless_performance",
  "integrity_and_persistence",
  "bot_action_compliance",
  "automated_and_operational_chain_coverage",
  "visual_and_interaction_execution",
  "submission_or_evaluator_infrastructure",
] as const;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Hidden validation feedback must be an object.");
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  if (unexpected.length > 0)
    throw new Error(
      `Hidden feedback contains prohibited fields: ${unexpected.join(", ")}.`,
    );
}

export function sanitizeHiddenValidationReceipt(value: unknown): unknown {
  const input = record(value);
  const topKeys = [
    "protocolVersion",
    "hiddenSetId",
    "custodyCommitmentId",
    "milestoneId",
    "candidate",
    "eligibility",
    "runs",
    "seedSuccess",
    "catastrophicIntegrity",
    "categories",
    "overall",
    "severity",
    "receiptTimestamp",
    "signature",
  ];
  exactKeys(input, topKeys);
  const categories = record(input["categories"]);
  const categoryNames = Object.keys(categories);
  if (
    categoryNames.length !== HIDDEN_FEEDBACK_CATEGORIES.length ||
    categoryNames.some(
      (category) =>
        !HIDDEN_FEEDBACK_CATEGORIES.includes(
          category as (typeof HIDDEN_FEEDBACK_CATEGORIES)[number],
        ),
    )
  )
    throw new Error(
      "Hidden feedback must contain exactly the allowlisted aggregate categories.",
    );
  for (const category of HIDDEN_FEEDBACK_CATEGORIES) {
    const result = record(categories[category]);
    exactKeys(result, ["status", "failedRuns"]);
    if (
      !["pass", "fail"].includes(String(result["status"])) ||
      !Number.isSafeInteger(result["failedRuns"]) ||
      Number(result["failedRuns"]) < 0
    )
      throw new Error(`Hidden category ${category} is malformed.`);
  }
  const runs = record(input["runs"]);
  exactKeys(runs, ["attempted", "completed"]);
  const seedSuccess = record(input["seedSuccess"]);
  exactKeys(seedSuccess, ["successful", "total", "rate", "pass"]);
  const integrity = record(input["catastrophicIntegrity"]);
  exactKeys(integrity, ["affectedRuns", "pass"]);
  return redactSensitiveValue(input);
}
