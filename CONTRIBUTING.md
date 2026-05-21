# Contributing to continuo-terminal

Thanks for your interest in `continuo-terminal`. This document covers
how to set up the monorepo locally, the conventions PRs are expected to
follow, and what the review path looks like.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md).
By participating you agree to abide by its terms.

## Prerequisites

- **Node.js 24** (matches every package's `engines.node`).
- **pnpm 9** (declared in root `packageManager`). Enable through
  [Corepack](https://nodejs.org/api/corepack.html):
  `corepack enable && corepack prepare pnpm@9 --activate`.
- **macOS or Linux**. Windows is currently unsupported (`node-pty`
  Windows codepath differs and CI runs Ubuntu + macOS only).
- See [`docs/getting-started.md`](./docs/getting-started.md) for the
  full install / typecheck / test walkthrough and the macOS
  `pnpm rebuild node-pty` troubleshooting note.

## Monorepo layout

The repository is a pnpm workspace covering `packages/*` and
`examples/*`. See [`docs/architecture.md`](./docs/architecture.md) for
the layer diagram and dependency graph. In short:

- `packages/protocol` — Zod schemas + MCP tool name constants
- `packages/server-node` — stdio MCP server with node-pty PTY sessions
- `packages/react-terminal` — React + xterm component with an abstract
  `MCPClientAdapter` interface
- `examples/standalone-cli` — Node CLI demoing the server over stdio
- `examples/minimal-react-host` — Vite + React host using a mock adapter
- `tests/contract` — cross-package public-surface contract tests
- `.github/workflows/ci.yml` — Ubuntu + macOS CI on Node 24

## Local workflow

```sh
# clone & install
git clone https://github.com/philip1974/ContinuoTerminal.git
cd ContinuoTerminal
pnpm install

# typecheck + test the whole workspace
pnpm typecheck
pnpm test

# run the standalone CLI end-to-end demo
pnpm exec tsx examples/standalone-cli/src/cli.ts demo
```

Every PR must keep `pnpm typecheck` and `pnpm test` green on both
runners that CI exercises (`ubuntu-latest`, `macos-latest`, Node 24).

## Branching

- Cut feature branches from `main`.
- Push your branch and open a pull request into `main`.
- CI fires on every push and on PRs into `main` (see
  [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/).
Use one of: `feat`, `fix`, `docs`, `test`, `ci`, `chore`, `refactor`,
`perf`, `build`, `style`. Scope by package or area when helpful, e.g.:

- `feat(server-node): add raw input mode`
- `fix(react-terminal): unsubscribe on unmount before clearing ref`
- `docs(architecture): document host adapter contract`

Keep the subject under 72 chars; put rationale and references in the
body. Reference the audit trail under `.claude/dev-loop/<NN-slug>/` if
the change came out of that workflow.

## Pull request expectations

- Fill in the PR template (Summary / Test plan / Refs).
- Link relevant issues with `Closes #<n>` / `Refs #<n>`.
- Keep PRs scoped — prefer multiple small PRs over one large change.
- New behavior comes with new tests (unit under
  `packages/<name>/__tests__/` or examples, cross-package contract
  under `tests/contract/`).
- Do not modify any file under `.claude/dev-loop/` (audit trail).
- Do not commit `dist/`, `node_modules/`, or other generated paths
  (root `.gitignore` already covers them).

## Code style

- TypeScript `strict: true` everywhere.
- Source-only TS for runtime packages (no `dist/` checked in); we
  rely on `tsx` / Vite to transform at runtime / build time.
- No emojis in source code or commit messages.
- No silent introduction of large dependencies; prefer node-builtins
  and small focused packages.

## What's safe to change

- Production package code under `packages/*/src/` and tests under
  `packages/*/__tests__/`.
- Example apps under `examples/*`.
- Workspace-level docs in `docs/` and the root `README.md`.
- CI workflow in `.github/workflows/ci.yml`.

## What needs a heads up

- Anything that breaks the public surface tested in
  `tests/contract/cross-package-imports.spec.ts` — the contract spec
  exists precisely to surface those changes intentionally.
- The `MCPClientAdapter` interface in `packages/react-terminal/src/types.ts`
  — host integrations rely on it being stable.
- The protocol Zod schemas in `packages/protocol/src/schemas.ts` —
  schema-breaking changes ripple through every layer.

When in doubt, open an issue first and we can scope it before code lands.

## Questions

Open a GitHub issue using the `feature_request` template, or the
`bug_report` template if something is broken. There is no separate
mailing list or chat at this time.
