import { connect, type Socket } from 'node:net';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';

export type ConnectLocalSocketStdioProxyInput = {
  socketPath: string;
  stdin?: Readable;
  stdout?: Writable;
};

export type LocalSocketStdioProxy = {
  shutdown: () => Promise<void>;
};

export async function connectLocalSocketStdioProxy({
  socketPath,
  stdin = process.stdin,
  stdout = process.stdout,
}: ConnectLocalSocketStdioProxyInput): Promise<LocalSocketStdioProxy> {
  const socket = connect(socketPath);
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

  stdin.pipe(socket);
  socket.pipe(stdout);

  let closed = false;
  return {
    shutdown: async () => {
      if (closed) return;
      closed = true;
      stdin.unpipe(socket);
      socket.unpipe(stdout);
      if (!socket.destroyed) socket.destroy();
      await new Promise<void>((resolve) => {
        if (socket.closed) {
          resolve();
          return;
        }
        socket.once('close', () => resolve());
      });
    },
  };
}
