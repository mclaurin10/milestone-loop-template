# Autonomous Agent Contract

## Authority

Read `PROJECT_GOAL.md` before planning or changing the repository. It is the frozen product authority. In descending order, follow:

1. `PROJECT_GOAL.md` and the original immutable acceptance suite.
2. This contract.
3. The active executable plan in `.agent/current-exec-plan.md`.
4. Architecture notes, decision records, and other implementation documentation.

If authorities conflict, preserve the higher authority, record the conflict, and do not choose the easier interpretation. Plans and logs never amend the frozen goal.

The following are immutable: the frozen product scope and non-goals; the required stack and simulation/rendering separation; determinism, replay, save/load, and player-action-only bot rules; the completion categories and breadth minima; the one-time calibration constraints; the original acceptance tests; and the autonomous readiness and human-verification gates. Only an explicit human revision to the frozen goal may change them.

`evals/immutable-contract-lock.json` records baseline and active hashes for the frozen goal and original evaluation contract. A hash mismatch is a blocking contract defect, not permission to regenerate the lock. The goal and hidden protocol are human-revision-only. The acceptance prose/manifest active hashes may change without a human revision only once, when `CAL-1` closes, and only after an executable semantic diff proves that every change is confined to an explicitly provisional field, the complete calibration record exists, and every immutable ID/meaning/gate remains equal to the baseline. Baseline hashes never change during calibration. Until that transition is actually being implemented, all active hashes must equal their baselines.

## Verification Profiles and Bootstrap Boundary

`pnpm verify` selects the profile declared at `package.json` -> `milestoneLoop.verification.defaultProfile`. The only valid profiles are:

- `bootstrap`: proves the technical scaffold, shared deterministic smoke kernel, minimal persistence/replay, production build, and real Chromium rendering/evidence path. It is never evidence of game-system completion or autonomous readiness.
- `readiness`: exercises the complete frozen evaluation surface and is the only profile eligible to support `AUTONOMOUS-READINESS-01`.

The bootstrap profile exists so the first application increment can become truthfully green without fabricating future game, bot, seed, fault, or performance systems. It is also a strict scope ceiling: while `bootstrap` is the default, do not implement terrain, economy, lifts, trails, guests, staff, weather/snow/avalanche, construction, transport, utilities, town, environment, resort operations, content breadth, production bot policy, or other substantive feature.

Bootstrap ends only at a clean committed tree with a passing no-argument `pnpm verify` and the required structured receipts/artifacts. A later plan must change the default profile to `readiness` and add the permanent `.agent/readiness-profile-activated.json` transition marker before the first substantive game-system implementation. From that transition onward, missing readiness stages remain non-passing until genuinely implemented; the marker may not be deleted and the profile may not be changed back to obtain a green result. The verifier checks marker history to reject rollback. A bootstrap result, focused `--stage` result, explicit non-default profile run, dirty-tree run, or result whose `completion.eligible` is false cannot support a completion claim.

Every successful child verification command must write the command-owned evidence receipt required by `docs/verification.md`. Exit code zero without a valid receipt and independently verified artifacts is a failure. Do not use placeholder/no-op scripts or receipts that merely assert success without exercising the production boundary named by the stage.

## Operating Loop

Run this loop until the readiness gate passes:

1. **Inspect:** Read the goal, active plan, logs, working tree, relevant code, tests, and current evidence. Reproduce the highest-impact known gap.
2. **Plan:** Select one cohesive, testable increment. Update `.agent/current-exec-plan.md` with scope, acceptance, risks, and commands before substantial implementation.
3. **Implement:** Make the smallest complete change that advances the plan. Keep simulation rules shared by rendered, headless, bot, save/load, and replay paths.
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
- a genuinely irreversible product decision that changes the game's identity; or
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
