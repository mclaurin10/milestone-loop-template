# Current Execution Plan

**Status:** WP5e complete and independently audited; cohesive commit pending
**Updated:** 2026-08-16
**Owner:** autonomous loop

## Objective

Complete one cohesive WP5 increment that adds an exact Node `24.18.0` and pnpm
`11.15.1` GitHub Actions path for the controller on Linux and Windows, a
separate fresh-adopter smoke path, and a Linux-only real Docker execution of the
existing trusted-container matrix. The workflow must retain command-owned
receipts and artifacts and must make platform scope visible.

This increment adds CI orchestration and CI-specific validation only. It does
not change controller, configuration, invariant, provider, state, recovery,
commissioning, readiness, verifier-completion, product-domain, or performance
semantics. It does not rerun or reinterpret the completed WP4d proof and does
not claim hosted jobs passed before GitHub executes them.

## Goal Constraints

- Preserve `PROJECT_GOAL.md`, the immutable acceptance suite and lock, the
  hidden-validation protocol, active and historical commissioning, the
  permanent readiness marker, exact verifier stage/profile/completion rules,
  Doctor schema `2.0.0`, Status schema `1.0.0`, invariant IDs and meanings,
  runtime/schema parity, all supported configuration migrations, examples,
  and completed evidence.
- Preserve `package.json`, the workspace package manifest, `pnpm-lock.yaml`,
  and all package-script identities. CI-only tools must run through existing
  pinned dependencies and public package commands.
- The cross-platform job must execute the real receipt-owning invariant,
  orchestrator, unit, typecheck, lint, and format commands serially on both a
  supported Linux runner and a supported Windows runner. Evidence directories
  must be unique and uploaded per platform.
- CI must explicitly install and assert Node `24.18.0` and pnpm `11.15.1`; a
  floating major runtime or package-manager version is not sufficient.
- The fresh-adopter smoke must use the real public package-creation boundary,
  install the generated repository from the frozen lock, run meaningful
  generated receipt-owning checks, independently validate their receipts and
  artifacts, and retain a structured summary. It remains a smoke, not the
  completed WP4d bootstrap proof: no source no-argument `pnpm verify`, browser
  proof, commissioning transition, or completion claim.
- A trusted-container CI job is applicable only on a Linux runner with a real
  reachable Docker Engine. It must invoke the existing
  `pnpm test:oci-container` normal/adversarial matrix and retain its result; no
  mock, Dockerfile-only check, or structural assertion may stand in for that
  job.
- Local checks may validate workflow YAML, exact commands, the Windows smoke,
  and any locally available real boundary. They cannot establish that hosted
  Linux, Windows, artifact-upload, or Docker jobs passed.
- Use the repository-pinned Windows toolchain through
  `.tools/node-v24.18.0-win-x64/corepack.cmd`, with that Node directory first on
  `PATH`. Run long suites separately and serially.
- Do not run a source no-argument `pnpm verify` or the completed
  `loop:template:prove` WP4d proof. Run the OCI matrix only if the owning Linux
  Docker boundary is genuinely available; otherwise record the limitation and
  leave local OCI execution unverified.
- Never edit, stage, move, delete, re-encode, clean, or otherwise mutate the
  protected user-owned untracked
  `Implementation-ready improvement plan 8-5-26.txt`.

## Baseline Evidence

- Entry branch is `master`, HEAD
  `dc475ea807f477c8c8ad818def6ee98318844708`, tree
  `dbea9c3f77aa65e20ca4c5e081edf72d51aa275c`, and parent
  `5290dd96796a79014961a9aa65859f6ba547d3cd`. Tracked and staged trees are
  clean; the protected plan is the sole untracked path. Contrary to the
  historical handoff expectation, local `origin/master` already equals HEAD,
  so repository-authoritative divergence is `0 behind / 0 ahead` without a
  fetch, push, or ref mutation.
- The protected plan is 78,574 bytes with raw SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  no-filter blob `9890a3cdd5288708a04102d27ff6fce9f0ebb90b`, and
  path-filtered blob `d0abdd24f404d9dc335818c355e39f7cfc531300`.
- Retained WP4d proof
  `artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` is 2,424 bytes
  with SHA-256
  `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`.
  Retained source result
  `artifacts/verify-2026-08-16T082128-760Z-17384/result.json` is 44,372 bytes
  with SHA-256
  `1ca139e2a995c117b87e07de04707cde1de5bf7a2e4ea6ffce38ba605d8564d0`.
- A repository and tracked-tree search found no `.github/workflows` directory
  and therefore no hosted Linux/Windows, fresh-adopter, or OCI job. The newest
  WP5d autonomy record names this exact-runtime CI slice as the next remaining
  dependency-ordered WP5 work.
- Current Windows aggregates intentionally skip the two POSIX process-group
  supervisor cases whose comments name first execution in WP5 Linux CI.
  Earlier state/lease/workspace/integration records likewise identify native
  Linux race coverage as outstanding.
- The existing real boundaries are available without semantic changes:
  `loop:template:create` creates a Git-anchored adopter through the public CLI;
  generated bootstrap typecheck/unit commands write receipts; and
  `pnpm test:oci-container -- --output artifacts/<fresh-id>` runs the real
  Linux Docker normal/adversarial matrix with exact toolchain/image policy and
  managed-resource cleanup assertions.

## Steps

1. [x] Complete the resume protocol, authority/plan/log review, entry and
       protected identity audit, and reproduce the CI gap by proving the
       tracked tree contains no workflow.
2. [x] Replace the mechanically stale completed WP5d plan with this bounded
       WP5e executable plan before substantial implementation.
3. [x] Add one least-privilege GitHub Actions workflow plus a deterministic
       regression contract that parses its YAML and pins triggers, action
       boundaries, exact toolchains, Linux/Windows matrix entries, serial
       receipt-owning commands, unique evidence roots, and artifact retention.
4. [x] Add and test a CI-specific fresh-adopter smoke coordinator that invokes
       the public creator in a disposable directory, performs a frozen offline
       copy-mode install, runs generated typecheck and unit checks, validates
       every child receipt/artifact identity, writes a structured result, and
       proves source tracked identity is unchanged.
5. [x] Add the fresh-adopter Linux/Windows matrix and a separate Linux Docker
       job that executes the existing real trusted-container matrix. Ensure
       neither path can be mistaken for source verification completion or the
       retained WP4d proof.
6. [x] Document the workflow's scope, evidence, exact pins, and local-versus-
       hosted evidence boundary. Record the durable CI decision without
       changing canonical product/readiness meanings.
7. [x] Freeze the implementation and run focused
       receipt-owning workflow/smoke tests, the new Windows smoke,
       `test:invariants`, `test:orchestrator`,
       `test:unit`, typecheck, lint, and format serially. Run real OCI locally
       only if a Linux Docker controller is genuinely available.
8. [x] Independently audit receipts, artifact bytes/hashes, tests/failures/
       skips, diffs, workflow commands, protected/retained identities,
       immutable authority, commissioning/readiness/verifier/Doctor/Status/
       invariant/example/package/lock identities, and private state/lease
       absence. Update this plan and the autonomy log, stage only explicit
       paths, create exactly one cohesive commit, and do not push.

## Acceptance Criteria

- One syntactically parseable workflow has `contents: read` permissions and
  pull-request, branch-push, and manual triggers. Regression coverage rejects
  missing/floating toolchain pins, missing platforms, command substitution,
  evidence-root reuse, no-argument source verification, WP4d proof invocation,
  or a non-Linux/mock OCI path.
- Linux and Windows controller jobs install and assert exact Node `24.18.0`
  and pnpm `11.15.1`, install with the frozen lock, and separately execute the
  real receipt-owning invariant, orchestrator, unit, typecheck, lint, and
  format commands with uploaded evidence. Hosted execution status is not
  inferred from local tests.
- The Linux job reaches the POSIX supervisor tests instead of carrying the two
  Windows skips. Existing real Git/filesystem/race/config/schema tests run
  through the unchanged aggregates on both platforms.
- The CI fresh-adopter smoke is distinct from WP4d and proves public creation,
  generated frozen installation, generated strict typecheck, generated unit
  behavior, command-owned receipts, independent artifact hashes, clean Git
  state, bootstrap profile, and absence of readiness activation. Its result is
  explicitly completion-ineligible and autonomous-readiness-ineligible.
- The trusted-container job runs only on Linux, verifies a real Docker Engine,
  and invokes the complete existing normal/adversarial matrix. It uploads the
  real OCI result and cannot pass by checking only YAML, Dockerfiles, mocks, or
  unit tests.
- No package dependency, lockfile, package script, runtime/config/schema,
  controller/provider, state/recovery, verifier/profile/completion, Doctor,
  Status, invariant registry, example, commissioning, or readiness identity
  changes.
- Focused receipt-owning checks, the applicable broad suites, and static checks
  pass locally with only the two declared Windows POSIX skips. Every cited
  local receipt and artifact identity is independently verified.

## Verification

All local commands run separately and serially under the pinned Windows Node
directory and its `corepack.cmd` pnpm `11.15.1` entrypoint.

Implementation diagnostics:

1. Focused Vitest for workflow contract, smoke option/result/receipt logic, and
   affected adopter-package paths.
2. Prettier YAML parse/format validation and exact workflow contract probes.
3. One real CI smoke execution on Windows using a fresh evidence directory.
4. Focused typecheck/lint/format while the coordinator stabilizes.

Final frozen-tree commands:

1. Receipt-owning affected Vitest shard through
   `tools/run-tool-evidence.mjs invariant-vitest` with a fresh explicit final
   evidence directory.
2. The CI fresh-adopter smoke through its real CLI with a fresh explicit final
   output directory; independently validate its summary and nested receipts.
3. `pnpm test:invariants`, `pnpm test:orchestrator`, and `pnpm test:unit`, each
   serially with a fresh explicit command-owned evidence directory.
4. Receipt-owning `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`, each
   with a separate fresh explicit evidence directory.
5. If and only if a real Linux Docker controller is locally available, run the
   exact workflow OCI command into a fresh output and audit it. A Windows host,
   Dockerfile validation, or unit test is not credited as OCI execution.
6. Independent receipt/artifact byte/SHA-256 and test-count audit; workflow
   exact-command audit; `git diff --check`; `git diff --cached --check`; staged
   path review; and all protected/immutable/retained/private-state identity
   checks.
7. One commit without push, then HEAD/tree/parent/divergence/status and
   protected-plan identity re-audit.

Evidence invalidation:

- Any workflow, CI helper, fresh-adopter runtime inventory, or related test
  change invalidates focused workflow/smoke evidence.
- Any controller/config/invariant source change invalidates the corresponding
  aggregate and is out of scope unless the plan is first revised.
- Any provider/container implementation change invalidates the existing OCI
  boundary and expands beyond this CI-only increment; stop and revise rather
  than silently broadening.
- Record-only plan/log/doc changes after semantic tests require static and diff
  reinspection. Freeze all tracked files before final receipts.

## Risks and Recovery

- A workflow can be locally parseable yet fail from hosted-runner or action
  behavior. Contract tests establish intended structure only; hosted jobs stay
  explicitly unverified until their actual run URLs/results exist.
- GitHub runner labels are hosted environment selectors, not OS-image digests.
  Exact Node/pnpm assertions close the required runtime boundary; the workflow
  records runner OS/image metadata with the uploaded evidence for diagnosis.
- The source pnpm store must be populated before the generated adopter's
  offline install. The smoke installs the source first, uses copy mode, and
  fails rather than falling back to an unpinned or mutable dependency graph.
- Docker availability on GitHub's Linux runner is an external premise. The OCI
  job probes the real engine and fails if unavailable; it never converts
  unavailability into a skip or mock success.
- Recovery is an ordinary revert of this one CI-only commit. No push,
  recommissioning, state mutation, readiness transition, external credentials,
  history rewrite, or destructive repository cleanup is required.

## Progress and Evidence

- 2026-08-16: Required authority, plan standard, completed WP5d plan, newest
  autonomy/decision entries, audit roadmap, README container contract, current
  package commands, adopter creator/proof boundary, receipt owner, and OCI
  matrix entrypoint were inspected before editing.
- 2026-08-16: Entry HEAD/tree/parent and all three protected-plan identities
  matched the handoff. The remote-tracking ref has advanced locally to HEAD, so
  actual divergence is `0/0`, not the handoff's historical `0/1`.
- 2026-08-16: `Test-Path .github/workflows` was false and a tracked search
  found no workflow. This reproduces the exact-runtime CI gap without rerunning
  completed WP4d or any source no-argument verifier.
- 2026-08-16: Added the least-privilege three-job workflow with full-SHA action
  pins, exact runtime installation/assertion, Linux/Windows controller and
  fresh-adopter matrices, unique uploaded evidence roots, and a separate
  Linux-only real Docker matrix. The focused workflow/smoke tests passed 4/4;
  deliberate runtime, platform, command, evidence-root, OCI, and no-argument-
  verify mutations all failed the contract validator. Focused TypeScript and
  ESLint checks passed.
- 2026-08-16: The first test invocation exposed that root `tools/**/*.test.ts`
  is outside the configured inventory, so the two tests moved under the
  orchestrator-owned test tree before acceptance. The first two real smoke
  attempts then exposed an unavailable `npm_execpath` under `pnpm exec` and a
  pnpm-11 literal `--` forwarding difference. The coordinator now resolves
  bundled Corepack cross-platform and invokes the public creator without that
  extra argument. The accepted Windows diagnostic smoke passed two receipts,
  two artifacts totaling 2,982 bytes, and 4/4 generated tests with zero
  failures/skips; its 3,443-byte summary has SHA-256
  `fe3c7cbc77bcffa437e3b1b5b77d7110be978c96978f961989b2898f3365f3ce`.
  The standalone toolchain probe also confirmed Node `v24.18.0` and pnpm
  `11.15.1`. These are local Windows results only.
- 2026-08-16: The first final orchestrator aggregate was correctly non-passing:
  565/583 passed, 16 failed, and the two Windows skips remained. All 16
  failures shared one cause: placing helpers at `tools/ci` matched the existing
  `tools/*` workspace pattern, so the package graph required a nonexistent
  `tools/ci/package.json`. The failed 217,558-byte report is retained at
  `artifacts/manual/wp5e-orchestrator-final/orchestrator-report.json` with
  SHA-256
  `352a6e226586c5cfee9b99fa67542951bd853f904985589d60dfea2fa1deff4d`;
  it is not passing evidence. Helpers moved inside the existing
  `tools/milestone-orchestrator/ci` package, preserving package/lock/script
  identities. Package-graph, affected-scope, tier, benchmark, workflow, and
  smoke regression tests then passed 41/41 across 6/6 files. All earlier
  focused/smoke evidence that names the old helper paths is invalidated and
  will be replaced before the broad retry.
- 2026-08-16: Accepted final evidence on the relocated frozen tree passed:
  focused 45/45 with zero skips, fresh-adopter smoke 4/4 with two independently
  checked receipts, four invariant commands, orchestrator 581/583 with exactly
  two Windows POSIX skips, unit 594/596 with the same skips, and receipt-owning
  typecheck/lint/format. The independent audit matched 13 PASS receipts to 13
  declared artifacts totaling 474,113 bytes and confirmed every recorded
  report hash/count. Hosted Linux, Windows, artifact upload, and real Docker
  jobs were not executed locally and remain explicitly unverified.
- 2026-08-16: Final scope/identity audit matched 63/63 critical tracked files
  to entry HEAD, including frozen authority, immutable lock, commissioning,
  readiness, verifier, Doctor `2.0.0`, Status `1.0.0`, invariant/config/schema,
  example, fresh-adopter, and package/lock surfaces. Both retained WP4d
  artifacts and all three protected-plan identities matched; private state and
  lease refs/paths remained absent; divergence remained `0/0`;
  `git diff --check` passed. The only changed/untracked paths other than the
  protected plan are the 11 explicit WP5e plan/workflow/helper/test/doc/log
  paths.

## Next Action

Stage only the 11 explicit WP5e paths, run cached diff/scope checks, and create
the single cohesive commit without pushing.
