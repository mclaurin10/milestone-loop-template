# ORCH-AUTH-01-B: public planning and authenticated evidence input

The first public planning workflow and its contained evidence handoff are qualified on the local Linux OCI route. This is supporting evidence with completion eligibility false. Source activation, source readiness, native Windows, a general host for controllers that launch Docker children, run/integration workflow breadth and live human acceptance remain incomplete.

The approved r2 normative digest remains `53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108`. No authority, acceptance, lock, commissioned ledger, package script or protected CI job changed. No controller state or private controller ref was initialized in the source checkout.

## Observed behavior

The producer runs inside the existing restricted OCI policy. It creates two disposable repository copies and invokes the production `plan --json` dispatch through the exported `runLoopCli` entry. Each copy initializes through the production controller and state store. A deterministic `CodexClientLike` transport supplies proposal responses through the production SDK gateway adapter; it supplies no state, policy decisions or receipts. This proves workflow mechanics and does not prove live model behavior or token usage. The ordinary CLI still selects its real SDK transport by default.

- `planning-admission`: one schema-valid tooling proposal is accepted and persisted as ready. One planner invocation; no worker or candidate workspace.
- `planning-protected-path-rejection`: the same schema-valid proposal names `PROJECT_GOAL.md` as its permitted path. Both configured planner attempts reach `PROTECTED_SCOPE`; the controller records `PLANNER_POLICY_LIMIT`, escalates and leaves the queue empty. This is the actual policy boundary, not an earlier infrastructure failure.
- Both copies preserve their target commit, clean working tree and protected file bytes. Retained artifacts include state, policy decisions, planner requests/responses, SDK adapter records, escalation and run summaries.

Planning needs no Docker control plane and can run inside the approved contained-workflow route. No privileged nested container, host socket or credential mount was introduced. This result does not qualify a host for a controller that must launch candidate containers.

## Evidence input boundary

`qualification-input.ts` admits candidate-support only. It binds the coordinator/run/nonce, source commit/tree, approved authority digest, fixture digest, complete selected case list, actual platform, provider identity and producer container ID. The outer coordinator creates the selection, obtains provider/container identity through the real executor and retains the envelope digest independently of the delivered files. A self-consistent envelope alone is not authentication or maintainer approval. This is an out-of-band digest-and-context pin for the current trusted dispatch, not a portable signed remote-job protocol.

The executor accepts the input only for an explicit trusted controller command, at the fixed `/qualification-input` destination. It validates the envelope and inventory before execution, attests both intended and applied read-only mount state, and validates the same pinned bytes after execution. Limits are 256 files, 4 MiB, 512 directory entries and depth 16. Links, traversal, unexpected inventory and changed bindings fail closed. The local runner refuses inputs instead of dropping the isolation requirement. Ordinary commands retain the original exact four-mount policy; resource, user, network and privilege restrictions are unchanged.

A separate real container consumed both cases, validated producer-owned receipts and observations, and received `EROFS` when it attempted to create a file on the input mount. It wrote its own inspection receipt. The outer coordinator repeated the binding/artifact checks and confirmed producer and consumer cleanup. A further Windows-side archive audit repeated those checks after transfer. That audit is archive inspection, not native Windows workflow execution.

## Exact evidence and cost

Entry source was `e01298be5cc76ad33f66a73870e5b6e9d1f661ef`. The fresh A closeout audit passed before implementation. The final tested qualification source is the genuine disposable commit `ae4e4fe5950d0a4711aadcf957bdb75479895911`, tree `0e81e7d8236d34c6982f363c9fb6a2bf7d45f5de`. The archive includes its patch against the entry commit, commit record and Git bundle. The source checkout's later closeout commit contains the same executable files plus record-only changes; it is not relabeled as the producer's commit.

Windows checks and Linux runtime producers used Node 24.18.0/pnpm 11.15.1. Runtime producers used WSL Linux and Docker 29.1.3 with immutable image `sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad`, tracked image-input digest `0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3`. The image was reused; zero image builds occurred.

The first workflow producer/consumer took 8,451/6,031 ms. Both functional outcomes passed, but the coordinator inventory incorrectly included its still-open stdout. The archive audit refused that inventory generation. The corrected inventory covers the three finalized producer/input/consumer roots. The fresh corrected producer/consumer took 16,494/10,268 ms, with 104 files independently verified after transfer. These measurements are observations, not a speedup claim.

Final envelope digest: `2f4c885e6fda2bb0c0c1b97405f20d9280399b5682a81732d90a06758310a1d8`. The real producer and consumer had different container IDs; all owned containers, exporters and volumes were removed.

The unchanged six-case OCI matrix ran once against the same final tested source and took 37,707 ms: normal/boundary PASS, artifact-link/artifact-quota/output-flood ERROR, hang TIMEOUT. The original A auditor was reused without edits; its report/command IDs retain the A name. It validated actual normal build/Vitest artifacts, all existing adversarial assertions, image/policy and cleanup. The retained combined runtime/matrix inventory contains 152 files. The additional toolchain/image/resource observations were captured after the matrix; their timing is recorded, not presented as preflight execution.

All 94 focused regressions passed with owned receipts and raw Vitest results. They include stale/cross-purpose/wrong source, authority, fixture, coordinator, provider and producer bindings; missing coverage/platform; missing receipt; altered, linked, traversing, excessive and deep input; the local-runner refusal; unexpected/writable mounts; and host-side mutation after launch with cleanup. Typecheck, lint, format and all five invariant entries passed. Initial lint/catalog-order failures are retained with the successful reruns. A one-byte mutation of the actual transferred producer report was rejected without a PASS receipt.

The root production build remains exit 2 / NOT_READY because the unchanged legacy package has no `milestoneLoop.productionBuild`. No full owner-partition floor, candidate tier, no-argument source readiness, CI dispatch or live-agent check is claimed by this focused increment.

## Reproduce the retained checks

Archive seals are in `evidence/manifest.json`:

- `linux-initial.tar.gz`: the initial functional run and its superseded inventory.
- `linux-qualified.tar.gz`: the final real workflow, complete OCI matrix, frozen source bundle and independent matrix audit.
- `supporting-evidence.tar.gz`: entry audit, focused/static/invariant receipts, failure diagnostics, Windows feasibility, transfer audit, tamper refusal and exact setup/runtime scripts.

Extract the three archives into separate `initial`, `qualified` and `supporting` directories under a task-local root. On the exact toolchain, run:

```text
pnpm exec tsx docs/runtime-qualification/ORCH-AUTH-01-B/verify-closeout.ts artifacts/<extracted-root> artifacts/<fresh-closeout-output>
```

The closeout validator checks archive hashes, 104 workflow files, the complete 152-file matrix/runtime inventory, eleven supporting receipts, all 94 focused tests, frozen executable-source equality, protected authority and the remaining NOT_READY/refusal outcomes. It inspects the actual bundled source commit in a separate bare Git database; it never initializes source controller state. A recorded closeout receipt/report are included under `evidence/closeout/`.

To repeat the producer rather than inspect archived evidence, reconstruct the source in a standalone clone from the preserved bundle/patch, install the exact frozen Linux dependencies, and execute `run-runtime.ts <fresh-artifact-directory> <immutable-image-id>`. Its source must be a clean committed tree and its provider must pass the actual production probe/attestation. The archived shell scripts document this host's task-local runtime paths; they are reproduction records, not portable installers. Do not use archived evidence as fresh closure.

## Next increment

ORCH-AUTH-01-C should establish an authorized disposable host for controllers needing Docker and investigate a supported native Windows route before expanding to run/integration workflows. Native Windows discovery found `ssh` and `wsl`, with no Docker or VM command among the inspected providers; it is recorded as NOT_READY, and no host configuration changed. Compatible authority readers, bounded target/product build, migration/activation, complete platform coverage and human acceptance remain later gates under the existing r2 approval.
