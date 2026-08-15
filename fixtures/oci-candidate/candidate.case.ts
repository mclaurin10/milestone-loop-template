import { describe, expect, it } from "vitest";

import { containedValue } from "./candidate.js";

describe("real contained Vitest", () => {
  it("executes candidate TypeScript through the real runner", () => {
    expect(containedValue(21)).toBe(42);
  });
});
