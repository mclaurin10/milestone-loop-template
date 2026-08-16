# Autonomy Log

Append one entry per completed increment: date, plan objective, verification
evidence (commands, result paths), commit id, and known gaps. Newest first.

## 2026-08-16 — WP5b canonical lifecycle status

**Objective.** Complete the bounded Status slice of WP5 by making
`pnpm loop:status -- --json` the single versioned, read-only resume surface for
uninitialized, ordinary initialized, pending-operation, target-drift, and
active-reconciliation states. Preserve the accepted WP5a Doctor authority and
all WP4d evidence while closing the roadmap gap for commissioning/profile,
target relation, lease, pending side effect, recovery disposition, latest
milestone/exact verification, integration eligibility, deferred work, and the
next safe command.

**Outcome before commit.** Status schema `1.0.0` composes accepted Doctor
schema `2.0.0` facts with validated canonical state and the existing read-only
operation inspectors; it does not search artifacts or derive completion from
logs. Target relation is explicitly target-oriented and distinguishes
`current`, `ahead`, `behind`, `divergent`, `uninitialized`, and fail-closed
`unavailable`. Recovery is normalized as `automatic`, `blocked`, `external`,
or `none`. Ordinary status now routes before reconciliation-controller opening,
so active reconciliation retains the common status contract without acquiring
a mutation capability. `reconcile-status`, Doctor, dry-run, mutation,
commissioning, provider, state, and verifier behavior are unchanged.

Doctor and detailed state are fenced to one canonical generation. When valid
commissioning aligns the branch sources, the Doctor observation, checkout,
and target-ref HEAD must also agree. Status retries movement once and then
returns `changed-during-inspection`, suppresses detailed state and integration
eligibility, and directs the operator to rerun status. Ancestry probes suppress
optional Git locks. CLI recursive redaction remains in force, and real child
process tests prove both active-state and missing-state paths leave status,
refs, state storage, and repository files unchanged.

**Verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, the
receipt-owning status/CLI/deterministic-operation shard passed 20/20 with zero
skips at
`artifacts/manual/wp5b-status-focused-final/invariant-vitest-report.json`
(7,566 bytes, SHA-256
`622931a8a34c2395f9d9af886c96dba7e48eec8b58a63e7ac6c2e393ecc48fd5`).
Its direct-telemetry begin hook was unavailable because the planned plain-Node
wrapper could not import a TypeScript module; this was reported as non-semantic,
while the command-owned PASS receipt and declared report remained complete.
The orchestrator aggregate passed 532/534 with zero failures and only the two
declared Windows POSIX skips across 170/170 suites at
`artifacts/manual/wp5b-test-orchestrator-final/orchestrator-report.json`
(187,483 bytes, SHA-256
`3a24a9905d4386a5c7c2de29d564313143ab9af0b49c83bd6d427e565f9e7236`).
The unit aggregate passed 545/547 with zero failures and the same two skips
across 172/172 suites at
`artifacts/manual/wp5b-test-unit-final/test-report.json` (191,507 bytes,
SHA-256
`adf81a781c1b9770b5d17984a204d1f7c8fe93b8a64604b20524322e33e9b06f`).

Receipt-owning typecheck, lint, and format all passed at
`artifacts/manual/wp5b-typecheck-final`,
`artifacts/manual/wp5b-lint-final`, and
`artifacts/manual/wp5b-format-final`; their report hashes are respectively
`69848e5391d2f1cdd5b12f10cc0960a231caa32b6872d79108ff4b863a0fc469`,
`12ceeddbeabb60e14088a18cd895ac120eca6433c112485a917eb1b9eaa90d84`,
and `ad28882c2184f6d2a73ccb80cbed5e49239604b1f950079a514c6efa1b15387b`.
Every receipt, manifest, declared report byte count, and SHA-256 independently
matched. `pnpm loop:demo-safety` passed all six scenarios at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260816171558718-6e19b0f2.json`
(14,968 bytes, SHA-256
`07fbaec742fe438634fa22e72ed4111926e13a4699ed422eae6f69c9ef3dac5d`).

Final source status emitted schema `1.0.0` with a stable snapshot, valid
readiness commissioning, target `master`, uninitialized canonical relation,
no lease or pending side effect, recovery `none`, no completed milestone or
exact verification, unavailable trusted execution, ineligible autonomous
integration, the accepted 9 passes / 3 warnings / 4 blockers, and
`git status --short --branch` as the next safe command. The state path and
private state/lease refs remained absent. HEAD/tree, tracked and staged bytes,
protected-plan identities, and both retained WP4d artifact identities remained
unchanged. No no-argument source verifier, OCI matrix, Doctor evidence rerun,
fresh-adopter proof, mutating loop command, push, or WP6/product/readiness work
occurred.

**Commit.** Assigned by the single cohesive WP5b commit containing this entry;
identify it as the newest commit touching the entry. No push is authorized.

**Known gaps.** The next dependency-ordered WP5 area is independent invariant
extraction. Later WP5 work still owns the strict-config corpus, Linux/CI race
coverage, and remaining operator documentation. The source remains honestly
blocked by the protected human plan, absent production build, active
placeholders, unavailable trusted runtime/image, and absent exact canonical
state. WP5b is not full WP5, readiness repair, autonomous readiness, product
implementation, or a push.

## 2026-08-16 — WP5a strict operational Doctor

**Objective.** Complete the bounded Doctor slice of WP5 by turning
`pnpm loop:doctor` into a complete read-only operational diagnostic and adding
a Doctor-only strict blocker exit, without changing source readiness,
commissioning, provider policy, product placeholders, or WP4d evidence.

**Outcome before commit.** Doctor schema `2.0.0` gives every check a stable
`pass`, `warning`, or `block` result with code, message, remediation, and safe
command where one exists. It emits complete ordered issues, counts, current
autonomous-integration eligibility, and the earliest safe next action. Ordinary
Doctor exits zero after an honest `ready` or `blocked` result; `--strict` emits
the same diagnostic and exits 2 only when a block exists. Structural config and
the installed SDK are independent facts, while normal config loading retains
its exact installed-SDK assertion.

The diagnostic reuses active commissioning and all four tier plans, the
production-build contract, provider capability/identity, canonical state,
operation recovery, protected-root, protected-identity, and lease authorities.
Configured paths are checked lexically and through the nearest existing
ancestor/realpath without creation. Exact verification is accepted only from
validated canonical state, a current intact copied result, readiness profile,
and the matching active completion-eligible provider identity. Pending
operations and simultaneous protected drift remain independently visible.
Doctor makes no network call and launches no build, verifier, container,
candidate command, or Codex turn; it writes no path, state, ref, mirror,
evidence, lease, or configuration.

**Verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, the accepted
receipt-owning Doctor/CLI/config shard passed 38/38 at
`artifacts/manual/invariant-vitest-7236/invariant-vitest-report.json` (13,426
bytes, SHA-256
`b7d62bb9cfbfe6b8b489e9802ddee2b77a2a0739e6c131042a0f2e7aafd7358f`).
The full orchestrator aggregate passed 523/525 with zero failures and only the
two declared Windows POSIX process-group skips at
`artifacts/manual/test-orchestrator-19716/orchestrator-report.json` (184,077
bytes, SHA-256
`fcc44893f0922bb3006cb6e16114d45e14b5fa89c6f78c9648fcf96232e8aad6`).
The unit aggregate passed 536/538 with the same two skips at
`artifacts/manual/test-unit-23304/test-report.json` (188,245 bytes, SHA-256
`9ab63d42d3ed2f01082799cf016ade0b69ba32125b73ab4018b7b7c41d6f5446`).
Every report hash/size matched its PASS receipt. Typecheck, lint, and format
passed with independently matched receipts at
`artifacts/manual/typecheck-7452`, `artifacts/manual/lint-22044`, and
`artifacts/manual/format-check-8972`. `pnpm loop:demo-safety` passed every
scenario at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260816150722143-fe2a229a.json`.
No source no-argument verifier, OCI matrix, fresh-adopter proof, or mutating
loop command ran. Final ordinary and strict source Doctor emitted byte-equivalent
schema `2.0.0` diagnostics with 9 passes, 3 warnings, and the honest 4 blockers
(dirty protected plan, missing production build, active placeholders, missing
trusted runtime). Ordinary exited 0, strict exited 2, integration remained
ineligible, and `git status --short --branch` was the next command. Git status,
absent state/lease refs, and absent state-path facts were unchanged.

**Commit.** Assigned only after the frozen WP5a candidate passes its final
Doctor, diff, staged-scope, and protected-identity audits; identify it as the
newest commit touching this entry.

**Known gaps.** Later WP5 increments still own status expansion, independent
invariant extraction, strict-config corpus, Linux/CI race coverage, and
operator documentation beyond Doctor. The source remains deliberately blocked
by the protected human plan, placeholder scripts, absent production-build
declaration, unavailable trusted runtime/image, and absent exact state. WP5a is
not full WP5, autonomous readiness, product implementation, or a push.

## 2026-08-15 — WP4d fresh-adopter bootstrap packaging

**Objective.** Complete one bounded WP4d distributable-template increment that
creates a fresh adopter-owned Git history without verifier source edits and
proves the generated technical scaffold can reach a truthful package-default
bootstrap PASS without changing or reinterpreting source readiness.

**Outcome before final milestone verification.** A strict versioned definition
and public no-clobber package command now generate the authority lock, generic
active configuration and registries, package metadata, real bootstrap app, two
deterministic commits, and a strict-ancestor commissioning input. A shared
Git-base anchor replaces the source-specific verifier hash literal and requires
the current lock and all four authority files to match the exact commissioned
base. The scaffold uses one kernel for Node, replay, Worker, persistence, and
rendering; every bootstrap stage exercises a real boundary and owns hashed
evidence. A separate retained proof runner adds offline copy-mode installation,
explicit one-shot commissioning, the manifest commit, one no-argument verifier,
independent receipt/artifact matching, marker/history checks, source-identity
scanning, and compact retained browser evidence.

**Implementation diagnostics.** No source aggregate, source no-argument
verifier, or OCI matrix was used for orientation. Under pinned Node `24.18.0`
and pnpm `11.15.1`, the authority/commissioning/package files passed 21/21
focused tests, direct tool TypeScript passed, and the proof auditor passed 3/3
including post-receipt artifact drift and asserted-PASS rejection. In a newly
generated commissioned fixture, dependency, format, lint, architecture,
typecheck, clean-clone build, four Vitest tests, two invariants, persistence,
Node/replay/Worker simulation, and real Chromium browser commands all passed.
The single budgeted diagnostic literal no-argument fixture run passed all 9
bootstrap stages in 40,944 ms with 10 valid command receipts and 18 declared
artifacts. Its result is 45,280 bytes / SHA-256
`21621834eaf1999de6034483ae9210a44c0ade1b1d2437ef0d4c3db2bc0a0177` at
`artifacts/wp4d-package-diagnostic-8/repository/artifacts/verify-2026-08-16T045227-338Z-8888/result.json`.
It reports `bootstrap_complete`, `autonomousReadinessEquivalent:false`, clean
candidate identity, and honest provider-based completion ineligibility. The
122,990-byte screenshot has SHA-256
`da927d28bc0d2132d4f4e5fe347059d5fb11586452c38c5b40fc9fc808bf0c21`.
Independent in-app browser inspection observed the readable production layout,
public Worker action, canonical extracted-4/tick-3 consequence, and no warning
or error diagnostics.

**Stable-tree milestone protocol.** Source, tests, template assets, definition,
documentation, this log, and the execution plan freeze before one exact
receipt-owning affected shard, one retained fresh-adopter proof, serial
orchestrator and unit aggregates, and receipt-owning typecheck/lint/format
gates. No OCI matrix or safety demonstration is applicable because no
executor/provider owner or canonical safety primitive changed. Every source and
fixture receipt, artifact, count, skip, duration, identity, protected/example
hash, and package inventory is independently checked before one cohesive
commit. Literal no-argument source `pnpm verify` runs exactly once afterward
and its known product/provider/dirty-file/deadline gaps remain honest.
The first final lint gate exposed and rejected an empty JSON/Markdown-only
fixture directory passed as an ESLint target. A tested fixture-local definition
entry point now supplies a real lintable boundary while leaving the package-
copied evidence runtime byte-identical to the retained proof.

**Audited pre-commit evidence.** The accepted affected shard passed 57/57 at
`artifacts/manual/invariant-vitest-20152/invariant-vitest-report.json`.
The retained proof at
`artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` is 2,424 bytes /
SHA-256 `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`;
its clean fresh repository passed 9/9 bootstrap stages with 10 valid receipts,
18 matched artifacts (136,506 bytes), 4/4 tests, and verifier result SHA-256
`1ea5cc51597047eecd6054701989d2096484a7e9162f3cb93afbd3a749b8ff9c`.
A package-only post-fix regeneration matched all 114 initial retained paths,
bytes, hashes, commits, and pre-commission tree without another verifier run.
The exact-tree orchestrator aggregate passed 514/516 at
`artifacts/manual/test-orchestrator-1576/orchestrator-report.json`; unit passed
527/529 at `artifacts/manual/test-unit-18672/test-report.json`. Both have zero
failures/todos and only the two declared Windows skips for POSIX process-group
termination. All receipt/artifact hashes and sizes, durations, and five slowest
tests were independently audited. Typecheck, lint, and format passed at
`artifacts/manual/typecheck-13140`, `artifacts/manual/lint-19384`, and
`artifacts/manual/format-check-21068`. Immutable/config/example diffs are zero,
all protected-plan identities match, and the source remains readiness with its
permanent marker. No OCI matrix applies because no provider/executor owner
changed.

**Commit.** Assigned only after the frozen WP4d candidate passes the applicable
checks; identify it as the newest commit touching this entry.

**Known gaps.** Bootstrap is only a technical scaffold. Product-domain breadth,
CAL-1, trusted default-Windows completion eligibility, hidden validation,
autonomous readiness, and human verification remain open. A later plan must
perform the permanent one-way readiness transition before substantive product
implementation. WP4d makes no readiness claim and does not push.

## 2026-08-15 — WP4c explicit historical worked-example boundary

**Objective.** Complete one bounded WP4c packaging increment by making the
already-placed Ski Tycoon configuration self-validating and explicitly
legacy-only, without moving or rewriting its historical JSON payloads or
allowing any example identity into active source commissioning.

**Outcome before final milestone verification.** A strict
`worked-example.v1` descriptor pins the complete package, source provenance,
legacy/inactive/no-fallback semantics, per-file provenance, roles, byte counts,
hashes, paths, and identities. The read-only
`pnpm loop:example:validate -- --descriptor <file>` route requires exact
contained regular tracked files, validates all six JSON schemas plus manifest/
registry/check/protected cross-links, and deterministically reports every
payload. It never runs the historical benchmark, requires its unavailable
commits, commissions the v1 manifest, or mutates repository state. The three
unchanged source snapshots are distinguished from the three maintained
compatibility adapters. All six example JSON payloads remain byte-identical to
entry. The active slow-suite ID is now generic, the reusable benchmark template
no longer defaults to D-032, and active manifest/input/config registries remain
free of D-031/D-032 and Ski Tycoon identity.

**Implementation diagnostics.** No broad suite or verifier was used for
orientation. Under pinned Node `24.18.0` and pnpm `11.15.1`, the new focused
file passed 9/9 cases covering exact/deterministic validation, descriptor and
CLI strictness, containment, regular/tracked/exact file sets, byte/hash drift,
JSON/schema drift, cross-links, and active/legacy isolation. The seven-file
affected diagnostic passed 66/66, including the unchanged commissioning,
config, invariant, manifest, schema, and protected-root boundaries. Direct
TypeScript and new-file lint diagnostics passed. The explicit source command
reported the 2,948-byte descriptor at SHA-256
`e4f3c1496603ae5dbd3189f02177cd5e200693cf42ff5a8f6e683712920faa70`
and all seven pinned package files with no mutation. These are iteration
diagnostics, not final receipts.

**Stable-tree milestone protocol.** Source, tests, descriptor, documentation,
this log, and the execution plan freeze before one receipt-owning focused
shard, serial orchestrator and unit aggregates, and receipt-owning typecheck,
lint, and format gates. No OCI matrix or safety demonstration is applicable
because no executor/provider or canonical protected-catalogue owner changes.
Every receipt, artifact, count, skip, duration, candidate identity, and
immutable/protected/example hash is independently checked before the cohesive
commit. Literal no-argument `pnpm verify` runs exactly once afterward and any
unrelated product, provider, dirty-tree, or deadline gaps remain honest.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP4c checks; identify it as the newest commit touching this entry.

**Known gaps.** A later WP4 increment must prove a fresh distributable adopter
reaches a truthful bootstrap PASS. Product placeholders, calibration, trusted
default-Windows execution, autonomous readiness, hidden validation, and human
verification remain open. WP4c makes no readiness claim.

## 2026-08-15 — WP4b deterministic source commissioning

**Objective.** Add one deterministic, fail-closed commissioning workflow and
use it to publish the source repository's active generic v2 manifest, without
rewriting historical evidence, frozen authority, readiness history, product
placeholders, provider boundaries, or verifier policy.

**Outcome before final milestone verification.** The standalone
`pnpm loop:commission -- --input <file>` command validates an absent active
path; completely clean tracked and untracked state; attached configured target
branch; exact strict-ancestor base; explicit bootstrap/readiness lifecycle;
authority, immutable-lock, and verifier-anchor agreement; generic registry and
protected-root identities; package-owned focused commands; exact and
reconciliation policy; and all four tier plans. Its canonical timestamp comes
from the base commit. It stages exclusive deterministic bytes, detects
identity/status drift, publishes no-clobber, performs a read-only post-generation
doctor, reports path/bytes/SHA-256, and cleans or exactly rolls back its owned
output on injected faults.

The source target is corrected from `main` to its real `master` branch and the
active invariant/scope ids are generic. Historical v1 records and adapters
remain explicit legacy contexts. In a clean clone of the exact candidate, the
tracked source input (6,561 bytes, SHA-256
`59f053d0b4ed195e2fda8746f8ee018ea3c97706c07f53a37908c40ef41b8629`)
commissioned `.agent/verification-manifest.json` at 7,124 bytes and SHA-256
`f765765d8082280282151253e616f87a460dbe8c38f17909aa22d7dcb7930dd9`.
The manifest binds WP4a base
`0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5`, `master`, package-default
readiness, the base's real `2026-08-15T20:50:19.000Z` timestamp, the current
generic registries and complete catalogue, and no D-031/D-032 or Ski Tycoon
identity. The commissioning doctor passed and constructed iteration,
candidate, milestone, and periodic plans; exact verification appears only in
milestone and periodic.

**Implementation diagnostics.** No broad suite or full verifier was used for
orientation. Under pinned Node `24.18.0` and pnpm `11.15.1`, the commissioning
fixture file passed 13/13 cases, including fresh bootstrap/readiness adopters,
twin-clone determinism, dirty trees, bases/branches/profiles/marker history,
authority/lock/registry/catalogue drift, unsafe input, partial writes, races,
rollback, reporting, and read-only doctor behavior. Six manifest, schema,
config, tier, doctor, and protected-root files passed 66/66, and the tools
TypeScript diagnostic passed. These are iteration diagnostics, not final
receipts.

**Stable-tree milestone protocol.** Source, tests, this log, the execution
plan, schema, generated input/manifest, and documentation freeze before the
final commands. Two receipt-owning focused shards, the live safety
demonstration, serial orchestrator and unit aggregates, and receipt-owning
typecheck/lint/format gates write fresh ignored evidence. Their outcomes remain
in machine-owned artifacts and the final handoff rather than being backfilled
into tracked files. Every receipt, declared artifact, count, skip, duration,
candidate identity, and immutable/protected hash is independently checked
before the cohesive commit. Literal no-argument `pnpm verify` runs exactly once
afterward and its unrelated product/infrastructure gaps remain honest.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP4b checks; identify it as the newest commit touching this entry.

**Known gaps.** WP4c may relocate or modernize the Ski Tycoon worked example.
Product placeholders, calibration, trusted default-Windows execution,
autonomous readiness, hidden validation, and human verification remain open.
WP4b makes no readiness claim.

## 2026-08-15 — WP4a generic verification-manifest foundations

**Objective.** Replace the active D-031/D-032-specific commissioning contract
with a generic manifest and make configuration/tier runtime paths resolve exact
verification from the package-default profile, without migrating the retained
source record or weakening readiness, reconciliation, provider, or protected
authority gates.

**Outcome before final milestone verification.** Active manifests now use
strict `verification-manifest.v2` at `.agent/verification-manifest.json`, with
generic commissioning, objective, focused command, protected-path, invariant,
scope, exact, and reconciliation policy fields. Config loading proves the
commissioned profile equals the package default; all four tier plans consume a
source-independent generic fixture. Bootstrap exact indexes are representable
but remain non-authoritative and are explicitly rejected by readiness
reconciliation. The frozen v1 source and Ski Tycoon records are accepted only
by closed historical contexts; the source reconciliation adapter strengthens
their protected set with the current floor and cannot act as a general active
loader. Its required v2 timestamp comes from the retained record's real Git
commit timestamp. Both active and retained source paths remain automatically
protected while present. The source repository intentionally has no active v2
manifest until WP4b.

**Implementation diagnostics.** Read-only entry inspection confirmed synced
HEAD `2b65ddc860e5c8387de57aa6f2f624f4a734f167`, tree
`30e787d81c5faee1ae7080f2ffaf845fb8eab268`, zero branch divergence, a clean
tracked tree, and the protected human file's four expected identities. No
orientation aggregate or OCI case was run. Under pinned Node `24.18.0` and pnpm
`11.15.1`, the first five-file diagnostic ran 50 tests: 49 passed and the
historical adapter exposed one missing-current-trust-floor defect. After the
one-way protected-root union, the focused manifest file passed 6/6. A direct
stabilized-interface TypeScript diagnostic then passed. These are iteration
diagnostics, not final receipts.

**Stable-tree milestone protocol.** Source, tests, this log, the execution plan,
schema, and documentation freeze before the final commands. Two exact
receipt-owning focused shards, the live safety demonstration, serial
orchestrator and unit aggregates, and receipt-owning typecheck/lint/format gates
write fresh ignored evidence. Their outcomes remain in machine-owned artifacts
and the final handoff rather than being backfilled into tracked files. Every
receipt, declared artifact, count, skip, duration, candidate identity, and
immutable/protected hash is independently checked before the cohesive commit.
The required no-argument verifier runs exactly once afterward and its known
unrelated non-passing conditions remain honest.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP4a checks; identify it as the newest commit touching this entry.

**Known gaps.** WP4b must commission the active source manifest and its
workflow without changing the historical record. Product placeholders,
calibration, trusted default-Windows execution, autonomous readiness, hidden
validation, and human verification remain open. WP4a makes no readiness claim.

## 2026-08-14 — WP3d disposable Docker execution candidate

**Objective.** Implement the OCI data plane behind WP3c's fail-closed provider:
an exact disposable verification clone, immutable image/input identity, fixed
runtime policy with independent inspection, bounded daemon-owned lifecycle and
storage, safe artifact export, real normal/adversarial containment coverage,
and no local or WSL fallback.

**Outcome before final milestone verification.** Docker-only executor version
1.0.0 is wired into `trusted-container`; Podman remains an explicit policy
mismatch. Every command uses a fresh exact clone, candidate container, read-only
exporter, and bounded workspace/evidence tmpfs volumes. Source and the pnpm v11
store are the only host binds and are read-only. The image, interpreted mount,
network, privilege, namespace, resource, and volume policies are inspected
before launch. Timeouts and output breaches stop/kill at the daemon, and every
container/volume removal must be confirmed. Export accepts only regular
single-link files, enforces combined file/byte limits, writes through an
exclusive open inode, and repeats source/destination size/hash checks. The
controller-owned report binds the daemon version, image ID/input hash,
provider capability, candidate commit/tree, lifecycle, policy, cleanup, and
artifact inventory.

**Implementation evidence.** The committed WP3c handoff evidence and hashes,
tree status, plan/logs, audit CD-01/P0.2, provider call sites, and
`pnpm loop:doctor` were inspected without a full-verifier baseline. With the
user's authorization, Ubuntu Docker Engine/client `29.1.3`, containerd `2.2.1`,
runc `1.3.4`, exact Linux Node `24.18.0`, and pnpm `11.15.1` were commissioned
inside the existing WSL2 distribution. The pinned base is
`node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059`.
Image input SHA-256
`0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3`
was built once to immutable local image
`sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad`;
subsequent unchanged-input probes reused the image and never a candidate
container.

A focused real normal-path diagnostic passed at
`artifacts/wp3d-oci-normal-policy-repro-20260814-r14/result.json` (2,401 bytes,
SHA-256 `6b08bf27811432831e84a84ff620c73dccc8f700a8b5de0049d5356603b01503`),
covering offline install, build, typecheck, Vitest, read-only Git, a valid
command receipt, artifact export, and confirmed cleanup. It predates the final
stable candidate and is diagnostic only, not reused as milestone evidence.
During hardening, the combined focused shard correctly exposed two 5-second
artifact-copy stalls at
`artifacts/manual/invariant-vitest-4604/`; after replacing the stream-close
dependency with bounded handle-based copying, the artifact suite passed 5/5 at
`artifacts/manual/invariant-vitest-428/`. After adding the strict environment
allowlist, pre-copy artifact preflight, and malformed-volume cleanup regression,
the affected executor suite passed 10/10 in 5,729 ms at
`artifacts/manual/invariant-vitest-13336/` and typecheck passed in 8,122 ms at
`artifacts/manual/typecheck-22284/`. The final regression proves cleanup is
attempted when a daemon may have accepted a create whose client response timed
out. Both command-owned receipts and their declared artifacts were independently
byte/hash checked. Earlier runtime-backed failures were
diagnosed one case at a time (Linux/Windows tool binary mismatch, emitted
module resolution, Docker option normalization, unsupported `docker start`
flag, stopped-container tmpfs lifetime, pnpm store selection, offline trust
revalidation, and fixture discovery); no failed run is counted as containment
evidence. A WSL-created Linux symlink dependency tree that Windows could not
read was moved intact to ignored
`artifacts/wp3d-wsl-node-modules-quarantine/`; a clean pinned Windows install
was materialized before continuing.

Independent inspection rejected the first nominal all-case result at
`artifacts/wp3d-oci-milestone-20260815/`: although its harness status was PASS,
the 1,500 ms hang deadline expired during offline installation and both its
artifact preflight and published-command inventories contained zero files. It
therefore did not exercise the claimed stubborn descendant and is not counted
as evidence. The focused repair changed only that real-case deadline to 12,000
ms and required a retained valid `child.json` PID marker. The focused
reproduction passed at
`artifacts/wp3d-oci-hang-repro-20260815-r1/result.json` (2,867 bytes, SHA-256
`a80f3554c8e63e942ee9878170d814545a8967328aead5c74d6a23c6cfd09e9a`):
the case timed out after 14,948 ms, published one descendant marker, reused the
unchanged image with zero builds, and left no managed container or volume. Its
10,076-byte containment report independently matched SHA-256
`263ff5cee4f93b1b8fde61980f7df757ca809ba923642089059538971d454b31`.
This focused result remains diagnostic because recording it changes the final
staged tree.

The corrected all-case matrix then passed on its frozen staged tree at
`artifacts/wp3d-oci-milestone-20260815-r2/result.json` (6,923 bytes, SHA-256
`a70ddbf431068ad28b4619579c9149ab12d29a3986739752dc1ae65485d88560`):
all six expected dispositions, the retained hang marker, unique disposable
container IDs, zero image builds, and zero remaining managed resources were
independently validated. It is no longer final evidence because the first
serial orchestrator aggregate subsequently exposed one stale test expectation.
That aggregate ran 2,303,297 ms and wrote
`artifacts/manual/test-orchestrator-24192/orchestrator-report.json`: 460 tests,
457 passed, one failed, and the same two explicit WP5 skips; the failed command
correctly produced no passing receipt. The sole failure was a WP3c-era
`missing-implementation` expectation in `verification-tier.test.ts`. A focused
reproduction failed at `artifacts/manual/invariant-vitest-19880/`; the repair
now injects a missing runtime deterministically and preserves the exact
NOT_READY/no-local-fallback meaning under WP3d's real implementation. The
focused file passed 14/14 in 7,024 ms at
`artifacts/manual/invariant-vitest-5736/`; its 5,269-byte declared report
independently matched SHA-256
`9da5c71e5eca1e4ff0f8b70054469c7e3d4ca6dd287df08536c8db6df22bfa0c`.

The next exact-tree matrix passed at
`artifacts/wp3d-oci-milestone-20260815-r3/result.json` (6,923 bytes, SHA-256
`2d8c428b3b07c9bc8ce4cde169cbd687df3432de19e6bb992cb0a8346302c06e`),
with all report/artifact identities and cleanup independently checked. The
required orchestrator rerun passed 458/460 with the two unchanged WP5 skips in
2,254,714 ms at `artifacts/manual/test-orchestrator-14780/`; its 161,116-byte
report independently matched SHA-256
`ad4346de23a05e526742510e44894202c905b63e9d685f3d12b5b02342ad746b`.
The unit aggregate passed 471/473 with the same skips in 2,291,871 ms at
`artifacts/manual/test-unit-15604/`; its 165,029-byte report matched SHA-256
`f1f7f96dd75931132dacf552c560856c65dbd4d979e401cd384dc9de7371c0a3`.
The safety demonstration passed in 3,406 ms; its 11,931-byte artifact matched
SHA-256
`8cbd2787aa81681204aaa729bdc6b1fd053abfe60ac7d171a69ebbfa1cb7eaf6`.
Typecheck passed in 11,807 ms at `artifacts/manual/typecheck-1752/`.

Static inspection then found two harness-only useless initial assignments in
the OCI result accumulator. Removing those initializers passed lint in 10,409
ms at `artifacts/manual/lint-14612/` and typecheck in 7,617 ms at
`artifacts/manual/typecheck-11464/`. Format inspection separately caught the
new fixture lockfile before the freeze; formatting only that lockfile passed in
10,718 ms at `artifacts/manual/format-check-7128/`. Those source/fixture changes
invalidate the otherwise-passing r3 and aggregate receipts for a final-tree
claim; none will be reused. The final commands below run again only because
exact-tree evidence is mandatory.

Report-span comparison attributes only 6,239 ms (0.28%) of orchestrator wall
time and 5,882 ms (0.26%) of unit wall time to wrapper overhead. The long stage
times are overwhelmingly the crash-boundary assertions themselves, not a
recurring launch/receipt harness tax. No separate harness optimization is
justified in WP3d; changing those tests would risk coverage for negligible
wrapper savings.

**Stable-tree milestone protocol.** Source, tests, this log, the execution plan,
and documentation freeze before the final commands. The serial OCI matrix will
write `artifacts/wp3d-oci-milestone-20260815-r4/result.json`; receipt-owning
orchestrator, unit, typecheck, lint, and format gates will write fresh ignored
evidence, and their reports provide stage/test durations. Outcomes are retained
in those machine-owned artifacts and the final handoff rather than backfilled
into tracked files, so the verified candidate tree does not change underneath
its evidence. The required no-argument verifier runs only after the same tree
is committed and clean; its expected product-placeholder failures are not
suppressed or relabeled.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP3d checks; identify it as the newest commit touching this entry.

**Known gaps.** The real matrix is Docker/WSL2 Linux evidence, not native
Windows, Podman, or native Linux CI evidence. The default image ID remains
uncommissioned by design, so the shipped template doctor is `NOT_READY`.
Product placeholders, calibration, autonomous readiness, hidden validation,
and human verification remain open; this increment makes no product or
readiness claim and is not pushed.

## 2026-08-14 — WP3c fail-closed execution provider control plane

**Objective.** Add the controller-owned provider selection and evidence
identity required before candidate-authored verification can be moved into a
pinned OCI environment, without claiming that WP3d containment already exists
or weakening the existing supervisor, receipt, integration, and readiness
gates.

**Outcome.** Config schema `1.6.0` defaults and migrates every prior version to
`trusted-container`; the absent WP3d executor fails closed before candidate
spawn and never falls back. Explicit `unsafe-local-diagnostic` execution uses
the bounded shared supervisor and stays completion-ineligible. A strict
provider identity is propagated through command/tier/aggregate/state/target/
reconciliation evidence and is validated for presence, eligibility, and exact
semantic equality wherever evidence could support adoption. Candidate-returned
identity is not trusted. State migrations preserve old evidence as
unattested/ineligible and block legacy pending target operations safely. Doctor
now distinguishes implementation, runtime, pinned-image, and policy failures.

**Verification.** All commands used Node `24.18.0` and pnpm `11.15.1`.
The complete focused matrix passed 46/46 suites and 205 tests with 0 failures
and exactly the two explicit WP5 POSIX skips at
`artifacts/manual/invariant-vitest-520/`; its 71,507-byte report matches
SHA-256 `4634557d8296a2e4d3cddc0a606bb71fc1f47cbc8fd37ea80722cfac4b8ddf1b`.
The later hardening subset passed 65/65 at
`artifacts/manual/invariant-vitest-7812/`. The final isolated orchestrator
aggregate passed 137/137 suites, 436 tests, 0 failures, and the same two skips
at `artifacts/manual/test-orchestrator-10220/`; its 152,919-byte report matches
SHA-256 `fcb4d768222acc67427da7fcf4175d3fe6b3d45c1db5d336699e6cbc0de60cd3`.
The earlier unit aggregate passed 446 tests, 0 failures, and the same two skips
at `artifacts/manual/test-unit-21396/`. A user-directed stop of a redundant
pre-freeze rerun left `artifacts/manual/test-unit-1420/` with no receipt, so it
is not cited as evidence.

Receipt-owning typecheck, lint, and format gates passed at
`artifacts/manual/typecheck-3064/`, `artifacts/manual/lint-25080/`, and
`artifacts/manual/format-check-13384/`; every receipt and declared artifact
byte count/SHA-256 was independently recomputed and matched. Safety demo passed
all six scenarios at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260815010034386-d9e187ef.json`.
The immutable lock remains
`d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`,
all governed baseline/active hashes remain equal, and the protected human file
remains outside the commit at blob
`d0abdd24f404d9dc335818c355e39f7cfc531300`. A single post-freeze consolidated
verification is the final handoff check; no process-supervision suites are run
concurrently and already-valid focused/orchestrator evidence is reused.

**Commit.** `cc17d8e5f22beb3eb3be9871bb6fed5efa9c031b` (tree
`44050eba6c69bdf9ced6cc388a18c51b72348576`).

**Known gaps.** WP3d must implement the pinned OCI executor, disposable clone,
mount/network/resource containment, and adversarial escape matrix. The two
POSIX-only process-tree tests remain explicit WP5 skips; no unsupported-platform
coverage is claimed. Product placeholders, calibration, autonomous-readiness,
and human-verification gates remain open. This increment makes no product
completion or readiness claim and is not pushed.

## 2026-08-08 — WP3b verifier and evidence trust-root supervision

**Objective.** Convert every process launch owned directly by the protected
authoritative verifier and shared evidence helpers to the WP3a bounded
supervisor while preserving verifier contract semantics, exact toolchain
identity, WP2 retention/workspace-cleanup behavior, and all WP3a review fixes.

**Outcome.** `scripts/verify.mjs` and `tools/evidence.mjs` now use the shared
plain-Node-loadable supervisor for identity probes, package scripts, citation
queries, and evidence commands. Each launch has a finite timeout, per-stream
cap, shared kill grace, redact-before-write behavior, and the complete WP3a
supervision disposition; timeout and output-limit outcomes fail closed.
Verifier schema `2.1.0`, stage/profile meanings, immutable-lock and receipt
validation, identity drift, exit/status weighting, and completion eligibility
are unchanged. Evidence callers await the asynchronous boundary, execute the
exact pnpm JavaScript entry under pinned Node, and retain their prior result
contracts. New regressions cover plain Node loading, default ownership,
redaction, output breach, timeout, verifier identity/supervision, and absence
of direct production spawn paths. Isolated verifier and production-build
fixtures now copy the exact transitive supervisor dependency and pinned
package-manager state.

**Verification.** All commands used Node `24.18.0` and pnpm `11.15.1`. The
requested serial cleanup/reconciliation reproduction initially retained only
the cleanup deadline while an unrelated host Vitest/Git workload was active;
with that workload clear, the identical command passed 24/24 (cleanup
26.264 s, rejected-review reconciliation 32.065 s) without a source or timeout
change. Contended aggregates at
`artifacts/manual/test-orchestrator-3512/` and
`artifacts/manual/test-orchestrator-7220/` correctly produced no PASS receipt;
the clean corrected-tree orchestrator aggregate passed 419 tests (417 passed,
2 explicit WP5 POSIX skips, 0 failed) at
`artifacts/manual/test-orchestrator-1444/`. The clean unit aggregate exposed
one deterministic isolated-fixture dependency defect at
`artifacts/manual/test-unit-22236/`; after the fixture repair, the focused
production-build suite passed 13/13 and the complete unit aggregate passed 432
tests (430 passed, the same 2 WP5 skips, 0 failed) at
`artifacts/manual/test-unit-21692/`. The earlier one-hour unit supervision
timeout remains honestly recorded at `artifacts/manual/test-unit-24196/`; no
bound or test deadline was raised.

Final receipt-owning gates passed at `artifacts/manual/typecheck-6956/`,
`artifacts/manual/lint-5448/`, and
`artifacts/manual/format-check-3044/`; the pre-format attempt at
`artifacts/manual/format-check-13128/` correctly contains only an ERROR
manifest. Every final orchestrator, unit, typecheck, lint, and format report
and receipt byte count/SHA-256 was independently recomputed and matches its
manifest. `pnpm loop:demo-safety` passed all six scenarios at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260809002843117-741e4c73.json`.
The final focused verifier at
`artifacts/wp3b-final-contract-20260808/result.json` has all exact-runtime/pin
checks and all 13 contract-integrity checks PASS; overall FAIL is expected
only from the honest dependency placeholder, its command supervision is
bounded/closed-stream, and completion is ineligible. The immutable lock and
all four governed hashes remain exact, `git diff --check` passed, and the
unrelated human file remained outside the commit at blob
`d0abdd24f404d9dc335818c355e39f7cfc531300`.

**Commit.** `3efa3ed77b46abdea61e4b867a5998e92f54d6c3` (tree
`8cb1bd29486f643830ff19e39ede38945ed7ea73`).

**Known gaps.** The two POSIX group/process-tree tests remain explicit WP5
skips; no unsupported-platform coverage is claimed. OCI containment,
execution-provider identity, unrelated launch sites, and the previously
recorded WP3a process-escape residuals remain future WP3 work. Product-domain
verification placeholders, calibration, and every autonomous-readiness and
human-verification gate remain open. This increment makes no completion or
autonomous-readiness claim.

## 2026-08-07 — WP3a review fix: drain cutoff, spawn resolve, honest termination

**Objective.** Close three independent review findings against the WP3a
supervisor at `e06baf4`: an inert post-exit output-limit breach (high), a
synchronous spawn throw rejecting past the never-rejects contract (medium),
and `termination.succeeded` overstating what root exit proves (medium).

**Outcome.** A cap breach during the post-exit drain now cuts the drain off
at the breach: the straggler sweep runs immediately (POSIX group SIGKILL;
recorded unavailable on Windows behind a dead root), streams are destroyed,
and the command settles with `drainCutoff: "output-limit"` — a breaching
writer that then closes its pipes can no longer skip the sweep, and the
runner reports the post-exit breach without claiming tree termination.
Synchronous spawn throws resolve an ERROR-shaped result with `spawnError`
set. The termination report now records `rootExitObserved` plus per-attempt
detail and never claims tree-wide success. Findings 1 and 2 were reproduced
by deterministic probes against the prior commit before fixing; all three
have regressions (scripted-child drain cutoff, scripted-child spawn throw,
fallback-root-kill semantics, and a real detached holder that polls for
parent death and floods the inherited pipe strictly after exit through
`runCommand`).

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: focused
supervisor/runner suites 27 passed / 2 skipped (WP5 POSIX). One first-run
aggregate failure was the new fixture's own cleanup racing Windows
asynchronous handle release (EBUSY removing the killed holder's working
directory); both process-test suites now poll killed fixtures to death and
retry the same transient removal codes the production stores retry, and only
the subsequent complete green aggregates are cited. Final-tree receipts:
typecheck `artifacts/manual/typecheck-17492/`, lint
`artifacts/manual/lint-20652/`, format `artifacts/manual/format-check-24620/`,
orchestrator aggregate 414 tests (412 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-orchestrator-10784/orchestrator-report.json`, unit
aggregate 427 tests (425 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-unit-7280/`, `pnpm loop:demo-safety` PASS at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807190106966-4c6cc48e.json`,
clean `git diff --check`. The unrelated untracked human file remained at
blob `d0abdd24f404d9dc335818c355e39f7cfc531300` and outside the commit.

**Commit.** `eab0cd6` (tree `11e115cf0188929afb1c5e6357b616541c4fc75d`).

**Known gaps.** Unchanged from WP3a: POSIX supervision paths first execute
in WP5 Linux CI; reparented-descendant/PID-reuse escapes, Windows post-exit
stragglers behind a dead root, and setsid-detached POSIX daemons remain
recorded residuals owned by the WP3 container slice, alongside contained
candidate execution and the `scripts/verify.mjs`/`tools/evidence.mjs` spawn
conversion. No product-completion or autonomous-readiness claim.

## 2026-08-07 — WP3a bounded process supervisor

**Objective.** Give every controller-spawned verification command a bounded,
deterministic supervision boundary: capped and redacted output, complete
process-tree termination on timeout or cap breach, a bounded post-exit
stream-drain window, and an exactly-once settle with a hard upper bound —
the first bounded WP3 process-containment slice (audit CR-02,
improvement-plan §WP3.5, P0 sweep P1.1/R-01).

**Outcome.** New `process-supervisor.ts` owns spawn, bounded per-stream
capture, termination, drain, and settle; `runCommand` keeps its public API,
policy, redaction, artifact, hashing, telemetry, and status semantics and
adopts the supervisor, so all orchestrator call sites inherit supervision.
Output beyond `limits.commandOutputLimitBytes` (default 64 MiB per stream)
is counted but never retained; a breach tree-kills and fails in the existing
infrastructure lane with newline-boundary truncation and a marker covered by
the recorded hash. Windows termination is force-first
`taskkill /pid <pid> /T /F` while the tree is intact with `child.kill()`
fallback; POSIX uses detached process-group SIGTERM escalating to SIGKILL
after `limits.commandKillGraceMs` (default 5000 ms). Settle is exactly-once
with an abandonment backstop bounding it by `timeoutMs + 2 x killGraceMs`.
Config schema is `1.5.0` with in-memory migration injecting the two new
limits; summaries carry a full `supervision` record. Probed platform facts
(recorded in the decision log): non-detached Node grandchildren die with
their parent via libuv's kill-on-close job object, while detached ones
escape it, survive, and hold inherited pipes open — the reproduced CR-02
hang, which now settles through the drain window; the tree-kill proof
therefore uses a detached (job-object-escaping) grandchild reaped by the
intact-tree taskkill.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: focused
supervisor/runner/config suites passed 29 with 2 skipped (POSIX-only,
flagged WP5); affected verifier/reconciliation/tier suites passed 86/86.
Receipt-owning gates: typecheck `artifacts/manual/typecheck-21180/`, lint
`artifacts/manual/lint-22928/`, format `artifacts/manual/format-check-13364/`,
complete orchestrator aggregate 410 tests (408 passed, 2 skipped WP5,
0 failed) at `artifacts/manual/test-orchestrator-3096/orchestrator-report.json`,
complete unit aggregate 423 tests (421 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-unit-10224/result.json`, `pnpm loop:demo-safety` PASS
at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807154534494-b6b8565c.json`,
and a clean `git diff --check`. Two earlier complete aggregates failed only
on the pre-existing `target-integration-recovery` post-fast-forward test
exceeding its 120s budget (90.9s at the 2026-08-06 baseline; 102.3s isolated
and 120.2s/122.4s in-suite on 2026-08-07; its code paths do not touch this
increment); its duration budget was raised to 300s with measurements
recorded in-file and no assertion changed, and only the subsequent complete
green aggregates are cited. The unrelated untracked human file remained at
blob `d0abdd24f404d9dc335818c355e39f7cfc531300` and outside the commit.

**Commit.** `e06baf4b658713961825edc7996884308bc8c582` (tree
`6d8307b9e9923eafff13fa734931fde1e88b47b5`).

**Known gaps.** POSIX supervision paths (group kill, escalation, drain
sweep) are written but first execute in WP5 Linux CI — no unsupported-
platform claim is made. Descendants reparented before the kill, PID reuse,
Windows post-exit stragglers behind a dead root, and setsid-detached POSIX
daemons remain recorded escape residuals owned by the WP3 container slice,
which also still owns contained candidate execution, execution-provider
identity, and `scripts/verify.mjs`/`tools/evidence.mjs` spawn conversion.
Product-domain verification placeholders, calibration, and every frozen
autonomous-readiness and human-verification gate remain open; nothing here
claims product completion or autonomous readiness.

## 2026-08-06 — WP2d recoverable approval-bound retention apply

**Objective.** Authenticate the complete operator-approved retention plan,
publish one canonical deletion intent before any apply artifact or evidence
removal, and make interrupted application converge without transferring
authority to journal text or changing terminal workspace-cleanup semantics.

**Outcome.** State schema `1.8.0` adds a strict global `retention-apply`
operation bound to the full plan hash, exact input generation/revision,
repository/controller/retention identity, complete dirty-worktree fingerprint,
configured and real roots, observed inventories, ordered target manifest
identities, canonical full-hash apply paths, progress, and deterministic
timestamps. Strict plan schema `1.2.0` and a fresh preflight reject partial or
non-canonical envelopes, changed bytes, configuration/root/citation/recency/
suspension drift, and target identity changes before deletion. Each target
enters durable delete-started state before the unchanged contained removal
primitive. The synced JSONL journal and exact result are derived evidence only:
recovery completes canonical prefixes and torn appends, adopts absence only
from state authorization, preserves conflicting paths with a durable blocked
diagnostic, and completes through one reducer. Explicit apply and leased
orchestrator startup share this recovery path before other state mutation.
Status and doctor schema `1.6.0` classify progress without recovery or
mutation. Terminal workspace-cleanup production code and policy are unchanged.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, focused retention
apply passed 19/19, operation/schema/store/doctor passed 48/48, leased startup
recovery passed, and synchronized recovery contenders serialized through the
controller lease. Hard process loss at all nine declared boundaries converged
to identical normalized state, journal, and result digests in
`artifacts/manual/wp2d-retention-apply/fault-matrix.json`. Final receipt-owning
typecheck, lint, and format checks passed at
`artifacts/manual/typecheck-21684/`, `artifacts/manual/lint-21048/`, and
`artifacts/manual/format-check-22956/`. The complete orchestrator aggregate
passed 390/390 at `artifacts/manual/test-orchestrator-11316/result.json`; the
full unit aggregate passed 403/403 at
`artifacts/manual/test-unit-19776/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807050845281-8bd6533b.json`.
Two broad attempts exceeded undersized outer shell wrappers and were treated as
invalid. A later complete attempt correctly exposed one stale plan-schema
assertion plus a Windows test-fixture `ENOTEMPTY`; both were fixed without
changing production cleanup, the focused lifecycle file passed 9/9, and only
the subsequent complete green aggregates are cited.

**Commit.** `c556e112113da4b565f13a9a5337aeb9df2dd344` (tree
`3365a5aa21057b2337c921f02d0cccad4a531a49`).

**Known gaps.** WP3 still owns process containment, and WP5 owns Linux
publication/race evidence. Product-domain verification placeholders,
calibration, and every frozen autonomous-readiness and human-verification gate
remain open. These Windows controller results do not claim unsupported-platform
coverage, product completion, or autonomous readiness.

## 2026-08-06 — WP2c recoverable terminal workspace cleanup

**Objective.** Publish one exact terminal workspace-cleanup intent before
dependency removal, failed-run diagnostic publication, or recursive workspace
deletion, then make uninterrupted and restarted cleanup converge through one
canonical completion reducer without changing evidence-retention semantics.

**Outcome.** State schema `1.7.0` extends the exclusive pending-operation union
with `workspace-cleanup`, bound to the exact canonical generation/revision,
run/milestone/attempt, repository/target identity, standalone workspace and
creation marker, recorded and observed commits, cleanup policy, pinned
timestamps, and exact diagnostic hashes/sizes. Startup recovery runs under the
controller lease before ordinary terminal cleanup and advances through explicit
dependency, archive, and workspace-delete phases. Preserve policy never adopts
a missing workspace; delete policy adopts one only after durable authorization;
and failed deletion requires an exact complete archive. Failed cleanup pins the
actual observed descendant independently from the last recorded candidate,
because candidate drift may be the failure being archived. Ambiguous roots,
links, substitutions, Git or diagnostic drift, premature disappearance, and
partial/conflicting archives remain preserved with a durable blocked
diagnostic. Status and doctor schema `1.5.0` classify the operation and next
safe action without recovery or mutation. Approval-bound evidence retention is
unchanged.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, synchronized
post-delete recovery produced zero semantic differences and hard process loss
converged at all 15 declared boundaries across completed deletion, completed
preservation, and failed diagnostic deletion. Structured records are
`artifacts/manual/wp2c-workspace-cleanup/post-delete-convergence.json` and
`artifacts/manual/wp2c-workspace-cleanup/fault-matrix.json`. Blocked-state,
candidate-drift, diagnostic-drift, archive-conflict, concurrent lease, and
status/doctor byte-digest cases passed. Receipt-owning typecheck, lint, and
format passed at `artifacts/manual/typecheck-18532/`,
`artifacts/manual/lint-4720/`, and
`artifacts/manual/format-check-23228/`. The complete orchestrator aggregate
passed 379/379 at `artifacts/manual/test-orchestrator-19060/result.json`; the
full unit aggregate passed 392/392 at
`artifacts/manual/test-unit-14056/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807005440748-4cc540e4.json`.
One broad attempt was invalidated by an outer shell timeout and a later complete
attempt correctly exposed a failed-workspace HEAD-policy defect; neither is
cited as passing evidence, and the successful aggregates ran after the fix
under a temporary OS keep-awake guard with repository test limits unchanged.

**Commit.** `0557e66a5fa0763896fee9c4319d6d8939ed8254` (tree
`0508a5f4c759c327d60714c5295f77d13fbd2fc1`).

**Known gaps.** WP2d still owns approval-bound evidence-retention application
intent/authentication and interrupted deletion convergence. Linux cleanup
publication/race evidence remains a WP5 CI deliverable. This Windows result
does not claim unsupported-platform coverage or autonomous readiness, and the
adopting product verification placeholders remain honestly non-passing.

## 2026-08-06 — WP2b recoverable target integration

**Objective.** Publish one exact approved target-integration intent before any
outcome, fetch, ref, index, or worktree side effect, recover it under the
controller lease, and make uninterrupted and restarted completion use one pure
semantic reducer.

**Outcome.** State schema `1.6.0` extends the exclusive pending-operation union
with `target-integrate`, bound to the exact canonical generation/revision,
run/milestone/attempt, repository/target/workspace identity, approved candidate
and commit list, verification-result digest, deterministic outcome paths,
phases, timestamps, and validate/adopt-or-preserve policy. Normal integration
persists intent before its first external side effect. Startup recovers before
ordinary target drift, revalidates protected files and the standalone
remote-free candidate, resumes only from the exact clean base, and adopts only
the exact clean candidate. Pending and integrated outcome bytes are exactly
regenerable. Dirty, locked, in-progress, unexpected, drifted, linked,
substituted, and conflicting states are preserved with durable diagnostics.
Reviewer approval without intent now requires explicit reconciliation. One
completion reducer owns target/milestone/queue/vertical-consumer/processed-count
and human-verification-stop state. Status and doctor schema `1.4.0` classify the
operation and exact next action without mutation.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, hard child-process
loss at all 12 declared boundaries converged to canonical completion; the
structured records are
`artifacts/manual/wp2b-target-integration/fault-matrix.json` and
`artifacts/manual/wp2b-target-integration/post-fast-forward-convergence.json`.
The latter also barrier-synchronized two restart contenders and found no normal
versus recovered semantic difference. Target classification/action/outcome,
migration, lifecycle, identity, reconciliation, cleanup, status, doctor, and
CLI focused checks passed. Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/typecheck-15628/`, `artifacts/manual/lint-904/`, and
`artifacts/manual/format-check-13872/`. The complete orchestrator aggregate
passed 372/372 at `artifacts/manual/test-orchestrator-20588/result.json`; the
full unit aggregate passed 385/385 at
`artifacts/manual/test-unit-11116/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806215546754-eb6dd114.json`.
Two earlier broad attempts were invalidated by machine suspend, which produced
impossible multi-thousand-second durations for unchanged 60-second tests; every
affected case passed awake under its original limit, and the successful broad
runs used only a temporary OS awake guard, not altered repository timeouts.

**Commit.** `057f16bc14ec28bda36e762d503ee1d4252a898d` (tree
`55b6e7a8b97c941663228246617998743589f3b9`).

**Known gaps.** Later WP2 increments still own terminal cleanup and retention
side-effect journaling; this change uses but does not make those subsystems
recoverable. Linux ref/index/worktree race evidence remains a WP5 CI
deliverable. This Windows result does not claim unsupported-platform coverage
or autonomous readiness, and the adopting product verification placeholders
remain honestly non-passing.

## 2026-08-06 — WP2a recoverable workspace creation

**Objective.** Persist a strict workspace-create operation before any clone
side effect, publish through a unique contained temporary path, and make every
creation boundary deterministic and recoverable under the controller lease.

**Outcome.** State schema `1.5.0` adds one exclusive, exact-generation-bound
`workspace-create` intent with pure set/advance/block/complete transitions and
a global unrelated-mutation fence. Canonical `1.4.0` generations migrate
virtually on read and durably on their next CAS successor. Attempt startup now
persists intent before creating directories, clones without hardlinks into a
short unique temporary entry, establishes standalone remote-free identity,
and publishes with no-clobber semantics. Leased startup classifies missing,
source-clone, ready-temporary, exact-final, ambiguous, substituted, and unsafe
paths; it resumes or adopts only exact identity and otherwise preserves the
entries in place with a durable blocked diagnostic. Validation covers lexical
and realpath containment, symlinks/junctions/gitfiles, repository ownership,
alternates/shallow state, exact base/branch, cleanliness, canonical config,
controller markers, and remote facts. Status and doctor schema `1.3.0` expose
the pending operation and next safe action using read-only Git inspection.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, a real-clone matrix
injected process loss at all eight declared durable/filesystem boundaries and
converged every restart to the same normalized revision-9 state. The complete
orchestrator suite passed 363/363 at
`artifacts/manual/test-orchestrator-13136/result.json`; the full unit aggregate
passed 376/376 at `artifacts/manual/test-unit-17720/result.json`. Receipt-owning
typecheck, lint, and format passed at `artifacts/manual/typecheck-21940/`,
`artifacts/manual/lint-7288/`, and `artifacts/manual/format-check-25136/`.
`pnpm loop:demo-safety` passed with its report at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806175034510-a6ecc318.json`.

**Commit.** `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844` (tree
`55858b14eff61c7b4348719604ebf1357bdfb2fe`).

**Known gaps.** WP2b must journal target integration and converge interrupted
integration through one canonical completion reducer; later WP2 increments
still own cleanup and retention side effects. Linux path and publication-race
evidence remains a WP5 CI deliverable. This Windows result does not claim
unsupported-platform coverage or autonomous readiness, and the adopting
product verification placeholders remain honestly non-passing.

## 2026-08-05 — WP1b atomic canonical state generations

**Objective.** Replace mirror-revision read/check/write with a canonical,
recoverable state-generation primitive that permits exactly one publication
from a shared starting generation and preserves read-only command semantics.

**Outcome.** `refs/milestone-loop/state` now points to a strict Git commit
generation containing canonical state JSON and exact revision/hash metadata.
The single parent is the prior generation; current and immediately previous
commits are validated for type, exact tree, schema, hashes, revision successor,
parent, fixed controller identity/timestamp, and canonical message. Saves use
expected-old `git update-ref`. The configured `state.json` is a derived mirror
repaired only on mutation-capable opens. Valid legacy bytes import exactly once
and remain available for reconciliation provenance; malformed, linked, or
ambiguous input fails closed. `load()` cannot authorize `save()`. Status and
doctor schema `1.2.0` expose canonical-generation and mirror facts without
mutating either store. The safety demonstration uses an isolated Git fixture.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, the synchronized
multiprocess same-generation race passed five consecutive runs at
`artifacts/manual/wp1b-state-races/run-{1..5}.json`. Receipt-owning typecheck,
lint, and format passed at `artifacts/manual/typecheck-7476/`,
`artifacts/manual/lint-21564/`, and
`artifacts/manual/format-check-22368/`. The complete orchestrator suite passed
349/349 at `artifacts/manual/test-orchestrator-20856/result.json`; the full
unit aggregate passed 362/362 before commit and again from the clean committed
tree at `artifacts/manual/test-unit-24644/result.json`. The live safety
demonstration passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806045354446-4e64d4e5.json`.

**Commit.** `987ce005a410470d078b8dd57802abbffc2d0356` (tree
`0b9c1719ebc9f7accac4d64e872c6878b753eed2`).

**Known gaps.** WP2 must journal workspace, integration, cleanup, and retention
side effects and converge interrupted integration through the same canonical
completion reducer. Linux race evidence remains a WP5 CI deliverable; this
Windows proof does not claim unsupported-platform coverage. Uncommissioned
readiness placeholders remain honestly non-passing and WP1 is not an
autonomous-readiness claim.

## 2026-08-05 — WP1a atomic controller ownership

**Objective.** Replace stale-file quarantine takeover with a real
expected-owner primitive so a losing first-owner or stale-owner contender can
never remove, replace, or release the live winner.

**Outcome.** The canonical lease is now
`refs/milestone-loop/controller-lease`, pointing to a strictly validated owner
JSON blob. Acquisition, stale takeover, and release use expected-old
`git update-ref`; inspection is read-only. A permanent file-protocol guard
blocks older file-lease binaries and conflicting legacy files fail closed.
Doctor schema `1.1.0` and status expose the canonical ref and guard state.
Normal `git push --all` excludes the private namespace.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: the focused lease
suite passed 16/16; the three synchronized first-owner/stale-owner/winner-life
race cases passed in five consecutive repetitions; the complete orchestrator
suite passed 328/328 at
`artifacts/manual/test-orchestrator-20228/orchestrator-report.json`. From the
clean implementation commit, `pnpm test:unit` passed 341/341 with receipt at
`artifacts/manual/test-unit-15140/result.json`; typecheck, lint, and format
receipts are `artifacts/manual/typecheck-3040/`,
`artifacts/manual/lint-16032/`, and
`artifacts/manual/format-check-15788/`; `pnpm loop:demo-safety` passed with its
report under `artifacts/orchestrator/runs/safety-demonstration/`. A direct
`loop:status` probe left both the ref and legacy guard absent, proving the
read-only path does not initialize ownership state.

**Commit.** `fa1ef6f80c1dd089f8f78133d0aa2344f40a2174` (tree
`0be6b70c386cf58b076f7d3b33cc8f82545cb2a0`).

**Known gaps.** The JSON state mirror still uses a non-atomic revision
read/check/write sequence. WP1b must make `refs/milestone-loop/state`
canonical, migrate legacy state exactly once, and demote `state.json` to a
repairable mirror before WP1 is complete. Linux race evidence remains a WP5 CI
deliverable; no unsupported platform result is claimed here.

## 2026-08-05 — WP0 truthful production-build evidence

**Objective.** Eliminate the zero-command production-build PASS and require an
explicit project-owned build contract, a clean disposable clone, fresh outputs,
output-root containment, and retained path/size/SHA-256 evidence.

**Outcome.** `pnpm build` now exits 2/`NOT_READY` without a receipt when
`package.json#milestoneLoop.productionBuild` is absent. A configured fixture
runs the declared non-recursive script after a frozen offline install, rejects
stale, empty, outside-root, linked, and post-report-mutated outputs, and issues a
PASS receipt only after a second inventory check.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: 13/13 focused build
fixtures passed; `pnpm test:unit` passed 336/336 with receipt at
`artifacts/manual/test-unit-11968/result.json`; `pnpm typecheck`, `pnpm lint`,
and `pnpm format:check` passed with receipts at
`artifacts/manual/typecheck-23840/`, `artifacts/manual/lint-23020/`, and
`artifacts/manual/format-check-19280/`; `pnpm loop:demo-safety` passed. Focused
aggregate evidence is
`artifacts/verify-2026-08-06T025915-819Z-12324/result.json`: production-build is
correctly `NOT_READY` with no receipt, while the aggregate remains FAIL because
the unrelated adopting-project dependency check is still a placeholder.

**Commit.** `66c564c3c2142cde7b5d31d82a18213fdcde525a` (tree
`d9ffd30151c9fac86c5f8c15f1aecd181e10a641`).

**Known gaps.** The template remains deliberately uncommissioned. Candidate
build execution is still local-host execution until WP3 containment. This
increment does not alter readiness meaning or claim autonomous completion.

## 2026-08-05 — Supported-runtime state replacement retry

**Objective.** Remove an intermittent Windows `EPERM` state-file replacement
failure that blocked broad supported-runtime verification, without disguising
or claiming to solve the WP1 atomic-CAS defect.

**Outcome.** State JSON replacement retries only bounded transient filesystem
codes with linear backoff, then fails closed and preserves the prior durable
file. Deterministic hooks cover eventual success and persistent failure.

**Verification.** Under Node `24.18.0`: 13/13 state-store tests, typecheck, lint,
format, and 323/323 orchestrator tests passed. The broad receipt is retained at
`.tools/state-rename-retry/artifacts/manual/test-orchestrator-21932/result.json`.

**Commit.** `235ea2bcb2c32850a9e9e3f4aec24058c4aab546` (tree
`f35a056b5a7ba71e5607c381e6885aa41c60a017`).

**Known gaps.** Read/compare/rename state publication is still not an atomic
CAS, and stale lease takeover is still vulnerable. Both remain WP1 blockers.
