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
        "run: pnpm test:oci-container -- --output artifacts/ci/trusted-container/matrix",
        "run: echo mock-container-pass",
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
});
