# Current Execution Plan

**Status:** WP1b inspection and proof design in progress
**Updated:** 2026-08-05
**Owner:** autonomous loop

## Objective

Make `refs/milestone-loop/state` the canonical durable state-generation head.
Each complete validated state must be stored in a ref-rooted Git commit whose
parent is the prior generation and published by an expected-generation ref
update. Keep `artifacts/orchestrator/state/state.json` only as a derived,
repairable human-readable mirror and import a valid legacy state exactly once.

This is the second and final bounded increment of WP1. WP1a atomic controller
ownership is committed at `fa1ef6f`; durable workspace/integration intents
remain WP2 and must not be mixed into this state-storage increment.

## Goal Constraints

- Preserve every schema-supported state field and migration meaning; do not
  alter lifecycle transitions, readiness meaning, or immutable authority.
- A writer may publish only from the exact generation it loaded. Revision
  equality alone is not ownership of a generation.
- The private ref and commit ancestry are canonical. A missing, stale,
  malformed, or externally modified JSON mirror can never override them.
- `loop:status`, doctor, benchmark reads, retention planning, and dry-run stay
  mutation-free. Legacy import and mirror repair occur only on a leased
  mutating path.
- State commits permanently root prior generations. Normal pushes must not
  publish the private state namespace.
- No dual canonical writers and no fallback from a malformed canonical ref to
  a plausible mirror.

## Baseline Evidence

- `StateStore.save` currently reads the mirror revision, compares it with the
  caller's revision, then renames a new mirror. Two same-revision writers can
  both pass and publish distinct revision `N + 1` values.
- Existing stale-writer coverage is sequential and cannot force both writers
  past their shared revision read.
- State unit fixtures are not Git repositories, and the safety demonstration
  uses a custom mirror path in the main repository; both need explicit fixture
  isolation before the canonical ref can be introduced.
- The shared fixed-ref wrapper added by WP1a already validates Git object IDs,
  supports SHA-1/SHA-256 zero IDs, and performs expected-old ref updates.

## Steps

1. [ ] Inventory every read, initialization, save, migration, status, doctor,
   retention, reconciliation, benchmark, and safety-demonstration call site;
   add a barrier test that reproduces two same-generation writers succeeding.
2. [ ] Define strict state-generation metadata and Git commit validation:
   exact state JSON hash/revision, exact parent, exact tree entries, and fixed
   controller author identity.
3. [ ] Publish initialization and saves through
   `refs/milestone-loop/state` using the exact loaded generation as expected
   old; keep prior commits reachable through parent ancestry.
4. [ ] Split read-only load from leased mutation load. Import a valid legacy
   mirror exactly once only on the latter, and fail closed on malformed legacy
   or canonical data.
5. [ ] Regenerate the JSON mirror only after canonical publication and repair
   it on the next leased open after missing, stale, malformed, modified, or
   interrupted mirror writes.
6. [ ] Isolate safety/demo fixtures from the production state ref and update
   all state-using fixtures to real Git repositories without weakening their
   assertions.
7. [ ] Add crash-boundary, corruption, unexpected-ref-change, history,
   read-only, migration-semantic, and normal-push tests; update status, doctor,
   README, and contract.
8. [ ] Run repeated forced races, focused and broad exact-runtime checks, then
   record and commit the cohesive WP1b result.

## Acceptance Criteria

- Exactly one writer starting from generation `N` publishes generation
  `N + 1`; every loser reports a typed stale-generation error and cannot alter
  the winner or its mirror.
- Canonical readers observe only complete validated generations. The current
  and immediately previous generations remain readable through commit ancestry.
- A crash before object creation or ref update leaves generation `N`
  canonical; a crash after ref update leaves `N + 1` canonical and later
  repairs the mirror.
- Missing, stale, malformed, linked, or externally edited mirrors never become
  authoritative while a canonical ref exists.
- A valid legacy state imports once with semantic equality; malformed or
  ambiguous legacy state blocks mutation without changing either store.
- An invalid object type, tree, metadata hash/revision, parent relation, state
  schema, or unexpectedly changed ref fails closed.
- All read-only commands leave the ref, object database, mirror, and lease
  untouched; ordinary Git pushes exclude both private refs.

## Verification

- Focused: state-store and private-ref tests, including barrier-synchronized
  multiprocess writers and injected crash hooks, repeated under Node `24.18.0`
  on Windows.
- Affected: orchestrator identity/cleanup, reconciliation, retention, doctor,
  deterministic operations, benchmark, and safety demonstration.
- Static and broad: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm loop:demo-safety`, and
  `git diff --check`.
- Exact aggregate remains diagnostically non-passing for unrelated
  uncommissioned placeholders; no WP1 result may relabel that state.

## Risks and Recovery

- Commit construction must not depend on mutable user Git identity or accept
  candidate-controlled ref names, paths, or command arguments.
- Read-only legacy visibility is required for status before migration, but it
  must not silently bless invalid bytes or mutate the repository.
- A ref update can succeed before mirror publication fails. That is a
  recoverable canonical success, not permission to roll the ref back.
- Unreachable objects from losing/crashed candidates are safe for Git GC;
  active history must remain rooted by the state ref's parent chain.
- Rollback is a normal revert to `fa1ef6f` before WP2. Never restore the
  non-atomic mirror as canonical to manufacture green tests.

## Progress and Evidence

- 2026-08-05: WP1a closed at `fa1ef6f80c1dd089f8f78133d0aa2344f40a2174`
  (tree `0be6b70c386cf58b076f7d3b33cc8f82545cb2a0`) with 341/341 clean-tree
  unit tests and repeated synchronized lease-race coverage.
- 2026-08-05: StateStore call-site inspection confirmed that mutating and
  read-only loads currently share one API and that the safety demonstration's
  custom main-repository path must be isolated before adopting a fixed ref.

## Next Action

Add deterministic state-generation hooks and the failing simultaneous-writer
test, then implement strict Git commit construction/validation behind the
fixed state ref before changing production call sites.
