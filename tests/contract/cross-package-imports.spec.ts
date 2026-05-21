// Cross-package import shape contract.
// Verifies that the monorepo's source-tree entrypoints expose the minimal
// stable surface other layers depend on. No PTY/session is instantiated and
// no React component is rendered.
//
// We import each package via its in-tree `src/index.ts` so the contract is
// "this monorepo's source ships these exports", not "the hoisted copy in
// node_modules does". Importing the server-node barrel transitively loads
// node-pty (because src/index.ts re-exports SessionManager); if that import
// itself fails on a workstation, the failure is a real environmental issue
// worth catching here (议题 D.5 — same caveat as topic 05).

import { describe, it, expect } from 'vitest';

import {
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_KILL,
  KEY_BYTES,
  createSessionInputSchema,
  readOutputOutputSchema,
} from '../../packages/protocol/src/index';

import {
  SessionManager,
  makeCreateSessionHandler,
  makeListSessionsHandler,
  makeKillHandler,
} from '../../packages/server-node/src/index';

import {
  Terminal,
  parseCallToolResult,
} from '../../packages/react-terminal/src/index';

describe('protocol package — public surface', () => {
  it('exposes the seven terminal.* MCP tool name constants', () => {
    expect(MCP_TOOL_CREATE_SESSION).toBe('terminal.create_session');
    expect(MCP_TOOL_LIST_SESSIONS).toBe('terminal.list_sessions');
    expect(MCP_TOOL_SEND_INPUT).toBe('terminal.send_input');
    expect(MCP_TOOL_SEND_TEXT).toBe('terminal.send_text');
    expect(MCP_TOOL_PRESS_KEY).toBe('terminal.press_key');
    expect(MCP_TOOL_READ_OUTPUT).toBe('terminal.read_output');
    expect(MCP_TOOL_KILL).toBe('terminal.kill');
  });

  it('exposes KEY_BYTES with at least one well-known control key', () => {
    expect(KEY_BYTES).toBeDefined();
    expect(typeof KEY_BYTES).toBe('object');
    expect((KEY_BYTES as Record<string, unknown>).enter).toBeDefined();
  });

  it('exposes Zod schemas with a runtime .parse method', () => {
    expect(typeof createSessionInputSchema.parse).toBe('function');
    expect(typeof readOutputOutputSchema.parse).toBe('function');
  });
});

describe('server-node package — public surface', () => {
  it('exports SessionManager as a constructable class (without instantiating)', () => {
    expect(typeof SessionManager).toBe('function');
    expect(typeof SessionManager.prototype).toBe('object');
  });

  it('exports the create/list/kill handler factories as functions', () => {
    expect(typeof makeCreateSessionHandler).toBe('function');
    expect(typeof makeListSessionsHandler).toBe('function');
    expect(typeof makeKillHandler).toBe('function');
  });
});

describe('react-terminal package — public surface', () => {
  it('exports Terminal as a React function component', () => {
    expect(typeof Terminal).toBe('function');
  });

  it('exports parseCallToolResult helper and it reads structuredContent', () => {
    expect(typeof parseCallToolResult).toBe('function');
    const out = parseCallToolResult<{ sessions: string[] }>({ structuredContent: { sessions: [] } });
    expect(out).toEqual({ sessions: [] });
  });

  it('parseCallToolResult falls back to content[0].text JSON', () => {
    const out = parseCallToolResult<{ ok: number }>({
      content: [{ type: 'text', text: JSON.stringify({ ok: 1 }) }],
    });
    expect(out).toEqual({ ok: 1 });
  });

  it('parseCallToolResult throws on missing structured + text', () => {
    expect(() => parseCallToolResult<{ x: number }>({})).toThrow();
  });
});
