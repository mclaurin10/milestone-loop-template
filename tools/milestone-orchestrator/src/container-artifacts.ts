import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, parse, relative, resolve, sep } from "node:path";

export const CONTAINER_ARTIFACT_EXPORT_SCHEMA_VERSION = "1.0.0" as const;

export interface ContainerArtifactLimits {
  readonly maximumFiles: number;
  readonly maximumBytes: number;
}

export interface ContainerArtifactFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ContainerArtifactInventory {
  readonly schemaVersion: typeof CONTAINER_ARTIFACT_EXPORT_SCHEMA_VERSION;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly files: readonly ContainerArtifactFile[];
}

export function assertCombinedContainerArtifactLimits(
  inventories: readonly ContainerArtifactInventory[],
  limits: ContainerArtifactLimits,
): void {
  validateLimits(limits);
  const fileCount = inventories.reduce(
    (total, inventory) => total + inventory.fileCount,
    0,
  );
  const totalBytes = inventories.reduce(
    (total, inventory) => total + inventory.totalBytes,
    0,
  );
  if (fileCount > limits.maximumFiles)
    throw new Error(
      `Combined container artifacts exceed the ${limits.maximumFiles}-file limit.`,
    );
  if (totalBytes > limits.maximumBytes)
    throw new Error(
      `Combined container artifacts exceed the ${limits.maximumBytes}-byte limit.`,
    );
}

function safeRelative(root: string, candidate: string): string {
  const value = relative(root, candidate).replaceAll("\\", "/");
  if (
    value.length === 0 ||
    value === ".." ||
    value.startsWith("../") ||
    value.includes("\0") ||
    value
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  )
    throw new Error("Container artifact path escaped or has invalid framing.");
  return value;
}

function validateLimits(limits: ContainerArtifactLimits): void {
  if (!Number.isSafeInteger(limits.maximumFiles) || limits.maximumFiles <= 0)
    throw new Error(
      "Container artifact file limit must be a positive integer.",
    );
  if (!Number.isSafeInteger(limits.maximumBytes) || limits.maximumBytes <= 0)
    throw new Error(
      "Container artifact byte limit must be a positive integer.",
    );
}

async function hashFile(path: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

async function assertStableRoot(path: string, label: string): Promise<string> {
  const absolute = resolve(path);
  const [actual, metadata] = await Promise.all([
    realpath(absolute),
    lstat(absolute),
  ]);
  if (
    resolve(actual) !== absolute ||
    !metadata.isDirectory() ||
    metadata.isSymbolicLink()
  )
    throw new Error(
      `${label} must be an ordinary directory with stable realpath identity.`,
    );
  return absolute;
}

export async function inventoryContainerArtifacts(
  root: string,
  limits: ContainerArtifactLimits,
): Promise<ContainerArtifactInventory> {
  validateLimits(limits);
  const absoluteRoot = await assertStableRoot(root, "Container artifact root");
  const files: ContainerArtifactFile[] = [];
  let totalBytes = 0;
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const path = safeRelative(absoluteRoot, absolute);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink() || entry.isSymbolicLink())
        throw new Error(`Container artifact ${path} is a symbolic link.`);
      if (metadata.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!metadata.isFile())
        throw new Error(`Container artifact ${path} is not a regular file.`);
      if (metadata.nlink !== 1)
        throw new Error(`Container artifact ${path} is a hard link.`);
      totalBytes += metadata.size;
      if (totalBytes > limits.maximumBytes)
        throw new Error(
          `Container artifacts exceed the ${limits.maximumBytes}-byte limit.`,
        );
      if (files.length + 1 > limits.maximumFiles)
        throw new Error(
          `Container artifacts exceed the ${limits.maximumFiles}-file limit.`,
        );
      files.push({
        path,
        bytes: metadata.size,
        sha256: await hashFile(absolute),
      });
    }
  };
  await visit(absoluteRoot);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: CONTAINER_ARTIFACT_EXPORT_SCHEMA_VERSION,
    fileCount: files.length,
    totalBytes,
    files,
  };
}

async function destinationRoot(path: string): Promise<string> {
  const absolute = resolve(path);
  const filesystemRoot = parse(absolute).root;
  let current = filesystemRoot;
  const segments = relative(filesystemRoot, absolute)
    .split(sep)
    .filter(Boolean);
  for (const segment of segments) {
    current = resolve(current, segment);
    let metadata = await lstat(current).catch((failure: unknown) => {
      if (
        failure &&
        typeof failure === "object" &&
        "code" in failure &&
        failure.code === "ENOENT"
      )
        return null;
      throw failure;
    });
    if (metadata === null) {
      try {
        await mkdir(current);
      } catch (failure) {
        if (
          !failure ||
          typeof failure !== "object" ||
          !("code" in failure) ||
          failure.code !== "EEXIST"
        )
          throw failure;
      }
      metadata = await lstat(current);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(
        "Container artifact destination path contains a non-directory or link.",
      );
    if (resolve(await realpath(current)) !== current)
      throw new Error("Container artifact destination path changed identity.");
  }
  return assertStableRoot(absolute, "Container artifact destination");
}

async function ensureOrdinaryDestinationParents(
  destination: string,
  relativeParent: string,
): Promise<void> {
  let current = destination;
  for (const segment of relativeParent.split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment);
    safeRelative(destination, current);
    let metadata = await lstat(current).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return null;
      throw error;
    });
    if (metadata === null) {
      await mkdir(current);
      metadata = await lstat(current);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(
        "Container artifact destination parent is not an ordinary directory.",
      );
    if (resolve(await realpath(current)) !== current)
      throw new Error(
        "Container artifact destination parent changed identity.",
      );
  }
}

export async function publishContainerArtifacts(input: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly limits: ContainerArtifactLimits;
}): Promise<ContainerArtifactInventory> {
  const sourceRoot = await assertStableRoot(
    input.sourceRoot,
    "Container artifact source",
  );
  const before = await inventoryContainerArtifacts(sourceRoot, input.limits);
  const destination = await destinationRoot(input.destinationRoot);
  for (const file of before.files) {
    const source = resolve(sourceRoot, ...file.path.split("/"));
    const target = resolve(destination, ...file.path.split("/"));
    safeRelative(destination, target);
    const parentRelative = relative(destination, dirname(target));
    await ensureOrdinaryDestinationParents(destination, parentRelative);
    // Keep the exclusively-created inode open while copying. A path swap can
    // then make validation fail, but cannot redirect the write through a link.
    const sourceHandle = await open(source, "r");
    let reservation: Awaited<ReturnType<typeof open>>;
    try {
      reservation = await open(target, "wx");
    } catch (error) {
      await sourceHandle.close();
      throw error;
    }
    try {
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let position = 0;
      while (true) {
        const { bytesRead } = await sourceHandle.read(
          buffer,
          0,
          buffer.length,
          position,
        );
        if (bytesRead === 0) break;
        let written = 0;
        while (written < bytesRead) {
          const result = await reservation.write(
            buffer,
            written,
            bytesRead - written,
            position + written,
          );
          if (result.bytesWritten === 0)
            throw new Error(
              `Container artifact ${file.path} copy made no progress.`,
            );
          written += result.bytesWritten;
        }
        position += bytesRead;
      }
      await reservation.sync();
    } finally {
      await Promise.all([sourceHandle.close(), reservation.close()]);
    }
    const [sourceMetadata, targetMetadata] = await Promise.all([
      lstat(source),
      lstat(target),
    ]);
    if (
      !sourceMetadata.isFile() ||
      !targetMetadata.isFile() ||
      sourceMetadata.isSymbolicLink() ||
      targetMetadata.isSymbolicLink() ||
      sourceMetadata.nlink !== 1 ||
      targetMetadata.nlink !== 1 ||
      sourceMetadata.size !== file.bytes ||
      targetMetadata.size !== file.bytes ||
      resolve(await realpath(target)) !== target
    )
      throw new Error(
        `Container artifact ${file.path} changed during publication.`,
      );
    const [sourceHash, targetHash] = await Promise.all([
      hashFile(source),
      hashFile(target),
    ]);
    if (sourceHash !== file.sha256 || targetHash !== file.sha256)
      throw new Error(
        `Container artifact ${file.path} changed during publication.`,
      );
  }
  const after = await inventoryContainerArtifacts(sourceRoot, input.limits);
  if (JSON.stringify(after) !== JSON.stringify(before))
    throw new Error("Container artifact source changed during publication.");
  return before;
}
