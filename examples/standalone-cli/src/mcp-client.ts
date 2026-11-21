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

/**
 * Unwrap a CallToolResult into the typed structured payload.
 *
 * If the server signaled `isError: true`, the text content is surfaced as an
 * Error so callers see the Zod / runtime message directly instead of trying
 * to JSON.parse a free-form error string (议题 D.5 cli error path).
 *
 * When the text body is a structured error envelope (`{"error":"CODE",...}`),
 * the parsed `error` value is attached as `.code` on the thrown Error. This
 * gives callers like attach.ts a stable detection path independent of the
 * human-readable message (round-5 P2 hardening — see read-output handler).
 */
export function readResult<O>(raw: unknown): O {
  const r = raw as {
    isError?: boolean;
    structuredContent?: O;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (r.isError) {
    const text = extractText(raw) || 'callTool returned isError without a text body';
    // Try to read a structured error envelope. We require BOTH the body to
    // parse as JSON AND it to look like { error: <string>, ... } before
    // attaching `.code`; arbitrary JSON in error text (e.g. zod messages
    // that happen to start with `{`) must not be silently reshaped.
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'error' in parsed &&
          typeof (parsed as { error: unknown }).error === 'string'
        ) {
          const envelope = parsed as { error: string; message?: unknown };
          const message = typeof envelope.message === 'string' ? envelope.message : text;
          const e = new Error(message) as Error & { code: string };
          e.code = envelope.error;
          throw e;
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && (parseErr as Error & { code?: string }).code) {
          throw parseErr; // structured error we just built — propagate
        }
        // Otherwise fall through to plain-text Error below.
      }
    }
    throw new Error(text);
  }
  if (r.structuredContent !== undefined) return r.structuredContent;
  const text = extractText(raw);
  if (text) return JSON.parse(text) as O;
  throw new Error('callTool: no structuredContent and no text content');
}

/**
 * Best-effort cleanup kill. Used by short-lived cli commands (create-session,
 * demo, attach) when they want to drop a session on exit but cannot fail the
 * outer command on cleanup errors. Surfaces non-success outcomes to stderr so
 * we don't silently lose drift (B26 from the round-2 audit).
 */
export async function safeKill(client: Client, sessionId: string): Promise<void> {
  try {
    const raw = await client.callTool({ name: 'terminal.kill', arguments: { session_id: sessionId } });
    const r = raw as { isError?: boolean };
    if (r.isError) {
      process.stderr.write(`[cleanup warning: kill ${sessionId}: ${extractText(raw)}]\n`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[cleanup warning: kill ${sessionId} threw: ${msg}]\n`);
  }
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
