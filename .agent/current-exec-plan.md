# Current Execution Plan

**Status:** WP5u freeze and commit, then WP5v exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Freeze and commit the proved WP5u crash-worker correction, then complete the
next bounded hosted-Windows fixture increment:
`tools/milestone-orchestrator/src/workspace-create-recovery.test.ts`, whose
failed root is created by that file's `fixture()` helper.

From the exact clean WP5u commit, reproduce the complete file under genuine
NTFS 8.3 TEMP. Add an assertion-only proof immediately after the fresh root is
created, canonicalize only that fixture-owned root, retain the assertion,
verify Windows and Linux ext4, and create one separate narrow commit.

Do not normalize caller-controlled or pre-existing paths, weaken
`inspectTarget`, alter workspace-create recovery semantics/fault points, bundle
later fixture files, run source no-argument `pnpm verify`, close CAL-1, or
claim autonomous readiness.

## Goal Constraints

- Preserve frozen authority/evaluation hashes, readiness default/marker, and
  CAL-1 `open_not_started` with zero completions.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  genuine Windows short TEMP, Linux ext4 parity, and serial Vitest
  `--fileParallelism=false`.
- Canonicalize only `workspace-create-recovery.test.ts::fixture()`'s freshly
  created root. Keep a direct assertion before Git/orchestrator setup.
  Production Git identity, workspace creation/recovery, reducer, state/schema,
  fault points, and cleanup remain byte-identical unless a separately proved
  downstream owner forces replanning.
- Give each qualifying command unique checkout, temporary, Corepack,
  dependency, telemetry, and evidence roots; share no writable roots.
- Never mutate `Implementation-ready improvement plan 8-5-26.txt`; preserve
  SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`
  and ignored `.tools/corepack-home-readonly-probe` residue.
- One cohesive commit per owner; do not push. Run Session 1 broader aggregates
  only once after all intended tracked bytes freeze.

## Baseline Evidence

- Current local HEAD before the WP5u commit is WP5t commit
  `69c10b3b6e00e0e7bf044115d3bb9e040541e484` / tree
  `f8191c7947e41573cf2cb612e6df089b61a84513`, three ahead of unchanged
  `origin/master`.
- WP5u exact baseline and assertion-only runs reproduce 0/3 with ERROR/no
  receipt. Canonicalizing only the cleanup crash-worker root produces test-only
  tree `d588906184f78bc5eccfcdd0edda64891ef2670d`, which passes 3/3 on
  Windows-short TEMP and Linux ext4.
- Historical report
  `artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
  places `workspace-create-recovery.test.ts` next at `1786995226842`: 0/5.
  Each retained failure has strict `inspectTarget()` rejecting short
  `milestone-loop-recover-create-*` versus its expanded realpath before the
  intended workspace-create recovery assertion.
- Current source proves direct ownership in that test file's `fixture()`:
  raw `mkdtemp(join(tmpdir(), "milestone-loop-recover-create-"))` becomes the
  repository root passed to `MilestoneOrchestrator.open()`.

## Steps

1. [ ] **In progress:** Freeze exactly the WP5u worker/log/next-plan paths,
       audit scope and protected identities, and create the narrow WP5u commit
       unpushed.
2. [ ] From the exact clean WP5u commit, reproduce the complete workspace-
       create recovery file under genuine short TEMP. Retain ERROR report/
       manifest and prove no PASS receipt exists.
3. [ ] In a second exact clone/tree, add only promise `realpath` plus a direct
       Vitest equality assertion beside `fixture()`'s root creator. Retain
       assertion-first ERROR evidence without changing root behavior.
4. [ ] Canonicalize only that fixture-created root with
       `realpath(await mkdtemp(...))`, retain the assertion, and run the
       complete Windows file until all five cases pass with a valid receipt.
5. [ ] Run the same complete file from a clean Linux-ext4 clone. Inspect the
       next retained failure only enough to classify independent ownership.
6. [ ] Update records, freeze/audit exact scope, create the narrow WP5v commit,
       and replace this plan with the next causal owner.

## Acceptance Criteria

- WP5u's complete file has valid 3/3 Windows-short and Linux-ext4 PASS receipts
  for the exact corrected owner tree, then commits narrowly without pushing.
- Exact clean WP5u reproduces the workspace-create recovery file's retained
  0/5 shape, or records a different actual result and replans before mutation.
  Failed commands retain ERROR manifests/reports and no PASS receipt.
- Assertion-only evidence fails directly beside `fixture()`'s creator because
  its root differs from promise realpath. After correction, the complete file
  passes 5/5 with zero skips on Windows and Linux ext4 with valid receipts.
- Only the test fixture creator changes. Production Git/workspace/recovery/
  reducer/state/schema/fault owners remain unchanged. Any downstream
  independent red remains explicit.
- One local commit per owner; tracked status returns to protected-file-only;
  immutable/lifecycle/protected identities remain exact; no push occurs.

## Verification

WP5u focused boundary:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/workspace-cleanup-recovery.test.ts --fileParallelism=false`

WP5v focused command:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/workspace-create-recovery.test.ts --fileParallelism=false`

Planned retained WP5v roots:
`artifacts/manual/wp5v-workspace-create-recovery-red/`,
`artifacts/manual/wp5v-workspace-create-recovery-owner-red/`,
`artifacts/manual/wp5v-workspace-create-recovery-windows-green/`, and
`artifacts/manual/wp5v-workspace-create-recovery-linux-green/`.

The fixture owner uses the complete affected file plus Linux parity as its
per-commit ladder. Shared checks are added only if a production/contract owner
changes. After intended Session 1 increments, freeze all tracked bytes and run
once from isolated identical candidates: `pnpm test:invariants`,
`pnpm test:orchestrator`, `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, and
`pnpm format:check`; at most two heavy aggregates overlap. Never run source
no-argument `pnpm verify`.

## Risks and Recovery

- Use a compact expanded Windows TEMP path with a distinct genuine 8.3 alias
  so intentional nested Git refs remain within Git-for-Windows' path budget.
- The recovery file injects real workspace-create faults. Preserve all hooks,
  timeouts, and serial behavior; do not mistake a newly reached downstream red
  for authorization to weaken validation.
- If correction exposes a production-created noncanonical path, retain a
  separate direct red proof and replan before changing it.
- Recovery is ordinary revert of one narrow commit; no push, ref rewrite,
  lifecycle change, or broad cleanup.

## Progress and Evidence

- 2026-08-22: WP5u exact baseline and assertion-only evidence retained 0/3
  with ERROR/no receipt; the assertion localized all cases to the cleanup
  crash-worker root.
- 2026-08-22: Creator-only WP5u tree `d5889061...` passed 3/3 with zero skips
  on genuine-short Windows and Linux ext4; receipt/artifact bindings match.
- 2026-08-22: Historical stacks and current source identify
  `workspace-create-recovery.test.ts::fixture()` as the next separate root
  owner. No WP5v code mutation has begun.

## Next Action

Format and stage only the WP5u worker, autonomy entry, and this next plan;
verify exact scope and protected identities, then create the local WP5u commit.
