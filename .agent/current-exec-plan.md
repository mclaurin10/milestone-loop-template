# Current Execution Plan

**Status:** WP1a inspection in progress
**Updated:** 2026-08-05
**Owner:** autonomous loop

## Objective

Replace the vulnerable filesystem controller lease with atomic expected-owner
publication through a repository-private Git ref. Acquisition, stale takeover,
and release must never let a losing contender remove or alter the live winner.

This is the first bounded increment of WP1. Atomic Git-ref state generations
remain the immediately following WP1b increment; durable side-effect intents
remain WP2. This split preserves the requested dependency order while keeping
the living plan cohesive and independently verifiable.

## Goal Constraints

- Preserve single-writer semantics for every mutating loop command; status and
  dry-run remain read-only and lease-free.
- Do not weaken owner liveness checks, foreign-host refusal, malformed-owner
  refusal, protected roots, candidate identity fencing, or fast-forward-only
  integration.
- Use an atomic expected-old comparison. A stale read followed by pathname
  rename/quarantine is not acceptable.
- Keep the private lease ref local; normal pushes must not publish it.
- Do not change frozen authority, acceptance meaning, readiness lifecycle, or
  product scope.

## Baseline Evidence

- WP0 closed at commit `66c564c`; prerequisite Windows replacement reliability
  is commit `235ea2b`.
- `tools/milestone-orchestrator/src/controller-lease.ts` currently publishes
  `artifacts/orchestrator/state/controller.lease` and recovers a stale lease by
  renaming that shared pathname to quarantine.
- A contender that observed stale bytes can therefore rename a newer winner's
  live lease. Existing race coverage does not force that interleaving or try a
  third acquisition while the winner remains live.
- Git `update-ref <ref> <new> <expected-old>` is already available on every
  supported platform and provides the required atomic comparison.

## Steps

1. [ ] Trace every lease construction, acquire/inspect/release call, CLI status
   field, safety fixture, and documentation claim; reproduce the losing stale
   recoverer interleaving with deterministic barriers.
2. [ ] Add a narrow private-ref object store for lease-owner JSON with strict
   schema/identity validation and expected-old `git update-ref` operations.
3. [ ] Migrate acquisition, live-owner refusal, stale takeover, inspection, and
   exact-owner release to `refs/milestone-loop/controller-lease`.
4. [ ] Define explicit legacy-file handling that fails closed or performs a
   one-time identity-checked migration without allowing dual ownership.
5. [ ] Add deterministic multiprocess coverage for first acquisition, forced
   stale races, a third contender during winner lifetime, exact release, PID
   reuse/host mismatch, malformed objects, and normal-push exclusion.
6. [ ] Update status/doctor/docs and run focused plus broader supported-runtime
   checks before committing the cohesive lease increment.

## Acceptance Criteria

- Exactly one first-time or stale-recovery contender acquires under every
  forced interleaving.
- A losing stale recoverer cannot delete, replace, or release the winner's ref;
  a third contender is refused throughout the winner's lifetime.
- Release succeeds only when the ref still names the caller's exact owner
  object; changed ownership is left untouched and reported.
- Foreign-host, live-owner, malformed-object, and ambiguous legacy-file cases
  fail closed with actionable diagnostics.
- Lease inspection is mutation-free, and normal Git pushes exclude the private
  ref.
- Existing mutating commands use the new lease without semantic regressions.

## Verification

- Focused: controller-lease test file plus deterministic multiprocess race
  fixtures repeated under Node `24.18.0` on Windows.
- Static: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `git diff --check`.
- Broader: `pnpm test:orchestrator`, `pnpm test:unit`, and
  `pnpm loop:demo-safety`.
- Exact aggregate remains diagnostically non-passing until unrelated template
  placeholders are commissioned; no lease result may change that meaning.

## Risks and Recovery

- Git object/ref commands must never accept candidate-controlled ref names or
  object IDs without validation; use fixed controller-owned refs.
- Git garbage collection must retain the active owner object through the ref.
- Existing tests use non-Git temporary directories in places; fixture migration
  must remain explicit and must not silently initialize real controller state.
- Legacy lease files may exist after interruption. Never auto-delete an
  ambiguous live or foreign-host file while adopting the ref-backed lease.
- Rollback is a normal revert before WP1b. Do not run dual lease writers.

## Progress and Evidence

- 2026-08-05: WP0 and its supported-runtime prerequisite were committed and
  recorded in `docs/autonomy-log.md`.
- 2026-08-05: the attached audit's stale-takeover control flow was confirmed by
  source inspection; deterministic forced-interleaving coverage is still to be
  added before implementation.

## Next Action

Inventory lease call sites and existing race fixtures, then add a deterministic
failing test in which a losing stale recoverer observes old ownership before a
winner publishes and subsequently attempts to disturb that winner.
