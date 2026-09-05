import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  commandIdentity,
  evidenceContext,
  writeJson,
  writeReceipt,
} from "../../../tools/evidence.mjs";
import { loadConfig } from "../../../tools/milestone-orchestrator/src/config.js";
import { containerImageInputHash } from "../../../tools/milestone-orchestrator/src/container-image.js";
import { OCI_RESOURCE_LIMITS_V1 } from "../../../tools/milestone-orchestrator/src/container-executor.js";
import { createCandidateExecutionProvider } from "../../../tools/milestone-orchestrator/src/execution-provider.js";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import {
  inspectPlanningProducer,
  PLANNING_QUALIFICATION_CASES,
  PLANNING_QUALIFICATION_STAGE,
  PLANNING_PRODUCER_COMMAND,
  PLANNING_CONSUMER_COMMAND,
  PLANNING_FIXTURE_PATH,
} from "../../../tools/milestone-orchestrator/src/planning-qualification.js";
import {
  publishQualificationInput,
  type QualificationBinding,
} from "../../../tools/milestone-orchestrator/src/qualification-input.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const root = resolve(import.meta.dirname, "../../..");
const output = resolve(root, process.argv[2] ?? "artifacts/ob1");
assert(output.startsWith(`${resolve(root, "artifacts")}/`));
const imageId = process.argv[3];
assert(imageId && /^sha256:[a-f0-9]{64}$/.test(imageId));
assert.equal(process.platform, "linux");
assert.equal(process.version, "v24.18.0");
assert.notEqual(process.getuid?.(), 0);
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(
  output,
  "outer-audit",
);
const context = await evidenceContext(
  "orch-auth-01-b",
  "planning-runtime-audit",
);
const startedAt = new Date().toISOString();
const control = (executable: string, args: readonly string[]) =>
  execFileSync(executable, [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
const sha256 = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const managed = () => ({
  containers: control("docker", [
    "ps",
    "--all",
    "--quiet",
    "--filter",
    "label=io.milestone-loop.managed=true",
  ])
    .split("\n")
    .filter(Boolean),
  volumes: control("docker", [
    "volume",
    "ls",
    "--quiet",
    "--filter",
    "label=io.milestone-loop.managed=true",
  ])
    .split("\n")
    .filter(Boolean),
});
const identity = await commandIdentity(root);
assert.equal(identity.pnpmVersion, "11.15.1");
assert.equal(identity.gitStatus, "");
assert.match(identity.gitCommit ?? "", /^[0-9a-f]{40}$/);
assert.match(identity.gitTree ?? "", /^[0-9a-f]{40}$/);
assert.equal(
  control("git", [
    "for-each-ref",
    "--format=%(refname)",
    "refs/milestone-loop/",
  ]),
  "",
);
const source = { commit: identity.gitCommit!, tree: identity.gitTree! };
const authoritySha256 =
  "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108";
const approved = JSON.parse(
  await readFile(
    resolve(root, "evals/authority-revisions/ORCH-AUTH-01/approval.json"),
    "utf8",
  ),
);
assert.equal(approved.approvedContentDigest, authoritySha256);
const imageInputHash = await containerImageInputHash({
  contextDirectory: resolve(root, "tools/milestone-orchestrator/container"),
  dockerfilePath: resolve(
    root,
    "tools/milestone-orchestrator/container/Dockerfile",
  ),
  baseImage:
    "node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059",
  nodeVersion: "24.18.0",
  pnpmVersion: "11.15.1",
});
const image = JSON.parse(control("docker", ["image", "inspect", imageId]));
assert.equal(
  image[0].Config.Labels["io.milestone-loop.image-input-sha256"],
  imageInputHash,
);
await writeJson(
  resolve(context.artifactDirectory, "image-inspection.json"),
  image,
);
const config = await loadConfig(root);
const provider = createCandidateExecutionProvider({
  ...config,
  candidateExecution: {
    mode: "trusted-container",
    trustedContainer: {
      ...config.candidateExecution.trustedContainer,
      imageDigest: imageId,
    },
  },
});
assert.equal(provider.capability?.available, true);
assert.equal(provider.identity.runtime.name, "docker");
const before = managed();
assert.deepEqual(before, { containers: [], volumes: [] });
const selected = {
  purpose: "candidate-support" as const,
  coordinatorId: `coordinator-${randomUUID()}`,
  runId: `run-${randomUUID()}`,
  nonce: randomBytes(32).toString("hex"),
  source,
  authoritySha256,
  fixtureSha256: sha256(await readFile(resolve(root, PLANNING_FIXTURE_PATH))),
  coverage: PLANNING_QUALIFICATION_CASES,
  platform: "linux" as const,
  provider: provider.identity,
};
await writeJson(resolve(context.artifactDirectory, "dispatch.json"), {
  selected,
  before,
  identity,
  imageInputHash,
  imageReused: true,
  imageBuilds: 0,
  commandCount: 2,
  commands: [PLANNING_PRODUCER_COMMAND, PLANNING_CONSUMER_COMMAND],
  justification:
    "Planning needs no Docker control plane; one contained producer executes both public planning cases, then one contained consumer inspects their authenticated read-only artifacts.",
  generalDockerControllerHostQualified: false,
  nativeWindowsQualified: false,
  completion: { eligible: false },
});

async function execute(
  id: string,
  args: readonly string[],
  input?: Awaited<ReturnType<typeof publishQualificationInput>>,
) {
  const commandRoot = resolve(output, id);
  const artifacts = resolve(commandRoot, "command");
  const command = {
    id,
    executable: "node" as const,
    args: ["tools/qualification-planning.mjs", ...args],
    parser: "exit-code" as const,
  };
  const result = await provider.execute(command, {
    workingDirectory: root,
    artifactDirectory: commandRoot,
    timeoutMs: 180_000,
    trustedControllerCommand: true,
    ...(input ? { qualificationInput: input } : {}),
    extraEnvironment: {
      LOOP_VERIFY_STAGE_ID: PLANNING_QUALIFICATION_STAGE,
      LOOP_VERIFY_COMMAND_ID: id,
      LOOP_VERIFY_COMMAND_ARTIFACT_DIR: artifacts,
    },
  });
  await writeJson(resolve(commandRoot, "execution.json"), result);
  assert.equal(result.status, "PASS", `${id}: ${result.message}`);
  assert.equal(result.exitCode, 0);
  assert(result.containmentReport);
  const bytes = await readFile(result.containmentReport.path);
  assert.equal(sha256(bytes), result.containmentReport.sha256);
  const report = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(report.candidate, source);
  assert.deepEqual(report.executionProvider, provider.identity);
  assert.equal(report.imageInputHash, imageInputHash);
  assert.equal(report.failure, null);
  assert.equal(report.container.removed, true);
  assert.equal(report.artifactExporter.removed, true);
  assert.equal(report.boundedVolumes.workspace.removed, true);
  assert.equal(report.boundedVolumes.evidence.removed, true);
  assert.deepEqual(
    report.policy.runtimeAttestation.resources,
    OCI_RESOURCE_LIMITS_V1,
  );
  assert.equal(report.policy.runtimeAttestation.networkMode, "none");
  assert.deepEqual(
    report.policy.runtimeAttestation.mountDestinations,
    input
      ? [
          "/evidence",
          "/pnpm-store/v11",
          "/qualification-input",
          "/source",
          "/workspace",
        ]
      : ["/evidence", "/pnpm-store/v11", "/source", "/workspace"],
  );
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
  return { result, report, artifacts };
}

const producer = await execute(PLANNING_PRODUCER_COMMAND, ["produce"]);
const binding: QualificationBinding = {
  ...selected,
  producerId: producer.report.container.id,
};
const input = await publishQualificationInput({
  sourceDirectory: producer.artifacts,
  destinationDirectory: resolve(output, "input"),
  binding,
});
await writeJson(
  resolve(context.artifactDirectory, "coordinator-expectation.json"),
  input,
);
await inspectPlanningProducer(input);
const consumer = await execute(
  PLANNING_CONSUMER_COMMAND,
  [
    "consume",
    Buffer.from(
      JSON.stringify({ envelopeSha256: input.envelopeSha256, binding }),
    ).toString("base64url"),
  ],
  input,
);
assert.notEqual(consumer.report.container.id, producer.report.container.id);
assert.equal(consumer.report.qualificationInput.verifiedBefore, true);
assert.equal(consumer.report.qualificationInput.verifiedAfter, true);
assert.equal(consumer.report.qualificationInput.readOnly, true);
assert.deepEqual(consumer.report.qualificationInput.binding, binding);
assert.equal(
  consumer.report.qualificationInput.envelopeSha256,
  input.envelopeSha256,
);
const consumed = JSON.parse(
  await readFile(resolve(consumer.artifacts, "consumer-report.json"), "utf8"),
);
assert.deepEqual(consumed.binding, binding);
assert.equal(consumed.envelopeSha256, input.envelopeSha256);
assert.equal(consumed.readOnlyWriteError, "EROFS");
assert.deepEqual(consumed.completion, { eligible: false });
await inspectPlanningProducer(input);
const after = managed();
assert.deepEqual(after, before);
assert.equal(control("git", ["status", "--porcelain=v1"]), "");
assert.equal(
  control("git", [
    "for-each-ref",
    "--format=%(refname)",
    "refs/milestone-loop/",
  ]),
  "",
);
await writeJson(resolve(context.artifactDirectory, "runtime-report.json"), {
  schemaVersion: "planning-runtime-audit.v1",
  status: "PASS",
  startedAt,
  finishedAt: new Date().toISOString(),
  binding,
  envelopeSha256: input.envelopeSha256,
  imageInputHash,
  after,
  producerContainerId: producer.report.container.id,
  consumerContainerId: consumer.report.container.id,
  commands: [producer.result, consumer.result].map(
    ({ id, durationMs, status, containmentReport }) => ({
      id,
      durationMs,
      status,
      containmentReport,
    }),
  ),
  sourceActivation: false,
  nativeWindowsQualified: false,
  generalDockerControllerHostQualified: false,
  completion: { eligible: false },
});
// These three producer/consumer roots are finalized. The coordinator's own
// stdout, manifest and receipt are still being written and cannot be included
// in an immutable inventory at this point.
const raw = {
  schemaVersion: "qualification-raw-inventory.v1",
  roots: await Promise.all(
    ["planning-producer", "planning-consumer", "input"].map(async (path) => ({
      path,
      inventory: await inventoryContainerArtifacts(resolve(output, path), {
        maximumFiles: 2_000,
        maximumBytes: 32 * 1024 * 1024,
      }),
    })),
  ),
};
await mkdir(resolve(context.artifactDirectory, "inventory"), {
  recursive: true,
});
await writeJson(resolve(context.artifactDirectory, "inventory/raw.json"), raw);
await writeReceipt(
  context,
  [
    {
      id: "public-planning-handoff",
      summary:
        "Both public planning cases reached their required boundary; a separate contained consumer validated real receipts and kernel-enforced read-only input; outer pins, artifacts and cleanup passed.",
    },
  ],
  [
    { path: "runtime-report.json", kind: "planning-runtime-report" },
    { path: "dispatch.json", kind: "qualification-dispatch" },
    {
      path: "coordinator-expectation.json",
      kind: "qualification-coordinator-expectation",
    },
    { path: "image-inspection.json", kind: "qualification-image-inspection" },
    { path: "inventory/raw.json", kind: "qualification-raw-inventory" },
  ],
);
await validateCommandReceiptDirectory({
  directory: context.artifactDirectory,
  expectedStageId: context.stageId,
  expectedCommandId: context.commandId,
  requiredKinds: ["planning-runtime-report"],
});
process.stdout.write(
  `${JSON.stringify({ status: "PASS", output, source, envelopeSha256: input.envelopeSha256, commands: 2, completionEligible: false })}\n`,
);
