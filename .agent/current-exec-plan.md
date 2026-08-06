# Current Execution Plan

**Status:** WP2a verified; cohesive commit pending
**Updated:** 2026-08-06
**Owner:** autonomous loop

## Objective

Make isolated workspace creation recoverable by persisting one strict
`workspace-create` operation intent before any clone-side effect, cloning into
a unique contained temporary path, and deterministically adopting, publishing,
or preserving an ambiguous result on restart.

This is the first bounded increment of WP2. WP1 atomic lease and canonical
state CAS are complete at `fa1ef6f` and `987ce00`. Target integration,
candidate preparation, cleanup, retention, and the shared completion reducer
remain later WP2 increments and must not be mixed into this workspace slice.

## Goal Constraints

- Preserve standalone local-clone isolation, protected-path enforcement,
  candidate identity, Planner/Worker/Reviewer separation, and all immutable
  readiness semantics.
- Persist intent through canonical state CAS before creating any directory or
  running `git clone`; one repository-mutating operation may be pending.
- Every intent names a stable operation ID, milestone/attempt, exact input
  state generation, target base, temporary/final paths, phase, timestamps, and
  recovery policy. Paths are controller-derived, never agent-supplied.
- Temporary and final paths must be lexically and realpath contained beneath
  the configured workspace root. Symlink, junction, reparse-point, gitfile,
  substituted repository, unexpected branch/base, dirty clone, or retained
  remote facts fail closed.
- Recovery may adopt only a workspace that exactly proves the recorded
  repository/base/branch/isolation facts. Ambiguous content is preserved with
  diagnostics; it is never silently deleted or overwritten.
- Read-only status/doctor inspection reports the pending operation and exact
  safe next action without acquiring the lease, repairing state, or recovering.

## Baseline Evidence

- `createIsolatedWorkspace` currently derives the deterministic final path,
  rejects it only if already present, and clones directly into that path.
- Orchestrator attempt startup persists attempt state, calls the clone helper,
  and only afterward saves the returned workspace record. A crash after clone
  completion therefore leaves an unrecorded directory that blocks retry.
- Existing containment checks protect later cleanup but there is no durable
  pre-clone intent, unique temporary path, publish boundary, adoption proof,
  quarantine diagnostic, or restart fault matrix for creation.
- WP1b now supplies exact loaded-generation identity and CAS publication, so
  the intent can be durably ordered before the external filesystem boundary.

## Steps

1. [x] Inventory attempt-start state transitions, workspace naming, clone
   configuration, cleanup ownership, status/doctor output, and every test that
   assumes direct final-path creation. Reproduce the post-clone/pre-save crash.
2. [x] Add a strict schema-versioned `pendingOperation` state field and the
   initial `workspace-create` discriminant, including exact 1.4 migration,
   validation, generation binding, and pure set/advance/clear reducers.
3. [x] Split workspace preparation into deterministic path planning, unique
   contained temporary clone, exact Git/filesystem validation, and atomic
   final-path publication. Add narrow controller-owned fault hooks at each
   durable/external boundary.
4. [x] Persist intent before clone and atomically save the workspace record
   while clearing intent after publication. Refuse any unrelated mutation while
   the operation remains pending.
5. [x] Recover under the controller lease: resume a missing clone, validate and
   finish an exact temporary clone, adopt an exact final clone, and preserve an
   invalid/ambiguous path with contained diagnostics and an explicit blocked
   disposition. Preserve in place unless an atomic quarantine move can prove
   source identity; no ambiguous entry qualifies for automatic movement in
   this increment. Never automatically delete ambiguous work.
6. [x] Expose pending-operation identity, phase, paths, classification, and
   exact next safe action through read-only inspection and doctor diagnostics.
7. [x] Add deterministic crash, double-resume, concurrent-resume, substitution,
   junction, missing-path, dirty-repository, wrong-base/branch, retained-remote,
   and Windows replacement/lock tests. Compare uninterrupted and recovered
   state semantically, ignoring only explicitly nondeterministic diagnostics.
8. [~] Run focused repeated recovery races, affected and broad exact-runtime
   checks, update contract/logs, and commit only the cohesive WP2a result.

## Acceptance Criteria

- No workspace directory or clone can be controller-created without a durable
  canonical `workspace-create` intent naming it first.
- Uninterrupted creation and every recoverable crash boundary converge to
  semantically equal workspace and milestone state; recovery is idempotent.
- An exact final or temporary clone is adopted/finished only after complete
  containment and Git identity validation.
- A missing path resumes safely. A substituted, linked, dirty, wrong-base,
  wrong-branch, remote-bearing, or otherwise ambiguous path blocks, preserves
  evidence (in place or in a proven-safe contained quarantine), and cannot be
  overwritten or automatically deleted.
- Two recovery contenders cannot both publish or mutate the workspace; the
  lease plus exact state-generation CAS leaves one canonical outcome.
- Status and doctor identify the pending operation and next safe action while
  remaining byte-for-byte read-only over refs, objects, mirrors, and paths.

## Verification

- Focused: operation-intent schema/reducers, Git workspace planning/validation,
  fault-injected creation/recovery, and barrier-synchronized resume races under
  Node `24.18.0` on Windows.
- Affected: orchestrator lifecycle/cleanup/identity, schema migrations,
  deterministic operations, status/doctor, reconciliation non-interference,
  and safety demonstration.
- Static and broad: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm loop:demo-safety`, and
  `git diff --check`.
- Linux junction/path/race coverage remains required in WP5 CI before any
  supported-platform or autonomous-readiness claim.

## Risks and Recovery

- A state-schema bump affects every fixture and migration. Add only the field
  required for the discriminated operation contract; do not prebuild a generic
  workflow engine or fabricate future operation payloads.
- Rename semantics and reparse-point behavior differ on Windows. Validate both
  lexical and resolved parents immediately before publication and fail closed
  if atomic publication cannot be proven.
- Clone failure may leave partial temporary content. Preserve its exact intent
  relationship and diagnostics; removal is allowed only when the path is
  positively proven controller-owned, contained, and safe under an explicit
  recovery disposition.
- Rollback is a normal revert to `987ce00` before later WP2 intent variants.
  Never fall back to direct final-path cloning to manufacture a green result.

## Progress and Evidence

- 2026-08-05: WP1 closed through `987ce005a410470d078b8dd57802abbffc2d0356`
  (tree `0b9c1719ebc9f7accac4d64e872c6878b753eed2`). Its clean committed unit
  aggregate passed 362/362 with receipt at
  `artifacts/manual/test-unit-24644/result.json`.
- 2026-08-05: Initial WP2 inspection located direct deterministic-path clone
  creation in `git-isolation.ts` and the post-clone workspace-record save gap
  described by audit defect CD-06. No WP2 implementation has begun.
- 2026-08-06: Completed the attempt-start inventory. `beginAttempt` persists
  the running/attempt transition, calls `createIsolatedWorkspace`, and only
  then saves `milestone.workspace`; startup has no workspace-create recovery,
  while status/doctor only expose cleanup/reconciliation facts. Direct-clone
  assumptions occur in `git-isolation.test.ts`, `orchestrator-cleanup.test.ts`,
  and `orchestrator-identity.test.ts`.
- 2026-08-06: Reproduced the exact crash boundary under Node `24.18.0` in a
  disposable ignored-workspace fixture. After successful clone and simulated
  loss of the workspace-record save, target HEAD remained at its base and a
  second identical call failed with `Isolated workspace already exists` for
  the stranded deterministic final path.
- 2026-08-06: The implementation boundary is now fixed: bump state schema to
  1.5 with read-only virtual migration of canonical 1.4 generations and
  durable migration on the next CAS publication; bind intent to the exact
  pre-intent generation; derive stable final/branch plus unique temporary paths
  before side effects; fence all saves while an operation is pending; recover
  `missing`, exact temporary, and exact final classifications; and persist a
  blocked diagnostic without moving or deleting ambiguous entries.
- 2026-08-06: State 1.5, canonical 1.4 virtual/durable migration, exact
  generation lineage, pure operation reducers, and the global pending-operation
  save fence are implemented. Focused schema/state/doctor/operation tests pass
  38/38 under Node `24.18.0`.
- 2026-08-06: Workspace creation now plans paths without I/O, clones to a
  unique `.create-<16 hex>` temporary entry, validates real and lexical
  containment plus standalone Git/base/branch/cleanliness/marker/remote facts,
  and publishes without clobbering an existing final entry. The shortened
  temporary name is required to leave headroom for nested Git ref lock paths on
  Windows; the initial descriptive temporary name reproduced `ENAMETOOLONG`.
- 2026-08-06: Leased startup recovery and the attempt-start path are integrated.
  An end-to-end fault after final publication leaves `publish-started` intent;
  reopen adopts the exact clone, atomically installs the workspace record, and
  a second reopen leaves the revision unchanged. A modified final workspace is
  preserved and durably blocked. A barrier-synchronized second contender is
  rejected by the live lease while the winner owns completion.
- 2026-08-06: Read-only status/doctor report operation ID, phase, temporary and
  final paths, classification, and next safe action. A full repository-content
  digest plus state-ref/mirror comparison remained identical across both
  inspections. Focused workspace planning/recovery tests pass on Windows,
  including junction, dirty, retained-remote, substituted, and both-path cases.
- 2026-08-06: A real-clone restart matrix now injects process loss at all eight
  declared durable/filesystem boundaries (intent, clone-start, clone command,
  temporary ready, clone-ready, publish-start, final rename, and published).
  Every case retained its expected durable phase and converged to the same
  normalized revision-9 state after a fresh leased open. The matrix passed
  8/8 boundaries under Node `24.18.0` on Windows in 198.4 seconds.
- 2026-08-06: Receipt-owning typecheck, lint, and format passed under the exact
  runtime at `artifacts/manual/typecheck-21940/`,
  `artifacts/manual/lint-7288/`, and
  `artifacts/manual/format-check-25136/`. The complete orchestrator suite passed
  363/363 at `artifacts/manual/test-orchestrator-13136/result.json`; the full
  unit aggregate passed 376/376 at
  `artifacts/manual/test-unit-17720/result.json`. The live safety demonstration
  passed at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806175034510-a6ecc318.json`.

## Next Action

Stage only the reviewed WP2a files, inspect the staged diff/tree, and create the
cohesive implementation commit. Then record its identity and replace this
completed plan with the next bounded WP2 handoff.
