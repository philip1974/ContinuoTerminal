import { Command } from 'commander';

import { withClient } from '../mcp-client.js';

export function register(program: Command): void {
  program
    .command('send-text')
    .requiredOption('--session-id <id>')
    .requiredOption('--text <text>')
    .option('--newline', 'append a newline before sending', false)
    .action(async (options: { sessionId: string; text: string; newline: boolean }) => {
      const text = options.newline ? `${options.text}\n` : options.text;
      await withClient(async (client) => {
        await client.callTool({
          name: 'terminal.send_text',
          arguments: { session_id: options.sessionId, text },
        });
      });
    });
}
