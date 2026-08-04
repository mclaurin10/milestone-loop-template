# Worked example: Ski Tycoon

The battle-tested configuration this template was extracted from — an
autonomous loop building a deterministic ski-resort simulation game in a pnpm
monorepo (`packages/{foundation,protocol,simulation,persistence,ui,renderer}`,
`apps/{web,headless}`).

These files are **reference material only**; nothing in the template loads
them. Game-specific vocabulary in this directory is intentional.

| File | What it demonstrates |
| --- | --- |
| `default.json` | A filled `project` profile: real product name, authority file (`SKI_TYCOON_GOAL.md`), and an eight-category vertical-spine keyword policy (lifts, trails, guests, pricing, weather, staff, transport, environment) with a ≥4-category breadth trip-wire. |
| `verification-scope-policy.json` | A full shadow scope policy for a ten-package workspace: per-trigger mandatory check sets built from thirteen project verify scripts, per-package workspace checks, and `browserHostScriptPatterns` enumerating the repo's browser-verification scripts. |
| `invariant-suite.json` | Nine commissioned invariants pinning determinism, canonical encoding, save/replay integrity, Node/Worker parity, and protocol compatibility to exact owner files and exact test titles. |
| `slow-suite-registry.json` | Five explicit persistence-migration suites carved out of the fast unit partition. |
| `benchmark-matrix.json` | Real benchmark classes with repo paths, plus the `historical` check-id sets reproducing the pre-selection verification workload for the paired benchmark. |
| `loop-recommissioning-verification.json` | A complete verification manifest: twenty focused commands with tiers and expected artifact kinds, protected paths, and the exact-closure contract. |

Note: `default.json` is shown in the current 1.3.0 schema (with the `project`
section this template introduced); the remaining files are verbatim from the
source repository at commit `8928aecc19e8d3ade663063e0ed41740483774e3`.
