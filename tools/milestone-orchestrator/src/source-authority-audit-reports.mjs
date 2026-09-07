import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertTestRunSummary } from "./test-run-summary.ts";
import { canonicalJson } from "./package-graph.ts";
import { CONTRACT_INTEGRITY_CHECK_IDS } from "./contract-integrity.ts";
import { inspectReleaseArchive } from "../../source-release-archive.mjs";

// All inputs to this pure inspector must come from the
// enclosing reader's actual committed, hash-validated artifact graph. It never
// returns a permit, approval, state adoption or readiness result.
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const iso = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
function timeRange(value, enclosing = null) {
  assert(
    iso(value.startedAt) && iso(value.finishedAt),
    "Implementation audit timestamp is not canonical.",
  );
  assert(
    Date.parse(value.finishedAt) >= Date.parse(value.startedAt),
    "Implementation audit time order is reversed.",
  );
  if (enclosing) {
    assert(Date.parse(value.startedAt) >= Date.parse(enclosing.startedAt));
    assert(Date.parse(value.finishedAt) <= Date.parse(enclosing.finishedAt));
  }
}
function serialTimes(values, enclosing = null) {
  for (const [index, value] of values.entries()) {
    timeRange(value, enclosing);
    if (index)
      assert(
        Date.parse(value.startedAt) >= Date.parse(values[index - 1].finishedAt),
        "Implementation audit commands overlap or are out of order.",
      );
  }
}
function get(files, path) {
  const file = files.get(path);
  assert(file, "Implementation audit is missing raw evidence: " + path);
  return file.contents ?? file;
}
const json = (files, path) => JSON.parse(get(files, path).toString());
export const LEGACY_DEPENDENCY_INSPECTOR_SHA256 =
  "a21f3912dafd13f3d34b23caa26951561266f549ab7db6a397183f503721dd8b";
export function sourceDependencyReportVersion(implementationFiles) {
  return sha(
    get(implementationFiles, "tools/source-release-inspection.mjs"),
  ) === LEGACY_DEPENDENCY_INSPECTOR_SHA256
    ? "source-dependencies-report.v1"
    : "source-dependencies-report.v2";
}
const runtimePath = (value) => {
  assert(typeof value === "string");
  const path = value.replaceAll("\\", "/");
  assert(/^(?:[a-zA-Z]:\/|\/)/.test(path));
  assert(
    !path.endsWith("/") &&
      !path.split("/").some((part) => part === "." || part === ".."),
  );
  return path;
};
/** Check both real dependency-reference boundaries and their raw log bindings. */
export function inspectSourceDependencyCaptures(report, artifacts) {
  assert(
    ["source-dependencies-report.v1", "source-dependencies-report.v2"].includes(
      report.schemaVersion,
    ),
  );
  const modern = report.schemaVersion === "source-dependencies-report.v2";
  const ids = modern
    ? [
        "exact-pnpm",
        "store-path",
        "installed-graph",
        "pristine-install",
        "store-integrity",
        "reference-install",
        "reference-graph",
      ]
    : [
        "exact-pnpm",
        "store-path",
        "store-integrity",
        "installed-graph",
        "reference-install",
        "reference-graph",
      ];
  assert.deepEqual(
    report.captures.map((capture) => capture.id),
    ids,
  );
  const graph = [
    "pnpm",
    "list",
    "--recursive",
    "--depth",
    "Infinity",
    "--json",
  ];
  const normalInstall = [
    "pnpm",
    "install",
    "--frozen-lockfile",
    "--offline",
    "--package-import-method=copy",
    "--store-dir",
    report.store,
  ];
  const argv = {
    "exact-pnpm": ["pnpm", "--version"],
    "store-path": ["pnpm", "store", "path"],
    "installed-graph": graph,
    "pristine-install": [
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--offline",
      "--ignore-scripts",
      "--side-effects-cache=false",
      "--package-import-method=copy",
      "--store-dir",
      report.store,
    ],
    "store-integrity": ["pnpm", "store", "status"],
    "reference-install": normalInstall,
    "reference-graph": graph,
  };
  let roots = null;
  if (modern) {
    assert.deepEqual(Object.keys(report.references).sort(), [
      "actual",
      "built",
      "pristine",
    ]);
    roots = Object.fromEntries(
      Object.entries(report.references).map(([key, value]) => [
        key,
        runtimePath(value),
      ]),
    );
    assert(roots.pristine.endsWith("/pristine"));
    const temporary = roots.pristine.slice(0, -"/pristine".length);
    assert.match(temporary, /\/source-dependency-reference-[^/]+$/);
    assert.equal(roots.built, temporary + "/built");
    assert(
      roots.actual !== temporary &&
        !roots.actual.startsWith(temporary + "/") &&
        !temporary.startsWith(roots.actual + "/"),
    );
  }
  for (const capture of report.captures) {
    assert.equal(capture.exitCode, 0);
    assert.deepEqual(capture.argv, argv[capture.id]);
    for (const stream of ["stdout", "stderr"]) {
      const path = capture.id + "." + stream + ".log";
      assert.equal(capture[stream + "Path"], path);
      if (modern) {
        const recorded = artifacts.get(path);
        const content = recorded
          ? (recorded.contents ?? recorded)
          : Buffer.alloc(0);
        assert.deepEqual(capture[stream], {
          bytes: content.length,
          sha256: sha(content),
        });
      }
    }
    if (modern) {
      const expectedRoot = ["pristine-install", "store-integrity"].includes(
        capture.id,
      )
        ? roots.pristine
        : ["reference-install", "reference-graph"].includes(capture.id)
          ? roots.built
          : roots.actual;
      assert.equal(
        runtimePath(capture.cwd),
        expectedRoot,
        "Dependency command used the wrong reference: " + capture.id,
      );
    } else
      assert(
        artifacts.has(capture.stdoutPath) || artifacts.has(capture.stderrPath),
        "Dependency command has no retained output: " + capture.id,
      );
  }
  return roots;
}
function oneKind(child, kind) {
  const values = [...child.artifacts.values()].filter(
    (file) => file.kind === kind,
  );
  assert.equal(
    values.length,
    1,
    "Implementation audit requires exactly one " + kind,
  );
  return values[0];
}
function supervised(value, logs = null) {
  assert(value, "Implementation audit lacks child supervision.");
  for (const key of ["timedOut", "outputLimitExceeded", "drainTimedOut"])
    assert.equal(
      value[key],
      false,
      "Implementation child did not finish completely: " + key,
    );
  for (const key of [
    "terminationReason",
    "termination",
    "drainCutoff",
    "drainSweep",
  ])
    assert.equal(value[key], null);
  assert.equal(value.streamsClosed, true);
  assert.deepEqual(value.duplicateSettleSignals, []);
  for (const stream of ["stdout", "stderr"]) {
    const capture = value[stream];
    assert.equal(capture.truncated, false);
    assert(count(capture.bytesCaptured) && positive(capture.capBytes));
    assert.equal(capture.totalBytesObserved, capture.bytesCaptured);
    assert(capture.bytesCaptured <= capture.capBytes);
    if (logs) assert.equal(capture.bytesCaptured, logs[stream].length);
  }
}
function passingExecution(execution) {
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.signal, null);
  assert.equal(execution.error, null);
}
function toolIdentity(identity, implementation, runtime) {
  assert.deepEqual(identity, {
    gitCommit: implementation.commit,
    gitTree: implementation.tree,
    gitStatus: "",
    nodeVersion: runtime.nodeVersion,
    pnpmVersion: runtime.pnpmVersion,
  });
}
function inspectedPackageList(contents, packageGraph, implementationFiles) {
  const graph = JSON.parse(contents.toString());
  assert(Array.isArray(graph) && graph.length === packageGraph.packages.length);
  assert.deepEqual(
    graph.map((node) => node.name).sort(),
    packageGraph.packages.map((pkg) => pkg.name).sort(),
  );
  const rootPackage = packageGraph.packages.find((pkg) => pkg.root === ".");
  const root = graph
    .find((node) => node.name === rootPackage.name)
    .path.replaceAll("\\", "/");
  assert(/^(?:[a-zA-Z]:\/|\/)/.test(root));
  const nodes = new Map();
  const workspacePaths = new Set(packageGraph.packages.map((pkg) => pkg.root));
  function normalize(value, key = "") {
    if (Array.isArray(value)) return value.map((child) => normalize(child));
    if (value && typeof value === "object") {
      const normalized = Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((name) => [name, normalize(value[name], name)]),
      );
      if (
        typeof normalized.from === "string" &&
        typeof normalized.path === "string" &&
        !workspacePaths.has(normalized.path)
      ) {
        const previous = nodes.get(normalized.path);
        assert(!previous || previous.name === normalized.from);
        const version = normalized.version.startsWith("link:")
          ? null
          : normalized.version;
        if (previous?.version && version)
          assert.equal(previous.version, version);
        nodes.set(normalized.path, {
          name: normalized.from,
          version: version ?? previous?.version ?? null,
        });
      }
      return normalized;
    }
    if (typeof value === "string" && key === "path") {
      const path = value.replaceAll("\\", "/");
      assert(
        !path.split("/").includes("..") &&
          (path === root || path.startsWith(root + "/")),
        "Retained package graph escapes its observed root.",
      );
      return path === root ? "." : path.slice(root.length + 1);
    }
    return value;
  }
  const normalized = normalize(graph);
  for (const node of normalized) {
    const pkg = packageGraph.packages.find((pkg) => pkg.name === node.name);
    const manifest = json(implementationFiles, pkg.manifestPath);
    assert.equal(node.path, pkg.root);
    assert.equal(node.version, manifest.version);
    assert.equal(node.private, manifest.private === true);
    for (const kind of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      assert.deepEqual(
        Object.keys(node[kind] ?? {}).sort(),
        Object.keys(manifest[kind] ?? {}).sort(),
      );
      for (const [name, child] of Object.entries(node[kind] ?? {}))
        assert.equal(child.from, name);
    }
  }
  return { normalized, nodes, root };
}
function rawVitest(bytes, expectedFiles = null) {
  const report = JSON.parse(bytes.toString());
  assert.equal(report.success, true);
  assert(positive(report.numTotalTests) && positive(report.numTotalTestSuites));
  assert.equal(report.numPassedTests, report.numTotalTests);
  assert.equal(report.numPassedTestSuites, report.numTotalTestSuites);
  for (const key of [
    "numFailedTests",
    "numFailedTestSuites",
    "numPendingTests",
    "numPendingTestSuites",
    "numTodoTests",
  ])
    assert.equal(
      report[key],
      0,
      "Implementation audit refuses incomplete unit evidence: " + key,
    );
  assert(!report.unhandledErrors || report.unhandledErrors.length === 0);
  assert(Array.isArray(report.testResults) && report.testResults.length > 0);
  const files = [],
    identities = [];
  for (const file of report.testResults) {
    assert.equal(file.status, "passed");
    assert(typeof file.name === "string" && file.name);
    const name = file.name.replaceAll("\\", "/");
    if (expectedFiles) {
      const matches = expectedFiles.filter(
        (path) => name === path || name.endsWith("/" + path),
      );
      assert.equal(
        matches.length,
        1,
        "Raw unit report contains an unexpected file: " + name,
      );
      files.push(matches[0]);
    } else files.push(name);
    assert(
      Array.isArray(file.assertionResults) && file.assertionResults.length > 0,
    );
    for (const test of file.assertionResults) {
      assert.equal(test.status, "passed");
      assert(typeof test.fullName === "string" && test.fullName);
      assert.deepEqual(test.failureMessages, []);
      identities.push(name + "\0" + test.fullName);
    }
  }
  assert.equal(new Set(files).size, files.length);
  assert.equal(identities.length, report.numTotalTests);
  if (expectedFiles)
    assert.deepEqual(
      files.sort(),
      [...expectedFiles].sort(),
      "Root unit audit omitted a classified test file.",
    );
  return { fileCount: files.length, testCount: identities.length };
}

/** Validate the actual outer execution separately from its child receipt. */
export function inspectSourceAuditExecution({
  command,
  expected,
  implementation,
  artifacts,
}) {
  const prefix = "commands/" + expected.id + "/";
  const execution = json(artifacts, prefix + "audit-child-execution.json");
  assert.deepEqual(
    Object.keys(execution).sort(),
    [
      "schemaVersion",
      "implementation",
      "argv",
      "timeoutMs",
      "startedAt",
      "finishedAt",
      "exitCode",
      "signal",
      "error",
      "supervision",
    ].sort(),
  );
  assert.equal(execution.schemaVersion, "source-authority-audit-execution.v1");
  assert.deepEqual(execution.implementation, implementation);
  assert.deepEqual(execution.argv, expected.argv);
  assert.equal(execution.timeoutMs, 90 * 60 * 1000);
  assert.equal(execution.startedAt, command.startedAt);
  assert.equal(execution.finishedAt, command.finishedAt);
  timeRange(execution);
  passingExecution(execution);
  const logs = Object.fromEntries(
    ["stdout", "stderr"].map((stream) => [
      stream,
      artifacts.get(prefix + "audit-child-" + stream + ".log")?.contents ??
        Buffer.alloc(0),
    ]),
  );
  supervised(execution.supervision, logs);
  return execution;
}

/** Child report meanings remain separate: root unit PASS does not establish
 * unit-domain, source qualification, adopter qualification or readiness. */
export async function inspectSourceAuditReports(input) {
  const {
    expected,
    child,
    implementation,
    runtime,
    implementationFiles,
    readNestedReceipt,
    execution,
  } = input;
  const report = JSON.parse(
    oneKind(child, expected.requiredKinds[0]).contents.toString(),
  );
  if (["typecheck", "lint", "format"].includes(expected.id)) {
    assert.equal(report.schemaVersion, "1.0.0");
    assert.equal(report.status, "PASS");
    assert.equal(report.mode, expected.id);
    toolIdentity(report.identity, implementation, runtime);
    assert.equal(report.commands.length, 1);
    const executed = report.commands[0];
    if (expected.id === "typecheck") {
      assert.equal(executed.status, "PASS");
      assert.equal(
        executed.execution,
        "single-process-typescript-incremental-compiler-api",
      );
      assert.equal(
        executed.compilerVersion,
        json(implementationFiles, "package.json").devDependencies.typescript,
      );
      assert.equal(executed.configCount, executed.configs.length);
      assert(
        positive(executed.configCount) &&
          positive(executed.cachedSourceFileCount),
      );
      assert.deepEqual(
        executed.configs.map((config) => config.path),
        ["tsconfig.tools.json"],
      );
      for (const config of executed.configs)
        assert(
          positive(config.rootFileCount) &&
            config.sourceFileCount >= config.rootFileCount,
        );
    } else {
      assert.equal(executed.exitCode, 0);
      assert.equal(executed.signal, null);
      assert(
        typeof executed.command === "string" &&
          executed.command.includes(
            expected.id === "lint"
              ? " exec eslint "
              : " exec prettier --check ",
          ),
      );
      supervised(executed.supervision, {
        stdout: Buffer.from(executed.stdout),
        stderr: Buffer.from(executed.stderr),
      });
    }
  } else if (["architecture", "dependencies"].includes(expected.id)) {
    assert.equal(
      report.schemaVersion,
      expected.id === "dependencies"
        ? sourceDependencyReportVersion(implementationFiles)
        : "source-architecture-report.v1",
    );
    assert.equal(report.status, "PASS");
    assert.equal(report.claimScope, "source-supporting-check");
    assert.equal(report.completionEligible, false);
    const { sha256: graphSha256, ...unsignedGraph } = report.packageGraph;
    assert.equal(unsignedGraph.schemaVersion, "1.0.0");
    assert.equal(graphSha256, sha(Buffer.from(canonicalJson(unsignedGraph))));
    const policyFiles = json(
      implementationFiles,
      "tools/source-release-policy.json",
    ).payloadFiles;
    assert.deepEqual(
      report.packageGraph.packages.map((pkg) => pkg.manifestPath).sort(),
      policyFiles
        .filter(
          (path) =>
            path === "package.json" ||
            /^tools\/[^/]+\/package\.json$/.test(path),
        )
        .sort(),
    );
    assert(report.packageGraph.packages.length > 0);
    for (const pkg of report.packageGraph.packages) {
      const contents = get(implementationFiles, pkg.manifestPath);
      assert.equal(pkg.manifestBytes, contents.length);
      assert.equal(pkg.manifestSha256, sha(contents));
      assert.equal(pkg.name, JSON.parse(contents.toString()).name);
      const manifest = JSON.parse(contents.toString());
      assert.equal(
        pkg.root,
        pkg.manifestPath === "package.json"
          ? "."
          : pkg.manifestPath.slice(0, -"/package.json".length),
      );
      assert.equal(pkg.private, manifest.private === true);
      assert.deepEqual(pkg.exports, manifest.exports ?? null);
      const names = new Set(
        report.packageGraph.packages.map((pkg) => pkg.name),
      );
      const edges = [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]
        .flatMap((dependencyType) =>
          Object.entries(manifest[dependencyType] ?? {})
            .filter(([name]) => names.has(name))
            .map(([name, specifier]) => ({ name, dependencyType, specifier })),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.dependencyType.localeCompare(b.dependencyType),
        );
      assert.deepEqual(pkg.workspaceDependencies, edges);
    }
    assert.deepEqual(
      report.packageGraph.edges,
      report.packageGraph.packages
        .flatMap((pkg) =>
          pkg.workspaceDependencies.map((edge) => ({
            from: pkg.name,
            to: edge.name,
            ...edge,
          })),
        )
        .sort(
          (a, b) =>
            a.from.localeCompare(b.from) ||
            a.to.localeCompare(b.to) ||
            a.dependencyType.localeCompare(b.dependencyType),
        ),
    );
    const workspace = report.packageGraph.workspaceManifest;
    assert.equal(workspace.path, "pnpm-workspace.yaml");
    assert.equal(
      workspace.bytes,
      get(implementationFiles, workspace.path).length,
    );
    assert.equal(
      workspace.sha256,
      sha(get(implementationFiles, workspace.path)),
    );
    if (expected.id === "architecture") {
      const policy = json(
        implementationFiles,
        "tools/source-release-policy.json",
      );
      assert.equal(
        report.policySha256,
        sha(get(implementationFiles, "tools/source-release-policy.json")),
      );
      assert.equal(
        report.fileCount,
        new Set([...policy.payloadFiles, ...policy.sourceCheckFiles]).size,
      );
      assert.deepEqual(report.entryPoints, policy.entryPoints);
      assert(Array.isArray(report.edges) && report.edges.length > 0);
    } else {
      assert.equal(report.nodeVersion, runtime.nodeVersion);
      assert.equal(report.pnpmVersion, runtime.pnpmVersion);
      assert.equal(
        report.lockSha256,
        sha(get(implementationFiles, "pnpm-lock.yaml")),
      );
      assert.deepEqual(report.independentReference, {
        isolated: true,
        frozen: true,
        offline: true,
        importMethod: "copy",
      });
      assert.equal(typeof report.store, "string");
      assert(report.store);
      assert(report.packages.some((pkg) => pkg.present));
      for (const pkg of report.packages.filter((pkg) => pkg.present))
        assert(
          positive(pkg.fileCount) &&
            positive(pkg.totalBytes) &&
            digest(pkg.inventorySha256),
        );
      const references = inspectSourceDependencyCaptures(
        report,
        child.artifacts,
      );
      assert.equal(
        get(child.artifacts, "exact-pnpm.stdout.log").toString().trim(),
        runtime.pnpmVersion,
      );
      assert.equal(
        get(child.artifacts, "store-path.stdout.log").toString().trim(),
        report.store,
      );
      const actual = inspectedPackageList(
        get(child.artifacts, "installed-graph.stdout.log"),
        report.packageGraph,
        implementationFiles,
      );
      const reference = inspectedPackageList(
        get(child.artifacts, "reference-graph.stdout.log"),
        report.packageGraph,
        implementationFiles,
      );
      if (references) {
        assert.equal(actual.root, references.actual);
        assert.equal(reference.root, references.built);
      }
      assert.deepEqual(
        actual.normalized,
        reference.normalized,
        "Retained dependency graphs disagree.",
      );
      assert.deepEqual(
        report.packages.map((pkg) => pkg.path).sort(),
        [...actual.nodes.keys()].sort(),
      );
      for (const pkg of report.packages) {
        const observed = actual.nodes.get(pkg.path);
        assert.equal(pkg.name, observed.name);
        if (observed.version !== null)
          assert.equal(pkg.version, observed.version);
      }
    }
  } else if (expected.id === "unit") {
    const catalog = json(
      implementationFiles,
      "tools/milestone-orchestrator/config/test-ownership.json",
    );
    const files = catalog.owners
      .filter((owner) => owner.id !== "trusted-container-fixture")
      .flatMap((owner) => owner.files);
    const raw = oneKind(child, "vitest-report");
    const counts = rawVitest(raw.contents, files);
    const summary = assertTestRunSummary(
      JSON.parse(oneKind(child, "test-run-summary").contents.toString()),
    );
    assert.deepEqual(summary.candidate, {
      gitCommit: implementation.commit,
      gitTree: implementation.tree,
      workingTreeDirty: false,
    });
    assert.equal(summary.run.stageId, expected.stageId);
    assert.equal(summary.run.commandId, expected.commandId);
    assert.equal(summary.run.role, "legacy");
    assert.equal(summary.run.owner, null);
    assert.equal(summary.platform.nodeVersion, runtime.nodeVersion);
    assert.equal(summary.platform.pnpmVersion, runtime.pnpmVersion);
    assert.equal(summary.platform.os, runtime.platform);
    assert.equal(summary.platform.arch, runtime.architecture);
    assert.equal(summary.reports.length, 1);
    assert.equal(summary.reports[0].path, raw.path);
    assert.equal(summary.reports[0].bytes, raw.contents.length);
    assert.equal(summary.reports[0].sha256, sha(raw.contents));
    assert.equal(summary.reports[0].fileCount, counts.fileCount);
    assert.equal(summary.reports[0].testCount, counts.testCount);
    assert.deepEqual(summary.testCounts, {
      files: counts.fileCount,
      tests: counts.testCount,
      passed: counts.testCount,
      failed: 0,
      skipped: 0,
    });
    assert.equal(summary.reports[0].passed, counts.testCount);
    assert.equal(summary.reports[0].failed, 0);
    assert.equal(summary.reports[0].skipped, 0);
    timeRange(summary.timestamps, execution);
  } else if (expected.id === "invariants") {
    const registryPath =
      "tools/milestone-orchestrator/config/invariant-suite.json";
    const registry = json(implementationFiles, registryPath);
    assert.equal(report.schemaVersion, "1.1.0");
    assert.equal(report.status, "PASS");
    assert.equal(report.completionEligible, false);
    assert.equal(
      report.completionIneligibilityReason,
      "incremental-invariant-suite",
    );
    assert.equal(report.serial, true);
    assert.deepEqual(report.registry, {
      id: registry.id,
      path: registryPath,
      bytes: get(implementationFiles, registryPath).length,
      sha256: sha(get(implementationFiles, registryPath)),
    });
    assert.deepEqual(
      report.commands.map((command) => command.id),
      registry.entries.map((entry) => entry.id),
    );
    assert.equal(report.commands.length, 5);
    timeRange(report, execution);
    serialTimes(report.commands, report);
    for (const [index, command] of report.commands.entries()) {
      const entry = registry.entries[index];
      assert.deepEqual(command.argv, entry.argv);
      assert.equal(command.status, "PASS");
      assert.equal(command.exitCode, 0);
      assert.equal(command.signal, null);
      assert.equal(command.receiptAbsenceReason, null);
      const receipt = await readNestedReceipt("entries/" + entry.id + "/", {
        stageId: "invariant-suite",
        commandId: entry.id,
        requiredKinds: entry.expectedArtifactKinds,
      });
      assert.equal(command.receipt.receiptSha256, receipt.sha256);
      assert.equal(command.receipt.receiptBytes, receipt.bytes.length);
      assert.equal(command.receipt.artifactCount, receipt.artifacts.size);
      assert.equal(
        command.receipt.artifactBytes,
        [...receipt.artifacts.values()].reduce(
          (total, artifact) => total + artifact.contents.length,
          0,
        ),
      );
      assert.deepEqual(
        command.receipt.kinds,
        [
          ...new Set(
            [...receipt.artifacts.values()].map((artifact) => artifact.kind),
          ),
        ].sort(),
      );
      assert.equal(command.receipt.artifacts.length, receipt.artifacts.size);
      for (const artifact of receipt.artifacts.values()) {
        const matches = command.receipt.artifacts.filter((record) =>
          record.path
            .replaceAll("\\", "/")
            .endsWith("/entries/" + entry.id + "/" + artifact.path),
        );
        assert.equal(matches.length, 1);
        assert.equal(matches[0].kind, artifact.kind);
        assert.equal(matches[0].bytes, artifact.contents.length);
        assert.equal(matches[0].sha256, sha(artifact.contents));
      }
      const raw = oneKind(receipt, entry.expectedArtifactKinds[0]);
      if (entry.expectedArtifactKinds[0] === "invariant-vitest-report")
        rawVitest(
          raw.contents,
          entry.argv.filter((arg) => arg.endsWith(".test.ts")),
        );
      else {
        const result = JSON.parse(raw.contents.toString());
        assert.equal(result.status, "PASS");
        if (entry.id === "protected-integrity") {
          assert.equal(result.schemaVersion, "contract-integrity-report.v1");
          assert.equal(result.checkIdentityValid, true);
          assert.deepEqual(result.counts, {
            total: 13,
            pass: 13,
            fail: 0,
            notReady: 0,
          });
          assert.equal(result.checks.length, 13);
          assert.deepEqual(result.expectedCheckIds, [
            ...CONTRACT_INTEGRITY_CHECK_IDS,
          ]);
          assert.deepEqual(
            result.checks.map((check) => check.id),
            [...CONTRACT_INTEGRITY_CHECK_IDS],
          );
          assert.equal(result.completionEligible, false);
          assert(result.checks.every((check) => check.status === "PASS"));
        } else if (entry.id === "test-ownership") {
          const catalogPath =
            "tools/milestone-orchestrator/config/test-ownership.json";
          const catalogBytes = get(implementationFiles, catalogPath);
          const catalog = JSON.parse(catalogBytes.toString());
          assert.equal(result.schemaVersion, "1.0.0");
          assert.deepEqual(result.diagnostics, []);
          assert.deepEqual(result.catalogue, {
            id: catalog.id,
            path: catalogPath,
            bytes: catalogBytes.length,
            sha256: sha(catalogBytes),
          });
          assert.deepEqual(
            result.owners.map(({ id, files }) => ({ id, files })),
            catalog.owners,
          );
          for (const owner of result.owners)
            assert.equal(owner.count, owner.files.length);
          assert.equal(
            result.discovery.uniqueFileCount,
            catalog.owners.reduce(
              (total, owner) => total + owner.files.length,
              0,
            ),
          );
          const rootSources = result.discovery.sources.filter(
            (source) => source.configPath === "vitest.config.ts",
          );
          assert.equal(rootSources.length, 1);
          assert.equal(rootSources[0].repeatCount, 2);
          assert.deepEqual(rootSources[0].filters, []);
          assert.deepEqual(
            [...rootSources[0].files].sort(),
            catalog.owners
              .filter((owner) => owner.id !== "trusted-container-fixture")
              .flatMap((owner) => owner.files)
              .sort(),
          );
        }
      }
    }
  } else if (expected.id === "build") {
    assert.equal(report.schemaVersion, "1.0.0");
    assert.equal(report.status, "PASS");
    assert.equal(report.mode, "build");
    assert.deepEqual(report.source, {
      commit: implementation.commit,
      tree: implementation.tree,
    });
    assert.deepEqual(report.runtime, {
      nodeVersion: runtime.nodeVersion,
      pnpmVersion: runtime.pnpmVersion,
    });
    assert.deepEqual(report.productionBuild, {
      script: "build:production",
      outputRoots: ["dist"],
    });
    for (const command of report.commands) passingExecution(command);
    assert.deepEqual(report.commands, [
      report.dependencyStore.command,
      report.preparation,
      report.command,
    ]);
    serialTimes(report.commands, execution);
    assert.deepEqual(report.dependencyStore.command.argv, [
      "pnpm",
      "store",
      "path",
    ]);
    assert.equal(
      report.dependencyStore.command.stdout.trim(),
      report.dependencyStore.path,
    );
    assert.deepEqual(report.preparation.argv, [
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--offline",
      "--package-import-method=copy",
      "--store-dir",
      report.dependencyStore.path,
    ]);
    assert.deepEqual(report.command.argv, ["pnpm", "run", "build:production"]);
    const manifest = JSON.parse(
      oneKind(child, "source-release-manifest").contents.toString(),
    );
    const archive = oneKind(child, "source-release-archive").contents;
    const consumer = JSON.parse(
      oneKind(child, "source-release-consumer").contents.toString(),
    );
    assert.equal(manifest.schemaVersion, "source-release-manifest.v1");
    assert.equal(manifest.claimScope, "source-release-payload");
    assert.equal(manifest.completionEligible, false);
    assert.equal(manifest.cadence, "candidate-single-build");
    assert.deepEqual(manifest.source, report.source);
    assert.deepEqual(manifest.limits, {
      maximumPayloadFiles: 400,
      maximumPayloadBytes: 20_000_000,
      maximumArchiveBytes: 20_000_000,
    });
    assert.deepEqual(manifest.archive, {
      path: "release.tar.gz",
      bytes: archive.length,
      sha256: sha(archive),
    });
    const payload = inspectReleaseArchive(
      archive,
      manifest.payload.files,
      manifest.limits,
    );
    assert.equal(manifest.payload.fileCount, payload.length);
    assert.equal(
      manifest.payload.totalBytes,
      payload.reduce((total, file) => total + file.contents.length, 0),
    );
    assert.deepEqual(
      JSON.parse(
        payload
          .find((file) => file.path === "SOURCE.json")
          ?.contents.toString() ?? "null",
      ),
      {
        schemaVersion: "source-release-provenance.v1",
        source: report.source,
        claimScope: "distribution-provenance",
        grantsAdopterAuthority: false,
      },
    );
    const policy = json(
      implementationFiles,
      "tools/source-release-policy.json",
    );
    assert.deepEqual(
      payload.map((file) => file.path).sort(),
      [...policy.payloadFiles, "SOURCE.json"].sort(),
    );
    for (const file of payload) {
      if (file.path === "SOURCE.json") continue;
      if (file.path === "AGENTS.md")
        assert(
          file.contents.equals(
            get(
              implementationFiles,
              "tools/milestone-orchestrator/template/bootstrap-adopter/AGENTS.md",
            ),
          ),
        );
      else if (file.path === "package.json") {
        const sourcePackage = json(implementationFiles, "package.json");
        assert.deepEqual(JSON.parse(file.contents.toString()), {
          name: sourcePackage.name,
          version: sourcePackage.version,
          private: true,
          type: "module",
          description: "Milestone orchestrator runtime and adopter generator",
          engines: sourcePackage.engines,
          packageManager: sourcePackage.packageManager,
          scripts: Object.fromEntries(
            policy.publishedScripts.map((name) => [
              name,
              sourcePackage.scripts[name],
            ]),
          ),
          devDependencies: sourcePackage.devDependencies,
        });
      } else
        assert(
          file.contents.equals(get(implementationFiles, file.path)),
          "Release payload differs from the audited implementation: " +
            file.path,
        );
    }
    assert.equal(consumer.schemaVersion, "source-release-consumer.v1");
    assert.equal(consumer.status, "PASS");
    assert.equal(consumer.claimScope, "bounded-external-generator-smoke");
    assert.deepEqual(consumer.source, report.source);
    assert.equal(consumer.releaseArchiveSha256, sha(archive));
    assert.equal(consumer.nodeVersion, runtime.nodeVersion);
    assert.equal(consumer.pnpmVersion, runtime.pnpmVersion);
    for (const key of [
      "completionEligible",
      "completeBuildQualification",
      "completeAdopterQualification",
      "originalCheckoutInaccessible",
    ])
      assert.equal(consumer[key], false);
    assert.equal(consumer.generated.defaultProfile, "bootstrap");
    assert.equal(consumer.generated.sourceContractAbsent, true);
    assert.equal(consumer.generated.controllerStateAbsent, true);
    const receipt = await readNestedReceipt("source-release/build-evidence/", {
      stageId: "source-release-build",
      commandId: "build:production",
      requiredKinds: ["source-release-build-report"],
    });
    const produced = JSON.parse(
      oneKind(receipt, "source-release-build-report").contents.toString(),
    );
    assert.equal(produced.schemaVersion, "source-release-build.v1");
    assert.equal(produced.status, "PASS");
    assert.equal(produced.claimScope, "source-supporting-build");
    assert.equal(produced.completionEligible, false);
    assert.deepEqual(produced.source, report.source);
    assert.deepEqual(produced.archive, manifest.archive);
    assert.deepEqual(produced.payload, manifest.payload);
    assert.deepEqual(produced.consumer, consumer);
    assert.deepEqual(
      consumer.captures.map((capture) => capture.id),
      ["store-path", "consumer-install", "consumer-generate"],
    );
    for (const capture of consumer.captures) {
      assert.equal(capture.exitCode, 0);
      assert.equal(capture.stdoutPath, capture.id + ".stdout.log");
      assert.equal(capture.stderrPath, capture.id + ".stderr.log");
      assert(
        receipt.artifacts.has(capture.stdoutPath) ||
          receipt.artifacts.has(capture.stderrPath),
      );
    }
    assert.deepEqual(consumer.captures[0].argv, ["pnpm", "store", "path"]);
    assert.deepEqual(consumer.captures[1].argv.slice(0, 6), [
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--offline",
      "--package-import-method=copy",
      "--store-dir",
    ]);
    assert.equal(
      consumer.captures[1].argv[6],
      get(receipt.artifacts, "store-path.stdout.log").toString().trim(),
    );
    assert.deepEqual(consumer.captures[2].argv.slice(0, 7), [
      "pnpm",
      "exec",
      "tsx",
      "tools/milestone-orchestrator/src/adopter-package-cli.ts",
      "--definition",
      "fixtures/fresh-adopter/definition.json",
      "--output",
    ]);
    const generated = json(receipt.artifacts, "consumer-generate.stdout.log");
    assert.equal(
      generated.schemaVersion,
      "milestone-loop-adopter-package-result.v1",
    );
    assert.equal(generated.status, "PASS");
    assert.equal(generated.git.clean, true);
    assert.equal(generated.git.commitCount, 2);
    assert.equal(
      generated.git.commissioningInputCommit,
      consumer.generated.commit,
    );
    assert.equal(generated.git.tree, consumer.generated.tree);
    assert.equal(consumer.generated.commitCount, 2);
    assert.equal(generated.project.packageName, consumer.generated.packageName);
    assert.equal(generated.project.profile, "bootstrap");
    assert.equal(generated.generated.activeManifestPresent, false);
    assert.equal(generated.generated.readinessMarkerPresent, false);
    const outputFiles = new Map(
      payload.map((file) => ["dist/payload/" + file.path, file.contents]),
    );
    for (const artifact of child.artifacts.values()) {
      if (artifact.path.startsWith("source-release/"))
        outputFiles.set(
          "dist/" + artifact.path.slice("source-release/".length),
          artifact.contents,
        );
    }
    for (const capture of consumer.captures)
      for (const stream of ["stdout", "stderr"]) {
        const path = "dist/build-evidence/" + capture[stream + "Path"];
        if (!outputFiles.has(path)) outputFiles.set(path, Buffer.alloc(0));
      }
    assert.equal(report.outputs.fileCount, outputFiles.size);
    assert.equal(
      report.outputs.totalBytes,
      [...outputFiles.values()].reduce(
        (total, contents) => total + contents.length,
        0,
      ),
    );
    assert.deepEqual(
      report.outputs.files.map((file) => file.path).sort(),
      [...outputFiles.keys()].sort(),
    );
    for (const file of report.outputs.files) {
      const contents = outputFiles.get(file.path);
      assert.equal(file.bytes, contents.length);
      assert.equal(file.sha256, sha(contents));
    }
  } else throw new Error("Unknown fixed implementation audit command.");
  return report;
}
