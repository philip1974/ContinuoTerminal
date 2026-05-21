import { describe, expect, it, vi } from 'vitest';

import { makeSendInputHandler } from '../../src/handlers/send-input.js';

describe('terminal.send_input', () => {
  it('returns text and structured content for valid input', async () => {
    const sessions = { sendInput: vi.fn().mockResolvedValue({}) };
    const handler = makeSendInputHandler({ sessions: sessions as any });

    const result = await handler({ session_id: 's1', data: 'abc' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual({});
    expect(result.structuredContent).toEqual({});
    expect(sessions.sendInput).toHaveBeenCalledWith({ session_id: 's1', data: 'abc' });
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makeSendInputHandler({ sessions: { sendInput: vi.fn() } as any });

    const result = await handler({ session_id: 's1' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makeSendInputHandler({
      sessions: { sendInput: vi.fn().mockRejectedValue(new Error('write failed')) } as any,
    });

    const result = await handler({ session_id: 's1', data: 'abc' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('write failed');
  });
});
