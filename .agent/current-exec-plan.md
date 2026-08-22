# Current Execution Plan

**Status:** WP5w freeze and commit, then WP5x exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Commit the proved WP5w fixture correction, then repair the next bounded owner:
`tools/milestone-orchestrator/src/workspace-create.test.ts::fixture()`.
Reproduce its complete 5-case file from exact clean WP5w under genuine NTFS
8.3 TEMP; retain assertion-only red, canonicalize only its fresh parent root,
verify Windows and Linux ext4, and create one separate local commit.

Do not weaken strict consumers, normalize caller/pre-existing paths, change
workspace-create semantics, bundle later roots, run source no-argument
`pnpm verify`, close CAL-1, push, or claim readiness.

## Goal Constraints

- Preserve all immutable hashes, readiness marker/default, CAL-1 open/zero,
  ignored `.tools/corepack-home-readonly-probe`, and protected human file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  genuine compact Windows short TEMP, Linux ext4, serial Vitest, and unique
  writable checkout/TEMP/Corepack/store/telemetry/evidence roots.
- Change only `workspace-create.test.ts::fixture()`'s just-created parent and
  retain a direct assertion before derived source/Git paths. Production Git,
  workspace-create/recovery, state/schema, fault hooks, and caller paths remain
  byte-identical unless a separate downstream proof requires replanning.
- One cohesive commit per owner; broader Session 1 checks run only once after
  all intended tracked bytes freeze.

## Baseline Evidence

- Current HEAD before WP5w commit is WP5v
  `05afdba36b53d5e1e71237b26b6209c2136f22b4` / tree
  `60d104aff7d56d5fa27f6e0ecbe4cf9a700ae863`, five ahead of origin.
- WP5w exact baseline/assertion-only are 0/4 ERROR/no receipt; corrected tree
  `a81692822dde9520ac3268aced3dce2af87796ff` passes 4/4 on Windows-short and
  Linux ext4 with valid bindings.
- Historical `workspace-create.test.ts` at `1786995272196` is 0/5. Strict
  inspection rejects short `milestone-loop-workspace-*\source` versus its
  expanded realpath. Current `fixture()` owns raw parent `mkdtemp` and derives
  `source` from it.

## Steps

1. [ ] **In progress:** Format/stage exactly WP5w test/log/plan, audit scope
       and identities, then commit locally.
2. [ ] Reproduce unchanged WP5x 0/5 from exact clean WP5w under short TEMP;
       retain ERROR report/manifest and absence of receipt.
3. [ ] Add only promise `realpath` plus a direct equality assertion beside the
       parent creator in a second clone; retain direct assertion red.
4. [ ] Canonicalize only the fresh parent, retain the assertion, and pass the
       complete Windows file 5/5 with receipt.
5. [ ] Pass the identical owner tree 5/5 on Linux ext4; audit bindings and
       classify the next retained owner.
6. [ ] Record, audit, and commit WP5x narrowly; hand off the active plan.

## Acceptance Criteria

- WP5w commits only its test/log/plan after 4/4 Windows/Linux owner evidence.
- WP5x baseline and assertion red retain ERROR/no receipt; assertion localizes
  all cases before strict boundary. Corrected Windows/Linux pass 5/5, zero
  skips, with valid independently matched receipts.
- Production and caller paths stay unchanged; immutable/lifecycle/protected
  identities remain exact; one local commit, no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/workspace-create.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5x-workspace-create-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, at most two heavy
aggregates concurrently. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Keep the expanded TEMP compact while proving a distinct genuine 8.3 alias,
  so intentional nested refs stay within Git-for-Windows' path budget.
- A downstream production red requires its own direct proof and replan.
- Recovery is ordinary revert; no ref rewrite, push, lifecycle change, or
  broad cleanup.

## Progress and Evidence

- 2026-08-22: WP5w owner tree passed 4/4 Windows-short and Linux ext4 after
  exact baseline and assertion-only 0/4 evidence.
- 2026-08-22: Historical/current source identify
  `workspace-create.test.ts::fixture()` as next owner; WP5x is unmodified.

## Next Action

Freeze the WP5w three-path scope, audit protected identities, and create its
local commit.
