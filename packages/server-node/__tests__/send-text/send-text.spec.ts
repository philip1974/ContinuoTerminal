import { describe, expect, it, vi } from 'vitest';

import { makeSendTextHandler } from '../../src/handlers/send-text.js';

describe('terminal.send_text', () => {
  it('returns text and structured content for valid input', async () => {
    const sessions = { sendText: vi.fn().mockResolvedValue({}) };
    const handler = makeSendTextHandler({ sessions: sessions as any });

    const result = await handler({ session_id: 's1', text: 'hello' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual({});
    expect(result.structuredContent).toEqual({});
    expect(sessions.sendText).toHaveBeenCalledWith({ session_id: 's1', text: 'hello' });
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makeSendTextHandler({ sessions: { sendText: vi.fn() } as any });

    const result = await handler({ session_id: 's1' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makeSendTextHandler({
      sessions: { sendText: vi.fn().mockRejectedValue(new Error('write failed')) } as any,
    });

    const result = await handler({ session_id: 's1', text: 'hello' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('write failed');
  });
});
