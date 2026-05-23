# Minimal agent host example

This example demonstrates a stdio launcher pattern where a host process
starts a primary controller process, and that primary process owns the
single MCP stdio connection to `@continuo-terminal/server-node`. The
primary controller creates a secondary terminal session and reads its
output.

## STDIO LIMITATION WARNING

Stdio MCP is a single-controller transport. In this example the host is
only a launcher and lifecycle owner; it does not connect to the server as
an MCP client. A multi-client same-server demo waits for the M3 HTTP
transport work.

## Promotion Candidates

These are promotion candidates, not an API commitment.

| Primitive | Candidate status |
|---|---|
| `bootstrapServer` | Candidate for command discovery and server launch wiring. |
| `composeAgentEnv` | Candidate for subject, scope, workspace root, and launch env composition. |
| `waitForReady` | Candidate for bounded lifecycle readiness. |
| `cleanupAll` | Candidate for ordered child process cleanup. |
| `connectAsAgent` | Stay in user code for now; agent-side connection shape is not host glue. |
| `issueToken` | Defer until HTTP/auth validation exists. |

## Run

```sh
pnpm --filter @continuo-terminal/example-minimal-agent-host start
```

## Expected Output

```text
[host] starting
[host] server bin resolved, spawning primary-agent
[primary] connected
[primary] secondary-created:<session-id>
[primary] secondary-output:from secondary
[host] demo complete
```

## Roadmap

This example follows ADR 0004 M5 and builds on the M1 server-node bin
entry. It validates a non-desktop launcher pattern while keeping the
multi-client same-server scenario reserved for the M3 HTTP transport.
