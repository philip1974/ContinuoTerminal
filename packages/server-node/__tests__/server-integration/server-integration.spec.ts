import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_RESIZE,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
} from '@continuo-terminal/protocol';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../../src/server.ts');
const expectedTools = [
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_KILL,
  MCP_TOOL_RESIZE,
];

function getChildProcess(transport: StdioClientTransport | null): ChildProcess | undefined {
  return (transport as unknown as { _process?: ChildProcess; process?: ChildProcess } | null)?._process;
}

describe('server-integration', { timeout: 60_000 }, () => {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  afterEach(async () => {
    await client?.close();
    const child = getChildProcess(transport);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    client = null;
    transport = null;
  });

  it('initialize + tools/list returns 8 terminal tools with JSON Schema and descriptions', async () => {
    transport = new StdioClientTransport({ command: 'tsx', args: [serverPath] });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });

    await client.connect(transport);
    const result = await client.listTools();
    const toolNames = result.tools.map((tool) => tool.name);

    expect(toolNames).toEqual(expectedTools);
    for (const tool of result.tools) {
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.description?.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toEqual(expect.objectContaining({ type: 'object' }));
    }
  });

  it('tools/call list_sessions returns CallToolResult with empty sessions array', async () => {
    transport = new StdioClientTransport({ command: 'tsx', args: [serverPath] });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });

    await client.connect(transport);
    const result = await client.callTool({ name: MCP_TOOL_LIST_SESSIONS, arguments: {} });
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

    expect(JSON.parse(text)).toEqual({ sessions: [] });
    expect(result.structuredContent).toEqual({ sessions: [] });
  });

  it('terminal.create_session MCP input schema exposes args + env (topic 44) but not session_id', async () => {
    // topic 44 (P1 shell-parity follow-up): args + env are wire-public for
    // cross-repo consumers passing per-session CLI flags + env overrides.
    // session_id remains lib-only (it's an OUTPUT identifier, never input).
    transport = new StdioClientTransport({ command: 'tsx', args: [serverPath] });
    client = new Client({ name: 'test', version: '0' }, { capabilities: {} });

    await client.connect(transport);
    const result = await client.listTools();
    const createTool = result.tools.find((tool) => tool.name === MCP_TOOL_CREATE_SESSION);

    expect(createTool).toBeDefined();
    const schema = createTool!.inputSchema as { properties?: Record<string, unknown> };
    expect(schema.properties).toBeDefined();
    expect(schema.properties).not.toHaveProperty('session_id');
    expect(schema.properties).toHaveProperty('args');
    expect(schema.properties).toHaveProperty('env');
  });
});
