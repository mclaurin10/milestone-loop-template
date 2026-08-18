# Current Execution Plan

**Status:** WP5l implementation complete; candidate freeze in progress
**Updated:** 2026-08-18
**Owner:** autonomous loop

## Objective

Complete one causal controller-portability increment for the earliest unresolved
hosted Linux failure after WP5k corrected Doctor's POSIX `ENOTDIR` boundary.
The retained exact-runtime report orders the next failing suite as
`process-supervisor.test.ts`. Reproduce its two POSIX failures from exact clean
WP5k source under Node `24.18.0` and pnpm `11.15.1`, retain structured red
evidence, add a direct owner-level regression, and correct only the process-group
portability facts proven by that reproduction.

The bounded hypothesis is that the existing intact-tree fixture uses a
Windows-only detached-grandchild topology even though a `setsid`-detached POSIX
descendant is an explicitly recorded escape residual, while a post-exit POSIX
group sweep records `ESRCH` (the already-absent group) as a kill failure. The
implementation may proceed only if the clean reproduction confirms those exact
facts. The intended correction is limited to selecting a process-group-contained
grandchild on POSIX while retaining the detached Windows taskkill proof, and
classifying only POSIX `ESRCH` as an already-complete group sweep.

This increment does not implement subreaper/cgroup/container containment, claim
that `setsid` daemons are killable, broaden descendant enumeration, change
timeouts/output caps/redaction/status/telemetry, alter process supervision on
ordinary success, address worked-example or candidate-identity failures, change
packages/locks/workflows, begin CAL-1 or product work, or claim autonomous
readiness. It will create exactly one cohesive local commit and will not push.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, every immutable-lock baseline and active meaning,
  CAL-1 `open_not_started`, the readiness default profile and permanent marker,
  the original acceptance contract, verifier semantics, and retained receipts.
- Use exact Node `24.18.0` and pnpm `11.15.1`. Windows commands prepend
  `.tools/node-v24.18.0-win-x64`; Linux commands use
  `/home/duncan/.local/node-v24.18.0-linux-x64` in Ubuntu WSL2.
- Preserve the frozen supervision contract: POSIX children remain detached
  process-group leaders; timeout/output breach sends group SIGTERM then group
  SIGKILL; output remains bounded and redacted; settle remains exactly once and
  hard-bounded; non-`ESRCH` signal failures remain visible and fail closed.
- Do not relabel the documented `setsid`-detached POSIX daemon escape as solved.
  The Linux intact-tree proof must use a descendant that actually shares the
  supervised group; the Windows proof must remain detached so it still exercises
  force-first `taskkill /T /F` rather than libuv's job-object behavior.
- An absent process group after root exit is not a surviving straggler. Only
  `ESRCH` may retain the successful `posix-group-sigkill` disposition; every
  other thrown code/value must retain an explicit failed disposition.
- Preserve shared controller/verifier/evidence use of `superviseCommand` and do
  not introduce platform-divergent policy outside the existing group/taskkill
  implementation boundary.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  user-owned untracked `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Resume identity matches the requested WP5k state: `HEAD`
  `6bfe4a84a8d616725e5c41eaa9c29ad12a1f747a`, tree
  `7f93ea058e627b1840a88c400e08a4f45bc2bd7b`, parent
  `b04d33a6869645ea4d847af7991831b249e2f882`. The only worktree entry is the
  protected untracked human plan.
- The expected remote divergence changed outside this session: live
  `origin/master` already equals `6bfe4a84`; divergence is 0 behind / 0 ahead,
  not the expected 0 / 1. This agent has not pushed and will not push.
- WP5k is complete and locally committed. Its six paths do not include
  `process-supervisor.ts` or `process-supervisor.test.ts`; neither file differs
  between retained hosted commit `87bd41e` and current `HEAD`, so the hosted
  stack remains directly attributable to current supervisor code.
- Retained Linux artifact
  `artifacts/hosted/run-32060615125/controller-linux-87bd41e/orchestrator/orchestrator-report.json`
  is 214,181 bytes with SHA-256
  `a6e7cc9d098dc52327b10ffdf33067c06dbf8eb18a73cae8033b0d902339e188`.
  Its ERROR manifest is 9,110 bytes with SHA-256
  `6b0e28ed539d55e85529da19656e103ea3ea3d0da01729f5ec9a41c1551031c9`.
- Failed-suite start times prove the post-Doctor order: Doctor
  `1786995000003`; process supervisor `1786995022223`; worked example
  `1786995133398`; candidate identity `1786995183453`. The process suite is
  therefore the earliest unresolved boundary after WP5k.
- The process suite failed two of 20 assertions. The output-limit intact-tree
  case left the detached grandchild alive at line 291. The drain-holder case
  received `posix-group-sigkill-failed:ESRCH` instead of
  `posix-group-sigkill` at line 334. Source comments and the recorded WP3a
  decision explicitly say a `setsid`-detached POSIX daemon escapes group kills;
  the first fixture's unconditional `detached: true` therefore cannot prove the
  POSIX intact-group contract. The second stack arises after the root exits and
  its group no longer exists.
- A clean no-hardlink Ubuntu WSL2 clone of exact `6bfe4a84` under Node
  `v24.18.0`, pnpm `11.15.1`, Linux x64 reproduced exactly 18/20 passed and
  those same two failures. The command exited 1, its manifest is `ERROR` with
  `receipt: null`, no `result.json` exists, source identity stayed clean, and
  independent inspection confirmed disposal of the ext4 clone. The structured
  2,781-byte record at
  `artifacts/manual/wp5l-linux-process-supervisor-pre-fix/reproduction.json`
  has SHA-256
  `19d72bd76613df98bccba6d3928523cabeee4be955e49fb2dcbc1282c75effc2`;
  its 7,948-byte report has SHA-256
  `b5bfeb2b45233d2bb13bbbe8dc18e1dec8dd44a3b3e69ff1c9a40258a2dbe497`
  and its 9,022-byte ERROR manifest has SHA-256
  `6de31a078800695eb1c524b12883264416de29a6844ade615a98300f2f7eebcf`.
- All four immutable actual hashes equal their recorded baseline and active
  hashes. `package.json` still selects `readiness`, the permanent readiness
  marker is present, CAL-1 remains `open_not_started`, and no private
  `refs/milestone-loop/*` exist.
- Protected plan identity is 78,574 bytes, SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered
  blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.

## Steps

1. [x] Read frozen authority, agent contract, plan standard, stale WP5k plan,
       newest autonomy/decision records, Git state, retained evidence, exact
       toolchain paths, lifecycle/CAL-1 state, protected identities, and private
       refs.
2. [x] Correct the stale post-commit WP5k plan state by replacing it with this
       bounded WP5l plan; derive failure order from retained timestamps/stacks
       rather than the process-supervision hint.
3. [x] Create a clean no-hardlink ext4 clone of exact WP5k
       `HEAD`, install with the exact Linux toolchain, run only the receipt-owning
       process-supervisor shard serially, and retain an ERROR manifest, report,
       exact identity/toolchain record, no receipt, and cleanup proof.
4. [x] Confirm the red report reproduces exactly the live detached-descendant
       and absent-group `ESRCH` failures. If it does not, revise this plan before
       any source change.
5. [x] Add a direct owner-level regression that distinguishes an already-absent
       POSIX group from a real signal failure without weakening other error
       dispositions. Demonstrate it red against the pre-fix owner.
6. [x] Apply only the smallest source/fixture corrections: retain a POSIX
       descendant in the supervised group for the intact-tree proof while
       keeping the Windows child detached, and treat only `ESRCH` as an
       already-complete drain sweep.
7. [x] Run exact Linux and Windows focused receipt-owning supervision shards;
       inspect liveness, termination attempts, drain disposition, test totals,
       manifests, receipts, and artifact bindings.
8. [x] Update this plan and `docs/autonomy-log.md`; update
       `docs/decision-log.md` only if a new durable decision beyond the existing
       WP3a platform contract is required.
9. [ ] **In progress:** freeze source/tests/plan/log, stage only bounded paths, record the exact
       candidate tree, and run fresh Linux focused plus Windows focused,
       invariants, orchestrator, unit, typecheck, lint, and format commands
       serially in distinct command-owned evidence roots.
10. [ ] Independently recompute every receipt/artifact byte count and SHA-256,
        validate manifest bindings and totals, then recheck immutable hashes,
        lifecycle/CAL-1, package/lock/workflow bytes, retained evidence,
        protected-plan identity, private refs, staged paths/tree, origin, and
        divergence.
11. [ ] Create exactly one cohesive local commit, verify its commit/tree/parent
        and clean protected-only status, and do not push.

## Acceptance Criteria

- Retained timestamps and a clean exact-runtime Linux reproduction both identify
  `process-supervisor.test.ts` as the first unresolved post-Doctor cluster and
  reproduce exactly two failures with an ERROR manifest and no passing receipt.
- The Linux output-limit proof keeps its grandchild inside the supervised POSIX
  process group, proves the child is dead, and retains the Windows detached
  topology that proves intact-tree taskkill. No assertion claims that a
  `setsid`-detached POSIX daemon is contained.
- A direct owner-level regression is red before the production correction and
  green afterward: `ESRCH` from an already-absent POSIX group retains
  `posix-group-sigkill`, while a representative non-`ESRCH` error retains
  `posix-group-sigkill-failed:<code>`.
- Timeout, output-limit, SIGTERM/SIGKILL escalation, grandchild group kill,
  drain cutoff, liveness, output truncation, exactly-once settle, and hard-bound
  assertions all remain intact and green on Linux. Windows behavior remains
  green with only its two existing declared POSIX-only skips.
- Exact Linux and Windows focused shards have command-owned receipts and audited
  artifacts. Invariants, orchestrator, unit, typecheck, lint, and format pass
  serially from one frozen candidate tree with no retries or weakened checks.
- No package, lock, workflow, authority, acceptance, readiness/profile,
  commissioning, verifier, generated-adopter, OCI, product, worked-example,
  candidate-identity, or unrelated controller change occurs.
- One narrow verified commit contains only the supervisor owner/test, active
  plan, autonomy record, and a decision record only if strictly necessary. It
  is not pushed; the protected untracked file remains byte-identical.

## Verification

All commands explicitly select Node `24.18.0` and pnpm `11.15.1`. Long commands
run separately and serially. Every successful child command owns a fresh
`LOOP_VERIFY_COMMAND_ARTIFACT_DIR`; every expected failure must retain an ERROR
manifest and no `result.json` receipt.

1. Clean Linux red reproduction: clone exact WP5k `HEAD` with `--no-hardlinks`
   into `/tmp`, run `pnpm install --frozen-lockfile
   --package-import-method=copy`, assert the exact toolchain, then run:
   `pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest
   tools/milestone-orchestrator/src/process-supervisor.test.ts
   --fileParallelism=false`.
2. Red owner regression: apply only the new test to a second clean exact-HEAD
   Linux clone, run the same receipt-owning shard, require the pre-existing two
   failures plus the new absent-group disposition failure, and retain no receipt.
3. Diagnostic green: run the same complete file under exact Linux and Windows
   toolchains. Audit report totals, expected Windows skips, receipt, manifest,
   and artifact bytes/hashes before proceeding.
4. Frozen candidate: stage only bounded tracked paths and record
   `git write-tree`. Re-run fresh Linux focused verification against that exact
   staged diff, then on Windows run fresh focused verification,
   `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
   `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each in a distinct
   evidence root.
5. Independently parse all final Vitest totals and manifests, recompute every
   declared artifact/receipt byte count and SHA-256, verify each manifest
   binding, and audit source/protected/immutable/lifecycle/package/lock/workflow
   identities before and after the no-push commit.

Evidence invalidation: any supervisor/test semantic change invalidates focused
evidence; any later tracked change invalidates every frozen-candidate PASS.
Final plan/log text freezes before final commands; final outcomes live in ignored
command evidence and the handoff so the candidate tree itself does not move.

## Risks and Recovery

- Making the POSIX grandchild non-detached changes only the proof topology; it
  is required to test the documented process-group contract and must not erase
  the recorded `setsid` escape residual. Windows must retain detachment or the
  job object could make its tree test pass without taskkill.
- Treating every group-kill error as success would fabricate containment.
  Restrict the successful absent-target interpretation to `ESRCH`; deterministic
  coverage must preserve another error as explicit failure.
- PID reuse makes real absent-group probes unsafe if an arbitrary negative PID
  is selected. Prefer the existing impossible fake PID for owner-level
  classification and use real child PIDs only in contained fixtures with
  afterEach cleanup.
- WSL dependencies stay inside disposable ext4 clones. Never replace the source
  checkout's Windows `node_modules` with Linux links or binaries.
- If the exact red reproduction differs, a 60-second budget is exceeded, a
  descendant survives unexpectedly, or any new regression appears, retain its
  diagnostics, stop expansion, and correct the causal issue or leave the plan
  incomplete. Do not retry away or relabel it.
- Recovery is an ordinary revert of one WP5l commit. No push, ref rewrite,
  dependency migration, recommissioning, or destructive source cleanup is
  required.

## Progress and Evidence

- 2026-08-18: Reconciled the stale WP5k plan against commit `6bfe4a84`, its
  autonomy entry, retained final evidence roots, and protected source identity.
- 2026-08-18: Observed that a later external publication advanced
  `origin/master` to WP5k; current divergence is 0 / 0. No push occurred here.
- 2026-08-18: Parsed the retained Linux report structurally. Process supervision
  starts first after Doctor and fails two assertions; worked-example and
  candidate-identity remain later independent clusters.
- 2026-08-18: Confirmed the supervisor owner/test bytes are unchanged from the
  hosted commit through current HEAD and traced both assertions to the existing
  WP3a POSIX process-group contract and its explicitly documented `setsid`
  residual.
- 2026-08-18: The single clean exact-runtime Linux attempt reproduced exactly
  the hosted process-supervision boundary at 18/20. Independent audit matched
  all three retained evidence identities, confirmed ERROR/no receipt, clean
  source, exact toolchain, and absent temporary clone. No source implementation
  had changed when this red evidence was produced.
- 2026-08-18: Added one deterministic owner-level regression using the existing
  impossible fake PID for real Linux `ESRCH`, followed by an injected `EACCES`
  signal failure. A second clean exact-HEAD clone applied only the 2,294-byte
  test patch (SHA-256
  `97aac7f482eaa39bdc067855067b30a66061d9c736ec88fcde74657d049c04cf`)
  and produced the expected 18/21 passed, three failed, zero skipped result with
  ERROR/no receipt. Its 3,719-byte structured record has SHA-256
  `97247b00acd78a3913ce43e0ce1d27881234f1ad2f1826bd10b2597a8250769d`;
  the 8,732-byte report has SHA-256
  `1e96e4e43e2218296082dd11d80c3e15b485f228f036b6534b3a785651d27266`.
  Independent audit confirmed staged-only test scope and disposal of the clone.
- 2026-08-18: The minimal correction keeps the output-limit grandchild
  detached only on Windows and inside the supervised group on POSIX. The drain
  sweep retains its successful attempt label only for `ESRCH`; the new injected
  `EACCES` assertion proves every other error remains explicit.
- 2026-08-18: A clean exact-Linux clone with only the owner/test patch passed
  21/21 with no skips and a valid receipt. Its patch tree is
  `ab13cdb58d7d3c378822d94466960ad1ee553155`; the 7,605-byte report SHA-256 is
  `160772885fcf18fac26d03bf3780bed16a9a2b6faf2d22675a49791b33a5ed33`,
  and the independently matched 603-byte receipt SHA-256 is
  `4f7bad05cb7de782bf9ea1fba1e744cd7584a863000a838dd958e91cb512efe5`.
  The ext4 clone was independently confirmed absent afterward.
- 2026-08-18: Exact Windows focused verification passed 19/21 with zero
  failures and only the two existing POSIX-only skips. Its 7,504-byte report
  SHA-256 is
  `3250f8104f6874b135b7acc65bc0bb28f1a0e402f75c0a8f47754ea78bc5c11b`;
  its 603-byte receipt SHA-256 is
  `7796162fec6aa510063c790c2c14404fd1a78d9f6a83aae1277177465c3ac2ae`.
  Independent audit matched receipt and artifact bytes/hashes to the PASS
  manifest with zero mismatches.
- 2026-08-18: The pre-freeze receipt-owning format diagnostic correctly
  rejected both changed TypeScript files. Its 8,953-byte ERROR manifest has
  SHA-256
  `c57322e39f00f063dc2ad2f7ac2ba808439ab7196c50c0d23e36d92d094a51c4`
  and no receipt. Pinned Prettier changed only those two bounded files; all
  focused and broad final evidence must therefore run from the formatted tree.

## Next Action

Finalize the autonomy entry, freeze and stage exactly the four bounded paths,
audit the staged tree and protected identities, then run every final command
serially into fresh command-owned roots without changing tracked bytes.
