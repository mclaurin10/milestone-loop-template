# Current Execution Plan

**Status:** ORCH-AUTH-01-B complete for contained Linux planning and evidence handoff; ORCH-AUTH-01-C queued. **Updated:** 2026-09-05. **Owner:** maintainer-authorized source transition.

## Objective

Qualify the public planning workflow and its first authenticated producer-to-consumer evidence handoff. Run the production CLI dispatch, controller initialization, planner validation, policy decision and state persistence inside the qualified Linux OCI executor. A deterministic role transport supplies proposals only. Observe one accepted tooling proposal and one protected-path proposal rejected at the actual policy boundary. Deliver their real receipts and artifacts to a second contained command through a bounded, explicitly read-only input. Independently audit both commands and their bindings outside the containers.

Planning requires no Docker control plane, so its controller can run inside the restricted container. This uses the approved protocol's contained-workflow route. It does not qualify a general disposable host for controllers that launch candidate containers. That requirement remains open before run/integration workflows. The immediate machine consumer is the contained planning-evidence inspector.

## Goal Constraints

ORCH-AUTH-01 r2 is approved at normative digest 53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108, recorded in evals/authority-revisions/ORCH-AUTH-01/approval.json. Preserve the sealed proposal, live root authority, commissioned history, original acceptance and active locks. Approval is not source activation or state adoption; the recoverable migration remains separate implementation work.

Preserve all twelve outcomes, eight domains, sixteen complete failure families on native Windows and Linux, two independent clean builds per platform, exact pins/bounds, and the separate live human gate. This evidence is candidate-support only and completion-ineligible. Existing five protected CI jobs and routine candidate verification cadence remain unchanged.

Do not initialize state in the source checkout. Disposable copies must initialize through the production controller. The transport may supply role responses, never controller state, policy decisions, receipts, provider identity or integration results. The ordinary CLI retains its real SDK transport by default.

## Baseline Evidence

- Entry commit e01298be5cc76ad33f66a73870e5b6e9d1f661ef, tree 9752f969dd921ca38f60cd3d8d011c90b0ab564e. A's exact source, six real OCI cases and independent audits are recorded in docs/runtime-qualification/ORCH-AUTH-01-A/README.md and that commit's plan/logs.
- Fresh A closeout passed at artifacts/orch-auth-01-b/entry-closeout: twelve supporting receipts, 23 protected baseline files, 24 focused tests and retained raw artifacts validated. Source production build remains NOT_READY; completion eligibility remains false.
- Exact Linux runtime is under /home/duncan/oa1-CKn8x9: Node 24.18.0, pnpm 11.15.1, Docker 29.1.3 on WSL Linux. Reuse the tracked-recipe immutable image only after production validation. WSL is Linux evidence.
- Native Windows read-only discovery found ssh.exe and wsl.exe; Docker, Hyper-V cmdlets, QEMU and VirtualBox were absent from PATH. No supported native Windows OCI route is established. A shell shim cannot prove parity. No host configuration changed.
- CommandRunnerOptions has no typed evidence-input boundary; the executor admits exactly four mounts. The CLI dispatch selects the SDK gateway implicitly. Extend these boundaries explicitly while preserving default behavior and containment.
- Entry status contains only the untracked user roadmap, SHA256 53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1. Exclude it from edits/commits. Source refs/milestone-loop/ remain absent.

## Steps

1. Inspect handoff, public planning path, transport seam, isolation and native Windows feasibility. Complete.
2. Implement a typed bounded qualification input and explicit read-only OCI mount with trusted outer expectations separate from delivered artifacts. Expose existing CLI dispatch for a deterministic qualification harness without changing ordinary defaults. Complete.
3. Exercise accepted and protected-path planning through that dispatch in fresh contained copies. Complete: one admitted proposal and two actual protected-policy refusals ending in PLANNER_POLICY_LIMIT. No workers or candidate workspaces; target and protected bytes unchanged.
4. Bind actual producer/container identity and fresh run/nonce to source, authority, fixture, purpose and both cases. Complete: a separate contained inspector owned its receipt and observed EROFS on an input write; outer and transferred-archive audits passed against 104 files, real mounts and cleanup.
5. Run focused regressions, applicable static/invariant checks and the complete existing OCI matrix. Complete: 94 tests, all five invariant entries, typecheck/lint/format, and six real OCI cases. Root build remains NOT_READY. The curated closeout passed against the 430-file frozen source, eleven supporting receipts and all retained raw evidence. The cohesive commit containing this completed plan supplies its record identity.

## Acceptance Criteria

- The production planning CLI dispatch admits a schema-valid tooling proposal and persists it as ready. A separately initialized case receives a schema-valid proposal touching PROJECT_GOAL.md, exhausts actual bounded policy attempts and records PLANNER_POLICY_LIMIT with no accepted proposal. Earlier initialization/runtime failure does not count.
- Retain actual planner requests/responses, policy decisions, state and run summaries. The role fixture supplies no state/results. No worker executes; protected bytes and target commit stay unchanged; source state/private refs stay absent.
- The coordinator selects candidate-support, fresh run/nonce, both cases, exact source/authority/fixture and actual Linux producer/provider identity. It pins the envelope digest outside candidate-authored artifacts. No candidate-provided approval or self-attested provider is accepted.
- A second real contained command reads the bounded input at a fixed read-only destination, validates observations and producer-owned receipts, fails an attempted filesystem write, and owns its inspection receipt. The outer auditor independently repeats checks against its retained expectations. All owned containers/volumes are confirmed absent.
- Reject stale nonce, cross-purpose input, changed source/authority/fixture, forged producer/provider/coordinator identity, incomplete cases/platform, zero exit without receipt, altered files, links, traversal and exceeded bounds. Preserve default four-mount policy, resources, no socket/credentials/network and all current OCI case assertions.
- Reports retain completion.eligible=false. General Docker-controller host qualification, native Windows, run/integration breadth, production build declaration, migration/activation, full-source qualification and human acceptance remain incomplete.

## Verification

Use exact Node 24.18.0/pnpm 11.15.1. Run focused workflow/input/container regressions with command-owned evidence and independently validate receipts/artifacts. Run invariants, typecheck, lint and format. Observe root build honestly: its undeclared production build remains NOT_READY and does not authorize a substitute build.

Freeze a reconstructible staged tree in a standalone Linux clone before the real workflow and unchanged six-case OCI matrix. Retain source patch/identity, fixture digest, immutable image/input digest, selected commands, raw receipts/artifacts, envelope, outer expectations, mount inspection and cleanup. Preserve failed attempts and rerun affected checks after repairs. No candidate-tier floor, source readiness or full release matrix is claimed by these focused supporting checks.

## Risks and Recovery

The input must not become an arbitrary mount escape: one fixed destination, bounded regular files, no links, pinned digest and before/after validation. Missing provenance fails closed. Without input, the executor still expects its original four mounts.

The deterministic transport proves mechanics only. Reports must not claim resolved models, usage or live-agent quality. Only production code initializes disposable state. No direct state writes, anchor fabrication, privileged nested Docker or workstation controller fallback.

Preserve and repair actual workflow failures before expanding. Normal source-control recovery applies. Sealed authorities, historical records, commissioned ledger, package scripts and protected CI cannot be rewritten to obtain a pass.

## Progress and Evidence

2026-09-05: Entry audit reproduced successfully. The user authorized this increment with “Begin”; r2 approval remains sufficient. The production CLI and SDK adapter now support the bounded fixture without changing default transport. The input is fixed, bounded, pinned outside delivered files and validated before/after real execution. The local runner refuses it.

The final tested disposable commit is ae4e4fe5950d0a4711aadcf957bdb75479895911, tree 0e81e7d8236d34c6982f363c9fb6a2bf7d45f5de. Its genuine source bundle and patch are retained. Producer/consumer took 16,494/10,268 ms. Both cases, both owned receipts, EROFS and cleanup passed; the independent archive audit verified 104 files. Envelope digest is 2f4c885e6fda2bb0c0c1b97405f20d9280399b5682a81732d90a06758310a1d8. The unchanged six-case OCI matrix passed in 37,707 ms on that same source; the unchanged A auditor verified the 152-file combined runtime/matrix archive.

The first functional run also reached both cases but included still-open coordinator stdout in its inventory. Its archive-audit refusal is retained; the fixed inventory covers finalized roots, and a fresh producer/consumer run supplied the accepted evidence. Initial unused-variable lint and catalogue-order failures were corrected and rerun. All 94 focused tests, typecheck, lint, format and five invariant entries now pass with owned receipts. A one-byte mutation of the actual producer report was rejected without a PASS receipt. Root build remains exit 2 / NOT_READY with no receipt. Native Windows feasibility remains NOT_READY. No source activation, state adoption, candidate-tier floor, full source matrix, CI dispatch or live-agent result is claimed.

Reproduction, precise limits, costs, archive seals and retained diagnostics are documented in docs/runtime-qualification/ORCH-AUTH-01-B/README.md. The source checkout's later record-only changes are distinguished from the exact tested source by the closeout validator.

The final closeout independently passed from separately extracted curated archives. Its receipt/report are retained under docs/runtime-qualification/ORCH-AUTH-01-B/evidence/closeout/. It checks genuine bundled source history, all frozen executable blobs/modes, preserved authorities, 104 workflow files, the complete 152-file runtime/matrix inventory, eleven supporting receipts, 94 tests and the actual NOT_READY/refusal outcomes. The untracked roadmap remains excluded and source private controller refs remain absent.

## Next Action

Begin ORCH-AUTH-01-C with read-only inspection of authorized disposable hosts for controllers needing Docker and supported native Windows routes, then select one bounded executable increment before expanding to run/integration workflows. Compatible authority readers, bounded target/build, migration/activation, full qualification and human acceptance remain incomplete; no new approval of unchanged r2 is required. Reproduce B's curated closeout on entry and do not initialize or adopt source controller state.
