import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  lstat,
} from "node:fs/promises";
import { resolve, relative } from "node:path";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { dockerHostSha256 as sha256 } from "../../../tools/qualification-docker-host.mjs";

const [outputArg] = process.argv.slice(2);
assert(outputArg && process.argv.length === 3);
const repo = resolve(import.meta.dirname, "../../.."),
  output = resolve(outputArg),
  raw = resolve(output, "raw");
const work = resolve(repo, "artifacts/wp6e-continuation-20260906");
const linux = "\\\\wsl.localhost\\Ubuntu\\home\\duncan\\oc3-b13lp2vx";
const host = "observation-b5ae0551-b3eb-4a88-83c8-e5254332259c";
await mkdir(output);
await mkdir(raw);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const git = (args: string[]) =>
  execFileSync("git", args, {
    cwd: repo,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
const copy = async (source: string, target: string) => {
  const info = await lstat(source);
  assert(!info.isSymbolicLink());
  if (info.isDirectory())
    await inventoryContainerArtifacts(source, {
      maximumFiles: 10000,
      maximumBytes: 256 * 1024 * 1024,
    });
  await cp(source, resolve(raw, target), {
    recursive: info.isDirectory(),
    errorOnExist: true,
    force: false,
  });
};
const receiptPaths = [
  "entry-closeout",
  "fresh-c2-input-audit",
  "focused-5",
  "owner-5",
  "typecheck-3",
  "lint-3",
  "format-3",
  "invariants-3",
  "resource-audit-3",
  "oci-audit-1",
  "host-audit-2",
  "input-audit-2",
  "cleanup-audit-1",
  "negative-audit-1",
];
for (const name of receiptPaths) {
  if (name === "entry-closeout") {
    for (const file of ["manifest.json", "result.json", "closeout-report.json"])
      await copy(resolve(work, name, file), name + "/" + file);
  } else await copy(resolve(work, name), name);
}
for (const name of [
  "build-1",
  "guest-15",
  "owner-1",
  "owner-2",
  "resource-audit-2",
])
  await copy(resolve(work, name), name);
for (const file of ["manifest.json", "input-audit.json"])
  await copy(resolve(work, "input-audit-1", file), "input-audit-1/" + file);
for (const name of await readdir(work)) {
  const path = resolve(work, name),
    info = await lstat(path);
  if (info.isFile() && !["source.bundle"].includes(name))
    await copy(path, "outer/" + name);
}
await copy(resolve(linux, host), "host");
for (const name of await readdir(linux)) {
  if (name.startsWith("observation-") && name !== host)
    await copy(resolve(linux, name), "failed-hosts/" + name);
  if (name.startsWith("freeze-"))
    await copy(resolve(linux, name), "freezes/" + name);
  if (
    name.startsWith("diagnostic14-") &&
    !name.endsWith(".raw") &&
    !name.endsWith(".ext4")
  )
    await copy(resolve(linux, name), "diagnostic14/" + name);
  if (name === "diagnostic-74b99f32-9dd7-442f-a6e6-127edff21efd.json")
    await copy(resolve(linux, name), "diagnostic14/" + name);
}
await copy(
  resolve(linux, "resource-9e362d20-4e3a-40f7-a67e-0edd31d4c4b0"),
  "resource-probes",
);
for (const name of (await readdir(linux)).filter((name) =>
  name.startsWith("cache-preparation-"),
)) {
  for (const file of await readdir(resolve(linux, name))) {
    const path = resolve(linux, name, file),
      info = await lstat(path);
    if (info.isFile() && info.size < 4 * 1024 * 1024)
      await copy(path, "cache-preparation/" + name + "/" + file);
  }
}
const receipts = [];
for (const name of receiptPaths) {
  const receipt = await json(resolve(raw, name, "result.json"));
  receipts.push({
    path: name,
    stage: receipt.stageId,
    command: receipt.commandId,
  });
}
for (const id of [
  "protected-integrity",
  "test-ownership",
  "orchestrator-schema-integrity",
  "orchestrator-policy-integrity",
  "fail-closed-evidence",
])
  receipts.push({
    path: "invariants-3/entries/" + id,
    stage: "invariant-suite",
    command: id,
  });
await writeFile(
  resolve(raw, "supporting-receipts.json"),
  JSON.stringify(receipts, null, 2) + "\n",
);
await mkdir(resolve(raw, "source"));
const head = git(["rev-parse", "HEAD"]).toString().trim(),
  tree = git(["write-tree"]).toString().trim();
assert.equal(head, "29dafb5668b125919a01779b1c8f168ad18332c1");
const paths = git(["diff", "--cached", "--name-only", head])
  .toString()
  .trim()
  .split("\n");
const executable = paths.filter(
  (path) =>
    path.startsWith("docs/runtime-qualification/ORCH-AUTH-01-C3/") &&
    /\.(?:ts|py|mjs)$/.test(path),
);
executable.push(
  "tools/qualification-docker-host.mjs",
  "tools/qualification-docker-host.test.mjs",
  "tools/milestone-orchestrator/config/test-ownership.json",
);
const files = [];
for (const path of executable.sort()) {
  const bytes = await readFile(resolve(repo, path));
  assert(bytes.equals(git(["show", ":" + path])));
  files.push({
    path,
    bytes: bytes.length,
    sha256: sha256(bytes),
    gitBlob: git(["rev-parse", ":" + path])
      .toString()
      .trim(),
  });
}
const trees = new Set<string>([tree]);
for (const item of receipts) {
  const manifest = await json(resolve(raw, item.path, "manifest.json"));
  const candidate = manifest.candidate;
  if (
    candidate?.gitCommit === head &&
    /^[a-f0-9]{40}$/.test(candidate?.gitTree ?? "")
  )
    trees.add(candidate.gitTree);
}
const owner = await json(resolve(raw, "owner-5/test-partition-report.json"));
trees.add(owner.candidate.gitTree);
for (const captured of trees)
  await writeFile(
    resolve(raw, "source", captured + ".patch"),
    git(["diff", "--binary", head, captured]),
  );
await writeFile(
  resolve(raw, "source/source.json"),
  JSON.stringify(
    {
      head,
      tree,
      files,
      trees: [...trees].sort(),
      scope: "supporting-staged-source-not-clean-candidate",
    },
    null,
    2,
  ) + "\n",
);
const inventory = await inventoryContainerArtifacts(raw, {
  maximumFiles: 10000,
  maximumBytes: 256 * 1024 * 1024,
});
const inventoryBytes = Buffer.from(JSON.stringify(inventory, null, 2) + "\n");
await writeFile(resolve(output, "raw-inventory.json"), inventoryBytes);
const evidence = resolve(import.meta.dirname, "evidence");
await mkdir(evidence);
const archive = resolve(evidence, "supporting-evidence.tar.gz");
const wslPath = (path: string) =>
  "/mnt/" + path[0].toLowerCase() + path.slice(2).replaceAll("\\", "/");
const program =
  "import gzip,pathlib,tarfile,sys; root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); assert not target.exists(); stream=target.open('xb'); compressed=gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0); archive=tarfile.open(fileobj=compressed,mode='w'); paths=sorted(root.rglob('*')); [(lambda info,path: (setattr(info,'uid',0),setattr(info,'gid',0),setattr(info,'uname',''),setattr(info,'gname',''),setattr(info,'mtime',0),archive.addfile(info,path.open('rb') if path.is_file() else None)))(archive.gettarinfo(str(path),arcname=path.relative_to(root).as_posix()),path) for path in paths]; archive.close(); compressed.close(); stream.close()";
execFileSync(
  "wsl.exe",
  [
    "-d",
    "Ubuntu",
    "--exec",
    "/usr/bin/python3.12",
    "-c",
    program,
    wslPath(output),
    wslPath(archive),
  ],
  { cwd: repo, windowsHide: true, timeout: 180000 },
);
const bytes = await readFile(archive);
await writeFile(
  resolve(evidence, "manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "orch-auth-01-c3-evidence.v1",
      archive: {
        file: "supporting-evidence.tar.gz",
        bytes: bytes.length,
        sha256: sha256(bytes),
      },
      inventorySha256: sha256(inventoryBytes),
      rawFiles: inventory.fileCount,
      rawBytes: inventory.totalBytes,
      supportingReceipts: receipts.length,
      source: { head, tree },
      hostRunId: "b5ae0551-b3eb-4a88-83c8-e5254332259c",
      completionEligible: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    status: "SEALED_REQUIRES_INDEPENDENT_AUDIT",
    rawFiles: inventory.fileCount,
    rawBytes: inventory.totalBytes,
    archive: relative(repo, archive),
    archiveBytes: bytes.length,
  }),
);
