# @continuo-terminal/server-node

Standalone Node MCP server that owns the PTY runtime side of the
`continuo-terminal` protocol. Spawns shells through `node-pty`, exposes
the seven `terminal.*` MCP tools over stdio, and ships with a stable
v0.1.0 surface.

## Quick start

- Run as a stdio MCP server: `pnpm --filter @continuo-terminal/server-node start`
  (or `tsx packages/server-node/src/server.ts`).
- Test: `pnpm --filter @continuo-terminal/server-node test`.

## Standalone CLI usage

`continuo-terminal-server` is the canonical executable for starting the
stdio MCP server. `ct-server` is a short local alias; prefer the canonical
name in scripts and documentation to avoid PATH shadowing.

Inside this workspace:

```sh
pnpm exec continuo-terminal-server
```

Future post-publish usage:

```sh
npx continuo-terminal-server
```

Options:

- `--help` / `-h` prints command help.
- `--version` / `-v` prints the package version.

The CLI currently serves MCP over stdio only. HTTP transport is reserved
for the M3 transport roadmap.

## Tools (7 MCP)

These descriptions mirror the `TOOL_DESCRIPTIONS` table in `src/server.ts`
verbatim; see the JSDoc in `@continuo-terminal/protocol` for full schema
shapes.

- `terminal.create_session` — Start a new PTY session. Optional inputs:
  `cwd`, `shell`, `cols`, `rows`, `autorun`, `agentLabel`. The schema also
  accepts a `target` attach hint for forward compatibility; server-node
  0.1.x ignores it (reserved for host-side multi-panel routing).
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
  `strip_ansi: true` to flatten control sequences.
- `terminal.kill` — Send a single signal (`SIGINT` / `SIGTERM` /
  `SIGKILL`, defaults to `SIGTERM`). No automatic escalation; the caller
  retries with a stronger signal if the process does not exit.

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

**Use case**: Electron renderer attach pull-based replay (see Continuo
`src/panels/Terminal/useTerminal.ts:261` readHistory path).

## Lifecycle

The server installs shutdown handlers on `SIGINT`, `SIGTERM`, `SIGHUP`,
and `SIGQUIT`, plus `process.stdin` `end` / `close` for host-detach. Each
path runs `SessionManager.dispose()` (PTYs receive SIGTERM in parallel)
then `server.close()`, each wrapped in a 5-second timeout so a stuck
shell cannot block exit indefinitely.

## Errors

When `terminal.read_output` reports a missing session, the error body is
a JSON envelope `{ "error": "SESSION_NOT_FOUND", "message": "Session not
found: <id>" }`. Other failures use plain-text error messages. Clients
can detect session end by checking `error === 'SESSION_NOT_FOUND'`
rather than parsing English.
