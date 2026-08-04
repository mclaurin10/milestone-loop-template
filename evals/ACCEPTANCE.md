# Acceptance Contract (placeholder)

> Replace with your project's frozen acceptance prose, then freeze it via
> `evals/immutable-contract-lock.json`. The machine-readable twin of this
> document is `evals/acceptance-manifest.json`; the two must agree.

## Required validation layers

Autonomous readiness (`AUTONOMOUS-READINESS-01`) requires every layer below
to pass, with no compensation between requirements:

- `AUTO-01` — automated verification: format, lint, typecheck, build, unit,
  domain, and integration suites all pass through `pnpm verify`.
- `PLAY-01` — bot playtesting: user-action-only bots reach the required
  outcomes on the frozen benchmark and visible seed pools, and
  `BOT-01` through `BOT-03` pass.
- `VIS-01` — rendered evidence: the production build runs in the supported
  browser with captured screenshots, traces, and diagnostics.
- `PERF-GATE-01` — performance: the fixed reference workloads meet their
  frozen budgets.
- `REPLAY-01` — determinism: fresh, replayed, and production-worker runs
  produce canonical, byte-identical checkpoints.
- `SAVE-01` — persistence: save/load round trips converge and corrupted
  saves are atomically rejected.
- `FAULT-01` — operational faults: the required fault chains (`CHAIN-01`,
  `CHAIN-02`) recover through production rules.

## Completion metrics

The frozen completion metrics are `METRIC-01` through `METRIC-04` as defined
in the manifest, each with its frozen threshold.

## Seed pools

- Benchmark seeds: every run must succeed (`SEED-BENCH-01`).
- Visible development seeds: at least 13 of 16 runs succeed
  (`SEED-VISIBLE-01`).
- Hidden seeds: at least 16 of 20 runs succeed (`SEED-HIDDEN-01`), with zero
  catastrophic integrity failures (`SEED-HIDDEN-INTEGRITY-01`); hidden seed
  values never enter the repository.

## Human acceptance

After the machine gate passes, a human performs the scripted acceptance
review (`HUMAN-ACCEPT-01`). Machine evidence never substitutes for it.
