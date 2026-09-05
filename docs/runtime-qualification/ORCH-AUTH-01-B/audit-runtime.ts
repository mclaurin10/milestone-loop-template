import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  evidenceContext,
  writeJson,
  writeReceipt,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { OCI_RESOURCE_LIMITS_V1 } from "../../../tools/milestone-orchestrator/src/container-executor.js";
import {
  inspectPlanningProducer,
  PLANNING_QUALIFICATION_CASES,
  PLANNING_QUALIFICATION_STAGE,
  PLANNING_PRODUCER_COMMAND,
  PLANNING_CONSUMER_COMMAND,
} from "../../../tools/milestone-orchestrator/src/planning-qualification.js";
import {
  validateQualificationInput,
  type TrustedQualificationInput,
} from "../../../tools/milestone-orchestrator/src/qualification-input.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));

/** Archive inspection is supporting reproduction, never a fresh producer or
 * native-platform execution claim. Only the physical archive root is rebased. */
export async function auditPlanningRuntime(root: string) {
  const auditRoot = resolve(root, "outer-audit");
  const original = (await json(
    resolve(auditRoot, "coordinator-expectation.json"),
  )) as TrustedQualificationInput;
  const input = { ...original, directory: resolve(root, "input") };
  const dispatch = await json(resolve(auditRoot, "dispatch.json"));
  const report = await json(resolve(auditRoot, "runtime-report.json"));
  assert.deepEqual(report.binding, original.binding);
  const { producerId, ...selection } = report.binding;
  assert.deepEqual(selection, dispatch.selected);
  assert.equal(report.status, "PASS");
  assert.equal(dispatch.commandCount, 2);
  assert.equal(dispatch.imageBuilds, 0);
  assert.deepEqual(report.binding.coverage, PLANNING_QUALIFICATION_CASES);
  assert.equal(
    report.binding.authoritySha256,
    "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108",
  );
  assert.equal(report.binding.platform, "linux");
  assert.equal(report.nativeWindowsQualified, false);
  assert.equal(report.generalDockerControllerHostQualified, false);
  assert.equal(report.sourceActivation, false);
  assert.deepEqual(report.completion, { eligible: false });
  assert.deepEqual(report.after, { containers: [], volumes: [] });
  assert.deepEqual(dispatch.before, report.after);
  assert.equal(report.envelopeSha256, input.envelopeSha256);
  await inspectPlanningProducer(input);
  const envelope = await validateQualificationInput(input);
  const producerArtifacts = await inventoryContainerArtifacts(
    resolve(root, "planning-producer/command"),
    { maximumFiles: 256, maximumBytes: 4 * 1024 * 1024 },
  );
  assert.deepEqual(envelope.artifacts, producerArtifacts);
  const containers: string[] = [];
  for (const id of [PLANNING_PRODUCER_COMMAND, PLANNING_CONSUMER_COMMAND]) {
    const commandRoot = resolve(root, id);
    const execution = await json(resolve(commandRoot, "execution.json"));
    const bytes = await readFile(
      resolve(commandRoot, `${id}.containment.json`),
    );
    const containment = JSON.parse(bytes.toString("utf8"));
    assert.equal(execution.id, id);
    assert.equal(execution.status, "PASS");
    assert.equal(execution.exitCode, 0);
    assert.equal(sha256(bytes), execution.containmentReport.sha256);
    assert.equal(bytes.length, execution.containmentReport.bytes);
    assert.deepEqual(execution.executionProvider, input.binding.provider);
    assert.deepEqual(containment.executionProvider, input.binding.provider);
    assert.deepEqual(containment.candidate, input.binding.source);
    assert.equal(containment.imageDigest, input.binding.provider.imageDigest);
    assert.equal(containment.imageInputHash, dispatch.imageInputHash);
    assert.equal(containment.failure, null);
    assert.equal(containment.container.removed, true);
    assert.equal(containment.artifactExporter.removed, true);
    assert.equal(containment.boundedVolumes.workspace.removed, true);
    assert.equal(containment.boundedVolumes.evidence.removed, true);
    assert.equal(containment.policy.runtimeAttestation.user, "65532:65532");
    assert.equal(containment.policy.runtimeAttestation.networkMode, "none");
    assert.equal(
      containment.policy.runtimeAttestation.rootFilesystem,
      "read-only",
    );
    assert.equal(
      containment.policy.runtimeAttestation.capabilities,
      "all-dropped",
    );
    assert.equal(containment.policy.runtimeAttestation.noNewPrivileges, true);
    assert.equal(containment.policy.runtimeAttestation.privileged, false);
    assert.deepEqual(
      containment.policy.runtimeAttestation.resources,
      OCI_RESOURCE_LIMITS_V1,
    );
    assert.deepEqual(
      containment.policy.runtimeAttestation.mountDestinations,
      id === PLANNING_PRODUCER_COMMAND
        ? ["/evidence", "/pnpm-store/v11", "/source", "/workspace"]
        : [
            "/evidence",
            "/pnpm-store/v11",
            "/qualification-input",
            "/source",
            "/workspace",
          ],
    );
    containers.push(containment.container.id);
    if (id === PLANNING_PRODUCER_COMMAND)
      assert.equal(containment.container.id, producerId);
    else
      assert.deepEqual(containment.qualificationInput, {
        destination: "/qualification-input",
        envelopeSha256: input.envelopeSha256,
        binding: input.binding,
        readOnly: true,
        verifiedBefore: true,
        verifiedAfter: true,
      });
    const artifacts = resolve(commandRoot, "command");
    const actual = await inventoryContainerArtifacts(artifacts, {
      maximumFiles: 256,
      maximumBytes: 4 * 1024 * 1024,
    });
    assert.deepEqual(actual, containment.artifacts.publishedCommand);
    await validateCommandReceiptDirectory({
      directory: artifacts,
      expectedStageId: PLANNING_QUALIFICATION_STAGE,
      expectedCommandId: id,
      requiredKinds: [
        id === PLANNING_PRODUCER_COMMAND
          ? "planning-producer-report"
          : "planning-consumer-report",
      ],
    });
  }
  assert.notEqual(containers[0], containers[1]);
  assert.equal(containers[0], report.producerContainerId);
  assert.equal(containers[1], report.consumerContainerId);
  const consumed = await json(
    resolve(root, "planning-consumer/command/consumer-report.json"),
  );
  assert.deepEqual(consumed.binding, input.binding);
  assert.equal(consumed.envelopeSha256, input.envelopeSha256);
  assert.equal(consumed.readOnlyWriteError, "EROFS");
  assert.deepEqual(consumed.completion, { eligible: false });
  const raw = await json(resolve(auditRoot, "inventory/raw.json"));
  assert.equal(raw.schemaVersion, "qualification-raw-inventory.v1");
  assert.deepEqual(
    raw.roots.map((entry: { path: string }) => entry.path),
    ["planning-producer", "planning-consumer", "input"],
  );
  let fileCount = 0;
  for (const entry of raw.roots) {
    const actual = await inventoryContainerArtifacts(
      resolve(root, entry.path),
      { maximumFiles: 2_000, maximumBytes: 32 * 1024 * 1024 },
    );
    assert.deepEqual(actual, entry.inventory);
    fileCount += actual.fileCount;
  }
  await validateCommandReceiptDirectory({
    directory: auditRoot,
    expectedStageId: "orch-auth-01-b",
    expectedCommandId: "planning-runtime-audit",
    requiredKinds: ["planning-runtime-report", "qualification-raw-inventory"],
  });
  return {
    status: "PASS",
    source: input.binding.source,
    binding: input.binding,
    envelopeSha256: input.envelopeSha256,
    fileCount,
    containers,
    completion: { eligible: false },
  };
}

async function main() {
  const root = resolve(process.argv[2] ?? "");
  assert(process.argv[2]);
  if (process.argv[3])
    process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(process.argv[3]);
  const context = await evidenceContext(
    "orch-auth-01-b",
    "planning-archive-audit",
  );
  const result = await auditPlanningRuntime(root);
  await writeJson(
    resolve(context.artifactDirectory, "audit-report.json"),
    result,
  );
  await writeReceipt(
    context,
    [
      {
        id: "independent-archive-audit",
        summary:
          "Revalidated public planning state/decisions, actual producer and consumer receipts, coordinator pins, artifact inventories, containment and cleanup after archive transfer.",
      },
    ],
    [{ path: "audit-report.json", kind: "planning-archive-audit-report" }],
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
