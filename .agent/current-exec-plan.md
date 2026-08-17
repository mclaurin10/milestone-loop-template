# Current Execution Plan

**Status:** WP5j Windows fresh-adopter shared-store closure planned; isolated-store reproduction in progress
**Updated:** 2026-08-17
**Owner:** autonomous loop

## Objective

Complete one cohesive WP5j increment after auditing Exact runtime CI run
`32060615125` for pushed WP5i commit
`87bd41e072a9e49baf212dc803ead83acbdabb92`. Preserve the now-passing real
trusted-container boundary and fix only the Windows fresh-adopter failure in
which the generated repository selects a different drive-local pnpm store from
the already hydrated source checkout. Make the smoke coordinator resolve the
exact store used by its pinned source-side pnpm invocation and supply that
store explicitly to the generated repository's unchanged offline/frozen/copy
install. Reproduce the failure and corrected outcome across Windows volumes,
add regression coverage, run applicable exact-toolchain suites with
command-owned evidence, independently audit the evidence, and create one
narrow local commit without pushing.

This increment does not fix or relabel the Linux or Windows controller test
clusters. It does not change package or lock files, generated-adopter package
content, the OCI fixture/provider/matrix, workflow job scheduling, exact
toolchain pins, completion eligibility, commissioning/readiness/verifier
semantics, immutable authority, calibration, hidden validation, or product
scope. It does not claim hosted Windows PASS until a later pushed revision
runs on GitHub's native `windows-2022` environment, and it does not begin WP6.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, all immutable-lock baseline/active meanings,
  CAL-1 `open_not_started`, the readiness default profile and permanent marker,
  original acceptance contract, commissioned identities, exact verifier
  semantics, invariant IDs, Doctor/Status schemas, examples, and completed
  evidence.
- Preserve exact Node `24.18.0` and pnpm `11.15.1`. Windows commands put
  `.tools\node-v24.18.0-win-x64` first on `PATH` and invoke its
  `corepack.cmd`. No package-manager fallback, floating version, or dependency
  update is permitted.
- The generated repository install remains `--offline --frozen-lockfile
  --package-import-method=copy`. Store sharing may only point it at the exact
  controller store already hydrated by the frozen source install; it may not
  enable network, mutate source lock/package bytes, rely on an unrelated warm
  cache, or silently retry against another store.
- Resolve the store through the same pinned pnpm invocation and exact source
  working directory used by the coordinator. Reject empty, relative,
  multi-line, malformed, or failed output rather than guessing.
- Preserve the generated repository's clean two-commit bootstrap history,
  absent readiness marker/tree/history, current config/model-policy schemas,
  command-owned typecheck/unit receipts, independent artifact/manifest audit,
  completion-ineligible smoke label, and exact source identity fence.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Local `master`, `HEAD`, and fetched `origin/master` are exactly
  `87bd41e072a9e49baf212dc803ead83acbdabb92`, tree
  `015964e7aca00251e2248942e9b695582bca1023`, parent
  `a868d9d92227cb95b17db93b14038ae2d24ec026`, at `0 ahead / 0 behind`.
  The tracked tree/index are clean and the protected human plan is the sole
  untracked path.
- All four immutable actual hashes match their lock baselines and active
  values. The default profile is `readiness`, the permanent activation marker
  is present, and CAL-1 is `open_not_started`.
- The protected plan remains exactly 78,574 bytes with SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Exact push run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/32060615125`
  (run 5, attempt 1) executed the exact candidate from
  `2026-08-17T19:29:21Z` through `19:35:24Z` and concluded `failure`. All five
  jobs, every step, complete logs, eight annotations, and all five ZIPs were
  retrieved and inspected.
- Job identities/results: fresh-adopter Windows `95480834015` failure;
  controller Windows `95480834038` failure; fresh-adopter Linux `95480834051`
  success; controller Linux `95480834113` failure; trusted-container Linux
  `95480834183` success. The annotations are five action-runtime Node 20
  deprecation warnings and three exit-code failures.
- Artifact IDs / ZIP bytes / SHA-256: controller Windows `9298180337` / 52,794
  / `7c58a84f11475d46a15e15f5cee430f938b866f6b17d20a7b18e1203f14f2c38`;
  controller Linux `9298111032` / 49,146 /
  `42e3c9d8325b818188c65ee2c9a1bbf8caa8d5d1c0bae2cb3125c81a3179f131`;
  trusted container `9298026972` / 21,902 /
  `9ca49490907fec39b280dc1d715478ee5798085719e55a2e8a11baaf43deca1c`;
  adopter Windows `9298008310` / 8,736 /
  `f210504bdb7850c7c046f5fcfdcfc6ee29c3ebc92ace7ed55d89c766c09ba22e`;
  adopter Linux `9298000229` / 15,191 /
  `cbcfcffbec09c4bd39b1a28ab289440edb8de64c8cab8383aee0cabef1b0bdd5`.
- Retained evidence is under ignored
  `artifacts/hosted/run-32060615125/`. The independent 23,471-byte
  `audit-result.json` has SHA-256
  `54b50a40334ca8efab5aa291aa341b9516e4504783557d44d524feebb93060bf`
  and status PASS: 13 PASS receipts, 13 rehashed artifacts totaling 81,253
  bytes, 12 exact manifest bindings plus one OCI containment binding, two
  honest ERROR/no-receipt manifests, and zero mismatches.
- WP5i succeeded in hosted Docker `28.0.4`: committed source identity matched,
  exact fixture hydration completed, and all six cases had their expected
  dispositions (normal/boundary PASS; artifact-link/artifact-quota/
  output-flood ERROR; hang TIMEOUT). Every containment artifact matches its
  bytes/hash, all cases retained denied-network/read-only policy, and managed
  container/volume inventories are empty before and after.
- Linux fresh-adopter passed 4/4 tests and both audited receipts. Both
  controllers passed contract 13/13, schema 7/7, policy 15/15, and fail-closed
  61/61 invariants. Linux then reported 578/588 passed, 9 failed, 1 skipped;
  Windows reported 512/588 passed, 74 failed, 2 skipped. Those clusters remain
  outside WP5j.
- Windows fresh-adopter failed before typecheck/unit evidence. The source
  install downloaded all 138 packages including `@eslint/js@10.0.1`; the
  generated repository reported `reused 0` and
  `ERR_PNPM_NO_OFFLINE_TARBALL` for exactly
  `@eslint/js/-/js-10.0.1.tgz`. GitHub's source is on `D:` while
  `mkdtemp(tmpdir())` places the generated repository on `C:`, causing pnpm's
  drive-local default stores to diverge. Linux uses one filesystem and passes.

## Steps

1. [x] Complete authority/plan/log, Git/origin, immutable, readiness/CAL-1,
       retained-evidence, and protected-file resume audits.
2. [x] Discover run `32060615125`; inspect all jobs, steps, logs, annotations,
       and ZIPs; retain raw metadata/evidence and independently audit receipts,
       bindings, totals, OCI policy/dispositions, and cleanup.
3. [x] Reproduce the hosted causal store split under exact
       Node/pnpm using a disposable exact-commit clone, a source-scoped
       hydrated store, and an isolated empty child default store. Retain both
       resolved store paths and the unchanged offline failure. The attempted
       `subst` drive-alias control is retained but rejected because both aliases
       share one physical volume and pnpm correctly selected one store.
4. [x] Add a narrow store-resolution owner to the coordinator, validate one
       absolute path from pinned pnpm, and pass it explicitly to the generated
       offline install with non-sensitive diagnostic disposition.
5. [x] Add regression coverage for exact command/cwd, failed/empty/relative/
       multi-line resolution, explicit install binding, and unchanged
       offline/frozen/copy flags. Change the workflow contract only if the
       public job command itself must change.
6. [x] Run focused receipt-owning tests and diagnostics; correct only defects
       within the shared-store boundary.
7. [ ] **In progress:** repeat the frozen-candidate cross-volume smoke and require install,
       typecheck, 4/4 unit tests, two receipts/artifacts/manifests, clean
       two-commit history, source identity preservation, and cleanup.
8. [ ] Run invariants, orchestrator, unit, typecheck, lint, and format
       separately and serially into fresh command-owned evidence roots.
9. [ ] Audit final receipts/artifacts/bindings/totals, diff, immutable/profile/
       commissioning/package/lock/workflow identities, private refs, retained
       evidence, and protected-plan identity.
10. [ ] Update this plan and `docs/autonomy-log.md`; update the decision log
        only for a durable decision; stage only WP5j paths, audit cached scope,
        create one cohesive local commit, and do not push.

## Acceptance Criteria

- The pre-fix Windows cross-volume reproduction resolves different source and
  generated default stores and fails the unchanged offline install for the
  hosted missing package without mutating source, package, or lock bytes.
- The coordinator resolves the source store through exact pinned pnpm in the
  source checkout, rejects ambiguous output/failure, and supplies it explicitly
  while retaining `--offline --frozen-lockfile --package-import-method=copy`.
- Regression tests fail if store resolution is removed, uses the generated cwd,
  accepts an unsafe value, omits/substitutes the store, or weakens install flags.
- The frozen-candidate cross-volume run passes generated install, typecheck,
  and 4/4 tests; validates two receipts/artifacts/manifests; retains
  completion-ineligible bootstrap semantics and clean two-commit history;
  preserves source HEAD/tree/status; and removes its temporary root.
- Already-green OCI workflow semantics and Linux-compatible adopter behavior
  remain unchanged. Exact focused and broad suites pass with zero failures and
  only the two declared Windows POSIX skips in broad Vitest aggregates.
- No dependency, package/lock, generated payload, readiness/profile,
  commissioning/verifier, invariant, authority, example, controller, or
  unrelated workflow change occurs.
- One cohesive commit contains only the coordinator correction, tests, plan,
  autonomy record, and narrowly necessary guidance. It is not pushed; later
  human push/hosted execution remains required for native hosted Windows PASS.

## Verification

All project commands use exact Windows Node `24.18.0` and pnpm `11.15.1` with
the pinned Node directory first on `PATH`; long commands run serially.

1. Pre-fix ignored exact-commit store-split reproduction: configure an
   external source store through a source-only `.npmrc`, hydrate it, give the
   temporary generated repository a fresh isolated Windows `LOCALAPPDATA` and
   temp root, prove the resolved stores differ, run the unchanged coordinator,
   and retain the missing-tarball failure/logs. Keep the earlier logical-drive
   same-volume PASS only as a rejected control.
2. Receipt-owning focused Vitest for `fresh-adopter-ci-smoke.test.ts` and any
   affected workflow contract through `tools/run-tool-evidence.mjs
   invariant-vitest` into a fresh WP5j root.
3. Frozen-candidate repetition of the real cross-volume smoke with independent
   result/history/status/receipt/artifact/manifest/source/cleanup audit.
4. Run `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
   `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each with its own
   fresh command-owned evidence directory.
5. Independently audit final evidence and identities; inspect
   `git diff --check` and staged scope; create one no-push commit and audit its
   commit/tree/parent.

Evidence invalidation: any source install, generated package/lock, pnpm
invocation, smoke command, workflow fresh-adopter command, test owner, receipt
audit, or generated-history semantic change invalidates the corresponding
cross-volume evidence. Final plan/log text freezes before the last smoke and
broad commands; outcomes stay in ignored evidence and the final handoff.

## Risks and Recovery

- Same-volume local runs hide the GitHub Windows defect. A `subst` alias did
  not create a second volume and the unchanged smoke correctly passed; that
  result is retained as a rejected control. The accepted reproduction must
  instead prove two distinct resolved store paths, with only the source store
  hydrated and the child still offline.
- `npm_execpath` and Corepack use different platform wrappers. Store discovery
  must reuse the existing invocation abstraction and preserve Windows quoting.
- Do not copy a host-specific absolute path into tracked durable results;
  record only disposition or a path hash/leaf where needed.
- A temporary drive mapping is host-global. Verify the drive is absent, map
  only a validated ignored root, always remove exactly that mapping in
  `finally`, and never delete or move a computed drive root.
- A local `subst` reproduction exercises pnpm drive selection but does not
  replace later hosted `windows-2022` execution.
- Recovery is an ordinary revert of one WP5j commit. No push, recommissioning,
  state mutation, history rewrite, dependency update, or destructive cleanup
  is required.

## Progress and Evidence

- 2026-08-17: Verified repository authorities, exact WP5i Git/origin identity,
  immutable hashes, readiness/CAL-1 state, and protected file.
- 2026-08-17: Audited run `32060615125` job by job and retained raw API
  metadata, complete logs, ZIPs, and extracted artifacts.
- 2026-08-17: Independently validated 13 receipts/artifacts, 81,253 bytes, 12
  manifest bindings plus one containment binding, test totals, all OCI cases,
  denied-network/read-only policy, and zero remaining managed resources.
- 2026-08-17: Confirmed WP5i fixed its hosted Docker boundary and selected the
  independent Windows fresh-adopter store split as the next bounded WP5 gap.
- 2026-08-17: A safe temporary `Z:` alias of the exact clone remained on the
  same physical volume, so pnpm reused all 138 packages and the unchanged smoke
  passed 4/4. The mapping was removed and the PASS artifacts were retained as
  a rejected reproduction control. The plan now uses explicit isolated stores
  to reproduce the causal visibility split locally.
- 2026-08-17: The accepted pinned invocation-shim reproduction exposed a
  hydrated source store and a different empty child default store to the
  unchanged coordinator. The generated offline/frozen/copy install reused and
  downloaded zero packages, then failed exactly on `@eslint/js@10.0.1`; source
  Git status and both tracked lock hashes remained unchanged, and no generated
  temporary root remained. The 3,696-byte structured record is
  `artifacts/hosted/run-32060615125/reproduction/windows-store-split-wrapper-pre-fix/result.json`,
  SHA-256
  `a63005aee099fc03640d16b44f38b57dd97194b978d0edd7053c51888ab0aae2`.
- 2026-08-17: Added the exact source-cwd store resolver, absolute single-path
  validation, existing-directory fence, explicit generated install binding,
  and hashed non-sensitive result disposition. The public workflow command,
  generated payload, and package/lock files remain unchanged.
- 2026-08-17: Focused regression was red at 2 passed / 2 failed before the
  owner existed, then green at 4/4. Receipt-owning focused, typecheck, lint, and
  corrected format diagnostics passed. The corrected isolated-store smoke
  passed install/typecheck/4 tests and independently matched 2 receipts, 2
  artifacts (3,256 bytes), and 2 manifest bindings with no mismatches. Its
  3,606-byte result SHA-256 is
  `9a3b76ba44b1255dcd644c1141ae4795fc6ba7e0082bb321bfbdd086bf1e791b`.

## Next Action

Freeze this plan and durable logs, stage only the bounded WP5j files, audit the
exact staged tree and protected identities, then run a fresh final isolated-
store smoke and every serial receipt-owning focused/broad command from that
unchanged candidate before the single no-push commit.
