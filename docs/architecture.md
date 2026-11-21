# Architecture

`continuo-terminal` is a pnpm monorepo that ships the terminal MCP engine
extracted from [philip1974/Continuo](https://github.com/philip1974/Continuo)
as composable, host-agnostic packages.

## Layers

Five workspace packages plus runnable examples. Each TypeScript package and
example has its own `package.json` and `tsconfig.json` (`examples/tauri-sidecar`
is a Cargo project).

| Layer | Package | Role |
|---|---|---|
| Contract | `packages/protocol` | Zod schemas, 9 `terminal.*` tool name constants, `KEY_BYTES` |
| Server | `packages/server-node` | MCP server (stdio, Streamable HTTP, local socket) exposing 8 `terminal.*` tools over `node-pty` sessions with ring buffers and lifecycle |
| Host | `packages/host` | `bootstrapAgentHost`, built-in bearer-token auth, agent env composition, transport wiring on top of `server-node` |
| UI | `packages/react-terminal` | React 19 + xterm 6 component; the host injects the transport through `MCPClientAdapter` |
| Utility | `packages/shell-quote` | Host-agnostic POSIX / cmd / PowerShell quoting (no internal dependencies) |
| Examples | `examples/*` | `standalone-cli`, `minimal-react-host`, `minimal-agent-host`, `standalone-cli-host` (TypeScript) and `tauri-sidecar` (Rust / Tauri 2 sidecar demo) |

`crates/server-rust` is still a placeholder. CI (`.github/workflows/ci.yml`)
runs on Ubuntu and macOS with Node 24.

## Package dependency graph

Arrows point from a package to what it depends on (workspace dependencies
only; downstream layers depend on upstream layers, never the reverse):

```
example-standalone-cli-host ──> host ──> server-node ──> protocol
example-minimal-agent-host  ──────────> server-node
example-standalone-cli      ──────────> server-node, protocol
example-minimal-react-host  ──> react-terminal ──────> protocol
shell-quote                     (no internal dependencies)
```

- `protocol` has no internal dependencies (only `zod`).
- `server-node` depends on `protocol` and ships its own `node-pty` PTY
  runtime and MCP server.
- `host` depends on `server-node` and adds authentication, agent env
  composition and transport wiring for embedding hosts.
- `react-terminal` depends only on `protocol` (type-level) and on the
  abstract `MCPClientAdapter` interface; it does **not** depend on
  `server-node` at runtime (the host injects the transport).
- `example-minimal-react-host` ships a mock `MCPClientAdapter` so the
  component can be built and checked without a real PTY backend (the CI
  gate is a Vite production build).

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
rationale is recorded inline in code comments.
