import { describe, expect, it } from "vitest";

import {
  assertReconciliationTransition,
  assertTransition,
  canTransition,
  canTransitionReconciliation,
} from "./transitions.js";

describe("milestone state transitions", () => {
  it("supports the complete success and retry paths", () => {
    expect(canTransition("proposed", "ready")).toBe(true);
    expect(canTransition("ready", "running")).toBe(true);
    expect(canTransition("running", "verifying")).toBe(true);
    expect(canTransition("verifying", "reviewing")).toBe(true);
    expect(canTransition("reviewing", "completed")).toBe(true);
    expect(canTransition("verifying", "retrying")).toBe(true);
    expect(canTransition("retrying", "running")).toBe(true);
  });

  it("fails terminal and out-of-order transitions clearly", () => {
    expect(() => assertTransition("completed", "running")).toThrow(
      /Invalid milestone transition/,
    );
    expect(() => assertTransition("ready", "completed")).toThrow(
      /ready -> completed/,
    );
    expect(() => assertTransition("escalated", "ready")).toThrow();
  });
});

describe("controller reconciliation transitions", () => {
  it("permits the durable forward path, pre-adoption reset, and explicit failure", () => {
    expect(canTransitionReconciliation("prepared", "verifying")).toBe(true);
    expect(canTransitionReconciliation("verifying", "candidate-verified")).toBe(
      true,
    );
    expect(canTransitionReconciliation("candidate-verified", "reviewing")).toBe(
      true,
    );
    expect(canTransitionReconciliation("reviewing", "review-approved")).toBe(
      true,
    );
    expect(canTransitionReconciliation("review-approved", "adopting")).toBe(
      true,
    );
    expect(canTransitionReconciliation("adopting", "state-adopted")).toBe(true);
    expect(canTransitionReconciliation("state-adopted", "queueing-next")).toBe(
      true,
    );
    expect(canTransitionReconciliation("queueing-next", "completed")).toBe(
      true,
    );
    expect(canTransitionReconciliation("review-approved", "prepared")).toBe(
      true,
    );
    expect(canTransitionReconciliation("reviewing", "failed")).toBe(true);
  });

  it("rejects terminal replay and adoption skipping", () => {
    expect(() =>
      assertReconciliationTransition("completed", "prepared"),
    ).toThrow(/Invalid reconciliation transition/);
    expect(() =>
      assertReconciliationTransition("reviewing", "state-adopted"),
    ).toThrow(/reviewing -> state-adopted/);
  });
});
