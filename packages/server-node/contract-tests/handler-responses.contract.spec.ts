import { describe, expect, it, vi } from 'vitest';
import {
  makeCreateSessionHandler,
  makeReadOutputHandler,
  makeSendTextHandler,
} from '@continuo-terminal/server-node';

describe('server-node handler responses — contract', () => {
  describe('priority handlers (AiQ-consumed)', () => {
    it('create_session success shape', async () => {
      const mockSm = {
        create: vi.fn().mockResolvedValue({ session_id: 's-1', pid: 1234 }),
      };
      const h = makeCreateSessionHandler({ sessions: mockSm as any });
      const result: any = await h({ cwd: '/tmp', cols: 80, rows: 24 });
      expect(result.content?.[0]?.type).toBe('text');
      expect(result.structuredContent).toEqual({ session_id: 's-1', pid: 1234 });
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(result.isError).not.toBe(true);
    });

    it('send_text success shape', async () => {
      const mockSm = {
        sendText: vi.fn().mockResolvedValue({}),
      };
      const h = makeSendTextHandler({ sessions: mockSm as any });
      const result: any = await h({ session_id: 's-1', text: 'hello' });
      expect(result.content?.[0]?.type).toBe('text');
      expect(result.structuredContent).toEqual({});
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(result.isError).not.toBe(true);
    });

    it('read_output success shape', async () => {
      const mockSm = {
        readOutput: vi.fn().mockResolvedValue({ lines: ['hello'], data: "'hello'\n", next_seq: 1, truncated: false }),
      };
      const h = makeReadOutputHandler({ sessions: mockSm as any });
      const result: any = await h({ session_id: 's' });
      expect(result.content?.[0]?.type).toBe('text');
      expect(result.structuredContent).toBeDefined();
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(result.isError).not.toBe(true);
    });

    it('read_output isError:true shape on SESSION_NOT_FOUND', async () => {
      const err: Error & { code?: string } = new Error('not found');
      err.code = 'SESSION_NOT_FOUND';
      const mockSm = {
        readOutput: vi.fn().mockRejectedValue(err),
      };
      const h = makeReadOutputHandler({ sessions: mockSm as any });
      const result: any = await h({ session_id: 'bad' });
      expect(result.isError).toBe(true);
      expect(result.content?.[0]?.type).toBe('text');
      const payload = JSON.parse(result.content[0].text);
      expect(payload).toEqual({ error: 'SESSION_NOT_FOUND', message: 'not found' });
    });
  });
});
