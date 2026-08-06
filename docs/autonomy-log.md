# Autonomy Log

Append one entry per completed increment: date, plan objective, verification
evidence (commands, result paths), commit id, and known gaps. Newest first.

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
