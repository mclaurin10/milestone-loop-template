import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { freshAdopterDefinitionPath } from "../../../fixtures/fresh-adopter/fixture.mjs";
import {
  ADOPTER_PACKAGE_DEFINITION_SCHEMA_VERSION,
  assertAdopterPackageDefinition,
  createAdopterPackage,
} from "./adopter-package.js";
import { parseAdopterPackageCliArguments } from "./adopter-package-cli.js";
import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";

const temporaryDirectories: string[] = [];
const definitionPath = freshAdopterDefinitionPath;
const fixtureCleanupOptions = { recursive: true, force: true } as const;
const fixtureCleanupRetryCodes = new Set([
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "ENOTEMPTY",
  "EPERM",
]);
const fixtureCleanupMaxRetries = 5;
const fixtureCleanupRetryDelayMs = 50;
type DirectoryRemover = (
  directory: string,
  options: typeof fixtureCleanupOptions,
) => Promise<void>;
type CleanupRetryWaiter = (delayMs: number) => Promise<void>;

async function waitForFixtureCleanupRetry(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function removeTemporaryDirectory(
  directory: string,
  removeDirectory: DirectoryRemover = rm,
  waitForRetry: CleanupRetryWaiter = waitForFixtureCleanupRetry,
): Promise<void> {
  for (let retry = 0; ; retry += 1) {
    try {
      await removeDirectory(directory, fixtureCleanupOptions);
      return;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (
        retry >= fixtureCleanupMaxRetries ||
        !code ||
        !fixtureCleanupRetryCodes.has(code)
      )
        throw error;
      await waitForRetry(fixtureCleanupRetryDelayMs * (retry + 1));
    }
  }
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await removeTemporaryDirectory(directory);
});

async function temporaryParent(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "adopter-package-test-"));
  temporaryDirectories.push(root);
  return root;
}

function git(root: string, ...args: readonly string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Fixture git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

describe("adopter package definition", () => {
  it("retries transient owned-directory cleanup failures", async () => {
    let attempts = 0;
    const transientFailure = Object.assign(
      new Error("fixture directory is temporarily non-empty"),
      { code: "ENOTEMPTY" },
    );

    await removeTemporaryDirectory("fixture", async () => {
      attempts += 1;
      if (attempts === 1) throw transientFailure;
    });

    expect(attempts).toBe(2);
  });

  it("does not suppress permanent owned-directory cleanup failures", async () => {
    let attempts = 0;
    const permanentFailure = Object.assign(
      new Error("fixture directory cannot be removed"),
      { code: "EACCES" },
    );

    await expect(
      removeTemporaryDirectory("fixture", async () => {
        attempts += 1;
        throw permanentFailure;
      }),
    ).rejects.toBe(permanentFailure);

    expect(attempts).toBe(1);
  });

  it("bounds persistent transient owned-directory cleanup failures", async () => {
    let attempts = 0;
    const transientFailure = Object.assign(
      new Error("fixture directory remains temporarily non-empty"),
      { code: "ENOTEMPTY" },
    );

    await expect(
      removeTemporaryDirectory(
        "fixture",
        async () => {
          attempts += 1;
          throw transientFailure;
        },
        async () => undefined,
      ),
    ).rejects.toBe(transientFailure);

    expect(attempts).toBe(fixtureCleanupMaxRetries + 1);
  });

  it("accepts only the strict generic definition and CLI shape", async () => {
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    expect(assertAdopterPackageDefinition(definition)).toEqual(definition);
    expect(
      parseAdopterPackageCliArguments([
        "--definition",
        "definition.json",
        "--output",
        "fresh-repository",
      ]),
    ).toEqual({
      definitionPath: "definition.json",
      outputPath: "fresh-repository",
    });
    expect(
      parseAdopterPackageCliArguments([
        "--",
        "--definition",
        "definition.json",
        "--output",
        "fresh-repository",
      ]),
    ).toEqual({
      definitionPath: "definition.json",
      outputPath: "fresh-repository",
    });
    expect(() =>
      parseAdopterPackageCliArguments(["--definition", "definition.json"]),
    ).toThrow(/requires --definition.*--output/);
    expect(() =>
      parseAdopterPackageCliArguments([
        "--definition",
        "one.json",
        "--definition",
        "two.json",
        "--output",
        "repo",
      ]),
    ).toThrow(/only once/);
    expect(() =>
      parseAdopterPackageCliArguments([
        "--",
        "--",
        "--definition",
        "definition.json",
        "--output",
        "repo",
      ]),
    ).toThrow(/Unknown adopter package option: --/);
  });

  it("rejects extra keys, unsafe paths, source identities, and bad Git identity", () => {
    const valid = {
      schemaVersion: ADOPTER_PACKAGE_DEFINITION_SCHEMA_VERSION,
      project: {
        name: "Fresh Lab",
        packageName: "fresh-lab",
        targetBranch: "main",
      },
      git: {
        userName: "Maintainer",
        userEmail: "maintainer@example.invalid",
        timestamp: "2026-08-15T19:00:00.000Z",
      },
      authority: {
        projectGoalPath: "authority/PROJECT_GOAL.md",
        acceptanceProsePath: "authority/ACCEPTANCE.md",
        acceptanceManifestPath: "authority/acceptance-manifest.json",
        hiddenValidationProtocolPath: "authority/HIDDEN.md",
      },
      identifiers: {
        commissioningId: "fresh-commissioning.v1",
        invariantSuiteId: "fresh-invariants.v1",
        scopePolicyId: "fresh-scope.v1",
        slowSuiteRegistryId: "fresh-slow.v1",
        reconciliationPolicyId: "fresh-reconciliation.v1",
      },
    };
    expect(() =>
      assertAdopterPackageDefinition({ ...valid, unexpected: true }),
    ).toThrow(/must be strict/);
    expect(() =>
      assertAdopterPackageDefinition({
        ...valid,
        authority: { ...valid.authority, projectGoalPath: "../goal.md" },
      }),
    ).toThrow(/authority source paths/);
    expect(() =>
      assertAdopterPackageDefinition({
        ...valid,
        project: { ...valid.project, name: "Ski Tycoon" },
      }),
    ).toThrow(/source-project identity/);
    expect(() =>
      assertAdopterPackageDefinition({
        ...valid,
        project: { ...valid.project, targetBranch: "bad branch" },
      }),
    ).toThrow(/target branch is invalid/);
    expect(() =>
      assertAdopterPackageDefinition({
        ...valid,
        git: { ...valid.git, timestamp: "yesterday" },
      }),
    ).toThrow(/Git identity/);
  });
});

describe("fresh adopter package creation", () => {
  it("creates an adopter-owned bootstrap history with no manual verifier pin", async () => {
    const parent = await temporaryParent();
    const outputRoot = join(parent, "repository");
    const result = await createAdopterPackage({
      definitionPath,
      outputPath: outputRoot,
    });

    expect(result.status).toBe("PASS");
    expect(result.project).toEqual({
      name: "Alpine Loop Lab",
      packageName: "alpine-loop-lab",
      targetBranch: "main",
      profile: "bootstrap",
    });
    expect(result.git).toMatchObject({
      branch: "main",
      commitCount: 2,
      clean: true,
    });
    expect(result.git.authorityBaseCommit).not.toBe(
      result.git.commissioningInputCommit,
    );
    expect(
      git(
        outputRoot,
        "merge-base",
        "--is-ancestor",
        result.git.authorityBaseCommit,
        result.git.commissioningInputCommit,
      ),
    ).toBe("");
    expect(
      git(
        outputRoot,
        "log",
        "--all",
        "--format=%H",
        "--",
        ".agent/readiness-profile-activated.json",
      ),
    ).toBe("");

    const packageJson = JSON.parse(
      await readFile(join(outputRoot, "package.json"), "utf8"),
    );
    expect(packageJson.milestoneLoop).toMatchObject({
      verification: { defaultProfile: "bootstrap" },
      productionBuild: { script: "build:production", outputRoots: ["dist"] },
    });
    expect(packageJson.scripts["verify:bootstrap:browser"]).toMatch(
      /bootstrap-evidence.*browser/,
    );
    expect(packageJson.scripts).not.toEqual(
      expect.objectContaining({
        "verify:dependencies": expect.stringMatching(/placeholder-check/),
      }),
    );

    const generatedConfig = JSON.parse(
      await readFile(
        join(outputRoot, "tools/milestone-orchestrator/config/default.json"),
        "utf8",
      ),
    ) as unknown;
    const generatedConfigSchema = JSON.parse(
      await readFile(
        join(
          outputRoot,
          "tools/milestone-orchestrator/schemas/orchestrator-config.schema.json",
        ),
        "utf8",
      ),
    ) as unknown;
    const generatedModelPolicySchema = JSON.parse(
      await readFile(
        join(
          outputRoot,
          "tools/milestone-orchestrator/schemas/model-policy.schema.json",
        ),
        "utf8",
      ),
    ) as unknown;
    expect(
      validateJsonSchema202012(generatedConfigSchema, generatedConfig, [
        generatedModelPolicySchema,
      ]),
    ).toEqual({ valid: true, errors: [] });

    const verifier = await readFile(
      join(outputRoot, "scripts/verify.mjs"),
      "utf8",
    );
    expect(verifier).not.toContain("ESTABLISHED_IMMUTABLE_LOCK_SHA256");
    expect(verifier).not.toContain(
      result.generated.immutableContractLockSha256,
    );
    expect(result.generated.immutableContractLockSha256).not.toBe(
      "d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050",
    );

    const invariantRegistry = JSON.parse(
      await readFile(
        join(
          outputRoot,
          "tools/milestone-orchestrator/config/invariant-suite.json",
        ),
        "utf8",
      ),
    ) as {
      readonly entries: readonly {
        readonly id: string;
        readonly ownerPaths: readonly string[];
        readonly argv: readonly string[];
        readonly expectedArtifactKinds: readonly string[];
      }[];
    };
    expect(
      invariantRegistry.entries.find(
        (entry) => entry.id === "protected-integrity",
      ),
    ).toMatchObject({
      ownerPaths: expect.arrayContaining([
        "tools/milestone-orchestrator/src/contract-integrity.ts",
      ]),
      argv: [
        "node",
        "node_modules/tsx/dist/cli.mjs",
        "tools/milestone-orchestrator/src/verification-cli.ts",
        "contract-integrity",
      ],
      expectedArtifactKinds: ["contract-integrity-report"],
    });
    expect(
      existsSync(
        join(
          outputRoot,
          "tools/milestone-orchestrator/src/contract-integrity.ts",
        ),
      ),
    ).toBe(true);

    const activeSurface = await Promise.all(
      [
        "PROJECT_GOAL.md",
        "evals/ACCEPTANCE.md",
        "evals/acceptance-manifest.json",
        "evals/immutable-contract-lock.json",
        "package.json",
        "tools/milestone-orchestrator/config/default.json",
        "tools/milestone-orchestrator/config/invariant-suite.json",
        "tools/milestone-orchestrator/config/verification-scope-policy.json",
        "tools/milestone-orchestrator/config/slow-suite-registry.json",
        "tools/milestone-orchestrator/config/commissioning-input.json",
        "tools/milestone-orchestrator/schemas/model-policy.schema.json",
        "tools/milestone-orchestrator/schemas/orchestrator-config.schema.json",
      ].map((path) => readFile(join(outputRoot, path), "utf8")),
    );
    expect(activeSurface.join("\n")).not.toMatch(
      /d-?0?31|d-?0?32|ski[ -]?tycoon|milestone-loop-template|example project|89f3ea|8928aecc/i,
    );
    expect(result.files.length).toBeGreaterThan(80);
    expect(
      git(outputRoot, "status", "--porcelain=v1", "--untracked-files=all"),
    ).toBe("");
  }, 30_000);

  it("is deterministic for equal input and refuses every existing output", async () => {
    const parent = await temporaryParent();
    const left = await createAdopterPackage({
      definitionPath,
      outputPath: join(parent, "left"),
    });
    const right = await createAdopterPackage({
      definitionPath,
      outputPath: join(parent, "right"),
    });

    expect(right.git).toEqual(left.git);
    expect(right.generated).toEqual(left.generated);
    expect(right.files).toEqual(left.files);
    await expect(
      createAdopterPackage({
        definitionPath,
        outputPath: join(parent, "left"),
      }),
    ).rejects.toThrow(/output already exists/);
  }, 30_000);
});
