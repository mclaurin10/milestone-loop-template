# ORCH-AUTH-01-C3 — disposable Docker host continuation

Status: **DISPOSABLE LINUX HOST/OCI QUALIFICATION VERIFIED; WP6e CONTINUATION OPEN**. This directory records the first bounded increment of the explicitly authorized WP6e continuation from `29dafb5668b125919a01779b1c8f168ad18332c1`. It is not a WP6e completion record. Historical WP6e remains **BLOCKED** at `e590e38c32de2b5baa7423f66bbd8a0230b61839`; its recorded unit-domain obligation remains satisfied without a unit-domain PASS. No WP6f interpretation, source readiness, or human acceptance is claimed.

The maintainer approved ORCH-AUTH-01 r2's normative digest `53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108`. Approval remains separate from activation. The runtime source in these diagnostic attempts is clean commit `29dafb5`, tree `4a136e2bf740d32e15ad1f719b8ec123f30ff8f3`, under the original commissioned authority. The new trusted coordinator programs have their own retained byte identities. Supporting Windows test receipts identify their actual staged tree and dirty supporting execution; they are not clean candidate receipts.

## Route and trust boundary

The existing WSL Ubuntu environment launches a disposable Ubuntu 24.04 guest through C2's task-local QEMU 8.2.2 payload and immutable signed base image. A bounded WSL root probe actually opened KVM and created/closed one empty VM. No account/group/device permissions changed. Each host launch uses one fresh transient systemd unit; QEMU runs as UID/GID 65534 with supplementary KVM group 993, no capabilities, no-new-privileges and seccomp. The shared Docker daemon is used only for read-only inspection/export of its existing pinned image. Docker installation and service execution occur solely inside the disposable guest. No codex.lab access or LXD mutation occurred in C3.

The actual QEMU policy is 4 GiB host memory, no swap, CPU quota 200% (two CPU equivalents), 64 tasks, 17 GiB per-file limit, a fixed 16 GiB virtual guest disk and a 30-minute lifecycle deadline. Guest RAM is 3 GiB with two vCPUs. The I/O pool is explicitly capped at sixteen threads so it fits inside the whole-unit task limit. QMP independently reads that value before unpausing. These finite settings support this qualification job; they do not pre-authorize a later candidate's potentially longer lifecycle.

QEMU has no NIC, host directory share or device passthrough. Private host networking, an AF_UNIX-only socket policy, protected home/system mounts, a masked shared Docker socket and precisely selected read-only provider/base/input bindings constrain its launcher. The guest sees an immutable input ISO and read-only seed plus one owned writable overlay. Its separate Docker daemon has no bridge, IP forwarding, iptables setup or proxy. The unchanged OCI executor owns the container limits and mounts; C3 does not reduce those policies or command deadlines.

The trusted coordinator captures fresh run/nonce, exact source, approved digest, program/input hashes, real unit/PID/cgroup identity, QMP state and guest boot identity. It admits only the fixed OCI qualification message over one nonce-bound virtio channel. Candidate-authored data cannot select host commands, paths, approval or limits. The bounded archive transfer preserves raw guest files, independently hashed after receipt. This is one locally controlled route, not a portable signed remote-host protocol.

## Inputs and observations

Large reusable inputs remain outside Git in `/home/duncan/oc3-b13lp2vx` and C2's `/home/duncan/oc2-1_hj5pul`. C2's base SHA256 is `d0fe84bb5f80853425fa6be28e2c106f30104c3cfe8611933f2e65c9b63f0e30`. Eighty-two package payloads were checked against authenticated Ubuntu indexes; historical archive 404s use the matching Ubuntu snapshot and the same signed package hashes. Node 24.18.0 and pnpm 11.15.1 are exact. The OCI descriptor is `sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad`, with the original pinned image input hash `0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3`.

`prepare-cache.py` primes only task-owned public metadata for the exact root and OCI-fixture lockfiles using pinned pnpm, unchanged supply-chain defaults and disabled package scripts. Its actual offline reuses pass. The guest receives those records and the verified package-content store. No personal home/config/auth data or store project links enter the payload. APT's cache is populated from the verified local archives before `--no-download` installation. The guest root SSH skeleton is removed only after every entry has been proved an empty regular file; any credential data refuses admission.

`resource-probes.py` exercises actual small kernel fault limits in separate owned units: OOM-killed allocation, pids exhaustion, CPU throttling, EFBIG, read-only/network/daemon-socket refusal and deadline termination including descendants. Its probe-only `OOMPolicy=continue` preserves the memory observer after the deliberately killed allocator. Those small fault limits demonstrate mechanisms; QEMU's separate actual readbacks own its larger limits. `audit-resources.ts` independently checks raw outputs and cleanup and writes a validated command-owned receipt.

`audit-oci.ts` preserves all of A's substantive independent OCI checks. Only the receipt/schema labels and the runtime-scope sentence differ from the historical auditor. `audit-host.ts` combines the actual host, raw guest and separately owned OCI audit; it checks original authority Git objects and records the complete legacy ledger hash. Successful audit claims remain scoped and `completionEligible: false`.

## Retained failures

Raw work is under `artifacts/wp6e-continuation-20260906/` plus the declared task-local Linux roots. The sealed archive retains 1,168 selected raw files, 37,159,590 raw bytes and nineteen validated supporting receipts. The archive is 32,304,006 bytes, SHA256 `91a368398226b631d8a739acebafa7c1dd6f2a521580b4866e1af97c017ac2b4`; `evidence/manifest.json` pins its complete inventory. Large input disks/packages and the diagnostic crash image remain outside Git.

The retained attempts include package selection/index/404/link refusals, QEMU cgroup namespace observation, unsupported fully-userspace APIC, privileged-observer socket-mask semantics, offline APT cache refusal, uncached pnpm policy timeout, an empty root SSH skeleton, provider store-resolution mismatch, and QEMU thread-creation failure. Every failed host attempt completed owned cleanup. The first cgroup refusal lacked a pre-assertion raw snapshot; later attempts captured it. Do not infer missing raw observations or turn a failure into a PASS.

Attempt fourteen's Docker log records ENOSPC during image extraction. Its exception path could not write its own failure file, so no error frame arrived. The owned VM was manually interrupted after preserving a SHA256-bound crash snapshot, then cleaned up; this was not a successful or expected-timeout run. Read-only `qemu-img`, `sfdisk` and `debugfs` inspection did not mount or execute the captured guest. The new guest job moves the store instead of duplicating it, uses the finite 16 GiB disk/17 GiB file ceiling, runs in its own bounded service, emits command heartbeats, handles partial channel writes and transmits errors before attempting disk diagnostics. Original OCI case limits stay unchanged.

Attempt fifteen, run `b5ae0551-b3eb-4a88-83c8-e5254332259c`, completed in 370,642 ms. The original six-case OCI matrix passed in 44,361 ms, including its real normal child receipt, build and one raw fixture test. Separate OCI/host audits passed; a fresh native observer confirmed all fifteen recorded guest directories/cgroups and process identities absent, retaining missing early PID observations explicitly. The input audit freshly verified 82 signed-index-bound packages and rehashed 94 payload/base/launcher files. Its first receipt declaration incorrectly included empty stderr and was rejected; no PASS receipt remains for that failure. Three actual altered evidence copies (QMP pool, cleanup flag, archive byte) were rejected by the real independent host auditor without a PASS receipt. These are evidence-audit regressions, not candidate 5(a)/5(b).

The first three input preparation failures have retained raw stderr but no complete executed-program snapshot. Failed guest input ISOs remain outside Git with recorded hashes; not every historical guest program is duplicated in the curated archive. The final executed guest program equals the tracked source and frozen manifest hash. The curated audit does not fabricate or fill those earlier provenance gaps.

The fixed WSL kernel exposes a cgroup entry as PID zero. Matching kernel source explains namespace-relative PID printing and a KVM recovery kthread attached to the VM cgroup; the member's specific identity remains inferred. The auditor requires exactly the visible QEMU PID plus that one zero and requires the entire cgroup absent after termination. It rejects other/missing members.

Focused/owner runs also retain the initial unclassified test, noncanonical ownership ordering, inaccessible empty scratch directory and trailing-space parser refusals. These are new harness defects corrected without weakening original tests or gates.

## Remaining acceptance

| Obligation                                                                      | Current result                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C2 unchanged retained closeout                                                  | PASS: 159 raw files and sixteen receipts; not a fresh VM               |
| Actual native resource fault probes                                             | PASS: six probes, separately validated receipt                         |
| C3 focused and owner checks                                                     | PASS: 37 focused, 128 owner tests; supporting dirty-tree evidence      |
| Final static/invariant checks                                                   | PASS: typecheck, lint, format and five invariants                      |
| Actual admitted guest OCI provider and independent final host audit             | PASS: six unchanged cases; one bounded disposable Linux lifecycle      |
| Final owned cleanup and input audits                                            | PASS: fifteen attempts; 82 packages and 94 pinned files                |
| Sealed closeout                                                                 | PASS: 1,168 raw files and nineteen receipts; post-commit command below |
| Compatible readers, consumed build and approved recoverable authority migration | Pending subsequent continuation increments                             |
| Clean committed real candidate and all four independently validated partitions  | Pending                                                                |
| Committed real-tier mutations 5(a)/5(b)                                         | Pending; setup/ownership development failures do not satisfy these     |
| Exact new pushed-candidate five-job hosted evidence                             | Pending                                                                |
| Native Windows and Server 2022 reference                                        | Unqualified; WSL/guest evidence is Linux only                          |
| Full source readiness and separate human acceptance                             | Incomplete                                                             |

Continue through the later obligations once the next necessary increment can proceed. Do not initialize or adopt source controller state. Keep the user's untracked roadmap outside commits.

Fresh native Windows metadata at 2026-09-06T03:46:26Z records Windows 11 Pro build 26200, an active hypervisor and approximately 7.6 GiB available memory after the guest stopped. The checked Docker Desktop/CLI and native QEMU paths were absent; `vmcompute.exe` was hashed without invocation. This fixed-location inspection does not establish universal absence or authorize shared installation. It establishes no native Windows or Server 2022 qualification.

## Exact reproduction

Use Node 24.18.0 and pnpm 11.15.1 at the C3 evidence commit (subject `Qualify a disposable Docker host with audited OCI evidence`). The supporting source index is `681f0a0d8af7b47a1a08ee936b99af18b86626e3` on `29dafb5`; the archive includes binary patches for every retained supporting receipt tree. The verifier reconstructs those trees, checks current executable bytes, validates nineteen receipts, reruns independent retained OCI/host/resource audits and checks signature/index/rehash observations. It is not a fresh boot or fresh signature execution.

First inspect all archive names/types, then extract to a new directory. `extract-evidence.py` bounds members/bytes, rejects links and unsafe paths, writes the full member inspection before extraction and refuses existing destinations. For the recorded WSL route:

```powershell
$env:PATH = (Resolve-Path '.tools/node-v24.18.0-win-x64').Path + ';' + $env:PATH
wsl.exe -d Ubuntu --exec /usr/bin/python3.12 /mnt/c/Dev/loop-extraction/milestone-loop-template/docs/runtime-qualification/ORCH-AUTH-01-C3/extract-evidence.py /mnt/c/Dev/loop-extraction/milestone-loop-template/docs/runtime-qualification/ORCH-AUTH-01-C3/evidence/supporting-evidence.tar.gz /mnt/c/Dev/loop-extraction/milestone-loop-template/artifacts/c3-fresh-extraction
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-C3/verify-closeout.ts artifacts/c3-fresh-extraction artifacts/c3-fresh-closeout
```

The pre-commit reproduction passed at `artifacts/wp6e-continuation-20260906/closeout-1/`. Post-commit reproduction belongs in a new output directory and must identify the real commit. Successful closeout has `completionEligible: false`. Root `pnpm build` remains exit 2 / NOT_READY because the source production build is undeclared. The source controller state/private refs remain absent. No actual candidate, authority activation, hosted candidate cohort or readiness claim is supplied by C3.

## Primary references

- [QEMU security model](https://www.qemu.org/docs/master/system/security.html)
- [Pinned QEMU 8.2.2 event-loop thread-pool controls](https://raw.githubusercontent.com/qemu/qemu/v8.2.2/qapi/qom.json)
- [Matching WSL cgroup implementation](https://raw.githubusercontent.com/microsoft/WSL2-Linux-Kernel/linux-msft-wsl-6.6.87.2/kernel/cgroup/cgroup.c), [KVM worker attachment](https://raw.githubusercontent.com/microsoft/WSL2-Linux-Kernel/linux-msft-wsl-6.6.87.2/virt/kvm/kvm_main.c)
- [Ubuntu APT archive cache](https://manpages.ubuntu.com/manpages/noble/man8/apt-get.8.html), [Ubuntu snapshot service](https://snapshot.ubuntu.com/)
- [pnpm 11 release documentation](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md)
- Native Windows constraints remain documented in [C2's Windows options](../ORCH-AUTH-01-C2/WINDOWS-OPTIONS.md).
