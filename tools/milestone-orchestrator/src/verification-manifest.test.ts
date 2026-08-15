import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HISTORICAL_VERIFICATION_MANIFEST_PATH,
  SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH,
  loadActiveVerificationManifest,
  loadHistoricalVerificationManifest,
  loadPackageDefaultVerificationProfile,
  loadVerificationManifest,
} from "./config.js";
import {
  validateLegacyVerificationManifest,
  validateVerificationManifest,
} from "./schema.js";
import {
  adaptHistoricalVerificationManifest,
  assertVerificationManifestRegistryIdentities,
} from "./verification-manifest.js";
import { validVerificationManifest } from "../test/fixtures.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function activeFixture(profile: "bootstrap" | "readiness") {
  const root = await mkdtemp(join(tmpdir(), "generic-manifest-"));
  temporaryDirectories.push(root);
  const manifest = validVerificationManifest({
    commissioning: {
      ...validVerificationManifest().commissioning,
      profile,
    },
  });
  await Promise.all([
    writeJson(join(root, "package.json"), {
      milestoneLoop: { verification: { defaultProfile: profile } },
    }),
    writeJson(join(root, ".agent", "verification-manifest.json"), manifest),
  ]);
  return { root, manifest };
}

describe("generic active verification manifest", () => {
  it.each(["bootstrap", "readiness"] as const)(
    "loads the commissioned %s profile only from the package default",
    async (profile) => {
      const fixture = await activeFixture(profile);
      const loaded = await loadActiveVerificationManifest(fixture.root);
      expect(loaded.value).toEqual(fixture.manifest);
      expect(loaded.packageDefaultProfile).toBe(profile);
    },
  );

  it("fails closed on malformed commissioning, profile, protected paths, and reconciliation policy", () => {
    const base = validVerificationManifest();
    expect(validateVerificationManifest(base)).toMatchObject({ valid: true });

    expect(
      validateVerificationManifest({
        ...base,
        commissioning: { ...base.commissioning, baseCommit: "missing" },
      }).valid,
    ).toBe(false);
    expect(
      validateVerificationManifest({
        ...base,
        commissioning: { ...base.commissioning, profile: "preview" },
      }).valid,
    ).toBe(false);
    expect(
      validateVerificationManifest({
        ...base,
        commissioning: { ...base.commissioning, targetBranch: "bad branch" },
      }).valid,
    ).toBe(false);
    expect(
      validateVerificationManifest({
        ...base,
        requiredProtectedPaths: [
          ...base.requiredProtectedPaths,
          "../outside.txt",
        ],
      }).valid,
    ).toBe(false);
    expect(
      validateVerificationManifest({
        ...base,
        reconciliationPolicy: {
          ...base.reconciliationPolicy,
          requiredReviewChecks:
            base.reconciliationPolicy.requiredReviewChecks.slice(1),
        },
      }).valid,
    ).toBe(false);
    expect(
      validateVerificationManifest({
        ...base,
        reconciliationPolicy: {
          ...base.reconciliationPolicy,
          nextProposalPath: "../outside.json",
        },
      }).valid,
    ).toBe(false);
    expect(
      validateVerificationManifest({
        ...base,
        requiredInvariantSuiteId: "not an identifier",
      }).valid,
    ).toBe(false);
  });

  it("rejects a package-default mismatch and unsupported package profile", async () => {
    const fixture = await activeFixture("bootstrap");
    await writeJson(
      join(fixture.root, ".agent", "verification-manifest.json"),
      validVerificationManifest(),
    );
    await expect(loadActiveVerificationManifest(fixture.root)).rejects.toThrow(
      /does not match package-default profile/,
    );
    await writeJson(join(fixture.root, "package.json"), {
      milestoneLoop: { verification: { defaultProfile: "preview" } },
    });
    await expect(
      loadPackageDefaultVerificationProfile(fixture.root),
    ).rejects.toThrow(/must be bootstrap or readiness/);
  });

  it("fails closed when tier registries do not match commissioning", () => {
    const manifest = validVerificationManifest();
    expect(() =>
      assertVerificationManifestRegistryIdentities(
        manifest,
        manifest.requiredInvariantSuiteId,
        manifest.scopePolicyId,
      ),
    ).not.toThrow();
    expect(() =>
      assertVerificationManifestRegistryIdentities(
        manifest,
        "other-invariants.v1",
        manifest.scopePolicyId,
      ),
    ).toThrow(/different invariant suite/);
    expect(() =>
      assertVerificationManifestRegistryIdentities(
        manifest,
        manifest.requiredInvariantSuiteId,
        "other-scope.v1",
      ),
    ).toThrow(/different scope policy/);
  });
});

describe("historical verification manifest isolation", () => {
  it("rejects v1 at the active boundary and reads it only through an explicit historical context", async () => {
    const historical = JSON.parse(
      await readFile(
        resolve(repositoryRoot, HISTORICAL_VERIFICATION_MANIFEST_PATH),
        "utf8",
      ),
    ) as unknown;
    expect(validateLegacyVerificationManifest(historical)).toMatchObject({
      valid: true,
    });
    expect(validateVerificationManifest(historical).valid).toBe(false);
    await expect(
      loadVerificationManifest(
        repositoryRoot,
        HISTORICAL_VERIFICATION_MANIFEST_PATH,
      ),
    ).rejects.toThrow(/Invalid verification manifest/);

    const loaded = await loadHistoricalVerificationManifest(
      repositoryRoot,
      "source-reconciliation",
    );
    const adapted = adaptHistoricalVerificationManifest({
      manifest: loaded.value,
      targetBranch: "main",
      invariantSuiteId: "generic-invariants.v1",
      scopePolicyId: "generic-scope-policy.v1",
      historicalRecordCommittedAt: loaded.historicalRecordCommittedAt,
    });
    expect(adapted).toMatchObject({
      schemaVersion: "verification-manifest.v2",
      commissioning: {
        id: "historical-source-manifest-adapter",
        targetBranch: "main",
        profile: "readiness",
      },
      scopePolicyId: "generic-scope-policy.v1",
      exactVerification: { profileSource: "package-default" },
    });
    expect(adapted.commissioning.createdAt).toBe(
      loaded.historicalRecordCommittedAt,
    );
    expect("milestoneId" in adapted).toBe(false);
    expect("d031BaselineCommit" in adapted).toBe(false);
  });

  it("restricts each historical context to its intended repository path", async () => {
    await expect(
      loadHistoricalVerificationManifest(
        repositoryRoot,
        "source-benchmark",
        SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH,
      ),
    ).rejects.toThrow(/permits only/);
    await expect(
      loadHistoricalVerificationManifest(
        repositoryRoot,
        "ski-tycoon-worked-example",
      ),
    ).resolves.toMatchObject({
      path: SKI_TYCOON_HISTORICAL_VERIFICATION_MANIFEST_PATH,
    });
  });
});
