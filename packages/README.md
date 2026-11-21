# packages

The workspace packages:

- [`protocol`](./protocol/) — Zod schemas, MCP tool name constants and `KEY_BYTES`.
- [`server-node`](./server-node/) — Node MCP server with real PTY sessions (stdio, Streamable HTTP and local socket transports).
- [`host`](./host/) — host abstraction: `bootstrapAgentHost`, built-in bearer-token auth, agent env composition, transport wiring.
- [`react-terminal`](./react-terminal/) — React 19 + xterm terminal component with an injected MCP client adapter.
- [`shell-quote`](./shell-quote/) — host-agnostic POSIX / cmd / PowerShell quoting helpers.
