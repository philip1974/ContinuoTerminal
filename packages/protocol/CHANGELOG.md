# Changelog

All notable changes to `@continuo-terminal/protocol` will be documented
in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The package is still marked `private` in `package.json` and has not
been published to npm; until publish the `0.x` line follows semver
loosely, with patch bumps reserved for source-compatible additions and
minor bumps reserved for breaking changes to the schema surface.

## [0.1.0] - 2026-05-22

First stamped release. The schema surface defined here is the contract
the rest of the monorepo (`server-node`, `react-terminal`,
`example-standalone-cli`) is built on, and is considered frozen for
0.x — any future change to a schema name, field name, or shape will
require a minor bump.

### Added

- Seven `terminal.*` MCP tool name constants:
  `MCP_TOOL_CREATE_SESSION`, `MCP_TOOL_LIST_SESSIONS`,
  `MCP_TOOL_SEND_INPUT`, `MCP_TOOL_SEND_TEXT`, `MCP_TOOL_PRESS_KEY`,
  `MCP_TOOL_READ_OUTPUT`, `MCP_TOOL_KILL`.
- Zod input/output schemas for each tool, plus inferred TS types.
- `attachTargetSchema` (discriminated union for future attach modes).
- `KEY_BYTES` map for `press_key` byte sequences (enter, tab, escape,
  backspace, ctrl_c, ctrl_d, ctrl_z, arrows).
- `src/index.ts` barrel re-exports everything from `src/schemas.ts`
  with explicit `.js` suffix so NodeNext consumers
  (`server-node`) can resolve workspace imports.

### Notes

- This package is source-only (no `dist/`). Consumers import from
  `src/` directly through the workspace symlink.
- Topic 02 (`Build @continuo-terminal/protocol package with 7 MCP tool
  schemas semantically mirrored from Continuo`, commit `493a152`) is
  the build that landed this surface; topic 04
  (`feat(server-node)`, commit `74fa5a7`) added the `.js` import
  suffix in `src/index.ts` for NodeNext interop.
