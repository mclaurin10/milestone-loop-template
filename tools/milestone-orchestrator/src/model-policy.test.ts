import { describe, expect, it } from "vitest";

import {
  assertAgentModelPolicy,
  installedCodexSdkVersion,
  resolveAgentAssignment,
  validateAgentModelPolicy,
} from "./model-policy.js";
import { loadConfig } from "./config.js";
import { validConfig } from "../test/fixtures.js";

describe("versioned agent model policy", () => {
  it("pins every supported role and the installed SDK explicitly", () => {
    const policy = validConfig().agentPolicy;
    expect(validateAgentModelPolicy(policy)).toEqual([]);
    expect(installedCodexSdkVersion()).toBe("0.146.0");
    expect(resolveAgentAssignment(policy, "planner")).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "max",
      overrideApplied: false,
    });
    expect(
      resolveAgentAssignment(policy, "feature-worker-initial"),
    ).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    });
    expect(
      resolveAgentAssignment(policy, "feature-worker-escalated"),
    ).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "max",
    });
    expect(resolveAgentAssignment(policy, "reviewer")).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "max",
    });
    expect(
      resolveAgentAssignment(policy, "lightweight-reporting"),
    ).toMatchObject({
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
    });
  });

  it.each([
    ["unsupported model", { model: "unknown-model" }],
    ["unsupported effort", { reasoningEffort: "minimal" }],
    ["forbidden Ultra effort", { reasoningEffort: "ultra" }],
  ])("fails closed for %s", (_label, change) => {
    const policy = validConfig().agentPolicy;
    const invalid = {
      ...policy,
      overrides: [
        {
          role: "planner",
          model: "gpt-5.6-sol",
          reasoningEffort: "max",
          reason: "Negative validation fixture.",
          ...change,
        },
      ],
    };
    expect(() => assertAgentModelPolicy(invalid)).toThrow(/unsupported|Ultra/);
  });

  it("rejects silent default changes and unreasoned or duplicate overrides", () => {
    const policy = validConfig().agentPolicy;
    expect(
      validateAgentModelPolicy({
        ...policy,
        roles: {
          ...policy.roles,
          planner: { model: "gpt-5.6-sol", reasoningEffort: "xhigh" },
        },
      }).join(" "),
    ).toContain("use an explicit override");
    expect(
      validateAgentModelPolicy({
        ...policy,
        overrides: [
          {
            role: "reviewer",
            model: "gpt-5.6-sol",
            reasoningEffort: "high",
            reason: "",
          },
          {
            role: "reviewer",
            model: "gpt-5.6-sol",
            reasoningEffort: "medium",
            reason: "Duplicate fixture.",
          },
        ],
      }).join(" "),
    ).toMatch(/nonempty reason.*duplicates role reviewer/);
  });

  it("automatically protects the selected in-repository policy source", async () => {
    const config = await loadConfig(process.cwd());
    expect(config.protectedPaths).toContain(
      "tools/milestone-orchestrator/config/default.json",
    );
    expect(config).toMatchObject({
      cleanupCompletedWorkspaces: true,
      preserveFailedWorkspaces: true,
      evidenceRetention: {
        artifactRoot: "artifacts",
        keepRecentRuns: 20,
      },
    });
  });
});
