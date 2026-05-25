import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawn, type IPty } from 'node-pty';
import { describe, expect, it } from 'vitest';

import { prepareShellIntegrationEnv } from '../../src/index.js';

function commandExists(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOutput(
  pty: IPty,
  predicate: (output: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  let output = '';
  let settled = false;
  return new Promise((resolve, reject) => {
    const disposable = pty.onData((chunk) => {
      output += chunk;
      if (!settled && predicate(output)) {
        settled = true;
        clearTimeout(timer);
        disposable.dispose();
        resolve(output);
      }
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      disposable.dispose();
      reject(new Error(`timed out waiting for PTY output: ${output}`));
    }, timeoutMs);
  });
}

function minimalBaseEnv(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    PATH: process.env.PATH ?? '/bin:/usr/bin:/usr/local/bin:/opt/homebrew/bin',
    TERM: 'xterm-256color',
  };
}

// CI runners (GH Actions macOS-latest + ubuntu-latest) skip actual-PTY tests:
// - macOS CI: posix_spawnp fails inside sandboxed runner (node-pty cannot spawn).
// - Ubuntu CI: predicate races against PTY echoing typed input back before bash
//   executes the chained sentinel command.
// Rename verification is covered by unit-level T14/T17/T17a/T18/T18a (byte-identical
// snippet + env-var key assertions);CI-side semantic equivalence preserved.
// See ADR-017 (sibling-repo migration pattern #5).
describe('shell integration env real PTY behavior', () => {
  it.skipIf(process.env.CI === 'true' || !commandExists('bash'))(
    'T25 bash exposes renamed env vars and emits OSC 7',
    async () => {
      const tempRoot = await mkdtemp(path.join(tmpdir(), 'ct-shell-env-bash-'));
      const home = process.env.HOME ?? tempRoot;
      const prepared = await prepareShellIntegrationEnv('/bin/bash', minimalBaseEnv(home));
      const rcfile = prepared.env.BASH_ENV;
      if (!rcfile) throw new Error('BASH_ENV missing');
      const pty = spawn('/bin/bash', ['--rcfile', rcfile, '-i'], {
        env: prepared.env,
        cols: 80,
        rows: 24,
      });

      try {
        await wait(500);

        const terminalHome = waitForOutput(
          pty,
          (output) => output.includes('__CT_TERMINAL_HOME_DONE__'),
          10_000,
        );
        pty.write('printf "__CT_TERMINAL_HOME=<%s>__\\n" "$_TERMINAL_USER_HOME"; echo "__CT_TERMINAL_HOME_DONE__"\r');
        expect(await terminalHome).toContain(home);

        const legacyHome = waitForOutput(
          pty,
          (output) => output.includes('__CT_LEGACY_DONE__'),
          10_000,
        );
        pty.write('printf "__CT_LEGACY_HOME=<%s>__\\n" "$_CONTINUO_USER_HOME"; echo "__CT_LEGACY_DONE__"\r');
        expect(await legacyHome).toContain('__CT_LEGACY_HOME=<>__');

        const osc7 = waitForOutput(
          pty,
          (output) => output.includes('\x1b]7;file://'),
          5_000,
        );
        pty.write('cd /tmp\r');
        expect(await osc7).toContain('\x1b]7;file://');
      } finally {
        pty.kill();
        await prepared.cleanup();
        await rm(tempRoot, { recursive: true, force: true });
      }
    },
    15_000,
  );

  it.skipIf(process.env.CI === 'true' || !commandExists('fish'))(
    'T26 fish exposes renamed env vars and emits OSC 7',
    async () => {
      const tempRoot = await mkdtemp(path.join(tmpdir(), 'ct-shell-env-fish-'));
      const home = process.env.HOME ?? tempRoot;
      const prepared = await prepareShellIntegrationEnv('fish', minimalBaseEnv(home));
      const pty = spawn('fish', ['-l', '-i'], {
        env: prepared.env,
        cols: 80,
        rows: 24,
      });

      try {
        await wait(500);

        const fishConfig = waitForOutput(
          pty,
          (output) => output.includes('__CT_FISH_CONFIG_DONE__'),
          10_000,
        );
        pty.write('printf "__CT_FISH_CONFIG=<%s>__\\n" "$_TERMINAL_USER_FISH_CONFIG"; echo "__CT_FISH_CONFIG_DONE__"\r');
        expect(await fishConfig).toContain('fish');

        const osc7 = waitForOutput(
          pty,
          (output) => output.includes('\x1b]7;file://'),
          5_000,
        );
        pty.write('cd /tmp\r');
        expect(await osc7).toContain('\x1b]7;file://');
      } finally {
        pty.kill();
        await prepared.cleanup();
        await rm(tempRoot, { recursive: true, force: true });
      }
    },
    15_000,
  );
});
