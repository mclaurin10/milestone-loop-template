# Orchestrator configuration

Each `*.json` file here is loaded and strictly validated at runtime. The
matching `*.template.json` is a placeholder-annotated skeleton you fill in for
your project (JSON cannot carry comments, so the placeholders and this file are
the documentation). A historical worked configuration for a real project lives
in [`examples/ski-tycoon/`](../../../examples/ski-tycoon/) at the repository
root. Its `worked-example.v1` descriptor is validated only through the explicit
read-only `pnpm loop:example:validate -- --descriptor
examples/ski-tycoon/worked-example.json` command. The legacy v1 manifest and
D-031/D-032 identities there are never active defaults or commissioning input.

The shipped `*.json` files are a minimal, valid configuration for this template
repository itself (workspace = the orchestrator package only), so the
orchestrator test suite runs green out of the box. Adopting projects replace
their contents, guided by the templates.

For a new repository, prefer the strict package workflow over copying and
editing this source tree. `pnpm loop:template:create -- --definition
<definition.json> --output <absent-directory>` generates the adopter-owned
config, registries, immutable lock, bootstrap scripts, and strict-ancestor
commissioning input in a fresh attached Git history. The executable example is
`fixtures/fresh-adopter/definition.json`. No adopter-specific hash or
acceptance count is edited into `scripts/verify.mjs`; commissioning and
contract-integrity bind the generated lock and authority bytes to the exact
base commit named by the input and active manifest.

## default.json (`OrchestratorConfig`, schema 1.6.0)

The machine-readable current-input contract is
[`../schemas/orchestrator-config.schema.json`](../schemas/orchestrator-config.schema.json).
It is strict at the root and every closed nested object, and references the
shipped strict `model-policy.schema.json`. A shared differential corpus runs
each maintained acceptance/rejection case through both the real
`loadConfigForInspection` path and an independent JSON Schema 2020-12 evaluator;
unknown root/nested fields, missing keys, and representative invalid values
must receive the same disposition. The fresh-adopter generator copies both
schemas and its generated `default.json` must satisfy them.

The schema describes current `1.6.0` input. Runtime migration remains the sole
owner of legacy `1.0.0` through `1.5.0` acceptance, and the raw
`default.template.json` remains an authoring skeleton whose model placeholders
are deliberately invalid until substituted. Repository-dependent checks that
JSON Schema cannot express—most notably requiring the configured authority
path itself to occur in `protectedPaths`—remain stricter runtime checks.

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
- `candidateExecution` — the controller-owned execution-provider selection.
  `trusted-container` is the default and never falls back to the host. In this
  WP3d data-plane increment a trusted capability is ready only when the
  executor implementation, reachable Docker Engine/server version, immutable
  local image ID and labels, mount policy, resource-limit profile, and
  denied-network policy are all available. Version 1.0.0 intentionally rejects
  Podman as a policy mismatch pending dedicated interpreted-policy support.
  Every trusted command uses a fresh exact clone/container and bounded
  container-local workspace/evidence volumes; only the unchanged image may be
  reused. `unsafe-local-diagnostic` is an explicit operator opt-in; it
  continues to use the bounded process supervisor, but its results are visibly
  identified, completion-ineligible, and forbidden from target integration or
  reconciliation adoption.
- `limits` — hard loop budgets (attempts, wall clock, invocations, tokens)
  plus per-command supervision bounds: `commandMs` (timeout),
  `commandOutputLimitBytes` (retained bytes per stdio stream before the
  command is terminated and marked infrastructure-failed with an explicit
  truncation disposition), and `commandKillGraceMs` (the grace interval
  between termination phases and the post-exit stream-drain window).
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
  files — is a protected change. The active commissioned manifest at
  `.agent/verification-manifest.json` and the retained historical source
  manifest at `.agent/completed/loop-recommissioning-verification.json` each
  join the enforced set automatically while present.

Config schema migrations live in `src/config.ts` (`migrateConfig`); 1.0.0 →
1.5.0 configs are migrated in memory to 1.6.0 with generic defaults for new
sections (including the supervision limits added at 1.5.0). Every legacy
configuration migrates to `trusted-container` with no pinned image; migration
never silently grants unsafe host execution. The migration also additively
unions the mandatory protected trust roots into `protectedPaths` (protections
are only ever strengthened).
The environment variable `MILESTONE_LOOP_CONFIG` overrides the config path.

Production-build wiring is package-owned rather than part of `default.json`.
Keep the root `build` script pointed at `tools/run-tool-evidence.mjs build`,
then configure `package.json#milestoneLoop.productionBuild` with a distinct
project script and explicit project-relative output roots. Omitting that
declaration is an intentional `NOT_READY`; an empty or echo-only build cannot
produce a passing receipt. See the production-build contract in
[`CONTRACT.md`](../../../CONTRACT.md#2-packagejson-obligations).

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
fails the invariant. The `protected-integrity` entry invokes the
controller-owned contract evaluator directly through `verification-cli.ts`
and requires its completion-ineligible `contract-integrity-report`; it does
not inherit the verifier environment stage. `pnpm exec vitest run …` and any
other `pnpm verify -- --stage …` argvs are routed through
`tools/run-tool-evidence.mjs` receipt wrappers (`invariant-vitest` produces
`invariant-vitest-report`; `focused-verify` retains the stage's authoritative
`result.json` as `focused-verify-result`).

## test-ownership.json (`milestone-loop-test-ownership.v1`)

The canonical source-repository ownership catalogue for WP6. Its four
allowlisted owners correspond to the current controller runtime, repository
tooling, generated-adopter template, and trusted-container fixture boundaries.
Every file list and owner block is canonical and ordered. The catalogue does
not define discovery: the receipt-owning `test-ownership` invariant invokes
Vitest listing twice for every tracked or unignored config, reconciles current
package/candidate/invariant/CI entry points, and then requires the discovered
union to equal the catalogue with exactly one valid owner per file. Missing,
overlapping, stale, invalid, duplicate, case-ambiguous, or nondeterministic
classification fails closed. The WP6b `test:partition:<owner>` commands consume
only this passing declaration; config assignment is derived from the repeated
discovery provenance and every successful owner command binds its selection and
raw Vitest reports through a command-owned receipt. The clean-only
`test:partitions:shadow` aggregate authenticates the exact-union/intersection
proof and normalized legacy-equivalence result. These commands are not part of
the commissioned tier schedule yet and do not suppress existing execution.

## slow-suite-registry.json (`SlowSuiteRegistry`)

The explicit list of slow/migration test files. Vitest discovery minus this
list is the "fast unit" partition; the registry files are the "migration
unit" partition. Every listed file must be discoverable by vitest, and the
two partitions must be an exact disjoint union of discovery.

## benchmark-matrix.json (`BenchmarkMatrix`, historical source context)

The retained paired-benchmark instrument from D-032. Structure, thresholds,
and class ids are pinned by `assertBenchmarkMatrix` and cannot be weakened.
It is consumed only by the explicit historical benchmark context; generic v2
commissioning does not load or require it. The template uses an adopter-owned
ID placeholder so it cannot silently copy the source milestone identity.

- `classes[].paths` — representative files in _your_ repo for each benchmark
  class.
- `historical.fullSafeCheckIds` — every check id the loop ran per candidate
  before scope selection existed (the "before" lane of the paired benchmark).
- `historical.iterationCheckIdsByClass` — the historical per-iteration check
  sets for classes that had narrower iteration workflows.

## Verification manifests

The active `.agent/verification-manifest.json` uses the generic
`verification-manifest.v2` contract. Create it once with
`pnpm loop:commission -- --input <file>` using a repository-contained tracked
input. A fresh adopter receives that input from `loop:template:create`; the
tracked `source-commissioning-input.json` records only this repository's
already-commissioned source context and is not an adoption template. The
command requires a clean tracked and untracked target-branch
checkout, an absent active manifest, a strict-ancestor base commit, and an
explicit package-default `bootstrap` or `readiness` profile with compatible
marker history. It validates existing frozen authority and lock identities,
the current invariant/scope registries, protected floor, focused package
commands, exact and reconciliation policies, and all four tier plans. It
derives the manifest timestamp from the base commit, publishes validated bytes
without clobber, reports path/bytes/SHA-256, and never regenerates authority.

The manifest's `focusedCommands` define the check catalogue (id, argv, tiers,
expected artifact kinds), and its target branch, invariant, scope,
exact-verification, protected-path, and reconciliation identities fail closed
at load or tier construction. The retained
`.agent/completed/loop-recommissioning-verification.json` v1 record is readable
only by explicit source benchmark/reconciliation contexts and is never a
default for new work. See `CONTRACT.md` at the repository root.
