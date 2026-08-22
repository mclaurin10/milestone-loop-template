# Current Execution Plan

**Status:** WP5q tracked records complete; candidate freeze next
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Complete one bounded portability increment for the earliest unresolved retained
controller failure after WP5p: `container-executor.test.ts` on hosted Windows.
The retained suite and a fresh exact-HEAD reproduction both pass 2/10 and fail
the same eight cases before clone or OCI lifecycle execution because the
controlled fixture supplies an NTFS 8.3-spelled pnpm-store path to the strict
ordinary-mount-source guard.

Prove the direct fixture precondition with an assertion-only Windows short-path
run, canonicalize only the controlled root creator, and retain that assertion.
The fixture correction exposes a second short/long identity failure at the
executor-owned artifact staging root: six original cases clear, while the two
cases that reach artifact inventory remain red and a direct observation records
the staging root as noncanonical. Canonicalize only that just-created root. Do
not weaken stable-root, mount, artifact, containment, cleanup, process, or
schema checks.

Make the complete focused file green on genuine-short-path Windows and Linux
ext4, inspect the next retained failed suite only far enough to classify direct
ownership, verify one frozen candidate tree, create exactly one narrow local
commit, and stop without pushing.

This increment does not broaden OCI policy, container isolation, artifact
limits, cleanup semantics, process supervision, Git/path identity, verification
clones, POSIX `setsid`, CAL-1, hidden validation, product breadth, readiness, or
human verification. It does not clean historical evidence, the protected human
file, or the ignored Corepack residue.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, every immutable baseline/active meaning and hash,
  readiness as the default profile, the permanent activation marker, and CAL-1
  `open_not_started` with zero completions.
- Use exact Node `24.18.0` and pnpm `11.15.1`. Windows selects
  `.tools/node-v24.18.0-win-x64`; Linux selects
  `/home/duncan/.local/node-v24.18.0-linux-x64/bin` in Ubuntu WSL2.
- Preserve strict OCI mount-source identity, immutable-image attestation,
  no-network/capability/resource/mount policy, bounded volumes, artifact
  preflight/inventory/publication, complete cleanup proof, execution-provider
  identity, and process-supervision behavior.
- Add a direct regression that requires each controlled fresh root to equal its
  `realpath()` before derived paths cross the corresponding strict production
  boundary. Never normalize caller-controlled or pre-existing paths.
- Repair multiple cases together only when their retained and local failures
  cross the exact same direct owner. Preserve a separately owned failure as red
  evidence rather than masking it.
- Never edit, stage, move, delete, re-encode, copy over, or otherwise mutate
  `Implementation-ready improvement plan 8-5-26.txt`.
- Preserve `.tools/corepack-home-readonly-probe` exactly unless an independently
  validated, policy-permitted exact cleanup becomes available; do not use
  `git clean` or broaden cleanup scope.
- Every verification command owns a fresh evidence root, temporary directory,
  Corepack home, and telemetry run/location. No writable checkout or root is
  shared, repository-prescribed serial Vitest semantics remain unchanged, and
  at most two heavyweight aggregates run concurrently.

## Baseline Evidence

- Completed WP5p is HEAD `51d6eb8d039f31e0c9d4018508048bb74e11a3f9`,
  tree `3a6d6b385c4d8beedca38d01cd36bfa44aa06bb4`, parent
  `70fb23538d6664d4fd3c7e59397398cde702dd4b`. Live and tracking
  `origin/master` equal `31a9e53ab2491ead0a3c88fac0860fdab9641f3a`;
  divergence is 0 behind / 4 ahead. No `refs/milestone-loop/*` exist and no
  push has occurred.
- `artifacts/manual/wp5p-final-audit/audit-result.json` is 26,507 bytes,
  SHA-256 `165587a1c0ad5ab2f0f39cdafc83ad58e83d531f15602883648d8f5b0f71c158`.
  It records 12 manifests / 81,659 bytes, 12 receipts / 7,287 bytes, 12
  artifacts / 470,927 bytes, zero mismatches, and manifest/receipt/artifact
  digests `50f7b302603413165febd43b7454b6c4c52fa9a189fff1e5692a50a26c8bf5f8`,
  `2649576c3837f00310dfbbac1f91bab1633af1dcf40411e5c12bab91e283b862`,
  and `d0d5b43bef464cd0422b5b9a84654d1b410a216d0e58df7529e3fd2838b2bfe0`.
- The only non-ignored entry before WP5q is the protected 78,574-byte file with
  SHA-256 `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Ignored `.tools/corepack-home-readonly-probe` remains 892 files, 208
  directories, and 36,593,945 file bytes. It is preserved as disclosed setup
  residue.
- Immutable actual hashes equal baseline and active. `package.json` selects
  readiness; the permanent marker exists; CAL-1 is `open_not_started`, count
  zero. Package, lock, workflow, marker, and immutable-lock identities match
  the WP5p final audit.
- Retained hosted Windows report
  `artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
  is 280,492 bytes, SHA-256
  `3d51560a25552e28397f9143283a8afab39c365dd6b5ef1659fb7abcea3aa5c7`.
  Chronological failed-file ordering starts Doctor at `1786995045207`, evidence
  retention at `1786995083268`, then container executor at `1786995151895`.
  The first two are closed by WP5o/WP5p; worked-example was closed by WP5m.
- Retained `container-executor.test.ts` has 10 tests: 2 passed, 8 failed, zero
  skipped. The first case expected PASS at line 587 but received ERROR; the
  next expected TIMEOUT at line 693 but received ERROR; six later assertions
  received `Controller pnpm store must be an ordinary directory with stable
realpath identity.` instead of their intended start/create/policy/cleanup/
  artifact/volume outcomes. The policy-only and pre-store attestation cases
  pass.
- A fresh no-local/no-hardlink exact-HEAD clone at `C:/w5qr/repo`, with no
  alternates, zero tracked/untracked drift, pinned tools, and a genuine distinct
  NTFS 8.3 command temp reproduced the same 2/10. Its 7,082-byte report and
  8,993-byte ERROR manifest under
  `artifacts/manual/wp5q-windows-container-red/evidence/` have SHA-256
  `c2250155c93ad27737ded2dbd9f9ca19544f269eaca523b99e0523ac219dd5d1`
  and `36f47cce9fcacd926d78b0f4fdc57ca563b1bc6dfdaeffc6701b86fbbd025ccb`;
  no receipt exists. One setup-reporting command exited 1 after a successful
  clone/install because it called `.Trim()` on empty clean-status output; it
  ran no test and created no evidence root.
- Direct trace: `fixture()` retains raw `mkdtemp(tmpdir())`, derives `store`,
  and mocks `resolveStorePath()` with that spelling. Production
  `assertOrdinaryMountSource()` correctly compares the store with its realpath
  before `createClone()`. Separately, the executor creates an artifact staging
  root with raw `mkdtemp(tmpdir())`; whether it becomes a second causal failure
  after the fixture correction was proved separately.
- Assertion-only tree `d18f965b05a73aeb83e895e0933d70942d074b10`
  remained 2/10 but moved the first failure directly to
  `realpath(data.root) === data.root`. Its 6,668-byte report and 9,004-byte
  ERROR manifest have SHA-256
  `31c73bd18431036cb118e84b1ced75c26f0cec480bd656e2382278f1365d9ac7`
  and `af7172ae067aca7253fb7125b55a2ace9fd62b85589b6a98b8e0d7adf19e725f`;
  no receipt exists.
- Fixture-corrected, production-unchanged tree
  `a8f7934b8ae92fb86b1caee20f14d051f005422f` passed 8/10. The first remaining
  failure directly observed the executor-provided evidence staging root as
  noncanonical; the timeout case was the only other case reaching the same
  artifact-inventory boundary. Its 4,634-byte report and 9,007-byte ERROR
  manifest have SHA-256
  `b6a4903efcf94be945a1d12b9e76ba0a86f297939ea4d3ce2dc7850b6837e1ea`
  and `1ec1fca2c809b8382cf89852efc9002466fe8d89946794870cb1b97e3900ff76`;
  no receipt exists.

## Steps

1. [x] Read the frozen goal, agent contract, plan standard, completed WP5p
       plan/log, newest relevant decisions, retained evidence, Git/live origin,
       immutable/lifecycle state, protected identity, critical files, private
       refs, and ignored residue.
2. [x] Verify supplied HEAD/tree/parent, audit totals/digests, protected-only
       status, origin/divergence, absent private refs, retained report,
       readiness/CAL-1, and immutable/critical identities.
3. [x] Use three isolated read-only agents for retained ordering/assertions,
       fixture/production ownership, and frozen-tree verification topology;
       primary independently inspects the same authorities and code.
4. [x] Reproduce the complete focused file from a clean no-local/no-hardlink
       exact-HEAD clone under genuine short TEMP; retain 2/10 ERROR evidence,
       manifest/report hashes, no-receipt state, command/environment, and clone
       identity.
5. [x] Finish the structured reproduction record and replace the completed
       WP5p plan with this bounded WP5q plan.
6. [x] In a second exact clone, add only a direct root-realpath assertion and
       retain its expected assertion-first red result. In a third clone, apply
       the assertion plus minimal fixture-root canonicalization and prove the
       separately owned downstream staging failure.
7. [x] Preserve separate red evidence and trace/assert the
       executor-owned staging root exposed by the fixture correction. Apply only
       the two proved producer-side canonicalizations, then iterate on the
       complete Windows-short file until 10/10 passes with a valid receipt.
8. [x] Verify the complete focused file on Linux ext4. Inspect the next retained
       failed suite only far enough to classify causality; include nothing
       unless the exact correction demonstrably repairs the same direct owner.
9. [x] Update `docs/autonomy-log.md`, `docs/decision-log.md`, and this plan for
       the durable producer-side staging-root decision.
10. [ ] **In progress:** Format only bounded tracked paths, stage exactly intended files, require
        zero unstaged tracked drift, record `git write-tree`, and export/hash a
        binary cached patch under `artifacts/manual/wp5q-candidate-freeze/`.
11. [ ] Materialize independent no-local/no-hardlink clones from exact HEAD,
        apply/stage the frozen patch, and require matching HEAD, staged paths,
        `git write-tree`, no alternates, and zero unstaged tracked drift before
        and after each command.
12. [ ] Run one Windows orchestrator aggregate, one Windows unit aggregate, one
        WSL/ext4 focused shard, while primary runs Windows-short focused,
        invariants/components, typecheck, lint, and format. Reuse a completed
        slot for a separate read-only evidence audit.
13. [ ] Independently audit every manifest/receipt/artifact and repository,
        lifecycle, immutable, owner, origin/ref, protected-file, residue, and
        isolated-root fact. Create exactly one narrow local commit; verify its
        commit/tree/parent/paths and 0-behind/5-ahead state; stop without push.

## Acceptance Criteria

- Retained and fresh red evidence both record 2/10 with the same eight failure
  assertions; local evidence is ERROR, has no receipt, and binds exact clean
  HEAD/tree, pinned tools, distinct 8.3 temp identity, command, and hashes.
- Assertion-only evidence fails directly at the controlled root precondition.
  The retained regression passes after correction and proves each changed
  fresh-root owner is canonical before strict mount/artifact validation.
- The complete focused file passes 10/10 with zero skips on genuine-short-path
  Windows and Linux ext4, with valid command-owned receipts and independently
  verified declarations/artifacts.
- Strict production identity and isolation checks are not relaxed. Any
  production edit is limited to canonicalizing an executor-created fresh root
  and is backed by a direct second-boundary red proof; otherwise production
  `container-executor.ts`, `container-artifacts.ts`, verification clone,
  process, schema, Git, and policy owners remain byte-identical.
- The next retained failure is classified only. It is left explicitly open
  unless the exact correction repairs the same owner without semantic
  broadening.
- Invariants/components, orchestrator, unit, typecheck, lint, and format pass
  from one frozen candidate tree. Aggregates retain exactly the two declared
  POSIX supervision skips and no others. Every successful command has a valid
  receipt and independently verified artifact bytes/hashes.
- Immutable/lifecycle/critical identities, package/lock/workflow, private-ref
  absence, live origin, protected file, and ignored residue remain exact. One
  bounded local commit is created and not pushed.

## Verification

Every command asserts exact Node/pnpm, clears inherited
`MILESTONE_LOOP_TELEMETRY_RUN_ID` and `LOOP_TELEMETRY_PARENT_MANAGED`, then
sets a command-unique telemetry run. It owns unique
`LOOP_VERIFY_COMMAND_ARTIFACT_DIR`, TEMP/TMP/TMPDIR, Corepack home, checkout,
and setup root. Red commands require an ERROR manifest, report, no
`result.json`, nonzero exit, and clean unchanged candidate identity.

1. Focused Windows/Linux command:
   `pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/container-executor.test.ts --fileParallelism=false`.
   Red roots are `wp5q-windows-container-red/evidence`,
   `wp5q-windows-container-owner-red/evidence`, and, only if exposed,
   `wp5q-windows-container-staging-red/evidence`. Final roots are
   `wp5q-windows-focused-final/evidence` and
   `wp5q-linux-focused-final/evidence`.
2. Final broader commands and roots:
   `pnpm test:invariants` -> `wp5q-invariants-final/evidence`;
   `pnpm test:orchestrator` -> `wp5q-orchestrator-final/evidence`;
   `pnpm test:unit` -> `wp5q-unit-final/evidence`;
   `pnpm typecheck` -> `wp5q-typecheck-final/evidence`;
   `pnpm lint` -> `wp5q-lint-final/evidence`; and
   `pnpm format:check` -> `wp5q-format-final/evidence`.
   Do not add shards or alter serial Vitest flags. Cap concurrent heavyweight
   aggregates at two.
3. Freeze procedure: finish all tracked source/test/plan/log edits; format only
   intended paths; stage only intended paths; require empty unstaged tracked
   diff; capture HEAD, `git diff --cached --name-only`, staged blob identities,
   and `git write-tree`; export `git diff --cached --binary` and hash it.
   Materialize each candidate with
   `git clone --no-local --no-hardlinks --no-checkout`, detach exact HEAD,
   apply/stage the private patch, require the frozen tree and no alternates,
   install offline/frozen/copy under pinned tools, and reassert every identity
   and cleanliness guard before and after its command.
4. Windows aggregates use genuinely short external clone/temp roots (for
   example distinct roots beneath `C:/q1` and `C:/q2`), never repository-nested
   long TEMP. Linux focused uses a distinct WSL ext4 clone/root. No command runs
   concurrently in the authoritative checkout.
5. Final audit enumerates every accepted manifest/receipt/declared artifact,
   recomputes bytes and SHA-256, validates declarations/candidate/toolchains/
   totals/skips, derives ordered manifest/receipt/artifact digests, and writes
   `artifacts/manual/wp5q-final-audit/audit-result.json`. Rejected setup/red
   evidence and absence of receipts are audited separately.

Any tracked byte change after freeze invalidates all final PASS receipts. Final
tracked plan/log wording freezes before final commands; exact outcomes remain
in ignored evidence and the final handoff rather than mutating the candidate.

## Risks and Recovery

- Canonicalizing a caller-provided path would weaken fail-closed identity.
  Limit fixture correction to its just-created root; preserve the production
  mount guard unchanged.
- The executor's raw staging `mkdtemp()` may be a second producer-owned defect
  once store validation is cleared. Do not preemptively patch it. Require a
  direct short-path assertion/stack, then canonicalize only the just-created
  staging root if proved; keep artifact guards byte-identical.
- A global TEMP normalization or guard relaxation would mask causality. Every
  correction stays at the controlled root creator and is tested with a genuine
  short spelling.
- Long repository-nested Windows temp roots caused unrelated filename-too-long
  aggregate cascades in WP5p. Final heavy clones and temp roots stay at short
  external paths.
- WSL dependencies remain in disposable ext4 clones; never replace the
  authoritative Windows `node_modules`. No two commands share writable roots.
- Recovery is ordinary revert of one local commit. No push, ref rewrite,
  dependency change, lifecycle transition, or destructive cleanup is required.

## Progress and Evidence

- 2026-08-22: Reconciled completed WP5p and every supplied live checkpoint;
  supplied identities, counts, hashes, refs, origin, lifecycle state, protected
  file, and ignored residue match.
- 2026-08-22: Parallel read-only audits and primary inspection place container
  executor next and trace the first shared failure to the raw fixture root
  crossing strict pnpm-store mount validation.
- 2026-08-22: Fresh exact-HEAD no-local/no-hardlink Windows reproduction under
  a genuine short TEMP produced 2/10, ERROR/no receipt, exact eight assertions,
  pinned tools, clean clone, no alternates, and retained report/manifest hashes.
- 2026-08-22: Assertion-only proof moved the first failure to the fixture-root
  identity check. Canonicalizing only that fixture in a separate exact clone
  cleared six failures and exposed 8/10 with a direct false staging-root
  identity observation. The executor-owned raw staging `mkdtemp()` is therefore
  the proved second producer; strict consumers remain correct.
- 2026-08-22: The exact two-path implementation tree
  `36fd561a80ed6436cab8d56a130cae53ab02591c` passed 10/10 with zero skips and
  valid receipts on genuine-short-path Windows and Linux ext4. Windows report,
  receipt, and manifest are 4,064 / 603 / 9,243 bytes with SHA-256
  `d20e446992916259bbaf9da86e6cd23f7dc374575f5e2fcb17584aec158faa8f`,
  `68906740233e7ccc282f10403c7581809a21b3b78af7c972c13ccadce06b09a5`,
  and `388e62f3002ee161a004fb1d15eb7d25522a958c0a698d4be12fb9800eefdab7`.
  Linux report, receipt, and manifest are 4,086 / 603 / 9,218 bytes with
  SHA-256 `96e4fd0aeb971ec7c96e9060013e15ffa0c30ea6acae09df090470267b4e4cff`,
  `b41475bb9aff3a795d074553a23ec147ff79f5af151337da0e2a2e2cc863d7f7`,
  and `5de11d6fb46fc6d65e5dafc66b96c22da907a6e921127506dff397d78790c26c`.
- 2026-08-22: The next retained failed suite is separately owned
  `orchestrator-cleanup.test.ts` at `1786995191701`: 1/9 passed and eight fail
  from its own raw `milestone-loop-recovery-cleanup-*` Git-root fixture crossing
  strict `inspectTarget()`. It imports neither changed owner, so it remains open.
- 2026-08-22: Setup incidents created no test evidence: one Windows reporting
  wrapper trimmed empty status, one WSL PATH probe was misquoted, and one WSL
  clone wrapper allowed PowerShell to expand shell substitutions before clone.
  Exact read-only checks recovered the intended clones without tracked drift.
  External roots `C:/w5qr`, `C:/w5qo`, `C:/w5qs`, `C:/w5qg`,
  `/home/duncan/wp5q-linux-diagnostic`, and the isolated Corepack probe
  `/home/duncan/wp5q-linux-store-probe` remain retained for final audit.
- 2026-08-22: Pinned Prettier formatted only the five intended tracked paths;
  source, test, autonomy, and decision files were already canonical, while this
  replacement plan received only mechanical Markdown formatting.

## Next Action

Stage exactly the five intended tracked paths, require zero unstaged tracked
drift, export/hash the cached binary patch, and freeze the candidate tree before
materializing final verification clones.
