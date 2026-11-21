# Security Policy

## Supported versions

Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: the repository's **Security** tab → **Report a vulnerability**
(<https://github.com/philip1974/ContinuoTerminal/security/advisories/new>). Include what is affected
(package, transport, or MCP tool) and the commit, steps to reproduce, and the impact you expect.

You should get a first response within a week.

## Scope notes

- In scope: bypassing the HTTP transport's bearer-token check, the local socket's owner-only (`0600`)
  permissions or a configured `authorizeToolCall` hook, and anything that turns MCP tool input into unintended
  command execution beyond the documented PTY semantics.
- By design, all authenticated clients of one server share its sessions (`list_sessions` returns every session);
  restrict per-client access with `authorizeToolCall` if you need it.
- `terminal.send_input` / `send_text` intentionally type into a real shell: an authorized client can run commands.
  That is the product, not a vulnerability.
