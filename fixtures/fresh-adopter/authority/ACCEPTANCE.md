# Alpine Loop Lab Acceptance Contract

Autonomous readiness (`AUTONOMOUS-READINESS-01`) requires every validation
layer, metric, bot requirement, seed gate, and operational chain in
`evals/acceptance-manifest.json` to pass with no compensation.

The required layers are automated verification (`AUTO-01`), public-action bot
playtesting (`PLAY-01`), rendered evidence (`VIS-01`), performance budgets
(`PERF-GATE-01`), determinism and replay (`REPLAY-01`), persistence integrity
(`SAVE-01`), and operational fault recovery (`FAULT-01`). `BOT-01` through
`BOT-03` pass.

Hidden seed values remain outside the repository. After the machine gate, a
human performs `HUMAN-ACCEPT-01`; machine or bootstrap evidence never replaces
that review.
