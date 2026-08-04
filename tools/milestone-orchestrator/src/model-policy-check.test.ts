import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runLiveModelPolicyCheck } from "./model-policy-check.js";
import type { CodexGateway } from "./codex-gateway.js";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
}

describe("live model-policy check wrapper", () => {
  it("uses only the explicitly pinned lightweight role and leaves Git unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "milestone-loop-live-policy-"));
    directories.push(root);
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Model Policy Test");
    git(root, "config", "user.email", "model-policy@example.invalid");
    const { mkdir, writeFile, readFile } = await import("node:fs/promises");
    await mkdir(join(root, "tools/milestone-orchestrator/config"), {
      recursive: true,
    });
    await writeFile(
      join(root, "tools/milestone-orchestrator/config/default.json"),
      await readFile(
        join(process.cwd(), "tools/milestone-orchestrator/config/default.json"),
        "utf8",
      ),
      "utf8",
    );
    await writeFile(join(root, "tracked.txt"), "unchanged\n", "utf8");
    await writeFile(join(root, ".gitignore"), "artifacts/\n", "utf8");
    git(root, "add", ".");
    git(root, "commit", "-m", "fixture");

    const run = vi.fn<CodexGateway["run"]>(async (invocation) => {
      expect(invocation).toMatchObject({
        role: "lightweight-reporting",
        attempt: 1,
        escalationReason: null,
        threadId: null,
      });
      await mkdir(dirname(invocation.eventLogPath), { recursive: true });
      await writeFile(
        join(dirname(invocation.eventLogPath), "agent-invocation.json"),
        `${JSON.stringify({
          schemaVersion: "1.0.0",
          role: "lightweight-reporting",
          requestedModel: "gpt-5.6-terra",
          requestedReasoningEffort: "medium",
          resolvedModel: null,
          resolvedReasoningEffort: null,
          threadId: "live-policy-thread",
          attempt: 1,
          status: "completed",
          overrideApplied: false,
        })}\n`,
        "utf8",
      );
      await writeFile(
        invocation.eventLogPath,
        [
          JSON.stringify({
            type: "thread.started",
            thread_id: "live-policy-thread",
          }),
          JSON.stringify({ type: "turn.started" }),
          JSON.stringify({
            type: "item.completed",
            item: {
              id: "message",
              type: "agent_message",
              text: '{"status":"ok","purpose":"model-policy-live-check"}',
            },
          }),
          JSON.stringify({ type: "turn.completed", usage: {} }),
          "",
        ].join("\n"),
        "utf8",
      );
      return {
        threadId: "live-policy-thread",
        finalResponse: '{"status":"ok","purpose":"model-policy-live-check"}',
        usage: null,
        itemCount: 1,
      };
    });
    const result = await runLiveModelPolicyCheck(
      { repositoryRoot: root },
      {
        gateway: { run },
        now: () => new Date("2026-08-02T00:00:00.000Z"),
        id: () => "model-policy-test",
      },
    );
    expect(run).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "PASS",
      role: "lightweight-reporting",
      requestedModel: "gpt-5.6-terra",
      requestedReasoningEffort: "medium",
      resolvedModel: null,
      resolvedReasoningEffort: null,
      repositoryUnchanged: true,
    });
  }, 15_000);
});
