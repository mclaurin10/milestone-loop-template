import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BOOTSTRAP_VERIFICATION_STAGE_IDS,
  READINESS_VERIFICATION_STAGE_IDS,
} from "./contracts.js";
import type {
  CommandExecutionSummary,
  MilestoneProposal,
  ReadinessHistoryEvidence,
} from "./contracts.js";
import { loadConfig } from "./config.js";
import { parseAuthoritativeVerification, verifyMilestone } from "./verifier.js";

type FixtureStatus = "PASS" | "NOT_READY" | "FAIL" | "ERROR";

interface FixtureArtifact {
  path: string;
  kind: string;
  bytes: number;
  sha256: string;
}

interface FixtureReceiptCheck {
  id: string;
  status: "PASS";
  summary: string;
}

interface FixtureReceipt {
  schemaVersion: string;
  stageId: string;
  commandId: string;
  status: "PASS";
  checks: FixtureReceiptCheck[];
  artifacts: FixtureArtifact[];
}

interface FixtureEvidence {
  receipt?: string;
  valid: boolean;
  message: string;
  checks: FixtureReceiptCheck[];
  artifacts: FixtureArtifact[];
}

interface FixtureCommand {
  script: string;
  displayCommand: string;
  status: FixtureStatus;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  log: string | null;
  artifactDirectory?: string;
  evidence: FixtureEvidence | null;
  message: string;
}

interface FixtureCheck {
  id: string;
  status: FixtureStatus;
  message: string;
}

interface FixtureStage {
  id: string;
  required: boolean;
  status: FixtureStatus;
  checks: FixtureCheck[];
  commands: FixtureCommand[];
}

interface FixtureResult {
  schemaVersion: string;
  runId: string;
  status: FixtureStatus;
  exitCode: number;
  artifactRoot: string;
  profile: {
    id: "bootstrap" | "readiness";
    configuredDefault: "bootstrap" | "readiness";
    selectedByOverride: boolean;
    autonomousReadinessEquivalent: boolean;
  };
  completion: {
    claim: "bootstrap_complete" | "autonomous_readiness";
    eligible: boolean;
    reasons: string[];
  };
  candidate: { gitCommit: string; gitTree: string; workingTreeDirty: boolean };
  summary: {
    requiredStageCount: number;
    stageCounts: Record<FixtureStatus, number>;
  };
  stages: FixtureStage[];
}

interface VerificationFixture {
  workspace: string;
  runRoot: string;
  profile: "bootstrap" | "readiness";
  runId: string;
  commit: string;
  resultPath: string;
  copiedResultPath: string;
  receipts: Map<string, FixtureReceipt>;
  result: FixtureResult;
  persist: () => Promise<void>;
}

interface StageContract {
  scripts: readonly string[];
  requiredKinds: readonly string[];
}

const STAGE_CONTRACTS: Readonly<Record<string, StageContract>> = {
  environment: {
    scripts: ["verify:dependencies"],
    requiredKinds: ["dependency-report"],
  },
  "format-lint": {
    scripts: ["format:check", "lint", "lint:architecture"],
    requiredKinds: ["format-report", "lint-report", "architecture-report"],
  },
  typecheck: {
    scripts: ["typecheck"],
    requiredKinds: ["typecheck-report"],
  },
  "production-build": {
    scripts: ["build"],
    requiredKinds: ["build-report"],
  },
  "bootstrap-tests": {
    scripts: ["test:unit"],
    requiredKinds: ["vitest-report"],
  },
  "bootstrap-simulation": {
    scripts: ["verify:bootstrap:simulation"],
    requiredKinds: [
      "node-checkpoints",
      "worker-checkpoints",
      "player-action-log",
      "replay-report",
      "parity-report",
    ],
  },
  "bootstrap-persistence": {
    scripts: ["verify:bootstrap:persistence"],
    requiredKinds: ["save-envelope", "save-roundtrip-report"],
  },
  "bootstrap-browser": {
    scripts: ["verify:bootstrap:browser"],
    requiredKinds: [
      "playwright-report",
      "screenshot",
      "browser-diagnostics",
      "visual-review",
    ],
  },
  "unit-domain": {
    scripts: ["test:unit", "test:domain"],
    requiredKinds: ["vitest-report", "domain-test-report"],
  },
  "determinism-replay": {
    scripts: ["verify:determinism", "verify:parity", "verify:replay"],
    requiredKinds: ["determinism-report", "parity-report", "replay-report"],
  },
  "save-load": {
    scripts: ["verify:save"],
    requiredKinds: ["save-validation-report"],
  },
  "headless-scenarios": {
    scripts: ["verify:headless"],
    requiredKinds: ["headless-report"],
  },
  "bot-playtesting": {
    scripts: ["benchmark:bot", "benchmark:visible-seeds"],
    requiredKinds: ["bot-benchmark-report", "visible-seed-report"],
  },
  "browser-interaction": {
    scripts: ["verify:browser"],
    requiredKinds: ["browser-interaction-report"],
  },
  "playwright-evidence": {
    scripts: ["verify:visual"],
    requiredKinds: ["visual-evidence-index"],
  },
  "browser-diagnostics": {
    scripts: ["verify:browser-diagnostics"],
    requiredKinds: ["browser-diagnostics"],
  },
  performance: {
    scripts: ["verify:performance"],
    requiredKinds: ["performance-report"],
  },
  "acceptance-manifest": {
    scripts: ["verify:acceptance"],
    requiredKinds: ["acceptance-report"],
  },
  "contract-integrity": { scripts: [], requiredKinds: [] },
};

const INCREMENTAL_PASSING_STAGE_IDS = new Set([
  "environment",
  "format-lint",
  "typecheck",
  "production-build",
  "unit-domain",
  "contract-integrity",
]);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function counts(
  stages: readonly FixtureStage[],
): Record<FixtureStatus, number> {
  return {
    PASS: stages.filter((stage) => stage.status === "PASS").length,
    NOT_READY: stages.filter((stage) => stage.status === "NOT_READY").length,
    FAIL: stages.filter((stage) => stage.status === "FAIL").length,
    ERROR: stages.filter((stage) => stage.status === "ERROR").length,
  };
}

function git(repository: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}

function commandRoot(
  stageId: string,
  commandId: string,
  index: number,
): string {
  return `stages/${stageId}/${String(index + 1).padStart(2, "0")}-${commandId.replaceAll(":", "-")}`;
}

function commandLog(stageId: string, commandId: string, index: number): string {
  return `logs/${stageId}-${String(index + 1).padStart(2, "0")}-${commandId.replaceAll(":", "-")}.log`;
}

function milestoneProposal(id: string): MilestoneProposal {
  return {
    schemaVersion: "1.0.0",
    id,
    title: "Incremental readiness fixture",
    kind: "tooling",
    objective: "Verify one bounded candidate.",
    rationale: "Exercise persisted incremental evidence.",
    dependencies: [],
    permittedPaths: ["change.txt"],
    exclusions: ["No gameplay.", "No scope reduction."],
    acceptanceCriteria: [
      {
        id: "FIXTURE-01",
        description: "Incremental evidence is persisted.",
        evidence: "verification-summary.json",
      },
    ],
    requiredTests: ["pnpm verify"],
    verificationCommands: [
      {
        id: "authoritative-verification",
        executable: "pnpm",
        args: ["verify"],
        parser: "pnpm-verify",
      },
    ],
    expectedArtifacts: ["verification/verification-summary.json"],
    terminalConditions: ["Reject unsafe evidence."],
    estimatedFileCount: 1,
    requiresBrowserInspection: false,
    requiresHeadlessEvaluation: false,
    hiddenValidation: { requested: false },
  };
}

function commandSummary(
  overrides: Partial<CommandExecutionSummary> = {},
): CommandExecutionSummary {
  return {
    id: "authoritative-verification",
    displayCommand: "pnpm verify -- --run-id fixture",
    status: "FAIL",
    exitCode: 2,
    signal: null,
    startedAt: "2026-08-01T00:00:00.000Z",
    finishedAt: "2026-08-01T00:00:01.000Z",
    durationMs: 1000,
    stdoutPath: "commands/authoritative.stdout.log",
    stderrPath: "commands/authoritative.stderr.log",
    stdoutSha256: createHash("sha256").update("").digest("hex"),
    stderrSha256: createHash("sha256").update("").digest("hex"),
    parser: "pnpm-verify",
    parsedArtifactPath: null,
    message: "Command exited 2.",
    ...overrides,
  };
}

async function passingCommand(
  runRoot: string,
  stageId: string,
  commandId: string,
  index: number,
  requiredKinds: readonly string[],
  receipts: Map<string, FixtureReceipt>,
): Promise<FixtureCommand> {
  const relativeRoot = commandRoot(stageId, commandId, index);
  const kinds =
    index === 0
      ? requiredKinds
      : [`${commandId.replaceAll(":", "-")}-supporting-evidence`];
  const artifacts: FixtureArtifact[] = [];
  for (const [artifactIndex, kind] of kinds.entries()) {
    const path = `artifact-${String(artifactIndex + 1).padStart(2, "0")}.json`;
    const contents = `${JSON.stringify({ stageId, commandId, kind })}\n`;
    await mkdir(join(runRoot, ...relativeRoot.split("/")), { recursive: true });
    await writeFile(
      join(runRoot, ...relativeRoot.split("/"), path),
      contents,
      "utf8",
    );
    artifacts.push({
      path,
      kind,
      bytes: Buffer.byteLength(contents),
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  const checks: FixtureReceiptCheck[] = [
    {
      id: `${commandId}-receipt-check`,
      status: "PASS",
      summary: `Validated ${commandId}.`,
    },
  ];
  const receiptPath = `${relativeRoot}/result.json`;
  receipts.set(receiptPath, {
    schemaVersion: "1.0.0",
    stageId,
    commandId,
    status: "PASS",
    checks: checks.map((check) => ({ ...check })),
    artifacts: artifacts.map((artifact) => ({ ...artifact })),
  });
  return {
    script: commandId,
    displayCommand: `pnpm run ${commandId}`,
    status: "PASS",
    exitCode: 0,
    signal: null,
    durationMs: 10,
    log: commandLog(stageId, commandId, index),
    artifactDirectory: relativeRoot,
    evidence: {
      receipt: receiptPath,
      valid: true,
      message: "Command passed with validated evidence.",
      checks,
      artifacts: artifacts.map((artifact) => ({
        ...artifact,
        path: `${relativeRoot}/${artifact.path}`,
      })),
    },
    message: "Command passed with validated evidence.",
  };
}

function notReadyCommand(
  stageId: string,
  commandId: string,
  index: number,
): FixtureCommand {
  void stageId;
  void index;
  return {
    script: commandId,
    displayCommand: `pnpm run ${commandId}`,
    status: "NOT_READY",
    exitCode: null,
    signal: null,
    durationMs: 1,
    log: null,
    evidence: null,
    message: `Required package script "${commandId}" is not defined.`,
  };
}

async function fixtureStage(
  runRoot: string,
  id: string,
  status: FixtureStatus,
  receipts: Map<string, FixtureReceipt>,
): Promise<FixtureStage> {
  const contract = STAGE_CONTRACTS[id];
  if (!contract) throw new Error(`Missing fixture contract for ${id}.`);
  if (id === "contract-integrity")
    return {
      id,
      required: true,
      status,
      checks: [{ id: "contract-check", status, message: "Contract checked." }],
      commands: [],
    };
  const commands: FixtureCommand[] = [];
  for (const [index, commandId] of contract.scripts.entries()) {
    commands.push(
      status === "PASS"
        ? await passingCommand(
            runRoot,
            id,
            commandId,
            index,
            contract.requiredKinds,
            receipts,
          )
        : notReadyCommand(id, commandId, index),
    );
  }
  return {
    id,
    required: true,
    status,
    checks:
      status === "PASS"
        ? [
            {
              id: "required-artifact-kinds",
              status: "PASS",
              message: "Required artifact kinds are present.",
            },
          ]
        : [],
    commands,
  };
}

async function createFixture(input: {
  profile: "bootstrap" | "readiness";
  status: "PASS" | "NOT_READY";
  runId?: string;
}): Promise<VerificationFixture> {
  const workspace = await mkdtemp(join(tmpdir(), "ski-loop-verify-"));
  temporaryDirectories.push(workspace);
  const runId =
    input.runId ?? `verify-${input.profile}-${input.status.toLowerCase()}`;
  const runRoot = join(workspace, "artifacts", runId);
  await mkdir(runRoot, { recursive: true });
  const receipts = new Map<string, FixtureReceipt>();
  const stageIds =
    input.profile === "readiness"
      ? READINESS_VERIFICATION_STAGE_IDS
      : BOOTSTRAP_VERIFICATION_STAGE_IDS;
  const stages: FixtureStage[] = [];
  for (const id of stageIds) {
    stages.push(
      await fixtureStage(
        runRoot,
        id,
        input.status === "PASS" || INCREMENTAL_PASSING_STAGE_IDS.has(id)
          ? "PASS"
          : "NOT_READY",
        receipts,
      ),
    );
  }
  const commit = "a".repeat(40);
  const result: FixtureResult = {
    schemaVersion: "2.0.0",
    runId,
    status: input.status,
    exitCode: input.status === "PASS" ? 0 : 2,
    artifactRoot: `artifacts/${runId}`,
    profile: {
      id: input.profile,
      configuredDefault: input.profile,
      selectedByOverride: false,
      autonomousReadinessEquivalent: input.profile === "readiness",
    },
    completion: {
      claim:
        input.profile === "readiness"
          ? "autonomous_readiness"
          : "bootstrap_complete",
      eligible: input.status === "PASS",
      reasons: input.status === "PASS" ? [] : ["verification_status_not_pass"],
    },
    candidate: {
      gitCommit: commit,
      gitTree: "c".repeat(40),
      workingTreeDirty: false,
    },
    summary: {
      requiredStageCount: stages.length,
      stageCounts: counts(stages),
    },
    stages,
  };
  const resultPath = join(runRoot, "result.json");
  const copiedResultPath = join(workspace, "copied-result.json");
  return {
    workspace,
    runRoot,
    profile: input.profile,
    runId,
    commit,
    resultPath,
    copiedResultPath,
    receipts,
    result,
    persist: async () => {
      result.summary.requiredStageCount = result.stages.length;
      result.summary.stageCounts = counts(result.stages);
      for (const [relativeReceiptPath, receipt] of receipts) {
        const segments = relativeReceiptPath.split("/");
        const fileName = segments.pop();
        if (!fileName) throw new Error("Fixture receipt path is empty.");
        const directory = join(runRoot, ...segments);
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, fileName),
          `${JSON.stringify(receipt, null, 2)}\n`,
          "utf8",
        );
      }
      await writeFile(
        resultPath,
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
      );
    },
  };
}

interface ParseFixtureInput {
  expectedCommit?: string;
  expectedTree?: string;
  expectedRunId?: string;
  observedExitCode?: number;
  readinessHistory?: ReadinessHistoryEvidence | null;
}

function parseFixture(
  fixture: VerificationFixture,
  input: ParseFixtureInput = {},
) {
  const defaultReadinessHistory: ReadinessHistoryEvidence | undefined =
    fixture.profile === "readiness"
      ? {
          mode: "first-readiness-transition",
          previouslyPassingStageIds: [],
        }
      : undefined;
  const readinessHistory =
    input.readinessHistory === null
      ? undefined
      : (input.readinessHistory ?? defaultReadinessHistory);
  return parseAuthoritativeVerification({
    workspacePath: fixture.workspace,
    expectedCommit: input.expectedCommit ?? fixture.commit,
    ...(input.expectedTree ? { expectedTree: input.expectedTree } : {}),
    expectedRunId: input.expectedRunId ?? fixture.runId,
    observedExitCode: input.observedExitCode ?? fixture.result.exitCode,
    resultPath: fixture.resultPath,
    copiedResultPath: fixture.copiedResultPath,
    ...(readinessHistory ? { readinessHistory } : {}),
  });
}

function stage(fixture: VerificationFixture, id: string): FixtureStage {
  const found = fixture.result.stages.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing fixture stage ${id}.`);
  return found;
}

function setStageStatus(
  fixture: VerificationFixture,
  id: string,
  status: FixtureStatus,
): void {
  const target = stage(fixture, id);
  target.status = status;
  for (const check of target.checks) check.status = status;
  for (const command of target.commands) {
    command.status = status;
    command.evidence = null;
    command.signal = null;
    if (status === "NOT_READY") {
      command.exitCode = null;
      command.log = null;
      delete command.artifactDirectory;
    } else {
      command.exitCode = status === "FAIL" ? 1 : 3;
    }
  }
}

function firstPassingCommand(fixture: VerificationFixture): FixtureCommand {
  const command = fixture.result.stages
    .flatMap((entry) => entry.commands)
    .find((entry) => entry.status === "PASS");
  if (!command) throw new Error("Fixture has no passing command.");
  return command;
}

function receiptForCommand(
  fixture: VerificationFixture,
  command: FixtureCommand,
): FixtureReceipt {
  const receiptPath = command.evidence?.receipt;
  if (!receiptPath) throw new Error("Fixture command has no receipt path.");
  const receipt = fixture.receipts.get(receiptPath);
  if (!receipt) throw new Error(`Fixture receipt ${receiptPath} is missing.`);
  return receipt;
}

function firstArtifact(fixture: VerificationFixture): {
  command: FixtureCommand;
  receipt: FixtureReceipt;
  receiptArtifact: FixtureArtifact;
  retainedArtifact: FixtureArtifact;
} {
  const command = firstPassingCommand(fixture);
  const receipt = receiptForCommand(fixture, command);
  const receiptArtifact = receipt.artifacts[0];
  const retainedArtifact = command.evidence?.artifacts[0];
  if (!receiptArtifact || !retainedArtifact)
    throw new Error("Fixture command has no artifact.");
  return { command, receipt, receiptArtifact, retainedArtifact };
}

function validatedFixtureArtifactCount(fixture: VerificationFixture): number {
  return fixture.result.stages
    .flatMap((entry) => entry.commands)
    .filter((command) => command.status === "PASS")
    .reduce(
      (count, command) => count + (command.evidence?.artifacts.length ?? 0),
      0,
    );
}

async function prepareCommittedFixture(
  fixture: VerificationFixture,
): Promise<{ baseCommit: string; candidateCommit: string }> {
  git(fixture.workspace, "init", "-b", "main");
  git(fixture.workspace, "config", "user.name", "Verifier Test");
  git(fixture.workspace, "config", "user.email", "verifier@example.invalid");
  await writeFile(
    join(fixture.workspace, ".gitignore"),
    "artifacts/\n",
    "utf8",
  );
  await writeFile(join(fixture.workspace, "change.txt"), "base\n", "utf8");
  git(fixture.workspace, "add", ".gitignore", "change.txt");
  git(fixture.workspace, "commit", "-m", "base");
  const baseCommit = git(fixture.workspace, "rev-parse", "HEAD");
  await writeFile(
    join(fixture.workspace, "change.txt"),
    "readiness increment\n",
    "utf8",
  );
  git(fixture.workspace, "add", "change.txt");
  git(fixture.workspace, "commit", "-m", "increment");
  const candidateCommit = git(fixture.workspace, "rev-parse", "HEAD");
  fixture.commit = candidateCommit;
  fixture.result.candidate.gitCommit = candidateCommit;
  await fixture.persist();
  return { baseCommit, candidateCommit };
}

describe("authoritative verifier result parsing", () => {
  it.each(["bootstrap", "readiness"] as const)(
    "accepts exact completion-eligible %s PASS evidence",
    async (profile) => {
      const fixture = await createFixture({ profile, status: "PASS" });
      await fixture.persist();

      const summary = await parseFixture(fixture);

      expect(summary).toMatchObject({
        status: "PASS",
        exitCode: 0,
        disposition: "completion-eligible",
        profileId: profile,
        completionEligible: true,
        profileAutonomousReadinessEquivalent: profile === "readiness",
        autonomousReadinessEquivalent: profile === "readiness",
        readinessHistoryMode:
          profile === "readiness"
            ? "first-readiness-transition"
            : "not-applicable",
        candidateCommit: fixture.commit,
        notReadyStageIds: [],
        validatedArtifactCount: validatedFixtureArtifactCount(fixture),
      });
      expect(summary.passingStageIds).toHaveLength(
        profile === "readiness"
          ? READINESS_VERIFICATION_STAGE_IDS.length
          : BOOTSTRAP_VERIFICATION_STAGE_IDS.length,
      );
    },
    15_000,
  );

  it("accepts monotonic readiness NOT_READY only as incremental evidence", async () => {
    const fixture = await createFixture({
      profile: "readiness",
      status: "NOT_READY",
    });
    await fixture.persist();

    const summary = await parseFixture(fixture, {
      readinessHistory: {
        mode: "durable-records",
        previouslyPassingStageIds: ["unit-domain"],
      },
    });

    expect(summary).toMatchObject({
      status: "NOT_READY",
      exitCode: 2,
      disposition: "incremental-readiness",
      profileId: "readiness",
      completionClaim: "autonomous_readiness",
      completionEligible: false,
      profileAutonomousReadinessEquivalent: true,
      autonomousReadinessEquivalent: false,
      readinessHistoryMode: "durable-records",
      candidateCommit: fixture.commit,
      validatedArtifactCount: validatedFixtureArtifactCount(fixture),
      previouslyPassingStageIds: ["unit-domain"],
    });
    expect(summary.passingStageIds).toEqual([
      "environment",
      "format-lint",
      "typecheck",
      "production-build",
      "unit-domain",
      "contract-integrity",
    ]);
    expect(summary.notReadyStageIds).toContain("acceptance-manifest");
    const copied = JSON.parse(
      await readFile(fixture.copiedResultPath, "utf8"),
    ) as { status: string; completion: { eligible: boolean } };
    expect(copied).toMatchObject({
      status: "NOT_READY",
      completion: { eligible: false },
    });
  });

  it("persists distinct accepted-milestone and source NOT_READY fields", async () => {
    const controllerRunId = "controller-run";
    const milestoneId = "incremental-fixture";
    const authoritativeRunId = `${controllerRunId}-${milestoneId}-a1-verify`;
    const fixture = await createFixture({
      profile: "readiness",
      status: "NOT_READY",
      runId: authoritativeRunId,
    });
    const { baseCommit } = await prepareCommittedFixture(fixture);
    const artifactDirectory = join(
      fixture.workspace,
      "artifacts",
      "controller-evidence",
    );

    const summary = await verifyMilestone({
      runId: controllerRunId,
      proposal: milestoneProposal(milestoneId),
      attempt: 1,
      workspacePath: fixture.workspace,
      baseCommit,
      config: await loadConfig(process.cwd()),
      protectedFiles: [],
      artifactDirectory,
      readinessHistory: {
        mode: "durable-records",
        previouslyPassingStageIds: ["unit-domain"],
      },
      executeCommand: async () => commandSummary(),
    });

    expect(summary).toMatchObject({
      status: "PASS",
      disposition: "incremental-readiness",
      failureKind: null,
      commands: [{ status: "NOT_READY", exitCode: 2 }],
      authoritative: {
        status: "NOT_READY",
        disposition: "incremental-readiness",
        completionEligible: false,
        autonomousReadinessEquivalent: false,
        readinessHistoryMode: "durable-records",
        previouslyPassingStageIds: ["unit-domain"],
      },
    });
    const persisted = JSON.parse(
      await readFile(
        join(artifactDirectory, "verification-summary.json"),
        "utf8",
      ),
    ) as unknown;
    expect(persisted).toMatchObject({
      status: "PASS",
      disposition: "incremental-readiness",
      commands: [{ status: "NOT_READY", exitCode: 2 }],
      authoritative: {
        status: "NOT_READY",
        completionEligible: false,
        autonomousReadinessEquivalent: false,
        readinessHistoryMode: "durable-records",
      },
    });
  }, 15_000);

  it("preserves a raw TIMEOUT even when exit 2 and result.json are present", async () => {
    const controllerRunId = "controller-timeout";
    const milestoneId = "timeout-fixture";
    const fixture = await createFixture({
      profile: "readiness",
      status: "NOT_READY",
      runId: `${controllerRunId}-${milestoneId}-a1-verify`,
    });
    const { baseCommit } = await prepareCommittedFixture(fixture);
    const artifactDirectory = join(
      fixture.workspace,
      "artifacts",
      "controller-timeout-evidence",
    );

    const summary = await verifyMilestone({
      runId: controllerRunId,
      proposal: milestoneProposal(milestoneId),
      attempt: 1,
      workspacePath: fixture.workspace,
      baseCommit,
      config: await loadConfig(process.cwd()),
      protectedFiles: [],
      artifactDirectory,
      readinessHistory: {
        mode: "first-readiness-transition",
        previouslyPassingStageIds: [],
      },
      executeCommand: async () =>
        commandSummary({
          status: "TIMEOUT",
          exitCode: 2,
          message: "Command timed out.",
        }),
    });

    expect(summary).toMatchObject({
      status: "FAIL",
      disposition: "rejected",
      failureKind: "infrastructure",
      commands: [{ status: "TIMEOUT", exitCode: 2 }],
      authoritative: null,
    });
  }, 15_000);

  const unsafeCases: readonly {
    name: string;
    mutate: (fixture: VerificationFixture) => void;
    parseInput?: ParseFixtureInput;
  }[] = [
    {
      name: "dirty candidate",
      mutate: (fixture) => {
        fixture.result.candidate.workingTreeDirty = true;
      },
    },
    {
      name: "mismatched candidate",
      mutate: () => undefined,
      parseInput: { expectedCommit: "b".repeat(40) },
    },
    {
      name: "mismatched candidate tree",
      mutate: () => undefined,
      parseInput: { expectedTree: "d".repeat(40) },
    },
    {
      name: "mismatched run identity",
      mutate: () => undefined,
      parseInput: { expectedRunId: "different-run" },
    },
    {
      name: "profile override",
      mutate: (fixture) => {
        fixture.result.profile.selectedByOverride = true;
      },
    },
    {
      name: "non-readiness configured default",
      mutate: (fixture) => {
        fixture.result.profile.configuredDefault = "bootstrap";
      },
    },
    {
      name: "malformed schema",
      mutate: (fixture) => {
        fixture.result.schemaVersion = "1.0.0";
      },
    },
    {
      name: "mismatched process exit",
      mutate: () => undefined,
      parseInput: { observedExitCode: 0 },
    },
    {
      name: "failing stage",
      mutate: (fixture) => setStageStatus(fixture, "save-load", "FAIL"),
    },
    {
      name: "failing protected-integrity stage",
      mutate: (fixture) =>
        setStageStatus(fixture, "contract-integrity", "FAIL"),
    },
    {
      name: "erroneous stage",
      mutate: (fixture) => setStageStatus(fixture, "save-load", "ERROR"),
    },
    {
      name: "foundation regression",
      mutate: (fixture) =>
        setStageStatus(fixture, "production-build", "NOT_READY"),
    },
    {
      name: "recorded readiness-stage regression",
      mutate: (fixture) => setStageStatus(fixture, "unit-domain", "NOT_READY"),
      parseInput: {
        readinessHistory: {
          mode: "durable-records",
          previouslyPassingStageIds: ["unit-domain"],
        },
      },
    },
    {
      name: "missing readiness stage",
      mutate: (fixture) => {
        fixture.result.stages.splice(6, 1);
      },
    },
    {
      name: "false completion eligibility",
      mutate: (fixture) => {
        fixture.result.completion.eligible = true;
      },
    },
    {
      name: "missing readiness history provenance",
      mutate: () => undefined,
      parseInput: { readinessHistory: null },
    },
    {
      name: "empty durable readiness history",
      mutate: () => undefined,
      parseInput: {
        readinessHistory: {
          mode: "durable-records",
          previouslyPassingStageIds: [],
        },
      },
    },
    {
      name: "nonempty first-transition history",
      mutate: () => undefined,
      parseInput: {
        readinessHistory: {
          mode: "first-readiness-transition",
          previouslyPassingStageIds: ["environment"],
        },
      },
    },
  ];

  it.each(unsafeCases)("rejects $name", async ({ mutate, parseInput }) => {
    const fixture = await createFixture({
      profile: "readiness",
      status: "NOT_READY",
    });
    mutate(fixture);
    await fixture.persist();
    await expect(parseFixture(fixture, parseInput)).rejects.toThrow(
      /ineligible|malformed|regression|history/,
    );
  });

  const receiptAndArtifactCases: readonly {
    name: string;
    mutate: (fixture: VerificationFixture) => void | Promise<void>;
  }[] = [
    {
      name: "absent command evidence",
      mutate: (fixture) => {
        firstPassingCommand(fixture).evidence = null;
      },
    },
    {
      name: "absent retained receipt path",
      mutate: (fixture) => {
        const evidence = firstPassingCommand(fixture).evidence;
        if (evidence) delete evidence.receipt;
      },
    },
    {
      name: "missing receipt file",
      mutate: (fixture) => {
        const command = firstPassingCommand(fixture);
        const receiptPath = command.evidence?.receipt;
        if (receiptPath) fixture.receipts.delete(receiptPath);
      },
    },
    {
      name: "wrong receipt schema",
      mutate: (fixture) => {
        receiptForCommand(fixture, firstPassingCommand(fixture)).schemaVersion =
          "0.0.0";
      },
    },
    {
      name: "wrong receipt stage identity",
      mutate: (fixture) => {
        receiptForCommand(fixture, firstPassingCommand(fixture)).stageId =
          "different-stage";
      },
    },
    {
      name: "wrong receipt command identity",
      mutate: (fixture) => {
        receiptForCommand(fixture, firstPassingCommand(fixture)).commandId =
          "different-command";
      },
    },
    {
      name: "empty receipt checks",
      mutate: (fixture) => {
        const command = firstPassingCommand(fixture);
        receiptForCommand(fixture, command).checks = [];
        if (command.evidence) command.evidence.checks = [];
      },
    },
    {
      name: "retained receipt-check mismatch",
      mutate: (fixture) => {
        const evidence = firstPassingCommand(fixture).evidence;
        if (evidence?.checks[0]) evidence.checks[0].summary = "Changed.";
      },
    },
    {
      name: "wrong command ID",
      mutate: (fixture) => {
        firstPassingCommand(fixture).script = "different-command";
      },
    },
    {
      name: "nonzero passing-command exit",
      mutate: (fixture) => {
        firstPassingCommand(fixture).exitCode = 2;
      },
    },
    {
      name: "wrong command artifact directory",
      mutate: (fixture) => {
        firstPassingCommand(fixture).artifactDirectory = "stages/shared";
      },
    },
    {
      name: "escaping receipt path",
      mutate: (fixture) => {
        const evidence = firstPassingCommand(fixture).evidence;
        if (evidence) evidence.receipt = "../outside-result.json";
      },
    },
    {
      name: "empty artifact declaration",
      mutate: (fixture) => {
        const command = firstPassingCommand(fixture);
        receiptForCommand(fixture, command).artifacts = [];
        if (command.evidence) command.evidence.artifacts = [];
      },
    },
    {
      name: "missing artifact file",
      mutate: (fixture) => {
        const { receiptArtifact, retainedArtifact, command } =
          firstArtifact(fixture);
        receiptArtifact.path = "missing.json";
        retainedArtifact.path = `${command.artifactDirectory}/missing.json`;
      },
    },
    {
      name: "escaping command-directory artifact path",
      mutate: async (fixture) => {
        const { receiptArtifact, retainedArtifact, command } =
          firstArtifact(fixture);
        const contents = '{"outside":true}\n';
        const outsidePath = join(
          fixture.runRoot,
          ...String(command.artifactDirectory).split("/").slice(0, -1),
          "outside.json",
        );
        await writeFile(outsidePath, contents, "utf8");
        receiptArtifact.path = "../outside.json";
        receiptArtifact.bytes = Buffer.byteLength(contents);
        receiptArtifact.sha256 = createHash("sha256")
          .update(contents)
          .digest("hex");
        retainedArtifact.path = `${command.artifactDirectory}/../outside.json`;
        retainedArtifact.bytes = receiptArtifact.bytes;
        retainedArtifact.sha256 = receiptArtifact.sha256;
      },
    },
    {
      name: "size-mismatched artifact",
      mutate: (fixture) => {
        const { receiptArtifact, retainedArtifact } = firstArtifact(fixture);
        receiptArtifact.bytes += 1;
        retainedArtifact.bytes = receiptArtifact.bytes;
      },
    },
    {
      name: "hash-mismatched artifact",
      mutate: (fixture) => {
        const { receiptArtifact, retainedArtifact } = firstArtifact(fixture);
        receiptArtifact.sha256 = "0".repeat(64);
        retainedArtifact.sha256 = receiptArtifact.sha256;
      },
    },
    {
      name: "retained artifact-kind mismatch",
      mutate: (fixture) => {
        firstArtifact(fixture).retainedArtifact.kind = "different-kind";
      },
    },
    {
      name: "missing required artifact kind",
      mutate: (fixture) => {
        const { receiptArtifact, retainedArtifact } = firstArtifact(fixture);
        receiptArtifact.kind = "unexpected-kind";
        retainedArtifact.kind = "unexpected-kind";
      },
    },
  ];

  it.each(receiptAndArtifactCases)(
    "rejects $name in incremental evidence",
    async ({ mutate }) => {
      const fixture = await createFixture({
        profile: "readiness",
        status: "NOT_READY",
      });
      await mutate(fixture);
      await fixture.persist();
      await expect(parseFixture(fixture)).rejects.toThrow(
        /evidence|receipt|artifact|malformed|hash|kind|command/,
      );
    },
  );
});
