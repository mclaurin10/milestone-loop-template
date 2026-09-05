# Source check design, command surface and tradeoffs

This is a proposed source-only contract. Commands below are implementation targets, not commands claimed to exist or pass today. Exact outcomes are frozen in the proposed goal/prose/manifest; this document explains implementation boundaries and migration impact.

## Claim matrix

| Record | What it may establish | What remains separately required |
| --- | --- | --- |
| loop:authority:migrate | `tsx tools/milestone-orchestrator/src/authority-migration-cli.ts` | Maintainer-only exact approved authority/commissioning transition; not a verification stage |
| Proposal consistency audit | Complete mapping and unchanged baseline; exact review bytes | Human approval and every implementation/qualification result |
| Source unit/regression report | Specified tests passed at the source candidate | Public workflow observations, distribution smoke, containment and source gates |
| Deterministic orchestration workflow | Actual controller boundary behavior for enumerated inputs | Live agent workflow and human outcome review; no general coding-quality claim |
| Generated adopter bootstrap | That adopter's technical build, deterministic kernel, persistence and browser scaffold | Its product systems, domain breadth, product readiness and human acceptance |
| ORCH-AUTONOMOUS-READINESS-01 | Exact distribution is machine-qualified across the required source workflows/platforms | ORCH-HUMAN-ACCEPT-01 |
| ORCH-HUMAN-ACCEPT-01 | The maintainer accepted the real supported source/operator workflow | Every downstream product gate and every other release digest |
| Existing WP6 record | Only its original candidate, procedure and claim | No retroactive source readiness or WP6e/WP6f completion |

## Command and stage definitions

Keep `pnpm verify`, `pnpm build`, `pnpm test:unit`, the four partition scripts, original diagnostic scripts, and all their existing argv strings. Add these package commands after approval:

| New package script | Exact proposed argv | Purpose |
| --- | --- | --- |
| build:production | `node tools/source-release.mjs build` | Reproducible portable distribution and external generation/commissioning smoke |
| verify:source-dependencies | `node tools/source-release.mjs dependencies` | Exact runtime/lock/store/installed graph and actual release dependency closure |
| lint:source-architecture | `tsx tools/milestone-orchestrator/src/source-qualification-cli.ts architecture` | Actual import/entrypoint boundaries; protected controller and downstream isolation |
| test:orchestration-domain | `tsx tools/milestone-orchestrator/src/source-qualification-cli.ts domain` | All eight public workflow domains and sixteen failure families |
| verify:source-parity | `tsx tools/milestone-orchestrator/src/source-qualification-cli.ts parity` | Repeated canonical controller traces, persistence/recovery and cross-platform comparison |
| verify:adopter-bootstrap | `tsx tools/milestone-orchestrator/src/source-qualification-cli.ts adopter` | Two real generated adopters per platform, complete bootstrap and claim fencing |
| verify:source-bounds | `tsx tools/milestone-orchestrator/src/source-qualification-cli.ts bounds` | Actual resource, output, drain, descendant and deadline enforcement |
| verify:source-acceptance | `tsx tools/milestone-orchestrator/src/source-qualification-cli.ts evaluate` | Independent typed evidence aggregation, without generating missing observations |

Add `milestoneLoop.productionBuild = {"script":"build:production","outputRoots":["dist"]}` and `milestoneLoop.verification.contractId = "milestone-loop-orchestrator-source.v1"`. Default profile stays `readiness`; the permanent marker is unchanged. The exact additions also appear in `proposed/source-command-contract.json`.

The source-only ordered stage registry is: `environment`, `contract-integrity`, `format-lint`, `typecheck`, `production-build`, `unit`, `orchestration-domain`, `orchestration-parity`, `adopter-bootstrap`, `resource-bounds`, `source-acceptance`. The first and third stages use the new real source dependency/architecture checks plus existing static commands. `unit` uses the complete existing `test:unit`. No source stage is implemented as a placeholder or an unconditional receipt wrapper.

Retain the unchanged nine-stage bootstrap and fifteen-stage legacy downstream readiness registries in versioned code. A strict source dispatcher and every parser/gate/Doctor/Status consumer must select scope using the commissioned, authority-anchored contract ID, never a CLI override or guessed project identity. Introduce a new result/schema version rather than making old result fields imply new semantics. Source results include source contract/epoch, source candidate, fixture candidates, qualifier run identity and claim scope. Cross-scope evidence must be rejected before its PASS field is evaluated.

The new source commissioned candidate schedule keeps invariants first, existing static checks, build and all four owner partitions once, then the new source domain/parity/adopter/bounds commands. It removes the old product-domain placeholders from source scheduling through the separately approved commissioning migration. Source iteration retains invariants plus explicitly selected source checks; milestone performs fresh exact source closure; periodic remains literal exact closure. The new source scope policy covers each old trigger with an explicit source-domain mapping and fail-broad fallback, while leaving scope suppression disabled. Migration acceptance requires executed before/after projections and no loss of protected-floor, ownership, receipt, review or integration safeguards. These are new-epoch projections, not modifications to WP6e's historical v2 evidence.

## Qualification topology and privileged boundaries

The source product is the controller itself, so its domain qualification includes launching disposable candidate containers. It must run on a maintainer-authorized disposable qualification host/VM or ephemeral CI runner with no unrelated projects or user secrets. The tested controller is the control plane on that isolated host; its candidate children run in the attested OCI provider. Never solve nested-container access by mounting Docker's socket into a candidate or weakening network/mount/capability policy. No candidate-authored claim may attest its own provider or independent review.

A trusted qualification coordinator freezes the source commit and an invocation nonce, dispatches fresh native Windows/Linux jobs, binds every child artifact to that same qualification identity and exact release digest, and independently checks run/job metadata and archive/receipt hashes. One fresh literal no-argument source `pnpm verify` invocation owns that complete matrix. Native jobs run the required stage/workflow commands without recursively running source readiness. A local source-stage PASS is an observation; the source readiness claim stays ineligible until all required platform and provider records are validated. Previous same-commit runs cannot be recycled as fresh exact completion. A control-plane host record and each inner candidate's OCI record are distinct; raw host execution is never mislabeled as `trusted-container`. The [qualification protocol](QUALIFICATION-PROTOCOL.md) defines the trusted dispatch, read-only evidence handoff and independent aggregation required before this can work inside source candidate verification.

Both native Windows and Linux need actual successful orchestration workflows and correctly reached failure boundaries under a real supported provider. Current five-job CI is retained, but its controller unit suites alone do not satisfy these new public-workflow gates. A new source-qualification lane and, if necessary, a qualified disposable Windows host with a Linux-container provider are additional implementation work. WSL/Linux tests cannot fill a missing native Windows row. Unsupported or unavailable provider routing remains NOT_READY. Qualifier attestation/scoping and fixture transport are new explicit features to implement and test, not an assertion that the current harness already supplies them.

The full source gate does not recursively run itself in every fixture. Generated fixtures run their own bootstrap contract, and orchestration fixtures have an explicit bounded fixture authority/verification contract. Their successful commands and controller transitions remain real; their product content is deliberately small and is never counted as completed downstream product scope.

## Why these checks and costs

- Build qualification tests the artifact a maintainer receives and its actual external consumer. It catches omitted runtime/schema/assets and accidental source-checkout dependencies that successful unit/type checks miss. Shipping the current TS/tsx runtime avoids inventing a compiled SDK/publication product; consumers still need exact Node/pnpm and a frozen install.
- Eight domain workflows cover the product's entire lifecycle. Fault points come from registered durable publication boundaries, so later added boundaries cannot silently evade recovery coverage.
- All sixteen failure families must be correct. This replaces the source's undefined 99% metric with reproducible qualification, and explicitly gives up any statistical field-reliability claim. More test count is not accepted as more domain coverage.
- Resource limits are existing enforceable safety bounds, not a new speed target. The old 16.6 frame-time threshold is retired from source applicability. WP6f's measurements/noise/optimization decision are untouched.
- Source game bots and seed success gates are retired rather than renamed to developer agents. Downstream custody, supplied adopter authority and product gates remain independent. There is no new source hidden-seed generalization claim.
- Machine qualification uses deterministic role transports for reproducibility, with real production rules and independent role processes. The live human gate catches installation, transport, usability and outcome gaps that deterministic fixtures cannot establish; credentials/service availability can delay human acceptance but cannot be faked.
- The stronger release workflow matrix adds build, Git/process/container and native-platform cost. It may take longer than current unit-heavy verification. Missing new stages remain non-passing; test caching, broad parallelism, scope suppression and benchmark threshold changes are not included in this approval.

## Exact supporting-text changes

The proposed AGENTS copy changes only the Authority and Verification Profiles sections to recognize the approved source epoch/claim boundaries, plus the shared-rule sentence in the operating loop. All other safeguards remain verbatim. The proposed CONTRACT copy inserts a source-scope addendum before the existing frozen-authority section; the existing contract is retained verbatim after that insertion. The old root AGENTS/CONTRACT bytes are included in the baseline hashes and the exact unified diff. Generated adopters continue to receive authority-applicable universal safeguards; generation tests must reject any leaked source contract/epoch, readiness marker or commissioning state.
