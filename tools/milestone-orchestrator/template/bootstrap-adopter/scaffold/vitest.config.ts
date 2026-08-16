import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.spec.mjs", "app/**/*.test.ts"],
    passWithNoTests: false,
    reporters: ["default"],
  },
});
