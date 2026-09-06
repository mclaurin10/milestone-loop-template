import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { assertActiveAuthorityPublication } from "../../../tools/milestone-orchestrator/src/authority-publication.mjs";
import {
  SOURCE_TRANSITION_OUTPUT_PATHS,
  SOURCE_TRANSITION_COMMANDS,
} from "../../../tools/milestone-orchestrator/src/source-authority-transition.js";
import { canonicalJson } from "../../../tools/milestone-orchestrator/src/package-graph.js";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c6d",
  "source-transition-retained-audit",
);
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
const base = "ab19211e3663acc7b14acc847bdc3dde11414d19";
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
        assert(info.isFile() && info.size <= 20_000_000);
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
  for (const pin of [
    ...manifest.implementation,
    ...manifest.activeGeneration,
  ]) {
    const bytes = await readFile(resolve(repo, pin.path));
    assert.equal(bytes.length, pin.bytes, pin.path);
    assert.equal(hash(bytes), pin.sha256, pin.path);
  }
  for (const pin of manifest.activeGeneration)
    assert.equal(
      hash(git("show", `${base}:${pin.path}`)),
      pin.sha256,
      pin.path,
    );
  assert.equal(await assertActiveAuthorityPublication(repo), "legacy");
  assert.equal(
    git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/")
      .toString()
      .trim(),
    "",
  );
  assert(!existsSync(resolve(repo, "artifacts/orchestrator/state/state.json")));
  assert(
    !existsSync(
      resolve(repo, ".agent/authority-requests/ORCH-AUTH-01/request.json"),
    ),
  );

  const receipts: { path: string; sha256: string }[] = [];
  for (const file of files.filter((file) =>
    file.path.endsWith("/result.json"),
  )) {
    const value = await read(file.path);
    if (value.schemaVersion !== "1.0.0" || typeof value.stageId !== "string")
      continue;
    const checked = await validateCommandReceiptDirectory({
      directory: dirname(resolve(input, file.path)),
      expectedStageId: value.stageId,
      expectedCommandId: value.commandId,
    });
    receipts.push({ path: file.path, sha256: checked.receiptSha256 });
  }
  for (const name of [
    "request-focused-1",
    "boundary-focused-3",
    "typecheck-7",
    "lint-2",
    "format-3",
    "architecture-3",
    "invariants-1",
    "projection-2",
    "hosted-audit-1",
  ])
    assert(
      receipts.some((receipt) => receipt.path === name + "/result.json"),
      name,
    );
  for (const name of [
    "typecheck-1",
    "typecheck-3",
    "typecheck-6",
    "architecture-1",
    "schedule-baseline-1",
    "boundary-focused-1",
    "boundary-focused-2",
  ])
    assert(!existsSync(resolve(input, name, "result.json")), name);
  const baseline = await read("schedule-baseline-1/vitest-report.json");
  assert.equal(baseline.numTotalTests, 24);
  assert.equal(baseline.numPassedTests, 21);
  assert.equal(baseline.numFailedTests, 3);
  assert(
    baseline.testResults
      .flatMap((file) => file.assertionResults)
      .filter((test) => test.status === "failed")
      .every((test) =>
        test.fullName.includes(
          "refuses an unactivated source epoch signaled by",
        ),
      ),
  );
  const counts: Record<string, number> = {};
  for (const name of ["request-focused-1", "boundary-focused-3"]) {
    const raw = await read(name + "/vitest-report.json");
    assert.equal(raw.success, true);
    assert.equal(raw.numPassedTests, raw.numTotalTests);
    assert.equal(raw.numFailedTests, 0);
    assert.equal(raw.numPendingTests, 0);
    assert(raw.numTotalTests > 0);
    assert.deepEqual(
      assertTestRunSummary(await read(name + "/test-run-summary.json")).reports,
      [
        await describeVitestReport({
          artifactDirectory: resolve(input, name),
          reportPath: resolve(input, name, "vitest-report.json"),
        }),
      ],
    );
    counts[name] = raw.numTotalTests;
  }
  assert.equal(counts["request-focused-1"], 31);
  assert.equal(counts["boundary-focused-3"], 132);
  const incompleteSelection = await read(
    "boundary-focused-2/vitest-report.json",
  );
  assert.equal(incompleteSelection.numPassedTests, 86);
  assert.equal(incompleteSelection.numFailedTests, 0);
  const hosted = await read("hosted-audit-1/audit.json");
  assert.equal(hosted.status, "PASS");
  assert.equal(hosted.observations.length, 5);
  assert(hosted.observations.every((job) => job.conclusion === "success"));
  const incidental = await read("boundary-focused-1/vitest-report.json");
  assert.equal(incidental.numPassedTests, 85);
  assert.equal(incidental.numFailedTests, 1);
  assert(
    (
      await readFile(resolve(input, "boundary-focused-1/stderr.log"), "utf8")
    ).includes("047cee6f2f26bf7c0ad63b591afd3175e9904162"),
  );
  assert(
    (
      await readFile(
        resolve(input, "boundary-focused-1/input-adopter-package.test.ts"),
      )
    ).equals(
      git(
        "show",
        `${base}:tools/milestone-orchestrator/src/adopter-package.test.ts`,
      ),
    ),
  );
  const projection = await read("projection-2/transition-inspection.json");
  assert.equal(projection.subject.implementation.commit, base);
  assert.equal(
    projection.subject.implementation.tree,
    "acb013e612c2cf55d362e2f5c477301dd4420bbc",
  );
  assert.equal(projection.subject.implementation.branch, "master");
  assert.equal(
    projection.subject.snapshotCommit,
    "91cbd3eb75ec771cfa1f315fe2641488e361c9e0",
  );
  assert.equal(
    projection.subject.approvedContentDigest,
    "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108",
  );
  for (const key of [
    "publicationAuthorized",
    "implementationAuditAuthenticated",
    "independentReviewAuthenticated",
    "completionEligible",
  ])
    assert.equal(projection[key], false);
  assert.equal(projection.canonicalStateReobserved, true);
  assert.equal(
    projection.subjectSha256,
    hash(Buffer.from(canonicalJson(projection.subject) + "\n")),
  );
  assert.deepEqual(
    projection.outputs.map((file) => file.path),
    SOURCE_TRANSITION_OUTPUT_PATHS,
  );
  for (const file of projection.outputs) {
    const bytes = await readFile(
      resolve(input, "projection-2/proposed-root", file.path),
    );
    assert.equal(bytes.length, file.next.bytes);
    assert.equal(hash(bytes), file.next.sha256);
    if (file.prior.exists) {
      const old = git("show", `${base}:${file.path}`);
      assert.equal(old.length, file.prior.bytes);
      assert.equal(hash(old), file.prior.sha256);
    } else
      assert.equal(file.path, ".agent/completed/source-authority-epochs.json");
  }
  const projectedManifest = await read(
    "projection-2/proposed-root/.agent/verification-manifest.json",
  );
  assert.deepEqual(
    projectedManifest.focusedCommands,
    SOURCE_TRANSITION_COMMANDS,
  );
  assert.equal(projectedManifest.focusedCommands.length, 11);
  assert.equal(projectedManifest.focusedCommands[0].id, "test-invariants");
  assert.deepEqual(
    projectedManifest.focusedCommands.slice(-4).map((command) => command.argv),
    [
      "controller-runtime",
      "repository-tooling",
      "adopter-template",
      "trusted-container-fixture",
    ].map((owner) => ["pnpm", "test:partition:" + owner]),
  );
  const proposedPackage = await read("projection-2/proposed-root/package.json");
  const priorPackage = JSON.parse(
    git("show", `${base}:package.json`).toString(),
  );
  assert.deepEqual(proposedPackage.scripts, priorPackage.scripts);
  assert.equal(
    proposedPackage.milestoneLoop.verification.defaultProfile,
    "readiness",
  );
  const post = await read("c6c-postcommit/observation.json");
  assert.equal(post.candidate.gitCommit, base);
  assert.equal(post.candidate.gitStatus, "");
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "source-transition-retained-audit.v1",
        status: "PASS",
        observer: await commandIdentity(repo),
        sourceBase: base,
        completionEligible: false,
        authorityActivated: false,
        rawFiles: files.length,
        receipts,
        focusedCases: counts,
        proposedFiles: 12,
        realRequestCommitted: false,
        implementationAuditAuthenticated: false,
        independentReviewAuthenticated: false,
        actualCandidate: "NOT_RUN",
        historicalWP6e: "BLOCKED_AT_e590e38c32de2b5baa7423f66bbd8a0230b61839",
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "exact-transition-projection-and-bindings",
        summary:
          "Independently checked retained raw tests, command receipts/artifacts, unchanged legacy authority and exact proposed outputs against actual Git objects. Inspection does not authorize publication or readiness.",
      },
    ],
    [{ path: "audit.json", kind: "source-transition-retained-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["source-transition-retained-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
      receiptSha256: checked.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
