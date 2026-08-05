import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONTROLLER_TRUST_ROOT_PATHS,
  type VerificationManifest,
} from "./contracts.js";
import { loadConfig, loadVerificationManifest } from "./config.js";
import {
  assertManifestProtectedPathsCovered,
  buildCanonicalProtectedSet,
  casefoldPathKey,
  enforcementProtectedPatterns,
} from "./protected-roots.js";
import { validConfig } from "../test/fixtures.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("canonical protected trust roots", () => {
  it("unions mandatory roots, the authority file, config entries, and extras", () => {
    const config = validConfig({
      protectedPaths: [
        ...validConfig().protectedPaths,
        "docs\\extra-protection.md",
        "./docs/extra-protection.md",
      ],
    });
    const canonical = buildCanonicalProtectedSet(config, ["adopter/extra.md"]);
    for (const root of CONTROLLER_TRUST_ROOT_PATHS)
      expect(canonical).toContain(root);
    expect(canonical).toContain("PROJECT_GOAL.md");
    expect(canonical).toContain("docs/extra-protection.md");
    expect(canonical).toContain("adopter/extra.md");
    expect(canonical).toEqual([...canonical].sort());
    expect(new Set(canonical).size).toBe(canonical.length);
    expect(
      canonical.filter((path) => path === "docs/extra-protection.md"),
    ).toHaveLength(1);
  });

  it.each([
    ["absolute", "/etc/passwd"],
    ["drive-absolute", "C:/secrets.txt"],
    ["parent-escaping", "../outside.md"],
    ["glob", "evals/*"],
    ["question-glob", "evals/?.md"],
  ])("rejects a %s protected entry", (_name, entry) => {
    expect(() => buildCanonicalProtectedSet(validConfig(), [entry])).toThrow(
      /unsafe or non-literal/,
    );
  });

  it("folds case and separators for coverage checks", () => {
    expect(casefoldPathKey(".\\Scripts\\Verify.MJS")).toBe(
      "scripts/verify.mjs",
    );
    const manifest = {
      requiredProtectedPaths: ["SCRIPTS/VERIFY.MJS", "agents.md"],
    } as unknown as VerificationManifest;
    expect(() =>
      assertManifestProtectedPathsCovered(
        manifest,
        buildCanonicalProtectedSet(validConfig()),
      ),
    ).not.toThrow();
    const uncovered = {
      requiredProtectedPaths: ["docs/never-configured.md"],
    } as unknown as VerificationManifest;
    expect(() =>
      assertManifestProtectedPathsCovered(
        uncovered,
        buildCanonicalProtectedSet(validConfig()),
      ),
    ).toThrow(/cannot enforce.*docs\/never-configured\.md/);
  });

  it("covers the live commissioned manifest from the live configuration", async () => {
    const [config, manifest] = await Promise.all([
      loadConfig(repositoryRoot),
      loadVerificationManifest(repositoryRoot),
    ]);
    expect(() =>
      assertManifestProtectedPathsCovered(
        manifest.value,
        buildCanonicalProtectedSet(config),
      ),
    ).not.toThrow();
  });

  it("covers the ski-tycoon worked example once its config lists the adopter extras", async () => {
    const exampleConfig = JSON.parse(
      await readFile(
        resolve(repositoryRoot, "examples/ski-tycoon/default.json"),
        "utf8",
      ),
    ) as Parameters<typeof buildCanonicalProtectedSet>[0];
    const exampleManifest = JSON.parse(
      await readFile(
        resolve(
          repositoryRoot,
          "examples/ski-tycoon/loop-recommissioning-verification.json",
        ),
        "utf8",
      ),
    ) as VerificationManifest;
    expect(() =>
      assertManifestProtectedPathsCovered(
        exampleManifest,
        buildCanonicalProtectedSet(exampleConfig),
      ),
    ).not.toThrow();
  });

  it("keeps enforcement patterns equal to the canonical union with stored records", () => {
    const config = validConfig();
    const patterns = enforcementProtectedPatterns(config, [
      { path: "stored/legacy-protection.md", sha256: "a".repeat(64) },
    ]);
    expect(patterns).toEqual(
      buildCanonicalProtectedSet(config, ["stored/legacy-protection.md"]),
    );
  });
});
