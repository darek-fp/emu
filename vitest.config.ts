import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    include: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*.ts"],
    // By default skip long-running integration tests. Run on-demand with the `test:integration` script.
    exclude: ["node_modules", "dist", ".astro", "tests/integration/**"],
  },
});
