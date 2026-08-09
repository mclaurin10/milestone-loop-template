# Current Execution Plan

**Status:** WP3b complete at `3efa3ed`; handoff recorded
**Updated:** 2026-08-08
**Owner:** autonomous loop

## Objective

Convert every process launch owned directly by `scripts/verify.mjs` and
`tools/evidence.mjs` from ad hoc `spawn`/`spawnSync` handling to the shared
bounded supervisor in
`tools/milestone-orchestrator/src/process-supervisor.ts`. Preserve the WP3a
and review-fix semantics end to end: bounded per-stream capture,
redact-before-write, process-tree termination on timeout or output breach,
exactly-once bounded settle, drain cutoff, and honest `rootExitObserved`
reporting.

This is WP3b, one process-containment increment. Non-goals: the separate OCI
execution-provider/container slice; any product-domain, bot, calibration, or
readiness work; POSIX execution/race evidence (WP5); conversion of other
repository `spawnSync` call sites; changes to WP2 retention or workspace
cleanup; and any autonomous-readiness or unsupported-platform claim.

## Goal Constraints

- `PROJECT_GOAL.md` is still the placeholder frozen authority and the package
  default remains `readiness`; this infrastructure increment cannot satisfy
  product completion.
- `scripts/verify.mjs` is a protected trust root. Its change is limited to
  importing/using the shared supervisor, making identity/runtime probes
  asynchronous, and replacing `runPackageScript` launch/capture. Do not
  change `ESTABLISHED_IMMUTABLE_LOCK_SHA256`, profile/stage definitions,
  status weights or exit codes, acceptance/lock validation, evidence-receipt
  validation, identity-drift rules, or completion eligibility. The exact
  immutable-lock check must pass before and after the edit.
- Preserve the authoritative verifier result/receipt contract. Additive
  command supervision evidence is permitted; no prior field or meaning may
  be removed or weakened.
- `tools/evidence.mjs` must continue to expose its existing result-oriented
  helpers to callers, with asynchronous call sites updated explicitly. A
  timeout or cap breach must be non-passing, never a successful exit-only
  result.
- Exact Node `24.18.0` and pnpm `11.15.1` own every command. The unrelated
  untracked `.claude/` directory remains untouched. The human file remains
  byte-identical at blob `d0abdd24f404d9dc335818c355e39f7cfc531300`
  and outside every commit.

## Baseline Evidence

- Handoff HEAD is `135b9aed4e5c150991a20880ea9a7b5af2d8c7c6`
  (tree `6aec24ab95eeb4b9fc684f9da159d424291516bf`), following WP3a
  implementation `e06baf4`, review fix `eab0cd6`, and their documentation
  commits. The tracked tree is unchanged; only the two unrelated untracked
  entries above are present.
- `artifacts/wp3-baseline-contract-direct-20260807/result.json` records all
  13 `contract-integrity` checks PASS under the exact runtime. The focused
  aggregate is correctly FAIL only because the adopting-project
  `verify:dependencies` command is still an honest placeholder. Direct file
  hashes match all baseline/active lock entries, and the lock itself matches
  the verifier pin
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`.
- The final WP3a review-fix receipts are present and valid: orchestrator 414
  tests (412 pass, 2 WP5 skips), unit 427 tests (425 pass, 2 WP5 skips), plus
  typecheck/lint/format and the safety demonstration at the paths cited in
  `docs/autonomy-log.md`.
- Structural gap: `scripts/verify.mjs` has one synchronous probe launcher and
  one bespoke async child lifecycle; `tools/evidence.mjs` has three
  `spawnSync` launch layers (citation grep, pnpm commands, and identity
  probes). These paths bypass WP3a supervision.
- Pinned focused baseline: process-supervisor, command-runner, and
  evidence-receipt suites passed; aggregate verifier identity had two passes
  and one control failure because its isolated fixture acquired an unexpected
  lockfile/dirty transition while launching its nested package script. The
  conversion must make the protected verifier's transitive fixture and pinned
  package-manager boundary explicit rather than normalize that drift.

## Steps

1. [x] Inspect frozen authority, operating contract, completed WP3a plans and
       logs, working tree/history, immutable lock, relevant code/tests, and
       retained evidence; reproduce the focused baseline.
2. [x] Make the supervisor directly loadable by the plain pinned
       Node trust root without changing its behavior, then convert
       `tools/evidence.mjs` launches to an asynchronous supervised result
       adapter with bounded redacted output. Update every evidence caller to
       await the new boundary.
3. [x] Change-control `scripts/verify.mjs`: adopt the same supervisor for
       probes and stage commands, persist full supervision disposition on
       launched command records, redact retained output before console/log
       writes, and leave all protected semantic anchors named above intact.
       Update the isolated verifier fixture for the exact transitive trust
       files and pinned package-manager state.
4. [x] Add regressions for the evidence adapter (normal/redacted output,
       output breach, timeout), direct plain-Node supervisor loading, and the
       authoritative verifier command supervision/identity controls. Run the
       focused suites until green; retain the two POSIX-only WP5 skips.
5. [x] Run receipt-owning typecheck, lint, format, complete orchestrator and
       unit aggregates, the safety demonstration, focused contract-integrity
       verification, and repository/hash checks. Inspect the resulting JSON
       and logs rather than relying on exit codes alone.
6. [x] Record the durable decision and completed evidence in
       `docs/decision-log.md`, `docs/autonomy-log.md`, and this plan; commit
       only the cohesive WP3b increment with both unrelated untracked entries
       excluded.

## Acceptance Criteria

- `scripts/verify.mjs` and `tools/evidence.mjs` contain no direct
  `spawn`/`spawnSync` launch path; every command they own resolves through
  `superviseCommand` with a finite timeout, finite per-stream cap, and the
  shared kill grace.
- Normal commands preserve exit, signal, stdout/stderr, evidence receipt,
  candidate identity, and status semantics. Timeout and output-limit cases
  fail closed, carry the complete WP3a supervision record, and settle within
  the supervisor bound.
- No retained child output reaches a log, console write, manual report, or
  error message before sensitive-text redaction. Truncated output includes a
  bounded marker with retained/observed counts.
- Plain Node `24.18.0` can load the shared supervisor used by the protected
  verifier. Its default output-limit and kill-grace constants retain one
  runtime owner and their existing values.
- The authoritative verifier still reports schema `2.1.0`, exact stage and
  completion meanings, validates receipts and immutable hashes unchanged,
  and now records supervision for each launched stage command. Its isolated
  identity fixture remains self-contained and all three drift/control cases
  pass.
- Existing WP3a supervisor/runner regressions remain green, including bounded
  capture, redaction, exactly-once settle, post-exit `drainCutoff`, and
  `rootExitObserved`. WP2 retention/workspace-cleanup tests and the broad
  suites remain green.
- The immutable lock and all four governed file hashes remain exact. The human
  file hash is unchanged and neither unrelated untracked entry is committed.

## Verification

All commands run with `.tools/node-v24.18.0-win-x64` first on `PATH` and the
Corepack pnpm entry invoked by that exact Node, resolving pnpm `11.15.1`.

Focused checks:

```text
node -e "import('./tools/milestone-orchestrator/src/process-supervisor.ts')..."
vitest run tools/milestone-orchestrator/src/process-supervisor.test.ts tools/milestone-orchestrator/src/command-runner.test.ts tools/milestone-orchestrator/src/evidence-supervision.test.ts tools/milestone-orchestrator/src/evidence-receipt.test.ts tools/milestone-orchestrator/src/aggregate-verify-identity.test.ts --fileParallelism=false
node scripts/verify.mjs --stage contract-integrity --run-id <unique-id>
```

For the focused verifier command, overall FAIL remains expected while the
placeholder dependency script exists; acceptance requires the environment's
runtime/pin checks and every `contract-integrity` check PASS, plus a bounded
supervision record on the placeholder child.

Broader receipt-owning checks:

```text
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:orchestrator
pnpm test:unit
pnpm loop:demo-safety
git diff --check
git status --short
git hash-object -- "Implementation-ready improvement plan 8-5-26.txt"
```

No browser/visual evidence is required: this is a headless process-boundary
increment. Windows real-process evidence is supported here; POSIX group-kill,
drain-sweep, and publication races remain explicitly deferred to WP5 CI.

## Risks and Recovery

- Plain Node does not remap the supervisor's current runtime `contracts.js`
  import to TypeScript. Move only the two supervisor defaults to the
  supervisor as their single owner and re-export them from contracts; retain
  the type-only contract import. A direct pinned-Node import and existing
  config/runner tests guard this boundary.
- Converting synchronous evidence helpers to promises can accidentally record
  promises or race the manual-evidence lifecycle. Update every caller and
  cover report identity plus receipt finalization in tests.
- Captured output used to be written/printed in ad hoc forms. Central adapter
  rendering must redact the entire retained buffer before any write and append
  the truncation marker only afterward; do not stream raw chunks.
- The protected verifier fixture previously copied only `verify.mjs`; its new
  transitive supervisor is itself in the canonical protected controller
  subtree. Copy the exact dependency into fixtures and use contract-integrity,
  identity-drift, stage-registry, receipt, type, lint, and format checks as the
  change-control evidence.
- Windows post-exit stragglers behind a dead root and other recorded container
  residuals are not solved here. Do not broaden claims. Recovery is ordinary
  source-control reversal of this cohesive increment; no state, workspaces,
  retained evidence, or authority files require migration.

## Progress and Evidence

- 2026-08-07: Inspection complete; immutable lock verified, WP3a receipts
  inspected, exact-runtime focused baseline run, WP3b selected, and this plan
  written before production changes.
- 2026-08-07: Step 2 complete. The supervisor is directly importable by plain
  Node `24.18.0`; its existing defaults have one runtime owner. Evidence
  citation, pnpm, and identity launches use a bounded asynchronous adapter;
  every caller now awaits it and report records retain supervision. Syntax and
  direct identity probes pass (the sandboxed probe correctly cannot write the
  Git index, so broad evidence awaits the supported unsandboxed test run).
- 2026-08-07: Steps 3-4 complete. The protected verifier's identity probes
  and stage scripts now use the shared supervisor; a focused live verifier
  result records Node `24.18.0`, pnpm `11.15.1`, all 13 contract checks PASS,
  the expected placeholder FAIL, and a closed-stream supervision record.
  The exact-runtime focused suite passed 43 tests with the same 2 explicit
  WP5 POSIX skips. This includes the repaired three-case isolated identity
  fixture plus normal redaction, output breach, timeout, plain-Node import,
  constant ownership, and no-direct-spawn regressions.
- 2026-08-07: Receipt-owning typecheck, lint, and format PASS at
  `artifacts/manual/typecheck-22008/`, `artifacts/manual/lint-19500/`, and
  `artifacts/manual/format-check-18496/`. The lint/format reports contain
  normal closed-stream supervision records; typecheck records exact Node
  `24.18.0`, pnpm `11.15.1`, commit, tree, and dirty candidate identity.
- 2026-08-07: Complete orchestrator aggregate is non-passing and must be
  diagnosed before any commit: 419 tests, 415 passed, 2 failed, 2 explicit
  WP5 skips at
  `artifacts/manual/test-orchestrator-5020/orchestrator-report.json`; the
  manual manifest correctly records ERROR with no PASS receipt at
  `artifacts/manual/test-orchestrator-5020/manifest.json`. Both failures are
  timeout-shaped, although the JSON reporter retained only `STACK_TRACE_ERROR`:
  terminal failed-workspace cleanup ran 30.516 s against an explicit 30 s test
  timeout, and rejected-review reconciliation ran 60.243 s against the suite's
  60 s default. Their production files were not changed by WP3b, but they are
  unverified until focused reproduction establishes whether this is
  contention or a real regression. Do not cite this aggregate as passing.
- 2026-08-07: Fresh-session handoff requested because the execution metadata
  continued to report `workspace-write`/restricted after the user enabled
  full access; untagged dependency reads failed EPERM and each new command
  shape still required escalation metadata. No unit aggregate, safety demo,
  final focused contract run, logs, or commit has been attempted after the
  failed orchestrator aggregate.
- 2026-08-08: The requested exact-runtime, serial, verbose two-file
  reproduction initially retained the cleanup timeout (32.032 s against its
  unchanged 30 s deadline), while rejected-review reconciliation passed in
  40.057 s. Inspection found an unrelated `C:\Dev\recovery-loop` Vitest/Git
  integration run overlapping on the host at roughly 67-80% total CPU; all
  long-lived sibling timings were similarly inflated relative to both final
  WP3a aggregates. After that out-of-scope workload exited, the identical
  command passed 24/24 with no source or timeout change: failed-workspace
  cleanup completed in 26.264 s and rejected-review reconciliation in
  32.065 s. This supports aggregate host contention, not a WP3b regression or
  a WP2 cleanup/reconciliation defect.
- 2026-08-08: A subsequent complete receipt-owning orchestrator run was
  heavily contended after an unrelated `C:\Dev\recovery-loop` full Vitest
  suite restarted repeatedly and drove host CPU to 96-98%. It finished after
  59 minutes with 410/419 passing, 2 expected WP5 skips, and 7 failures at
  `artifacts/manual/test-orchestrator-3512/orchestrator-report.json`; the
  command correctly produced no PASS receipt and an ERROR manifest. Six
  failures were explicit 30 s, 60 s, 360 s, or 600 s wall-clock deadline
  overruns. The seventh was a cascade from the timed-out target-integration
  matrix retaining its controller lease into the following case. No source,
  timeout, WP2 cleanup, or retention behavior changed. A quiet-host complete
  rerun is still required.
- 2026-08-08: The next aggregate started after a quiet window but an unrelated
  full Vitest suite restarted ten minutes later. It improved to 416/419
  passing with 2 expected WP5 skips and one failure at
  `artifacts/manual/test-orchestrator-7220/orchestrator-report.json`: exact
  workspace-publication adoption exceeded its unchanged 60 s deadline by
  118 ms while the external suite saturated the host. The command correctly
  wrote no PASS receipt. With the host clear, the complete focused
  `workspace-create-recovery.test.ts` file then passed 5/5; the same adoption
  case took 34.809 s, and the 360 s crash matrix took 195.171 s. No production
  or timeout change was warranted. A complete passing aggregate remains
  required.
- 2026-08-08: The quiet-host complete orchestrator aggregate passed all 419
  tests (417 passed, 2 explicit WP5 POSIX skips, 0 failed) in 38 minutes at
  `artifacts/manual/test-orchestrator-14944/orchestrator-report.json`.
  `result.json` is a valid PASS receipt for the exact command/stage; its
  declared report bytes/SHA-256 and the manifest's receipt bytes/SHA-256 were
  independently rechecked and match. The host stayed clear of the unrelated
  workload throughout.
- 2026-08-08: The first unit aggregate continued after the interactive turn
  was interrupted, then hit its unchanged 3,600,000 ms evidence-command
  timeout. Telemetry at
  `artifacts/loop-telemetry/direct/direct-test-unit-20260808201505341-24196-f983ef4c/`
  records the exact timeout; `artifacts/manual/test-unit-24196/manifest.json`
  is ERROR with no test report and no PASS receipt. Because live host/process
  observation was interrupted, no unsupported test-failure claim is made; a
  complete rerun is required. Prior clean WP3a unit aggregates completed in
  39-40 minutes, so the one-hour bound remains unchanged.
- 2026-08-08: An uncontended unit rerun completed in 37 minutes with 429/432
  passing, 2 expected WP5 skips, and one deterministic fixture failure at
  `artifacts/manual/test-unit-22236/test-report.json`; the ERROR manifest has
  no PASS receipt. `tools/production-build.test.mjs` copied the converted
  `tools/evidence.mjs` into its isolated PASS-receipt fixture but omitted the
  new transitive `process-supervisor.ts`, so plain Node failed with
  `ERR_MODULE_NOT_FOUND`. The focused suite reproduced 12/13. The fixture now
  copies an explicit repository-relative wrapper dependency graph, creating
  nested destinations before copy; the unchanged PASS-receipt case is the
  regression guard and the focused suite passes 13/13. Production build,
  receipt, WP2, and timeout semantics are unchanged. Final unit and
  orchestrator receipts must be refreshed from this corrected test tree.
- 2026-08-08: The corrected-tree complete unit aggregate passed all 432 tests
  (430 passed, 2 explicit WP5 POSIX skips, 0 failed) at
  `artifacts/manual/test-unit-21692/test-report.json`. Its command-owned PASS
  receipt and manifest bind the exact stage/command; independently recomputed
  report and receipt bytes/SHA-256 match every declaration. A corrected-tree
  orchestrator receipt refresh remains before the later verification gates.
- 2026-08-08: The final corrected-tree orchestrator refresh passed all 419
  tests (417 passed, 2 explicit WP5 POSIX skips, 0 failed) at
  `artifacts/manual/test-orchestrator-1444/orchestrator-report.json`. Its PASS
  receipt and manifest bind `test-orchestrator` to the milestone verification
  tier; independently recomputed report and receipt bytes/SHA-256 match every
  declaration. The skipped tests are exactly the POSIX group-SIGKILL and
  grandchild-on-timeout cases retained for WP5.
- 2026-08-08: `pnpm loop:demo-safety` passed all six scenarios at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260809002843117-741e4c73.json`.
  The final focused verifier at
  `artifacts/wp3b-final-contract-20260808/result.json` preserved schema
  `2.1.0`: all exact-runtime/pin checks and all 13 contract-integrity checks
  pass, the dependency placeholder remains the sole expected command failure
  with a bounded closed-stream supervision record, and completion is
  ineligible. This is focused contract evidence, not a readiness result.
- 2026-08-08: Final receipt-owning typecheck and lint pass at
  `artifacts/manual/typecheck-6956/` and `artifacts/manual/lint-5448/`. The
  first final format run correctly produced only an ERROR manifest at
  `artifacts/manual/format-check-13128/` because the repaired
  production-build fixture needed mechanical formatting. After formatting,
  its focused suite still passed 13/13 and final format passed at
  `artifacts/manual/format-check-3044/`. All five final command-owned PASS
  receipts (orchestrator, unit, typecheck, lint, format) have matching report
  and receipt bytes/SHA-256 declarations; lint/format supervision is bounded
  and closed-stream.
- 2026-08-08: Final contract and repository checks pass. The immutable lock
  remains exactly
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`;
  all four governed files match baseline and active hashes with calibration
  still `open_not_started`. Neither converted trust root contains a direct
  `spawn`/`spawnSync` call, `git diff --check` is clean, `.claude/` remains
  ignored and outside the diff, and the unrelated human file remains exact at
  blob `d0abdd24f404d9dc335818c355e39f7cfc531300`. Every WP3b acceptance
  criterion had been observed; at that checkpoint, the cohesive
  implementation commit was the only remaining action before recording its
  identifier and autonomy handoff.
- 2026-08-08: The cohesive WP3b implementation, tests, durable decision, and
  verified plan were committed as
  `3efa3ed77b46abdea61e4b867a5998e92f54d6c3` (tree
  `8cb1bd29486f643830ff19e39ede38945ed7ea73`). The staged path audit excluded
  `.claude/` and the unrelated human file; post-commit status contained only
  that untracked human file at its required blob. The exact commit identity
  and outcome are now recorded in `docs/autonomy-log.md`.

## Next Action

Begin a fresh inspect/plan loop from WP3b implementation commit `3efa3ed` for
the next bounded WP3 containment increment. Re-read the remaining audit and
improvement-plan gaps, select one cohesive slice, and write its executable
plan before production changes. Do not treat WP3b, the focused contract
result, or Windows-only evidence as product completion, autonomous readiness,
or unsupported-platform coverage.
