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
configuration ships as an explicitly validated, legacy-only worked example in
[`examples/ski-tycoon/`](examples/ski-tycoon/README.md).

## What is in the box

| Area                   | Where                                                                                | What it does                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator           | `tools/milestone-orchestrator/`                                                      | Planner/Worker/Reviewer loop over the Codex SDK, ref-rooted CAS state generations with schema migrations, recoverable intent-first git isolation, retry/escalation policy, protected-path diff policy, safety demonstration, canary milestone, doctor diagnostics |
| Verification tiers     | `src/verification-tier.ts`, `src/verification-cli.ts`                                | `iteration`, `candidate`, `milestone`, and `periodic` tiers planned from the verification manifest                                                                                                                                                                |
| Invariant suite        | `src/contract-integrity.ts`, `src/invariant-suite.ts`, `config/invariant-suite.json` | Always-run, serial, completion-ineligible invariants with pinned owner files; shared contract-integrity evaluation; fail-closed test ownership; fast/migration unit partition                                                                                     |
| Evidence               | `scripts/verify.mjs`, `tools/evidence.mjs`, `tools/run-tool-evidence.mjs`            | The authoritative `pnpm verify` aggregate, command-owned receipts with hashed artifacts, fail-closed receipt validation                                                                                                                                           |
| Shadow scope selection | `src/affected-scope.ts`, `config/verification-scope-policy.json`                     | Observational affected-scope recommendation (never suppresses closure) with graduation criteria                                                                                                                                                                   |
| Paired benchmark       | `src/benchmark.ts`, `config/benchmark-matrix.json`                                   | Commissioned before/after benchmark of the scope selector against the historical check workload                                                                                                                                                                   |
| Telemetry              | `src/telemetry-*.ts`                                                                 | Non-semantic run telemetry and reporting                                                                                                                                                                                                                          |
| Artifacts              | `src/artifact-inventory.ts`, `src/evidence-retention.ts`, `src/retention-plan.ts`    | Non-destructive inventory and retention planning; deletion only via hash-approved `loop:retention:apply`                                                                                                                                                          |
| Reconciliation         | `src/reconciliation.ts`                                                              | Resumable controller-boundary reconciliation when work advanced outside the tracked loop, with a fresh independent review                                                                                                                                         |
| Repo contract          | `CONTRACT.md`, `PROJECT_GOAL.md`, `evals/`, `.agent/`, `AGENTS.md`                   | Everything an adopting repository must provide                                                                                                                                                                                                                    |

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

The `protected-integrity` invariant calls the same controller-owned evaluator
as the authoritative verifier's `contract-integrity` stage, but through a
direct adapter rather than a focused aggregate. It therefore does not inherit
the verifier's environment stage or unrelated project wiring. Its versioned
report and the outer invariant-suite report both state
`completionEligible:false`; only the exact no-argument `pnpm verify` can
produce completion evidence. A failed contract check retains its diagnostic
report and produces no PASS receipt.

The `test-ownership` invariant independently runs Vitest file discovery twice
for every repository config, reconciles the root, orchestrator, candidate,
commissioned, invariant, generated-adopter, OCI, and exact-runtime CI entry
points, then compares their normalized union with
`config/test-ownership.json`. A new, removed, multiply owned, ambiguously
discovered, or invalid-owner test fails without a receipt. The owner-partition
work called WP6b in repository history corresponds to intended WP6c. Its shadow
commands consume that passing declaration directly:
`test:partition:controller-runtime`, `test:partition:repository-tooling`,
`test:partition:adopter-template`, and
`test:partition:trusted-container-fixture` each own a selection report and raw
Vitest report(s). `pnpm test:partitions:shadow` requires a clean immutable
candidate, validates the child receipts, proves the owner partitions are an
exact disjoint discovery union, deduplicates the intentionally overlapping
legacy results by normalized file/test identity, and compares disposition and
failure outcome. This remains a shadow-only candidate surface; the existing
executors, commissioned tiers, no-argument verifier, and exact-runtime closure
schedule are unchanged.

Intended WP6b adds compact, non-semantic measurements to the legacy unit and
orchestrator commands and those owner partitions. Each measured command writes
a strict `test-run-summary.json`, hash-binds it as a `test-run-summary` artifact
in its own receipt, and records exact run/candidate/platform identity, report
hashes and counts, wall/setup/Git/startup/test-body timing, CPU, and peak RSS.
Every metric defines its boundary and unit and uses an explicit
`measured`/`unavailable`/`not-applicable` disposition; the peak-RSS value is the
maximum instrumented-process peak, not concurrent tree memory. The clean shadow
validates those receipt declarations and deterministically reduces summaries
only into `test-run-summary-reduction.json`. Neither artifact changes test
success, authorizes a tier cutover, or makes a benchmark claim. The JSON
contracts live in `tools/milestone-orchestrator/schemas/`.
An instrumented process that is force-terminated while publishing its atomic
probe record leaves the affected Git/startup/CPU/RSS metrics explicitly
`unavailable`; it cannot turn a passing test report into a failure or a partial
measurement claim.

## Adopting the loop

1. **Prepare an adopter definition.** Copy `fixtures/fresh-adopter/` to a
   working location and replace its four authority files plus the project,
   branch, Git identity, timestamp, and generic ids in `definition.json`. The
   strict `milestone-loop-adopter-package.v1` definition accepts only contained
   regular authority files. The shipped fixture is an executable example, not
   an active fallback for a new project.
2. **Create the fresh repository.** From this source checkout, run:

   ```bash
   pnpm loop:template:create -- --definition <definition.json> --output <absent-directory>
   ```

   The output parent must exist and the destination must not. The command
   copies an allowlisted runtime and real bootstrap app, generates the
   adopter-owned lock/config/registries/package metadata, initializes the
   requested attached branch with deterministic local Git identity, commits
   the authority base, then commits a commissioning input bound to that strict
   ancestor. It prints a sorted path/byte/SHA-256 inventory. It never copies
   this source repository's readiness marker, active manifest, history, or
   product identity, and it does not commission automatically.

3. **Install and commission exactly once.** In the generated repository:

   ```bash
   pnpm install --frozen-lockfile
   pnpm loop:commission -- --input tools/milestone-orchestrator/config/commissioning-input.json
   git add .agent/verification-manifest.json
   git commit -m "activate bootstrap verification manifest"
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

4. **Prove the technical scaffold.** From the clean committed adopter, run
   literal no-argument `pnpm verify`. A PASS covers the real static checks,
   clean-clone production build, Vitest, shared Node/replay/Worker kernel,
   save/load continuation, and desktop Chromium render/interaction evidence.
   Its profile is `bootstrap`, its claim is `bootstrap_complete`, and it is
   explicitly not autonomous-readiness-equivalent.
5. **Reproduce the packaged proof when changing this distributor.** With the
   pinned runtime, a populated pnpm store, and supported Chrome or Edge
   installed, run:

   ```bash
   pnpm loop:template:prove -- --definition fixtures/fresh-adopter/definition.json --artifact-dir artifacts/<fresh-proof-id>
   ```

   The proof uses a temporary fresh history, offline frozen copy-mode install,
   explicit commissioning, a clean manifest commit, exactly one no-argument
   verifier run, and an independent receipt/artifact/identity audit. It retains
   the bootstrap result and screenshot without granting readiness.

6. **Build the actual product and check the loop wiring.** Replace the
   technical smoke scope with the frozen product authority and real domain
   evidence under a later executable plan. Do not switch to `readiness` until
   the permanent activation marker and readiness default are committed in the
   one-way transition required by [`CONTRACT.md`](CONTRACT.md). Useful checks:

   ```bash
   pnpm typecheck
   pnpm test:orchestrator
   pnpm loop:doctor -- --strict
   pnpm loop:demo-safety
   ```

   `loop:doctor` emits the read-only `2.0.0` operational diagnostic. Each
   check is `pass`, `warning`, or `block`; the ordered `issues` list carries a
   stable code, remediation, and a safe command where one exists, while
   `nextAction` selects the earliest safe diagnostic/recovery action. The
   command validates runtime pins, clean Git identity, structural config and
   the exact installed Codex SDK separately, active commissioning and all four
   tier plans, the truthful production-build declaration, active placeholder
   scripts, lexical/realpath containment, state and protected identities,
   pending operations, authentication, trust roots, controller ownership, the
   complete configured execution-provider capability, and the latest
   state-owned exact verification. Docker or Podman presence alone is never
   reported as trusted readiness.

   Ordinary Doctor remains an inspectable diagnostic and exits zero after it
   emits a complete `ready` or `blocked` result. `--strict` emits the same JSON
   and exits 2 when any operational blocker exists; warnings keep autonomous
   integration ineligible but allow safe first-run actions such as planning or
   obtaining fresh exact evidence. Doctor performs no network call, build,
   verifier, container, Codex invocation, lease acquisition, repair, state/ref
   write, or directory creation. A strict failure is a real blocker report,
   not permission to clean user content or weaken the gate.

   `loop:status -- --json` emits the versioned `1.0.0`
   `orchestrator-status` resume document in uninitialized, ordinary,
   pending-operation, and active-reconciliation states. It projects the exact
   commissioning record and profile, target branch sources, target HEAD and
   stored verified commit, live lease, normalized pending side effect,
   recovery disposition, latest completed milestone, latest state-owned exact
   verification, trusted-provider and autonomous-integration eligibility,
   deferred cleanup/reconciliation, accepted Doctor issues, and one safe next
   action. Active reconciliation never substitutes a second status schema.

   Target relation names the target branch as its subject: `ahead` means the
   target descends from the stored verified commit, `behind` means the stored
   verified commit descends from the target, and `divergent` means neither.
   `current`, `uninitialized`, and fail-closed `unavailable` are explicit.
   Pending intent recovery is `automatic` when the existing inspector can
   resume it and `blocked` when exact manual reconciliation is required;
   active reconciliation or unexplained target-history drift is `external`.
   Status binds detailed state to one canonical generation and matching target
   observation, retries once on movement, and refuses to present a mixed
   snapshot.

   Status reuses Doctor for operational commissioning, provider, exact-result,
   issue, eligibility, and next-action facts, and uses validated canonical
   state for lifecycle facts. It never infers completion from prose logs or
   artifact directory names. Like Doctor, it makes no network call and runs no
   build, verifier, container, or Codex turn; it never initializes or repairs
   state, opens the reconciliation controller, acquires a lease, recovers an
   operation, updates a ref, or creates a path.

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

   `pnpm test:oci-container --output artifacts/<fresh-id>` runs the serial
   normal/adversarial Docker matrix on a Linux controller with exact Node/pnpm
   pins and a populated read-only pnpm v11 store. It hashes the image inputs,
   builds at most once for an unchanged hash, reuses only the immutable image,
   validates command receipts and every containment-report size/hash, and
   proves no labeled container or volume remains. A WSL engine does not make a
   Windows controller ready; run this matrix from Linux (or WSL with a
   Linux-native dependency/controller build) and retain that distinction in
   the evidence.

   The source repository's `.github/workflows/exact-runtime-ci.yml` pins Node
   `24.18.0` and pnpm `11.15.1`, asserts those installed versions, and keeps
   three CI boundaries separate. The controller matrix runs the receipt-owning
   invariant, orchestrator, unit, typecheck, lint, and format commands on
   `ubuntu-24.04` and `windows-2022`; its outer job bound is 60 minutes on Linux
   and 120 minutes on Windows so the unchanged full command sequence can
   finish without weakening command or test limits. A second matrix invokes
   the public package creator, performs an offline frozen copy-mode install in
   the generated repository, commissions exactly once, validates and commits
   only the generated verification manifest with deterministic fixture
   identity, then runs literal no-argument `pnpm verify` exactly once from that
   clean three-commit bootstrap history. Production-build evidence resolves the
   populated pnpm store from the clean generated repository and pins that same
   store on its disposable clone's offline install, including when Windows
   checkout and temporary roots occupy different volumes. The coordinator
   copies the complete verifier tree before deleting the temporary repository
   and reuses the packaged-proof
   audit owner to check both candidate captures, every required stage receipt,
   manifest, and declared artifact, the four-test unit surface, and the browser
   screenshot and diagnostics. Its versioned ordered command ledger proves the
   documented quickstart without invoking source no-argument verification or
   `loop:template:prove`; the result claims generated bootstrap completion and
   explicitly does not claim autonomous readiness. A third Linux-only job
   probes the real Docker Engine and runs the complete trusted-container
   normal/adversarial matrix. Every job uploads its platform-specific evidence.

   Local workflow-contract tests prove parseability, pins, commands, evidence
   separation, and the absence of mock OCI or completion shortcuts. They do
   not prove a hosted runner passed. Likewise, a green matrix job is
   cross-platform diagnostic evidence, not autonomous-readiness evidence;
   only a fresh clean no-argument verifier result can enter that completion
   path.

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
   filesystem call. State schema `1.11.0` records one exclusive pending
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

   Worker candidate preparation is protected by a strict `candidate-prepare`
   intent published before gateway invocation. It binds the exact state
   generation, run/milestone/attempt, standalone workspace and starting
   candidate, Worker role/model/thread/retry context, protected/diff policy,
   and deterministic evidence paths. Only an unchanged `intent-persisted`
   operation may launch the Worker after restart. Loss after invocation-start,
   thread publication, or gateway return is outcome-ambiguous and preserves a
   durable block instead of replaying the Worker. Canonical completion retains
   the redacted final-response bytes and their hash, so a missing Worker-turn
   file can be reproduced without treating events or artifacts as authority.
   The controller stages only after Worker completion is durable, records the
   exact parent/tree/message authorization before committing, and adopts a
   post-commit restart only when every bound identity matches. Evidence path
   ancestors must be real contained directories; linked, substituted,
   conflicting, or unowned Worker/checkpoint artifacts are preserved and
   blocked. A clean or dirty candidate without matching intent is likewise
   preserved and blocked even when ordinary failed-workspace cleanup requests
   deletion; it never enters verification. One canonical reducer clears the
   intent and enters verification exactly once for normal and recovered
   completion. State `1.10.0` candidate completions that predate canonical
   response bytes migrate to an explicit preserved block rather than inventing
   evidence. Status and Doctor expose phase, disposition, preserved paths, and
   the exact next safe action without changing refs, Git state, workspace, the
   state mirror, or derived evidence.

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
   Canonical `1.4.0`/`1.5.0`/`1.6.0`/`1.7.0`/`1.8.0`/`1.9.0`/`1.10.0` state is
   migrated virtually on read and becomes `1.11.0` on its next successful CAS
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

The Ski Tycoon package is useful as a configuration reference, but it is not
an adoption input or active-manifest fallback. Validate its pinned static
contents explicitly with:

```bash
pnpm loop:example:validate -- --descriptor examples/ski-tycoon/worked-example.json
```

This command checks the tracked package, schemas, identities, cross-links, and
hashes without executing its historical benchmark or commissioning its legacy
v1 manifest. A PASS describes only the worked-example package; it is not
bootstrap or readiness evidence.

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
- **Historical benchmark classes** — the retained D-032 benchmark has five
  pinned classes in `src/benchmark.ts`. It is an explicit source-history tool,
  not part of generic v2 commissioning; use the matrix template only when
  deliberately creating a comparable historical before/after instrument.
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
examples/ski-tycoon/         pinned legacy-only worked-example package
```

## Requirements

Node 24 (exact pin in `package.json#engines`), pnpm 11 (exact pin in
`packageManager`), and a Codex SDK login for the agent roles. Trusted candidate
execution additionally requires a reachable Docker Engine and the configured
immutable WP3d image ID; ordinary source/semantic checks remain available when
that runtime is absent, but trusted execution stays `NOT_READY`. The
orchestrator test suite (`pnpm test:orchestrator`) and `pnpm typecheck` run
without any product wiring.
