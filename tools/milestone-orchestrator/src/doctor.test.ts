import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runDoctorDiagnostic } from "./doctor.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import {
  validConfig,
  validReconciliationRecord,
  validState,
} from "../test/fixtures.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function repositoryFixture(
  state: "valid" | "missing" | "invalid" = "valid",
): Promise<{ readonly root: string; readonly statePath: string }> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-doctor-"));
  temporaryDirectories.push(root);
  await writeJson(join(root, "package.json"), {
    engines: { node: "24.18.0" },
    packageManager: "pnpm@11.15.1",
  });
  await writeJson(
    join(root, "tools/milestone-orchestrator/config/default.json"),
    validConfig(),
  );
  for (const path of buildCanonicalProtectedSet(validConfig())) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${path}\n`, "utf8");
  }
  const statePath = join(root, "artifacts/orchestrator/state/state.json");
  if (state === "valid") await writeJson(statePath, validState(root));
  if (state === "invalid")
    await writeJson(statePath, {
      schemaVersion: "0.0.0",
      credential: "state-secret",
    });
  return { root, statePath };
}

const pinnedEnvironment = {
  npm_config_user_agent: "pnpm/11.15.1 npm/? node/v24.18.0 win32 x64",
} satisfies NodeJS.ProcessEnv;
const storedHead = "a".repeat(40);

describe("read-only orchestrator doctor", () => {
  it("reports a ready versioned diagnostic without reading or exposing local login contents", async () => {
    const fixture = await repositoryFixture();
    const codexHome = join(fixture.root, "codex-home");
    const authenticationPath = join(codexHome, "auth.json");
    const authenticationContents =
      '{"access_token":"never-print-this-local-secret"}\n';
    await mkdir(codexHome, { recursive: true });
    await writeFile(authenticationPath, authenticationContents, "utf8");
    const stateBefore = await readFile(fixture.statePath, "utf8");

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: { ...pinnedEnvironment, CODEX_HOME: codexHome },
        nodeVersion: "v24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic).toEqual({
      schemaVersion: "1.0.0",
      diagnostic: "orchestrator-doctor",
      status: "ready",
      readOnly: true,
      networkCallsPerformed: 0,
      checks: {
        runtimePins: {
          status: "pass",
          node: {
            configured: "24.18.0",
            running: "24.18.0",
            matches: true,
          },
          pnpm: {
            configured: "11.15.1",
            running: "11.15.1",
            matches: true,
          },
        },
        gitCleanliness: { status: "pass", clean: true },
        configuration: { status: "pass", valid: true },
        state: { status: "pass", outcome: "valid" },
        codexAuthentication: {
          status: "pass",
          available: true,
          source: "local-login",
        },
        protectedTrustRoots: {
          status: "pass",
          roots: buildCanonicalProtectedSet(validConfig(), [
            "tools/milestone-orchestrator/config/default.json",
          ]).map((path) => ({ path, present: true })),
          manifestCovered: null,
        },
        controllerLease: {
          status: "pass",
          present: false,
          malformed: false,
          owner: null,
        },
      },
    });
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("never-print-this-local-secret");
    expect(serialized).not.toContain(codexHome);
    expect(await readFile(authenticationPath, "utf8")).toBe(
      authenticationContents,
    );
    expect(await readFile(fixture.statePath, "utf8")).toBe(stateBefore);
  });

  it("treats an absent state as initializable and does not create it", async () => {
    const fixture = await repositoryFixture("missing");
    const apiKey = "never-print-this-environment-secret";

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: apiKey,
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("ready");
    expect(diagnostic.checks.state).toEqual({
      status: "pass",
      outcome: "missing",
    });
    expect(diagnostic.checks.codexAuthentication).toEqual({
      status: "pass",
      available: true,
      source: "environment",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(apiKey);
    await expect(readFile(fixture.statePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports a missing controller trust root as attention", async () => {
    const fixture = await repositoryFixture();
    await rm(join(fixture.root, "scripts", "verify.mjs"));

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: { ...pinnedEnvironment, CODEX_API_KEY: "private" },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("attention");
    expect(diagnostic.checks.protectedTrustRoots.status).toBe("attention");
    expect(
      diagnostic.checks.protectedTrustRoots.roots.find(
        (root) => root.path === "scripts/verify.mjs",
      ),
    ).toEqual({ path: "scripts/verify.mjs", present: false });
  });

  it("reports dirty Git, runtime drift, invalid state, and unavailable authentication without leaking details", async () => {
    const fixture = await repositoryFixture("invalid");

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          npm_config_user_agent: "pnpm/10.33.0 npm/? node/v25.9.0 win32 x64",
        },
        nodeVersion: "v25.9.0",
        homeDirectory: fixture.root,
        gitProbe: () => ({ clean: false }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("attention");
    expect(diagnostic.checks.runtimePins).toMatchObject({
      status: "attention",
      node: { matches: false },
      pnpm: { matches: false },
    });
    expect(diagnostic.checks.gitCleanliness).toEqual({
      status: "attention",
      clean: false,
    });
    expect(diagnostic.checks.configuration).toEqual({
      status: "pass",
      valid: true,
    });
    expect(diagnostic.checks.state).toEqual({
      status: "attention",
      outcome: "invalid-or-unreadable",
    });
    expect(diagnostic.checks.codexAuthentication).toEqual({
      status: "attention",
      available: false,
      source: "none",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("state-secret");
  });

  it("reports invalid configuration without attempting to interpret state", async () => {
    const fixture = await repositoryFixture();
    const configPath = join(
      fixture.root,
      "tools/milestone-orchestrator/config/default.json",
    );
    await writeJson(configPath, {
      schemaVersion: "0.0.0",
      credential: "never-print-this-config-secret",
    });

    const diagnostic = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      {
        environment: {
          ...pinnedEnvironment,
          CODEX_API_KEY: "available-but-private",
        },
        nodeVersion: "24.18.0",
        gitProbe: () => ({ clean: true }),
        headProbe: () => storedHead,
      },
    );

    expect(diagnostic.status).toBe("attention");
    expect(diagnostic.checks.configuration).toEqual({
      status: "attention",
      valid: false,
    });
    expect(diagnostic.checks.state).toEqual({
      status: "attention",
      outcome: "not-checked",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(
      "never-print-this-config-secret",
    );
  });

  it("distinguishes a direct-commit gap from an active reconciliation", async () => {
    const fixture = await repositoryFixture();
    const common = {
      environment: {
        ...pinnedEnvironment,
        CODEX_API_KEY: "available-but-private",
      },
      nodeVersion: "24.18.0",
      gitProbe: () => ({ clean: true }),
    } as const;

    const gap = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      { ...common, headProbe: () => "b".repeat(40) },
    );
    expect(gap.checks.state).toEqual({
      status: "attention",
      outcome: "reconciliation-required",
    });

    const baseState = validState(fixture.root);
    const record = validReconciliationRecord();
    const activeState = {
      ...baseState,
      controllerHistory: [
        {
          schemaVersion: "1.0.0" as const,
          id: record.sourceArchiveId,
          rawSourceState: record.sourceState,
          sourceStateSchemaVersion: "1.2.0",
          sourceRevision: 7,
          priorVerifiedCommit: baseState.repository.verifiedCommit,
          priorRun: baseState.run,
          priorQueue: [],
          priorActiveMilestoneId: null,
          priorNextAllowedAction: "plan",
          archivedAt: "2026-08-04T00:00:00.000Z",
          reason: "external-integration-reconciliation" as const,
        },
      ],
      reconciliation: { active: record, history: [] },
      nextAllowedAction: "reconcile" as const,
    };
    await writeJson(fixture.statePath, activeState);
    const active = await runDoctorDiagnostic(
      { repositoryRoot: fixture.root },
      { ...common, headProbe: () => "b".repeat(40) },
    );
    expect(active.checks.state).toEqual({
      status: "attention",
      outcome: "reconciliation-active",
    });
  });
});
