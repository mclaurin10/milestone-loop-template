# Current Execution Plan

**Status:** WP2b target-integration intent inspection pending
**Updated:** 2026-08-06
**Owner:** autonomous loop

## Objective

Make approved target-branch fast-forward integration recoverable by persisting
one strict `target-integrate` operation intent before any target Git or outcome
artifact side effect, then using one deterministic completion reducer for both
the uninterrupted and restart paths.

This is the second bounded increment of WP2. WP2a recoverable workspace creation
is complete at `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844`. Terminal
workspace cleanup, evidence-retention application, and any broader generic
operation engine remain later increments and must not be mixed into this target
integration slice.

## Goal Constraints

- Preserve Planner/Worker/Reviewer separation, verified candidate identity,
  protected-path enforcement, standalone clone isolation, fast-forward-only
  target updates, deterministic state, and every immutable readiness gate.
- Persist the integration intent by canonical state CAS after final candidate
  and protected-file validation but before writing `git-outcome.json`, moving
  the target ref, index, or working tree, or starting any semantic completion
  mutation.
- The intent must name a stable operation ID, run/milestone/attempt, exact input
  generation and revision, repository/target/workspace identity, expected base,
  the complete pinned candidate identity and commit list, outcome path, phase,
  timestamps, and a fixed validate/adopt-or-preserve recovery policy.
- One shared pure completion reducer must own every semantic consequence:
  milestone commits/status/timestamps/workspace head, verified target commit,
  queue and active milestone, required vertical-consumer state, processed count,
  deterministic human-verification stop state, next action, and intent removal.
- Recovery may update a target still at the exact base or adopt a clean target
  already at the exact candidate. Unexpected commits, dirty/index-conflicted
  state, candidate drift, linked paths, or ambiguous Git state fail closed and
  are never reset, overwritten, cleaned, or implicitly accepted.
- A reviewer approval is not itself an integration intent. Target drift without
  the new durable operation must remain blocked for explicit reconciliation;
  the current implicit `reconcileTarget` shortcut may not remain as a parallel
  completion path.
- Read-only status and doctor must report the pending operation, target
  classification, and exact next safe action without locks, index refresh,
  artifact repair, state migration publication, or recovery.

## Baseline Evidence

- `orchestrator.ts#integrate` currently writes a non-authoritative
  `git-outcome.json` with `status: "pending"`, calls
  `integrateFastForward`, and only afterward saves completed controller state.
  A process loss after the fast-forward therefore advances the target while
  canonical state still says the milestone is `reviewing`.
- Startup calls `inspectTarget` before operation recovery and
  `reconcileTarget` treats a persisted reviewer approval as sufficient intent
  to adopt an advanced target. That recovery is a second handwritten completion
  path.
- The normal completion path updates required vertical-consumer state and
  `run.milestonesProcessed`, writes the final outcome artifact, triggers
  terminal cleanup, and evaluates the human-playtest stop rule. The recovery
  reducer omits the vertical-consumer update, processed count, final outcome,
  and stop decision; terminal cleanup is reached later through startup
  reconciliation with different ordering. The same target side effect can
  therefore produce different durable semantics.
- State schema `1.5.0` and the operation fence currently recognize only
  `workspace-create`. WP2a supplies exact input-generation binding, leased
  startup recovery, read-only classification, fault-hook, and
  validate/adopt-or-preserve patterns that this increment can extend without
  creating a second journal.

## Steps

1. [ ] Inventory the review-to-integration transition, target Git mutation,
   outcome artifact, telemetry, completion bookkeeping, cleanup trigger, stop
   decision, startup drift path, and all tests that exercise integration.
   Reproduce process loss after target advancement but before the state save,
   and compare normal versus recovered state field by field.
2. [ ] Advance the state schema exactly once and add the strict
   `target-integrate` pending-operation discriminant, including 1.5 migration,
   exact generation lineage, context validation, pure phase/block/complete
   reducers, and a generic transition fence that still rejects unrelated state.
3. [ ] Split integration into pure intent planning, read-only base/candidate/
   unsafe target classification, exact candidate revalidation, idempotent
   fast-forward action, and deterministic outcome-artifact materialization.
   Add narrow controller-owned fault hooks around every durable/external edge.
4. [ ] Persist intent before the first integration side effect. Order outcome
   creation, target advancement, durable phases, and semantic completion so
   every crash has one provable next action and no path depends on telemetry.
5. [ ] Recover under the controller lease before ordinary target-drift logic:
   resume from the exact base, adopt the exact clean candidate, regenerate the
   exact outcome artifact when required, and durably block all other
   classifications without altering target or workspace content.
6. [ ] Route uninterrupted and recovered integration through one completion
   reducer, including required-consumer bookkeeping, processed count, and the
   human-verification stop result. Remove the implicit reviewer-as-intent
   completion path and keep terminal cleanup as the existing later resumable
   subsystem.
7. [ ] Expose read-only integration operation facts through status and doctor.
   Add crash-boundary convergence, double-resume, concurrent-resume, target
   substitution/dirty/index-lock/wrong-commit, candidate drift, outcome
   interruption, migration, and read-only byte-digest tests.
8. [ ] Run focused repeated target-update races, affected lifecycle/identity/
   reconciliation/cleanup suites, exact-runtime static and broad checks, update
   contract/logs, and commit only the cohesive WP2b result.

## Acceptance Criteria

- The controller cannot advance the target branch without a prior canonical
  `target-integrate` intent naming the exact approved candidate and base.
- Process loss at every state, artifact, ref/index/worktree, and completion
  boundary converges to the same semantic state as uninterrupted integration.
- A target at the exact base resumes once; a clean target at the exact candidate
  is adopted once. Repeated recovery does not double-count milestones, repeat
  required-consumer transitions, change completion timestamps, or duplicate
  stop decisions.
- Unexpected target commits, dirty or conflicted target state, candidate drift,
  linked/substituted paths, and inconsistent outcome artifacts remain preserved
  with an explicit blocked diagnostic and require manual reconciliation.
- Two contenders cannot both advance or complete integration; the controller
  lease and exact-generation CAS leave one target and one canonical outcome.
- The normal and recovered paths use the same completion reducer and produce an
  exact final `git-outcome.json` bound to the base, head, commits, target
  branch, and operation.
- Status and doctor identify the operation and next safe action while remaining
  byte-for-byte read-only over refs, index, worktree, objects, state mirror, and
  outcome artifacts.

## Verification

- Focused: operation schema/reducers; target classification/action; fault-
  injected integration and outcome recovery; barrier-synchronized resume races
  under Node `24.18.0` on Windows.
- Affected: Git isolation, orchestrator identity/lifecycle, state migration and
  generation lineage, candidate identity, reconciliation non-interference,
  cleanup triggering, CLI/status/doctor, and deterministic operations.
- Static and broad: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`,
  `pnpm loop:demo-safety`, and `git diff --check`.
- Linux ref/index/worktree race evidence remains required in WP5 CI before any
  supported-platform or autonomous-readiness claim.

## Risks and Recovery

- A Git fast-forward updates a ref plus index/worktree, not one state-CAS
  object. Treat any partially observed or dirty target as ambiguous and block;
  never run reset/clean/checkout as automatic recovery.
- Expanding the operation union affects schema, migrations, state lineage,
  status, doctor, and the WP2a workspace-create fence. Preserve all existing
  workspace-create recovery behavior and avoid a speculative workflow engine.
- Outcome files and telemetry are not state authority. The outcome must be
  exactly regenerable from intent/state; telemetry degradation must remain
  non-semantic and unable to change recovery decisions.
- A pre-WP2b target drift with no durable operation cannot be distinguished
  safely from external advancement. Fail closed into the explicit reconciliation
  boundary instead of retaining the current implicit adoption heuristic.
- Rollback to `3f6d8e9` is safe only before a `target-integrate` intent or
  target update exists. After either boundary, finish recovery with the newer
  controller before reverting; never hand-edit state or reset the target to
  manufacture rollback.

## Progress and Evidence

- 2026-08-06: WP2a closed at
  `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844` (tree
  `55858b14eff61c7b4348719604ebf1357bdfb2fe`). Its exact-runtime
  orchestrator and unit aggregates passed 363/363 and 376/376, with evidence
  recorded in `docs/autonomy-log.md`.
- 2026-08-06: Initial WP2b inspection located the target/state crash window in
  `orchestrator.ts#integrate` and confirmed that `reconcileTarget` is a
  divergent handwritten completion path missing required-consumer, processed-
  count, outcome, cleanup/stop ordering, and shared-reducer semantics. No WP2b
  implementation has begun.

## Next Action

Build a disposable approved-review fixture, inject process loss immediately
after `integrateFastForward` returns but before the completion save, and record
the advanced target, stale canonical state, pending outcome artifact, and exact
normal-versus-recovered semantic diff before fixing the target-integrate intent
schema.
