# tests

Top-level test suites for the `continuo-terminal` monorepo. Specs are
picked up automatically by the root `pnpm test` script through Vitest's
default discovery (`**/*.spec.ts`).

- [`contract/`](./contract) — cross-package contract tests verifying
  that each workspace package exposes its minimal stable public
  surface.
- [`e2e/`](./e2e) — placeholder for cross-cutting end-to-end flows.
  Existing PTY / MCP handshake coverage lives next to the code that
  ships it (see [`e2e/README.md`](./e2e/README.md)).

Per-package unit and integration tests live under each package's
`__tests__/` directory (`packages/*/__tests__/`,
`examples/*/__tests__/`).
