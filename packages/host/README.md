# @continuo-terminal/host

> TOKEN IS NOT AUTHENTICATION - PLACEHOLDER ONLY.
>
> `MCP_TOKEN` is currently an in-memory placeholder used to validate API
> shape. It does not protect HTTP, stdio, PTYs, or tool calls. Do not expose
> HTTP mode beyond trusted local interfaces until a real auth and policy layer
> lands.

Experimental host bootstrap and agent environment helpers for Continuo
Terminal. The package is `private: true` and the API is not publish-ready.
ADR 0004 still requires at least two non-desktop consumers exercised for
2+ weeks or 3+ meaningful commits each before public promotion.

## Usage

```ts
import { bootstrapAgentHost } from '@continuo-terminal/host';

const host = await bootstrapAgentHost({
  transport: { kind: 'http', host: '127.0.0.1', port: 0 },
});

const env = host.createAgentEnv({
  subject: 'agent-a',
  scope: 'demo',
  workspaceRoot: process.cwd(),
  metadata: { role: 'primary' },
});

// User code owns spawning the agent process.
// spawn('codex', [], { env: { ...process.env, ...env } });

await host.dispose();
```

## Transport Kinds

- `stdio-child`: composes env for a child process that will spawn
  `continuo-terminal-server` itself via `MCP_BIN_PATH`.
- `http`: starts an in-process Streamable HTTP server on `127.0.0.1` by
  default and returns `MCP_URL` in agent env.

## Experimental Surface

The intentionally small candidate surface is:

- `bootstrapAgentHost(opts)`
- `AgentHost.createAgentEnv(input)`
- `AgentHost.dispose()`
- `AgentHost.transportInfo`

Agent-side connection helpers stay in user code for now. Real token issue,
validation, authorization policy, and cross-process auth remain future work.
