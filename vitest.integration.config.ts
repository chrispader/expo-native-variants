import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    hookTimeout: 120_000,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
