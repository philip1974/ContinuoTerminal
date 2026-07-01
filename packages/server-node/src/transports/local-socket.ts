import { Buffer } from 'node:buffer';
import { chmod, lstat, mkdir, stat, unlink } from 'node:fs/promises';
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { StringDecoder } from 'node:string_decoder';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { deserializeMessage, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import type { AuthContext, AuthenticateRequest, AuthorizeToolCall } from '../auth-hooks.js';
import { createTerminalMcpServer } from '../server.js';
import type { SessionManager } from '../session-manager.js';

export const MAX_UNIX_SOCKET_PATH_LENGTH = 100;

export type SplitLinesResult = {
  readonly buffer: string;
  readonly lines: readonly string[];
};

/**
 * 纯文本按行(`\n`)分割,保留最后的不完整行到返回的 `buffer` 供下次拼接。
 * `chunk` 必须是【已解码】的字符串:不要在这里 `Buffer.toString()` 逐块解码,否则
 * 一个多字节 UTF-8 字符被 socket 分包切开时会被解成 `�` 且无法恢复。解码状态必须
 * 跨 chunk 保留,由调用方用 `StringDecoder('utf8')` 承担(见两个 transport 的 handleData)。
 */
export function splitLines(buffer: string, chunk: string): SplitLinesResult {
  const combined = buffer + chunk;
  const parts = combined.split('\n');
  const tail = parts.pop() ?? '';
  return { buffer: tail, lines: parts.map((line) => line.replace(/\r$/, '')) };
}

export type StartLocalSocketTransportInput = {
  sessions: SessionManager;
  socketPath: string;
  authenticateRequest?: AuthenticateRequest;
  authorizeToolCall?: AuthorizeToolCall;
};

export type StartedLocalSocketTransport = {
  socketPath: string;
  shutdown: () => Promise<void>;
};

async function writeWithBackpressure(socket: Socket, payload: string): Promise<void> {
  if (socket.destroyed) throw new Error('local socket is closed');
  if (socket.write(payload)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      socket.off('drain', onDrain);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onDrain = (): void => {
      cleanup();
      resolve();
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('local socket closed before drain'));
    };
    socket.once('drain', onDrain);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

export class ServerSocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;

  private buffer = '';
  private closed = false;
  private started = false;
  // 跨 data 事件保留不完整的多字节 UTF-8 序列,避免逐 chunk 解码损坏字符。
  private readonly decoder = new StringDecoder('utf8');

  constructor(private readonly socket: Socket) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.socket.on('data', this.handleData);
    this.socket.once('close', this.handleClose);
    this.socket.on('error', this.handleError);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await writeWithBackpressure(this.socket, serializeMessage(message));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.socket.off('data', this.handleData);
    this.socket.off('error', this.handleError);
    if (!this.socket.destroyed) this.socket.destroy();
    this.onclose?.();
  }

  private readonly handleData = (chunk: Buffer): void => {
    const result = splitLines(this.buffer, this.decoder.write(chunk));
    this.buffer = result.buffer;
    for (const line of result.lines) {
      if (line.length === 0) continue;
      try {
        this.onmessage?.(deserializeMessage(line));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.onerror?.(error);
        void this.close();
        return;
      }
    }
  };

  private readonly handleClose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.socket.off('data', this.handleData);
    this.socket.off('error', this.handleError);
    this.onclose?.();
  };

  private readonly handleError = (err: Error): void => {
    this.onerror?.(err);
  };
}

async function prepareSocketPath(socketPath: string): Promise<void> {
  if (process.platform === 'win32') {
    throw new Error('Local socket transport is not supported on Windows; use named-pipe follow-up transport.');
  }
  // The OS sun_path limit is in BYTES, not JS string length (UTF-16 units), so
  // a non-ASCII path (e.g. a CJK username / temp dir) could pass a .length check
  // yet blow the real limit → an opaque `listen EINVAL` instead of this clear
  // error. Measure UTF-8 bytes.
  const socketPathBytes = Buffer.byteLength(socketPath, 'utf8');
  if (socketPathBytes > MAX_UNIX_SOCKET_PATH_LENGTH) {
    throw new RangeError(
      `Local socket path exceeds ${MAX_UNIX_SOCKET_PATH_LENGTH} bytes (${socketPathBytes}): ${socketPath}`,
    );
  }

  const parentDir = path.dirname(socketPath);
  await mkdir(parentDir, { recursive: true, mode: 0o700 });
  const parentStat = await stat(parentDir);
  if ((parentStat.mode & 0o077) !== 0) {
    throw new Error(`Local socket parent directory must not be group/world accessible: ${parentDir}`);
  }

  try {
    const existing = await lstat(socketPath);
    if (!existing.isSocket()) {
      throw new Error(`Local socket path exists and is not a socket: ${socketPath}`);
    }
    await unlink(socketPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function listen(server: NetServer, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(socketPath);
  });
}

function closeServer(server: NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function handleConnection(
  socket: Socket,
  sessions: SessionManager,
  socketPath: string,
  authenticateRequest: AuthenticateRequest | undefined,
  authorizeToolCall: AuthorizeToolCall | undefined,
): Promise<void> {
  let auth: AuthContext | null = null;
  if (authenticateRequest) {
    auth = await authenticateRequest({
      authorizationHeader: undefined,
      method: 'CONNECT',
      url: socketPath,
    });
    if (auth === null) {
      socket.destroy();
      return;
    }
  }

  const { server } = createTerminalMcpServer({ sessions, auth, authorizeToolCall });
  const transport = new ServerSocketTransport(socket);
  let closing = false;
  const closeServerOnce = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => {});
  };
  socket.once('close', () => {
    void closeServerOnce();
  });
  await server.connect(transport);
}

export async function startLocalSocketTransport({
  sessions,
  socketPath,
  authenticateRequest,
  authorizeToolCall,
}: StartLocalSocketTransportInput): Promise<StartedLocalSocketTransport> {
  if (authorizeToolCall && !authenticateRequest) {
    throw new Error(
      '@continuo-terminal/server-node: authorizeToolCall requires authenticateRequest ' +
      'in startLocalSocketTransport (local-socket silent-bypass risk). See ADR 0006 §CT-B1.',
    );
  }

  await prepareSocketPath(socketPath);

  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
    void handleConnection(socket, sessions, socketPath, authenticateRequest, authorizeToolCall).catch(() => {
      socket.destroy();
    });
  });

  await listen(server, socketPath);
  await chmod(socketPath, 0o600);

  let shutdownStarted = false;
  return {
    socketPath,
    shutdown: async () => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      for (const socket of sockets) socket.destroy();
      await closeServer(server).catch(() => {});
      await unlink(socketPath).catch(() => {});
    },
  };
}
