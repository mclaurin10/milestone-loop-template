import { format } from "prettier";

export const EXACT_RUNTIME_WORKFLOW_PATH =
  ".github/workflows/exact-runtime-ci.yml" as const;

export const EXACT_RUNTIME_ACTION_PINS = [
  {
    name: "checkout",
    repository: "actions/checkout",
    release: "v7.0.1",
    sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
  },
  {
    name: "setup-node",
    repository: "actions/setup-node",
    release: "v7.0.0",
    sha: "820762786026740c76f36085b0efc47a31fe5020",
  },
  {
    name: "upload-artifact",
    repository: "actions/upload-artifact",
    release: "v7.0.1",
    sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  },
] as const;

const LEGACY_NODE20_ACTION_SHAS = [
  "11bd71901bbe5b1630ceea73d27597364c9af683",
  "49933ea5288caeca8642d1e84afbd3f7d6820020",
  "ea165f8d65b6e75b540449e92b4886f43607fa02",
] as const;

const OCI_STORE_HYDRATION_SCRIPT = [
  "run: |",
  '          fixture_fetch_dir="$(mktemp -d)"',
  "          trap 'rm -rf \"$fixture_fetch_dir\"' EXIT",
  '          git archive HEAD:fixtures/oci-candidate | tar -x -C "$fixture_fetch_dir"',
  '          pnpm --dir "$fixture_fetch_dir" --ignore-workspace fetch --frozen-lockfile',
].join("\n");
const OCI_MATRIX_COMMAND =
  "pnpm test:oci-container --output artifacts/ci/trusted-container/matrix";

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
  exactCount(source, "          persist-credentials: false", 1);
  assertion(
    !source.includes("          fetch-depth: 1"),
    `${jobId} must not use a depth-one checkout because commissioned authority is Git-anchored.`,
  );
}

function actionReference(
  pin: (typeof EXACT_RUNTIME_ACTION_PINS)[number],
): string {
  return `${pin.repository}@${pin.sha}`;
}

function assertJobActionInventory(source: string, jobId: string): void {
  const references = [...source.matchAll(/^\s*uses:\s+(\S+)/gmu)].map(
    (match) => match[1] ?? "",
  );
  assertion(
    references.length === EXACT_RUNTIME_ACTION_PINS.length,
    `${jobId} must contain exactly one checkout, setup-node, and upload-artifact action.`,
  );
  for (const pin of EXACT_RUNTIME_ACTION_PINS)
    exactCount(source, `uses: ${actionReference(pin)}`, 1);
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
  for (const pin of EXACT_RUNTIME_ACTION_PINS) {
    exactCount(source, `uses: ${actionReference(pin)} # ${pin.release}`, 3);
    assertion(
      !source.includes(`${pin.repository}@${pin.release}`),
      `${pin.repository} may not use its mutable release tag.`,
    );
  }
  for (const sha of LEGACY_NODE20_ACTION_SHAS)
    assertion(
      !source.includes(sha),
      `Workflow retains legacy Node 20 action SHA ${sha}.`,
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
  const allowedReferences = new Set<string>(
    EXACT_RUNTIME_ACTION_PINS.map(actionReference),
  );
  assertion(
    actionReferences.every((reference) => allowedReferences.has(reference)),
    "Workflow contains a non-allowlisted action reference.",
  );
  exactCount(source, "        if: always()", 3);
  exactCount(source, "          if-no-files-found: error", 3);

  const controller = jobBlock(source, "controller");
  assertCompleteHistoryCheckout(controller, "controller");
  assertJobActionInventory(controller, "controller");
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
  assertJobActionInventory(freshAdopter, "fresh-adopter-smoke");
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
  assertJobActionInventory(trustedContainer, "trusted-container");
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
  exactCount(trustedContainer, OCI_STORE_HYDRATION_SCRIPT, 1);
  includes(
    trustedContainer,
    `run: ${OCI_MATRIX_COMMAND}`,
    "complete real trusted-container matrix",
  );
  const sourceInstallIndex = trustedContainer.indexOf(
    "run: pnpm install --frozen-lockfile --package-import-method=copy",
  );
  const storeHydrationIndex = trustedContainer.indexOf(
    OCI_STORE_HYDRATION_SCRIPT,
  );
  const matrixIndex = trustedContainer.indexOf(`run: ${OCI_MATRIX_COMMAND}`);
  assertion(
    sourceInstallIndex >= 0 &&
      sourceInstallIndex < storeHydrationIndex &&
      storeHydrationIndex < matrixIndex,
    "Trusted-container fixture-store hydration must run after source install and before the real matrix.",
  );
  includes(
    trustedContainer,
    "path: artifacts/ci/trusted-container",
    "trusted-container evidence upload",
  );
}
