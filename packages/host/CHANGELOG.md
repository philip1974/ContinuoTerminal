# Changelog

All notable changes to `@continuo-terminal/host` will be documented in this
file.

## [Unreleased]

### Changed

- TokenStore rewritten with cryptographically strong local bearer tokens
  (`crypto.randomBytes` 256-bit value, SHA-256 hashed storage, constant-time
  validate, 30min default TTL with active pruning, revocation API).
  **A1 token authority - HTTP/MCP request enforcement pending A2/A3.**
  Plaintext token value is never retained internally; only SHA-256 digest
  plus read-only metadata.
- Resolve `@continuo-terminal/server-node` through `file:../server-node`
  instead of `workspace:*` so outside-workspace `file:` consumers can install
  `@continuo-terminal/host`.

### Added

- A5 publish-readiness metadata: generic package description, keywords,
  author, MIT license field, repository/homepage/bugs metadata,
  `publishConfig.access: public`, package `files` allow-list, and a
  verbatim package-local `LICENSE` file. `private:true` remains in place;
  the internal `file:../server-node` dependency still needs ADR 0006
  conversion before actual npm publish.
- `BootstrapAuthOptions` on `bootstrapAgentHost({ auth })` for HTTP request
  enforcement. Request enforcement is enabled only when `auth` is provided;
  `auth` undefined preserves the M3 unauthenticated local HTTP path.
- Default HTTP bearer authentication that validates host-issued `MCP_TOKEN`
  values through `TokenStore.validate`, plus optional `authorizeToolCall`
  policy wiring.
- `HostAuthConfigError` exported for invalid host auth configuration such as
  `stdio-child` plus `auth`.
- `Token` / `IssueInput` / `IssueResult` types exported.
- `TokenStore.revokeById(id)` / `.revokeBySubject(subject)` / `.size()`.
- `ttlMs: number | null` support on issue (`null` = no expiry for controlled
  local demos; `undefined` = default 30min; `<= 0` throws).
- Initial experimental `bootstrapAgentHost` facade with `stdio-child` and
  local Streamable HTTP transport options.
- `createAgentEnv()` helper for composing generic agent env variables:
  `MCP_BIN_PATH` or `MCP_URL`, `MCP_SUBJECT`, `MCP_SCOPE`,
  `MCP_WORKSPACE_ROOT`, `MCP_META_*`, and placeholder `MCP_TOKEN`.
- Placeholder in-memory token store. This is **not authentication** and does
  not protect any transport, PTY, or tool call.
