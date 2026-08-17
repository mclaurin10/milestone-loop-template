import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXACT_RUNTIME_WORKFLOW_PATH,
  validateExactRuntimeWorkflow,
} from "../ci/exact-runtime-workflow-contract.js";

const workflowPath = resolve(
  import.meta.dirname,
  "../../..",
  EXACT_RUNTIME_WORKFLOW_PATH,
);

describe("exact-runtime CI workflow contract", () => {
  it("pins the cross-platform controller, fresh-adopter, and real OCI paths", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    await expect(
      validateExactRuntimeWorkflow(workflow),
    ).resolves.toBeUndefined();
  });

  it("rejects weakened runtime, platform, command, evidence, and OCI boundaries", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const mutations = [
      workflow.replace('node-version: "24.18.0"', 'node-version: "24"'),
      workflow.replace("runner: windows-2022", "runner: ubuntu-24.04"),
      workflow.replace("run: pnpm test:orchestrator", "run: pnpm test:unit"),
      workflow.replace(
        "controller-${{ matrix.platform }}/format",
        "controller-${{ matrix.platform }}/lint",
      ),
      workflow.replace(
        "run: pnpm test:oci-container --output artifacts/ci/trusted-container/matrix",
        "run: echo mock-container-pass",
      ),
      workflow.replace(
        "run: pnpm test:oci-container --output artifacts/ci/trusted-container/matrix",
        "run: pnpm test:oci-container -- --output artifacts/ci/trusted-container/matrix",
      ),
      `${workflow}\n# pnpm verify\n`,
    ];
    for (const mutation of mutations)
      await expect(validateExactRuntimeWorkflow(mutation)).rejects.toThrow();
  });

  it("requires complete Git history and independently scheduled diagnostic jobs", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const mutations = [
      workflow.replace("          fetch-depth: 0", "          fetch-depth: 1"),
      workflow.replace("          fetch-depth: 0\n", ""),
      workflow.replace(
        "  fresh-adopter-smoke:\n",
        "  fresh-adopter-smoke:\n    needs: controller\n",
      ),
      workflow.replace(
        "  trusted-container:\n",
        "  trusted-container:\n    needs: controller\n",
      ),
    ];
    for (const mutation of mutations)
      await expect(validateExactRuntimeWorkflow(mutation)).rejects.toThrow();
  });

  it("binds exact OCI fixture-store hydration before container execution", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const hydration = [
      "run: |",
      '          fixture_fetch_dir="$(mktemp -d)"',
      "          trap 'rm -rf \"$fixture_fetch_dir\"' EXIT",
      '          git archive HEAD:fixtures/oci-candidate | tar -x -C "$fixture_fetch_dir"',
      '          pnpm --dir "$fixture_fetch_dir" --ignore-workspace fetch --frozen-lockfile',
    ].join("\n");
    const matrix =
      "pnpm test:oci-container --output artifacts/ci/trusted-container/matrix";
    const hydrationStep = `      - name: Hydrate exact OCI fixture store\n        ${hydration}\n`;
    const matrixStep = `      - name: Run real trusted-container matrix\n        run: ${matrix}\n`;
    const mutations = [
      workflow.replace(hydrationStep, ""),
      workflow.replace(
        "git archive HEAD:fixtures/oci-candidate",
        "git archive HEAD:fixtures/other",
      ),
      workflow.replace(
        'pnpm --dir "$fixture_fetch_dir" --ignore-workspace',
        "pnpm --dir . --ignore-workspace",
      ),
      workflow.replace(
        'pnpm --dir "$fixture_fetch_dir" --ignore-workspace fetch',
        'pnpm --dir "$fixture_fetch_dir" fetch',
      ),
      workflow.replace(" fetch --frozen-lockfile", " fetch"),
      workflow
        .replace(hydrationStep, "")
        .replace(matrixStep, `${matrixStep}${hydrationStep}`),
    ];
    for (const mutation of mutations)
      await expect(validateExactRuntimeWorkflow(mutation)).rejects.toThrow();
  });
});
