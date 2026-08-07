# Current Execution Plan

**Status:** WP3a complete and committed at `e06baf4b658713961825edc7996884308bc8c582`
**Updated:** 2026-08-07
**Owner:** autonomous loop

## Objective

Give every controller-spawned verification command a bounded, deterministic
supervision boundary. One shared process supervisor must own spawn, bounded
output capture, timeout, process-tree termination, stream drain, and an
exactly-once settle for `command-runner.ts#runCommand` — the single async
spawn choke point used by the verifier, verification tiers, orchestrator
workspace preparation, invariant suite, reconciliation, and benchmark paths.

This is the first bounded WP3 process-containment slice. It closes the
documented supervision defect (audit CR-02, improvement-plan §WP3.5,
P0 sweep P1.1/R-01): unbounded in-memory stdout/stderr buffering, SIGTERM to
the direct child only with no escalation and no tree/group ownership, and a
settle path that waits solely on stream `close`, so a SIGTERM-ignoring child
or a grandchild holding an inherited pipe hangs the controller and an output
flood exhausts controller memory.

Explicit non-goals: the OCI/container executor and execution-provider
identity fields (later WP3 slices); `scripts/verify.mjs` (protected path) and
`tools/evidence.mjs`/`tools/production-build.mjs` spawnSync conversion
(follow-up slice); `codex-gateway.ts` (in-process SDK; Worker sandbox
configuration unchanged per WP3); any WP2 retention or workspace-cleanup
semantic change; Linux execution evidence (WP5 CI); calibration; any
supported-platform or autonomous-readiness claim.

## Goal Constraints

- Preserve the frozen authority, original acceptance suite, exact Node
  `24.18.0` and pnpm `11.15.1` pins, Planner/Worker/Reviewer separation, and
  every readiness and human-verification gate. No protected path changes.
- Timeout remains non-passing (`TIMEOUT` status and `timeout` telemetry
  classification). PASS/FAIL/ERROR semantics and receipt gating are
  unchanged; an output-limit breach becomes `ERROR` in the existing
  infrastructure lane with its disposition recorded.
- Redaction must precede every disk write; no unredacted output byte may
  reach an artifact, including truncated floods. Recorded SHA-256 values
  cover exactly the written bytes.
- Logs are diagnostic evidence: truncation must be explicit (disposition,
  retained/observed byte counts, marker line), never silent discard.
- The supervisor may not weaken the existing single-settle guarantee on
  artifact-write failure (P0.11) and must extend it to every termination and
  drain race.
- The unrelated untracked human file
  `Implementation-ready improvement plan 8-5-26.txt` (blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`) stays byte-identical and
  outside the commit.

## Baseline Evidence

- Resumed at handoff `16e452c07e8cb360cc71acc60b3b47a89ab30543` (WP2d
  complete). Immutable lock verified: all four authority SHA-256 values match
  baseline == active; calibration open, unstarted.
- `command-runner.ts:184-206`: unbounded `Buffer[]` capture; timeout fires
  `child.kill("SIGTERM")` on the direct child only; no force-kill timer; the
  repo contains no `detached`, process-group, Job Object, or `taskkill`
  usage anywhere (verified by sweep). Settle waits on `close` only.
- `scripts/verify.mjs:1405-1412` is the only SIGKILL escalation in the repo
  and still targets the direct child; it is a protected path and out of
  scope here.
- `CommandExecutionSummary` (contracts.ts:518) is a TypeScript contract only;
  no runtime JSON schema validates it (no `stdoutSha256` match in schema.ts).
  All `signal` consumers (reconciliation.ts:915, benchmark.ts:2433,
  verifier.ts:1294, verification-tier.ts:482) gate on `signal === null` plus
  a specific exit code.
- Config `limits` (schema.ts:1922-1943) requires exactly the 13 known keys as
  positive integers; `CONFIG_SCHEMA_VERSION` is exact-match `1.4.0`;
  `config.ts:133` migrates 1.0.0–1.3.0 → 1.4.0. Full limits objects exist in
  exactly: `config/default.json`, `config/default.template.json`,
  `examples/ski-tycoon/default.json`, `test/fixtures.ts:259`.
- Under Node `v24.18.0` and pnpm `11.15.1` the focused baseline passes 11/11:
  `pnpm exec vitest run tools/milestone-orchestrator/src/command-runner.test.ts tools/milestone-orchestrator/src/config.test.ts --reporter=verbose`
  (2026-08-07). No existing test covers a grandchild, ignored termination,
  inherited-pipe hang, or output flood.

## Steps

1. [x] Inspect authority, contracts, logs, lock, runner/config/schema code and
       tests; reproduce the focused baseline under the exact pinned runtime.
2. [x] Contracts and config: `CONFIG_SCHEMA_VERSION` 1.5.0; required
       `commandOutputLimitBytes` and `commandKillGraceMs` limits;
       `SupervisionReport` type and optional `supervision` summary field;
       schema `limitKeys`; `migrateConfig` 1.4.0→1.5.0 default injection; the
       four limits objects; config tests and README. Focused gate 18/18.
3. [x] Implement `process-supervisor.ts` (state machine
       RUNNING→TERMINATING(graceful→forced)→DRAINING→SETTLED, single settle
       guard, abandonment backstop ≤ timeout + 2×grace, Windows force-first
       `taskkill /T /F` while the tree is intact, POSIX detached-group
       SIGTERM→SIGKILL, bounded per-stream capture with newline-boundary
       truncation) plus pure truncation unit tests and a scripted-child
       spawn seam for the drain/abandon paths real processes cannot
       reproduce on every platform.
4. [x] Convert `runCommand` to the supervisor with unchanged public API and
       status semantics; existing `command-runner.test.ts` passed
       unmodified (6/6) alongside the supervisor suite.
5. [x] Adversarial real-process tests: detached-grandchild tree-kill proof
       (job-object escapee reaped by intact-tree taskkill), output flood
       through `runCommand` (bounded redacted log, ERROR, hash-covered
       truncation marker), detached-holder inherited-pipe drain settle (the
       reproduced CR-02 hang), timeout preservation, spawn error,
       settle-race stress ×5; POSIX escalation and group-sweep tests written
       but skipIf win32 and flagged WP5.
6. [x] Wired `verifier.ts`, `reconciliation.ts` (including the
       `executeMilestoneTier` seam shape), and `orchestrator.ts` to the two
       config limits; affected suites passed 86/86.
7. [x] Decision-log entry (capture design deviation, Windows force-first
       ordering, probed job-object/detached-holder platform facts, Windows
       `signal: null` timeouts, grace-knob reuse, drain-timeout status,
       residuals), CONTRACT.md §4 supervision paragraph, config README.
       Autonomy-log entry follows final verification.
8. [x] Ran focused, affected, and broad receipt-owning verification under
       the pinned runtime; verified the untracked human file byte-identical
       and excluded; committed the cohesive increment as `e06baf4`.

## Acceptance Criteria

- Existing suites pass with `command-runner.test.ts` and all call-site tests
  unmodified (config fixtures excepted).
- A grandchild holding inherited pipes can no longer hang the controller:
  settle within the drain window of child exit, and a hard settle bound of
  `timeoutMs + 2×killGraceMs` holds even when every kill attempt fails, with
  the disposition durably recorded.
- On Windows timeout or cap breach with an intact tree, grandchildren are
  dead within a bounded liveness poll after settle, with a durable
  termination record (method, escalation, outcome).
- Retained output per stream never exceeds the configured cap; a flood
  yields `ERROR`/infrastructure, a truncation disposition with byte counts,
  a bounded log file, no unredacted bytes, and hashes matching the files.
- TIMEOUT/PASS/FAIL/ERROR and telemetry classifications are otherwise
  unchanged; real runs carry a `supervision` record.
- Config 1.5.0 validates both new keys; 1.0.0–1.4.0 configs migrate with
  defaults injected; the state-schema stream is untouched.
- `scripts/verify.mjs`, `tools/evidence.mjs`, `codex-gateway.ts`, protected
  paths, and WP2 retention/cleanup semantics are unchanged.

## Verification

- Exact runtime for every project command:
  `$env:Path = "$(Resolve-Path '.tools/node-v24.18.0-win-x64');$env:Path"`;
  confirm Node `v24.18.0` and pnpm `11.15.1`.
- Focused: `pnpm exec vitest run tools/milestone-orchestrator/src/process-supervisor.test.ts tools/milestone-orchestrator/src/command-runner.test.ts tools/milestone-orchestrator/src/config.test.ts --reporter=verbose`
- Affected: verifier, verification-tier, orchestrator (+cleanup, identity,
  retention-recovery), invariant-suite, reconciliation, benchmark, schema,
  cli suites.
- Broad receipt-owning: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm loop:demo-safety`,
  `git diff --check`.
- No browser evidence (non-visual controller change). POSIX supervisor paths
  are recorded as written-but-unexecuted pending WP5 Linux CI; no
  unsupported-platform result is claimed.

## Risks and Recovery

- `taskkill /T` walks a live snapshot: pre-kill reparented orphans and PID
  reuse can escape. Mitigated by force-first ordering while the tree is
  intact; the complete fix (Job Objects / containers) is a documented later
  WP3 slice. Residuals are recorded, not hidden.
- A Windows straggler that survives past-exit drain cannot be tree-killed
  through a dead root; the controller now settles with the disposition
  recorded instead of hanging — strictly better than the baseline.
- POSIX group-kill code is dead on this host until WP5 CI; tests exist but
  are skipped on win32 and flagged, so no green result implies Linux
  correctness.
- Worst-case in-memory capture is 2×cap per command (128 MiB at defaults) —
  bounded, matching the repo's existing spawnSync `maxBuffer` ceiling.
- Timing flakes: termination proofs use deterministic flood triggers and
  deadline polls, not timer races; the stress test degrades to
  invariant-only assertions if flaky.
- Rollback before commit is ordinary source control on top of `16e452c`. No
  canonical state, retention, or cleanup semantics are touched, so no
  operation-intent recovery interaction exists.

## Progress and Evidence

- 2026-08-07: Resumed at `16e452c`, verified the immutable lock (4/4 hashes
  baseline == active), pinned runtime, and the untracked human file blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`. Reproduced the focused baseline
  11/11 green. Mapped every child-process site (two async spawners, ~30
  spawnSync sites, zero tree/group/kill-escalation machinery) and confirmed
  the supervision defect and its documented authority trail.
- 2026-08-07: Probed platform facts on Node 24.18.0/win32 before finalizing
  fixtures: a non-detached Node grandchild dies with its parent via libuv's
  kill-on-close job object (and the supervisor-side pipe closes with it),
  while a `detached: true` grandchild escapes the job object, survives, and
  holds the inherited pipe open indefinitely — the reproduced CR-02 hang.
  Both adversarial fixtures therefore use detached grandchildren.
- 2026-08-07: Supervisor, runner conversion, config 1.5.0, call-site wiring,
  and docs landed. Focused suites 29 passed / 2 skipped (WP5 POSIX);
  affected verifier/reconciliation/tier suites 86/86.
- 2026-08-07: Two complete orchestrator aggregates failed solely on the
  pre-existing `target-integration-recovery` post-fast-forward test
  exceeding its 120s budget (measured 90.9s at the 2026-08-06 baseline,
  102.3s isolated and 120.2s/122.4s in-suite today; that file's code paths
  do not touch this increment). Its duration budget was raised to 300s with
  the measurements recorded in-file; no assertion changed. The subsequent
  complete aggregate passed 410 tests (408 passed, 2 skipped WP5, 0 failed)
  at `artifacts/manual/test-orchestrator-3096/orchestrator-report.json`.
- 2026-08-07: Receipt-owning gates all passed under the exact runtime:
  typecheck `artifacts/manual/typecheck-21180/`, lint
  `artifacts/manual/lint-22928/`, format `artifacts/manual/format-check-13364/`,
  unit aggregate 423 tests (421 passed, 2 skipped WP5, 0 failed) at
  `artifacts/manual/test-unit-10224/result.json`, safety demonstration PASS at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807154534494-b6b8565c.json`,
  and a clean `git diff --check`. The untracked human file remains at blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.

## Next Action

This plan is complete; the WP3a increment is committed at
`e06baf4b658713961825edc7996884308bc8c582` (tree
`6d8307b9e9923eafff13fa734931fde1e88b47b5`) and recorded in
`docs/autonomy-log.md` and `docs/decision-log.md`. A future increment must
inspect the frozen goal, this handoff, the latest logs, and the clean
controller diff before replacing this plan with one bounded executable plan.
Remaining WP3 slices: contained candidate execution with an execution
provider and pinned OCI contract, and conversion of the
`scripts/verify.mjs`/`tools/evidence.mjs` spawn layers to the shared
supervisor. WP5 owns Linux publication/race evidence and the first real
execution of the POSIX supervision paths. Do not infer product completion or
autonomous readiness from WP3a.
