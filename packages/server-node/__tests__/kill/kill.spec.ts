import { describe, expect, it, vi } from 'vitest';

import { makeKillHandler } from '../../src/handlers/kill.js';

describe('terminal.kill', () => {
  it('returns text and structured content for valid input', async () => {
    const sessions = { kill: vi.fn().mockResolvedValue({}) };
    const handler = makeKillHandler({ sessions: sessions as any });

    const result = await handler({ session_id: 's1', signal: 'SIGTERM' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual({});
    expect(result.structuredContent).toEqual({});
    expect(sessions.kill).toHaveBeenCalledWith({ session_id: 's1', signal: 'SIGTERM' });
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makeKillHandler({ sessions: { kill: vi.fn() } as any });

    const result = await handler({ session_id: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makeKillHandler({
      sessions: { kill: vi.fn().mockRejectedValue(new Error('kill failed')) } as any,
    });

    const result = await handler({ session_id: 's1' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('kill failed');
  });
});
