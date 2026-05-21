# Changelog

All notable changes to `@continuo-terminal/react-terminal` will be
documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The package is still marked `private` in `package.json` and has not
been published to npm.

## [0.1.0] - 2026-05-22

First stamped release. React 19 + xterm 6 component, decoupled from
any specific transport via an abstract `MCPClientAdapter` interface.

### Added

- `MCPClientAdapter` interface with a generic
  `callTool<O = unknown>(name, args): Promise<O>` and an optional
  `subscribeOutput?(sessionId, onChunk): () => void` push channel.
- `Terminal` component (`<Terminal sessionId adapter cols rows
  pollIntervalMs initialSinceSeq className style onError />`) that:
  - mounts an `xterm` instance into a container `div`,
  - forwards `onData` events to `terminal.send_text`,
  - polls `terminal.read_output` (300ms default, configurable, no-overlap
    inflight guard) when no `subscribeOutput` is supplied,
  - prefers `subscribeOutput` when the adapter provides it (XOR with
    polling),
  - disposes the terminal, the fit addon, the `onData` disposable, and
    the interval / unsubscribe handle on unmount (StrictMode safe).
- `parseCallToolResult<O>(raw)` helper that reads `structuredContent`
  first, falls back to `content[0].text` JSON, and throws on neither.
- Vitest spec (`__tests__/Terminal/Terminal.spec.tsx`) running in a
  per-spec jsdom env (`// @vitest-environment jsdom`) with
  `@xterm/xterm` and `@xterm/addon-fit` mocked, covering mount /
  polling / cleanup.
- `package.json` declares `sideEffects: false` so host bundlers can
  tree-shake; consumers are responsible for `import
  '@xterm/xterm/css/xterm.css'` once at app entry.

### Notes

- React is a peer dependency (`^19.0.0`); hosts choose the runtime.
- The component does not import the MCP SDK itself; the host's
  adapter is responsible for marshalling `callTool` over whatever
  transport (Tauri invoke, Electron preload, stdio bridge, in-memory
  mock, ...) the host provides.
- Topic 06 (`feat(react-terminal)`, commit `edf47cf`) is the build
  that landed this surface; topic 09
  (`feat(examples/react-host)`, commit `3f1b409`) demonstrates the
  adapter contract with an in-memory mock.
