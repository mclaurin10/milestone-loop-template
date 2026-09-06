import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  evidenceContext,
  commandIdentity,
  writeJson,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  APPROVED_AUTHORITY_DIGEST,
  auditHostDiscovery,
} from "../../../tools/qualification-host-discovery.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

assert.equal(
  process.argv.length,
  4,
  "Expected <extracted-archive-root> <fresh-output>.",
);
const extracted = resolve(process.argv[2]!);
assert(
  !existsSync(resolve(process.argv[3]!)),
  "Closeout output must be fresh.",
);
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(process.argv[3]!);
const context = await evidenceContext(
  "orch-auth-01-c",
  "host-discovery-closeout",
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const json = async (path: string) =>
    JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  const sha256 = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const raw = resolve(extracted, "raw");
  const manifest = await json(
    resolve(import.meta.dirname, "evidence/manifest.json"),
  );
  assert.equal(manifest.schemaVersion, "orch-auth-01-c-evidence.v1");
  assert.equal(manifest.completionEligible, false);
  assert.equal(manifest.archive.file, "supporting-evidence.tar.gz");
  const archive = await readFile(
    resolve(import.meta.dirname, "evidence", manifest.archive.file),
  );
  assert.equal(archive.length, manifest.archive.bytes);
  assert.equal(sha256(archive), manifest.archive.sha256);
  const inventoryBytes = await readFile(
    resolve(extracted, "raw-inventory.json"),
  );
  assert.equal(sha256(inventoryBytes), manifest.inventorySha256);
  const inventory = await inventoryContainerArtifacts(raw, {
    maximumFiles: 5_000,
    maximumBytes: 64 * 1024 * 1024,
  });
  assert.deepEqual(inventory, JSON.parse(inventoryBytes.toString("utf8")));
  assert.equal(inventory.fileCount, manifest.rawFiles);

  const baseline = "13b013d3b5b20e056561d12221e83b741b65fe8f";
  const source = await json(resolve(raw, "setup/source.json"));
  assert.equal(source.head, baseline);
  assert.equal(source.sourceMode, "frozen-index");
  assert.equal(
    source.candidateTree,
    "822426b10089f90ae6fcbe397a322914ec97b757",
  );
  const sourcePaths = [
    "tools/qualification-host-discovery.mjs",
    "tools/qualification-host-discovery.test.mjs",
    "tools/milestone-orchestrator/config/test-ownership.json",
    "docs/runtime-qualification/ORCH-AUTH-01-C/run-discovery.ts",
    "docs/runtime-qualification/ORCH-AUTH-01-C/run-focused.ts",
  ];
  assert.deepEqual(source.executablePaths, sourcePaths);
  assert.deepEqual(
    source.files.map((file: { path: string }) => file.path),
    sourcePaths,
  );
  const git = (root: string, args: string[], index?: string) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env: index ? { ...process.env, GIT_INDEX_FILE: index } : process.env,
    }).trim();
  // Reconstruct the actual frozen index in a separate bare database. Neither
  // source refs nor controller state are initialized or adopted.
  const temporary = await mkdtemp(
    resolve(context.artifactDirectory, "source-inspection-"),
  );
  const database = resolve(temporary, "repository.git");
  const index = resolve(temporary, "reconstruction.index");
  git(context.repositoryRoot, [
    "clone",
    "--quiet",
    "--bare",
    "--no-local",
    "--no-hardlinks",
    "--",
    context.repositoryRoot,
    database,
  ]);
  git(database, ["read-tree", baseline], index);
  git(
    database,
    [
      "apply",
      "--cached",
      "--whitespace=error",
      resolve(raw, "setup/source.patch"),
    ],
    index,
  );
  assert.equal(git(database, ["write-tree"], index), source.candidateTree);
  for (const file of source.files) {
    assert.equal(
      git(database, ["rev-parse", `${source.candidateTree}:${file.path}`]),
      file.gitBlob,
    );
    assert.equal(
      sha256(await readFile(resolve(context.repositoryRoot, file.path))),
      file.sha256,
    );
    assert.equal(
      git(context.repositoryRoot, ["rev-parse", `:${file.path}`]),
      file.gitBlob,
    );
  }
  const changed = git(context.repositoryRoot, [
    "diff",
    "--name-only",
    baseline,
    "--",
  ])
    .split("\n")
    .filter(Boolean);
  for (const path of changed)
    assert(
      sourcePaths.includes(path) ||
        [
          ".agent/current-exec-plan.md",
          "docs/autonomy-log.md",
          "docs/decision-log.md",
        ].includes(path) ||
        path.startsWith("docs/runtime-qualification/ORCH-AUTH-01-C/"),
      `Out-of-scope source/authority change: ${path}`,
    );
  const preserved = [
    "PROJECT_GOAL.md",
    "AGENTS.md",
    "CONTRACT.md",
    "evals",
    "docs/proposals",
    "docs/runtime-qualification/ORCH-AUTH-01-A",
    "docs/runtime-qualification/ORCH-AUTH-01-B",
    ".github",
    "scripts",
    "package.json",
    "pnpm-lock.yaml",
    ".agent/verification-manifest.json",
    ".agent/readiness-profile-activated.json",
    "tools/milestone-orchestrator/config/default.json",
  ];
  git(context.repositoryRoot, [
    "diff",
    "--exit-code",
    baseline,
    "--",
    ...preserved,
  ]);
  git(database, [
    "diff",
    "--exit-code",
    baseline,
    source.candidateTree,
    "--",
    ...preserved,
  ]);
  const approval = await json(
    resolve(
      context.repositoryRoot,
      "evals/authority-revisions/ORCH-AUTH-01/approval.json",
    ),
  );
  assert.equal(approval.status, "APPROVED");
  assert.equal(approval.approvedContentDigest, APPROVED_AUTHORITY_DIGEST);
  assert.equal(approval.activationStatus, "NOT_APPLIED");
  assert.equal(
    git(context.repositoryRoot, [
      "for-each-ref",
      "--format=%(refname)",
      "refs/milestone-loop/",
    ]),
    "",
  );
  const roadmap = "Implementation-ready improvement plan 8-5-26.txt";
  assert.equal(git(context.repositoryRoot, ["ls-files", "--", roadmap]), "");
  if (existsSync(resolve(context.repositoryRoot, roadmap)))
    assert.equal(
      sha256(await readFile(resolve(context.repositoryRoot, roadmap))),
      "53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1",
    );

  const receipts = [
    ["entry-closeout", "orch-auth-01-b", "planning-closeout"],
    ["focused-final", "orch-auth-01-c", "host-discovery-focused"],
    [
      "owner-final",
      "wp6-shadow-partition",
      "test:partition:repository-tooling",
    ],
    ["checks/typecheck", "typecheck", "typecheck"],
    ["checks/lint", "format-lint", "lint"],
    ["checks/format-check", "format-lint", "format:check"],
    ["checks/test-invariants", "invariant-suite", "test:invariants"],
    ...[
      "protected-integrity",
      "test-ownership",
      "orchestrator-schema-integrity",
      "orchestrator-policy-integrity",
      "fail-closed-evidence",
    ].map((id) => [
      `checks/test-invariants/entries/${id}`,
      "invariant-suite",
      id,
    ]),
    ...[
      ["windows", "native-windows"],
      ["wsl", "wsl-ubuntu"],
      ["remote", "ssh-codex-lab"],
    ].map(([name, route]) => [
      `discovery-final-${name}`,
      "orch-auth-01-c",
      `host-discovery-${route}`,
    ]),
  ];
  for (const [path, stageId, commandId] of receipts)
    await validateCommandReceiptDirectory({
      directory: resolve(raw, path!),
      expectedStageId: stageId!,
      expectedCommandId: commandId!,
    });
  const tests = await json(
    resolve(raw, "owner-final/repository-tooling-vitest-report-01.json"),
  );
  assert.equal(tests.numTotalTests, 56);
  assert.equal(tests.numPassedTests, 56);
  assert.equal(tests.numFailedTests, 0);
  assert.equal(tests.numPendingTests, 0);
  assert.equal(tests.numTodoTests, 0);
  assert.deepEqual(
    tests.testResults
      .map(
        (file: { assertionResults: unknown[] }) => file.assertionResults.length,
      )
      .sort((a: number, b: number) => a - b),
    [16, 40],
  );
  const owner = await json(
    resolve(raw, "owner-final/test-partition-report.json"),
  );
  assert.equal(owner.candidate.gitTree, source.candidateTree);
  assert.equal(owner.candidate.gitCommit, baseline);
  const focused = await json(resolve(raw, "focused-final/vitest-report.json"));
  assert.equal(focused.numTotalTests, 40);
  assert.equal(focused.numPassedTests, 40);
  assert.equal(focused.numPendingTests, 0);

  const routes = [];
  for (const [name, route, platform, kernel] of [
    ["windows", "native-windows", "win32", "10.0.26200"],
    ["wsl", "wsl-ubuntu", "linux", "6.6.87.2-microsoft-standard-WSL2"],
    ["remote", "ssh-codex-lab", "linux", "6.8.0-101-generic"],
  ]) {
    const root = resolve(raw, `discovery-final-${name}`);
    const expected = await json(resolve(root, "expectations.json"));
    const dispatch = await json(resolve(root, "dispatch.json"));
    assert.deepEqual(dispatch.binding, expected.binding);
    assert.equal(dispatch.source.candidateTree, source.candidateTree);
    assert.equal(expected.binding.sourceCommit, baseline);
    assert.equal(expected.binding.sourceTree, source.candidateTree);
    assert.equal(expected.binding.scannerSha256, source.files[0].sha256);
    assert.equal(expected.binding.route, route);
    assert.equal(expected.platform, platform);
    assert.equal(expected.kernelRelease, kernel);
    const report = auditHostDiscovery(
      await readFile(resolve(root, "host-report.json")),
      expected,
    );
    const execution = await json(resolve(root, "execution.json"));
    assert.equal(execution.exitCode, 0);
    assert.equal(execution.spawnError, null);
    assert.equal(execution.supervision.timedOut, false);
    assert.equal(execution.supervision.outputLimitExceeded, false);
    assert.equal((await readFile(resolve(root, "stderr.log"))).length, 0);
    const docker = report.launchers.find(
      (item: { name: string }) => item.name === "docker",
    );
    assert.equal(docker.kind, name === "wsl" ? "regular-file" : "missing");
    if (name === "remote") {
      const lxc = report.launchers.find(
        (item: { name: string }) => item.name === "lxc",
      );
      assert.equal(lxc.sample.format, "shebang-script");
      assert.match(
        Buffer.from(lxc.sample.base64, "base64").toString("utf8"),
        /lxd-installer\.socket/,
      );
    }
    routes.push({
      route,
      controller: report.controller,
      qualification: report.qualification.status,
      durationMs: execution.durationMs,
      runId: expected.binding.runId,
      nonce: expected.binding.nonce,
    });
  }
  assert.equal(new Set(routes.map((item) => item.runId)).size, 3);
  assert.equal(new Set(routes.map((item) => item.nonce)).size, 3);
  const build = await json(resolve(raw, "checks/build/manifest.json"));
  assert.equal(build.status, "NOT_READY");
  assert(!existsSync(resolve(raw, "checks/build/result.json")));
  const failed = await json(
    resolve(raw, "checks/test-partition-repository-tooling/manifest.json"),
  );
  assert.equal(failed.status, "ERROR");
  assert.equal(failed.candidate.gitTree, null);
  assert(
    !existsSync(
      resolve(raw, "checks/test-partition-repository-tooling/result.json"),
    ),
  );
  const entry = await json(resolve(raw, "entry-closeout/closeout-report.json"));
  assert.equal(entry.status, "PASS");
  assert.equal(entry.tests, 94);
  assert.equal(entry.completeMatrixCases, 6);
  assert.equal(entry.completion.eligible, false);
  const incident = await json(resolve(raw, "inspection/incident.json"));
  assert.equal(incident.configurationChanged, true);
  assert.equal(incident.controllerOrInstanceRequested, false);
  assert.equal(incident.rollbackPerformed, false);
  const aftermath = await readFile(
    resolve(raw, "inspection/remote-aftermath.log"),
    "utf8",
  );
  assert.match(aftermath, /Install "lxd" snap/);
  assert.match(aftermath, /5\.21\.7-1018661\s+40585/);
  assert.match(aftermath, /\nactive\r?\n/);
  const tamperRoot = resolve(import.meta.dirname, "evidence/tamper");
  const tamper = await json(resolve(tamperRoot, "outcome.json"));
  const refusal = await json(resolve(tamperRoot, "manifest.json"));
  const tamperConsole = await readFile(resolve(tamperRoot, "console.log"));
  const originalReport = await readFile(
    resolve(raw, "discovery-final-remote/host-report.json"),
  );
  assert.equal(tamper.exitCode, 1);
  assert.equal(tamper.passReceiptExists, false);
  assert.equal(tamper.originalSha256, sha256(originalReport));
  assert.equal(
    tamper.tamperedSha256,
    sha256(Buffer.concat([originalReport, Buffer.from(" ")])),
  );
  assert.equal(tamper.consoleSha256, sha256(tamperConsole));
  assert.equal(refusal.status, "ERROR");
  assert.equal(refusal.receipt, null);
  assert(!existsSync(resolve(tamperRoot, "result.json")));
  assert.match(
    refusal.failureClassification.message,
    /discovery-final-remote\/host-report\.json/,
  );
  assert.match(tamperConsole.toString("utf8"), /AssertionError/);
  const report = {
    schemaVersion: "orch-auth-01-c-closeout.v1",
    status: "PASS",
    sourceMode: source.sourceMode,
    testedHead: baseline,
    testedTree: source.candidateTree,
    evidenceFiles: inventory.fileCount,
    supportingReceipts: receipts.length,
    focusedTests: 40,
    repositoryToolingTests: 56,
    actualTamperRejected: true,
    routes,
    rootBuild: "NOT_READY",
    generalDockerControllerHostQualified: false,
    nativeWindowsQualified: false,
    authorityActivation: false,
    humanAcceptance: false,
    remoteDiscoveryIncident: {
      host: "codex.lab",
      configurationChanged: true,
      lxdInstalled: true,
      rollbackPerformed: false,
    },
    completion: { eligible: false },
  };
  await writeJson(
    resolve(context.artifactDirectory, "closeout-report.json"),
    report,
  );
  await writeReceipt(
    context,
    [
      {
        id: "bounded-host-discovery-closeout",
        summary:
          "Reconstructed the tested source, verified archive/raw observations and receipts, preserved source authorities, and retained NOT_READY gates and the remote discovery side effect.",
      },
    ],
    [{ path: "closeout-report.json", kind: "host-discovery-closeout-report" }],
  );
  await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["host-discovery-closeout-report"],
  });
  process.stdout.write(JSON.stringify(report) + "\n");
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
