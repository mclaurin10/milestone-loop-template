import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canaryMilestone, CANARY_MILESTONE_ID } from "./canary.js";
import { loadConfig } from "./config.js";
import { runDoctorDiagnostic } from "./doctor.js";
import { runLiveModelPolicyCheck } from "./model-policy-check.js";
import { MilestoneOrchestrator } from "./orchestrator.js";
import { ReconciliationController } from "./reconciliation.js";
import { redactSensitiveValue } from "./redaction.js";
import { demonstrateSafety } from "./safety-demonstration.js";

export interface LoopCliArguments {
  readonly command: string;
  readonly configPath?: string;
  readonly one: boolean;
  readonly json: boolean;
  readonly candidate?: string;
  readonly nextProposalPath?: string;
  readonly reason?: string;
}

export function parseArguments(values: readonly string[]): LoopCliArguments {
  const command = values[0];
  if (!command) throw new Error("Missing loop command.");
  let configPath: string | undefined;
  let one = false;
  let json = false;
  let candidate: string | undefined;
  let nextProposalPath: string | undefined;
  let reason: string | undefined;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--one") one = true;
    else if (value === "--json") json = true;
    else if (value === "--config") {
      const candidate = values[index + 1];
      if (!candidate) throw new Error("--config requires a path.");
      configPath = candidate;
      index += 1;
    } else if (value === "--candidate") {
      const requested = values[index + 1];
      if (!requested) throw new Error("--candidate requires a revision.");
      candidate = requested;
      index += 1;
    } else if (value === "--next-proposal") {
      const requested = values[index + 1];
      if (!requested) throw new Error("--next-proposal requires a path.");
      nextProposalPath = requested;
      index += 1;
    } else if (value === "--reason") {
      const requested = values[index + 1];
      if (!requested) throw new Error("--reason requires a value.");
      reason = requested;
      index += 1;
    } else if (value !== "--") {
      throw new Error(`Unknown loop argument: ${value}.`);
    }
  }
  return {
    command,
    ...(configPath ? { configPath } : {}),
    one,
    json,
    ...(candidate ? { candidate } : {}),
    ...(nextProposalPath ? { nextProposalPath } : {}),
    ...(reason ? { reason } : {}),
  };
}

export function assertCommandArguments(args: LoopCliArguments): void {
  const commands = [
    "status",
    "doctor",
    "check-model-policy",
    "plan",
    "run",
    "resume",
    "reconcile",
    "reconcile-status",
    "dry-run",
    "canary",
    "demo-safety",
  ];
  if (!commands.includes(args.command))
    throw new Error(
      `Unknown loop command ${args.command}. Expected ${commands.join(", ")}.`,
    );
  const hasRangeArgument = Boolean(
    args.candidate || args.nextProposalPath || args.reason,
  );
  if (args.command !== "reconcile" && hasRangeArgument)
    throw new Error(
      `${args.command} does not accept --candidate, --next-proposal, or --reason.`,
    );
  if (
    args.command === "reconcile" &&
    (!args.candidate || !args.nextProposalPath || !args.reason?.trim())
  )
    throw new Error(
      "reconcile requires --candidate, --next-proposal, and --reason.",
    );
}

function repositoryRoot(start: string): string {
  let current = resolve(start);
  while (!existsSync(resolve(current, "SKI_TYCOON_GOAL.md"))) {
    const parent = resolve(current, "..");
    if (parent === current)
      throw new Error("Could not locate the Ski Tycoon repository root.");
    current = parent;
  }
  return current;
}

function output(value: unknown, _json: boolean): void {
  process.stdout.write(
    `${JSON.stringify(redactSensitiveValue(value), null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  assertCommandArguments(args);
  const root = repositoryRoot(process.cwd());
  if (args.command === "demo-safety") {
    const config = await loadConfig(root, args.configPath);
    const result = await demonstrateSafety({
      repositoryRoot: root,
      config,
      artifactDirectory: resolve(
        root,
        config.artifactRoot,
        "safety-demonstration",
      ),
    });
    output(result, args.json);
    return;
  }
  if (args.command === "doctor") {
    output(
      await runDoctorDiagnostic({
        repositoryRoot: root,
        ...(args.configPath ? { configPath: args.configPath } : {}),
      }),
      args.json,
    );
    return;
  }
  if (args.command === "check-model-policy") {
    output(
      await runLiveModelPolicyCheck({
        repositoryRoot: root,
        ...(args.configPath ? { configPath: args.configPath } : {}),
      }),
      args.json,
    );
    return;
  }
  const reconciliation = await ReconciliationController.openIfPresent(
    root,
    args.configPath,
  );
  if (args.command === "reconcile-status") {
    if (!reconciliation)
      throw new Error(
        "No controller state exists to inspect for reconciliation.",
      );
    output(reconciliation.status(), args.json);
    return;
  }
  if (args.command === "reconcile") {
    if (!reconciliation)
      throw new Error(
        "Reconciliation cannot initialize over missing controller state.",
      );
    output(
      await reconciliation.run({
        candidate: args.candidate!,
        nextProposalPath: args.nextProposalPath!,
        reason: args.reason!,
      }),
      args.json,
    );
    return;
  }
  if (reconciliation?.state.reconciliation.active) {
    if (args.command === "resume") {
      output(await reconciliation.run(), args.json);
      return;
    }
    if (args.command === "status") {
      output(reconciliation.status(), args.json);
      return;
    }
    if (args.command === "dry-run") {
      output(
        {
          mode: "dry-run",
          codexInvocations: 0,
          repositoryMutation: false,
          wouldTakeAction: "reconcile",
          status: reconciliation.status(),
        },
        args.json,
      );
      return;
    }
    throw new Error(
      "An active reconciliation must resume before ordinary loop actions.",
    );
  }
  const orchestrator = await MilestoneOrchestrator.open(root, args.configPath);
  switch (args.command) {
    case "status":
      output(orchestrator.statusSummary(), args.json);
      return;
    case "dry-run":
      output(
        {
          mode: "dry-run",
          codexInvocations: 0,
          repositoryMutation: false,
          wouldTakeAction: orchestrator.state.nextAllowedAction,
          status: orchestrator.statusSummary(),
        },
        args.json,
      );
      return;
    case "plan":
      output(await orchestrator.planOnly(), args.json);
      return;
    case "run":
    case "resume":
      output(
        await orchestrator.run({
          ...(args.one ? { maximumMilestones: 1 } : {}),
        }),
        args.json,
      );
      return;
    case "canary": {
      const completed = orchestrator.state.milestones.find(
        (milestone) =>
          milestone.proposal.id === CANARY_MILESTONE_ID &&
          milestone.status === "completed",
      );
      if (completed) {
        output(
          {
            status: "already-completed",
            milestoneId: CANARY_MILESTONE_ID,
            commits: completed.commits,
            state: orchestrator.statusSummary(),
          },
          args.json,
        );
        return;
      }
      const existing = orchestrator.state.milestones.some(
        (milestone) => milestone.proposal.id === CANARY_MILESTONE_ID,
      );
      if (!existing) {
        const decision = await orchestrator.enqueue(canaryMilestone());
        if (decision.status !== "accepted")
          throw new Error(
            `Built-in canary failed policy: ${decision.findings.map((finding) => finding.message).join(" ")}`,
          );
      }
      output(await orchestrator.run({ maximumMilestones: 1 }), args.json);
      return;
    }
    default:
      throw new Error(`Unreachable loop command ${args.command}.`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
)
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
