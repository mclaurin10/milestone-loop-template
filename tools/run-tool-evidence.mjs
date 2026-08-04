import { relative, resolve } from "node:path";

import {
  assertCommandPassed,
  beginDirectTelemetry,
  commandIdentity,
  describeResult,
  evidenceContext,
  finishDirectTelemetry,
  runPnpm,
  writeJson,
  writeReceipt,
} from "./evidence.mjs";
import { runWorkspaceTypecheck } from "./workspace-typecheck.mjs";

const mode = process.argv[2];
const definitions = {
  format: {
    stageId: "format-lint",
    commandId: "format:check",
    kind: "format-report",
    commands: [
      [
        "exec",
        "prettier",
        "--check",
        "scripts",
        "tools",
        "eslint.config.mjs",
        "package.json",
        "pnpm-workspace.yaml",
        "tsconfig.base.json",
        "tsconfig.tools.json",
        "vitest.config.ts",
      ],
    ],
  },
  lint: {
    stageId: "format-lint",
    commandId: "lint",
    kind: "lint-report",
    commands: [["exec", "eslint", "scripts", "tools", "vitest.config.ts"]],
  },
  typecheck: {
    stageId: "typecheck",
    commandId: "typecheck",
    kind: "typecheck-report",
    commands: [],
  },
  build: {
    stageId: "production-build",
    commandId: "build",
    kind: "build-report",
    commands: [],
  },
  test: {
    stageId: "bootstrap-tests",
    commandId: "test:unit",
    kind: "vitest-report",
    commands: [],
  },
  orchestrator: {
    stageId: "verification-tier-milestone",
    commandId: "test-orchestrator",
    kind: "orchestrator-vitest-report",
    commands: [],
  },
};

const definition = definitions[mode];
if (!definition) {
  process.stderr.write(`Unknown evidence tool mode: ${mode ?? "(missing)"}\n`);
  process.exitCode = 64;
} else {
  let telemetry = null;
  try {
    const context = await evidenceContext(
      definition.stageId,
      definition.commandId,
    );
    telemetry = await beginDirectTelemetry(context, {
      phase: "verification",
      eventType: `${mode}-evidence`,
      argv: ["pnpm", definition.commandId],
      checkSetId: definition.stageId,
    });
    const reportPath = resolve(
      context.artifactDirectory,
      `${mode}-report.json`,
    );
    const vitestMode = mode === "test" || mode === "orchestrator";
    if (vitestMode) {
      definition.commands.push([
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.config.ts",
        ...(mode === "orchestrator" ? ["tools/milestone-orchestrator"] : []),
        "--fileParallelism=false",
        "--reporter=json",
        `--outputFile=${reportPath}`,
      ]);
    }
    const results = [];
    if (mode === "typecheck") {
      results.push(runWorkspaceTypecheck(context.repositoryRoot));
    }
    for (const args of definition.commands) {
      const result = runPnpm(args);
      results.push(describeResult(result));
      assertCommandPassed(result, `${mode} command`);
    }
    if (!vitestMode) {
      const report = {
        schemaVersion: "1.0.0",
        status: "PASS",
        mode,
        identity: commandIdentity(),
        commands: results,
      };
      await writeJson(reportPath, report);
    }
    await writeReceipt(
      context,
      [
        {
          id: `${mode}-tool-executed`,
          summary: `${mode} completed through the pinned production tool boundary.`,
        },
      ],
      [{ path: `${mode}-report.json`, kind: definition.kind }],
    );
    const { readFile } = await import("node:fs/promises");
    const reportContents = await readFile(reportPath);
    const receiptContents = await readFile(
      resolve(context.artifactDirectory, "result.json"),
    );
    let tests = null;
    if (vitestMode) {
      const parsed = JSON.parse(reportContents.toString("utf8"));
      tests = {
        suites: {
          total: parsed.numTotalTestSuites,
          passed: parsed.numPassedTestSuites,
          failed: parsed.numFailedTestSuites,
          skipped: parsed.numPendingTestSuites,
        },
        tests: {
          total: parsed.numTotalTests,
          passed: parsed.numPassedTests,
          failed: parsed.numFailedTests,
          skipped: parsed.numPendingTests,
        },
      };
    }
    await finishDirectTelemetry(telemetry, {
      status: "PASS",
      exitCode: 0,
      tests,
      artifacts: {
        fileCount: 2,
        totalBytes: reportContents.byteLength + receiptContents.byteLength,
        manifestReferences: [
          relative(context.repositoryRoot, reportPath).replaceAll("\\", "/"),
        ],
        receiptReferences: [
          relative(
            context.repositoryRoot,
            resolve(context.artifactDirectory, "result.json"),
          ).replaceAll("\\", "/"),
        ],
      },
    });
    process.stdout.write(`${mode} evidence: ${reportPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (telemetry) {
      try {
        await finishDirectTelemetry(telemetry, {
          status: "ERROR",
          reason: message,
          exitCode: 1,
        });
      } catch (telemetryError) {
        process.stderr.write(
          `Telemetry finalization failed: ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}\n`,
        );
      }
    }
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
