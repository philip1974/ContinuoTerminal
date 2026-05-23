import { spawn, type ChildProcess } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const HOST_TIMEOUT_MS = 60_000;

describe('standalone-cli-host demo', { timeout: HOST_TIMEOUT_MS + 5_000 }, () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    child = null;
  });

  it('runs an HTTP authenticated host demo without logging auth material', async () => {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      child = spawn('pnpm', ['--filter', '@continuo-terminal/example-standalone-cli-host', 'start'], {
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
    expect(result.stdout).toContain('[host] http listening on http://127.0.0.1:');
    expect(result.stdout).toContain('[primary] connected');
    expect(result.stdout).toContain('[primary] secondary-output:');
    expect(result.stdout).toContain('from-cli-host');
    expect(result.stdout).toContain('[host] demo complete');
    expect(result.stdout).not.toContain('MCP_TOKEN');
    expect(result.stdout).not.toContain('Authorization');
    expect(result.stderr).not.toContain('MCP_TOKEN');
    expect(result.stderr).not.toContain('Authorization');
  });
});
