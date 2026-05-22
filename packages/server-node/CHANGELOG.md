# Changelog

All notable changes to `@continuo-terminal/server-node` will be
documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The package is still marked `private` in `package.json` and has not
been published to npm.

## [Unreleased]

Rounds 3-8 of codex independent audits found and fixed user-visible
behavioral bugs and contract drifts in the v0.1.0 surface. These
have not been re-stamped as a new version; they will roll into the
next bump.

### Fixed

- **`terminal.read_output` cursor off-by-one** (round-6 P1). The pre-fix
  `chunk.seq > sinceSeq` filter combined with `nextSeq` being
  incremented AFTER seq assignment caused idle polling consumers to
  silently drop one PTY chunk per cycle (the chunk whose seq equaled
  the cursor they stored). The filter is now inclusive (`>=`) and
  `next_seq` is the seq the consumer should send back on the next call.
- **`SessionBuffer.truncated` no longer sticky** (round-3 P2 + round-4 P2
  + round-6 P1). A single 4 MiB-cap-exceeding push or any sequence of
  drops no longer poisons every subsequent read with `truncated: true`;
  computed per-read from `droppedThroughSeq > 0 && sinceSeq <=
  droppedThroughSeq`. Single oversized push that drops every chunk is
  still correctly reported truncated.
- **`SessionNotFound` is now machine-detectable** (round-5 P2). When
  `SessionManager.getSession` throws because a session is gone, the
  error carries `.code = 'SESSION_NOT_FOUND'`, and the
  `terminal.read_output` handler emits a JSON envelope
  `{ "error": "SESSION_NOT_FOUND", "message": "Session not found: <id>" }`
  in the `isError` text body. Clients can detect session end without
  parsing English error prose.
- **Shutdown lifecycle covers every detach path** (rounds 4-7). The
  server now wires shutdown on SIGINT, SIGTERM, SIGHUP, SIGQUIT, AND
  `process.stdin` `'end'` / `'close'` (round-7 confirmed via SDK 1.29
  source that `transport.onclose` only fires when *we* call
  `transport.close()`, never on host-detach). Each path runs
  `SessionManager.dispose()` then `server.close()`, each wrapped in a
  5-second timeout so a stuck PTY or hung SDK cannot block exit
  indefinitely.
- **`tools/list` descriptions now match the implementation** (round-3
  P1 + round-6 P2 + round-7 P2). Removed claims that no longer hold:
  no `env` field on `create_session`, no automatic SIGKILL escalation
  on `kill`, no CR/LF auto-handling on `send_text`, no base64 raw-byte
  transport on `send_input`. Added an explicit "accepted but ignored"
  note for `target`, which the schema still carries for forward
  compatibility but server-node 0.1 does not consume.
- **MCP `serverInfo.version`** now reads `0.1.0` instead of the stale
  `0.0.0` (round-8 P2).
- **Shutdown comment / README** no longer overclaim that `Server.close()`
  flushes in-flight responses. SDK source proves it aborts in-flight
  handlers and closes the transport; pending responses may be lost
  (round-8 P2).

### Added

- **`SessionState.origin` + `agentLabel` round-trip** (round-5 P2).
  `create_session(input.agentLabel)` now stamps the session as
  `origin: 'agent'` (else `'user'`) and `list_sessions` returns both
  `origin` and `agent_label` so hosts can distinguish agent-spawned
  PTYs from user-opened ones.
- **`SessionBuffer` exported with `@internal` JSDoc** for unit testing
  (rounds 3/4/6 added focused specs covering sticky-truncation, single-
  oversized-push, and boundary-cursor edges).
- **`server-node/README.md`** rewritten from a placeholder stub to
  mirror `TOOL_DESCRIPTIONS` verbatim and document the lifecycle
  handlers + `SESSION_NOT_FOUND` error envelope (round-7 P2).
- **`SessionManager.resize(input)`** runtime method to forward
  `pty.resize(cols, rows)` for an active session. Errors from node-pty
  propagate to the caller; unknown `session_id` throws SESSION_NOT_FOUND.
- **`SessionManager.kill()` accepts optional `gracePeriodMs`** via
  the new `SessionManagerKillInput` type (`KillInput &
  { gracePeriodMs? }`). When > 0 and `initialSignal !== 'SIGKILL'`,
  sends the requested signal, waits, then escalates to SIGKILL if the
  process is still alive. The MCP `terminal.kill` tool surface is
  unchanged (gracePeriodMs is library-only).
- **`new SessionManager({ onData?, maxBytes? })`** constructor accepts
  a per-instance options bag. `onData(sessionId, chunk)` fires after
  every internal buffer.push; callback exceptions are swallowed (no
  stderr noise). `maxBytes` controls the ring-buffer cap; invalid
  values (NaN / Infinity / non-positive / non-integer) throw a
  `RangeError` at SessionBuffer construction.
- **`SessionManagerOptions`** and **`SessionManagerKillInput`** are
  re-exported from `@continuo-terminal/server-node` as type-only
  exports, so consumers can annotate option bags in strict TS.

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
