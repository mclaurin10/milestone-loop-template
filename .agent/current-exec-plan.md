# Current Execution Plan

Status: verified local C6e checkpoint; post-commit and hosted gates remain open. Updated: 2026-09-07T05:19Z. Owner: authorized WP6e continuation.

## Objective

Preserve the verified C6e implementation and evidence as a clean checkpoint for a fresh task. The public consumer is `pnpm loop:authority:migrate`. Continue afterward through exact post-commit checks, the actual implementation audit/request/review/activation and remaining candidate proofs. This checkpoint does not close historical WP6e or establish readiness.

## Goal Constraints

Preserve frozen authorities, original tests/meanings/deadlines, readiness history, protected commands/workflows and approved r2 digest `53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108`. Follow [transition safeguards](../docs/proposals/ORCH-AUTH-01-r2/TRANSITION-CONTRACT.md); approval is not activation. No source-state initialization/adoption, implicit commit/reset, deadline relaxation or WP6f interpretation. Historical WP6e stays BLOCKED at `e590e38c32de2b5baa7423f66bbd8a0230b61839`. Root-unit success does not establish unit-domain success. Linux, native Windows, Server 2022, readiness and human acceptance remain separate.

## Baseline Evidence

- Primary checkpoint ref: `refs/tags/codex/wp6e-c6e-local-20260907`. The finalizer records its exact primary HEAD/tree/status in [checkpoint identity](../artifacts/wp6e-source-publication-20260906/checkpoint-1/identity.json). Verify that ref, record and actual Git state before resuming. Before this checkpoint commit, primary `master` HEAD was `fc2419d8bdfc3658fe76edf2b543b38051b359f1`, tree `e8afdd61b47db88f4c6964b77c90ee8db9c1b4b1`, with 62 C6e paths to commit. The checkpoint is uncommitted until the ref and identity record exist.
- Preserve the five original stashes and untracked `Implementation-ready improvement plan 8-5-26.txt`, SHA256 `53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1`. The finalizer must confirm it is the only remaining uncommitted path.
- Isolated verification chain: `082e4369a8e637243ff45e9e66d368452c74eced` -> `1c386ec95b628a2323f8d5dab351ad72a59abe3a` -> `2fa66568407594523380ec33c063cdf52e4c6d2d`. Latest tree `a66441b9156667a0a18d44a102f30caad9ee9c3b`; clean owned checkout `.tools/wp6e-c6e-unborn-precommit-20260907`, attached to master. All 331 executing pins match primary source/test/config inputs. These are distinct verification identities, not the eventual primary commit.
- Legacy authority remains active. C4 inert snapshot `91cbd3eb75ec771cfa1f315fe2641488e361c9e0` is a strict ancestor. No actual implementation audit, request, SDK review, activation, candidate, committed 5(a)/5(b) or source state/private ref has been created in primary.

## Steps

1. Complete: implement compatible evidence/review/publication readers, recoverable leased publication and consumers, dependency verification, unborn-legacy compatibility and strict typed Git-object reads. Original test bodies and failed cohorts remain preserved.
2. Complete: Linux's nine source commands, same-input C3 OCI, full 266-case native selection, static-10 and the complete retained audit passed. Curated evidence includes exact operational snapshots; live plan/log updates do not alter the seal or executable pins.
3. Finalize the checkpoint commit/ref/identity record, then continue in a fresh task. Local C6e closeout still requires clean post-commit retained-audit/build observations and all five exact-commit hosted jobs.
4. Subsequent bounded increments: actual eight-command implementation audit; separately committed request; fixed independent SDK review; leased publication and explicit activation commit. Then qualify a sufficiently long finite host and execute the real eleven-check candidate/four partition receipts, exactly-once/historical identity reconciliation and actual provider timeout proof. Committed 5(a) must reject unclassified ownership before partitions; 5(b) must reject a missing owned report/receipt after exit zero. Neither may emit candidate PASS.

## Acceptance Criteria

The local checkpoint requires the observed complete test/check results, independently validated receipts/artifacts, preserved failed runs, matching executable inputs and a reproducible commit identity. Publication must preserve exact prior/new states, foreign bytes, lease/intent boundaries and original/fresh review provenance. Full C6e/continuation acceptance additionally requires every pending post-commit, hosted, actual migration and candidate gate above. Missing qualifications/readiness/human acceptance remain non-passing.

## Verification

Use Node 24.18.0/pnpm 11.15.1; prepend `.tools/node-v24.18.0-win-x64` to PATH and use `--config.verify-deps-before-run=error`. No visual change. Read existing evidence to recover context; do not repeat completed source suites for that purpose.

The [C6e README](../docs/source-authority/ORCH-AUTH-01-C6e/README.md) gives hash-checked archive extraction and `pnpm ... exec tsx docs/source-authority/ORCH-AUTH-01-C6e/audit.ts <fresh-input> <fresh-output>`. First extraction/audit already completed at `artifacts/c6e-precommit-retained-input-1` and `artifacts/c6e-precommit-retained-audit-1`. Do not overwrite them or rerun curation into its existing outputs. Next use a fresh clean checkout of the checkpoint commit for post-commit archive audit and `pnpm build`, with fresh command-owned artifact directories. Hosted CI and the later real implementation audit need their own exact identities and evidence.

## Risks and Recovery

Keep original deadlines and all failure evidence. The first native run's deadline failures are not relabeled by the clean retry; contention remains a hypothesis. C3's unchanged 30-minute host cannot preserve a later 3900000ms partition allowance: qualify a separate longer finite host. The current provider report does not retain each actual runtime-request timeout; add authentic boundary observation before the candidate proof. No schedule-only or shadow substitute. Use ordinary source control and owned paths; do not change shared services/packages/accounts/configuration. Committed activation reversal needs another explicitly approved appended revision.

## Progress and Evidence

`E` = `artifacts/wp6e-source-publication-20260906`. Historical narrative is in [autonomy log](../docs/autonomy-log.md) and [decision log](../docs/decision-log.md).

| Result | Evidence |
| --- | --- |
| Clean Linux source checks at `2fa6656` | Nine PASS: 1076 controller cases, 1250 root cases / 101 files and consumed build. [Independent precommit receipt](../artifacts/wp6e-source-publication-20260906/precommit/result.json): `aed573837d5de96108d17e90949f8aee2c9023069eee6902ecf719f35a3e1b98`. Service/cgroup gone. |
| Same-input C3 OCI | Six actual cases PASS, with [host](../artifacts/wp6e-source-publication-20260906/precommit/vm/host-audit/result.json), [OCI](../artifacts/wp6e-source-publication-20260906/precommit/vm/oci-audit/result.json) and [cleanup](../artifacts/wp6e-source-publication-20260906/precommit/vm/cleanup-audit/result.json) receipts. Separate runtime; no long source suites. |
| Native attempt 3 | [PASS receipt](../artifacts/wp6e-source-publication-20260906/unborn-publication-focused-3/result.json): `fc0e082d5aa56450e46a0fa3b6d0771da280bfc632b87def7eb6817e82933824`; all 266 cases / ten files, zero failed/pending/todo/unhandled; clean before/after identity and 331 pins. |
| Preserved native failures | Attempt 1: 258 PASS / 8 FAIL / 266. Attempt 2: invalid wrapper, 4 PASS / 6 FAIL / 10 partial cases, no full report/PASS. [Independent partial-run inspection](../artifacts/wp6e-source-publication-20260906/invalid-native-retry-audit-1/result.json) checks 37 files and targeted stop. Overbroad diagnostic inventory stays private outside curation. |
| Complete retained audit | [Committed receipt](../docs/source-authority/ORCH-AUTH-01-C6e/evidence/precommit-audit/result.json): `700dde37609ea25c4cb32f053211ba47458e0a8c4400fab23726c7f0336a9607`; 4644 files / 278 receipts; all original and later identities reconciled. Archive SHA256 `e0371481596574c29e5c756d3376cec21dec4f8dbdd625cccbff1499fb12841f`, 12312397 bytes. |
| Retention tools / earlier focused checks | Static-10 PASS, receipt `d2f056199253fa0fbc9dfdfae7a57a4db067d11cf7dec775fd8e17ff436f3949`; earlier 203/260/130-case runs, frozen/dependency/input audits and typecheck/lint receipts are preserved and rechecked by the full auditor. |
| Parent hosted evidence | Run `34047573294`, five protected jobs / 43 validated receipts, applies to `fc2419d` only. New checkpoint hosted evidence is still required. |

Active jobs: **none**. Native `79324`, curation `48847`, extraction `89041`, retained audit `13105` and static-10 `28921` are closed and collected. Completed outputs are linked above; no source suite or VM needs restarting.

## Next Action

Verify the checkpoint ref/identity record and actual Git status; finish commit/ref/identity finalization if absent. Otherwise begin the fresh task with a clean owned checkout of that exact commit, reproduce the retained audit and consumed build, and obtain all five exact-commit hosted results. Preserve new failures and update this rolling handoff at meaningful checkpoints. The real implementation audit/request/review/activation and candidate/provider/5(a)/5(b) work remain subsequent required increments; source-state initialization/adoption and WP6f remain outside scope.
