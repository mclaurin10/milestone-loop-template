import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  evidenceContext,
  writeJson,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import {
  evaluateRepositoryTestOwnership,
  formatTestOwnershipFailure,
  TEST_OWNERSHIP_REPORT_SCHEMA_VERSION,
} from "./test-ownership.js";

export async function runTestOwnershipCli(): Promise<number> {
  const context = await evidenceContext("invariant-suite", "test-ownership");
  const reportPath = resolve(
    context.artifactDirectory,
    "test-ownership-report.json",
  );
  try {
    const report = await evaluateRepositoryTestOwnership({
      repositoryRoot: context.repositoryRoot,
      artifactDirectory: resolve(context.artifactDirectory, "discovery-logs"),
    });
    await writeJson(reportPath, report);
    if (report.status !== "PASS") {
      const message = formatTestOwnershipFailure(report.diagnostics);
      await writeManualEvidenceFailure(context, {
        kind: "product",
        message,
      });
      process.stderr.write(`${message}\n`);
      return 1;
    }
    await writeReceipt(
      context,
      [
        {
          id: "repeatable-independent-discovery",
          summary: `Vitest discovery repeated deterministically across ${report.discovery.sources.length} configs and found ${report.discovery.uniqueFileCount} unique test files.`,
        },
        {
          id: "entrypoint-universe-reconciled",
          summary:
            "Package, commissioned candidate, invariant, orchestrator, and exact-runtime CI entry points reconcile with the discovered universe.",
        },
        {
          id: "exactly-one-test-owner",
          summary: `All ${report.discovery.uniqueFileCount} discovered tests have exactly one allowlisted owner across ${report.owners.length} ownership classes.`,
        },
      ],
      [
        {
          path: "test-ownership-report.json",
          kind: "test-ownership-report",
        },
      ],
    );
    process.stdout.write(
      `Test ownership passed for ${report.discovery.uniqueFileCount} files (${TEST_OWNERSHIP_REPORT_SCHEMA_VERSION}).\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(reportPath, {
      schemaVersion: TEST_OWNERSHIP_REPORT_SCHEMA_VERSION,
      status: "FAIL",
      diagnostics: [
        {
          code: "OWNERSHIP_GATE_ERROR",
          path: null,
          message,
        },
      ],
    });
    await writeManualEvidenceFailure(context, {
      kind: "infrastructure",
      message,
    });
    process.stderr.write(`Test ownership gate error: ${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url)
  process.exitCode = await runTestOwnershipCli();
