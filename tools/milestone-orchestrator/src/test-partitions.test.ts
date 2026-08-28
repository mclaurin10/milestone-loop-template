import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { TestOwnershipReport } from "./test-ownership.js";
import { TEST_OWNER_IDS } from "./test-ownership.js";
import {
  assignFilesToDiscoveredConfigs,
  compareShadowSemantics,
  executeAggregateChildren,
  normalizeReportedTestFile,
  normalizeRepositoryPath,
  normalizeVitestReport,
  provePartitionMembership,
  type SemanticTestObservation,
} from "./test-partitions.js";

const integrationRoots: string[] = [];

afterAll(async () => {
  for (const root of integrationRoots)
    await rm(root, { recursive: true, force: true });
});

function observation(input: {
  readonly source: string;
  readonly file?: string;
  readonly identity?: string;
  readonly disposition?: string;
  readonly failureOutcome?: readonly string[];
}): SemanticTestObservation {
  const file = input.file ?? "tools/example.test.ts";
  const identity = input.identity ?? "example passes";
  return {
    source: input.source,
    file,
    identity,
    testId: `${file}::${identity}`,
    disposition: input.disposition ?? "passed",
    failureOutcome: input.failureOutcome ?? [],
  };
}

function rawVitestReport(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const repositoryRoot = resolve("repository-root");
  return {
    success: true,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: join(repositoryRoot, "tools", "example.test.ts"),
        status: "passed",
        assertionResults: [
          {
            fullName: "example passes",
            status: "passed",
            failureMessages: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("WP6 executable partition membership proof", () => {
  it("exposes one exact public command per canonical owner plus the shadow aggregate", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    for (const owner of TEST_OWNER_IDS)
      expect(packageJson.scripts[`test:partition:${owner}`]).toBe(
        `tsx tools/milestone-orchestrator/src/test-partition-cli.ts run ${owner}`,
      );
    expect(packageJson.scripts["test:partitions:shadow"]).toBe(
      "tsx tools/milestone-orchestrator/src/test-partition-cli.ts shadow",
    );
  });

  it("renders a stable exact disjoint union", () => {
    const left = provePartitionMembership(
      ["z.test.ts", "a.test.ts"],
      [
        { owner: "z-owner", files: ["z.test.ts"] },
        { owner: "a-owner", files: ["a.test.ts"] },
      ],
    );
    const right = provePartitionMembership(
      ["a.test.ts", "z.test.ts"],
      [
        { owner: "a-owner", files: ["a.test.ts"] },
        { owner: "z-owner", files: ["z.test.ts"] },
      ],
    );

    expect(left).toEqual(right);
    expect(left.status).toBe("PASS");
    expect(left.union.equalsUniverse).toBe(true);
    expect(left.pairwiseIntersections).toEqual([
      {
        leftOwner: "a-owner",
        rightOwner: "z-owner",
        count: 0,
        files: [],
      },
    ]);
  });

  it("fails a pairwise disjointness fixture", () => {
    const proof = provePartitionMembership(
      ["a.test.ts"],
      [
        { owner: "left", files: ["a.test.ts"] },
        { owner: "right", files: ["a.test.ts"] },
      ],
    );

    expect(proof.status).toBe("FAIL");
    expect(proof.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MULTIPLY_SELECTED_FILE",
        path: "a.test.ts",
      }),
    );
    expect(proof.pairwiseIntersections[0]?.files).toEqual(["a.test.ts"]);
  });

  it("fails an incomplete union fixture", () => {
    const proof = provePartitionMembership(
      ["a.test.ts", "missing.test.ts"],
      [{ owner: "only", files: ["a.test.ts"] }],
    );

    expect(proof.status).toBe("FAIL");
    expect(proof.union.missing).toEqual(["missing.test.ts"]);
    expect(proof.diagnostics).toContainEqual(
      expect.objectContaining({ code: "MISSING_DISCOVERED_FILE" }),
    );
  });

  it("fails an unexpected membership fixture", () => {
    const proof = provePartitionMembership(
      ["a.test.ts"],
      [{ owner: "only", files: ["a.test.ts", "unexpected.test.ts"] }],
    );

    expect(proof.status).toBe("FAIL");
    expect(proof.union.unexpected).toEqual(["unexpected.test.ts"]);
    expect(proof.diagnostics).toContainEqual(
      expect.objectContaining({ code: "UNEXPECTED_PARTITION_FILE" }),
    );
  });

  it("normalizes Windows separators and derives the most-specific discovered config", () => {
    expect(normalizeRepositoryPath("tools\\example.test.ts")).toBe(
      "tools/example.test.ts",
    );
    const report = {
      discovery: {
        sources: [
          {
            configPath: "vitest.config.ts",
            files: ["tools/nested/example.test.ts"],
          },
          {
            configPath: "tools/nested/vitest.config.ts",
            files: ["tools/nested/example.test.ts"],
          },
        ],
      },
    } as unknown as Pick<TestOwnershipReport, "discovery">;
    expect(
      assignFilesToDiscoveredConfigs(report, ["tools/nested/example.test.ts"]),
    ).toEqual([
      {
        configPath: "tools/nested/vitest.config.ts",
        files: ["tools/nested/example.test.ts"],
      },
    ]);
    const repositoryRoot = resolve("repository-root");
    expect(
      normalizeReportedTestFile(
        repositoryRoot,
        join(repositoryRoot, "tools", "nested", "example.test.ts"),
      ),
    ).toBe("tools/nested/example.test.ts");
  });
});

describe("WP6 normalized semantic shadow comparison", () => {
  it("deduplicates equivalent legacy overlap by stable test identity", () => {
    const result = compareShadowSemantics(
      [
        observation({ source: "fast" }),
        observation({ source: "orchestrator" }),
      ],
      [observation({ source: "controller-runtime" })],
    );

    expect(result.status).toBe("PASS");
    expect(result.legacy).toMatchObject({
      observationCount: 2,
      uniqueTestCount: 1,
      duplicateObservationCount: 1,
    });
    expect(result.partitions.uniqueTestCount).toBe(1);
  });

  it("fails a semantic mismatch fixture", () => {
    const result = compareShadowSemantics(
      [observation({ source: "legacy", disposition: "passed" })],
      [
        observation({
          source: "partition",
          disposition: "failed",
          failureOutcome: ["expected true to be false"],
        }),
      ],
    );

    expect(result.status).toBe("FAIL");
    expect(result.outcomeMismatches).toHaveLength(1);
    expect(result.missingTests).toEqual([]);
    expect(result.unexpectedTests).toEqual([]);
  });

  it("fails when one legacy semantic test identity is missing from partitions", () => {
    const result = compareShadowSemantics(
      [
        observation({ source: "legacy", identity: "kept" }),
        observation({ source: "legacy", identity: "representative omitted" }),
      ],
      [observation({ source: "partition", identity: "kept" })],
    );

    expect(result.status).toBe("FAIL");
    expect(result.missingTests).toEqual([
      "tools/example.test.ts::representative omitted",
    ]);
    expect(result.unexpectedTests).toEqual([]);
  });

  it("fails when partitions introduce an unexpected semantic test identity", () => {
    const result = compareShadowSemantics(
      [observation({ source: "legacy", identity: "kept" })],
      [
        observation({ source: "partition", identity: "kept" }),
        observation({ source: "partition", identity: "unexpected" }),
      ],
    );

    expect(result.status).toBe("FAIL");
    expect(result.missingTests).toEqual([]);
    expect(result.unexpectedTests).toEqual([
      "tools/example.test.ts::unexpected",
    ]);
  });

  it("fails multiply selected tests in new partitions", () => {
    const result = compareShadowSemantics(
      [observation({ source: "legacy" })],
      [
        observation({ source: "partition-a" }),
        observation({ source: "partition-b" }),
      ],
    );

    expect(result.status).toBe("FAIL");
    expect(result.multiplySelectedTests).toEqual([
      expect.objectContaining({ count: 2 }),
    ]);
  });
});

describe("WP6 raw Vitest disposition validation", () => {
  const repositoryRoot = resolve("repository-root");

  it("rejects success false even when counters otherwise claim a pass", () => {
    expect(() =>
      normalizeVitestReport(
        repositoryRoot,
        "success-false",
        rawVitestReport({ success: false }),
      ),
    ).toThrow(/success: true/);
  });

  it("rejects failed suites and tests", () => {
    expect(() =>
      normalizeVitestReport(
        repositoryRoot,
        "failed",
        rawVitestReport({
          numPassedTestSuites: 0,
          numFailedTestSuites: 1,
          numPassedTests: 0,
          numFailedTests: 1,
          testResults: [
            {
              name: join(repositoryRoot, "tools", "example.test.ts"),
              status: "failed",
              assertionResults: [
                {
                  fullName: "example fails",
                  status: "failed",
                  failureMessages: ["fixture failure"],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/failedSuites=1.*failedTests=1/);
  });

  it("rejects pending or skipped suites and tests", () => {
    expect(() =>
      normalizeVitestReport(
        repositoryRoot,
        "pending",
        rawVitestReport({
          numPassedTestSuites: 0,
          numPendingTestSuites: 1,
          numPassedTests: 0,
          numPendingTests: 1,
          testResults: [
            {
              name: join(repositoryRoot, "tools", "example.test.ts"),
              status: "passed",
              assertionResults: [
                {
                  fullName: "example is skipped",
                  status: "skipped",
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/pendingSuites=1.*pendingTests=1/);
  });

  it("rejects todo tests", () => {
    expect(() =>
      normalizeVitestReport(
        repositoryRoot,
        "todo",
        rawVitestReport({
          numPassedTests: 0,
          numTodoTests: 1,
          testResults: [
            {
              name: join(repositoryRoot, "tools", "example.test.ts"),
              status: "passed",
              assertionResults: [
                {
                  fullName: "example is todo",
                  status: "todo",
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/todoTests=1/);
  });

  it("rejects contradictory or malformed counters", () => {
    expect(() =>
      normalizeVitestReport(
        repositoryRoot,
        "contradictory",
        rawVitestReport({ numPassedTests: 2 }),
      ),
    ).toThrow(/contradictory test totals/);
    expect(() =>
      normalizeVitestReport(
        repositoryRoot,
        "malformed",
        rawVitestReport({ numTodoTests: "0" }),
      ),
    ).toThrow(/invalid numTodoTests/);
  });

  it("accepts a valid internally consistent all-passing report", () => {
    expect(
      normalizeVitestReport(repositoryRoot, "all-passing", rawVitestReport()),
    ).toMatchObject({
      files: ["tools/example.test.ts"],
      counts: { files: 1, tests: 1, passed: 1, failed: 0, skipped: 0 },
      observations: [{ disposition: "passed" }],
    });
  });
});

describe("WP6 aggregate child failure propagation", () => {
  it("propagates the exact child nonzero and does not start later children", async () => {
    const invoked: string[] = [];
    const execution = executeAggregateChildren(
      [{ id: "first" }, { id: "failing" }, { id: "never" }],
      async (child) => {
        invoked.push(child.id);
        return child.id === "failing"
          ? {
              status: "FAIL" as const,
              exitCode: 7,
              message: "fixture failure",
            }
          : { status: "PASS" as const, exitCode: 0, message: "passed" };
      },
    );

    await expect(execution).rejects.toMatchObject({
      childId: "failing",
      exitCode: 7,
    });
    expect(invoked).toEqual(["first", "failing"]);
  });

  it("maps a missing child exit code to one", async () => {
    await expect(
      executeAggregateChildren([{ id: "broken" }], async () => ({
        status: "ERROR" as const,
        exitCode: null,
        message: "no process code",
      })),
    ).rejects.toMatchObject({ exitCode: 1 });
  });
});

describe("WP6 integration-level omission mutation", () => {
  it("fails the aggregate, emits no PASS receipt, and retains the omitted semantic identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "wp6-omission-"));
    integrationRoots.push(root);
    const artifactDirectory = resolve(root, "evidence");
    const command = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        resolve("tools/milestone-orchestrator/src/test-partition-cli.ts"),
        "omission-mutation",
      ],
      {
        cwd: resolve("."),
        env: {
          ...process.env,
          LOOP_VERIFY_STAGE_ID: "wp6-shadow-omission-mutation",
          LOOP_VERIFY_COMMAND_ID: "test:partitions:shadow:omission-mutation",
          LOOP_VERIFY_COMMAND_ARTIFACT_DIR: artifactDirectory,
          LOOP_VERIFY_RUN_ID: "wp6-omission-integration",
          MILESTONE_LOOP_TEST_OMISSION_MUTATION: "1",
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    expect(command.error).toBeUndefined();
    expect(command.status).toBe(1);
    expect(existsSync(resolve(artifactDirectory, "result.json"))).toBe(false);
    const manifest = JSON.parse(
      await readFile(resolve(artifactDirectory, "manifest.json"), "utf8"),
    ) as {
      status: string;
      receipt: unknown;
      declaredArtifacts: {
        declarations: readonly { kind: string; path: string }[];
      };
    };
    const proof = JSON.parse(
      await readFile(
        resolve(
          artifactDirectory,
          "test-partition-omission-mutation-proof.json",
        ),
        "utf8",
      ),
    ) as {
      status: string;
      mutation: { omittedTestId: string };
      shadowComparison: { missingTests: readonly string[] };
    };
    expect(manifest).toMatchObject({ status: "FAIL", receipt: null });
    expect(
      manifest.declaredArtifacts.declarations.map((item) => item.kind),
    ).toEqual(
      expect.arrayContaining([
        "test-partition-omission-mutation-proof",
        "test-partition-shadow-legacy-vitest-report",
        "test-partition-vitest-report",
      ]),
    );
    expect(proof.status).toBe("FAIL");
    expect(proof.mutation.omittedTestId).toContain(
      "representative omitted by mutation",
    );
    expect(proof.shadowComparison.missingTests).toEqual([
      proof.mutation.omittedTestId,
    ]);
  }, 30_000);
});
