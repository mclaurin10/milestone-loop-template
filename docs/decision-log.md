# Decision Log

Record durable or costly-to-reverse decisions: date, decision, alternatives
considered, rationale, and affected files. Newest first.

## 2026-08-16 — Shared contract-integrity owner and ineligible adapter (WP5c)

**Decision.** The 13 ordered `contract-integrity` checks have one
controller-owned implementation in `src/contract-integrity.ts`. The module is
plain-Node-loadable: it accepts the existing commissioned-authority-anchor
validator as an explicit dependency, so `scripts/verify.mjs` can import the
same evaluator directly under pinned Node while controller commands consume it
through `tsx`. The authoritative verifier still selects and aggregates stages
exactly as before; only its former inline check body moved.

The invariant registry's `protected-integrity` entry now calls a narrow
`verification-cli.ts contract-integrity` adapter instead of a focused
`pnpm verify`. The adapter requires the exact healthy check identity and all
PASS statuses, retains `contract-integrity-report.v1`, and writes a
command-owned receipt only after success. The report always states
`completionEligible:false`; the outer invariant-suite report advances to
`1.1.0` to state the same. Failure retains the diagnostic and no PASS receipt.
The verification CLI loads the full tier implementation only after selecting
a tier mode, so the contract adapter does not require the Codex SDK or other
unrelated tier dependencies merely to start.
Source and generated-adopter registries use the same argv, owner path, and
artifact kind without adding a package script or changing their commissioned
registry IDs.

**Why.** Focused verifier selection deliberately includes `environment`, so
using it as an invariant made correct contract checks depend on unrelated
dependency, placeholder, production, and runtime wiring. Duplicating the
checks in the controller would let invariant and exact verification meanings
drift. A shared evaluator preserves one authority, while the separate evidence
adapter gives fast corruption feedback without creating a second completion
path. Alternatives rejected: changing focused verifier stage selection,
special-casing environment success, retaining the aggregate wrapper, copying
the 13 checks into the invariant suite, accepting exit zero without a receipt,
making the adapter completion-eligible, adding a public package command, or
rerunning the completed WP4d adopter proof merely to refresh evidence.

**Affected files.** Shared contract evaluator/tests/export; authoritative
verifier import; invariant adapter/report/CLI/tests; source/template/generated
invariant registries; aggregate verifier fixture dependency; README,
configuration guide, repository contract, execution plan, and autonomy log.

## 2026-08-16 — Generation-bound canonical lifecycle status (WP5b)

**Decision.** `pnpm loop:status -- --json` emits one versioned
`orchestrator-status` schema `1.0.0` for uninitialized, ordinary initialized,
pending-operation, target-drift, and active-reconciliation states. CLI status
runs before reconciliation-controller opening, so an active reconciliation is
reported through the common observational contract rather than replacing it
with the narrower `reconcile-status` shape or creating a mutation capability.

Status composes two existing authorities. Accepted Doctor schema `2.0.0` owns
commissioning/profile, operational issues, provider identity, exact-result
integrity/currentness, eligibility, lease, and earliest safe next action.
Validated canonical state and existing operation inspectors own detailed
controller state, pending side effects/recovery, latest completed milestone,
exact-verification provenance, cleanup, and reconciliation. Status never
searches artifact directories or treats prose logs as state.

Target relation names target-branch HEAD as the subject: `ahead` means target
descends from the stored verified commit, `behind` means verified descends
from target, and `divergent` means neither; `current`, `uninitialized`, and
fail-closed `unavailable` are distinct. Recovery is normalized as `automatic`
for an inspector-owned resume, `blocked` for manual reconciliation,
`external` for reconciliation/history drift, and `none` when no recovery is
recorded. Git ancestry inspection is optional-lock-suppressed.

Doctor and detailed state must name the same canonical generation. When valid
commissioning aligns the branch sources, Doctor, checkout, and target-ref HEAD
must also agree. Status retries movement once, then reports
`changed-during-inspection`, suppresses the detailed state projection and
integration eligibility, and returns only a status-rerun action. This prevents
an individually valid Doctor observation and state generation from being
combined into a false current-integration claim.

**Why.** The prior status omitted commissioning, relation, exact evidence,
eligibility, recovery disposition, and a next command, while active
reconciliation silently changed schemas. Copying Doctor or reimplementing its
checks would create a competing readiness definition; relying only on raw
state would omit provider/evidence integrity; sampling both without a
generation/target fence could produce an internally inconsistent resume
surface. Alternatives rejected: expanding `ReconciliationStatusSummary`,
calling the mutation-capable reconciliation controller, artifact-directory
discovery, log-derived completion, a binary target-drift flag, inverted or
ambiguous ahead/behind labels, and presenting stale state after a race.

**Affected files.** New status contract/tests/export, CLI status routing,
README and contract guidance, active plan, autonomy/decision records.

## 2026-08-16 — Versioned read-only operational Doctor and strict blocker gate (WP5a)

**Decision.** Operational Doctor schema `2.0.0` uses only `pass`, `warning`,
and `block` check severities and derives top-level `ready` solely from the
absence of blocks. Every non-pass check becomes an ordered issue with a stable
code, remediation, and optional safe command. `nextAction` follows the earliest
block; if that block requires manual repair, it directs the operator back to
strict Doctor after repair instead of skipping ahead to a later executable
action. With no blocks, it selects the earliest actionable warning or the
canonical state's permitted action.

Ordinary Doctor remains an inspectable exit-zero command even when it reports
`blocked`. The Doctor-only `--strict` flag prints the identical complete JSON,
then exits 2 when any block exists; warnings alone exit zero but keep
autonomous integration ineligible. Other loop commands reject `--strict`
before repository mutation.

Doctor projects existing read-only authorities rather than creating parallel
success definitions: commissioning/tier construction, production-build
declaration, structural configuration, exact installed SDK, provider
capability and identity, canonical state and pending-operation recovery,
protected roots and stored identities, lease ownership, authentication, and
Git identity. The normal config loader still enforces installed-SDK
compatibility; a narrow inspection loader lets Doctor report structural config
and installed state separately. Exact evidence is state-owned, hash-checked,
realpath-contained, current, readiness-only, and bound to the active
completion-eligible provider identity. Protected drift is a separate blocker
so it cannot hide a simultaneous recovery operation.

**Why.** The prior coarse `pass/attention` output could not serve as an
operational gate, omitted material package/path/evidence facts, and rejected
strict mode before diagnosis. Running verification from Doctor would be slow,
mutating, and circular; guessing the latest artifact directory would bypass
canonical state; coupling structural config to installed dependencies would
hide the actual failure; and treating every first-run warning as a block would
prevent safe initialization. Alternatives rejected: warnings authorizing
integration, strict mode suppressing JSON, a generic strict flag for mutating
commands, following linked paths, probing an unconfigured container provider,
repairing state or paths, or choosing a later actionable blocker over an
earlier manual one.

**Affected files.** Doctor/CLI/config inspection source and tests, three
read-only recovery consumers, `README.md`, `CONTRACT.md`, the active execution
plan, and autonomy/decision logs.

## 2026-08-15 — Git-anchored fresh-adopter bootstrap package (WP4d)

**Decision.** Distribute the loop through a strict
`milestone-loop-adopter-package.v1` definition and the no-clobber
`pnpm loop:template:create -- --definition <file> --output <absent-directory>`
command. The creator copies only an allowlisted runtime plus a minimal real
bootstrap scaffold, generates adopter-owned authority lock/config/registries/
package metadata, initializes the requested attached branch with fixed local
Git identity and timestamps, commits the authority base, then commits a
commissioning input bound to that exact strict ancestor. It never copies or
deletes the source readiness lifecycle, active commissioning, history, or
historical example.

The verifier and commissioning now share one Git-base authority anchor. The
active v2 manifest's base must be a strict ancestor containing byte-identical
immutable-lock and four-authority-file content; the candidate lock must pass
its own schema, lifecycle, and hash checks. Adopter-specific acceptance shape
is derived from the frozen base while universal exact-command, bootstrap/
readiness, no-compensation, hidden-custody, and one-way lifecycle rules remain
in verifier code. No adopter edits a verifier hash constant or hard-coded
acceptance counts.

The generated bootstrap owns one deterministic kernel used by Node, replay,
the production Worker, persistence, and rendered UI. Real static checks,
Vitest, clean-clone production build, save/load continuation, Worker parity,
desktop Chromium interaction, diagnostics, screenshot, and command receipts
are required. The separate `loop:template:prove` command performs an offline
frozen copy-mode install, explicit commissioning and manifest commit, exactly
one literal no-argument verifier run, and an independent hash/receipt/identity
audit. Its PASS is fixed to `bootstrap_complete`, remains provider-ineligible,
and is never autonomous-readiness-equivalent.

**Why.** Copying the source tree leaked commissioned readiness history and
required manual removal and source edits. Pinning an adopter hash in verifier
source made a generic distributable impossible, while a mutable unanchored lock
would weaken authority. The already-required strict ancestor is a durable,
reviewable trust root that preserves fail-closed calibration behavior without a
new protected file. Alternatives rejected: whole-repository copying, deleting
the readiness marker in copied history, regenerating the lock without a Git
anchor, embedding fixture hashes or project ids in verifier source, automatic
commissioning, no-op bootstrap scripts, DOM-only browser evidence, and treating
bootstrap as readiness.

**Affected files.** Shared authority anchor and commissioning/verifier tests;
adopter package/proof commands and tests; fresh-adopter definition/authority;
bootstrap scaffold and evidence tools; package/lockfile/static coverage;
adoption, contract, config, plan, and autonomy documentation.

## 2026-08-15 — Self-validating legacy worked-example package (WP4c)

**Decision.** Keep the Ski Tycoon files at their existing
`examples/ski-tycoon/` location and preserve all six JSON payloads byte-for-byte.
A sibling `worked-example.v1` descriptor now names the exact package file set,
source and template-introduction commits, legacy-only/inactive semantics,
per-file provenance disposition, roles, byte counts, SHA-256 values, paths, and
cross-file identities. `pnpm loop:example:validate -- --descriptor <file>` is
the only supported inspection route. It requires an explicitly supplied,
contained, regular, tracked descriptor; rejects missing, extra, linked,
untracked, drifted, malformed, or incoherent payloads; validates every strict
schema and legacy registry/check/protected link; and emits deterministic static
results without executing, migrating, commissioning, or rewriting the example.

The benchmark matrix, slow-suite registry, and scope policy remain labeled as
unchanged source snapshots. The orchestrator config, invariant suite, and
legacy manifest are labeled maintained compatibility adapters because they
received post-extraction trust-boundary updates. Active configuration keeps no
example identity: the source slow-suite registry is renamed to
`milestone-loop-explicit-migration-suites.v1`, while the example retains its
historical D-032 ID and the benchmark template uses an adopter placeholder.

**Why.** The WP4 source plan already requires the historical configuration at
the location it occupies, so a move or rewrite would add risk without closing a
gap. The actual gap was that the directory's README misstated provenance and
schema age, and only one file had a purpose-limited loader test; no boundary
proved the package as a coherent, non-active whole. A separate pinned
descriptor preserves recoverability and makes later drift explicit without
turning legacy v1 into an active fallback. Alternatives rejected: moving the
directory, converting its manifest to v2 (would erase historical semantics),
loading it through active config, executing unavailable historical commits,
or relying on documentation and ad hoc tests without byte identities.

**Affected files.** Worked-example descriptor/validator/CLI/tests and export,
package command, active slow-suite ID, benchmark template, example/root/config
documentation, `CONTRACT.md`, and WP4c plan/logs.

## 2026-08-15 — Deterministic one-shot commissioning (WP4b)

**Decision.** A repository creates its active generic v2 verification manifest
only through `pnpm loop:commission -- --input <file>`. The strict, explicit
input binds the target branch, strict-ancestor base, package-default profile,
current config/registry paths and identities, immutable-lock hash, canonical
protected floor, focused catalogue, literal exact command, and generic
reconciliation minimum. Commissioning is deliberately one-shot: the active
path must be absent and the attached target-branch checkout must be clean of
both tracked and untracked changes. Readiness additionally requires the
permanent marker to exist at or before the base and at the candidate;
bootstrap rejects any marker tree or history.

Generated `createdAt` is the base commit's canonical Git timestamp. The command
validates existing authority hashes, immutable-lock lifecycle and verifier
anchor, package scripts, all registry identities, protected coverage, and all
four tier plans; it never creates or repairs authority. It writes an exclusive
temporary file, verifies exact bytes and SHA-256, rechecks Git identity and
status, creates the absent destination with a no-clobber filesystem link, and
runs a strict read-only commissioning doctor. Failure cleans the owned stage;
after publication it may remove only the exact inode and hash it just created.
Every generated path, byte count, and SHA-256 is printed.

The source repository is commissioned on `master` from WP4a commit
`0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5` with its existing readiness
lifecycle. Only the active registry ids become generic
`milestone-loop-core-invariants.v1` and
`milestone-loop-shadow-scope-policy.v1`; explicit historical v1 records retain
their legacy identity. Because the protected human plan intentionally makes
the source checkout unclean, the workflow ran in a clean temporary clone of
the exact candidate and only its independently matched deterministic manifest
bytes returned to the source tree.

**Why.** Commissioning is a trust transition, so accepting hand-authored
output, wall-clock metadata, a dirty-tree exception, branch inference,
overwrite-style rename, silent authority repair, or implicit historical
fallback would make provenance ambiguous. A single absent-file publication
boundary permits deterministic output and exact rollback ownership without a
multi-file transaction.

**Affected files.** Commissioning contract/CLI/tests, manifest and doctor
validation, source config/registries/input/active manifest, package command,
combined schema, adoption and contract documentation, and WP4b plan/logs.

## 2026-08-15 — Generic active verification commissioning boundary (WP4a)

**Decision.** New in-flight verification commissioning uses the strict
`verification-manifest.v2` shape at `.agent/verification-manifest.json`. Its
generic commissioning identity binds an exact base commit, canonical timestamp,
and `bootstrap` or `readiness` profile; that profile must equal
`package.json#milestoneLoop.verification.defaultProfile`. Exact closure remains
literal no-argument `pnpm verify`, and the existing `exact-readiness` wire check
id stays stable compatibility data even though the exact result profile may be
bootstrap or readiness. Tier results remain non-authoritative at schema `1.2.0`;
all reconciliation/adoption paths still require readiness evidence explicitly,
so bootstrap can never satisfy autonomous readiness.

The frozen `verification-manifest.v1` source and Ski Tycoon records are legacy
types accepted only through closed, purpose-named historical loaders. Source
reconciliation alone may adapt the source record to the generic tier input; the
adapter adds the current protected floor and generic reconciliation minimum but
does not rewrite historical bytes; its generic `createdAt` is the canonical Git
commit timestamp of that retained record, not an invented historical event.
There is no implicit v1 fallback. The
published combined JSON Schema advances to `2.0.0` because its manifest branch
is replacement-incompatible, while its tier-result branch continues to require
wire schema `1.2.0`.

**Why.** A D-031/D-032 literal cannot commission a reusable loop, and an exact
command whose profile is duplicated in a manifest can drift from the package
authority. Separate active and historical boundaries make provenance explicit,
while resolving the exact profile from the package default avoids override
semantics without weakening the one-way readiness gate. Alternatives rejected:
accepting v1 for new work, silently translating any supplied legacy path,
rewriting the frozen source record, treating bootstrap as readiness, renaming
the stable exact check id in this slice, and migrating the live source before
the WP4b commissioning workflow exists.

**Affected files.** Manifest contracts/validators/schema, configuration and
profile loaders, tier construction and CLI, historical benchmark and
reconciliation callers, startup/doctor/safety protected-root checks, focused
fixtures/tests, `README.md`, `CONTRACT.md`, and configuration documentation.

## 2026-08-14 — Docker-attested disposable OCI data plane (WP3d)

**Decision.** Trusted candidate execution now uses Docker Engine through one
fixed, versioned executor. Version 1.0.0 rejects Podman at capability policy
evaluation because its interpreted create/inspect semantics have not been
implemented or exercised. There is no implicit Windows-to-WSL or local
fallback. Every command begins with a new origin-free, no-alternates,
no-hardlinks clone of the exact clean candidate commit and creates a uniquely
named candidate container, read-only artifact-exporter container, and two
uniquely named Docker local-driver tmpfs volumes. Containers and volumes are
removed and their absence independently inspected after every outcome; only an
immutable image whose controller-owned input labels match may be reused.

The candidate sees exactly two read-only host binds: the disposable source
clone and the controller's pnpm v11 store. Its mutable workspace, evidence, and
temporary filesystems are bounded container-local storage. The root filesystem
is read-only; the process is `65532:65532`, has no network, capabilities,
new-privilege path, host PID/IPC namespace, port/device/socket, host home,
credential, target, or controller-state mount, and has fixed CPU, memory, PID,
file, and core limits. Before launch, image identity/labels, bounded-volume
options, and Docker's interpreted container policy are parsed independently of
the argv builder. Randomized candidate/exporter names must be proven unused
before create; once a create request is attempted, cleanup and absence
confirmation run even when the client response is interrupted or malformed.
The real hang case is accepted only after a controller-retained descendant PID
marker proves that setup completed before the bounded deadline fired.
The exporter starts before the candidate and keeps the tmpfs
volumes alive after candidate exit while exposing them read-only; a fixed
in-container preflight rejects links, special files, and combined size/count
breaches before any host copy. Publication then uses an exclusively opened
destination inode plus repeated size/hash checks.

Dependency installation is offline with a frozen lockfile, read-only frozen
store, explicit store-integrity verification, and copy materialization. The
lockfile is a mandatory protected trust root. `--trust-lockfile` is required so
pnpm 11 does not attempt network-backed supply-chain-policy revalidation inside
the deliberately networkless container; it does not make the store writable or
relax the frozen lockfile. Controller-owned containment evidence records the
Docker server version, exact image ID/input hash, candidate commit/tree,
capability identity, interpreted policy, lifecycle, bounded-volume cleanup,
and artifact inventories.

**Why.** A daemon-owned container can survive termination of its client, and a
plain bind-mounted writable clone cannot be bounded by bytes or inodes. Explicit
daemon stop/kill/remove plus Docker-managed tmpfs volumes makes termination and
storage limits inspectable. A minimal read-only helper preserves the volumes
long enough for export without making candidate containers reusable. Alternatives
rejected: host writable workspaces/evidence (unbounded host authority), copying
from a stopped tmpfs-backed container (Docker releases its tmpfs mount),
auto-remove (prevents post-exit inspection/export), a writable/shared pnpm store
(cross-command mutation), and claiming Podman or WSL equivalence from mocked
argv alone.

**Known residuals.** Real containment is currently evidenced on Docker Engine
29.1.3 under WSL2 Linux, not by the Windows controller and not on Podman or a
native POSIX CI host. The default template intentionally has no configured
image ID, so doctor remains `NOT_READY` until commissioning supplies one.
Product placeholders, calibration, autonomous readiness, hidden validation,
and human verification remain open.

**Affected files.** `container-executor.ts`, `container-image.ts`,
`container-artifacts.ts`, `verification-clone.ts`, their semantic and real OCI
fixtures/tests, execution-provider wiring, command/report contracts, package
scripts, configuration documentation, `CONTRACT.md`, and `README.md`.

## 2026-08-14 — Fail-closed candidate execution provider control plane (WP3c)

**Decision.** Candidate-authored focused verification and exact aggregate
commands now resolve through one controller-owned execution-provider boundary.
`trusted-container` is the default and every legacy config migration selects
it; until WP3d supplies the pinned OCI executor, it returns a deterministic
NOT_READY/infrastructure result before invoking any candidate launch function.
`unsafe-local-diagnostic` exists only as explicit controller configuration,
uses the WP3a/WP3b bounded supervisor, records host-inherited network and the
absence of image/mount containment, and is always completion-ineligible. There
is no automatic fallback between modes.

Provider evidence uses one strict, versioned identity containing mode,
implementation, runtime, image digest, mount-policy version, resource profile,
network disposition, capability identity/status, and completion eligibility.
The controller overwrites candidate-supplied identity and every
completion-relevant parse, review, target-integration, readiness-history, and
reconciliation boundary validates semantic equality with the authoritative
identity. Direct focused diagnostics are explicitly unattested/ineligible.
Legacy stored evidence migrates to `null`/unattested rather than being blessed;
a legacy pending target-integration operation with no provider attestation is
preserved as blocked with an `execution-provider-ineligible` diagnostic.
Doctor reports implementation, runtime, pinned image, and policy facts
independently, so runtime discovery cannot imply a complete trusted capability.

**Why.** A bounded host process is not containment, and candidate evidence
cannot attest the boundary that executed it. Making policy and identity
controller-owned closes the adoption/control-plane gap now while failing
honestly until the separate WP3d data-plane executor exists. Alternatives
rejected: implicit local fallback (would silently weaken containment), treating
Docker/Podman discovery as readiness (does not prove the executor/image/policy),
accepting structurally similar candidate identity (self-attestation), and
retroactively marking legacy local evidence trusted (fabricated provenance).

**Known residuals.** WP3c does not implement OCI/native containment,
disposable clones, mount construction, resource enforcement, or adversarial
escape coverage. The two POSIX-only process-tree tests remain explicit WP5
skips on Windows. Product placeholders, calibration, autonomous-readiness, and
human-verification gates remain open; no completion/readiness claim is made.

**Affected files.** `execution-provider-identity.ts`, `execution-provider.ts`,
config/schema/state/verifier/tier/integration/reconciliation/doctor paths and
tests, `scripts/verify.mjs`, default/example configs, `CONTRACT.md`, and
`README.md`.

## 2026-08-08 — Shared supervision at verifier and evidence trust roots (WP3b)

**Decision.** Every process launch owned directly by `scripts/verify.mjs` or
`tools/evidence.mjs` now resolves through the existing WP3a
`superviseCommand` boundary. The protected verifier uses finite identity and
stage-command timeouts, the shared per-stream output cap and kill grace, and
adds the complete supervision disposition to each launched-command record
without changing schema `2.1.0`, stage/profile meanings, status weights,
receipt validation, identity-drift rules, immutable-lock validation, or
completion eligibility. Evidence helpers use one asynchronous result adapter;
their callers await it explicitly, timeout or output breach remains
non-passing, and retained stdout/stderr is redacted before any console, log,
manual report, or error write. Package scripts launch the exact pnpm JavaScript
entry under the already selected Node executable so the supervised process is
the real package-manager root and the Node/pnpm pins stay observable. The
supervisor remains directly loadable by plain Node `24.18.0`, and its output
limit and kill-grace defaults have one runtime owner.

Isolated trust-boundary fixtures copy their exact transitive dependencies and
pinned package-manager state. In particular, verifier identity fixtures copy
the shared supervisor plus lockfile, while the production-build PASS-receipt
fixture copies the explicit repository-relative evidence-wrapper dependency
graph, including the supervisor, and creates nested destinations before copy.
This keeps missing dependency edges deterministic instead of allowing a host
checkout to mask them.

**Why.** WP3a bounded orchestrator-owned commands, but these two launch owners
still used bespoke `spawn`/`spawnSync` paths with unbounded capture, direct-child
timeout handling, or no timeout at all. Reusing the same supervisor makes cap,
redaction, tree termination, drain cutoff, exactly-once settle, and honest
`rootExitObserved` behavior consistent across controller, authoritative
verifier, and evidence commands. Executing pnpm through its JavaScript entry
avoids inserting a shell or shim process that would blur ownership and
termination evidence. Alternatives rejected: retaining synchronous probes
(unbounded and unsupervised), wrapping shell/shim launchers (ambiguous process
root), duplicating limits in the verifier/evidence layers (configuration
drift), and weakening isolated fixtures after the new import (would hide a
real packaging dependency).

**Known residuals.** This does not add OCI containment or execution-provider
identity, prove POSIX behavior, convert unrelated repository launch sites,
or change the previously recorded WP3a platform escape residuals. The two
POSIX-only supervisor tests remain explicit WP5 skips. No unsupported-platform,
product-completion, or autonomous-readiness claim is made.

**Affected files.** `scripts/verify.mjs`, `tools/evidence.mjs`,
`tools/run-tool-evidence.mjs`,
`tools/milestone-orchestrator/src/process-supervisor.ts`, `contracts.ts`,
`aggregate-verify-identity.test.ts`, `evidence-supervision.test.ts`, and
`tools/production-build.test.mjs`.

## 2026-08-07 — Supervisor drain cutoff and honest termination facts (WP3a review fix)

**Decision.** Independent review of the WP3a supervisor found three defects,
fixed as follows. (1) A per-stream cap breach that arrives while the runner
is draining after root exit now cuts the drain off immediately: the straggler
sweep runs at the breach (POSIX group SIGKILL; recorded as unavailable on
Windows behind a dead root), streams are destroyed, and the command settles
with a new `drainCutoff: "output-limit"` disposition — a breaching writer
that then closes its pipes can no longer skip the sweep, and the previous
behavior (`outputLimitExceeded` set with no termination action) is a tested
regression. (2) The spawn call is wrapped so a synchronous throw resolves an
ERROR-shaped result with `spawnError` set, restoring the never-rejects
contract end to end. (3) `termination.succeeded` was renamed to
`rootExitObserved` because that is all it ever proved: root exit after kill
initiation. No field claims tree-wide termination success; per-attempt
outcomes stay in `detail`, and tree-level assurance remains test-proven
(grandchild liveness polls), not runtime-claimed. The runner's breach
message distinguishes pre-exit tree termination from a post-exit drain
cutoff. Alternatives rejected: fabricating a termination record for a root
that exited naturally (misrepresents what acted), waiting out the drain
window on a post-exit breach (delays settle for no benefit and loses the
sweep when writers close first), and keeping a boolean named `succeeded`
with documentation-only caveats.

**Affected files.** `tools/milestone-orchestrator/src/process-supervisor.ts`
and tests, `command-runner.ts` and tests, `contracts.ts`.

## 2026-08-07 — Bounded process supervisor for controller commands (WP3a)

**Decision.** All controller-spawned verification commands run through one
shared supervisor (`process-supervisor.ts`) adopted by
`command-runner.ts#runCommand`. Output is retained in memory up to a
configured per-stream cap (`limits.commandOutputLimitBytes`, default 64 MiB),
then redacted and written once; bytes past the cap are counted but never
retained, a breach terminates the process tree and fails the command in the
existing infrastructure lane, and the truncation disposition (retained and
observed byte counts plus a marker line covered by the recorded SHA-256) is
explicit. Timeout and breach own the complete tree: Windows issues a
force-first `taskkill /pid <pid> /T /F` while the tree is intact, then falls
back to `child.kill()`; POSIX spawns the child detached as a process-group
leader and sends group SIGTERM escalating to group SIGKILL after
`limits.commandKillGraceMs` (default 5000 ms). Settle is exactly-once and
hard-bounded (`timeoutMs + 2 x killGraceMs`) through a drain window for
streams held open after exit and an abandonment backstop when no exit is ever
observed; a drain-expired command keeps its exit-code status with
`streamsClosed: false`/`drainTimedOut: true` recorded because receipts, not
stdout logs, gate semantic PASS. The summary carries a full `supervision`
record. Config schema is `1.5.0`; older configs migrate with defaults
injected.

**Why.** Audit CR-02 (P1/high): the runner buffered output without bound,
sent SIGTERM to the direct child only, and settled only on stream `close`, so
a SIGTERM-ignoring child or a pipe-holding descendant hung the controller and
a flood exhausted memory. Probing on Node 24.18.0/win32 (2026-08-07) fixed
two platform facts the design relies on: a non-detached Node grandchild dies
with its parent through libuv's kill-on-close job object, while a detached
grandchild escapes the job object, survives, and holds the inherited pipe
open indefinitely — the exact hang shape. Windows kill ordering is
force-first because `taskkill /T` walks live parent chains (a dead root
enumerates nothing) and WM_CLOSE is meaningless for hidden console children;
the summary's `signal` on Windows timeouts is therefore `null` with the
taskkill exit code, which no consumer misreads (all gate on `signal === null`
plus a specific exit code). Bounded in-memory capture-then-redact was chosen
over the improvement plan's stream-to-file mechanism so no unredacted byte
ever reaches disk; the plan's properties (bounded memory, bounded logs,
recorded disposition) are preserved, and truncation trims to a newline
boundary so a split secret prefix is never retained. The drain and abandon
windows reuse `commandKillGraceMs` rather than adding a third knob because
required config keys are expensive across the strict schema. Alternatives
rejected: Windows Job Objects (native bindings; owned by the container
slice), graceful-then-tree ordering on Windows (orphans grandchildren before
`/T` can see them), automatic local fallback on kill failure (records the
failure instead), and failing drain-expired exit-0 commands (receipts already
gate PASS; stragglers are recorded, and common toolchains leave benign ones).

**Known residuals.** Descendants reparented before the kill and PID reuse can
escape `taskkill /T`; a straggler that outlives the drain window on Windows
cannot be swept through a dead root; a fully detached (setsid) POSIX daemon
escapes group kills. All are recorded dispositions, strictly narrower than
the prior unbounded behavior, and owned by the WP3 container slice. POSIX
supervision paths are written but first execute in WP5 Linux CI; the skipped
tests are flagged `WP5`.

**Affected files.** `tools/milestone-orchestrator/src/process-supervisor.ts`
(new) and its tests, `command-runner.ts`, `contracts.ts`, `schema.ts`,
`config.ts`, `verifier.ts`, `reconciliation.ts`, `orchestrator.ts`,
`test/fixtures.ts`, `config/default.json`, `config/default.template.json`,
`examples/ski-tycoon/default.json`, `config/README.md`, `CONTRACT.md`.

## 2026-08-06 — State-owned approval-bound retention apply (WP2d)

**Decision.** State schema `1.8.0` extends the exclusive pending-operation
union with one global `retention-apply` intent. A strict plan `1.2.0` captures
the exact committed candidate and a SHA-256 fingerprint of tracked, staged,
unstaged, and non-ignored untracked bytes. After the operator approves the
complete plan bytes, apply revalidates controller state, candidate,
configuration, roots, citations, suspensions, and exact target manifests,
then publishes an intent bound to the full plan hash and canonical input
generation before creating apply evidence or deleting a run. Every target
enters durable delete-started state first. The JSONL journal and deterministic
result are synced, exact operation-derived evidence; neither a journal line,
missing path, plan pathname, nor prior result is authority. Recovery completes
only an exact canonical prefix, blocks and preserves conflicts, and adopts a
missing target only from delete-started state. Explicit apply and leased
startup use the same recovery path before other controller mutation, while one
pure reducer records retention completion and removes the intent. Status and
doctor remain read-only. The existing contained recursive-removal helper and
terminal workspace-cleanup semantics are unchanged.

**Why.** The former hash-approved command still transferred authorization to
unbound filesystem text: a forged `deleting` line could make a missing run
look resumable, a torn final append became interior corruption on the next
write, and process loss after deletion or result publication had no canonical
state phase to recover. Partial plan validation and a dirty boolean also failed
to bind exact approved bytes. State-first per-target authorization makes every
irreversible removal attributable, while deterministic derived evidence makes
all declared crash boundaries converge without introducing a second log
authority. Alternatives rejected: journal-owned recovery, hash-prefix apply
directories, adopting any missing approved path, truncating conflicting JSONL,
overwriting result conflicts, weakening freshness checks after intent, adding
automatic deletion to `loop:run`, or changing workspace-cleanup policy.

**Affected files.** Retention plan/apply contracts and tests, state contracts,
runtime/JSON schema and migration, operation reducers and lineage checks,
orchestrator startup/CLI/status/doctor routing, crash/recovery workers and
evidence, `README.md`, and `CONTRACT.md`.

## 2026-08-06 — Intent-first terminal workspace cleanup (WP2c)

**Decision.** State schema `1.7.0` extends the exclusive pending-operation
union with a strict `workspace-cleanup` intent. The controller publishes that
intent before removing `node_modules`, creating failed-run diagnostic entries,
or deleting a workspace. It advances through explicit dependency, archive,
and deletion phases, pins exact diagnostic hashes and completion timestamps,
and recovers under the controller lease before ordinary terminal cleanup. A
missing workspace is adoptable only after durable delete authorization, and a
failed workspace is deletable only after its complete archive exactly matches
the intent. One pure reducer owns every terminal cleanup state consequence.
Ambiguous workspace, Git, path, or archive facts are preserved and durably
blocked; status and doctor only classify them read-only. Completed cleanup
requires the observed HEAD to equal the terminal milestone record. Failed
cleanup retains that recorded fact but separately pins the exact observed
descendant, because candidate drift may itself be the recorded failure.

**Why.** The previous pending flag was written before cleanup but did not name
an exclusive operation or fence unrelated state. Process loss after recursive
deletion therefore left state behind the filesystem, and restart sampled new
timestamps while accepting missing completed workspaces or a lone failed-run
manifest as sufficient proof. Intent-first phases make each destructive effect
attributable and exactly classifiable, while deterministic archive bytes and a
shared completion reducer make restart converge. Alternatives rejected:
reconstructing authorization from the legacy cleanup flag, using archive
existence as authority, accepting a missing workspace before a delete phase,
overwriting conflicting diagnostic files, deleting substituted paths, and
combining cleanup with approval-bound evidence retention.

**Affected files.** State contracts/schema/store and JSON schema,
`operation-intent.ts`, `workspace-cleanup-operation.ts`, orchestrator cleanup
and startup recovery, status and doctor diagnostics, crash/race workers and
recovery tests, `README.md`, and `CONTRACT.md`.

## 2026-08-06 — Intent-first target integration and canonical completion (WP2b)

**Decision.** State schema `1.6.0` extends the single pending-operation union
with a strict `target-integrate` intent. The controller publishes that intent
after exact candidate, approval, verification-result, commit-list, and
protected-file validation but before outcome, fetch, ref, index, or worktree
side effects. The operation pins one deterministic pending/integrated outcome
encoding and advances through explicit artifact/target phases. Recovery runs
under the controller lease before ordinary target-drift handling, revalidates
the standalone candidate on every pass, resumes only from the exact clean
base, and adopts only the exact clean candidate. One pure completion reducer
owns every semantic state consequence. Any other target, candidate, path, Git,
or outcome classification is preserved and durably blocked. Reviewer approval
without the intent no longer permits implicit integration reconciliation.

**Why.** The previous fast-forward happened before canonical completion state,
so process loss could leave the target at the candidate while state still
reported the base and a reviewing milestone. Startup then used a second
handwritten reviewer-as-intent path that omitted vertical-consumer state,
processed count, final outcome, and stop bookkeeping. Intent-first ordering
makes the external side effect attributable before it can happen; deterministic
outcome bytes and exact base/candidate classification make every observable
restart state decidable. A shared reducer prevents normal and recovered paths
from drifting semantically. Alternatives rejected: retaining reviewer approval
as implicit intent, using `git-outcome.json` as authority, resetting or cleaning
an ambiguous target, accepting any descendant target, a second integration
journal, and separate normal/recovery completion mutations.

**Affected files.** State contracts/schema/store and JSON schema,
`operation-intent.ts`, `readiness-completion.ts`, `target-integration.ts`,
orchestrator integration/startup, status and doctor diagnostics, crash/race
workers and recovery tests, `README.md`, and `CONTRACT.md`.

## 2026-08-06 — Intent-first, validate/adopt workspace creation (WP2a)

**Decision.** Isolated workspace creation is represented by one exclusive
state-schema `1.5.0` `workspace-create` operation bound to the exact pre-intent
Git state generation. The controller clones only after that intent is
canonical, uses a unique short `.create-<sha256-prefix>` entry under the
configured workspace root, records adjacent durable phases around filesystem
boundaries, and publishes to the stable run/milestone path with no-clobber
rename semantics. Recovery runs under the controller lease before ordinary
orchestrator mutations. It resumes or adopts only after exact filesystem and
Git validation; ambiguous entries remain in place with a durable blocked
diagnostic. Read-only status and doctor expose the same classification and
next safe action without recovery. Canonical `1.4.0` generations are migrated
in memory and advance to `1.5.0` only on the next CAS save.

**Why.** Direct cloning to the final deterministic path left an unrecorded
directory after a crash between clone and workspace-record persistence, and a
retry could neither prove ownership nor proceed. Intent-first ordering gives
every possible controller-created entry a durable identity, while a temporary
publication boundary separates incomplete clones from adoptable final state.
The short hashed temporary name preserves Windows path headroom for Git ref
lock files without weakening uniqueness. Preserving suspicious content is the
only fail-closed default that does not destroy possible user evidence.
Alternatives rejected: direct final-path clone, deleting or overwriting an
unrecognized path, treating path existence as ownership, reusing the state
mirror as a journal, a second operation-log authority, and automatic
quarantine moves whose source identity cannot be proved race-free.

**Affected files.** State contracts/schema/store, `operation-intent.ts`,
`workspace-create.ts`, orchestrator startup and attempt creation, status and
doctor diagnostics, Git-isolation fixtures, tests, `README.md`, and
`CONTRACT.md`.

## 2026-08-05 — Ref-rooted Git commits as canonical state generations (WP1b)

**Decision.** Canonical controller state lives at the fixed local ref
`refs/milestone-loop/state`. Each target is a strict commit with exact
`state.json` and `metadata.json` blobs, an optional byte-exact
`legacy-state.json`, and one parent naming the prior generation. Creation pins
the controller identity, timestamp, and message; reading validates those facts
plus state schema/hash/revision, exact successor relation, parent, and tree.
Publication uses the exact loaded object ID as the expected old ref. The
configured JSON path is a replaceable human mirror, never a second authority.
Only `initialize()` and `loadForMutation()` arm a `StateStore` for publication;
`load()` is capability-read-only. Doctor diagnostics advanced to schema
`1.2.0` to expose the state ref, generation, source, and mirror disposition.

**Why.** Git is already a required cross-platform dependency and its ref CAS
closes the lost-update window without introducing a second lock protocol.
Commit ancestry keeps the previous generation reachable and inspectable, while
ordinary branch pushes exclude the private namespace. Separating the mirror
allows post-publication repair without rolling back canonical state. Retaining
exact imported bytes preserves reconciliation evidence without running dual
writers. Alternatives rejected: relying on the controller lease alone,
revision-only rename fencing, file locks, treating the mirror as a fallback,
two-format canonical writes, automatic recovery from malformed canonical refs,
and permitting observational loads to authorize later saves.

**Affected files.** `private-ref-store.ts`, `state-generation-store.ts`,
`state-store.ts`, orchestrator/reconciliation/retention call sites, doctor and
status diagnostics, the safety demonstration, tests, `README.md`, and
`CONTRACT.md`.

## 2026-08-05 — Git private ref plus legacy-protocol guard for leases (WP1a)

**Decision.** Controller ownership lives at the fixed local ref
`refs/milestone-loop/controller-lease`; its target is a strict schema `2.0.0`
owner blob. All publication and deletion names an expected old object ID. The
old `controller.lease` pathname remains only as a permanent, recognizable
protocol guard whose foreign host-instance identity makes an older binary fail
closed. Any other legacy-path content blocks ref acquisition. The doctor
diagnostic was advanced to schema `1.1.0` to expose the canonical ref and guard
status.

**Why.** Git is already mandatory, provides tested cross-platform atomic ref
comparison, supports SHA-1 and SHA-256 repositories, keeps the active owner
object reachable, and does not push this namespace during normal branch
pushes. The guard closes the otherwise unavoidable overlap window where an
already-installed old binary could acquire the retired file lease while a new
binary owns only the ref. Alternatives rejected: rename/quarantine retries,
PID-only lock files, an unproved third-party lock package, automatic deletion
of ambiguous legacy files, and running dual lease writers.

**Affected files.** `tools/milestone-orchestrator/src/private-ref-store.ts`,
`controller-lease.ts`, `doctor.ts`, their tests, `README.md`, and `CONTRACT.md`.

## 2026-08-05 — Explicit, clean-clone production-build contract (WP0)

**Decision.** The root `build` script remains the controller-owned evidence
wrapper. Adopters declare a distinct real script and explicit output roots at
`package.json#milestoneLoop.productionBuild`. The wrapper builds the exact clean
commit in a disposable clone after a frozen offline copy-mode install, removes
pre-existing outputs, rejects mutation outside the declared roots and every
linked output, and records a twice-checked output hash inventory before writing
the receipt. Absence of the declaration is `NOT_READY`.

**Why.** Output conventions vary across adopting projects, so guessing `dist/`
or treating exit zero as proof would preserve the original false-positive path.
Building in the source checkout would allow stale ignored artifacts to satisfy
the check. Alternatives rejected: an echo/generated sentinel, timestamp-based
freshness, recursively invoking `build`, trusting a report without rechecking
its files, and silently selecting conventional output directories.

**Affected files.** `tools/production-build.mjs`,
`tools/run-tool-evidence.mjs`, `tools/production-build.test.mjs`, `README.md`,
`CONTRACT.md`, and `tools/milestone-orchestrator/config/README.md`.

## 2026-08-05 — Workspace toolchain re-install before verification (P0.7 / A-1)

**Decision.** `verify()` re-runs `pnpm install --frozen-lockfile --offline
--package-import-method=copy` in the isolated workspace between the Worker
turn and verification (`verification-reinstall` artifact in the attempt
directory).

**Why.** Gitignored `node_modules` content is invisible to every diff,
status, identity, and protected-hash fence, so a Worker with workspace write
access could otherwise leave a tampered toolchain in place for verification
to execute. The frozen offline re-install reconciles the modules directory
with the lockfile-bound store first.

**Known residual.** pnpm skips packages whose recorded install state still
matches, so a byte-level edit inside an installed package that preserves
pnpm's metadata can survive the re-install. Full denial of workspace
`node_modules` writes belongs to process sandboxing (audit R-01 / P1.1).
Alternative considered: `--force` re-copy on every verification — rejected
for now as a large per-attempt cost for a partial gain; revisit with R-01.

**Affected files.** `tools/milestone-orchestrator/src/orchestrator.ts`
(`prepareWorkspace` stage parameter, `verify()` head).
