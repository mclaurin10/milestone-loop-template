# Milestone Loop Template

A reusable, project-agnostic template for an **autonomous milestone
development loop**: an external controller that plans one bounded milestone at
a time with a read-only Planner agent, implements it with a Worker agent in an
isolated git clone, machine-verifies it with receipt-owning evidence, has an
independent Reviewer agent judge the actual diff, and integrates only what
survives all three gates. The controller is durable and resumable: every
state transition is a validated, schema-versioned atomic write.

Extracted from a battle-tested production loop (source repository pinned at
commit `8928aecc19e8d3ade663063e0ed41740483774e3`); behavior is preserved,
with project-specific facts moved into configuration. The original project's
full configuration ships as a worked example in
[`examples/ski-tycoon/`](examples/ski-tycoon/README.md).

## What is in the box

| Area | Where | What it does |
| --- | --- | --- |
| Orchestrator | `tools/milestone-orchestrator/` | Planner/Worker/Reviewer loop over the Codex SDK, durable state store with schema migrations, retry/escalation policy, git isolation, protected-path diff policy, safety demonstration, canary milestone, doctor diagnostics |
| Verification tiers | `src/verification-tier.ts`, `src/verification-cli.ts` | `iteration`, `candidate`, `milestone`, and `periodic` tiers planned from the verification manifest |
| Invariant suite | `src/invariant-suite.ts`, `config/invariant-suite.json` | Always-run, serial invariants with pinned owner files; fast/migration unit partition |
| Evidence | `scripts/verify.mjs`, `tools/evidence.mjs`, `tools/run-tool-evidence.mjs` | The authoritative `pnpm verify` aggregate, command-owned receipts with hashed artifacts, fail-closed receipt validation |
| Shadow scope selection | `src/affected-scope.ts`, `config/verification-scope-policy.json` | Observational affected-scope recommendation (never suppresses closure) with graduation criteria |
| Paired benchmark | `src/benchmark.ts`, `config/benchmark-matrix.json` | Commissioned before/after benchmark of the scope selector against the historical check workload |
| Telemetry | `src/telemetry-*.ts` | Non-semantic run telemetry and reporting |
| Artifacts | `src/artifact-inventory.ts`, `src/evidence-retention.ts`, `src/retention-plan.ts` | Non-destructive inventory and retention planning |
| Reconciliation | `src/reconciliation.ts` | Resumable controller-boundary reconciliation when work advanced outside the tracked loop, with a fresh independent review |
| Repo contract | `CONTRACT.md`, `PROJECT_GOAL.md`, `evals/`, `.agent/`, `AGENTS.md` | Everything an adopting repository must provide |

## The four-tier verification model

Verification cost scales with how much a change claims:

1. **Iteration** (`pnpm verify:iteration`) — the always-run invariant suite
   plus the focused checks selected for the change while a worker iterates.
2. **Candidate** (`pnpm verify:candidate`) — every candidate-tier command in
   the verification manifest (format, lint, typecheck, build, fast unit,
   orchestrator suite, …) against a clean candidate tree.
3. **Milestone** (`pnpm verify:milestone`) — the full milestone-tier command
   set plus the authoritative `pnpm verify` exact closure; this is what an
   integrated milestone must pass.
4. **Periodic** (`pnpm verify:periodic`) — scheduled full closure re-runs
   that detect drift between milestones.

Tier plans are derived from the manifest's check catalogue; the shadow scope
selector only *observes* which checks it would have chosen. `pnpm verify`
itself is profile-based (`bootstrap` → `readiness`, a one-way transition
enforced by marker-file history) and fail-closed: a command that exits 0
without a valid evidence receipt is a failure, and missing stage scripts
report `NOT_READY`, never pass.

## Adopting the loop

1. **Copy the template** into a fresh repository (fresh git history). Decide
   your starting profile: new projects normally delete
   `.agent/readiness-profile-activated.json` and set
   `package.json#milestoneLoop.verification.defaultProfile` to `"bootstrap"`
   (this template ships in `readiness` shape because its own history already
   contains the marker).
2. **Write your authority set**: replace `PROJECT_GOAL.md` and the `evals/`
   placeholders, then regenerate `evals/immutable-contract-lock.json` hashes
   and the `ESTABLISHED_IMMUTABLE_LOCK_SHA256` pin in `scripts/verify.mjs`.
   Re-pin the acceptance-contract counts in `validateAcceptanceManifest` to
   your frozen contract.
3. **Fill the configuration** from the `*.template.json` skeletons in
   `tools/milestone-orchestrator/config/` (documented in
   [`config/README.md`](tools/milestone-orchestrator/config/README.md)):
   project profile, scope policy, invariant suite, slow-suite registry,
   benchmark matrix.
4. **Implement the repository contract** in [`CONTRACT.md`](CONTRACT.md):
   replace every `tools/placeholder-check.mjs` script with a real
   evidence-producing command, wire your product's verify stages, and
   author the verification manifest
   (`.agent/completed/loop-recommissioning-verification.json`).
5. **Check the wiring**:

   ```bash
   pnpm install
   pnpm typecheck
   pnpm test:orchestrator
   pnpm loop:doctor
   pnpm loop:demo-safety
   ```

   `loop:doctor` validates runtime pins, config, state readability, and SDK
   authentication; `loop:demo-safety` proves retry, recovery, retry-limit
   stop, and protected-file rejection end to end.
6. **Run the loop**: `pnpm loop:plan` for one planning pass, `pnpm loop:run`
   for the autonomous loop, `pnpm loop:status` / `loop:resume` /
   `loop:reconcile` for lifecycle operations.

## Extension points

- **Agent provider** — `src/codex-gateway.ts` is the single adapter between
  the loop and the Codex SDK (threads, sandboxes, structured output,
  usage accounting). Swapping providers means reimplementing this one
  module's surface; that swap is deliberately out of scope for this
  template, and nothing else imports the SDK.
- **Model policy** — `config/default.json#agentPolicy` pins the SDK version,
  per-role models, and reasoning efforts; `src/model-policy.ts` enforces it.
- **Scope classifier layout** — `classifyAffectedPath` in
  `src/affected-scope.ts` encodes a conventional monorepo layout
  (`packages/foundation|protocol|persistence|simulation|ui|renderer`,
  `apps/web|headless`). It is shadow-only; adapt it if your layout differs.
- **Benchmark classes** — the five commissioned benchmark classes are pinned
  in `src/benchmark.ts`; point their `paths` at representative files of your
  repository in `benchmark-matrix.json`.
- **Prompt preambles** — interpolate `project.name` / `project.authorityFile`
  from config; the sentences themselves live in `src/planner.ts`,
  `src/orchestrator.ts`, `src/reviewer.ts`, `src/reconciliation-reviewer.ts`.

## Layout

```text
PROJECT_GOAL.md              frozen product authority (placeholder)
AGENTS.md                    autonomous agent operating contract
CONTRACT.md                  what an adopting repository must implement
evals/                       frozen acceptance contract + immutable lock
.agent/                      plan standard, live plan, queued proposal,
                             lifecycle marker, verification manifest
scripts/verify.mjs           authoritative profile-based verification
tools/evidence.mjs           command-owned receipt/hashing helpers
tools/run-tool-evidence.mjs  pinned tool boundary (format/lint/typecheck/…)
tools/milestone-orchestrator orchestrator package (config/, schemas/, src/)
examples/ski-tycoon/         fully worked configuration from the source project
```

## Requirements

Node 24 (exact pin in `package.json#engines`), pnpm 11 (exact pin in
`packageManager`), and a Codex SDK login for the agent roles. The
orchestrator test suite (`pnpm test:orchestrator`) and `pnpm typecheck` run
without any product wiring.
