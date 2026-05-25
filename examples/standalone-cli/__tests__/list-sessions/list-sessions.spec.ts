import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../../../../packages/server-node/src/server.ts');

function getChildProcess(transport: StdioClientTransport | null): ChildProcess | undefined {
  return (transport as unknown as { _process?: ChildProcess; process?: ChildProcess } | null)?._process;
}

// Skip on CI: spawns `tsx` (not on GH Actions PATH) which then spawns node-pty
// PTY via server-node. See ADR-017 pattern #5.
describe.skipIf(process.env.CI === 'true')('standalone-cli list-sessions MCP client', { timeout: 60_000 }, () => {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  afterEach(async () => {
    await client?.close();
    const child = getChildProcess(transport);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    client = null;
    transport = null;
  });

  it('list_sessions returns empty array on fresh server', async () => {
    transport = new StdioClientTransport({ command: 'tsx', args: [serverPath] });
    client = new Client({ name: 'standalone-cli-test', version: '0' }, { capabilities: {} });

    await client.connect(transport);
    const result = await client.callTool({ name: 'terminal.list_sessions', arguments: {} });

    expect(result.structuredContent).toEqual({ sessions: [] });
  });
});
