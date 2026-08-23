# Current Execution Plan

**Status:** WP5 recommended Session 2 replacement-candidate freeze
**Updated:** 2026-08-22
**Owner:** autonomous loop

## Objective

Complete WP5 recommended Session 2 as two cohesive increments: make the
fresh-adopter CI smoke execute and independently audit every documented
quickstart command through one generated-repository no-argument bootstrap
verification, then replace all nine JavaScript-action references with current
official Node 24-compatible stable releases pinned by immutable full commit
SHA. Freeze one final candidate, run the real Windows adopter journey once,
and run the six broader source checks once from isolated exact clones.

Do not run source no-argument `pnpm verify`, invoke `loop:template:prove`, run
the real Docker matrix, trigger or dispatch hosted CI, push, implement POSIX
supervision, start CAL-1, add product/readiness scope, enter hidden validation,
or begin WP6 deduplication. The final hosted matrix belongs to Session 3.

## Goal Constraints

- Preserve Node `24.18.0`, pnpm `11.15.1`, readiness default and permanent
  marker, CAL-1 open/not started, and every immutable baseline/active hash.
- Preserve protected untracked
  `Implementation-ready improvement plan 8-5-26.txt` at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  plus `.tools/corepack-home-readonly-probe` and
  `.tools/wp5r-corepack-probe`.
- Generated-adopter verification must run from its clean three-commit
  bootstrap history, never the readiness source checkout, and must remain
  explicitly distinct from autonomous readiness.
- Reuse the independent `auditBootstrapVerification` owner from
  `adopter-package-proof.ts`; do not introduce a second weaker receipt or
  artifact audit.
- Keep workflow permissions read-only, full history checkout,
  `persist-credentials: false`, exact application runtime pins, independent
  adopter/container scheduling, platform coverage, unique evidence roots,
  unconditional uploads, and full-SHA action pinning.

## Baseline Evidence

- Fresh fetch confirms `HEAD == origin/master ==`
  `dbf70e9b730f4e44f81862e159e127c252f64fd6`, tree
  `266f9b23432bd297cc027395b490db9ad82f39c4`, divergence `0/0`.
- The only nonignored entry is the protected human plan with its expected
  hash. Required ignored probes are present. Source default is `readiness`,
  its marker is present, and immutable lock baseline/active hashes match with
  CAL-1 `open_not_started` / count zero.
- Session 1 retained audit
  `artifacts/manual/wp5ag-session1-final-audit/audit-result.json` reports all
  six qualifying commands passing with valid receipts on this tree. Its
  historical pre-push `originMaster` field is intentionally unchanged.
- Latest public Exact runtime CI run `32616522784` completed successfully on
  this exact commit: controller Linux/Windows, adopter Linux/Windows, and real
  trusted-container jobs all passed. This is starting-state evidence only.
- Current adopter smoke schema `fresh-adopter-ci-smoke.v1` stops at a clean
  two-commit repository and separately runs generated typecheck/unit. README
  documents install, one-shot commission, manifest add/commit, and literal
  no-argument verify that the smoke does not execute.
- Current workflow repeats checkout `v4.2.2`, setup-node `v4.4.0`, and
  upload-artifact `v4.6.2` pins three times each; their metadata is Node 20.
  Official latest stable/tag resolution and metadata inspection found:
  checkout `v7.0.1` at `3d3c42e5aac5ba805825da76410c181273ba90b1`,
  setup-node `v7.0.0` at `820762786026740c76f36085b0efc47a31fe5020`,
  and upload-artifact `v7.0.1` at
  `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`; all three exact `action.yml`
  files declare `runs.using: node24` and all observed release tags resolve
  directly to commit objects.

## Steps

1. [x] Inspect all required authority, plan, log, audit, adopter, workflow,
       proof-audit, protected-state, origin, artifact, hosted-run, and official
       action-release inputs; reconcile the stale Session 1 plan here.
2. [x] Increment 4 — define a testable ordered quickstart
       command plan/ledger; create/install/commission once; validate the sole
       generated manifest; deterministically add/commit it; prove branch,
       three commits, cleanliness, bootstrap profile, and absent readiness
       marker in tree/history; run literal generated `pnpm verify` once; audit
       it through the shared proof owner; copy complete verification evidence
       before cleanup; emit a versioned result and fail-closed unit coverage.
       Remove redundant standalone typecheck/unit launches only because the
       audited aggregate requires their receipts and artifacts. Update
       accurate README/contract prose and the autonomy log, run the focused
       receipt-owning test, and commit this increment narrowly.
3. [x] Increment 5 — record official release/tag/SHA/runtime/migration
       provenance in the decision log; replace all nine workflow references
       and comments; centralize the exact allowlist/count contract; add
       mutations for old pins, mutable tags, short SHAs, mixed job versions,
       missing references, and non-allowlisted actions; update the autonomy
       log and this plan to the final freeze, run the focused receipt-owning
       workflow test, and commit narrowly.
4. [x] Repair the documented pnpm separator contract exposed
       by the first frozen-candidate journey: both public quickstart CLIs must
       accept exactly one leading `--` while retaining all strict option,
       duplication, and unknown-option failures. Add focused adopter and
       commissioning parser tests, rerun the affected receipt-owning files,
       record the failed candidate truthfully, and commit a narrow repair that
       becomes the replacement final candidate.
5. [ ] **In progress after the repair commit:** From the replacement final committed candidate, run exactly one real Windows
       generated-adopter create → offline frozen install → commission →
       deterministic manifest commit → literal no-argument bootstrap verify →
       shared independent audit journey. Retain the complete smoke output and
       inspect the browser screenshot/diagnostics. Run Linux parity only if an
       exact WSL/Linux browser boundary is already available; otherwise record
       the limitation for Session 3 rather than broadening setup.
6. [ ] Run exactly once from six isolated no-local/no-hardlink clones of the
       identical commit/tree: `pnpm test:invariants`,
       `pnpm test:orchestrator`, `pnpm test:unit`, `pnpm typecheck`,
       `pnpm lint`, and `pnpm format:check`. Keep the two overlapping test
       aggregates sequential and run at most two heavyweight commands at once.
       Independently validate command-owned receipts, artifacts, manifests,
       candidate bindings, counts/skips, toolchains, and clone cleanliness.
7. [ ] Write only an ignored truthful Session 2 final audit, confirm the
       tracked tree is clean under the protected-file exception, and hand off
       the exact candidate to Session 3 for the hosted matrix without pushing
       or making an autonomous-readiness claim.

## Acceptance Criteria

- The smoke's explicit ordered ledger proves exactly one source creator,
  generated frozen install, generated commission, Git add, Git commit, and
  generated no-argument verify in documented order; source-level verify is
  structurally rejected.
- Commissioning reports exactly `.agent/verification-manifest.json`, whose
  actual bytes/SHA-256 match; the generated candidate is on the requested
  branch, clean, bootstrap-default, exactly three commits, and has no readiness
  marker in tree or history.
- Shared independent audit validates verifier status/profile/claim, both
  candidate captures, all required stages, every receipt/manifest/artifact
  identity, test count, screenshot, and clean browser diagnostics. Complete
  inspectable verifier evidence is copied before temporary cleanup.
- Tests fail closed on command order/count drift, two-commit or dirty
  repositories, missing/tampered evidence, wrong candidate identity, absent
  screenshot, and any source no-argument verify invocation.
- The exact documented `pnpm <script> -- --option` form works for creator and
  commissioning; no separator, duplicated separators, later separators,
  duplicate options, and unknown options retain their strict dispositions.
- All nine workflow references equal the three official allowlisted full SHAs
  exactly three times each; old pins, mutable/short/mixed/missing/unknown
  references fail validation. Exact application runtime and all scheduling,
  permissions, checkout, evidence, and prohibited-command boundaries remain.
- Focused tests, one final Windows adopter integration, and all six final
  broader commands pass with independently valid evidence on one exact frozen
  tree. No qualifying invocation is repeated merely to refresh evidence.
- Two cohesive commits are retained, no tracked byte changes after final
  verification freeze, no push occurs, and Session 3 receives the precise
  hosted-run next action. No autonomous-readiness claim is made.

## Verification

Inner loop, each with unique evidence/telemetry/TEMP/Corepack/output roots and
serial Vitest file execution:

- `node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/fresh-adopter-ci-smoke.test.ts tools/milestone-orchestrator/src/adopter-package-proof.test.ts --fileParallelism=false`
- `node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/exact-runtime-workflow-contract.test.ts --fileParallelism=false`

Final committed candidate only:

- One real Windows `fresh-adopter-smoke.ts` journey with a fresh retained
  output root.
- `pnpm test:invariants`
- `pnpm test:orchestrator`
- `pnpm test:unit`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`

Never run source no-argument `pnpm verify` or `loop:template:prove`.

## Risks and Recovery

- The full adopter verifier launches Chromium and can be expensive. Exercise
  command construction, ordering, and audit mutations in unit tests; launch
  the real journey only after all intended tracked bytes are committed.
- A generated verify failure is non-passing even if earlier commands succeed.
  Retain logs, diagnose without rerunning the complete journey for routine
  edits, and abandon/re-freeze the candidate if tracked repair is required.
- Node 24 action majors require sufficiently current hosted/self-hosted runner
  versions; official migration evidence and this repository's hosted-runner
  labels are recorded. Do not infer support from the major number.
- A final broader failure invalidates the frozen candidate. Preserve ERROR
  evidence, repair causally, commit, and rerun affected final checks on the new
  candidate rather than weakening or relabeling the gate.
- Preserve all user and ignored residue. Ordinary Git commits provide rollback
  for each cohesive increment; do not rewrite history or use destructive
  cleanup.

## Progress and Evidence

- 2026-08-22: Required startup inspection and current remote/hosted/action
  provenance reconciliation completed; no tracked implementation byte had
  changed before this plan replacement.
- 2026-08-22: Increment 4 now uses one exact six-command plan/ledger and the
  shared bootstrap audit over a byte-identical retained verifier tree. Its
  receipt-owning focused run passed 4 suites / 11 tests with zero failures or
  skips at
  `artifacts/manual/wp5-session2-step4-focused-1/evidence/`; direct targeted
  ESLint and Prettier checks passed. The real browser journey remains reserved
  for the final committed Session 2 candidate.
- 2026-08-22: Increment 4 is commit
  `4cab466851160c0adba155032724c28f08ba99c3`, tree
  `e830ef8331191f26bc7a2d4597fbd743f45dcccd`. Increment 5 selects official
  checkout `v7.0.1` / `3d3c42e5`, setup-node `v7.0.0` / `82076278`, and
  upload-artifact `v7.0.1` / `043fb46d`; exact metadata says `node24`.
  Its receipt-owning workflow-contract run passed 2 suites / 5 tests with zero
  failures or skips at
  `artifacts/manual/wp5-session2-step5-focused-1/evidence/`; direct targeted
  ESLint and Prettier checks passed.
- 2026-08-22: This plan, both autonomy entries, the action provenance decision,
  workflow, and tests are the last intended tracked bytes. The Increment 5
  commit becomes the immutable candidate; all subsequent results must remain
  in ignored evidence and must not edit tracked records.
- 2026-08-22: Candidate `d16bab91e8e1405c9b97aa572dc8fe9a168ea65d`
  failed its only real journey before repository creation. Pnpm correctly
  forwarded the documented separator, and `adopter-package-cli.ts` rejected it
  as `Unknown adopter package option: --`. Retained nonqualifying logs are at
  `artifacts/manual/wp5-session2-windows-adopter-final/`. The candidate is
  invalidated; no broader command ran. WSL inspection found no Linux Node,
  pnpm, or Chrome/Chromium boundary, so Linux parity remains Session 3 work.
- 2026-08-22: The narrow separator repair preserves both strict CLIs while
  accepting the documented single leading `--`. Its receipt-owning affected
  run passed 10 suites / 28 tests with zero failures or skips at
  `artifacts/manual/wp5-session2-separator-repair-focused-1/evidence/`;
  targeted ESLint and Prettier passed. This repair commit is the replacement
  final candidate; no tracked edit is permitted after it.

## Next Action

Audit and commit the separator repair as the new freeze. Record its exact
commit/tree externally, then rerun the real Windows journey once on that
replacement identity before creating the six broader-check clones.
