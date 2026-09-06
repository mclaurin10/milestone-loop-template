import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateCommandReceiptDirectory } from "./milestone-orchestrator/src/verifier.ts";
import {
  inspectReleaseArchive,
  inventoryReleaseDirectory,
  releaseHash,
  releaseRegularFile,
} from "./source-release-archive.mjs";

const receiptContract = {
  expectedStageId: "source-release-build",
  expectedCommandId: "build:production",
  requiredKinds: ["source-release-build-report"],
};
const parse = (bytes) => JSON.parse(bytes.toString("utf8"));

export async function inspectSourceReleaseOutputs({ report, workspace }) {
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.productionBuild, {
    script: "build:production",
    outputRoots: ["dist"],
  });
  assert.equal(report.runtime.nodeVersion, "v24.18.0");
  assert.equal(report.runtime.pnpmVersion, "11.15.1");
  const dist = resolve(workspace, "dist");
  const inventory = await inventoryReleaseDirectory(dist);
  assert(
    inventory.length <= 600 &&
      inventory.reduce((n, file) => n + file.bytes, 0) <= 128_000_000,
    "Source build outputs exceed retention bounds.",
  );
  const outputs = new Map(
    report.outputs.files.map((file) => [file.path, file]),
  );
  assert.equal(outputs.size, inventory.length);
  for (const file of inventory)
    assert.deepEqual(
      outputs.get("dist/" + file.path),
      { ...file, path: "dist/" + file.path },
      "Source outputs differ from the production build inventory.",
    );
  const manifest = parse(
    await releaseRegularFile(dist, "release-manifest.json"),
  );
  assert.equal(manifest.schemaVersion, "source-release-manifest.v1");
  assert.equal(manifest.claimScope, "source-release-payload");
  assert.equal(manifest.completionEligible, false);
  assert.equal(manifest.cadence, "candidate-single-build");
  assert.deepEqual(manifest.source, report.source);
  assert.deepEqual(manifest.limits, {
    maximumPayloadFiles: 400,
    maximumPayloadBytes: 20_000_000,
    maximumArchiveBytes: 20_000_000,
  });
  const archive = await releaseRegularFile(dist, "release.tar.gz");
  assert.deepEqual(manifest.archive, {
    path: "release.tar.gz",
    bytes: archive.length,
    sha256: releaseHash(archive),
  });
  const files = inspectReleaseArchive(
    archive,
    manifest.payload.files,
    manifest.limits,
  );
  assert.equal(manifest.payload.fileCount, files.length);
  assert.equal(
    manifest.payload.totalBytes,
    files.reduce((n, file) => n + file.contents.length, 0),
  );
  assert.deepEqual(
    await inventoryReleaseDirectory(resolve(dist, "payload")),
    manifest.payload.files,
  );
  const provenance = parse(
    files.find((file) => file.path === "SOURCE.json")?.contents,
  );
  assert.deepEqual(provenance, {
    schemaVersion: "source-release-provenance.v1",
    source: report.source,
    claimScope: "distribution-provenance",
    grantsAdopterAuthority: false,
  });
  const consumer = parse(await releaseRegularFile(dist, "consumer.json"));
  assert.equal(consumer.schemaVersion, "source-release-consumer.v1");
  assert.deepEqual(consumer.source, report.source);
  assert.equal(consumer.releaseArchiveSha256, manifest.archive.sha256);
  assert.equal(consumer.status, "PASS");
  assert.equal(consumer.claimScope, "bounded-external-generator-smoke");
  for (const key of [
    "completionEligible",
    "completeBuildQualification",
    "completeAdopterQualification",
    "originalCheckoutInaccessible",
  ])
    assert.equal(consumer[key], false);
  assert.equal(consumer.nodeVersion, report.runtime.nodeVersion);
  assert.equal(consumer.pnpmVersion, report.runtime.pnpmVersion);
  const evidenceDirectory = resolve(dist, "build-evidence");
  const receipt = await validateCommandReceiptDirectory({
    directory: evidenceDirectory,
    ...receiptContract,
  });
  const child = parse(
    await releaseRegularFile(evidenceDirectory, "report.json"),
  );
  assert.equal(child.schemaVersion, "source-release-build.v1");
  assert.equal(child.status, "PASS");
  assert.equal(child.completionEligible, false);
  assert.deepEqual(child.source, report.source);
  assert.deepEqual(child.archive, manifest.archive);
  assert.deepEqual(child.payload, manifest.payload);
  assert.deepEqual(child.consumer, consumer);
  assert.deepEqual(
    parse(await releaseRegularFile(evidenceDirectory, "consumer.json")),
    consumer,
  );
  assert.deepEqual(
    consumer.captures.map((capture) => capture.id),
    ["store-path", "consumer-install", "consumer-generate"],
  );
  for (const capture of consumer.captures) {
    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stdoutPath, capture.id + ".stdout.log");
    assert.equal(capture.stderrPath, capture.id + ".stderr.log");
    await releaseRegularFile(evidenceDirectory, capture.stdoutPath);
    await releaseRegularFile(evidenceDirectory, capture.stderrPath);
  }
  assert(
    consumer.captures[1].argv.includes("--frozen-lockfile") &&
      consumer.captures[1].argv.includes("--offline") &&
      consumer.captures[1].argv.includes("--package-import-method=copy"),
  );
  assert.deepEqual(consumer.captures[2].argv.slice(0, 6), [
    "pnpm",
    "exec",
    "tsx",
    "tools/milestone-orchestrator/src/adopter-package-cli.ts",
    "--definition",
    "fixtures/fresh-adopter/definition.json",
  ]);
  const generated = parse(
    await releaseRegularFile(evidenceDirectory, "consumer-generate.stdout.log"),
  );
  assert.equal(
    generated.schemaVersion,
    "milestone-loop-adopter-package-result.v1",
  );
  assert.equal(generated.status, "PASS");
  assert.equal(generated.git.clean, true);
  assert.equal(generated.git.commitCount, 2);
  assert.equal(
    generated.git.commissioningInputCommit,
    consumer.generated.commit,
  );
  assert.equal(generated.git.tree, consumer.generated.tree);
  assert.equal(generated.git.branch, consumer.generated.branch);
  assert.equal(generated.project.packageName, consumer.generated.packageName);
  assert.equal(generated.project.profile, "bootstrap");
  assert.equal(generated.generated.activeManifestPresent, false);
  assert.equal(generated.generated.readinessMarkerPresent, false);
  assert(
    generated.files.length > 0 &&
      generated.files.every(
        (file) =>
          !/^(?:evals\/authority-(?:epochs|revisions)\/|\.agent\/verification-manifest\.json|\.agent\/readiness-profile-activated\.json|artifacts\/)/.test(
            file.path,
          ),
      ),
  );
  return { manifest, consumer, receipt, inventory };
}

export async function retainSourceReleaseEvidence({
  report,
  workspace,
  artifactDirectory,
}) {
  const inspected = await inspectSourceReleaseOutputs({ report, workspace });
  const destination = resolve(artifactDirectory, "source-release");
  assert(
    !existsSync(destination),
    "A retained source release must not overwrite earlier evidence.",
  );
  const artifacts = [];
  for (const file of inspected.inventory.filter(
    (file) => !file.path.startsWith("payload/"),
  )) {
    assert(
      ["release.tar.gz", "release-manifest.json", "consumer.json"].includes(
        file.path,
      ) || file.path.startsWith("build-evidence/"),
      "Unexpected source build output.",
    );
    const bytes = await releaseRegularFile(
      resolve(workspace, "dist"),
      file.path,
    );
    assert.equal(bytes.length, file.bytes);
    assert.equal(releaseHash(bytes), file.sha256);
    const target = resolve(destination, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    if (bytes.length > 0)
      artifacts.push({
        path: "source-release/" + file.path,
        kind:
          file.path === "release.tar.gz"
            ? "source-release-archive"
            : file.path === "release-manifest.json"
              ? "source-release-manifest"
              : file.path === "consumer.json"
                ? "source-release-consumer"
                : "source-release-raw-evidence",
      });
  }
  await validateCommandReceiptDirectory({
    directory: resolve(destination, "build-evidence"),
    ...receiptContract,
  });
  assert.equal(
    releaseHash(await readFile(resolve(destination, "release.tar.gz"))),
    inspected.manifest.archive.sha256,
  );
  return artifacts;
}
