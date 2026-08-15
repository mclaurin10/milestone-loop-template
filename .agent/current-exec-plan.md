# Current Execution Plan

**Status:** WP4b implementation complete; frozen verification pending
**Updated:** 2026-08-15
**Owner:** autonomous loop

## Objective

Implement one bounded WP4b increment: add a deterministic, fail-closed
`pnpm loop:commission -- --input <file>` workflow and use that workflow to
publish this repository's active `.agent/verification-manifest.json`.

The workflow will bind the active manifest to the real target branch, a strict
ancestor commissioning base, the package-default `bootstrap` or `readiness`
profile, the immutable authority lock, the current generic invariant/scope
registries, the canonical protected floor, the focused command catalogue, and
the generic exact/reconciliation policies. It will stage and validate complete
bytes before one no-clobber atomic publication and will report every generated
path, byte count, and SHA-256.

This is a commissioning/lifecycle increment, not product feature work and not
an autonomous-readiness claim.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, and
  `.agent/readiness-profile-activated.json` byte-for-byte. Commissioning may
  validate them but may not regenerate or amend source authority.
- Preserve `.agent/completed/loop-recommissioning-verification.json` and the
  Ski Tycoon worked example byte-for-byte. Historical v1 access remains closed
  to the explicit benchmark/reconciliation/example contexts.
- Preserve exact verification as literal no-argument `pnpm verify`, the stable
  `exact-readiness` check id, tier-result wire schema `1.2.0`, combined
  manifest/result JSON Schema `2.0.0`, and bootstrap's non-readiness meaning.
- Preserve WP3 recovery, provider, supervision, OCI, receipt, integration, and
  reconciliation semantics. No container/executor/provider/process deadline
  owner changes are planned, so no real OCI matrix is in scope.
- Do not replace adopting-project placeholders, change verifier deadlines or
  verification partitions, move/rewrite the Ski Tycoon example, push, or claim
  readiness.
- Never edit, stage, move, hide, delete, or re-encode the user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.
- Real commissioning requires an entirely clean tracked and untracked tree.
  Because the protected human file intentionally makes the source checkout
  unclean, generate the source manifest through the workflow in a clean
  temporary clone of the exact staged candidate, then bring back only the
  deterministic generated manifest bytes with `apply_patch`.
- Use pinned Node `24.18.0` and pnpm `11.15.1`. Run all focused, aggregate,
  reconciliation, supervision, and static commands serially.

## Baseline Evidence

- Entry identity is `HEAD` `0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5`,
  tree `51421b18f8c4e3deae2e925945101bca3aa94879`, on `master`, one
  commit ahead of `origin/master`; the tracked/staged tree is clean and the
  only untracked path is the protected human plan.
- The human plan is 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and canonical
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- WP4a is committed and the source intentionally has no active manifest.
  Active v2 loading is strict; v1 loading requires explicit historical
  context; both active and retained source paths are protected while present.
- `package.json` selects `readiness`; the permanent readiness marker is valid,
  present, and has remained in history since
  `0cc21776b3b31f58893675f225badea14651a9b0`.
- `tools/milestone-orchestrator/config/default.json` incorrectly names
  `main` while the actual target is `master`. The active invariant and scope
  IDs are still `d032-core-invariants.v1` and
  `d032-shadow-scope-policy.v1`; they must become generic before the active
  manifest is commissioned. Historical benchmark IDs and records remain
  legacy inputs.
- The immutable lock is schema `1.0.0`, CAL-1 is open/not started, every
  baseline equals its active hash, every governed file matches, and the lock's
  SHA-256 is the verifier-anchored
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`.
- The retained WP4a focused receipts, aggregates, static receipts, safety
  report, and honest non-passing readiness result were inspected at the paths
  named in the handoff. They are orientation evidence only and will not be
  reused for WP4b's changed tree. No broad suite or verifier was rerun during
  orientation.

### Affected-test Matrix

| Production owner changed                                                                                                                  | Focused acceptance coverage                                                                                                                                                                                                                                                                      | Broader regression surface                              | Required evidence                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commissioning input parser, Git/branch/base/profile/marker inspection, authority/lock validation, and deterministic manifest construction | new `commissioning.test.ts`: valid readiness and fresh bootstrap fixtures; dirty tracked/untracked; existing manifest; missing/non-ancestor base; wrong/detached branch; unsupported/mismatched profile; incompatible marker history; malformed authority/lock/anchor; deterministic twin clones | `test:orchestrator`, `test:unit`, typecheck/lint/format | receipt-owned focused report; generated bytes/hash comparison; no D-031/D-032 fixture identity                                                              |
| Staged temporary output, partial-write cleanup, no-clobber publication, post-publication doctor, and CLI output                           | `commissioning.test.ts`: partial stage write, pre-publish drift, existing destination, post-validation rollback, exact printed path/bytes/SHA                                                                                                                                                    | aggregates plus doctor/config tests                     | no active file or temp residue after every injected fault; successful publication identity independently recomputed                                         |
| Manifest target-branch binding, generic registry IDs, protected coverage, source all-tier construction                                    | `verification-manifest.test.ts`, `schema.test.ts`, `config.test.ts`, `verification-tier.test.ts`, `doctor.test.ts`, `protected-roots.test.ts`                                                                                                                                                    | both aggregates and safety demo                         | source manifest loads; all four plans build from active v2 with historical path absent from the fixture; combined schema remains 2.0.0/result remains 1.2.0 |
| Closed historical adapter after active registry rename                                                                                    | `benchmark.test.ts`, `reconciliation.test.ts`, `verification-cli.test.ts`, `orchestrator-cleanup.test.ts`                                                                                                                                                                                        | both aggregates                                         | source benchmark/reconciliation remain explicit legacy; no implicit v1 fallback; recovery/provider/supervision cases unchanged                              |
| Source command/config/input/docs/log/schema and immutable/protected identities                                                            | parseable JSON/schema checks, CLI invocation in clean clone, `git diff --check`, `git diff --cached --check`                                                                                                                                                                                     | static receipts and final exact verifier                | generated manifest provenance/result; receipt/artifact hash/count/duration audit; protected file identities unchanged                                       |

## Steps

1. [x] Read the frozen goal, agent contract, plan standard, WP4 source plan,
       committed WP4a plan/log/decision, retained evidence, Git identities,
       package profile, immutable lock, readiness-marker history, active and
       historical manifest paths, config/registry facts, doctor/CLI routing,
       tier construction, fixtures, and historical consumers. Replace the
       stale WP4a plan with this bounded WP4b plan before production edits.
2. [x] Define a strict commissioning-input contract and shared
       read-only inspection: clean Git status including untracked files, exact
       current/target branch, strict ancestor base, deterministic Git-derived
       timestamp, package profile, one-way readiness history, authority files,
       immutable-lock lifecycle/hash/verifier anchor, registry/catalogue,
       protected coverage, exact policy, and reconciliation minimum.
3. [x] Implement deterministic generation and publication. Construct fixed-
       order v2 bytes, validate staged bytes and four tier plans, recheck Git
       identity/status, publish the absent active path atomically without
       clobber, validate the published file through the normal loader and a
       commissioning doctor, roll back only the newly published inode on a
       post-publication failure, clean owned temporary output, and print the
       generated path/bytes/SHA-256.
4. [x] Add standalone CLI routing and the `loop:commission` package command.
       Add deterministic fault hooks/dependencies only at owned boundaries and
       exhaustive temporary-Git-repository tests from the matrix, including a
       genuinely fresh bootstrap adopter whose manifest and evidence are not
       readiness-equivalent and contain no source-project IDs.
5. [x] Correct the source target branch to `master`, migrate only the active
       invariant/scope IDs to generic identities, bind the historical adapter
       explicitly to the current registry/target configuration, and add the
       tracked source commissioning input using WP4a `HEAD` as its strict
       ancestor base. Keep all historical bytes and identities unchanged.
6. [x] Run focused diagnostics only. Once interfaces stabilize, stage only
       WP4b paths, apply the staged diff in a clean temporary clone on `master`,
       commit that disposable candidate, run `pnpm loop:commission -- --input
 <tracked input>`, independently verify its output, and add the identical
       generated manifest bytes to the source candidate. Preserve the protected
       untracked human file throughout; the fresh-repository fault suite proves
       that any untracked path makes real commissioning fail closed.
7. [x] Update `README.md`, `CONTRACT.md`, config documentation, decision log,
       autonomy log, schema artifacts, and this plan. Freeze source, tests,
       generated manifest/input, docs, and logs before receipt-owning gates.
8. [in progress] Execute the final serial command budget. Independently validate every
   receipt/artifact SHA/byte count, suite/test count, skip, duration,
   candidate identity, immutable hash, protected-file identity, and five
   slowest tests. Repair only through a focused reproduction and rerun only
   invalidated evidence.
9. [ ] Commit the cohesive verified WP4b tree without pushing. From the clean
       committed tracked tree, with the protected human file still untracked,
       run literal no-argument `pnpm verify` exactly once and report its honest
       readiness result without changing placeholders, authority, deadlines,
       or success criteria.

## Acceptance Criteria

- `pnpm loop:commission -- --input <file>` is strict, deterministic for equal
  input/Git identity, and reports every generated path with exact bytes and
  SHA-256.
- The command rejects any tracked or untracked dirt, an existing active
  manifest, missing/non-commit/non-ancestor/equal bases, wrong or detached
  branches, unsupported or package-mismatched profiles, invalid one-way marker
  history, invalid authority/lock/anchor data, registry/catalogue drift, unsafe
  or uncovered paths, and weakened exact/reconciliation policies.
- Partial stage writes, pre-publication drift/races, publication conflicts, and
  post-publication validation faults leave no partial active manifest and no
  owned temporary residue. The destination is never overwritten.
- Creation time is derived canonically from the commissioning base's real Git
  commit time; no wall clock enters generated bytes.
- A fresh clean bootstrap Git fixture commissions with its own explicit
  authority/lock/config/input and no D-031, D-032, Ski Tycoon, or source-project
  identity. Its profile remains bootstrap and cannot satisfy readiness or
  reconciliation completion.
- Source configuration names target `master`; the active invariant/scope IDs
  are generic; `.agent/verification-manifest.json` is produced by the workflow
  with real target/base/readiness profile, current registry IDs, canonical
  protected paths, current focused catalogue, and generic exact/reconciliation
  policy. Its serialized bytes contain no D-031/D-032 identity.
- Iteration, candidate, milestone, and periodic source plans construct from the
  active v2 manifest without reading a historical manifest. Exact closure is
  still no-argument package-default `pnpm verify`; bootstrap remains
  non-readiness-equivalent.
- Historical benchmark and source reconciliation remain explicit v1 legacy
  paths and pass after the active registry rename. The retained source and Ski
  manifests are byte-identical to entry.
- Frozen authority, lock lifecycle, readiness-marker bytes/history, result
  schema `1.2.0`, combined schema `2.0.0`, provider identity, protected-root
  behavior, recovery, reconciliation, and supervision are not weakened.
- Focused receipts, safety demo, both applicable aggregates, typecheck, lint,
  format, and both diff checks pass. The final committed no-argument verifier
  result is reported honestly and is not presented as readiness.

## Verification

All commands prepend `.tools/node-v24.18.0-win-x64` to `PATH`, verify Node
`24.18.0` and pnpm `11.15.1`, use unique ignored artifact directories, and run
serially.

Final frozen-tree command budget:

1. At most two receipt-owning `invariant-vitest` shards via
   `node tools/run-tool-evidence.mjs invariant-vitest ...
--fileParallelism=false`:
   - commissioning/config/schema/manifest/tier/doctor/protected/CLI tests;
   - historical benchmark/reconciliation/orchestrator-cleanup tests.
2. One `pnpm loop:demo-safety` run because the literal protected catalogue and
   active commissioning path change. No OCI matrix and no standalone process-
   supervision suite unless a focused failure proves that owner changed.
3. One `pnpm test:orchestrator`, followed by one `pnpm test:unit`; never overlap
   either with each other or any focused/reconciliation command.
4. One each of `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, with
   their command-owned receipts.
5. `git diff --check`, `git diff --cached --check`, staged-path review, source
   commissioning output audit, immutable/marker/historical/human-file hash
   audit, and independent receipt/report validation including the five slowest
   tests.
6. Commit once. Then literal no-argument `pnpm verify` exactly once from the
   final commit. Its default profile remains readiness; any unrelated product
   placeholder or infrastructure failure remains non-passing and honest.

Evidence invalidation:

- Any production/type/schema/config/manifest change invalidates both focused
  shards, both aggregates, and all static receipts touching that surface.
- A test-only repair invalidates its focused shard and affected aggregate.
- Docs/plan/log-only edits after semantic evidence require diff/static
  reinspection; all tracked content freezes before broad commands.
- The commit changes commit identity but not tree identity. Frozen-tree receipts
  support the implementation increment; the sole post-commit verifier owns the
  committed candidate identity.

## Risks and Recovery

- Multi-file publication would make rollback ambiguous. WP4b therefore
  validates existing source authority/config and publishes only the absent
  active manifest; target/registry corrections are ordinary reviewed source
  edits made before commissioning. One no-clobber link/rename boundary is the
  only publication commit point.
- Adding target-branch identity to strict v2 could break the historical adapter.
  Require it for active v2, inject the current configured branch and registry
  IDs only inside the closed historical reconciliation adapter, and retain all
  v1 bytes.
- A permissive clean-tree exception for the protected human file would violate
  the requested contract. Use a clean temporary clone; direct source execution
  must fail and must not touch the file.
- A lock validator could accidentally authorize regeneration. WP4b accepts only
  existing source bytes whose actual governed hashes, lifecycle, explicit
  commissioning-input lock hash, and verifier anchor all agree. It never writes
  source authority or lock data.
- Publication cleanup must never remove a pre-existing file. Refuse the active
  path before staging, publish no-clobber, record the published file identity,
  and roll back only that exact newly created output if strict post-validation
  fails.
- Recovery is normal source-control reversal of this cohesive commit. No remote
  mutation, history rewrite, external service, OCI runtime change, or protected
  authority mutation is required.

## Progress and Evidence

- 2026-08-15: Confirmed exact WP4a handoff identities/divergence/status and all
  four protected human-file identities. Read the frozen goal, plan standard,
  newest logs/decision, WP4 source section, package/config/registry/lock/marker
  state, generic/historical manifest implementations, doctor/CLI/tier paths,
  fixtures, JSON Schema, and retained WP4a evidence without rerunning broad
  verification. Identified `main`/`master` drift and active D-032 registry IDs
  as required WP4b corrections. Replaced the committed WP4a pending wording
  with this bounded executable plan before production work.
- 2026-08-15: Implemented the strict input, read-only preflight, deterministic
  construction, one-file staged/no-clobber publication, exact rollback,
  post-generation commissioning doctor, standalone CLI, package command, and
  temporary-Git fixtures. Commissioning diagnostics passed 13/13; the six
  directly affected manifest/config/schema/tier/doctor/protected files passed
  66/66; the pinned tools TypeScript diagnostic passed.
- 2026-08-15: Corrected the source target to `master`, renamed only the active
  registries to generic identities, and retained the closed historical adapter.
  The workflow ran in a clean clone of the exact staged candidate and produced
  the source manifest at 7,124 bytes / SHA-256
  `f765765d8082280282151253e616f87a460dbe8c38f17909aa22d7dcb7930dd9`
  from the 6,561-byte input / SHA-256
  `59f053d0b4ed195e2fda8746f8ee018ea3c97706c07f53a37908c40ef41b8629`.
  The read-only commissioning doctor passed all four plans; active bytes contain
  no D-031/D-032 or Ski identity. Source, tests, schema, generated artifacts,
  plan, logs, and docs now freeze for the final serial command budget.

## Next Action

Implement the strict commissioning input/inspection and deterministic manifest
builder with temporary-Git-fixture tests. Run only the new focused test file
until that boundary is stable; do not run aggregates, the safety demo, or the
full verifier during implementation.
