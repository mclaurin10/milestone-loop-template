import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEST_OWNERSHIP_PATH,
  formatTestOwnershipFailure,
  runVitestDiscoveryPass,
  TEST_OWNER_IDS,
  validateRepeatedDiscovery,
  validateTestOwnership,
} from "./test-ownership.js";

import type { CommandExecutionSummary } from "./contracts.js";

const fixtureFiles = [
  "fixtures/oci-candidate/candidate.case.ts",
  "tools/milestone-orchestrator/src/core.test.ts",
  "tools/milestone-orchestrator/template/bootstrap-adopter/scaffold/app/kernel.test.ts",
  "tools/root.test.mjs",
] as const;

function fixtureCatalogue(): {
  schemaVersion: string;
  id: string;
  owners: { id: string; files: string[] }[];
} {
  return {
    schemaVersion: "1.0.0",
    id: "milestone-loop-test-ownership.v1",
    owners: [
      {
        id: "controller-runtime",
        files: ["tools/milestone-orchestrator/src/core.test.ts"],
      },
      { id: "repository-tooling", files: ["tools/root.test.mjs"] },
      {
        id: "adopter-template",
        files: [
          "tools/milestone-orchestrator/template/bootstrap-adopter/scaffold/app/kernel.test.ts",
        ],
      },
      {
        id: "trusted-container-fixture",
        files: ["fixtures/oci-candidate/candidate.case.ts"],
      },
    ],
  };
}

function codes(value: ReturnType<typeof validateTestOwnership>): string[] {
  return value.diagnostics.map((item) => item.code);
}

function passingDiscoveryCommand(
  id: string,
  stdoutPath: string,
  stderrPath: string,
): CommandExecutionSummary {
  return {
    id,
    displayCommand: "pnpm exec vitest list",
    status: "PASS",
    exitCode: 0,
    signal: null,
    startedAt: "2026-08-29T00:00:00.000Z",
    finishedAt: "2026-08-29T00:00:00.001Z",
    durationMs: 1,
    stdoutPath,
    stderrPath,
    stdoutSha256: "0".repeat(64),
    stderrSha256: "0".repeat(64),
    parser: "exit-code",
    parsedArtifactPath: null,
    message: "Command passed.",
    receipt: null,
    receiptAbsenceReason: "Discovery does not own a receipt.",
  };
}

async function withDiscoveryFixture(
  output: string | null,
): Promise<readonly string[]> {
  const artifactDirectory = await mkdtemp(
    join(tmpdir(), "test-ownership-discovery-"),
  );
  try {
    return await runVitestDiscoveryPass(
      {
        repositoryRoot: process.cwd(),
        artifactDirectory,
        commandId: "fixture-discovery",
        surfaceId: "fixture",
        configPath: "vitest.config.ts",
        filters: [],
      },
      async (command, options) => {
        const declaredOutput = command.args
          .find((argument) => argument.startsWith("--json="))
          ?.slice("--json=".length);
        if (!declaredOutput)
          throw new Error("Discovery command omitted its JSON output path.");
        if (output !== null) await writeFile(declaredOutput, output, "utf8");
        const stdoutPath = resolve(
          options.artifactDirectory,
          `${command.id}.stdout.log`,
        );
        const stderrPath = resolve(
          options.artifactDirectory,
          `${command.id}.stderr.log`,
        );
        await writeFile(
          stdoutPath,
          "Scope: all 2 workspace projects\nAlready up to date\n",
          "utf8",
        );
        await writeFile(stderrPath, "", "utf8");
        return passingDiscoveryCommand(command.id, stdoutPath, stderrPath);
      },
    );
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true });
  }
}

describe("test ownership classification", () => {
  it("reads declared discovery JSON instead of polluted command stdout", async () => {
    const file = resolve(
      "tools/milestone-orchestrator/src/test-ownership.test.ts",
    );

    await expect(
      withDiscoveryFixture(JSON.stringify([{ file }])),
    ).resolves.toEqual([
      "tools/milestone-orchestrator/src/test-ownership.test.ts",
    ]);
  });

  it("fails closed when declared discovery JSON is missing or malformed", async () => {
    await expect(withDiscoveryFixture(null)).rejects.toThrow(
      /did not write its declared JSON file/,
    );
    await expect(withDiscoveryFixture("not json")).rejects.toThrow(
      /did not emit JSON/,
    );
  });

  it("accepts the canonical tracked catalogue with all current ownership classes", async () => {
    const catalogue = JSON.parse(
      await readFile(resolve(DEFAULT_TEST_OWNERSHIP_PATH), "utf8"),
    ) as {
      readonly owners: readonly {
        readonly id: string;
        readonly files: readonly string[];
      }[];
    };
    const discovered = catalogue.owners.flatMap((owner) => owner.files).sort();
    const result = validateTestOwnership(discovered, catalogue);

    expect(result.status).toBe("PASS");
    expect(result.diagnostics).toEqual([]);
    expect(result.owners.map((owner) => [owner.id, owner.count])).toEqual([
      ["controller-runtime", 79],
      ["repository-tooling", 1],
      ["adopter-template", 2],
      ["trusted-container-fixture", 1],
    ]);
    expect(result.discoveredFiles).toHaveLength(83);
  });

  it("rejects a discovered but unclassified test with a stable action", () => {
    const result = validateTestOwnership(
      [...fixtureFiles, "tools/new-owner.test.ts"].sort(),
      fixtureCatalogue(),
    );

    expect(codes(result)).toContain("UNCLASSIFIED_TEST");
    expect(result.diagnostics).toContainEqual({
      code: "UNCLASSIFIED_TEST",
      path: "tools/new-owner.test.ts",
      message:
        "Discovered test tools/new-owner.test.ts has no valid owner. Add it to exactly one ownership block.",
    });
  });

  it("rejects a test assigned to multiple owners", () => {
    const catalogue = fixtureCatalogue();
    catalogue.owners[1]?.files.push(
      "tools/milestone-orchestrator/src/core.test.ts",
    );
    catalogue.owners[1]?.files.sort();

    const result = validateTestOwnership(fixtureFiles, catalogue);

    expect(codes(result)).toContain("MULTIPLE_OWNERS");
    expect(
      result.diagnostics.find((item) => item.code === "MULTIPLE_OWNERS"),
    ).toMatchObject({
      path: "tools/milestone-orchestrator/src/core.test.ts",
    });
  });

  it("rejects a stale catalogue entry that discovery no longer resolves", () => {
    const catalogue = fixtureCatalogue();
    catalogue.owners[0]?.files.push(
      "tools/milestone-orchestrator/src/removed.test.ts",
    );
    catalogue.owners[0]?.files.sort();

    const result = validateTestOwnership(fixtureFiles, catalogue);

    expect(codes(result)).toContain("STALE_CATALOGUE_ENTRY");
    expect(
      result.diagnostics.find((item) => item.code === "STALE_CATALOGUE_ENTRY"),
    ).toMatchObject({
      path: "tools/milestone-orchestrator/src/removed.test.ts",
    });
  });

  it("rejects an unknown owner independently from catalogue contents", () => {
    const catalogue = fixtureCatalogue();
    if (catalogue.owners[0]) catalogue.owners[0].id = "controller-typo";

    const result = validateTestOwnership(fixtureFiles, catalogue);

    expect(codes(result)).toContain("INVALID_OWNER");
    expect(
      result.diagnostics.find((item) => item.code === "INVALID_OWNER"),
    ).toMatchObject({ path: "controller-typo" });
    expect(TEST_OWNER_IDS).not.toContain("controller-typo");
  });

  it("rejects duplicate and case-ambiguous discovery", () => {
    const result = validateRepeatedDiscovery("fixture", [
      ["tools/a.test.ts", "tools/a.test.ts", "tools/B.test.ts"],
      ["tools/a.test.ts", "tools/b.test.ts"],
    ]);

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "AMBIGUOUS_DISCOVERY",
      "NONDETERMINISTIC_DISCOVERY",
    ]);
  });

  it("rejects nondeterministic discovery and renders diagnostics stably", () => {
    const result = validateRepeatedDiscovery("fixture", [
      ["tools/a.test.ts"],
      ["tools/b.test.ts"],
    ]);

    expect(result.diagnostics).toEqual([
      {
        code: "NONDETERMINISTIC_DISCOVERY",
        path: null,
        message:
          "Discovery fixture changed between repeated runs; first-only=[tools/a.test.ts], second-only=[tools/b.test.ts]. Stabilize Vitest discovery.",
      },
    ]);
    expect(formatTestOwnershipFailure(result.diagnostics)).toBe(
      [
        "Test ownership gate failed with 1 diagnostic:",
        "- NONDETERMINISTIC_DISCOVERY: Discovery fixture changed between repeated runs; first-only=[tools/a.test.ts], second-only=[tools/b.test.ts]. Stabilize Vitest discovery.",
      ].join("\n"),
    );
  });
});
