# @continuo-terminal/host

> WARNING: Bearer-token issuance is real; HTTP/MCP enforcement pending A2/A3.
>
> Cryptographically strong local bearer tokens are now issued and tracked
> (256-bit `crypto.randomBytes`, SHA-256 hashed storage, `crypto.timingSafeEqual`
> constant-time compare, default 30min TTL with active pruning, revocation by
> tokenId / subject / all).
>
> **HTTP/MCP request enforcement lands in A2/A3** - until those mini-topics ship,
> issued tokens are not yet consumed as authorization on the server side.
>
> This package remains `private:true` and `@experimental`; no transport-layer
> protection (TLS) is wired (future ADR). Do NOT use as a remote-production
> security boundary.

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

Agent-side connection helpers stay in user code for now. HTTP/MCP request
enforcement, authorization policy, and cross-process auth remain future work.
