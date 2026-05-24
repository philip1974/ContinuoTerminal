import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/contract-tests/**/*.contract.spec.ts'],
    name: 'contract',
    environment: 'node',
    globals: false,
    passWithNoTests: false,
  },
});
