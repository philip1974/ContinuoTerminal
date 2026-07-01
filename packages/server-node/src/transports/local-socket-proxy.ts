import { connect } from 'node:net';
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

  let closed = false;
  const teardown = (): void => {
    if (closed) return;
    closed = true;
    stdin.unpipe(socket);
    socket.unpipe(stdout);
    if (!socket.destroyed) socket.destroy();
  };

  // Runtime error handler for the bridging phase. The connect-phase listener
  // above is removed on 'connect', so without this a mid-stream socket error
  // (ECONNRESET / EPIPE on server restart, crash, or disconnect — routine for
  // a stdio↔socket bridge) would be an unhandled 'error' event and crash the
  // proxy process. Tear the bridge down instead, leaving shutdown() a clean
  // idempotent no-op.
  socket.on('error', teardown);

  stdin.pipe(socket);
  socket.pipe(stdout);

  return {
    shutdown: async () => {
      teardown();
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
