import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReleaseArchive,
  extractReleaseArchive,
  inspectReleaseArchive,
  inventoryReleaseDirectory,
  releaseHash,
  releaseInventory,
  releasePath,
} from "./source-release-archive.mjs";
import {
  analyzeReleaseImports,
  compareInstalledDependencyGraphs,
  installedPackageInventory,
  inspectSourceArchitecture,
  readReleasePolicy,
} from "./source-release-inspection.mjs";
import { createCommittedReleasePayload } from "./source-release-command.mjs";
import {
  inspectSourceReleaseOutputs,
  retainSourceReleaseEvidence,
} from "./source-release-evidence.mjs";

const root = resolve(import.meta.dirname, "..");
const limits = {
  maximumPayloadFiles: 400,
  maximumPayloadBytes: 20_000_000,
  maximumArchiveBytes: 20_000_000,
};
const temporary = [];
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const file = (path, contents) => ({ path, contents: Buffer.from(contents) });
const testFiles = [
  file("runtime/entry.ts", "export const answer = 42;\n"),
  file("README.md", "fixture\n"),
];
async function directory() {
  const path = await realpath(
    await mkdtemp(resolve(tmpdir(), "source-release-test-")),
  );
  temporary.push(path);
  return path;
}
async function put(root, path, contents) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), contents);
}
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  }).trim();
}
function alteredTar(archive, mutate) {
  const tar = gunzipSync(archive);
  mutate(tar);
  const header = tar.subarray(0, 512);
  header.fill(32, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  const result = gzipSync(tar, { level: 9 });
  result[9] = 255;
  return result;
}

describe("portable release archive", () => {
  it("produces sorted deterministic bytes and fully extracts to a fresh directory", async () => {
    const archive = createReleaseArchive(testFiles, limits),
      inventory = releaseInventory(testFiles);
    expect(createReleaseArchive([...testFiles].reverse(), limits)).toEqual(
      archive,
    );
    const destination = resolve(await directory(), "unpacked");
    expect(
      await extractReleaseArchive(archive, inventory, limits, destination),
    ).toEqual(inventory);
    expect(
      await readFile(resolve(destination, "runtime/entry.ts"), "utf8"),
    ).toContain("42");
  });
  it.each([
    "../escape",
    "/absolute",
    "C:/escape",
    "a\\b",
    "a/./b",
    "a//b",
    "CON.txt",
    "x. ",
    "node_modules/a",
    ".git/config",
    "artifacts/state",
    ".tools/runtime",
  ])("rejects nonportable/private path %s", (path) => {
    expect(() => releasePath(path)).toThrow();
  });
  it("rejects case-folded duplicate entries", () => {
    expect(() =>
      createReleaseArchive([file("A", "1"), file("a", "2")], limits),
    ).toThrow(/duplicate/);
  });
  it("rejects excessive file counts and payload bytes", () => {
    expect(() =>
      createReleaseArchive(testFiles, { ...limits, maximumPayloadFiles: 1 }),
    ).toThrow();
    expect(() =>
      createReleaseArchive(testFiles, { ...limits, maximumPayloadBytes: 1 }),
    ).toThrow();
  });
  it.each([
    [
      "traversal",
      (tar) => {
        tar.fill(0, 0, 100);
        tar.write("../outside", 0);
      },
    ],
    [
      "symbolic link",
      (tar) => {
        tar[156] = 50;
      },
    ],
    [
      "hard link",
      (tar) => {
        tar[156] = 49;
      },
    ],
    [
      "executable",
      (tar) => {
        tar.write("0000755\0", 100, 8);
      },
    ],
    [
      "hidden header metadata",
      (tar) => {
        tar[500] = 65;
      },
    ],
  ])("rejects %s before any extraction writes", async (_label, mutate) => {
    const destination = resolve(await directory(), "rejected");
    await expect(
      extractReleaseArchive(
        alteredTar(createReleaseArchive(testFiles, limits), mutate),
        releaseInventory(testFiles),
        limits,
        destination,
      ),
    ).rejects.toThrow();
    expect(existsSync(destination)).toBe(false);
  });
  it("rejects changed bytes, truncated archives and missing end blocks", () => {
    const archive = createReleaseArchive(testFiles, limits);
    expect(() =>
      inspectReleaseArchive(
        alteredTar(archive, (tar) => {
          tar[512] ^= 1;
        }),
        releaseInventory(testFiles),
        limits,
      ),
    ).toThrow(/inventory/);
    expect(() =>
      inspectReleaseArchive(
        archive.subarray(0, archive.length - 4),
        releaseInventory(testFiles),
        limits,
      ),
    ).toThrow();
    expect(() =>
      inspectReleaseArchive(
        gzipSync(gunzipSync(archive).subarray(0, -1024)),
        releaseInventory(testFiles),
        limits,
      ),
    ).toThrow(/end marker/);
  });
  it("preserves a preexisting extraction destination", async () => {
    const destination = await directory();
    await put(destination, "sentinel", "outside");
    await expect(
      extractReleaseArchive(
        createReleaseArchive(testFiles, limits),
        releaseInventory(testFiles),
        limits,
        destination,
      ),
    ).rejects.toThrow(/absent/);
    expect(await readFile(resolve(destination, "sentinel"), "utf8")).toBe(
      "outside",
    );
  });
  it("rejects a directory junction and hardlinked output", async () => {
    const parent = await directory(),
      outside = resolve(parent, "outside"),
      inside = resolve(parent, "inside");
    await mkdir(outside);
    await mkdir(inside);
    await put(outside, "data", "held");
    await symlink(
      outside,
      resolve(inside, "redirect"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(inventoryReleaseDirectory(inside)).rejects.toThrow(/link/);
    await rm(resolve(inside, "redirect"));
    await link(resolve(outside, "data"), resolve(inside, "data"));
    await expect(inventoryReleaseDirectory(inside)).rejects.toThrow(
      /independent/,
    );
  });
});

describe("real source release dependency closure", { timeout: 60_000 }, () => {
  const policy = {
    entryPoints: ["tools/entry.ts"],
    sdkImporters: [],
    processImporters: [],
  };
  it("resolves TS .js imports, literal URL assets and package entrypoints", () => {
    const files = [
      file(
        "tools/entry.ts",
        'import "./shared.js"; import "tsx/esm/api"; new URL("schema.json", import.meta.url);',
      ),
      file("tools/shared.ts", "export {};"),
      file("tools/schema.json", "{}"),
    ];
    const edges = analyzeReleaseImports(files, policy, new Set(["tsx"]));
    expect(edges.map((edge) => edge.to).sort()).toEqual([
      "tools/schema.json",
      "tools/shared.ts",
      "tsx/esm/api",
    ]);
  });
  it.each([
    ['import "./omitted.js";', /Missing release dependency/],
    ['import "unknown-package";', /Undeclared package/],
    ['import "node:child_process";', /process boundary/],
    ['import "@openai/codex-sdk";', /SDK transport/],
    ['import "file:///source/private.ts";', /Absolute/],
    ['import "../../outside.ts";', /escapes/],
    ["import(variable);", /Unbounded dynamic/],
    ["new URL(variable, import.meta.url);", /Dynamic source asset/],
    ["const = ;", /Cannot parse/],
  ])("rejects the actual import %s", (source, reason) => {
    expect(() =>
      analyzeReleaseImports(
        [file("tools/entry.ts", source)],
        policy,
        new Set(["@openai/codex-sdk"]),
      ),
    ).toThrow(reason);
  });
  it("rejects absent entrypoints and controller imports of fixture code", () => {
    expect(() => analyzeReleaseImports([], policy, new Set())).toThrow(
      /entrypoint/,
    );
    const entry = "tools/milestone-orchestrator/src/entry.ts";
    expect(() =>
      analyzeReleaseImports(
        [
          file(entry, 'import "../../../fixtures/code.ts";'),
          file("fixtures/code.ts", "export {}"),
        ],
        { ...policy, entryPoints: [entry] },
        new Set(),
      ),
    ).toThrow(/untrusted/);
  });
  it("inspects the complete current explicit payload and keeps template assets in their generated layout", async () => {
    const report = await inspectSourceArchitecture(root);
    expect(report.status).toBe("PASS");
    expect(report.completionEligible).toBe(false);
    expect(
      report.edges.some(
        (edge) =>
          edge.from.endsWith("scaffold/tools/bootstrap-evidence.mjs") &&
          edge.to === "tools/evidence.mjs",
      ),
    ).toBe(true);
  });
  it.each([
    "tools/milestone-orchestrator/src/cli.ts",
    "tools/milestone-orchestrator/schemas/orchestrator-config.schema.json",
    "tools/milestone-orchestrator/template/bootstrap-adopter/scaffold/app/kernel.ts",
  ])("rejects a committed omission of %s", async (omission) => {
    const fixture = await directory(),
      policy = await readReleasePolicy(root);
    const paths = [
      "package.json",
      "AGENTS.md",
      "tools/milestone-orchestrator/template/bootstrap-adopter/AGENTS.md",
      omission,
    ];
    for (const path of paths)
      if (path !== omission)
        await put(fixture, path, await readFile(resolve(root, path)));
    git(fixture, "init", "--quiet", "--initial-branch=main");
    git(fixture, "config", "user.name", "Release fixture");
    git(fixture, "config", "user.email", "fixture@example.invalid");
    git(fixture, "add", ".");
    git(
      fixture,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "committed omission fixture",
    );
    await expect(
      createCommittedReleasePayload(
        fixture,
        {
          commit: git(fixture, "rev-parse", "HEAD"),
          tree: git(fixture, "rev-parse", "HEAD^{tree}"),
        },
        { ...policy, payloadFiles: paths },
      ),
    ).rejects.toThrow(/committed regular/);
  });
  it("rejects installed package corruption, missing files and changed graph versions", async () => {
    const actual = await directory(),
      expected = await directory(),
      path = "node_modules/.pnpm/example@1/node_modules/example";
    await put(
      actual,
      path + "/package.json",
      '{"name":"example","version":"1"}',
    );
    await put(
      expected,
      path + "/package.json",
      '{"name":"example","version":"1"}',
    );
    const graph = (root, version = "1") => [
      {
        path: root,
        devDependencies: {
          example: { from: "example", version, path: resolve(root, path) },
        },
      },
    ];
    expect(
      (
        await compareInstalledDependencyGraphs(
          graph(actual),
          actual,
          graph(expected),
          expected,
          ["."],
        )
      )[0].present,
    ).toBe(true);
    await put(
      actual,
      path + "/package.json",
      '{"name":"example","version":"evil"}',
    );
    await expect(
      compareInstalledDependencyGraphs(
        graph(actual),
        actual,
        graph(expected),
        expected,
        ["."],
      ),
    ).rejects.toThrow(/bytes differ/);
    await rm(resolve(actual, path, "package.json"));
    await expect(
      compareInstalledDependencyGraphs(
        graph(actual),
        actual,
        graph(expected),
        expected,
        ["."],
      ),
    ).rejects.toThrow();
    await expect(
      compareInstalledDependencyGraphs(
        graph(actual, "2"),
        actual,
        graph(expected),
        expected,
        ["."],
      ),
    ).rejects.toThrow();
  });
  it("rejects shared hardlinks in installed packages", async () => {
    const fixture = await directory();
    await put(fixture, "package.json", "{}");
    await link(
      resolve(fixture, "package.json"),
      resolve(fixture, "alias.json"),
    );
    await expect(installedPackageInventory(fixture)).rejects.toThrow(
      /independent/,
    );
  });
  it("normalizes only path-checked workspace aliases of the same installed package", async () => {
    const actual = await directory(),
      expected = await directory(),
      path = "node_modules/.pnpm/example@1/node_modules/example",
      workspace = "tools/controller";
    for (const root of [actual, expected]) {
      await put(
        root,
        path + "/package.json",
        '{"name":"example","version":"1"}',
      );
      await mkdir(resolve(root, workspace), { recursive: true });
    }
    const graph = (root) => [
      {
        path: root,
        devDependencies: {
          example: { from: "example", version: "1", path: resolve(root, path) },
        },
      },
    ];
    const alias = {
      path: resolve(actual, workspace),
      unsavedDependencies: {
        example: {
          from: "example",
          version: "link:../../" + path,
          path: resolve(actual, path),
        },
      },
    };
    expect(
      (
        await compareInstalledDependencyGraphs(
          [...graph(actual), alias],
          actual,
          graph(expected),
          expected,
          [".", workspace],
        )
      )[0].version,
    ).toBe("1");
    alias.unsavedDependencies.example.version = "link:../../outside";
    await expect(
      compareInstalledDependencyGraphs(
        [...graph(actual), alias],
        actual,
        graph(expected),
        expected,
        [".", workspace],
      ),
    ).rejects.toThrow(/alias does not resolve/);
  });
});

// Synthetic producer records below exercise the independent retention boundary;
// they are fixture data and never qualify an actual release or candidate.
async function outputFixture() {
  const workspace = await directory(),
    source = { commit: "1".repeat(40), tree: "2".repeat(40) };
  const files = [
    ...testFiles,
    {
      path: "SOURCE.json",
      contents: json({
        schemaVersion: "source-release-provenance.v1",
        source,
        claimScope: "distribution-provenance",
        grantsAdopterAuthority: false,
      }),
    },
  ];
  const archive = createReleaseArchive(files, limits),
    inventory = releaseInventory(files);
  const manifest = {
    schemaVersion: "source-release-manifest.v1",
    source,
    claimScope: "source-release-payload",
    completionEligible: false,
    cadence: "candidate-single-build",
    payload: {
      files: inventory,
      fileCount: files.length,
      totalBytes: files.reduce((n, file) => n + file.contents.length, 0),
    },
    archive: {
      path: "release.tar.gz",
      bytes: archive.length,
      sha256: releaseHash(archive),
    },
    limits,
  };
  const generated = {
    schemaVersion: "milestone-loop-adopter-package-result.v1",
    status: "PASS",
    git: {
      clean: true,
      commitCount: 2,
      commissioningInputCommit: "3".repeat(40),
      tree: "4".repeat(40),
      branch: "main",
    },
    project: { packageName: "fixture", profile: "bootstrap" },
    generated: { activeManifestPresent: false, readinessMarkerPresent: false },
    files: [{ path: "PROJECT_GOAL.md" }],
  };
  const captures = [
    { id: "store-path", argv: ["pnpm", "store", "path"] },
    {
      id: "consumer-install",
      argv: [
        "pnpm",
        "install",
        "--frozen-lockfile",
        "--offline",
        "--package-import-method=copy",
      ],
    },
    {
      id: "consumer-generate",
      argv: [
        "pnpm",
        "exec",
        "tsx",
        "tools/milestone-orchestrator/src/adopter-package-cli.ts",
        "--definition",
        "fixtures/fresh-adopter/definition.json",
      ],
    },
  ].map((entry) => ({
    ...entry,
    exitCode: 0,
    stdoutPath: entry.id + ".stdout.log",
    stderrPath: entry.id + ".stderr.log",
  }));
  const consumer = {
    schemaVersion: "source-release-consumer.v1",
    status: "PASS",
    source,
    releaseArchiveSha256: manifest.archive.sha256,
    claimScope: "bounded-external-generator-smoke",
    completionEligible: false,
    completeBuildQualification: false,
    completeAdopterQualification: false,
    originalCheckoutInaccessible: false,
    nodeVersion: "v24.18.0",
    pnpmVersion: "11.15.1",
    generated: {
      commit: generated.git.commissioningInputCommit,
      tree: generated.git.tree,
      branch: "main",
      packageName: "fixture",
    },
    captures,
  };
  for (const file of files)
    await put(workspace, "dist/payload/" + file.path, file.contents);
  await put(workspace, "dist/release.tar.gz", archive);
  await put(workspace, "dist/release-manifest.json", json(manifest));
  await put(workspace, "dist/consumer.json", json(consumer));
  await put(workspace, "dist/build-evidence/consumer.json", json(consumer));
  for (const capture of captures) {
    await put(
      workspace,
      "dist/build-evidence/" + capture.stdoutPath,
      capture.id === "consumer-generate"
        ? json(generated)
        : "fixture observation\n",
    );
    await put(workspace, "dist/build-evidence/" + capture.stderrPath, "");
  }
  const child = json({
    schemaVersion: "source-release-build.v1",
    status: "PASS",
    completionEligible: false,
    source,
    archive: manifest.archive,
    payload: manifest.payload,
    consumer,
  });
  await put(workspace, "dist/build-evidence/report.json", child);
  await put(
    workspace,
    "dist/build-evidence/result.json",
    json({
      schemaVersion: "1.0.0",
      stageId: "source-release-build",
      commandId: "build:production",
      status: "PASS",
      checks: [
        {
          id: "fixture",
          status: "PASS",
          summary: "synthetic boundary fixture",
        },
      ],
      artifacts: [
        {
          path: "report.json",
          kind: "source-release-build-report",
          bytes: child.length,
          sha256: releaseHash(child),
        },
      ],
    }),
  );
  const report = {
    status: "PASS",
    source,
    runtime: { nodeVersion: "v24.18.0", pnpmVersion: "11.15.1" },
    productionBuild: { script: "build:production", outputRoots: ["dist"] },
  };
  const refresh = async () => {
    report.outputs = {
      files: (await inventoryReleaseDirectory(resolve(workspace, "dist"))).map(
        (file) => ({ ...file, path: "dist/" + file.path }),
      ),
    };
  };
  await refresh();
  return { workspace, report, refresh };
}
describe("independent source output retention", () => {
  it("consumes archive, payload and real receipt validation before retaining the raw producer files", async () => {
    const fixture = await outputFixture(),
      artifactDirectory = await directory();
    const artifacts = await retainSourceReleaseEvidence({
      ...fixture,
      artifactDirectory,
    });
    expect(artifacts.map((file) => file.kind)).toContain(
      "source-release-archive",
    );
    await expect(
      retainSourceReleaseEvidence({ ...fixture, artifactDirectory }),
    ).rejects.toThrow(/overwrite/);
  });
  it.each(["result.json", "report.json"])(
    "rejects a zero-exit producer with omitted %s at its actual receipt boundary",
    async (missing) => {
      const fixture = await outputFixture();
      await rm(resolve(fixture.workspace, "dist/build-evidence", missing));
      await fixture.refresh();
      await expect(inspectSourceReleaseOutputs(fixture)).rejects.toThrow(
        /Command-owned/,
      );
    },
  );
  it("rejects post-report mutation before copying any retained files", async () => {
    const fixture = await outputFixture(),
      artifactDirectory = await directory();
    await put(fixture.workspace, "dist/payload/README.md", "changed");
    await expect(
      retainSourceReleaseEvidence({ ...fixture, artifactDirectory }),
    ).rejects.toThrow(/inventory/);
    expect(existsSync(resolve(artifactDirectory, "source-release"))).toBe(
      false,
    );
  });
  it("rejects a consumer record promoted into a complete qualification claim", async () => {
    const fixture = await outputFixture(),
      path = "dist/consumer.json",
      consumer = JSON.parse(
        await readFile(resolve(fixture.workspace, path), "utf8"),
      );
    consumer.completeBuildQualification = true;
    await put(fixture.workspace, path, json(consumer));
    await fixture.refresh();
    await expect(inspectSourceReleaseOutputs(fixture)).rejects.toThrow();
  });
});
