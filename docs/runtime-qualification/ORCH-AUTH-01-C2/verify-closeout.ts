import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  evidenceContext,
  commandIdentity,
  writeJson,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import {
  auditVmLifecycle,
  sha256,
  VM_AUTHORITY_DIGEST,
} from "../../../tools/qualification-vm-lifecycle.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
assert.equal(
  process.argv.length,
  4,
  "Expected extracted archive root and fresh output.",
);
const [extracted, output] = process.argv.slice(2) as [string, string];
assert(!existsSync(resolve(output)));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(output);
const context = await evidenceContext(
  "orch-auth-01-c2",
  "vm-lifecycle-closeout",
);
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const raw = resolve(extracted, "raw");
  const json = async (path: string) =>
    JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  const data = (path: string) => json(resolve(raw, path));
  const manifest = await json(
    resolve(import.meta.dirname, "evidence/manifest.json"),
  );
  assert.equal(manifest.schemaVersion, "orch-auth-01-c2-evidence.v1");
  assert.equal(manifest.completionEligible, false);
  assert.equal(manifest.archive.file, "supporting-evidence.tar.gz");
  const archive = await readFile(
    resolve(import.meta.dirname, "evidence", manifest.archive.file),
  );
  assert.equal(archive.length, manifest.archive.bytes);
  assert.equal(sha256(archive), manifest.archive.sha256);
  const inventoryBytes = await readFile(
    resolve(extracted, "raw-inventory.json"),
  );
  assert.equal(sha256(inventoryBytes), manifest.inventorySha256);
  const inventory = await inventoryContainerArtifacts(raw, {
    maximumFiles: 5000,
    maximumBytes: 64 * 1024 * 1024,
  });
  assert.deepEqual(inventory, JSON.parse(inventoryBytes.toString()));
  assert.equal(inventory.fileCount, manifest.rawFiles);
  const baseline = "a649611ee7be1834b915c377b93d7d71c02a7028";
  const source = await data("setup/source.json");
  assert.equal(source.head, baseline);
  assert.equal(
    source.candidateTree,
    "93f0fe82053ba95cd7fae79e10b2ae7cb2fbc772",
  );
  assert.equal(source.sourceMode, "frozen-index");
  const executablePaths = [
    "tools/qualification-vm-lifecycle.mjs",
    "tools/qualification-vm-lifecycle.test.mjs",
    "tools/milestone-orchestrator/config/test-ownership.json",
    "docs/runtime-qualification/ORCH-AUTH-01-C2/prepare-inputs.py",
    "docs/runtime-qualification/ORCH-AUTH-01-C2/freeze-inputs.mjs",
    "docs/runtime-qualification/ORCH-AUTH-01-C2/linux-boundaries.mjs",
    "docs/runtime-qualification/ORCH-AUTH-01-C2/run-lifecycle.ts",
    "docs/runtime-qualification/ORCH-AUTH-01-C2/run-focused.ts",
  ];
  assert.deepEqual(
    source.files.map((file: any) => file.path),
    executablePaths,
  );
  const git = (root: string, args: string[], index?: string) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 16777216,
      env: index ? { ...process.env, GIT_INDEX_FILE: index } : process.env,
    }).trim();
  const temporary = await mkdtemp(
      resolve(context.artifactDirectory, "source-inspection-"),
    ),
    database = resolve(temporary, "repository.git"),
    index = resolve(temporary, "reconstruction.index");
  git(context.repositoryRoot, [
    "clone",
    "--quiet",
    "--bare",
    "--no-local",
    "--no-hardlinks",
    "--",
    context.repositoryRoot,
    database,
  ]);
  git(database, ["read-tree", baseline], index);
  git(
    database,
    [
      "apply",
      "--cached",
      "--whitespace=error",
      resolve(raw, "setup/source.patch"),
    ],
    index,
  );
  assert.equal(git(database, ["write-tree"], index), source.candidateTree);
  for (const file of source.files) {
    assert.equal(
      git(database, ["rev-parse", `${source.candidateTree}:${file.path}`]),
      file.gitBlob,
    );
    assert.equal(
      git(context.repositoryRoot, ["rev-parse", `:${file.path}`]),
      file.gitBlob,
    );
    const bytes = await readFile(resolve(context.repositoryRoot, file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha256(bytes), file.sha256);
  }
  const preserved = [
    "PROJECT_GOAL.md",
    "AGENTS.md",
    "CONTRACT.md",
    "evals",
    "docs/proposals",
    "docs/runtime-qualification/ORCH-AUTH-01-A",
    "docs/runtime-qualification/ORCH-AUTH-01-B",
    "docs/runtime-qualification/ORCH-AUTH-01-C",
    ".github",
    "scripts",
    "package.json",
    "pnpm-lock.yaml",
    ".agent/verification-manifest.json",
    ".agent/readiness-profile-activated.json",
    "tools/milestone-orchestrator/config/default.json",
  ];
  git(context.repositoryRoot, [
    "diff",
    "--exit-code",
    baseline,
    "--",
    ...preserved,
  ]);
  git(database, [
    "diff",
    "--exit-code",
    baseline,
    source.candidateTree,
    "--",
    ...preserved,
  ]);
  for (const path of git(context.repositoryRoot, [
    "diff",
    "--name-only",
    baseline,
    "--",
  ])
    .split("\n")
    .filter(Boolean))
    assert(
      executablePaths.includes(path) ||
        [
          ".agent/current-exec-plan.md",
          "docs/autonomy-log.md",
          "docs/decision-log.md",
        ].includes(path) ||
        path.startsWith("docs/runtime-qualification/ORCH-AUTH-01-C2/"),
      `Out-of-scope change: ${path}`,
    );
  const approval = await json(
    resolve(
      context.repositoryRoot,
      "evals/authority-revisions/ORCH-AUTH-01/approval.json",
    ),
  );
  assert.equal(approval.approvedContentDigest, VM_AUTHORITY_DIGEST);
  assert.equal(approval.status, "APPROVED");
  assert.equal(approval.activationStatus, "NOT_APPLIED");
  assert.equal(
    git(context.repositoryRoot, [
      "for-each-ref",
      "--format=%(refname)",
      "refs/milestone-loop/",
    ]),
    "",
  );
  assert(
    !existsSync(
      resolve(
        context.repositoryRoot,
        "artifacts/orchestrator/state/state.json",
      ),
    ),
  );
  const roadmap = "Implementation-ready improvement plan 8-5-26.txt";
  assert.equal(git(context.repositoryRoot, ["ls-files", "--", roadmap]), "");
  if (existsSync(resolve(context.repositoryRoot, roadmap)))
    assert.equal(
      sha256(await readFile(resolve(context.repositoryRoot, roadmap))),
      "53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1",
    );
  const expectedReceipts = [
    ["entry-closeout", "orch-auth-01-c", "host-discovery-closeout"],
    ["focused-final", "orch-auth-01-c2", "vm-lifecycle-focused"],
    [
      "owner-final",
      "wp6-shadow-partition",
      "test:partition:repository-tooling",
    ],
    ["checks/typecheck", "typecheck", "typecheck"],
    ["checks/lint", "format-lint", "lint"],
    ["checks/format-check", "format-lint", "format:check"],
    ["checks/test-invariants", "invariant-suite", "test:invariants"],
    ...[
      "protected-integrity",
      "test-ownership",
      "orchestrator-schema-integrity",
      "orchestrator-policy-integrity",
      "fail-closed-evidence",
    ].map((id) => [
      `checks/test-invariants/entries/${id}`,
      "invariant-suite",
      id,
    ]),
    ["lifecycle-final", "orch-auth-01-c2", "vm-lifecycle"],
    [
      "provenance-boundaries",
      "orch-auth-01-c2",
      "provenance-and-linux-boundaries",
    ],
    [
      "independent-cleanup",
      "orch-auth-01-c2",
      "independent-cleanup-observation",
    ],
    ["lifecycle-independent-audit", "orch-auth-01-c2", "vm-evidence-audit"],
  ];
  assert.deepEqual(await data("supporting-receipts.json"), expectedReceipts);
  assert.equal(manifest.supportingReceipts, expectedReceipts.length);
  for (const [path, stage, command] of expectedReceipts)
    await validateCommandReceiptDirectory({
      directory: resolve(raw, path!),
      expectedStageId: stage!,
      expectedCommandId: command!,
    });
  const tests = await data(
    "owner-final/repository-tooling-vitest-report-01.json",
  );
  assert.equal(tests.numTotalTests, 91);
  assert.equal(tests.numPassedTests, 91);
  assert.equal(tests.numFailedTests, 0);
  assert.equal(tests.numPendingTests, 0);
  assert.equal(tests.numTodoTests, 0);
  assert.deepEqual(
    tests.testResults
      .map((file: any) => file.assertionResults.length)
      .sort((a: number, b: number) => a - b),
    [16, 35, 40],
  );
  const owner = await data("owner-final/test-partition-report.json");
  assert.equal(owner.candidate.gitTree, source.candidateTree);
  assert.equal(owner.candidate.gitCommit, baseline);
  const focused = await data("focused-final/vitest-report.json");
  assert.equal(focused.numTotalTests, 35);
  assert.equal(focused.numPassedTests, 35);
  assert.equal(focused.numPendingTests, 0);
  const expected = await data("lifecycle-final/expectations.json"),
    dispatch = await data("lifecycle-final/dispatch.json"),
    lifecycle = await data("lifecycle-final/raw/lifecycle.json");
  assert.equal(expected.binding.sourceTree, source.candidateTree);
  assert.equal(expected.binding.sourceCommit, baseline);
  assert.equal(expected.collectorSha256, source.files[0].sha256);
  assert.equal(dispatch.source.candidateTree, source.candidateTree);
  assert.equal(
    dispatch.expectedSha256,
    sha256(await readFile(resolve(raw, "lifecycle-final/expectations.json"))),
  );
  const serial = await readFile(
      resolve(raw, "lifecycle-final/raw/serial.log"),
      "utf8",
    ),
    qmp = await data("lifecycle-final/raw/qmp.json");
  auditVmLifecycle(lifecycle, expected, serial, qmp);
  const execution = await data("lifecycle-final/execution.json");
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.spawnError, null);
  assert.equal(execution.supervision.timedOut, false);
  assert.equal(execution.supervision.outputLimitExceeded, false);
  assert.equal(
    (await readFile(resolve(raw, "lifecycle-final/stderr.log"))).length,
    0,
  );
  assert.equal(
    (await readFile(resolve(raw, "lifecycle-final/raw/qemu.stderr"))).length,
    0,
  );
  const support = await data("provenance-boundaries/support-audit.json"),
    preparation = await data("provenance-boundaries/preparation.json");
  assert.equal(support.packages, 29);
  assert.equal(support.linuxBoundaryCases, 6);
  assert.equal(support.hostPackagesUnchanged, true);
  assert.equal(support.hostQualification, "NOT_READY");
  assert.equal(support.completionEligible, false);
  assert.equal(preparation.hostInstallation, false);
  assert.equal(preparation.hostPackagesBefore, preparation.hostPackagesAfter);
  assert.equal(
    sha256(
      await readFile(
        resolve(raw, "provenance-boundaries/provider-inventory.json"),
      ),
    ),
    expected.providerInventorySha256,
  );
  assert.equal(
    preparation.image.sha256,
    "d0fe84bb5f80853425fa6be28e2c106f30104c3cfe8611933f2e65c9b63f0e30",
  );
  assert.equal(preparation.image.bytes, 624829952);
  assert.deepEqual(preparation.image, expected.inputs.image);
  const indexes = new Map();
  for (const item of preparation.indexes) {
    const bytes = gunzipSync(
      await readFile(resolve(raw, "provenance-boundaries", item.file)),
      { maxOutputLength: 150 * 1024 * 1024 },
    );
    assert.equal(bytes.length, item.bytes);
    assert.equal(sha256(bytes), item.sha256);
    const release = await readFile(
      resolve(raw, "provenance-boundaries", `${item.suite}-InRelease`),
      "utf8",
    );
    assert(
      release
        .split("\nSHA256:\n")[1]!
        .split("\nSHA512:")[0]!
        .split("\n")
        .some((line) => {
          const f = line.trim().split(/\s+/);
          return (
            f[0] === item.sha256 &&
            f[1] === String(item.bytes) &&
            f[2] === `${item.component}/binary-amd64/Packages`
          );
        }),
    );
    indexes.set(
      item.file,
      bytes
        .toString()
        .split("\n\n")
        .map((stanza) =>
          Object.fromEntries(
            [...stanza.matchAll(/^(\S+): (.*)$/gm)].map((m) => [m[1], m[2]]),
          ),
        ),
    );
  }
  for (const pkg of preparation.packages) {
    const matches = indexes
      .get(pkg.index)
      .filter(
        (r: any) => r.Package === pkg.package && r.Version === pkg.version,
      );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].SHA256, pkg.sha256);
    assert.equal(Number(matches[0].Size), pkg.bytes);
    assert.equal(
      pkg.url,
      "https://archive.ubuntu.com/ubuntu/" + matches[0].Filename,
    );
  }
  const sums = await readFile(
    resolve(raw, "provenance-boundaries/SHA256SUMS"),
    "utf8",
  );
  assert(
    sums.split("\n").some((line) => {
      const f = line.trim().split(/\s+/);
      return (
        f[0] === preparation.image.sha256 &&
        f.at(-1)?.replace(/^\*/, "") ===
          "ubuntu-24.04-server-cloudimg-amd64.img"
      );
    }),
  );
  for (const [name, fingerprint] of [
    ["noble", "F6ECB3762474EDA9D21B7022871920D1991BC93C"],
    ["noble-updates", "F6ECB3762474EDA9D21B7022871920D1991BC93C"],
    ["image", "D2EB44626FDDC30B513D5BB71A5D6C4C7DB87C81"],
  ]) {
    const command = await data(
      `provenance-boundaries/gpg-${name}-execution.json`,
    );
    assert.equal(command.exitCode, 0);
    assert.equal(command.spawnError, null);
    assert.equal(command.supervision.timedOut, false);
    assert(
      (
        await readFile(
          resolve(raw, `provenance-boundaries/gpg-${name}-stdout.log`),
          "utf8",
        )
      ).includes(`[GNUPG:] VALIDSIG ${fingerprint} `),
    );
  }
  const boundaries = await data("provenance-boundaries/linux-boundaries.json");
  assert.equal(boundaries.cases.length, 6);
  assert(boundaries.cases.every((item: any) => item.status === "PASS"));
  assert.equal(boundaries.sourceSha256, source.files[5].sha256);
  assert.equal(boundaries.collectorSha256, source.files[0].sha256);
  const pilot = await data("lifecycle-pilot/raw/lifecycle.json");
  assert.equal(pilot.status, "ERROR");
  assert.equal(pilot.process.failure, "timeout");
  assert.deepEqual(pilot.cleanup, {
    processAbsent: true,
    directoryAbsent: true,
    error: null,
  });
  assert(!existsSync(resolve(raw, "lifecycle-pilot/result.json")));
  assert.equal((await data("lifecycle-pilot/manifest.json")).status, "ERROR");
  assert(
    (
      await readFile(resolve(raw, "lifecycle-pilot/raw/serial.log"), "utf8")
    ).includes("cloud-init["),
  );
  const cleanup = await data("independent-cleanup/cleanup-observation.json");
  assert.equal(cleanup.results.length, 2);
  for (const [i, name] of ["lifecycle-pilot", "lifecycle-final"].entries()) {
    assert.equal(
      cleanup.results[i].reportSha256,
      sha256(await readFile(resolve(raw, name, "raw/lifecycle.json"))),
    );
    assert.equal(cleanup.results[i].processAbsent, true);
    assert.equal(cleanup.results[i].directoryAbsent, true);
  }
  assert.equal(cleanup.completionEligible, false);
  const failure = await data("focused-initial/vitest-report.json");
  assert.equal(failure.numFailedTests, 1);
  assert(!existsSync(resolve(raw, "focused-initial/result.json")));
  assert.equal((await data("checks/build/manifest.json")).status, "NOT_READY");
  assert(!existsSync(resolve(raw, "checks/build/result.json")));
  assert.equal((await data("inspection/build-observation.json")).exitCode, 2);
  const tamper = await data("inspection/tamper-observation.json"),
    modified = await readFile(resolve(raw, "tamper-audit/mutated-serial.log"));
  assert.equal(tamper.exitCode, 1);
  assert.equal(tamper.passReceiptExists, false);
  assert.deepEqual(
    modified,
    Buffer.concat([Buffer.from(serial), Buffer.from("!")]),
  );
  assert.equal(sha256(modified), tamper.afterSha256);
  assert.throws(() =>
    auditVmLifecycle(lifecycle, expected, modified.toString(), qmp),
  );
  assert.equal((await data("tamper-audit/manifest.json")).status, "ERROR");
  assert(!existsSync(resolve(raw, "tamper-audit/result.json")));
  const windows = await data("inspection/windows-observation.json");
  assert.equal(windows.hostQualification, "NOT_READY");
  assert.equal(windows.nativeWindowsWorkflowQualified, false);
  assert.equal(windows.windowsServer2022ReferenceQualified, false);
  const entry = await data("entry-closeout/closeout-report.json");
  assert.equal(entry.evidenceFiles, 174);
  assert.equal(entry.supportingReceipts, 15);
  assert.equal(entry.remoteDiscoveryIncident.lxdInstalled, true);
  assert.equal(entry.completion.eligible, false);
  const report = {
    schemaVersion: "orch-auth-01-c2-closeout.v1",
    status: "PASS",
    sourceMode: "frozen-index",
    testedHead: baseline,
    testedTree: source.candidateTree,
    evidenceFiles: inventory.fileCount,
    supportingReceipts: expectedReceipts.length,
    focusedTests: 35,
    repositoryToolingTests: 91,
    linuxFilesystemBoundaryCases: 6,
    verifiedInputPackages: 29,
    guestKernel: lifecycle.guest.kernel,
    guestDurationMs: lifecycle.process.durationMs,
    pilot: "ERROR: collector framing timeout; cleanup observed",
    actualTamperRejected: true,
    rootBuild: "NOT_READY",
    generalDockerControllerHostQualified: false,
    nativeWindowsQualified: false,
    windowsServer2022ReferenceQualified: false,
    authorityActivation: false,
    humanAcceptance: false,
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
        id: "curated-vm-lifecycle-evidence",
        summary:
          "Reconstructed tested source, validated actual retained VM/provenance/boundary evidence and sixteen supporting receipts, rejected mutated bytes, and preserved sealed authority plus incomplete host/Windows/readiness gates.",
      },
    ],
    [{ path: "closeout-report.json", kind: "vm-lifecycle-closeout-report" }],
  );
  await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(JSON.stringify(report) + "\n");
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
