# Current Execution Plan

**Status:** WP5h schema-boundary correction complete; exact staged-tree Docker rerun in progress
**Updated:** 2026-08-17
**Owner:** autonomous loop

## Objective

Complete one cohesive WP5h increment that reconciles Exact runtime CI run
`32039150245` for pushed commit
`a0e9af205b7c6dff1155a087dfe56c7786da2b79` and fixes the first causal
trusted-container failure. Replace the WP3d milestone-only requirement for a
non-empty staged index and a repository-specific protected human file with a
generic, fail-closed controller-source identity that supports both a clean
committed checkout and a frozen staged candidate. Add real-Git regression
coverage, run the complete real Docker matrix from an exact pinned Linux
toolchain on the frozen candidate, run applicable exact-toolchain local suites
with command-owned evidence, audit every receipt and artifact independently,
and create one narrow commit without pushing.

This increment does not fix or relabel the hosted controller portability
failures or the Windows fresh-adopter offline-store failure. It does not change
OCI cases, container/image/provider policy, mount/network/resource containment,
artifact export, command receipts, verifier/profile/completion semantics,
dependencies, workflow scheduling, immutable authority, commissioning, or
product-domain scope. It does not claim hosted OCI PASS until a later pushed
revision actually completes the hosted matrix, and it does not begin WP6.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the original acceptance meanings and immutable
  lock identities, hidden-validation custody, active and historical
  commissioning, the permanent readiness marker/history, exact verifier
  semantics, Doctor schema `2.0.0`, Status schema `1.0.0`, invariant IDs and
  meanings, configuration/schema parity, examples, package/lock files, and all
  completed evidence.
- Preserve exact Node `24.18.0` and pnpm `11.15.1`. Windows verification uses
  `.tools\node-v24.18.0-win-x64\corepack.cmd` with that Node directory first on
  `PATH`; real OCI verification uses
  `/home/duncan/.local/node-v24.18.0-linux-x64/bin` first on the Ubuntu WSL
  `PATH` and the reachable real Docker Engine.
- A clean checkout must bind the matrix to exact `HEAD` and `HEAD^{tree}`. A
  staged candidate must bind it to exact `HEAD`, `HEAD^{tree}`, `git
  write-tree`, the staged path count, and a deterministic staged-path digest.
  Any unstaged tracked change remains a hard failure.
- Do not fabricate a staged change, special-case GitHub Actions, ignore unknown
  arguments, remove a matrix case, introduce a mock/fallback, weaken cleanup or
  containment assertions, add `continue-on-error`, or accept a dirty tracked
  source.
- The OCI harness must be repository-generic. It may not require or inspect the
  user-owned `Implementation-ready improvement plan 8-5-26.txt`; preservation
  of that file remains an outer autonomous-work invariant, not an OCI product
  contract.
- Treat all five hosted jobs, their full logs, all nine annotations, and all
  five artifact ZIPs as evidence. A green invariant stage or Linux-adopter job
  does not compensate for a later failed boundary.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry branch is `master`, HEAD and fetched `origin/master` are both
  `a0e9af205b7c6dff1155a087dfe56c7786da2b79` at `0 ahead / 0 behind`. HEAD tree
  is `f998fb50c9ab249b7e07a6d70eebed8ea1513ae9`; parent is
  `8ffdbcd83b3d07c1f49b91a057ffe5f8e1ec7d30`. The tracked tree and index are
  clean; the protected human plan is the sole untracked path.
- The protected plan remains 78,574 bytes with SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Hosted run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/32039150245`
  is push run 3, attempt 1 for the exact HEAD. It ran from
  `2026-08-17T14:28:20Z` through `14:34:40Z` and concluded `failure`. All five
  jobs were independently scheduled from full-history checkouts with exact
  Node/pnpm and full-SHA actions.
- Full hosted logs were inspected: Linux adopter 247 lines / 21,094 characters;
  Windows controller 263 / 22,873; trusted container 259 / 21,779; Windows
  adopter 237 / 21,722; Linux controller 282 / 23,749. The public annotation
  API reports five action-runtime warnings and four process failures, nine
  annotations total.
- Controller Linux and Windows both passed the four-command invariant suite.
  Each retained reports for contract 13/13, schema 7/7, policy 15/15, and
  fail-closed 61/61. Linux then failed the orchestrator aggregate at 574/584
  passed, 9 failed, 1 skipped across 178 suites; Windows failed at 508/584
  passed, 74 failed, 2 skipped. Later controller commands correctly skipped,
  and both failed stages retained ERROR manifests without PASS receipts.
- Fresh-adopter Linux passed its independent real smoke, two receipt-owning
  commands, and 4/4 tests. Fresh-adopter Windows independently failed its
  generated frozen offline install because pnpm could not find
  `@eslint/js@10.0.1` in the Windows store. That remains a separate WP5 defect.
- Trusted-container confirmed Docker client/server `28.0.4`, invoked exactly
  `pnpm test:oci-container --output artifacts/ci/trusted-container/matrix`, and
  reached the strict current script. Before image resolution or any of six
  cases, `git diff --cached --name-only` was empty and line 881 rejected the
  clean checkout as `The WP3d candidate index is empty.` Its 1,061-byte FAIL
  result has SHA-256
  `c428400f08be282d144bb2e844f5970e31908911b3732671591ec3bd24871ea7`,
  empty before/after managed resources, and zero cases.
- All five artifact ZIPs are retained under ignored
  `artifacts/hosted/run-32039150245/` and independently match GitHub metadata:
  controller Windows 52,557 bytes /
  `304aefbb270c78477bd2bff791b13aa216882a3dbf8c2c26b4fa6194726e1ed6`;
  controller Linux 49,000 /
  `c8d5935bf9492395ef22fdf6978785f148dd33c2e80fd92a3f6943c92dbc08f4`;
  adopter Windows 8,674 /
  `753fc7cf1918e59a208e3e03e7877a66af589fd4e143525311eeacd906c7c5f0`;
  adopter Linux 15,137 /
  `ed0cf0db4b98e2205f260bc41f8778d0876d8aeb8114c6bda62609801f841c65`;
  trusted container 2,488 /
  `0b86f79331f255a4fbd4674daa60ec1bae49497d1a5d2d8a07c93cddb7b9c561`.
  Twelve hosted PASS receipts match twelve declared artifacts totaling 80,484
  bytes with zero mismatches.
- The exact current TypeScript was compiled into ignored diagnostic output and
  executed under Linux Node `v24.18.0`, pnpm `11.15.1`, and real Docker
  `29.1.3`. It reproduced the same empty-index failure before any managed
  resource at
  `artifacts/hosted/run-32039150245/reproduction/clean-index-current/result.json`
  (1,062 bytes, SHA-256
  `c86b21780d44da208835804824bfbc55845868eb9677e708c5ea5c618c459278`).
  A historical compiled runner reached a different Docker-policy diagnostic
  and is explicitly not accepted as current-source evidence; it left no
  managed container or volume.
- `container-executor.oci.ts` has carried the milestone-only non-empty-index and
  protected-file assumptions unchanged since WP3d commit `2b65ddc8`. The
  fields are report provenance only; matrix execution itself uses the fixed
  tracked fixture and trusted provider. No test currently exercises clean
  committed versus frozen staged source capture.

## Steps

1. [x] Complete the resume protocol, authority/plan/log review, entry Git and
       protected-file identity audit, fetch, and exact hosted-run discovery.
2. [x] Inspect every hosted job conclusion, step, complete log, annotation, and
       artifact; download/hash/extract all five ZIPs and independently audit
       hosted receipts, artifacts, totals, and failure boundaries.
3. [x] Reproduce the first causal trusted-container failure with exact current
       source under pinned Linux Node/pnpm and real Docker; retain the FAIL
       result and prove no managed resource remains.
4. [x] Replace the completed WP5g plan with this bounded WP5h plan before
       implementation.
5. [x] Add a small controller-source identity owner with
       real-Git tests for clean committed, frozen staged, and unstaged-dirty
       repositories; integrate it into the OCI report and remove the
       milestone-specific protected-file dependency.
6. [x] Run focused regression/type diagnostics, inspect the diff, and correct
       only defects within this source-identity boundary.
7. [ ] **In progress:** record the durable generic source-identity/report
       decision, freeze and
       stage the exact candidate, compile it for Linux, and run the complete
       six-case real Docker matrix with independent cleanup/artifact audit.
8. [ ] Run direct invariants, orchestrator, unit, typecheck, lint, and format
       separately and serially into fresh command-owned evidence roots.
9. [ ] Independently audit every final receipt, artifact byte count/SHA-256,
       test/failure/skip total, OCI case and containment record, diff, immutable
       and commissioning identities, package/lock/workflow scope, retained
       evidence, private state/lease absence, and protected-plan identity.
10. [ ] Update the plan and `docs/autonomy-log.md`, stage only explicit WP5h
        paths, audit the cached scope, create one cohesive verified commit, and
        do not push.

## Acceptance Criteria

- A clean real Git repository with no staged or unstaged tracked changes is
  accepted as `committed-head`; its candidate tree equals `HEAD^{tree}`, staged
  path count is zero, and the empty staged-path digest is deterministic.
- A repository with staged changes and no unstaged tracked changes is accepted
  as `frozen-index`; its candidate tree equals `git write-tree` and differs
  honestly from the recorded HEAD tree when content differs.
- Any unstaged tracked change fails before image creation or matrix execution.
  A clean index is no longer treated as a failure, and no environment/CI
  special case or fabricated change exists.
- OCI result schema advances explicitly for the generic controller-source
  identity. The report no longer names or requires the protected human plan;
  outer repository checks still prove that file unchanged and untracked.
- Exact pinned focused regression and applicable broad suites pass with zero
  failures and only the two declared Windows POSIX skips in broad Vitest
  aggregates.
- The frozen staged candidate completes all six real OCI cases with expected
  dispositions, non-empty normal/boundary/hang evidence, unique container
  identities, valid containment artifacts, and zero managed containers or
  volumes before and after.
- No workflow, package/lock/dependency, OCI case/policy/provider/containment,
  authority, commissioning/readiness/verifier, Doctor/Status, invariant, or
  example semantic change occurs.
- One cohesive commit contains only the source-identity owner/tests, OCI
  integration/report version, plan, autonomy/decision records, and any narrowly
  necessary contract documentation. It is not pushed. Hosted OCI PASS remains
  pending a later human push and actual hosted run.

## Verification

All Windows commands use the repository-pinned Node directory first on `PATH`
and `.tools\node-v24.18.0-win-x64\corepack.cmd`. Long commands run separately
and serially.

1. Focused receipt-owning Vitest for the new source-identity test and directly
   affected workflow/OCI contract tests through
   `tools/run-tool-evidence.mjs invariant-vitest` into a fresh WP5h evidence
   root.
2. Direct TypeScript diagnostic, then the full receipt-owning `pnpm typecheck`,
   `pnpm lint`, and `pnpm format:check` commands in separate evidence roots.
3. `pnpm test:invariants`, `pnpm test:orchestrator`, and `pnpm test:unit`, each
   serially into a separate fresh command-owned evidence directory.
4. After tracked source/tests/docs freeze and staging, compile the exact
   TypeScript with pinned Windows TypeScript using `--allowJs true --checkJs
   false --noEmit false` into ignored output. Execute that exact emitted OCI
   entry under Ubuntu WSL with
   `/home/duncan/.local/node-v24.18.0-linux-x64/bin` first on `PATH`, exact
   pnpm `11.15.1`, and real Docker, selecting all cases and a fresh ignored
   output directory.
5. Independently validate the OCI result, every case disposition and
   containment-report hash/size, hang descendant evidence, unique identities,
   image/provider/store facts, and before/after cleanup. This local real-Docker
   run validates the implementation but does not substitute for a later hosted
   Ubuntu run.
6. Independently audit all final command receipts/artifacts/hashes/counts;
   inspect `git diff --check` and staged scope; verify immutable/protected/
   retained/private-state identities; create one no-push commit and audit its
   commit/tree/parent identities.

Evidence invalidation:

- Any source-identity, OCI entry, fixture, provider, containment, config, or
  package/lock semantic change invalidates the real OCI matrix and affected
  focused/broad evidence.
- Any test/runtime source change invalidates the relevant focused and aggregate
  evidence. Long receipt-owning suites run only after the semantic tree is
  frozen.
- Final record-only plan/log text must be frozen before the exact staged-tree
  OCI run. Outcomes after that freeze remain in command-owned ignored artifacts
  and the final handoff rather than mutating the verified candidate.

## Risks and Recovery

- Supporting two explicit source modes must not turn source capture into a
  dirty-tree bypass. Real-Git tests bind the distinction to Git objects, and
  unstaged tracked content remains rejected.
- The report shape changes from WP3d's local milestone provenance. Advancing the
  schema and recording the decision is safer than silently placing committed
  identity into fields that claim a staged candidate. Historical evidence
  remains immutable and self-versioned.
- Local Docker is WSL2 Engine `29.1.3`; the hosted runner exposed Engine
  `28.0.4`. A complete local matrix proves real containment on the changed
  implementation, but only a later pushed run can close native hosted Ubuntu.
- Controller Linux/Windows and Windows fresh-adopter failures remain separate
  known WP5 gaps and are not allowed to broaden this increment.
- Retained hosted/reproduction/build output is ignored diagnostic evidence.
  Recovery is an ordinary revert of the one WP5h commit; no push, workflow
  rerun, recommissioning, state mutation, history rewrite, dependency change,
  or destructive cleanup is required.

## Progress and Evidence

- 2026-08-17: Read the frozen authority, autonomous contract, plan standard,
  completed WP5g plan, and newest autonomy/decision records. Fetched remote
  state and confirmed the handoff commit had been pushed without any push from
  this session.
- 2026-08-17: Used the GitHub Actions inspection workflow through the connected
  GitHub app after local `gh` authentication was unavailable. Audited all five
  terminal jobs, complete logs, steps, nine annotations, and five artifacts.
- 2026-08-17: Confirmed the WP5g argv correction worked exactly. Trusted
  container reached real Docker and strict current TypeScript, then exposed the
  next pre-matrix source-identity defect. No OCI PASS is claimed.
- 2026-08-17: Retained and independently hashed every hosted ZIP/extraction;
  matched 12 PASS receipts to 12 declared artifacts totaling 80,484 bytes with
  zero mismatches. Preserved all ERROR/no-receipt boundaries honestly.
- 2026-08-17: Reproduced the exact current-source clean-index failure under
  pinned Linux runtime and real Docker. The result has zero cases and clean
  before/after managed-resource inventories. A mismatched historical runner
  diagnostic is retained but rejected as evidence for this cause.
- 2026-08-17: Implemented a generic dual-mode source identity and advanced the
  OCI result to schema `1.1.0`. Clean committed and frozen staged trees bind to
  explicit Git objects; unstaged tracked changes still fail closed. The OCI
  harness no longer contains any protected-human-file identity.
- 2026-08-17: Receipt-owning focused regression passed 6/6 tests with zero
  failures/skips across 4/4 suites. Its 2,860-byte report SHA-256 is
  `2b0778a2ac5ce95bdbec86a92709617c9cb9568e0ef0b900e34c9d716565e2c5`.
  Receipt-owning typecheck and lint diagnostics passed; their report SHA-256
  values are
  `3a3e7ad14c73a68dbc7095618a790d17384438c14e97680b00d4ef95b81cfe63`
  and
  `73085a2ff0df3c500c68ea2b7c1234692ab773fdb7ec604babba767ac6bbe9e6`.
  The generic report decision is recorded in `docs/decision-log.md`, and the
  final stable-tree evidence protocol is recorded in `docs/autonomy-log.md`.
- 2026-08-17: The first staged-tree Docker attempt proved the new
  `frozen-index` identity and reached the normal case, then failed because the
  OCI entry's initial global schema-version bump also changed validation of
  the unchanged containment report. Its rejected 1,957-byte FAIL result is
  retained at `artifacts/wp5h-oci-final-20260817/result.json` with SHA-256
  `29bcbcf150055641b51a4be0bcc9eb78592fdc5dd82286abec15d05ca1105752`,
  zero accepted cases, and empty before/after resource inventories. Matrix
  result schema `1.1.0` and containment report schema `1.0.0` now have separate
  constants; no containment rule or case expectation was relaxed.

## Next Action

Freeze and stage only the corrected WP5h files, compile that exact staged tree
to a fresh `artifacts/manual/wp5h-oci-final-build-r2/` root, and run the
complete real six-case Docker matrix into
`artifacts/wp5h-oci-final-20260817-r2/` before the serial final local suites.
