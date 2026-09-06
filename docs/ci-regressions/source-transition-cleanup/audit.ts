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
import {
  assertActiveAuthorityPublication,
  AUTHORITY_MIGRATION_PENDING_PATH,
} from "../../../tools/milestone-orchestrator/src/authority-publication.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const root = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "wp6e-transition-cleanup-regression",
  "transition-cleanup-retained-audit",
);
const base = "bb312f3aa9c3708aa7e0d11d3cd682b96a4f5efa",
  testPath =
    "tools/milestone-orchestrator/src/source-authority-transition.test.ts";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
try {
  const seal = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(seal.sourceBase, base);
  assert.equal(seal.completionEligible, false);
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(input, path))) {
      const child = path ? path + "/" + name : name,
        info = await lstat(resolve(input, child));
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) await walk(child);
      else {
        assert(info.isFile() && info.nlink === 1 && info.size <= 20_000_000);
        const bytes = await readFile(resolve(input, child));
        files.push({ path: child, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await walk();
  const order = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual(files.sort(order), seal.files.sort(order));
  assert(files.reduce((sum, file) => sum + file.bytes, 0) <= 64_000_000);
  for (const pin of [...seal.implementation, ...seal.preserved]) {
    const bytes = await readFile(resolve(root, pin.path));
    assert.equal(bytes.length, pin.bytes);
    assert.equal(hash(bytes), pin.sha256, pin.path);
  }
  for (const pin of seal.preserved)
    assert.equal(
      hash(git("show", `${base}:${pin.path}`)),
      pin.sha256,
      pin.path,
    );
  assert.equal(await assertActiveAuthorityPublication(root), "legacy");
  assert(!existsSync(resolve(root, AUTHORITY_MIGRATION_PENDING_PATH)));
  assert(!existsSync(resolve(root, "artifacts/orchestrator/state/state.json")));
  assert.equal(
    git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/")
      .toString()
      .trim(),
    "",
  );
  const original = await readFile(
    resolve(input, "original-source-authority-transition.test.ts"),
  );
  assert(original.equals(git("show", `${base}:${testPath}`)));
  const current = await readFile(resolve(root, testPath), "utf8");
  const printer = ts.createPrinter({ removeComments: true });
  function suites(source: string) {
    const file = ts.createSourceFile(
        testPath,
        source,
        ts.ScriptTarget.Latest,
        true,
      ),
      results: string[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(file) === "describe"
      )
        results.push(printer.printNode(ts.EmitHint.Unspecified, node, file));
      ts.forEachChild(node, visit);
    }
    visit(file);
    return results;
  }
  assert(suites(original.toString()).length > 0);
  assert.deepEqual(
    suites(current),
    suites(original.toString()),
    "An original suite body, assertion, identity or deadline changed.",
  );
  assert(
    current.includes('"maintenance.auto=false"') &&
      current.includes('"gc.auto=0"'),
  );
  assert(
    current.includes("maxRetries: 5") && current.includes("retryDelay: 25"),
  );
  for (const directory of ["baseline-focused-1", "fixed-focused-2"]) {
    const report = await json(directory + "/vitest-report.json");
    assert.equal(report.numTotalTests, 32);
    assert.equal(report.numPassedTests, 32);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
  }
  const firstRepair = await json("fixed-focused-1/vitest-report.json");
  assert.equal(firstRepair.numTotalTests, 32);
  assert.equal(firstRepair.numPassedTests, 30);
  assert.equal(firstRepair.numFailedTests, 2);
  assert.deepEqual(
    firstRepair.testResults
      .flatMap(
        (file: { assertionResults: { status: string; fullName: string }[] }) =>
          file.assertionResults
            .filter((test) => test.status === "failed")
            .map((test) => test.fullName),
      )
      .sort(),
    [
      "exact source authority transition projection runs the actual receipt-owning inspector without publishing its proposed files",
      "separately committed source request bindings executes the actual committed-request CLI with a non-authorizing receipt",
    ].sort(),
  );
  assert(!existsSync(resolve(input, "fixed-focused-1/result.json")));
  const hosted = await json(
    "hosted-bb312f3/controller-linux/orchestrator/orchestrator-report.json",
  );
  assert.equal(hosted.numTotalTests, 950);
  assert.equal(hosted.numPassedTests, 949);
  assert.equal(hosted.numFailedTests, 1);
  const failures = hosted.testResults
    .flatMap(
      (file: {
        assertionResults: {
          status: string;
          fullName: string;
          failureMessages: string[];
        }[];
      }) => file.assertionResults,
    )
    .filter((test: { status: string }) => test.status === "failed");
  assert.equal(failures.length, 1);
  assert.equal(
    failures[0].fullName,
    "exact source authority transition projection refuses an existing epoch record even with a self-authored PASS",
  );
  assert(failures[0].failureMessages.join("\n").includes("ENOTEMPTY"));
  assert(
    !existsSync(
      resolve(
        input,
        "hosted-bb312f3/controller-linux/orchestrator/result.json",
      ),
    ),
  );
  assert(!existsSync(resolve(input, "hosted-bb312f3/controller-linux/unit")));
  const artifacts = (await json("hosted-bb312f3/artifacts-1.json")).artifacts;
  assert.equal(artifacts.length, 4);
  for (const artifact of artifacts) {
    assert.equal(artifact.workflow_run.head_sha, base);
    assert.equal(artifact.workflow_run.id, 34043089595);
    const stem = artifact.name.replace("-" + base, "");
    assert(
      /^(controller|fresh-adopter|trusted-container)-(linux|windows)$/.test(
        stem,
      ),
    );
    const bytes = await readFile(
      resolve(input, "hosted-bb312f3/" + stem + ".zip"),
    );
    assert.equal(bytes.length, artifact.size_in_bytes);
    assert.equal("sha256:" + hash(bytes), artifact.digest);
  }
  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const receipt = await json(file.path);
    if (
      receipt.schemaVersion !== "1.0.0" ||
      typeof receipt.stageId !== "string"
    )
      continue;
    const checked = await validateCommandReceiptDirectory({
      directory: dirname(resolve(input, file.path)),
      expectedStageId: receipt.stageId,
      expectedCommandId: receipt.commandId,
    });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
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
  const priorPostcommit = await json(
    "runtime-store-postcommit/postcommit-observation.json",
  );
  for (const name of ["typecheck", "lint", "format"])
    assert(
      receipts.some((receipt) => receipt.path === name + "-2/result.json"),
    );
  assert.equal(priorPostcommit.candidate.gitCommit, base);
  assert.equal(
    priorPostcommit.candidate.gitTree,
    "f2e7f228e215e1d1680fae4b933df4c20f27deee",
  );
  assert.equal(priorPostcommit.candidate.gitStatus, "");
  assert.equal(priorPostcommit.stateAbsent, true);
  assert.equal(priorPostcommit.privateReferencesAbsent, true);
  assert.deepEqual(
    priorPostcommit.receipts.map((receipt: { name: string }) => receipt.name),
    ["audit", "focused", "dependencies", "build"],
  );
  for (const prior of priorPostcommit.receipts)
    assert(
      receipts.some(
        (receipt) =>
          receipt.path ===
            "runtime-store-postcommit/postcommit-" +
              prior.name +
              "/result.json" && receipt.sha256 === prior.sha256,
      ),
    );
  const identity = await commandIdentity(root);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const audit = {
    schemaVersion: "source-transition-cleanup-audit.v1",
    status: "PASS",
    completionEligible: false,
    identity,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    originalSuitesPreserved: suites(current).length,
    receipts,
    baseline: {
      commit: base,
      runId: 34043089595,
      linuxController: { passed: 949, failed: 1 },
      linuxUnit: "NOT_EXECUTED",
      retainedArchives: 4,
      windowsController: "NOT_YET_COLLECTED",
    },
    nativeLocal: {
      baseline: "32_PASS_FAILURE_NOT_REPRODUCED",
      repair: "32_PASS",
    },
    limits: {
      backgroundWriterIdentified: false,
      cleanRepairConsumedBuild: "REQUIRES_POSTCOMMIT_RUN",
      repairedExactHostedCohort: "PENDING",
      historicalWP6e: "BLOCKED",
      candidate: "NOT_EXECUTED",
      sourceActivation: "NOT_EXECUTED",
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
        id: "original-transition-suites-preserved",
        summary:
          "Rehashed raw evidence and command-owned receipts, compared complete original suite syntax trees, preserved the real hosted cleanup failure and separate local observations, and verified unchanged authority/state boundaries.",
      },
    ],
    [{ path: "audit.json", kind: "source-transition-cleanup-audit" }],
  );
  const receipt = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["source-transition-cleanup-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
      sha256: receipt.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
