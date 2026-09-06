# C4: inert approved source snapshots

This increment commits exact inert authority snapshots and a strict read-only inspector. The active root authority, commissioning/amendment generation, package commands and source controller state remain unchanged. Approval is settled; inspection grants no activation. Historical WP6e remains BLOCKED at e590e38.

The inspector binds the known control-plane approval record SHA256 602210fabd865c1d1710032e113d7275ea81e39788ca6b76b439b07cf627bc81 and approved normative digest 53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108. It reads only exact real Git commit objects under two fixed snapshot prefixes. Seven source files must match the approved bytes; five legacy files must match original commit 0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5. Missing, extra, linked, executable, altered, unrelated or non-commit inputs reject. Candidate-authored approval cannot grant authority. Same-commit inspection is explicitly labeled non-ancestor; migration must later require a strict ancestor plus every separate request/review/publication safeguard.

Seventeen new real Git/subprocess cases, four original authority-anchor cases and nine current ownership cases pass (30/30). Initial focused evidence failed 12/21 because the new Git-heavy cases used Vitest's unconfigured five-second default; a bounded sixty-second deadline is now set only on this new suite. Initial typecheck found two ordinary typing errors, both fixed. No original deadline, acceptance or production gate changed. Final typecheck, lint, format and five invariants pass. Invariants took 76,046 ms with the original advisory warm target still unmet; no performance claim follows.

The new test is explicitly classified as controller-runtime, making the current catalogue 85/4/2/1 files (92 total). The historical 87-file catalogue and the separate 91-file C3 repair record retain their own identities. The C3 regressions were independently repaired in 827ebbf27b98fb1e2a3ea97cb5c1c0100618818d and that exact hosted cohort remains separately tracked.

The curated ZIP holds 98 regular raw/supporting files and eleven command receipts. SHA256 **07c74696083b638f88d9b48735d8fb9117053557b32f5b558a39502929abba2d**, 118,421 bytes. Its source patch reconstructs tested index 36856c6b16482157f5752e595d8df8b1a4b82d70 on 827ebbf. The retained audit checks every raw file, receipt/artifact, implementation pin, live authority hash and reconstructed Git tree. All supporting runs are dirty/completion-ineligible. The audit reproduces retained tests; it is not a fresh execution of those tests or a source-ready candidate.

With exact Node 24.18.0/pnpm 11.15.1 and frozen dependencies, reproduce from the C4 commit using fresh output paths:

```powershell
$manifest = Get-Content -Raw docs/source-authority/ORCH-AUTH-01-C4/evidence/manifest.json | ConvertFrom-Json
./docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/source-authority/ORCH-AUTH-01-C4/evidence/retained-evidence.zip -ExpectedSha256 $manifest.archive.sha256 -Destination (Join-Path $PWD 'artifacts/c4-reproduce')
$snapshot = git rev-parse HEAD
pnpm exec tsx docs/source-authority/ORCH-AUTH-01-C4/audit.ts artifacts/c4-reproduce artifacts/c4-audit $snapshot
pnpm exec tsx tools/milestone-orchestrator/src/source-epoch-inspect-cli.ts . $snapshot artifacts/c4-inspection
```

The extractor inspects every ZIP entry before writes. The post-commit audit additionally inspects the supplied real committed snapshot. Neither command initializes controller state or creates a migration request. Before commit, the successful retained audit omitted the optional snapshot argument and made no committed-snapshot claim. Initial snapshot preparation is preserved as PREPARED_UNCOMMITTED; it is never retroactively relabeled.

Continue strict compatible active-generation consumers, a consumed source distribution build and dependency/architecture checks, a separately committed request and independent review, existing lease and fsynced exclusive intent, coherent recoverable publication, actual clean candidate/four partitions/raw identity coverage/65-minute provider deadline, committed 5(a)/5(b), and the required exact hosted evidence. Native Windows/Server 2022 full workflow qualification, complete source readiness and separate human acceptance remain unfinished. No WP6f interpretation or source state adoption is authorized.
