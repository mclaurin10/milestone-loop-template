# Current Execution Plan

**Status:** WP5n records complete; formatting and frozen-tree verification next
**Updated:** 2026-08-21
**Owner:** autonomous loop

## Objective

Complete one bounded controller-portability increment for the earliest
unresolved retained Linux failure after WP5m. Retained suite ordering and a
clean exact-HEAD Linux reproduction identify `candidate-identity.test.ts` as
the next cluster. Correct only its real-repository fixture so a committed
mode-only change is materialized consistently before the test asks the shared
Git inspection owner to distinguish a clean candidate from a later untracked
write.

The causal defect is test-fixture state, not candidate-identity policy. On a
POSIX repository with `core.filemode=true`, `git update-index --chmod=+x`
followed by `git commit` records `100755` in the committed tree but leaves the
existing worktree file at `100644`. The fixture therefore constructs
`modeIdentity` with `clean:false`; creating `dirty.txt` leaves the later
identity at the same value, so there is no differing `clean` field. Windows
uses `core.filemode=false`, masking the incomplete fixture materialization.

Add an explicit owner-level assertion that the post-mode identity is clean,
prove that assertion red when applied alone to a clean exact-HEAD Linux clone,
then make the fixture materialize the committed executable mode through the
filesystem before inspection. Preserve production identity fields, digest
framing, Git inspection, cleanliness policy, controller boundaries, and all
other tests unchanged.

This increment does not alter production candidate identity or Git isolation,
accept dirty candidates, ignore untracked paths, normalize identities, change
controller policy, address later Windows path-spelling/identity cascades or
the POSIX `setsid` escape, change packages/locks/workflows, begin CAL-1 or
product work, invoke hidden validation, or claim autonomous readiness. It will
create exactly one cohesive local commit and will not push.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, every immutable-lock baseline and active hash,
  CAL-1 `open_not_started` with zero completions, readiness as the default
  profile, the permanent activation marker, the original acceptance contract,
  verifier meanings, and retained evidence.
- Use exact Node `24.18.0` and pnpm `11.15.1`. Windows commands prepend
  `.tools/node-v24.18.0-win-x64`; Linux commands use
  `/home/duncan/.local/node-v24.18.0-linux-x64/bin` in Ubuntu WSL2.
- Keep `candidate-identity.ts` and `git-isolation.ts` byte-identical. The
  existing `inspectAttempt` status command must continue to include all
  untracked files and fail closed on any dirty status.
- Preserve the committed mode-only tree change and its mode-sensitive raw-diff
  digest. Only align the controlled fixture worktree mode with the committed
  index mode before measuring the clean identity.
- Add a direct assertion on the shared owner result (`modeIdentity.clean`) so
  future fixture drift fails at its cause instead of at the later differing-
  fields expectation.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  user-owned untracked `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- WP5m is complete at `HEAD`
  `69e92fc3e6d44ffa329ffd94c23c60f1bcfba0d3`, tree
  `8b8cde4728fbe0f186efed117a77a7cd8ead6324`, parent
  `31a9e53ab2491ead0a3c88fac0860fdab9641f3a`. Its four changed paths are
  exactly the worked-example descriptor/test, prior plan, and autonomy log.
- Retained WP5m final audit
  `artifacts/manual/wp5m-final-audit/audit-result.json` is 16,387 bytes with
  SHA-256
  `0f9553e13ebeeef05a1aa3b38328d16c3d9098bafff2b85793daaea272d43341`.
  It reports 12 manifests / 81,274 bytes, 12 receipts / 7,251 bytes,
  12 artifacts / 469,103 bytes, zero mismatches, Linux and Windows focused
  10/10, invariants 13/13, 7/7, 15/15, and 61/61, orchestrator 591/593 and
  unit 604/606 with only the two declared POSIX-only skips, plus passing
  typecheck, lint, and format.
- Both the local tracking ref and live `git ls-remote` name
  `origin/master` at exact WP5m parent `31a9e53`; current divergence is
  0 behind / 1 ahead. No private `refs/milestone-loop/*` exist. This session
  has not pushed and will not push.
- The worktree initially contained only the protected human plan. Its identity
  matches the supplied checkpoint: 78,574 bytes, SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- All four immutable actual hashes equal their baseline and active values.
  `package.json` selects `readiness`; the activation marker is present; the
  lock records CAL-1 `open_not_started`, completed count zero.
- Retained hosted Linux report
  `artifacts/hosted/run-32060615125/controller-linux-87bd41e/orchestrator/orchestrator-report.json`
  is 214,181 bytes with SHA-256
  `a6e7cc9d098dc52327b10ffdf33067c06dbf8eb18a73cae8033b0d902339e188`.
  Failed suites started at Doctor `1786995000003`, process supervisor
  `1786995022223`, worked example `1786995133398`, and candidate identity
  `1786995183453`. WP5k, WP5l, and WP5m close the first three clusters. The
  candidate owner, test, Git-isolation owner, and `.gitignore` blobs are
  byte-identical from hosted commit `87bd41e` through current HEAD.
- A clean no-hardlink ext4 clone of exact WP5m under Linux Node `v24.18.0`,
  pnpm `11.15.1`, and Git `2.43.0` reproduced candidate identity 2/3 passed,
  one failed, zero skipped. The exact retained assertion is `expected [] to
deeply equal [ 'clean' ]`. The command exited 1 with an ERROR manifest bound
  to exact commit/tree, no receipt, a clean post-run clone, and confirmed
  temporary-root cleanup. Evidence is retained beneath
  `artifacts/manual/wp5n-linux-candidate-identity-pre-fix/`. The shard ran
  once; its evidence succeeded, while a post-run shell predicate had a quoting
  defect and was finalized separately without rerunning the shard.
- Exact cross-platform Git probes show the cause. Linux records index/tree mode
  `100755`, worktree mode `100644`, `core.filemode=true`, and an immediate
  `.M` status after the mode commit; adding `dirty.txt` produces `.M` plus `?`.
  Materializing mode `0755` removes only `.M`. Windows records the same
  `100755` tree but `core.filemode=false`, so the post-commit status begins
  clean and the untracked write alone changes it. `dirty.txt` is not ignored on
  either platform. The structured probes are retained beside the red shard.

## Steps

1. [x] Read frozen authority, agent contract, plan standard, completed WP5m
       plan/log state, newest decision records, Git/live origin, retained
       evidence, immutable/lifecycle state, exact toolchains, protected
       identity, and private refs.
2. [x] Verify exact WP5m commit/tree/parent, changed paths, final-audit identity
       and totals, protected-only worktree, origin/divergence, and critical
       package/lock/workflow identities.
3. [x] Reparse retained failure ordering and prove candidate-identity owner,
       test, Git owner, and ignore inputs are unchanged since the hosted run.
4. [x] Reproduce only the candidate-identity shard from a clean no-hardlink
       exact-HEAD Linux clone under the pinned runtimes; retain structured
       ERROR/no-receipt evidence and cleanup proof.
5. [x] Compare exact Linux and Windows mode transitions and establish that the
       already-dirty POSIX fixture, not ignored-file behavior or production
       identity policy, causes the missing field delta.
6. [x] Add only the explicit `modeIdentity.clean` owner
       assertion to a disposable exact-HEAD Linux clone, stage it, and retain
       its expected direct red result with ERROR/no receipt.
7. [x] Add the minimal fixture mode materialization in the source test. Do not
       change production code or Git/identity policy.
8. [x] Run exact Linux and Windows focused candidate-identity diagnostics and
       independently inspect totals, manifests, receipts, and artifacts.
9. [x] Update this plan and `docs/autonomy-log.md`; no decision
       entry is required because only a test fixture precondition changes and
       production policy remains byte-identical.
10. [ ] **In progress:** freeze test/plan/log, format only bounded paths, stage only those
        paths, record the candidate tree, and run fresh Linux focused plus
        Windows focused, invariants, orchestrator, unit, typecheck, lint, and
        format commands serially in distinct command-owned evidence roots.
11. [ ] Independently recompute all receipt/artifact/manifest bytes and
        SHA-256 values, validate bindings/totals, and recheck immutable hashes,
        lifecycle/CAL-1, package/lock/workflow identities, readiness marker,
        private refs, staged paths/tree, live origin/divergence, protected
        identity, and retained red evidence.
12. [ ] Create exactly one narrow local commit, verify commit/tree/parent,
        changed paths, protected-only status, and live divergence, then stop
        without pushing.

## Acceptance Criteria

- Retained ordering and a clean exact-runtime Linux shard identify candidate
  identity as the first unresolved post-WP5m controller cluster and retain its
  exact 2/3 ERROR result with no receipt.
- An assertion-only direct owner regression is red before correction and green
  afterward, proving the mode-only identity is clean before the untracked write
  and the later identity differs only in `clean`.
- The committed mode-only tree and changed-entry digest remain distinct from
  the content identity on both platforms. The fixture explicitly aligns the
  POSIX worktree mode; `dirty.txt` remains visible as an untracked path.
- `candidate-identity.ts`, `git-isolation.ts`, production controller behavior,
  schemas, policies, packages, locks, workflow, and immutable/lifecycle files
  remain byte-identical.
- Exact Linux and Windows focused suites pass 3/3 candidate tests with the new
  direct owner assertion and
  valid command-owned receipts. Invariants, orchestrator, unit, typecheck,
  lint, and format pass serially from one frozen candidate tree, with only the
  two declared Windows skips in aggregates.
- One narrow verified commit contains only the candidate identity test, active
  plan, autonomy record, and a decision record only if strictly necessary. It
  is not pushed; the protected untracked file remains byte-identical.

## Verification

All commands explicitly select Node `24.18.0` and pnpm `11.15.1`. Long
commands run separately and serially. Every successful command owns a fresh
`LOOP_VERIFY_COMMAND_ARTIFACT_DIR`; every expected failure retains an ERROR
manifest and no `result.json` receipt.

1. Assertion-only red: create a clean no-hardlink ext4 clone of exact WP5m,
   apply and stage only the explicit owner assertion, run
   `pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest
tools/milestone-orchestrator/src/candidate-identity.test.ts
--fileParallelism=false`, and require the new direct assertion to fail with
   the exact dirty POSIX mode facts.
2. Focused diagnostics: run the same complete file through the receipt-owning
   wrapper under exact Linux and Windows toolchains. Require 4/4, zero skips,
   exact candidate-tree binding, and independently matching manifest/receipt/
   artifact hashes.
3. Frozen candidate: format bounded tracked paths, stage only the test, plan,
   and autonomy log, record `git write-tree`, then run fresh final commands in
   order: Linux candidate focused; Windows candidate focused;
   `pnpm test:invariants`; `pnpm test:orchestrator`; `pnpm test:unit`;
   `pnpm typecheck`; `pnpm lint`; `pnpm format:check`. Each uses a distinct
   fresh evidence root and no tracked bytes change between commands.
4. Final audit: independently parse Vitest totals and every manifest/receipt,
   recompute each declared artifact byte count and SHA-256, verify bindings and
   aggregate digests, then audit source/protected/immutable/lifecycle/package/
   lock/workflow identities before and after the no-push commit.

Evidence invalidation: any test semantic change invalidates focused evidence;
any later tracked change invalidates every frozen-candidate PASS. Final plan
and log text freeze before final commands; final outcomes remain in ignored
command evidence and the handoff so the candidate tree does not move.

## Risks and Recovery

- Changing production cleanliness semantics would conceal a dirty candidate.
  Keep both production owner files byte-identical and repair only the
  controlled fixture precondition.
- An assertion placed only after the untracked write would preserve the
  misleading cascade. Assert `modeIdentity.clean` immediately after the mode
  commit, then retain the existing exact differing-fields assertion.
- A Git reset/checkout could hide unintended fixture content changes. Prefer a
  narrow filesystem mode update on the single controlled file, then let the
  real owner prove cleanliness and mode-sensitive tree/digest behavior.
- Windows does not enforce POSIX execute bits through `core.filemode`; the
  fixture correction must be harmless there and both supported platforms must
  retain the same committed tree identity.
- WSL dependencies stay inside disposable ext4 clones. Never replace the
  source checkout's Windows `node_modules` with Linux links or binaries.
- If the assertion-only clone does not fail at the direct clean precondition,
  the focused correction changes another identity field, or any broader
  regression appears, retain evidence and revise the plan before expanding.
- Recovery is an ordinary revert of one WP5n commit. No push, ref rewrite,
  dependency migration, recommissioning, or destructive source cleanup is
  required.

## Progress and Evidence

- 2026-08-21: Reconciled the completed WP5m commit, autonomy entry, final audit,
  live origin, critical identities, and protected-only worktree with the
  supplied checkpoint. Every expected identity matches.
- 2026-08-21: Reparsed the retained hosted report. With WP5k/WP5l/WP5m closed,
  candidate identity is next by exact suite start time; all four relevant
  owner/test/config blobs remain identical to the hosted revision.
- 2026-08-21: A clean exact-WP5m Ubuntu clone under Node `v24.18.0` and pnpm
  `11.15.1` reproduced the exact 2/3 candidate failure with ERROR/no receipt,
  clean source, and confirmed cleanup. No shard retry occurred.
- 2026-08-21: Exact Linux/Windows probes established the platform difference:
  the POSIX mode commit leaves a `100644` worktree against the committed
  `100755` index, while Windows ignores file-mode drift. Materializing only the
  POSIX execute mode restores the intended clean-then-untracked transition.
- 2026-08-21: An assertion-only patch staged at tree `4ad410fa0082ae02f238ad052f84167db0bd7bcd`
  failed directly at `modeIdentity.clean` with 2/3 passed, ERROR/no receipt,
  exact one-path scope, and confirmed cleanup. The 2,068-byte reproduction
  record has SHA-256
  `cdcf6795ab468f27686b4eb91049189fc0e8165e860e553ee888c4a3fa7b76c6`.
- 2026-08-21: The source test now materializes the controlled file at mode
  `0755` after the mode-only commit and asserts the resulting shared-owner
  identity is clean. Production candidate identity and Git inspection files
  are untouched. Exact Linux and Windows diagnostics at test-only tree
  `28b8e7e61e02f1ae5e9771c66f4c9df0d9b821f3` each passed 3/3 with valid
  receipts and independently matching artifact bindings. Linux report/
  receipt/manifest SHA-256 values are
  `830fc046e5337a439ac1d3338aaeac806631e2fb2b2af9fabff56bc3bcecf951`,
  `5b5a5bdfa2d5083b6237f7a5bfc4e57b26a1c657e5058ddc61ec9adbf10e28d4`,
  and `0ef1269d76d176b7b892c882ab5425481fedaf6b30859ac22d5d5c9c7aa0faa9`;
  Windows values are
  `fb23027e2ebc2ba611ef567c7cceb0fa9fa8d65bb4655f6e30dd31e6cfce16aa`,
  `6341d2543ab31370d2698a1d54dc5e1d1d8e0a834827e745101cd1c566c13563`,
  and `7c8d3b33b06b8f601c0b5dbea70d933d27830fad08798a39327d523473e1137c`.

## Next Action

Run pinned Prettier on only the three bounded tracked paths, stage exactly
those paths, record the frozen candidate tree, and begin fresh final
verification without changing tracked bytes afterward.
