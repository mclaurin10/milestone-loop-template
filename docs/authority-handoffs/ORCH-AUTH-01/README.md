# ORCH-AUTH-01 approved handoff

The maintainer approved revision r2 in this task on 2026-09-05 with the direct message: “Proposal approved.” The immediately preceding review target was ORCH-AUTH-01 r2, normative digest `53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108`. No further proposal approval is needed for that unchanged scope.

The durable [approval record](../../../evals/authority-revisions/ORCH-AUTH-01/approval.json) transcribes that external human instruction and binds the exact review inventory. It is not a machine-generated human acceptance result or a standalone authentication mechanism. A future migration must validate the already-supplied approval at the maintainer/control-plane boundary and preserve every approved transition safeguard.

The [sealed review package](../../proposals/ORCH-AUTH-01-r2/README.md) retains its original proposal-time wording and hashes. Its “not approved” statements are historical preparation status, superseded by the separate approval record; do not edit the sealed normative files to change those words. The original r1 package is also preserved. The live root authority, immutable lock, commissioning generation, source scripts, CI workflow and controller state have not been activated or replaced.

## Resume

Read the root PROJECT_GOAL.md and AGENTS.md, [.agent/current-exec-plan.md](../../../.agent/current-exec-plan.md), the approval record, and the approved r2 goal, acceptance, APPROVAL-SCOPE.md and TRANSITION-CONTRACT.md. The living plan defines the next bounded increment. Use the approved source contract as the authorized transition direction while keeping the live legacy generation coherent until compatible readers and recoverable migration are implemented.

Run `pnpm exec tsx docs/authority-handoffs/ORCH-AUTH-01/verify-handoff.ts` with exact Node 24.18.0 and pnpm 11.15.1. The command checks approval/package binding, unchanged live authority and source, historical records, and the committed or staged handoff bytes. It writes a fresh command-owned document-integrity receipt. It is not product verification or readiness.

The old proposal author/audit commands intentionally require the old e590e38 preparation state and absence of an approval record. Do not weaken those historical assertions or regenerate the sealed payload now. The handoff audit is the continuation check after approval and documentation commits.

## First implementation increment

Qualify the existing WSL Linux runtime with the repository's unchanged real OCI fixture before building the larger qualification coordinator. Read-only preflight found Docker Engine 29.1.3 active in Ubuntu/WSL 2, accessible to UID 1000 through a root:docker socket with mode 0660. Linux Node is absent; the inherited pnpm path points into Windows and must not be used. Install the exact runtime only in a task-local Linux directory and use a clean standalone clone on the Linux filesystem. No installation or containment run was performed in this handoff turn.

Use the pinned image recipe, frozen root installation, and separate exact OCI fixture-store hydration described by the existing trusted-container CI job. Then run `pnpm test:oci-container --output artifacts/<fresh-short-id>` once and independently validate its actual case artifacts, receipts, image identity and cleanup. Preserve failures and diagnose the reached boundary. Do not automatically run the full product/controller/native-platform matrix for this environment-only observation.

The current OCI matrix explicitly requires a Linux controller. This WSL route supplies no native Windows qualification, and Windows has no Docker executable on PATH. Record native Windows feasibility early in a later bounded provider increment; do not weaken the existing platform guard or call a WSL run native Windows evidence.

After this runtime foundation, prove one real public workflow, one correctly reached rejection, isolated qualification-host suitability and authenticated read-only producer/consumer evidence handoff. Expand coverage only after those foundations work. Strict compatible readers, inert snapshot anchors, a separately committed migration request, lease/intent publication, mixed-generation refusal and independent reconciliation still precede activation/adoption.

## Preserved WP6 history and cost boundary

WP6e remains incomplete at e590e38. All five activation CI jobs passed in run 33951754449 and their artifacts were independently validated. Actual candidate verification still failed before test execution on its recorded host; unit-domain remained NOT_READY and fault proofs 5(a)/(b) did not reach their intended tier boundaries. See the original `artifacts/wp6e-amendment-dev/final-closeout/` and the byte-exact archived [.agent/history/wp6e-e590e38.md](../../../.agent/history/wp6e-e590e38.md). New authority approval does not retroactively close those gaps or authorize WP6f interpretation.

Routine candidates retain their invariant/static/build/four-owner floor plus explicit affected cases. Full fresh Windows/Linux qualification remains mandatory for the exact readiness gate and any operation requiring exact closure. Implementation notes have their own package integrity digest; conforming changes do not require renewed authority approval. No CI dispatch, performance improvement, runtime qualification, state adoption or product completion is claimed by this handoff.

The pre-existing untracked roadmap is user-owned and must remain unchanged and outside commits. No private milestone-loop refs were present at inspection. Do not initialize replacement controller state during handoff or migration.

Sealed review packages are stored as immutable byte assets in Git, with binary attributes that prevent newline conversion and automatic text merging. The first import audit retained whitespace diagnostics from their already-sealed blank lines, CRLF inventory and literal unified-diff context; those bytes cannot be reformatted after approval. The exact manifests and supplied authority diff remain the review surface. All new editable handoff/source files retain normal text checks. Diagnostics are preserved under artifacts/orch-auth-01-handoff/sealed-import-whitespace/; no production formatting rule changed.

Suggested fresh-session prompt:

> Continue ORCH-AUTH-01 from .agent/current-exec-plan.md. Revision r2 is approved. Verify the handoff, then complete the first bounded runtime qualification increment while preserving the approved cadence and transition safeguards.
