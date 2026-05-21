# Changelog

All notable changes to `@continuo-terminal/server-node` will be
documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The package is still marked `private` in `package.json` and has not
been published to npm.

## [0.1.0] - 2026-05-22

First stamped release. Implements the seven `terminal.*` MCP tools
declared by `@continuo-terminal/protocol` over a stdio MCP server.

### Added

- `Server` factory wiring `@modelcontextprotocol/sdk`
  `StdioServerTransport` with the seven `terminal.*` tools registered
  through `zod-to-json-schema` for `tools/list`.
- `SessionManager` class managing `node-pty` PTY sessions, including:
  - byte-bounded ring buffer (4 MiB per session) with monotonic seq.
  - idempotent `kill` and `dispose()` lifecycle.
  - `onExit` listener cleaning up listeners + session state.
- Seven factory-pattern handlers
  (`make{CreateSession,ListSessions,SendInput,SendText,PressKey,ReadOutput,Kill}Handler`)
  that:
  - validate input through the matching protocol schema,
  - return MCP `CallToolResult` with `structuredContent` + a JSON
    `content[0].text` fallback,
  - surface validation and runtime failures via `formatError` +
    `isError: true`.
- `formatError` helper that produces concise, single-line messages for
  Zod errors and standard `Error`s.
- Strict TypeScript with NodeNext module resolution; source-only
  package (no `dist/`), runtime via `tsx`.
- Eight Vitest specs (seven per-tool BDD specs plus a real
  `StdioClientTransport` integration spec exercising
  `initialize` + `tools/list` + `tools/call list_sessions`).

### Notes

- `node-pty` prebuilt binaries occasionally fail to load on macOS
  (Gatekeeper / quarantine). Run `pnpm rebuild node-pty
  --build-from-source` if `posix_spawnp failed.` shows up; see
  `docs/getting-started.md` for the troubleshooting note.
- Topic 04 (`feat(server-node)`, commit `74fa5a7`) is the build that
  landed this surface.
