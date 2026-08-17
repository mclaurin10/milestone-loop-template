# Current Execution Plan

**Status:** WP5f locally complete and independently audited; hosted validation pending after user push
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Complete one cohesive WP5f increment that corrects the failed hosted Exact
runtime CI run for commit `a4c024ff97d459d170a2b2dae2d5cd92a4701899`.
Make every workflow checkout include the commissioned Git authority base, and
make the fresh-adopter and trusted-container jobs independently schedulable so
a controller failure cannot suppress their diagnostic evidence. Add executable
workflow regression coverage, run the applicable local suites under the exact
pinned Windows toolchain, record the hosted evidence and correction, create one
cohesive commit, and do not push.

This increment changes only CI checkout/scheduling structure, its executable
contract, tests, and records. It does not change contract-integrity meanings,
authority or commissioning data, controller/product/provider/runtime behavior,
OCI semantics, verification profiles, completion eligibility, dependencies, or
package commands. It does not perform WP6 performance work, product-domain
implementation, a source no-argument verification, the completed WP4d proof,
or another hosted run.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, all original acceptance meanings and immutable
  lock identities, the hidden-validation protocol, active and historical
  commissioning, the permanent readiness marker/history, exact verifier
  stage/profile/completion semantics, Doctor schema `2.0.0`, Status schema
  `1.0.0`, invariant IDs and meanings, runtime/schema parity and migrations,
  examples, package/lock files, and all completed evidence.
- Preserve exact Node `24.18.0`, pnpm `11.15.1`, Linux/Windows runner labels,
  full-SHA action pins, least-privilege permissions, serial receipt-owning
  commands, unique platform evidence roots, and artifact uploads.
- The commissioned authority base is Git-owned. Every job that executes the
  repository must check out enough history for that exact commit and other
  repository history contracts to be observable; weakening authority checks
  to accommodate a shallow checkout is prohibited.
- Fresh-adopter smoke and trusted-container execution are separate diagnostic
  boundaries under the committed WP5e decision. No higher authority requires
  them to depend on the controller job, so neither may carry `needs:
controller` or an equivalent controller-success gate.
- The trusted-container job must remain Linux-only and must still probe a real
  Docker Engine and invoke the unchanged complete normal/adversarial OCI
  matrix. Scheduling independence is not local OCI execution evidence.
- Do not use `continue-on-error`, weakened conditions, removed commands,
  reduced test scope, mocks, structural-only OCI assertions, or skip logic to
  obtain a passing result.
- Use `.tools\node-v24.18.0-win-x64\corepack.cmd` with that Node directory
  first on `PATH`; run long suites separately and serially.
- Do not run source no-argument `pnpm verify`, rerun
  `loop:template:prove`, manually rerun the known-failing workflow, dispatch
  another run for the unchanged commit, or push this increment.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry branch is `master`, HEAD
  `a4c024ff97d459d170a2b2dae2d5cd92a4701899`, tree
  `e933cd96220f24b7c8072dd10a2675349f0d5531`, and parent
  `dc475ea807f477c8c8ad818def6ee98318844708`. Tracked tree and index are
  clean, divergence from locally observed `origin/master` is `0 behind / 0
ahead`, and the protected human plan is the sole untracked path.
- The protected plan remains 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Retained WP4d proof
  `artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` remains 2,424
  bytes / SHA-256
  `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`.
  Retained source result
  `artifacts/verify-2026-08-16T082128-760Z-17384/result.json` remains 44,372
  bytes / SHA-256
  `1ca139e2a995c117b87e07de04707cde1de5bf7a2e4ea6ffce38ba605d8564d0`.
- WP5e local verification and its cohesive commit are complete. The committed
  plan's old `commit pending` next action was stale and is superseded by this
  repository-authoritative WP5f plan; WP5e history will not be amended.
- Hosted run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/31988139046`
  executed the exact candidate on Ubuntu 24.04 and Windows 2022. Both
  controller jobs passed checkout, exact Node/pnpm assertion, and frozen
  install, then first failed at `Run invariant suite`; all later controller
  commands were skipped. Fresh-adopter and trusted-container jobs were skipped
  before useful execution because both depended on `controller`.
- Authenticated GitHub job logs show `actions/checkout` used its default
  `fetch-depth: 1` in both jobs. The uploaded toolchain reports prove Node
  `v24.18.0` and pnpm `11.15.1`; the separate action-runtime Node 20-to-24
  warning occurred outside the failing command and is not diagnosed as the
  cause.
- Authenticated downloads independently matched GitHub's artifact metadata:
  Linux ZIP 5,357 bytes / SHA-256
  `3261585491f05b279615372cc7917c12e026b222f4dc910fda9eebafcc51e677`;
  Windows ZIP 5,380 bytes / SHA-256
  `77c8412c4550bf36d133ce839117e14a721e6a0b72200915cf4166848bb050c1`.
  Each contained seven files. Both outer invariant reports stopped after the
  first `protected-integrity` command with exit 1 and no receipt. Both inner
  contract reports ran 11 checks: 9 PASS, 2 FAIL, 0 NOT_READY, with invalid
  expected identity. The first failure was `immutable-contract-lock-hash`
  because the commissioned authority base was missing/not an exact commit;
  `acceptance-prose-bot-aggregation` then failed because base prose could not
  be loaded.
- `.agent/verification-manifest.json` commissions base
  `0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5`, eight commits behind the
  candidate. A disposable `--depth 1 --no-local` clone at the candidate, with
  `CI=true`, exact toolchain and GitHub variables, frozen offline copy-mode
  install, and the workflow's Windows evidence root, reproduced exit 1 and the
  exact 11/9/2 check shape. The reproduction's reachable commit count was one.
- The current workflow has three default shallow checkouts and has explicit
  `needs: controller` edges on both `fresh-adopter-smoke` and
  `trusted-container`. Its executable contract does not currently reject
  either defect.

## Steps

1. [x] Complete the resume protocol, authority/plan/log review, entry and
       protected identity audit, and inspect the failed hosted run through the
       authenticated GitHub boundary.
2. [x] Download and independently inspect both hosted artifacts, establish the
       exact first failed invariant/shared cause, and reproduce it locally in
       a depth-one exact-runtime CI clone.
3. [x] Replace the stale completed-WP5e plan with this bounded WP5f executable
       plan before implementation.
4. [x] Add focused workflow-contract regressions that reject a shallow or
       omitted full-history checkout in any job and reject controller-gated
       fresh-adopter or trusted-container scheduling.
5. [x] Apply the smallest workflow correction: request full history for all
       three checkouts and remove only the two controller dependency edges.
6. [x] Prove causality by making the reproduced clone's commissioned base
       reachable and rerunning the same exact-runtime invariant command to a
       fresh evidence root; require all four invariant commands and receipts
       to pass.
7. [x] Freeze the semantic tree and run focused receipt-owning workflow/
       invariant regressions, `test:invariants`, `test:orchestrator`,
       `test:unit`, typecheck, lint, and format separately and serially.
8. [x] Independently audit every final receipt, artifact byte count/SHA-256,
       test total/failure/skip count, workflow command and schedule, diffs,
       immutable/commissioning/readiness/verifier/Doctor/Status/invariant/
       example/package/lock identities, retained WP4d evidence, private
       state/lease absence, and all protected-plan identities.
9. [x] Update this plan and `docs/autonomy-log.md`; update the decision log only
       if implementation creates a durable decision beyond enforcing WP5e's
       already committed independent-boundary decision. Stage only explicit
       WP5f paths, run cached diff/scope checks, create exactly one cohesive
       commit, and do not push.

## Acceptance Criteria

- The workflow remains formatted, parseable, least-privilege YAML with its
  existing triggers, exact toolchains, runner matrix, full-SHA actions, serial
  commands, unique evidence roots, uploads, and real Linux-only OCI command.
- All three checkout steps explicitly request complete history. A contract
  mutation to default/depth-one checkout fails, and the commissioned base is
  demonstrably reachable in the corrected history model.
- Fresh-adopter and trusted-container jobs have no dependency or condition on
  controller success. Contract mutations that restore either dependency fail.
  A controller failure can no longer suppress their matrix expansion or job
  execution.
- With full history available, the exact local shallow-clone reproduction
  advances from the hosted 11-check/2-failure shape to four passing invariant
  commands with valid command-owned receipts and independently verified
  artifacts. No invariant meaning or authority data changes.
- Focused regression checks, invariant suite, applicable broad suites, and
  receipt-owning static checks pass on the frozen local tree with no failures
  and only the two declared Windows POSIX skips in broad Vitest aggregates.
- Package/lock/script, product/controller/provider/OCI, config/schema/migration,
  commissioning/readiness/verifier, Doctor/Status, invariant, example,
  retained-evidence, and protected-plan identities remain unchanged.
- One cohesive commit contains only intended WP5f workflow, contract/test, plan,
  and log paths. It is not pushed. Hosted validation remains explicitly pending
  until the user pushes the new commit.

## Verification

All local commands use the repository-pinned Windows Node directory first on
`PATH` and `.tools\node-v24.18.0-win-x64\corepack.cmd` for pnpm. Long commands
run separately and serially.

Implementation diagnostics:

1. Focused Vitest for `exact-runtime-workflow-contract.test.ts`, including
   deliberate shallow-checkout and dependency-edge mutations.
2. Prettier YAML parse/format validation and exact workflow contract probes.
3. In the retained disposable depth-one reproduction, fetch/unshallow the
   candidate history and rerun `pnpm test:invariants` with the exact CI
   variables into a fresh evidence root; independently validate all child
   receipts/artifacts and the 13-check contract report.

Final frozen-tree commands:

1. Receipt-owning focused workflow/invariant shard through
   `tools/run-tool-evidence.mjs invariant-vitest` into a fresh WP5f evidence
   directory.
2. `pnpm test:invariants`, `pnpm test:orchestrator`, and `pnpm test:unit`, each
   into a separate fresh command-owned evidence directory.
3. Receipt-owning `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each
   into a separate fresh command-owned evidence directory.
4. No local OCI run: this correction changes job scheduling and checkout
   history, not the OCI execution provider or matrix. Real OCI execution
   remains a hosted boundary and may not be replaced with a mock.
5. Independent receipt/artifact/hash/count audit; exact workflow checkout,
   command, schedule, and action-pin audit; `git diff --check`; staged
   `git diff --cached --check`; explicit path review; protected/immutable/
   retained/private-state identity audit.
6. One commit without push, followed by HEAD/tree/parent/divergence/status and
   protected-plan identity re-audit.

Evidence invalidation:

- Any workflow or workflow-contract/test semantic change invalidates focused
  evidence and requires the focused shard again.
- Any invariant, authority-anchor, commissioning, verifier, controller,
  provider, or config/schema source change broadens this correction and
  invalidates the relevant aggregate; revise the plan before proceeding.
- Record-only plan/log changes after the semantic freeze require static,
  format, diff, and scope reinspection but do not justify rerunning unaffected
  long semantic suites.

## Risks and Recovery

- Full history increases checkout transfer size, but the commissioned base and
  other Git-anchored contracts require actual commit reachability. The current
  repository is small; weakening authority validation or fetching an unbound
  guessed depth is unacceptable.
- Removing `needs` permits three diagnostic boundaries to consume runner time
  concurrently and can expose more than one failure in a run. That is the
  intended independent-observability property already recorded in WP5e; job
  conclusions still aggregate normally at workflow level.
- Static workflow tests prove configuration, not hosted runner behavior. Linux,
  Windows, fresh-adopter, artifact-upload, POSIX, and real Docker validation
  stay pending until the next pushed commit executes on GitHub.
- The downloaded hosted artifacts are ignored diagnostic evidence and remain
  outside the commit. The protected human plan is never used as a cleanup
  target.
- Recovery is an ordinary revert of the one WP5f commit. No push, workflow
  rerun, recommissioning, state mutation, history rewrite, or destructive
  repository cleanup is required.

## Progress and Evidence

- 2026-08-16: Read the frozen authority, autonomous contract, plan standard,
  stale WP5e plan, newest autonomy/decision entries, CI specialist guidance,
  and browser/authenticated-boundary guidance before implementation.
- 2026-08-16: Entry HEAD/tree/parent/divergence, retained WP4d artifacts, and
  protected-plan bytes/hash/blob identities matched the handoff exactly.
- 2026-08-16: Authenticated GitHub job logs and both artifact ZIPs established
  the first failing command, artifact inventory, exact report semantics, and
  shared shallow-checkout cause on Linux and Windows. ZIP byte counts and
  SHA-256 digests independently matched GitHub metadata. The action Node
  deprecation warning is retained as a separate warning, not conflated with
  the failure.
- 2026-08-16: A disposable exact-runtime depth-one clone reproduced the hosted
  failure with one reachable commit and the identical 11 total / 9 PASS / 2
  FAIL contract-integrity shape. The source-commissioned base is a valid local
  commit eight commits behind HEAD, establishing missing history rather than
  changed authority as the cause.
- 2026-08-16: Added executable workflow-contract requirements for one explicit
  full-history checkout per job and no controller dependency on the adopter or
  OCI boundaries. Before the workflow change, the focused suite failed its
  positive contract case because controller observed zero `fetch-depth: 0`
  declarations; after adding all three declarations and removing the two
  `needs: controller` edges, the focused suite passed 3/3, including deliberate
  shallow/omitted-history and restored-dependency mutations.
- 2026-08-16: Unshallowing the same disposable reproduction made 54 commits and
  the commissioned base reachable. The unchanged exact-runtime invariant
  command then passed all four serial commands in 31,058 ms. Independent audit
  matched 5 PASS receipts to 5 artifacts totaling 39,420 bytes, with zero
  mismatches; contract integrity passed 13/13 with valid check identity.
- 2026-08-16: The first receipt-owning lint gate rejected the new literal-space
  regex under `no-regex-spaces`. It retained no PASS receipt. The exactly
  equivalent `{4}` form passed focused ESLint, Prettier, and 3/3 workflow tests.
  Because that source byte changed, all accepted gates were rerun into fresh
  `final-2` roots; earlier green broad reports are diagnostic only.
- 2026-08-16: Accepted exact-tree evidence passed: focused 14/14 with zero
  skips; all four invariants (contract 13/13, schema 7/7, policy 15/15,
  fail-closed 61/61); orchestrator 582/584 across 178/178 suites with zero
  failures and the two declared Windows POSIX skips; unit 595/597 across
  180/180 suites with zero failures and the same two skips; and receipt-owning
  typecheck, lint, and format. Independent audit matched 11 PASS receipts to 11
  artifacts totaling 460,616 bytes with zero byte/hash/count mismatches.
- 2026-08-16: Independent workflow audit found three full-history checkouts,
  zero dependency keys/references, nine full-SHA actions, exact runtime pins,
  all six controller commands once, one unchanged real OCI matrix invocation,
  and no completion shortcut. Forty-six critical tracked files matched entry
  HEAD; immutable baseline/active/actual hashes, commissioning, permanent
  readiness history, verifier/profile, Doctor `2.0.0`, Status `1.0.0`, all four
  invariant IDs and 13 check IDs, config/schema/example/package/lock surfaces,
  retained evidence, private ref/path absence, and all protected-plan
  identities passed. The correction enforces WP5e's existing independent-job
  decision, so `docs/decision-log.md` did not require a new entry.

## Next Action

The revision containing this plan is the one cohesive WP5f commit. Do not push
it in this session. After the user pushes it, inspect the new hosted run, logs,
and artifacts; only then reconcile the remaining WP5 hosted evidence gap.
