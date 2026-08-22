# Current Execution Plan

**Status:** WP5t frozen-candidate verification, then WP5u exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Freeze and commit the proved WP5t crash-worker correction, then complete the
next bounded hosted-Windows fixture increment:
`tools/milestone-orchestrator/src/workspace-cleanup-recovery.test.ts`, whose
failed subprocesses are created by
`tools/milestone-orchestrator/test/workspace-cleanup-crash-worker.ts`.

From the exact clean WP5t commit, reproduce the complete recovery file under
genuine NTFS 8.3 TEMP. Add an assertion-only proof inside the subprocess
fixture before its fresh root crosses strict Git/workspace inspection,
canonicalize only that worker-created root, retain the assertion, verify the
complete file on Windows and Linux ext4, and create one separate narrow commit.

Do not normalize caller-controlled or pre-existing paths, weaken
`inspectTarget`, alter workspace-cleanup recovery semantics/fault points,
bundle later fixture files, run source no-argument `pnpm verify`, close CAL-1,
or claim autonomous readiness.

## Goal Constraints

- Preserve frozen authority/evaluation hashes, readiness default/marker, and
  CAL-1 `open_not_started` with zero completions.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  genuine Windows short TEMP, Linux ext4 parity, and serial Vitest
  `--fileParallelism=false`.
- Canonicalize only the workspace-cleanup crash worker's freshly created root.
  Keep a direct assertion before Git/workspace setup. Production Git identity,
  workspace create/cleanup, reducer, state/schema, fault points, and cleanup
  remain byte-identical unless a separately proved downstream owner forces
  replanning.
- Give each qualifying command unique checkout, TEMP, Corepack, dependency,
  telemetry, and evidence roots; share no writable roots concurrently.
- Never mutate `Implementation-ready improvement plan 8-5-26.txt`; preserve
  SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`
  and ignored `.tools/corepack-home-readonly-probe` residue.
- One cohesive commit per owner; do not push. Run Session 1 broader aggregates
  only once after all intended tracked bytes freeze.

## Baseline Evidence

- Clean local HEAD is WP5s commit
  `e8aa6d5c379c59b88ee10b4ea12add6d16ae040c` / tree
  `d4039f16b6464ec743b0de761a0ea974bfaff85a`, two ahead of unchanged
  `origin/master` before the WP5t commit.
- WP5t exact baseline and assertion-only runs reproduce 0/3 with ERROR/no
  receipt. Canonicalizing only the crash worker root produces test-only tree
  `2b4ce32834cfb51d280897d4d17c9bed21bb65c9`, which passes 3/3 on
  Windows-short TEMP and Linux ext4.
- A corrected-tree run under an excessively long expanded TEMP failed only
  because Git rejected a 266-character branch-ref path. The same tree passes
  under a shorter expanded directory with a genuine distinct 8.3 alias; no
  production workspace defect or change is claimed.
- Historical report
  `artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
  places `workspace-cleanup-recovery.test.ts` next at `1786995222359`: 0/3.
  All three retained failures show subprocess exit `1` instead of expected
  fault exit `86`, with strict `inspectTarget()` rejecting short
  `milestone-loop-cleanup-crash-*` versus its expanded realpath.
- Current trace proves direct ownership in
  `test/workspace-cleanup-crash-worker.ts::main()`: raw
  `mkdtemp(join(tmpdir(), "milestone-loop-cleanup-crash-"))` is passed to
  `createIsolatedWorkspaceFixture()`. The outer evidence directories are
  separate outputs, not the failed Git root.

## Steps

1. [ ] **In progress:** Freeze exactly the WP5t worker/log/next-plan paths;
       run and audit the complete target-integration recovery file on
       identical Windows-short and Linux-ext4 candidate clones; create the
       narrow WP5t commit unpushed.
2. [ ] From the exact clean WP5t commit, reproduce the complete workspace-
       cleanup recovery file under genuine short TEMP. Retain actual ERROR
       report/manifest and prove no PASS receipt exists.
3. [ ] In a second exact clone/tree, add only promise `realpath` plus a direct
       Node strict-equality assertion beside the cleanup crash-worker root
       creator. Retain assertion-first ERROR evidence without changing root
       behavior.
4. [ ] Canonicalize only that worker-created root with
       `realpath(await mkdtemp(...))`, retain the assertion, and run the
       complete Windows file until all three cases pass with a valid receipt.
5. [ ] Run the same complete file from a clean Linux-ext4 clone. Inspect the
       next retained failure only enough to classify independent ownership.
6. [ ] Update records, freeze/audit exact scope, create the narrow WP5u commit,
       and replace this plan with the next causal owner.

## Acceptance Criteria

- WP5t passes 3/3 with zero skips on final identical candidate clones for
  Windows-short TEMP and Linux ext4, with valid independently audited evidence,
  then commits narrowly without pushing.
- Exact current clean WP5t commit reproduces the cleanup-recovery file's
  retained 0/3 shape, or records a different actual result and replans before
  mutation. Failed commands retain ERROR manifests/reports and no PASS receipt.
- Assertion-only evidence fails directly in the worker because the controlled
  root differs from promise realpath. After correction, the complete file
  passes 3/3 with zero skips on Windows and Linux ext4 with valid receipts.
- Only the subprocess fixture creator changes. Production Git/workspace/
  cleanup/reducer/state/schema/fault owners remain unchanged. Any downstream
  independent red remains explicit.
- One local commit per owner; tracked status returns to protected-file-only;
  immutable/lifecycle/protected identities remain exact; no push occurs.

## Verification

WP5t final boundary:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/target-integration-recovery.test.ts --fileParallelism=false`

WP5u focused command:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/workspace-cleanup-recovery.test.ts --fileParallelism=false`

Planned retained WP5u roots:
`artifacts/manual/wp5u-workspace-cleanup-recovery-red/`,
`artifacts/manual/wp5u-workspace-cleanup-recovery-owner-red/`,
`artifacts/manual/wp5u-workspace-cleanup-recovery-windows-green/`, and
`artifacts/manual/wp5u-workspace-cleanup-recovery-linux-green/`.

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
- Keep expanded Windows TEMP paths short enough that the fixture's intentional
  nested branch name remains below Git-for-Windows' path budget; still prove a
  distinct genuine 8.3 spelling with promise realpath.
- Do not confuse outer evidence directories with the worker-owned Git root.
  The direct assertion belongs inside the worker before workspace creation.
- If root correction exposes a later production-created noncanonical path,
  retain a separate direct red proof and replan before changing it.
- Use short external Windows roots and disposable WSL ext4 clones. Recovery is
  ordinary revert of one commit; no push, ref rewrite, lifecycle change, or
  broad cleanup.

## Progress and Evidence

- 2026-08-22: WP5t exact baseline and assertion-only red evidence were retained
  and independently audited; creator-only correction passes 3/3 on
  preliminary Windows-short and Linux-ext4 trees.
- 2026-08-22: An oversized expanded TEMP produced a separate 266-character
  Git ref-path diagnostic. An identical corrected tree passes under a shorter
  expanded TEMP with a verified distinct 8.3 alias; production stayed
  byte-identical.
- 2026-08-22: Retained failure stacks and current source identify the
  workspace-cleanup crash worker—not outer evidence directories—as the next
  direct root owner. No WP5u code mutation has begun.

## Next Action

Stage the frozen WP5t worker/log/plan paths, compute the exact candidate tree,
then create independent exact Windows-short and Linux-ext4 clones for the final
complete WP5t focused command and evidence audit.
