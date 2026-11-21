import { spawn, type ChildProcess, type ChildProcessByStdio } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';

export type BootstrapServerInput = {
  binPath?: string;
};

export type ComposeAgentEnvInput = {
  subject: string;
  scope: string;
  workspaceRoot?: string;
  binPath: string;
};

export type CleanupAllInput = {
  children: Array<ChildProcess | null | undefined>;
};

type PrimaryChild = ChildProcessByStdio<null, Readable, Readable>;

export function bootstrapServer({ binPath }: BootstrapServerInput = {}): string {
  if (binPath) return binPath;
  const require = createRequire(import.meta.url);
  return path.resolve(path.dirname(require.resolve('@continuo-terminal/server-node')), 'bin.mjs');
}

export function composeAgentEnv({
  subject,
  scope,
  workspaceRoot = process.cwd(),
  binPath,
}: ComposeAgentEnvInput): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MCP_BIN_PATH: binPath,
    MCP_SUBJECT: subject,
    MCP_SCOPE: scope,
    MCP_WORKSPACE_ROOT: workspaceRoot,
    MCP_TOKEN_PLACEHOLDER: 'stdio-demo-no-auth',
  };
}

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

async function main(): Promise<void> {
  console.log('[host] starting');
  const binPath = bootstrapServer({});
  const children: ChildProcess[] = [];

  try {
    console.log('[host] server bin resolved, spawning primary-agent');
    const primary = spawn('tsx', ['src/primary-agent.ts'], {
      cwd: new URL('..', import.meta.url),
      env: composeAgentEnv({
        subject: 'primary-agent',
        scope: 'demo',
        workspaceRoot: process.cwd(),
        binPath,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(primary);

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

    await waitForReady(primary, 'connected', 10_000);
    const exitCode = await new Promise<number | null>((resolve) => {
      primary.once('exit', (code) => resolve(code));
    });
    console.log(`[host] primary-agent exited:${exitCode ?? 'null'}`);
    if (exitCode !== 0) {
      process.exitCode = exitCode ?? 1;
      return;
    }
    console.log('[host] demo complete');
  } finally {
    await cleanupAll({ children });
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
