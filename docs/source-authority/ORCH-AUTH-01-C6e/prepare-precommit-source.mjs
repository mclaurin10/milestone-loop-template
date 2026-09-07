import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const [cloneArg, outputArg] = process.argv.slice(2);
assert(cloneArg && outputArg && process.argv.length === 4);
const repository = await realpath(resolve(import.meta.dirname, "../../.."));
const clone = await realpath(resolve(cloneArg));
const output = resolve(outputArg);
assert.equal(clone, resolve(repository, ".tools/wp6e-c6e-precommit-20260906"));
assert(
  !existsSync(output) && relative(repository, output).startsWith("artifacts"),
);
const git = (...args) => {
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", clone, ...args],
    {
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  assert(
    !result.error && result.status === 0 && result.signal === null,
    result.stderr?.toString(),
  );
  return result.stdout;
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = resolve(
  repository,
  "artifacts/wp6e-source-publication-20260906",
);
const original = JSON.parse(
  await readFile(resolve(evidence, "precommit-vm-3/input/source.json"), "utf8"),
);
const delta = JSON.parse(
  await readFile(
    resolve(evidence, "dependency-repair-linux-1/source-delta.json"),
    "utf8",
  ),
);
assert.deepEqual(delta.baseline, original.source);
assert.equal(
  original.source.commit,
  "082e4369a8e637243ff45e9e66d368452c74eced",
);
const changedPaths = [
  "tools/milestone-orchestrator/src/source-authority-audit-reports.mjs",
  "tools/milestone-orchestrator/src/source-authority-evidence.test.ts",
  "tools/milestone-orchestrator/test/synthetic-source-audit.ts",
  "tools/source-release-inspection.mjs",
];
assert.deepEqual(delta.changes.map((row) => row.path).sort(), changedPaths);
const changes = new Map(delta.changes.map((row) => [row.path, row]));
const identity = git(
  "rev-parse",
  "HEAD",
  "HEAD^{tree}",
  "--symbolic-full-name",
  "HEAD",
)
  .toString()
  .trimEnd()
  .split("\n");
assert.equal(identity.length, 3);
assert(identity[2].startsWith("refs/heads/"));
assert.notEqual(
  identity[0],
  "fc2419d8bdfc3658fe76edf2b543b38051b359f1",
  "Current implementation must first be committed in the owned verification clone.",
);
assert.equal(git("status", "--porcelain").toString(), "");
assert.equal(
  git("rev-parse", "HEAD^").toString().trim(),
  original.source.commit,
);
assert.deepEqual(
  git("diff", "--name-only", original.source.commit, "HEAD")
    .toString()
    .trimEnd()
    .split("\n")
    .sort(),
  changedPaths,
);
assert.equal(
  git("for-each-ref", "--format=%(refname)", "refs/milestone-loop/").toString(),
  "",
);
assert(
  !existsSync(
    resolve(clone, ".agent/authority-requests/ORCH-AUTH-01/request.json"),
  ),
);
assert(!existsSync(resolve(clone, "artifacts/orchestrator/state/state.json")));
const frozen = JSON.parse(
  await readFile(
    resolve(
      repository,
      "artifacts/wp6e-source-publication-20260906/recovery-publication-inputs-1/inputs.json",
    ),
    "utf8",
  ),
);
const pins = [];
for (const file of frozen.files.filter((file) =>
  /^(tools\/|scripts\/|fixtures\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|vitest\.config\.ts$|tsconfig.*\.json$|eslint\.config\.mjs$)/.test(
    file.path,
  ),
)) {
  const changed = changes.get(file.path);
  if (changed) {
    assert.deepEqual(changed.before, {
      bytes: file.bytes,
      sha256: file.sha256,
    });
    const before = git("show", original.source.commit + ":" + file.path);
    assert.equal(before.length, changed.before.bytes, file.path);
    assert.equal(hash(before), changed.before.sha256, file.path);
  }
  const expected = changed?.after ?? file;
  const content = await readFile(resolve(clone, file.path));
  assert.equal(content.length, expected.bytes, file.path);
  assert.equal(hash(content), expected.sha256, file.path);
  assert.deepEqual(content, git("show", "HEAD:" + file.path), file.path);
  assert.deepEqual(
    content,
    await readFile(resolve(repository, file.path)),
    file.path,
  );
  pins.push({ path: file.path, bytes: content.length, sha256: hash(content) });
}
assert.equal(pins.length, 331);
const focusedBefore = JSON.parse(
  await readFile(
    resolve(evidence, "dependency-repair-focused-1/input-observation.json"),
    "utf8",
  ),
);
const focusedAfter = JSON.parse(
  await readFile(
    resolve(
      evidence,
      "dependency-repair-focused-1/input-observation-after.json",
    ),
    "utf8",
  ),
);
assert.deepEqual(pins, focusedBefore.pins);
assert.deepEqual(pins, focusedAfter.pins);
assert.equal(focusedAfter.unchanged, true);
await mkdir(output);
git("bundle", "create", resolve(output, "source.bundle"), "HEAD");
const bundle = await readFile(resolve(output, "source.bundle"));
git(
  "bundle",
  "create",
  resolve(output, "precommit.bundle"),
  "HEAD",
  "^fc2419d8bdfc3658fe76edf2b543b38051b359f1",
);
const subjectBundle = await readFile(resolve(output, "precommit.bundle"));
const metadata = {
  schemaVersion: "c6e-precommit-source-input.v2",
  source: {
    commit: identity[0],
    tree: identity[1],
    branch: identity[2],
    status: "",
  },
  bundle: { path: "source.bundle", bytes: bundle.length, sha256: hash(bundle) },
  subjectBundle: {
    path: "precommit.bundle",
    bytes: subjectBundle.length,
    sha256: hash(subjectBundle),
  },
  pins,
  originalSource: original.source,
  changes: delta.changes,
  claimScope:
    "clean owned precommit verification checkout with all original frozen source pins plus the exact four-file verified dependency delta",
  completionEligible: false,
  actualImplementationAudit: false,
  sourceStateAdopted: false,
};
await writeFile(
  resolve(output, "source.json"),
  JSON.stringify(metadata, null, 2) + "\n",
  { flag: "wx" },
);
assert.deepEqual(
  git("rev-parse", "HEAD", "HEAD^{tree}", "--symbolic-full-name", "HEAD")
    .toString()
    .trimEnd()
    .split("\n"),
  identity,
);
assert.equal(git("status", "--porcelain").toString(), "");
console.log(
  JSON.stringify({
    source: metadata.source,
    bundle: metadata.bundle,
    pins: pins.length,
    verificationExecuted: false,
  }),
);
