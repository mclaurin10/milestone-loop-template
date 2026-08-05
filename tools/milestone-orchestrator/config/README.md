# Orchestrator configuration

Each `*.json` file here is loaded and strictly validated at runtime. The
matching `*.template.json` is a placeholder-annotated skeleton you fill in for
your project (JSON cannot carry comments, so the placeholders and this file are
the documentation). A fully worked configuration for a real project lives in
[`examples/ski-tycoon/`](../../../examples/ski-tycoon/) at the repository root.

The shipped `*.json` files are a minimal, valid configuration for this template
repository itself (workspace = the orchestrator package only), so the
orchestrator test suite runs green out of the box. Adopting projects replace
their contents, guided by the templates.

## default.json (`OrchestratorConfig`, schema 1.3.0)

- `project.name` — interpolated into the planner/worker/reviewer prompt
  preambles ("You are the read-only Planner for the _<name>_ autonomous
  milestone loop.").
- `project.authorityFile` — the frozen goal document at the repository root.
  Interpolated into every agent preamble, must appear in `protectedPaths`, and
  is the file the safety demonstration attempts (and must fail) to modify.
- `project.verticalSpine` — the milestone-kind keyword policy. A feature
  proposal whose text matches at least `minimumCategories` of the
  `categoryPatterns` regexes (case-insensitive) is rejected as an unbounded
  "whole product spine" attempt. An empty `categoryPatterns` list disables the
  breadth check until you configure it.
- `agentPolicy` — Codex SDK pin, per-role models and reasoning efforts, and
  worker-escalation policy.
- `limits` — hard loop budgets (attempts, wall clock, invocations, tokens).
- `protectedPaths` — frozen files the diff policy refuses to let a worker
  touch. Must include `project.authorityFile`, the `evals/` contract files,
  and the mandatory controller trust roots (`AGENTS.md`,
  `.agent/readiness-profile-activated.json`, `scripts/verify.mjs`,
  `pnpm-lock.yaml`, `package.json`,
  `tools/milestone-orchestrator/config/invariant-suite.json`). The loop
  always enforces the canonical union of these mandatory roots with the
  configured entries, matched case-insensitively; adopters may add stricter
  paths but can never remove the floor. Beyond file literals, the entire
  `tools/milestone-orchestrator/` subtree is protected (the controller runs
  from the target checkout, so its source and config are
  verifier-equivalent): any changed path under it — including newly created
  files — is a protected change. A commissioned verification manifest at
  `.agent/completed/loop-recommissioning-verification.json` joins the
  enforced set automatically while it exists.

Config schema migrations live in `src/config.ts` (`migrateConfig`); 1.0.0 →
1.3.0 configs are migrated in memory to 1.4.0 with generic defaults for new
sections, and the migration additively unions the mandatory protected trust
roots into `protectedPaths` (protections are only ever strengthened).
The environment variable `MILESTONE_LOOP_CONFIG` overrides the config path.

Telemetry is non-semantic everywhere: a telemetry open/write/finalize
failure degrades telemetry claims only — the underlying command, agent,
verification, review, and run outcomes are preserved, and a
`telemetry-error.json` (or `agent-telemetry-error.json`) diagnostic plus a
stderr line record the degradation.

## verification-scope-policy.json (`VerificationScopePolicy`)

Shadow-mode affected-scope selection policy (observational only — it never
suppresses the authoritative closure).

- `browserHostScriptPatterns` — regex sources matched against changed paths to
  classify them as `browser-host` triggers (your repo's browser-verification
  script locations).
- `mandatoryChecks` — for each trigger class, the check ids that any
  recommendation must include. Ids must exist in the verification manifest's
  `focusedCommands` (or the built-in auxiliary ids `dependencies`,
  `test-unit`, `exact-readiness`).
- `workspaceChecks` — keys must exactly equal the pnpm workspace package names
  (including the root package); values are the check ids run when that package
  owns a changed path.

The path→trigger-class classifier itself lives in `src/affected-scope.ts` and
encodes a conventional monorepo layout (`packages/foundation`,
`packages/protocol`, `packages/persistence`, `packages/simulation`,
`packages/ui`, `packages/renderer`, `apps/web`, `apps/headless`). If your
layout differs, adapt `classifyAffectedPath` — it is shadow-only, so a
mismatch weakens telemetry, never correctness.

## invariant-suite.json (`InvariantSuiteRegistry`)

The always-run invariant suite: fast, serial checks executed on every tier.
Each entry pins the files that own the invariant (`ownerPaths` must exist),
the paths that trigger it, and an exact argv. Optional `testFile`/`testTitle`
pin one named test whose title must literally appear in that file. Every
entry must declare nonempty `expectedArtifactKinds`, and a missing receipt
fails the invariant. `pnpm exec vitest run …` and `pnpm verify -- --stage …`
argvs are routed through `tools/run-tool-evidence.mjs` receipt wrappers
(`invariant-vitest` produces `invariant-vitest-report`; `focused-verify`
retains the stage's authoritative `result.json` as `focused-verify-result`).

## slow-suite-registry.json (`SlowSuiteRegistry`)

The explicit list of slow/migration test files. Vitest discovery minus this
list is the "fast unit" partition; the registry files are the "migration
unit" partition. Every listed file must be discoverable by vitest, and the
two partitions must be an exact disjoint union of discovery.

## benchmark-matrix.json (`BenchmarkMatrix`)

The commissioned paired-benchmark instrument (D-032). Structure, thresholds,
and class ids are pinned by `assertBenchmarkMatrix` and cannot be weakened.

- `classes[].paths` — representative files in _your_ repo for each benchmark
  class.
- `historical.fullSafeCheckIds` — every check id the loop ran per candidate
  before scope selection existed (the "before" lane of the paired benchmark).
- `historical.iterationCheckIdsByClass` — the historical per-iteration check
  sets for classes that had narrower iteration workflows.

## Verification manifest (`.agent/completed/loop-recommissioning-verification.json`)

Not in this directory, but the file every check id above must agree with: its
`focusedCommands` define the check catalogue (id, argv, tiers, expected
artifact kinds). See `CONTRACT.md` at the repository root.
