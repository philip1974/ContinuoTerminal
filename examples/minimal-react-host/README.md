# @continuo-terminal/example-minimal-react-host

Minimal Vite + React 19 host that renders `@continuo-terminal/react-terminal`
against an **in-memory mock** `MCPClientAdapter`.

> Note: This host uses a mock adapter (in-memory state, no real PTY). It does
> not connect to `@continuo-terminal/server-node`. To wire up a real server,
> replace `src/mock-adapter.ts` with a real transport (Tauri invoke / Electron
> preload / fetch-bridge to a Node sidecar / etc.).

## Quick start

```sh
pnpm install
pnpm --filter @continuo-terminal/example-minimal-react-host build
pnpm --filter @continuo-terminal/example-minimal-react-host dev
```

`pnpm dev` starts the Vite dev server (default http://localhost:5173). The
page mounts a single `<Terminal>` against the mock adapter and exposes a
"Send echo" button that pushes `echo hi` text into the mocked output stream.

## Mock adapter contract

`mockAdapter.callTool(name, args)` dispatches by literal MCP tool name and
maintains an in-memory `Map<sessionId, { output, nextSeq }>` state. The five
tools wired up:

- `terminal.create_session` - adds a new session, seeds 2 greeting lines
- `terminal.list_sessions` - returns the current sessions array
- `terminal.read_output` - returns lines with `seq >= since_seq` + a monotonic `next_seq`
- `terminal.send_text` - appends `[mock echo] <text>` to the session output
- `terminal.kill` - removes the session

Replacing this file with a real transport (one that proxies `callTool` to a
running `server-node` process via your host's IPC) lets the same React tree
talk to a real PTY without any other code change.
