# Executable Plan Standard

`.agent/current-exec-plan.md` is the single living plan for the active increment. It is operational state, not a wishlist or a substitute for the frozen goal.

## Create a Plan

Before substantial implementation, inspect the repository and write a plan that another agent can execute without conversation history. Keep it bounded to one cohesive outcome and include:

- objective and explicit non-goals;
- goal requirements and immutable tests affected;
- observed baseline with file paths or reproduction evidence;
- ordered implementation steps with at most one marked in progress;
- measurable acceptance criteria;
- focused and broader verification commands;
- visual/headless evidence required;
- risks, assumptions, and rollback/recovery approach; and
- current status, artifacts, and exact next action.

Prefer short increments that can be verified and committed independently. Break broad milestones into sequential plans rather than maintaining a speculative master task list.

## Maintain the Plan

Update the active plan whenever reality changes: after inspection, at step completion, on a failed assumption, after test/evaluation results, and before handoff. Record outcomes, not a narrative transcript. Check off work only when its acceptance evidence exists.

If the implementation must diverge from the plan, first record why and revise the remaining steps. Never edit the plan to conceal a miss or retroactively make a failing result appear intended. New discoveries go into risks, follow-ups, or the next increment; frozen requirements remain unchanged.

## Complete or Replace a Plan

A plan is complete only when all acceptance criteria and verification requirements pass. Add the final evidence and commit identifier, then record the outcome in `docs/autonomy-log.md`. Replace the file for the next increment while retaining a compact reference to the completed commit/log entry. Do not archive verbose stale plans unless they contain evidence unavailable elsewhere.

If blocked under `AGENTS.md`, leave the plan marked blocked with the exact blocker, evidence, attempts, and smallest requested human decision. All other incomplete plans retain a concrete autonomous next action.

## Gameplay Milestone Shape

New gameplay plans default to one vertically integrated player outcome. The plan must name the normal public action path, shared deterministic rule owners, Standard composition owner, save/load/replay evidence, Node/production-Worker parity, and one inspectable consequence. Kernel-, fixture-, migration-, or preview-only work is an exception: it requires a narrow justification and one machine-enforced immediate consumer before unrelated work can start.

Keep dependency order explicit. A plan may not bundle an entire skiing spine merely to make a precursor look complete, and it may not add decorative or acceptance-facing content before its causal prerequisites. The current sequence after the first communications corridor is remaining utilities, operations-base construction, minimum operations staffing/finance/safety, first functional lift and trail, guests, then an operating day.

## External Boundary Reconciliation

When tracked work advances outside the durable controller, do not initialize replacement state or silently move `repository.verifiedCommit`. The active plan must require a resumable reconciliation that archives the exact old state bytes and hash, records the complete continuous commit range, validates the exact clean candidate and command-owned evidence, obtains a fresh independent structured review, adopts the candidate atomically, and only then queues the tracked next proposal.

The final tracked plan is committed before that operation runs. It must describe the next increment while stating that exact final verification, review, state adoption, and proposal queueing remain owned by post-commit reconciliation. It must not claim those gates passed early. An active reconciliation blocks ordinary mutating loop actions; resume the recorded phase instead of deleting or hand-editing state.

## Required Plan Shape

Use these headings:

```text
# Current Execution Plan
Status / Updated / Owner
## Objective
## Goal Constraints
## Baseline Evidence
## Steps
## Acceptance Criteria
## Verification
## Risks and Recovery
## Progress and Evidence
## Next Action
```
