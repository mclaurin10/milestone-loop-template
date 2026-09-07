import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";
import { inspectSourceAuditReports } from "../../../tools/milestone-orchestrator/src/source-authority-audit-reports.mjs";
import { SOURCE_AUDIT_COMMANDS } from "../../../tools/milestone-orchestrator/src/source-authority-evidence.mjs";

type Pin = { path: string; bytes: number; sha256: string };
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const DEPENDENCY_REPAIR_PATHS = [
  "tools/milestone-orchestrator/src/source-authority-audit-reports.mjs",
  "tools/milestone-orchestrator/src/source-authority-evidence.test.ts",
  "tools/milestone-orchestrator/test/synthetic-source-audit.ts",
  "tools/source-release-inspection.mjs",
];

/** Rechecks retained real commands and complete raw test identities. It grants
 * no clean-input, implementation-audit, review, publication or readiness claim. */
export async function inspectDependencyRepair(
  repository: string,
  retainedRoot: string,
  historicalFiles?: ReadonlyMap<string, Buffer>,
) {
  const read = async (path: string) =>
    JSON.parse(await readFile(resolve(retainedRoot, path), "utf8"));
  const original = await read("precommit-vm-3/input/source.json");
  assert.equal(original.schemaVersion, "c6e-precommit-source-input.v1");
  assert.equal(
    original.source.commit,
    "082e4369a8e637243ff45e9e66d368452c74eced",
  );
  const delta = await read("dependency-repair-linux-1/source-delta.json");
  assert.deepEqual(delta.baseline, original.source);
  assert.deepEqual(
    delta.changes.map((row: Pin) => row.path).sort(),
    DEPENDENCY_REPAIR_PATHS,
  );
  type Change = {
    path: string;
    before: Omit<Pin, "path">;
    after: Omit<Pin, "path">;
  };
  const changes = new Map<string, Change>(
    delta.changes.map((row: Change) => [row.path, row]),
  );
  const implementationFiles = new Map<string, Buffer>();
  const pins: Pin[] = [];
  for (const pin of original.pins as Pin[]) {
    const change = changes.get(pin.path);
    if (change) {
      assert.deepEqual(change.before, { bytes: pin.bytes, sha256: pin.sha256 });
      for (const phase of ["before", "after"] as const) {
        const bytes = await readFile(
          resolve(retainedRoot, "dependency-repair-linux-1", phase, pin.path),
        );
        assert.equal(bytes.length, change[phase].bytes, pin.path);
        assert.equal(hash(bytes), change[phase].sha256, pin.path);
      }
    }
    const expected = { ...pin, ...(change?.after ?? {}) };
    const bytes = historicalFiles
      ? historicalFiles.get(pin.path)
      : await readFile(resolve(repository, pin.path));
    assert(bytes, pin.path);
    assert.equal(bytes.length, expected.bytes, pin.path);
    assert.equal(hash(bytes), expected.sha256, pin.path);
    pins.push(expected);
    implementationFiles.set(pin.path, bytes);
  }
  assert.equal(pins.length, 331);
  assert.equal(implementationFiles.size, 331);
  const receipts = [];
  for (const [name, stageId, commandId] of [
    ["typecheck-27", "typecheck", "typecheck"],
    ["lint-16", "format-lint", "lint"],
    ["format-check-7", "format-lint", "format:check"],
    ["architecture-focused-5", "source-static", "lint:source-architecture"],
    [
      "dependency-repair-focused-1/command",
      "orch-auth-01-c6b",
      "source-scope-focused",
    ],
    [
      "dependency-repair-audit-2",
      "orch-auth-01-c6e",
      "linux-dependency-repair-audit",
    ],
  ] as const) {
    const receipt = await validateCommandReceiptDirectory({
      directory: resolve(retainedRoot, name),
      expectedStageId: stageId,
      expectedCommandId: commandId,
    });
    receipts.push({
      path: name + "/result.json",
      sha256: receipt.receiptSha256,
    });
  }
  const expected = SOURCE_AUDIT_COMMANDS.find(
    (command: { id: string }) => command.id === "dependencies",
  )!;
  const directory = resolve(retainedRoot, "dependency-repair-linux-1/intact");
  const receipt = await validateCommandReceiptDirectory({
    directory,
    expectedStageId: expected.stageId,
    expectedCommandId: expected.commandId,
    requiredKinds: expected.requiredKinds,
  });
  const artifacts = new Map();
  for (const pin of receipt.artifacts) {
    const path = relative(directory, pin.path).replaceAll("\\", "/");
    assert(path && !path.startsWith("../") && !path.startsWith("/"));
    artifacts.set(path, { ...pin, path, contents: await readFile(pin.path) });
  }
  const dependencies = await read(
    "dependency-repair-linux-1/intact/report.json",
  );
  assert.equal(dependencies.schemaVersion, "source-dependencies-report.v2");
  await inspectSourceAuditReports({
    expected,
    child: { artifacts },
    implementation: {
      commit: original.source.commit,
      tree: original.source.tree,
    },
    runtime: {
      nodeVersion: "v24.18.0",
      pnpmVersion: "11.15.1",
      platform: "linux",
      architecture: "x64",
    },
    implementationFiles,
  });
  receipts.push({
    path: "dependency-repair-linux-1/intact/result.json",
    sha256: receipt.receiptSha256,
  });
  const executions = await read("dependency-repair-linux-1/commands.json");
  assert.deepEqual(
    executions.map(
      (command: { name: string; exitCode: number; timedOut: boolean }) => ({
        name: command.name,
        exitCode: command.exitCode,
        timedOut: command.timedOut,
      }),
    ),
    [
      { name: "intact", exitCode: 0, timedOut: false },
      { name: "corrupt", exitCode: 1, timedOut: false },
    ],
  );
  for (const command of executions) {
    assert.deepEqual(command.argv.slice(1), [
      "--config.verify-deps-before-run=error",
      "verify:source-dependencies",
    ]);
    assert.equal(command.cwd, dependencies.references.actual);
    assert.equal(command.uid, 1000);
    assert(command.durationMs > 0);
  }
  const failure = await read("dependency-repair-linux-1/corrupt/manifest.json");
  assert.equal(failure.status, "ERROR");
  assert.equal(failure.receipt, null);
  assert(
    !existsSync(
      resolve(retainedRoot, "dependency-repair-linux-1/corrupt/result.json"),
    ),
  );
  assert.match(
    failure.failureClassification.message,
    /Installed dependency bytes differ from frozen reference/,
  );
  const corruption = await read("dependency-repair-linux-1/corruption.json");
  assert.equal(corruption.restored, true);
  assert.equal(corruption.sourceFilesChangedByCorruption, false);
  assert.notEqual(corruption.original.sha256, corruption.mutated.sha256);
  const audited = await read("dependency-repair-audit-2/report.json");
  assert.equal(audited.intactReceipt, receipt.receiptSha256);
  assert.deepEqual(audited.corruption, corruption);
  assert.deepEqual(audited.changedSource, delta.changes);
  assert.equal(audited.actualImplementationAudit, false);
  assert.equal(audited.completionEligible, false);
  const before = await read(
    "dependency-repair-focused-1/input-observation.json",
  );
  const after = await read(
    "dependency-repair-focused-1/input-observation-after.json",
  );
  assert.deepEqual(before.pins, pins);
  assert.deepEqual(after.pins, pins);
  assert.deepEqual(before.delta, delta.changes);
  assert.equal(after.unchanged, true);
  const execution = await read("dependency-repair-focused-1/execution.json");
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.timedOut, false);
  assert.equal(execution.uid, 1000);
  assert.equal(execution.cwd, dependencies.references.actual);
  assert.deepEqual(execution.argv.slice(1), [
    "--config.verify-deps-before-run=error",
    "exec",
    "tsx",
    "docs/source-authority/ORCH-AUTH-01-C6b/run-focused.ts",
    ...before.files,
  ]);
  const raw = await read(
    "dependency-repair-focused-1/command/vitest-report.json",
  );
  assert.equal(raw.numTotalTests, 260);
  assert.equal(raw.numPassedTests, 260);
  for (const key of ["numFailedTests", "numPendingTests", "numTodoTests"])
    assert.equal(raw[key], 0);
  assert.equal(raw.testResults.length, 10);
  assert.equal(raw.success, true);
  const identities = (report: typeof raw): string[] =>
    report.testResults.flatMap(
      (file: {
        name: string;
        assertionResults: { fullName: string; status: string }[];
      }) =>
        file.assertionResults.map((test) => {
          assert.equal(test.status, "passed");
          const path = file.name.replaceAll("\\", "/");
          return path.slice(path.indexOf("/tools/") + 1) + "\0" + test.fullName;
        }),
    );
  const ids = identities(raw);
  assert.equal(new Set(ids).size, 260);
  const prior = await read("recovery-publication-focused-1/vitest-report.json");
  const priorIds = identities(prior);
  assert.equal(priorIds.length, 203);
  for (const identity of priorIds) assert(ids.includes(identity), identity);
  const summary = assertTestRunSummary(
    await read("dependency-repair-focused-1/command/test-run-summary.json"),
  );
  assert.deepEqual(summary.reports, [
    await describeVitestReport({
      artifactDirectory: resolve(
        retainedRoot,
        "dependency-repair-focused-1/command",
      ),
      reportPath: resolve(
        retainedRoot,
        "dependency-repair-focused-1/command/vitest-report.json",
      ),
    }),
  ]);
  return {
    sourceBase: original.source,
    changes: delta.changes,
    pins,
    receipts,
    tests: 260,
    files: 10,
    preservedPriorTests: 203,
    packages: dependencies.packages.length,
    presentPackages: dependencies.packages.filter(
      (pkg: { present: boolean }) => pkg.present,
    ).length,
    corruption,
    workingTreeDirty: true,
    actualImplementationAudit: false,
    sourceQualification: false,
    completionEligible: false,
  };
}
