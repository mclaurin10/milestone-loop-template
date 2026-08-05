import {
  CONTROLLER_TRUST_ROOT_SUBTREES,
  REQUIRED_PROTECTED_PATHS,
  type OrchestratorConfig,
  type ProtectedFileRecord,
  type VerificationManifest,
} from "./contracts.js";

export function casefoldPathKey(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

export function protectedSubtreeContaining(path: string): string | null {
  const folded = casefoldPathKey(path);
  for (const subtree of CONTROLLER_TRUST_ROOT_SUBTREES) {
    const prefix = casefoldPathKey(subtree);
    if (folded === prefix || folded.startsWith(`${prefix}/`)) return subtree;
  }
  return null;
}

function normalizeProtectedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function assertSafeProtectedPath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split("/").some((segment) => segment === "..") ||
    /[*?\r\n\0]/.test(path)
  )
    throw new Error(`Protected path is unsafe or non-literal: ${path}.`);
}

export function buildCanonicalProtectedSet(
  config: OrchestratorConfig,
  extras: readonly string[] = [],
): readonly string[] {
  const union = [
    ...REQUIRED_PROTECTED_PATHS,
    config.project.authorityFile,
    ...config.protectedPaths,
    ...extras,
  ].map(normalizeProtectedPath);
  for (const path of union) assertSafeProtectedPath(path);
  return [...new Set(union)].sort();
}

export function enforcementProtectedPatterns(
  config: OrchestratorConfig,
  protectedFiles: readonly ProtectedFileRecord[],
): readonly string[] {
  return buildCanonicalProtectedSet(
    config,
    protectedFiles.map((file) => file.path),
  );
}

export function assertManifestProtectedPathsCovered(
  manifest: VerificationManifest,
  canonical: readonly string[],
): void {
  const covered = new Set(canonical.map(casefoldPathKey));
  const missing = manifest.requiredProtectedPaths.filter(
    (path) => !covered.has(casefoldPathKey(path)),
  );
  if (missing.length > 0)
    throw new Error(
      `The verification manifest requires protected paths the controller cannot enforce: [${missing.join(", ")}]. Add them to protectedPaths in the orchestrator configuration or correct the manifest.`,
    );
}
