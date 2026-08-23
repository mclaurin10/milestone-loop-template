# Current Execution Plan

**Status:** WP5ac retention-apply fixture exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With WP5ab's scoped Git-isolation correction committed, reproduce and repair
only `tools/milestone-orchestrator/src/retention-apply-recovery.test.ts::preparedFixture()`'s
fresh directory. Use exact clean WP5ab clones, genuine NTFS 8.3 TEMP, a direct
assertion-only owner proof, minimal fresh-directory canonicalization, the
complete two-case Windows recovery matrix, Linux ext4 parity, and one separate
local commit.

Do not alter the crash worker, retention operation/recovery, state/schema,
lease synchronization, fault points/exit codes, caller/pre-existing paths,
readiness/CAL-1 state, or later roots. Do not run source no-argument
`pnpm verify`, push, or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only `preparedFixture()`'s just-created directory and retain a direct
  promise-realpath assertion before registration, metadata derivation, or
  subprocess launch. Worker/production paths remain byte-identical unless a
  separate direct proof forces replanning.
- Keep one local commit per causal owner; broader Session 1 checks run exactly
  once after all intended tracked bytes freeze.

## Baseline Evidence

- WP5ab exact baseline/assertion are both 2/4 ERROR/no receipt; corrected tree
  `6c14d7c450df1613beeff3d6b767f5c1eb8e03f5` passes Windows and Linux ext4
  4/4, while the two unproved later roots stay unchanged.
- WP5ab commits from prior HEAD
  `0de6fea0796c33341560699334ac7ef2867d329e` / tree
  `708af19aec17e39d3c548f29d01c87643e071a88`.
- Historical `retention-apply-recovery.test.ts` at `1786995292928` is 0/2.
  Its worker fails while persisting a schema-invalid pending operation because
  `preparedFixture()` passes a short directory spelling into derived metadata
  and repository paths. Current outcome is not assumed.

## Steps

1. [x] Prove WP5ab baseline/scoped owner/correction, pass Windows/Linux 4/4,
       audit identities, and commit its test/log/plan only.
2. [ ] **In progress:** Reproduce unchanged WP5ac from exact clean WP5ab under
       short TEMP; retain ERROR/no receipt if the current 0/2 red remains.
3. [ ] Add only promise `realpath` and a direct directory equality assertion
       in a second clone; retain assertion-localized red before any worker.
4. [ ] Canonicalize only the fresh directory, retain the assertion, and pass
       the complete Windows two-case crash/concurrency matrix with receipt.
5. [ ] Pass the identical corrected tree on Linux ext4, audit bindings, and
       classify the next historical owner without changing it.
6. [ ] Record, audit, and commit WP5ac narrowly; hand off the active plan.

## Acceptance Criteria

- WP5ab commit contains only its scoped Git-isolation test, autonomy entry,
  and this handoff plan after exact Windows/Linux parity.
- WP5ac baseline and assertion evidence retain truthful counts and ERROR/no
  receipt; the assertion proves the directory before metadata/worker paths.
- Corrected Windows/Linux pass 2/2 with valid receipts and unchanged fault
  matrix/concurrency semantics. Production/worker/caller paths stay unchanged;
  immutable/lifecycle/protected identities remain exact; one commit, no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/retention-apply-recovery.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5ac-retention-apply-recovery-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- The corrected file runs a multi-process fault matrix; wait for the bounded
  command and preserve every declared crash exit rather than shortening it.
- Keep expanded TEMP compact while proving a distinct 8.3 alias.
- A worker/production red after canonicalization requires separate proof and
  replan. Recovery is ordinary revert; no push/ref rewrite/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5ab retained baseline/assertion 2/4 and passed identical
  corrected tree 4/4 on Windows-short and Linux ext4 without touching the two
  later roots.
- 2026-08-22: Historical/current source identify `preparedFixture()` next;
  WP5ac and its worker are unmodified.

## Next Action

Construct an exact clean WP5ab clone and reproduce the unchanged two-case
WP5ac file under genuine short TEMP.
