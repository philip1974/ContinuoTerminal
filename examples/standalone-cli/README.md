# @continuo-terminal/example-standalone-cli

Standalone Node.js CLI that drives @continuo-terminal/server-node over stdio
MCP, demoing the 7 terminal.* tools end-to-end.

## Quick start

```sh
pnpm install
pnpm --filter @continuo-terminal/example-standalone-cli demo
```

## Subcommands

- `list-sessions` - list active PTY sessions
- `create-session [--cwd <path> --shell <path> --cols N --rows N --keep-alive]` - spawn a new session
- `read-output --session-id <id> [--since-seq N --raw]` - read accumulated output (default strip_ansi=true)
- `send-text --session-id <id> --text "<text>" [--newline]` - write text to PTY stdin
- `attach [--session-id <id>] [--cwd <path> --shell <path>] [--poll-ms N --keep-alive]` - interactive mode: forward stdin to PTY (Ctrl+C → press_key, other bytes → send_input) and poll read_output to stdout. Detaches on stdin EOF (Ctrl+D), SIGINT, or SIGTERM and kills the session unless `--keep-alive`.
- `demo` - end-to-end flow (create + send_text + read_output + kill), prints `session_id=`/`session_pid=`/`captured:`/`demo: SUCCESS` markers

`send-input` (raw bytes) and `press-key` (special keys) are NOT exposed as top-level subcommands;
they remain accessible to SDK Client callers, and `attach` uses both internally
to forward stdin and Ctrl+C transparently.

## Tests

```sh
pnpm test
```

## Troubleshooting

If `pnpm exec tsx ... demo` reports `posix_spawnp failed.`, your local node-pty prebuilt
binary may not be loadable (e.g. macOS Gatekeeper). Force a local rebuild:

```sh
pnpm rebuild node-pty --build-from-source
```
