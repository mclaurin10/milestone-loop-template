import type { UsageRecord } from "./contracts.js";

type MeasurableUsage = Pick<
  UsageRecord,
  "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningOutputTokens"
>;

/**
 * Returns cost-weighted token units without double-counting SDK usage fields.
 * Cached input is included in inputTokens, and reasoning output is included in
 * outputTokens. Cached input is weighted at one tenth of uncached input so the
 * configurable ceiling tracks measurable consumption more closely than a raw
 * sum of overlapping counters.
 */
export function measurableTokenUnits(usage: MeasurableUsage): number {
  const cachedInput = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const uncachedInput = Math.max(0, usage.inputTokens - cachedInput);
  return uncachedInput + Math.ceil(cachedInput / 10) + usage.outputTokens;
}
