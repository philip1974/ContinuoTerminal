import { Command } from 'commander';

import { readResult, withClient } from '../mcp-client.js';

type ReadOutputResult = {
  lines: string[];
};

function parseInteger(value: string): number {
  return Number.parseInt(value, 10);
}

export function register(program: Command): void {
  program
    .command('read-output')
    .requiredOption('--session-id <id>')
    .option('--since-seq <n>', 'sequence cursor', parseInteger, 0)
    .option('--raw', 'do not strip ANSI escape sequences', false)
    .action(async (options: { sessionId: string; sinceSeq: number; raw: boolean }) => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'terminal.read_output',
          arguments: {
            session_id: options.sessionId,
            since_seq: options.sinceSeq,
            strip_ansi: !options.raw,
          },
        });
        const output = readResult<ReadOutputResult>(result);
        for (const line of output.lines) {
          console.log(line);
        }
      });
    });
}
