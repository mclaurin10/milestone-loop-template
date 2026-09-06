import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [outputArg] = process.argv.slice(2);
assert(outputArg && process.argv.length === 3);
const root = resolve(import.meta.dirname, "../../.."),
  output = resolve(outputArg);
await mkdir(output); // Exclusive directory; no source index or ref mutation.
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const paths = [
  "scripts/verify.mjs",
  "tools/milestone-orchestrator/config/test-ownership.json",
  "tools/milestone-orchestrator/src/adopter-package.ts",
  "tools/milestone-orchestrator/src/aggregate-verify-identity.test.ts",
  "tools/milestone-orchestrator/src/authority-publication.test.ts",
  "tools/milestone-orchestrator/src/contract-integrity.test.ts",
  "tools/milestone-orchestrator/src/source-authority-anchor.ts",
  "tools/milestone-orchestrator/src/contracts.ts",
  "tools/milestone-orchestrator/src/schema.ts",
  "tools/milestone-orchestrator/src/source-authority-anchor.test.ts",
  "tools/milestone-orchestrator/src/test-ownership.test.ts",
  "tools/milestone-orchestrator/src/verification-scope.mjs",
  "tools/milestone-orchestrator/src/verification-scope.test.ts",
  "tools/milestone-orchestrator/src/verifier.ts",
  "tools/source-release-policy.json",
];
const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
for (const key of [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
])
  delete env[key];
function git(args, extra = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    env: { ...env, ...extra },
    encoding: null,
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert(
    !result.error && result.status === 0,
    result.error?.message ?? result.stderr.toString(),
  );
  return result.stdout;
}
const sourceBase = git(["rev-parse", "HEAD"]).toString().trim();
assert.equal(sourceBase, "c708945e4ba8e0b75f09bc9e564b4afc5cb47a0a");
const sourceBaseTree = git(["rev-parse", "HEAD^{tree}"]).toString().trim();
const indexBefore = git(["diff", "--cached", "--binary"]);
const refsBefore = git(["for-each-ref", "--format=%(refname) %(objectname)"]);
const alternate = { GIT_INDEX_FILE: resolve(output, "projection.index") };
git(["read-tree", sourceBase], alternate);
git(["add", "--", ...paths], alternate);
const projectedTree = git(["write-tree"], alternate).toString().trim();
const patch = git(
  ["diff", "--cached", "--binary", sourceBase, "--", ...paths],
  alternate,
);
assert(patch.length > 0);
await writeFile(resolve(output, "source.patch"), patch);
git(["bundle", "create", resolve(output, "source.bundle"), "HEAD"]);
const inputs = {};
for (const path of ["source.patch", "source.bundle"]) {
  const bytes = await readFile(resolve(output, path));
  inputs[path] = { bytes: bytes.length, sha256: hash(bytes) };
}
const pins = [];
for (const path of paths) {
  const bytes = await readFile(resolve(root, path));
  pins.push({ path, bytes: bytes.length, sha256: hash(bytes) });
}
assert(indexBefore.equals(git(["diff", "--cached", "--binary"])));
assert(
  refsBefore.equals(git(["for-each-ref", "--format=%(refname) %(objectname)"])),
);
const projection = {
  schemaVersion: "source-scope-development-projection.v1",
  sourceBase,
  sourceBaseTree,
  projectedTree,
  paths,
  pins,
  inputs,
  completionEligible: false,
};
await writeFile(
  resolve(output, "projection.json"),
  JSON.stringify(projection, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({
    sourceBase,
    projectedTree,
    paths: paths.length,
    patchBytes: patch.length,
  }) + "\n",
);
