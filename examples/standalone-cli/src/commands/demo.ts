import { Command } from 'commander';

import { extractText, withClient } from '../mcp-client.js';
import { pollUntil } from '../poll.js';

type CreateResult = {
  session_id: string;
  pid?: number;
};

type ReadOutputResult = {
  lines: string[];
};

export function register(program: Command): void {
  program.command('demo').action(async () => {
    await withClient(async (client) => {
      const createResult = await client.callTool({ name: 'terminal.create_session', arguments: { cwd: '/tmp' } });
      const created = (createResult.structuredContent ?? JSON.parse(extractText(createResult))) as CreateResult;
      console.log(`session_id=${created.session_id}`);
      console.log(`session_pid=${created.pid ?? 'unknown'}`);

      await client.callTool({
        name: 'terminal.send_text',
        arguments: { session_id: created.session_id, text: 'echo hello\n' },
      });

      const lines = await pollUntil(async () => {
        const result = await client.callTool({
          name: 'terminal.read_output',
          arguments: { session_id: created.session_id, since_seq: 0, strip_ansi: true },
        });
        const output = (result.structuredContent ?? JSON.parse(extractText(result))) as ReadOutputResult;
        return output.lines.some((line) => line.includes('hello')) ? output.lines : null;
      }, 5000);
      const captured = lines.find((line) => line.includes('hello'));
      console.log(`captured: ${captured?.trim()}`);

      await client.callTool({ name: 'terminal.kill', arguments: { session_id: created.session_id } });

      console.log('demo: SUCCESS');
    });
  });
}
