# ORCH-AUTH-01 r2 — revised authority proposal

**Status: proposed, not approved or activated.** This revision incorporates the user's agreement on verification cost and approval scope. It is a proposal-only change against source e590e38. The [original r1 review package](../ORCH-AUTH-01/README.md) and all its evidence remain untouched.

## Two refinements

- **Candidate and release cadence:** keep invariants, static/build checks and all four owner partitions for a candidate, with explicit workflow cases for affected behavior. Do not automatically dispatch the complete Windows/Linux qualification matrix for every candidate. Full fresh qualification stays mandatory at the literal no-argument source gate and every operation requiring exact readiness.
- **Narrow normative approval:** freeze outcomes, public contracts, claim/cadence limits and safety/transition boundaries. Implementation plans, command wiring, coordinator notes and tooling have a separate package integrity digest. Conforming changes to them require an updated audit, without another approval of unchanged authority.

The final gate still requires all twelve outcomes, eight domains, sixteen negative families and every variant on both native platforms, two independent clean builds per platform, all existing bounds and separate live human acceptance. Candidate/supporting evidence cannot authorize integration or reconciliation when exact closure is required.

## Review

1. [Revised goal](proposed/PROJECT_GOAL.md), [acceptance](proposed/evals/ACCEPTANCE.md) and [machine manifest](proposed/evals/acceptance-manifest.json).
2. [Cadence guide](VERIFICATION-CADENCE.md): routine checks, explicit full gates and dispatch-cost accounting.
3. [Approval boundary](APPROVAL-SCOPE.md), [normative file allowlist](approval-scope.json) and [transition safeguards](TRANSITION-CONTRACT.md).
4. [Legacy mapping](ACCEPTANCE-MAPPING.md), [every original manifest leaf](acceptance-mapping.json) and [exact active-to-proposed diff](exact-authority.diff).
5. Advisory [check design](CHECK-DESIGN.md), [qualification protocol](QUALIFICATION-PROTOCOL.md), [fixture design](QUALIFICATION-FIXTURES.md) and [migration sequence](MIGRATION.md).
6. [Revision notes](REVISION-NOTES.md), [execution plan](EXECUTION-PLAN.md), [runtime assessment](RUNTIME.md), [review digests](review-manifest.json) and [latest document audit](proposal-audit.json).

The first approved implementation slice should establish runtime/isolation feasibility and one real public workflow plus rejection and evidence handoff. Establish native Windows provider feasibility early; expand qualification coverage in subsequent bounded increments.

The existing five protected CI jobs remain unchanged and expensive. This revision avoids automatically adding the proposed full release matrix to routine candidates; it claims no measured cost reduction and does not alter WP6f.

## Approval and reproduction

Approval must name ORCH-AUTH-01 and the normative contentDigest in review-manifest.json. The packageIntegrityDigest identifies all inspected advisory/reference/tool files separately. Agreement with these refinements is not exact-digest authority approval.

The original 24 legacy IDs, 87 manifest leaves and all source protected-file bytes remain auditable. No active authority, lock, source code, script, WP6 plan/log/evidence, commissioned generation or controller state has changed. The proposed AGENTS copy is inert review data.

Using exact Node 24.18.0/pnpm 11.15.1: author-proposal.mjs refreshes only derived proposed-lock hashes and the exact diff. verify-proposal.ts --seal creates a new review target; plain verify-proposal.ts rechecks it. A conforming advisory-only edit can use --refresh-package: that command refuses any changed normative digest. Each run retains its own receipt directory. The audit validates document integrity and finite consistency cases, not implementation, runtime qualification or readiness.

WP6e remains blocked at its original recorded gates. This proposal does not retroactively close it or authorize performance interpretation.

