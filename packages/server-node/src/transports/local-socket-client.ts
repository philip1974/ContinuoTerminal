import { connect, type Socket } from 'node:net';

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

  constructor(private readonly socketPath: string) {}

  async start(): Promise<void> {
    if (this.socket) return;
    const socket = connect(this.socketPath);
    this.socket = socket;
    socket.on('data', this.handleData);
    socket.on('error', this.handleError);
    socket.once('close', this.handleClose);
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
        reject(err);
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
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
    const result = splitLines(this.buffer, chunk);
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
