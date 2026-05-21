import { describe, expect, it, vi } from 'vitest';

import { makePressKeyHandler } from '../../src/handlers/press-key.js';

describe('terminal.press_key', () => {
  it('returns text and structured content for valid input', async () => {
    const sessions = { pressKey: vi.fn().mockResolvedValue({}) };
    const handler = makePressKeyHandler({ sessions: sessions as any });

    const result = await handler({ session_id: 's1', key: 'enter' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual({});
    expect(result.structuredContent).toEqual({});
    expect(sessions.pressKey).toHaveBeenCalledWith({ session_id: 's1', key: 'enter' });
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makePressKeyHandler({ sessions: { pressKey: vi.fn() } as any });

    const result = await handler({ session_id: 's1', key: 'space' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makePressKeyHandler({
      sessions: { pressKey: vi.fn().mockRejectedValue(new Error('key failed')) } as any,
    });

    const result = await handler({ session_id: 's1', key: 'enter' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('key failed');
  });
});
