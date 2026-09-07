import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { DEPENDENCY_REPAIR_PATHS } from "./inspect-dependency-repair.js";

type Pin = { path: string; bytes: number; sha256: string };
export const UNBORN_REPAIR_PATHS = [
  "tools/milestone-orchestrator/src/authority-publication.mjs",
  "tools/milestone-orchestrator/src/private-ref-store.ts",
  "tools/milestone-orchestrator/src/state-generation-store.test.ts",
  "tools/milestone-orchestrator/src/verification-scope.test.ts",
];
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Imports retained real bundles only into a fresh owned bare object store. */
export async function inspectRevisedInput(input: {
  repository: string;
  originalDirectory: string;
  revisedDirectory: string;
  scratch: string;
  originalCommit: string;
  originalTree: string;
  expectedPins: Pin[];
  expectedChanges: unknown;
  transition?: "dependency" | "unborn";
}) {
  const unborn = input.transition === "unborn";
  const repository = await realpath(input.repository);
  const scratch = resolve(input.scratch);
  const rel = relative(repository, scratch);
  assert(
    rel && !isAbsolute(rel) && !rel.startsWith("..") && !existsSync(scratch),
  );
  const env = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
  ])
    delete env[key];
  const execute = (args: string[], bytes?: Buffer) => {
    const result = spawnSync("git", args, {
      env,
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 128 * 1024 * 1024,
      ...(bytes === undefined ? {} : { input: bytes }),
    });
    assert(
      !result.error && result.status === 0 && result.signal === null,
      result.stderr?.toString(),
    );
    return result.stdout;
  };
  env["GIT_ALTERNATE_OBJECT_DIRECTORIES"] = execute([
    "--no-optional-locks",
    "-C",
    repository,
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "objects",
  ])
    .toString()
    .trim();
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  await mkdir(scratch);
  const database = resolve(scratch, "revised.git");
  execute(["init", "--bare", database]);
  // Keep this owned reconstruction inspectable by a later read-only Git batch.
  // No source ref, index, object or configuration is modified.
  await writeFile(
    resolve(database, "objects/info/alternates"),
    env["GIT_ALTERNATE_OBJECT_DIRECTORIES"] + "\n",
    { flag: "wx" },
  );
  const git = (args: string[], bytes?: Buffer) =>
    execute(["--git-dir", database, ...args], bytes);
  const read = async (directory: string) =>
    JSON.parse(await readFile(resolve(directory, "source.json"), "utf8"));
  const original = await read(input.originalDirectory);
  const revised = await read(input.revisedDirectory);
  assert.equal(
    original.schemaVersion,
    unborn ? "c6e-precommit-source-input.v2" : "c6e-precommit-source-input.v1",
  );
  assert.equal(
    revised.schemaVersion,
    unborn ? "c6e-precommit-source-input.v3" : "c6e-precommit-source-input.v2",
  );
  assert.equal(original.source.commit, input.originalCommit);
  assert.equal(original.source.tree, input.originalTree);
  assert.deepEqual(revised.originalSource, original.source);
  assert.deepEqual(revised.changes, input.expectedChanges);
  assert.deepEqual(revised.pins, input.expectedPins);
  assert.equal(original.pins.length, 331);
  assert.equal(revised.pins.length, 331);
  const changes = [];
  for (let i = 0; i < original.pins.length; i++) {
    const before = original.pins[i] as Pin;
    const after = revised.pins[i] as Pin;
    assert.equal(before.path, after.path);
    if (before.sha256 !== after.sha256)
      changes.push({
        path: before.path,
        before: { bytes: before.bytes, sha256: before.sha256 },
        after: { bytes: after.bytes, sha256: after.sha256 },
      });
    else assert.equal(before.bytes, after.bytes);
  }
  const byPath = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path);
  assert.deepEqual([...revised.changes].sort(byPath), changes.sort(byPath));
  for (const [directory, metadata] of [
    [input.originalDirectory, original],
    [input.revisedDirectory, revised],
  ] as const) {
    const pin = metadata.subjectBundle;
    assert.equal(pin.path, "precommit.bundle");
    const bundle = await readFile(resolve(directory, pin.path));
    assert.equal(bundle.length, pin.bytes);
    assert.equal(hash(bundle), pin.sha256);
    git(["fetch", "--no-tags", resolve(directory, pin.path), "HEAD"]);
    assert.equal(
      git(["rev-parse", "FETCH_HEAD"]).toString().trim(),
      metadata.source.commit,
    );
    assert.equal(
      git(["rev-parse", "FETCH_HEAD^{tree}"]).toString().trim(),
      metadata.source.tree,
    );
    assert.equal(metadata.source.status, "");
  }
  assert.equal(
    git(["rev-parse", revised.source.commit + "^"])
      .toString()
      .trim(),
    original.source.commit,
  );
  assert.equal(
    git(["rev-parse", original.source.commit + "^"])
      .toString()
      .trim(),
    unborn
      ? "082e4369a8e637243ff45e9e66d368452c74eced"
      : "fc2419d8bdfc3658fe76edf2b543b38051b359f1",
  );
  assert.deepEqual(
    git([
      "diff",
      "--name-status",
      original.source.commit,
      revised.source.commit,
    ])
      .toString()
      .trimEnd()
      .split("\n")
      .sort(),
    (unborn ? UNBORN_REPAIR_PATHS : DEPENDENCY_REPAIR_PATHS).map(
      (path) => "M\t" + path,
    ),
  );
  for (const phase of ["original", "revised"] as const) {
    const metadata = phase === "original" ? original : revised;
    const batch = git(
      ["cat-file", "--batch"],
      Buffer.from(
        metadata.pins
          .map((pin: Pin) => metadata.source.commit + ":" + pin.path)
          .join("\n") + "\n",
      ),
    );
    let offset = 0;
    for (const pin of metadata.pins as Pin[]) {
      const end = batch.indexOf(10, offset);
      assert(end > offset);
      const header = batch.subarray(offset, end).toString().split(" ");
      assert.match(header[0]!, /^[a-f0-9]{40}$/);
      assert.deepEqual(header.slice(1), ["blob", String(pin.bytes)]);
      offset = end + 1;
      const bytes = batch.subarray(offset, offset + pin.bytes);
      assert.equal(hash(bytes), pin.sha256, pin.path);
      offset += pin.bytes;
      assert.equal(batch[offset], 10);
      offset++;
    }
    assert.equal(offset, batch.length);
  }
  return {
    originalSource: original.source,
    source: revised.source,
    changes: revised.changes,
    verifiedPins: revised.pins.length,
    subjectBundle: revised.subjectBundle,
    actualVerificationExecution: false,
    completionEligible: false,
  };
}
