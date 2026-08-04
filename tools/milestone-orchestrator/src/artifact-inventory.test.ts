import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertManualEvidenceManifest,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import {
  assertArtifactInventory,
  createArtifactInventory,
} from "./artifact-inventory.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return false;
    throw error;
  }
}

async function fixtureRepository(): Promise<{
  readonly root: string;
  readonly commit: string;
  readonly tree: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "ski-artifact-inventory-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Artifact Inventory Test");
  git(root, "config", "user.email", "inventory@example.invalid");
  await mkdir(join(root, ".agent"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "artifacts/\n");
  await writeFile(
    join(root, ".agent", "citations.md"),
    "Durable exact evidence: cited-run and failed-cited-run.\n",
  );
  git(root, "add", ".gitignore", ".agent/citations.md");
  git(root, "commit", "-m", "inventory fixture");
  return {
    root,
    commit: git(root, "rev-parse", "HEAD"),
    tree: git(root, "rev-parse", "HEAD^{tree}"),
  };
}

function manualContext(input: {
  readonly root: string;
  readonly directory: string;
  readonly commit: string;
  readonly tree: string;
  readonly commandId: string;
}) {
  return {
    repositoryRoot: input.root,
    artifactDirectory: input.directory,
    stageId: "test-stage",
    commandId: input.commandId,
    manualEvidence: {
      manifestId: `manual-${input.commandId}`,
      createdAt: "2026-08-04T00:00:00.000Z",
      displayCommand: `node verifier --token [REDACTED]`,
      candidate: {
        gitCommit: input.commit,
        gitTree: input.tree,
        workingTreeDirty: false,
      },
      telemetry: {
        runId: "telemetry-test",
        manifestPath:
          "artifacts/loop-telemetry/direct/telemetry-test/manifest.json",
      },
      finalized: false,
      lastManifest: null,
    },
  };
}

async function verificationResult(
  root: string,
  id: string,
  input: {
    readonly commit: string;
    readonly tree: string;
    readonly status: "PASS" | "FAIL";
    readonly finishedAt: string;
    readonly eligible?: boolean;
  },
): Promise<void> {
  const directory = join(root, "artifacts", id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "result.json"),
    `${JSON.stringify({
      schemaVersion: "2.0.0",
      runId: id,
      status: input.status,
      candidate: {
        gitCommit: input.commit,
        gitTree: input.tree,
        workingTreeDirty: false,
      },
      completion: { eligible: input.eligible ?? false },
      finishedAt: input.finishedAt,
    })}\n`,
  );
}

describe("future manual evidence manifests", () => {
  it("keeps the receipt schema unchanged and binds successful artifacts", async () => {
    const fixture = await fixtureRepository();
    const directory = join(fixture.root, "artifacts", "manual", "success");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "report.json"), '{"ok":true}\n');
    const context = manualContext({
      ...fixture,
      directory,
      commandId: "future-success",
    });

    await writeReceipt(
      context,
      [{ id: "future-check", summary: "Future command passed." }],
      [{ path: "report.json", kind: "future-report" }],
    );

    const receiptText = await readFile(join(directory, "result.json"), "utf8");
    const receipt = JSON.parse(receiptText) as Record<string, unknown>;
    expect(Object.keys(receipt).sort()).toEqual(
      [
        "artifacts",
        "checks",
        "commandId",
        "schemaVersion",
        "stageId",
        "status",
      ].sort(),
    );
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(() => assertManualEvidenceManifest(manifest)).not.toThrow();
    expect(manifest).toMatchObject({
      schemaVersion: "1.0.0",
      manifestId: "manual-future-success",
      stageId: "test-stage",
      commandId: "future-success",
      displayCommand: "node verifier --token [REDACTED]",
      status: "PASS",
      candidate: {
        gitCommit: fixture.commit,
        gitTree: fixture.tree,
        workingTreeDirty: false,
      },
      declaredArtifacts: { count: 1, bytes: 12 },
      telemetry: { runId: "telemetry-test" },
      failureClassification: null,
    });
    expect(manifest["receipt"]).toEqual({
      path: "result.json",
      sha256: createHash("sha256").update(receiptText).digest("hex"),
      bytes: Buffer.byteLength(receiptText),
    });
  });

  it("retains an explicit failed manifest and removes any passing receipt", async () => {
    const fixture = await fixtureRepository();
    const directory = join(fixture.root, "artifacts", "manual", "failure");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "result.json"),
      '{"schemaVersion":"1.0.0","status":"PASS"}\n',
    );
    const context = manualContext({
      ...fixture,
      directory,
      commandId: "future-failure",
    });

    const manifest = await writeManualEvidenceFailure(context, {
      kind: "product",
      message: "verification failed for TOKEN=secret-value",
    });

    expect(await exists(join(directory, "result.json"))).toBe(false);
    expect(manifest).toMatchObject({
      status: "ERROR",
      receipt: null,
      declaredArtifacts: { count: 0, bytes: 0, declarations: [] },
      failureClassification: {
        kind: "product",
        message: "verification failed for TOKEN=[REDACTED]",
      },
    });

    const duplicateCitation = structuredClone(manifest) as Record<
      string,
      unknown
    >;
    duplicateCitation["citationClass"] = "tracked";
    duplicateCitation["durableCitations"] = {
      trackedPaths: ["docs/evidence.md", "docs/evidence.md"],
      controllerStateReferences: [],
      activeReconciliationReference: null,
    };
    expect(() => assertManualEvidenceManifest(duplicateCitation)).toThrow(
      "durable citations",
    );
  });

  it("preserves an explicit failure classification when the process exits nonzero", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ski-manual-exit-"));
    temporaryDirectories.push(directory);
    const evidenceModule = pathToFileURL(
      resolve(process.cwd(), "tools", "evidence.mjs"),
    ).href;
    const script = [
      `import { evidenceContext, writeManualEvidenceFailure } from ${JSON.stringify(evidenceModule)};`,
      'const context = await evidenceContext("test-stage", "explicit-exit-failure");',
      'await writeManualEvidenceFailure(context, { kind: "product", message: "explicit product failure" });',
      "process.exitCode = 1;",
    ].join("\n");

    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SKI_VERIFY_COMMAND_ARTIFACT_DIR: directory,
        },
        windowsHide: true,
      },
    );

    expect(child.status).toBe(1);
    expect(await exists(join(directory, "result.json"))).toBe(false);
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      status: "ERROR",
      failureClassification: {
        kind: "product",
        message: "explicit product failure",
      },
    });
  });
});

describe("read-only artifact inventory", () => {
  it("classifies exact citations, accepted evidence, six legacy workspaces, and links without following them", async () => {
    const fixture = await fixtureRepository();
    const artifactRoot = join(fixture.root, "artifacts");
    const stateDirectory = join(artifactRoot, "orchestrator", "state");
    const workspaceRoot = join(artifactRoot, "orchestrator", "workspaces");
    await Promise.all([
      mkdir(stateDirectory, { recursive: true }),
      mkdir(join(artifactRoot, "manual", "legacy"), { recursive: true }),
    ]);
    for (let index = 1; index <= 6; index += 1) {
      const workspace = join(workspaceRoot, `legacy-workspace-${index}`);
      await mkdir(workspace, { recursive: true });
      await writeFile(join(workspace, "keep.txt"), `workspace ${index}\n`);
    }
    await writeFile(
      join(stateDirectory, "state.json"),
      `${JSON.stringify({
        schemaVersion: "1.1.0",
        repository: { verifiedCommit: fixture.commit },
        run: { status: "idle", artifactDirectory: null },
        activeMilestoneId: null,
      })}\n`,
    );
    await writeFile(
      join(artifactRoot, "manual", "legacy", "result.json"),
      '{"schemaVersion":"1.0.0","stageId":"legacy","commandId":"legacy","status":"PASS","checks":[],"artifacts":[]}\n',
    );
    await verificationResult(fixture.root, "cited-run", {
      ...fixture,
      status: "PASS",
      finishedAt: "2026-08-01T00:00:00.000Z",
    });
    await verificationResult(fixture.root, "failed-cited-run", {
      ...fixture,
      status: "FAIL",
      finishedAt: "2026-08-02T00:00:00.000Z",
    });
    await verificationResult(fixture.root, "exact-run", {
      ...fixture,
      status: "PASS",
      eligible: true,
      finishedAt: "2026-08-03T00:00:00.000Z",
    });
    const outside = join(fixture.root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "must-not-count.txt"), "outside payload");
    await symlink(outside, join(artifactRoot, "linked-evidence"), "junction");

    const input = {
      repositoryRoot: fixture.root,
      inventoryId: "inventory-fixture",
      now: "2026-08-04T00:00:00.000Z",
      keepRecentRuns: 0,
      candidate: {
        gitCommit: fixture.commit,
        gitTree: fixture.tree,
        workingTreeDirty: false,
      },
    } as const;
    const first = await createArtifactInventory(input);
    const second = await createArtifactInventory(input);

    expect(second).toEqual(first);
    expect(() => assertArtifactInventory(first)).not.toThrow();
    expect(first.summary.legacyWorkspaceCount).toBe(6);
    expect(
      first.entries
        .filter((entry) => entry.path.includes("/workspaces/"))
        .map((entry) => entry.classification),
    ).toEqual(Array.from({ length: 6 }, () => "legacy-preserved-workspace"));
    expect(
      first.entries.find((entry) => entry.identity === "cited-run"),
    ).toMatchObject({
      classification: "cited-tracked",
      durableTrackedCitations: [".agent/citations.md"],
    });
    expect(
      first.entries.find((entry) => entry.identity === "failed-cited-run"),
    ).toMatchObject({ classification: "failed-diagnostic-cited" });
    expect(
      first.entries.find((entry) => entry.identity === "exact-run"),
    ).toMatchObject({ classification: "exact-accepted" });
    expect(
      first.entries.find((entry) => entry.path.endsWith("manual/legacy")),
    ).toMatchObject({ classification: "legacy-unmanaged-manual" });
    expect(
      first.entries.find((entry) => entry.identity === "linked-evidence"),
    ).toMatchObject({
      classification: "unknown-protected",
      fileCount: 0,
      totalBytes: 0,
      pathSafety: {
        entrySymlink: true,
        disposition: "symlink-rejected",
        symlinkPaths: ["."],
      },
    });

    const malformed = structuredClone(first) as unknown as {
      summary: { totalBytes: number };
    };
    malformed.summary.totalBytes += 1;
    expect(() => assertArtifactInventory(malformed)).toThrow(
      "inventory summary",
    );
  });
});
