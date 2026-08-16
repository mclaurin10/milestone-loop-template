# Current Execution Plan

**Status:** WP5c complete and independently verified; cohesive commit pending
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Complete one bounded WP5 independent-invariant increment by extracting the
existing `contract-integrity` evaluation from `scripts/verify.mjs` into one
controller-owned module. The authoritative verifier will call that module for
its unchanged `contract-integrity` stage, while the `protected-integrity`
entry in `pnpm test:invariants` will call a receipt-owning, explicitly
completion-ineligible adapter directly.

This closes the concrete coupling where contract integrity currently inherits
the verifier's unrelated `environment` stage. It also adds direct corruption
evidence and keeps the generated fresh-adopter registry on the same adapter.
It does not reopen WP4d, WP5a, or WP5b and does not assume that strict config,
CI, provider coverage, or all future invariant work belongs in this increment.

Explicit non-goals are Doctor or Status changes, configuration-schema
strictness, Linux/Windows CI, OCI/provider execution, verifier profile/stage/
completion changes, immutable-contract meaning, commissioning, product-domain
implementation, readiness repair, WP6 optimization, a fresh-adopter proof
rerun, or an autonomous-readiness claim.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, the readiness marker, active and
  historical commissioning records, package/lock identities except for an
  explicitly necessary package-script change (none is planned), every worked
  example, and the accepted WP4d/WP5a/WP5b evidence.
- Preserve the exact 13 contract-integrity check IDs, meanings, statuses,
  ordering, details, and adopter-specific commissioned-base derivation. The
  extraction may change ownership and call routing, not success semantics.
- `pnpm verify` remains the only completion-eligible command. Focused verifier
  selection still bundles `environment` and `contract-integrity`; only the
  independent invariant adapter bypasses environment, and its report must say
  it is completion-ineligible.
- The adapter must write a command-owned receipt only after every shared
  contract check passes. Real contract corruption must retain a failing
  diagnostic report, exit nonzero, and write no PASS receipt.
- The source and generated fresh-adopter invariant registries keep their
  commissioned IDs and four/two entry structure respectively, but route
  `protected-integrity` to the controller adapter and require a
  `contract-integrity-report` artifact rather than a focused aggregate result.
- Use pinned Node `24.18.0` and pnpm `11.15.1` through
  `.tools/node-v24.18.0-win-x64/corepack.cmd`, with that Node directory first
  on `PATH`. Run long suites serially and never overlap them.
- No OCI matrix is applicable because the executor/provider owner, container
  implementation, and containment policy do not change. No safety
  demonstration is applicable because no mutation/recovery primitive or
  controller action routing changes.
- Do not run a no-argument source verifier. A disposable or focused verifier
  consumer test may exercise only the extracted contract stage when needed to
  prove shared ownership; it cannot become completion evidence.
- Never edit, stage, move, hide, delete, re-encode, clean, or otherwise mutate
  the protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry matches the requested handoff: branch `master`, HEAD
  `5089a460390dad60f2bb234cee81f91f7e27a5ea`, tree
  `83c6e5b3108b963ccf0e8727b9e7adb46c6cfc4e`, parent
  `33050af0ca00d229ef14bfaee018e546f0387011`, subject
  `feat: add canonical lifecycle status`, and divergence `0 behind / 6 ahead`
  of `origin/master`. Tracked and staged trees are clean; the protected human
  plan is the only untracked path. The private state/lease refs and state/
  legacy-lease paths are absent.
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
- The protected WP5 roadmap requires contract-integrity checking to move from
  the monolithic verifier into a controller-owned module used by both the
  authoritative verifier and a completion-ineligible invariant adapter.
  `pnpm test:invariants` must exercise it directly without inheriting the
  environment stage; a correct commissioned template must pass and real
  corruption must fail.
- Current `protected-integrity` is registry argv
  `pnpm verify -- --stage contract-integrity`. `commandFromArgv` converts it
  into the `focused-verify` receipt wrapper, and `scripts/verify.mjs` expands
  every focused selection to `environment` plus the selected stage plus
  `contract-integrity`.
- The pinned baseline `pnpm test:invariants` run at
  `artifacts/manual/wp5c-invariant-baseline` failed after 4,790 ms on its first
  command. Its child aggregate at
  `artifacts/verify-2026-08-16T172651-406Z-5368/result.json` proves all 13
  contract-integrity checks passed, but the unrelated dependency placeholder
  failed the inherited environment stage; selected stages were exactly
  `environment,contract-integrity`. This is the acceptance gap, not a contract
  failure.
- The contract logic currently exists only as
  `validateAcceptanceManifest()` inside `scripts/verify.mjs`. Fresh-adopter
  registry generation independently emits the same focused-verifier argv.
  The aggregate identity fixture copies the verifier's transitive imports and
  must gain the extracted module. No standalone contract-integrity test or
  contract-specific receipt artifact exists.

## Steps

1. [x] Complete the resume protocol, entry/protected/retained identity audit,
       newest log/decision review, protected WP5 roadmap review, source/test/
       contract inspection, and one pinned baseline reproduction of the first
       unresolved gap.
2. [x] Replace the completed WP5b plan with this bounded WP5c extraction plan
       before substantial implementation.
3. [x] Add a side-effect-free controller-owned contract-integrity evaluator
       containing the unchanged 13-check logic, and make
       `scripts/verify.mjs` delegate its contract stage to it without changing
       verifier selection, result schema, status aggregation, or completion.
4. [x] Add a receipt-owning invariant adapter/report and strict CLI mode;
       route source and generated adopter `protected-integrity` entries to it,
       expose completion ineligibility explicitly, and update ownership/
       expected-artifact declarations without adding a new package contract.
5. [x] Add focused tests for exact healthy check ordering, real commissioned
       contract corruption, failing-report/no-receipt behavior, authoritative
       verifier/shared-module parity, direct registry routing, source
       completion ineligibility, and generated-adopter parity. Update README
       and CONTRACT with the shared-owner/direct-adapter boundary.
6. [x] Freeze source/tests/docs/plan/logs, then run the serial focused receipt,
       direct invariant suite, orchestrator aggregate, unit aggregate, static
       gates, independent receipt/report/count audits, diff checks, and all
       protected/commissioned/example/retained identity audits. Repair only
       from focused reproduction and never overwrite a failed evidence path.
7. [x] Update this plan and `docs/autonomy-log.md`; record the durable shared
       authority decision in `docs/decision-log.md`. Stage only the explicit
       intended WP5c path set for one audited commit without pushing; the
       commit itself is the mechanical storage boundary after this plan
       freezes.

## Acceptance Criteria

- One controller-owned evaluator is the sole implementation of the existing
  13 contract-integrity checks. Both the verifier contract stage and invariant
  adapter call it; `scripts/verify.mjs` contains no second acceptance evaluator.
- The authoritative verifier retains the exact check IDs/order/status/messages
  and commissioned-base semantics. Focused verifier selection and its honest
  environment behavior remain unchanged; exact/no-argument verification and
  completion eligibility are untouched.
- `pnpm test:invariants` invokes `protected-integrity` without launching
  `pnpm verify`, without an environment stage/result, and without depending on
  production/dependency/product placeholders. The source's four registry
  commands pass serially with valid command-owned receipts.
- The contract adapter writes a versioned `contract-integrity-report` carrying
  all checks, counts, shared owner identity, and explicit
  `completionEligible:false`. The invariant-suite report/result also makes its
  completion ineligibility explicit. Neither can authorize target integration
  or masquerade as exact verification.
- A real commissioned Git fixture with valid authority passes directly.
  Corrupting a governed acceptance rule causes a nonzero adapter result with
  the relevant failed check(s), a retained diagnostic report, and no PASS
  receipt. Missing/malformed commissioning or authority remains fail-closed.
- Fresh-adopter generation emits the same direct adapter argv/artifact kind,
  includes the extracted module through its normal runtime inventory, and
  retains its generic IDs and bootstrap/readiness separation. No WP4d proof is
  rerun or reinterpreted.
- The invariant registry identity, active commissioning identity, exact
  verifier command, profile/stage registries, Doctor schema `2.0.0`, Status
  schema `1.0.0`, provider policy, state schemas, source readiness, immutable
  authority, examples, and accepted WP4d/WP5a/WP5b evidence remain unchanged.
- Focused tests, receipt-owning direct invariants, orchestrator/unit aggregates,
  typecheck, lint, format, receipt/hash/count audits, diff checks, and all
  protected identity audits pass. The two declared Windows POSIX skips remain
  honest if encountered by broad suites.

## Verification

Every command runs separately and serially. Each invocation resolves
`.tools/node-v24.18.0-win-x64`, prepends it to `PATH`, and invokes pnpm through
that directory's `corepack.cmd`.

Implementation diagnostics (not final evidence):

1. `pnpm exec vitest run tools/milestone-orchestrator/src/contract-integrity.test.ts tools/milestone-orchestrator/src/invariant-suite.test.ts tools/milestone-orchestrator/src/verification-cli.test.ts tools/milestone-orchestrator/src/adopter-package.test.ts tools/milestone-orchestrator/src/aggregate-verify-identity.test.ts --fileParallelism=false`.
2. Direct `pnpm test:invariants` into a fresh diagnostic evidence directory;
   inspect command argv, child artifacts/receipts, report checks, runtime, and
   explicit completion ineligibility. Do not run a source no-argument verifier.
3. Focused typecheck/lint/format only as needed while interfaces stabilize.

Final frozen-tree commands, in this exact order:

1. Set `LOOP_VERIFY_COMMAND_ARTIFACT_DIR` to
   `artifacts/manual/wp5c-contract-focused-final-3` and run
   `pnpm exec node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/contract-integrity.test.ts tools/milestone-orchestrator/src/invariant-suite.test.ts tools/milestone-orchestrator/src/verification-cli.test.ts tools/milestone-orchestrator/src/adopter-package.test.ts tools/milestone-orchestrator/src/aggregate-verify-identity.test.ts --fileParallelism=false`.
2. Set it to `artifacts/manual/wp5c-invariants-final` and run
   `pnpm test:invariants`.
3. Set it to `artifacts/manual/wp5c-test-orchestrator-final` and run
   `pnpm test:orchestrator`.
4. Run `pnpm test:unit`; its command-owned wrapper allocated
   `artifacts/manual/test-unit-3532`.
5. Set it in turn to `artifacts/manual/wp5c-typecheck-final`,
   `artifacts/manual/wp5c-lint-final`, and
   `artifacts/manual/wp5c-format-final`; run `pnpm typecheck`, `pnpm lint`, and
   `pnpm format:check` serially.
6. Independently match every PASS receipt to each declared artifact's bytes
   and SHA-256, audit focused/direct/broad counts and skips, prove the direct
   invariant report has no environment/aggregate result and is explicitly
   completion-ineligible, then run `git diff --check`, staged-path review,
   immutable/commissioned/example/readiness/package/lock/verifier-semantic/
   protected and retained-evidence identity checks.
7. Commit once without pushing. Re-audit HEAD/tree/divergence/status, private
   refs/state paths, retained evidence, and all three protected-plan identities.

Evidence invalidation:

- Any evaluator/check/order/message change invalidates the contract-focused
  shard, direct invariant suite, and authoritative-consumer parity evidence.
- Any registry, command routing, adapter report, or receipt change invalidates
  the direct invariant suite and generated-adopter tests.
- Any verifier stage/profile/completion behavior change is out of scope and
  requires stopping to revise this plan rather than silently broadening it.
- Documentation or plan/log-only changes after semantic evidence require
  static/diff reinspection. Freeze tracked files before final receipts.

## Risks and Recovery

- Moving verifier logic can accidentally alter JS coercion, failure ordering,
  or returned checks. Move the body mechanically, keep the same structural
  check shape and messages, and assert exact healthy output plus corrupt cases.
- Plain Node loads `scripts/verify.mjs` while controller TypeScript normally
  runs through `tsx`. Keep the shared evaluator plain-Node-loadable via an
  explicit dependency boundary and prove the real verifier import path.
- A new direct command could pass on exit code alone or write a receipt after a
  failed check. Always write the diagnostic report first, issue a receipt only
  for all-PASS checks, and let the existing invariant receipt validator reject
  absence/drift.
- A direct adapter could be misread as exact evidence. Mark its own and outer
  reports completion-ineligible, use a distinct artifact kind, and leave
  `pnpm verify`/state-owned exact-evidence parsing unchanged.
- Generated adopters could retain the old focused verifier argv even when the
  source registry is fixed. Change and test the generator in the same cohesive
  increment; do not rerun the completed WP4d retained proof.
- Recovery is ordinary reversal of the single cohesive WP5c commit. No push,
  credentials, network, history rewrite, recommissioning, state migration,
  protected-file handling, or destructive cleanup is needed.

## Progress and Evidence

- 2026-08-16: Completed the repository resume protocol and matched the exact
  handed-off HEAD/tree/parent/divergence, clean tracked/staged state, absent
  private controller refs/state paths, protected plan identities, and retained
  WP4d artifacts. Read the complete authority/contract/plan standard/current
  plan, newest autonomy and decision entries, protected WP5 roadmap, relevant
  source/config/tests/docs, active commissioning, and recent history.
- 2026-08-16: Reproduced the first unresolved WP5 gap under pinned Node/pnpm.
  `pnpm test:invariants` failed only because `protected-integrity` launched a
  focused verifier that selected the unrelated environment stage. Its shared
  target contract stage independently passed all 13 checks. Baseline evidence
  is retained at `artifacts/manual/wp5c-invariant-baseline` and
  `artifacts/verify-2026-08-16T172651-406Z-5368/result.json`; it is diagnostic,
  failing, and not cited as completion evidence.
- 2026-08-16: Extracted the exact evaluator into
  `src/contract-integrity.ts`. Plain Node loaded the authoritative verifier
  successfully, and the old and new healthy check arrays were byte-equivalent
  after JSON normalization. The verifier retains focused environment bundling
  and delegates only the contract check body. The direct adapter owns a
  `contract-integrity-report.v1`, requires the exact healthy check identity,
  writes no receipt on failure, and marks itself completion-ineligible. The
  outer invariant report advanced to `1.1.0` solely to expose the same
  ineligibility.
- 2026-08-16: Routed both source and generated-adopter protected-integrity
  entries directly to the adapter with the existing registry IDs. Focused
  implementation tests passed 28/28 across contract extraction, invariant
  routing, CLI parsing, generated packaging, and authoritative verifier
  identity. A real corrupted commissioned clone retained a failed ineligible
  report and no receipt. The diagnostic public invariant command then passed
  all four serial entries in 28,359 ms under the 60-second warm target, with
  no environment aggregate. Diagnostic workspace typecheck and focused ESLint
  also passed; final receipts remain pending after logs freeze.
- 2026-08-16: The first receipt-owning affected attempt at
  `artifacts/manual/wp5c-contract-focused-final` correctly issued no PASS
  receipt because 1/28 tests failed. The corruption child inherited the outer
  evidence wrapper's `LOOP_VERIFY_*` context, so the evidence context rejected
  the deliberately different disposable repository and exited 3 rather than
  the expected semantic-failure exit 1. The test now removes inherited loop
  evidence/telemetry variables before supplying the disposable repository's
  exact child context; the failed directory is retained and the replacement
  final path is `wp5c-contract-focused-final-2`.
- 2026-08-16: The replacement
  `artifacts/manual/wp5c-contract-focused-final-2` also correctly issued no
  receipt at 27/28. Removing inherited variables could not change that
  `tools/evidence.mjs` binds its repository root to its own installation. The
  fixture now copies the current adapter/evaluator/CLI into the commissioned
  clone and invokes that copy, so evaluated repository and receipt authority
  are identical. This exposed a second real coupling: the CLI statically
  loaded `verification-tier.ts` and therefore the Codex SDK before selecting
  the narrow adapter. Tier loading is now deferred until a tier mode is
  actually selected. The exact wrapper context then passed the two contract
  tests at `wp5c-contract-focused-debug-6`; the new final path is
  `wp5c-contract-focused-final-3`.
- 2026-08-16: The accepted affected shard at
  `artifacts/manual/wp5c-contract-focused-final-3` passed 28/28 tests with
  zero skips across 14/14 suites. Its 10,135-byte report has SHA-256
  `7042cb4b802d2b42ea0424142dfa2ba5f479258ed03c100c7e83e51ac8e380f8`,
  exactly matching the PASS receipt. The wrapper's optional direct-telemetry
  begin hook could not load a TypeScript-only transitive module by its `.js`
  specifier under plain Node; telemetry is null in the manifest, while the
  semantic command receipt and artifact are complete.
- 2026-08-16: Direct `pnpm test:invariants` passed all four commands serially
  in 27,751 ms at `artifacts/manual/wp5c-invariants-final`. The outer
  completion-ineligible `1.1.0` report is 7,232 bytes / SHA-256
  `2b65afaf50a8e8ab5b8f8f76389c61f8fdd1ba34db0ff3f6cc68934a8161798a`.
  Its first command is the direct adapter, whose completion-ineligible
  `contract-integrity-report.v1` passed the exact 13/13 identity with no
  environment aggregate (3,531 bytes / SHA-256
  `9e6b1eeb8ada30e398745bcc0d690f967ebb24293a3db2e6f04435f1d5bc8945`).
  The schema, policy, and fail-closed children passed 7/7, 15/15, and 61/61;
  every outer/nested receipt and artifact identity matched independently.
- 2026-08-16: The orchestrator aggregate passed 535/537 with zero failures and
  only the two declared Windows POSIX skips across 172/172 suites at
  `artifacts/manual/wp5c-test-orchestrator-final` (188,743 bytes / SHA-256
  `489c1c570ded68a41c628ca2ab1acf5e4e4ab8a41aeff32d0cb4bd8bff2a0341`).
  The unit aggregate passed 548/550 with the same skips across 174/174 suites
  at `artifacts/manual/test-unit-3532` (192,753 bytes / SHA-256
  `f6e05cf9e111d163e874ace11682bff36ce5826e296452c5bf6229612f167e9c`).
  Both PASS receipts exactly match their reports.
- 2026-08-16: Receipt-owning typecheck, lint, and format passed at
  `artifacts/manual/wp5c-typecheck-final`, `wp5c-lint-final`, and
  `wp5c-format-final`; report hashes are
  `a864a46d8fbda1d2056ea61073b815a9551bb42da37936ff35f460dfff5f71e0`,
  `2f759e5b623a519e4cd9333dbfb5c124953093fa5e2fb86b3b5255940066ecb3`,
  and `63128dac587b1252fbab116839b9a7a4fd1c318f1bf68a35bd10958b9a8b8c5d`.
  The final record-only mutation is followed by a second format receipt before
  staging.
- 2026-08-16: Independent identity checks matched every untouched immutable,
  commissioning, readiness, package/lock, default/scope/slow/benchmark,
  example, fresh-adopter, and retained-evidence path. Both private refs, the
  state mirror, and legacy lease path remain absent. The protected plan remains
  78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`. No source no-argument verifier,
  OCI matrix, safety demonstration, fresh-adopter proof rerun, mutating loop
  command, or push occurred.

## Next Action

WP5c ends with the single cohesive commit containing this frozen plan and the
explicitly audited contract-integrity paths; do not push. The next autonomous
planning cycle must select the smallest dependency-ordered remaining WP5 area:
strict config/differential schema coverage or exact-runtime cross-platform CI.
