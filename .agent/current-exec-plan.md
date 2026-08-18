# Current Execution Plan

**Status:** WP5k timeout-only harness correction focused-green; third frozen-tree verification in progress
**Updated:** 2026-08-18
**Owner:** autonomous loop

## Objective

Complete one causal, cohesive WP5k increment for the earliest Linux controller
failure retained from Exact runtime CI run `32060615125`. On POSIX, inspecting
the retired file-lease guard below a configured ancestor that is a regular file
raises `ENOTDIR`; Windows reports the same unreachable leaf as absent. Make the
two read-only path observers involved in that Doctor case classify only
`ENOENT` and `ENOTDIR` as an unreachable leaf: the configured-path walker must
continue upward to report the exact nearest file, and the legacy-guard reader
must report no leaf. Mutation remains fenced by contained-directory validation
and the exact guard check. Add direct owner-level regression coverage, prove
the original Linux failure red then green under the exact toolchain, run
applicable serial verification with command-owned evidence, independently
audit all bindings, and create one narrow local commit without pushing.

This increment does not address the later process-supervision, worked-example
payload-identity, candidate-identity, or Windows controller path-spelling
clusters. It does not change lease ownership/ref semantics, create a legacy
guard during inspection, weaken unsafe-path diagnosis, alter packages or
lockfiles, modify CI workflow scheduling, change commissioning/readiness/
verifier meanings, begin CAL-1 or product work, or claim autonomous readiness.
Final verification exposed a pre-existing recurring test-only timeout in the
workspace-diagnostics cleanup case. Under the regression rule, feature work
remains stopped while this same increment removes only that flaky harness
budget; production cleanup behavior and every semantic assertion remain out of
scope and unchanged.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, all immutable-lock baseline/active meanings,
  CAL-1 `open_not_started`, readiness default profile and permanent marker,
  original acceptance contract, exact verifier semantics, and completed
  evidence.
- Preserve exact Node `24.18.0` and pnpm `11.15.1`. Windows commands put
  `.tools\node-v24.18.0-win-x64` first on `PATH`; Linux reproduction/focused
  verification uses `/home/duncan/.local/node-v24.18.0-linux-x64` in Ubuntu
  WSL2 and the pinned pnpm invocation.
- Read-only inspection may treat `ENOTDIR` as absence only while walking an
  unreachable configured descendant or reading the unreachable legacy guard
  leaf. The configured-path Doctor check must remain `block /
  configured-path-unsafe` and retain the exact nearest-file facts;
  non-missing filesystem errors must still propagate or produce the existing
  fail-closed unsafe diagnostic, as owned by each observer.
- Mutation must continue to validate/create the guard parent through
  `ensureContainedDirectory`, require the exact serialized guard before ref
  publication, and leave both the obstructing ancestor and private lease ref
  untouched on failure.
- Preserve `refs/milestone-loop/controller-lease` ownership, CAS, release,
  stale-owner, schema, status/Doctor output, and legacy conflict semantics.
- The cleanup test's timeout is not an acceptance performance threshold. Any
  adjustment must retain the exact real filesystem/Git path and all archive,
  deletion, diff, state, and preservation assertions; it may only provide
  stable Windows scheduling/filesystem headroom below the one-hour wrapper.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Resume audit fetched live `origin/master`: local `master`, `HEAD`, and origin
  are `b04d33a6869645ea4d847af7991831b249e2f882`, tree
  `25f0c9d16c4160758161aa3aea96af0bd2e7b5a6`, parent
  `87bd41e072a9e49baf212dc803ead83acbdabb92`, at 0 ahead / 0 behind. The
  protected human plan is the sole untracked path before this plan update.
- WP5j's stale pre-verification checklist was corrected from its committed
  evidence: isolated smoke 4/4, focused 4/4, invariants 13/13 + 7/7 + 15/15 +
  61/61, orchestrator 588/590, unit 601/603, typecheck/lint/format PASS, and an
  independent 13-receipt / 13-artifact / 464,155-byte / 13-binding audit with
  zero mismatches.
- A human-side publication occurred after the prior handoff; this agent did
  not push it. Exact run `32073770072` exists for `b04d33a`: both fresh-adopter
  jobs and trusted-container Linux passed, while both controller jobs failed.
  Current controller-Linux artifact metadata is ID `9302741125`, 49,143 ZIP
  bytes, SHA-256
  `d68d14263122ee7afc45b405d5eb5c87482fce9b75c65d4eecc14b2528686e75`.
- The retained controller-Linux JSON from run `32060615125` has SHA-256
  `6a412b868209902e54a014f8e5c3ea57a9abec1f7f7570a315bb48b4b6e75e8e`
  for its complete job log and reports 578/588 passed, 9 failed, 1 skipped.
  Failed-suite start times prove causal order: Doctor `1786995000003`, process
  supervisor `1786995022223`, worked example `1786995133398`, candidate
  identity `1786995183453`. Doctor is therefore the first recorded failure.
- The exact hosted Doctor stack is `lstat -> readLegacyPath ->
  ControllerLease.inspect -> controllerLeaseCheck -> runDoctorDiagnostic`; its
  `lstat(.../state/controller.lease)` throws POSIX `ENOTDIR`. The existing
  Doctor test expects the separate configured-path check to block rather than
  crash.
- The local clean-commit WSL reproduction used Node `v24.18.0`, pnpm `11.15.1`,
  Linux x64, and the receipt-owning Doctor shard. It reproduced exactly 18/19
  passed and one ENOTDIR failure with ERROR manifest/no receipt, preserved
  clean source identity, and removed its disposable clone. Structured evidence
  is `artifacts/manual/wp5k-linux-enotdir-pre-fix/reproduction.json` (2,532
  bytes, SHA-256
  `b3c37c446d154b63562f3df140e26486a612269c02b0fd756a29aaf7a0913017`);
  its report is 7,967 bytes / SHA-256
  `ecc091c2265ef2366f6c3576d3de50c1f30b44dc58e577a23eb6631182ee76f6`.
- All four immutable actual hashes equal baseline and active values. The
  default profile is `readiness`, `.agent/readiness-profile-activated.json` is
  present, and CAL-1 remains `open_not_started`.
- The protected plan remains 78,574 bytes with SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.

## Steps

1. [x] Audit authority/plan/logs, Git/origin, protected file, immutable hashes,
       lifecycle/CAL-1 state, retained WP5j evidence, and the current hosted
       run; correct the stale WP5j plan state.
2. [x] Parse retained controller-Linux suite start times and failure stacks;
       select Doctor ENOTDIR as the earliest causal failure without relabeling
       later clusters.
3. [x] Reproduce the exact failure in a clean disposable Linux clone under
       pinned Node/pnpm; retain report, ERROR manifest/no-receipt disposition,
       toolchain identity, source identity, hashes, and cleanup proof.
4. [x] Add a direct `ControllerLease.inspect` regression for
       an unreachable legacy guard below a regular-file ancestor. Require
       read-only absent-guard classification, unchanged ancestor bytes, absent
       private ref, and continued mutation refusal; demonstrate it red on
       Linux before the production fix.
5. [x] Change only the legacy-path reader and Doctor's
       configured-path metadata walker to accept POSIX `ENOTDIR` alongside
       `ENOENT`, with an explicit portability rationale; retain all other error
       handling and every mutation fence.
6. [x] Run receipt-owning affected Doctor/lease shards under exact Linux and
       Windows toolchains; correct only defects inside this boundary.
7. [x] Freeze and exercise two candidate trees. Reject the first on format;
       apply only pinned formatting. Reject the second when the full
       orchestrator rerun reproduces the recurring cleanup-test timeout;
       retain every non-passing manifest without a receipt.
8. [x] Raise only that test's non-semantic timeout from 30 to 60
       seconds, document the 98-sample / four-timeout evidence, and require
       three serial receipt-owning focused-file passes before another freeze.
9. [ ] **In progress:** freeze the corrected plan/log/tests/source, stage only bounded paths,
       and rerun fresh Linux/Windows focused, invariants, orchestrator, unit,
       typecheck, lint, and format commands separately and serially.
10. [ ] Independently audit every final receipt, manifest, artifact, byte/hash
       binding, test total, skip, candidate identity, source diff, immutable/
       lifecycle/package/lock/workflow identities, private refs, retained
       evidence, and protected-plan identity.
11. [ ] Update `docs/autonomy-log.md`; update `docs/decision-log.md` only if a
       durable decision beyond the narrow POSIX portability interpretation was
       made. Create one cohesive local commit and do not push.

## Acceptance Criteria

- Retained hosted evidence and the exact local Linux reproduction identify the
  same earliest ENOTDIR stack and keep all later controller clusters open.
- A new owner-level regression is red before the fix on Linux and green after
  it. Inspection reports absent legacy guard/no owner without writing any path
  or private ref; acquisition still rejects the unsafe parent and preserves
  both filesystem and ref state.
- The existing Doctor case completes with `configuredPaths.status = block`,
  `code = configured-path-unsafe`, the same nearest ancestor/kind facts, and no
  state mutation on Linux and Windows.
- Only `ENOENT` and `ENOTDIR` are classified as an unreachable leaf by the two
  affected read-only observers. Invalid legacy leaf types/content remain
  conflicts, and unrelated filesystem failures retain their existing
  fail-closed handling.
- Exact Linux and Windows focused shards pass with command-owned receipts and
  independently verified artifacts. Windows broad aggregates pass with zero
  failures and only the two declared POSIX process-group skips; invariants,
  typecheck, lint, and format pass.
- The real cleanup test passes three consecutive focused-file runs under the
  exact Windows toolchain with its semantic assertions unchanged. Its timeout
  remains bounded at 60 seconds; no retry, skip, conditional, mock, or product
  behavior change is introduced.
- No package, lock, workflow, authority, acceptance, readiness/profile,
  commissioning, verifier, schema, generated-adopter, OCI, product, or
  unrelated controller change occurs.
- One narrow verified commit contains only the lease reader, regression,
  active plan, autonomy record, and any strictly necessary documentation. It
  is not pushed and the protected untracked file remains byte-identical.

## Verification

All commands use exact Node `24.18.0` and pnpm `11.15.1`. Long commands run
separately and serially into fresh command-owned evidence roots.

1. Retained pre-fix Linux reproduction:
   `artifacts/manual/wp5k-linux-enotdir-pre-fix/run.sh` against exact clean
   `b04d33a`; independently validate its structured report/manifest/toolchain,
   absent receipt, source identity, and cleanup.
2. Red owner regression: materialize a disposable Linux clone of exact HEAD
   plus only the new test, run receipt-owning `invariant-vitest` for
   `controller-lease.test.ts` and `doctor.test.ts`, and require the original
   and owner-level ENOTDIR failures with ERROR manifest and no receipt.
3. Diagnostic focused commands after the fix on Linux and Windows through
   `tools/run-tool-evidence.mjs invariant-vitest`, targeting both affected test
   files with `--fileParallelism=false`.
4. Run three serial receipt-owning focused executions of
   `orchestrator-cleanup.test.ts` after the timeout-only correction; audit each
   report/receipt/manifest and exact target-test duration.
5. From the frozen staged candidate, repeat exact Linux focused verification,
   then run Windows focused verification, `pnpm test:invariants`,
   `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`,
   and `pnpm format:check`, each with a distinct fresh
   `LOOP_VERIFY_COMMAND_ARTIFACT_DIR`.
6. Independently parse final Vitest totals and manifests, recompute every
   declared artifact/receipt byte count and SHA-256, verify manifest bindings,
   and audit Git/protected/immutable/lifecycle/package/lock/workflow identities
   before and after the no-push commit.

Evidence invalidation: any lease-reader/test semantic change invalidates Linux
and Windows focused evidence; any later tracked change invalidates the frozen
candidate broad evidence. Final plan/log text freezes before final commands;
outcomes remain in ignored evidence and the handoff rather than altering the
tree they verify.

## Risks and Recovery

- Treating `ENOTDIR` as generic success could hide an unsafe configured parent.
  Keep the change inside `readLegacyPath` and the configured-path ancestor
  walker: the latter must walk to and classify the parent file, while mutation
  independently runs `ensureContainedDirectory` before guard publication.
- A raced parent substitution during acquisition can make the guard leaf
  unreachable. Returning absence remains fail-closed because the subsequent
  exact-guard comparison refuses acquisition; the regression must preserve
  absent ref and ancestor bytes.
- Windows alone cannot prove this bug because its filesystem API returns
  `ENOENT` for the same shape. Linux red/green evidence is mandatory; Windows
  focused and broad runs guard against cross-platform regression.
- WSL dependency materialization must stay in a disposable ext4 clone; never
  replace the source checkout's Windows `node_modules` with Linux symlinks or
  binaries.
- The cleanup test performs real clone/archive/delete work and has four
  retained timeouts among 98 samples at the old 30-second boundary. A 60-second
  budget gives observed Windows filesystem variance headroom without changing
  the semantic pass condition; any 60-second breach remains a real failure,
  not a retry trigger.
- Recovery is an ordinary revert of one WP5k commit. No push, ref rewrite,
  recommissioning, schema migration, dependency update, or destructive source
  cleanup is required.

## Progress and Evidence

- 2026-08-18: Verified the handoff against live repository state. All expected
  commit/tree/parent, immutable, lifecycle, CAL-1, retained evidence, and
  protected-file identities matched except the anticipated remote divergence:
  `origin/master` had since advanced to `b04d33a`, yielding 0/0 divergence.
- 2026-08-18: Located exact hosted run `32073770072` for the externally pushed
  WP5j commit. Both fresh-adopter jobs now pass natively; both controller jobs
  remain failed. No push was performed in this session.
- 2026-08-18: Corrected WP5j's stale checklist from its committed final
  evidence before selecting the next increment.
- 2026-08-18: Parsed all retained Linux failures and their recorded start
  times. The Doctor ENOTDIR suite predates the process, worked-example, and
  candidate-identity suites and is the bounded WP5k cause.
- 2026-08-18: Reproduced the exact one-test failure under clean-commit Linux
  Node/pnpm, retained structured ERROR/no-receipt evidence, independently
  rehashed it, and confirmed disposable-clone cleanup.
- 2026-08-18: Added the direct lease-owner regression and materialized exact
  `b04d33a` plus only that 1,868-byte test patch in a disposable Linux clone.
  The receipt-owning two-file shard was red at 34/36 passed with exactly two
  ENOTDIR failures (owner and Doctor), an ERROR manifest, no receipt, unchanged
  base identity, and confirmed cleanup. The 3,571-byte structured record at
  `artifacts/manual/wp5k-linux-owner-regression-red/reproduction.json` has
  SHA-256
  `40d928bf18be9cd7caaf8c74a5633c29005e97945ffa6fdbaab9aa4bced68a99`;
  its 14,249-byte report has SHA-256
  `5f6b7532e6503481113e10af7383c2bd830705cca820462056e40f44f463cd1c`.
- 2026-08-18: The first corrected Linux diagnostic proved the lease-owner test
  green and advanced the Doctor case past its original crash, but finished
  35/36 because `existingMetadata` also treats POSIX `ENOTDIR` as opaque. Its
  outer fail-closed catch consequently returned no nearest path instead of
  walking to `artifacts/orchestrator` and classifying that regular file. The
  ERROR manifest retained no receipt. The 13,463-byte report at
  `artifacts/manual/wp5k-linux-focused-diagnostic-1/failure-evidence/invariant-vitest-report.json`
  has SHA-256
  `a28f8e7e359b496b93aeff2398dbcf39fddb5705d2c15db33ef68f6e8b28a5f1`.
  The active scope now includes that second read-only observer; no mutation or
  unrelated Doctor logic is added.
- 2026-08-18: `existingMetadata` now gives POSIX `ENOTDIR` the same
  ancestor-walk meaning as Windows `ENOENT`; `readLegacyPath` gives both codes
  absent-leaf meaning. Every other error path and mutation fence is unchanged.
  The exact Linux diagnostic then passed 36/36 across four reported suites and
  independently matched one receipt, one artifact, and one manifest binding
  with zero mismatches. Its 1,525-byte summary at
  `artifacts/manual/wp5k-linux-focused-diagnostic-1/result-summary.json` has
  SHA-256
  `49030803e8868a26f859b4585890b29fcda89b1b1c1b33941286a44f8a22df7d`;
  the 12,523-byte report has SHA-256
  `3ad67c4082e65ce5ca3200f4bc6617bec9dc246bf49fb51e5c6b47d3f03cf46c`.
- 2026-08-18: The post-change exact Windows diagnostic also passed 36/36
  across four reported suites. Independent audit matched its 651-byte receipt
  and 12,498-byte artifact to the manifest with zero mismatches; report
  SHA-256 is
  `35a2326793e320608282c1692c8c659ab7956f4cea8c63a8f61a41d5b03338f3`.
- 2026-08-18: The first frozen staged tree
  `f1d4eea454acfe614ef5001503940df40f4328ba` passed exact Linux focused
  36/36, Windows focused 36/36, all four invariant commands, orchestrator
  589/591 with only two declared skips, unit 602/604 with the same skips,
  typecheck, and lint. Final format correctly rejected one style issue in
  `controller-lease.test.ts`; its ERROR manifest retained no receipt and has
  SHA-256
  `9f99fc2c7eef6e0fac56428349e3a9bc72131c4141fef649f28f87f4ea25022f`.
  Formatting that tracked test invalidates every first-tree PASS for final
  citation, so none will be reused after the next freeze.
- 2026-08-18: The formatted second tree
  `f8219ed79d5327ebe528d2015839eb83e16db012` passed format, exact Linux and
  Windows focused 36/36, invariants, typecheck, and lint. Its full orchestrator
  rerun then rejected the tree at 588/591 passed, one failed, two declared
  skips: the unchanged real cleanup assertion exceeded its explicit 30-second
  budget at 30,173.705 ms. The 207,946-byte report at
  `artifacts/manual/wp5k-orchestrator-final-r2/orchestrator-report.json` has
  SHA-256
  `ca753467c212df610fca2f061a19eac0394060d6e22ea21ca28035fb22f035b3`;
  the ERROR manifest retained no receipt.
- 2026-08-18: An audit of 98 retained reports for the exact assertion found
  four timeout failures at 30,173.705, 30,263.47, 30,516.37, and 31,512.311 ms;
  successful identical runs reach 27,170.63 ms, including 22,352.244 ms on the
  first WP5k tree and 23,009.979 ms in WP5j. This is a recurring harness budget,
  not an ENOTDIR or cleanup semantic regression. Finalization remains stopped
  until a bounded timeout-only correction passes repeated focused and full
  verification.
- 2026-08-18: Changed only that test's timeout from 30,000 to 60,000 ms; no
  production cleanup code or semantic assertion changed. Three serial
  receipt-owning focused-file runs each passed 9/9 with zero skips and target
  durations 24,159.078, 25,845.774, and 25,979.5 ms. Independent audit matched
  every receipt and artifact binding with zero mismatches. Report hashes are
  `acb46cc8680cbe123c741642001c8e71bebb6f0c07347dfe7eb7ee02e0856343`,
  `495d2da11ed8e89898b79dfdabd2f6745eebb6c6516059ebeda10c6b159c6b8a`,
  and `c5a30820806734925b1f1a102f53103ec867cd754b37dd468df0edbcf830c6df`.

## Next Action

Freeze the source/tests/plan/autonomy record, stage exactly the six bounded
paths, audit the third candidate tree and protected identities, then repeat
every final command before the single no-push commit.
