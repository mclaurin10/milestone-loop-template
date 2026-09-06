# C6d-R1 — bind the runtime fixture to the installed source store

The actual Windows Server 2022 controller job at `96abed900ba141afb4ae644a691e7d5bb0569ca0` failed the candidate package-runtime fixture's offline installation because its selected store lacked the locked `@eslint/js@10.0.1` tarball. The remaining 949 controller cases passed. Its root-unit stage did not execute and no controller PASS receipt exists. Linux passed 950 controller and 1124 root-unit cases. Both fresh-adopter jobs and the trusted-container job passed. The five exact provider archives and their independent 38-receipt audit are retained; no later evidence relabels this failed cohort.

The fixture previously assumed the implicit store selected in a temporary directory matched the store that hydrated the source installation. This repair reads the source's actual pnpm 11.15.1 installation metadata, validates its canonical absolute `v11` store, and supplies its parent using the documented `--config.store-dir` option to the existing offline install and both strict child commands. It deliberately gives the owned fixture an empty implicit store and checks that pnpm selects it before applying the explicit source-store pin. Every original assertion, test identity, 180-second test deadline, child deadline and sanitized environment rule is preserved. The production runner, public scripts, workflow, dependency graph, authorities and source state are unchanged.

Local native store-path observations selected the same store from all inspected directories. They do not prove the hosted failure was caused specifically by a drive difference. The controlled empty-store baseline reproduces the exact missing-tarball error at the real installation boundary without network fallback or shared configuration changes. No shared store is cleared, copied or reconfigured by the test.

## Evidence and limits

- `baseline-focused-1`: the controlled original fixture fails one case with `ERR_PNPM_NO_OFFLINE_TARBALL`; no receipt.
- `fixed-focused-1`: the initial explicit option reaches the strict child but `pnpm exec` rejects plain `--store-dir`; no receipt. The final form is `--config.store-dir`.
- `fixed-focused-2`: all 15 cases in the complete runtime, command-runner and redaction files pass. Receipt SHA256 `6f02577f78c24ebbb2ae2a98d0266d7f99a0645ee8cf2e3968e55cd2ea9f4b9c`.
- Typecheck, lint, format, source dependency and source architecture checks pass with owned receipts. All five invariants pass (58,216 ms; no performance interpretation).
- The pre-commit consumed build refuses the dirty checkout without a receipt. A fresh consumed build from the actual clean repair commit remains an explicit post-commit obligation.
- The first local command mistakenly appended a file argument to public `test:unit`, which ignores that argument and started the full suite. The original session was interrupted before further test edits. It has no PASS receipt/final raw report and remains unverified. The operator observation is labelled separately from raw child evidence.
- Clean C6d post-commit audit, dependency and consumed-build observations are retained as C6d evidence, with their original commit and scope.

The retained auditor compares the original committed test's TypeScript assertion nodes and timeout values with the repaired test, verifies the original test identity and deadline, rehashes the entire inventory, independently validates every real receipt/artifact, and preserves the exact failed hosted topology. Its PASS audits observations; it does not claim that the failed Windows cohort passed.

## Reproduce

The seal contains 468 regular files, 4,802,266 raw bytes and 56 validated receipts. The 2,049,912-byte ZIP has SHA256 `9f6fb78dc131c0de7d2f80e9fc80608286741c920c7f390c71c4e1e0c07c3a72`. Fresh-extraction audit receipt: `2f3a666c9d1e3eab71b491ad4f4fa9c7e879740fec84ccdb21739b0ea4d9b5a4`. The original eight assertion expressions are preserved by the AST comparison.

Use pinned Node 24.18.0/pnpm 11.15.1. Read `evidence/manifest.json`, then inspect and extract the sealed ZIP to a fresh owned directory using the repository's bounded ZIP inspector:

```text
docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/ci-regressions/candidate-installed-store/evidence/retained-evidence.zip -ExpectedSha256 <manifest archive SHA256> -Destination <fresh absolute extraction directory>
pnpm --config.verify-deps-before-run=error exec tsx docs/ci-regressions/candidate-installed-store/audit.ts <extracted directory> <fresh output directory>
```

After the repair commit, reproduce this audit, the complete affected test files, source dependencies and actual consumed build from a clean owned checkout. Retain post-commit evidence at the primary workspace's ignored `artifacts/wp6e-source-publication-20260906/runtime-store-postcommit` destination and collect all five protected jobs for the pushed repair commit. These obligations must be observed before declaring this regression repaired across supported workflows.

Then resume the preserved C6e implementation. No actual source request, SDK review, migration lease or authority publication has run. The clean source candidate, all four independent partitions/raw coverage reconciliation, actual 65-minute provider boundary, committed 5(a)/5(b), native Windows provider qualification, readiness and human acceptance remain open. Historical WP6e stays BLOCKED at `e590e38c32de2b5baa7423f66bbd8a0230b61839`; root-unit success never establishes unit-domain success or a WP6f decision.
