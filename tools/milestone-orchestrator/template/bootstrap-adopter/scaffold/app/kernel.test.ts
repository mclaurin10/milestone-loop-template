import { describe, expect, it } from "vitest";

import {
  canonicalCheckpoint,
  initialSmokeState,
  runUserActions,
} from "./kernel.mjs";

describe("bootstrap smoke kernel", () => {
  it("replays user actions deterministically", () => {
    const actions = ["extract", "idle", "extract"];
    const first = runUserActions(actions);
    const replay = runUserActions(actions);

    expect(first).toEqual({ tick: 3, extracted: 4, lastAction: "extract" });
    expect(canonicalCheckpoint(first)).toBe(canonicalCheckpoint(replay));
  });

  it("starts from one canonical frozen state", () => {
    expect(initialSmokeState()).toEqual({
      tick: 0,
      extracted: 0,
      lastAction: null,
    });
  });
});
