import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024 * 1024;
const RESERVED_OUTPUT_SEGMENTS = new Set([".git", "node_modules"]);

export class ProductionBuildNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductionBuildNotReadyError";
  }
}

function slash(path) {
  return path.replaceAll("\\", "/");
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return (
    isPlainObject(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function normalizedOutputRoot(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\\")
  ) {
    throw new Error(
      "milestoneLoop.productionBuild.outputRoots must contain nonempty project-relative paths using forward slashes.",
    );
  }
  const parts = value.split("/");
  if (
    isAbsolute(value) ||
    parts.some((part) => part === "" || part === "." || part === "..") ||
    parts.some((part) => RESERVED_OUTPUT_SEGMENTS.has(part))
  ) {
    throw new Error(
      `Production-build output root is not a safe project-relative path: ${value}.`,
    );
  }
  return parts.join("/");
}

function assertDisjointOutputRoots(outputRoots) {
  for (let index = 0; index < outputRoots.length; index += 1) {
    for (let other = index + 1; other < outputRoots.length; other += 1) {
      const left = outputRoots[index];
      const right = outputRoots[other];
      if (
        left === right ||
        left.startsWith(`${right}/`) ||
        right.startsWith(`${left}/`)
      ) {
        throw new Error(
          `Production-build output roots must be unique and non-overlapping: ${left}, ${right}.`,
        );
      }
    }
  }
}

export async function loadProductionBuildContract(repositoryRoot) {
  let packageJson;
  try {
    packageJson = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    );
  } catch (error) {
    throw new Error(
      `Cannot load package.json for production-build evidence: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
  const declaration = packageJson?.milestoneLoop?.productionBuild;
  if (declaration === undefined) {
    throw new ProductionBuildNotReadyError(
      "milestoneLoop.productionBuild is not declared in package.json.",
    );
  }
  if (
    !hasOnlyKeys(declaration, ["script", "outputRoots"]) ||
    typeof declaration.script !== "string" ||
    declaration.script.length === 0 ||
    declaration.script !== declaration.script.trim() ||
    !Array.isArray(declaration.outputRoots) ||
    declaration.outputRoots.length === 0
  ) {
    throw new Error(
      "milestoneLoop.productionBuild must contain exactly a nonempty script and a nonempty outputRoots array.",
    );
  }
  if (declaration.script === "build") {
    throw new Error(
      "milestoneLoop.productionBuild.script must not recurse into the evidence-owning build script.",
    );
  }
  if (typeof packageJson?.scripts?.[declaration.script] !== "string") {
    throw new Error(
      `milestoneLoop.productionBuild.script does not name an existing package script: ${declaration.script}.`,
    );
  }
  const outputRoots = declaration.outputRoots.map(normalizedOutputRoot);
  assertDisjointOutputRoots(outputRoots);
  return {
    script: declaration.script,
    outputRoots,
  };
}

function pnpmInvocation(args) {
  const pnpmPath = process.env.npm_execpath;
  if (pnpmPath && /pnpm(?:\.[cm]?js)?$/i.test(pnpmPath)) {
    return { command: process.execPath, args: [pnpmPath, ...args] };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", ...args],
    };
  }
  return { command: "pnpm", args };
}

function runProcess(command, args, cwd, displayArgv = [command, ...args]) {
  const startedAt = new Date();
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    windowsHide: true,
  });
  return {
    argv: displayArgv,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

function runGit(repositoryRoot, args) {
  return runProcess("git", ["-C", repositoryRoot, ...args], repositoryRoot, [
    "git",
    ...args,
  ]);
}

function assertProcessPassed(result, label) {
  if (result.error !== null || result.exitCode !== 0) {
    const disposition =
      result.error !== null
        ? `could not start: ${result.error}`
        : `failed with exit ${result.exitCode}${result.signal ? ` and signal ${result.signal}` : ""}`;
    throw new Error(`${label} ${disposition}.`);
  }
}

function containedRelative(root, path, label) {
  const contained = slash(relative(root, path));
  if (
    contained.length === 0 ||
    isAbsolute(contained) ||
    contained === ".." ||
    contained.startsWith("../")
  ) {
    throw new Error(`${label} escapes its expected root: ${path}.`);
  }
  return contained;
}

function isOutputPath(path, outputRoots) {
  return outputRoots.some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

function excludedWorkspacePath(path, outputRoots) {
  const segments = path.split("/");
  return (
    segments.some((segment) => RESERVED_OUTPUT_SEGMENTS.has(segment)) ||
    isOutputPath(path, outputRoots)
  );
}

async function workspaceInventory(workspace, outputRoots) {
  const entries = new Map();
  async function walk(directory, parent = "") {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = parent ? `${parent}/${child.name}` : child.name;
      if (excludedWorkspacePath(path, outputRoots)) continue;
      const absolute = resolve(directory, child.name);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        entries.set(path, `symlink:${await readlink(absolute)}`);
      } else if (metadata.isDirectory()) {
        entries.set(path, "directory");
        await walk(absolute, path);
      } else if (metadata.isFile()) {
        const contents = await readFile(absolute);
        entries.set(path, `file:${contents.byteLength}:${sha256(contents)}`);
      } else {
        entries.set(path, `special:${metadata.mode}`);
      }
    }
  }
  await walk(workspace);
  return entries;
}

function changedInventoryPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}

async function removePreexistingOutputs(workspace, outputRoots) {
  const canonicalWorkspace = await realpath(workspace);
  for (const outputRoot of outputRoots) {
    const absolute = resolve(workspace, outputRoot);
    containedRelative(workspace, absolute, "Production-build output root");
    let ancestor = workspace;
    for (const segment of outputRoot.split("/")) {
      ancestor = resolve(ancestor, segment);
      try {
        const ancestorMetadata = await lstat(ancestor);
        if (ancestorMetadata.isSymbolicLink()) {
          throw new Error(
            `Production-build output root has a symbolic-link or junction ancestor: ${outputRoot}.`,
          );
        }
        containedRelative(
          canonicalWorkspace,
          await realpath(ancestor),
          "Production-build output ancestor",
        );
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") {
          break;
        }
        throw error;
      }
    }
    try {
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        throw new Error(
          `Production-build output root is a symbolic link or junction before the build: ${outputRoot}.`,
        );
      }
      await rm(absolute, { recursive: true, force: true });
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
}

async function outputInventory(workspace, outputRoots) {
  const canonicalWorkspace = await realpath(workspace);
  const files = [];
  async function walk(absolute, path) {
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `Production-build output contains a symbolic link or junction: ${path}.`,
      );
    }
    const canonical = await realpath(absolute);
    containedRelative(
      canonicalWorkspace,
      canonical,
      "Production-build output entry",
    );
    if (metadata.isDirectory()) {
      const children = await readdir(absolute);
      children.sort();
      for (const child of children) {
        await walk(resolve(absolute, child), `${path}/${child}`);
      }
      return;
    }
    if (!metadata.isFile()) {
      throw new Error(
        `Production-build output must be a regular file or directory: ${path}.`,
      );
    }
    const contents = await readFile(absolute);
    files.push({
      path,
      bytes: contents.byteLength,
      sha256: sha256(contents),
    });
  }

  for (const outputRoot of outputRoots) {
    const absolute = resolve(workspace, outputRoot);
    try {
      await walk(absolute, outputRoot);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  if (!files.some((file) => file.bytes > 0)) {
    throw new Error(
      "Production build must create at least one nonempty regular file under its declared output roots.",
    );
  }
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

function inventoriesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function runProductionBuild({
  repositoryRoot,
  artifactDirectory,
  afterReport,
}) {
  const contract = await loadProductionBuildContract(repositoryRoot);
  const sourceStatus = runGit(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  assertProcessPassed(sourceStatus, "Production-build source status check");
  if (sourceStatus.stdout.trim().length > 0) {
    throw new Error(
      "Production-build evidence requires a clean source candidate before creating its disposable clone.",
    );
  }
  const sourceCommitResult = runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  assertProcessPassed(
    sourceCommitResult,
    "Production-build source commit check",
  );
  const sourceTreeResult = runGit(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  assertProcessPassed(sourceTreeResult, "Production-build source tree check");
  const source = {
    commit: sourceCommitResult.stdout.trim(),
    tree: sourceTreeResult.stdout.trim(),
  };

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "milestone-loop-production-build-"),
  );
  const workspace = join(temporaryRoot, "workspace");
  try {
    const clone = runProcess(
      "git",
      [
        "clone",
        "--quiet",
        "--no-hardlinks",
        "--no-checkout",
        repositoryRoot,
        workspace,
      ],
      repositoryRoot,
      ["git", "clone", "--no-hardlinks", "--no-checkout", "<candidate>"],
    );
    assertProcessPassed(clone, "Production-build disposable clone");
    const checkout = runGit(workspace, [
      "checkout",
      "--quiet",
      "--detach",
      source.commit,
    ]);
    assertProcessPassed(checkout, "Production-build candidate checkout");
    const removeOrigin = runGit(workspace, ["remote", "remove", "origin"]);
    assertProcessPassed(removeOrigin, "Production-build remote removal");
    const clonedCommit = runGit(workspace, ["rev-parse", "HEAD"]);
    assertProcessPassed(clonedCommit, "Production-build clone identity check");
    if (clonedCommit.stdout.trim() !== source.commit) {
      throw new Error(
        "Disposable production-build clone has the wrong commit.",
      );
    }

    const installArgs = [
      "install",
      "--frozen-lockfile",
      "--offline",
      "--package-import-method=copy",
    ];
    const installInvocation = pnpmInvocation(installArgs);
    const install = runProcess(
      installInvocation.command,
      installInvocation.args,
      workspace,
      ["pnpm", ...installArgs],
    );
    assertProcessPassed(install, "Production-build dependency preparation");

    await removePreexistingOutputs(workspace, contract.outputRoots);
    const before = await workspaceInventory(workspace, contract.outputRoots);
    const buildArgs = ["run", contract.script];
    const buildInvocation = pnpmInvocation(buildArgs);
    const command = runProcess(
      buildInvocation.command,
      buildInvocation.args,
      workspace,
      ["pnpm", ...buildArgs],
    );
    if (command.error !== null || command.exitCode !== 0) {
      const disposition =
        command.error !== null
          ? `could not start: ${command.error}`
          : `failed with exit ${command.exitCode}${command.signal ? ` and signal ${command.signal}` : ""}`;
      throw new Error(`Production build command ${disposition}.`);
    }

    const after = await workspaceInventory(workspace, contract.outputRoots);
    const outsideChanges = changedInventoryPaths(before, after);
    if (outsideChanges.length > 0) {
      throw new Error(
        `Production build modified paths outside declared output roots: ${outsideChanges.slice(0, 20).join(", ")}${outsideChanges.length > 20 ? ` (and ${outsideChanges.length - 20} more)` : ""}.`,
      );
    }
    const outputs = await outputInventory(workspace, contract.outputRoots);
    const pnpmVersionInvocation = pnpmInvocation(["--version"]);
    const pnpmVersion = runProcess(
      pnpmVersionInvocation.command,
      pnpmVersionInvocation.args,
      workspace,
      ["pnpm", "--version"],
    );
    assertProcessPassed(pnpmVersion, "Production-build pnpm version check");
    const report = {
      schemaVersion: "1.0.0",
      status: "PASS",
      mode: "build",
      source,
      runtime: {
        nodeVersion: process.version,
        pnpmVersion: pnpmVersion.stdout.trim(),
      },
      productionBuild: contract,
      preparation: install,
      command,
      commands: [install, command],
      outputs,
    };
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(
      resolve(artifactDirectory, "build-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    if (afterReport) await afterReport({ report, workspace });
    const finalOutputs = await outputInventory(workspace, contract.outputRoots);
    if (!inventoriesEqual(outputs, finalOutputs)) {
      throw new Error(
        "Production-build output changed after the build report was written.",
      );
    }
    return report;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
