import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, unlink } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { ensureContainedDirectory } from "./path-safety.js";
import { exclusiveWriteSerialized } from "./state-store.js";

export type ControllerLeaseOperation =
  "run" | "plan" | "canary" | "reconcile" | "retention-apply";

interface ControllerLeaseOwner {
  readonly schemaVersion: "1.1.0";
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly hostInstanceId: string | null;
  readonly processStartedAt: string;
  readonly createdAt: string;
  readonly operation: ControllerLeaseOperation;
}

// processStartedAt is derived from process.uptime(), which drifts by a few
// milliseconds between reads; anything inside this window is the same process
// incarnation, anything outside it is a reused pid.
const PROCESS_START_TOLERANCE_MS = 10_000;

async function machineInstanceId(): Promise<string | null> {
  const path = join(tmpdir(), "milestone-loop-host-instance.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      instanceId?: unknown;
    };
    if (typeof parsed.instanceId === "string" && parsed.instanceId.length > 0)
      return parsed.instanceId;
    return null;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") return null;
  }
  const candidate = randomUUID();
  try {
    const outcome = await exclusiveWriteSerialized(
      path,
      `${JSON.stringify({ schemaVersion: "1.0.0", instanceId: candidate })}\n`,
    );
    if (outcome === "created") return candidate;
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      instanceId?: unknown;
    };
    return typeof parsed.instanceId === "string" && parsed.instanceId.length > 0
      ? parsed.instanceId
      : null;
  } catch {
    return null;
  }
}

export interface ControllerLeaseInspection {
  readonly path: string;
  readonly present: boolean;
  readonly malformed: boolean;
  readonly owner: {
    readonly pid: number | null;
    readonly hostname: string | null;
    readonly operation: string | null;
    readonly createdAt: string | null;
  } | null;
}

function errorCode(error: unknown): string | null {
  return error instanceof Error && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : null;
}

function manualRemedy(path: string): string {
  return `If that controller is dead, delete ${path} manually.`;
}

export async function releaseLeaseWithoutMasking(
  release: () => Promise<void>,
  operationFailed: boolean,
): Promise<void> {
  try {
    await release();
  } catch (releaseError) {
    if (!operationFailed) throw releaseError;
    process.stderr.write(
      `Controller lease release failed after an operation error: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}\n`,
    );
  }
}

export class ControllerLease {
  private constructor(
    readonly path: string,
    private readonly token: string,
  ) {}

  static leasePath(repositoryRoot: string, statePath: string): string {
    return resolve(
      dirname(resolve(repositoryRoot, statePath)),
      "controller.lease",
    );
  }

  static async acquire(input: {
    readonly repositoryRoot: string;
    readonly statePath: string;
    readonly operation: ControllerLeaseOperation;
  }): Promise<ControllerLease> {
    const directory = dirname(resolve(input.repositoryRoot, input.statePath));
    await ensureContainedDirectory(input.repositoryRoot, directory);
    const path = resolve(directory, "controller.lease");
    const token = randomUUID();
    const owner: ControllerLeaseOwner = {
      schemaVersion: "1.1.0",
      token,
      pid: process.pid,
      hostname: hostname(),
      hostInstanceId: await machineInstanceId(),
      processStartedAt: new Date(
        Date.now() - process.uptime() * 1000,
      ).toISOString(),
      createdAt: new Date().toISOString(),
      operation: input.operation,
    };
    const serialized = `${JSON.stringify(owner)}\n`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const published = await exclusiveWriteSerialized(path, serialized);
      if (published === "created") return new ControllerLease(path, token);
      let raw: string;
      try {
        const metadata = await lstat(path);
        if (!metadata.isFile() || metadata.isSymbolicLink())
          throw new Error("The controller lease is not a regular file.");
        raw = await readFile(path, "utf8");
      } catch (error) {
        // The holder released (or a racing recovery finished) between our
        // publish attempt and this inspection; retry the exclusive publish.
        if (errorCode(error) === "ENOENT") continue;
        throw error;
      }
      let existing: Partial<ControllerLeaseOwner>;
      try {
        existing = JSON.parse(raw) as Partial<ControllerLeaseOwner>;
      } catch (parseError) {
        throw new Error(
          `The controller lease file is malformed: ${path}. Verify no controller is running, then delete it manually.`,
          { cause: parseError },
        );
      }
      if (
        !Number.isSafeInteger(existing.pid) ||
        typeof existing.hostname !== "string"
      )
        throw new Error(
          `The controller lease file is malformed: ${path}. Verify no controller is running, then delete it manually.`,
        );
      const describeOwner = `pid ${existing.pid} on ${existing.hostname} (operation ${existing.operation ?? "unknown"}, created ${existing.createdAt ?? "unknown"}, process started ${existing.processStartedAt ?? "unknown"})`;
      const sameHost =
        typeof existing.hostInstanceId === "string" &&
        owner.hostInstanceId !== null
          ? existing.hostInstanceId === owner.hostInstanceId
          : existing.hostname === hostname();
      if (!sameHost)
        throw new Error(
          `A controller on a different host holds the mutation lease: ${describeOwner}. Cross-host liveness cannot be verified. ${manualRemedy(path)}`,
        );
      let alive = true;
      try {
        process.kill(Number(existing.pid), 0);
      } catch (probeError) {
        alive = errorCode(probeError) === "EPERM";
      }
      if (alive && Number(existing.pid) === process.pid) {
        // Our own pid under a foreign token means the recorded owner died and
        // the OS reused its pid for this process; the recorded process start
        // time is the discriminator.
        const recorded = Date.parse(existing.processStartedAt ?? "");
        const ours = Date.parse(owner.processStartedAt);
        if (
          !Number.isFinite(recorded) ||
          Math.abs(ours - recorded) > PROCESS_START_TOLERANCE_MS
        )
          alive = false;
      }
      if (alive)
        throw new Error(
          `Another controller holds the mutation lease: ${describeOwner}. Wait for it to finish. ${manualRemedy(path)}`,
        );
      // Atomic takeover: exactly one recovering controller wins this rename;
      // losers observe ENOENT and retry the exclusive publish above.
      const quarantinePath = resolve(
        directory,
        `controller.lease.stale-${randomUUID()}`,
      );
      try {
        await rename(path, quarantinePath);
      } catch (renameError) {
        if (errorCode(renameError) === "ENOENT") continue;
        throw renameError;
      }
      let quarantined: string | null = null;
      try {
        quarantined = await readFile(quarantinePath, "utf8");
      } catch {
        // Unreadable quarantined bytes count as a mismatch below.
      }
      if (quarantined !== raw)
        // The lease changed between our read and our rename: a racing
        // controller recovered the stale lease and published a fresh one,
        // which this rename then captured. Renaming it back cannot be done
        // safely, so fail loudly and preserve the bytes for the operator.
        throw new Error(
          `The controller lease changed while a stale lease was being recovered; the captured lease is preserved at ${quarantinePath}. Verify no controller is running, then delete it manually.`,
        );
      await unlink(quarantinePath).catch(() => undefined);
    }
    throw new Error(
      `Cannot acquire the controller mutation lease at ${path}; racing controllers kept replacing it. Re-run the command.`,
    );
  }

  async release(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as {
        token?: unknown;
      };
      if (value.token !== this.token)
        throw new Error("Controller lease ownership changed.");
      await unlink(this.path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return;
      throw error;
    }
  }

  static async inspect(
    repositoryRoot: string,
    statePath: string,
  ): Promise<ControllerLeaseInspection> {
    const path = ControllerLease.leasePath(repositoryRoot, statePath);
    let contents: string;
    try {
      contents = await readFile(path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT")
        return { path, present: false, malformed: false, owner: null };
      throw error;
    }
    try {
      const owner = JSON.parse(contents) as Partial<ControllerLeaseOwner>;
      return {
        path,
        present: true,
        malformed: false,
        owner: {
          pid: Number.isSafeInteger(owner.pid) ? Number(owner.pid) : null,
          hostname: typeof owner.hostname === "string" ? owner.hostname : null,
          operation:
            typeof owner.operation === "string" ? owner.operation : null,
          createdAt:
            typeof owner.createdAt === "string" ? owner.createdAt : null,
        },
      };
    } catch {
      return { path, present: true, malformed: true, owner: null };
    }
  }
}
