# Current Execution Plan

**Status:** WP4c implementation complete; frozen verification in progress
**Updated:** 2026-08-15
**Owner:** autonomous loop

## Objective

Implement one bounded WP4c increment that makes the already-placed
`examples/ski-tycoon/` configuration an explicit, self-validating historical
worked-example package while keeping it outside active source commissioning.

Add a versioned descriptor and deterministic read-only validation command that
prove the complete example file set, exact byte/hash identities, historical
provenance dispositions, strict schemas, cross-file registry links, protected
coverage, and legacy-only/no-fallback semantics. Correct the stale example and
adoption documentation and remove the remaining D-032 identity from the active
slow-suite registry. Do not move or rewrite the six example JSON payloads.

This is historical packaging and active-configuration hygiene, not product
feature work, fresh-adopter bootstrap completion, or autonomous readiness.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, and
  `.agent/readiness-profile-activated.json` byte-for-byte. CAL-1 remains open
  and all active immutable hashes remain equal to their baselines.
- Preserve `.agent/completed/loop-recommissioning-verification.json`,
  `.agent/verification-manifest.json`, and
  `tools/milestone-orchestrator/config/source-commissioning-input.json`
  byte-for-byte. Active v2 loading remains strict and historical v1 loading
  remains available only through explicit benchmark, reconciliation, or
  worked-example contexts; there is no implicit fallback.
- Preserve the six current JSON payloads under `examples/ski-tycoon/`
  byte-for-byte. Their D-031/D-032 and Ski Tycoon identities are intentional
  historical/example data, never generic active configuration.
- Preserve literal no-argument `pnpm verify`, package-default profile
  selection, bootstrap's non-readiness meaning, `exact-readiness`, tier-result
  schema `1.2.0`, combined manifest/result schema `2.0.0`, generic active
  invariant/scope IDs, and current reconciliation/provider/supervision rules.
- Do not implement product-domain placeholders, change verifier deadlines or
  verification partitioning, modify container/runtime owners, run the real OCI
  matrix, push, or claim readiness.
- The remaining source-plan acceptance that a fresh adopter reaches a truthful
  bootstrap PASS is a separate WP4d increment. WP4c may retain and extend the
  commissioning fixture boundary but may not fabricate a bootstrap PASS.
- Never edit, stage, move, hide, delete, or re-encode the user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.
- Use pinned Node `24.18.0` and pnpm `11.15.1`. Run focused, aggregate, and
  static commands serially.

## Baseline Evidence

- Entry identity is `HEAD`
  `345591818b220964618dc4e80cce3c0e0213783c`, tree
  `d63a88e749dbfe64c1cbc86310c43b8b70054d76`, on `master`, two commits
  ahead of `origin/master`. The tracked/staged tree is clean and the only
  untracked path is the protected human plan.
- The protected human plan is 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered canonical blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- WP4b is committed and its retained receipts/artifacts were inspected without
  rerunning commands. The two focused shards passed 88/88 and 34/34; the
  orchestrator aggregate passed 488 with two POSIX-only skips out of 490; the
  unit aggregate passed 501 with the same two skips out of 503; safety,
  typecheck, lint, format, and diff checks passed. The sole post-commit
  no-argument verifier honestly failed on the protected untracked file,
  project placeholders, and the unchanged 900,000 ms `unit-domain` deadline;
  contract integrity passed and completion was ineligible.
- The active manifest is strict v2 at 7,124 bytes / SHA-256
  `f765765d8082280282151253e616f87a460dbe8c38f17909aa22d7dcb7930dd9`;
  its 6,561-byte source input has SHA-256
  `59f053d0b4ed195e2fda8746f8ee018ea3c97706c07f53a37908c40ef41b8629`.
  Neither contains D-031/D-032 or Ski Tycoon identity.
- The immutable lock is 1,363 bytes / SHA-256
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`;
  the readiness marker is 238 bytes / SHA-256
  `2d5d6628e31343dcfde01b4cadd1ff0891eb2abd3197e3018bc766d104077dc2`;
  the retained source v1 manifest is 6,661 bytes / SHA-256
  `c8a5923ef90a20a6aa460b26d9ee741cb8633aa81e5b4d6613478830413c1cea`.
- WP4 source requirements place the Ski Tycoon manifest, benchmark, and policy
  under `examples/ski-tycoon/`, require it to validate as an example rather
  than active runtime, and prohibit implicit legacy fallback. The directory
  already exists, so a move is not justified.
- The directory currently has seven files. Its README incorrectly says the
  template loads none of them, calls `default.json` schema `1.3.0` although it
  is `1.6.0`, and calls all remaining files verbatim although the manifest and
  invariant registry received mandatory-receipt compatibility updates after
  extraction. Only the legacy manifest has an explicit example loader test;
  no command validates the package as a coherent whole.
- Current example JSON identities to preserve are:
  - `benchmark-matrix.json`: 2,927 bytes / SHA-256
    `3995b8ac18054967f2d08d4a677f7af152cc74abd8dd5246f64ed3c26c9ce8ec`;
  - `default.json`: 3,391 bytes / SHA-256
    `9d01d1316a8a44c2156be362407e5483dcab893712b031eccf364b0c54f2213e`;
  - `invariant-suite.json`: 4,476 bytes / SHA-256
    `ef40b3a7c2aadd22c17c5b739c4c9720decb6ab1ce8922e1334669e4ccc404e7`;
  - `loop-recommissioning-verification.json`: 7,013 bytes / SHA-256
    `8768b979632ed47df34de8683cb0003067e8558ed2bd34753066616f482fca40`;
  - `slow-suite-registry.json`: 463 bytes / SHA-256
    `625400e4797c141a2954c4a82727909e9df25c29d6c3890a33675ec52f34876b`;
  - `verification-scope-policy.json`: 5,802 bytes / SHA-256
    `cd0a37a2b309303f75a187975139a5c62b64212d7a4bca2ccc4e26d00000847e`.
- The only D-031/D-032 identity in active configuration is
  `d032-explicit-migration-suites.v1` in the root slow-suite registry. Its
  schema accepts generic IDs and no manifest or runtime contract requires that
  literal, so rename it to a source-independent ID while retaining the Ski
  example's historical ID.

### Affected-test Matrix

| Production owner changed | Focused acceptance coverage | Broader regression surface | Required evidence |
| --- | --- | --- | --- |
| Worked-example descriptor/parser, contained tracked-file reader, hash inventory, schema and cross-link validator | new `worked-example.test.ts`: canonical package; traversal/symlink/untracked/duplicate/missing/extra files; byte/hash drift; malformed descriptor/JSON/schema; broken manifest-registry/check/protected links; deterministic output | `test:orchestrator`, `test:unit`, typecheck/lint/format | exact report path/bytes/SHA for all six payloads; explicit legacy-only and no-fallback disposition |
| Explicit validation CLI and package route | CLI parsing rejects missing/duplicate/unknown/escaping input; command validates only an explicitly supplied descriptor and reports every file | aggregates and package/config tests | direct pinned command succeeds; no default active loader or v1 fallback is introduced |
| Active slow-suite identity and example isolation | invariant/config/schema/manifest/protected tests; active-boundary regression scans active manifest/input/config registries for D-031/D-032/Ski identity while permitting explicit historical/example paths | both aggregates | active slow registry has generic ID; all six example JSON hashes and retained source identities remain exact |
| README, contract, config docs, example provenance labels, plan/logs | documentation/path/script consistency assertions plus diff checks | static checks | no claim that adapted files are verbatim; no claim of bootstrap PASS or readiness |

## Steps

1. [x] Confirm handoff Git/tree/divergence/status, protected identities, recent
       commits, WP4b retained evidence, frozen lock/marker state, WP4 source
       requirements, example placement/history/hashes, active and historical
       loader boundaries, docs, tests, and residual active identity leakage.
       Replace the stale WP4b plan with this bounded WP4c plan before source
       implementation.
2. [x] Define a strict `worked-example.v1` descriptor and read-only
       loader. Require a contained regular tracked descriptor and exact
       descriptor-relative file set; exact bytes/SHA-256; explicit provenance
       disposition per payload; strict schemas; manifest/invariant/benchmark,
       scope/check-catalogue, and protected-path coherence; and literal
       historical-legacy-only/non-active/no-implicit-fallback declarations.
3. [x] Add an explicit CLI/package route requiring the descriptor path. Emit a
       deterministic validation result containing the descriptor and every
       payload path, role, provenance, byte count, and SHA-256. It must never
       commission, rewrite, migrate, or execute the example.
4. [x] Add exhaustive temporary-directory and repository-boundary tests plus a
       source-boundary regression. Preserve all six example JSON bytes. Rename
       only the root active slow-suite registry ID to
       `milestone-loop-explicit-migration-suites.v1` and make the benchmark
       template ID an adopter placeholder if its current D-032 default remains
       presented as reusable input.
5. [x] Update the example README, root README, `CONTRACT.md`, config docs,
       decision log, autonomy log, and this plan. Accurately distinguish the
       three unchanged source-snapshot payloads from the three maintained
       compatibility adapters and explain that explicit validation is not an
       active runtime load or readiness evidence.
6. [x] Run focused diagnostics while interfaces stabilize. Freeze source,
       tests, descriptor, docs, plan, and logs before receipt-owning gates.
7. [in progress] Execute the final serial command budget. Independently validate every
       receipt/artifact SHA/byte count, suite/test count, skip, duration,
       candidate identity, immutable/marker/active/historical/example/human
       identity, and five slowest tests. Repair only through focused
       reproduction and rerun only invalidated evidence.
8. [ ] Commit the cohesive verified WP4c tree without pushing. From the final
       commit, run literal no-argument `pnpm verify` exactly once and report its
       honest result without changing deadlines, hiding the protected human
       file, weakening success criteria, or claiming readiness.

## Acceptance Criteria

- The existing Ski Tycoon directory remains in place and all six JSON payloads
  retain their entry byte counts and SHA-256 values.
- One strict versioned descriptor enumerates exactly those payloads, pins their
  hashes/bytes/roles, records source commit
  `8928aecc19e8d3ade663063e0ed41740483774e3`, distinguishes unchanged source
  snapshots from maintained compatibility adapters, and declares the package
  historical, legacy-only, inactive, and never an implicit fallback.
- The explicit validation command fails closed for unsafe/untracked/linked or
  unexpected paths, malformed/duplicate descriptors, file drift, invalid JSON
  or schema, cross-file ID/check-catalogue/protected-path mismatch, or weakened
  legacy disposition. Equal bytes produce equal output.
- Successful validation reports every payload with exact path, role,
  provenance, bytes, and SHA-256. It does not mutate Git, config, authority,
  manifests, or the example.
- Active source config, active manifest, source commissioning input, and
  package-default verification remain independent of Ski Tycoon and D-031/
  D-032 identity. The root slow-suite registry uses a generic ID; historical
  source benchmark/reconciliation and Ski example records retain their legacy
  identities only in explicit contexts.
- `.agent/completed/loop-recommissioning-verification.json`, the active v2
  manifest/input, frozen authority/lock, readiness marker/history, exact
  command, profiles, schemas, protected floor, provider, recovery,
  reconciliation, and supervision behavior are unchanged.
- Documentation no longer claims all payloads are verbatim or that nothing can
  explicitly validate them; it clearly distinguishes validation from runtime
  loading, commissioning, execution, bootstrap PASS, and readiness.
- Focused receipt evidence, both applicable aggregates, typecheck, lint,
  format, and both diff checks pass. The final committed no-argument verifier
  result is reported honestly and is not presented as readiness.

## Verification

All commands prepend `.tools/node-v24.18.0-win-x64` to `PATH`, verify Node
`24.18.0` and pnpm `11.15.1`, use unique ignored artifact directories, and run
serially.

Implementation diagnostics:

1. Direct `pnpm exec vitest run` on only `worked-example.test.ts` until its
   contract stabilizes.
2. One direct affected-files diagnostic covering worked-example, config,
   invariant-suite, manifest, schema, protected-root, and commissioning tests.
3. Direct explicit example-validation command and read-only identity audits.

Final frozen-tree command budget:

1. One receipt-owning `invariant-vitest` shard for the exact affected test
   files with `--fileParallelism=false`.
2. One `pnpm test:orchestrator`, followed by one `pnpm test:unit`; never overlap
   them with each other or any focused command.
3. One each of `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, with
   their command-owned receipts.
4. No OCI matrix: no container/executor/provider owner changes. No safety demo:
   the canonical protected catalogue and enforcement algorithm do not change.
5. `git diff --check`, `git diff --cached --check`, staged-path review,
   explicit validator output audit, and independent receipt/report validation
   including the five slowest tests and all protected/example identities.
6. Commit once. Then literal no-argument `pnpm verify` exactly once from the
   final commit. Its default profile remains readiness; known unrelated
   placeholder, dirty-tree, provider, or deadline failures remain honest.

Evidence invalidation:

- Any worked-example production/schema/CLI/config change invalidates the
  focused shard, both aggregates, and typecheck/lint/format.
- A test-only repair invalidates its focused shard and affected aggregate.
- Docs/plan/log-only edits after semantic evidence require diff/static
  reinspection; all tracked content freezes before broad commands.
- The commit changes commit identity but not tree identity. Frozen-tree
  receipts support WP4c; the sole post-commit verifier owns the committed
  candidate identity.

## Risks and Recovery

- Rewriting or moving historical JSON would blur provenance and break retained
  links. Keep the six payloads unchanged; add a sibling descriptor and update
  only explanatory documentation. Recovery is ordinary reversal of the WP4c
  commit.
- Hashes can become platform-dependent if line endings drift. The repository's
  `.gitattributes` enforces LF; validation hashes raw checked-out bytes and
  tests prove the recorded counts/hashes on the supported runtime.
- A generic example loader could become an implicit v1 fallback. Require an
  explicit descriptor argument, keep active `loadVerificationManifest`
  unchanged, and test that active paths never consult the example.
- Importing historical benchmark validation must not execute it or require its
  unavailable commits. Validate only the static matrix schema and cross-links;
  do not run the real benchmark or reinterpret it as source evidence.
- A descriptor could falsely call adapted files verbatim. Pin explicit
  per-file provenance dispositions and document the post-extraction receipt,
  protected-root, supervision, and provider compatibility updates.
- No external mutation, history rewrite, remote push, runtime installation,
  destructive cleanup, or protected human-file handling is required.

## Progress and Evidence

- 2026-08-15: Confirmed the exact WP4b commit/tree/divergence/status and all
  protected human-file identities. Read the frozen goal, plan standard, latest
  logs/decision, WP4 source section, active/historical manifest/config/code
  boundaries, package/docs/tests, example Git history and hashes, retained
  WP4b receipts, and honest verifier result without rerunning any broad suite.
  Determined that placement is already correct, a move is unjustified, the
  missing coherent validation/provenance boundary is the smallest WP4c slice,
  and truthful fresh-adopter bootstrap PASS remains a later WP4 increment.
- 2026-08-15: Added the strict descriptor, read-only validator, explicit CLI
  and package route, public export, nine focused cases, generic active
  slow-suite identity, adopter-owned benchmark-template placeholder, and
  accurate example/adoption/contract/config documentation. The six historical
  JSON payload hashes remain exact. The new file passed 9/9; the seven-file
  affected diagnostic passed 66/66; direct TypeScript and new-file lint passed.
  The explicit command reported the 2,948-byte descriptor at SHA-256
  `e4f3c1496603ae5dbd3189f02177cd5e200693cf42ff5a8f6e683712920faa70`
  and all seven package files deterministically without mutation. Source,
  tests, descriptor, docs, plan, and logs now freeze for final receipt gates.

## Next Action

Run the one receipt-owning affected-test shard, then the serial orchestrator and
unit aggregates and receipt-owning static gates. Audit all evidence and frozen
identities, stage only WP4c paths, commit once without pushing, and run the sole
post-commit no-argument verifier honestly.
