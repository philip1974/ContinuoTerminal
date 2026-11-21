# @continuo-terminal/protocol

Zod schemas, TypeScript types, and tool-name constants for the **Continuo Terminal MCP** tools.

This package is **source-only**: consumers import directly from `src/`. There is no `dist/` and no build step. Run `pnpm typecheck` from the workspace root to validate the package.

## Status

Populated by topic `02-protocol-package-build`. The core schema body in `src/schemas.ts` is **semantically mirrored** from Continuo's `electron/shared/mcp-terminal-schemas.ts` at commit `3d69148a39c92a2c96b17a3994d11b17659509b2`. Local additions layered on top of that mirror: the `attachTargetSchema` annotation, the `resize` tool schemas (topic 46), the reserved `await_stop_hook` schemas + `install_stop_hook`/`include_raw`/`stop_hook_installed` fields (Continuo #43), and clarifying JSDoc on individual fields.

## What's exported

- 9 MCP tool name constants (all prefixed `terminal.`): the 8 tools server-node implements — `MCP_TOOL_LIST_SESSIONS`, `MCP_TOOL_CREATE_SESSION`, `MCP_TOOL_SEND_INPUT`, `MCP_TOOL_SEND_TEXT`, `MCP_TOOL_PRESS_KEY`, `MCP_TOOL_READ_OUTPUT`, `MCP_TOOL_KILL`, `MCP_TOOL_RESIZE` — plus `MCP_TOOL_AWAIT_STOP_HOOK`, which is **reserved** (schema-only; server-node 0.1.x does not implement or advertise it — see the `install_stop_hook` JSDoc on `createSessionInputSchema`).
- 18 Zod input/output schemas (9 input + 9 output), one pair per tool constant above.
- `attachTargetSchema` for legacy host attachment (Continuo panel/window concept; retained for compatibility).
- `KEY_BYTES` for compact control-key constants.
- Inferred TS types via `z.infer<>` for every schema.

**Internal-only** (not exported): `sessionItemSchema`.

## Import

```ts
import {
  MCP_TOOL_CREATE_SESSION,
  createSessionInputSchema,
  type CreateSessionInput,
} from '@continuo-terminal/protocol';
```

The package is a private workspace member; do not publish to npm.

## Updating the schema mirror

Do **not** hand-edit `src/schemas.ts` to diverge from the Continuo source. When the upstream schema in Continuo changes, run a follow-up sync topic in this repo that updates both the schema body and the mirror commit hash in the header comment.

