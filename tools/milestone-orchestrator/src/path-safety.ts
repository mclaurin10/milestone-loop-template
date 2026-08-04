import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function strictlyContained(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export interface ArtifactRootInspection {
  readonly lexicalRoot: string;
  readonly realRoot: string;
}

export interface ContainedTreeInspection {
  readonly lexicalContained: true;
  readonly realpathContained: true;
  readonly artifactRootSymlink: false;
  readonly entrySymlink: boolean;
  readonly disposition: "contained" | "contains-symlink" | "symlink-rejected";
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly symlinkPaths: readonly string[];
}

export async function assertArtifactRoot(
  configuredRoot: string,
): Promise<ArtifactRootInspection> {
  const lexicalRoot = resolve(configuredRoot);
  const rootStat = await lstat(lexicalRoot);
  if (rootStat.isSymbolicLink())
    throw new Error(`Artifact root cannot be a symlink: ${lexicalRoot}.`);
  if (!rootStat.isDirectory())
    throw new Error(`Artifact root must be a directory: ${lexicalRoot}.`);
  return { lexicalRoot, realRoot: await realpath(lexicalRoot) };
}

export async function inspectContainedTree(
  configuredRoot: string,
  candidate: string,
): Promise<ContainedTreeInspection> {
  const root = await assertArtifactRoot(configuredRoot);
  const lexicalCandidate = resolve(candidate);
  if (!strictlyContained(root.lexicalRoot, lexicalCandidate))
    throw new Error(
      `Refusing artifact path outside configured root: ${lexicalCandidate}.`,
    );

  const candidateStat = await lstat(lexicalCandidate);
  if (candidateStat.isSymbolicLink())
    return {
      lexicalContained: true,
      realpathContained: true,
      artifactRootSymlink: false,
      entrySymlink: true,
      disposition: "symlink-rejected",
      fileCount: 0,
      totalBytes: 0,
      symlinkPaths: ["."],
    };

  const resolvedCandidate = await realpath(lexicalCandidate);
  if (!strictlyContained(root.realRoot, resolvedCandidate))
    throw new Error(
      `Refusing real-path escape outside configured root: ${resolvedCandidate}.`,
    );

  let fileCount = 0;
  let totalBytes = 0;
  const symlinkPaths: string[] = [];
  const pending = [lexicalCandidate];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const currentStat = await lstat(current);
    if (currentStat.isSymbolicLink()) {
      symlinkPaths.push(
        relative(lexicalCandidate, current).replaceAll("\\", "/") || ".",
      );
      continue;
    }
    const resolvedCurrent = await realpath(current);
    if (
      resolvedCurrent !== resolvedCandidate &&
      !strictlyContained(resolvedCandidate, resolvedCurrent)
    )
      throw new Error(
        `Refusing real-path escape outside artifact entry: ${resolvedCurrent}.`,
      );
    if (currentStat.isFile()) {
      fileCount += 1;
      totalBytes += currentStat.size;
      continue;
    }
    if (!currentStat.isDirectory()) continue;
    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) pending.push(resolve(current, child.name));
  }
  symlinkPaths.sort();
  return {
    lexicalContained: true,
    realpathContained: true,
    artifactRootSymlink: false,
    entrySymlink: symlinkPaths.length > 0,
    disposition: symlinkPaths.length > 0 ? "contains-symlink" : "contained",
    fileCount,
    totalBytes,
    symlinkPaths,
  };
}

export async function assertExistingContainedPath(
  configuredRoot: string,
  candidate: string,
): Promise<{ readonly root: string; readonly candidate: string }> {
  const lexicalRoot = resolve(configuredRoot);
  const lexicalCandidate = resolve(candidate);
  if (!strictlyContained(lexicalRoot, lexicalCandidate))
    throw new Error(
      `Refusing path outside configured root: ${lexicalCandidate}.`,
    );

  const [rootStat, candidateStat] = await Promise.all([
    lstat(lexicalRoot),
    lstat(lexicalCandidate),
  ]);
  if (rootStat.isSymbolicLink())
    throw new Error(
      `Configured cleanup root cannot be a symlink: ${lexicalRoot}.`,
    );
  if (candidateStat.isSymbolicLink())
    throw new Error(`Cleanup target cannot be a symlink: ${lexicalCandidate}.`);

  const [resolvedRoot, resolvedCandidate] = await Promise.all([
    realpath(lexicalRoot),
    realpath(lexicalCandidate),
  ]);
  if (!strictlyContained(resolvedRoot, resolvedCandidate))
    throw new Error(
      `Refusing real-path escape outside configured root: ${resolvedCandidate}.`,
    );
  return { root: resolvedRoot, candidate: resolvedCandidate };
}

export async function removeContainedPath(
  configuredRoot: string,
  candidate: string,
): Promise<"removed" | "missing"> {
  const lexicalRoot = resolve(configuredRoot);
  const lexicalCandidate = resolve(candidate);
  if (!strictlyContained(lexicalRoot, lexicalCandidate))
    throw new Error(
      `Refusing deletion outside configured root: ${lexicalCandidate}.`,
    );

  try {
    await lstat(lexicalRoot);
  } catch (error) {
    if (missing(error))
      throw new Error(
        `Configured cleanup root does not exist: ${lexicalRoot}.`,
        {
          cause: error,
        },
      );
    throw error;
  }

  try {
    await assertExistingContainedPath(lexicalRoot, lexicalCandidate);
  } catch (error) {
    if (missing(error)) return "missing";
    throw error;
  }

  await rm(lexicalCandidate, { recursive: true, force: false });
  return "removed";
}
