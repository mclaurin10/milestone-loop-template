# Current Execution Plan

**Status:** WP5ag Session 1 frozen-candidate verification
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Commit WP5af's final focused owner, freeze every intended Session 1 tracked
byte, and run the six required broader commands exactly once from isolated
no-local/no-hardlink Windows clones of the identical committed candidate. Audit
every command-owned receipt, artifact, manifest, toolchain, count, skip, and
candidate binding; retain a final ignored audit without changing tracked bytes.

Do not edit tracked files after the freeze, run source no-argument
`pnpm verify`, push, alter serial Vitest behavior, claim readiness, or treat a
zero exit without a valid receipt as passing.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, exact clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, and unique checkout, Corepack, store,
  telemetry, and command-evidence roots for every command.
- Run no more than two broader commands concurrently and do not overlap the
  two longest duplicate test aggregates if that would jeopardize timeouts.
- Any tracked change after a successful broader command invalidates its
  receipt. Final results therefore belong in retained ignored evidence and the
  final response, not a post-freeze tracked edit.

## Frozen-Candidate Inputs

- WP5af base is WP5ae commit
  `37f5be3a4d97c77878dbcae03b3739cbb74b61fd` / tree
  `cb099e63a733e5ccff98a3f0937e232bb00c6852`.
- WP5af final test-only corrected tree
  `15355fb65128893074d86ed489a8add59a9e69f3` passes Windows and Linux ext4
  3/3 with valid receipts. Production verification-clone code is unchanged.
- The complete retained hosted-Windows focused inventory is exhausted.
  Every changed causal owner has direct red proof, Windows full-file green,
  Linux ext4 parity, and a separate local commit or the pending WP5af commit.
- Origin remains published WP5q `3113c13182951814459628cebe252fe97fd93d9a`;
  all Session 1 commits remain local and must not be pushed.

## Steps

1. [x] Complete all projected focused owners through WP5af with exact
       reproduction, direct proof, minimal correction, and platform parity.
2. [ ] **In progress:** Format/audit/stage only WP5af's test, autonomy entry,
       and this handoff plan; commit narrowly and record the resulting exact
       commit/tree as the immutable Session 1 candidate.
3. [ ] Create six independent exact clean clones of that commit, each with its
       own Node-facing PATH, Corepack cache, fresh writable pnpm store,
       genuine distinct NTFS 8.3 TEMP/TMP/TMPDIR, telemetry run ID, and
       command artifact directory. Verify no alternates and exact clean HEAD.
4. [ ] Run exactly once on the frozen candidate:
       `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
       `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`.
5. [ ] Independently verify every declared artifact's bytes/SHA-256, receipt
       schema/status, manifest PASS and candidate commit/tree, command/test
       counts and skips, toolchain, and clone cleanliness.
6. [ ] Write only ignored
       `artifacts/manual/wp5ag-session1-final-audit/audit-result.json`; confirm
       the authoritative tree remains clean apart from the protected untracked
       file and disclosed ignored residue. Report exact results and gaps.

## Acceptance Criteria

- WP5af commit contains only its verification-clone test, evidence-backed
  autonomy entry, and this frozen-candidate plan.
- All six commands execute once against one identical committed tree, pass,
  and own valid independently verified receipts/artifacts. Windows
  `test:orchestrator` provides hosted-style aggregate coverage; focused Linux
  ext4 parity already covers every changed owner.
- No tracked byte changes after freeze; immutable/readiness/CAL-1/protected
  identities remain exact; origin is unchanged; no push.
- The final ignored audit truthfully records any failure or skip. Session 1 is
  complete only if all six commands pass and the final working-tree audit is
  clean under the stated exception.

## Verification

- `pnpm test:invariants`
- `pnpm test:orchestrator`
- `pnpm test:unit`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`

Use their repository-prescribed command-owned evidence boundaries. Never run
source no-argument `pnpm verify`.

## Risks and Recovery

- `test:orchestrator` and `test:unit` are long, overlapping suites. Keep their
  clones and writable roots independent and schedule conservatively.
- A failure is not a pass and must retain its ERROR evidence. Diagnose from
  the isolated clone; if a tracked repair is required, this frozen candidate
  is abandoned and affected final checks must be rerun on the new freeze.
- Do not update this plan/log after a successful command. The ignored final
  audit is the durable post-freeze evidence that preserves receipt identity.

## Progress and Evidence

- 2026-08-22: All focused Windows failures in the retained inventory are
  causally repaired and matched on Linux ext4.
- 2026-08-22: WP5af final tree `15355fb` passes 3/3 on both platforms; tracked
  WP5af records are ready for final format/audit/commit.

## Next Action

Audit and commit WP5af, then create the six independent exact clones before
running any broader command.
