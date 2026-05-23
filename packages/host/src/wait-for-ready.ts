import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export type ReadyChild = ChildProcessByStdio<null, Readable, Readable>;

export function waitForReady(child: ReadyChild, marker: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = '';
    const timer = setTimeout(() => {
      finish(new Error(`Timed out waiting for marker: ${marker}`));
    }, timeoutMs);

    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      if (err) reject(err);
      else resolve();
    };

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      if (buffer.includes(marker)) finish();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(new Error(`Child exited before marker ${marker}: code=${code ?? 'null'} signal=${signal ?? 'null'}`));
    };

    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}
