# @continuo-terminal/server-node

Standalone Node MCP server that owns the PTY runtime side of the
`continuo-terminal` protocol. Spawns shells through `node-pty`, exposes
the eight `terminal.*` MCP tools over stdio, Streamable HTTP or a local
socket, and ships with a stable
v0.1.0 surface.

## Quick start

- Run as a stdio MCP server: `pnpm --filter @continuo-terminal/server-node start`
  (or `pnpm exec tsx packages/server-node/src/server.ts`).
- Test: `pnpm --filter @continuo-terminal/server-node test`.

## Standalone CLI usage

`continuo-terminal-server` is the canonical executable for starting the
stdio MCP server. `ct-server` is a short local alias; prefer the canonical
name in scripts and documentation to avoid PATH shadowing.

Inside this workspace:

```sh
pnpm exec continuo-terminal-server
```

After the package is published (it is `private` for now):

```sh
npx -p @continuo-terminal/server-node continuo-terminal-server
```

Options:

- `--help` / `-h` prints command help.
- `--version` / `-v` prints the package version.

The CLI defaults to stdio. Use `--transport http` to expose the same MCP
tools over Streamable HTTP.

### HTTP transport

Start a local Streamable HTTP MCP server:

```sh
pnpm exec continuo-terminal-server --transport http --host 127.0.0.1 --port 0
```

The server prints the actual endpoint after binding:

```text
continuo-terminal-server listening on http://127.0.0.1:<port>/mcp
```

Client example:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://127.0.0.1:<port>/mcp'),
);
const client = new Client({ name: 'example', version: '0' }, { capabilities: {} });

await client.connect(transport);
console.log(await client.listTools());
await client.close();
```

HTTP mode is stateless at the MCP transport layer. Each HTTP request uses
a fresh SDK server/transport pair while sharing one `SessionManager`, so
multiple local clients can observe and control the same PTY sessions.

**Warning**: HTTP mode is localhost-first and the default no-hook path has
no auth, CORS, or policy layer. Keep the default `127.0.0.1` bind unless
you are wrapping it with your own trusted local controls.
When bound to a loopback address, requests whose `Host` header is not
`127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>` are rejected with
403, so a web page cannot reach the server through DNS rebinding.

### Local socket transport

`startLocalSocketTransport` exposes the same MCP tools over a local Unix
socket using NDJSON framing compatible with the SDK stdio serializer.

```ts
import os from 'node:os';
import path from 'node:path';
import {
  LocalSocketClientTransport,
  SessionManager,
  startLocalSocketTransport,
} from '@continuo-terminal/server-node';

const sessions = new SessionManager();
const server = await startLocalSocketTransport({
  socketPath: path.join(os.tmpdir(), 'my-app-mcp', 'sock'),
  sessions,
});

const transport = new LocalSocketClientTransport(path.join(os.tmpdir(), 'my-app-mcp', 'sock'));
```

Capability rules:

- The parent directory is created with mode `0700` and startup fails if an
  existing parent is group/world accessible.
- The socket file is chmodded to `0600` after listen.
- Stale socket paths are removed only when `lstat().isSocket()` is true;
  regular files, directories, and symlinks are never silently unlinked.
- `authorizeToolCall` requires `authenticateRequest`, mirroring the HTTP
  no-silent-bypass invariant.

The transport creates one fresh MCP SDK server per socket connection while
sharing the caller-provided `SessionManager`, so multiple local clients can
observe the same terminal sessions.

`connectLocalSocketStdioProxy({ socketPath, stdin?, stdout? })` bridges
stdio to the socket. By default it consumes `process.stdin` and writes to
`process.stdout`; pass explicit streams when embedding it inside tests or
another process.

Platform note: CT-B1 supports macOS/Linux Unix sockets. Windows named pipe
support is planned as a follow-up.

## Auth policy hooks (A2)

server-node accepts **2 optional hooks**:

- **`authenticateRequest`** on `startHttpTransport({ ... })` - called per
  HTTP request; returns `AuthContext` or `null` (401). Hooks may be **sync
  or async** (`MaybePromise`). The local socket transport accepts the same
  hook but calls it once per connection (`method: 'CONNECT'`, no
  authorization header) and destroys the socket on `null`.
- **`authorizeToolCall`** on `startHttpTransport({ ... })` and
  `createTerminalMcpServer({ ... })` - called before each `tools/call`
  (BEFORE the unknown-tool branch, so authorize can deny unknown tool names
  without leaking tool existence). Returns `{ allow: true }` or
  `{ allow: false; reason? }` (`isError`). Sync or async.

**HTTP config invariant**: `startHttpTransport` throws at startup if
`authorizeToolCall` is provided without `authenticateRequest`
(no-silent-bypass). `createTerminalMcpServer` lib direct use allows
`authorizeToolCall` with no auth (stdio / lib mode - caller-owned).

**Hook shape only - server-node does not own tokens nor validate them**.
Host packages own tokens (see `@continuo-terminal/host` A1). When no hook
is provided, the M3 unauthenticated path is preserved (backwards compat).

`@continuo-terminal/host` wires its token authority into these hooks
(`bootstrapAgentHost({ auth })`); callers can also implement the hooks directly.

## Tools (8 MCP)

These are summaries of the `TOOL_DESCRIPTIONS` table in `src/server.ts`
(the exact strings agents see live there); see the JSDoc in
`@continuo-terminal/protocol` for full schema shapes.

- `terminal.create_session` — Start a new PTY session. Optional inputs:
  `cwd`, `name`, `shell`, `args`, `env`, `cols`, `rows`, `autorun`,
  `agentLabel`. The schema also accepts a `target` attach hint for forward
  compatibility; server-node 0.1.x ignores it (reserved for host-side
  multi-panel routing). `install_stop_hook` / `include_raw` are reserved too:
  server-node accepts but ignores them.
- `terminal.list_sessions` — List currently active sessions including
  `origin` (`user` | `agent`) and `agent_label` when set.
- `terminal.send_input` — Write a **UTF-8 text string** to PTY stdin. Bytes
  that are not valid UTF-8 cannot be transported via this tool; use
  `terminal.press_key` for special keys.
- `terminal.send_text` — Write text to PTY stdin verbatim, no newline
  normalization. Pair with `terminal.press_key` for Enter.
- `terminal.press_key` — Send a special key (`enter` / `tab` / `ctrl_c` /
  arrows / etc.) via the protocol's `KEY_BYTES` mapping.
- `terminal.read_output` — Read buffered output. Use the returned
  `next_seq` as `since_seq` on the next call (inclusive cursor); request
  `strip_ansi: true` to flatten control sequences in `lines` only — the
  `data` field is always the raw byte stream (use it for lossless TUI replay).
- `terminal.kill` — Send a single signal (`SIGINT` / `SIGTERM` /
  `SIGKILL`, defaults to `SIGTERM`), then immediately drop the session.
  Fire-and-forget: no automatic escalation and no retry — a second kill on
  the same session_id is a silent no-op even if the process ignored the
  signal, so pass `SIGKILL` on the first call to force termination.
- `terminal.resize` — Resize a session's PTY columns + rows. Use on viewport
  resize / xterm fit-addon events to keep PTY size in sync with renderer
  cols/rows so TUI apps (Claude Code, Codex CLI, htop, vim) reflow correctly.
  node-pty resize errors (`EBADF` / `ENOTTY` / `EINVAL`) propagate as `isError`.

## SessionManager Runtime APIs

### getBufferSnapshot(sessionId, options?)

Returns a raw byte snapshot of the PTY output buffer for the given session,
intended for non-MCP consumers (e.g. Electron renderer attach via IPC).

**Returns**: `{ data: string; nextSeq: number; truncated: boolean }`
- `data`: concatenated raw byte stream since `options.sinceSeq` (default 0).
  ANSI escape sequences are **preserved** (not stripped).
- `nextSeq`: library cursor for incremental pulls. Note: this field is a
  library convention and is NOT forwarded in IPC payloads by Continuo.
- `truncated`: true if any chunks were evicted via maxBytes overflow before
  the read window.

**Throws**: `Error` with `code === 'SESSION_NOT_FOUND'` if the session is
unknown. Continuo's `terminal.service.getBufferSnapshot` wrapper maps this
to an empty snapshot for IPC backward compatibility.

**Use case**: Electron renderer attach pull-based replay (see the readHistory path in Continuo's
`src/panels/Terminal/useTerminal.ts`).

## Lifecycle

In stdio mode the server installs shutdown handlers on `SIGINT`, `SIGTERM`,
`SIGHUP`, and `SIGQUIT`, plus `process.stdin` `end` / `close` for
host-detach. Each path runs `SessionManager.dispose()` (PTYs receive SIGTERM
in parallel) then `server.close()`, each wrapped in a 5-second timeout so a
stuck shell cannot block exit indefinitely.

In HTTP mode (`--transport http`) the server handles the same four signals
but does not watch stdin, and closes the HTTP listener first, then disposes
the sessions, with the same 5-second timeouts.

## Errors

When `terminal.read_output` reports a missing session, the error body is
a JSON envelope `{ "error": "SESSION_NOT_FOUND", "message": "Session not
found: <id>" }`. Other failures use plain-text error messages. Clients
can detect session end by checking `error === 'SESSION_NOT_FOUND'`
rather than parsing English.
