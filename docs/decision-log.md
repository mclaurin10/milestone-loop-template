# Decision Log

Record durable or costly-to-reverse decisions: date, decision, alternatives
considered, rationale, and affected files. Newest first.

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
