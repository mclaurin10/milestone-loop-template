# Current Execution Plan

**Status:** WP2c verification complete; implementation commit and handoff record next
**Updated:** 2026-08-06
**Owner:** autonomous loop

## Objective

Make terminal milestone workspace cleanup recoverable by publishing one strict
`workspace-cleanup` operation before deleting dependencies, creating failed-run
diagnostics, or deleting a workspace, then recovering or blocking from exact
read-only filesystem and Git classifications under the controller lease.

This is the third bounded increment of WP2. Recoverable workspace creation is
complete at `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844`, and recoverable target
integration is complete at `057f16bc14ec28bda36e762d503ee1d4252a898d`.
Approval-bound evidence-retention application remains a separate later WP2
increment and must not be mixed into this cleanup slice.

## Goal Constraints

- Preserve the frozen authority, exact toolchain, Planner/Worker/Reviewer
  separation, standalone workspace isolation, canonical state CAS, the single
  exclusive pending-operation authority, and every immutable readiness gate.
- Publish cleanup intent by canonical state CAS before any `node_modules`,
  diagnostic-archive, workspace, cleanup-error, or summary side effect. The
  intent must bind the exact input generation/revision, run/milestone/attempt,
  repository and target identity, workspace root/path/branch/base/head,
  cleanup policy, deterministic timestamps, archive path and content identity
  when applicable, phase, and validate/adopt-or-preserve recovery policy.
- Completed-workspace deletion may adopt a missing path only after a durable
  delete-started phase. Preserve-policy cleanup may adopt only an exact
  controller workspace whose reproducible dependencies are already absent.
- Failed-workspace deletion must durably materialize and validate exact
  diagnostic evidence before any workspace deletion. Partial, conflicting,
  linked, substituted, or unprovable archives and workspaces fail closed and
  remain in place.
- Recovery must run under the controller lease before target reconciliation,
  protected-root top-up, ordinary terminal-cleanup scanning, or other state
  mutation. One pure completion reducer must own the final workspace cleanup
  record, preservation flag, timestamps, and intent removal.
- Read-only status and doctor must classify the pending cleanup and report its
  exact next safe action without acquiring a lease, refreshing Git indexes,
  repairing artifacts/state mirrors, deleting content, or recovering.
- Keep evidence-retention plan/apply semantics and journals unchanged except
  for compatibility with the expanded pending-operation union. Do not build a
  generic workflow engine or claim WP2, supported-platform, product, or
  autonomous readiness completion.

## Baseline Evidence

- At requested handoff commit
  `1dfe45e83fd28446fb8bad93635bd087fa3e421e`, the tracked tree is clean and
  the only untracked entry is the unrelated human file
  `Implementation-ready improvement plan 8-5-26.txt`; it must remain untouched.
- `orchestrator.ts#cleanupTerminalWorkspace` writes
  `workspace.cleanup.status = "pending"`, calls `performWorkspaceCleanup`, and
  only afterward writes terminal cleanup state. The pending flag is not part
  of `pendingOperation`, is not bound to the canonical input generation, and
  does not fence unrelated state transitions.
- `workspace-cleanup.ts` can remove `node_modules`, write four diagnostic
  files directly into the final archive directory, and recursively remove the
  workspace with no durable phases around those boundaries. A restart after
  workspace deletion accepts a missing completed workspace unconditionally;
  failed deletion accepts any surviving `manifest.json` without proving the
  rest of the archive bytes or controller ownership.
- Completion time is sampled after restart rather than pinned by intent, so
  interrupted and uninterrupted cleanup need not converge to identical state.
  Linked or substituted entries are rejected at the immediate deletion call,
  but there is no durable blocked classification or preserved-path diagnostic.
- Startup recovers only `workspace-create` and `target-integrate` operations;
  it later scans terminal milestones and retries `pending`/`failed` cleanup by
  reconstructing policy from mutable state/config. Status counts those flags
  but cannot classify the external state or name an exact safe recovery action.
- Evidence retention is a distinct operator-approved command with a fresh-plan
  fence and append journal. Its remaining canonical-intent/authentication gaps
  do not require cleanup code and are deferred to WP2d.
- Under Node `24.18.0` and pnpm `11.15.1`, the existing cleanup lifecycle
  baseline passes 14/14:
  `pnpm exec vitest run tools/milestone-orchestrator/src/workspace-cleanup.test.ts tools/milestone-orchestrator/src/orchestrator-cleanup.test.ts --reporter=verbose`.
  These tests exercise happy-path retry but inject no hard loss at destructive
  boundaries and therefore do not close this gap.

## Steps

1. [x] Read authority, plan standard, completed WP2 handoff/logs, cleanup and
       retention implementations, schemas, startup ordering, diagnostics, and
       tests. Run the exact-runtime cleanup baseline and choose cleanup as the
       independent next slice.
2. [x] Add a focused real-filesystem/child-process baseline that loses the
       process after dependency/archive/workspace effects and records the current
       state/external divergence. Define the exact normal-state normalization and
       every durable/external fault boundary before production changes.
3. [x] Advance state schema exactly once and add the strict
       `workspace-cleanup` operation discriminant, 1.6 migration, context
       validation, phase/block/completion reducers, canonical transition fence,
       and JSON schema coverage without weakening the existing two operations.
4. [x] Split cleanup into deterministic intent planning, read-only workspace/
       dependency/archive classification, exact failed-diagnostic planning and
       materialization, contained idempotent actions, and narrow fault hooks.
5. [x] Publish intent before the first cleanup side effect and recover it at
       leased startup. Resume only exact controller-owned states, adopt only after
       the corresponding durable phase, and durably block ambiguous, drifted,
       linked, substituted, or conflicting states without deleting or overwriting.
6. [x] Route uninterrupted and restarted cleanup through one completion
       reducer. Remove the handwritten pending/perform/finalize path while retaining
       explicit migration behavior for legacy `pending`/`failed` cleanup records.
7. [x] Extend status and doctor with read-only cleanup classification and add
       phase, migration, unrelated-mutation fence, double-resume, concurrent lease,
       substitution/link/archive-conflict, deterministic convergence, and byte-
       digest non-mutation tests.
8. [ ] Run focused repeated cleanup-loss cases and the affected operation,
       state, lifecycle, identity, path-safety, status/doctor/CLI, retention, and
       reconciliation suites. Run exact-runtime static and broad checks, inspect
       retained evidence, update contracts/logs, and commit only the cohesive WP2c
       increment.

## Acceptance Criteria

- No controller cleanup side effect can occur without a prior canonical
  `workspace-cleanup` intent naming the exact terminal workspace and policy.
- Hard loss at every declared state, dependency deletion, archive file,
  archive-complete, workspace deletion, and completion boundary converges to
  the same normalized semantic state and exact diagnostic bytes as an
  uninterrupted cleanup.
- Preserve cleanup never adopts a missing or substituted workspace. Delete
  cleanup adopts a missing workspace only when a durable delete-started phase
  proves the controller had authorized that exact removal.
- Failed deletion never removes a workspace until the complete diagnostic
  archive exactly matches the intent. Partial/conflicting archives, unsafe
  roots, links/junctions/gitfiles, identity drift, unexpected workspace Git
  facts, and premature disappearance are preserved with a durable blocked
  diagnostic and manual-reconciliation action.
- Repeated or contending recovery does not repeat semantic completion, change
  pinned timestamps, overwrite diagnostics, or mutate unrelated controller
  state. The lease and exact-generation CAS leave one canonical outcome.
- Existing workspace-create, target-integrate, target-drift, retention-plan/
  apply, reconciliation, protected-file, and cleanup-policy behavior remains
  passing and fail-closed.
- Status and doctor expose operation, classification, preserved paths, and
  next safe action while byte digests of refs, index, worktree, objects, state
  mirror, workspaces, and diagnostic artifacts remain unchanged.

## Verification

- Exact runtime for every project command:
  `$env:Path = "$(Resolve-Path .tools/node-v24.18.0-win-x64);$env:Path"`;
  confirm `node --version` is `v24.18.0` and `pnpm --version` is `11.15.1`.
- Focused: workspace-cleanup planning/classification/action tests;
  operation/schema/state reducer and 1.6 migration tests; hard child-process
  fault matrix; synchronized recovery contenders; status/doctor read-only
  digest tests.
- Affected: orchestrator cleanup/lifecycle/identity, workspace creation,
  target integration/recovery, path safety, CLI, reconciliation, evidence
  retention, state generation lineage, and safety demonstration.
- Static and broad: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm loop:demo-safety`, and
  `git diff --check`.
- Linux cleanup publication/race evidence remains a WP5 CI deliverable before
  any supported-platform or autonomous-readiness claim. No visual/browser
  evidence is required for this non-visual controller increment.

## Risks and Recovery

- Recursive deletion is irreversible. Every delete target must be an exact
  absolute path strictly below the configured root, validated through the full
  real directory chain, bound to the operation, and classified immediately
  before deletion. Ambiguity always preserves content.
- Failed workspaces may be dirty by design. Identity validation must prove the
  standalone repository, branch/base/recorded head and controller markers
  without requiring a clean worktree or omitting diagnostic changes.
- Diagnostic bytes can be large or contain sensitive text. Store only redacted
  controller-produced bytes and exact hashes/lengths in intent; do not embed
  full archive payloads in canonical state or log their contents.
- Expanding the operation union affects migrations, JSON/runtime schemas,
  transition fences, status, doctor, crash workers, and both existing recovery
  paths. Keep kind-specific reducers explicit rather than generalizing early.
- Pre-WP2c `pending`/`failed` records cannot prove that a destructive action was
  controller-authorized. Convert only from external states that remain exactly
  inspectable; preserve and block anything already missing or conflicting.
- Before an intent exists, rollback to `1dfe45e` is ordinary source-control
  recovery. After intent publication or a cleanup side effect, finish or
  reconcile with the WP2c controller; never hand-edit canonical state, delete
  diagnostics, or recreate a workspace to manufacture a rollback.

## Progress and Evidence

- 2026-08-06: Resumed at exact handoff
  `1dfe45e83fd28446fb8bad93635bd087fa3e421e`; verified pnpm `11.15.1`, found
  the bundled exact Node `24.18.0` runtime, and preserved the named unrelated
  untracked file.
- 2026-08-06: Read the complete authority/contract/plan and latest WP2 logs,
  inspected both remaining side-effect surfaces, and selected terminal
  workspace cleanup as the cohesive WP2c slice. Retention apply remains WP2d.
- 2026-08-06: Exact-runtime existing cleanup baseline passed 14/14 in 37.07s.
  No production code has been changed.
- 2026-08-06: A real child process exited immediately after recursive
  completed-workspace deletion and before the final state save. Canonical state
  retained cleanup `pending` with no `pendingOperation` while the workspace was
  absent; restart silently adopted it and changed `completedAt` and
  `nodeModulesRemovedAt` by one hour relative to uninterrupted execution.
  Focused reproduction passed 1/1, with structured evidence at
  `artifacts/manual/wp2c-baseline/workspace-cleanup-crash.json`.
- 2026-08-06: State schema `1.7.0` now carries the exclusive cleanup intent,
  explicit dependency/archive/workspace phases, exact workspace and diagnostic
  identities, pure block/completion reducers, and the generic mutation fence.
  Schema, reducer, and migrations passed 38/38 focused tests, including 1.6
  virtual migration and preservation of earlier pending-operation kinds.
- 2026-08-06: Hard child-process loss converged at all 15 declared cleanup
  boundaries across completed deletion, completed preservation, and failed
  diagnostic deletion in 285.700s. Exact timestamps and archive bytes survived
  restart; structured evidence is
  `artifacts/manual/wp2c-workspace-cleanup/fault-matrix.json`. The independent
  post-delete normal/recovery comparison has no differing fields at
  `artifacts/manual/wp2c-workspace-cleanup/post-delete-convergence.json`.
- 2026-08-06: Synchronized recovery contenders converged under the controller
  lease, and status plus doctor left the state/Git/workspace/archive byte digest
  unchanged. Premature disappearance, workspace identity drift, archive
  conflicts, and same-status diagnostic-source drift all classify fail-closed
  while preserving affected paths.
- 2026-08-06: The first complete aggregate exposed a real failed-workspace
  compatibility defect: a clean candidate commit added after verification made
  the terminal workspace HEAD differ from the last recorded candidate. Cleanup
  now requires recorded/observed HEAD equality for completed workspaces, while
  failed cleanup pins and revalidates the exact observed descendant separately
  from the recorded milestone commit. The full candidate-identity file and all
  direct cleanup cases passed after the correction.
- 2026-08-06: Exact-runtime receipt-owning checks passed: typecheck at
  `artifacts/manual/typecheck-18532/`, lint at
  `artifacts/manual/lint-4720/`, format at
  `artifacts/manual/format-check-23228/`, complete orchestrator 379/379 at
  `artifacts/manual/test-orchestrator-19060/`, and complete unit 392/392 at
  `artifacts/manual/test-unit-14056/`. `pnpm loop:demo-safety` passed at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807005440748-4cc540e4.json`.
- 2026-08-06: The exact final-tree structured evidence refresh passed
  synchronized post-delete convergence (zero differing fields) and all 15
  cleanup loss points. The artifacts are
  `artifacts/manual/wp2c-workspace-cleanup/post-delete-convergence.json` and
  `artifacts/manual/wp2c-workspace-cleanup/fault-matrix.json`.

## Next Action

Inspect the final diff and immutable-path status, commit the cohesive WP2c
implementation, then mark this plan complete and write the repository-backed
autonomy handoff. WP2d remains the next independent retention increment.
