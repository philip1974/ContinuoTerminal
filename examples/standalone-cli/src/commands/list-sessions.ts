import { Command } from 'commander';

import { readResult, withClient } from '../mcp-client.js';

export function register(program: Command): void {
  program.command('list-sessions').action(async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'terminal.list_sessions', arguments: {} });
      const parsed = readResult<unknown>(result);
      console.log(JSON.stringify(parsed, null, 2));
    });
  });
}
