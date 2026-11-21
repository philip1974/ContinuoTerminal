# Architecture

`continuo-terminal` is a pnpm monorepo that ships the terminal MCP engine
extracted from [philip1974/Continuo](https://github.com/philip1974/Continuo)
as composable, host-agnostic packages.

## Layers

The repository is organised into five active workspace packages across
five layers (plus stubs for future work). Each is independently testable
and ships with its own `package.json` and `tsconfig.json`.

```
+----------------------------------------------------------------------+
|  Layer 5  GUI / examples                                             |
|  +-------------------------+   +---------------------------------+   |
|  | examples/standalone-cli |   | examples/minimal-react-host     |   |
|  | (Node MCP Client demo)  |   | (Vite + React 19; renders the   |   |
|  |                         |   |  Terminal component against a   |   |
|  |                         |   |  mock MCP adapter — no PTY)     |   |
|  +-----------+-------------+   +----------------+----------------+   |
|              |                                  |                   |
+--------------|----------------------------------|-------------------+
               |                                  |
+--------------v----------------------------------v-------------------+
|  Layer 4  React UI                                                   |
|  +-----------------------------------------------------------+      |
|  | packages/react-terminal                                   |      |
|  | React 19 + xterm 6 component, MCPClientAdapter interface  |      |
|  +-----------+-------------------------------+---------------+      |
+--------------|-------------------------------|----------------------+
               |                               |
+--------------v-------------------------------v----------------------+
|  Layer 3  Server (Node)                                              |
|  +-----------------------------------------------------------+      |
|  | packages/server-node                                      |      |
|  | stdio MCP server: 8 terminal.* tools via @mcp/sdk         |      |
|  | + node-pty PTY sessions with ring buffer + lifecycle      |      |
|  +-----------------------------+-----------------------------+      |
+--------------------------------|------------------------------------+
                                 |
+--------------------------------v------------------------------------+
|  Layer 2  Protocol contract                                          |
|  +-----------------------------------------------------------+      |
|  | packages/protocol                                         |      |
|  | Zod schemas + 9 MCP tool name constants + KEY_BYTES       |      |
|  +-----------------------------------------------------------+      |
+----------------------------------------------------------------------+

+----------------------------------------------------------------------+
|  Layer 1  Tooling                                                    |
|  + .github/workflows/ci.yml  matrix CI (Ubuntu + macOS, Node 24)     |
|  + docs/                     this directory                          |
+----------------------------------------------------------------------+
```

Placeholders still exist for `crates/server-rust` and `examples/tauri-sidecar`;
future topics will populate them.

## Package dependency graph

The five active workspace packages depend in one direction (downstream
layers depend on upstream layers, never the reverse):

```
@continuo-terminal/protocol  (Zod schemas)
            ^
            |
            +-----------------------------------------+
            |                                         |
@continuo-terminal/server-node                        |
            ^                                         |
            |                                         |
            |                                         |
@continuo-terminal/react-terminal                     |
            ^                                         |
            |                                         |
            +-------------------+                     |
            |                   |                     |
@continuo-terminal/example-     @continuo-terminal/  +-- (type-only imports)
   minimal-react-host             example-standalone-cli
```

- `protocol` has no internal dependencies (only `zod`).
- `server-node` depends on `protocol` (workspace:*) and ships its own
  `node-pty` PTY runtime + MCP server.
- `react-terminal` depends on `protocol` for type-only imports and on the
  abstract `MCPClientAdapter` interface; it does **not** depend on
  `server-node` at runtime (the host injects the transport).
- `example-standalone-cli` depends on `protocol` and `server-node`
  (workspace:*) and demonstrates spawning `server-node` over stdio.
- `example-minimal-react-host` depends on `react-terminal` (workspace:*)
  and ships a mock `MCPClientAdapter` so the React component can be
  built and manually verified without a real PTY backend (the current
  CI gate is a Vite production build; real browser-render E2E remains
  future work).

## Runtime flow (standalone CLI demo)

```
+--------------------+     stdio JSON-RPC      +---------------------+
| standalone-cli     |  ------------------->   | server-node         |
| (MCP Client)       |  <-------------------   | (StdioServerTrans-  |
|                    |     CallToolResult      |  port + handlers)   |
+--------------------+                         +---------+-----------+
                                                         |
                                                         | spawn
                                                         v
                                              +---------------------+
                                              | node-pty PTY        |
                                              | (shell process)     |
                                              +---------------------+
```

Read the corresponding handler in `packages/server-node/src/handlers/*.ts`
for the exact CallToolResult shape:

- `structuredContent` is the typed payload defined by `protocol`.
- `content[0].text` is the same payload as JSON, kept as a compatibility
  fallback for hosts that only read text content.

## Decisions

Architecture Decision Records live in `docs/decisions/` (`0001`–`0009`),
capturing cross-repo PTY handover, buffer/snapshot semantics, transport parity,
contract-testing drift guards, and related choices. Finer-grained, topic-level
rationale is additionally recorded inline in code/comments and in the commit
history — see `git log --oneline` for the topic-by-topic build history.
