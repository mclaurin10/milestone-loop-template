# Current Execution Plan

**Status:** WP5t queued; freeze, verify, and commit WP5s first
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Complete the next bounded hosted-Windows fixture increment after WP5s:
`tools/milestone-orchestrator/src/target-integration-recovery.test.ts`, whose
failed subprocesses are created by
`tools/milestone-orchestrator/test/target-integration-crash-worker.ts`.

After WP5s is frozen, verified on Windows/Linux, and committed, reproduce the
complete recovery file from that exact clean commit under genuine NTFS 8.3
TEMP. Add an assertion-only proof inside the subprocess fixture before its
fresh root crosses strict Git/workspace inspection, canonicalize only that
worker-created root, retain the assertion, verify the complete file on Windows
and Linux ext4, and create one separate narrow commit.

Do not normalize caller-controlled or pre-existing paths, weaken
`inspectTarget`, alter target-integration recovery semantics/fault points,
bundle later fixture files, run source no-argument `pnpm verify`, close CAL-1,
or claim autonomous readiness.

## Goal Constraints

- Preserve frozen authority/evaluation hashes, readiness default/marker, and
  CAL-1 `open_not_started` with zero completions.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  genuine Windows short TEMP, Linux ext4 parity, and serial Vitest
  `--fileParallelism=false`.
- Canonicalize only the crash worker's freshly created root. Keep a direct
  assertion before Git/workspace setup. Production Git identity, workspace,
  target integration, reducer, state/schema, fault points, and cleanup remain
  byte-identical unless a separately proved downstream owner forces replanning.
- Give each command unique checkout, TEMP, Corepack, dependency, telemetry,
  and evidence roots; share no writable roots concurrently.
- Never mutate `Implementation-ready improvement plan 8-5-26.txt`; preserve
  SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`
  and ignored `.tools/corepack-home-readonly-probe` residue.
- One cohesive commit per owner; do not push. Run Session 1 broader aggregates
  only once after all intended tracked bytes freeze.

## Baseline Evidence

- Clean local HEAD before WP5s is WP5r commit
  `1b51a8bc671a19fab2b82e27a46cca87a333bcba` / tree
  `1751b260806c3d10dd4784b133307a7058405fd7`, one ahead of unchanged
  `origin/master`.
- WP5s baseline and assertion-only runs reproduce 0/8 with ERROR/no receipt.
  Canonicalizing only `reviewingFixture()` produces test-only tree
  `5108a323a78edf70cdd320a6f85f37c7c0d0d286`, which passes 8/8 on
  Windows-short TEMP and Linux ext4. Final identical-candidate reruns and the
  WP5s commit remain the required boundary before WP5t mutation.
- Historical report
  `artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
  places `target-integration-recovery.test.ts` next at `1786995207495`: 0/3.
  All three retained failures show subprocess exit `1` instead of expected
  fault exit `86`, with strict `inspectTarget()` rejecting short
  `milestone-loop-target-crash-*` versus its expanded realpath.
- Current trace proves direct ownership in
  `test/target-integration-crash-worker.ts::main()`: raw
  `mkdtemp(join(tmpdir(), "milestone-loop-target-crash-"))` is passed to
  `createIsolatedWorkspaceFixture()`. The three outer test evidence directories
  are separate outputs, not the failed Git root.

## Steps

1. [ ] **In progress:** Freeze exactly the WP5s test/log/next-plan paths; run
       and audit the complete identity file on identical Windows-short and
       Linux-ext4 candidate clones; create the narrow WP5s commit unpushed.
2. [ ] From the exact clean WP5s commit, reproduce the complete target-
       integration recovery file under genuine short TEMP. Retain actual
       ERROR report/manifest and prove no PASS receipt exists.
3. [ ] In a second exact clone/tree, add only `realpath` plus a direct Node
       strict-equality assertion beside the crash-worker root creator. Retain
       assertion-first ERROR evidence without changing root behavior.
4. [ ] Canonicalize only that worker-created root with
       `realpath(await mkdtemp(...))`, retain the assertion, and run the
       complete Windows file until all three cases pass with a valid receipt.
5. [ ] Run the same complete file from a clean Linux-ext4 clone. Inspect the
       next retained failure only enough to classify independent ownership.
6. [ ] Update records, freeze/audit exact scope, create the narrow WP5t commit,
       and replace this plan with the next causal owner.

## Acceptance Criteria

- WP5s first passes 8/8 with zero skips on final identical candidate clones for
  Windows-short TEMP and Linux ext4, with valid independently audited evidence,
  then commits narrowly without pushing.
- Exact current clean WP5s commit reproduces the recovery file's retained 0/3
  shape, or records a different actual result and replans before mutation.
  Failed commands retain ERROR manifests/reports and no PASS receipt.
- Assertion-only evidence fails directly in the worker because the controlled
  root differs from promise realpath. After correction, the complete file
  passes 3/3 with zero skips on Windows and Linux ext4 with valid receipts.
- Only the subprocess fixture creator changes. Production Git/workspace/
  target-integration/reducer/state/schema/fault/cleanup owners remain
  unchanged. Downstream independent red remains explicit.
- One local commit per owner; tracked status returns to protected-file-only;
  immutable/lifecycle/protected identities remain exact; no push occurs.

## Verification

WP5s final boundary:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/orchestrator-identity.test.ts --fileParallelism=false`

WP5t focused command:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/target-integration-recovery.test.ts --fileParallelism=false`

Planned retained WP5t roots:
`artifacts/manual/wp5t-target-integration-recovery-red/`,
`artifacts/manual/wp5t-target-integration-recovery-owner-red/`,
`artifacts/manual/wp5t-target-integration-recovery-windows-green/`, and
`artifacts/manual/wp5t-target-integration-recovery-linux-green/`.

The test-only worker owner uses the complete affected file plus Linux parity as
its per-commit ladder. Shared checks are added only if a production/contract
owner changes. After intended Session 1 increments, freeze all tracked bytes
and run once from isolated identical candidates: `pnpm test:invariants`,
`pnpm test:orchestrator`, `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, and
`pnpm format:check`; at most two heavy aggregates overlap. Never run source
no-argument `pnpm verify`.

## Risks and Recovery

- The recovery file intentionally runs real subprocess crash/fault paths and
  can be slow once the early root rejection is removed. Preserve existing
  timeouts/fault points and use the focused file only while iterating.
- Do not confuse outer evidence directories with the worker-owned Git root.
  The direct assertion belongs inside the worker before workspace creation.
- If root correction exposes a later production-created noncanonical path,
  retain a separate direct red proof and replan before changing it.
- Use short external Windows roots and disposable WSL ext4 clones. Recovery is
  ordinary revert of one commit; no push, ref rewrite, lifecycle change, or
  broad cleanup.

## Progress and Evidence

- 2026-08-22: WP5s exact baseline and assertion-only red evidence were retained
  and independently audited; creator-only correction passes 8/8 on preliminary
  Windows-short and Linux-ext4 trees.
- 2026-08-22: Retained failure stacks and current source identify the target-
  integration crash worker—not the outer test evidence directories—as the
  next direct root owner. No WP5t code mutation has begun.

## Next Action

Freeze the three intended WP5s paths, rerun the complete identity file on fresh
identical-candidate Windows and Linux clones, audit receipts, and commit WP5s
before reproducing target-integration recovery.
