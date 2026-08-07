import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  BOOTSTRAP_VERIFICATION_STAGE_IDS,
  MILESTONE_SCHEMA_VERSION,
  READINESS_VERIFICATION_STAGE_IDS,
  VERIFICATION_SUMMARY_SCHEMA_VERSION,
} from "./contracts.js";
import type {
  AuthoritativeVerificationSummary,
  CommandExecutionSummary,
  MilestoneProposal,
  OrchestratorConfig,
  ProtectedFileRecord,
  ReadinessHistoryEvidence,
  VerificationCommand,
  VerificationSummary,
  VerificationTierResult,
} from "./contracts.js";
import {
  candidateIdentitiesEqual,
  candidateIdentityFrom,
} from "./candidate-identity.js";
import { runCommand } from "./command-runner.js";
import { assertProtectedFiles, inspectAttempt } from "./git-isolation.js";
import { enforceDiffPolicy } from "./policy.js";
import { enforcementProtectedPatterns } from "./protected-roots.js";
import { atomicWriteJson } from "./state-store.js";
import { assertVerificationTierResult } from "./schema.js";
import type { TelemetryStore } from "./telemetry-store.js";

function contained(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export interface ValidatedReconciliationMilestoneTier {
  readonly result: VerificationTierResult;
  readonly exactRunId: string;
  readonly tierResult: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
  readonly exactResult: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
}

function repositoryArtifactReference(
  repositoryRoot: string,
  absolutePath: string,
  contents: Buffer,
) {
  return {
    path: relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
    sha256: createHash("sha256").update(contents).digest("hex"),
    bytes: contents.byteLength,
  } as const;
}

export async function validateReconciliationMilestoneTier(input: {
  readonly repositoryRoot: string;
  readonly tierResultPath: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly requiredFocusedCommands: readonly {
    readonly id: string;
    readonly argv: readonly string[];
    readonly expectedArtifactKinds: readonly string[];
  }[];
}): Promise<ValidatedReconciliationMilestoneTier> {
  const root = resolve(input.repositoryRoot);
  const tierPath = resolve(root, input.tierResultPath);
  if (!contained(root, tierPath))
    throw new Error("Reconciliation tier result escapes the repository.");
  const tierMetadata = await lstat(tierPath);
  if (!tierMetadata.isFile() || tierMetadata.isSymbolicLink())
    throw new Error(
      "Reconciliation tier result must be a regular non-symlink file.",
    );
  const tierContents = await readFile(tierPath);
  const result = assertVerificationTierResult(
    JSON.parse(tierContents.toString("utf8")) as unknown,
  );
  const requiredIds = input.requiredFocusedCommands.map(
    (command) => command.id,
  );
  const commandIds = result.commands.map((command) => command.id);
  const expectedCommandIds = [...requiredIds, "exact-readiness"];
  const sameIds = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
  if (
    requiredIds.length === 0 ||
    new Set(requiredIds).size !== requiredIds.length ||
    result.tier !== "milestone" ||
    result.status !== "NOT_READY" ||
    result.exitCode !== 2 ||
    result.authoritative !== false ||
    result.reviewRequired !== true ||
    result.candidate.gitCommit !== input.candidateCommit ||
    result.candidate.gitTree !== input.candidateTree ||
    result.candidate.workingTreeDirty ||
    result.identityDrift.detected ||
    result.candidateFinal.gitCommit !== input.candidateCommit ||
    result.candidateFinal.gitTree !== input.candidateTree ||
    result.candidateFinal.workingTreeDirty ||
    !result.exactVerification ||
    result.exactVerification.status !== "NOT_READY" ||
    result.exactVerification.exitCode !== 2 ||
    result.exactVerification.disposition !== "incremental-readiness" ||
    result.exactVerification.selectedByOverride !== false ||
    result.exactVerification.candidateCommit !== input.candidateCommit ||
    result.exactVerification.candidateTree !== input.candidateTree ||
    !sameIds(result.actualCheckIds, requiredIds) ||
    !sameIds(result.fullClosureCheckIds, requiredIds) ||
    !sameIds(commandIds, expectedCommandIds) ||
    input.requiredFocusedCommands.some((required, index) => {
      const command = result.commands[index];
      return (
        !command ||
        !sameIds(command.argv, required.argv) ||
        command.receipt === null ||
        command.receiptAbsenceReason !== null
      );
    }) ||
    !sameIds(result.commands.at(-1)?.argv ?? [], ["pnpm", "verify"]) ||
    result.commands.some((command) =>
      command.id === "exact-readiness"
        ? command.status !== "NOT_READY" || command.exitCode !== 2
        : command.status !== "PASS" || command.exitCode !== 0,
    )
  )
    throw new Error(
      "Reconciliation milestone tier is not the exact clean incremental-readiness result.",
    );

  for (const [index, required] of input.requiredFocusedCommands.entries()) {
    const reference = result.commands[index]?.receipt;
    if (!reference)
      throw new Error(
        `Reconciliation focused receipt is absent for ${required.id}.`,
      );
    const receiptPath = resolve(root, reference.path);
    if (!contained(root, receiptPath))
      throw new Error(
        `Reconciliation focused receipt escapes the repository for ${required.id}.`,
      );
    const validated = await validateCommandReceiptDirectory({
      directory: dirname(receiptPath),
      expectedStageId: "verification-tier-milestone",
      expectedCommandId: required.id,
      requiredKinds: required.expectedArtifactKinds,
    });
    const actual = repositoryArtifactReference(
      root,
      validated.receiptPath,
      await readFile(validated.receiptPath),
    );
    if (
      actual.path !== reference.path ||
      actual.sha256 !== reference.sha256 ||
      actual.bytes !== reference.bytes
    )
      throw new Error(
        `Reconciliation focused receipt reference drifted for ${required.id}.`,
      );
  }

  const exactPath = resolve(root, result.exactVerification.resultPath);
  if (!contained(root, exactPath))
    throw new Error("Exact readiness result escapes the repository.");
  const exactMetadata = await lstat(exactPath);
  if (!exactMetadata.isFile() || exactMetadata.isSymbolicLink())
    throw new Error("Exact readiness result is not a regular file.");
  const exactContents = await readFile(exactPath);
  const exactSha256 = createHash("sha256").update(exactContents).digest("hex");
  if (exactSha256 !== result.exactVerification.resultSha256)
    throw new Error(
      "Exact readiness result hash does not match its tier index.",
    );
  const exact = JSON.parse(exactContents.toString("utf8")) as Record<
    string,
    unknown
  >;
  const stages = Array.isArray(exact["stages"])
    ? (exact["stages"] as Record<string, unknown>[])
    : [];
  const summary = exact["summary"] as Record<string, unknown> | undefined;
  const counts = summary?.["stageCounts"] as
    Record<string, unknown> | undefined;
  const profile = exact["profile"] as Record<string, unknown> | undefined;
  const completion = exact["completion"] as Record<string, unknown> | undefined;
  const candidate = exact["candidate"] as Record<string, unknown> | undefined;
  const invocation = exact["invocation"];
  const exactCandidateFinal = exact["candidateFinal"] as
    Record<string, unknown> | undefined;
  const exactIdentityDrift = exact["identityDrift"] as
    Record<string, unknown> | undefined;
  const exactPassCount = stages.filter(
    (stage) => stage["status"] === "PASS",
  ).length;
  const exactNotReadyCount = stages.filter(
    (stage) => stage["status"] === "NOT_READY",
  ).length;
  if (
    exact["schemaVersion"] !== "2.1.0" ||
    typeof exact["runId"] !== "string" ||
    exact["runId"].length === 0 ||
    exact["status"] !== "NOT_READY" ||
    exact["exitCode"] !== 2 ||
    !Array.isArray(invocation) ||
    invocation.length !== 2 ||
    invocation[0] !== "node" ||
    invocation[1] !== "scripts/verify.mjs" ||
    profile?.["id"] !== "readiness" ||
    profile["configuredDefault"] !== "readiness" ||
    profile["selectedByOverride"] !== false ||
    completion?.["claim"] !== "autonomous_readiness" ||
    completion["eligible"] !== false ||
    candidate?.["gitCommit"] !== input.candidateCommit ||
    candidate["gitTree"] !== input.candidateTree ||
    candidate["workingTreeDirty"] !== false ||
    exactCandidateFinal?.["gitCommit"] !== input.candidateCommit ||
    exactCandidateFinal["gitTree"] !== input.candidateTree ||
    exactCandidateFinal["workingTreeDirty"] !== false ||
    exactIdentityDrift?.["detected"] !== false ||
    stages.length !== READINESS_VERIFICATION_STAGE_IDS.length ||
    stages.some(
      (stage, index) =>
        stage["id"] !== READINESS_VERIFICATION_STAGE_IDS[index] ||
        !["PASS", "NOT_READY"].includes(String(stage["status"])),
    ) ||
    summary?.["requiredStageCount"] !==
      READINESS_VERIFICATION_STAGE_IDS.length ||
    exactPassCount !== 5 ||
    exactNotReadyCount !== 10 ||
    counts?.["PASS"] !== exactPassCount ||
    counts["NOT_READY"] !== exactNotReadyCount ||
    counts["FAIL"] !== 0 ||
    counts["ERROR"] !== 0
  )
    throw new Error(
      "Exact readiness child does not match the required five-PASS/ten-NOT_READY disposition.",
    );
  return {
    result,
    exactRunId: exact["runId"],
    tierResult: repositoryArtifactReference(root, tierPath, tierContents),
    exactResult: repositoryArtifactReference(root, exactPath, exactContents),
  };
}

function verificationRunId(
  runId: string,
  milestoneId: string,
  attempt: number,
): string {
  return `${runId}-${milestoneId}-a${attempt}-verify`
    .replaceAll(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 96);
}

type ResultStatus = "PASS" | "NOT_READY" | "FAIL" | "ERROR";

const STATUS_WEIGHT: Readonly<Record<ResultStatus, number>> = {
  PASS: 0,
  NOT_READY: 1,
  FAIL: 2,
  ERROR: 3,
};

const EXPECTED_STAGE_IDS = {
  bootstrap: BOOTSTRAP_VERIFICATION_STAGE_IDS,
  readiness: READINESS_VERIFICATION_STAGE_IDS,
} as const;

interface StageEvidenceContract {
  readonly scripts: readonly string[];
  readonly requiredArtifactKinds: readonly string[];
}

const STAGE_EVIDENCE_CONTRACTS: Readonly<
  Record<string, StageEvidenceContract>
> = {
  environment: {
    scripts: ["verify:dependencies"],
    requiredArtifactKinds: ["dependency-report"],
  },
  "format-lint": {
    scripts: ["format:check", "lint", "lint:architecture"],
    requiredArtifactKinds: [
      "format-report",
      "lint-report",
      "architecture-report",
    ],
  },
  typecheck: {
    scripts: ["typecheck"],
    requiredArtifactKinds: ["typecheck-report"],
  },
  "production-build": {
    scripts: ["build"],
    requiredArtifactKinds: ["build-report"],
  },
  "bootstrap-tests": {
    scripts: ["test:unit"],
    requiredArtifactKinds: ["vitest-report"],
  },
  "bootstrap-simulation": {
    scripts: ["verify:bootstrap:simulation"],
    requiredArtifactKinds: [
      "node-checkpoints",
      "worker-checkpoints",
      "user-action-log",
      "replay-report",
      "parity-report",
    ],
  },
  "bootstrap-persistence": {
    scripts: ["verify:bootstrap:persistence"],
    requiredArtifactKinds: ["save-envelope", "save-roundtrip-report"],
  },
  "bootstrap-browser": {
    scripts: ["verify:bootstrap:browser"],
    requiredArtifactKinds: [
      "playwright-report",
      "screenshot",
      "browser-diagnostics",
      "visual-review",
    ],
  },
  "unit-domain": {
    scripts: ["test:unit", "test:domain"],
    requiredArtifactKinds: ["vitest-report", "domain-test-report"],
  },
  "determinism-replay": {
    scripts: ["verify:determinism", "verify:parity", "verify:replay"],
    requiredArtifactKinds: [
      "determinism-report",
      "parity-report",
      "replay-report",
    ],
  },
  "save-load": {
    scripts: ["verify:save"],
    requiredArtifactKinds: ["save-validation-report"],
  },
  "headless-scenarios": {
    scripts: ["verify:headless"],
    requiredArtifactKinds: ["headless-report"],
  },
  "bot-playtesting": {
    scripts: ["benchmark:bot", "benchmark:visible-seeds"],
    requiredArtifactKinds: ["bot-benchmark-report", "visible-seed-report"],
  },
  "browser-interaction": {
    scripts: ["verify:browser"],
    requiredArtifactKinds: ["browser-interaction-report"],
  },
  "playwright-evidence": {
    scripts: ["verify:visual"],
    requiredArtifactKinds: ["visual-evidence-index"],
  },
  "browser-diagnostics": {
    scripts: ["verify:browser-diagnostics"],
    requiredArtifactKinds: ["browser-diagnostics"],
  },
  performance: {
    scripts: ["verify:performance"],
    requiredArtifactKinds: ["performance-report"],
  },
  "acceptance-manifest": {
    scripts: ["verify:acceptance"],
    requiredArtifactKinds: ["acceptance-report"],
  },
  "contract-integrity": { scripts: [], requiredArtifactKinds: [] },
};

const READINESS_FOUNDATION_STAGE_IDS = [
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "contract-integrity",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResultStatus(value: unknown): value is ResultStatus {
  return (
    value === "PASS" ||
    value === "NOT_READY" ||
    value === "FAIL" ||
    value === "ERROR"
  );
}

function aggregateStatus(statuses: readonly ResultStatus[]): ResultStatus {
  return statuses.reduce<ResultStatus>(
    (worst, status) =>
      STATUS_WEIGHT[status] > STATUS_WEIGHT[worst] ? status : worst,
    "PASS",
  );
}

function malformed(): Error {
  return new Error(
    "Authoritative verifier result is failing, ineligible, mixed-candidate, or malformed.",
  );
}

function stringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index])
  );
}

function expectedCommandRoot(
  stageId: string,
  commandId: string,
  commandIndex: number,
): string {
  return `stages/${stageId}/${String(commandIndex + 1).padStart(2, "0")}-${commandId.replaceAll(":", "-")}`;
}

function expectedCommandLog(
  stageId: string,
  commandId: string,
  commandIndex: number,
): string {
  return `logs/${stageId}-${String(commandIndex + 1).padStart(2, "0")}-${commandId.replaceAll(":", "-")}.log`;
}

function validReceiptChecks(
  value: unknown,
): value is readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const ids = new Set<string>();
  for (const check of value) {
    if (
      !isRecord(check) ||
      typeof check["id"] !== "string" ||
      check["id"].length === 0 ||
      ids.has(check["id"]) ||
      check["status"] !== "PASS" ||
      typeof check["summary"] !== "string" ||
      check["summary"].length === 0
    )
      return false;
    ids.add(check["id"]);
  }
  return true;
}

function receiptChecksMatch(
  retained: readonly Record<string, unknown>[],
  receipt: readonly Record<string, unknown>[],
): boolean {
  return (
    retained.length === receipt.length &&
    retained.every(
      (check, index) =>
        check["id"] === receipt[index]?.["id"] &&
        check["status"] === receipt[index]?.["status"] &&
        check["summary"] === receipt[index]?.["summary"],
    )
  );
}

export interface ValidatedCommandReceipt {
  readonly receiptPath: string;
  readonly receiptSha256: string;
  readonly receiptBytes: number;
  readonly artifactCount: number;
  readonly artifactBytes: number;
  readonly kinds: readonly string[];
  readonly artifacts: readonly {
    readonly path: string;
    readonly kind: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}

export async function validateCommandReceiptDirectory(input: {
  readonly directory: string;
  readonly expectedStageId: string;
  readonly expectedCommandId: string;
  readonly requiredKinds?: readonly string[];
}): Promise<ValidatedCommandReceipt> {
  const directory = resolve(input.directory);
  const receiptPath = resolve(directory, "result.json");
  if (!existsSync(directory) || !existsSync(receiptPath))
    throw new Error(
      `Command-owned evidence receipt is missing for ${input.expectedCommandId}.`,
    );
  const realDirectory = await realpath(directory);
  const realReceiptPath = await realpath(receiptPath);
  if (!contained(realDirectory, realReceiptPath))
    throw new Error(
      `Command-owned evidence receipt escapes its command directory for ${input.expectedCommandId}.`,
    );
  const receiptContents = await readFile(realReceiptPath);
  let receipt: unknown;
  try {
    receipt = JSON.parse(receiptContents.toString("utf8")) as unknown;
  } catch {
    throw new Error(
      `Command-owned evidence receipt is malformed for ${input.expectedCommandId}.`,
    );
  }
  if (
    !isRecord(receipt) ||
    receipt["schemaVersion"] !== "1.0.0" ||
    receipt["stageId"] !== input.expectedStageId ||
    receipt["commandId"] !== input.expectedCommandId ||
    receipt["status"] !== "PASS" ||
    !validReceiptChecks(receipt["checks"]) ||
    !Array.isArray(receipt["artifacts"]) ||
    receipt["artifacts"].length === 0
  )
    throw new Error(
      `Command-owned evidence identity, checks, artifacts, or schema is invalid for ${input.expectedCommandId}.`,
    );

  const artifactPaths = new Set<string>();
  const kinds: string[] = [];
  const artifacts: {
    path: string;
    kind: string;
    bytes: number;
    sha256: string;
  }[] = [];
  let artifactBytes = 0;
  for (const artifact of receipt["artifacts"]) {
    if (
      !isRecord(artifact) ||
      typeof artifact["path"] !== "string" ||
      artifact["path"].length === 0 ||
      artifact["path"] === "result.json" ||
      artifactPaths.has(artifact["path"]) ||
      typeof artifact["kind"] !== "string" ||
      artifact["kind"].length === 0 ||
      !Number.isSafeInteger(artifact["bytes"]) ||
      Number(artifact["bytes"]) <= 0 ||
      typeof artifact["sha256"] !== "string" ||
      !/^[a-f0-9]{64}$/.test(artifact["sha256"])
    )
      throw new Error(
        `Command-owned evidence contains an invalid artifact declaration for ${input.expectedCommandId}.`,
      );
    const path = resolve(directory, artifact["path"]);
    if (!contained(directory, path) || !existsSync(path))
      throw new Error(
        `Command-owned artifact is missing or escapes its directory: ${artifact["path"]}.`,
      );
    const realPath = await realpath(path);
    if (!contained(realDirectory, realPath))
      throw new Error(
        `Command-owned artifact resolves outside its directory: ${artifact["path"]}.`,
      );
    const metadata = await stat(realPath);
    const actualHash = createHash("sha256")
      .update(await readFile(realPath))
      .digest("hex");
    if (
      !metadata.isFile() ||
      metadata.size !== artifact["bytes"] ||
      actualHash !== artifact["sha256"]
    )
      throw new Error(
        `Command-owned artifact failed size or hash validation: ${artifact["path"]}.`,
      );
    artifactPaths.add(artifact["path"]);
    kinds.push(artifact["kind"]);
    artifactBytes += metadata.size;
    artifacts.push({
      path,
      kind: artifact["kind"],
      bytes: metadata.size,
      sha256: actualHash,
    });
  }
  const requiredKinds = input.requiredKinds ?? [];
  const missingKinds = requiredKinds.filter((kind) => !kinds.includes(kind));
  if (missingKinds.length > 0)
    throw new Error(
      `Command-owned evidence is missing required artifact kinds for ${input.expectedCommandId}: ${missingKinds.join(", ")}.`,
    );
  return {
    receiptPath,
    receiptSha256: createHash("sha256").update(receiptContents).digest("hex"),
    receiptBytes: receiptContents.byteLength,
    artifactCount: artifactPaths.size,
    artifactBytes,
    kinds,
    artifacts,
  };
}

async function validatePassingCommandEvidence(input: {
  readonly stageId: string;
  readonly commandId: string;
  readonly commandIndex: number;
  readonly command: Record<string, unknown>;
  readonly artifactRoot: string;
  readonly realArtifactRoot: string;
}): Promise<{
  readonly artifactCount: number;
  readonly kinds: readonly string[];
}> {
  const commandRootRelative = expectedCommandRoot(
    input.stageId,
    input.commandId,
    input.commandIndex,
  );
  const commandRoot = resolve(input.artifactRoot, commandRootRelative);
  const evidence = input.command["evidence"];
  if (
    input.command["exitCode"] !== 0 ||
    input.command["signal"] !== null ||
    input.command["artifactDirectory"] !== commandRootRelative ||
    input.command["log"] !==
      expectedCommandLog(input.stageId, input.commandId, input.commandIndex) ||
    !isRecord(evidence) ||
    evidence["valid"] !== true ||
    typeof evidence["message"] !== "string" ||
    evidence["message"].length === 0 ||
    !validReceiptChecks(evidence["checks"]) ||
    !Array.isArray(evidence["artifacts"]) ||
    evidence["artifacts"].length === 0
  )
    throw new Error(
      `Passing stage ${input.stageId} has invalid command evidence.`,
    );

  if (!contained(input.artifactRoot, commandRoot) || !existsSync(commandRoot))
    throw new Error(
      `Authoritative command evidence directory is missing: ${commandRootRelative}.`,
    );
  const realCommandRoot = await realpath(commandRoot);
  if (!contained(input.realArtifactRoot, realCommandRoot))
    throw new Error(
      `Authoritative command evidence directory escapes its root: ${commandRootRelative}.`,
    );

  const expectedReceiptRelative = `${commandRootRelative}/result.json`;
  if (evidence["receipt"] !== expectedReceiptRelative)
    throw new Error(
      `Passing stage ${input.stageId} has an invalid command-owned receipt path.`,
    );
  const receiptPath = resolve(input.artifactRoot, expectedReceiptRelative);
  if (!contained(commandRoot, receiptPath) || !existsSync(receiptPath))
    throw new Error(
      `Authoritative command evidence receipt is missing: ${expectedReceiptRelative}.`,
    );
  const realReceiptPath = await realpath(receiptPath);
  if (!contained(realCommandRoot, realReceiptPath))
    throw new Error(
      `Authoritative command evidence receipt escapes its command directory: ${expectedReceiptRelative}.`,
    );

  let receiptValue: unknown;
  try {
    receiptValue = JSON.parse(
      await readFile(realReceiptPath, "utf8"),
    ) as unknown;
  } catch {
    throw new Error(
      `Authoritative command evidence receipt is malformed: ${expectedReceiptRelative}.`,
    );
  }
  if (
    !isRecord(receiptValue) ||
    receiptValue["schemaVersion"] !== "1.0.0" ||
    receiptValue["stageId"] !== input.stageId ||
    receiptValue["commandId"] !== input.commandId ||
    receiptValue["status"] !== "PASS" ||
    !validReceiptChecks(receiptValue["checks"]) ||
    !receiptChecksMatch(evidence["checks"], receiptValue["checks"]) ||
    !Array.isArray(receiptValue["artifacts"]) ||
    receiptValue["artifacts"].length === 0 ||
    receiptValue["artifacts"].length !== evidence["artifacts"].length
  )
    throw new Error(
      `Authoritative command evidence receipt identity, checks, or schema is invalid: ${expectedReceiptRelative}.`,
    );

  const artifactPaths = new Set<string>();
  const kinds: string[] = [];
  for (const [artifactIndex, receiptArtifact] of receiptValue[
    "artifacts"
  ].entries()) {
    const retainedArtifact = evidence["artifacts"][artifactIndex];
    if (
      !isRecord(receiptArtifact) ||
      typeof receiptArtifact["path"] !== "string" ||
      receiptArtifact["path"].length === 0 ||
      receiptArtifact["path"] === "result.json" ||
      artifactPaths.has(receiptArtifact["path"]) ||
      typeof receiptArtifact["kind"] !== "string" ||
      receiptArtifact["kind"].length === 0 ||
      !Number.isSafeInteger(receiptArtifact["bytes"]) ||
      Number(receiptArtifact["bytes"]) <= 0 ||
      typeof receiptArtifact["sha256"] !== "string" ||
      !/^[a-f0-9]{64}$/.test(receiptArtifact["sha256"]) ||
      !isRecord(retainedArtifact) ||
      retainedArtifact["path"] !==
        `${commandRootRelative}/${receiptArtifact["path"]}` ||
      retainedArtifact["kind"] !== receiptArtifact["kind"] ||
      retainedArtifact["bytes"] !== receiptArtifact["bytes"] ||
      retainedArtifact["sha256"] !== receiptArtifact["sha256"]
    )
      throw new Error(
        "Authoritative verifier contains a malformed or inconsistent command-owned artifact declaration.",
      );

    const artifactRelative = receiptArtifact["path"];
    const artifactPath = resolve(commandRoot, artifactRelative);
    if (!contained(commandRoot, artifactPath) || !existsSync(artifactPath))
      throw new Error(
        `Authoritative evidence artifact is missing or outside its command directory: ${artifactRelative}.`,
      );
    const realArtifactPath = await realpath(artifactPath);
    if (!contained(realCommandRoot, realArtifactPath))
      throw new Error(
        `Authoritative evidence artifact escapes its command directory: ${artifactRelative}.`,
      );
    const metadata = await stat(realArtifactPath);
    const hash = createHash("sha256")
      .update(await readFile(realArtifactPath))
      .digest("hex");
    if (
      !metadata.isFile() ||
      metadata.size !== receiptArtifact["bytes"] ||
      hash !== receiptArtifact["sha256"]
    )
      throw new Error(
        `Authoritative evidence artifact failed size or hash validation: ${artifactRelative}.`,
      );
    artifactPaths.add(artifactRelative);
    kinds.push(receiptArtifact["kind"]);
  }
  return { artifactCount: artifactPaths.size, kinds };
}

export async function parseAuthoritativeVerification(input: {
  readonly workspacePath: string;
  readonly expectedCommit: string;
  readonly expectedTree?: string;
  readonly expectedRunId: string;
  readonly observedExitCode: number;
  readonly resultPath: string;
  readonly copiedResultPath: string;
  readonly readinessHistory?: ReadinessHistoryEvidence;
}): Promise<AuthoritativeVerificationSummary> {
  if (!existsSync(input.resultPath))
    throw new Error("Authoritative verifier did not produce result.json.");
  const realWorkspacePath = await realpath(input.workspacePath);
  const realResultPath = await realpath(input.resultPath);
  if (!contained(realWorkspacePath, realResultPath))
    throw new Error(
      "Authoritative verifier result escapes the isolated workspace.",
    );
  const parsed = JSON.parse(
    await readFile(input.resultPath, "utf8"),
  ) as unknown;
  if (!isRecord(parsed)) throw malformed();
  const profileRecord = parsed["profile"];
  const completion = parsed["completion"];
  const candidate = parsed["candidate"];
  const resultSummary = parsed["summary"];
  const stageValues = parsed["stages"];
  if (
    !isRecord(profileRecord) ||
    !isRecord(completion) ||
    !isRecord(candidate) ||
    !isRecord(resultSummary) ||
    !Array.isArray(stageValues)
  )
    throw malformed();
  const profile = profileRecord["id"];
  const status = parsed["status"];
  if (
    (profile !== "bootstrap" && profile !== "readiness") ||
    (status !== "PASS" && status !== "NOT_READY")
  )
    throw malformed();
  const expectedClaim =
    profile === "readiness" ? "autonomous_readiness" : "bootstrap_complete";
  const expectedExitCode = status === "PASS" ? 0 : 2;
  const expectedReasons =
    status === "PASS" ? [] : ["verification_status_not_pass"];
  const reasons = completion["reasons"];
  const profileAutonomousReadinessEquivalent = profile === "readiness";
  const candidateFinal = parsed["candidateFinal"];
  const identityDrift = parsed["identityDrift"];
  if (
    parsed["schemaVersion"] !== "2.1.0" ||
    parsed["runId"] !== input.expectedRunId ||
    parsed["exitCode"] !== expectedExitCode ||
    input.observedExitCode !== expectedExitCode ||
    profileRecord["configuredDefault"] !== profile ||
    profileRecord["selectedByOverride"] !== false ||
    profileRecord["autonomousReadinessEquivalent"] !==
      profileAutonomousReadinessEquivalent ||
    completion["claim"] !== expectedClaim ||
    completion["eligible"] !== (status === "PASS") ||
    !stringArray(reasons) ||
    !sameStrings(reasons, expectedReasons) ||
    candidate["gitCommit"] !== input.expectedCommit ||
    (input.expectedTree !== undefined &&
      candidate["gitTree"] !== input.expectedTree) ||
    candidate["workingTreeDirty"] !== false ||
    !isRecord(candidateFinal) ||
    candidateFinal["gitCommit"] !== input.expectedCommit ||
    candidateFinal["gitCommit"] !== candidate["gitCommit"] ||
    candidateFinal["gitTree"] !== candidate["gitTree"] ||
    (input.expectedTree !== undefined &&
      candidateFinal["gitTree"] !== input.expectedTree) ||
    candidateFinal["workingTreeDirty"] !== false ||
    !isRecord(identityDrift) ||
    identityDrift["detected"] !== false ||
    (status === "NOT_READY" && profile !== "readiness")
  )
    throw malformed();

  const readinessHistoryMode =
    profile === "readiness"
      ? (input.readinessHistory?.mode ?? "not-applicable")
      : ("not-applicable" as const);
  const previouslyPassingStageIds =
    profile === "readiness"
      ? [...(input.readinessHistory?.previouslyPassingStageIds ?? [])]
      : [];
  if (
    (profile === "bootstrap" && input.readinessHistory !== undefined) ||
    (profile === "readiness" &&
      ((readinessHistoryMode !== "first-readiness-transition" &&
        readinessHistoryMode !== "durable-records") ||
        !input.readinessHistory ||
        !stringArray(input.readinessHistory.previouslyPassingStageIds) ||
        new Set(previouslyPassingStageIds).size !==
          previouslyPassingStageIds.length ||
        previouslyPassingStageIds.some(
          (id) => !READINESS_VERIFICATION_STAGE_IDS.includes(id as never),
        ) ||
        (readinessHistoryMode === "first-readiness-transition" &&
          previouslyPassingStageIds.length !== 0) ||
        (readinessHistoryMode === "durable-records" &&
          previouslyPassingStageIds.length === 0)))
  )
    throw new Error(
      "Durable readiness-stage history is missing, malformed, or inconsistent with the first transition.",
    );

  const artifactRootValue = parsed["artifactRoot"];
  if (typeof artifactRootValue !== "string" || artifactRootValue.length === 0)
    throw malformed();
  const artifactRoot = resolve(input.workspacePath, artifactRootValue);
  const realArtifactRoot = existsSync(artifactRoot)
    ? await realpath(artifactRoot)
    : artifactRoot;
  if (
    !contained(input.workspacePath, artifactRoot) ||
    !contained(realWorkspacePath, realArtifactRoot) ||
    realResultPath !== resolve(realArtifactRoot, "result.json")
  )
    throw new Error(
      "Authoritative artifact root escapes the isolated workspace.",
    );

  const expectedStageIds = EXPECTED_STAGE_IDS[profile];
  const requiredStageCountValue = resultSummary["requiredStageCount"];
  const stageCounts = resultSummary["stageCounts"];
  if (
    !Number.isSafeInteger(requiredStageCountValue) ||
    requiredStageCountValue !== expectedStageIds.length ||
    stageValues.length !== expectedStageIds.length ||
    !isRecord(stageCounts)
  )
    throw malformed();
  const requiredStageCount = Number(requiredStageCountValue);

  let validatedArtifactCount = 0;
  const stages: { id: string; status: "PASS" | "NOT_READY" }[] = [];
  for (const [stageIndex, stageValue] of stageValues.entries()) {
    if (!isRecord(stageValue)) throw malformed();
    const id = stageValue["id"];
    const stageStatus = stageValue["status"];
    const checks = stageValue["checks"];
    const commands = stageValue["commands"];
    const stageContract =
      typeof id === "string" ? STAGE_EVIDENCE_CONTRACTS[id] : undefined;
    if (
      typeof id !== "string" ||
      id !== expectedStageIds[stageIndex] ||
      !stageContract ||
      (stageStatus !== "PASS" && stageStatus !== "NOT_READY") ||
      stageValue["required"] !== true ||
      !Array.isArray(checks) ||
      !Array.isArray(commands) ||
      commands.length !== stageContract.scripts.length
    )
      throw malformed();
    const childStatuses: ResultStatus[] = [];
    const checkIds = new Set<string>();
    for (const check of checks) {
      if (
        !isRecord(check) ||
        typeof check["id"] !== "string" ||
        check["id"].length === 0 ||
        checkIds.has(check["id"]) ||
        !isResultStatus(check["status"]) ||
        typeof check["message"] !== "string" ||
        check["message"].length === 0
      )
        throw malformed();
      checkIds.add(check["id"]);
      childStatuses.push(check["status"]);
    }
    const stageArtifactKinds = new Set<string>();
    for (const [commandIndex, command] of commands.entries()) {
      const expectedCommandId = stageContract.scripts[commandIndex];
      if (
        !expectedCommandId ||
        !isRecord(command) ||
        command["script"] !== expectedCommandId ||
        command["displayCommand"] !== `pnpm run ${expectedCommandId}` ||
        !isResultStatus(command["status"]) ||
        !Number.isSafeInteger(command["durationMs"]) ||
        Number(command["durationMs"]) < 0 ||
        typeof command["message"] !== "string" ||
        command["message"].length === 0
      )
        throw malformed();
      const commandStatus = command["status"];
      childStatuses.push(commandStatus);
      if (commandStatus === "PASS") {
        const validated = await validatePassingCommandEvidence({
          stageId: id,
          commandId: expectedCommandId,
          commandIndex,
          command,
          artifactRoot,
          realArtifactRoot,
        });
        validatedArtifactCount += validated.artifactCount;
        for (const kind of validated.kinds) stageArtifactKinds.add(kind);
        continue;
      }
      if (commandStatus === "NOT_READY") {
        const commandRootRelative = expectedCommandRoot(
          id,
          expectedCommandId,
          commandIndex,
        );
        const missingScriptShape =
          command["exitCode"] === null &&
          command["signal"] === null &&
          command["log"] === null &&
          command["artifactDirectory"] === undefined &&
          command["evidence"] === null;
        const exitedNotReadyShape =
          command["exitCode"] === 2 &&
          command["signal"] === null &&
          command["log"] ===
            expectedCommandLog(id, expectedCommandId, commandIndex) &&
          command["artifactDirectory"] === commandRootRelative &&
          command["evidence"] === null;
        if (!missingScriptShape && !exitedNotReadyShape) throw malformed();
      }
    }
    if (
      stageStatus === "PASS" &&
      stageContract.requiredArtifactKinds.some(
        (kind) => !stageArtifactKinds.has(kind),
      )
    )
      throw new Error(
        `Passing stage ${id} is missing a required command-owned artifact kind.`,
      );
    if (
      childStatuses.length === 0 ||
      aggregateStatus(childStatuses) !== stageStatus ||
      childStatuses.some(
        (childStatus) => childStatus === "FAIL" || childStatus === "ERROR",
      )
    )
      throw malformed();
    stages.push({ id, status: stageStatus });
  }

  const stageStatuses = stages.map((stage) => stage.status);
  if (aggregateStatus(stageStatuses) !== status) throw malformed();
  for (const countedStatus of ["PASS", "NOT_READY", "FAIL", "ERROR"] as const) {
    const expectedCount = stageStatuses.filter(
      (stageStatus) => stageStatus === countedStatus,
    ).length;
    if (stageCounts[countedStatus] !== expectedCount) throw malformed();
  }

  const passingStageIds = stages
    .filter((stage) => stage.status === "PASS")
    .map((stage) => stage.id);
  const notReadyStageIds = stages
    .filter((stage) => stage.status === "NOT_READY")
    .map((stage) => stage.id);
  if (profile === "readiness") {
    const foundationRegression = READINESS_FOUNDATION_STAGE_IDS.filter(
      (id) => !passingStageIds.includes(id),
    );
    const recordedRegression = previouslyPassingStageIds.filter(
      (id) => !passingStageIds.includes(id),
    );
    if (foundationRegression.length > 0 || recordedRegression.length > 0)
      throw new Error(
        `Readiness stage regression detected: ${[
          ...foundationRegression,
          ...recordedRegression,
        ].join(", ")}.`,
      );
  }

  await atomicWriteJson(input.copiedResultPath, parsed);
  const disposition =
    status === "PASS" ? "completion-eligible" : "incremental-readiness";
  return {
    runId: input.expectedRunId,
    status,
    exitCode: expectedExitCode,
    disposition,
    profileId: profile,
    completionClaim: expectedClaim,
    completionEligible: status === "PASS",
    profileAutonomousReadinessEquivalent,
    autonomousReadinessEquivalent:
      status === "PASS" && profileAutonomousReadinessEquivalent,
    readinessHistoryMode,
    candidateCommit: input.expectedCommit,
    requiredStageCount,
    validatedArtifactCount,
    stages,
    passingStageIds,
    notReadyStageIds,
    previouslyPassingStageIds,
    sourceResultPath: input.resultPath,
    copiedResultPath: input.copiedResultPath,
  };
}

function protectedPatterns(
  config: OrchestratorConfig,
  protectedFiles: readonly ProtectedFileRecord[],
): readonly string[] {
  return enforcementProtectedPatterns(config, protectedFiles);
}

export async function verifyMilestone(input: {
  readonly runId: string;
  readonly proposal: MilestoneProposal;
  readonly attempt: number;
  readonly workspacePath: string;
  readonly baseCommit: string;
  readonly config: OrchestratorConfig;
  readonly protectedFiles: readonly ProtectedFileRecord[];
  readonly artifactDirectory: string;
  readonly readinessHistory?: ReadinessHistoryEvidence;
  readonly executeCommand?: typeof runCommand;
  readonly telemetry?: TelemetryStore;
}): Promise<VerificationSummary> {
  const startedAt = new Date();
  await mkdir(input.artifactDirectory, { recursive: true });
  const inspection = inspectAttempt(input.workspacePath, input.baseCommit);
  const startIdentity = candidateIdentityFrom(input.baseCommit, inspection);
  const artifacts = [
    resolve(input.artifactDirectory, "verification-summary.json"),
  ];
  if (input.proposal.schemaVersion !== MILESTONE_SCHEMA_VERSION) {
    const summary: VerificationSummary = {
      schemaVersion: VERIFICATION_SUMMARY_SCHEMA_VERSION,
      attempt: input.attempt,
      status: "FAIL",
      disposition: "rejected",
      failureKind: "policy",
      summary: `Milestone proposal uses schema ${input.proposal.schemaVersion}; verification requires ${MILESTONE_SCHEMA_VERSION}. Re-plan the milestone — legacy proposals are never auto-migrated.`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      commands: [],
      authoritative: null,
      candidate: startIdentity,
      authoritativeResultSha256: null,
      changedPaths: inspection.changedPaths,
      artifactPaths: artifacts,
    };
    await atomicWriteJson(artifacts[0] ?? "", summary);
    return summary;
  }
  if (!inspection.clean || inspection.commits.length === 0) {
    const summary: VerificationSummary = {
      schemaVersion: VERIFICATION_SUMMARY_SCHEMA_VERSION,
      attempt: input.attempt,
      status: "FAIL",
      disposition: "rejected",
      failureKind: "product",
      summary: !inspection.clean
        ? "Worker tree is not clean; the milestone commit is incomplete."
        : "Worker created no milestone commit.",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      commands: [],
      authoritative: null,
      candidate: startIdentity,
      authoritativeResultSha256: null,
      changedPaths: inspection.changedPaths,
      artifactPaths: artifacts,
    };
    await atomicWriteJson(artifacts[0] ?? "", summary);
    return summary;
  }
  const diffPolicy = enforceDiffPolicy(
    inspection.changedPaths,
    input.proposal,
    protectedPatterns(input.config, input.protectedFiles),
  );
  if (!diffPolicy.allowed) {
    const summary: VerificationSummary = {
      schemaVersion: VERIFICATION_SUMMARY_SCHEMA_VERSION,
      attempt: input.attempt,
      status: "FAIL",
      disposition: "rejected",
      failureKind: "policy",
      summary: `Diff policy rejected protected=[${diffPolicy.protectedChanges.join(", ")}] out-of-scope=[${diffPolicy.outOfScopeChanges.join(", ")}].`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      commands: [],
      authoritative: null,
      candidate: startIdentity,
      authoritativeResultSha256: null,
      changedPaths: inspection.changedPaths,
      artifactPaths: artifacts,
    };
    await atomicWriteJson(artifacts[0] ?? "", summary);
    return summary;
  }

  const commandResults: CommandExecutionSummary[] = [];
  let authoritative: AuthoritativeVerificationSummary | null = null;
  let authoritativeResultSha256: string | null = null;
  let parseError: string | null = null;
  const verifyId = verificationRunId(
    input.runId,
    input.proposal.id,
    input.attempt,
  );
  // Binds every command receipt to run × milestone × attempt × verified
  // candidate; a receipt from any other stage or candidate cannot validate.
  const stageId = `milestone-verify-${verifyId}-${startIdentity.commit.slice(0, 12)}`;
  for (const [
    commandIndex,
    command,
  ] of input.proposal.verificationCommands.entries()) {
    const directoryName = `${String(commandIndex + 1).padStart(2, "0")}-${command.id.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`;
    const commandRoot = resolve(
      input.artifactDirectory,
      "commands",
      directoryName,
    );
    const evidenceRoot = resolve(commandRoot, "evidence");
    const effectiveCommand: VerificationCommand =
      command.parser === "pnpm-verify"
        ? {
            ...command,
            args: [...command.args, "--", "--run-id", verifyId],
          }
        : command;
    let result = await (input.executeCommand ?? runCommand)(effectiveCommand, {
      workingDirectory: input.workspacePath,
      artifactDirectory: resolve(commandRoot, "logs"),
      timeoutMs: input.config.limits.commandMs,
      outputLimitBytes: input.config.limits.commandOutputLimitBytes,
      killGraceMs: input.config.limits.commandKillGraceMs,
      // pnpm-verify commands are deliberately not env-injected: the aggregate
      // owns its children's evidence environment, and its receipt is the
      // independently parsed authoritative result tree.
      ...(command.parser === "exit-code"
        ? {
            extraEnvironment: {
              LOOP_VERIFY_STAGE_ID: stageId,
              LOOP_VERIFY_COMMAND_ID: command.id,
              LOOP_VERIFY_COMMAND_ARTIFACT_DIR: evidenceRoot,
            },
          }
        : {}),
      ...(input.telemetry
        ? {
            telemetry: {
              store: input.telemetry,
              phase: "verification" as const,
              candidate: {
                baseCommit: input.baseCommit,
                commit: inspection.headCommit,
                tree: inspection.tree,
                dirty: !inspection.clean,
              },
              checkSetId: input.proposal.id,
              selectedCheckIds: input.proposal.verificationCommands.map(
                (entry) => entry.id,
              ),
              actualCheckIds: input.proposal.verificationCommands.map(
                (entry) => entry.id,
              ),
              retryAttempt: input.attempt,
            },
          }
        : {}),
    });
    if (command.parser === "exit-code") {
      if (existsSync(resolve(evidenceRoot, "result.json"))) {
        try {
          const validated = await validateCommandReceiptDirectory({
            directory: evidenceRoot,
            expectedStageId: stageId,
            expectedCommandId: command.id,
            requiredKinds: command.expectedArtifactKinds ?? [],
          });
          result = {
            ...result,
            receipt: {
              path: relative(
                input.artifactDirectory,
                validated.receiptPath,
              ).replaceAll("\\", "/"),
              sha256: validated.receiptSha256,
              bytes: validated.receiptBytes,
            },
            receiptAbsenceReason: null,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          result = {
            ...result,
            status: "ERROR",
            message,
            receipt: null,
            receiptAbsenceReason: message,
          };
        }
      } else if (result.status === "PASS") {
        const message = `Passing check ${command.id} did not write its required command-owned receipt.`;
        result = {
          ...result,
          status: "ERROR",
          message,
          receipt: null,
          receiptAbsenceReason: message,
        };
      } else {
        result = {
          ...result,
          receipt: null,
          receiptAbsenceReason:
            "The command did not pass; failing commands retain no receipt.",
        };
      }
    } else {
      result = {
        ...result,
        receipt: null,
        receiptAbsenceReason:
          "Authoritative pnpm verify evidence is the independently parsed result tree.",
      };
    }
    if (
      command.parser === "pnpm-verify" &&
      result.signal === null &&
      ((result.status === "PASS" && result.exitCode === 0) ||
        (result.status === "FAIL" && result.exitCode === 2))
    ) {
      const source = resolve(
        input.workspacePath,
        "artifacts",
        verifyId,
        "result.json",
      );
      const copied = resolve(
        input.artifactDirectory,
        "authoritative-verify-result.json",
      );
      try {
        authoritative = await parseAuthoritativeVerification({
          workspacePath: input.workspacePath,
          expectedCommit: inspection.headCommit,
          expectedTree: inspection.tree,
          expectedRunId: verifyId,
          observedExitCode: result.exitCode,
          resultPath: source,
          copiedResultPath: copied,
          ...(input.readinessHistory
            ? { readinessHistory: input.readinessHistory }
            : {}),
        });
        authoritativeResultSha256 = createHash("sha256")
          .update(await readFile(copied))
          .digest("hex");
        result = {
          ...result,
          status:
            authoritative.disposition === "incremental-readiness"
              ? "NOT_READY"
              : "PASS",
          message:
            authoritative.disposition === "incremental-readiness"
              ? "Authoritative pnpm verify remained NOT_READY and was accepted only as monotonic incremental readiness evidence."
              : result.message,
          parsedArtifactPath: copied,
        };
        artifacts.push(copied);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
        result = {
          ...result,
          status: "ERROR",
          message: parseError,
          parsedArtifactPath: null,
        };
      }
      // The authoritative verifier and its dispatch inputs must still be the
      // recorded trust roots after the command that just ran them.
      await assertProtectedFiles(input.workspacePath, input.protectedFiles);
    }
    commandResults.push(result);
  }

  await assertProtectedFiles(input.workspacePath, input.protectedFiles);
  const finalInspection = inspectAttempt(input.workspacePath, input.baseCommit);
  const finalIdentity = candidateIdentityFrom(
    input.baseCommit,
    finalInspection,
  );
  const changedDuringVerification = !candidateIdentitiesEqual(
    startIdentity,
    finalIdentity,
  );
  const commandFailure = commandResults.find(
    (command) =>
      command.status !== "PASS" &&
      !(
        command.parser === "pnpm-verify" &&
        command.status === "NOT_READY" &&
        authoritative?.disposition === "incremental-readiness"
      ),
  );
  // Belt check behind the per-command gate: a passing focused command whose
  // receipt was never validated can never yield a passing summary.
  const passWithoutReceipt = commandResults.find(
    (command) =>
      command.parser === "exit-code" &&
      command.status === "PASS" &&
      command.receipt === null,
  );
  const status =
    !commandFailure &&
    !passWithoutReceipt &&
    !changedDuringVerification &&
    authoritative
      ? "PASS"
      : "FAIL";
  const failureKind =
    status === "PASS"
      ? null
      : parseError ||
          passWithoutReceipt ||
          commandFailure?.status === "ERROR" ||
          commandFailure?.status === "TIMEOUT"
        ? "infrastructure"
        : changedDuringVerification
          ? "policy"
          : "product";
  const summary: VerificationSummary = {
    schemaVersion: VERIFICATION_SUMMARY_SCHEMA_VERSION,
    attempt: input.attempt,
    status,
    disposition: authoritative?.disposition ?? "rejected",
    failureKind,
    summary:
      status === "PASS"
        ? authoritative?.disposition === "incremental-readiness"
          ? `Focused milestone checks passed; authoritative readiness verification remains NOT_READY with ${authoritative.validatedArtifactCount} independently validated artifacts and no recorded stage regression.`
          : `All ${commandResults.length} commands passed with ${authoritative?.validatedArtifactCount ?? 0} independently validated authoritative artifacts.`
        : (parseError ??
          (changedDuringVerification
            ? "Verification changed tracked attempt state or HEAD."
            : passWithoutReceipt
              ? `Command ${passWithoutReceipt.id} passed without a validated command-owned receipt.`
              : (commandFailure?.message ?? "Verification failed."))),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    commands: commandResults,
    authoritative,
    candidate: finalIdentity,
    authoritativeResultSha256,
    changedPaths: inspection.changedPaths,
    artifactPaths: artifacts,
  };
  await atomicWriteJson(artifacts[0] ?? "", summary);
  return summary;
}
