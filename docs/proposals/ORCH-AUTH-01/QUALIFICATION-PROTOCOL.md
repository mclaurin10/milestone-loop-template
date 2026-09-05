# Source qualification protocol proposed for approval

This is required implementation, not a claim about the current harness. Its purpose is to test a controller that launches containers without giving its candidate containers a Docker socket, network access or host execution fallback.

## Invocation and trust

One literal source `pnpm verify` call on an authorized disposable qualification coordinator creates a fresh invocation nonce after independently validating the clean source commit/tree, authority epoch, commissioned contract and command registry. The coordinator and its provider credentials are outside candidate control. A candidate cannot create or approve a qualifier by supplying a JSON file, environment variable, URL or command-line scope override. The maintainer's configured provider allowlist and actual hosted/VM job identity are trust inputs.

The coordinator freezes the source inputs and dispatches native Windows and Linux jobs. Each job records the controller host identity separately from the inner OCI execution identity. The controller under qualification runs on the disposable host; its Worker/candidate commands use the existing attested container policy. No unrelated checkout or user secret is available to that host. Network needed for trusted provisioning/provider transport is separate from candidate execution, whose network remains denied.

The current five protected CI jobs remain mandatory. Added qualifier jobs must be on suitably isolated, supported native environments and pass the real container-policy checks. WSL is a local Linux route only. A Windows unit job or an invented Windows label on a Linux job is insufficient.

## Acyclic execution

1. Prepare two independent clean release builds on each native platform. Install/extract and exercise their actual public consumers. Compare all portable payload inventories.
2. Run the source stage commands and the eight public controller domain workflows on those native hosts. Controller workflows operate on the explicitly bounded target fixture, which verifies its own complete contract. Generated adopters run their original bootstrap contract. Neither fixture requests source readiness.
3. Collect producer-owned receipts, raw workflow observations, complete failure/publication variants and source/fixture identities. Run the source static/invariant/partition and candidate-tier boundaries in their required sandboxes. An inner source command needing qualification evidence audits the bundle described below; it cannot recursively start the outer qualifier.
4. Independently evaluate every requirement, metric, platform and provenance predicate. Emit the source no-argument result only after the matrix is complete. There is no circular requirement for a job to consume its own future readiness result. Partial job outcomes are observations, not source completion receipts.

The qualification jobs execute the complete required observations on both native platforms. The source gate requires one complete coordinated no-argument invocation; it does not require two mutually dependent standalone readiness results. Repeating the full invocation creates a new nonce and fresh producer runs. No previous same-commit completion evidence is reused.

## Read-only evidence handoff to a candidate command

The outer trusted coordinator dispatches any required workflow jobs before launching the consuming source candidate stage. It captures the job/provider identity and approved source inputs directly through the trusted provider, verifies the returned artifact archive and rejects an unexpected source, fixture, nonce, stage set, command, image or job conclusion. It then publishes a bounded immutable input bundle through a typed read-only task-input channel. Use regular files under the existing contained input mechanism; any necessary new channel implementation must retain the same mount/path/network/capability restrictions. Arbitrary mount additions are not authorized.

The envelope contains a versioned schema, revision/contract/epoch, invocation nonce, exact source commit/tree and authority hashes, release payload digest, native platform/host identity, provider run/job identity, inner container image/policy identity, producer stage/command identity, fixture authority/candidate identity, and path/size/SHA-256 inventory for all observations. File paths are relative, unique and contained; links, traversal, unexpected files and exceeded configured bounds reject. The independent outer record pins the envelope digest. Candidate-supplied envelope copies cannot authenticate themselves.

The consuming command reads the delivered regular files, validates every required receipt and its actual artifact bytes, checks before/after state/ref/process observations and scenario coverage, and writes its own receipt for that audit. It retains links to the original producer receipts and clearly declares remote production versus local inspection. The outer verifier independently repeats the binding, artifact and completeness checks against its directly obtained provider record before accepting the child result. Merely echoing an attestation or generating missing observations is a failure.

Tests must reach and reject forged coordinator identity, a replaced input bundle, a stale nonce, another source/fixture, an omitted platform or failure variant, an ineligible provider, a missing receipt despite exit zero, changed input while the command runs, and a candidate-written approval. They must also demonstrate a successful real producer-to-consumer-to-outer-validation path. Missing transport or authentication support stays NOT_READY. No undocumented environment bypass, host fallback, nested privileged container or Docker socket mount is permitted.

## Claims and implementation boundary

This protocol adds trusted qualification coordination and scope-aware evidence consumption; it does not yet exist in the source. Implement it in bounded reviewed increments alongside the legacy verifier, with regression evidence for unchanged protected behavior. It creates no new universal provider authorization or new completion profile. The fixture scope and all source claims remain those in the proposed authority. Human/live-agent acceptance is still separate and cannot be manufactured by the coordinator.
