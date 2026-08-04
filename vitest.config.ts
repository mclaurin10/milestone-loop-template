import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/headless/**/*.test.ts",
      "tools/milestone-orchestrator/**/*.test.ts",
      "tools/**/*.test.mjs",
    ],
    passWithNoTests: false,
    reporters: ["default"],
  },
});
