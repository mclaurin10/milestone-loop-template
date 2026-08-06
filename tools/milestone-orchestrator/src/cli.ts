import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canaryMilestone, CANARY_MILESTONE_ID } from "./canary.js";
import { DEFAULT_CONFIG_PATH, loadConfig } from "./config.js";
import {
  ControllerLease,
  releaseLeaseWithoutMasking,
} from "./controller-lease.js";
import { runDoctorDiagnostic } from "./doctor.js";
import {
  applyEvidenceRetentionPlan,
  buildEvidenceRetentionPlan,
} from "./evidence-retention.js";
import { runLiveModelPolicyCheck } from "./model-policy-check.js";
import {
  MilestoneOrchestrator,
  stateStatusSummary,
  type OrchestratorInspection,
} from "./orchestrator.js";
import { ReconciliationController } from "./reconciliation.js";
import { redactSensitiveValue } from "./redaction.js";
import { demonstrateSafety } from "./safety-demonstration.js";
import { atomicWriteJson, StateStore } from "./state-store.js";

export interface LoopCliArguments {
  readonly command: string;
  readonly configPath?: string;
  readonly one: boolean;
  readonly json: boolean;
  readonly candidate?: string;
  readonly nextProposalPath?: string;
  readonly reason?: string;
  readonly plan?: string;
  readonly sha256?: string;
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
  let plan: string | undefined;
  let sha256: string | undefined;
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
    } else if (value === "--plan") {
      const requested = values[index + 1];
      if (!requested) throw new Error("--plan requires a path.");
      plan = requested;
      index += 1;
    } else if (value === "--sha256") {
      const requested = values[index + 1];
      if (!requested) throw new Error("--sha256 requires a hash.");
      sha256 = requested;
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
    ...(plan ? { plan } : {}),
    ...(sha256 ? { sha256 } : {}),
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
    "retention-plan",
    "retention-apply",
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
  if (args.command !== "retention-apply" && Boolean(args.plan || args.sha256))
    throw new Error(`${args.command} does not accept --plan or --sha256.`);
  if (args.command === "retention-apply") {
    if (!args.plan || !args.sha256)
      throw new Error("retention-apply requires --plan and --sha256.");
    if (!/^[0-9a-f]{64}$/i.test(args.sha256))
      throw new Error("--sha256 must be a 64-character hex digest.");
  }
}

function repositoryRoot(start: string): string {
  let current = resolve(start);
  while (!existsSync(resolve(current, DEFAULT_CONFIG_PATH))) {
    const parent = resolve(current, "..");
    if (parent === current)
      throw new Error(
        `Could not locate the repository root: no ancestor contains ${DEFAULT_CONFIG_PATH}.`,
      );
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
  // Retention commands never open the orchestrator (open initializes state,
  // tops up protected files, and cleans workspaces). Planning is lease-free
  // and mutates no state; apply takes its own lease and re-checks the world.
  if (args.command === "retention-plan") {
    const config = await loadConfig(root, args.configPath);
    const state = await new StateStore(root, config.statePath).load();
    if (!state)
      throw new Error(
        "Retention planning requires initialized controller state.",
      );
    const now = new Date().toISOString();
    const plan = await buildEvidenceRetentionPlan({
      repositoryRoot: root,
      config,
      state,
      now,
    });
    const planPath = resolve(
      root,
      "artifacts",
      "orchestrator",
      "retention",
      "plans",
      `${now.replaceAll(/[^0-9]/g, "").slice(0, 14)}-${process.pid}`,
      "plan.json",
    );
    await atomicWriteJson(planPath, plan);
    const sha256 = createHash("sha256")
      .update(await readFile(planPath))
      .digest("hex");
    output(
      {
        planPath,
        sha256,
        plannedDeletionCount:
          plan.verificationRuns.plannedDeletions.length +
          plan.controllerRuns.plannedDeletions.length,
        approveWith: `pnpm loop:retention:apply -- --plan ${planPath} --sha256 ${sha256}`,
      },
      args.json,
    );
    return;
  }
  if (args.command === "retention-apply") {
    const config = await loadConfig(root, args.configPath);
    const lease = await ControllerLease.acquire({
      repositoryRoot: root,
      statePath: config.statePath,
      operation: "retention-apply",
    });
    let retentionFailed = false;
    try {
      const state = await new StateStore(
        root,
        config.statePath,
      ).loadForMutation();
      if (!state)
        throw new Error(
          "Retention apply requires initialized controller state.",
        );
      output(
        await applyEvidenceRetentionPlan({
          repositoryRoot: root,
          planPath: resolve(root, args.plan!),
          expectedSha256: args.sha256!,
          config,
          state,
          now: new Date().toISOString(),
        }),
        args.json,
      );
    } catch (error) {
      retentionFailed = true;
      throw error;
    } finally {
      await releaseLeaseWithoutMasking(() => lease.release(), retentionFailed);
    }
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
  if (args.command === "status" || args.command === "dry-run") {
    const inspection = await MilestoneOrchestrator.inspect(
      root,
      args.configPath,
    );
    const status = inspection.state
      ? stateStatusSummary(root, inspection.state)
      : { state: "uninitialized" };
    const readOnlyFacts = {
      targetHead: inspection.targetHead,
      stateStorage: inspection.stateStorage,
      targetDrift: inspection.targetDrift,
      pendingWorkspaceCleanups: inspection.pendingWorkspaceCleanups,
      protectedIntegrity: inspection.protectedIntegrity,
      lease: inspection.lease,
    } satisfies Partial<OrchestratorInspection>;
    if (args.command === "status") {
      output({ status, inspection: readOnlyFacts }, args.json);
      return;
    }
    output(
      {
        mode: "dry-run",
        codexInvocations: 0,
        repositoryMutation: false,
        wouldTakeAction: inspection.nextAllowedAction,
        status,
        inspection: readOnlyFacts,
      },
      args.json,
    );
    return;
  }
  const orchestrator = await MilestoneOrchestrator.open(root, args.configPath, {
    leaseOperation:
      args.command === "canary"
        ? "canary"
        : args.command === "plan"
          ? "plan"
          : "run",
  });
  let commandFailed = false;
  try {
    switch (args.command) {
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
  } catch (error) {
    commandFailed = true;
    throw error;
  } finally {
    await releaseLeaseWithoutMasking(() => orchestrator.close(), commandFailed);
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
