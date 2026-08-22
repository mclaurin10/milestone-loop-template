# Current Execution Plan

**Status:** WP5p tracked records complete; formatting and candidate freeze next
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Complete one bounded portability increment for the earliest unresolved retained
failure after WP5o. Retained Windows ordering and a clean exact-HEAD
reproduction identify the four state-first cases in
`evidence-retention.test.ts` as one fixture-owned cluster. Correct only the
controlled `applyFixture()` repository-root precondition so every lexical and
realpath field is derived from one canonical spelling before the strict state
schema validates a retention-apply intent.

On a genuine NTFS 8.3 temporary spelling, `mkdtemp()` preserves the short root
while evidence planning deliberately records realpaths for artifact roots. The
fixture supplies a short `repositoryRoot` with long artifact-root realpaths.
Strict containment correctly rejects that mixed identity at `StateStore.save`
before intent publication. The four retained failures are exactly the apply
tests that cross that boundary; other apply tests reject earlier at their
intended preflight checks.

Prove the helper defect with an assertion-only short-path run, then canonicalize
only the new fixture root through `realpath(await mkdtemp(...))` and retain the
assertion in the first successful apply case. Verify all 19 cases on Windows
short-path and Linux ext4. Preserve production retention, schema, state,
containment, canonical identity, Git isolation, and recovery behavior.

This increment does not normalize mixed production identities, change global
temporary-directory behavior, repair the separately owned container-executor
fixture or later cascades, address POSIX `setsid`, begin CAL-1/product work,
invoke hidden validation, claim readiness, or push. It creates one narrow local
commit and stops.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, all immutable baseline/active hashes, original
  acceptance meanings, readiness as default, the permanent activation marker,
  and CAL-1 `open_not_started` with zero completions.
- Use exact Node `24.18.0` and pnpm `11.15.1`: Windows selects
  `.tools/node-v24.18.0-win-x64`; Linux selects
  `/home/duncan/.local/node-v24.18.0-linux-x64/bin` in Ubuntu WSL2.
- Keep `evidence-retention.ts`, `retention-apply-operation.ts`, `schema.ts`,
  `state-store.ts`, `path-safety.ts`, `git-isolation.ts`, and every production
  owner byte-identical.
- Preserve state-first authorization, strict schemas, journal/result conflict
  handling, torn-journal recovery, lexical/realpath containment, and alias or
  substitution rejection.
- Retain a direct assertion that the controlled apply root equals its realpath
  before the first case crosses intent publication.
- Never mutate `Implementation-ready improvement plan 8-5-26.txt` in any way.
- Every command owns a fresh evidence directory and private temp/telemetry root.
  No commands or agents share writable checkouts or roots; at most two heavy
  Vitest aggregates run concurrently.

## Baseline Evidence

- Completed WP5o is HEAD `70fb23538d6664d4fd3c7e59397398cde702dd4b`,
  tree `1610ca8714a43850b7ec423c7e0119e7bf0d9930`, parent
  `b86083b97f82128061d0aa40bc1b539e5cffb323`. It changed only the prior plan,
  autonomy log, and `doctor.test.ts`.
- `artifacts/manual/wp5o-final-audit/audit-result.json` is 24,159 bytes,
  SHA-256 `4d43bc6b0b5e444db0df07346f9fbfce5ea7e4c9825940bcd1c4d829318ae6f0`.
  It records 12 manifests / 81,248 bytes, 12 receipts / 7,234 bytes, 12
  artifacts / 474,917 bytes, zero mismatches, with manifest/receipt/artifact
  digests `a602e28506409f2d68c998d75e3c00db45d0f4f6d5f1d79e0269abb68fd833d7`,
  `4a367b01949d15b52b28b7b2dfed4e4ae805cbd490e7dbe5bcfdaca6d384da`,
  and `239a53a17a5bbf0ea80962f0101266789cd01a65220a1fc2147d0347a0375530`.
- Live and tracking `origin/master` equal
  `31a9e53ab2491ead0a3c88fac0860fdab9641f3a`; initial divergence is 0 behind /
  3 ahead. No `refs/milestone-loop/*` exist and no push is authorized.
- The initial worktree contains only the protected file: 78,574 bytes, SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Immutable actual hashes equal baseline/active. `package.json` selects
  readiness; the permanent marker exists; CAL-1 is `open_not_started`, count
  zero. Package, lock, workflow, marker, and lock identities match WP5o audit.
- Retained hosted Windows report
  `artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
  is 280,492 bytes, SHA-256
  `3d51560a25552e28397f9143283a8afab39c365dd6b5ef1659fb7abcea3aa5c7`.
  It orders closed Doctor at `1786995045207`, evidence retention at
  `1786995083268` (15/19, four failures), then container executor at
  `1786995151895`. Retained Linux evidence retention is 19/19.
- A fresh no-local/no-hardlink exact-HEAD Windows clone under pinned runtimes
  and genuine short `%TEMP%`/`%TMP%` reproduced 15/19. Its report and `ERROR`
  manifest in `artifacts/manual/wp5p-windows-evidence-retention-red/evidence/`
  are 11,865 bytes / SHA-256
  `d8f5f27f39f5cbad8114742addfc6d19948de35eb0400d75f6f56c08cf33dd5c`
  and 9,137 bytes / SHA-256
  `43ea06ac5aea4109a50de97eae3c346c3c483edde83bfac0d6540f218e06d216`.
  No receipt exists; clone identity and cleanliness match. `reproduction.json`
  binds command, environment, failures, identities, and hashes. A first setup
  selected host Node 25 and was rejected before any test/evidence command; it is
  not cited.
- The assertion-only candidate staged one test at tree
  `e4e17f3d4a0348a3b2d3eca2bc39d6c49e9cc4a4` and remained 15/19, but the
  first failure moved directly to the root-realpath assertion. Its 10,809-byte
  report and 9,114-byte `ERROR` manifest have SHA-256
  `1568e376fab1a73044df2c34ca9439bb58e27a5609148d6463f1cced2a66dd52`
  and `40edd8e396916c1df641ab979fe364d94159f0f1eb8d65eb5f0f8a364658f6df`;
  no receipt exists.
- Direct trace: raw `applyFixture()` root plus realpath-derived artifact roots
  first mix at retention intent construction. Strict schema rejects before
  publication. All four failures share this helper. Container executor has a
  separate fixture owner and remains open.

## Steps

1. [x] Read frozen authority, contract, plan standard, completed WP5o records,
       newest decisions, retained evidence, Git/live origin, immutable/lifecycle
       state, toolchains, protected identity, and private refs.
2. [x] Verify supplied commit/tree/parent, audit totals, protected-only status,
       origin/divergence, retained report, readiness, CAL-1, and critical files.
3. [x] Use three isolated read-only agents for retained ordering/stacks,
       fixture/production ownership, and verification-clone topology; primary
       independently inspects the same authorities and owners.
4. [x] Reproduce the complete file once from a clean no-hardlink exact-HEAD
       Windows clone under genuine short temp; retain 15/19 `ERROR` evidence.
5. [x] Add only the root-realpath assertion in a fresh
       disposable exact-HEAD clone, stage that test alone, and retain its
       expected direct red result under the genuine short spelling.
6. [x] Add the assertion plus minimal `applyFixture()` root canonicalization to
       authoritative source. Change no production owner.
7. [x] Iterate only on the complete focused file until Windows short-path and
       Linux ext4 pass 19/19 with valid receipts. Record container executor as
       separately owned unless this exact change demonstrably repairs it.
8. [x] Update plan and `docs/autonomy-log.md`; add no decision record unless a
       durable production choice unexpectedly becomes necessary.
9. [ ] **In progress:** format bounded paths, stage exactly test/plan/log, record `git write-tree`,
       export/hash a binary cached patch, and freeze tracked bytes.
10. [ ] Materialize four independent no-local/no-hardlink clones at exact HEAD,
        apply/stage the patch, require matching `git write-tree`, no alternates,
        no unstaged tracked differences, and exact toolchains.
11. [ ] Run one frozen-tree Windows orchestrator aggregate agent, one Windows
        unit aggregate agent, one WSL/ext4 focused agent, while primary runs
        Windows genuine-short focused, invariants/components, typecheck, lint,
        and format. Use eight final roots named `wp5p-*-final/evidence`.
12. [ ] Reuse a read-only slot for evidence audit while primary independently
        audits bindings/totals/skips, immutable/lifecycle/critical identities,
        staged scope, protected file, private refs, and live origin/divergence.
13. [ ] Create one narrow local commit; verify commit/tree/parent, paths,
        protected-only status, private refs, live divergence, and no push; stop.

## Acceptance Criteria

- Exact retained and local red evidence records 15/19, the same four failures,
  `ERROR`, no receipt, command/environment/candidate bindings, and hashes.
- Assertion-only evidence fails directly before correction and passes after it,
  proving the fixture root is canonical before intent planning/publication.
- The four cases reach their intended success, forged-journal conflict,
  result-conflict, and torn-journal recovery assertions; complete focused files
  pass 19/19 on Windows short-path and Linux ext4 with valid receipts.
- Production owners, strict contracts, retention guarantees, path identity,
  packages, lock, workflow, and immutable/lifecycle files remain byte-identical.
- Container executor remains explicitly open unless the same test-only owner
  correction proves causal; no unrelated cluster is bundled.
- Invariants/components, orchestrator, unit, typecheck, lint, and format pass
  from one frozen candidate tree, with only the two declared aggregate skips
  and valid independently audited receipts/artifacts.
- One local commit contains only test, plan, and autonomy log. It is not pushed;
  protected file bytes and all identities remain exact.

## Verification

Every command asserts exact Node/pnpm, clears inherited
`MILESTONE_LOOP_TELEMETRY_RUN_ID` and `LOOP_TELEMETRY_PARENT_MANAGED`, and owns
unique `LOOP_VERIFY_COMMAND_ARTIFACT_DIR`, temp, checkout, and telemetry paths.
Red commands require `ERROR` manifest plus report and no `result.json`; exit
zero without a valid receipt is failure.

1. Assertion red and focused green command:
   `pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest
tools/milestone-orchestrator/src/evidence-retention.test.ts
--fileParallelism=false`. Windows uses a verified real 8.3 temp spelling;
   Linux uses a private ext4 `TMPDIR`. Green requires 19/19 and zero skips.
2. Frozen final roots are `wp5p-{linux-focused,windows-focused,invariants,
orchestrator,unit,typecheck,lint,format}-final/evidence`. Commands are
   `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
   `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, plus the two focused
   commands. Do not alter prescribed serial semantics or shard aggregates.
3. Clone procedure: authoritative unstaged tracked diff must be empty; capture
   HEAD, staged paths, `git write-tree`, and a binary cached patch. Each clone
   is `git clone --no-local --no-hardlinks --no-checkout`, detaches exact HEAD,
   applies/stages its private patch, matches the frozen tree, has no alternates
   or unstaged diff, installs offline/frozen/copy from the pinned source store,
   and reasserts identity before and after its command.
4. Final audit enumerates every manifest/receipt/artifact, recomputes byte counts
   and SHA-256, checks declarations, bindings, toolchains, expected totals and
   skips, derives ordered manifest/receipt/artifact digests, and writes one
   ignored audit result. Primary separately audits repository/lifecycle/origin.

Any test semantic change invalidates focused evidence; any tracked change after
freeze invalidates all final PASS receipts. Final tracked plan/log wording
freezes before final commands; outcomes remain in ignored evidence and handoff.

## Risks and Recovery

- Production normalization would weaken fail-closed identity. Canonicalize only
  the fresh controlled fixture root; keep production byte-identical.
- A global temp override hides ownership. Limit change to `applyFixture()`.
- Assertion inside the helper would create duplicate red failures. Put it in
  the first state-first case for the direct red proof.
- Container executor also uses `mkdtemp()` but has another owner/message; a
  test-only file change cannot repair it. Leave it open.
- WSL dependencies remain in disposable ext4 clones; never replace authoritative
  Windows `node_modules`. Keep at most two heavy aggregates concurrent.
- Recovery is ordinary revert of one commit. No push, ref rewrite, dependency
  migration, state mutation, or destructive source cleanup is required.

## Progress and Evidence

- 2026-08-22: Reconciled completed WP5o and every supplied live checkpoint;
  supplied identities match.
- 2026-08-22: Parallel read-only audits and primary tracing place evidence
  retention next and prove one shared apply-fixture precondition.
- 2026-08-22: Clean exact-HEAD short-path Windows reproduction produced 15/19,
  four exact failures, `ERROR`, no receipt, and retained hashes.
- 2026-08-22: Assertion-only tree `e4e17f3d4a0348a3b2d3eca2bc39d6c49e9cc4a4`
  failed directly at the fixture-root precondition with one staged path,
  `ERROR`, no receipt, and the same 15/19 totals.
- 2026-08-22: Canonicalizing only `applyFixture()` and retaining the assertion
  produced test-only tree `35f950dba9f41675493817f3a442c9a32f35694f`.
  Exact Windows under a genuine short temp and Linux from an ext4 clone both
  passed 19/19 with valid command-owned receipts and matching declarations.
  Container executor imports no changed owner and uses a separate fixture, so
  its retained cluster remains explicitly open.

## Next Action

Write the bounded WP5p autonomy record, finish plan status, format only the
three intended tracked paths, stage them, and freeze one candidate tree before
materializing independent verification clones.
