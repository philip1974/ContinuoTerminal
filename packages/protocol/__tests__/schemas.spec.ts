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
  MCP_TOOL_RESIZE,
  createSessionInputSchema,
  createSessionOutputSchema,
  listSessionsOutputSchema,
  readOutputOutputSchema,
  sendInputInputSchema,
  readOutputInputSchema,
  killInputSchema,
} from '../src';

// ── Group 1: tool name constants smoke (2 cases) ──────────────────────────
describe('tool name constants', () => {
  it('exports 8 tool constants all prefixed with terminal.', () => {
    const constants = [
      MCP_TOOL_LIST_SESSIONS,
      MCP_TOOL_CREATE_SESSION,
      MCP_TOOL_SEND_INPUT,
      MCP_TOOL_SEND_TEXT,
      MCP_TOOL_PRESS_KEY,
      MCP_TOOL_READ_OUTPUT,
      MCP_TOOL_KILL,
      MCP_TOOL_RESIZE,
    ];
    expect(constants).toHaveLength(8);
    for (const c of constants) {
      expect(c).toMatch(/^terminal\./);
    }
  });

  it('exports MCP_TOOL_RESIZE === "terminal.resize" (topic 46 — P1.6 visual distortion fix)', () => {
    expect(Object.keys(protocol)).toContain('MCP_TOOL_RESIZE');
    expect(MCP_TOOL_RESIZE).toBe('terminal.resize');
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

// ── Group 6: v0.1.0 bug-fix additions (B1/B2) ─────────────────────────────
describe('createSessionInputSchema (B1: shell/cols/rows)', () => {
  it('accepts shell + cols + rows together', () => {
    const v = createSessionInputSchema.parse({ shell: '/bin/bash', cols: 100, rows: 30 });
    expect(v.shell).toBe('/bin/bash');
    expect(v.cols).toBe(100);
    expect(v.rows).toBe(30);
  });

  it('rejects non-positive cols', () => {
    expect(() => createSessionInputSchema.parse({ cols: 0 })).toThrow();
    expect(() => createSessionInputSchema.parse({ cols: -5 })).toThrow();
  });
});

describe('createSessionOutputSchema (B2: pid)', () => {
  it('accepts session_id + pid', () => {
    const v = createSessionOutputSchema.parse({ session_id: 'abc', pid: 12345 });
    expect(v.pid).toBe(12345);
  });

  it('accepts session_id without pid (pid is optional)', () => {
    const v = createSessionOutputSchema.parse({ session_id: 'abc' });
    expect(v.pid).toBeUndefined();
  });

  it('rejects extra unknown fields (still strict)', () => {
    expect(() => createSessionOutputSchema.parse({ session_id: 'abc', cols: 80 } as any)).toThrow();
  });
});

// ── Group 7: list/read output shape sanity for mock-adapter alignment ────
describe('listSessionsOutputSchema (B3 alignment)', () => {
  it('accepts the mock-adapter-style item shape (session_id/title/cwd/origin/created_at/exit_code)', () => {
    const v = listSessionsOutputSchema.parse({
      sessions: [
        {
          session_id: 'mock-1',
          title: 'mock',
          cwd: '/tmp',
          origin: 'user',
          created_at: 1000,
          exit_code: null,
        },
      ],
    });
    expect(v.sessions[0]?.origin).toBe('user');
  });
});

describe('readOutputOutputSchema (B4 truncated required)', () => {
  it('requires truncated boolean', () => {
    expect(() => readOutputOutputSchema.parse({ lines: [], next_seq: 0 } as any)).toThrow();
  });
  it('accepts full shape', () => {
    const v = readOutputOutputSchema.parse({ lines: ['hi'], data: 'hi\n', next_seq: 1, truncated: false });
    expect(v.truncated).toBe(false);
  });
});

// ── Group 8 (audit round 2): autorun + attachTarget input coverage (B23/B24) ──
describe('createSessionInputSchema (B23: autorun)', () => {
  it('accepts an autorun string alone', () => {
    const v = createSessionInputSchema.parse({ autorun: 'echo hi' });
    expect(v.autorun).toBe('echo hi');
  });

  it('accepts autorun together with shell + cols + rows', () => {
    const v = createSessionInputSchema.parse({
      shell: '/bin/zsh',
      cols: 100,
      rows: 30,
      autorun: 'pwd && ls',
    });
    expect(v).toEqual({ shell: '/bin/zsh', cols: 100, rows: 30, autorun: 'pwd && ls' });
  });
});

describe('createSessionInputSchema (B24: attachTarget)', () => {
  it("accepts target { kind: 'active' }", () => {
    const v = createSessionInputSchema.parse({ target: { kind: 'active' } });
    expect(v.target).toEqual({ kind: 'active' });
  });

  it("accepts target { kind: 'panel', panelId }", () => {
    const v = createSessionInputSchema.parse({ target: { kind: 'panel', panelId: 'p1' } });
    expect(v.target).toEqual({ kind: 'panel', panelId: 'p1' });
  });

  it("rejects target with kind 'panel' missing panelId (discriminated union)", () => {
    expect(() => createSessionInputSchema.parse({ target: { kind: 'panel' } } as any)).toThrow();
  });
});
