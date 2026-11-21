# Getting started

This guide covers local development of the `continuo-terminal` monorepo.

## Prerequisites

- **Node.js 24** (matches `engines.node` in every package). Use
  [`nvm`](https://github.com/nvm-sh/nvm) or
  [`fnm`](https://github.com/Schniz/fnm) to switch versions.
- **pnpm 9** (declared in root `packageManager`). Enable via
  [Corepack](https://nodejs.org/api/corepack.html):
  `corepack enable && corepack prepare pnpm@9 --activate`.
- **macOS or Linux**. Windows is not supported in this iteration; the
  `node-pty` Windows codepath differs and CI runs only on `ubuntu-latest`
  and `macos-latest`.
- For the `examples/standalone-cli` demo and any `terminal.create_session`
  calls: a working shell (`/bin/zsh` or `/bin/bash`) and Xcode Command Line
  Tools on macOS (`xcode-select --install`) — required because `node-pty`
  uses a `spawn-helper` binary that must be loadable on your system.

## Install

From the repository root:

```sh
pnpm install
```

This installs every workspace package and runs `node-pty`'s install script
(uses prebuilt binaries on most platforms).

## Verify the workspace

```sh
pnpm typecheck   # tsc --noEmit across every package + example
pnpm test        # runs the full vitest suite across all packages
pnpm verify:contract   # contract-test typecheck + the cross-package contract suite
```

A clean install on a supported platform should produce all green tests.

## Run the standalone CLI demo

```sh
pnpm exec tsx examples/standalone-cli/src/cli.ts demo
```

Expected output (markers indicate the demo completed end to end):

```
session_id=<uuid>
session_pid=<n or unknown>
captured: echo hello
demo: SUCCESS
```

The CLI spawns a `server-node` child over stdio, creates a PTY session,
sends text, reads output, and kills the session.

Other subcommands the CLI exposes (`list-sessions`, `create-session`,
`read-output`, `send-text`) are documented in
`examples/standalone-cli/README.md`.

## Use `react-terminal` in your host

`@continuo-terminal/react-terminal` is host-agnostic and does **not** spawn
`server-node` itself; you provide an `MCPClientAdapter` that knows how to
reach the server (Tauri IPC, Electron preload bridge, in-process, etc.):

```tsx
import { Terminal, type MCPClientAdapter } from '@continuo-terminal/react-terminal';
import '@xterm/xterm/css/xterm.css';

const adapter: MCPClientAdapter = {
  async callTool(name, args) {
    return invokeMCP(name, args);  // host-specific transport
  },
};

<Terminal sessionId="abc" adapter={adapter} cols={80} rows={24} pollIntervalMs={300} />
```

See `packages/react-terminal/README.md` for the full props reference.

## Continuous integration

The `.github/workflows/ci.yml` workflow runs `pnpm install --frozen-lockfile`,
`pnpm typecheck`, `pnpm test`, `pnpm verify:contract`, and a production build of
`examples/minimal-react-host` on `ubuntu-latest` and `macos-latest` with Node 24
and pnpm 9. It triggers on every push and on pull requests targeting `main`.

## macOS `node-pty` troubleshooting

If `pnpm exec tsx examples/standalone-cli/src/cli.ts demo` (or any test that
exercises `terminal.create_session`) reports `posix_spawnp failed.`, the
prebuilt `node-pty` `spawn-helper` binary may be blocked by macOS Gatekeeper
or have an ABI mismatch. Force a local rebuild from source:

```sh
pnpm rebuild node-pty --build-from-source
```

The rebuild step compiles `node-pty` against your locally installed Node 24
runtime and produces a fresh, codesigned `spawn-helper` in
`node_modules/.../node-pty/build/Release/`. Re-run the failing command after
the rebuild completes.

This is a known caveat captured during the topic 05 build; tests that mock
the `SessionManager` (e.g. `server-node` unit specs) and tests that do not
spawn a PTY (e.g. `server-integration.spec.ts` calling only
`terminal.list_sessions`) are unaffected.
