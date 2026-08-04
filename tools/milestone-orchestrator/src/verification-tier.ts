import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type {
  ExactVerificationIndex,
  VerificationCommand,
  VerificationManifest,
  VerificationScopePolicy,
  VerificationTestCounts,
  VerificationTier,
  VerificationTierCommandRecord,
  VerificationTierResult,
} from "./contracts.js";
import {
  assertScopeSelection,
  buildScopeCheckCatalogue,
  classifyAffectedPath,
  finalizeScopeSelection,
  orderScopeCheckIds,
  recommendAffectedScope,
  type AffectedScopeRecommendation,
  type ChangedPathSource,
  type ScopeCandidateIdentity,
  type ScopeCheckDefinition,
  type ScopeSelectionResult,
} from "./affected-scope.js";
import {
  loadConfig,
  loadInvariantSuiteRegistry,
  loadVerificationManifest,
  loadVerificationScopePolicy,
} from "./config.js";
import { runCommand } from "./command-runner.js";
import { parseVitestCounts } from "./invariant-suite.js";
import { buildPackageGraph } from "./package-graph.js";
import { redactSensitiveText } from "./redaction.js";
import {
  inspectReadinessLifecycle,
  readinessHistoryEvidenceForCandidate,
} from "./orchestrator.js";
import { assertVerificationTierResult } from "./schema.js";
import { atomicWriteJson, StateStore } from "./state-store.js";
import { TelemetryStore } from "./telemetry-store.js";
import {
  parseAuthoritativeVerification,
  validateCommandReceiptDirectory,
  type ValidatedCommandReceipt,
} from "./verifier.js";

const DEFAULT_COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const EXACT_CHECK_ID = "exact-readiness";

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function relativePath(repositoryRoot: string, path: string): string {
  const value = slash(relative(resolve(repositoryRoot), resolve(path)));
  if (value === "" || isAbsolute(value) || value.split("/").includes(".."))
    throw new Error(`Tier artifact escapes the repository: ${path}.`);
  return value;
}

function gitText(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}.`,
    );
  return result.stdout.trim();
}

function gitPaths(
  repositoryRoot: string,
  args: readonly string[],
): readonly string[] {
  const result = spawnSync("git", ["-C", repositoryRoot, ...args, "-z"], {
    encoding: "buffer",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.toString("utf8").trim()}.`,
    );
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0)
    .map(slash);
}

export interface TierCandidateIdentity {
  readonly baseCommit: string;
  readonly gitCommit: string;
  readonly gitTree: string;
  readonly workingTreeDirty: boolean;
  readonly changedPaths: readonly string[];
}

export function collectTierCandidateIdentity(
  repositoryRoot: string,
  baseCommit: string,
): TierCandidateIdentity {
  if (!/^[a-f0-9]{40}$/.test(baseCommit))
    throw new Error(`Tier base commit is malformed: ${baseCommit}.`);
  const ancestor = spawnSync(
    "git",
    ["-C", repositoryRoot, "merge-base", "--is-ancestor", baseCommit, "HEAD"],
    { encoding: "utf8", windowsHide: true },
  );
  if (ancestor.error || ancestor.status !== 0)
    throw new Error(
      `Tier base commit is not an ancestor of HEAD: ${baseCommit}.`,
    );
  const status = gitPaths(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const changed = new Set<string>([
    ...gitPaths(repositoryRoot, ["diff", "--name-only", `${baseCommit}..HEAD`]),
    ...gitPaths(repositoryRoot, ["diff", "--name-only"]),
    ...gitPaths(repositoryRoot, ["diff", "--cached", "--name-only"]),
    ...gitPaths(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return {
    baseCommit,
    gitCommit: gitText(repositoryRoot, ["rev-parse", "HEAD"]),
    gitTree: gitText(repositoryRoot, ["rev-parse", "HEAD^{tree}"]),
    workingTreeDirty: status.length > 0,
    changedPaths: [...changed].sort(),
  };
}

export function classifyVerificationPath(
  path: string,
  protectedPaths: readonly string[],
  browserHostScriptPatterns: readonly RegExp[] = [],
): readonly string[] {
  return classifyAffectedPath(path, protectedPaths, browserHostScriptPatterns);
}

type PlannedCommand = ScopeCheckDefinition;

export interface VerificationTierPlan {
  readonly classifications: Readonly<Record<string, readonly string[]>>;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
  readonly fullClosureCheckIds: readonly string[];
  readonly commands: readonly PlannedCommand[];
  readonly scopeRecommendation: AffectedScopeRecommendation;
  readonly scopeSelection: ScopeSelectionResult;
}

export async function planVerificationTier(input: {
  readonly repositoryRoot: string;
  readonly tier: VerificationTier;
  readonly manifest: VerificationManifest;
  readonly scopePolicy: VerificationScopePolicy;
  readonly scopePolicySha256: string;
  readonly changedPaths: readonly string[];
  readonly changedPathSource: ChangedPathSource;
  readonly candidate: ScopeCandidateIdentity;
  readonly focusedCheckIds?: readonly string[];
}): Promise<VerificationTierPlan> {
  const [packageGraph] = await Promise.all([
    buildPackageGraph(input.repositoryRoot),
  ]);
  const checkCatalogue = buildScopeCheckCatalogue(input.manifest);
  const catalog = new Map<string, PlannedCommand>(
    checkCatalogue.entries.map((command) => [command.id, command]),
  );
  const scopeRecommendation = recommendAffectedScope({
    changedPaths: input.changedPaths,
    changedPathSource: input.changedPathSource,
    candidate: input.candidate,
    manifest: input.manifest,
    policy: input.scopePolicy,
    policySha256: input.scopePolicySha256,
    packageGraph,
  });
  const classifications = Object.fromEntries(
    scopeRecommendation.classifications.map((entry) => [
      entry.path,
      entry.triggerClasses,
    ]),
  );
  const tagged = input.manifest.focusedCommands
    .filter((command) => command.tiers.includes(input.tier as never))
    .map((command) => command.id);
  const actual = new Set<string>(tagged);
  if (input.tier === "iteration") {
    for (const id of input.focusedCheckIds ?? []) actual.add(id);
  } else if (input.tier === "candidate") {
    for (const id of scopeRecommendation.recommendedCheckIds) actual.add(id);
    if (actual.has("test-unit")) {
      actual.delete("test-unit-fast");
      actual.delete("test-unit-migrations");
    }
  } else if (input.tier === "milestone") {
    for (const id of scopeRecommendation.recommendedCheckIds) actual.add(id);
    if (actual.has("test-unit")) {
      actual.delete("test-unit-fast");
      actual.delete("test-unit-migrations");
    }
  } else if (input.tier === "periodic") {
    actual.clear();
  }
  if (input.tier === "milestone" || input.tier === "periodic")
    actual.add(EXACT_CHECK_ID);
  const unknown = [
    ...actual,
    ...scopeRecommendation.recommendedCheckIds,
  ].filter((id) => id !== EXACT_CHECK_ID && !catalog.has(id));
  if (unknown.length > 0)
    throw new Error(
      `Verification policy references unknown check IDs: ${[...new Set(unknown)].join(", ")}.`,
    );
  const actualCheckIds = orderScopeCheckIds(actual, checkCatalogue);
  const scopeSelection = finalizeScopeSelection(scopeRecommendation, {
    actualCheckIds,
    failingActualCheckIds: [],
  });
  return {
    classifications,
    selectedCheckIds: scopeRecommendation.recommendedCheckIds,
    actualCheckIds,
    fullClosureCheckIds: scopeRecommendation.fullClosureCheckIds,
    commands: actualCheckIds
      .filter((id) => id !== EXACT_CHECK_ID)
      .map((id) => catalog.get(id) as PlannedCommand),
    scopeRecommendation,
    scopeSelection,
  };
}

function commandFromPlan(command: PlannedCommand): VerificationCommand {
  const [executable, ...args] = command.argv;
  if (executable !== "pnpm" && executable !== "node" && executable !== "git")
    throw new Error(
      `Verification check ${command.id} has an unsafe executable.`,
    );
  return { id: command.id, executable, args, parser: "exit-code" };
}

async function countsFromReceipt(
  receipt: ValidatedCommandReceipt,
): Promise<VerificationTestCounts | null> {
  for (const artifact of receipt.artifacts) {
    if (!artifact.kind.includes("vitest-report")) continue;
    try {
      const counts = parseVitestCounts(
        JSON.parse(await readFile(artifact.path, "utf8")) as unknown,
      );
      if (counts) return counts;
    } catch {
      return null;
    }
  }
  return null;
}

async function tierCommandRecord(input: {
  readonly repositoryRoot: string;
  readonly tier: VerificationTier;
  readonly runRoot: string;
  readonly index: number;
  readonly command: PlannedCommand;
  readonly telemetry: TelemetryStore;
  readonly candidate: TierCandidateIdentity;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
}): Promise<VerificationTierCommandRecord> {
  const directoryName = `${String(input.index + 1).padStart(2, "0")}-${input.command.id.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`;
  const commandRoot = resolve(input.runRoot, "commands", directoryName);
  const evidenceRoot = resolve(commandRoot, "evidence");
  const execution = await runCommand(commandFromPlan(input.command), {
    workingDirectory: input.repositoryRoot,
    artifactDirectory: resolve(commandRoot, "logs"),
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    extraEnvironment: {
      LOOP_VERIFY_STAGE_ID: `verification-tier-${input.tier}`,
      LOOP_VERIFY_COMMAND_ID: input.command.id,
      LOOP_VERIFY_COMMAND_ARTIFACT_DIR: evidenceRoot,
    },
    telemetry: {
      store: input.telemetry,
      phase: "verification",
      candidate: {
        baseCommit: input.candidate.baseCommit,
        commit: input.candidate.gitCommit,
        tree: input.candidate.gitTree,
        dirty: input.candidate.workingTreeDirty,
      },
      checkSetId: `verification-tier-${input.tier}`,
      selectedCheckIds: input.selectedCheckIds,
      actualCheckIds: input.actualCheckIds,
    },
  });
  let validated: ValidatedCommandReceipt | null = null;
  let receiptAbsenceReason: string | null = null;
  let evidenceFailure: string | null = null;
  if (existsSync(resolve(evidenceRoot, "result.json"))) {
    try {
      validated = await validateCommandReceiptDirectory({
        directory: evidenceRoot,
        expectedStageId: `verification-tier-${input.tier}`,
        expectedCommandId: input.command.id,
        requiredKinds: input.command.expectedArtifactKinds,
      });
    } catch (error) {
      evidenceFailure = error instanceof Error ? error.message : String(error);
      receiptAbsenceReason = evidenceFailure;
    }
  } else if (input.command.expectedArtifactKinds.length > 0) {
    evidenceFailure = `Passing check ${input.command.id} did not write its required command-owned receipt.`;
    receiptAbsenceReason = evidenceFailure;
  } else {
    receiptAbsenceReason =
      "The focused command contract declares no command-owned receipt.";
  }
  const failureClass =
    evidenceFailure !== null ||
    execution.status === "ERROR" ||
    execution.status === "TIMEOUT" ||
    execution.exitCode === 3
      ? "infrastructure"
      : execution.status === "PASS"
        ? null
        : "product";
  return {
    id: input.command.id,
    argv: input.command.argv,
    status: evidenceFailure ? "ERROR" : execution.status,
    exitCode: execution.exitCode,
    signal: execution.signal,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    stdoutPath: relativePath(input.repositoryRoot, execution.stdoutPath),
    stderrPath: relativePath(input.repositoryRoot, execution.stderrPath),
    receipt: validated
      ? {
          path: relativePath(input.repositoryRoot, validated.receiptPath),
          sha256: validated.receiptSha256,
          bytes: validated.receiptBytes,
        }
      : null,
    receiptAbsenceReason,
    artifactCount: validated?.artifactCount ?? 0,
    artifactBytes: validated?.artifactBytes ?? 0,
    testCounts: validated ? await countsFromReceipt(validated) : null,
    failureClass,
    message: evidenceFailure ?? execution.message,
  };
}

export function exactNoArgumentVerificationCommand(): VerificationCommand {
  return {
    id: EXACT_CHECK_ID,
    executable: "pnpm",
    args: ["verify"],
    parser: "pnpm-verify",
  };
}

async function readinessHistory(repositoryRoot: string, baseCommit: string) {
  const config = await loadConfig(repositoryRoot);
  const state = await new StateStore(repositoryRoot, config.statePath).load();
  if (!state)
    throw new Error(
      "Exact tier verification cannot prove readiness history because authentic controller state is missing.",
    );
  return readinessHistoryEvidenceForCandidate(
    state.milestones,
    inspectReadinessLifecycle(repositoryRoot, baseCommit),
  );
}

async function exactResultPath(
  repositoryRoot: string,
  stdoutPath: string,
): Promise<string> {
  const stdout = await readFile(stdoutPath, "utf8");
  const matches = [
    ...stdout.matchAll(
      /^\[VERIFY\] result (artifacts[/\\][^\r\n]+[/\\]result\.json)$/gm,
    ),
  ];
  const result = matches.at(-1)?.[1];
  if (!result)
    throw new Error("Exact pnpm verify did not report its result path.");
  const absolute = resolve(repositoryRoot, result);
  relativePath(repositoryRoot, absolute);
  return absolute;
}

async function runExactVerification(input: {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly commandIndex: number;
  readonly candidate: TierCandidateIdentity;
  readonly telemetry: TelemetryStore;
  readonly selectedCheckIds: readonly string[];
  readonly actualCheckIds: readonly string[];
}): Promise<{
  readonly command: VerificationTierCommandRecord;
  readonly exact: ExactVerificationIndex | null;
  readonly failureClass: "product" | "infrastructure" | null;
}> {
  const commandRoot = resolve(
    input.runRoot,
    "commands",
    `${String(input.commandIndex + 1).padStart(2, "0")}-${EXACT_CHECK_ID}`,
  );
  const executed = await runCommand(exactNoArgumentVerificationCommand(), {
    workingDirectory: input.repositoryRoot,
    artifactDirectory: resolve(commandRoot, "logs"),
    timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    telemetry: {
      store: input.telemetry,
      phase: "verification",
      candidate: {
        baseCommit: input.candidate.baseCommit,
        commit: input.candidate.gitCommit,
        tree: input.candidate.gitTree,
        dirty: input.candidate.workingTreeDirty,
      },
      checkSetId: "verification-tier-exact-readiness",
      selectedCheckIds: input.selectedCheckIds,
      actualCheckIds: input.actualCheckIds,
    },
  });
  let exact: ExactVerificationIndex | null = null;
  let exactArtifactCount = 0;
  let exactArtifactBytes = 0;
  let message: string;
  let failureClass: "product" | "infrastructure" | null = null;
  try {
    if (
      executed.signal !== null ||
      (executed.exitCode !== 0 && executed.exitCode !== 2)
    ) {
      failureClass =
        executed.status === "ERROR" ||
        executed.status === "TIMEOUT" ||
        executed.exitCode === 3
          ? "infrastructure"
          : "product";
      throw new Error(
        `Exact readiness command exited ${executed.exitCode ?? "without an exit code"}.`,
      );
    }
    const resultPath = await exactResultPath(
      input.repositoryRoot,
      executed.stdoutPath,
    );
    const parsed = JSON.parse(await readFile(resultPath, "utf8")) as Record<
      string,
      unknown
    >;
    const expectedRunId = parsed["runId"];
    if (typeof expectedRunId !== "string" || expectedRunId.length === 0)
      throw new Error("Exact readiness result lacks a run identity.");
    const copiedResultPath = resolve(
      input.runRoot,
      "exact-verification-result.json",
    );
    const history = await readinessHistory(
      input.repositoryRoot,
      input.candidate.baseCommit,
    );
    const summary = await parseAuthoritativeVerification({
      workspacePath: input.repositoryRoot,
      expectedCommit: input.candidate.gitCommit,
      expectedTree: input.candidate.gitTree,
      expectedRunId,
      observedExitCode: executed.exitCode,
      resultPath,
      copiedResultPath,
      ...(history ? { readinessHistory: history } : {}),
    });
    const candidate = parsed["candidate"] as
      Record<string, unknown> | undefined;
    const profile = parsed["profile"] as Record<string, unknown> | undefined;
    if (
      summary.profileId !== "readiness" ||
      profile?.["selectedByOverride"] !== false ||
      candidate?.["gitTree"] !== input.candidate.gitTree
    )
      throw new Error(
        "Exact verification is not package-default readiness for the exact candidate tree.",
      );
    const contents = await readFile(resultPath);
    exact = {
      invokedWithNoArguments: true,
      resultPath: relativePath(input.repositoryRoot, resultPath),
      resultSha256: createHash("sha256").update(contents).digest("hex"),
      status: summary.status,
      exitCode: summary.exitCode,
      disposition: summary.disposition,
      profileId: "readiness",
      selectedByOverride: false,
      candidateCommit: input.candidate.gitCommit,
      candidateTree: input.candidate.gitTree,
    };
    const retainedArtifacts = Array.isArray(parsed["stages"])
      ? parsed["stages"].flatMap((stage) => {
          const commands =
            typeof stage === "object" && stage !== null
              ? (stage as Record<string, unknown>)["commands"]
              : null;
          return Array.isArray(commands)
            ? commands.flatMap((command: unknown) => {
                if (
                  typeof command !== "object" ||
                  command === null ||
                  !("evidence" in command) ||
                  typeof command.evidence !== "object" ||
                  command.evidence === null ||
                  !("artifacts" in command.evidence) ||
                  !Array.isArray(command.evidence.artifacts)
                )
                  return [];
                return command.evidence.artifacts;
              })
            : [];
        })
      : [];
    if (
      retainedArtifacts.length !== summary.validatedArtifactCount ||
      retainedArtifacts.some(
        (artifact) =>
          typeof artifact !== "object" ||
          artifact === null ||
          !("bytes" in artifact) ||
          !Number.isSafeInteger(artifact.bytes) ||
          Number(artifact.bytes) <= 0,
      )
    )
      throw new Error(
        "Exact verification artifact telemetry does not match independently validated evidence.",
      );
    exactArtifactCount = retainedArtifacts.length;
    exactArtifactBytes = retainedArtifacts.reduce(
      (sum, artifact) => sum + Number(artifact.bytes),
      0,
    );
    message =
      summary.status === "NOT_READY"
        ? "Exact no-argument readiness verification remained valid incremental NOT_READY evidence."
        : "Exact no-argument readiness verification passed.";
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    failureClass ??= executed.exitCode === 1 ? "product" : "infrastructure";
  }
  return {
    exact,
    failureClass,
    command: {
      id: EXACT_CHECK_ID,
      argv: ["pnpm", "verify"],
      status: exact
        ? exact.status
        : failureClass === "infrastructure"
          ? "ERROR"
          : "FAIL",
      exitCode: executed.exitCode,
      signal: executed.signal,
      startedAt: executed.startedAt,
      finishedAt: executed.finishedAt,
      durationMs: executed.durationMs,
      stdoutPath: relativePath(input.repositoryRoot, executed.stdoutPath),
      stderrPath: relativePath(input.repositoryRoot, executed.stderrPath),
      receipt: null,
      receiptAbsenceReason:
        "Exact readiness authority is the independently parsed result tree, not a tier receipt.",
      artifactCount: exactArtifactCount,
      artifactBytes: exactArtifactBytes,
      testCounts: null,
      failureClass,
      message,
    },
  };
}

export function coordinateTierOutcome(input: {
  readonly tier: VerificationTier;
  readonly focusedCommands: readonly VerificationTierCommandRecord[];
  readonly exactVerification: ExactVerificationIndex | null;
  readonly exactFailureClass?: "product" | "infrastructure" | null;
}): Pick<VerificationTierResult, "status" | "exitCode"> {
  if (
    input.focusedCommands.some(
      (command) => command.failureClass === "infrastructure",
    ) ||
    input.exactFailureClass === "infrastructure"
  )
    return { status: "ERROR", exitCode: 3 };
  if (
    input.focusedCommands.some((command) => command.status !== "PASS") ||
    input.exactFailureClass === "product"
  )
    return { status: "FAIL", exitCode: 1 };
  if (input.tier === "milestone" || input.tier === "periodic") {
    if (!input.exactVerification) return { status: "ERROR", exitCode: 3 };
    return input.exactVerification.status === "PASS"
      ? { status: "PASS", exitCode: 0 }
      : { status: "NOT_READY", exitCode: 2 };
  }
  return { status: "PASS", exitCode: 0 };
}

export interface RunVerificationTierInput {
  readonly repositoryRoot: string;
  readonly tier: VerificationTier;
  readonly manifestPath?: string;
  readonly baseCommit?: string;
  readonly requireClean?: boolean;
  readonly focusedCheckIds?: readonly string[];
}

export async function runVerificationTier(
  input: RunVerificationTierInput,
): Promise<VerificationTierResult> {
  const startedAt = new Date();
  const [manifest, invariant, scopePolicy] = await Promise.all([
    loadVerificationManifest(input.repositoryRoot, input.manifestPath),
    loadInvariantSuiteRegistry(input.repositoryRoot),
    loadVerificationScopePolicy(input.repositoryRoot),
  ]);
  if (manifest.value.requiredInvariantSuiteId !== invariant.value.id)
    throw new Error(
      "Verification manifest references a different invariant suite.",
    );
  const baseCommit = input.baseCommit ?? manifest.value.d031BaselineCommit;
  const candidate = collectTierCandidateIdentity(
    input.repositoryRoot,
    baseCommit,
  );
  const runId = `verification-tier-${input.tier}-${startedAt
    .toISOString()
    .replaceAll(/[^0-9]/g, "")}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const runRoot = resolve(
    input.repositoryRoot,
    "artifacts",
    "verification-tiers",
    runId,
  );
  await mkdir(
    resolve(input.repositoryRoot, "artifacts", "verification-tiers"),
    {
      recursive: true,
    },
  );
  await mkdir(runRoot, { recursive: false });
  const telemetry = await TelemetryStore.open({
    repositoryRoot: input.repositoryRoot,
    directory: resolve(
      input.repositoryRoot,
      "artifacts",
      "loop-telemetry",
      "direct",
      runId,
    ),
    runId,
    source: "direct",
  });
  const plan = await planVerificationTier({
    repositoryRoot: input.repositoryRoot,
    tier: input.tier,
    manifest: manifest.value,
    scopePolicy: scopePolicy.value,
    scopePolicySha256: scopePolicy.sha256,
    changedPaths: candidate.changedPaths,
    changedPathSource: {
      kind: "git-range-and-working-tree",
      baseCommit: candidate.baseCommit,
      headCommit: candidate.gitCommit,
    },
    candidate,
    ...(input.focusedCheckIds
      ? { focusedCheckIds: input.focusedCheckIds }
      : {}),
  });
  const telemetrySpan = await telemetry.beginPhase({
    phase: "verification",
    eventType: `verification-tier-${input.tier}`,
    operationId: `${runId}-tier`,
    candidate: {
      baseCommit: candidate.baseCommit,
      commit: candidate.gitCommit,
      tree: candidate.gitTree,
      dirty: candidate.workingTreeDirty,
    },
  });
  try {
    let shadowSelectionPath: string | null = null;

    const requiresClean =
      input.requireClean === true ||
      input.tier === "milestone" ||
      input.tier === "periodic";
    const commandRecords: VerificationTierCommandRecord[] = [];
    let cleanFailure = false;
    if (requiresClean && candidate.workingTreeDirty) cleanFailure = true;
    if (!cleanFailure) {
      for (const [index, command] of plan.commands.entries()) {
        const record = await tierCommandRecord({
          repositoryRoot: input.repositoryRoot,
          tier: input.tier,
          runRoot,
          index,
          command,
          telemetry,
          candidate,
          selectedCheckIds: plan.selectedCheckIds,
          actualCheckIds: plan.actualCheckIds,
        });
        commandRecords.push(record);
        if (record.status !== "PASS") break;
      }
    }

    let exact: ExactVerificationIndex | null = null;
    let exactFailureClass: "product" | "infrastructure" | null = null;
    if (
      !cleanFailure &&
      commandRecords.length === plan.commands.length &&
      commandRecords.every((record) => record.status === "PASS") &&
      (input.tier === "milestone" || input.tier === "periodic")
    ) {
      const exactRun = await runExactVerification({
        repositoryRoot: input.repositoryRoot,
        runRoot,
        commandIndex: commandRecords.length,
        candidate,
        telemetry,
        selectedCheckIds: plan.selectedCheckIds,
        actualCheckIds: [...plan.actualCheckIds, EXACT_CHECK_ID],
      });
      commandRecords.push(exactRun.command);
      exact = exactRun.exact;
      exactFailureClass = exactRun.failureClass;
    }
    const outcome = cleanFailure
      ? ({ status: "FAIL", exitCode: 1 } as const)
      : coordinateTierOutcome({
          tier: input.tier,
          focusedCommands: commandRecords.filter(
            (command) => command.id !== EXACT_CHECK_ID,
          ),
          exactVerification: exact,
          exactFailureClass,
        });
    if (input.tier !== "periodic") {
      const path = resolve(runRoot, "shadow-selection.json");
      const selection = finalizeScopeSelection(plan.scopeRecommendation, {
        actualCheckIds: plan.actualCheckIds,
        failingActualCheckIds: commandRecords
          .filter((command) => command.status !== "PASS")
          .map((command) => command.id),
      });
      assertScopeSelection(selection);
      await atomicWriteJson(path, selection);
      shadowSelectionPath = relativePath(input.repositoryRoot, path);
    }
    const finishedAt = new Date();
    const result: VerificationTierResult = {
      schemaVersion: "1.0.0",
      runId,
      tier: input.tier,
      status: outcome.status,
      exitCode: outcome.exitCode,
      authoritative: false,
      candidate: {
        baseCommit: candidate.baseCommit,
        gitCommit: candidate.gitCommit,
        gitTree: candidate.gitTree,
        workingTreeDirty: candidate.workingTreeDirty,
      },
      changedPaths: candidate.changedPaths,
      invariantSuiteId: invariant.value.id,
      invariantSuiteSha256: invariant.sha256,
      scopePolicySha256: scopePolicy.sha256,
      shadowSelectionPath,
      selectedCheckIds: plan.selectedCheckIds,
      actualCheckIds: plan.actualCheckIds,
      fullClosureCheckIds: plan.fullClosureCheckIds,
      commands: commandRecords,
      exactVerification: exact,
      reviewRequired: input.tier === "milestone",
      telemetryManifestPath: telemetry.repositoryRelativeManifestPath(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
    assertVerificationTierResult(result);
    const measuredTestCounts = commandRecords
      .map((command) => command.testCounts)
      .filter((counts): counts is VerificationTestCounts => counts !== null);
    const summedCounts = measuredTestCounts.length
      ? {
          suites: {
            total: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.suites.total,
              0,
            ),
            passed: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.suites.passed,
              0,
            ),
            failed: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.suites.failed,
              0,
            ),
            skipped: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.suites.skipped,
              0,
            ),
          },
          tests: {
            total: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.tests.total,
              0,
            ),
            passed: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.tests.passed,
              0,
            ),
            failed: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.tests.failed,
              0,
            ),
            skipped: measuredTestCounts.reduce(
              (sum, counts) => sum + counts.tests.skipped,
              0,
            ),
          },
        }
      : null;
    await telemetrySpan.finish({
      status: outcome.status,
      reason: cleanFailure
        ? "The verification tier requires a clean working tree."
        : null,
      candidate: {
        baseCommit: candidate.baseCommit,
        commit: candidate.gitCommit,
        tree: candidate.gitTree,
        dirty: candidate.workingTreeDirty,
      },
      tests: summedCounts,
      artifacts: {
        fileCount:
          commandRecords.reduce(
            (sum, command) => sum + command.artifactCount,
            0,
          ) + (shadowSelectionPath ? 1 : 0),
        totalBytes: commandRecords.reduce(
          (sum, command) => sum + command.artifactBytes,
          0,
        ),
        manifestReferences: shadowSelectionPath ? [shadowSelectionPath] : [],
        receiptReferences: commandRecords.flatMap((command) =>
          command.receipt ? [command.receipt.path] : [],
        ),
      },
    });
    await telemetry.complete(outcome.status);
    await atomicWriteJson(resolve(runRoot, "tier-result.json"), result);
    process.stdout.write(
      `Verification tier result: ${relativePath(input.repositoryRoot, resolve(runRoot, "tier-result.json"))}\n`,
    );
    return result;
  } catch (error) {
    const reason = redactSensitiveText(
      error instanceof Error ? error.message : String(error),
    );
    try {
      await telemetrySpan.finish({
        status: "ERROR",
        reason,
        candidate: {
          baseCommit: candidate.baseCommit,
          commit: candidate.gitCommit,
          tree: candidate.gitTree,
          dirty: candidate.workingTreeDirty,
        },
      });
    } catch {
      // A later write can fail after the successful path has already closed the phase.
    }
    try {
      await telemetry.complete("ERROR", reason);
    } catch {
      // Preserve the original tier error when telemetry is the failing boundary.
    }
    throw error;
  }
}
