# Current Execution Plan

**Status:** WP5 recommended Session 3 hosted Windows unit-fixture isolation repair in progress
**Updated:** 2026-08-23
**Owner:** autonomous loop

## Objective

Close WP5 hosted CI/quickstart validation by causally repairing each Windows
fresh-adopter failures exposed by Exact runtime CI runs `32638898310` and
`32651184672`, plus the unit-fixture defect exposed by run `32660428700`,
freezing and pushing evidence-backed replacement candidates,
obtaining one fully green five-job Exact runtime CI run on one exact commit,
and independently auditing every uploaded artifact.

Do not run source no-argument `pnpm verify`, invoke `loop:template:prove`, start
CAL-1, enter hidden validation, begin WP6, add product/readiness scope, weaken
strict path/receipt/evidence checks, or claim autonomous readiness.

## Goal Constraints

- Preserve Node `24.18.0`, pnpm `11.15.1`, readiness default and permanent
  marker, CAL-1 `open_not_started`, and every immutable baseline/active hash.
- Preserve protected untracked
  `Implementation-ready improvement plan 8-5-26.txt` at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  plus `.tools/corepack-home-readonly-probe` and
  `.tools/wp5r-corepack-probe`.
- Keep commissioning's strict caller-controlled path, realpath, Git, manifest,
  and publication guards unchanged. Apply the established producer-owned-root
  rule only to the fresh-adopter coordinator's newly created temporary root.
- Generated-adopter verification must remain a clean three-commit bootstrap
  journey with exactly one generated no-argument `pnpm verify`, zero source
  no-argument verify invocations, and no readiness marker in tree or history.
- Hosted acceptance requires controller Linux/Windows, fresh-adopter
  Linux/Windows, and trusted-container Linux all to succeed on one exact SHA,
  with all required steps and unconditional uploads successful.
- The production-build disposable clone must use the exact pnpm content store
  already resolved from its clean source repository. Its frozen offline install
  may not silently select a different empty store merely because the clone is
  created on another Windows volume.
- Preserve every controller command and its per-command/per-test timeout. The
  Windows controller job may receive a larger matrix-specific outer timeout
  only to let those unchanged commands finish; Linux retains its current
  60-minute bound.

## Baseline Evidence

- Fresh fetch confirms `HEAD == origin/master ==`
  `43e609bc6b754bcfee0c3af88a05be68b9e26850`, tree
  `3258c1c65835c275b2462eb6dd8f67c346a4d88e`, divergence `0/0`; the only
  nonignored entry is the protected human plan at its expected hash.
- Runtime/package identities remain Node `24.18.0` and pnpm `11.15.1` in the
  repository contract; readiness is active, CAL-1 is open/not started, and all
  four actual/baseline/active authority hashes match.
- Exact runtime CI run `32638898310` / attempt 1 is a push run on the exact
  candidate and concluded failure. Controller Linux/Windows, fresh-adopter
  Linux, and real trusted-container Linux succeeded; only fresh-adopter
  Windows failed at `Generate and exercise a fresh adopter`. All five
  unconditional artifacts uploaded. Check annotations contain one failure and
  zero warnings, so the Node 20 action-runtime warnings are closed.
- Retained evidence under `artifacts/hosted/run-32638898310/` includes exact
  public run/job/check/artifact metadata, all five server-digest-matching ZIPs,
  safely extracted contents, and the failed Windows job log. The failed
  Windows archive SHA-256 is
  `4184d3799bdcb5d2b4636425b1d90869e102486318d67f3e02aa5039b9dafbf8`.
- The first two ledger commands, `template-create` and `install`, passed. The
  first failure was `commission` with exit 1. No manifest add/commit or verify
  command ran, and neither `smoke-result.json` nor `receipt-audit.json` exists.
  The exact public command used the generated repository as cwd with inherited
  job environment plus `CI=true` and argv
  `pnpm loop:commission -- --input tools/milestone-orchestrator/config/commissioning-input.json`.
- Hosted Windows created the coordinator-owned repository under the valid
  short spelling `C:\Users\RUNNER~1\...`; Git returned the same root under
  its expanded spelling. `commissioning-cli.ts` therefore supplied an input
  path derived from the short cwd while `commissioningRepositoryRoot()` supplied
  the expanded Git root, and lexical containment correctly refused their
  apparent `..` relation. This is deterministic coordinator root-identity
  drift, not infrastructure and not permission to normalize arbitrary inputs.
- Replacement commit `812dc9fe90c44688fb6b4558ea5ea14331c82363`
  (tree `7922b78332a417056d9a2e389f806f5df4589fb0`) passed the exact local
  Windows six-command adopter/browser journey and was pushed normally. Its
  push-triggered run is `32651184672`; the first repair is effective there,
  because commissioning and manifest publication pass.
- Run `32651184672` exposes a second deterministic Windows-only defect at the
  generated repository's production-build dependency preparation. The source
  checkout and populated pnpm store are on `D:` (`D:\.pnpm-store\v11`),
  while Node's temporary root and the disposable production-build clone are on
  `C:`. The generated install explicitly pins the source store, but
  `production-build.mjs` drops that store identity before its nested offline
  install; pnpm therefore selects a different volume-local store and exits 1.
  Linux uses one volume and passes.
- The terminal run also cancelled Windows controller at the outer 60-minute
  job boundary after invariant and controller suites passed. Its unit command
  ran only 28 minutes before cancellation and left an ERROR manifest with no
  receipt; later static steps were skipped. The exact local Node 24 unit suite
  needs about 57 minutes by itself and passes 612 tests with two declared
  Windows-only skips, so the combined unchanged Windows job cannot reliably fit
  the existing 60-minute outer bound.
- Replacement commit `97a94775a0ccbec6393fde15430e42c08b32e8fd`
  (tree `10f401c011835819fe90c0ce6a332670bfea4fd0`) passed the exact
  cross-volume Windows adopter journey, exact clean invariant/controller/static
  checks, and was pushed normally. Run `32660428700` proves both hosted adopter
  jobs and the real Docker job green; Linux controller also passes all six
  commands. Windows invariants and all 597 controller tests pass, then unit
  fails 9 production-build fixture assertions while 603 tests pass and the two
  declared POSIX process-group tests skip.
- Every unit failure reports the same missing ambient path,
  `C:\Users\runneradmin\AppData\Local\pnpm\store\v11`. Both hosted
  generated-adopter production builds pass with their real validated source
  stores. The production guard is therefore effective; the deterministic defect
  is that legacy unit fixtures have no fixture-owned store and accidentally pass
  only on machines whose ambient default store already exists.

## Steps

1. [x] Complete required authority/plan/log/code inspection; fetch origin and
       live run state; retain metadata, annotations, failed logs, all five
       archives, safe extraction inventories, and direct ERROR evidence.
2. [x] Reproduce the failure from an exact clean no-local/no-hardlink clone of
       `43e609b` under pinned Node/pnpm, `CI=true`, frozen copy-mode source
       install, isolated writable Corepack/store/TEMP/telemetry/evidence roots,
       and a genuine NTFS 8.3 TEMP spelling. Retain the exact red command/log
       evidence and prove the short/expanded root mismatch directly.
3. [x] Add a regression that fails on a producer-created short spelling and
       requires the coordinator to return the canonical root before deriving
       its generated repository. Make the smallest production correction:
       canonicalize only `realpath(await mkdtemp(...))` in
       `fresh-adopter-smoke.ts`; do not change commissioning or shared path
       guards. Run focused affected receipt-owning tests with serial files.
4. [x] Freeze the tracked repair plus tests, plan, and autonomy log; reuse the
       existing producer-owned canonical-root decision rather than duplicating
       it; commit the cohesive candidate and confirm protected/immutable/
       readiness/CAL-1 identities plus the protected-file tree exception.
5. [x] From exact clean no-local/no-hardlink clones of that commit, run one
       real Windows create -> offline frozen install -> commission -> manifest
       commit -> generated no-argument verify -> shared independent audit
       journey, then receipt-owning `pnpm test:orchestrator`, `pnpm typecheck`,
       `pnpm lint`, and `pnpm format:check`. Independently verify receipts,
       artifacts, candidate binding, browser evidence, and clone cleanliness;
       push normally to `origin/master` once and identify the push-triggered
       Exact runtime CI run without dispatching a duplicate. The local
       aggregate disclosed two unchanged timing-only nonpasses whose exact
       owners passed in isolation and on the prior hosted Windows run; no
       timeout or success rule was changed.
6. [x] Monitor the replacement run through the first terminal defect. Retain
       its failed Windows artifact and direct logs; classify the cross-volume
       pnpm store loss as deterministic and do not rerun unchanged `812dc9f`.
7. [x] Add a red production-build regression that simulates a repository store
       unavailable through the disposable clone's default selection. Resolve
       the source store with the same pinned pnpm, validate one absolute path,
       pass it explicitly to the nested frozen offline install, retain useful
       subprocess diagnostics, and keep clean-clone/output/receipt rules
       unchanged. Run focused production-build and adopter-package coverage.
8. [x] Add a workflow-contract regression requiring Linux controller to retain
       60 minutes and Windows controller to receive 120 minutes. Change only
       the matrix-specific outer bound; preserve all six commands, per-test and
       command limits, evidence roots, scheduling, and uploads.
9. [x] Freeze, commit, and validate the second repair from exact clean clones:
       run one real Windows adopter/browser journey plus receipt-owning
       typecheck, lint, format, and the applicable focused/broader tests. Push
       normally once and identify only the push-triggered exact-SHA run.
10. [x] Monitor run `32660428700` through its terminal defect. Retain signed
        metadata, Windows log, server-digest-matching safe extraction, and the
        unit ERROR manifest/report; do not rerun the unchanged SHA.
11. [x] Preserve a hosted-semantics red report, then give every production-build
        unit fixture a real fixture-owned empty pnpm store. Pass that path via
        canonical `pnpm_config_store_dir` to direct and spawned fixture
        executions, remove conflicting case variants, restore process state,
        and keep the production existing-store guard unchanged.
12. [ ] Run exact focused and broad unit coverage plus affected statics, freeze
        and commit the cohesive fixture-isolation repair, then validate the
        exact clean candidate with one real cross-volume Windows adopter
        journey and committed-byte checks. Push normally once and identify only
        the push-triggered run.
13. [ ] Monitor causal candidates until one five-job run is terminal green. On
        the final green SHA, download and safely extract all five artifacts,
        independently audit controller, adopter, browser, and real-container
        receipts/manifests/artifacts/candidates/tests, verify zero actionable
        annotations and exact Node 24 action pins, and write only ignored
        `artifacts/manual/wp5-session3-final-audit/audit-result.json`.

## Acceptance Criteria

- The original Windows failure has retained direct evidence, exact command
  boundary, causal short/expanded root explanation, and a regression that is
  red on `43e609b` semantics and green only after producer canonicalization.
- Commissioning strictness and every unrelated caller-controlled path remain
  unchanged; Linux and Windows semantics stay shared.
- The second Windows failure has retained direct evidence of source checkout
  `D:`, populated store `D:\.pnpm-store\v11`, temporary build workspace
  `C:`, and the nested offline preparation failure. A regression proves the
  nested clone receives the exact validated source-store path explicitly.
- The cancelled Windows controller artifact retains its passing invariant and
  597-test controller receipts plus the unit ERROR manifest with no receipt.
  The workflow contract proves only the Windows outer job bound increased; no
  command, test, receipt, or success definition was weakened.
- Run `32660428700` retains the Windows controller archive/log/report proving
  603 unit passes, 9 production-build fixture failures, two declared skips, and
  one common absent ambient store. A regression must fail under an absent
  ambient store before correction and pass only when each fixture owns and
  explicitly supplies its store; production code remains fail-closed.
- One exact replacement candidate passes the real local Windows six-command
  generated-adopter journey, affected focused/broader checks, typecheck, lint,
  and format with independently valid command-owned evidence.
- One push-triggered hosted run has five successful jobs and no required
  skipped/continued-on-error step; zero Node 20 warnings and zero other
  actionable warning/failure annotations; all five exact-SHA artifact uploads
  succeed.
- Both controller artifacts prove all six commands, correct platforms,
  zero test failures, valid receipts/manifests/artifacts, and exact clean
  candidate/toolchain binding. Any skips are enumerated and explained.
- Both adopter artifacts prove `fresh-adopter-ci-smoke.v2` PASS, one ordered
  six-command ledger, one generated verify/zero source verifies, sole matching
  commissioned manifest, clean three-commit bootstrap history, valid audited
  verifier evidence, substantive visually inspected screenshots, and clean
  browser diagnostics.
- Trusted-container evidence proves a real Docker daemon and complete expected
  normal/adversarial matrix with no mock or host-local fallback.
- Final `HEAD == origin/master ==` the validated hosted SHA; tree is clean
  except for the protected untracked file and disclosed ignored evidence. The
  claim is WP5 hosted CI/quickstart closure only, never autonomous readiness.

## Verification

Focused inner loop, with unique evidence/telemetry/TEMP/Corepack/store roots
and `--fileParallelism=false`:

- `node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/fresh-adopter-ci-smoke.test.ts tools/milestone-orchestrator/src/commissioning.test.ts --fileParallelism=false`
- Add `adopter-package.test.ts`, `adopter-package-proof.test.ts`, and
  `exact-runtime-workflow-contract.test.ts` only when their owner is affected.

Final local candidate:

- One real Windows `fresh-adopter-smoke.ts` journey from a clean exact clone
  under the genuine NTFS 8.3 hosted-like boundary.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm test:orchestrator`, because the production CI coordinator changed.

Never run source no-argument `pnpm verify`, `loop:template:prove`, or a
redundant local Docker matrix.

## Risks and Recovery

- A fix inside commissioning containment would broaden caller authority and
  contradict the established producer-owned canonical-root rule. Keep that
  file byte-identical unless new direct evidence disproves the diagnosed owner.
- The full adopter browser journey is expensive. Use the pure root-creation
  regression and focused files during the inner loop; run the complete journey
  once only after tracked bytes freeze.
- Any tracked change after final local verification invalidates that evidence;
  repair, recommit, and rerun affected final checks on the new identity.
- Hosted failures remain non-passing until explained. Preserve exact archives,
  logs, and metadata; ordinary Git commits provide rollback. Do not force-push,
  rewrite history, delete user residue, or normalize a failing gate away.

## Progress and Evidence

- 2026-08-23: Required startup inspection completed. Candidate/origin,
  immutable/readiness/CAL-1/protected identities match the Session 2 handoff.
- 2026-08-23: Signed GitHub connector plus public metadata endpoints retained
  run `32638898310`, five jobs, five artifacts, five check-run annotation sets,
  all five exact server-digest archives and safe extracted contents, and failed
  job `97192798715` logs under
  `artifacts/hosted/run-32638898310/`.
- 2026-08-23: Direct artifact inspection classifies the defect as a
  deterministic Windows coordinator-owned temporary-root identity mismatch at
  commissioning. It is not an external transient. Existing decision-log
  authority already requires producer-owned fresh roots to be canonicalized
  once at creation.
- 2026-08-23: An exact clean `43e609b` clone with pinned Node/pnpm, frozen
  copy-mode source install, `CI=true`, isolated writable roots, and genuine
  `C:\w5s3r1\HOSTED~1` TEMP spelling reproduced commission exit 1 before
  manifest/verify. A child-spawn identity probe proves short cwd/input versus
  expanded Git root and the resulting false lexical escape. Red evidence is
  retained under the failed run's `reproduction/windows-8dot3-pre-fix/` tree.
- 2026-08-23: The new producer-root invariant failed alone on the old
  coordinator while all 13 commissioning tests passed. The correction adds
  only `realpath` of the fresh `mkdtemp` result before deriving children;
  commissioning implementation, CLI, and tests remain blob-identical to HEAD.
  The corrected focused receipt reports 20/20 tests passing at
  `artifacts/manual/wp5-session3-focused-green-v1/`.
- 2026-08-23: Pre-freeze receipt-owning typecheck, lint, and format checks all
  pass with independently matching receipts and declared artifacts. They are
  iteration evidence on a dirty tree, not substitutes for the required exact
  committed-candidate reruns. No new durable decision is introduced.
- 2026-08-23: Repair commit `812dc9f` passed an exact clean local Windows
  generated-adopter journey with 10 valid receipts, 18 artifacts, four tests,
  and substantive clean browser evidence, then passed exact-clone typecheck,
  lint, and format. Two unchanged aggregate test owners exceeded local timing
  limits, passed immediately in isolation, and had passed hosted Windows; this
  was disclosed without timeout changes. The normal push created only run
  `32651184672`.
- 2026-08-23: In run `32651184672`, fresh-adopter Linux and trusted-container
  Linux pass. Fresh-adopter Windows advances through commissioning and manifest
  commit, then the sole generated no-argument verify fails only the
  production-build stage. Its artifact digest
  `5deb8fb362232dd94b0675c10b286669b0f4d1e2ce3218b01ed71bdfe730347a`
  is retained under `artifacts/hosted/run-32651184672/`. Direct workflow and
  artifact evidence binds the populated source store to `D:` and the generated
  plus production-build temporary workspaces to `C:`; the production wrapper
  currently omits `--store-dir` from its nested offline install.
- 2026-08-23: Terminal connector evidence confirms Linux controller also
  passed, while Windows controller was cancelled at the 60-minute outer job
  boundary. Its invariant and 597-test controller receipts pass; its unit
  manifest is ERROR with no receipt after 28 minutes, later statics are skipped,
  and unconditional upload passes. The 49,231-byte artifact's local digest
  matches server SHA-256
  `69e6801ce22a8e2c37518f02cf4cf5c03d34d6cf816ba8ec7c059623db61f90c`.
- 2026-08-23: Current-semantics regressions retained three direct red reports:
  missing production store argv, missing generated store environment, and
  missing matrix-specific controller timeout. Their SHA-256 values are
  `6f4e8f1ba9b7995642b9c45e7227576b1a21c10f2ca9f4091aed661e7887e0a7`,
  `f3cadeb764792c88f188cffac39458bfe106d8714960e07f2077e61d40e03f36`,
  and `34b811f722eb25969f35b5b10e1615e2b2cddda39ca97bdf9c3e063559d45d4a`.
- 2026-08-23: Corrected exact Node/pnpm evidence passes 15/15 production
  fixtures, 21/21 combined distributor/coordinator/workflow tests, typecheck,
  lint, and format. The sole valid broad unit run passes 182/182 suites and
  612/614 tests with zero failures; the two skips are the declared Windows-only
  POSIX process-group cases. An earlier ambient-Node-25 launch was stopped with
  no receipt and is nonqualifying. Linux controller remains at 60 minutes;
  Windows alone receives a 120-minute outer bound, with every command and test
  limit unchanged.
- 2026-08-23: A pre-freeze invariant launch passed the protected-integrity
  owner 13/13, then truthfully failed before the schema test because this shared
  checkout's modules metadata names an older custom store that its trusted
  sanitized child does not inherit. No rerun or code accommodation was made;
  final checks will use a clean default-store clone.
- 2026-08-23: Commit `97a94775` passed a real local `D:` source/store to `C:`
  TEMP generated-adopter journey. Independent audit matched 38 declared plus
  51 retained inventory entries, 10 manifests, 11 results, six ledger commands,
  one generated/zero source verifies, and clean browser evidence. Exact clean
  invariant, 597-pass controller, typecheck, lint, and format evidence passed.
  Its sole push run `32660428700` finishes four jobs green; Windows unit retains
  603 passes, 9 failures, and two declared skips. All failures are legacy
  production-build fixtures resolving a nonexistent ambient runner store even
  though both hosted production paths pass with real source stores.
- 2026-08-23: The fixture-only correction passes the hosted-missing-store
  focused owner 16/16 while leaving the ambient path absent. The exact pinned
  receipt-owning complete unit suite then passes 182/182 suites and 613/615
  tests with zero failures; its two skips are the same declared Windows POSIX
  process-group cases. The 213,968-byte report and 484-byte receipt independently
  match SHA-256
  `f6940d74167fc6a2635d5eca7c77b7e3fa9f644067d4ab6e17244b5add6fb4b3`
  and `6d107a7022ffe9b788cbf813cabbc5f689301c7ab44432e2f2638019fef83f8f`.
- 2026-08-23: Exact Node/pnpm typecheck, lint, and format each pass serially
  through their receipt owners after the final test implementation edit. Their report
  SHA-256 values are
  `20d7553aaf6d2c95d7df10c1980b3fd83da80269d54e7494e81f729b06a47159`,
  `9c3ce499bc8880beab24cc5068dfc8f78cb8af43eeabf4cb0076b3ef3d32b137`,
  and `59bec308c2145302b7cbe21ce6e7179a8f255a539c280a5afcdd012e8d50bff2`.

## Next Action

Review and freeze the four-file fixture-isolation increment, then commit and
validate it from clean exact clones before the next normal push.
