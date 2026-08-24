# Current Execution Plan

**Status:** Session 1 core accepted; candidate-prepare remains incomplete
**Updated:** 2026-08-23
**Owner:** autonomous loop

## Objective

Close the two highest-risk `candidate-prepare` authority gaps as one bounded
WP2 recovery increment: publish a strict canonical intent before a Worker can
mutate its candidate workspace, make uninterrupted checkpoint completion and
the exact authorized post-checkpoint restart use one semantic reducer, and
replace the existing clean-descendant shortcut with intent-authorized recovery
or an explicit preserved external/ambiguous block.

This session does not complete `candidate-prepare` or WP2. It does not begin
WP6, CAL-1, hidden validation, product implementation, product completion,
autonomous readiness, or human acceptance. It does not change Planner/Worker/
Reviewer separation, trusted execution, verification, integration, cleanup,
retention, receipt, timeout, or readiness semantics. It must not run source
no-argument `pnpm verify` or `loop:template:prove`, push, or force a commit.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the original acceptance contract, immutable-lock
  baseline/active meanings, the permanent readiness transition, and CAL-1
  `open_not_started` state.
- Use exact Node `24.18.0` from `.tools/node-v24.18.0-win-x64` and pnpm
  `11.15.1`; evidence from ambient Node `25.9.0` is nonqualifying.
- Preserve untracked human file
  `Implementation-ready improvement plan 8-5-26.txt` byte-for-byte at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- Reuse the one exclusive `pendingOperation` union and canonical Git-ref state
  CAS. Canonical state alone authorizes recovery; Worker events,
  `worker-turn.json`, and `controller-checkpoint.json` remain derived evidence.
- Bind `candidate-prepare` to exact input generation/revision, run, milestone,
  attempt, repository/target/workspace/base/branch identity, starting candidate,
  Worker role/assignment/thread lineage, retry context, deterministic artifact
  paths, phases/timestamps, and validate/adopt-or-preserve policy.
- Phases name actual canonical or Git/artifact boundaries. Do not create a
  generic workflow engine or a second journal.
- No Worker invocation may begin before the intent is durably published. A
  result may advance only after complete path, standalone Git, ancestry,
  cleanliness, protected-file, diff-policy, checkpoint, and Worker-context
  validation.
- Preserve every unexpected or ambiguous workspace/commit/artifact in place.
  Never reset, clean, delete, move, recommit, or silently adopt it.
- Existing `workspace-create`, `target-integrate`, `workspace-cleanup`, and
  `retention-apply` operation semantics and migrations must remain passing.

## Baseline Evidence

- Startup identity is `HEAD == origin/master ==`
  `96c3eb2da170da5eed4cf99dc0becf5eb256d138`; tracked bytes were clean and the
  protected human plan was the sole untracked entry at its required digest.
- Package authority pins Node `24.18.0`, pnpm `11.15.1`, and readiness default.
  The local exact Node binary exists under `.tools`; ambient Node is `25.9.0`
  and will not own any evidence.
- State schema is `1.9.0`. Its exclusive pending union has four implemented
  kinds and pure set/advance/block/complete reducers with lineage enforcement,
  but omits the improvement plan's fifth `candidate-prepare` kind.
- `beginAttempt()` creates/reuses the workspace and performs its controller
  install. `runWorker()` then invokes the Worker with no candidate-operation
  intent. `finalizeWorkerAttempt()` validates the diff/protected set, calls
  `commitWorkingChanges()`, writes `controller-checkpoint.json`, clears retry
  feedback, and separately transitions the milestone to verification.
- At `orchestrator.ts`'s current clean-descendant branch, any clean descendant
  commit with no `retryFeedback` transitions directly to verification. No
  durable record distinguishes an interrupted controller checkpoint from an
  out-of-band clean commit.
- Read-only orchestrator inspection, status, and Doctor already project the
  four existing pending operation kinds and their recovery classifications;
  each closed union/dispatcher must include `candidate-prepare`.
- Required exact-runtime red evidence is retained under
  `artifacts/manual/candidate-prepare-session1-red-v5/`. It proves (a) loss
  after the checkpoint commit but before checkpoint artifact/state completion,
  (b) automatic restart adoption of that clean descendant without intent, and
  (c) the same automatic adoption for a separately created valid out-of-band
  descendant. The intentionally red two-test report is 0/2 and is not
  reinterpreted as passing.

## Steps

1. [x] Read frozen authority, agent/plan contract, completed WP5 plan, latest
       autonomy and decision entries, WP2/WP6 improvement-plan sections, Git
       identities, state/schema/operation machinery, Worker/checkpoint path,
       status/Doctor projections, and relevant recovery/test fixtures. Verify
       the protected plan digest and locate the exact runtime.
2. [x] Add a deterministic current-semantics baseline harness without changing
       production behavior. Terminate after `commitWorkingChanges()` advances
       the workspace, reproduce restart auto-adoption, create an equivalent
       clean out-of-band descendant with no intent, and retain truthful ignored
       reports/logs for all red observations.
3. [x] Define state schema `1.10.0` with strict `candidate-prepare` contracts,
       phases, diagnostics, validation, JSON Schema coverage, and a virtual
       `1.9.0 -> 1.10.0` migration. Add pure set, bounded phase/context advance,
       block, and canonical completion reducers while preserving all existing
       operation transition rules.
4. [x] Add a focused candidate-specific planner/inspector/recovery boundary.
       Validate canonical repository/workspace paths, standalone unlinked Git
       identity, branch/base/start ancestry, cleanliness/index state, protected
       bytes, proposal diff policy, checkpoint parent/tree/message, deterministic
       evidence paths/bytes, and Worker policy/thread/retry context. Return only
       exact automatic actions or preserved manual-reconciliation-required
       classifications.
5. [x] Publish the intent before gateway invocation, advance it at real Worker,
       checkpoint preparation/commit/evidence boundaries, and complete through
       one reducer that clears the intent exactly once while entering
       verification. Remove the unconditional clean-descendant shortcut. At
       leased startup, recover the exact authorized checkpoint or durably block
       an unowned/ambiguous clean or dirty workspace without invoking a Worker
       or verification.
6. [x] Extend orchestrator inspection, status, Doctor, state JSON Schema,
       README, and contract projections with operation kind, phase,
       disposition/classification, preserved paths, and next safe action. Add
       reducer/schema/migration/orchestrator tests plus deterministic fault
       injection for the uninterrupted core, exact post-checkpoint recovery,
       and no-intent out-of-band block.
7. [x] Run pinned focused receipt-owning tests, then typecheck, lint,
       format-check, and `git diff --check`. Inspect every command receipt and
       report, update this plan and durable logs accurately, verify the human
       plan hash and frozen identities again, and commit only if every Session 1
       criterion is green and the increment is cohesive.

## Acceptance Criteria

- Retained red evidence proves the checkpoint/state crash window and proves
  that current restart behavior cannot distinguish it from the otherwise valid
  clean out-of-band descendant.
- A Worker candidate invocation cannot begin until its exact
  `candidate-prepare` intent is a canonical state generation.
- The uninterrupted core path reaches `verifying`, clears retry feedback and
  the pending intent exactly once, and writes exact derived checkpoint evidence.
- Loss immediately after the controller checkpoint commit recovers only from a
  matching intent, validates every bound identity/policy/context field, and
  converges semantically with the uninterrupted completion reducer.
- The same clean descendant without a matching intent is preserved and blocked
  as external/ambiguous; it never reaches verification and is never reset,
  cleaned, moved, deleted, or recommitted.
- Unexpected parent/tree/commit, dirty/index, linked/substituted workspace,
  protected-path, diff-policy, artifact, and Worker-context observations used by
  the two central cases fail closed in the shared inspector. The complete
  adversarial/fault breadth remains explicitly Session 2 work.
- State `1.9.0` migrates to `1.10.0`; strict runtime and shipped JSON schemas
  accept the new kind and reject malformed variants. All earlier operation
  kinds and migrations remain passing.
- Inspection, status, and Doctor expose at least kind, phase, disposition,
  classification, and exact next safe action without mutation.
- Focused tests, typecheck, lint, format-check, and `git diff --check` pass with
  valid command-owned evidence under Node `24.18.0` / pnpm `11.15.1`.

## Verification

Every command runs in a fresh PowerShell process with
`.tools/node-v24.18.0-win-x64` prepended to `PATH`, isolated writable
Corepack/store/TEMP/evidence/telemetry roots where applicable, and
`--fileParallelism=false` for Vitest ownership. Planned focused owner:

- `node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/candidate-prepare.test.ts tools/milestone-orchestrator/src/candidate-prepare-baseline.test.ts tools/milestone-orchestrator/src/operation-intent.test.ts tools/milestone-orchestrator/src/schema.test.ts tools/milestone-orchestrator/src/state-store.test.ts tools/milestone-orchestrator/src/status.test.ts tools/milestone-orchestrator/src/doctor.test.ts --fileParallelism=false`
- Add an existing operation recovery owner only when a shared reducer/schema
  change affects it; do not substitute an aggregate for focused diagnosis.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`

Do not run source no-argument `pnpm verify`, `loop:template:prove`, hidden
validation, CAL-1, or WP6 benchmarks/partition work.

## Risks and Recovery

- The Worker thread callback currently mutates milestone lineage while an
  operation is pending. Candidate reducers must make that a canonical bounded
  operation transition; weakening the global unrelated-mutation fence is not
  acceptable.
- A checkpoint commit hash is not known before Git commits. Bind the durable
  pre-commit authorization to exact starting parent, prepared tree, message,
  policy/context, and deterministic evidence paths, then validate the observed
  commit before adoption. Do not treat descendant ancestry alone as ownership.
- Derived Worker/checkpoint artifacts may be absent after a crash. Their absence
  is never authority; recovery may regenerate only deterministic controller
  evidence after canonical intent plus external Git facts validate exactly.
- Existing retries may begin with prior committed attempts and thread lineage.
  Preserve those identities and bind the new operation to the exact starting
  candidate and retry feedback rather than assuming the verified base is HEAD.
- State/schema breadth is large. Keep edits localized to the fifth operation,
  its dispatcher arms, and directly required projections. Ordinary Git commits
  provide rollback; preserve all suspicious workspace/evidence content.

## Progress and Evidence

- 2026-08-23: Mandatory startup inspection completed. The protected human plan
  hash, HEAD/origin identity, readiness marker, CAL-1 state, and immutable lock
  values match the Session 1 brief. Ambient Node mismatch was detected before
  any test launch; exact vendored Node `24.18.0` will own all evidence.
- 2026-08-23: The omitted authority boundary is confirmed in production code:
  checkpoint Git mutation precedes its artifact/state completion, and a
  no-intent clean-descendant branch advances directly to verification.
  Deterministic executable red reports remain the first unresolved action.
- 2026-08-23: Exact Node `24.18.0` / pnpm `11.15.1` red evidence is retained at
  `artifacts/manual/candidate-prepare-session1-red-v5/`. A real post-commit hook
  terminated the child controller after workspace HEAD advanced from
  `0f1fae7` to `05958a9`; the checkpoint artifact was absent, canonical state
  had no pending intent, and restart entered `verifying` without a Worker call.
  Its observation SHA-256 is
  `e7e56ba987b90d02cd86bc36a7f4fd8626f76d4ee2d3657d10b9fa8459ff49ed`.
  A separately created valid clean descendant likewise entered `verifying`
  with no intent or blocker; its observation SHA-256 is
  `1280fdd8eb5282787abafc5ddd7b09a7957a1c0629e709ad1cbaf878b28926d0`.
  The two-test report is truthfully 0/2 with SHA-256
  `ef073e2e444d06399c33f5dd7c26974ca6c7325e602783d3e187c303837f504d`;
  its ERROR manifest has no receipt. Earlier `red`, `red-v2`, `red-v3`, and
  `red-v4` attempts exposed fixture setup defects and are retained but are not
  cited as causal evidence.
- 2026-08-23: State schema `1.10.0` now carries the strict fifth pending kind,
  virtual `1.9.0 -> 1.10.0` migration, phase topology, diagnostics, and pure
  intent/advance/block/complete reducers. The global pending-operation fence
  reconstructs candidate transitions through those reducers and rejects
  unrelated mutation.
- 2026-08-23: The main Worker path now publishes candidate intent before the
  accounting gateway, records invocation/thread/completion canonically, stages
  only after durable Worker completion, and binds any controller commit to an
  exact parent/tree/message. Leased startup adopts the exact authorized
  post-commit result through the normal completion reducer. Without intent,
  clean or dirty candidate output is classified external/ambiguous, never
  verified, and forced through the existing cleanup reducer's preserve path
  even when ordinary failed-workspace policy requests deletion.
- 2026-08-23: Read-only orchestrator inspection, status, and Doctor expose the
  candidate operation phase, classification/disposition, preserved path, and
  exact next safe action. README and contract document canonical-state
  authority and derived-only Worker/checkpoint evidence.
- 2026-08-23: The pinned receipt-owning existing-kind/migration matrix passed
  30/30 suites and 110/110 tests with zero failures or skips at
  `artifacts/manual/invariant-vitest-3240/` (report SHA-256
  `771031ebc3a00f59677222db459bbcc4ffef09b3b45da77c0823603da3e4d499`).
  After strengthening the no-intent path against delete-on-failure policy, the
  candidate plus ordinary/crash cleanup matrix passed 10/10 suites and 18/18
  tests with zero failures or skips at
  `artifacts/manual/invariant-vitest-16196/` (report SHA-256
  `7eb0091f1d03b002b52bd24a22d44c99f6aca02ea020889bade220f0bb082686`).
  Final formatted-tree typecheck, lint, and format-check passed with matching
  receipts/artifacts under `artifacts/manual/typecheck-9636/`,
  `artifacts/manual/lint-15348/`, and
  `artifacts/manual/format-check-21424/`; `git diff --check` is clean. The human
  plan remains byte-exact at its required SHA-256, HEAD still equals
  `origin/master` at `96c3eb2`, every immutable baseline/active hash matches
  disk, readiness remains active, and CAL-1 remains `open_not_started`.

## Next Action

Session 2's first unresolved action is a deterministic process-loss test at the
`after-intent-persisted` boundary. Session 1 deliberately classifies restart
from `intent-persisted`, `worker-invocation-started`, or
`worker-thread-recorded` as preserved `worker-outcome-ambiguous`; Session 2
must prove whether an exactly unchanged candidate at the first boundary can
safely resume the Worker without inventing authority, and otherwise retain the
fail-closed block. Continue in order through loss after Worker thread
publication, Worker return, derived turn evidence, checkpoint staging/
preparation, checkpoint state, checkpoint artifact temporary/final
publication, and completion state; then concurrent resume, resume twice, dirty
output, Worker self-commit, retry-with-prior-commits, unexpected
parent/tree/message, index/operation locks, missing/substituted/linked workspace
ancestors, protected/diff-policy drift, conflicting derived artifacts, and
inconsistent thread/event identity. Compare normal and recovered semantic
state, retain a fault-matrix receipt, and run broader orchestrator/unit owners
before closing `candidate-prepare`. WP2 and `candidate-prepare` remain
incomplete, and WP6 may not begin from this Session 1 result.
