import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  evidenceContext,
  commandIdentity,
  runPnpm,
  assertCommandPassed,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import { dockerHostSha256 as sha256 } from "../../../tools/qualification-docker-host.mjs";
const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
assert(!existsSync(resolve(outputArg)));
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = resolve(outputArg);
const context = await evidenceContext(
  "orch-auth-01-c3",
  "disposable-host-closeout",
);
const raw = resolve(inputArg, "raw"),
  output = resolve(outputArg);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const data = (path: string) => json(resolve(raw, path));
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const manifest = await json(
    resolve(import.meta.dirname, "evidence/manifest.json"),
  );
  assert.equal(manifest.schemaVersion, "orch-auth-01-c3-evidence.v1");
  assert.equal(manifest.completionEligible, false);
  assert.equal(manifest.archive.file, "supporting-evidence.tar.gz");
  const archive = await readFile(
    resolve(import.meta.dirname, "evidence", manifest.archive.file),
  );
  assert.equal(archive.length, manifest.archive.bytes);
  assert.equal(sha256(archive), manifest.archive.sha256);
  const inventoryBytes = await readFile(
    resolve(inputArg, "raw-inventory.json"),
  );
  assert.equal(sha256(inventoryBytes), manifest.inventorySha256);
  const inventory = await inventoryContainerArtifacts(raw, {
    maximumFiles: 10000,
    maximumBytes: 256 * 1024 * 1024,
  });
  assert.deepEqual(inventory, JSON.parse(inventoryBytes.toString()));
  assert.equal(inventory.fileCount, manifest.rawFiles);
  const source = await data("source/source.json");
  assert.deepEqual(manifest.source, { head: source.head, tree: source.tree });
  assert.equal(source.head, "29dafb5668b125919a01779b1c8f168ad18332c1");
  const git = (root: string, args: string[], index?: string) =>
    execFileSync("git", ["-C", root, ...args], {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      env: index ? { ...process.env, GIT_INDEX_FILE: index } : process.env,
    })
      .toString()
      .trim();
  const temporary = await mkdtemp(resolve(output, "source-inspection-")),
    database = resolve(temporary, "repository.git"),
    index = resolve(temporary, "index");
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
  for (const tree of source.trees) {
    assert.match(tree, /^[a-f0-9]{40}$/);
    git(database, ["read-tree", source.head], index);
    if ((await readFile(resolve(raw, "source", tree + ".patch"))).length)
      git(
        database,
        [
          "apply",
          "--cached",
          "--whitespace=error",
          resolve(raw, "source", tree + ".patch"),
        ],
        index,
      );
    assert.equal(git(database, ["write-tree"], index), tree);
  }
  for (const file of source.files) {
    assert.equal(
      git(database, ["rev-parse", source.tree + ":" + file.path]),
      file.gitBlob,
    );
    const current = await readFile(resolve(context.repositoryRoot, file.path));
    assert.equal(current.length, file.bytes);
    assert.equal(sha256(current), file.sha256);
  }
  for (const path of [
    "PROJECT_GOAL.md",
    "AGENTS.md",
    "CONTRACT.md",
    "evals",
    ".github",
    "scripts",
    "package.json",
    "pnpm-lock.yaml",
    ".agent/verification-manifest.json",
    ".agent/readiness-profile-activated.json",
    "tools/milestone-orchestrator/config/default.json",
  ])
    git(database, [
      "diff",
      "--exit-code",
      source.head,
      source.tree,
      "--",
      path,
    ]);
  const roadmap = "Implementation-ready improvement plan 8-5-26.txt";
  assert.equal(git(context.repositoryRoot, ["ls-files", "--", roadmap]), "");
  if (existsSync(resolve(context.repositoryRoot, roadmap)))
    assert.equal(
      sha256(await readFile(resolve(context.repositoryRoot, roadmap))),
      "53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1",
    );
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
  const receipts = await data("supporting-receipts.json");
  assert.equal(receipts.length, 19);
  assert.equal(receipts.length, manifest.supportingReceipts);
  for (const item of receipts)
    await validateCommandReceiptDirectory({
      directory: resolve(raw, item.path),
      expectedStageId: item.stage,
      expectedCommandId: item.command,
    });
  for (const [path, count] of [
    ["focused-5/vitest-report.json", 37],
    ["owner-5/repository-tooling-vitest-report-01.json", 128],
  ] as const) {
    const tests = await data(path);
    assert.equal(tests.numTotalTests, count);
    assert.equal(tests.numPassedTests, count);
    for (const field of ["numFailedTests", "numPendingTests", "numTodoTests"])
      assert.equal(tests[field], 0);
  }
  const owner = await data("owner-5/test-partition-report.json");
  assert(source.trees.includes(owner.candidate.gitTree));
  for (const path of [
    "tools/qualification-docker-host.mjs",
    "tools/qualification-docker-host.test.mjs",
    "tools/milestone-orchestrator/config/test-ownership.json",
  ])
    assert.equal(
      git(database, ["rev-parse", owner.candidate.gitTree + ":" + path]),
      git(database, ["rev-parse", source.tree + ":" + path]),
    );
  const child = async (name: string, args: string[]) => {
    const execution = await runPnpm(["exec", "tsx", ...args], {
      cwd: context.repositoryRoot,
      timeoutMs: 180000,
    });
    await writeFile(resolve(output, name + ".stdout.log"), execution.stdout);
    await writeFile(resolve(output, name + ".stderr.log"), execution.stderr);
    assertCommandPassed(execution, name);
  };
  await child("oci", [
    "docs/runtime-qualification/ORCH-AUTH-01-C3/audit-oci.ts",
    resolve(raw, "guest-15"),
    "artifacts/oci",
    source.head,
    "4a136e2bf740d32e15ad1f719b8ec123f30ff8f3",
    resolve(output, "oci"),
  ]);
  await child("host", [
    "docs/runtime-qualification/ORCH-AUTH-01-C3/audit-host.ts",
    resolve(raw, "host"),
    resolve(raw, "guest-15"),
    resolve(output, "oci"),
    resolve(output, "host"),
  ]);
  await child("resources", [
    "docs/runtime-qualification/ORCH-AUTH-01-C3/audit-resources.ts",
    resolve(raw, "resource-probes"),
    resolve(output, "resources"),
  ]);
  const expected = await data("host/expected.json"),
    host = await data("host/host.json");
  assert.equal(expected.binding.runId, manifest.hostRunId);
  assert.equal(
    expected.guestProgramSha256,
    sha256(
      await readFile(
        resolve(
          context.repositoryRoot,
          "docs/runtime-qualification/ORCH-AUTH-01-C3/guest-job.py",
        ),
      ),
    ),
  );
  const input = await data("input-audit-2/input-audit.json");
  assert.equal(input.status, "PASS");
  assert.equal(input.packages, 82);
  assert.equal(input.files.length, 94);
  assert.deepEqual(input.binding, expected.binding);
  const rehash = await data("input-audit-2/native-rehash-stdout.log");
  assert.deepEqual(input.files, rehash.files);
  for (const file of rehash.files) assert.equal(file.actualSha256, file.sha256);
  const preparation = await data("input-audit-2/preparation.json");
  for (const suite of ["noble", "noble-updates", "noble-security"]) {
    const command = await data(
      "input-audit-2/gpg-" + suite + "-execution.json",
    );
    assert.equal(command.exitCode, 0);
    assert.equal(command.supervision.timedOut, false);
    assert.match(
      await readFile(
        resolve(raw, "input-audit-2/gpg-" + suite + "-stdout.log"),
        "utf8",
      ),
      /\[GNUPG:\] VALIDSIG F6ECB3762474EDA9D21B7022871920D1991BC93C /,
    );
  }
  for (const entry of preparation.indexes) {
    const bytes = gunzipSync(
      await readFile(resolve(raw, "input-audit-2", entry.file)),
      { maxOutputLength: 150 * 1024 * 1024 },
    );
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256(bytes), entry.sha256);
    const signed = await readFile(
      resolve(raw, "input-audit-2", entry.suite + "-InRelease"),
      "utf8",
    );
    assert(
      signed
        .split("\nSHA256:\n")[1]
        .split("\nSHA512:")[0]
        .split("\n")
        .some(
          (line) =>
            line.trim().split(/\s+/).join(" ") ===
            `${entry.sha256} ${entry.bytes} ${entry.component}/binary-amd64/Packages`,
        ),
    );
    for (const packageEntry of preparation.packages.filter(
      (p: any) => p.index === entry.file,
    )) {
      const stanzas = bytes
        .toString()
        .split("\n\n")
        .filter(
          (stanza) =>
            stanza.includes("\nVersion: " + packageEntry.version + "\n") &&
            stanza.startsWith("Package: " + packageEntry.package + "\n"),
        );
      assert.equal(stanzas.length, 1);
      assert(stanzas[0].includes("\nSHA256: " + packageEntry.sha256 + "\n"));
      assert(
        rehash.files.some(
          (f: any) =>
            f.path.endsWith("/packages/" + packageEntry.file) &&
            f.sha256 === packageEntry.sha256 &&
            f.bytes === packageEntry.bytes,
        ),
      );
    }
  }
  const cleanup = await data("cleanup-audit-1/cleanup-observation.json");
  assert.equal(cleanup.results.length, 15);
  for (const result of cleanup.results) {
    assert.equal(result.directoryAbsent, true);
    assert.equal(result.cgroupAbsent, true);
    assert.equal(
      result.processIdentityAbsent,
      result.pid === null ? null : true,
    );
  }
  assert.equal(
    cleanup.results.filter((r: any) => r.unit === host.unit).length,
    1,
  );
  const negative = await data("negative-audit-1/negative-audit.json");
  assert.equal(negative.status, "PASS");
  assert.equal(negative.candidateMutationProof, false);
  assert.deepEqual(
    negative.results.map((r: any) => r.name),
    ["qmp-policy", "cleanup", "archive-byte"],
  );
  for (const item of negative.results) {
    assert.equal(item.exitCode, 1);
    assert.equal(item.receiptPresent, false);
    assert(
      !existsSync(
        resolve(raw, "negative-audit-1", item.name, "audit/result.json"),
      ),
    );
  }
  const build = await data("build-1/manifest.json");
  assert.equal(build.status, "NOT_READY");
  assert(!existsSync(resolve(raw, "build-1/result.json")));
  const report = {
    status: "PASS",
    scope: "retained-C3-disposable-host-qualification",
    rawFiles: inventory.fileCount,
    supportingReceipts: receipts.length,
    focusedTests: 37,
    ownerTests: 128,
    ociCases: 6,
    actualFaultProbes: 6,
    hostAttempts: 15,
    successfulHostRun: host.binding.runId,
    source,
    liveBootReexecuted: false,
    liveSignaturesReexecuted: false,
    nativeWindows: false,
    server2022: false,
    candidateExecuted: false,
    authorityActivated: false,
    completionEligible: false,
  };
  await writeFile(
    resolve(output, "closeout-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "CURATED-DISPOSABLE-HOST-EVIDENCE",
        summary:
          "Reconstructed supporting source trees, validated nineteen receipts and raw provenance/fault/cleanup observations, reran independent six-case OCI and host audits, and preserved failed attempts plus incomplete candidate/Windows/readiness gates.",
      },
    ],
    [{ path: "closeout-report.json", kind: "disposable-host-closeout" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      rawFiles: inventory.fileCount,
      receipts: receipts.length,
      ociCases: 6,
      hostAttempts: 15,
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
