import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  CommandExecutionSummary,
  OrchestratorConfig,
  VerificationCommand,
} from "./contracts.js";
import {
  ContainerImageBuilder,
  type ContainerImageBuildRequest,
  type ContainerImageInspection,
  type ContainerImageRuntime,
} from "./container-image.js";
import {
  OCI_RESOURCE_LIMITS_V1,
  createContainerCommandExecutor,
  resolveControllerPnpmStorePath,
} from "./container-executor.js";
import { createCandidateExecutionProvider } from "./execution-provider.js";
import { superviseCommand, type SupervisedExit } from "./process-supervisor.js";
import { safeAgentEnvironment } from "./redaction.js";
import { assertOrchestratorConfig } from "./schema.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

const SCHEMA_VERSION = "1.0.0" as const;
const NODE_VERSION = "24.18.0";
const PNPM_VERSION = "11.15.1";
const BASE_IMAGE =
  "node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059";
const MANAGED_LABEL = "io.milestone-loop.managed=true";
const CONTROL_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;
const CASES = [
  "normal",
  "boundary",
  "artifact-link",
  "artifact-quota",
  "output-flood",
  "hang",
] as const;
type CaseId = (typeof CASES)[number];

interface CliOptions {
  readonly outputDirectory: string;
  readonly selectedCase: CaseId | "all";
}

interface CaseRecord {
  readonly id: CaseId;
  readonly status: CommandExecutionSummary["status"];
  readonly durationMs: number;
  readonly containerName: string;
  readonly containerId: string;
  readonly containmentReport: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly assertions: readonly string[];
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  assertion(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} is malformed.`,
  );
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  assertion(
    typeof value === "string" && value.length > 0,
    `${label} is missing.`,
  );
  return value;
}

function parseOptions(repositoryRoot: string): CliOptions {
  let outputDirectory: string | null = null;
  let selectedCase: CaseId | "all" = "all";
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--output") {
      outputDirectory = process.argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument === "--case") {
      const value = process.argv[index + 1];
      assertion(
        value === "all" || CASES.includes(value as CaseId),
        `Unknown OCI matrix case ${value ?? "<missing>"}.`,
      );
      selectedCase = value as CaseId | "all";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  assertion(outputDirectory !== null, "--output is required.");
  const absolute = resolve(repositoryRoot, outputDirectory);
  const repositoryRelative = relative(repositoryRoot, absolute).replaceAll(
    "\\",
    "/",
  );
  assertion(
    repositoryRelative.startsWith("artifacts/") &&
      !isAbsolute(repositoryRelative) &&
      !repositoryRelative.split("/").includes(".."),
    "OCI matrix output must be a repository-relative artifacts/ directory.",
  );
  assertion(
    !existsSync(absolute),
    `OCI matrix output already exists: ${repositoryRelative}.`,
  );
  return { outputDirectory: absolute, selectedCase };
}

async function runControl(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<SupervisedExit> {
  return superviseCommand({
    executable,
    args,
    cwd,
    env: safeAgentEnvironment(),
    timeoutMs,
    killGraceMs: 1_000,
    outputLimitBytes: CONTROL_OUTPUT_LIMIT_BYTES,
  });
}

function successful(result: SupervisedExit): boolean {
  return (
    result.spawnError === null &&
    result.exitCode === 0 &&
    !result.supervision.timedOut &&
    !result.supervision.outputLimitExceeded
  );
}

function controlFailure(label: string, result: SupervisedExit): Error {
  const detail = (
    result.stderr.toString("utf8") || result.stdout.toString("utf8")
  )
    .replaceAll(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 2_000);
  return new Error(`${label} failed${detail ? `: ${detail}` : "."}`);
}

async function runRequired(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<string> {
  const result = await runControl(executable, args, cwd, timeoutMs);
  if (!successful(result))
    throw controlFailure(`${executable} ${args.join(" ")}`, result);
  return result.stdout.toString("utf8").trim();
}

class DockerImageRuntime implements ContainerImageRuntime {
  buildInvocations = 0;

  readonly #repositoryRoot: string;

  constructor(repositoryRoot: string) {
    this.#repositoryRoot = repositoryRoot;
  }

  async inspect(
    reference: string,
    timeoutMs: number,
  ): Promise<ContainerImageInspection | null> {
    const result = await runControl(
      "docker",
      ["image", "inspect", reference],
      this.#repositoryRoot,
      timeoutMs,
    );
    if (!successful(result)) {
      const detail = `${result.stdout.toString("utf8")}\n${result.stderr.toString("utf8")}`;
      if (/no such (?:object|image)/i.test(detail)) return null;
      throw controlFailure("docker image inspect", result);
    }
    const parsed = JSON.parse(result.stdout.toString("utf8")) as unknown;
    const entry = objectValue(
      Array.isArray(parsed) ? parsed[0] : parsed,
      "Image inspection",
    );
    const config = objectValue(entry["Config"], "Image Config");
    const rawLabels = objectValue(config["Labels"], "Image labels");
    const labels = Object.fromEntries(
      Object.entries(rawLabels).filter(
        (item): item is [string, string] => typeof item[1] === "string",
      ),
    );
    return {
      id: stringValue(entry["Id"], "Image ID"),
      user: stringValue(config["User"], "Image user"),
      labels,
    };
  }

  async build(request: ContainerImageBuildRequest): Promise<void> {
    this.buildInvocations += 1;
    const result = await runControl(
      "docker",
      [
        "build",
        "--pull=false",
        "--tag",
        request.tag,
        "--build-arg",
        `BASE_IMAGE=${request.baseImage}`,
        "--build-arg",
        `NODE_VERSION=${request.nodeVersion}`,
        "--build-arg",
        `PNPM_VERSION=${request.pnpmVersion}`,
        "--build-arg",
        `IMAGE_INPUT_SHA256=${request.inputHash}`,
        "--file",
        request.dockerfilePath,
        request.contextDirectory,
      ],
      this.#repositoryRoot,
      request.timeoutMs,
    );
    if (!successful(result)) throw controlFailure("docker image build", result);
  }
}

async function copyFixture(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    filter: (path) => {
      const sourceRelative = relative(source, path).replaceAll("\\", "/");
      return !sourceRelative
        .split("/")
        .some((segment) =>
          ["node_modules", "artifacts", "dist"].includes(segment),
        );
    },
  });
}

async function candidateRepository(
  fixtureRoot: string,
  temporaryRoot: string,
  id: CaseId,
): Promise<{
  readonly root: string;
  readonly commit: string;
  readonly tree: string;
}> {
  const root = join(temporaryRoot, `candidate-${id}`);
  await copyFixture(fixtureRoot, root);
  await runRequired("git", ["init", "--quiet", "--initial-branch=main"], root);
  await runRequired("git", ["config", "user.name", "OCI Fixture"], root);
  await runRequired(
    "git",
    ["config", "user.email", "oci-fixture@example.invalid"],
    root,
  );
  await runRequired("git", ["add", "--all"], root);
  await runRequired("git", ["commit", "--quiet", "-m", `fixture ${id}`], root);
  const commit = await runRequired("git", ["rev-parse", "HEAD"], root);
  const tree = await runRequired("git", ["rev-parse", "HEAD^{tree}"], root);
  assertion(
    (await runRequired(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      root,
    )) === "",
    `Candidate fixture ${id} is not clean.`,
  );
  return { root, commit, tree };
}

async function fileIdentity(
  path: string,
): Promise<{ readonly bytes: number; readonly sha256: string }> {
  const contents = await readFile(path);
  return { bytes: contents.length, sha256: sha256(contents) };
}

async function managedContainers(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const output = await runRequired(
    "docker",
    ["ps", "--all", "--quiet", "--filter", `label=${MANAGED_LABEL}`],
    repositoryRoot,
  );
  return output ? output.split(/\r?\n/).filter(Boolean).sort() : [];
}

async function managedVolumes(
  repositoryRoot: string,
): Promise<readonly string[]> {
  const output = await runRequired(
    "docker",
    ["volume", "ls", "--quiet", "--filter", `label=${MANAGED_LABEL}`],
    repositoryRoot,
  );
  return output ? output.split(/\r?\n/).filter(Boolean).sort() : [];
}

async function listenBoundaryServer(): Promise<Server> {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const reject = (error: Error) => rejectPromise(error);
    server.once("error", reject);
    server.listen(43_871, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  return server;
}

async function closeServer(server: Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolvePromise, rejectPromise) =>
    server.close((error) => (error ? rejectPromise(error) : resolvePromise())),
  );
}

async function validateContainment(
  result: CommandExecutionSummary,
  expected: {
    readonly imageId: string;
    readonly imageInputHash: string;
    readonly commit: string;
    readonly tree: string;
    readonly runtimeVersion: string;
    readonly capabilityId: string;
  },
): Promise<{
  readonly report: Record<string, unknown>;
  readonly record: CaseRecord["containmentReport"];
  readonly containerName: string;
  readonly containerId: string;
}> {
  const reference = result.containmentReport;
  assertion(
    reference !== null && reference !== undefined,
    `${result.id} has no containment report.`,
  );
  const contents = await readFile(reference.path);
  assertion(
    contents.length === reference.bytes,
    `${result.id} containment byte count drifted.`,
  );
  assertion(
    sha256(contents) === reference.sha256,
    `${result.id} containment hash drifted.`,
  );
  const report = objectValue(
    JSON.parse(contents.toString("utf8")) as unknown,
    "Containment report",
  );
  assertion(
    report["schemaVersion"] === SCHEMA_VERSION,
    `${result.id} report schema drifted.`,
  );
  const runtime = objectValue(report["runtime"], "Containment runtime");
  assertion(
    runtime["name"] === "docker" &&
      runtime["serverVersion"] === expected.runtimeVersion,
    `${result.id} daemon identity drifted.`,
  );
  assertion(
    report["capabilityId"] === expected.capabilityId,
    `${result.id} capability ID drifted.`,
  );
  const provider = objectValue(
    report["executionProvider"],
    "Containment execution provider",
  );
  assertion(
    provider["capabilityId"] === expected.capabilityId &&
      provider["completionEligible"] === true,
    `${result.id} execution-provider attestation drifted.`,
  );
  assertion(
    report["imageDigest"] === expected.imageId,
    `${result.id} image ID drifted.`,
  );
  assertion(
    report["imageInputHash"] === expected.imageInputHash,
    `${result.id} image-input hash drifted.`,
  );
  const candidate = objectValue(report["candidate"], "Containment candidate");
  assertion(
    candidate["commit"] === expected.commit,
    `${result.id} candidate commit drifted.`,
  );
  assertion(
    candidate["tree"] === expected.tree,
    `${result.id} candidate tree drifted.`,
  );
  const container = objectValue(report["container"], "Containment container");
  assertion(
    container["reused"] === false,
    `${result.id} reused a candidate container.`,
  );
  assertion(
    container["removed"] === true,
    `${result.id} container removal is unproven.`,
  );
  const exporter = objectValue(report["artifactExporter"], "Artifact exporter");
  assertion(
    exporter["reused"] === false && exporter["removed"] === true,
    `${result.id} artifact-exporter disposal is unproven.`,
  );
  const boundedVolumes = objectValue(
    report["boundedVolumes"],
    "Bounded volumes",
  );
  for (const kind of ["workspace", "evidence"] as const) {
    const volume = objectValue(boundedVolumes[kind], `${kind} volume`);
    const volumeAttestation = objectValue(
      volume["attestation"],
      `${kind} volume attestation`,
    );
    assertion(
      volume["removed"] === true && volumeAttestation["filesystem"] === "tmpfs",
      `${result.id} ${kind} bounded-volume cleanup/attestation is incomplete.`,
    );
  }
  const policy = objectValue(report["policy"], "Containment policy");
  assertion(
    policy["hostWritableMounts"] === 0,
    `${result.id} exposed a writable host mount.`,
  );
  const attestation = objectValue(
    policy["runtimeAttestation"],
    "Runtime policy attestation",
  );
  assertion(
    attestation["networkMode"] === "none",
    `${result.id} runtime networking is not denied.`,
  );
  assertion(
    attestation["rootFilesystem"] === "read-only" &&
      attestation["capabilities"] === "all-dropped" &&
      attestation["noNewPrivileges"] === true,
    `${result.id} runtime privilege policy is incomplete.`,
  );
  if (result.id !== "artifact-link" && result.id !== "artifact-quota") {
    const artifacts = objectValue(report["artifacts"], "Containment artifacts");
    const preflight = objectValue(artifacts["preflight"], "Artifact preflight");
    const containerEvidence = objectValue(
      artifacts["containerEvidence"],
      "Container evidence inventory",
    );
    const workspace = objectValue(
      artifacts["publishedWorkspace"],
      "Workspace artifact inventory",
    );
    assertion(
      preflight["fileCount"] ===
        Number(containerEvidence["fileCount"]) +
          Number(workspace["fileCount"]) &&
        preflight["totalBytes"] ===
          Number(containerEvidence["totalBytes"]) +
            Number(workspace["totalBytes"]),
      `${result.id} pre-copy artifact totals drifted from exported inventories.`,
    );
  }
  return {
    report,
    record: {
      path: relative(process.cwd(), reference.path).replaceAll("\\", "/"),
      bytes: reference.bytes,
      sha256: reference.sha256,
    },
    containerName: stringValue(container["name"], "Container name"),
    containerId: stringValue(container["id"], "Container ID"),
  };
}

function commandFor(id: CaseId): VerificationCommand {
  if (id === "normal")
    return { id, executable: "pnpm", args: ["verify"], parser: "pnpm-verify" };
  return {
    id,
    executable: "node",
    args: ["tools/adversary.mjs", id],
    parser: "exit-code",
  };
}

async function executeCase(input: {
  readonly id: CaseId;
  readonly fixtureRoot: string;
  readonly temporaryRoot: string;
  readonly outputRoot: string;
  readonly provider: ReturnType<typeof createCandidateExecutionProvider>;
  readonly imageId: string;
  readonly imageInputHash: string;
  readonly runtimeVersion: string;
  readonly capabilityId: string;
}): Promise<CaseRecord> {
  const candidate = await candidateRepository(
    input.fixtureRoot,
    input.temporaryRoot,
    input.id,
  );
  const caseRoot = join(input.outputRoot, "cases", input.id);
  const evidenceRoot = join(caseRoot, "evidence");
  const extraEnvironment: Record<string, string> = {};
  const assertions: string[] = [];
  let server: Server | null = null;
  let protectedFiles: readonly {
    readonly path: string;
    readonly identity: Awaited<ReturnType<typeof fileIdentity>>;
  }[] = [];

  if (input.id === "normal") {
    extraEnvironment["LOOP_VERIFY_STAGE_ID"] = "oci-runtime-normal";
    extraEnvironment["LOOP_VERIFY_COMMAND_ID"] = "normal";
    extraEnvironment["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = evidenceRoot;
  }
  if (input.id === "boundary") {
    const boundaryRoot = join(input.temporaryRoot, "host-boundaries");
    await mkdir(boundaryRoot, { recursive: true });
    const paths = ["canary.txt", "target.txt", "state.json"].map((name) =>
      join(boundaryRoot, name),
    );
    await Promise.all(
      paths.map((path, index) =>
        writeFile(path, `protected-${index}\n`, { flag: "wx" }),
      ),
    );
    protectedFiles = await Promise.all(
      paths.map(async (path) => ({ path, identity: await fileIdentity(path) })),
    );
    extraEnvironment["LOOP_TEST_CANARY"] = paths[0] ?? "";
    extraEnvironment["LOOP_TEST_TARGET"] = paths[1] ?? "";
    extraEnvironment["LOOP_TEST_STATE"] = paths[2] ?? "";
    extraEnvironment["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = evidenceRoot;
    server = await listenBoundaryServer();
  }
  if (input.id === "hang")
    extraEnvironment["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = evidenceRoot;

  const packageBefore = await fileIdentity(
    join(candidate.root, "package.json"),
  );
  let result: CommandExecutionSummary;
  try {
    result = await input.provider.execute(commandFor(input.id), {
      workingDirectory: candidate.root,
      artifactDirectory: join(caseRoot, "logs"),
      timeoutMs: input.id === "hang" ? 12_000 : 120_000,
      killGraceMs: input.id === "hang" ? 500 : 1_000,
      outputLimitBytes: input.id === "output-flood" ? 32_768 : 4 * 1024 * 1024,
      ...(Object.keys(extraEnvironment).length > 0 ? { extraEnvironment } : {}),
    });
  } finally {
    await closeServer(server);
  }

  if (input.id === "normal" || input.id === "boundary")
    assertion(
      result.status === "PASS",
      `${input.id} returned ${result.status}: ${result.message}`,
    );

  const containment = await validateContainment(result, {
    imageId: input.imageId,
    imageInputHash: input.imageInputHash,
    commit: candidate.commit,
    tree: candidate.tree,
    runtimeVersion: input.runtimeVersion,
    capabilityId: input.capabilityId,
  });
  const packageAfter = await fileIdentity(join(candidate.root, "package.json"));
  assertion(
    JSON.stringify(packageAfter) === JSON.stringify(packageBefore),
    `${input.id} mutated its candidate source repository.`,
  );
  assertions.push("candidate source hash unchanged");

  if (input.id === "normal") {
    const aggregatePath = join(
      candidate.root,
      "artifacts",
      "oci-fixture-result.json",
    );
    const aggregate = objectValue(
      JSON.parse(await readFile(aggregatePath, "utf8")) as unknown,
      "OCI aggregate result",
    );
    const runtime = objectValue(aggregate["runtime"], "OCI aggregate runtime");
    const identity = objectValue(
      aggregate["candidate"],
      "OCI aggregate candidate",
    );
    assertion(
      runtime["node"] === `v${NODE_VERSION}`,
      "Contained aggregate Node pin drifted.",
    );
    assertion(
      runtime["pnpm"] === PNPM_VERSION,
      "Contained aggregate pnpm pin drifted.",
    );
    assertion(
      identity["commit"] === candidate.commit,
      "Contained aggregate commit drifted.",
    );
    assertion(
      identity["tree"] === candidate.tree,
      "Contained aggregate tree drifted.",
    );
    const receipt = await validateCommandReceiptDirectory({
      directory: evidenceRoot,
      expectedStageId: "oci-runtime-normal",
      expectedCommandId: "normal",
      requiredKinds: ["oci-fixture-aggregate"],
    });
    assertion(
      receipt.artifactCount === 1,
      "Contained command receipt artifact count drifted.",
    );
    assertions.push(
      "exact pnpm aggregate passed",
      "build/typecheck/Vitest/read-only Git passed",
      "command-owned receipt independently validated",
      "exact Node/pnpm pins observed",
    );
  } else if (input.id === "boundary") {
    for (const protectedFile of protectedFiles)
      assertion(
        JSON.stringify(await fileIdentity(protectedFile.path)) ===
          JSON.stringify(protectedFile.identity),
        `Boundary case mutated ${protectedFile.path}.`,
      );
    const boundary = objectValue(
      JSON.parse(
        await readFile(join(evidenceRoot, "boundary.json"), "utf8"),
      ) as unknown,
      "Boundary result",
    );
    assertion(
      Object.values(boundary).every((value) => value === true),
      "One or more in-container boundary probes were not denied.",
    );
    assertion(
      !existsSync(join(evidenceRoot, "outside-declared-root.json")),
      "Undeclared evidence escaped its publication root.",
    );
    const artifacts = objectValue(
      containment.report["artifacts"],
      "Containment artifacts",
    );
    const containerEvidence = objectValue(
      artifacts["containerEvidence"],
      "Container evidence inventory",
    );
    const files = containerEvidence["files"];
    assertion(
      Array.isArray(files) &&
        files.some(
          (value) =>
            objectValue(value, "Container evidence file")["path"] ===
            "outside-declared-root.json",
        ),
      "Undeclared in-container evidence attempt was not observed.",
    );
    assertions.push(
      "outside read/write probes denied",
      "home/credential/socket/store probes denied",
      "local/external networking denied",
      "non-root/capability/no-new-privileges/read-only-root observed",
      "PID limit configured and enforced",
      "host canary/target/state hashes unchanged",
      "undeclared artifact observed but not published",
    );
  } else if (input.id === "artifact-link") {
    assertion(
      result.status === "ERROR" && /symbolic link/i.test(result.message),
      `Artifact-link case did not fail closed: ${result.status} ${result.message}`,
    );
    assertions.push(
      "hostile artifact symlink rejected",
      "container removed after export failure",
    );
  } else if (input.id === "artifact-quota") {
    assertion(
      result.status === "ERROR" && /byte limit/i.test(result.message),
      `Artifact-quota case did not fail before export: ${result.status} ${result.message}`,
    );
    assertions.push(
      "oversized sparse artifact rejected before host copy",
      "container removed after preflight failure",
    );
  } else if (input.id === "output-flood") {
    assertion(
      result.status === "ERROR" &&
        result.supervision?.outputLimitExceeded === true,
      `Output-flood case did not hit the bounded supervisor: ${result.status} ${result.message}`,
    );
    assertions.push(
      "output limit enforced",
      "bounded log retained",
      "container removed",
    );
  } else {
    assertion(
      result.status === "TIMEOUT" && result.supervision?.timedOut === true,
      `Hang case did not time out: ${result.status} ${result.message}`,
    );
    const artifacts = objectValue(
      containment.report["artifacts"],
      "Containment artifacts",
    );
    const publishedCommand = objectValue(
      artifacts["publishedCommand"],
      "Published hang artifacts",
    );
    const files = publishedCommand["files"];
    assertion(
      Array.isArray(files) &&
        files.some(
          (value) =>
            objectValue(value, "Published hang artifact")["path"] ===
            "child.json",
        ),
      "Hang case timed out before its stubborn descendant was evidenced.",
    );
    const child = objectValue(
      JSON.parse(
        await readFile(join(evidenceRoot, "child.json"), "utf8"),
      ) as unknown,
      "Hang descendant evidence",
    );
    assertion(
      typeof child["pid"] === "number" &&
        Number.isSafeInteger(child["pid"]) &&
        Number(child["pid"]) > 0,
      "Hang descendant PID evidence is malformed.",
    );
    assertions.push(
      "deadline enforced",
      "stubborn descendant launch and held-pipe inheritance evidenced",
      "stubborn descendant and held pipes terminated with container removal",
      "container removed",
    );
  }

  assertion(
    (await managedContainers(process.cwd())).length === 0,
    `${input.id} left a managed container.`,
  );
  assertion(
    (await managedVolumes(process.cwd())).length === 0,
    `${input.id} left a managed volume.`,
  );
  return {
    id: input.id,
    status: result.status,
    durationMs: result.durationMs,
    containerName: containment.containerName,
    containerId: containment.containerId,
    containmentReport: containment.record,
    assertions,
  };
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(process.cwd());
  assertion(
    existsSync(join(repositoryRoot, "PROJECT_GOAL.md")),
    "Run the OCI matrix from repository root.",
  );
  assertion(
    process.platform === "linux",
    "The OCI runtime matrix must run from a Linux controller.",
  );
  assertion(
    process.version === `v${NODE_VERSION}`,
    `Expected Node v${NODE_VERSION}, observed ${process.version}.`,
  );
  const options = parseOptions(repositoryRoot);
  await mkdir(options.outputDirectory, { recursive: true });
  const outputMetadata = await lstat(options.outputDirectory);
  assertion(
    outputMetadata.isDirectory() && !outputMetadata.isSymbolicLink(),
    "OCI output root is unsafe.",
  );
  assertion(
    resolve(await realpath(options.outputDirectory)) ===
      options.outputDirectory,
    "OCI output root identity drifted.",
  );
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "milestone-loop-oci-matrix-"),
  );
  const startedAt = new Date();
  const started = process.hrtime.bigint();
  const cases: CaseRecord[] = [];
  let failure: Error | null = null;
  let image: Awaited<ReturnType<ContainerImageBuilder["ensure"]>> | null = null;
  let capabilityId: string | null = null;
  let runtimeVersion: string | null = null;
  let pnpmVersion: string | null = null;
  let pnpmStore: { readonly pathSha256: string; readonly leaf: string } | null =
    null;
  let controllerCandidate: {
    readonly head: string;
    readonly stagedTree: string;
    readonly stagedPathCount: number;
    readonly stagedPathsSha256: string;
    readonly protectedHumanFile: {
      readonly path: string;
      readonly blob: string;
      readonly untracked: true;
    };
  } | null = null;
  let beforeContainers: readonly string[] = [];
  let afterContainers: readonly string[];
  let beforeVolumes: readonly string[] = [];
  let afterVolumes: readonly string[];
  const imageRuntime = new DockerImageRuntime(repositoryRoot);

  try {
    runtimeVersion = await runRequired(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      repositoryRoot,
    );
    pnpmVersion = await runRequired("pnpm", ["--version"], repositoryRoot);
    assertion(
      pnpmVersion === PNPM_VERSION,
      `Expected pnpm ${PNPM_VERSION}, observed ${pnpmVersion}.`,
    );
    const unstagedPaths = await runRequired(
      "git",
      ["diff", "--no-ext-diff", "--name-only"],
      repositoryRoot,
    );
    assertion(
      unstagedPaths === "",
      "The OCI matrix requires every candidate change to be staged and frozen.",
    );
    const stagedPaths = await runRequired(
      "git",
      ["diff", "--cached", "--no-ext-diff", "--name-only"],
      repositoryRoot,
    );
    assertion(stagedPaths.length > 0, "The WP3d candidate index is empty.");
    const protectedHumanPath =
      "Implementation-ready improvement plan 8-5-26.txt";
    const protectedHumanStatus = await runRequired(
      "git",
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        protectedHumanPath,
      ],
      repositoryRoot,
    );
    assertion(
      protectedHumanStatus.startsWith("?? "),
      "The protected human improvement plan is not exclusively untracked.",
    );
    const protectedHumanBlob = await runRequired(
      "git",
      ["hash-object", `--path=${protectedHumanPath}`, "--", protectedHumanPath],
      repositoryRoot,
    );
    assertion(
      protectedHumanBlob === "d0abdd24f404d9dc335818c355e39f7cfc531300",
      "The protected human improvement plan changed bytes.",
    );
    controllerCandidate = {
      head: await runRequired("git", ["rev-parse", "HEAD"], repositoryRoot),
      stagedTree: await runRequired("git", ["write-tree"], repositoryRoot),
      stagedPathCount: stagedPaths.split(/\r?\n/).filter(Boolean).length,
      stagedPathsSha256: sha256(stagedPaths),
      protectedHumanFile: {
        path: protectedHumanPath,
        blob: protectedHumanBlob,
        untracked: true,
      },
    };
    beforeContainers = await managedContainers(repositoryRoot);
    beforeVolumes = await managedVolumes(repositoryRoot);
    assertion(
      beforeContainers.length === 0,
      "A prior managed candidate container is still present.",
    );
    assertion(
      beforeVolumes.length === 0,
      "A prior managed bounded volume is still present.",
    );
    const contextDirectory = join(
      repositoryRoot,
      "tools",
      "milestone-orchestrator",
      "container",
    );
    image = await new ContainerImageBuilder(imageRuntime).ensure(
      {
        contextDirectory,
        dockerfilePath: join(contextDirectory, "Dockerfile"),
        baseImage: BASE_IMAGE,
        nodeVersion: NODE_VERSION,
        pnpmVersion: PNPM_VERSION,
      },
      10 * 60_000,
    );
    const baseConfig = assertOrchestratorConfig(
      JSON.parse(
        await readFile(
          join(
            repositoryRoot,
            "tools",
            "milestone-orchestrator",
            "config",
            "default.json",
          ),
          "utf8",
        ),
      ) as unknown,
    );
    const config: OrchestratorConfig = {
      ...baseConfig,
      candidateExecution: {
        mode: "trusted-container",
        trustedContainer: {
          ...baseConfig.candidateExecution.trustedContainer,
          runtime: "docker",
          imageDigest: image.imageId,
        },
      },
    };
    const storePath = await resolveControllerPnpmStorePath(30_000);
    assertion(
      existsSync(join(storePath, "index.db")),
      "Controller pnpm store index is missing.",
    );
    assertion(
      existsSync(join(storePath, "files")),
      "Controller pnpm store files are missing.",
    );
    pnpmStore = {
      pathSha256: sha256(storePath),
      leaf: storePath.split(/[\\/]/).at(-1) ?? "",
    };
    process.stdout.write(`[OCI] pnpm store ${storePath}\n`);
    const provider = createCandidateExecutionProvider(config, {
      trustedExecutor: createContainerCommandExecutor(
        config.candidateExecution.trustedContainer,
        { resolveStorePath: async () => storePath },
      ),
    });
    assertion(
      provider.capability?.status === "ready",
      provider.capability?.message ?? "Trusted provider unavailable.",
    );
    assertion(
      provider.identity.completionEligible,
      "Trusted OCI provider identity is not eligible.",
    );
    capabilityId = provider.identity.capabilityId;
    const selected =
      options.selectedCase === "all" ? CASES : [options.selectedCase];
    const fixtureRoot = join(repositoryRoot, "fixtures", "oci-candidate");
    for (const id of selected) {
      const record = await executeCase({
        id,
        fixtureRoot,
        temporaryRoot,
        outputRoot: options.outputDirectory,
        provider,
        imageId: image.imageId,
        imageInputHash: image.inputHash,
        runtimeVersion,
        capabilityId,
      });
      cases.push(record);
      process.stdout.write(
        `[OCI] ${id} ${record.status} ${record.durationMs}ms\n`,
      );
    }
    const names = new Set(cases.map((entry) => entry.containerName));
    const ids = new Set(cases.map((entry) => entry.containerId));
    assertion(
      names.size === cases.length && ids.size === cases.length,
      "Candidate container identity was reused.",
    );
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    afterContainers = await managedContainers(repositoryRoot).catch(() => [
      "cleanup-unproven",
    ]);
    afterVolumes = await managedVolumes(repositoryRoot).catch(() => [
      "cleanup-unproven",
    ]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  if (afterContainers.length !== 0 && failure === null)
    failure = new Error(
      "Managed candidate containers remain after the OCI matrix.",
    );
  if (afterVolumes.length !== 0 && failure === null)
    failure = new Error(
      "Managed candidate volumes remain after the OCI matrix.",
    );
  const finishedAt = new Date();
  const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const slowestCases = [...cases]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5)
    .map(({ id, durationMs }) => ({ id, durationMs }));
  const result = {
    schemaVersion: SCHEMA_VERSION,
    status: failure ? "FAIL" : "PASS",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    selectedCase: options.selectedCase,
    controller: {
      platform: process.platform,
      nodeVersion: process.version,
      pnpmVersion,
      runtime: "docker",
      runtimeVersion,
    },
    controllerCandidate,
    image: image
      ? {
          baseImage: BASE_IMAGE,
          imageId: image.imageId,
          inputHash: image.inputHash,
          tag: image.tag,
          reused: image.reused,
          buildInvocations: imageRuntime.buildInvocations,
        }
      : null,
    pnpmStore,
    capabilityId,
    resourceLimits: OCI_RESOURCE_LIMITS_V1,
    managedResources: {
      containers: { before: beforeContainers, after: afterContainers },
      volumes: { before: beforeVolumes, after: afterVolumes },
    },
    cases,
    slowestCases,
    failure: failure?.message ?? null,
  };
  const resultText = `${JSON.stringify(result, null, 2)}\n`;
  const resultPath = join(options.outputDirectory, "result.json");
  await writeFile(resultPath, resultText, { encoding: "utf8", flag: "wx" });
  const resultStats = await stat(resultPath);
  process.stdout.write(
    `[OCI] result ${relative(repositoryRoot, resultPath).replaceAll("\\", "/")} ${resultStats.size} bytes sha256:${sha256(resultText)}\n`,
  );
  if (failure) throw failure;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
