# C3 hosted regressions and local repair

Historical WP6e remains BLOCKED at e590e38. This record repairs two later test-fixture defects exposed by the exact c9675791714fa23554277496078263744da8b26c hosted cohort; it grants no candidate or readiness PASS and does not activate ORCH-AUTH-01.

The protected [C3 run 34010283121](https://github.com/mclaurin10/milestone-loop-template/actions/runs/34010283121) finished with two failed controller jobs and three successful adopter/OCI jobs. Linux passed 808/809 controller tests; Windows passed 783/809. The stale current-catalogue assertion failed on both. All 25 Windows qualification-input cases stopped in fixture setup at the production stable-realpath guard. Its fixture omitted canonicalization already used by the container-artifact fixtures. The original host/OCI closeout remains its separately scoped observation; C3's hosted cohort remains failed.

The catalogue now explicitly expects 84 controller, four repository-tooling, two adopter and one OCI file (91 total). The historical 87-file catalogue remains unchanged historical evidence. Qualification-input.test.ts was added in B; qualification-host-discovery, qualification-vm-lifecycle and qualification-docker-host .test.mjs files were added in C1/C2/C3. No tests are removed or unclassified.

The qualification-input fixture canonicalizes its newly created owned temporary directory with realpath. Production path identity, link, quota, binding and receipt checks remain unchanged. A real differently cased Windows TEMP/TMP path reproduced all 25 setup failures before the fix. Afterward all 42 cases across qualification-input, container-artifacts and test-ownership passed with that same alias, including every existing negative case. The initial catalogue-only baseline failed 1/9 and its corrected run passed 9/9. All five invariants and final typecheck/lint/format checks passed. Invariants took 61,233 ms, above the unchanged advisory warm target; this is no performance result.

Raw local evidence, both failed baselines, the first audit's ordinary property-name error (no PASS receipt), exact test-source diff, all five original hosted ZIP artifacts and final provider job/artifact metadata are retained in evidence/retained-evidence.zip. The archive has 130 regular files; SHA256 **ae7b798fb47acd44a717f67ffc789b2d6eed13596c1b548fe40beef9d21ea05f**, 604,778 bytes. Local supporting executions were dirty on C3 and completion-ineligible. The retained audit verifies every file and fourteen command-owned receipts plus their independently hashed artifacts. It audits retained data, not a fresh test or hosted execution.

Reproduce from this repair commit with trusted Node 24.18.0/pnpm 11.15.1 and installed frozen dependencies. Use fresh absolute output paths inside the checkout:

```powershell
$manifest = Get-Content -Raw docs/ci-regressions/wp6e-inventory/evidence/manifest.json | ConvertFrom-Json
./docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/ci-regressions/wp6e-inventory/evidence/retained-evidence.zip -ExpectedSha256 $manifest.archive.sha256 -Destination (Join-Path $PWD 'artifacts/ci-regression-reproduce')
pnpm exec tsx docs/ci-regressions/wp6e-inventory/audit.ts artifacts/ci-regression-reproduce artifacts/ci-regression-audit
```

The extractor checks the archive hash and every entry before writing any content. The audit verifies the exact retained inventory, actual baseline rejection messages, corrected raw test counts, real ownership discovery and all receipt artifacts. The two test fixes, this procedure, plan and log form the scoped repair commit. A fresh clean post-commit focused run and the new pushed candidate's complete five-job cohort are separate pending gates at commit time. Preserve the paused C4 work and continue it after integration; source build/migration, actual four-partition candidate, committed 5(a)/5(b), native platform qualification, readiness and human acceptance remain unfinished.
