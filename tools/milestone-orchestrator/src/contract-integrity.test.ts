import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateCommissionedAuthorityAnchor } from "./authority-anchor.js";
import { evaluateContractIntegrity } from "./contract-integrity.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];

const EXPECTED_CHECK_IDS = [
  "immutable-contract-lock-hash",
  "immutable-contract-lock-schema",
  "immutable-contract-hashes",
  "manifest-json",
  "required-validation-layers",
  "required-bot-requirements",
  "complete-normative-id-set",
  "threshold-freeze-coverage",
  "seed-and-integrity-gates",
  "authoritative-command",
  "readiness-profile-contract",
  "readiness-aggregation",
  "acceptance-prose-bot-aggregation",
] as const;

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function command(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): SpawnSyncReturns<string> {
  return spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
  });
}

function assertCommandCompleted(
  result: SpawnSyncReturns<string>,
  label: string,
): void {
  if (result.error || result.signal || result.status === null)
    throw new Error(
      `${label} did not complete: ${result.error?.message ?? result.signal ?? "no exit status"}.\n${result.stdout}\n${result.stderr}`,
    );
}

function isolatedLoopEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment))
    if (key.startsWith("LOOP_VERIFY_") || key.startsWith("LOOP_TELEMETRY_"))
      delete environment[key];
  return { ...environment, ...overrides };
}

async function commissionedClone(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "contract-integrity-")),
  );
  expect(await realpath(parent)).toBe(parent);
  temporaryDirectories.push(parent);
  const root = join(parent, "repository");
  const cloned = command(
    "git",
    ["clone", "--quiet", "--no-hardlinks", repositoryRoot, root],
    parent,
  );
  assertCommandCompleted(cloned, "local commissioned clone");
  if (cloned.status !== 0)
    throw new Error(`Local commissioned clone failed: ${cloned.stderr}`);
  return root;
}

async function installCurrentPaths(
  root: string,
  paths: readonly string[],
): Promise<void> {
  for (const path of paths) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, path), destination);
  }
}

async function installCurrentVerifierConsumer(root: string): Promise<void> {
  await installCurrentPaths(root, [
    "scripts/verify.mjs",
    "tools/milestone-orchestrator/src/contract-integrity.ts",
  ]);
}

async function installCurrentInvariantAdapter(root: string): Promise<void> {
  await installCurrentPaths(root, [
    "tools/milestone-orchestrator/src/contract-integrity.ts",
    "tools/milestone-orchestrator/src/invariant-suite.ts",
    "tools/milestone-orchestrator/src/test-run-probe.cjs",
    "tools/milestone-orchestrator/src/test-run-summary.ts",
    "tools/milestone-orchestrator/src/verification-cli.ts",
  ]);
}

async function directChecks(root: string) {
  return evaluateContractIntegrity({
    repositoryRoot: root,
    validateAuthorityAnchor: validateCommissionedAuthorityAnchor,
  });
}

describe("shared contract-integrity evaluation", () => {
  it("retains the exact commissioned checks and authoritative verifier output", async () => {
    const root = await commissionedClone();
    await installCurrentVerifierConsumer(root);

    const verifierSource = await readFile(
      join(repositoryRoot, "scripts", "verify.mjs"),
      "utf8",
    );
    expect(verifierSource).toContain(
      'import { evaluateContractIntegrity } from "../tools/milestone-orchestrator/src/contract-integrity.ts";',
    );
    expect(verifierSource).not.toContain("function validateAcceptanceManifest");

    const checks = await directChecks(root);
    expect(checks.map((item) => item.id)).toEqual(EXPECTED_CHECK_IDS);
    expect(checks.every((item) => item.status === "PASS")).toBe(true);

    const runId = "contract-shared-consumer";
    const verified = command(
      process.execPath,
      [
        "scripts/verify.mjs",
        "--stage",
        "contract-integrity",
        "--run-id",
        runId,
      ],
      root,
      isolatedLoopEnvironment(),
    );
    assertCommandCompleted(verified, "focused authoritative verifier");
    expect(verified.status).toBe(1);
    const result = JSON.parse(
      await readFile(join(root, "artifacts", runId, "result.json"), "utf8"),
    ) as {
      readonly completion: { readonly eligible: boolean };
      readonly stages: readonly {
        readonly id: string;
        readonly status: string;
        readonly checks: readonly unknown[];
      }[];
    };
    expect(result.stages.map((stage) => stage.id)).toEqual([
      "environment",
      "contract-integrity",
    ]);
    expect(result.stages[0]?.status).toBe("FAIL");
    expect(result.stages[1]).toMatchObject({
      id: "contract-integrity",
      status: "PASS",
      checks,
    });
    expect(result.completion.eligible).toBe(false);
  }, 30_000);

  it("retains a failing ineligible report and no receipt for real contract corruption", async () => {
    const root = await commissionedClone();
    await installCurrentInvariantAdapter(root);
    const manifestPath = join(root, "evals", "acceptance-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    const readiness = manifest["readinessGate"] as Record<string, unknown>;
    readiness["compensationBetweenRequirementsAllowed"] = true;
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    const checks = await directChecks(root);
    expect(
      checks.find((item) => item.id === "immutable-contract-lock-hash")?.status,
    ).toBe("FAIL");
    expect(
      checks.find((item) => item.id === "readiness-aggregation")?.status,
    ).toBe("FAIL");

    const artifactDirectory = join(root, "artifacts", "corrupt-contract");
    const adapted = command(
      process.execPath,
      [
        join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        join(
          root,
          "tools",
          "milestone-orchestrator",
          "src",
          "verification-cli.ts",
        ),
        "contract-integrity",
      ],
      root,
      isolatedLoopEnvironment({
        LOOP_VERIFY_STAGE_ID: "invariant-suite",
        LOOP_VERIFY_COMMAND_ID: "protected-integrity",
        LOOP_VERIFY_COMMAND_ARTIFACT_DIR: artifactDirectory,
        LOOP_TELEMETRY_PARENT_MANAGED: "1",
      }),
    );
    assertCommandCompleted(adapted, "corrupt contract adapter");
    if (adapted.status !== 1)
      throw new Error(
        `Corrupt contract adapter exited ${String(adapted.status)} instead of 1.\nstdout:\n${adapted.stdout}\nstderr:\n${adapted.stderr}`,
      );
    expect(existsSync(join(artifactDirectory, "result.json"))).toBe(false);
    const reportPath = join(
      artifactDirectory,
      "contract-integrity-report.json",
    );
    if (!existsSync(reportPath))
      throw new Error(
        `Corrupt contract adapter wrote no diagnostic report.\nstdout:\n${adapted.stdout}\nstderr:\n${adapted.stderr}`,
      );

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      readonly status: string;
      readonly completionEligible: boolean;
      readonly counts: { readonly fail: number };
      readonly checks: readonly {
        readonly id: string;
        readonly status: string;
      }[];
    };
    expect(report).toMatchObject({
      status: "FAIL",
      completionEligible: false,
    });
    expect(report.counts.fail).toBeGreaterThan(0);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "readiness-aggregation",
          status: "FAIL",
        }),
      ]),
    );
  }, 30_000);
});
