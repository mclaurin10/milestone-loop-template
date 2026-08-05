import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, resolve } from "node:path";

import type {
  CommandExecutionSummary,
  VerificationCommand,
} from "./contracts.js";
import { assertSafeVerificationCommand } from "./command-policy.js";
import { redactSensitiveText, safeAgentEnvironment } from "./redaction.js";
import type {
  CommandTelemetryMeasurement,
  TelemetryStore,
} from "./telemetry-store.js";
import type {
  TelemetryCandidate,
  TelemetryFailureClassification,
  TelemetryPhase,
} from "./telemetry-contracts.js";

export function resolvePnpmScript(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = environment["npm_execpath"];
  if (explicit && /pnpm(?:\.[cm]?js)?$/i.test(explicit) && existsSync(explicit))
    return explicit;
  for (const entry of (environment["PATH"] ?? "").split(delimiter)) {
    if (!entry) continue;
    const candidate = resolve(entry, "node_modules", "pnpm", "bin", "pnpm.cjs");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function invocation(command: VerificationCommand): {
  readonly executable: string;
  readonly args: readonly string[];
} {
  if (command.executable === "node")
    return { executable: process.execPath, args: command.args };
  if (command.executable === "git")
    return { executable: "git", args: command.args };
  const pnpmPath = resolvePnpmScript();
  if (pnpmPath)
    return { executable: process.execPath, args: [pnpmPath, ...command.args] };
  if (process.platform === "win32")
    throw new Error(
      "Safe pnpm argv execution on Windows could not resolve a pnpm JavaScript entry from npm_execpath or PATH.",
    );
  return { executable: "pnpm", args: command.args };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const RUNNER_RECEIPT_ABSENCE_REASON =
  "Receipt validation is owned by the verification caller.";

export interface CommandRunnerOptions {
  readonly workingDirectory: string;
  readonly artifactDirectory: string;
  readonly timeoutMs: number;
  readonly extraEnvironment?: Readonly<Record<string, string>>;
  readonly trustedControllerCommand?: boolean;
  readonly telemetry?: {
    readonly store: Pick<TelemetryStore, "recordCommand">;
    readonly phase?: TelemetryPhase;
    readonly candidate?: TelemetryCandidate | null;
    readonly checkSetId?: string | null;
    readonly selectedCheckIds?: readonly string[];
    readonly actualCheckIds?: readonly string[];
    readonly retryAttempt?: number | null;
    readonly failureClassification?: TelemetryFailureClassification | null;
  };
}

async function recordTelemetry(
  command: VerificationCommand,
  options: CommandRunnerOptions,
  summary: CommandExecutionSummary,
  startedMonotonic: bigint,
  finishedMonotonic: bigint,
): Promise<CommandExecutionSummary> {
  if (!options.telemetry) return summary;
  const measurement: CommandTelemetryMeasurement = {
    commandId: command.id,
    argv: [command.executable, ...command.args],
    phase: options.telemetry.phase ?? "verification",
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    durationNanoseconds: (finishedMonotonic - startedMonotonic).toString(),
    status: summary.status,
    exitCode: summary.exitCode,
    signal: summary.signal,
    candidate: options.telemetry.candidate ?? null,
    checkSetId: options.telemetry.checkSetId ?? null,
    selectedCheckIds: options.telemetry.selectedCheckIds ?? [command.id],
    actualCheckIds: options.telemetry.actualCheckIds ?? [command.id],
    retryAttempt: options.telemetry.retryAttempt ?? null,
    failureClassification:
      options.telemetry.failureClassification ??
      (summary.status === "TIMEOUT"
        ? "timeout"
        : summary.status === "ERROR"
          ? "infrastructure"
          : summary.status === "FAIL"
            ? "unknown"
            : null),
    reason: summary.message,
  };
  try {
    await options.telemetry.store.recordCommand(measurement);
    return summary;
  } catch (error) {
    const message = redactSensitiveText(
      error instanceof Error ? error.message : String(error),
    );
    process.stderr.write(
      `[telemetry] non-semantic failure for ${command.id}: ${message}\n`,
    );
    return {
      ...summary,
      telemetryError: `Telemetry write failed for ${command.id}: ${message}`,
    };
  }
}

export async function runCommand(
  command: VerificationCommand,
  options: CommandRunnerOptions,
): Promise<CommandExecutionSummary> {
  const startedMonotonic = process.hrtime.bigint();
  await mkdir(options.artifactDirectory, { recursive: true });
  const startedAt = new Date();
  const stdoutPath = resolve(
    options.artifactDirectory,
    `${command.id}.stdout.log`,
  );
  const stderrPath = resolve(
    options.artifactDirectory,
    `${command.id}.stderr.log`,
  );
  let resolved;
  try {
    if (!options.trustedControllerCommand)
      assertSafeVerificationCommand(command);
    resolved = invocation(command);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(stdoutPath, "", "utf8");
    await writeFile(stderrPath, `${redactSensitiveText(message)}\n`, "utf8");
    const finishedAt = new Date();
    const summary: CommandExecutionSummary = {
      id: command.id,
      displayCommand: `${command.executable} ${command.args.join(" ")}`,
      status: "ERROR",
      exitCode: null,
      signal: null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      stdoutPath,
      stderrPath,
      stdoutSha256: hash(""),
      stderrSha256: hash(`${redactSensitiveText(message)}\n`),
      parser: command.parser,
      parsedArtifactPath: null,
      message: redactSensitiveText(message),
      receipt: null,
      receiptAbsenceReason: RUNNER_RECEIPT_ABSENCE_REASON,
    };
    return recordTelemetry(
      command,
      options,
      summary,
      startedMonotonic,
      process.hrtime.bigint(),
    );
  }
  return new Promise((resolveResult) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let spawnError: Error | null = null;
    let timedOut = false;
    const child = spawn(resolved.executable, resolved.args, {
      cwd: options.workingDirectory,
      env: {
        ...safeAgentEnvironment(),
        ...options.extraEnvironment,
        ...(options.telemetry ? { LOOP_TELEMETRY_PARENT_MANAGED: "1" } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => {
      spawnError = error;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, command.timeoutMs ?? options.timeoutMs);
    child.once("close", async (exitCode, signal) => {
      clearTimeout(timeout);
      const finishedAt = new Date();
      const stdoutText = redactSensitiveText(
        Buffer.concat(stdout).toString("utf8"),
      );
      const stderrText = redactSensitiveText(
        Buffer.concat(stderr).toString("utf8"),
      );
      await writeFile(stdoutPath, stdoutText, "utf8");
      await writeFile(stderrPath, stderrText, "utf8");
      const status = spawnError
        ? "ERROR"
        : timedOut
          ? "TIMEOUT"
          : exitCode === 0
            ? "PASS"
            : "FAIL";
      const summary: CommandExecutionSummary = {
        id: command.id,
        displayCommand: `${command.executable} ${command.args.join(" ")}`,
        status,
        exitCode,
        signal,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stdoutPath,
        stderrPath,
        stdoutSha256: hash(stdoutText),
        stderrSha256: hash(stderrText),
        parser: command.parser,
        parsedArtifactPath: null,
        message: spawnError
          ? `Could not start command: ${spawnError.message}`
          : timedOut
            ? `Command timed out after ${command.timeoutMs ?? options.timeoutMs} ms.`
            : exitCode === 0
              ? "Command exited zero."
              : `Command exited ${exitCode}${signal ? ` with signal ${signal}` : ""}.`,
        receipt: null,
        receiptAbsenceReason: RUNNER_RECEIPT_ABSENCE_REASON,
      };
      resolveResult(
        await recordTelemetry(
          command,
          options,
          summary,
          startedMonotonic,
          process.hrtime.bigint(),
        ),
      );
    });
  });
}
