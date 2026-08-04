import { describe, expect, it } from "vitest";

import { measurableTokenUnits } from "./budget.js";

describe("measurable token budget", () => {
  it("does not double-count cached input or reasoning output", () => {
    expect(
      measurableTokenUnits({
        inputTokens: 1_000,
        cachedInputTokens: 800,
        outputTokens: 100,
        reasoningOutputTokens: 60,
      }),
    ).toBe(380);
  });

  it("defensively caps malformed cached usage at total input", () => {
    expect(
      measurableTokenUnits({
        inputTokens: 100,
        cachedInputTokens: 120,
        outputTokens: 10,
        reasoningOutputTokens: 5,
      }),
    ).toBe(20);
  });
});
