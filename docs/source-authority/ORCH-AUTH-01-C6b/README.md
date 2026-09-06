# Compatible source verification readers

This C6b increment is part of the authorized WP6e continuation. It adds explicit source aggregate 3.0.0 and tier 2.0.0 scope, an eleven-stage source registry, strict source tier decoding, real receipt/artifact validation for incomplete source aggregates, and approved source integrity inspection. Legacy aggregate 2.1.0, tier 1.2.0 and the thirteen legacy integrity checks retain their original meanings. Authority remains legacy; no controller state is initialized or adopted.

Source, generated fixture and qualifier identities are separate. Readers reject cross-scope and unknown schema data before interpreting status, including nested exact closure. Incomplete source aggregate consumption accepts NOT_READY only and cannot authenticate source qualification. Tier decoding validates structure; it does not authenticate the referenced artifacts or authorize readiness. The common MJS metadata is explicitly included in the distributed runtime. Native `node scripts/verify.mjs` remains executable.

## Current verification

The retained development runs identify source base c708945e4ba8e0b75f09bc9e564b4afc5cb47a0a. Native aggregate/scope verification passed 140 cases. Native foundation and generated-adopter compatibility passed 103 cases. The subsequent native publication-boundary suite passed all 30 cases. Typecheck, lint, formatting, source architecture and the five-command invariant suite passed. The invariant suite took 126836 ms; this is not a timing or performance claim.

A real clean development build ran at cb6b91235bdd8de8f86eb0c3a7c44c7d9575b56f, tree 7dfaa338d0882ffb35fe69fe3d8df90395f9947c, in a remote-free isolated clone with offline independent package copies. It produced and consumed a 568085-byte release archive with SHA256 fc474e0e7d54ff5882709a50c818b85b638084654f8baa93c549bbd601d54147. The exact supporting Git objects are retained in build-projection.bundle. The later change adds only the missing runtime file to one test fixture; the auditor checks that complete transformation and the unchanged production inputs. Post-commit build evidence must identify its own final commit.

Primary-checkout build and dependency checks remain recorded failures: build requires a clean tree, and the installed dependency graph contains hard-linked files. The isolated clean build and independent-copy dependency check passed. No shared package configuration was changed.

The first VM input preparation was never launched after a native import regression was found. The second VM ran the actual full unit command: 1088/1089 passed; one minimal native-verifier fixture lacked the new MJS dependency. Its original rejection assertion remained unchanged. The six real OCI cases passed independently; the enclosing unit/host result remained non-passing, and process/cgroup/directory cleanup was verified. The corrected third VM used fifteen-path projection 12b2e205abab2d728b4c749da8926754acda9686. Its actual full unit command passed all 1089 cases with zero skipped. Independent six-case OCI and host lifecycle audits passed, with process/cgroup/directory cleanup verified. The retained guest archive SHA256 is 33b25dc3c592680b35018aadaf56ec30bfd6247dfab3573358642cabfbc2a597.

Earlier typing, schema-diagnostic, nested-scope and native-import failures remain retained. No original test assertion, timeout, measurement check, command spelling, authority byte or readiness gate was weakened.

## Retained evidence procedure

Use exact Node 24.18.0 and pnpm 11.15.1. The observed seal contains 1217 regular files, 8361545 bytes and 67 independently validated command-owned receipts. The ZIP has 1225 members including directories, 3160537 bytes and SHA256 ce14a5038173670af024009991ec1956df302c079c68ca3bd8473c2449eb6a47. The original retained audit passed with receipt 10ecc958f3e6d575654343a3af84ecad0efc514c511cee56aaad2fe53e1ee7dd. Curation excludes only large local source bundles/temporary indexes; actual supporting build Git objects remain included. Inspect the complete ZIP inventory before extraction:

```powershell
& docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/source-authority/ORCH-AUTH-01-C6b/evidence/retained-evidence.zip -ExpectedSha256 ce14a5038173670af024009991ec1956df302c079c68ca3bd8473c2449eb6a47 -Destination (Join-Path (Get-Location).Path 'artifacts/c6b-fresh-extraction')
```

Then run from an exact checkout of this increment:

```powershell
pnpm exec tsx docs/source-authority/ORCH-AUTH-01-C6b/audit.ts artifacts/c6b-fresh-extraction artifacts/c6b-fresh-audit
```

The auditor checks current implementation pins, unchanged active authority/history, actual supporting Git objects, every retained raw file and command-owned receipt, complete test reports, failed attempts and owned VM cleanup. Unit identity reconciliation preserves the original 1043-observation multiset plus 46 source-reader additions. It does not close the separate candidate exactly-once obligation: the existing host-discovery table still has three same-name rows.

## Continuing obligations

Historical WP6e remains BLOCKED at e590e38c32de2b5baa7423f66bbd8a0230b61839. Root-unit success does not establish unit-domain success. Neither this reader increment nor its audit activates approved ORCH-AUTH-01 r2 or supplies readiness, native full-platform qualification, human acceptance, candidate verification, committed mutations 5(a)/5(b), or WP6f interpretation.

The first seal deliberately records the partial repair-cohort observation that existed at curation: four jobs passed and Windows unit was running. It is not a final hosted claim. All five jobs in repair cohort 34029390274 subsequently passed; Windows completed at 12:28:42 UTC. The separate final hosted seal retains all five provider archives, original metadata and 43 independently validated child receipts. Its actual hosted audit receipt is d70bbbac52835c1f1d09ebba1abe3a10a5f72b12ea3eeee4dea067804b16e836. Both native hosted controller suites passed 869 cases and both hosted root-unit suites passed 1043 cases. This remains distinct from native full public-workflow qualification. After safe inspection/extraction of the final hosted seal, reproduce with audit-hosted.ts, its input directory, c708945e4ba8e0b75f09bc9e564b4afc5cb47a0a, 34029390274 and a fresh output directory.

Obtain all five exact C6b outcomes as a separate post-commit obligation. The unchanged workflow cancels a previous same-ref run on push; preserve every required cohort before pushing a successor. audit-hosted.ts requires all five final provider artifacts and cannot promote a pending job to success.

Continue with complete source-generation readers, separately committed request, real independent review, existing lease, fsynced exclusive intent and recoverable coherent publication. Then execute the real clean candidate/four partitions/65-minute provider boundary and committed rejection mutations. Keep the user's untracked roadmap outside commits and all source state absent. The active plan owns the next concrete action; this precursor is not a stopping point.
