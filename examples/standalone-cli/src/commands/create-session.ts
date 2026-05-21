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
    .action(async (options: { cwd?: string; shell?: string; cols?: number; rows?: number }) => {
      // This is a single-process demo: each cli invocation spawns its own
      // server-node child and tears it down on exit, so any session created
      // here cannot be reattached from a later cli invocation. We always
      // kill explicitly so the session id we just printed is consistent
      // with the post-exit reality (gone). For multi-invocation reuse, a
      // future topic will add a real persistent server/daemon mode.
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

        await safeKill(client, created.session_id);
      });
    });
}
