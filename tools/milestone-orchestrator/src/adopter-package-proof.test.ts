import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseAdopterPackageProofCliArguments } from "./adopter-package-proof-cli.js";
import { auditBootstrapVerification } from "./adopter-package-proof.js";

const temporaryRoots: string[] = [];
const commit = "a".repeat(40);
const tree = "b".repeat(40);
const stageIds = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "bootstrap-tests",
  "bootstrap-simulation",
  "bootstrap-persistence",
  "bootstrap-browser",
  "contract-integrity",
] as const;

function digest(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<Buffer> {
  const contents = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  return contents;
}

async function createAuditFixture(): Promise<{
  root: string;
  mutableArtifact: string;
  mutableReceipt: string;
  screenshotPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "fresh-adopter-audit-"));
  temporaryRoots.push(root);
  const stages: Record<string, unknown>[] = [];
  let mutableArtifact = "";
  let mutableReceipt = "";
  let screenshotPath = "";

  for (const stageId of stageIds) {
    if (stageId === "contract-integrity") {
      stages.push({
        id: stageId,
        required: true,
        status: "PASS",
        commands: [],
      });
      continue;
    }
    const directory = join("stages", stageId, "01-proof");
    const declarations: Record<string, unknown>[] = [];
    const addArtifact = async (
      name: string,
      kind: string,
      contents: Buffer | string,
    ): Promise<void> => {
      const absolute = join(root, directory, name);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, contents);
      const buffer = Buffer.isBuffer(contents)
        ? contents
        : Buffer.from(contents);
      declarations.push({
        path: name,
        kind,
        bytes: buffer.byteLength,
        sha256: digest(buffer),
      });
      mutableArtifact ||= absolute;
      if (kind === "screenshot") screenshotPath = absolute;
    };

    if (stageId === "bootstrap-tests")
      await addArtifact(
        "vitest-report.json",
        "vitest-report",
        `${JSON.stringify({ numPassedTests: 4, numFailedTests: 0 })}\n`,
      );
    else if (stageId === "bootstrap-browser") {
      await addArtifact("bootstrap.png", "screenshot", Buffer.alloc(1_500, 7));
      await addArtifact(
        "browser-diagnostics.json",
        "browser-diagnostics",
        `${JSON.stringify({
          status: "PASS",
          consoleErrors: [],
          pageErrors: [],
          requestFailures: [],
        })}\n`,
      );
      await addArtifact(
        "visual-review.json",
        "visual-review",
        `${JSON.stringify({ status: "PASS" })}\n`,
      );
    } else
      await addArtifact(
        `${stageId}-report.json`,
        `${stageId}-report`,
        `${JSON.stringify({ status: "PASS" })}\n`,
      );

    const receipt = {
      schemaVersion: "1.0.0",
      stageId,
      commandId: `${stageId}-command`,
      status: "PASS",
      checks: [
        { id: `${stageId}-check`, summary: "real boundary", status: "PASS" },
      ],
      artifacts: declarations,
    };
    const receiptPath = join(root, directory, "result.json");
    const receiptContents = await writeJson(receiptPath, receipt);
    mutableReceipt ||= receiptPath;
    await writeJson(join(root, directory, "manifest.json"), {
      schemaVersion: "1.0.0",
      status: "PASS",
      candidate: { gitCommit: commit, gitTree: tree, workingTreeDirty: false },
      receipt: {
        path: "result.json",
        bytes: receiptContents.byteLength,
        sha256: digest(receiptContents),
      },
    });
    stages.push({
      id: stageId,
      required: true,
      status: "PASS",
      commands: [
        {
          script: `${stageId}-command`,
          status: "PASS",
          exitCode: 0,
          evidence: {
            receipt: `${directory.replaceAll("\\", "/")}/result.json`,
            valid: true,
            artifacts: declarations.map((declaration) => ({
              ...declaration,
              path: `${directory.replaceAll("\\", "/")}/${String(declaration["path"])}`,
            })),
          },
        },
      ],
    });
  }

  await writeJson(join(root, "result.json"), {
    schemaVersion: "2.1.0",
    runId: "verify-proof-fixture",
    status: "PASS",
    exitCode: 0,
    invocation: ["node", "scripts/verify.mjs"],
    profile: {
      id: "bootstrap",
      configuredDefault: "bootstrap",
      selectedByOverride: false,
      autonomousReadinessEquivalent: false,
    },
    completion: { claim: "bootstrap_complete", eligible: false },
    candidate: {
      gitCommit: commit,
      gitTree: tree,
      workingTreeDirty: false,
      nodeVersion: "v24.18.0",
      pnpmVersion: "11.15.1",
      readinessActivationMarkerSha256: null,
    },
    candidateFinal: {
      gitCommit: commit,
      gitTree: tree,
      workingTreeDirty: false,
      nodeVersion: "v24.18.0",
      pnpmVersion: "11.15.1",
      readinessActivationMarkerSha256: null,
    },
    identityDrift: { detected: false },
    summary: {
      requiredStageCount: 9,
      stageCounts: { PASS: 9, FAIL: 0, NOT_READY: 0, ERROR: 0 },
    },
    stages,
  });
  return { root, mutableArtifact, mutableReceipt, screenshotPath };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("fresh-adopter proof", () => {
  it("parses the strict retained-proof CLI", () => {
    expect(
      parseAdopterPackageProofCliArguments([
        "--definition",
        "fixture.json",
        "--artifact-dir",
        "artifacts/proof",
      ]),
    ).toEqual({
      definitionPath: "fixture.json",
      artifactDirectory: "artifacts/proof",
    });
    expect(() => parseAdopterPackageProofCliArguments([])).toThrow(
      /requires --definition/u,
    );
    expect(() =>
      parseAdopterPackageProofCliArguments([
        "--definition",
        "one",
        "--definition",
        "two",
        "--artifact-dir",
        "three",
      ]),
    ).toThrow(/only once/u);
    expect(() =>
      parseAdopterPackageProofCliArguments([
        "--definition",
        "one",
        "--artifact-dir",
        "two",
        "--profile",
        "readiness",
      ]),
    ).toThrow(/Unknown/u);
  });

  it("independently matches bootstrap receipts and their artifacts", async () => {
    const fixture = await createAuditFixture();
    const audit = await auditBootstrapVerification({
      repositoryRoot: fixture.root,
      verificationRoot: fixture.root,
      expectedCommit: commit,
      expectedTree: tree,
    });
    expect(audit).toMatchObject({
      stageCount: 9,
      receiptCount: 8,
      artifactCount: 10,
      testCount: 4,
    });
    expect(audit.screenshot.bytes).toBe(1_500);

    const original = await readFile(fixture.mutableArtifact);
    await writeFile(
      fixture.mutableArtifact,
      Buffer.concat([original, Buffer.from("drift")]),
    );
    await expect(
      auditBootstrapVerification({
        repositoryRoot: fixture.root,
        verificationRoot: fixture.root,
        expectedCommit: commit,
        expectedTree: tree,
      }),
    ).rejects.toThrow(/identity mismatch/u);
  });

  it("rejects asserted PASS when a bootstrap stage owns no receipt", async () => {
    const fixture = await createAuditFixture();
    const resultPath = join(fixture.root, "result.json");
    const result = JSON.parse(await readFile(resultPath, "utf8")) as {
      stages: { id: string; commands: unknown[] }[];
    };
    const environment = result.stages.find(
      (stage) => stage.id === "environment",
    );
    if (!environment) throw new Error("fixture omitted environment stage");
    environment.commands = [];
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    await expect(
      auditBootstrapVerification({
        repositoryRoot: fixture.root,
        verificationRoot: fixture.root,
        expectedCommit: commit,
        expectedTree: tree,
      }),
    ).rejects.toThrow(/no receipt-owning command/u);
  });

  it("rejects missing or tampered command receipts", async () => {
    const missing = await createAuditFixture();
    await rm(missing.mutableReceipt);
    await expect(
      auditBootstrapVerification({
        repositoryRoot: missing.root,
        verificationRoot: missing.root,
        expectedCommit: commit,
        expectedTree: tree,
      }),
    ).rejects.toThrow();

    const tampered = await createAuditFixture();
    await writeFile(tampered.mutableReceipt, '{"status":"PASS"}\n');
    await expect(
      auditBootstrapVerification({
        repositoryRoot: tampered.root,
        verificationRoot: tampered.root,
        expectedCommit: commit,
        expectedTree: tree,
      }),
    ).rejects.toThrow(/schemaVersion|stageId/u);
  });

  it("rejects wrong candidate identity and an absent browser screenshot", async () => {
    const wrongCandidate = await createAuditFixture();
    const resultPath = join(wrongCandidate.root, "result.json");
    const result = JSON.parse(await readFile(resultPath, "utf8")) as {
      candidate: { gitCommit: string };
    };
    result.candidate.gitCommit = "c".repeat(40);
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    await expect(
      auditBootstrapVerification({
        repositoryRoot: wrongCandidate.root,
        verificationRoot: wrongCandidate.root,
        expectedCommit: commit,
        expectedTree: tree,
      }),
    ).rejects.toThrow(/candidate\.gitCommit/u);

    const absentScreenshot = await createAuditFixture();
    await rm(absentScreenshot.screenshotPath);
    await expect(
      auditBootstrapVerification({
        repositoryRoot: absentScreenshot.root,
        verificationRoot: absentScreenshot.root,
        expectedCommit: commit,
        expectedTree: tree,
      }),
    ).rejects.toThrow();
  });
});
