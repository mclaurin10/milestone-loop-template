# Autonomy Log

Append one entry per completed increment: date, plan objective, verification
evidence (commands, result paths), commit id, and known gaps. Newest first.

## 2026-08-23 — WP5 Session 3 hosted Windows fresh-adopter repair candidate

**Failed hosted run retained.** Exact runtime CI run `32638898310`, attempt 1,
failed on candidate `43e609bc6b754bcfee0c3af88a05be68b9e26850` / tree
`3258c1c65835c275b2462eb6dd8f67c346a4d88e`. Controller Linux/Windows,
fresh-adopter Linux, and real trusted-container Linux succeeded; only the
Windows fresh-adopter job failed, while all five unconditional uploads
succeeded. Run/job/check/artifact metadata, five annotation sets, the failed
job log, all five server-digest-matching archives, and safely extracted
contents are retained under `artifacts/hosted/run-32638898310/`. The failed
Windows archive is 9,712 bytes with SHA-256
`4184d3799bdcb5d2b4636425b1d90869e102486318d67f3e02aa5039b9dafbf8`.
The annotation inventory has one failure and zero warnings, confirming that
the prior Node 20 action-runtime warning is closed.

The exact six-command ledger passed `template-create` and `install`, then
`commission` exited 1 for documented argv
`pnpm loop:commission -- --input tools/milestone-orchestrator/config/commissioning-input.json`
from the generated repository with inherited job environment plus `CI=true`.
Manifest add/commit and generated verify never ran; neither `smoke-result.json`
nor `receipt-audit.json` exists. The retained ERROR is not reinterpreted as a
pass.

**Causal reproduction and red invariant.** A no-local/no-hardlink clean clone
of exact `43e609b` was installed frozen with copy imports under Node `24.18.0`,
pnpm `11.15.1`, `CI=true`, isolated writable roots, and a genuine NTFS short
TEMP spelling beneath `C:\w5s3r1\HOSTED~1`. The exact workflow smoke command
reproduced commission exit 1 before manifest or verify. A spawned child probe
retains short cwd/input, while `realpath` and Git report the expanded root;
lexical `relative()` consequently begins with `..` and the unchanged strict
commissioning guard correctly refuses the apparent escape. The 488-byte probe
and 1,852-byte smoke log have SHA-256
`56572f1f931f45e2984d58b4cc2d3418127b44a9e2c90d55070c04bdad5132db`
and `d08520003770cc12dec9fcd4d5f1917e10ee85c360c4f428ad4f6a0667769c43`.

The new root-creation test was then run against old production semantics in
that exact clone. It failed only because
`createCanonicalFreshAdopterTemporaryRoot` did not exist; the other 19 tests,
including all 13 commissioning tests, passed. The 8,852-byte failing Vitest
report at
`artifacts/hosted/run-32638898310/reproduction/windows-8dot3-pre-fix/focused-regression-red/`
has SHA-256
`91d829f2b86846fbb13efe0d6fb65c1337e1e2a8c10d27ff843293b4debd7947`.

**Correction and focused evidence.** The fresh-adopter coordinator now
canonicalizes only its newly created temporary root once, equivalent to
`realpath(await mkdtemp(...))`, before deriving the generated repository. The
regression injects a hosted-style short spelling and requires create-then-
canonicalize call order plus the expanded result. Commissioning
implementation, CLI, and tests remain blob-identical to `43e609b`; no
caller-controlled input, containment rule, command ledger, platform branch,
receipt rule, or cleanup behavior changed. This reuses the existing durable
producer-owned canonical-root decision, so no decision-log entry is added.

Pinned receipt-owning focused verification at
`artifacts/manual/wp5-session3-focused-green-v1/` passed 20/20 tests with zero
failures or skips. Its 7,688-byte report, 663-byte PASS receipt, and 1,533-byte
PASS manifest have SHA-256
`f0f0f30f005ff631d9719d537af43addd6b9e47ac24dae2db205b28f135b5be5`,
`269275fdab68319b2cf37d4afea265f254d7344205170b5b81bb70d13cbeccda`,
and `986f90f199ea89c1433f9600e0faa21dc9114e77969792fef354934c958b718c`.
Pre-freeze typecheck, lint, and format also passed with independently matching
receipts/artifacts under their `artifacts/manual/wp5-session3-*-pre-freeze-v1/`
roots. These dirty-tree runs are iteration evidence only.

**Commit and remaining gates.** Assigned by the cohesive repair commit that
contains this entry. Before the one authorized normal push, that exact clean
commit still requires one real Windows six-command adopter/browser journey,
receipt-owning `test:orchestrator`, typecheck, lint, and format checks, and
independent evidence validation from clean clones. The resulting hosted run
must then finish all five jobs green and have all five artifacts downloaded
and independently audited. No source no-argument verify, template proof,
CAL-1, hidden validation, WP6, product expansion, or readiness claim occurred.

## 2026-08-22 — WP5 Session 2 frozen-candidate isolation correction

**Passing adopter journey.** Separator-repair candidate
`731965fc65b1359ee77dc999b0e90abe3bbe2c9f` / tree
`8f9021647a7f854f827a5646f0c26b0554de6725` passed its only real Windows
journey at `artifacts/manual/wp5-session2-windows-adopter-final-2/`. The exact
six-command ledger created the package, performed the offline frozen copy
install, commissioned and deterministically committed the sole manifest, and
ran literal generated-repository `pnpm verify` once. The generated candidate
`005a04729e014a8751f49f91c77a3f9b5f54e699` / tree
`8eb55ffa048900984aa8a08a09113e87fa344bab` is clean on `main` with exactly
three commits, bootstrap default, and no readiness marker in its tree or
history. Source no-argument verify invocation count remained zero.

The generated verifier passed 9 stages, 10 receipts, 18 declared artifacts /
136,233 bytes, and 4 tests. The retained copy contains 51 files / 210,556
bytes. Independent recomputation matched all 38 audit inventory entries and
all 51 retained inventory entries. The 5,346-byte smoke result and 20,965-byte
shared audit have SHA-256
`3381aa812e4e9eab494a0711e848a0ba9ec8e01190cead58477b1c1ec30a6d54` and
`1d014fd9e02c4bc5f2659c8e24f150950477a95b7cc9d6b41e40b1fb45bd4ca0`.
The 122,990-byte screenshot has SHA-256
`da927d28bc0d2132d4f4e5fe347059d5fb11586452c38c5b40fc9fc808bf0c21`,
visibly reports three worker ticks and four extracted units, and its browser
diagnostics contain no console errors, page errors, or request failures. This
is bootstrap completion only and is explicitly not autonomous readiness.

**Non-passing broader launch.** The candidate's only
`pnpm test:invariants` invocation, from a clean no-local/no-hardlink exact
clone, retained a truthful failure under
`artifacts/manual/wp5-session2-final-invariants/evidence/`. Its first
protected-integrity entry passed all 13 contract checks with a valid receipt.
The next schema entry stopped before Vitest because the clone's dependencies
had been installed against
`C:\wp5tsr1\pnpm-home\store\v11`, while the trusted nested child correctly
removed the outer `npm_config_store_dir` and `CI` overrides; pnpm therefore
refused to purge the mismatched modules directory without a TTY. The
3,243-byte FAIL invariant report and 8,736-byte ERROR manifest have SHA-256
`bdcbba261dced4f8fb542a0e2f4b4caac377ba229068e452376f87e716d4c8ab`
and `4974498b41e7946981789bf0825ebf5fe7d5330747b464a3634d2322af453c78`.
The other five broader commands were not launched. The failure is neither
rerun nor relabeled.

**Preparation correction.** A new disposable no-local/no-hardlink exact clone
installed directly against pnpm's default
`C:\Users\duncan\AppData\Local\pnpm\store\v11` with copy imports and no
downloads. With both `CI` and `npm_config_store_dir` then absent, its exact
pinned pnpm successfully crossed the dependency-status boundary and reported
`vitest/4.1.10 win32-x64 node-v24.18.0`. This proves the preparation correction
without changing product, verifier, or invariant code to accommodate an
operator-created store mismatch.

**Commit and remaining gates.** Assigned by this causal record commit, which
becomes the second replacement candidate without rewriting prior commits. It
still requires one fresh retained Windows adopter journey and all six broader
commands exactly once from newly prepared default-store clones. WSL still has
no exact Linux Node/pnpm/browser boundary, the hosted matrix remains Session 3,
and no autonomous-readiness claim is made.

## 2026-08-22 — WP5 Session 2 documented pnpm separator repair

**Causal failure.** The first and only real journey on candidate
`d16bab91e8e1405c9b97aa572dc8fe9a168ea65d` / tree
`55dcc993ada05d17914313a50d0838326d9b0cec` failed before generated-repository
creation. Pnpm correctly invoked the documented creator form as
`tsx .../adopter-package-cli.ts "--" "--definition" ...`, but the CLI parser
treated that leading script-argument separator as an unknown option. The same
parser shape existed in commissioning, so merely changing the smoke's creator
argv would have hidden the documented commission defect and would not execute
the advertised quickstart. The failed candidate is non-passing; no broader
command ran.

Retained nonqualifying evidence is
`artifacts/manual/wp5-session2-windows-adopter-final/logs/`. Its 688-byte
creator stderr and 46-byte lifecycle stdout have SHA-256
`dc856729ce4c01e2742eb345555c8bc94164bf3739f15bbade8ba8e1cf29ec2f` and
`70691ee46df8bffd84dd117eb9297af7108f7fc0b6be5f63d6cb30aef0d605b5`.
The coordinator removed its temporary root and preserved source identity; no
smoke result, bootstrap receipt, or completion claim was emitted.

**Correction.** `parseAdopterPackageCliArguments` and
`parseCommissioningCliArguments` now strip exactly one leading `--` before
their unchanged strict option loops. Invocation without a separator remains
accepted for internal callers. A duplicate or later separator still reaches
the existing unknown-option failure; missing values, duplicate options, and
unknown flags retain their prior failures. Production package generation and
commissioning logic are byte-identical. This is the smallest repair that makes
the exact documented `pnpm <script> -- --option` forms executable rather than
rewriting the smoke ledger or weakening arbitrary option handling.

**Focused verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, one
receipt-owning serial invocation covered the fresh-smoke plan, shared bootstrap
audit, adopter package, and commissioning files. All 10 reported suites / 28
tests passed with zero failures or skips. The 10,499-byte report, 819-byte PASS
receipt, and 9,320-byte PASS manifest at
`artifacts/manual/wp5-session2-separator-repair-focused-1/evidence/` have
SHA-256
`85eb1fda55296ac0121a2f87e19c485bdba0abad2ba5cca3218a02f9ef352a53`,
`98fd9728bfc9287fddda881ce574e09662c6cc50c3910577413af0cf004e991a`,
and `612e6ee1719e00ab1f9cffce7fe2e18e5fde955e8b5e1ed7db1a51ba79c24fa6`.
Direct targeted ESLint and Prettier checks passed. Direct telemetry again
degraded honestly to null at the source `.js` projection boundary; receipt and
artifact evidence remain valid and independently inspectable.

**Commit.** Assigned by the cohesive separator-repair commit containing this
entry; no push. It supersedes the failed candidate without rewriting either of
the two primary Session 2 increment commits.

**Known final-session gates.** The replacement committed tree still requires
one successful Windows adopter/browser journey and the six once-only broader
checks. WSL inspection found no Linux Node, pnpm, or Chrome/Chromium boundary,
so local Linux parity is unavailable and remains an explicit Session 3 hosted
matrix obligation. No autonomous-readiness claim is made.

## 2026-08-22 — WP5 Session 2 Node 24 official action pins

**Objective and provenance.** Replace all nine repeated Node 20-metadata
action pins without changing application Node `24.18.0`, pnpm `11.15.1`,
workflow trust, scheduling, command, or evidence boundaries. Official GitHub
`releases/latest`, Git tag objects, exact commit metadata, and release migration
notes were inspected for `actions/checkout`, `actions/setup-node`, and
`actions/upload-artifact`. Each selected tag currently resolves directly to a
commit rather than an annotated tag object; the resolver procedure explicitly
dereferences annotated tags when present. Exact `action.yml` at every selected
commit declares `runs.using: node24`.

**Outcome.** All three jobs now use checkout `v7.0.1` at
`3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node `v7.0.0` at
`820762786026740c76f36085b0efc47a31fe5020`, and upload-artifact `v7.0.1`
at `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`. The executable contract has
one central release/repository/SHA allowlist, requires each exact reference and
comment three times globally and once per job, requires nine full-SHA action
references total, and rejects the three old SHAs, mutable tags, short SHAs,
mixed full-SHA versions, missing occurrences, wrong comments, and any action
outside the allowlist. It also now explicitly counts three
`persist-credentials: false` settings, unconditional uploads, and
`if-no-files-found: error` settings while preserving the existing history,
runner, toolchain, command, root, independence, and real-Docker checks.

The durable migration record in `docs/decision-log.md` links only official
GitHub releases and exact repository metadata. It records the Node 24 minimum
Runner `v2.327.1`, checkout credential/fork-trigger changes, setup-node cache
and ESM changes, and upload-artifact's optional direct-upload behavior. None is
selected in a way that changes this workflow: credentials remain disabled,
the affected checkout event types are absent, no setup-node cache input is
used, and evidence directories retain default archived upload.

**Focused verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, one
receipt-owning serial invocation passed the workflow contract's 2 reported
suites / 5 tests with zero failures or skips. The 2,454-byte report, 640-byte
PASS receipt, and 9,137-byte PASS manifest at
`artifacts/manual/wp5-session2-step5-focused-1/evidence/` have SHA-256
`c5a90eeefa4889bf80c9c97797156aedf861229f676f010d05fe773ba13f3dee`,
`18aef769fcd5037ec59211679ecbc7c4ddef38a03c025b40981bae15411095bb`,
and `fd5e0d74e99596cab8d2aa3a521190d10fe8e994b0d7ae3e367a23bbddecfa62`.
Direct targeted ESLint and Prettier checks passed. As in Increment 4, direct
telemetry initialization was honestly non-semantic/unavailable at the source
`.js` projection boundary and the command-owned manifest records null
telemetry; receipt and artifact validation are unaffected.

**Commit.** Assigned by the cohesive action-migration commit containing this
entry; no push.

**Known final-session gates.** Step 4 is committed at
`4cab466851160c0adba155032724c28f08ba99c3` / tree
`e830ef8331191f26bc7a2d4597fbd743f45dcccd`. After this action increment is
committed, that exact combined tree becomes the Session 2 candidate for one
real Windows adopter journey and the six once-only broader checks. No hosted
workflow is triggered here; Session 3 owns final Linux/Windows/Docker hosted
validation. No autonomous-readiness claim is made.

## 2026-08-22 — WP5 Session 2 full-quickstart adopter smoke

**Objective and baseline.** Close WP5's documented-quickstart coverage gap
without rerunning the retained WP4d package proof, invoking source no-argument
verification, or duplicating generated typecheck/unit execution. Fresh fetch
confirmed `HEAD == origin/master ==`
`dbf70e9b730f4e44f81862e159e127c252f64fd6`, tree
`266f9b23432bd297cc027395b490db9ad82f39c4`, and zero divergence. The latest
public starting-state Exact runtime CI run `32616522784` passed all five jobs
on that exact commit. The existing `fresh-adopter-ci-smoke.v1` stopped at a
clean two-commit repository and separately audited only generated typecheck and
unit receipts, while the README additionally required commission, manifest
add/commit, and literal no-argument verification.

**Outcome.** `fresh-adopter-ci-smoke.v2` has one pure, exact six-command plan
and one versioned ordered execution ledger: documented public creator from the
source checkout; generated offline/frozen/copy-mode install bound to the
source-cwd store; one generated commission; exact manifest add; deterministic
manifest commit; and one literal generated-repository `pnpm verify`. The plan
rejects wrong order/count/argv/scope and any source-level no-argument verify.
Commissioning must report only `.agent/verification-manifest.json`, and its
bytes/SHA-256 plus the complete untracked/tracked/staged surface are checked
before the commit. Fixture Git identity and the definition-derived third
timestamp are verified with the requested branch, exactly three commits, a
clean tree, bootstrap default, and no readiness marker in tree or history.

The coordinator copies the complete verifier run before temporary cleanup,
byte/hash-compares the source and retained inventories, then calls the existing
`auditBootstrapVerification` owner on the retained copy. That shared audit
requires bootstrap status/profile/claim, both candidate captures, all nine
ordered stages, every command receipt/manifest/artifact identity, at least four
passing unit tests, a substantive screenshot, and clean browser diagnostics.
The old standalone typecheck/unit launches and their weaker two-receipt audit
are removed because those same production boundaries are now mandatory within
the shared aggregate audit. README and repository-contract prose describe the
new bootstrap/non-readiness distinction accurately.

**Focused verification.** Under pinned Node `24.18.0` and pnpm `11.15.1`, one
receipt-owning serial invocation of `invariant-vitest` passed all 4 reported
suites / 11 tests with zero failures or skips across
`fresh-adopter-ci-smoke.test.ts` and `adopter-package-proof.test.ts`. The
4,204-byte report, 693-byte PASS receipt, and 9,259-byte PASS manifest at
`artifacts/manual/wp5-session2-step4-focused-1/evidence/` have SHA-256
`07beb77c334e0951a60a2acd6dd4cf39ab1f6170a92481f7ae51761f97c713ec`,
`2c7e8b2da78f592f219eafc1480f1d06fc71011017f8626c74a3003a06be68b6`,
and `428050b562b6a795dfa6ddc6dea1e68c6b19e1bcaa38055450d547f1a46ea59f`.
Mutations cover wrong command order/count, ledger drift, source verify, dirty or
two-commit repositories, readiness history, missing/tampered receipts,
tampered artifacts, wrong candidate identity, and absent screenshots. Direct
targeted ESLint and Prettier checks also passed. Telemetry initialization was
honestly non-semantic/unavailable because the direct loader could not resolve
the source `.js` projection for `path-safety.ts`; the valid command-owned
manifest records null telemetry rather than claiming a telemetry receipt.

**Commit.** Assigned by the cohesive Step 4 commit containing this entry; no
push.

**Known final-session gates.** Per the frozen Session 2 cadence, the expensive
real Windows create/install/commission/commit/verify/browser journey runs once
only after the action-pin increment and all tracked records are committed. The
Node 24 action migration, final broader checks, ignored final audit, and hosted
Session 3 matrix remain open. POSIX supervision, CAL-1, hidden validation,
product breadth, autonomous readiness, and human verification remain out of
scope; no readiness claim is made.

## 2026-08-22 — WP5af canonical verification-clone fixture roots

**Objective and cause.** From exact clean WP5ae, reproduce the two remaining
historical verification-clone failures while preserving production clone/Git
and strict path behavior. Unchanged source reproduced one pass/two failures:
the first two cases passed shared `repository()`'s raw
`milestone-loop-clone-source-*` spelling to strict candidate inspection; the
derived-junction case correctly stopped earlier at the linked-root guard and
passed.

**Baseline and source-root proof.** Exact no-local/no-hardlink clone
`C:/wp5af1b/repo` at WP5ae
`37f5be3a4d97c77878dbcae03b3739cbb74b61fd` / tree
`cb099e63a733e5ccff98a3f0937e232bb00c6852`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, isolated store, and distinct
`WP5AFB~1`/expanded TEMP reproduced 1/3. Its 2,998-byte report, 8,615-byte
ERROR/no-receipt manifest, and 1,153-byte telemetry manifest have SHA-256
`199cafc444d3287e59afc58e389502bdd82c5852e262e7599f69ec31bfab4bf1`,
`b30c8978348d5a2939acbcfb94d94e64a87df2f85ed93c010c35205749309150`,
and `7ea9ea7979308803e5d7215c92c754dc3e0ff13bd3de52c7b92ee1cf51e81c1d`.
Assertion-only tree `3d2c8e1c76d132710aaf207a78ede21a7666aa0b` imported promise
`realpath` and asserted `expect(await realpath(root)).toBe(root)` immediately
after shared creation. All three cases failed there before registration or Git
setup; the third is explicitly proof-only localization because its baseline
production input is the derived junction. Its 3,081-byte report, 8,626-byte
ERROR manifest, and 1,159-byte telemetry manifest have SHA-256
`30e076b314f484c74e3be29857e573a7c1b2a72571c6298620af85b85e835696`,
`83245135417ea6e4acfa7c8c80f0851ba380a6e7844e463ebba6ad3d14970168`,
and `f7d9cdafb336f95d86e082c6cc941a9500500af6f9db4b3c7ad98d81536dbccc`.
Initial red roots are
`artifacts/manual/wp5af-verification-clone-{red,owner-red}/`.

**Downstream proof and disposition.** Canonical source-root tree
`5357fd6b9283465f113d6557fa05f3838679d771` reached 2/3. The cloning case
then rejected the omitted option's pre-existing default `tmpdir()` spelling as
an unstable `Verification temporary parent`; dirty/mismatch and junction
controls passed. Its 2,202-byte report, 8,618-byte ERROR manifest, and
1,155-byte telemetry manifest have SHA-256
`bb882d3118125953bfcbc89d0408df98f159f0b79fd468bf3af6a9ff76831223`,
`3f8a2d16b9e45a24aa8c02e915cea695b18ca7fcdc8bd7d1452f71bcefafa3b9`,
and `55fbd9ed32515cda2585cc59a5be506d0a3c2123d97b154ea5efb0736679ffaa`.
Production does not create that parent, so its strict guard and the
caller/environment path remain unchanged. Instead, assertion-only tree
`58c8a713fbe5d8b641c5af9975e505f7b3db810c` supplied an explicit raw
fixture-owned `milestone-loop-clone-parent-*` to the first case and asserted
its equality before registration or the production call. Exactly that case
failed; both controls passed. Its 2,027-byte report, 8,628-byte ERROR manifest,
and 1,160-byte telemetry manifest have SHA-256
`e1ab5b4f0ebd66f6a11d586cfd71556a217e81a3a2443a8e168b87d5186b545c`,
`8304c8902f1541b47534212a49c611a25cd5aa0b0777974fab931637baec7653`,
and `4465020f4f93e45cf68cbc3beae60ddf86ab6accf028ca3d07780d7495454b77`.
These roots are
`artifacts/manual/wp5af-verification-clone-{temporary-parent-red,temporary-parent-owner-red}/`.

**Correction and verification.** Shared `repository()` now canonicalizes only
its just-created source root and retains its assertion. The first cloning case
creates, canonicalizes, asserts, registers, and explicitly passes its own fresh
temporary parent. Production `verification-clone.ts`, default/caller paths,
Git checks, cloning, cleanup, and link guards are byte-identical. Corrected
tree `15355fb65128893074d86ed489a8add59a9e69f3` passed Windows 3/3,
zero skips. Its report/receipt/manifest are 1,647/603/8,865 bytes with SHA-256
`ab8371d0f502fc62cf6badeebed09faac16a69f8a478e156a8d22886e311d9d0`,
`bb23ce4ed10fe4c5e65be2d9a333e48727e7859b05bb0e7f233e438d6cd27800`,
and `0966f8794dc3dfc571bd584df4036dc36f3fd719ac7e02db320895b343d9dd11`.
The identical full file passed WSL2 ext4 3/3; its report/receipt/manifest are
1,661/603/8,825 bytes with SHA-256
`73f570df5b2e1321d30ff3709f0b102190f19bf6f5e7627e3292bd97a890b332`,
`d6b4caee4eb3ce6cbb11b2550e7c8c48221d4aa50ac468c88f630d34f3b6a22e`,
and `e1d14e1f78834a577605d9a0cf1a212c9dc2a5611aa20bcf1cccb1d0f50655ad`.
Green roots are
`artifacts/manual/wp5af-verification-clone-{windows,linux}-green/`; bindings
and source blobs match. No decision record is needed.

The retained hosted-Windows focused inventory is now exhausted. The next step
is to commit this owner, freeze all tracked Session 1 records, and run the six
required broader commands exactly once from isolated identical Windows clones.
Focused Linux ext4 parity exists for every changed owner.

**Commit.** Assigned by the cohesive WP5af commit containing this entry; local
and unpushed.

**Known gaps.** Frozen broader checks, POSIX `setsid`, CAL-1, hidden
validation, product breadth, readiness, and human verification remain open.
No completion or readiness claim is made.

## 2026-08-22 — WP5ae canonical container-artifact fixture roots

**Objective and cause.** From exact clean WP5ad, reproduce the four historical
container-artifact failures, prove shared `root(prefix)` before changing it,
and preserve publication, inventories, strict link/containment guards, and
independent/combined quotas. The complete file reproduced one pass/four
failures: all filesystem cases used raw `milestone-loop-export-*` roots whose
NTFS 8.3 spelling disagreed with promise `realpath`; the path-free combined
quota case passed.

**Evidence.** Exact no-local/no-hardlink clone `C:/wp5ae1b/repo` at WP5ad
`b6aad15fb5d2f32471503092a2b5d375e9076a3b` / tree
`0c30ff54851e12d824454a71e84472a58f8050ec`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, isolated store, and distinct
`WP5AEB~1`/expanded TEMP reproduced 1/5. Its 5,159-byte report, 8,617-byte
ERROR/no-receipt manifest, and 1,154-byte telemetry manifest have SHA-256
`0430857911ff3d037b0a0bba9690a4e80438072e0340a400286a8b71c49250ae`,
`d25b6c5857e6cfcb49772c97d79c6c8cd84749bb90aea3cd69054360689586d9`,
and `2b2d29a526222bd39690ec67ee18444509f0af81e8c25844971c385601684482`.
Assertion-only tree `66ad885c9cfdc19f5b3a44996275ca61ebc6304c` imported promise
`realpath` and asserted `expect(await realpath(value)).toBe(value)` immediately
after creation. All four filesystem cases failed directly there before root
registration or artifact inventory/publication; the path-free case remained
passing. Its 4,133-byte report, 8,629-byte ERROR manifest, and 1,160-byte
telemetry manifest have SHA-256
`cfc4a82e96b0c5e7bcfeadd5fe6701d03ed761c36fbbc8462c28cb476ac511e9`,
`dc716573f1f566d77aa7a2170290582e5125e067db1720301a142e806a9826b9`,
and `e37520a4e00378f95c64d67c267de4c9f07fc85e6b370e4081adfc2e5b3a60e2`.
Red roots are `artifacts/manual/wp5ae-container-artifacts-{red,owner-red}/`.

**Correction and verification.** Only shared `root(prefix)`'s fresh value now
uses `realpath(await mkdtemp(...))`; the assertion remains. Production
artifact inventory/publication, stable-root and link guards, containment,
quotas, and caller paths are byte-identical. Corrected tree
`d377ae2cca1620fbd42293d606f81f8f44e9521d` passed Windows 5/5, zero
skips, including symbolic-link/junction, hard-link, substituted-parent,
linked-ancestor, and quota behavior. Its report/receipt/manifest are
2,262/604/8,868 bytes with SHA-256
`573be220bd552b2a9e4cfd7b6f0c10fdbd29bc94b8e4441bba1bab5f227c4eff`,
`54f644d0a3b5173f17bf9e1584bcb6a7b9131dde6a45f7ed6bbcb5638653c2bb`,
and `3e2d7fdcf41fb26c14af34cd5537fc5eec7467128a2970a15b7762693cc4ec8a`.
The identical full file passed WSL2 ext4 5/5; its report/receipt/manifest are
2,269/604/8,828 bytes with SHA-256
`ccbefd998c8fce17fb64b646bbdc75c07574268f39f016d7e954f929041d91bd`,
`6911219ee6ef3879c56a80bf3a20c80b1ab8e552fd57746a284ff030aec8c133`,
and `cbc72fed967065d7a2cee8437b6508b34c68ff180f8e35e947c3c49c59b6a66f`.
Green roots are
`artifacts/manual/wp5ae-container-artifacts-{windows,linux}-green/`; bindings
and source blobs match. One nonqualifying baseline setup install inherited the
source cwd; it ran no test, wrote no evidence, changed no tracked byte, and
left source dependencies bound to the established store. One owner-clone
setup process could not start because its not-yet-created cwd was selected;
it made no filesystem change. No decision record is needed.

Next is historical `verification-clone.test.ts` at `1786995311714`: one pass
and two failures. The first two cases pass shared `repository()`'s raw
`milestone-loop-clone-source-*` root to strict candidate inspection. The third
creates the same source but passes a derived junction to the linked-root guard
and historically passes. It remains open for exact current reproduction and
direct proof.

**Commit.** Assigned by the cohesive WP5ae commit containing this entry; local
and unpushed.

**Known gaps.** The verification-clone file, frozen Windows aggregate and
broader checks, POSIX `setsid`, CAL-1, hidden validation, product breadth,
readiness, and human verification remain open. No completion claim is made.

## 2026-08-22 — WP5ad canonical deterministic-operations fixture root

**Objective and cause.** From exact clean WP5ac, reproduce both historical
deterministic controller-operation failures, prove `deterministicFixture()`
before changing it, and preserve status/dry-run inspection, lease exclusion,
Git setup, configuration, state, and reconciliation semantics. Both cases were
0/2 because the raw `milestone-loop-deterministic-*` root retained its NTFS
8.3 spelling while strict orchestrator Git-root inspection resolved the
expanded identity and rejected the mismatch as an unsafe Git root.

**Evidence.** Exact no-local/no-hardlink clone `C:/wp5ad1b/repo` at WP5ac
`1836a5da5a3e0c287aa5b874bf4fa2c6fd299013` / tree
`283c6f1155841cd71df3797eb3fb79bb58a0005a`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, isolated store, and distinct
`WP5ADB~1`/expanded TEMP reproduced 0/2. Its 2,781-byte report, 9,030-byte
ERROR/no-receipt manifest, and 1,157-byte telemetry manifest have SHA-256
`2e78078b357f2a0cb9c9312523f7e18759f50175709e9bde632e15fd9ad4562f`,
`3e52627db6557139afac4a58f02227d2988758d9f03e2ecdeeda10f7cecf2765`,
and `b8f6ee2a43a343971fe9c33f45eb61f5b97909b8029e095e2fcf060973ca0e3f`.
Assertion-only tree `dd32c85d060fee56c07f3cccde69e70ae53e0707` imported promise
`realpath` and asserted `expect(await realpath(root)).toBe(root)` immediately
after creation. Both cases failed directly there before root registration,
protected/config file creation, Git initialization, or orchestrator open. Its
2,334-byte report, 9,022-byte ERROR manifest, and 1,154-byte telemetry
manifest have SHA-256
`2514398330fb0f4035bdec19bf285a757c843a288e83abd08000fbd80370ebb3`,
`5e1a40a73d5dd0194e4f9fd83a899f07ff10e9283a2f66f93adffac61777f9bb`,
and `3513d07fa755ce43e7debae80e39a0f9488c28f0610df19c7800cae5c44ce73b`.
Red roots are
`artifacts/manual/wp5ad-deterministic-operations-{red,owner-red}/`.

**Correction and verification.** Only `deterministicFixture()`'s fresh root
now uses `realpath(await mkdtemp(...))`; the assertion remains. Production
orchestrator/Git/lease/state/reconciliation code and caller paths are
byte-identical. Corrected tree
`7e75d91da01463701f7a7f5bd5025e0edc544581` passed Windows 2/2, zero
skips. Its report/receipt/manifest are 1,331/609/8,861 bytes with SHA-256
`4f0c982c0272683ebf91f8d3fa5864395ec26a9179341acb34f710a0964dbf55`,
`abe4e112ba74c13a09cc1e9b1c1654f889850cafc3a3e14da4f3573fa2248bfa`,
and `bee4de455f9fa74fe5f49495fdf1ab4cb13eb415d4dd63beeda1ba8d3c26eccf`.
The identical full file passed WSL2 ext4 2/2; its report/receipt/manifest are
1,353/609/8,821 bytes with SHA-256
`f4c52e9170c11de1f98bc2c6c7dca70b375ea2d7fb13ad1fd316787769543ead`,
`32e1d56c98e9d4ea2f42b54e368f273f49d454952c6d399a3a652afd04cf09b4`,
and `b8b97bbec5e4553c6cec7dd32d124836052f23371f597d9a1fcc07da94972fa4`.
Green roots are
`artifacts/manual/wp5ad-deterministic-operations-{windows,linux}-green/`;
bindings and source blobs match. The Linux setup had three nonqualifying
wrapper exits before the test: one quoting loss created no clone, one pnpm
install stopped for missing `CI=true`, and one post-install version probe
received a carriage-return option. The exact clone remained clean, the CI
install completed, and none of those setup attempts created command evidence.
No decision record is needed.

Next is historical `container-artifacts.test.ts` at `1786995304153`: one pass
and four failures. The first four cases share raw `root(prefix)` fresh
directories that cross strict artifact path checks; the fifth combined-limit
case creates no filesystem root and passed. It remains open for exact current
reproduction and direct proof.

**Commit.** Assigned by the cohesive WP5ad commit containing this entry; local
and unpushed.

**Known gaps.** Remaining artifact/verification-clone files, the Windows
aggregate, final broader frozen-candidate checks, POSIX `setsid`, CAL-1,
hidden validation, product breadth, readiness, and human verification remain
open. No completion claim is made.

## 2026-08-22 — WP5ac canonical retention-apply recovery fixture directory

**Objective and cause.** From exact clean WP5ab, reproduce both historical
retention hard-loss failures, prove `preparedFixture()` before changing it,
and preserve the crash worker plus production retention/state/schema/lease
semantics. Both cases were 0/2 because the raw
`milestone-loop-retention-<label>-*` directory fed short metadata and derived
repository paths to the worker; its first retention persistence rejected the
pending operation as schema-invalid.

**Evidence.** Exact no-local/no-hardlink clone `C:/wp5ac1b/repo` at WP5ab
`2dcca3ad78394ba01d1a410587383ceabf2cb87b` / tree
`c17c5f0a6b3af174d8ad7b919e2aef135feb775f`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, isolated store, and distinct
`WP5ACB~1`/expanded TEMP reproduced 0/2. Its 4,099-byte report, 9,034-byte
ERROR/no-receipt manifest, and 1,159-byte telemetry manifest have SHA-256
`06284483e4e3d19a7b5254424b8caa40d018f3e3f492a6c46e0d783e224f6fbd`,
`b9e2aa46cc7f9d03f204b12237184242543c26fbc4eacf7a26e76f176df3425f`,
and `d4a99c6c99768dd034c7d8db7d1d967fac376573db067ac091f2d4819b2740ef`.
Assertion-only tree `1853c6787addcb9cadc39c94f935f368810826fb` imported promise
`realpath` and asserted `expect(await realpath(directory)).toBe(directory)`
immediately after creation. Both cases failed there before registration,
metadata derivation, or worker launch. Its 2,337-byte report, 9,026-byte ERROR
manifest, and 1,156-byte telemetry manifest have SHA-256
`30db1aa209e7aa0cd47c203dc6fab92f8157a59e9af1c6131002d7fae3675f91`,
`c4545c0bbfc4d2ef2c76dd0f122d5b756edb0058ccd871ac51b17ea6ba99031a`,
and `38e1f2b6e99d89b74f201dc126e4648e22a61bcea941fab3d0fba77f29a3cb14`.
Red roots are
`artifacts/manual/wp5ac-retention-apply-recovery-{red,owner-red}/`.

**Correction and verification.** Only `preparedFixture()`'s fresh directory
now uses `realpath(await mkdtemp(...))`; the assertion remains. The worker,
nine declared fault points and exit 86, recovery operation, state/schema,
leases, and caller paths are byte-identical. Corrected tree
`92c4b1a6d30083dbcd4987d75340fd23394368da` passed Windows 2/2, zero
skips, after executing the complete nine-fault matrix and synchronized
contenders. Its report/receipt/manifest are 1,350/609/9,266 bytes with SHA-256
`976c1528e3d9cc567dd0df891fae598263b956c394d150fb154558005688bb75`,
`8d920cb8129fbfaee7a326ca4d3ba85e84f78631d4de211e19165b251ebb1c6d`,
and `161944372f695155e93d497d8e77a5e830c1e07ef4f5bffa14372bfb0e6fce5a`.
The identical full matrix passed WSL2 ext4 2/2; its report/receipt/manifest are
1,356/609/9,226 bytes with SHA-256
`837d10424a05bc8dcf69be891a4dc0611f06a54170ec9d2b15739cc7e5257241`,
`469765880868e0ad1cf644a0bcf89e6c80471ef79fede35e09af2e073932a9e7`,
and `505fb9e93b2a6e9d11c82a6bf9812d520f406b5163fc0dc5c16f1a0021847bef`.
Green roots are
`artifacts/manual/wp5ac-retention-apply-recovery-{windows,linux}-green/`;
bindings and source blobs match. No decision record is needed.

Next is historical `deterministic-operations.test.ts` at `1786995301890`:
0/2. Its shared `deterministicFixture()` owns a raw
`milestone-loop-deterministic-*` root that crosses strict orchestrator Git
inspection. It remains open for exact reproduction/direct proof.

**Commit.** Assigned by the cohesive WP5ac commit containing this entry; local
and unpushed.

**Known gaps.** Remaining deterministic/artifact/clone files, the Windows
aggregate, final broader frozen-candidate checks, POSIX `setsid`, CAL-1,
hidden validation, product breadth, readiness, and human verification remain
open. No completion claim is made.

## 2026-08-22 — WP5ab canonical scoped Git-isolation workspace parents

**Objective and cause.** From exact clean WP5aa, reproduce historical
`git-isolation.test.ts`, prove and repair only its two failing
workspace-creating parents, and leave two historically passing direct-Git
roots untouched. Baseline was and remains two passes/two failures. Only the
first two cases derive `source` repositories from raw `milestone-loop-git-*`
parents and cross strict workspace Git inspection; those short spellings
conflicted with expanded realpaths.

**Evidence.** Exact no-local/no-hardlink clone `C:/wp5ab1b/repo` at WP5aa
`0de6fea0796c33341560699334ac7ef2867d329e` / tree
`708af19aec17e39d3c548f29d01c87643e071a88`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, isolated store, and distinct
`WP5ABB~1`/expanded TEMP reproduced 2/4. Its 3,208-byte report, 9,018-byte
ERROR/no-receipt manifest, and 1,157-byte telemetry manifest have SHA-256
`7c220f4834662bda974b0f39e517572a294acfc1475dc479256219a53f4cb2a3`,
`318f20cd8eb0d8f086bf0852ecad720dfb599e16fe2b26ae868d08193b0b8363`,
and `b6acbb20671bd96d0fa22d6ee22b7293472bd33eb74a084c40a5efdae083d6db`.
Assertion-only tree `da8a74f84d8c705e29c97a35991d906926da38fd` imported promise
`realpath` and added direct parent assertions only at the first two sites.
Those two cases failed at the new lines before repository creation; the later
two raw-parent cases stayed byte-identical and passed. Its 2,522-byte report,
9,011-byte ERROR manifest, and 1,154-byte telemetry manifest have SHA-256
`78c638e85f7f0bdd06c7c11e58e5e0429a3d96df7df3df339a8828a4e23f97c1`,
`98b0f9052e97a591386a63df9ca56aac66e98684adab3c94827861757becf4cd`,
and `a73ecd13f971425c28e9524e0a0b4a02450b7422f2b3d1d9ea87d8d0fcadb556`.
Red roots are `artifacts/manual/wp5ab-git-isolation-{red,owner-red}/`.

**Correction and verification.** Only the first two fresh parents now use
`realpath(await mkdtemp(...))`, retaining assertions. The later two parents,
all production Git identity/integration and workspace code, and all
caller/pre-existing paths are unchanged. Corrected tree
`6c14d7c450df1613beeff3d6b767f5c1eb8e03f5` passed Windows 4/4, zero
skips. Its report/receipt/manifest are 1,794/598/9,251 bytes with SHA-256
`11b99ff6e9ec9db86d94f6d5e74aafaacb7e95d5151be9a47b20a9523f327e9f`,
`38452d8eaf8ffa13dac3122c1d5cbcc915bf979c1ea88a4bdde06f8d31f67ec7`,
and `b649f518b6b9e13788d4ee4414e67a7bb9c554a1763cce5569a268e3e033d08c`.
The identical tree passed WSL2 ext4 4/4; its report/receipt/manifest are
1,793/598/9,211 bytes with SHA-256
`ab4c2be77f49b4403ea99388e6c63a5188119d08082da51f5255459ef1deb7cf`,
`c9465f7ae2fc12bd36415a65130b044b0040be9656ff2126a39f470b0bb5108e`,
and `c038f93f62199690331e3f862fb30167a86418e120a636fe0456ea482132936a`.
Green roots are `artifacts/manual/wp5ab-git-isolation-{windows,linux}-green/`;
bindings and source blobs match. No decision record is needed.

Next is historical `retention-apply-recovery.test.ts` at `1786995292928`:
0/2. Its `preparedFixture()` owns a raw
`milestone-loop-retention-<label>-*` directory. The subprocess derives its
repository and metadata from that spelling, then strict realpath-backed
retention state rejects the pending operation. The worker and production
retention code remain out of scope pending exact reproduction/direct proof.

**Commit.** Assigned by the cohesive WP5ab commit containing this entry; local
and unpushed.

**Known gaps.** Remaining retention/deterministic/artifact/clone files, the
Windows aggregate, final broader frozen-candidate checks, POSIX `setsid`,
CAL-1, hidden validation, product breadth, readiness, and human verification
remain open. No completion claim is made.

## 2026-08-22 — WP5aa canonical retention-startup fixture root

**Objective and cause.** From exact clean WP5z, reproduce the next historical
Windows file, directly prove its test-owned fresh root, and preserve all
retention/state/schema/orchestrator semantics while applying one narrow
fixture correction. Historical and current
`orchestrator-retention-recovery.test.ts` were 0/1: the pending retention
operation became schema-invalid before the intended `after-run-deleted` fault
could produce the expected simulated startup handoff. The raw
`milestone-loop-retention-startup-*` root retained its short spelling while
strict realpath-backed operation fields observed the expanded identity.

**Evidence.** Exact clean no-local/no-hardlink clone `C:/wp5aa1b/repo` at WP5z
`7984d1ac9b9b41e2ad42a485d847245085ea26ee` / tree
`8a71d2dcf7605a89c3bbff0a4e4eeee18cc8f5b3`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, isolated store, and distinct
`WP5AAB~1`/expanded TEMP reproduced 0/1. Its 1,837-byte report, 9,044-byte
ERROR/no-receipt manifest, and 1,161-byte telemetry manifest have SHA-256
`f66544c2a78a743219c5f7257b6fcff3247697755bbdee0387f91cda254e7ff3`,
`1de9a918c8cb80badcde9e10cd63e11acb895fe11ea19f79a4e4962b64782a44`,
and `4972e099ccf619f874932e91010166d38607eb1d95a091a2b80e4adb0e1ee3d9`.
Assertion-only tree `e65c1dd9c462694b34b0ee94714d12190926b123` imported promise
`realpath` and asserted `expect(await realpath(root)).toBe(root)` immediately
after creation. The sole case failed directly there before temporary-root
registration, config, Git, state, or retention setup. Its 1,418-byte report,
9,038-byte ERROR manifest, and 1,158-byte telemetry manifest have SHA-256
`d2cd7eea0d8639134570ae93f48d509fa667bcffd1f108cb63b28683c1f5f6b5`,
`6cdc8853412442ad75c399f39164803aa027cfd3e2defbfc1ef2c2f7f841d36d`,
and `34813a605e8ac205cbc1f7a619c561523590ed00dd05a8261949178335b11ce8`.
Red roots are
`artifacts/manual/wp5aa-orchestrator-retention-recovery-{red,owner-red}/`.

**Correction and verification.** Only the fresh fixture root now uses
`realpath(await mkdtemp(...))`; the assertion remains before all consumers.
Production retention operation/recovery, state, schema, lease, orchestrator,
strict path checks, and the intentional fault are byte-identical. Corrected
tree `719d6ebc6e564eb5d394945214efbafff5704553` passed Windows 1/1, zero
skips. Its report/receipt/manifest are 1,029/616/9,277 bytes with SHA-256
`3de986ada7d2ca8c13e31a236456464bfc4f16b37f93601bdf7e1e02668d357b`,
`d98a428e7866400102d3dbb4b779ed82f4a50d373aa222b6a3c12ae3194b7561`,
and `c951af1d022b44849ede607e13efaf8a8f75705149a9ef7492cecdda0efa7e83`.
The identical tree passed WSL2 ext4 1/1; its report/receipt/manifest are
1,035/616/9,237 bytes with SHA-256
`0fad0767b394f5bc5d5e598417e8185522827ed7ceb4598741836dc7cd99f606`,
`1a2ca8b6d3666c567abefe6afb9b200d1dba1f30ffe78656cfa13051a1cf4033`,
and `9be9e06ae668657119267121400d5ea9e125aa247d97d922ee2b8f830106325c`.
Green roots are
`artifacts/manual/wp5aa-orchestrator-retention-recovery-{windows,linux}-green/`;
bindings and source blobs match. No decision record is needed.

Next is historical `git-isolation.test.ts` at `1786995290362`: two passes and
two failures. Only its first two raw `milestone-loop-git-*` parents derive
repositories that cross strict workspace creation; its later two raw parents
serve direct Git inspection and already passed. The later sites are explicitly
out of scope absent their own red proof, preventing bulk canonicalization.

**Commit.** Assigned by the cohesive WP5aa commit containing this entry; local
and unpushed.

**Known gaps.** Remaining Git/retention/deterministic/artifact/clone files,
the Windows aggregate, final broader frozen-candidate checks, POSIX `setsid`,
CAL-1, hidden validation, product breadth, readiness, and human verification
remain open. No completion claim is made.

## 2026-08-22 — WP5z canonical contract-integrity clone parent

**Objective and cause.** From exact clean WP5y, reproduce historical
`contract-integrity.test.ts`, prove its separate fresh parent owner, preserve
the corruption semantics and strict evidence-context consumer, and verify one
narrow test-only correction on Windows-short and Linux ext4. Historical and
current baseline were one pass/one failure: the corrupt adapter exited 3
instead of its expected failure exit 1 because `commissionedClone()` derived
the evaluated repository from a noncanonical `contract-integrity-*` parent.

**Evidence.** Exact no-local/no-hardlink clone `C:/wp5z1b/repo` at WP5y
`56dc9efbff64fa14e6d2787564b49b4284e74a96` / tree
`56842641f182a009a4861b0b8d4036edfee5c82e`, pinned Node `24.18.0`, pnpm
`11.15.1`, no alternates, an isolated store, and distinct
`WP5ZBA~1`/expanded TEMP reproduced 1/2. Its 2,478-byte report, 9,030-byte
ERROR/no-receipt manifest, and 1,161-byte telemetry manifest have SHA-256
`037366c351af5fcb9d87fc2532ba2439bb3acd5930328021fa3b4466e5db2944`,
`774bcac2373e364a1d31da1a991c68f7a030c86520216f7845d9a1beb2fac173`,
and `b697bfc52ea9e54984b79b4711314d39ceb780a1ab84768aedd07ad2e2b57131`.
Assertion-only tree `f7b31495eaa92d038d268f4b50279739799b13c4` imported promise
`realpath` and asserted `expect(await realpath(parent)).toBe(parent)` directly
after creation. Both cases failed at `commissionedClone()` before temporary
registration or Git clone setup. Its 2,348-byte report, 9,024-byte ERROR
manifest, and 1,158-byte telemetry manifest have SHA-256
`d411673ff536e02f7283dd0dea495f534f97a693565ecb4f2d2285b6285f284c`,
`f8e0359ea748f15366dd0a7a8ce39eca5be180e3cb1428e183092834db443186`,
and `8290973862ef8b097a7eee7ae7901d2e0bf2db61a9e5b42459f33c93c9a8a279`.
Red roots are `artifacts/manual/wp5z-contract-integrity-{red,owner-red}/`.

**Correction and verification.** Only the fresh parent now uses
`realpath(await mkdtemp(...))`; the assertion remains before clone derivation.
The contract evaluator, verifier/invariant adapter, strict evidence-context
check, intentionally corrupted manifest, and expected exit behavior are
byte-identical. Corrected tree
`d9c72bfcf2796796cc4468f2f1be1326f1440ee5` passed Windows 2/2, zero
skips. Its report/receipt/manifest are 1,386/603/9,262 bytes with SHA-256
`8bfc62c77e06f0e283479f97cecc6eadcfd2a5d6b15fa8347cee392a12c554ef`,
`3916469e7e22907ce2ef8524348c7b0762eb8f5f42811443b3ea005102e295cb`,
and `6859e79a6398e35e403c3f4afa5b6710225e01ff565899caedaba92fac1fbf92`.
The identical tree passed WSL2 ext4 2/2; its report/receipt/manifest are
1,392/603/9,223 bytes with SHA-256
`d8eea9d51fd7ef936596b469d8b9f7794547e7100b91a51643381b21a1c336b8`,
`037538f5e8b38bf8140e9f637e32579bd3c99c69bd010dd27577f5ac7a19b9a9`,
and `f8c5180617004ed468be6966d4abb0a033d51034c4dc50507b401bf598b1e97b`.
Green roots are
`artifacts/manual/wp5z-contract-integrity-{windows,linux}-green/`; bindings and
source blobs match. This is a test fixture correction, so no decision record
is needed.

Next is historical `orchestrator-retention-recovery.test.ts` at
`1786995288202`: 0/1. Its pending retention operation became schema-invalid
before the expected simulated handoff. Current source owns a raw
`milestone-loop-retention-startup-*` root; operation planning resolves that
short spelling while strict realpath-backed artifact fields use the expanded
root. It remains open for exact reproduction and direct proof.

**Commit.** Assigned by the cohesive WP5z commit containing this entry; local
and unpushed.

**Known gaps.** Remaining retention/Git/deterministic/artifact/clone files,
the Windows aggregate, final broader frozen-candidate checks, POSIX `setsid`,
CAL-1, hidden validation, product breadth, readiness, and human verification
remain open. No completion claim is made.

## 2026-08-22 — WP5y canonical Windows workspace-cleanup fixture root

**Objective and cause.** From exact clean WP5x, reproduce and repair only the
next retained fixture owner under genuine NTFS 8.3 TEMP, prove the owner before
changing it, verify both controller platforms, and commit narrowly without
pushing. Historical `workspace-cleanup.test.ts` was 0/6 at `1786995278951`.
Its `fixture()` retained raw `milestone-loop-cleanup-unit-*` spelling before
Git initialization and strict workspace inspection.

**Evidence.** Exact no-local/no-hardlink clone `C:/wp5y1b/repo` at WP5x
`b58184a5572f64f35a748871090544a9c0f26c42` / tree
`d0bd256a6d98fcd1b2d9797f5ef06838df06131c`, no alternates, pinned Node
`24.18.0` and pnpm `11.15.1`, an isolated store, and distinct
`WP5YBA~1`/expanded TEMP reproduced 0/6. Every failure was the same strict Git
root mismatch. Its report and ERROR/no-receipt manifest are 7,611/9,042 bytes
with SHA-256
`690912fd9335a28b026f226a46acba328fee52617b7e8167ba2a0416808b56bf`
and `02380db3a68a778eb77df7f7333402011119366fbe17f3d218c873bd6b5f2248`.
The 1,167-byte telemetry manifest is
`f79ab313700a12e0fb83852a5de0b124a47b1353dd348801ce782e7f82c76bff`.
Assertion-only tree `9c91525b39bbc61f1f893b45961d8c9fd34b11f4` imported promise
`realpath` and added `expect(await realpath(root)).toBe(root)` immediately
after `mkdtemp`. All six cases failed directly at that line before Git or
workspace creation. Its 5,590-byte report, 9,020-byte ERROR manifest, and
1,157-byte telemetry manifest are
`9323d80fdd1b48a16dc70ffc03579c33c803afbd57306304b80a952fcf291ae2`,
`1407d0339787d1bb87eef9477ae1c6f1fb2dcdfe521b7ab3018648b384582f52`,
and `93b96095141a022e4a8ef4188e46cc9ae08bdf81ff5909198573d97ca9424959`.
Red roots are `artifacts/manual/wp5y-workspace-cleanup-{red,owner-red}/`.

**Correction and verification.** Only the fresh root now uses
`realpath(await mkdtemp(...))`; the assertion remains before registration and
Git setup. Production Git, workspace creation/cleanup/archive, state/schema,
and caller-controlled paths remain byte-identical. Corrected tree
`74c712b5ac177e33e9578063909f0422272c8128` passed Windows 6/6, zero
skips. Its report/receipt/manifest are 2,778/602/9,259 bytes with SHA-256
`96cebd7ff36eded1e27e5a8633b00e53592ee86dbe9e14505d3801474ed02eb8`,
`46144ff0ac5c78e9aaa5461067ea0b987012cad730d9b1b33deb11504e3c5e4c`,
and `90503aa191c8da42739a0939e0434183835f60397031b9f9c61a9d3bb3a2addd`.
The identical tree passed WSL2 ext4 6/6, zero skips; its
report/receipt/manifest are 2,793/602/9,220 bytes with SHA-256
`ed83d52a867fd097afa101c1dbde6dab5568ab82103031358ee85a80b5ede907`,
`6aada8dc726a4ab74f65f9c91877e4f6811d92afe3396f993365c215b6161078`,
and `7c0f97af14f99743ffa276a5f62d27b3797242cab5df2fdc294792081b6b4c7f`.
Green roots are
`artifacts/manual/wp5y-workspace-cleanup-{windows,linux}-green/`. Bindings and
the corrected source blob match exactly; no decision record is needed.

**Nonqualifying setup diagnostics.** The first install wrapper inherited the
source working directory. It ran no test, changed no tracked bytes, and the
source dependency tree was immediately restored to its pinned store before
the clone was installed with an explicit CWD guard. A later direct-Node red
run bypassed `tsx`; its tests reproduced 0/6, but telemetry initialization
could not resolve a TypeScript-side `.js` specifier. It is excluded from the
qualifying record and retained under
`artifacts/manual/wp5y-workspace-cleanup-telemetry-loader-red/` (7,630-byte
report SHA
`c46bef048286b1d953fe875f308c3f3a84dabb26b7897d9e32148119ce34e018`,
8,880-byte ERROR manifest SHA
`943c6c1da8a06e4498bd9ddac9efcd001294feb4ab667452479b0c00f731d2ef`).

Next is historical `contract-integrity.test.ts` at `1786995282986`: one pass
and one failure. The corruption adapter exited 3 because the evidence context
used the short derived clone root while evaluation observed its expanded
identity. Its separate `commissionedClone()` owns a raw
`contract-integrity-*` parent and remains open rather than bundled.

**Commit.** Assigned by the cohesive WP5y commit containing this entry; local
and unpushed.

**Known gaps.** Remaining contract/retention/Git/deterministic/artifact/clone
files, the Windows aggregate, final broader frozen-candidate checks, POSIX
`setsid`, CAL-1, hidden validation, product breadth, readiness, and human
verification remain open. No completion claim is made.

## 2026-08-22 — WP5x canonical Windows workspace-create fixture parent

**Objective and cause.** From exact clean WP5w, reproduce and repair only the
next retained fresh fixture owner, verify both controller platforms, and commit
narrowly without pushing. `workspace-create.test.ts` was 0/5 at
`1786995272196`. Its `fixture()` retained raw `milestone-loop-workspace-*`
parent spelling and derived `source` from it; strict Git inspection correctly
rejected the expanded source identity.

**Evidence.** Exact no-local/no-hardlink WP5w clone `C:/wp5x1b/repo` at commit
`e292d411bd6c3b18c8bba284eeed83132a351047` / tree
`6d273ab902cf5dd47b72f1813a02a3dbaf2739ea`, pinned tools, no alternates/
drift, and genuine `WP5XLO~1` TEMP reproduced 0/5. Report/ERROR manifest are
5,676/9,025 bytes with SHA-256
`5650beeae2750953e0dc30ad57674755d347c75516010bb563bc89f8aba8c537`
and `5218316239d59f539c25503d80d3d929ab84aaf1a8eab203003e3872ca2b30b0`;
no receipt exists. Assertion-only tree
`84c028cdd7efd4ed187dee4c743aea93d64fe820` added promise `realpath` and
`expect(await realpath(parent)).toBe(parent)` beside the creator. All five
cases reported that equality failure directly or through their expected-error
matcher before source derivation. Its 4,616-byte report and 9,018-byte ERROR
manifest have SHA-256
`00e453121d195d428ca673e9d9cd43723476b3ff8c754a7574e560e8e6af713d`
and `07fe454a7b91aed0eddc3e3833022a5bf9dcf88d42ca88516edb334aa92afd03`.
Red roots are `artifacts/manual/wp5x-workspace-create-{red,owner-red}/`.

**Correction and verification.** Only the fresh parent now uses
`realpath(await mkdtemp(...))`; the assertion remains before registration and
source derivation. Production workspace/Git code and caller paths are
unchanged. Tree `9e2438f1cb28798ce63e84e150601b00545d2587` passed Windows 5/5,
zero skips. Its report/receipt/manifest are 2,287/601/9,241 bytes with SHA-256
`590b64a536d0ea972a35ba14113f5dc2f6032a45b4481a89c80ba9e9dcdedbbe`,
`f05d7fd9674e0c2cdfe99c8d4a91d9b775f38225bfb1bd30b518fc3c87acf829`,
and `f53614222d855bf98614c9ae4cae5c9645430cd8fe918d2a29139bcb84174e29`.
Linux ext4 PASS had four passes and the existing explicit Windows-only
`it.runIf(process.platform === "win32")` junction test skipped. Its
report/receipt/manifest are 2,267/601/9,205 bytes with SHA-256
`a5023c4704220c0e9685ee4bce95f9715cb6f16af23222dde723a261f052dfdd`,
`b293dcae208a0b4acf6738d76adc948492878f0c17b57d4dec57da13cee12624`,
and `563685d7b8ae9ac0f21596c28ce1a1e7be7c23784989b738871a97e858cc6401`.
Bindings match; no test/platform guard changed and no decision record is
needed.

A post-verification formatting attempt selected system Node `25.9.0`; pnpm
stopped at its noninteractive module-reconciliation guard before formatting.
Direct Prettier then confirmed all three commit paths were already formatted;
the qualifying evidence above remains exclusively pinned Node `24.18.0`.

Next is `workspace-cleanup.test.ts` at `1786995278951`: 0/6. Its separate
`fixture()` retains raw `milestone-loop-cleanup-unit-*` before workspace/Git
inspection. It remains open rather than bundled.

**Commit.** Assigned by the cohesive WP5x commit containing this entry; local
and unpushed.

**Known gaps.** Later workspace/Git/retention/artifact/verification-clone
clusters, POSIX `setsid`, CAL-1, hidden validation, product breadth, readiness,
and human verification remain open. No completion claim is made.

## 2026-08-22 — WP5w canonical Windows target-integration fixture root

**Objective and cause.** From exact clean WP5v, reproduce the next retained
Windows failure, prove and correct only its fresh fixture root, verify Windows
and Linux ext4, and commit narrowly without pushing. The historical report
places `target-integration.test.ts` at `1786995254903`: 0/4. Its `fixture()`
retained raw `milestone-loop-target-action-*` beneath short TEMP and passed it
through workspace creation; strict `inspectTarget()` correctly rejected the
expanded Git-root identity before intended integration behavior.

**Red evidence.** Clean no-local/no-hardlink clone `C:/wp5w1b/repo` at WP5v
commit `05afdba36b53d5e1e71237b26b6209c2136f22b4` / tree
`60d104aff7d56d5fa27f6e0ecbe4cf9a700ae863`, pinned tools, no alternates or
status drift, and genuine `WP5WLO~1` TEMP reproduced 0/4. The 5,896-byte
report and 9,031-byte ERROR manifest at
`artifacts/manual/wp5w-target-integration-red/evidence/` have SHA-256
`59797688b7eb78ae3d6e0799b6aa30ff8ab511ce6d36b415d8f32ac400ea37e8`
and `2c9e22d1dbccbb61af1ce8c0e1678f30f3f967ceaf0eb00a2da8bff8ec5700b4`;
no receipt exists.

Assertion-only tree `cdb6312878cf7739af5e028995e2228236e0d365`
added promise `realpath` and an equality check beside the creator. Three cases
failed directly at that check; the first surfaced the same assertion through
its expected-rejection matcher. Its 4,876-byte report and 9,024-byte ERROR
manifest under `artifacts/manual/wp5w-target-integration-owner-red/evidence/`
have SHA-256
`9596a6ecb385d570c6c66377936237b5936a8e9d8ca2138cbe4dc7542bb1e213`
and `1875af2bba50a8f4b7661aef98bc00271ff4fba0608843c8384fec9b87b4b342`;
again no receipt exists.

**Correction and verification.** `fixture()` now uses
`realpath(await mkdtemp(...))` only for its just-created root and retains the
direct assertion before registration or Git use. Production Git/workspace/
target integration, state/schema, and caller paths remain byte-identical.
Test-only tree `a81692822dde9520ac3268aced3dce2af87796ff` passed 4/4 with zero
skips on Windows-short and WSL2 ext4. Windows report/receipt/manifest are
2,202/603/9,246 bytes with SHA-256
`a7ac36cfe2d755e06200700b917d0d3191b76aa7827ef486ae2ef4514b591819`,
`74cb2f4fef352ed6669f5becd3a7c90ef36f292968928d84e1c1d3013fc75709`,
and `37873d89f8a45079024249fd78bc24f9053d0475f7eae6a11f903aa85944c6f7`.
Linux report/receipt/manifest are 2,224/603/9,211 bytes with SHA-256
`b8512d709da3d04836aa00aa521da7e74c20a86ab5ad012fbd3f988c54597049`,
`6e28ebcc29fe337cea28204e633cbb0337c4600b4125457ac876b4fd35637886`,
and `785be6eed1ac0a5d3490af4edb1dca1612f579640bd8e4f12a95585be2a67a32`.
Bindings match independently. This is test-only and needs no decision record.

Next is `workspace-create.test.ts` at `1786995272196`: 0/5. Its separate
`fixture()` retains a raw `milestone-loop-workspace-*` parent before deriving
the `source` Git root. It remains open rather than bundled.

**Commit.** Assigned by the cohesive WP5w commit containing this entry; it is
local and unpushed.

**Known gaps.** Later workspace/Git/retention/artifact/verification-clone
clusters, POSIX `setsid`, CAL-1, hidden validation, product breadth, readiness,
and human verification remain open. No completion claim is made.

## 2026-08-22 — WP5v canonical Windows workspace-create recovery fixture root

**Objective.** Reproduce the next retained hosted-Windows controller file from
the exact clean WP5u commit under pinned tools and genuine NTFS 8.3 TEMP, prove
its fixture-owned root precondition, canonicalize only that fresh root, verify
the complete file on Windows and Linux ext4, and commit one narrow owner
without pushing. Preserve strict Git/workspace-create recovery consumers,
fault points/timeouts, state and reducer semantics, later clusters, immutable
authority, lifecycle/CAL-1, and the protected human file.

**Cause and red proof.** The historical report places
`workspace-create-recovery.test.ts` at `1786995226842`: 0/5. Its `fixture()`
retained raw `milestone-loop-recover-create-*` beneath short TEMP and passed it
to `MilestoneOrchestrator.open()`; strict `inspectTarget()` correctly rejected
the expanded Git-root identity. Exact clean no-local/no-hardlink WP5u clone
`C:/wp5v1b/repo` at commit
`5653a345d1c3cbb35e2962c0de7c171e97ba794f` / tree
`8fba32c639c8f8c79869a760a09e5d07e04fd948`, pinned tools, no alternates or
status drift, and genuine `C:/wp5v1b/WP5VLO~1` TEMP reproduced 0/5. Its
6,566-byte report and 9,051-byte ERROR manifest under
`artifacts/manual/wp5v-workspace-create-recovery-red/evidence/` have SHA-256
`e1f0e160b786fc7bdf7a084ae96393feafb6f34630ae3fd95fdb3531464601aa`
and `9c57edc736bb583dd61b205e0b9a8178588d35ed0a153cb01eabeafd811c7e84`;
no receipt exists.

Assertion-only tree `74daa61698513eb017dbc0aeae2b9e1559785a9b`
added promise `realpath` and
`expect(await realpath(root)).toBe(root)` immediately beside the creator. It
remained 0/5, with every case stopping directly at that assertion before Git
or orchestrator setup. Its 4,796-byte report and 9,045-byte ERROR manifest
under `artifacts/manual/wp5v-workspace-create-recovery-owner-red/evidence/`
have SHA-256
`25f9b2efe74945c0accb8e3212f77169732eceaeeab934d81460f29e0c04ec78`
and `95c90b465ce3d944fe03bf15a75855b2f938c18689312fa793e998ce35a2e710`;
again no receipt exists.

**Correction and verification.** `fixture()` now resolves only its just-created
root through `realpath(await mkdtemp(...))`; the assertion remains before the
root is registered or used. Production Git, workspace-create/recovery,
orchestrator/reducer, state/schema, fault hooks/timeouts, and caller-controlled
paths remain byte-identical. Test-only tree
`e9f3789866865ed0ef7f54332d08f3f6655b8ba7` passed 5/5 with zero skips on
genuine-short Windows and clean WSL2 ext4. Windows's 2,387-byte report,
610-byte receipt, and 9,292-byte manifest have SHA-256
`59538333a1be9b10c73e519d0327842b7fb1e464337f962e9da9194fc7e6f866`,
`58d0eaf0dc94a07436c38b1edcc3f9cd1b6795913a764c168f1f5934a3b95784`,
and `3a29b9c90359ee3f7010adc1759f9b01558f6ca16ef9b18bd4c84377f1599606`.
Linux's 2,394-byte report, 610-byte receipt, and 9,232-byte manifest have
SHA-256 `5f1400d7a8343572720c84acf2e96adc356a94f6c1db04fdfa2d7a9d3f4fd328`,
`ad28ad8087b310e44dee225d71de0db91eb9a2d130d0036e31385294303280d3`,
and `d9e9b4964114256301334ce621f1a7809e74cc296ad2faf5c071ec7fd344002b`.
All receipt and artifact bindings matched independently. This is a test
fixture correction and requires no decision-log entry.

The next retained failure is `target-integration.test.ts` at
`1786995254903`: 0/4. Its separate `fixture()` retains raw
`milestone-loop-target-action-*` and passes it through workspace creation and
strict Git inspection. It remains open rather than being bundled.

**Commit.** Assigned by the single cohesive WP5v commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** Target-integration and later workspace/Git/retention/artifact/
verification-clone fixture clusters, the documented POSIX `setsid` escape,
CAL-1, hidden validation, product breadth, autonomous readiness, and human
verification remain open. No readiness or product-completion claim is made.

## 2026-08-22 — WP5u canonical Windows workspace-cleanup crash-worker root

**Objective.** Select the earliest unresolved hosted-Windows controller file
after WP5t, reproduce it from the exact clean WP5t commit under pinned tools
and genuine NTFS 8.3 TEMP, prove its controlled subprocess root precondition,
canonicalize only that fresh worker root, verify the complete recovery file on
Windows and Linux ext4, and create one narrow local commit without pushing.
Preserve strict Git/workspace/cleanup inspection, all 15 recovery fault points
and timeouts, cleanup/archive/state semantics, later fixture clusters,
immutable authority, lifecycle/CAL-1 state, and the protected human file.

**Cause and ordering.** The historical hosted report places
`workspace-cleanup-recovery.test.ts` immediately after WP5t at
`1786995222359`: all three cases failed before their intended cleanup crash
boundaries. `test/workspace-cleanup-crash-worker.ts::main()` retained the raw
`milestone-loop-cleanup-crash-*` spelling returned beneath short TEMP and
passed it to `createIsolatedWorkspaceFixture()`. Strict `inspectTarget()`
correctly observed the expanded realpath and rejected the mismatched Git root.

**Red evidence.** Exact clean no-local/no-hardlink WP5t clone
`C:/wp5u1b/repo` at commit
`69c10b3b6e00e0e7bf044115d3bb9e040541e484` / tree
`f8191c7947e41573cf2cb612e6df089b61a84513`, with no alternates or status
drift, pinned tools, isolated writable roots, and a genuine
`C:/wp5u1b/WP5ULO~1` TEMP whose promise realpath expands, reproduced 0/3. The
5,229-byte report and 9,035-byte ERROR manifest at
`artifacts/manual/wp5u-workspace-cleanup-recovery-red/evidence/` have SHA-256
`3469873e155d80a455d047ed517eb1e0218ad33da1ecf0bc686c32feb393c795`
and `e46948956ce23a27303042a8d29e1c5cdb3c8f6acd910dfe2c011276f8d189ed`;
no receipt exists.

Assertion-only tree `5c1c95faed99490fb88b109e8f30af419ab6e9ed`
imported promise `realpath` and Node `strictEqual`, then required the freshly
created worker root to equal its realpath before Git/workspace setup. It
remained 0/3, with every case stopping directly at that assertion. Its
5,183-byte report and 9,028-byte ERROR manifest at
`artifacts/manual/wp5u-workspace-cleanup-recovery-owner-red/evidence/` have
SHA-256 `995284003f38d642f5d3a7d0d0bac46dbe77858642297a0f631160d985b50114`
and `c1728c30ec0f0b49a6fdd2af363238ae2e1d2f3dcadb1229b8a456b46dce55d4`;
again no receipt exists.

**Correction.** The cleanup crash worker now resolves only its freshly created
root through `realpath(await mkdtemp(...))` before deriving Git, workspace,
configuration, state, archive, or evidence paths. The direct assertion remains
beside the creator. Production `git-isolation.ts`, workspace create/cleanup,
orchestrator/reducer, state/schema, archive policy, fault points/timeouts, and
all caller-controlled or pre-existing paths remain byte-identical. This is a
test subprocess fixture correction and requires no decision-log entry.

**Focused verification.** Corrected test-only tree
`d588906184f78bc5eccfcdd0edda64891ef2670d` passed 3/3 with zero skips on
genuine-short-path Windows and a clean WSL2 ext4 clone. Windows's 1,646-byte
report, 611-byte receipt, and 9,275-byte manifest have SHA-256
`c77e82aeb9a54cd91b5e95fb4507b88016b27a11d03e5db2e5ffebfaca5f7ba4`,
`96c86a0d5b246de4c9c04ed74c17cde98079e226a8fae6076853c5f21f2b11b0`,
and `569b6dd76a95675f973944b2525ce74a4389b7249b5f0e147db4cfb158ad6a30`.
Linux's 1,655-byte report, 611-byte receipt, and 9,239-byte manifest have
SHA-256 `c238ad89d5d37a75a4e9df88c9304365aba2c201dc98afd7603966908aaf0aff`,
`7b7251eadfa3400151bba8fbc55848904fedd428ca0dcc58c835f5ceac86f30b`,
and `7502a06a4be3f77fc5de2ca6aed99e316f11d77df941ca017c5748172ed976ac`.
Every receipt and artifact declaration matched independently.

The next retained failed file is `workspace-create-recovery.test.ts` at
`1786995226842`: 0/5. Its directly owned `fixture()` retains the raw
`milestone-loop-recover-create-*` root and passes it to
`MilestoneOrchestrator.open()`, where strict `inspectTarget()` expands and
rejects it. It remains open rather than being bundled.

**Commit.** Assigned by the single cohesive WP5u commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** The workspace-create recovery fixture and later Windows
workspace/Git/retention/artifact/verification-clone clusters, the documented
POSIX `setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. No readiness or product-
completion claim is made.

## 2026-08-22 — WP5t canonical Windows target-integration crash-worker root

**Objective.** Select the earliest unresolved hosted-Windows controller file
after WP5s, reproduce it from the exact clean WP5s commit under pinned tools
and a genuine NTFS 8.3 TEMP spelling, prove its controlled subprocess root
precondition, canonicalize only that fresh worker-owned root, verify Windows
and Linux ext4, and create one narrow local commit without pushing. Preserve
strict Git/workspace/target-integration inspection, recovery fault points and
timeouts, target/state/outcome semantics, later fixture clusters, immutable
authority, lifecycle/CAL-1 state, and the protected human file.

**Cause and ordering.** The historical hosted report places
`target-integration-recovery.test.ts` immediately after WP5s at
`1786995207495`: all three cases failed before their intended crash/recovery
boundaries. `test/target-integration-crash-worker.ts::main()` retained the raw
`milestone-loop-target-crash-*` spelling returned beneath short TEMP and
passed it to `createIsolatedWorkspaceFixture()`. Strict `inspectTarget()`
correctly observed the expanded realpath and rejected the mismatched Git root.

**Red evidence.** Exact clean no-local/no-hardlink WP5s clone
`C:/wp5t1b/repo` at commit
`e8aa6d5c379c59b88ee10b4ea12add6d16ae040c` / tree
`d4039f16b6464ec743b0de761a0ea974bfaff85a`, with no alternates or status
drift, pinned tools, isolated writable roots, and a genuine
`C:/wp5t1b/WP5TTA~1` TEMP whose promise realpath expands, reproduced 0/3. The
5,421-byte report and 9,034-byte ERROR manifest at
`artifacts/manual/wp5t-target-integration-recovery-red/evidence/` have SHA-256
`542760aa5199480b39b2feaf30415f6d032fdbbaf2a8fceac1b995ebb386000b`
and `a81d65ddd8727930cbb87a150452d5bdda2e54c7206c4473cae6c6bcab11e104`;
no receipt exists.

Assertion-only tree `545d44141ed2e0dc88412d71d07b40066a57b579`
imported promise `realpath` and Node `strictEqual`, then required the freshly
created worker root to equal its realpath before Git/workspace setup. It
remained 0/3, but all three subprocesses stopped directly at that assertion.
Its 5,438-byte report and 9,027-byte ERROR manifest at
`artifacts/manual/wp5t-target-integration-recovery-owner-red/evidence/` have
SHA-256 `ae178950d13df56bc380cfce1fb260b01f658cf318570237e6a5c7b5b41b8615`
and `e80730c8313504e612293dfb3faea2878610c73dfe122effb39706b00bdc655a`;
again no receipt exists.

**Correction.** The crash worker now resolves only its freshly created root
through `realpath(await mkdtemp(...))` before deriving Git, workspace,
configuration, state, verification, or outcome paths. The direct assertion
remains beside the creator. Production `git-isolation.ts`,
`workspace-create.ts`, `target-integration.ts`, the orchestrator/reducer,
state/schema, crash fault points/timeouts, and every caller-controlled or
pre-existing path remain byte-identical. This is a test subprocess fixture
correction and requires no decision-log entry.

**Path-budget diagnostic.** The first corrected-tree probe used an
unnecessarily long expanded TEMP and reached a different 0/3 failure. The
published workspace and ref files existed; its symbolic `HEAD` named a valid
41-byte ref containing the same commit as `refs/heads/main`. The nested target
branch ref's absolute path was 266 characters, however, and Git reported
`Filename too long` with `core.longpaths` unset. The 5,402-byte report and
1,331-byte ERROR manifest are retained under
`artifacts/manual/wp5t-target-integration-recovery-path-budget-red/`. An
identical tree passed with a shorter expanded TEMP that still had a distinct
8.3 alias, so this is retained as nonqualifying environment evidence rather
than misattributed to workspace publication. No production change followed.

**Focused diagnostics.** Corrected test-only tree
`2b4ce32834cfb51d280897d4d17c9bed21bb65c9` passed 3/3 with zero skips on
genuine-short-path Windows and a clean WSL2 ext4 clone. Windows's 1,708-byte
report, 612-byte receipt, and 1,564-byte manifest have SHA-256
`4471430537a25f5b052d8cbc9f3601d01d75df1857eaede6fb50e163061c41fa`,
`fd70dd741ef23ce5d1e145a6fe0ef777da8c06f8d89c08b472b79e7148df2c95`,
and `8ec5d682b19dee0e2cdb06570cde0467841ebc0928680baf2839d6431126aa06`.
Linux's 1,721-byte report, 612-byte receipt, and 1,528-byte manifest have
SHA-256 `0b82b9be79aab2e3180d4f47cba85364e25b3d021f19cb402e5f9b67611271c3`,
`08fd44b8c767372bb51119c5783e3cccfeadb74e6338af61cdb4aadded66deb5`,
and `5508412d0756949d192051c785c58598b0dcf0cd035e14e54bd5784d37e20069`.
Every receipt and artifact declaration matched independently.

Two setup attempts created no qualifying evidence. A Windows wrapper invoked
pnpm with a fresh store identity and stopped before evidence creation when it
refused a noninteractive module reconciliation; a later direct-Node attempt
was interrupted after live inspection showed Vitest's worker resolving the
system Node instead of pinned 24.18.0. The successful fresh clone prefixed the
pinned runtime and live inspection confirmed every Node process used it. A
WSL install command omitted `cd`, rebuilt only the source checkout's ignored
`node_modules`, and ran no test; a pinned Windows reinstall immediately
restored that ignored dependency tree without tracked or protected-file drift.

The next retained failed file is
`workspace-cleanup-recovery.test.ts` at `1786995222359`: 0/3. Its failures
originate in the separately owned subprocess fixture
`test/workspace-cleanup-crash-worker.ts`, whose raw
`milestone-loop-cleanup-crash-*` root crosses strict workspace Git inspection.
It remains open rather than being bundled.

**Stable-tree protocol.** The corrected worker, this log, and the next active
plan freeze before final commands. Independent exact candidate clones rerun
the complete Windows-short and Linux-ext4 file with fresh evidence. Exact final
outcomes remain in ignored artifacts and the handoff so tracked bytes do not
change afterward.

**Commit.** Assigned by the single cohesive WP5t commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** The workspace-cleanup crash-worker and later Windows
workspace/Git/retention/artifact/verification-clone clusters, the documented
POSIX `setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. No readiness or product-
completion claim is made.

## 2026-08-22 — WP5s canonical Windows orchestrator-identity fixture root

**Objective.** Select the earliest unresolved hosted-Windows controller file
after WP5r, reproduce it from the exact clean WP5r commit under pinned tools
and a genuine NTFS 8.3 TEMP spelling, prove its controlled root precondition,
canonicalize only that fresh fixture root, verify Windows and Linux ext4, and
create one narrow local commit without pushing. Preserve strict Git/workspace/
orchestrator identity, state/schema, containment, later fixture clusters,
immutable authority, lifecycle/CAL-1 state, and the protected human file.

**Cause and ordering.** The historical hosted report places
`orchestrator-identity.test.ts` immediately after the WP5r cleanup file at
`1786995203341`: all eight cases failed before their intended candidate-
identity/reviewer/integration outcomes. `reviewingFixture()` retained the raw
`milestone-loop-identity-orch-*` spelling returned beneath short TEMP, then
passed it to `createIsolatedWorkspaceFixture()`. Strict `inspectTarget()`
correctly observed the expanded realpath and rejected the mismatched Git root.

**Red evidence.** Exact clean no-local/no-hardlink WP5r clone
`C:/wp5s1b/repo` at commit
`1b51a8bc671a19fab2b82e27a46cca87a333bcba` / tree
`1751b260806c3d10dd4784b133307a7058405fd7`, with no alternates or status
drift, pinned tools, isolated dependency roots, and a genuine distinct short
TEMP, reproduced 0/8. The 10,399-byte report and 9,013-byte ERROR manifest at
`artifacts/manual/wp5s-orchestrator-identity-red/evidence/` have SHA-256
`641348b18375f025f96b8cc0f978863d8673ab3c3acb42ad984338ddcd420dff`
and `bd2f9ea2339fb72c91a8bc9c3b0dc60927bf39c31e79526e8740615130cc4bfe`;
no receipt exists.

Assertion-only tree `d615fb639f4d84356b2f1a2b059a8b4b13c43b5c`
imported `realpath` and required the just-created root to equal it before Git
or workspace setup. It remained 0/8, but every case stopped directly at that
assertion. Its 7,424-byte report and 9,006-byte ERROR manifest at
`artifacts/manual/wp5s-orchestrator-identity-owner-red/evidence/` have SHA-256
`44c9169e1ddf51efbcc3a478657af96805efe50829e0696783b0cf48ca6e1756`
and `e6ba491f6e15fe97b09f930e04342364d719aa4e3f95964c5c6479a943c00503`;
no receipt exists.

**Correction.** `reviewingFixture()` now resolves only its freshly created
root through `realpath(await mkdtemp(...))` before deriving Git, workspace,
configuration, state, or artifact paths. The direct assertion remains beside
the creator. Production `git-isolation.ts`, `workspace-create.ts`,
`orchestrator.ts`, candidate identity, review/integration, state/schema,
containment, and all caller-controlled paths remain byte-identical. This is a
test fixture correction and requires no decision-log entry.

**Focused diagnostics.** Test-only tree
`5108a323a78edf70cdd320a6f85f37c7c0d0d286` passed 8/8 with zero skips on
genuine-short-path Windows and a clean Linux-ext4 clone. Windows's 3,549-byte
report, 606-byte receipt, and 1,558-byte manifest have SHA-256
`c6e537b133eee81388235b4840667c61a18df1e0f322d53b8330b5fbd9877376`,
`797c88cafe5b085b5936bfafcdcaf5220a27f8d8ec43dae3e695793d30b9c3f1`,
and `910e0ae17ffd80ffac73e5388d0830a04855e3ee1cdf689a64683280a8ecb98e`.
Linux's 3,572-byte report, 606-byte receipt, and 9,212-byte manifest have
SHA-256 `6405a8fe0782c285135b4ba8ae3394ec189929cff06685f5b6c64aaa675c0ca3`,
`d57381e97c93017e4988763a84394a7b02e189f76993cedd09d7415904fe4615`,
and `c7a499f8dc8ec9c209ab1e2f9c478829958dab751f523f0bdb4f27d1831ad553`.
Every receipt and artifact declaration matched independently.

Two reporting/setup mistakes created no false evidence: one audit wrapper
parsed `$rp-Raw` after the owner-red command had already written valid ERROR
evidence, and a preliminary-green wrapper attempted to assign PowerShell's
reserved `$HOME` before creating an evidence root or running a test. The
successful evidence was audited in separate read-only commands.

The next retained failed file is `target-integration-recovery.test.ts` at
`1786995207495`: 0/3. Its failures originate in the separately owned subprocess
fixture `test/target-integration-crash-worker.ts`, whose raw
`milestone-loop-target-crash-*` root crosses strict workspace Git inspection.
It remains open rather than being bundled.

**Stable-tree protocol.** The identity test, this log, and the next active
plan freeze before final commands. Independent exact candidate clones rerun
the complete Windows-short and Linux-ext4 file with fresh evidence. Exact final
outcomes remain in ignored artifacts and the handoff so tracked bytes do not
change afterward.

**Commit.** Assigned by the single cohesive WP5s commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** The target-integration crash-worker root and later Windows
workspace/Git/retention/artifact/verification-clone clusters, the documented
POSIX `setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. No readiness or product-
completion claim is made.

## 2026-08-22 — WP5r canonical Windows orchestrator-cleanup fixture root

**Objective.** Reconcile published WP5q and exact runtime CI run
`32598203192`, then select the earliest unresolved hosted-Windows controller
failure, reproduce it from an exact clean source under Node `24.18.0` and pnpm
`11.15.1`, correct only its controlled fixture root, retain a direct
precondition assertion, verify Windows and Linux ext4, and create one narrow
local commit without pushing. Preserve strict Git identity, containment,
workspace cleanup, state/schema, later fixture clusters, immutable authority,
readiness/CAL-1, the protected human file, and ignored residue.

**Hosted reconciliation and ordering.** `HEAD` and `origin/master` both equal
WP5q commit `3113c13182951814459628cebe252fe97fd93d9a` / tree
`bb678f5a30e1a7f3bcd102ebb6d625b0b0ad350e`. Public GitHub metadata binds run
`32598203192` to that commit and records Linux controller, both fresh-adopter
jobs, and real Linux-Docker successful. Windows frozen installation and
invariants passed; `test:orchestrator` failed; later unit/type/lint/format steps
were skipped. The Windows artifact is 52,419 bytes with digest
`sha256:9ae84a84150d7a58389c5e452d03263968c37d01b0b9e74fc0c9dce52466a9f2`.
GitHub CLI has no authenticated session and the archive endpoint returns HTTP
401, so exact run #9 file contents/counts are not claimed. Public metadata is
retained at `artifacts/hosted/run-32598203192/public-metadata.json`.

The historical hosted report retained at
`artifacts/hosted/run-32060615125/controller-windows-87bd41e/orchestrator/orchestrator-report.json`
places `orchestrator-cleanup.test.ts` next after the WP5o/p/q closures: 1/9
passed and eight failed. Its controlled `repositoryFixture()` retained the
8.3 spelling from `mkdtemp(tmpdir())`; strict `inspectTarget()` correctly
expanded and rejected the mismatched Git-root identity before the intended
open/workspace/retention boundaries.

**Red evidence.** Exact clean no-local/no-hardlink clone `C:/wp5r1b/repo`,
with no alternates or status drift, pinned tools, isolated dependency roots,
and a genuine `C:/wp5r1b/WP5RWI~1` TEMP whose promise realpath expands, exactly
reproduced 1/9 passed and eight failed. The 10,010-byte report and 9,011-byte
ERROR manifest under
`artifacts/manual/wp5r-orchestrator-cleanup-red/evidence/` have SHA-256
`4ea9c7aa96e6c014efb215cbd98fd865f80f14fd6528d96f5b0acb64bfd248c0`
and `d3985a35e5d3cd8d5a71a2a58ac6133b7a0075b85ac690ed5d3e286dd4af75b9`;
no receipt exists.

An assertion-only second clone/tree
`fccbc84fcfe43d13b44ccd72b1cca08c83f98402` added only
`expect(await realpath(fixture.root)).toBe(fixture.root)` after the first
fixture return. It remained 1/9, but the first failure moved directly to that
assertion. Its 9,602-byte report and 9,004-byte ERROR manifest under
`artifacts/manual/wp5r-orchestrator-cleanup-owner-red/evidence/` have SHA-256
`0848bc0419fe36a46cee411075f9eddd109950460abc33fea6880ff427f0dd19`
and `4c9a3b20820a730fdbd4c9ac4331346f78b0c8db6cff9ccf5d52bcd4ac489772`;
again no receipt exists.

One rejected setup probe used `fs.realpathSync`, which on this Windows build
preserved the short spelling even though the production-relevant
`fs.promises.realpath` expands it. Clone/install had succeeded, but no test or
evidence root existed. The promise API then proved the intended precondition
before either cited red command ran.

**Correction.** `repositoryFixture()` now resolves only its freshly created
root through `realpath(await mkdtemp(...))` before deriving repository,
configuration, state, artifact, or workspace paths. The direct assertion
remains. Production `git-isolation.ts`, `orchestrator.ts`, workspace creation
and cleanup, containment, state/schema, artifacts, and every caller-controlled
or pre-existing path remain byte-identical. This is a test fixture correction,
not a durable production decision, so no decision-log entry is required.

**Focused diagnostics.** Test-only candidate tree
`0bb0fa80fa2f3c0095460273d5f34f49c1276c0b` passed 9/9 with zero skips on
genuine-short-path Windows and a clean Linux-ext4 clone. Windows's 3,984-byte
report, 605-byte receipt, and 9,256-byte manifest have SHA-256
`86047ac2f1455022b669e216de4fd347beaea9714cc3aae641dac9343e3fb949`,
`cf8b4d5a4a4f14ba05b5a5cbf905c436cfd44b30876f09702f5cf3d988e2db98`,
and `2d5c94f6325d88c6e41a99e98a8c2aa551ba3cc5e12660eef72368128d4bb4b5`.
Linux's 4,016-byte report, 605-byte receipt, and 1,539-byte manifest have
SHA-256 `f66d7c18e12cda18543592866f7fc728b78f47c9f9898318d9c205417f567832`,
`7bc6f467d924ee996cf8e15e78c1350842eaf7d91fb1309e3cc1d7ef70f4b7d5`,
and `3a239a1693935b9b9e56bd679536dd7c77d7fd6cf4266ed96ea9406e0981fc93`.
Every declared artifact and receipt binding was independently recomputed.

The next retained failed file is separately owned
`orchestrator-identity.test.ts` at `1786995203341`: 0/8 passed, with its own
raw `milestone-loop-identity-orch-*` reviewing fixture. It remains open rather
than being bundled.

**Stable-tree protocol.** The corrected test, this log, and the next active
plan freeze before final commands. Independent exact candidate clones rerun
the complete Windows-short and Linux-ext4 file with fresh command-owned
evidence. Exact final outcomes remain in ignored evidence and the handoff so
the candidate tree does not change afterward.

**Commit.** Assigned by the single cohesive WP5r commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** The separately owned orchestrator-identity fixture and later
Windows workspace/Git/retention/artifact/verification-clone clusters, the
documented POSIX `setsid` escape, CAL-1, hidden validation, product breadth,
autonomous readiness, and human verification remain open. This increment
makes no readiness or product-completion claim.

## 2026-08-22 — WP5q canonical Windows container-executor roots

**Objective.** Select the earliest unresolved retained controller failure after
WP5p, reproduce it from a clean exact source under Node `24.18.0` and pnpm
`11.15.1`, repair only causally proved producer-owned path identities, verify
both supported controller platforms with command-owned evidence, and create one
narrow local commit without pushing. Preserve strict mount/artifact identity,
OCI containment, cleanup, process supervision, Git isolation, later retained
clusters, immutable authority, readiness/CAL-1, package/lock/workflow, the
protected human file, and ignored setup residue.

**Cause and ordering.** The retained hosted Windows report begins its failed
suites with Doctor at `1786995045207`, evidence retention at `1786995083268`,
then container executor at `1786995151895`. WP5o and WP5p close the first two;
worked-example was independently closed by WP5m. Container executor passed 2/10
and failed eight lifecycle cases. Six retained assertions received
`Controller pnpm store must be an ordinary directory with stable realpath
identity.`; the normal and timeout cases also returned ERROR before their
expected PASS/TIMEOUT boundaries. The policy-only and pre-store image-
attestation cases passed.

The controlled `fixture()` retained the valid 8.3 spelling returned by
`mkdtemp(tmpdir())`, then derived the mocked pnpm store and clone paths. The
strict production mount guard correctly observed a different expanded realpath
and stopped before clone/container lifecycle. Once that fixture root was
canonical, six cases passed and the only two paths reaching artifact export
exposed an independent production producer: the executor also retained raw
`mkdtemp(tmpdir())` for its export staging root. A direct observation proved the
evidence staging child noncanonical before strict artifact inventory rejected
it. Neither failure authorizes normalizing caller-controlled paths or relaxing
consumers.

**Red evidence.** A fresh no-local/no-hardlink exact-HEAD Windows clone at
commit `51d6eb8d039f31e0c9d4018508048bb74e11a3f9` / tree
`3a6d6b385c4d8beedca38d01cd36bfa44aa06bb4`, with no alternates, clean status,
pinned tools, and a genuine distinct 8.3 TEMP spelling, reproduced 2/10. The
7,082-byte report and 8,993-byte ERROR manifest under
`artifacts/manual/wp5q-windows-container-red/evidence/` have SHA-256
`c2250155c93ad27737ded2dbd9f9ca19544f269eaca523b99e0523ac219dd5d1`
and `36f47cce9fcacd926d78b0f4fdc57ca563b1bc6dfdaeffc6701b86fbbd025ccb`;
no receipt exists. Its 5,090-byte reproduction record has SHA-256
`c0ee7d7e803a763aa83630ea72c4a6103b0441e02e7973e492a432afe7636357`.

An assertion-only test tree `d18f965b05a73aeb83e895e0933d70942d074b10`
remained 2/10 but moved the first failure directly to
`realpath(data.root) === data.root`. Its 6,668-byte report and 9,004-byte ERROR
manifest under `artifacts/manual/wp5q-windows-container-owner-red/evidence/`
have SHA-256
`31c73bd18431036cb118e84b1ced75c26f0cec480bd656e2382278f1365d9ac7`
and `af7172ae067aca7253fb7125b55a2ace9fd62b85589b6a98b8e0d7adf19e725f`;
no receipt exists. Its 3,489-byte record has SHA-256
`acf8cf332560ac06a5e5e52aa1a92c3d5f4fd1a68bb09cd9fab4b37e223da0f4`.

With only the fixture canonicalized and production byte-identical, tree
`a8f7934b8ae92fb86b1caee20f14d051f005422f` passed 8/10. The normal case
failed a direct `evidenceStagingRootIsCanonical` assertion; the timeout case
remained ERROR at the same downstream inventory boundary. Its 4,634-byte report
and 9,007-byte ERROR manifest under
`artifacts/manual/wp5q-windows-container-staging-red/evidence/` have SHA-256
`b6a4903efcf94be945a1d12b9e76ba0a86f297939ea4d3ce2dc7850b6837e1ea`
and `1ec1fca2c809b8382cf89852efc9002466fe8d89946794870cb1b97e3900ff76`;
no receipt exists. Its 4,227-byte record has SHA-256
`dafff84a11c494d885deabf76ea2cb9958cb2d524d290fb3dde77b5c5c454baf`.

**Correction.** `fixture()` now resolves only its just-created root before any
derived mocked path. Production `createContainerCommandExecutor()` likewise
resolves only its own just-created export staging root before deriving artifact
paths. The direct fixture and staging observations remain in the focused test.
`assertOrdinaryMountSource`, `container-artifacts.ts`, caller-provided paths,
verification clone, artifact limits/publication, OCI policy/attestation,
container/volume cleanup, Git isolation, state/schema, and process supervision
remain unchanged. The production producer rule is recorded in the decision
log.

**Focused diagnostics.** The exact two-path implementation tree
`36fd561a80ed6436cab8d56a130cae53ab02591c` passed 10/10 with zero skips and
valid command-owned receipts on Windows under another genuine short TEMP and
Linux from an ext4 clone. Windows's 4,064-byte report, 603-byte receipt, and
9,243-byte manifest have SHA-256
`d20e446992916259bbaf9da86e6cd23f7dc374575f5e2fcb17584aec158faa8f`,
`68906740233e7ccc282f10403c7581809a21b3b78af7c972c13ccadce06b09a5`,
and `388e62f3002ee161a004fb1d15eb7d25522a958c0a698d4be12fb9800eefdab7`.
Linux's 4,086-byte report, 603-byte receipt, and 9,218-byte manifest have SHA-256
`96e4fd0aeb971ec7c96e9060013e15ffa0c30ea6acae09df090470267b4e4cff`,
`b41475bb9aff3a795d074553a23ec147ff79f5af151337da0e2a2e2cc863d7f7`,
and `5de11d6fb46fc6d65e5dafc66b96c22da907a6e921127506dff397d78790c26c`.

The next retained failed file, `orchestrator-cleanup.test.ts` at
`1786995191701`, passes 1/9 and has eight failures from its own raw
`milestone-loop-recovery-cleanup-*` Git fixture crossing strict
`inspectTarget()`. It imports neither changed owner, so it remains explicitly
open rather than being bundled.

**Stable-tree protocol.** The source, test, plan, autonomy log, and decision log
freeze before final commands. Independent no-local/no-hardlink clones
materialize the exact staged tree and run fresh Linux focused, Windows-short
focused, invariant, orchestrator, unit, typecheck, lint, and format commands in
distinct roots beneath `artifacts/manual/wp5q-*-final/`. Final outcomes and
independent hashes remain in ignored evidence and the final handoff rather than
changing the candidate.

**Setup incidents.** One Windows red setup wrapper called `.Trim()` on empty
clean-status output after clone/install and exited 1; no test or evidence root
existed yet. An initial WSL toolchain probe allowed host PATH expansion, and a
later WSL setup wrapper allowed host expansion of shell substitutions; neither
ran a test or created command evidence. Exact read-only checks recovered the
intended clone and the cited Linux command ran only after identity/toolchain
validation. External diagnostic roots `C:/w5qr`, `C:/w5qo`, `C:/w5qs`,
`C:/w5qg`, `/home/duncan/wp5q-linux-diagnostic`, and isolated Corepack probe
`/home/duncan/wp5q-linux-store-probe` remain retained for audit. The unrelated
repository residue `.tools/corepack-home-readonly-probe` remains untouched.

**Publication and hosted reconciliation.** The cohesive WP5q commit is
`3113c13182951814459628cebe252fe97fd93d9a` (tree
`bb678f5a30e1a7f3bcd102ebb6d625b0b0ad350e`) and is published at
`origin/master`. Exact runtime CI run `32598203192` executed that commit.
Public GitHub job metadata records Linux controller, Linux and Windows fresh
adopter, and the real Linux-Docker matrix successful. Windows controller
installation and invariants passed, `test:orchestrator` failed, and unit,
typecheck, lint, and format were skipped. Its retained artifact metadata names
`controller-windows-3113c13182951814459628cebe252fe97fd93d9a`, size 52,419
bytes, digest
`sha256:9ae84a84150d7a58389c5e452d03263968c37d01b0b9e74fc0c9dce52466a9f2`.
GitHub CLI is unauthenticated and the unauthenticated archive endpoint returns
HTTP 401, so the archive's file-level results and counts remain unaudited and
are not claimed. Public metadata is retained at
`artifacts/hosted/run-32598203192/public-metadata.json`.

**Commit.** `3113c13182951814459628cebe252fe97fd93d9a`; published at
`origin/master` by exact runtime CI run `32598203192` before WP5r began.

**Known gaps.** The separately owned orchestrator-cleanup fixture cluster,
later Windows workspace/Git/artifact/verification-clone cascades, the documented
POSIX `setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. This increment makes no
readiness or product-completion claim.

## 2026-08-22 — WP5p canonical Windows retention-apply fixture root

**Objective.** Select the earliest unresolved retained controller failure after
WP5o, reproduce it from a clean exact source under Node `24.18.0` and pnpm
`11.15.1`, correct only its causal real-filesystem fixture precondition, verify
both supported controller platforms with command-owned evidence, and create one
narrow local commit without pushing. Preserve production retention apply,
state/schema, containment, path and Git identity, later Windows fixture/path
clusters, immutable authority, lifecycle/CAL-1 state, package/lock/workflow,
retained evidence, and the protected human plan.

**Cause and ordering.** The retained hosted Windows report starts its unresolved
post-WP5o suites with evidence retention at `1786995083268`, then container
executor at `1786995151895` and later workspace, Git, artifact, and clone
cascades. Evidence retention passed 15/19; its four failures were exactly the
state-first cases for normal apply, forged-journal conflict, result conflict,
and torn-journal recovery. The first failed at `StateStore.save` with
`Invalid orchestrator state: State pending operation is invalid.`; the other
three received that same earlier error instead of their intended boundary.

The controlled `applyFixture()` retained `mkdtemp()`'s valid NTFS 8.3 spelling.
`validState(root)` only resolved it, while evidence planning correctly recorded
long artifact-root realpaths. Retention intent construction therefore combined
a short `repositoryRoot` with long realpath fields. Strict state containment
correctly rejected that mixed identity before publication. The other apply
tests stop at preflight and masked the helper defect; the four retained failures
are the only cases that cross publication. Production owners and the test are
byte-identical from hosted commit `87bd41e` through WP5o.

**Red evidence.** A fresh no-local/no-hardlink exact-WP5o Windows clone at
commit `70fb23538d6664d4fd3c7e59397398cde702dd4b` / tree
`1610ca8714a43850b7ec423c7e0119e7bf0d9930`, under a genuine 8.3 temp spelling,
reproduced 15/19 with the exact four failures, an `ERROR` manifest, no receipt,
clean clone, and exact toolchain. The 11,865-byte report and 9,137-byte manifest
under `artifacts/manual/wp5p-windows-evidence-retention-red/evidence/` have
SHA-256 `d8f5f27f39f5cbad8114742addfc6d19948de35eb0400d75f6f56c08cf33dd5c`
and `43ea06ac5aea4109a50de97eae3c346c3c483edde83bfac0d6540f218e06d216`.
The 2,939-byte reproduction record has SHA-256
`90e011417c9f6e50111dc6d430aceb8bea9e302d7f9a239a53e1190df3955f4d`.
A first dependency setup selected host Node 25 and was rejected before any test
or evidence command; it is not cited.

An assertion-only patch required `realpath(fixture.root) === fixture.root` in
the first state-first case. Staged alone in a second exact clone, it produced
tree `e4e17f3d4a0348a3b2d3eca2bc39d6c49e9cc4a4` and remained 15/19, but the
first failure moved directly to that assertion. Its 10,809-byte report and
9,114-byte `ERROR` manifest under
`artifacts/manual/wp5p-windows-owner-red/evidence/` have SHA-256
`1568e376fab1a73044df2c34ca9439bb58e27a5609148d6463f1cced2a66dd52`
and `40edd8e396916c1df641ab979fe364d94159f0f1eb8d65eb5f0f8a364658f6df`;
no receipt exists. Its 2,110-byte record has SHA-256
`cbba27231112e59ba4bbd5e27dba711909e7fd5dd8b916577e060409128fd803`.

**Correction.** `applyFixture()` now resolves only its freshly created root
through `realpath(await mkdtemp(...))`; the direct root-identity assertion
remains. Every repository, plan, artifact, apply, journal, result, and deletion
path is consequently derived from one controlled spelling. Production
`evidence-retention.ts`, `retention-apply-operation.ts`, `schema.ts`,
`state-store.ts`, `path-safety.ts`, `git-isolation.ts`, strict containment,
authorization, recovery, and controller policy remain byte-identical. This is
a controlled fixture correction, not a durable production decision, so no
decision-log entry is required.

**Focused diagnostics.** Windows under another genuine short temp alias and a
fresh Linux ext4 clone staged only the corrected test at tree
`35f950dba9f41675493817f3a442c9a32f35694f`; both passed 19/19 with zero skips
and valid receipts. Windows's 6,769-byte report, 603-byte receipt, and
9,373-byte manifest have SHA-256
`d31a144ec0602813a1120a8092937349ddb20bdb1f65eef5b94b096535ad56f1`,
`9b11469a60398720b5884781c2b4fade2ff724fef42cdd4dbe31e898487f52f6`,
and `99fb91ea3122c8e7898867630e91b9149dc9b404a1631da0df23b78659905ebc`.
Linux's 6,713-byte report, 603-byte receipt, and 9,278-byte manifest have
SHA-256 `178a653ba74b520f89e708a3340a0e3f8fc10e15e4799cc6087d364b37c830b0`,
`a934d99a1dfeb0d4628f839f495519a7090847441cca44814e7702e450e941cb`,
and `40e4af3ce9a17135841806878d8f746d13da28a0ab5a9d17109d40a5ebe8bbc0`.
The next retained container-executor suite has its own test fixture and imports
no changed owner; this test-only correction cannot repair it, so it remains
open rather than being bundled.

**Stable-tree protocol.** The test, this log, and execution plan freeze before
final commands. Independent no-local/no-hardlink clones materialize the exact
staged tree and run fresh Linux focused, Windows-short focused, invariant,
orchestrator, unit, typecheck, lint, and format commands in distinct roots under
`artifacts/manual/wp5p-*-final/`. Outcomes and independent hashes stay in
ignored evidence and the final handoff rather than changing the candidate.

**Commit.** Assigned by the single cohesive WP5p commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.

**Known gaps.** The separately owned container-executor cluster, later Windows
workspace/Git/artifact/verification-clone cascades, the documented POSIX
`setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. This increment makes no
readiness or product-completion claim.

## 2026-08-22 — WP5o canonical Windows Doctor fixture root

**Objective.** Select the earliest unresolved retained controller failure after
WP5n, reproduce it from a clean exact source under Node `24.18.0` and pnpm
`11.15.1`, correct only its causal real-filesystem fixture precondition,
verify both controller platforms with command-owned evidence, and create one
narrow local commit without pushing. Preserve production Doctor, schema,
retention, path-safety, and Git identity policy; later Windows path clusters;
immutable authority; lifecycle/CAL-1 state; packages/lock/workflow; retained
evidence; and the protected human plan.

**Cause and ordering.** WP5n closes the last retained Linux failure cluster.
The retained hosted Windows report starts its remaining failed suites with the
Doctor retention-apply case at `1786995045207`, followed by evidence retention
at `1786995083268`, container execution at `1786995151895`, and later
workspace, Git, artifact, and clone cascades. The first Doctor test and its
strict schema/retention/path inputs remain unchanged from hosted commit
`87bd41e` through current HEAD except for WP5k's unrelated Doctor production
portability correction.

On the hosted Windows runner, Node's temp root uses the valid NTFS 8.3 spelling
`C:\Users\RUNNER~1\...`. The controlled fixture preserves that spelling
through `mkdtemp()`, but `realpath()` returns the long
`C:\Users\runneradmin\...` spelling. The fixture therefore persisted a
short-form `repositoryRoot` with long-form artifact-root realpaths. Strict
containment correctly rejected that mixed identity, so Doctor observed invalid
state before it could classify the pending retention operation. This is a
fixture precondition defect, not permission to relax production identity or
containment.

**Red evidence.** A clean no-hardlink Windows clone of exact WP5n commit
`b86083b97f82128061d0aa40bc1b539e5cffb323` / tree
`31ff3c8144d4e8f1991d075a78fc0857f1595289`, with `%TEMP%` and `%TMP%`
set to a genuine local 8.3 alias whose realpath has a different long spelling,
reproduced 18/19 passed, one failed, zero skipped at the exact retained Doctor
assertion. The command exited 1 with an ERROR manifest, no receipt, clean clone,
and exact toolchain. The 8,215-byte report and 9,111-byte manifest under
`artifacts/manual/wp5o-windows-doctor-pre-fix/evidence/` have SHA-256
`15ac9e70503a71228ab2c0540262efbf4b900f45cf8983fb3acc96b5824c978c`
and `493532d0bff5c955293fc500b2829ccbc0eafccfe22dc8d11cbced6c074b3fec`.

An assertion-only patch then required
`realpath(fixture.root) === fixture.root` before state construction. Applied
and staged alone in the disposable clone, it produced tree
`fa3395b684f18a264b33ab58d68327db044534a7` and failed directly at that new
owner precondition: 18/19 passed, one failed, zero skipped, ERROR/no receipt,
and exact one-path staged scope. Its 7,563-byte report and 9,110-byte manifest
under `artifacts/manual/wp5o-windows-doctor-owner-red/evidence/` have SHA-256
`15d413e7a4ddcc7a33dc20c1069bf28f55e78664176653df5ba3e22941836cfc`
and `5423dc27530648f7d4d4a74b908c66941a3483468e7070f2654fbbe55c43b605`.

**Correction.** `repositoryFixture()` now resolves the newly created temp
directory once through `realpath(await mkdtemp(...))` and retains the direct
root-identity assertion in the affected retention test. Every derived
repository/artifact/apply/deletion path therefore uses one spelling. Production
`doctor.ts`, `schema.ts`, `retention-apply-operation.ts`,
`path-safety.ts`, `git-isolation.ts`, strict containment, alias rejection,
and controller policy remain byte-identical. This is a controlled fixture
correction, not a durable production-contract decision, so no decision-log
entry is required.

**Focused diagnostics.** Windows with the same genuine short temp alias and a
clean Linux ext4 clone both staged only the corrected Doctor test at tree
`c57589de1ed26e90700c6e1b1142a17b1fb986bc` and passed 19/19 with zero
skips. Every manifest/receipt/artifact binding independently matched.
Windows's 6,999-byte report, 591-byte receipt, and 9,299-byte manifest have
SHA-256
`5c8bdd3ab9d0d649221e5acaa78f278c986cab7dd9019a4e7177b734af299b63`,
`4125c2944a8062d587775f864e56cb140e4e9b96d8605889503f0fa50713b8bd`,
and `e9523d080ab5351eed1197583e28ee3a6158b0c6c264ae8e9c310c056246d401`.
Linux's 6,989-byte report, 591-byte receipt, and 9,250-byte manifest have
SHA-256
`3001f8bcdfcf3cf34826f2da391f6ab00509a8a7ee4b032fa55e0c0abdbd0180`,
`d0150d3f360209b58fdf711523874ef87c5e3929a959c0480892a08d5a3698f8`,
and `cb31f1a8a7950e955d53aa84756db2daaa514c0931375433fb79f0d321cb1f2a`.
Two earlier disposable Linux setup attempts never reached Vitest or created an
evidence root: one retained-script line-continuation defect and one incomplete
offline store. Both clones cleaned successfully; the exact locked closure was
then hydrated and the cited diagnostic passed.

**Stable-tree milestone protocol.** The test, this log, and execution plan
freeze before final commands. The exact staged tree runs a fresh Linux focused
shard and receipt-owning Windows-short-temp focused, invariant, orchestrator,
unit, typecheck, lint, and format commands separately and serially in fresh
roots beneath `artifacts/manual/wp5o-*-final/`. Outcomes and independent
hashes stay in ignored command evidence and the final handoff rather than being
backfilled into tracked files and changing the candidate.

**Commit.** Assigned by the single cohesive WP5o commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.
`origin/master` remained at WP5n's grandparent before this increment; no
remote mutation occurs here.

**Known gaps.** The next Windows evidence-retention fixture cluster, larger
Windows Git/path-spelling and identity cascades, container path fixtures, the
documented POSIX `setsid` escape, CAL-1, hidden validation, product breadth,
autonomous readiness, and human verification remain open. This increment makes
no readiness or product-completion claim.

## 2026-08-21 — WP5n POSIX candidate-identity fixture materialization

**Objective.** Select the earliest unresolved retained Linux controller
failure after WP5m, reproduce it from a clean exact source under Node
`24.18.0` and pnpm `11.15.1`, correct only its causal real-Git fixture
precondition, verify both controller platforms with command-owned evidence,
and create one narrow local commit without pushing. Preserve production
candidate identity and Git inspection policy, later path-portability clusters,
immutable authority, lifecycle/CAL-1 state, packages/locks/workflow, retained
evidence, and the protected human plan.

**Cause and ordering.** Retained hosted Linux run `32060615125` starts its
failed suites at Doctor `1786995000003`, process supervisor `1786995022223`,
worked example `1786995133398`, and candidate identity `1786995183453`. WP5k,
WP5l, and WP5m close the first three, making `candidate-identity.test.ts` the
next cluster. Its production owner, test, shared Git-inspection owner, and
ignore file are byte-identical from hosted commit `87bd41e` through WP5m.

The candidate fixture uses `git update-index --chmod=+x` and commits the
mode-only tree change. On POSIX with `core.filemode=true`, Git records `100755`
in the index/tree but does not mutate the existing worktree file from
`100644`. The fixture therefore sampled its supposed clean `modeIdentity` while
Git already reported `.M change.txt`; adding `dirty.txt` left both identities
at `clean:false`, so the expected differing field disappeared. Windows uses
`core.filemode=false`, which masked the incomplete fixture precondition. Exact
cross-platform probes confirmed `dirty.txt` is not ignored and that
materializing only mode `0755` removes the Linux `.M` while retaining the
untracked-file status.

**Red evidence.** A clean no-hardlink Ubuntu WSL2 clone of exact WP5m commit
`69e92fc3e6d44ffa329ffd94c23c60f1bcfba0d3` / tree
`8b8cde4728fbe0f186efed117a77a7cd8ead6324` reproduced 2/3 passed, one
failed, zero skipped with the exact hosted `expected [] to deeply equal
[ 'clean' ]` assertion, an ERROR manifest, no receipt, clean clone, exact
toolchain, and confirmed cleanup. The shard ran once. Its post-run shell
predicate had an unmatched-quote defect after evidence production; the
existing evidence was finalized independently, and the attempted second
invocation refused the existing root before running a shard. The 3,309-byte
record at
`artifacts/manual/wp5n-linux-candidate-identity-pre-fix/reproduction.json` has
SHA-256
`ee2a85dcbe34537e292f6d3291721a8ad4e8bf70aa758573af579168b0e6a8b2`;
its 1,960-byte report, 8,871-byte manifest, and 340-byte toolchain record have
SHA-256
`669710c3fc0ea3cf65f84015e2e1c46ca5476e3c280044262414da9cdcd8188a`,
`cf3e2d2ea2c018358c755c4733ab8c08dd34b8c1c62cc4849150d8f56a189906`,
and `d521e219427b86398e6d610bd984c2ad9813d2b43e02c66f3d3a8b79aa46e548`.

An assertion-only direct owner patch then required `modeIdentity.clean` before
the later untracked write. Applied and staged alone in a second clean exact-
HEAD Linux clone, it produced tree
`4ad410fa0082ae02f238ad052f84167db0bd7bcd` and failed directly at that
new assertion: 2/3 passed, one failed, zero skipped, ERROR/no receipt, exact
one-path staged scope, and confirmed cleanup. Its 2,068-byte record at
`artifacts/manual/wp5n-linux-owner-assertion-red/reproduction.json` has
SHA-256
`cdcf6795ab468f27686b4eb91049189fc0e8165e860e553ee888c4a3fa7b76c6`;
the 1,967-byte report and 8,870-byte manifest have SHA-256
`f39e292386628ad15686bbe66e3eb0a135c2c306462dda9794b50ec3a36d6509`
and `7708772af4d6deb12dc011e2ff98577ed643952abbc23666c08511d617e48545`.

**Correction.** The controlled test file is now set to mode `0755` after the
mode-only commit and before shared-owner inspection. On POSIX this materializes
the exact committed mode; on Windows `chmod` is harmless while
`core.filemode=false`. The direct clean assertion remains, followed by the
existing distinct tree/digest checks and later exact `clean`-only difference.
Production `candidate-identity.ts`, `git-isolation.ts`, status argv, identity
fields, digest framing, dirty-candidate rejection, and every controller policy
boundary remain byte-identical. This is a fixture correction, not a durable
production-contract decision, so no decision-log entry is required.

**Focused diagnostics.** A clean exact-Linux clone and the Windows source
checkout both staged only the corrected test at tree
`28b8e7e61e02f1ae5e9771c66f4c9df0d9b821f3` and passed 3/3 with zero
skips. Every manifest/receipt/artifact binding independently matched. Linux's
1,609-byte report, 603-byte receipt, and 9,119-byte manifest have SHA-256
`830fc046e5337a439ac1d3338aaeac806631e2fb2b2af9fabff56bc3bcecf951`,
`5b5a5bdfa2d5083b6237f7a5bfc4e57b26a1c657e5058ddc61ec9adbf10e28d4`,
and `0ef1269d76d176b7b892c882ab5425481fedaf6b30859ac22d5d5c9c7aa0faa9`.
Windows's 1,612-byte report, 603-byte receipt, and 9,159-byte manifest have
SHA-256
`fb23027e2ebc2ba611ef567c7cceb0fa9fa8d65bb4655f6e30dd31e6cfce16aa`,
`6341d2543ab31370d2698a1d54dc5e1d1d8e0a834827e745101cd1c566c13563`,
and `7c8d3b33b06b8f601c0b5dbea70d933d27830fad08798a39327d523473e1137c`.

**Stable-tree milestone protocol.** The test, this log, and execution plan
freeze before final commands. The exact staged tree runs a fresh Linux focused
shard and receipt-owning Windows focused, invariant, orchestrator, unit,
typecheck, lint, and format commands separately and serially in fresh roots
beneath `artifacts/manual/wp5n-*-final/`. Outcomes and independent hashes stay
in ignored command evidence and the final handoff rather than being backfilled
into tracked files and changing the candidate.

**Commit.** Assigned by the single cohesive WP5n commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed.
`origin/master` remained at WP5m's parent before this increment; no remote
mutation occurs here.

**Known gaps.** Larger Windows path-spelling/identity cascades, the documented
POSIX `setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. This increment makes no
readiness or product-completion claim.

## 2026-08-21 — WP5m canonical worked-example payload identities

**Objective.** Select the earliest unresolved hosted Linux controller failure
after WP5k and WP5l, reproduce it from clean exact source under Node `24.18.0`
and pnpm `11.15.1`, repair only its causal historical-package identity facts,
verify both controller platforms with command-owned evidence, and create one
narrow local commit without pushing. Preserve every historical payload blob,
strict validation and cross-links, later candidate-identity and path-portability
clusters, immutable authority, lifecycle/CAL-1 state, packages/locks/workflow,
retained evidence, and the protected human plan.

**Cause and ordering.** Retained hosted Linux run `32060615125` starts its
failed suites at Doctor `1786995000003`, process supervisor `1786995022223`,
worked example `1786995133398`, and candidate identity `1786995183453`. WP5k
and WP5l close the first two, making `worked-example.test.ts` the next causal
cluster. Its owner/test bytes are unchanged from hosted commit `87bd41e`
through WP5l.

WP4c generated three descriptor identities from stale Windows worktree copies:
`invariant-suite.json` recorded 4,476 CRLF bytes instead of its 4,333-byte LF
Git blob; `loop-recommissioning-verification.json` recorded 7,013 instead of
6,821; and `slow-suite-registry.json` recorded 463 instead of 452. The global
`* text=auto eol=lf` attribute predates WP4c, but those local copies survived
from earlier checkout/edit history while Git committed canonical LF. All three
staged blobs are unchanged from the WP4c base, parse to the same JSON as the
stale copies, and retain every schema and cross-link. The other four descriptor
entries already match Git exactly. Linux correctly materialized LF and rejected
the first impossible descriptor identity; four negative cases then cascaded at
that earlier boundary instead of reaching their intended assertions.

**Red evidence.** A single clean no-hardlink Ubuntu WSL2 clone of exact WP5l
commit `31a9e53ab2491ead0a3c88fac0860fdab9641f3a` / tree
`1136baa31cbafbce2fbad27846395eebd6f903f9` reproduced 4/9 passed and the
exact five hosted worked-example failures with an ERROR manifest, no receipt,
clean source, exact toolchain, and confirmed clone cleanup. The first post-run
parser rejected its own overly broad expectation because Vitest elides the
causal error inside four downstream matcher messages; the shard was not rerun.
A separate fail-closed finalizer accepted only the exact direct identity error
and those four exact elided cascades. The 8,014-byte record at
`artifacts/manual/wp5m-linux-worked-example-pre-fix/reproduction.json` has
SHA-256
`7093b891545acacdfc9e1828bff3c9b4d2224c4decd758f42d367783044fc023`;
its 8,281-byte report and 9,022-byte ERROR manifest have SHA-256
`3ba2d7f230d807b0ff1180c44206218074a50afbfe3daf87e96028401601ba08`
and `45a106ffbb776a4ccbe32a7ebc2343b18749e64043452b14e831f26ffed1bd22`.

The direct regression hashes every exact staged payload blob and compares the
complete ordered inventory with the descriptor. A second clean exact-WP5l
Linux clone applied and staged only its 1,812-byte patch (SHA-256
`fef63f0953481edaa20f047444d441dd1a1bea89c38fb1e97c2a709e9630bb63`)
at tree `e92e6e455388aaa919d0ed6633ff2bb7876e656b` and proved it red: 4/10
passed, six failed, ERROR/no receipt, staged-only test scope, and confirmed
cleanup. Vitest elided the array contents from the owner failure, so the first
post-run predicate again rejected only its own message assumption; the shard
was not rerun, and a separate finalizer bound the exact test patch and manifest
candidate tree to the failed owner assertion plus the direct mismatch and four
cascades. Its 8,906-byte record has SHA-256
`fd98168fa70a2c894569456f214e1a56edee9e48ac247633c47bea6895e42ded`;
the 8,883-byte report and 9,016-byte ERROR manifest have SHA-256
`ed0a300277880e6c5f2d576622fe47dfee216425fc1efff88f89e7f9d4c2c69c`
and `7fbb24e87ce3cc4ebe18ac8dfa012e8cb760831bdbcb6144405d6a2b06a108ef`.

**Executable semantic audit and correction.** Before source implementation, a
third clean Linux clone proposed only the owner test and three descriptor
metadata pairs. The first audit predicate overreached by requiring the WP4c
README change to predate WP4c, and the next invocation forwarded a literal
separator rejected by the strict CLI; neither reached or altered source
implementation. The corrected audit proved all seven candidate payload blobs
equal HEAD, all three mismatched blobs equal the WP4c base, zero payload paths
changed, and exactly three descriptor byte/hash pairs differed. The real
explicit validator then passed the complete regular/tracked file inventory,
strict schemas, legacy identities, registry/check catalogue, protected paths,
and historical/inactive/non-executable semantics. The complete focused suite
passed 10/10 with a valid receipt at candidate tree
`f5f18bd8ba06c2b19c5c7874410905a4f23f55b5`.

The 10,752-byte audit at
`artifacts/manual/wp5m-semantic-audit-pre-implementation/audit-result.json`
has SHA-256
`5f5562f6c5228de6b59228fd4a6c5aa56289bae925b1f03105d8c0f57d616baf`.
Its 4,025-byte report, 9,271-byte manifest, and 599-byte receipt have SHA-256
`54607d5d380460e1394a42d1eb233c3bd5e549bab6ffb19308e5fcd8e551e745`,
`005cd1ba3c9d46b96c5ae6e7cdad6d4dbf2b716cf6ced35ebaf6a88cca217633`,
and `f0aa9e7e4e402047d8838e0069057ff1b854b1bb30494cbb9385e656be22f0de`.

Source now changes only those audited descriptor pairs and the staged-blob
regression. Runtime validation remains byte-exact and fail closed; it does not
normalize newlines or accept alternate identities. No payload, role,
provenance, schema, link, registry, check, protection, or legacy semantic
changes. Pinned Prettier materialized the three stale local Windows copies as
LF; it also reformatted one unrelated legacy-manifest array, which was
immediately restored with `apply_patch`. Independent raw-byte comparison shows
all three working copies exactly equal their pre-existing index blobs, and no
payload path is changed or staged. This restores the already-recorded WP4c
exact-tracked-byte decision, so no new decision record is required.

**Focused diagnostics.** Exact Windows focused verification passed 10/10 with
no skips against the same two-file tree already proved on Linux. The 3,999-byte
report at
`artifacts/manual/wp5m-windows-focused-diagnostic-1/evidence/invariant-vitest-report.json`
has SHA-256
`0607acdb81ee1a047ae36f820909dfd992763382ab741d19ea6a8be20140e5ee`;
its 9,307-byte PASS manifest and 599-byte receipt have SHA-256
`dd3ca6972c9183850f6e79f59d4a6652b1b3919b39d1c5e3bd8baae975cb715e`
and `e4282c26575d0ab12238f92d9d6cd11250366fd71bc63c484d51cedd613bfdf3`.
Independent inspection matched the receipt and artifact bindings with zero
mismatches. The exact Windows explicit validator also returned PASS for the
2,948-byte corrected descriptor at SHA-256
`be37c29dbe123d2da4eba93b525794f17b76143f88ec34bda9fcf830fb9a8354`
and all seven audited file identities.

**Stable-tree milestone protocol.** Descriptor, owner regression, this log,
and the execution plan freeze before final commands. The exact staged tree runs
a fresh Linux focused shard and receipt-owning Windows focused, invariant,
orchestrator, unit, typecheck, lint, and format commands separately and
serially in fresh roots beneath `artifacts/manual/wp5m-*-final/`. Outcomes and
independent hashes remain in ignored command evidence and the final handoff
rather than being backfilled into tracked files and changing the candidate.

**Commit.** Assigned by the single cohesive WP5m commit containing this entry;
identify it as the newest commit touching the entry. It is not pushed. A later
external publication had already advanced `origin/master` to WP5l before this
increment began; no remote mutation occurs here.

**Known gaps.** Candidate identity is the next retained Linux controller
cluster. The larger Windows path-spelling/identity cascades, documented POSIX
`setsid` escape, CAL-1, hidden validation, product breadth, autonomous
readiness, and human verification remain open. This increment makes no
readiness or product-completion claim.

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
