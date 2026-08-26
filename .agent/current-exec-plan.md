# Current Execution Plan

**Status:** In progress — WP6b replacement-candidate qualification after verifier timeout
**Updated:** 2026-08-26
**Owner:** autonomous loop

## Objective

Close WP6b without beginning WP6c: fix the two identified evidence defects,
commit one executable candidate (X), qualify that exact clean commit from short
external paths, then commit a documentation-only durable closeout record (Y).

## Goal Constraints

- Preserve frozen goal/evaluation meaning, immutable locks, CAL-1 state,
  readiness gates, commissioned verification/source inputs, slow-suite registry,
  exact-runtime workflow commands, package command semantics, `benchmark.ts`,
  and product behavior.
- Preserve the untracked human roadmap byte-for-byte at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`;
  never stage, edit, move, delete, or commit it.
- Use repository-pinned Node `24.18.0` and pnpm `11.15.1`. Run resource-heavy
  qualification serially. Do not reuse or remove `C:/w/e5` or `C:/w/q3`.
- Preserve failed-candidate roots `C:/w/w6x` and `C:/w/w6e`. Reserve the absent
  replacement clean-clone root `C:/w/x7` and evidence root `C:/w/e7`; the exact
  replacement shadow artifact directory is `C:/w/e7/shadow`.
- Do not recommission, change tiers, measure performance, build the timing
  aggregator, run the 5x2 timing matrix, push, claim readiness, or start WP6c.

## Baseline Evidence

- Entry commit/tree is `18324be299ff6eee07bdb5ee8ba5ec086447b75a` /
  `ba7331e28f635f0bba2fe21e34806d4f1c0be16d`; `master` equals
  `origin/master`. The protected roadmap is the only worktree entry.
- Historical `C:/w/e5` is a clean PASS for that identity, but its manifest is
  falsely `tracked`: basename `e5` incidentally matched many tracked files.
  It is diagnostic evidence only and will not qualify changed code.
- Historical `C:/w/q3` records a concurrent focused run with two state-store
  failures/timeouts, followed by a serial 66/66 PASS. It is neither a proven
  product regression nor a clean first attempt and remains historical only.
- `normalizeVitestReport()` validates total observations and nonnegative
  passed/failed/pending counters, but does not fail closed on raw
  `success:false`, todo/skipped/pending dispositions, suite counters, or
  contradictory totals before a partition receipt can be written.

## Steps

1. [x] Read authority, plan standard, stale handoff, latest WP6 logs, Git/package
       state, relevant code/tests, and historical evidence; reproduce both defects.
2. [x] Remove basename citation needles. Accept only an exact unique manifest ID
       or exact normalized artifact path (absolute, plus repository-relative paths
       when contained); cover incidental basename, exact ID, exact path, and absent
       exact reference.
3. [x] Add one shared fail-closed raw Vitest disposition validator used by every
       partition and legacy report normalized for shadow evidence. Reject malformed
       or contradictory counters, `success:false`, failed, pending/skipped, or todo
       suites/tests; cover each synthetic disposition plus a valid all-pass report.
4. [x] Run focused checks, record truthful interim evidence, and create the first
       executable candidate `668c9d9c6366579aeb4e9c56817def0c2ecfb696`.
5. [x] Qualify that candidate serially from `C:/w/w6x` into `C:/w/w6e`. All
       requested standalone checks and the exact shadow passed, but exact
       no-argument `pnpm verify` exposed a genuine 900,000 ms unit-stage harness
       timeout, so this candidate is rejected and its evidence is diagnostic only.
6. [ ] Align only the readiness `unit-domain` supervisor bound with the existing
       finite 90-minute full-suite evidence bound; add a regression pinning the
       aggregate-verifier contract; run focused checks and create a new X.
7. [ ] Clone the new X to `C:/w/x7`, prove exact commit/tree/clean identity, and
       rerun the entire serial qualification from the beginning into `C:/w/e7`,
       including exact shadow, ownership, focused regressions, invariants, unit,
       orchestrator, typecheck, lint, format, exact-workflow contract, safety, and
       exact no-argument `pnpm verify`.
8. [ ] Independently inspect receipts/artifacts, candidate identities, partition
       ownership/union/intersections, semantic counts/dispositions, protected hashes,
       and the expected honest readiness disposition. Any code defect creates a new
       X and restarts clean qualification from the beginning.
9. [ ] Replace the pending handoff with a compact WP6b closeout record, create
       documentation-only commit Y, prove `git diff X..Y` is documentation/evidence
       only, run Y formatting/contract-integrity checks, and leave only the protected
       roadmap untracked. WP6c remains unstarted.

## Acceptance Criteria

- Basename-only tracked text cannot establish a citation; exact manifest ID and
  normalized path can; no exact reference remains `uncited-at-creation`.
- Every raw legacy and partition Vitest report used by shadow qualification must
  explicitly describe an internally consistent, all-passing disposition with
  zero failed, pending/skipped, and todo suites/tests. Rejection produces no PASS
  receipt or passing aggregate and retains useful failure evidence/nonzero exit.
- Exact X passes the requested clean qualification. Every discovered test has
  exactly one owner; intersections are empty; union equals discovery; normalized
  legacy and partition observations match after defined deduplication; every
  required receipt and declared hash/size validates independently.
- No-argument `pnpm verify` is run and recorded as its honest disposition. A
  readiness `NOT_READY`/nonzero caused by genuinely incomplete gates is expected
  and is not relabeled PASS or used for a readiness claim.
- Y changes documentation/evidence records only, names X as the qualified
  executable identity, records compact evidence/hashes/counts, preserves `q3`
  history, closes WP6b, and names WP6c as next but unstarted.

## Verification

- Focused evidence: durable-citation and test-partition regression files through
  `node tools/run-tool-evidence.mjs invariant-vitest ... --fileParallelism=false`.
- Ownership/proof: ownership CLI, partition-focused ownership/disjoint-union
  regressions, four owner receipts, and clean `pnpm test:partitions:shadow`.
- Broader X: `pnpm test:invariants`, `pnpm test:unit`,
  `pnpm test:orchestrator`, `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, exact-runtime workflow-contract focus,
  `pnpm loop:demo-safety`, no-argument `pnpm verify`, `git diff --check`, and
  immutable/protected hash checks.
- Y: prove documentation-only `git diff X..Y`, then run formatting,
  contract-integrity, immutable-lock, protected-roadmap, and clean-tree checks.

## Risks and Recovery

- Full Windows suites are long and path-sensitive. Use the reserved short roots,
  isolated command/temp/store directories, and serial execution; retain any
  failure artifacts. A changed candidate invalidates all earlier qualification.
- Raw Vitest JSON fields vary by failure mode. Validate fields when relevant and
  fail on malformed present counters without inventing absent historical fields.
- All edits are ordinary source-controlled changes. Revert only the cohesive
  closeout increment if necessary; never alter frozen/protected inputs for PASS.

## Progress and Evidence

- Entry inspection and both defect reproductions are complete. `C:/w/e5` and
  `C:/w/q3` remain untouched historical data.
- Pinned dirty-tree focused evidence at `C:/w/d6/focused` passes 8/8 suites and
  23/23 tests with zero failed, pending, or todo dispositions. Its external
  manifest is truthfully `uncited-at-creation`. Pinned typecheck, lint, and
  format receipts pass at `C:/w/d6/{typecheck,lint,format}`; ownership passes at
  `C:/w/d6/ownership` for the unchanged 81-file universe.
- The two narrow implementations and requested regressions are complete. No
  product, commissioning, workflow, tier, timing, or WP6c work has begun.
- The first candidate `668c9d9c6366579aeb4e9c56817def0c2ecfb696`
  passed focused 35/35, ownership for 81 files, exact shadow with 669 normalized
  partition observations and zero semantic deltas, standalone unit 668/668,
  orchestrator 652/652, invariants, static checks, and safety from clean short
  paths. Exact no-argument `pnpm verify` at
  `C:/w/w6x/artifacts/verify-2026-08-26T072822-615Z-6016` then failed its
  `test:unit` command at the hard 900,000 ms aggregate-verifier timeout. That
  same exact candidate's standalone unit receipt passed under the established
  90-minute full-suite bound, so the no-argument result is a harness defect,
  not an acceptable readiness disposition. Preserve `C:/w/w6x` and `C:/w/w6e`;
  none of their results qualify the replacement candidate.
- A replacement X, complete clean qualification from `C:/w/x7` into `C:/w/e7`,
  honest no-argument disposition without harness failure, and commit Y are pending.

## Next Action

Pin the aggregate verifier's readiness unit-stage bound to the existing finite
full-suite bound, run its focused regression and static checks, then create the
replacement executable candidate X with all prior qualification invalidated.
