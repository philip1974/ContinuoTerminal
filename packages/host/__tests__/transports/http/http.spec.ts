import { afterEach, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { bootstrapAgentHost, type AgentHost } from '../../../src/index.js';

async function connect(endpoint: string, name: string): Promise<Client> {
  const client = new Client({ name, version: '0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  await client.connect(transport);
  return client;
}

describe('HTTP transport host integration', () => {
  let host: AgentHost | undefined;
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
    await host?.dispose();
    host = undefined;
  });

  it('lists server-node tools over host HTTP endpoint', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 } });
    const client = await connect(host.transportInfo.endpoint, 'host-http-test');
    clients.push(client);

    const result = await client.listTools();

    expect(result.tools).toHaveLength(8);
  });

  // Skip on CI: calls terminal.create_session which spawns node-pty PTY;
  // CI runner can't spawn PTY reliably. See ADR-017 pattern #5.
  it.skipIf(process.env.CI === 'true')('allows concurrent HTTP clients to share one host SessionManager', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 } });
    const [clientA, clientB] = await Promise.all([
      connect(host.transportInfo.endpoint, 'host-http-a'),
      connect(host.transportInfo.endpoint, 'host-http-b'),
    ]);
    clients.push(clientA, clientB);

    const [toolsA, toolsB] = await Promise.all([clientA.listTools(), clientB.listTools()]);
    const created = await clientA.callTool({
      name: 'terminal.create_session',
      arguments: { shell: '/bin/bash', autorun: 'sleep 2' },
    });
    const sessionId = (created.structuredContent as { session_id: string }).session_id;
    const listed = await clientB.callTool({ name: 'terminal.list_sessions', arguments: {} });
    const sessions = (listed.structuredContent as { sessions: Array<{ session_id: string }> }).sessions;

    expect(toolsA.tools).toHaveLength(8);
    expect(toolsB.tools).toHaveLength(8);
    expect(sessions.some((session) => session.session_id === sessionId)).toBe(true);
  });
});
