# Disposable source-transition fixture cleanup

This bounded C6d-R2 repair preserves the actual failed Linux controller result at
bb312f3aa9c3708aa7e0d11d3cd682b96a4f5efa. Run 34043089595, job 101513230820,
reported 949 PASS and one FAIL among 950 controller cases. The failure was
`ENOTEMPTY` removing the disposable fixture's `.git/objects/info`, in
"exact source authority transition projection refuses an existing epoch record
even with a self-authored PASS". There was no controller PASS receipt and the
later Linux root-unit stage did not execute. The package-runtime test passed.

The captured failure does not identify the process that left the directory
nonempty. An unchanged native Windows baseline passed all 32 transition/runtime
cases; that does not reproduce or relabel the Linux failure. The seal retains
the four available provider archives as a partial snapshot; its Windows
controller result was still pending. The full cohort is collected separately
before a same-ref successor push.

The fixture now disables automatic Git housekeeping through its own clone-local
configuration as a precaution. Before recursive removal, teardown checks that
the real path is exactly its recorded owned path. Git fixtures are directly below the canonical
temporary parent with the mkdtemp prefix; the two original CLI output paths are directly below the canonical controller artifacts parent with their exact UUID-bearing prefixes. The first repaired run incorrectly rejected those two CLI paths (30 PASS/2 FAIL); that failure is retained. It uses Node's documented five retries
with 25 ms linear backoff (375 ms total delay); persistent errors still fail and
the original test deadlines are unchanged. Every original suite syntax tree,
including test identities, bodies, assertions and deadlines, is compared by the
retained auditor. No shared Git configuration or production code changes.

Sources: [pinned Node 24.18.0 filesystem API](https://nodejs.org/download/release/v24.18.0/docs/api/fs.html#fspromisesrmpath-options)
and [Git maintenance configuration](https://git-scm.com/docs/git-maintenance).

Use pinned Node 24.18.0/pnpm 11.15.1. Inspect and hash-check
`evidence/retained-evidence.zip` against `evidence/manifest.json`, then extract to
a fresh owned directory using `docs/ci-regressions/wp6e-inventory/extract.ps1`.
Run `pnpm --config.verify-deps-before-run=error exec tsx
docs/ci-regressions/source-transition-cleanup/audit.ts <extracted> <fresh-output>`.
The audit checks raw inventories, original hosted failure, separate complete
local runs, command-owned receipts, preserved authorities and actual source
publication/state/ref absence. It uses the production exported pending pathname;
the prior R1 auditor's supplemental literal pending-path spelling was incorrect,
although its production invariants remained intact. R1's sealed history is unchanged.

The repair commit's clean post-commit audit, focused selection, dependencies and
consumed production build are collected under the primary workspace's ignored
`artifacts/wp6e-source-publication-20260906/transition-cleanup-postcommit/`.
The exact new five-job hosted cohort remains a separate required observation.
This repair is not source activation, the actual candidate/four partitions,
the 65-minute provider proof, committed 5(a)/5(b), readiness or human acceptance.
Historical WP6e remains BLOCKED at e590e38; no WP6f interpretation is made.
