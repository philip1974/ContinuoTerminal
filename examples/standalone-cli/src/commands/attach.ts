import { Command } from 'commander';

import { readResult, withClient } from '../mcp-client.js';

interface CreateSessionResult {
  session_id: string;
  pid?: number;
}

interface ReadOutputResult {
  lines: string[];
  next_seq: number;
  truncated: boolean;
}

const POLL_DEFAULT_MS = 200;
const CTRL_C_BYTE = 0x03;

export function register(program: Command): void {
  program
    .command('attach')
    .description('Attach interactively to a session, forwarding stdin/stdout and Ctrl+C.')
    .option('--session-id <id>', 'session id to attach (if omitted, creates a new session)')
    .option('--cwd <path>', 'cwd when creating a new session')
    .option('--shell <path>', 'shell path when creating a new session')
    .option('--poll-ms <ms>', 'output poll interval in milliseconds', (v: string) => Number.parseInt(v, 10), POLL_DEFAULT_MS)
    .option('--keep-alive', 'do not kill the session when detaching', false)
    .action(async (opts: { sessionId?: string; cwd?: string; shell?: string; pollMs: number; keepAlive: boolean }) => {
      // Safety net: even if anything below throws or process.exit is called
      // unexpectedly, leave the user's terminal in a usable state.
      const restoreStdin = (): void => {
        if (process.stdin.isTTY) {
          try {
            process.stdin.setRawMode(false);
          } catch {
            // best-effort; nothing to recover
          }
        }
        try {
          process.stdin.pause();
        } catch {
          // ignore
        }
      };
      process.once('exit', restoreStdin);

      await withClient(async (client) => {
        // Resolve target session.
        let sessionId = opts.sessionId;
        let createdHere = false;
        if (!sessionId) {
          const createArgs: Record<string, string> = {};
          if (opts.cwd) createArgs.cwd = opts.cwd;
          if (opts.shell) createArgs.shell = opts.shell;
          const createRaw = await client.callTool({ name: 'terminal.create_session', arguments: createArgs });
          const created = readResult<CreateSessionResult>(createRaw);
          sessionId = created.session_id;
          createdHere = true;
          process.stdout.write(`[attach: created session ${sessionId}]\n`);
        } else {
          process.stdout.write(`[attach: attaching to session ${sessionId}]\n`);
        }

        const sid = sessionId;

        // Polling read_output → stdout (no overlap; skip tick if previous still inflight).
        let sinceSeq = 0;
        let inFlight = false;
        let lastError: unknown = null;
        const tick = async (): Promise<void> => {
          if (inFlight) return;
          inFlight = true;
          try {
            const raw = await client.callTool({
              name: 'terminal.read_output',
              arguments: { session_id: sid, since_seq: sinceSeq, strip_ansi: false },
            });
            const parsed = readResult<ReadOutputResult>(raw);
            if (parsed.lines.length > 0) {
              for (const line of parsed.lines) {
                process.stdout.write(line);
                process.stdout.write('\n');
              }
              sinceSeq = parsed.next_seq;
            }
          } catch (err) {
            lastError = err;
          } finally {
            inFlight = false;
          }
        };
        const pollHandle = setInterval(() => {
          void tick();
        }, opts.pollMs);
        void tick(); // immediate first fetch

        // Forward stdin → send_input / press_key (Ctrl+C).
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();

        let detachReason = 'eof';
        let resolveDetach: () => void = () => {};
        const detached = new Promise<void>((resolve) => {
          resolveDetach = resolve;
        });

        const onData = async (chunk: Buffer): Promise<void> => {
          // Ctrl+C → press_key('ctrl_c'). Forward to PTY; do not exit attach
          // ourselves so the user can keep using the session if their program
          // ignores SIGINT (e.g. a REPL).
          if (chunk.length === 1 && chunk[0] === CTRL_C_BYTE) {
            try {
              await client.callTool({ name: 'terminal.press_key', arguments: { session_id: sid, key: 'ctrl_c' } });
            } catch (err) {
              lastError = err;
            }
            return;
          }
          // Other raw bytes → send_input. PTY treats data as a string per
          // the protocol schema; we pass through the chunk's UTF-8 view.
          try {
            await client.callTool({
              name: 'terminal.send_input',
              arguments: { session_id: sid, data: chunk.toString('utf-8') },
            });
          } catch (err) {
            lastError = err;
          }
        };
        process.stdin.on('data', (chunk: Buffer) => {
          void onData(chunk);
        });
        process.stdin.once('end', () => {
          detachReason = 'stdin-eof';
          resolveDetach();
        });

        // Signal handlers take ownership of the lifecycle while attached.
        const onSignal = (sig: 'SIGINT' | 'SIGTERM'): void => {
          detachReason = sig;
          resolveDetach();
        };
        const sigintHandler = (): void => onSignal('SIGINT');
        const sigtermHandler = (): void => onSignal('SIGTERM');
        const previousSigintListeners = process.listeners('SIGINT');
        const previousSigtermListeners = process.listeners('SIGTERM');
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.on('SIGINT', sigintHandler);
        process.on('SIGTERM', sigtermHandler);

        try {
          await detached;
        } finally {
          // Tear down attachment in a predictable order.
          clearInterval(pollHandle);
          process.stdin.removeAllListeners('data');
          process.stdin.removeAllListeners('end');
          process.removeListener('SIGINT', sigintHandler);
          process.removeListener('SIGTERM', sigtermHandler);
          for (const l of previousSigintListeners) process.on('SIGINT', l as NodeJS.SignalsListener);
          for (const l of previousSigtermListeners) process.on('SIGTERM', l as NodeJS.SignalsListener);
          restoreStdin();

          if (!opts.keepAlive) {
            try {
              await client.callTool({ name: 'terminal.kill', arguments: { session_id: sid } });
            } catch {
              // best-effort
            }
          }

          process.stdout.write(`\n[attach exit: ${detachReason}${createdHere && opts.keepAlive ? `; session ${sid} kept alive` : ''}]\n`);
          if (lastError) {
            const msg = lastError instanceof Error ? lastError.message : String(lastError);
            process.stderr.write(`[attach warning: last error: ${msg}]\n`);
          }
        }
      });
    });
}
