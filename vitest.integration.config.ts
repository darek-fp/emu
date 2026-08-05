import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".astro"],
  },
});
