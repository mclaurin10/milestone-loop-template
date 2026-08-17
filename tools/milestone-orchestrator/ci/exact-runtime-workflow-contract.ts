import { format } from "prettier";

export const EXACT_RUNTIME_WORKFLOW_PATH =
  ".github/workflows/exact-runtime-ci.yml" as const;

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeRegularExpression(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function jobBlock(source: string, id: string): string {
  const expression = new RegExp(
    `^  ${escapeRegularExpression(id)}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\n|(?![\\s\\S]))`,
    "mu",
  );
  const match = expression.exec(source);
  assertion(match?.[1] !== undefined, `Workflow is missing the ${id} job.`);
  return match[1];
}

function exactCount(source: string, needle: string, expected: number): void {
  const observed = source.split(needle).length - 1;
  assertion(
    observed === expected,
    `Workflow must contain ${JSON.stringify(needle)} exactly ${expected} times; observed ${observed}.`,
  );
}

function includes(source: string, needle: string, label: string): void {
  assertion(source.includes(needle), `Workflow is missing ${label}.`);
}

function assertCompleteHistoryCheckout(source: string, jobId: string): void {
  exactCount(source, "          fetch-depth: 0", 1);
  assertion(
    !source.includes("          fetch-depth: 1"),
    `${jobId} must not use a depth-one checkout because commissioned authority is Git-anchored.`,
  );
}

function assertIndependentJob(source: string, jobId: string): void {
  assertion(
    !/^ {4}needs:/mu.test(source) && !/\bneeds(?:\.|\[)/u.test(source),
    `${jobId} must remain independently schedulable from other diagnostic jobs.`,
  );
}

export async function validateExactRuntimeWorkflow(
  source: string,
): Promise<void> {
  const formatted = await format(source, { parser: "yaml" });
  assertion(
    source === formatted,
    "Workflow must be parseable, formatted YAML.",
  );
  includes(source, "  pull_request:\n", "pull-request trigger");
  includes(source, "  push:\n", "push trigger");
  includes(source, "      - master\n", "master push branch");
  includes(source, "  workflow_dispatch:\n", "manual trigger");
  includes(source, "permissions:\n  contents: read\n", "read-only permissions");
  assertion(
    !source.includes("continue-on-error"),
    "Workflow may not weaken a required job with continue-on-error.",
  );
  assertion(
    !/\bpnpm (?:run )?verify(?:\s|$)/mu.test(source),
    "Workflow may not run source no-argument verification.",
  );
  assertion(
    !source.includes("loop:template:prove"),
    "Workflow may not rerun the completed WP4d proof.",
  );

  exactCount(source, '  NODE_VERSION: "24.18.0"', 1);
  exactCount(source, '  PNPM_VERSION: "11.15.1"', 1);
  exactCount(source, '          node-version: "24.18.0"', 3);
  exactCount(source, "          corepack prepare pnpm@11.15.1 --activate", 3);
  exactCount(
    source,
    "node tools/milestone-orchestrator/ci/assert-exact-toolchain.mjs",
    3,
  );
  exactCount(
    source,
    "uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
    3,
  );
  exactCount(
    source,
    "uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    3,
  );
  exactCount(
    source,
    "uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    3,
  );
  const actionReferences = [...source.matchAll(/^\s*uses:\s+(\S+)/gmu)].map(
    (match) => match[1] ?? "",
  );
  assertion(
    actionReferences.length === 9,
    "Workflow action inventory drifted.",
  );
  assertion(
    actionReferences.every((reference) => /@[0-9a-f]{40}$/u.test(reference)),
    "Every third-party action must be pinned to a full commit SHA.",
  );

  const controller = jobBlock(source, "controller");
  assertCompleteHistoryCheckout(controller, "controller");
  includes(controller, "runner: ubuntu-24.04", "Linux controller runner");
  includes(controller, "runner: windows-2022", "Windows controller runner");
  for (const command of [
    "pnpm test:invariants",
    "pnpm test:orchestrator",
    "pnpm test:unit",
    "pnpm typecheck",
    "pnpm lint",
    "pnpm format:check",
  ])
    exactCount(controller, `run: ${command}`, 1);
  const controllerEvidenceRoots = [
    ...controller.matchAll(/LOOP_VERIFY_COMMAND_ARTIFACT_DIR:\s+([^\r\n]+)/gu),
  ].map((match) => match[1]?.trim() ?? "");
  assertion(
    controllerEvidenceRoots.length === 6 &&
      new Set(controllerEvidenceRoots).size === 6,
    "Controller commands require six unique evidence roots.",
  );
  assertion(
    controllerEvidenceRoots.every((path) =>
      path.startsWith("artifacts/ci/controller-${{ matrix.platform }}/"),
    ),
    "Controller evidence roots must be platform-specific.",
  );
  includes(
    controller,
    "path: artifacts/ci/controller-${{ matrix.platform }}",
    "controller evidence upload",
  );

  const freshAdopter = jobBlock(source, "fresh-adopter-smoke");
  assertCompleteHistoryCheckout(freshAdopter, "fresh-adopter-smoke");
  assertIndependentJob(freshAdopter, "fresh-adopter-smoke");
  includes(freshAdopter, "runner: ubuntu-24.04", "Linux adopter runner");
  includes(freshAdopter, "runner: windows-2022", "Windows adopter runner");
  includes(
    freshAdopter,
    "pnpm exec tsx tools/milestone-orchestrator/ci/fresh-adopter-smoke.ts",
    "real fresh-adopter smoke coordinator",
  );
  includes(
    freshAdopter,
    "--definition fixtures/fresh-adopter/definition.json",
    "fresh-adopter definition",
  );
  includes(
    freshAdopter,
    "path: artifacts/ci/fresh-adopter-${{ matrix.platform }}",
    "fresh-adopter evidence upload",
  );

  const trustedContainer = jobBlock(source, "trusted-container");
  assertCompleteHistoryCheckout(trustedContainer, "trusted-container");
  assertIndependentJob(trustedContainer, "trusted-container");
  includes(
    trustedContainer,
    "runs-on: ubuntu-24.04",
    "Linux-only trusted-container runner",
  );
  assertion(
    !trustedContainer.includes("windows") &&
      !trustedContainer.includes("strategy:") &&
      !trustedContainer.includes("matrix:"),
    "Trusted-container execution must remain Linux-only.",
  );
  includes(trustedContainer, "docker version >", "real Docker version probe");
  includes(trustedContainer, "docker info >", "real Docker daemon probe");
  includes(
    trustedContainer,
    "run: pnpm test:oci-container -- --output artifacts/ci/trusted-container/matrix",
    "complete real trusted-container matrix",
  );
  includes(
    trustedContainer,
    "path: artifacts/ci/trusted-container",
    "trusted-container evidence upload",
  );
}
