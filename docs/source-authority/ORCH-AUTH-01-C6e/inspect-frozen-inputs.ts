import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

type Pin = { path: string; bytes: number; sha256: string };
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Reconstructs the actual frozen worktree in a new isolated Git index/object
 * store. It never checks out files, touches the source index or includes the
 * user's excluded roadmap. The resulting tree is a reconstruction, not a claim
 * that the focused run executed a clean commit. */
export async function inspectFrozenInputs(input: {
  repository: string;
  retainedRoot: string;
  scratch: string;
  subjectDirectory?: string;
}) {
  const repository = await realpath(input.repository);
  const retainedRoot = await realpath(input.retainedRoot);
  const scratch = resolve(input.scratch);
  assert(
    !existsSync(scratch),
    "Frozen reconstruction requires a fresh scratch directory.",
  );
  assert(
    scratch !== repository &&
      !relative(repository, scratch).startsWith("..") &&
      !isAbsolute(relative(repository, scratch)),
  );
  const observationDirectory = resolve(
    retainedRoot,
    "recovery-publication-inputs-1",
  );
  const readPin = async (pin: Pin, directory = observationDirectory) => {
    assert(!isAbsolute(pin.path) && !pin.path.split(/[\\/]/).includes(".."));
    const bytes = await readFile(resolve(directory, pin.path));
    assert.equal(bytes.length, pin.bytes, pin.path);
    assert.equal(hash(bytes), pin.sha256, pin.path);
    return bytes;
  };
  const observationBytes = await readFile(
    resolve(observationDirectory, "inputs.json"),
  );
  const observation = JSON.parse(observationBytes.toString());
  assert.equal(
    observation.schemaVersion,
    "wp6e-verification-input-observation.v1",
  );
  assert.equal(observation.verificationClaim, false);
  assert.equal(observation.completionEligible, false);
  assert.deepEqual(observation.gitIdentity, [
    "fc2419d8bdfc3658fe76edf2b543b38051b359f1",
    "e8afdd61b47db88f4c6964b77c90ee8db9c1b4b1",
    "refs/heads/master",
  ]);
  assert.equal(observation.files.length, 650);
  const files: (Pin & { tracked: boolean; excludedFromCommit: boolean })[] =
    observation.files;
  assert.equal(new Set(files.map((file) => file.path)).size, files.length);
  const excluded = files.filter((file) => file.excludedFromCommit);
  assert.equal(excluded.length, 1);
  assert.equal(
    excluded[0]!.path,
    "Implementation-ready improvement plan 8-5-26.txt",
  );
  assert.equal(
    excluded[0]!.sha256,
    "53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1",
  );
  assert.equal(excluded[0]!.tracked, false);
  const patch = await readPin(observation.trackedPatch);
  const originalIndex = await readPin(observation.index);
  const representationRoot = resolve(retainedRoot, "frozen-text-checkout-1");
  const representations = JSON.parse(
    await readFile(resolve(representationRoot, "report.json"), "utf8"),
  );
  assert.equal(
    representations.schemaVersion,
    "frozen-working-text-checkout.v1",
  );
  assert.equal(representations.status, "PASS");
  assert.equal(representations.completionEligible, false);
  assert.equal(representations.inputObservationSha256, hash(observationBytes));
  assert.equal(representations.lineEndingRepresentations.length, 13);
  type TextRepresentation = {
    path: string;
    raw: Pin;
    checkout: { bytes: number; sha256: string };
    attributes: { text: string; eol: string };
  };
  const textRows = new Map<string, TextRepresentation>(
    representations.lineEndingRepresentations.map(
      (row: TextRepresentation) => [row.path, row] as const,
    ),
  );
  assert.equal(textRows.size, 13);
  const commandEnv = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
  ])
    delete commandEnv[key];
  const execute = (
    args: string[],
    options: { input?: Buffer; env?: NodeJS.ProcessEnv } = {},
  ) => {
    const result = spawnSync("git", args, {
      ...options,
      env: options.env ?? commandEnv,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 128 * 1024 * 1024,
    });
    assert(
      !result.error && result.status === 0 && result.signal === null,
      "Frozen reconstruction Git failed: " +
        args.join(" ") +
        "\n" +
        result.stderr?.toString(),
    );
    return result.stdout;
  };
  const objects = execute([
    "-C",
    repository,
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "objects",
  ])
    .toString()
    .trim();
  await mkdir(scratch);
  const database = resolve(scratch, "reconstruction.git");
  execute(["init", "--bare", database]);
  const env = {
    ...commandEnv,
    GIT_INDEX_FILE: resolve(scratch, "reconstruction.index"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (args: string[], bytes?: Buffer) =>
    execute(["--git-dir", database, ...args], {
      env,
      ...(bytes === undefined ? {} : { input: bytes }),
    });
  git(["read-tree", observation.gitIdentity[0]]);
  assert(
    git(["ls-files", "--stage", "-z"]).equals(originalIndex),
    "Captured index differs from the actual baseline tree.",
  );
  git(["apply", "--cached", "--binary", "--whitespace=error-all", "-"], patch);
  for (const file of files.filter(
    (file) => !file.tracked && !file.excludedFromCommit,
  )) {
    const content = await readPin(
      file,
      resolve(observationDirectory, "untracked"),
    );
    const blob = git(["hash-object", "-w", "--stdin"], content)
      .toString()
      .trim();
    assert(/^[a-f0-9]{40}$/.test(blob));
    git(["update-index", "--add", "--cacheinfo", "100644", blob, file.path]);
  }
  const reconstructedTree = git(["write-tree"]).toString().trim();
  const entries = git(["ls-tree", "-r", "-z", reconstructedTree])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
      assert(match, "Non-regular frozen Git entry: " + row);
      return { blob: match[2]!, path: match[3]! };
    });
  const included = files.filter((file) => !file.excludedFromCommit);
  assert.deepEqual(
    entries.map((entry) => entry.path).sort(),
    included.map((file) => file.path).sort(),
  );
  const pins = new Map(included.map((file) => [file.path, file]));
  const batch = git(
    ["cat-file", "--batch"],
    Buffer.from(entries.map((entry) => entry.blob).join("\n") + "\n"),
  );
  let offset = 0;
  let totalBytes = 0;
  let totalFrozenBytes = 0;
  for (const entry of entries) {
    const end = batch.indexOf(10, offset);
    assert(end > offset);
    const header = batch.subarray(offset, end).toString().split(" ");
    const pin = pins.get(entry.path)!;
    const representation = textRows.get(entry.path);
    const canonical = representation?.checkout ?? pin;
    assert.deepEqual(
      header,
      [entry.blob, "blob", String(canonical.bytes)],
      entry.path,
    );
    offset = end + 1;
    const content = batch.subarray(offset, offset + canonical.bytes);
    assert.equal(content.length, canonical.bytes);
    assert.equal(hash(content), canonical.sha256, entry.path);
    if (representation) {
      assert(entry.path === ".gitignore" || entry.path.startsWith("docs/"));
      assert.deepEqual(representation.attributes, { text: "auto", eol: "lf" });
      assert.deepEqual(
        git(["check-attr", "--cached", "-z", "text", "eol", "--", entry.path])
          .toString()
          .split("\0"),
        [entry.path, "text", "auto", entry.path, "eol", "lf", ""],
      );
      const raw = await readPin(representation.raw, representationRoot);
      assert.equal(raw.length, pin.bytes, entry.path);
      assert.equal(hash(raw), pin.sha256, entry.path);
      assert(Buffer.from(raw.toString()).equals(raw) && !raw.includes(0));
      assert(
        Buffer.from(raw.toString().replaceAll("\r\n", "\n")).equals(content),
        entry.path,
      );
    }
    offset += canonical.bytes;
    assert.equal(batch[offset], 10);
    offset++;
    totalBytes += content.length;
    totalFrozenBytes += pin.bytes;
  }
  assert.equal(offset, batch.length);
  const subjectRoot =
    input.subjectDirectory === undefined
      ? resolve(retainedRoot, "precommit/subject")
      : await realpath(input.subjectDirectory);
  const subject = JSON.parse(
    await readFile(resolve(subjectRoot, "source.json"), "utf8"),
  );
  await readPin(subject.subjectBundle, subjectRoot);
  assert.equal(subject.source.tree, reconstructedTree);
  git([
    "fetch",
    "--no-tags",
    resolve(subjectRoot, subject.subjectBundle.path),
    "HEAD",
  ]);
  assert.equal(
    git(["rev-parse", "FETCH_HEAD"]).toString().trim(),
    subject.source.commit,
  );
  assert.equal(
    git(["rev-parse", "FETCH_HEAD^{tree}"]).toString().trim(),
    reconstructedTree,
  );
  assert.equal(
    git(["rev-parse", "FETCH_HEAD^"]).toString().trim(),
    observation.gitIdentity[0],
  );
  return {
    inputObservationSha256: hash(observationBytes),
    observedFiles: files.length,
    reconstructedFiles: included.length,
    excludedRoadmap: excluded[0],
    totalReconstructedBytes: totalBytes,
    totalFrozenWorkingBytes: totalFrozenBytes,
    explicitTextRepresentations: [...textRows.keys()],
    reconstructedTree,
    isolatedPrecommitInputCommit: subject.source.commit,
    executionIdentity:
      "dirty working tree at the recorded parent; reconstructed tree is not a clean execution claim",
  };
}
