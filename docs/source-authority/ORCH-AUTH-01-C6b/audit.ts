import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { assertActiveAuthorityPublication } from "../../../tools/milestone-orchestrator/src/authority-publication.mjs";
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
  "orch-auth-01-c6b",
  "retained-source-scope-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const gitBytes = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
const git = (root: string, ...args: string[]) =>
  gitBytes(root, ...args)
    .toString("utf8")
    .trim();
const identity = (report) =>
  report.testResults
    .flatMap((file) =>
      file.assertionResults.map((test) => {
        const path = file.name.replaceAll("\\", "/");
        return `${path.slice(path.indexOf("/tools/") + 1)}#${test.fullName}`;
      }),
    )
    .sort();
try {
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "evidence/manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.schemaVersion, "source-scope-evidence.v1");
  assert.equal(manifest.sourceBase, "c708945e4ba8e0b75f09bc9e564b4afc5cb47a0a");
  assert.equal(manifest.completionEligible, false);
  assert.equal(manifest.activationAuthorized, false);
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
      hash(gitBytes(repo, "show", `${manifest.sourceBase}:${pin.path}`)),
      pin.sha256,
      `Unchanged authority ${pin.path}`,
    );
  assert.equal(await assertActiveAuthorityPublication(repo), "legacy");
  assert.equal(
    git(repo, "for-each-ref", "--format=%(refname)", "refs/milestone-loop/"),
    "",
  );
  assert(!existsSync(resolve(repo, "artifacts/orchestrator/state/state.json")));

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
  const passing = (report, total: number) => {
    assert.equal(report.success, true);
    assert.equal(report.numTotalTests, total);
    assert.equal(report.numPassedTests, total);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    assert.equal(identity(report).length, total);
    assert(
      report.testResults.every((file) =>
        file.assertionResults.every((test) => test.status === "passed"),
      ),
    );
  };
  for (const [name, count] of [
    ["aggregate-body-focused-2", 140],
    ["foundation-focused-2", 103],
  ] as const) {
    passing(await read(`${name}/vitest-report.json`), count);
    const summary = assertTestRunSummary(
      await read(`${name}/test-run-summary.json`),
    );
    assert.deepEqual(summary.reports, [
      await describeVitestReport({
        artifactDirectory: resolve(input, name),
        reportPath: resolve(input, name, "vitest-report.json"),
      }),
    ]);
    assert(receipts.some((receipt) => receipt.path === `${name}/result.json`));
  }
  for (const [name, total, failed] of [
    ["aggregate-body-focused-1", 138, 2],
    ["foundation-focused-1", 88, 5],
    ["tier-nested-regression-1", 53, 1],
  ] as const) {
    const report = await read(`${name}/vitest-report.json`);
    assert.equal(report.numTotalTests, total);
    assert.equal(report.numFailedTests, failed);
    assert(!existsSync(resolve(input, name, "result.json")));
  }
  for (const name of [
    "typecheck-1",
    "typecheck-3",
    "typecheck-5",
    "build-1",
    "dependencies-1",
  ])
    assert(!existsSync(resolve(input, name, "result.json")));
  for (const name of [
    "typecheck-8",
    "lint-3",
    "format-3",
    "architecture-2",
    "invariants-1",
    "dependencies-projection-1",
    "build-projection-1",
  ])
    assert(
      receipts.some((receipt) => receipt.path === `${name}/result.json`),
      name,
    );

  const projection = await read("vm-3/input/projection.json");
  const failedUnit = await read(
    "vm-2/guest/artifacts/source-scope-unit/test-report.json",
  );
  assert.equal(failedUnit.numTotalTests, 1089);
  assert.equal(failedUnit.numPassedTests, 1088);
  assert.equal(failedUnit.numFailedTests, 1);
  assert(
    !existsSync(
      resolve(input, "vm-2/guest/artifacts/source-scope-unit/result.json"),
    ),
  );
  const failedHost = await read("vm-2/host/host.json");
  assert.equal(failedHost.status, "ERROR");
  for (const key of [
    "cleanupVerified",
    "pidAbsent",
    "directoryAbsent",
    "cgroupAbsent",
  ])
    assert.equal(failedHost[key], true);
  passing(await read("native-publication-final/vitest-report.json"), 30);
  assert(
    receipts.some(
      (receipt) => receipt.path === "native-publication-final/result.json",
    ),
  );
  assert.equal(projection.sourceBase, manifest.sourceBase);
  assert.equal(
    projection.sourceBaseTree,
    "aff732d45db883212ceedce09b36fba311265464",
  );
  assert.equal(
    projection.projectedTree,
    "12b2e205abab2d728b4c749da8926754acda9686",
  );
  assert.equal(projection.paths.length, 15);
  for (const pin of projection.pins)
    assert.equal(hash(await readFile(resolve(repo, pin.path))), pin.sha256);
  assert.equal(
    hash(await readFile(resolve(input, "vm-3/input/source.patch"))),
    projection.inputs["source.patch"].sha256,
  );

  // Retain and inspect actual development Git objects; prose and invented hashes
  // cannot substitute for the clean commit consumed by the production build.
  const temporary = await mkdtemp(resolve(tmpdir(), "c6b-retained-git-"));
  try {
    git(temporary, "init", "--quiet");
    await mkdir(resolve(temporary, ".git/objects/info"), { recursive: true });
    await writeFile(
      resolve(temporary, ".git/objects/info/alternates"),
      git(
        repo,
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "objects",
      ).replaceAll("\\", "/") + "\n",
    );
    git(
      temporary,
      "fetch",
      "--quiet",
      resolve(input, "build-projection.bundle"),
      "HEAD",
    );
    const build = await read("build-projection-1/build-report.json");
    assert.equal(build.status, "PASS");
    assert.equal(
      build.source.commit,
      "cb6b91235bdd8de8f86eb0c3a7c44c7d9575b56f",
    );
    assert.equal(
      git(temporary, "rev-parse", `${build.source.commit}^{tree}`),
      "7dfaa338d0882ffb35fe69fe3d8df90395f9947c",
    );
    assert.equal(
      git(temporary, "rev-parse", `${build.source.commit}^`),
      manifest.sourceBase,
    );
    const fixturePath =
      "tools/milestone-orchestrator/src/authority-publication.test.ts";
    for (const pin of projection.pins.filter((pin) => pin.path !== fixturePath))
      assert.equal(
        hash(gitBytes(temporary, "show", `${build.source.commit}:${pin.path}`)),
        pin.sha256,
      );
    const oldFixture = gitBytes(
      temporary,
      "show",
      `${build.source.commit}:${fixturePath}`,
    ).toString("utf8");
    const marker =
      '      "tools/milestone-orchestrator/src/authority-publication.mjs",\n';
    assert.equal(oldFixture.split(marker).length, 2);
    assert.equal(
      await readFile(resolve(repo, fixturePath), "utf8"),
      oldFixture.replace(
        marker,
        marker +
          '      "tools/milestone-orchestrator/src/verification-scope.mjs",\n',
      ),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  const unitPath = "vm-3/guest/artifacts/source-scope-unit";
  const unit = await read(`${unitPath}/test-report.json`);
  passing(unit, 1089);
  const summary = assertTestRunSummary(
    await read(`${unitPath}/test-run-summary.json`),
  );
  assert.deepEqual(summary.reports, [
    await describeVitestReport({
      artifactDirectory: resolve(input, unitPath),
      reportPath: resolve(input, unitPath, "test-report.json"),
    }),
  ]);
  const oldUnit = await read("hosted/controller-linux/unit/test-report.json");
  passing(oldUnit, 1043);
  const remaining = [...identity(unit)];
  for (const old of identity(oldUnit)) {
    const index = remaining.indexOf(old);
    assert(index >= 0, `Original unit case is missing: ${old}`);
    remaining.splice(index, 1);
  }
  assert.equal(remaining.length, 46);
  assert(
    remaining.every(
      (name) =>
        name.startsWith(
          "tools/milestone-orchestrator/src/verification-scope.test.ts#",
        ) ||
        name.startsWith(
          "tools/milestone-orchestrator/src/source-authority-anchor.test.ts#",
        ),
    ),
  );
  // This is multiset preservation, not the still-open candidate exactly-once proof.
  const host = await read("vm-3/host/host.json"),
    expected = await read("vm-3/expected.json");
  assert.equal(host.status, "OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT");
  assert.deepEqual(host.binding, expected.binding);
  for (const key of [
    "cleanupVerified",
    "pidAbsent",
    "directoryAbsent",
    "cgroupAbsent",
  ])
    assert.equal(host[key], true);
  for (const name of ["vm-3/oci-audit", "vm-3/host-audit"])
    assert(
      receipts.some((receipt) => receipt.path === `${name}/result.json`),
      name,
    );
  assert(
    !existsSync(resolve(input, "vm-1/host")),
    "Abandoned preparation must not imply a VM run.",
  );
  // Retain the actual incomplete preceding cohort. Completing all five jobs is
  // still required in the continuation; this inventory cannot satisfy that gate.
  const hostedJobs = (await read("hosted/jobs.json")).jobs;
  assert.equal(hostedJobs.length, 5);
  assert.equal(new Set(hostedJobs.map((job) => job.id)).size, 5);
  for (const job of hostedJobs) {
    assert.equal(job.run_id, 34029390274);
    assert.equal(job.head_sha, manifest.sourceBase);
    if (job.id === 101476015102) {
      assert.equal(job.name, "Controller (windows)");
      assert.equal(job.status, "in_progress");
      assert.equal(job.conclusion, null);
      assert.equal(
        job.steps.find((step) => step.name === "Run controller suite")
          ?.conclusion,
        "success",
      );
    } else {
      assert(
        [101476014977, 101476015087, 101476015109, 101476015146].includes(
          job.id,
        ),
      );
      assert.equal(job.status, "completed");
      assert.equal(job.conclusion, "success");
    }
  }
  const hostedArtifacts = (await read("hosted/artifacts.json")).artifacts;
  assert.deepEqual(
    hostedArtifacts.map((artifact) => artifact.name).sort(),
    [
      "controller-linux",
      "fresh-adopter-linux",
      "fresh-adopter-windows",
      "trusted-container-linux",
    ]
      .map((name) => `${name}-${manifest.sourceBase}`)
      .sort(),
  );
  for (const artifact of hostedArtifacts) {
    assert.equal(artifact.workflow_run.id, 34029390274);
    assert.equal(artifact.workflow_run.head_sha, manifest.sourceBase);
    const stem = artifact.name.slice(0, -41);
    const bytes = await readFile(resolve(input, "hosted", stem + ".zip"));
    assert.equal(bytes.length, artifact.size_in_bytes);
    assert.equal("sha256:" + hash(bytes), artifact.digest);
    const toolchain = await read(`hosted/${stem}/toolchain.json`);
    assert.equal(toolchain.github.sha, manifest.sourceBase);
    assert.equal(toolchain.observed.nodeVersion, "v24.18.0");
    assert.equal(toolchain.observed.pnpmVersion, "11.15.1");
  }
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "source-scope-retained-audit.v1",
        status: "PASS",
        completionEligible: false,
        activationAuthorized: false,
        observer: await commandIdentity(repo),
        sourceBase: manifest.sourceBase,
        projectedTree: projection.projectedTree,
        nativeCases: [140, 103],
        linuxUnitCases: 1089,
        preservedPriorUnitObservations: 1043,
        additionalCases: remaining,
        candidateExactlyOnce: "UNRESOLVED",
        priorHostedCohort: "FOUR_JOBS_PASSED_WINDOWS_UNIT_RUNNING",
        currentCommitHostedCohort: "POSTCOMMIT_OBLIGATION",
        rawFiles: files.length,
        receipts,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "retained-source-readers",
        summary:
          "Independently checked retained raw files, real child receipts, current source/unchanged authority bytes, actual development Git objects, native regressions and the complete Linux unit multiset. No authority activation, candidate or readiness claim is made.",
      },
    ],
    [{ path: "audit.json", kind: "source-scope-retained-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["source-scope-retained-audit"],
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
