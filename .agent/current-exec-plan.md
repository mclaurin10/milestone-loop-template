# Current Execution Plan

**Status:** WP5ad deterministic fixture exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With WP5ac's full retention-recovery matrix committed, reproduce and repair
only `tools/milestone-orchestrator/src/deterministic-operations.test.ts::deterministicFixture()`'s
fresh root. Use exact clean WP5ac clones, genuine NTFS 8.3 TEMP, direct
assertion-only proof, minimal root canonicalization, complete Windows 2-case
coverage, Linux ext4 parity, and one separate local commit.

Do not alter orchestrator open/inspect, Git identity, lease/read-only behavior,
state/reconciliation, caller/pre-existing paths, readiness/CAL-1 state, or
later artifact/clone roots. Do not run source no-argument `pnpm verify`, push,
or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only `deterministicFixture()`'s just-created root and retain a direct
  promise-realpath assertion before registration/config/Git setup. Production
  paths remain byte-identical unless a separate direct proof forces replanning.
- Keep one local commit per causal owner; broader Session 1 checks run exactly
  once after all intended tracked bytes freeze.

## Baseline Evidence

- WP5ac baseline/assertion are 0/2 ERROR/no receipt; corrected tree
  `92c4b1a6d30083dbcd4987d75340fd23394368da` passes the full Windows and
  Linux ext4 recovery matrix 2/2 with valid bindings.
- WP5ac commits from prior HEAD
  `2dcca3ad78394ba01d1a410587383ceabf2cb87b` / tree
  `c17c5f0a6b3af174d8ad7b919e2aef135feb775f`.
- Historical `deterministic-operations.test.ts` at `1786995301890` is 0/2.
  Both cases use shared `deterministicFixture()` and fail strict Git root
  inspection when the short fixture spelling expands. Current outcome is not
  assumed.

## Steps

1. [x] Prove WP5ac baseline/owner/correction, pass both complete platform
       matrices, audit identities, and commit its test/log/plan only.
2. [ ] **In progress:** Reproduce unchanged WP5ad from exact clean WP5ac under
       short TEMP; retain ERROR/no receipt if current 0/2 remains.
3. [ ] Add only promise `realpath` and a direct root equality assertion in a
       second clone; retain assertion-localized red before setup.
4. [ ] Canonicalize only the fresh root, retain the assertion, and pass the
       complete Windows file 2/2 with a valid receipt.
5. [ ] Pass the identical corrected tree 2/2 on Linux ext4, audit bindings,
       and classify the next historical owner without changing it.
6. [ ] Record, audit, and commit WP5ad narrowly; hand off the active plan.

## Acceptance Criteria

- WP5ac commit contains only its recovery test, autonomy entry, and this
  handoff plan after exact full-matrix Windows/Linux parity.
- WP5ad baseline/assertion retain truthful counts and ERROR/no receipt; the
  assertion proves the root before configuration/Git/orchestrator boundaries.
- Corrected Windows/Linux pass 2/2 with valid receipts. Production/caller
  paths stay unchanged; immutable/lifecycle/protected identities remain exact;
  one local commit, no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/deterministic-operations.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5ad-deterministic-operations-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Preserve read-only inspection and lease assertions; only fixture spelling is
  in scope.
- Keep expanded TEMP compact while proving a distinct 8.3 alias.
- A production red after canonicalization requires separate proof and replan.
  Recovery is ordinary revert; no push/ref rewrite/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5ac retained baseline/assertion 0/2 and passed the full
  identical recovery matrix 2/2 on Windows-short and Linux ext4.
- 2026-08-22: Historical/current source identify
  `deterministicFixture()` next; WP5ad is unmodified.

## Next Action

Construct an exact clean WP5ac clone and reproduce the unchanged two-case
WP5ad file under genuine short TEMP.
