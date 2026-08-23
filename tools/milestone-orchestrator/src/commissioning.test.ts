import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCommissioningInput,
  commissionRepository,
  inspectCommissionedRepository,
  renderCommissioningResult,
} from "./commissioning.js";
import { parseCommissioningCliArguments } from "./commissioning-cli.js";
import {
  COMMISSIONING_INPUT_SCHEMA_VERSION,
  GENERIC_RECONCILIATION_REVIEW_CHECK_IDS,
  REQUIRED_PROTECTED_PATHS,
  SCOPE_TRIGGER_CLASSES,
  type CommissioningInput,
  type VerificationProfile,
} from "./contracts.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { validConfig } from "../test/fixtures.js";

const temporaryDirectories: string[] = [];
const ACTIVE_MANIFEST_PATH = ".agent/verification-manifest.json";
const TEMP_MANIFEST_PATH =
  ".agent/.verification-manifest.json.commissioning.tmp";
const INPUT_PATH = "commissioning-input.json";
const CONFIG_PATH = "tools/milestone-orchestrator/config/default.json";
const INVARIANT_PATH =
  "tools/milestone-orchestrator/config/invariant-suite.json";
const SCOPE_PATH =
  "tools/milestone-orchestrator/config/verification-scope-policy.json";
const LOCK_PATH = "evals/immutable-contract-lock.json";
const BRANCH = "fixture-main";

interface RepositoryFixture {
  readonly root: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly inputPath: string;
  readonly lockSha256: string;
  readonly profile: VerificationProfile;
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function hash(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeText(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root: string, ...args: readonly string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-15T12:00:00-06:00",
      GIT_COMMITTER_DATE: "2026-08-15T12:00:00-06:00",
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Fixture git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

function scopePolicy(packageName: string) {
  return {
    schemaVersion: "1.0.0",
    id: "fixture-shadow-scope.v1",
    mode: "shadow-only",
    unknownDisposition: "fail-broad",
    closureSuppressionAllowed: false,
    browserHostScriptPatterns: [],
    triggerClasses: [...SCOPE_TRIGGER_CLASSES],
    broadTriggerClasses: ["unknown"],
    mandatoryChecks: Object.fromEntries(
      SCOPE_TRIGGER_CLASSES.map((trigger) => [trigger, ["test-invariants"]]),
    ),
    workspaceChecks: { [packageName]: ["test-invariants"] },
    graduation: {
      deferred: true,
      minimumComparisons: 30,
      minimumExamplesPerTrigger: 3,
      requiresZeroFalseNegatives: true,
      requiresZeroUnknowns: true,
      requiresDeterministicRecommendations: true,
      requiresMeasuredSavingsAboveNoise: true,
      requiresNoClosureRegression: true,
      requiresIndependentReview: true,
      requiresExplicitPolicyChange: true,
    },
  };
}

async function authorityLock(root: string): Promise<{
  readonly value: unknown;
  readonly sha256: string;
}> {
  const definitions = [
    ["PROJECT_GOAL.md", "HUMAN_REVISION_ONLY"],
    ["evals/ACCEPTANCE.md", "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION"],
    [
      "evals/acceptance-manifest.json",
      "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION",
    ],
    ["evals/HIDDEN_VALIDATION_PROTOCOL.md", "HUMAN_REVISION_ONLY"],
  ] as const;
  const files = await Promise.all(
    definitions.map(async ([path, changeClass]) => {
      const digest = hash(await readFile(join(root, path)));
      return {
        path,
        changeClass,
        baselineSha256: digest,
        activeSha256: digest,
      };
    }),
  );
  const value = {
    schemaVersion: "1.0.0",
    calibrationTransition: {
      state: "open_not_started",
      completedCount: 0,
      maximumCount: 1,
      recordPath: null,
    },
    files,
  };
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeText(join(root, LOCK_PATH), bytes);
  return { value, sha256: hash(bytes) };
}

function commissioningInput(input: {
  readonly config: ReturnType<typeof validConfig>;
  readonly baseCommit: string;
  readonly lockSha256: string;
  readonly profile: VerificationProfile;
}): CommissioningInput {
  const requiredProtectedPaths = buildCanonicalProtectedSet(input.config, [
    CONFIG_PATH,
    INVARIANT_PATH,
    SCOPE_PATH,
    INPUT_PATH,
    ACTIVE_MANIFEST_PATH,
  ]);
  return {
    schemaVersion: COMMISSIONING_INPUT_SCHEMA_VERSION,
    commissioning: {
      id: "fixture-commissioning.v1",
      targetBranch: BRANCH,
      baseCommit: input.baseCommit,
      profile: input.profile,
    },
    sources: {
      configPath: CONFIG_PATH,
      invariantSuitePath: INVARIANT_PATH,
      scopePolicyPath: SCOPE_PATH,
      immutableContractLockPath: LOCK_PATH,
      immutableContractLockSha256: input.lockSha256,
    },
    objective: "Commission one fresh generic adopter verification lifecycle.",
    exclusions: [
      "No immutable authority, readiness meaning, or exact command changes.",
    ],
    focusedCommands: [
      {
        id: "test-invariants",
        argv: ["pnpm", "test:invariants"],
        tiers: ["iteration", "candidate", "milestone"],
        expectedArtifactKinds: ["invariant-suite-report"],
      },
    ],
    requiredProtectedPaths,
    requiredInvariantSuiteId: "fixture-core-invariants.v1",
    scopePolicyId: "fixture-shadow-scope.v1",
    exactVerification: {
      argv: ["pnpm", "verify"],
      requiresNoArguments: true,
      profileSource: "package-default",
      selectedByOverride: false,
    },
    reconciliationPolicy: {
      id: "fixture-reconciliation.v1",
      nextProposalPath: ".agent/next-milestone.json",
      requiredReviewChecks: [...GENERIC_RECONCILIATION_REVIEW_CHECK_IDS],
    },
    output: { verificationManifestPath: ACTIVE_MANIFEST_PATH },
  };
}

async function repositoryFixture(
  profile: VerificationProfile = "bootstrap",
): Promise<RepositoryFixture> {
  const root = await mkdtemp(join(tmpdir(), "loop-commissioning-"));
  temporaryDirectories.push(root);
  git(root, "init", `--initial-branch=${BRANCH}`);
  git(root, "config", "user.name", "Commissioning Fixture");
  git(root, "config", "user.email", "commissioning@example.invalid");

  const packageName = "fresh-generic-adopter";
  const config = validConfig({
    targetBranch: BRANCH,
    project: {
      name: "Fresh Generic Adopter",
      authorityFile: "PROJECT_GOAL.md",
      verticalSpine: { minimumCategories: 4, categoryPatterns: [] },
    },
    protectedPaths: [
      ...new Set([
        ...REQUIRED_PROTECTED_PATHS,
        "PROJECT_GOAL.md",
        CONFIG_PATH,
        INVARIANT_PATH,
        SCOPE_PATH,
        INPUT_PATH,
      ]),
    ],
  });
  await Promise.all([
    writeText(join(root, "PROJECT_GOAL.md"), "# Fresh Generic Goal\n"),
    writeText(join(root, "AGENTS.md"), "# Fresh Agent Contract\n"),
    writeText(join(root, "evals/ACCEPTANCE.md"), "# Acceptance\n"),
    writeJson(join(root, "evals/acceptance-manifest.json"), {
      schemaVersion: "fixture.v1",
    }),
    writeText(
      join(root, "evals/HIDDEN_VALIDATION_PROTOCOL.md"),
      "# Hidden Validation Protocol\n",
    ),
    writeJson(join(root, CONFIG_PATH), config),
    writeJson(join(root, INVARIANT_PATH), {
      schemaVersion: "1.0.0",
      id: "fixture-core-invariants.v1",
      warmRuntimeTargetMs: 60_000,
      serial: true,
      entries: [
        {
          id: "protected-integrity",
          ownerPaths: ["PROJECT_GOAL.md"],
          triggerPaths: ["PROJECT_GOAL.md"],
          argv: ["pnpm", "test:invariants"],
          expectedArtifactKinds: ["invariant-suite-report"],
        },
      ],
    }),
    writeJson(join(root, SCOPE_PATH), scopePolicy(packageName)),
    writeJson(join(root, "package.json"), {
      name: packageName,
      private: true,
      type: "module",
      milestoneLoop: { verification: { defaultProfile: profile } },
      scripts: {
        verify: "node scripts/verify.mjs",
        "test:invariants": 'node -e "process.exit(0)"',
      },
    }),
    writeText(join(root, "pnpm-workspace.yaml"), "packages:\n  - .\n"),
    writeText(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n"),
    writeText(join(root, ".gitattributes"), "* text eol=lf\n"),
  ]);
  if (profile === "readiness")
    await writeJson(join(root, ".agent/readiness-profile-activated.json"), {
      schemaVersion: "1.0.0",
      state: "readiness",
      previousState: "bootstrap",
      activatedDate: "2026-08-15",
      reason: "Fixture bootstrap completed before commissioning readiness.",
    });
  const lock = await authorityLock(root);
  await writeText(
    join(root, "scripts/verify.mjs"),
    "// Generic fixture verifier; authority is anchored by commissioned Git history.\n",
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture authority base");
  const baseCommit = git(root, "rev-parse", "HEAD");
  await writeJson(
    join(root, INPUT_PATH),
    commissioningInput({
      config,
      baseCommit,
      lockSha256: lock.sha256,
      profile,
    }),
  );
  git(root, "add", INPUT_PATH);
  git(root, "commit", "-m", "add commissioning input");
  return {
    root,
    baseCommit,
    headCommit: git(root, "rev-parse", "HEAD"),
    inputPath: join(root, INPUT_PATH),
    lockSha256: lock.sha256,
    profile,
  };
}

async function mutateInput(
  fixture: RepositoryFixture,
  mutate: (input: Record<string, unknown>) => void,
): Promise<void> {
  const parsed = JSON.parse(
    await readFile(fixture.inputPath, "utf8"),
  ) as Record<string, unknown>;
  mutate(parsed);
  await writeJson(fixture.inputPath, parsed);
  git(fixture.root, "add", INPUT_PATH);
  git(fixture.root, "commit", "-m", "mutate commissioning input");
}

async function cloneFixture(fixture: RepositoryFixture): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "loop-commissioning-clone-"));
  temporaryDirectories.push(parent);
  const root = join(parent, "repository");
  const result = spawnSync("git", ["clone", "--quiet", fixture.root, root], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Could not clone fixture: ${result.stderr}`);
  return root;
}

describe("deterministic repository commissioning", () => {
  it.each(["bootstrap", "readiness"] as const)(
    "commissions a clean generic %s repository and validates all four plans",
    async (profile) => {
      const fixture = await repositoryFixture(profile);
      const result = await commissionRepository({
        repositoryRoot: fixture.root,
        inputPath: fixture.inputPath,
      });
      const manifestBytes = await readFile(
        join(fixture.root, ACTIVE_MANIFEST_PATH),
      );
      const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
        commissioning: {
          targetBranch: string;
          baseCommit: string;
          profile: string;
          createdAt: string;
        };
      };

      expect(result.status).toBe("PASS");
      expect(result.repository).toMatchObject({
        targetBranch: BRANCH,
        baseCommit: fixture.baseCommit,
        headCommit: fixture.headCommit,
        profile,
      });
      expect(result.generatedFiles).toEqual([
        {
          path: ACTIVE_MANIFEST_PATH,
          bytes: manifestBytes.byteLength,
          sha256: hash(manifestBytes),
        },
      ]);
      expect(manifest.commissioning).toMatchObject({
        targetBranch: BRANCH,
        baseCommit: fixture.baseCommit,
        profile,
      });
      expect(manifest.commissioning.createdAt).toBe(
        new Date(
          git(fixture.root, "show", "-s", "--format=%cI", fixture.baseCommit),
        ).toISOString(),
      );
      expect(
        result.postGenerationDoctor.tierPlans.map((plan) => plan.tier),
      ).toEqual(["iteration", "candidate", "milestone", "periodic"]);
      expect(
        result.postGenerationDoctor.tierPlans
          .filter((plan) => plan.exactVerificationIncluded)
          .map((plan) => plan.tier),
      ).toEqual(["milestone", "periodic"]);
      expect(manifestBytes.toString("utf8")).not.toMatch(
        /d-?0?31|d-?0?32|ski[ -]?tycoon/i,
      );
      const verifierSource = await readFile(
        join(fixture.root, "scripts/verify.mjs"),
        "utf8",
      );
      expect(verifierSource).not.toContain(fixture.lockSha256);
      expect(verifierSource).not.toContain("ESTABLISHED_IMMUTABLE_LOCK_SHA256");
      if (profile === "bootstrap")
        expect(result.repository.profile).not.toBe("readiness");
      await expect(
        commissionRepository({
          repositoryRoot: fixture.root,
          inputPath: fixture.inputPath,
        }),
      ).rejects.toThrow(/already commissioned|recommissioning/i);
    },
    15_000,
  );

  it("generates byte-identical files in twin clones of the same Git identity", async () => {
    const fixture = await repositoryFixture("bootstrap");
    const left = await cloneFixture(fixture);
    const right = await cloneFixture(fixture);
    const [leftResult, rightResult] = await Promise.all([
      commissionRepository({
        repositoryRoot: left,
        inputPath: join(left, INPUT_PATH),
      }),
      commissionRepository({
        repositoryRoot: right,
        inputPath: join(right, INPUT_PATH),
      }),
    ]);
    const [leftBytes, rightBytes] = await Promise.all([
      readFile(join(left, ACTIVE_MANIFEST_PATH)),
      readFile(join(right, ACTIVE_MANIFEST_PATH)),
    ]);
    expect(leftBytes).toEqual(rightBytes);
    expect(leftResult.generatedFiles).toEqual(rightResult.generatedFiles);
  }, 20_000);

  it.each(["tracked", "untracked"] as const)(
    "rejects a dirty %s path before generating output",
    async (kind) => {
      const fixture = await repositoryFixture();
      if (kind === "tracked")
        await writeFile(fixture.inputPath, "\n", { flag: "a" });
      else await writeText(join(fixture.root, "untracked.txt"), "dirty\n");
      await expect(
        commissionRepository({
          repositoryRoot: fixture.root,
          inputPath: fixture.inputPath,
        }),
      ).rejects.toThrow(/clean tracked and untracked/);
      await expect(
        readFile(join(fixture.root, ACTIVE_MANIFEST_PATH)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("rejects missing and unrelated commissioning bases", async () => {
    const missing = await repositoryFixture();
    await mutateInput(missing, (input) => {
      (input["commissioning"] as Record<string, unknown>)["baseCommit"] =
        "f".repeat(40);
    });
    await expect(
      commissionRepository({
        repositoryRoot: missing.root,
        inputPath: missing.inputPath,
      }),
    ).rejects.toThrow(/missing|exact commit/);

    const unrelated = await repositoryFixture();
    const unrelatedCommit = git(
      unrelated.root,
      "commit-tree",
      git(unrelated.root, "rev-parse", "HEAD^{tree}"),
      "-m",
      "unrelated base",
    );
    await mutateInput(unrelated, (input) => {
      (input["commissioning"] as Record<string, unknown>)["baseCommit"] =
        unrelatedCommit;
    });
    await expect(
      commissionRepository({
        repositoryRoot: unrelated.root,
        inputPath: unrelated.inputPath,
      }),
    ).rejects.toThrow(/not an ancestor/);
  });

  it("rejects detached or wrong branches, package-profile mismatch, and incompatible marker history", async () => {
    const detached = await repositoryFixture();
    git(detached.root, "checkout", "--detach");
    await expect(
      commissionRepository({
        repositoryRoot: detached.root,
        inputPath: detached.inputPath,
      }),
    ).rejects.toThrow(/attached target branch/);

    const wrongBranch = await repositoryFixture();
    git(wrongBranch.root, "switch", "-c", "wrong-branch");
    await expect(
      commissionRepository({
        repositoryRoot: wrongBranch.root,
        inputPath: wrongBranch.inputPath,
      }),
    ).rejects.toThrow(/must run on target branch/);

    const mismatchedProfile = await repositoryFixture("bootstrap");
    await mutateInput(mismatchedProfile, (input) => {
      (input["commissioning"] as Record<string, unknown>)["profile"] =
        "readiness";
    });
    await expect(
      commissionRepository({
        repositoryRoot: mismatchedProfile.root,
        inputPath: mismatchedProfile.inputPath,
      }),
    ).rejects.toThrow(/does not match package-default profile/);

    const markerHistory = await repositoryFixture("bootstrap");
    await writeJson(
      join(markerHistory.root, ".agent/readiness-profile-activated.json"),
      {
        schemaVersion: "1.0.0",
        state: "readiness",
        previousState: "bootstrap",
        activatedDate: "2026-08-15",
        reason: "Invalid bootstrap rollback fixture.",
      },
    );
    git(markerHistory.root, "add", ".agent/readiness-profile-activated.json");
    git(markerHistory.root, "commit", "-m", "invalid readiness marker");
    await expect(
      commissionRepository({
        repositoryRoot: markerHistory.root,
        inputPath: markerHistory.inputPath,
      }),
    ).rejects.toThrow(/incompatible with readiness-marker/);

    const removedMarker = await repositoryFixture("readiness");
    await rm(
      join(removedMarker.root, ".agent/readiness-profile-activated.json"),
    );
    git(removedMarker.root, "add", ".agent/readiness-profile-activated.json");
    git(removedMarker.root, "commit", "-m", "remove readiness marker");
    await expect(
      commissionRepository({
        repositoryRoot: removedMarker.root,
        inputPath: removedMarker.inputPath,
      }),
    ).rejects.toThrow(/requires a valid permanent marker/);
  }, 30_000);

  it("rejects malformed input, unsafe output/protected paths, and weakened policy", async () => {
    const fixture = await repositoryFixture();
    const input = JSON.parse(
      await readFile(fixture.inputPath, "utf8"),
    ) as Record<string, unknown>;
    expect(() =>
      assertCommissioningInput({
        ...input,
        commissioning: {
          ...(input["commissioning"] as Record<string, unknown>),
          profile: "preview",
        },
      }),
    ).toThrow(/invalid verification manifest/i);
    expect(() =>
      assertCommissioningInput({
        ...input,
        output: { verificationManifestPath: "../outside.json" },
      }),
    ).toThrow(/canonical active manifest path/);
    expect(() =>
      assertCommissioningInput({
        ...input,
        requiredProtectedPaths: [
          ...(input["requiredProtectedPaths"] as string[]),
          "../outside",
        ],
      }),
    ).toThrow(/invalid verification manifest/i);
    expect(() =>
      assertCommissioningInput({
        ...input,
        reconciliationPolicy: {
          ...(input["reconciliationPolicy"] as Record<string, unknown>),
          requiredReviewChecks:
            GENERIC_RECONCILIATION_REVIEW_CHECK_IDS.slice(1),
        },
      }),
    ).toThrow(/invalid verification manifest/i);

    const outsideDirectory = await mkdtemp(
      join(tmpdir(), "loop-commissioning-outside-"),
    );
    temporaryDirectories.push(outsideDirectory);
    const outsideInput = join(outsideDirectory, "input.json");
    await writeFile(outsideInput, await readFile(fixture.inputPath));
    await expect(
      commissionRepository({
        repositoryRoot: fixture.root,
        inputPath: outsideInput,
      }),
    ).rejects.toThrow(/escapes the repository|tracked file inside/);
  });

  it("rejects authority drift, lock-input drift, base-anchor drift, and registry drift", async () => {
    const authority = await repositoryFixture();
    await writeText(
      join(authority.root, "PROJECT_GOAL.md"),
      "# Changed Goal\n",
    );
    git(authority.root, "add", "PROJECT_GOAL.md");
    git(authority.root, "commit", "-m", "drift authority");
    await expect(
      commissionRepository({
        repositoryRoot: authority.root,
        inputPath: authority.inputPath,
      }),
    ).rejects.toThrow(/authority hash mismatch/);

    const lockInput = await repositoryFixture();
    await mutateInput(lockInput, (input) => {
      (input["sources"] as Record<string, unknown>)[
        "immutableContractLockSha256"
      ] = "e".repeat(64);
    });
    await expect(
      commissionRepository({
        repositoryRoot: lockInput.root,
        inputPath: lockInput.inputPath,
      }),
    ).rejects.toThrow(/explicit commissioning input hash/);

    const anchor = await repositoryFixture();
    await writeText(
      join(anchor.root, "PROJECT_GOAL.md"),
      "# Replacement Goal And Lock\n",
    );
    const replacementLock = await authorityLock(anchor.root);
    const anchorInput = JSON.parse(
      await readFile(anchor.inputPath, "utf8"),
    ) as Record<string, unknown>;
    (anchorInput["sources"] as Record<string, unknown>)[
      "immutableContractLockSha256"
    ] = replacementLock.sha256;
    await writeJson(anchor.inputPath, anchorInput);
    git(anchor.root, "add", "PROJECT_GOAL.md", "evals", INPUT_PATH);
    git(anchor.root, "commit", "-m", "replace authority after anchor base");
    await expect(
      commissionRepository({
        repositoryRoot: anchor.root,
        inputPath: anchor.inputPath,
      }),
    ).rejects.toThrow(/lock differs from the commissioned strict-ancestor/);

    const registry = await repositoryFixture();
    await mutateInput(registry, (input) => {
      input["requiredInvariantSuiteId"] = "different-invariants.v1";
    });
    await expect(
      commissionRepository({
        repositoryRoot: registry.root,
        inputPath: registry.inputPath,
      }),
    ).rejects.toThrow(/different invariant suite/);

    const missingScript = await repositoryFixture();
    await mutateInput(missingScript, (input) => {
      const [command] = input["focusedCommands"] as Array<
        Record<string, unknown>
      >;
      if (command) command["argv"] = ["pnpm", "missing-script"];
    });
    await expect(
      commissionRepository({
        repositoryRoot: missingScript.root,
        inputPath: missingScript.inputPath,
      }),
    ).rejects.toThrow(/references missing package script/);

    const incompleteFloor = await repositoryFixture();
    await mutateInput(incompleteFloor, (input) => {
      input["requiredProtectedPaths"] = (
        input["requiredProtectedPaths"] as string[]
      ).filter((path) => path !== "PROJECT_GOAL.md");
    });
    await expect(
      commissionRepository({
        repositoryRoot: incompleteFloor.root,
        inputPath: incompleteFloor.inputPath,
      }),
    ).rejects.toThrow(/omits canonical protected paths/);
  }, 30_000);

  it("cleans partial staging and rolls back exact publication after validation faults", async () => {
    const partial = await repositoryFixture();
    await expect(
      commissionRepository({
        repositoryRoot: partial.root,
        inputPath: partial.inputPath,
        dependencies: {
          writeStagedFile: async (path, contents) => {
            await writeFile(path, contents.subarray(0, 17), { flag: "wx" });
            throw new Error("injected partial stage write");
          },
        },
      }),
    ).rejects.toThrow(/injected partial stage write/);
    await expect(
      readFile(join(partial.root, ACTIVE_MANIFEST_PATH)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(partial.root, TEMP_MANIFEST_PATH)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const postValidation = await repositoryFixture();
    await expect(
      commissionRepository({
        repositoryRoot: postValidation.root,
        inputPath: postValidation.inputPath,
        dependencies: {
          postPublicationDoctor: async () => {
            throw new Error("injected post-publication validation fault");
          },
        },
      }),
    ).rejects.toThrow(/post-publication validation fault/);
    await expect(
      readFile(join(postValidation.root, ACTIVE_MANIFEST_PATH)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(postValidation.root, TEMP_MANIFEST_PATH)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("detects pre-publication drift and never overwrites a racing destination", async () => {
    const drift = await repositoryFixture();
    await expect(
      commissionRepository({
        repositoryRoot: drift.root,
        inputPath: drift.inputPath,
        dependencies: {
          afterStagedValidation: async () =>
            writeText(join(drift.root, "racing-untracked.txt"), "race\n"),
        },
      }),
    ).rejects.toThrow(/changed after inspection/);
    await expect(
      readFile(join(drift.root, ACTIVE_MANIFEST_PATH)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const noClobber = await repositoryFixture();
    const existing = Buffer.from("do-not-overwrite\n", "utf8");
    await expect(
      commissionRepository({
        repositoryRoot: noClobber.root,
        inputPath: noClobber.inputPath,
        dependencies: {
          beforePublication: async () =>
            writeFile(join(noClobber.root, ACTIVE_MANIFEST_PATH), existing),
        },
      }),
    ).rejects.toThrow(/appeared before publication|clobber/);
    expect(await readFile(join(noClobber.root, ACTIVE_MANIFEST_PATH))).toEqual(
      existing,
    );
  }, 30_000);

  it("reports every generated path, byte count, and hash and keeps doctor read-only", async () => {
    const fixture = await repositoryFixture();
    const result = await commissionRepository({
      repositoryRoot: fixture.root,
      inputPath: fixture.inputPath,
    });
    const before = await readFile(join(fixture.root, ACTIVE_MANIFEST_PATH));
    const rendered = renderCommissioningResult(result);
    expect(rendered).toContain(
      `[commission] generated ${ACTIVE_MANIFEST_PATH} bytes=${before.byteLength} sha256=${hash(before)}`,
    );
    const doctor = await inspectCommissionedRepository(fixture.root);
    expect(doctor).toEqual(result.postGenerationDoctor);
    expect(await readFile(join(fixture.root, ACTIVE_MANIFEST_PATH))).toEqual(
      before,
    );
  }, 15_000);
});

describe("commissioning CLI contract", () => {
  it("requires exactly one explicit input and rejects unknown options", () => {
    expect(
      parseCommissioningCliArguments(["--input", "commission.json"]),
    ).toEqual({ inputPath: "commission.json" });
    expect(
      parseCommissioningCliArguments(["--", "--input", "commission.json"]),
    ).toEqual({ inputPath: "commission.json" });
    expect(() => parseCommissioningCliArguments([])).toThrow(
      /requires --input/,
    );
    expect(() =>
      parseCommissioningCliArguments([
        "--input",
        "one.json",
        "--input",
        "two.json",
      ]),
    ).toThrow(/exactly one/);
    expect(() => parseCommissioningCliArguments(["--force"])).toThrow(
      /unknown commissioning option/i,
    );
    expect(() =>
      parseCommissioningCliArguments([
        "--",
        "--",
        "--input",
        "commission.json",
      ]),
    ).toThrow(/unknown commissioning option: --/i);
  });
});
