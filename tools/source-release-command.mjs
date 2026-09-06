import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  evidenceContext,
  commandIdentity,
  runPnpm,
  assertCommandPassed,
  writeReceipt,
  writeManualEvidenceFailure,
} from "./evidence.mjs";
import { validateCommandReceiptDirectory } from "./milestone-orchestrator/src/verifier.ts";
import {
  createReleaseArchive,
  extractReleaseArchive,
  releaseHash,
  releaseInventory,
} from "./source-release-archive.mjs";
import {
  inspectSourceArchitecture,
  inspectSourceDependencies,
  readReleasePolicy,
} from "./source-release-inspection.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}
function committedFiles(root, commit, paths) {
  assert(
    /^[a-f0-9]{40}$/.test(commit),
    "Release requires an exact real commit identity.",
  );
  const tree = git(root, "ls-tree", "-r", "--full-tree", "-z", commit)
    .split("\0")
    .filter(Boolean);
  const modes = new Map(
    tree.map((entry) => {
      const [metadata, path] = entry.split("\t");
      return [path, metadata.split(" ").slice(0, 2).join(" ")];
    }),
  );
  for (const path of paths)
    assert.equal(
      modes.get(path),
      "100644 blob",
      `Required release file must be a committed regular non-executable file: ${path}`,
    );
  const output = execFileSync("git", ["-C", root, "cat-file", "--batch"], {
    input: paths.map((path) => `${commit}:${path}\n`).join(""),
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  let offset = 0;
  const files = paths.map((path) => {
    const end = output.indexOf(10, offset);
    assert(end !== -1, "Truncated Git object response.");
    const header = output.subarray(offset, end).toString("ascii"),
      match = /^([a-f0-9]{40}) blob ([0-9]+)$/.exec(header);
    assert(
      match,
      `Required release file missing from the exact commit: ${path}`,
    );
    const size = Number(match[2]);
    offset = end + 1;
    assert(size <= 20_000_000 && offset + size < output.length);
    const contents = Buffer.from(output.subarray(offset, offset + size));
    offset += size;
    assert.equal(output[offset++], 10);
    return { path, contents };
  });
  assert.equal(offset, output.length);
  return files;
}
export async function createCommittedReleasePayload(root, source, policy) {
  assert.equal(git(root, "rev-parse", `${source.commit}^{tree}`), source.tree);
  const files = committedFiles(root, source.commit, policy.payloadFiles);
  const pkgFile = files.find((file) => file.path === "package.json"),
    pkg = JSON.parse(pkgFile.contents);
  const shipped = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    type: "module",
    description: "Milestone orchestrator runtime and adopter generator",
    engines: pkg.engines,
    packageManager: pkg.packageManager,
    scripts: Object.fromEntries(
      policy.publishedScripts.map((name) => [name, pkg.scripts[name]]),
    ),
    devDependencies: pkg.devDependencies,
  };
  pkgFile.contents = Buffer.from(json(shipped));
  const universal = files.find(
    (file) =>
      file.path ===
      "tools/milestone-orchestrator/template/bootstrap-adopter/AGENTS.md",
  );
  assert(universal, "Universal adopter instructions are required.");
  files.find((file) => file.path === "AGENTS.md").contents = Buffer.from(
    universal.contents,
  );
  files.push({
    path: "SOURCE.json",
    contents: Buffer.from(
      json({
        schemaVersion: "source-release-provenance.v1",
        source,
        claimScope: "distribution-provenance",
        grantsAdopterAuthority: false,
      }),
    ),
  });
  const inventory = releaseInventory(files),
    archive = createReleaseArchive(files, policy);
  return {
    files,
    archive,
    manifest: {
      schemaVersion: "source-release-manifest.v1",
      source,
      claimScope: "source-release-payload",
      completionEligible: false,
      cadence: "candidate-single-build",
      payload: {
        files: inventory,
        fileCount: inventory.length,
        totalBytes: inventory.reduce((n, file) => n + file.bytes, 0),
      },
      archive: {
        path: "release.tar.gz",
        bytes: archive.length,
        sha256: releaseHash(archive),
      },
      limits: {
        maximumPayloadFiles: policy.maximumPayloadFiles,
        maximumPayloadBytes: policy.maximumPayloadBytes,
        maximumArchiveBytes: policy.maximumArchiveBytes,
      },
    },
  };
}
async function boundedConsumer(root, payload, context) {
  const temporary = await realpath(
      await mkdtemp(resolve(tmpdir(), "source-release-consumer-")),
    ),
    extracted = resolve(temporary, "extracted"),
    adopter = resolve(temporary, "generated adopter");
  const captures = [];
  const childEnv = {
    NODE_PATH: "",
    NODE_OPTIONS: "",
    LOOP_VERIFY_STAGE_ID: undefined,
    LOOP_VERIFY_COMMAND_ID: undefined,
    LOOP_VERIFY_COMMAND_ARTIFACT_DIR: undefined,
  };
  async function command(id, argv, cwd, timeoutMs = 600_000) {
    const result = await runPnpm(argv, { cwd, timeoutMs, env: childEnv });
    for (const stream of ["stdout", "stderr"])
      await writeFile(
        resolve(context.artifactDirectory, `${id}.${stream}.log`),
        result[stream] ?? "",
      );
    captures.push({
      id,
      argv: ["pnpm", ...argv],
      exitCode: result.status,
      stdoutPath: `${id}.stdout.log`,
      stderrPath: `${id}.stderr.log`,
    });
    assertCommandPassed(result, `Detached release ${id}`);
    return result.stdout;
  }
  try {
    await extractReleaseArchive(
      payload.archive,
      payload.manifest.payload.files,
      payload.manifest.limits,
      extracted,
    );
    const store = (await command("store-path", ["store", "path"], root)).trim();
    await command(
      "consumer-install",
      [
        "install",
        "--frozen-lockfile",
        "--offline",
        "--package-import-method=copy",
        "--store-dir",
        store,
      ],
      extracted,
    );
    const runtime = await realpath(
      resolve(extracted, "node_modules/tsx/dist/cli.mjs"),
    );
    assert(
      runtime.startsWith(extracted + "/") ||
        runtime.startsWith(extracted + "\\"),
      "Consumer resolved a shared/source tsx runtime.",
    );
    const output = await command(
      "consumer-generate",
      [
        "exec",
        "tsx",
        "tools/milestone-orchestrator/src/adopter-package-cli.ts",
        "--definition",
        "fixtures/fresh-adopter/definition.json",
        "--output",
        adopter,
      ],
      extracted,
    );
    const generated = JSON.parse(output.slice(output.indexOf("{")));
    assert.equal(generated.status, "PASS");
    const pkg = JSON.parse(
      await readFile(resolve(adopter, "package.json"), "utf8"),
    );
    assert.equal(pkg.name, "alpine-loop-lab");
    assert.equal(pkg.milestoneLoop.verification.defaultProfile, "bootstrap");
    assert.equal(pkg.milestoneLoop.verification.contractId, undefined);
    for (const path of [
      ".agent/readiness-profile-activated.json",
      ".agent/verification-manifest.json",
      "evals/authority-revisions",
      "evals/authority-epochs",
      "artifacts/orchestrator/state/state.json",
    ])
      assert(
        !existsSync(resolve(adopter, path)),
        `Source state/authority leaked into adopter: ${path}`,
      );
    assert.equal(
      git(
        adopter,
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ),
      "",
    );
    assert.equal(
      git(adopter, "status", "--porcelain=v1", "--untracked-files=all"),
      "",
    );
    const report = {
      schemaVersion: "source-release-consumer.v1",
      status: "PASS",
      source: payload.manifest.source,
      releaseArchiveSha256: payload.manifest.archive.sha256,
      claimScope: "bounded-external-generator-smoke",
      completionEligible: false,
      completeBuildQualification: false,
      completeAdopterQualification: false,
      originalCheckoutInaccessible: false,
      fullQualificationRequired:
        "Independent repeated native builds and an inaccessible-source full install/generate/commission/bootstrap consumer remain separate gates.",
      nodeVersion: process.version,
      pnpmVersion: "11.15.1",
      extractedRuntimePath: runtime,
      generated: {
        commit: git(adopter, "rev-parse", "HEAD"),
        tree: git(adopter, "rev-parse", "HEAD^{tree}"),
        branch: git(adopter, "branch", "--show-current"),
        commitCount: Number(git(adopter, "rev-list", "--count", "HEAD")),
        packageName: pkg.name,
        defaultProfile: "bootstrap",
        sourceContractAbsent: true,
        controllerStateAbsent: true,
      },
      captures,
    };
    assert.equal(report.generated.commitCount, 2);
    assert.equal(report.generated.branch, "main");
    return report;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
async function build(context) {
  const identity = await commandIdentity(repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  assert.equal(
    identity.gitStatus,
    "",
    "Source release build requires a clean committed checkout.",
  );
  const source = {
    commit: identity.gitCommit,
    tree: git(repositoryRoot, "rev-parse", "HEAD^{tree}"),
  };
  const architecture = await inspectSourceArchitecture(repositoryRoot),
    policy = await readReleasePolicy(repositoryRoot);
  const payload = await createCommittedReleasePayload(
    repositoryRoot,
    source,
    policy,
  );
  const dist = resolve(repositoryRoot, "dist");
  for (const file of payload.files) {
    const path = resolve(dist, "payload", file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.contents, { flag: "wx" });
  }
  await writeFile(resolve(dist, "release.tar.gz"), payload.archive, {
    flag: "wx",
  });
  await writeFile(
    resolve(dist, "release-manifest.json"),
    json(payload.manifest),
    { flag: "wx" },
  );
  await writeFile(
    resolve(context.artifactDirectory, "architecture.json"),
    json(architecture),
  );
  const consumer = await boundedConsumer(repositoryRoot, payload, context);
  await writeFile(resolve(dist, "consumer.json"), json(consumer), {
    flag: "wx",
  });
  await writeFile(
    resolve(context.artifactDirectory, "consumer.json"),
    json(consumer),
  );
  return {
    report: {
      schemaVersion: "source-release-build.v1",
      status: "PASS",
      claimScope: "source-supporting-build",
      completionEligible: false,
      source,
      archive: payload.manifest.archive,
      payload: payload.manifest.payload,
      consumer,
    },
    consumer,
  };
}
export async function sourceReleaseMain(args) {
  assert(
    args.length === 1 &&
      ["build", "dependencies", "architecture"].includes(args[0]),
    "Usage: source-release.mjs build|dependencies|architecture",
  );
  const mode = args[0];
  if (mode === "build") {
    assert(
      !existsSync(resolve(repositoryRoot, "dist")),
      "Source release output must be absent; stale outputs are never adopted.",
    );
    process.env.LOOP_VERIFY_STAGE_ID = "source-release-build";
    process.env.LOOP_VERIFY_COMMAND_ID = "build:production";
    process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = resolve(
      repositoryRoot,
      "dist/build-evidence",
    );
  }
  const context = await evidenceContext(
    mode === "build" ? "source-release-build" : "source-static",
    mode === "dependencies"
      ? "verify:source-dependencies"
      : mode === "architecture"
        ? "lint:source-architecture"
        : "build:production",
  );
  try {
    let report;
    if (mode === "build") ({ report } = await build(context));
    else if (mode === "dependencies")
      report = await inspectSourceDependencies(
        repositoryRoot,
        context.artifactDirectory,
      );
    else report = await inspectSourceArchitecture(repositoryRoot);
    await writeFile(
      resolve(context.artifactDirectory, "report.json"),
      json(report),
    );
    const artifacts = [
      {
        path: "report.json",
        kind:
          mode === "build"
            ? "source-release-build-report"
            : mode === "dependencies"
              ? "source-dependencies-report"
              : "source-architecture-report",
      },
    ];
    const { readdir, stat } = await import("node:fs/promises");
    for (const name of await readdir(context.artifactDirectory))
      if (
        name !== "report.json" &&
        (name.endsWith(".log") ||
          name === "consumer.json" ||
          name === "architecture.json") &&
        (await stat(resolve(context.artifactDirectory, name))).size > 0
      )
        artifacts.push({
          path: name,
          kind: name.endsWith(".log")
            ? "source-command-log"
            : "source-build-support",
        });
    await writeReceipt(
      context,
      [
        {
          id: `SOURCE-${mode.toUpperCase()}`,
          summary: `${mode} executed the real source boundary and retained inspected artifacts; this command is completion-ineligible supporting evidence.`,
        },
      ],
      artifacts,
    );
    await validateCommandReceiptDirectory({
      directory: context.artifactDirectory,
      expectedStageId: context.stageId,
      expectedCommandId: context.commandId,
      requiredKinds: [artifacts[0].kind],
    });
    process.stdout.write(
      json({
        status: "PASS",
        mode,
        completionEligible: false,
        artifactDirectory: context.artifactDirectory,
      }),
    );
  } catch (error) {
    await writeManualEvidenceFailure(context, {
      kind: "product",
      message: String(error),
    });
    throw error;
  }
}
