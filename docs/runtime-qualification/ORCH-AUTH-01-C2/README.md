# ORCH-AUTH-01-C2 — bounded Linux VM lifecycle and provenance

C2 establishes one real diagnostic VM lifecycle under unprivileged QEMU TCG in WSL. It does not qualify a Docker-controller host, native Windows workflow, or general provider. WSL supplies Linux evidence only. The Windows Server 2022 reference route, root production build, authority migration/activation, full source readiness and human acceptance remain incomplete. Approved r2 digest `53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108` remains settled and unchanged.

C1 was reproduced from `a649611ee7be1834b915c377b93d7d71c02a7028` before edits using Node 24.18.0/pnpm 11.15.1. Its unchanged archive auditor passed against 174 files and 15 supporting receipts. C1 remains metadata discovery evidence. Its unintended codex.lab LXD installation remains disclosed in its unchanged archive; C2 did not access that host, use the installation as authorization, or remove shared service/package state.

## Actual route and outcomes

The Windows coordinator dispatched the pinned native Linux Node process through the existing WSL Ubuntu transport. A fresh `/home/duncan/oc2-1_hj5pul` directory held downloaded inputs, extracted provider files and per-run artifacts. No APT install, package maintainer script, host service configuration or Windows provider installation was executed.

Preparation used a read-only APT simulation and verified Ubuntu InRelease signatures, the complete relevant package-index hashes and 29 downloaded package hashes before extracting data payloads. The cached noble-updates index was signed on 2026-08-15; this is a reproducible signed input selection, not a latest-patch or host security qualification claim. The Ubuntu cloud image is the fixed 20260826 release: 624,829,952 bytes, SHA256 `d0fe84bb5f80853425fa6be28e2c106f30104c3cfe8611933f2e65c9b63f0e30`. Its checksum signature was checked with the existing Ubuntu public keyring. QEMU is Ubuntu package `1:8.2.2+ds-0ubuntu1.18`. Newly selected host tools and all extracted launchers were inspected as data before invocation. No discovered installer was executed.

The fixed VM command uses TCG, two vCPUs, 1,024 MiB guest RAM, no NIC, no host directory/device passthrough, no display, no Docker socket and no credentials. It supplies only the pinned base image through a fresh writable overlay and a read-only NoCloud seed. The diagnostic emits directly to ttyS0 during cloud-init's boot stage. This proves a booted Ubuntu userspace, not completed service initialization. A 300-second lifecycle deadline, five-second kill grace and 2 MiB per-stream output cap bound the diagnostic. Guest CPU/RAM settings do not constitute general host cgroup, disk-quota or admission enforcement.

The final run completed in 212,508 ms. Guest Ubuntu 24.04.4 used kernel `6.8.0-138-generic`; only loopback networking was observed. Its marker was initially absent and read back the outer nonce after writing. `/mnt/c`, `/home/duncan` and the inspected Docker socket paths were absent. QMP exposed the exact VM name/UUID, paused-before-start state, TCG/KVM disposition, RAM/CPU configuration, two block devices, serial/QMP channels and no network device. The native QEMU process had UID 1000, zero effective capabilities, no-new-privileges and seccomp filtering. These observations do not prove resistance to arbitrary hypervisor exploits or qualify future controller jobs.

QMP quit terminated the final VM. The collector removed only its owned guest files after observing process exit, preserving outside sentinels. The base image, complete extracted-provider inventory and host package-status bytes matched their before hashes. A separate native Linux observer subsequently confirmed both pilot and final QEMU PIDs and guest directories absent. Download caches, provider files, trusted helper copies and raw evidence remain in the task directory; they are not live guests or shared services.

The first actual boot reached its diagnostic at about 283 guest seconds, but cloud-init prefixed stdout and the original parser missed the line. It timed out, was rejected without a PASS receipt and cleaned up its guest. The final implementation uses a direct serial write during the earlier boot stage and keeps the original timeout. This failed pilot remains evidence of a collector defect, not a passed lifecycle or a planned fault scenario.

## Verification and provenance limits

The genuine tested index tree is `93f0fe82053ba95cd7fae79e10b2ae7cb2fbc772` on entry HEAD `a649611`. Its complete binary patch and eight executable/config file identities are retained under `raw/setup/`. The closeout reconstructs that tree in a separate bare Git database and compares actual current implementation bytes and index blobs. Later closeout/audit documentation records the observations without relabeling earlier execution as a clean release candidate.

- All 35 focused lifecycle regressions and all 91 repository-tooling owner tests passed. Existing 56 owner tests remain present.
- Six real Linux filesystem/launcher cases passed: owned cleanup, foreign-entry refusal, ownership mismatch, linked cleanup input, an actual installer-shaped script left unexecuted, and internal-dangling/external-escaping provider links.
- Typecheck, lint, format and all five invariant entries passed with owned receipts. Invariant aggregate duration was 56,802 ms. These are the repository's existing static/invariant scopes, not a complete candidate/readiness floor.
- Root `pnpm build` returned exit 2 / `NOT_READY`; no PASS receipt exists.
- An actual one-byte addition to a separate serial-evidence copy was rejected by the independent lifecycle auditor without a PASS receipt.
- The curated closeout passes against 159 retained files and 16 supporting receipts. It checks source reconstruction, raw inventories, archived signature-command observations and signed metadata/package mappings, guest/QMP/cleanup evidence, test reports, preserved authorities and non-passing limits.

Initial preparation failures involved a plus sign in a package filename and an internal dangling documentation link. Their stderr appeared in tool output but was not retained by the stdout-only capture. The archive labels their summaries as operator transcriptions and retains the executed collector snapshots; it does not invent raw stderr. The final real boundary probes cover the corrected behavior. The first focused run also exposed shared expected/reported object references in a test fixture; that failed report is retained. An initial curation attempt refused the missing stdout logs, which are now explicitly classified as unavailable.

## Reproduce the curated closeout

Use Node 24.18.0 and pnpm 11.15.1. The local Windows pins are under `.tools/node-v24.18.0-win-x64`. Inspect member names and reject absolute/traversing paths before extracting `evidence/supporting-evidence.tar.gz` into a fresh task-local directory. The archive contains `raw/` and `raw-inventory.json`; its size/hash seal is `evidence/manifest.json`.

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-C2/verify-closeout.ts artifacts/<fresh-extracted-root> artifacts/<fresh-closeout-output>
```

This audits retained evidence; it does not boot another VM or rerun upstream cryptographic verification. The full signed package indexes, public keys, checksum files and actual gpgv observations are retained. Large package payloads, extracted binaries and the 596 MiB image remain outside Git. To rehash those live inputs and re-execute signature and Linux filesystem checks on this prepared route:

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-C2/audit-support.ts /home/duncan/oc2-1_hj5pul artifacts/<fresh-support-output>
```

`prepare-inputs.py` documents the payload-only preparation procedure; `freeze-inputs.mjs` independently checks inputs before freezing them. The freeze helper imports a co-located copy of the standalone lifecycle module. The saved package manifest gives exact upstream URLs, versions and hashes for the recorded run. A different machine's current APT selection produces a different input identity and must be separately checked, never substituted into these receipts. Never execute an unfamiliar launcher or version query to bootstrap this preparation.

To execute a fresh diagnostic after inspecting and freezing its inputs, stage the intended tracked implementation so the real source index is captured, then run:

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-C2/run-lifecycle.ts /home/duncan/oc2-1_hj5pul artifacts/<fresh-lifecycle-output>
```

The current wrapper uses the previously inspected `/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node`. This route-specific diagnostic is not a portable installer, remote dispatch service or host admission API. The archive preserves its exact arguments, runtime/source identities, fresh run/nonce, input hashes and timings.

## Remaining work

[Native Windows options](WINDOWS-OPTIONS.md) distinguish supported client/VM/VDI routes, remote daemon path semantics, Offload, WSL and the unresolved Server 2022 reference. No Windows option is qualified.

The next bounded C increment should establish a provisioned disposable Linux control-plane guest with the exact Node/pnpm and Docker/OCI inputs, compatible resource limits, trusted job provenance and real provider-policy evidence. Qualify that host and its actual OCI execution before dispatching Docker-dependent controllers. The current offline boot diagnostic and signed image alone cannot grant that admission. Do not initialize or adopt source controller state. Preserve the roadmap outside commits, sealed authorities, existing gates and the separate unfinished production-build/migration/readiness/human work.

Primary route references: [Canonical checksum verification](https://ubuntu.com/docs/public-images/public-images-how-to/verify-image-checksum/), [fixed Ubuntu image release](https://cloud-images.ubuntu.com/releases/noble/release-20260826/), [QEMU invocation](https://www.qemu.org/docs/master/system/invocation.html). Vendor support findings have their own primary links in the Windows options record.
