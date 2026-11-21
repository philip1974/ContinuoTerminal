import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapAgentHost, type AgentHost } from '../../src/index.js';

describe('bootstrapAgentHost', () => {
  let host: AgentHost | undefined;

  afterEach(async () => {
    await host?.dispose();
    host = undefined;
  });

  it('bootstraps stdio-child transport info', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'stdio-child' } });

    expect(host.transportInfo.kind).toBe('stdio-child');
    expect(host.transportInfo.endpoint).toContain('bin.mjs');
  });

  it('bootstraps local HTTP transport info', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 } });

    expect(host.transportInfo.kind).toBe('http');
    expect(host.transportInfo.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });
});
