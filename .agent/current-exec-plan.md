# Current Execution Plan

Status: C6a implementation and retained audit verified; commit, exact post-commit audit and hosted cohort next. Updated: 2026-09-06 UTC. Owner: authorized WP6e continuation.

## Objective

Implement the shared source-authority publication fence and approved version-2 authority-anchor inspection, preserving old readers while the old generation is active. This bounded read-only increment precedes complete compatible generation/result/registry consumers and the separately committed/reviewed/leased migration; it does not activate source authority.

## Goal Constraints

Keep the live placeholder authority, approval digest 53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108, original acceptance/script argv, commissioned amendment history, default readiness and permanent marker unchanged. Do not initialize/adopt source state or reinterpret historical WP6e BLOCKED at e590e38. Preserve the user's untracked roadmap and recovery stashes. Old downstream/bootstrap contracts remain executable. Unknown or mixed scope fails closed; inspection alone never authorizes activation.

## Baseline Evidence

C5 0b7a820 produced a real consumed distribution and passed clean post-commit build/dependency/architecture checks. Evidence portability repair dba20a6f3669f4fbfe04161c01524e2059f8277b now passes both audits in a clean branch-only no-local clone: .tools/wp6e-c5-portable-postcommit/artifacts/c5-portable-clean-audit (318 files/29 original receipts) and c5-portable-clean-followup (60 files/six receipts). The exact original supporting objects are absent before/after; no source refs/index/state changed. Original C5 sealed bytes remain intact. All five jobs in repair run 34015911019 passed and their artifacts are retained and independently validated.

Current authority-anchor.ts accepts only legacy lock 1.0.0. config/commissioning/state/lease/verifier consumers lack a common source-publication fence. C4 91cbd3e provides actual inert strict-ancestor snapshots; settled approval is not activation.

## Steps

1. Implemented: fixed source publication paths and a shared cheap pending/unknown/mixed-scope fence; read-only v2 anchor validation against trusted approval, exact strict-ancestor snapshot blobs, all seven approved root files, legacy snapshot/lock and readiness marker.
2. Implemented: wire the shared fence into authority, configuration, commissioning, state read/mutation, lease and direct verification entry points. Source activation remains refused until the complete committed generation/request/review validator is implemented; no candidate-authored flag is accepted.
3. Verified: regression coverage using real Git fixtures for pending/malformed/linked intent, unknown/mixed scope, source approval/root/lock/snapshot/ancestry changes, legacy compatibility and untouched state/refs. Extend the explicit release payload and test ownership for new runtime/tests.
4. In progress: final focused/affected, architecture/static/invariant commands passed with real receipts. Seal and independently audit retained bytes, inspect the exact diff, record, commit, reproduce from a clean clone and dispatch the exact hosted cohort. Then immediately continue complete compatible generation/scoped-result/registry support, followed by request/review/migration and actual candidate/5(a)/5(b).

## Acceptance Criteria

Every integrated consumer refuses a present source intent before normal work, including malformed/linked intents. Unknown/source-mixed identifiers cannot fall back to legacy. New anchor inspection accepts only exact approved seven-file root bytes and fixed snapshot paths at a real strict ancestor, preserving original legacy ancestry and readiness history. It cannot supply an activation/readiness claim. Existing legacy anchor tests and applicable consumer tests retain their original assertions and pass. Live authorities, commissioning and state absence remain unchanged.

## Verification

Meaningful Vitest regressions and affected legacy authority/config/commissioning/lease/state/verifier tests, actual import closure through lint:source-architecture, pnpm typecheck/lint/format:check and pnpm test:invariants with independent receipt validation. No visual change. Record exact runtime, counts and artifacts under artifacts/wp6e-source-readers-20260906. Full candidate, 65-minute provider boundary, four raw partitions and committed 5(a)/5(b) remain future real executions; no supporting check substitutes for them.

## Risks and Recovery

Avoid dependency cycles and repeated heavyweight Git scans in legacy hot paths. Publication checks must cover linked or malformed intent paths and be rechecked at write boundaries. Generated adopters lack source approval records and must not import source identity. Read-only source anchor inspection is intentionally distinct from active-generation authorization. Keep code additions explicit in the shipped runtime allowlist. Recover ordinary code through scoped Git changes; never regenerate approved hashes or delete state/history.

## Progress and Evidence

C5 post-commit audit repair acceptance is observed. C6a begins from dba20a6 with the preserved user roadmap untracked. The shared native-Node publication fence, all integrated refusal boundaries and approved anchor inspection are implemented. The 56-case final boundary run passes, as do source architecture, type/lint/format and all five invariants (106,809 ms; advisory target exceeded, no performance claim).

The first 12-file affected run failed: 203/226 passed, 19 Doctor fixture failures, three amendment deadlines and one state deadline; the timed-out amendment also left an asynchronous rejection. The seven-file sequential rerun at affected-final failed 10/132 with no unhandled errors: three amendment deadlines, one different state deadline and six Doctor expectations. Doctor's protected lock now contains parseable legacy JSON; its originally absent commissioning manifest stays absent. The independent doctor-state-final run then passed all 52 unchanged cases. The first fixture correction incorrectly created a manifest and triggered real protected-manifest validation; that failed attempt is retained.

A detached dba20a6 baseline worktree with unchanged production code reproduces all three amendment deadlines. A --no-checkout fixture experiment also failed all three; the original fixture was restored byte-for-byte. Bounded Git event diagnostics show hundreds of real synchronous Git invocations. After data-only inspection, selecting the existing same-version mingw64 Git executable through task-local PATH made two selected baseline cases pass, but the third still timed out. No original assertions/deadlines, production Git logic, shared installation or global configuration changed. All attempts remain non-passing and are retained; this is deadline diagnosis, not WP6f interpretation.

The next verification uses a task-owned Linux checkout projected from actual dba20a6 Git history plus the exact C6a patch, with independently pinned Node/pnpm and a private frozen offline copy-mode install. Run every original affected suite and new boundary suite there without altering original assertions or deadlines. This is Linux development evidence, not host/provider qualification, native Windows evidence or a committed candidate. Native workstation deadlines remain unverified; the exact pushed C6a commit must additionally pass the unchanged five-job hosted cohort, including Windows, before C6a closure. No source state initialization/adoption is permitted in either checkout. The data-only reporter records per-case progress and failed-child argv/identity; public commands and measurement authority stay unchanged.

All five jobs in hosted run 34015911019 completed successfully at 42871f66ae1711821703f16bcb97cca18b5ccf3a. All five provider ZIPs are retained, independently hash/size checked and boundedly extracted. Both controller jobs report 826 controller and 954 root tests; fresh adopters remain bootstrap/completion-ineligible. OCI expected ERROR/TIMEOUT rejection outcomes remain explicit. All 43 command receipts passed independent validation. Source authority activation and full compatible generation support remain incomplete.

The first Linux launch failed before tests because the private archive extractor omitted executable modes. Its corrected fresh extraction preserves validated original modes; the linux-2 run executed all 282 cases in 16 suites with zero failures/skips/unhandled errors. The owning command nevertheless failed at the unchanged production probe timestamp validator and emitted no PASS receipt. Retained 55 raw process records include PID 13577 with start 08:31:14.253Z, finish 08:31:13.762Z and 767,001,031 monotonic nanoseconds; two enclosing processes also show about 5.17 seconds of epoch/monotonic difference. The selected tests contain no fake-clock calls. Next, rerun the exact projected code and original tests in a fresh owned checkout while a separate read-only Python observer records wall and monotonic clocks. Preserve all failures and the timestamp rejection; do not adjust shared clocks/services or change measurement semantics to obtain a pass.

The observed linux-3 rerun also passed all 282 raw cases and failed production timestamp validation. Independent Python samples show repeated backward epoch/monotonic discontinuities of about 1.1–1.4 seconds every 32 seconds. Stop retrying the same WSL runtime. Reuse the unchanged C3 bounded host coordinator and input pins in a new task-owned disposable Ubuntu guest: first execute its real unchanged OCI matrix at clean dba20a6, then apply the exact existing C6a development projection and run all 282 cases with original deadlines and a separate guest clock observer. Preserve the original 30-minute host policy, no network/host shares, independent input/output inspection and whole-unit cleanup. This is supporting development verification, not an actual committed candidate or native Windows result.

That VM run, 94e44109-2f6e-43c6-abe7-0b887505ee84, passed the six-case OCI matrix at clean dba20a6 and then all 282 cases/production measurement at projected tree 720c0b5eea4f0f4bd73277161b197ddf4dd45ede. Reader receipt SHA256: 8e0ff0a2c3a1c40af2dce6f19c9780f821879c14e69bd8dbcd6348d0ed6e7a1a. The 543,263 ms lifecycle cleaned its process/cgroup/directory; actual host/package/input readbacks remained intact. The unchanged C3 independent OCI and host auditors pass at vm-1/oci-audit and vm-1/host-audit. The 156-member returned archive was inspected before extraction. Final native typecheck-4, lint-3 and format-2 also pass. Original measurement code and test deadlines are unchanged; both WSL failures remain explicitly non-passing.

The 984-file/69-receipt retained audit passed at retained-audit-1 (receipt SHA256 95bba0cd763d6b5af547370eaf34ebd2a7a01740296afe10a4f6cb6c0bd31f31), including actual projected-tree reconstruction, unchanged original case identities and all five older hosted artifacts. The 2,145,077-byte archive SHA256 is 7c4453a6c01a493b4dde14c5957457d16f395ded185f568b64a50bf30e195ac8. Source controller refs/state remain absent and the roadmap hash is unchanged. Commit the scoped implementation, then run the same auditor in a clean branch-only clone and obtain the exact new hosted cohort while continuing the remaining reader/migration work.

## Next Action

Implement C6a, verify and commit, then continue the next authorized increment without stopping at this precursor. Retain all five current hosted outcomes before the next push. Finish the continuation only with the independently audited final acceptance matrix, distinguishing historical, fresh and unresolved gates.
