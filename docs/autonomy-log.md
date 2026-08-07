# Autonomy Log

Append one entry per completed increment: date, plan objective, verification
evidence (commands, result paths), commit id, and known gaps. Newest first.

## 2026-08-07 — WP3a review fix: drain cutoff, spawn resolve, honest termination

**Objective.** Close three independent review findings against the WP3a
supervisor at `e06baf4`: an inert post-exit output-limit breach (high), a
synchronous spawn throw rejecting past the never-rejects contract (medium),
and `termination.succeeded` overstating what root exit proves (medium).

**Outcome.** A cap breach during the post-exit drain now cuts the drain off
at the breach: the straggler sweep runs immediately (POSIX group SIGKILL;
recorded unavailable on Windows behind a dead root), streams are destroyed,
and the command settles with `drainCutoff: "output-limit"` — a breaching
writer that then closes its pipes can no longer skip the sweep, and the
runner reports the post-exit breach without claiming tree termination.
Synchronous spawn throws resolve an ERROR-shaped result with `spawnError`
set. The termination report now records `rootExitObserved` plus per-attempt
detail and never claims tree-wide success. Findings 1 and 2 were reproduced
by deterministic probes against the prior commit before fixing; all three
have regressions (scripted-child drain cutoff, scripted-child spawn throw,
fallback-root-kill semantics, and a real detached holder that polls for
parent death and floods the inherited pipe strictly after exit through
`runCommand`).

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: focused
supervisor/runner suites 27 passed / 2 skipped (WP5 POSIX). One first-run
aggregate failure was the new fixture's own cleanup racing Windows
asynchronous handle release (EBUSY removing the killed holder's working
directory); both process-test suites now poll killed fixtures to death and
retry the same transient removal codes the production stores retry, and only
the subsequent complete green aggregates are cited. Final-tree receipts:
typecheck `artifacts/manual/typecheck-17492/`, lint
`artifacts/manual/lint-20652/`, format `artifacts/manual/format-check-24620/`,
orchestrator aggregate 414 tests (412 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-orchestrator-10784/orchestrator-report.json`, unit
aggregate 427 tests (425 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-unit-7280/`, `pnpm loop:demo-safety` PASS at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807190106966-4c6cc48e.json`,
clean `git diff --check`. The unrelated untracked human file remained at
blob `d0abdd24f404d9dc335818c355e39f7cfc531300` and outside the commit.

**Commit.** `eab0cd6` (tree `11e115cf0188929afb1c5e6357b616541c4fc75d`).

**Known gaps.** Unchanged from WP3a: POSIX supervision paths first execute
in WP5 Linux CI; reparented-descendant/PID-reuse escapes, Windows post-exit
stragglers behind a dead root, and setsid-detached POSIX daemons remain
recorded residuals owned by the WP3 container slice, alongside contained
candidate execution and the `scripts/verify.mjs`/`tools/evidence.mjs` spawn
conversion. No product-completion or autonomous-readiness claim.

## 2026-08-07 — WP3a bounded process supervisor

**Objective.** Give every controller-spawned verification command a bounded,
deterministic supervision boundary: capped and redacted output, complete
process-tree termination on timeout or cap breach, a bounded post-exit
stream-drain window, and an exactly-once settle with a hard upper bound —
the first bounded WP3 process-containment slice (audit CR-02,
improvement-plan §WP3.5, P0 sweep P1.1/R-01).

**Outcome.** New `process-supervisor.ts` owns spawn, bounded per-stream
capture, termination, drain, and settle; `runCommand` keeps its public API,
policy, redaction, artifact, hashing, telemetry, and status semantics and
adopts the supervisor, so all orchestrator call sites inherit supervision.
Output beyond `limits.commandOutputLimitBytes` (default 64 MiB per stream)
is counted but never retained; a breach tree-kills and fails in the existing
infrastructure lane with newline-boundary truncation and a marker covered by
the recorded hash. Windows termination is force-first
`taskkill /pid <pid> /T /F` while the tree is intact with `child.kill()`
fallback; POSIX uses detached process-group SIGTERM escalating to SIGKILL
after `limits.commandKillGraceMs` (default 5000 ms). Settle is exactly-once
with an abandonment backstop bounding it by `timeoutMs + 2 x killGraceMs`.
Config schema is `1.5.0` with in-memory migration injecting the two new
limits; summaries carry a full `supervision` record. Probed platform facts
(recorded in the decision log): non-detached Node grandchildren die with
their parent via libuv's kill-on-close job object, while detached ones
escape it, survive, and hold inherited pipes open — the reproduced CR-02
hang, which now settles through the drain window; the tree-kill proof
therefore uses a detached (job-object-escaping) grandchild reaped by the
intact-tree taskkill.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: focused
supervisor/runner/config suites passed 29 with 2 skipped (POSIX-only,
flagged WP5); affected verifier/reconciliation/tier suites passed 86/86.
Receipt-owning gates: typecheck `artifacts/manual/typecheck-21180/`, lint
`artifacts/manual/lint-22928/`, format `artifacts/manual/format-check-13364/`,
complete orchestrator aggregate 410 tests (408 passed, 2 skipped WP5,
0 failed) at `artifacts/manual/test-orchestrator-3096/orchestrator-report.json`,
complete unit aggregate 423 tests (421 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-unit-10224/result.json`, `pnpm loop:demo-safety` PASS
at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807154534494-b6b8565c.json`,
and a clean `git diff --check`. Two earlier complete aggregates failed only
on the pre-existing `target-integration-recovery` post-fast-forward test
exceeding its 120s budget (90.9s at the 2026-08-06 baseline; 102.3s isolated
and 120.2s/122.4s in-suite on 2026-08-07; its code paths do not touch this
increment); its duration budget was raised to 300s with measurements
recorded in-file and no assertion changed, and only the subsequent complete
green aggregates are cited. The unrelated untracked human file remained at
blob `d0abdd24f404d9dc335818c355e39f7cfc531300` and outside the commit.

**Commit.** `e06baf4b658713961825edc7996884308bc8c582` (tree
`6d8307b9e9923eafff13fa734931fde1e88b47b5`).

**Known gaps.** POSIX supervision paths (group kill, escalation, drain
sweep) are written but first execute in WP5 Linux CI — no unsupported-
platform claim is made. Descendants reparented before the kill, PID reuse,
Windows post-exit stragglers behind a dead root, and setsid-detached POSIX
daemons remain recorded escape residuals owned by the WP3 container slice,
which also still owns contained candidate execution, execution-provider
identity, and `scripts/verify.mjs`/`tools/evidence.mjs` spawn conversion.
Product-domain verification placeholders, calibration, and every frozen
autonomous-readiness and human-verification gate remain open; nothing here
claims product completion or autonomous readiness.

## 2026-08-06 — WP2d recoverable approval-bound retention apply

**Objective.** Authenticate the complete operator-approved retention plan,
publish one canonical deletion intent before any apply artifact or evidence
removal, and make interrupted application converge without transferring
authority to journal text or changing terminal workspace-cleanup semantics.

**Outcome.** State schema `1.8.0` adds a strict global `retention-apply`
operation bound to the full plan hash, exact input generation/revision,
repository/controller/retention identity, complete dirty-worktree fingerprint,
configured and real roots, observed inventories, ordered target manifest
identities, canonical full-hash apply paths, progress, and deterministic
timestamps. Strict plan schema `1.2.0` and a fresh preflight reject partial or
non-canonical envelopes, changed bytes, configuration/root/citation/recency/
suspension drift, and target identity changes before deletion. Each target
enters durable delete-started state before the unchanged contained removal
primitive. The synced JSONL journal and exact result are derived evidence only:
recovery completes canonical prefixes and torn appends, adopts absence only
from state authorization, preserves conflicting paths with a durable blocked
diagnostic, and completes through one reducer. Explicit apply and leased
orchestrator startup share this recovery path before other state mutation.
Status and doctor schema `1.6.0` classify progress without recovery or
mutation. Terminal workspace-cleanup production code and policy are unchanged.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, focused retention
apply passed 19/19, operation/schema/store/doctor passed 48/48, leased startup
recovery passed, and synchronized recovery contenders serialized through the
controller lease. Hard process loss at all nine declared boundaries converged
to identical normalized state, journal, and result digests in
`artifacts/manual/wp2d-retention-apply/fault-matrix.json`. Final receipt-owning
typecheck, lint, and format checks passed at
`artifacts/manual/typecheck-21684/`, `artifacts/manual/lint-21048/`, and
`artifacts/manual/format-check-22956/`. The complete orchestrator aggregate
passed 390/390 at `artifacts/manual/test-orchestrator-11316/result.json`; the
full unit aggregate passed 403/403 at
`artifacts/manual/test-unit-19776/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807050845281-8bd6533b.json`.
Two broad attempts exceeded undersized outer shell wrappers and were treated as
invalid. A later complete attempt correctly exposed one stale plan-schema
assertion plus a Windows test-fixture `ENOTEMPTY`; both were fixed without
changing production cleanup, the focused lifecycle file passed 9/9, and only
the subsequent complete green aggregates are cited.

**Commit.** `c556e112113da4b565f13a9a5337aeb9df2dd344` (tree
`3365a5aa21057b2337c921f02d0cccad4a531a49`).

**Known gaps.** WP3 still owns process containment, and WP5 owns Linux
publication/race evidence. Product-domain verification placeholders,
calibration, and every frozen autonomous-readiness and human-verification gate
remain open. These Windows controller results do not claim unsupported-platform
coverage, product completion, or autonomous readiness.

## 2026-08-06 — WP2c recoverable terminal workspace cleanup

**Objective.** Publish one exact terminal workspace-cleanup intent before
dependency removal, failed-run diagnostic publication, or recursive workspace
deletion, then make uninterrupted and restarted cleanup converge through one
canonical completion reducer without changing evidence-retention semantics.

**Outcome.** State schema `1.7.0` extends the exclusive pending-operation union
with `workspace-cleanup`, bound to the exact canonical generation/revision,
run/milestone/attempt, repository/target identity, standalone workspace and
creation marker, recorded and observed commits, cleanup policy, pinned
timestamps, and exact diagnostic hashes/sizes. Startup recovery runs under the
controller lease before ordinary terminal cleanup and advances through explicit
dependency, archive, and workspace-delete phases. Preserve policy never adopts
a missing workspace; delete policy adopts one only after durable authorization;
and failed deletion requires an exact complete archive. Failed cleanup pins the
actual observed descendant independently from the last recorded candidate,
because candidate drift may be the failure being archived. Ambiguous roots,
links, substitutions, Git or diagnostic drift, premature disappearance, and
partial/conflicting archives remain preserved with a durable blocked
diagnostic. Status and doctor schema `1.5.0` classify the operation and next
safe action without recovery or mutation. Approval-bound evidence retention is
unchanged.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, synchronized
post-delete recovery produced zero semantic differences and hard process loss
converged at all 15 declared boundaries across completed deletion, completed
preservation, and failed diagnostic deletion. Structured records are
`artifacts/manual/wp2c-workspace-cleanup/post-delete-convergence.json` and
`artifacts/manual/wp2c-workspace-cleanup/fault-matrix.json`. Blocked-state,
candidate-drift, diagnostic-drift, archive-conflict, concurrent lease, and
status/doctor byte-digest cases passed. Receipt-owning typecheck, lint, and
format passed at `artifacts/manual/typecheck-18532/`,
`artifacts/manual/lint-4720/`, and
`artifacts/manual/format-check-23228/`. The complete orchestrator aggregate
passed 379/379 at `artifacts/manual/test-orchestrator-19060/result.json`; the
full unit aggregate passed 392/392 at
`artifacts/manual/test-unit-14056/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807005440748-4cc540e4.json`.
One broad attempt was invalidated by an outer shell timeout and a later complete
attempt correctly exposed a failed-workspace HEAD-policy defect; neither is
cited as passing evidence, and the successful aggregates ran after the fix
under a temporary OS keep-awake guard with repository test limits unchanged.

**Commit.** `0557e66a5fa0763896fee9c4319d6d8939ed8254` (tree
`0508a5f4c759c327d60714c5295f77d13fbd2fc1`).

**Known gaps.** WP2d still owns approval-bound evidence-retention application
intent/authentication and interrupted deletion convergence. Linux cleanup
publication/race evidence remains a WP5 CI deliverable. This Windows result
does not claim unsupported-platform coverage or autonomous readiness, and the
adopting product verification placeholders remain honestly non-passing.

## 2026-08-06 — WP2b recoverable target integration

**Objective.** Publish one exact approved target-integration intent before any
outcome, fetch, ref, index, or worktree side effect, recover it under the
controller lease, and make uninterrupted and restarted completion use one pure
semantic reducer.

**Outcome.** State schema `1.6.0` extends the exclusive pending-operation union
with `target-integrate`, bound to the exact canonical generation/revision,
run/milestone/attempt, repository/target/workspace identity, approved candidate
and commit list, verification-result digest, deterministic outcome paths,
phases, timestamps, and validate/adopt-or-preserve policy. Normal integration
persists intent before its first external side effect. Startup recovers before
ordinary target drift, revalidates protected files and the standalone
remote-free candidate, resumes only from the exact clean base, and adopts only
the exact clean candidate. Pending and integrated outcome bytes are exactly
regenerable. Dirty, locked, in-progress, unexpected, drifted, linked,
substituted, and conflicting states are preserved with durable diagnostics.
Reviewer approval without intent now requires explicit reconciliation. One
completion reducer owns target/milestone/queue/vertical-consumer/processed-count
and human-verification-stop state. Status and doctor schema `1.4.0` classify the
operation and exact next action without mutation.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, hard child-process
loss at all 12 declared boundaries converged to canonical completion; the
structured records are
`artifacts/manual/wp2b-target-integration/fault-matrix.json` and
`artifacts/manual/wp2b-target-integration/post-fast-forward-convergence.json`.
The latter also barrier-synchronized two restart contenders and found no normal
versus recovered semantic difference. Target classification/action/outcome,
migration, lifecycle, identity, reconciliation, cleanup, status, doctor, and
CLI focused checks passed. Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/typecheck-15628/`, `artifacts/manual/lint-904/`, and
`artifacts/manual/format-check-13872/`. The complete orchestrator aggregate
passed 372/372 at `artifacts/manual/test-orchestrator-20588/result.json`; the
full unit aggregate passed 385/385 at
`artifacts/manual/test-unit-11116/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806215546754-eb6dd114.json`.
Two earlier broad attempts were invalidated by machine suspend, which produced
impossible multi-thousand-second durations for unchanged 60-second tests; every
affected case passed awake under its original limit, and the successful broad
runs used only a temporary OS awake guard, not altered repository timeouts.

**Commit.** `057f16bc14ec28bda36e762d503ee1d4252a898d` (tree
`55b6e7a8b97c941663228246617998743589f3b9`).

**Known gaps.** Later WP2 increments still own terminal cleanup and retention
side-effect journaling; this change uses but does not make those subsystems
recoverable. Linux ref/index/worktree race evidence remains a WP5 CI
deliverable. This Windows result does not claim unsupported-platform coverage
or autonomous readiness, and the adopting product verification placeholders
remain honestly non-passing.

## 2026-08-06 — WP2a recoverable workspace creation

**Objective.** Persist a strict workspace-create operation before any clone
side effect, publish through a unique contained temporary path, and make every
creation boundary deterministic and recoverable under the controller lease.

**Outcome.** State schema `1.5.0` adds one exclusive, exact-generation-bound
`workspace-create` intent with pure set/advance/block/complete transitions and
a global unrelated-mutation fence. Canonical `1.4.0` generations migrate
virtually on read and durably on their next CAS successor. Attempt startup now
persists intent before creating directories, clones without hardlinks into a
short unique temporary entry, establishes standalone remote-free identity,
and publishes with no-clobber semantics. Leased startup classifies missing,
source-clone, ready-temporary, exact-final, ambiguous, substituted, and unsafe
paths; it resumes or adopts only exact identity and otherwise preserves the
entries in place with a durable blocked diagnostic. Validation covers lexical
and realpath containment, symlinks/junctions/gitfiles, repository ownership,
alternates/shallow state, exact base/branch, cleanliness, canonical config,
controller markers, and remote facts. Status and doctor schema `1.3.0` expose
the pending operation and next safe action using read-only Git inspection.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, a real-clone matrix
injected process loss at all eight declared durable/filesystem boundaries and
converged every restart to the same normalized revision-9 state. The complete
orchestrator suite passed 363/363 at
`artifacts/manual/test-orchestrator-13136/result.json`; the full unit aggregate
passed 376/376 at `artifacts/manual/test-unit-17720/result.json`. Receipt-owning
typecheck, lint, and format passed at `artifacts/manual/typecheck-21940/`,
`artifacts/manual/lint-7288/`, and `artifacts/manual/format-check-25136/`.
`pnpm loop:demo-safety` passed with its report at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806175034510-a6ecc318.json`.

**Commit.** `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844` (tree
`55858b14eff61c7b4348719604ebf1357bdfb2fe`).

**Known gaps.** WP2b must journal target integration and converge interrupted
integration through one canonical completion reducer; later WP2 increments
still own cleanup and retention side effects. Linux path and publication-race
evidence remains a WP5 CI deliverable. This Windows result does not claim
unsupported-platform coverage or autonomous readiness, and the adopting
product verification placeholders remain honestly non-passing.

## 2026-08-05 — WP1b atomic canonical state generations

**Objective.** Replace mirror-revision read/check/write with a canonical,
recoverable state-generation primitive that permits exactly one publication
from a shared starting generation and preserves read-only command semantics.

**Outcome.** `refs/milestone-loop/state` now points to a strict Git commit
generation containing canonical state JSON and exact revision/hash metadata.
The single parent is the prior generation; current and immediately previous
commits are validated for type, exact tree, schema, hashes, revision successor,
parent, fixed controller identity/timestamp, and canonical message. Saves use
expected-old `git update-ref`. The configured `state.json` is a derived mirror
repaired only on mutation-capable opens. Valid legacy bytes import exactly once
and remain available for reconciliation provenance; malformed, linked, or
ambiguous input fails closed. `load()` cannot authorize `save()`. Status and
doctor schema `1.2.0` expose canonical-generation and mirror facts without
mutating either store. The safety demonstration uses an isolated Git fixture.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, the synchronized
multiprocess same-generation race passed five consecutive runs at
`artifacts/manual/wp1b-state-races/run-{1..5}.json`. Receipt-owning typecheck,
lint, and format passed at `artifacts/manual/typecheck-7476/`,
`artifacts/manual/lint-21564/`, and
`artifacts/manual/format-check-22368/`. The complete orchestrator suite passed
349/349 at `artifacts/manual/test-orchestrator-20856/result.json`; the full
unit aggregate passed 362/362 before commit and again from the clean committed
tree at `artifacts/manual/test-unit-24644/result.json`. The live safety
demonstration passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806045354446-4e64d4e5.json`.

**Commit.** `987ce005a410470d078b8dd57802abbffc2d0356` (tree
`0b9c1719ebc9f7accac4d64e872c6878b753eed2`).

**Known gaps.** WP2 must journal workspace, integration, cleanup, and retention
side effects and converge interrupted integration through the same canonical
completion reducer. Linux race evidence remains a WP5 CI deliverable; this
Windows proof does not claim unsupported-platform coverage. Uncommissioned
readiness placeholders remain honestly non-passing and WP1 is not an
autonomous-readiness claim.

## 2026-08-05 — WP1a atomic controller ownership

**Objective.** Replace stale-file quarantine takeover with a real
expected-owner primitive so a losing first-owner or stale-owner contender can
never remove, replace, or release the live winner.

**Outcome.** The canonical lease is now
`refs/milestone-loop/controller-lease`, pointing to a strictly validated owner
JSON blob. Acquisition, stale takeover, and release use expected-old
`git update-ref`; inspection is read-only. A permanent file-protocol guard
blocks older file-lease binaries and conflicting legacy files fail closed.
Doctor schema `1.1.0` and status expose the canonical ref and guard state.
Normal `git push --all` excludes the private namespace.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: the focused lease
suite passed 16/16; the three synchronized first-owner/stale-owner/winner-life
race cases passed in five consecutive repetitions; the complete orchestrator
suite passed 328/328 at
`artifacts/manual/test-orchestrator-20228/orchestrator-report.json`. From the
clean implementation commit, `pnpm test:unit` passed 341/341 with receipt at
`artifacts/manual/test-unit-15140/result.json`; typecheck, lint, and format
receipts are `artifacts/manual/typecheck-3040/`,
`artifacts/manual/lint-16032/`, and
`artifacts/manual/format-check-15788/`; `pnpm loop:demo-safety` passed with its
report under `artifacts/orchestrator/runs/safety-demonstration/`. A direct
`loop:status` probe left both the ref and legacy guard absent, proving the
read-only path does not initialize ownership state.

**Commit.** `fa1ef6f80c1dd089f8f78133d0aa2344f40a2174` (tree
`0be6b70c386cf58b076f7d3b33cc8f82545cb2a0`).

**Known gaps.** The JSON state mirror still uses a non-atomic revision
read/check/write sequence. WP1b must make `refs/milestone-loop/state`
canonical, migrate legacy state exactly once, and demote `state.json` to a
repairable mirror before WP1 is complete. Linux race evidence remains a WP5 CI
deliverable; no unsupported platform result is claimed here.

## 2026-08-05 — WP0 truthful production-build evidence

**Objective.** Eliminate the zero-command production-build PASS and require an
explicit project-owned build contract, a clean disposable clone, fresh outputs,
output-root containment, and retained path/size/SHA-256 evidence.

**Outcome.** `pnpm build` now exits 2/`NOT_READY` without a receipt when
`package.json#milestoneLoop.productionBuild` is absent. A configured fixture
runs the declared non-recursive script after a frozen offline install, rejects
stale, empty, outside-root, linked, and post-report-mutated outputs, and issues a
PASS receipt only after a second inventory check.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: 13/13 focused build
fixtures passed; `pnpm test:unit` passed 336/336 with receipt at
`artifacts/manual/test-unit-11968/result.json`; `pnpm typecheck`, `pnpm lint`,
and `pnpm format:check` passed with receipts at
`artifacts/manual/typecheck-23840/`, `artifacts/manual/lint-23020/`, and
`artifacts/manual/format-check-19280/`; `pnpm loop:demo-safety` passed. Focused
aggregate evidence is
`artifacts/verify-2026-08-06T025915-819Z-12324/result.json`: production-build is
correctly `NOT_READY` with no receipt, while the aggregate remains FAIL because
the unrelated adopting-project dependency check is still a placeholder.

**Commit.** `66c564c3c2142cde7b5d31d82a18213fdcde525a` (tree
`d9ffd30151c9fac86c5f8c15f1aecd181e10a641`).

**Known gaps.** The template remains deliberately uncommissioned. Candidate
build execution is still local-host execution until WP3 containment. This
increment does not alter readiness meaning or claim autonomous completion.

## 2026-08-05 — Supported-runtime state replacement retry

**Objective.** Remove an intermittent Windows `EPERM` state-file replacement
failure that blocked broad supported-runtime verification, without disguising
or claiming to solve the WP1 atomic-CAS defect.

**Outcome.** State JSON replacement retries only bounded transient filesystem
codes with linear backoff, then fails closed and preserves the prior durable
file. Deterministic hooks cover eventual success and persistent failure.

**Verification.** Under Node `24.18.0`: 13/13 state-store tests, typecheck, lint,
format, and 323/323 orchestrator tests passed. The broad receipt is retained at
`.tools/state-rename-retry/artifacts/manual/test-orchestrator-21932/result.json`.

**Commit.** `235ea2bcb2c32850a9e9e3f4aec24058c4aab546` (tree
`f35a056b5a7ba71e5607c381e6885aa41c60a017`).

**Known gaps.** Read/compare/rename state publication is still not an atomic
CAS, and stale lease takeover is still vulnerable. Both remain WP1 blockers.
