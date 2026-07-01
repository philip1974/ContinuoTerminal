import { describe, it, expect } from 'vitest';

import { readResult } from '../../src/mcp-client.js';

// Polish (fresh-codex find): the send-text command previously only awaited
// callTool and ignored the result, so an MCP tool failure — which resolves as
// { isError: true } instead of rejecting — exited 0 silently. send-text now runs
// the result through readResult (like read-output / list-sessions). These lock
// that contract: a send_text-shaped success is fine; an isError envelope throws
// (surfacing SESSION_NOT_FOUND etc. as a non-zero CLI exit).
describe('send-text result unpacking via readResult', () => {
  it('returns quietly for a successful empty send_text result', () => {
    expect(() => readResult<Record<string, never>>({ structuredContent: {} })).not.toThrow();
  });

  it('throws on an isError result, surfacing the SESSION_NOT_FOUND code', () => {
    let caught: (Error & { code?: string }) | undefined;
    try {
      readResult<Record<string, never>>({
        isError: true,
        content: [{ type: 'text', text: '{"error":"SESSION_NOT_FOUND","message":"Session not found: missing"}' }],
      });
    } catch (err) {
      caught = err as Error & { code?: string };
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.code).toBe('SESSION_NOT_FOUND');
  });

  it('throws on a plain-text isError result', () => {
    expect(() =>
      readResult({ isError: true, content: [{ type: 'text', text: 'send failed' }] }),
    ).toThrow('send failed');
  });
});
