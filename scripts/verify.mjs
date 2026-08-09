#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_COMMAND_KILL_GRACE_MS,
  DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
  superviseCommand,
} from "../tools/milestone-orchestrator/src/process-supervisor.ts";

const RESULT_SCHEMA_VERSION = "2.1.0";
const EVIDENCE_RECEIPT_SCHEMA_VERSION = "1.0.0";
const IMMUTABLE_LOCK_SCHEMA_VERSION = "1.0.0";
const ESTABLISHED_IMMUTABLE_LOCK_SHA256 =
  "d1166088b00c54af65e8654188adc58a3cabd9d7908820809fe66af28c933050";
const REQUIRED_NODE_MAJOR = 24;
const REQUIRED_PNPM_MAJOR = 11;
const IDENTITY_COMMAND_TIMEOUT_MS = 30_000;
const IDENTITY_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
const STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_READY: "NOT_READY",
  ERROR: "ERROR",
});
const STATUS_WEIGHT = Object.freeze({
  [STATUS.PASS]: 0,
  [STATUS.NOT_READY]: 1,
  [STATUS.FAIL]: 2,
  [STATUS.ERROR]: 3,
});
const EXIT_CODE = Object.freeze({
  [STATUS.PASS]: 0,
  [STATUS.FAIL]: 1,
  [STATUS.NOT_READY]: 2,
  [STATUS.ERROR]: 3,
});

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(repositoryRoot, "package.json");
const acceptanceManifestPath = resolve(
  repositoryRoot,
  "evals",
  "acceptance-manifest.json",
);
const immutableContractLockPath = resolve(
  repositoryRoot,
  "evals",
  "immutable-contract-lock.json",
);
const readinessActivationMarkerPath = resolve(
  repositoryRoot,
  ".agent",
  "readiness-profile-activated.json",
);

const contractStage = Object.freeze({
  id: "contract-integrity",
  name: "Frozen authority and acceptance-contract integrity",
  description:
    "Verifies immutable contract hashes, complete requirement sets, and fail-closed gate semantics.",
  acceptanceIds: ["AUTO-01", "AUTONOMOUS-READINESS-01"],
  kind: "contract",
  scripts: [],
  timeoutMs: 30_000,
});

const bootstrapStages = Object.freeze([
  {
    id: "environment",
    name: "Dependency and environment validation",
    description:
      "Validates required runtimes, exact bootstrap pins, and frozen workspace inputs.",
    acceptanceIds: ["AUTO-01"],
    kind: "internal",
    scripts: ["verify:dependencies"],
    requiredArtifactKinds: ["dependency-report"],
    timeoutMs: 120_000,
  },
  {
    id: "format-lint",
    name: "Formatting, linting, and architecture boundaries",
    description:
      "Runs formatting, source lint, and dependency-boundary enforcement.",
    acceptanceIds: ["AUTO-01"],
    scripts: ["format:check", "lint", "lint:architecture"],
    requiredArtifactKinds: [
      "format-report",
      "lint-report",
      "architecture-report",
    ],
    timeoutMs: 300_000,
  },
  {
    id: "typecheck",
    name: "Strict type checking",
    description:
      "Checks every workspace project under the frozen strict TypeScript policy.",
    acceptanceIds: ["AUTO-01"],
    scripts: ["typecheck"],
    requiredArtifactKinds: ["typecheck-report"],
    timeoutMs: 300_000,
  },
  {
    id: "production-build",
    name: "Production build",
    description:
      "Builds the production application from the pinned workspace without development-only fallbacks.",
    acceptanceIds: ["AUTO-01"],
    scripts: ["build"],
    requiredArtifactKinds: ["build-report"],
    timeoutMs: 300_000,
  },
  {
    id: "bootstrap-tests",
    name: "Vitest bootstrap tests",
    description:
      "Runs the technical-scaffold Vitest suite through public package boundaries.",
    acceptanceIds: ["AUTO-01"],
    scripts: ["test:unit"],
    requiredArtifactKinds: ["vitest-report"],
    timeoutMs: 300_000,
  },
  {
    id: "bootstrap-simulation",
    name: "Shared deterministic simulation and replay smoke proof",
    description:
      "Proves one fixed-timestep kernel in Node and a real browser Worker with a recorded user-action replay.",
    acceptanceIds: ["REPLAY-01"],
    scripts: ["verify:bootstrap:simulation"],
    requiredArtifactKinds: [
      "node-checkpoints",
      "worker-checkpoints",
      "user-action-log",
      "replay-report",
      "parity-report",
    ],
    timeoutMs: 300_000,
  },
  {
    id: "bootstrap-persistence",
    name: "Minimal save/load smoke proof",
    description:
      "Proves a versioned save envelope round trip and deterministic continuation for the smoke state.",
    acceptanceIds: ["SAVE-01"],
    scripts: ["verify:bootstrap:persistence"],
    requiredArtifactKinds: ["save-envelope", "save-roundtrip-report"],
    timeoutMs: 300_000,
  },
  {
    id: "bootstrap-browser",
    name: "Real-browser rendered smoke proof",
    description:
      "Launches the production build in the supported browser, validates the rendered scene, captures diagnostics, and saves a screenshot.",
    acceptanceIds: ["VIS-01"],
    scripts: ["verify:bootstrap:browser"],
    requiredArtifactKinds: [
      "playwright-report",
      "screenshot",
      "browser-diagnostics",
      "visual-review",
    ],
    timeoutMs: 300_000,
  },
  contractStage,
]);

const readinessStages = Object.freeze([
  bootstrapStages[0],
  bootstrapStages[1],
  bootstrapStages[2],
  bootstrapStages[3],
  {
    id: "unit-domain",
    name: "Unit, domain, contract, and integration tests",
    description:
      "Runs focused package tests and cross-package production-boundary integration tests.",
    acceptanceIds: ["AUTO-01"],
    scripts: ["test:unit", "test:domain"],
    requiredArtifactKinds: ["vitest-report", "domain-test-report"],
    timeoutMs: 900_000,
  },
  {
    id: "determinism-replay",
    name: "Determinism, cross-host parity, and replay",
    description:
      "Compares canonical checkpoints across fresh Node, replay, and Chromium Worker paths.",
    acceptanceIds: ["REPLAY-01"],
    scripts: ["verify:determinism", "verify:parity", "verify:replay"],
    requiredArtifactKinds: [
      "determinism-report",
      "parity-report",
      "replay-report",
    ],
    timeoutMs: 3_600_000,
  },
  {
    id: "save-load",
    name: "Save/load round trips and corruption rejection",
    description:
      "Checks continuation parity, required checkpoints, validation, and atomic rejection.",
    acceptanceIds: ["SAVE-01"],
    scripts: ["verify:save"],
    requiredArtifactKinds: ["save-validation-report"],
    timeoutMs: 3_600_000,
  },
  {
    id: "headless-scenarios",
    name: "Headless simulation scenarios and fault chains",
    description:
      "Runs accelerated seasons and required operational/emergency scenarios through production rules.",
    acceptanceIds: ["AUTO-01", "FAULT-01"],
    scripts: ["verify:headless"],
    requiredArtifactKinds: ["headless-report"],
    timeoutMs: 3_600_000,
  },
  {
    id: "bot-playtesting",
    name: "User-action-only bot playtesting",
    description:
      "Runs the fixed benchmark and visible seed pool from the frozen starting state.",
    acceptanceIds: ["PLAY-01"],
    scripts: ["benchmark:bot", "benchmark:visible-seeds"],
    requiredArtifactKinds: ["bot-benchmark-report", "visible-seed-report"],
    timeoutMs: 28_800_000,
  },
  {
    id: "browser-interaction",
    name: "Browser launch and interaction",
    description:
      "Exercises the supported desktop browser application and public user-action path.",
    acceptanceIds: ["VIS-01"],
    scripts: ["verify:browser"],
    requiredArtifactKinds: ["browser-interaction-report"],
    timeoutMs: 1_800_000,
  },
  {
    id: "playwright-evidence",
    name: "Playwright screenshots, traces, and time-based evidence",
    description:
      "Captures every required visual state at the configured reference viewport.",
    acceptanceIds: ["VIS-01"],
    scripts: ["verify:visual"],
    requiredArtifactKinds: ["visual-evidence-index"],
    timeoutMs: 3_600_000,
  },
  {
    id: "browser-diagnostics",
    name: "Browser errors, warnings, and runtime diagnostics",
    description:
      "Collects and evaluates console, page, Worker, request, and renderer diagnostics.",
    acceptanceIds: ["VIS-01", "FAULT-01"],
    scripts: ["verify:browser-diagnostics"],
    requiredArtifactKinds: ["browser-diagnostics"],
    timeoutMs: 1_800_000,
  },
  {
    id: "performance",
    name: "Browser and headless performance benchmarks",
    description:
      "Evaluates the fixed reference workloads and records raw timing and memory evidence.",
    acceptanceIds: ["PERF-GATE-01"],
    scripts: ["verify:performance"],
    requiredArtifactKinds: ["performance-report"],
    timeoutMs: 3_600_000,
  },
  {
    id: "acceptance-manifest",
    name: "Acceptance-manifest evaluation",
    description:
      "Evaluates every original metric, chain, seed, evidence, and readiness gate.",
    acceptanceIds: [
      "AUTO-01",
      "PLAY-01",
      "VIS-01",
      "PERF-GATE-01",
      "REPLAY-01",
      "SAVE-01",
      "FAULT-01",
      "AUTONOMOUS-READINESS-01",
    ],
    scripts: ["verify:acceptance"],
    requiredArtifactKinds: ["acceptance-report"],
    timeoutMs: 3_600_000,
  },
  contractStage,
]);

const PROFILES = Object.freeze({
  bootstrap: Object.freeze({
    id: "bootstrap",
    name: "Technical scaffold bootstrap",
    completionClaim: "bootstrap_complete",
    autonomousReadinessEquivalent: false,
    stages: bootstrapStages,
  }),
  readiness: Object.freeze({
    id: "readiness",
    name: "Complete autonomous readiness",
    completionClaim: "autonomous_readiness",
    autonomousReadinessEquivalent: true,
    stages: readinessStages,
  }),
});

function parseArguments(argv) {
  const options = {
    list: false,
    help: false,
    profileId: undefined,
    runId: undefined,
    stageIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--list") {
      options.list = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--stage") {
      const stageId = argv[index + 1];
      if (!stageId) throw new Error("--stage requires a stage ID.");
      options.stageIds.push(stageId);
      index += 1;
    } else if (argument.startsWith("--stage=")) {
      options.stageIds.push(argument.slice("--stage=".length));
    } else if (argument === "--profile") {
      const profileId = argv[index + 1];
      if (!profileId) throw new Error("--profile requires a profile ID.");
      options.profileId = profileId;
      index += 1;
    } else if (argument.startsWith("--profile=")) {
      options.profileId = argument.slice("--profile=".length);
    } else if (argument === "--run-id") {
      const runId = argv[index + 1];
      if (!runId) throw new Error("--run-id requires a value.");
      options.runId = runId;
      index += 1;
    } else if (argument.startsWith("--run-id=")) {
      options.runId = argument.slice("--run-id=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (
    options.profileId !== undefined &&
    !Object.hasOwn(PROFILES, options.profileId)
  ) {
    throw new Error(
      `Unknown verification profile: ${options.profileId}. Expected bootstrap or readiness.`,
    );
  }

  return options;
}

function printHelp() {
  console.log(`Example Project authoritative verification harness

Usage:
  pnpm verify
  pnpm verify -- --profile <bootstrap|readiness>
  pnpm verify -- --stage <stage-id>
  pnpm verify -- --run-id <safe-unique-id>
  node scripts/verify.mjs --list

Every required stage in the selected profile must pass. Bootstrap completion is
not autonomous readiness. Missing prerequisites, evidence receipts, or scripts
are non-passing. Results are written beneath artifacts/<run-id>/.`);
}

function printStageList(profileId = undefined) {
  const profiles =
    profileId === undefined
      ? Object.values(PROFILES)
      : [resolveProfile(profileId)];
  for (const profile of profiles) {
    console.log(`${profile.id} - ${profile.name}`);
    for (const stage of profile.stages) {
      const builtIn = stage.kind === "internal" || stage.kind === "contract";
      const scriptList =
        stage.scripts.length > 0 ? stage.scripts.join(", ") : "none";
      const scripts = builtIn ? `(built-in checks), ${scriptList}` : scriptList;
      console.log(
        `  ${stage.id}\n    ${stage.name}\n    scripts: ${scripts}\n    acceptance trace: ${stage.acceptanceIds.join(", ")}`,
      );
    }
  }
}

function resolveProfile(profileId) {
  const profile = PROFILES[profileId];
  if (!profile) {
    throw new Error(
      `Unknown verification profile: ${profileId}. Expected bootstrap or readiness.`,
    );
  }
  return profile;
}

function defaultRunId() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "-");
  return `verify-${timestamp}-${process.pid}`;
}

function validateRunId(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(runId)) {
    throw new Error(
      "Run ID must be 1-96 characters using only letters, numbers, dot, underscore, or hyphen.",
    );
  }
}

function aggregateStatus(statuses) {
  return statuses.reduce(
    (worst, current) =>
      STATUS_WEIGHT[current] > STATUS_WEIGHT[worst] ? current : worst,
    STATUS.PASS,
  );
}

function check(id, status, message, details = undefined) {
  return { id, status, message, ...(details === undefined ? {} : { details }) };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sha256File(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

async function sha256FileIfPresent(path) {
  return existsSync(path) ? sha256File(path) : null;
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

function stringEnvironment(source) {
  return Object.fromEntries(
    Object.entries(source).filter((entry) => typeof entry[1] === "string"),
  );
}

function renderSupervisedStream(raw, capture) {
  const redacted = redactSensitiveText(raw.toString("utf8"));
  if (!capture.truncated) return redacted;
  const separator =
    redacted.length === 0 || redacted.endsWith("\n") ? "" : "\n";
  return `${redacted}${separator}[output truncated: retained ${capture.bytesCaptured} of ${capture.totalBytesObserved} observed bytes]\n`;
}

async function commandOutput(command, args, cwd = repositoryRoot) {
  const result = await superviseCommand({
    executable: command,
    args,
    cwd,
    env: stringEnvironment(process.env),
    timeoutMs: IDENTITY_COMMAND_TIMEOUT_MS,
    killGraceMs: DEFAULT_COMMAND_KILL_GRACE_MS,
    outputLimitBytes: IDENTITY_OUTPUT_LIMIT_BYTES,
  });
  if (
    result.spawnError ||
    result.supervision.timedOut ||
    result.supervision.outputLimitExceeded ||
    result.exitCode !== 0
  )
    return undefined;
  return redactSensitiveText(result.stdout.toString("utf8")).trim();
}

function pnpmInvocation(args) {
  const pnpmExecPath = process.env.npm_execpath;
  if (
    pnpmExecPath &&
    /pnpm(?:\.[cm]?js)?$/i.test(pnpmExecPath) &&
    existsSync(pnpmExecPath)
  ) {
    return { command: process.execPath, args: [pnpmExecPath, ...args] };
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

async function detectPnpmVersion() {
  const userAgentMatch = process.env.npm_config_user_agent?.match(
    /(?:^|\s)pnpm\/([^\s]+)/,
  );
  if (userAgentMatch) return userAgentMatch[1];
  const invocation = pnpmInvocation(["--version"]);
  return await commandOutput(invocation.command, invocation.args);
}

async function collectCandidateIdentity(packageJson, pnpmVersion) {
  const gitCommit = await commandOutput("git", ["rev-parse", "HEAD"]);
  const gitTree = await commandOutput("git", ["rev-parse", "HEAD^{tree}"]);
  const gitStatus = await commandOutput("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);

  return {
    gitCommit: gitCommit ?? null,
    gitTree: gitTree ?? null,
    workingTreeDirty: gitStatus === undefined ? null : gitStatus.length > 0,
    packageJsonSha256: await sha256FileIfPresent(packageJsonPath),
    workspaceManifestSha256: await sha256FileIfPresent(
      resolve(repositoryRoot, "pnpm-workspace.yaml"),
    ),
    lockfileSha256: await sha256FileIfPresent(
      resolve(repositoryRoot, "pnpm-lock.yaml"),
    ),
    acceptanceManifestSha256: await sha256FileIfPresent(acceptanceManifestPath),
    immutableContractLockSha256: await sha256FileIfPresent(
      immutableContractLockPath,
    ),
    readinessActivationMarkerSha256: await sha256FileIfPresent(
      readinessActivationMarkerPath,
    ),
    nodeVersion: process.version,
    pnpmVersion: pnpmVersion ?? null,
    packageNodePin: packageJson?.engines?.node ?? null,
    packageManagerPin: packageJson?.packageManager ?? null,
    platform: process.platform,
    architecture: process.arch,
  };
}

async function evaluateEnvironment(
  packageLoad,
  pnpmVersion,
  artifactRoot,
  profile,
  candidate,
  fullRun,
) {
  const started = Date.now();
  const checks = [];
  const stage = profile.stages.find((item) => item.id === "environment");
  const {
    packageJson,
    error: packageError,
    exists: packageExists,
  } = packageLoad;
  const nodeVersion = process.versions.node;
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  const pnpmMajor = pnpmVersion
    ? Number.parseInt(pnpmVersion.split(".")[0], 10)
    : undefined;

  checks.push(
    check(
      "package-manifest",
      packageError
        ? STATUS.FAIL
        : packageExists
          ? STATUS.PASS
          : STATUS.NOT_READY,
      packageError
        ? `package.json cannot be parsed: ${packageError}`
        : packageExists
          ? "package.json exists and is valid JSON."
          : "package.json is missing, so the authoritative package entry point is unavailable.",
    ),
  );

  const activationMarkerExists = existsSync(readinessActivationMarkerPath);
  let activationMarkerValid = false;
  if (activationMarkerExists) {
    try {
      const marker = await readJson(readinessActivationMarkerPath);
      activationMarkerValid =
        marker.schemaVersion === "1.0.0" &&
        marker.state === "readiness" &&
        marker.previousState === "bootstrap" &&
        /^\d{4}-\d{2}-\d{2}$/.test(marker.activatedDate) &&
        typeof marker.reason === "string" &&
        marker.reason.length > 0;
    } catch {
      activationMarkerValid = false;
    }
  }
  const activationCommit = commandOutput("git", [
    "log",
    "-1",
    "--format=%H",
    "--",
    ".agent/readiness-profile-activated.json",
  ]);
  const activationWasCommitted =
    typeof activationCommit === "string" && activationCommit.length > 0;
  const lifecycleStatus =
    profile.id === "bootstrap"
      ? !activationMarkerExists && !activationWasCommitted
        ? STATUS.PASS
        : STATUS.FAIL
      : activationMarkerExists && activationMarkerValid
        ? STATUS.PASS
        : activationMarkerExists || activationWasCommitted
          ? STATUS.FAIL
          : STATUS.NOT_READY;
  checks.push(
    check(
      "one-way-profile-lifecycle",
      lifecycleStatus,
      profile.id === "bootstrap"
        ? lifecycleStatus === STATUS.PASS
          ? "Readiness activation has never been committed; bootstrap remains the valid lifecycle phase."
          : "Readiness activation exists in the tree or Git history; returning to bootstrap is forbidden."
        : lifecycleStatus === STATUS.PASS
          ? "The permanent readiness activation marker is present and valid."
          : activationWasCommitted
            ? "The readiness activation marker was committed and later removed; deletion is forbidden."
            : activationMarkerExists
              ? "The readiness activation marker is malformed."
              : "Readiness requires committing .agent/readiness-profile-activated.json during the one-way transition.",
      {
        activationMarkerExists,
        activationMarkerValid,
        activationCommit: activationCommit || null,
      },
    ),
  );

  checks.push(
    check(
      "node-runtime-major",
      nodeMajor === REQUIRED_NODE_MAJOR ? STATUS.PASS : STATUS.FAIL,
      nodeMajor === REQUIRED_NODE_MAJOR
        ? `Node.js ${nodeVersion} satisfies required major ${REQUIRED_NODE_MAJOR}.`
        : `Node.js ${nodeVersion} does not satisfy required major ${REQUIRED_NODE_MAJOR}.`,
    ),
  );
  checks.push(
    check(
      "pnpm-runtime-major",
      pnpmVersion === undefined
        ? STATUS.NOT_READY
        : pnpmMajor === REQUIRED_PNPM_MAJOR
          ? STATUS.PASS
          : STATUS.FAIL,
      pnpmVersion === undefined
        ? "pnpm is unavailable; install the exact pinned pnpm 11 release."
        : pnpmMajor === REQUIRED_PNPM_MAJOR
          ? `pnpm ${pnpmVersion} satisfies required major ${REQUIRED_PNPM_MAJOR}.`
          : `pnpm ${pnpmVersion} does not satisfy required major ${REQUIRED_PNPM_MAJOR}.`,
    ),
  );

  const nodePin = packageJson?.engines?.node;
  const nodePinIsExact =
    typeof nodePin === "string" && /^24\.\d+\.\d+$/.test(nodePin);
  checks.push(
    check(
      "exact-node-pin",
      nodePinIsExact ? STATUS.PASS : STATUS.NOT_READY,
      nodePinIsExact
        ? `package.json pins Node.js exactly to ${nodePin}.`
        : "package.json must pin an exact Node.js 24.x.y version during scaffold bootstrap.",
    ),
  );

  checks.push(
    check(
      "node-runtime-exact-pin",
      !nodePinIsExact
        ? STATUS.NOT_READY
        : nodeVersion === nodePin
          ? STATUS.PASS
          : STATUS.FAIL,
      !nodePinIsExact
        ? "An exact Node.js pin is required before runtime equality can be verified."
        : nodeVersion === nodePin
          ? `Running Node.js ${nodeVersion} exactly matches the package pin.`
          : `Running Node.js ${nodeVersion} does not equal the package pin ${nodePin}.`,
    ),
  );

  const packageManagerPin = packageJson?.packageManager;
  const pnpmPinIsExact =
    typeof packageManagerPin === "string" &&
    /^pnpm@11\.\d+\.\d+(?:\+sha512\.[A-Za-z0-9+/=]+)?$/.test(packageManagerPin);
  checks.push(
    check(
      "exact-pnpm-pin",
      pnpmPinIsExact ? STATUS.PASS : STATUS.NOT_READY,
      pnpmPinIsExact
        ? `package.json pins pnpm exactly to ${packageManagerPin}.`
        : "package.json must pin an exact pnpm 11.x.y version during scaffold bootstrap.",
    ),
  );

  const pinnedPnpmVersion = pnpmPinIsExact
    ? packageManagerPin.slice("pnpm@".length).split("+")[0]
    : undefined;
  checks.push(
    check(
      "pnpm-runtime-exact-pin",
      pinnedPnpmVersion === undefined || pnpmVersion === undefined
        ? STATUS.NOT_READY
        : pnpmVersion === pinnedPnpmVersion
          ? STATUS.PASS
          : STATUS.FAIL,
      pinnedPnpmVersion === undefined
        ? "An exact pnpm pin is required before runtime equality can be verified."
        : pnpmVersion === undefined
          ? "pnpm is unavailable, so exact pin equality cannot be verified."
          : pnpmVersion === pinnedPnpmVersion
            ? `Running pnpm ${pnpmVersion} exactly matches the package pin.`
            : `Running pnpm ${pnpmVersion} does not equal the package pin ${pinnedPnpmVersion}.`,
    ),
  );

  const configuredProfile =
    packageJson?.milestoneLoop?.verification?.defaultProfile;
  checks.push(
    check(
      "default-verification-profile",
      Object.hasOwn(PROFILES, configuredProfile)
        ? STATUS.PASS
        : STATUS.NOT_READY,
      Object.hasOwn(PROFILES, configuredProfile)
        ? `package.json selects the supported ${configuredProfile} verification profile.`
        : "package.json must select bootstrap or readiness at milestoneLoop.verification.defaultProfile.",
      {
        configuredProfile: configuredProfile ?? null,
        selectedProfile: profile.id,
      },
    ),
  );

  checks.push(
    check(
      "selected-profile-is-default-for-full-run",
      !fullRun || configuredProfile === profile.id ? STATUS.PASS : STATUS.FAIL,
      !fullRun
        ? "Focused verification is diagnostic and may explicitly inspect either profile."
        : configuredProfile === profile.id
          ? `Full verification uses the package-selected ${profile.id} profile.`
          : `Full verification selected ${profile.id}, but package.json defaults to ${configuredProfile ?? "no valid profile"}.`,
    ),
  );

  checks.push(
    check(
      "clean-working-tree-for-full-run",
      !fullRun
        ? STATUS.PASS
        : candidate.workingTreeDirty === false
          ? STATUS.PASS
          : STATUS.FAIL,
      !fullRun
        ? "Focused verification is diagnostic and not completion-eligible; clean-tree proof is deferred to a full run."
        : candidate.workingTreeDirty === false
          ? "The full-run candidate working tree is clean."
          : candidate.workingTreeDirty === null
            ? "Git working-tree state is unavailable for this full run."
            : "The full-run candidate working tree is dirty; completion evidence requires a clean committed tree.",
    ),
  );

  checks.push(
    check(
      "authoritative-package-script",
      packageJson?.scripts?.verify === "node scripts/verify.mjs"
        ? STATUS.PASS
        : STATUS.FAIL,
      packageJson?.scripts?.verify === "node scripts/verify.mjs"
        ? "package.json maps pnpm verify to scripts/verify.mjs."
        : "package.json must map verify exactly to node scripts/verify.mjs.",
    ),
  );

  const requiredFiles = [
    ["workspace-manifest", "pnpm-workspace.yaml"],
    ["frozen-lockfile", "pnpm-lock.yaml"],
  ];
  for (const [id, path] of requiredFiles) {
    checks.push(
      check(
        id,
        existsSync(resolve(repositoryRoot, path))
          ? STATUS.PASS
          : STATUS.NOT_READY,
        existsSync(resolve(repositoryRoot, path))
          ? `${path} exists.`
          : `${path} is not present; the application workspace has not been scaffolded.`,
      ),
    );
  }

  const commands = [];
  for (const [index, scriptName] of stage.scripts.entries()) {
    commands.push(
      await runPackageScript(
        stage,
        scriptName,
        packageJson,
        artifactRoot,
        index,
      ),
    );
  }

  checks.push(...requiredArtifactChecks(stage, commands));

  return {
    id: "environment",
    name: stage.name,
    description: stage.description,
    acceptanceIds: stage.acceptanceIds,
    required: true,
    status: aggregateStatus([
      ...checks.map((item) => item.status),
      ...commands.map((item) => item.status),
    ]),
    durationMs: Date.now() - started,
    checks,
    commands,
  };
}

async function validateAcceptanceManifest() {
  const checks = [];
  const immutablePaths = [
    "PROJECT_GOAL.md",
    "evals/ACCEPTANCE.md",
    "evals/acceptance-manifest.json",
    "evals/HIDDEN_VALIDATION_PROTOCOL.md",
  ];

  if (!existsSync(immutableContractLockPath)) {
    checks.push(
      check(
        "immutable-contract-lock",
        STATUS.NOT_READY,
        "evals/immutable-contract-lock.json is missing.",
      ),
    );
  } else {
    try {
      const lockHash = await sha256File(immutableContractLockPath);
      checks.push(
        check(
          "immutable-contract-lock-hash",
          lockHash === ESTABLISHED_IMMUTABLE_LOCK_SHA256
            ? STATUS.PASS
            : STATUS.FAIL,
          lockHash === ESTABLISHED_IMMUTABLE_LOCK_SHA256
            ? "Immutable contract lock matches the verifier-anchored established hash."
            : "Immutable contract lock changed without a corresponding reviewed verifier transition.",
        ),
      );
      const lock = await readJson(immutableContractLockPath);
      const lockedPaths = Array.isArray(lock.files)
        ? lock.files.map((entry) => entry.path)
        : [];
      const allowedChangeClasses = new Set([
        "HUMAN_REVISION_ONLY",
        "CAL1_PROVISIONAL_FIELDS_ONCE_OR_HUMAN_REVISION",
      ]);
      const calibrationStateValid =
        lock.calibrationTransition?.maximumCount === 1 &&
        ((lock.calibrationTransition?.state === "open_not_started" &&
          lock.calibrationTransition?.completedCount === 0 &&
          lock.calibrationTransition?.recordPath === null) ||
          (lock.calibrationTransition?.state === "calibration_frozen" &&
            lock.calibrationTransition?.completedCount === 1 &&
            lock.calibrationTransition?.recordPath ===
              "evals/CALIBRATION_RECORD.md"));
      const exactPathSet =
        lock.schemaVersion === IMMUTABLE_LOCK_SCHEMA_VERSION &&
        lockedPaths.length === immutablePaths.length &&
        immutablePaths.every((path) => lockedPaths.includes(path)) &&
        lock.files.every(
          (entry) =>
            allowedChangeClasses.has(entry.changeClass) &&
            /^[a-f0-9]{64}$/.test(entry.baselineSha256) &&
            /^[a-f0-9]{64}$/.test(entry.activeSha256),
        ) &&
        calibrationStateValid;
      checks.push(
        check(
          "immutable-contract-lock-schema",
          exactPathSet ? STATUS.PASS : STATUS.FAIL,
          exactPathSet
            ? "Immutable contract lock has the required schema and complete authority-file set."
            : "Immutable contract lock schema or authority-file set is invalid.",
        ),
      );
      if (exactPathSet) {
        const mismatches = [];
        for (const entry of lock.files) {
          const absolutePath = resolve(repositoryRoot, entry.path);
          if (!existsSync(absolutePath)) {
            mismatches.push(`${entry.path}:missing`);
            continue;
          }
          const actual = await sha256File(absolutePath);
          const openCalibrationChanged =
            lock.calibrationTransition.state === "open_not_started" &&
            entry.activeSha256 !== entry.baselineSha256;
          const humanOnlyChanged =
            entry.changeClass === "HUMAN_REVISION_ONLY" &&
            entry.activeSha256 !== entry.baselineSha256;
          if (
            actual !== entry.activeSha256 ||
            openCalibrationChanged ||
            humanOnlyChanged
          ) {
            mismatches.push(`${entry.path}:hash_mismatch`);
          }
        }
        checks.push(
          check(
            "immutable-contract-hashes",
            mismatches.length === 0 ? STATUS.PASS : STATUS.FAIL,
            mismatches.length === 0
              ? "Frozen goal and original evaluation contracts match their established SHA-256 hashes."
              : `Frozen authority mismatch: ${mismatches.join(", ")}.`,
          ),
        );
      }
    } catch (error) {
      checks.push(
        check(
          "immutable-contract-lock-json",
          STATUS.FAIL,
          `Immutable contract lock cannot be parsed: ${error.message}`,
        ),
      );
    }
  }

  if (!existsSync(acceptanceManifestPath)) {
    return [
      ...checks,
      check(
        "manifest-present",
        STATUS.NOT_READY,
        "evals/acceptance-manifest.json is missing.",
      ),
    ];
  }

  let manifest;
  try {
    manifest = await readJson(acceptanceManifestPath);
    checks.push(
      check("manifest-json", STATUS.PASS, "Acceptance manifest is valid JSON."),
    );
  } catch (error) {
    return [
      check(
        "manifest-json",
        STATUS.FAIL,
        `Acceptance manifest cannot be parsed: ${error.message}`,
      ),
    ];
  }

  const layerIds = new Set(
    Array.isArray(manifest.validationLayers)
      ? manifest.validationLayers
          .filter((layer) => layer.required)
          .map((layer) => layer.id)
      : [],
  );
  const expectedLayerIds = [
    "AUTO-01",
    "PLAY-01",
    "VIS-01",
    "PERF-GATE-01",
    "REPLAY-01",
    "SAVE-01",
    "FAULT-01",
  ];
  const exactLayerSet =
    layerIds.size === expectedLayerIds.length &&
    expectedLayerIds.every((id) => layerIds.has(id));
  checks.push(
    check(
      "required-validation-layers",
      exactLayerSet ? STATUS.PASS : STATUS.FAIL,
      exactLayerSet
        ? "The exact seven original required validation-layer IDs are present and required."
        : "The original required validation-layer set was changed, duplicated, or made non-required.",
    ),
  );

  const expectedBotIds = ["BOT-01", "BOT-02", "BOT-03"];
  const botIds = Array.isArray(manifest.botRequirements)
    ? manifest.botRequirements.map((requirement) => requirement.id)
    : [];
  const exactBotSet =
    botIds.length === expectedBotIds.length &&
    expectedBotIds.every((id) => botIds.includes(id));
  checks.push(
    check(
      "required-bot-requirements",
      exactBotSet ? STATUS.PASS : STATUS.FAIL,
      exactBotSet
        ? "All original bot requirements are present."
        : "The original bot requirement set was changed.",
    ),
  );

  const completionMetrics = Array.isArray(manifest.completionMetrics)
    ? manifest.completionMetrics
    : [];
  const operationalChains = Array.isArray(manifest.operationalChains)
    ? manifest.operationalChains
    : [];
  const normativeIds = [
    ...completionMetrics.map((metric) => metric.id),
    ...botIds,
    ...operationalChains,
    ...[...layerIds],
    manifest.seedSets?.benchmark?.gateId,
    manifest.seedSets?.visibleDevelopment?.gateId,
    manifest.seedSets?.hidden?.successGateId,
    manifest.seedSets?.hidden?.integrityGateId,
    manifest.readinessGate?.id,
    manifest.humanAcceptanceGate?.id,
  ];
  const normativeIdsAreComplete =
    completionMetrics.length === 4 &&
    operationalChains.length === 2 &&
    normativeIds.length === 22 &&
    normativeIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(normativeIds).size === normativeIds.length;
  checks.push(
    check(
      "complete-normative-id-set",
      normativeIdsAreComplete ? STATUS.PASS : STATUS.FAIL,
      normativeIdsAreComplete
        ? "Manifest retains 4 metrics, 3 bot requirements, 2 chains, 7 layers, and 22 unique normative IDs."
        : "Manifest requirement counts or unique normative IDs no longer match the original contract.",
    ),
  );

  const thresholds = [
    ...completionMetrics.flatMap((metric) =>
      Array.isArray(metric.thresholds) ? metric.thresholds : [],
    ),
    ...(Array.isArray(manifest.botRequirements)
      ? manifest.botRequirements.map((requirement) => requirement.threshold)
      : []),
    ...Object.values(manifest.seedSets ?? {})
      .filter((seedSet) => seedSet?.freeze)
      .map((seedSet) => ({ freeze: seedSet.freeze })),
  ];
  const thresholdClassesValid =
    thresholds.length === 10 &&
    thresholds.every(
      (threshold) =>
        threshold &&
        ["IMMUTABLE", "CAL-1_PROVISIONAL"].includes(threshold.freeze),
    );
  checks.push(
    check(
      "threshold-freeze-coverage",
      thresholdClassesValid ? STATUS.PASS : STATUS.FAIL,
      thresholdClassesValid
        ? "All 10 original threshold objects retain an allowed freeze class."
        : "Threshold count or freeze-class coverage differs from the original contract.",
    ),
  );

  const seedRulesValid =
    manifest.seedSets?.benchmark?.minimumSuccesses === 1 &&
    manifest.seedSets?.benchmark?.requiredSuccessRate === 1 &&
    manifest.seedSets?.visibleDevelopment?.requiredRuns === 16 &&
    manifest.seedSets?.visibleDevelopment?.minimumSuccesses === 13 &&
    manifest.seedSets?.hidden?.requiredRuns === 20 &&
    manifest.seedSets?.hidden?.minimumSuccesses === 16 &&
    manifest.seedSets?.hidden?.valuesInRepository === false &&
    manifest.seedSets?.benchmark?.requireZeroCatastrophicIntegrityFailures ===
      true &&
    manifest.seedSets?.visibleDevelopment
      ?.requireZeroCatastrophicIntegrityFailures === true &&
    manifest.seedSets?.hidden?.requireZeroCatastrophicIntegrityFailures ===
      true;
  checks.push(
    check(
      "seed-and-integrity-gates",
      seedRulesValid ? STATUS.PASS : STATUS.FAIL,
      seedRulesValid
        ? "Benchmark, visible, hidden, and zero-catastrophic-integrity seed gates retain their frozen aggregation."
        : "A frozen benchmark, visible, hidden, custody, or integrity seed rule changed.",
    ),
  );

  const plannedVerify = manifest.plannedCommandSurface?.commands?.find(
    (command) => command.id === "verify_full",
  );
  checks.push(
    check(
      "authoritative-command",
      plannedVerify?.plannedCommand === "pnpm verify"
        ? STATUS.PASS
        : STATUS.FAIL,
      plannedVerify?.plannedCommand === "pnpm verify"
        ? "Manifest authoritative command is pnpm verify."
        : "Manifest must retain pnpm verify as verify_full.",
    ),
  );

  const profileContract = manifest.plannedCommandSurface?.profileContract;
  checks.push(
    check(
      "readiness-profile-contract",
      profileContract?.additiveRequirementId === "HARNESS-PROFILE-01" &&
        profileContract?.bootstrapIsAutonomousReadinessEvidence === false &&
        profileContract?.requiredDefaultProfileForAutonomousReadiness ===
          "readiness" &&
        profileContract?.profileOwner ===
          "package.json#milestoneLoop.verification.defaultProfile"
        ? STATUS.PASS
        : STATUS.FAIL,
      "The manifest must reject bootstrap as readiness evidence and require the package-default readiness profile.",
    ),
  );

  const readiness = manifest.readinessGate;
  const readinessRequirements = new Set(readiness?.requirements ?? []);
  checks.push(
    check(
      "readiness-aggregation",
      readiness?.id === "AUTONOMOUS-READINESS-01" &&
        readiness?.aggregation === "all" &&
        readinessRequirements.has("all_bot_requirements_pass") &&
        readiness?.compensationBetweenRequirementsAllowed === false
        ? STATUS.PASS
        : STATUS.FAIL,
      "Readiness must remain all-requirements, non-compensating AUTONOMOUS-READINESS-01.",
    ),
  );

  try {
    const acceptanceText = await readFile(
      resolve(repositoryRoot, "evals", "ACCEPTANCE.md"),
      "utf8",
    );
    checks.push(
      check(
        "acceptance-prose-bot-aggregation",
        acceptanceText.includes("`BOT-01` through `BOT-03` pass.")
          ? STATUS.PASS
          : STATUS.FAIL,
        "Acceptance prose must aggregate BOT-01 through BOT-03 without omitting the score requirement.",
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "acceptance-prose-readable",
        STATUS.FAIL,
        `Acceptance prose cannot be read: ${error.message}`,
      ),
    );
  }

  return checks;
}

function isContainedPath(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

async function validateEvidenceReceipt(stage, scriptName, commandArtifactRoot) {
  const receiptPath = resolve(commandArtifactRoot, "result.json");
  if (!existsSync(receiptPath)) {
    return {
      valid: false,
      message:
        "Command exited 0 but did not write its required result.json evidence receipt.",
      receipt: null,
      artifacts: [],
    };
  }

  let receipt;
  try {
    receipt = await readJson(receiptPath);
  } catch (error) {
    return {
      valid: false,
      message: `Evidence receipt is not valid JSON: ${error.message}`,
      receipt: null,
      artifacts: [],
    };
  }

  const checks = Array.isArray(receipt.checks) ? receipt.checks : [];
  const checkIds = checks.map((item) => item?.id);
  const checksValid =
    checks.length > 0 &&
    checks.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        item.id.length > 0 &&
        item.status === STATUS.PASS &&
        typeof item.summary === "string" &&
        item.summary.length > 0,
    ) &&
    new Set(checkIds).size === checkIds.length;
  const identityValid =
    receipt.schemaVersion === EVIDENCE_RECEIPT_SCHEMA_VERSION &&
    receipt.stageId === stage.id &&
    receipt.commandId === scriptName &&
    receipt.status === STATUS.PASS;
  if (!identityValid || !checksValid) {
    return {
      valid: false,
      message:
        "Evidence receipt identity, PASS-only checks, or schema is invalid.",
      receipt,
      artifacts: [],
    };
  }

  const artifacts = Array.isArray(receipt.artifacts) ? receipt.artifacts : [];
  if (artifacts.length === 0) {
    return {
      valid: false,
      message:
        "Evidence receipt must declare at least one non-empty command-owned artifact.",
      receipt,
      artifacts: [],
    };
  }

  const verifiedArtifacts = [];
  const artifactPaths = new Set();
  const realCommandRoot = await realpath(commandArtifactRoot);
  for (const artifact of artifacts) {
    if (
      !artifact ||
      typeof artifact.path !== "string" ||
      artifact.path.length === 0 ||
      artifact.path === "result.json" ||
      artifactPaths.has(artifact.path) ||
      typeof artifact.kind !== "string" ||
      artifact.kind.length === 0 ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    ) {
      return {
        valid: false,
        message: "Evidence receipt contains an invalid artifact declaration.",
        receipt,
        artifacts: verifiedArtifacts,
      };
    }
    const artifactPath = resolve(commandArtifactRoot, artifact.path);
    if (
      !isContainedPath(commandArtifactRoot, artifactPath) ||
      !existsSync(artifactPath)
    ) {
      return {
        valid: false,
        message: `Evidence artifact is missing or outside its command directory: ${artifact.path}.`,
        receipt,
        artifacts: verifiedArtifacts,
      };
    }
    const realArtifactPath = await realpath(artifactPath);
    if (!isContainedPath(realCommandRoot, realArtifactPath)) {
      return {
        valid: false,
        message: `Evidence artifact resolves outside its command directory: ${artifact.path}.`,
        receipt,
        artifacts: verifiedArtifacts,
      };
    }
    const artifactStat = await stat(artifactPath);
    const artifactHash = artifactStat.isFile()
      ? await sha256File(artifactPath)
      : null;
    if (
      !artifactStat.isFile() ||
      artifactStat.size !== artifact.bytes ||
      artifactHash !== artifact.sha256
    ) {
      return {
        valid: false,
        message: `Evidence artifact size or hash does not match its receipt: ${artifact.path}.`,
        receipt,
        artifacts: verifiedArtifacts,
      };
    }
    artifactPaths.add(artifact.path);
    verifiedArtifacts.push({
      path: artifact.path,
      kind: artifact.kind,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    });
  }

  return {
    valid: true,
    message: `Validated ${checks.length} checks and ${verifiedArtifacts.length} hashed artifacts.`,
    receipt,
    artifacts: verifiedArtifacts,
  };
}

function requiredArtifactChecks(stage, commands) {
  const requiredKinds = stage.requiredArtifactKinds ?? [];
  if (
    requiredKinds.length === 0 ||
    commands.some((command) => command.status !== STATUS.PASS)
  ) {
    return [];
  }
  const presentKinds = new Set(
    commands
      .flatMap((command) => command.evidence?.artifacts ?? [])
      .map((artifact) => artifact.kind),
  );
  const missingKinds = requiredKinds.filter((kind) => !presentKinds.has(kind));
  return [
    check(
      "required-artifact-kinds",
      missingKinds.length === 0 ? STATUS.PASS : STATUS.FAIL,
      missingKinds.length === 0
        ? `All required evidence kinds are present: ${requiredKinds.join(", ")}.`
        : `Required evidence kinds are missing: ${missingKinds.join(", ")}.`,
      { requiredKinds, presentKinds: [...presentKinds] },
    ),
  ];
}

async function runPackageScript(
  stage,
  scriptName,
  packageJson,
  artifactRoot,
  index,
) {
  const commandStarted = Date.now();
  const safeName = scriptName.replaceAll(":", "-");
  const relativeLogPath = `logs/${stage.id}-${String(index + 1).padStart(2, "0")}-${safeName}.log`;
  const absoluteLogPath = resolve(artifactRoot, relativeLogPath);
  const relativeStageRoot = `stages/${stage.id}`;
  const absoluteStageRoot = resolve(artifactRoot, relativeStageRoot);
  const relativeCommandRoot = `${relativeStageRoot}/${String(index + 1).padStart(2, "0")}-${safeName}`;
  const absoluteCommandRoot = resolve(artifactRoot, relativeCommandRoot);

  if (typeof packageJson?.scripts?.[scriptName] !== "string") {
    return {
      script: scriptName,
      displayCommand: `pnpm run ${scriptName}`,
      status: STATUS.NOT_READY,
      exitCode: null,
      signal: null,
      durationMs: Date.now() - commandStarted,
      log: null,
      evidence: null,
      message: `Required package script "${scriptName}" is not defined.`,
    };
  }

  await mkdir(dirname(absoluteLogPath), { recursive: true });
  await mkdir(absoluteCommandRoot, { recursive: true });
  const invocation = pnpmInvocation(["run", scriptName]);

  console.log(`[RUN] ${stage.id}: pnpm run ${scriptName}`);
  const supervised = await superviseCommand({
    executable: invocation.command,
    args: invocation.args,
    cwd: repositoryRoot,
    env: stringEnvironment({
      ...process.env,
      LOOP_VERIFY_RUN_ID: artifactRoot.split(/[\\/]/).at(-1),
      LOOP_VERIFY_ARTIFACT_ROOT: artifactRoot,
      LOOP_VERIFY_STAGE_ID: stage.id,
      LOOP_VERIFY_STAGE_ARTIFACT_DIR: absoluteStageRoot,
      LOOP_VERIFY_COMMAND_ID: scriptName,
      LOOP_VERIFY_COMMAND_ARTIFACT_DIR: absoluteCommandRoot,
      LOOP_ACCEPTANCE_MANIFEST: acceptanceManifestPath,
    }),
    timeoutMs: stage.timeoutMs,
    killGraceMs: DEFAULT_COMMAND_KILL_GRACE_MS,
    outputLimitBytes: DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES,
  });
  const { supervision, spawnError, exitCode, signal } = supervised;
  const stdoutText = renderSupervisedStream(
    supervised.stdout,
    supervision.stdout,
  );
  const stderrText = renderSupervisedStream(
    supervised.stderr,
    supervision.stderr,
  );
  const logChunks = [];
  if (stdoutText.length > 0) {
    logChunks.push(`[stdout] ${stdoutText}`);
    process.stdout.write(
      `[${stage.id}] ${stdoutText}${stdoutText.endsWith("\n") ? "" : "\n"}`,
    );
  }
  if (stderrText.length > 0) {
    logChunks.push(`[stderr] ${stderrText}`);
    process.stderr.write(
      `[${stage.id}] ${stderrText}${stderrText.endsWith("\n") ? "" : "\n"}`,
    );
  }
  if (supervision.timedOut)
    logChunks.push(`[harness] Timed out after ${stage.timeoutMs} ms.\n`);
  if (supervision.outputLimitExceeded)
    logChunks.push(
      `[harness] Per-stream output limit ${DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES} bytes exceeded.\n`,
    );
  await writeFile(absoluteLogPath, logChunks.join(""), "utf8");

  let evidence = null;
  if (
    !spawnError &&
    !supervision.timedOut &&
    !supervision.outputLimitExceeded &&
    exitCode === 0
  ) {
    try {
      evidence = await validateEvidenceReceipt(
        stage,
        scriptName,
        absoluteCommandRoot,
      );
    } catch (error) {
      evidence = {
        valid: false,
        message: `Evidence validation raised an error: ${error.message}`,
        receipt: null,
        artifacts: [],
      };
    }
  }
  const status = spawnError
    ? STATUS.ERROR
    : supervision.timedOut
      ? STATUS.FAIL
      : supervision.outputLimitExceeded
        ? STATUS.ERROR
        : exitCode === 0
          ? evidence?.valid
            ? STATUS.PASS
            : STATUS.FAIL
          : exitCode === EXIT_CODE[STATUS.NOT_READY]
            ? STATUS.NOT_READY
            : STATUS.FAIL;
  const message = spawnError
    ? `Could not start command: ${redactSensitiveText(spawnError.message)}`
    : supervision.timedOut
      ? `Command timed out after ${stage.timeoutMs} ms.`
      : supervision.outputLimitExceeded
        ? supervision.terminationReason === "output-limit"
          ? `Command exceeded the ${DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES}-byte per-stream output limit; output was truncated and the process tree terminated.`
          : `Command exceeded the ${DEFAULT_COMMAND_OUTPUT_LIMIT_BYTES}-byte per-stream output limit while draining after exit; output was truncated and remaining streams were cut off.`
        : exitCode === 0
          ? evidence?.valid
            ? `Command passed with validated evidence. ${evidence.message}`
            : `Command exited 0 but evidence validation failed. ${evidence?.message ?? "No evidence result was produced."}`
          : exitCode === EXIT_CODE[STATUS.NOT_READY]
            ? "Command reported NOT_READY (exit 2)."
            : `Command failed with exit ${exitCode}${signal ? ` and signal ${signal}` : ""}.`;
  return {
    script: scriptName,
    displayCommand: `pnpm run ${scriptName}`,
    status,
    exitCode,
    signal,
    durationMs: Date.now() - commandStarted,
    log: relativeLogPath,
    artifactDirectory: relativeCommandRoot,
    evidence:
      evidence === null
        ? null
        : {
            receipt: `${relativeCommandRoot}/result.json`,
            valid: evidence.valid,
            message: evidence.message,
            checks: evidence.receipt?.checks ?? [],
            artifacts: evidence.artifacts.map((artifact) => ({
              ...artifact,
              path: `${relativeCommandRoot}/${artifact.path}`,
            })),
          },
    supervision,
    message,
  };
}

async function evaluateScriptStage(stage, packageJson, artifactRoot) {
  const started = Date.now();
  const checks =
    stage.kind === "contract" ? await validateAcceptanceManifest() : [];
  const commands = [];
  for (const [index, scriptName] of stage.scripts.entries()) {
    commands.push(
      await runPackageScript(
        stage,
        scriptName,
        packageJson,
        artifactRoot,
        index,
      ),
    );
  }
  checks.push(...requiredArtifactChecks(stage, commands));
  const statuses = [
    ...checks.map((item) => item.status),
    ...commands.map((item) => item.status),
  ];
  return {
    id: stage.id,
    name: stage.name,
    description: stage.description,
    acceptanceIds: stage.acceptanceIds,
    required: true,
    status: aggregateStatus(statuses),
    durationMs: Date.now() - started,
    checks,
    commands,
  };
}

function relativeFromRepository(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

async function atomicWriteJson(path, value) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildSummary(result) {
  const lines = [
    "# Example Project Verification Result",
    "",
    `- Run: \`${result.runId}\``,
    `- Profile: \`${result.profile.id}\` (${result.profile.name})`,
    `- Status: **${result.status}**`,
    `- Exit code: \`${result.exitCode}\``,
    `- Completion eligible: \`${result.completion.eligible}\``,
    `- Completion claim: \`${result.completion.claim}\``,
    `- Autonomous-readiness equivalent: \`${result.profile.autonomousReadinessEquivalent}\``,
    `- Started: \`${result.startedAt}\``,
    `- Finished: \`${result.finishedAt}\``,
    `- Git commit: \`${result.candidate.gitCommit ?? "unavailable"}\``,
    `- Working tree dirty: \`${result.candidate.workingTreeDirty ?? "unknown"}\``,
    "",
    "| Stage | Status | Required command gaps/failures |",
    "|---|---:|---|",
  ];

  for (const stage of result.stages) {
    const messages = [
      ...stage.checks
        .filter((item) => item.status !== STATUS.PASS)
        .map((item) => item.message),
      ...stage.commands
        .filter((item) => item.status !== STATUS.PASS)
        .map((item) => item.message),
    ];
    lines.push(
      `| ${markdownCell(stage.name)} | ${stage.status} | ${markdownCell(messages.join(" "))} |`,
    );
  }

  lines.push(
    "",
    "A required `NOT_READY`, `FAIL`, or `ERROR` is non-passing. A focused, dirty-tree, profile-override, or bootstrap run cannot establish autonomous readiness. See `result.json` for the complete machine-readable record.",
    "",
  );
  return lines.join("\n");
}

async function loadPackageJson() {
  if (!existsSync(packageJsonPath)) {
    return { packageJson: undefined, exists: false, error: undefined };
  }
  try {
    return {
      packageJson: await readJson(packageJsonPath),
      exists: true,
      error: undefined,
    };
  } catch (error) {
    return { packageJson: undefined, exists: true, error: error.message };
  }
}

async function runVerification(options) {
  const packageLoad = await loadPackageJson();
  const { packageJson } = packageLoad;
  const configuredProfileId =
    packageJson?.milestoneLoop?.verification?.defaultProfile;
  const profile = resolveProfile(
    options.profileId ?? configuredProfileId ?? "bootstrap",
  );
  const fullRun = options.stageIds.length === 0;
  const selectedIds =
    options.stageIds.length > 0
      ? new Set(["environment", ...options.stageIds, "contract-integrity"])
      : new Set(profile.stages.map((stage) => stage.id));
  const unknownIds = [...selectedIds].filter(
    (id) => !profile.stages.some((stage) => stage.id === id),
  );
  if (unknownIds.length > 0) {
    throw new Error(`Unknown stage ID(s): ${unknownIds.join(", ")}.`);
  }

  const runId = options.runId ?? defaultRunId();
  validateRunId(runId);
  const artifactRoot = resolve(repositoryRoot, "artifacts", runId);
  if (existsSync(artifactRoot)) {
    throw new Error(
      `Artifact directory already exists; refusing to overwrite: ${artifactRoot}`,
    );
  }
  await mkdir(resolve(artifactRoot, "logs"), { recursive: true });

  const startedAt = new Date();
  const pnpmVersion = await detectPnpmVersion();
  const candidate = await collectCandidateIdentity(packageJson, pnpmVersion);
  const profileResult = {
    id: profile.id,
    name: profile.name,
    configuredDefault: configuredProfileId ?? null,
    selectedByOverride: options.profileId !== undefined,
    autonomousReadinessEquivalent: profile.autonomousReadinessEquivalent,
  };
  const runManifest = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    state: "RUNNING",
    startedAt: startedAt.toISOString(),
    invocation: ["node", "scripts/verify.mjs", ...process.argv.slice(2)],
    repositoryRoot,
    artifactRoot: relativeFromRepository(artifactRoot),
    profile: profileResult,
    fullRun,
    selectedStages: [...selectedIds],
    candidate,
  };
  await atomicWriteJson(
    resolve(artifactRoot, "run-manifest.json"),
    runManifest,
  );

  console.log(`[VERIFY] run ${runId}`);
  console.log(`[VERIFY] profile ${profile.id} - ${profile.name}`);
  console.log(`[VERIFY] artifacts ${relativeFromRepository(artifactRoot)}`);

  const stages = [];
  for (const stage of profile.stages.filter((item) =>
    selectedIds.has(item.id),
  )) {
    const result =
      stage.kind === "internal"
        ? await evaluateEnvironment(
            packageLoad,
            pnpmVersion,
            artifactRoot,
            profile,
            candidate,
            fullRun,
          )
        : await evaluateScriptStage(stage, packageJson, artifactRoot);
    stages.push(result);
    console.log(`[${result.status}] ${result.id} - ${result.name}`);
  }

  const candidateFinal = await collectCandidateIdentity(
    packageJson,
    pnpmVersion,
  );
  const identityDriftFields = [
    "gitCommit",
    "gitTree",
    "workingTreeDirty",
    "packageJsonSha256",
    "workspaceManifestSha256",
    "lockfileSha256",
    "acceptanceManifestSha256",
    "immutableContractLockSha256",
    "readinessActivationMarkerSha256",
  ].filter((field) => candidate[field] !== candidateFinal[field]);
  const identityDrift = {
    detected: identityDriftFields.length > 0,
    fields: identityDriftFields,
  };
  let status = aggregateStatus(stages.map((stage) => stage.status));
  if (identityDrift.detected && status !== STATUS.ERROR) {
    status = STATUS.FAIL;
    console.log(
      `[VERIFY] candidate identity drifted during verification: ${identityDriftFields.join(", ")}`,
    );
  }
  const finishedAt = new Date();
  const exitCode = EXIT_CODE[status];
  const completionReasons = [];
  if (status !== STATUS.PASS)
    completionReasons.push("verification_status_not_pass");
  if (!fullRun) completionReasons.push("focused_stage_selection");
  if (configuredProfileId !== profile.id)
    completionReasons.push("selected_profile_is_not_package_default");
  if (candidateFinal.workingTreeDirty !== false)
    completionReasons.push("working_tree_not_proven_clean");
  if (identityDrift.detected)
    completionReasons.push("candidate_identity_drift");
  const completion = {
    claim: profile.completionClaim,
    eligible: completionReasons.length === 0,
    reasons: completionReasons,
  };
  const counts = Object.fromEntries(
    Object.values(STATUS).map((value) => [
      value,
      stages.filter((stage) => stage.status === value).length,
    ]),
  );
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    status,
    exitCode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    invocation: runManifest.invocation,
    repositoryRoot,
    artifactRoot: relativeFromRepository(artifactRoot),
    profile: profileResult,
    completion,
    candidate,
    candidateFinal,
    identityDrift,
    summary: { stageCounts: counts, requiredStageCount: stages.length },
    stages,
  };

  await atomicWriteJson(resolve(artifactRoot, "result.json"), result);
  await writeFile(
    resolve(artifactRoot, "summary.md"),
    buildSummary(result),
    "utf8",
  );
  await atomicWriteJson(resolve(artifactRoot, "run-manifest.json"), {
    ...runManifest,
    state: "COMPLETED",
    finishedAt: finishedAt.toISOString(),
    status,
    exitCode,
    completion,
    candidateFinal,
    identityDrift,
    result: "result.json",
  });
  console.log(
    `[VERIFY] result ${relativeFromRepository(resolve(artifactRoot, "result.json"))}`,
  );
  console.log(`[VERIFY] overall ${status} (exit ${exitCode})`);
  return exitCode;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`[VERIFY] ${error.message}`);
    printHelp();
    return 64;
  }

  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.list) {
    printStageList(options.profileId);
    return 0;
  }

  try {
    return await runVerification(options);
  } catch (error) {
    console.error(`[VERIFY] harness error: ${error.stack ?? error.message}`);
    return EXIT_CODE[STATUS.ERROR];
  }
}

process.exitCode = await main();
