import { performance } from "node:perf_hooks";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import ts from "typescript";

export const WORKSPACE_TYPECHECK_CONFIGS = [
  "tools/milestone-orchestrator/tsconfig.json",
  "tsconfig.tools.json",
];

function diagnosticHost(repositoryRoot) {
  return {
    getCanonicalFileName: (path) => path,
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => "\n",
  };
}

function ensureCacheDirectory(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const rootMetadata = lstatSync(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error(`Typecheck repository root is unsafe: ${root}.`);
  let parent = root;
  for (const name of ["artifacts", "typecheck-cache", ts.version]) {
    const path = resolve(parent, name);
    if (!existsSync(path)) mkdirSync(path);
    const metadata = lstatSync(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(`Typecheck cache directory is unsafe: ${path}.`);
    parent = path;
  }
  return parent;
}

export function runWorkspaceTypecheck(repositoryRoot) {
  const started = performance.now();
  const sourceFileCache = new Map();
  const cacheDirectory = ensureCacheDirectory(repositoryRoot);
  const configs = [];
  for (const configuredPath of WORKSPACE_TYPECHECK_CONFIGS) {
    const configPath = resolve(repositoryRoot, configuredPath);
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    if (loaded.error)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(
          [loaded.error],
          diagnosticHost(repositoryRoot),
        ),
      );
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      dirname(configPath),
      undefined,
      configPath,
    );
    if (parsed.errors.length > 0)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(
          parsed.errors,
          diagnosticHost(repositoryRoot),
        ),
      );
    const cachePath = resolve(
      cacheDirectory,
      `${configuredPath.replaceAll(/[^A-Za-z0-9._-]/g, "-")}.tsbuildinfo`,
    );
    const options = {
      ...parsed.options,
      incremental: true,
      tsBuildInfoFile: cachePath,
    };
    const host = ts.createIncrementalCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) => {
      const cacheKey = `${fileName}|${languageVersion}`;
      if (!shouldCreateNewSourceFile && sourceFileCache.has(cacheKey))
        return sourceFileCache.get(cacheKey);
      const sourceFile = originalGetSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
      if (sourceFile && !shouldCreateNewSourceFile)
        sourceFileCache.set(cacheKey, sourceFile);
      return sourceFile;
    };
    const program = ts.createIncrementalProgram({
      rootNames: parsed.fileNames,
      options,
      projectReferences: parsed.projectReferences,
      host,
    });
    const diagnostics = [
      ...program.getConfigFileParsingDiagnostics(),
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics(),
    ];
    const emit = program.emit();
    diagnostics.push(...emit.diagnostics);
    if (diagnostics.length > 0)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(
          diagnostics,
          diagnosticHost(repositoryRoot),
        ),
      );
    configs.push({
      path: configuredPath,
      rootFileCount: parsed.fileNames.length,
      sourceFileCount: program.getProgram().getSourceFiles().length,
      cachePath: relative(repositoryRoot, cachePath).replaceAll("\\", "/"),
    });
  }
  return {
    status: "PASS",
    execution: "single-process-typescript-incremental-compiler-api",
    compilerVersion: ts.version,
    configCount: configs.length,
    cachedSourceFileCount: sourceFileCache.size,
    durationMs: Math.round(performance.now() - started),
    configs,
  };
}
