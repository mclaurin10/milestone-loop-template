# Autonomy Log

Append one entry per completed increment: date, plan objective, verification
evidence (commands, result paths), commit id, and known gaps. Newest first.

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
