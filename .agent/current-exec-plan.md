# Current Execution Plan

**Status:** WP5g locally complete and independently audited; final commit is the revision containing this plan
**Updated:** 2026-08-17
**Owner:** autonomous loop

## Objective

Complete one cohesive WP5g increment that reconciles the hosted Exact runtime
CI run for pushed commit `8ffdbcd83b3d07c1f49b91a057ffe5f8e1ec7d30`
and fixes its earliest causal failure. Correct the trusted-container workflow
invocation so pinned pnpm does not pass a bare `--` to the strict OCI matrix
parser, strengthen executable workflow regression coverage for the exact
argument boundary, update the one operator-facing invocation, run the
applicable exact-toolchain local suites with command-owned evidence, audit the
results independently, and create one narrow commit without pushing.

This increment does not fix or relabel the later hosted controller-suite
portability failures or the Windows fresh-adopter offline-store failure. It
does not change OCI matrix cases, containment, runtime/provider behavior,
authority, commissioning, invariant meanings, verifier/profile/completion
semantics, dependencies, package scripts, or product-domain scope. It does
not run source no-argument verification, rerun the completed WP4d proof,
dispatch or rerun GitHub Actions, perform a local non-Linux OCI substitution,
or begin WP6.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the original acceptance meanings and immutable
  lock identities, hidden-validation custody, active and historical
  commissioning, the permanent readiness marker/history, exact verifier
  semantics, Doctor schema `2.0.0`, Status schema `1.0.0`, invariant IDs and
  meanings, configuration/schema parity, examples, package/lock files, and
  all completed evidence.
- Preserve exact Node `24.18.0`, pnpm `11.15.1`, Linux/Windows runner labels,
  full-history checkouts, full-SHA action pins, least-privilege permissions,
  independent job scheduling, serial receipt-owning controller commands,
  unique evidence roots, artifact uploads, and the real Linux-only Docker
  probe and OCI matrix owner.
- The trusted-container command must invoke the unchanged package script and
  supply exactly `--output artifacts/ci/trusted-container/matrix` to its
  strict parser. A package-manager separator that is forwarded as a literal
  argument is not permitted.
- Do not make the OCI parser ignore unknown arguments, remove a matrix case,
  introduce a mock, add `continue-on-error`, weaken conditions or receipts,
  or claim real OCI PASS without a successful hosted matrix report.
- Treat all five hosted jobs, their complete logs, all ten annotations, and
  all five artifacts as evidence. A green invariant stage does not compensate
  for a later failed job stage.
- Use `.tools\node-v24.18.0-win-x64\corepack.cmd` with that Node directory
  first on `PATH`; run long local suites separately and serially.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry branch is `master`, HEAD
  `8ffdbcd83b3d07c1f49b91a057ffe5f8e1ec7d30`, tree
  `c736c6e6af9ff48e2d70669269c06f4a9f0ab4f9`, parent
  `a4c024ff97d459d170a2b2dae2d5cd92a4701899`, and upstream
  `origin/master` at `0 ahead / 0 behind`. The tracked tree and index are
  clean; the protected human plan is the sole untracked path.
- The protected plan remains 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- Hosted run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/32029510422`
  is push run 2, attempt 1 for the exact HEAD. It ran from
  `2026-08-17T12:22:11Z` through `12:28:41Z` and concluded `failure`.
  Public metadata, authenticated GitHub connector logs/downloads, the public
  annotation API, and the visible run summary agree on five independently
  scheduled jobs, four errors, and five action-runtime warnings.
- Controller Linux and Windows both checked out with `fetch-depth: 0`,
  installed exact Node/pnpm, reached the commissioned base, and passed all
  four invariant commands. Both contract reports passed 13/13 checks. Linux
  then failed `test:orchestrator` at 574/584 passed, 9 failed, 1 skipped across
  178 suites; Windows failed at 508/584 passed, 74 failed, 2 skipped. Later
  controller unit/static commands were correctly skipped and both failed
  commands retained ERROR manifests without PASS receipts.
- Fresh-adopter jobs were independently scheduled. Linux passed its real
  smoke, two receipt-owning generated commands, and 4/4 tests. Windows failed
  during the generated repository's frozen offline install with
  `ERR_PNPM_NO_OFFLINE_TARBALL` for `@eslint/js@10.0.1`; it produced no smoke
  PASS result. This is a remaining WP5 portability defect, not part of the
  first-cause OCI repair.
- Trusted-container was independently scheduled on Ubuntu 24.04, used full
  history and exact tools, completed `docker version` and `docker info`, and
  invoked the real package script. At `12:22:31Z`, before any matrix case, its
  strict parser rejected `Unknown argument --.` because the workflow used
  `pnpm test:oci-container -- --output ...`. This was the earliest causal job
  failure in the hosted run.
- Authenticated artifact ZIP downloads independently match GitHub metadata:
  controller Linux 48,953 bytes /
  `ec6a89c22e1299bf23d3278b9544eeab652aca18379d185ccdef49113bf1a6aa`;
  controller Windows 52,528 /
  `cad946551db47d05bb374ada84fe84f73faaffe21d9522e16a8229445e6ac467`;
  adopter Linux 15,137 /
  `73b4f34fa67367076a39c23334e8519e2ce121a88ee2edb2d66ba1a5b2b9c070`;
  adopter Windows 8,685 /
  `c730cc1866b570dc6b98ea2eb27459ffd3959775398a205b32e04a2502fedb90`;
  trusted-container 1,889 /
  `a3bdaad59fda3d336dc1d1820367702e213503faec6643526f814f5bc7885eea`.
  Extracted inventories and failure reports are retained under ignored
  `artifacts/hosted/run-32029510422/`.
- A pinned local argv reproduction under that retained evidence root ran
  `pnpm argv -- --output artifacts/ci/trusted-container/matrix` and observed
  `['--','--output','artifacts/ci/trusted-container/matrix']`, exit 1, exact
  Node `v24.18.0`, and pnpm `11.15.1`. Its 119-byte `observed.json` has SHA-256
  `8446064855500a29db5b697c8c3aad8d6228aa0e9054b8da55969b4d363505be`.
- The malformed invocation is present in the workflow, its executable
  contract and mutation test, and README operator guidance. Package scripts,
  the strict OCI parser, matrix implementation, and real Docker probes are
  otherwise outside the correction.

## Steps

1. [x] Complete the resume protocol, authority/plan/log review, entry and
       protected identity audit, and exact upstream/run discovery.
2. [x] Inspect every hosted job conclusion, step, full log, annotation, and
       artifact; download, hash, extract, and independently inspect all five
       artifact ZIPs; distinguish passed invariant/adopter evidence from
       non-passing controller, Windows-adopter, and OCI boundaries.
3. [x] Reproduce the earliest causal OCI failure locally under exact pinned
       Node/pnpm and retain the argv observation.
4. [x] Replace the stale completed-WP5f plan with this bounded WP5g plan
       before implementation.
5. [x] Add a focused workflow-contract regression that rejects the literal
       extra separator while retaining the exact real package command,
       output path, Linux-only engine probe, and complete matrix boundary.
6. [x] Correct the workflow, executable contract/test, and README invocation
       to use pinned pnpm's actual forwarding syntax and no other semantic
       change.
7. [x] Prove the corrected pinned invocation forwards only `--output` and its
       value; run the focused receipt-owning workflow shard.
8. [x] Freeze the semantic tree and run direct invariants, orchestrator, unit,
       typecheck, lint, and format checks separately into fresh command-owned
       evidence roots.
9. [x] Independently audit every final receipt, artifact byte count/SHA-256,
       test/failure/skip total, workflow command/action/history/scheduling
       property, diff, authority/commissioning/readiness/verifier/Doctor/
       Status/invariant/example/package/lock identity, retained hosted/WP4d
       evidence, private state/lease absence, and protected-plan identity.
10. [x] Update this plan and `docs/autonomy-log.md`; update the decision log
        only if a durable decision beyond correcting malformed argv is made.
        Stage only explicit WP5g paths, audit the cached scope, create one
        cohesive verified commit, and do not push.

## Acceptance Criteria

- The workflow remains formatted, parseable, least-privilege YAML with the
  same triggers, exact toolchains, full histories, independent jobs, runner
  matrix, full-SHA actions, serial evidence commands, unique evidence roots,
  uploads, real Docker probes, and unchanged package-script owner.
- The trusted-container step uses exactly
  `pnpm test:oci-container --output artifacts/ci/trusted-container/matrix`.
  An executable mutation restoring ` -- --output` fails the workflow contract;
  mock, missing-output, platform, scheduling, and history mutations remain
  rejected.
- An exact pinned argv probe demonstrates the corrected syntax supplies only
  `--output` and the artifacts path, with no leading bare separator.
- Focused workflow regression, invariant suite, applicable broad suites, and
  receipt-owning static checks pass on the frozen local tree with zero
  failures and only the two declared Windows POSIX skips in broad Vitest
  aggregates.
- No package/lock/script, parser/matrix/provider/containment, authority,
  commissioning/readiness/verifier, Doctor/Status, invariant, example,
  retained-evidence, private-state, or protected-plan identity changes.
- One cohesive commit contains only the intended workflow, executable
  contract/test, README, plan, and autonomy-log changes. It is not pushed.
  Real OCI PASS and the other hosted job corrections remain pending actual
  later hosted evidence.

## Verification

All local commands use the repository-pinned Windows Node directory first on
`PATH` and `.tools\node-v24.18.0-win-x64\corepack.cmd` for pnpm. Long commands
run separately and serially.

1. Before/after pinned argv probes retained under
   `artifacts/hosted/run-32029510422/reproduction/`.
2. Focused Vitest for `exact-runtime-workflow-contract.test.ts`, including a
   deliberate restored-extra-separator mutation, through
   `tools/run-tool-evidence.mjs invariant-vitest` into a fresh WP5g evidence
   root.
3. `pnpm test:invariants`, `pnpm test:orchestrator`, and `pnpm test:unit`, each
   into a separate fresh command-owned evidence directory.
4. Receipt-owning `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each
   into a separate fresh command-owned evidence directory.
5. No local OCI claim: Windows cannot substitute for the required Linux
   Docker controller. The argv correction is locally executable; complete
   normal/adversarial OCI execution remains a later hosted boundary.
6. Independent receipt/artifact/hash/count audit; workflow exact-command,
   action-pin, checkout, schedule and scope audit; `git diff --check`; staged
   `git diff --cached --check`; protected/immutable/retained/private-state
   identity checks; one no-push commit and post-commit identity audit.

Evidence invalidation:

- Any workflow or workflow-contract/test semantic change invalidates focused
  evidence and the corrected argv probe.
- Any invariant, authority, commissioning, verifier, controller, provider,
  matrix, config/schema, package, or lock source change broadens this repair
  and invalidates the relevant aggregates; revise the plan first.
- Record-only plan/log changes after semantic freeze require static format,
  diff, and scope reinspection but do not justify rerunning unaffected long
  semantic suites.

## Risks and Recovery

- Removing the extra separator is specific to pinned pnpm `11.15.1` behavior;
  the exact-toolchain argv probe and contract bind that assumption. The OCI
  parser remains strict and still rejects every unknown argument.
- Static/local evidence cannot establish Linux Docker matrix success. A later
  pushed commit must be observed through all real cases before WP5 can credit
  trusted-container PASS.
- Hosted controller reports expose multiple Linux portability/test failures
  and a large Windows short-path/realpath cluster; Windows adopter exposes an
  offline-store defect. They are preserved as non-passing evidence and remain
  the next WP5 work after this earliest-cause correction.
- The five hosted ZIPs, extracted inventories, and argv reproduction are
  ignored diagnostics and remain outside the commit. The protected human plan
  is never used as a cleanup target.
- Recovery is an ordinary revert of the one WP5g commit. No push, workflow
  rerun, recommissioning, state mutation, history rewrite, dependency change,
  or destructive cleanup is required.

## Progress and Evidence

- 2026-08-17: Read frozen authority, autonomous contract, plan standard, stale
  WP5f plan, newest autonomy/decision entries, and GitHub/CI/browser specialist
  guidance before implementation.
- 2026-08-17: Confirmed exact pushed HEAD/upstream identity and unchanged sole
  protected untracked file.
- 2026-08-17: Completed five-job hosted log/step/annotation/artifact audit.
  Full history corrected the commissioned-base failure on both controller
  platforms; independent scheduling also worked. The run still failed four
  jobs for three distinct later boundaries, so no aggregate or OCI PASS is
  claimed.
- 2026-08-17: Downloaded all five authenticated artifact ZIPs, matched every
  GitHub byte count and digest, extracted them under retained ignored evidence,
  and inspected command-owned PASS/ERROR boundaries and test totals.
- 2026-08-17: Reproduced the earliest trusted-container failure with exact
  pinned pnpm argv forwarding and retained the 119-byte observation record.
- 2026-08-17: Added the restored-separator mutation first. The malformed
  baseline produced the intended 1 failed / 2 passed focused result because
  the mutation remained accepted. After correcting only workflow, contract,
  mutation source, and README argv syntax, the direct focused suite passed
  3/3 and the strict OCI parser/matrix remained byte-identical.
- 2026-08-17: The corrected exact-toolchain probe executed
  `pnpm argv-corrected --output ...`, passed exit 0, and observed exactly
  `['--output','artifacts/ci/trusted-container/matrix']`. Its 109-byte record
  has SHA-256
  `df1809ca54bb241a1b12755f38290b539b69c8c9c92e9a759ff511e276561793`.
- 2026-08-17: Accepted exact-tree local evidence passed. Focused workflow
  coverage passed 3/3 tests with zero failures/skips across 2/2 suites; its
  1,768-byte report SHA-256 is
  `edea3fd5acbbe6bb32cddaa48d8f90854424f6c5848854798802e1071f21a5e1`.
  Direct invariants passed all four commands in 27,223 ms: contract 13/13,
  schema 7/7, policy 15/15, and fail-closed 61/61. Its 7,232-byte suite report
  SHA-256 is
  `7a4c8a73503b77137bd39891cfc0d4eaccd2fe4bedc19db14d04b4923f318bc7`.
- 2026-08-17: The orchestrator aggregate passed 582/584 tests with zero
  failures and exactly the two declared Windows POSIX skips across 178/178
  suites; its 203,902-byte report SHA-256 is
  `cfbac35a2baa1662f04af5a0559480b89b8ccab5d7edab57874046a363da5186`.
  The complete unit aggregate passed 595/597 with zero failures and the same
  two skips across 180/180 suites; its 207,962-byte report SHA-256 is
  `9ca5dc68aee9ab8d42d43b70319532d66305db1309953855f3c256a7b91c4eea`.
  Both long serial commands completed under their unchanged one-hour wrapper
  limits; no timeout or parallelism was altered.
- 2026-08-17: Receipt-owning typecheck, lint, and format passed. Their report
  SHA-256 values are respectively
  `705e409f6a1032257dc65370aa35aa546b8b639c76253e54dfd2ad4a4b480f14`,
  `11b960b7f380f4eca66185de8b367b3b4d12713b37573279b5afa7acb675c99e`,
  and
  `73e68162c1874321c7e23051186edaf95330a68cd45e201477024390ac3e8b95`.
  Independent audit matched 11 PASS receipts to 11 declared artifacts totaling
  456,720 bytes, with zero receipt/artifact byte, hash, count, status, or
  identity mismatches.
- 2026-08-17: Independent workflow audit found three full-history checkouts,
  zero dependency keys/references, nine full-SHA actions, the exact corrected
  OCI command once, the malformed command zero times, both real Docker probes,
  zero `continue-on-error`, and no source no-argument verification. Immutable
  baseline/active/actual hashes, CAL-1 open/not-started state, commissioned
  readiness profile/base, permanent readiness history, Doctor `2.0.0`, Status
  `1.0.0`, four invariant IDs, package/lock/parser/matrix/example identities,
  retained WP4d evidence, private ref/path absence, and all protected-plan
  identities passed. Correcting malformed argv adds no durable decision, so
  `docs/decision-log.md` remains unchanged.
- 2026-08-17: Recorded the complete hosted and local evidence in the newest
  autonomy-log entry. Final scope is the workflow, executable contract/test,
  current README invocation, active plan, and autonomy log only; retained
  hosted/local artifacts remain ignored and the human plan remains the sole
  untracked path.

## Next Action

The revision containing this plan is the one cohesive WP5g commit. Do not push
it in this session. On the next autonomous resume, inspect any hosted run for
that revision if the user has pushed it; otherwise begin from the highest-
impact retained controller/Windows-adopter portability gap without claiming
OCI PASS.
