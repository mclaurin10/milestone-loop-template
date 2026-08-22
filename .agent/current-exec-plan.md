# Current Execution Plan

**Status:** WP5v freeze and commit, then WP5w exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Freeze and commit the proved WP5v fixture correction, then complete the next
bounded hosted-Windows fixture increment:
`tools/milestone-orchestrator/src/target-integration.test.ts`, whose failed
root is created by that file's `fixture()` helper.

From the exact clean WP5v commit, reproduce the complete file under genuine
NTFS 8.3 TEMP, add an assertion-only root proof, canonicalize only that fresh
fixture root, retain the assertion, verify Windows and Linux ext4, and create
one separate narrow commit.

Do not normalize caller-controlled/pre-existing paths, weaken strict Git or
workspace consumers, alter target-integration semantics, bundle later files,
run source no-argument `pnpm verify`, close CAL-1, or claim readiness.

## Goal Constraints

- Preserve immutable hashes, readiness default/marker, CAL-1
  `open_not_started`/zero, and the protected human file at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`.
- Use Node `24.18.0`, pnpm `11.15.1`, no-local/no-hardlink clones, genuine
  Windows short TEMP, WSL2 ext4 parity, serial Vitest, and isolated writable
  checkout/TEMP/Corepack/store/telemetry/evidence roots.
- Change only `target-integration.test.ts::fixture()`'s just-created root and
  keep a direct assertion before Git/workspace setup. Production Git,
  workspace, target integration, reducer, state/schema, and fault behavior
  remain byte-identical unless separately proved.
- One cohesive commit per causal owner; do not push. Run Session 1 broader
  aggregates only once after all intended tracked bytes freeze.

## Baseline Evidence

- Current HEAD before WP5v commit is WP5u
  `5653a345d1c3cbb35e2962c0de7c171e97ba794f` / tree
  `8fba32c639c8f8c79869a760a09e5d07e04fd948`, four ahead of unchanged
  `origin/master`.
- WP5v exact baseline and assertion-only runs reproduce 0/5 with ERROR/no
  receipt. Creator-only tree
  `e9f3789866865ed0ef7f54332d08f3f6655b8ba7` passes 5/5 on Windows-short
  TEMP and Linux ext4 with valid independently matched receipts.
- The retained hosted report places `target-integration.test.ts` next at
  `1786995254903`: 0/4. Its failures reach strict inspection through raw
  `milestone-loop-target-action-*` created by that file's `fixture()`.
- Current source confirms that fresh root becomes both repository authority
  and the input to `createIsolatedWorkspaceFixture()`.

## Steps

1. [ ] **In progress:** Format/stage exactly the WP5v test/log/next plan,
       audit scope and protected identities, and create its local commit.
2. [ ] Reproduce the unchanged complete target-integration file from exact
       clean WP5v under genuine short TEMP; retain ERROR/no-receipt evidence.
3. [ ] In a second exact clone, add only promise `realpath` and a direct
       equality assertion beside `fixture()`'s root creator; retain direct red.
4. [ ] Canonicalize only that fresh fixture root, retain the assertion, and
       run the complete Windows file until all four cases pass with receipt.
5. [ ] Run the identical owner tree on Linux ext4 and audit bindings. Inspect
       the next historical failure only enough to classify ownership.
6. [ ] Update records, freeze/audit scope, commit WP5w narrowly, and hand the
       plan to the next causal owner.

## Acceptance Criteria

- WP5v has 5/5 zero-skip Windows and Linux evidence for its exact owner tree
  and commits only its test, log, and next plan.
- Exact clean WP5v reproduces retained WP5w 0/4, or records and replans around
  the actual outcome before mutation; red has ERROR manifest and no receipt.
- Assertion-only evidence fails at the root check before strict consumers.
  After correction, Windows and Linux both pass 4/4 with zero skips and valid
  independently matched receipts.
- Production/caller paths remain untouched; protected/immutable/lifecycle
  identities remain exact; one local commit is created and nothing is pushed.

## Verification

WP5v boundary:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/workspace-create-recovery.test.ts --fileParallelism=false`

WP5w focused command:

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/target-integration.test.ts --fileParallelism=false`

Retained WP5w roots use
`artifacts/manual/wp5w-target-integration-{red,owner-red,windows-green,linux-green}/`.
Shared checks are added only if a production/contract owner changes. Once all
intended Session 1 bytes freeze, run exactly once from isolated identical
clones: `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, with at most two heavy
aggregates overlapping. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Use a compact expanded Windows TEMP with a distinct 8.3 alias to stay inside
  Git-for-Windows' nested-ref path budget.
- If the root repair exposes a separately owned production path, retain a
  direct downstream red and replan before changing it.
- Recovery is ordinary revert of one narrow commit; no push/ref rewrite,
  lifecycle change, or broad cleanup.

## Progress and Evidence

- 2026-08-22: WP5v retained exact 0/5 baseline and assertion-only red, then
  passed 5/5 on Windows-short and Linux ext4 at tree `e9f37898...`.
- 2026-08-22: Historical stacks and current source identify
  `target-integration.test.ts::fixture()` as the next separate root owner. No
  WP5w code mutation has begun.

## Next Action

Format and stage only the WP5v test, log, and this plan; audit identities and
create the local WP5v commit.
