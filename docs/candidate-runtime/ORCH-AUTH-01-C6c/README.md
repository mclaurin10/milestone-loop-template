# Candidate package runtime and distinct discovery identities

This bounded WP6e continuation increment fixes two observed prerequisites. The source workspace explicitly sets enableGlobalVirtualStore: false, so pnpm 11.15.1 uses the same package layout before and after the production command runner sanitizes CI. Four unsafe-PATH rows now have stable distinct labels. Their original platform/path expressions and rejection assertion are unchanged; the auditor checks the entire source-file transformation against e072287ac054197a469b39031f2a348a6c47a100.

The new regression installs an isolated copy of the real workspace manifests/lock under CI, then consumes the installed TypeScript dependency through the real command runner, with and without CI. Strict verify-deps-before-run=error remains enabled, and installed metadata/lock hashes must remain unchanged. The production environment allowlist, comparator, original assertions and deadlines are unchanged. Generated adopters inherit the explicit workspace setting through the existing copy path.

Before the setting change, the real sanitized child failed with ERR_PNPM_VERIFY_DEPS_BEFORE_RUN because enableGlobalVirtualStore had changed. The initial diagnostic omitted stdout in its assertion rendering; the second attempt retains the exact rejection and all forty passing discovery observations. After correction, the complete seven-file focused selection passed 118 cases. Typecheck, lint, formatting, source architecture and all five invariants passed. New-test parser typing errors and the first strict root invocation refusal remain recorded without PASS receipts. An intervening unflagged pnpm typecheck automatically refreshed ignored local installation metadata; later outer invocations used strict mode. No shared user configuration was changed.

The unchanged production comparator detects one three-observation duplicate in the old forty-case discovery report and accepts forty distinct current identities. The auditor records four exact renames and thirty-six unchanged cases. This is a file-level prerequisite; the actual candidate's historical/full-suite reconciliation and exactly-once four-partition proof remain separate obligations.

The retained seal contains 130 regular files, 1678939 bytes and 15 independently validated command-owned receipts. The ZIP contains 131 members including a directory, 752700 bytes, SHA256 f527f5b954750844cc4cb3acf8ee837f7437670e4008c21f30d4d4c50ca463b5. Audit receipt: 274c681b20a930927528ff64307ecc036b5c74583ba2fcaae517dc52ebd2d9bf. The initial curation's console total was unavailable because PowerShell did not sum dictionary fields; extraction and the independent auditor correctly enforced the bound. The corrected curator explicitly accumulates numeric byte counts. Original curation/audit observations remain under artifacts/wp6e-c6c-curation-1 and artifacts/wp6e-c6c-audit-1.

The seal also preserves C6b's real clean post-commit audit, dependency check and consumed build at e072287 / 16e6437bbcec22023a6208236b76f699cff6f88a. Its recorded gitStatus is empty; source private refs/state are absent. Build archive SHA256 is 4edbd4bb349f9661f3eed2ca134c2480906a5909327ae27881ced30701dc08a8. C6c post-commit evidence must identify its own final commit.

From an exact checkout, use Node 24.18.0 and pnpm 11.15.1, inspect the complete ZIP before extraction, then run:

```powershell
& docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/candidate-runtime/ORCH-AUTH-01-C6c/evidence/retained-evidence.zip -ExpectedSha256 f527f5b954750844cc4cb3acf8ee837f7437670e4008c21f30d4d4c50ca463b5 -Destination (Join-Path (Get-Location).Path 'artifacts/c6c-fresh-extraction')
pnpm --config.verify-deps-before-run=error exec tsx docs/candidate-runtime/ORCH-AUTH-01-C6c/audit.ts artifacts/c6c-fresh-extraction artifacts/c6c-fresh-audit
```

Focused verification reused the unchanged C6b run-focused.ts receipt owner with the seven exact file arguments recorded in focused-2/child-execution.json. It executes complete files through the original production measurement boundary; its receipt supplies supporting test evidence only.

Authority remains legacy. No source state is initialized/adopted. Historical WP6e stays BLOCKED at e590e38c32de2b5baa7423f66bbd8a0230b61839. Root-unit evidence never substitutes for unit-domain acceptance. This increment supplies neither authority activation, full native/source qualification, actual candidate verification, committed 5(a)/5(b), readiness, human acceptance nor WP6f interpretation. Continue the approved request/review/lease/publication safeguards and remaining candidate obligations.
