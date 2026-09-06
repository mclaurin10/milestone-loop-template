import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";
import ts from "typescript";
import { buildPackageGraph } from "./milestone-orchestrator/src/package-graph.ts";
import { assertCommandPassed, runPnpm } from "./evidence.mjs";
import {
  pathOrder,
  releaseHash,
  releasePath,
  releaseRegularFile,
} from "./source-release-archive.mjs";

export async function readReleasePolicy(root) {
  const policy = JSON.parse(
    await releaseRegularFile(root, "tools/source-release-policy.json"),
  );
  assert.equal(policy.schemaVersion, "source-release-policy.v1");
  for (const key of [
    "payloadFiles",
    "entryPoints",
    "sdkImporters",
    "processImporters",
    "generatedTests",
    "publishedScripts",
    "sourceCheckFiles",
  ]) {
    assert(
      Array.isArray(policy[key]) &&
        new Set(policy[key]).size === policy[key].length,
      `Release policy ${key} must be explicit and unique.`,
    );
    if (key !== "publishedScripts") policy[key].forEach(releasePath);
  }
  assert.equal(policy.maximumPayloadFiles, 400);
  assert.equal(policy.maximumPayloadBytes, 20_000_000);
  assert.equal(policy.maximumArchiveBytes, 20_000_000);
  assert(
    policy.entryPoints.every((path) => policy.payloadFiles.includes(path)),
  );
  for (const path of policy.payloadFiles)
    if (/\.(?:test\.[cm]?[jt]s|case\.ts)$/.test(path))
      assert(
        policy.generatedTests.includes(path),
        `Unrequired test in release: ${path}`,
      );
  assert(
    policy.generatedTests.every((path) => policy.payloadFiles.includes(path)),
  );
  return policy;
}
export function analyzeReleaseImports(files, policy, declaredPackages) {
  const entries = new Map(files.map((file) => [file.path, file.contents]));
  for (const path of policy.entryPoints)
    assert(entries.has(path), `Missing public release entrypoint: ${path}`);
  const edges = [];
  function moduleEdge(path, specifier, kind) {
    assert(
      typeof specifier === "string" &&
        specifier.length > 0 &&
        !specifier.includes("\\"),
      `Undeclared dynamic/nonportable import in ${path}`,
    );
    if (specifier.startsWith("node:")) {
      if (specifier === "node:child_process")
        assert(
          policy.processImporters.includes(path),
          `Unapproved process boundary import in ${path}`,
        );
      edges.push({ from: path, to: specifier, kind: "node" });
      return;
    }
    assert(
      !isAbsolute(specifier) && !/^[a-z][a-z+.-]*:/i.test(specifier),
      `Absolute/source-external import in ${path}`,
    );
    if (specifier.startsWith(".")) {
      const requested = posix.normalize(
        posix.join(posix.dirname(path), specifier),
      );
      if (
        kind === "asset" &&
        (requested === "." ||
          [...entries.keys()].some((name) => name.startsWith(requested + "/")))
      ) {
        if (requested !== ".") releasePath(requested);
        edges.push({ from: path, to: requested, kind: "directory-asset" });
        return;
      }
      releasePath(requested);
      const choices = [
        requested,
        requested.replace(/\.js$/, ".ts"),
        requested.replace(/\.mjs$/, ".mts"),
        requested.replace(/\.cjs$/, ".cts"),
      ];
      // Scaffold tools are copied over the reusable runtime at generation.
      const scaffold =
        "tools/milestone-orchestrator/template/bootstrap-adopter/scaffold/";
      if (path.startsWith(scaffold) && requested.startsWith(scaffold)) {
        const generatedPath = requested.slice(scaffold.length);
        choices.push(generatedPath, generatedPath.replace(/\.js$/, ".ts"));
      }
      const target = choices.find((name) => entries.has(name));
      assert(target, `Missing release dependency ${path} -> ${specifier}`);
      if (path.startsWith("tools/milestone-orchestrator/src/"))
        assert(
          !/^(fixtures\/|.*\/test\/|.*\.test\.)/.test(target),
          `Controller imports an untrusted fixture/test: ${path}`,
        );
      if (path.includes("/scaffold/app/"))
        assert(
          target.startsWith(
            "tools/milestone-orchestrator/template/bootstrap-adopter/scaffold/app/",
          ),
          "Generated application crosses the controller boundary.",
        );
      edges.push({ from: path, to: target, kind });
      return;
    }
    const name = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    assert(
      declaredPackages.has(name),
      `Undeclared package import ${path} -> ${name}`,
    );
    if (name === "@openai/codex-sdk")
      assert(
        policy.sdkImporters.includes(path),
        `SDK transport boundary violated by ${path}`,
      );
    edges.push({ from: path, to: specifier, kind: "package", package: name });
  }
  for (const [path, contents] of entries) {
    if (!/\.[cm]?[jt]s$/.test(path)) continue;
    const ast = ts.createSourceFile(
      path,
      contents.toString("utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    assert.equal(
      ast.parseDiagnostics.length,
      0,
      `Cannot parse release source ${path}`,
    );
    function visit(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      ) {
        assert(ts.isStringLiteralLike(node.moduleSpecifier));
        moduleEdge(path, node.moduleSpecifier.text, "relative");
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        assert(
          node.arguments.length >= 1 &&
            ts.isStringLiteralLike(node.arguments[0]),
          `Unbounded dynamic import in ${path}`,
        );
        moduleEdge(path, node.arguments[0].text, "dynamic-literal");
      } else if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "URL" &&
        node.arguments?.length === 2 &&
        node.arguments[1].getText(ast) === "import.meta.url"
      ) {
        assert(
          ts.isStringLiteralLike(node.arguments[0]),
          `Dynamic source asset path in ${path}`,
        );
        const asset = node.arguments[0].text;
        moduleEdge(
          path,
          asset.startsWith(".") ||
            isAbsolute(asset) ||
            /^[a-z][a-z+.-]*:/i.test(asset)
            ? asset
            : "./" + asset,
          "asset",
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return edges.sort((a, b) =>
    pathOrder({ path: a.from + "\0" + a.to }, { path: b.from + "\0" + b.to }),
  );
}
export async function inspectSourceArchitecture(root) {
  const policy = await readReleasePolicy(root),
    graph = await buildPackageGraph(root);
  const declared = new Set();
  for (const item of graph.packages) {
    const pkg = JSON.parse(
      await readFile(resolve(root, item.manifestPath), "utf8"),
    );
    declared.add(pkg.name);
    for (const key of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ])
      for (const name of Object.keys(pkg[key] ?? {})) declared.add(name);
  }
  const paths = [
    ...new Set([...policy.payloadFiles, ...policy.sourceCheckFiles]),
  ];
  const files = await Promise.all(
    paths.map(async (path) => ({
      path,
      contents: await releaseRegularFile(root, path),
    })),
  );
  const tracked = execFileSync(
    "git",
    ["-C", root, "ls-files", "-z", "tools/milestone-orchestrator/src"],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  )
    .split("\0")
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
  assert(
    tracked.every((path) => paths.includes(path)),
    "A controller runtime file lacks an explicit release classification.",
  );
  // A shipped import must close over shipped files, not the source-only checker.
  analyzeReleaseImports(
    files.filter((file) => policy.payloadFiles.includes(file.path)),
    policy,
    declared,
  );
  const edges = analyzeReleaseImports(files, policy, declared);
  const rootPackage = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  for (const name of policy.publishedScripts)
    assert(
      typeof rootPackage.scripts[name] === "string" &&
        policy.entryPoints.some((entry) =>
          rootPackage.scripts[name].includes(entry),
        ),
      `Published command has no allowed entrypoint: ${name}`,
    );
  return {
    schemaVersion: "source-architecture-report.v1",
    status: "PASS",
    claimScope: "source-supporting-check",
    completionEligible: false,
    policySha256: releaseHash(
      await readFile(resolve(root, "tools/source-release-policy.json")),
    ),
    packageGraph: graph,
    fileCount: files.length,
    entryPoints: policy.entryPoints,
    edges,
  };
}
async function hashStream(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
export async function installedPackageInventory(
  root,
  { requireCopy = true } = {},
) {
  const canonical = await realpath(root),
    files = [];
  let bytes = 0;
  async function walk(path = "") {
    for (const entry of await readdir(resolve(canonical, path), {
      withFileTypes: true,
    })) {
      if (entry.name === "node_modules") continue;
      const child = path ? path + "/" + entry.name : entry.name,
        absolute = resolve(canonical, child),
        info = await lstat(absolute);
      assert(
        !info.isSymbolicLink() && (await realpath(absolute)) === absolute,
        `Installed dependency has a linked/redirected file: ${child}`,
      );
      if (info.isDirectory()) await walk(child);
      else {
        assert(
          info.isFile() && (!requireCopy || info.nlink === 1),
          `Installed dependency is not an independent ordinary copy: ${child}`,
        );
        files.push({
          path: child,
          bytes: info.size,
          sha256: await hashStream(absolute),
        });
        bytes += info.size;
        assert(
          files.length <= 30_000 && bytes <= 1024 * 1024 * 1024,
          "Installed dependency inventory exceeds its explicit bound.",
        );
      }
    }
  }
  await walk();
  assert(files.length > 0);
  return files.sort(pathOrder);
}
function graphPackages(graph, root, workspacePaths) {
  const packages = new Map();
  function visit(node, parentPath) {
    if (node.path && node.from) {
      const absolute = resolve(node.path),
        within = relative(root, absolute);
      assert(
        !isAbsolute(within) &&
          within !== ".." &&
          !within.startsWith("..\\") &&
          !within.startsWith("../"),
        "Installed graph escapes its root.",
      );
      if (!workspacePaths.has(absolute)) {
        let version = node.version;
        if (typeof version === "string" && version.startsWith("link:")) {
          assert(
            workspacePaths.has(parentPath),
            "An installed package alias must originate at a declared workspace.",
          );
          const target = version.slice(5);
          assert(
            !isAbsolute(target) && resolve(parentPath, target) === absolute,
            "Workspace dependency alias does not resolve to its declared package path.",
          );
          const pkg = JSON.parse(
            readFileSync(resolve(absolute, "package.json"), "utf8"),
          );
          assert.equal(pkg.name, node.from);
          assert(typeof pkg.version === "string");
          version = pkg.version;
        }
        const key = within.replaceAll("\\", "/");
        const previous = packages.get(key);
        if (previous) {
          assert.equal(previous.name, node.from);
          assert.equal(previous.version, version);
        } else
          packages.set(key, {
            name: node.from,
            version,
            path: absolute,
            present: existsSync(absolute),
          });
      }
    }
    for (const kind of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "unsavedDependencies",
    ])
      for (const child of Object.values(node[kind] ?? {}))
        visit(child, resolve(node.path ?? parentPath));
  }
  for (const node of graph) visit(node, root);
  return packages;
}
export async function compareInstalledDependencyGraphs(
  actualGraph,
  actualRoot,
  expectedGraph,
  expectedRoot,
  workspaceRoots,
) {
  const actual = graphPackages(
    actualGraph,
    actualRoot,
    new Set(workspaceRoots.map((path) => resolve(actualRoot, path))),
  );
  const expected = graphPackages(
    expectedGraph,
    expectedRoot,
    new Set(workspaceRoots.map((path) => resolve(expectedRoot, path))),
  );
  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    "Installed dependency graph differs from a fresh frozen install.",
  );
  const packages = [];
  for (const [path, wanted] of expected) {
    const observed = actual.get(path);
    assert.equal(observed.name, wanted.name);
    assert.equal(observed.version, wanted.version);
    assert.equal(
      observed.present,
      wanted.present,
      `Installed dependency presence differs: ${path}`,
    );
    if (!wanted.present) {
      packages.push({
        path,
        name: wanted.name,
        version: wanted.version,
        present: false,
      });
      continue;
    }
    const expectedFiles = await installedPackageInventory(wanted.path),
      actualFiles = await installedPackageInventory(observed.path);
    assert.deepEqual(
      actualFiles,
      expectedFiles,
      `Installed dependency bytes differ from frozen reference: ${path}`,
    );
    packages.push({
      path,
      name: wanted.name,
      version: wanted.version,
      present: true,
      fileCount: actualFiles.length,
      totalBytes: actualFiles.reduce((n, file) => n + file.bytes, 0),
      inventorySha256: releaseHash(Buffer.from(JSON.stringify(actualFiles))),
    });
  }
  return packages.sort(pathOrder);
}
export async function inspectSourceDependencies(root, artifacts) {
  assert.equal(process.version, "v24.18.0");
  const packageGraph = await buildPackageGraph(root),
    manifests = packageGraph.packages.map((pkg) => pkg.manifestPath),
    workspaceRoots = packageGraph.packages.map((pkg) => pkg.root);
  const rootPackage = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  assert.equal(rootPackage.engines.node, "24.18.0");
  assert.equal(rootPackage.packageManager, "pnpm@11.15.1");
  const lock = await readFile(resolve(root, "pnpm-lock.yaml"));
  assert(
    lock.equals(await readFile(resolve(root, "node_modules/.pnpm/lock.yaml"))),
    "Installed lock differs from committed workspace lock.",
  );
  const modules = JSON.parse(
    await readFile(resolve(root, "node_modules/.modules.yaml"), "utf8"),
  );
  assert.equal(modules.packageManager, "pnpm@11.15.1");
  const captures = [];
  async function command(id, args, cwd) {
    const result = await runPnpm(args, { cwd, timeoutMs: 600_000 });
    for (const stream of ["stdout", "stderr"])
      await writeFile(
        resolve(artifacts, `${id}.${stream}.log`),
        result[stream] ?? "",
      );
    captures.push({
      id,
      argv: ["pnpm", ...args],
      exitCode: result.status,
      stdoutPath: `${id}.stdout.log`,
      stderrPath: `${id}.stderr.log`,
    });
    assertCommandPassed(result, id);
    return result.stdout;
  }
  assert.equal(
    (await command("exact-pnpm", ["--version"], root)).trim(),
    "11.15.1",
  );
  const store = (await command("store-path", ["store", "path"], root)).trim();
  assert.equal(resolve(store), resolve(modules.storeDir));
  await command("store-integrity", ["store", "status"], root);
  const actualGraph = JSON.parse(
    await command(
      "installed-graph",
      ["list", "--recursive", "--depth", "Infinity", "--json"],
      root,
    ),
  );
  const temporary = await realpath(
    await mkdtemp(resolve(tmpdir(), "source-dependency-reference-")),
  );
  try {
    for (const path of [
      ...manifests,
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ]) {
      const target = resolve(temporary, path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(resolve(root, path), target);
    }
    await command(
      "reference-install",
      [
        "install",
        "--frozen-lockfile",
        "--offline",
        "--package-import-method=copy",
        "--store-dir",
        store,
      ],
      temporary,
    );
    const expectedGraph = JSON.parse(
      await command(
        "reference-graph",
        ["list", "--recursive", "--depth", "Infinity", "--json"],
        temporary,
      ),
    );
    const packages = await compareInstalledDependencyGraphs(
      actualGraph,
      root,
      expectedGraph,
      temporary,
      workspaceRoots,
    );
    return {
      schemaVersion: "source-dependencies-report.v1",
      status: "PASS",
      claimScope: "source-supporting-check",
      completionEligible: false,
      nodeVersion: process.version,
      pnpmVersion: "11.15.1",
      lockSha256: releaseHash(lock),
      store,
      packageGraph,
      independentReference: {
        isolated: true,
        frozen: true,
        offline: true,
        importMethod: "copy",
      },
      packages,
      captures,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
