# @continuo-terminal/protocol

Zod schemas, TypeScript types, and tool-name constants for the **Continuo Terminal MCP** tools.

This package is **source-only**: consumers import directly from `src/`. There is no `dist/` and no build step. Run `pnpm typecheck` from the workspace root to validate the package.

## Status

This package is the **source of truth** for the terminal MCP tool contract. Continuo consumes it directly (`electron/shared/mcp-terminal-schemas.ts` is a one-line re-export of `@continuo-terminal/protocol`). Besides the core tool schemas it carries the `attachTargetSchema` annotation, the `resize` tool schemas, the reserved `await_stop_hook` schemas plus the `install_stop_hook` / `include_raw` / `stop_hook_installed` fields used by Continuo, and clarifying JSDoc on individual fields.

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

## Changing the schemas

Edit `src/schemas.ts` here; Continuo picks the change up through its pinned dependency (`.continuo-terminal-ref` in the Continuo repo). Schema name, field name or shape changes are breaking for the 0.x line and need a minor version bump plus a `CHANGELOG.md` entry.
