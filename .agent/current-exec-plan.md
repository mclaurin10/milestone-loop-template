# Current Execution Plan

**Status:** WP5s queued; freeze, verify, and commit WP5r first
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Complete the next bounded hosted-Windows fixture increment after WP5r:
`tools/milestone-orchestrator/src/orchestrator-identity.test.ts`.

After the already-corrected WP5r candidate is frozen, independently verified
on Windows and Linux ext4, and committed, reproduce the complete identity file
from that exact clean commit under a genuine NTFS 8.3 TEMP spelling. Add a
direct assertion proving the controlled fresh reviewing root differs from its
realpath, then canonicalize only that just-created fixture root. Retain strict
Git/workspace/orchestrator identity consumers unchanged, verify the complete
file on Windows and Linux ext4, and create one separate narrow commit.

This plan does not bundle later target/workspace/Git fixture files, normalize
caller-controlled or pre-existing paths, weaken any fail-closed identity or
containment check, run no-argument `pnpm verify`, close CAL-1, or claim
autonomous readiness.

## Goal Constraints

- Preserve the frozen authority and original evaluation contract; immutable
  baseline/active/actual hashes remain equal. Preserve readiness as the default
  profile, its permanent marker, and CAL-1 `open_not_started` / zero completed.
- Use Node `24.18.0`, pnpm `11.15.1`, exact clean no-local/no-hardlink clones,
  and repository-prescribed serial Vitest with `--fileParallelism=false`.
- Canonicalize only the affected fixture's freshly created root and retain a
  direct precondition assertion. Production `inspectTarget`, workspace,
  orchestration, state/schema, containment, cleanup, and Git identity remain
  byte-identical unless a new direct downstream red proof requires replanning.
- Every command owns unique checkout, TEMP/TMP/TMPDIR, Corepack, dependency,
  telemetry, and evidence roots. No writable root is shared concurrently.
- Never mutate `Implementation-ready improvement plan 8-5-26.txt`; preserve
  its SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
  Preserve ignored `.tools/corepack-home-readonly-probe` residue.
- One cohesive commit per causal owner. Do not push. Broader Session 1
  aggregates run once only after all intended tracked bytes are frozen.

## Baseline Evidence

- Published baseline is `3113c13182951814459628cebe252fe97fd93d9a` / tree
  `bb678f5a30e1a7f3bcd102ebb6d625b0b0ad350e`, equal to `origin/master`.
  Run #9 public metadata and its unaudited-artifact limitation are retained at
  `artifacts/hosted/run-32598203192/public-metadata.json`.
- WP5r exact clean baseline and assertion-only Windows runs both record 1/9
  passed and eight failed with ERROR/no receipt. After canonicalizing only
  `orchestrator-cleanup.test.ts::repositoryFixture`, test-only tree
  `0bb0fa80fa2f3c0095460273d5f34f49c1276c0b` passes 9/9 with valid receipts
  on Windows-short TEMP and Linux ext4. Final identical-candidate reruns and
  the WP5r commit are the mandatory boundary before WP5s mutation.
- Historical hosted report
  `artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
  places `orchestrator-identity.test.ts` next at `1786995203341`: 0/8 passed,
  eight failed. This remains ordering evidence, not current proof.
- Current source shows `reviewingFixture()` owns a raw
  `mkdtemp(join(tmpdir(), "milestone-loop-identity-orch-"))` root before Git,
  state, workspace, and orchestrator setup. The file imports no WP5r fixture
  owner. The direct consumer is strict Git/workspace identity.

## Steps

1. [ ] **In progress:** Format and freeze exactly the WP5r test/log/next-plan
       paths; materialize identical candidate clones; run and audit the
       complete WP5r file on Windows-short TEMP and Linux ext4; create the
       narrow WP5r commit without pushing.
2. [ ] From the exact clean WP5r commit, reproduce the complete identity file
       under a fresh genuine 8.3 TEMP with command-owned evidence. Require an
       ERROR manifest/report and no PASS receipt; record actual counts.
3. [ ] In a second exact clone/tree, import `realpath` and add only a direct
       root-realpath assertion before the first strict production boundary.
       Retain assertion-first ERROR evidence.
4. [ ] Canonicalize only `reviewingFixture()`'s just-created root with
       `realpath(await mkdtemp(...))`, keep the assertion, and run the complete
       file on Windows until all eight cases pass with a valid receipt.
5. [ ] Verify the complete file from a clean Linux-ext4 clone. Inspect the next
       retained failed file only far enough to establish independent ownership.
6. [ ] Update records, freeze/audit exact tracked scope, create the narrow WP5s
       commit, and replace this plan with the next causal owner.

## Acceptance Criteria

- WP5r is first committed from a frozen candidate whose complete affected file
  passes 9/9 with zero skips on Windows-short TEMP and Linux ext4, with valid
  independently audited receipts/artifacts.
- Current clean WP5r commit reproduces the identity file's retained 0/8 shape,
  or records a different actual result and replans before editing. Red commands
  have ERROR manifests/reports and no PASS receipts.
- Assertion-only evidence fails directly at the controlled root precondition.
  After correction, the complete file passes 8/8 with zero skips on Windows
  and Linux ext4, with valid independently audited receipts/artifacts.
- Only the just-created test fixture root is canonicalized. Strict production
  Git/workspace/orchestrator/state/schema/containment consumers remain
  unchanged. A separately owned downstream failure is preserved and replanned.
- Each increment has its own narrow local commit. Tracked status is clean apart
  from the protected untracked human file; disclosed ignored residue remains;
  no push occurs.

## Verification

WP5r final boundary:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/orchestrator-cleanup.test.ts --fileParallelism=false`

WP5s inner/final focused command:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/orchestrator-identity.test.ts --fileParallelism=false`

Planned WP5s retained roots are
`artifacts/manual/wp5s-orchestrator-identity-red/`,
`artifacts/manual/wp5s-orchestrator-identity-owner-red/`,
`artifacts/manual/wp5s-orchestrator-identity-windows-green/`, and
`artifacts/manual/wp5s-orchestrator-identity-linux-green/`.

For each test-only owner, the complete affected file plus Linux-ext4 parity is
the proportional commit ladder. Shared invariants/components run only if a
shared production/contract owner changes. After all intended Session 1
increments, freeze tracked bytes and run exactly once from isolated identical
candidate clones: `pnpm test:invariants`, `pnpm test:orchestrator`,
`pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`.
At most two heavy aggregates may overlap. Never run source no-argument
`pnpm verify`.

## Risks and Recovery

- Historical ordering may be stale after WP5r. Exact current reproduction is
  authoritative and can replan before mutation.
- Consumer-side normalization would weaken fail-closed identity. Keep changes
  at controlled creators and prove production owners byte-identical.
- Fixture correction may expose a downstream producer. Preserve its direct red
  evidence and create a new plan/commit rather than broadening this owner.
- Use short external Windows roots to avoid filename-length cascades. Keep WSL
  dependencies in disposable ext4 clones. Recovery is ordinary revert of one
  local commit; no ref rewrite, push, lifecycle transition, or broad cleanup.

## Progress and Evidence

- 2026-08-22: WP5q publication/run #9 were reconciled without claiming
  unaudited archive contents. WP5r baseline and owner red evidence were
  retained with exact hashes and no receipts.
- 2026-08-22: WP5r test-only tree
  `0bb0fa80fa2f3c0095460273d5f34f49c1276c0b` passed 9/9 on Windows-short
  TEMP and Linux ext4; every receipt/artifact binding was recomputed. Exact
  full-candidate reruns remain step 1.
- 2026-08-22: Retained ordering and current source classify
  `orchestrator-identity.test.ts::reviewingFixture()` as the next independent
  raw-root owner. No WP5s code change has begun.

## Next Action

Freeze the three intended WP5r tracked paths, run the complete cleanup file in
fresh identical-candidate Windows and Linux clones, audit the receipts, and
commit WP5r before reproducing the identity file.
