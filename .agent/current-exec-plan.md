# Current Execution Plan

**Status:** WP5ae container-artifact fixture exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With WP5ad's deterministic fixture finalized, reproduce and repair only
`tools/milestone-orchestrator/src/container-artifacts.test.ts::root(prefix)`'s
fresh roots. Use an exact clean committed WP5ad clone, genuine NTFS 8.3 TEMP,
direct assertion-only proof, minimal helper-root canonicalization, complete
Windows 5-case coverage, Linux ext4 parity, and one separate local commit.

Do not alter artifact inventory/publication, link and containment guards,
quota enforcement, caller/pre-existing paths, readiness/CAL-1 state, or the
later verification-clone owner. Do not run source no-argument `pnpm verify`,
push, or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only the test-owned helper's just-created root and retain a direct
  promise-realpath assertion before registration or any artifact operation.
  Production paths remain byte-identical unless a separate direct proof
  forces replanning.
- Keep one local commit per causal owner; broader Session 1 checks run exactly
  once after all intended tracked bytes freeze.

## Baseline Evidence

- WP5ad unchanged and assertion-only trees are 0/2 ERROR/no receipt; corrected
  tree `7e75d91da01463701f7a7f5bd5025e0edc544581` passes the full Windows
  and Linux ext4 owner file 2/2 with valid bindings.
- WP5ad started from WP5ac commit
  `1836a5da5a3e0c287aa5b874bf4fa2c6fd299013` / tree
  `283c6f1155841cd71df3797eb3fb79bb58a0005a`; its cohesive commit assigns
  the exact base for this plan.
- Historical `container-artifacts.test.ts` at `1786995304153` is 1/5. The
  first four cases share raw `root(prefix)` fresh directories; the fifth
  combined-limit case creates no filesystem root and passed. Current outcome
  is not assumed.

## Steps

1. [x] Prove WP5ad baseline/owner/correction, pass both complete platform
       files, audit identities, and prepare its test/log/plan-only commit.
2. [ ] **In progress:** From the committed WP5ad state, construct an exact
       clean clone and reproduce unchanged WP5ae under genuine short TEMP;
       retain ERROR/no receipt if current 1/5 remains.
3. [ ] Add only promise `realpath` and a direct equality assertion inside
       `root(prefix)` in a second exact clone; retain assertion-localized red
       before root registration or artifact operations.
4. [ ] Canonicalize only the helper-created root, retain the assertion, and
       pass the complete Windows file 5/5 with a valid receipt.
5. [ ] Pass the identical corrected tree 5/5 on Linux ext4, audit bindings,
       and classify `verification-clone.test.ts` without changing it.
6. [ ] Record, audit, and commit WP5ae narrowly; hand off the active plan.

## Acceptance Criteria

- WP5ad commit contains only its deterministic test, autonomy entry, and this
  handoff plan after exact Windows/Linux parity.
- WP5ae baseline/assertion retain truthful counts and ERROR/no receipt; the
  assertion proves the helper root before registration or strict artifact
  consumers.
- Corrected Windows/Linux pass 5/5 with valid receipts. Artifact production,
  link/containment/quota consumers, and caller paths stay unchanged;
  immutable/lifecycle/protected identities remain exact; one local commit,
  no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/container-artifacts.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5ae-container-artifacts-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Preserve symbolic-link, junction, hard-link, destination-parent,
  containment, and independent/combined quota assertions; only the helper's
  producer-owned fresh spelling is in scope.
- Keep expanded TEMP compact while proving a distinct 8.3 alias.
- A production red after helper canonicalization requires separate proof and
  replan. Recovery is ordinary revert; no push/ref rewrite/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5ad retained baseline/assertion 0/2 and passed the identical
  complete Windows-short and Linux ext4 files 2/2.
- 2026-08-22: Historical/current source identify `root(prefix)` next; WP5ae
  is unmodified.

## Next Action

Commit WP5ad, then construct an exact clean clone of that commit and reproduce
the unchanged five-case WP5ae file under genuine short TEMP.
