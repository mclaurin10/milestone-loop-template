# Current Execution Plan

**Status:** WP5m inspection complete; clean Linux red reproduction next
**Updated:** 2026-08-21
**Owner:** autonomous loop

## Objective

Complete one causal controller-portability increment for the earliest unresolved
hosted Linux failure after WP5k corrected Doctor and WP5l corrected process
supervision. Retained suite start times place `worked-example.test.ts` before
`candidate-identity.test.ts`. Reproduce the worked-example failure from a clean
exact-WP5l clone under Node `24.18.0` and pnpm `11.15.1`, retain structured red
evidence, add a direct owner-level regression, and correct only the descriptor
identities that were derived from noncanonical Windows worktree line endings.

The bounded hypothesis is that WP4c generated three payload byte identities
from stale CRLF worktree copies even though `.gitattributes` had already fixed
all tracked text to `eol=lf`. The committed payload blobs are canonical LF and
have not changed since before the descriptor was introduced. The correction is
therefore descriptor metadata repair, not a historical payload rewrite: bind
the three incorrect entries to the exact staged Git blob bytes and add a
regression that independently compares every descriptor identity with its
staged payload blob. Proceed only if a clean Linux reproduction and a complete
semantic/cross-link audit confirm those facts.

This increment does not change any historical payload blob, provenance role,
schema, linked identity, registry, check catalogue, protected-path coverage, or
legacy-only semantics. It does not normalize identities at runtime, accept two
line-ending representations, weaken exact byte validation, address candidate
identity, Windows path-spelling cascades, or the documented POSIX `setsid`
escape, change packages/locks/workflows, begin CAL-1 or product work, or claim
autonomous readiness. It will create exactly one cohesive local commit and will
not push.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, all immutable-lock baseline and active meanings,
  CAL-1 `open_not_started`, readiness default/profile history, the original
  acceptance contract, verifier semantics, and all retained receipts.
- Use exact Node `24.18.0` and pnpm `11.15.1`. Windows commands prepend
  `.tools/node-v24.18.0-win-x64`; Linux commands use
  `/home/duncan/.local/node-v24.18.0-linux-x64` in Ubuntu WSL2.
- Preserve WP4c's historical boundary: all seven package files remain regular,
  contained, tracked, exact, strict-schema-valid, cross-linked, legacy-only,
  inactive, non-fallback, non-commissionable, and non-executable.
- Preserve the seven payload blobs byte-for-byte. Descriptor identities must
  name the staged Git bytes that a clean clone actually materializes under the
  repository's pre-existing `* text=auto eol=lf` rule; do not alter payloads or
  add a runtime newline-equivalence escape.
- The regression must compare descriptor byte count and SHA-256 with each exact
  staged blob, not with the current platform's possibly stale worktree copy.
  This keeps legitimate future staged payload/descriptor changes testable
  before commit while detecting worktree-derived identity generation.
- Keep `candidate-identity.test.ts`, all process-supervisor behavior, Windows
  path spelling, and controller policy outside this increment.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  user-owned untracked `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- WP5l is complete at `HEAD` `31a9e53ab2491ead0a3c88fac0860fdab9641f3a`,
  tree `1136baa31cbafbce2fbad27846395eebd6f903f9`, parent
  `6bfe4a84a8d616725e5c41eaa9c29ad12a1f747a`. Its only four changed paths are
  the supervisor owner/test, active plan, and autonomy log.
- Retained WP5l final audit
  `artifacts/manual/wp5l-final-audit/audit-result.json` is 16,695 bytes with
  SHA-256
  `064b477b472b80c6e877829e64e6dec7b3b456e39b88ed57cd037b491b62b017`.
  It reports 12 receipts / 7,259 bytes, receipt digest
  `d159d3cff4a02d24493aacc3aae7f42a4b5200eac4bb4fcde70b515afce4b035`,
  12 artifacts / 475,657 bytes, artifact digest
  `6975bcb9e79fb961fa70cbfc5609b8dd9f4a1eb2164b4b15960abcb393bce73d`,
  and zero mismatches. Linux focused passed 21/21; Windows passed 19/21
  with two declared POSIX-only skips; invariants passed 13/13, 7/7, 15/15,
  and 61/61; orchestrator passed 590/592 and unit 603/605 with only those
  two skips; typecheck, lint, and format passed.
- Live `git ls-remote`, followed by a clean `git fetch --prune origin`, showed
  that `origin/master` advanced outside this session from the supplied WP5k
  expectation to exact WP5l `31a9e53`. Current divergence is 0 behind / 0
  ahead. This session did not publish that commit and will not push.
- The worktree initially contained only the protected untracked human plan.
  Its identity matches the supplied facts: 78,574 bytes, SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`. No private
  `refs/milestone-loop/*` exist.
- All four immutable actual SHA-256 values equal both baseline and active
  values. `package.json` selects `readiness`, the permanent readiness marker
  remains present, and the immutable lock records CAL-1 as `open_not_started`
  with zero completions.
- Retained hosted Linux run `32060615125` orders failed-suite starts as Doctor
  `1786995000003`, process supervisor `1786995022223`, worked example
  `1786995133398`, and candidate identity `1786995183453`. The first two are
  closed by WP5k/WP5l, making worked example the next causal cluster. Its first
  assertion reports `invariant-suite.json` expected
  `4476/ef40b3a7c2aadd22c17c5b739c4c9720decb6ab1ce8922e1334669e4ccc404e7`
  but received
  `4333/43fc292ba60340908e26a201eaa34b1f3dbb970b6650d289b15ef21a05acdf0c`;
  four later failures are cascades that cannot reach their intended checks.
- Current Windows worktree inspection reproduces the expected 4,476 bytes as
  143 CRLF line endings. The exact staged/HEAD blob is the hosted 4,333-byte LF
  form. The same defect affects only
  `loop-recommissioning-verification.json` (recorded 7,013-byte CRLF versus
  6,821-byte staged LF) and `slow-suite-registry.json` (recorded 463-byte CRLF
  versus 452-byte staged LF). All three parse to identical JSON, all three
  staged blobs are unchanged from the WP4c base, and the slow-suite blob is
  unchanged from template introduction. The other four descriptor entries
  already match staged bytes exactly.
- `.gitattributes` has required `* text=auto eol=lf` since commit `d762ad2`,
  before WP4c descriptor commit `89f3ea0`. The three CRLF copies survived only
  as stale Windows worktree materializations; WP4c then recorded those local
  bytes even though Git committed LF payloads. Current source/test bytes for
  worked-example validation are unchanged from hosted commit `87bd41e` through
  WP5l.

## Steps

1. [x] Read frozen authority, agent contract, plan standard, stale WP5l plan,
       newest autonomy/decision records, Git and live origin state, retained
       evidence, exact toolchains, lifecycle/CAL-1 state, protected identities,
       and private refs.
2. [x] Reconcile the stale plan with WP5l commit/evidence and replace it with
       this bounded WP5m plan. Establish current failure order from retained
       timestamps/stacks rather than assuming the payload hint is causal.
3. [x] Compare every descriptor identity with Windows worktree, staged/HEAD
       blob, WP4c base, and introduction bytes; verify the global LF attribute,
       JSON semantic equality, payload history, and exact affected set.
4. [x] Create a clean no-hardlink ext4 clone of exact WP5l,
       install with the exact Linux toolchain, run only the receipt-owning
       worked-example shard serially, and retain an ERROR manifest, report,
       identity/toolchain record, no receipt, and cleanup proof.
5. [x] Confirm the clean report reproduces the same first identity mismatch and
       only its downstream assertion-order cascades. If it differs, revise this
       plan before source changes.
6. [x] Add a direct owner-level regression that reads every descriptor entry
       and compares it with the exact staged Git blob bytes. Apply only that
       test to a second clean exact-HEAD Linux clone and retain the expected red
       result with ERROR/no receipt.
7. [x] Run an executable semantic audit proving all seven current staged blobs
       parse/validate, every descriptor link/identity/check/protected cross-link
       remains correct, only three identity metadata entries differ, and no
       payload blob changed across the repair.
8. [x] Correct only the three descriptor byte/hash pairs to the audited staged
       LF identities. Do not change production validator behavior or payload
       bytes. Normalize the local stale checkout copies to their existing Git
       bytes only as an untracked workspace hygiene step if Windows diagnostics
       require it; assert that this creates no Git diff.
9. [x] Run exact Linux and Windows focused worked-example verification; inspect
       test totals, intended negative assertions, manifests, receipts, payload
       inventory, and artifact bindings.
10. [x] Update this plan and `docs/autonomy-log.md`; update
        `docs/decision-log.md` only if a new durable contract decision beyond
        restoring WP4c's stated exact-tracked-byte meaning is required.
11. [ ] **In progress:** freeze source/test/descriptor/plan/log, stage only bounded paths, record
        the exact candidate tree, and run fresh Linux focused plus Windows
        focused, invariants, orchestrator, unit, typecheck, lint, and format
        commands serially in distinct command-owned evidence roots.
12. [ ] Independently recompute every receipt/artifact byte count and SHA-256,
        validate manifest bindings and totals, then recheck immutable hashes,
        lifecycle/CAL-1, package/lock/workflow bytes, all seven payload blobs,
        retained evidence, protected identity, private refs, staged paths/tree,
        live origin, and divergence.
13. [ ] Create exactly one cohesive local commit, verify its commit/tree/parent
        and protected-only status, and do not push.

## Acceptance Criteria

- Retained ordering and a clean exact-runtime Linux reproduction identify
  `worked-example.test.ts` as the first unresolved post-WP5l cluster and retain
  its ERROR manifest with no passing receipt.
- The direct regression is red before correction and green after correction,
  proving all seven descriptor byte/hash pairs equal the staged Git blobs rather
  than a platform-specific worktree representation.
- Exactly three descriptor entries change to the pre-existing canonical LF
  blob identities. The seven payload Git blobs, their JSON values/provenance,
  schemas, file set, links, registry/check catalogue, protected coverage, and
  legacy-only/inactive/non-executable semantics remain unchanged and pass an
  executable audit.
- Exact Linux and Windows focused suites pass every assertion with command-owned
  receipts. Invariants, orchestrator, unit, typecheck, lint, and format pass
  serially from one frozen candidate tree with no retries or weakened checks.
- No package, lock, workflow, authority, acceptance, readiness/profile,
  commissioning, verifier, generated-adopter, OCI, product, candidate-identity,
  supervisor, or unrelated controller change occurs.
- One narrow verified commit contains only the descriptor, direct regression,
  active plan, autonomy record, and a decision record only if strictly needed.
  It is not pushed; the protected untracked file remains byte-identical.

## Verification

All commands explicitly select Node `24.18.0` and pnpm `11.15.1`. Long commands
run separately and serially. Every successful child command owns a fresh
`LOOP_VERIFY_COMMAND_ARTIFACT_DIR`; every expected failure retains an ERROR
manifest and no `result.json` receipt.

1. Clean Linux red reproduction: clone exact WP5l `HEAD` with `--no-hardlinks`
   into `/tmp`, run `pnpm install --frozen-lockfile
--package-import-method=copy`, assert the exact toolchain, then run
   `pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest
tools/milestone-orchestrator/src/worked-example.test.ts
--fileParallelism=false`.
2. Red owner regression: apply and stage only the new test in a second clean
   exact-HEAD Linux clone, run the same receipt-owning shard, require the direct
   staged-blob mismatch plus the pre-existing cascades, and retain no receipt.
3. Semantic audit: compare descriptor entries to staged blob bytes/hashes and
   parse all six JSON payloads; invoke the real strict validators and cross-link
   owner through the corrected complete file; prove `git diff --raw` reports no
   payload path and record all seven before/after blob IDs.
4. Diagnostic green: run the same complete file under exact Linux and Windows
   toolchains. Audit totals, receipts, manifests, artifact bytes/hashes, and the
   explicit CLI validation result before proceeding.
5. Frozen candidate: stage only bounded tracked paths and record
   `git write-tree`. Re-run fresh Linux focused verification against that exact
   staged diff, then on Windows run fresh focused verification,
   `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
   `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each in a distinct
   evidence root.
6. Independently parse all final Vitest totals and manifests, recompute every
   declared artifact/receipt byte count and SHA-256, verify each binding, and
   audit source/protected/immutable/lifecycle/package/lock/workflow identities
   before and after the no-push commit.

Evidence invalidation: any descriptor/test semantic change invalidates focused
evidence; any later tracked change invalidates every frozen-candidate PASS.
Final plan/log text freezes before final commands; final outcomes live in
ignored command evidence and the handoff so the candidate tree itself does not
move.

## Risks and Recovery

- Blindly rehashing a legitimately changed payload could launder drift. Require
  the retained history and executable before/after blob/semantic/cross-link
  audit to prove the payloads did not change and the WP4c descriptor was born
  with three noncanonical worktree-derived values.
- Runtime newline normalization or accepting both hashes would weaken exact
  byte identity. Keep the validator fail closed and correct only descriptor
  facts to the repository's pre-existing canonical bytes.
- The current Windows checkout retains three stale CRLF copies despite a clean
  index. If local Windows diagnostics need canonical materialization, rewrite
  only those clean tracked copies to their exact index bytes, then prove both
  index and worktree are clean and no payload path is staged.
- Test code must inspect the staged index, not `HEAD`, so a future legitimate
  pre-commit payload/descriptor update remains verifiable without requiring an
  intermediate commit. Git command failure must be explicit rather than an
  empty-byte fallback.
- WSL dependencies stay inside disposable ext4 clones. Never replace the
  source checkout's Windows `node_modules` with Linux links or binaries.
- If exact reproduction differs, semantic equality fails, a payload blob has
  changed unexpectedly, or any new regression appears, retain diagnostics,
  stop expansion, and correct the causal issue or leave the plan incomplete.
  Do not retry away or relabel it.
- Recovery is an ordinary revert of one WP5m commit. No push, ref rewrite,
  dependency migration, recommissioning, or destructive source cleanup is
  required.

## Progress and Evidence

- 2026-08-21: Reconciled stale WP5l plan state with commit `31a9e53`, its
  autonomy entry, retained final audit, and exact protected/source identities.
- 2026-08-21: Observed and fetched an external advance of `origin/master` to
  exact WP5l; divergence is now 0 / 0. This session did not push.
- 2026-08-21: Reparsed the retained hosted Linux report. Worked example starts
  after the two now-closed suites and before candidate identity; its five
  failures share the first payload-identity boundary.
- 2026-08-21: Audited every descriptor entry against current worktree,
  staged/HEAD blob, WP4c base, and introduction history. Exactly three recorded
  identities name stale CRLF worktree copies, while their canonical LF blobs
  are unchanged and JSON-equivalent. The global LF attribute predates WP4c.
- 2026-08-21: A single clean exact-WP5l Ubuntu clone under Node `v24.18.0`
  and pnpm `11.15.1` reproduced 4/9 passed and the exact five worked-example
  failures: one direct `invariant-suite.json` identity mismatch plus four
  downstream matcher cascades. The command retained an ERROR manifest and no
  receipt; the clone remained clean and its temporary root was confirmed
  absent. The first post-run parser rejected its own overly broad message
  expectation without rerunning the shard; a separate fail-closed finalizer
  accepted only the exact direct mismatch and four exact Vitest-elided cascades.
  The 8,014-byte reproduction record has SHA-256
  `7093b891545acacdfc9e1828bff3c9b4d2224c4decd758f42d367783044fc023`;
  its 8,281-byte report has SHA-256
  `3ba2d7f230d807b0ff1180c44206218074a50afbfe3daf87e96028401601ba08`,
  and its 9,022-byte ERROR manifest has SHA-256
  `45a106ffbb776a4ccbe32a7ebc2343b18749e64043452b14e831f26ffed1bd22`.
- 2026-08-21: Added a direct test that hashes each exact staged payload blob
  and compares the complete ordered inventory with the descriptor. A second
  clean exact-WP5l Linux clone applied and staged only the 1,812-byte test patch
  (SHA-256
  `fef63f0953481edaa20f047444d441dd1a1bea89c38fb1e97c2a709e9630bb63`)
  at candidate tree `e92e6e455388aaa919d0ed6633ff2bb7876e656b`. It produced the
  expected 4/10 passed, six failed result: the new owner assertion, the direct
  package mismatch, and the same four cascades, with ERROR/no receipt and
  confirmed cleanup. Vitest elided the array contents in the owner failure, so
  the first post-run parser rejected only its own message predicate; a separate
  finalizer bound the exact patch and manifest candidate tree to that assertion
  without rerunning the shard. The 8,906-byte record has SHA-256
  `fd98168fa70a2c894569456f214e1a56edee9e48ac247633c47bea6895e42ded`;
  its 8,883-byte report has SHA-256
  `ed0a300277880e6c5f2d576622fe47dfee216425fc1efff88f89e7f9d4c2c69c`,
  and its 9,016-byte ERROR manifest has SHA-256
  `7fbb24e87ce3cc4ebe18ac8dfa012e8cb760831bdbcb6144405d6a2b06a108ef`.
- 2026-08-21: The disposable exact-Linux semantic audit initially rejected an
  overbroad history predicate because WP4c legitimately changed `README.md`,
  then rejected a pnpm invocation that forwarded a literal `--` to the strict
  CLI. Neither attempt reached or altered the source correction. With the
  predicates narrowed to the three mismatched entries and the equivalent pnpm
  script invocation corrected, candidate tree
  `f5f18bd8ba06c2b19c5c7874410905a4f23f55b5` changed only the descriptor and
  owner test, with zero payload paths. All seven staged payload blobs equaled
  HEAD; all three mismatched blobs equaled their WP4c-base identities; the real
  explicit validator passed all strict schemas and cross-links; and the focused
  suite passed 10/10 with a valid receipt. The 10,752-byte audit result has
  SHA-256
  `5f5562f6c5228de6b59228fd4a6c5aa56289bae925b1f03105d8c0f57d616baf`;
  its 4,025-byte report, 9,271-byte manifest, and 599-byte receipt have SHA-256
  `54607d5d380460e1394a42d1eb233c3bd5e549bab6ffb19308e5fcd8e551e745`,
  `005cd1ba3c9d46b96c5ae6e7cdad6d4dbf2b716cf6ced35ebaf6a88cca217633`,
  and `f0aa9e7e4e402047d8838e0069057ff1b854b1bb30494cbb9385e656be22f0de`.
- 2026-08-21: Applied exactly the audited three descriptor byte/hash pairs and
  the owner regression. Pinned Prettier was used only to materialize the three
  stale local CRLF payload copies as LF; it also reformatted one unrelated
  legacy-manifest array, which was immediately restored with `apply_patch`.
  Independent raw-byte comparison now shows all three working files exactly
  equal their pre-existing index blobs, and staging them refreshed only index
  stat metadata: there is no payload diff or staged payload path.
- 2026-08-21: Exact Windows focused verification ran against the same two-file
  tree `f5f18bd8ba06c2b19c5c7874410905a4f23f55b5` already proved on Linux and
  passed 10/10 with no skips. Its 3,999-byte report, 9,307-byte PASS manifest,
  and 599-byte receipt have SHA-256
  `0607acdb81ee1a047ae36f820909dfd992763382ab741d19ea6a8be20140e5ee`,
  `dd3ca6972c9183850f6e79f59d4a6652b1b3919b39d1c5e3bd8baae975cb715e`,
  and `e4282c26575d0ab12238f92d9d6cd11250366fd71bc63c484d51cedd613bfdf3`.
  Independent inspection matched the manifest receipt and artifact bindings
  with zero mismatches. The exact Windows explicit validator also returned
  PASS with the corrected 2,948-byte descriptor identity
  `be37c29dbe123d2da4eba93b525794f17b76143f88ec34bda9fcf830fb9a8354`
  and all seven audited file identities.
- 2026-08-21: Added the complete WP5m autonomy entry. No new decision record is
  needed because the correction restores WP4c's existing exact tracked-byte
  meaning without changing validator policy. Pinned Prettier then formatted
  only the four bounded candidate paths; it changed only test layout and plan
  wrapping, while the descriptor and autonomy entry were already canonical.

## Next Action

Run pinned formatting once more on the final plan text, stage exactly the four
bounded paths, record and audit the frozen tree, then run fresh final commands
serially without changing tracked bytes.
