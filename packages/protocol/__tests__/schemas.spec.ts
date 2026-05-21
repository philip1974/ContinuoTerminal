import { describe, it, expect } from 'vitest';
import * as protocol from '../src';
import {
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_KILL,
  createSessionInputSchema,
  createSessionOutputSchema,
  sendInputInputSchema,
  readOutputInputSchema,
  killInputSchema,
} from '../src';

// ── Group 1: tool name constants smoke (2 cases) ──────────────────────────
describe('tool name constants', () => {
  it('exports 7 tool constants all prefixed with terminal.', () => {
    const constants = [
      MCP_TOOL_LIST_SESSIONS,
      MCP_TOOL_CREATE_SESSION,
      MCP_TOOL_SEND_INPUT,
      MCP_TOOL_SEND_TEXT,
      MCP_TOOL_PRESS_KEY,
      MCP_TOOL_READ_OUTPUT,
      MCP_TOOL_KILL,
    ];
    expect(constants).toHaveLength(7);
    for (const c of constants) {
      expect(c).toMatch(/^terminal\./);
    }
  });

  it('does not export MCP_TOOL_RESIZE or terminal.resize (strict 7-tool mirror per plan-v4 P2-1)', () => {
    expect(Object.keys(protocol)).not.toContain('MCP_TOOL_RESIZE');
    const toolValues = [
      MCP_TOOL_LIST_SESSIONS,
      MCP_TOOL_CREATE_SESSION,
      MCP_TOOL_SEND_INPUT,
      MCP_TOOL_SEND_TEXT,
      MCP_TOOL_PRESS_KEY,
      MCP_TOOL_READ_OUTPUT,
      MCP_TOOL_KILL,
    ];
    expect(toolValues).not.toContain('terminal.resize');
  });
});

// ── Group 2: createSession (4 cases) ──────────────────────────────────────
describe('createSessionInputSchema', () => {
  it('parses empty object (all fields optional)', () => {
    expect(() => createSessionInputSchema.parse({})).not.toThrow();
  });

  it('parses input with cwd / name / agentLabel / autorun', () => {
    const v = createSessionInputSchema.parse({
      cwd: '/tmp',
      name: 'shell-1',
      agentLabel: 'claude',
      autorun: 'ls\n',
    });
    expect(v.cwd).toBe('/tmp');
    expect(v.autorun).toBe('ls\n');
  });

  it('rejects unknown extra field (strict)', () => {
    expect(() => createSessionInputSchema.parse({ unknownField: 1 } as any)).toThrow();
  });

  it('createSessionOutputSchema rejects empty session_id', () => {
    expect(() => createSessionOutputSchema.parse({ session_id: '' })).toThrow();
  });
});

// ── Group 3: sendInput (3 cases) ──────────────────────────────────────────
describe('sendInputInputSchema', () => {
  it('parses { session_id, data }', () => {
    const v = sendInputInputSchema.parse({ session_id: 'abc', data: 'echo hi\n' });
    expect(v.session_id).toBe('abc');
    expect(v.data).toBe('echo hi\n');
  });

  it('rejects missing session_id', () => {
    expect(() => sendInputInputSchema.parse({ data: 'x' } as any)).toThrow();
  });

  it('rejects data over 2_000_000 chars', () => {
    const huge = 'a'.repeat(2_000_001);
    expect(() => sendInputInputSchema.parse({ session_id: 's', data: huge })).toThrow();
  });
});

// ── Group 4: readOutput (2 cases) ─────────────────────────────────────────
describe('readOutputInputSchema', () => {
  it('parses with optional fields omitted', () => {
    const v = readOutputInputSchema.parse({ session_id: 'sid' });
    expect(v.since_seq).toBeUndefined();
    expect(v.max_lines).toBeUndefined();
  });

  it('rejects negative since_seq', () => {
    expect(() => readOutputInputSchema.parse({ session_id: 's', since_seq: -1 })).toThrow();
  });
});

// ── Group 5: kill (2 cases) ───────────────────────────────────────────────
describe('killInputSchema', () => {
  it('parses with signal SIGTERM', () => {
    const v = killInputSchema.parse({ session_id: 's', signal: 'SIGTERM' });
    expect(v.signal).toBe('SIGTERM');
  });

  it('rejects unknown signal value', () => {
    expect(() => killInputSchema.parse({ session_id: 's', signal: 'SIGUNKNOWN' } as any)).toThrow();
  });
});

// Total: 2 + 4 + 3 + 2 + 2 = 13 it() cases (plan-v4 NI-2 v2 locked)
