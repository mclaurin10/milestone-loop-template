import {
  type MilestoneStatus,
  type NextAllowedAction,
  type ReconciliationPhase,
} from "./contracts.js";

const transitions: Readonly<
  Record<MilestoneStatus, readonly MilestoneStatus[]>
> = {
  proposed: ["ready", "blocked", "escalated"],
  ready: ["running", "blocked", "escalated"],
  running: ["verifying", "retrying", "blocked", "escalated"],
  verifying: ["reviewing", "retrying", "blocked", "escalated"],
  reviewing: ["completed", "retrying", "blocked", "escalated"],
  retrying: ["running", "blocked", "escalated"],
  completed: [],
  blocked: ["ready", "escalated"],
  escalated: [],
};

export function canTransition(
  from: MilestoneStatus,
  to: MilestoneStatus,
): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(
  from: MilestoneStatus,
  to: MilestoneStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid milestone transition: ${from} -> ${to}.`);
  }
}

export function nextActionForStatus(
  status: MilestoneStatus,
): NextAllowedAction {
  switch (status) {
    case "proposed":
      return "plan";
    case "ready":
      return "start-milestone";
    case "running":
      return "resume-worker";
    case "verifying":
      return "verify";
    case "reviewing":
      return "review";
    case "retrying":
      return "retry";
    case "completed":
    case "blocked":
    case "escalated":
      return "stop";
  }
}

const reconciliationTransitions: Readonly<
  Record<ReconciliationPhase, readonly ReconciliationPhase[]>
> = {
  prepared: ["verifying", "failed"],
  verifying: ["prepared", "candidate-verified", "failed"],
  "candidate-verified": ["prepared", "reviewing", "failed"],
  reviewing: ["prepared", "review-approved", "failed"],
  "review-approved": ["prepared", "adopting", "failed"],
  adopting: ["prepared", "state-adopted", "failed"],
  "state-adopted": ["queueing-next", "failed"],
  "queueing-next": ["completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransitionReconciliation(
  from: ReconciliationPhase,
  to: ReconciliationPhase,
): boolean {
  return reconciliationTransitions[from].includes(to);
}

export function assertReconciliationTransition(
  from: ReconciliationPhase,
  to: ReconciliationPhase,
): void {
  if (!canTransitionReconciliation(from, to))
    throw new Error(`Invalid reconciliation transition: ${from} -> ${to}.`);
}
