import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";

export const SYNCHRONOUS_COMMAND_TIMEOUT_MS = 30_000;

interface BoundedSpawnSyncOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
  readonly maxBuffer?: number;
  readonly timeoutMs?: number;
}

export function spawnBoundedSync(
  command: string,
  args: readonly string[],
  options: BoundedSpawnSyncOptions = {},
): SpawnSyncReturns<string> {
  const timeoutMs = options.timeoutMs ?? SYNCHRONOUS_COMMAND_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("Synchronous command timeout must be a positive integer.");
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    killSignal: "SIGKILL",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
    ...(options.env ? { env: options.env } : {}),
    ...(options.input === undefined ? {} : { input: options.input }),
  };
  const result = spawnSync(command, [...args], spawnOptions);
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    const description = `${command} ${args.join(" ")}`.trim();
    throw new Error(
      code === "ETIMEDOUT"
        ? `Synchronous command timed out after ${timeoutMs} ms: ${description}`
        : `Synchronous command could not execute (${description}): ${result.error.message}`,
      { cause: result.error },
    );
  }
  return result;
}
