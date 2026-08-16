# Current Execution Plan

**Status:** WP5a complete and committed; the next WP5 slice has not started
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Complete one bounded WP5a increment that turns `pnpm loop:doctor` into an
authoritative, read-only operational diagnostic and adds
`pnpm loop:doctor -- --strict` as a machine-usable fail-closed gate.

The diagnostic must distinguish `pass`, `warning`, and `block`; expose a
complete ordered issue list; report the exact next safe command when one can be
derived; and exit nonzero in strict mode whenever an operational blocker is
present. It must reuse the existing commissioning, production-build,
execution-provider, state, lease, and protected-root authorities rather than
inventing weaker parallel checks.

This is the Doctor slice of WP5. It is not the WP5 status expansion, independent
invariant extraction, strict-config corpus, CI matrix, canonical-history
completion, WP6 partition optimization, product implementation, source
readiness repair, or an autonomous-readiness claim.

## Goal Constraints

- Treat WP4d as complete at commit
  `6b0ecad59b0b0e416ab43eb920b27f8293cc97fe`; do not amend, reinterpret, or
  rerun its post-commit source verifier for a greener result.
- Preserve `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, the readiness marker, active and
  historical commissioning records, and every example payload byte-for-byte.
- Preserve package-default `readiness`, the one-way readiness lifecycle,
  exact no-argument verification, provider completion eligibility, state and
  lease CAS authority, operation-intent recovery, protected roots, and the
  bootstrap/non-readiness distinction.
- Doctor is observational. It performs no network calls, creates no state or
  directories, acquires no lease, repairs no mirror, changes no ref, and writes
  no evidence or configuration while diagnosing.
- Doctor may reuse authoritative read-only validators, but it may not execute a
  full build, verifier, candidate command, container, or Codex call. It reports
  wiring, identity, capability, and recorded evidence only.
- A warning must never be relabeled as a pass. A block must never be downgraded
  merely so this deliberately unready source template reports ready.
- Use pinned Node `24.18.0` and pnpm `11.15.1` through
  `.tools/node-v24.18.0-win-x64/corepack.cmd`. Never overlap long aggregate,
  reconciliation, supervision, container, or verifier suites.
- No OCI matrix is applicable because this increment does not change the
  executor/provider owner or containment policy.
- Never edit, stage, move, hide, delete, re-encode, clean, or otherwise mutate
  the user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry identity matches the completed handoff exactly: branch `master`, HEAD
  `6b0ecad59b0b0e416ab43eb920b27f8293cc97fe`, tree
  `e1435981331d0faefe6fb93d496f7151c6dba35d`, subject
  `feat: add fresh-adopter bootstrap packaging proof`, and divergence
  `0 behind / 4 ahead` of `origin/master`.
- The tracked and staged trees are clean. The only untracked path is the
  protected human plan. Its 78,574 bytes, raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300` all match the handoff.
- Retained WP4d proof
  `artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` is 2,424
  bytes with SHA-256
  `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`.
  The retained post-commit source result is 44,372 bytes with SHA-256
  `1ca139e2a995c117b87e07de04707cde1de5bf7a2e4ea6ffce38ba605d8564d0`.
- WP5 is the next unresolved roadmap dependency after WP4. Its Doctor
  acceptance requires operational checks, three check severities, strict
  nonzero exit on blockers, complete actionable blockers, and no expensive
  verification in the diagnostic.
- Under the pinned runtime, current `pnpm loop:doctor -- --json` exits 0 with
  schema `1.8.0` and top-level `attention`. It reports coarse `pass/attention`
  checks. On this source it sees the protected untracked plan and unavailable
  configured Docker runtime, but it does not report package placeholders,
  production-build declaration, realpath containment, SDK identity, latest
  exact evidence, current integration eligibility, or a next command.
- Current `pnpm loop:doctor -- --strict --json` exits 1 before inspection with
  `Unknown loop argument: --strict`. This is the focused WP5a reproducer.
- `inspectCommissionedRepository` already validates target branch/current
  HEAD, strict-ancestor base, profile/marker/history compatibility, immutable
  authority, registry identity, protected floor, focused command catalogue,
  and all four verification-tier plans. Doctor currently collapses that result
  to only target branch/base/profile and two registry ids.
- `loadProductionBuildContract` is the truthful production-build declaration
  authority. `loadConfig` currently combines structural config loading with
  installed SDK compatibility, so Doctor cannot report those two facts
  independently without a narrow inspection loader.
- Controller state records authoritative exact verification summaries and
  verified target identity. These records, not artifact-directory guessing,
  are the only eligible source for Doctor's latest-exact and current-integration
  fields.

## Steps

1. [x] Reconcile WP4d handoff identities, protected-file identities, retained
       proof/result hashes, current plan/log/decision state, the frozen
       authority, and the WP5 roadmap. Reproduce ordinary and strict Doctor
       behavior with the pinned runtime without running a broad suite.
2. [x] Replace the stale WP4d pre-commit plan with this bounded WP5a plan and
       record WP4d as complete without modifying its evidence or meaning.
3. [x] Define the versioned Doctor diagnostic and CLI semantics. Add
       `pass/warning/block`, ordered actionable issues, blocker/warning counts,
       integration eligibility, and a deterministic next command. Parse
       `--strict` only for Doctor and return a distinct nonzero blocker exit
       after emitting the complete JSON diagnostic.
4. [x] Add authoritative read-only checks for expanded commissioning/tier
       facts, truthful production-build declaration and placeholder scripts,
       configured/installed SDK identity, configured-root lexical/realpath
       containment, latest state-owned exact verification identity, and current
       autonomous-integration eligibility. Keep existing provider, state,
       operation, trust-root, lease, runtime, authentication, and cleanliness
       coverage.
5. [x] Add focused fixtures for every new blocker/warning class, strict
       argument ownership and exit semantics, ready-with-warning versus blocked
       aggregation, deterministic ordering/next command, sensitive-data
       redaction, and byte/ref/read-only preservation.
6. [x] Update README and CONTRACT Doctor guidance. Freeze source/tests/
       docs, run focused diagnostics, then serial receipt-owning broader checks,
       static gates, behavioral Doctor probes, diff checks, and independent
       artifact/identity audits. Repair only through focused reproduction.
7. [x] Update this plan and `docs/autonomy-log.md`; add a decision-log
       entry only for a durable diagnostic contract choice. Stage only the
       cohesive WP5a files, verify both diffs and all protected identities,
       commit once without pushing, and report honest remaining WP5/source gaps.

## Acceptance Criteria

- Doctor emits a strict new schema whose individual checks use only `pass`,
  `warning`, or `block`; its top-level status is `ready` when no block exists
  and `blocked` otherwise. It includes deterministic counts and an ordered,
  machine-readable issue list with stable code, check id, severity, concise
  message, remediation, and optional exact command.
- `pnpm loop:doctor -- --strict` is accepted only for Doctor. The full
  diagnostic is printed before strict mode exits 2 for blockers; strict mode
  exits 0 for a fixture with no blockers. Non-strict Doctor remains diagnostic
  and exits 0 even when reporting `blocked`. Other loop commands reject
  `--strict` before repository mutation.
- Commissioning output exposes manifest/hash, target branch, base, current
  HEAD/tree, profile, registry ids, immutable-lock hash, and all four tier-plan
  summaries. Missing or invalid commissioning is a block and never falls back
  to a historical manifest.
- Package readiness uses the same production-build contract loader as the build
  evidence owner and reports every active placeholder-backed package script.
  Missing/malformed build declaration or any active placeholder is a block.
- Configuration syntax and installed SDK compatibility are reported separately.
  Doctor records configured package/version, installed version or absence, and
  exact equality without attempting Codex authentication or network access.
- State, controller artifact, verification artifact, and workspace roots are
  checked lexically and through the nearest existing real path without creating
  them. A symlink/junction escape or unsafe/non-directory existing root blocks;
  absent safe descendants remain diagnosable without mutation.
- Latest exact verification is derived only from validated controller state. It
  reports absence, run/result/provider/profile/candidate identity, freshness
  against target HEAD, and completion eligibility. Missing or stale evidence is
  a warning that points to `pnpm verify`; malformed state remains a block.
- Current autonomous-integration eligibility is true only when the clean target,
  commissioned readiness profile, trusted completion-eligible provider, exact
  current PASS evidence, protected integrity, no lease/operation/reconciliation,
  valid roots/runtime/SDK/package wiring, and matching controller target state
  all support it. Doctor never grants eligibility from bootstrap, unsafe-local,
  stale, absent, or self-asserted evidence.
- The next command is deterministic and names the earliest safe recovery or
  verification action supported by the diagnostic. When a blocker requires
  manual repair rather than an executable command, Doctor says so and points
  back to strict Doctor after repair instead of inventing an unsafe command.
- Doctor remains read-only under ready, warning, block, malformed, pending
  operation, active lease, path escape, and strict-mode cases. Tests compare
  tracked bytes, state bytes, relevant refs, paths, and absence/presence facts
  before and after inspection.
- No immutable authority, acceptance semantics, commissioning identity,
  verifier deadline/profile, provider eligibility rule, source placeholder,
  product system, or WP4d evidence changes. The source is expected to remain
  blocked; this increment improves the truthfulness and actionability of that
  result rather than repairing readiness.
- Focused Doctor/CLI/config/build-contract tests, receipt-owning orchestrator and
  unit aggregates, typecheck, lint, format, safety demonstration, behavioral
  Doctor probes, and diff/protected-identity audits pass. Windows-only POSIX
  skips remain explicit and are not relabeled.

## Verification

All commands prepend `.tools/node-v24.18.0-win-x64` to `PATH`, invoke pnpm
11.15.1 through that directory's `corepack.cmd`, use unique ignored evidence
directories, and run serially.

Implementation diagnostics:

1. Focused Vitest for `doctor.test.ts`, `cli.test.ts`, configuration inspection,
   and production-build contract reuse while interfaces stabilize.
2. Focused real CLI fixtures proving non-strict/strict 0/2 behavior and output
   before exit. These diagnostics are not final completion evidence.
3. No source no-argument verifier, fresh-adopter proof, OCI matrix,
   reconciliation suite, or container matrix unless a discovered defect proves
   that this increment changed one of those owners.

Final frozen-tree checks:

1. One receipt-owning affected invariant/orchestrator shard covering Doctor,
   CLI, commissioning projection, config inspection, path safety, production
   contract loading, state evidence projection, and relevant recovery Doctor
   consumers.
2. One `pnpm test:orchestrator`, followed by one `pnpm test:unit`; do not overlap
   them or any other long aggregate.
3. One each of `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, with
   command-owned receipts, followed by `pnpm loop:demo-safety` if the frozen
   diff still touches an operational inspection boundary.
4. Run ordinary source Doctor and strict source Doctor once each. Ordinary must
   exit 0 while reporting the complete honest blocked result; strict must emit
   the same diagnostic and exit 2. Independently audit issue ordering, blocker/
   warning counts, next command, protected-file treatment, and read-only refs.
5. `git diff --check`, `git diff --cached --check`, staged-path review, immutable/
   commissioned/example/protected identity audit, and final status/divergence.
6. Commit once without pushing. No autonomous-readiness or full-WP5 claim.

Evidence invalidation:

- Doctor schema, aggregation, config/package/path/state projection, or CLI exit
  changes invalidate all focused WP5a tests and behavioral probes.
- Commissioning projection changes additionally invalidate commissioning and
  tier-plan focused cases; they do not require a fresh-adopter verifier unless
  commissioning semantics themselves change.
- Shared production-build contract changes invalidate production-build focused
  tests. This plan prefers reuse without changing that authority.
- State/operation projection changes invalidate Doctor recovery consumers and
  the orchestrator aggregate; no state schema migration is intended.
- Documentation or plan/log-only changes after semantic evidence require static
  and diff reinspection. Freeze all tracked content before final receipt gates.

## Risks and Recovery

- A mega-check can hide the first actionable failure. Keep stable individual
  checks and a deterministic issue list; one failed prerequisite may cause a
  dependent check to report `warning/not-checked`, never a false pass.
- Reimplementing commissioning or build validation inside Doctor could drift
  from the execution authorities. Reuse their read-only loaders and project
  validated output into Doctor; extract only the narrow config-inspection seam
  needed to distinguish SDK mismatch.
- Treating missing state or missing exact evidence as a universal block could
  prevent first-run operation. Classify safe initializable state and
  verification-needed evidence as warnings, while keeping current autonomous
  integration false until every eligibility fact is present.
- Realpath inspection can accidentally create paths or follow unsafe links.
  Use only `lstat`/`realpath` on existing ancestors, reject linked/outside roots,
  and test absent roots plus symlink/junction escapes. Recovery is ordinary
  reversal of this cohesive commit; never clean suspicious paths.
- Strict CLI must not throw before printing the diagnostic or leak through an
  error stack. Emit JSON, then set the documented blocker exit code. Keep parser
  ownership explicit so other commands cannot acquire a new flag accidentally.
- This source deliberately has a protected untracked plan, placeholders, no
  production build, and unavailable trusted runtime/image. Its strict Doctor
  should fail honestly. Do not mutate those facts or use them as a reason to
  weaken the diagnostic.
- No push, external credentials, network access, history rewrite, source
  recommissioning, protected-file handling, destructive cleanup, or product
  authority change is required.

## Progress and Evidence

- 2026-08-16: Reconciled the exact WP4d handoff and protected identities;
  confirmed both retained artifact hashes; read the frozen authority, contract,
  plan standard, newest logs/decisions, WP5 roadmap, current Doctor/CLI/tests,
  commissioning/build/config/state authorities, and package metadata. Selected
  the Doctor portion of WP5 as the next dependency-ordered bounded increment.
- 2026-08-16: Under Node `24.18.0` and pnpm `11.15.1`, ordinary Doctor returned
  schema `1.8.0`/`attention` with exit 0, while the exact strict reproducer
  failed at argument parsing with exit 1 and `Unknown loop argument: --strict`.
  No broad suite, verifier, container, or mutating loop command ran.
- 2026-08-16: Implemented schema `2.0.0`, Doctor-only strict exit semantics,
  complete ordered issues/counts/next action, expanded authority projections,
  separate structural-config/installed-SDK reporting, package/build wiring,
  lexical and realpath checks, state/operation/protected-integrity checks,
  state-owned exact-result hash/provider identity validation, and current
  integration eligibility. Doctor probes only the configured trusted provider
  and reuses read-only commissioning, production-build, state, lease, and
  recovery authorities.
- 2026-08-16: Focused Doctor, CLI, and configuration suites passed 38/38 after
  hardening linked-parent evidence, linked trust roots, wrong-kind ancestors,
  provider drift, and simultaneous operation/protected drift. The three
  affected recovery consumers previously passed their exact Doctor cases
  serially. Receipt-owning typecheck passed at
  `artifacts/manual/typecheck-23028/typecheck-report.json`. One deliberately
  invalid attempted SDK fixture proved the schema itself freezes the configured
  SDK policy; it was removed, and the valid injected installed-version mismatch
  remains the focused separation proof.
- 2026-08-16: The receipt-owning accepted shard passed 38/38 at
  `artifacts/manual/invariant-vitest-7236`. The serial orchestrator aggregate
  passed 523/525 at `artifacts/manual/test-orchestrator-19716`; unit passed
  536/538 at `artifacts/manual/test-unit-23304`. Both had zero failures/todos
  and only the two declared Windows POSIX process-group skips. Report bytes and
  SHA-256 values matched each PASS receipt. Typecheck, lint, and format passed
  with matched receipts at `artifacts/manual/typecheck-7452`,
  `artifacts/manual/lint-22044`, and `artifacts/manual/format-check-8972`.
  The live safety demonstration passed all scenarios at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260816150722143-fe2a229a.json`.
- 2026-08-16: Final source ordinary/strict Doctor emitted identical schema
  `2.0.0` blocked diagnostics. Ordinary exited 0 and strict exited 2 with 9
  passes, 3 warnings, 4 blocks, false integration eligibility, stable issue
  order, and `git status --short --branch` as the next command. Git status,
  absent state/lease refs, and absent state path were byte/fact unchanged. No
  source verifier, OCI matrix, or mutating loop command ran.
- 2026-08-16: Final scope audit found exactly the 13 intended tracked WP5a
  paths and no staged content. Immutable, commissioned, readiness-lifecycle,
  package/lock/verifier, and worked-example paths have zero diff. The protected
  human plan remains the only untracked path at 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`. Both retained WP4d artifact
  identities still match the handoff. Diff checks pass and no push occurred.

## Next Action

After the cohesive WP5a commit, start a new bounded plan for the next
dependency-ordered WP5 slice (status expansion and shared invariant extraction)
without folding it into this increment. Preserve the protected untracked human
plan and do not push unless explicitly instructed.
