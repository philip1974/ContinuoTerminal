# server-node

Purpose: Node MCP server.
Status: placeholder, populated by <future topic on Node MCP server>.

## Quick start

- Start: `pnpm --filter @continuo-terminal/server-node start` or `tsx packages/server-node/src/server.ts`
- Test: `pnpm --filter @continuo-terminal/server-node test`

## Tools (7 MCP)

- `terminal.create_session` - Start a new PTY session.
- `terminal.list_sessions` - List current sessions.
- `terminal.send_input` - Write raw input to PTY stdin.
- `terminal.send_text` - Write text to PTY stdin.
- `terminal.press_key` - Send a special key (enter/tab/ctrl_c/arrows...).
- `terminal.read_output` - Read buffered output with `since_seq` and `strip_ansi`.
- `terminal.kill` - Terminate a session.
