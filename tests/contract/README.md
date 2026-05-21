# contract

Cross-package contract tests for the monorepo.

## What runs here

- [`cross-package-imports.spec.ts`](./cross-package-imports.spec.ts) —
  verifies each active workspace package exposes its minimal stable
  public surface: tool name constants, key bytes, Zod schemas,
  `SessionManager` class, handler factories, the `Terminal` React
  component, and `parseCallToolResult`. The spec uses runtime `typeof`
  / `.parse` checks; no PTY is spawned and no React tree is rendered.

  The spec imports each package via its `src/index.ts` source entry
  (relative paths from `tests/contract/`) so it tests the in-tree code
  rather than a node_modules-hoisted copy. This is intentional — the
  contract is "this monorepo's source ships these exports", not "the
  hoisted version does".

## How it integrates

Vitest's default discovery picks up `tests/**/*.spec.ts`, so the spec
runs as part of the root `pnpm test` script alongside the per-package
test suites — no additional vitest config required.

## What does *not* belong here

- Application behavior tests (those live under each package's
  `__tests__/` directory).
- Real PTY / spawn / handshake tests (see `examples/standalone-cli`
  and `packages/server-node/__tests__/server-integration`).
