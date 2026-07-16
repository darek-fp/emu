import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts'],
    exclude: ['node_modules', 'dist', '.astro'],
  },
});
