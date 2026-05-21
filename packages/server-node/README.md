# @continuo-terminal/server-node

Standalone Node MCP server that owns the PTY runtime side of the
`continuo-terminal` protocol. Spawns shells through `node-pty`, exposes
the seven `terminal.*` MCP tools over stdio, and ships with a stable
v0.1.0 surface.

## Quick start

- Run as a stdio MCP server: `pnpm --filter @continuo-terminal/server-node start`
  (or `tsx packages/server-node/src/server.ts`).
- Test: `pnpm --filter @continuo-terminal/server-node test`.

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
