# e2e

End-to-end test namespace.

## Current status

This directory is currently a placeholder. The repository's real
end-to-end coverage already lives next to the code that ships:

- [`examples/standalone-cli/__tests__/demo/demo.spec.ts`](../../examples/standalone-cli/__tests__/demo/demo.spec.ts)
  spawns the CLI as a subprocess, which in turn spawns
  `server-node`, opens a PTY, sends text, reads output, kills the
  session, and asserts the four `session_id=` / `session_pid=` /
  `captured:` / `demo: SUCCESS` stdout markers.
- [`packages/server-node/__tests__/server-integration/server-integration.spec.ts`](../../packages/server-node/__tests__/server-integration/server-integration.spec.ts)
  drives `server-node` through a real MCP `Client` + stdio
  transport, performs the `initialize` handshake, lists the seven
  `terminal.*` tools, and exercises `tools/call terminal.list_sessions`.

When future topics add cross-cutting flows that do not fit either of
those locations (for example a host-level scenario that wires
`react-terminal` to a real `server-node` sidecar), they will land here.
