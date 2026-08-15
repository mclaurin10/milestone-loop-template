# Current Execution Plan

**Status:** WP3d candidate implemented; stable-tree milestone verification pending
**Updated:** 2026-08-14
**Owner:** autonomous loop

## Objective

Implement WP3d: the production OCI data plane behind the WP3c
`trusted-container` control plane. Candidate-authored focused checks and the
exact no-argument aggregate must run from an exact, disposable verification
clone inside a fresh container addressed by an immutable image identity. The
controller must enforce the fixed mount, network, privilege, resource,
artifact, output, timeout, and cleanup policy and retain independently
inspectable execution evidence. A failure to establish any required boundary
must remain infrastructure/NOT_READY with no host fallback.

This increment completes source and semantic coverage on every host, and it
adds the smallest sufficient runtime-backed normal/adversarial matrix. Real
containment acceptance requires that matrix to execute against Docker or
Podman. The Windows host has no native OCI client, but the user authorized a
Docker Engine installation in WSL2 Ubuntu; that Linux engine is now available
for the real matrix. Injected adapters, bare WSL `unshare`, and Windows process
supervision remain non-OCI evidence.

## Explicit Non-goals

- Do not change `PROJECT_GOAL.md`, the immutable evaluation contract, package
  readiness profile, stage meanings, success weights, deadlines, or existing
  skip policy.
- Do not add an automatic local, WSL, native-Windows, or mock fallback for
  trusted execution. `unsafe-local-diagnostic` remains explicit and
  completion-ineligible.
- Do not claim product completion, autonomous readiness, native-Windows
  containment, POSIX CI coverage, or hidden/human validation.
- Do not reuse a candidate container across commands or tests. Only an image
  proven to match the same image-input hash may be reused.
- Do not broaden candidate mounts to the target repository, controller state,
  host home, Codex credentials, container socket, or unrelated host paths.
- Do not perform the later WP4 commissioning/placeholder replacement or WP6
  verification-partition optimization.

## Goal and Contract Constraints

- `PROJECT_GOAL.md` is still the frozen placeholder authority. WP3d is a
  trust-boundary infrastructure increment, not a product-system increment.
- Candidate commands continue to pass command-policy validation and command-
  owned receipt validation. OCI containment is additive and may not replace
  candidate identity, protected-root, readiness-history, integration,
  reconciliation, or receipt gates.
- Exact Node `24.18.0` and pnpm `11.15.1` must be observed inside the execution
  image as well as at the controller. The execution image is used only by
  immutable `sha256:` identity.
- The container is non-root, has a read-only root filesystem, no network, all
  Linux capabilities dropped, `no-new-privileges`, bounded CPU/memory/PIDs,
  bounded tmpfs/evidence storage, and no container socket. Writable scope is
  limited to the disposable clone and bounded container-local temp/evidence
  filesystems. A host pnpm store, when used, is read-only and installation
  uses copy semantics.
- Every execution starts from a controller-created no-hardlink detached clone
  of the exact clean candidate commit, with origin removed and identity
  revalidated. The mutable Worker workspace is never mounted into the
  container.
- Every candidate container has a controller-generated name/labels and is
  created, started once, stopped/killed on breach, inspected, copied out
  through a bounded regular-file-only exporter, and removed. Cleanup failure
  is non-passing and recorded; it never makes the container reusable.
- OCI client processes remain under the WP3a/WP3b shared bounded supervisor.
  Timeouts/output breaches also trigger explicit daemon-side container stop /
  kill / remove so killing the client cannot leave a candidate alive.
- Controller-owned evidence records runtime server version, exact image ID,
  image-input hash, fixed policy versions, candidate commit/tree, container
  lifecycle/cleanup facts, exported artifact inventory, and capability ID.
  Candidate-supplied identity or evidence cannot attest this boundary.
- Preserve the human file `Implementation-ready improvement plan 8-5-26.txt`
  outside commits and byte-identical at Git blob
  `d0abdd24f404d9dc335818c355e39f7cfc531300`; preserve ignored `.claude/`.

## Observed Baseline

- Handoff `HEAD` is `ca90f91f987c29b7c9121de8fe9859c49aa3a966`
  (tree `24c0f31ff0c2ed8b4c759ff7e0f99325322037d2`) on `master`, four
  commits ahead of `origin/master`. WP3c implementation is
  `cc17d8e5f22beb3eb3be9871bb6fed5efa9c031b`. The only visible untracked
  path is the protected human improvement-plan file.
- Retained WP3c handoff evidence is
  `artifacts/wp3c-final-contract-20260814/`: result 11,488 bytes,
  SHA-256 `9f8858b41d408ae86fe1ab120be3273356be1b9859ebbaa7515fdac5a5783ed5`;
  manifest 3,614 bytes, SHA-256
  `0aa46cfd03a8703dc82f29030c237172f4a5c344f8fe2920d979f8cdbbf240a8`.
  It records exact Node/pnpm pins, all contract-integrity checks PASS, the
  declared dependency placeholder FAIL, a dirty focused run, and an
  unattested/completion-ineligible trusted provider. It is not reused as WP3d
  evidence.
- The initial `pnpm loop:doctor` was read-only and reported schema `1.7.0`,
  valid config, exact pnpm but host Node `25.9.0` unless the repository-pinned
  runtime was prepended, and trusted execution `missing-implementation` with
  Docker and image absent. No network call was performed. The WP3d candidate
  now supplies the implementation; because the Windows controller still has no
  native Docker client and the default image remains intentionally null, its
  final doctor result must stay honestly `NOT_READY` rather than borrowing the
  separately exercised WSL capability.
- Initial host probes found no `docker`, `podman`, `nerdctl`, `containerd`,
  `ctr`, `buildah`, `runc`, or `crun`; bare WSL `/usr/bin/unshare` and Windows
  Job Object/process services were rejected as substitutes. The user then
  authorized installation of Ubuntu's signed `docker.io` package. WSL2 Ubuntu
  24.04 now runs Docker Engine/client `29.1.3`, containerd `2.2.1`, runc
  `1.3.4`, overlayfs, systemd cgroup v2, and builtin seccomp. It began with zero
  containers/images. User-local Linux Node `24.18.0` was downloaded from the
  official release and verified against SHA-256
  `55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742`;
  Corepack pnpm `11.15.1` is active for the runtime-backed test checkout.
- WP3c already owns strict provider selection/identity and routes focused,
  milestone, tier, exact aggregate, state, review, integration, and
  reconciliation boundaries. The WP3d candidate now supplies the production
  Docker executor and capability probe while preserving those owners and every
  no-fallback/ineligibility check.
- The prior structural gaps now have source and semantic coverage: immutable
  image-input/cache ownership, exact private verification clones, fixed
  runtime/mount/resource construction plus interpreted-policy inspection,
  daemon-side stop/kill/remove, bounded Docker tmpfs workspace/evidence
  volumes, a read-only lifetime/export helper, regular-file-only publication,
  and a serial real OCI harness. Final all-case runtime and broader evidence is
  deliberately deferred until this tracked candidate freezes.

## Affected-test Matrix (defined before implementation)

| WP3d component                                                                                                                    | Directly affected fast tests during implementation                                                                                                                          | Runtime/provider integration                                                                                                                                                                                                       | Broader gate at milestone                                                          | Execution discipline                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OCI image-input hashing, immutable image resolution, and build-cache identity                                                     | new `container-image.test.ts`; `execution-provider.test.ts`; `doctor.test.ts`                                                                                               | new serial `container-executor.oci.ts` image fixture, resolved once per unchanged input hash and reused by image ID                                                                                                                | orchestrator + unit aggregates; typecheck/lint/format                              | Inject runtime probe, clock, and short deadlines. No image build without a runtime; never cache/reuse a container.                         |
| Exact disposable clone creation, no-hardlink/origin-free identity validation, path/reparse checks, and cleanup                    | new `verification-clone.test.ts`; affected `git-isolation.test.ts` only if shared helpers change                                                                            | OCI normal-path Git identity and source-mutation isolation cases                                                                                                                                                                   | orchestrator + unit aggregates                                                     | Pure filesystem/Git fixtures may shard. Clone failures are focused reproductions; candidate workspace stays unmounted.                     |
| Fixed Docker create/start/copy/inspect/remove argv and mount/network/privilege/resource policy; fail-closed Podman classification | new `container-executor.test.ts`; `execution-provider.test.ts`; `config.test.ts`; `schema.test.ts`                                                                          | OCI policy self-inspection plus outside read/write, home/credential, target/state, store, socket, symlink/junction, artifact escape, local/external network, PIDs, timeout, stubborn-descendant, held-pipe, and output-flood cases | orchestrator + unit aggregates; typecheck/lint/format                              | Semantic tests inject a scripted runtime adapter. Real OCI cases run serially in one bounded pool with fresh containers.                   |
| Daemon-side termination, exactly-once settle, artifact quota/export, regular-file/hash inventory, and disposable cleanup          | `container-executor.test.ts`; only directly affected `process-supervisor.test.ts`, `command-runner.test.ts`, and `evidence-receipt.test.ts` cases                           | OCI timeout/ignore-signal/descendant/output/artifact-quota cases                                                                                                                                                                   | orchestrator + unit aggregates                                                     | Never run process-tree/containment tests concurrently. Diagnose any long failure with one focused case, not a matrix rerun.                |
| Provider capability/identity wiring, no-fallback behavior, and doctor classifications                                             | `execution-provider.test.ts`; `execution-provider-identity` coverage; `doctor.test.ts`; `config.test.ts`; `schema.test.ts`                                                  | provider executes one real contained command only when complete capability is available                                                                                                                                            | orchestrator + unit aggregates; live `loop:doctor`                                 | Inject probes and short configurable probe deadlines. Runtime absence remains actionable NOT_READY.                                        |
| Focused receipt export, exact aggregate artifact relocation/parsing, tier/milestone identity, integration/reconciliation denial   | directly affected cases in `verifier.test.ts`, `verification-tier.test.ts`, `aggregate-verify-identity.test.ts`, `target-integration.test.ts`, and `reconciliation.test.ts` | OCI normal matrix: build, typecheck, Vitest, read-only Git, command receipt, exact aggregate                                                                                                                                       | orchestrator + unit aggregates; safety demo only if orchestration behavior changes | Run only affected cases while iterating. Do not rerun unchanged WP2 recovery suites unless a shared schema/path owner changes.             |
| Documentation, policy constants, and evidence/timing inventory                                                                    | schema/config documentation tests if affected; `git diff --check`                                                                                                           | runtime matrix writes one controller-owned containment manifest with byte counts/hashes                                                                                                                                            | immutable/hash inspection and no-argument verifier only when contract requires it  | Record wall time per stage and five slowest tests from machine reports. Optimize recurring overhead only as a separate cohesive increment. |

## Implementation Steps

1. [x] Inspect the frozen goal/contract, active WP3c plan and logs, clean/tracked
       state, retained WP3c receipts/hashes, `loop:doctor`, audit CD-01/P0.2, the
       full improvement-plan WP3 contract, current provider call sites, and OCI /
       WSL / native runtime availability. Define this affected-test matrix before
       production changes.
2. [x] Add strict versioned OCI image/policy contracts and an image-input hash
       owner. Implement injected runtime discovery and immutable image inspection /
       cache validation. A build helper may reuse an image only when its complete
       controller-owned input hash and labels match; missing runtime/image/pins is
       NOT_READY. Support Docker's exact arguments and reject unimplemented Podman
       policy rather than guessing equivalence.
3. [x] Implement the exact disposable verification clone owner and bounded
       artifact exporter. Reject dirty/wrong commits, alternates/hardlinks at the
       trust boundary, unsafe roots/reparse substitutions, links/special files,
       path escapes, over-limit outputs, and conflicting destinations. Always
       remove temporary clones after controller-owned export.
4. [x] Implement the OCI executor lifecycle through the shared supervisor:
       fixed create/start/inspect/copy/stop/kill/remove operations, non-root and
       read-only-root policy, no network/capabilities/new privileges/socket,
       fixed resource/tmpfs bounds, read-only store, safe environment translation,
       exact toolchain preparation, and daemon-side cleanup after every outcome.
       Persist a controller-owned containment report and never reuse containers.
5. [x] Wire the real executor and capability probe into the WP3c provider,
       confirm the existing strict config/schema/default/template/example contract
       needs no shape change, update its documentation, and preserve provider
       identity equality plus all ineligible/no-fallback boundaries. Update
       verifier/tier result-path handling only if required for exported contained
       artifacts; the existing owners required no semantic change.
6. [x] Add the fast semantic tests from the matrix, using injected adapters,
       clocks, deterministic identifiers, and short deadlines. Run only directly
       affected tests, relevant provider/container integration probes, and
       typecheck/lint when their affected surface warrants it. Keep process-tree
       tests exclusive.
7. [x] Add the real OCI normal/adversarial test harness. Compute one image-
       input hash, build/resolve that image once, then create a fresh uniquely
       named container for every candidate execution. If no runtime is available,
       retain a machine-readable unavailable result and leave all real-containment
       acceptance items open; do not mark skipped/mock cases as passing.
8. [ ] Freeze source/tests/plan/log wording, inspect Git scope, then run the
       complete applicable suites once in safe order (pure shards only; exclusive
       process/containment pool), collecting stage wall times and the five slowest
       tests. Diagnose a long failure with focused reproduction only.
9. [ ] Independently validate every receipt, manifest, artifact byte count,
       SHA-256, skip/unavailable classification, immutable hash, human-file blob,
       and Git identity. Commit the cohesive verified increment with explicit
       paths. Run the required no-argument verifier only if the repository
       contract calls for it on that stable candidate tree; do not push or claim
       readiness.

## Acceptance Criteria

- Complete trusted capability invokes the production OCI executor; missing or
  mismatched implementation/runtime/image/toolchain/policy fails before
  candidate launch and never reaches local execution.
- The exact image used by every result is immutable and matches the recorded
  input/cache identity. An unchanged image-input hash causes at most one image
  build; a changed hash cannot reuse the prior image. Containers are always
  fresh and disposable.
- The mutable Worker workspace, target repository, controller state, home,
  credentials, container socket, and unrelated paths are absent from mounts.
  A real adversarial fixture cannot read or mutate them, and before/after
  canary hashes match.
- Candidate execution observes no network, no added capabilities, no-new-
  privileges, non-root identity, read-only root, fixed CPU/memory/PID bounds,
  bounded tmp/evidence storage, and copy-mode dependency materialization from
  any read-only store.
- Timeout, cancellation, output flood, held streams, fork flood, and ignored
  termination leave no live candidate container or descendant. Cleanup facts
  are recorded; cleanup uncertainty is non-passing.
- Only regular files beneath declared export roots are copied to controller
  evidence. Links, special files, traversal, substitution, artifact quota
  breach, hash/size drift, and destination conflicts fail closed.
- Normal contained build, typecheck, Vitest, read-only Git, command receipts,
  and exact aggregate paths preserve all WP3c identity/receipt/result meaning.
  Candidate-returned provider or containment data never becomes attestation.
- Doctor is offline/read-only and distinguishes implementation, runtime,
  immutable image, toolchain, and policy availability with injected fast
  probes. This host truthfully remains NOT_READY until an OCI runtime and
  pinned image are supplied.
- Existing WP2 recovery, WP3a/WP3b supervision, WP3c provider/integration, and
  immutable contract tests remain green. Existing platform skips are neither
  broadened nor relabeled.
- Final evidence names exact commands/tree/runtime/config, records wall time by
  stage and five slowest tests, and has independently recomputed bytes/hashes.

## Verification Order

All commands prepend `.tools/node-v24.18.0-win-x64` to `PATH` and confirm pnpm
`11.15.1`. During implementation, use exact affected files/cases from the
matrix; do not run a full verifier baseline.

At the milestone, after source/tests/plan/logs are stable:

1. Pure semantic/container-policy tests, safely sharded where independent.
2. Provider/verifier/tier/integration semantic tests.
3. Process-tree tests in an exclusive bounded pool.
4. Real OCI normal/adversarial matrix in the same exclusive pool, or one
   explicit machine-readable unavailable result when no runtime exists.
5. `pnpm test:orchestrator`, then `pnpm test:unit` (never concurrently).
6. `pnpm loop:demo-safety` if the shared orchestration boundary changed.
7. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `git diff --check`.
8. Independent receipt/artifact/hash/timing/slow-test inspection.
9. Required exact no-argument `pnpm verify` only on the final stable tree and
   only when mandated by the repository contract. Its declared placeholders
   or unavailable OCI capability remain non-passing, never suppressed.

## Risks and Recovery

- Docker and Podman CLI/lifecycle behavior differs. Version 1.0.0 supports and
  tests Docker only; Podman fails policy capability checks before execution.
  Add a dedicated adapter and real matrix before declaring another runtime.
- Killing a supervised CLI does not necessarily kill the daemon-owned
  container. Container identity must be known before start and independently
  stopped/killed/removed in `finally`; absence must be inspected.
- Bind mounts and Windows/WSL path conversion can follow reparse points.
  Create clones beneath a controller-owned temporary root, validate resolved
  roots immediately before create, and cover real Windows mapping in later CI;
  no unsupported-platform claim is made here.
- Container output is hostile. Export into a new staging root, inventory with
  no link/special-file following, enforce byte/file limits, hash twice around
  publication, and reject conflicts rather than merging arbitrary trees.
- Offline pnpm stores may lack target-platform packages. Treat preparation as
  an infrastructure failure and retain diagnostics; do not enable candidate
  network or reuse host `node_modules`.
- Runtime/image absence blocks only real containment evidence, not safe source
  and semantic progress. Recovery is ordinary source-control reversal of this
  cohesive increment; no external images or containers are deleted unless
  their exact controller-created name/label is proven.

## Progress and Evidence

- 2026-08-14: WP3c handoff, retained evidence bytes/hashes, current tree,
  frozen instructions, audit/improvement requirements, provider paths, and
  `loop:doctor` were inspected without running the full verifier. Exact pinned
  Node/pnpm were separately confirmed. Host and WSL runtime probes found no
  OCI implementation. WSL `unshare` and Windows process services were rejected
  as substitute containment evidence. The affected-test matrix above was
  defined before production implementation.
- 2026-08-14: With explicit user authorization, installed Ubuntu's signed
  `docker.io` package and dependencies inside the existing WSL2 distribution,
  enabled the daemon, added the normal WSL user to the Docker group, and
  verified Engine/client `29.1.3`, overlayfs, cgroup v2, seccomp, and no prior
  containers/images. Installed exact Linux Node/pnpm pins in the user's local
  WSL directory after verifying the official Node archive checksum. No Windows-
  wide Docker configuration or repository source was changed by setup.
- 2026-08-14: Added the immutable image-input owner and Dockerfile. Pinned base
  `node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059`
  resolved image-input hash
  `0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3`.
  It was built once as immutable image
  `sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad`
  and has only been reused by image ID; every candidate/helper container has
  remained unique and disposable.
- 2026-08-14: Implemented exact clean private clones, Docker-only policy and
  prelaunch interpretation checks, bounded Docker tmpfs volumes, read-only
  exporter lifetime, offline/frozen/store-integrity-checked copy installs,
  daemon stop/kill/remove and absence confirmation, combined artifact quotas,
  exclusive-handle publication, containment reports, provider wiring, and the
  serial normal/boundary/artifact-link/artifact-quota/output/hang runtime
  harness. Podman is an honest policy mismatch in version 1.0.0 rather than an
  untested compatibility claim.
- 2026-08-14: A diagnostic real normal case passed under WSL Docker at
  `artifacts/wp3d-oci-normal-policy-repro-20260814-r14/result.json`: 2,401
  bytes, SHA-256
  `6b08bf27811432831e84a84ff620c73dccc8f700a8b5de0049d5356603b01503`,
  candidate duration 11,896 ms, zero image builds for the already-matching
  input, and proven candidate/exporter/volume cleanup. It is not reused as
  final evidence because later source hardening changed the candidate tree.
  Every preceding runtime failure was diagnosed with one focused reproduction;
  none is relabeled or counted.
- 2026-08-14: Fast image, clone, provider/doctor, artifact, and executor tests
  exercised injected probes/runners and short deadlines. A combined focused
  run exposed two 5-second copy stalls at
  `artifacts/manual/invariant-vitest-4604/`; the focused repair passed artifact
  5/5 at `artifacts/manual/invariant-vitest-428/`, then the final affected
  executor surface passed 10/10 in 5,729 ms at
  `artifacts/manual/invariant-vitest-13336/` with typecheck PASS in 8,122 ms at
  `artifacts/manual/typecheck-22284/`. The final regression proves cleanup is
  attempted when a daemon may have accepted a create whose client response
  timed out. Both command-owned receipts and their declared artifacts were
  independently byte/hash checked. Windows dependency execution was
  restored from a clean pinned install after a WSL-created Linux-symlink module
  tree was moved intact to ignored setup quarantine. Final broader suites, real
  all-case containment, stage timings, and slowest-test extraction remain the
  stable-tree milestone gate and are not preclaimed here.
- 2026-08-14: Independent inspection rejected the first nominal all-case
  result at `artifacts/wp3d-oci-milestone-20260815/` because its 1,500 ms hang
  deadline expired during offline installation: the preflight and published
  command inventories contained zero files, so the claimed stubborn descendant
  had not launched. That result is not evidence. A focused repair raised only
  the real hang deadline to 12,000 ms and made a retained, valid `child.json`
  PID marker mandatory. The focused reproduction passed at
  `artifacts/wp3d-oci-hang-repro-20260815-r1/result.json`: 2,867 bytes,
  SHA-256
  `a80f3554c8e63e942ee9878170d814545a8967328aead5c74d6a23c6cfd09e9a`,
  one published marker, zero image builds, and complete resource cleanup. It is
  diagnostic only because this plan/log record changes the final staged tree.
- 2026-08-14: The corrected all-case matrix passed on its then-frozen tree at
  `artifacts/wp3d-oci-milestone-20260815-r2/result.json` (6,923 bytes,
  SHA-256
  `a70ddbf431068ad28b4619579c9149ab12d29a3986739752dc1ae65485d88560`),
  including the required hang marker and zero builds/resources left. It is now
  diagnostic only: the first serial orchestrator aggregate exposed one stale
  WP3c-era expectation after 2,303,297 ms at
  `artifacts/manual/test-orchestrator-24192/` (460 tests: 457 passed, one
  failed, two unchanged WP5 skips; no passing receipt). The sole failure
  expected `missing-implementation` even though WP3d now supplies it. A focused
  reproduction failed at `artifacts/manual/invariant-vitest-19880/`; the test
  now injects runtime unavailability and preserves NOT_READY/no-fallback with
  `missing-runtime`. Its exact file passed 14/14 in 7,024 ms at
  `artifacts/manual/invariant-vitest-5736/`, whose 5,269-byte report matched
  SHA-256
  `9da5c71e5eca1e4ff0f8b70054469c7e3d4ca6dd287df08536c8db6df22bfa0c`.
- 2026-08-15: The next exact-tree matrix passed at
  `artifacts/wp3d-oci-milestone-20260815-r3/result.json` (6,923 bytes,
  SHA-256
  `2d8c428b3b07c9bc8ce4cde169cbd687df3432de19e6bb992cb0a8346302c06e`),
  and its reports/artifacts/cleanup were independently checked. The required
  orchestrator rerun then passed 458/460 with the two unchanged WP5 skips in
  2,254,714 ms at `artifacts/manual/test-orchestrator-14780/`; its 161,116-byte
  report matched SHA-256
  `ad4346de23a05e526742510e44894202c905b63e9d685f3d12b5b02342ad746b`.
  Unit passed 471/473 with the same skips in 2,291,871 ms at
  `artifacts/manual/test-unit-15604/`; its 165,029-byte report matched SHA-256
  `f1f7f96dd75931132dacf552c560856c65dbd4d979e401cd384dc9de7371c0a3`.
  The safety demonstration passed in 3,406 ms with its 11,931-byte artifact at
  SHA-256
  `8cbd2787aa81681204aaa729bdc6b1fd053abfe60ac7d171a69ebbfa1cb7eaf6`,
  and typecheck passed in 11,807 ms at `artifacts/manual/typecheck-1752/`.
  Static inspection then found two harness-only useless initial assignments;
  the two-line removal passed lint/typecheck at
  `artifacts/manual/lint-14612/` and `artifacts/manual/typecheck-11464/`.
  Format inspection separately found the new fixture lockfile unnormalized;
  formatting only that file passed at `artifacts/manual/format-check-7128/`.
  These otherwise-passing aggregate/runtime artifacts are diagnostic because
  the two static repairs and this record change the final tree. No semantic
  failure was suppressed and no passing receipt is reused across that change.
  Measured wrapper overhead was only 6,239 ms (0.28%) for orchestrator and
  5,882 ms (0.26%) for unit; assertion execution accounts for the long wall
  time. Recurring harness overhead is therefore not significant enough to
  justify a separate optimization increment or risk coverage in WP3d.

## Exact Next Action

Inspect Git scope and stage only the frozen WP3d candidate paths. Then execute
steps 8 and 9 without further tracked edits: one serial real OCI all-case
matrix at `artifacts/wp3d-oci-milestone-20260815-r4/`, complete applicable suites in non-concurrent order, independent
receipt/artifact/hash and five-slowest-test inspection, commit the unchanged
candidate, and the required no-argument verifier. Machine outcomes belong in
the fixed ignored evidence paths and final handoff so recording them cannot
invalidate their tree.
