# ORCH-AUTH-01 proposal preparation

Status: Proposal prepared and audited; awaiting exact human review. Owner: proposal author. Updated: 2026-09-05.

## Objective

Prepare the exact human-review package requested on 2026-09-05: define the reusable milestone orchestrator/template as this source repository's product; distinguish source acceptance, generated-adopter bootstrap, and downstream completion; specify executable workflow checks, exhaustive legacy mapping, claim boundaries, and a recoverable authority/commissioning migration.

## Constraints

This directory is an inert proposal. Do not activate or edit PROJECT_GOAL.md, AGENTS.md, evals/, .agent/, package scripts, controller/verifier code, source commissioning, WP6 evidence, or existing logs. No goal/acceptance approval has been received. Preserve the protected untracked roadmap. Docker investigation is read-only; no installation is required if the existing WSL engine is usable. No WP6e/WP6f completion, reinterpretation, or schedule claim is authorized.

## Steps

1. Inspect frozen files, active commissioning/anchor code, supported public workflows, current evidence, and WSL runtime. Complete.
2. Draft exact replacement authority copies plus source-only command/stage definitions and an explicit safeguard-preserving migration. Complete.
3. Map every old acceptance ID and JSON leaf, goal section, command, profile rule, calibration rule, and hidden-protocol rule. Explain replacements and retirements without claiming equivalence. Complete: 24 IDs, 87 manifest leaves, ten goal sections and 33 declared verification commands.
4. Mechanically validate proposal consistency, complete mappings, content hashes, and unchanged active/protected files. Retain a command-owned proposal audit receipt; it proves document integrity only. Complete: all eleven audit groups passed and the receipt/artifacts validated through the existing production receipt validator.
5. Prepare the review index and exact approval scope for delivery. Complete: README.md links all proposed authority, mapping, check/fixture/protocol, migration and runtime files. All active work and authority remain unchanged.

## Acceptance and verification

Every proposed requirement names an observable public workflow, required artifacts, a failure case, and a claim limit. The proposed source machine gate, source live/human gate, adopter bootstrap, and downstream completion are distinct. Original baseline/ledger bytes remain retrievable and migration cannot bypass strict ancestry, pending-intent refusal, review, evidence identity, or clean-tree rules. All proposed JSON parses; every legacy manifest leaf has one disposition; every mapping target exists; a content manifest binds the exact review bytes. No implementation or product acceptance tests are claimed from proposal validation.

## Risks and recovery

New source semantics require an explicitly approved human revision, never CAL-1 or a schedule-only amendment. Existing lock/anchor/audit readers reject this proposed format until compatible implementation lands. Keep legacy schemas and tests valid. If the proposal changes after review, issue a new content digest and obtain approval for those exact bytes. Delete no prior evidence and perform no Git state adoption.

## Observed verification

Under Node 24.18.0 and pnpm 11.15.1, `node docs/proposals/ORCH-AUTH-01/author-proposal.mjs` generated the exact copied baseline, proposed manifest/lock/supporting text, mapping and diff. `pnpm exec tsx docs/proposals/ORCH-AUTH-01/verify-proposal.ts --seal` passed, writing `proposal-audit.json`, `review-manifest.json` and the owned `audit/result.json` / `audit/manifest.json` receipts. It validated 26 protected files, 26 sealed review files, 12 machine requirements, eight domains, 16 failure families and eleven source stages. Plain `pnpm exec tsx docs/proposals/ORCH-AUTH-01/verify-proposal.ts` rechecks the same digest without replacing the seal.

The approval target is ORCH-AUTH-01 with content SHA-256 `333bb70e0db13459304a9051fcbd862a567d7debf62bb6d6ebfc5c6c22a1011a`. This status file and audit outputs are excluded from that digest to avoid self-reference. The exact source remains e590e38c32de2b5baa7423f66bbd8a0230b61839. Tracked/index diffs are empty; the new proposal and pre-existing protected untracked roadmap are the only working-tree entries. No product/migration implementation test, runtime containment qualification, authority approval, WP6 completion, commit or integration is claimed.

## Next action

Review the exact sealed proposal. Only a subsequent explicit human approval can authorize its frozen-authority revision and staged migration. Keep WP6e's existing incomplete plan/evidence and WP6f's scope unchanged. Runtime qualification can use the existing WSL Docker Engine under a separately scoped execution plan; no runtime installation is currently needed merely to prepare this proposal.
