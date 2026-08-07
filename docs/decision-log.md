# Decision Log

Record durable or costly-to-reverse decisions: date, decision, alternatives
considered, rationale, and affected files. Newest first.

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
