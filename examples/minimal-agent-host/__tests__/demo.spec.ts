import { spawn, type ChildProcess } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

describe('minimal-agent-host demo', { timeout: 60_000 }, () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    child = null;
  });

  it('prints lifecycle markers and exits 0', async () => {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      child = spawn('pnpm', ['--filter', '@continuo-terminal/example-minimal-agent-host', 'start'], {
        cwd: new URL('../../..', import.meta.url),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('[host] starting');
    expect(result.stdout).toContain('[host] server bin resolved, spawning primary-agent');
    expect(result.stdout).toContain('[primary] connected');
    expect(result.stdout).toContain('[primary] secondary-created:');
    expect(result.stdout).toContain('[primary] secondary-output:');
    expect(result.stdout).toContain('[host] demo complete');
  });
});
