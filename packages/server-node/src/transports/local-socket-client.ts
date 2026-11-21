import { connect, type Socket } from 'node:net';
import { StringDecoder } from 'node:string_decoder';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { deserializeMessage, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { splitLines } from './local-socket.js';

export class LocalSocketClientTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;

  private buffer = '';
  private closed = false;
  private socket: Socket | null = null;
  // 跨 data 事件保留不完整的多字节 UTF-8 序列,避免逐 chunk 解码损坏字符。
  private readonly decoder = new StringDecoder('utf8');

  constructor(private readonly socketPath: string) {}

  async start(): Promise<void> {
    if (this.socket) return;
    const socket = connect(this.socketPath);
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        socket.off('connect', onConnect);
        socket.off('error', onError);
      };
      const onConnect = (): void => {
        cleanup();
        resolve();
      };
      const onError = (err: Error): void => {
        cleanup();
        // Destroy the half-open socket and DON'T retain it, so a later start()
        // on the same transport can reconnect (e.g. after a startup race where
        // the server/sidecar wasn't listening yet). Retaining a failed socket
        // made the `if (this.socket) return` guard short-circuit the retry,
        // then send() failed with "local socket client is closed".
        socket.destroy();
        reject(err);
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
    // Adopt the socket + wire persistent handlers only after a successful
    // connect, so a failed attempt leaves this.socket null (retryable).
    this.socket = socket;
    socket.on('data', this.handleData);
    socket.on('error', this.handleError);
    socket.once('close', this.handleClose);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed) throw new Error('local socket client is closed');
    const payload = serializeMessage(message);
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
        reject(new Error('local socket client closed before drain'));
      };
      socket.once('drain', onDrain);
      socket.once('error', onError);
      socket.once('close', onClose);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const socket = this.socket;
    if (socket && !socket.destroyed) socket.destroy();
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
        this.onerror?.(err instanceof Error ? err : new Error(String(err)));
        void this.close();
        return;
      }
    }
  };

  private readonly handleError = (err: Error): void => {
    this.onerror?.(err);
  };

  private readonly handleClose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  };
}
