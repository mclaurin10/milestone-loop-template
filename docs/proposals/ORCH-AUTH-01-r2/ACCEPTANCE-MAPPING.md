# Complete old-to-new acceptance mapping

Every legacy manifest leaf, including each numeric threshold, required flag, freeze class and aggregate requirement string, is listed once in `acceptance-mapping.json`. The original four files/lock are copied byte-for-byte under `baseline/`. The mapping is an explicit proposed human revision, not a proof of semantic equivalence or of any passing product outcome.

| Old ID | Disposition | New source requirement | Meaning / tradeoff |
| --- | --- | --- | --- |
| AUTO-01 | semantic-replacement | ORCH-STATIC-01, ORCH-BUILD-01, ORCH-ADOPT-01, ORCH-VERIFY-01 | Source automated outcome gains real distribution/public workflows; downstream AUTO remains independently owned. |
| PLAY-01 | retired-from-source | ORCH-PLAN-01, ORCH-REVIEW-01 | Gameplay bot success ceases to apply to source. Developer-agent mechanics and live human workflow are new requirements, not equivalent gameplay evidence. |
| VIS-01 | scope-split | ORCH-ADOPT-01 | Real generated-bootstrap browser evidence stays required as compatibility; source game rendering is retired, downstream visual completion remains separate. |
| PERF-GATE-01 | semantic-replacement | ORCH-BOUNDS-01 | Source resource/deadline enforcement replaces undefined source product-performance workloads; no frame-time or WP6 improvement equivalence. |
| REPLAY-01 | scope-split | ORCH-STATE-01, ORCH-ADOPT-01 | Source canonical controller parity and generated bootstrap Node/replay/Worker parity are separate mandatory observations. |
| SAVE-01 | scope-split | ORCH-STATE-01, ORCH-RECOVERY-01, ORCH-ADOPT-01 | Controller durable state/recovery replaces source gameplay saves; adopter bootstrap continuation remains separately proved. |
| FAULT-01 | semantic-replacement | ORCH-RECOVERY-01, ORCH-CONTAIN-01, ORCH-RECONCILE-01, ORCH-RETENTION-01 | Replace undefined source product fault chains with all enumerated real orchestration boundaries; no old chain is marked passed. |
| METRIC-01 | semantic-replacement | ORCH-METRIC-COVERAGE | Undefined one core outcome becomes all twelve requirements/eight domains; this defines the source product, not a historical success. |
| METRIC-02 | semantic-replacement | ORCH-METRIC-COVERAGE | Provisional content breadth 4 becomes eight mandatory orchestration domains; original value/freeze retained in legacy snapshot. |
| METRIC-03 | semantic-replacement | ORCH-METRIC-NEGATIVE, ORCH-METRIC-INTEGRITY | Provisional 0.99 reliability becomes 16/16 family plus all variant outcomes and zero integrity violations. No statistical 99% claim. |
| METRIC-04 | retired-from-source | ORCH-METRIC-BOUNDS | Provisional 16.6 product performance number has no source frame-time meaning. Existing enforceable resource limits are a different property. |
| BOT-01 | retired-from-source | ORCH-PLAN-01, ORCH-REVIEW-01 | Original minimum 1 gameplay outcome not a source requirement. No substitution of a developer agent for a product bot. |
| BOT-02 | retired-from-source | ORCH-STATE-01 | Original provisional sustain minimum 1 retired from source; persistent controller operation is newly specified, not equivalent. |
| BOT-03 | retired-from-source | ORCH-RECOVERY-01 | Original provisional product-bot recovery minimum 1 retired from source; real controller recovery is separately specified. |
| CHAIN-01 | semantic-replacement | ORCH-RECOVERY-01 | Original unnamed product chain retained historically; enumerate all workspace/checkpoint/integration boundary variants. |
| CHAIN-02 | semantic-replacement | ORCH-RECONCILE-01, ORCH-RETENTION-01 | Original unnamed chain retained historically; real reconciliation and approved retention/cleanup define new source outcomes. |
| SEED-BENCH-01 | retired-from-source | ORCH-METRIC-COVERAGE, ORCH-METRIC-INTEGRITY | Original minimum 1, success rate 1 and zero catastrophic failures remain historical/downstream; source uses named workflows, not game seeds. |
| SEED-VISIBLE-01 | semantic-replacement | ORCH-METRIC-NEGATIVE, ORCH-METRIC-INTEGRITY | Original provisional 13/16 visible game runs replaced in source by all sixteen named negative families/all variants per platform. No gameplay equivalence. |
| SEED-HIDDEN-01 | retired-from-source | None: source requirement retired | Original 16/20 hidden-game success gate is not a source gate. Preserve exact legacy thresholds and downstream custody; no new source hidden-generalization claim. |
| SEED-HIDDEN-INTEGRITY-01 | scope-split | ORCH-METRIC-INTEGRITY, ORCH-EVIDENCE-01 | Zero source integrity violations required; downstream hidden integrity/custody remains independently enforced with no value disclosure. |
| verify_full | preserved-command-new-source-semantics | verify_source_full | Literal pnpm verify preserved; source-only registry newly scoped/anchored. Legacy bootstrap/downstream registry remains unchanged. |
| HARNESS-PROFILE-01 | preserved-safeguard-new-scope | ORCH-PROFILE-01 | Keep only bootstrap/readiness, default readiness and one-way marker; bootstrap never autonomous readiness. |
| AUTONOMOUS-READINESS-01 | new-scoped-gate | ORCH-AUTONOMOUS-READINESS-01 | Source gate gets an explicit ID/scope and all-of immutable requirements; no pass inheritance or old-epoch closure. |
| HUMAN-ACCEPT-01 | preserved-safeguard-new-scope | ORCH-HUMAN-ACCEPT-01 | Explicit human acceptance remains required, now of the source release/operator workflow; machine cannot supply it. |

## Goal sections

| Section | Old authority | Proposed meaning |
| --- | --- | --- |
| 1 | Placeholder software/completion purpose | Source distribution/controller, source machine and human gates; three distinct scopes |
| 2 | Placeholder vision | Maintainer public lifecycle and truthful diagnostics |
| 3 | Placeholder systems/breadth | Eight named domains plus release/adopter/parity/resource outcomes |
| 4 | Placeholder technical/toolchain/simulation | Existing exact pins and containment; source controller parity distinct from adopter simulation |
| 5 | Autonomous milestone loop | Preserve bounded increments, isolation, review and fail-closed integration |
| 6 | Product determinism/seeds | Source canonical state plus explicit retirement of source product seed gates; downstream custody unchanged |
| 7 | One-time calibration/provisional metrics | All source values human-revision-only; original CAL-1 unused state preserved |
| 8 | AUTONOMOUS and HUMAN gates | New source-scoped gates; AND/no-compensation and explicit human preserved |
| 9 | Placeholder non-goals | Exclude unrelated product, statistical/game/performance claims and WP6 scope changes |
| 10 | Human-only immutable authority | Exact approval digest, linked epoch snapshots, strict ancestry and recoverable migration |

## Command coverage

All 33 directly declared legacy aggregate/placeholder command names are enumerated in the JSON mapping. Literal no-argument verification and original package definitions stay available. New source-domain names prevent an existing gameplay check from being silently repurposed. Unchanged bootstrap commands retain their own registry. Existing regression assertions stay bound to legacy fixtures; no test is erased merely because its ID is retired from active source applicability.

## Calibration and custody

The original 4, 0.99, 16.6, BOT minimums, 13/16 and 16/20 thresholds retain their original bytes and freeze classes in the legacy snapshot. None is tuned via CAL-1. The new source metrics have no provisional fields. Removing source game/hidden success requirements is a disclosed scope change requiring approval; the new public workflows make no equivalent gameplay or held-out generalization claim. Downstream authority values are not silently inherited, edited or weakened.

The four old hidden-protocol controls survive as downstream custody rules in the proposed protocol: no repository/log/telemetry values, no agent requests or brute force, explicit human trigger and cooldown, aggregate-only results, and failures remaining defects. The source itself has no product seed pool.

## New outcomes without a one-to-one legacy equivalent

ORCH-BUILD-01 and ORCH-METRIC-REPRODUCIBILITY add consumed distribution/repeated-build proof; ORCH-PLAN-01, ORCH-VERIFY-01, ORCH-REVIEW-01, ORCH-STATE-01, ORCH-RECOVERY-01, ORCH-RECONCILE-01, ORCH-RETENTION-01 and ORCH-CONTAIN-01 define all eight actual orchestration domains. ORCH-ADOPT-01 explicitly fences generated bootstrap. ORCH-BOUNDS-01 adds enforceable resource/termination outcomes without a speed target. Every target ID and every old JSON leaf is mechanically checked by the proposal audit.
