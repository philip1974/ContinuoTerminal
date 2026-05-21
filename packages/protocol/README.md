# @continuo-terminal/protocol

Zod schemas, TypeScript types, and tool-name constants for the **Continuo Terminal MCP** tools.

This package is **source-only**: consumers import directly from `src/`. There is no `dist/` and no build step. Run `pnpm typecheck` from the workspace root to validate the package.

## Status

Populated by topic `02-protocol-package-build`. The schema body in `src/schemas.ts` is **semantically mirrored** from Continuo's `electron/shared/mcp-terminal-schemas.ts` at commit `3d69148a39c92a2c96b17a3994d11b17659509b2`. The only local additions are an attribution header and a `// Legacy host attachment compatibility …` annotation above `attachTargetSchema`.

## What's exported

- 7 MCP tool name constants: `MCP_TOOL_LIST_SESSIONS`, `MCP_TOOL_CREATE_SESSION`, `MCP_TOOL_SEND_INPUT`, `MCP_TOOL_SEND_TEXT`, `MCP_TOOL_PRESS_KEY`, `MCP_TOOL_READ_OUTPUT`, `MCP_TOOL_KILL` (all prefixed `terminal.`).
- 14 Zod input/output schemas (7 input + 7 output) for each of the tools above.
- `attachTargetSchema` for legacy host attachment (Continuo panel/window concept; retained for compatibility).
- `KEY_BYTES` for compact control-key constants.
- Inferred TS types via `z.infer<>` for every schema.

**Not exported**: `MCP_TOOL_RESIZE` and any `terminal.resize` literal — the resize tool is deliberately out of scope. `sessionItemSchema` is internal-only.

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

