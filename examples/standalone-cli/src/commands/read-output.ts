import { Command } from 'commander';

import { readResult, withClient } from '../mcp-client.js';
import { parseNonNegativeInt } from '../parse-args.js';

type ReadOutputResult = {
  lines: string[];
};

export function register(program: Command): void {
  program
    .command('read-output')
    .requiredOption('--session-id <id>')
    .option('--since-seq <n>', 'sequence cursor (non-negative integer)', parseNonNegativeInt, 0)
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
