import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProductionBuildNotReadyError,
  runProductionBuild,
} from "./production-build.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const temporaryDirectories = [];
const BUILD_TEST_TIMEOUT_MS = 30_000;
const PNPM_STORE_ENVIRONMENT_KEYS = new Set([
  "npm_config_store_dir",
  "pnpm_config_store_dir",
]);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout.trim();
}

async function createFixture(options = {}) {
  const declaration = Object.hasOwn(options, "declaration")
    ? options.declaration
    : { script: "build:production", outputRoots: ["dist"] };
  const scripts = options.scripts ?? {
    "build:production": "node build-script.mjs",
  };
  const buildSource = options.buildSource ?? "";
  const trackedFiles = options.trackedFiles ?? {};
  const parent = await mkdtemp(join(tmpdir(), "milestone-production-build-"));
  temporaryDirectories.push(parent);
  const repository = join(parent, "repository");
  const artifactDirectory = join(parent, "evidence");
  const storePath = join(parent, "pnpm-store", "v11");
  await mkdir(repository, { recursive: true });
  await mkdir(storePath, { recursive: true });
  const packageJson = {
    name: "production-build-fixture",
    private: true,
    type: "module",
    packageManager: "pnpm@11.15.1",
    scripts,
    ...(declaration === undefined
      ? {}
      : { milestoneLoop: { productionBuild: declaration } }),
  };
  await writeFile(
    join(repository, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(repository, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n",
    "utf8",
  );
  await writeFile(join(repository, "build-script.mjs"), buildSource, "utf8");
  if (options.includeEvidenceWrapper) {
    for (const path of [
      "tools/evidence.mjs",
      "tools/production-build.mjs",
      "tools/run-tool-evidence.mjs",
      "tools/milestone-orchestrator/src/process-supervisor.ts",
      "tools/milestone-orchestrator/src/test-run-probe.cjs",
      "tools/milestone-orchestrator/src/test-run-summary.ts",
    ]) {
      const destination = join(repository, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(repositoryRoot, path), destination);
    }
    await writeFile(
      join(repository, "tools", "workspace-typecheck.mjs"),
      "export function runWorkspaceTypecheck() { throw new Error('unused fixture boundary'); }\n",
      "utf8",
    );
  }
  for (const [path, contents] of Object.entries(trackedFiles)) {
    const absolute = join(repository, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, "utf8");
  }
  runGit(repository, ["init", "--initial-branch=fixture"]);
  runGit(repository, ["config", "user.name", "Fixture"]);
  runGit(repository, ["config", "user.email", "fixture@example.invalid"]);
  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "-m", "fixture"]);
  await mkdir(artifactDirectory, { recursive: true });
  return { artifactDirectory, parent, repository, storePath };
}

function fixturePnpmEnvironment(fixture, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  for (const key of Object.keys(environment)) {
    if (PNPM_STORE_ENVIRONMENT_KEYS.has(key.toLowerCase())) {
      delete environment[key];
    }
  }
  return {
    ...environment,
    pnpm_config_store_dir: fixture.storePath,
  };
}

async function withFixturePnpmEnvironment(fixture, action) {
  const originalEntries = Object.entries(process.env).filter(([key]) =>
    PNPM_STORE_ENVIRONMENT_KEYS.has(key.toLowerCase()),
  );
  for (const key of Object.keys(process.env)) {
    if (PNPM_STORE_ENVIRONMENT_KEYS.has(key.toLowerCase())) {
      delete process.env[key];
    }
  }
  process.env["pnpm_config_store_dir"] = fixture.storePath;
  try {
    return await action();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (PNPM_STORE_ENVIRONMENT_KEYS.has(key.toLowerCase())) {
        delete process.env[key];
      }
    }
    for (const [key, value] of originalEntries) {
      process.env[key] = value;
    }
  }
}

async function executeFixture(fixture, options = {}) {
  return withFixturePnpmEnvironment(fixture, () =>
    runProductionBuild({
      repositoryRoot: fixture.repository,
      artifactDirectory: fixture.artifactDirectory,
      ...options,
    }),
  );
}

async function createStoreAwarePnpm(fixture, options = {}) {
  const storePath = join(fixture.parent, "seeded-store");
  const executablePath = join(fixture.parent, "store-aware-pnpm.mjs");
  await mkdir(storePath, { recursive: true });
  await writeFile(
    executablePath,
    `import { mkdirSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const storePath = ${JSON.stringify(storePath)};
const failInstall = ${JSON.stringify(options.failInstall === true)};
if (args[0] === "store" && args[1] === "path") {
  process.stdout.write(\`${"${storePath}"}\\n\`);
} else if (args[0] === "install") {
  const storeIndex = args.indexOf("--store-dir");
  if (storeIndex < 0 || args[storeIndex + 1] !== storePath) {
    process.stderr.write("offline install selected an unseeded default store\\n");
    process.exitCode = 23;
  } else if (failInstall) {
    process.stderr.write("seeded offline store is deliberately unavailable\\n");
    process.exitCode = 25;
  }
} else if (args[0] === "run" && args[1] === "build:production") {
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/app.js", "application");
} else if (args[0] === "--version") {
  process.stdout.write("11.15.1\\n");
} else {
  process.stderr.write(\`unexpected fake pnpm argv: ${"${JSON.stringify(args)}"}\\n\`);
  process.exitCode = 24;
}
`,
    "utf8",
  );
  return { executablePath, storePath };
}

describe("production-build evidence", () => {
  it("reports an absent production-build declaration as NOT_READY", async () => {
    const fixture = await createFixture({ declaration: undefined });

    await expect(executeFixture(fixture)).rejects.toBeInstanceOf(
      ProductionBuildNotReadyError,
    );
    expect(
      existsSync(join(fixture.artifactDirectory, "build-report.json")),
    ).toBe(false);
  });

  it.each([
    {
      name: "missing",
      declaration: { script: "missing", outputRoots: ["dist"] },
      scripts: {},
      message: /does not name an existing package script/,
    },
    {
      name: "recursive",
      declaration: { script: "build", outputRoots: ["dist"] },
      scripts: { build: "node build-script.mjs" },
      message: /must not recurse into the evidence-owning build script/,
    },
  ])("rejects a $name declared script", async (input) => {
    const fixture = await createFixture(input);

    await expect(executeFixture(fixture)).rejects.toThrow(input.message);
  });

  it(
    "fails when the declared production command exits nonzero",
    async () => {
      const fixture = await createFixture({
        buildSource: "process.exit(7);\n",
      });

      await expect(executeFixture(fixture)).rejects.toThrow(
        /Production build command failed with exit 7/,
      );
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it.each([
    ["nothing", "process.stdout.write('no output');\n"],
    [
      "only an empty directory",
      "import { mkdirSync } from 'node:fs'; mkdirSync('dist', { recursive: true });\n",
    ],
  ])(
    "fails when the command creates %s",
    async (_name, buildSource) => {
      const fixture = await createFixture({ buildSource });

      await expect(executeFixture(fixture)).rejects.toThrow(
        /at least one nonempty regular file/,
      );
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "issues a PASS receipt only after the configured fixture build succeeds",
    async () => {
      const fixture = await createFixture({
        buildSource:
          "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/app.js', 'application');\n",
        includeEvidenceWrapper: true,
      });
      const result = spawnSync(
        process.execPath,
        ["tools/run-tool-evidence.mjs", "build"],
        {
          cwd: fixture.repository,
          encoding: "utf8",
          env: fixturePnpmEnvironment(fixture, {
            ...process.env,
            LOOP_VERIFY_STAGE_ID: "production-build",
            LOOP_VERIFY_COMMAND_ID: "build",
            LOOP_VERIFY_COMMAND_ARTIFACT_DIR: fixture.artifactDirectory,
            LOOP_TELEMETRY_PARENT_MANAGED: "1",
          }),
          windowsHide: true,
        },
      );

      expect(
        result.status,
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);
      const reportContents = await readFile(
        join(fixture.artifactDirectory, "build-report.json"),
      );
      const receipt = JSON.parse(
        await readFile(join(fixture.artifactDirectory, "result.json"), "utf8"),
      );
      expect(receipt).toMatchObject({
        schemaVersion: "1.0.0",
        stageId: "production-build",
        commandId: "build",
        status: "PASS",
        artifacts: [
          {
            path: "build-report.json",
            kind: "build-report",
            bytes: reportContents.byteLength,
            sha256: createHash("sha256").update(reportContents).digest("hex"),
          },
        ],
      });
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "rejects build mutations outside declared output roots",
    async () => {
      const fixture = await createFixture({
        buildSource:
          "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/app.js', 'ok'); writeFileSync('escaped.txt', 'outside');\n",
      });

      await expect(executeFixture(fixture)).rejects.toThrow(
        /modified paths outside declared output roots: escaped\.txt/,
      );
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "rejects symlink or junction entries under an output root",
    async () => {
      const fixture = await createFixture({
        buildSource:
          "import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/app.js', 'ok'); symlinkSync('../outside', 'dist/escape', process.platform === 'win32' ? 'junction' : 'dir');\n",
        trackedFiles: { "outside/canary.txt": "do not follow\n" },
      });

      await expect(executeFixture(fixture)).rejects.toThrow(
        /symbolic link or junction/,
      );
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "removes tracked stale outputs before executing the build",
    async () => {
      const fixture = await createFixture({
        buildSource: "process.stdout.write('did not build');\n",
        trackedFiles: { "dist/stale.js": "stale\n" },
      });

      await expect(executeFixture(fixture)).rejects.toThrow(
        /at least one nonempty regular file/,
      );
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "records exact command and deterministic hashes for a real build",
    async () => {
      const fixture = await createFixture({
        buildSource:
          "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist/assets', { recursive: true }); writeFileSync('dist/app.js', 'application'); writeFileSync('dist/assets/data.json', 'data');\n",
      });

      const result = await executeFixture(fixture);
      const report = JSON.parse(
        await readFile(
          join(fixture.artifactDirectory, "build-report.json"),
          "utf8",
        ),
      );

      expect(result).toEqual(report);
      expect(report).toMatchObject({
        schemaVersion: "1.0.0",
        status: "PASS",
        productionBuild: {
          script: "build:production",
          outputRoots: ["dist"],
        },
        command: {
          argv: ["pnpm", "run", "build:production"],
          exitCode: 0,
          signal: null,
        },
        outputs: { fileCount: 2 },
      });
      expect(report.outputs.files.map((file) => file.path)).toEqual([
        "dist/app.js",
        "dist/assets/data.json",
      ]);
      expect(report.outputs.files.every((file) => file.bytes > 0)).toBe(true);
      expect(
        report.outputs.files.every((file) =>
          /^[0-9a-f]{64}$/.test(file.sha256),
        ),
      ).toBe(true);
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "isolates fixture builds from an absent ambient pnpm store",
    async () => {
      const fixture = await createFixture({
        buildSource:
          "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/app.js', 'application');\n",
      });
      const absentAmbientStore = join(fixture.parent, "absent-ambient-store");
      expect(existsSync(absentAmbientStore)).toBe(false);

      const ambientFixture = {
        ...fixture,
        storePath: absentAmbientStore,
      };
      const report = await withFixturePnpmEnvironment(ambientFixture, () =>
        executeFixture(fixture),
      );

      expect(report.dependencyStore.path).toBe(fixture.storePath);
      expect(existsSync(absentAmbientStore)).toBe(false);
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "reuses the source repository store for the disposable offline install",
    async () => {
      const fixture = await createFixture();
      const fakePnpm = await createStoreAwarePnpm(fixture);
      const originalNpmExecPath = process.env["npm_execpath"];
      process.env["npm_execpath"] = fakePnpm.executablePath;
      try {
        const report = await executeFixture(fixture);

        expect(report).toMatchObject({
          dependencyStore: {
            path: fakePnpm.storePath,
            command: {
              argv: ["pnpm", "store", "path"],
              exitCode: 0,
            },
          },
          preparation: {
            argv: [
              "pnpm",
              "install",
              "--frozen-lockfile",
              "--offline",
              "--package-import-method=copy",
              "--store-dir",
              fakePnpm.storePath,
            ],
            exitCode: 0,
          },
          outputs: { fileCount: 1 },
        });
      } finally {
        if (originalNpmExecPath === undefined)
          delete process.env["npm_execpath"];
        else process.env["npm_execpath"] = originalNpmExecPath;
      }
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "retains bounded dependency-preparation diagnostics on failure",
    async () => {
      const fixture = await createFixture();
      const fakePnpm = await createStoreAwarePnpm(fixture, {
        failInstall: true,
      });
      const originalNpmExecPath = process.env["npm_execpath"];
      process.env["npm_execpath"] = fakePnpm.executablePath;
      try {
        await expect(executeFixture(fixture)).rejects.toThrow(
          /dependency preparation failed with exit 25: seeded offline store is deliberately unavailable/u,
        );
      } finally {
        if (originalNpmExecPath === undefined)
          delete process.env["npm_execpath"];
        else process.env["npm_execpath"] = originalNpmExecPath;
      }
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it(
    "detects output mutation after report creation and before success",
    async () => {
      const fixture = await createFixture({
        buildSource:
          "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/app.js', 'first');\n",
      });

      await expect(
        executeFixture(fixture, {
          afterReport: async ({ workspace }) => {
            await writeFile(
              join(workspace, "dist", "app.js"),
              "second",
              "utf8",
            );
          },
        }),
      ).rejects.toThrow(/changed after the build report was written/);
    },
    BUILD_TEST_TIMEOUT_MS,
  );

  it("the template wrapper exits 2 and cannot leave a PASS receipt", async () => {
    const parent = await mkdtemp(join(tmpdir(), "milestone-build-wrapper-"));
    temporaryDirectories.push(parent);
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "tools/run-tool-evidence.mjs", "build"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          LOOP_VERIFY_STAGE_ID: "production-build",
          LOOP_VERIFY_COMMAND_ID: "build",
          LOOP_VERIFY_COMMAND_ARTIFACT_DIR: parent,
          LOOP_TELEMETRY_PARENT_MANAGED: "1",
        },
        windowsHide: true,
      },
    );

    expect(result.status).toBe(2);
    expect(existsSync(join(parent, "result.json"))).toBe(false);
    expect(
      JSON.parse(await readFile(join(parent, "manifest.json"), "utf8")),
    ).toMatchObject({ status: "NOT_READY", receipt: null });
  });
});
