import { createHash } from "node:crypto";

export type OciControllerSourceMode = "committed-head" | "frozen-index";

export interface OciControllerSourceIdentity {
  readonly mode: OciControllerSourceMode;
  readonly head: string;
  readonly headTree: string;
  readonly candidateTree: string;
  readonly stagedPathCount: number;
  readonly stagedPathsSha256: string;
}

export type RunGitForOciSource = (args: readonly string[]) => Promise<string>;

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function gitObjectId(value: string, label: string): string {
  assertion(
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value),
    `${label} is not a Git object ID.`,
  );
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function captureOciControllerSource(
  runGit: RunGitForOciSource,
): Promise<OciControllerSourceIdentity> {
  const unstagedPaths = await runGit(["diff", "--no-ext-diff", "--name-only"]);
  assertion(
    unstagedPaths === "",
    "The OCI matrix requires every tracked candidate change to be staged and frozen.",
  );

  const stagedPaths = await runGit([
    "diff",
    "--cached",
    "--no-ext-diff",
    "--name-only",
  ]);
  const head = gitObjectId(await runGit(["rev-parse", "HEAD"]), "OCI HEAD");
  const headTree = gitObjectId(
    await runGit(["rev-parse", "HEAD^{tree}"]),
    "OCI HEAD tree",
  );
  const candidateTree = gitObjectId(
    await runGit(["write-tree"]),
    "OCI candidate tree",
  );
  const stagedPathCount = stagedPaths.split(/\r?\n/).filter(Boolean).length;
  const mode: OciControllerSourceMode =
    stagedPathCount === 0 ? "committed-head" : "frozen-index";

  assertion(
    mode !== "committed-head" || candidateTree === headTree,
    "A clean OCI index did not reproduce the committed HEAD tree.",
  );

  return {
    mode,
    head,
    headTree,
    candidateTree,
    stagedPathCount,
    stagedPathsSha256: sha256(stagedPaths),
  };
}
