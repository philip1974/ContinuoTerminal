import { Command } from 'commander';

import { readResult, withClient } from '../mcp-client.js';

export function register(program: Command): void {
  program
    .command('send-text')
    .requiredOption('--session-id <id>')
    .requiredOption('--text <text>')
    .option('--newline', 'append a newline before sending', false)
    .action(async (options: { sessionId: string; text: string; newline: boolean }) => {
      const text = options.newline ? `${options.text}\n` : options.text;
      await withClient(async (client) => {
        const raw = await client.callTool({
          name: 'terminal.send_text',
          arguments: { session_id: options.sessionId, text },
        });
        // Unpack via readResult so an MCP tool failure (session gone, rejected)
        // — which resolves as { isError: true } rather than rejecting — surfaces
        // as a thrown error / non-zero exit, not a silent success. Matches the
        // other commands (read-output / list-sessions).
        readResult<Record<string, never>>(raw);
      });
    });
}
