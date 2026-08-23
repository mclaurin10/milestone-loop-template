# Current Execution Plan

**Status:** WP5 recommended Session 3 hosted Windows fresh-adopter repair in progress
**Updated:** 2026-08-23
**Owner:** autonomous loop

## Objective

Close WP5 hosted CI/quickstart validation by causally repairing the Windows
fresh-adopter failure from Exact runtime CI run `32638898310`, freezing and
pushing one evidence-backed replacement candidate, obtaining one fully green
five-job Exact runtime CI run on that exact commit, and independently auditing
every uploaded artifact.

Do not run source no-argument `pnpm verify`, invoke `loop:template:prove`, start
CAL-1, enter hidden validation, begin WP6, add product/readiness scope, weaken
strict path/receipt/evidence checks, or claim autonomous readiness.

## Goal Constraints

- Preserve Node `24.18.0`, pnpm `11.15.1`, readiness default and permanent
  marker, CAL-1 `open_not_started`, and every immutable baseline/active hash.
- Preserve protected untracked
  `Implementation-ready improvement plan 8-5-26.txt` at SHA-256
  `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`,
  plus `.tools/corepack-home-readonly-probe` and
  `.tools/wp5r-corepack-probe`.
- Keep commissioning's strict caller-controlled path, realpath, Git, manifest,
  and publication guards unchanged. Apply the established producer-owned-root
  rule only to the fresh-adopter coordinator's newly created temporary root.
- Generated-adopter verification must remain a clean three-commit bootstrap
  journey with exactly one generated no-argument `pnpm verify`, zero source
  no-argument verify invocations, and no readiness marker in tree or history.
- Hosted acceptance requires controller Linux/Windows, fresh-adopter
  Linux/Windows, and trusted-container Linux all to succeed on one exact SHA,
  with all required steps and unconditional uploads successful.

## Baseline Evidence

- Fresh fetch confirms `HEAD == origin/master ==`
  `43e609bc6b754bcfee0c3af88a05be68b9e26850`, tree
  `3258c1c65835c275b2462eb6dd8f67c346a4d88e`, divergence `0/0`; the only
  nonignored entry is the protected human plan at its expected hash.
- Runtime/package identities remain Node `24.18.0` and pnpm `11.15.1` in the
  repository contract; readiness is active, CAL-1 is open/not started, and all
  four actual/baseline/active authority hashes match.
- Exact runtime CI run `32638898310` / attempt 1 is a push run on the exact
  candidate and concluded failure. Controller Linux/Windows, fresh-adopter
  Linux, and real trusted-container Linux succeeded; only fresh-adopter
  Windows failed at `Generate and exercise a fresh adopter`. All five
  unconditional artifacts uploaded. Check annotations contain one failure and
  zero warnings, so the Node 20 action-runtime warnings are closed.
- Retained evidence under `artifacts/hosted/run-32638898310/` includes exact
  public run/job/check/artifact metadata, all five server-digest-matching ZIPs,
  safely extracted contents, and the failed Windows job log. The failed
  Windows archive SHA-256 is
  `4184d3799bdcb5d2b4636425b1d90869e102486318d67f3e02aa5039b9dafbf8`.
- The first two ledger commands, `template-create` and `install`, passed. The
  first failure was `commission` with exit 1. No manifest add/commit or verify
  command ran, and neither `smoke-result.json` nor `receipt-audit.json` exists.
  The exact public command used the generated repository as cwd with inherited
  job environment plus `CI=true` and argv
  `pnpm loop:commission -- --input tools/milestone-orchestrator/config/commissioning-input.json`.
- Hosted Windows created the coordinator-owned repository under the valid
  short spelling `C:\Users\RUNNER~1\...`; Git returned the same root under
  its expanded spelling. `commissioning-cli.ts` therefore supplied an input
  path derived from the short cwd while `commissioningRepositoryRoot()` supplied
  the expanded Git root, and lexical containment correctly refused their
  apparent `..` relation. This is deterministic coordinator root-identity
  drift, not infrastructure and not permission to normalize arbitrary inputs.

## Steps

1. [x] Complete required authority/plan/log/code inspection; fetch origin and
       live run state; retain metadata, annotations, failed logs, all five
       archives, safe extraction inventories, and direct ERROR evidence.
2. [x] Reproduce the failure from an exact clean no-local/no-hardlink clone of
       `43e609b` under pinned Node/pnpm, `CI=true`, frozen copy-mode source
       install, isolated writable Corepack/store/TEMP/telemetry/evidence roots,
       and a genuine NTFS 8.3 TEMP spelling. Retain the exact red command/log
       evidence and prove the short/expanded root mismatch directly.
3. [x] Add a regression that fails on a producer-created short spelling and
       requires the coordinator to return the canonical root before deriving
       its generated repository. Make the smallest production correction:
       canonicalize only `realpath(await mkdtemp(...))` in
       `fresh-adopter-smoke.ts`; do not change commissioning or shared path
       guards. Run focused affected receipt-owning tests with serial files.
4. [ ] Freeze the tracked repair plus tests, plan, and autonomy log; reuse the
       existing producer-owned canonical-root decision rather than duplicating
       it; commit the cohesive candidate and confirm protected/immutable/
       readiness/CAL-1 identities plus the protected-file tree exception.
5. [ ] From exact clean no-local/no-hardlink clones of that commit, run one
       real Windows create -> offline frozen install -> commission -> manifest
       commit -> generated no-argument verify -> shared independent audit
       journey, then receipt-owning `pnpm test:orchestrator`, `pnpm typecheck`,
       `pnpm lint`, and `pnpm format:check`. Independently verify receipts,
       artifacts, candidate binding, browser evidence, and clone cleanliness;
       push normally to `origin/master` once and identify the push-triggered
       Exact runtime CI run without dispatching a duplicate.
6. [ ] Monitor that run to terminal completion. If it exposes another genuine
       defect, retain evidence and repeat a causal repair cycle; rerun an
       unchanged SHA only with explicit proof of an external transient.
7. [ ] On the final green SHA, download and safely extract all five artifacts,
       independently audit controller, adopter, browser, and real-container
       receipts/manifests/artifacts/candidates/tests, verify zero actionable
       annotations and exact Node 24 action pins, and write only ignored
       `artifacts/manual/wp5-session3-final-audit/audit-result.json`.

## Acceptance Criteria

- The original Windows failure has retained direct evidence, exact command
  boundary, causal short/expanded root explanation, and a regression that is
  red on `43e609b` semantics and green only after producer canonicalization.
- Commissioning strictness and every unrelated caller-controlled path remain
  unchanged; Linux and Windows semantics stay shared.
- One exact replacement candidate passes the real local Windows six-command
  generated-adopter journey, affected focused/broader checks, typecheck, lint,
  and format with independently valid command-owned evidence.
- One push-triggered hosted run has five successful jobs and no required
  skipped/continued-on-error step; zero Node 20 warnings and zero other
  actionable warning/failure annotations; all five exact-SHA artifact uploads
  succeed.
- Both controller artifacts prove all six commands, correct platforms,
  zero test failures, valid receipts/manifests/artifacts, and exact clean
  candidate/toolchain binding. Any skips are enumerated and explained.
- Both adopter artifacts prove `fresh-adopter-ci-smoke.v2` PASS, one ordered
  six-command ledger, one generated verify/zero source verifies, sole matching
  commissioned manifest, clean three-commit bootstrap history, valid audited
  verifier evidence, substantive visually inspected screenshots, and clean
  browser diagnostics.
- Trusted-container evidence proves a real Docker daemon and complete expected
  normal/adversarial matrix with no mock or host-local fallback.
- Final `HEAD == origin/master ==` the validated hosted SHA; tree is clean
  except for the protected untracked file and disclosed ignored evidence. The
  claim is WP5 hosted CI/quickstart closure only, never autonomous readiness.

## Verification

Focused inner loop, with unique evidence/telemetry/TEMP/Corepack/store roots
and `--fileParallelism=false`:

- `node tools/run-tool-evidence.mjs invariant-vitest tools/milestone-orchestrator/src/fresh-adopter-ci-smoke.test.ts tools/milestone-orchestrator/src/commissioning.test.ts --fileParallelism=false`
- Add `adopter-package.test.ts`, `adopter-package-proof.test.ts`, and
  `exact-runtime-workflow-contract.test.ts` only when their owner is affected.

Final local candidate:

- One real Windows `fresh-adopter-smoke.ts` journey from a clean exact clone
  under the genuine NTFS 8.3 hosted-like boundary.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm test:orchestrator`, because the production CI coordinator changed.

Never run source no-argument `pnpm verify`, `loop:template:prove`, or a
redundant local Docker matrix.

## Risks and Recovery

- A fix inside commissioning containment would broaden caller authority and
  contradict the established producer-owned canonical-root rule. Keep that
  file byte-identical unless new direct evidence disproves the diagnosed owner.
- The full adopter browser journey is expensive. Use the pure root-creation
  regression and focused files during the inner loop; run the complete journey
  once only after tracked bytes freeze.
- Any tracked change after final local verification invalidates that evidence;
  repair, recommit, and rerun affected final checks on the new identity.
- Hosted failures remain non-passing until explained. Preserve exact archives,
  logs, and metadata; ordinary Git commits provide rollback. Do not force-push,
  rewrite history, delete user residue, or normalize a failing gate away.

## Progress and Evidence

- 2026-08-23: Required startup inspection completed. Candidate/origin,
  immutable/readiness/CAL-1/protected identities match the Session 2 handoff.
- 2026-08-23: Signed GitHub connector plus public metadata endpoints retained
  run `32638898310`, five jobs, five artifacts, five check-run annotation sets,
  all five exact server-digest archives and safe extracted contents, and failed
  job `97192798715` logs under
  `artifacts/hosted/run-32638898310/`.
- 2026-08-23: Direct artifact inspection classifies the defect as a
  deterministic Windows coordinator-owned temporary-root identity mismatch at
  commissioning. It is not an external transient. Existing decision-log
  authority already requires producer-owned fresh roots to be canonicalized
  once at creation.
- 2026-08-23: An exact clean `43e609b` clone with pinned Node/pnpm, frozen
  copy-mode source install, `CI=true`, isolated writable roots, and genuine
  `C:\w5s3r1\HOSTED~1` TEMP spelling reproduced commission exit 1 before
  manifest/verify. A child-spawn identity probe proves short cwd/input versus
  expanded Git root and the resulting false lexical escape. Red evidence is
  retained under the failed run's `reproduction/windows-8dot3-pre-fix/` tree.
- 2026-08-23: The new producer-root invariant failed alone on the old
  coordinator while all 13 commissioning tests passed. The correction adds
  only `realpath` of the fresh `mkdtemp` result before deriving children;
  commissioning implementation, CLI, and tests remain blob-identical to HEAD.
  The corrected focused receipt reports 20/20 tests passing at
  `artifacts/manual/wp5-session3-focused-green-v1/`.
- 2026-08-23: Pre-freeze receipt-owning typecheck, lint, and format checks all
  pass with independently matching receipts and declared artifacts. They are
  iteration evidence on a dirty tree, not substitutes for the required exact
  committed-candidate reruns. No new durable decision is introduced.

## Next Action

Commit this frozen tracked candidate, then run the one final real Windows
adopter journey and the four receipt-owning committed-candidate checks from
exact clean clones before the single authorized push.
