# @continuo-terminal/host

> WARNING: Bearer-token issuance is real; request enforcement is enabled only
> when `bootstrapAgentHost({ auth })` is provided.
>
> Cryptographically strong local bearer tokens are now issued and tracked
> (256-bit `crypto.randomBytes`, SHA-256 hashed storage, `crypto.timingSafeEqual`
> constant-time compare, default 30min TTL with active pruning, revocation by
> tokenId / subject / all).
>
> HTTP/MCP request enforcement is wired for HTTP hosts that opt into `auth`.
> When `auth` is undefined, the M3 unauthenticated local HTTP behavior is
> preserved for backwards compatibility.
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

## Auth Integration

HTTP hosts can opt into default bearer enforcement by providing `auth`.

```ts
const host = await bootstrapAgentHost({
  transport: { kind: 'http', host: '127.0.0.1', port: 0 },
  auth: {
    tokenTtlMs: 30 * 60 * 1000,
    authorizeToolCall: ({ auth, toolName }) => {
      return auth?.scope === 'demo' && toolName.startsWith('terminal.')
        ? { allow: true }
        : { allow: false, reason: 'not authorized' };
    },
  },
});
```

- `tokenTtlMs` is a host-wide default for tokens issued by
  `createAgentEnv`.
- `authenticateRequestOverride` is an advanced escape hatch that replaces
  default `TokenStore` validation; most callers should leave it undefined.
- `authorizeToolCall` receives the authenticated generic subject/scope/token
  context before each tool call.
- `stdio-child` rejects `auth` options at bootstrap because the parent process
  owns that trust boundary.

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
enforcement is available only when `auth` is explicitly configured; TLS and
multi-host signing remain future work.
