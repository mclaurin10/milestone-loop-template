import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import {
  commandIdentity,
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { SOURCE_AUDIT_COMMANDS } from "../../../tools/milestone-orchestrator/src/source-authority-evidence.mjs";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";
import { inspectPrecommitReports } from "./inspect-precommit-reports.js";
import { inspectLinuxPrecommit } from "./inspect-linux-precommit.js";

const repository = resolve(import.meta.dirname, "../../..");
const evidence = resolve(
  repository,
  "artifacts/wp6e-source-publication-20260906",
);
const input = resolve(evidence, "precommit-oci-vm-2");
const linux = resolve(evidence, "precommit-linux-4");
const output = resolve(evidence, "precommit");
const clone = resolve(repository, ".tools/wp6e-c6e-unborn-precommit-20260907");
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c6e",
  "clean-precommit-observation",
);
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const checks = [
  ...SOURCE_AUDIT_COMMANDS,
  {
    id: "orchestrator",
    argv: ["pnpm", "test:orchestrator"],
    stageId: "verification-tier-milestone",
    commandId: "test-orchestrator",
    requiredKinds: ["orchestrator-vitest-report", "test-run-summary"],
  },
];
try {
  const metadata = await read(resolve(input, "input/source.json"));
  const expected = await read(resolve(input, "expected.json"));
  const observed = await read(resolve(linux, "verify/observation.json"));
  assert.equal(metadata.schemaVersion, "c6e-precommit-source-input.v3");
  assert.equal(
    metadata.originalSource.commit,
    "1c386ec95b628a2323f8d5dab351ad72a59abe3a",
  );
  assert.equal(observed.schemaVersion, "clean-source-precommit-observation.v2");
  assert.deepEqual(observed.source, metadata.source);
  assert.equal(expected.binding.sourceCommit, metadata.source.commit);
  assert.equal(expected.binding.sourceTree, metadata.source.tree);
  assert.equal(observed.source.status, "");
  assert.equal(observed.platform, "linux");
  for (const key of [
    "sourceStateAdopted",
    "actualImplementationAudit",
    "actualCandidate",
    "completionEligible",
  ])
    assert.equal(observed[key], false);
  assert.equal(observed.privateReferencesAbsent, true);
  const linuxChecks = await inspectLinuxPrecommit({
    directory: linux,
    source: metadata.source,
    pins: metadata.pins,
  });
  const git = (...args: string[]) => {
    const result = spawnSync(
      "git",
      ["--no-optional-locks", "-C", clone, ...args],
      { windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert(!result.error && result.status === 0 && result.signal === null);
    return result.stdout.toString().trimEnd();
  };
  assert.equal(git("rev-parse", "HEAD"), metadata.source.commit);
  assert.equal(git("rev-parse", "HEAD^{tree}"), metadata.source.tree);
  assert.equal(git("rev-parse", "HEAD^"), metadata.originalSource.commit);
  assert.equal(git("status", "--porcelain"), "");
  for (const pin of metadata.pins) {
    for (const root of [repository, clone]) {
      const bytes = await readFile(resolve(root, pin.path));
      assert.equal(bytes.length, pin.bytes, pin.path);
      assert.equal(hash(bytes), pin.sha256, pin.path);
    }
  }
  const bundle = await readFile(resolve(input, "input/precommit.bundle"));
  assert.equal(bundle.length, metadata.subjectBundle.bytes);
  assert.equal(hash(bundle), metadata.subjectBundle.sha256);
  const receipts = [];
  assert.equal(observed.commands.length, checks.length);
  const rawRoot = resolve(linux, "verify");
  for (const check of checks) {
    const raw = await read(resolve(rawRoot, check.id + ".execution.json"));
    assert.equal(raw.uid, 1000);
    assert.equal(raw.exitCode, 0);
    assert.equal(raw.timedOut, false);
    assert(raw.durationMs > 0);
    assert.deepEqual(
      observed.commands.find(
        (item: { argv: string[] }) => item.argv.at(-1) === check.argv[1],
      ),
      raw,
    );
    const directory = resolve(linux, "commands", check.id);
    const receipt = await validateCommandReceiptDirectory({
      directory,
      expectedStageId: check.stageId,
      expectedCommandId: check.commandId,
      requiredKinds: check.requiredKinds,
    });
    const manifest = await read(resolve(directory, "manifest.json"));
    assert.deepEqual(manifest.candidate, {
      gitCommit: metadata.source.commit,
      gitTree: metadata.source.tree,
      workingTreeDirty: false,
    });
    receipts.push({
      id: check.id,
      sha256: receipt.receiptSha256,
      bytes: receipt.receiptBytes,
      artifacts: receipt.artifacts,
      execution: raw,
    });
  }
  const audits = [];
  for (const [name, stage, command, kind] of [
    [
      "oci-audit",
      "orch-auth-c3-oci-audit",
      "ORCH-AUTH-01-C3-retained-oci",
      "orch-auth-c3-oci-audit",
    ],
    [
      "host-audit",
      "orch-auth-c3-host-audit",
      "retained-disposable-host",
      "orch-auth-c3-host-audit",
    ],
    [
      "cleanup-audit",
      "orch-auth-c3-cleanup-audit",
      "independent-native-cleanup",
      "cleanup-observation",
    ],
  ]) {
    const directory = resolve(input, name!);
    const receipt = await validateCommandReceiptDirectory({
      directory,
      expectedStageId: stage!,
      expectedCommandId: command!,
      requiredKinds: [kind!],
    });
    audits.push({
      name,
      sha256: receipt.receiptSha256,
      bytes: receipt.receiptBytes,
    });
  }
  const unitDirectory = resolve(linux, "commands/unit");
  const unit = await read(resolve(unitDirectory, "test-report.json"));
  assert.equal(unit.success, true);
  assert.equal(unit.numPassedTests, unit.numTotalTests);
  for (const name of ["numFailedTests", "numPendingTests", "numTodoTests"])
    assert.equal(unit[name], 0);
  assert.equal(unit.testResults.length, 101);
  const measurement = assertTestRunSummary(
    await read(resolve(unitDirectory, "test-run-summary.json")),
  );
  assert.deepEqual(measurement.reports, [
    await describeVitestReport({
      artifactDirectory: unitDirectory,
      reportPath: resolve(unitDirectory, "test-report.json"),
    }),
  ]);
  async function assertCopyable(root: string) {
    const info = await lstat(root);
    assert(!info.isSymbolicLink() && (await realpath(root)) === root);
    if (info.isDirectory())
      for (const name of await readdir(root))
        await assertCopyable(resolve(root, name));
    else assert(info.isFile() && info.size <= 20_000_000);
  }
  for (const check of checks) {
    const directory = resolve(linux, "commands", check.id);
    await assertCopyable(directory);
    await cp(directory, resolve(output, check.id), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  for (const name of await readdir(linux)) {
    if (name === "commands") continue;
    const path = resolve(linux, name);
    await assertCopyable(path);
    await cp(path, resolve(output, "linux", name), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  for (const name of [
    "host",
    "guest",
    "oci-audit",
    "host-audit",
    "cleanup-audit",
  ]) {
    const directory = resolve(input, name);
    await assertCopyable(directory);
    await cp(directory, resolve(output, "vm", name), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  for (const name of [
    "expected.json",
    "preparation.json",
    "prepared-root.txt",
    "input-manifest.json",
    "executed-preparer.py",
    "executed-driver.ps1",
    "guest-job.py",
    "guest-program.diff",
    "collection.json",
    "iso.json",
    "iso.stdout.log",
    "iso.stderr.log",
    "extraction.stdout.log",
    "extraction.stderr.log",
    "prelaunch-inspection.json",
    "prepare-execution.json",
    "prepare-start.json",
    "prepare.stdout.log",
    "prepare.stderr.log",
    "host-command-start.json",
    "host-command-execution.json",
    "host-command.stdout.log",
    "host-command.stderr.log",
    "collect-execution.json",
    "collect-start.json",
    "collect.stdout.log",
    "collect.stderr.log",
  ]) {
    const path = resolve(input, name);
    await assertCopyable(path);
    await cp(path, resolve(output, "vm", name), {
      errorOnExist: true,
      force: false,
    });
  }
  await mkdir(resolve(output, "subject"));
  await writeFile(resolve(output, "subject/precommit.bundle"), bundle, {
    flag: "wx",
  });
  await writeFile(
    resolve(output, "subject/source.json"),
    await readFile(resolve(input, "input/source.json")),
    { flag: "wx" },
  );
  const report = {
    ...observed,
    observer: await commandIdentity(repository),
    linuxChecks,
    receipts,
    audits,
    reportMeanings: await inspectPrecommitReports({
      gitRepository: clone,
      commandRoot: resolve(linux, "commands"),
      source: { commit: metadata.source.commit, tree: metadata.source.tree },
    }),
    tests: unit.numTotalTests,
    files: unit.testResults.length,
    subjectBundle: metadata.subjectBundle,
    actualCandidate: false,
    completionEligible: false,
  };
  await writeFile(
    resolve(output, "observation.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeReceipt(
    context,
    [
      {
        id: "clean-source-precommit-checks",
        summary:
          "Independently validated nine actual clean Linux command receipts and their raw execution records, all 331 source pins after the separate dependency and unborn/state-object repairs, the actual source bundle, and the same-input separate C3 host, OCI and native cleanup audits.",
      },
    ],
    [
      {
        path: "observation.json",
        kind: "source-publication-precommit-observation",
      },
      {
        path: "subject/precommit.bundle",
        kind: "source-publication-precommit-subject",
      },
      {
        path: "subject/source.json",
        kind: "source-publication-precommit-source",
      },
    ],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: [
      "source-publication-precommit-observation",
      "source-publication-precommit-subject",
      "source-publication-precommit-source",
    ],
  });
  console.log(
    JSON.stringify({
      tests: unit.numTotalTests,
      checks: receipts.length,
      audits: audits.length,
      receiptSha256: checked.receiptSha256,
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.stack : String(error),
  });
  throw error;
}
