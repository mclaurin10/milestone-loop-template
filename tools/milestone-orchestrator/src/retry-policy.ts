import type {
  MilestoneRecord,
  NextAllowedAction,
  OrchestratorConfig,
} from "./contracts.js";

export interface RetryDecision {
  readonly action: "retry" | "escalate";
  readonly nextAllowedAction: NextAllowedAction;
  readonly reason: string;
}

export function decideRetry(input: {
  readonly milestone: MilestoneRecord;
  readonly config: OrchestratorConfig;
  readonly failureKind: "product" | "infrastructure" | "review";
  readonly consecutiveInfrastructureFailures: number;
}): RetryDecision {
  if (input.milestone.attempts >= input.config.limits.attemptsPerMilestone) {
    return {
      action: "escalate",
      nextAllowedAction: "stop",
      reason: `Attempt limit ${input.config.limits.attemptsPerMilestone} exhausted for ${input.milestone.proposal.id}.`,
    };
  }
  if (
    input.failureKind === "infrastructure" &&
    input.consecutiveInfrastructureFailures >=
      input.config.limits.consecutiveInfrastructureFailures
  ) {
    return {
      action: "escalate",
      nextAllowedAction: "stop",
      reason: `Consecutive infrastructure failure limit ${input.config.limits.consecutiveInfrastructureFailures} exhausted.`,
    };
  }
  return {
    action: "retry",
    nextAllowedAction: "retry",
    reason:
      input.failureKind === "review"
        ? "Independent review rejected the change; retry with findings under the controller-selected worker policy."
        : `${input.failureKind} verification failure; retry with machine evidence under the controller-selected worker policy.`,
  };
}

export function recoveryAction(milestone: MilestoneRecord): NextAllowedAction {
  switch (milestone.status) {
    case "running":
      return "resume-worker";
    case "verifying":
      return "verify";
    case "reviewing":
      return "review";
    case "retrying":
      return "retry";
    default:
      return milestone.nextAllowedAction;
  }
}
