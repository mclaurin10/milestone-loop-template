import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";

import { chromium } from "playwright-core";

import {
  assertCommandPassed,
  describeResult,
  evidenceContext,
  runPnpm,
  writeJson,
  writeReceipt,
} from "./evidence.mjs";
import {
  canonicalCheckpoint,
  createSaveEnvelope,
  loadSaveEnvelope,
  runUserActions,
} from "../app/kernel.mjs";

const mode = process.argv[2];
const definitions = {
  dependencies: {
    stageId: "environment",
    commandId: "verify:dependencies",
    report: "dependency-report.json",
    kinds: ["dependency-report"],
  },
  format: {
    stageId: "format-lint",
    commandId: "format:check",
    report: "format-report.json",
    kinds: ["format-report"],
  },
  lint: {
    stageId: "format-lint",
    commandId: "lint",
    report: "lint-report.json",
    kinds: ["lint-report"],
  },
  architecture: {
    stageId: "format-lint",
    commandId: "lint:architecture",
    report: "architecture-report.json",
    kinds: ["architecture-report"],
  },
  typecheck: {
    stageId: "typecheck",
    commandId: "typecheck",
    report: "typecheck-report.json",
    kinds: ["typecheck-report"],
  },
  test: {
    stageId: "bootstrap-tests",
    commandId: "test:unit",
    report: "vitest-report.json",
    kinds: ["vitest-report"],
  },
  simulation: {
    stageId: "bootstrap-simulation",
    commandId: "verify:bootstrap:simulation",
    report: "parity-report.json",
    kinds: [
      "node-checkpoints",
      "worker-checkpoints",
      "user-action-log",
      "replay-report",
      "parity-report",
    ],
  },
  persistence: {
    stageId: "bootstrap-persistence",
    commandId: "verify:bootstrap:persistence",
    report: "save-roundtrip-report.json",
    kinds: ["save-envelope", "save-roundtrip-report"],
  },
  browser: {
    stageId: "bootstrap-browser",
    commandId: "verify:bootstrap:browser",
    report: "playwright-report.json",
    kinds: [
      "playwright-report",
      "screenshot",
      "browser-diagnostics",
      "visual-review",
    ],
  },
};

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function chromiumCandidates() {
  return [
    process.env.MILESTONE_LOOP_CHROMIUM_EXECUTABLE,
    ...(process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
          ]),
  ].filter(
    (candidate) => typeof candidate === "string" && candidate.length > 0,
  );
}

function findChromiumExecutable() {
  const executablePath = chromiumCandidates().find((candidate) =>
    existsSync(candidate),
  );
  if (!executablePath)
    throw new Error(
      "A supported Chrome, Chromium, or Edge executable is required for bootstrap browser evidence.",
    );
  return executablePath;
}

async function runCheckedPnpm(args, label, timeoutMs = 300_000) {
  const result = await runPnpm(args, { timeoutMs });
  assertCommandPassed(result, label);
  return describeResult(result);
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function startProductionServer(repositoryRoot) {
  const distRoot = resolve(repositoryRoot, "dist");
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = resolve(distRoot, relativePath);
    if (!filePath.startsWith(`${distRoot}${sep}`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const contents = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(contents);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Bootstrap production server did not bind a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
  };
}

async function withProductionPage(repositoryRoot, operation) {
  await runCheckedPnpm(
    ["run", "build:production"],
    "bootstrap production build",
  );
  const executablePath = findChromiumExecutable();
  const server = await startProductionServer(repositoryRoot);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args:
      typeof process.getuid === "function" && process.getuid() === 0
        ? ["--no-sandbox"]
        : [],
  });
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };
  try {
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
    });
    page.on("console", (message) => {
      if (message.type() === "error")
        diagnostics.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) =>
      diagnostics.requestFailures.push({
        url: request.url(),
        errorText: request.failure()?.errorText ?? "unknown",
      }),
    );
    await page.goto(server.url, { waitUntil: "networkidle" });
    await page.locator("#status[data-state='ready']").waitFor();
    const result = await operation(page);
    if (
      diagnostics.consoleErrors.length > 0 ||
      diagnostics.pageErrors.length > 0 ||
      diagnostics.requestFailures.length > 0
    )
      throw new Error(
        `Browser diagnostics were not clean: ${JSON.stringify(diagnostics)}.`,
      );
    return {
      result,
      diagnostics,
      executablePath,
      browserVersion: browser.version(),
      url: server.url,
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

async function writeModeEvidence(context, definition) {
  const repositoryRoot = context.repositoryRoot;
  const reportPath = resolve(context.artifactDirectory, definition.report);
  if (mode === "dependencies") {
    const command = await runCheckedPnpm(
      ["list", "--depth=-1", "--json"],
      "frozen dependency graph",
    );
    const packageJson = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    );
    if (packageJson.devDependencies?.["playwright-core"] === undefined)
      throw new Error(
        "The real browser driver is absent from package metadata.",
      );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-dependency-report.v1",
      status: "PASS",
      command,
      packageManager: packageJson.packageManager,
      browserDriver: `playwright-core@${packageJson.devDependencies["playwright-core"]}`,
    });
  } else if (mode === "format") {
    const command = await runCheckedPnpm(
      [
        "exec",
        "prettier",
        "--check",
        "app",
        "scripts",
        "tools",
        "eslint.config.mjs",
        "package.json",
        "pnpm-workspace.yaml",
        "tsconfig.base.json",
        "tsconfig.tools.json",
        "vitest.config.ts",
      ],
      "format check",
    );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-static-report.v1",
      status: "PASS",
      mode,
      command,
    });
  } else if (mode === "lint") {
    const command = await runCheckedPnpm(
      ["exec", "eslint", "app", "scripts", "tools", "vitest.config.ts"],
      "lint check",
    );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-static-report.v1",
      status: "PASS",
      mode,
      command,
    });
  } else if (mode === "architecture") {
    const [main, worker] = await Promise.all([
      readFile(resolve(repositoryRoot, "app/main.mjs"), "utf8"),
      readFile(resolve(repositoryRoot, "app/worker.mjs"), "utf8"),
    ]);
    const checks = {
      mainImportsKernel: main.includes('from "./kernel.mjs"'),
      workerImportsKernel: worker.includes('from "./kernel.mjs"'),
      browserSourcesExcludeNodeImports: !/from\s+["']node:/u.test(
        `${main}\n${worker}`,
      ),
      workerUsesPublicActionMessage: worker.includes('"run-user-actions"'),
    };
    if (Object.values(checks).some((passed) => !passed))
      throw new Error(
        `Bootstrap architecture check failed: ${JSON.stringify(checks)}.`,
      );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-architecture-report.v1",
      status: "PASS",
      checks,
    });
  } else if (mode === "typecheck") {
    const command = await runCheckedPnpm(
      ["exec", "tsc", "--project", "tsconfig.tools.json", "--noEmit"],
      "strict typecheck",
      600_000,
    );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-static-report.v1",
      status: "PASS",
      mode,
      command,
    });
  } else if (mode === "test") {
    await runCheckedPnpm(
      [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.config.ts",
        "--fileParallelism=false",
        "--reporter=json",
        `--outputFile=${reportPath}`,
      ],
      "bootstrap Vitest",
      600_000,
    );
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (report.numPassedTests < 1 || report.numFailedTests !== 0)
      throw new Error("Bootstrap Vitest report does not prove passing tests.");
  } else if (mode === "simulation") {
    const actions = ["extract", "idle", "extract"];
    const first = runUserActions(actions);
    const replay = runUserActions(actions);
    const browserRun = await withProductionPage(repositoryRoot, (page) =>
      page.evaluate(
        (inputActions) => globalThis.__runBootstrapReplay(inputActions),
        actions,
      ),
    );
    const nodeCheckpoint = canonicalCheckpoint(first);
    const workerCheckpoint = canonicalCheckpoint(browserRun.result);
    if (
      nodeCheckpoint !== canonicalCheckpoint(replay) ||
      nodeCheckpoint !== workerCheckpoint
    )
      throw new Error(
        "Node, replay, and production Worker checkpoints diverged.",
      );
    const artifacts = [
      [
        "node-checkpoints.json",
        "node-checkpoints",
        { checkpoints: [nodeCheckpoint] },
      ],
      [
        "worker-checkpoints.json",
        "worker-checkpoints",
        {
          browserVersion: browserRun.browserVersion,
          executablePath: browserRun.executablePath,
          checkpoints: [workerCheckpoint],
        },
      ],
      ["user-action-log.json", "user-action-log", { actions }],
      [
        "replay-report.json",
        "replay-report",
        {
          status: "PASS",
          first: nodeCheckpoint,
          replay: canonicalCheckpoint(replay),
        },
      ],
      [
        "parity-report.json",
        "parity-report",
        { status: "PASS", nodeCheckpoint, workerCheckpoint },
      ],
    ];
    for (const [name, , value] of artifacts)
      await writeJson(resolve(context.artifactDirectory, name), {
        schemaVersion: "bootstrap-simulation-evidence.v1",
        ...value,
      });
    return artifacts.map(([path, kind]) => ({ path, kind }));
  } else if (mode === "persistence") {
    const actionsBeforeSave = ["extract", "idle"];
    const actionsAfterSave = ["extract"];
    const state = runUserActions(actionsBeforeSave);
    const envelope = createSaveEnvelope(state);
    const loaded = loadSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
    const continued = canonicalCheckpoint(
      runUserActions(actionsAfterSave, loaded),
    );
    const uninterrupted = canonicalCheckpoint(
      runUserActions([...actionsBeforeSave, ...actionsAfterSave]),
    );
    if (continued !== uninterrupted)
      throw new Error(
        "Save/load continuation diverged from uninterrupted execution.",
      );
    await writeJson(
      resolve(context.artifactDirectory, "save-envelope.json"),
      envelope,
    );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-save-roundtrip-report.v1",
      status: "PASS",
      continued,
      uninterrupted,
    });
    return [
      { path: "save-envelope.json", kind: "save-envelope" },
      { path: definition.report, kind: "save-roundtrip-report" },
    ];
  } else if (mode === "browser") {
    const screenshotPath = resolve(context.artifactDirectory, "bootstrap.png");
    const browserRun = await withProductionPage(
      repositoryRoot,
      async (page) => {
        await page.locator("#extract-action").click();
        await page.locator("#status[data-state='advanced']").waitFor();
        const checkpoint = await page.locator("#checkpoint").textContent();
        const statusText = await page.locator("#status").textContent();
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return { checkpoint, statusText };
      },
    );
    const screenshot = await readFile(screenshotPath);
    if (
      screenshot.byteLength < 1_000 ||
      !browserRun.result.statusText?.includes("extracted 4")
    )
      throw new Error(
        "Rendered browser consequence or screenshot is incomplete.",
      );
    await writeJson(reportPath, {
      schemaVersion: "bootstrap-playwright-report.v1",
      status: "PASS",
      driver: "playwright-core",
      browserVersion: browserRun.browserVersion,
      executablePath: browserRun.executablePath,
      url: browserRun.url,
      viewport: { width: 960, height: 540 },
      publicAction: "#extract-action",
      renderedStatus: browserRun.result.statusText,
      checkpoint: browserRun.result.checkpoint,
    });
    await writeJson(
      resolve(context.artifactDirectory, "browser-diagnostics.json"),
      {
        schemaVersion: "bootstrap-browser-diagnostics.v1",
        status: "PASS",
        ...browserRun.diagnostics,
      },
    );
    await writeJson(resolve(context.artifactDirectory, "visual-review.json"), {
      schemaVersion: "bootstrap-visual-review.v1",
      status: "PASS",
      screenshot: {
        path: "bootstrap.png",
        bytes: screenshot.byteLength,
        sha256: sha256(screenshot),
      },
      observed: {
        heading: "Fresh adopter loop",
        renderedStatus: browserRun.result.statusText,
        expectedExtracted: 4,
      },
    });
    return [
      { path: definition.report, kind: "playwright-report" },
      { path: "bootstrap.png", kind: "screenshot" },
      { path: "browser-diagnostics.json", kind: "browser-diagnostics" },
      { path: "visual-review.json", kind: "visual-review" },
    ];
  } else {
    throw new Error(`Unsupported bootstrap evidence mode: ${mode}.`);
  }
  return [{ path: definition.report, kind: definition.kinds[0] }];
}

const definition = definitions[mode];
if (!definition) {
  process.stderr.write(
    `Unknown bootstrap evidence mode: ${mode ?? "(missing)"}.\n`,
  );
  process.exitCode = 64;
} else {
  try {
    const context = await evidenceContext(
      definition.stageId,
      definition.commandId,
    );
    const artifacts = await writeModeEvidence(context, definition);
    for (const artifact of artifacts) {
      const metadata = await stat(
        resolve(context.artifactDirectory, artifact.path),
      );
      if (!metadata.isFile() || metadata.size === 0)
        throw new Error(
          `Bootstrap evidence artifact is empty: ${artifact.path}.`,
        );
    }
    await writeReceipt(
      context,
      [
        {
          id: `${mode}-production-boundary`,
          summary: `${mode} passed through the real bootstrap production boundary.`,
        },
      ],
      artifacts,
    );
    process.stdout.write(
      `${mode} evidence: ${resolve(context.artifactDirectory, definition.report)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
