import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect, createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { describe, expect, it, afterEach } from 'vitest';

import {
  LocalSocketClientTransport,
  SessionManager,
  connectLocalSocketStdioProxy,
  splitLines,
  startLocalSocketTransport,
} from '../../src/index.js';
import type { AuthContext } from '../../src/index.js';

const AUTH: AuthContext = {
  subject: 'local-socket-test',
  scope: 'demo',
  tokenId: 'token-local-socket-test',
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeSocketPath(): Promise<{ dir: string; socketPath: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ct-b1-test-'));
  return { dir, socketPath: path.join(dir, 'sock') };
}

async function connectClient(socketPath: string, name: string): Promise<{ client: Client; transport: LocalSocketClientTransport }> {
  const client = new Client({ name, version: '0' }, { capabilities: {} });
  const transport = new LocalSocketClientTransport(socketPath);
  await client.connect(transport);
  return { client, transport };
}

function waitForSocketClose(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.closed || socket.destroyed) {
      resolve();
      return;
    }
    socket.once('close', () => resolve());
  });
}

function listen(server: NetServer, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeAllListeners('error');
      resolve();
    });
  });
}

describe('local socket transport', { timeout: 60_000 }, () => {
  const dirs: string[] = [];
  const handles: Array<{ shutdown: () => Promise<void> }> = [];
  const clients: Client[] = [];
  const sessions: SessionManager[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
    await Promise.all(handles.splice(0).map((handle) => handle.shutdown().catch(() => {})));
    await Promise.all(sessions.splice(0).map((sessionManager) => sessionManager.dispose().catch(() => {})));
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function start(options: Partial<Parameters<typeof startLocalSocketTransport>[0]> = {}) {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);
    const sessionManager = options.sessions ?? new SessionManager();
    sessions.push(sessionManager);
    const handle = await startLocalSocketTransport({
      sessions: sessionManager,
      socketPath,
      ...options,
    });
    handles.push(handle);
    return { dir, socketPath, sessionManager, handle };
  }

  it('creates a private parent directory and chmods the socket to 0600', async () => {
    const { dir, socketPath } = await start();

    const parentMode = (await stat(dir)).mode & 0o777;
    const socketMode = (await stat(socketPath)).mode & 0o777;

    expect(parentMode).toBe(0o700);
    expect(socketMode).toBe(0o600);
  });

  it('connects an SDK client over local socket and lists the seven terminal tools', async () => {
    const { socketPath } = await start();
    const { client } = await connectClient(socketPath, 'local-socket-c2');
    clients.push(client);

    const result = await client.listTools();

    expect(result.tools).toHaveLength(7);
  });

  it('shares one SessionManager across multiple socket clients', async () => {
    const { socketPath } = await start();
    const [clientA, clientB] = await Promise.all([
      connectClient(socketPath, 'local-socket-a'),
      connectClient(socketPath, 'local-socket-b'),
    ]);
    clients.push(clientA.client, clientB.client);

    const created = await clientA.client.callTool({
      name: 'terminal.create_session',
      arguments: { shell: '/bin/bash', autorun: 'sleep 2' },
    });
    const sessionId = (created.structuredContent as { session_id: string }).session_id;
    const listed = await clientB.client.callTool({
      name: 'terminal.list_sessions',
      arguments: {},
    });
    const listedSessions = (listed.structuredContent as { sessions: Array<{ session_id: string }> }).sessions;

    expect(listedSessions.some((session) => session.session_id === sessionId)).toBe(true);
  });

  it('unlinks the socket on shutdown', async () => {
    const { socketPath, handle } = await start();

    await handle.shutdown();
    handles.pop();

    await expect(stat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('replaces stale socket paths but never unlinks non-socket paths', async () => {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);
    const stale = createNetServer();
    await listen(stale, socketPath);
    await new Promise<void>((resolve) => stale.close(() => resolve()));

    const sessionManager = new SessionManager();
    sessions.push(sessionManager);
    const handle = await startLocalSocketTransport({ sessions: sessionManager, socketPath });
    handles.push(handle);

    await expect(stat(socketPath)).resolves.toBeTruthy();
  });

  it('splits NDJSON chunks without mutating caller state', () => {
    const first = splitLines('', '{"a":1}\n{"b"');
    const second = splitLines(first.buffer, ':2}\n');

    expect(first).toEqual({ buffer: '{"b"', lines: ['{"a":1}'] });
    expect(second).toEqual({ buffer: '', lines: ['{"b":2}'] });
  });

  it('closes unauthenticated socket connections', async () => {
    const { socketPath } = await start({
      authenticateRequest: () => null,
    });
    const socket = connect(socketPath);

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });
    await waitForSocketClose(socket);

    expect(socket.destroyed).toBe(true);
  });

  it('applies authorizeToolCall denials after successful connect auth', async () => {
    const { socketPath } = await start({
      authenticateRequest: () => AUTH,
      authorizeToolCall: () => ({ allow: false, reason: 'blocked by local policy' }),
    });
    const { client } = await connectClient(socketPath, 'local-socket-deny');
    clients.push(client);

    const result = await client.callTool({
      name: 'terminal.list_sessions',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'blocked by local policy' }]);
  });

  it('bridges injected stdio streams through the local socket proxy', async () => {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);
    const rawServer = createNetServer((socket) => {
      socket.on('data', (chunk) => {
        if (chunk.toString('utf8').includes('ping')) socket.write('pong\n');
      });
    });
    await listen(rawServer, socketPath);

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let output = '';
    stdout.setEncoding('utf8');
    stdout.on('data', (chunk) => {
      output += chunk;
    });

    const proxy = await connectLocalSocketStdioProxy({ socketPath, stdin, stdout });
    stdin.write('ping\n');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for proxy output')), 2000);
      stdout.on('data', () => {
        if (!output.includes('pong')) return;
        clearTimeout(timer);
        resolve();
      });
    });

    await proxy.shutdown();
    await new Promise<void>((resolve) => rawServer.close(() => resolve()));
    expect(output).toContain('pong');
  });

  it('keeps local socket transport source terms generic', async () => {
    const root = path.resolve(__dirname, '../../src/transports');
    const sources = await Promise.all([
      readFile(path.join(root, 'local-socket.ts'), 'utf8'),
      readFile(path.join(root, 'local-socket-client.ts'), 'utf8'),
      readFile(path.join(root, 'local-socket-proxy.ts'), 'utf8'),
    ]);

    expect(sources.join('\n')).not.toMatch(/Continuo|window|panel/);
  });

  it('closes connections that send malformed JSON', async () => {
    const { socketPath } = await start();
    const socket = connect(socketPath);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });

    socket.write('not-json\n');

    await waitForSocketClose(socket);
    expect(socket.destroyed).toBe(true);
  });

  it('survives a client disconnecting mid-request', async () => {
    const { socketPath } = await start();
    const socket = connect(socketPath);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });
    socket.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"');
    socket.destroy();

    const { client } = await connectClient(socketPath, 'after-disconnect');
    clients.push(client);
    const result = await client.listTools();

    expect(result.tools).toHaveLength(7);
  });

  it('throws when authorizeToolCall is configured without authenticateRequest', async () => {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);

    await expect(startLocalSocketTransport({
      sessions: new SessionManager(),
      socketPath,
      authorizeToolCall: () => ({ allow: true }),
    })).rejects.toThrow(/authorizeToolCall requires authenticateRequest/);
  });

  it('throws when the socket path already exists and is not a socket', async () => {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);
    await writeFile(socketPath, 'not a socket');

    await expect(startLocalSocketTransport({
      sessions: new SessionManager(),
      socketPath,
    })).rejects.toThrow(/not a socket/);
  });

});
