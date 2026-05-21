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
});
