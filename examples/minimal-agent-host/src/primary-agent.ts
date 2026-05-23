import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type CallToolTextResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function extractText(result: unknown): string {
  const block = (result as CallToolTextResult).content?.[0];
  return block?.type === 'text' && typeof block.text === 'string' ? block.text : '';
}

function readPayload<T>(result: unknown): T {
  const structured = (result as CallToolTextResult).structuredContent;
  if (structured !== undefined) return structured as T;
  return JSON.parse(extractText(result)) as T;
}

function extractSessionId(result: unknown): string {
  const payload = readPayload<{ session_id?: unknown }>(result);
  if (typeof payload.session_id !== 'string') {
    throw new Error('create_session response did not include session_id');
  }
  return payload.session_id;
}

async function main(): Promise<void> {
  const binPath = requireEnv('MCP_BIN_PATH');
  const subject = requireEnv('MCP_SUBJECT');

  const transport = new StdioClientTransport({
    command: binPath,
    args: [],
    env: { ...process.env } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: subject, version: '0.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log('connected');

    const created = await client.callTool({
      name: 'terminal.create_session',
      arguments: {
        shell: '/bin/bash',
        autorun: 'echo from secondary; sleep 2',
      },
    });
    const sessionId = extractSessionId(created);
    console.log(`secondary-created:${sessionId}`);

    await sleep(900);
    const output = await client.callTool({
      name: 'terminal.read_output',
      arguments: { session_id: sessionId, strip_ansi: true },
    });
    const payload = readPayload<{ lines?: unknown }>(output);
    const lines = Array.isArray(payload.lines) ? payload.lines.map(String) : [];
    console.log(`secondary-output:${lines.join(' | ')}`);

    await client.close();
    console.log('done');
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
