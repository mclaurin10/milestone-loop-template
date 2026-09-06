import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

export const releaseHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const pathOrder = (a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
export function releasePath(path) {
  assert(
    typeof path === "string" &&
      path.length > 0 &&
      path.length < 256 &&
      /^[\x20-\x7e]+$/.test(path),
    "Release path framing is invalid.",
  );
  assert(
    !isAbsolute(path) &&
      !/[\\:]/.test(path) &&
      path
        .split("/")
        .every(
          (part) =>
            part &&
            part !== "." &&
            part !== ".." &&
            !/[. ]$/.test(part) &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        ),
    "Release path escapes or is not portable.",
  );
  assert(
    !path
      .split("/")
      .some((part) =>
        [".git", "node_modules", ".tools", "artifacts"].includes(part),
      ),
    "Release payload contains a forbidden private/runtime-cache path.",
  );
  return path;
}
export async function releaseRegularFile(root, path) {
  releasePath(path);
  const canonicalRoot = await realpath(root),
    absolute = resolve(root, path),
    info = await lstat(absolute);
  const actual = await realpath(absolute),
    expected = resolve(canonicalRoot, path);
  assert(
    info.isFile() &&
      info.nlink === 1 &&
      !info.isSymbolicLink() &&
      actual === expected,
    `Release input is not a canonical independent regular file: ${path}`,
  );
  return readFile(absolute);
}
export function releaseInventory(files) {
  const seen = new Set();
  return [...files].sort(pathOrder).map(({ path, contents }) => {
    releasePath(path);
    assert(
      !seen.has(path.toLowerCase()),
      "Release inventory has a duplicate portable path.",
    );
    seen.add(path.toLowerCase());
    return { path, bytes: contents.length, sha256: releaseHash(contents) };
  });
}
function writeOctal(header, offset, width, value) {
  const text = value.toString(8);
  assert(text.length < width);
  header.write(text.padStart(width - 1, "0") + "\0", offset, width, "ascii");
}
export function createReleaseArchive(files, limits) {
  assert(files.length > 0 && files.length <= limits.maximumPayloadFiles);
  const inventory = releaseInventory(files);
  assert(
    inventory.reduce((n, file) => n + file.bytes, 0) <=
      limits.maximumPayloadBytes,
  );
  const chunks = [];
  for (const file of [...files].sort(pathOrder)) {
    let name = file.path,
      prefix = "";
    if (name.length > 100) {
      const split = name.lastIndexOf("/");
      prefix = name.slice(0, split);
      name = name.slice(split + 1);
    }
    assert(
      name.length <= 100 && prefix.length <= 155,
      "Release path exceeds ustar limits.",
    );
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "ascii");
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, file.contents.length);
    writeOctal(header, 136, 12, 0);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    header.write(prefix, 345, 155, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(
      checksum.toString(8).padStart(6, "0") + "\0 ",
      148,
      8,
      "ascii",
    );
    chunks.push(
      header,
      file.contents,
      Buffer.alloc((512 - (file.contents.length % 512)) % 512),
    );
  }
  chunks.push(Buffer.alloc(1024));
  const archive = gzipSync(Buffer.concat(chunks), { level: 9 });
  archive[9] = 255; // The gzip OS marker is fixed for portable identical bytes.
  assert(archive.length <= limits.maximumArchiveBytes);
  return archive;
}
export function inspectReleaseArchive(archive, expected, limits) {
  assert(
    archive.length <= limits.maximumArchiveBytes,
    "Release archive exceeds its bound.",
  );
  const tar = gunzipSync(archive, {
    maxOutputLength:
      limits.maximumPayloadBytes + limits.maximumPayloadFiles * 1024 + 1024,
  });
  const files = [];
  let offset = 0,
    ended = false;
  const ascii = (header, start, width) =>
    header
      .subarray(start, start + width)
      .toString("ascii")
      .replace(/\0.*$/s, "");
  const octal = (header, start, width) => {
    const value = ascii(header, start, width).trim();
    assert(/^[0-7]+$/.test(value), "Malformed tar integer.");
    return Number.parseInt(value, 8);
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      assert(
        tar.length - offset >= 512 &&
          tar.subarray(offset).every((byte) => byte === 0),
        "Truncated/noncanonical tar end.",
      );
      ended = true;
      break;
    }
    assert(
      ascii(header, 257, 6) === "ustar" &&
        ascii(header, 263, 2) === "00" &&
        header[156] === 48,
      "Only regular ustar release entries are accepted.",
    );
    const checksum = octal(header, 148, 8),
      copy = Buffer.from(header);
    copy.fill(32, 148, 156);
    assert.equal(
      copy.reduce((sum, byte) => sum + byte, 0),
      checksum,
      "Tar checksum mismatch.",
    );
    assert.equal(octal(header, 100, 8), 0o644);
    assert.equal(octal(header, 108, 8), 0);
    assert.equal(octal(header, 116, 8), 0);
    assert.equal(octal(header, 136, 12), 0);
    const prefix = ascii(header, 345, 155),
      path = releasePath((prefix ? prefix + "/" : "") + ascii(header, 0, 100)),
      bytes = octal(header, 124, 12);
    assert(
      bytes <= limits.maximumPayloadBytes && offset + bytes <= tar.length,
      "Truncated or oversized release entry.",
    );
    const contents = Buffer.from(tar.subarray(offset, offset + bytes));
    const paddedEnd = offset + Math.ceil(bytes / 512) * 512;
    assert(
      paddedEnd <= tar.length &&
        tar.subarray(offset + bytes, paddedEnd).every((byte) => byte === 0),
      "Noncanonical tar padding.",
    );
    files.push({ path, contents });
    offset = paddedEnd;
    assert(files.length <= limits.maximumPayloadFiles);
  }
  assert(ended, "Release archive has no complete end marker.");
  const inventory = releaseInventory(files);
  assert.deepEqual(
    files.map(({ path }) => path),
    inventory.map(({ path }) => path),
    "Release entries must be sorted.",
  );
  assert.deepEqual(
    inventory,
    expected,
    "Release archive differs from its exact expected inventory.",
  );
  assert(
    inventory.reduce((n, file) => n + file.bytes, 0) <=
      limits.maximumPayloadBytes,
  );
  assert(
    createReleaseArchive(files, limits).equals(archive),
    "Release archive has noncanonical or hidden metadata.",
  );
  return files;
}
export async function extractReleaseArchive(
  archive,
  expected,
  limits,
  destination,
) {
  const files = inspectReleaseArchive(archive, expected, limits);
  assert(
    !existsSync(destination),
    "Release extraction destination must be absent.",
  );
  const parent = await realpath(dirname(destination));
  assert.equal(
    resolve(parent, relative(dirname(destination), destination)),
    resolve(destination),
    "Release extraction parent is not canonical.",
  );
  await mkdir(destination);
  for (const file of files) {
    const path = resolve(destination, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.contents, { flag: "wx" });
  }
  const actual = await inventoryReleaseDirectory(destination);
  assert.deepEqual(actual, expected);
  return actual;
}
export async function inventoryReleaseDirectory(root) {
  const files = [];
  async function walk(path = "") {
    for (const name of await readdir(resolve(root, path))) {
      const child = path ? path + "/" + name : name;
      releasePath(child);
      const info = await lstat(resolve(root, child));
      assert(!info.isSymbolicLink(), "Release output contains a link.");
      if (info.isDirectory()) await walk(child);
      else {
        assert(info.isFile());
        files.push({
          path: child,
          contents: await releaseRegularFile(root, child),
        });
      }
    }
  }
  await walk();
  return releaseInventory(files);
}
