# Current Execution Plan

**Status:** WP5o records complete; formatting and frozen-tree verification next
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Complete one bounded controller-portability increment for the earliest
unresolved retained failure after WP5n. Retained Windows suite ordering and an
exact-HEAD reproduction identify the retention-apply case in
`doctor.test.ts` as the next causal cluster. Correct only that controlled
real-filesystem fixture so its repository root and derived realpath fields use
one canonical spelling before the strict state schema and read-only Doctor
inspect the pending operation.

On hosted Windows, Node receives `%TEMP%` through the valid NTFS 8.3 spelling
`C:\Users\RUNNER~1\...`. `mkdtemp()` preserves that spelling, while
`realpath()` returns `C:\Users\runneradmin\...`. The fixture consequently
persists a short-form `repositoryRoot` alongside long-form
`verificationArtifactRootRealpath` and `controllerArtifactRootRealpath`.
Strict containment correctly rejects that mixed identity, so Doctor reports
invalid state instead of the expected resumable retention operation. The
equivalent local exact-HEAD reproduction uses a real 8.3 alias and fails the
same single retained assertion.

Keep an explicit owner-precondition assertion that the fixture root equals its
realpath. Prove that assertion red when applied alone to a disposable clean
HEAD clone, then canonicalize only the newly created fixture root through
`realpath(await mkdtemp(...))`. Preserve production Doctor, state schema,
retention recovery, containment, realpath, Git identity, and controller policy
unchanged.

This increment does not normalize or accept mixed production path identities,
change Windows case/alias rules, add a global test-environment override,
address the next evidence-retention or larger Git/path-spelling cascades,
address the POSIX `setsid` escape, change packages/locks/workflows, begin
CAL-1 or product work, invoke hidden validation, or claim autonomous
readiness. It creates exactly one cohesive local commit and does not push.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, every immutable-lock baseline and active hash,
  CAL-1 `open_not_started` with zero completions, readiness as the default
  profile, the permanent activation marker, the original acceptance contract,
  verifier meanings, and all retained evidence.
- Use exact Node `24.18.0` and pnpm `11.15.1`. Windows commands prepend
  `.tools/node-v24.18.0-win-x64`; Linux commands use
  `/home/duncan/.local/node-v24.18.0-linux-x64/bin` in Ubuntu WSL2.
- Keep `doctor.ts`, `schema.ts`, `retention-apply-operation.ts`,
  `path-safety.ts`, `git-isolation.ts`, and every production path/identity
  owner byte-identical.
- Preserve strict lexical and realpath containment. A real alias, junction,
  symlink, escape, substituted root, or mixed persisted production identity
  must remain rejected.
- Add a direct assertion on the fixture owner result before constructing the
  pending retention operation, so future fixture drift fails at its cause.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  user-owned untracked `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- WP5n is complete at `HEAD`
  `b86083b97f82128061d0aa40bc1b539e5cffb323`, tree
  `31ff3c8144d4e8f1991d075a78fc0857f1595289`, parent
  `69e92fc3e6d44ffa329ffd94c23c60f1bcfba0d3`. Its changed paths are exactly
  the prior plan, autonomy log, and candidate-identity test.
- Retained WP5n final audit
  `artifacts/manual/wp5n-final-audit/audit-result.json` is 23,326 bytes with
  SHA-256
  `7c5dc79ea2a8ea35f034099c1aefc7eee89c93a93484b8c434c40c42b30fe190`.
  It reports 12 manifests, 12 receipts, 12 artifacts, and zero mismatches;
  focused Linux and Windows 3/3; invariants 13/13, 7/7, 15/15, and 61/61;
  orchestrator 591/593 and unit 604/606 with the same two declared skips;
  plus passing typecheck, lint, and format.
- Live `origin/master` and the local tracking ref both remain at
  `31a9e53ab2491ead0a3c88fac0860fdab9641f3a`; initial divergence is 0 behind /
  2 ahead. No `refs/milestone-loop/*` exist. This session has not pushed and
  will not push.
- The initial worktree contained only the protected human plan. It remains
  78,574 bytes, SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- All immutable actual hashes match baseline and active values. `package.json`
  selects `readiness`; the activation marker is present; the lock records
  CAL-1 `open_not_started`, completed count zero. Windows and Linux exact
  runtimes report Node `v24.18.0` and pnpm `11.15.1`.
- The retained hosted Windows report at commit `87bd41e` orders failed suites
  beginning with Doctor at `1786995045207`, evidence retention at
  `1786995083268`, container executor at `1786995151895`, and later workspace,
  Git, artifact, and clone cascades. WP5n closed the last retained Linux
  cluster; the Windows Doctor failure is therefore next. Its test, schema,
  retention owner, and path-safety inputs remain byte-identical from the hosted
  commit through HEAD except for an unrelated WP5k Doctor production change.
- A clean no-hardlink exact-HEAD Windows clone under the pinned runtimes, with
  `%TEMP%` and `%TMP%` set to a genuine short alias whose `realpath` is the
  retained long spelling, reproduced Doctor 18/19 passed, one failed, zero
  skipped. The command exited 1 with an ERROR manifest bound to exact HEAD/tree,
  no receipt, and a clean clone. The 8,215-byte report and 9,111-byte manifest
  beneath `artifacts/manual/wp5o-windows-doctor-pre-fix/evidence/` have SHA-256
  `15ac9e70503a71228ab2c0540262efbf4b900f45cf8983fb3acc96b5824c978c`
  and `493532d0bff5c955293fc500b2829ccbc0eafccfe22dc8d11cbced6c074b3fec`.
- An assertion-only patch staged at tree
  `fa3395b684f18a264b33ab58d68327db044534a7` failed directly because
  `realpath(fixture.root) !== fixture.root`: 18/19 passed, ERROR/no receipt,
  exact one-path staged scope. Its 7,563-byte report and 9,110-byte manifest
  beneath `artifacts/manual/wp5o-windows-doctor-owner-red/evidence/` have
  SHA-256
  `15d413e7a4ddcc7a33dc20c1069bf28f55e78664176653df5ba3e22941836cfc`
  and `5423dc27530648f7d4d4a74b908c66941a3483468e7070f2654fbbe55c43b605`.

## Steps

1. [x] Read frozen authority, agent contract, plan standard, completed WP5n
       plan/log state, newest decision record, Git/live origin, retained
       evidence, immutable/lifecycle state, exact toolchains, protected
       identity, and private refs.
2. [x] Verify exact WP5n commit/tree/parent, changed paths, final-audit
       identity/totals, protected-only worktree, origin/divergence, and
       critical lifecycle state.
3. [x] Reparse retained cross-platform failure ordering and establish Windows
       Doctor retention classification as the first unresolved causal suite.
4. [x] Reproduce the complete Doctor file once from a clean no-hardlink exact-
       HEAD Windows clone under a real short-form temp root; retain structured
       ERROR/no-receipt evidence.
5. [x] Add only the direct fixture-root assertion to the disposable clone,
       stage it, and retain its expected direct red result.
6. [x] Add the direct assertion and minimal fixture-root canonicalization to
       the source Doctor test. Do not change production path, schema,
       retention, or Doctor owners.
7. [x] Run exact Windows short-temp and Linux focused Doctor diagnostics and
       independently inspect totals, manifests, receipts, and artifacts.
8. [x] Update this plan and `docs/autonomy-log.md`; no decision entry is
       required because only a controlled test-fixture precondition changes.
9. [ ] **In progress:** freeze test/plan/log, format only bounded paths, stage
       only those paths, record the candidate tree, and run fresh Linux
       focused, Windows short-temp focused, invariants, orchestrator, unit,
       typecheck, lint, and format commands serially in distinct command-owned
       evidence roots.
10. [ ] Independently recompute all receipt/artifact/manifest bytes and hashes,
        validate bindings/totals, and audit immutable hashes, lifecycle/CAL-1,
        packages/lock/workflow, readiness marker, private refs, staged
        paths/tree, live origin/divergence, protected identity, and red evidence.
11. [ ] Create exactly one narrow local commit, verify commit/tree/parent,
        changed paths, protected-only status, and live divergence, then stop
        without pushing.

## Acceptance Criteria

- Retained ordering and a clean exact-runtime Windows reproduction identify
  Doctor retention classification as the first unresolved post-WP5n causal
  cluster and retain its exact 18/19 ERROR result with no receipt.
- An assertion-only direct regression is red before correction and green
  afterward, proving the controlled fixture root is already canonical before
  it supplies repository and realpath state fields.
- The pending retention operation then classifies as `resume-delete` with the
  exact current target, while state, journal, target, and protected authority
  bytes remain unchanged by read-only Doctor inspection.
- `doctor.ts`, `schema.ts`, `retention-apply-operation.ts`, `path-safety.ts`,
  `git-isolation.ts`, production behavior, packages, lock, workflow, and every
  immutable/lifecycle file remain byte-identical.
- Exact Linux and Windows-short-path focused Doctor suites pass 19/19 with
  valid command-owned receipts. Invariants, orchestrator, unit, typecheck,
  lint, and format pass serially from one frozen candidate tree, with only the
  two declared Windows skips in aggregates.
- One narrow verified commit contains only the Doctor test, active plan, and
  autonomy record. It is not pushed; the protected untracked file remains
  byte-identical.

## Verification

All commands explicitly select Node `24.18.0` and pnpm `11.15.1`. Long
commands run separately and serially. Every successful command owns a fresh
`LOOP_VERIFY_COMMAND_ARTIFACT_DIR`; every expected failure retains an ERROR
manifest and no `result.json` receipt.

1. Red reproduction: from a clean no-hardlink exact-HEAD Windows clone, set
   `%TEMP%`/`%TMP%` to a genuine 8.3 alias whose Node `realpath` is the long
   spelling, then run `pnpm exec tsx tools/run-tool-evidence.mjs
invariant-vitest tools/milestone-orchestrator/src/doctor.test.ts
--fileParallelism=false`. Require the retained downstream failure once and
   the direct root-identity assertion failure when that assertion is staged
   alone.
2. Focused diagnostics: run the complete Doctor file through the same
   receipt-owning wrapper under exact Windows short-temp and Linux toolchains.
   Require 19/19, zero skips, exact candidate-tree binding, and independently
   matching manifest/receipt/artifact hashes.
3. Frozen candidate: format bounded tracked paths, stage only the Doctor test,
   plan, and autonomy log, record `git write-tree`, then run fresh final
   commands in order: Linux Doctor focused; Windows short-temp Doctor focused;
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

- Relaxing production path equality or containment would accept an alias or
  escape without proving identity. Keep every production owner byte-identical
  and canonicalize only the freshly created controlled fixture root.
- Canonicalizing global `%TEMP%` in the test runner would conceal which fixture
  owns the precondition and could mask later independent failures. Limit this
  increment to `repositoryFixture()` in `doctor.test.ts`.
- An assertion placed after state construction would preserve the misleading
  invalid-state cascade. Assert root identity immediately after fixture
  creation and before any persisted operation fields are derived.
- Linux `realpath(await mkdtemp(...))` is an identity-preserving no-op; both
  supported controller platforms must still run the complete focused file.
- WSL dependencies stay inside disposable ext4 clones. Never replace the
  source checkout's Windows `node_modules` with Linux links or binaries.
- If the corrected focused test changes production files, accepts an explicit
  alias/junction case, or reveals another failure in the same Doctor file,
  retain evidence and revise the plan before expanding.
- Recovery is an ordinary revert of one WP5o commit. No push, ref rewrite,
  dependency migration, recommissioning, or destructive source cleanup is
  required.

## Progress and Evidence

- 2026-08-22: Reconciled WP5n commit/audit/log state, live origin, immutable and
  lifecycle state, exact runtimes, private refs, and protected-only worktree;
  every supplied checkpoint identity matches.
- 2026-08-22: Retained ordering places Windows Doctor retention classification
  first after the closed Linux clusters. The hosted failure shape and unchanged
  inputs identify mixed 8.3/long-form fixture fields rather than production
  Doctor policy.
- 2026-08-22: A clean exact-HEAD Windows clone reproduced 18/19 with ERROR/no
  receipt under a genuine NTFS short temp spelling; an assertion-only staged
  tree then failed directly at the fixture-root realpath precondition.
- 2026-08-22: The source fixture now canonicalizes only its newly created root
  and retains the direct assertion. Named production owners are byte-identical.
  Windows under the same short alias and Linux on ext4 both passed 19/19 at
  test-only tree `c57589de1ed26e90700c6e1b1142a17b1fb986bc`, with independently
  matching command-owned receipts and artifact declarations.
- 2026-08-22: Two Linux setup attempts stopped before Vitest and produced no
  evidence root (a retained-script continuation defect, then an incomplete
  offline store). Both disposable clones cleaned; the locked store was
  hydrated and the cited exact-runtime diagnostic passed.

## Next Action

Finish the tracked records, format only bounded paths, stage exactly the Doctor
test, plan, and autonomy log, record the frozen candidate tree, and begin fresh
serial final verification without changing tracked bytes afterward.
