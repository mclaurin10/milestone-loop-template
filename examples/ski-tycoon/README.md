# Historical worked example: Ski Tycoon

This package preserves the battle-tested configuration from the deterministic
ski-resort simulation repository at source commit
`8928aecc19e8d3ade663063e0ed41740483774e3`. It demonstrates a pnpm monorepo
with `packages/{foundation,protocol,simulation,persistence,ui,renderer}` and
`apps/{web,headless}`.

The package is **historical, legacy-only reference material**. It is not an
active manifest, commissioning input, execution fixture, or fallback. The
template runtime reads `.agent/verification-manifest.json`; only the explicit
validator below may inspect this package, and that static validation never runs
the historical benchmark or unavailable source commits.

```bash
pnpm loop:example:validate -- --descriptor examples/ski-tycoon/worked-example.json
```

`worked-example.json` pins the exact package file set, byte counts, SHA-256
hashes, provenance disposition, schemas, registry links, check catalogue, and
protected-path coverage. Validation is diagnostic evidence about this package;
it is not bootstrap PASS, readiness evidence, or permission to commission the
legacy v1 manifest.

| File | Provenance | What it demonstrates |
| --- | --- | --- |
| `default.json` | Maintained compatibility adapter | A filled current-schema project profile, Ski Tycoon authority, eight-category vertical-spine policy, current supervision limits, and fail-closed trusted-provider selection. |
| `verification-scope-policy.json` | Unchanged source snapshot | A full shadow scope policy for ten workspaces, thirteen project checks, and explicit browser-host script patterns. |
| `invariant-suite.json` | Maintained compatibility adapter | Nine invariants for determinism, canonical encoding, save/replay integrity, Node/Worker parity, protocol compatibility, and mandatory command-owned receipt kinds. |
| `slow-suite-registry.json` | Unchanged source snapshot | Five persistence-migration suites separated from the fast unit partition. |
| `benchmark-matrix.json` | Unchanged source snapshot | Historical D-032 benchmark classes and pre-selection check sets. |
| `loop-recommissioning-verification.json` | Maintained compatibility adapter | The strict historical `verification-manifest.v1`, updated after extraction only to retain mandatory receipt-kind compatibility. |

The package was introduced into this template at commit
`69c1cab2726a7e75ed0f57017adf99cc4c7895d3`. Game-specific names and D-031/
D-032 identities are intentional here and must not be copied into generic
active configuration. Ordinary Git reversal of a later package change remains
the recovery path; the descriptor makes any byte-level drift explicit.
