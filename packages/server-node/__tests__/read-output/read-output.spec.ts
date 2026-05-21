import { describe, expect, it, vi } from 'vitest';

import { makeReadOutputHandler } from '../../src/handlers/read-output.js';

describe('terminal.read_output', () => {
  it('returns text and structured content for valid input', async () => {
    const output = { lines: ['hello'], next_seq: 2, truncated: false };
    const sessions = { readOutput: vi.fn().mockResolvedValue(output) };
    const handler = makeReadOutputHandler({ sessions: sessions as any });

    const result = await handler({ session_id: 's1', strip_ansi: true });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual(output);
    expect(result.structuredContent).toEqual(output);
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makeReadOutputHandler({ sessions: { readOutput: vi.fn() } as any });

    const result = await handler({ session_id: 's1', max_lines: 0 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makeReadOutputHandler({
      sessions: { readOutput: vi.fn().mockRejectedValue(new Error('read failed')) } as any,
    });

    const result = await handler({ session_id: 's1' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('read failed');
  });
});
