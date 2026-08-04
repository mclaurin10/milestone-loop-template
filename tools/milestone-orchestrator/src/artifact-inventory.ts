import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertArtifactRoot, inspectContainedTree } from "./path-safety.js";
import { atomicWriteJson } from "./state-store.js";

export const ARTIFACT_CLASSIFICATIONS = [
  "active-state",
  "cited-tracked",
  "exact-accepted",
  "failed-diagnostic-cited",
  "recent-managed",
  "representative-failure",
  "legacy-preserved-workspace",
  "legacy-unmanaged-manual",
  "eligible-future-dry-run",
  "unknown-protected",
] as const;

export type ArtifactClassification = (typeof ARTIFACT_CLASSIFICATIONS)[number];

export interface InventoryCandidate {
  readonly gitCommit: string;
  readonly gitTree: string;
  readonly workingTreeDirty: boolean;
}

export interface ArtifactInventoryEntry {
  readonly identity: string;
  readonly stageId: string | null;
  readonly commandId: string | null;
  readonly candidate: InventoryCandidate | null;
  readonly status: string | null;
  readonly path: string;
  readonly manifest: {
    readonly kind: string;
    readonly version: string | null;
    readonly path: string | null;
  };
  readonly receipt: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  } | null;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly durableTrackedCitations: readonly string[];
  readonly durableControllerStateReferences: readonly string[];
  readonly activeReconciliationReference: string | null;
  readonly classification: ArtifactClassification;
  readonly pathSafety: {
    readonly lexicalContained: boolean;
    readonly realpathContained: boolean;
    readonly artifactRootSymlink: boolean;
    readonly entrySymlink: boolean;
    readonly disposition:
      | "contained"
      | "contains-symlink"
      | "symlink-rejected"
      | "containment-rejected";
    readonly symlinkPaths: readonly string[];
  };
}

export interface ArtifactInventory {
  readonly schemaVersion: "1.0.0";
  readonly inventoryId: string;
  readonly artifactRoot: string;
  readonly candidate: InventoryCandidate;
  readonly controller: {
    readonly statePath: string;
    readonly stateSha256: string | null;
    readonly verifiedCommit: string | null;
    readonly runStatus: "idle" | "running" | "stopped" | "escalated" | null;
    readonly activeMilestoneId: string | null;
  };
  readonly activeReconciliation: {
    readonly id: string;
    readonly path: string;
    readonly status: string;
  } | null;
  readonly entries: readonly ArtifactInventoryEntry[];
  readonly summary: {
    readonly entryCount: number;
    readonly fileCount: number;
    readonly totalBytes: number;
    readonly classificationCounts: Readonly<
      Record<ArtifactClassification, number>
    >;
    readonly legacyWorkspaceCount: number;
    readonly unknownProtectedCount: number;
  };
  readonly createdAt: string;
}

export interface ArtifactInventoryRetentionGuard {
  readonly inventoryId: string | null;
  readonly activeReconciliation: boolean;
  readonly inventoryHasUnknownReferences: boolean;
}

interface ManifestFacts {
  readonly identity: string;
  readonly stageId: string | null;
  readonly commandId: string | null;
  readonly candidate: InventoryCandidate | null;
  readonly status: string | null;
  readonly kind: string;
  readonly version: string | null;
  readonly manifestPath: string | null;
  readonly receipt: ArtifactInventoryEntry["receipt"];
  readonly managed: boolean;
  readonly exactAccepted: boolean;
  readonly finishedAtMs: number | null;
  readonly invalidReference: boolean;
}

interface MutableEntry {
  readonly absolutePath: string;
  readonly facts: ManifestFacts;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly pathSafety: ArtifactInventoryEntry["pathSafety"];
  readonly path: string;
  readonly workspace: boolean;
  readonly legacyManual: boolean;
  trackedCitations: string[];
  controllerReferences: string[];
  activeReconciliationReference: string | null;
  classification: ArtifactClassification;
}

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function timestamp(value: unknown): number | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
}

function safeInventoryId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value))
    throw new Error("Artifact inventory ID contains unsafe characters.");
  return value;
}

function git(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot inspect artifact candidate with Git: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

export function inventoryCandidate(repositoryRoot: string): InventoryCandidate {
  const gitCommit = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const gitTree = git(repositoryRoot, ["write-tree"]);
  const status = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (!/^[a-f0-9]{40}$/.test(gitCommit) || !/^[a-f0-9]{40}$/.test(gitTree))
    throw new Error("Artifact inventory candidate identity is malformed.");
  return { gitCommit, gitTree, workingTreeDirty: status.length > 0 };
}

async function regularJson(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT")
    )
      return null;
    throw error;
  }
}

function candidateFrom(value: unknown): InventoryCandidate | null {
  if (!isRecord(value)) return null;
  const gitCommit = value["gitCommit"] ?? value["commit"];
  const gitTree = value["gitTree"] ?? value["tree"];
  const dirty = value["workingTreeDirty"] ?? value["dirty"];
  return typeof gitCommit === "string" &&
    /^[a-f0-9]{40}$/.test(gitCommit) &&
    typeof gitTree === "string" &&
    /^[a-f0-9]{40}$/.test(gitTree) &&
    typeof dirty === "boolean"
    ? { gitCommit, gitTree, workingTreeDirty: dirty }
    : null;
}

async function receiptFacts(
  directory: string,
  path: string,
  expected?: Record<string, unknown> | null,
): Promise<{ receipt: ArtifactInventoryEntry["receipt"]; invalid: boolean }> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      return { receipt: null, invalid: true };
    const contents = await readFile(path);
    const actual = {
      path: slash(relative(directory, path)),
      sha256: sha256(contents),
      bytes: contents.byteLength,
    };
    if (
      expected &&
      (expected["path"] !== actual.path ||
        expected["sha256"] !== actual.sha256 ||
        expected["bytes"] !== actual.bytes)
    )
      return { receipt: null, invalid: true };
    return { receipt: actual, invalid: false };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return { receipt: null, invalid: expected !== undefined };
    throw error;
  }
}

async function manifestFacts(
  repositoryRoot: string,
  directory: string,
): Promise<ManifestFacts> {
  const fallbackIdentity = basename(directory);
  const manualPath = resolve(directory, "manifest.json");
  const manual = await regularJson(manualPath);
  if (manual && typeof manual["manifestId"] === "string") {
    const expected = isRecord(manual["receipt"])
      ? manual["receipt"]
      : manual["receipt"] === null
        ? null
        : undefined;
    const observed =
      expected === null
        ? {
            receipt: null,
            invalid: existsSync(resolve(directory, "result.json")),
          }
        : await receiptFacts(
            directory,
            resolve(directory, "result.json"),
            expected,
          );
    return {
      identity: manual["manifestId"],
      stageId: stringOrNull(manual["stageId"]),
      commandId: stringOrNull(manual["commandId"]),
      candidate: candidateFrom(manual["candidate"]),
      status: stringOrNull(manual["status"]),
      kind: "manual-evidence",
      version: stringOrNull(manual["schemaVersion"]),
      manifestPath: slash(relative(repositoryRoot, manualPath)),
      receipt: observed.receipt,
      managed: true,
      exactAccepted: false,
      finishedAtMs: timestamp(manual["finishedAt"]),
      invalidReference: observed.invalid,
    };
  }

  const tierPath = resolve(directory, "tier-result.json");
  const tier = await regularJson(tierPath);
  if (tier && typeof tier["runId"] === "string")
    return {
      identity: tier["runId"],
      stageId: "verification-tier",
      commandId: stringOrNull(tier["tier"]),
      candidate: candidateFrom(tier["candidate"]),
      status: stringOrNull(tier["status"]),
      kind: "verification-tier",
      version: stringOrNull(tier["schemaVersion"]),
      manifestPath: slash(relative(repositoryRoot, tierPath)),
      receipt: null,
      managed: true,
      exactAccepted: false,
      finishedAtMs: timestamp(tier["finishedAt"]),
      invalidReference: false,
    };

  const resultPath = resolve(directory, "result.json");
  const result = await regularJson(resultPath);
  if (result) {
    const receipt = await receiptFacts(directory, resultPath);
    const completion = isRecord(result["completion"])
      ? result["completion"]
      : null;
    const isCommandReceipt =
      typeof result["stageId"] === "string" &&
      typeof result["commandId"] === "string" &&
      Array.isArray(result["checks"]);
    return {
      identity:
        stringOrNull(result["runId"]) ??
        (isCommandReceipt
          ? `${String(result["stageId"])}:${String(result["commandId"])}:${fallbackIdentity}`
          : fallbackIdentity),
      stageId: isCommandReceipt
        ? String(result["stageId"])
        : stringOrNull(result["stageId"]),
      commandId: isCommandReceipt
        ? String(result["commandId"])
        : stringOrNull(result["commandId"]),
      candidate: candidateFrom(result["candidate"]),
      status: stringOrNull(result["status"]),
      kind: isCommandReceipt ? "legacy-command-receipt" : "verification-result",
      version: stringOrNull(result["schemaVersion"]),
      manifestPath: slash(relative(repositoryRoot, resultPath)),
      receipt: receipt.receipt,
      managed: !isCommandReceipt,
      exactAccepted:
        result["status"] === "PASS" && completion?.["eligible"] === true,
      finishedAtMs: timestamp(result["finishedAt"]),
      invalidReference: receipt.invalid,
    };
  }

  const runSummaryPath = resolve(directory, "run-summary.json");
  const runSummary = await regularJson(runSummaryPath);
  if (runSummary) {
    const run = isRecord(runSummary["run"]) ? runSummary["run"] : runSummary;
    return {
      identity: stringOrNull(run["id"]) ?? fallbackIdentity,
      stageId: "controller",
      commandId: "loop:run",
      candidate: candidateFrom(runSummary["candidate"]),
      status: stringOrNull(run["status"]),
      kind: "controller-run-summary",
      version: stringOrNull(runSummary["schemaVersion"]),
      manifestPath: slash(relative(repositoryRoot, runSummaryPath)),
      receipt: null,
      managed: true,
      exactAccepted: false,
      finishedAtMs: timestamp(run["finishedAt"]),
      invalidReference: false,
    };
  }

  if (manual && typeof manual["runId"] === "string")
    return {
      identity: manual["runId"],
      stageId: "loop-telemetry",
      commandId: stringOrNull(manual["source"]),
      candidate: null,
      status: stringOrNull(manual["status"]),
      kind: "telemetry-manifest",
      version: stringOrNull(manual["schemaVersion"]),
      manifestPath: slash(relative(repositoryRoot, manualPath)),
      receipt: null,
      managed: true,
      exactAccepted: false,
      finishedAtMs:
        timestamp(manual["updatedAt"]) ?? timestamp(manual["createdAt"]),
      invalidReference: false,
    };

  for (const marker of ["run-manifest.json", "baseline.json", "state.json"]) {
    const markerPath = resolve(directory, marker);
    const value = await regularJson(markerPath);
    if (!value) continue;
    return {
      identity:
        marker === "state.json"
          ? "controller-state"
          : (stringOrNull(value["runId"]) ??
            stringOrNull(value["id"]) ??
            fallbackIdentity),
      stageId: marker === "state.json" ? "controller" : null,
      commandId: marker === "state.json" ? "state" : null,
      candidate: candidateFrom(value["candidate"]),
      status:
        marker === "state.json" && isRecord(value["run"])
          ? stringOrNull(value["run"]["status"])
          : stringOrNull(value["status"]),
      kind:
        marker === "state.json"
          ? "controller-state"
          : marker === "baseline.json"
            ? "telemetry-baseline"
            : "legacy-verification-manifest",
      version: stringOrNull(value["schemaVersion"]),
      manifestPath: slash(relative(repositoryRoot, markerPath)),
      receipt: null,
      managed: false,
      exactAccepted: false,
      finishedAtMs:
        timestamp(value["finishedAt"]) ?? timestamp(value["updatedAt"]),
      invalidReference: false,
    };
  }

  return {
    identity: fallbackIdentity,
    stageId: null,
    commandId: null,
    candidate: null,
    status: null,
    kind: "unmanaged",
    version: null,
    manifestPath: null,
    receipt: null,
    managed: false,
    exactAccepted: false,
    finishedAtMs: null,
    invalidReference: false,
  };
}

async function childEntries(path: string): Promise<readonly string[]> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return [path];
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => resolve(path, entry.name))
      .sort((left, right) => slash(left).localeCompare(slash(right)));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return [];
    throw error;
  }
}

async function discoverEntryPaths(
  artifactRoot: string,
): Promise<readonly string[]> {
  const result: string[] = [];
  const top = await readdir(artifactRoot, { withFileTypes: true });
  for (const entry of top.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(artifactRoot, entry.name);
    if (entry.name === "manual" || entry.name === "verification-tiers") {
      result.push(...(await childEntries(path)));
      continue;
    }
    if (entry.name === "recommissioning" || entry.name === "inventory") {
      result.push(...(await childEntries(path)));
      continue;
    }
    if (entry.name === "orchestrator") {
      for (const child of await childEntries(path)) {
        const name = basename(child);
        if (name === "runs" || name === "workspaces")
          result.push(...(await childEntries(child)));
        else result.push(child);
      }
      continue;
    }
    if (entry.name === "loop-telemetry") {
      for (const child of await childEntries(path))
        result.push(...(await childEntries(child)));
      continue;
    }
    result.push(path);
  }
  return [...new Set(result.map((path) => resolve(path)))].sort((left, right) =>
    slash(left).localeCompare(slash(right)),
  );
}

function flattenedStrings(
  value: unknown,
  pointer = "",
): readonly { readonly pointer: string; readonly value: string }[] {
  if (typeof value === "string") return [{ pointer: pointer || "/", value }];
  if (Array.isArray(value))
    return value.flatMap((entry, index) =>
      flattenedStrings(entry, `${pointer}/${index}`),
    );
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenedStrings(
      child,
      `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
    ),
  );
}

function referenceNeedles(entry: MutableEntry): readonly string[] {
  return [
    ...new Set([entry.facts.identity, entry.path, slash(entry.absolutePath)]),
  ]
    .filter((value) => value.length >= 8)
    .sort();
}

function applyTrackedCitations(
  repositoryRoot: string,
  entries: readonly MutableEntry[],
): void {
  for (let offset = 0; offset < entries.length; offset += 40) {
    const batch = entries.slice(offset, offset + 40);
    const patterns = [...new Set(batch.flatMap(referenceNeedles))];
    if (patterns.length === 0) continue;
    const result = spawnSync(
      "git",
      [
        "-C",
        repositoryRoot,
        "grep",
        "-I",
        "-n",
        "-F",
        ...patterns.flatMap((pattern) => ["-e", pattern]),
        "HEAD",
        "--",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    );
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw new Error(
        `Cannot inspect exact tracked artifact citations: ${result.error?.message ?? result.stderr.trim()}.`,
      );
    for (const rawLine of result.stdout.split(/\r?\n/u)) {
      const line = rawLine.startsWith("HEAD:") ? rawLine.slice(5) : rawLine;
      const firstColon = line.indexOf(":");
      const secondColon = line.indexOf(":", firstColon + 1);
      if (firstColon <= 0 || secondColon <= firstColon) continue;
      const citationPath = slash(line.slice(0, firstColon));
      const contents = line.slice(secondColon + 1);
      for (const entry of batch)
        if (referenceNeedles(entry).some((needle) => contents.includes(needle)))
          entry.trackedCitations.push(citationPath);
    }
  }
  for (const entry of entries)
    entry.trackedCitations = [...new Set(entry.trackedCitations)].sort();
}

function activeReconciliationFromState(
  state: Record<string, unknown> | null,
): ArtifactInventory["activeReconciliation"] {
  if (!state) return null;
  const candidate =
    (isRecord(state["activeReconciliation"])
      ? state["activeReconciliation"]
      : null) ??
    (isRecord(state["reconciliation"]) &&
    isRecord(state["reconciliation"]["active"])
      ? state["reconciliation"]["active"]
      : null);
  if (!candidate) return null;
  const id = stringOrNull(candidate["id"]);
  const path = stringOrNull(candidate["path"]);
  const status = stringOrNull(candidate["status"]);
  return id && path && status ? { id, path: slash(path), status } : null;
}

function applyControllerReferences(
  entries: readonly MutableEntry[],
  state: Record<string, unknown> | null,
  activeReconciliation: ArtifactInventory["activeReconciliation"],
): void {
  const stateStrings = flattenedStrings(state);
  const reconciliationText = activeReconciliation
    ? JSON.stringify(activeReconciliation)
    : null;
  for (const entry of entries) {
    const needles = referenceNeedles(entry);
    entry.controllerReferences = stateStrings
      .filter(({ value }) => {
        const normalized = slash(value);
        return needles.some(
          (needle) => normalized === needle || normalized.includes(needle),
        );
      })
      .map(
        ({ pointer }) => `artifacts/orchestrator/state/state.json#${pointer}`,
      )
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();
    if (
      reconciliationText &&
      needles.some((needle) => reconciliationText.includes(needle))
    )
      entry.activeReconciliationReference = activeReconciliation!.path;
  }
}

function failing(status: string | null): boolean {
  return (
    status !== null && ["FAIL", "ERROR", "TIMEOUT", "error"].includes(status)
  );
}

function activeControllerReference(references: readonly string[]): boolean {
  return references.some(
    (reference) =>
      reference.includes("#/run/") ||
      reference.endsWith("#/activeMilestoneId") ||
      reference.includes("#/queue/") ||
      reference.includes("#/activeReconciliation") ||
      reference.includes("#/reconciliation/active"),
  );
}

function classifyEntries(
  entries: readonly MutableEntry[],
  keepRecentRuns: number,
): void {
  const managed = entries
    .filter((entry) => entry.facts.managed && !entry.workspace)
    .sort(
      (left, right) =>
        (right.facts.finishedAtMs ?? -1) - (left.facts.finishedAtMs ?? -1) ||
        left.facts.identity.localeCompare(right.facts.identity),
    );
  const recent = new Set(
    managed.slice(0, keepRecentRuns).map((entry) => entry.absolutePath),
  );
  const representativeFailures = new Set<string>();
  const failureKeys = new Set<string>();
  for (const entry of managed) {
    if (!failing(entry.facts.status)) continue;
    const key = entry.facts.commandId ?? entry.facts.kind;
    if (failureKeys.has(key)) continue;
    failureKeys.add(key);
    representativeFailures.add(entry.absolutePath);
  }

  for (const entry of entries) {
    const cited =
      entry.trackedCitations.length > 0 ||
      entry.controllerReferences.length > 0 ||
      entry.activeReconciliationReference !== null;
    if (entry.facts.kind === "controller-state")
      entry.classification = "active-state";
    else if (entry.workspace)
      entry.classification = "legacy-preserved-workspace";
    else if (
      entry.pathSafety.disposition !== "contained" ||
      entry.facts.invalidReference
    )
      entry.classification = "unknown-protected";
    else if (
      activeControllerReference(entry.controllerReferences) ||
      entry.activeReconciliationReference !== null
    )
      entry.classification = "active-state";
    else if (entry.facts.exactAccepted) entry.classification = "exact-accepted";
    else if (failing(entry.facts.status) && cited)
      entry.classification = "failed-diagnostic-cited";
    else if (entry.trackedCitations.length > 0)
      entry.classification = "cited-tracked";
    else if (representativeFailures.has(entry.absolutePath))
      entry.classification = "representative-failure";
    else if (recent.has(entry.absolutePath))
      entry.classification = "recent-managed";
    else if (entry.legacyManual)
      entry.classification = "legacy-unmanaged-manual";
    else if (entry.facts.managed)
      entry.classification = "eligible-future-dry-run";
    else entry.classification = "unknown-protected";
  }
}

function controllerFacts(
  repositoryRoot: string,
  statePath: string,
  stateContents: Buffer | null,
  state: Record<string, unknown> | null,
): ArtifactInventory["controller"] {
  const repository =
    state && isRecord(state["repository"]) ? state["repository"] : null;
  const run = state && isRecord(state["run"]) ? state["run"] : null;
  const runStatus = stringOrNull(run?.["status"]);
  return {
    statePath: slash(relative(repositoryRoot, statePath)),
    stateSha256: stateContents ? sha256(stateContents) : null,
    verifiedCommit:
      typeof repository?.["verifiedCommit"] === "string" &&
      /^[a-f0-9]{40}$/.test(repository["verifiedCommit"])
        ? repository["verifiedCommit"]
        : null,
    runStatus:
      runStatus &&
      ["idle", "running", "stopped", "escalated"].includes(runStatus)
        ? (runStatus as ArtifactInventory["controller"]["runStatus"])
        : null,
    activeMilestoneId: stringOrNull(state?.["activeMilestoneId"]),
  };
}

export async function createArtifactInventory(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot?: string;
  readonly controllerStatePath?: string;
  readonly inventoryId: string;
  readonly now: string;
  readonly keepRecentRuns?: number;
  readonly candidate?: InventoryCandidate;
}): Promise<ArtifactInventory> {
  const repositoryRoot = resolve(input.repositoryRoot);
  const artifactRoot = resolve(
    input.artifactRoot ?? resolve(repositoryRoot, "artifacts"),
  );
  await assertArtifactRoot(artifactRoot);
  const statePath = resolve(
    input.controllerStatePath ??
      resolve(artifactRoot, "orchestrator", "state", "state.json"),
  );
  let stateContents: Buffer | null = null;
  let state: Record<string, unknown> | null = null;
  try {
    const metadata = await lstat(statePath);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error(
        "Controller state path must be a regular non-symlink file.",
      );
    stateContents = await readFile(statePath);
    const parsed = JSON.parse(stateContents.toString("utf8")) as unknown;
    if (!isRecord(parsed))
      throw new Error("Controller state must be an object.");
    state = parsed;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    )
      throw error;
  }

  const workspaceRoot = resolve(artifactRoot, "orchestrator", "workspaces");
  const entryPaths = await discoverEntryPaths(artifactRoot);
  const mutable: MutableEntry[] = [];
  for (let offset = 0; offset < entryPaths.length; offset += 32) {
    const batch = await Promise.all(
      entryPaths.slice(offset, offset + 32).map(async (path) => {
        const inspection = await inspectContainedTree(artifactRoot, path);
        const relativePath = slash(relative(repositoryRoot, path));
        const facts =
          inspection.disposition === "symlink-rejected"
            ? {
                identity: basename(path),
                stageId: null,
                commandId: null,
                candidate: null,
                status: null,
                kind: "unmanaged",
                version: null,
                manifestPath: null,
                receipt: null,
                managed: false,
                exactAccepted: false,
                finishedAtMs: null,
                invalidReference: false,
              }
            : await manifestFacts(repositoryRoot, path);
        const underManual = slash(relative(artifactRoot, path)).startsWith(
          "manual/",
        );
        return {
          absolutePath: path,
          facts,
          fileCount: inspection.fileCount,
          totalBytes: inspection.totalBytes,
          pathSafety: {
            lexicalContained: inspection.lexicalContained,
            realpathContained: inspection.realpathContained,
            artifactRootSymlink: inspection.artifactRootSymlink,
            entrySymlink: inspection.entrySymlink,
            disposition: inspection.disposition,
            symlinkPaths: inspection.symlinkPaths,
          },
          path: relativePath,
          workspace:
            slash(relative(workspaceRoot, path)).split("/").length === 1 &&
            !slash(relative(workspaceRoot, path)).startsWith(".."),
          legacyManual: underManual && facts.kind !== "manual-evidence",
          trackedCitations: [],
          controllerReferences: [],
          activeReconciliationReference: null,
          classification: "unknown-protected" as ArtifactClassification,
        } satisfies MutableEntry;
      }),
    );
    mutable.push(...batch);
  }
  applyTrackedCitations(repositoryRoot, mutable);
  const activeReconciliation = activeReconciliationFromState(state);
  applyControllerReferences(mutable, state, activeReconciliation);
  classifyEntries(mutable, input.keepRecentRuns ?? 20);

  const entries: ArtifactInventoryEntry[] = mutable.map((entry) => ({
    identity: entry.facts.identity,
    stageId: entry.facts.stageId,
    commandId: entry.facts.commandId,
    candidate: entry.facts.candidate,
    status: entry.facts.status,
    path: entry.path,
    manifest: {
      kind: entry.facts.kind,
      version: entry.facts.version,
      path: entry.facts.manifestPath,
    },
    receipt: entry.facts.receipt,
    fileCount: entry.fileCount,
    totalBytes: entry.totalBytes,
    durableTrackedCitations: entry.trackedCitations,
    durableControllerStateReferences: entry.controllerReferences,
    activeReconciliationReference: entry.activeReconciliationReference,
    classification: entry.classification,
    pathSafety: entry.pathSafety,
  }));
  const classificationCounts = Object.fromEntries(
    ARTIFACT_CLASSIFICATIONS.map((classification) => [
      classification,
      entries.filter((entry) => entry.classification === classification).length,
    ]),
  ) as Record<ArtifactClassification, number>;
  return {
    schemaVersion: "1.0.0",
    inventoryId: safeInventoryId(input.inventoryId),
    artifactRoot: slash(relative(repositoryRoot, artifactRoot)),
    candidate: input.candidate ?? inventoryCandidate(repositoryRoot),
    controller: controllerFacts(
      repositoryRoot,
      statePath,
      stateContents,
      state,
    ),
    activeReconciliation,
    entries,
    summary: {
      entryCount: entries.length,
      fileCount: entries.reduce((sum, entry) => sum + entry.fileCount, 0),
      totalBytes: entries.reduce((sum, entry) => sum + entry.totalBytes, 0),
      classificationCounts,
      legacyWorkspaceCount: classificationCounts["legacy-preserved-workspace"],
      unknownProtectedCount: classificationCounts["unknown-protected"],
    },
    createdAt: input.now,
  };
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nullableNonEmptyString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function uniqueNonEmptyStrings(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(nonEmptyString) &&
    new Set(value).size === value.length
  );
}

function validInventoryCandidate(value: unknown): value is InventoryCandidate {
  return (
    exactRecord(value, ["gitCommit", "gitTree", "workingTreeDirty"]) &&
    typeof value["gitCommit"] === "string" &&
    /^[a-f0-9]{40}$/.test(value["gitCommit"]) &&
    typeof value["gitTree"] === "string" &&
    /^[a-f0-9]{40}$/.test(value["gitTree"]) &&
    typeof value["workingTreeDirty"] === "boolean"
  );
}

export function assertArtifactInventory(value: unknown): ArtifactInventory {
  const exactKeys = [
    "schemaVersion",
    "inventoryId",
    "artifactRoot",
    "candidate",
    "controller",
    "activeReconciliation",
    "entries",
    "summary",
    "createdAt",
  ];
  if (
    !exactRecord(value, exactKeys) ||
    value["schemaVersion"] !== "1.0.0" ||
    typeof value["inventoryId"] !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value["inventoryId"]) ||
    !nonEmptyString(value["artifactRoot"]) ||
    !validInventoryCandidate(value["candidate"]) ||
    !exactRecord(value["controller"], [
      "statePath",
      "stateSha256",
      "verifiedCommit",
      "runStatus",
      "activeMilestoneId",
    ]) ||
    !nonEmptyString(value["controller"]["statePath"]) ||
    !(
      value["controller"]["stateSha256"] === null ||
      (typeof value["controller"]["stateSha256"] === "string" &&
        /^[a-f0-9]{64}$/.test(value["controller"]["stateSha256"]))
    ) ||
    !(
      value["controller"]["verifiedCommit"] === null ||
      (typeof value["controller"]["verifiedCommit"] === "string" &&
        /^[a-f0-9]{40}$/.test(value["controller"]["verifiedCommit"]))
    ) ||
    !(
      value["controller"]["runStatus"] === null ||
      ["idle", "running", "stopped", "escalated"].includes(
        String(value["controller"]["runStatus"]),
      )
    ) ||
    !nullableNonEmptyString(value["controller"]["activeMilestoneId"]) ||
    !(
      value["activeReconciliation"] === null ||
      (exactRecord(value["activeReconciliation"], ["id", "path", "status"]) &&
        nonEmptyString(value["activeReconciliation"]["id"]) &&
        nonEmptyString(value["activeReconciliation"]["path"]) &&
        nonEmptyString(value["activeReconciliation"]["status"]))
    ) ||
    !Array.isArray(value["entries"]) ||
    typeof value["createdAt"] !== "string" ||
    !Number.isFinite(Date.parse(value["createdAt"]))
  )
    throw new Error("Artifact inventory schema is invalid.");

  const classificationCounts = Object.fromEntries(
    ARTIFACT_CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<ArtifactClassification, number>;
  let totalFileCount = 0;
  let totalBytes = 0;
  for (const entry of value["entries"]) {
    if (
      !exactRecord(entry, [
        "identity",
        "stageId",
        "commandId",
        "candidate",
        "status",
        "path",
        "manifest",
        "receipt",
        "fileCount",
        "totalBytes",
        "durableTrackedCitations",
        "durableControllerStateReferences",
        "activeReconciliationReference",
        "classification",
        "pathSafety",
      ]) ||
      !nonEmptyString(entry["identity"]) ||
      !nullableNonEmptyString(entry["stageId"]) ||
      !nullableNonEmptyString(entry["commandId"]) ||
      !(
        entry["candidate"] === null ||
        validInventoryCandidate(entry["candidate"])
      ) ||
      !nullableNonEmptyString(entry["status"]) ||
      !nonEmptyString(entry["path"]) ||
      !exactRecord(entry["manifest"], ["kind", "version", "path"]) ||
      !nonEmptyString(entry["manifest"]["kind"]) ||
      !nullableNonEmptyString(entry["manifest"]["version"]) ||
      !nullableNonEmptyString(entry["manifest"]["path"]) ||
      !(
        entry["receipt"] === null ||
        (exactRecord(entry["receipt"], ["path", "sha256", "bytes"]) &&
          nonEmptyString(entry["receipt"]["path"]) &&
          typeof entry["receipt"]["sha256"] === "string" &&
          /^[a-f0-9]{64}$/.test(entry["receipt"]["sha256"]) &&
          Number.isSafeInteger(entry["receipt"]["bytes"]) &&
          Number(entry["receipt"]["bytes"]) > 0)
      ) ||
      !nonnegativeInteger(entry["fileCount"]) ||
      !nonnegativeInteger(entry["totalBytes"]) ||
      !uniqueNonEmptyStrings(entry["durableTrackedCitations"]) ||
      !uniqueNonEmptyStrings(entry["durableControllerStateReferences"]) ||
      !nullableNonEmptyString(entry["activeReconciliationReference"]) ||
      !ARTIFACT_CLASSIFICATIONS.includes(
        entry["classification"] as ArtifactClassification,
      ) ||
      !exactRecord(entry["pathSafety"], [
        "lexicalContained",
        "realpathContained",
        "artifactRootSymlink",
        "entrySymlink",
        "disposition",
        "symlinkPaths",
      ]) ||
      typeof entry["pathSafety"]["lexicalContained"] !== "boolean" ||
      typeof entry["pathSafety"]["realpathContained"] !== "boolean" ||
      typeof entry["pathSafety"]["artifactRootSymlink"] !== "boolean" ||
      typeof entry["pathSafety"]["entrySymlink"] !== "boolean" ||
      ![
        "contained",
        "contains-symlink",
        "symlink-rejected",
        "containment-rejected",
      ].includes(String(entry["pathSafety"]["disposition"])) ||
      !uniqueNonEmptyStrings(entry["pathSafety"]["symlinkPaths"])
    )
      throw new Error(
        `Artifact inventory entry is invalid: ${isRecord(entry) && typeof entry["identity"] === "string" ? entry["identity"] : "unknown"}.`,
      );

    totalFileCount += entry["fileCount"];
    totalBytes += entry["totalBytes"];
    classificationCounts[entry["classification"] as ArtifactClassification] +=
      1;
  }

  const summary = value["summary"];
  const counts = isRecord(summary) ? summary["classificationCounts"] : null;
  if (
    !exactRecord(summary, [
      "entryCount",
      "fileCount",
      "totalBytes",
      "classificationCounts",
      "legacyWorkspaceCount",
      "unknownProtectedCount",
    ]) ||
    summary["entryCount"] !== value["entries"].length ||
    summary["fileCount"] !== totalFileCount ||
    summary["totalBytes"] !== totalBytes ||
    !exactRecord(counts, ARTIFACT_CLASSIFICATIONS) ||
    ARTIFACT_CLASSIFICATIONS.some(
      (classification) =>
        !nonnegativeInteger(counts[classification]) ||
        counts[classification] !== classificationCounts[classification],
    ) ||
    summary["legacyWorkspaceCount"] !==
      classificationCounts["legacy-preserved-workspace"] ||
    summary["unknownProtectedCount"] !==
      classificationCounts["unknown-protected"]
  )
    throw new Error("Artifact inventory summary is invalid.");

  return value as unknown as ArtifactInventory;
}

export async function readArtifactInventoryRetentionGuard(
  repositoryRoot: string,
  candidateCommit: string,
): Promise<ArtifactInventoryRetentionGuard> {
  const inventoryRoot = resolve(repositoryRoot, "artifacts", "inventory");
  try {
    await assertArtifactRoot(inventoryRoot);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return {
        inventoryId: null,
        activeReconciliation: false,
        inventoryHasUnknownReferences: true,
      };
    throw error;
  }
  const directories = (await readdir(inventoryRoot, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  for (const id of directories) {
    const path = resolve(inventoryRoot, id, "inventory.json");
    const value = await regularJson(path);
    if (!value) continue;
    try {
      const inventory = assertArtifactInventory(value);
      const current = inventory.candidate.gitCommit === candidateCommit;
      return {
        inventoryId: inventory.inventoryId,
        activeReconciliation: inventory.activeReconciliation !== null,
        inventoryHasUnknownReferences:
          !current ||
          inventory.summary.unknownProtectedCount > 0 ||
          inventory.entries.some(
            (entry) => entry.pathSafety.disposition !== "contained",
          ),
      };
    } catch {
      continue;
    }
  }
  return {
    inventoryId: null,
    activeReconciliation: false,
    inventoryHasUnknownReferences: true,
  };
}

export function renderInventorySummary(inventory: ArtifactInventory): string {
  const lines = [
    `# Artifact Inventory ${inventory.inventoryId}`,
    "",
    `Candidate: ${inventory.candidate.gitCommit} / ${inventory.candidate.gitTree} (${inventory.candidate.workingTreeDirty ? "dirty" : "clean"})`,
    `Controller verified commit: ${inventory.controller.verifiedCommit ?? "unavailable"}`,
    `Entries: ${inventory.summary.entryCount}; files: ${inventory.summary.fileCount}; bytes: ${inventory.summary.totalBytes}`,
    "",
    "## Classifications",
    "",
    ...ARTIFACT_CLASSIFICATIONS.map(
      (classification) =>
        `- ${classification}: ${inventory.summary.classificationCounts[classification]}`,
    ),
    "",
    `Legacy preserved workspaces: ${inventory.summary.legacyWorkspaceCount}`,
    `Unknown protected entries: ${inventory.summary.unknownProtectedCount}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeArtifactInventory(input: {
  readonly repositoryRoot: string;
  readonly inventoryId?: string;
  readonly now?: string;
}): Promise<{
  readonly directory: string;
  readonly inventory: ArtifactInventory;
}> {
  const now = input.now ?? new Date().toISOString();
  const inventoryId =
    input.inventoryId ??
    `inventory-${now.replaceAll(/[^0-9]/g, "")}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const inventory = await createArtifactInventory({
    repositoryRoot: input.repositoryRoot,
    inventoryId,
    now,
  });
  const directory = resolve(
    input.repositoryRoot,
    "artifacts",
    "inventory",
    inventoryId,
  );
  const inventoryRoot = resolve(input.repositoryRoot, "artifacts", "inventory");
  await mkdir(inventoryRoot, { recursive: true });
  await assertArtifactRoot(inventoryRoot);
  await mkdir(directory, { recursive: false });
  await atomicWriteJson(resolve(directory, "inventory.json"), inventory);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    resolve(directory, "inventory-summary.md"),
    renderInventorySummary(inventory),
    "utf8",
  );
  const { createRetentionDryRun } = await import("./retention-plan.js");
  await atomicWriteJson(
    resolve(directory, "retention-dry-run.json"),
    createRetentionDryRun(inventory, now),
  );
  return { directory, inventory };
}

async function main(): Promise<void> {
  if (process.argv.length > 2)
    throw new Error("Usage: pnpm artifacts:inventory (no arguments).");
  const repositoryRoot = resolve(
    fileURLToPath(new URL("../../..", import.meta.url)),
  );
  const result = await writeArtifactInventory({ repositoryRoot });
  process.stdout.write(
    `Artifact inventory: ${slash(relative(repositoryRoot, result.directory))}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
