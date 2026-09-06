# Milestone Orchestrator and Template

## 1. Purpose and Completion Contract

This repository's product is a reusable milestone orchestrator and project-template distribution. Its users are maintainers who commission a repository, request a bounded change, inspect verification and independent review, recover interrupted operations, and integrate only an eligible exact candidate.

The source acceptance contract is `milestone-loop-orchestrator-source.v1`, with claim scope `orchestrator-template`. `evals/acceptance-manifest.json` and `evals/ACCEPTANCE.md` define all required outcomes. `ORCH-AUTONOMOUS-READINESS-01` means the exact source release has passed its machine qualification and is ready for human acceptance. Product acceptance additionally requires `ORCH-HUMAN-ACCEPT-01`. No plan, log, unit-test count, bootstrap pass, or narrower verification command substitutes for either gate.

There are three independent claim scopes. Source qualification evaluates this distribution and controller. A generated adopter's bootstrap evaluates that adopter's technical scaffold under its own authority. Downstream product completion evaluates that adopter's implemented product, including any domain, bot, seed, visual, performance, persistence, and human requirements its authority declares. Evidence may be linked across scopes but may not inherit a passing gate or change its owner.

## 2. Product Vision

Deliver a portable, inspectable development loop with truthful diagnostics and a recoverable lifecycle. The normal path is definition -> generation -> installation -> commissioning -> planning -> isolated implementation -> candidate verification -> independent review -> fast-forward integration -> durable state publication -> bounded cleanup. External changes use explicit reconciliation. Evidence retention uses preview and recorded approval.

The product must make failures actionable without concealing them. A maintainer must be able to resume from repository records and validated evidence without conversation history. Product identity is the reusable controller/template; no downstream application is required in this source repository.

## 3. Required Systems and Content Breadth

Qualification must exercise all eight orchestration domains: proposal/scope validation; candidate verification and evidence; independent review and integration; canonical state/lease persistence; interrupted-operation recovery; external reconciliation; approved retention/cleanup; and execution containment. Generation/bootstrap compatibility, reproducible distribution build, cross-platform canonical parity, resource bounds, and operator acceptance are additional required outcomes.

Every domain has a real successful public workflow and a deliberately failing boundary case. The acceptance manifest enumerates sixteen required failure scenarios. All must produce the expected disposition on both supported controller platforms. A test of a validator alone cannot replace an execution of the production boundary whose behavior is claimed. No existing regression identity may disappear as a side effect of this authority revision.

## 4. Technical Architecture and Toolchain

Retain the current Node.js/TypeScript/ES-module workspace and exact Node `24.18.0`, pnpm `11.15.1`, TypeScript `5.9.3`, and Vitest `4.1.10` pins. Other package and model-policy pins remain governed by the committed lockfile and policy. This revision authorizes no dependency upgrade or model-policy change.

Supported controller qualification platforms are native Windows and Linux, with Windows Server 2022 and Ubuntu 24.04 as reference environments. Preserve the existing hosted lanes and add real workflow qualification on suitably isolated hosts. WSL 2 Ubuntu may provide local Linux execution; it does not substitute for native Windows qualification. Trusted candidate execution uses the existing Docker/OCI provider with a verified immutable image digest and its enforced filesystem, network, privilege, process, and resource policies. Candidate containers receive no Docker socket or host credentials. Local diagnostic execution is explicitly ineligible for integration.

Keep production rules shared by public commands and acceptance drivers. Source state determinism concerns canonical controller transitions and recovery. The generated bootstrap retains its shared Node/replay/Chromium Worker kernel, persistence, and rendered browser evidence. Downstream simulation rules remain the downstream product's responsibility.

## 5. Autonomous Development Mandate

Use one bounded, independently reviewable increment at a time. Preserve Planner, Worker, and Reviewer separation, protected trust roots, worker path limits, isolated standalone candidate clones, exact commit/tree identity fencing, command-owned receipts, artifact hashes, independent structured review, and fast-forward-only integration. A worker cannot modify its verifier/controller/authority or supply its own integration approval.

Canonical state publication and leases must resist concurrent writers. Operation intents must precede filesystem/ref mutations and survive crashes. Recovery may adopt only the recorded exact prior/new state; foreign changes remain preserved and diagnosed. Retention and cleanup stay contained and approval-bound. External reconciliation preserves old state bytes and continuous commit history and requires fresh exact verification and independent review before adoption.

## 6. Determinism, Validation, and Seeds

Use fixed public workflow inputs and actual subprocess/Git/filesystem/container boundaries for source qualification. Canonical semantic traces must agree across repeated runs and platforms; volatile telemetry is retained separately and cannot authorize transitions. Inputs and outputs identify both the source controller candidate and each fixture candidate.

Deterministic role-transport fixtures may supply proposals, patches and independently evaluated review decisions, but may not manufacture controller state, passing receipts, the controller's acceptance of a review, sandbox attestations, or integrated refs. Their use is explicitly recorded and proves controller mechanics only. Human acceptance additionally exercises the real configured agent transport with independent roles.

This source contract has no product bot benchmark or random/hidden product seed success gate. The old thresholds are retired from source applicability by this explicit human revision, not declared passed or equivalent to workflow checks. Existing adopter reference authorities and hidden-seed custody controls remain unchanged. `evals/HIDDEN_VALIDATION_PROTOCOL.md` defines source handling of downstream validation requests without authorizing their execution.

## 7. Completion Metrics and One-Time Calibration

All source metrics are immutable: all eight domains and twelve machine requirements covered; all sixteen failure scenarios correct on each supported platform; zero integrity violations; two independent clean distribution builds per platform with equal portable payload inventories; and complete enforcement of the existing finite execution/resource limits. Finite qualification does not establish a 99% field reliability estimate or a general agent-success rate.

No source threshold is provisional and this revision does not consume CAL-1. The original epoch's calibration record and zero-use state are preserved byte-for-byte. Generated adopters retain the calibration policy in their own authority. Any source threshold or interpretation change requires another explicit human revision.

## 8. Autonomous Readiness Gate and Human Verification

Iteration and candidate checks are supporting, completion-ineligible evidence. Candidate verification retains invariants, static/build checks and all four owner partitions, adding explicit public-workflow cases for affected boundaries without automatically dispatching full native-platform qualification. One ordinary build creates and exercises one payload; repeated/cross-platform build qualification belongs to the full gate. These rules do not enable scope suppression, reuse closure evidence, or authorize integration/reconciliation where exact readiness is required. The manifest fixes this cadence.

Only a clean committed exact source candidate, default `readiness` profile, matching authority epoch, literal no-argument `pnpm verify`, complete required stages, valid command-owned evidence, attested trusted execution, and both supported-platform qualifications can support `ORCH-AUTONOMOUS-READINESS-01`. All required outcomes aggregate with logical AND; no compensation, skipped checks, unavailable stages, stale receipts, or focused/profile overrides count as passing completion.

`ORCH-HUMAN-ACCEPT-01` requires an operator to use the released artifact, run the real configured agent workflow in a disposable adopter, inspect a successful integration and a rejected/stale candidate, resume an interrupted operation, and approve the resulting evidence and diagnostics. A model cannot mark this gate passed on the human's behalf. Until then the source is machine-qualified only. A human acceptance defect returns to the normal repair loop.

The source's permanent readiness marker remains present and its history remains checked. Generated bootstrap success does not grant source readiness, autonomous integration, or downstream completion. Source machine/human gates do not grant any downstream product gate.

## 9. Explicit Non-Goals

Do not implement an unrelated downstream product, redefine product bots as developer agents, reinterpret game/frame-time thresholds as controller timings, claim field reliability from a finite fixture corpus, or promise arbitrary application correctness. Do not cache exact completion evidence, enable scope suppression without its separate graduation, replace standalone clones with weaker isolation, merge worker and reviewer roles, or relax trusted execution.

This authority revision is separate from WP6e/WP6f. Their archived inputs, baseline commitments, evidence, scopes, and incomplete dispositions remain unchanged. New-epoch qualification cannot retroactively complete WP6e, validate a historical optimization, or decide WP6f's keep/revert question. Any later continuation must explicitly address its original remaining gates and changed provenance without relabeling old evidence.

## 10. Authority and Change Control

These four source authority documents and their approved epoch are frozen. Only explicit human approval of the exact normative content digest can authorize a new epoch. The approval inventory fixes outcomes, public contracts, cadence/claim limits, safety boundaries and authority-transition safeguards. Advisory implementation notes, command wiring and reproduction tools have a separate audited package integrity digest. Conforming implementation changes do not require renewed authority approval; any normative or semantic contract/trust change does. An advisory file cannot override or reclassify a frozen requirement. A plan, calibration, schedule amendment, filename change, or regenerated hash cannot do so.

The versioned immutable lock preserves the original lock and baseline hashes and binds the new epoch's exact bytes. Its authority snapshot must be anchored in a real strict-ancestor Git commit. A separate approval-bound, recoverable authority/commissioning migration records old/new hashes, old/new baseline commits, exact approved scope, ledger linkage, and every generated file. Pending or mixed generations block consumers. Original commissioning/amendment history is preserved, never reset. Human approval authorizes the named revision only; it cannot be inferred from repository prose or invented by the agent.
