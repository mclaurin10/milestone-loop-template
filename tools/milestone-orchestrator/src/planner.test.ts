import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MILESTONE_OUTPUT_SCHEMA,
  REVIEW_OUTPUT_SCHEMA,
} from "./agent-schemas.js";
import type { CodexGateway } from "./codex-gateway.js";
import { requestPlan } from "./planner.js";
import { validConfig, validProposal, validState } from "../test/fixtures.js";

function assertStrictOutputObjects(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  const schema = value as Record<string, unknown>;
  if (schema["type"] === "object") {
    const properties = schema["properties"] as
      Record<string, unknown> | undefined;
    expect(new Set(schema["required"] as readonly string[])).toEqual(
      new Set(Object.keys(properties ?? {})),
    );
  }
  for (const child of Object.values(schema)) {
    if (Array.isArray(child)) child.forEach(assertStrictOutputObjects);
    else assertStrictOutputObjects(child);
  }
}

describe("planner structured output", () => {
  it("requires every declared object property for the live SDK schema", () => {
    assertStrictOutputObjects(MILESTONE_OUTPUT_SCHEMA);
    assertStrictOutputObjects(REVIEW_OUTPUT_SCHEMA);
  });

  it("normalizes nullable structured-output fields into the domain proposal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "milestone-loop-planner-"));
    try {
      const proposal = validProposal();
      const gateway: CodexGateway = {
        run: async (candidate) => {
          expect(candidate.outputSchema).toBe(MILESTONE_OUTPUT_SCHEMA);
          return {
            threadId: "planner-thread",
            finalResponse: JSON.stringify({
              ...proposal,
              verificationCommands: proposal.verificationCommands.map(
                (command) => ({ ...command, timeoutMs: null }),
              ),
              hiddenValidation: {
                ...proposal.hiddenValidation,
                checkpointId: null,
              },
            }),
            usage: null,
            itemCount: 1,
          };
        },
      };
      const result = await requestPlan({
        gateway,
        project: validConfig().project,
        state: validState(process.cwd()),
        artifactDirectory: directory,
        timeoutMs: 10_000,
        attempt: 1,
        priorThreadId: null,
        feedback: null,
      });
      expect(result.proposal).toEqual(proposal);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
