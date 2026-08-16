# Current Execution Plan

**Status:** WP4d pre-commit evidence complete; cohesive commit in progress
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Implement one bounded WP4d increment that turns the repository-provided loop
scaffold into an explicitly reproducible fresh-adopter package and proves that
the packaged repository can reach a truthful package-default `bootstrap` PASS.

The public workflow must create a fresh attached Git history from adopter-owned
authority inputs, generate rather than hand-edit the immutable-lock/verifier
anchor relationship, generate adopter-owned active config and registries, emit
a strict-ancestor commissioning input, commission exactly once through
`pnpm loop:commission -- --input <file>`, and run literal no-argument
`pnpm verify` against a clean committed repository. The scaffold must contain a
minimal real application, shared deterministic smoke kernel, persistence,
production build, Vitest/static checks, and supported desktop Chromium evidence
with command-owned receipts. The retained result must prove that bootstrap is
not autonomous-readiness-equivalent.

This is distributable-template and technical-scaffold work. It is not product
feature work, source readiness repair, a readiness-profile rollback, generic
external-reconciliation completion, or an autonomous-readiness claim.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, `evals/ACCEPTANCE.md`,
  `evals/acceptance-manifest.json`, `evals/HIDDEN_VALIDATION_PROTOCOL.md`,
  `evals/immutable-contract-lock.json`, and
  `.agent/readiness-profile-activated.json` byte-for-byte. The source default
  remains `readiness`; its permanent marker remains in tree and history.
- Preserve `.agent/completed/loop-recommissioning-verification.json` exactly.
  Preserve strict active v2 loading, explicit-only historical v1 contexts,
  literal no-argument exact verification, `exact-readiness`, tier-result schema
  `1.2.0`, and combined manifest/result schema `2.0.0`.
- Preserve the source repository's commissioned, one-shot state. Source
  recommissioning remains refused; do not mutate its active manifest merely to
  accommodate a new template trust root. The source target branch remains
  `master` and active registry ids remain
  `milestone-loop-core-invariants.v1`,
  `milestone-loop-shadow-scope-policy.v1`, and
  `milestone-loop-explicit-migration-suites.v1`.
- Preserve WP4c's descriptor and all six historical example JSON payloads
  byte-for-byte. Historical D-031/D-032 support remains explicit compatibility
  code only; no such id, Ski Tycoon identity, source commit, source package
  name, or source project name may enter the adopter authority, active config,
  registries, commissioning input, manifest, package metadata, or verification
  evidence.
- Preserve clean-tree, strict-ancestor, attached-branch, no-clobber,
  recommissioning, readiness-history, protected-root, exact-verification,
  evidence-receipt, provider, supervision, recovery, and reconciliation rules.
  Do not weaken provider completion eligibility to make local bootstrap evidence
  completion-eligible.
- The fresh adopter has package-default `bootstrap` and no readiness marker in
  either tree or history. Bootstrap PASS proves only the technical scaffold and
  is incapable of supporting `AUTONOMOUS-READINESS-01`.
- Build/test/browser scripts must exercise real production boundaries and write
  independently verifiable receipts. No placeholder, echo-only, no-op, bare
  `process.exit(0)`, fabricated browser, or asserted-without-artifact success is
  acceptable.
- Use pinned Node `24.18.0` and pnpm `11.15.1`. Use the frozen lockfile and
  offline copy-mode installation for packaged proof runs. Never overlap unit,
  orchestrator, reconciliation, supervision, container, or verifier suites.
- Do not implement domain systems, change verifier deadlines/partitioning, run
  the OCI matrix without an executor/provider owner change, push, or claim
  readiness.
- Never edit, stage, move, hide, delete, or re-encode the user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry identity is `HEAD`
  `89f3ea09303d03979c36a7362727f2147a4b2689`, tree
  `bc04682f283a51d8c4b797e939139f4c71316849`, on `master`, three commits
  ahead of `origin/master`. The tracked/staged tree is clean and the only
  untracked path is the protected human plan.
- The protected plan is 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter Git blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- WP4c is complete at the entry commit despite the replaced plan's stale
  in-progress wording. Its retained focused shard passed 66/66, orchestrator
  aggregate passed 499/501 with two unchanged POSIX-only skips, unit aggregate
  passed 512/514 with the same skips, and static/diff gates passed. The retained
  post-commit source result is 44,085 bytes / SHA-256
  `c4d5d4046c18352971f944af9fc1a6f61df2a05eac9175af840154402b9eeab0`:
  honest readiness `FAIL`, 2 PASS / 3 FAIL / 10 NOT_READY, contract integrity
  PASS, and completion ineligible. It is orientation evidence, not WP4d proof.
- WP4 source lines 1211-1349 require a distributable fresh fixture with new Git
  history, bootstrap, no marker, minimal real build/test, a generic manifest,
  no source ids, truthful bootstrap PASS, one-way readiness, generated trust
  roots, and no hand-edit of verifier source.
- The current commissioning test fixture cannot establish that boundary:
  `commissioning.test.ts` writes a synthetic two-line `scripts/verify.mjs`
  containing `ESTABLISHED_IMMUTABLE_LOCK_SHA256`, wires
  `test:invariants` to `node -e "process.exit(0)"`, has no production build,
  bootstrap simulation, persistence, browser, or receipt-owning project checks,
  and tests only `commissionRepository`. No test packages a reusable tree or
  invokes literal no-argument `pnpm verify`.
- The production verifier and commissioning implementation both require the
  immutable-lock SHA-256 to appear literally in `scripts/verify.mjs`.
  `README.md` consequently instructs adopters to edit that constant and re-pin
  acceptance checks by hand. Executable inspection therefore proves that the
  frozen WP4 no-source-edit requirement is not yet met.
- A safe minimal replacement can use the commissioned strict-ancestor base as
  the verifier anchor: require the base commit to contain the exact immutable
  lock and authority bytes, compare their hashes with the current generated
  lock, and keep universal bootstrap/readiness semantics in generic verifier
  validation. This removes the project hash from verifier source without a new
  mandatory protected path or a source-manifest rewrite. The current CAL-1
  behavior remains fail-closed: a later reviewed calibration transition still
  needs its dedicated semantic-diff implementation.

### Affected-test Matrix

| Production owner changed                                                              | Focused acceptance coverage                                                                                                                                                                                                            | Broader regression surface                                                                 | Required evidence                                                                                                                            |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Git-anchored immutable authority/lock validation shared by verifier and commissioning | exact base/current lock and authority equality; missing/changed/non-ancestor base; malformed lock; current authority drift; no verifier-source hash literal                                                                            | commissioning, manifest/config/protected-root, invariant, verifier/orchestrator aggregates | source contract integrity remains PASS; source immutable bytes unchanged; fixture needs no verifier edit                                     |
| Strict adopter-package definition and deterministic package creator                   | input/path/schema safety; empty/no-clobber output; twin deterministic file/tree/history identities; attached requested branch; no marker; adopter-owned generated files; source active tree unchanged                                  | package/config/schema/commissioning tests, typecheck/lint/format                           | sorted package inventory with bytes/SHA; two real commits before commissioning; strict ancestor base                                         |
| Minimal real bootstrap application and evidence tools                                 | deterministic Node/replay/Worker checkpoints; save/load continuation; nonempty clean-clone production build; real format/lint/typecheck/dependency/architecture/Vitest checks; real Chromium render/interaction/diagnostics/screenshot | production-build and receipt validation tests; fresh-fixture exact verifier                | every bootstrap stage PASS with required receipt kinds and inspectable screenshot/diagnostics                                                |
| Fresh-adopter proof runner and retained report                                        | offline install; deterministic commissioning; commit generated manifest; clean literal no-argument verifier; evidence/result/hash audit; active identity scan                                                                          | focused integration command only, not implicit in every unit aggregate                     | verifier exit 0/status PASS/profile bootstrap; `autonomousReadinessEquivalent:false`; no readiness marker tree/history; no active source ids |
| Adoption/contract/config docs and plan/logs                                           | command/path consistency and explicit lifecycle instructions                                                                                                                                                                           | static checks and diff checks                                                              | future adopter has one documented workflow; no manual verifier-source edit or readiness claim                                                |

## Steps

1. [x] Confirm the WP4c handoff commit/tree/divergence/status, protected-file
       identities, newest plan/log/decision entries, retained evidence, honest
       source verifier result, WP4 authority, active/historical boundaries,
       verifier profiles, commissioning fixture, production-build contract,
       packaging absence, and the exact hand-edited verifier-anchor gap. Replace
       the stale WP4c plan with this bounded WP4d plan before implementation.
2. [x] Introduce a shared, strict Git-base authority anchor. Validate the
       immutable lock and its four authority hashes both at the commissioned
       strict-ancestor base and at the candidate, remove the source-specific
       lock SHA literal from verifier source, and make commissioning/doctor use
       the same rule. Retain universal exact-command, profile, no-compensation,
       hidden-custody, and one-way readiness checks without hard-coding an
       adopter's project ids or thresholds.
3. [x] Add a strict versioned adopter-package definition and public package
       command. Copy only the declared reusable runtime/tooling surface plus
       adopter scaffold assets into a new no-clobber output, generate adopter
       authority lock/config/registries/package metadata, initialize the named
       attached branch with deterministic local Git identity/timestamps, commit
       the authority base, generate a commissioning input bound to that exact
       strict ancestor, and commit the input. Emit a sorted file/hash/history
       inventory. Do not commission automatically or mutate the source.
4. [x] Add the minimal real scaffold: one shared deterministic kernel consumed
       by Node, replay, browser Worker, save/load, and rendered app paths; a
       nonempty production build; real static/dependency/architecture/Vitest
       checks; and real Chromium launch, interaction, diagnostics, Playwright
       report, screenshot, and visual-review artifacts. Every successful script
       owns a receipt with the bootstrap stage's required kinds.
5. [x] Add exhaustive package/anchor unit tests and a separate retained
       fresh-adopter proof command. The proof must package into a temporary
       location, install frozen dependencies offline in copy mode, run explicit
       deterministic commissioning, commit the manifest, run literal
       no-argument `pnpm verify`, validate every receipt/artifact/result and
       active identity boundary, retain compact evidence, and leave the source
       profile/marker/manifest/lock/history unchanged.
6. [x] Use the supported browser surface to inspect the packaged production app
       independently of its self-produced browser report. Retain an inspectable
       screenshot or browser observation reference and reconcile it with the
       verifier-owned screenshot/diagnostics.
7. [x] Update adoption, contract, config, decision, and autonomy documentation.
       Freeze source, tests, template assets, schemas, plan, logs, and docs
       before receipt-owning broad checks.
8. [x] Execute the final serial command budget. Independently validate every
       source and fixture receipt/artifact hash and byte count, suite/test count,
       skip, duration, candidate identity, immutable/protected/example identity,
       package inventory, bootstrap stage count, and five slowest tests. Repair
       only through focused reproduction and rerun only invalidated evidence.
9. [in progress] Stage only the cohesive WP4d paths, verify both diffs, commit once without
       pushing, then run literal no-argument source `pnpm verify` exactly once.
       Report its honest readiness result without changing deadlines, hiding the
       protected file, weakening success criteria, or claiming readiness.

## Acceptance Criteria

- One documented repository-provided command creates a deterministic fresh
  adopter repository from a strict adopter-owned definition without editing
  verifier source. It refuses unsafe inputs, links/traversal, nonempty or
  existing outputs, invalid names/branches/timestamps, and identity drift.
- The generated repository has fresh Git history on its requested attached
  target branch. Its authority base is a real strict ancestor of the tracked
  commissioning input commit. Package-default profile is `bootstrap`; the
  readiness marker is absent from the tree and all history.
- `PROJECT_GOAL.md`, acceptance prose/manifest, hidden protocol, immutable lock,
  verifier anchor facts, config, invariant/scope/slow registries,
  commissioning input, package metadata, and active manifest are adopter-owned
  and internally coherent. Generated outputs are deterministic for equal input
  and Git identity.
- Commissioning succeeds only through the explicit one-shot command, prints all
  generated files/hashes, and produces the strict active v2 manifest. A second
  commissioning attempt fails. The base must be present and an ancestor, and
  wrong branch, dirty tree, marker history, authority/lock drift, or unsafe
  paths continue to fail closed.
- The packaged application uses one shared deterministic rule owner for Node,
  replay, production Worker, save/load continuation, and rendered output. The
  production build creates nonempty hashed outputs from a clean disposable
  clone. Static, dependency, architecture, typecheck, and Vitest checks execute
  real tools or inspect real boundaries.
- A supported desktop Chromium instance loads the production build, performs a
  public user action, receives a real Worker result, renders the expected
  inspectable consequence, emits no disallowed diagnostics, and produces a
  nonempty screenshot plus Playwright/browser/visual evidence.
- From the clean committed commissioned fixture, literal no-argument
  `pnpm verify` exits 0 and records overall `PASS` for every bootstrap stage,
  with valid command-owned receipts and independently matched artifacts. The
  result records profile `bootstrap`, claim `bootstrap_complete`, and
  `autonomousReadinessEquivalent: false`; it is never presented as autonomous
  readiness or used to weaken provider completion rules.
- The adopter active identity surface and retained proof contain no D-031,
  D-032, Ski Tycoon, source package/project name, source commit, source active
  manifest/input/config identity, or readiness marker. Explicit legacy support
  code remains closed and cannot become active fallback.
- Source authority/lock, readiness profile/marker/history, active manifest and
  source input, historical completed manifest, all six Ski JSON payloads,
  provider/recovery/reconciliation/supervision behavior, exact command, and
  protected human file remain unchanged.
- Focused anchor/package/bootstrap tests, the retained fresh-adopter proof,
  applicable source aggregates, typecheck, lint, format, and both diff checks
  pass. The one post-commit source verifier result is reported honestly and is
  not reinterpreted as WP4d bootstrap or readiness evidence.

## Verification

All commands prepend `.tools/node-v24.18.0-win-x64` to `PATH`, assert Node
`24.18.0` and pnpm `11.15.1`, use unique ignored artifact directories, and run
serially.

Implementation diagnostics:

1. Direct Vitest runs for the shared authority-anchor and commissioning cases.
2. Direct Vitest runs for package definition/creation safety and deterministic
   history/inventory; no no-argument verifier in the ordinary unit test.
3. Direct real scaffold commands in one generated fixture, stage-focused where
   possible, until receipt and browser interfaces stabilize.
4. Fresh-fixture no-argument verifier budget: at most one integration diagnostic
   after every focused bootstrap stage passes, then one frozen-tree retained
   acceptance run. One additional serialized contingency run is budgeted only
   if the first frozen attempt exposes a real defect; record the failed result
   and invalidate/re-freeze all affected fixture evidence before rerunning.

Final frozen-tree command budget:

1. One receipt-owning affected `invariant-vitest` shard covering authority
   anchoring, commissioning, package creation, config/schema/protected boundary,
   production build, receipt validation, and bootstrap proof parsing.
2. One retained fresh-adopter proof command, including exactly one successful
   literal no-argument fixture verifier execution for the frozen package.
3. One `pnpm test:orchestrator`, followed by one `pnpm test:unit`; never overlap
   them with each other, the fixture proof, or any focused verifier.
4. One each of `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, with
   command-owned receipts.
5. No OCI matrix: no container/executor/provider owner changes. No source
   readiness repair and no verifier deadline change.
6. Independent visual inspection of the packaged app and retained screenshot;
   audit every fixture receipt/result, all artifact hashes/bytes, Git history,
   marker absence, active identity scan, package inventory, test counts/skips/
   durations, and five slowest source tests.
7. `git diff --check`, `git diff --cached --check`, staged-path review, source
   immutable/example/protected identity audit, and source status/divergence
   audit.
8. Commit once. Then run literal no-argument source `pnpm verify` exactly once.
   This is separately budgeted from every fixture verifier. The source remains
   package-default readiness and its known product/provider/dirty-file/deadline
   gaps remain honest.

Evidence invalidation:

- Authority-anchor, commissioning, package-definition/schema, verifier, or
  scaffold production changes invalidate the focused shard, fresh-fixture
  proof, both applicable aggregates, and static gates.
- Browser/build/evidence-tool changes invalidate the fresh proof, visual audit,
  production-build/receipt focused cases, and relevant static gates.
- Test-only repair invalidates its focused shard and affected aggregate. A
  fixture-proof parser-only repair invalidates the retained proof.
- Docs/plan/log-only edits after semantic evidence require diff/static
  reinspection. All tracked content freezes before broad receipt gates.
- The final source commit changes commit identity but not the staged tree
  identity. The fixture proof binds its own fresh Git identities; the sole
  post-commit source verifier owns the source commit identity.

## Risks and Recovery

- Replacing a source-code lock hash with an unanchored writable file would
  weaken authority. Anchor exact lock and authority bytes to the commissioned
  strict-ancestor Git base already pinned by the protected active manifest; do
  not add a mutable fallback or auto-repair path.
- CAL-1 and explicit human revision need a future reviewed semantic transition.
  WP4d must remain fail-closed when base/current lock bytes differ; it must not
  invent calibration permission or change baseline hashes.
- A copier that mirrors the entire source would leak readiness history, active
  commissioning, examples, logs, and source identities. Use a strict allowlist
  plus generated adopter overlays, inventory every output, and scan only the
  defined active identity surface while keeping explicit legacy runtime support
  closed.
- Git creation can overwrite user data or inherit nondeterministic identity.
  Require an absent output, fixed input identity/timestamps, exact branch
  validation, local Git config, and no network/remotes. Recovery is ordinary
  removal of the newly created temporary proof output or reversal of the
  cohesive WP4d commit; never touch an existing destination.
- Browser discovery may vary by host. Use real Playwright against an explicitly
  discovered supported Chrome/Edge executable, record executable/version, and
  fail as unverified if unavailable; never fabricate a screenshot or silently
  downgrade to DOM-only execution.
- A successful local bootstrap verifier may remain completion-ineligible because
  the execution provider is honestly unattested. Preserve and report that fact;
  status PASS plus non-readiness profile evidence closes WP4d without granting
  integration/readiness authority.
- No push, external credentials, history rewrite, source recommissioning,
  destructive cleanup, or protected human-file handling is required.

## Progress and Evidence

- 2026-08-15: Confirmed the exact WP4c handoff and protected identities; read
  the frozen goal/contract/plan standard/latest logs and decisions/WP4 source;
  inspected retained WP4c receipts and honest verifier result; and traced the
  current verifier, commissioning, production-build, config, package, and
  fixture boundaries without rerunning a broad suite. Proved that the existing
  temporary fixture is commission-only, no-op, manually verifier-pinned, and
  incapable of executing the bootstrap profile. Selected a Git-base authority
  anchor plus strict generated adopter package as the smallest cohesive WP4d
  boundary that closes the executable gap without mutating the source readiness
  lifecycle.
- 2026-08-15: Replaced the verifier-source lock literal with a shared strict-base
  authority anchor and added adopter package creation, deterministic Git history,
  generated lock/config/registries/input, the real bootstrap app/evidence
  scaffold, a retained proof runner, and focused safety/audit tests. The focused
  anchor/commissioning/package diagnostic passed 21/21 and the proof auditor
  passed 3/3. A fresh diagnostic package passed every direct static, build,
  Vitest, invariant, persistence, simulation, and Chromium command.
- 2026-08-15: Spent the one budgeted diagnostic fixture no-argument run only
  after all focused stages passed. It completed all 9 bootstrap stages in
  40,944 ms with 10 valid receipts, 18 matched artifacts, 4 passing tests, an
  honest non-readiness completion disposition, and a 122,990-byte screenshot.
  The new independent auditor matched that real result and every receipt/
  manifest/artifact hash. Independent in-app browser inspection observed the
  public Worker action and canonical extracted-4/tick-3 consequence with clean
  diagnostics. Adoption, contract, config, decision, and autonomy docs now
  describe the generated no-source-edit workflow.
- 2026-08-16: The retained fresh-adopter proof and serial orchestrator/unit
  aggregates passed. The first final lint gate correctly rejected an empty
  non-code fixture directory that had been supplied as an ESLint target. A
  tested fixture-local definition entry point now gives that target a real
  lintable boundary without changing package output. The accepted affected
  shard passed 57/57 at
  `artifacts/manual/invariant-vitest-20152/invariant-vitest-report.json`.
  A package-only regeneration matched all 114 retained initial paths, byte
  counts, SHA-256 hashes, commits, and the pre-commission tree without running
  a verifier. The retained frozen proof at
  `artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` remains bound
  to that exact package: 9/9 stages, 10 valid receipts, 18 matched artifacts,
  4/4 tests, clean three-commit bootstrap history, no readiness marker, and no
  source-identity leak. Its result SHA-256 is
  `1ea5cc51597047eecd6054701989d2096484a7e9162f3cb93afbd3a749b8ff9c`.
- 2026-08-16: The post-correction serial aggregates passed with command-owned
  receipts: orchestrator 514/516 at
  `artifacts/manual/test-orchestrator-1576/orchestrator-report.json` and unit
  527/529 at `artifacts/manual/test-unit-18672/test-report.json`. Each has zero
  failures/todos and only the same two explicitly Windows-skipped POSIX
  process-group cases. The five slowest cases were independently recorded;
  receipt and artifact bytes/SHA-256 all match. Typecheck, lint, and format
  passed at `artifacts/manual/typecheck-13140`,
  `artifacts/manual/lint-19384`, and
  `artifacts/manual/format-check-21068`. Source immutable/config/example
  diffs are zero, all three protected-plan identities match, source remains
  readiness with its marker, and no OCI matrix is applicable.

## Next Action

Run the docs-only static/diff reinspection, stage only the cohesive WP4d paths,
review the staged inventory/diff, and commit once without pushing. Then spend
the separately budgeted literal no-argument source verifier exactly once,
audit its honest readiness result, and leave the protected plan untouched.
