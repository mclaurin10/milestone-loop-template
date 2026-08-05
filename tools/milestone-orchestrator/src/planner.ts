import { resolve } from "node:path";

import type {
  MilestoneProposal,
  OrchestratorState,
  PolicyDecision,
  ProjectProfile,
} from "./contracts.js";
import { MILESTONE_OUTPUT_SCHEMA } from "./agent-schemas.js";
import type { CodexGateway } from "./codex-gateway.js";
import { assertMilestoneProposal } from "./schema.js";
import { atomicWriteJson } from "./state-store.js";

function omitNullField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record[field] === null) delete record[field];
  return record;
}

function normalizeStructuredProposal(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const record = { ...(value as Record<string, unknown>) };
  if (Array.isArray(record["verificationCommands"]))
    record["verificationCommands"] = record["verificationCommands"].map(
      (command) => omitNullField(command, "timeoutMs"),
    );
  record["hiddenValidation"] = omitNullField(
    record["hiddenValidation"],
    "checkpointId",
  );
  return record;
}

function plannerPrompt(
  project: ProjectProfile,
  state: OrchestratorState,
  feedback: PolicyDecision | null,
): string {
  const completed = state.milestones
    .filter((milestone) => milestone.status === "completed")
    .map((milestone) => ({
      id: milestone.proposal.id,
      objective: milestone.proposal.objective,
      commit: milestone.commits.at(-1) ?? null,
    }));
  const pending = state.milestones
    .filter(
      (milestone) => !["completed", "escalated"].includes(milestone.status),
    )
    .map((milestone) => ({
      id: milestone.proposal.id,
      status: milestone.status,
    }));
  return [
    `You are the read-only Planner for the ${project.name} autonomous milestone loop.`,
    `Inspect ${project.authorityFile}, AGENTS.md, everything under .agent, relevant docs, tests, current Git state, and verification evidence.`,
    "Propose exactly one bounded next milestone. Do not edit files, invoke hidden validation, reveal or request hidden seeds, or claim completion.",
    "The frozen goal and original evals are immutable. Respect the bootstrap/readiness transition and all scope ceilings.",
    "Use only argv-form verification commands with executables pnpm, node, or git. Include exactly one pnpm verify command with parser pnpm-verify.",
    "Every exit-code command must declare nonempty expectedArtifactKinds naming the command-owned receipt artifact kinds it will produce; the pnpm-verify command must declare expectedArtifactKinds [] because its evidence is the independently parsed authoritative result tree.",
    "The permitted path list must be narrow, objective evidence must exist, and terminal conditions must be explicit.",
    "Use milestone schema 1.2.0. Feature work defaults to one integrated vertical slice: one public user goal/action, smallest shared deterministic rule owner, Standard composition, persistence/replay proof, Node/production-Worker parity proof, one inspectable consequence, a focused command, and full pnpm verify closure.",
    "Use mode exception only for kernel-only, fixture-only, migration-only, or preview-only work, with a justified exact immediate consumer ID and a consumer contract that the next proposal must quote exactly. Tooling, verification, lifecycle, and documentation may use not-applicable with every feature/exception field empty or null.",
    `Verified target commit: ${state.repository.verifiedCommit}.`,
    `Required immediate vertical consumer: ${JSON.stringify(state.requiredNextVerticalConsumer)}.`,
    `Completed milestones: ${JSON.stringify(completed)}.`,
    `Pending milestones: ${JSON.stringify(pending)}.`,
    feedback
      ? `The prior proposal was rejected. Correct every policy finding: ${JSON.stringify(feedback.findings)}.`
      : "There is no prior rejected proposal in this planning attempt.",
    "Return only the structured milestone object requested by the output schema.",
  ].join("\n\n");
}

export async function requestPlan(input: {
  readonly gateway: CodexGateway;
  readonly project: ProjectProfile;
  readonly state: OrchestratorState;
  readonly artifactDirectory: string;
  readonly timeoutMs: number;
  readonly attempt: number;
  readonly priorThreadId: string | null;
  readonly feedback: PolicyDecision | null;
  readonly onThreadStarted?: (threadId: string) => void | Promise<void>;
}): Promise<{
  readonly proposal: MilestoneProposal;
  readonly threadId: string;
}> {
  const turn = await input.gateway.run({
    role: "planner",
    prompt: plannerPrompt(input.project, input.state, input.feedback),
    workingDirectory: input.state.repository.root,
    threadId: input.priorThreadId,
    outputSchema: MILESTONE_OUTPUT_SCHEMA,
    eventLogPath: resolve(input.artifactDirectory, "planner-events.jsonl"),
    timeoutMs: input.timeoutMs,
    attempt: input.attempt,
    escalationReason: null,
    telemetryPhase: "planning",
    ...(input.onThreadStarted
      ? { onThreadStarted: input.onThreadStarted }
      : {}),
  });
  const proposal = assertMilestoneProposal(
    normalizeStructuredProposal(JSON.parse(turn.finalResponse) as unknown),
  );
  await atomicWriteJson(
    resolve(input.artifactDirectory, "planner-proposal.json"),
    proposal,
  );
  return { proposal, threadId: turn.threadId };
}
