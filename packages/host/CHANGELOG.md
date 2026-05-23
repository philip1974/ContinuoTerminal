# Changelog

All notable changes to `@continuo-terminal/host` will be documented in this
file.

## [Unreleased]

### Added

- Initial experimental `bootstrapAgentHost` facade with `stdio-child` and
  local Streamable HTTP transport options.
- `createAgentEnv()` helper for composing generic agent env variables:
  `MCP_BIN_PATH` or `MCP_URL`, `MCP_SUBJECT`, `MCP_SCOPE`,
  `MCP_WORKSPACE_ROOT`, `MCP_META_*`, and placeholder `MCP_TOKEN`.
- Placeholder in-memory token store. This is **not authentication** and does
  not protect any transport, PTY, or tool call.
