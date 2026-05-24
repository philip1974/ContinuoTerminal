import { spawn } from 'node:child_process';
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
const packageRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const binPath = path.resolve(packageRoot, 'src/bin.mjs');
const linkedBinPath = path.resolve(workspaceRoot, 'node_modules/.bin/continuo-terminal-server');
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

function runBin(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const child = spawn(process.execPath, [binPath, ...args], {
    cwd: packageRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

describe('server-node bin', { timeout: 60_000 }, () => {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  afterEach(async () => {
    await client?.close().catch(() => {});
    const child = getChildProcess(transport);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    client = null;
    transport = null;
  });

  it('--help exits 0 and prints usage', async () => {
    const result = await runBin(['--help']);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage:');
  });

  it('--version exits 0 and prints semver', async () => {
    const result = await runBin(['--version']);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('linked bin from external cwd initializes and lists the eight terminal tools', async () => {
    transport = new StdioClientTransport({
      command: linkedBinPath,
      args: [],
      cwd: '/tmp',
      env: { ...process.env } as Record<string, string>,
    });
    client = new Client({ name: 'server-node-bin-test', version: '0' }, { capabilities: {} });

    await client.connect(transport);
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual(expectedTools);
  });
});
