import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted: mock factories run before any import.
const ptyMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node-pty', () => ({
  spawn: ptyMocks.spawn.mockImplementation(() => ({
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    kill: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
    pid: 4242,
  })),
}));

import { SessionManager } from '../../src/session-manager.js';

let originalShell: string | undefined;

beforeEach(() => {
  ptyMocks.spawn.mockClear();
  originalShell = process.env.SHELL;
});

afterEach(() => {
  if (originalShell === undefined) delete process.env.SHELL;
  else process.env.SHELL = originalShell;
});

describe('SessionManager.create — 默认 shell 经 getDefaultShell()', () => {
  // 旧实现 `input.shell ?? process.env.SHELL ?? '/bin/zsh'` 直接用 raw $SHELL,
  // 且 Windows 无 $SHELL 时 fallback 到字面量 /bin/zsh(spawn 崩)。改为接 getDefaultShell()。

  it('input.shell 显式传入时优先,不走默认', async () => {
    const sm = new SessionManager();
    await sm.create({ shell: '/bin/bash', cwd: '/tmp' });
    expect(ptyMocks.spawn).toHaveBeenCalledWith(
      '/bin/bash',
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('未传 shell 时不直接用未校验的 $SHELL(不在白名单的 $SHELL 被回退)', async () => {
    // 非 win 平台下:getDefaultShell 校验 $SHELL,不在 allowlist → 回退默认。
    if (process.platform === 'win32') return; // win 由 host-shell-policy.spec 覆盖
    process.env.SHELL = '/tmp/evil';
    const sm = new SessionManager();
    await sm.create({ cwd: '/tmp' });
    const calledShell = ptyMocks.spawn.mock.calls[0]?.[0];
    expect(calledShell).not.toBe('/tmp/evil');
  });
});
