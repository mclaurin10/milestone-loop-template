import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  hashFile,
  providerInventory,
  removeOwnedGuest,
  sha256,
  verifyPinnedFile,
} from "./qualification-vm-lifecycle.mjs";
const root = process.argv[2];
assert.match(root, /^\/home\/duncan\/oc2-[A-Za-z0-9_-]+$/);
assert.equal(process.platform, "linux");
assert.equal(process.version, "v24.18.0");
const nonce = randomUUID(),
  cases = [];
for (const name of ["ordinary", "foreign", "owner-mismatch", "linked"]) {
  const directory = `${root}/guest-boundary-${name}-${nonce}`;
  await mkdir(directory, { mode: 0o700 });
  const owner = JSON.stringify({ nonce, name }) + "\n";
  await writeFile(`${directory}/owner.json`, owner, { flag: "wx" });
  await writeFile(`${directory}/overlay.qcow2`, "owned", { flag: "wx" });
  if (name === "ordinary") {
    await removeOwnedGuest(directory, root, owner);
    await assert.rejects(access(directory), { code: "ENOENT" });
    cases.push({ name, status: "PASS", observed: "owned paths removed" });
    continue;
  }
  if (name === "foreign")
    await writeFile(`${directory}/foreign.txt`, "keep", { flag: "wx" });
  if (name === "linked")
    await symlink(`${root}/frozen-inputs.json`, `${directory}/seed.iso`);
  await assert.rejects(
    removeOwnedGuest(
      directory,
      root,
      name === "owner-mismatch" ? owner + " " : owner,
    ),
  );
  assert.equal(await readFile(`${directory}/overlay.qcow2`, "utf8"), "owned");
  assert.equal(await readFile(`${directory}/owner.json`, "utf8"), owner);
  if (name === "foreign") {
    assert.equal(await readFile(`${directory}/foreign.txt`, "utf8"), "keep");
    await unlink(`${directory}/foreign.txt`);
  }
  if (name === "linked") await unlink(`${directory}/seed.iso`);
  await removeOwnedGuest(directory, root, owner);
  cases.push({
    name,
    status: "PASS",
    observed:
      "refused without deleting owned or foreign bytes; fixture cleaned after removing deliberate boundary",
  });
}
const directory = `${root}/guest-input-boundary-${nonce}`;
await mkdir(directory, { mode: 0o700 });
const script = `${directory}/launcher`,
  scriptBytes = `#!/bin/sh\ntouch '${directory}/would-execute'\n`;
await writeFile(script, scriptBytes, { flag: "wx" });
await assert.rejects(
  verifyPinnedFile(
    {
      path: script,
      bytes: Buffer.byteLength(scriptBytes),
      sha256: sha256(scriptBytes),
    },
    true,
  ),
  /inspected ELF/,
);
await assert.rejects(access(`${directory}/would-execute`), { code: "ENOENT" });
cases.push({
  name: "installer-script",
  status: "PASS",
  observed: "actual script rejected as data; marker absent",
});
await unlink(script);
await symlink("missing-doc", `${directory}/doc-link`);
const inventory = await providerInventory(directory);
assert.equal(inventory[0].targetPresent, false);
await unlink(`${directory}/doc-link`);
await symlink("/etc/passwd", `${directory}/escape`);
await assert.rejects(providerInventory(directory), /escapes/);
await unlink(`${directory}/escape`);
await rmdir(directory);
cases.push({
  name: "provider-links",
  status: "PASS",
  observed:
    "dangling internal document link retained; external link rejected before content read",
});
process.stdout.write(
  JSON.stringify({
    schemaVersion: "orch-c2-linux-boundaries.v1",
    nativePlatform: process.platform,
    nodeVersion: process.version,
    uid: process.getuid(),
    nonce,
    cases,
    sourceSha256: await hashFile(import.meta.filename),
    collectorSha256: await hashFile(
      new URL("./qualification-vm-lifecycle.mjs", import.meta.url),
    ),
    hostQualification: "NOT_READY",
    completionEligible: false,
  }) + "\n",
);
