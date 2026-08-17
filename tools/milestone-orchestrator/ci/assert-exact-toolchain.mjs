import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const EXPECTED_NODE_VERSION = "v24.18.0";
const EXPECTED_PNPM_VERSION = "11.15.1";
const repositoryRoot = resolve(import.meta.dirname, "../../..");

function fail(message) {
  throw new Error(message);
}

function parseOutput(values) {
  if (values.length !== 2 || values[0] !== "--output" || !values[1])
    fail(
      "Usage: node tools/milestone-orchestrator/ci/assert-exact-toolchain.mjs --output artifacts/<path>.json",
    );
  const output = resolve(repositoryRoot, values[1]);
  const contained = relative(repositoryRoot, output).replaceAll("\\", "/");
  if (
    !contained.startsWith("artifacts/") ||
    isAbsolute(contained) ||
    contained.split("/").includes("..") ||
    !contained.endsWith(".json")
  )
    fail(
      "Toolchain metadata output must be a repository-relative artifacts/*.json path.",
    );
  if (existsSync(output))
    fail(`Toolchain metadata already exists: ${contained}.`);
  return output;
}

function installedPnpmVersion() {
  const invocation =
    process.platform === "win32"
      ? {
          command: process.env.ComSpec ?? "cmd.exe",
          args: ["/d", "/s", "/c", "pnpm --version"],
        }
      : { command: "pnpm", args: ["--version"] };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    fail(
      `Cannot execute installed pnpm: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

async function main() {
  const output = parseOutput(process.argv.slice(2));
  const packageJson = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const pnpmVersion = installedPnpmVersion();
  if (process.version !== EXPECTED_NODE_VERSION)
    fail(
      `CI requires Node ${EXPECTED_NODE_VERSION}, observed ${process.version}.`,
    );
  if (pnpmVersion !== EXPECTED_PNPM_VERSION)
    fail(`CI requires pnpm ${EXPECTED_PNPM_VERSION}, observed ${pnpmVersion}.`);
  if (packageJson.engines?.node !== EXPECTED_NODE_VERSION.slice(1))
    fail("package.json Node pin disagrees with the CI toolchain contract.");
  if (packageJson.packageManager !== `pnpm@${EXPECTED_PNPM_VERSION}`)
    fail("package.json pnpm pin disagrees with the CI toolchain contract.");

  const result = {
    schemaVersion: "exact-ci-toolchain.v1",
    status: "PASS",
    expected: {
      nodeVersion: EXPECTED_NODE_VERSION,
      pnpmVersion: EXPECTED_PNPM_VERSION,
    },
    observed: {
      nodeVersion: process.version,
      pnpmVersion,
      platform: process.platform,
      architecture: process.arch,
    },
    runner: {
      os: process.env.RUNNER_OS ?? null,
      architecture: process.env.RUNNER_ARCH ?? null,
      name: process.env.RUNNER_NAME ?? null,
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
    },
    github: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      ref: process.env.GITHUB_REF ?? null,
    },
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `Exact CI toolchain confirmed: ${process.version}, pnpm ${pnpmVersion}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
