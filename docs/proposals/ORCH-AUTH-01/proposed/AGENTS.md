# Autonomous Agent Contract

## Authority

Read PROJECT_GOAL.md before planning or changing the repository. In descending order, follow the frozen goal and original immutable acceptance suite; this contract; the active executable plan; and implementation documentation. Plans and logs never amend authority. Preserve the higher authority and record any conflict.

The applicable product scope, non-goals, stack, required rule separation, determinism/persistence/replay, role/action restrictions, completion categories and breadth, thresholds, calibration policy, acceptance tests, and machine/human gates are immutable except through an explicit human revision. Scope is determined by the commissioned authority, never by a project name or a convenient profile. Source orchestrator/template qualification, generated-adopter bootstrap, and downstream product completion are distinct claims. Source developer agents are not substitutes for downstream gameplay bots.

Legacy immutable-contract-lock v1 and its baseline/active hashes retain their existing rules, including the one permitted CAL-1 transition confined to explicitly provisional fields after semantic equivalence checks. Baseline hashes never change during calibration. The source-only v2 lock identifies a human-approved epoch, preserves the original lock/baselines and calibration state, and pins each new authority byte to its approved strict-ancestor snapshot. A mismatch blocks operation; it never authorizes regeneration, rebaselining, ledger deletion or a weaker interpretation. A new source epoch requires exact human approval, a recorded cross-epoch migration and recovery-safe coordinated commissioning. Historical tests and evidence stay bound to their original epochs.

## Verification Profiles and Bootstrap Boundary

The only profiles remain bootstrap and readiness. Package-default no-argument pnpm verify selects the authority-anchored contract and ordered stage registry. Bootstrap proves the generated adopter's technical scaffold, shared deterministic kernel, minimal persistence/replay, production build and real browser evidence; it never proves autonomous readiness or downstream product completion. Bootstrap remains a scope ceiling and can end only at a clean committed tree with passing no-argument verification and all owned receipts.

The permanent readiness transition marker and its Git history remain mandatory and cannot be deleted or rolled back to obtain a green result. For an adopter, readiness exercises that adopter's frozen downstream contract and retains simulation/rendering separation, user-action-only bots and every seed/breadth/human gate its authority requires. For the source contract milestone-loop-orchestrator-source.v1, readiness exercises the frozen orchestration/template workflow registry; ORCH-AUTONOMOUS-READINESS-01 and ORCH-HUMAN-ACCEPT-01 are source-scoped and never inherit a generated bootstrap or downstream PASS. No new profile is introduced.

Completion requires the exact clean committed candidate, default profile, matching authority/claim scope, fresh full verification, independently validated artifacts and required platform/provider evidence. Focused, dirty, unavailable, skipped, stale, diagnostic, cross-scope or completion-ineligible results cannot support it. Every successful child verification command writes its owned receipt; exit zero or a self-asserted PASS is insufficient. Missing stages stay non-passing until genuinely implemented. No-op scripts or unit results may substitute for public workflow evidence.

## Operating Loop

Run this loop until the readiness gate passes:

1. **Inspect:** Read the goal, active plan, logs, working tree, relevant code, tests, and current evidence. Reproduce the highest-impact known gap.
2. **Plan:** Select one cohesive, testable increment. Update `.agent/current-exec-plan.md` with scope, acceptance, risks, and commands before substantial implementation.
3. **Implement:** Make the smallest complete change that advances the plan. Keep the applicable production rules shared by public CLI/controller paths; generated or downstream simulation rules remain shared by rendered, headless, bot, save/load, and replay paths.
4. **Test:** Add or update tests, then run focused checks and the applicable broader suite. Never delete, bypass, dilute, or condition away a failure.
5. **Evaluate:** Inspect behavior and evidence, including rendered output when the change is visual or interactive. Compare results with the goal and plan, not merely with test exit codes.
6. **Record:** Update the plan, `docs/autonomy-log.md`, and `docs/decision-log.md` when a durable decision was made. Record commands, outcomes, artifacts, and known gaps accurately.
7. **Commit:** Commit only a cohesive, verified increment. Then repeat from inspection.

Improve the harness when launching, observing, replaying, benchmarking, capturing, or diagnosing becomes a recurring obstacle.

## Verification and Evidence

Completion claims require reproducible evidence from the exact working-tree state being claimed. Evidence must identify the command or procedure, relevant seed/configuration, result, and artifact path where applicable.

- Run focused tests while iterating and all applicable repository checks before committing.
- Run the full verification suite at milestones and before any readiness claim.
- Verify visual or interaction changes in supported desktop Chromium with screenshots, traces, video, or an equally inspectable artifact.
- Verify simulation changes under deterministic headless execution and add regression coverage for discovered defects.
- Treat skipped, flaky, timed-out, or unavailable checks as unverified, not passing.
- Never fabricate commands, results, telemetry, screenshots, hidden-seed outcomes, or human feedback.

Only declare work complete when its stated acceptance criteria have been observed. Autonomous readiness additionally requires every gate in the frozen goal; passing a subset is not completion.

## Git and Working-Tree Discipline

Inspect `git status` before editing and before committing. Preserve unrelated user changes. Do not discard, overwrite, reformat, or include them in a commit. Avoid destructive recovery when ordinary source-control recovery is sufficient.

Each commit must be narrowly scoped, explain the outcome, include its tests and documentation, and leave the tree buildable. Do not commit generated noise, credentials, caches, or unlicensed assets. Do not rewrite published history or force-push without explicit human instruction. A readiness candidate must have a clean tree and a reproducible commit/tag identity.

## Failures and Regressions

Stop feature expansion when a regression breaks an immutable test, corrupts state, causes replay divergence, crashes, or invalidates a previously verified requirement. Reproduce it, preserve diagnostic evidence, add a failing regression test when feasible, fix the root cause, and rerun affected broader checks. Revert the cohesive offending change if a prompt safe fix is unavailable. Record residual risk; never normalize, hide, or relabel a regression as expected behavior.

Failed human verification becomes an acceptance defect and returns the project to the same autonomous loop.

## Decision and Escalation Boundary

The agent decides autonomously when a choice is compatible with the frozen goal, evidence can evaluate it, and it is reversible through normal source control. This includes implementation structure, algorithms, tools, sequencing, balance, pacing, UX details, assets with verified licenses, and architecture details not already frozen. Record durable or costly-to-reverse choices in `docs/decision-log.md`; do not seek routine approval.

Escalate only when progress actually requires:

- unavailable credentials or an unavailable external service;
- mutually contradictory frozen requirements or immutable tests;
- a genuinely irreversible product decision that changes the product's identity; or
- a credible risk of destructive loss outside normal source-control recovery.

Before escalation, exhaust safe local alternatives and present the blocker, evidence, attempted alternatives, and the smallest decision needed. Human preference, uncertainty, difficult engineering, and routine prioritization are not escalation grounds.

## Prohibited Conduct

Never silently reduce scope, weaken or remove tests, change success definitions, create privileged bot shortcuts, special-case benchmarks, diverge headless and rendered rules, suppress errors, fabricate evidence, or declare unverified work complete. Never use a plan, decision record, calibration, or implementation shortcut to amend the frozen goal. If an increment cannot meet its acceptance criteria, leave it explicitly incomplete and continue the loop or escalate only under the narrow rules above.

## Resume Without Conversation History

A future agent must be able to resume from the repository alone. On entry:

1. Read `PROJECT_GOAL.md`, this file, `.agent/PLANS.md`, and `.agent/current-exec-plan.md`.
2. Read the latest entries in `docs/autonomy-log.md` and `docs/decision-log.md` plus relevant architecture/evidence records.
3. Inspect `git status`, recent commits, tests, and artifacts; do not assume logged claims are current.
4. Reproduce the active plan's last verification or first unresolved gap.
5. Correct stale plan state, then continue the operating loop from the first incomplete acceptance criterion.

Conversation history is optional context, never project state. Material state, decisions, commands, results, and next actions belong in the repository.
