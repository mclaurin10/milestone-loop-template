# C6a — publication fence and approved anchor inspection

Status: local implementation and retained audit passed; exact post-commit audit and hosted cohort follow separately. This is a supporting reader increment under the still-active legacy authority. It does not activate ORCH-AUTH-01, complete compatible source consumers, execute the candidate tier, close historical WP6e or supply readiness/human acceptance.

The common native-Node reader refuses a present migration intent, including malformed files, directories and linked paths. Explicit unknown or mixed contract/epoch signals fail closed. Authority, configuration, commissioning, state, mutation lease and verifier entry points share that fence and recheck it at mutation/dispatch boundaries. A complete source projection is still refused pending the later committed request/review/generation validator. Generated adopters retain their own legacy/bootstrap contract.

Read-only source anchor inspection checks the seven exact approved root files against the real inert snapshot commit `91cbd3eb75ec771cfa1f315fe2641488e361c9e0`, which must be a strict ancestor. It verifies the settled approval, original legacy snapshot, canonical independent regular files and unchanged readiness marker. Its activation and completion flags are always false. The explicit source release inventory includes the new runtime modules; two new suites add 43 cases.

## Observations and limits

Native Windows Node 24.18.0/pnpm 11.15.1 passed the final 56 boundary cases, all 52 Doctor/state cases, typecheck, lint, format, source architecture and five invariants. The 106,809 ms invariant observation exceeded the advisory target; no performance interpretation is made. Original test assertions and deadlines remain intact. Doctor's synthetic protected lock now contains parseable legacy JSON; its commissioning manifest remains absent as before.

The first affected run failed 23/226 cases; the next failed 10/132. Retained failures include the initial Doctor fixture, its incorrect intermediate manifest and local Git-heavy test deadlines. A detached unchanged `dba20a6` worktree reproduces all three amendment deadlines. Both the no-checkout fixture experiment and the inspected direct-Git launcher attempt remained non-passing; the original fixture was restored. Diagnostic selection's 34 skipped cases are explicit and never counted as full-suite coverage.

Two complete WSL development runs each passed all 282 raw cases in 16 suites but failed the production measurement timestamp check and emitted no PASS receipt. Retained raw process records and an independent Python clock observer show backward wall-clock jumps despite positive monotonic elapsed time. An earlier Linux launch failed before tests because archive extraction omitted executable modes. The corrected extractor preserves validated original modes. No production probe, timestamp validation, original deadline or shared clock/service setting was changed.

The passing check used the unchanged C3 host coordinator and its original finite 30-minute isolation policy in owned VM run `94e44109-2f6e-43c6-abe7-0b887505ee84`. Its guest first passed the actual six-case OCI matrix at clean `dba20a6f3669f4fbfe04161c01524e2059f8277b` (tree `d1e2f74ad6d466b7cfc53eb34cedce1a7d64813b`), then applied the exact existing development patch (tree `720c0b5eea4f0f4bd73277161b197ddf4dd45ede`) and passed all 282 reader cases plus the production measurement validator. The reader receipt SHA256 is `8e0ff0a2c3a1c40af2dce6f19c9780f821879c14e69bd8dbcd6348d0ed6e7a1a`. Separate unchanged C3 OCI/host auditors passed against its exported observations. The whole 543,263 ms lifecycle ended with the owned process, cgroup and writable directory absent.

`prepare-vm.py` verifies reused C3 input/program hashes and retains the exact additive guest diff. The guest has no NIC or host directory share; its independent clock samples are retained. The returned archive has SHA256 `df7ee6523789c76e9becbc0d683a805f5f97c16a6ffef31afded2fa9be973336` and was inspected across all 156 members before extraction. This remains development support rather than a clean committed candidate or native Windows workflow. The host coordinator did not adopt source state, change shared packages or adjust clocks.

The earlier repair cohort [34015911019](https://github.com/mclaurin10/milestone-loop-template/actions/runs/34015911019) passed all five exact jobs at `42871f66ae1711821703f16bcb97cca18b5ccf3a`. Retained provider ZIPs and all 43 child receipts are independently validated. Both controller jobs passed 826 controller and 954 root cases; adopter bootstrap results remain completion-ineligible, and the OCI rejection outcomes retain their ERROR/TIMEOUT meanings. That cohort does not verify C5 or C6a. The exact pushed C6a cohort and post-commit retained audit remain required separately.

The clean `dba20a6` branch-only clone also passed both C5 portable retained audits, without importing supporting objects into its source repository. Those observations are retained here; the original C5 sealed evidence stays unchanged.

## Reproduce the retained audit

`evidence/manifest.json` pins 984 regular retained files (6,312,436 bytes), 31 implementation files and fourteen unchanged active-generation files. The 2,145,077-byte archive has SHA256 `7c4453a6c01a493b4dde14c5957457d16f395ded185f568b64a50bf30e195ac8`. The first retained audit passes with 69 independently validated command receipts; its receipt SHA256 is `95bba0cd763d6b5af547370eaf34ebd2a7a01740296afe10a4f6cb6c0bd31f31` at `artifacts/wp6e-source-readers-20260906/retained-audit-1`.

`audit.ts` checks raw failures and passing command receipts, reconstructs the actual tested Git projection from the real published parent plus retained patch, compares original case identities, and checks the independent host/OCI observations. The 39 MB Git transport bundle and temporary projection index remain local; the sealed audit reconstructs the same objects from published history instead of claiming those omitted transport bytes were sealed.

Use a fresh extraction and output directory, with the exact pinned native runtime:

```powershell
$env:PATH=(Resolve-Path '.tools/node-v24.18.0-win-x64').Path+';'+$env:PATH
$evidence=Get-Content -Raw docs/source-authority/ORCH-AUTH-01-C6a/evidence/manifest.json | ConvertFrom-Json
& docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/source-authority/ORCH-AUTH-01-C6a/evidence/retained-evidence.zip -ExpectedSha256 $evidence.archive.sha256 -Destination (Join-Path (Get-Location).Path 'artifacts/c6a-reaudit-input')
pnpm exec tsx docs/source-authority/ORCH-AUTH-01-C6a/audit.ts artifacts/c6a-reaudit-input artifacts/c6a-reaudit-output
```

The next authorized increments implement complete compatible generation/result/registry consumers, the separately committed migration request and independent review, leased recoverable publication, the real candidate/four partitions/65-minute provider boundary, and committed 5(a)/5(b). Historical WP6e stays BLOCKED at `e590e38c32de2b5baa7423f66bbd8a0230b61839`. Source state remains absent; old unit-domain meaning, native Windows/Server 2022 distinctions and all separate gates remain intact.
