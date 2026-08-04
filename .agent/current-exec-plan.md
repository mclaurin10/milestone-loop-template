# Current Execution Plan

**Status:** template scaffold - no increment active
**Updated:** (set on first use)
**Owner:** autonomous loop

## Objective

No increment is active. This file is the single living plan for the active
increment; see `.agent/PLANS.md` for the required shape and maintenance
rules. Replace this placeholder when the first milestone starts.

## Goal Constraints

- `PROJECT_GOAL.md` is the frozen authority; `evals/` is the frozen
  acceptance contract.
- The verification profile lifecycle and protected paths are enforced by
  `scripts/verify.mjs` and the orchestrator diff policy.

## Baseline Evidence

- `pnpm test:orchestrator` and `pnpm typecheck` pass on the template
  scaffold.
- Product verification stages report `NOT_READY` until the adopting project
  wires its scripts (see `CONTRACT.md`).

## Steps

1. [ ] (first milestone's ordered steps go here)

## Acceptance Criteria

- (measurable criteria for the active increment)

## Verification

- Focused: (the increment's focused commands)
- Broader: `pnpm verify`

## Risks and Recovery

- (risks, assumptions, rollback approach)

## Progress and Evidence

- (outcomes with artifact paths, newest first)

## Next Action

Adopt the template (fill configs, wire contract commands, freeze the
authority set), then plan the first bounded milestone with `pnpm loop:plan`.
