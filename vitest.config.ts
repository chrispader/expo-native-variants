import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
    },
    exclude: ['tests/integration/**'],
    include: ['tests/**/*.test.ts'],
  },
});
