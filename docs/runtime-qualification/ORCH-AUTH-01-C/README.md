# ORCH-AUTH-01-C1: inspect host routes without executing launchers

C1 completes a bounded discovery increment within ORCH-AUTH-01-C. It does **not** qualify a disposable Docker-controller host or a native Windows workflow route. All three observed routes remain `NOT_READY`. Root production build, authority migration/activation, full source readiness and human acceptance remain incomplete. WSL supplies Linux observations only.

The approved r2 normative digest remains `53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108`. The sealed proposals, live authorities/locks, original acceptance, commissioning records, package scripts and five protected CI jobs are unchanged. No source controller state/private ref was initialized or adopted. The untracked user improvement plan is unchanged and excluded from the commit.

## Entry handoff

Entry HEAD was `13b013d3b5b20e056561d12221e83b741b65fe8f`. B's three archives were inspected and extracted into separate `initial`, `qualified` and `supporting` directories, then its unchanged `verify-closeout.ts` ran with Node 24.18.0/pnpm 11.15.1. The fresh audit passed against 430 frozen files, 94 archived tests, six OCI cases, 104 workflow files, 152 matrix files and eleven supporting receipts. Its three receipt/report files are retained in this increment's archive under `raw/entry-closeout/`. This reproduces B's archive audit; it does not relabel those workflows as fresh C executions.

## Inspected routes

| Route                          | Actual scanner process                                                | Observations                                                                                                                                                                                                                                                                                          | Unresolved requirement                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Windows                 | `win32`, x64, Windows 11 Pro build 26200, Node 24.18.0                | Fixed PATH discovery found `wsl.exe` and `ssh.exe`, whose canonical path spelling differs from the PATH spelling. Docker, Podman, QEMU, VirtualBox and Windows Sandbox launchers were absent from this search. Separate command metadata found no Hyper-V cmdlets; `vmcompute` runs.                  | No disposable Windows host, supported provider or real workflow evidence is established.                                                                                  |
| Local Ubuntu/WSL               | `linux`, x64, kernel `6.6.87.2-microsoft-standard-WSL2`, Node 24.18.0 | Docker and SSH have ordinary ELF prefixes. Earlier actual Docker observation returned 29.1.3. `/mnt/c` exposes the workstation filesystem. `/dev/kvm` exists but is inaccessible to the current user; a noninteractive group-switch attempt required a password. VM launcher commands were not found. | The existing WSL environment is not demonstrated to be a disposable host isolated from unrelated projects/secrets. It does not supply native Windows controller evidence. |
| Recorded `codex.lab` SSH route | `linux`, x64, kernel `6.8.0-101-generic`, Node 24.18.0                | No Docker/Podman/QEMU/virsh launcher was found; `/dev/kvm` is absent. `/usr/sbin/lxc` is an installer script. See the actual side effect below.                                                                                                                                                       | A reachable shared host and an installed service do not establish authorized disposable-host lifecycle or provider qualification.                                         |

This is a bounded search of fixed filenames in absolute PATH directories, not an exhaustive installed-software inventory. It does not resolve shell aliases, functions, PowerShell module commands or arbitrary PATHEXT conventions. Empty, relative and Windows network PATH entries are counted and ignored. Neither a missing filename nor a binary prefix alone establishes runtime support.

## Discovery side effect and repair

Before the new scanner existed, the intended read-only remote `lxc version` query invoked Ubuntu's `/usr/sbin/lxc` installer shim. It contacted `/run/lxd-installer.socket` and installed the LXD snap. The local probe was interrupted, but installation completed: snap change 2, LXD `5.21.7-1018661`, revision `40585`, channel `5.21/stable/ubuntu-24.04`, approximately 23:35–23:36 UTC on 2026-09-05. The daemon was subsequently observed active and the probe processes had ended. No LXD instance or controller was requested.

This was an unintended host configuration change. No uninstall, daemon stop or remote state deletion was attempted; the shared host was not demonstrated safe for destructive cleanup. `raw/inspection/incident.json` explicitly identifies the original command description as an operator transcription, not a raw console artifact. The separately captured `remote-aftermath.log` retains the actual installer script, snap history/version and service/process observations. The original version-probe output remains in the tool conversation history.

The repair is [`tools/qualification-host-discovery.mjs`](../../../tools/qualification-host-discovery.mjs), a standalone scanner using only Node filesystem, crypto, OS and path APIs. It never runs a discovered program, including version queries. It preserves the first existing candidate in its declared search order; it does not skip an earlier script to report a later binary. Links/canonical aliases, non-files, unreadable files and ordinary files remain distinct. It refuses linked or aliased paths before reading content, verifies opened file identity around bounded reads, and retains at most 4 KiB of a launcher prefix. A prefix is explicitly not a full binary hash or an executable authenticity check.

The implementation's native Windows regression uses an actual installer-shaped command script whose marker remains absent. Other regressions cover shadowing, linked directories, non-files, bounded reads, unsafe/excessive PATH input, missing names, stale source/authority/run/nonce/route bindings, changed captured bytes and forged platform or qualification claims. No discovered launcher was invoked by any of the three implemented scanner runs.

## Observation and audit boundaries

The trusted outer `run-discovery.ts` selects the route and native platform, freezes the source index and scanner digest, and records a fresh run/nonce before dispatch. It uses the native Node binary on Windows, WSL `--exec` for the Linux scanner, or the previously recorded SSH route with `BatchMode=yes` and `StrictHostKeyChecking=yes`. Only the standalone scanner file is copied to task-local Linux directories; no source checkout, credentials or controller state are transferred.

The raw scanner subprocess is a metadata collector, not a workflow-verification producer. The enclosing discovery command owns its observation/audit receipt. It checks the actual subprocess exit and supervision, captures stdout separately, pins its digest outside that report, validates the native kernel/platform against the earlier inspection, and repeats the audit after reading retained bytes. The closeout auditor independently revalidates those records. A self-consistent report cannot authenticate a host, grant maintainer approval or qualify a provider; this is not the later remote-job/admission protocol.

The scanner always leaves host qualification `NOT_READY` because discovery supplies none of the required authorization, isolation, provider or workflow evidence. Its audit receipt means the declared observations were collected and checked. It does not change any readiness gate or permit a controller dispatch.

## Source, checks and cost

The tested source is the genuine frozen index tree `822426b10089f90ae6fcbe397a322914ec97b757` on entry HEAD `13b013d`. Its binary patch and per-file identities are retained under `raw/setup/`. The closeout reconstructs that exact tree in a separate bare Git database, compares executable blobs with the current index and actual working files, and checks preserved authorities. The final commit includes the same tested implementation plus closeout/reproduction records; it is not relabeled as the source of the earlier executions. These are dirty-tree supporting checks, not a clean candidate/readiness result.

- All 40 focused discovery regressions passed. The full affected repository-tooling partition passed all 56 tests across its two owned files.
- Typecheck, lint, format and all five invariant entries passed with owned receipts. The invariant aggregate took 61,254 ms.
- The first partition attempt stopped before testing because its Git tree identity was unavailable during concurrent checks. No PASS receipt exists. The unchanged command passed when rerun serially. Concurrent `git write-tree` lock contention is a plausible explanation, not a proven diagnosis; the identity helper did not retain that subprocess stderr.
- An initial observation used the label `linked-path`. The final version uses `linked-or-aliased-path` to avoid asserting that Windows canonical-case differences are symlinks. All three routes were recaptured with the final scanner. Initial observations are retained as superseded records.
- Final scanner subprocess/transport durations were 414 ms on Windows, 5,114 ms on WSL and 428 ms on `codex.lab`. Each dispatch ran one scanner. These costs do not measure controller workflow performance. No candidate container, image build or hosted qualification job was launched by C1.
- Root `pnpm build` returned exit 2 / `NOT_READY` because `milestoneLoop.productionBuild` remains undeclared. Its failure manifest and absence of a PASS receipt are retained.

The curated closeout passed against 174 raw evidence files and fifteen independently checked supporting receipts. A one-byte addition to a separate copy of the remote report was rejected without a PASS receipt; the failure manifest, raw diagnostic and explicit outcome are retained in `evidence/tamper/`. No controller/OCI implementation changed, so the existing B matrix was audited on entry and was not rerun as C evidence. No complete candidate-tier floor, full owner matrix, source no-argument verification, native Windows workflow or live-agent/human result is claimed.

## Reproduce

Use Node 24.18.0/pnpm 11.15.1. Inspect the archive member paths, then extract `evidence/supporting-evidence.tar.gz` into a fresh task-local directory. It contains `raw/` and `raw-inventory.json`. Run:

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-C/verify-closeout.ts artifacts/<extracted-root> artifacts/<fresh-closeout-output>
```

The archive seal is in `evidence/manifest.json`. The command checks actual archive/raw hashes, fifteen receipts, the full 56-test owner report, three exact scanner bindings, source reconstruction, preserved authorities, NOT_READY build and retained incident/failure evidence. A recorded closeout receipt/report is under `evidence/closeout/`.

To repeat discovery, freeze the intended source index, leave all tracked implementation changes staged, copy the exact standalone scanner to a fresh task-local directory on the selected known Linux route, and obtain the native kernel release through a trusted read-only OS query. Invoke:

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-C/run-discovery.ts <native-windows|wsl-ubuntu|ssh-codex-lab> <native-node-path> <scanner-path> <observed-kernel> <fresh-output>
```

The final dispatch records preserve exact arguments, source pins and local paths. On Windows, use the actual pinned `node.exe` and repository scanner paths. The Linux task directories used here are `/home/duncan/oc1-vTdDaF` and `/tmp/orch-auth-c1-4ksPI8`; these are reproduction observations, not portable installers. On each route the scanner asserts Node 24.18.0 and its dispatched content hash. Do not execute a discovered launcher merely to see whether it is installed.

## Supported Windows options and next work

Docker documents native Windows client installations with a Linux backend, but does not support Docker Desktop on Windows Server 2022. A dedicated supported Windows client environment would still need disposable-host isolation and the actual pinned executor/workflow qualification; no such environment was provisioned here. The frozen Windows Server 2022 reference environment remains unresolved and has not been replaced by this observation. [Docker Windows installation requirements](https://docs.docker.com/desktop/setup/install/windows-install/).

A native Windows controller can in principle use a Linux container backend while remaining a Windows process; running the controller itself inside WSL remains Linux execution. A remote Docker endpoint alone is insufficient for the current executor: bind mounts refer to the daemon's filesystem, whereas the executor currently supplies local absolute source/store paths. Docker Desktop supplies its own host-file sharing, and a different remote route would need explicit, tested transport/path handling without weakening the existing policy. [Docker bind-mount semantics](https://docs.docker.com/engine/storage/bind-mounts/), [Docker SSH/TLS access](https://docs.docker.com/engine/security/protect-access/).

Continue ORCH-AUTH-01-C from one explicitly bounded disposable-host lifecycle and trusted provenance route, before dispatching controllers that need Docker. Missing host/routing evidence stays `NOT_READY`; do not use the workstation, the now-installed LXD service, a Docker socket mount, WSL relabeling or an arbitrary remote context as a substitute. The existing r2 approval remains settled. Source activation/adoption, bounded production build, complete platform/failure-family breadth, exact readiness and human acceptance remain separate unfinished gates.
