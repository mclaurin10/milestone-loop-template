# Current Execution Plan

**Status:** WP3c implementation committed; handoff documentation and exact-tree verification in progress
**Updated:** 2026-08-14
**Owner:** autonomous loop

## Objective

Implement WP3c, the fail-closed candidate-execution provider control plane.
All candidate-authored focused verification commands and the exact aggregate
`pnpm verify` boundary must resolve through a controller-owned provider with
one of two explicit modes:

- `trusted-container` (the autonomous default); or
- `unsafe-local-diagnostic` (explicit diagnostic opt-in only).

The trusted provider must fail closed before candidate code is spawned until
WP3d supplies the pinned OCI executor. Unsafe-local diagnostics must retain
the WP3a/WP3b bounded supervisor, be visibly identified, remain
completion-ineligible, and be unusable by normal integration or external
reconciliation adoption.

This is a control-plane and evidence-identity increment. It does not implement
the OCI executor, disposable verification clone, mount construction, native
Windows containment, or adversarial escape matrix.

## Goal Constraints

- `PROJECT_GOAL.md` and the original acceptance contract are immutable. The
  current authority is still a placeholder and package-default verification
  remains `readiness`; WP3c cannot establish product completion or autonomous
  readiness.
- Default autonomous execution is `trusted-container`. Missing provider
  implementation, OCI runtime, pinned image, or required policy capability is
  non-passing. No path may fall back automatically to host execution.
- Provider selection, capability facts, and result identity are
  controller-owned. Candidate output may not select, replace, or amend them.
- Candidate-authored verification commands and the exact no-argument
  aggregate route through the provider. Git/state/cleanup/reinstall and other
  controller-owned operations remain separate and continue to use the shared
  bounded supervisor.
- Preserve command-owned receipt validation, exact candidate identity,
  protected-root checks, failure classification, authoritative stage meaning,
  readiness history, and completion eligibility. Provider identity is an
  additional gate, never a substitute for any existing gate.
- Preserve all WP2 retention/workspace-cleanup behavior and all WP3a/WP3b
  timeout, cap, redaction, drain-cutoff, `rootExitObserved`, and exactly-once
  settle semantics.
- Exact Node `24.18.0` and pnpm `11.15.1` own every command. The human file
  `Implementation-ready improvement plan 8-5-26.txt` must remain byte-identical
  at Git blob `d0abdd24f404d9dc335818c355e39f7cfc531300`; it and `.claude/`
  remain outside every commit.

## Baseline Evidence

- Handoff identity is exact: `HEAD`
  `17e4dec9c1cc5db447ac0ecd90352dbcfedc47ef`, tree
  `3a0278586674db1f2e5996c0a59a3ce851d10256`, branch `master`, with
  WP3b implementation `3efa3ed77b46abdea61e4b867a5998e92f54d6c3`.
  Status contains only the protected untracked human file; `.claude/` is
  ignored.
- Runtime probes resolve exact Node `24.18.0` and pnpm `11.15.1` with
  `.tools/node-v24.18.0-win-x64` first on `PATH`.
- Frozen authority hashes match every baseline and active lock entry;
  `evals/immutable-contract-lock.json` remains
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`.
- Retained WP3b evidence at
  `artifacts/wp3b-final-contract-20260808/result.json` preserves authoritative
  schema `2.1.0`, exact runtime/pins, all 13 contract-integrity checks PASS,
  and a bounded closed-stream supervision record on the sole expected
  placeholder failure. Completion is ineligible and no readiness claim is
  made.
- Structural gap reproduced by inspection: there is no execution-provider
  module; `verification-tier.ts`, `verifier.ts`, and reconciliation launch
  candidate-controlled package scripts through `runCommand` directly. The
  default config has no provider policy or provider identity. Doctor cannot
  distinguish provider implementation/runtime/image/policy failures, and
  integration/reconciliation records have no provider gate.
- Audit CD-01/P0.2 and the complete improvement-plan WP3 section require a
  trusted container provider, no local fallback, explicit unsafe diagnostics,
  bounded supervision, immutable provider evidence, actionable doctor output,
  and adoption denial for ineligible execution. WP3a/WP3b already supply the
  supervisor; WP3c supplies only the control plane.

## Steps

1. [x] Read frozen authority, operating instructions, completed WP3b plan and
       logs, audit CD-01/P0.2, the complete improvement-plan WP3 section,
       Git/runtime/hash state, relevant production paths/tests, and retained
       WP3b evidence. Record the exact structural gap and activate this plan.
2. [x] Add a strict versioned execution-provider identity/capability contract
       and provider abstraction. Implement deterministic trusted fail-closed
       results and explicit unsafe-local execution through `runCommand`; use
       injectable trusted executors/probes only as test seams. Ensure reserved
       identity environment data is controller-owned and candidate-returned
       identity is ignored or rejected.
3. [x] Advance config schema to `1.6.0`, add strict root-key validation and
       candidate-execution policy, migrate `1.0.0` through `1.5.0` to
       `trusted-container`, and update default/template/example configs and
       config documentation. No migration may grant unsafe execution.
4. [x] Route milestone verifier commands, verification-tier commands, the
       exact `pnpm verify` boundary, and reconciliation milestone-tier launch
       through the provider. Propagate provider identity through controller
       command summaries, tier command/result/exact indices, authoritative
       aggregate result/run manifest, verification summaries persisted in
       state, target-integration intent/outcome, and reconciliation evidence.
       Add strict equality/eligibility gates at parse, review, integration,
       recovery, and reconciliation adoption boundaries.
5. [x] Extend doctor with a non-mutating offline provider capability check.
       Report configured mode plus independent implementation, runtime, pinned
       image, and policy facts; never equate Docker/Podman presence with a
       complete trusted capability. Use injectable probes so tests do not
       depend on workstation OCI software.
6. [x] Add focused regressions for default/migration behavior, no-spawn trusted
       denial, deterministic no-fallback, bounded unsafe execution, provider
       identity propagation/tamper/missing rejection, aggregate completion
       ineligibility, integration/reconciliation denial, and doctor failure
       classifications. Keep all existing WP2 and WP3a/WP3b regressions green.
7. [x] Run focused and broad verification under the exact runtime, inspect
       every result/receipt/manifest/hash/skip/failure, correct root causes,
       and record final evidence and honest residuals in this plan and the two
       logs.
8. [x] Commit only the cohesive verified WP3c implementation with explicit
       staged paths. If a narrow documentation handoff commit is needed to
       record the implementation identity, follow the existing convention.
       Do not push.

## Acceptance Criteria

- The shipped/default config selects `trusted-container`. Every legacy config
  version migrates to the same fail-closed mode; current config validation
  rejects unknown or malformed provider fields.
- With no WP3d trusted executor, provider execution returns an actionable
  infrastructure/NOT_READY command result and never calls the candidate launch
  function. Runtime/image/policy facts are honest; no unavailable value is
  fabricated.
- No provider failure or capability combination automatically invokes the
  unsafe-local path. Repeated no-fallback outcomes are deterministic apart
  from timestamps/artifact paths.
- `unsafe-local-diagnostic` requires explicit controller config opt-in, invokes
  the existing shared supervisor with the configured timeout/output/kill
  bounds, and records host-inherited network plus absence of an image/mount
  containment honestly.
- Every completion-relevant command/result boundary records a strict provider
  identity: mode, implementation, runtime name/version or absence, image
  digest or absence, mount-policy version, resource-limit profile, network
  disposition, capability identity/status, and completion eligibility.
- The authoritative verifier remains schema `2.1.0` with unchanged stage,
  receipt, status-weight, exit-code, candidate-drift, and completion meanings.
  Provider identity is additive; direct focused diagnostics carry an honest
  unattested identity and remain completion-ineligible.
- Missing, inconsistent, candidate-supplied, or tampered provider identity is
  rejected before evidence can support review, target integration, readiness
  history, or reconciliation adoption.
- Unsafe-local evidence may be retained for diagnosis but cannot yield a PASS
  milestone verification summary, a completion-eligible exact result, a valid
  target-integration intent, or adoptable reconciliation evidence.
- State migration preserves legacy bytes semantically by marking historical
  execution evidence unattested/ineligible; it never retroactively blesses
  old local results. Interrupted WP2 operations remain recoverable or become
  explicitly blocked without destructive cleanup.
- Doctor reports configured provider and complete trusted availability, with
  separate implementation/runtime/image/policy facts and actionable failure;
  all probes are injected in tests, offline, and non-mutating.
- Existing retention/workspace-cleanup tests are unchanged and green. Existing
  supervisor/runner/verifier receipt/identity regressions remain green,
  including the two explicit POSIX-only WP5 skips on Windows.
- Frozen files, immutable lock, human-file blob, success definitions, test
  deadlines, and readiness/profile semantics are unchanged.

## Verification

All commands run with `.tools/node-v24.18.0-win-x64` first on `PATH` and pnpm
resolved as exact `11.15.1`.

Focused suites (expand exact file list as implementation identifies owners):

```text
pnpm exec vitest run tools/milestone-orchestrator/src/execution-provider.test.ts tools/milestone-orchestrator/src/config.test.ts tools/milestone-orchestrator/src/schema.test.ts tools/milestone-orchestrator/src/doctor.test.ts tools/milestone-orchestrator/src/command-runner.test.ts tools/milestone-orchestrator/src/process-supervisor.test.ts tools/milestone-orchestrator/src/verifier.test.ts tools/milestone-orchestrator/src/verification-tier.test.ts tools/milestone-orchestrator/src/aggregate-verify-identity.test.ts tools/milestone-orchestrator/src/evidence-receipt.test.ts tools/milestone-orchestrator/src/reconciliation.test.ts tools/milestone-orchestrator/src/target-integration.test.ts tools/milestone-orchestrator/src/state-store.test.ts tools/milestone-orchestrator/src/retention-apply-recovery.test.ts tools/milestone-orchestrator/src/workspace-cleanup.test.ts tools/milestone-orchestrator/src/workspace-cleanup-recovery.test.ts --fileParallelism=false
```

Required broader gates:

```text
pnpm test:orchestrator
pnpm test:unit
pnpm loop:demo-safety
pnpm typecheck
pnpm lint
pnpm format:check
node scripts/verify.mjs --stage contract-integrity --run-id <unique-wp3c-id>
git diff --check
```

For focused contract-integrity verification, overall FAIL remains expected
only because `verify:dependencies` is the honest adopting-project placeholder.
Require exact runtime/pin checks, all 13 contract-integrity checks PASS, the
placeholder's bounded supervision record, explicit provider identity, and
completion ineligibility.

Final inspection recomputes every declared report/receipt/artifact byte count
and SHA-256 where applicable, validates the immutable lock and all four
governed hashes, confirms exactly the two WP5 POSIX skips on Windows, audits
the staged path list, checks the protected human blob, and checks final Git
status. No browser evidence is required for this headless control-plane
increment.

## Risks and Recovery

- Provider identity crosses several strict schemas. Keep one canonical
  validator/equality/factory owner, version only schemas that make the field
  mandatory, and add negative fixtures before broad migration. Do not accept
  structurally similar candidate output as controller attestation.
- The authoritative verifier is a plain-Node protected trust root. Keep any
  shared identity helper directly loadable by pinned Node and update isolated
  fixtures with the exact transitive dependency rather than weakening them.
- Existing unit fixtures often inject `executeCommand`. Recast those seams as
  explicit provider/test-executor dependencies so a test double cannot become
  an accidental production fallback.
- Persisted legacy verification/reconciliation records predate provider
  identity. Migrate them to explicit `null`/unattested identity and reject
  adoption while preserving inspectability and all unrelated WP2 operation
  fields.
- Direct focused verifier diagnostics must remain runnable for contract
  inspection without being mistaken for contained execution. Record an
  unattested provider control-plane identity and force completion ineligible;
  outer autonomous parsing requires exact controller-attested equality.
- OCI discovery can vary by workstation. Doctor tests use injected probes;
  real probing is read-only/offline and never upgrades readiness when the WP3d
  executor implementation is absent.
- Recovery is ordinary source-control reversal of this cohesive increment.
  No authority, acceptance, human, retained evidence, or workspace content is
  rewritten or deleted.

## Progress and Evidence

- 2026-08-14: Completed the mandated resume inspection. Handoff commit/tree,
  branch, runtime pins, immutable hashes, protected human-file blob, ignored
  `.claude/`, completed WP3b logs/plan, audit requirements, complete WP3 text,
  relevant control-plane code/tests, and retained WP3b evidence were checked.
  The absence of a provider abstraction and the direct candidate launch paths
  were reproduced structurally. This WP3c plan was written before production
  changes.
- 2026-08-14: Implemented and committed the WP3c control plane as
  `cc17d8e5f22beb3eb3be9871bb6fed5efa9c031b` (tree
  `44050eba6c69bdf9ced6cc388a18c51b72348576`). The canonical provider
  contract distinguishes `trusted-container`, `unsafe-local-diagnostic`, and
  unattested direct diagnostics. Trusted execution is the migrated/default
  policy and deterministically fails before candidate spawn while the WP3d
  executor is absent. Explicit unsafe diagnostics retain the shared bounded
  supervisor but are completion-ineligible. Provider identity is now
  controller-owned and strictly propagated/equated across config, commands,
  tiers, exact aggregate evidence, state, target integration, reconciliation,
  readiness history, and doctor reporting. Legacy evidence migrates to
  unattested/ineligible; a legacy pending target operation becomes explicitly
  blocked rather than being retroactively trusted.
- 2026-08-14: Pre-freeze focused evidence passed under exact Node `24.18.0`
  and pnpm `11.15.1`. The complete 46-suite provider/config/schema/doctor/
  supervisor/verifier/tier/integration/reconciliation/state/retention/cleanup
  matrix passed 205 tests with 0 failures and exactly the two declared WP5
  POSIX skips at `artifacts/manual/invariant-vitest-520/`. Its receipt and
  71,507-byte report independently match SHA-256
  `4634557d8296a2e4d3cddc0a606bb71fc1f47cbc8fd37ea80722cfac4b8ddf1b`.
  A later 18-suite hardening subset passed 65/65 at
  `artifacts/manual/invariant-vitest-7812/`.
- 2026-08-14: The final isolated orchestrator aggregate passed all 137 suites:
  436 passed, 0 failed, and the same two WP5 skips at
  `artifacts/manual/test-orchestrator-10220/`. The 152,919-byte report matches
  SHA-256
  `fcb4d768222acc67427da7fcf4175d3fe6b3d45c1db5d336699e6cbc0de60cd3`.
  An earlier aggregate at `artifacts/manual/test-orchestrator-18908/` retained
  one resource-contention timeout and no PASS claim; the unchanged focused
  target-integration recovery suite passed once competing work was removed.
  The earlier complete unit aggregate passed 446 tests, 0 failures, and the
  same two skips at `artifacts/manual/test-unit-21396/`. A redundant later
  pre-freeze unit run was stopped at the user's direction before completion;
  `artifacts/manual/test-unit-1420/` correctly contains no manifest or receipt.
- 2026-08-14: Receipt-owning typecheck, lint, and format checks passed at
  `artifacts/manual/typecheck-3064/`, `artifacts/manual/lint-25080/`, and
  `artifacts/manual/format-check-13384/`. Every receipt declaration and
  artifact byte count/SHA-256 was independently recomputed and matched.
  `pnpm loop:demo-safety` passed all six scenarios at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260815010034386-d9e187ef.json`.
  Live doctor inspection truthfully reported exact pins and valid config but
  trusted-provider NOT_READY: implementation absent, Docker unavailable,
  image digest absent, and policy compatible, with no network call.
- 2026-08-14: `git diff --check` passed before the implementation commit. The
  immutable lock remains SHA-256
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`,
  baseline/active governed hashes remain equal, and the protected human file
  remains byte-identical at Git blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300` outside the commit. No authority,
  success definition, deadline, readiness profile, or skip was changed.

## Next Action

Run the single consolidated final verification on the frozen handoff tree,
serializing all process-supervision coverage and reusing the already-valid
focused/orchestrator evidence. Inspect the resulting exact-tree receipts,
focused contract result, immutable hashes, skip inventory, and clean Git
identity. With those conditions observed, WP3c is closed and the next plan is
WP3d: implement the pinned OCI executor, disposable verification clone,
mount/network/resource containment, and adversarial escape matrix without
adding any host fallback. Do not claim readiness or push.
