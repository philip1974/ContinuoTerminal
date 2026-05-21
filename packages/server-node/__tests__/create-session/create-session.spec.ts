import { describe, expect, it, vi } from 'vitest';

import { makeCreateSessionHandler } from '../../src/handlers/create-session.js';

describe('terminal.create_session', () => {
  it('returns text and structured content for valid input', async () => {
    const sessions = { create: vi.fn().mockResolvedValue({ session_id: 's1' }) };
    const handler = makeCreateSessionHandler({ sessions: sessions as any });

    const result = await handler({ cwd: process.cwd(), name: 'demo' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual({ session_id: 's1' });
    expect(result.structuredContent).toEqual({ session_id: 's1' });
    expect(sessions.create).toHaveBeenCalledWith({ cwd: process.cwd(), name: 'demo' });
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makeCreateSessionHandler({ sessions: { create: vi.fn() } as any });

    const result = await handler({ cwd: 42 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makeCreateSessionHandler({
      sessions: { create: vi.fn().mockRejectedValue(new Error('spawn failed')) } as any,
    });

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('spawn failed');
  });

  // B23 regression: the audit found that autorun + the new shell/cols/rows
  // fields were exercised by no test on the server-node side. This anchors the
  // forwarding contract so a future refactor cannot quietly drop one of them.
  it('forwards autorun + shell + cols + rows to SessionManager.create', async () => {
    const sessions = { create: vi.fn().mockResolvedValue({ session_id: 's-auto', pid: 4242 }) };
    const handler = makeCreateSessionHandler({ sessions: sessions as any });

    const result = await handler({
      cwd: '/tmp',
      shell: '/bin/zsh',
      cols: 100,
      rows: 30,
      autorun: 'echo hi',
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ session_id: 's-auto', pid: 4242 });
    expect(sessions.create).toHaveBeenCalledWith({
      cwd: '/tmp',
      shell: '/bin/zsh',
      cols: 100,
      rows: 30,
      autorun: 'echo hi',
    });
  });

  // B24 regression: attachTarget is part of v0.1.0 schema but currently a
  // no-op on server-node. Test pins down "round-trips without erroring" so the
  // contract surface stays usable by hosts that send `target` for forward
  // compatibility. See attachTargetSchema JSDoc.
  it('accepts attachTarget hint without forwarding errors (currently no-op on server-node)', async () => {
    const sessions = { create: vi.fn().mockResolvedValue({ session_id: 's-target' }) };
    const handler = makeCreateSessionHandler({ sessions: sessions as any });

    const result = await handler({ target: { kind: 'active' } });

    expect(result.isError).toBeUndefined();
    expect(sessions.create).toHaveBeenCalledWith({ target: { kind: 'active' } });
  });
});
