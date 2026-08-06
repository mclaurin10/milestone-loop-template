# Decision Log

Record durable or costly-to-reverse decisions: date, decision, alternatives
considered, rationale, and affected files. Newest first.

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
