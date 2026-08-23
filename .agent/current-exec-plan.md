# Current Execution Plan

**Status:** WP5z contract-integrity exact reproduction
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

With the proved WP5y fixture-root correction committed, reproduce and repair
only the next historical Windows owner:
`tools/milestone-orchestrator/src/contract-integrity.test.ts::commissionedClone()`.
Use an exact clean WP5y clone under genuine NTFS 8.3 TEMP, retain a direct
assertion-only owner proof, canonicalize only its newly created parent, verify
the complete file on Windows and Linux ext4, and commit separately.

Do not alter contract-integrity meanings, expected corrupt-adapter exit
semantics, evidence-context validation, immutable authority, strict consumers,
caller/pre-existing paths, readiness/CAL-1 state, or later fixture owners. Do
not run source no-argument `pnpm verify`, push, or claim readiness.

## Goal Constraints

- Preserve immutable baseline/active hashes, readiness marker/default, CAL-1
  open/zero, protected file SHA
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  and required ignored residue.
- Use Node `24.18.0`, pnpm `11.15.1`, clean no-local/no-hardlink clones,
  compact distinct Windows short TEMP, Linux ext4, serial Vitest, and isolated
  writable roots.
- Change only `commissionedClone()`'s freshly created parent and retain a
  direct promise-realpath assertion before clone derivation. Contract code,
  verifier/invariant adapters, evidence context, and corruption inputs remain
  byte-identical unless a separate direct proof forces replanning.
- Keep one local commit per causal owner. Run broader Session 1 checks once
  only after all intended tracked bytes freeze.

## Baseline Evidence

- WP5y baseline/assertion trees are 0/6 ERROR/no receipt; corrected tree
  `74c712b5ac177e33e9578063909f0422272c8128` passes Windows and Linux ext4
  6/6 with valid bindings.
- WP5y commits from prior HEAD
  `b58184a5572f64f35a748871090544a9c0f26c42` / tree
  `d0bd256a6d98fcd1b2d9797f5ef06838df06131c`.
- Historical `contract-integrity.test.ts` at `1786995282986` is 1/2. Its
  corruption adapter exited 3 rather than the expected 1 because its evidence
  context retained the short derived clone root while evaluation observed the
  expanded identity. Current `commissionedClone()` owns the raw
  `contract-integrity-*` parent; current outcome is not yet assumed.

## Steps

1. [x] Prove WP5y baseline/owner/correction, pass Windows/Linux 6/6, audit
       identities, and commit its test/log/plan only.
2. [ ] **In progress:** Reproduce unchanged WP5z from an exact clean WP5y
       clone under short TEMP; retain ERROR/no receipt if current red remains.
3. [ ] Add only promise `realpath` and a direct parent equality assertion in a
       second clone; retain the assertion-localized red before clone setup.
4. [ ] Canonicalize only the fresh parent, retain the assertion, and pass the
       complete two-case Windows file with a valid receipt.
5. [ ] Pass the identical corrected tree on Linux ext4, audit bindings, and
       classify the next retained owner without changing it.
6. [ ] Record, audit, and commit WP5z narrowly; hand off the active plan.

## Acceptance Criteria

- WP5y commit contains only its fixture test, autonomy entry, and this handoff
  plan after exact Windows/Linux parity.
- WP5z baseline and assertion evidence accurately reflect current outcomes;
  failed runs retain ERROR/no receipt and the assertion proves the parent
  before any clone or contract adapter boundary.
- Corrected Windows and appropriate Linux parity pass with valid receipts.
  Production/contract consumers and caller paths stay unchanged; lifecycle,
  immutable, and protected identities remain exact; one local commit, no push.

## Verification

`pnpm exec tsx tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/contract-integrity.test.ts --fileParallelism=false`

Retain under
`artifacts/manual/wp5z-contract-integrity-{red,owner-red,windows-green,linux-green}/`.
After Session 1 bytes freeze, run exactly once from isolated identical clones:
`pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
`pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; at most two heavy
commands overlap. Never run source no-argument `pnpm verify`.

## Risks and Recovery

- Preserve the intentionally corrupt contract and expected exit-1 semantics;
  only path spelling before the adapter is in scope.
- Keep expanded TEMP compact enough for Git-for-Windows path budgets while
  proving a distinct 8.3 alias.
- A downstream production red requires separate proof and replan. Recovery is
  ordinary revert; no push/ref rewrite/lifecycle change/bulk edit.

## Progress and Evidence

- 2026-08-22: WP5y retained qualifying baseline/assertion 0/6 and passed the
  identical corrected tree 6/6 on Windows-short and Linux ext4.
- 2026-08-22: Historical/current source identify
  `contract-integrity.test.ts::commissionedClone()` next; WP5z is unmodified.

## Next Action

Construct an exact clean WP5y clone and reproduce the unchanged two-case WP5z
file under genuine short TEMP.
