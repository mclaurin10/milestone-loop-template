import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { release } from "node:os";
import { posix, resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";

// This module is deliberately standalone for copying to an inspected host.
// Discovery must never execute a found launcher, including `--version`.
export const HOST_DISCOVERY_NAMES = Object.freeze([
  "docker",
  "podman",
  "qemu-system-x86_64",
  "virsh",
  "VBoxManage",
  "lxc",
  "incus",
  "multipass",
  "WindowsSandbox",
  "wsl",
  "ssh",
]);
export const HOST_DISCOVERY_LIMITS = Object.freeze({
  pathBytes: 32_768,
  pathEntries: 128,
  candidates: 8_192,
  sampleBytes: 4_096,
  reportBytes: 262_144,
});
export const APPROVED_AUTHORITY_DIGEST =
  "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
const objectIdPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function keys(value, expected) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}

export function validateDiscoveryBinding(binding) {
  keys(binding, [
    "purpose",
    "runId",
    "nonce",
    "route",
    "sourceCommit",
    "sourceTree",
    "authorityDigest",
    "scannerSha256",
  ]);
  assert.equal(binding.purpose, "candidate-support");
  assert.match(binding.runId, /^[a-zA-Z0-9-]{1,80}$/);
  assert.match(binding.nonce, hashPattern);
  assert.match(binding.route, /^[a-zA-Z0-9-]{1,80}$/);
  assert.match(binding.sourceCommit, objectIdPattern);
  assert.match(binding.sourceTree, objectIdPattern);
  assert.equal(binding.authorityDigest, APPROVED_AUTHORITY_DIGEST);
  assert.match(binding.scannerSha256, hashPattern);
}

export function discoverySearch(platform, pathValue) {
  assert(["win32", "linux"].includes(platform), "Unsupported native platform.");
  assert.equal(typeof pathValue, "string");
  assert(Buffer.byteLength(pathValue) <= HOST_DISCOVERY_LIMITS.pathBytes);
  assert(!pathValue.includes("\0"));
  const api = platform === "win32" ? win32 : posix;
  const entries = pathValue.split(platform === "win32" ? ";" : ":");
  assert(entries.length <= HOST_DISCOVERY_LIMITS.pathEntries);
  // Inspect a fixed launcher suffix set, not aliases, shell functions or cwd.
  // No claim of reproducing arbitrary shell/PATHEXT command resolution.
  const suffixes =
    platform === "win32" ? [".com", ".exe", ".bat", ".cmd", ".ps1", ""] : [""];
  const paths = entries.map((entry) => entry.replace(/^"(.*)"$/, "$1"));
  const absolute = (path) =>
    api.isAbsolute(path) &&
    (platform !== "win32" || /^[a-zA-Z]:[\\/]/.test(path));
  const directories = paths.filter(absolute);
  assert(
    directories.length * suffixes.length * HOST_DISCOVERY_NAMES.length <=
      HOST_DISCOVERY_LIMITS.candidates,
  );
  return {
    ignoredEntries: paths.length - directories.length,
    directories,
    candidates: HOST_DISCOVERY_NAMES.map((name) => ({
      name,
      paths: directories.flatMap((directory, index) =>
        suffixes.map((suffix) => ({
          path: api.join(directory, name + suffix),
          index,
        })),
      ),
    })),
  };
}

function prefixFormat(path, bytes) {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])))
    return "elf-prefix";
  if (bytes.subarray(0, 2).equals(Buffer.from("MZ"))) return "pe-prefix";
  if (bytes.subarray(0, 2).equals(Buffer.from("#!"))) return "shebang-script";
  if (/\.(?:cmd|bat|ps1)$/i.test(path)) return "script-extension";
  return "unknown";
}

function sameFile(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    right.isFile()
  );
}

async function observeLauncher(name, paths) {
  for (const candidate of paths) {
    const result = {
      name,
      selectedPath: candidate.path,
      searchIndex: candidate.index,
      kind: "unreadable",
      fileBytes: null,
      sample: null,
      errorCode: null,
    };
    let handle;
    let observed = false;
    try {
      const before = await lstat(candidate.path);
      observed = true;
      if (
        before.isSymbolicLink() ||
        (await realpath(candidate.path)) !== resolve(candidate.path)
      ) {
        result.kind = "linked-or-aliased-path";
        return result;
      }
      if (!before.isFile()) {
        result.kind = "non-file";
        return result;
      }
      assert(Number.isSafeInteger(before.size) && before.size >= 0);
      // Refuse links and avoid blocking on a raced-in FIFO where supported.
      handle = await open(
        candidate.path,
        constants.O_RDONLY |
          (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0),
      );
      assert(
        sameFile(before, await handle.stat()),
        "Launcher changed before read.",
      );
      const bytes = Buffer.alloc(
        Math.min(before.size, HOST_DISCOVERY_LIMITS.sampleBytes),
      );
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      assert.equal(
        bytesRead,
        bytes.length,
        "Launcher prefix read was incomplete.",
      );
      assert(
        sameFile(before, await handle.stat()),
        "Launcher changed during read.",
      );
      assert(
        sameFile(before, await lstat(candidate.path)),
        "Launcher path changed during read.",
      );
      assert.equal(await realpath(candidate.path), resolve(candidate.path));
      result.kind = "regular-file";
      result.fileBytes = before.size;
      result.sample = {
        bytes: bytes.length,
        sha256: sha256(bytes),
        base64: bytes.toString("base64"),
        format: prefixFormat(candidate.path, bytes),
        completeFile: bytes.length === before.size,
      };
      return result;
    } catch (error) {
      if (!observed && (error.code === "ENOENT" || error.code === "ENOTDIR"))
        continue;
      result.errorCode = ["EACCES", "EPERM", "ELOOP"].includes(error.code)
        ? error.code
        : "INSPECTION_FAILED";
      return result;
    } finally {
      await handle?.close();
    }
  }
  return {
    name,
    selectedPath: null,
    searchIndex: null,
    kind: "missing",
    fileBytes: null,
    sample: null,
    errorCode: null,
  };
}

export async function discoverQualificationHost(
  binding,
  pathValue = process.env.PATH ?? "",
) {
  validateDiscoveryBinding(binding);
  const scanner = await readFile(new URL(import.meta.url));
  assert.equal(
    sha256(scanner),
    binding.scannerSha256,
    "Scanner bytes differ from dispatch pin.",
  );
  const search = discoverySearch(process.platform, pathValue);
  const launchers = [];
  for (const entry of search.candidates)
    launchers.push(await observeLauncher(entry.name, entry.paths));
  const kernelRelease = release();
  return {
    schemaVersion: "qualification-host-discovery.v1",
    binding,
    observedAt: new Date().toISOString(),
    controller: {
      platform: process.platform,
      architecture: process.arch,
      kernelRelease,
      wsl: process.platform === "linux" && /microsoft|wsl/i.test(kernelRelease),
      nodeVersion: process.version,
    },
    search: {
      absoluteDirectories: search.directories.length,
      ignoredEntries: search.ignoredEntries,
      scope: "fixed-names-in-absolute-PATH-only",
    },
    launchers,
    qualification: {
      status: "NOT_READY",
      reason:
        "Metadata is not host authorization, isolation, provider attestation or workflow execution.",
      generalDockerControllerHostQualified: false,
      nativeWindowsQualified: false,
    },
    completion: { eligible: false },
  };
}

// The caller must retain these pins outside the report. A self-consistent
// report cannot authenticate its route or authorize any host/controller run.
export function auditHostDiscovery(bytes, expected) {
  assert(Buffer.isBuffer(bytes));
  assert(bytes.length > 0 && bytes.length <= HOST_DISCOVERY_LIMITS.reportBytes);
  keys(expected, ["binding", "platform", "kernelRelease", "reportSha256"]);
  validateDiscoveryBinding(expected.binding);
  assert.match(expected.reportSha256, hashPattern);
  assert.equal(
    sha256(bytes),
    expected.reportSha256,
    "Discovery bytes changed after capture.",
  );
  const report = JSON.parse(bytes.toString("utf8"));
  keys(report, [
    "schemaVersion",
    "binding",
    "observedAt",
    "controller",
    "search",
    "launchers",
    "qualification",
    "completion",
  ]);
  assert.equal(report.schemaVersion, "qualification-host-discovery.v1");
  assert.deepEqual(report.binding, expected.binding);
  assert.equal(new Date(report.observedAt).toISOString(), report.observedAt);
  keys(report.controller, [
    "platform",
    "architecture",
    "kernelRelease",
    "wsl",
    "nodeVersion",
  ]);
  assert(["win32", "linux"].includes(expected.platform));
  assert.equal(report.controller.platform, expected.platform);
  assert.equal(report.controller.kernelRelease, expected.kernelRelease);
  assert.equal(
    report.controller.wsl,
    expected.platform === "linux" &&
      /microsoft|wsl/i.test(expected.kernelRelease),
  );
  assert(["x64", "arm64"].includes(report.controller.architecture));
  assert.equal(report.controller.nodeVersion, "v24.18.0");
  keys(report.search, ["absoluteDirectories", "ignoredEntries", "scope"]);
  assert.equal(report.search.scope, "fixed-names-in-absolute-PATH-only");
  for (const count of [
    report.search.absoluteDirectories,
    report.search.ignoredEntries,
  ])
    assert(Number.isSafeInteger(count) && count >= 0);
  assert(
    report.search.absoluteDirectories + report.search.ignoredEntries <=
      HOST_DISCOVERY_LIMITS.pathEntries,
  );
  assert.deepEqual(
    report.launchers.map((entry) => entry.name),
    HOST_DISCOVERY_NAMES,
  );
  const api = expected.platform === "win32" ? win32 : posix;
  for (const launcher of report.launchers) {
    keys(launcher, [
      "name",
      "selectedPath",
      "searchIndex",
      "kind",
      "fileBytes",
      "sample",
      "errorCode",
    ]);
    assert(
      [
        "missing",
        "regular-file",
        "linked-or-aliased-path",
        "non-file",
        "unreadable",
      ].includes(launcher.kind),
    );
    if (launcher.kind === "missing") {
      assert.equal(launcher.selectedPath, null);
      assert.equal(launcher.searchIndex, null);
    } else {
      assert.equal(typeof launcher.selectedPath, "string");
      assert(
        api.isAbsolute(launcher.selectedPath) &&
          !launcher.selectedPath.includes("\0"),
      );
      if (expected.platform === "win32")
        assert.match(launcher.selectedPath, /^[a-zA-Z]:[\\/]/);
      assert(
        Number.isSafeInteger(launcher.searchIndex) &&
          launcher.searchIndex >= 0 &&
          launcher.searchIndex < report.search.absoluteDirectories,
      );
      const basename = api.basename(launcher.selectedPath);
      const suffixes =
        expected.platform === "win32"
          ? [".com", ".exe", ".bat", ".cmd", ".ps1", ""]
          : [""];
      assert(suffixes.some((suffix) => basename === launcher.name + suffix));
    }
    if (launcher.kind === "regular-file") {
      assert(
        Number.isSafeInteger(launcher.fileBytes) && launcher.fileBytes >= 0,
      );
      keys(launcher.sample, [
        "bytes",
        "sha256",
        "base64",
        "format",
        "completeFile",
      ]);
      const sample = Buffer.from(launcher.sample.base64, "base64");
      assert.equal(sample.toString("base64"), launcher.sample.base64);
      assert.equal(
        sample.length,
        Math.min(launcher.fileBytes, HOST_DISCOVERY_LIMITS.sampleBytes),
      );
      assert.equal(sample.length, launcher.sample.bytes);
      assert.equal(sha256(sample), launcher.sample.sha256);
      assert.equal(
        prefixFormat(launcher.selectedPath, sample),
        launcher.sample.format,
      );
      assert.equal(
        launcher.sample.completeFile,
        sample.length === launcher.fileBytes,
      );
    } else {
      assert.equal(launcher.fileBytes, null);
      assert.equal(launcher.sample, null);
    }
    if (launcher.kind === "unreadable")
      assert(
        ["EACCES", "EPERM", "ELOOP", "INSPECTION_FAILED"].includes(
          launcher.errorCode,
        ),
      );
    else assert.equal(launcher.errorCode, null);
  }
  assert.deepEqual(report.qualification, {
    status: "NOT_READY",
    reason:
      "Metadata is not host authorization, isolation, provider attestation or workflow execution.",
    generalDockerControllerHostQualified: false,
    nativeWindowsQualified: false,
  });
  assert.deepEqual(report.completion, { eligible: false });
  return report;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  assert.equal(process.version, "v24.18.0");
  assert.equal(
    process.argv.length,
    4,
    "Expected --binding-base64 <coordinator binding> only.",
  );
  assert.equal(process.argv[2], "--binding-base64");
  const binding = JSON.parse(
    Buffer.from(process.argv[3], "base64url").toString("utf8"),
  );
  const report = Buffer.from(
    JSON.stringify(await discoverQualificationHost(binding)) + "\n",
  );
  assert(report.length <= HOST_DISCOVERY_LIMITS.reportBytes);
  process.stdout.write(report);
}
