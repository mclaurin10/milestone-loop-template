# ORCH-AUTH-01-A: local Linux runtime qualification

The existing WSL Ubuntu Docker executor reached all six required OCI cases.
Independent inspection found and repaired one harness defect: normal-case
build/Vitest reports were deleted with the temporary candidate after their
hashes had been recorded. The matrix now retains those exported bytes with
the existing bounded artifact publisher and verifies the retained inventory
before cleanup. Fixture files, case meanings, executor policy, limits,
image recipe, package scripts, CI and active authority are unchanged.

The approved r2 digest remains
`53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108`.
This is local runtime evidence. Source readiness, native Windows qualification,
disposable qualification-host suitability, live agent/human acceptance,
authenticated producer/consumer delivery, authority migration and controller
state adoption remain incomplete. WP6e/WP6f evidence retains its original meaning.

## Observed identities and outcomes

| Observation                               | Result                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Entry source                              | `2ec1d253ffe26b6051c68abb545a8cddef417984`, tree `7ae1542586eeea382c46b5a38064f56f632d3e11`                             |
| Repaired source                           | Frozen index tree `73050cad83ec0f312498792c47bd55bff5bea060` on the entry HEAD; exactly three source/test paths changed |
| Linux checkout                            | `/home/duncan/oa1-CKn8x9/src`, standalone clone with no remotes or shared objects                                       |
| Runtime                                   | Ubuntu 24.04.4, WSL 2 kernel 6.6.87.2, UID 1000, Docker client/server 29.1.3                                            |
| Node / pnpm                               | Linux `24.18.0` / `11.15.1`, installed task-locally; root and fixture dependencies separately frozen                    |
| Image                                     | `sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad`                                               |
| Image input hash                          | `0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3`                                                      |
| Normal / boundary                         | PASS / PASS                                                                                                             |
| Artifact link / quota / output flood      | ERROR / ERROR / ERROR at their intended boundaries                                                                      |
| Stubborn descendant                       | TIMEOUT with child evidence and container removal                                                                       |
| Owned containers / volumes after each run | 0 / 0                                                                                                                   |

The first unchanged matrix took 44.259 seconds. It correctly exercised all
six outcomes, but its retained evidence could not pass the independent raw
artifact gate. The repaired complete matrix took 52.863 seconds; its audit
validated 47 retained files, the normal command-owned receipt, all three raw
workspace artifacts, one actual Vitest assertion, six containment reports,
effective policies and separate post-run Docker observations. Both runs
reused the same inspected immutable image; neither built a new image.

Two local producers were used: the requested initial qualification and one
rerun justified by the observed retention defect. No CI or full source/native
qualification was dispatched. This is not a timing improvement claim.

## Verification and preserved limitations

The committed handoff audit passed in committed mode with 98 files and five
historical receipts. The fresh protected-integrity check passed 13 checks.
The repair passed 24 focused tests across artifact, executor, source-identity
and image tests, the invariant aggregate and all five entries, typecheck,
lint and formatting. The independent runtime auditor rejected the initial
missing reports and a copied bundle with a one-byte Vitest-report mutation;
both failures retain manifests without PASS receipts.

`pnpm build` returned exit 2 / NOT_READY because the live legacy
`package.json` has no `milestoneLoop.productionBuild` declaration. The
declaration and build implementation are unchanged from the entry source;
this is an open source-build requirement, not a passing check. The contained
OCI fixture's separate build/typecheck/Vitest command passed. No source
candidate tier, full owner-partition floor, no-argument readiness or broader
completion is claimed by these focused runtime observations.

The first installer incorrectly selected pnpm's non-executable compatibility
`pnpm.cjs`; package metadata identifies `pnpm.mjs` as the executable. Its
temporary directory was unavailable after WSL restarted. The successful
installer resolves the installed executable and keeps its runtime under
`/home/duncan` with mirrored logs. Exact Node was checked against the official
download checksum. Docker was neither replaced nor reconfigured. The
production resolver uses the Linux pnpm store read-only in candidate containers.

## Evidence and reproduction

The curated `evidence/` bundle contains the two raw matrix archives, supporting
checks and failure diagnostics, the successful runtime audit receipt/report,
and a receipt-owning closeout inventory. Local development originals remain
under `artifacts/orch-auth-01-a/`. The raw archives retain exact scripts,
toolchain/runtime observations, Git source patch, logs and artifacts.

The repaired matrix was explicitly bound to a frozen index. Later record-only
paths in this increment do not change its executable source bytes. Its exact
tree can be reproduced without inventing a commit: in a fresh standalone clone
of the entry commit, apply `artifacts/oa2/setup/source.patch` from the repaired
archive with `git apply --index`, then check that `git write-tree` returns the
recorded `73050cad...` tree. Keep that clone's source unchanged. The published
patch is the actual staged diff captured before the real matrix ran.

With exact Node/pnpm on PATH, safely extract `evidence/linux-retained-evidence.tar.gz`
into an absent directory. From a repository containing the entry HEAD and
reproduced tree objects, run the independent auditor with five positional arguments:

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-A/audit-runtime.ts <extracted-root> artifacts/oa2/matrix 2ec1d253ffe26b6051c68abb545a8cddef417984 73050cad83ec0f312498792c47bd55bff5bea060 artifacts/<fresh-audit>
```

The archive's setup scripts document the actual Linux commands. A new runtime
run must use fresh absent output directories and appropriate existing Linux
paths, install the pinned root dependencies, separately hydrate the exact
fixture lock as the protected CI workflow does, and run the full
`pnpm test:oci-container --output artifacts/<fresh-id>` matrix. Preserve each
failure and audit raw artifacts before calling the runtime qualified.

Next: inspect and plan one real public workflow with an intended rejection,
qualified disposable-host requirements and an authenticated read-only evidence
handoff. Inspect native Windows provider feasibility early. These remain
separate from source activation, full qualification and the human gate.
