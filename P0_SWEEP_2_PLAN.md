# Review 2 — Post-Sweep Correctness & Efficiency Findings and Remediation Plan

Review date: 2026-08-05
Reviewed HEAD: `4d367f9` (branch `p0-correctness-sweep`; code state = `9a0b33b`, docs commit on top)
Method: six parallel adversarial review passes (identity fence, protected roots, lease/state,
receipts/retention, telemetry/runner/budget, efficiency/remaining modules), every High/Medium
finding re-verified by direct reading; three findings confirmed by executed probes.
Ground truth at review time: `pnpm typecheck`, full suite (44 files / 300 tests), `pnpm lint`,
`pnpm format:check`, `pnpm loop:demo-safety` all green on Windows / Node v25.9.0
(engine pin mismatch expected). Pinned-Node 24.18.0 + Linux acceptance still outstanding.

## Verdict

The P0 sweep is real: C-01/C-07 (identity fence), C-03 (common-case lease/CAS), C-04
(plan-only retention), and C-05 (mandatory receipts) are substantively closed with strong
tests, and none of the six increments regressed the preserved §5 invariants. However this
review found **one new defect family and a set of implementation gaps in the sweep itself**:

1. The C-02 trust boundary is incomplete: `package.json` (the verifier's dispatch table),
   the verification manifest, the controller's own source tree, and the installed toolchain
   (`node_modules`) are all outside the protected set — each is an independent route around
   the "Worker cannot alter the verifier" property.
2. C-06 is only half-closed: telemetry **begin**-side failures are still semantic at every
   surface (gateway, orchestrator verify/integrate/resume, tier, evidence tools).
3. The tier verifier misclassifies every failing focused command as infrastructure ERROR.
4. The stale-lease takeover has a double-recovery race that re-opens C-03's lost-update
   symptom; `StateStore.initialize` lost its crash-atomicity in the rewrite.
5. Several smaller parity/robustness gaps (reconciliation drift-reset uses the pre-C-02
   protected set; `reconcileTarget` skips the identity fence for legacy state; retention
   apply binds deletions by id but deletes by path; command-runner can crash the controller
   on a log-write failure).

Efficiency: the dominant cost is unchanged and now larger — every evidence-wrapped vitest
run is force-serialized (`--fileParallelism=false`), making each ~150–170 s instead of
~97 s, and the E-01 duplicate-suite problem now costs ~2.5–3 min per candidate run.

## A. Confirmed new correctness findings

Severity ordering. "(probe)" = confirmed by executed probe, not just reading.

### A-1 HIGH — Trust-root set still excludes verifier-equivalent inputs (C-02 continuation)
- `package.json` is not protected; every `scripts/verify.mjs` stage resolves through it
  (`pnpmInvocation(["run", scriptName])`, scripts/verify.mjs:1364) and receipt validation
  trusts the receipt the redefined script itself writes. `evaluateProposal` accepts
  `permittedPaths: ["package.json"]` with zero findings. (probe)
- `tools/milestone-orchestrator/src/**` is not protected; the controller runs from the
  target checkout, so a permitted edit to `protected-roots.ts`/`policy.ts` is enforced on
  the *next* run. `UNBOUNDED_SCOPE` (policy.ts:237) does not catch the subtree. (probe)
- `.agent/completed/loop-recommissioning-verification.json` is not protected, and the
  startup coverage assertion is gated on `existsSync` (orchestrator.ts:631-637): deleting
  the manifest silently disables it. `verify:milestone --manifest <path>` asserts nothing.
- `config/invariant-suite.json` is not protected; the `invariant-vitest` wrapper accepts
  registry-supplied file args with no containment (`../../x.test.ts` passes; `--config=`
  flags pass through, run-tool-evidence.mjs:92-115).
- Gitignored workspace content is invisible to every fence: a Worker with
  `workspace-write` sandbox can edit `node_modules/**` in the isolated clone; diff, status,
  identity, and protected hashes all miss it, then verification runs the tampered toolchain.
- `verifyMilestone` never re-checks protected hashes (no `assertProtectedFiles` in
  verifier.ts): a verification command can patch `scripts/verify.mjs`, run `pnpm verify`,
  and restore bytes before `finalInspection` — endpoints compare equal.

### A-2 HIGH — Telemetry begin-side failures still change outcomes (C-06 half-open)
Finish/complete side is properly degraded; every span-*creation* path is bare:
- codex-gateway.ts:220-229 (`beginPhase` before the turn) → turn failure → consumes retry,
  can escalate.
- orchestrator.ts:2077 (`verify()`) — the `"verifying"` case has no try/catch → run-level
  escalation on a telemetry append error.
- orchestrator.ts:2458 (`integrate()`) — aborts integration of an approved candidate.
- orchestrator.ts:1292 (resume store open), 1472 (accountingGateway open → invocation
  marked failed).
- verification-tier.ts:677-716 (store open + beginPhase outside the guard) → tier exit 3.
- tools/run-tool-evidence.mjs:81/242 → evidence command reported FAIL.

### A-3 HIGH — Tier verifier misclassifies product failures as infrastructure
verification-tier.ts:326-354: the missing-receipt arm runs for **every** execution status
(no `status === "PASS"` guard, unlike verifier.ts:1267-1283). Failing commands never leave
receipts (by design), so a plain failing test yields status ERROR / failureClass
"infrastructure" / exit 3 with the message "Passing check X did not write its required
command-owned receipt." Product defects are routed into the infrastructure/retry lane with
a false message. Same unconditional pattern in invariant-suite.ts:146-157 (message-only).
Double-confirmed independently by two review passes. No failing-command tier test exists.

### A-4 HIGH — Stale-lease double-recovery race re-opens lost updates
controller-lease.ts:118-130: probe-then-`unlink` is not atomic. Two controllers recovering
the same dead lease can interleave so the loser unlinks the winner's *fresh live* lease;
both then hold "the" lease, and since `StateStore.save`'s CAS is read-compare-write
(state-store.ts:406-435), the original C-03 silent lost update recurs. Adjacent gaps:
lease file is created then written (readers can see an empty "malformed" lease whose
documented remedy is manual deletion of a live lease); `processStartedAt` is recorded but
never used for liveness, so PID reuse permanently blocks recovery; host identity is bare
`os.hostname()` (identical hostnames over a shared FS can steal a live remote lease).
Double-confirmed independently.

### A-5 MEDIUM — `StateStore.initialize` durability regression
state-store.ts:376-403: the wx-exclusive rewrite writes canonical `state.json` directly at
the final path (pre-sweep used atomic temp+rename). Crash/ENOSPC mid-write ⇒ torn state
file; every later `load()` refuses (schema error, not ENOENT) until manual deletion.

### A-6 MEDIUM — `reconcileTarget` skips the identity fence for legacy state
orchestrator.ts:1176-1186: the pinned-candidate comparison applies only when the last
summary is PASS with `candidate !== null`. Legacy (`allowLegacy`) or non-PASS summaries
skip it and adopt the externally-advanced target as `verifiedCommit` + completed —
asymmetric with `review()`, which fail-closes on exactly that condition ("Persisted
verification predates the candidate identity fence").

### A-7 MEDIUM — Reconciliation protected-set parity gaps (P0.2 parity)
reconciliation.ts:1561-1563: `resetForCandidateDrift` rebuilds `protectedPaths` from
state-stored files only (prepare() at :1116 uses `buildCanonicalProtectedSet`); the
post-reset `prepare()` early-return keeps the weaker fence to adoption.
`ReconciliationController.openIfPresent` performs no canonical backfill (unlike
`MilestoneOrchestrator.openLeased:702-721`); hash comparisons at :1129/:1578 use stored
records. Affected-scope/benchmark protected-authority triggers use manifest
`requiredProtectedPaths` (subset-validated only), not the canonical set.

### A-8 MEDIUM — Retention apply binds fences by id, deletes by path
evidence-retention.ts:612-640 key every divergence refusal on `planned.id`; :667 deletes
`planned.path` from the *approved plan file* without comparing it to the fresh plan's path
for that id. Default containment root is the whole `artifacts/` tree (includes
`orchestrator/state/`). A tampered-but-hash-approved plan can therefore delete controller
state. Operators approve a sha256 of bytes the CLI never shows them.

### A-9 MEDIUM — command-runner close handler can crash the controller
command-runner.ts:207-217: the `close` listener is async and `await writeFile(...)` twice
with no try/catch; a log-write failure (disk full, dir removed) is an unhandled rejection
(process-fatal by default) and the result promise never settles. Distinct from known-open
R-01.

### A-10 MEDIUM — Budget accounting invents zero for unmeasured turns (R-04 delta)
orchestrator.ts:1486-1516: failed/aborted turns are never charged (gateway throws before
accrual); successful turns with a missing `turn.completed` accrue 0 tokens while telemetry
honestly records "sdk-unavailable". Compounds the known preflight-only overshoot.

### A-11 LOW cluster (fix opportunistically within the increments above)
- telemetry-report.ts:737-759 — success-path telemetry failure flips CLI exit to 1;
  failure-path `span.finish` can mask the real error.
- codex-gateway.ts:346/348 — malformed `turn.failed` events produce `undefined` errors;
  per-event redaction can miss secrets split across stream chunks (concatenated-output
  redaction in command-runner is fine).
- Citations are HEAD-committed-only (`git grep ... HEAD`): working-tree/untracked citations
  are invisible to retention planning and to the became-cited refusal.
- run-tool-evidence.mjs:145-169 — `focused-verify` copies the pointed-at result file as its
  receipt artifact without validating content/candidate/freshness.
- verifier.ts:260-268 — stage-id truncation at 96 chars can amputate the attempt
  discriminator for attempts ≥ 10 (unreachable at default config).
- reconciliation.ts:282-284/1552 — SHA-pinned candidate spec wedges permanently after
  drift-reset (secondary failure bypasses `fail()`); no abandon command.
- evidence.mjs:586 / artifact-inventory.ts:180 — `git write-tree` used as tree identity:
  hashes the index (not HEAD) and mutates `.git/objects` from read-only probes; everything
  else uses `rev-parse HEAD^{tree}`.
- package-graph.ts:209-252 — workspace expansion hard-fails on any `tools/*` dir without
  `package.json` (adopter availability cliff; loud, not silent).
- git-isolation.ts:60/292 — `\` → `/` normalization can conflate a POSIX filename with a
  directory path in *scope* accounting (protected direction stays fail-closed).
- orchestrator.ts:709-720 — trust-root backfill hashes current bytes without provenance
  (pre-sweep tampering becomes the trusted baseline, once, at first post-sweep startup).
- orchestrator.ts:2717/2732 — final `writeRunSummary` failures reject `run()` after the
  terminal state persisted; `TelemetryStore.complete` re-entry guard only checks
  `"completed"`.
- state-store migration never injects `revision` (schema requires it): a genuine
  pre-revision legacy state cannot load; legacy-migration tests mask this via fixtures.
- policy config accepts directory-shaped protected entries (e.g. `"evals"`) that protect
  nothing at the diff boundary (later EISDIR at startup — loud, but late).
- doctor runtimePins reports attention whenever invoked outside pnpm.

## B. Efficiency findings (measured or structurally confirmed)

- **B-1 Serialized suite.** run-tool-evidence.mjs:261 passes `--fileParallelism=false` for
  `test`/`orchestrator` modes: 168.9 s wall vs ~97 s with default parallelism (measured both
  ways on this machine; per-file sum 147 s, all files mkdtemp-isolated). Affects every
  candidate/milestone/aggregate repetition.
- **B-2 E-01 grew.** The duplicated suite is now 300 tests / ~150–170 s per repetition;
  candidate pays it twice, milestone three-plus times ⇒ disjoint tier ownership is now
  worth ~2.5–3 min per candidate run. `planVerificationTier` already dedupes
  `test-unit` vs fast/migrations but has no rule for `test-orchestrator` vs the fast
  partition.
- **B-3 Per-command evidence overhead.** `evidenceContext` + `beginDirectTelemetry` each
  call `commandIdentity()` (≈9–10 process spawns per evidence command incl. `pnpm
  --version` via cmd.exe); ×~10 commands ⇒ ~10–30 s per aggregate/tier run. verify.mjs
  already derives pnpm version from `npm_config_user_agent`.
- **B-4 Fixture rebuild per test.** orchestrator-identity.test.ts rebuilds an identical
  real-git fixture (init + clone) for each of 6 tests (33 s file); same pattern in
  reconciliation (19.8 s), orchestrator-cleanup (19.2 s), verifier (22.2 s),
  evidence-retention (13.2 s), git-isolation (10.4 s). Build-once + copy-per-test keeps
  realism, saves ~30–60 s serialized.
- **B-5 Reconciliation range scan.** ~4–6 git spawns per commit (show ×2, grep,
  merge-base per parent) ⇒ 30–90 s per few-hundred-commit range; one `git log --numstat -z`
  pass + one batched grep suffices.
- **B-6 Buffering.** verify.mjs accumulates full child stdout/stderr in memory before one
  write; artifact hashing reads whole files (fine for receipts, unbounded for future large
  artifacts); workspace-cleanup diff has a 64 MB ceiling (fails safe).
- **B-7 Free win.** cli.ts `loop:run` constructs a `ReconciliationController` (full
  config+state load/validate) before `MilestoneOrchestrator.open` loads both again.

## C. Still open from the original audit (status re-checked, unchanged unless noted)

- R-01 process supervision (A-9 above raises urgency; fix A-9 independently first).
- R-02 residuals: workspace-root junction check, rename/mode matrix — *shrunk* by the
  sweep (`-z` parsing, symlink/gitlink rejection landed and were verified sound).
- R-03 durability (now includes the A-5 initialize regression).
- R-04 budget semantics (now includes the A-10 delta).
- A-01 D-031/five-ten pinning (reconciliation still requires exit 2 / exact 5-PASS+10-NOT_READY).
- A-02 doctor operational preflight (improved by sweep — lease/trust-root/reconciliation
  checks exist — but still no target-branch or tier-ancestry probes).
- A-03 contract/schema parity; A-04 module size. T-01 residual test gaps now itemized:
  post-review and pre-integration drift boundaries, tier failing-command classification,
  concurrent lease recovery, `reconcileTarget` identity branch.
- Final acceptance on pinned Node 24.18.0 + a Linux pass (required before merging
  `p0-correctness-sweep`).

## D. Remediation plan

Ordering: correctness before efficiency; each increment one cohesive commit with its own
tests; suite must stay green and `pnpm verify` must keep the same honest non-green
baseline (no new failing stage, no placeholder turned green). Nothing here authorizes a
readiness claim. P0.7–P0.11 close defects in the *sweep's own* deliverables and the
highest-severity new family; run them before merging the branch, or as the immediate
follow-up sweep on top of it.

### P0.7 — Complete the trust boundary (closes A-1, A-7; touches A-11 items)
1. Extend `CONTROLLER_TRUST_ROOT_PATHS` with `package.json`,
   `.agent/completed/loop-recommissioning-verification.json`, and
   `tools/milestone-orchestrator/config/invariant-suite.json`.
2. Add protected-*subtree* semantics (new concept beside file literals) and protect
   `tools/milestone-orchestrator/**` source; teach `UNBOUNDED_SCOPE`/`patternsOverlap`
   and the safety demo about subtrees.
3. Make manifest absence loud: if tiers/reconciliation are configured, a missing manifest
   is a startup error, not a skipped assertion; `verify:milestone --manifest` runs the
   coverage assertion on the supplied manifest.
4. Add a protected-hash re-check inside `verifyMilestone` after the command loop (before
   accepting final identity), and after each `pnpm-verify` parser command.
5. Toolchain integrity decision (A-1 last bullet): minimum increment = re-run
   `pnpm install --frozen-lockfile --offline` into the workspace between the Worker turn
   and verification (restores lockfile-bound content), plus record the decision; full
   sandbox denial of `node_modules` writes belongs to R-01/P1.1.
6. Reconciliation parity: canonical set in `resetForCandidateDrift`, canonical backfill in
   `openIfPresent`, canonical set for affected-scope/benchmark protected-authority
   triggers; `invariant-vitest` wrapper containment + flag rejection.
7. Tests: proposal/diff probes for every new root and the subtree; manifest-deleted and
   manifest-shrunk startup; modify-then-restore during verification; drift-reset overlap
   with a canonical-only path.

### P0.8 — Finish C-06: begin-side telemetry degradation (closes A-2, part of A-11)
Wrap every `TelemetryStore.open`/`beginPhase` site in the same degradation guard as the
finish side (null span + sidecar diagnostic): gateway, orchestrator verify/integrate/
resume/accountingGateway, tier, run-tool-evidence, telemetry-report exit code. Tests:
begin-failure injected at each surface; outcome/exit unchanged, sidecar written, no retry
consumed.

### P0.9 — Tier/invariant failure classification (closes A-3)
Gate the missing-receipt arm on `execution.status === "PASS"` in
`tierCommandRecord` (mirror verifier.ts:1267-1283 incl. the absence-reason strings); fix
the invariant-suite message; add failing-command tier tests asserting FAIL/exit 1/product.

### P0.10 — Lease + state hardening (closes A-4, A-5; part of A-11)
1. Stale takeover via atomic `rename` of the observed lease to a unique quarantine name
   (loser's rename fails; verify renamed bytes match what was read) before `wx`-creating
   the fresh lease; map second-attempt `EEXIST` to the owner-described error.
2. Create the lease atomically (write temp file, `rename` into place) so no reader ever
   sees an empty lease.
3. Verify `processStartedAt` (tolerance window) alongside the pid probe; document the
   single-host state-directory requirement or add a boot-random machine id.
4. Restore atomic `initialize` (temp + rename with `EEXIST` mapping preserving
   wx-exclusive semantics).
5. Keep release's ownership check; don't let a release error mask the operation error
   (log + suppress unless the operation succeeded).
6. Tests: two-process concurrent stale recovery (real processes), takeover-rename race,
   interrupted initialize, empty-lease reader, PID-reuse simulation.

### P0.11 — Runner settle guarantee (closes A-9; enables R-01 later)
Wrap the close-handler body in try/catch; on artifact-write failure resolve an ERROR
summary (fail-closed) instead of crashing; test with an unwritable artifact dir.

### P1 batch (after P0.7–P0.11, before or with the existing R-/A- roadmap)
- P1.0 identity-fence completions: fail-close `reconcileTarget` on legacy/non-PASS
  summaries (mirror `review()`); add the missing post-review / pre-integration drift
  boundary tests; pass expected runId/result path into tier exact verification instead of
  the self-referential stdout anchor.
- P1.1 = audit R-01 (process supervision) — unchanged scope, plus deny workspace
  `node_modules` writes if the SDK sandbox supports it.
- P1.2 = audit R-03 + retention hardening: bind retention-apply deletions to the fresh
  plan's path per id; decide citation scope (document HEAD-only or include working tree);
  validate `focused-verify` copied result (parse + candidate binding).
- P1.3 = audit A-01/A-02 (generic commissioning; doctor target-branch/tier-ancestry
  probes; un-wedge SHA-pinned reconciliation via classified secondary failure → `fail()`).
- P1.4 = audit P1.4 + A-10: never invent zero usage (charge a conservative envelope or
  mark the run unmeasured), charge failed turns when the SDK exposes usage.
- P1.5 small fixes: `write-tree` → `rev-parse HEAD^{tree}`; package-graph pnpm-parity
  (skip non-package dirs); backslash conflation; migration `revision` injection; strict
  gateway event validation; directory-shaped protected entries rejected at config load.

### P2 efficiency (evidence-gated, after the P0s)
- P2.0 enable vitest file parallelism in the evidence wrappers after 3× green runs on
  Windows + Linux with identical pass/fail sets (expected ~2–3× on every suite repetition).
- P2.1 = audit P2.1 disjoint tier ownership (now ~2.5–3 min/candidate); add a
  `test-orchestrator` vs fast-partition dedupe rule in `planVerificationTier` as the
  stopgap.
- P2.2 evidence-context spawn dedupe: capture identity once per process; pnpm version from
  `npm_config_user_agent`.
- P2.3 fixture build-once-copy-per-test in the six slow suites.
- P2.4 batched reconciliation range scan (`git log --numstat -z` + one grep).
- P2.5 stream large logs/hashes; fix the cli.ts double config/state load.

### Acceptance gates for the whole plan
- Every increment: `pnpm typecheck`, full suite green, `pnpm loop:demo-safety` PASS,
  `pnpm verify` same honest non-green baseline, commit-by-commit diff review against the
  audit §5 preserved invariants.
- Before merge to master: full acceptance on pinned Node 24.18.0 and one Linux pass
  (unchanged requirement; still outstanding).
