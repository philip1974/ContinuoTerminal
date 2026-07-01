import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both the per-package contract-tests AND the repo-level cross-package
    // contract suite under tests/contract/. The latter (cross-package imports,
    // example mock-adapter schema conformance, package.json `files` existence)
    // was previously omitted, so `verify:contract` — the dedicated contract gate
    // (also the CI step) — silently skipped it and could report false-green.
    include: [
      'packages/*/contract-tests/**/*.contract.spec.ts',
      'tests/contract/**/*.spec.ts',
    ],
    name: 'contract',
    environment: 'node',
    globals: false,
    passWithNoTests: false,
  },
});
