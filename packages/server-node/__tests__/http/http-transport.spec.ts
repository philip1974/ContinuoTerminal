import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const binPath = path.resolve(packageRoot, 'src/bin.mjs');
const linkedBinPath = path.resolve(workspaceRoot, 'node_modules/.bin/continuo-terminal-server');
const LISTEN_MARKER = 'continuo-terminal-server listening on ';

type SpawnResult = {
  child: ChildProcess;
  stdout: () => string;
  stderr: () => string;
};

function spawnBin(args: string[], command = process.execPath): SpawnResult {
  const child = command === process.execPath
    ? spawn(command, [binPath, ...args], { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(command, args, { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  return { child, stdout: () => stdout, stderr: () => stderr };
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
}

function waitForListen(spawned: SpawnResult): Promise<URL> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${LISTEN_MARKER}`)), 10_000);
    const check = (): void => {
      const stdout = spawned.stdout();
      const line = stdout.split(/\r?\n/).find((candidate) => candidate.includes(LISTEN_MARKER));
      if (!line) return;
      clearTimeout(timer);
      const url = line.slice(line.indexOf('http://')).trim();
      resolve(new URL(url));
    };

    spawned.child.stdout?.on('data', check);
    spawned.child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`HTTP server exited before listen marker: code=${code ?? 'null'} signal=${signal ?? 'null'}`));
    });
    check();
  });
}

async function connectClient(url: URL, name: string): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const client = new Client({ name, version: '0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);
  return { client, transport };
}

describe('streamable HTTP transport', { timeout: 60_000 }, () => {
  const children: ChildProcess[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
    for (const child of children.splice(0)) {
      if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
    }
  });

  it('prints an HTTP listen marker with the actual port', async () => {
    const spawned = spawnBin(['--transport', 'http', '--port', '0']);
    children.push(spawned.child);

    const url = await waitForListen(spawned);

    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname).toBe('/mcp');
    expect(Number(url.port)).toBeGreaterThan(0);
  });

  it('connects over Streamable HTTP and lists the eight terminal tools', async () => {
    const spawned = spawnBin(['--transport', 'http', '--port', '0']);
    children.push(spawned.child);
    const url = await waitForListen(spawned);
    const { client } = await connectClient(url, 'http-test');
    clients.push(client);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual([
      'terminal.create_session',
      'terminal.list_sessions',
      'terminal.send_input',
      'terminal.send_text',
      'terminal.press_key',
      'terminal.read_output',
      'terminal.kill',
      'terminal.resize',
    ]);
  });

  it('rejects invalid transport values with exit code 2', async () => {
    const spawned = spawnBin(['--transport', 'tcp']);
    const code = await waitForExit(spawned.child);

    expect(code).toBe(2);
    expect(spawned.stderr()).toContain('Invalid --transport');
  });

  it('explicit stdio mode does not print the HTTP listen marker', async () => {
    const spawned = spawnBin(['--transport', 'stdio']);
    children.push(spawned.child);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(spawned.stdout()).not.toContain(LISTEN_MARKER);
  });

  it('binds to 127.0.0.1 by default', async () => {
    const spawned = spawnBin(['--transport', 'http', '--port', '0']);
    children.push(spawned.child);
    const url = await waitForListen(spawned);

    await new Promise<void>((resolve, reject) => {
      const req = http.request(url, { method: 'GET', headers: { accept: 'text/event-stream' } }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', reject);
      req.end();
    });

    expect(url.hostname).toBe('127.0.0.1');
  });

  // Skip on CI: calls terminal.create_session which spawns node-pty PTY;
  // CI runner can't spawn PTY reliably. See ADR-017 pattern #5.
  it.skipIf(process.env.CI === 'true')('allows concurrent clients to share one SessionManager', async () => {
    const spawned = spawnBin(['--transport', 'http', '--port', '0'], linkedBinPath);
    children.push(spawned.child);
    const url = await waitForListen(spawned);
    const [clientA, clientB] = await Promise.all([
      connectClient(url, 'http-client-a'),
      connectClient(url, 'http-client-b'),
    ]);
    clients.push(clientA.client, clientB.client);

    const [toolsA, toolsB] = await Promise.all([
      clientA.client.listTools(),
      clientB.client.listTools(),
    ]);
    const created = await clientA.client.callTool({
      name: 'terminal.create_session',
      arguments: { shell: '/bin/bash', autorun: 'sleep 2' },
    });
    const sessionId = (created.structuredContent as { session_id: string }).session_id;
    const listed = await clientB.client.callTool({
      name: 'terminal.list_sessions',
      arguments: {},
    });
    const sessions = (listed.structuredContent as { sessions: Array<{ session_id: string }> }).sessions;

    expect(toolsA.tools).toHaveLength(8);
    expect(toolsB.tools).toHaveLength(8);
    expect(sessions.some((session) => session.session_id === sessionId)).toBe(true);
  });
});
