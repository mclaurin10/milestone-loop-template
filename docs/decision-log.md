# Decision Log

Record durable or costly-to-reverse decisions: date, decision, alternatives
considered, rationale, and affected files. Newest first.

## 2026-08-24 — Four-boundary canonical test ownership (WP6a)

**Decision.** The source test universe has four allowlisted ownership ids:
`controller-runtime`, `repository-tooling`, `adopter-template`, and
`trusted-container-fixture`. The tracked
`tools/milestone-orchestrator/config/test-ownership.json` catalogue lists every
test path explicitly under exactly one owner. Owner ids remain code-allowlisted
rather than self-declared by the catalogue, so a typo or invented partition
cannot become valid metadata.

Discovery is independently executable. The ownership gate enumerates every
tracked or unignored `vitest.config.*`, runs Vitest's own file-list operation
twice for each config, separately repeats the orchestrator command filter, and
normalizes absolute results to sorted forward-slash repository paths. It also
reconciles the root package scripts, active commissioned test commands,
existing fast/migration candidate discovery, direct invariant test selection,
the OCI fixture command, and the executable exact-runtime workflow contract.
Exact overlap between root and nested adopter-template discovery is retained as
provenance; duplicate entries, case-fold collisions, changed repeated sets, or
entry-point drift are ambiguous and fail closed.

The gate is a fifth receipt-owning child of the existing invariant suite. A
PASS owns `test-ownership-report`; a classification failure retains the report
and emits no receipt. WP6a does not feed the catalogue into fast, migration,
orchestrator, unit, OCI, generated-adopter, tier, or exact-closure execution.
Disjoint executors and shadow equivalence remain WP6b1 work, and a later
commissioned-manifest cutover remains separate.

**Why.** The prior slow-suite registry explicitly named one migration file but
assigned every other discovered file to fast by subtraction. A new test was
therefore automatically classified and could not fail closed. Four owners are
the smallest defensible current taxonomy: controller tests share one source
runtime; the production-build owner is the root-unit remainder excluded by the
orchestrator command; adopter tests are source templates also executed after
generation; and the OCI case runs under a separate config and trusted-container
boundary. Merging any of the latter three into the controller majority would
hide a current execution responsibility. Splitting controller tests by
speculative timing or future executor shape was rejected until WP6
measurements exist.

**Affected files.** The ownership catalogue and gate/CLI/tests, invariant
registry and owner expectation, `README.md`, `CONTRACT.md`, config guidance,
and WP6a plan/log records. Package scripts, exact-runtime workflow, active
verification manifest, commissioning identity, slow-suite executor registry,
and benchmark implementation are unchanged.

## 2026-08-24 — Canonical candidate recovery and reproducible derived evidence (WP2 Session 2, verified)

**Decision.** State schema `1.11.0` completes the intent-first
`candidate-prepare` boundary. An exact unchanged `intent-persisted` operation
may resume by publishing invocation-start before entering the Worker gateway.
Invocation-start, thread-recorded, and gateway-return interruptions are
deliberately non-replayable: they become a preserved
`worker-outcome-ambiguous` block. Canonical Worker completion now retains the
redacted final-response bytes and digest as well as the deterministic
Worker-turn digest. Missing Worker-turn and checkpoint evidence can therefore
be materialized from canonical state; conflicting bytes can never authorize
progress. Every evidence ancestor and file is revalidated as a real,
contained, non-linked canonical path before read or publication. Unowned
pre-intent evidence blocks candidate preparation with a retained diagnostic.
Legacy `1.10.0` candidate completion that lacks response bytes migrates to
`legacy-worker-evidence-unrecoverable` rather than trusting an artifact or
inventing content.

Normal and recovered paths use the same candidate reducers. Recovery runs
under the repository controller lease and state-generation CAS; synchronized
contenders may produce only one advancing hook sequence, controller commit,
artifact authority, verification transition, and intent completion. The
state mirror remains diagnostic: failure after canonical ref publication does
not roll back authority and is repaired only by a later mutation-capable open.
Status, Doctor, and static inspection expose the same phase,
classification/disposition, preserved paths, and next safe action without
repair or recovery.

An exact successor published by a mutation-capable state store after immutable-
field transition validation and canonical compare-and-swap is treated as an
inductively validated lineage step in that store. It is not re-read from the
object database immediately after publication. Fresh and read-only/mutation
opens still validate the complete pending-operation lineage from the current
generation to its recorded input generation. This preserves the same Git-ref
CAS authority and tamper checks while avoiding quadratic revalidation across
the candidate operation's explicit durable phases.

Verification owners remain substantive on every supported host. Process-tree
tests exercise Windows `taskkill` tree termination as well as POSIX process-
group SIGKILL rather than reporting platform skips. Expensive commissioning
negative cases may share one disposable repository only when they execute
sequentially and independently restore the exact base under test; both missing
and unrelated-base rejections remain required. Neither portability nor fixture
cost is a reason to increase timeouts, skip behavior, or weaken assertions.

The fail-closed workspace identity boundary is expressed as facts, not as a
required subprocess topology. Once a real contained standalone `.git`
directory is proven, top-level/Git/common directory and branch may be queried
together; the six exact local controller markers may be queried together only
with missing/duplicate detection; remote absence remains explicit; and active
operation markers are checked directly under that proven `.git` directory.
This preserves every recovery classification while avoiding dozens of Windows
process startups at each candidate phase.

**Why.** Hash-only Worker completion could detect a missing derived artifact
but could not reconstruct it, while replay after any possible gateway entry
could duplicate unobservable Worker effects. Retaining the already-redacted
canonical response closes the former gap; drawing the replay boundary before
invocation-start closes the latter. Exact path, Git, protected-file,
diff-policy, context, parent, tree, message, and artifact validation makes the
operation intent—not ancestry or evidence files—the only authority for
checkpoint adoption. Alternatives rejected: a generic workflow engine, a
second journal, trusting Worker events or artifacts, relaunching after an
ambiguous gateway boundary, silently adopting an existing candidate, resetting
or recommitting a suspicious tree, following linked evidence, and migrating
legacy hashes as if the missing response bytes were known. Also rejected:
removing durable phases, weakening fresh-open lineage validation, increasing
test timeouts, or treating a timed-out broad run as passing; the redundant
same-store post-CAS rewalk was the performance defect.

**Scope boundary.** The green Session 2 ledger and cohesive commit close only
the previously omitted WP2 candidate recovery boundary. They do not
change Planner/Worker/Reviewer roles, execution-provider eligibility,
verification, target integration, cleanup, retention, readiness, CAL-1,
hidden validation, product completion, or human-acceptance meaning, and it
does not begin WP6.

**Affected files.** Candidate contracts/runtime and shipped schemas, state
migration/store, operation reducers, Worker orchestration and fault hooks,
status/Doctor/static inspection projections, hard-loss/concurrency/path/Git/
context tests, `README.md`, `CONTRACT.md`, and Session 2 plan/autonomy records.

## 2026-08-23 — Intent-first candidate checkpoint authority (WP2 Session 1)

**Decision.** State schema `1.10.0` extends the one exclusive
`pendingOperation` union with a strict `candidate-prepare` intent. The
controller publishes it by canonical state CAS before the Worker gateway can
mutate the isolated candidate. It pins the exact input generation/revision,
run/milestone/attempt, repository and standalone workspace identity, starting
candidate, Worker assignment/policy/thread lineage, retry/proposal/protected
context, prompt, accounting baseline, evidence paths, phases, and recovery
policy. Invocation, thread, completion, checkpoint plan/result/evidence, block,
and completion transitions are pure bounded reducers guarded by the global
unrelated-mutation fence.

After durable Worker completion, the controller validates protected bytes and
diff policy, stages the exact worktree, and records the authorized parent,
tree, message, and path set before creating a checkpoint commit. Leased restart
adopts only the exact clean commit matching that authorization and completes
through the same reducer as the uninterrupted path. Worker events,
`worker-turn.json`, and `controller-checkpoint.json` are derived evidence, not
authority. A clean or dirty candidate without matching intent never enters
verification; it is classified external/ambiguous and the existing cleanup
operation is explicitly directed to preserve it even when ordinary failed-
workspace policy would delete it. Status and Doctor inspect the same operation
read-only.

**Why.** The previous controller committed candidate output before recording
checkpoint state and then treated any clean descendant with no retry feedback
as interrupted controller work. A crash and an otherwise valid out-of-band
commit were therefore observationally identical and both advanced directly to
verification. Intent-first ordering makes ownership durable before mutation,
while exact parent/tree/message and context validation distinguishes the one
authorized post-commit result without resetting or rewriting suspicious work.
Alternatives rejected: descendant ancestry as ownership, Worker/checkpoint
artifacts as authority, a second journal, publishing intent only immediately
before the Git commit, replaying the Worker after an ambiguous result,
recommitting an observed tree, deleting or quarantining unowned output, and
separate normal/recovery completion mutations.

**Scope boundary.** This decision establishes only the Session 1 central path
and two critical authority cases. The remaining crash/adversarial matrix starts
with loss immediately after intent publication and remains required before
`candidate-prepare` or WP2 can close. It does not begin WP6 or change
verification, integration, readiness, CAL-1, or human-acceptance meaning.

**Affected files.** State contracts/runtime and shipped schemas/store
migration, `operation-intent.ts`, `candidate-prepare.ts`, Git-isolation commit
helpers, orchestrator Worker/startup/cleanup routing, status and Doctor
projections, candidate and existing-operation recovery tests, `README.md`,
`CONTRACT.md`, and Session 1 plan/autonomy records.

## 2026-08-23 — Production-build unit fixtures own exact pnpm stores

**Decision.** Every production-build unit fixture creates an empty real
versioned pnpm store inside its disposable parent and supplies that exact path
through canonical `pnpm_config_store_dir` to both direct and spawned fixture
executions. Test helpers remove conflicting case variants before entry and
restore the complete prior environment afterward. Production store discovery,
existence validation, offline preparation, and reporting remain unchanged.

**Why.** Exact runtime run `32660428700` proves both real generated-adopter
production builds pass, but nine Windows unit fixtures fail before their owned
assertions because a new hosted runner has no ambient
`C:\Users\runneradmin\AppData\Local\pnpm\store\v11`. The same fixtures pass
locally only because that machine-default store already exists. A fixture must
own every filesystem precondition it exercises. Alternatives rejected: weaken
or remove the production existing-store guard, create an ambient user store,
skip the Windows assertions, seed a global CI-only path, or special-case GitHub
Actions.

**Affected files.** `tools/production-build.test.mjs` and the WP5 execution/
autonomy records.

## 2026-08-23 — Matrix-specific outer controller timebox

**Decision.** Exact runtime CI retains a 60-minute outer timeout for the Linux
controller and assigns 120 minutes to the Windows controller through an
explicit matrix field. All six controller commands, their order, evidence
roots, internal supervisor limits, per-test limits, unconditional upload, and
success criteria remain unchanged. The executable workflow contract requires
both platform-specific values and rejects collapsing Windows back to 60.

**Why.** In run `32651184672`, Windows invariants and the 597-test controller
suite passed, then the outer 60-minute job clock cancelled the complete unit
suite after only 28 minutes. The unit command retained an ERROR manifest with
no receipt and later static steps were skipped. The same unchanged complete
unit command passed 612 tests with two declared Windows-only POSIX skips under
exact Node/pnpm locally, but required about 57 minutes by itself. Setup,
invariants, controller, unit, and statics therefore cannot reliably fit the
old Windows outer bound. Alternatives rejected: weakening or removing either
test command, increasing per-test limits, splitting or conditionally skipping
coverage, accepting cancellation, giving Linux unnecessary extra time, or
rerunning the unchanged failing SHA as though cancellation were unexplained.

**Affected files.** `.github/workflows/exact-runtime-ci.yml`, the executable
workflow contract and its tests, `CONTRACT.md`, and `README.md`.

## 2026-08-23 — Source-store pinning across production-build clone volumes

**Decision.** Before creating its disposable clone, production-build evidence
asks the currently pinned pnpm for `store path` from the exact clean source
repository. Discovery must succeed and emit exactly one absolute path naming an
existing real directory. The wrapper then supplies that exact path through
`--store-dir` on the clone's frozen offline copy-mode install. The build report
records both store discovery and the explicitly pinned preparation command, and
bounded stdout/stderr is included when either subprocess fails. The
fresh-adopter coordinator carries its already validated source-store identity
through every generated-repository command as pnpm's
`pnpm_config_store_dir`; it removes conflicting case variants first and retains
the explicit install argv in the public command ledger.

**Why.** Windows Exact runtime CI checks out the source on `D:` while Node's
temporary directory is on `C:`. The generated adopter install correctly seeded
and used `D:\.pnpm-store\v11`, but the nested production-build install omitted
that identity and let pnpm select a different volume-local default store for
the `C:` clone. Offline preparation therefore failed despite the required
packages already existing in the proven source store. Store identity is an
input to an offline build and must cross the disposable-clone boundary
explicitly. Alternatives rejected: enabling network access, copying installed
`node_modules`, relying on ambient/global pnpm configuration, hydrating a
second implicit store, forcing the temporary root onto the checkout volume, or
relabeling the hosted failure as infrastructure.

**Affected files.** `tools/production-build.mjs`, its focused tests,
the fresh-adopter CI coordinator and tests, `CONTRACT.md`, and the
generated-adopter description in `README.md`.

## 2026-08-22 — Current Node 24 official actions with immutable pins (WP5 Session 2)

**Decision.** The Exact runtime workflow allowlists and uses these official
stable releases, each exactly once per controller, fresh-adopter, and
trusted-container job:

- [`actions/checkout` v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
  at commit `3d3c42e5aac5ba805825da76410c181273ba90b1`; the exact
  [`action.yml`](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml)
  declares `runs.using: node24`.
- [`actions/setup-node` v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
  at commit `820762786026740c76f36085b0efc47a31fe5020`; the exact
  [`action.yml`](https://github.com/actions/setup-node/blob/820762786026740c76f36085b0efc47a31fe5020/action.yml)
  declares `runs.using: node24`.
- [`actions/upload-artifact` v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)
  at commit `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`; the exact
  [`action.yml`](https://github.com/actions/upload-artifact/blob/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/action.yml)
  declares `runs.using: node24`.

The releases were selected from each official repository's `releases/latest`
record on 2026-08-22. Resolution then read the official `git/ref/tags/<tag>`
object and would follow a returned annotated `tag` object through
`git/tags/<sha>.object` until reaching the commit. All three selected refs
currently returned `type: commit`, so the listed 40-character values are their
direct commit targets rather than tag-object IDs. Runtime proof was read from
`action.yml` at those commits, not inferred from the release number or moving
major tag. The executable workflow contract owns this exact release/comment/
SHA allowlist, requires three global and one per-job occurrences, and rejects
every other action reference even if it is a full SHA.

**Migration facts and disposition.** Checkout first moved to Node 24 in the
official [v5.0.0 notes](https://github.com/actions/checkout/releases/tag/v5.0.0),
which require Actions Runner `v2.327.1` or newer. Checkout
[v6.0.0](https://github.com/actions/checkout/releases/tag/v6.0.0) moved
persisted credentials to a separate runner-temp file; this workflow retains
`persist-credentials: false`, so no credential persistence is adopted.
Checkout [v7.0.0](https://github.com/actions/checkout/releases/tag/v7.0.0)
migrated to ESM and blocks unsafe fork checkout for `pull_request_target` and
`workflow_run`; this workflow uses `pull_request`, `push`, and manual dispatch,
so its scheduling meaning is unchanged.

Setup-node's official
[v5.0.0 notes](https://github.com/actions/setup-node/releases/tag/v5.0.0)
likewise establish Node 24 and Runner `v2.327.1`, while adding automatic cache
detection. The [v6.0.0 notes](https://github.com/actions/setup-node/releases/tag/v6.0.0)
limit automatic caching to npm. This workflow supplies no cache input and its
package manager is pnpm, so no dependency cache or trust-boundary change is
introduced. v7 migrates the action to ESM, adds cache-key outputs, removes a
dummy `NODE_AUTH_TOKEN`, and updates dependencies; none alters the exact
`node-version: 24.18.0` / `check-latest: false` inputs used here.

Upload-artifact's official
[v6.0.0 notes](https://github.com/actions/upload-artifact/releases/tag/v6.0.0)
are the first to state that the action runs on Node 24 by default and requires
Runner `v2.327.1`; v5's preliminary support still defaulted to Node 20. The
[v7.0.0 notes](https://github.com/actions/upload-artifact/releases/tag/v7.0.0)
add optional direct single-file upload via `archive: false` and migrate to ESM.
This workflow retains default archive behavior for directory evidence,
`if: always()`, `if-no-files-found: error`, unique platform roots, and 14-day
retention, so the optional direct-upload behavior is not selected.

**Why.** The previous checkout v4.2.2, setup-node v4.4.0, and upload-artifact
v4.6.2 metadata declared Node 20; hosted logs warned that GitHub was forcing
those actions onto Node 24. Current official Node 24 metadata removes that
runtime ambiguity while immutable commit pins preserve the existing
supply-chain policy. Alternatives rejected: keeping Node 20 metadata and
depending on forced-runtime compatibility; pinning mutable major or release
tags; using short SHAs; selecting versions from third-party summaries;
assuming a major version implies Node 24; mixing releases across jobs; adding
an action outside the exact three-action inventory; or changing application
Node/pnpm pins, workflow permissions, checkout history/credentials, scheduling,
or evidence upload semantics as part of this migration.

**Affected files.** Exact-runtime workflow; executable workflow allowlist and
mutation tests; Session 2 execution plan, autonomy log, and this decision
record. Hosted execution of the frozen candidate remains Session 3 work.

## 2026-08-22 — Producer-owned canonical OCI export staging root (WP5q)

**Decision.** The trusted-container executor canonicalizes its own freshly
created artifact-export staging root exactly once with
`realpath(await mkdtemp(...))`, before deriving evidence/workspace staging
children or passing them to strict artifact inventory and publication. The
container-executor test fixture applies the same rule to its controlled fresh
root before deriving its mocked pnpm store and clone paths. Retained assertions
require both the fixture root and the executor-provided evidence staging path to
already have stable realpath identity.

Caller-provided pnpm stores, disposable clone paths, artifact destinations,
mount inputs, and pre-existing filesystem objects are not normalized. Existing
ordinary-directory, no-link, exact-realpath, containment, artifact-limit,
cleanup, OCI-policy, and process-supervision guards remain unchanged.

**Why.** Hosted Windows supplies a valid NTFS 8.3 spelling beneath TEMP while
`fs.promises.realpath()` expands it. The raw test fixture therefore stopped all
eight lifecycle cases at the strict pnpm-store mount guard. After that controlled
fixture was canonicalized, six cases reached their intended outcomes, while the
normal and timeout cases exposed the executor's independently created raw export
root at the strict artifact-inventory boundary. A direct observation recorded
that staging path as noncanonical. Canonicalizing each producer-owned fresh root
at creation preserves fail-closed consumer semantics and makes every derived
path use one identity on Windows and POSIX.

Alternatives rejected: normalizing arbitrary inputs inside the mount or artifact
guards; accepting equivalent NTFS aliases; comparing case-insensitively;
globally overriding or canonicalizing TEMP; changing container/artifact cleanup
or publication; special-casing Windows; and leaving the production staging root
dependent on the caller's temp spelling.

**Affected files.** `container-executor.ts`, its focused test, execution plan,
autonomy log, and this decision record. `container-artifacts.ts`, verification
clone, Git isolation, schema/state, process supervision, OCI policy, package,
lock, and workflow owners are unchanged.

## 2026-08-17 — Source-bound pnpm store for fresh-adopter smoke (WP5j)

**Decision.** The fresh-adopter coordinator resolves `pnpm store path` once
through its already pinned pnpm invocation with the source repository as the
working directory. It accepts exactly one non-empty absolute path, requires
that path to be an existing directory, and supplies it explicitly as
`--store-dir` to the generated repository's install. The child remains
`--offline --frozen-lockfile --package-import-method=copy`; no fallback or
network retry exists. The smoke result records only an
`explicit-source-store` disposition and SHA-256 of the host path, while the
command-owned ignored log retains the diagnostic path itself.

**Why.** On hosted Windows the source checkout is on `D:` and the generated
repository is created under the `C:` user temporary directory. pnpm selects a
drive-local store, so the source frozen install hydrated all 138 packages on
`D:` while the generated offline install selected an empty `C:` store and
failed on `@eslint/js@10.0.1`. Linux used one filesystem and passed. Resolving
from the exact source cwd binds the child to the dependency closure that the
preceding source install actually hydrated, independent of the generated
repository's volume, without weakening its offline boundary.

Alternatives rejected: enabling child network access or retry; duplicating
dependency hydration; adding/changing package or lock inputs; relying on a warm
runner cache; moving the generated repository merely to inherit a drive;
setting a second workflow-owned store path that could drift from coordinator
behavior; copying or linking the store; or retaining the host path in cleartext
inside the durable smoke result.

**Affected files.** Fresh-adopter CI smoke coordinator and focused regression
tests; execution plan, autonomy log, and this decision record. The workflow
command itself is unchanged.

## 2026-08-17 — Git-archived scratch hydration for OCI fixture closure (WP5i)

**Decision.** The trusted-container controller hydrates its existing pnpm store
from an exact `git archive HEAD:fixtures/oci-candidate` extracted into a
`mktemp` directory. The fetch runs there exactly once with
`--ignore-workspace` and `--frozen-lockfile`, after the root frozen install and
before the unchanged real Docker matrix, and the scratch directory is removed
on exit. The executable workflow contract pins the complete archive/fetch/
cleanup script and ordering, not merely the presence of a generic `pnpm fetch`.

The controller remains the only networked party. The candidate still runs an
offline/frozen/store-integrity install with denied networking and a read-only
store mount. Fixture/package/lock bytes, the candidate command, provider,
normal/adversarial cases, containment policy, and source-identity modes do not
change.

**Why.** A root frozen install populated Vite `8.2.0`, but the separately
locked OCI fixture required `8.2.1`, so hosted normal-case startup failed with
`ERR_PNPM_NO_OFFLINE_TARBALL`. Fetching from the fixture directory closes that
graph, but pnpm `11.15.1` also byte-normalizes the fixture YAML despite
`--frozen-lockfile`; doing so in the checkout would dirty the exact source that
the next step must attest. The Git archive supplies committed fixture bytes,
avoids parent-workspace discovery, confines normalization to disposable state,
and populates the same controller default store already selected by the root
install and OCI executor.

Alternatives rejected: adding Vite `8.2.1` or the entire fixture graph to the
root package/lock; changing the protected fixture lock to Vite `8.2.0`;
allowing candidate network access; making the store mount writable; restoring
the tracked lock after mutating it; accepting a dirty controller checkout;
using the root workspace graph; relying on a warm runner cache; or weakening
offline/frozen/store-integrity enforcement.

**Affected files.** Exact-runtime workflow; executable workflow contract and
mutation tests; execution plan, autonomy log, and this decision record.

## 2026-08-17 — Dual-mode OCI controller-source identity (WP5h)

**Decision.** The real OCI matrix accepts exactly two explicit tracked-source
states. A clean checkout is `committed-head` and binds its candidate tree to
`HEAD^{tree}`. A locally frozen implementation candidate is `frozen-index` and
binds its candidate tree to `git write-tree`, together with exact HEAD/tree,
staged path count, and a deterministic staged-path digest. Both modes reject
any unstaged tracked change before image creation. OCI result schema `1.1.0`
records this generic `controllerSource` identity instead of WP3d's
milestone-only `controllerCandidate` shape.

The OCI product harness no longer names, requires, or hashes the user-owned
`Implementation-ready improvement plan 8-5-26.txt`. That file remains guarded
by the outer autonomous-work protocol. Unrelated untracked content likewise
does not manufacture a candidate tree; the matrix identity is the exact Git
tracked source plus the installed lockfile-bound toolchain.

**Why.** GitHub Actions checks out the exact committed tree with an empty
index. Treating that valid state as `The WP3d candidate index is empty` stopped
the hosted job before every normal/adversarial case, while fabricating a staged
change would make the evidence dishonest. Retaining the staged mode is still
necessary for pre-commit real-container verification of an exact frozen
candidate. Making the modes explicit preserves both workflows without a CI
environment branch or a dirty-tree bypass. Alternatives rejected: staging a
sentinel in CI, weakening the parser, special-casing `GITHUB_ACTIONS`, requiring
the local human file in distributed/adopter repositories, silently placing a
committed tree in fields named as staged evidence, accepting unstaged tracked
content, or removing pre-commit OCI verification.

**Affected files.** OCI controller-source identity owner and real-Git tests;
real OCI matrix entry/report schema; execution plan and autonomy log.

## 2026-08-16 — Exact-runtime cross-platform CI boundaries (WP5e)

**Decision.** The source repository has one least-privilege GitHub Actions
workflow with three deliberately separate diagnostic boundaries. The controller
matrix runs the unchanged receipt-owning invariant, orchestrator, unit,
typecheck, lint, and format commands serially on `ubuntu-24.04` and
`windows-2022`. Every job installs and asserts exact Node `24.18.0` and pnpm
`11.15.1`; all external actions are pinned to full release commit SHAs, and
platform-specific evidence roots are uploaded.

The fresh-adopter matrix is a CI smoke, not another bootstrap proof. It invokes
the public creator, performs a frozen offline copy-mode install, runs the
generated typecheck and four-test unit boundary, independently validates both
command receipts plus every declared artifact size/hash, verifies clean
two-commit bootstrap history and absent readiness activation, and labels its
result completion-ineligible. It does not commission, launch a browser, run
source or generated no-argument verification, or supersede retained WP4d
evidence. The trusted-container job is Linux-only and must reach a real Docker
Engine before invoking the existing complete normal/adversarial OCI matrix; no
mock or structural assertion substitutes for execution.

The checked-in workflow contract parses the YAML and mutation-tests runtime,
platform, command, evidence-root, OCI, and completion boundaries. It proves
local structure only. Hosted Linux, Windows, artifact-upload, and Docker status
remain unverified until GitHub actually executes them, and even a green hosted
run is diagnostic rather than autonomous-readiness evidence.

**Why.** Prior Windows evidence left the two POSIX supervisor cases and the
Linux Git/filesystem/race paths unexecuted, while the repository contained no
workflow at all. Separate jobs make ordinary cross-platform regression,
distributor smoke, and privileged Docker prerequisites independently visible
and prevent an unavailable engine from being mislabeled as controller
coverage. Alternatives rejected: one opaque aggregate job, floating Node/pnpm
or action tags, changing package scripts/dependencies for CI, rerunning the
costly WP4d no-argument/browser proof on every change, treating YAML tests as
hosted evidence, mocking Docker, running the OCI owner from a Windows
controller, or allowing CI status to authorize integration.

**Affected files.** Exact-runtime workflow; CI toolchain assertion,
fresh-adopter coordinator, workflow/receipt regression tests; README,
repository contract, execution plan, and autonomy log.

## 2026-08-16 — Current-config schema and differential parity boundary (WP5d)

**Decision.** Publish the current `OrchestratorConfig` contract as strict JSON
Schema 2020-12 artifact `orchestrator-config.schema.json` at version `1.6.0`.
It references, rather than copies, the separately versioned strict
`model-policy.schema.json`; generated adopter packages carry both schemas and
must validate their generated config against them. The model-policy schema is
aligned with existing runtime semantics for non-whitespace override reasons
and at most one override per role.

One shared named corpus is the executable parity boundary. Each current-input
case is parsed through the real read-only runtime loader and independently
evaluated against the shipped schemas, with both expected disposition and
runtime/schema equality required. Closed property/required inventories and the
mandatory protected floor also receive structural equality assertions. A
test-only dependency-free evaluator implements only the 2020-12 keywords used
by these schemas, resolves local/external references, and fails on every
unsupported keyword. It is not runtime configuration authority and is not
packaged into adopters.

The JSON Schema is current-input-only. Existing runtime migration remains the
sole authority for legacy `1.0.0` through `1.5.0` input, and runtime validation
remains stricter for installation-, repository-, and cross-field-dependent
facts that portable JSON Schema cannot express, such as requiring the selected
authority path itself in `protectedPaths`. The raw placeholder template remains
invalid until generation/substitution; it is not mislabeled as a current valid
configuration.

**Why.** Unknown-root rejection already existed in runtime, but adopters had no
corresponding top-level schema and tests only proved selected schema files were
parseable. Duplicating the model-policy shape inside a new config schema would
create immediate drift, while replacing runtime parsing with JSON Schema would
lose migration and repository semantics. The frozen package graph exposes no
declared 2020-12 validator; its only Ajv is an undeclared ESLint transitive at
version 6, which demonstrably predates `minContains` and misinterprets the
duplicate-role constraints. Alternatives rejected: adding a dependency and
changing package/lock files, importing transitive Ajv internals, applying the
current schema directly to legacy bytes, loosening runtime checks for schema
equivalence, duplicating model policy, accepting boolean equality without
expected outcomes, silently ignoring unsupported schema keywords, or omitting
the schemas from generated adopters.

**Affected files.** Current config and model-policy schemas; dependency-free
schema test evaluator; differential corpus and schema/adopter tests; adopter
runtime inventory; configuration guide, repository contract, execution plan,
and autonomy log.

## 2026-08-16 — Shared contract-integrity owner and ineligible adapter (WP5c)

**Decision.** The 13 ordered `contract-integrity` checks have one
controller-owned implementation in `src/contract-integrity.ts`. The module is
plain-Node-loadable: it accepts the existing commissioned-authority-anchor
validator as an explicit dependency, so `scripts/verify.mjs` can import the
same evaluator directly under pinned Node while controller commands consume it
through `tsx`. The authoritative verifier still selects and aggregates stages
exactly as before; only its former inline check body moved.

The invariant registry's `protected-integrity` entry now calls a narrow
`verification-cli.ts contract-integrity` adapter instead of a focused
`pnpm verify`. The adapter requires the exact healthy check identity and all
PASS statuses, retains `contract-integrity-report.v1`, and writes a
command-owned receipt only after success. The report always states
`completionEligible:false`; the outer invariant-suite report advances to
`1.1.0` to state the same. Failure retains the diagnostic and no PASS receipt.
The verification CLI loads the full tier implementation only after selecting
a tier mode, so the contract adapter does not require the Codex SDK or other
unrelated tier dependencies merely to start.
Source and generated-adopter registries use the same argv, owner path, and
artifact kind without adding a package script or changing their commissioned
registry IDs.

**Why.** Focused verifier selection deliberately includes `environment`, so
using it as an invariant made correct contract checks depend on unrelated
dependency, placeholder, production, and runtime wiring. Duplicating the
checks in the controller would let invariant and exact verification meanings
drift. A shared evaluator preserves one authority, while the separate evidence
adapter gives fast corruption feedback without creating a second completion
path. Alternatives rejected: changing focused verifier stage selection,
special-casing environment success, retaining the aggregate wrapper, copying
the 13 checks into the invariant suite, accepting exit zero without a receipt,
making the adapter completion-eligible, adding a public package command, or
rerunning the completed WP4d adopter proof merely to refresh evidence.

**Affected files.** Shared contract evaluator/tests/export; authoritative
verifier import; invariant adapter/report/CLI/tests; source/template/generated
invariant registries; aggregate verifier fixture dependency; README,
configuration guide, repository contract, execution plan, and autonomy log.

## 2026-08-16 — Generation-bound canonical lifecycle status (WP5b)

**Decision.** `pnpm loop:status -- --json` emits one versioned
`orchestrator-status` schema `1.0.0` for uninitialized, ordinary initialized,
pending-operation, target-drift, and active-reconciliation states. CLI status
runs before reconciliation-controller opening, so an active reconciliation is
reported through the common observational contract rather than replacing it
with the narrower `reconcile-status` shape or creating a mutation capability.

Status composes two existing authorities. Accepted Doctor schema `2.0.0` owns
commissioning/profile, operational issues, provider identity, exact-result
integrity/currentness, eligibility, lease, and earliest safe next action.
Validated canonical state and existing operation inspectors own detailed
controller state, pending side effects/recovery, latest completed milestone,
exact-verification provenance, cleanup, and reconciliation. Status never
searches artifact directories or treats prose logs as state.

Target relation names target-branch HEAD as the subject: `ahead` means target
descends from the stored verified commit, `behind` means verified descends
from target, and `divergent` means neither; `current`, `uninitialized`, and
fail-closed `unavailable` are distinct. Recovery is normalized as `automatic`
for an inspector-owned resume, `blocked` for manual reconciliation,
`external` for reconciliation/history drift, and `none` when no recovery is
recorded. Git ancestry inspection is optional-lock-suppressed.

Doctor and detailed state must name the same canonical generation. When valid
commissioning aligns the branch sources, Doctor, checkout, and target-ref HEAD
must also agree. Status retries movement once, then reports
`changed-during-inspection`, suppresses the detailed state projection and
integration eligibility, and returns only a status-rerun action. This prevents
an individually valid Doctor observation and state generation from being
combined into a false current-integration claim.

**Why.** The prior status omitted commissioning, relation, exact evidence,
eligibility, recovery disposition, and a next command, while active
reconciliation silently changed schemas. Copying Doctor or reimplementing its
checks would create a competing readiness definition; relying only on raw
state would omit provider/evidence integrity; sampling both without a
generation/target fence could produce an internally inconsistent resume
surface. Alternatives rejected: expanding `ReconciliationStatusSummary`,
calling the mutation-capable reconciliation controller, artifact-directory
discovery, log-derived completion, a binary target-drift flag, inverted or
ambiguous ahead/behind labels, and presenting stale state after a race.

**Affected files.** New status contract/tests/export, CLI status routing,
README and contract guidance, active plan, autonomy/decision records.

## 2026-08-16 — Versioned read-only operational Doctor and strict blocker gate (WP5a)

**Decision.** Operational Doctor schema `2.0.0` uses only `pass`, `warning`,
and `block` check severities and derives top-level `ready` solely from the
absence of blocks. Every non-pass check becomes an ordered issue with a stable
code, remediation, and optional safe command. `nextAction` follows the earliest
block; if that block requires manual repair, it directs the operator back to
strict Doctor after repair instead of skipping ahead to a later executable
action. With no blocks, it selects the earliest actionable warning or the
canonical state's permitted action.

Ordinary Doctor remains an inspectable exit-zero command even when it reports
`blocked`. The Doctor-only `--strict` flag prints the identical complete JSON,
then exits 2 when any block exists; warnings alone exit zero but keep
autonomous integration ineligible. Other loop commands reject `--strict`
before repository mutation.

Doctor projects existing read-only authorities rather than creating parallel
success definitions: commissioning/tier construction, production-build
declaration, structural configuration, exact installed SDK, provider
capability and identity, canonical state and pending-operation recovery,
protected roots and stored identities, lease ownership, authentication, and
Git identity. The normal config loader still enforces installed-SDK
compatibility; a narrow inspection loader lets Doctor report structural config
and installed state separately. Exact evidence is state-owned, hash-checked,
realpath-contained, current, readiness-only, and bound to the active
completion-eligible provider identity. Protected drift is a separate blocker
so it cannot hide a simultaneous recovery operation.

**Why.** The prior coarse `pass/attention` output could not serve as an
operational gate, omitted material package/path/evidence facts, and rejected
strict mode before diagnosis. Running verification from Doctor would be slow,
mutating, and circular; guessing the latest artifact directory would bypass
canonical state; coupling structural config to installed dependencies would
hide the actual failure; and treating every first-run warning as a block would
prevent safe initialization. Alternatives rejected: warnings authorizing
integration, strict mode suppressing JSON, a generic strict flag for mutating
commands, following linked paths, probing an unconfigured container provider,
repairing state or paths, or choosing a later actionable blocker over an
earlier manual one.

**Affected files.** Doctor/CLI/config inspection source and tests, three
read-only recovery consumers, `README.md`, `CONTRACT.md`, the active execution
plan, and autonomy/decision logs.

## 2026-08-15 — Git-anchored fresh-adopter bootstrap package (WP4d)

**Decision.** Distribute the loop through a strict
`milestone-loop-adopter-package.v1` definition and the no-clobber
`pnpm loop:template:create -- --definition <file> --output <absent-directory>`
command. The creator copies only an allowlisted runtime plus a minimal real
bootstrap scaffold, generates adopter-owned authority lock/config/registries/
package metadata, initializes the requested attached branch with fixed local
Git identity and timestamps, commits the authority base, then commits a
commissioning input bound to that exact strict ancestor. It never copies or
deletes the source readiness lifecycle, active commissioning, history, or
historical example.

The verifier and commissioning now share one Git-base authority anchor. The
active v2 manifest's base must be a strict ancestor containing byte-identical
immutable-lock and four-authority-file content; the candidate lock must pass
its own schema, lifecycle, and hash checks. Adopter-specific acceptance shape
is derived from the frozen base while universal exact-command, bootstrap/
readiness, no-compensation, hidden-custody, and one-way lifecycle rules remain
in verifier code. No adopter edits a verifier hash constant or hard-coded
acceptance counts.

The generated bootstrap owns one deterministic kernel used by Node, replay,
the production Worker, persistence, and rendered UI. Real static checks,
Vitest, clean-clone production build, save/load continuation, Worker parity,
desktop Chromium interaction, diagnostics, screenshot, and command receipts
are required. The separate `loop:template:prove` command performs an offline
frozen copy-mode install, explicit commissioning and manifest commit, exactly
one literal no-argument verifier run, and an independent hash/receipt/identity
audit. Its PASS is fixed to `bootstrap_complete`, remains provider-ineligible,
and is never autonomous-readiness-equivalent.

**Why.** Copying the source tree leaked commissioned readiness history and
required manual removal and source edits. Pinning an adopter hash in verifier
source made a generic distributable impossible, while a mutable unanchored lock
would weaken authority. The already-required strict ancestor is a durable,
reviewable trust root that preserves fail-closed calibration behavior without a
new protected file. Alternatives rejected: whole-repository copying, deleting
the readiness marker in copied history, regenerating the lock without a Git
anchor, embedding fixture hashes or project ids in verifier source, automatic
commissioning, no-op bootstrap scripts, DOM-only browser evidence, and treating
bootstrap as readiness.

**Affected files.** Shared authority anchor and commissioning/verifier tests;
adopter package/proof commands and tests; fresh-adopter definition/authority;
bootstrap scaffold and evidence tools; package/lockfile/static coverage;
adoption, contract, config, plan, and autonomy documentation.

## 2026-08-15 — Self-validating legacy worked-example package (WP4c)

**Decision.** Keep the Ski Tycoon files at their existing
`examples/ski-tycoon/` location and preserve all six JSON payloads byte-for-byte.
A sibling `worked-example.v1` descriptor now names the exact package file set,
source and template-introduction commits, legacy-only/inactive semantics,
per-file provenance disposition, roles, byte counts, SHA-256 values, paths, and
cross-file identities. `pnpm loop:example:validate -- --descriptor <file>` is
the only supported inspection route. It requires an explicitly supplied,
contained, regular, tracked descriptor; rejects missing, extra, linked,
untracked, drifted, malformed, or incoherent payloads; validates every strict
schema and legacy registry/check/protected link; and emits deterministic static
results without executing, migrating, commissioning, or rewriting the example.

The benchmark matrix, slow-suite registry, and scope policy remain labeled as
unchanged source snapshots. The orchestrator config, invariant suite, and
legacy manifest are labeled maintained compatibility adapters because they
received post-extraction trust-boundary updates. Active configuration keeps no
example identity: the source slow-suite registry is renamed to
`milestone-loop-explicit-migration-suites.v1`, while the example retains its
historical D-032 ID and the benchmark template uses an adopter placeholder.

**Why.** The WP4 source plan already requires the historical configuration at
the location it occupies, so a move or rewrite would add risk without closing a
gap. The actual gap was that the directory's README misstated provenance and
schema age, and only one file had a purpose-limited loader test; no boundary
proved the package as a coherent, non-active whole. A separate pinned
descriptor preserves recoverability and makes later drift explicit without
turning legacy v1 into an active fallback. Alternatives rejected: moving the
directory, converting its manifest to v2 (would erase historical semantics),
loading it through active config, executing unavailable historical commits,
or relying on documentation and ad hoc tests without byte identities.

**Affected files.** Worked-example descriptor/validator/CLI/tests and export,
package command, active slow-suite ID, benchmark template, example/root/config
documentation, `CONTRACT.md`, and WP4c plan/logs.

## 2026-08-15 — Deterministic one-shot commissioning (WP4b)

**Decision.** A repository creates its active generic v2 verification manifest
only through `pnpm loop:commission -- --input <file>`. The strict, explicit
input binds the target branch, strict-ancestor base, package-default profile,
current config/registry paths and identities, immutable-lock hash, canonical
protected floor, focused catalogue, literal exact command, and generic
reconciliation minimum. Commissioning is deliberately one-shot: the active
path must be absent and the attached target-branch checkout must be clean of
both tracked and untracked changes. Readiness additionally requires the
permanent marker to exist at or before the base and at the candidate;
bootstrap rejects any marker tree or history.

Generated `createdAt` is the base commit's canonical Git timestamp. The command
validates existing authority hashes, immutable-lock lifecycle and verifier
anchor, package scripts, all registry identities, protected coverage, and all
four tier plans; it never creates or repairs authority. It writes an exclusive
temporary file, verifies exact bytes and SHA-256, rechecks Git identity and
status, creates the absent destination with a no-clobber filesystem link, and
runs a strict read-only commissioning doctor. Failure cleans the owned stage;
after publication it may remove only the exact inode and hash it just created.
Every generated path, byte count, and SHA-256 is printed.

The source repository is commissioned on `master` from WP4a commit
`0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5` with its existing readiness
lifecycle. Only the active registry ids become generic
`milestone-loop-core-invariants.v1` and
`milestone-loop-shadow-scope-policy.v1`; explicit historical v1 records retain
their legacy identity. Because the protected human plan intentionally makes
the source checkout unclean, the workflow ran in a clean temporary clone of
the exact candidate and only its independently matched deterministic manifest
bytes returned to the source tree.

**Why.** Commissioning is a trust transition, so accepting hand-authored
output, wall-clock metadata, a dirty-tree exception, branch inference,
overwrite-style rename, silent authority repair, or implicit historical
fallback would make provenance ambiguous. A single absent-file publication
boundary permits deterministic output and exact rollback ownership without a
multi-file transaction.

**Affected files.** Commissioning contract/CLI/tests, manifest and doctor
validation, source config/registries/input/active manifest, package command,
combined schema, adoption and contract documentation, and WP4b plan/logs.

## 2026-08-15 — Generic active verification commissioning boundary (WP4a)

**Decision.** New in-flight verification commissioning uses the strict
`verification-manifest.v2` shape at `.agent/verification-manifest.json`. Its
generic commissioning identity binds an exact base commit, canonical timestamp,
and `bootstrap` or `readiness` profile; that profile must equal
`package.json#milestoneLoop.verification.defaultProfile`. Exact closure remains
literal no-argument `pnpm verify`, and the existing `exact-readiness` wire check
id stays stable compatibility data even though the exact result profile may be
bootstrap or readiness. Tier results remain non-authoritative at schema `1.2.0`;
all reconciliation/adoption paths still require readiness evidence explicitly,
so bootstrap can never satisfy autonomous readiness.

The frozen `verification-manifest.v1` source and Ski Tycoon records are legacy
types accepted only through closed, purpose-named historical loaders. Source
reconciliation alone may adapt the source record to the generic tier input; the
adapter adds the current protected floor and generic reconciliation minimum but
does not rewrite historical bytes; its generic `createdAt` is the canonical Git
commit timestamp of that retained record, not an invented historical event.
There is no implicit v1 fallback. The
published combined JSON Schema advances to `2.0.0` because its manifest branch
is replacement-incompatible, while its tier-result branch continues to require
wire schema `1.2.0`.

**Why.** A D-031/D-032 literal cannot commission a reusable loop, and an exact
command whose profile is duplicated in a manifest can drift from the package
authority. Separate active and historical boundaries make provenance explicit,
while resolving the exact profile from the package default avoids override
semantics without weakening the one-way readiness gate. Alternatives rejected:
accepting v1 for new work, silently translating any supplied legacy path,
rewriting the frozen source record, treating bootstrap as readiness, renaming
the stable exact check id in this slice, and migrating the live source before
the WP4b commissioning workflow exists.

**Affected files.** Manifest contracts/validators/schema, configuration and
profile loaders, tier construction and CLI, historical benchmark and
reconciliation callers, startup/doctor/safety protected-root checks, focused
fixtures/tests, `README.md`, `CONTRACT.md`, and configuration documentation.

## 2026-08-14 — Docker-attested disposable OCI data plane (WP3d)

**Decision.** Trusted candidate execution now uses Docker Engine through one
fixed, versioned executor. Version 1.0.0 rejects Podman at capability policy
evaluation because its interpreted create/inspect semantics have not been
implemented or exercised. There is no implicit Windows-to-WSL or local
fallback. Every command begins with a new origin-free, no-alternates,
no-hardlinks clone of the exact clean candidate commit and creates a uniquely
named candidate container, read-only artifact-exporter container, and two
uniquely named Docker local-driver tmpfs volumes. Containers and volumes are
removed and their absence independently inspected after every outcome; only an
immutable image whose controller-owned input labels match may be reused.

The candidate sees exactly two read-only host binds: the disposable source
clone and the controller's pnpm v11 store. Its mutable workspace, evidence, and
temporary filesystems are bounded container-local storage. The root filesystem
is read-only; the process is `65532:65532`, has no network, capabilities,
new-privilege path, host PID/IPC namespace, port/device/socket, host home,
credential, target, or controller-state mount, and has fixed CPU, memory, PID,
file, and core limits. Before launch, image identity/labels, bounded-volume
options, and Docker's interpreted container policy are parsed independently of
the argv builder. Randomized candidate/exporter names must be proven unused
before create; once a create request is attempted, cleanup and absence
confirmation run even when the client response is interrupted or malformed.
The real hang case is accepted only after a controller-retained descendant PID
marker proves that setup completed before the bounded deadline fired.
The exporter starts before the candidate and keeps the tmpfs
volumes alive after candidate exit while exposing them read-only; a fixed
in-container preflight rejects links, special files, and combined size/count
breaches before any host copy. Publication then uses an exclusively opened
destination inode plus repeated size/hash checks.

Dependency installation is offline with a frozen lockfile, read-only frozen
store, explicit store-integrity verification, and copy materialization. The
lockfile is a mandatory protected trust root. `--trust-lockfile` is required so
pnpm 11 does not attempt network-backed supply-chain-policy revalidation inside
the deliberately networkless container; it does not make the store writable or
relax the frozen lockfile. Controller-owned containment evidence records the
Docker server version, exact image ID/input hash, candidate commit/tree,
capability identity, interpreted policy, lifecycle, bounded-volume cleanup,
and artifact inventories.

**Why.** A daemon-owned container can survive termination of its client, and a
plain bind-mounted writable clone cannot be bounded by bytes or inodes. Explicit
daemon stop/kill/remove plus Docker-managed tmpfs volumes makes termination and
storage limits inspectable. A minimal read-only helper preserves the volumes
long enough for export without making candidate containers reusable. Alternatives
rejected: host writable workspaces/evidence (unbounded host authority), copying
from a stopped tmpfs-backed container (Docker releases its tmpfs mount),
auto-remove (prevents post-exit inspection/export), a writable/shared pnpm store
(cross-command mutation), and claiming Podman or WSL equivalence from mocked
argv alone.

**Known residuals.** Real containment is currently evidenced on Docker Engine
29.1.3 under WSL2 Linux, not by the Windows controller and not on Podman or a
native POSIX CI host. The default template intentionally has no configured
image ID, so doctor remains `NOT_READY` until commissioning supplies one.
Product placeholders, calibration, autonomous readiness, hidden validation,
and human verification remain open.

**Affected files.** `container-executor.ts`, `container-image.ts`,
`container-artifacts.ts`, `verification-clone.ts`, their semantic and real OCI
fixtures/tests, execution-provider wiring, command/report contracts, package
scripts, configuration documentation, `CONTRACT.md`, and `README.md`.

## 2026-08-14 — Fail-closed candidate execution provider control plane (WP3c)

**Decision.** Candidate-authored focused verification and exact aggregate
commands now resolve through one controller-owned execution-provider boundary.
`trusted-container` is the default and every legacy config migration selects
it; until WP3d supplies the pinned OCI executor, it returns a deterministic
NOT_READY/infrastructure result before invoking any candidate launch function.
`unsafe-local-diagnostic` exists only as explicit controller configuration,
uses the WP3a/WP3b bounded supervisor, records host-inherited network and the
absence of image/mount containment, and is always completion-ineligible. There
is no automatic fallback between modes.

Provider evidence uses one strict, versioned identity containing mode,
implementation, runtime, image digest, mount-policy version, resource profile,
network disposition, capability identity/status, and completion eligibility.
The controller overwrites candidate-supplied identity and every
completion-relevant parse, review, target-integration, readiness-history, and
reconciliation boundary validates semantic equality with the authoritative
identity. Direct focused diagnostics are explicitly unattested/ineligible.
Legacy stored evidence migrates to `null`/unattested rather than being blessed;
a legacy pending target-integration operation with no provider attestation is
preserved as blocked with an `execution-provider-ineligible` diagnostic.
Doctor reports implementation, runtime, pinned image, and policy facts
independently, so runtime discovery cannot imply a complete trusted capability.

**Why.** A bounded host process is not containment, and candidate evidence
cannot attest the boundary that executed it. Making policy and identity
controller-owned closes the adoption/control-plane gap now while failing
honestly until the separate WP3d data-plane executor exists. Alternatives
rejected: implicit local fallback (would silently weaken containment), treating
Docker/Podman discovery as readiness (does not prove the executor/image/policy),
accepting structurally similar candidate identity (self-attestation), and
retroactively marking legacy local evidence trusted (fabricated provenance).

**Known residuals.** WP3c does not implement OCI/native containment,
disposable clones, mount construction, resource enforcement, or adversarial
escape coverage. The two POSIX-only process-tree tests remain explicit WP5
skips on Windows. Product placeholders, calibration, autonomous-readiness, and
human-verification gates remain open; no completion/readiness claim is made.

**Affected files.** `execution-provider-identity.ts`, `execution-provider.ts`,
config/schema/state/verifier/tier/integration/reconciliation/doctor paths and
tests, `scripts/verify.mjs`, default/example configs, `CONTRACT.md`, and
`README.md`.

## 2026-08-08 — Shared supervision at verifier and evidence trust roots (WP3b)

**Decision.** Every process launch owned directly by `scripts/verify.mjs` or
`tools/evidence.mjs` now resolves through the existing WP3a
`superviseCommand` boundary. The protected verifier uses finite identity and
stage-command timeouts, the shared per-stream output cap and kill grace, and
adds the complete supervision disposition to each launched-command record
without changing schema `2.1.0`, stage/profile meanings, status weights,
receipt validation, identity-drift rules, immutable-lock validation, or
completion eligibility. Evidence helpers use one asynchronous result adapter;
their callers await it explicitly, timeout or output breach remains
non-passing, and retained stdout/stderr is redacted before any console, log,
manual report, or error write. Package scripts launch the exact pnpm JavaScript
entry under the already selected Node executable so the supervised process is
the real package-manager root and the Node/pnpm pins stay observable. The
supervisor remains directly loadable by plain Node `24.18.0`, and its output
limit and kill-grace defaults have one runtime owner.

Isolated trust-boundary fixtures copy their exact transitive dependencies and
pinned package-manager state. In particular, verifier identity fixtures copy
the shared supervisor plus lockfile, while the production-build PASS-receipt
fixture copies the explicit repository-relative evidence-wrapper dependency
graph, including the supervisor, and creates nested destinations before copy.
This keeps missing dependency edges deterministic instead of allowing a host
checkout to mask them.

**Why.** WP3a bounded orchestrator-owned commands, but these two launch owners
still used bespoke `spawn`/`spawnSync` paths with unbounded capture, direct-child
timeout handling, or no timeout at all. Reusing the same supervisor makes cap,
redaction, tree termination, drain cutoff, exactly-once settle, and honest
`rootExitObserved` behavior consistent across controller, authoritative
verifier, and evidence commands. Executing pnpm through its JavaScript entry
avoids inserting a shell or shim process that would blur ownership and
termination evidence. Alternatives rejected: retaining synchronous probes
(unbounded and unsupervised), wrapping shell/shim launchers (ambiguous process
root), duplicating limits in the verifier/evidence layers (configuration
drift), and weakening isolated fixtures after the new import (would hide a
real packaging dependency).

**Known residuals.** This does not add OCI containment or execution-provider
identity, prove POSIX behavior, convert unrelated repository launch sites,
or change the previously recorded WP3a platform escape residuals. The two
POSIX-only supervisor tests remain explicit WP5 skips. No unsupported-platform,
product-completion, or autonomous-readiness claim is made.

**Affected files.** `scripts/verify.mjs`, `tools/evidence.mjs`,
`tools/run-tool-evidence.mjs`,
`tools/milestone-orchestrator/src/process-supervisor.ts`, `contracts.ts`,
`aggregate-verify-identity.test.ts`, `evidence-supervision.test.ts`, and
`tools/production-build.test.mjs`.

## 2026-08-07 — Supervisor drain cutoff and honest termination facts (WP3a review fix)

**Decision.** Independent review of the WP3a supervisor found three defects,
fixed as follows. (1) A per-stream cap breach that arrives while the runner
is draining after root exit now cuts the drain off immediately: the straggler
sweep runs at the breach (POSIX group SIGKILL; recorded as unavailable on
Windows behind a dead root), streams are destroyed, and the command settles
with a new `drainCutoff: "output-limit"` disposition — a breaching writer
that then closes its pipes can no longer skip the sweep, and the previous
behavior (`outputLimitExceeded` set with no termination action) is a tested
regression. (2) The spawn call is wrapped so a synchronous throw resolves an
ERROR-shaped result with `spawnError` set, restoring the never-rejects
contract end to end. (3) `termination.succeeded` was renamed to
`rootExitObserved` because that is all it ever proved: root exit after kill
initiation. No field claims tree-wide termination success; per-attempt
outcomes stay in `detail`, and tree-level assurance remains test-proven
(grandchild liveness polls), not runtime-claimed. The runner's breach
message distinguishes pre-exit tree termination from a post-exit drain
cutoff. Alternatives rejected: fabricating a termination record for a root
that exited naturally (misrepresents what acted), waiting out the drain
window on a post-exit breach (delays settle for no benefit and loses the
sweep when writers close first), and keeping a boolean named `succeeded`
with documentation-only caveats.

**Affected files.** `tools/milestone-orchestrator/src/process-supervisor.ts`
and tests, `command-runner.ts` and tests, `contracts.ts`.

## 2026-08-07 — Bounded process supervisor for controller commands (WP3a)

**Decision.** All controller-spawned verification commands run through one
shared supervisor (`process-supervisor.ts`) adopted by
`command-runner.ts#runCommand`. Output is retained in memory up to a
configured per-stream cap (`limits.commandOutputLimitBytes`, default 64 MiB),
then redacted and written once; bytes past the cap are counted but never
retained, a breach terminates the process tree and fails the command in the
existing infrastructure lane, and the truncation disposition (retained and
observed byte counts plus a marker line covered by the recorded SHA-256) is
explicit. Timeout and breach own the complete tree: Windows issues a
force-first `taskkill /pid <pid> /T /F` while the tree is intact, then falls
back to `child.kill()`; POSIX spawns the child detached as a process-group
leader and sends group SIGTERM escalating to group SIGKILL after
`limits.commandKillGraceMs` (default 5000 ms). Settle is exactly-once and
hard-bounded (`timeoutMs + 2 x killGraceMs`) through a drain window for
streams held open after exit and an abandonment backstop when no exit is ever
observed; a drain-expired command keeps its exit-code status with
`streamsClosed: false`/`drainTimedOut: true` recorded because receipts, not
stdout logs, gate semantic PASS. The summary carries a full `supervision`
record. Config schema is `1.5.0`; older configs migrate with defaults
injected.

**Why.** Audit CR-02 (P1/high): the runner buffered output without bound,
sent SIGTERM to the direct child only, and settled only on stream `close`, so
a SIGTERM-ignoring child or a pipe-holding descendant hung the controller and
a flood exhausted memory. Probing on Node 24.18.0/win32 (2026-08-07) fixed
two platform facts the design relies on: a non-detached Node grandchild dies
with its parent through libuv's kill-on-close job object, while a detached
grandchild escapes the job object, survives, and holds the inherited pipe
open indefinitely — the exact hang shape. Windows kill ordering is
force-first because `taskkill /T` walks live parent chains (a dead root
enumerates nothing) and WM_CLOSE is meaningless for hidden console children;
the summary's `signal` on Windows timeouts is therefore `null` with the
taskkill exit code, which no consumer misreads (all gate on `signal === null`
plus a specific exit code). Bounded in-memory capture-then-redact was chosen
over the improvement plan's stream-to-file mechanism so no unredacted byte
ever reaches disk; the plan's properties (bounded memory, bounded logs,
recorded disposition) are preserved, and truncation trims to a newline
boundary so a split secret prefix is never retained. The drain and abandon
windows reuse `commandKillGraceMs` rather than adding a third knob because
required config keys are expensive across the strict schema. Alternatives
rejected: Windows Job Objects (native bindings; owned by the container
slice), graceful-then-tree ordering on Windows (orphans grandchildren before
`/T` can see them), automatic local fallback on kill failure (records the
failure instead), and failing drain-expired exit-0 commands (receipts already
gate PASS; stragglers are recorded, and common toolchains leave benign ones).

**Known residuals.** Descendants reparented before the kill and PID reuse can
escape `taskkill /T`; a straggler that outlives the drain window on Windows
cannot be swept through a dead root; a fully detached (setsid) POSIX daemon
escapes group kills. All are recorded dispositions, strictly narrower than
the prior unbounded behavior, and owned by the WP3 container slice. POSIX
supervision paths are written but first execute in WP5 Linux CI; the skipped
tests are flagged `WP5`.

**Affected files.** `tools/milestone-orchestrator/src/process-supervisor.ts`
(new) and its tests, `command-runner.ts`, `contracts.ts`, `schema.ts`,
`config.ts`, `verifier.ts`, `reconciliation.ts`, `orchestrator.ts`,
`test/fixtures.ts`, `config/default.json`, `config/default.template.json`,
`examples/ski-tycoon/default.json`, `config/README.md`, `CONTRACT.md`.

## 2026-08-06 — State-owned approval-bound retention apply (WP2d)

**Decision.** State schema `1.8.0` extends the exclusive pending-operation
union with one global `retention-apply` intent. A strict plan `1.2.0` captures
the exact committed candidate and a SHA-256 fingerprint of tracked, staged,
unstaged, and non-ignored untracked bytes. After the operator approves the
complete plan bytes, apply revalidates controller state, candidate,
configuration, roots, citations, suspensions, and exact target manifests,
then publishes an intent bound to the full plan hash and canonical input
generation before creating apply evidence or deleting a run. Every target
enters durable delete-started state first. The JSONL journal and deterministic
result are synced, exact operation-derived evidence; neither a journal line,
missing path, plan pathname, nor prior result is authority. Recovery completes
only an exact canonical prefix, blocks and preserves conflicts, and adopts a
missing target only from delete-started state. Explicit apply and leased
startup use the same recovery path before other controller mutation, while one
pure reducer records retention completion and removes the intent. Status and
doctor remain read-only. The existing contained recursive-removal helper and
terminal workspace-cleanup semantics are unchanged.

**Why.** The former hash-approved command still transferred authorization to
unbound filesystem text: a forged `deleting` line could make a missing run
look resumable, a torn final append became interior corruption on the next
write, and process loss after deletion or result publication had no canonical
state phase to recover. Partial plan validation and a dirty boolean also failed
to bind exact approved bytes. State-first per-target authorization makes every
irreversible removal attributable, while deterministic derived evidence makes
all declared crash boundaries converge without introducing a second log
authority. Alternatives rejected: journal-owned recovery, hash-prefix apply
directories, adopting any missing approved path, truncating conflicting JSONL,
overwriting result conflicts, weakening freshness checks after intent, adding
automatic deletion to `loop:run`, or changing workspace-cleanup policy.

**Affected files.** Retention plan/apply contracts and tests, state contracts,
runtime/JSON schema and migration, operation reducers and lineage checks,
orchestrator startup/CLI/status/doctor routing, crash/recovery workers and
evidence, `README.md`, and `CONTRACT.md`.

## 2026-08-06 — Intent-first terminal workspace cleanup (WP2c)

**Decision.** State schema `1.7.0` extends the exclusive pending-operation
union with a strict `workspace-cleanup` intent. The controller publishes that
intent before removing `node_modules`, creating failed-run diagnostic entries,
or deleting a workspace. It advances through explicit dependency, archive,
and deletion phases, pins exact diagnostic hashes and completion timestamps,
and recovers under the controller lease before ordinary terminal cleanup. A
missing workspace is adoptable only after durable delete authorization, and a
failed workspace is deletable only after its complete archive exactly matches
the intent. One pure reducer owns every terminal cleanup state consequence.
Ambiguous workspace, Git, path, or archive facts are preserved and durably
blocked; status and doctor only classify them read-only. Completed cleanup
requires the observed HEAD to equal the terminal milestone record. Failed
cleanup retains that recorded fact but separately pins the exact observed
descendant, because candidate drift may itself be the recorded failure.

**Why.** The previous pending flag was written before cleanup but did not name
an exclusive operation or fence unrelated state. Process loss after recursive
deletion therefore left state behind the filesystem, and restart sampled new
timestamps while accepting missing completed workspaces or a lone failed-run
manifest as sufficient proof. Intent-first phases make each destructive effect
attributable and exactly classifiable, while deterministic archive bytes and a
shared completion reducer make restart converge. Alternatives rejected:
reconstructing authorization from the legacy cleanup flag, using archive
existence as authority, accepting a missing workspace before a delete phase,
overwriting conflicting diagnostic files, deleting substituted paths, and
combining cleanup with approval-bound evidence retention.

**Affected files.** State contracts/schema/store and JSON schema,
`operation-intent.ts`, `workspace-cleanup-operation.ts`, orchestrator cleanup
and startup recovery, status and doctor diagnostics, crash/race workers and
recovery tests, `README.md`, and `CONTRACT.md`.

## 2026-08-06 — Intent-first target integration and canonical completion (WP2b)

**Decision.** State schema `1.6.0` extends the single pending-operation union
with a strict `target-integrate` intent. The controller publishes that intent
after exact candidate, approval, verification-result, commit-list, and
protected-file validation but before outcome, fetch, ref, index, or worktree
side effects. The operation pins one deterministic pending/integrated outcome
encoding and advances through explicit artifact/target phases. Recovery runs
under the controller lease before ordinary target-drift handling, revalidates
the standalone candidate on every pass, resumes only from the exact clean
base, and adopts only the exact clean candidate. One pure completion reducer
owns every semantic state consequence. Any other target, candidate, path, Git,
or outcome classification is preserved and durably blocked. Reviewer approval
without the intent no longer permits implicit integration reconciliation.

**Why.** The previous fast-forward happened before canonical completion state,
so process loss could leave the target at the candidate while state still
reported the base and a reviewing milestone. Startup then used a second
handwritten reviewer-as-intent path that omitted vertical-consumer state,
processed count, final outcome, and stop bookkeeping. Intent-first ordering
makes the external side effect attributable before it can happen; deterministic
outcome bytes and exact base/candidate classification make every observable
restart state decidable. A shared reducer prevents normal and recovered paths
from drifting semantically. Alternatives rejected: retaining reviewer approval
as implicit intent, using `git-outcome.json` as authority, resetting or cleaning
an ambiguous target, accepting any descendant target, a second integration
journal, and separate normal/recovery completion mutations.

**Affected files.** State contracts/schema/store and JSON schema,
`operation-intent.ts`, `readiness-completion.ts`, `target-integration.ts`,
orchestrator integration/startup, status and doctor diagnostics, crash/race
workers and recovery tests, `README.md`, and `CONTRACT.md`.

## 2026-08-06 — Intent-first, validate/adopt workspace creation (WP2a)

**Decision.** Isolated workspace creation is represented by one exclusive
state-schema `1.5.0` `workspace-create` operation bound to the exact pre-intent
Git state generation. The controller clones only after that intent is
canonical, uses a unique short `.create-<sha256-prefix>` entry under the
configured workspace root, records adjacent durable phases around filesystem
boundaries, and publishes to the stable run/milestone path with no-clobber
rename semantics. Recovery runs under the controller lease before ordinary
orchestrator mutations. It resumes or adopts only after exact filesystem and
Git validation; ambiguous entries remain in place with a durable blocked
diagnostic. Read-only status and doctor expose the same classification and
next safe action without recovery. Canonical `1.4.0` generations are migrated
in memory and advance to `1.5.0` only on the next CAS save.

**Why.** Direct cloning to the final deterministic path left an unrecorded
directory after a crash between clone and workspace-record persistence, and a
retry could neither prove ownership nor proceed. Intent-first ordering gives
every possible controller-created entry a durable identity, while a temporary
publication boundary separates incomplete clones from adoptable final state.
The short hashed temporary name preserves Windows path headroom for Git ref
lock files without weakening uniqueness. Preserving suspicious content is the
only fail-closed default that does not destroy possible user evidence.
Alternatives rejected: direct final-path clone, deleting or overwriting an
unrecognized path, treating path existence as ownership, reusing the state
mirror as a journal, a second operation-log authority, and automatic
quarantine moves whose source identity cannot be proved race-free.

**Affected files.** State contracts/schema/store, `operation-intent.ts`,
`workspace-create.ts`, orchestrator startup and attempt creation, status and
doctor diagnostics, Git-isolation fixtures, tests, `README.md`, and
`CONTRACT.md`.

## 2026-08-05 — Ref-rooted Git commits as canonical state generations (WP1b)

**Decision.** Canonical controller state lives at the fixed local ref
`refs/milestone-loop/state`. Each target is a strict commit with exact
`state.json` and `metadata.json` blobs, an optional byte-exact
`legacy-state.json`, and one parent naming the prior generation. Creation pins
the controller identity, timestamp, and message; reading validates those facts
plus state schema/hash/revision, exact successor relation, parent, and tree.
Publication uses the exact loaded object ID as the expected old ref. The
configured JSON path is a replaceable human mirror, never a second authority.
Only `initialize()` and `loadForMutation()` arm a `StateStore` for publication;
`load()` is capability-read-only. Doctor diagnostics advanced to schema
`1.2.0` to expose the state ref, generation, source, and mirror disposition.

**Why.** Git is already a required cross-platform dependency and its ref CAS
closes the lost-update window without introducing a second lock protocol.
Commit ancestry keeps the previous generation reachable and inspectable, while
ordinary branch pushes exclude the private namespace. Separating the mirror
allows post-publication repair without rolling back canonical state. Retaining
exact imported bytes preserves reconciliation evidence without running dual
writers. Alternatives rejected: relying on the controller lease alone,
revision-only rename fencing, file locks, treating the mirror as a fallback,
two-format canonical writes, automatic recovery from malformed canonical refs,
and permitting observational loads to authorize later saves.

**Affected files.** `private-ref-store.ts`, `state-generation-store.ts`,
`state-store.ts`, orchestrator/reconciliation/retention call sites, doctor and
status diagnostics, the safety demonstration, tests, `README.md`, and
`CONTRACT.md`.

## 2026-08-05 — Git private ref plus legacy-protocol guard for leases (WP1a)

**Decision.** Controller ownership lives at the fixed local ref
`refs/milestone-loop/controller-lease`; its target is a strict schema `2.0.0`
owner blob. All publication and deletion names an expected old object ID. The
old `controller.lease` pathname remains only as a permanent, recognizable
protocol guard whose foreign host-instance identity makes an older binary fail
closed. Any other legacy-path content blocks ref acquisition. The doctor
diagnostic was advanced to schema `1.1.0` to expose the canonical ref and guard
status.

**Why.** Git is already mandatory, provides tested cross-platform atomic ref
comparison, supports SHA-1 and SHA-256 repositories, keeps the active owner
object reachable, and does not push this namespace during normal branch
pushes. The guard closes the otherwise unavoidable overlap window where an
already-installed old binary could acquire the retired file lease while a new
binary owns only the ref. Alternatives rejected: rename/quarantine retries,
PID-only lock files, an unproved third-party lock package, automatic deletion
of ambiguous legacy files, and running dual lease writers.

**Affected files.** `tools/milestone-orchestrator/src/private-ref-store.ts`,
`controller-lease.ts`, `doctor.ts`, their tests, `README.md`, and `CONTRACT.md`.

## 2026-08-05 — Explicit, clean-clone production-build contract (WP0)

**Decision.** The root `build` script remains the controller-owned evidence
wrapper. Adopters declare a distinct real script and explicit output roots at
`package.json#milestoneLoop.productionBuild`. The wrapper builds the exact clean
commit in a disposable clone after a frozen offline copy-mode install, removes
pre-existing outputs, rejects mutation outside the declared roots and every
linked output, and records a twice-checked output hash inventory before writing
the receipt. Absence of the declaration is `NOT_READY`.

**Why.** Output conventions vary across adopting projects, so guessing `dist/`
or treating exit zero as proof would preserve the original false-positive path.
Building in the source checkout would allow stale ignored artifacts to satisfy
the check. Alternatives rejected: an echo/generated sentinel, timestamp-based
freshness, recursively invoking `build`, trusting a report without rechecking
its files, and silently selecting conventional output directories.

**Affected files.** `tools/production-build.mjs`,
`tools/run-tool-evidence.mjs`, `tools/production-build.test.mjs`, `README.md`,
`CONTRACT.md`, and `tools/milestone-orchestrator/config/README.md`.

## 2026-08-05 — Workspace toolchain re-install before verification (P0.7 / A-1)

**Decision.** `verify()` re-runs `pnpm install --frozen-lockfile --offline
--package-import-method=copy` in the isolated workspace between the Worker
turn and verification (`verification-reinstall` artifact in the attempt
directory).

**Why.** Gitignored `node_modules` content is invisible to every diff,
status, identity, and protected-hash fence, so a Worker with workspace write
access could otherwise leave a tampered toolchain in place for verification
to execute. The frozen offline re-install reconciles the modules directory
with the lockfile-bound store first.

**Known residual.** pnpm skips packages whose recorded install state still
matches, so a byte-level edit inside an installed package that preserves
pnpm's metadata can survive the re-install. Full denial of workspace
`node_modules` writes belongs to process sandboxing (audit R-01 / P1.1).
Alternative considered: `--force` re-copy on every verification — rejected
for now as a large per-attempt cost for a partial gain; revisit with R-01.

**Affected files.** `tools/milestone-orchestrator/src/orchestrator.ts`
(`prepareWorkspace` stage parameter, `verify()` head).
