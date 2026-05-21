import { Command } from 'commander';

import { readResult, safeKill, withClient } from '../mcp-client.js';

type CreateResult = {
  session_id: string;
  pid?: number;
};

function parseNumber(value: string): number {
  return Number(value);
}

export function register(program: Command): void {
  program
    .command('create-session')
    .option('--cwd <path>')
    .option('--shell <path>')
    .option('--cols <n>', 'PTY columns', parseNumber)
    .option('--rows <n>', 'PTY rows', parseNumber)
    .option('--keep-alive', 'do not automatically kill the created session', false)
    .action(async (options: { cwd?: string; shell?: string; cols?: number; rows?: number; keepAlive?: boolean }) => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'terminal.create_session',
          arguments: {
            ...(options.cwd ? { cwd: options.cwd } : {}),
            ...(options.shell ? { shell: options.shell } : {}),
            ...(options.cols ? { cols: options.cols } : {}),
            ...(options.rows ? { rows: options.rows } : {}),
          },
        });
        const created = readResult<CreateResult>(result);

        console.log(`session_id=${created.session_id}`);
        console.log(`session_pid=${created.pid ?? 'unknown'}`);

        if (!options.keepAlive) {
          await safeKill(client, created.session_id);
        }
      });
    });
}
