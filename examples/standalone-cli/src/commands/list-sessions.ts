import { Command } from 'commander';

import { extractText, withClient } from '../mcp-client.js';

export function register(program: Command): void {
  program.command('list-sessions').action(async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'terminal.list_sessions', arguments: {} });
      console.log(JSON.stringify(result.structuredContent ?? JSON.parse(extractText(result)), null, 2));
    });
  });
}
