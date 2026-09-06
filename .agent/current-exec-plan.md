# Current Execution Plan

**Status:** ORCH-AUTH-01-C1 complete for launch-free discovery; general host qualification remains open. **Updated:** 2026-09-05. **Owner:** maintainer-authorized source transition.

## Objective

Make inspection of potential qualification hosts repeatable without executing discovered Docker/VM launchers. Produce bounded filesystem observations, distinguish the actual controller platform from a Linux guest/provider, and record missing prerequisites without granting host qualification. The immediate machine consumer is a receipt-owning discovery auditor that checks the real observations and refuses unsupported qualification claims.

This is a bounded precursor to C's general Docker-controller host qualification. It does not launch controllers, install providers, provision hosts, expand run/integration workflows, or implement an admission/remote-dispatch protocol. Inspection found no already qualified disposable host. Merely finding an executable or reaching a personal/shared host is insufficient authority or isolation evidence.

## Goal Constraints

ORCH-AUTH-01 r2 remains approved at normative digest 53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108, with durable approval in evals/authority-revisions/ORCH-AUTH-01/approval.json. Preserve sealed authorities, active locks, original acceptance, commissioning/ledger, protected five-job CI and existing verification gates. No renewed r2 approval is needed.

WSL observations qualify Linux only. General Docker-controller host qualification, native Windows execution, root production build, authority migration/activation, full source readiness and live human acceptance remain incomplete. Discovery is candidate-support and completion-ineligible. Never initialize or adopt source controller state or private refs. Preserve the untracked Implementation-ready improvement plan 8-5-26.txt outside commits.

## Baseline Evidence

- Entry HEAD is 13b013d3b5b20e056561d12221e83b741b65fe8f. Only the user roadmap is untracked; SHA256 remains 53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1. Source refs/milestone-loop/ are absent.
- Followed B's README: separately inspected/extracted all three curated archives and ran its unchanged verify-closeout.ts with task-local Node 24.18.0 and pnpm 11.15.1. Fresh artifacts/orch-auth-01-c/entry-closeout passed: 430 frozen source files, 94 archived focused tests, six OCI cases, 104 workflow files, 152 matrix files, eleven supporting receipts, preserved authorities and NOT_READY limits. This is a fresh archive audit, not a fresh workflow run.
- Windows 11 Pro build 26200: ssh/wsl exist; Docker, Podman, Hyper-V cmdlets, QEMU, VirtualBox and Windows Sandbox commands were not discovered. vmcompute runs. WSL Ubuntu 24.04.4 has Docker 29.1.3 but exposes /mnt/c; /dev/kvm exists but the current user cannot open it. Noninteractive group-switch privilege was unavailable. No VM provisioning route was established.
- Previously recorded codex.lab is reachable over verified SSH and runs Ubuntu 24.04.4. Docker/Podman/QEMU/virsh were not discovered and /dev/kvm is absent. It is not an attested disposable host. Its /usr/sbin/lxc is an installer shim: a version query unexpectedly triggered LXD snap installation. The probe was interrupted; snap change 2 completed with LXD 5.21.7-1018661 revision 40585 and an active daemon. No LXD instance or controller was requested. This actual side effect must be retained, not reported as configuration-unchanged. Do not invoke more discovered launchers or remove remote service/state without establishing safe ownership.
- Docker's official docs support Desktop on suitable Windows client systems, not Windows Server 2022; remote daemon bind mounts refer to the daemon's filesystem. The current executor uses local absolute read-only source/store mounts and filters environment routing. Neither a WSL shell shim nor an arbitrary remote Docker endpoint proves a native Windows route. Record official references and distinguish feasible future routes from tested support.

## Steps

1. Inspect required authority, B handoff, local/WSL/recorded remote routes, and supported Windows options. Complete; discovery side effect requires accurate recording.
2. Implement bounded metadata-only launcher discovery with an immediate receipt-owning audit consumer; add regression coverage for installer shims, shadowed paths, links, malformed observations, and false platform/qualification claims. Complete: 40 focused regressions and the real installer-script no-execution boundary passed.
3. Execute the scanner on native Windows, WSL Linux and the recorded remote using task-local files only; independently validate raw reports. Retain exact tool/source identities, commands, fresh run/nonce and failures. Complete: three native observations, all explicitly NOT_READY, were independently audited.
4. Run focused tests and applicable invariants/static checks; observe the unchanged production-build NOT_READY result. Audit sealed authority, roadmap and source state/ref preservation. Complete: 56 owner tests, five invariant entries and all static checks passed; build returned NOT_READY.
5. Record reproducible evidence, limitations, remote side effect and the next host-provisioning requirement; commit only the verified C1 increment. Complete: the curated closeout passed against 174 files/fifteen receipts and an actual one-byte mutation was refused. Record identity is the scoped commit containing this completed plan.

## Acceptance Criteria

- Discovery reads bounded launcher metadata/content only; it never executes a discovered launcher, interpreter wrapper, installer, shell alias or version command. Regression scripts that would create a marker/install something remain unexecuted.
- Preserve first-found PATH precedence, ordinary/linked/non-file/unreadable distinctions, bounded candidate counts/content size and actual kernel/runtime identity. The CLI cannot accept a claimed controller platform override. WSL is recorded as Linux.
- Each retained report lists the fixed inspected names, observed paths/kinds and diagnostics. Its qualification status stays NOT_READY until a separate real host qualification exists; capability metadata cannot be upgraded to attestation, provider support or completion. The auditor rejects altered inventory, omitted names, forged platform, changed run/nonce/source binding or a readiness claim.
- Real Windows, WSL and codex.lab observations are independently audited with command-owned evidence; hashes refer to actual retained bytes. Transport identity is distinguished from host isolation authorization. No source controller state, candidate containers, new providers or host configuration changes occur during the implemented scanner. The earlier LXD installer side effect is disclosed separately.
- Focused tests, typecheck, lint, format and all five invariant entries pass. Root build remains honestly NOT_READY. Source authorities, gates and roadmap are unchanged; all substantive C host/workflow and source readiness gates remain open.

## Verification

Use exact Node 24.18.0/pnpm 11.15.1 for repository checks. Run a command-owned focused test wrapper, then pnpm test:invariants, pnpm typecheck, pnpm lint and pnpm format:check with distinct artifact roots. Run pnpm build and retain its expected NOT_READY exit without a PASS receipt. The executor/mount/runtime policy is unchanged; B's matrix is audited as entry evidence, not rerun or relabeled as C execution.

Capture fresh read-only discovery through the actual native Node process on each route. Keep stdout/stderr, tool/transport/source hashes, report inventories and outer expectations. Curate bounded raw evidence with archive seals and a closeout auditor that validates actual bytes and protected Git differences. No visual/UI or simulation path changes; no visual evidence required.

## Risks and Recovery

Version queries can be installers, as actually observed. Resolve/read metadata without executing discovered files. Treat links, errors, unexpected PATH forms, excessive size and incomplete results conservatively. No auto-install, service reconfiguration, VM creation, credential scanning or inference of host authorization. Reversible code changes use normal source control. Do not delete remote LXD state to hide the discovery side effect.

Discovery can establish blockers, not prove absence of secrets or full isolation. A future trusted host lifecycle/provenance and actual candidate execution remain required. Static reports cannot satisfy those gates or the sixteen-family/two-platform qualification surface.

## Progress and Evidence

2026-09-05: B entry closeout passed. Three routes inspected; no qualified host selected. B's completed outcome remains recorded at 13b013d. The C1 scope was selected before implementation after the launcher side effect demonstrated a concrete harness defect.

Final tested source is frozen index 822426b10089f90ae6fcbe397a322914ec97b757 on entry HEAD 13b013d. The retained patch reconstructs that actual tree; later closeout records do not relabel the earlier executions. The final scanner ran once on Windows, WSL and codex.lab in 414/5,114/428 ms respectively. Every report remains NOT_READY and completion-ineligible. Initial label-only observations are retained and distinguished from the final recaptures.

All 40 focused tests and all 56 tests in the affected repository-tooling owner passed. The first partition attempt could not capture Git tree identity during simultaneous checks; its ERROR/no-receipt evidence remains retained. An unchanged serial rerun passed. Possible git write-tree lock contention is an inference, not a proven diagnosis. Typecheck, lint, format and all five invariant entries passed; the invariant aggregate took 61,254 ms. Root build remains exit 2 / NOT_READY without a PASS receipt.

The closeout independently reconstructed the frozen source and checked all 174 raw evidence files/fifteen receipts. An actual one-byte remote-report mutation was rejected without a PASS receipt. Exact reproduction and limitations are in docs/runtime-qualification/ORCH-AUTH-01-C/README.md. The unintended LXD installation and subsequent active daemon are recorded explicitly; no remote removal, instance or controller operation was requested. Source authority/state/ref/roadmap boundaries remain preserved.

## Next Action

Reproduce C1's curated closeout, then select one bounded disposable-host lifecycle/provenance route under ORCH-AUTH-01-C before any run/integration controller dispatch. The inspected WSL/remote routes are not qualified hosts; a supported native Windows provider and the Server 2022 reference remain unresolved. Do not treat the unintended LXD installation as authorization or qualification. Root build, source migration/activation/readiness and human acceptance remain incomplete; unchanged r2 approval is settled. Do not initialize or adopt source controller state.
