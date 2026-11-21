import { describe, expect, it, vi } from 'vitest';

import { makeListSessionsHandler } from '../../src/handlers/list-sessions.js';

describe('terminal.list_sessions', () => {
  it('returns text and structured content for valid input', async () => {
    const output = {
      sessions: [
        {
          session_id: 's1',
          title: 'demo',
          cwd: process.cwd(),
          origin: 'user',
          created_at: 1,
          exit_code: null,
        },
      ],
    };
    const sessions = { list: vi.fn().mockResolvedValue(output) };
    const handler = makeListSessionsHandler({ sessions: sessions as any });

    const result = await handler({});

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual(output);
    expect(result.structuredContent).toEqual(output);
  });

  it('returns an MCP error result for invalid input', async () => {
    const handler = makeListSessionsHandler({ sessions: { list: vi.fn() } as any });

    const result = await handler({ extra: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('returns an MCP error result when the manager throws', async () => {
    const handler = makeListSessionsHandler({
      sessions: { list: vi.fn().mockRejectedValue(new Error('list failed')) } as any,
    });

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('list failed');
  });

  // Round-5 P2: SessionManager now persists origin + agentLabel from
  // create() inputs. The list() output schema already exposed both fields,
  // so this anchors the round-trip — handler must not strip them.
  it('round-trips origin=agent and agent_label for agent-spawned sessions', async () => {
    const output = {
      sessions: [
        {
          session_id: 's-agent-1',
          title: 'codex-pty',
          cwd: '/tmp',
          origin: 'agent',
          agent_label: 'codex',
          created_at: 1,
          exit_code: null,
        },
      ],
    };
    const sessions = { list: vi.fn().mockResolvedValue(output) };
    const handler = makeListSessionsHandler({ sessions: sessions as any });

    const result = await handler({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(output);
    const parsed = JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '');
    expect(parsed.sessions[0].origin).toBe('agent');
    expect(parsed.sessions[0].agent_label).toBe('codex');
  });
});
