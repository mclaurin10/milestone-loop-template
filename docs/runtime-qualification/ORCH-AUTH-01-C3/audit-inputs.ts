import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  evidenceContext,
  commandIdentity,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { dockerHostSha256 as sha256 } from "../../../tools/qualification-docker-host.mjs";
import { superviseCommand } from "../../../tools/milestone-orchestrator/src/process-supervisor.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [expectedArg, guestArg, outputArg] = process.argv.slice(2);
assert(expectedArg && guestArg && outputArg && process.argv.length === 5);
assert.match(
  expectedArg,
  /^\/home\/duncan\/oc3-[A-Za-z0-9_-]+\/expected-[a-f0-9-]{36}\.json$/,
);
assert.equal(process.platform, "win32");
const native = (path: string) =>
  "\\\\wsl.localhost\\Ubuntu" + path.replaceAll("/", "\\");
const output = resolve(outputArg);
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-c3-input-audit",
  "independent-offline-inputs",
);
const artifacts: { path: string; kind: string }[] = [];
const retain = async (name: string, bytes: Buffer | string) => {
  await writeFile(resolve(output, name), bytes);
  if (Buffer.byteLength(bytes) > 0)
    artifacts.push({ path: name, kind: "offline-input-provenance" });
};
try {
  const identity = await commandIdentity(context.repositoryRoot);
  assert.equal(identity.nodeVersion, "v24.18.0");
  assert.equal(identity.pnpmVersion, "11.15.1");
  const expectedBytes = await readFile(native(expectedArg));
  const expected = JSON.parse(expectedBytes.toString());
  const root = expectedArg.slice(0, expectedArg.lastIndexOf("/"));
  const preparationBytes = await readFile(native(expected.preparation.path));
  assert.equal(sha256(preparationBytes), expected.preparation.sha256);
  const preparation = JSON.parse(preparationBytes.toString());
  assert.equal(preparation.sharedInstallation, false);
  assert.equal(preparation.controllerDispatched, false);
  const prepared = expected.preparation.path.slice(
    0,
    expected.preparation.path.lastIndexOf("/"),
  );
  assert(prepared.startsWith(root + "/preparation-"));
  const manifestBytes = await readFile(
    resolve(guestArg, "guest/input-manifest.json"),
  );
  assert.equal(sha256(manifestBytes), expected.binding.inputManifestSha256);
  const manifest = JSON.parse(manifestBytes.toString());
  assert.deepEqual(manifest.source, {
    commit: expected.binding.sourceCommit,
    tree: expected.binding.sourceTree,
  });
  await retain("expected.json", expectedBytes);
  await retain("preparation.json", preparationBytes);
  await retain("input-manifest.json", manifestBytes);
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
      timeoutMs: 180000,
      killGraceMs: 5000,
      outputLimitBytes: 4194304,
    });
    await retain(
      name + "-execution.json",
      JSON.stringify(
        {
          args,
          exitCode: result.exitCode,
          spawnError: result.spawnError?.message ?? null,
          supervision: result.supervision,
        },
        null,
        2,
      ) + "\n",
    );
    await retain(name + "-stdout.log", result.stdout);
    await retain(name + "-stderr.log", result.stderr);
    assert.equal(result.exitCode, 0, result.stderr.toString());
    assert.equal(result.spawnError, null);
    assert.equal(result.supervision.timedOut, false);
    assert.equal(result.supervision.outputLimitExceeded, false);
    return result.stdout;
  };
  const key = await readFile(native(prepared + "/ubuntu-archive-keyring.gpg"));
  assert.equal(
    sha256(key),
    "80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31",
  );
  await retain("ubuntu-archive-keyring.gpg", key);
  const releases = new Map<string, string>();
  for (const suite of ["noble", "noble-updates", "noble-security"]) {
    const bytes = await readFile(native(prepared + "/" + suite + "-InRelease"));
    await retain(suite + "-InRelease", bytes);
    releases.set(suite, bytes.toString());
    const signature = await command("gpg-" + suite, [
      "/usr/bin/gpgv",
      "--status-fd",
      "1",
      "--keyring",
      prepared + "/ubuntu-archive-keyring.gpg",
      prepared + "/" + suite + "-InRelease",
    ]);
    assert(
      signature
        .toString()
        .includes(
          "[GNUPG:] VALIDSIG F6ECB3762474EDA9D21B7022871920D1991BC93C ",
        ),
    );
  }
  const packages = [];
  for (const index of preparation.indexes) {
    const compressed = await readFile(native(prepared + "/" + index.file));
    const bytes = gunzipSync(compressed, {
      maxOutputLength: 150 * 1024 * 1024,
    });
    assert.equal(bytes.length, index.bytes);
    assert.equal(sha256(bytes), index.sha256);
    const release = releases.get(index.suite)!;
    const section = release.split("\nSHA256:\n")[1].split("\nSHA512:")[0];
    assert(
      section
        .split("\n")
        .some(
          (line) =>
            line.trim().split(/\s+/).join(" ") ===
            `${index.sha256} ${index.bytes} ${index.component}/binary-amd64/Packages`,
        ),
    );
    await retain(index.file, compressed);
    const wanted = preparation.packages.filter(
      (p: any) => p.index === index.file,
    );
    const matches = new Map<string, Record<string, string>>();
    for (const stanza of bytes.toString().split("\n\n")) {
      const fields = Object.fromEntries(
        [...stanza.matchAll(/^(\S+): (.*)$/gm)].map((m) => [m[1], m[2]]),
      );
      if (
        wanted.some(
          (p: any) =>
            p.package === fields.Package && p.version === fields.Version,
        )
      ) {
        const key = fields.Package + "@" + fields.Version;
        assert(!matches.has(key));
        matches.set(key, fields);
      }
    }
    for (const item of wanted) {
      const fields = matches.get(item.package + "@" + item.version)!;
      assert(fields);
      assert.equal(fields.SHA256, item.sha256);
      assert.equal(Number(fields.Size), item.bytes);
      assert.equal(fields.Filename.split("/").at(-1), item.file);
      const file = manifest.files.find(
        (file: any) => file.path === "packages/" + item.file,
      );
      assert(file);
      assert.equal(file.sha256, item.sha256);
      assert.equal(file.bytes, item.bytes);
      packages.push(item);
    }
  }
  assert.equal(packages.length, 82);
  const checksums = await readFile(native(prepared + "/SHASUMS256.txt"));
  await retain("SHASUMS256.txt", checksums);
  const node = manifest.files.find(
    (f: any) => f.path === "node-v24.18.0-linux-x64.tar.xz",
  );
  assert.equal(
    checksums
      .toString()
      .split("\n")
      .find((line) => line.trim().split(/\s+/)[1] === node.path)
      ?.split(/\s+/)[0],
    node.sha256,
  );
  const metadataBytes = await readFile(
    native(prepared + "/pnpm-metadata.json"),
  );
  const metadata = JSON.parse(metadataBytes.toString());
  assert.equal(metadata.name, "pnpm");
  assert.equal(metadata.version, "11.15.1");
  await retain("pnpm-metadata.json", metadataBytes);
  const files = [
    ...manifest.files.map((f: any) => ({
      ...f,
      path: root + "/input/" + f.path,
    })),
    expected.input,
    expected.base,
    ...expected.launchers,
  ];
  const script = `import fs from 'node:fs';import crypto from 'node:crypto';
const inputs=JSON.parse(Buffer.from(process.argv[1],'base64url'));const results=[];
for(const item of inputs){const s=fs.lstatSync(item.path);if(!s.isFile()||s.isSymbolicLink()||s.size!==item.bytes)throw Error('Unsafe or changed input '+item.path);
const h=crypto.createHash('sha256');const sri=crypto.createHash('sha512');for await(const chunk of fs.createReadStream(item.path)){h.update(chunk);sri.update(chunk);}const hash=h.digest('hex');if(hash!==item.sha256)throw Error('Changed input '+item.path);results.push({...item,actualSha256:hash,...(item.path.endsWith('/pnpm.tgz')?{sri:'sha512-'+sri.digest('base64')}:{})});}
process.stdout.write(JSON.stringify({platform:process.platform,nodeVersion:process.version,uid:process.getuid(),files:results})+'\\n');`;
  await retain("observer.mjs", script);
  const nativeNode = "/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node";
  assert.equal(
    sha256(await readFile(native(nativeNode))),
    "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c",
  );
  const observed = JSON.parse(
    (
      await command("native-rehash", [
        nativeNode,
        "--input-type=module",
        "-e",
        script,
        Buffer.from(JSON.stringify(files)).toString("base64url"),
      ])
    ).toString(),
  );
  assert.equal(observed.platform, "linux");
  assert.equal(observed.nodeVersion, "v24.18.0");
  assert.equal(observed.uid, 1000);
  assert.equal(observed.files.length, files.length);
  for (const [index, file] of observed.files.entries()) {
    const { actualSha256, sri, ...pin } = file;
    assert.deepEqual(pin, files[index]);
    assert.equal(actualSha256, pin.sha256);
    if (pin.path.endsWith("/pnpm.tgz"))
      assert.equal(sri, metadata.dist.integrity);
  }
  await retain(
    "input-audit.json",
    JSON.stringify(
      {
        schemaVersion: "orch-auth-c3-input-audit.v1",
        status: "PASS",
        binding: expected.binding,
        packages: packages.length,
        files: observed.files,
        completionEligible: false,
        hostAdmission: false,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "AUTHENTICATED-OFFLINE-INPUTS",
        summary:
          "Fresh GPG verification, signed index membership, package and complete frozen payload rehash, exact Node checksum and pnpm registry integrity independently agree with the admitted guest manifest.",
      },
    ],
    artifacts,
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      packages: packages.length,
      files: files.length,
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
