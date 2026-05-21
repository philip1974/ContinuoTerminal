# continuo-terminal

The terminal MCP engine extracted from
[philip1974/Continuo](https://github.com/philip1974/Continuo), packaged as a
pnpm monorepo of host-agnostic libraries plus an example CLI.

The repo ships five active packages on top of a Zod-defined protocol layer:
a Node stdio MCP server with real PTY sessions, a React component for
terminal UIs, a CLI demo that drives the server end-to-end, and a base CI
workflow. See [`docs/architecture.md`](./docs/architecture.md) for the
layer diagram and dependency graph.

## Packages

| Path | Name | Purpose | Status |
|---|---|---|---|
| `packages/protocol` | `@continuo-terminal/protocol` | Zod schemas + 7 `terminal.*` MCP tool name constants + `KEY_BYTES` | done |
| `packages/server-node` | `@continuo-terminal/server-node` | Standalone Node stdio MCP server (StdioServerTransport + 7 handlers + node-pty PTY runtime) | done |
| `packages/react-terminal` | `@continuo-terminal/react-terminal` | React 19 + xterm 6 component, transport injected via `MCPClientAdapter` | done |
| `examples/standalone-cli` | `@continuo-terminal/example-standalone-cli` | Node CLI demoing server-node over stdio | done |
| `crates/server-rust`, `examples/{minimal-react-host, tauri-sidecar}`, `packages/react-terminal` real-render host | — | future topics | placeholder |

## Quick start

Requires Node 24 and pnpm 9 (see
[`docs/getting-started.md`](./docs/getting-started.md) for setup and macOS
`node-pty` notes).

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm exec tsx examples/standalone-cli/src/cli.ts demo
```

The `demo` subcommand spawns a `server-node` child, opens a PTY session,
sends `echo hello`, reads the captured output, and kills the session. A
successful run prints `session_id=…`, `captured: echo hello`, and
`demo: SUCCESS`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs `pnpm install
--frozen-lockfile`, `pnpm typecheck`, and `pnpm test` on `ubuntu-latest` and
`macos-latest` with Node 24 and pnpm 9. It fires on every push and on pull
requests into `main`.

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — layer diagram, package
  dependency graph, runtime flow.
- [`docs/getting-started.md`](./docs/getting-started.md) — prerequisites,
  install, demo, troubleshooting.
- Per-package READMEs under `packages/*/README.md` and
  `examples/*/README.md`.

The repository is built incrementally; each commit covers one bounded
topic. `git log --oneline` lists the full history.

## Relation to Continuo

This project is the planned extraction of the terminal-MCP engine from
[philip1974/Continuo](https://github.com/philip1974/Continuo). It will be
released as a separate package once the API surface is frozen.

## License

MIT — see [`LICENSE`](./LICENSE).
