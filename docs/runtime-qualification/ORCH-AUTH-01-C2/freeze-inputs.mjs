// Trusted setup observer. Nothing discovered is invoked except the previously
// inspected gpgv with the two existing, pinned Ubuntu public keyrings.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
  hashFile,
  providerInventory,
  sha256,
  verifyPinnedFile,
} from "./qualification-vm-lifecycle.mjs";
const root = process.argv[2];
assert.match(root, /^\/home\/duncan\/oc2-[A-Za-z0-9_-]+$/);
assert.equal(process.platform, "linux");
assert.equal(process.version, "v24.18.0");
const preparation = JSON.parse(
  await readFile(`${root}/preparation/preparation.json`, "utf8"),
);
assert.equal(preparation.root, root);
assert.equal(preparation.hostInstallation, false);
const keys = [
  [
    "ubuntu-archive-keyring.gpg",
    "80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31",
  ],
  [
    "ubuntu-cloudimage-keyring.gpg",
    "c2d40d925557dbe9a0745c12ca0dc98bed593ce9a6652f1b2faa1ff0858dbf2f",
  ],
];
for (const [name, hash] of keys)
  assert.equal(await hashFile(`${root}/preparation/${name}`), hash);
const signatures = [];
for (const [name, files, key] of [
  ["noble", ["noble-InRelease"], keys[0][0]],
  ["noble-updates", ["noble-updates-InRelease"], keys[0][0]],
  ["image", ["SHA256SUMS.gpg", "SHA256SUMS"], keys[1][0]],
]) {
  const argv = [
    "--status-fd",
    "1",
    "--keyring",
    `${root}/preparation/${key}`,
    ...files.map((f) => `${root}/preparation/${f}`),
  ];
  const stdout = execFileSync("/usr/bin/gpgv", argv, {
    encoding: "utf8",
    timeout: 30000,
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
  });
  assert.match(stdout, /\[GNUPG:\] VALIDSIG /);
  signatures.push({ name, argv, stdout });
}
const indexes = new Map();
for (const entry of preparation.indexes) {
  const bytes = gunzipSync(
    await readFile(`${root}/preparation/${entry.file}`),
    { maxOutputLength: 150 * 1024 * 1024 },
  );
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha256(bytes), entry.sha256);
  const release = await readFile(
    `${root}/preparation/${entry.suite}-InRelease`,
    "utf8",
  );
  const expected = ` ${entry.sha256} `;
  assert(
    release
      .split("\nSHA256:\n")[1]
      .split("\nSHA512:")[0]
      .split("\n")
      .some(
        (line) =>
          line.startsWith(expected) &&
          line.trim().split(/\s+/)[1] === String(entry.bytes) &&
          line.endsWith(` ${entry.component}/binary-amd64/Packages`),
      ),
  );
  indexes.set(
    entry.file,
    bytes
      .toString("utf8")
      .split("\n\n")
      .map((stanza) =>
        Object.fromEntries(
          [...stanza.matchAll(/^(\S+): (.*)$/gm)].map((m) => [m[1], m[2]]),
        ),
      ),
  );
}
for (const p of preparation.packages) {
  const records = indexes
    .get(p.index)
    .filter((r) => r.Package === p.package && r.Version === p.version);
  assert.equal(records.length, 1);
  assert.equal(records[0].SHA256, p.sha256);
  assert.equal(Number(records[0].Size), p.bytes);
  assert.equal(
    p.url,
    `https://archive.ubuntu.com/ubuntu/${records[0].Filename}`,
  );
  await verifyPinnedFile(p);
}
const imageLines = (
  await readFile(`${root}/preparation/SHA256SUMS`, "utf8")
).split("\n");
assert(
  imageLines.some(
    (line) =>
      line.split(/\s+/)[0] === preparation.image.sha256 &&
      line.trim().split(/\s+/).at(-1).replace(/^\*/, "") ===
        "ubuntu-24.04-server-cloudimg-amd64.img",
  ),
);
await verifyPinnedFile(preparation.image);
for (const launcher of preparation.launchers)
  await verifyPinnedFile(launcher, true);
const provider = await providerInventory(`${root}/provider`);
await writeFile(
  `${root}/provider-inventory.json`,
  JSON.stringify(provider) + "\n",
  { flag: "wx" },
);
const firmware = [];
for (const path of [`${root}/provider/usr/share/seabios/bios-256k.bin`]) {
  const bytes = await readFile(path);
  firmware.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
}
const result = {
  root,
  inputs: {
    image: preparation.image,
    launchers: preparation.launchers,
    firmware,
  },
  providerInventorySha256: sha256(JSON.stringify(provider) + "\n"),
  preparationSha256: await hashFile(`${root}/preparation/preparation.json`),
  packageStatusSha256: await hashFile("/var/lib/dpkg/status"),
  signatures,
};
assert.equal(result.packageStatusSha256, preparation.hostPackagesBefore);
await writeFile(
  `${root}/frozen-inputs.json`,
  JSON.stringify(result, null, 2) + "\n",
  { flag: "wx" },
);
process.stdout.write(JSON.stringify(result) + "\n");
