# Decision Log

Record durable or costly-to-reverse decisions: date, decision, alternatives
considered, rationale, and affected files. Newest first.

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
