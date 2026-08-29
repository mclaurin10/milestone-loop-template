# Current Execution Plan

**Status:** Active — step 0c (hosted CI validation of the fix-forward commit) in progress
**Updated:** 2026-08-29
**Owner:** autonomous loop
**Predecessor:** intended WP6b/WP6c closed at commit
`62f225f` (docs closeout; executable candidate Q
`b1d43a2abaf46ad16a79e32b08b3a9b9a548eace`) — see the 2026-08-29
autonomy-log entry.

## Objective

Complete intended **WP6d** in two bounded parts, in order:

1. **Measurement-contract repair.** Close the 2026-08-29 external review
   findings so that contradictory producer output actually fails closed at the
   summary and reduction validators before anything consumes those artifacts,
   and make the omission-mutation evidence claim only what it exercises.
2. **Benchmark CI lane.** Add the additive hosted lane that runs the
   prescribed repeated cold/warm Windows/Linux matrix over the measured
   verification commands, consuming strict compact summaries
   (`milestone-loop-test-run-measurement.v1`), producing per-run reductions
   and deterministic descriptive statistics, and making no benchmark,
   improvement, or cutover claim.

Explicit non-goals: manifest/tier/slow-registry recomposition and any
candidate-schedule change (intended WP6e); performance interpretation and the
go/no-go decision (intended WP6f); `benchmark.ts` / commissioned D032
(`d032-loop-efficiency.v1`) semantics; test-success meaning; readiness gates;
CAL-1; frozen authorities; immutable acceptance; rewriting historical records.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the original acceptance contract, readiness
  gates, and every frozen authority byte-for-byte. The immutable lock remains
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`; the
  protected untracked roadmap remains untracked and byte-identical at
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- The legacy commissioned candidate schedule stays authoritative throughout
  WP6d. The active generic verification manifest, verification tiers,
  `config/slow-suite-registry.json`, `benchmark.ts`, package/verify entry
  points, and the existing `.github/workflows/exact-runtime-ci.yml` jobs are
  not modified. New scripts/workflows are additive only.
- Measurement artifacts remain non-semantic: `nonSemantic` flags stay false;
  metrics can never alter test success, authorize cutover, or state a
  benchmark claim.
- Historical log entries and retained evidence are never rewritten or edited;
  corrections are appended.

## Baseline Evidence

- HEAD `62f225f` pushed to `origin/master` on 2026-08-29; hosted run
  33267979183 **failed**, as did the runs for both prior WP6-era pushes
  (32923050149 at `18324be` and 33010495747 at `c52a474`, both 2026-08-26).
  Hosted CI has been red since the WP6c ownership gate landed; the last green
  hosted run is 32785374927 at `b01467b` (2026-08-24). The trusted-container
  job passes; the failures are Controller (both platforms, invariant suite →
  `test-ownership`) and Fresh adopter smoke (both platforms, generated
  adopter strict typecheck). Neither WP6b/c closeout claimed hosted-CI
  status, but the lease-liveness `ps` path still has no hosted-Linux
  execution because the invariant suite fails before the test suites run.
- Root cause A (diagnosed 2026-08-29 from retained CI evidence): the
  ownership gate's `runVitestDiscoveryPass`
  (`src/test-ownership.ts` ~lines 729–774) parses the entire
  `pnpm exec vitest list --json` stdout as JSON. On hosted runners pnpm 11
  prints its pre-run dependency-verification banner ("Scope: all 2 workspace
  projects", supply-chain policy line, "Already up to date") to stdout ahead
  of vitest's JSON — the retained
  `ownership-discovery-01-1.stdout.log` shows the valid JSON array after the
  banner. Local runs emit no banner, which is why qualification passed.
- Root cause B (reproduced locally 2026-08-29, exit 2 with the identical
  error): `src/test-ownership.ts` line 9 imports
  `../ci/exact-runtime-workflow-contract.js`, but the adopter packager
  (`src/adopter-package.ts` `copyReusableRuntime`, ~lines 482–505) copies
  only `src/**/*.ts`; nothing under `tools/milestone-orchestrator/ci/` is
  packaged, so every generated adopter fails strict typecheck with TS2307.
  Related latent gap found on the same path: `src/test-run-probe.cjs` is
  excluded by the `.ts`-only filter, so packaged adopters are missing the
  WP6 probe at runtime even though `test-run-summary.ts` resolves it by
  path (`PROBE_PATH`, line 37).
- Candidate Q closeout evidence (autonomy log 2026-08-29): eight validated
  summaries and one reduction, external evidence at `C:/w/ea`;
  receipt/proof/reduction SHA-256
  `74cd01df…`, `5e356ebc…`, `5b2fbfa8…`.
- External review findings, independently verified in code on 2026-08-29:
  - **Summary validator** (`src/test-run-summary.ts`): measured durations
    accept `sampleCount === 0` (`validateDuration`, ~line 394); an
    unavailable probe constrains `processCount` but not
    `synchronousLaunchCount` (~lines 766–773); no relationship couples probe
    availability to Git/startup/test-body/CPU/RSS availability, and
    CPU/RSS `processCount` are never reconciled with `probe.processCount`
    (~lines 706–773). The loader (~line 1451) and the reducer (~line 1558)
    both delegate to the same `assertTestRunSummary`, so no second layer
    catches these.
  - **Reduction validator** (`src/test-run-summary.ts`):
    `validateDispositionCounts` (~lines 1686–1713) never reconciles
    disposition rows with the `measuredCount`/`unavailableCount`/
    `notApplicableCount` counters or with `inputCount`; duration metrics have
    no zero-measured coherence rule (~lines 1915–1916), although RSS has the
    analogous rule (~line 1979); inputs accept a null `owner` for any role
    including `partition` (~lines 1792–1796).
  - **Omission mutation** (`src/test-partitions.ts`): the test-only CLI
    (~line 1822) runs real Vitest and the production comparator but bypasses
    the normal aggregate finalization (compare → validate summaries → reduce
    → proof → throw-before-receipt, ~lines 1655–1759); its retained FAIL
    message (~line 2012) claims "the aggregate rejected … and issued no PASS
    receipt", overstating what ran.
  - Reviewer recalibrations to confirm, not assume: all eight retained Q
    summaries and the retained reduction are claimed to satisfy the missing
    relationships; `reduceTestRunSummaries` is claimed to currently generate
    internally consistent reductions.
- Measured command surface: legacy `test:orchestrator` / `test:unit`,
  partition scripts `test:partition:<owner>` (controller-runtime,
  repository-tooling, adopter-template, trusted-container-fixture), aggregate
  `test:partitions:shadow`; probe preload `src/test-run-probe.cjs`; JSON
  Schemas `schemas/test-run-summary.schema.json` and
  `schemas/test-run-reduction.schema.json`.
- Honest no-argument `pnpm verify` remains FAIL (2 PASS / 2 FAIL /
  11 NOT_READY) solely from pre-existing placeholder stages; this bounds
  completion claims and is out of scope here.

## Steps

0. **[in progress] Restore hosted CI at the pushed head.** Both root causes
   are diagnosed (see Baseline Evidence); fix forward and re-run until the
   exact-runtime matrix is green on both platforms, which also gives the
   lease-liveness `ps` path its first Linux execution. No later step starts
   on a red head.
   - **0a — ownership discovery must not parse a shared stdout stream.**
     Have Vitest write discovery JSON to a declared file (`vitest list
     --json=<path>` into the discovery artifact directory) and parse that
     file, so wrapper stdout (pnpm banners, warnings) cannot corrupt the
     input; keep the fail-closed behavior for a missing/invalid file.
     Regression: discovery succeeds with polluted stdout, still fails on
     malformed/missing JSON file output.
   - **0b — package the `ci/` contract module the runtime now imports.**
     Make the adopter package include
     `tools/milestone-orchestrator/ci/exact-runtime-workflow-contract.ts`
     (or relocate the contract under `src/` if that stays cohesive), and
     decide `test-run-probe.cjs` packaging explicitly: ship it so the
     packaged summary machinery can run, or record the exclusion and its
     runtime consequence. Regression: adopter package creation followed by
     strict typecheck of the generated output (the local reproduction
     already exists), so the packager can no longer drop a compile-time
     dependency silently.
   - **0c — re-run hosted CI** on the fix-forward commit and record the
     green run URL for both platforms.
1. **Tighten summary semantic validation (review finding 1).** First derive
   the true producer invariants from the summary producer and
   `test-run-probe.cjs`, then encode only truthful relationships in
   `assertTestRunSummary`:
   - unavailable probe ⇒ `synchronousLaunchCount === 0`;
   - unavailable probe ⇒ `gitFixtureTime`, `processStartupTime`,
     `testBodyTime`, `cpuTime`, `peakRss` must not be `measured`;
   - measured `wallTime`/`setupTime`/`testBodyTime` ⇒ `sampleCount ≥ 1`;
     per-metric floors for `gitFixtureTime`/`processStartupTime` exactly as
     the producer can truthfully emit them (e.g. measured Git time with zero
     samples is legitimate only with `nanoseconds === "0"`), derived, not
     guessed;
   - measured `cpuTime.processCount`/`peakRss.processCount` reconciled with
     `probe.processCount` using the exact producer relation (`===` or `≤`,
     as derived).
   Regressions must drive every reviewer-demonstrated contradiction class
   through the production path (`loadValidatedTestRunSummary` with matching
   bytes/SHA-256, then `reduceTestRunSummaries`) and must also pin one
   legitimate boundary emission per new rule as still accepted.
2. **Tighten reduction semantic validation (review finding 2).** In
   `assertTestRunReduction`: reconcile disposition rows summed by
   availability against the per-metric counters and require the rows to total
   `inputCount`; duration metrics with `measuredCount === 0` require
   `totalNanoseconds === "0"` and `sampleCount === 0`; CPU with
   `measuredCount === 0` requires zero user/system/total; encode the
   role-conditional owner rule matching the child definitions (`partition` ⇒
   non-null owner; legacy roles exactly as the producer emits). Regressions
   exercise `writeTestRunReduction` → reload → assert.
3. **Truthful omission evidence (review finding 3).** Reword the retained
   FAIL-manifest message (`test-partitions.ts` ~line 2012) to claim only the
   exercised boundary (production comparator inside the test-only CLI). Add
   aggregate-boundary coverage: preferred — mechanically extract the existing
   shadow finalization block (semantic compare → summary validation →
   reduction → proof → receipt decision) into one internal function with
   unchanged behavior, order, and error text, verified by the existing shadow
   suites, then integration-test it with real fixture child reports proving a
   mutated partition report yields a FAIL proof, a failure manifest, and no
   PASS receipt. Fallback if that extraction cannot stay bounded and
   behavior-preserving — an env-gated fault point in the shadow CLI, or an
   explicit recorded limitation. No production trust boundary may be
   weakened.
4. **Re-validate retained evidence and append corrective records.** Run the
   tightened validators over the eight retained Q summaries and the retained
   reduction (external evidence at `C:/w/ea`); confirmation validates the
   reviewer's recalibration, and any rejection is a stop-and-record event
   (it would invalidate the "retained evidence unaffected" claim), never a
   silent rule relaxation. Append a decision-log entry for the tightened
   acceptance (including the schema-version treatment: default is unchanged
   `1.0.0` shape with tightened runtime acceptance, recorded with rationale)
   and an autonomy-log correction stating the prior "contradictory input
   fails closed" claim was overbroad, enumerating the admitted classes.
5. **Build the measurement-lane runner.** New additive CLI (e.g.
   `src/measurement-lane-cli.ts` plus a `loop:measurement-lane` script) that
   executes a declared measured command set under the WP6 probe for one
   repetition, records the declared cold/warm classification with its exact
   workspace-state definition, validates every emitted summary, and writes
   one per-run reduction plus a lane run record binding ordinal, cold/warm,
   platform/runtime provenance, exact candidate identity, and artifact
   hashes. Missing or invalid summaries fail the run closed. No thresholds,
   no comparisons, no claims. Unit tests cover the record contract and the
   fail-closed paths.
6. **Add the benchmark CI workflow.** New file
   `.github/workflows/wp6-measurement-matrix.yml`, `workflow_dispatch` only,
   matrix ubuntu-24.04 + windows-2022, pinned Node `24.18.0` / pnpm
   `11.15.1`, serial execution: per platform at least five cold repetitions
   (each in a fresh clone with a fresh frozen install) and at least five warm
   repetitions (same workspace after its cold run), each repetition through
   the step-5 runner; all summaries, reductions, and lane records retained as
   artifacts (`if-no-files-found: error`); a final deterministic statistics
   artifact per platform reporting median, range/median-absolute-deviation,
   CPU, peak-RSS, and test counts per command across repetitions, with no
   pass/fail judgment. `exact-runtime-ci.yml` stays byte-identical.
7. **Execute and independently validate one full matrix.** Dispatch the
   workflow once on the exact candidate commit; on completion, independently
   re-validate the retained artifacts (hashes, dispositions, identity and
   cold/warm binding, statistics recomputation) and record the hosted run
   URL and artifact hashes.
8. **Closeout.** Update this plan, the autonomy log, and the decision log
   with exact evidence, limitations, and the successor handoff: intended
   WP6e alone owns manifest/tier recomposition consuming this lane's
   evidence; intended WP6f owns interpretation and go/no-go. Leave the
   tracked tree clean.

## Acceptance Criteria

- Every reviewer-demonstrated contradiction class (summary and reduction) is
  rejected through the production load/reduce/write paths, each with a
  focused regression; every pinned legitimate boundary emission remains
  accepted; the focused measurement/omission/ownership suites and full
  `test:orchestrator` / `test:unit` remain green.
- The eight retained Q summaries and the retained reduction re-validate under
  the tightened rules, or the discrepancy is recorded and the affected
  closeout claims are corrected before any lane work proceeds.
- The retained omission FAIL message claims only what is exercised, and
  aggregate-boundary FAIL ⇒ no-PASS-receipt is proven by a test — or the
  precise residual gap is recorded as an explicit limitation with rationale.
- One completed hosted matrix run exists with, per platform: ≥5 cold and ≥5
  warm validated per-run reductions correctly bound to candidate, platform,
  and cold/warm classification, plus a deterministic statistics artifact
  reporting median, range, CPU, memory, and test counts; no artifact or log
  states a benchmark, improvement, or cutover claim; all `nonSemantic` flags
  are false.
- `exact-runtime-ci.yml` is byte-identical; the active manifest, tiers, slow
  registry, `benchmark.ts`, and package/verify entry points are semantically
  unchanged (additions only); both protected hashes are unchanged.
- Hosted exact-runtime CI is green on both platforms at every commit this
  plan produces.

## Verification

- Focused per change: the new/updated Vitest suites for summary validation,
  reduction validation, omission/aggregate boundary, and the lane runner.
- Broad per commit: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm test:invariants`,
  `git diff --check`.
- Hosted: exact-runtime CI on both platforms for every pushed commit; one
  complete `wp6-measurement-matrix` dispatch on both platforms as the lane
  acceptance run.
- Independent artifact validation for step 7 runs outside the producing
  workflow (fresh process, declared hashes rechecked).

## Risks and Recovery

- **Linux liveness path fails its first hosted run** (step 0): fix forward
  with a deterministic reproducer per repository rule; do not weaken
  live-owner exclusion; benchmark work waits.
- **Over-strict validation rejects truthful producer output**: rules are
  derived from the producer before encoding, each rule carries an
  accepted-boundary regression, and any retained-evidence rejection halts for
  recording rather than silently relaxing a rule.
- **Hosted runners cannot guarantee cold OS caches**: "cold" is defined and
  recorded as fresh-workspace/fresh-frozen-install, no stronger claim is
  made, and the boundary text lives in every lane record.
- **Windows matrix wall time may exceed runner limits** (full suites × ≥10
  repetitions): permitted mitigations are sharding repetitions across matrix
  jobs or scoping the measured command set per dispatch input, with exactly
  what ran recorded; forbidden mitigations are dropping suites, reusing
  receipts, or marking partial runs complete.
- **Finalization extraction drifts behavior**: the extraction must be
  mechanical (same order, same error text) and is verified by the existing
  shadow suites; otherwise use the fallback fault point or record the
  limitation.
- **Recovery**: a failed hosted run or invalid artifact invalidates that lane
  run only — repair causally, commit, re-dispatch; retained evidence is never
  edited; an interrupted step resumes from its recorded state in this plan.

## Progress and Evidence

- 2026-08-29 — Plan created. HEAD `62f225f` pushed; review findings verified
  in code at the locations listed under Baseline Evidence.
- 2026-08-29 — Step 0 diagnosis complete. Hosted run 33267979183 red on both
  Controller lanes (invariant suite → `test-ownership`,
  `OWNERSHIP_GATE_ERROR`: pnpm banner ahead of Vitest JSON on stdout;
  retained log `invariants/entries/test-ownership/discovery-logs/
  ownership-discovery-01-1.stdout.log` contains the valid JSON after the
  banner) and both Fresh-adopter lanes (generated-adopter strict typecheck).
  Root cause B reproduced locally: `pnpm run typecheck` in a freshly
  generated adopter package fails exit 2 with
  `test-ownership.ts(9,8): error TS2307: Cannot find module
  '../ci/exact-runtime-workflow-contract.js'`. Hosted CI red since
  `18324be` (2026-08-26); last green `b01467b` (2026-08-24). Fixes 0a/0b
  not yet implemented.
- 2026-08-29 — Steps 0a/0b implemented and locally qualified under exact Node
  `24.18.0` / pnpm `11.15.1`. Ownership discovery now removes any stale
  command-owned output, directs `vitest list` to an explicit JSON file, and
  parses only that file; injected regressions pass for polluted stdout and
  valid JSON and fail closed for missing/malformed file output. The adopter
  packager explicitly ships `ci/exact-runtime-workflow-contract.ts` and
  `src/test-run-probe.cjs`; a generated package strictly typechecks against
  its generated `tsconfig.tools.json`. Focused suites passed 17/17. The real
  ownership gate passed for 82 files at `C:/w/wp6d-step0-ownership-3` and the
  five-command invariant aggregate passed at `C:/w/wp6d-step0-invariants`.
  Receipt-owning typecheck, lint, and format passed at
  `C:/w/wp6d-step0-typecheck`, `C:/w/wp6d-step0-lint`, and
  `C:/w/wp6d-step0-format`. Exact broad aggregates passed: orchestrator
  198/198 suites and 670/670 tests at `C:/w/wp6d-step0-orchestrator`
  (report SHA-256
  `fff8a1a638e6294aef6af52384bff35d04bce9ef05377ec006a029ee57ca7934`),
  unit 200/200 suites and 686/686 tests at `C:/w/wp6d-step0-unit` (report
  SHA-256
  `681baeee640da7304a5c9480fff7d765e4332315fc3d4d1d82c274f5527d0d3f`),
  and `git diff --check` passed. Step 0c remains open until the fix-forward
  commit is pushed and both hosted platforms are green.

## Next Action

Commit the locally qualified step 0a/0b fix-forward, push it, and confirm the
exact-runtime matrix is green on both platforms before starting step 1.
