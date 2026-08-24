# Repository Contract

What an adopting repository must provide for the milestone loop to operate.
The orchestrator treats everything below as load-bearing; each item is
validated at runtime (fail-closed) rather than assumed.

## 1. Frozen authority set

| File                                                              | Role                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PROJECT_GOAL.md` (name configurable via `project.authorityFile`) | The frozen product authority every agent reads first. Must be listed in `protectedPaths`.                                                                                                                                                                    |
| `AGENTS.md`                                                       | The operating covenant for autonomous agents.                                                                                                                                                                                                                |
| `evals/ACCEPTANCE.md`                                             | Frozen acceptance prose.                                                                                                                                                                                                                                     |
| `evals/acceptance-manifest.json`                                  | Machine-readable acceptance contract: validation layers, completion metrics, bot requirements, operational chains, seed gates, readiness gate, human gate, planned command surface.                                                                          |
| `evals/HIDDEN_VALIDATION_PROTOCOL.md`                             | Hidden-seed custody rules; seed values never enter the repository.                                                                                                                                                                                           |
| `evals/immutable-contract-lock.json`                              | Baseline + active SHA-256 for the four files above, plus the one-time `CAL-1` calibration transition state. The commissioned strict-ancestor base pins its exact bytes and the exact four authority bytes; verifier source carries no adopter-specific hash. |

A hash mismatch is a blocking defect, not permission to regenerate the lock.
The goal and hidden protocol are human-revision-only; acceptance files may
change once, at `CAL-1` close, under the rules in `AGENTS.md`.

## 2. package.json obligations

- `milestoneLoop.verification.defaultProfile`: `"bootstrap"` or
  `"readiness"`. The workspace clone's profile is read from this key.
- `milestoneLoop.productionBuild`: required before the production-build stage
  can pass. It contains exactly `script` (an existing project-owned package
  script other than the evidence-owning `build` wrapper) and one or more
  project-relative `outputRoots`, for example:

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

  An absent declaration reports `NOT_READY` (exit 2) without a PASS receipt.
  The wrapper clones the exact clean candidate into a disposable directory,
  resolves exactly one existing absolute pnpm store from that source repository,
  and prepares dependencies with the frozen lockfile in offline copy mode while
  explicitly reusing that same store. A temporary-repository coordinator must
  carry its previously validated store identity through pnpm's
  `pnpm_config_store_dir`, rather than assume a later command will remember an
  earlier `--store-dir` option. This remains valid when a Windows source
  checkout and the disposable temporary clone are on different volumes. The
  wrapper removes pre-existing declared outputs, runs `pnpm run <script>`,
  rejects mutations outside the declared roots and every symlink/junction
  output, and requires at least one nonempty regular output file. Its
  `build-report` records store discovery, exact argv, and sorted output paths,
  sizes, and SHA-256 hashes, then rechecks the output inventory before issuing
  the receipt.

- `scripts.verify` must be exactly `node scripts/verify.mjs` (checked by the
  environment stage).
- Exact runtime pins: `engines.node` (`24.x.y`) and `packageManager`
  (`pnpm@11.x.y`); the environment stage verifies the running versions equal
  the pins.
- Contract scripts, all of which must produce evidence receipts (§4):
  `format:check`, `lint`, `typecheck`, `build`, `test:unit`,
  `test:orchestrator` (via `tools/run-tool-evidence.mjs`), plus
  `verify:dependencies` and `lint:architecture` (project-owned; shipped as
  fail-loud placeholders). `build` remains the controller-owned evidence
  wrapper; put the real build under the distinct script named by
  `milestoneLoop.productionBuild.script`.
- Tier scripts (already wired to the orchestrator): `test:invariants`,
  `test:unit:fast`, `test:unit:migrations`, `verify:iteration`,
  `verify:candidate`, `verify:milestone`, `verify:periodic`, and the
  `loop:*` / `artifacts:*` commands.
- One `verify:<check>` script per focused command in the verification
  manifest (§5). The template ships nine `verify:domain-*` placeholders that
  exit 1 with instructions; replace them. A replacement must produce the
  command's declared `expectedArtifactKinds` (the placeholders declare
  `<id>-report`) through a command-owned receipt (§4) — a bare exit 0 never
  passes.

The pnpm workspace (`pnpm-workspace.yaml`) must include
`tools/milestone-orchestrator`; `tools/workspace-typecheck.mjs` lists every
tsconfig the `typecheck` evidence covers.

## 3. scripts/verify.mjs — the authoritative aggregate

`pnpm verify` is the only completion-eligible verification. Contract:

- **Profiles**: `bootstrap` and `readiness`, selected by the package default
  (or `--profile` for diagnostics; non-default runs are never
  completion-eligible). Stage-id registries must match
  `BOOTSTRAP_VERIFICATION_STAGE_IDS` / `READINESS_VERIFICATION_STAGE_IDS` in
  `tools/milestone-orchestrator/src/contracts.ts` exactly, in order — the
  orchestrator validates the authoritative result against them.
- **One-way lifecycle**: readiness requires the committed
  `.agent/readiness-profile-activated.json` marker; once the marker has ever
  been committed, bootstrap becomes permanently invalid (git history is
  checked). The marker may never be deleted.
- **Exit codes**: `0` PASS, `1` FAIL, `2` NOT_READY, `3` ERROR. A missing
  stage script is `NOT_READY`, never a pass. The orchestrator's
  `pnpm-verify` parser accepts exit 0 or exit 2 and then reads the result
  file.
- **Run identity**: `--run-id <id>` (the orchestrator appends it); results
  are written under `artifacts/<run-id>/`: `run-manifest.json`,
  `result.json` (schema `2.1.0`: status, exit code, profile, completion
  eligibility with reasons, candidate identity incl. git commit/tree and
  authority hashes, per-stage checks/commands), and `summary.md`. The
  candidate identity is captured again after the stage loop
  (`candidateFinal` plus `identityDrift`); any tracked or ref drift
  between the two captures forces `FAIL` with completion reason
  `candidate_identity_drift`, and completion eligibility reads the final
  cleanliness, never the starting snapshot.
- **Execution-provider identity**: every candidate-authored command and the
  exact aggregate are launched through the controller-selected provider. The
  aggregate manifest, result, stage commands, tier result, and durable
  verification boundaries carry the same strict provider identity (provider,
  implementation, runtime name/version, image digest or honest absence,
  mount policy, resource profile, network disposition, capability identity,
  and eligibility). Missing or inconsistent identity fails closed. Only a
  complete `trusted-container` capability can be completion-eligible;
  `unsafe-local-diagnostic` is explicitly selected, supervised, visible, and
  never eligible for integration or reconciliation adoption. The WP3d Docker
  executor must independently inspect the immutable image and the runtime's
  interpreted policy before launch, run every command from an exact disposable
  clone in a fresh disposable container, and retain a controller-owned
  containment report with the daemon version, image-input hash, policy,
  lifecycle, bounded-volume, cleanup, and exported-artifact facts. Intent-only
  argv tests or mocked containment are not real containment evidence.
- **Focused runs**: `--stage <id>` always bundles `environment` and
  `contract-integrity`, and is marked completion-ineligible.
- **contract-integrity stage**: resolves the active v2 manifest's commissioned
  strict-ancestor base, requires its immutable lock and all four authority
  files to be byte-identical to the candidate, validates the lock schema and
  calibration state, then derives adopter-specific acceptance expectations
  from that frozen base. Universal profile, exact-command, gate aggregation,
  no-compensation, and hidden-custody rules remain verifier-owned. Adopters do
  not edit verifier source or insert a lock hash constant. The check
  implementation lives in the controller-owned
  `src/contract-integrity.ts`; `scripts/verify.mjs` delegates this stage to
  that shared evaluator without changing aggregate stage selection or
  completion semantics.
- **Independent contract invariant**: the invariant registry's
  `protected-integrity` entry invokes a receipt-owning adapter around the same
  evaluator. It does not launch `pnpm verify`, inherit `environment`, or write
  an aggregate verifier result. Its `contract-integrity-report.v1` artifact
  and invariant-suite report explicitly set `completionEligible:false`. Every
  shared check must pass before the adapter writes a PASS receipt; corruption
  retains a failing report and no receipt. This fast signal cannot authorize
  integration or replace exact no-argument verification.

## 4. Command-owned evidence receipts

Every successful stage script (and every focused `verify:<check>` command)
must write `result.json` into the directory the harness passes via
environment:

| Variable                                                      | Meaning                                  |
| ------------------------------------------------------------- | ---------------------------------------- |
| `LOOP_VERIFY_RUN_ID`                                          | Current verify run id                    |
| `LOOP_VERIFY_ARTIFACT_ROOT`                                   | `artifacts/<run-id>`                     |
| `LOOP_VERIFY_STAGE_ID` / `LOOP_VERIFY_STAGE_ARTIFACT_DIR`     | Owning stage                             |
| `LOOP_VERIFY_COMMAND_ID` / `LOOP_VERIFY_COMMAND_ARTIFACT_DIR` | Owning command; receipts go here         |
| `LOOP_ACCEPTANCE_MANIFEST`                                    | Absolute path of the acceptance manifest |
| `LOOP_TELEMETRY_PARENT_MANAGED`                               | Set when the orchestrator owns telemetry |

Receipt shape (validated fail-closed by `scripts/verify.mjs`, the tiered
verifier, and the invariant suite):

```json
{
  "schemaVersion": "1.0.0",
  "stageId": "<LOOP_VERIFY_STAGE_ID>",
  "commandId": "<LOOP_VERIFY_COMMAND_ID>",
  "status": "PASS",
  "checks": [{ "id": "unique-id", "status": "PASS", "summary": "..." }],
  "artifacts": [
    {
      "path": "relative/inside/command-dir",
      "kind": "report-kind",
      "bytes": 123,
      "sha256": "<64 hex>"
    }
  ]
}
```

At least one artifact is required; every artifact must exist inside the
command directory (no symlink escapes) with exactly the declared size and
hash. Use the helpers in `tools/evidence.mjs` (`evidenceContext`,
`writeReceipt`, `writeJson`) rather than hand-rolling receipts —
`tools/run-tool-evidence.mjs` is a complete worked example. Exit 0 without a
valid receipt is a failure. Stages additionally declare
`requiredArtifactKinds`; the union of receipt artifact kinds must cover
them.

The milestone verifier enforces the same contract on every focused
(`exit-code`) verification command a proposal declares: the command runs
with `LOOP_VERIFY_STAGE_ID` bound to the run × milestone × attempt ×
candidate, and a passing exit status without a validated receipt covering
the command's `expectedArtifactKinds` is an infrastructure error, never a
pass. `pnpm-verify` commands are exempt because their evidence is the
independently parsed authoritative result tree.

Every orchestrator-spawned command additionally runs under a bounded process
supervisor (`process-supervisor.ts`): per-stream output is capped by
`limits.commandOutputLimitBytes` (a breach terminates the process tree and is
an infrastructure `ERROR` with an explicit truncation disposition), timeout
and breach kill the complete tree (Windows intact-tree
`taskkill /pid <pid> /T /F`; POSIX detached-group SIGTERM escalating to
SIGKILL after `limits.commandKillGraceMs`), redaction runs before any log
byte reaches disk, and settle is exactly-once with a hard bound of
`timeoutMs + 2 x killGraceMs` even when every kill attempt fails. The
command summary records the complete `supervision` disposition (termination
attempts, stream closure, drain, truncation counts). A `TIMEOUT` remains
non-passing and telemetry classifications are unchanged.

The source exact-runtime CI workflow is a diagnostic execution boundary, not
a source-readiness completion path. It installs and asserts Node `24.18.0`
plus pnpm `11.15.1`; runs the existing receipt-owning invariant, orchestrator,
unit, and static commands on Linux and Windows with distinct uploaded evidence
roots; and never invokes source no-argument `pnpm verify`. The controller matrix
retains a 60-minute Linux outer job bound and gives Windows 120 minutes for that
unchanged complete command sequence; command and per-test timeouts remain
unchanged. The separate generated-adopter smoke executes the documented
quickstart through the public
creator, offline frozen copy-mode install, one-shot commissioning, exact
manifest add/commit, and one literal generated-repository no-argument
`pnpm verify`. It validates the sole commissioning output and clean
three-commit bootstrap identity, copies the complete verifier tree before
temporary cleanup, and reuses the packaged-proof audit owner to independently
check every required receipt, manifest, declared artifact, candidate binding,
test result, screenshot, and browser diagnostic. The versioned result claims
only generated bootstrap completion, remains non-readiness, and does not invoke
`loop:template:prove`. The Linux-only OCI job must reach a real Docker Engine
and execute the complete existing `test:oci-container` matrix. Workflow/YAML
tests, action exit zero, a mock container, or a hosted job status cannot by
themselves authorize integration or satisfy autonomous readiness.

## 5. Verification manifest

`.agent/verification-manifest.json` is the active, commissioned check
catalogue. Active manifests use `verification-manifest.v2`; the retained
`.agent/completed/loop-recommissioning-verification.json` v1 record is
historical source evidence and is accepted only through explicitly named
benchmark or reconciliation loaders. It is never an active-manifest fallback.

- `commissioning`: a generic commissioning id, exact target branch and strict
  ancestor base commit, `bootstrap` or `readiness` profile, and canonical
  creation timestamp. The commissioned profile must equal
  `package.json#milestoneLoop.verification.defaultProfile`.

- `focusedCommands[]`: `{ id, argv, tiers, expectedArtifactKinds }` for
  every focused check. `argv` must start with `pnpm`, `node`, or `git`.
  `tiers` places each check into `iteration` / `candidate` / `milestone` /
  `periodic` plans. `expectedArtifactKinds` must be nonempty for every
  focused command (and for every invariant-registry entry) — an empty list
  no longer disables receipt validation anywhere. Milestone proposals carry
  the same per-command field at schema `1.2.0` (nonempty for `exit-code`,
  exactly `[]` for `pnpm-verify`); the proposal-level `expectedArtifacts`
  list was removed at `1.2.0`. Three auxiliary ids are always available:
  `dependencies`, `test-unit`, `exact-readiness`.
- Check-id consistency is enforced at load time: every id used by
  `verification-scope-policy.json` (`mandatoryChecks`, `workspaceChecks`)
  and `benchmark-matrix.json` (`historical`) must exist in this catalogue,
  and `workspaceChecks` keys must exactly equal the pnpm package-graph
  names (including the root package).
- `requiredProtectedPaths`, `requiredInvariantSuiteId`, and `scopePolicyId`
  pin the trust and selection registries. `exactVerification` permits only
  literal no-argument `pnpm verify` selected by the package-default profile;
  an override is never exact. A bootstrap PASS proves only bootstrap
  completion and is not autonomous-readiness-equivalent.
- `reconciliationPolicy` names the policy, its contained JSON proposal path,
  and the ordered generic minimum review checks. Project-specific additions
  may follow that minimum but cannot replace or reorder it.

Create the active manifest only through the one-shot command
`pnpm loop:commission -- --input <file>`. Its strict, repository-contained
tracked input names the canonical
config, invariant, scope, immutable-lock, and output paths plus the complete
catalogue and policies. Real commissioning requires an absent active manifest,
a completely clean tracked and untracked tree, an attached configured target
branch, and a real strict-ancestor base. The selected profile must equal the
package default; bootstrap forbids readiness-marker tree or history, while
readiness requires the permanent valid marker at or before the base and at the
candidate.

The command validates existing authority and lock bytes against the exact
strict-ancestor Git base, registry identities, the canonical protected floor, package scripts,
exact policy, reconciliation minimum, and all four tier plans. It never writes
or regenerates authority. `createdAt` is the base commit's canonical Git
timestamp, so equal input and Git identity produce equal bytes. Publication
uses an exclusive staged file and one no-clobber filesystem link after byte,
hash, Git-identity, and clean-status rechecks. Strict post-publication doctor
validation must pass; an owned partial stage is cleaned, and a post-publication
fault removes only the exact inode and hash that this invocation created. The
command reports every generated path, byte count, and SHA-256.

The Ski Tycoon configuration at `examples/ski-tycoon/` is a historical worked
example, not an active or fallback contract. Its strict `worked-example.v1`
descriptor pins the exact package files, provenance dispositions, schemas,
legacy identities, cross-links, bytes, and hashes. It may be inspected only by
the explicit read-only command
`pnpm loop:example:validate -- --descriptor examples/ski-tycoon/worked-example.json`.
That command never commissions, migrates, or executes the legacy v1 manifest,
and its PASS is neither bootstrap nor readiness evidence. Generic active
configuration and commissioning input must not acquire Ski Tycoon or D-031/
D-032 identity from the example.

## 6. .agent conventions

| Path                                      | Convention                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.agent/PLANS.md`                         | The executable-plan standard (shape, maintenance, completion rules).                                                         |
| `.agent/current-exec-plan.md`             | The single living plan for the active increment, using the required headings.                                                |
| `.agent/next-milestone.json`              | The queued next proposal in milestone schema `1.2.0`; written by reconciliation, consumed by the planner policy.             |
| `.agent/readiness-profile-activated.json` | Permanent one-way lifecycle marker (`{schemaVersion, state:"readiness", previousState:"bootstrap", activatedDate, reason}`). |
| `.agent/verification-manifest.json`       | Active generic commissioned verification manifest (§5).                                                                      |
| `.agent/completed/`                       | Durable historical milestone records; legacy manifests here are never active fallbacks.                                      |

## 7. Orchestrator configuration

All five config files under `tools/milestone-orchestrator/config/` must
validate at load time; see
[`config/README.md`](tools/milestone-orchestrator/config/README.md) and the
`*.template.json` skeletons. `protectedPaths` must include the authority
file, the `evals/` contract files, and the mandatory controller trust
roots (`AGENTS.md`, `.agent/readiness-profile-activated.json`,
`scripts/verify.mjs`, `pnpm-lock.yaml`); the loop unions these with the
configured entries into one canonical protected set enforced (with
case-fold matching and both rename sides) at proposal, worker diff,
verification, review, integration, and reconciliation boundaries.
Symlink and gitlink change types are rejected outright. A commissioned
verification manifest may not require a protected path outside this
canonical set — controller startup, reconciliation, and doctor all
validate the coverage — and `pnpm loop:demo-safety` demonstrates the
rejection of every canonical path including case variants.

The strict current `OrchestratorConfig` contract is also published as
`schemas/orchestrator-config.schema.json`, which references the strict
`model-policy.schema.json`; generated adopter packages carry both. A shared
acceptance/rejection corpus must agree under the real runtime inspection loader
and an independent fail-closed JSON Schema 2020-12 evaluator. The schema covers
current `1.6.0` inputs, while `src/config.ts` remains the authority for legacy
`1.0.0` through `1.5.0` migration and for repository-dependent cross-field
checks that portable JSON Schema cannot express. Unknown root or closed nested
fields are invalid in both contracts.

## 8. Operational diagnostics and environment

`pnpm loop:doctor` is the authoritative, read-only operational wiring
diagnostic. Schema `2.0.0` gives every check exactly one of `pass`, `warning`,
or `block`, plus a stable code, explanation, remediation, and optional safe
command. The top-level result is `ready` when no block exists and `blocked`
otherwise. Its ordered issue list and counts are complete for that observation;
`nextAction` names the earliest safe executable diagnostic/recovery action, or
strict Doctor itself when manual repair must occur first.

`pnpm loop:doctor -- --strict` prints the same complete JSON and exits 2 after
output when a block exists. Without `--strict`, a successfully emitted
diagnostic exits zero even when its status is `blocked`. Other loop commands do
not accept the flag. Warnings do not authorize integration: current autonomous
integration eligibility requires exact runtime and SDK pins, a clean target,
valid readiness commissioning and tier construction, real build and
non-placeholder package wiring, safe configured roots, a ready trusted
provider whose identity matches the evidence, canonical state matching target
HEAD, intact protected identities, available authentication, no active lease,
operation, or reconciliation, and current intact completion-eligible
state-owned exact readiness evidence.

Doctor reuses the commissioning and production-build contract loaders. It
derives latest exact identity only from validated canonical controller state
and verifies the durable copied-result hash; it never guesses from artifact
directory names. It checks absent configured paths through the nearest existing
ancestor and checks existing roots lexically and by realpath without creating,
repairing, following, moving, or deleting suspicious content. Doctor performs
zero network calls and never launches a build, verifier, candidate command,
container, or Codex turn; acquires no lease; creates no state or directory; and
writes or repairs no file, ref, mirror, evidence, or configuration.

`pnpm loop:status -- --json` is the canonical lifecycle resume surface. Its
versioned `orchestrator-status` schema `1.0.0` is stable across uninitialized,
ordinary initialized, pending-operation, and active-reconciliation states; an
active reconciliation does not replace it with the narrower
`reconcile-status` schema. Status preserves the detailed controller-state and
storage summary and adds the validated commissioning record/profile, all
target-branch sources, target HEAD and stored verified commit, target relation,
lease, normalized pending side effect and recovery, latest completed milestone,
latest state-owned exact verification, trusted execution and autonomous-
integration eligibility, deferred cleanup/reconciliation, operational issues,
and the accepted Doctor next action.

Target relation is oriented from target branch HEAD to the canonical stored
verified commit: `ahead` means target HEAD descends from verified, `behind`
means verified descends from target HEAD, and `divergent` means neither.
`current`, `uninitialized`, and `unavailable` prevent equality, missing state,
or missing Git objects from being conflated. Pending-operation recovery is
`automatic` only when the existing operation inspector names a safe resume
transition and `blocked` when it requires manual reconciliation. Active
reconciliation and target-history drift are `external`; no recovery is `none`.

Status projects commissioning, provider identity, exact-result integrity and
currentness, eligibility, issue, and next-action facts from Doctor without
changing their meaning. Milestone, pending-operation, cleanup, reconciliation,
and exact-verification provenance come only from validated canonical state.
Git ancestry probes set `GIT_OPTIONAL_LOCKS=0`. A detailed state projection is
published only when Doctor and controller inspection name the same canonical
generation and the commissioned target observation remains stable; status
retries once on movement, then returns `changed-during-inspection` with a
status-rerun action instead of combining generations. It does not discover
artifact directories, open a mutation-capable store or reconciliation
controller, acquire a lease, initialize/repair state, recover an operation,
write evidence, update refs, create paths, call the network, or run a build,
verifier, container, or Codex turn.

- Node and pnpm exactly matching the package pins.
- Candidate execution configured under `candidateExecution`. Doctor reports
  missing executor implementation, OCI runtime, pinned image, or isolation
  policy separately and never infers readiness from runtime presence alone.
  Executor version 1.0.0 supports a reachable Docker Engine; Podman is
  fail-closed until its interpreted policy has dedicated implementation and
  real coverage. The configured image must be a local immutable `sha256:` ID
  whose non-root user and controller-owned image/toolchain/input labels match.
  There is no trusted-to-local or implicit WSL fallback.
- Trusted execution needs a controller-owned pnpm v11 store populated for the
  candidate lockfile. It is mounted read-only and installation is offline,
  frozen, store-integrity-checked, and copy-materialized into a bounded
  container-local workspace. The exact clean candidate clone and store are the
  only host binds and are read-only. Writable workspace/evidence/temp storage
  is bounded; a read-only in-container preflight must reject linked, special,
  over-count, or over-byte output before host copy. Only regular, unlinked files
  under declared roots may then be published, with independently checked size
  and SHA-256.
- Git available; the loop clones into `artifacts/orchestrator/workspaces`
  and operates only through validated, contained paths.
- Codex SDK authentication for planner/worker/reviewer roles
  (`pnpm loop:check-model-policy` verifies the live model policy;
  `MILESTONE_LOOP_CONFIG` overrides the config path;
  `MILESTONE_LOOP_TELEMETRY_RUN_ID` scopes direct-telemetry runs).
- Single-writer mutation: every mutating loop command (including
  reconciliation) holds `refs/milestone-loop/controller-lease`. Its strict
  owner blob is published, taken over, and deleted with an expected-old Git
  ref update. A losing first-owner or stale-owner contender therefore cannot
  remove, alter, or release the winner. The retained
  `artifacts/orchestrator/state/controller.lease` file is a permanent
  protocol guard: a different legacy file fails closed so an older file-lease
  controller cannot run beside the private-ref protocol.
- Canonical state publication: `refs/milestone-loop/state` points to a strict
  commit generation containing validated state JSON plus exact revision/hash
  metadata. Its single parent is the previous generation; the current and
  immediately previous generations, fixed controller identity, canonical
  commit message, tree shape, hashes, revisions, and parent relationship are
  validated on read. Initialization and saves publish by expected-old
  `git update-ref`, so exactly one writer from a shared generation can advance
  the ref. The configured `state.json` is a derived, repairable mirror only.
  A valid legacy mirror imports exactly once on a mutating open when the ref is
  absent; malformed, linked, or ambiguous legacy data fails closed, and an
  invalid canonical ref never falls back to the mirror. Mirror repair happens
  only on mutation-capable opens after canonical publication.
  `loop:status`/`loop:dry-run` are read-only and lease-free; their state load
  cannot authorize publication or repair the mirror. Normal branch pushes do
  not include either private ref.
- Recoverable workspace creation: state schema `1.10.0` permits exactly one
  exclusive pending operation. A `workspace-create` intent is published by
  state CAS before any directory creation or `git clone` and binds the
  operation ID, run/milestone/attempt, exact input generation and revision,
  target base, controller-derived branch, temporary/final paths, timestamps,
  phase, and fixed recovery policy. Canonical
  `1.4.0`/`1.5.0`/`1.6.0`/`1.7.0`/`1.8.0` generations migrate virtually for
  read-only compatibility and are written as `1.10.0` by the next successful
  CAS save. Canonical `1.9.0` state likewise migrates virtually without changing
  controller facts. Legacy target-integration intent without provider
  attestation becomes an explicit non-adoptable blocked operation with its
  diagnostic paths preserved. While an intent is pending, unrelated state
  mutations fail closed.
  The clone is created with no hardlinks under a unique contained temporary
  path, converted to a clean standalone remote-free repository, and published
  to the stable final path without replacing an existing entry. Leased startup
  recovery validates lexical and realpath containment, every directory in the
  chain, `.git` ownership, no alternates or shallow state, exact HEAD/branch,
  canonical config and controller markers, cleanliness, and remote facts
  before it resumes, finishes, publishes, or adopts. Linked, dirty,
  substituted, conflicting, or otherwise ambiguous entries are preserved in
  place with a durable blocked diagnostic; the controller never overwrites or
  automatically deletes them. Status and doctor perform the same
  classification read-only (including Git optional-lock suppression) and
  report the exact next safe action without acquiring the lease or recovering.
- Recoverable candidate preparation: before a Worker gateway invocation can
  mutate its isolated workspace, the controller publishes an exclusive
  `candidate-prepare` intent bound to the exact input generation/revision,
  run/milestone/attempt, repository/workspace/base/branch and starting
  candidate, Worker role/model/thread lineage and retry context, protected and
  proposal policy hashes, and canonical evidence paths. Invocation accounting,
  thread publication, Worker completion, checkpoint preparation, checkpoint
  commit, and checkpoint evidence use canonical bounded reducers. Before a
  controller commit, the intent records its exact parent, staged tree, message,
  and policy-approved paths. Leased restart adopts only that exact clean commit
  after standalone Git, ancestry, protected-file, diff-policy, Worker-context,
  artifact, parent, tree, and message validation. Worker event, turn, and
  checkpoint files are derived evidence and never substitute for intent.
  Clean or dirty candidate changes without matching intent are preserved and
  blocked as external/ambiguous, never automatically advanced to verification;
  this preservation applies even when ordinary failed-workspace policy requests
  deletion. One completion reducer clears retry feedback and the intent exactly
  once for normal and recovered paths. Status and Doctor expose kind, phase,
  disposition/classification, preserved paths, and exact next safe action
  read-only.
- Recoverable target integration: after final candidate, reviewer, verification,
  commit-list, and protected-path validation, the controller publishes a strict
  `target-integrate` intent before writing the outcome artifact, fetching the
  candidate, or changing the target ref/index/worktree. The intent pins the
  exact state generation and revision, repository/target/workspace identities,
  approved candidate and commits, verification-result digest, completion-
  eligible trusted execution-provider identity, deterministic
  outcome and temporary paths, timestamps, phases, and recovery policy. Leased
  startup runs this recovery before ordinary target-drift handling. It resumes
  from only the exact clean base or adopts only the exact clean candidate,
  revalidates the standalone remote-free workspace and protected files, and
  materializes exact pending/integrated outcome bytes idempotently. One pure
  completion reducer exclusively owns the verified target, milestone commits
  and timestamps, queue/active milestone, required vertical consumer,
  processed count, human-verification stop state, next action, and intent
  removal. Candidate drift, unexpected target commits or branches, dirty or
  locked target state, in-progress Git operations, linked/substituted paths,
  and conflicting outcome bytes are preserved with a durable blocked
  diagnostic. Reviewer approval alone is never integration intent. Status and
  doctor expose the operation, classification, and exact next safe action with
  optional-lock-suppressed read-only inspection and no recovery or artifact
  repair.
- Recoverable terminal workspace cleanup: the same exclusive pending-operation
  authority carries a strict `workspace-cleanup` intent before dependency
  removal, diagnostic publication, or recursive workspace deletion. The intent
  pins the canonical input generation/revision, run/milestone/attempt,
  repository and target identity, exact standalone workspace and creation
  marker, policy, timestamps, run/archive paths, Git status identity, and exact
  failed-diagnostic file hashes and sizes. Leased startup recovers explicit
  dependency, archive, and delete phases before ordinary terminal cleanup.
  Preserve policy never adopts a missing workspace; delete policy adopts one
  only after a durable delete-started phase; failed deletion requires the
  complete exact archive first. One pure reducer owns cleanup status,
  preservation, timestamps, and intent removal. Unsafe roots, linked or
  substituted paths, Git or diagnostic drift, premature disappearance, and
  partial or conflicting archives remain preserved with a durable blocked
  diagnostic. Status and doctor expose the classification, preserved paths,
  and next safe action using read-only Git inspection without recovery.
- Approval-bound evidence retention: `loop:run` never deletes evidence —
  controller startup only writes a retention _plan_
  (`evidence-retention.json` in the run directory). Deletion requires
  `loop:retention:plan` (standalone plan + sha256 approval token) followed by
  `loop:retention:apply -- --plan <path> --sha256 <hex>`. The leased apply
  authenticates the complete strict `1.2.0` plan bytes and exact dirty-worktree
  fingerprint, re-verifies controller/candidate/configuration/root/citation/
  suspension and exact target identities against a fresh plan, and refuses
  known pre-intent divergence without state, apply-artifact, or deletion side
  effects. It publishes one global `retention-apply` intent bound to the full
  plan hash and canonical input generation before creating the full-hash apply
  directory or removing evidence. Each exact target enters durable
  delete-started state before the unchanged contained recursive-removal
  primitive runs. The synced JSONL journal and deterministic result are derived
  evidence: recovery completes only an exact canonical prefix, adopts absence
  only from delete-started state, preserves conflicts with a durable blocked
  diagnostic, and completes through one reducer that owns retention state and
  intent removal. Leased startup performs this recovery before protected-root
  top-up, target reconciliation, and terminal cleanup. Status and doctor expose
  progress and the next safe action without mutation. Terminal milestone
  workspace cleanup is the separate automatic, intent-first temporary-workspace
  policy above.

## Adoption checklist

1. Strict adopter definition and four authority files completed.
2. `pnpm loop:template:create` produced a fresh attached bootstrap history.
3. Generated lock/config/registries and strict-ancestor input reviewed.
4. `pnpm loop:commission` run once; generated manifest reviewed and committed.
5. Literal no-argument `pnpm verify` proves bootstrap with valid receipts.
6. Bootstrap PASS recorded as non-readiness; no activation marker exists.
7. Product evidence and later one-way readiness transition planned explicitly.
