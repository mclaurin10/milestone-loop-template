import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  evidenceContext,
  writeJson,
  writeReceipt,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { auditPlanningRuntime } from "./audit-runtime.js";

const source = resolve(import.meta.dirname, "../../..");
assert(
  process.argv[2] && process.argv[3],
  "Expected <extracted-archive-root> <fresh-output>.",
);
const extracted = resolve(process.argv[2]);
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(process.argv[3]);
const context = await evidenceContext("orch-auth-01-b", "planning-closeout");
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (path: string) =>
  JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
const git = (root: string, args: readonly string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
const archiveManifest = await json(
  resolve(import.meta.dirname, "evidence/manifest.json"),
);
assert.equal(archiveManifest.schemaVersion, "orch-auth-01-b-evidence.v1");
assert.equal(archiveManifest.completionEligible, false);
for (const entry of archiveManifest.archives) {
  assert(
    [
      "linux-initial.tar.gz",
      "linux-qualified.tar.gz",
      "supporting-evidence.tar.gz",
    ].includes(entry.file),
  );
  const bytes = await readFile(
    resolve(import.meta.dirname, "evidence", entry.file),
  );
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha256(bytes), entry.sha256);
}
assert.equal(archiveManifest.archives.length, 3);
const qualified = resolve(extracted, "qualified");
const supporting = resolve(extracted, "supporting");
const runtime = await auditPlanningRuntime(resolve(qualified, "artifacts/ob1"));
assert.equal(runtime.source.commit, "ae4e4fe5950d0a4711aadcf957bdb75479895911");
assert.equal(runtime.source.tree, "0e81e7d8236d34c6982f363c9fb6a2bf7d45f5de");
assert.equal(runtime.fileCount, 104);

// Inspect the actual source commit from its bundle in a separate bare Git
// database. This does not initialize or adopt controller state or source refs.
const temporary = await mkdtemp(
  resolve(context.artifactDirectory, "source-inspection-"),
);
const database = resolve(temporary, "repository.git");
git(source, [
  "clone",
  "--quiet",
  "--bare",
  "--no-local",
  "--no-hardlinks",
  "--",
  source,
  database,
]);
git(database, [
  "bundle",
  "unbundle",
  resolve(qualified, "artifacts/ob1/setup/source.bundle"),
]);
assert.equal(
  git(database, ["rev-parse", `${runtime.source.commit}^{tree}`]),
  runtime.source.tree,
);
git(database, [
  "merge-base",
  "--is-ancestor",
  "e01298be5cc76ad33f66a73870e5b6e9d1f661ef",
  runtime.source.commit,
]);
const immutable = [
  "PROJECT_GOAL.md",
  "AGENTS.md",
  "CONTRACT.md",
  "evals",
  "docs/proposals",
  ".github",
  "scripts",
  "package.json",
  "pnpm-lock.yaml",
  ".agent/verification-manifest.json",
  ".agent/readiness-profile-activated.json",
  "tools/milestone-orchestrator/config/default.json",
];
git(database, [
  "diff",
  "--exit-code",
  "--name-only",
  "e01298be5cc76ad33f66a73870e5b6e9d1f661ef",
  runtime.source.commit,
  "--",
  ...immutable,
]);
const frozen = new Map<string, string>(
  git(database, [
    "ls-tree",
    "-r",
    "--format=%(objectmode) %(objectname)%x09%(path)",
    runtime.source.commit,
  ])
    .split("\n")
    .map((line) => {
      const [hash, path] = line.split("\t");
      assert(hash && path);
      return [path, hash];
    }),
);
const index = new Map<string, string>(
  git(source, ["ls-files", "--stage"])
    .split("\n")
    .map((line) => {
      const match = /^(\d+ [a-f0-9]{40}) 0\t(.+)$/.exec(line);
      assert(match);
      return [match[2]!, match[1]!];
    }),
);
const permittedRecords = (path: string) =>
  [
    ".agent/current-exec-plan.md",
    "docs/autonomy-log.md",
    "docs/decision-log.md",
    "docs/runtime-qualification/ORCH-AUTH-01-B/README.md",
    "docs/runtime-qualification/ORCH-AUTH-01-B/verify-closeout.ts",
  ].includes(path) ||
  path.startsWith("docs/runtime-qualification/ORCH-AUTH-01-B/evidence/");
const recordChanges: string[] = [];
for (const path of new Set([...frozen.keys(), ...index.keys()])) {
  if (frozen.get(path) === index.get(path)) continue;
  assert(
    permittedRecords(path),
    `Unqualified executable or contract change: ${path}`,
  );
  recordChanges.push(path);
}
const executablePaths = [
  "tools",
  "fixtures",
  "scripts",
  "package.json",
  "pnpm-lock.yaml",
  "docs/runtime-qualification/ORCH-AUTH-01-B/run-runtime.ts",
  "docs/runtime-qualification/ORCH-AUTH-01-B/run-focused.ts",
  "docs/runtime-qualification/ORCH-AUTH-01-B/audit-runtime.ts",
];
git(source, [
  "diff",
  "--exit-code",
  "--name-only",
  "--",
  ...executablePaths,
  ...immutable,
]);
assert.equal(
  git(source, ["for-each-ref", "--format=%(refname)", "refs/milestone-loop/"]),
  "",
);
const roadmap = "Implementation-ready improvement plan 8-5-26.txt";
assert(!index.has(roadmap));
if (existsSync(resolve(source, roadmap)))
  assert.equal(
    sha256(await readFile(resolve(source, roadmap))),
    "53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1",
  );

const matrixAuditRoot = resolve(qualified, "matrix-audit");
await validateCommandReceiptDirectory({
  directory: matrixAuditRoot,
  expectedStageId: "orch-auth-runtime-audit",
  expectedCommandId: "ORCH-AUTH-01-A-retained-evidence",
  requiredKinds: ["orch-auth-runtime-audit"],
});
const matrixAudit = await json(resolve(matrixAuditRoot, "runtime-audit.json"));
const actualArtifacts = await inventoryContainerArtifacts(
  resolve(qualified, "artifacts"),
  { maximumFiles: 10_000, maximumBytes: 268_435_456 },
);
assert.deepEqual(actualArtifacts, matrixAudit.inventory);
const matrix = await json(
  resolve(qualified, "artifacts/ob-matrix/result.json"),
);
assert.equal(matrix.status, "PASS");
assert.equal(matrix.controllerSource.head, runtime.source.commit);
assert.equal(matrix.controllerSource.candidateTree, runtime.source.tree);
assert.deepEqual(
  matrix.cases.map((entry: { id: string; status: string }) => [
    entry.id,
    entry.status,
  ]),
  [
    ["normal", "PASS"],
    ["boundary", "PASS"],
    ["artifact-link", "ERROR"],
    ["artifact-quota", "ERROR"],
    ["output-flood", "ERROR"],
    ["hang", "TIMEOUT"],
  ],
);
assert.deepEqual(matrix.managedResources, {
  containers: { before: [], after: [] },
  volumes: { before: [], after: [] },
});
assert.equal(
  matrixAudit.matrix.sha256,
  sha256(await readFile(resolve(qualified, "artifacts/ob-matrix/result.json"))),
);

const receipts = [
  ["focused-2", "orch-auth-01-b", "planning-focused"],
  ["checks-final/typecheck", "typecheck", "typecheck"],
  ["checks-final/lint", "format-lint", "lint"],
  ["checks-final/format-check", "format-lint", "format:check"],
  ["checks-final/invariants", "invariant-suite", "test:invariants"],
  ...[
    "protected-integrity",
    "test-ownership",
    "orchestrator-schema-integrity",
    "orchestrator-policy-integrity",
    "fail-closed-evidence",
  ].map((id) => [
    `checks-final/invariants/entries/${id}`,
    "invariant-suite",
    id,
  ]),
  ["runtime-audit", "orch-auth-01-b", "planning-archive-audit"],
] as const;
for (const [path, stageId, commandId] of receipts)
  await validateCommandReceiptDirectory({
    directory: resolve(supporting, path!),
    expectedStageId: stageId!,
    expectedCommandId: commandId!,
  });
const tests = await json(resolve(supporting, "focused-2/vitest-report.json"));
assert.equal(tests.numTotalTests, 94);
assert.equal(tests.numPassedTests, 94);
assert.equal(tests.numFailedTests, 0);
assert.equal(tests.numPendingTests, 0);
assert.equal(tests.testResults.length, 6);
const build = await json(
  resolve(supporting, "checks-final/build/manifest.json"),
);
assert.equal(build.status, "NOT_READY");
assert(!existsSync(resolve(supporting, "checks-final/build/result.json")));
const tamper = await json(resolve(supporting, "tamper-outcome.json"));
assert.equal(tamper.exitCode, 1);
assert.equal(tamper.passReceiptExists, false);
assert(!existsSync(resolve(supporting, "tamper-audit/result.json")));
assert.match(
  await readFile(resolve(supporting, "tamper-audit-console.log"), "utf8"),
  /Qualification artifact inventory changed/,
);
assert(!existsSync(resolve(supporting, "audit-run-1/result.json")));
const feasibility = await json(resolve(supporting, "windows-feasibility.json"));
assert.equal(feasibility.result, "NOT_READY");
assert.equal(feasibility.configurationChanged, false);
await mkdir(context.artifactDirectory, { recursive: true });
const report = {
  schemaVersion: "orch-auth-01-b-closeout.v1",
  status: "PASS",
  testedSource: runtime.source,
  frozenFiles: frozen.size,
  recordChanges,
  supportingReceipts: receipts.length,
  tests: 94,
  workflowArtifactFiles: runtime.fileCount,
  completeMatrixCases: 6,
  retainedMatrixArtifactFiles: actualArtifacts.fileCount,
  sourceBuild: "NOT_READY",
  nativeWindowsQualified: false,
  generalDockerControllerHostQualified: false,
  sourceActivation: false,
  completion: { eligible: false },
};
await writeJson(
  resolve(context.artifactDirectory, "closeout-report.json"),
  report,
);
await writeReceipt(
  context,
  [
    {
      id: "bounded-runtime-closeout",
      summary:
        "Verified archive seals, actual workflow/OCI artifacts, owned receipts, frozen executable-source equality, protected authority, retained refusals and the distinct incomplete source gates.",
    },
  ],
  [{ path: "closeout-report.json", kind: "planning-closeout-report" }],
);
await validateCommandReceiptDirectory({
  directory: context.artifactDirectory,
  expectedStageId: context.stageId,
  expectedCommandId: context.commandId,
  requiredKinds: ["planning-closeout-report"],
});
process.stdout.write(`${JSON.stringify(report)}\n`);
