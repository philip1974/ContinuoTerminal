import { Command } from 'commander';

import { readResult, safeKill, withClient } from '../mcp-client.js';
import { parsePositiveInt } from '../parse-args.js';

interface CreateSessionResult {
  session_id: string;
  pid?: number;
}

interface ReadOutputResult {
  lines: string[];
  // Raw byte stream (protocol readOutputOutputSchema). Optional here only for
  // back-compat with pre-`data` sidecars; current server-node always sends it.
  data?: string;
  next_seq: number;
  truncated: boolean;
}

const POLL_DEFAULT_MS = 200;
const CTRL_C_BYTE = 0x03;

/**
 * Choose what to write to stdout for one read_output result. Interactive attach
 * requests `strip_ansi: false` precisely to render a real TUI, so it must emit
 * the raw `data` stream when present — `\r`-only cursor updates (spinner frames,
 * in-place redraws) are corrupted by the split-into-lines + rejoin-with-`\n`
 * path. Only fall back to `lines` for older sidecars that don't send `data`.
 */
export function attachOutputChunk(parsed: Pick<ReadOutputResult, 'lines' | 'data'>): string {
  if (parsed.data !== undefined && parsed.data.length > 0) return parsed.data;
  return parsed.lines.map((line) => `${line}\n`).join('');
}

export function register(program: Command): void {
  program
    .command('attach')
    .description('Attach interactively to a session, forwarding stdin/stdout and Ctrl+C.')
    .option('--session-id <id>', 'session id to attach (if omitted, creates a new session)')
    .option('--cwd <path>', 'cwd when creating a new session')
    .option('--shell <path>', 'shell path when creating a new session')
    .option('--poll-ms <ms>', 'output poll interval in milliseconds (positive integer)', parsePositiveInt, POLL_DEFAULT_MS)
    .action(async (opts: { sessionId?: string; cwd?: string; shell?: string; pollMs: number }) => {
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

        let detachReason = 'eof';
        let resolveDetach: () => void = () => {};
        const detached = new Promise<void>((resolve) => {
          resolveDetach = resolve;
        });

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
            const chunk = attachOutputChunk(parsed);
            if (chunk.length > 0) {
              process.stdout.write(chunk);
              sinceSeq = parsed.next_seq;
            }
          } catch (err) {
            lastError = err;
            // If the server reports the session is gone (PTY exit, killed by
            // another client, server restart), there is nothing more for us
            // to read. Detach immediately so the user is not stuck — Ctrl+D
            // in raw mode goes to the PTY, not to stdin EOF, and Ctrl+C is
            // intentionally forwarded to the PTY too.
            //
            // Detection order (round-5 P2 hardening):
            //   1. Prefer the structured `err.code === 'SESSION_NOT_FOUND'`
            //      tag attached by readResult when the server returns a
            //      JSON-shaped error envelope. This is robust against
            //      future wording / localisation changes.
            //   2. Fall back to matching the canonical English prefix
            //      "Session not found:" for older server-node builds that
            //      have not yet adopted the typed-error contract.
            const code = (err as Error & { code?: string }).code;
            const msg = err instanceof Error ? err.message : String(err);
            if (code === 'SESSION_NOT_FOUND' || /^Session not found:/i.test(msg)) {
              detachReason = 'session-ended';
              resolveDetach();
            }
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

        // Fatal-mode decoder so invalid UTF-8 throws instead of being
        // silently replaced with U+FFFD. Round-7 P2: round-6's comment
        // documented the v0.1 UTF-8-only limitation but the runtime still
        // mangled bytes silently. Now we drop the chunk and warn on
        // stderr so the user can diagnose missing input.
        const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

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
          // Other raw bytes → send_input. v0.1.0 send_input only carries a
          // UTF-8 string; if the chunk is not valid UTF-8 we drop it and
          // emit a visible warning instead of forwarding mojibake to the
          // PTY. Special keys go through press_key, which carries KEY_BYTES
          // separately. A future protocol revision can add a base64 raw-
          // byte path; until then, "fail loud" beats silent corruption.
          let text: string;
          try {
            text = fatalUtf8Decoder.decode(chunk);
          } catch {
            process.stderr.write(
              `[attach warning: dropped ${chunk.length} byte${chunk.length === 1 ? '' : 's'} of input — not valid UTF-8 (send_input is text-only in v0.1; use press_key for special keys)]\n`,
            );
            return;
          }
          try {
            await client.callTool({
              name: 'terminal.send_input',
              arguments: { session_id: sid, data: text },
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

          // Always kill on detach. Even if we didn't, this cli process is
          // about to exit and that closes the server-node child too, so a
          // "kept alive" session would die seconds later anyway. The kill
          // here just makes the post-exit state match what we report.
          await safeKill(client, sid);

          process.stdout.write(`\n[attach exit: ${detachReason}]\n`);
          if (lastError) {
            const msg = lastError instanceof Error ? lastError.message : String(lastError);
            process.stderr.write(`[attach warning: last error: ${msg}]\n`);
          }
        }
      });
    });
}
