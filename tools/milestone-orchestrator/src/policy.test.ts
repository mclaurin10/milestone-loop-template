import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertRequiredVerticalConsumerStart,
  createMilestoneRecord,
  requiredVerticalConsumerAfterCompletion,
} from "./milestone-state.js";
import { evaluateProposal, enforceDiffPolicy, globMatches } from "./policy.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { assertMilestoneProposal } from "./schema.js";
import {
  validConfig,
  validFeatureProposal,
  validProposal,
  validState,
} from "../test/fixtures.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("milestone policy", () => {
  it("accepts a bounded evidence-backed tooling proposal", () => {
    expect(
      evaluateProposal(
        validProposal(),
        validState(process.cwd()),
        validConfig(),
        "bootstrap",
      ),
    ).toMatchObject({ status: "accepted", findings: [] });
  });

  it("rejects protected, repository-wide, and hidden-dependent proposals", () => {
    const state = validState(process.cwd());
    const config = validConfig();
    const protectedDecision = evaluateProposal(
      validProposal({ permittedPaths: ["evals/**"] }),
      state,
      config,
      "bootstrap",
    );
    expect(protectedDecision.findings.map((item) => item.code)).toContain(
      "PROTECTED_SCOPE",
    );
    expect(
      evaluateProposal(
        validProposal({ permittedPaths: ["**"] }),
        state,
        config,
        "bootstrap",
      ).findings.map((item) => item.code),
    ).toContain("UNBOUNDED_SCOPE");
    expect(
      evaluateProposal(
        validProposal({
          hiddenValidation: { requested: true, checkpointId: "HV-01" },
        }),
        state,
        config,
        "bootstrap",
      ).findings.map((item) => item.code),
    ).toContain("HIDDEN_VALIDATION_DISABLED");
  });

  it("rejects feature before the one-way readiness transition", () => {
    expect(
      evaluateProposal(
        validProposal({ kind: "feature" }),
        validState(process.cwd()),
        validConfig(),
        "bootstrap",
      ).findings.map((item) => item.code),
    ).toContain("BOOTSTRAP_GAMEPLAY_FORBIDDEN");
  });

  it("accepts one fully integrated feature slice in readiness", () => {
    expect(
      evaluateProposal(
        validFeatureProposal(),
        validState(process.cwd()),
        validConfig(),
        "readiness",
      ),
    ).toMatchObject({ status: "accepted", findings: [] });
  });

  it("accepts the tracked example next milestone without starting it", async () => {
    const proposal = assertMilestoneProposal(
      JSON.parse(
        await readFile(
          resolve(repositoryRoot, ".agent", "next-milestone.json"),
          "utf8",
        ),
      ) as unknown,
    );
    expect(
      evaluateProposal(
        proposal,
        validState(repositoryRoot),
        validConfig(),
        "readiness",
      ),
    ).toMatchObject({ status: "accepted", findings: [] });
    expect(proposal.id).toBe("example-first-milestone");
    expect(proposal.dependencies).toEqual([]);
    expect(proposal.verticalSlice).toMatchObject({
      mode: "not-applicable",
      userGoal: null,
      exception: null,
    });
    expect(proposal.requiredTests).toEqual(
      proposal.verificationCommands.map(
        (command) => `${command.executable} ${command.args.join(" ")}`,
      ),
    );
  });

  it("reports each missing integrated feature dimension", () => {
    const proposal = validFeatureProposal({
      verticalSlice: {
        mode: "integrated",
        userGoal: null,
        publicActionKinds: [],
        sharedRuleOwners: [],
        standardCompositionOwner: null,
        persistenceReplayEvidence: [],
        nodeWorkerParityEvidence: [],
        inspectableConsequence: null,
        exception: null,
      },
    });
    const codes = evaluateProposal(
      proposal,
      validState(process.cwd()),
      validConfig(),
      "readiness",
    ).findings.map((finding) => finding.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "PUBLIC_ACTION_REQUIRED",
        "SHARED_RULE_OWNER_REQUIRED",
        "STANDARD_COMPOSITION_REQUIRED",
        "PERSISTENCE_REPLAY_REQUIRED",
        "NODE_WORKER_PARITY_REQUIRED",
        "INSPECTABLE_CONSEQUENCE_REQUIRED",
      ]),
    );
  });

  it("allows only a justified narrow exception with a future immediate consumer", () => {
    const exception = validFeatureProposal({
      id: "utility-kernel",
      verticalSlice: {
        mode: "exception",
        userGoal: null,
        publicActionKinds: [],
        sharedRuleOwners: [],
        standardCompositionOwner: null,
        persistenceReplayEvidence: [],
        nodeWorkerParityEvidence: [],
        inspectableConsequence: null,
        exception: {
          kind: "kernel-only",
          justification:
            "The shared connectivity kernel must land with its named immediate UI consumer.",
          immediateConsumerMilestoneId: "utility-kernel-consumer",
          consumerContract:
            "Compose the utility connectivity kernel through the Standard public action.",
        },
      },
    });
    expect(
      evaluateProposal(
        exception,
        validState(process.cwd()),
        validConfig(),
        "readiness",
      ),
    ).toMatchObject({ status: "accepted", findings: [] });
    const required = requiredVerticalConsumerAfterCompletion(null, exception);
    expect(required).toEqual({
      sourceMilestoneId: "utility-kernel",
      consumerMilestoneId: "utility-kernel-consumer",
      consumerContractSha256: createHash("sha256")
        .update(exception.verticalSlice!.exception!.consumerContract)
        .digest("hex"),
    });
    expect(() =>
      assertRequiredVerticalConsumerStart(
        {
          ...validState(process.cwd()),
          requiredNextVerticalConsumer: required,
        },
        "unrelated-tooling",
      ),
    ).toThrow(/must immediately consume/);
    expect(
      requiredVerticalConsumerAfterCompletion(
        required,
        validFeatureProposal({ id: "utility-kernel-consumer" }),
      ),
    ).toBeNull();

    const missing = evaluateProposal(
      validFeatureProposal({
        id: "invalid-kernel",
        verticalSlice: {
          ...exception.verticalSlice!,
          exception: null,
        },
      }),
      validState(process.cwd()),
      validConfig(),
      "readiness",
    );
    expect(missing.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "EXCEPTION_JUSTIFICATION_REQUIRED",
        "IMMEDIATE_CONSUMER_REQUIRED",
      ]),
    );
  });

  it("blocks every unrelated or contract-mismatched proposal until the exact consumer", () => {
    const consumerContract =
      "Compose the utility connectivity kernel through the Standard public action.";
    const source = validFeatureProposal({
      id: "utility-kernel",
      verticalSlice: {
        mode: "exception",
        userGoal: null,
        publicActionKinds: [],
        sharedRuleOwners: [],
        standardCompositionOwner: null,
        persistenceReplayEvidence: [],
        nodeWorkerParityEvidence: [],
        inspectableConsequence: null,
        exception: {
          kind: "kernel-only",
          justification: "A narrow precursor with one exact consumer.",
          immediateConsumerMilestoneId: "utility-kernel-consumer",
          consumerContract,
        },
      },
    });
    const sourceRecord = {
      ...createMilestoneRecord(source, "2026-08-04T00:00:00.000Z"),
      status: "completed" as const,
    };
    const state = {
      ...validState(process.cwd()),
      milestones: [sourceRecord],
      requiredNextVerticalConsumer: {
        sourceMilestoneId: source.id,
        consumerMilestoneId: "utility-kernel-consumer",
        consumerContractSha256: createHash("sha256")
          .update(consumerContract)
          .digest("hex"),
      },
    };
    expect(
      evaluateProposal(
        validProposal({ id: "unrelated-tooling" }),
        state,
        validConfig(),
        "readiness",
      ).findings.map((finding) => finding.code),
    ).toContain("REQUIRED_CONSUMER_MISMATCH");

    const consumer = validFeatureProposal({
      id: "utility-kernel-consumer",
      objective:
        "Expose the completed utility kernel through one Standard public footprint action.",
      rationale:
        "The immediate consumer turns the bounded precursor into one inspectable user consequence.",
      dependencies: [source.id],
      acceptanceCriteria: [
        {
          id: "consumer-contract",
          description: "The immediate consumer composes the precursor.",
          evidence: consumerContract,
        },
      ],
    });
    expect(
      evaluateProposal(consumer, state, validConfig(), "readiness"),
    ).toMatchObject({ status: "accepted", findings: [] });
  });

  it("rejects a multi-goal or whole-product-spine worker attempt", () => {
    const decision = evaluateProposal(
      validFeatureProposal({
        objective:
          "Build catalog, checkout, billing, search, inventory, and shipping in one attempt.",
        verticalSlice: {
          ...validFeatureProposal().verticalSlice!,
          userGoal:
            "Build the utility footprint and then operate the entire platform.",
        },
      }),
      validState(process.cwd()),
      validConfig(),
      "readiness",
    );
    expect(decision.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "PUBLIC_ACTION_REQUIRED",
        "VERTICAL_SLICE_REQUIRED",
      ]),
    );
  });

  it("enforces protected and permitted paths on the actual diff", () => {
    const result = enforceDiffPolicy(
      ["tools/milestone-orchestrator/src/cli.ts", "PROJECT_GOAL.md"],
      validProposal(),
      validConfig().protectedPaths,
    );
    expect(result.allowed).toBe(false);
    expect(result.protectedChanges).toEqual(["PROJECT_GOAL.md"]);
    expect(result.outOfScopeChanges).toEqual(["PROJECT_GOAL.md"]);
    expect(globMatches("tools/**", "tools/a/b.ts")).toBe(true);
  });

  it("rejects every canonical controller trust root, including case variants", () => {
    const canonical = buildCanonicalProtectedSet(validConfig());
    for (const path of canonical) {
      const caseVariant =
        path.toUpperCase() === path ? path.toLowerCase() : path.toUpperCase();
      for (const probe of [path, caseVariant]) {
        const decision = enforceDiffPolicy(
          [probe],
          validProposal({ permittedPaths: [probe] }),
          canonical,
        );
        expect(decision.allowed).toBe(false);
        expect(decision.protectedChanges).toEqual([probe]);
      }
    }
  });

  it("rejects a compromised-verifier proposal before any command execution", () => {
    const verifierProposal = validProposal({
      permittedPaths: ["scripts/verify.mjs"],
    });
    const decision = evaluateProposal(
      verifierProposal,
      validState(process.cwd()),
      validConfig(),
      "bootstrap",
    );
    expect(decision.status).toBe("rejected");
    expect(decision.findings.map((finding) => finding.code)).toContain(
      "PROTECTED_SCOPE",
    );

    const diff = enforceDiffPolicy(
      ["scripts/verify.mjs"],
      verifierProposal,
      buildCanonicalProtectedSet(validConfig()),
    );
    expect(diff.allowed).toBe(false);
    expect(diff.protectedChanges).toEqual(["scripts/verify.mjs"]);

    const agents = evaluateProposal(
      validProposal({ permittedPaths: ["AGENTS.md"] }),
      validState(process.cwd()),
      validConfig(),
      "bootstrap",
    );
    expect(agents.status).toBe("rejected");
    const caseOverlap = evaluateProposal(
      validProposal({ permittedPaths: ["agents.MD"] }),
      validState(process.cwd()),
      validConfig(),
      "bootstrap",
    );
    expect(caseOverlap.findings.map((finding) => finding.code)).toContain(
      "PROTECTED_SCOPE",
    );
  });

  it("rejects traversal scope and unsafe verifier argv", () => {
    const traversal = evaluateProposal(
      validProposal({ permittedPaths: ["../outside/**"] }),
      validState(process.cwd()),
      validConfig(),
      "bootstrap",
    );
    expect(traversal.findings.map((finding) => finding.code)).toContain(
      "UNSAFE_SCOPE_PATH",
    );
    const command = evaluateProposal(
      validProposal({
        verificationCommands: [
          {
            id: "unsafe",
            executable: "node",
            args: ["-e", "process.exit(0)"],
            parser: "exit-code",
          },
          {
            id: "authoritative",
            executable: "pnpm",
            args: ["verify"],
            parser: "pnpm-verify",
          },
        ],
      }),
      validState(process.cwd()),
      validConfig(),
      "bootstrap",
    );
    expect(command.findings.map((finding) => finding.code)).toContain(
      "UNSAFE_VERIFICATION_COMMAND",
    );
  });
});
