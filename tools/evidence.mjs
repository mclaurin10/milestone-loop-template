import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");

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

function trackedCitationPaths(repositoryRoot, needles) {
  const citations = new Set();
  for (let offset = 0; offset < needles.length; offset += 20) {
    const batch = needles.slice(offset, offset + 20);
    if (batch.length === 0) continue;
    const result = spawnSync(
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
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    );
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw new Error(
        `Cannot inspect durable evidence citations: ${result.error?.message ?? result.stderr.trim()}.`,
      );
    for (const path of result.stdout.split(/\r?\n/u))
      if (path.length > 0)
        citations.add(slash(path.startsWith("HEAD:") ? path.slice(5) : path));
  }
  return [...citations].sort();
}

async function durableCitations(context, manifestId) {
  const relativeDirectory = slash(
    relative(context.repositoryRoot, context.artifactDirectory),
  );
  const needles = [manifestId, basename(context.artifactDirectory)];
  if (relativeDirectory.length > 0) {
    needles.push(relativeDirectory, `${relativeDirectory}/result.json`);
  }
  const trackedPaths = trackedCitationPaths(context.repositoryRoot, [
    ...new Set(needles),
  ]);
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
    if (needles.some((needle) => stateText.includes(needle)))
      controllerStateReferences = ["artifacts/orchestrator/state/state.json"];
    const state = JSON.parse(stateText);
    const reconciliation =
      state.activeReconciliation ?? state.reconciliation?.active ?? null;
    if (
      reconciliation &&
      typeof reconciliation === "object" &&
      needles.some((needle) => JSON.stringify(reconciliation).includes(needle))
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
  const stageId = process.env.SKI_VERIFY_STAGE_ID ?? defaultStageId;
  const commandId = process.env.SKI_VERIFY_COMMAND_ID ?? defaultCommandId;
  const artifactDirectory = resolve(
    process.env.SKI_VERIFY_COMMAND_ARTIFACT_DIR ??
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
      candidate: candidateFromIdentity(commandIdentity(repositoryRoot)),
      telemetry: { runId: null, manifestPath: null },
      finalized: false,
      lastManifest: null,
    },
  };
  registerManualEvidenceLifecycle(context);
  return context;
}

export async function beginDirectTelemetry(context, input = {}) {
  if (process.env.SKI_TELEMETRY_PARENT_MANAGED === "1") return null;
  const { TelemetryStore } =
    await import("./milestone-orchestrator/src/telemetry-store.ts");
  const identity = commandIdentity();
  const timestamp = new Date().toISOString().replaceAll(/[^0-9]/g, "");
  const runId =
    process.env.SKI_LOOP_TELEMETRY_RUN_ID ??
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
  if (pnpmPath && /pnpm(?:\.[cm]?js)?$/i.test(pnpmPath)) {
    return { command: process.execPath, args: [pnpmPath, ...args] };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", ...args],
    };
  }
  return { command: "pnpm", args };
}

export function runPnpm(args, options = {}) {
  const invocation = pnpmInvocation(args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

export function commandIdentity(root = repositoryRoot) {
  const output = (command, args) => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  return {
    gitCommit: output("git", ["rev-parse", "HEAD"]),
    gitTree: output("git", ["write-tree"]),
    gitStatus: output("git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]),
    nodeVersion: process.version,
    pnpmVersion: output(
      pnpmInvocation(["--version"]).command,
      pnpmInvocation(["--version"]).args,
    ),
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
    candidate: candidateFromIdentity(commandIdentity(context.repositoryRoot)),
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
