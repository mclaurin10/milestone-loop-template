# Current Execution Plan

**Status:** Complete — WP6a canonical test ownership
**Updated:** 2026-08-24
**Owner:** autonomous loop

## Objective

Declare exactly one canonical owner for every source test relevant to WP6 and
enforce that declaration with independently repeated Vitest discovery, stable
cross-platform diagnostics, and command-owned invariant evidence. Preserve all
current executors and commissioning boundaries for the later WP6b1 cutover.

## Constraints

- Preserve `PROJECT_GOAL.md`, acceptance/hidden-validation authority, CAL-1,
  readiness meaning, and command-receipt semantics.
- Do not change package scripts, `.agent/verification-manifest.json`,
  commissioning identity, exact-runtime CI commands, the slow-suite executor,
  `benchmark.ts`, or current test execution behavior.
- Use exact Node `24.18.0` and pnpm `11.15.1`. Keep the protected untracked
  human roadmap byte-identical at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- Treat Vitest discovery, not the ownership catalogue, as universe authority;
  require canonical repository-relative forward-slash paths and stable order.

## Baseline

- Start commit/tree: `b01467b4d14cb842da7645c6aba00dfabfb9ab37` /
  `222a55c878f462b5182585d897d479b382c87a23`.
- Hosted exact-runtime run `32785374927` for that exact commit completed with
  all five Linux/Windows controller, adopter, and OCI jobs green. It is a
  correctness baseline only, not WP6 timing evidence.
- Initial independent discovery found 79 unique files: 78 through the root
  config and one OCI-only fixture; the nested adopter config rediscovers two
  root-universe files. The prior slow registry explicitly owned one migration
  file and assigned every other new file to fast by subtraction, so it could
  not reject an unclassified addition or multiple owners.

## Implemented Increment

1. [x] Added `config/test-ownership.json`, with four allowlisted responsibility
       boundaries and an explicit sorted file list for every current test.
2. [x] Added independent discovery that enumerates tracked/unignored
       `vitest.config.*` files, runs Vitest's own `list --filesOnly --json`
       twice per config, repeats the orchestrator filter, resolves regular
       non-linked files, and normalizes Windows/Linux paths and ordering.
3. [x] Reconciled package scripts, current commissioned test commands,
       candidate fast/migration discovery, direct invariant selections, the
       OCI command, and the executable exact-runtime workflow contract.
4. [x] Added fail-closed validation for unclassified, multiply owned, stale,
       invalid-owner, invalid/noncanonical path, duplicate/case-ambiguous, and
       nondeterministic states with sorted actionable diagnostics.
5. [x] Added seven regression tests and a receipt-owning CLI, then registered
       it as the fifth substantive child of `pnpm test:invariants`.
6. [x] Classified the final 80-file universe exactly once: 76 controller
       runtime, one repository tooling, two adopter template, and one trusted
       container fixture.

## Acceptance and Evidence

- The intentional red run at
  `artifacts/manual/wp6a-ownership-gate-1/` added the gate test before its
  catalogue entry. It failed without a receipt and produced exactly one
  `UNCLASSIFIED_TEST` diagnostic; report SHA-256 is
  `72eb9f8a89cabd32efe9b8c0ce1c73c4a10efb0763edaf03655ad3810c3e3bb8`.
- The final direct gate report is deterministic at 80 files and 76/1/2/1
  owners. Focused coverage passes 7/7 suites and 16/16 tests. The integrated
  invariant suite passes all five receipt-owning commands.
- Exact clean-candidate evidence is retained under:
  - `artifacts/manual/wp6a-clean-ownership-gate-1/`
  - `artifacts/manual/wp6a-clean-focused-1/`
  - `artifacts/manual/wp6a-clean-invariants-1/`
  - `artifacts/manual/wp6a-clean-typecheck-1/`
  - `artifacts/manual/wp6a-clean-lint-1/`
  - `artifacts/manual/wp6a-clean-format-1/`
  - `artifacts/manual/wp6a-clean-orchestrator-1/`
  - `artifacts/manual/wp6a-clean-unit-1/`
- The clean broad reports pass 186/186 orchestrator suites and 626/626 tests,
  then 188/188 unit suites and 642/642 tests, with zero failures, skips,
  pending tests, or todos. Typecheck, lint, format, 6/6 safety scenarios, and
  `git diff --check` also pass.
- Each retained command result/report was inspected. Candidate manifests bind
  the exact WP6a commit with `workingTreeDirty: false`; no exit code is treated
  as sufficient without its expected command-owned receipt and artifact.
- Active manifest, commissioning identity, package/workflow command set,
  slow-suite registry, benchmark implementation, and immutable lock are
  unchanged. CAL-1 remains `open_not_started`.

## Risks and Recovery

- Nested adopter discovery intentionally overlaps root discovery; provenance
  overlap is not ownership overlap. Duplicate spelling, case collisions, or
  repeated-set drift still fail closed.
- The four owners describe current execution responsibilities, not the future
  disjoint candidate schedule. Executor overlap remains deliberately present
  until WP6b1 proves shadow equivalence.
- The hosted exact-runtime baseline predates WP6a and the final local commit is
  not pushed, so no hosted result is claimed for this increment. No WP6 timing
  conclusion is supported yet.

## Immediate Handoff — WP6b1

Consume the catalogue to add disjoint owner-based candidate executors and
command-owned partition receipts. Run them only in shadow beside the current
fast/migration/orchestrator commands, compare normalized discovered and
executed file/test inventories plus outcome/receipt semantics, and fail any
omission, overlap, or unexplained delta. Keep the current commissioned manifest
authoritative and unchanged; do not start the timing matrix or cut over tiers
until shadow equivalence is proven.
