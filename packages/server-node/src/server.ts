import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_RESIZE,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  createSessionInputSchema,
  killInputSchema,
  listSessionsInputSchema,
  pressKeyInputSchema,
  readOutputInputSchema,
  resizeInputSchema,
  sendInputInputSchema,
  sendTextInputSchema,
} from '@continuo-terminal/protocol';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { makeCreateSessionHandler } from './handlers/create-session.js';
import { makeKillHandler } from './handlers/kill.js';
import { makeListSessionsHandler } from './handlers/list-sessions.js';
import { makePressKeyHandler } from './handlers/press-key.js';
import { makeReadOutputHandler } from './handlers/read-output.js';
import { makeResizeHandler } from './handlers/resize.js';
import { makeSendInputHandler } from './handlers/send-input.js';
import { makeSendTextHandler } from './handlers/send-text.js';
import { SessionManager } from './session-manager.js';
import type { AuthContext, AuthorizationDecision, AuthorizeToolCall } from './auth-hooks.js';

// Tool descriptions are surfaced verbatim in tools/list and form the
// contract LLM/MCP hosts see. They MUST match the actual schema and
// implementation — round-3/4/5/6 audits each caught new drift between
// these strings and reality. Verify before changing the schema or
// SessionManager that the matching line here is updated.
const TOOL_DESCRIPTIONS = {
  [MCP_TOOL_CREATE_SESSION]: 'Start a new pseudo-terminal session with optional cwd, shell, cols, rows, autorun, and agentLabel. (A `target` field is accepted on the schema for forward compatibility but is currently ignored by server-node — see protocol JSDoc for the host-routing roadmap.)',
  [MCP_TOOL_LIST_SESSIONS]: 'List all active terminal sessions in this server.',
  [MCP_TOOL_SEND_INPUT]: "Write a UTF-8 text string to a session's PTY stdin (no encoding transform; bytes that are not valid UTF-8 cannot be transported via this tool — use terminal.press_key for special keys).",
  [MCP_TOOL_SEND_TEXT]: "Write text to a session's PTY stdin verbatim (no newline normalization; pair with terminal.press_key for Enter).",
  [MCP_TOOL_PRESS_KEY]: 'Press a special key (enter/tab/ctrl_c/arrows/...) in a session.',
  [MCP_TOOL_READ_OUTPUT]: 'Read accumulated output from a session, with optional since_seq cursor and ANSI strip.',
  [MCP_TOOL_KILL]: 'Terminate a session by sending the requested signal (SIGINT / SIGTERM / SIGKILL; defaults to SIGTERM). No automatic escalation — the caller is responsible for retrying with a stronger signal if the process does not exit.',
  [MCP_TOOL_RESIZE]: "Resize a session's PTY columns + rows. Use on viewport resize / xterm fit-addon events to keep PTY size in sync with renderer cols/rows so TUI apps (Claude Code, Codex CLI, htop, vim) can reflow correctly. node-pty resize errors (EBADF / ENOTTY / EINVAL) propagate as isError.",
} as const;

export interface CreateTerminalMcpServerOptions {
  sessions?: SessionManager;
  auth?: AuthContext | null;
  authorizeToolCall?: AuthorizeToolCall;
}

export function createTerminalMcpServer(opts: CreateTerminalMcpServerOptions = {}) {
  const { sessions = new SessionManager(), auth = null, authorizeToolCall } = opts;
  const server = new Server(
    {
      name: '@continuo-terminal/server-node',
      // Keep in sync with packages/server-node/package.json version. Hosts
      // read this via the MCP `initialize` response; round-8 audit P2
      // caught it stuck at 0.0.0 after the v0.1.0 stamp.
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const handlers = {
    [MCP_TOOL_CREATE_SESSION]: makeCreateSessionHandler({ sessions }),
    [MCP_TOOL_LIST_SESSIONS]: makeListSessionsHandler({ sessions }),
    [MCP_TOOL_SEND_INPUT]: makeSendInputHandler({ sessions }),
    [MCP_TOOL_SEND_TEXT]: makeSendTextHandler({ sessions }),
    [MCP_TOOL_PRESS_KEY]: makePressKeyHandler({ sessions }),
    [MCP_TOOL_READ_OUTPUT]: makeReadOutputHandler({ sessions }),
    [MCP_TOOL_KILL]: makeKillHandler({ sessions }),
    [MCP_TOOL_RESIZE]: makeResizeHandler({ sessions }),
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: MCP_TOOL_CREATE_SESSION,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_CREATE_SESSION],
        inputSchema: zodToJsonSchema(createSessionInputSchema),
      },
      {
        name: MCP_TOOL_LIST_SESSIONS,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_LIST_SESSIONS],
        inputSchema: zodToJsonSchema(listSessionsInputSchema),
      },
      {
        name: MCP_TOOL_SEND_INPUT,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_SEND_INPUT],
        inputSchema: zodToJsonSchema(sendInputInputSchema),
      },
      {
        name: MCP_TOOL_SEND_TEXT,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_SEND_TEXT],
        inputSchema: zodToJsonSchema(sendTextInputSchema),
      },
      {
        name: MCP_TOOL_PRESS_KEY,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_PRESS_KEY],
        inputSchema: zodToJsonSchema(pressKeyInputSchema),
      },
      {
        name: MCP_TOOL_READ_OUTPUT,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_READ_OUTPUT],
        inputSchema: zodToJsonSchema(readOutputInputSchema),
      },
      {
        name: MCP_TOOL_KILL,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_KILL],
        inputSchema: zodToJsonSchema(killInputSchema),
      },
      {
        name: MCP_TOOL_RESIZE,
        description: TOOL_DESCRIPTIONS[MCP_TOOL_RESIZE],
        inputSchema: zodToJsonSchema(resizeInputSchema),
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};

    if (authorizeToolCall) {
      let decision: AuthorizationDecision;
      try {
        decision = await authorizeToolCall({ auth, toolName, arguments: args });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[server-node] authorize hook threw: ${message}\n`);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'authorize hook failure' }],
        };
      }
      if (!decision.allow) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: decision.reason ?? 'not authorized' }],
        };
      }
    }

    const handler = handlers[toolName as keyof typeof handlers];
    if (!handler) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }],
      };
    }

    return handler(args);
  });

  return { server, sessions };
}

export type MainOptions = {
  transport?: 'stdio' | 'http';
  port?: number;
  host?: string;
};

async function mainHttp({ port = 0, host = '127.0.0.1' }: MainOptions): Promise<void> {
  const sessions = new SessionManager();
  const { startHttpTransport } = await import('./transports/http.js');
  const started = await startHttpTransport({ sessions, port, host });

  process.stdout.write(`continuo-terminal-server listening on http://${started.address}:${started.port}/mcp\n`);

  const SHUTDOWN_STEP_TIMEOUT_MS = 5000;
  const withTimeout = async <T>(p: Promise<T>, label: string): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`shutdown timeout: ${label}`)), SHUTDOWN_STEP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let shuttingDown = false;
  const shutdownAll = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await withTimeout(started.shutdown(), 'httpServer.close');
    } catch {
      // best-effort: listener may already be closed
    }
    try {
      await withTimeout(sessions.dispose(), 'sessions.dispose');
    } catch {
      // best-effort: dispose failure must not block process exit
    }
    process.exit(exitCode);
  };

  process.once('SIGINT', () => void shutdownAll(130));
  process.once('SIGTERM', () => void shutdownAll(0));
  process.once('SIGHUP', () => void shutdownAll(0));
  process.once('SIGQUIT', () => void shutdownAll(0));
}

async function mainStdio(): Promise<void> {
  const { server, sessions } = createTerminalMcpServer();
  const transport = new StdioServerTransport();

  // Three shutdown paths exist for an MCP stdio server, and all three must
  // converge on the same cleanup sequence (dispose PTYs → close protocol →
  // close transport → exit) so live shell children are not orphaned and
  // in-flight stdio responses are not lost:
  //
  //   1. Host closes stdin             → transport.onclose fires
  //   2. POSIX signal (SIGINT/SIGTERM) → process signal handler
  //   3. main() exits naturally        → never happens here (long-lived)
  //
  // Round-4 wired only (2) and called process.exit directly without closing
  // the SDK transport, dropping any responses still flushing on stdout.
  // Round-5 audit P1: route everything through shutdownAll() and await
  // server.close() before exiting.
  // Bounded timeout for each step of shutdown. Without this, a stuck PTY
  // (e.g. a shell ignoring SIGTERM) or a hung SDK close would block the
  // Node process forever on a host-disconnect. 5s is long enough for
  // real cleanup; if it elapses we exit anyway so the user is never stuck.
  const SHUTDOWN_STEP_TIMEOUT_MS = 5000;
  const withTimeout = async <T>(p: Promise<T>, label: string): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`shutdown timeout: ${label}`)), SHUTDOWN_STEP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let shuttingDown = false;
  const shutdownAll = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await withTimeout(sessions.dispose(), 'sessions.dispose');
    } catch {
      // best-effort: dispose failure must not block transport close
    }
    try {
      // Server.close() is best-effort: SDK 1.29 Protocol.close() aborts
      // in-flight request handlers (they observe AbortError) and calls
      // transport.close() under the hood, but does NOT flush responses
      // that haven't been sent yet. We don't call transport.close()
      // ourselves to avoid double-close. Round-8 audit P2: prior comment
      // overclaimed "flushes in-flight responses" — the SDK source proves
      // pending responses can be lost during shutdown.
      await withTimeout(server.close(), 'server.close');
    } catch {
      // best-effort: if onclose already fired the transport may be closed
    }
    process.exit(exitCode);
  };

  // Round-7 P1: the stdin EOF path must be wired directly on process.stdin,
  // NOT via transport.onclose. SDK 1.29 StdioServerTransport.start() only
  // listens to 'data' and 'error' on stdin — it never installs 'end' or
  // 'close' listeners. As a result, transport.onclose only fires when
  // transport.close() is invoked explicitly (i.e. by us inside shutdownAll
  // → server.close() → transport.close()), which means relying on it for
  // host-detach detection was dead code in rounds 5/6: the host closing our
  // stdin would silently leave every live PTY orphaned. Listening on
  // process.stdin directly is the only reliable hook.
  const onStdinClosed = (): void => void shutdownAll(0);
  process.stdin.once('end', onStdinClosed);
  process.stdin.once('close', onStdinClosed);

  // Round-6 P2: cover the common termination signals, not just SIGINT/
  // SIGTERM. SIGHUP fires when the controlling terminal disappears (ssh
  // disconnect, parent shell exit); SIGQUIT during process supervision.
  // Without these, PTY children are orphaned on the most common detach
  // scenarios.
  process.once('SIGINT', () => void shutdownAll(130));
  process.once('SIGTERM', () => void shutdownAll(0));
  process.once('SIGHUP', () => void shutdownAll(0));
  process.once('SIGQUIT', () => void shutdownAll(0));

  await server.connect(transport);
}

export async function main(opts: MainOptions = {}): Promise<void> {
  if ((opts.transport ?? 'stdio') === 'http') {
    await mainHttp(opts);
    return;
  }

  await mainStdio();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
