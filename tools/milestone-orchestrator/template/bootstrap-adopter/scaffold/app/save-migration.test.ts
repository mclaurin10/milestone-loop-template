import { describe, expect, it } from "vitest";

import {
  canonicalCheckpoint,
  createSaveEnvelope,
  loadSaveEnvelope,
  runUserActions,
} from "./kernel.mjs";

describe("bootstrap save envelope", () => {
  it("continues identically after the versioned save round trip", () => {
    const beforeSave = runUserActions(["extract", "idle"]);
    const loaded = loadSaveEnvelope(createSaveEnvelope(beforeSave));

    expect(canonicalCheckpoint(runUserActions(["extract"], loaded))).toBe(
      canonicalCheckpoint(runUserActions(["extract", "idle", "extract"])),
    );
  });

  it("rejects an unknown save schema", () => {
    expect(() =>
      loadSaveEnvelope({ schemaVersion: "unknown", state: {} }),
    ).toThrow(/Save envelope is invalid/);
  });
});
