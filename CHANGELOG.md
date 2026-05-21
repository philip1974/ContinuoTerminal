# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Rounds 3-8 of codex independent audits surfaced cumulative fixes
across `@continuo-terminal/server-node` and
`@continuo-terminal/react-terminal`; see per-package changelogs for
details. Repo-level changes:

### Changed
- Docs (root README, `docs/architecture.md`, `docs/getting-started.md`,
  `packages/protocol/README.md`, `packages/server-node/README.md`)
  refreshed to reflect five active workspace packages, the actual
  v0.1.0 surface, and the lifecycle / error-envelope contracts
  introduced after stamping.

### Added
- CI now runs `pnpm --filter @continuo-terminal/example-minimal-react-host
  build` as a regression gate so Vite production-build breakage
  blocks merge (round-4 P1 — typecheck + vitest do not exercise CSS
  bundling, `exports` resolution, or rolldown chunking).
- `tests/contract/cross-package-imports.spec.ts` now imports each
  package by its workspace name (`@continuo-terminal/protocol`,
  `/server-node`, `/react-terminal`) instead of via deep `src/index`
  paths, so a broken `package.json#exports` or workspace alias fails
  the contract test (round-3 P2).
