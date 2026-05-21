// Sample import demonstrating that @continuo-terminal/protocol resolves and
// typechecks correctly via pnpm workspace symlinks + bundler module resolution.
//
// This file is NOT executed; it exists only so that `pnpm typecheck` runs tsc
// against it (per packages/protocol README and plan-v4 Op12). A future topic
// will replace this with the actual standalone-cli entrypoint.

import {
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  createSessionInputSchema,
  killInputSchema,
  type CreateSessionInput,
  type KillInput,
} from '@continuo-terminal/protocol';

// Compile-time check: tool name constants are strings.
const _toolName: string = MCP_TOOL_CREATE_SESSION;
void _toolName;

// Compile-time check: Zod schemas have a `.parse` method.
const _parseFn: (raw: unknown) => unknown = createSessionInputSchema.parse.bind(
  createSessionInputSchema,
);
void _parseFn;

// Compile-time check: inferred types are usable.
const _example: CreateSessionInput = { cwd: '/tmp' };
void _example;

const _killExample: KillInput = { session_id: 'sid-1', signal: 'SIGTERM' };
void _killExample;

// Compile-time check: kill input enum literals are inferred narrowly.
const _killSignal: 'SIGINT' | 'SIGTERM' | 'SIGKILL' | undefined = _killExample.signal;
void _killSignal;

// Reference all imports to keep them from being elided.
export const __used = [
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  createSessionInputSchema,
  killInputSchema,
] as const;
