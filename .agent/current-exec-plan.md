# Current Execution Plan

**Status:** WP5aa retention-startup exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With WP5z's proved contract-clone correction committed, reproduce and repair
only the next historical Windows owner:
`tools/milestone-orchestrator/src/orchestrator-retention-recovery.test.ts`'s
fresh `milestone-loop-retention-startup-*` root. Use exact clean WP5z clones,
genuine NTFS 8.3 TEMP, direct assertion-only proof, minimal fresh-root
canonicalization, complete Windows coverage, Linux ext4 parity, and one
separate local commit.

Do not alter retention operation/state/schema meanings, strict containment or
realpath checks, expected crash handoff, orchestrator recovery, protected-root
top-up, caller/pre-existing paths, readiness/CAL-1 state, or later roots. Do
not run source no-argument `pnpm verify`, push, or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only the test-owned root immediately after `mkdtemp` and retain a
  direct promise-realpath assertion before Git/config/state setup. Production
  retention, schema, state, orchestrator, and path consumers remain
  byte-identical unless separate direct proof forces replanning.
- Keep one local commit per causal owner; broader Session 1 checks run exactly
  once after all intended tracked bytes freeze.

## Baseline Evidence

- WP5z exact baseline is 1/2 and assertion-only is 0/2, both ERROR/no receipt;
  corrected tree `d9c72bfcf2796796cc4468f2f1be1326f1440ee5` passes Windows and
  Linux ext4 2/2 with valid bindings.
- WP5z commits from prior HEAD
  `56dc9efbff64fa14e6d2787564b49b4284e74a96` / tree
  `56842641f182a009a4861b0b8d4036edfee5c82e`.
- Historical `orchestrator-retention-recovery.test.ts` at `1786995288202` is
  0/1. The pending operation became schema-invalid before the expected
  simulated startup handoff. Current test owns a raw retention-startup root;
  planning resolves that short spelling while realpath-backed artifact fields
  observe the expanded root. Current outcome is not yet assumed.

## Steps

1. [x] Prove WP5z baseline/owner/correction, pass Windows/Linux 2/2, audit
       identities, and commit its test/log/plan only.
2. [ ] **In progress:** Reproduce unchanged WP5aa from an exact clean WP5z
       clone under short TEMP; retain ERROR/no receipt if the current red
       remains.
3. [ ] Add only promise `realpath` and a direct root equality assertion in a
       second clone; retain assertion-localized red before Git/state setup.
4. [ ] Canonicalize only the fresh root, retain the assertion, and pass the
       complete one-case Windows file with a valid receipt.
5. [ ] Pass the identical corrected tree on Linux ext4, audit bindings, and
       classify the next historical owner without changing it.
6. [ ] Record, audit, and commit WP5aa narrowly; hand off the active plan.

## Acceptance Criteria

- WP5z commit contains only its contract-integrity test, autonomy entry, and
  this handoff plan after exact Windows/Linux parity.
- WP5aa baseline and assertion evidence accurately reflect current outcomes;
  failed runs retain ERROR/no receipt, and the assertion proves the fresh root
  before retention/state boundaries.
- Corrected Windows and Linux parity pass with valid receipts. Production and
  caller paths stay unchanged; immutable/lifecycle/protected identities remain
  exact; one local commit, no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/orchestrator-retention-recovery.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5aa-orchestrator-retention-recovery-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Preserve the intentional `after-run-deleted` crash and the strict pending
  operation schema; only the test fixture's created root is in scope.
- Keep expanded TEMP compact enough for Git-for-Windows paths while proving a
  distinct 8.3 alias.
- A downstream production red requires separate proof and replan. Recovery is
  ordinary revert; no push/ref rewrite/lifecycle change/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5z retained baseline 1/2 and assertion 0/2, then passed the
  identical corrected tree 2/2 on Windows-short and Linux ext4.
- 2026-08-22: Historical/current source identify the raw retention-startup
  test root next; WP5aa is unmodified.

## Next Action

Construct an exact clean WP5z clone and reproduce the unchanged one-case
WP5aa file under genuine short TEMP.
