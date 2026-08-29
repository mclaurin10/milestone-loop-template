# Current Execution Plan

**Status:** Complete — intended WP6b instrumentation and WP6c omission coverage
**Updated:** 2026-08-29
**Owner:** autonomous loop

## Objective

Complete intended WP6b by adding command-owned, schema-validated compact
per-run measurement summaries and a deterministic summary-only reducer, then
repair the intended WP6c partition/shadow acceptance surface with semantic-ID
and integration-level omission mutations. Produce exact, independently checked
evidence and a durable handoff to intended WP6d.

Historical naming crosswalk: repository history called the owner-derived
partition and shadow implementation “WP6b”; that historical work corresponds
to intended **WP6c**. Intended **WP6b** is the compact-summary and measurement
instrumentation increment in this plan. This crosswalk describes history and
does not rewrite it or change the legacy commissioned schedule.

Explicit non-goals are candidate-tier or manifest recomposition, workflow argv
changes, slow-suite registry changes, benchmark CI or the Windows/Linux matrix,
`benchmark.ts` semantic changes, product behavior, readiness meaning, CAL-1,
and any frozen authority or immutable acceptance change.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the original acceptance contract, immutable hash
  baselines/active hashes, readiness gates, and the protected untracked roadmap
  byte-for-byte.
- Keep the commissioned legacy verification schedule authoritative. The new
  measurements are non-semantic: missing or invalid summaries block only the
  new summary/reducer proof, never redefine an underlying test result or
  authorize a tier cutover.
- Preserve the existing owner catalogue, disjoint-union proof, same-commit
  legacy/partition semantic comparison, exact-runtime workflow commands,
  active verification manifest, and all public owner command identities.
- A successful command must own a genuine receipt whose declared artifacts
  hash-bind the compact summary. The reducer must consume only validated
  summaries, use deterministic ordering, and write hash-bound output.
- Measurement fields must define units, boundaries, platform/runtime
  provenance, and explicit measured/unavailable/not-applicable dispositions.
  Wall time, setup, Git-fixture work, process startup, test-body time, CPU, and
  peak RSS must remain distinguishable rather than inferred or conflated.
- Retain valid raw evidence and rejected-candidate history. Do not represent
  documentation-only Y (`c52a4748193dea0b19a558c79a9ced3ee4ed14e0`) as
  shadow-tested; executable predecessor X is
  `0400c32f93ebf0b7d8e6be165e880dd9aff2ebbe`.

## Baseline Evidence

- `master`, `origin/master`, and HEAD are Y
  `c52a4748193dea0b19a558c79a9ced3ee4ed14e0`, tree
  `fa295001603084576dbd95274bc9c0989fcd7f15`; `X..Y` changes only
  `.agent/current-exec-plan.md`, `docs/autonomy-log.md`, and
  `docs/decision-log.md`.
- The sole worktree entry before this plan was protected untracked
  `Implementation-ready improvement plan 8-5-26.txt`, independently checked at
  SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- `evals/immutable-contract-lock.json` is unchanged at SHA-256
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`.
- Existing `test-partitions.ts` proves file ownership/union and semantic
  equivalence from raw Vitest reports. Unit mutations cover file-union omission
  and semantic mismatch, but do not explicitly pin missing and unexpected test
  identities, and no integration mutation removes one executed representative
  test while checking aggregate failure/no-PASS-receipt/retained evidence.
- Existing partition and aggregate receipts bind raw reports and the shadow
  proof, but no compact measurement-summary schema or summary-only reducer is
  present. Existing timing fields do not distinguish the required measurement
  phases or resource dispositions.
- Retained X evidence remains at `C:/w/e8`, including `shadow/` and the honest
  default-readiness failure; it is historical baseline evidence, not evidence
  for this increment.

## Steps

1. **Complete — inspect and reconcile baseline.** Validate authorities, Git
   identities, protected bytes, historical evidence, WP6 records, current
   partition implementation, and acceptance omissions.
2. **Complete — implement intended WP6b contracts and instrumentation.** Add
   strict compact-summary/reducer schemas, phase/resource instrumentation,
   command-owned artifact/receipt binding, deterministic summary-only
   reduction, and fail-closed missing/malformed/contradictory/stale/identity
   mutation coverage.
3. **Complete — repair intended WP6c omission coverage.** Add explicit missing
   and unexpected semantic-ID mutations plus an integration mutation that
   omits one representative executed test and proves aggregate nonzero, no PASS
   receipt, and useful retained diagnostics.
4. **Complete — qualify the tracked implementation.** Run focused and broad
   checks with pinned Node/pnpm, inspect schemas, receipts, hashes,
   dispositions, identities, and resource summaries, and correct every harness
   defect without changing commissioned semantics.
5. **Complete — commit executable candidate and run clean short-path shadow.**
   Commit the cohesive implementation, clone that exact commit to short paths,
   run ownership/owners/shadow, and independently validate all declared
   evidence. Preserve failed attempts accurately. The first clean-candidate
   shadow exposed a pre-existing controller-lease PID-incarnation race during
   hard-loss recovery; fix that fail-closed liveness defect with focused
   regression coverage before repeating the complete clean shadow.
6. **Complete — record closeout and commit documentation successor.** Update
   this plan, autonomy log, and decision log with the crosswalk, exact evidence,
   executable/documentation identities, limitations, and intended WP6d handoff;
   verify the successor is documentation-only and leave the tracked tree clean.

## Acceptance Criteria

- Every measured run emits one strict compact summary with deterministic field
  and collection ordering, exact candidate/command/run identity, defined units
  and boundaries, Windows/Linux/runtime provenance, explicit availability for
  every required timing/resource metric, and no semantic effect on the run.
- Each summary is declared by its producing command receipt. The reducer
  accepts only validated summary artifacts, reads no raw reports/logs, rejects
  missing, malformed, contradictory, stale, duplicate, or identity-mismatched
  input, and emits deterministic output declared by a genuine receipt.
- Focused mutations prove each fail-closed summary/reducer boundary, including
  hash or candidate drift after summary creation.
- Existing ownership, exact disjoint union, raw-report validation, child exit
  propagation, and semantic equivalence behavior remain green.
- Separate semantic mutations produce non-empty `missingTests` and
  `unexpectedTests`. An integration-level executed-surface omission exits
  nonzero, leaves no aggregate PASS `result.json`, and retains an inspectable
  failure manifest/proof naming the omitted semantic identity.
- No active manifest, commissioned source, exact-runtime workflow command,
  slow-suite registry, tier composition, or `benchmark.ts` semantic diff
  exists. No Windows/Linux benchmark matrix is run.
- Exact implementation qualification and the final short-path shadow bind a
  clean committed candidate. The no-argument readiness run is reported
  honestly and contains no new harness error even if product placeholders keep
  it non-passing.
- Final tracked tree is clean; only the protected ignored-by-policy roadmap is
  present untracked and its SHA-256 is unchanged.

## Verification

Use `.tools/node-v24.18.0-win-x64/node.exe` and pnpm `11.15.1` for every cited
command. During iteration, route evidence to unique short directories outside
the repository where supported.

- Focused summary/schema/reducer and mutation tests, including the
  integration-level omission fixture.
- Existing `test-partitions.test.ts`, `test-ownership.test.ts`, evidence
  receipt/supervision regressions, and exact-runtime workflow-contract tests.
- `pnpm exec tsx tools/milestone-orchestrator/src/test-ownership-cli.ts`
- All four `pnpm test:partition:<owner>` commands.
- Clean committed short-clone `pnpm test:partitions:shadow` with a short
  external evidence/runtime root, followed by independent manifest, receipt,
  artifact-size/SHA-256, raw-disposition, candidate, reducer, and resource
  summary inspection.
- `pnpm test:invariants`
- `pnpm test:unit`
- `pnpm test:orchestrator`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm loop:demo-safety`
- `git diff --check`
- Honest no-argument `pnpm verify`

No rendered/visual evidence is required because this increment changes only
headless verification/evidence infrastructure and documentation. The required
headless evidence is the real pinned-runtime owner/partition/shadow execution,
not a synthetic substitute.

## Risks and Recovery

- Cross-platform CPU/RSS observation can be unavailable or non-comparable.
  Record platform-specific collection method and an explicit disposition; do
  not substitute zero or infer a value.
- Phase instrumentation can perturb measured time. Keep probes monotonic,
  bounded, command-scoped, and descriptive; this package records measurements
  but makes no performance or cutover claim.
- Vitest may not expose a clean process-start/test-body boundary. Define the
  observable boundary precisely and fail schema validation if phases overlap,
  exceed wall time, or claim unavailable data as measured.
- Integration omission tests can be expensive. Use a minimal real executable
  fixture through the production aggregate/reducer boundary, with explicit
  test-only injection rather than weakening production validation.
- If an implementation commit fails clean qualification, preserve its evidence
  and fix forward in a new cohesive commit. Ordinary Git commits provide
  rollback; never discard protected or unrelated worktree bytes.

## Progress and Evidence

- Baseline inspection completed on 2026-08-28. Branch/commit/tree, X-to-Y
  documentation-only diff, roadmap hash, immutable-lock hash, package pins,
  current plan defect, logs, retained X evidence roots, and partition code/tests
  were checked directly.
- The strict summary/reduction runtime contracts and JSON schemas, receipt
  binding, command-scoped process probe, deterministic summary-only reduction,
  owner/legacy instrumentation, explicit missing/unexpected semantic-ID unit
  mutations, and real executed-surface omission mutation are implemented.
- Pinned-runtime focused checks passed for the seven summary/schema/reducer
  tests and all twenty partition/shadow tests; the latter includes a real
  omission CLI that exited nonzero, wrote no aggregate PASS receipt, and
  retained its failure manifest, proof, raw reports, and fixture. Tool TypeScript
  compilation also passed before documentation formatting. Broader
  qualification and independent artifact inspection remain pending.
- The first full `test:unit` qualification attempt at
  `C:/w/wp6b-i1/unit-full` retained a truthful non-PASS report: 679/681 tests
  passed and two isolated-copy fixtures could not resolve the new summary
  module. No PASS receipt or summary was written. The production-build wrapper
  fixture and contract-integrity adapter fixture now install the exact new
  summary/probe dependency closure; both formerly failing real-subprocess
  assertions pass focused reruns; the complete broad rerun is recorded below.
- The repaired full-unit rerun at `C:/w/wp6b-i1/unit-full-rerun` passed all
  681 tests in 200 suites. Independent inspection matched both receipt
  artifact hashes and validated the strict summary: 81 report files, 315
  instrumented processes, exact pinned runtime provenance, all required
  measured dispositions, and false semantic/cutover/benchmark flags.
- Two orchestrator attempts were retained rather than normalized away. The
  first had one unchanged 30-second workspace fixture timeout; that exact
  instrumented assertion then passed three times in 16.8–19.2 seconds without
  a timeout change. The second passed all tests but exposed a persistent empty
  atomic probe `.tmp` left by a force-terminated process, and therefore wrote
  no receipt. Probe reduction now waits through a bounded rename-quiescence
  window and classifies a persistent incomplete record as explicit
  Git/startup/CPU/RSS unavailability without changing passing test semantics;
  its regression passes. The unchanged orchestrator rerun then passed all 666
  tests in 198 suites at `C:/w/wp6b-i1/orchestrator-full-rerun2`, and its
  receipt/summary hashes and runtime/resource fields were independently
  validated.
- The standalone executed-surface omission mutation at
  `C:/w/wp6b-i1/omission-mutation` exited one as designed, has no `result.json`,
  and retains a FAIL manifest plus five declared artifacts. Its proof contains
  exactly one named `missingTests` identity and no unexpected or outcome delta.
- Final pre-commit checks passed: tool TypeScript, lint, formatting, 95 focused
  summary/partition/ownership/supervision/receipt/workflow regressions, the
  five-command invariant suite, demo safety, and `git diff --check`. The
  protected roadmap and immutable lock remain at their baseline SHA-256 values;
  no active manifest, exact-runtime workflow, slow-suite registry, tier,
  benchmark, or frozen-authority file is changed.
- No benchmark matrix, tier recomposition, or commissioned-semantic change has
  begun.
- Executable candidate Z is
  `75788cbb6bec6d820df343bd102372a9417bae9e`, tree
  `b6014911da834b72edbfb09f74638888f26a77a5`. Its clean owner inventory and
  all four owner commands passed from `C:/w/z9`, with evidence under
  `C:/w/e9/ownership` and `C:/w/e9/owners`.
- The first clean Z shadow at `C:/w/e9/shadow` correctly retained a FAIL
  manifest and no PASS receipt after legacy-orchestrator reported 665/666
  passing assertions. The failure was the hard-loss candidate recovery matrix
  observing an unrelated live process under a crashed controller's reused
  PID, rather than the expected candidate-prepare blocked result. The same
  focused assertion passed unchanged on immediate reproduction, but probe
  records from the failed run independently show repeated PID reuse, including
  one PID reused within 55 seconds. Controller lease liveness currently checks
  the recorded start time only when the recorded PID equals the acquiring
  process PID, so a different live process incarnation can be mistaken for the
  former controller. This is a fail-closed correctness regression and must be
  fixed and tested before shadow qualification resumes; the failed attempt is
  not passing evidence.
- The lease now queries the same-host occupant's actual process start time on
  Windows (bounded Windows PowerShell `Get-Process`) or POSIX (`ps` under the C
  locale) before treating a live PID as the recorded controller incarnation.
  A missing occupant is stale; a start-time mismatch is PID reuse; an
  unavailable observation remains fail-closed. The 18-test lease suite passes,
  including one live child that is first refused under its matching start time
  and then reclaimed only after the lease records a different incarnation.
  The original candidate hard-loss matrix passed under the WP6 process probe
  in 401.7 seconds and wrote its complete matrix at
  `C:/w/e9/pid-fix-focused/candidate-prepare-matrix.json`. Typecheck, lint,
  formatting, and diff hygiene also pass after the fix.
- Fix-forward executable candidate Q is
  `b1d43a2abaf46ad16a79e32b08b3a9b9a548eace`, tree
  `acdf9100b96ce17ec5fd2a1df10aba75362b3ce9`. A fresh offline frozen install
  in clean short clone `C:/w/za` used pinned Node `24.18.0` and pnpm `11.15.1`;
  the corresponding external evidence root is `C:/w/ea`.
- Final focused and owner evidence on Q passed: 103/103 focused tests in 29
  suites (`focused/focused-report.json`, SHA-256
  `4178930b76d181a41875eafcbe60a495dc92a53a9845357b44c3f4c4e1055320`),
  ownership over 82 files, and standalone owner partitions of 663
  controller-runtime, 16 repository-tooling, 4 adopter-template, and 1
  trusted-container-fixture test. Every owner receipt/artifact hash was
  independently rechecked; all summaries bind exact clean Q, use the pinned
  runtime, expose valid measurement dispositions, and retain false semantic,
  cutover, and benchmark flags.
- The final clean shadow at `C:/w/ea/shadow` passed 684 unique tests over the
  exact 82-file disjoint union. It deduplicated 1,351 legacy observations to
  the same 684 semantic identities as the partitions, with no conflicts,
  multiply selected tests, missing tests, unexpected tests, or outcome
  mismatches. The aggregate receipt, proof, and summary-only reduction hashes
  are respectively
  `74cd01dffdeb7073eebd331600a8473778a2e636d09ec57e86944cf26841cc55`,
  `5e356ebc80013dd2cde2962da8f2dbebe20749c108969b609326b92a7f9ace42`,
  and
  `5b2fbfa886fbd386d1a1d44360b9c848a0ee0f3fd0411dba4e135510c701eca5`.
  Runtime validation independently accepted all eight input summaries and the
  reduction (`inputSetSha256`
  `5d9569fc64b2fba18fd6fee23f26a024a98308cb0f6317f0103357f540662f5c`,
  `contentSha256`
  `c16a8f80bca8646afb1dbfcf4d2c520ed4ed766920196d808527b7ec8fa89234`).
  All seven metrics are measured for all eight inputs; the reduction observes
  2,035 passing executions and carries no semantic/cutover/benchmark claim.
- Final broad/static qualification on Q passed: the five-command invariant
  suite (`C:/w/ea/invariants`), `pnpm test:unit` at 683/683 in 200 suites
  (`C:/w/ea/unit`), `pnpm test:orchestrator` at 667/667 in 198 suites
  (`C:/w/ea/orchestrator`), typecheck, lint, format, the standalone exact
  workflow contract at 5/5, demo safety at 6/6, and `git diff --check`.
  Receipt/artifact hashes and exact clean candidate identity were rechecked for
  every receipt-owning command. The unit report SHA-256 is
  `dea8dedd15d76b674615b1733b2f66aca0bfb48cf6fa45864172f3136a959498`;
  the orchestrator report SHA-256 is
  `bda9826af15a4dc264708292f9027b3328501b8bd6ac4da4928a4d2da808b624`.
- Exact no-argument `pnpm verify` ran for 59.8 minutes at
  `C:/w/za/artifacts/verify-2026-08-29T060015-721Z-1184`. It ended honestly
  FAIL/exit 1 with 2 PASS, 2 FAIL, 11 NOT_READY, and 0 ERROR stages. The nested
  full unit command passed 683/683 with valid receipt/summary, all supervised
  commands had no timeout, output-limit, stream-drain, or duplicate-settle
  defect, contract integrity passed, and initial/final candidate identity was
  exact clean Q with no drift. Only the existing dependency and architecture
  placeholders, undeclared production build/domain/readiness commands, and
  unattested execution provider keep completion ineligible. The result and
  run-manifest SHA-256 values are
  `82a062381ed983fdae49d99a96b387a65a09907b88e905f2d7ebeac2ea24e7eb`
  and
  `3b1e9dcfd1a05597ea2b2345b5108d108338b0bedc02c3a1e1b68283f35e369a`.
- The final implementation diff from documentation-only Y changes 24 tracked
  files and does not touch the active verification manifest, commissioning
  source, exact-runtime workflow, slow-suite registry, `benchmark.ts`,
  package/verify entry points, frozen authority, or acceptance files. The
  immutable lock remains
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`;
  the protected roadmap remains
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.

## Next Action

Begin intended WP6d only under a new active plan. WP6d owns the benchmark CI
lane and the prescribed repeated cold/warm Windows/Linux matrix, consuming the
strict compact summaries without redefining test success. It must preserve the
legacy commissioned schedule and must not recompose the active manifest or
candidate tiers; that belongs to intended WP6e. Performance interpretation and
the go/no-go decision remain intended WP6f. This closeout makes no Linux,
cross-platform performance, benchmark-improvement, or cutover claim.
