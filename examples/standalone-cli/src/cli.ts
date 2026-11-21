#!/usr/bin/env tsx
import { Command } from 'commander';

import { register as registerAttach } from './commands/attach.js';
import { register as registerCreateSession } from './commands/create-session.js';
import { register as registerDemo } from './commands/demo.js';
import { register as registerListSessions } from './commands/list-sessions.js';
import { register as registerReadOutput } from './commands/read-output.js';
import { register as registerSendText } from './commands/send-text.js';
import { formatError } from './format-error.js';
import { activeClient } from './mcp-client.js';

async function cleanupAndExit(reason: 'SIGINT' | 'SIGTERM'): Promise<void> {
  try {
    await activeClient?.close();
  } catch {
    // Best-effort signal cleanup.
  }
  process.exit(reason === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => {
  void cleanupAndExit('SIGINT');
});
process.on('SIGTERM', () => {
  void cleanupAndExit('SIGTERM');
});

const program = new Command();
program
  .name('continuo-cli')
  .description('Standalone CLI demoing @continuo-terminal/server-node MCP tools.')
  .version('0.0.0');

registerListSessions(program);
registerCreateSession(program);
registerReadOutput(program);
registerSendText(program);
registerAttach(program);
registerDemo(program);

// send-input and press-key are intentionally not exposed as top-level subcommands.
// They remain available to SDK Client callers that need raw bytes or key events,
// and the new `attach` subcommand uses both internally to forward stdin and Ctrl+C.
program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${formatError(err)}\n`);
  process.exit(err && typeof err === 'object' && 'code' in err && err.code === 'ERR_VALIDATION' ? 2 : 3);
});
