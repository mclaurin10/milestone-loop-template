import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repository = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "wp6e-runtime-store-regression",
  "installed-store-retained-audit",
);
const base = "96abed900ba141afb4ae644a691e7d5bb0569ca0";
const testPath =
  "tools/milestone-orchestrator/src/candidate-package-runtime.test.ts";
const testName =
  "consumes the CI-installed package graph through the unchanged sanitized child with strict dependency verification";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repository, ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.sourceBase, base);
  assert.equal(manifest.completionEligible, false);
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(input, path))) {
      const child = path ? path + "/" + name : name,
        absolute = resolve(input, child),
        info = await lstat(absolute);
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) await walk(child);
      else {
        assert(info.isFile() && info.nlink === 1 && info.size <= 20_000_000);
        const bytes = await readFile(absolute);
        files.push({ path: child, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await walk();
  const order = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), manifest.files.sort(order));
  assert(files.reduce((sum, file) => sum + file.bytes, 0) <= 64_000_000);
  for (const pin of [...manifest.implementation, ...manifest.preserved]) {
    const bytes = await readFile(resolve(repository, pin.path));
    assert.equal(bytes.length, pin.bytes, pin.path);
    assert.equal(hash(bytes), pin.sha256, pin.path);
  }
  for (const pin of manifest.preserved)
    assert.equal(
      hash(git("show", `${base}:${pin.path}`)),
      pin.sha256,
      pin.path,
    );
  assert.equal(
    git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/")
      .toString()
      .trim(),
    "",
  );
  for (const path of [
    "artifacts/orchestrator/state/state.json",
    ".agent/authority-requests/ORCH-AUTH-01/request.json",
    ".agent/completed/source-authority-epochs.json",
    ".agent/authority-migration-pending.json",
  ])
    assert(!existsSync(resolve(repository, path)));
  const original = await readFile(
    resolve(input, "original-candidate-package-runtime.test.ts"),
  );
  assert(original.equals(git("show", `${base}:${testPath}`)));
  const repaired = await readFile(resolve(repository, testPath), "utf8");
  const printer = ts.createPrinter({ removeComments: true });
  function contract(source: string) {
    const file = ts.createSourceFile(
      testPath,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const assertions: string[] = [],
      cases: string[] = [],
      timeouts: string[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(file).startsWith("expect(")
      )
        assertions.push(printer.printNode(ts.EmitHint.Unspecified, node, file));
      if (ts.isCallExpression(node) && node.expression.getText(file) === "it")
        cases.push(
          JSON.stringify([
            node.arguments[0]!.getText(file),
            node.arguments[2]!.getText(file),
          ]),
        );
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(file) === "timeoutMs"
      )
        timeouts.push(node.initializer.getText(file));
      ts.forEachChild(node, visit);
    }
    visit(file);
    return { assertions, cases, timeouts };
  }
  const prior = contract(original.toString()),
    next = contract(repaired);
  assert.deepEqual(prior.cases, next.cases);
  assert(prior.cases.length === 1 && prior.cases[0]!.includes("180_000"));
  for (const value of prior.assertions) {
    const index = next.assertions.indexOf(value);
    assert(index >= 0, "Original assertion changed or disappeared: " + value);
    next.assertions.splice(index, 1);
  }
  for (const value of prior.timeouts) {
    const index = next.timeouts.indexOf(value);
    assert(index >= 0);
    next.timeouts.splice(index, 1);
  }
  assert(repaired.includes('"--config.store-dir=" + dirname(installedStore)'));
  const baseline = await read("baseline-focused-1/vitest-report.json");
  const firstFix = await read("fixed-focused-1/vitest-report.json");
  for (const [report, message, directory] of [
    [baseline, "ERR_PNPM_NO_OFFLINE_TARBALL", "baseline-focused-1"],
    [firstFix, "Unknown option: 'store-dir'", "fixed-focused-1"],
  ] as const) {
    assert.equal(report.numTotalTests, 1);
    assert.equal(report.numFailedTests, 1);
    assert.equal(report.numPassedTests, 0);
    const failure = report.testResults[0].assertionResults[0];
    assert.equal(failure.fullName, testName);
    assert(failure.failureMessages.join("\n").includes(message));
    assert(!existsSync(resolve(input, directory, "result.json")));
  }
  const fixed = await read("fixed-focused-2/vitest-report.json");
  assert.equal(fixed.numTotalTests, 15);
  assert.equal(fixed.numPassedTests, 15);
  assert.equal(fixed.numFailedTests, 0);
  assert.equal(fixed.numPendingTests, 0);
  assert(
    fixed.testResults
      .flatMap(
        (file: { assertionResults: { fullName: string; status: string }[] }) =>
          file.assertionResults,
      )
      .some(
        (test: { fullName: string; status: string }) =>
          test.fullName === testName && test.status === "passed",
      ),
  );
  const jobs = (await read("hosted-96abed9/jobs.json")).jobs;
  assert.equal(jobs.length, 5);
  for (const job of jobs) {
    assert.equal(job.head_sha, base);
    assert.equal(job.run_id, 34038506240);
    assert.equal(job.status, "completed");
    assert.equal(
      job.conclusion,
      job.name === "Controller (windows)" ? "failure" : "success",
    );
  }
  const windows = await read(
    "hosted-96abed9/controller-windows/orchestrator/orchestrator-report.json",
  );
  assert.equal(windows.numTotalTests, 950);
  assert.equal(windows.numPassedTests, 949);
  assert.equal(windows.numFailedTests, 1);
  const failures = windows.testResults
    .flatMap(
      (file: {
        assertionResults: {
          fullName: string;
          status: string;
          failureMessages: string[];
        }[];
      }) => file.assertionResults,
    )
    .filter((test: { status: string }) => test.status === "failed");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].fullName, testName);
  assert(
    failures[0].failureMessages
      .join("\n")
      .includes("ERR_PNPM_NO_OFFLINE_TARBALL"),
  );
  assert(
    !existsSync(
      resolve(
        input,
        "hosted-96abed9/controller-windows/orchestrator/result.json",
      ),
    ),
  );
  assert(!existsSync(resolve(input, "hosted-96abed9/controller-windows/unit")));
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((entry) =>
    entry.path.endsWith("/result.json"),
  )) {
    const raw = await read(file.path);
    if (raw.schemaVersion !== "1.0.0" || typeof raw.stageId !== "string")
      continue;
    const result = await validateCommandReceiptDirectory({
      directory: dirname(resolve(input, file.path)),
      expectedStageId: raw.stageId,
      expectedCommandId: raw.commandId,
    });
    receipts.push({ path: file.path, sha256: result.receiptSha256 });
  }
  for (const name of [
    "typecheck",
    "lint",
    "format",
    "architecture",
    "dependencies",
    "invariants",
  ])
    assert(
      receipts.some((receipt) => receipt.path === name + "-1/result.json"),
    );
  assert(
    receipts.some((receipt) => receipt.path === "fixed-focused-2/result.json"),
  );
  const invariant = await read("invariants-1/invariant-suite-report.json");
  assert.equal(invariant.status, "PASS");
  const refusedBuild = await read("build-1/manifest.json");
  assert.equal(refusedBuild.status, "ERROR");
  assert.equal(refusedBuild.candidate.workingTreeDirty, true);
  assert.equal(refusedBuild.receipt, null);
  assert(!existsSync(resolve(input, "build-1/result.json")));
  const identity = await commandIdentity(repository);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const audit = {
    schemaVersion: "candidate-installed-store-retained-audit.v1",
    status: "PASS",
    completionEligible: false,
    identity,
    sourceBase: base,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    originalAssertionsPreserved: prior.assertions.length,
    originalTestDeadlineMs: 180000,
    receipts,
    hosted: {
      runId: 34038506240,
      passedJobs: 4,
      failedJobs: 1,
      windowsController: { passed: 949, failed: 1 },
      windowsRootUnit: "NOT_EXECUTED",
    },
    replacementFocused: { passed: 15, failed: 0 },
    limits: {
      repairedCommitConsumedBuild: "REQUIRES_POSTCOMMIT_RUN",
      historicalWP6e: "BLOCKED",
      freshCandidate: "NOT_EXECUTED",
      sourceActivation: "NOT_EXECUTED",
      sourceStateInitializedOrAdopted: false,
      nativeWindowsProvider: "NOT_READY",
      readiness: "NOT_READY",
      humanAcceptance: "NOT_READY",
      wp6fInterpretation: false,
    },
  };
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(audit, null, 2) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "source-store-regression-evidence",
        summary:
          "Rehashed retained raw observations and receipts, preserved every original test assertion/deadline and active authority byte, and distinguished actual hosted failure from native focused repair without a candidate/readiness claim.",
      },
    ],
    [{ path: "audit.json", kind: "candidate-installed-store-retained-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["candidate-installed-store-retained-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
      originalAssertions: prior.assertions.length,
      sha256: checked.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
