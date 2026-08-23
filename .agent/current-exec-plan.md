# Current Execution Plan

**Status:** WP5af verification-clone fixture exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With WP5ae's artifact fixture finalized, reproduce and repair only
`tools/milestone-orchestrator/src/verification-clone.test.ts::repository()`'s
fresh source repository. Use an exact clean committed WP5ae clone, genuine
NTFS 8.3 TEMP, direct assertion-only proof, minimal helper-root
canonicalization, complete Windows 3-case coverage, Linux ext4 parity, and
one separate local commit.

Do not alter production disposable-clone creation, Git identity/cleanliness,
no-alternates/origin-free guarantees, symlink rejection, caller/pre-existing
paths, readiness/CAL-1 state, or broader verification commands. Do not run
source no-argument `pnpm verify`, push, or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only the test-owned helper's just-created repository root and retain
  a direct promise-realpath assertion before registration or Git setup.
  Production paths remain byte-identical unless a separate direct proof
  forces replanning.
- Keep one local commit per causal owner; broader Session 1 checks run exactly
  once after all intended tracked bytes freeze.

## Baseline Evidence

- WP5ae unchanged/assertion trees are 1/5 ERROR/no receipt; corrected tree
  `d377ae2cca1620fbd42293d606f81f8f44e9521d` passes the complete Windows
  and Linux ext4 owner file 5/5 with valid bindings.
- WP5ae started from WP5ad commit
  `b6aad15fb5d2f32471503092a2b5d375e9076a3b` / tree
  `0c30ff54851e12d824454a71e84472a58f8050ec`; its cohesive commit assigns
  the exact base for this plan.
- Historical `verification-clone.test.ts` at `1786995311714` is 1/3. The
  first two cases pass the raw shared `repository()` root to strict candidate
  inspection and fail. The third uses the same source creator but passes a
  derived junction to the ordinary-directory guard and historically passes.
  Current outcome is not assumed.

## Steps

1. [x] Prove WP5ae baseline/owner/correction, pass both complete platform
       files, audit identities, and prepare its test/log/plan-only commit.
2. [ ] **In progress:** From committed WP5ae, construct an exact clean clone
       and reproduce unchanged WP5af under genuine short TEMP; retain
       ERROR/no receipt if current 1/3 remains.
3. [ ] Add only promise `realpath` and a direct equality assertion immediately
       after the shared helper creates its root. Retain the assertion-localized
       red before registration/Git; because all three cases use the helper,
       the proof may intentionally localize the historically passing junction
       case too without changing its production behavior.
4. [ ] Canonicalize only the helper-created root, retain the assertion, and
       pass the complete Windows file 3/3 with the junction rejection intact
       and a valid receipt.
5. [ ] Pass the identical corrected tree 3/3 on Linux ext4, audit bindings,
       and classify the frozen-candidate verification handoff.
6. [ ] Record, audit, and commit WP5af narrowly; freeze all intended tracked
       Session 1 bytes before broader commands.

## Acceptance Criteria

- WP5ae commit contains only its artifact test, autonomy entry, and this
  handoff plan after exact Windows/Linux parity.
- WP5af baseline retains truthful counts and ERROR/no receipt; the assertion
  directly proves the shared helper root before registration or Git setup.
- Corrected Windows/Linux pass 3/3 with valid receipts. Production clone/Git
  and symlink consumers stay unchanged; immutable/lifecycle/protected
  identities remain exact; one local commit, no push.
- The next plan freezes tracked records before the six required broader
  commands and does not run source no-argument `pnpm verify`.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/verification-clone.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5af-verification-clone-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Preserve dirty-source, commit-mismatch, no-origin, no-alternates, cleanup,
  and linked-root rejection assertions; only the helper's producer-owned fresh
  spelling is in scope.
- The assertion-only proof can fail all three cases because the helper is
  shared; only the first two baseline failures cross stable candidate-root
  inspection. This distinction must remain explicit in evidence.
- A production red after helper canonicalization requires separate proof and
  replan. Recovery is ordinary revert; no push/ref rewrite/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5ae retained baseline/assertion 1/5 and passed the identical
  complete Windows-short and Linux ext4 files 5/5.
- 2026-08-22: Historical/current source identify shared `repository()` next;
  WP5af is unmodified.

## Next Action

Commit WP5ae, then construct an exact clean clone of that commit and reproduce
the unchanged three-case WP5af file under genuine short TEMP.
