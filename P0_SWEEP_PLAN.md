# Full P0 Sweep — Correctness Defect Fixes (P0.1–P0.6)

## Context

[CORRECTNESS_AND_EFFICIENCY_AUDIT.md](CORRECTNESS_AND_EFFICIENCY_AUDIT.md) (dated 2026-08-05, audited at HEAD `a7f5b3d`) confirmed six P0 correctness defects in the milestone-loop controller template. The user chose to plan the **full P0 sweep**. Every audit claim was re-verified against source during planning; all line references held.

The six defects, in one line each:
- **C-01**: review/integration are not pinned to the machine-verified candidate — a clean commit injected between verify and review gets integrated unverified.
- **C-02**: live protected set omits `scripts/verify.mjs`, `AGENTS.md`, `.agent/readiness-profile-activated.json`, `pnpm-lock.yaml` — a Worker can legally edit the verifier.
- **C-03**: no cross-process lease or CAS on state — concurrent controllers silently lose updates.
- **C-05**: exit-code verification commands PASS on exit status alone; empty `expectedArtifactKinds` bypasses receipt validation.
- **C-06**: a telemetry write failure rewrites a successful command/agent outcome to ERROR/failed.
- **C-04**: controller startup auto-deletes old evidence, contradicting the required non-destructive retention.
Plus **C-07** (verify.mjs/tier capture identity only at start) and **C-08** (published review JSON Schema rejects persisted reviews) — folded into increment 1.

**Execution model**: create branch `p0-correctness-sweep` off `master`; land **one cohesive commit per increment** in this order:

1. P0.1 identity fence → 2. P0.2 protected trust roots → 3. P0.3 lease + CAS → 4. P0.5 telemetry non-semanticity → 5. P0.4 mandatory receipts → 6. P0.6 approval-bound retention.

(P0.5 is promoted before P0.4: it is independent and stabilizes the command-summary semantics P0.4's tests assert against. P0.4 needs P0.1's identity + P0.2's protected verifier. P0.6 needs P0.3's lease.)

**Out of scope**: P1/P2/P3 items; making placeholder scripts green (`pnpm verify` stays honestly non-green); readiness claims; default-branch rename; no push.

All paths below relative to repo root; `src/` = `tools/milestone-orchestrator/src/`.

---

## Increment 1 — P0.1: End-to-end candidate identity fence (C-01, C-07, C-08)

### Design decisions
- **New `src/candidate-identity.ts`**: `CandidateIdentity {baseCommit, commit, tree, clean, changedEntriesDigest}`; digest = `sha256("cid-v1\0" + sorted raw-diff records NUL-joined)` from `git diff --raw -z --no-renames --diff-filter=ACDMRTUXB base..head` (raw records include modes, so mode-only changes alter the digest; `--no-renames` for determinism). Helpers: `candidateIdentityFrom`, `candidateIdentitiesEqual`, `assertCandidateIdentityUnchanged` throwing `CandidateIdentityMismatchError` (pattern: `CandidateDriftError`, reconciliation.ts:105).
- **`inspectAttempt` grows `tree` + `changedEntries`** ([git-isolation.ts:298-334](tools/milestone-orchestrator/src/git-isolation.ts:298)); the raw-diff parser introduced here is reused by P0.2.
- **Verified identity persists on `VerificationSummary`** (not the workspace record): new `VERIFICATION_SUMMARY_SCHEMA_VERSION = "1.1.0"`, required fields `candidate: CandidateIdentity | null` (null only in migrated legacy summaries) and `authoritativeResultSha256: string | null` (sha256 of the copied `authoritative-verify-result.json`). `review()` already reads `verificationSummaries.at(-1)`.
- **`verifyMilestone` returns the end-of-run identity**; its final check ([verifier.ts:1213-1216](tools/milestone-orchestrator/src/verifier.ts:1213), currently commit+clean only) now compares commit+tree+clean+digest. `orchestrator.verify` **deletes its redundant third `inspectAttempt`** (orchestrator.ts:2032 — itself a drift window) and persists `workspace.headCommit = summary.candidate.commit`. Also wire `expectedTree` into `parseAuthoritativeVerification` (supported at verifier.ts:750/810 but never passed).
- **Fences**: review entry (compare workspace vs pinned identity + re-hash authoritative result copy), post-review, and pre-integration in `orchestrator.integrate`; `integrateFastForward` gains required `expectedTree` input and extends its precondition (git-isolation.ts:349).
- **Reviewer echo** (copies reconciliation-reviewer.ts:64-78 pattern): `REVIEW_SCHEMA_VERSION → "1.1.0"` (+ `REVIEW_LEGACY_SCHEMA_VERSION = "1.0.0"`); four required fields `verifiedBaseCommit`, `verifiedHeadCommit`, `verifiedTree`, `verificationResultSha256`. Touchpoints: contracts.ts type, agent-schemas.ts `REVIEW_OUTPUT_SCHEMA` (properties AND required — enforced by planner.test.ts `assertStrictOutputObjects`), schema.ts `validateReviewerReport` with `allowLegacy` for persisted 1.0.0 decisions (state validator passes it; fresh reviews must be 1.1.0), reviewer.ts prompt pinning + post-validation comparison (throw "Reviewer returned identities outside the pinned verified candidate."), and `schemas/review.schema.json` rewritten as the persisted-artifact contract including `attempt`/`threadId`/`reviewedAt` — **this is the C-08 fix** (model: `schemas/reconciliation-review.schema.json`).
- **Mismatch handling = escalate, not auto-retry**: on any fence failure write a drift-report artifact and `escalate("CANDIDATE_IDENTITY_DRIFT", …)`. `reviewing → escalated` is legal (transitions.ts:14). Deliberate interpretation of the audit's "safe re-verification state": auto-retry would re-verify a workspace containing unexplained external commits (`beginAttempt` reuses the workspace; `runWorker` auto-advances a clean one) = automatic adoption of external work. Must handle `CandidateIdentityMismatchError` BEFORE the generic `reviewing` catch (orchestrator.ts:2326-2338) which would misclassify drift as retryable infrastructure.
- **verify.mjs (C-07)**: `RESULT_SCHEMA_VERSION "2.0.0" → "2.1.0"`. Re-run `collectCandidateIdentity` after the stage loop → `candidateFinal` + `identityDrift {detected, fields}` (compares commit/tree/dirty + the toolchain content hashes); drift ⇒ overall FAIL exit 1, completion reason `candidate_identity_drift`; completion cleanliness now reads the FINAL identity (fixes the stale read at scripts/verify.mjs:1681). Consumers updated: verifier.ts:797 + :198 pin "2.1.0" and require `candidateFinal`/`identityDrift.detected === false`. No synthetic stage (stage-count contracts unchanged).
- **Tier (C-07)**: `VERIFICATION_TIER_SCHEMA_VERSION → "1.1.0"`; re-run `collectTierCandidateIdentity` at end; drift ⇒ status ERROR / exit 3 (infrastructure route); result gains `candidateFinal` + `identityDrift`; pure helper `tierIdentityDrift` for unit tests; `validateVerificationTierResult` + `schemas/verification-tier.schema.json` updated; `validateReconciliationMilestoneTier` also rejects tier results with drift.
- **State migration 1.3.0 → 1.4.0**: rewrite each summary to `{...s, schemaVersion:"1.1.0", candidate:null, authoritativeResultSha256:null}`. **Gotcha (verified)**: the 1.2.0 block assigns `schemaVersion: STATE_SCHEMA_VERSION` ([state-store.ts:238](tools/milestone-orchestrator/src/state-store.ts:238)) — pin it to literal `"1.3.0"` or old states skip the new step.
- **Legacy null identity at review entry = fail-closed escalate** ("verification predates the identity fence; re-verification required"). `reconcileTarget` recovery additionally matches the pinned summary when present; keeps today's weaker check when null (documented).

### Files
`src/candidate-identity.ts` (new), `src/git-isolation.ts`, `src/contracts.ts`, `src/verifier.ts`, `src/agent-schemas.ts`, `src/reviewer.ts`, `src/schema.ts`, `src/orchestrator.ts`, `src/state-store.ts`, `scripts/verify.mjs`, `src/verification-tier.ts`, `schemas/state.schema.json`, `schemas/review.schema.json`, `schemas/verification-tier.schema.json`, `CONTRACT.md:68`.

### Tests
- New `src/candidate-identity.test.ts` (digest determinism + real-git capture incl. mode-only change via `git update-index --chmod=+x`).
- `verifier.test.ts`: mutation-during-verification (branch currently untested), PASS summary embeds identity + result hash, parse rejects drifted/missing `candidateFinal`.
- `git-isolation.test.ts`: `integrateFastForward` tree-mismatch + clean-commit-after-approval (untested today).
- `reviewer.test.ts`: echo happy path / wrong echo / missing fields.
- New `src/orchestrator-identity.test.ts` (fixture cloned from orchestrator-cleanup.test.ts `repositoryFixture` :59-97): windows (b) clean commit + dirty edit after persisted `reviewing` ⇒ escalated `CANDIDATE_IDENTITY_DRIFT`, gateway never invoked, target unchanged; (c) mutation during review ⇒ post-review fence; crash/resume at `reviewing` clean ⇒ completes (positive control); legacy-null ⇒ escalate.
- New `src/aggregate-verify-identity.test.ts`: copy `scripts/verify.mjs` into temp git repo; stage that commits tracked content / moves ref ⇒ FAIL + `candidate_identity_drift`; ignored-artifact write ⇒ control passes.
- `state-store.test.ts` 1.3→1.4 migration + full-chain update; `schema.test.ts` version literals (state 1.4.0, review 1.1.0) + reviewer legacy matrix; `verification-tier.test.ts` drift helper; `reconciliation.test.ts` fixtures updated to result 2.1.0.

---

## Increment 2 — P0.2: Canonical protected trust-root set (C-02)

### Design decisions
- **contracts.ts**: new `CONTROLLER_TRUST_ROOT_PATHS = ["AGENTS.md", ".agent/readiness-profile-activated.json", "scripts/verify.mjs", "pnpm-lock.yaml"]`; fold into `REQUIRED_PROTECTED_PATHS` (existing floor of 4 evals → 8) so the existing config-floor check (schema.ts:1159-1164) picks it up unchanged. Goal file + config file stay covered via existing `authorityFile` / source-path mechanisms. Manifest/registry JSONs and `pnpm-workspace.yaml` deliberately excluded from the floor (loaded via tracked/hashed loaders; lockfile pins resolution) — adopters add extras via config.
- **New `src/protected-roots.ts`**: `buildCanonicalProtectedSet(config, extras)` (sorted, deduped, normalized union; throws on absolute/`..`/glob entries), `enforcementProtectedPatterns(config, protectedFiles)` **replacing both duplicated helpers** (orchestrator.ts:1657-1664, verifier.ts:1041-1051), `assertManifestProtectedPathsCovered(manifest, canonical)` (case-fold subset check), `casefoldPathKey`.
- **Code union is the enforcement truth**: `loadConfig` returns canonical `protectedPaths`; schema floor gives loud drift errors. `CONFIG_SCHEMA_VERSION "1.3.0" → "1.4.0"`; `migrateConfig` accepts 1.0.0–1.3.0 and additively unions the roots (strengthening-only = fail-closed).
- **Existing states: snapshot top-up at `open()`** (before `reconcileTarget`): capture hashes for canonical paths missing from `state.repository.protectedFiles`, persist once (idempotent, crash-safe; no state schema bump — protectedFiles is an open array). Missing root on disk ⇒ `captureProtectedFiles` throws (intended fail-closed); doctor reports instead of throwing.
- **Manifest ⊆ canonical validated at**: `MilestoneOrchestrator.open()` (when the manifest file exists), `ReconciliationController.prepare()`, and a new read-only doctor check `protectedTrustRoots`. Not inside `loadConfig` (manifest-absent repos are legitimate).
- **Case-fold + rename (minimal-safe)**: protected matching becomes case-fold-insensitive on ALL platforms (`protectedPathMatches` in policy.ts for `enforceDiffPolicy` + both `evaluateProposal` loops + reconciliation's `overlapsProtectedPath`); permitted-path/scope matching stays case-sensitive (boundary only gets stricter). Changed-path collection switches to the P0.1 raw parser with `--no-renames` (renames decompose into explicit D+A ⇒ **both sides listed**); reject symlink (`120000`) and gitlink (`160000`) modes loudly now (a symlink at a protected path would alias `assertProtectedFiles` reads). `AttemptInspection.changedPaths` type unchanged ⇒ no contract ripple.
- **Safety demo**: scenario 4 generalized — every canonical path (+ a case-variant probe) must be rejected, set-equality replaces the hard-coded `length !== 1`; new scenario 5 `manifest-trust-root-equality` (skip-with-reason when manifest absent).

### Files
`src/contracts.ts`, `src/protected-roots.ts` (new), `src/policy.ts`, `src/git-isolation.ts`, `src/config.ts`, `src/orchestrator.ts`, `src/verifier.ts`, `src/reconciliation.ts`, `src/safety-demonstration.ts`, `src/doctor.ts`, `src/index.ts`; configs: `config/default.json` + `default.template.json` + `examples/ski-tycoon/default.json` (schemaVersion 1.4.0 + roots), `test/fixtures.ts` `validConfig()`; docs: `CONTRACT.md`, `config/README.md`.

### Tests
New `src/protected-roots.test.ts` (builder unit + live-repo set-equality vs the real manifest + ski-tycoon extras); `policy.test.ts` (each root rejected; case variants `agents.md`/`PNPM-LOCK.YAML` rejected; compromised-verifier probe from the audit now expected-fail; proposal case-overlap); `git-isolation.test.ts` (rename lists both sides; symlink rejection); `config.test.ts` + `schema.test.ts` (migration adds roots; 1.4.0 missing a root fails); `orchestrator-cleanup.test.ts` (top-up idempotence; missing-root failure; manifest ⊄ canonical rejected before state write) — fixture must materialize the four root files; `safety-demonstration.test.ts`, `doctor.test.ts`. Fixture churn: `deterministic-operations.test.ts`, `reconciliation.test.ts` configs must list the full floor + materialize files (largest mechanical update).

---

## Increment 3 — P0.3: Single-writer lease + state CAS (C-03)

### Design decisions
- **New `src/controller-lease.ts`** `ControllerLease`, generalizing `ReconciliationLock` (reconciliation.ts:940-1021, which is **deleted**). Lock file: `dirname(statePath)/controller.lease` (= `artifacts/orchestrator/state/controller.lease`; gitignored; containment-checked via `ensureContainedDirectory` moved to path-safety.ts). Token: `{schemaVersion, token: randomUUID(), pid, hostname, processStartedAt, createdAt, operation}`. Acquire = `open(path,"wx")`; on EEXIST: malformed ⇒ refuse (no auto-steal); **different hostname ⇒ never auto-recover**; same host + `kill(pid,0)` ⇒ ESRCH ⇒ unlink + exactly one retry; alive ⇒ actionable refusal naming pid/operation/age. `processStartedAt` is diagnostic (PID-reuse shows in error text; only dead-same-host is auto-recovered). Release checks token equality; ENOENT tolerated. `static inspect()` for doctor/status.
- **`open()` always acquires the lease** (mutation begins at open: initialize/reconcileTarget/retention-init/cleanup); release on any open failure; new `close()`; cli.ts wraps mutating commands in try/finally close. **`status`/`dry-run` move to new read-only `MilestoneOrchestrator.inspect()`** (loadConfig + store.load only; reports would-be actions: uninitialized state, target drift, pending cleanups, protected integrity, lease owner — no initialize, no persists). Behavior change: `loop:status` no longer creates `state.json` on first run (documented). `reconcile-status`/`doctor`/`check-model-policy`/`demo-safety` unchanged.
- **Reconciliation** swaps its private lock for the shared lease (`operation:"reconcile"`) and **re-loads state immediately after acquisition** (closes the openIfPresent-before-lock TOCTOU). No double-acquire: cli dispatches to exactly one of reconciliation.run / orchestrator.open per invocation (verified: reconciliation never imports the orchestrator).
- **CAS inside `save()`** (signature unchanged — callers' `state.revision` IS the expected base): read on-disk revision before rename; ENOENT ⇒ `StaleStateError` ("mutations must go through initialize"); malformed on-disk ⇒ propagate (never overwrite unreadable state); mismatch ⇒ `StaleStateError` with actionable message ("another controller likely ran; re-run; no merge attempted"). Nobody catches it — propagates to CLI. Zero changes at the two persist funnels (orchestrator.ts:768, reconciliation.ts:1126).
- **`initialize()` exclusive** via `wx`-create of the final path (EEXIST ⇒ return validated existing). Trade-off: first-ever create loses atomic-replace; a torn first write fails closed on next load with nothing lost. Lease + wx = two independent layers.
- **No state schema bump** (revision already exists/validated). Doctor gains `controllerLease` check. Manual override = documented deletion of the lease file (no `--force` flag, no env var — recommend against programmatic steal).

### Files
`src/path-safety.ts`, `src/controller-lease.ts` (new), `src/state-store.ts`, `src/reconciliation.ts`, `src/orchestrator.ts`, `src/cli.ts`, `src/doctor.ts`, `src/index.ts`; docs `README.md` + `CONTRACT.md`.

### Tests
`state-store.test.ts`: divergent two-store save (the audit's probe as regression — second writer gets `StaleStateError`, first update survives), save-onto-missing rejected, exclusive-init matrix (existing interrupted-replacement test unchanged). New `src/controller-lease.test.ts`: contend / dead-owner (real dead PID via `spawnSync(node -e "0")`) / live-foreign-pid refused / cross-host refused / malformed refused / release-token mismatch. `deterministic-operations.test.ts`: second open rejects while leased; open-failure releases lease + state byte-identical; status creates no state and needs no lease; duplicate agent-start prevention (second open rejects before any `gateway.run`). `reconciliation.test.ts`: orchestrator holding lease blocks reconcile and vice versa; crash-resume with stale dead-pid lease succeeds. Real two-process spawn test deliberately omitted (wx atomicity is an OS guarantee; tsx bootstrapping cross-platform is fragile) — noted in test header. All platform-neutral; must pass on this win32 box.

---

## Increment 4 — P0.5: Telemetry non-semanticity (C-06)

### Design decisions
- **command-runner.ts `recordTelemetry`** (:111-123): return the ORIGINAL summary + new optional `CommandExecutionSummary.telemetryError?: string` (verified zero validator/schema ripple) + one redacted stderr line. Rewrite the asserting test (command-runner.test.ts:41-78) to expect preservation.
- **codex-gateway.ts**: wrap success-path `finishTelemetry` (:337-342) in try/catch — write sidecar `agent-telemetry-error.json` next to the invocation record, **still return the turn result**, invocation record stays `"completed"` (no `AgentInvocationRecord` schema change). Failure-path catch (:353-368) stops overwriting the real agent error with "Telemetry write failed". `accountingGateway` needs no change (success now resolves ⇒ usage accounted normally).
- **orchestrator.ts `completeTelemetry`** (:1105-1139): best-effort — keep writing `telemetry-error.json` (the durable degraded-telemetry record), DELETE the escalation persist + rethrow. New private `finishSpanBestEffort` + shared `recordTelemetryDegradation` applied at the inspection/verify/integrate span sites — also fixes the double-finish hazard (finish→throw→catch→finish "already finished" masks the original error). No new state field (the artifact is the record; avoids a state bump owned by P0.1). Evidence-retention failure escalation at :1205-1227 stays (that is evidence, not telemetry).
- **verification-tier.ts**: write `tier-result.json` BEFORE `telemetrySpan.finish`/`complete` (:848-877); wrap those in the try/catch-swallow pattern already used in its catch (:886-904).
- **run-tool-evidence.mjs**: wrap the success-path `finishDirectTelemetry` (:157) like the existing catch-side pattern (:176-195, stderr-only).
- **Deliberately unchanged** (claims-unavailable semantics): `benchmark.ts` and `telemetry-report.ts` telemetry failures still fail those commands — they PRODUCE telemetry claims. `TelemetrySpan.finish`'s finished-flag semantics unchanged (telemetry must not fabricate completion).

### Files
`src/contracts.ts`, `src/command-runner.ts`, `src/codex-gateway.ts`, `src/orchestrator.ts`, `src/verification-tier.ts`, `tools/run-tool-evidence.mjs`; doc: `config/README.md` one sentence.

### Tests
command-runner: PASS/FAIL/TIMEOUT preserved under recordCommand throw + `telemetryError` set + redaction. codex-gateway: successful turn survives span-finish throw (record stays completed, sidecar exists); failed turn keeps the real error. Orchestrator: `stopRun` with failing `complete()` ⇒ run `"stopped"`, `run()` resolves, `telemetry-error.json` exists, no escalation; verify-span failure consumes no retry. Tier: `tier-result.json` written despite telemetry failure. Grep check: only orchestrator.ts references "Telemetry finalization failed" today.

---

## Increment 5 — P0.4: Mandatory focused command receipts (C-05)

### Design decisions
- **`VerificationCommand.expectedArtifactKinds` (required)**: nonempty unique for `parser:"exit-code"`; exactly `[]` for `parser:"pnpm-verify"` (its receipt IS the fully parsed authoritative result — mirrors the tier's exact-check exemption). `MILESTONE_SCHEMA_VERSION "1.1.0" → "1.2.0"` with legacy set {1.0.0, 1.1.0} allowed only under `allowLegacy` (persisted state); at verify time an in-flight legacy proposal fails closed (`failureKind:"policy"`, "re-plan the milestone") — no silent auto-migration of planner intent.
- **`MilestoneProposal.expectedArtifacts` REMOVED at 1.2.0** (verified zero production consumers; its live values name controller-produced files a command could never prove). Legacy versions keep requiring it.
- **verifier.ts loop**: per-command dirs `commands/NN-<id>/{logs,evidence}`; env injection for every exit-code command: `LOOP_VERIFY_STAGE_ID = "milestone-verify-" + verificationRunId(...) + "-" + headCommit.slice(0,12)` (binds receipts to run × milestone × attempt × P0.1 candidate), `LOOP_VERIFY_COMMAND_ID`, `LOOP_VERIFY_COMMAND_ARTIFACT_DIR`. On PASS: `validateCommandReceiptDirectory({requiredKinds: command.expectedArtifactKinds})`; failure/missing ⇒ command ERROR (`failureKind:"infrastructure"`, tier parity). `CommandExecutionSummary` gains required `receipt: VerificationReceiptReference | null` + `receiptAbsenceReason: string | null`. Belt check before summary status: any PASS exit-code command with `receipt: null` forces FAIL. **pnpm-verify commands are NOT env-injected** (deliberate deviation from the audit's letter, same intent: the aggregate owns its children's evidence env; a leaked parent var could misdirect an aggregate child; its evidence is already the strictest-validated tree).
- **Close all three empty-kinds bypasses**: schema.ts:1735 (manifest) and :1835 (invariant registry) require nonempty; delete the empty-kinds arms in verification-tier.ts:321-327 and invariant-suite.ts:133-139 (missing receipt after PASS is always fatal); benchmark.ts after-side requires receipt unconditionally (before-side keeps its historical-lane reason).
- **Data migration**: live manifest 8 domain commands + ski-tycoon 8 ⇒ `["<id>-report"]` (placeholders exit 1 ⇒ never PASS ⇒ nothing turns green; the kind documents the contract the adopter must meet). Invariant registry 4 entries: `protected-integrity ⇒ ["focused-verify-result"]`, three vitest entries ⇒ `["invariant-vitest-report"]` (+ templates + ski-tycoon).
- **Receipt production for invariants**: extend `commandFromArgv` (invariant-suite.ts:22-58) to route through two new `tools/run-tool-evidence.mjs` modes (reusing evidenceContext/writeReceipt/exit-guard): `invariant-vitest <file>` (vitest `--reporter=json --outputFile` → report + receipt) and `focused-verify --stage <id>` (runs focused verify, copies its result.json into the evidence dir, writes receipt kind `focused-verify-result`). `pnpm test:invariants` stays honestly red for the same product reasons (environment stage).
- **`writeReceipt` hardening** (tools/evidence.mjs:615-658): throw on empty/duplicate checks, empty artifacts, `result.json` as artifact, path escaping the artifact dir. PASS stamping stays (only reached on success; exit-guard unlinks on nonzero exit).
- **Planner surface**: `MILESTONE_OUTPUT_SCHEMA` enum `["1.2.0"]` + required kinds field; planner.ts prompt instructs kinds; `schemas/milestone.schema.json` conditionals; `canary.ts` drops the receipt-less `pnpm loop:doctor` command (and from `requiredTests`); `.agent/next-milestone.json` + `test/fixtures.ts` updated.

### Files
`src/contracts.ts`, `src/schema.ts`, `tools/evidence.mjs`, `tools/run-tool-evidence.mjs`, `src/invariant-suite.ts`, `src/verifier.ts`, `src/command-runner.ts`, `src/verification-tier.ts`, `src/benchmark.ts`, `src/agent-schemas.ts`, `src/planner.ts`, `src/canary.ts`; data: `.agent/completed/loop-recommissioning-verification.json`, `examples/ski-tycoon/loop-recommissioning-verification.json`, `config/invariant-suite.json` + template + ski-tycoon, `.agent/next-milestone.json`, `test/fixtures.ts`, `schemas/milestone.schema.json`; docs `CONTRACT.md`, `README.md`, `config/README.md`.

### Tests
verifier: zero-exit/no-receipt ⇒ never PASS; wrong stage/command id; stale receipt (old stage id) rejected; pnpm-verify exemption; PASS-with-null-receipt belt check; legacy proposal fails closed. schema: 1.2.0 kind rules (empty/duplicate/pnpm-verify-nonempty/`expectedArtifacts` present ⇒ reject); manifest/registry empty kinds rejected; post-edit live manifests validate. invariant-suite: argv rewrites; missing receipt always fatal. evidence: `writeReceipt` hardening matrix. tier/benchmark: bypass removal. Reconciliation parity: existing strict path (verifier.ts:113-149) unchanged and still green after manifest edits.

---

## Increment 6 — P0.6: Approval-bound artifact retention (C-04)

### Design decisions
- **Startup becomes plan-only**: split `pruneManagedEvidenceRuns` into `planManagedEvidenceRuns` (identical discovery/citation/recent/suspension logic, NO deletion loop; report `mode:"plan"`, `plannedDeletions[{id,path,finishedAt}]`) and `applyEvidenceRetentionPlan`. **Delete `pruneManagedEvidenceRuns` — no compatibility alias.** Orchestrator `pruneEvidence → planEvidenceRetention` (dependency `evidencePruner → evidencePlanner`); planning failure still escalates (an unverifiable evidence index must not run). `evidenceRetention.lastPrunedAt/lastReportPath` names kept (reinterpreted as planning time; no state bump). `retention-plan.ts` (inventory dry-run) untouched.
- **Plan artifact**: written to the run artifact dir as `evidence-retention.json` (same name ⇒ containment logic untouched) containing candidate {commit,tree,dirty}, controller {verifiedCommit,runStatus,runId}, config snapshot, per-root {artifactRoot, artifactRootRealpath, observed/legacy/cited/recent/eligible, suspensions, plannedDeletions}. **Approval token = sha256 of the plan file bytes.** New CLI `loop retention-plan` builds a standalone plan under `artifacts/orchestrator/retention/plans/…`, prints path + hash, mutates no state.
- **`loop retention-apply --plan <path> --sha256 <hex64>`**: verify hash → acquire the P0.3 lease (injected dependency) → load state (refuse on active reconciliation / running / missing) → artifact-root realpath match → candidate identity match → **fresh re-plan; ANY divergence refuses the whole plan** with a specific reason (suspension-appeared / run-became-cited / run-became-recent / run-missing / config-changed) → journaled deletion (`retention/apply/<hash16>/journal.jsonl`, per-run deleting/deleted entries) via existing `removeContainedPath` → `apply-result.json`. Idempotent re-entry: journaled-deleted ids are skipped and exempt from the missing-from-discovery check; stop-on-first-error (Windows EPERM aborts cleanly; re-run resumes).
- **No quarantine tier** (deliberate): containment/symlink rejection already proven at this boundary; same-volume rename hits the same locked-file EPERM class as `rm`; the journal supplies interruption safety; deletion is now human-approved by exact hash.
- **Docs**: README retention row is now truthful; add the two commands + "nothing is deleted by `loop:run`" to README/CONTRACT; clarify terminal WORKSPACE cleanup (`workspace-cleanup.ts`) is a separate automatic temporary-workspace policy, unchanged.

### Files
`src/evidence-retention.ts`, `src/orchestrator.ts`, `src/cli.ts`, `package.json` (scripts `loop:retention:plan`, `loop:retention:apply`), `src/evidence-retention.test.ts`, docs.

### Tests
`loop:run` with prunable history ⇒ ALL old run dirs survive + plan lists them (rewrites the current deletion-asserting tests at evidence-retention.test.ts:92-127, :168-189; suspension test semantics unchanged). Plan determinism ⇒ identical bytes/hash. Apply: happy path deletes exactly planned dirs; hash mismatch / candidate advanced / became-cited / became-recent / suspension-appeared ⇒ refuse, nothing deleted; interruption + re-run resumes idempotently; symlinked run dir refusal; planner failure still escalates; retention-plan CLI mutates no state.

---

## Cross-increment consistency

| Constant | Before | After | Increment |
|---|---|---|---|
| `STATE_SCHEMA_VERSION` | 1.3.0 | 1.4.0 | P0.1 |
| `REVIEW_SCHEMA_VERSION` (+ new legacy const) | 1.0.0 | 1.1.0 | P0.1 |
| `VERIFICATION_TIER_SCHEMA_VERSION` | 1.0.0 | 1.1.0 | P0.1 |
| new `VERIFICATION_SUMMARY_SCHEMA_VERSION` | ("1.0.0" literal) | 1.1.0 | P0.1 |
| verify.mjs `RESULT_SCHEMA_VERSION` | 2.0.0 | 2.1.0 | P0.1 |
| `CONFIG_SCHEMA_VERSION` | 1.3.0 | 1.4.0 | P0.2 |
| `MILESTONE_SCHEMA_VERSION` | 1.1.0 | 1.2.0 | P0.4 |

- `CommandExecutionSummary` is touched twice, additively: P0.5 adds optional `telemetryError?`; P0.4 later adds required `receipt`/`receiptAbsenceReason`. State validation of summaries is shallow (schema.ts:1374), so persisted legacy summaries stay loadable; the required fields are enforced for newly produced records.
- The raw-diff parser (`diff --raw -z --no-renames`) is introduced in P0.1 (digest) and extended in P0.2 (changedPaths both-rename-sides + symlink/gitlink rejection) — one parser, two consumers.
- P0.2's open() top-up persists before the lease exists; P0.3 then wraps all of open() in the lease. P0.6's apply takes the lease as an injected dependency.
- Keep-preserved invariants (audit §5) must survive every increment: fresh independent review, fast-forward-only integration, fail-closed missing checks, shadow-only scope, serial agents, no-hardlink clones, honest placeholders.

## Verification

Per increment (all on this machine, Node 25.9.0 — engine warning expected):
1. `pnpm typecheck`
2. Focused vitest files for the touched modules (e.g. `pnpm exec vitest run tools/milestone-orchestrator/src/<file>.test.ts --fileParallelism=false`)
3. Full `pnpm test:orchestrator` (82 suites / 208 tests at baseline; count grows)
4. `pnpm loop:demo-safety` (must stay PASS; gains scenario 5 in P0.2)
5. `pnpm lint` + `pnpm format:check`

After all six: full suite green; then `pnpm verify` — expected result is the SAME honest non-green as baseline (environment FAIL: Node mismatch + `verify:dependencies` placeholder; format/lint FAIL: `lint:architecture` placeholder; 10 NOT_READY), now with `candidateFinal`/`identityDrift` in result.json and `completion.eligible` still false. `pnpm test:invariants` stays red for the same product reason (focused environment failure). Any NEW failing stage = regression.

Final commit-by-commit review of the branch diff against the audit's "safety properties that must remain unchanged" per defect.

**Follow-up (not in this session's scope)**: the audit requires final acceptance re-run on the pinned Node 24.18.0 runtime and a Linux pass before any adoption claim.

## Risks

- **Fixture blast radius** (P0.1 required summary fields; P0.2 config floor; P0.4 proposal fixtures) — TypeScript + the schema validators enumerate every site; budget the mechanical churn, largest in `reconciliation.test.ts`.
- **Migration chaining gotcha** — state-store.ts:238 must pin literal "1.3.0" (verified real).
- **Escalation ordering in `review()`** — drift must be caught before the generic infrastructure catch or it becomes a retry in a tampered workspace.
- **Documented behavior changes**: `loop:status` no longer initializes state; identity drift halts the loop (escalation) instead of retrying; telemetry failures no longer flip outcomes; empty-kind manifests are rejected until edited; `loop:run` never deletes evidence.
- **Deliberate deviations from the audit's letter** (same intent, safer): drift ⇒ escalate rather than auto-re-verify; pnpm-verify commands not env-injected in P0.4; symlink/gitlink rejection pulled forward into P0.2.
