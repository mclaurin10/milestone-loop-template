# Current Execution Plan

**Status:** WP5i exact OCI fixture-store hydration implemented; final frozen-tree verification in progress
**Updated:** 2026-08-17
**Owner:** autonomous loop

## Objective

Complete one cohesive WP5i increment that reconciles pushed WP5h commit
`a868d9d92227cb95b17db93b14038ae2d24ec026` against Exact runtime CI run
`32047579881` and fixes the first causal trusted-container failure after the
new committed-source identity succeeded. Make the Linux Docker job populate
the controller's pnpm store from the exact protected OCI fixture lock before
launching the unchanged offline/network-denied six-case matrix. Bind that
preparation order and command shape in the executable workflow contract,
reproduce the empty-store failure and hydrated-store success with exact pinned
Linux tooling, run the complete matrix from the frozen candidate against the
fresh hydrated store, run applicable exact-toolchain local suites with
command-owned evidence, independently audit all evidence, and create one
narrow local commit without pushing.

This increment does not fix or relabel the Linux/Windows controller portability
failures or the Windows fresh-adopter cross-drive offline-store failure. It does
not change the protected OCI fixture package or lockfile, root package or
lockfile, Docker image/provider, candidate command, container network/mount/
resource/artifact/cleanup policy, six matrix cases, source-identity schema,
workflow scheduling, commissioning/readiness/verifier semantics, immutable
authority, or product-domain scope. It does not claim hosted OCI PASS until a
later pushed revision actually completes the hosted matrix, and it does not
begin WP6.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the original acceptance meanings and immutable
  lock identities, hidden-validation custody, active and historical
  commissioning, the permanent readiness marker/history, exact verifier
  semantics, Doctor schema `2.0.0`, Status schema `1.0.0`, invariant IDs and
  meanings, configuration/schema parity, examples, package/lock files, and all
  completed evidence.
- Preserve exact Node `24.18.0` and pnpm `11.15.1`. Windows commands use
  `.tools\node-v24.18.0-win-x64\corepack.cmd` with that Node directory first on
  `PATH`; Linux reproduction and real OCI use
  `/home/duncan/.local/node-v24.18.0-linux-x64/bin` first on Ubuntu WSL `PATH`.
- The candidate container remains offline, network-denied, and bound to the
  read-only pnpm v11 store. Store hydration is a controller preparation step
  over an exact `HEAD:fixtures/oci-candidate` archive in a disposable scratch
  directory, not candidate network access or a writable store mount.
- The hydration command must ignore the parent workspace, use the archived
  fixture as its lockfile root, keep the lock frozen, populate the same store
  later resolved and mounted by the OCI entry, and run after the source install
  but before the Docker matrix. It may not update a tracked lockfile, resolve an
  unpinned dependency graph, or substitute the root lockfile for the fixture
  lock.
- Do not fabricate cached content, add a fallback or retry that permits network
  in the candidate, remove a matrix case, loosen an expected disposition,
  disable frozen/offline/store-integrity flags, change image/provider policy,
  add `continue-on-error`, or treat structural workflow inspection as hosted
  execution evidence.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- After authenticated fetch, local `master`, `HEAD`, and `origin/master` are
  exactly `a868d9d92227cb95b17db93b14038ae2d24ec026`, tree
  `24954859be765bd893b5a3cfd41e2634a22578af`, parent
  `a0e9af205b7c6dff1155a087dfe56c7786da2b79`, at `0 ahead / 0 behind`.
  The tracked tree and index are clean; the protected human plan is the sole
  untracked path.
- All four immutable files match baseline, active, and actual SHA-256. CAL-1 is
  `open_not_started`. The repository remains on readiness profile with its
  permanent transition history intact.
- The protected plan remains exactly 78,574 bytes with SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Exact push run
  `https://github.com/mclaurin10/milestone-loop-template/actions/runs/32047579881`
  (run 4, attempt 1) executed the exact HEAD from
  `2026-08-17T16:51:24Z` through `16:57:56Z` and concluded `failure`. Every
  job, step, complete log, all nine annotations, and all five artifacts were
  inspected. Five action-runtime warnings and four exit-code failure
  annotations were present.
- Linux fresh-adopter passed independently: two receipt-owning commands, 4/4
  tests, exact two-commit bootstrap history, and completion-ineligible smoke
  status. Windows fresh-adopter failed independently because its generated
  repository selected a different default drive store and could not find
  `@eslint/js@10.0.1`; that remains outside WP5i.
- Both controllers passed the four-command invariant suite: contract 13/13,
  schema 7/7, policy 15/15, and fail-closed 61/61. Linux then reported 577/587
  passed, 9 failed, 1 skipped across 180 suites. Windows reported 509/587
  passed, 76 failed, 2 skipped. Later commands correctly skipped and both
  retained ERROR manifests with no PASS receipt. These portability failures
  remain outside WP5i.
- Trusted-container confirmed real Docker client/server `28.0.4`, exact Node
  and pnpm, and exact argv. Result schema `1.1.0` accepted the clean checkout as
  `committed-head`; its HEAD, HEAD tree, and candidate tree all equal the exact
  pushed identity, with zero staged paths and the deterministic empty digest.
  The normal container then exited 1 because its offline install could not find
  `vite@8.2.1`. The 2,004-byte result SHA-256 is
  `c36e504e25978aae4b8cc96a1f4d12c11228ad9d0bad4452bd23a8e669c042c4`.
  The candidate, exporter, and both volumes were removed, and before/after
  managed-resource inventories are empty.
- All five artifact ZIPs are retained under ignored
  `artifacts/hosted/run-32047579881/` and match GitHub metadata: controller
  Windows 52,900 bytes / SHA-256
  `30700153ff0b4a7fce6dfb598d28defdc42113dc8dedcfb6e1dd962fd4b107af`;
  controller Linux 49,138 /
  `329883c4a35953718d0af13345c8a8aa6151bd1d236b2949fd3b97f501d1f126`;
  adopter Windows 8,733 /
  `5917c3c7768d423bb2d1c2dd907865bec1eee56864b63f7852bd562b2aaf80f9`;
  adopter Linux 15,189 /
  `fdcd3ff4d78fdc4fe5d3aa1c4af48501850540c8f53358c645cb731ed7764f96`;
  trusted container 5,481 /
  `3b66cd202d706dbb0c00f99683083beada5bcab6d2d21a9f9793bbb828d5c32d`.
  Independent audit matched 12 PASS receipts, 12 declared artifacts totaling
  80,482 bytes, and 12 manifest bindings with zero mismatches.
- A no-local/no-hardlinks clone of the exact commit and a new empty pnpm store
  reproduced the cause under Linux Node `v24.18.0` and pnpm `11.15.1`. Root
  frozen install succeeded, but the exact fixture archived outside workspace
  discovery failed offline with `ERR_PNPM_NO_OFFLINE_TARBALL` for
  `vite@8.2.1`. The root lock resolves `vite@8.2.0`; the protected fixture lock
  resolves `vite@8.2.1`. The 2,836-byte reproduction record is
  `artifacts/hosted/run-32047579881/reproduction/oci-store-closure/result.json`,
  SHA-256
  `29ad277635fcf1e3f713ad71c0d4b856834afd929dc297da4452674d720ce94d`.

## Steps

1. [x] Complete the resume protocol, authority/plan/log review, fetch, Git and
       protected-file identity audit, immutable hash audit, and retained WP5h
       evidence inspection.
2. [x] Discover exact run `32047579881`; inspect every job, step, complete log,
       annotation, and artifact; download/hash/extract all five ZIPs and
       independently audit hosted receipts, artifacts, manifests, totals, and
       failure boundaries.
3. [x] Prove the WP5h committed-source identity succeeded in hosted Docker and
       identify the next first causal failure from its containment artifact.
4. [x] Reproduce the missing fixture dependency with an exact clean clone,
       empty store, root-only hydration, pinned Linux tooling, and isolated
       fixture install; retain a structured reproduction record.
5. [x] Replace the stale completed WP5h plan with this bounded WP5i plan before
       implementation.
6. [x] Inspect the workflow contract owner/tests and implement the smallest
       exact Git-archived scratch fixture-store hydration command plus mutation
       coverage for source path, workspace isolation, frozen lock, scratch
       cleanup, and ordering.
7. [x] Run focused regression/type diagnostics; exercise an empty-store
       failure control and hydrated-store offline success without changing
       either tracked lockfile; inspect and correct only defects within this
       boundary.
8. [ ] **In progress:** freeze and stage the exact candidate, hydrate a fresh
       Linux store from the exact fixture lock, compile the staged TypeScript,
       and run the full six-case real Docker matrix against that store with
       independent cleanup/containment/artifact audit.
9. [ ] Run direct invariants, orchestrator, unit, typecheck, lint, and format
       separately and serially into fresh command-owned evidence roots.
10. [ ] Independently audit every final receipt, artifact byte count/SHA-256,
        test/failure/skip total, OCI case and containment record, diff,
        immutable and commissioning identities, package/lock scope, retained
        evidence, private state/lease absence, and protected-plan identity.
11. [ ] Update the plan and `docs/autonomy-log.md`; update the decision log only
        if implementation requires a durable decision; stage only explicit
        WP5i paths, audit cached scope, create one cohesive verified local
        commit, and do not push.

## Acceptance Criteria

- The Exact runtime workflow explicitly hydrates the same controller pnpm
  store from an exact `HEAD:fixtures/oci-candidate` archive after source install
  and before Docker matrix execution. The command uses exact pinned pnpm, a
  disposable fixture working directory, `--ignore-workspace`, and
  `--frozen-lockfile`; it does not modify either tracked lockfile.
- The executable workflow contract rejects removal, reordering, root-workspace
  substitution, missing workspace isolation, missing frozen-lock enforcement,
  a different fixture path, or a fallback/network change at the candidate
  boundary.
- From a new store, root-only hydration reproduces the missing
  `vite@8.2.1`; exact fixture hydration then permits the unchanged isolated
  offline/frozen/store-integrity install. Both outcomes are retained and the
  fixture/root package and lock hashes remain unchanged.
- The frozen staged candidate completes all six real OCI cases with expected
  dispositions, non-empty normal/boundary/hang evidence, a valid descendant
  marker, unique container identities, valid containment artifacts, and zero
  managed containers or volumes before and after. Candidate policy still says
  `networkDisposition: denied`, and the mounted store remains read-only.
- Exact pinned focused and applicable broad suites pass with zero failures and
  only the two declared Windows POSIX skips in broad Vitest aggregates.
- No package/lock/dependency, fixture payload, OCI case/command/provider/
  containment, authority, commissioning/readiness/verifier, Doctor/Status,
  invariant, example, or unrelated workflow scheduling semantic change occurs.
- One cohesive commit contains only the workflow hydration, executable
  contract/tests, plan, autonomy record, and any narrowly necessary guidance.
  It is not pushed. A later human push and hosted execution remain required
  before hosted OCI PASS can be claimed.

## Verification

All Windows commands use the repository-pinned Node directory first on `PATH`
and `.tools\node-v24.18.0-win-x64\corepack.cmd`. Long commands run separately
and serially. Linux commands put the pinned Linux Node directory first on
`PATH` and assert pnpm `11.15.1`.

1. Receipt-owning focused Vitest for the workflow contract and any directly
   affected store-preparation unit owner through
   `tools/run-tool-evidence.mjs invariant-vitest` into a fresh WP5i root.
2. Disposable exact-commit Linux reproduction with a fresh explicit store:
   root frozen install, isolated fixture offline failure control, exact fixture
   frozen fetch into that store, and isolated offline/frozen/store-integrity
   install success. Hash both lockfiles before and after.
3. After tracked source/tests/docs freeze and staging, compile the exact
   TypeScript with pinned Windows TypeScript into ignored output. Run the
   complete emitted OCI entry under Ubuntu WSL and real Docker with the fresh
   hydrated store selected explicitly, all cases selected, and a fresh output
   directory.
4. Independently validate OCI result/source identity, every case disposition
   and containment-report hash/size, normal/boundary/hang evidence, unique
   identities, image/provider/store facts, denied network, read-only store
   mount, and before/after cleanup. This local run validates the candidate but
   does not substitute for a later hosted Ubuntu run.
5. Run `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
   `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each serially into a
   separate fresh command-owned evidence directory.
6. Independently audit all final command receipts/artifacts/hashes/counts;
   inspect `git diff --check` and staged scope; verify immutable/protected/
   retained/private-state identities; create one no-push commit and audit its
   commit/tree/parent identities.

Evidence invalidation:

- Any workflow, workflow-contract owner/test, fixture, package/lock, OCI entry,
  provider, containment, or store-selection semantic change invalidates the
  fresh-store and real OCI evidence.
- Any test/runtime source change invalidates the relevant focused and aggregate
  evidence. Long receipt-owning suites run only after the semantic tree is
  frozen.
- Final record-only plan/log text freezes before the staged-tree Docker run.
  Outcomes remain in command-owned ignored artifacts and the final handoff
  rather than mutating the verified candidate afterward.

## Risks and Recovery

- `pnpm --dir` inside this repository discovers the parent workspace unless
  `--ignore-workspace` is explicit; the reproduction demonstrated that a
  superficially plausible command can hydrate the wrong root graph. Mutation
  coverage and the fresh-store proof bind the intended fixture semantics.
- Hydrating the controller store must not weaken the candidate's network
  denial or read-only mount. The workflow command runs before the matrix on the
  controller; containment inspection must continue to prove the candidate has
  no network and cannot mutate the store.
- Hosted Docker uses Engine `28.0.4`; local WSL uses `29.1.3`. A complete local
  fresh-store matrix proves the implementation under real containment, but
  only a later pushed run can close native hosted Ubuntu.
- Controller portability and Windows fresh-adopter failures remain separate
  known WP5 gaps and are not allowed to broaden this increment.
- Retained hosted/reproduction/build output is ignored diagnostic evidence.
  Recovery is an ordinary revert of the one WP5i commit; no push, workflow
  rerun, recommissioning, state mutation, history rewrite, dependency change,
  or destructive cleanup is required.

## Progress and Evidence

- 2026-08-17: Read all repository authorities and latest durable records;
  fetched remote state and discovered WP5h had been pushed after the handoff.
- 2026-08-17: Audited Exact runtime CI run `32047579881` job by job, including
  every step, full log, nine annotations, and five artifact ZIPs. Independent
  receipt audit found 12/12 valid PASS receipts and artifacts, 80,482 artifact
  bytes, 12 manifest bindings, and zero mismatches.
- 2026-08-17: Confirmed WP5h fixed its intended source-identity boundary in
  real hosted Docker. The next failure occurs inside normal-case dependency
  installation, not source capture or cleanup.
- 2026-08-17: Reproduced the exact root-store/fixture-lock closure mismatch
  from a disposable exact clone under pinned Linux tooling and retained the
  structured result. No tracked or protected file changed.
- 2026-08-17: A direct fixture-directory `pnpm fetch --frozen-lockfile`
  hydrated the missing graph but byte-normalized the tracked fixture lock.
  Replaced it with an exact `git archive HEAD:fixtures/oci-candidate` scratch
  fetch. A second empty-store control kept both tracked fixture hashes exact
  and made the isolated offline/frozen/store-integrity install pass with 47/47
  packages reused.
- 2026-08-17: The updated receipt-owning workflow-contract shard passed 4/4;
  exact pinned typecheck and lint diagnostics also passed. The remaining final
  matrix and broad commands will run only after plan/log/decision freeze and
  exact staging.

## Next Action

Freeze the durable records, stage only the bounded WP5i tracked paths, compile
that exact candidate, and run the complete real Docker matrix from an isolated
Linux repository whose new default pnpm store receives the root install and
exact scratch-fixture fetch. Then run and independently audit the serial final
receipt-owning suites before the one no-push commit.
