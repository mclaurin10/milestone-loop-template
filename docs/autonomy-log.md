# Autonomy Log

Append one entry per completed increment: date, plan objective, verification
evidence (commands, result paths), commit id, and known gaps. Newest first.

## 2026-08-18 — WP5l POSIX process-group supervision portability

**Objective.** Select the earliest unresolved hosted Linux controller failure
after WP5k's Doctor correction, reproduce it from clean exact source under Node
`24.18.0` and pnpm `11.15.1`, correct only its causal process-group
portability facts, verify both supported controller platforms with
command-owned evidence, and create one narrow local commit without pushing.
Preserve the documented `setsid` escape residual, shared supervision policy,
all later controller clusters, immutable authority, lifecycle/CAL-1 state,
packages/locks/workflow, retained evidence, and the protected human plan.

**Cause and ordering.** The retained Linux orchestrator report from exact
runtime run `32060615125` is 214,181 bytes with SHA-256
`a6e7cc9d098dc52327b10ffdf33067c06dbf8eb18a73cae8033b0d902339e188`.
Failed-suite starts are Doctor `1786995000003`, process supervisor
`1786995022223`, worked example `1786995133398`, and candidate identity
`1786995183453`; process supervision is therefore the first unresolved suite
after WP5k. Its owner and test are byte-unchanged from hosted commit `87bd41e`
through current WP5k `HEAD`.

The suite had two POSIX failures. The intact-tree output-limit fixture spawned
its grandchild with `detached: true` on every platform. That topology is needed
on Windows to escape libuv's job object and prove force-first `taskkill /T`,
but on POSIX it creates a new session outside the supervised root's process
group—exactly the explicitly recorded WP3a `setsid` escape residual—so the
group strike correctly could not reap it. Separately, after a root exited and
left no process group, the drain sweep's `kill(-pgid, SIGKILL)` returned
`ESRCH`; the owner mislabeled that already-absent target as
`posix-group-sigkill-failed:ESRCH`.

**Red evidence.** A clean no-hardlink Ubuntu WSL2 clone of exact WP5k commit
`6bfe4a84a8d616725e5c41eaa9c29ad12a1f747a` / tree
`7f93ea058e627b1840a88c400e08a4f45bc2bd7b` reproduced exactly 18/20
passed and those two failures, with an ERROR manifest, no receipt, clean source
identity, exact Linux toolchain, and confirmed clone cleanup. The 2,781-byte
record at
`artifacts/manual/wp5l-linux-process-supervisor-pre-fix/reproduction.json` has
SHA-256
`19d72bd76613df98bccba6d3928523cabeee4be955e49fb2dcbc1282c75effc2`;
its 7,948-byte report has SHA-256
`b5bfeb2b45233d2bb13bbbe8dc18e1dec8dd44a3b3e69ff1c9a40258a2dbe497`.

A direct owner-level regression then used the existing impossible fake PID to
produce real Linux `ESRCH` and injected `EACCES` to require every other signal
failure to remain explicit. A second clean exact-HEAD clone applied only the
2,294-byte test patch (SHA-256
`97aac7f482eaa39bdc067855067b30a66061d9c736ec88fcde74657d049c04cf`)
and proved the regression red at 18/21 passed, three failed, zero skipped, with
ERROR/no receipt and staged-only source scope. Its 3,719-byte record has
SHA-256
`97247b00acd78a3913ce43e0ce1d27881234f1ad2f1826bd10b2597a8250769d`;
the 8,732-byte report has SHA-256
`1e96e4e43e2218296082dd11d80c3e15b485f228f036b6534b3a785651d27266`.

**Correction.** The intact-tree fixture now detaches its grandchild only on
Windows; POSIX keeps it in the supervisor-created process group and therefore
tests the contract the owner actually provides. Production drain-sweep
classification retains `posix-group-sigkill` when the signal reports only
`ESRCH`, because there is no remaining group to kill; every other error keeps
`posix-group-sigkill-failed:<code>`. Spawn topology, group SIGTERM/SIGKILL
escalation, timeout/output cap, redaction, drain bounds, exactly-once settle,
and shared controller/verifier/evidence ownership do not change. The recorded
`setsid`-detached daemon residual remains open and is not relabeled as solved.

**Focused diagnostics.** A clean exact-Linux clone with only the owner/test
correction passed 21/21 with zero skips and a valid receipt; its patch tree is
`ab13cdb58d7d3c378822d94466960ad1ee553155`. The 7,605-byte report at
`artifacts/manual/wp5l-linux-focused-diagnostic-1/evidence/invariant-vitest-report.json`
has SHA-256
`160772885fcf18fac26d03bf3780bed16a9a2b6faf2d22675a49791b33a5ed33`,
and the independently matched 603-byte receipt has SHA-256
`4f7bad05cb7de782bf9ea1fba1e744cd7584a863000a838dd958e91cb512efe5`.
Exact Windows focused verification passed 19/21 with zero failures and only
the two existing POSIX-only skips; its 7,504-byte report has SHA-256
`3250f8104f6874b135b7acc65bc0bb28f1a0e402f75c0a8f47754ea78bc5c11b`
and its independently matched 603-byte receipt has SHA-256
`7796162fec6aa510063c790c2c14404fd1a78d9f6a83aae1277177465c3ac2ae`.

The pre-freeze receipt-owning format diagnostic then correctly rejected style
in both changed TypeScript files. Its 8,953-byte ERROR manifest has SHA-256
`c57322e39f00f063dc2ad2f7ac2ba808439ab7196c50c0d23e36d92d094a51c4`
and no receipt. Pinned Prettier changed only those two bounded paths; no
diagnostic PASS is reused after formatting, and every frozen-tree final command
runs again.

**Stable-tree milestone protocol.** Source, regression, this log, and the
execution plan freeze before final commands. The exact staged tree runs a fresh
Linux focused shard and receipt-owning Windows focused, invariant,
orchestrator, unit, typecheck, lint, and format commands separately and
serially in fresh roots beneath `artifacts/manual/wp5l-*-final/`. Outcomes and
independent hashes remain in ignored command evidence and the final handoff
rather than being backfilled into tracked files and changing the candidate.

**Commit.** Assigned by the single cohesive WP5l commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed. A later
external publication had already advanced `origin/master` to WP5k before this
increment began; no remote mutation occurs here.

**Known gaps.** Worked-example payload identity and candidate identity are the
next retained Linux controller clusters. The larger Windows controller
path-spelling/identity cascades, documented POSIX `setsid` process escape,
CAL-1, hidden validation, product breadth, autonomous readiness, and human
verification remain open. This increment makes no readiness or product-
completion claim.

## 2026-08-18 — WP5k POSIX Doctor ENOTDIR portability closure

**Objective.** Select one causal Linux controller failure from retained Exact
runtime CI run `32060615125`, reproduce it locally under the exact Linux
toolchain, correct its root cause without weakening configured-path or lease
mutation fences, verify both supported controller platforms with command-owned
evidence, and create one narrow local commit without pushing. Preserve all
later controller clusters, immutable authority, lifecycle/CAL-1 state,
packages/locks/workflow, completed evidence, and the protected human plan.

**Cause and reproduction.** The retained controller report recorded failed
suite starts in this order: Doctor `1786995000003`, process supervisor
`1786995022223`, worked example `1786995133398`, and candidate identity
`1786995183453`. The Doctor suite was therefore the first causal boundary. On
POSIX, `lstat` of `state/controller.lease` beneath a regular-file
`artifacts/orchestrator` ancestor raises `ENOTDIR`; Windows reports the same
unreachable leaf as `ENOENT`. `readLegacyPath` propagated the POSIX error and
crashed read-only Doctor before its configured-path block could be returned.

An exact clean-`b04d33a` Ubuntu WSL2 clone under Node `v24.18.0` and pnpm
`11.15.1` reproduced 18/19 Doctor tests with the exact hosted ENOTDIR stack,
an ERROR manifest, no receipt, clean source identity, and confirmed clone
cleanup. Its 2,532-byte structured record at
`artifacts/manual/wp5k-linux-enotdir-pre-fix/reproduction.json` has SHA-256
`b3c37c446d154b63562f3df140e26486a612269c02b0fd756a29aaf7a0913017`.
The new direct lease-owner regression was then applied alone to another exact
clone and proved red: 34/36 passed, with exactly the owner and Doctor cases
failing at the same ENOTDIR stack, and no passing receipt. Its 3,571-byte
record at
`artifacts/manual/wp5k-linux-owner-regression-red/reproduction.json` has
SHA-256
`40d928bf18be9cd7caaf8c74a5633c29005e97945ffa6fdbaab9aa4bced68a99`.

**Correction.** The two read-only observers involved in the same case now
classify only `ENOENT` and `ENOTDIR` as an unreachable leaf. Doctor's
configured-path walker continues upward to the actual regular-file ancestor
and retains its `configured-path-unsafe` block with exact nearest-path/kind
facts; the retired legacy-guard reader reports no leaf. All other errors retain
their prior fail-closed behavior. `ControllerLease.acquire` still runs
`ensureContainedDirectory`, rejects the obstructing ancestor with ENOTDIR,
preserves its bytes, and publishes no private lease ref. The new regression
asserts that complete inspection/mutation boundary.

The first Linux diagnostic after only the lease-reader correction intentionally
remained non-passing at 35/36: it exposed the same POSIX code in Doctor's own
ancestor walker rather than concealing the incomplete fix. Its 13,463-byte
ERROR report is retained at
`artifacts/manual/wp5k-linux-focused-diagnostic-1/failure-evidence/invariant-vitest-report.json`
with SHA-256
`a28f8e7e359b496b93aeff2398dbcf39fddb5705d2c15db33ef68f6e8b28a5f1`.

**Implementation diagnostics.** After correcting both read-only observers,
the exact Linux affected shard passed 36/36 across four reported suites and an
independent audit matched one receipt, one artifact, and one manifest binding
with zero mismatches. Its 1,525-byte summary at
`artifacts/manual/wp5k-linux-focused-diagnostic-1/result-summary.json` has
SHA-256
`49030803e8868a26f859b4585890b29fcda89b1b1c1b33941286a44f8a22df7d`;
the 12,523-byte report has SHA-256
`3ad67c4082e65ce5ca3200f4bc6617bec9dc246bf49fb51e5c6b47d3f03cf46c`.
The post-change Windows affected shard independently passed 36/36; its
12,498-byte report has SHA-256
`35a2326793e320608282c1692c8c659ab7956f4cea8c63a8f61a41d5b03338f3`,
and its receipt/artifact/manifest bindings all matched.

**Rejected first freeze.** The first staged candidate tree
`f1d4eea454acfe614ef5001503940df40f4328ba` passed exact Linux focused 36/36,
Windows focused 36/36, all four invariant commands, orchestrator 589/591 with
only the two declared skips, unit 602/604 with the same skips, typecheck, and
lint. Final format then correctly rejected one style issue in the new lease
regression. Its ERROR manifest retained no receipt and has SHA-256
`9f99fc2c7eef6e0fac56428349e3a9bc72131c4141fef649f28f87f4ea25022f`.
Pinned Prettier is applied only to that test before the second freeze; because
the tracked tree changes, none of the first-tree PASS receipts are reused as
final evidence.

**Recurring harness timeout.** The formatted second tree
`f8219ed79d5327ebe528d2015839eb83e16db012` passed format, exact Linux and
Windows focused 36/36, invariants, typecheck, and lint. Its full orchestrator
rerun then rejected the tree at 588/591 passed, one failed, and the same two
declared skips. The unchanged real workspace-diagnostics cleanup assertion hit
its explicit 30-second test timeout at 30,173.705 ms. The 207,946-byte ERROR
report at
`artifacts/manual/wp5k-orchestrator-final-r2/orchestrator-report.json` has
SHA-256
`ca753467c212df610fca2f061a19eac0394060d6e22ea21ca28035fb22f035b3`;
its manifest retained no receipt.

An audit of 98 retained reports for that exact assertion found four timeout
failures at 30,173.705, 30,263.47, 30,516.37, and 31,512.311 ms. Identical
semantic runs pass as high as 27,170.63 ms; the first WP5k tree passed in
22,352.244 ms and WP5j passed in 23,009.979 ms. The test performs real
clone/archive/delete work, and the 30-second harness budget is therefore a
known recurring Windows filesystem/scheduling flake rather than a cleanup or
ENOTDIR semantic regression. Under the regression rule, finalization stops and
only that test timeout advances to a still-bounded 60 seconds. No production
code, assertion, retry, skip, conditional, mock, or acceptance performance
threshold changes. Three serial receipt-owning focused-file runs and every
frozen-tree final command run again afterward; no second-tree PASS is reused.

The timeout-only correction then passed three serial receipt-owning focused
executions of the complete real cleanup file: 9/9 each with zero skips, while
the target assertion completed in 24,159.078, 25,845.774, and 25,979.5 ms.
Every receipt, artifact, and manifest binding independently matched with zero
mismatches. The three report SHA-256 values are
`acb46cc8680cbe123c741642001c8e71bebb6f0c07347dfe7eb7ee02e0856343`,
`495d2da11ed8e89898b79dfdabd2f6745eebb6c6516059ebeda10c6b159c6b8a`,
and `c5a30820806734925b1f1a102f53103ec867cd754b37dd468df0edbcf830c6df`.
These focused results are diagnostic; a new frozen tree still runs every final
gate serially.

**Stable-tree milestone protocol.** Source, regression, this log, and the
execution plan freeze before final commands. The exact staged tree runs a fresh
Linux focused shard and receipt-owning Windows focused, invariant,
orchestrator, unit, typecheck, lint, and format commands in distinct ignored
roots beneath `artifacts/manual/wp5k-*-final/`. Outcomes and independent hashes
remain in those command-owned artifacts and the final handoff rather than being
backfilled into tracked files and changing the candidate they verify.

**Commit.** Assigned by the single cohesive WP5k commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** Process-supervision, worked-example payload identity,
candidate identity, and the larger Windows controller portability clusters
remain open, as do CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification. This increment makes no readiness or
product-completion claim.

## 2026-08-17 — WP5j Windows fresh-adopter shared-store closure

**Objective.** Reconcile pushed WP5i commit
`87bd41e072a9e49baf212dc803ead83acbdabb92` against its exact hosted run,
prove the trusted-container correction under real GitHub Docker, and fix only
the independent Windows fresh-adopter store-visibility failure. Preserve exact
tooling, offline/frozen/copy install policy, generated bootstrap history and
completion ineligibility, package/lock bytes, OCI behavior, controller
failures, immutable authority, commissioning/readiness/verifier meanings, and
the protected human plan. Create one local commit and do not push.

**Hosted audit.** Exact push run
`https://github.com/mclaurin10/milestone-loop-template/actions/runs/32060615125`
(run 5, attempt 1) executed the exact commit/tree from
`2026-08-17T19:29:21Z` through `19:35:24Z` and concluded `failure`. All five
jobs, every step, complete logs, eight annotations, and all five artifact ZIPs
were retrieved and inspected. Jobs were: fresh-adopter Windows
`95480834015` failure; controller Windows `95480834038` failure;
fresh-adopter Linux `95480834051` success; controller Linux `95480834113`
failure; trusted-container Linux `95480834183` success. The annotations were
five action-runtime Node 20 deprecation warnings and three exit-code failures,
not causal substitutes.

Artifact IDs / ZIP bytes / SHA-256 are: controller Windows `9298180337` /
52,794 / `7c58a84f11475d46a15e15f5cee430f938b866f6b17d20a7b18e1203f14f2c38`;
controller Linux `9298111032` / 49,146 /
`42e3c9d8325b818188c65ee2c9a1bbf8caa8d5d1c0bae2cb3125c81a3179f131`;
trusted container `9298026972` / 21,902 /
`9ca49490907fec39b280dc1d715478ee5798085719e55a2e8a11baaf43deca1c`;
adopter Windows `9298008310` / 8,736 /
`f210504bdb7850c7c046f5fcfdcfc6ee29c3ebc92ace7ed55d89c766c09ba22e`;
and adopter Linux `9298000229` / 15,191 /
`cbcfcffbec09c4bd39b1a28ab289440edb8de64c8cab8383aee0cabef1b0bdd5`.
Raw API responses, full logs, ZIPs, and extracted artifacts are retained under
ignored `artifacts/hosted/run-32060615125/`.

The independent 23,471-byte hosted audit has SHA-256
`54b50a40334ca8efab5aa291aa341b9516e4504783557d44d524feebb93060bf`
and zero mismatches: 13 PASS receipts, 13 rehashed artifacts totaling 81,253
bytes, 12 manifest bindings plus the OCI containment binding, and two honest
ERROR/no-receipt controller manifests. Both controllers passed invariant
totals 13/13, 7/7, 15/15, and 61/61. Linux then reported 578/588 tests passed,
9 failed, 1 skipped; Windows 512/588 passed, 74 failed, 2 skipped. Linux
fresh-adopter passed 4/4 with two audited receipts.

WP5i's hosted boundary is now proved: Docker `28.0.4` accepted exact
`committed-head` source identity, fixture hydration completed, and normal /
boundary / artifact-link / artifact-quota / output-flood / hang produced
PASS / PASS / ERROR / ERROR / ERROR / TIMEOUT as required. Every containment
report matched bytes/hash, network remained denied, root/store host mounts were
non-writable, every container/exporter/bounded volume was removed, and managed
resource inventories were empty before and after.

**Cause and correction.** Windows source install downloaded all 138 packages,
including `@eslint/js@10.0.1`, on GitHub's `D:` checkout drive. The generated
repository under `C:` then selected a different empty default store, reused and
downloaded zero packages, and failed offline for that exact tarball. Linux's
single-filesystem job passed. A logical `subst` control correctly reused one
physical store and was rejected as a reproduction; two project-config controls
also passed because pnpm propagated or copied the configured store. The
accepted invocation-shim control exposed a hydrated source store and distinct
empty child store without changing production commands. The unchanged smoke
then reproduced the exact failure while preserving source status and both lock
hashes. Its 3,696-byte structured record at
`artifacts/hosted/run-32060615125/reproduction/windows-store-split-wrapper-pre-fix/result.json`
has SHA-256
`a63005aee099fc03640d16b44f38b57dd97194b978d0edd7053c51888ab0aae2`.

The coordinator now resolves exactly one absolute existing `pnpm store path`
through the pinned invocation from the source cwd and passes it explicitly to
the generated install while retaining `--offline --frozen-lockfile
--package-import-method=copy`. Unsafe/failed store identity is fail-closed. The
smoke result records an `explicit-source-store` disposition and path hash, not
the host path. The workflow command, generated package, dependencies, locks,
and OCI boundary do not change.

The focused regression first failed 2/4 because the new owner did not exist,
then passed 4/4. Receipt-owning focused, typecheck, lint, and corrected format
diagnostics passed under Node `24.18.0` / pnpm `11.15.1`. A real isolated-store
corrected smoke passed install, typecheck, and 4/4 tests; independently matched
two receipts, two artifacts totaling 3,256 bytes, and two manifest bindings;
retained clean two-commit bootstrap history with no readiness marker/tree
history; removed its generated temporary root; and preserved source identity.
Its 3,606-byte result at
`artifacts/manual/wp5j-fresh-adopter-smoke-diagnostic-1/smoke-result.json` has
SHA-256
`9a3b76ba44b1255dcd644c1141ae4795fc6ba7e0082bb321bfbdd086bf1e791b`.

**Stable-tree milestone protocol.** Coordinator, regression, decision record,
this log, and the execution plan freeze before final commands. The exact staged
tree runs a fresh isolated-store smoke and receipt-owning focused, invariant,
orchestrator, unit, typecheck, lint, and format commands in separate fresh
roots beneath `artifacts/manual/wp5j-*-final/`. Outcomes and independent hashes
remain in ignored command evidence and the final handoff rather than being
backfilled into tracked files and changing the candidate they verify.

**Commit.** `b04d33a6869645ea4d847af7991831b249e2f882` (tree
`25f0c9d16c4160758161aa3aea96af0bd2e7b5a6`, parent
`87bd41e072a9e49baf212dc803ead83acbdabb92`). It was created locally without a
push during WP5j. A later human-side publication advanced `origin/master` to
that commit; exact hosted run `32073770072` then passed both fresh-adopter jobs
and trusted-container Linux while both controller jobs remained failed.

**Known gaps.** Only a later pushed native `windows-2022` run can close hosted
Windows fresh-adopter status. Linux/Windows controller portability clusters,
product placeholders, CAL-1, hidden validation, autonomous readiness, and
human verification remain open. This increment makes no readiness or product
completion claim.

## 2026-08-17 — WP5i exact OCI fixture-store closure

**Objective.** Reconcile pushed WP5h commit
`a868d9d92227cb95b17db93b14038ae2d24ec026` against its exact hosted run,
inspect every job/log/annotation/artifact, reproduce the first causal failure
after the corrected controller-source identity, and fix only that failure.
Preserve the candidate's offline/network-denied/read-only-store policy, all six
normal/adversarial cases, package and lock bytes, immutable authority,
commissioning/readiness/verifier meanings, and unrelated WP5 failures. Create
one local commit and do not push.

**Hosted audit and first cause.** Exact push run
`https://github.com/mclaurin10/milestone-loop-template/actions/runs/32047579881`
(run 4, attempt 1) executed commit
`a868d9d92227cb95b17db93b14038ae2d24ec026`, tree
`24954859be765bd893b5a3cfd41e2634a22578af`, from
`2026-08-17T16:51:24Z` through `16:57:56Z` and concluded `failure`. All five
independently scheduled full-history jobs, every step, complete log, all nine
annotations, and all five retained artifacts were inspected. The annotations
were five action-runtime Node 20 deprecation warnings and four process-failure
annotations; the warnings were not mislabeled as causes.

Linux fresh-adopter passed both receipt-owning commands and 4/4 tests. Windows
fresh-adopter failed its generated frozen offline install because the selected
Windows store lacked `@eslint/js@10.0.1`; that remains separate. Both
controllers passed contract 13/13, schema 7/7, policy 15/15, and verifier
fail-closed 61/61 before their independently retained orchestrator failures.
Linux reported 577/587 passed, 9 failed, 1 skipped across 180 suites. Windows
reported 509/587 passed, 76 failed, 2 skipped; its dominant cluster remains
GitHub's `RUNNER~1` versus `runneradmin` realpath spelling, with separate
worked-example/retention/schema cascades.

WP5h's intended Docker correction succeeded: real Docker client/server
`28.0.4` recorded `committed-head`, exact HEAD/tree, zero staged paths, and the
deterministic empty-path digest. The image built, the normal container started,
and cleanup removed the candidate/exporter/volumes with empty managed-resource
inventories before and after. The first new cause was then exact and narrow:
the root lock/store contained Vite `8.2.0`, while the protected OCI fixture lock
required Vite `8.2.1`; the unchanged offline candidate install failed with
`ERR_PNPM_NO_OFFLINE_TARBALL` for that tarball. Its 2,004-byte result has
SHA-256 `c36e504e25978aae4b8cc96a1f4d12c11228ad9d0bad4452bd23a8e669c042c4`.

The five downloaded ZIPs under ignored `artifacts/hosted/run-32047579881/`
match their retained bytes/SHA-256: controller Windows 52,900 /
`30700153ff0b4a7fce6dfb598d28defdc42113dc8dedcfb6e1dd962fd4b107af`;
controller Linux 49,138 /
`329883c4a35953718d0af13345c8a8aa6151bd1d236b2949fd3b97f501d1f126`;
adopter Windows 8,733 /
`5917c3c7768d423bb2d1c2dd907865bec1eee56864b63f7852bd562b2aaf80f9`;
adopter Linux 15,189 /
`fdcd3ff4d78fdc4fe5d3aa1c4af48501850540c8f53358c645cb731ed7764f96`;
and trusted container 5,481 /
`3b66cd202d706dbb0c00f99683083beada5bcab6d2d21a9f9793bbb828d5c32d`.
Independent extraction audit matched 12/12 PASS receipts, 12/12 declared
artifacts totaling 80,482 bytes, and 12/12 manifest bindings with zero
mismatches while preserving every ERROR/no-receipt boundary.

**Reproduction and correction.** A no-local/no-hardlinks clone of the exact
commit under Linux Node `v24.18.0`, pnpm `11.15.1`, and Git `2.43.0` populated
a new store only from the root frozen install. An exact fixture archive outside
workspace discovery then reproduced the missing `vite@8.2.1` tarball. The
2,836-byte structured record at
`artifacts/hosted/run-32047579881/reproduction/oci-store-closure/result.json`
has SHA-256
`29ad277635fcf1e3f713ad71c0d4b856834afd929dc297da4452674d720ce94d`.
The root lock remained 60,467 bytes / Vite `8.2.0` /
`154f9b86ae26bf839a51c2de1eed204397f7c54cf9dcf870320c881c3aa5c181`;
the fixture lock remained 24,385 bytes / Vite `8.2.1` /
`8623b26cc48086c4149d3d9a564ae3879072bf5a11da3a2ba3945fe3f7f9beca`.

A direct fixture-directory `pnpm fetch --frozen-lockfile` hydrated the missing
graph but also normalized the checked-out fixture lock's YAML formatting. That
is semantically harmless in a disposable copy but violates tracked-source byte
identity. The workflow therefore archives exact
`HEAD:fixtures/oci-candidate` bytes into a `mktemp` scratch directory, fetches
there with explicit `--ignore-workspace` and `--frozen-lockfile`, and removes
the scratch directory on exit. It runs after the root install and before Docker,
so both controller operations populate the same default store while the
candidate still receives only a read-only store mount and no network.

The second fresh explicit-store control downloaded the fixture closure, kept
the tracked fixture lock and package hashes exactly
`8623b26cc48086c4149d3d9a564ae3879072bf5a11da3a2ba3945fe3f7f9beca`
and `962c5d88ea243d7ca6b79982bf64a9928f8d27334f2aec084f87cc494e864cb5`,
and made the unchanged isolated offline/frozen/store-integrity install pass
with 47/47 packages reused. The executable workflow contract binds the exact
archive/fetch/cleanup block once and enforces its position between source
install and the real matrix; mutation coverage rejects removal, reordering,
wrong archive root, root-directory substitution, missing workspace isolation,
or missing frozen-lock enforcement. No package, lock, fixture, OCI provider,
case, containment, or candidate command changed.

**Implementation diagnostics.** Under pinned Windows Node `24.18.0` and pnpm
`11.15.1`, the corrected receipt-owning workflow-contract shard passed 4/4
tests across 2/2 reported suites at
`artifacts/manual/wp5i-workflow-focused-diagnostic-2/` (2,104-byte report,
SHA-256
`bd94ba142ab100c81283bd72339761acb4313cd26767f1aa127396cb2afe8910`).
Receipt-owning typecheck and lint diagnostics passed at
`artifacts/manual/wp5i-typecheck-diagnostic-1/typecheck-report.json` (1,066
bytes, SHA-256
`d28d2480608f18f5fe0732702e4dbc11d4d9c56b70469b8c29c01642bdbbba16`)
and `artifacts/manual/wp5i-lint-diagnostic-1/lint-report.json` (1,599 bytes,
SHA-256
`ab6d8e78791a0146d94bf724bce7396963735d0552de3f33059a3e82a96ca645`).
These are iteration diagnostics, not substitutes for the final frozen-tree
commands.

**Stable-tree milestone protocol.** Workflow, contract/tests, decision record,
this log, and the execution plan freeze before final evidence. The exact staged
tree is compiled into ignored `artifacts/manual/wp5i-oci-final-build-1/`. A
disposable Linux clone receives that exact staged diff, a new default store,
the root frozen install, and the exact scratch-fixture fetch before the emitted
entry runs all six real Docker cases into
`artifacts/wp5i-oci-final-20260817/`. Receipt-owning focused, invariant,
orchestrator, unit, typecheck, lint, and format commands write fresh evidence
beneath `artifacts/manual/wp5i-*-final/`. Outcomes and independent artifact
hash audits remain in command-owned ignored artifacts and the final handoff
rather than being backfilled into tracked files and changing the tree they
verify. Long suites run separately and serially.

**Commit.** Assigned by the single cohesive WP5i commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** A complete local fresh-store real-Docker matrix cannot
substitute for a later hosted Ubuntu run of the committed revision. The
Linux/Windows controller portability clusters and Windows fresh-adopter
cross-drive offline-store failure remain separate WP5 work. Product
placeholders, CAL-1, hidden validation, autonomous readiness, and human
verification remain open; this increment makes no product-completion claim.

## 2026-08-17 — WP5h generic OCI controller-source identity

**Objective.** Reconcile the pushed WP5g candidate against its exact hosted
run, inspect every job/log/annotation/artifact, reproduce the next first causal
trusted-container failure under exact pinned Linux tooling and real Docker, and
fix only that failure. Preserve the six-case OCI policy and every immutable,
commissioning, readiness, invariant, workflow, dependency, and unrelated WP5
meaning; create one local commit and do not push.

**Hosted audit and first cause.** Exact push run
`https://github.com/mclaurin10/milestone-loop-template/actions/runs/32039150245`
(run 3, attempt 1) executed commit
`a0e9af205b7c6dff1155a087dfe56c7786da2b79`, tree
`f998fb50c9ab249b7e07a6d70eebed8ea1513ae9`, from
`2026-08-17T14:28:20Z` through `14:34:40Z` and concluded `failure`. The five
independently scheduled full-history jobs all installed exact Node `24.18.0`
and pnpm `11.15.1`. Their complete logs were inspected: Linux adopter 247
lines / 21,094 characters; Windows controller 263 / 22,873; trusted container
259 / 21,779; Windows adopter 237 / 21,722; Linux controller 282 / 23,749. The
public annotation API contained five action-runtime warnings and four
exit-code failures, nine annotations total.

Both controllers passed the four-command invariant suite (contract 13/13,
schema 7/7, policy 15/15, fail-closed 61/61) and then failed their independently
retained orchestrator boundaries. Linux reported 574/584 passed, 9 failed, 1
skipped across 178 suites; Windows reported 508/584 passed, 74 failed, 2
skipped. Both retained ERROR manifests with no passing receipt, and later
controller commands correctly skipped. Linux fresh-adopter passed both
receipt-owning checks and 4/4 tests. Windows fresh-adopter again failed its
generated frozen offline install because the Windows pnpm store lacked the
`@eslint/js@10.0.1` tarball.

The WP5g argv repair worked exactly. Trusted-container confirmed real hosted
Docker client/server `28.0.4`, invoked
`pnpm test:oci-container --output artifacts/ci/trusted-container/matrix`, and
entered the strict current TypeScript with no extra separator. It then exposed
the next earlier-than-cases defect: the WP3d milestone harness required a
non-empty staged index and rejected GitHub's exact clean committed checkout as
`The WP3d candidate index is empty.` The 1,061-byte FAIL result has SHA-256
`c428400f08be282d144bb2e844f5970e31908911b3732671591ec3bd24871ea7`,
zero cases, and empty before/after managed-resource inventories.

All five authenticated artifacts are retained under ignored
`artifacts/hosted/run-32039150245/` and match GitHub metadata: controller
Windows 52,557 bytes / SHA-256
`304aefbb270c78477bd2bff791b13aa216882a3dbf8c2c26b4fa6194726e1ed6`;
controller Linux 49,000 /
`c8d5935bf9492395ef22fdf6978785f148dd33c2e80fd92a3f6943c92dbc08f4`;
adopter Windows 8,674 /
`753fc7cf1918e59a208e3e03e7877a66af589fd4e143525311eeacd906c7c5f0`;
adopter Linux 15,137 /
`ed0cf0db4b98e2205f260bc41f8778d0876d8aeb8114c6bda62609801f841c65`;
and trusted container 2,488 /
`0b86f79331f255a4fbd4674daa60ec1bae49497d1a5d2d8a07c93cddb7b9c561`.
Independent audit matched 12 hosted PASS receipts to 12 artifacts totaling
80,484 bytes with zero mismatches and preserved every ERROR/no-receipt
boundary.

**Reproduction and correction.** The exact current TypeScript source (35,259
bytes, SHA-256
`c5d2bf4e472c158c67b085c4b6bb31a576fc44362cac18944d6bb25f119bd7ff`)
was compiled into ignored diagnostic output, then run under Ubuntu WSL with
Linux Node `v24.18.0`, pnpm `11.15.1`, and real Docker `29.1.3`. It reproduced
the same empty-index failure at
`artifacts/hosted/run-32039150245/reproduction/clean-index-current/result.json`
(1,062 bytes, SHA-256
`c86b21780d44da208835804824bfbc55845868eb9677e708c5ea5c618c459278`)
before image or case execution and left no managed resource. A historical
compiled runner reached a different policy diagnostic and is retained but
explicitly rejected as current-source evidence.

The OCI entry now delegates tracked-source capture to one small owner. A clean
Git checkout is explicitly `committed-head` and binds candidate tree to
`HEAD^{tree}`. A pre-commit frozen candidate is explicitly `frozen-index` and
binds candidate tree to `git write-tree`, staged path count, and staged-path
digest. Both modes retain exact HEAD and HEAD-tree identity and reject any
unstaged tracked change. Result schema advances to `1.1.0` and records
`controllerSource`; the distributed OCI harness no longer requires, names, or
hashes the local protected human plan. No CI environment branch, fabricated
change, parser relaxation, provider/case/policy change, or workflow change was
introduced.

**Implementation diagnostics.** Under pinned Windows Node `24.18.0` and pnpm
`11.15.1`, the receipt-owning real-Git/workflow shard passed 6/6 tests with zero
failures or skips across 4/4 suites at
`artifacts/manual/wp5h-source-identity-focused-1/invariant-vitest-report.json`
(2,860 bytes, SHA-256
`2b0778a2ac5ce95bdbec86a92709617c9cb9568e0ef0b900e34c9d716565e2c5`).
Receipt-owning typecheck and lint diagnostics passed at
`artifacts/manual/wp5h-typecheck-diagnostic-1/typecheck-report.json` (1,075
bytes, SHA-256
`3a3e7ad14c73a68dbc7095618a790d17384438c14e97680b00d4ef95b81cfe63`)
and `artifacts/manual/wp5h-lint-diagnostic-1/lint-report.json` (1,608 bytes,
SHA-256
`73085a2ff0df3c500c68ea2b7c1234692ab773fdb7ec604babba767ac6bbe9e6`).
These are iteration diagnostics, not substitutes for the final frozen-tree
commands.

The first staged-tree matrix attempt correctly captured `frozen-index` source
identity and reached the real normal container, then exposed a narrow
implementation regression: the initial global schema-version bump also made
the validator expect containment report `1.1.0`, although the unchanged
containment report remains `1.0.0`. The rejected result is retained at
`artifacts/wp5h-oci-final-20260817/result.json` (1,957 bytes, SHA-256
`29bcbcf150055641b51a4be0bcc9eb78592fdc5dd82286abec15d05ca1105752`)
with zero accepted cases and empty before/after managed-resource inventories.
The matrix and containment schema constants are now separate; no containment
validation, case expectation, or cleanup rule was weakened.

**Stable-tree milestone protocol.** Source, tests, decision record, this log,
and the execution plan freeze before the final commands. The exact staged tree
is compiled to ignored `artifacts/manual/wp5h-oci-final-build-r2/` and the
complete real six-case matrix writes
`artifacts/wp5h-oci-final-20260817-r2/result.json`. Receipt-owning focused,
invariant, orchestrator, unit, typecheck, lint, and format commands write fresh
evidence beneath `artifacts/manual/wp5h-*-final/`. Their outcomes, hashes, and
receipt audit remain in those command-owned ignored artifacts and the final
handoff rather than being backfilled into tracked files and changing the tree
they verify. Long suites run separately and serially.

**Commit.** Assigned by the single cohesive WP5h commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** A complete local real-Docker matrix cannot substitute for a
later hosted Ubuntu run of the new committed revision. Controller Linux/Windows
portability and Windows fresh-adopter offline-store failures remain separate
WP5 gaps. Product placeholders, calibration, hidden validation, autonomous
readiness, and human verification remain open; this increment makes no product
completion claim.

## 2026-08-17 — WP5g hosted CI audit and OCI argv correction

**Objective.** Reconcile the pushed WP5f candidate against actual hosted
execution, inspect every job/log/annotation/artifact rather than the aggregate
badge, reproduce the first causal failure under exact pinned tooling, and fix
that one defect without hiding the other independently exposed WP5 failures.
Preserve all authority, commissioning, readiness, invariant, provider/matrix,
package, and completed-evidence meanings; create one local commit and do not
push.

**Hosted audit and first cause.** Exact push run
`https://github.com/mclaurin10/milestone-loop-template/actions/runs/32029510422`
(run 2, attempt 1) executed commit
`8ffdbcd83b3d07c1f49b91a057ffe5f8e1ec7d30` from
`2026-08-17T12:22:11Z` through `12:28:41Z` and concluded `failure`. Public
run/job metadata, authenticated GitHub connector logs and artifact downloads,
the public annotation API, and the visible run summary agreed on five
independently scheduled jobs, four exit-code errors, and five action-runtime
Node 20 deprecation warnings. Every job used `fetch-depth: 0`, exact Node
`24.18.0`, and pnpm `11.15.1`; the warnings occurred outside the causal
commands and are not mislabeled as their cause.

Controller Linux and Windows both reached the commissioned base and passed all
four invariant commands, including contract integrity 13/13. Linux then
failed the orchestrator aggregate at 574/584 passed, 9 failed, 1 skipped: one
candidate-identity case, one Doctor ENOTDIR case, two POSIX supervisor cases,
and five worked-example byte-identity cases. Windows failed at 508/584 passed,
74 failed, 2 skipped across 19 files; the dominant shared cluster was strict
realpath comparison of GitHub's `RUNNER~1` spelling against the long
`runneradmin` identity, with additional worked-example byte drift and
retention/schema cascades. Both retained ERROR manifests with no PASS receipt;
later controller commands were correctly skipped.

Fresh-adopter Linux ran independently and passed its generated repository,
two receipt-owning checks, and 4/4 tests. Fresh-adopter Windows also ran
independently but its generated frozen offline install failed with
`ERR_PNPM_NO_OFFLINE_TARBALL` for `@eslint/js@10.0.1`, so it produced no smoke
PASS result. Trusted-container independently reached Ubuntu 24.04's real
Docker Engine and retained `docker version`/`docker info`, then became the
earliest causal failure at `12:22:31Z`: pinned pnpm forwarded the workflow's
extra separator, the package script launched as
`container-executor.oci.ts -- --output ...`, and the unchanged strict parser
rejected `Unknown argument --.` before any normal/adversarial case ran.

All five authenticated ZIP downloads matched GitHub metadata exactly:
controller Linux 48,953 bytes / SHA-256
`ec6a89c22e1299bf23d3278b9544eeab652aca18379d185ccdef49113bf1a6aa`;
controller Windows 52,528 /
`cad946551db47d05bb374ada84fe84f73faaffe21d9522e16a8229445e6ac467`;
adopter Linux 15,137 /
`73b4f34fa67367076a39c23334e8519e2ce121a88ee2edb2d66ba1a5b2b9c070`;
adopter Windows 8,685 /
`c730cc1866b570dc6b98ea2eb27459ffd3959775398a205b32e04a2502fedb90`;
and trusted-container 1,889 /
`a3bdaad59fda3d336dc1d1820367702e213503faec6643526f814f5bc7885eea`.
They are extracted under ignored
`artifacts/hosted/run-32029510422/`. Independent inspection matched 12 hosted
PASS receipts to 12 artifacts totaling 80,446 bytes with zero mismatches, and
confirmed both controller ERROR manifests declared zero artifacts and no
receipt.

**Correction.** A retained exact-toolchain argv fixture first ran the hosted
shape and observed
`['--','--output','artifacts/ci/trusted-container/matrix']`, exit 1. Its
119-byte observation has SHA-256
`8446064855500a29db5b697c8c3aad8d6228aa0e9054b8da55969b4d363505be`.
A regression mutation was added before the fix and correctly produced one
focused failure because the malformed separator remained accepted. The
workflow, its executable contract/test, and current README guidance now use
`pnpm test:oci-container --output artifacts/ci/trusted-container/matrix`.
The corrected pinned probe passed exit 0 and observed exactly
`['--output','artifacts/ci/trusted-container/matrix']`; its 109-byte record has
SHA-256
`df1809ca54bb241a1b12755f38290b539b69c8c9c92e9a759ff511e276561793`.
The OCI parser, package script, matrix cases, real engine probes,
provider/containment implementation, schedules, histories, and evidence roots
did not change. The workflow contract now rejects restoration of the literal
separator as well as its existing mock/platform/history/scheduling/evidence
mutations.

**Verification.** Under pinned Windows Node `24.18.0` and pnpm `11.15.1`, the
receipt-owning focused workflow shard passed 3/3 tests with zero failures or
skips across 2/2 suites at
`artifacts/manual/wp5g-ci-focused-final/invariant-vitest-report.json` (1,768
bytes, SHA-256
`edea3fd5acbbe6bb32cddaa48d8f90854424f6c5848854798802e1071f21a5e1`).
Direct invariants passed all four commands in 27,223 ms at
`artifacts/manual/wp5g-invariants-final/invariant-suite-report.json` (7,232
bytes, SHA-256
`7a4c8a73503b77137bd39891cfc0d4eaccd2fe4bedc19db14d04b4923f318bc7`):
contract 13/13, schema 7/7, policy 15/15, and fail-closed 61/61.

The orchestrator aggregate passed 582/584 tests with zero failures and exactly
the two declared Windows POSIX skips across 178/178 suites at
`artifacts/manual/wp5g-orchestrator-final/orchestrator-report.json` (203,902
bytes, SHA-256
`cfbac35a2baa1662f04af5a0559480b89b8ccab5d7edab57874046a363da5186`).
The complete unit aggregate passed 595/597 with zero failures and the same two
skips across 180/180 suites at
`artifacts/manual/wp5g-unit-final/test-report.json` (207,962 bytes, SHA-256
`9ca5dc68aee9ab8d42d43b70319532d66305db1309953855f3c256a7b91c4eea`).
Both long serial commands completed under their unchanged one-hour limits;
their delayed output was observed, not normalized by increasing a limit or
enabling parallelism.

Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/wp5g-typecheck-final`, `wp5g-lint-final`, and
`wp5g-format-final`; their report hashes are respectively
`705e409f6a1032257dc65370aa35aa546b8b639c76253e54dfd2ad4a4b480f14`,
`11b960b7f380f4eca66185de8b367b3b4d12713b37573279b5afa7acb675c99e`,
and `73e68162c1874321c7e23051186edaf95330a68cd45e201477024390ac3e8b95`.
Independent audit matched 11 PASS receipts to 11 declared artifacts totaling
456,720 bytes and recomputed every receipt/artifact count, byte size, SHA-256,
status, and stage/command identity with zero mismatches.

Independent workflow audit found three full-history checkouts, zero dependency
keys/references, nine full-SHA actions, one corrected OCI command, zero
malformed commands, both real Docker probes, no `continue-on-error`, and no
source no-argument verification. Immutable baseline/active/actual hashes,
CAL-1 open/not-started state, commissioned readiness base/profile, permanent
marker history, Doctor `2.0.0`, Status `1.0.0`, all four invariant IDs,
package/lock/parser/matrix/example identities, retained WP4d evidence, private
ref/path absence, and all protected-plan identities passed. No source
no-argument verifier, local OCI substitute, completed WP4d proof, mutating loop
command, dependency change, recommissioning, workflow rerun/dispatch, push, or
remote/ref mutation occurred. Correcting malformed argv did not create a new
durable decision, so the decision log is unchanged.

**Commit.** Assigned by the single cohesive WP5g commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** The corrected OCI invocation still requires a later pushed
hosted run before any real matrix PASS can be credited. The Linux/Windows
controller portability failures and Windows fresh-adopter offline-store
failure remain first-class WP5 gaps and must be addressed from their retained
reports, beginning with the next highest-impact shared cause. The five action
runtime deprecation warnings also remain observable but were not causal here.
WP6 and all product/readiness placeholders remain later; this increment is not
an autonomous-readiness or source-completion claim.

## 2026-08-16 — WP5f hosted CI history and scheduling correction

**Objective.** Correct the failed hosted Exact runtime CI candidate without
rewriting WP5e: establish the exact first failing invariant from authenticated
job logs and artifacts, reproduce it under the exact runtime and checkout
model, restore the commissioned Git authority base to every job, and make the
fresh-adopter and real-OCI boundaries independently schedulable. Preserve all
WP4d/WP5a-e meanings, pins, commands, evidence ownership, and completed
evidence; create one local commit and do not push.

**Hosted diagnosis and outcome before commit.** Authenticated GitHub inspection
of run `31988139046` showed both controller jobs passing checkout, exact Node
`24.18.0`/pnpm `11.15.1` assertion, and frozen install before first failing at
`Run invariant suite`. Both checkouts used the action default `fetch-depth: 1`.
The commissioned base
`0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5` is eight commits behind the
candidate, so neither runner could resolve the Git-owned authority anchor.

Both authenticated artifact downloads matched GitHub metadata exactly: Linux
5,357-byte ZIP / SHA-256
`3261585491f05b279615372cc7917c12e026b222f4dc910fda9eebafcc51e677`;
Windows 5,380-byte ZIP / SHA-256
`77c8412c4550bf36d133ce839117e14a721e6a0b72200915cf4166848bb050c1`.
Each archive contained seven files. The Linux/Windows contract reports were
respectively 2,982 bytes / SHA-256
`22ad84643f817b7376ee30451873a8907361e08ba7a875df62bbaa9f321e441d`
and 2,983 bytes / SHA-256
`981ffbdd653730bdd067022bd34020bf5a7c5ed6c248ca31cec0d820a5694d1a`.
Both stopped at the first `protected-integrity` command, ran 11 expected-identity
checks, and recorded 9 PASS / 2 FAIL: first
`immutable-contract-lock-hash` because the commissioned base was missing, then
`acceptance-prose-bot-aggregation` because base prose was unavailable. Both
outer reports retained exit 1 and no receipt. The runner warning that pinned
actions target Node 20 but are forced onto Node 24 is separate from this
evidence-backed step failure.

A disposable exact-candidate `--depth 1 --no-local` clone with `CI=true`, the
hosted GitHub variables, the workflow evidence root, frozen offline copy-mode
install, and pinned Windows Node/pnpm reproduced one reachable commit, exit 1,
and the identical 11/9/2 report. After `git fetch --unshallow`, the same clone
had 54 reachable commits plus the exact base; the unchanged invariant suite
passed all four commands in 31,058 ms. Independent control audit matched five
PASS receipts to five artifacts totaling 39,420 bytes and contract integrity
passed 13/13 with valid check identity. This establishes missing checkout
history—not changed authority or action-runtime warnings—as the shared cause.

The workflow now supplies `fetch-depth: 0` to all three pinned checkout actions.
The two `needs: controller` edges were removed, so the Linux/Windows
fresh-adopter matrix and Linux Docker job expand and run independently of a
controller conclusion. No replacement condition or `continue-on-error` was
added. The existing workflow contract now binds one full-history checkout to
each job and rejects any `needs` key/reference on the adopter or container
boundary. Focused mutations cover depth-one/omitted history and restored
controller dependencies, in addition to the existing runtime, platform,
command, evidence, and real-OCI mutations. This enforces the already committed
WP5e decision that controller, distributor smoke, and privileged Docker are
separate diagnostic boundaries; no new durable decision was required.

**Verification.** Under pinned Windows Node `24.18.0` and pnpm `11.15.1`, the
accepted receipt-owning focused shard passed 14/14 tests with zero failures or
skips across 9/9 suites at
`artifacts/manual/wp5f-ci-focused-final-2/invariant-vitest-report.json` (5,754
bytes, SHA-256
`bd7854ec353527ca66a067cf5d7f93c5277e3c91153882bc70ea008e6c95c4d3`).
It covers the exact-runtime workflow contract plus invariant/contract receipt
behavior. Direct `pnpm test:invariants` passed all four commands at
`artifacts/manual/wp5f-invariants-final-2/invariant-suite-report.json` (7,264
bytes, SHA-256
`622c48f57302cd8249558ae17c2250433d97d06e4dc52827b6287d1b69ac5902`):
contract integrity 13/13, schema 7/7, policy 15/15, and fail-closed evidence
61/61.

The exact-tree orchestrator aggregate passed 582/584 tests with zero failures
and exactly the two declared Windows POSIX process-group skips across 178/178
suites at
`artifacts/manual/wp5f-orchestrator-final-2/orchestrator-report.json` (203,947
bytes, SHA-256
`4d0a1a238b3351a1feae880fc5591ab07845a50cacc02aef4a4a468a3075db52`).
The exact-tree unit aggregate passed 595/597 with zero failures and the same two
skips across 180/180 suites at
`artifacts/manual/wp5f-unit-final-2/test-report.json` (207,877 bytes, SHA-256
`51c493547a05a699648f88af735a83f873b9c100991ac99a5df2ad93e237bedc`).
Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/wp5f-typecheck-final-2`, `wp5f-lint-final-2`, and
`wp5f-format-final-2`; their report hashes are respectively
`cfaf581b00707ddaddda60898154724c65a2fdada04a8eb9c7bb2895a3c2fc81`,
`c4c0d2c804877c04844ffbaabc9dff16534d8e70bd97ab390e568a1665ee971a`,
and `c7c61b29b84c6ffa610400b6b7f8c903f73814d162bf3ce702187c38bf145204`.
An independent audit matched 11 PASS receipts to 11 declared artifacts totaling
460,616 bytes and recomputed every receipt/artifact byte count and SHA-256 with
zero mismatches.

The first lint gate correctly rejected a literal-four-space scheduling regex
under `no-regex-spaces` and produced no passing receipt. Replacing it with the
exactly equivalent `{4}` form changed one source byte sequence; all focused,
invariant, orchestrator, unit, typecheck, lint, and format gates were therefore
rerun into the cited `final-2` roots on the frozen accepted tree. Earlier green
broad reports are diagnostic only and are not credited.

The independent scope/identity audit matched 46 critical tracked authority,
commissioning, readiness, verifier, Doctor `2.0.0`, Status `1.0.0`, invariant,
config/schema, example, fresh-adopter, and package/lock files to entry HEAD.
All four immutable-lock baseline/active/actual hashes matched with CAL-1 still
open/not started; the commissioned base remained a strict ancestor; the
readiness marker remained permanent in history with no deletion; the four
invariant IDs and 13 contract-check IDs remained exact. Both private state and
lease refs/paths were absent. Both retained WP4d artifacts and all three
protected-plan identities matched. Independent workflow inspection found three
full-history checkouts, zero dependency keys/references, nine full-SHA actions,
all six controller commands exactly once, one real OCI matrix command, and no
completion shortcut.

No source no-argument verifier, completed WP4d proof, local OCI substitution,
mutating loop command, dependency change, recommissioning, workflow rerun,
dispatch, push, or remote/ref mutation occurred. Local OCI was not applicable:
this correction changes scheduling/history, not the OCI executor, and only a
real hosted Docker run can close that boundary.

**Commit.** Assigned by the single cohesive WP5f commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** Hosted validation of the correction remains pending until the
user pushes the WP5f commit. Consequently Linux/Windows controller completion,
POSIX supervisor execution, hosted fresh-adopter smoke, artifact upload, and
real Docker matrix PASS remain unverified for the corrected candidate. After a
push, inspect the new run/logs/artifacts and reconcile canonical documentation
only from actual evidence. WP6 performance work and all product/readiness gaps
remain later and unchanged; WP5f makes no autonomous-readiness claim.

## 2026-08-16 — WP5e exact-runtime cross-platform CI

**Objective.** Complete one bounded WP5 CI increment by adding exact Node
`24.18.0` and pnpm `11.15.1` Linux/Windows controller coverage, a distinct
fresh-adopter smoke, and an applicable Linux-only real trusted-container job.
Preserve every WP4d/WP5a-d contract and evidence boundary, and distinguish
locally verified workflow structure from hosted execution that did not occur.

**Outcome before commit.** The reproduced baseline had no `.github/workflows`
directory. The new least-privilege workflow has pull-request, `master` push,
and manual triggers; full-SHA checkout/setup/upload actions; and three separate
boundaries. The Linux/Windows controller matrix installs and asserts the exact
toolchain, performs a frozen copy-mode install, then runs the existing
receipt-owning invariant, orchestrator, unit, typecheck, lint, and format
commands serially into unique uploaded evidence roots. The separate
Linux/Windows adopter matrix invokes a new CI smoke coordinator, and the
Linux-only Docker job probes a real engine before invoking the unchanged
complete `test:oci-container` normal/adversarial matrix.

The fresh-adopter coordinator uses bundled Corepack and the public
`loop:template:create` command in a disposable directory. It performs a frozen
offline copy-mode install, runs generated typecheck and unit commands, checks
both command-owned receipts and every declared artifact byte/hash, and proves
a clean two-commit bootstrap history, both copied configuration schemas, and
no readiness marker in tree or history. Its versioned result is explicitly
completion-ineligible and autonomous-readiness-ineligible. It does not
commission, launch a browser, run source or generated no-argument verification,
or replace the retained WP4d proof. A dependency-free workflow contract parses
the YAML and rejects mutated runtime pins, platforms, command routing, evidence
root reuse, mock/non-Linux OCI, source no-argument verification, and WP4d proof
invocation.

**Verification.** Under pinned Windows Node `24.18.0` and pnpm `11.15.1`, the
final receipt-owning focused shard passed 45/45 tests with zero failures/skips
across 18/18 suites at
`artifacts/manual/wp5e-ci-focused-final-2/invariant-vitest-report.json` (16,253
bytes, SHA-256
`b19807a8132225bb8fefdb2014fa47a4ea97b5b5310454805dd8119296865bf4`).
It covers the workflow/smoke mutation tests, real adopter generation, and the
package-graph, affected-scope, verification-tier, and benchmark regressions.

The final Windows fresh-adopter smoke passed two receipt-owning generated
commands and 4/4 unit tests with zero failures/skips. Its two declared artifacts
total 2,981 bytes, and
`artifacts/manual/wp5e-fresh-adopter-smoke-final-2/smoke-result.json` is 3,443
bytes with SHA-256
`6dfdcf08814f9a4bd6cb9235b8354bded4196b1702c1aa69b08a2407da04b5cd`.
The generated repository remained clean at its deterministic two-commit
bootstrap identity and the source status/HEAD/tree remained unchanged.

Direct `pnpm test:invariants` passed all four commands in 37,587 ms at
`artifacts/manual/wp5e-invariants-final-2/invariant-suite-report.json` (7,264
bytes, SHA-256
`f3c865fb8bd79667a93d6f8ce432a454cbd88637be5aa34c2710e9187430cf9d`).
The outer result remained completion-ineligible; its children passed contract
integrity 13/13, schema 7/7, policy 15/15, and fail-closed evidence 61/61.

The orchestrator aggregate passed 581/583 tests with zero failures and exactly
the two declared Windows POSIX process-group skips across 178/178 suites at
`artifacts/manual/wp5e-orchestrator-final-2/orchestrator-report.json` (203,606
bytes, SHA-256
`d4e49a4a0b05e418bc7719f4e26a078d4e80f9905bcca097f2a41ce2b4d31449`).
The complete unit aggregate passed 594/596 with the same two skips and zero
failures across 180/180 suites at
`artifacts/manual/wp5e-unit-final-2/test-report.json` (207,491 bytes, SHA-256
`0256c15a321c2f2d9e267e6e1afbd337707e6d82cd2a5a703a6a074d6e95ca66`).
Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/wp5e-typecheck-final-2`, `wp5e-lint-final-2`, and
`wp5e-format-final-2`; their report hashes are respectively
`e29ffb9c49f6d01f4298c7cad28412b770587056affa5f4a5e708753a50d9776`,
`2f4d96280a0514d12897ddae7f68f17dd40803c491baaa546d7e20339dca36f0`,
and `f3d86c5ce55b473847d0de351867009393a89d6bef77c7d1b502e0627a0c820a`.
An independent audit matched 13 PASS receipts to 13 declared artifacts totaling
474,113 bytes and independently confirmed all test, failure, and skip counts.

The first broad attempt is retained but not credited: 565/583 passed, 16
failed, and two skipped because a new top-level `tools/ci` directory matched
the existing `tools/*` workspace pattern and therefore correctly lacked the
required package manifest. Its 217,558-byte report (SHA-256
`352a6e226586c5cfee9b99fa67542951bd853f904985589d60dfea2fa1deff4d`)
identified one shared package-graph cause. Moving helpers inside the existing
orchestrator package preserved package/lock/script identities; the six affected
files then passed 41/41 before the accepted broad retry.

The frozen authority, immutable lock, active/historical commissioning,
readiness marker, exact verifier, Doctor `2.0.0`, Status `1.0.0`, invariant
registry, current config/schema/migrations, examples, package/lock files,
private state/lease absence, retained WP4d evidence, and all three protected-
plan identities are audited separately before commit. No source no-argument
verifier, completed WP4d proof, safety demonstration, mutating loop command,
dependency change, recommissioning, push, or ref mutation occurred.

**Commit.** Assigned by the single cohesive WP5e commit containing this entry;
identify it as the newest commit touching the entry. No push is authorized.

**Known gaps.** Local Windows execution proves workflow structure and the
generated-adopter smoke, not hosted behavior. GitHub has not yet run the Linux
or Windows matrices, artifact upload, POSIX supervisor cases, or the real
Linux Docker job; no hosted or local OCI PASS is claimed. Those actual hosted
runs and any evidence-driven final WP5 documentation reconciliation remain
outstanding. WP6 performance work remains later. The source is still honestly
blocked from autonomous readiness by its adopting-product placeholders and
other existing Doctor blockers; WP5e is not autonomous readiness or a push.

## 2026-08-16 — WP5d strict configuration schema parity

**Objective.** Complete one bounded WP5 strict-config increment by publishing
the missing current `OrchestratorConfig` JSON Schema and proving one shared
acceptance/rejection corpus through both real runtime parsing and the schema.
Preserve the earlier runtime rejection of unknown root fields, every supported
legacy migration, and all WP4d/WP5a-c contracts and evidence.

**Outcome before commit.** The runtime was already strict at the root; the
reproduced gap was the absence of
`schemas/orchestrator-config.schema.json` and any executable runtime/schema
parity corpus. The new strict `1.6.0` schema closes every root and nested object,
references the existing model-policy schema, expresses the mandatory protected
floor, and is copied with its reference into generated adopter packages. The
model-policy schema now matches existing runtime rejection of whitespace-only
override reasons and duplicate override roles; runtime policy behavior did not
change.

A dependency-free test-only JSON Schema 2020-12 evaluator resolves local and
external references, enforces the exact keyword subset used by both schemas,
and throws on unsupported keywords. Forty named cases each assert the expected
disposition independently under `loadConfigForInspection` and schema
evaluation, then assert differential equality. They cover maintained valid
source/example configurations, valid boundary variants, the intentionally
invalid raw placeholder template, unknown root and closed nested keys, missing
keys, and representative value/path/list failures. Structural assertions bind
all closed property/required sets and the schema's protected floor to runtime
fixtures/constants. Legacy `1.0.0` through `1.5.0` inputs remain owned by the
unchanged migration path; repository-dependent cross-field checks remain
strict runtime-only semantics.

**Verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, the
receipt-owning affected shard passed 69/69 tests with zero skips across 11/11
suites at
`artifacts/manual/wp5d-config-schema-focused-final/invariant-vitest-report.json`
(23,154 bytes, SHA-256
`77b344f481a412b94810943b7cf4985d861e481a0133fcadeffab3f7b55b64f5`).
This includes 42/42 parity/structure/evaluator tests and a real generated
adopter whose config validates against its copied schemas. The wrapper's
optional direct-telemetry begin hook could not load the TypeScript-only
`path-safety.js` import under plain Node, so telemetry is null; the semantic
report and PASS receipt are complete.

Direct `pnpm test:invariants` passed all four serial commands in 29,059 ms,
below its 60-second warm target, at
`artifacts/manual/wp5d-invariants-final/invariant-suite-report.json` (7,232
bytes, SHA-256
`7cd9a4cce21063a09430d0c3226d2eca9caa5756820f2823af331e6a4d833693`).
The outer report remained explicitly completion-ineligible. Its children
passed contract integrity 13/13, schema 7/7, policy 15/15, and fail-closed
evidence 61/61. The direct contract report remained completion-ineligible at
`entries/protected-integrity/contract-integrity-report.json` (3,531 bytes,
SHA-256
`18a7c2029615685dbb349a65db07486e939d96474497910282847cbb8850d6d7`).

The orchestrator aggregate passed 577/579 tests with zero failures and only the
two declared Windows POSIX process-group skips across 174/174 suites at
`artifacts/manual/wp5d-test-orchestrator-final/orchestrator-report.json`
(201,850 bytes, SHA-256
`6ea09b0d6431166ea88030159e77b3e9a33de019bfe6cfd5056d3e7afd217c20`).
The unit aggregate passed 590/592 with the same two skips across 176/176 suites
at `artifacts/manual/wp5d-test-unit-final/test-report.json` (206,052 bytes,
SHA-256
`a23980c4376548dc247cd8e3d5eab35ccf1d5fe2cba135f8132704b29891de23`).
Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/wp5d-typecheck-final`, `wp5d-lint-final`, and
`wp5d-format-final`; their report hashes are respectively
`2540e3c6155ab20c1971bb940ebbb4eb6cd784e787e0de4ad4b6e15fb1c6fe53`,
`012193e1acb18740e236708f9f394cf589285030adb1d06ec4a0c613724d10ec`,
and `53633d763f14ac37272fd7801634c524fa7658e42a348edd7bfa7009314f08ca`.
An independent audit matched all 11 PASS receipts to all 11 declared artifacts
(474,994 artifact bytes) and independently confirmed every reported test total,
failure, and skip.

The frozen authority, immutable lock, active/historical commissioning,
readiness marker, exact verifier, invariant registry, Doctor `2.0.0`, Status
`1.0.0`, default readiness profile, package/lock files, maintained configs,
worked example, private ref/path absence, and both retained WP4d artifacts all
matched their entry identities. The protected human plan retained all three
required identities and remained the sole user-owned untracked path. No source
no-argument verifier, OCI matrix, safety demonstration, completed fresh-adopter
proof rerun, mutating loop command, dependency install, recommissioning, push,
or ref mutation occurred. OCI/safety evidence was not applicable because this
increment changes neither provider execution nor controller mutation/recovery.

**Commit.** Assigned by the single cohesive WP5d commit containing this entry;
identify it as the newest commit touching the entry. No push is authorized.

**Known gaps.** Remaining WP5 work is exact-runtime Linux and Windows CI with
fresh-adopter smoke plus an applicable real trusted-container CI job, followed
by any final canonical-documentation reconciliation supported by those runs.
WP6 verification-efficiency work remains later and separately gated. The
source remains honestly blocked from autonomous readiness by its placeholder
product/build/runtime/state conditions. WP5d is not full WP5, cross-platform
proof, readiness repair, product implementation, autonomous readiness, or a
push.

## 2026-08-16 — WP5c shared contract-integrity invariant

**Objective.** Complete one bounded WP5 independent-invariant increment by
extracting the existing 13-check contract-integrity evaluation into one
controller-owned module consumed by both the authoritative verifier and a
completion-ineligible invariant adapter. Preserve ordinary focused verifier
semantics while removing the invariant suite's unrelated dependency on the
environment stage.

**Outcome before commit.** `src/contract-integrity.ts` now owns the exact
ordered contract checks and accepts the existing commissioned-authority
validator as an explicit dependency, which keeps it directly loadable from
plain Node. `scripts/verify.mjs` delegates its unchanged contract stage to that
module. The source and generated-adopter `protected-integrity` registry entries
invoke `verification-cli.ts contract-integrity` directly and require a
`contract-integrity-report`; no package command, registry ID, profile/stage
selection, or completion path changed. The adapter requires the exact healthy
check identity, retains a failing diagnostic without a receipt, and marks both
its `contract-integrity-report.v1` and the outer invariant-suite `1.1.0` report
`completionEligible:false`. Tier implementation loading is deferred until a
tier mode is selected, so the narrow contract command does not load unrelated
SDK/tier dependencies.

**Verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, the accepted
receipt-owning contract/routing/package/verifier shard passed 28/28 tests with
zero skips across 14/14 suites at
`artifacts/manual/wp5c-contract-focused-final-3/invariant-vitest-report.json`
(10,135 bytes, SHA-256
`7042cb4b802d2b42ea0424142dfa2ba5f479258ed03c100c7e83e51ac8e380f8`).
It proves exact healthy check ordering, authoritative-verifier parity with the
unchanged `environment,contract-integrity` focused selection, generated-adopter
routing, and a real commissioned-contract corruption that exits 1, retains an
ineligible failing report, and writes no PASS receipt.

Direct `pnpm test:invariants` passed all four serial commands in 27,751 ms,
below its 60-second warm target, at
`artifacts/manual/wp5c-invariants-final/invariant-suite-report.json` (7,232
bytes, SHA-256
`2b65afaf50a8e8ab5b8f8f76389c61f8fdd1ba34db0ff3f6cc68934a8161798a`).
Its first argv is the direct adapter, not `pnpm verify`; the child report is
completion-ineligible and passed all 13 checks at
`entries/protected-integrity/contract-integrity-report.json` (3,531 bytes,
SHA-256
`9e6b1eeb8ada30e398745bcc0d690f967ebb24293a3db2e6f04435f1d5bc8945`).
The other receipt-owning children passed schema 7/7, policy 15/15, and
fail-closed verifier 61/61, with no environment or aggregate verifier result.

The orchestrator aggregate passed 535/537 tests with zero failures and only
the two declared Windows POSIX process-group skips across 172/172 suites at
`artifacts/manual/wp5c-test-orchestrator-final/orchestrator-report.json`
(188,743 bytes, SHA-256
`489c1c570ded68a41c628ca2ab1acf5e4e4ab8a41aeff32d0cb4bd8bff2a0341`).
The unit aggregate passed 548/550 with the same two skips across 174/174 suites
at `artifacts/manual/test-unit-3532/test-report.json` (192,753 bytes, SHA-256
`f6e05cf9e111d163e874ace11682bff36ce5826e296452c5bf6229612f167e9c`).
Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/wp5c-typecheck-final`,
`artifacts/manual/wp5c-lint-final`, and
`artifacts/manual/wp5c-format-final`; their report hashes are respectively
`a864a46d8fbda1d2056ea61073b815a9551bb42da37936ff35f460dfff5f71e0`,
`2f759e5b623a519e4cd9333dbfb5c124953093fa5e2fb86b3b5255940066ecb3`,
and `63128dac587b1252fbab116839b9a7a4fd1c318f1bf68a35bd10958b9a8b8c5d`.
Every cited receipt, nested receipt, and declared artifact byte count/SHA-256
independently matched.

Two earlier affected-shard attempts correctly retained no PASS receipt at
27/28: the disposable corruption process first inherited an evidence context
for the source repository, then exposed that the source-installed evidence
runtime could not own a receipt for a different clone. The accepted fixture
copies the current adapter/evaluator/CLI into the commissioned clone so its
evaluation and receipt authority agree. The focused wrapper's optional direct
telemetry begin hook remained unavailable because its plain-Node path resolved
a TypeScript-only transitive module as a missing `.js`; this was non-semantic,
and the command-owned PASS receipt/report are complete. No source no-argument
verifier, OCI matrix, safety demonstration, fresh-adopter proof rerun, mutating
loop command, recommissioning, readiness repair, or push occurred.

The immutable authority, active/historical commissioning, readiness marker,
default/scope/slow/benchmark registries, package/lock files, worked example,
fresh-adopter fixture, private ref/path absence, and both retained WP4d
artifacts remained unchanged. The protected human plan remains the sole
user-owned untracked path after the intended WP5c files are staged and retains
its required byte/hash/blob identities.

**Commit.** Assigned by the single cohesive WP5c commit containing this entry;
identify it as the newest commit touching the entry. No push is authorized.

**Known gaps.** Remaining WP5 work owns strict rejection of unknown config
fields plus its differential schema corpus, exact-runtime Linux and Windows CI
including fresh-adopter smoke, and an applicable real trusted-container CI
job. The source remains honestly blocked by the protected human plan, absent
production build, active product placeholders, unavailable trusted runtime/
image, and absent exact canonical state. WP5c is not full WP5, readiness
repair, autonomous readiness, product implementation, or a push.

## 2026-08-16 — WP5b canonical lifecycle status

**Objective.** Complete the bounded Status slice of WP5 by making
`pnpm loop:status -- --json` the single versioned, read-only resume surface for
uninitialized, ordinary initialized, pending-operation, target-drift, and
active-reconciliation states. Preserve the accepted WP5a Doctor authority and
all WP4d evidence while closing the roadmap gap for commissioning/profile,
target relation, lease, pending side effect, recovery disposition, latest
milestone/exact verification, integration eligibility, deferred work, and the
next safe command.

**Outcome before commit.** Status schema `1.0.0` composes accepted Doctor
schema `2.0.0` facts with validated canonical state and the existing read-only
operation inspectors; it does not search artifacts or derive completion from
logs. Target relation is explicitly target-oriented and distinguishes
`current`, `ahead`, `behind`, `divergent`, `uninitialized`, and fail-closed
`unavailable`. Recovery is normalized as `automatic`, `blocked`, `external`,
or `none`. Ordinary status now routes before reconciliation-controller opening,
so active reconciliation retains the common status contract without acquiring
a mutation capability. `reconcile-status`, Doctor, dry-run, mutation,
commissioning, provider, state, and verifier behavior are unchanged.

Doctor and detailed state are fenced to one canonical generation. When valid
commissioning aligns the branch sources, the Doctor observation, checkout,
and target-ref HEAD must also agree. Status retries movement once and then
returns `changed-during-inspection`, suppresses detailed state and integration
eligibility, and directs the operator to rerun status. Ancestry probes suppress
optional Git locks. CLI recursive redaction remains in force, and real child
process tests prove both active-state and missing-state paths leave status,
refs, state storage, and repository files unchanged.

**Verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, the
receipt-owning status/CLI/deterministic-operation shard passed 20/20 with zero
skips at
`artifacts/manual/wp5b-status-focused-final/invariant-vitest-report.json`
(7,566 bytes, SHA-256
`622931a8a34c2395f9d9af886c96dba7e48eec8b58a63e7ac6c2e393ecc48fd5`).
Its direct-telemetry begin hook was unavailable because the planned plain-Node
wrapper could not import a TypeScript module; this was reported as non-semantic,
while the command-owned PASS receipt and declared report remained complete.
The orchestrator aggregate passed 532/534 with zero failures and only the two
declared Windows POSIX skips across 170/170 suites at
`artifacts/manual/wp5b-test-orchestrator-final/orchestrator-report.json`
(187,483 bytes, SHA-256
`3a24a9905d4386a5c7c2de29d564313143ab9af0b49c83bd6d427e565f9e7236`).
The unit aggregate passed 545/547 with zero failures and the same two skips
across 172/172 suites at
`artifacts/manual/wp5b-test-unit-final/test-report.json` (191,507 bytes,
SHA-256
`adf81a781c1b9770b5d17984a204d1f7c8fe93b8a64604b20524322e33e9b06f`).

Receipt-owning typecheck, lint, and format all passed at
`artifacts/manual/wp5b-typecheck-final`,
`artifacts/manual/wp5b-lint-final`, and
`artifacts/manual/wp5b-format-final`; their report hashes are respectively
`69848e5391d2f1cdd5b12f10cc0960a231caa32b6872d79108ff4b863a0fc469`,
`12ceeddbeabb60e14088a18cd895ac120eca6433c112485a917eb1b9eaa90d84`,
and `ad28882c2184f6d2a73ccb80cbed5e49239604b1f950079a514c6efa1b15387b`.
Every receipt, manifest, declared report byte count, and SHA-256 independently
matched. `pnpm loop:demo-safety` passed all six scenarios at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260816171558718-6e19b0f2.json`
(14,968 bytes, SHA-256
`07fbaec742fe438634fa22e72ed4111926e13a4699ed422eae6f69c9ef3dac5d`).

Final source status emitted schema `1.0.0` with a stable snapshot, valid
readiness commissioning, target `master`, uninitialized canonical relation,
no lease or pending side effect, recovery `none`, no completed milestone or
exact verification, unavailable trusted execution, ineligible autonomous
integration, the accepted 9 passes / 3 warnings / 4 blockers, and
`git status --short --branch` as the next safe command. The state path and
private state/lease refs remained absent. HEAD/tree, tracked and staged bytes,
protected-plan identities, and both retained WP4d artifact identities remained
unchanged. No no-argument source verifier, OCI matrix, Doctor evidence rerun,
fresh-adopter proof, mutating loop command, push, or WP6/product/readiness work
occurred.

**Commit.** Assigned by the single cohesive WP5b commit containing this entry;
identify it as the newest commit touching the entry. No push is authorized.

**Known gaps.** The next dependency-ordered WP5 area is independent invariant
extraction. Later WP5 work still owns the strict-config corpus, Linux/CI race
coverage, and remaining operator documentation. The source remains honestly
blocked by the protected human plan, absent production build, active
placeholders, unavailable trusted runtime/image, and absent exact canonical
state. WP5b is not full WP5, readiness repair, autonomous readiness, product
implementation, or a push.

## 2026-08-16 — WP5a strict operational Doctor

**Objective.** Complete the bounded Doctor slice of WP5 by turning
`pnpm loop:doctor` into a complete read-only operational diagnostic and adding
a Doctor-only strict blocker exit, without changing source readiness,
commissioning, provider policy, product placeholders, or WP4d evidence.

**Outcome before commit.** Doctor schema `2.0.0` gives every check a stable
`pass`, `warning`, or `block` result with code, message, remediation, and safe
command where one exists. It emits complete ordered issues, counts, current
autonomous-integration eligibility, and the earliest safe next action. Ordinary
Doctor exits zero after an honest `ready` or `blocked` result; `--strict` emits
the same diagnostic and exits 2 only when a block exists. Structural config and
the installed SDK are independent facts, while normal config loading retains
its exact installed-SDK assertion.

The diagnostic reuses active commissioning and all four tier plans, the
production-build contract, provider capability/identity, canonical state,
operation recovery, protected-root, protected-identity, and lease authorities.
Configured paths are checked lexically and through the nearest existing
ancestor/realpath without creation. Exact verification is accepted only from
validated canonical state, a current intact copied result, readiness profile,
and the matching active completion-eligible provider identity. Pending
operations and simultaneous protected drift remain independently visible.
Doctor makes no network call and launches no build, verifier, container,
candidate command, or Codex turn; it writes no path, state, ref, mirror,
evidence, lease, or configuration.

**Verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, the accepted
receipt-owning Doctor/CLI/config shard passed 38/38 at
`artifacts/manual/invariant-vitest-7236/invariant-vitest-report.json` (13,426
bytes, SHA-256
`b7d62bb9cfbfe6b8b489e9802ddee2b77a2a0739e6c131042a0f2e7aafd7358f`).
The full orchestrator aggregate passed 523/525 with zero failures and only the
two declared Windows POSIX process-group skips at
`artifacts/manual/test-orchestrator-19716/orchestrator-report.json` (184,077
bytes, SHA-256
`fcc44893f0922bb3006cb6e16114d45e14b5fa89c6f78c9648fcf96232e8aad6`).
The unit aggregate passed 536/538 with the same two skips at
`artifacts/manual/test-unit-23304/test-report.json` (188,245 bytes, SHA-256
`9ab63d42d3ed2f01082799cf016ade0b69ba32125b73ab4018b7b7c41d6f5446`).
Every report hash/size matched its PASS receipt. Typecheck, lint, and format
passed with independently matched receipts at
`artifacts/manual/typecheck-7452`, `artifacts/manual/lint-22044`, and
`artifacts/manual/format-check-8972`. `pnpm loop:demo-safety` passed every
scenario at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260816150722143-fe2a229a.json`.
No source no-argument verifier, OCI matrix, fresh-adopter proof, or mutating
loop command ran. Final ordinary and strict source Doctor emitted byte-equivalent
schema `2.0.0` diagnostics with 9 passes, 3 warnings, and the honest 4 blockers
(dirty protected plan, missing production build, active placeholders, missing
trusted runtime). Ordinary exited 0, strict exited 2, integration remained
ineligible, and `git status --short --branch` was the next command. Git status,
absent state/lease refs, and absent state-path facts were unchanged.

**Commit.** Assigned only after the frozen WP5a candidate passes its final
Doctor, diff, staged-scope, and protected-identity audits; identify it as the
newest commit touching this entry.

**Known gaps.** Later WP5 increments still own status expansion, independent
invariant extraction, strict-config corpus, Linux/CI race coverage, and
operator documentation beyond Doctor. The source remains deliberately blocked
by the protected human plan, placeholder scripts, absent production-build
declaration, unavailable trusted runtime/image, and absent exact state. WP5a is
not full WP5, autonomous readiness, product implementation, or a push.

## 2026-08-15 — WP4d fresh-adopter bootstrap packaging

**Objective.** Complete one bounded WP4d distributable-template increment that
creates a fresh adopter-owned Git history without verifier source edits and
proves the generated technical scaffold can reach a truthful package-default
bootstrap PASS without changing or reinterpreting source readiness.

**Outcome before final milestone verification.** A strict versioned definition
and public no-clobber package command now generate the authority lock, generic
active configuration and registries, package metadata, real bootstrap app, two
deterministic commits, and a strict-ancestor commissioning input. A shared
Git-base anchor replaces the source-specific verifier hash literal and requires
the current lock and all four authority files to match the exact commissioned
base. The scaffold uses one kernel for Node, replay, Worker, persistence, and
rendering; every bootstrap stage exercises a real boundary and owns hashed
evidence. A separate retained proof runner adds offline copy-mode installation,
explicit one-shot commissioning, the manifest commit, one no-argument verifier,
independent receipt/artifact matching, marker/history checks, source-identity
scanning, and compact retained browser evidence.

**Implementation diagnostics.** No source aggregate, source no-argument
verifier, or OCI matrix was used for orientation. Under pinned Node `24.18.0`
and pnpm `11.15.1`, the authority/commissioning/package files passed 21/21
focused tests, direct tool TypeScript passed, and the proof auditor passed 3/3
including post-receipt artifact drift and asserted-PASS rejection. In a newly
generated commissioned fixture, dependency, format, lint, architecture,
typecheck, clean-clone build, four Vitest tests, two invariants, persistence,
Node/replay/Worker simulation, and real Chromium browser commands all passed.
The single budgeted diagnostic literal no-argument fixture run passed all 9
bootstrap stages in 40,944 ms with 10 valid command receipts and 18 declared
artifacts. Its result is 45,280 bytes / SHA-256
`21621834eaf1999de6034483ae9210a44c0ade1b1d2437ef0d4c3db2bc0a0177` at
`artifacts/wp4d-package-diagnostic-8/repository/artifacts/verify-2026-08-16T045227-338Z-8888/result.json`.
It reports `bootstrap_complete`, `autonomousReadinessEquivalent:false`, clean
candidate identity, and honest provider-based completion ineligibility. The
122,990-byte screenshot has SHA-256
`da927d28bc0d2132d4f4e5fe347059d5fb11586452c38c5b40fc9fc808bf0c21`.
Independent in-app browser inspection observed the readable production layout,
public Worker action, canonical extracted-4/tick-3 consequence, and no warning
or error diagnostics.

**Stable-tree milestone protocol.** Source, tests, template assets, definition,
documentation, this log, and the execution plan freeze before one exact
receipt-owning affected shard, one retained fresh-adopter proof, serial
orchestrator and unit aggregates, and receipt-owning typecheck/lint/format
gates. No OCI matrix or safety demonstration is applicable because no
executor/provider owner or canonical safety primitive changed. Every source and
fixture receipt, artifact, count, skip, duration, identity, protected/example
hash, and package inventory is independently checked before one cohesive
commit. Literal no-argument source `pnpm verify` runs exactly once afterward
and its known product/provider/dirty-file/deadline gaps remain honest.
The first final lint gate exposed and rejected an empty JSON/Markdown-only
fixture directory passed as an ESLint target. A tested fixture-local definition
entry point now supplies a real lintable boundary while leaving the package-
copied evidence runtime byte-identical to the retained proof.

**Audited pre-commit evidence.** The accepted affected shard passed 57/57 at
`artifacts/manual/invariant-vitest-20152/invariant-vitest-report.json`.
The retained proof at
`artifacts/wp4d-fresh-adopter-proof-final-3/proof-result.json` is 2,424 bytes /
SHA-256 `1561bbf47a910a3a2d54f35b1114ff51b79395d007e35fea8b093af8e27c37ff`;
its clean fresh repository passed 9/9 bootstrap stages with 10 valid receipts,
18 matched artifacts (136,506 bytes), 4/4 tests, and verifier result SHA-256
`1ea5cc51597047eecd6054701989d2096484a7e9162f3cb93afbd3a749b8ff9c`.
A package-only post-fix regeneration matched all 114 initial retained paths,
bytes, hashes, commits, and pre-commission tree without another verifier run.
The exact-tree orchestrator aggregate passed 514/516 at
`artifacts/manual/test-orchestrator-1576/orchestrator-report.json`; unit passed
527/529 at `artifacts/manual/test-unit-18672/test-report.json`. Both have zero
failures/todos and only the two declared Windows skips for POSIX process-group
termination. All receipt/artifact hashes and sizes, durations, and five slowest
tests were independently audited. Typecheck, lint, and format passed at
`artifacts/manual/typecheck-13140`, `artifacts/manual/lint-19384`, and
`artifacts/manual/format-check-21068`. Immutable/config/example diffs are zero,
all protected-plan identities match, and the source remains readiness with its
permanent marker. No OCI matrix applies because no provider/executor owner
changed.

**Commit.** Assigned only after the frozen WP4d candidate passes the applicable
checks; identify it as the newest commit touching this entry.

**Known gaps.** Bootstrap is only a technical scaffold. Product-domain breadth,
CAL-1, trusted default-Windows completion eligibility, hidden validation,
autonomous readiness, and human verification remain open. A later plan must
perform the permanent one-way readiness transition before substantive product
implementation. WP4d makes no readiness claim and does not push.

## 2026-08-15 — WP4c explicit historical worked-example boundary

**Objective.** Complete one bounded WP4c packaging increment by making the
already-placed Ski Tycoon configuration self-validating and explicitly
legacy-only, without moving or rewriting its historical JSON payloads or
allowing any example identity into active source commissioning.

**Outcome before final milestone verification.** A strict
`worked-example.v1` descriptor pins the complete package, source provenance,
legacy/inactive/no-fallback semantics, per-file provenance, roles, byte counts,
hashes, paths, and identities. The read-only
`pnpm loop:example:validate -- --descriptor <file>` route requires exact
contained regular tracked files, validates all six JSON schemas plus manifest/
registry/check/protected cross-links, and deterministically reports every
payload. It never runs the historical benchmark, requires its unavailable
commits, commissions the v1 manifest, or mutates repository state. The three
unchanged source snapshots are distinguished from the three maintained
compatibility adapters. All six example JSON payloads remain byte-identical to
entry. The active slow-suite ID is now generic, the reusable benchmark template
no longer defaults to D-032, and active manifest/input/config registries remain
free of D-031/D-032 and Ski Tycoon identity.

**Implementation diagnostics.** No broad suite or verifier was used for
orientation. Under pinned Node `24.18.0` and pnpm `11.15.1`, the new focused
file passed 9/9 cases covering exact/deterministic validation, descriptor and
CLI strictness, containment, regular/tracked/exact file sets, byte/hash drift,
JSON/schema drift, cross-links, and active/legacy isolation. The seven-file
affected diagnostic passed 66/66, including the unchanged commissioning,
config, invariant, manifest, schema, and protected-root boundaries. Direct
TypeScript and new-file lint diagnostics passed. The explicit source command
reported the 2,948-byte descriptor at SHA-256
`e4f3c1496603ae5dbd3189f02177cd5e200693cf42ff5a8f6e683712920faa70`
and all seven pinned package files with no mutation. These are iteration
diagnostics, not final receipts.

**Stable-tree milestone protocol.** Source, tests, descriptor, documentation,
this log, and the execution plan freeze before one receipt-owning focused
shard, serial orchestrator and unit aggregates, and receipt-owning typecheck,
lint, and format gates. No OCI matrix or safety demonstration is applicable
because no executor/provider or canonical protected-catalogue owner changes.
Every receipt, artifact, count, skip, duration, candidate identity, and
immutable/protected/example hash is independently checked before the cohesive
commit. Literal no-argument `pnpm verify` runs exactly once afterward and any
unrelated product, provider, dirty-tree, or deadline gaps remain honest.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP4c checks; identify it as the newest commit touching this entry.

**Known gaps.** A later WP4 increment must prove a fresh distributable adopter
reaches a truthful bootstrap PASS. Product placeholders, calibration, trusted
default-Windows execution, autonomous readiness, hidden validation, and human
verification remain open. WP4c makes no readiness claim.

## 2026-08-15 — WP4b deterministic source commissioning

**Objective.** Add one deterministic, fail-closed commissioning workflow and
use it to publish the source repository's active generic v2 manifest, without
rewriting historical evidence, frozen authority, readiness history, product
placeholders, provider boundaries, or verifier policy.

**Outcome before final milestone verification.** The standalone
`pnpm loop:commission -- --input <file>` command validates an absent active
path; completely clean tracked and untracked state; attached configured target
branch; exact strict-ancestor base; explicit bootstrap/readiness lifecycle;
authority, immutable-lock, and verifier-anchor agreement; generic registry and
protected-root identities; package-owned focused commands; exact and
reconciliation policy; and all four tier plans. Its canonical timestamp comes
from the base commit. It stages exclusive deterministic bytes, detects
identity/status drift, publishes no-clobber, performs a read-only post-generation
doctor, reports path/bytes/SHA-256, and cleans or exactly rolls back its owned
output on injected faults.

The source target is corrected from `main` to its real `master` branch and the
active invariant/scope ids are generic. Historical v1 records and adapters
remain explicit legacy contexts. In a clean clone of the exact candidate, the
tracked source input (6,561 bytes, SHA-256
`59f053d0b4ed195e2fda8746f8ee018ea3c97706c07f53a37908c40ef41b8629`)
commissioned `.agent/verification-manifest.json` at 7,124 bytes and SHA-256
`f765765d8082280282151253e616f87a460dbe8c38f17909aa22d7dcb7930dd9`.
The manifest binds WP4a base
`0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5`, `master`, package-default
readiness, the base's real `2026-08-15T20:50:19.000Z` timestamp, the current
generic registries and complete catalogue, and no D-031/D-032 or Ski Tycoon
identity. The commissioning doctor passed and constructed iteration,
candidate, milestone, and periodic plans; exact verification appears only in
milestone and periodic.

**Implementation diagnostics.** No broad suite or full verifier was used for
orientation. Under pinned Node `24.18.0` and pnpm `11.15.1`, the commissioning
fixture file passed 13/13 cases, including fresh bootstrap/readiness adopters,
twin-clone determinism, dirty trees, bases/branches/profiles/marker history,
authority/lock/registry/catalogue drift, unsafe input, partial writes, races,
rollback, reporting, and read-only doctor behavior. Six manifest, schema,
config, tier, doctor, and protected-root files passed 66/66, and the tools
TypeScript diagnostic passed. These are iteration diagnostics, not final
receipts.

**Stable-tree milestone protocol.** Source, tests, this log, the execution
plan, schema, generated input/manifest, and documentation freeze before the
final commands. Two receipt-owning focused shards, the live safety
demonstration, serial orchestrator and unit aggregates, and receipt-owning
typecheck/lint/format gates write fresh ignored evidence. Their outcomes remain
in machine-owned artifacts and the final handoff rather than being backfilled
into tracked files. Every receipt, declared artifact, count, skip, duration,
candidate identity, and immutable/protected hash is independently checked
before the cohesive commit. Literal no-argument `pnpm verify` runs exactly once
afterward and its unrelated product/infrastructure gaps remain honest.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP4b checks; identify it as the newest commit touching this entry.

**Known gaps.** WP4c may relocate or modernize the Ski Tycoon worked example.
Product placeholders, calibration, trusted default-Windows execution,
autonomous readiness, hidden validation, and human verification remain open.
WP4b makes no readiness claim.

## 2026-08-15 — WP4a generic verification-manifest foundations

**Objective.** Replace the active D-031/D-032-specific commissioning contract
with a generic manifest and make configuration/tier runtime paths resolve exact
verification from the package-default profile, without migrating the retained
source record or weakening readiness, reconciliation, provider, or protected
authority gates.

**Outcome before final milestone verification.** Active manifests now use
strict `verification-manifest.v2` at `.agent/verification-manifest.json`, with
generic commissioning, objective, focused command, protected-path, invariant,
scope, exact, and reconciliation policy fields. Config loading proves the
commissioned profile equals the package default; all four tier plans consume a
source-independent generic fixture. Bootstrap exact indexes are representable
but remain non-authoritative and are explicitly rejected by readiness
reconciliation. The frozen v1 source and Ski Tycoon records are accepted only
by closed historical contexts; the source reconciliation adapter strengthens
their protected set with the current floor and cannot act as a general active
loader. Its required v2 timestamp comes from the retained record's real Git
commit timestamp. Both active and retained source paths remain automatically
protected while present. The source repository intentionally has no active v2
manifest until WP4b.

**Implementation diagnostics.** Read-only entry inspection confirmed synced
HEAD `2b65ddc860e5c8387de57aa6f2f624f4a734f167`, tree
`30e787d81c5faee1ae7080f2ffaf845fb8eab268`, zero branch divergence, a clean
tracked tree, and the protected human file's four expected identities. No
orientation aggregate or OCI case was run. Under pinned Node `24.18.0` and pnpm
`11.15.1`, the first five-file diagnostic ran 50 tests: 49 passed and the
historical adapter exposed one missing-current-trust-floor defect. After the
one-way protected-root union, the focused manifest file passed 6/6. A direct
stabilized-interface TypeScript diagnostic then passed. These are iteration
diagnostics, not final receipts.

**Stable-tree milestone protocol.** Source, tests, this log, the execution plan,
schema, and documentation freeze before the final commands. Two exact
receipt-owning focused shards, the live safety demonstration, serial
orchestrator and unit aggregates, and receipt-owning typecheck/lint/format gates
write fresh ignored evidence. Their outcomes remain in machine-owned artifacts
and the final handoff rather than being backfilled into tracked files. Every
receipt, declared artifact, count, skip, duration, candidate identity, and
immutable/protected hash is independently checked before the cohesive commit.
The required no-argument verifier runs exactly once afterward and its known
unrelated non-passing conditions remain honest.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP4a checks; identify it as the newest commit touching this entry.

**Known gaps.** WP4b must commission the active source manifest and its
workflow without changing the historical record. Product placeholders,
calibration, trusted default-Windows execution, autonomous readiness, hidden
validation, and human verification remain open. WP4a makes no readiness claim.

## 2026-08-14 — WP3d disposable Docker execution candidate

**Objective.** Implement the OCI data plane behind WP3c's fail-closed provider:
an exact disposable verification clone, immutable image/input identity, fixed
runtime policy with independent inspection, bounded daemon-owned lifecycle and
storage, safe artifact export, real normal/adversarial containment coverage,
and no local or WSL fallback.

**Outcome before final milestone verification.** Docker-only executor version
1.0.0 is wired into `trusted-container`; Podman remains an explicit policy
mismatch. Every command uses a fresh exact clone, candidate container, read-only
exporter, and bounded workspace/evidence tmpfs volumes. Source and the pnpm v11
store are the only host binds and are read-only. The image, interpreted mount,
network, privilege, namespace, resource, and volume policies are inspected
before launch. Timeouts and output breaches stop/kill at the daemon, and every
container/volume removal must be confirmed. Export accepts only regular
single-link files, enforces combined file/byte limits, writes through an
exclusive open inode, and repeats source/destination size/hash checks. The
controller-owned report binds the daemon version, image ID/input hash,
provider capability, candidate commit/tree, lifecycle, policy, cleanup, and
artifact inventory.

**Implementation evidence.** The committed WP3c handoff evidence and hashes,
tree status, plan/logs, audit CD-01/P0.2, provider call sites, and
`pnpm loop:doctor` were inspected without a full-verifier baseline. With the
user's authorization, Ubuntu Docker Engine/client `29.1.3`, containerd `2.2.1`,
runc `1.3.4`, exact Linux Node `24.18.0`, and pnpm `11.15.1` were commissioned
inside the existing WSL2 distribution. The pinned base is
`node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059`.
Image input SHA-256
`0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3`
was built once to immutable local image
`sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad`;
subsequent unchanged-input probes reused the image and never a candidate
container.

A focused real normal-path diagnostic passed at
`artifacts/wp3d-oci-normal-policy-repro-20260814-r14/result.json` (2,401 bytes,
SHA-256 `6b08bf27811432831e84a84ff620c73dccc8f700a8b5de0049d5356603b01503`),
covering offline install, build, typecheck, Vitest, read-only Git, a valid
command receipt, artifact export, and confirmed cleanup. It predates the final
stable candidate and is diagnostic only, not reused as milestone evidence.
During hardening, the combined focused shard correctly exposed two 5-second
artifact-copy stalls at
`artifacts/manual/invariant-vitest-4604/`; after replacing the stream-close
dependency with bounded handle-based copying, the artifact suite passed 5/5 at
`artifacts/manual/invariant-vitest-428/`. After adding the strict environment
allowlist, pre-copy artifact preflight, and malformed-volume cleanup regression,
the affected executor suite passed 10/10 in 5,729 ms at
`artifacts/manual/invariant-vitest-13336/` and typecheck passed in 8,122 ms at
`artifacts/manual/typecheck-22284/`. The final regression proves cleanup is
attempted when a daemon may have accepted a create whose client response timed
out. Both command-owned receipts and their declared artifacts were independently
byte/hash checked. Earlier runtime-backed failures were
diagnosed one case at a time (Linux/Windows tool binary mismatch, emitted
module resolution, Docker option normalization, unsupported `docker start`
flag, stopped-container tmpfs lifetime, pnpm store selection, offline trust
revalidation, and fixture discovery); no failed run is counted as containment
evidence. A WSL-created Linux symlink dependency tree that Windows could not
read was moved intact to ignored
`artifacts/wp3d-wsl-node-modules-quarantine/`; a clean pinned Windows install
was materialized before continuing.

Independent inspection rejected the first nominal all-case result at
`artifacts/wp3d-oci-milestone-20260815/`: although its harness status was PASS,
the 1,500 ms hang deadline expired during offline installation and both its
artifact preflight and published-command inventories contained zero files. It
therefore did not exercise the claimed stubborn descendant and is not counted
as evidence. The focused repair changed only that real-case deadline to 12,000
ms and required a retained valid `child.json` PID marker. The focused
reproduction passed at
`artifacts/wp3d-oci-hang-repro-20260815-r1/result.json` (2,867 bytes, SHA-256
`a80f3554c8e63e942ee9878170d814545a8967328aead5c74d6a23c6cfd09e9a`):
the case timed out after 14,948 ms, published one descendant marker, reused the
unchanged image with zero builds, and left no managed container or volume. Its
10,076-byte containment report independently matched SHA-256
`263ff5cee4f93b1b8fde61980f7df757ca809ba923642089059538971d454b31`.
This focused result remains diagnostic because recording it changes the final
staged tree.

The corrected all-case matrix then passed on its frozen staged tree at
`artifacts/wp3d-oci-milestone-20260815-r2/result.json` (6,923 bytes, SHA-256
`a70ddbf431068ad28b4619579c9149ab12d29a3986739752dc1ae65485d88560`):
all six expected dispositions, the retained hang marker, unique disposable
container IDs, zero image builds, and zero remaining managed resources were
independently validated. It is no longer final evidence because the first
serial orchestrator aggregate subsequently exposed one stale test expectation.
That aggregate ran 2,303,297 ms and wrote
`artifacts/manual/test-orchestrator-24192/orchestrator-report.json`: 460 tests,
457 passed, one failed, and the same two explicit WP5 skips; the failed command
correctly produced no passing receipt. The sole failure was a WP3c-era
`missing-implementation` expectation in `verification-tier.test.ts`. A focused
reproduction failed at `artifacts/manual/invariant-vitest-19880/`; the repair
now injects a missing runtime deterministically and preserves the exact
NOT_READY/no-local-fallback meaning under WP3d's real implementation. The
focused file passed 14/14 in 7,024 ms at
`artifacts/manual/invariant-vitest-5736/`; its 5,269-byte declared report
independently matched SHA-256
`9da5c71e5eca1e4ff0f8b70054469c7e3d4ca6dd287df08536c8db6df22bfa0c`.

The next exact-tree matrix passed at
`artifacts/wp3d-oci-milestone-20260815-r3/result.json` (6,923 bytes, SHA-256
`2d8c428b3b07c9bc8ce4cde169cbd687df3432de19e6bb992cb0a8346302c06e`),
with all report/artifact identities and cleanup independently checked. The
required orchestrator rerun passed 458/460 with the two unchanged WP5 skips in
2,254,714 ms at `artifacts/manual/test-orchestrator-14780/`; its 161,116-byte
report independently matched SHA-256
`ad4346de23a05e526742510e44894202c905b63e9d685f3d12b5b02342ad746b`.
The unit aggregate passed 471/473 with the same skips in 2,291,871 ms at
`artifacts/manual/test-unit-15604/`; its 165,029-byte report matched SHA-256
`f1f7f96dd75931132dacf552c560856c65dbd4d979e401cd384dc9de7371c0a3`.
The safety demonstration passed in 3,406 ms; its 11,931-byte artifact matched
SHA-256
`8cbd2787aa81681204aaa729bdc6b1fd053abfe60ac7d171a69ebbfa1cb7eaf6`.
Typecheck passed in 11,807 ms at `artifacts/manual/typecheck-1752/`.

Static inspection then found two harness-only useless initial assignments in
the OCI result accumulator. Removing those initializers passed lint in 10,409
ms at `artifacts/manual/lint-14612/` and typecheck in 7,617 ms at
`artifacts/manual/typecheck-11464/`. Format inspection separately caught the
new fixture lockfile before the freeze; formatting only that lockfile passed in
10,718 ms at `artifacts/manual/format-check-7128/`. Those source/fixture changes
invalidate the otherwise-passing r3 and aggregate receipts for a final-tree
claim; none will be reused. The final commands below run again only because
exact-tree evidence is mandatory.

Report-span comparison attributes only 6,239 ms (0.28%) of orchestrator wall
time and 5,882 ms (0.26%) of unit wall time to wrapper overhead. The long stage
times are overwhelmingly the crash-boundary assertions themselves, not a
recurring launch/receipt harness tax. No separate harness optimization is
justified in WP3d; changing those tests would risk coverage for negligible
wrapper savings.

**Stable-tree milestone protocol.** Source, tests, this log, the execution plan,
and documentation freeze before the final commands. The serial OCI matrix will
write `artifacts/wp3d-oci-milestone-20260815-r4/result.json`; receipt-owning
orchestrator, unit, typecheck, lint, and format gates will write fresh ignored
evidence, and their reports provide stage/test durations. Outcomes are retained
in those machine-owned artifacts and the final handoff rather than backfilled
into tracked files, so the verified candidate tree does not change underneath
its evidence. The required no-argument verifier runs only after the same tree
is committed and clean; its expected product-placeholder failures are not
suppressed or relabeled.

**Commit.** Assigned only after the frozen candidate passes the applicable
WP3d checks; identify it as the newest commit touching this entry.

**Known gaps.** The real matrix is Docker/WSL2 Linux evidence, not native
Windows, Podman, or native Linux CI evidence. The default image ID remains
uncommissioned by design, so the shipped template doctor is `NOT_READY`.
Product placeholders, calibration, autonomous readiness, hidden validation,
and human verification remain open; this increment makes no product or
readiness claim and is not pushed.

## 2026-08-14 — WP3c fail-closed execution provider control plane

**Objective.** Add the controller-owned provider selection and evidence
identity required before candidate-authored verification can be moved into a
pinned OCI environment, without claiming that WP3d containment already exists
or weakening the existing supervisor, receipt, integration, and readiness
gates.

**Outcome.** Config schema `1.6.0` defaults and migrates every prior version to
`trusted-container`; the absent WP3d executor fails closed before candidate
spawn and never falls back. Explicit `unsafe-local-diagnostic` execution uses
the bounded shared supervisor and stays completion-ineligible. A strict
provider identity is propagated through command/tier/aggregate/state/target/
reconciliation evidence and is validated for presence, eligibility, and exact
semantic equality wherever evidence could support adoption. Candidate-returned
identity is not trusted. State migrations preserve old evidence as
unattested/ineligible and block legacy pending target operations safely. Doctor
now distinguishes implementation, runtime, pinned-image, and policy failures.

**Verification.** All commands used Node `24.18.0` and pnpm `11.15.1`.
The complete focused matrix passed 46/46 suites and 205 tests with 0 failures
and exactly the two explicit WP5 POSIX skips at
`artifacts/manual/invariant-vitest-520/`; its 71,507-byte report matches
SHA-256 `4634557d8296a2e4d3cddc0a606bb71fc1f47cbc8fd37ea80722cfac4b8ddf1b`.
The later hardening subset passed 65/65 at
`artifacts/manual/invariant-vitest-7812/`. The final isolated orchestrator
aggregate passed 137/137 suites, 436 tests, 0 failures, and the same two skips
at `artifacts/manual/test-orchestrator-10220/`; its 152,919-byte report matches
SHA-256 `fcb4d768222acc67427da7fcf4175d3fe6b3d45c1db5d336699e6cbc0de60cd3`.
The earlier unit aggregate passed 446 tests, 0 failures, and the same two skips
at `artifacts/manual/test-unit-21396/`. A user-directed stop of a redundant
pre-freeze rerun left `artifacts/manual/test-unit-1420/` with no receipt, so it
is not cited as evidence.

Receipt-owning typecheck, lint, and format gates passed at
`artifacts/manual/typecheck-3064/`, `artifacts/manual/lint-25080/`, and
`artifacts/manual/format-check-13384/`; every receipt and declared artifact
byte count/SHA-256 was independently recomputed and matched. Safety demo passed
all six scenarios at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260815010034386-d9e187ef.json`.
The immutable lock remains
`d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050`,
all governed baseline/active hashes remain equal, and the protected human file
remains outside the commit at blob
`d0abdd24f404d9dc335818c355e39f7cfc531300`. A single post-freeze consolidated
verification is the final handoff check; no process-supervision suites are run
concurrently and already-valid focused/orchestrator evidence is reused.

**Commit.** `cc17d8e5f22beb3eb3be9871bb6fed5efa9c031b` (tree
`44050eba6c69bdf9ced6cc388a18c51b72348576`).

**Known gaps.** WP3d must implement the pinned OCI executor, disposable clone,
mount/network/resource containment, and adversarial escape matrix. The two
POSIX-only process-tree tests remain explicit WP5 skips; no unsupported-platform
coverage is claimed. Product placeholders, calibration, autonomous-readiness,
and human-verification gates remain open. This increment makes no product
completion or readiness claim and is not pushed.

## 2026-08-08 — WP3b verifier and evidence trust-root supervision

**Objective.** Convert every process launch owned directly by the protected
authoritative verifier and shared evidence helpers to the WP3a bounded
supervisor while preserving verifier contract semantics, exact toolchain
identity, WP2 retention/workspace-cleanup behavior, and all WP3a review fixes.

**Outcome.** `scripts/verify.mjs` and `tools/evidence.mjs` now use the shared
plain-Node-loadable supervisor for identity probes, package scripts, citation
queries, and evidence commands. Each launch has a finite timeout, per-stream
cap, shared kill grace, redact-before-write behavior, and the complete WP3a
supervision disposition; timeout and output-limit outcomes fail closed.
Verifier schema `2.1.0`, stage/profile meanings, immutable-lock and receipt
validation, identity drift, exit/status weighting, and completion eligibility
are unchanged. Evidence callers await the asynchronous boundary, execute the
exact pnpm JavaScript entry under pinned Node, and retain their prior result
contracts. New regressions cover plain Node loading, default ownership,
redaction, output breach, timeout, verifier identity/supervision, and absence
of direct production spawn paths. Isolated verifier and production-build
fixtures now copy the exact transitive supervisor dependency and pinned
package-manager state.

**Verification.** All commands used Node `24.18.0` and pnpm `11.15.1`. The
requested serial cleanup/reconciliation reproduction initially retained only
the cleanup deadline while an unrelated host Vitest/Git workload was active;
with that workload clear, the identical command passed 24/24 (cleanup
26.264 s, rejected-review reconciliation 32.065 s) without a source or timeout
change. Contended aggregates at
`artifacts/manual/test-orchestrator-3512/` and
`artifacts/manual/test-orchestrator-7220/` correctly produced no PASS receipt;
the clean corrected-tree orchestrator aggregate passed 419 tests (417 passed,
2 explicit WP5 POSIX skips, 0 failed) at
`artifacts/manual/test-orchestrator-1444/`. The clean unit aggregate exposed
one deterministic isolated-fixture dependency defect at
`artifacts/manual/test-unit-22236/`; after the fixture repair, the focused
production-build suite passed 13/13 and the complete unit aggregate passed 432
tests (430 passed, the same 2 WP5 skips, 0 failed) at
`artifacts/manual/test-unit-21692/`. The earlier one-hour unit supervision
timeout remains honestly recorded at `artifacts/manual/test-unit-24196/`; no
bound or test deadline was raised.

Final receipt-owning gates passed at `artifacts/manual/typecheck-6956/`,
`artifacts/manual/lint-5448/`, and
`artifacts/manual/format-check-3044/`; the pre-format attempt at
`artifacts/manual/format-check-13128/` correctly contains only an ERROR
manifest. Every final orchestrator, unit, typecheck, lint, and format report
and receipt byte count/SHA-256 was independently recomputed and matches its
manifest. `pnpm loop:demo-safety` passed all six scenarios at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260809002843117-741e4c73.json`.
The final focused verifier at
`artifacts/wp3b-final-contract-20260808/result.json` has all exact-runtime/pin
checks and all 13 contract-integrity checks PASS; overall FAIL is expected
only from the honest dependency placeholder, its command supervision is
bounded/closed-stream, and completion is ineligible. The immutable lock and
all four governed hashes remain exact, `git diff --check` passed, and the
unrelated human file remained outside the commit at blob
`d0abdd24f404d9dc335818c355e39f7cfc531300`.

**Commit.** `3efa3ed77b46abdea61e4b867a5998e92f54d6c3` (tree
`8cb1bd29486f643830ff19e39ede38945ed7ea73`).

**Known gaps.** The two POSIX group/process-tree tests remain explicit WP5
skips; no unsupported-platform coverage is claimed. OCI containment,
execution-provider identity, unrelated launch sites, and the previously
recorded WP3a process-escape residuals remain future WP3 work. Product-domain
verification placeholders, calibration, and every autonomous-readiness and
human-verification gate remain open. This increment makes no completion or
autonomous-readiness claim.

## 2026-08-07 — WP3a review fix: drain cutoff, spawn resolve, honest termination

**Objective.** Close three independent review findings against the WP3a
supervisor at `e06baf4`: an inert post-exit output-limit breach (high), a
synchronous spawn throw rejecting past the never-rejects contract (medium),
and `termination.succeeded` overstating what root exit proves (medium).

**Outcome.** A cap breach during the post-exit drain now cuts the drain off
at the breach: the straggler sweep runs immediately (POSIX group SIGKILL;
recorded unavailable on Windows behind a dead root), streams are destroyed,
and the command settles with `drainCutoff: "output-limit"` — a breaching
writer that then closes its pipes can no longer skip the sweep, and the
runner reports the post-exit breach without claiming tree termination.
Synchronous spawn throws resolve an ERROR-shaped result with `spawnError`
set. The termination report now records `rootExitObserved` plus per-attempt
detail and never claims tree-wide success. Findings 1 and 2 were reproduced
by deterministic probes against the prior commit before fixing; all three
have regressions (scripted-child drain cutoff, scripted-child spawn throw,
fallback-root-kill semantics, and a real detached holder that polls for
parent death and floods the inherited pipe strictly after exit through
`runCommand`).

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: focused
supervisor/runner suites 27 passed / 2 skipped (WP5 POSIX). One first-run
aggregate failure was the new fixture's own cleanup racing Windows
asynchronous handle release (EBUSY removing the killed holder's working
directory); both process-test suites now poll killed fixtures to death and
retry the same transient removal codes the production stores retry, and only
the subsequent complete green aggregates are cited. Final-tree receipts:
typecheck `artifacts/manual/typecheck-17492/`, lint
`artifacts/manual/lint-20652/`, format `artifacts/manual/format-check-24620/`,
orchestrator aggregate 414 tests (412 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-orchestrator-10784/orchestrator-report.json`, unit
aggregate 427 tests (425 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-unit-7280/`, `pnpm loop:demo-safety` PASS at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807190106966-4c6cc48e.json`,
clean `git diff --check`. The unrelated untracked human file remained at
blob `d0abdd24f404d9dc335818c355e39f7cfc531300` and outside the commit.

**Commit.** `eab0cd6` (tree `11e115cf0188929afb1c5e6357b616541c4fc75d`).

**Known gaps.** Unchanged from WP3a: POSIX supervision paths first execute
in WP5 Linux CI; reparented-descendant/PID-reuse escapes, Windows post-exit
stragglers behind a dead root, and setsid-detached POSIX daemons remain
recorded residuals owned by the WP3 container slice, alongside contained
candidate execution and the `scripts/verify.mjs`/`tools/evidence.mjs` spawn
conversion. No product-completion or autonomous-readiness claim.

## 2026-08-07 — WP3a bounded process supervisor

**Objective.** Give every controller-spawned verification command a bounded,
deterministic supervision boundary: capped and redacted output, complete
process-tree termination on timeout or cap breach, a bounded post-exit
stream-drain window, and an exactly-once settle with a hard upper bound —
the first bounded WP3 process-containment slice (audit CR-02,
improvement-plan §WP3.5, P0 sweep P1.1/R-01).

**Outcome.** New `process-supervisor.ts` owns spawn, bounded per-stream
capture, termination, drain, and settle; `runCommand` keeps its public API,
policy, redaction, artifact, hashing, telemetry, and status semantics and
adopts the supervisor, so all orchestrator call sites inherit supervision.
Output beyond `limits.commandOutputLimitBytes` (default 64 MiB per stream)
is counted but never retained; a breach tree-kills and fails in the existing
infrastructure lane with newline-boundary truncation and a marker covered by
the recorded hash. Windows termination is force-first
`taskkill /pid <pid> /T /F` while the tree is intact with `child.kill()`
fallback; POSIX uses detached process-group SIGTERM escalating to SIGKILL
after `limits.commandKillGraceMs` (default 5000 ms). Settle is exactly-once
with an abandonment backstop bounding it by `timeoutMs + 2 x killGraceMs`.
Config schema is `1.5.0` with in-memory migration injecting the two new
limits; summaries carry a full `supervision` record. Probed platform facts
(recorded in the decision log): non-detached Node grandchildren die with
their parent via libuv's kill-on-close job object, while detached ones
escape it, survive, and hold inherited pipes open — the reproduced CR-02
hang, which now settles through the drain window; the tree-kill proof
therefore uses a detached (job-object-escaping) grandchild reaped by the
intact-tree taskkill.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: focused
supervisor/runner/config suites passed 29 with 2 skipped (POSIX-only,
flagged WP5); affected verifier/reconciliation/tier suites passed 86/86.
Receipt-owning gates: typecheck `artifacts/manual/typecheck-21180/`, lint
`artifacts/manual/lint-22928/`, format `artifacts/manual/format-check-13364/`,
complete orchestrator aggregate 410 tests (408 passed, 2 skipped WP5,
0 failed) at `artifacts/manual/test-orchestrator-3096/orchestrator-report.json`,
complete unit aggregate 423 tests (421 passed, 2 skipped WP5, 0 failed) at
`artifacts/manual/test-unit-10224/result.json`, `pnpm loop:demo-safety` PASS
at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807154534494-b6b8565c.json`,
and a clean `git diff --check`. Two earlier complete aggregates failed only
on the pre-existing `target-integration-recovery` post-fast-forward test
exceeding its 120s budget (90.9s at the 2026-08-06 baseline; 102.3s isolated
and 120.2s/122.4s in-suite on 2026-08-07; its code paths do not touch this
increment); its duration budget was raised to 300s with measurements
recorded in-file and no assertion changed, and only the subsequent complete
green aggregates are cited. The unrelated untracked human file remained at
blob `d0abdd24f404d9dc335818c355e39f7cfc531300` and outside the commit.

**Commit.** `e06baf4b658713961825edc7996884308bc8c582` (tree
`6d8307b9e9923eafff13fa734931fde1e88b47b5`).

**Known gaps.** POSIX supervision paths (group kill, escalation, drain
sweep) are written but first execute in WP5 Linux CI — no unsupported-
platform claim is made. Descendants reparented before the kill, PID reuse,
Windows post-exit stragglers behind a dead root, and setsid-detached POSIX
daemons remain recorded escape residuals owned by the WP3 container slice,
which also still owns contained candidate execution, execution-provider
identity, and `scripts/verify.mjs`/`tools/evidence.mjs` spawn conversion.
Product-domain verification placeholders, calibration, and every frozen
autonomous-readiness and human-verification gate remain open; nothing here
claims product completion or autonomous readiness.

## 2026-08-06 — WP2d recoverable approval-bound retention apply

**Objective.** Authenticate the complete operator-approved retention plan,
publish one canonical deletion intent before any apply artifact or evidence
removal, and make interrupted application converge without transferring
authority to journal text or changing terminal workspace-cleanup semantics.

**Outcome.** State schema `1.8.0` adds a strict global `retention-apply`
operation bound to the full plan hash, exact input generation/revision,
repository/controller/retention identity, complete dirty-worktree fingerprint,
configured and real roots, observed inventories, ordered target manifest
identities, canonical full-hash apply paths, progress, and deterministic
timestamps. Strict plan schema `1.2.0` and a fresh preflight reject partial or
non-canonical envelopes, changed bytes, configuration/root/citation/recency/
suspension drift, and target identity changes before deletion. Each target
enters durable delete-started state before the unchanged contained removal
primitive. The synced JSONL journal and exact result are derived evidence only:
recovery completes canonical prefixes and torn appends, adopts absence only
from state authorization, preserves conflicting paths with a durable blocked
diagnostic, and completes through one reducer. Explicit apply and leased
orchestrator startup share this recovery path before other state mutation.
Status and doctor schema `1.6.0` classify progress without recovery or
mutation. Terminal workspace-cleanup production code and policy are unchanged.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, focused retention
apply passed 19/19, operation/schema/store/doctor passed 48/48, leased startup
recovery passed, and synchronized recovery contenders serialized through the
controller lease. Hard process loss at all nine declared boundaries converged
to identical normalized state, journal, and result digests in
`artifacts/manual/wp2d-retention-apply/fault-matrix.json`. Final receipt-owning
typecheck, lint, and format checks passed at
`artifacts/manual/typecheck-21684/`, `artifacts/manual/lint-21048/`, and
`artifacts/manual/format-check-22956/`. The complete orchestrator aggregate
passed 390/390 at `artifacts/manual/test-orchestrator-11316/result.json`; the
full unit aggregate passed 403/403 at
`artifacts/manual/test-unit-19776/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807050845281-8bd6533b.json`.
Two broad attempts exceeded undersized outer shell wrappers and were treated as
invalid. A later complete attempt correctly exposed one stale plan-schema
assertion plus a Windows test-fixture `ENOTEMPTY`; both were fixed without
changing production cleanup, the focused lifecycle file passed 9/9, and only
the subsequent complete green aggregates are cited.

**Commit.** `c556e112113da4b565f13a9a5337aeb9df2dd344` (tree
`3365a5aa21057b2337c921f02d0cccad4a531a49`).

**Known gaps.** WP3 still owns process containment, and WP5 owns Linux
publication/race evidence. Product-domain verification placeholders,
calibration, and every frozen autonomous-readiness and human-verification gate
remain open. These Windows controller results do not claim unsupported-platform
coverage, product completion, or autonomous readiness.

## 2026-08-06 — WP2c recoverable terminal workspace cleanup

**Objective.** Publish one exact terminal workspace-cleanup intent before
dependency removal, failed-run diagnostic publication, or recursive workspace
deletion, then make uninterrupted and restarted cleanup converge through one
canonical completion reducer without changing evidence-retention semantics.

**Outcome.** State schema `1.7.0` extends the exclusive pending-operation union
with `workspace-cleanup`, bound to the exact canonical generation/revision,
run/milestone/attempt, repository/target identity, standalone workspace and
creation marker, recorded and observed commits, cleanup policy, pinned
timestamps, and exact diagnostic hashes/sizes. Startup recovery runs under the
controller lease before ordinary terminal cleanup and advances through explicit
dependency, archive, and workspace-delete phases. Preserve policy never adopts
a missing workspace; delete policy adopts one only after durable authorization;
and failed deletion requires an exact complete archive. Failed cleanup pins the
actual observed descendant independently from the last recorded candidate,
because candidate drift may be the failure being archived. Ambiguous roots,
links, substitutions, Git or diagnostic drift, premature disappearance, and
partial/conflicting archives remain preserved with a durable blocked
diagnostic. Status and doctor schema `1.5.0` classify the operation and next
safe action without recovery or mutation. Approval-bound evidence retention is
unchanged.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, synchronized
post-delete recovery produced zero semantic differences and hard process loss
converged at all 15 declared boundaries across completed deletion, completed
preservation, and failed diagnostic deletion. Structured records are
`artifacts/manual/wp2c-workspace-cleanup/post-delete-convergence.json` and
`artifacts/manual/wp2c-workspace-cleanup/fault-matrix.json`. Blocked-state,
candidate-drift, diagnostic-drift, archive-conflict, concurrent lease, and
status/doctor byte-digest cases passed. Receipt-owning typecheck, lint, and
format passed at `artifacts/manual/typecheck-18532/`,
`artifacts/manual/lint-4720/`, and
`artifacts/manual/format-check-23228/`. The complete orchestrator aggregate
passed 379/379 at `artifacts/manual/test-orchestrator-19060/result.json`; the
full unit aggregate passed 392/392 at
`artifacts/manual/test-unit-14056/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260807005440748-4cc540e4.json`.
One broad attempt was invalidated by an outer shell timeout and a later complete
attempt correctly exposed a failed-workspace HEAD-policy defect; neither is
cited as passing evidence, and the successful aggregates ran after the fix
under a temporary OS keep-awake guard with repository test limits unchanged.

**Commit.** `0557e66a5fa0763896fee9c4319d6d8939ed8254` (tree
`0508a5f4c759c327d60714c5295f77d13fbd2fc1`).

**Known gaps.** WP2d still owns approval-bound evidence-retention application
intent/authentication and interrupted deletion convergence. Linux cleanup
publication/race evidence remains a WP5 CI deliverable. This Windows result
does not claim unsupported-platform coverage or autonomous readiness, and the
adopting product verification placeholders remain honestly non-passing.

## 2026-08-06 — WP2b recoverable target integration

**Objective.** Publish one exact approved target-integration intent before any
outcome, fetch, ref, index, or worktree side effect, recover it under the
controller lease, and make uninterrupted and restarted completion use one pure
semantic reducer.

**Outcome.** State schema `1.6.0` extends the exclusive pending-operation union
with `target-integrate`, bound to the exact canonical generation/revision,
run/milestone/attempt, repository/target/workspace identity, approved candidate
and commit list, verification-result digest, deterministic outcome paths,
phases, timestamps, and validate/adopt-or-preserve policy. Normal integration
persists intent before its first external side effect. Startup recovers before
ordinary target drift, revalidates protected files and the standalone
remote-free candidate, resumes only from the exact clean base, and adopts only
the exact clean candidate. Pending and integrated outcome bytes are exactly
regenerable. Dirty, locked, in-progress, unexpected, drifted, linked,
substituted, and conflicting states are preserved with durable diagnostics.
Reviewer approval without intent now requires explicit reconciliation. One
completion reducer owns target/milestone/queue/vertical-consumer/processed-count
and human-verification-stop state. Status and doctor schema `1.4.0` classify the
operation and exact next action without mutation.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, hard child-process
loss at all 12 declared boundaries converged to canonical completion; the
structured records are
`artifacts/manual/wp2b-target-integration/fault-matrix.json` and
`artifacts/manual/wp2b-target-integration/post-fast-forward-convergence.json`.
The latter also barrier-synchronized two restart contenders and found no normal
versus recovered semantic difference. Target classification/action/outcome,
migration, lifecycle, identity, reconciliation, cleanup, status, doctor, and
CLI focused checks passed. Receipt-owning typecheck, lint, and format passed at
`artifacts/manual/typecheck-15628/`, `artifacts/manual/lint-904/`, and
`artifacts/manual/format-check-13872/`. The complete orchestrator aggregate
passed 372/372 at `artifacts/manual/test-orchestrator-20588/result.json`; the
full unit aggregate passed 385/385 at
`artifacts/manual/test-unit-11116/result.json`; and `pnpm loop:demo-safety`
passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806215546754-eb6dd114.json`.
Two earlier broad attempts were invalidated by machine suspend, which produced
impossible multi-thousand-second durations for unchanged 60-second tests; every
affected case passed awake under its original limit, and the successful broad
runs used only a temporary OS awake guard, not altered repository timeouts.

**Commit.** `057f16bc14ec28bda36e762d503ee1d4252a898d` (tree
`55b6e7a8b97c941663228246617998743589f3b9`).

**Known gaps.** Later WP2 increments still own terminal cleanup and retention
side-effect journaling; this change uses but does not make those subsystems
recoverable. Linux ref/index/worktree race evidence remains a WP5 CI
deliverable. This Windows result does not claim unsupported-platform coverage
or autonomous readiness, and the adopting product verification placeholders
remain honestly non-passing.

## 2026-08-06 — WP2a recoverable workspace creation

**Objective.** Persist a strict workspace-create operation before any clone
side effect, publish through a unique contained temporary path, and make every
creation boundary deterministic and recoverable under the controller lease.

**Outcome.** State schema `1.5.0` adds one exclusive, exact-generation-bound
`workspace-create` intent with pure set/advance/block/complete transitions and
a global unrelated-mutation fence. Canonical `1.4.0` generations migrate
virtually on read and durably on their next CAS successor. Attempt startup now
persists intent before creating directories, clones without hardlinks into a
short unique temporary entry, establishes standalone remote-free identity,
and publishes with no-clobber semantics. Leased startup classifies missing,
source-clone, ready-temporary, exact-final, ambiguous, substituted, and unsafe
paths; it resumes or adopts only exact identity and otherwise preserves the
entries in place with a durable blocked diagnostic. Validation covers lexical
and realpath containment, symlinks/junctions/gitfiles, repository ownership,
alternates/shallow state, exact base/branch, cleanliness, canonical config,
controller markers, and remote facts. Status and doctor schema `1.3.0` expose
the pending operation and next safe action using read-only Git inspection.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, a real-clone matrix
injected process loss at all eight declared durable/filesystem boundaries and
converged every restart to the same normalized revision-9 state. The complete
orchestrator suite passed 363/363 at
`artifacts/manual/test-orchestrator-13136/result.json`; the full unit aggregate
passed 376/376 at `artifacts/manual/test-unit-17720/result.json`. Receipt-owning
typecheck, lint, and format passed at `artifacts/manual/typecheck-21940/`,
`artifacts/manual/lint-7288/`, and `artifacts/manual/format-check-25136/`.
`pnpm loop:demo-safety` passed with its report at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806175034510-a6ecc318.json`.

**Commit.** `3f6d8e916a7139c71d7aa1e6b99e2bfe10ff1844` (tree
`55858b14eff61c7b4348719604ebf1357bdfb2fe`).

**Known gaps.** WP2b must journal target integration and converge interrupted
integration through one canonical completion reducer; later WP2 increments
still own cleanup and retention side effects. Linux path and publication-race
evidence remains a WP5 CI deliverable. This Windows result does not claim
unsupported-platform coverage or autonomous readiness, and the adopting
product verification placeholders remain honestly non-passing.

## 2026-08-05 — WP1b atomic canonical state generations

**Objective.** Replace mirror-revision read/check/write with a canonical,
recoverable state-generation primitive that permits exactly one publication
from a shared starting generation and preserves read-only command semantics.

**Outcome.** `refs/milestone-loop/state` now points to a strict Git commit
generation containing canonical state JSON and exact revision/hash metadata.
The single parent is the prior generation; current and immediately previous
commits are validated for type, exact tree, schema, hashes, revision successor,
parent, fixed controller identity/timestamp, and canonical message. Saves use
expected-old `git update-ref`. The configured `state.json` is a derived mirror
repaired only on mutation-capable opens. Valid legacy bytes import exactly once
and remain available for reconciliation provenance; malformed, linked, or
ambiguous input fails closed. `load()` cannot authorize `save()`. Status and
doctor schema `1.2.0` expose canonical-generation and mirror facts without
mutating either store. The safety demonstration uses an isolated Git fixture.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`, the synchronized
multiprocess same-generation race passed five consecutive runs at
`artifacts/manual/wp1b-state-races/run-{1..5}.json`. Receipt-owning typecheck,
lint, and format passed at `artifacts/manual/typecheck-7476/`,
`artifacts/manual/lint-21564/`, and
`artifacts/manual/format-check-22368/`. The complete orchestrator suite passed
349/349 at `artifacts/manual/test-orchestrator-20856/result.json`; the full
unit aggregate passed 362/362 before commit and again from the clean committed
tree at `artifacts/manual/test-unit-24644/result.json`. The live safety
demonstration passed at
`artifacts/orchestrator/runs/safety-demonstration/safety-demonstration-20260806045354446-4e64d4e5.json`.

**Commit.** `987ce005a410470d078b8dd57802abbffc2d0356` (tree
`0b9c1719ebc9f7accac4d64e872c6878b753eed2`).

**Known gaps.** WP2 must journal workspace, integration, cleanup, and retention
side effects and converge interrupted integration through the same canonical
completion reducer. Linux race evidence remains a WP5 CI deliverable; this
Windows proof does not claim unsupported-platform coverage. Uncommissioned
readiness placeholders remain honestly non-passing and WP1 is not an
autonomous-readiness claim.

## 2026-08-05 — WP1a atomic controller ownership

**Objective.** Replace stale-file quarantine takeover with a real
expected-owner primitive so a losing first-owner or stale-owner contender can
never remove, replace, or release the live winner.

**Outcome.** The canonical lease is now
`refs/milestone-loop/controller-lease`, pointing to a strictly validated owner
JSON blob. Acquisition, stale takeover, and release use expected-old
`git update-ref`; inspection is read-only. A permanent file-protocol guard
blocks older file-lease binaries and conflicting legacy files fail closed.
Doctor schema `1.1.0` and status expose the canonical ref and guard state.
Normal `git push --all` excludes the private namespace.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: the focused lease
suite passed 16/16; the three synchronized first-owner/stale-owner/winner-life
race cases passed in five consecutive repetitions; the complete orchestrator
suite passed 328/328 at
`artifacts/manual/test-orchestrator-20228/orchestrator-report.json`. From the
clean implementation commit, `pnpm test:unit` passed 341/341 with receipt at
`artifacts/manual/test-unit-15140/result.json`; typecheck, lint, and format
receipts are `artifacts/manual/typecheck-3040/`,
`artifacts/manual/lint-16032/`, and
`artifacts/manual/format-check-15788/`; `pnpm loop:demo-safety` passed with its
report under `artifacts/orchestrator/runs/safety-demonstration/`. A direct
`loop:status` probe left both the ref and legacy guard absent, proving the
read-only path does not initialize ownership state.

**Commit.** `fa1ef6f80c1dd089f8f78133d0aa2344f40a2174` (tree
`0be6b70c386cf58b076f7d3b33cc8f82545cb2a0`).

**Known gaps.** The JSON state mirror still uses a non-atomic revision
read/check/write sequence. WP1b must make `refs/milestone-loop/state`
canonical, migrate legacy state exactly once, and demote `state.json` to a
repairable mirror before WP1 is complete. Linux race evidence remains a WP5 CI
deliverable; no unsupported platform result is claimed here.

## 2026-08-05 — WP0 truthful production-build evidence

**Objective.** Eliminate the zero-command production-build PASS and require an
explicit project-owned build contract, a clean disposable clone, fresh outputs,
output-root containment, and retained path/size/SHA-256 evidence.

**Outcome.** `pnpm build` now exits 2/`NOT_READY` without a receipt when
`package.json#milestoneLoop.productionBuild` is absent. A configured fixture
runs the declared non-recursive script after a frozen offline install, rejects
stale, empty, outside-root, linked, and post-report-mutated outputs, and issues a
PASS receipt only after a second inventory check.

**Verification.** Under Node `24.18.0` and pnpm `11.15.1`: 13/13 focused build
fixtures passed; `pnpm test:unit` passed 336/336 with receipt at
`artifacts/manual/test-unit-11968/result.json`; `pnpm typecheck`, `pnpm lint`,
and `pnpm format:check` passed with receipts at
`artifacts/manual/typecheck-23840/`, `artifacts/manual/lint-23020/`, and
`artifacts/manual/format-check-19280/`; `pnpm loop:demo-safety` passed. Focused
aggregate evidence is
`artifacts/verify-2026-08-06T025915-819Z-12324/result.json`: production-build is
correctly `NOT_READY` with no receipt, while the aggregate remains FAIL because
the unrelated adopting-project dependency check is still a placeholder.

**Commit.** `66c564c3c2142cde7b5d31d82a18213fdcde525a` (tree
`d9ffd30151c9fac86c5f8c15f1aecd181e10a641`).

**Known gaps.** The template remains deliberately uncommissioned. Candidate
build execution is still local-host execution until WP3 containment. This
increment does not alter readiness meaning or claim autonomous completion.

## 2026-08-05 — Supported-runtime state replacement retry

**Objective.** Remove an intermittent Windows `EPERM` state-file replacement
failure that blocked broad supported-runtime verification, without disguising
or claiming to solve the WP1 atomic-CAS defect.

**Outcome.** State JSON replacement retries only bounded transient filesystem
codes with linear backoff, then fails closed and preserves the prior durable
file. Deterministic hooks cover eventual success and persistent failure.

**Verification.** Under Node `24.18.0`: 13/13 state-store tests, typecheck, lint,
format, and 323/323 orchestrator tests passed. The broad receipt is retained at
`.tools/state-rename-retry/artifacts/manual/test-orchestrator-21932/result.json`.

**Commit.** `235ea2bcb2c32850a9e9e3f4aec24058c4aab546` (tree
`f35a056b5a7ba71e5607c381e6885aa41c60a017`).

**Known gaps.** Read/compare/rename state publication is still not an atomic
CAS, and stale lease takeover is still vulnerable. Both remain WP1 blockers.
