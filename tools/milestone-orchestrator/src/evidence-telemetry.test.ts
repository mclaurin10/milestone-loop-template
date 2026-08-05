import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { beginDirectTelemetry } from "../../evidence.mjs";

describe("direct telemetry begin degradation", () => {
  const temporaryDirectories: string[] = [];
  const savedParentManaged = process.env["LOOP_TELEMETRY_PARENT_MANAGED"];

  afterEach(async () => {
    if (savedParentManaged === undefined)
      delete process.env["LOOP_TELEMETRY_PARENT_MANAGED"];
    else process.env["LOOP_TELEMETRY_PARENT_MANAGED"] = savedParentManaged;
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("degrades to null instead of failing the command when the store cannot open", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "evidence-telemetry-"));
    temporaryDirectories.push(repositoryRoot);
    delete process.env["LOOP_TELEMETRY_PARENT_MANAGED"];
    // A file squatting on the artifacts root makes TelemetryStore.open fail
    // while everything else about the evidence command stays healthy.
    await writeFile(join(repositoryRoot, "artifacts"), "not a directory");
    const manualEvidence = {
      telemetry: { runId: null, manifestPath: null },
    };
    const context = {
      repositoryRoot,
      commandId: "fixture-command",
      stageId: "fixture-stage",
      artifactDirectory: join(repositoryRoot, "evidence"),
      manualEvidence,
    };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockReturnValue(true as never);
    try {
      const handle = await beginDirectTelemetry(context, {});
      expect(handle).toBeNull();
      expect(manualEvidence.telemetry).toEqual({
        runId: null,
        manifestPath: null,
      });
      expect(stderrSpy.mock.calls.map(String).join("")).toContain(
        "Telemetry begin failed (non-semantic)",
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
