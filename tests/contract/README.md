# contract

Cross-package contract tests for the monorepo.

## What runs here

- [`cross-package-imports.spec.ts`](./cross-package-imports.spec.ts) —
  imports `@continuo-terminal/protocol`, `server-node` and `react-terminal`
  by package name and checks their minimal stable public surface:
  tool name constants, key bytes, Zod schemas, `SessionManager`, handler
  factories, the `Terminal` React component and `parseCallToolResult`.
  Importing by package name exercises the real `exports` maps and barrel
  files. No PTY is spawned and no React tree is rendered.
- [`example-mock-adapter.spec.ts`](./example-mock-adapter.spec.ts) — parses
  `minimal-react-host`'s mock adapter outputs through the real Zod schemas so
  the example cannot drift from the wire contract.
- [`package-files-exist.spec.ts`](./package-files-exist.spec.ts) — every path
  listed in a workspace package's `files` array exists on disk.

## How it integrates

These specs run as part of the root `pnpm test` and also through the
dedicated `vitest.contract.config.ts` via `pnpm verify:contract` (which CI
runs together with `typecheck:contract`).

## What does *not* belong here

- Application behavior tests (those live under each package's
  `__tests__/` directory).
- Real PTY / spawn / handshake tests (see `examples/standalone-cli`
  and `packages/server-node/__tests__/server-integration`).
