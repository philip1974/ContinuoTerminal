import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultShell, isAllowedShell } from '../../src/index.js';

let originalShell: string | undefined;

beforeEach(() => {
  originalShell = process.env.SHELL;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalShell === undefined) {
    delete process.env.SHELL;
  } else {
    process.env.SHELL = originalShell;
  }
});

function mockPlatform(platform: NodeJS.Platform): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
}

describe('host shell policy helpers', () => {
  it('T1 allows Homebrew zsh', () => {
    expect(isAllowedShell('/opt/homebrew/bin/zsh')).toBe(true);
  });

  it('T2 allows /usr/bin/zsh', () => {
    expect(isAllowedShell('/usr/bin/zsh')).toBe(true);
  });

  it('T3 rejects shell-like names outside the allowlist prefixes', () => {
    expect(isAllowedShell('/tmp/evil-zsh')).toBe(false);
  });

  it('T4 allows PowerShell on Windows', () => {
    mockPlatform('win32');

    expect(isAllowedShell('powershell.exe')).toBe(true);
  });

  it('T5 rejects unknown executables on Windows', () => {
    mockPlatform('win32');

    expect(isAllowedShell('evil.exe')).toBe(false);
  });

  it('T6 returns allowed SHELL on Unix', () => {
    process.env.SHELL = '/bin/zsh';

    expect(getDefaultShell()).toBe('/bin/zsh');
  });

  it('T7 falls back to /bin/sh when SHELL is not allowed on Unix', () => {
    // /bin/sh 是 POSIX 必备,zsh 在多数 Linux 不存在(跨平台审计 P1)。
    process.env.SHELL = '/tmp/evil';

    expect(getDefaultShell()).toBe('/bin/sh');
  });

  it('T7b falls back to /bin/sh when SHELL is unset on Unix', () => {
    delete process.env.SHELL;

    expect(getDefaultShell()).toBe('/bin/sh');
  });

  it('T8 returns powershell.exe on Windows', () => {
    mockPlatform('win32');
    process.env.SHELL = '/bin/zsh';

    expect(getDefaultShell()).toBe('powershell.exe');
  });
});
