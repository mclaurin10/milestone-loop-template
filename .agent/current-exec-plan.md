# Current Execution Plan

Status: In progress — exact C3 CI catalogue and Windows fixture regressions. Updated: 2026-09-06 UTC. Owner: authorized WP6e continuation.

## Objective

Repair the stale mutable current-catalogue expectation and the qualification-input fixture's noncanonical temporary path exposed by exact C3 hosted CI. Preserve both failed reports, exercise their actual rejection boundaries, and obtain verified local and new exact-commit hosted evidence while continuing the authorized prerequisites.

## Goal Constraints

Keep all original authority, acceptance, commissioning/amendment history, legacy commands, readiness and human gates. Historical WP6e stays BLOCKED at e590e38. The fixed original 87-file baseline remains a historical fact; four explicitly recorded later qualification test additions make the C3 catalogue 91 files. Do not suppress discovery, discard those tests, weaken ownership invariants or change source controller state. ORCH-AUTH-01 r2 approval is settled but unactivated.

## Baseline Evidence

C3 c9675791714fa23554277496078263744da8b26c passed its local host/OCI/evidence audit and was pushed. Hosted run 34010283121 has Linux controller failure: 808/809 tests pass; test-ownership.test.ts expects owner file counts 83/1/2/1 and 87 total instead of actual 84/4/2/1 and 91 total. The additions since e590e38 are qualification-input.test.ts plus qualification-host-discovery, qualification-vm-lifecycle and qualification-docker-host .test.mjs files. Both adopter jobs and the unchanged Docker fixture passed; retain the complete final cohort separately. C4 uncommitted snapshots/inspector work is paused in the original checkout and excluded from this isolated repair.

## Steps

1. Complete: reproduced the single failing current-catalogue assertion in artifacts/ci-inventory-repair/baseline-focused; exit 1 and no PASS receipt.
2. Complete: updated only the explicit expected current inventory to 84/4/2/1 and 91 total, with the four qualification additions explained. All classification/discovery rejection tests and original gates remain.
3. Complete locally: the differently cased Windows temporary root reproduced all 25 fixture setup refusals, and canonicalizing only that fixture passed all 42 qualification-input/container-artifacts/ownership cases. Five invariants and final static checks pass; all production guards remain unchanged. Retained evidence is sealed and independently audited.
4. In progress: scoped commit, clean post-commit focused/retained audits and new exact hosted cohort. Preserve and integrate/resume C4 while tracking that separate cohort; do not relabel the original C3 failures.

## Acceptance Criteria

The focused baseline reaches the actual stale-count assertion. The corrected current-catalogue test passes all existing ownership rejection cases with explicit expected counts and exactly 91 declared/discovered files. The aliased Windows temporary root reproduces the original stable-realpath refusal, then the fixture reaches all 25 real qualification-input cases after canonicalization. No production identity check is relaxed. All applicable local/hosted checks pass at a new identified commit; old C3 failed CI remains failed. No source state, frozen authority, package script or CI policy changes.

## Verification

Exact Node 24.18.0/pnpm 11.15.1. Receipt-owning focused test-ownership.test.ts, real ownership invariant, typecheck/lint/format and applicable controller suite/CI. Preserve raw original hosted report, archive metadata/hash and new results. Full readiness remains incomplete and root production build remains NOT_READY.

## Risks and Recovery

Do not turn a growing mutable repository-inventory fixture into an immutable 87-file ceiling or weaken the actual ownership invariant. Repair in .tools/wp6e-ci-inventory-repair on codex/wp6e-ci-inventory-repair, based exactly on C3, while preserving paused C4 changes and the roadmap in the original checkout. Ordinary verified source-control recovery only.

## Progress and Evidence

Original failed Linux report is retained in the primary checkout at artifacts/wp6e-continuation-20260906/hosted-c3-linux-extracted/orchestrator/orchestrator-report.json. The hosted ZIP hash is 8e580150f9fd2b80502d50251fd9c0218df02400a1ec45eea5d20d6274d6beab. No failure is relabeled passing.

The final Windows job 101424779471 failed 26/809: the stale count plus all 25 qualification-input tests during fixture setup at the production stable-realpath guard. Its ZIP was independently hashed to the provider's digest 2d6b1c99a03bf60d6dbfd85e0766c627f713c0c7138545d40c19470119ff537f; entries were inspected before reading the raw report. The fixture omitted realpath normalization used by existing container-artifacts fixtures. The original C3 cohort has two failed controller jobs and three successful adopter/OCI jobs. The local inventory-only baseline/fix, five invariants and static checks pass as scoped; invariant duration was 61,233 ms, above the unchanged advisory warm target, without any performance claim.

## Next Action

Commit the two verified fixture repairs and their retained evidence, run clean post-commit checks and push the new identified candidate for all five protected jobs. Integrate without discarding paused C4 changes, then continue C4 and the full authorized WP6e continuation while retaining the hosted outcomes. Readiness and the remaining candidate obligations are not complete.
