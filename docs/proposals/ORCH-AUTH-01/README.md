# ORCH-AUTH-01 — source product authority revision for review

**Status: proposed, not approved or activated.** Prepared against source commit `e590e38c32de2b5baa7423f66bbd8a0230b61839`. This package defines the product as the reusable milestone orchestrator/template and asks for a new explicitly scoped source authority epoch. It does not close WP6e or advance WP6f.

## Read in this order

1. [Exact proposed product goal](proposed/PROJECT_GOAL.md): intended product, required systems, safeguards and claim boundaries.
2. [Exact proposed acceptance prose](proposed/evals/ACCEPTANCE.md) and [machine-readable manifest](proposed/evals/acceptance-manifest.json): twelve machine outcomes, eight orchestration domains, sixteen negative families, fixed metrics and source machine/human gates.
3. [Complete old-to-new mapping](ACCEPTANCE-MAPPING.md), with [all legacy JSON leaves](acceptance-mapping.json): every original ID, number, freeze class and aggregation rule has an explicit disposition. Original authority/lock bytes are under [baseline](baseline/PROJECT_GOAL.md).
4. [Checks and claim design](CHECK-DESIGN.md), [qualification protocol](QUALIFICATION-PROTOCOL.md) and [exact bounded fixture outcomes](QUALIFICATION-FIXTURES.md): real consumers, command/stage contract, qualification topology, native-platform obligations and costs.
5. [Authority/commissioning migration](MIGRATION.md): approval, strict-ancestor snapshots, compatible readers, coherent recoverable activation, audit continuity and state fencing.
6. [Exact unified authority/supporting-text diff](exact-authority.diff), [proposed AGENTS](proposed/AGENTS.md), [proposed CONTRACT](proposed/CONTRACT.md), [proposed lock v2](proposed/evals/immutable-contract-lock.json), and [additive command contract](proposed/source-command-contract.json).
7. [Runtime assessment](RUNTIME.md): an existing Docker Engine is responding in Ubuntu/WSL; no installation has been made or is currently necessary for local Linux qualification.

## Decisions this proposal makes

- The source ships a reproducible runtime/template bundle. Its build must be consumed from an independent extraction through actual generation and commissioning; unit/typecheck success alone is insufficient.
- All eight production orchestration domains are required: planning, verification/evidence, independent review/integration, canonical state/leases, interrupted recovery, external reconciliation, approved retention/cleanup, and real containment. All sixteen failure families and their publication variants must reach the intended boundaries on both supported native controller platforms.
- Generated bootstrap still exercises real build, Node/replay/Worker behavior, persistence and Chromium. Its own bootstrap result remains separate and completion-ineligible for a finished product.
- The old source game/bot/seed/frame-time requirements are explicitly retired or replaced with new source IDs. They are not renamed as developer-agent checks or declared passed. The original 4/0.99/16.6/13-of-16/16-of-20 values and their provisional flags remain preserved in the old epoch. There is no source field-reliability estimate or hidden-game generalization claim.
- Source machine readiness and human acceptance get explicit ORCH-scoped gates. Live configured Planner/Worker/Reviewer use and operator review remain required after deterministic machine qualification. Every downstream adopter keeps its own authority and completion gates.
- Existing isolation, protected roots, evidence integrity, independent review, generation/lease consistency, intent-before-mutation, recovery, retention approval and fail-closed integration remain mandatory. No candidate gets a Docker socket or host credentials.

## Migration and implementation tradeoffs

This requires a real source-only schema/stage dispatcher, scoped result consumers and qualification workflows; updating four documents and a lock is insufficient. The proposed lock v2 preserves the original epoch. An inert approved snapshot is committed first; a later atomic/recoverable operation activates matching authority, configuration and commissioning at a descendant commit. The current schedule-only amendment is intentionally insufficient. Missing new stages remain non-passing until implemented.

The required workflow/native-platform matrix adds execution cost and may require a disposable native Windows qualification host with a real Linux-container provider. Existing Windows unit CI and WSL/Linux runs cannot stand in for that workflow proof. The small target fixture has a fully specified real message-file product and isolated scope; harness support must not grant it privileged integration shortcuts. Release/runtime packaging preserves the supported TS/tsx layout rather than introducing npm publishing or a compiled SDK product.

Source qualifier hosts and inner candidate containers have separate recorded identities. Qualification runs on an authorized disposable host/VM/CI environment; it must not expose an ordinary workstation or fake sandbox attestations. Cross-platform release evidence is collected fresh with a shared qualification identity and externally checked job/artifact provenance. Live human acceptance can wait for credentials/service access; deterministic fixtures cannot satisfy it.

WP6e/WP6f evidence and scope remain unchanged at their recorded identities. New-epoch source success cannot retroactively close their old gates. A future WP6e continuation would need its own explicit treatment of the new provenance boundary; it is not silently included in this revision's approval.

## What approval would authorize

Approval must name `ORCH-AUTH-01` and the exact content digest in [review-manifest.json](review-manifest.json). That digest binds all normative proposal files, exact replacement copies, mapping and migration design. No approval record is fabricated or included as an accomplished action.

Approval would authorize the exact authority/supporting-text revision and its staged, independently reviewed implementation/migration. Routine implementation details may be chosen within these outcomes. A changed outcome, threshold, claim boundary, retired requirement, migration trust rule or normative proposal byte requires renewed review of a new digest. Runtime environment qualification is separate; the existing WSL engine can be tested without changing frozen authority.

Approval would not authorize bypassing tests, waiving WP6e gates, performance interpretation, changing dependency/model policy, erasing historical evidence, automatic controller-state adoption, or asserting readiness. The old active authority and commissioned generation remain untouched until approval and compatible migration machinery exist.

## Verification of this package

[Proposal audit](proposal-audit.json) and the command-owned receipt under [audit/result.json](audit/result.json) record document/hash/mapping checks only. They are not source readiness, authority approval or implementation acceptance. The audit checks every legacy manifest leaf and ID, all new references/stages/metrics, unchanged protected baseline files and exact new lock hashes. It also verifies that an approval record has not been created. The active WP6e plan and logs remain unchanged.
