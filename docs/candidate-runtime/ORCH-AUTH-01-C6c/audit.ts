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
import {
  compareShadowSemantics,
  type SemanticTestObservation,
} from "../../../tools/milestone-orchestrator/src/test-partitions.js";
import {
  assertTestRunSummary,
  describeVitestReport,
} from "../../../tools/milestone-orchestrator/src/test-run-summary.js";
import { assertActiveAuthorityPublication } from "../../../tools/milestone-orchestrator/src/authority-publication.mjs";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
const repo = resolve(import.meta.dirname, "../../.."),
  input = resolve(inputArg),
  output = resolve(outputArg);
assert(!existsSync(output));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = output;
const context = await evidenceContext(
  "orch-auth-01-c6c",
  "candidate-runtime-retained-audit",
);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (path: string) =>
  JSON.parse(await readFile(resolve(input, path), "utf8"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
const base = "e072287ac054197a469b39031f2a348a6c47a100";
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

  const path = "tools/qualification-host-discovery.test.mjs";
  const oldFile = git("show", `${base}:${path}`).toString("utf8");
  const oldBlock = `  it.each([
    ["linux", "/a:".repeat(HOST_DISCOVERY_LIMITS.pathEntries)],
    ["linux", "/" + "a".repeat(HOST_DISCOVERY_LIMITS.pathBytes)],
    ["linux", "/a\\0b"],
    ["darwin", "/usr/bin"],
  ])("refuses unsafe or unbounded PATH input (%s)", (platform, path) => {
    expect(() => discoverySearch(platform, path)).toThrow();
  });`;
  const newBlock = `  it.each([
    [
      "too many entries",
      "linux",
      "/a:".repeat(HOST_DISCOVERY_LIMITS.pathEntries),
    ],
    [
      "too many bytes",
      "linux",
      "/" + "a".repeat(HOST_DISCOVERY_LIMITS.pathBytes),
    ],
    ["NUL byte", "linux", "/a\\0b"],
    ["unsupported platform", "darwin", "/usr/bin"],
  ])(
    "refuses unsafe or unbounded PATH input (%s; %s)",
    (_label, platform, path) => {
      expect(() => discoverySearch(platform, path)).toThrow();
    },
  );`;
  assert.equal(oldFile.split(oldBlock).length, 2);
  assert.equal(
    await readFile(resolve(repo, path), "utf8"),
    oldFile.replace(oldBlock, newBlock),
    "Every original byte outside the explicit label transformation must remain equal.",
  );
  assert.equal(
    await readFile(
      resolve(
        input,
        "baseline-runtime-2/input-qualification-host-discovery.test.mjs",
      ),
      "utf8",
    ),
    oldFile,
  );
  const oldWorkspace = git("show", `${base}:pnpm-workspace.yaml`).toString(
    "utf8",
  );
  assert.equal(oldWorkspace.split("allowBuilds:\n").length, 2);
  assert.equal(
    await readFile(resolve(repo, "pnpm-workspace.yaml"), "utf8"),
    oldWorkspace.replace(
      "allowBuilds:\n",
      "enableGlobalVirtualStore: false\n\nallowBuilds:\n",
    ),
  );
  assert.equal(
    await readFile(
      resolve(input, "baseline-runtime-2/input-pnpm-workspace.yaml"),
      "utf8",
    ),
    oldWorkspace,
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
    "focused-2",
    "typecheck-2",
    "lint-1",
    "format-1",
    "architecture-1",
    "invariants-1",
  ])
    assert(
      receipts.some((receipt) => receipt.path === name + "/result.json"),
      name,
    );
  for (const name of ["baseline-runtime", "baseline-runtime-2", "typecheck-1"])
    assert(!existsSync(resolve(input, name, "result.json")));
  const before = await read("baseline-runtime-2/vitest-report.json"),
    after = await read("focused-2/vitest-report.json");
  assert.equal(before.numTotalTests, 41);
  assert.equal(before.numPassedTests, 40);
  assert.equal(before.numFailedTests, 1);
  const failure = before.testResults
    .flatMap((file) => file.assertionResults)
    .find((test) => test.status === "failed");
  assert(
    failure.failureMessages
      .join("\n")
      .includes("ERR_PNPM_VERIFY_DEPS_BEFORE_RUN"),
  );
  assert(
    failure.failureMessages
      .join("\n")
      .includes("enableGlobalVirtualStore setting has changed"),
  );
  assert.equal(after.success, true);
  assert.equal(after.numTotalTests, 118);
  assert.equal(after.numPassedTests, 118);
  assert.equal(after.numFailedTests, 0);
  assert.equal(after.numPendingTests, 0);
  assert.deepEqual(
    assertTestRunSummary(await read("focused-2/test-run-summary.json")).reports,
    [
      await describeVitestReport({
        artifactDirectory: resolve(input, "focused-2"),
        reportPath: resolve(input, "focused-2/vitest-report.json"),
      }),
    ],
  );
  function observations(report): SemanticTestObservation[] {
    const selected = report.testResults.filter((file) =>
      file.name.replaceAll("\\", "/").endsWith("/" + path),
    );
    assert.equal(selected.length, 1);
    assert.equal(selected[0].assertionResults.length, 40);
    return selected[0].assertionResults.map((test) => {
      assert.equal(test.status, "passed");
      assert.deepEqual(test.failureMessages, []);
      return {
        source: "observed-discovery-file",
        file: path,
        identity: test.fullName,
        testId: `${path}::${test.fullName}`,
        disposition: test.status,
        failureOutcome: test.failureMessages,
      };
    });
  }
  const oldTests = observations(before),
    newTests = observations(after);
  const duplicate = compareShadowSemantics(oldTests, oldTests);
  assert.equal(duplicate.status, "FAIL");
  assert.equal(duplicate.multiplySelectedTests.length, 1);
  assert.equal(duplicate.multiplySelectedTests[0]?.count, 3);
  const prefix =
    "launch-free qualification host discovery refuses unsafe or unbounded PATH input ";
  const mapping = [
    ["too many entries", "linux"],
    ["too many bytes", "linux"],
    ["NUL byte", "linux"],
    ["unsupported platform", "darwin"],
  ].map(([label, platform], row) => ({
    row,
    priorIdentity: prefix + `(${platform})`,
    currentIdentity: prefix + `(${label}; ${platform})`,
  }));
  const remainingOld = [...oldTests],
    remainingNew = [...newTests];
  for (const item of mapping) {
    const oldIndex = remainingOld.findIndex(
        (test) => test.identity === item.priorIdentity,
      ),
      newIndex = remainingNew.findIndex(
        (test) => test.identity === item.currentIdentity,
      );
    assert(oldIndex >= 0 && newIndex >= 0);
    remainingOld.splice(oldIndex, 1);
    remainingNew.splice(newIndex, 1);
  }
  assert.equal(remainingOld.length, 36);
  assert.deepEqual(remainingOld, remainingNew);
  const unique = compareShadowSemantics(newTests, newTests);
  assert.equal(unique.status, "PASS");
  assert.equal(unique.partitions.uniqueTestCount, 40);
  const post = await read("c6b-postcommit/observation.json");
  assert.equal(post.candidate.gitCommit, base);
  assert.equal(
    post.candidate.gitTree,
    "16e6437bbcec22023a6208236b76f699cff6f88a",
  );
  assert.equal(post.candidate.gitStatus, "");
  const build = await read("c6b-postcommit/build/build-report.json");
  assert.equal(build.source.commit, base);
  assert.equal(build.status, "PASS");
  await writeFile(
    resolve(output, "audit.json"),
    JSON.stringify(
      {
        schemaVersion: "candidate-runtime-retained-audit.v1",
        status: "PASS",
        observer: await commandIdentity(repo),
        sourceBase: base,
        completionEligible: false,
        authorityActivated: false,
        rawFiles: files.length,
        receipts,
        focusedCases: 118,
        priorDuplicateComparison: duplicate,
        currentDiscoveryComparison: unique,
        identityMapping: mapping,
        preservedUnrenamedCases: 36,
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
        id: "candidate-runtime-prerequisites",
        summary:
          "Audited actual baseline package-layout rejection, complete corrected focused checks, unchanged original PATH inputs/assertions, disjoint current report identities and clean C6b post-commit artifacts. No candidate or qualification claim.",
      },
    ],
    [{ path: "audit.json", kind: "candidate-runtime-retained-audit" }],
  );
  const checked = await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["candidate-runtime-retained-audit"],
  });
  process.stdout.write(
    JSON.stringify({
      files: files.length,
      receipts: receipts.length,
      receiptSha256: checked.receiptSha256,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, error);
  throw error;
}
