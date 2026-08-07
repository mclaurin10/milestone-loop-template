# Current Execution Plan

**Status:** In progress — WP3a review-fix (supervisor drain breach, sync spawn, termination semantics)
**Updated:** 2026-08-07
**Owner:** autonomous loop

## Objective

Close three independent review findings against the WP3a bounded process
supervisor committed at `e06baf4b658713961825edc7996884308bc8c582`:

1. **High — post-exit output breach is inert.** After the root exits the
   supervisor is `draining`; a subsequent per-stream cap breach sets
   `outputLimitExceeded` but `initiateTermination` returns unless the phase
   is `running`, so no sweep or cutoff happens and — if the writer then
   closes the inherited pipes — the promised straggler kill never runs.
   Reproduced: `{outputLimitExceeded:true, terminationReason:null,
   termination:null}`.
2. **Medium — synchronous spawn failure rejects.** `spawnChild` runs bare in
   the promise executor, so a synchronous throw rejects `superviseCommand`
   despite its documented never-rejects contract, and `runCommand` then
   rejects past the summary/artifact contract. Reproduced:
   `REJECTED: sync spawn failure`.
3. **Medium — `termination.succeeded` overstates.** It is assigned
   `exitSeen`, so a fallback direct-child kill (or natural root exit after a
   failed tree kill) reports success while descendants survive.

Non-goals: any other supervision semantics change, container execution,
`scripts/verify.mjs`/`tools/evidence.mjs` conversion, WP5 Linux evidence,
readiness claims.

## Goal Constraints

- Preserve WP3a's committed public semantics except where the findings
  require correction: bounded memory, redact-before-write, exactly-once
  settle with the hard bound, TIMEOUT non-passing, receipts unchanged.
- The unrelated untracked human file (blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`) stays untouched and outside
  every commit. Exact Node `24.18.0` / pnpm `11.15.1` for all commands.

## Baseline Evidence

- HEAD `621e07a` (WP3a handoff). Deterministic probes against the committed
  supervisor reproduce findings 1 and 2 verbatim (scratchpad
  `review-probes.mjs`, 2026-08-07); finding 3 is structural:
  `succeeded: exitSeen` at the termination-report construction site.

## Steps

1. [x] Contracts: renamed `SupervisionTerminationReport.succeeded` to
       `rootExitObserved` and added
       `SupervisionReport.drainCutoff: "output-limit" | null`.
2. [x] Supervisor: synchronous spawn throw resolves an ERROR-shaped result;
       straggler sweep extracted; a cap breach during `draining` records the
       cutoff, sweeps immediately, and settles.
3. [x] Runner: post-exit breach message no longer claims tree termination.
4. [x] Regressions added (pre-fix failures reproduced by probe): FakeChild
       drain-cutoff, FakeChild synchronous spawn throw, fallback-root-kill
       `rootExitObserved` semantics, and a real-process `runCommand` fixture
       whose detached holder polls for parent death and floods the inherited
       pipe strictly after exit. One first-run aggregate failure was the new
       fixture's own cleanup racing Windows handle release (EBUSY on the
       holder's CWD); both test files now poll killed fixtures to death and
       retry transient removal codes, mirroring the production idiom.
5. [x] Verified: focused suites 27 passed / 2 skipped (WP5); probes now show
       cutoff+sweep, RESOLVED spawn error, and no `succeeded` field.
       Receipts on the final tree: typecheck `artifacts/manual/typecheck-17492/`,
       lint `artifacts/manual/lint-20652/`, format
       `artifacts/manual/format-check-24620/`; orchestrator aggregate 414
       tests (412 passed, 2 skipped WP5, 0 failed) at
       `artifacts/manual/test-orchestrator-10784/orchestrator-report.json`;
       unit aggregate 427 tests (425 passed, 2 skipped WP5, 0 failed) at
       `artifacts/manual/test-unit-7280/`; `pnpm loop:demo-safety` PASS at
       `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807190106966-4c6cc48e.json`;
       clean `git diff --check`; human file blob unchanged. Logs recorded;
       commits follow.

## Acceptance Criteria

- A cap breach in any phase converges to a bounded, recorded end: `running`
  → tree termination; `draining` → immediate sweep + cutoff settle with
  `drainCutoff: "output-limit"`; a writer closing its pipes after breaching
  can no longer skip the sweep.
- `superviseCommand` resolves (never rejects) for synchronous spawn throws,
  with `spawnError` set and an ERROR summary produced by `runCommand`.
- The termination report states only what is proven: attempts, per-attempt
  detail, and `rootExitObserved`; no field claims tree-wide success.
- All prior WP3a acceptance criteria still hold; full suites green with
  receipts; human file excluded and byte-identical.

## Verification

Same commands and exact runtime as the WP3a plan (focused supervisor/runner/
config suites; affected suites; broad receipt-owning gates).

## Risks and Recovery

- Settling from inside a stream `data` handler: the settled guard and
  listener teardown make re-entry inert; regression asserts exactly-once.
- The rename ripples through committed tests only (API is repo-internal and
  unreleased); no state or config schema is touched. Rollback is ordinary
  source control on top of `621e07a`.

## Progress and Evidence

- 2026-08-07: Findings 1 and 2 reproduced deterministically against
  `e06baf4`; finding 3 confirmed structurally. Plan recorded before
  implementation.

## Next Action

Execute step 1 (contracts rename + `drainCutoff`), then the supervisor fix.
