import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../../../packages/server-node/src/server.ts');
const TSX_CLI_MJS = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');

export { Client, StdioClientTransport };

export let activeClient: Client | null = null;
export let activeTransport: StdioClientTransport | null = null;

export function extractText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  const block = r.content?.[0];
  if (block?.type === 'text' && typeof block.text === 'string') {
    return block.text;
  }
  return '';
}

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX_CLI_MJS, SERVER_PATH],
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client({ name: '@continuo-terminal/example-standalone-cli', version: '0.0.0' }, { capabilities: {} });

  activeClient = client;
  activeTransport = transport;

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
    activeClient = null;
    activeTransport = null;
  }
}
