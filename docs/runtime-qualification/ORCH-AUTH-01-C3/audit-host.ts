import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  auditDockerHostLifecycle,
  dockerHostSha256,
  DOCKER_HOST_LIMITS,
} from "../../../tools/qualification-docker-host.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [hostArg, guestArg, ociAuditArg, outputArg] = process.argv.slice(2);
assert(
  hostArg && guestArg && ociAuditArg && outputArg && process.argv.length === 6,
  "Usage: audit-host.ts <retained-host-root> <inspected-guest-extraction> <independent-oci-audit> <fresh-output>",
);
assert.equal(process.version, "v24.18.0");
const hostRoot = resolve(hostArg),
  guestRoot = resolve(guestArg),
  output = resolve(outputArg);
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-c3-host-audit",
  "retained-disposable-host",
);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
try {
  const hostInventory = await inventoryContainerArtifacts(hostRoot, {
    maximumFiles: 512,
    maximumBytes: 128 * 1024 * 1024,
  });
  const guestInventory = await inventoryContainerArtifacts(guestRoot, {
    maximumFiles: 4096,
    maximumBytes: 128 * 1024 * 1024,
  });
  const expected = await json(resolve(hostRoot, "expected.json"));
  const report = await json(resolve(hostRoot, "host.json"));
  assert.deepEqual(
    await json(resolve(hostRoot, "host-before.json")),
    report.hostBefore,
  );
  const capturedResources = await json(
    resolve(hostRoot, "resource-observation.json"),
  );
  for (const field of ["pid", "status", "resources", "cgroupPath"])
    assert.deepEqual(capturedResources[field], report.hostBefore[field]);
  const live = await json(resolve(hostRoot, "host-live.json"));
  assert(live.length > 1 && live.length <= 121);
  for (const [index, item] of live.entries()) {
    assert(item.atMs > 0 && (index === 0 || item.atMs > live[index - 1].atMs));
    assert(
      Number(item.resources["memory.current"]) <=
        DOCKER_HOST_LIMITS.memoryBytes,
    );
    assert(
      Number(item.resources["pids.current"]) <= DOCKER_HOST_LIMITS.processes,
    );
    assert(
      item.overlayBytes > 0 &&
        item.overlayBytes <= DOCKER_HOST_LIMITS.fileBytes,
    );
    assert.match(item.resources["memory.events"], /^oom_kill 0$/m);
  }
  const guestUnit = await readFile(
    resolve(guestRoot, "guest/guest-job-unit.stdout"),
    "utf8",
  );
  for (const pattern of [
    /^RuntimeMaxUSec=28min 20s$/m,
    /^MainPID=[1-9][0-9]*$/m,
    /^ControlGroup=\/system.slice\/orch-guest-job.service$/m,
    /^KillMode=control-group$/m,
    /^ActiveState=active$/m,
    /^InvocationID=[a-f0-9]{32}$/m,
  ])
    assert.match(guestUnit, pattern);
  const sourceRoot = resolve(import.meta.dirname, "../../..");
  const sourceBlob = (commit: string, path: string) =>
    execFileSync("git", ["-C", sourceRoot, "show", `${commit}:${path}`], {
      windowsHide: true,
    });
  const commissioning = JSON.parse(
    sourceBlob(
      expected.binding.sourceCommit,
      "tools/milestone-orchestrator/config/source-commissioning-input.json",
    ).toString(),
  );
  assert.equal(
    commissioning.commissioning.id,
    "milestone-loop-template-source.v1",
  );
  assert.equal(
    commissioning.commissioning.baseCommit,
    "0f4ab3e5ef39bda07d6e77356ad53fca9136cdd5",
  );
  execFileSync(
    "git",
    [
      "-C",
      sourceRoot,
      "merge-base",
      "--is-ancestor",
      commissioning.commissioning.baseCommit,
      expected.binding.sourceCommit,
    ],
    { windowsHide: true },
  );
  const authorityFiles = [
    "PROJECT_GOAL.md",
    "evals/ACCEPTANCE.md",
    "evals/acceptance-manifest.json",
    "evals/HIDDEN_VALIDATION_PROTOCOL.md",
    "evals/immutable-contract-lock.json",
  ];
  const authorityHashes = Object.fromEntries(
    authorityFiles.map((path) => {
      const bytes = sourceBlob(expected.binding.sourceCommit, path);
      assert(
        bytes.equals(sourceBlob(commissioning.commissioning.baseCommit, path)),
      );
      return [path, dockerHostSha256(bytes)];
    }),
  );
  assert.equal(
    authorityHashes["evals/immutable-contract-lock.json"],
    commissioning.sources.immutableContractLockSha256,
  );
  const ledgerBytes = sourceBlob(
    expected.binding.sourceCommit,
    ".agent/completed/verification-manifest-amendments.json",
  );
  const ledger = JSON.parse(ledgerBytes.toString());
  assert.equal(
    ledger.anchor.commit,
    "345591818b220964618dc4e80cce3c0e0213783c",
  );
  const authorityGeneration = {
    commissioningId: commissioning.commissioning.id,
    baseCommit: commissioning.commissioning.baseCommit,
    authorityHashes,
    scheduleAnchor: ledger.anchor.commit,
    amendmentLedgerSha256: dockerHostSha256(ledgerBytes),
    amendmentEntries: ledger.entries.length,
  };
  const launch = await json(resolve(hostRoot, "launch.json"));
  const processObservation = await json(
    resolve(hostRoot, "resource-observation.json"),
  );
  assert.equal(processObservation.pid, report.hostBefore.pid);
  assert.deepEqual(processObservation.resources, report.hostBefore.resources);
  assert.equal(processObservation.status, report.hostBefore.status);
  assert.equal(
    processObservation.processes[String(report.hostBefore.pid)],
    launch.qemuArgv.join(" ") + " ",
  );
  assert.equal(launch.qemuArgv[0], expected.launchers[0].path);
  assert(
    launch.qemuArgv.includes(
      "main-loop,id=orch-main,thread-pool-min=0,thread-pool-max=16",
    ),
  );
  const result = auditDockerHostLifecycle({
    expected,
    report,
    mount: await json(resolve(hostRoot, "mount-observation.json")),
    events: await json(resolve(hostRoot, "events.json")),
    qmp: await json(resolve(hostRoot, "qmp.json")),
    hostProgram: await readFile(resolve(hostRoot, "executed-host.py")),
    archive: await readFile(resolve(hostRoot, "guest-evidence.tar.gz")),
  });
  const input = await readFile(resolve(guestRoot, "guest/input-manifest.json"));
  assert.equal(dockerHostSha256(input), expected.binding.inputManifestSha256);
  const manifest = JSON.parse(input.toString("utf8"));
  assert.deepEqual(manifest.source, {
    commit: expected.binding.sourceCommit,
    tree: expected.binding.sourceTree,
  });
  assert.equal(
    manifest.files.filter((file: any) => file.path === "guest-job.py").length,
    1,
  );
  assert.equal(
    manifest.files.find((file: any) => file.path === "guest-job.py").sha256,
    expected.guestProgramSha256,
  );
  assert.deepEqual(
    await json(resolve(guestRoot, "guest/binding.json")),
    expected.binding,
  );
  assert.deepEqual(
    await json(resolve(guestRoot, "guest/host-ready.json")),
    report.guestReady,
  );
  const dispatch = await json(resolve(guestRoot, "guest/dispatch.json"));
  assert.deepEqual(dispatch.binding, expected.binding);
  assert.equal(dispatch.controllerWorkflowsDispatched, false);
  assert.equal(dispatch.producerCount, 1);
  assert.deepEqual(dispatch.cases, [
    "normal",
    "boundary",
    "artifact-link",
    "artifact-quota",
    "output-flood",
    "hang",
  ]);
  for (const [command, argv] of [
    [
      "oci-matrix",
      ["/opt/bin/pnpm", "test:oci-container", "--output", "artifacts/oci"],
    ],
    ["post-containers", ["/usr/bin/docker", "ps", "--all", "--quiet"]],
    ["post-volumes", ["/usr/bin/docker", "volume", "ls", "--quiet"]],
  ] as const) {
    const child = await json(resolve(guestRoot, `guest/${command}.json`));
    assert.deepEqual(child.argv, argv);
    assert.equal(child.exitCode, 0);
    assert.equal(child.timedOut, false);
    if (command === "oci-matrix") assert.equal(child.uid, 1000);
  }
  const receipt = await validateCommandReceiptDirectory({
    directory: resolve(ociAuditArg),
    expectedStageId: "orch-auth-c3-oci-audit",
    expectedCommandId: "ORCH-AUTH-01-C3-retained-oci",
    requiredKinds: ["orch-auth-c3-oci-audit"],
  });
  const oci = await json(resolve(ociAuditArg, "runtime-audit.json"));
  assert.equal(oci.status, "PASS");
  assert.equal(oci.source.head, expected.binding.sourceCommit);
  assert.equal(oci.source.candidateTree, expected.binding.sourceTree);
  assert.equal(oci.source.mode, "committed-head");
  assert.equal(
    oci.matrix.sha256,
    dockerHostSha256(
      await readFile(resolve(guestRoot, "artifacts/oci/result.json")),
    ),
  );
  const checks = [
    {
      id: "HOST-BOUNDARIES",
      summary:
        "Trusted captured process, cgroup, namespace and QMP observations enforce the finite declared disposable Linux host policy before guest execution.",
    },
    {
      id: "JOB-PROVENANCE",
      summary:
        "Exact source, active legacy epoch, approved revision digest, pinned program and inputs, fresh nonce, boot and dispatch observations agree.",
    },
    {
      id: "ACTUAL-OCI-PROVIDER",
      summary:
        "A separate command owns the independently validated six-case OCI audit and unchanged normal child receipt/build/test evidence.",
    },
    {
      id: "OWNED-CLEANUP",
      summary:
        "Captured provider cleanup, QEMU termination, full unit cgroup removal, task directory removal and unchanged outside inputs agree.",
    },
  ];
  await writeFile(
    resolve(output, "host-audit.json"),
    JSON.stringify(
      {
        ...result,
        schemaVersion: "orch-auth-c3-host-audit.v1",
        binding: expected.binding,
        authorityGeneration,
        guestKernel: report.guestReady.kernel,
        hostInventory,
        guestInventory,
        ociReceipt: {
          sha256: receipt.receiptSha256,
          bytes: receipt.receiptBytes,
        },
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(context, checks, [
    { path: "host-audit.json", kind: "orch-auth-c3-host-audit" },
  ]);
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["orch-auth-c3-host-audit"],
  });
  process.stdout.write(
    JSON.stringify({ ...result, receipt: resolve(output, "result.json") }) +
      "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
