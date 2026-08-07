# Current Execution Plan

**Status:** WP2d complete and committed at `c556e112113da4b565f13a9a5337aeb9df2dd344`
**Updated:** 2026-08-06
**Owner:** autonomous loop

## Objective

Make approval-bound evidence-retention application a recoverable canonical
operation. Publish one exact `retention-apply` intent, authenticated by the
operator-approved plan SHA-256 and bound to the complete candidate, controller,
configuration, root, and deletion identities, before creating apply artifacts
or deleting evidence. Recover every authorized deletion and the append journal
under the controller lease through one state-owned phase machine and one pure
completion reducer.

This is the fourth and final bounded WP2 side-effect slice. Recoverable
workspace creation, target integration, and terminal workspace cleanup are
complete at `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844`,
`057f16bc14ec28bda36e762d503ee1d4252a898d`, and
`0557e66a5fa0763896fee9c4319d6d8939ed8254` respectively.

Explicit non-goals are WP3 process containment, WP5 Linux publication/race
evidence, any change to terminal workspace-cleanup policy or deletion
semantics, automatic evidence deletion from `loop:run`, product-domain work,
calibration, and any supported-platform or autonomous-readiness claim.

## Goal Constraints

- Preserve the frozen authority and original acceptance suite, exact Node and
  pnpm pins, Planner/Worker/Reviewer separation, standalone workspaces,
  canonical state-generation CAS, the single exclusive pending-operation
  authority, and every readiness and human-verification gate.
- Keep the public two-step approval contract: `loop:retention:plan` writes a
  standalone plan and SHA-256 token; only an exact
  `loop:retention:apply -- --plan <path> --sha256 <hex>` may authorize its
  targets. Controller startup and ordinary runs remain plan-only.
- Before intent publication, strictly authenticate the complete plan envelope
  and re-check the candidate, configuration, controller state, roots,
  citations, recency, inventory suspension, manifest identities, and deletion
  containment. Known divergence must refuse without state or evidence change.
- After intent publication, canonical state is the only deletion authority.
  A journal line, missing path, prior result, plan pathname, or hash-prefix
  directory alone can never authorize adoption or removal.
- Pin the full plan hash (not a prefix), exact plan byte length/path, exact
  dirty-worktree fingerprint, input state generation/revision, repository and
  controller identity, configured and real artifact roots, ordered deletion
  identities, journal/result paths, progress, and timestamps.
- Durably enter a per-target delete-started state before calling the existing
  contained recursive-removal primitive. Preserve that primitive and terminal
  workspace-cleanup behavior unchanged.
- Treat the JSONL journal as deterministic derived evidence. Resume only an
  exact canonical prefix (including a torn final append), durably sync appended
  bytes, reject conflicting/extra/reordered/forged entries without overwriting,
  and derive missing-target adoption exclusively from the canonical phase.
- Recovery runs under the controller lease before protected-root top-up,
  target reconciliation, terminal cleanup scanning, or any other state
  mutation. One pure reducer owns `lastPrunedAt`, `lastReportPath`, and intent
  removal.
- Status and doctor must classify a pending retention apply and its exact next
  safe action without acquiring a lease, refreshing Git indexes, creating
  directories, repairing state/artifacts, appending journal bytes, deleting
  evidence, or recovering.

## Baseline Evidence

- Resumed at requested handoff
  `cf255c979252071cd40966fe2c7781130d1fc8b9`. The named unrelated human file
  `Implementation-ready improvement plan 8-5-26.txt` is the sole worktree
  entry. Despite the handoff describing it as untracked, its current index
  state is an added entry (`d0abdd24f404d9dc335818c355e39f7cfc531300`);
  its bytes and index state must remain untouched and outside this increment's
  commit.
- The four authority-file SHA-256 values exactly match both baseline and active
  values in `evals/immutable-contract-lock.json`; calibration remains open and
  unstarted.
- `evidence-retention.ts#applyEvidenceRetentionPlan` validates the explicit
  plan hash and a fresh plan, then creates a hash-prefix apply directory,
  appends `deleting`, recursively removes a run, and appends `deleted` without
  any canonical pending operation or state publication.
- A pre-created syntactically valid `deleting` line currently authorizes a
  missing run. The existing positive resume test constructs exactly that
  unauthenticated state, so filesystem text rather than state lineage decides
  whether disappearance is adopted.
- Journal parsing ignores a malformed final line but never trims or completes
  it. If recovery must append another entry, that torn suffix becomes interior
  corruption on the next read. Appends are not explicitly flushed to durable
  storage, and entries are not bound to an operation ID, plan hash, ordinal, or
  exact canonical sequence.
- Plan validation accepts only a partial envelope shape, candidate identity
  reduces all branch dirtiness to one boolean, and fresh eligibility matches a
  planned deletion by run ID rather than exact path and manifest timestamp.
  A plan can therefore remain superficially matching while dirty bytes or
  deletion fields change.
- Successful apply writes `apply-result.json` but never advances
  `evidenceRetention.lastPrunedAt` or `lastReportPath`. Startup recovery,
  `loop:status`, and `loop:doctor` know only the three earlier pending-operation
  kinds and cannot recover or classify retention apply.
- Under Node `24.18.0` and pnpm `11.15.1`, the existing focused baseline passes
  23/23:
  `pnpm exec vitest run tools/milestone-orchestrator/src/evidence-retention.test.ts tools/milestone-orchestrator/src/cli.test.ts --reporter=verbose`.
  It covers happy-path journal retry but injects no hard process loss and treats
  an unauthenticated journal as valid recovery authority.

## Steps

1. [x] Read the frozen authority, agent/plan contracts, completed WP2c plan,
       latest autonomy and decision logs, exact handoff diff, immutable lock,
       retention plan/apply code and tests, operation/state/schema machinery,
       CLI/startup ordering, status/doctor paths, and contained deletion helper.
       Confirm exact runtime and reproduce the focused baseline.
2. [x] Add focused regressions for forged journal authorization, changed dirty
       bytes, non-canonical plan fields, premature target disappearance, torn
       append continuation, conflicting journal/result artifacts, and hard loss
       around state, append, delete, result, and completion boundaries.
3. [x] Advance state schema once and extend the exclusive operation union with
       a strict global `retention-apply` intent, context validation, legal
       progress transitions, block reducer, completion reducer, lineage/CAS
       enforcement, JSON schema, and 1.7 migration while preserving every prior
       operation unchanged.
4. [x] Make retention plans strict and byte-authenticated: capture an exact
       dirty-worktree fingerprint, validate the complete envelope and canonical
       section relationships, derive canonical deletion targets, preflight every
       target/root, and publish intent only after the existing hash and fresh-plan
       fences all pass.
5. [x] Implement read-only retention-operation classification plus contained,
       idempotent recovery actions. Advance canonical delete-started state before
       each removal; safely complete only exact JSONL prefixes; adopt absence only
       from that state; materialize one exact deterministic result; and finish
       through the canonical reducer.
6. [x] Route both explicit apply and leased orchestrator startup through the
       shared recovery path. Add strict pending-operation path checks and expose
       retention classification/progress/preserved paths/next action in status
       and doctor without mutation.
7. [x] Run repeated fault/convergence and affected retention, operation, schema,
       state-lineage, CLI, startup, cleanup, target/workspace recovery,
       reconciliation, lease, path-safety, and diagnostic read-only tests. Run
       exact-runtime static and broad receipt-owning checks, inspect evidence,
       update contracts/logs, and commit only the cohesive WP2d increment.

## Acceptance Criteria

- No apply directory, journal/result byte, or evidence deletion occurs before a
  canonical `retention-apply` intent bound to the exact approved plan and input
  state generation.
- Wrong hashes, legacy/partial/non-canonical plan envelopes, changed candidate
  commit/tree/index/worktree bytes, controller/config/root drift, new citations
  or recency, suspensions, unsafe paths, and manifest/path/timestamp mismatch all
  refuse before the first deletion when observed before intent.
- Every removal is preceded by durable delete-started authorization for its
  exact ordered target. Missing evidence without that phase is blocked and
  preserved diagnostically; forged or legacy journal text never changes the
  decision.
- Hard process loss at every declared intent, state-progress, journal append,
  recursive removal, result, and completion boundary converges to the same
  normalized canonical state, exact journal bytes, and exact result bytes as an
  uninterrupted apply.
- An exact torn journal suffix is completed as its canonical append; conflicting,
  reordered, extra, linked, or substituted journal/result/root/target state is
  never overwritten or deleted and produces a durable manual-reconciliation
  diagnostic with preserved paths.
- Repeated or contending recovery under the lease does not repeat semantic
  completion, change pinned timestamps, create a second authority, delete an
  unapproved target, or mutate unrelated controller state. Completion records
  the exact result in evidence-retention state through one reducer.
- Existing plan-only run startup, approval CLI syntax, citation/recency/
  suspension rules, contained removal behavior, terminal workspace cleanup,
  earlier pending-operation recovery, reconciliation, and protected-file
  behavior remain passing and fail-closed.
- Status and doctor report the pending operation and safe next action while
  state, refs, index, worktree, object database, artifact roots, journal, and
  result byte digests remain unchanged.

## Verification

- Exact runtime for every project command:
  `$env:Path = "$(Resolve-Path '.tools/node-v24.18.0-win-x64');$env:Path"`;
  confirm Node `v24.18.0` and pnpm `11.15.1`.
- Focused: retention plan/apply and operation reducers; state runtime/JSON
  schemas and 1.7 migration; strict candidate/plan identity; child-process fault
  matrix; synchronized recovery contenders; CLI/startup; status/doctor
  byte-digest non-mutation.
- Affected: operation intent/lineage, state generation/store, controller lease,
  orchestrator lifecycle and cleanup, workspace-create/cleanup and target-
  integrate recovery, reconciliation, path safety, artifact inventory, config,
  safety demonstration, and all CLI diagnostics.
- Static and broad: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm loop:demo-safety`, and
  `git diff --check`.
- No browser/visual evidence is required for this non-visual controller
  increment. Linux hard-loss/race publication evidence remains a WP5 CI
  deliverable and cannot be inferred from Windows results.

## Risks and Recovery

- Evidence deletion is irreversible. Resolve every target to an exact absolute
  child of its pinned configured/real root, validate the whole approved set
  before intent, revalidate remaining targets immediately before progress, and
  never delete from a journal-only or ambiguous classification.
- The current working tree is intentionally dirty because of the unrelated
  staged human file. The candidate fingerprint must preserve and compare that
  exact state without editing, unstaging, committing, or using cleanliness as a
  shortcut.
- State saves create ignored mirror/artifact bytes and private Git objects;
  candidate identity must cover branch-visible changes while remaining stable
  across canonical private-state generations and approved retention artifacts.
- Fresh planning against a pending intent would cite the intent's own target
  IDs. Recovery must evaluate eligibility against the otherwise unchanged
  pre-operation semantic state, while state lineage and exclusive transitions
  prove that removing the intent field is only an observational projection.
- JSONL append recovery may repair only bytes that are an exact prefix of the
  canonical operation-derived sequence. Never truncate or replace conflicting
  bytes merely to obtain progress.
- Before intent publication, rollback to `cf255c9` is ordinary source-control
  recovery. After intent or deletion, finish or manually reconcile through the
  WP2d operation; never hand-edit canonical state, fabricate journal lines,
  recreate deleted runs, or remove conflicting evidence.

## Progress and Evidence

- 2026-08-06: Resumed at exact handoff
  `cf255c979252071cd40966fe2c7781130d1fc8b9`, confirmed immutable hashes and
  exact Node/pnpm pins, and preserved the unrelated staged human file.
- 2026-08-06: Existing retention/CLI baseline passed 23/23 in 14.00s. Inspection
  localized the unsafe authority transfer to the unbound append journal and
  identified strict-plan, dirty-candidate, state-completion, startup recovery,
  and read-only diagnostic gaps.
- 2026-08-06: State schema `1.8.0` now carries a strict global
  `retention-apply` operation. Plan schema `1.2.0` binds exact candidate bytes;
  the full plan hash, state generation/revision, roots, target identities,
  canonical apply paths, phases, progress, and deterministic timestamps remain
  state-owned through completion. The append-only journal and result are exact
  derived evidence, never deletion authority. Explicit apply and leased
  startup share one recovery implementation, and status/doctor classify it
  read-only. The contained removal primitive and terminal workspace-cleanup
  implementation were not changed.
- 2026-08-06: Focused retention apply passed 19/19; operation/schema/store/
  doctor passed 48/48; real orchestrator startup recovery passed; the
  synchronized two-contender case passed; and all nine declared hard-loss
  boundaries converged to identical normalized state, journal, and result
  digests in
  `artifacts/manual/wp2d-retention-apply/fault-matrix.json`.
- 2026-08-06: Final receipt-owning typecheck, lint, and format checks passed at
  `artifacts/manual/typecheck-21684/`, `artifacts/manual/lint-21048/`, and
  `artifacts/manual/format-check-22956/`. The complete orchestrator aggregate
  passed 390/390 at `artifacts/manual/test-orchestrator-11316/`; the full unit
  aggregate passed 403/403 at `artifacts/manual/test-unit-19776/`; and
  `pnpm loop:demo-safety` passed at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807050845281-8bd6533b.json`.
  Two outer wrapper timeouts were treated as invalid evidence. A later complete
  aggregate correctly exposed one stale `1.1.0` plan assertion and a Windows
  temporary-directory `ENOTEMPTY`; the assertion and bounded test-harness
  retry were fixed, the lifecycle file passed 9/9, and only the subsequent
  complete aggregates are cited.
- 2026-08-06: The cohesive WP2d implementation was committed as
  `c556e112113da4b565f13a9a5337aeb9df2dd344` (tree
  `3365a5aa21057b2337c921f02d0cccad4a531a49`). The unrelated staged
  `Implementation-ready improvement plan 8-5-26.txt` remained outside the
  commit at its original blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.

## Next Action

This plan is complete. A future increment must inspect the frozen goal, this
handoff, the latest logs, and the clean controller diff before replacing this
plan with one bounded executable plan. WP3 process containment and WP5 Linux
publication/race evidence remain separate future work. Do not infer product
completion or autonomous readiness from WP2d.
