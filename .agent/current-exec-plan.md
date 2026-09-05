# Current Execution Plan

**Status:** ORCH-AUTH-01 r2 approved; handoff prepared; first runtime increment not started. **Updated:** 2026-09-05. **Owner:** maintainer-authorized source transition.

## Objective

Resume the approved source-authority transition through bounded increments. The immediate next increment, ORCH-AUTH-01-A, qualifies the existing WSL Linux Docker runtime with the unchanged real OCI fixture. Its immediate machine consumer is the production trusted-container executor and its complete normal/adversarial matrix. This environment foundation is a justified precursor to one public workflow and authenticated evidence handoff; it is not source readiness.

This handoff records the direct human approval and preserves the review package. It introduces no product implementation, runtime installation, activation, CI dispatch, controller-state adoption or WP6f interpretation.

## Goal Constraints

The human approved ORCH-AUTH-01 r2 with “Proposal approved.” in task 01a06f9b-0953-73b2-ae67-06e37d884e4e, turn 01a07344-cedf-7562-9ca4-8f5af8586c39. The exact normative digest is 53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108. The durable record is evals/authority-revisions/ORCH-AUTH-01/approval.json. No further approval of this unchanged proposal is required. The approved goal/acceptance and APPROVAL-SCOPE.md/TRANSITION-CONTRACT.md are under docs/proposals/ORCH-AUTH-01-r2/; the live root generation remains legacy until the recoverable migration is genuinely ready.

Freeze outcomes, public contracts, cadence/claim boundaries and safety/transition rules. Conforming implementation notes use normal review and an updated separate package digest. Preserve all twelve outcomes, eight domains, sixteen complete failure families on both native platforms, two independent clean builds/platform, exact pins/bounds and the separate live human gate.

Routine candidate evidence retains invariants, static/build checks and four owners once plus explicit affected cases. Do not automatically add the full matrix to candidates. Full fresh qualification remains required for no-argument readiness and any integration/reconciliation needing exact closure. Existing tests and five protected CI jobs remain unchanged; no scope suppression or cached closure is enabled.

The migration requires compatible readers while legacy authority stays active, exact inert ancestor snapshots, a separately committed descendant request, maintainer-bound approval, lease and durable intent, mixed-generation refusal, exact-state recovery and independent reconciliation. Approval alone does not activate authority or adopt state. Sealed proposal-time “not approved” wording remains historical and is superseded by the separate record.

## Baseline Evidence

- Source implementation: e590e38c32de2b5baa7423f66bbd8a0230b61839, tree b8f3879fa26fb5a54f2b0daa0f062d94d52bc3f9; origin/master was equal on entry. The handoff documentation commit is a descendant; find its exact identity with git log and the document audit receipt.
- Approved package digest: 2db01416302e24f3bda9d1991f44a1ac05b8ef5fad70b09c18bc4f037d267a2c. Thirty-five reviewed files include thirteen normative files. Original r1's thirty-three files and its 333bb70e...a1011a seal remain unchanged.
- Latest preparation-state audit: docs/proposals/ORCH-AUTH-01-r2/audit/run-20260905203403713-21436/result.json. All thirteen groups passed, including finite digest mutation checks and preservation of twenty-six baseline files. It preceded the separate approval transcription; its absent-approval field describes that preparation state.
- WP6e final closeout: artifacts/wp6e-amendment-dev/final-closeout/. All five e590e38 hosted jobs passed in run 33951754449 and their artifacts were independently audited. Actual candidate ERROR 3, unit-domain NOT_READY and tier fault boundaries 5(a)/(b) remain unresolved. The original plan is preserved byte-for-byte at .agent/history/wp6e-e590e38.md, SHA256 2c4e09426e27ccf8449a10458e67cfd97efbd567bb8604d4693d334fe926537b. Its older pending-header wording is superseded by this recorded final closeout, not rewritten.
- Read-only runtime preflight: Ubuntu/WSL 2, Linux kernel 6.6.87.2-microsoft-standard-WSL2, Docker client/server 29.1.3, UID 1000 in docker group, root:docker socket 0660. No Linux node is on PATH; discovered pnpm is a Windows path and unsuitable. No runtime was installed or policy-qualified. Current matrix explicitly requires process.platform=linux; Windows Docker is absent from PATH.
- No refs/milestone-loop/ private refs were present. Preserve that absence; do not manufacture state. The untracked user roadmap remains SHA256 53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1 and stays outside commits.

## Steps

1. Record direct human approval, archive the prior WP6e plan, retain both exact review packages and prepare the handoff. Documentation prepared; the staged handoff audit and existing thirteen-check contract-integrity command passed. Final committed recheck follows the record-only commit.
2. Reproduce the committed handoff audit under exact Node/pnpm. Then prepare a short, clean standalone clone on the WSL Linux filesystem and task-local exact Linux runtime; preserve the Windows checkout. Not started.
3. Install frozen root dependencies; hydrate the exact fixtures/oci-candidate lock/store separately as in the existing trusted-container CI job. Inspect effective runtime identity and use the pinned tracked image recipe. Not started.
4. Run the existing complete OCI matrix once with a fresh short artifact path; independently validate every normal/adversarial outcome, receipt, containment hash, image identity and cleanup. Preserve and diagnose any failure before expanding scope. Not started.
5. Record actual runtime qualification, limitations, commands and costs. Plan the next bounded one-workflow/rejection/host-isolation/handoff increment and native Windows feasibility; retain separate full qualification and activation gates. Not started.

## Acceptance Criteria

For this handoff: approval binds the exact r2 digest; all sealed files and historical source records remain intact; active authority, commissioned ledger, package scripts and CI do not change; Git stores exact sealed bytes; the document audit and existing contract-integrity check own validated receipts; the roadmap is excluded from the commit.

For ORCH-AUTH-01-A: the real Linux production executor reaches all six existing OCI cases with their expected dispositions; actual immutable image and policy are recorded; independently validated child receipts/artifacts and zero surviving owned containers/volumes prove the outcome. A reachable engine or earlier infrastructure failure is not a passing matrix. No Windows, new source gate, live-agent workflow or WP6 completion claim follows.

## Verification

Windows document checks use C:/w/node-v24.18.0-win-x64 on PATH and COREPACK_HOME=C:/w/corepack-node-v24.18.0. Run pnpm exec tsx docs/authority-handoffs/ORCH-AUTH-01/verify-handoff.ts. It checks staged or committed bytes and writes a fresh receipt under artifacts/orch-auth-01-handoff/. The existing protected-integrity command is pnpm exec tsx tools/milestone-orchestrator/src/verification-cli.ts contract-integrity. Independently validate its actual receipt/artifacts. Git diff checking and exact baseline comparisons cover the documentation-only change; no broad product suite or hosted run is justified by this handoff.

The original proposal author/audit requires e590e38 and absent approval by design. Do not rerun it as a current-state test after recording approval, weaken its guard or regenerate its seal. The handoff audit supplies the appropriate continuation check.

For the first runtime increment, use exact Linux Node 24.18.0/pnpm 11.15.1. Follow the frozen dependency install and OCI fixture hydration in .github/workflows/exact-runtime-ci.yml, then pnpm test:oci-container --output artifacts/<fresh-short-id>. Keep source, fixture and inner-container identities distinct. The matrix's normal case exercises real built output and executable tests; its adversarial cases inspect actual containment, artifacts, output and termination. Retain raw results and independently inspect them. No visual product change is included.

## Risks and Recovery

The WSL route is Linux only and the current matrix rejects Windows. Native Windows qualification needs a supported, explicitly tested provider path; do not remove that guard or claim a shell shim proves it. Do not replace or reconfigure the existing engine before diagnosing an observed failure. Fresh Linux runtime/store setup must not reuse Windows node_modules or source-path execution.

Pending/mixed authority or state remains rejected. The approved snapshot prefix does not exist yet; this handoff commit is not the migration's new-epoch snapshot anchor. Compatible readers and actual inert snapshots remain implementation work. Keep old anchors, calibration, amendment history and WP6 evidence; never regenerate active locks to obtain a passing result.

Only the two sealed docs/proposals packages receive Git binary attributes, preventing newline conversion and automatic text merging. They preserve approved blank lines, literal diff context and one CRLF historical inventory. The first import whitespace diagnostic is retained under artifacts/orch-auth-01-handoff/sealed-import-whitespace/; editable files keep normal text checks. Runtime/source rules remain unchanged. Historical “not approved” preparation receipts are retained honestly; the separate user-approval record is the current status.

## Progress and Evidence

The user steered to a fresh-session handoff before runtime installation or substantive implementation. Approval transcription and a byte-exact archive of the original plan are complete. The staged handoff audit passed at artifacts/orch-auth-01-handoff/run-20260905204508347-7576/result.json. The existing contract-integrity command passed all thirteen checks; its validated report/receipt are retained in docs/authority-handoffs/ORCH-AUTH-01/evidence/contract-integrity/. The final handoff audit receipt records the actual staged/committed identity, file inventory and preservation checks. No production verification or activation result has been invented. Newest autonomy/decision-log entries record this boundary while preserving all prior text.

## Next Action

Finish the small handoff documentation checks/commit if still pending, then start a fresh session using docs/authority-handoffs/ORCH-AUTH-01/README.md. Verify the handoff and begin ORCH-AUTH-01-A at Step 2. Approval is settled; do not ask again. After each bounded increment, update this living plan and logs with actual evidence. Full migration, runtime/native-platform qualification, live human acceptance and independent reconciliation remain incomplete.
