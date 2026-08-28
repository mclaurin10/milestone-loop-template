import { createHash, randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import {
  DEFAULT_COMMAND_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
  superviseCommand,
} from "./milestone-orchestrator/src/process-supervisor.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const DEFAULT_EVIDENCE_COMMAND_TIMEOUT_MS = 3_600_000;
export const FULL_SUITE_EVIDENCE_TIMEOUT_MS = 90 * 60 * 1_000;
const IDENTITY_COMMAND_TIMEOUT_MS = 30_000;
const CITATION_COMMAND_TIMEOUT_MS = 60_000;
const CITATION_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;

function safeName(value) {
  return value.replaceAll(":", "-").replaceAll(/[^A-Za-z0-9._-]/g, "-");
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function slash(path) {
  return path.replaceAll("\\", "/");
}

function redactSensitiveText(value) {
  return [
    [
      /(\b(?:authorization|proxy-authorization)\s*:\s*bearer\s+)[^\s,;]+/giu,
      "$1[REDACTED]",
    ],
    [/\b(?:sk|sess|pat|ghp|github_pat)-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]"],
    [
      /(\b[A-Za-z][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)[A-Za-z0-9_]*\s*=\s*)[^\s]+/giu,
      "$1[REDACTED]",
    ],
    [/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[REDACTED]@"],
  ].reduce(
    (redacted, [pattern, replacement]) =>
      redacted.replace(pattern, replacement),
    value,
  );
}

function redactArgv(argv) {
  const result = [];
  let redactNext = false;
  for (const raw of argv) {
    const value = redactSensitiveText(raw);
    if (redactNext) {
      result.push("[REDACTED]");
      redactNext = false;
      continue;
    }
    if (
      /^--?(?:api[-_]?key|token|secret|password|credential|prompt|hidden[-_]?seed)$/iu.test(
        value,
      )
    ) {
      result.push(value);
      redactNext = true;
      continue;
    }
    if (
      /^--?(?:api[-_]?key|token|secret|password|credential|prompt|hidden[-_]?seed)=/iu.test(
        value,
      )
    ) {
      result.push(`${value.slice(0, value.indexOf("=") + 1)}[REDACTED]`);
      continue;
    }
    result.push(value);
  }
  return result;
}

function renderSupervisedStream(raw, capture) {
  const redacted = redactSensitiveText(raw.toString("utf8"));
  if (!capture.truncated) return redacted;
  const separator =
    redacted.length === 0 || redacted.endsWith("\n") ? "" : "\n";
  return `${redacted}${separator}[output truncated: retained ${capture.bytesCaptured} of ${capture.totalBytesObserved} observed bytes]\n`;
}

function stringEnvironment(source) {
  return Object.fromEntries(
    Object.entries(source).filter((entry) => typeof entry[1] === "string"),
  );
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

async function superviseEvidenceCommand(command, args, options = {}) {
  const timeoutMs = positiveInteger(
    options.timeoutMs ?? DEFAULT_EVIDENCE_COMMAND_TIMEOUT_MS,
    "Evidence command timeout",
  );
  const killGraceMs = positiveInteger(
    options.killGraceMs ?? DEFAULT_COMMAND_KILL_GRACE_MS,
    "Evidence command kill grace",
  );
  const outputLimitBytes = positiveInteger(
    options.outputLimitBytes ?? DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
    "Evidence command output limit",
  );
  const supervised = await superviseCommand({
    executable: command,
    args,
    cwd: options.cwd ?? repositoryRoot,
    env: stringEnvironment({ ...process.env, ...options.env }),
    timeoutMs,
    killGraceMs,
    outputLimitBytes,
    processStartupObserver: options.processStartupObserver,
  });
  const stdout = renderSupervisedStream(
    supervised.stdout,
    supervised.supervision.stdout,
  );
  const stderr = renderSupervisedStream(
    supervised.stderr,
    supervised.supervision.stderr,
  );
  const error = supervised.spawnError
    ? new Error(redactSensitiveText(supervised.spawnError.message))
    : supervised.supervision.timedOut
      ? new Error(`Command timed out after ${timeoutMs} ms.`)
      : supervised.supervision.outputLimitExceeded
        ? new Error(
            supervised.supervision.terminationReason === "output-limit"
              ? `Command exceeded the ${outputLimitBytes}-byte per-stream output limit; output was truncated and the process tree was terminated.`
              : `Command exceeded the ${outputLimitBytes}-byte per-stream output limit while draining after exit; output was truncated and remaining streams were cut off.`,
          )
        : null;
  return {
    status: supervised.exitCode,
    signal: supervised.signal,
    stdout,
    stderr,
    error,
    spawnargs: redactArgv([command, ...args]),
    supervision: supervised.supervision,
  };
}

function displayCommand(argv = process.argv) {
  return redactSensitiveText(
    redactArgv(argv)
      .map((value) => (/[\s"]/u.test(value) ? JSON.stringify(value) : value))
      .join(" "),
  );
}

function redactManualText(value) {
  return redactSensitiveText(value).replace(
    /(\b(?:api[-_]?key|token|secret|password|credential)\s*=\s*)[^\s]+/giu,
    "$1[REDACTED]",
  );
}

function candidateFromIdentity(identity) {
  return {
    gitCommit:
      typeof identity.gitCommit === "string" &&
      /^[0-9a-f]{40}$/.test(identity.gitCommit)
        ? identity.gitCommit
        : null,
    gitTree:
      typeof identity.gitTree === "string" &&
      /^[0-9a-f]{40}$/.test(identity.gitTree)
        ? identity.gitTree
        : null,
    workingTreeDirty:
      typeof identity.gitStatus === "string" && identity.gitStatus.length > 0,
  };
}

function citationClass(citations) {
  const classes = [
    citations.trackedPaths.length > 0 ? "tracked" : null,
    citations.controllerStateReferences.length > 0 ? "controller-state" : null,
    citations.activeReconciliationReference !== null
      ? "active-reconciliation"
      : null,
  ].filter(Boolean);
  return classes.length === 0
    ? "uncited-at-creation"
    : classes.length === 1
      ? classes[0]
      : "mixed";
}

async function trackedCitationPaths(repositoryRoot, needles) {
  const candidates = new Set();
  for (let offset = 0; offset < needles.length; offset += 20) {
    const batch = needles.slice(offset, offset + 20);
    if (batch.length === 0) continue;
    const result = await superviseEvidenceCommand(
      "git",
      [
        "-C",
        repositoryRoot,
        "grep",
        "-I",
        "-l",
        "-F",
        ...batch.flatMap((needle) => ["-e", needle]),
        "HEAD",
        "--",
      ],
      {
        cwd: repositoryRoot,
        timeoutMs: CITATION_COMMAND_TIMEOUT_MS,
        outputLimitBytes: CITATION_OUTPUT_LIMIT_BYTES,
      },
    );
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw new Error(
        `Cannot inspect durable evidence citations: ${result.error?.message ?? (result.stderr.trim() || `git grep exited ${String(result.status)}`)}.`,
      );
    for (const path of result.stdout.split(/\r?\n/u))
      if (path.length > 0)
        candidates.add(slash(path.startsWith("HEAD:") ? path.slice(5) : path));
  }
  const citations = [];
  for (const path of [...candidates].sort()) {
    const result = await superviseEvidenceCommand(
      "git",
      ["-C", repositoryRoot, "show", `HEAD:${path}`],
      {
        cwd: repositoryRoot,
        timeoutMs: CITATION_COMMAND_TIMEOUT_MS,
        outputLimitBytes: CITATION_OUTPUT_LIMIT_BYTES,
      },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `Cannot inspect tracked evidence citation ${path}: ${result.error?.message ?? (result.stderr.trim() || `git show exited ${String(result.status)}`)}.`,
      );
    if (needles.some((needle) => hasExactCitation(result.stdout, needle)))
      citations.push(path);
  }
  return citations;
}

function hasExactCitation(text, needle) {
  const continuesReference = (index, direction) => {
    const character = text[index];
    if (character === undefined) return false;
    if (/[A-Za-z0-9_~:/\\]/u.test(character)) return true;
    if (character !== "." && character !== "-") return false;
    const neighbor = text[index + direction];
    return neighbor !== undefined && /[A-Za-z0-9_]/u.test(neighbor);
  };
  let offset = text.indexOf(needle);
  while (offset >= 0) {
    if (
      !continuesReference(offset - 1, -1) &&
      !continuesReference(offset + needle.length, 1)
    )
      return true;
    offset = text.indexOf(needle, offset + 1);
  }
  return false;
}

function citationNeedles(repositoryRoot, artifactDirectory, manifestId) {
  const repository = resolve(repositoryRoot);
  const directory = resolve(artifactDirectory);
  const needles = [manifestId, slash(directory), directory];
  const relativeDirectory = relative(repository, directory);
  if (
    relativeDirectory.length > 0 &&
    !relativeDirectory.startsWith("..") &&
    !isAbsolute(relativeDirectory)
  ) {
    const normalizedRelative = slash(relativeDirectory);
    needles.push(normalizedRelative, `${normalizedRelative}/result.json`);
  }
  return [...new Set(needles.filter((needle) => needle.length > 0))];
}

function citationText(value) {
  const strings = [];
  const visit = (candidate) => {
    if (typeof candidate === "string") {
      strings.push(candidate, slash(candidate));
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object")
      for (const [key, item] of Object.entries(candidate)) {
        strings.push(key);
        visit(item);
      }
  };
  visit(value);
  return strings.join("\n");
}

export async function durableCitations(context, manifestId) {
  const needles = citationNeedles(
    context.repositoryRoot,
    context.artifactDirectory,
    manifestId,
  );
  const trackedPaths = await trackedCitationPaths(
    context.repositoryRoot,
    needles,
  );
  const statePath = resolve(
    context.repositoryRoot,
    "artifacts",
    "orchestrator",
    "state",
    "state.json",
  );
  let controllerStateReferences = [];
  let activeReconciliationReference = null;
  try {
    const stateText = await readFile(statePath, "utf8");
    const state = JSON.parse(stateText);
    const normalizedStateText = `${stateText}\n${citationText(state)}`;
    if (needles.some((needle) => hasExactCitation(normalizedStateText, needle)))
      controllerStateReferences = ["artifacts/orchestrator/state/state.json"];
    const reconciliation =
      state.activeReconciliation ?? state.reconciliation?.active ?? null;
    if (
      reconciliation &&
      typeof reconciliation === "object" &&
      needles.some((needle) =>
        hasExactCitation(citationText(reconciliation), needle),
      )
    )
      activeReconciliationReference =
        "artifacts/orchestrator/state/state.json#/activeReconciliation";
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  return {
    trackedPaths,
    controllerStateReferences,
    activeReconciliationReference,
  };
}

function fallbackFailureManifest(context, state, message) {
  const finishedAt = new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    manifestId: state.manifestId,
    stageId: context.stageId,
    commandId: context.commandId,
    displayCommand: state.displayCommand,
    status: "ERROR",
    candidate: state.candidate,
    receipt: null,
    declaredArtifacts: state.lastManifest?.declaredArtifacts ?? {
      count: 0,
      bytes: 0,
      declarations: [],
    },
    telemetry: state.telemetry,
    citationClass: "uncited-at-creation",
    durableCitations: {
      trackedPaths: [],
      controllerStateReferences: [],
      activeReconciliationReference: null,
    },
    createdAt: state.createdAt,
    finishedAt,
    failureClassification: {
      kind: "unknown",
      message: redactManualText(message),
    },
  };
}

function exactObjectKeys(value, keys) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

export function assertManualEvidenceManifest(value) {
  const keys = [
    "schemaVersion",
    "manifestId",
    "stageId",
    "commandId",
    "displayCommand",
    "status",
    "candidate",
    "receipt",
    "declaredArtifacts",
    "telemetry",
    "citationClass",
    "durableCitations",
    "createdAt",
    "finishedAt",
    "failureClassification",
  ];
  if (
    !exactObjectKeys(value, keys) ||
    value.schemaVersion !== "1.0.0" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value.manifestId) ||
    typeof value.stageId !== "string" ||
    value.stageId.length === 0 ||
    typeof value.commandId !== "string" ||
    value.commandId.length === 0 ||
    typeof value.displayCommand !== "string" ||
    value.displayCommand.length === 0 ||
    !["PASS", "NOT_READY", "FAIL", "ERROR", "TIMEOUT"].includes(value.status) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.finishedAt)) ||
    Date.parse(value.finishedAt) < Date.parse(value.createdAt)
  )
    throw new Error(
      "Manual evidence manifest identity or lifecycle is invalid.",
    );
  if (
    !exactObjectKeys(value.candidate, [
      "gitCommit",
      "gitTree",
      "workingTreeDirty",
    ]) ||
    !(
      value.candidate.gitCommit === null ||
      /^[a-f0-9]{40}$/.test(value.candidate.gitCommit)
    ) ||
    !(
      value.candidate.gitTree === null ||
      /^[a-f0-9]{40}$/.test(value.candidate.gitTree)
    ) ||
    typeof value.candidate.workingTreeDirty !== "boolean"
  )
    throw new Error("Manual evidence candidate is invalid.");
  const declarations = value.declaredArtifacts;
  if (
    !exactObjectKeys(declarations, ["count", "bytes", "declarations"]) ||
    !Number.isSafeInteger(declarations.count) ||
    declarations.count < 0 ||
    !Number.isSafeInteger(declarations.bytes) ||
    declarations.bytes < 0 ||
    !Array.isArray(declarations.declarations) ||
    declarations.declarations.length !== declarations.count ||
    declarations.declarations.some(
      (artifact) =>
        !exactObjectKeys(artifact, ["path", "kind", "bytes", "sha256"]) ||
        typeof artifact.path !== "string" ||
        artifact.path.length === 0 ||
        typeof artifact.kind !== "string" ||
        artifact.kind.length === 0 ||
        !Number.isSafeInteger(artifact.bytes) ||
        artifact.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256),
    ) ||
    declarations.declarations.reduce(
      (sum, artifact) => sum + artifact.bytes,
      0,
    ) !== declarations.bytes
  )
    throw new Error("Manual evidence artifact declarations are invalid.");
  if (
    !exactObjectKeys(value.telemetry, ["runId", "manifestPath"]) ||
    (value.telemetry.runId === null) !==
      (value.telemetry.manifestPath === null) ||
    (value.telemetry.runId !== null &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.telemetry.runId)) ||
    (value.telemetry.manifestPath !== null &&
      (typeof value.telemetry.manifestPath !== "string" ||
        value.telemetry.manifestPath.length === 0))
  )
    throw new Error("Manual evidence telemetry reference is invalid.");
  if (
    ![
      "uncited-at-creation",
      "tracked",
      "controller-state",
      "active-reconciliation",
      "mixed",
    ].includes(value.citationClass) ||
    !exactObjectKeys(value.durableCitations, [
      "trackedPaths",
      "controllerStateReferences",
      "activeReconciliationReference",
    ]) ||
    !Array.isArray(value.durableCitations.trackedPaths) ||
    value.durableCitations.trackedPaths.some(
      (path) => typeof path !== "string" || path.length === 0,
    ) ||
    new Set(value.durableCitations.trackedPaths).size !==
      value.durableCitations.trackedPaths.length ||
    !Array.isArray(value.durableCitations.controllerStateReferences) ||
    value.durableCitations.controllerStateReferences.some(
      (path) => typeof path !== "string" || path.length === 0,
    ) ||
    new Set(value.durableCitations.controllerStateReferences).size !==
      value.durableCitations.controllerStateReferences.length ||
    !(
      value.durableCitations.activeReconciliationReference === null ||
      (typeof value.durableCitations.activeReconciliationReference ===
        "string" &&
        value.durableCitations.activeReconciliationReference.length > 0)
    ) ||
    citationClass(value.durableCitations) !== value.citationClass
  )
    throw new Error("Manual evidence durable citations are invalid.");
  if (value.status === "PASS") {
    if (
      !exactObjectKeys(value.receipt, ["path", "sha256", "bytes"]) ||
      value.receipt.path !== "result.json" ||
      !/^[a-f0-9]{64}$/.test(value.receipt.sha256) ||
      !Number.isSafeInteger(value.receipt.bytes) ||
      value.receipt.bytes <= 0 ||
      value.failureClassification !== null
    )
      throw new Error("Passing manual evidence receipt is invalid.");
  } else if (
    value.receipt !== null ||
    !exactObjectKeys(value.failureClassification, ["kind", "message"]) ||
    !["product", "infrastructure", "usage", "unknown"].includes(
      value.failureClassification.kind,
    ) ||
    typeof value.failureClassification.message !== "string" ||
    value.failureClassification.message.length === 0
  )
    throw new Error("Failed manual evidence classification is invalid.");
  return value;
}

function registerManualEvidenceLifecycle(context) {
  const state = context.manualEvidence;
  process.once("beforeExit", async (code) => {
    if (state.finalized) return;
    state.finalized = true;
    await writeManualEvidenceFailure(context, {
      kind: code === 64 ? "usage" : "unknown",
      message: "Command exited without producing a passing evidence receipt.",
    });
    if ((process.exitCode ?? code) === 0) process.exitCode = 1;
  });
  process.once("exit", (code) => {
    if (code === 0) return;
    const receiptPath = resolve(context.artifactDirectory, "result.json");
    try {
      unlinkSync(receiptPath);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
    if (state.lastManifest && state.lastManifest.status !== "PASS") return;
    const manifest = fallbackFailureManifest(
      context,
      state,
      "Command process exited unsuccessfully; any passing receipt was removed.",
    );
    writeFileSync(
      resolve(context.artifactDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  });
}

export async function evidenceContext(defaultStageId, defaultCommandId) {
  const stageId = process.env.LOOP_VERIFY_STAGE_ID ?? defaultStageId;
  const commandId = process.env.LOOP_VERIFY_COMMAND_ID ?? defaultCommandId;
  const artifactDirectory = resolve(
    process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR ??
      resolve(
        repositoryRoot,
        "artifacts",
        "manual",
        `${safeName(commandId)}-${process.pid}`,
      ),
  );
  await mkdir(artifactDirectory, { recursive: true });
  const createdAt = new Date().toISOString();
  const context = {
    artifactDirectory,
    commandId,
    repositoryRoot,
    stageId,
    manualEvidence: {
      manifestId: `manual-${safeName(commandId)}-${createdAt.replaceAll(/[^0-9]/g, "")}-${process.pid}-${randomUUID().slice(0, 8)}`,
      createdAt,
      displayCommand: displayCommand(),
      candidate: candidateFromIdentity(await commandIdentity(repositoryRoot)),
      telemetry: { runId: null, manifestPath: null },
      finalized: false,
      lastManifest: null,
    },
  };
  registerManualEvidenceLifecycle(context);
  return context;
}

export async function beginDirectTelemetry(context, input = {}) {
  if (process.env.LOOP_TELEMETRY_PARENT_MANAGED === "1") return null;
  try {
    const { TelemetryStore } =
      await import("./milestone-orchestrator/src/telemetry-store.ts");
    const identity = await commandIdentity();
    const timestamp = new Date().toISOString().replaceAll(/[^0-9]/g, "");
    const runId =
      process.env.MILESTONE_LOOP_TELEMETRY_RUN_ID ??
      `direct-${safeName(context.commandId)}-${timestamp}-${process.pid}-${randomUUID().slice(0, 8)}`;
    const store = await TelemetryStore.open({
      repositoryRoot: context.repositoryRoot,
      directory: resolve(
        context.repositoryRoot,
        "artifacts",
        "loop-telemetry",
        "direct",
        runId,
      ),
      runId,
      source: "direct",
    });
    const candidate = {
      baseCommit: null,
      commit:
        typeof identity.gitCommit === "string" &&
        /^[0-9a-f]{40}$/.test(identity.gitCommit)
          ? identity.gitCommit
          : null,
      tree:
        typeof identity.gitTree === "string" &&
        /^[0-9a-f]{40}$/.test(identity.gitTree)
          ? identity.gitTree
          : null,
      dirty:
        typeof identity.gitStatus === "string" && identity.gitStatus.length > 0,
    };
    const span = await store.beginPhase({
      phase: input.phase ?? "verification",
      eventType: input.eventType ?? "direct-command",
      candidate,
    });
    if (context.manualEvidence) {
      context.manualEvidence.telemetry = {
        runId,
        manifestPath: slash(
          relative(
            context.repositoryRoot,
            resolve(
              context.repositoryRoot,
              "artifacts",
              "loop-telemetry",
              "direct",
              runId,
              "manifest.json",
            ),
          ),
        ),
      };
    }
    return {
      store,
      span,
      context,
      candidate,
      commandId: context.commandId,
      argv: input.argv ?? process.argv,
      checkSetId: input.checkSetId ?? context.stageId,
    };
  } catch (error) {
    // Telemetry availability is non-semantic for evidence commands: the
    // command outcome is owned by the command itself, so a failed telemetry
    // begin degrades to "no telemetry" instead of failing the command.
    process.stderr.write(
      `Telemetry begin failed (non-semantic): ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return null;
  }
}

export async function finishDirectTelemetry(handle, input) {
  if (!handle) return null;
  await handle.span.finish({
    status: input.status,
    reason: input.reason ?? null,
    candidate: handle.candidate,
    command: {
      id: handle.commandId,
      argv: handle.argv,
      checkSetId: handle.checkSetId,
      selectedCheckIds: [handle.commandId],
      actualCheckIds: [handle.commandId],
      exitCode: input.exitCode ?? null,
      signal: input.signal ?? null,
    },
    tests: input.tests ?? null,
    artifacts: input.artifacts ?? null,
  });
  return handle.store.complete(input.status, input.reason ?? null);
}

export function pnpmInvocation(args) {
  const pnpmPath = process.env.npm_execpath;
  if (
    pnpmPath &&
    /pnpm(?:\.[cm]?js)?$/i.test(pnpmPath) &&
    existsSync(pnpmPath)
  ) {
    return { command: process.execPath, args: [pnpmPath, ...args] };
  }
  const corepackPnpmPath = resolve(
    dirname(process.execPath),
    "node_modules",
    "corepack",
    "dist",
    "pnpm.js",
  );
  if (existsSync(corepackPnpmPath))
    return { command: process.execPath, args: [corepackPnpmPath, ...args] };
  if (process.platform === "win32")
    throw new Error(
      "Safe pnpm argv execution on Windows could not resolve a pnpm JavaScript entry from npm_execpath or the pinned Node Corepack installation.",
    );
  return { command: "pnpm", args };
}

export async function runPnpm(args, options = {}) {
  const invocation = pnpmInvocation(args);
  return superviseEvidenceCommand(invocation.command, invocation.args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env,
    timeoutMs: options.timeoutMs,
    killGraceMs: options.killGraceMs,
    outputLimitBytes: options.outputLimitBytes,
    processStartupObserver: options.processStartupObserver,
  });
}

export async function commandIdentity(root = repositoryRoot) {
  const output = async (command, args) => {
    const result = await superviseEvidenceCommand(command, args, {
      cwd: root,
      timeoutMs: IDENTITY_COMMAND_TIMEOUT_MS,
      outputLimitBytes: CITATION_OUTPUT_LIMIT_BYTES,
    });
    return !result.error && result.status === 0 ? result.stdout.trim() : null;
  };
  const pnpm = pnpmInvocation(["--version"]);
  return {
    gitCommit: await output("git", ["rev-parse", "HEAD"]),
    gitTree: await output("git", ["write-tree"]),
    gitStatus: await output("git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]),
    nodeVersion: process.version,
    pnpmVersion: await output(pnpm.command, pnpm.args),
  };
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function artifactDeclaration(artifactDirectory, path, kind) {
  const contents = await readFile(path);
  const metadata = await stat(path);
  return {
    path: relative(artifactDirectory, path).replaceAll("\\", "/"),
    kind,
    bytes: metadata.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

export async function writeReceipt(context, checks, artifactInputs) {
  if (!Array.isArray(checks) || checks.length === 0)
    throw new Error("Receipts must declare at least one passing check.");
  const checkIds = new Set();
  for (const check of checks) {
    if (!check || typeof check.id !== "string" || check.id.trim() === "")
      throw new Error("Every receipt check needs a nonempty id.");
    if (checkIds.has(check.id))
      throw new Error(`Receipt check ids must be unique: ${check.id}.`);
    checkIds.add(check.id);
    if (typeof check.summary !== "string" || check.summary.trim() === "")
      throw new Error(`Receipt check ${check.id} needs a nonempty summary.`);
  }
  if (!Array.isArray(artifactInputs) || artifactInputs.length === 0)
    throw new Error(
      "Receipts must declare at least one command-owned artifact.",
    );
  const declaredPaths = new Set();
  for (const input of artifactInputs) {
    if (!input || typeof input.path !== "string" || input.path.trim() === "")
      throw new Error("Every receipt artifact needs a nonempty path.");
    if (typeof input.kind !== "string" || input.kind.trim() === "")
      throw new Error(`Receipt artifact ${input.path} needs a nonempty kind.`);
    const contained = relative(
      context.artifactDirectory,
      resolve(context.artifactDirectory, input.path),
    );
    if (!contained || contained.startsWith("..") || isAbsolute(contained))
      throw new Error(
        `Receipt artifact escapes the artifact directory: ${input.path}.`,
      );
    const normalized = slash(contained);
    if (normalized === "result.json")
      throw new Error(
        "Receipt artifacts cannot claim the receipt file result.json.",
      );
    if (declaredPaths.has(normalized))
      throw new Error(`Receipt artifact paths must be unique: ${input.path}.`);
    declaredPaths.add(normalized);
  }
  const artifacts = [];
  for (const input of artifactInputs) {
    artifacts.push(
      await artifactDeclaration(
        context.artifactDirectory,
        resolve(context.artifactDirectory, input.path),
        input.kind,
      ),
    );
  }
  const receiptPath = resolve(context.artifactDirectory, "result.json");
  await writeJson(receiptPath, {
    schemaVersion: "1.0.0",
    stageId: context.stageId,
    commandId: context.commandId,
    status: "PASS",
    checks: checks.map((item) => ({ ...item, status: "PASS" })),
    artifacts,
  });
  try {
    const receiptContents = await readFile(receiptPath);
    await writeManualEvidenceManifest(context, {
      status: "PASS",
      receipt: {
        path: "result.json",
        sha256: sha256(receiptContents),
        bytes: receiptContents.byteLength,
      },
      artifacts,
      failureClassification: null,
    });
  } catch (error) {
    await unlink(receiptPath).catch((unlinkError) => {
      if (
        !(unlinkError instanceof Error) ||
        !("code" in unlinkError) ||
        unlinkError.code !== "ENOENT"
      )
        throw unlinkError;
    });
    throw error;
  }
}

export async function writeManualEvidenceManifest(context, input) {
  const state = context.manualEvidence ?? {
    manifestId: `manual-${safeName(context.commandId)}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    displayCommand: displayCommand(),
    candidate: candidateFromIdentity(
      await commandIdentity(context.repositoryRoot),
    ),
    telemetry: { runId: null, manifestPath: null },
    finalized: false,
    lastManifest: null,
  };
  context.manualEvidence = state;
  const citations = await durableCitations(context, state.manifestId);
  const declarations = input.artifacts ?? [];
  const manifest = {
    schemaVersion: "1.0.0",
    manifestId: state.manifestId,
    stageId: context.stageId,
    commandId: context.commandId,
    displayCommand: state.displayCommand,
    status: input.status,
    candidate: state.candidate,
    receipt: input.receipt ?? null,
    declaredArtifacts: {
      count: declarations.length,
      bytes: declarations.reduce((sum, artifact) => sum + artifact.bytes, 0),
      declarations,
    },
    telemetry: state.telemetry,
    citationClass: citationClass(citations),
    durableCitations: citations,
    createdAt: state.createdAt,
    finishedAt: new Date().toISOString(),
    failureClassification: input.failureClassification ?? null,
  };
  state.lastManifest = manifest;
  state.finalized = true;
  assertManualEvidenceManifest(manifest);
  await writeJson(
    resolve(context.artifactDirectory, "manifest.json"),
    manifest,
  );
  return manifest;
}

export async function writeManualEvidenceFailure(context, input = {}) {
  const receiptPath = resolve(context.artifactDirectory, "result.json");
  await unlink(receiptPath).catch((error) => {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  });
  return writeManualEvidenceManifest(context, {
    status: input.status ?? "ERROR",
    receipt: null,
    artifacts: input.artifacts ?? [],
    failureClassification: {
      kind: input.kind ?? "unknown",
      message: redactManualText(
        input.message ?? "Command did not produce a passing evidence receipt.",
      ),
    },
  });
}

export function describeResult(result) {
  return {
    command: result.spawnargs?.join(" ") ?? null,
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    supervision: result.supervision ?? null,
  };
}

export function assertCommandPassed(result, label) {
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${label} failed${result.error ? `: ${result.error.message}` : ` with exit ${result.status}`}.`,
    );
  }
}

export function displayArtifact(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/") || basename(path);
}
