# Repository Contract

What an adopting repository must provide for the milestone loop to operate.
The orchestrator treats everything below as load-bearing; each item is
validated at runtime (fail-closed) rather than assumed.

## 1. Frozen authority set

| File                                                              | Role                                                                                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT_GOAL.md` (name configurable via `project.authorityFile`) | The frozen product authority every agent reads first. Must be listed in `protectedPaths`.                                                                                                          |
| `AGENTS.md`                                                       | The operating covenant for autonomous agents.                                                                                                                                                      |
| `evals/ACCEPTANCE.md`                                             | Frozen acceptance prose.                                                                                                                                                                           |
| `evals/acceptance-manifest.json`                                  | Machine-readable acceptance contract: validation layers, completion metrics, bot requirements, operational chains, seed gates, readiness gate, human gate, planned command surface.                |
| `evals/HIDDEN_VALIDATION_PROTOCOL.md`                             | Hidden-seed custody rules; seed values never enter the repository.                                                                                                                                 |
| `evals/immutable-contract-lock.json`                              | Baseline + active SHA-256 for the four files above, plus the one-time `CAL-1` calibration transition state. Its own hash is pinned as `ESTABLISHED_IMMUTABLE_LOCK_SHA256` in `scripts/verify.mjs`. |

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
  prepares dependencies with the frozen lockfile in offline copy mode, removes
  pre-existing declared outputs, runs `pnpm run <script>`, rejects mutations
  outside the declared roots and every symlink/junction output, and requires at
  least one nonempty regular output file. Its `build-report` records exact argv
  plus sorted output paths, sizes, and SHA-256 hashes, then rechecks the output
  inventory before issuing the receipt.

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
- **Focused runs**: `--stage <id>` always bundles `environment` and
  `contract-integrity`, and is marked completion-ineligible.
- **contract-integrity stage**: validates the immutable lock hash, the lock
  schema and calibration state, every locked file's active hash, and the
  acceptance manifest's frozen shape (layer/metric/bot/chain/threshold
  counts and gate aggregation). Re-pin those expectations to your frozen
  contract when you author it.

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

## 5. Verification manifest

`.agent/completed/loop-recommissioning-verification.json` is the check
catalogue everything else references:

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
- `requiredProtectedPaths`, `requiredInvariantSuiteId`,
  `requiredBenchmarkMatrixId`, `requiredReconciliationReviewChecks`,
  `nextProposalPath`, and `finalExactVerification` pin the rest of the
  verification surface.

## 6. .agent conventions

| Path                                      | Convention                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.agent/PLANS.md`                         | The executable-plan standard (shape, maintenance, completion rules).                                                         |
| `.agent/current-exec-plan.md`             | The single living plan for the active increment, using the required headings.                                                |
| `.agent/next-milestone.json`              | The queued next proposal in milestone schema `1.2.0`; written by reconciliation, consumed by the planner policy.             |
| `.agent/readiness-profile-activated.json` | Permanent one-way lifecycle marker (`{schemaVersion, state:"readiness", previousState:"bootstrap", activatedDate, reason}`). |
| `.agent/completed/`                       | Durable milestone records, including the verification manifest (§5).                                                         |

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

## 8. Environment

- Node and pnpm exactly matching the package pins.
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
- Recoverable workspace creation: state schema `1.7.0` permits exactly one
  exclusive pending operation. A `workspace-create` intent is published by
  state CAS before any directory creation or `git clone` and binds the operation ID,
  run/milestone/attempt, exact input generation and revision, target base,
  controller-derived branch, temporary/final paths, timestamps, phase, and
  fixed recovery policy. Canonical `1.4.0`/`1.5.0`/`1.6.0` generations migrate
  virtually for read-only compatibility and are written as `1.7.0` by the next
  successful CAS save. While an intent is pending, unrelated state mutations
  fail closed.
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
- Recoverable target integration: after final candidate, reviewer, verification,
  commit-list, and protected-path validation, the controller publishes a strict
  `target-integrate` intent before writing the outcome artifact, fetching the
  candidate, or changing the target ref/index/worktree. The intent pins the
  exact state generation and revision, repository/target/workspace identities,
  approved candidate and commits, verification-result digest, deterministic
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
  `loop:retention:plan` (standalone plan + sha256 approval token) followed
  by `loop:retention:apply -- --plan <path> --sha256 <hex>`, which runs
  under the controller lease, re-verifies the candidate, configuration,
  roots, citations, and suspensions against a fresh plan, refuses the
  whole plan on any divergence, and journals every deletion for
  interruption-safe resumption. Terminal milestone workspace cleanup is the
  separate automatic, intent-first temporary-workspace policy above.

## Adoption checklist

1. Authority set written and locked (§1), lock hash re-pinned.
2. `package.json` obligations met (§2); placeholders replaced.
3. `scripts/verify.mjs` stages wired to real project evidence (§3, §4).
4. Verification manifest authored; config files filled consistently (§5, §7).
5. `pnpm install && pnpm typecheck && pnpm test:orchestrator` green.
6. `pnpm loop:doctor` and `pnpm loop:demo-safety` pass.
7. First plan: `pnpm loop:plan`; then `pnpm loop:run`.
