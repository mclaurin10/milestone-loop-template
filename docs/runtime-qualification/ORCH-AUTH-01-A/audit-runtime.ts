import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { containerImageInputHash } from "../../../tools/milestone-orchestrator/src/container-image.js";
import { OCI_RESOURCE_LIMITS_V1 } from "../../../tools/milestone-orchestrator/src/container-executor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

// Independent inspection of retained local observations. This is not a remote
// coordinator authenticator, source readiness gate, or native Windows proof.
const source = resolve(import.meta.dirname, "../../..");
const [inputArg, matrixPath, expectedHead, expectedTree, outputArg] =
  process.argv.slice(2);
assert(
  inputArg && matrixPath && outputArg && process.argv.length === 7,
  "Usage: audit-runtime.ts <extracted-root> <relative-matrix-path> <source-head> <source-tree> <fresh-output>",
);
assert(
  /^[a-f0-9]{40}$/.test(expectedHead ?? "") &&
    /^[a-f0-9]{40}$/.test(expectedTree ?? ""),
);
assert.equal(process.version, "v24.18.0");
const inputRoot = resolve(inputArg);
const output = resolve(outputArg);
const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) =>
  execFileSync("git", ["-C", source, ...args], { windowsHide: true });
function inside(root: string, path: string) {
  assert(
    path && !isAbsolute(path) && !path.includes("\\") && !path.includes("\0"),
  );
  assert(
    path
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== ".."),
  );
  const target = resolve(root, path);
  assert(
    !relative(root, target).startsWith("..") &&
      !isAbsolute(relative(root, target)),
  );
  return target;
}
const matrixDirectory = inside(inputRoot, matrixPath);
const bundle = dirname(matrixDirectory);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const artifactLimits = {
  maximumFiles: OCI_RESOURCE_LIMITS_V1.maximumArtifactFiles,
  maximumBytes: OCI_RESOURCE_LIMITS_V1.maximumArtifactBytes,
};
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-runtime-audit",
  "ORCH-AUTH-01-A-retained-evidence",
);
const checks: { id: string; summary: string }[] = [];
try {
  const matrixBytes = await readFile(resolve(matrixDirectory, "result.json"));
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  assert.equal(matrix.schemaVersion, "1.1.0");
  assert.equal(matrix.status, "PASS");
  assert.equal(matrix.failure, null);
  assert.equal(matrix.selectedCase, "all");
  assert.equal(matrix.controllerSource.head, expectedHead);
  assert.equal(matrix.controllerSource.candidateTree, expectedTree);
  assert.equal(
    git("rev-parse", `${expectedHead}^{tree}`).toString().trim(),
    matrix.controllerSource.headTree,
  );
  assert.equal(git("cat-file", "-t", expectedTree).toString().trim(), "tree");
  const stagedPaths = git("diff", "--name-only", expectedHead, expectedTree)
    .toString()
    .trim();
  assert.equal(
    matrix.controllerSource.stagedPathCount,
    stagedPaths ? stagedPaths.split(/\r?\n/).length : 0,
  );
  assert.equal(matrix.controllerSource.stagedPathsSha256, sha(stagedPaths));
  assert.equal(
    matrix.controllerSource.mode,
    stagedPaths ? "frozen-index" : "committed-head",
  );
  const fixtureTree = git("rev-parse", `${expectedTree}:fixtures/oci-candidate`)
    .toString()
    .trim();
  const toolchain = await json(resolve(bundle, "setup/toolchain.json"));
  assert.equal(toolchain.status, "PASS");
  assert.deepEqual(toolchain.observed, {
    nodeVersion: "v24.18.0",
    pnpmVersion: "11.15.1",
    platform: "linux",
    architecture: "x64",
  });
  assert.deepEqual(matrix.controller, {
    platform: "linux",
    nodeVersion: "v24.18.0",
    pnpmVersion: "11.15.1",
    runtime: "docker",
    runtimeVersion: "29.1.3",
  });
  assert.equal(
    (await readFile(resolve(bundle, "matrix-exit-code.txt"), "utf8")).trim(),
    "0",
  );
  checks.push({
    id: "SOURCE-RUNTIME",
    summary:
      "Exact source Git objects, fixture tree, clean/frozen source mode, Linux controller, Node/pnpm and real Docker identities agree.",
  });

  assert.equal(
    matrix.image.baseImage,
    "node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059",
  );
  const imageInputHash = await containerImageInputHash({
    contextDirectory: resolve(source, "tools/milestone-orchestrator/container"),
    dockerfilePath: resolve(
      source,
      "tools/milestone-orchestrator/container/Dockerfile",
    ),
    baseImage: matrix.image.baseImage,
    nodeVersion: "24.18.0",
    pnpmVersion: "11.15.1",
  });
  assert.equal(matrix.image.inputHash, imageInputHash);
  const [image] = await json(resolve(bundle, "image-inspect.json"));
  assert.match(image.Id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(image.Id, matrix.image.imageId);
  assert.equal(image.Config.User, "65532:65532");
  for (const [label, value] of Object.entries({
    "image-input-sha256": imageInputHash,
    "node-version": "24.18.0",
    "pnpm-version": "11.15.1",
    "image-contract": "1.0.0",
  }))
    assert.equal(image.Config.Labels[`io.milestone-loop.${label}`], value);
  assert.deepEqual(matrix.resourceLimits, OCI_RESOURCE_LIMITS_V1);
  checks.push({
    id: "IMAGE-POLICY",
    summary:
      "Actual immutable image inspection matches the tracked pinned recipe, exact package versions and unchanged resource limits.",
  });

  const expectedCases = [
    ["normal", "PASS"],
    ["boundary", "PASS"],
    ["artifact-link", "ERROR"],
    ["artifact-quota", "ERROR"],
    ["output-flood", "ERROR"],
    ["hang", "TIMEOUT"],
  ];
  assert.deepEqual(
    matrix.cases.map((item: any) => [item.id, item.status]),
    expectedCases,
  );
  const containments: any[] = [];
  const uniqueContainers = new Set<string>();
  for (const item of matrix.cases) {
    assert.equal(
      item.containmentReport.path,
      `${matrixPath}/cases/${item.id}/logs/${item.id}.containment.json`,
    );
    const bytes = await readFile(
      inside(inputRoot, item.containmentReport.path),
    );
    assert.equal(bytes.length, item.containmentReport.bytes);
    assert.equal(sha(bytes), item.containmentReport.sha256);
    const report = JSON.parse(bytes.toString("utf8"));
    const caseRoot = resolve(matrixDirectory, "cases", item.id);
    assert.equal(report.schemaVersion, "1.0.0");
    assert.deepEqual(report.runtime, {
      name: "docker",
      serverVersion: matrix.controller.runtimeVersion,
    });
    assert.equal(report.imageDigest, image.Id);
    assert.equal(report.imageInputHash, imageInputHash);
    assert.equal(report.capabilityId, matrix.capabilityId);
    assert.equal(report.executionProvider.provider, "trusted-container");
    assert.equal(report.executionProvider.controlPlaneBound, true);
    assert.equal(report.executionProvider.completionEligible, true);
    assert.equal(report.executionProvider.capabilityId, matrix.capabilityId);
    assert.equal(report.candidate.tree, fixtureTree);
    assert.match(report.candidate.commit, /^[a-f0-9]{40}$/);
    assert.equal(report.command.id, item.id);
    const argv =
      item.id === "normal"
        ? ["pnpm", "verify"]
        : ["node", "tools/adversary.mjs", item.id];
    assert.equal(report.command.argvSha256, sha(JSON.stringify(argv)));
    assert.equal(report.container.id, item.containerId);
    assert.equal(report.container.name, item.containerName);
    assert.equal(report.container.reused, false);
    assert.equal(report.container.removed, true);
    assert.equal(report.artifactExporter.reused, false);
    assert.equal(report.artifactExporter.removed, true);
    for (const id of [report.container.id, report.artifactExporter.id]) {
      assert(!uniqueContainers.has(id));
      uniqueContainers.add(id);
    }
    for (const kind of ["workspace", "evidence"]) {
      const volume = report.boundedVolumes[kind];
      assert.equal(volume.removed, true);
      assert.equal(volume.attestation.filesystem, "tmpfs");
      assert.equal(volume.attestation.user, "65532:65532");
      assert.equal(
        volume.attestation.maximumBytes,
        kind === "workspace"
          ? OCI_RESOURCE_LIMITS_V1.workspaceBytes
          : OCI_RESOURCE_LIMITS_V1.evidenceBytes,
      );
      assert.equal(
        volume.attestation.maximumInodes,
        kind === "workspace"
          ? OCI_RESOURCE_LIMITS_V1.workspaceInodes
          : OCI_RESOURCE_LIMITS_V1.evidenceInodes,
      );
    }
    assert.equal(report.policy.hostWritableMounts, 0);
    assert.deepEqual(report.policy.resources, OCI_RESOURCE_LIMITS_V1);
    assert.deepEqual(report.policy.runtimeAttestation, {
      schemaVersion: "1.0.0",
      imageId: image.Id,
      user: "65532:65532",
      networkMode: "none",
      rootFilesystem: "read-only",
      capabilities: "all-dropped",
      noNewPrivileges: true,
      privileged: false,
      ipcMode: "none",
      init: true,
      logDriver: "none",
      mountDestinations: [
        "/evidence",
        "/pnpm-store/v11",
        "/source",
        "/workspace",
      ],
      tmpfsDestinations: ["/tmp"],
      boundedVolumeDestinations: ["/evidence", "/workspace"],
      resources: OCI_RESOURCE_LIMITS_V1,
    });
    for (const operation of [
      "remove",
      "exporter-remove",
      "volume-remove-workspace",
      "volume-remove-evidence",
    ])
      assert(
        report.lifecycle.some(
          (entry: any) =>
            entry.operation === operation &&
            entry.exitCode === 0 &&
            !entry.timedOut &&
            !entry.outputLimitExceeded,
        ),
      );
    const start = report.lifecycle.find(
      (entry: any) => entry.operation === "start",
    );
    assert(start, `${item.id} did not reach the real container start`);
    assert.equal(start.timedOut, item.id === "hang");
    assert.equal(start.outputLimitExceeded, item.id === "output-flood");
    for (const [kind, directory] of [
      ["publishedCommand", "evidence"],
      ["publishedWorkspace", "workspace-artifacts"],
    ]) {
      const inventory = report.artifacts[kind];
      if (inventory && inventory.fileCount > 0)
        assert.deepEqual(
          await inventoryContainerArtifacts(
            resolve(caseRoot, directory),
            artifactLimits,
          ),
          inventory,
        );
    }
    if (item.id === "artifact-link")
      assert.match(report.failure, /symbolic link/);
    else if (item.id === "artifact-quota")
      assert.match(report.failure, /byte limit/);
    else assert.equal(report.failure, null);
    if (item.id === "boundary") {
      const boundary = await json(resolve(caseRoot, "evidence/boundary.json"));
      assert.equal(Object.keys(boundary).length, 16);
      assert(Object.values(boundary).every((value) => value === true));
      assert(
        report.artifacts.containerEvidence.files.some(
          (file: any) => file.path === "outside-declared-root.json",
        ),
      );
      assert(
        !report.artifacts.publishedCommand.files.some(
          (file: any) => file.path === "outside-declared-root.json",
        ),
      );
    }
    if (item.id === "output-flood") {
      const stdout = await readFile(
        resolve(caseRoot, "logs/output-flood.stdout.log"),
      );
      assert(stdout.length <= 32768 + 256);
      assert.match(
        stdout.toString("utf8"),
        /\[output truncated: retained \d+ of \d+ observed bytes\]/,
      );
    }
    if (item.id === "hang")
      assert((await json(resolve(caseRoot, "evidence/child.json"))).pid > 0);
    containments.push({
      id: item.id,
      status: item.status,
      sha256: sha(bytes),
      fixtureCandidate: report.candidate,
      publishedArtifacts: report.artifacts.publishedWorkspace?.fileCount ?? 0,
    });
  }
  checks.push({
    id: "SIX-CASES",
    summary:
      "All existing cases reached their required normal/adversarial boundaries with exact containment hashes, effective policy, retained artifacts and disposal evidence.",
  });

  const normalRoot = resolve(matrixDirectory, "cases/normal");
  const receipt = await validateCommandReceiptDirectory({
    directory: resolve(normalRoot, "evidence"),
    expectedStageId: "oci-runtime-normal",
    expectedCommandId: "normal",
    requiredKinds: ["oci-fixture-aggregate"],
  });
  assert.equal(receipt.artifactCount, 1);
  const aggregate = await json(receipt.artifacts[0].path);
  assert.equal(aggregate.status, "PASS");
  assert.deepEqual(aggregate.runtime, { node: "v24.18.0", pnpm: "11.15.1" });
  assert.deepEqual(aggregate.candidate, containments[0].fixtureCandidate);
  assert.deepEqual(
    aggregate.stages,
    ["build", "typecheck", "vitest"].map((id) => ({ id, status: "PASS" })),
  );
  assert.deepEqual(
    aggregate.artifacts.map((artifact: any) => artifact.path),
    ["artifacts/build-report.json", "artifacts/vitest-report.json"],
  );
  for (const artifact of aggregate.artifacts) {
    const bytes = await readFile(
      inside(
        resolve(normalRoot, "workspace-artifacts"),
        artifact.path.slice("artifacts/".length),
      ),
    );
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(sha(bytes), artifact.sha256);
  }
  assert.deepEqual(
    await json(
      resolve(normalRoot, "workspace-artifacts/oci-fixture-result.json"),
    ),
    aggregate,
  );
  const raw = await json(
    resolve(normalRoot, "workspace-artifacts/vitest-report.json"),
  );
  assert.equal(raw.numTotalTests, 1);
  assert.equal(raw.numPassedTests, 1);
  assert.equal(raw.numFailedTests, 0);
  assert.equal(raw.numPendingTests, 0);
  assert.equal(raw.testResults.length, 1);
  assert.equal(
    raw.testResults[0].assertionResults[0].fullName,
    "real contained Vitest executes candidate TypeScript through the real runner",
  );
  assert.equal(raw.testResults[0].assertionResults[0].status, "passed");
  assert.equal(
    (await json(resolve(normalRoot, "workspace-artifacts/build-report.json")))
      .status,
    "PASS",
  );
  checks.push({
    id: "RAW-CHILD-EVIDENCE",
    summary:
      "The real normal command receipt, aggregate, raw build and Vitest bytes remain inspectable after cleanup and match every declared hash and fixture identity.",
  });
  assert.deepEqual(matrix.managedResources, {
    containers: { before: [], after: [] },
    volumes: { before: [], after: [] },
  });
  for (const name of ["containers-after.txt", "volumes-after.txt"])
    assert.equal((await readFile(resolve(bundle, name), "utf8")).trim(), "");
  checks.push({
    id: "CLEANUP",
    summary:
      "Both matrix-owned disposal checks and separate post-run Docker observations show zero surviving owned containers or volumes.",
  });
  const inventory = await inventoryContainerArtifacts(bundle, artifactLimits);
  const report = {
    schemaVersion: "orch-auth-01-a-runtime-audit.v1",
    status: "PASS",
    claim:
      "local WSL Linux OCI runtime qualification with inspectable fixture evidence",
    observedAt: new Date().toISOString(),
    completionEligible: false,
    sourceReadiness: false,
    nativeWindowsQualified: false,
    activationPerformed: false,
    source: matrix.controllerSource,
    controller: matrix.controller,
    image: matrix.image,
    matrix: {
      path: matrixPath,
      bytes: matrixBytes.length,
      sha256: sha(matrixBytes),
      durationMs: matrix.durationMs,
    },
    checks,
    containments,
    normalReceipt: {
      sha256: receipt.receiptSha256,
      bytes: receipt.receiptBytes,
      artifacts: receipt.artifacts,
    },
    inventory,
  };
  await writeFile(
    resolve(output, "runtime-audit.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeReceipt(context, checks, [
    { path: "runtime-audit.json", kind: "orch-auth-runtime-audit" },
  ]);
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["orch-auth-runtime-audit"],
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      cases: 6,
      rawTests: raw.numTotalTests,
      files: inventory.fileCount,
      durationMs: matrix.durationMs,
      source: matrix.controllerSource,
      receipt: relative(source, resolve(output, "result.json")),
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
