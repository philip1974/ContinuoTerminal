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
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  createSessionInputSchema,
  killInputSchema,
  listSessionsInputSchema,
  pressKeyInputSchema,
  readOutputInputSchema,
  sendInputInputSchema,
  sendTextInputSchema,
} from '@continuo-terminal/protocol';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { makeCreateSessionHandler } from './handlers/create-session.js';
import { makeKillHandler } from './handlers/kill.js';
import { makeListSessionsHandler } from './handlers/list-sessions.js';
import { makePressKeyHandler } from './handlers/press-key.js';
import { makeReadOutputHandler } from './handlers/read-output.js';
import { makeSendInputHandler } from './handlers/send-input.js';
import { makeSendTextHandler } from './handlers/send-text.js';
import { SessionManager } from './session-manager.js';

const TOOL_DESCRIPTIONS = {
  [MCP_TOOL_CREATE_SESSION]: 'Start a new pseudo-terminal session with optional cwd, env, cols, rows.',
  [MCP_TOOL_LIST_SESSIONS]: 'List all active terminal sessions in this server.',
  [MCP_TOOL_SEND_INPUT]: "Write raw string data to a session's PTY stdin (no encoding applied; pass the bytes you want the PTY to read).",
  [MCP_TOOL_SEND_TEXT]: "Write text to a session's PTY stdin verbatim (no newline normalization; pair with terminal.press_key for Enter).",
  [MCP_TOOL_PRESS_KEY]: 'Press a special key (enter/tab/ctrl_c/arrows/...) in a session.',
  [MCP_TOOL_READ_OUTPUT]: 'Read accumulated output from a session, with optional since_seq cursor and ANSI strip.',
  [MCP_TOOL_KILL]: 'Terminate a session (graceful SIGTERM then SIGKILL fallback).',
} as const;

export function createTerminalMcpServer({ sessions = new SessionManager() } = {}) {
  const server = new Server(
    {
      name: '@continuo-terminal/server-node',
      version: '0.0.0',
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
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handler = handlers[request.params.name as keyof typeof handlers];
    if (!handler) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${request.params.name}` }],
      };
    }

    return handler(request.params.arguments ?? {});
  });

  return { server, sessions };
}

export async function main(): Promise<void> {
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
  let shuttingDown = false;
  const shutdownAll = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await sessions.dispose();
    } catch {
      // best-effort: a dispose failure must not block transport close
    }
    try {
      // Server.close() flushes in-flight responses and calls
      // transport.close() under the hood; we do not call transport.close()
      // ourselves to avoid double-close.
      await server.close();
    } catch {
      // best-effort: if onclose already fired the transport may be closed
    }
    process.exit(exitCode);
  };

  transport.onclose = (): void => {
    // Stdin EOF / host detached → graceful shutdown with 0 exit code.
    void shutdownAll(0);
  };
  process.once('SIGINT', () => void shutdownAll(130));
  process.once('SIGTERM', () => void shutdownAll(0));

  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
