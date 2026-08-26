import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  durableCitations,
  evidenceContext,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "receipt-hardening-"));
  temporaryDirectories.push(directory);
  return directory;
}

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

async function citationFixture(
  trackedText: (input: {
    readonly manifestId: string;
    readonly normalizedArtifactDirectory: string;
  }) => string,
): Promise<{
  readonly repositoryRoot: string;
  readonly artifactDirectory: string;
  readonly manifestId: string;
  readonly commit: string;
  readonly tree: string;
}> {
  const parent = await temporaryDirectory();
  const repositoryRoot = join(parent, "repository");
  const artifactDirectory = join(parent, "e5");
  const manifestId = "manual-exact-citation-fixture-123456";
  await Promise.all([
    mkdir(repositoryRoot, { recursive: true }),
    mkdir(artifactDirectory, { recursive: true }),
  ]);
  git(repositoryRoot, "init", "-b", "main");
  git(repositoryRoot, "config", "user.name", "Citation Test");
  git(repositoryRoot, "config", "user.email", "citation@example.invalid");
  await writeFile(
    join(repositoryRoot, "citations.md"),
    trackedText({
      manifestId,
      normalizedArtifactDirectory: artifactDirectory.replaceAll("\\", "/"),
    }),
    "utf8",
  );
  git(repositoryRoot, "add", "citations.md");
  git(repositoryRoot, "commit", "-m", "citation fixture");
  return {
    repositoryRoot,
    artifactDirectory,
    manifestId,
    commit: git(repositoryRoot, "rev-parse", "HEAD"),
    tree: git(repositoryRoot, "rev-parse", "HEAD^{tree}"),
  };
}

const check = { id: "check-1", summary: "Fixture check passed." };

describe("writeReceipt hardening", () => {
  it("rejects hollow or escaping receipts before writing anything", async () => {
    const directory = await temporaryDirectory();
    const context = {
      artifactDirectory: directory,
      stageId: "hardening",
      commandId: "hardening-command",
    };
    await writeFile(join(directory, "report.json"), "{}\n", "utf8");
    const artifact = { path: "report.json", kind: "fixture-report" };

    await expect(writeReceipt(context, [], [artifact])).rejects.toThrow(
      /at least one passing check/,
    );
    await expect(
      writeReceipt(context, [{ id: " ", summary: "x" }], [artifact]),
    ).rejects.toThrow(/nonempty id/);
    await expect(
      writeReceipt(context, [check, { ...check }], [artifact]),
    ).rejects.toThrow(/check ids must be unique/);
    await expect(
      writeReceipt(context, [{ id: "check-1", summary: " " }], [artifact]),
    ).rejects.toThrow(/nonempty summary/);
    await expect(writeReceipt(context, [check], [])).rejects.toThrow(
      /at least one command-owned artifact/,
    );
    await expect(
      writeReceipt(context, [check], [{ path: "result.json", kind: "k" }]),
    ).rejects.toThrow(/result\.json/);
    await expect(
      writeReceipt(context, [check], [{ path: "../escape.json", kind: "k" }]),
    ).rejects.toThrow(/escapes the artifact directory/);
    await expect(
      writeReceipt(context, [check], [artifact, { ...artifact }]),
    ).rejects.toThrow(/artifact paths must be unique/);
    await expect(
      writeReceipt(context, [check], [{ path: "report.json", kind: " " }]),
    ).rejects.toThrow(/nonempty kind/);

    expect(existsSync(join(directory, "result.json"))).toBe(false);
  });

  it("writes a validated receipt for well-formed inputs", async () => {
    const directory = await temporaryDirectory();
    const previous = {
      stage: process.env["LOOP_VERIFY_STAGE_ID"],
      command: process.env["LOOP_VERIFY_COMMAND_ID"],
      artifactDirectory: process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"],
    };
    process.env["LOOP_VERIFY_STAGE_ID"] = "hardening-fixture";
    process.env["LOOP_VERIFY_COMMAND_ID"] = "hardening-command";
    process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = directory;
    try {
      const context = await evidenceContext(
        "fallback-stage",
        "fallback-command",
      );
      await writeFile(
        join(directory, "report.json"),
        '{"status":"PASS"}\n',
        "utf8",
      );
      await writeReceipt(
        context,
        [check],
        [{ path: "report.json", kind: "fixture-report" }],
      );
    } finally {
      for (const [key, value] of [
        ["LOOP_VERIFY_STAGE_ID", previous.stage],
        ["LOOP_VERIFY_COMMAND_ID", previous.command],
        ["LOOP_VERIFY_COMMAND_ARTIFACT_DIR", previous.artifactDirectory],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    const receipt = JSON.parse(
      await readFile(join(directory, "result.json"), "utf8"),
    ) as unknown;
    expect(receipt).toMatchObject({
      schemaVersion: "1.0.0",
      stageId: "hardening-fixture",
      commandId: "hardening-command",
      status: "PASS",
      checks: [{ id: "check-1", status: "PASS" }],
      artifacts: [{ path: "report.json", kind: "fixture-report" }],
    });
  });
});

describe("durable evidence citation matching", () => {
  it("does not treat an incidental short artifact basename as a citation", async () => {
    const fixture = await citationFixture(
      () => "Incidental prose contains e5 and a hash fragment deadbe5 only.\n",
    );

    await expect(
      durableCitations(fixture, fixture.manifestId),
    ).resolves.toEqual({
      trackedPaths: [],
      controllerStateReferences: [],
      activeReconciliationReference: null,
    });
  });

  it("accepts an exact unique manifest id in tracked text", async () => {
    const fixture = await citationFixture(
      ({ manifestId }) => `Exact evidence manifest: ${manifestId}.\n`,
    );

    await expect(
      durableCitations(fixture, fixture.manifestId),
    ).resolves.toMatchObject({ trackedPaths: ["citations.md"] });
  });

  it("accepts an exact normalized artifact path in tracked text", async () => {
    const fixture = await citationFixture(
      ({ normalizedArtifactDirectory }) =>
        `Exact evidence directory: ${normalizedArtifactDirectory}.\n`,
    );

    await expect(
      durableCitations(fixture, fixture.manifestId),
    ).resolves.toMatchObject({ trackedPaths: ["citations.md"] });
  });

  it("keeps external evidence uncited when no exact reference exists", async () => {
    const fixture = await citationFixture(
      () => "Only unrelated evidence identifiers and paths are cited here.\n",
    );
    const manifest = await writeManualEvidenceFailure(
      {
        repositoryRoot: fixture.repositoryRoot,
        artifactDirectory: fixture.artifactDirectory,
        stageId: "citation-fixture",
        commandId: "citation-fixture",
        manualEvidence: {
          manifestId: fixture.manifestId,
          createdAt: "2026-08-25T00:00:00.000Z",
          displayCommand: "citation fixture",
          candidate: {
            gitCommit: fixture.commit,
            gitTree: fixture.tree,
            workingTreeDirty: false,
          },
          telemetry: { runId: null, manifestPath: null },
          finalized: false,
          lastManifest: null,
        },
      },
      { kind: "infrastructure", message: "fixture outcome" },
    );

    expect(manifest).toMatchObject({
      citationClass: "uncited-at-creation",
      durableCitations: {
        trackedPaths: [],
        controllerStateReferences: [],
        activeReconciliationReference: null,
      },
    });
  });
});
