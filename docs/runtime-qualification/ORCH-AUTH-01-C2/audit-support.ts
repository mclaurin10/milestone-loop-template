import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  evidenceContext,
  commandIdentity,
  writeJson,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { sha256 } from "../../../tools/qualification-vm-lifecycle.mjs";
import { superviseCommand } from "../../../tools/milestone-orchestrator/src/process-supervisor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
assert.equal(
  process.argv.length,
  4,
  "Expected prepared Linux root and fresh output.",
);
const [root, output] = process.argv.slice(2) as [string, string];
assert.match(root, /^\/home\/duncan\/oc2-[A-Za-z0-9_-]+$/);
assert(!existsSync(resolve(output)));
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve(output);
const context = await evidenceContext(
  "orch-auth-01-c2",
  "provenance-and-linux-boundaries",
);
const native = (path: string) =>
  `\\\\wsl.localhost\\Ubuntu${path.replaceAll("/", "\\")}`;
const nativeNode = "/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node";
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const preparation = JSON.parse(
    await readFile(native(`${root}/preparation/preparation.json`), "utf8"),
  );
  const frozen = JSON.parse(
    await readFile(native(`${root}/frozen-inputs.json`), "utf8"),
  );
  assert.equal(
    sha256(await readFile(native(`${root}/preparation/preparation.json`))),
    frozen.preparationSha256,
  );
  const artifacts = [
    { path: "support-audit.json", kind: "vm-provenance-boundary-audit" },
    { path: "linux-boundaries.json", kind: "linux-filesystem-boundaries" },
  ];
  const retain = async (name: string, bytes: Buffer | string, kind: string) => {
    await writeFile(resolve(context.artifactDirectory, name), bytes);
    artifacts.push({ path: name, kind });
  };
  await retain(
    "preparation.json",
    JSON.stringify(preparation, null, 2) + "\n",
    "vm-preparation",
  );
  await retain(
    "frozen-inputs.json",
    JSON.stringify(frozen, null, 2) + "\n",
    "vm-frozen-inputs",
  );
  await retain(
    "provider-inventory.json",
    await readFile(native(`${root}/provider-inventory.json`)),
    "vm-provider-inventory",
  );
  const signatures = [];
  const command = async (name: string, args: string[]) => {
    const result = await superviseCommand({
      executable: "wsl.exe",
      args: ["-d", "Ubuntu", "--exec", ...args],
      cwd: context.repositoryRoot,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      ),
      timeoutMs: 60000,
      killGraceMs: 5000,
      outputLimitBytes: 4194304,
    });
    const record = {
      args,
      exitCode: result.exitCode,
      spawnError: result.spawnError?.message ?? null,
      supervision: result.supervision,
    };
    await retain(
      name + "-execution.json",
      JSON.stringify(record, null, 2) + "\n",
      "vm-support-execution",
    );
    await retain(name + "-stdout.log", result.stdout, "vm-support-stdout");
    if (result.stderr.length)
      await retain(name + "-stderr.log", result.stderr, "vm-support-stderr");
    assert.equal(result.exitCode, 0, result.stderr.toString());
    assert.equal(result.spawnError, null);
    assert.equal(result.supervision.timedOut, false);
    assert.equal(result.supervision.outputLimitExceeded, false);
    return result.stdout;
  };
  for (const [name, key, hash, files, fingerprint] of [
    [
      "noble",
      "ubuntu-archive-keyring.gpg",
      "80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31",
      ["noble-InRelease"],
      "F6ECB3762474EDA9D21B7022871920D1991BC93C",
    ],
    [
      "noble-updates",
      "ubuntu-archive-keyring.gpg",
      "80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31",
      ["noble-updates-InRelease"],
      "F6ECB3762474EDA9D21B7022871920D1991BC93C",
    ],
    [
      "image",
      "ubuntu-cloudimage-keyring.gpg",
      "c2d40d925557dbe9a0745c12ca0dc98bed593ce9a6652f1b2faa1ff0858dbf2f",
      ["SHA256SUMS.gpg", "SHA256SUMS"],
      "D2EB44626FDDC30B513D5BB71A5D6C4C7DB87C81",
    ],
  ] as const) {
    const keyBytes = await readFile(native(`${root}/preparation/${key}`));
    assert.equal(sha256(keyBytes), hash);
    if (!existsSync(resolve(context.artifactDirectory, key)))
      await retain(key, keyBytes, "ubuntu-public-keyring");
    for (const file of files)
      await retain(
        file,
        await readFile(native(`${root}/preparation/${file}`)),
        "signed-ubuntu-metadata",
      );
    const stdout = await command("gpg-" + name, [
      "/usr/bin/gpgv",
      "--status-fd",
      "1",
      "--keyring",
      `${root}/preparation/${key}`,
      ...files.map((file) => `${root}/preparation/${file}`),
    ]);
    assert(stdout.toString().includes(`[GNUPG:] VALIDSIG ${fingerprint} `));
    signatures.push({ name, fingerprint });
  }
  const indexes = new Map();
  for (const entry of preparation.indexes) {
    const compressed = await readFile(
      native(`${root}/preparation/${entry.file}`),
    );
    await retain(entry.file, compressed, "ubuntu-package-index");
    const bytes = gunzipSync(compressed, {
      maxOutputLength: 150 * 1024 * 1024,
    });
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256(bytes), entry.sha256);
    const release = await readFile(
      resolve(context.artifactDirectory, `${entry.suite}-InRelease`),
      "utf8",
    );
    assert(
      release
        .split("\nSHA256:\n")[1]!
        .split("\nSHA512:")[0]!
        .split("\n")
        .some((line) => {
          const fields = line.trim().split(/\s+/);
          return (
            fields[0] === entry.sha256 &&
            fields[1] === String(entry.bytes) &&
            fields[2] === `${entry.component}/binary-amd64/Packages`
          );
        }),
    );
    indexes.set(
      entry.file,
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
    const match = indexes
      .get(pkg.index)
      .filter(
        (r: any) => r.Package === pkg.package && r.Version === pkg.version,
      );
    assert.equal(match.length, 1);
    assert.equal(match[0].SHA256, pkg.sha256);
    assert.equal(Number(match[0].Size), pkg.bytes);
    const bytes = await readFile(native(pkg.path));
    assert.equal(bytes.length, pkg.bytes);
    assert.equal(sha256(bytes), pkg.sha256);
  }
  // Actual large inputs are rehashed, but not copied into the repository archive.
  const image = await readFile(native(preparation.image.path));
  assert.equal(image.length, preparation.image.bytes);
  assert.equal(sha256(image), preparation.image.sha256);
  const sums = (
    await readFile(resolve(context.artifactDirectory, "SHA256SUMS"), "utf8")
  ).split("\n");
  assert(
    sums.some(
      (line) =>
        line.trim().split(/\s+/)[0] === preparation.image.sha256 &&
        line.trim().split(/\s+/).at(-1)?.replace(/^\*/, "") ===
          "ubuntu-24.04-server-cloudimg-amd64.img",
    ),
  );
  for (const launcher of preparation.launchers) {
    const bytes = await readFile(native(launcher.path));
    assert.equal(bytes.length, launcher.bytes);
    assert.equal(sha256(bytes), launcher.sha256);
    assert.equal(bytes.subarray(0, 4).toString("hex"), "7f454c46");
  }
  const helper = await readFile(
    resolve(import.meta.dirname, "linux-boundaries.mjs"),
  );
  const collector = await readFile(
    resolve(context.repositoryRoot, "tools/qualification-vm-lifecycle.mjs"),
  );
  const work = `${root}/support-${randomUUID()}`;
  await mkdir(native(work));
  await writeFile(native(`${work}/linux-boundaries.mjs`), helper, {
    flag: "wx",
  });
  await writeFile(native(`${work}/qualification-vm-lifecycle.mjs`), collector, {
    flag: "wx",
  });
  const boundaries = JSON.parse(
    (
      await command("linux-boundaries", [
        nativeNode,
        `${work}/linux-boundaries.mjs`,
        root,
      ])
    ).toString(),
  );
  assert.equal(boundaries.sourceSha256, sha256(helper));
  assert.equal(boundaries.collectorSha256, sha256(collector));
  assert.equal(boundaries.nativePlatform, "linux");
  assert.equal(boundaries.nodeVersion, "v24.18.0");
  assert.equal(boundaries.uid, 1000);
  assert.deepEqual(
    boundaries.cases.map((item: any) => item.name),
    [
      "ordinary",
      "foreign",
      "owner-mismatch",
      "linked",
      "installer-script",
      "provider-links",
    ],
  );
  assert(boundaries.cases.every((item: any) => item.status === "PASS"));
  assert.equal(boundaries.hostQualification, "NOT_READY");
  assert.equal(boundaries.completionEligible, false);
  await writeJson(
    resolve(context.artifactDirectory, "linux-boundaries.json"),
    boundaries,
  );
  const packageStatus = await command("package-status", [
    nativeNode,
    "-e",
    "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('/var/lib/dpkg/status')).digest('hex')+'\\n');",
  ]);
  assert.equal(packageStatus.toString().trim(), preparation.hostPackagesBefore);
  assert.equal(preparation.hostPackagesAfter, preparation.hostPackagesBefore);
  const report = {
    schemaVersion: "orch-c2-support-audit.v1",
    status: "PASS",
    identity,
    signatures,
    packages: preparation.packages.length,
    image: preparation.image,
    providerInventorySha256: frozen.providerInventorySha256,
    linuxBoundaryCases: boundaries.cases.length,
    hostPackagesUnchanged: true,
    hostQualification: "NOT_READY",
    nativeWindowsQualified: false,
    completionEligible: false,
  };
  await writeJson(
    resolve(context.artifactDirectory, "support-audit.json"),
    report,
  );
  await writeReceipt(
    context,
    [
      {
        id: "signed-inputs-and-real-boundaries",
        summary:
          "Reverified upstream signatures, signed index/package/image hashes and inspected executable bytes; six actual Linux filesystem/launcher boundaries executed with source-bound raw observations. Host qualification remains NOT_READY.",
      },
    ],
    artifacts,
  );
  await validateCommandReceiptDirectory({
    directory: context.artifactDirectory,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      packages: report.packages,
      linuxBoundaryCases: report.linuxBoundaryCases,
      completionEligible: false,
    }) + "\n",
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
