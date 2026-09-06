# Current Execution Plan

**Status:** ORCH-AUTH-01-C2 complete for diagnostic VM lifecycle; general host qualification remains open. **Updated:** 2026-09-06 UTC. **Owner:** maintainer-authorized source transition.

## Objective

Investigate one bounded disposable-host route: unprivileged task-local QEMU TCG with an Ubuntu guest under the inspected WSL Ubuntu transport. Prove signed input provenance, actual boot/observation, bounded lifetime and owned cleanup without a shared service, host filesystem share, guest network or Docker-controller dispatch. A receipt-owning lifecycle auditor is the immediate consumer of actual observations. Document native Windows options and their unresolved executor/provider prerequisites.

This is a lifecycle precursor, not general host qualification. No Docker installation, controller workflow, source state initialization/adoption, remote service change, Windows provider installation, authority migration or production build implementation is in scope.

## Goal Constraints

Approved r2 digest remains 53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108; durable approval is evals/authority-revisions/ORCH-AUTH-01/approval.json. Preserve sealed/live authorities, locks, original acceptance, commissioning/ledger, marker history, five protected CI jobs, scripts and existing gates. WSL supplies Linux evidence only. Windows Server 2022 reference qualification remains required and unresolved. Root build, general Docker-controller host qualification, native Windows workflows, authority activation, full source readiness and human acceptance remain incomplete. Preserve the untracked Implementation-ready improvement plan 8-5-26.txt outside commits. Do not use codex.lab's unintended LXD installation as authorization or alter shared package/service state.

## Baseline Evidence

- Entry HEAD a649611ee7be1834b915c377b93d7d71c02a7028; only the roadmap is untracked, SHA256 53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1. Source private refs are absent.
- Read PROJECT_GOAL.md, AGENTS.md, .agent/PLANS.md, C1 plan/handoff and newest autonomy/decision logs. The active placeholder authority remains unchanged; approved r2 implementation is inert until separate safeguarded migration.
- Inspected archive members and extracted C1 into fresh artifacts/orch-auth-01-c2/entry-extracted. Its unchanged verify-closeout.ts passed with Node 24.18.0/pnpm 11.15.1 at artifacts/orch-auth-01-c2/entry-closeout: 174 raw files, 15 receipts, 40 discovery/56 owner tests and actual tamper refusal. Routes remain NOT_READY. This is archive verification, not fresh workflows.
- C1 established no qualified VM route. WSL's KVM device is inaccessible and /mnt/c exposes the workstation. TCG can be investigated without KVM/elevation; the guest must receive neither mount nor NIC. Native Windows 11 Pro has no discovered Docker/VM launcher; Windows Server 2022 is not this host.
- Read selected WSL apt/dpkg/gpgv/curl/readelf/Python executable bytes and canonical paths before invocation. Metadata and initial package-state hash are artifacts/orch-auth-01-c2/wsl-tools-inspection.json. No lxc/provider launcher was invoked.

## Steps

1. Inspect authority, reproduce C1 closeout and select route. Complete.
2. Complete: verified/extracted 29 packages and the signed fixed Ubuntu image in a task-local prefix; documented Windows support and executor gaps.
3. Complete: final guest lifecycle passed in 212,508 ms after a retained framing-defect pilot timeout. QMP/native/guest observations, immutable inputs and owned cleanup passed. Independent native cleanup observation, six real filesystem/launcher probes and actual one-byte evidence refusal passed.
4. Complete: 35 focused and 91 repository-tooling tests, typecheck/lint/format and all five invariants passed. Root build returned exit 2 / NOT_READY without a PASS receipt. Source state/refs, authorities and roadmap remain preserved.
5. Complete: separately inspected/extracted the curated archive and reproduced closeout against 159 raw files and sixteen receipts. Record identity is the scoped commit containing this plan; post-commit archive re-audit remains a verification of these supporting observations, never source readiness.

## Acceptance Criteria

- Inspect new executables as data. Retain provider/image origin, exact size/hash and checked upstream provenance before use. No global package installation or shared service mutation.
- Real diagnostic guest uses explicit TCG, finite memory/CPU/time/output, no NIC, host directory/device passthrough, Docker socket or credentials. Only task-owned immutable base/seed and a fresh disposable overlay are exposed. Capture native launcher/guest identity, QMP observations and process disposition.
- Prove cleanup from observed process exit and removed disposable paths; preserve outside sentinels and immutable inputs. Retain failures honestly. Independent audit binds raw bytes to outer source/run/nonce/input expectations and rejects altered evidence or unsupported qualification claims without a PASS receipt.
- Receipt success means lifecycle evidence only. Host and OCI/controller qualification stay NOT_READY, completion stays false, and native Windows/Server 2022 remain unresolved with documented requirements.
- Focused/owner/static/invariant checks pass; root build remains honestly NOT_READY. Authorities, gates, source state/private refs and roadmap remain preserved.

## Verification

Use Node 24.18.0/pnpm 11.15.1. Execute receipt-owned focused tests, pnpm test:partition:repository-tooling, pnpm typecheck, pnpm lint, pnpm format:check and pnpm test:invariants with separate outputs, serially to avoid earlier Git identity contention. Retain pnpm build exit 2/NOT_READY with no PASS receipt. No executor policy changes; C1 entry audit preserves prior OCI evidence without relabeling it as fresh C2 execution. No visual/UI/simulation changes; serial/QMP/process/filesystem artifacts are the observable boundary.

## Risks and Recovery

TCG may be slow/unavailable; bounded failures remain unverified and retained. Image signatures authenticate distribution origin, not host authorization or future job provenance. Download/extract only into fresh task-owned Linux paths, inspect members and launchers, never execute package maintainer scripts, and preserve the host package database. Remove only verified owned guest paths after process exit; no destructive changes to existing WSL, Windows or codex.lab. Ordinary source control handles code recovery. Record evidence and revise the plan before a scope refinement.

## Progress and Evidence

C1 reproduction passed before edits. The pilot boot reached Ubuntu and emitted its diagnostic through cloud-init at about 283 guest seconds, but the collector rejected the prefixed line and reached its deadline. QEMU exited and owned cleanup passed; no PASS receipt exists. Retain the pilot. Refine the diagnostic to write directly to ttyS0 during cloud-init bootcmd, before unrelated service initialization; this observes a booted Ubuntu userspace, not service/controller readiness. Keep the 300-second bound. Capture live serial snapshots for diagnosis. Focused tests (35), lint and typecheck passed after correcting a shared-reference test-fixture defect; final-source checks also passed. The genuine tested index is 93f0fe82053ba95cd7fae79e10b2ae7cb2fbc772 on a649611. A fresh archive extraction and closeout verified 159 raw files and 16 receipts. The signature/package audit rehashed large live inputs outside Git; the curated audit checks retained observations and signed metadata mappings, not a new VM or new signature execution. Guest CPU/RAM settings do not qualify general host resource isolation. Initial preparation stderr was not captured; explicit transcriptions and collector snapshots preserve that limitation. No codex.lab access occurred in C2. Primary references cover QEMU invocation, Canonical image signatures, Docker Windows/VM support and Microsoft Windows containers. Documentation feasibility is not runtime qualification.

## Next Action

Reproduce docs/runtime-qualification/ORCH-AUTH-01-C2/README.md, then select one provisioned disposable Linux guest/OCI qualification increment. Supply exact runtime/provider inputs and compatible resource limits, establish trusted job/host provenance, and exercise the real OCI policy before Docker-controller dispatch. Continue native Windows feasibility while preserving the unresolved Server 2022 reference. Root build, migration/activation, full source readiness and human acceptance remain incomplete. Do not initialize/adopt source state or reopen settled r2 approval.
