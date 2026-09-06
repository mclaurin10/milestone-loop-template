# Windows host-discovery fixture path repair

Exact repair cohort [34012032506](https://github.com/mclaurin10/milestone-loop-template/actions/runs/34012032506), at `827ebbf27b98fb1e2a3ea97cb5c1c0100618818d`, finished with four passing jobs and one failure. The Windows controller suite passed; its subsequent complete unit suite passed 929/937 and failed eight launch-free host-discovery cases. The Linux controller job, both adopter jobs and real Docker fixture passed. The failed cohort remains failed.

The same eight full test identities fail in a fresh native Windows reproduction when TEMP/TMP use a differently cased existing path: 32/40 passed. The production scanner correctly refuses aliases before reading launcher content; the fixture incorrectly assumed its mkdtemp spelling was canonical. Canonicalizing only the newly created owned fixture with realpath preserves every assertion, including refusal of deliberately linked/aliased launchers. No discovered executable, installer or shared package/service was invoked or changed.

The actual repository-tooling partition then passed all 128 tests in four files under the same uppercase TEMP/TMP condition. Typecheck, lint, format and all five invariants passed; invariants took 44,836 ms, with no timing claim or changed deadline. The baseline's first redirection setup failed before pnpm launched and is explicitly retained as NOT_EXECUTED. It is not the reproduced test failure.

`evidence/retained-evidence.zip` contains 113 regular files (114 archive entries, including an empty directory) and ten validated supporting receipts. Its 731,234 bytes have SHA256 `daa7575dfa33966dba915c0779475f17b4365e0506b7f087885231854b80c97d`. All five original provider ZIPs are retained and match GitHub's artifact digests. The raw hosted/local failure identities, corrected full tooling report, exact source diff and unchanged scanner are independently checked by audit.ts. Fresh pre-commit extraction/audit passed under artifacts/discovery-repair-extracted-1 and artifacts/discovery-repair-audit-1. These are retained observations, not a fresh hosted run or source readiness.

From this repair commit under Node 24.18.0/pnpm 11.15.1, extract and audit into fresh destinations:

```powershell
& docs/ci-regressions/wp6e-inventory/extract.ps1 -Archive docs/ci-regressions/host-discovery-path/evidence/retained-evidence.zip -ExpectedSha256 daa7575dfa33966dba915c0779475f17b4365e0506b7f087885231854b80c97d -Destination (Join-Path (Get-Location) 'artifacts/discovery-fresh-extraction')
pnpm exec tsx docs/ci-regressions/host-discovery-path/audit.ts artifacts/discovery-fresh-extraction artifacts/discovery-fresh-audit
```

For a fresh native Windows alias regression, set TEMP/TMP to their uppercase spellings, set LOOP_VERIFY_COMMAND_ARTIFACT_DIR to a fresh ignored directory, and invoke `pnpm exec tsx docs/ci-regressions/host-discovery-path/run-focused.ts tools/qualification-host-discovery.test.mjs`. The actual owner partition is `pnpm test:partition:repository-tooling`; its legacy standalone stage label remains supporting evidence and does not make it a real candidate-tier run.

This isolated repair starts at `91cbd3e`. Exact post-commit observations and a new five-job cohort remain post-commit work. C5's 24 paused files, two real committed supporting builds, dependency comparison, 79 affected tests and 318-file/29-receipt archive remain preserved in the primary checkout. Resume them immediately after ordinary integration. Historical WP6e stays BLOCKED at `e590e38`; approved r2 remains inactive; no source controller state/adoption, authority, protected workflow, deadline or readiness/human gate changed.
