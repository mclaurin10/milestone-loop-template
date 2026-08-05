import { randomUUID } from "node:crypto";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";

import { ensureContainedDirectory } from "./path-safety.js";

export type ControllerLeaseOperation =
  "run" | "plan" | "canary" | "reconcile" | "retention-apply";

interface ControllerLeaseOwner {
  readonly schemaVersion: "1.0.0";
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly processStartedAt: string;
  readonly createdAt: string;
  readonly operation: ControllerLeaseOperation;
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
      schemaVersion: "1.0.0",
      token,
      pid: process.pid,
      hostname: hostname(),
      processStartedAt: new Date(
        Date.now() - process.uptime() * 1000,
      ).toISOString(),
      createdAt: new Date().toISOString(),
      operation: input.operation,
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(path, "wx");
        try {
          await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        return new ControllerLease(path, token);
      } catch (error) {
        if (errorCode(error) !== "EEXIST" || attempt > 0) throw error;
        const metadata = await lstat(path);
        if (!metadata.isFile() || metadata.isSymbolicLink())
          throw new Error("The controller lease is not a regular file.", {
            cause: error,
          });
        let existing: Partial<ControllerLeaseOwner>;
        try {
          existing = JSON.parse(
            await readFile(path, "utf8"),
          ) as Partial<ControllerLeaseOwner>;
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
            { cause: error },
          );
        const describeOwner = `pid ${existing.pid} on ${existing.hostname} (operation ${existing.operation ?? "unknown"}, created ${existing.createdAt ?? "unknown"}, process started ${existing.processStartedAt ?? "unknown"})`;
        if (existing.hostname !== hostname())
          throw new Error(
            `A controller on a different host holds the mutation lease: ${describeOwner}. Cross-host liveness cannot be verified. ${manualRemedy(path)}`,
            { cause: error },
          );
        let alive = true;
        try {
          process.kill(Number(existing.pid), 0);
        } catch (probeError) {
          alive = errorCode(probeError) === "EPERM";
        }
        if (alive)
          throw new Error(
            `Another controller holds the mutation lease: ${describeOwner}. Wait for it to finish. ${manualRemedy(path)}`,
            { cause: error },
          );
        await unlink(path);
      }
    }
    throw new Error("Cannot acquire the controller mutation lease.");
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
