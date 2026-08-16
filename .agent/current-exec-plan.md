# Current Execution Plan

**Status:** WP5b complete and independently verified; cohesive commit pending
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Complete one bounded WP5b increment that makes `pnpm loop:status -- --json`
the canonical read-only resume surface for commissioned and uninitialized
repositories. The versioned status diagnostic will preserve the existing
controller-state detail while directly answering which commissioning/profile
is active, which target and verified commit are authoritative, whether the
target is current/ahead/behind/divergent, whether a lease or side effect is
live, whether recovery is automatic/blocked/external, what completed
milestone and exact verification are latest, whether trusted execution and
autonomous integration are eligible, what cleanup/reconciliation is deferred,
and which command is safe next.

Reuse the accepted WP5a Doctor diagnostic for operational commissioning,
provider, evidence, eligibility, issue, and next-action facts. Reuse canonical
state plus the existing read-only operation inspectors for lifecycle facts.
Do not create a parallel success definition or infer completion from logs or
artifact directory names.

This is the Status slice of WP5. It is not a revision of WP4d or WP5a, Doctor
schema work, contract-integrity invariant extraction, strict-config corpus,
CI/provider work, canonical-history completion, WP6 optimization, product
implementation, source readiness repair, or an autonomous-readiness claim.

## Goal Constraints

- Treat WP4d and WP5a as complete at commits
  `6b0ecad59b0b0e416ab43eb920b27f8293cc97fe` and
  `33050af0ca00d229ef14bfaee018e546f0387011`. Do not redo, amend,
  reinterpret, or rerun their completed work merely to obtain different
  evidence.
- Preserve `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, the readiness marker, active and
  historical commissioning records, package/lock/verifier authorities, every
  worked-example payload, and both retained WP4d artifacts byte-for-byte.
- Preserve Doctor schema `2.0.0`, its check ordering/severities, ordinary and
  strict exit semantics, and its accepted read-only authority. Status may
  project accepted Doctor facts; it must not alter their meaning.
- Status is observational. It performs no network call, state initialization,
  mirror repair, ref update, lease acquisition, recovery, planning, build,
  verifier, container, or Codex invocation and creates no path or evidence.
- Target relation is oriented from the target branch to the canonical stored
  verified commit: `ahead` means target descends from verified, `behind` means
  verified descends from target, and `divergent` means neither. `current`,
  `uninitialized`, and fail-closed `unavailable` remain explicit.
- Use canonical state for milestone, exact-verification provenance, pending
  operation, cleanup, and reconciliation. Use Git ancestry for target
  relation. Use accepted Doctor results for operational issues, provider
  identity, exact-result integrity/currentness, eligibility, and next action.
- Use pinned Node `24.18.0` and pnpm `11.15.1` through
  `.tools/node-v24.18.0-win-x64/corepack.cmd`, with that Node directory first
  on `PATH`. Never overlap long aggregate, reconciliation, supervision,
  container, or verifier suites.
- No OCI matrix is applicable because this increment does not change the
  executor/provider owner, provider policy, or containment implementation.
- Do not run a no-argument source verifier: status does not change verifier,
  readiness, commissioning, or exact-evidence semantics. Revisit only if an
  implementation discovery proves this increment genuinely changes one of
  those owners.
- Never edit, stage, move, hide, delete, re-encode, clean, or otherwise mutate
  the protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry matches the requested handoff: branch `master`, HEAD
  `33050af0ca00d229ef14bfaee018e546f0387011`, tree
  `8f0996a103c122ece720b8ed7cea7d07526e3200`, subject
  `feat: add strict operational doctor`, and divergence `0 behind / 5 ahead`
  of `origin/master`. Tracked and staged trees are clean; the protected human
  plan is the only untracked path.
- The protected plan is 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Retained WP4d proof
  `artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` remains 2,424
  bytes / SHA-256
  `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`.
  Retained source result
  `artifacts/verify-2026-08-16T082128-760Z-17384/result.json` remains 44,372
  bytes / SHA-256
  `1ca139e2a995c117b87e07de04707cde1de5bf7a2e4ea6ffce38ba605d8564d0`.
- WP5a accepted evidence remains the user-specified focused 38/38 shard at
  `artifacts/manual/invariant-vitest-7236`, orchestrator 523 passed / 0 failed
  plus two declared Windows POSIX skips at
  `artifacts/manual/test-orchestrator-19716`, unit 536 passed / 0 failed plus
  the same skips at `artifacts/manual/test-unit-23304`, static receipts at
  `artifacts/manual/typecheck-6684`, `artifacts/manual/lint-6600`, and
  `artifacts/manual/format-check-13140`, and the retained safety report named
  in the handoff. These are not rerun or reinterpreted as WP5b evidence.
- The protected WP5 roadmap orders Doctor, then Status, then independent
  invariants. Its exact failure-reporting requirement says status must expose
  profile/commissioning, target branch and verified commit, ahead/behind/
  divergent relation, lease, pending side effect, automatic/blocked/external
  recovery, latest exact verification, next safe command, and current
  autonomous-integration eligibility. The WP5 Status list additionally names
  latest completed milestone and deferred cleanup/reconciliation.
- Current source `pnpm loop:status -- --json` exits 0 but emits only
  `{status:{state:"uninitialized"},inspection:{...}}`. It omits commissioning,
  profile, target relation, latest milestone/exact evidence, trusted and
  integration eligibility, normalized recovery, next command, and deferred
  reconciliation. It also changes to the unrelated reconciliation-status
  schema whenever reconciliation is active.
- The baseline source status probe under the pins left `git status`, the
  absent state ref, absent lease ref, and absent state mirror unchanged.
- `runDoctorDiagnostic` already owns the accepted operational projections and
  safe next action. `MilestoneOrchestrator.inspect` already reads canonical
  state, storage, protected identity, lease, pending-operation recovery, and
  cleanup facts without mutation. `stateStatusSummary` preserves the useful
  detailed controller summary. No separate `status.ts` contract or focused
  status test exists.

## Steps

1. [x] Reconcile handoff, protected/retained identities, authorities, newest
       logs and decisions, WP5 protected roadmap, current source/status/tests,
       and accepted WP5a evidence. Reproduce the missing status fields once
       under the pinned runtime and prove the baseline probe read-only.
2. [x] Replace the completed WP5a plan with this bounded WP5b plan before
       substantial implementation.
3. [x] Add a versioned controller-owned status diagnostic with exact target
       relation classification, a normalized recovery disposition, canonical
       controller/state summary, commissioning/profile, latest completed
       milestone and state-owned exact verification, provider/integration
       eligibility, lease/pending side effect, deferred cleanup/
       reconciliation, accepted Doctor issues, and one next safe command.
4. [x] Route ordinary status, including active reconciliation, through the
       one diagnostic without changing `reconcile-status`, dry-run, mutation,
       Doctor, commissioning, provider, state, or verifier contracts.
5. [x] Add focused target-relation, state/reconciliation/recovery, latest
       milestone/exact evidence, eligibility, source projection, redaction,
       snapshot/read-only, and CLI routing tests. Update README and CONTRACT
       with the versioned output and ancestry/recovery semantics.
6. [x] Freeze source/tests/docs/plan/logs, then run the serial focused receipt,
       orchestrator aggregate, unit aggregate, static gates, applicable safety
       demonstration, final source status/read-only probe, independent receipt
       audits, diff checks, and identity audits. Repair only from focused
       reproduction and replace any failed evidence directory rather than
       overwriting it.
7. [x] Update this plan and `docs/autonomy-log.md`, and record the durable
       generation-bound status contract in `docs/decision-log.md`. Freeze the
       explicit intended WP5b path set for one audited commit without pushing;
       the commit itself is the mechanical storage boundary after this plan
       freezes.

## Acceptance Criteria

- `pnpm loop:status -- --json` emits one deterministic versioned
  `orchestrator-status` document in uninitialized, ordinary initialized,
  pending-operation, active-reconciliation, and target-drift states. The
  active-reconciliation path no longer substitutes a different status schema.
- Commissioning includes validity plus the exact active manifest path/bytes/
  SHA-256, base/head/tree, target branch, immutable-lock hash, registry ids,
  and tier summaries projected from accepted Doctor authority. Profile is
  explicit even when state is uninitialized; unavailable facts remain null
  and never become inferred passes.
- Target output distinguishes configured/commissioned/state target branch
  facts, target-branch HEAD, stored verified commit, and relation. Real Git
  fixtures prove `current`, target `ahead`, target `behind`, `divergent`,
  `uninitialized`, and comparison `unavailable` with the documented
  orientation.
- Lease presence/malformed/owner facts are explicit. A pending side effect is
  normalized to id/kind/phase, recovery classification/message/preserved
  paths/next safe action, and `automatic` or `blocked`. Active reconciliation
  and unexplained target drift are `external`; absence is `none`.
- Latest completed milestone is selected deterministically from validated
  state and includes its id/title/completion time/attempts/commits. Latest
  exact verification is state-owned and carries the accepted Doctor hash,
  currentness, profile, provider-match, status, and completion-eligibility
  facts; no artifact-directory discovery is introduced.
- Trusted-execution eligibility exposes the configured provider, availability,
  immutable provider identity, and completion eligibility. Autonomous-
  integration eligibility and its complete reasons remain the accepted
  Doctor result. Operational status/counts/issues and the accepted earliest
  safe `nextAction` remain visible rather than being recomputed differently.
- Deferred work lists nonterminal/failed workspace cleanup and active/latest
  reconciliation without treating prose logs as state. The existing detailed
  controller summary and state-storage/protected-integrity facts remain
  inspectable.
- Status is read-only in missing-state, initialized-state, pending-operation,
  active-reconciliation, live-lease, and drift cases. Tests compare refs,
  state/mirror bytes, Git identity/status, tracked bytes, and path presence
  before/after. It uses optional-lock-suppressed read-only Git ancestry probes
  and never opens a mutation-capable store or reconciliation controller.
- No Doctor check/schema/exit behavior, immutable authority, commissioning
  identity, provider policy, state schema/reducer, verification semantics,
  source readiness, product system, WP4d/WP5a evidence, or protected plan is
  changed.
- Focused status/CLI/read-only tests, receipt-owning orchestrator and unit
  aggregates, typecheck, lint, format, the applicable safety demonstration,
  behavioral status probe, receipt/hash/count audits, diff checks, and all
  protected-identity audits pass. Declared Windows POSIX skips remain honest.

## Verification

Every command runs separately and serially. Each invocation resolves
`.tools/node-v24.18.0-win-x64`, prepends it to `PATH`, and invokes pnpm through
that directory's `corepack.cmd`. Long suites never overlap.

Implementation diagnostics (not final completion evidence):

1. `pnpm exec vitest run tools/milestone-orchestrator/src/status.test.ts tools/milestone-orchestrator/src/cli.test.ts --fileParallelism=false`.
2. Direct source and disposable-fixture `loop:status -- --json` probes, with
   before/after state/ref/status/file digests. No Doctor-only probe, source
   verifier, fresh-adopter proof, reconciliation run, OCI matrix, or mutating
   loop command.
3. Focused `pnpm typecheck` only as needed while interfaces stabilize; final
   receipt below supersedes diagnostics.

Final frozen-tree commands, in this exact order:

1. Set `LOOP_VERIFY_COMMAND_ARTIFACT_DIR` to
   `artifacts/manual/wp5b-status-focused-final` and run
   `pnpm exec node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/status.test.ts tools/milestone-orchestrator/src/cli.test.ts tools/milestone-orchestrator/src/deterministic-operations.test.ts --fileParallelism=false`.
2. Set it to `artifacts/manual/wp5b-test-orchestrator-final` and run
   `pnpm test:orchestrator`.
3. Set it to `artifacts/manual/wp5b-test-unit-final` and run
   `pnpm test:unit`.
4. Set it in turn to `artifacts/manual/wp5b-typecheck-final`,
   `artifacts/manual/wp5b-lint-final`, and
   `artifacts/manual/wp5b-format-final`; run `pnpm typecheck`, `pnpm lint`, and
   `pnpm format:check` serially.
5. Run `pnpm loop:demo-safety` once because CLI/status inspection remains a
   safety boundary; audit its exact timestamped report. No OCI matrix.
6. Run source `pnpm loop:status -- --json` once. Independently audit schema,
   commissioning/profile, uninitialized relation, lease/side effect/recovery,
   exact/provider/integration facts, issues, deferred work, and next action;
   prove Git status, HEAD/tree, state/lease refs, state path, protected plan,
   and tracked bytes unchanged.
7. Independently match every final receipt to each declared report's bytes and
   SHA-256, audit test totals/failures/skips, then run `git diff --check`,
   `git diff --cached --check`, explicit staged-path review, immutable/
   commissioned/example/readiness/package/lock/verifier/protected and retained
   evidence identity checks, and final branch/divergence/status inspection.
8. Commit once without pushing. Do not run the source no-argument verifier.

Evidence invalidation:

- Status schema/composition, relation/recovery classification, state/exact
  selection, or CLI routing changes invalidate the focused status shard and
  behavioral/read-only probes.
- Changes to shared orchestrator inspection invalidate affected recovery and
  deterministic inspection tests plus the orchestrator aggregate. Prefer a
  new status module and existing read-only APIs; no shared recovery change is
  planned.
- Doctor changes are out of scope and would require stopping to revise this
  plan rather than silently treating WP5a as mutable.
- Documentation or plan/log-only changes after semantic evidence require
  static/diff reinspection. Freeze all tracked files before final receipts.

## Risks and Recovery

- Composing separately sampled Doctor and state observations can race a
  controller transition. Bind the detailed state projection to its canonical
  generation, detect a changed generation, and fail closed/retry rather than
  presenting a falsely consistent snapshot.
- Reusing Doctor output wholesale could make status noisy or create a second
  status definition. Project only the accepted operational fields and issues,
  preserve Doctor as their owner, and keep the status schema independently
  versioned.
- `ahead`/`behind` orientation is easy to invert. Name the target as subject,
  document both directions, and prove them with real non-linear Git history.
- Active reconciliation currently short-circuits CLI status. Route status
  before reconciliation-controller opening so observation never acquires a
  controller capability; keep `resume`, `dry-run`, `reconcile`, and
  `reconcile-status` behavior unchanged.
- Raw pending intents and state may contain absolute paths or diagnostic text.
  Normalize the resume fields and retain the CLI's recursive sensitive-value
  redaction. Keep the existing detailed controller summary only where it is
  already public status content.
- Status must remain useful when state is absent and fail closed when a
  comparison or detailed inspection is unavailable. Null/unavailable is not a
  pass, and operational issues/next action must still come from Doctor.
- Recovery is ordinary reversal of the cohesive WP5b commit. No push,
  credentials, network, history rewrite, recommissioning, provider change,
  state migration, protected-file handling, or destructive cleanup is needed.

## Progress and Evidence

- 2026-08-16: Completed the required resume protocol. Exact entry, protected
  plan, retained WP4d, branch/divergence, and accepted WP5a identities match
  the handoff. Read the frozen authority/contract/plan standard/current plan,
  newest autonomy/decision entries, the protected WP5 section and its exact
  failure-reporting requirements, recent commits, current status/Doctor/state/
  recovery code, relevant tests, and retained receipts.
- 2026-08-16: Under pinned Node `24.18.0` and pnpm `11.15.1`, current source
  status exited 0 with only uninitialized state/storage/lease facts and none of
  the required WP5 resume fields. Git status and absent state/lease refs and
  mirror remained unchanged. Selected Status as the smallest dependency-
  ordered WP5 slice; independent invariant extraction remains next.
- 2026-08-16: Implemented status schema `1.0.0` in a new controller-owned
  module and routed ordinary status before reconciliation-controller opening.
  The diagnostic composes accepted Doctor facts with a generation-bound
  canonical-state inspection, exact target-branch ancestry, normalized
  recovery, latest milestone/exact provenance, provider/integration
  eligibility, cleanup/reconciliation, and the accepted next action. It
  retries state or target movement once and suppresses detailed state plus
  integration eligibility if the observation cannot stabilize.
- 2026-08-16: Focused implementation diagnostics passed 18/18 across the new
  status and existing CLI files. Real Git history proved current/ahead/behind/
  divergent/uninitialized/unavailable orientation; a real CLI child over
  active canonical reconciliation retained the common schema, redacted
  sensitive state text, and preserved state/ref/status bytes. Missing-state,
  pending automatic/blocked recovery, live lease, external drift, canonical-
  generation race, target-advance race, latest exact/milestone, deferred
  cleanup, and full filesystem/ref read-only cases passed. Direct TypeScript,
  focused ESLint, and focused Prettier diagnostics also passed.
- 2026-08-16: The final receipt-owning affected shard passed 20/20 with zero
  skips at
  `artifacts/manual/wp5b-status-focused-final/invariant-vitest-report.json`
  (7,566 bytes, SHA-256
  `622931a8a34c2395f9d9af886c96dba7e48eec8b58a63e7ac6c2e393ecc48fd5`);
  its receipt declaration matches. The optional direct-telemetry begin hook
  could not import a TypeScript module under the planned Node wrapper and was
  explicitly reported non-semantic; the command-owned PASS receipt and report
  are complete, and no result is inferred from telemetry.
- 2026-08-16: The serial orchestrator aggregate passed 532/534 with zero
  failures and only the two declared Windows POSIX skips at
  `artifacts/manual/wp5b-test-orchestrator-final/orchestrator-report.json`
  (187,483 bytes, SHA-256
  `3a24a9905d4386a5c7c2de29d564313143ab9af0b49c83bd6d427e565f9e7236`).
  All 170 suites passed. The subsequent unit aggregate passed 545/547 with
  zero failures and the same two skips at
  `artifacts/manual/wp5b-test-unit-final/test-report.json` (191,507 bytes,
  SHA-256
  `adf81a781c1b9770b5d17984a204d1f7c8fe93b8a64604b20524322e33e9b06f`).
  All 172 suites passed. Both report hashes/sizes match their PASS receipts;
  the commands ran serially under their original limits.
- 2026-08-16: Receipt-owning typecheck, lint, and format checks passed at
  `artifacts/manual/wp5b-typecheck-final`,
  `artifacts/manual/wp5b-lint-final`, and
  `artifacts/manual/wp5b-format-final`. Their declared reports are 1,119 bytes
  / SHA-256
  `69848e5391d2f1cdd5b12f10cc0960a231caa32b6872d79108ff4b863a0fc469`,
  1,652 bytes / SHA-256
  `12ceeddbeabb60e14088a18cd895ac120eca6433c112485a917eb1b9eaa90d84`,
  and 1,824 bytes / SHA-256
  `ad28882c2184f6d2a73ccb80cbed5e49239604b1f950079a514c6efa1b15387b`.
  Independent audit matched every PASS receipt, manifest, declaration, byte
  count, SHA-256, and aggregate total.
- 2026-08-16: The applicable safety demonstration passed all six scenarios at
  `artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260816171558718-6e19b0f2.json`
  (14,968 bytes, SHA-256
  `07fbaec742fe438634fa22e72ed4111926e13a4699ed422eae6f69c9ef3dac5d`).
  Final source status emitted stable schema `1.0.0`, valid readiness
  commissioning, target `master`, uninitialized relation, absent lease and
  pending side effect, recovery `none`, unavailable exact/trusted execution,
  ineligible integration, the accepted 9 pass / 3 warning / 4 block
  operational counts, and `git status --short --branch` as its next action.
  It left HEAD/tree, tracked and staged bytes, private state/lease refs, and
  the absent state mirror unchanged.
- 2026-08-16: Final independent identity audit preserved the protected plan at
  78,574 bytes, raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
  Both retained WP4d artifacts still match their handed-off bytes and hashes.
  No authority, commissioning, example, readiness, package, lock, verifier,
  provider, or protected file changed. No no-argument source verifier, OCI
  matrix, WP5a evidence rerun, push, or mutating loop command occurred.

## Next Action

WP5b ends with the single cohesive commit containing this frozen plan and the
explicitly audited Status paths; do not push. The next autonomous planning
cycle must select the smallest dependency-ordered WP5 independent-invariant
extraction slice. It must not reopen WP4d/WP5a, expand into WP6 or product
implementation, repair readiness, or take on CI/provider work unless that new
WP5 dependency genuinely owns it.
