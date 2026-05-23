import { spawn, type ChildProcess, type ChildProcessByStdio } from 'node:child_process';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import { bootstrapAgentHost, type AgentHost } from '@continuo-terminal/host';

type PrimaryChild = ChildProcessByStdio<null, Readable, Readable>;

export type CleanupAllInput = {
  children: Array<ChildProcess | null | undefined>;
};

export function waitForReady(
  child: PrimaryChild,
  marker: string,
  timeoutMs: number,
): Promise<void> {
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

export async function cleanupAll({ children }: CleanupAllInput): Promise<void> {
  for (const child of [...children].reverse()) {
    if (!child || child.killed || child.exitCode !== null) continue;
    child.kill('SIGTERM');
  }

  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (!child || child.exitCode !== null) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
            resolve();
          }, 500);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => {
    child.once('exit', (code) => resolve(code));
  });
}

async function disposeHost(host: AgentHost | undefined): Promise<void> {
  if (!host) return;
  let timedOut = false;
  await Promise.race([
    host.dispose(),
    sleep(1000).then(() => {
      timedOut = true;
    }),
  ]);
  if (timedOut) process.exit(process.exitCode ?? 0);
}

async function main(): Promise<void> {
  console.log('[host] starting standalone-cli-host');
  let host: AgentHost | undefined;
  const children: ChildProcess[] = [];

  try {
    host = await bootstrapAgentHost({
      transport: { kind: 'http', host: '127.0.0.1', port: 0 },
      auth: {
        tokenTtlMs: 5 * 60 * 1000,
        authorizeToolCall: ({ auth }) => (
          auth?.scope === 'demo'
            ? { allow: true }
            : { allow: false, reason: 'scope denied' }
        ),
      },
    });
    console.log(`[host] http listening on ${host.transportInfo.endpoint}`);

    const agentEnv = host.createAgentEnv({
      subject: 'standalone-cli-primary',
      scope: 'demo',
      workspaceRoot: process.cwd(),
      metadata: { role: 'primary' },
    });
    const primary = spawn('tsx', ['src/primary-agent.ts'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...agentEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(primary);
    const primaryExit = waitForExit(primary);

    primary.stdout.setEncoding('utf8');
    primary.stdout.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.length > 0) console.log(`[primary] ${line}`);
      }
    });
    primary.stderr.setEncoding('utf8');
    primary.stderr.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.length > 0) process.stderr.write(`[primary:stderr] ${line}\n`);
      }
    });

    await waitForReady(primary, 'connected', 60_000);
    const exitCode = await primaryExit;
    console.log(`[host] primary-agent exited:${exitCode ?? 'null'}`);
    if (exitCode !== 0) {
      process.exitCode = exitCode ?? 1;
      return;
    }
    console.log('[host] demo complete');
  } finally {
    await cleanupAll({ children });
    await sleep(100);
    await disposeHost(host);
  }
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
}).catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
