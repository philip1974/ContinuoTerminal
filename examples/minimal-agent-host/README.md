# Minimal agent host example

This example demonstrates a stdio launcher pattern where a host process
starts a primary controller process, and that primary process owns the
single MCP stdio connection to `@continuo-terminal/server-node`. The
primary controller creates a secondary terminal session and reads its
output.

## STDIO LIMITATION WARNING

Stdio MCP is a single-controller transport. In this example the host is
only a launcher and lifecycle owner; it does not connect to the server as
an MCP client. For several clients sharing one server over HTTP with
bearer-token auth, see [`standalone-cli-host`](../standalone-cli-host/).

## Promotion Candidates

These are promotion candidates, not an API commitment.

| Primitive | Candidate status |
|---|---|
| `bootstrapServer` | Candidate for command discovery and server launch wiring. |
| `composeAgentEnv` | Candidate for subject, scope, workspace root, and launch env composition. |
| `waitForReady` | Candidate for bounded lifecycle readiness. |
| `cleanupAll` | Candidate for ordered child process cleanup. |
| `connectAsAgent` | Stay in user code for now; agent-side connection shape is not host glue. |
| `issueToken` | Covered by `@continuo-terminal/host` (bearer tokens over HTTP); see `standalone-cli-host`. |

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
[primary] done
[host] primary-agent exited:0
[host] demo complete
```

Lines that echo terminal output (e.g. `secondary-output:`) also contain the
shell prompt and the echoed command; match them by substring.


## Roadmap

This example follows ADR 0004 M5 and builds on the M1 server-node bin
entry. It validates a non-desktop launcher pattern; the multi-client HTTP
scenario is demonstrated by `standalone-cli-host`.
