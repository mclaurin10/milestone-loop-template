# Hidden Validation Protocol (placeholder)

> Replace with your project's hidden-validation protocol, then freeze it via
> `evals/immutable-contract-lock.json`.

Hidden validation runs the frozen bot benchmark against a seed pool whose
values live outside this repository, under human custody.

Rules the loop enforces regardless of project:

1. Hidden seed values never enter the repository, logs, artifacts, prompts,
   or telemetry. Agents must not request, reveal, or brute-force them.
2. Hidden validation executes only through the designated human-triggered
   procedure; `hiddenValidationEnabled` stays `false` in the orchestrator
   config until that procedure exists, and a cooldown
   (`limits.hiddenValidationCooldownMs`) bounds its frequency.
3. Results are recorded as pass/fail aggregates (`SEED-HIDDEN-01`,
   `SEED-HIDDEN-INTEGRITY-01`) without echoing seed values.
4. A hidden-validation failure is an acceptance defect: it returns the
   project to the ordinary loop; it never lowers the gate.
