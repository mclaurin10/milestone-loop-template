import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexGateway } from "./codex-gateway.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { validConfig, validReconciliationRecord } from "../test/fixtures.js";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

describe("deterministic controller operations", () => {
  it("opens status/dry-run state without invoking an agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-deterministic-"));
    directories.push(root);
    const config = validConfig();
    for (const file of config.protectedPaths) {
      const path = join(root, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${file}\n`, "utf8");
    }
    const configPath = join(
      root,
      "tools/milestone-orchestrator/config/default.json",
    );
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeFile(join(root, ".gitignore"), "artifacts/\n", "utf8");
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Deterministic Test");
    git(root, "config", "user.email", "deterministic@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-m", "fixture");

    const run = vi.fn<CodexGateway["run"]>();
    const orchestrator = await MilestoneOrchestrator.open(root, undefined, {
      gateway: { run },
      now: () => new Date("2026-08-02T00:00:00.000Z"),
      createRunId: () => "must-not-start",
    });
    const status = orchestrator.statusSummary() as Record<string, unknown>;
    expect(run).not.toHaveBeenCalled();
    expect(status["nextAllowedAction"]).toBe("plan");
    expect(
      JSON.parse(
        await readFile(
          join(root, "artifacts/orchestrator/state/state.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      run: { status: "idle", agentInvocations: [] },
    });

    const statePath = join(root, "artifacts/orchestrator/state/state.json");
    const stored = JSON.parse(await readFile(statePath, "utf8")) as Record<
      string,
      unknown
    >;
    const record = validReconciliationRecord({
      sourceVerifiedCommit: git(root, "rev-parse", "HEAD"),
    });
    stored["controllerHistory"] = [
      {
        schemaVersion: "1.0.0",
        id: record.sourceArchiveId,
        rawSourceState: record.sourceState,
        sourceStateSchemaVersion: "1.2.0",
        sourceRevision: stored["revision"],
        priorVerifiedCommit: record.sourceVerifiedCommit,
        priorRun: stored["run"],
        priorQueue: stored["queue"],
        priorActiveMilestoneId: stored["activeMilestoneId"],
        priorNextAllowedAction: stored["nextAllowedAction"],
        archivedAt: "2026-08-02T00:00:00.000Z",
        reason: "external-integration-reconciliation",
      },
    ];
    stored["reconciliation"] = { active: record, history: [] };
    stored["nextAllowedAction"] = "reconcile";
    const activeText = `${JSON.stringify(stored, null, 2)}\n`;
    await writeFile(statePath, activeText);

    await expect(
      MilestoneOrchestrator.open(root, undefined, {
        gateway: { run },
        now: () => new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/reconciliation must resume/);
    expect(await readFile(statePath, "utf8")).toBe(activeText);
  }, 15_000);
});
