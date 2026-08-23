# Current Execution Plan

**Status:** WP5ab Git-isolation workspace-root exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With WP5aa's proved retention-startup fixture correction committed, reproduce
and repair only the two historically failing workspace-creating roots in
`tools/milestone-orchestrator/src/git-isolation.test.ts`. Use exact clean WP5aa
clones, genuine NTFS 8.3 TEMP, direct assertion-only proof at the two causal
sites, minimal fresh-parent canonicalization, complete Windows 4-case
coverage, Linux ext4 parity, and one separate local commit.

Do not canonicalize the file's later two raw roots: they exercise direct Git
inspection, passed historically, and have no red proof. Do not alter strict Git
identity/integration, workspace creation, caller/pre-existing paths,
readiness/CAL-1 state, or later files. Do not run source no-argument
`pnpm verify`, push, or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only the first two test-owned parents immediately after `mkdtemp` and
  retain direct promise-realpath assertions before repository/Git/workspace
  setup. Leave the later two passing roots and every production path
  byte-identical absent separate proof.
- Keep one local commit per causal owner; broader Session 1 checks run exactly
  once after all intended tracked bytes freeze.

## Baseline Evidence

- WP5aa exact baseline/assertion are 0/1 ERROR/no receipt; corrected tree
  `719d6ebc6e564eb5d394945214efbafff5704553` passes Windows and Linux ext4
  1/1 with valid bindings.
- WP5aa commits from prior HEAD
  `7984d1ac9b9b41e2ad42a485d847245085ea26ee` / tree
  `8a71d2dcf7605a89c3bbff0a4e4eeee18cc8f5b3`.
- Historical `git-isolation.test.ts` at `1786995290362` is 2/4. Its first two
  cases derive `source` repositories from raw `milestone-loop-git-*` parents
  and fail strict workspace Git inspection. The later two cases use separate
  raw parents for direct inspection and pass; current outcome is not assumed.

## Steps

1. [x] Prove WP5aa baseline/owner/correction, pass Windows/Linux 1/1, audit
       identities, and commit its test/log/plan only.
2. [ ] **In progress:** Reproduce unchanged WP5ab from exact clean WP5aa under
       short TEMP; retain ERROR/no receipt if the current 2/4 red remains.
3. [ ] Add promise `realpath` plus direct parent assertions only at the first
       two workspace-creating sites in a second clone; retain two direct reds
       while confirming the later cases still pass.
4. [ ] Canonicalize only those two fresh parents, retain both assertions, and
       pass the complete Windows file 4/4 with a valid receipt.
5. [ ] Pass the identical corrected tree 4/4 on Linux ext4, audit bindings,
       and classify the next historical owner without changing it.
6. [ ] Record, audit, and commit WP5ab narrowly; hand off the active plan.

## Acceptance Criteria

- WP5aa commit contains only its retention-startup test, autonomy entry, and
  this handoff plan after exact Windows/Linux parity.
- WP5ab baseline and assertion evidence retain truthful counts and ERROR/no
  receipt. Only the two failing workspace roots receive assertions/repairs;
  the two already-passing direct-inspection roots remain byte-identical.
- Corrected Windows/Linux pass 4/4 with valid receipts. Production and caller
  paths stay unchanged; immutable/lifecycle/protected identities remain exact;
  one local commit, no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/git-isolation.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5ab-git-isolation-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Keep the two later raw parents untouched; their absence of failure is not
  permission for proactive canonicalization.
- Keep expanded TEMP compact while proving a distinct 8.3 alias.
- A downstream production red requires separate proof and replan. Recovery is
  ordinary revert; no push/ref rewrite/lifecycle change/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5aa retained baseline/assertion 0/1 and passed identical
  corrected tree 1/1 on Windows-short and Linux ext4.
- 2026-08-22: Historical/current source identify only the first two
  workspace-creating Git-isolation roots next; WP5ab is unmodified.

## Next Action

Construct an exact clean WP5aa clone and reproduce the unchanged four-case
WP5ab file under genuine short TEMP.
