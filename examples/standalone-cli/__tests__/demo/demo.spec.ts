import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../src/cli.ts');

describe('standalone-cli demo command', { timeout: 60_000 }, () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    if (child && !child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    child = null;
  });

  // Skip on CI: spawns `tsx` (not on GH Actions PATH) which then spawns node-pty
  // PTY — same posix_spawnp/sandbox issue as integration-real.spec.ts.
  // See ADR-017 pattern #5.
  it.skipIf(process.env.CI === 'true')('prints demo markers and exits 0', async () => {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      child = spawn('tsx', [cliPath, 'demo'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout!.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr!.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('session_id=');
    expect(result.stdout).toContain('session_pid=');
    expect(result.stdout).toContain('captured:');
    expect(result.stdout).toContain('demo: SUCCESS');
  });
});
