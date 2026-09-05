# Normative approval and implementation review

This document and approval-scope.json define the approval boundary for ORCH-AUTH-01.

The normative file set contains the exact proposed authority/lock/supporting contracts, legacy acceptance mapping, bounded fixture outcome contract, and authority-transition safeguards. These freeze product outcomes, public behavior, scope/identity rules, metrics, final qualification and human gates, candidate/full-verification claim boundaries, and migration trust rules.

The approval target is ORCH-AUTH-01 plus the contentDigest in review-manifest.json. That digest binds only the explicit normative file inventory, source baseline and contract/epoch. A change to a normative file, a public contract, an outcome, a safety/trust boundary or the normative file classification requires a newly reviewed approval target. Approval is still absent until a human explicitly supplies it through the maintainer approval boundary.

All other files are separately classified as historical references, advisory implementation documents or reproduction tools. They are inventoried by packageIntegrityDigest and checked for conformance. They cannot amend or override normative meaning. Conforming changes to module paths, internal command wiring, staging, provider adapters, test-driver organization, sequencing and explanatory notes can be reviewed through the normal implementation process without renewed authority approval.

The current source-command-contract.json is advisory proposed wiring. Its externally promised behavior and the existing public command spellings remain governed by the normative contracts. Reclassifying a normative file, changing a normative requirement through an advisory document, or approving a candidate-authored record is not an implementation choice.

Migration validates the approved normative digest and exact authority bytes, the current audited package/code identity, required independent review and all TRANSITION-CONTRACT.md safeguards. It does not require every later implementation note to retain its original bytes. The package integrity digest records which advisory version was inspected and is never sufficient authority approval by itself.

The proposal audit proves file integrity, mappings and machine-checkable conformance only. Human semantic review remains necessary. It must reject missing or reclassified normative files, normative changes during an advisory-only refresh, cross-scope evidence inheritance and any weakened final gate.

