# Milestone Loop Template

A reusable, project-agnostic template for an **autonomous milestone
development loop**: an external controller that plans one bounded milestone at
a time with a read-only Planner agent, implements it with a Worker agent in an
isolated git clone, machine-verifies it with receipt-owning evidence, has an
independent Reviewer agent judge the actual diff, and integrates only what
survives all three gates. The controller is durable and resumable: every
state transition is a validated, schema-versioned Git generation published by
an expected-generation atomic ref update. Workspace creation is likewise
restart-safe: the controller commits an exact operation intent before cloning,
publishes through a contained temporary path, and adopts only a clone that
still proves every recorded identity and isolation fact.

Extracted from a battle-tested production loop (source repository pinned at
commit `8928aecc19e8d3ade663063e0ed41740483774e3`); behavior is preserved,
with project-specific facts moved into configuration. The original project's
full configuration ships as a worked example in
[`examples/ski-tycoon/`](examples/ski-tycoon/README.md).

## What is in the box

| Area                   | Where                                                                             | What it does                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator           | `tools/milestone-orchestrator/`                                                   | Planner/Worker/Reviewer loop over the Codex SDK, ref-rooted CAS state generations with schema migrations, recoverable intent-first git isolation, retry/escalation policy, protected-path diff policy, safety demonstration, canary milestone, doctor diagnostics |
| Verification tiers     | `src/verification-tier.ts`, `src/verification-cli.ts`                             | `iteration`, `candidate`, `milestone`, and `periodic` tiers planned from the verification manifest                                                                                                                                                                |
| Invariant suite        | `src/invariant-suite.ts`, `config/invariant-suite.json`                           | Always-run, serial invariants with pinned owner files; fast/migration unit partition                                                                                                                                                                              |
| Evidence               | `scripts/verify.mjs`, `tools/evidence.mjs`, `tools/run-tool-evidence.mjs`         | The authoritative `pnpm verify` aggregate, command-owned receipts with hashed artifacts, fail-closed receipt validation                                                                                                                                           |
| Shadow scope selection | `src/affected-scope.ts`, `config/verification-scope-policy.json`                  | Observational affected-scope recommendation (never suppresses closure) with graduation criteria                                                                                                                                                                   |
| Paired benchmark       | `src/benchmark.ts`, `config/benchmark-matrix.json`                                | Commissioned before/after benchmark of the scope selector against the historical check workload                                                                                                                                                                   |
| Telemetry              | `src/telemetry-*.ts`                                                              | Non-semantic run telemetry and reporting                                                                                                                                                                                                                          |
| Artifacts              | `src/artifact-inventory.ts`, `src/evidence-retention.ts`, `src/retention-plan.ts` | Non-destructive inventory and retention planning; deletion only via hash-approved `loop:retention:apply`                                                                                                                                                          |
| Reconciliation         | `src/reconciliation.ts`                                                           | Resumable controller-boundary reconciliation when work advanced outside the tracked loop, with a fresh independent review                                                                                                                                         |
| Repo contract          | `CONTRACT.md`, `PROJECT_GOAL.md`, `evals/`, `.agent/`, `AGENTS.md`                | Everything an adopting repository must provide                                                                                                                                                                                                                    |

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
selector only _observes_ which checks it would have chosen. Every focused
command — in tier plans, invariant entries, and milestone proposals alike —
must produce a validated command-owned receipt covering its declared
`expectedArtifactKinds`; a zero exit status alone never passes. `pnpm verify`
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
   contains the marker). Remove the source repository's commissioned
   `.agent/verification-manifest.json`; a fresh adopter must commission its own
   manifest from its own Git identity.
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
   keep `build` as the evidence-owning wrapper. Declare the real production
   boundary in `package.json`, for example:

   ```json
   {
     "milestoneLoop": {
       "productionBuild": {
         "script": "build:production",
         "outputRoots": ["dist"]
       }
     }
   }
   ```

   Until this declaration exists, `pnpm build` and the production-build stage
   report `NOT_READY` and cannot emit a PASS receipt. A configured build runs
   from a clean disposable clone, removes stale declared outputs, rejects
   outside-root mutations and linked outputs, and retains a path/size/SHA-256
   inventory in `build-report.json`.

5. **Commission the repository once.** Use
   `tools/milestone-orchestrator/config/source-commissioning-input.json` as the
   input-shape reference, replacing its source identity, target branch, strict
   ancestor base commit, profile, immutable-lock hash, registries, protected
   floor, and focused catalogue with the adopter's values. Keep the input
   inside the repository and tracked. Commit that input
   and all prerequisites, make the tracked and untracked tree completely
   clean, then run:

   ```bash
   pnpm loop:commission -- --input <commissioning-input.json>
   ```

   Commissioning refuses an existing active manifest, a dirty or detached
   checkout, a wrong/non-ancestor base or branch, inconsistent authority,
   lock, profile, readiness history, registries, protected paths, commands, or
   policies. It derives `createdAt` from the base commit, stages and validates
   deterministic bytes, publishes without clobbering, runs the read-only
   commissioning doctor, and prints each generated path, byte count, and
   SHA-256. Review and commit the generated
   `.agent/verification-manifest.json`; do not rerun commissioning on that
   repository.

6. **Check the wiring**:

   ```bash
   pnpm install
   pnpm typecheck
   pnpm test:orchestrator
   pnpm loop:doctor
   pnpm loop:demo-safety
   ```

   `loop:doctor` validates runtime pins, config, state readability, SDK
   authentication, and the complete configured execution-provider capability;
   Docker or Podman presence alone is never reported as trusted readiness.
   `loop:demo-safety` proves retry, recovery, retry-limit stop, and
   protected-file rejection end to end.

   Candidate-authored build, test, and exact `pnpm verify` commands use the
   controller-owned `candidateExecution` provider. The default
   `trusted-container` mode uses the WP3d pinned OCI executor and still fails
   closed unless a reachable Docker Engine, an immutable local image ID with
   matching controller-owned labels, and the complete fixed policy are
   available. Executor version 1.0.0 supports Docker Engine; a configured
   Podman runtime remains an actionable policy mismatch until its interpreted
   policy is implemented and tested. There is no automatic local or WSL
   fallback. Explicit `unsafe-local-diagnostic` mode still uses the shared
   bounded supervisor, but its evidence is visibly marked,
   completion-ineligible, and cannot authorize target integration or
   reconciliation adoption.

   Each trusted command gets a fresh origin-free clone of its exact clean
   commit and a fresh disposable container. The source and pnpm v11 store are
   read-only host binds; the mutable workspace and evidence roots are bounded
   container-local tmpfs volumes held only long enough for a separate
   read-only exporter to reject links and quota breaches before host copy, then
   publish regular files through repeated file-count, byte-count, hash, and
   exclusive-destination checks. The container has no network,
   socket, home/credential, target, or controller-state mount, runs as
   `65532:65532`, and has a read-only root, no capabilities, no-new-privileges,
   and fixed CPU, memory, PID, file, temp, and artifact limits. Candidate
   containers and exporter containers are never reused and cleanup uncertainty
   is non-passing.

   `pnpm test:oci-container -- --output artifacts/<fresh-id>` runs the serial
   normal/adversarial Docker matrix on a Linux controller with exact Node/pnpm
   pins and a populated read-only pnpm v11 store. It hashes the image inputs,
   builds at most once for an unchanged hash, reuses only the immutable image,
   validates command receipts and every containment-report size/hash, and
   proves no labeled container or volume remains. A WSL engine does not make a
   Windows controller ready; run this matrix from Linux (or WSL with a
   Linux-native dependency/controller build) and retain that distinction in
   the evidence.

7. **Run the loop**: `pnpm loop:plan` for one planning pass, `pnpm loop:run`
   for the autonomous loop, `pnpm loop:status` / `loop:resume` /
   `loop:reconcile` for lifecycle operations.

   Every mutating command (`plan`, `run`, `resume`, `canary`, `reconcile`, and
   retention apply) holds the repository-private Git ref
   `refs/milestone-loop/controller-lease` for its lifetime. The ref points to
   a strict owner JSON blob and is acquired, taken over, and released only by
   an atomic expected-owner `git update-ref` operation. A permanent
   `artifacts/orchestrator/state/controller.lease` guard prevents an older
   file-lease implementation from running concurrently with the ref protocol.
   `loop:status` and `loop:dry-run` are strictly read-only — they never
   initialize state, repair a mirror, take the lease, or authorize a later
   state write, and they report the current lease and state refs. A dead
   same-host owner is recovered by replacing exactly the object ID that was
   inspected, so a losing recoverer cannot disturb a newer winner. A lease
   from another host (host identity includes a per-machine instance id, not
   just the hostname), a malformed owner object, or a conflicting legacy lease
   is never stolen. After independently confirming a reported owner is dead,
   an operator can delete only its exact object with the diagnostic's
   `git update-ref -d` command.

   Canonical controller state lives at `refs/milestone-loop/state`. Each target
   is a strict Git commit containing the complete validated state JSON and
   hash/revision metadata, with its parent fixed to the previous generation.
   State commits use a fixed controller identity and canonical message, and a
   save publishes only if the ref still names the exact generation loaded by
   the mutating path. The current and immediately previous generations are
   validated on read. The configured `state.json` is only a human-readable
   mirror: a leased mutating open repairs it after missing, stale, malformed,
   or interrupted writes, while canonical reads never fall back to it. A valid
   legacy mirror is imported exactly once when no state ref exists; malformed
   or linked legacy paths fail closed without publication. Normal branch
   pushes do not include either private ref.

   Isolated clone creation is a durable state operation, not a direct
   filesystem call. State schema `1.9.0` records one exclusive pending
   operation; a `workspace-create` intent is bound to the exact input state
   generation before any directory or clone side effect. The clone is built
   under a unique controller-derived `.create-<hash>` path, made standalone and
   remote-free, then published to its stable final path with no-clobber rename
   semantics.
   A leased restart classifies the recorded paths and can resume a missing
   clone, finish an exact source clone, publish an exact temporary clone, or
   adopt an exact final clone. Validation requires realpath containment, real
   directories (not symlinks, junctions, or gitfiles), the recorded base and
   branch, a clean non-shallow repository, controller identity markers, no
   alternates, and no remote configuration. Ambiguous or substituted content
   is preserved in place and the intent becomes durably blocked; it is never
   overwritten or automatically deleted. `loop:status` and `loop:doctor`
   report the classification and next safe action without taking the lease or
   recovering the operation.

   Approved target integration uses the same exclusive operation authority.
   A strict `target-integrate` intent pins the run, milestone, attempt, exact
   input generation, target base and branch, standalone workspace, approved
   candidate identity and commits, verification-result digest, completion-
   eligible trusted execution-provider identity, and canonical outcome paths
   before `git-outcome.json`, fetch, or fast-forward side
   effects. Leased restart revalidates protected files and candidate identity,
   then resumes only from the exact clean base or adopts only the exact clean
   candidate. Deterministic pending/integrated outcome bytes are adopted or
   regenerated around explicit phases, and one pure reducer owns milestone,
   queue, target, vertical-consumer, processed-count, and human-verification
   stop bookkeeping. Dirty, locked, conflicted, drifted, linked, substituted,
   or unexpected state is preserved with a durable blocked diagnostic. A
   reviewer approval without the operation never authorizes implicit target
   adoption. `loop:status` and `loop:doctor` classify recovery read-only.
   Canonical `1.4.0`/`1.5.0`/`1.6.0`/`1.7.0`/`1.8.0` state is migrated
   virtually on read and becomes `1.9.0` on its next successful CAS
   publication. A legacy pending target integration is preserved as an
   explicit non-adoptable block when it predates provider attestation.

   Terminal workspace cleanup is also an exclusive durable state operation.
   A strict `workspace-cleanup` intent pins the exact state generation,
   terminal workspace identity, policy, timestamps, and failed-run diagnostic
   hashes before dependency removal, archive publication, or recursive
   workspace deletion. Leased startup resumes explicit dependency, archive,
   and delete phases; a missing workspace is adoptable only after durable
   delete authorization, and failed-workspace deletion cannot begin until the
   complete diagnostic archive exactly matches the intent. Unexpected Git or
   path identity, diagnostic drift, links, premature disappearance, and
   partial or conflicting archives are preserved with a durable blocked
   diagnostic. One pure reducer owns terminal cleanup completion. Status and
   doctor classify the exact safe next action without recovery or mutation.

   **No retained evidence is deleted by `loop:run`.** Controller startup only
   _plans_ evidence retention (the run's `evidence-retention.json` lists what a
   deletion would remove and why, or why it is suspended). To actually
   delete: `pnpm loop:retention:plan` writes a standalone plan under
   `artifacts/orchestrator/retention/plans/` and prints its sha256;
   `pnpm loop:retention:apply -- --plan <path> --sha256 <hex>` verifies the
   strict `1.2.0` plan bytes, exact dirty-worktree fingerprint, candidate,
   configuration, roots, citations, target manifests, and suspensions against
   a fresh plan. It then publishes one `retention-apply` intent bound to the
   full approved hash and canonical state generation before creating apply
   artifacts or deleting evidence. Every removal requires a durable
   per-target delete-started phase. The full-hash apply directory contains an
   exact deterministic result and a synced JSONL journal that is derived
   evidence only: restart completes an exact canonical prefix but never treats
   journal text or a missing path as authority. Leased startup recovers the
   operation before other state mutation; conflicts are preserved and durably
   blocked, while one reducer records completion. Status and doctor classify
   progress read-only. Terminal milestone _workspace_ cleanup
   (`src/workspace-cleanup-operation.ts`) remains a separate automatic
   temporary-workspace policy governed by the durable operation above.

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
`packageManager`), and a Codex SDK login for the agent roles. Trusted candidate
execution additionally requires a reachable Docker Engine and the configured
immutable WP3d image ID; ordinary source/semantic checks remain available when
that runtime is absent, but trusted execution stays `NOT_READY`. The
orchestrator test suite (`pnpm test:orchestrator`) and `pnpm typecheck` run
without any product wiring.
