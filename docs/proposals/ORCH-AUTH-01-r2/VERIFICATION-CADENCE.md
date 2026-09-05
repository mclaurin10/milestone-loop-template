# Verification cadence guide

This is an implementation guide. The authoritative cadence and claim limits are in proposed/evals/acceptance-manifest.json and proposed/evals/ACCEPTANCE.md. It does not change the active repository.

| Purpose | Work | Permitted claim |
| --- | --- | --- |
| Iteration | Canonical invariants and explicit focused checks for the increment. | Supporting development evidence only. |
| Candidate | Invariants first; dependency, format, lint, architecture and type checks; one real payload build with bounded executable smoke; each of the four owner partitions once; explicit focused public-workflow cases for affected boundaries. | Exact candidate checks passed for the declared coverage and actual platform. Completion-ineligible. |
| Full milestone / periodic / release qualification | Fresh literal no-argument source verification, all twelve outcomes, eight domains, all sixteen negative families and every variant on both native platforms, repeated builds, full adopter compatibility, containment, parity and bounds. | Source machine readiness only after all independent checks pass. |
| Human acceptance | Live configured roles and explicit operator review of the released artifact. | The separate human gate for that release. |

An ordinary candidate does not automatically run all workflow families, cross-platform parity, both complete adopter definitions, repeated clean builds, or the full containment/termination attack corpus. The existing owner partitions may already exercise such regression cases; this proposal does not suppress them. Explicit focused checks are additional production-boundary evidence for changed behavior, not a replacement for the mandatory floor.

The plan records changed paths, affected boundaries, selected cases, actual platform/provider and why each added producer is needed. If affected-boundary selection is unresolved, fail broad over the relevant supporting cases or mark the candidate unsupported; do not silently omit necessary evidence or change its claim. Source scope suppression remains disabled.

Full qualification runs when explicitly requested, through milestone/periodic exact closure, or before an operation whose unchanged rules require full exact readiness. A candidate PASS cannot authorize such integration or reconciliation. This cadence provides no bypass of their current closure requirement. Batch reviewable development increments where the existing lifecycle permits it; do not claim every integration becomes cheap.

## Execution costs

Before dispatch, enumerate producer jobs, command invocations, cases, platform and purpose. Report observed elapsed time/resource use and failures afterward. Distinct mandatory observations still execute independently. Do not launch a producer twice merely because two consuming stages inspect its same immutable report within one fresh invocation. Candidate receipts remain unusable as fresh closure results; previous same-commit qualification is not a cache.

One local payload build and bounded consumer smoke are the ordinary build action. Full release qualification performs two independent clean builds on each platform and the complete detached install/generate/commission consumption proof. Ordinary build receipts cannot claim that full outcome.

The five protected CI jobs and existing timeouts are unchanged. This is a prospective dispatch/cadence design, not a benchmark result or an authorization to alter WP6f. No recurring automation or new default per-commit release trigger is proposed.

