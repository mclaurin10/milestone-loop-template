# Current Execution Plan

Status: C6d-R1 implementation and retained audit verified; clean post-commit and hosted gates pending. Updated: 2026-09-06 UTC. Owner: authorized WP6e continuation.

## Objective

Repair the actual exact-commit Windows candidate-package-runtime fixture offline-store failure. Its immediate consumer is the unchanged sanitized command runner under both CI and non-CI strict package verification. Pause C6e source publication implementation until this regression is repaired and verified.

## Goal Constraints

Preserve every original assertion, full test identity and deadline, protected public argv/workflows, safeAgentEnvironment, sealed authorities and source state absence. No online test fallback, shared configuration/store mutation or source activation. Historical WP6e remains BLOCKED at e590e38c32de2b5baa7423f66bbd8a0230b61839. This repair supplies no candidate/readiness/performance claim.

## Baseline Evidence

The real Windows Server 2022 hosted job 101500874916 at 96abed900ba141afb4ae644a691e7d5bb0569ca0 in run 34038506240 failed 1/950 controller cases: candidate-package-runtime.test.ts reported ERR_PNPM_NO_OFFLINE_TARBALL for @eslint/js 10.0.1 while installing its temporary fixture. Its original 180-second test deadline was not reached (1192ms). No controller PASS receipt and no later root-unit run exist. Four other protected jobs passed. All five provider archives were downloaded, checked against provider SHA256, safely extracted and retained at artifacts/wp6e-source-publication-20260906/hosted-96abed9 in the primary workspace.

The fixture assumes an implicit store selected in a temporary directory matches the hydrated source store. Native pinned store-path observations on this workstation select the same C: store from all inspected directories and do not reproduce a drive difference. Do not label a cross-drive cause proven. Explicitly control a fresh empty implicit fixture store to reproduce the missing-source-store failure, then bind the fixture to actual installed modules metadata. No production controller dependency contract changes are proposed.

## Steps

1. In this owned remote-free clone at 96abed9, reproduce the offline missing-store rejection with a fixture-local empty store setting; preserve exact source/report/error without a receipt.
2. Read and validate the source installation's exact pnpm metadata and bind its actual store explicitly to the existing offline installation and both strict child commands. Retain the controlled empty implicit-store observation, every original assertion and unchanged sanitized environment.
3. Run the complete affected package-runtime/command-runner/environment files, typecheck/lint/format, five invariants and source dependency/architecture checks. Independently retain/audit original hosted failure plus replacement evidence. The consumed build requires the actual clean post-commit checkout; preserve its dirty-tree refusal without PASS and require the post-commit run before a repair completion claim.
4. Commit the cohesive repair, reproduce from a clean committed clone, push the exact repaired candidate and collect all five protected jobs. Resume the saved C6e request/review/publication work, actual candidate/four owners/65-minute provider/committed mutations and final matrix.

## Acceptance Criteria

The controlled baseline must reach the real offline installation and reject without a PASS receipt. The repaired original test passes using the actual source installation store even when the fixture's implicit store is empty. Both strict sanitized/CI children report the original TypeScript and CI values and leave both installation metadata hashes unchanged. Hosted failure and missing downstream stages remain accurately classified. No assertions or deadlines are removed or relaxed.

## Verification

Use Node 24.18.0/pnpm 11.15.1 with strict outer dependency checking, command-owned focused and broad evidence, actual native Windows child execution, original hosted raw reports/ZIPs and independently audited post-commit evidence. No UI changes or visual evidence needed.

## Risks and Recovery

An explicit store pin must be derived from real installed metadata, canonical and bounded; it is a fixture input, not permission to alter the shared store. Keep the copy import method and offline/ignore-scripts/frozen flags. Preserve any failure and diagnose before expanding source publication work. Only task-owned temporary fixture paths may be removed. Do not change shared package/service/credential/configuration state.

## Progress and Evidence

Fresh extraction audit passed: 468 files, 4802266 raw bytes, 56 independently validated receipts and all eight original assertion expressions preserved. Retention ZIP is 2049912 bytes, SHA256 9f6fb78dc131c0de7d2f80e9fc80608286741c920c7f390c71c4e1e0c07c3a72. Auditor receipt 2f3a666c9d1e3eab71b491ad4f4fa9c7e879740fec84ccdb21739b0ea4d9b5a4 is at artifacts/runtime-store-retained-audit-1. Commit this cohesive repair, then execute the exact post-commit gates; this audit is not a hosted success or consumed-build substitute.

All five invariants passed, 58216 ms with no performance interpretation. The retained auditor enforces original assertion-node and timeout inclusion, unchanged full test identity/deadline, preserved authority/public runner bytes, raw hosted 949/950 failure and missing unit evidence, both local failed attempts and all passing child receipts. The exact clean post-commit consumed build, independent retained audit/dependency/focused reproduction and all five new hosted jobs remain required; retain them at the primary workspace's artifacts/wp6e-source-publication-20260906/runtime-store-postcommit. C6e resumes after this repair is verified; its uncommitted implementation remains outside this isolated cohesive commit.

The controlled empty implicit store reproduced the same missing @eslint/js offline tarball failure through the real fixture installation (baseline-focused-1, 1 FAIL, no receipt). First correction reached strict child execution but pnpm exec rejected plain --store-dir; retained fixed-focused-1 has 1 FAIL/no receipt. The documented --config.store-dir form is accepted by both install and exec. Final fixed-focused-2 passed all 15 complete runtime/command-runner/redaction cases, receipt 6f02577f78c24ebbb2ae2a98d0266d7f99a0645ee8cf2e3968e55cd2ea9f4b9c. Every original assertion/full test name/deadline is retained. Typecheck/lint/format/source architecture/source dependencies passed. Build-1 refused the dirty candidate before dispatch (no receipt); require the exact clean post-commit consumed build. Five invariants are running.

The first local baseline invocation appended a file argument to the public test:unit script, which ignores that argument and launched the full suite. It was interrupted (tool session 93730, exit 1), produced no PASS receipt, and is unverified. The corrected focused runner executed the named file and retained raw reports. No production wrapper was changed. The existing hosted auditor rehashed all five 96abed9 archives and validated 38 child receipts (2d2297766fefeded05afeb5ef82c029255fc36f8980c31d706b1fcee4ccc54f3) while preserving the one failed Windows controller case and absent later unit stage.

Owned implementation clone: .tools/wp6e-c6d-runtime-store-fix in the primary workspace. The original C6e uncommitted work remains preserved in the primary workspace and has never published authority. The clone was clean at actual 96abed9 before this plan. Frozen offline copy installation completed using all 138 cached packages. No source controller state or private refs initialized.

## Next Action

Reproduce the missing implicit-store defect, repair actual store binding, verify/commit and continue the full WP6e continuation.
