# Current Execution Plan

**Status:** WP4a tracked candidate frozen; final receipt-owning verification in
progress
**Updated:** 2026-08-15
**Owner:** autonomous loop

## Objective

Implement one bounded WP4a increment: introduce a strict generic active
verification-manifest contract and make verification-tier construction consume
it immediately. Exact verification must resolve to the no-argument `pnpm
verify` package-default profile (`bootstrap` or `readiness`) while preserving
the invariant that bootstrap evidence cannot support autonomous readiness.

Keep the committed WP3d OCI/provider baseline intact. Preserve the existing
D-031/D-032 manifest only through an explicit historical loader/adapter used by
the historical benchmark and reconciliation workflows. A legacy source manifest
must never pass the active generic validator or be accepted implicitly for new
in-flight work.

## Goal Constraints

- Do not change `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, or
  `.agent/readiness-profile-activated.json`.
- Do not edit, stage, move, hide, delete, or re-encode the user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.
- Do not mutate
  `.agent/completed/loop-recommissioning-verification.json` or the Ski Tycoon
  worked example in this slice. They remain historical v1 inputs.
- Do not implement `loop:commission`, generate an active source manifest,
  migrate the source branch/configuration, replace product-owned placeholders,
  change verifier deadlines, optimize verification partitions, or claim
  readiness. Those remain WP4b/WP4c/WP6 work.
- Preserve immutable-contract validation, protected-root enforcement,
  command-owned receipts, execution-provider identity, reconciliation
  fail-closed behavior, state/history migration, and the permanent one-way
  readiness marker.
- No OCI executor, image, clone, artifact exporter, container policy, provider,
  or process-supervisor owner changes are planned. Do not rerun the WP3d OCI
  matrix or separate process-supervision suites unless scope unexpectedly
  reaches one of those owners.
- Never run unit, orchestrator, reconciliation/process-supervision, or OCI
  suites concurrently. Broad aggregates and the post-commit verifier are
  strictly serial.

## Baseline Evidence

- Re-inspection after the origin sync found local `HEAD` and `origin/master`
  equal at `2b65ddc860e5c8387de57aa6f2f624f4a734f167`, tree
  `30e787d81c5faee1ae7080f2ffaf845fb8eab268`, on `master` with zero divergence.
  The tracked and staged diffs are empty. The only visible untracked path is the
  protected human improvement plan.
- The protected file is still 78,574 bytes; raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`;
  literal no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`; canonical path-filtered blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Retained WP3d evidence was inspected, not rerun. The r4 OCI matrix is PASS at
  `artifacts/wp3d-oci-milestone-20260815-r4/result.json`; the retained
  orchestrator and unit aggregates are under
  `artifacts/manual/test-orchestrator-18760/` and
  `artifacts/manual/test-unit-3068/`. The prior no-argument verifier honestly
  failed readiness at `artifacts/verify-2026-08-15T174739-211Z-15952/`.
- The current active-path constant points at the historical
  `.agent/completed/loop-recommissioning-verification.json`. Its v1 schema
  requires the exact D-032 milestone literal, two source commits, D-032
  invariant/benchmark identities, D-031 review checks, and readiness-only exact
  verification. The JSON Schema and TypeScript validator repeat those literals.
- `verification-tier.ts` defaults its candidate base to
  `d031BaselineCommit`, hard-codes exact result profile `readiness`, and loads
  the historical manifest implicitly. `affected-scope.ts` retains the stable
  historical wire id `exact-readiness`; the id can remain compatibility data in
  WP4a so long as its runtime profile semantics become package-default.
- Benchmark construction and controller-boundary reconciliation are historical
  D-032 workflows. They directly consume the source fields and exact five-PASS /
  ten-NOT_READY readiness shape. They must move to an explicit legacy loader,
  not be silently reinterpreted as generic active work.
- Config protection currently auto-protects only the historical manifest path.
  The generic active path and the retained legacy path must both remain
  protected when present. Doctor, orchestrator startup, safety demonstration,
  CLI tier dispatch, protected-root tests, and docs reference the old default.
- Active invariant, scope, and benchmark registry ids are still D-032-specific.
  WP4a will validate generic cross-references using fixtures but will not migrate
  those active source files. The benchmark identity is deliberately absent from
  the new generic manifest and remains historical-only.
- Existing schema/config/tier tests load the live v1 file implicitly;
  benchmark/reconciliation tests exercise its historical semantics; state-store
  migration tests preserve legacy/unattested evidence. These tests must be
  adapted only where ownership changes, without weakening their negative cases.

## Affected-test Matrix

| Production owner changed                                                                                               | Exact focused tests/cases                                                                                                                         | Broader regression surface                                             | Receipt/artifact requirement                                                                                              | Execution discipline                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Generic v2 manifest types, strict validator, package-default profile resolver, safe paths, and reconciliation minimum  | new `verification-manifest.test.ts`; manifest cases in `schema.test.ts`; `config.test.ts`                                                         | `test:orchestrator`, `test:unit`, typecheck/lint/format                | Focused Vitest JSON plus PASS receipt; malformed base/profile/path/policy fixtures must throw                             | Pure temporary-directory fixtures only; no repository mutation               |
| Tier construction consumes commissioning base/profile, invariant id, scope-policy id, and package-default exact policy | `verification-tier.test.ts`; `affected-scope.test.ts`; affected exact-result cases in `verifier.test.ts`; `execution-provider.test.ts` regression | both aggregates                                                        | Focused receipt records all exact files and counts; bootstrap exact index must remain non-authoritative and non-readiness | Run as one serial semantic shard; inject identities/provider where possible  |
| Explicit legacy load/adapter for historical source benchmark and reconciliation only                                   | exact affected cases/files in `benchmark.test.ts`, `reconciliation.test.ts`, `verification-cli.test.ts`, `protected-roots.test.ts`                | both aggregates; existing recovery cases inside orchestrator aggregate | Legacy v1 active-load rejection and allowed historical contexts must be machine-tested                                    | Reconciliation shard runs alone; no process-supervision or aggregate overlap |
| Active/legacy manifest path protection and observational doctor/orchestrator/safety behavior                           | `config.test.ts`, `doctor.test.ts`, `safety-demonstration.test.ts`, relevant `schema.test.ts` registry check                                      | `loop:demo-safety`, both aggregates                                    | Safety report retained if shared protection/startup behavior changes                                                      | Demo and all aggregates serial; no OCI matrix                                |
| Documentation, plan/log, JSON Schema, immutable and human-file identities                                              | parseable-schema case, focused Prettier/ESLint inspection, both `git diff --check` modes                                                          | receipt-owning typecheck/lint/format; post-commit no-argument verifier | Independently recompute every receipt/artifact byte count and SHA-256; record durations and five slowest tests            | Freeze all tracked content before final gates                                |

## Steps

1. [x] Read the frozen goal, agent contract, plan standard, completed WP3d
       handoff/logs, WP4 source plan, current Git/evidence state, and relevant
       manifest/config/schema/tier/reconciliation/doctor/CLI and migration tests.
       Reconfirm origin sync and protected-file identities.
2. [x] Define the generic v2 manifest model and strict validation:
       commissioning id/base/profile/time, objective/exclusions, focused
       commands, protected paths, invariant and scope-policy ids, literal
       package-default exact policy, and a generic reconciliation policy whose
       canonical minimum cannot be removed and whose additions are explicit.
       Keep v1 in a separately named historical type/validator.
3. [x] Add active and historical loaders with distinct paths and explicit
       historical contexts. Active loading accepts v2 only and resolves its
       commissioned profile against `package.json`; legacy loading is restricted
       to benchmark/reconciliation/worked-example contexts. Protect both paths
       when present and add a deterministic legacy-to-generic adapter only where
       the historical reconciliation tier requires it.
4. [x] Make tier construction use `commissioning.baseCommit`, validate invariant
       and scope-policy identities, and pass the resolved package-default profile
       into exact-result parsing/indexing. Allow `bootstrap` and `readiness`
       exact indexes while preserving every readiness-completion gate and the
       legacy reconciliation requirement for readiness NOT_READY evidence.
5. [x] Route the historical benchmark and reconciliation consumers through the
       explicit legacy API; add the narrowly scoped reconciliation CLI adapter
       if the child tier boundary requires it. Update doctor/startup/safety and
       documentation only as required to distinguish active generic commissioning
       from retained historical data.
6. [x] Add fail-closed fixtures and regressions from the matrix. During
       implementation run only the smallest exact Vitest files/cases; run
       typecheck once public interfaces stabilize. Diagnose failures with one
       focused reproduction rather than rerunning an aggregate.
7. [x] Update `docs/decision-log.md`, `docs/autonomy-log.md`, this plan, schema
       artifact, and user-facing contract/config docs. Inspect scope, freeze all
       tracked source/tests/docs/logs, and reconfirm immutable/protected files.
8. [in progress] On the frozen candidate, run the focused affected receipt shard(s), the
   applicable provider/tier/reconciliation regressions, safety demo, both
   broad aggregates, static gates, and diff checks exactly as budgeted.
   Independently validate results, counts, skips, durations, five slowest
   tests, receipts, byte counts, hashes, candidate identity, and immutable
   lock. Repair only from a focused reproduction; any tracked repair
   invalidates and reruns only its affected frozen-tree evidence.
9. [ ] Stage only the cohesive WP4a paths, verify the protected human file is
       untouched/untracked, commit without pushing, then run the repository-
       mandated no-argument `pnpm verify` exactly once from the clean committed
       tracked tree. Report its honest result; the user-owned untracked file,
       source placeholders, trusted default configuration, and known verifier
       deadline remain untouched and non-passing.

## Acceptance Criteria

- `validateVerificationManifest` and the active loader contain no required
  D-031/D-032 milestone, commit, benchmark, invariant, or review literal.
- A direct generic fixture loads and constructs iteration, candidate,
  milestone, and periodic plans. Its default base is the commissioned base and
  its invariant/scope ids must exactly match their loaded registries.
- Exact tier execution is literal no-argument `pnpm verify`; its expected profile
  comes from `package.json#milestoneLoop.verification.defaultProfile`, matches
  the commissioning profile, and is never selected by override.
- Valid bootstrap PASS evidence can support truthful bootstrap/tier completion
  only. It retains profile `bootstrap`, never becomes autonomous-readiness
  equivalent, and cannot satisfy existing readiness completion/reconciliation
  gates.
- Malformed or nonexistent/non-ancestor base commits, unsupported or mismatched
  profiles, unsafe/duplicate/uncovered protected paths, scope/invariant identity
  drift, and incomplete/malformed reconciliation policy fail closed.
- Historical source v1 manifests fail the active validator/loader. They remain
  byte-readable only through explicitly named historical benchmark,
  reconciliation, or worked-example contexts; the active historical file and
  Ski Tycoon example bytes are not changed.
- Immutable authority, success thresholds, exact verifier command, readiness
  meaning, readiness-marker history, execution-provider identity, protected
  roots, receipts, and reconciliation recovery are not weakened.
- Focused affected tests, provider/tier/reconciliation regressions, existing WP3
  and recovery/supervision coverage in the applicable aggregates, typecheck,
  lint, format, safety (if affected), and both diff checks pass with honest
  receipts. Existing explicit platform skips are neither broadened nor relabeled.
- WP4a is committed as one narrow increment, no push occurs, and the final
  handoff names the exact WP4b action without claiming readiness.

## Verification

All commands prepend `.tools/node-v24.18.0-win-x64` to `PATH` and confirm Node
`24.18.0` plus pnpm `11.15.1`. Artifact directories are unique and ignored.

Command budget after the tracked candidate freezes:

1. At most two receipt-owning `invariant-vitest` commands. The first serial
   schema/config/tier/provider shard names `verification-manifest.test.ts`,
   `schema.test.ts`, `config.test.ts`, `verification-cli.test.ts`,
   `verification-tier.test.ts`, `affected-scope.test.ts`,
   `protected-roots.test.ts`, `verifier.test.ts`, `doctor.test.ts`,
   `safety-demonstration.test.ts`, and `execution-provider.test.ts`. The second
   exclusive historical/recovery shard names `benchmark.test.ts`,
   `reconciliation.test.ts`, and `orchestrator-cleanup.test.ts`. Both use exact
   repository-relative file arguments and `--fileParallelism=false`.
2. `pnpm loop:demo-safety` once because manifest protection/startup ownership is
   expected to change. No separate process-supervisor suite and no OCI command.
3. `pnpm test:orchestrator` once, then `pnpm test:unit` once. Never overlap them
   or any reconciliation/supervision command.
4. `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` once each with their
   command-owned receipts.
5. `git diff --check` and `git diff --cached --check`; inspect staged path scope
   and independently validate all receipts/artifacts/hashes/counts/timings.
6. Commit the verified tree. Then run no-argument `pnpm verify` exactly once as
   required for a milestone by `AGENTS.md`. Its expected unrelated failure is
   reported, never converted into WP4a PASS or readiness evidence.

Evidence invalidation rules:

- Any tracked production/type/schema change invalidates focused semantic,
  typecheck, lint, format, and both aggregate evidence touching that surface.
- A test-only repair invalidates its focused shard and affected aggregate, not
  unchanged OCI/provider/process evidence.
- A docs/plan/log-only edit after semantic evidence requires diff/static
  reinspection; all tracked content freezes before broad aggregate evidence.
- The commit changes commit identity but not tree identity; pre-commit frozen-
  tree receipts remain implementation evidence, while the sole post-commit
  no-argument verifier owns committed-candidate identity.

## Risks and Recovery

- A compatibility adapter could accidentally become a general bypass. Keep its
  context enum and allowed paths closed, make the active loader reject v1, and
  test wrong context/path/mode combinations.
- Widening exact profile types could leak bootstrap PASS into readiness. Preserve
  the existing authoritative `profileId`, completion claim/equivalence fields,
  readiness stage-set checks, marker history, and reconciliation readiness-only
  checks; add negative regression coverage before broad tests.
- Changing the default manifest path could drop protection of the legacy file.
  Build the canonical set from both existing active and retained historical
  paths and assert it in config/protected-root tests.
- Existing source tiers will remain uncommissioned until WP4b creates the active
  v2 source manifest. This is intentional and must surface as missing generic
  commissioning, not as permission to use v1 implicitly.
- Recovery is ordinary source-control reversal of this cohesive commit. No
  external service, state reset, image/container mutation, or destructive file
  operation is required.

## Progress and Evidence

- 2026-08-15: Completed read-only WP4a inspection. Confirmed the synced Git
  identity, clean tracked tree, protected human-file identities, retained WP3d
  evidence, all active v1 source assumptions, current exact-profile hard-coding,
  legacy benchmark/reconciliation coupling, manifest protection behavior, and
  the affected schema/config/tier/reconciliation/historical-state tests. No full
  verifier or broad aggregate was run for orientation.
- 2026-08-15: Implemented the v2 generic active type/schema/loaders, strict
  package-default profile resolution, generic tier runtime consumption, closed
  historical source/Ski contexts, source reconciliation adapter, dual manifest
  protection, and documentation. The initial 50-test diagnostic found one
  historical-adapter protected-floor gap; after the additive repair the
  manifest test passed 6/6 and a direct TypeScript diagnostic passed. Added a
  source-independent generic four-tier fixture and an explicit regression that
  bootstrap evidence cannot enter readiness reconciliation. No receipt-owning
  final command or broad aggregate has run yet.

## Next Action

Finish focused Prettier/ESLint inspection and the affected historical tests,
freeze every tracked source/test/plan/log/doc change, then execute the two
receipt-owning focused shards and the serial milestone command budget. Do not
edit either historical manifest or the protected user file.
