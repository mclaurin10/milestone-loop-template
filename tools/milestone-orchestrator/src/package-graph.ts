import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const DEPENDENCY_TYPES = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

export type WorkspaceDependencyType = (typeof DEPENDENCY_TYPES)[number];

export interface PackageGraphSource {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface WorkspaceDependencyEdge {
  readonly name: string;
  readonly dependencyType: WorkspaceDependencyType;
  readonly specifier: string;
}

export interface WorkspacePackageNode {
  readonly name: string;
  readonly root: string;
  readonly manifestPath: string;
  readonly manifestBytes: number;
  readonly manifestSha256: string;
  readonly private: boolean;
  readonly exports: unknown | null;
  readonly workspaceDependencies: readonly WorkspaceDependencyEdge[];
}

export interface PackageGraphEdge extends WorkspaceDependencyEdge {
  readonly from: string;
  readonly to: string;
}

export interface PackageGraphSnapshot {
  readonly schemaVersion: "1.0.0";
  readonly workspaceManifest: PackageGraphSource & {
    readonly patterns: readonly string[];
  };
  readonly packages: readonly WorkspacePackageNode[];
  readonly edges: readonly PackageGraphEdge[];
  readonly sha256: string;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function slash(path: string): string {
  return path.replaceAll("\\", "/");
}

function sha256(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(
        "Package graph canonical JSON rejects non-finite numbers.",
      );
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as JsonRecord)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  throw new Error(`Package graph canonical JSON rejects ${typeof value}.`);
}

function safeRelativePath(path: string, allowDot = false): string {
  const normalized = slash(path);
  if (
    normalized.includes("\0") ||
    isAbsolute(normalized) ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    normalized.split("/").includes("") ||
    (!allowDot && normalized === ".")
  )
    throw new Error(`Package graph path is unsafe: ${path}.`);
  return normalized;
}

function repositoryRelative(repositoryRoot: string, path: string): string {
  const value = slash(relative(resolve(repositoryRoot), resolve(path)));
  if (value === "") return ".";
  return safeRelativePath(value);
}

async function assertContainedDirectory(
  repositoryRoot: string,
  path: string,
): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error(
      `Package graph workspace directory is unsafe or symlinked: ${repositoryRelative(repositoryRoot, path)}.`,
    );
  const [resolvedRoot, resolvedPath] = await Promise.all([
    realpath(repositoryRoot),
    realpath(path),
  ]);
  const contained = slash(relative(resolvedRoot, resolvedPath));
  if (
    contained !== "" &&
    (isAbsolute(contained) || contained.split("/").includes(".."))
  )
    throw new Error("Package graph workspace resolves outside the repository.");
}

async function readRegularSource(
  repositoryRoot: string,
  path: string,
): Promise<{ readonly source: PackageGraphSource; readonly contents: Buffer }> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(
      `Package graph source is unsafe or symlinked: ${repositoryRelative(repositoryRoot, path)}.`,
    );
  const [resolvedRoot, resolvedPath] = await Promise.all([
    realpath(repositoryRoot),
    realpath(path),
  ]);
  const contained = slash(relative(resolvedRoot, resolvedPath));
  if (
    contained === "" ||
    isAbsolute(contained) ||
    contained.split("/").includes("..")
  )
    throw new Error("Package graph source resolves outside the repository.");
  const contents = await readFile(path);
  return {
    source: {
      path: repositoryRelative(repositoryRoot, path),
      bytes: contents.byteLength,
      sha256: sha256(contents),
    },
    contents,
  };
}

function parseWorkspacePatterns(contents: string): readonly string[] {
  const lines = contents.replaceAll("\r\n", "\n").split("\n");
  const header = lines.findIndex((line) => line.trim() === "packages:");
  if (header < 0)
    throw new Error("Package graph workspace manifest has no packages list.");
  const patterns: string[] = [];
  for (const line of lines.slice(header + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) break;
    const match = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (!match?.[1])
      throw new Error("Package graph workspace package entry is malformed.");
    let pattern = match[1];
    if (
      (pattern.startsWith('"') && pattern.endsWith('"')) ||
      (pattern.startsWith("'") && pattern.endsWith("'"))
    )
      pattern = pattern.slice(1, -1);
    if (
      pattern.includes("#") ||
      pattern.includes("!") ||
      pattern.includes("\\") ||
      pattern.includes("\0") ||
      isAbsolute(pattern) ||
      pattern.startsWith("/") ||
      pattern.split("/").includes("..") ||
      pattern.split("/").includes("") ||
      (pattern.includes("*") && !pattern.endsWith("/*")) ||
      pattern.slice(0, -2).includes("*")
    )
      throw new Error(`Package graph workspace pattern is unsafe: ${pattern}.`);
    patterns.push(pattern);
  }
  if (patterns.length === 0)
    throw new Error("Package graph workspace packages list is empty.");
  return [...new Set(patterns)].sort();
}

async function expandWorkspacePatterns(
  repositoryRoot: string,
  patterns: readonly string[],
): Promise<readonly string[]> {
  const directories = new Set<string>([resolve(repositoryRoot)]);
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      directories.add(resolve(repositoryRoot, pattern));
      continue;
    }
    const parentRelative = pattern.slice(0, -2);
    const parent = resolve(repositoryRoot, parentRelative);
    await assertContainedDirectory(repositoryRoot, parent);
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink())
        directories.add(resolve(parent, entry.name));
    }
  }
  return [...directories].sort((left, right) =>
    repositoryRelative(repositoryRoot, left).localeCompare(
      repositoryRelative(repositoryRoot, right),
    ),
  );
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeExports(value: unknown): unknown | null {
  if (value === undefined) return null;
  JSON.parse(canonicalJson(value));
  return value;
}

export async function buildPackageGraph(
  repositoryRoot: string,
): Promise<PackageGraphSnapshot> {
  const root = resolve(repositoryRoot);
  await assertContainedDirectory(root, root);
  const workspacePath = resolve(root, "pnpm-workspace.yaml");
  const workspace = await readRegularSource(root, workspacePath);
  const patterns = parseWorkspacePatterns(workspace.contents.toString("utf8"));
  const directories = await expandWorkspacePatterns(root, patterns);
  const rawPackages: Array<{
    readonly name: string;
    readonly root: string;
    readonly source: PackageGraphSource;
    readonly manifest: Record<string, unknown>;
  }> = [];
  const names = new Set<string>();
  for (const directory of directories) {
    await assertContainedDirectory(root, directory);
    const manifestPath = resolve(directory, "package.json");
    const manifestSource = await readRegularSource(root, manifestPath);
    const manifest = object(
      JSON.parse(manifestSource.contents.toString("utf8")) as unknown,
    );
    const name = manifest?.["name"];
    if (!manifest || typeof name !== "string" || name.trim() !== name || !name)
      throw new Error(
        `Package graph manifest has no canonical package name: ${manifestSource.source.path}.`,
      );
    if (names.has(name))
      throw new Error(`Package graph contains duplicate package name ${name}.`);
    names.add(name);
    rawPackages.push({
      name,
      root: repositoryRelative(root, directory),
      source: manifestSource.source,
      manifest,
    });
  }

  const packages = rawPackages
    .map((entry): WorkspacePackageNode => {
      const workspaceDependencies: WorkspaceDependencyEdge[] = [];
      const seenDependencies = new Set<string>();
      for (const dependencyType of DEPENDENCY_TYPES) {
        const dependencies = entry.manifest[dependencyType];
        if (dependencies === undefined) continue;
        const mapping = object(dependencies);
        if (!mapping)
          throw new Error(
            `Package graph ${entry.name} ${dependencyType} must be an object.`,
          );
        for (const [name, specifier] of Object.entries(mapping)) {
          if (typeof specifier !== "string" || specifier.length === 0)
            throw new Error(
              `Package graph ${entry.name} dependency ${name} is malformed.`,
            );
          if (!names.has(name)) continue;
          if (!specifier.startsWith("workspace:"))
            throw new Error(
              `Package graph local dependency ${entry.name} -> ${name} is not an exact workspace edge.`,
            );
          if (seenDependencies.has(name))
            throw new Error(
              `Package graph local dependency ${entry.name} -> ${name} is declared more than once.`,
            );
          seenDependencies.add(name);
          workspaceDependencies.push({ name, dependencyType, specifier });
        }
      }
      workspaceDependencies.sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.dependencyType.localeCompare(right.dependencyType),
      );
      return {
        name: entry.name,
        root: entry.root,
        manifestPath: entry.source.path,
        manifestBytes: entry.source.bytes,
        manifestSha256: entry.source.sha256,
        private: entry.manifest["private"] === true,
        exports: normalizeExports(entry.manifest["exports"]),
        workspaceDependencies,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const edges = packages
    .flatMap((entry) =>
      entry.workspaceDependencies.map((dependency): PackageGraphEdge => ({
        from: entry.name,
        to: dependency.name,
        ...dependency,
      })),
    )
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.dependencyType.localeCompare(right.dependencyType),
    );
  const unsigned = {
    schemaVersion: "1.0.0" as const,
    workspaceManifest: { ...workspace.source, patterns },
    packages,
    edges,
  };
  return {
    ...unsigned,
    sha256: sha256(canonicalJson(unsigned)),
  };
}

export function reverseDependentPackageNames(
  graph: PackageGraphSnapshot,
  packageName: string,
): readonly string[] {
  if (!graph.packages.some((entry) => entry.name === packageName))
    throw new Error(`Package graph has no package named ${packageName}.`);
  const reverse = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const current = reverse.get(edge.to) ?? new Set<string>();
    current.add(edge.from);
    reverse.set(edge.to, current);
  }
  const visited = new Set<string>();
  const pending = [...(reverse.get(packageName) ?? [])].sort();
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const dependent of [...(reverse.get(current) ?? [])].sort())
      if (!visited.has(dependent)) pending.push(dependent);
  }
  visited.delete(packageName);
  return [...visited].sort();
}

export function workspaceOwnerForPath(
  graph: PackageGraphSnapshot,
  path: string,
): WorkspacePackageNode | null {
  const normalized = safeRelativePath(path);
  const candidates = graph.packages
    .filter((entry) => entry.root !== ".")
    .sort((left, right) => right.root.length - left.root.length);
  for (const entry of candidates)
    if (normalized === entry.root || normalized.startsWith(`${entry.root}/`))
      return entry;
  if (normalized === "package.json")
    return graph.packages.find((entry) => entry.root === ".") ?? null;
  return null;
}
