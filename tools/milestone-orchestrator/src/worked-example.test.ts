import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_VERIFICATION_MANIFEST_PATH,
  SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH,
  loadHistoricalVerificationManifest,
  loadVerificationManifest,
} from "./config.js";
import { parseWorkedExampleCliArguments } from "./worked-example-cli.js";
import {
  WORKED_EXAMPLE_FILE_ROLES,
  assertWorkedExampleDescriptor,
  renderWorkedExampleValidationResult,
  validateWorkedExample,
  type WorkedExampleDescriptor,
} from "./worked-example.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const sourceExampleDirectory = resolve(repositoryRoot, "examples/ski-tycoon");
const descriptorRelativePath = "examples/ski-tycoon/worked-example.json";
const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}`,
    );
  return result.stdout.trim();
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exampleFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "worked-example-fixture-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "examples"), { recursive: true });
  await cp(sourceExampleDirectory, join(root, "examples/ski-tycoon"), {
    recursive: true,
  });
  git(root, "init", "--initial-branch=fixture-main");
  git(root, "config", "user.name", "Worked Example Fixture");
  git(root, "config", "user.email", "worked-example@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-m", "add worked example");
  return root;
}

async function descriptor(root: string): Promise<WorkedExampleDescriptor> {
  return JSON.parse(
    await readFile(join(root, descriptorRelativePath), "utf8"),
  ) as WorkedExampleDescriptor;
}

async function refreshPayloadIdentity(
  root: string,
  payloadPath: string,
): Promise<void> {
  const descriptorPath = join(root, descriptorRelativePath);
  const value = await descriptor(root);
  const file = value.files.find((entry) => entry.path === payloadPath);
  if (!file) throw new Error(`Fixture descriptor lacks ${payloadPath}.`);
  const contents = await readFile(join(dirname(descriptorPath), payloadPath));
  (file as { bytes: number; sha256: string }).bytes = contents.byteLength;
  (file as { bytes: number; sha256: string }).sha256 = createHash("sha256")
    .update(contents)
    .digest("hex");
  await writeJson(descriptorPath, value);
}

function commitFixture(root: string, message: string): void {
  git(root, "add", ".");
  git(root, "commit", "-m", message);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("worked-example descriptor", () => {
  it("accepts the strict canonical descriptor and rejects weakened semantics or duplicate roles", async () => {
    const raw = JSON.parse(
      await readFile(
        resolve(sourceExampleDirectory, "worked-example.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const valid = assertWorkedExampleDescriptor(raw);
    expect(valid.files.map((file) => file.role).sort()).toEqual(
      [...WORKED_EXAMPLE_FILE_ROLES].sort(),
    );

    expect(() =>
      assertWorkedExampleDescriptor({
        ...raw,
        semantics: {
          ...(raw["semantics"] as Record<string, unknown>),
          implicitFallbackAllowed: true,
        },
      }),
    ).toThrow(/legacy-only|inactive|non-executable/i);

    const files = structuredClone(raw["files"] as Record<string, unknown>[]);
    files[1]!["role"] = files[0]!["role"];
    expect(() => assertWorkedExampleDescriptor({ ...raw, files })).toThrow(
      /paths and roles must be exact and unique/i,
    );

    expect(() =>
      assertWorkedExampleDescriptor({
        ...raw,
        links: {
          ...(raw["links"] as Record<string, unknown>),
          configPath: "../default.json",
        },
      }),
    ).toThrow(/links are invalid|escape/i);
  });

  it("requires exactly one explicit descriptor CLI option", () => {
    expect(
      parseWorkedExampleCliArguments(["--descriptor", descriptorRelativePath]),
    ).toEqual({ descriptorPath: descriptorRelativePath });
    expect(() => parseWorkedExampleCliArguments([])).toThrow(/requires/i);
    expect(() =>
      parseWorkedExampleCliArguments([
        "--descriptor",
        descriptorRelativePath,
        "--descriptor",
        descriptorRelativePath,
      ]),
    ).toThrow(/exactly one/i);
    expect(() =>
      parseWorkedExampleCliArguments(["--input", descriptorRelativePath]),
    ).toThrow(/unknown/i);
  });
});

describe("worked-example package validation", () => {
  it("validates the exact tracked package deterministically without mutation", async () => {
    const root = await exampleFixture();
    const before = git(
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    );
    const first = await validateWorkedExample({
      repositoryRoot: root,
      descriptorPath: descriptorRelativePath,
    });
    const second = await validateWorkedExample({
      repositoryRoot: root,
      descriptorPath: descriptorRelativePath,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: "worked-example-validation.v1",
      status: "PASS",
      descriptor: {
        id: "ski-tycoon-historical-loop-configuration.v1",
        path: descriptorRelativePath,
      },
      semantics: {
        disposition: "historical-worked-example",
        manifestSchema: "verification-manifest.v1",
        activeRuntimeEligible: false,
        implicitFallbackAllowed: false,
        commissioningAllowed: false,
        executionAllowed: false,
      },
    });
    expect(first.files).toHaveLength(7);
    expect(renderWorkedExampleValidationResult(first)).toBe(
      renderWorkedExampleValidationResult(second),
    );
    expect(git(root, "status", "--porcelain=v1", "--untracked-files=all")).toBe(
      before,
    );
  });

  it("rejects payload identity drift and an untracked declared file", async () => {
    const drifted = await exampleFixture();
    await writeFile(
      join(drifted, "examples/ski-tycoon/slow-suite-registry.json"),
      "{}\n",
      "utf8",
    );
    commitFixture(drifted, "drift payload");
    await expect(
      validateWorkedExample({
        repositoryRoot: drifted,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/payload identity drifted/i);

    const untracked = await exampleFixture();
    git(
      untracked,
      "rm",
      "--cached",
      "examples/ski-tycoon/slow-suite-registry.json",
    );
    await expect(
      validateWorkedExample({
        repositoryRoot: untracked,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/must all be tracked/i);
  });

  it("rejects missing, extra, and non-regular package entries", async () => {
    const extra = await exampleFixture();
    await writeFile(
      join(extra, "examples/ski-tycoon/unlisted.json"),
      "{}\n",
      "utf8",
    );
    await expect(
      validateWorkedExample({
        repositoryRoot: extra,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/file set is not exact/i);

    const missing = await exampleFixture();
    await rm(join(missing, "examples/ski-tycoon/README.md"));
    await expect(
      validateWorkedExample({
        repositoryRoot: missing,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/file set is not exact/i);

    const nonRegular = await exampleFixture();
    const payload = join(
      nonRegular,
      "examples/ski-tycoon/slow-suite-registry.json",
    );
    await rm(payload);
    await mkdir(payload);
    await expect(
      validateWorkedExample({
        repositoryRoot: nonRegular,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/regular non-symlink file/i);
  });

  it("rejects lexical and resolved containment escapes", async () => {
    const root = await exampleFixture();
    const outside = await mkdtemp(join(tmpdir(), "worked-example-outside-"));
    temporaryDirectories.push(outside);
    await cp(sourceExampleDirectory, outside, { recursive: true });

    await expect(
      validateWorkedExample({
        repositoryRoot: root,
        descriptorPath: resolve(outside, "worked-example.json"),
      }),
    ).rejects.toThrow(/escapes the repository/i);

    const link = join(root, "linked-example");
    await symlink(
      outside,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      validateWorkedExample({
        repositoryRoot: root,
        descriptorPath: join(link, "worked-example.json"),
      }),
    ).rejects.toThrow(/escapes the repository/i);
  });

  it("rejects invalid JSON and strict payload schema drift after honest rehashing", async () => {
    const invalidJson = await exampleFixture();
    await writeFile(
      join(invalidJson, "examples/ski-tycoon/slow-suite-registry.json"),
      "{\n",
      "utf8",
    );
    await refreshPayloadIdentity(invalidJson, "slow-suite-registry.json");
    commitFixture(invalidJson, "record invalid json identity");
    await expect(
      validateWorkedExample({
        repositoryRoot: invalidJson,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/JSON is invalid/i);

    const invalidSchema = await exampleFixture();
    const configPath = join(invalidSchema, "examples/ski-tycoon/default.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    delete config["agentPolicy"];
    await writeJson(configPath, config);
    await refreshPayloadIdentity(invalidSchema, "default.json");
    commitFixture(invalidSchema, "record invalid schema identity");
    await expect(
      validateWorkedExample({
        repositoryRoot: invalidSchema,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/invalid orchestrator config/i);
  });

  it("rejects registry, check-catalogue, and protected-path cross-link drift", async () => {
    const identity = await exampleFixture();
    const identityDescriptor = await descriptor(identity);
    (
      identityDescriptor.identities as {
        invariantSuiteId: string;
      }
    ).invariantSuiteId = "different-invariants.v1";
    await writeJson(join(identity, descriptorRelativePath), identityDescriptor);
    commitFixture(identity, "drift linked identity");
    await expect(
      validateWorkedExample({
        repositoryRoot: identity,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/invariant-suite identity drifted/i);

    const checks = await exampleFixture();
    const policyPath = join(
      checks,
      "examples/ski-tycoon/verification-scope-policy.json",
    );
    const policy = JSON.parse(await readFile(policyPath, "utf8")) as {
      mandatoryChecks: Record<string, string[]>;
    };
    const firstChecks = Object.values(policy.mandatoryChecks)[0];
    if (!firstChecks) throw new Error("Fixture policy lacks mandatory checks.");
    firstChecks.push("unknown-example-check");
    await writeJson(policyPath, policy);
    await refreshPayloadIdentity(checks, "verification-scope-policy.json");
    commitFixture(checks, "drift check catalogue");
    await expect(
      validateWorkedExample({
        repositoryRoot: checks,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/unknown check IDs/i);

    const protection = await exampleFixture();
    const protectionConfigPath = join(
      protection,
      "examples/ski-tycoon/default.json",
    );
    const protectionConfig = JSON.parse(
      await readFile(protectionConfigPath, "utf8"),
    ) as { protectedPaths: string[] };
    protectionConfig.protectedPaths = protectionConfig.protectedPaths.filter(
      (path) =>
        path !== "docs/audits/LOOP_EFFECTIVENESS_AND_EFFICIENCY_AUDIT.md",
    );
    await writeJson(protectionConfigPath, protectionConfig);
    await refreshPayloadIdentity(protection, "default.json");
    commitFixture(protection, "drift protected coverage");
    await expect(
      validateWorkedExample({
        repositoryRoot: protection,
        descriptorPath: descriptorRelativePath,
      }),
    ).rejects.toThrow(/requires protected paths.*cannot enforce/i);
  });
});

describe("active and historical manifest isolation", () => {
  it("keeps the Ski manifest explicit and absent from active source configuration", async () => {
    expect(DEFAULT_VERIFICATION_MANIFEST_PATH).toBe(
      ".agent/verification-manifest.json",
    );
    await expect(
      loadVerificationManifest(
        repositoryRoot,
        SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH,
      ),
    ).rejects.toThrow(/invalid verification manifest/i);
    await expect(
      loadHistoricalVerificationManifest(
        repositoryRoot,
        "ski-tycoon-worked-example",
      ),
    ).resolves.toMatchObject({
      path: SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH,
    });

    const activePaths = [
      ".agent/verification-manifest.json",
      "tools/milestone-orchestrator/config/source-commissioning-input.json",
      "tools/milestone-orchestrator/config/default.json",
      "tools/milestone-orchestrator/config/invariant-suite.json",
      "tools/milestone-orchestrator/config/slow-suite-registry.json",
      "tools/milestone-orchestrator/config/verification-scope-policy.json",
    ];
    const activeBytes = (
      await Promise.all(
        activePaths.map((path) =>
          readFile(resolve(repositoryRoot, path), "utf8"),
        ),
      )
    ).join("\n");
    expect(activeBytes).not.toMatch(/d-?0?31|d-?0?32|ski[ -]?tycoon/iu);
  });
});
