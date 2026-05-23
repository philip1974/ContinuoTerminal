import { describe, expect, it, vi } from 'vitest';

import { AgentHostImpl } from '../../src/agent-host.js';

describe('AgentHost dispose order', () => {
  it('shuts down HTTP, disposes sessions, then clears tokens', async () => {
    const host = new AgentHostImpl({ transport: { kind: 'stdio-child' } });
    const calls: string[] = [];
    const h = host as unknown as {
      httpHandle: { shutdown: () => Promise<void> };
      sessions: { dispose: () => Promise<void> };
      tokens: { clear: () => void };
    };
    h.httpHandle = { shutdown: vi.fn(async () => void calls.push('http')) };
    h.sessions = { dispose: vi.fn(async () => void calls.push('sessions')) };
    h.tokens = { clear: vi.fn(() => calls.push('tokens')) };

    await host.dispose();

    expect(calls).toEqual(['http', 'sessions', 'tokens']);
  });
});
