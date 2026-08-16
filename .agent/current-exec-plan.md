# Current Execution Plan

**Status:** WP5d complete and independently verified; cohesive commit pending
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Complete one bounded WP5 strict-configuration increment by publishing a strict
JSON Schema for the current `OrchestratorConfig` and adding one differential
acceptance/rejection corpus that exercises both the real runtime parser and the
schema contract. Preserve the already-implemented runtime rejection of unknown
top-level fields, extend explicit regression coverage across meaningful nested
boundaries, and make any runtime/schema disagreement fail the focused suite.

This increment closes the remaining strict-config evidence gap without
reopening WP4d, WP5a, WP5b, or WP5c. It does not broaden into cross-platform
CI, change configuration meaning or migration behavior, or create another
runtime validator.

Explicit non-goals are Doctor schema `2.0.0`, Status schema `1.0.0`, invariant
IDs/routing, verifier stages/profiles/completion, commissioning, readiness,
execution providers, state/recovery/mutation boundaries, package dependencies,
product-domain work, fresh-adopter reproving, OCI execution, safety
demonstration, or autonomous-readiness claims.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the immutable acceptance suite and lock,
  `evals/HIDDEN_VALIDATION_PROTOCOL.md`, the permanent readiness marker,
  active and historical commissioning, exact verifier semantics, all worked
  examples, and the retained WP4d evidence byte-for-byte.
- Preserve every currently valid schema `1.6.0` source/example/generated
  config and all supported `1.0.0` through `1.5.0` runtime migrations. The raw
  `default.template.json` remains an intentionally placeholder-invalid authoring
  skeleton until generation/substitution. The new JSON Schema describes the
  current post-migration/runtime input contract; it does not delete legacy
  runtime compatibility or silently broaden acceptance.
- Unknown top-level fields and unknown fields at closed nested object
  boundaries must be rejected by both current runtime parsing and the JSON
  Schema. Open collections whose keys are intentionally identifiers or roles
  remain open only where the runtime contract is open.
- The differential corpus must use one data set and compare the expected
  disposition independently against the real `loadConfigForInspection` path
  and a standards-based JSON Schema evaluation of the shipped schema, including
  referenced schema files. A mismatch is a test failure with the case ID.
- Do not add or update a dependency. `package.json`, the workspace package
  manifest, `pnpm-lock.yaml`, and all existing package-script identities remain
  unchanged.
- Preserve the exact source/default/template/example configuration bytes unless
  inspection finds a schema defect that cannot be represented without changing
  behavior; any such conflict stops implementation for plan revision.
- Use pinned Node `24.18.0` and pnpm `11.15.1` through
  `.tools/node-v24.18.0-win-x64/corepack.cmd`, with that Node directory first on
  `PATH`. Run long suites separately and serially.
- Do not run a source no-argument `pnpm verify` or rerun the completed
  fresh-adopter proof. OCI and safety demonstrations are not applicable because
  provider execution and controller mutation/recovery boundaries do not change.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry branch is `master`, HEAD
  `5290dd96796a79014961a9aa65859f6ba547d3cd`, tree
  `5e865f5c6530fcfaf09db082dbe8060979525a25`, and parent
  `5089a460390dad60f2bb234cee81f91f7e27a5ea`. Tracked and staged trees are
  clean; the protected plan is the sole untracked path. Unlike the expected
  handoff, the locally observed `origin/master` and `origin/HEAD` now point at
  HEAD, so repository-authoritative divergence is `0 behind / 0 ahead`. No
  fetch, push, or ref mutation occurred.
- The protected plan is 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Retained WP4d proof
  `artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` is 2,424 bytes
  with SHA-256
  `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`.
  Retained source result
  `artifacts/verify-2026-08-16T082128-760Z-17384/result.json` is 44,372 bytes
  with SHA-256
  `1ca139e2a995c117b87e07de04707cde1de5bf7a2e4ea6ffce38ba605d8564d0`.
- Pinned focused baseline
  `pnpm exec vitest run tools/milestone-orchestrator/src/config.test.ts tools/milestone-orchestrator/src/schema.test.ts --fileParallelism=false`
  passed 17/17 tests across 2/2 files. Existing runtime coverage already rejects
  an unknown current-config root field, and source blame ties that behavior to
  the earlier provider-control increment rather than this WP5d increment.
- A read-only pinned runtime/schema probe showed the valid fixture is accepted,
  unknown root and nested candidate-execution fields are rejected, but
  `tools/milestone-orchestrator/schemas/orchestrator-config.schema.json` does
  not exist and zero differential corpus matches are executed. The probe exited
  1 on that missing contract. Existing schema tests only parse selected JSON
  Schema files and do not evaluate shared valid/invalid examples against both
  runtime and schema implementations.
- Current runtime loading calls `migrateConfig`, then
  `assertOrchestratorConfig`; inspection mode subsequently canonicalizes
  protected paths, while ordinary loading additionally checks the installed SDK.
  These behaviors and returned config semantics are out of scope for change.

## Steps

1. [x] Complete the resume protocol, authority/plan/log review, entry/protected/
       retained identity audit, WP5 roadmap/source/test/schema inspection, and
       pinned reproduction of the actual strict-config evidence gap.
2. [x] Replace the completed WP5c plan with this bounded WP5d executable plan
       before substantial implementation.
3. [x] Inventory the exact current runtime config and nested model-policy
       constraints, compare them with existing schema artifacts, and choose a
       dependency-free, fail-closed test evaluator for the exact JSON Schema
       2020-12 keyword subset used here. Record intentional runtime-only
       repository/cross-field semantic constraints.
4. [x] Add a strict versioned `orchestrator-config` JSON Schema, reuse/reference
       the existing model-policy schema where semantics agree, and add only the
       minimum schema/test support needed to evaluate it independently.
5. [x] Add one named differential corpus covering maintained valid configs,
       valid boundary variants, top-level typo/unknown keys, closed nested
       unknown keys, missing required keys, and representative value/path/list
       failures. Assert expected runtime and schema dispositions plus exact
       runtime/schema parity for every case.
6. [x] Update configuration documentation to identify the schema, current-only
       versus migrated-input boundary, and differential drift gate. Add focused
       regression assertions for all shipped current config files without
       changing their bytes.
7. [x] Freeze source/tests/docs/plan/logs, run serial receipt-owning focused,
       invariant, orchestrator, unit, typecheck, lint, and format checks; then
       independently audit receipts, artifact bytes/hashes, test totals/skips,
       diffs, protected identities, immutable/commissioning/readiness/example/
       package/lock identities, and private state/lease absence.
8. [x] Update this plan, `docs/autonomy-log.md`, and the durable decision record;
       freeze the explicit WP5d path set and evidence for one audited commit
       without pushing. The commit itself is the next mechanical storage action.

## Acceptance Criteria

- The current `OrchestratorConfig` has a parseable, versioned JSON Schema using
  closed root and nested object boundaries consistent with runtime validation.
  Its identity and schema version agree with runtime `CONFIG_SCHEMA_VERSION`.
- The existing valid source default, generated adopter config, and maintained
  worked-example config remain accepted by runtime parsing and the JSON Schema
  without byte changes. The raw placeholder template remains rejected by both.
  Runtime migrations from `1.0.0` through `1.5.0` retain their existing
  acceptance/output behavior.
- One shared, named corpus covers accepted current configurations, an unknown or
  misspelled root key, unknown nested keys at each applicable closed boundary,
  missing required fields, and representative invalid scalar/path/list values.
  Every case matches its expected disposition in both independent evaluators.
- The test fails when either runtime or JSON Schema acceptance is perturbed for
  a corpus case, and diagnostics name the case and disagreeing evaluator. No
  test merely compares two booleans without also checking the expected result.
- Schema references resolve locally and deterministically under the pinned
  toolchain. No network, package install, generated cache, new dependency,
  package script, or lockfile mutation is required.
- Doctor `2.0.0`, Status `1.0.0`, invariant registry identities, exact verifier
  command/stages/profiles/completion, active commissioning, readiness marker,
  provider/state/recovery contracts, examples, and retained WP4d/WP5a-c
  evidence remain unchanged.
- Focused receipt-owning tests and the applicable invariant/orchestrator/unit
  aggregates, typecheck, lint, and format all pass. Only the two declared
  Windows POSIX process-group skips may remain in broad suites.

## Verification

Every command runs separately and serially. Each invocation resolves
`.tools/node-v24.18.0-win-x64`, prepends it to `PATH`, and invokes pnpm through
that directory's `corepack.cmd`.

Implementation diagnostics (not final evidence):

1. Focused Vitest for the new differential corpus plus `config.test.ts`,
   `schema.test.ts`, model-policy tests, and adopter-package tests if schema
   packaging/inventory ownership requires them.
2. Direct probes that deliberately mutate only in-memory corpus values and
   confirm expected runtime/schema failure diagnostics.
3. Focused typecheck/lint/format while interfaces and schema fixtures stabilize.

Final frozen-tree commands, in order:

1. Receipt-owning affected Vitest shard through
   `tools/run-tool-evidence.mjs invariant-vitest`, with final path chosen once
   and recorded before the run.
2. `pnpm test:invariants` with an explicit fresh final evidence directory.
3. `pnpm test:orchestrator` with an explicit fresh final evidence directory.
4. `pnpm test:unit` with its command-owned final evidence directory captured.
5. Receipt-owning `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each
   using a separate explicit final evidence directory.
6. Independent receipt-to-artifact byte/SHA-256 validation; focused and broad
   suite/test/failure/skip count audit; schema/corpus case-count audit; then
   `git diff --check`, staged-path review, and all immutable, commissioning,
   readiness, package/lock, example, retained-evidence, private ref/path, and
   protected-plan identity checks.
7. One commit without push, followed by HEAD/tree/divergence/status and protected
   identity re-audit.

Evidence invalidation:

- Any runtime validator, JSON Schema, corpus, config loader, or maintained
  config change invalidates the focused schema-parity evidence.
- Any invariant registry/adapter change invalidates the direct invariant suite;
  none is planned.
- Any verifier/profile/completion, provider, state, or mutation/recovery change
  is out of scope and requires stopping to revise the plan.
- Record-only plan/log/doc changes after semantic tests require static and diff
  reinspection; freeze all tracked files before final receipts.

## Risks and Recovery

- The runtime validator contains both shape constraints and semantic checks
  (mandatory protected-root membership, safe relative paths, installed SDK
  compatibility after inspection). A JSON Schema can express most shape/value
  rules but must not pretend to own repository- or installation-dependent
  semantics. The corpus will classify and document any intentional runtime-only
  check rather than weaken it or encode false equivalence.
- Legacy configs are migrated before runtime validation. Applying a current-only
  JSON Schema directly to legacy bytes would create false drift. Keep migrated
  compatibility tests separate and run differential parity only on current
  schema inputs.
- Referencing `model-policy.schema.json` could expose pre-existing schema/runtime
  drift. Fix only contract-preserving schema drift needed by the current config;
  if correction would change accepted runtime behavior or package contracts,
  revise the plan before proceeding.
- A partial test validator could accidentally make the parity test
  self-confirming. The frozen install exposes no declared JSON Schema evaluator
  and only an inaccessible Ajv 6 transitive dependency, while package/lock
  changes are prohibited for this increment. Use a narrow test-only 2020-12
  evaluator with independent reference/contains/closed-boundary tests; it must
  enumerate every supported keyword and throw on any unsupported keyword rather
  than silently accepting it.
- Recovery is ordinary reversal of the single cohesive WP5d commit. No push,
  network, credentials, history rewrite, recommissioning, protected-file
  handling, controller mutation, or destructive cleanup is needed.

## Progress and Evidence

- 2026-08-16: Entry/protected/retained identities matched the handoff except the
  local remote-tracking divergence: `origin/master` already equals HEAD, making
  actual divergence `0/0`. Required authority, contract, plan standard,
  completed WP5c plan, newest WP5 logs/decisions, protected WP5 roadmap, audit,
  and strict-config source/tests were read before editing.
- 2026-08-16: Pinned baseline tests passed 17/17. The runtime already accepts
  the valid fixture and rejects unknown root/nested fields. A separate probe
  exited 1 because the corresponding orchestrator-config JSON Schema is absent
  and no differential corpus exists. This plan therefore preserves the prior
  runtime hardening and closes schema publication/drift evidence rather than
  claiming to rediscover or reimplement it.
- 2026-08-16: Exact constraint inventory found that the raw config template is
  deliberately invalid before substitution and that `model-policy.schema.json`
  trails runtime only for whitespace-only override reasons and duplicate roles.
  No declared 2020-12 validator is installed, and the only Ajv copy is an
  undeclared ESLint transitive dependency. WP5d will use a fail-closed test-only
  evaluator, correct those two schema-only drifts, reference the policy schema
  from the new config schema, and copy both schemas into generated adopters.
- 2026-08-16: Implemented the current `1.6.0` schema, corrected model-policy
  whitespace/duplicate-role schema drift, and added a fail-closed evaluator
  that resolves local/external references, closed objects, applicators,
  contains bounds, formats, scalar/array constraints, and rejects unsupported
  keywords. The 40-case shared corpus plus two structural/evaluator tests passed
  42/42. The affected config/schema/model-policy/adopter shard passed 69/69,
  including generated-adopter schema copying and validation; focused TypeScript
  and ESLint diagnostics passed. A diagnostic Ajv 6 compile was not credited:
  that undeclared transitive version predates 2020-12 `minContains` and wrongly
  requires one override for each role, confirming it is unsuitable as the
  committed oracle.
- 2026-08-16: Final receipt-owning affected evidence passed 69/69 with zero
  skips across 11/11 suites at
  `artifacts/manual/wp5d-config-schema-focused-final` (23,154-byte report,
  SHA-256
  `77b344f481a412b94810943b7cf4985d861e481a0133fcadeffab3f7b55b64f5`).
  The 42 parity tests comprise 40 named corpus cases plus closed-boundary and
  fail-closed evaluator/reference checks. Generated-adopter creation validated
  its emitted config against both copied schemas. The optional plain-Node
  direct-telemetry begin hook could not load the TypeScript-only
  `path-safety.js` import, so telemetry is null; the report and receipt are
  complete.
- 2026-08-16: Direct invariants passed all four commands in 29,059 ms at
  `artifacts/manual/wp5d-invariants-final`: outer completion-ineligible report
  7,232 bytes / SHA-256
  `7cd9a4cce21063a09430d0c3226d2eca9caa5756820f2823af331e6a4d833693`,
  direct completion-ineligible contract 13/13, schema 7/7, policy 15/15, and
  fail-closed evidence 61/61. The contract report is 3,531 bytes / SHA-256
  `18a7c2029615685dbb349a65db07486e939d96474497910282847cbb8850d6d7`.
- 2026-08-16: The orchestrator aggregate passed 577/579 with zero failures and
  only the two declared Windows POSIX process-group skips across 174/174 suites
  (201,850 bytes / SHA-256
  `6ea09b0d6431166ea88030159e77b3e9a33de019bfe6cfd5056d3e7afd217c20`).
  The unit aggregate passed 590/592 with the same skips across 176/176 suites
  (206,052 bytes / SHA-256
  `a23980c4376548dc247cd8e3d5eab35ccf1d5fe2cba135f8132704b29891de23`).
  Receipt-owning typecheck, lint, and format passed; their report hashes are
  `2540e3c6155ab20c1971bb940ebbb4eb6cd784e787e0de4ad4b6e15fb1c6fe53`,
  `012193e1acb18740e236708f9f394cf589285030adb1d06ec4a0c613724d10ec`,
  and `53633d763f14ac37272fd7801634c524fa7658e42a348edd7bfa7009314f08ca`.
- 2026-08-16: Independent evidence inspection matched 11 PASS receipts to 11
  declared artifacts totaling 474,994 bytes and confirmed all suite/test/
  failure/skip counts. Immutable authority, commissioning, readiness, exact
  verifier, invariant registry, Doctor/Status, package/lock, configs/examples,
  retained WP4d evidence, and private-state absence all matched entry. The
  protected plan retained its three identities. No no-argument source verifier,
  OCI/safety run, fresh-adopter proof rerun, mutation, dependency install, ref
  change, or push occurred; provider and mutation/recovery boundaries were
  unchanged, so OCI/safety were not applicable.

## Next Action

Format and inspect the final record-only plan/log changes, stage only the
explicit WP5d path set, run cached diff/scope/protected audits, and create the
single cohesive commit without pushing.
