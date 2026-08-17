import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditCommandEvidence,
  generatedOfflineInstallArguments,
  parseFreshAdopterSmokeArguments,
  parsePnpmStorePath,
  resolveSourcePnpmStorePath,
} from "../ci/fresh-adopter-smoke.js";

const temporaryRoots: string[] = [];
const commit = "a".repeat(40);
const tree = "b".repeat(40);

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<Buffer> {
  const contents = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  return contents;
}

async function createEvidenceFixture(): Promise<{
  root: string;
  evidenceRoot: string;
  artifactPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "fresh-adopter-smoke-audit-"));
  temporaryRoots.push(root);
  const evidenceRoot = join(root, "evidence", "test-unit");
  const artifactPath = join(evidenceRoot, "vitest-report.json");
  const artifactContents = await writeJson(artifactPath, {
    numTotalTests: 4,
    numPassedTests: 4,
    numFailedTests: 0,
    numPendingTests: 0,
  });
  const receiptContents = await writeJson(join(evidenceRoot, "result.json"), {
    schemaVersion: "1.0.0",
    stageId: "bootstrap-tests",
    commandId: "test:unit",
    status: "PASS",
    checks: [
      {
        id: "test-production-boundary",
        summary: "real generated test boundary",
        status: "PASS",
      },
    ],
    artifacts: [
      {
        path: "vitest-report.json",
        kind: "vitest-report",
        bytes: artifactContents.byteLength,
        sha256: sha256(artifactContents),
      },
    ],
  });
  await writeJson(join(evidenceRoot, "manifest.json"), {
    schemaVersion: "1.0.0",
    stageId: "bootstrap-tests",
    commandId: "test:unit",
    status: "PASS",
    candidate: {
      gitCommit: commit,
      gitTree: tree,
      workingTreeDirty: false,
    },
    receipt: {
      path: "result.json",
      bytes: receiptContents.byteLength,
      sha256: sha256(receiptContents),
    },
  });
  return { root, evidenceRoot, artifactPath };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("fresh-adopter CI smoke", () => {
  it("parses the strict two-path CLI", () => {
    expect(
      parseFreshAdopterSmokeArguments([
        "--definition",
        "fixtures/fresh-adopter/definition.json",
        "--output",
        "artifacts/ci/fresh-adopter/smoke",
      ]),
    ).toEqual({
      definitionPath: "fixtures/fresh-adopter/definition.json",
      outputPath: "artifacts/ci/fresh-adopter/smoke",
    });
    expect(() =>
      parseFreshAdopterSmokeArguments([
        "--definition",
        "fixtures/fresh-adopter/definition.json",
      ]),
    ).toThrow(/requires --definition.*--output/u);
    expect(() =>
      parseFreshAdopterSmokeArguments([
        "--definition",
        "first.json",
        "--definition",
        "second.json",
        "--output",
        "artifacts/ci/smoke",
      ]),
    ).toThrow(/only once/u);
  });

  it("independently validates generated command receipts and artifacts", async () => {
    const fixture = await createEvidenceFixture();
    const result = await auditCommandEvidence({
      evidenceRoot: fixture.evidenceRoot,
      displayRoot: fixture.root,
      expectedStageId: "bootstrap-tests",
      expectedCommandId: "test:unit",
      expectedCommit: commit,
      expectedTree: tree,
      expectVitest: true,
    });
    expect(result.receipt.path).toBe("evidence/test-unit/result.json");
    expect(result.artifacts).toHaveLength(1);
    expect(result.tests).toEqual({
      total: 4,
      passed: 4,
      failed: 0,
      skipped: 0,
    });

    await writeFile(fixture.artifactPath, '{"numPassedTests":5}\n');
    await expect(
      auditCommandEvidence({
        evidenceRoot: fixture.evidenceRoot,
        displayRoot: fixture.root,
        expectedStageId: "bootstrap-tests",
        expectedCommandId: "test:unit",
        expectedCommit: commit,
        expectedTree: tree,
        expectVitest: true,
      }),
    ).rejects.toThrow(/bytes|sha256/u);
  });

  it("resolves the pinned source-cwd store and binds it to the offline child install", async () => {
    const sourceRoot = join(tmpdir(), "source-repository");
    const storePath = join(tmpdir(), "source-pnpm-store", "v11");
    const invocations: unknown[] = [];
    const resolved = await resolveSourcePnpmStorePath(
      sourceRoot,
      async (invocation) => {
        invocations.push(invocation);
        return { stdout: `${storePath}\n` };
      },
    );
    expect(resolved).toBe(storePath);
    expect(invocations).toEqual([
      {
        id: "pnpm-store-path",
        args: ["store", "path"],
        cwd: sourceRoot,
      },
    ]);
    expect(generatedOfflineInstallArguments(resolved)).toEqual([
      "install",
      "--offline",
      "--frozen-lockfile",
      "--package-import-method=copy",
      "--store-dir",
      storePath,
    ]);
  });

  it("fails closed for unavailable or ambiguous source-store identity", async () => {
    const sourceRoot = join(tmpdir(), "source-repository");
    const first = join(tmpdir(), "first-store", "v11");
    const second = join(tmpdir(), "second-store", "v11");
    expect(parsePnpmStorePath(`${first}\n`)).toBe(first);
    for (const output of ["", "relative/store\n", `${first}\n${second}\n`])
      expect(() => parsePnpmStorePath(output)).toThrow(/pnpm store path/u);
    expect(() => generatedOfflineInstallArguments("relative/store")).toThrow(
      /pnpm store path/u,
    );
    await expect(
      resolveSourcePnpmStorePath(sourceRoot, async () => {
        throw new Error("store command failed");
      }),
    ).rejects.toThrow(/store command failed/u);
  });
});
