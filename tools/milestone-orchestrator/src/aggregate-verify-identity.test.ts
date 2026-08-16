import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

const MUTATE_COMMIT = `import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
appendFileSync("tracked.txt", "mutated by stage\\n");
for (const args of [["add", "tracked.txt"], ["commit", "-m", "stage mutation"]]) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
}
`;

const MUTATE_DIRTY = `import { appendFileSync } from "node:fs";
appendFileSync("tracked.txt", "dirty stage edit\\n");
`;

const MUTATE_IGNORED = `import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("artifacts/probe", { recursive: true });
writeFileSync("artifacts/probe/ignored-output.txt", "ignored artifact write\\n");
`;

async function verifierFixture(mutator: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "milestone-loop-verify-identity-"));
  temporaryDirectories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Verify Identity Test");
  git(root, "config", "user.email", "verify-identity@example.invalid");
  for (const path of [
    "scripts/verify.mjs",
    "tools/milestone-orchestrator/src/authority-anchor.ts",
    "tools/milestone-orchestrator/src/process-supervisor.ts",
    "tools/milestone-orchestrator/src/execution-provider-identity.ts",
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(repositoryRoot, path), join(root, path));
  }
  for (const path of [
    "PROJECT_GOAL.md",
    "AGENTS.md",
    "evals/ACCEPTANCE.md",
    "evals/acceptance-manifest.json",
    "evals/HIDDEN_VALIDATION_PROTOCOL.md",
    "evals/immutable-contract-lock.json",
    ".agent/readiness-profile-activated.json",
  ]) {
    if (!existsSync(join(repositoryRoot, path))) continue;
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(repositoryRoot, path), join(root, path));
  }
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "verify-identity-fixture",
        private: true,
        type: "module",
        engines: { node: "24.18.0" },
        packageManager: "pnpm@11.15.1",
        milestoneLoop: { verification: { defaultProfile: "readiness" } },
        scripts: { typecheck: "node mutate.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "mutate.mjs"), mutator);
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n",
  );
  await writeFile(join(root, ".gitignore"), "artifacts/\nnode_modules/\n");
  await writeFile(join(root, "tracked.txt"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture base");
  return root;
}

async function runFocusedVerify(
  root: string,
  runId: string,
): Promise<Record<string, unknown>> {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify.mjs", "--stage", "typecheck", "--run-id", runId],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000,
    },
  );
  const resultPath = join(root, "artifacts", runId, "result.json");
  if (!existsSync(resultPath))
    throw new Error(
      `verify.mjs wrote no result.json (exit ${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  return JSON.parse(await readFile(resultPath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("aggregate verifier end-of-run identity", () => {
  it(
    "flags a stage that commits tracked content as candidate identity drift",
    { timeout: 180_000 },
    async () => {
      const root = await verifierFixture(MUTATE_COMMIT);
      const startCommit = git(root, "rev-parse", "HEAD");
      const result = await runFocusedVerify(root, "drift-commit-case");
      const identityDrift = result["identityDrift"] as {
        detected: boolean;
        fields: string[];
      };
      const candidate = result["candidate"] as Record<string, unknown>;
      const candidateFinal = result["candidateFinal"] as Record<
        string,
        unknown
      >;
      const completion = result["completion"] as {
        eligible: boolean;
        reasons: string[];
      };
      expect(result["schemaVersion"]).toBe("2.1.0");
      expect(identityDrift.detected).toBe(true);
      expect(identityDrift.fields).toContain("gitCommit");
      expect(identityDrift.fields).toContain("gitTree");
      expect(candidate["gitCommit"]).toBe(startCommit);
      expect(candidateFinal["gitCommit"]).toBe(git(root, "rev-parse", "HEAD"));
      expect(candidateFinal["gitCommit"]).not.toBe(startCommit);
      expect(completion.eligible).toBe(false);
      expect(completion.reasons).toContain("candidate_identity_drift");
      expect(result["status"]).not.toBe("PASS");
      expect(result["exitCode"]).not.toBe(0);
    },
  );

  it(
    "flags a stage that dirties the working tree and reads final cleanliness",
    { timeout: 180_000 },
    async () => {
      const root = await verifierFixture(MUTATE_DIRTY);
      const result = await runFocusedVerify(root, "drift-dirty-case");
      const identityDrift = result["identityDrift"] as {
        detected: boolean;
        fields: string[];
      };
      const completion = result["completion"] as { reasons: string[] };
      expect(identityDrift.detected).toBe(true);
      expect(identityDrift.fields).toContain("workingTreeDirty");
      expect(completion.reasons).toContain("candidate_identity_drift");
      expect(completion.reasons).toContain("working_tree_not_proven_clean");
      expect(
        (result["candidateFinal"] as Record<string, unknown>)[
          "workingTreeDirty"
        ],
      ).toBe(true);
    },
  );

  it(
    "does not flag ignored artifact writes as identity drift",
    { timeout: 180_000 },
    async () => {
      const root = await verifierFixture(MUTATE_IGNORED);
      const result = await runFocusedVerify(root, "ignored-control-case");
      const identityDrift = result["identityDrift"] as {
        detected: boolean;
        fields: string[];
      };
      const completion = result["completion"] as { reasons: string[] };
      const executionProvider = result["executionProvider"] as Record<
        string,
        unknown
      >;
      expect(identityDrift).toEqual({ detected: false, fields: [] });
      expect(completion.reasons).not.toContain("candidate_identity_drift");
      expect(completion.reasons).toContain(
        "execution_provider_not_completion_eligible",
      );
      expect(executionProvider).toMatchObject({
        provider: "trusted-container",
        capabilityStatus: "invalid-configuration",
        controlPlaneBound: false,
        completionEligible: false,
      });
      const manifest = JSON.parse(
        await readFile(
          join(root, "artifacts", "ignored-control-case", "run-manifest.json"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      expect(manifest["executionProvider"]).toEqual(executionProvider);
      for (const stage of result["stages"] as {
        commands: { executionProvider: unknown }[];
      }[])
        for (const command of stage.commands)
          expect(command.executionProvider).toEqual(executionProvider);
      const candidate = result["candidate"] as Record<string, unknown>;
      const candidateFinal = result["candidateFinal"] as Record<
        string,
        unknown
      >;
      expect(candidateFinal["gitCommit"]).toBe(candidate["gitCommit"]);
      expect(candidateFinal["gitTree"]).toBe(candidate["gitTree"]);
      expect(candidateFinal["workingTreeDirty"]).toBe(false);
      const typecheck = (
        result["stages"] as {
          id: string;
          commands: { supervision?: Record<string, unknown> }[];
        }[]
      ).find((stage) => stage.id === "typecheck");
      expect(typecheck?.commands[0]?.supervision).toMatchObject({
        timedOut: false,
        outputLimitExceeded: false,
        streamsClosed: true,
        drainTimedOut: false,
        drainCutoff: null,
      });
    },
  );
});
