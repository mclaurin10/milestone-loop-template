# Current Execution Plan

**Status:** Active — Windows timeout repair locally qualified; fix-forward push pending
**Updated:** 2026-08-30
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

0. **[complete] Restore hosted CI at the pushed head.** Both root causes
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
1. **[complete] Tighten summary semantic validation (review finding 1).** First derive
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
2. **[complete] Tighten reduction semantic validation (review finding 2).** In
   `assertTestRunReduction`: reconcile disposition rows summed by
   availability against the per-metric counters and require the rows to total
   `inputCount`; duration metrics with `measuredCount === 0` require
   `totalNanoseconds === "0"` and `sampleCount === 0`; CPU with
   `measuredCount === 0` requires zero user/system/total; encode the
   role-conditional owner rule matching the child definitions (`partition` ⇒
   non-null owner; legacy roles exactly as the producer emits). Regressions
   exercise `writeTestRunReduction` → reload → assert.
3. **[complete] Truthful omission evidence (review finding 3).** Reword the retained
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
4. **[complete] Re-validate retained evidence and append corrective records.** Run the
   tightened validators over the eight retained Q summaries and the retained
   reduction (external evidence at `C:/w/ea`); confirmation validates the
   reviewer's recalibration, and any rejection is a stop-and-record event
   (it would invalidate the "retained evidence unaffected" claim), never a
   silent rule relaxation. Append a decision-log entry for the tightened
   acceptance (including the schema-version treatment: default is unchanged
   `1.0.0` shape with tightened runtime acceptance, recorded with rationale)
   and an autonomy-log correction stating the prior "contradictory input
   fails closed" claim was overbroad, enumerating the admitted classes.
5. **[complete] Build the measurement-lane runner.** New additive CLI (e.g.
   `src/measurement-lane-cli.ts` plus a `loop:measurement-lane` script) that
   executes a declared measured command set under the WP6 probe for one
   repetition, records the declared cold/warm classification with its exact
   workspace-state definition, validates every emitted summary, and writes
   one per-run reduction plus a lane run record binding ordinal, cold/warm,
   platform/runtime provenance, exact candidate identity, and artifact
   hashes. Missing or invalid summaries fail the run closed. No thresholds,
   no comparisons, no claims. Unit tests cover the record contract and the
   fail-closed paths.
6. **[complete] Add the benchmark CI workflow.** New file
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
7. **[complete] Execute and independently validate one full matrix.** Dispatch the
   workflow once on the exact candidate commit; on completion, independently
   re-validate the retained artifacts (hashes, dispositions, identity and
   cold/warm binding, statistics recomputation) and record the hosted run
   URL and artifact hashes.
8. **[complete] Closeout.** Update this plan, the autonomy log, and the decision log
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
- 2026-08-29 — Hosted exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33275334325`
  on fix-forward commit `4b4bc77415365cb08a5e8d3170c469eb1515befa`
  failed and is retained; trusted-container passed, while the other four jobs
  exposed three causal gaps. Windows controller failed in `test-ownership`
  because `command-runner.resolvePnpmScript` recognizes `npm_execpath` and a
  global pnpm layout but not the pinned Node Corepack
  `node_modules/corepack/dist/pnpm.js` entry used by Actions. Both generated
  adopters passed strict typecheck and every other bootstrap stage but failed
  lint solely because the newly shipped `test-run-probe.cjs` lacked the
  source repository's CommonJS ESLint treatment in the scaffold config.
  Linux controller passed invariants and executed all 198 orchestrator suites,
  but the otherwise-passing report contained one skipped Windows-only
  workspace-root junction assertion; strict measurement correctly rejected
  its 669 passed / 1 pending counters. Authenticated retained artifacts were
  independently downloaded to `C:/w/wp6d-ci-33275334325`; controller
  Windows/Linux and adopter Windows/Linux ZIP SHA-256 values are respectively
  `bfe03da7f4e76b8573a629cd88d23cf2d0733a5432ca3b85cbbb0aa1a5f01a8a`,
  `6b95d5743ff62465651407ee9f4adc08d00da72c3c301e397b203bceef3f0b63`,
  `c4c5dcc520f844e0eacdc59ceef4f23dfbdfb6c267ac9823c30c4e614c795f9d`,
  and `1df75ef70a747b41170d9a2f07393b0ff33ac6d6d134ec89f81ef79b8840287a`.
  Step 0 remains in progress: add Corepack resolution, generated-probe lint
  coverage, and a platform-neutral linked-root assertion; qualify and push a
  second fix-forward commit.
- 2026-08-29 — The three run-33275334325 repairs are implemented and locally
  qualified under exact Node `24.18.0` / pnpm `11.15.1`. Safe pnpm resolution
  now recognizes the pinned Node Corepack entry, with a 10/10 command-runner
  suite and a real minimal-PATH ownership gate over all 82 files at
  `C:/w/wp6d-step0b-ownership`. Generated adopters now lint the shipped
  CommonJS probe under their own scaffold config; the 8/8 adopter-package
  suite strictly typechecked and linted generated output. The linked-root
  rejection is platform-neutral (`junction` on Windows, directory symlink on
  POSIX) and its focused workspace-create suite passed 5/5. Receipt-owning
  typecheck, lint, format, and the five-command invariants suite passed at
  `C:/w/wp6d-step0b-{typecheck,lint,format,invariants}`. Exact broad
  orchestrator passed 198/198 suites and 671/671 tests at
  `C:/w/wp6d-step0b-orchestrator` (report SHA-256
  `cc8fb8444d0c58cdfd11d6f2353d1dfcebd182940d8e777ac4847a29e4a3d2ac`);
  exact unit passed 200/200 suites and 687/687 tests at
  `C:/w/wp6d-step0b-unit` (report SHA-256
  `ae66f9ba77aac251caf88d2b36210a2326054ff8b9d57e73132403d6be923890`).
  Neither aggregate has a failed or pending suite/test; `git diff --check`
  passed. Step 0 remains open only for the clean commit/push and a fully green
  hosted rerun on both platforms.
- 2026-08-29 — Step 0 complete on fix-forward commit
  `818db3a2963591b29f8acf5ff72c74be21825df9`. Hosted exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33280254241`
  passed all five jobs: Windows/Linux controllers, Windows/Linux fresh-adopter
  smoke, and the trusted Linux container. Both controller invariant,
  orchestrator, complete-unit, typecheck, lint, and format stages passed; the
  Linux controller therefore executed the formerly Windows-only linked-root
  assertion with no pending test. All five retained artifacts bind exact
  candidate `818db3a`; GitHub-reported archive SHA-256 digests are controller
  Windows `9a1b2b2ff99c7daded7df26a9b23dadff8fcc22be1b213ff0236fbd46fc2951e`,
  controller Linux `f3fef17a984a994bb63dbd4800389fc0e2f2b69437ee13ead2cee1a967d2f36d`,
  adopter Windows `8af261de23aabc6b89f94272760f98f7c68e19f78e966be58e3862ae3aa10116`,
  adopter Linux `cf36f794d7253be42d8349071369ba5db37550acd505ac2c0e9b2492285e270b`,
  and trusted container `08529e8fa091da636ae55ae236909b45a522923ac4966c416c3a2edf7377d8a0`.
  The protected workflow remains byte-identical. Step 1 may proceed.
- 2026-08-29 — Step 1 implementation complete. Producer inspection established
  positive sample floors for measured wall/setup/startup/test-body durations,
  the legitimate measured Git zero-sample boundary only at zero nanoseconds,
  and exact equality between measured CPU/RSS coverage and probe process
  coverage. Fine-grained measurements now remain unavailable when the preload
  probe set is unavailable, so producer output satisfies the tightened
  acceptance it consumes; boundary prose records that completeness rule.
  Receipt-byte/hash-matched mutations drive every admitted contradiction
  through both `loadValidatedTestRunSummary` and `reduceTestRunSummaries`.
  Real producer boundaries cover unavailable probe output and a measured
  no-Git child with zero Git samples. The focused summary suite passed 12/12,
  exact receipt-owning typecheck passed at `C:/w/wp6d-step1-typecheck`, focused
  ESLint and Prettier passed, and `git diff --check` passed. Broad qualification
  is intentionally deferred to the cohesive measurement-contract repair
  commit after steps 2–4.
- 2026-08-29 — Step 2 implementation complete. Reduction disposition rows now
  reconcile by availability with their declared counters and with
  `inputCount`; zero-measured durations require zero time/samples, and
  zero-measured CPU requires zero user/system/total time. Reduction inputs now
  preserve the producer's role/owner rule for `legacy`, `legacy-extra`, and
  `partition`. Regressions reject duration/CPU/RSS row contradictions,
  nonzero zero-measured aggregates, and every role/owner direction through
  both `writeTestRunReduction` and a disk reload into
  `assertTestRunReduction`. Genuine all-unavailable and mixed measured/
  unavailable reducer output writes, reloads, validates, and remains schema
  valid. The combined summary/reduction suite passed 16/16, exact
  receipt-owning typecheck passed at `C:/w/wp6d-step2-typecheck`, focused
  ESLint passed, and `git diff --check` passed. Broad qualification remains
  deferred to the cohesive steps 1–4 repair commit.
- 2026-08-29 — Step 3 implementation complete. The production shadow's
  comparison → candidate check → summary load/validation → reduction → proof
  → receipt decision is now one shared finalizer; the production caller keeps
  the original order, proof fields, error text, receipt checks, and artifact
  declarations. The test-only CLI executes a real two-test Vitest report,
  removes one executed partition assertion, creates and receipt-validates two
  genuine summaries, and passes both reports through that shared finalizer.
  The finalizer writes a FAIL proof and valid two-input non-semantic reduction,
  then throws before its PASS-receipt callback. The manual failure message now
  claims only the exercised production comparator boundary. The focused
  partition suite passed 20/20; exact receipt-owning typecheck, focused ESLint,
  and `git diff --check` passed. Retained evidence at
  `C:/w/wp6d-step3-omission` has no `result.json`, a product FAIL manifest, and
  exactly one named missing identity; proof/reduction/manifest SHA-256 values
  are `454e4af1d2caa670687856734d4b7a78afe566bf8ad7173cec2c57a49547e24a`,
  `bd12e54f3ca43b5b7e386eb50b9d87d9e4dd3b67f81e8c69b7fc4ad192232c1d`,
  and `07e32dd2a84bc75a00502dcd4e06fce382fd012ef016810e86948cc7894a1bfa`.
  The clean-candidate production shadow remains part of the cohesive broad
  qualification after step 4.
- 2026-08-29 — Step 4 complete. The tightened runtime loader accepted all
  eight receipt-bound candidate-Q summaries at `C:/w/ea/shadow`; every probe
  is measured, measured sample floors hold, the three zero-Git observations
  also have zero nanoseconds, and every CPU/RSS process count equals the probe
  count. `assertTestRunReduction` accepted the retained reduction and a fresh
  `reduceTestRunSummaries` invocation reproduced it exactly with eight inputs.
  The reduction file SHA-256 remains
  `5b2fbfa886fbd386d1a1d44360b9c848a0ee0f3fd0411dba4e135510c701eca5`
  and its content SHA-256 remains
  `c16a8f80bca8646afb1dbfcf4d2c520ed4ed766920196d808527b7ec8fa89234`.
  No retained artifact was edited. New top-of-file autonomy and decision
  entries correct the prior overbroad contradiction/omission claims,
  enumerate every formerly admitted class, and record the unchanged `1.0.0`
  shape with stricter producer-coherent runtime acceptance. Step 5 may begin;
  broad clean-candidate qualification of the cohesive repair remains required
  before its commit is claimed or pushed.
- 2026-08-29 — The cohesive steps 1–4 repair passed broad exact-runtime
  qualification under Node `24.18.0` / pnpm `11.15.1`: receipt-owning
  typecheck, lint, format, and the five-command invariant suite passed at
  `C:/w/wp6d-repair-{typecheck,lint,format,invariants}`. Orchestrator passed
  198/198 suites and 679/679 tests at `C:/w/wp6d-repair-orchestrator`
  (report SHA-256
  `89cb34edeb4c3b0b36a7259601f05a87ae786257f956fa73aee845e60f37ee67`);
  complete unit passed 200/200 suites and 695/695 tests at
  `C:/w/wp6d-repair-unit` (report SHA-256
  `8a3b6fc837bf0deddd243a7aad47a5db182feabcfeedbccfa4d3bbe419c8c298`).
  Neither aggregate has a failed or pending suite/test; `git diff --check`
  passed. The immutable lock, protected workflow, and protected untracked
  roadmap hashes remain unchanged. The repair is ready for its cohesive
  commit, clean-candidate shadow, push, and hosted exact-runtime gate.
- 2026-08-30 — The cohesive steps 1–4 repair is sealed at commit
  `09eae95b719aeaa13f1a5ef626a4067088313d1c`, tree
  `507a25788e0aeaa4521f34dc835ae814112f03d7`, and pushed to
  `origin/master`. The first clean shadow attempt retained at
  `C:/w/wp6d-repair-shadow-09eae95` failed honestly because the overlong
  Windows evidence root exhausted Git path length in six crash-recovery
  assertions; it is not passing evidence. The same commit in short clean
  checkout `C:/w/r6` passed the complete production shadow at `C:/w/e6`:
  696 unique tests across 82 disjoint files, eight validated summaries, and
  a valid reduction. Receipt/proof/reduction SHA-256 values are
  `9f8d1ee6e6ec5360ba23df77ed0812401676f392af87a9cb23dd58b7fc7379c8`,
  `e57a05f205f030a52835ff33ad56ff867a7aba2a7fb826a08d2c216ed2742611`,
  and `cd487b22903e5f37a8290fe5e8572b848d3771462cef0cb31bde84d069eb66d7`;
  reduction content SHA-256 is
  `9821432511f1936224a6e68d315951eb1c924652c892daacf0a9ac11af6a57cd`.
  Hosted exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33296797971`
  passed all five jobs. GitHub artifact archive SHA-256 digests are controller
  Windows `dbe257496cddffd2f9e6be25dbd0468cd25a4aba266ec82a302858257080380a`,
  controller Linux
  `5e570b8a6ab3c492cd7a996cc24d365f8662cd294b9fa362e3a396c572127ce5`,
  adopter Windows
  `5ad77255448e60e529bfc38ef6ddf3aab83677c0b8e6ca9e769a5815b1cd8b84`,
  adopter Linux
  `09497b1a30d683d6ac90c4d065279888739d8684fac1046e5e63a376b240303a`,
  and trusted container
  `63c6ed4e18f3a75000a924ea1423fa10798b22fae2b7afaff0a0cc448fab81bd`.
  Step 5 may proceed.
- 2026-08-30 — Step 5 implementation and dirty-tree local qualification are
  complete. The additive runner/CLI define a seven-command canonical
  catalogue, exact cold/warm workspace semantics with no OS-cache claim,
  clean candidate/runtime rereads, strict receipt-bound summary loading, a
  deterministic per-run reduction, complete file/content hashes, and
  independently validated cold/warm pairing. The new schema-valid contract
  permanently denies test-success, cutover, and benchmark authority. Focused
  lane plus ownership regressions passed at `C:/w/wp6d-step5-focused-5`;
  typecheck, lint, format, and five-command invariants passed at
  `C:/w/wp6d-step5-{typecheck-3,lint-2,format-1,invariants-1}`. The first full
  controller run retained a real one-assertion failure because the canonical
  ownership total still said 78 after adding the 79th controller test. After
  updating that exact count and total, controller passed 201/201 suites and
  685/685 tests (report SHA-256
  `3399655d01ddd53771b67f9327b94413590ecc3c5f47645d82bf9d8d5e95e152`)
  and complete unit passed 203/203 suites and 701/701 tests (report SHA-256
  `bc03508b570a00f984264dd5662907686b921e5852232d0f4cc5546eaa8cbe4e`).
  There are no failed or pending suites/tests. Clean commit identity, a real
  cold/warm invocation, push, and hosted exact-runtime CI remain required
  before step 5 is complete.
- 2026-08-30 — Step 5 is complete at commit
  `9f1767cba800b551faa648e8a317715fe282f6a4`, tree
  `4a2c6c13a9068c51e7580a50a32ca04b3aa4ac6d`, pushed to
  `origin/master`. Short clean checkout `C:/w/m5` with evidence under
  `C:/w/m5e` executed one real `legacy-fast` cold/warm pair through the
  production CLI. Cold/warm lane record SHA-256 values are
  `fbab51288feb41dbc88c4daafc3a4fe717404a33972979b46657176a7d1da8fa`
  and `cf1ee5c888231184020aba59ca8c1f99d30fa5880f2a20ea5dec6ecacb055a47`;
  reduction SHA-256 values are
  `f58ac93348baab18ffe4b1ecd27eea096379d05ffc5a36e554f8c35835f612ee`
  and `6f22754f941e9de56e039f35ca8c29fddaa8f4ac7bc181674a20da3a27b4ec5f`.
  Both records bind the exact clean candidate, one input, local-validation
  provenance, and false non-semantic authority flags; the warm copy is
  byte-identical to the cold record and binds cold content SHA-256
  `01c1068ec738240aba9ed8e733c516af1cbc1a16a45ecef00ff0bb7bea7c3704`.
  Hosted exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33309783742`
  passed all five jobs (Windows controller 1h6m21s, Linux controller 8m30s,
  both adopter smokes, trusted container). GitHub archive SHA-256 digests are
  controller Windows
  `71b53a0c83194d2ee46ec9ced1e598cfb2280785b0ffeb4d97b9c42639932299`,
  controller Linux
  `2e8df062e12f8489be7323da101a40362c7f5a161d774e8533c390d02b725836`,
  adopter Windows
  `9c5bb9be13477440f6efd734f34363ba845128d89519dcfad5ea0d276a6f554c`,
  adopter Linux
  `40eb7191468ff864074fb45538633bd2b78e45b704a925d894e18bf3985901a5`,
  and trusted container
  `d112f2e012d2f73c852cc63648300c31ae1f23f2fbe5543e0c2e3fd647c14f73`.
  The protected workflow remains byte-identical. Step 6 may proceed.
- 2026-08-30 — Step 6 implementation and dirty-tree local qualification are
  complete. The new `milestone-loop-wp6-measurement-statistics.v1` producer
  requires exactly five independently validated cold/warm pairs per platform,
  reproduces their lane/receipt/summary/reduction and pairing contracts, and
  emits exact median/range/MAD statistics for durations, total CPU, peak RSS,
  and test counts without comparisons or judgment. The additive
  `workflow_dispatch` workflow shards ten isolated pair jobs, retains every
  pair, then downloads and recomputes one statistics artifact per platform;
  Node, pnpm, runner images, and all four GitHub actions are pinned. Focused
  statistics/ownership tests passed 15/15 at
  `C:/w/wp6d-step6-focused-2`. Receipt-owning typecheck, lint, format, and
  five-command invariants passed at
  `C:/w/wp6d-step6-{typecheck-final,lint-final,format-final,invariants-1}`.
  Controller
  passed 203/203 suites and 691/691 tests at
  `C:/w/wp6d-step6-orchestrator-1` (report SHA-256
  `60b518e6509f87cb4baefbd502d3f60fbaa22d3367fb5734c3f6344d775dd5e4`);
  complete unit passed 205/205 suites and 707/707 tests at
  `C:/w/wp6d-step6-unit-1` (report SHA-256
  `bc9c3ce493e99932836e02ea2f51eb8b01f263ee3a4bfce5ec963f84230047ac`).
  Neither aggregate has a failed or pending suite/test. The protected
  exact-runtime workflow and protected untracked roadmap remain byte-identical.
  A clean candidate commit, push, exact-runtime hosted gate, full hosted
  measurement dispatch, and independent artifact download validation remain.
- 2026-08-30 — Step 6 candidate commit
  `487b802619969508190294128ca315691944f1e5` (tree
  `4d7b295d5aae41637914809a7d9dcb2dae89791b`) was pushed, but exact-runtime
  run `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33318278132`
  exposed a real Linux-only regression before any measurement dispatch.
  Linux invariants passed, then the controller aggregate failed one suite
  during `measurement-statistics.test.ts` setup because its portable fixture
  hard-coded `platformId: windows` while genuine Linux compact summaries
  correctly declared `os: linux`. No assertion was relabelled or skipped; the
  failed job issued no PASS receipt. Both adopter jobs and trusted-container
  passed. The still-running Windows controller was cancelled after the exact
  failure artifact had been retained at
  `C:/w/wp6d-ci-fail-33318278132`. The bounded repair derives fixture path,
  IDs, and expected statistics platform from `process.platform`; the focused
  test passes locally at `C:/w/wp6d-step6-linux-regression-local`. Exact-state
  typecheck, lint, format, and five-command invariants pass under
  `C:/w/wp6d-step6-fix-*`. Controller passes 203/203 suites and 691/691 tests
  at `C:/w/wp6d-step6-fix-orchestrator` (report SHA-256
  `3e7efb11c5e8774676e7492d60b78633e66a47d96680fbb500edd29619929bce`);
  complete unit passes 205/205 suites and 707/707 tests at
  `C:/w/wp6d-step6-fix-unit` (report SHA-256
  `e86759c3fff1a57aeea1ca46dfafcb35a6798f57a5feb201f5ea36be5af8d280`).
  Neither aggregate has a failed or pending suite/test. A fix-forward
  commit/push and fully green replacement exact-runtime run are required
  before step 7.
- 2026-08-30 — The portable-fixture repair is commit
  `71244f33bb1f7d257296a5a522f7c8f662646175`, tree
  `c6e671122382aa41de74e9d6efb17583e06247bd`, pushed to `origin/master`.
  Replacement exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33323492507`
  passed all five jobs. GitHub archive SHA-256 digests are controller Windows
  `dc0a720534a22e68a902141daf279d4d1abcfbc739d8d33df9e910ed4ca039f3`,
  controller Linux
  `5119295e4af2f1d8b7225633190acd9db29cd79988c30e2ac2547cea36b5ec38`,
  adopter Windows
  `7101f516ced668518a4d09ffc79aba66908f11cd522047852f849cde49860eb1`,
  adopter Linux
  `4b2da93c75b03adf387c39999f7de74a8b1e70b100e74c51d5ca583254229704`,
  and trusted container
  `37455089fedd03f788a6fcf73a39846324a53abfd10eedf8502dd345e481eb45`.
  Step 7 dispatch
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33326405457`
  targeted that exact candidate. Linux pair 1 completed all seven cold
  commands and wrote a PASS lane in 8m59s, but its immediately following warm
  runner failed before any child command because the paired dependency-state
  equality rejected the post-cold workspace. The retained failure manifest
  and complete cold evidence are at
  `C:/w/wp6d-matrix-fail-33326405457-linux-1`; no warm lane/PASS receipt or
  statistics exists, and the remaining matrix was cancelled.

  The cold record and warm manifest prove equal ordinal, workspace ID,
  canonical seven-command selection, candidate commit/tree/cleanliness, and
  hosted source context; the repository path is unchanged, and a differing
  tracked root lockfile would have violated the clean-candidate reread. The
  remaining equality operand is the byte hash of
  `node_modules/.modules.yaml`. That pnpm metadata file contains operational
  fields such as `prunedAt`, store/virtual-store paths, and ignored-build
  bookkeeping and can be rewritten by ordinary pnpm command execution without
  changing the installed dependency graph. Treating its full bytes as the
  cold/warm tree identity is therefore a contract defect. The bounded repair
  advances the additive lane schema, retains the raw modules-manifest identity
  for audit, adds the stable installed virtual-store lock
  `node_modules/.pnpm/lock.yaml`, and uses root-lock plus virtual-store-lock
  equality for dependency-tree binding. Regression coverage must show a
  volatile modules-manifest rewrite is accepted while virtual-store-lock
  mutation still fails closed. No partial matrix result is performance
  evidence.

- 2026-08-30 — The schema `1.1.0` repair is locally qualified on the exact
  working tree. Focused measurement-lane/statistics coverage passed 5/5 suites
  and 12/12 tests at
  `C:/w/wp6d-step7-fix-focused-1/vitest-report.json` (SHA-256
  `f584ecda09a4690159ff66af719ac0927f8b96caa77c0b11ad6682dea7e55e3c`).
  Exact-runtime typecheck, lint, format, and five-command invariant evidence
  passed at `C:/w/wp6d-step7-fix-typecheck-1`,
  `C:/w/wp6d-step7-fix-lint-1`, `C:/w/wp6d-step7-fix-format-1`, and
  `C:/w/wp6d-step7-fix-invariants-1`. The full orchestrator aggregate passed
  203/203 suites and 691/691 tests at
  `C:/w/wp6d-step7-fix-orchestrator-1/orchestrator-report.json` (SHA-256
  `f0de8d35e0161ecec7a49f1cc69655c9d4ed21fb4cc8212020009c6f368b7aa0`),
  and the full unit aggregate passed 205/205 suites and 707/707 tests at
  `C:/w/wp6d-step7-fix-unit-1/test-report.json` (SHA-256
  `3da66fcb07c68bc8d0363b3364abd6752a5af6a42cec8feb2ce8bf02ab113ca5`).
- 2026-08-30 — The dependency-identity repair is commit
  `5a5a4a67e7a07493e5f2be8c553ac97874403827`, tree
  `70911a5bc213d426027a62690c8bf0ae3a3dc932`, pushed to `origin/master`.
  Protected exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33333189792`
  passed all five jobs on that exact candidate. GitHub archive SHA-256 digests
  are controller Windows
  `3b94c0ccc94ce2ba0a52c480acb410712456d371f97facb1cfaafac6bf0d6ccd`,
  controller Linux
  `343686c7d71ecadbbdcebbd74ea615127589cb420de77eafa503835b4c276162`,
  adopter Windows
  `937d98783225d9aea328d0dc904c2b9548b9c37efd3503e90107a8cecb720c01`,
  adopter Linux
  `2c6454ead1591613aa93a227a94679f9f5eede6eec64e6a76875bfcd2215fae1`,
  and trusted container
  `242e5fd0028f9ede7a716674c6b84a130cb66c6f7bfe8fa2036231189820b705`.

  Fresh step-7 run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33336023838`
  then proved the original dependency-state repair across all five Linux
  cold/warm pairs, each of which completed successfully. All five Windows
  cold lanes independently failed the first `legacy-fast` command at the same
  integration test,
  `controller mutation lease distinguishes an external live owner from a
different incarnation reusing its pid`; each report passed 674/675 tests
  and recorded that failure after 5.70-5.87 seconds. The retained reports are
  under `C:/w/wp6d-matrix-fail-33336023838-windows-1`,
  `C:/w/wp6d-matrix-fail-33336023838-windows-2`, and
  `C:/w/wp6d-matrix-fail-33336023838-windows-more`. The protected Windows
  controller had passed the same test twice in 1.56-1.57 seconds, retained at
  `C:/w/wp6d-ci-33333189792-controller-windows`.

  The failed test exercises a real external Windows process and may invoke
  the production process-incarnation probe twice. Each probe is itself
  deliberately bounded at 5 seconds, while the test inherited Vitest's
  5-second default; its failure stack points to the test declaration and all
  five durations end just beyond that default. The harness budget therefore
  cannot contain the production bound it verifies. The bounded repair gives
  only this integration test a 30-second budget, preserving both live-owner
  and reused-PID assertions and the production 5-second fail-closed probe.
  Focused repeated Windows coverage plus both broad aggregates are required
  before another fix-forward commit, exact-runtime run, and fresh matrix.
  The failed run produced no Windows PASS lane or statistics and is not
  performance evidence.

- 2026-08-30 — The single-test timeout repair is locally qualified on its
  formatted working-tree bytes. The selected external-process test passed ten
  consecutive exact-runtime repetitions at
  `C:/w/wp6d-step7-timeout-focused-2`; each retained report has one selected
  PASS and 17 unselected tests. The exact fast-unit partition passed 202/202
  suites and 675/675 tests at
  `C:/w/wp6d-step7-timeout-fast-1/fast-unit-vitest-report.json` (SHA-256
  `5e6aac25e27c0bbfe876112246e990408799509654e4a9959f28e6df7d2b5c04`).
  Typecheck, lint, format, and all five invariant commands passed at
  `C:/w/wp6d-step7-timeout-typecheck-2`,
  `C:/w/wp6d-step7-timeout-lint-2`,
  `C:/w/wp6d-step7-timeout-format-2`, and
  `C:/w/wp6d-step7-timeout-invariants-2`. The full orchestrator aggregate
  passed 203/203 suites and 691/691 tests at
  `C:/w/wp6d-step7-timeout-orchestrator-2/orchestrator-report.json`
  (SHA-256
  `da744692c39c6b55dd6c284439cb9a791bade238851fd5a14e98b2528e6f0a88`),
  and the full unit aggregate passed 205/205 suites and 707/707 tests at
  `C:/w/wp6d-step7-timeout-unit-2/test-report.json` (SHA-256
  `dee1c61701721c4d7701ba8360f8b7dd4acceb352a13c9d8b2e86b2e547c758d`).
- 2026-08-30 — The timeout repair is commit
  `f5de977f973ed68cec250cdadea890ec9817ec35`, tree
  `f03e542b7fb702c19e5205a4bd119e1c55f0618e`, pushed to `origin/master`.
  Protected exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33350041568`
  passed all five jobs. GitHub archive SHA-256 digests are controller Windows
  `3822ead4ba6898260745cc16146e00bb81068e48e7c423a05ed898f9a6184389`,
  controller Linux
  `eaaa0e2283ffe0603d64c0a836730f4dcfca50eb09b5c5bf24772db76f62fb81`,
  adopter Windows
  `30b4d7f501682a724414d9381d5b4d45a4e8a182055d7efb6d159c4c184d8308`,
  adopter Linux
  `ab3984e30f151c61bf92d95e04f16afecb8932ed8f05111a5516f4dc7cee7444`,
  and trusted container
  `453574061797471e0c6e26733f8732b8d09b65fc6b179d5d17344b63e4b2666c`.

  Fresh step-7 run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33353378514`
  again passed all five Linux cold/warm pairs, but all five Windows cold lanes
  independently failed the same `legacy-fast` test with 674/675 passing.
  With the test budget no longer masking the underlying result, every failure
  is the reused-PID acquisition's fail-closed `Another controller holds` error
  after 10.85-11.06 seconds. That duration is two exhausted 5-second Windows
  process-incarnation observations plus bounded cleanup, not Vitest's default
  timeout. Retained artifacts are under
  `C:/w/wp6d-matrix-fail-33353378514-windows-5`,
  `C:/w/wp6d-matrix-fail-33353378514-windows-more`, and
  `C:/w/wp6d-matrix-fail-33353378514-windows-3`.

  Production intentionally treats an unavailable OS observation as live and
  refuses to steal the lease. The test currently conflates that safe
  fail-closed outcome with the deterministic comparison branch it means to
  verify, so it demands an environment-sensitive PowerShell observation even
  though unavailability is an explicit production result. The bounded repair
  will leave production unchanged, retain a real external live process and the
  fail-closed assertion, and deterministically substitute only the observation
  needed to prove that a known different process start time permits exact-old
  recovery. Regression coverage must verify the real probe is still attempted,
  unavailable observations remain blocking, and reused-PID recovery changes
  only when an alive observation proves a start-time mismatch.

- 2026-08-31 — The deterministic incarnation boundary passed ten consecutive
  probe-instrumented focused repetitions and the complete 18-test lease file at
  `C:/w/wp6d-step7-incarnation-{probed-repeat-1,lease-suite-1}`. Exact-runtime
  typecheck, lint, format, the five-command invariant suite, and the measured
  fast partition passed; fast retained 202/202 suites and 675/675 tests at
  `C:/w/wp6d-step7-incarnation-fast-1`. The orchestrator aggregate passed
  203/203 suites and 691/691 tests at
  `C:/w/wp6d-step7-incarnation-orchestrator-1`.

  The first complete-unit attempt at
  `C:/w/wp6d-step7-incarnation-unit-1` then retained a genuine non-passing
  report: 706/707 tests passed and the candidate-prepare hard-loss matrix was
  associated with `STACK_TRACE_ERROR` created at its line-51 `afterEach` hook.
  The 460.83-second test body remained inside its explicit 30-minute budget;
  the failure is the file's default 10-second hook budget expiring while it
  serially removes the many repositories produced by that matrix. No `cpb-*`
  directory remained after the run, proving cleanup continued to completion
  after Vitest had already failed the hook. The same semantic matrix passed in
  the immediately preceding orchestrator aggregate and two prior broad runs at
  402.88-453.91 seconds. The bounded repair will give only this real recursive
  cleanup hook an explicit 120-second budget, without changing any assertion,
  fixture matrix, production path, or cleanup operation. A focused hard-loss
  rerun and a fresh complete-unit aggregate must pass before the candidate can
  advance.

- 2026-08-31 — Final local qualification is green on the formatted working
  tree. The cleanup-focused hard-loss matrix passed its one selected test with
  eight unselected tests at `C:/w/wp6d-step7-cleanup-focused-1` (report
  SHA-256
  `67ee8156b671dbb91ae256c17f77553f40c405bca899f1f1cfd451e709d876e0`)
  and left zero `cpb-*` directories. Exact-runtime typecheck, lint, and format
  passed at `C:/w/wp6d-step7-cleanup-{typecheck,lint,format}-1`. The complete
  unit rerun passed 205/205 suites and 707/707 tests, with zero failed or
  pending results, at
  `C:/w/wp6d-step7-incarnation-unit-2/test-report.json` (SHA-256
  `410847cee40937d01559f99c5cd5e99c0ab318f50c9358b50ecf0b062fb6bea7`).
  The already-final fast and orchestrator reports contain 202/202 suites plus
  675/675 tests and 203/203 suites plus 691/691 tests, with SHA-256 values
  `40d7c052d83a6c487ee3e7685a04ad011661f4bc9b1019a829ab4bacf7943ce4`
  and
  `4ee58e77928f4c00f20faef859e752bd3b375ff75887a08f3f8156160f427e47`.
  The immutable lock, protected exact-runtime workflow, and protected untracked
  roadmap remain byte-identical at SHA-256
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`,
  `9dc35e44aacd35e3058895cccc89c43de9ff535ad20a0552c9b8a80b23cb19bf`,
  and
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
  After the plan, autonomy, and decision records were updated, all five final
  invariant commands passed at
  `C:/w/wp6d-step7-incarnation-invariants-3`.

- 2026-08-31 — The locally qualified repairs are commit
  `31fb2274f82153d378db9f9bca6d7c394eb266db`, tree
  `2c69984b51d6c9e69691e672d09c7f549e49d3da`, pushed to `origin/master`.
  Protected exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33370485616`
  passed the Linux controller, both fresh-adopter smokes, and trusted-container
  jobs, but the Windows controller aggregate failed and therefore blocks the
  measurement matrix. Its retained report passed 690/691 tests and failed the
  candidate-prepare hard-loss matrix when recovery correctly refused a lease
  whose completed crash-worker PID had already become live again within the
  production ten-second incarnation tolerance. The report is retained at
  `C:/w/wp6d-ci-fail-33370485616-controller-windows/orchestrator/orchestrator-report.json`
  (SHA-256
  `2bc06e9210c1568ba26ad311d105549cc3605a55529ddb1a3b7cefcd06553931`);
  GitHub's controller archive digest is
  `365906e11da0dcce1ded5e4d5625b5b75c5f67a7aa0f10de834f5c3d757d3607`.
  A direct exact-runtime rerun of the selected hard-loss test passed its 16-row
  matrix (13 automatic convergences, 3 preserved ambiguous blocks) and left no
  temporary repositories at `C:/w/wp6d-step7-hosted-lease-race-repro-1`;
  report SHA-256 is
  `9c501aedad02fcf3a1d3b2680e1384b5f133fd23671644c06217619f394ecbd`.
  This confirms a host-timing race rather than a candidate transaction defect.
  The bounded repair is test-only: after each real crash worker's marker and
  exit 86 are verified, the candidate transaction matrix may treat that exact
  completed worker incarnation as dead. Production liveness stays fail-closed,
  while the dedicated lease suite continues to own real live-process,
  unavailable-observation, matching-incarnation, and reused-PID coverage.

- 2026-08-31 — The candidate transaction matrix now substitutes a dead
  process observation only when the queried PID belongs to the exact set of
  crash workers whose point-specific marker and exit status 86 were already
  verified. Every other bounded spawn delegates to the production helper, and
  a focused regression proves both exact command parsing and rejection of an
  unverified PID or unrelated command. Production controller code, liveness
  tolerance, and fail-closed behavior are unchanged.

  The focused hard-loss matrix passed its 16 rows (13 automatic convergences,
  3 preserved ambiguous blocks) and left no `cpb-*` directories at
  `C:/w/wp6d-step7-crash-observation-focused-1`; report and matrix SHA-256 are
  `7572c6106e403b3b5b24d72934ef771692d40235cc588beda4b84966d456443d`
  and
  `cf4c8e88a16317a9d2d042690e3fa98ba62b6ac40241a9bd0f48d0569ed177e4`.
  The complete candidate file passed 10/10 tests at
  `C:/w/wp6d-step7-crash-observation-candidate-suite-1` (report SHA-256
  `157f0ac570365646fd1bbe6934df42217feba4c896a9b0667f7236f5f7594efa`),
  and the real-process controller lease file passed 18/18 at
  `C:/w/wp6d-step7-crash-observation-lease-suite-1` (SHA-256
  `92e51ed11d0060409de99f9af02c6a306b3fcf2fa0f4b217e677399658323214`).
  Exact-runtime typecheck, lint, and the post-Prettier format check passed at
  `C:/w/wp6d-step7-crash-observation-{typecheck-2,lint-1,format-2}`. The first
  format check is retained as non-passing because the test edit had not yet
  been formatted.

  The fast and orchestrator aggregates passed 202/202 suites plus 676/676
  tests and 203/203 suites plus 692/692 tests at
  `C:/w/wp6d-step7-crash-observation-{fast-1,orchestrator-1}`; report SHA-256
  values are
  `56cd71d480d0cf62a7dad98abf1523d45f022b8436fa179c99b4464c1912921f`
  and
  `4cc642ec18cb105245336c8d1768f9d5d0a4ed5f79b57c7a7c85615198fca36f`.
  A first complete-unit attempt is retained as non-passing at
  `C:/w/wp6d-step7-crash-observation-unit-1`: 699/708 tests passed and nine
  unrelated tests expired at their existing 60-second budgets during a
  host-wide slowdown. All 30 tests in the three affected files then passed
  unchanged at `C:/w/wp6d-step7-crash-observation-timeout-repro-1`, and a
  fresh complete-unit rerun passed 205/205 suites and 708/708 tests at
  `C:/w/wp6d-step7-crash-observation-unit-2/test-report.json` (SHA-256
  `50b16de1a2ad690e1a6f8deefa2f2e245a8b6cb196e82507197493e5d87c2525`).
  After the execution records were updated, all five invariant commands passed
  at `C:/w/wp6d-step7-crash-observation-invariants-1` (report SHA-256
  `03cc58c17d9c3c19c4540ec82fc9ead004dd51dce3a851502dafcd111e1937a0`).

- 2026-08-31 — The bounded observation repair is commit
  `93e03e2ff28d295f38590b7723d5d6b1460eae07`, tree
  `e421903de5505dee20fd59dde487a031511c209b`, pushed to `origin/master`.
  Protected exact-runtime run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33397675209`
  passed all five jobs. Independently downloaded evidence at
  `C:/w/wp6d-ci-33397675209` contains 42 PASS manifests and 62 declared
  artifacts with matching hashes and sizes, no reparse point, exact clean
  candidate identity, 203/203 orchestrator suites plus 692/692 tests and
  205/205 unit suites plus 708/708 tests on both controllers, two PASS adopter
  smokes, and the expected PASS trusted-container matrix. GitHub artifact
  SHA-256 digests are controller Windows
  `ee172554ab4b49ea3c06d00f7598cbd25b66ba03e31efd33555ecc648620090b`,
  controller Linux
  `fb9b018091e66ac63bce8954f28d2d5164737f94e3793d9bbd968638376ccbfe`,
  adopter Windows
  `6ecfdfc73047c7897755e5fdfc2069f031da97ce06b49596b149c6c09f30e75d`,
  adopter Linux
  `29f2a174f157fbdf13ed594913350e9a26b1aa1d6fe6881d88949173fe74be91`,
  and trusted container
  `bd1747fcd35287752d9a6cf79ba7fc4f432ecf635b5942f8d287fdd3980c8b03`.

- 2026-08-31 — Fresh manual-dispatch measurement run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/33402460152`
  passed all ten isolated pair jobs and both statistics jobs on the exact
  candidate: five cold and five immediately paired warm records for each of
  Linux and Windows. The ten pair artifact SHA-256 digests, in Linux ordinal
  1-5 order, are
  `c4bfa40e4f3709d77929bc6d4f51e337a071093412c62dc3b8ee6eeecc63a33d`,
  `cab7477e16a3b49916582b369e8354fc55a31eda27ab3a296f9c0322dc06ab35`,
  `762c0132a59686af9a1aed57d9fc692533fab0b4f14bc8e8ad489f1e4c4505f7`,
  `95a965bde4244cb176dc54ff9eedad9c97181f5a2a82f327f1848845ad35f9e1`,
  `d538392d5b8571d04eeed8a6d8072b10e05948af7bddb4061ce38dc6a0eb20c2`,
  and, in Windows ordinal 1-5 order,
  `01bb40e1ffefe2fed3eba29e165b9e12aecba2d64a2c6bc9a560378ea2954b25`,
  `7b451aeeff2256f0cc08881cfd1847414273ca5c48901c0c656858b663816536`,
  `bb2ae0e2706e4cff8fd3b5238a166f2670aab1860bc85bb3c617ec55d532e824`,
  `896469abda556da9ab577a774fe9e9f6f72247fbbfc7d8710512e52a4e7294a2`,
  and
  `245e80c02c670b529c38dcbe62b32bc71a4761378a646e48c591152aab104758`.
  Linux and Windows statistics archive digests are
  `1bd87841d16ac5f2e08502dd9c37dc490d4677f4517e786c8c4e3deaf0359617`
  and
  `494f3c81af3668a356fec665720e4afbb72338c14f3a90b02a406d5fdf3ec54e`.

  All 12 archives were independently downloaded to
  `C:/w/wp6d-matrix-33402460152`. Hash/size verification passed for 162 PASS
  manifests and 732 declared artifacts; all 20 lane records bind the exact
  clean candidate, run/attempt/job, seven-command selection, platform,
  ordinal, classification, reduction, and cold/warm pair while keeping every
  non-semantic authority flag false. Their sorted path/file-hash inventory has
  SHA-256
  `24240c2c6c17435a66c78e8091c78d1f54ab86946a3f3f1d5250075fa923c646`.
  From a no-local/no-hardlink clean checkout at
  `C:/w/wp6d-validate-33402460152`, the production statistics validator
  independently reproduced the retained Linux and Windows records from the
  exact merged download topology at
  `C:/w/wp6d-independent-33402460152/{linux,windows}-validation-2`.
  Statistics file SHA-256 values are
  `216d45e5774a6bdf7293e4403978bfa40af80edd282c14d4d4369248014beb2c`
  and
  `ce7ea64ccca9f5416065375d4b0dd6e1f37afc2842c937ffe1f5843a19dfa0ef`;
  their content hashes are
  `6053830f29fbe4e8a4d7200ab779c90a5ac2c8efdedb85ca984ee7557fe4d126`
  and
  `b612febd0ff85b3930e7c12db55c7fa86d669ce759352a1075ef0d1b45dc722d`.

  The first independent invocations are retained as non-passing at the same
  root under `{linux,windows}-validation`: preserving GitHub archive-name
  wrapper directories changed the recorded relative input paths, whereas the
  producing workflow used `merge-multiple: true`. Their ERROR manifest hashes
  are
  `bec247bc4edd6f5e788361d6364706a7b248fff078acbf8f8aec3c7e5fd53e8d`
  and
  `4bcebec7c3035c25418c0c6f89b24f4321663bee4a73df5060ffbad4aef151a8`.
  Recreating the workflow's exact `platform/ordinal/...` topology resolved the
  procedural mismatch without changing any downloaded byte or repository
  source. These records are descriptive evidence only: they set no threshold,
  compare no performance, authorize no cutover, and support no readiness
  claim.

  On the record-only closeout working tree, exact-runtime typecheck, lint, and
  format passed at `C:/w/wp6d-closeout-{typecheck,lint,format}-1`. The complete
  orchestrator aggregate passed 203/203 suites and 692/692 tests at
  `C:/w/wp6d-closeout-orchestrator-1` (report SHA-256
  `fe784c3cfe02906324ba5d2f575cb07076b10cefa851bb2a306385a8283b7d5d`),
  and the complete unit aggregate passed 205/205 suites and 708/708 tests at
  `C:/w/wp6d-closeout-unit-1` (report SHA-256
  `ee9c545461ef6ea98841a15b1780b1cff5a4e04f885c38b36089ef0d930ff469`).
  After the closeout records were written, all five invariant commands passed
  at `C:/w/wp6d-closeout-invariants-1` (report SHA-256
  `6ca10df459cf5429b3514a951998a7edca2c4378c61abfd71fb6dc496524b4cd`).

## Next Action

Commit and push this record-only closeout and require its protected
exact-runtime workflow to pass. If green, WP6d is closed without another
repository mutation. Intended WP6e alone may consume these records for
manifest/tier/slow-registry recomposition; intended WP6f alone owns performance
interpretation and go/no-go. Neither successor may relabel this descriptive
matrix as a benchmark, cutover, or readiness result.
