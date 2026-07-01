// Example/contract-sync guard (polish phase 2). minimal-react-host's mock
// adapter is copy-paste bait for real adapters, and its terminal.read_output
// return value drifted from the protocol contract (missing the required `data`
// field while its comment claimed strict compliance). This parses the mock's
// actual outputs through the real Zod schemas so the example can't silently
// diverge from the wire contract again.

import { describe, it, expect } from 'vitest';

import {
  createSessionOutputSchema,
  readOutputOutputSchema,
} from '@continuo-terminal/protocol';

import { mockAdapter } from '../../examples/minimal-react-host/src/mock-adapter.js';

function structuredContent(result: unknown): unknown {
  return (result as { structuredContent: unknown }).structuredContent;
}

describe('minimal-react-host mock adapter matches protocol schemas', () => {
  it('create_session output parses under createSessionOutputSchema', async () => {
    const created = await mockAdapter.callTool('terminal.create_session', { cwd: '/tmp' });
    expect(() => createSessionOutputSchema.parse(structuredContent(created))).not.toThrow();
  });

  it('read_output (active + unknown session) parses under readOutputOutputSchema', async () => {
    const created = await mockAdapter.callTool<{ session_id: string }>('terminal.create_session', { cwd: '/tmp' });
    const sessionId = (structuredContent(created) as { session_id: string }).session_id;

    const active = await mockAdapter.callTool('terminal.read_output', { session_id: sessionId, since_seq: 0 });
    const activeParsed = readOutputOutputSchema.parse(structuredContent(active));
    expect(typeof activeParsed.data).toBe('string'); // required field is present

    const unknown = await mockAdapter.callTool('terminal.read_output', { session_id: 'does-not-exist' });
    expect(() => readOutputOutputSchema.parse(structuredContent(unknown))).not.toThrow();
  });
});
