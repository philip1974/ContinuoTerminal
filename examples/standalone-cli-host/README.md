# Standalone CLI Host Example

This example is a second non-desktop consumer exercise for
`@continuo-terminal/host`. It runs a local HTTP host, issues a scoped bearer
token through `createAgentEnv`, and launches a primary agent process that
connects over Streamable HTTP with a Bearer header.

This is a consumer exercise, not an API commitment or a promise of a future
`@continuo-terminal/cli` package.

## M5 Comparison

| Aspect | M5 minimal-agent-host | A4 standalone-cli-host |
|---|---|---|
| Transport | stdio | HTTP via `bootstrapAgentHost` |
| Auth | placeholder | A3 wired bearer + scope policy |
| Dependency | `@continuo-terminal/server-node` | `@continuo-terminal/host` |
| Client | `StdioClientTransport` | `StreamableHTTPClientTransport` + Bearer header |

## Why `file:` Not `workspace:*`

The package depends on `@continuo-terminal/host` through
`file:../../packages/host` intentionally. A4 is meant to exercise physical
consumer behavior close to an outside workspace before publish readiness,
while still staying inside the monorepo for development and tests.

## Run

```bash
pnpm --filter @continuo-terminal/example-standalone-cli-host start
```

Expected markers:

```text
[host] http listening on http://127.0.0.1:<port>/mcp
[primary] connected
[primary] secondary-created:<id>
[primary] secondary-output:from-cli-host
[host] demo complete
```

## Test

```bash
pnpm --filter @continuo-terminal/example-standalone-cli-host test
```

The BDD test asserts the demo exits 0, prints lifecycle markers, and does not
log auth labels such as `MCP_TOKEN` or `Authorization`.

## Auth Policy

The host config uses a local-only policy:

```ts
authorizeToolCall: ({ auth }) => (
  auth?.scope === 'demo'
    ? { allow: true }
    : { allow: false, reason: 'scope denied' }
)
```

The demo remains localhost-first and does not add TLS or remote-production
security guarantees.
