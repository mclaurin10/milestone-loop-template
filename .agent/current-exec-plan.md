# Current Execution Plan

**Status:** In progress — final clean WP6b qualification pending
**Updated:** 2026-08-25
**Owner:** autonomous loop

## Objective

Turn WP6a's validated canonical ownership catalogue into independently
invokable, receipt-owning test partitions and prove, on one clean immutable
candidate commit, that their disjoint execution is semantically equivalent to
the deduplicated legacy fast/migration/orchestrator plus OCI-fixture surface.
This increment ends at shadow-candidate evidence; it does not commission or
adopt a new tier schedule, measure performance, or begin timing aggregation.

## Goal Constraints

- Preserve frozen authority, acceptance meaning, CAL-1 state, readiness gates,
  receipt semantics, and the Node `24.18.0` / pnpm `11.15.1` pins.
- Keep `.agent/verification-manifest.json`, its commissioning source input,
  current default verification behavior, existing package commands, exact
  runtime workflow commands, slow-suite registry, and `benchmark.ts`
  semantically and byte-for-byte unchanged where required.
- Derive partition membership only from
  `tools/milestone-orchestrator/config/test-ownership.json` after the WP6a gate
  independently rediscovers and validates the complete Vitest universe.
- Normalize all repository paths to forward-slash relative paths and sort every
  proof inventory deterministically across Windows and Linux. Select execution
  config from WP6a discovery provenance by the most-specific containing config,
  with normalized lexical order as the tie-breaker; do not maintain config or
  test globs beside the catalogue.
- Preserve the protected untracked human roadmap byte-for-byte at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- Do not recommission, cut over candidate tiers, relocate `benchmark.ts`, run a
  5x platform matrix, or claim a timing/performance improvement.

## Baseline Evidence

- Start commit/tree: `2df0541da5e9cf2bc47e95f29e666feda9c513ee` /
  `de097d529b6994dd4badb297bbc5e232bdd669a6`; branch is one commit ahead of
  `origin/master`. The only worktree entry is the protected untracked roadmap.
- The retained clean-clone WP6a receipt at
  `artifacts/manual/wp6a-clean-ownership-gate-1/` binds that commit with
  `workingTreeDirty:false`, a PASS receipt, and 80 exactly-once files split
  76 `controller-runtime`, 1 `repository-tooling`, 2 `adopter-template`, and
  1 `trusted-container-fixture`.
- The live pinned reproduction at
  `artifacts/manual/wp6b-entry-ownership-gate-1/` also passes for 80 files,
  catalogue SHA-256
  `606ff5a980f83b68997e2f69ad2b095830bdc3b5d9a68b12d1dd057d1cb00f75`,
  and zero diagnostics.
- The legacy candidate surface intentionally overlaps: fast selects the root
  universe except the explicit migration file, migration selects
  `state-store.test.ts`, and orchestrator re-executes the controller subtree.
  The OCI fixture config supplies the 80th independently discovered source test.
- Preservation identities at entry are manifest
  `f765765d8082280282151253e616f87a460dbe8c38f17909aa22d7dcb7930dd9`,
  commissioning source
  `59f053d0b4ed195e2fda8746f8ee018ea3c97706c07f53a37908c40ef41b8629`,
  slow registry
  `04e27df9dd8cb4b699d42b680e20452227a57be9ddd07cff5ffe58a23da09d4c`,
  benchmark
  `4e1ba93fe67814d421dc1532bb816312d76a86f43f53b88e6e8eba8deccde88e`,
  and immutable lock
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`.

## Steps

1. [x] Complete authority, WP6/WP6a handoff, logs, Git, retained evidence,
       catalogue, discovery, legacy executor, receipt, runtime, and preservation
       inspection; reproduce the ownership gate under the pinned runtime.
2. [x] Add a deterministic partition/proof library and CLI.
       Each canonical owner gets an independent package command, validated
       membership/config assignment, raw Vitest report(s), normalized semantic
       inventory, and command-owned receipt. Add the clean-only aggregate shadow
       runner with child receipt validation and exact nonzero propagation.
3. [x] Add focused regression fixtures for pairwise overlap, incomplete union,
       unexpected membership, semantic mismatch, multiply selected tests, and
       aggregate failure propagation. Classify the new test file in the WP6a
       catalogue and keep its gate green.
4. [ ] Run focused pinned checks, then create one clean immutable candidate and
       run one complete legacy-versus-partition shadow comparison. Inspect all
       four child receipts/raw reports plus the aggregate authenticated proof;
       diagnose any outcome, order, shared-state, config, or selection delta.
5. [ ] Run clean-candidate invariants, typecheck, lint, format, orchestrator,
       unit, demo safety, no-argument behavior check, exact-runtime contract
       owner, and diff/integrity checks. Inspect receipts/reports and preservation
       hashes rather than accepting exit codes alone.
6. [ ] Update `CONTRACT.md`, `README.md`, this plan, `docs/autonomy-log.md`, and
       `docs/decision-log.md` with observed behavior and evidence. Create one
       narrow local WP6b commit, leave the protected roadmap untouched and the
       tracked tree clean, and hand off normalized per-run timing summaries and
       measurement-protocol instrumentation as the exact next increment.

## Acceptance Criteria

- Every discovered test belongs to exactly one executable owner partition;
  every pairwise intersection is empty and the exact sorted union equals the
  independently discovered universe. A compact deterministic proof records the
  catalogue identity, universe identity, owner counts/membership, intersections,
  union deltas, semantic comparison, and candidate identity.
- Each owner is independently invokable through a deterministic public command;
  successful execution writes a genuine receipt that hash-binds its selection
  report and raw Vitest report(s). Missing/invalid evidence is non-passing.
- One clean same-commit aggregate runs the overlapping legacy surface and all
  new partitions under equivalent pinned runtime/config conditions, validates
  child receipts, deduplicates legacy observations by normalized
  repository-file plus test identity, and proves no missing, unexpected,
  multiply selected, disposition-different, or failure-outcome-different tests.
- Aggregate execution returns a child nonzero code (or `1` when no usable code
  exists), stops before later children, emits no PASS receipt, and retains
  diagnostic evidence when any partition fails.
- Regression fixtures fail for overlap, incomplete union, unexpected membership,
  semantic mismatch, multiply selected partition tests, and aggregate child
  failure; deterministic rendering/path normalization is covered.
- Active manifest/source, slow registry, benchmark, immutable lock, legacy
  package argv, default profile, exact-runtime workflow commands, and no-argument
  verification semantics remain unchanged. No cutover or performance claim is
  made.
- Focused and broader pinned checks pass with valid inspected evidence; one
  cohesive local commit is the verified candidate and the tracked tree is clean.

## Verification

Use fresh PowerShell processes with pinned Node/pnpm and unique ignored evidence,
telemetry, temp, Corepack, and pnpm-store roots. Focused commands:

- `node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/test-partitions.test.ts tools/milestone-orchestrator/src/test-ownership.test.ts --fileParallelism=false`
- `tsx tools/milestone-orchestrator/src/test-ownership-cli.ts`
- each `pnpm test:partition:<owner>` command with its own evidence directory
- clean-candidate `pnpm test:partitions:shadow`

Broader closure:

- `pnpm test:invariants`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm test:orchestrator`
- `pnpm test:unit`
- exact-runtime workflow-contract focused owner
- no-argument `pnpm verify` behavior comparison (expected readiness disposition,
  not a completion claim)
- `pnpm loop:demo-safety`
- `git diff --check`
- preservation SHA-256 and protected-roadmap identity checks

Inspect every receipt, declaration hash/size, raw Vitest count/disposition,
partition proof delta, candidate commit/tree/clean flag, and expected no-argument
result. Treat skipped, missing, malformed, stale, or unbound evidence as failure.

## Risks and Recovery

- Legacy tests create many Git/process/temp fixtures and may reveal order or
  shared-state dependence when regrouped. Keep file parallelism disabled, use
  isolated command/temp roots, reproduce the first delta, and fix its root cause
  with coverage rather than duplicating or suppressing a test.
- Some files appear under multiple Vitest configs. Config choice is derived from
  repeated discovery provenance, never owner-name special cases; the containing
  config preference preserves adopter/OCI boundaries while root owns remaining
  files. Any ambiguous equal-rank choice fails closed.
- The shadow run is intentionally expensive and supplies correctness evidence
  only. If it fails or candidate identity changes, retain failure artifacts,
  correct the implementation, and rerun on a new clean immutable candidate.
- All edits are ordinary source-controlled changes. Recover by reverting only
  this cohesive increment; never alter frozen or protected inputs to obtain PASS.

## Progress and Evidence

- Entry ownership gate: `artifacts/manual/wp6b-entry-ownership-gate-1/` — PASS,
  valid receipt/report, 80 files, four owners, zero diagnostics.
- Focused evidence at `artifacts/manual/wp6b-focused-partitions-2/` passes the
  initial 17/17 regression tests; the current suite passes 18/18 after adding
  the public-command contract fixture. The ownership gate at
  `artifacts/manual/wp6b-ownership-gate-2/` passes 81 files split 77/1/2/1.
- Independent dirty-tree diagnostic receipts pass at
  `artifacts/manual/wp6b-partition-controller-runtime-1/` (77 files/632 tests),
  `wp6b-partition-repository-tooling-1/` (1/16),
  `wp6b-partition-adopter-template-3/` (2/4), and
  `wp6b-partition-trusted-container-fixture-1/` (1/1), with zero failures,
  skips, or todos. A first adopter run correctly retained failure evidence when
  nested config roots were omitted; production now derives the same `--root`
  and config basename used by WP6a discovery.
- The first exact clean shadow at
  `artifacts/manual/wp6b-clean-shadow-1/` failed closed on the legacy fast
  selector's stale 20-minute wrapper timeout, propagated exit 1, launched no
  later child, and issued no PASS receipt. The selected suite remained active
  and has a retained 49–51 minute pinned-runtime baseline, so the directly
  blocking wrapper bound now matches the existing one-hour full-suite bound;
  selection, per-test limits, parallelism, and exact-runtime workflow commands
  are unchanged, and a regression pins the correction.
- The second exact clean shadow at
  `artifacts/manual/wp6b-clean-shadow-2/` also failed closed before later
  children and issued no PASS receipt. Its raw Vitest report records 625 tests,
  with all 33 failures caused by Windows `Filename too long` errors below the
  deeply nested evidence/runtime root; this is an execution-environment path
  budget defect, not semantic comparison evidence. Retain this diagnostic run.
- The first short-path complete shadow at `C:\\w\\e3` passes on clean commit
  `c4a1f0380cd2d3d38df449f0912453f87541b5a2`: 81 files split 77/1/2/1,
  655 unique partition tests, and 1,293 legacy observations deduplicated to
  655 with no semantic delta. All eight manifests and receipts and every
  declared hash/size were independently inspected.
- The subsequent clean full-unit aggregate at `C:\\w\\q1\\unit` failed closed
  exactly at its stale 3,600,000 ms evidence-wrapper limit, emitted no PASS
  receipt, and was still producing fresh runtime state immediately beforehand.
  The complete split unit surface had already passed 625 fast plus 29 migration
  tests. Give only the receipt-owning full unit/orchestrator wrappers bounded
  90-minute headroom, pin that value with a regression, retain the failed run,
  and rerun qualification on the amended candidate.
- The final-shadow attempt at `C:\\w\\e4` on clean commit
  `3a600203ea70f15cadaf393b0df96edc09330153` passed the legacy children, then
  failed closed in `controller-runtime`: 634/635 tests passed and
  `state-store.test.ts` teardown raised Windows `ENOTEMPTY` while recursively
  deleting an owned Git fixture. The surviving `state.json` predates teardown,
  proving this was transient recursive-removal behavior rather than an
  unawaited state write. Preserve the failed receipts/reports; add bounded
  transient cleanup retries with deterministic coverage, rerun the focused
  state-store surface, then amend and completely requalify a new clean commit.
- Recreate the immutable candidate at a short clone root and use a short
  evidence root for the next complete shadow. Do not mark this plan complete or
  begin WP6c unless that same-commit aggregate and the remaining clean focused,
  ownership, invariant, typecheck, lint, format, orchestrator, unit, demo,
  diff, and preservation checks all pass with inspected evidence.

## Next Action

Begin WP6c with normalized per-run timing summaries and measurement-protocol
instrumentation while the commissioned legacy schedule remains active. Do not
cut over tiers until the required cold/warm Windows/Linux matrix demonstrates a
material improvement beyond measured noise.
