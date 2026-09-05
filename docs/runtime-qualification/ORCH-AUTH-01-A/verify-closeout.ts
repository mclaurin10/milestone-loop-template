import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const root = resolve(import.meta.dirname, "../../..");
const [extractedArg, outputArg] = process.argv.slice(2);
assert(extractedArg && outputArg && process.argv.length === 4);
assert.equal(process.version, "v24.18.0");
const extracted = resolve(extractedArg);
const support = resolve(extracted, "supporting-evidence");
const curated = resolve(import.meta.dirname, "evidence");
const output = resolve(outputArg);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { windowsHide: true });
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-runtime-closeout",
  "ORCH-AUTH-01-A-closeout",
);
try {
  const definitions = [
    [
      "handoff-audit",
      "authority-handoff-integrity",
      "ORCH-AUTH-01-handoff-audit",
      "authority-handoff-audit",
    ],
    [
      "contract-integrity-entry",
      "invariant-suite",
      "contract-integrity",
      "contract-integrity-report",
    ],
    [
      "focused",
      "orch-auth-01-a",
      "oci-evidence-focused",
      "oci-evidence-focused-vitest-report",
    ],
    [
      "checks/test-invariants",
      "invariant-suite",
      "test:invariants",
      "invariant-suite-report",
    ],
    ...[
      "fail-closed-evidence",
      "orchestrator-policy-integrity",
      "orchestrator-schema-integrity",
    ].map((id) => [
      `checks/test-invariants/entries/${id}`,
      "invariant-suite",
      id,
      "invariant-vitest-report",
    ]),
    [
      "checks/test-invariants/entries/protected-integrity",
      "invariant-suite",
      "protected-integrity",
      "contract-integrity-report",
    ],
    [
      "checks/test-invariants/entries/test-ownership",
      "invariant-suite",
      "test-ownership",
      "test-ownership-report",
    ],
    ["checks/typecheck", "typecheck", "typecheck", "typecheck-report"],
    ["checks/lint", "format-lint", "lint", "lint-report"],
    ["checks/format-check", "format-lint", "format:check", "format-report"],
  ];
  const receipts = [];
  for (const [directory, stage, command, kind] of definitions) {
    const receipt = await validateCommandReceiptDirectory({
      directory: resolve(support, directory),
      expectedStageId: stage,
      expectedCommandId: command,
      requiredKinds: [kind],
    });
    for (const artifact of receipt.artifacts.filter((artifact) =>
      artifact.kind.endsWith("vitest-report"),
    )) {
      const report = await json(artifact.path);
      assert(report.numTotalTests > 0);
      assert.equal(report.numPassedTests, report.numTotalTests);
      assert.equal(report.numFailedTests, 0);
      assert.equal(report.numPendingTests, 0);
      assert(
        report.testResults.every((file: any) =>
          file.assertionResults.every((test: any) => test.status === "passed"),
        ),
      );
    }
    receipts.push({
      directory,
      stage,
      command,
      sha256: receipt.receiptSha256,
      artifacts: receipt.artifactCount,
    });
  }
  const focused = await json(resolve(support, "focused/vitest-report.json"));
  assert.equal(focused.numTotalTests, 24);
  const negative = [];
  for (const name of ["entry-audit", "tampered-audit"]) {
    const manifest = await json(resolve(support, name, "manifest.json"));
    assert.equal(manifest.status, "ERROR");
    assert.equal(manifest.receipt, null);
    assert(!existsSync(resolve(support, name, "result.json")));
    assert.match(
      manifest.failureClassification.message,
      name === "entry-audit"
        ? /ENOENT.*workspace-artifacts/s
        : /vitest-report\.json/,
    );
    negative.push({
      name,
      disposition: manifest.status,
      failure: manifest.failureClassification.message,
    });
  }
  const build = await json(resolve(support, "checks/build/manifest.json"));
  assert.equal(build.status, "NOT_READY");
  assert.equal(build.receipt, null);
  assert(!existsSync(resolve(support, "checks/build/result.json")));
  assert.match(
    build.failureClassification.message,
    /milestoneLoop\.productionBuild is not declared/,
  );

  const runtimeReceipt = await validateCommandReceiptDirectory({
    directory: resolve(curated, "runtime-audit"),
    expectedStageId: "orch-auth-runtime-audit",
    expectedCommandId: "ORCH-AUTH-01-A-retained-evidence",
    requiredKinds: ["orch-auth-runtime-audit"],
  });
  const runtime = await json(runtimeReceipt.artifacts[0].path);
  assert.equal(runtime.status, "PASS");
  assert.equal(runtime.completionEligible, false);
  assert.equal(
    runtime.source.candidateTree,
    "73050cad83ec0f312498792c47bd55bff5bea060",
  );
  const retainedRoot = resolve(
    extracted,
    "linux-retained-evidence/artifacts/oa2",
  );
  assert.deepEqual(
    await inventoryContainerArtifacts(retainedRoot, {
      maximumFiles: 10000,
      maximumBytes: 268435456,
    }),
    runtime.inventory,
  );
  assert.equal(
    sha(await readFile(resolve(retainedRoot, "matrix/result.json"))),
    runtime.matrix.sha256,
  );
  const entry = await json(
    resolve(extracted, "linux-evidence/artifacts/oa1/matrix/result.json"),
  );
  assert.equal(entry.durationMs, 44259);
  assert.equal(runtime.matrix.durationMs, 52863);
  assert.equal(entry.image.imageId, runtime.image.imageId);
  assert.equal(entry.image.buildInvocations, 0);
  assert.equal(runtime.image.buildInvocations, 0);

  const baseline = await json(
    resolve(root, "docs/proposals/ORCH-AUTH-01-r2/baseline-index.json"),
  );
  const records = [
    ".agent/current-exec-plan.md",
    "docs/autonomy-log.md",
    "docs/decision-log.md",
  ];
  const preserved = [];
  for (const identity of baseline.files.filter(
    (entry: any) => !records.includes(entry.path),
  )) {
    const bytes = await readFile(resolve(root, identity.path));
    assert.equal(bytes.length, identity.bytes, identity.path);
    assert.equal(sha(bytes), identity.sha256, identity.path);
    preserved.push(identity);
  }
  const prior = "2ec1d253ffe26b6051c68abb545a8cddef417984";
  for (const path of ["docs/autonomy-log.md", "docs/decision-log.md"]) {
    const previous = git("show", `${prior}:${path}`);
    const bytes = await readFile(resolve(root, path));
    const boundary = previous.indexOf(Buffer.from("## "));
    assert(
      bytes
        .subarray(bytes.length - (previous.length - boundary))
        .equals(previous.subarray(boundary)),
      `${path} changed prior history`,
    );
  }
  assert.equal(
    git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/")
      .toString()
      .trim(),
    "",
  );
  assert(
    !existsSync(resolve(root, "evals/authority-epochs/orch-template.v1/root")),
  );
  assert.equal(
    git(
      "diff",
      runtime.source.candidateTree,
      "--name-only",
      "--",
      "tools",
      "fixtures",
      "scripts",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      "tsconfig.tools.json",
      "vitest.config.ts",
    )
      .toString()
      .trim(),
    "",
  );
  assert(
    git("show", `${prior}:tools/production-build.mjs`).equals(
      await readFile(resolve(root, "tools/production-build.mjs")),
    ),
  );
  const archives = [];
  for (const name of [
    "linux-evidence.tar.gz",
    "linux-retained-evidence.tar.gz",
    "supporting-evidence.tar.gz",
  ]) {
    const bytes = await readFile(resolve(curated, name));
    archives.push({ name, bytes: bytes.length, sha256: sha(bytes) });
  }
  const report = {
    schemaVersion: "orch-auth-01-a-closeout.v1",
    status: "PASS",
    claim: "bounded local Linux runtime increment only",
    completionEligible: false,
    source: runtime.source,
    runtimeReceiptSha256: runtimeReceipt.receiptSha256,
    receipts,
    focusedTests: focused.numTotalTests,
    archives,
    preserved,
    negative,
    costs: {
      producers: 2,
      purpose: "initial OCI runtime qualification and one repair-driven rerun",
      matrixDurationsMs: [entry.durationMs, runtime.matrix.durationMs],
      imageBuilds: 0,
      hostedDispatches: 0,
    },
    sourceBuild: {
      status: build.status,
      exitCode: 2,
      message: build.failureClassification.message,
      passingReceipt: false,
    },
    nextIncrement:
      "One real public workflow with an intended rejection, disposable qualification-host suitability and authenticated read-only producer/consumer evidence handoff; inspect native Windows feasibility early.",
  };
  await writeFile(
    resolve(output, "closeout.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "RUNTIME-INCREMENT",
        summary:
          "Validated the curated raw runtime bundle and twelve supporting command receipts, observed negative audit boundaries, preserved active authority/history and recorded the existing NOT_READY source-build gate.",
      },
    ],
    [{ path: "closeout.json", kind: "orch-auth-runtime-closeout" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["orch-auth-runtime-closeout"],
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      supportingReceipts: receipts.length,
      protectedFiles: preserved.length,
      focusedTests: focused.numTotalTests,
      sourceBuild: build.status,
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
