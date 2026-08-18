import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { ensureContainedDirectory } from "./path-safety.js";
import {
  CONTROLLER_LEASE_REF,
  GitPrivateRefStore,
} from "./private-ref-store.js";
import { exclusiveWriteSerialized } from "./state-store.js";

export type ControllerLeaseOperation =
  "run" | "plan" | "canary" | "reconcile" | "retention-apply";

export interface ControllerLeaseHooks {
  readonly afterObservedExisting?: (observation: {
    readonly path: string;
    readonly objectId: string | null;
    readonly raw: string | null;
  }) => Promise<void> | void;
  readonly afterPublished?: (publication: {
    readonly path: string;
    readonly objectId: string;
  }) => Promise<void> | void;
}

interface ControllerLeaseOwner {
  readonly schemaVersion: "2.0.0";
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly hostInstanceId: string | null;
  readonly processStartedAt: string;
  readonly acquiredAt: string;
  readonly operation: ControllerLeaseOperation;
}

const OWNER_KEYS = [
  "acquiredAt",
  "hostInstanceId",
  "hostname",
  "operation",
  "pid",
  "processStartedAt",
  "schemaVersion",
  "token",
] as const;
const OPERATIONS = new Set<ControllerLeaseOperation>([
  "run",
  "plan",
  "canary",
  "reconcile",
  "retention-apply",
]);
function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const LEGACY_GUARD = serializeJson({
  schemaVersion: "2.0.0",
  mechanism: "git-private-ref",
  reference: CONTROLLER_LEASE_REF,
  token: "private-ref-protocol-guard",
  pid: 1,
  hostname: "milestone-loop-private-ref-guard.invalid",
  hostInstanceId: "milestone-loop-private-ref-guard",
  processStartedAt: "1970-01-01T00:00:00.000Z",
  createdAt: "1970-01-01T00:00:00.000Z",
  operation: "run",
});

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
  /** Compatibility path for the permanent legacy-protocol guard. */
  readonly path: string;
  readonly reference: typeof CONTROLLER_LEASE_REF;
  readonly legacyGuard: "absent" | "present" | "conflict";
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

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function parseOwner(raw: string, objectId: string): ControllerLeaseOwner {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Controller lease object ${objectId} is malformed JSON. Refusing to change ${CONTROLLER_LEASE_REF}.`,
      { cause: error },
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `Controller lease object ${objectId} is malformed. Refusing to change ${CONTROLLER_LEASE_REF}.`,
    );
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== OWNER_KEYS.length ||
    keys.some((key, index) => key !== OWNER_KEYS[index]) ||
    record["schemaVersion"] !== "2.0.0" ||
    typeof record["token"] !== "string" ||
    record["token"].length === 0 ||
    !Number.isSafeInteger(record["pid"]) ||
    Number(record["pid"]) <= 0 ||
    typeof record["hostname"] !== "string" ||
    record["hostname"].length === 0 ||
    !(
      record["hostInstanceId"] === null ||
      (typeof record["hostInstanceId"] === "string" &&
        record["hostInstanceId"].length > 0)
    ) ||
    !isIsoTimestamp(record["processStartedAt"]) ||
    !isIsoTimestamp(record["acquiredAt"]) ||
    typeof record["operation"] !== "string" ||
    !OPERATIONS.has(record["operation"] as ControllerLeaseOperation)
  )
    throw new Error(
      `Controller lease object ${objectId} is malformed. Refusing to change ${CONTROLLER_LEASE_REF}.`,
    );
  return record as unknown as ControllerLeaseOwner;
}

function manualRemedy(objectId: string): string {
  return `After verifying that controller is dead, delete only that exact owner with: git update-ref -d ${CONTROLLER_LEASE_REF} ${objectId}`;
}

async function readLegacyPath(path: string): Promise<string | null> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return "invalid";
    return await readFile(path, "utf8");
  } catch (error) {
    const code = errorCode(error);
    // POSIX reports ENOTDIR when an ancestor makes this leaf unreachable,
    // while Windows reports the same absent leaf as ENOENT.
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

async function ensureLegacyGuard(
  repositoryRoot: string,
  statePath: string,
): Promise<string> {
  const path = ControllerLease.leasePath(repositoryRoot, statePath);
  await ensureContainedDirectory(repositoryRoot, dirname(path));
  const outcome = await exclusiveWriteSerialized(path, LEGACY_GUARD);
  if (outcome === "created") return path;
  const existing = await readLegacyPath(path);
  if (existing === LEGACY_GUARD) return path;
  throw new Error(
    `A legacy or invalid controller lease exists at ${path}. The private-ref lease was not acquired. Verify no legacy controller is running, then remove that file manually and retry.`,
  );
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
    readonly reference: typeof CONTROLLER_LEASE_REF,
    private readonly repositoryRoot: string,
    private readonly ownerObjectId: string,
  ) {}

  static leasePath(repositoryRoot: string, statePath: string): string {
    return resolve(
      dirname(resolve(repositoryRoot, statePath)),
      "controller.lease",
    );
  }

  static leaseReference(): typeof CONTROLLER_LEASE_REF {
    return CONTROLLER_LEASE_REF;
  }

  static async acquire(input: {
    readonly repositoryRoot: string;
    readonly statePath: string;
    readonly operation: ControllerLeaseOperation;
    readonly hooks?: ControllerLeaseHooks;
  }): Promise<ControllerLease> {
    const repositoryRoot = resolve(input.repositoryRoot);
    const path = await ensureLegacyGuard(repositoryRoot, input.statePath);
    const store = new GitPrivateRefStore(repositoryRoot, CONTROLLER_LEASE_REF);
    const owner: ControllerLeaseOwner = {
      schemaVersion: "2.0.0",
      token: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      hostInstanceId: await machineInstanceId(),
      processStartedAt: new Date(
        Date.now() - process.uptime() * 1000,
      ).toISOString(),
      acquiredAt: new Date().toISOString(),
      operation: input.operation,
    };
    const ownerObjectId = store.writeBlob(serializeJson(owner));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if ((await readLegacyPath(path)) !== LEGACY_GUARD)
        throw new Error(
          `The legacy-protocol guard at ${path} changed while acquiring ${CONTROLLER_LEASE_REF}. No lease was acquired.`,
        );
      const existingObjectId = store.readReference();
      const raw =
        existingObjectId === null ? null : store.readBlob(existingObjectId);
      await input.hooks?.afterObservedExisting?.({
        path: CONTROLLER_LEASE_REF,
        objectId: existingObjectId,
        raw,
      });

      if (existingObjectId !== null && raw !== null) {
        const existing = parseOwner(raw, existingObjectId);
        const describeOwner = `pid ${existing.pid} on ${existing.hostname} (operation ${existing.operation}, acquired ${existing.acquiredAt}, process started ${existing.processStartedAt}, object ${existingObjectId})`;
        const sameHost =
          existing.hostInstanceId !== null && owner.hostInstanceId !== null
            ? existing.hostInstanceId === owner.hostInstanceId
            : existing.hostname === hostname();
        if (!sameHost)
          throw new Error(
            `A controller on a different host holds the mutation lease: ${describeOwner}. Cross-host liveness cannot be verified. ${manualRemedy(existingObjectId)}`,
          );
        let alive = true;
        try {
          process.kill(existing.pid, 0);
        } catch (probeError) {
          alive = errorCode(probeError) === "EPERM";
        }
        if (alive && existing.pid === process.pid) {
          // Our own pid under a foreign token can be a prior process incarnation
          // after PID reuse. The recorded process start time is the discriminator.
          const recorded = Date.parse(existing.processStartedAt);
          const ours = Date.parse(owner.processStartedAt);
          if (Math.abs(ours - recorded) > PROCESS_START_TOLERANCE_MS)
            alive = false;
        }
        if (alive)
          throw new Error(
            `Another controller holds the mutation lease: ${describeOwner}. Wait for it to finish. ${manualRemedy(existingObjectId)}`,
          );
      }

      if (store.compareAndSwap(existingObjectId, ownerObjectId)) {
        await input.hooks?.afterPublished?.({
          path: CONTROLLER_LEASE_REF,
          objectId: ownerObjectId,
        });
        return new ControllerLease(
          path,
          CONTROLLER_LEASE_REF,
          repositoryRoot,
          ownerObjectId,
        );
      }
    }
    throw new Error(
      `Cannot acquire the controller mutation lease at ${CONTROLLER_LEASE_REF}; racing controllers kept changing the expected owner. Re-run the command.`,
    );
  }

  async release(): Promise<void> {
    const store = new GitPrivateRefStore(
      this.repositoryRoot,
      CONTROLLER_LEASE_REF,
    );
    if (!store.deleteIfMatches(this.ownerObjectId))
      throw new Error(
        `Controller lease ownership changed or disappeared; ${CONTROLLER_LEASE_REF} was left untouched.`,
      );
  }

  static async inspect(
    repositoryRoot: string,
    statePath: string,
  ): Promise<ControllerLeaseInspection> {
    const root = resolve(repositoryRoot);
    const path = ControllerLease.leasePath(root, statePath);
    const legacy = await readLegacyPath(path);
    const legacyGuardPresent = legacy === LEGACY_GUARD;
    const legacyConflict = legacy !== null && !legacyGuardPresent;
    const store = new GitPrivateRefStore(root, CONTROLLER_LEASE_REF);
    const objectId = store.readReference();
    if (legacyConflict)
      return {
        path,
        reference: CONTROLLER_LEASE_REF,
        legacyGuard: "conflict",
        present: true,
        malformed: true,
        owner: null,
      };
    if (objectId === null)
      return {
        path,
        reference: CONTROLLER_LEASE_REF,
        legacyGuard: legacyGuardPresent ? "present" : "absent",
        present: false,
        malformed: false,
        owner: null,
      };
    try {
      const owner = parseOwner(store.readBlob(objectId), objectId);
      return {
        path,
        reference: CONTROLLER_LEASE_REF,
        legacyGuard: legacyGuardPresent ? "present" : "absent",
        present: true,
        malformed: false,
        owner: {
          pid: owner.pid,
          hostname: owner.hostname,
          operation: owner.operation,
          createdAt: owner.acquiredAt,
        },
      };
    } catch {
      return {
        path,
        reference: CONTROLLER_LEASE_REF,
        legacyGuard: legacyGuardPresent ? "present" : "absent",
        present: true,
        malformed: true,
        owner: null,
      };
    }
  }
}
