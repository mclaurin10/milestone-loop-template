# Current Execution Plan

**Status:** WP5y exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With the proved WP5x fixture-parent correction committed, repair
`tools/milestone-orchestrator/src/workspace-cleanup.test.ts::fixture()` as the
next separate hosted-Windows owner. Reproduce its full six-case file from exact
clean WP5x under genuine NTFS 8.3 TEMP, retain direct assertion red,
canonicalize only its fresh root, verify Windows and Linux ext4, and commit
narrowly without pushing.

Do not weaken consumers, normalize caller/pre-existing paths, change cleanup
semantics, bundle later roots, run source no-argument `pnpm verify`, close
CAL-1, or claim readiness.

## Goal Constraints

- Preserve immutable hashes, readiness marker/default, CAL-1 open/zero,
  protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact genuine Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only `workspace-cleanup.test.ts::fixture()`'s fresh root; retain a
  direct assertion before Git/workspace setup. Production Git, workspace
  cleanup/archive, reducer, state/schema, and caller paths stay byte-identical
  unless a separate direct proof forces replanning.
- One local cohesive commit per owner; broader Session 1 checks run once after
  final tracked freeze.

## Baseline Evidence

- Current HEAD before WP5x commit is WP5w
  `e292d411bd6c3b18c8bba284eeed83132a351047` / tree
  `6d273ab902cf5dd47b72f1813a02a3dbaf2739ea`, six ahead of origin.
- WP5x exact baseline/assertion are 0/5 ERROR/no receipt. Corrected tree
  `9e2438f1cb28798ce63e84e150601b00545d2587` passes Windows 5/5 and Linux
  PASS 4 plus one existing Windows-only junction skip.
- Historical `workspace-cleanup.test.ts` at `1786995278951` is 0/6. Strict
  Git inspection rejects short `milestone-loop-cleanup-unit-*` against its
  expanded realpath; current `fixture()` directly owns that fresh root.

## Steps

1. [x] Format/stage WP5x test/log/plan only, audit identities, and commit
       locally.
2. [ ] **In progress:** Reproduce unchanged WP5y 0/6 from exact clean WP5x
       under short TEMP;
       retain ERROR/no receipt.
3. [ ] Add only promise `realpath` plus a direct assertion beside the creator
       in a second clone; retain assertion-localized red.
4. [ ] Canonicalize only that fresh root, retain assertion, and pass complete
       Windows 6/6 with receipt.
5. [ ] Pass identical owner tree on Linux ext4 with only explicit pre-existing
       platform skips accepted; audit bindings and classify next owner.
6. [ ] Record/audit/commit WP5y narrowly and hand off the plan.

## Acceptance Criteria

- WP5x commits only test/log/plan after valid Windows/Linux parity.
- WP5y baseline and assertion evidence remain ERROR/no receipt and localize
  the owner before strict boundaries; corrected Windows and appropriate Linux
  parity pass with valid receipts.
- Production/caller paths unchanged; immutable/lifecycle/protected identities
  exact; one local commit; no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/workspace-cleanup.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5y-workspace-cleanup-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, `pnpm format:check`; at most two heavy commands
overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Keep expanded TEMP compact while proving a distinct 8.3 alias.
- A downstream production red requires separate proof and replan.
- Recovery is ordinary revert; no push/ref rewrite/lifecycle change/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5x retained baseline/assertion 0/5, then passed Windows 5/5
  and Linux PASS with one explicit Windows-only junction skip.
- 2026-08-22: Historical/current source identify
  `workspace-cleanup.test.ts::fixture()` next; WP5y is unmodified.

## Next Action

Create an exact clean WP5x clone and reproduce unchanged WP5y under genuine
short TEMP.
