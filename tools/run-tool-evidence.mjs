import { existsSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

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
const modeArguments = process.argv.slice(3);
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
if (mode === "invariant-vitest" || mode === "focused-verify") {
  // Parameterized receipt wrappers used by the invariant suite: they run the
  // real tool and retain a command-owned receipt so no invariant can pass on
  // exit status alone.
  let telemetry = null;
  try {
    const context = await evidenceContext("invariant-suite", mode);
    telemetry = await beginDirectTelemetry(context, {
      phase: "verification",
      eventType: `${mode}-evidence`,
      argv: ["node", "tools/run-tool-evidence.mjs", mode, ...modeArguments],
      checkSetId: context.stageId,
    });
    let tests = null;
    let artifactName;
    let artifactKind;
    let checkSummary;
    if (mode === "invariant-vitest") {
      // Registry-supplied arguments are untrusted at this boundary: only the
      // single sanctioned vitest flag may pass through (anything else - for
      // example --config= - would redirect vitest away from the pinned
      // configuration), and every file must stay inside the repository.
      const allowedFlags = new Set(["--fileParallelism=false"]);
      for (const argument of modeArguments) {
        if (argument.startsWith("--") && !allowedFlags.has(argument))
          throw new Error(
            `invariant-vitest rejects unsanctioned vitest flags: ${argument}`,
          );
      }
      const files = modeArguments.filter(
        (argument) => !argument.startsWith("--"),
      );
      if (files.length === 0)
        throw new Error(
          "invariant-vitest requires at least one .test.ts file argument.",
        );
      for (const file of files) {
        if (!file.endsWith(".test.ts"))
          throw new Error(`invariant-vitest only runs .test.ts files: ${file}`);
        const contained = relative(
          resolve(context.repositoryRoot),
          resolve(context.repositoryRoot, file),
        ).replaceAll("\\", "/");
        if (
          contained.length === 0 ||
          isAbsolute(contained) ||
          contained.split("/").includes("..")
        )
          throw new Error(
            `invariant-vitest test file escapes the repository: ${file}`,
          );
        if (!existsSync(resolve(context.repositoryRoot, file)))
          throw new Error(`invariant-vitest test file does not exist: ${file}`);
      }
      artifactName = "invariant-vitest-report.json";
      artifactKind = "invariant-vitest-report";
      const reportPath = resolve(context.artifactDirectory, artifactName);
      const result = runPnpm([
        "exec",
        "vitest",
        "run",
        ...modeArguments,
        "--reporter=json",
        `--outputFile=${reportPath}`,
      ]);
      assertCommandPassed(result, "invariant-vitest command");
      const parsed = JSON.parse(await readFile(reportPath, "utf8"));
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
      checkSummary = `Pinned invariant vitest files passed through the receipt-owning tool boundary: ${files.join(", ")}.`;
    } else {
      if (
        modeArguments.length !== 2 ||
        modeArguments[0] !== "--stage" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(modeArguments[1] ?? "")
      )
        throw new Error(
          "Usage: run-tool-evidence.mjs focused-verify --stage <id>",
        );
      const stage = modeArguments[1];
      artifactName = "focused-verify-result.json";
      artifactKind = "focused-verify-result";
      const result = runPnpm(["verify", "--", "--stage", stage]);
      assertCommandPassed(result, `focused verify stage ${stage}`);
      const matches = [
        ...String(result.stdout ?? "").matchAll(
          /^\[VERIFY\] result (artifacts[/\\][^\r\n]+[/\\]result\.json)$/gm,
        ),
      ];
      const reported = matches.at(-1)?.[1];
      if (!reported)
        throw new Error("Focused pnpm verify did not report its result path.");
      const absolute = resolve(context.repositoryRoot, reported);
      const containment = relative(context.repositoryRoot, absolute);
      if (
        !containment ||
        containment.startsWith("..") ||
        isAbsolute(containment)
      )
        throw new Error(
          `Focused verify result path escapes the repository: ${reported}`,
        );
      await copyFile(
        absolute,
        resolve(context.artifactDirectory, artifactName),
      );
      checkSummary = `Focused verify stage ${stage} passed and its authoritative result.json was retained as command-owned evidence.`;
    }
    await writeReceipt(
      context,
      [{ id: `${mode}-tool-executed`, summary: checkSummary }],
      [{ path: artifactName, kind: artifactKind }],
    );
    const artifactContents = await readFile(
      resolve(context.artifactDirectory, artifactName),
    );
    const receiptContents = await readFile(
      resolve(context.artifactDirectory, "result.json"),
    );
    try {
      await finishDirectTelemetry(telemetry, {
        status: "PASS",
        exitCode: 0,
        tests,
        artifacts: {
          fileCount: 2,
          totalBytes: artifactContents.byteLength + receiptContents.byteLength,
          manifestReferences: [
            relative(
              context.repositoryRoot,
              resolve(context.artifactDirectory, artifactName),
            ).replaceAll("\\", "/"),
          ],
          receiptReferences: [
            relative(
              context.repositoryRoot,
              resolve(context.artifactDirectory, "result.json"),
            ).replaceAll("\\", "/"),
          ],
        },
      });
    } catch (telemetryError) {
      process.stderr.write(
        `Telemetry finalization failed (non-semantic): ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}\n`,
      );
    }
    process.stdout.write(
      `${mode} evidence: ${resolve(context.artifactDirectory, artifactName)}\n`,
    );
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
} else if (!definition) {
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
    try {
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
    } catch (telemetryError) {
      process.stderr.write(
        `Telemetry finalization failed (non-semantic): ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}\n`,
      );
    }
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
