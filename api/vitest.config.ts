import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 65,
      },
    },
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': '../shared',
    },
  },
});
