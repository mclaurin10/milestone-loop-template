# Current Execution Plan

**Status:** Compatible amendment implementation verified; commit and coherent application next;
historical CLI revalidation and full-candidate prerequisites remain open
**Updated:** 2026-09-04
**Owner:** autonomous loop
**Predecessor:** intended WP6d closed at record-only commit
`ac4e9a2f43049d446356c2bc00b3f395df33e5b6` (tree
`db1da52cdf388bd3aadd90b975bf157bb37cbea8`; executable candidate
`93e03e2ff28d295f38590b7723d5d6b1460eae07`), pushed to `origin/master`.
Protected exact-runtime run
`https://github.com/mclaurin10/milestone-loop-template/actions/runs/33434584138`
passed all five jobs on that closeout commit, which satisfied the WP6d plan's
final "Next Action" gate. Measurement evidence: hosted matrix run
`33402460152` (five cold/warm pairs per platform) independently reproduced at
`C:/w/wp6d-matrix-33402460152` and `C:/w/wp6d-independent-33402460152`; see
the 2026-08-31 autonomy-log and decision-log entries.

## Objective

Complete intended **WP6e**: recompose the commissioned verification schedule
so that candidate verification executes the four canonical owner partitions
(`controller-runtime`, `repository-tooling`, `adopter-template`,
`trusted-container-fixture`) exactly once and never additionally runs the
overlapping legacy commands (`test:unit:fast`, `test:unit:migrations`,
`test:orchestrator`), while the exact no-argument closure, every package
script, the hosted exact-runtime workflow, and all frozen authorities remain
unchanged. The recomposition is applied through a tool-owned manifest
amendment, proven by executed before/after tier plans and test inventories,
and reversible by the same mechanism.

The maintainer approved the reviewed recommendation on 2026-09-04. The
decision is recorded under `2026-09-04 — WP6e recomposition direction and
transition requirements approved` in `docs/decision-log.md`. Routine
implementation choices proceed under `AGENTS.md`; another confirmation is
not a prerequisite. Approval records the direction, not execution evidence.
Paths abbreviated as `config/`, `schemas/`, or a TypeScript basename below
are relative to `tools/milestone-orchestrator/` or its `src/` directory.

Explicit non-goals: interpreting any timing, stating an improvement, benchmark,
or cutover-benefit claim, or deciding keep/revert (intended **WP6f**);
changing `scripts/verify.mjs`, readiness stages, profiles, or the exact
command; modifying `.github/workflows/exact-runtime-ci.yml`; changing
`benchmark.ts` / commissioned D032 semantics; changing the measurement lane
catalogue, `TEST_OWNER_IDS`, or the ownership catalogue's owner set; activating
selector suppression or scope-policy graduation; changing the generated
adopter schedule (`adopter-package.ts` `focusedCommands()` has no legacy
duplication); CAL-1; frozen authorities; immutable acceptance; rewriting any
historical record.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the acceptance contract, readiness gates, and
  every frozen authority byte-for-byte. Immutable lock stays
  `d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`; the
  protected untracked roadmap stays untracked and byte-identical at
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`; the
  protected workflow stays byte-identical at
  `9dc35e44aacd35e3058895cccc89c43de9ff535ad20a0552c9b8a80b23cb19bf`.
- `scripts/verify.mjs`, `tools/run-tool-evidence.mjs`,
  `tools/milestone-orchestrator/src/benchmark.ts`,
  `config/benchmark-matrix.json`, `config/slow-suite-registry.json`, and every
  existing `package.json` script are unchanged. New scripts are additive only.
- The active commissioning input, scope policy, and verification manifest
  change together through the amendment operation of Step 1. A separate
  amendment descriptor supplies the proposed bytes; the active files are
  not edited in preparation. The manifest is rendered through the existing
  `manifestFromInput` path. Prior/new input, policy, and manifest hashes,
  chain linkage, and the executed tier-plan diff are recorded.
- The measurement lane's identity surface is frozen for the whole package so
  WP6f can still revalidate WP6d's retained records at the WP6e head:
  `MEASUREMENT_COMMANDS`, `CHILD_TIMEOUT_MS` (`measurement-lane.ts:53`),
  `TEST_OWNER_IDS` (`test-ownership.ts:20`), and the lane/statistics schemas.
  (Catalogue SHA-256 is computed over those values at
  `measurement-lane.ts:544-550`; any change would reject every retained lane
  record.)
- No production trust boundary is weakened: iteration, candidate, and
  milestone retain `test-invariants` first; periodic retains its sole exact
  closure command. Partition subsumption requires the invariant prerequisite
  before any child starts. Every scheduled focused command still requires a
  validated command-owned receipt, and the closure-suppression policy stays
  `closureSuppressionAllowed: false`.
- The tier controller gives canonical owner-partition commands an explicit
  65-minute outer timeout. Other focused commands keep their existing
  20-minute tier timeout; exact-closure deadlines, inner partition limits,
  test/hook limits, and measurement-lane limits are unchanged. The new bound
  contains the existing 60-minute partition child limit plus setup and
  receipt publication; its command/argv binding and propagation are tested.
- Historical log entries and retained evidence are never rewritten or edited;
  corrections and new records are appended.

## Baseline Evidence

- **Head.** `ac4e9a2` / tree `db1da52…`, pushed; hosted exact-runtime run
  33434584138 is recorded green. On 2026-09-04 the working checkout already
  contained the modified draft plan and the protected untracked roadmap.
  Baseline execution must use a clean clone of the commit, preserving both
  local files. Required runtime: Node `24.18.0`, pnpm `11.15.1`.
- **Current commissioned schedule** (`.agent/verification-manifest.json`,
  rendered from `config/source-commissioning-input.json`; recommissioning is
  refused while the manifest exists, `commissioning.ts:662-665`):
  - iteration: `test-invariants` (+ explicit focused ids)
  - candidate: `test-invariants`, `test-unit-fast`, `test-orchestrator`,
    `format-check`, `lint`, `lint-architecture`, `typecheck`, `build`
  - milestone: candidate set + `test-unit-migrations` + nine
    `domain-*` placeholders + `exact-readiness`
  - periodic: `exact-readiness` only
    Tier selection is tag-based (`verification-tier.ts:230-232`); scope
    recommendations are additive (`:237`, `:243`) and the only existing
    subsumption rule is `test-unit` ⇒ drop `test-unit-fast` /
    `test-unit-migrations` (`:238-247`).
- **Measured test universe on candidate `93e03e2`** (retained statistics,
  `testCounts` medians, identical on both platforms):
  `test:unit:fast` 82 files / 676 tests; `test:unit:migrations` 1 / 32;
  `test:orchestrator` 82 / 692; `test:partition:controller-runtime` 80 / 688;
  `test:partition:repository-tooling` 1 / 16;
  `test:partition:adopter-template` 2 / 4;
  `test:partition:trusted-container-fixture` 1 / 1. Complete `test:unit` was
  205 suites / 708 tests in the same hosted run. Derived (to be re-proven in
  Step 0, not assumed): candidate-tier coverage today is
  `fast ∪ orchestrator` = 708 unique tests with 660 executed twice (1,368
  executions); the four partitions are a disjoint cover of 709 tests =
  `test:unit` (708) plus the single OCI fixture case, per the WP6c shadow
  proof of empty intersections and exact discovery union.
  These are baseline inventories, not fixed after-state counts: WP6e's new
  regression tests must be explicitly classified and included. Record their
  identity delta separately from the schedule change; no baseline test may
  disappear or change meaning to preserve a count. The exactly-once claim
  covers the four partition reports; invariant-suite executions are separate
  prerequisite evidence and may exercise some of the same tests.
- **Descriptive wall-time medians (Linux / Windows, cold):** `test:unit:fast`
  3m44s / 30m42s; `test:orchestrator` 3m20s / 30m05s;
  `partition-controller-runtime` 3m27s / 29m23s; the other three partitions
  total ≈ 41s / 61s. These are cited only to bound runner budgets; they
  support no claim in this plan (WP6f interprets).
- **Code touchpoints that hard-code the legacy schedule** (all must change in
  lockstep or the invariant suite / tier planner fails closed):
  - `test-ownership.ts:56-61` `REQUIRED_COMMISSIONED_TEST_COMMANDS` and the
    `ENTRYPOINT_CONTRACT_DRIFT` diagnostic at `:904-925`;
  - `affected-scope.ts:87-106` `AUXILIARY_CHECKS` (checks the scope policy may
    name without being scheduled: `dependencies`, `test-unit`,
    `exact-readiness`) and `:108-120` `CHECK_ORDER_PREFIX`;
  - `verification-tier.ts:236-247` subsumption rule;
  - `config/verification-scope-policy.json` `mandatoryChecks` /
    `workspaceChecks` name `test-unit`, `test-unit-fast`,
    `test-unit-migrations`, `test-orchestrator`; unknown ids throw at
    `affected-scope.ts:208-214` and `verification-tier.ts:253-260`;
  - `schemas/verification-tier.schema.json:117-122` requires `tiers`
    `minItems: 1` from `{iteration, candidate, milestone}` — a retained
    command cannot be tagged with no tier; unscheduled-but-referenced checks
    belong in `AUXILIARY_CHECKS`;
  - `benchmark.ts:1180` (`narrowed` requires after-runs to exclude `test-unit`
    and `test-unit-migrations`) and `:1933-1939`
    `BENCHMARK_BROAD_SAFE_CHECK_IDS` (names `test-unit`, `test-orchestrator`);
    both remain satisfiable if those ids stay resolvable as auxiliary checks;
  - `commissioning.ts:548-574` requires every `pnpm` focused command to map to
    an existing package script (partition scripts exist);
  - partition receipts own `test-partition-report`,
    `test-partition-vitest-report`, and `test-run-summary`
    (`test-partitions.ts:51-52`, `test-run-summary.ts:19`).
- **Reviewed implementation constraints (2026-09-04).** The tier controller
  actually passes its 20-minute default to focused children
  (`verification-tier.ts:325`); this cannot contain the retained Windows
  controller-partition duration or its 60-minute inner limit. The current
  ownership gate requires legacy IDs, and `buildScopeCheckCatalogue` rejects
  duplicate manifest/auxiliary IDs, so unconditional replacement or auxiliary
  registration cannot be committed while the v1 manifest remains active.
  `CommissioningTierPlanSummary` currently reports command counts and exact
  inclusion, not ordered check IDs; Step 0 must capture those IDs directly
  from the production planner, and Step 1 must expose them in doctor output.
  A clean-tree amend command cannot consume an already edited active input;
  the descriptor/publication workflow below resolves that conflict.
- **Candidate prerequisite caveat.** The root package still declares
  placeholder `verify:dependencies` and `lint:architecture` commands and has
  no `milestoneLoop.productionBuild` declaration. Hosted controller/unit
  success does not prove a successful `verify:candidate`. The baseline
  preflight must retain these dispositions and establish whether the full
  requested candidate run is executable within WP6e scope. An inherited
  NOT_READY/FAIL result stays non-passing; do not substitute a focused run,
  install a no-op, or make a completion claim to bypass it.
- **Generated adopters** commission their own bootstrap schedule
  (`adopter-package.ts:813` → `focusedCommands()`: invariants, format, lint,
  lint-architecture, typecheck, build, `bootstrap-unit`) and their scaffold
  does not register the `test-ownership` invariant; the recomposition does not
  propagate to them, but the fresh-adopter smoke remains a hosted gate.
- **Docs that describe the schedule and must be updated (living docs, not
  logs):** `README.md:36-90` (four-tier model; "shadow-only candidate surface…
  commissioned tiers unchanged"), `CONTRACT.md:64-72` and `:182-196`,
  `tools/milestone-orchestrator/config/README.md:180` ("These commands are
  not part of the commissioned tier").
- **External review of WP6d code (2026-09-01, two independent read-only
  passes; recorded here so the successor inherits them as known, not
  unknown).** No severe defect, no weakened production boundary, no workflow
  injection. Carried caveats: (a) per-command `cold` distributions are
  order-conditioned within a lane (seven commands run serially in one fresh
  workspace; only the first is literally cold) — WP6f must not read them as
  equivalent; (b) statistics `inputs[].path` is download-topology dependent
  and the standalone `assertMeasurementStatisticsRecord` is shallow — always
  consume statistics through `validateMeasurementStatisticsArtifacts`
  reproduction; (c) summary validator still admits the measured-probe ⇒
  unavailable-metrics direction and never cross-checks `testBodyTime` against
  `reports[]`; (d) the lease suite no longer proves the real OS incarnation
  probe returns a parseable _alive_ observation (a probe regression to
  "unavailable" would pass the suite while making reused-PID leases
  unrecoverable); (e) `test-partitions.ts:2196-2221` test-only path should
  throw rather than write a PASS receipt it later unlinks. Items (c)–(e) are
  WP6d hardening follow-ups, not WP6e scope; they are listed under Risks with
  a recommended owner.

## Steps

0. **Record the approved target and pin the baseline.** The direction and
   corrections below were approved on 2026-09-04 and are recorded in the
   decision log. The decision and executed baseline inventory pin are
   complete; inherited full-candidate prerequisites remain non-passing as
   recorded below. No additional routine approval is required.
   - **Target schedule.** Add four focused commands
     `test-partition-controller-runtime`, `test-partition-repository-tooling`,
     `test-partition-adopter-template`,
     `test-partition-trusted-container-fixture` (argv
     `pnpm test:partition:<owner>`, `expectedArtifactKinds`
     `["test-partition-report", "test-partition-vitest-report",
"test-run-summary"]`), tagged `["candidate", "milestone"]`. Remove
     `test-unit-fast`, `test-unit-migrations`, and `test-orchestrator` from
     `focusedCommands`; register them as auxiliary checks (tiers `[]`) only
     when they are absent from the manifest. This preserves valid v1 and
     historical catalogues without duplicate IDs. They stay resolvable for
     diagnostics, ordering, and historical benchmark lists. The
     full orchestrator command remains available for maintainer diagnosis,
     the measurement lane, the shadow aggregate, and the hosted exact-runtime
     workflow; exact closure (`pnpm verify` → `test:unit`) remains the
     authoritative full run in the milestone and periodic tiers. Iteration
     and periodic tiers are unchanged.
   - **Scope policy `v2`.** Translate legacy test IDs through the mapping
     below, union/deduplicate replacements within each row, and preserve all
     non-test checks. Here C = `test-partition-controller-runtime`, R =
     `test-partition-repository-tooling`, A = `test-partition-adopter-template`,
     and T = `test-partition-trusted-container-fixture`.

     | Legacy check           | Replacement | Expected baseline identity relation                      |
     | ---------------------- | ----------- | -------------------------------------------------------- |
     | `test-unit`            | C, R, A     | Equal: 708 root tests                                    |
     | `test-orchestrator`    | C, A        | Equal: 692 tests                                         |
     | `test-unit-fast`       | C, R, A     | Superset: adds the 32 migration tests                    |
     | `test-unit-migrations` | C           | Superset: 32 migration tests within 688 controller tests |

     The exact `mandatoryChecks` test-component matrix is:

     | Trigger class             | Replacement test components                          |
     | ------------------------- | ---------------------------------------------------- |
     | `protected-authority`     | C, R, A                                              |
     | `canonical-encoding`      | C, R, A                                              |
     | `shared-protocol`         | C, R, A                                              |
     | `persistence-codec`       | C, R, A                                              |
     | `migration`               | C, R, A                                              |
     | `accepted-fixture`        | C, R, A                                              |
     | `standard-state`          | C, R, A                                              |
     | `composition-root`        | C, R, A                                              |
     | `worker-message`          | No legacy test replacement; existing checks retained |
     | `package-graph`           | C, R, A                                              |
     | `browser-host`            | No legacy test replacement; existing checks retained |
     | `ui-renderer`             | C, R, A                                              |
     | `domain-local-simulation` | C, R, A                                              |
     | `orchestrator-evidence`   | C, A                                                 |
     | `documentation-only`      | No legacy test replacement; invariants retained      |
     | `unknown`                 | C, R, A                                              |

     `workspaceChecks` maps `@milestone-loop/orchestrator` to C, A plus its
     existing typecheck;
     `milestone-loop-template` maps to C, R, A plus all its existing non-test
     checks. Prove every complete row is a discovery superset; migrations
     already accompany `test-unit` in the current rows, so their individual
     expansion adds nothing to those rows. The two fast-only rows add 32
     migration tests in this direct mapping.

     T is commissioned in both candidate and milestone regardless of
     recommendations. It is not added to every legacy replacement. Existing
     broad/fail-broad behavior already recommends every candidate-tagged
     command, so broad and unknown changes also recommend T. Preserve that
     behavior and report its +1 OCI identity separately. For v2 only, replace
     the broad selector's hard-coded `recommended.add("test-unit")` with
     C, R, A; otherwise recommendations would still perpetually name a
     subsumed legacy check. Keep the v1/historical selector behavior intact.
     No new trigger taxonomy or scope suppression is introduced.

     Bump `id` to `milestone-loop-shadow-scope-policy.v2` and update
     `scopePolicyId` in the input and rendered manifest in one amendment.
     Graduation fields stay deferred; `mode` stays `shadow-only`. Pin the
     matrix and the broad augmentation separately in regression tests.

   - **Planner subsumption rule.** In `planVerificationTier`, when all four
     partition ids are in the actual set for candidate or milestone, remove
     `test-unit`, `test-unit-fast`, `test-unit-migrations`, and
     `test-orchestrator` only after checking the invariant prerequisite.
     A candidate/milestone plan containing owner partitions must include
     the canonical `test-invariants` command first; reject missing or
     substituted prerequisites before executing any child. The source v2
     ownership contract requires all four distinct partition IDs, exact
     owner argv/artifact kinds, and candidate/milestone tags, with no tiered
     legacy test command. Its registry must include the production ownership
     gate. The runner stops on any prerequisite failure. The partition
     executors additionally revalidate ownership and executed membership.
   - **Bounded execution.** Bind the 65-minute outer timeout to the four
     canonical partition command definitions, including argv validation.
     Test the selected timeout at the execution-provider boundary and retain
     the value in tier evidence. Do not add an unrestricted timeout field to
     the manifest or alter unrelated/exact/measurement deadlines.
   - **Publication and compatibility.** First land amendment infrastructure
     and v1/v2-aware catalogue/planner/ownership support while the v1 active
     files remain valid. Match the full source schedule generation, not just
     the policy ID. A v1/v2 mixture, arbitrary policy ID, wrong partition
     argv, absent prerequisite, or unsupported schedule fails closed. The
     original one-shot creation command remains one-shot; the new amendment
     path supersedes the earlier prohibition on changing an existing
     commissioned schedule, as recorded in the decision log. Generated
     adopters retain their own bootstrap schedule and commissioning path.
   - Alternatives to reject with rationale in the entry: hand-editing the
     manifest or coordinated active-input/manifest edits (no verified
     amendment provenance); committing an input/policy/gate mismatch merely
     to satisfy a clean-tree precondition (invalid intermediate state); keeping
     `test-orchestrator` tagged `milestone` (re-runs 692 tests beside the
     partitions and the exact closure with no added proof); leaving the scope
     policy untouched and relying on the planner alone (recommendations would
     perpetually name checks the planner removes); tagging retained legacy
     commands with an empty tier list (schema forbids it); a blanket four-owner
     policy replacement (changes each recommendation's coverage differently).
   - **Before-state pin.** From a clean short-root clone of `ac4e9a2`:
     `pnpm loop:doctor` (retain all diagnostics, including any overall
     NOT_READY, and the commissioning diagnostic's four tier summaries),
     `pnpm test:invariants`, and `pnpm test:partitions:shadow`
     (retain the disjoint-cover / exact-union / equivalence proof and the
     per-partition test identities). Derive and record the exact identity
     sets: candidate-before executions, unique tests, duplicates; partition
     union; the set difference versus `test:unit` (expected: exactly the OCI
     fixture case). Any other unexplained difference is a stop-and-record
     event. Capture ordered `actualCheckIds` and command definitions by
     invoking the existing production `planVerificationTier` with the
     doctor's fixed `commissioning.ts` fixture context; the current summary
     alone cannot prove the schedule. Retain the procedure and its inputs.
     Also capture a broad/package-change context and the default CLI context;
     these can add checks beyond the doctor's fixed scenario.

     Preflight the inherited candidate prerequisites before expensive runs;
     retain truthful NOT_READY/FAIL results from placeholder checks or build
     configuration. Establish a bounded in-scope resolution before claiming
     the full candidate acceptance is achievable. These are engineering gaps,
     not a renewed routine-approval gate.
1. **Tool-owned amendment infrastructure; keep v1 valid.** Add
   `loop:commission:amend` as an additive script backed by an `amend` mode in
   the commissioning CLI. Its public input is `--descriptor <file>`, a strict,
   separately committed request containing the active source paths, proposed
   input/policy bytes, expected prior file hashes and chain tip, and the
   decision-log heading. The descriptor never supplies manifest bytes or
   permits arbitrary output paths. Preparation leaves the active v1 files
   valid, so the tool can start from a clean, committed target-branch clone.

   Require an existing valid commissioning, a clean tree, the target branch,
   and HEAD a strict descendant of `commissioning.baseCommit`. Validate the
   current input/policy/manifest against their recorded generation before
   considering the descriptor. Preserve `id`, `targetBranch`, `baseCommit`,
   `profile`, `createdAt`, protected-floor and frozen-identity fields;
   constrain the mutation to the reviewed focused schedule and scope policy.
   Render the proposed manifest through
   `manifestFromInput(input, activeManifest.commissioning.createdAt)` and
   reuse pre-commissioning assertions for the proposed coherent state.
   Validate proposed registries/IDs and tier plans in memory or isolated
   staging, not by temporarily changing the active policy. Reject no-ops.

   Publish the input, policy, manifest, and the append-only record at
   `.agent/completed/verification-manifest-amendments.json` through one
   recoverable operation. Stage exact bytes, durably record intent and
   prior/new hashes before the first replacement, and recheck HEAD, branch,
   chain tip, and every expected prior file. Individual atomic replacements
   are not a multi-file transaction: doctor and tier/controller consumers
   must refuse an incomplete generation. After a crash, resume the same
   recorded operation only when each path matches its expected prior or new
   bytes; preserve and report foreign changes. A resume accepts only its
   own recorded dirty paths, while a new operation still requires clean.
   No implicit Git commit, reset, controller-state adoption, or unrelated
   file mutation is allowed. An interrupted operation cannot yield PASS.

   Each chain entry records prior/new input, policy, and manifest SHA-256,
   previous entry hash, descriptor hash, decision heading, invocation HEAD
   and tree, ordered before/after tier plans, added/removed IDs, and its own
   canonical content hash. Anchor the first prior generation to real Git
   blobs from a verified commissioned ancestor; do not infer provenance from
   current matching files. Later entries must extend the committed prefix
   without rewriting it, and their prior hashes must equal the preceding
   tip's new hashes. Preserve prior input/policy bytes for an audited reverse
   amendment. Bind source paths explicitly; generated adopters have a
   different commissioning-input path and must remain compatible.

   Extend doctor to compare the canonical input render, actual policy bytes,
   active manifest, and chain tip, including the Git anchor/prefix. Reject
   one-file edits, coordinated input/manifest or policy edits outside the
   chain, ledger deletion/truncation after activation, invalid links, and
   partial publication. Unamended v1 repositories remain valid against their
   genuine commissioning history; the feature must not fabricate amendment
   entries for them. This is repository audit integrity, not a claim that
   local hashes authenticate an actor who can rewrite the entire repository.

   Add ordered check IDs and command definitions to the commissioning tier
   diagnostic, with matching schema/consumer updates and a versioned
   canonical schedule projection for before/after comparison. Regressions
   cover identity changes, dirty starts, stale descriptors, missing scripts,
   unknown tiers, no-op, coherent v1 validation, exact v2 render, chain
   tampering, concurrent amendment attempts, failure before/after each
   publication boundary, resumability, and generated-adopter compatibility.

   **First bounded implementation increment (2026-09-04).** Complete the
   baseline capture and expose the production planner's ordered command
   projection through commissioning Doctor and lifecycle Status before
   implementing publication. Give that projection a strict versioned schema,
   retain the existing focused-command count semantics, include the literal
   exact closure in its ordered definitions, and test its propagation and
   invalid/inconsistent records. This is the first part of Step 1, not the
   amendment operation. The source v1 input, policy, manifest, all scripts,
   and all scheduling/execution behavior remain unchanged in this increment.
   Focused checks are commissioning, Doctor, and Status; the listed broad
   checks still apply. Amendment descriptor, audit, recovery, and schedule
   support remain explicit subsequent work.
   The first focused execution exposed unsupported `prefixItems` in the
   existing independent JSON Schema evaluator. Extend that test-only evaluator
   with positional/tail array semantics and explicit malformed-schema
   regressions; include `config-schema-parity.test.ts` in the affected rerun.

2. **Planner, catalogue, gate, and timeout support; keep v1 valid.** Register
   auxiliary legacy IDs only when the manifest does not commission them;
   preserve duplicate/definition validation. Add the four partition IDs in
   canonical owner order after the existing build position in
   `CHECK_ORDER_PREFIX`, retaining the order of other checks. Implement the
   v1/v2 schedule validation, source-v2 broad recommendation mapping,
   prerequisite checks, subsumption, and bounded timeout from Step 0. The
   source ownership gate recognizes complete v1 and v2 generations; it must
   not become an unconditional v2 expectation before the amendment lands.

   Regressions prove the original v1 plan is unchanged; v2 candidate and
   milestone contain no legacy test check even if a recommendation names
   one; each missing/misbound partition, tiered legacy command, incomplete
   generation, missing invariant, or omitted ownership child fails closed;
   and a failed invariant starts no partition. Validate every policy matrix
   row, broad augmentation, deterministic order, and the exact timeout sent
   to the provider. Benchmark fixtures must still resolve their historical
   IDs and retain their existing assertions. Fresh-adopter smoke and generated
   strict typecheck/lint must pass with the packaged runtime changes.

3. **Apply the recomposition as one coherent generation.** Commit the
   reviewed descriptor alongside compatible infrastructure and tests, with
   the active v1 files still valid. From a clean short-root clone of that
   committed tree, run
   `pnpm loop:commission:amend -- --descriptor <committed-descriptor>`.
   Retain the operation result, complete amendment chain, and commissioning
   doctor PASS; retain the full doctor's independent overall disposition too.

   For the fixed commissioning fixture, compare ordered schedule projections:
   candidate adds exactly the four partitions and removes `test-unit-fast`
   and `test-orchestrator`; milestone adds the four and removes those two
   plus `test-unit-migrations`. Iteration and periodic command projections
   are byte-identical; schema/identity metadata are not part of that equality.
   Independently compare broad and default-CLI contexts, including any
   subsumed `test-unit` and added `dependencies`, rather than applying the
   fixed-fixture diff to a different changed-path set.

   Update `README.md`, `CONTRACT.md`, and `config/README.md` for the new
   schedule, diagnostic legacy scripts, descriptor/apply/recovery workflow,
   and timeout. Verify and commit the active input, policy, manifest, and
   chain together. Never publish a commit with just one side of the switch.

4. **Executed after-state proof.** From a clean short-root clone of the
   Step 3 commit, run `pnpm verify:candidate` with the recorded changed-path
   context and retain all results and receipts. The controller partition has
   the explicit 65-minute outer bound. A non-passing inherited prerequisite
   remains an unresolved full-candidate acceptance gap.

   Execute `pnpm test:partitions:shadow` on the same commit. From its raw
   reports, prove the partition union equals the current root-unit inventory
   plus exactly the OCI fixture case, with empty pairwise intersections.
   Then independently prove the four candidate partition reports match that
   union and each identity executes once across those reports. Invariant
   prerequisite test executions are accounted separately. No legacy test
   script may run as a scheduled focused check; inspect command argv and
   require the absence of legacy fast/migration/orchestrator report kinds
   from those command evidence directories. Validate every partition receipt,
   raw report, and `test-run-summary` artifact.

   Reconcile the final inventory to Step 0: retain every baseline identity
   and enumerate WP6e regression additions with their owner. The historical
   counts are 708 root / 709 with OCI; the final counts include those new
   tests. Execute `pnpm verify -- --stage unit-domain` to inspect the actual
   readiness unit stage. Retain its complete disposition and the root-unit
   child's report; that stage also requests `test:domain`, so successful
   `test:unit` evidence alone is not a stage PASS. The verifier stays
   byte-identical. Missing stages/scripts and skipped or incomplete children
   are unverified, never relabeled as passing closure evidence.

5. **Fail-closed proofs at the tier boundary.** Focused regressions and one
   retained real execution each, using isolated committed mutation candidates
   where cleanliness is required so the intended boundary is reached:
   (a) an unclassified test file fails
   `test-invariants` (ownership gate) before any partition runs and the
   candidate tier issues no PASS receipt; (b) a partition child that exits
   nonzero or omits its `test-partition-report` fails the candidate tier
   through command-owned receipt validation; (c) the WP6c omission mutation
   (`test-partition-cli.ts omission-mutation`) still yields a FAIL proof and no
   PASS receipt on the recomposed candidate. No production trust boundary
   may be weakened to make these pass. A dirty-tree rejection is not evidence
   that the ownership or child-receipt boundary rejected the mutation.
6. **Hosted gate.** Push each candidate commit and require the protected
   exact-runtime workflow to pass all five jobs (the Windows/Linux controllers
   run the amended ownership gate; both fresh-adopter smokes exercise the
   packaged runtime). Record run URLs and archive digests. Optionally
   dispatch one `wp6-measurement-matrix` run on the final candidate so WP6f
   has per-command records bound to the recomposed head; WP6e records the
   run without reading its numbers.
7. **Closeout.** Update this plan, the autonomy log, and the decision log with
   exact evidence and the successor handoff: intended WP6f alone computes the
   schedule-level before/after from WP6d's retained statistics and this
   package's tier-plan diff, compares it against `config/benchmark-matrix.json`
   thresholds (`minimumImprovementMs` 10000, `noiseMultiplier` 2,
   `maximumClosureRegressionMs` 15000) and measured MAD, decides keep or
   revert (revert = one further amendment restoring the prior input and
   policy, canonically regenerating the prior manifest, and extending the
   chain), and owns any performance statement. Preserve v1 support so that
   reverse amendment passes the same ownership/doctor checks. Leave the
   tracked tree clean.

## Acceptance Criteria

- A clean v1 tree accepts a committed amendment descriptor without prior
  edits to its active input/policy/manifest. A recoverable operation generates
  those three files and extends the Git-anchored amendment chain. Doctor
  validates canonical render, active file hashes, chain tip and committed
  prefix, and rejects individual/coordinated drift or an incomplete
  generation. Crash and concurrent-start tests preserve exact prior/new
  states, refuse foreign edits, and resume without fabricating history.
- V1, v2, and an explicit reverse amendment each pass their full schedule
  contract. An unknown or mixed generation, wrong argv/artifact/tier binding,
  missing invariant prerequisite, or missing ownership child is rejected.
  Every intermediate commit remains valid with its active schedule; there
  is no input-only or gate-only broken transition commit.
- For the fixed commissioning fixture, ordered candidate check IDs are
  `test-invariants`, `format-check`, `lint`, `lint-architecture`, `typecheck`,
  `build`, then the four partitions in `TEST_OWNER_IDS` order. Milestone adds
  the existing nine `domain-*` checks and `exact-readiness` in their current
  relative order. Iteration/periodic command projections are byte-identical
  to the Step 0 pin. Doctor exposes enough data to reproduce that exact diff;
  broad and CLI contexts are checked separately, with their additional
  checks preserved and documented.
- Policy v2's per-trigger and per-workspace matrix is the tested mapping in
  Step 0. Every direct replacement covers the old discovery set; any added
  identities from owner granularity or broad augmentation are enumerated.
  Source-v2 recommendations do not retain the hard-coded broad `test-unit`.
  V1/historical recommendations and benchmark assertions remain unchanged.
- Partition commands receive exactly 3,900,000 ms (65 minutes) at the tier
  execution-provider boundary, with the chosen value retained in evidence.
  Unrelated focused commands keep 1,200,000 ms; exact closure, inner
  partition, measurement, and test/hook deadlines remain unchanged.
- Executed clean `pnpm verify:candidate` passes every scheduled check and
  owns four valid partition receipts. Those four raw report sets cover the
  current complete root-unit inventory plus exactly the OCI fixture case,
  with every identity appearing once and no scheduled legacy test command.
  The same-commit shadow proof confirms that union. Reconciliation to the
  Step 0 baseline enumerates all newly added WP6e regression identities and
  admits no unexplained removal or semantic change. Prerequisite invariant
  executions are separate from this partition-execution count.
- The unmodified verifier's `unit-domain` invocation retains honest stage
  and child results. A complete root-unit child must exercise the final root
  inventory; it cannot stand in for a failed or unavailable `test:domain`
  child or a passing full readiness stage.
- Fail-closed proofs 5(a)–(c) hold with retained evidence.
- `test-invariants` (including the amended ownership gate), `typecheck`,
  `lint`, `format:check`, `test:orchestrator`, `test:unit`, and
  `git diff --check` are green locally on every candidate; hosted
  exact-runtime CI is green on both platforms for every pushed commit.
- `scripts/verify.mjs`, `run-tool-evidence.mjs`, `benchmark.ts`,
  `benchmark-matrix.json`, `slow-suite-registry.json`, all existing package
  scripts, `exact-runtime-ci.yml`, `MEASUREMENT_COMMANDS`, `CHILD_TIMEOUT_MS`,
  `TEST_OWNER_IDS`, and both protected hashes are unchanged; WP6d's retained
  matrix still reproduces under the WP6e head via
  `pnpm loop:measurement-statistics --input <merged platform root>
--platform <os> --validate-existing <retained statistics.json>` for both
  platforms (this revalidates every lane record, receipt, and reduction).
- No plan, log, record, README, or CONTRACT text added by this package states
  an improvement, benchmark, cutover-benefit, or readiness claim.

## Verification

- Focused per change: `commissioning.test.ts`, `doctor.test.ts`,
  `verification-tier.test.ts`, `affected-scope.test.ts`,
  `test-ownership.test.ts`, `test-partitions.test.ts`, `benchmark.test.ts`,
  `adopter-package.test.ts`, plus amendment descriptor/record schema and
  publication recovery tests. New test files receive an explicit existing
  owner; do not freeze final test counts to the earlier baseline.
- Broad per commit: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:invariants`, `pnpm test:orchestrator`, `pnpm test:unit`,
  `git diff --check`, each once from an isolated short-root clone
  (Windows `C:/w/wp6e-<step>-<command>-<n>` or the isolated task directory on
  `codex.lab`), using exact Node/pnpm and retaining receipts. Record the host
  for every execution. All six checks must pass before a commit; either host
  can establish that complete precommit set. Windows failures remain
  non-passing until actual Windows reruns verify them; the five-job hosted
  gate on the exact pushed commit remains mandatory on both platforms.
- Schedule-level: `pnpm loop:doctor` and production planner projections
  before and after; descriptor application and an executed reverse-amendment
  fixture; `pnpm verify:candidate` after; `pnpm test:partitions:shadow` before
  and after; `pnpm verify -- --stage unit-domain` after;
  `pnpm loop:measurement-statistics
--validate-existing` over the merged `C:/w/wp6d-matrix-33402460152`
  platform roots at the final head.
- Hosted: exact-runtime CI on both platforms for every pushed commit; one
  optional measurement-matrix dispatch on the final candidate.
- No visual/headless evidence is required; this package has no rendered
  surface.

## Risks and Recovery

- **Amendment scope:** keep the descriptor allowlisted to the existing source
  input/policy/manifest and the audit record; reuse rendering, validation,
  containment, and publication helpers. If recovery cannot meet the stated
  contract, leave implementation incomplete and revise the engineering plan.
  There is no hand-edit fallback. An audit hash chain does not itself prove
  who invoked a tool; Git anchors, immutable committed prefixes, command
  evidence, and independent review define the verification boundary.
- **Policy `v2` ripple:** the id appears in the manifest, the commissioning
  input, the policy, and historical decision-log prose (never edited).
  Benchmark fixtures record `policySha256` historically and are unaffected.
- **Transition consistency:** Steps 1–2 retain a complete valid v1 state;
  Step 3 changes all active files together. Auxiliary registration must not
  collide with the retained v1 manifest. V2 recognition requires the full
  expected schedule, and return to v1 requires an audited reverse amendment.
- **Windows timeout:** the known 20-minute outer limit is a prerequisite
  defect with the explicit scoped 65-minute resolution above. If that limit
  expires, retain the failure and diagnose it; do not silently retry with a
  larger limit or change measured-command identity.
- **Subsumption soundness:** planner construction must enforce the canonical
  invariant prerequisite before applying the rule, and execution must stop
  on its failure. A test inside an omitted invariant cannot detect its own
  absence; cover this at the planner/runner boundary.
- **Inherited candidate prerequisites:** dependencies/architecture placeholders
  and absent production-build configuration can prevent a candidate PASS
  before any partition starts. Report their exact result and affected
  context. Do not broaden WP6e into product implementation or remove those
  checks; full-candidate acceptance remains open until a valid in-scope
  resolution exists. The unit-domain stage's additional `test:domain`
  requirement is also distinct from proof that `test:unit` still executes.
- **WP6d hardening follow-ups** (review items c–e in Baseline Evidence) are
  not started here. Recommended owner: a short WP6d.1 record-and-fix
  increment after WP6f, or WP6f's checklist if it dispatches a new matrix:
  (c) summary validator measured-probe direction and `testBodyTime` vs
  `reports[]`; (d) one lease-suite test that requires a parseable alive
  observation from the real probe on each platform; (e) omission CLI
  callback throws instead of writing a PASS receipt.
- **Recovery:** a failed hosted run or invalid artifact invalidates that
  candidate only — repair causally, commit, re-freeze; retained evidence is
  never edited. Resume an interrupted publication from its exact recorded
  prior/new states; preserve ambiguous files. Reverting the schedule is a
  further amendment restoring prior input and policy bytes, rendering the
  prior manifest, and appending a new entry. Never truncate the audit chain.

## Progress and Evidence

- 2026-09-04 — Resume inspected `da8f6c9` and the retained post-commit
  closeout at `artifacts/wp6e-entry-20260904/closeout/`. The Windows retry
  exited zero with 727 passing cases; `windows-final-audit-2` and
  `hosted-record-audit` underpin the checkpoint closeout. The latter records
  all five successful jobs on exact record commit `da8f6c9`, run
  `33938071620`. The older Next Action is stale on those completed items.
  Tracked files were clean on entry; the protected untracked roadmap remains
  untouched. Continue Steps 1–2 as one compatible implementation increment:
  historical statistics validation must bind the retained candidate/source
  while the new receipt identifies the validating checkout; source schedule
  validation, descriptor and Git-anchored ledger, durable interrupted-publication
  rejection/recovery, and planner timeout/subsumption support land with v1
  still active. Use focused production-boundary regressions, then all six
  broad checks on the exact source snapshot before committing. The frozen
  measurement identities, active v1 files, existing scripts, and protected
  authorities remain unchanged during preparation. Candidate PASS is still
  unavailable through the literal placeholder scripts; no substitute result
  or scope reduction is authorized by this implementation plan.

- 2026-09-04 — The complete Linux precommit set passed at
  `/tmp/wp6e-yVASGa/p`, and source validation confirmed exactly the 21
  intended changed/new files with unchanged captured bytes. Its 101-file
  export at `C:/w/wp6e-linux-projection-evidence` has ZIP SHA-256
  `183d13f7632df5016ca8ea2e34e8e8135bf80af8ab6e0ae9ae8f325657d3b387`.
  `audit-linux-precommit-evidence-2.ts` independently passed: 11 Linux
  command/child receipts, all declared artifacts, 15 executable/schema/test
  source hashes, 727 full-unit and 711 orchestrator identities, exactly 19
  classified additions with no lost baseline identity, all 12 same-context
  projections, 23 protected files, and preserved historical log bytes.
  The receipt is
  `artifacts/wp6e-entry-20260904/linux-precommit-audit-2/result.json`.
  That audit additionally validated the complete serial Windows orchestrator
  receipt at `C:/w/wp6e-p-orchestrator-3/artifacts/a/`: 711/711 passed with
  exact Linux identity equality. Windows full unit began at
  `C:/w/wp6e-p-unit-3` after that success and remains pending at this record.
- 2026-09-04 — Correction to the earlier focused diagnostic claims: its raw
  report observed five passing selected cases, but its command-owned receipt
  declared a zero-byte `stderr.log`, which the production validator rejects.
  It is invalid and cannot support a passing-command claim. The first Linux
  precommit audit failed on this defect; its procedure and log remain intact.
  The separately named `audit-linux-precommit-evidence-2.ts` explicitly
  rejects that receipt and uses the valid, complete Windows orchestrator
  receipt instead. No retained receipt or empty stream was changed. Actual
  Doctor/Status CLI receipts were independently checked and remain valid.
  The unexecuted final Windows audit was updated to reject the malformed
  optional diagnostic as well; all broad gates remain required.
- 2026-09-04 — Add a complete exact-runtime Linux precommit cohort in an
  isolated clone under `/tmp/wp6e-yVASGa/`, while the serial Windows cohort
  continues unchanged. The active Windows orchestrator run is executing
  workspace-cleanup recovery, with no leftover verification processes from
  earlier attempts. This is a host/sequencing choice for the same six
  required commands, not a changed test surface, deadline, or passing
  interpretation. A complete independently validated Linux set may establish
  the precommit gate; actual Windows verification and all five exact-commit
  hosted jobs remain required before closing this increment. Retain all
  earlier failures and the running Windows evidence separately.
- 2026-09-04 — Actual `pnpm loop:doctor` and `pnpm loop:status` executions
  in `C:/w/wp6e-p-typecheck-4` exposed identical valid four-tier projections
  and left Git working-tree status unchanged. The production CLI proof and
  owned receipt are in `artifacts/cli/`; the retained procedure is
  `artifacts/wp6e-entry-20260904/verify-projection-cli.ts`. Overall Doctor
  remains `blocked`; this proof validates projection propagation without
  relabeling the inherited readiness gaps. The final independent audit
  includes both complete CLI reports and compares their projections with
  the production inspection and pinned baseline context. The serial
  corrected-source typecheck, lint, formatting, and five invariant commands
  have passed; the orchestrator suite is still running before full unit.
- 2026-09-04 — Hosted-evidence preparation verified the connected GitHub
  artifact download path against baseline trusted-container artifact
  `9773926944`, whose downloaded ZIP SHA-256 is
  `d6bae7236b3ad15a4b6fef5543a0439452b5837781240acc73cd22cbcdb6ad3b`.
  The probe is retained at `C:/w/wp6e-download-probe-ac4-oci.zip`.
  `artifacts/wp6e-entry-20260904/audit-hosted-evidence.ts` is prepared but
  unexecuted; it requires the future pushed commit, all five successful jobs,
  digest-verified archives, all controller/adopter receipts and artifacts,
  exact test-identity equality, and expected real Docker outcomes. Fetch
  full job metadata through the GitHub fetch API (`jobs?per_page=100`), since
  the compact jobs wrapper omits the head SHA and job URL. No new commit,
  push, or hosted result is claimed by this preparation.
- 2026-09-04 — The isolated five-case Windows diagnosis at `C:/w/wp6e-f5`
  passed all five selected identities with original test and hook limits;
  its 49 filtered-out cases remain explicitly unverified by that diagnostic.
  The receipt, raw report, verbose output, and selected-case proof are in
  `artifacts/windows-failed-cases/`. This supports resource contention as a
  possible explanation for the earlier timeouts, but does not establish a
  complete broad-suite PASS. The required six commands now run serially via
  `artifacts/wp6e-entry-20260904/run-projection-final-serial.ps1`, in separate
  `C:/w/wp6e-p-{typecheck,lint,format}-4` and
  `C:/w/wp6e-p-{invariants,orchestrator,unit}-3` clones. Each keeps its owned
  receipts under `artifacts/a`, with outer `command.log` and `command.exit.txt`.
  The final audit now names this cohort and compares all 15 changed
  executable, schema, catalogue, and test files, including the corrected
  ownership assertion. It separately validates the five-case diagnostic
  without counting its filtered-out cases as passing.
- 2026-09-04 — Both packaging-inclusive Windows broad runs finished with
  five failures and no passing receipt: orchestrator observed 706/711 passing
  tests, and full unit observed 722/727. The same canonical ownership test
  expected the pre-addition file counts; its exact assertions now require
  81 controller files and 85 total files, accounting for the new classified
  regression file without changing the owner set or removing a test. The
  other four failures are the uninterrupted candidate-prepare case, two
  atomic state-persistence cases, and the remaining-boundaries target
  integration recovery case. Their durations exceed their existing limits;
  timeout/resource contention is a hypothesis, not yet a demonstrated cause.
  The failed reports remain in
  `C:/w/wp6e-projection-{orchestrator,unit}-2/artifacts/`. A fresh short clone,
  `C:/w/wp6e-f5`, executes exactly those five identities with verbose and JSON
  reporters through `artifacts/wp6e-entry-20260904/diagnose-windows-failures.ts`.
  No competing Windows verification suite is running, and original test and
  hook deadlines are unchanged. Filtered-out cases remain unverified by this
  diagnostic. Fresh broad runs must follow serially after diagnosis; none of
  the failed, stopped, or earlier source snapshots satisfies that gate.
- 2026-09-04 — The short-path Linux shadow and independent inventory audit
  passed. The audited root-unit inventory is the executed fast/migration
  union, matched to root-unit discovery: 708 identities. Candidate-before
  executes 1,368 observations over 708 unique identities, with 660 duplicated
  identities. The four owner sets are disjoint and contain 709 identities;
  exactly one is additional to root unit, the OCI fixture case. All 18
  mandatory/workspace rows preserve their prior coverage; the two fast-only
  direct mappings add the 32 migration identities as planned. Raw reports,
  receipts, both Linux attempts, and procedures were exported without changing
  file bytes. The downloaded archive is
  `C:/w/wp6e-linux-baseline-evidence.zip`, SHA-256
  `2f6e9ee93ae66b76f4e9dbdecf39bd39c749a474e42e0136d74f8c56e0b5e367`
  (836,086 bytes, 443 files), safely extracted at
  `C:/w/wp6e-linux-baseline-evidence`. Its inventory audit artifact SHA-256 is
  `b0a55f87500620728475238ae22a54bf70153af9f83bcd1af29faf250d33e16a`.
  The separate short-path trusted-container fixture probe also passed its
  one test and produced a receipt. The duplicate Windows retry at `C:/w/e6b`
  was intentionally stopped after this complete Linux baseline pin; its
  identified process tree was terminated, follow-up inspection found no
  remaining owned Node processes, and its shell recorded exit 1. It remains
  incomplete, with no passing shadow claim. The two required Windows
  development regression suites were not interrupted. Full-candidate
  acceptance remains blocked by the independently recorded inherited
  prerequisites.
- 2026-09-04 — The first Linux shadow also exited 1, at the final
  `trusted-container-fixture` launcher after all three legacy suites and
  the controller/repository/adopter partitions had passed. `tsx` could not
  create its 111-byte Unix socket path and reported `listen EINVAL` before
  the final partition's tests started. The original command log, ERROR
  manifest, and all earlier child receipts remain under the clone's
  `artifacts/wp6e-step0/shadow/`; no aggregate PASS is claimed.
  `run-remote-baseline-retry.sh` reruns the unchanged literal command with
  the shorter `artifacts/s` directory (the corresponding socket path is
  95 bytes), followed by `audit-inventories-retry.ts`. Its log and exit
  record are `artifacts/wp6e-step0/shadow-retry.log` and `retry.exit.txt`.
  No source, tests, Git configuration, or deadline was changed. The exporter
  keeps the first attempt as `failed-shadow/` and the retry as `shadow/`,
  with explicit source-to-archive path mappings and unchanged file bytes.
- 2026-09-04 — A second independent baseline execution uses the configured
  Linux host `codex.lab`, in the isolated clean clone
  `/tmp/wp6e-yVASGa/b` at `ac4e9a2`. No repository source was changed there.
  The task-local Node `24.18.0` archive was verified against the official
  SHASUMS256 file (archive SHA-256
  `55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742`);
  pnpm is exactly `11.15.1`. Preparation, execution, and export procedures
  are retained under the working repository's
  `artifacts/wp6e-entry-20260904/`. Doctor and planner captures completed;
  all five invariant commands passed. The shadow run has passing receipts
  for legacy-fast and migrations and is still executing. Its independent
  inventory audit is scheduled in the same runner after shadow success.
  A separately receipted Windows-side comparison at
  `artifacts/wp6e-entry-20260904/platform-plan-audit/` already confirms all
  twelve actual planner projections and all three changed-path contexts
  exactly equal between the clean Linux and original Windows baselines.
  The final audit expects a hash-verified export at
  `C:/w/wp6e-linux-baseline-evidence`; it revalidates every baseline receipt
  and raw report, mapping only the original absolute repository prefix in
  memory for cross-platform normalization. The Windows retry and final
  Windows regression suites remain running; none is relabeled as passing.
- 2026-09-04 — The first baseline shadow at `C:/w/wp6e-baseline-1`
  exited 1 in legacy-fast: 666/676 tests passed and ten failed across
  commissioning and workspace recovery fixtures. It produced an ERROR
  manifest and no passing receipt; later shadow children did not execute.
  All logs and the raw report remain intact. A retained recovery fixture's
  266-character branch-ref path reproduces normal Git lookup exit 128;
  the same ref bytes resolve the expected parent commit with the read-only
  per-command `-c core.longpaths=true` option. The executed diagnostic and
  its receipt are under `artifacts/wp6e-step0/path-diagnosis/`, with procedure
  `diagnose-path-length.ts` beside that directory. This proves one failure's
  path-length cause, not resolution of all ten failures or a shadow PASS.
  The unchanged clean baseline is retrying at the much shorter `C:/w/e6b`
  root with `LOOP_VERIFY_COMMAND_ARTIFACT_DIR=artifacts/s`, preserving the
  literal shadow command, scripts, tests, Git defaults, and timeout limits.
  Its outer log and exit record are `artifacts/shadow.{log,exit.txt}`.
  Use the new `audit-inventories-retry.ts` procedure in the original baseline
  clone when the retry completes; it explicitly validates invariant evidence
  from the original clone and shadow evidence from the shorter clone, both
  at `ac4e9a2`. Baseline inventory acceptance remains open. The original
  prepared audit was not executed and was not rewritten.
- 2026-09-04 — The packaging-inclusive snapshot passed the eight adopter
  tests at `C:/w/wp6e-projection-focused-3`, with its command-owned receipt
  and raw-report SHA-256
  `3dddaac3fe289b9193b94712495388d7d6330c520ebb31199c5f6798c80f5f05`.
  Final typecheck, lint, and formatting passed in separate
  `C:/w/wp6e-projection-{typecheck,lint,format}-3` clones. All five invariant
  commands passed at `C:/w/wp6e-projection-invariants-2`; the existing
  advisory warm target was missed and is not claimed as met. Fresh full
  orchestrator and unit executions are running in
  `C:/w/wp6e-projection-{orchestrator,unit}-2`. The prepared independent
  audit is `artifacts/wp6e-entry-20260904/audit-final-evidence.ts` in the
  working repository; it requires the complete final receipts and the
  baseline inventory audit before it can pass. Git's configured credential
  helper passed a non-mutating `git push --dry-run origin master`; the
  unauthenticated `gh` CLI is not an available evidence path by itself.
- 2026-09-04 — Packaging review found the new schema also needed in
  `adopter-package.ts`'s explicit runtime-file list. The generator now copies
  it unchanged; the adopter regression checks exact bytes, schema validation
  of all four projections, and absence of source identity leakage. Its
  focused run is at `C:/w/wp6e-projection-focused-3` (pending). The prior
  controller and full-unit runs in `wp6e-projection-{orchestrator,unit}-1`
  were intentionally terminated after this source change and exited 1;
  they are retained as superseded/incomplete, never passing evidence.
  A taskkill race initially reported three descendants already exiting; a
  follow-up process inspection confirmed all identified processes absent.
  Fresh full runs are required after the packaging check. The current
  invariant run at `wp6e-projection-invariants-1` did pass all five commands
  before this packaging-only change. The preliminary independent audit at
  `wp6e-projection-focused-2/artifacts/evidence-audit-preliminary/` validated
  ten focused/static/invariant receipts and every declared artifact and
  executable source hash for that earlier snapshot. It explicitly excludes
  the incomplete broad set. No baseline shadow execution was interrupted.
- 2026-09-04 — The first Step 1 implementation adds
  `schedule-projection.ts` and its strict published schema, exposes ordered
  command definitions through commissioning Doctor v2 and Status, and keeps
  the existing focused-command count semantics. All active scheduling files
  and package scripts remain unchanged. Nineteen new projection/evaluator
  regressions are classified under the existing `controller-runtime` owner.
  The initial focused run at `C:/w/wp6e-projection-focused-1` passed the 42
  commissioning/Doctor/Status tests and three projection tests, but 14
  projection schema checks failed because the independent evaluator rejected
  `prefixItems`; that failed run is retained. The test-only evaluator now
  implements positional prefix and tail-item validation without suppressing
  unknown keywords. The affected rerun at
  `C:/w/wp6e-projection-focused-2/artifacts/wp6e-projection-focused/` passed
  61/61 tests (19 projection/evaluator and 42 configuration-schema cases),
  with a command-owned receipt and raw-report SHA-256
  `5751c069752b8ff604defe32d235e8770d7c01906b66b18f247963496dfc0484`.
  `artifacts/compare-plans.ts` in that clone executed all twelve same-context
  projections and confirmed exact ordered command equality to the clean
  baseline; `artifacts/projection-comparison.json` records the dirty
  development identity honestly. Typecheck, lint, and format passed on the
  current source in separate `C:/w/wp6e-projection-{typecheck,lint,format}-2`
  clones. Those are pre-packaging source observations; the newer entry above
  records their successor disposition. Commit and hosted verification have
  not yet run.
- 2026-09-04 — Continuation reproduced the baseline in the clean clone
  `C:/w/wp6e-baseline-1` at `ac4e9a2`, using Node `24.18.0` and pnpm
  `11.15.1`. Initial user-owned plan/log bytes were preserved under
  `artifacts/wp6e-entry-20260904/`; all three protected hashes still match.
  Preflight evidence is under the clone's `artifacts/wp6e-step0/preflight/`:
  dependencies and architecture exit 1; build exits 2 with the missing
  production-build declaration. Doctor exits 0 but reports `blocked`, with
  valid commissioning and three blocks (build, placeholders, missing Docker).
  Literal `pnpm verify:candidate` exits 3 with `ERROR` at
  `artifacts/verification-tiers/verification-tier-candidate-20260904212802252-18692-c6e01282/tier-result.json`;
  the trusted execution provider is unavailable before invariant execution.
  No fallback provider was used. Full-candidate acceptance remains unresolved.
  All five standalone invariant commands passed with a command-owned receipt
  at `artifacts/wp6e-step0/invariants/result.json`. Executed planner captures
  for commissioning, package-change, and default CLI contexts, their exact
  inputs, and procedure are retained in `artifacts/wp6e-step0/tier-plans.json`
  and `capture-plans.ts`. The default CLI context additionally selects three
  domain checks; it cannot use the fixed commissioning fixture's diff.
  The same clean clone's shadow execution is still pending; no test-identity
  equality is claimed from these preliminary results.
- 2026-09-01 — Plan drafted from repository inspection at `ac4e9a2`; no
  repository mutation beyond this file. Awaiting Step 0 confirmation.
- 2026-09-04 — Maintainer approved the reviewed recommendation. The Step 0
  decision is now recorded; the active plan specifies the scoped timeout,
  compatible descriptor/publication transition, anchored audit chain,
  explicit scope-policy matrix, and invariant-guarded subsumption. Read-only
  inspection also corrected missing doctor check IDs, the selector's broad
  legacy addition, baseline-versus-final counts, and the unit-stage identity;
  inherited candidate prerequisites are explicitly unresolved. This is a
  plan/decision revision only. No baseline execution, amendment implementation,
  candidate proof, or new hosted result is claimed.
  Documentation checks passed: `git diff --check`; a read-only Node audit
  proved all pre-existing decision/autonomy-log bytes and the three protected
  hashes unchanged and restricted tracked changes to this plan and those
  two logs. The documentation changes remain uncommitted.

## Next Action

The projection checkpoint is closed on `da8f6c9`, with exact-record-commit
hosted run `33938071620` and the retained closeout receipt under
`artifacts/wp6e-entry-20260904/closeout/`. Do not repeat its completed retry
or record commit.

Compatible Steps 1–2 are implemented with the active v1 input, policy, and
manifest unchanged. The separately prepared source-v2 descriptor is
`tools/milestone-orchestrator/config/wp6e-partition-amendment.json`.
Source snapshot 5 passed 236 focused tests and the complete six-command
Linux cohort (768 orchestrator / 784 unit tests). Independent source and
artifact verification is retained under
`artifacts/wp6e-amendment-dev/precommit-audit/`; it validates all 11 receipts,
preserves the prior 727-test inventory, classifies the 57 additions, and
checks every protected surface. Earlier failed reports remain retained.
Inspect the final diff and commit only the compatible infrastructure,
descriptor, regressions, and records.
Then push normally and require all five protected exact-runtime jobs on that
commit before any subsequent push can cancel that gate.

From a clean clone of the compatible commit, run the committed descriptor
through `pnpm loop:commission:amend -- --descriptor
 tools/milestone-orchestrator/config/wp6e-partition-amendment.json`. The CLI
must produce a valid amendment receipt and commissioning Doctor PASS, while
full Doctor retains its separate readiness disposition. Continue Steps 3–7,
including clean candidate and unit-domain attempts, full shadow/inventory
proof, mutation evidence, and exact-commit hosted verification. Validate the
retained historical statistics through the repaired CLI on both platforms.
Do not infer a candidate PASS from focused, shadow, or hosted controller tests.
The placeholder scripts, missing production-build declaration, and unavailable
configured trusted execution remain the recorded full-candidate prerequisites;
no scope reduction or substitute passing result is authorized.
