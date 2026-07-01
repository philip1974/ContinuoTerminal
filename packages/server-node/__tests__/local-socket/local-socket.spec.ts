import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect, createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  MCP_TOOL_AWAIT_STOP_HOOK,
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_RESIZE,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
} from '@continuo-terminal/protocol';
import { describe, expect, it, afterEach, vi } from 'vitest';

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

  it('connects an SDK client over local socket and lists the eight terminal tools', async () => {
    const { socketPath } = await start();
    const { client } = await connectClient(socketPath, 'local-socket-c2');
    clients.push(client);

    const result = await client.listTools();

    expect(result.tools).toHaveLength(8);
  });

  // Contract-honesty guard: the protocol declares MCP_TOOL_AWAIT_STOP_HOOK and
  // create_session's install_stop_hook/include_raw/stop_hook_installed fields,
  // but server-node 0.1.x does not implement them (reserved for the stop-hook
  // roadmap). This test — unlike the tsx-spawning server-integration one — runs
  // on CI, so it locks the advertised surface so the drift can't silently
  // reappear as a working-looking-but-no-op tool. See schemas.ts JSDoc.
  it('does not advertise the unimplemented await_stop_hook tool', async () => {
    const { socketPath } = await start();
    const { client } = await connectClient(socketPath, 'local-socket-contract');
    clients.push(client);

    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toEqual([
      MCP_TOOL_CREATE_SESSION,
      MCP_TOOL_LIST_SESSIONS,
      MCP_TOOL_SEND_INPUT,
      MCP_TOOL_SEND_TEXT,
      MCP_TOOL_PRESS_KEY,
      MCP_TOOL_READ_OUTPUT,
      MCP_TOOL_KILL,
      MCP_TOOL_RESIZE,
    ]);
    expect(names).not.toContain(MCP_TOOL_AWAIT_STOP_HOOK);
  });

  // Skip on CI: calls terminal.create_session which spawns node-pty PTY;
  // CI runner can't spawn PTY reliably. See ADR-017 pattern #5.
  it.skipIf(process.env.CI === 'true')('shares one SessionManager across multiple socket clients', async () => {
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

  it('reconstructs a multi-byte UTF-8 char split across socket chunks (StringDecoder + splitLines)', () => {
    // 复现 transport handleData 的解码路径:非 ASCII 内容(cwd/name/send_text)在真实网络
    // 分包下可能把一个多字节字符切成两个 data 事件。逐 chunk toString() 会解出 �;
    // 用 StringDecoder 跨 chunk 保留半个字符,才能无损重建。
    const decoder = new StringDecoder('utf8');
    const full = Buffer.from('{"text":"€🚀"}\n', 'utf8');
    const cut = full.indexOf(0xe2) + 1; // 切在 € (E2 82 AC) 的第 1、2 字节之间

    const first = splitLines('', decoder.write(full.subarray(0, cut)));
    const second = splitLines(first.buffer, decoder.write(full.subarray(cut)));

    expect(first.lines).toEqual([]); // 半个字符未成行,也没有产生 �
    expect(first.buffer).not.toContain('�');
    expect(second.lines).toEqual(['{"text":"€🚀"}']);
    expect(second.buffer).toBe('');
    expect(JSON.parse(second.lines[0]!)).toEqual({ text: '€🚀' });
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

  // Polish round-7: after connect, the proxy removes its connect-phase error
  // listener. Without a runtime error handler a mid-bridge socket error
  // (server crash/reset → ECONNRESET/EPIPE) is an unhandled 'error' event that
  // crashes the proxy process. This test resets the connection mid-bridge and
  // asserts the proxy survives and shutdown() stays idempotent. (Pre-fix, the
  // unhandled 'error' surfaces as an uncaughtException and fails the test.)
  it('survives a mid-bridge socket reset without an unhandled error crash', async () => {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);
    const rawServer = createNetServer((socket) => {
      // Simulate a server crash / reset shortly after accept (once the client
      // has connected, so the connect promise resolves first).
      setTimeout(() => socket.destroy(), 20);
    });
    await listen(rawServer, socketPath);

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const proxy = await connectLocalSocketStdioProxy({ socketPath, stdin, stdout });

    // Let the server-side destroy reset the client socket, then push data so a
    // write-after-destroy also surfaces as a socket 'error' during bridging.
    await new Promise((resolve) => setTimeout(resolve, 40));
    stdin.write('after-reset\n');
    await new Promise((resolve) => setTimeout(resolve, 30));

    await expect(proxy.shutdown()).resolves.toBeUndefined();
    await expect(proxy.shutdown()).resolves.toBeUndefined(); // idempotent

    await new Promise<void>((resolve) => rawServer.close(() => resolve()));
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

    expect(result.tools).toHaveLength(8);
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

  // Polish (fresh-codex find): the sun_path limit is in BYTES. A non-ASCII path
  // (e.g. CJK) whose UTF-16 char length is under the limit but whose UTF-8 byte
  // length is over it must be rejected up-front with a clear RangeError, not
  // pass the pre-check and fail later as an opaque `listen EINVAL`.
  it('rejects a socket path that exceeds the byte limit even when char length does not', async () => {
    const longNonAscii = `/tmp/${'한'.repeat(40)}/sock`; // 40 chars, ~120 UTF-8 bytes
    expect(longNonAscii.length).toBeLessThan(100); // would pass a naive .length check
    const sessionManager = new SessionManager();
    sessions.push(sessionManager);

    await expect(startLocalSocketTransport({
      sessions: sessionManager,
      socketPath: longNonAscii,
    })).rejects.toThrow(/exceeds \d+ bytes/);
  });

  // Polish (fresh-codex find): a failed connect must NOT poison the transport.
  // Before the fix, start() stored the socket before connecting and left the
  // failed socket in place on error, so a retry short-circuited (`if
  // (this.socket) return`) and send() then failed "local socket client is
  // closed". Common under a server/sidecar startup race.
  it('LocalSocketClientTransport.start() is retryable after an initial connect failure', async () => {
    const { dir, socketPath } = await makeSocketPath();
    dirs.push(dir);

    const transport = new LocalSocketClientTransport(socketPath);
    await expect(transport.start()).rejects.toBeTruthy(); // no server listening yet

    // Bring the server up on the same path, then reconnect the SAME transport.
    const sessionManager = new SessionManager();
    sessions.push(sessionManager);
    const handle = await startLocalSocketTransport({ sessions: sessionManager, socketPath });
    handles.push(handle);

    const client = new Client({ name: 'retry', version: '0' }, { capabilities: {} });
    clients.push(client);
    await client.connect(transport); // calls start() again → must reconnect, not short-circuit
    const result = await client.listTools();

    expect(result.tools).toHaveLength(8);
  });

  // Cross-platform: Unix domain sockets aren't supported on Windows (a named-pipe
  // transport is a follow-up). Assert the win32 branch fails fast with a clear
  // message rather than an opaque ENOENT/EINVAL later. (Windows branch, covered
  // here via a mocked platform since CI has no windows-latest runner.)
  it('throws a clear error on Windows (win32 has no Unix-socket transport)', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    try {
      const { dir, socketPath } = await makeSocketPath();
      dirs.push(dir);
      await expect(
        startLocalSocketTransport({ sessions: new SessionManager(), socketPath }),
      ).rejects.toThrow(/not supported on Windows/i);
    } finally {
      platformSpy.mockRestore();
    }
  });

});
